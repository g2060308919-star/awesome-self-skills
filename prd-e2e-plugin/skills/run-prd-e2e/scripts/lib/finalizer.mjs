import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { atomicWriteText } from "./atomic-json.mjs";
import { canonicalJsonBytes, canonicalStringify, sha256Text } from "./digest.mjs";
import { fail, requireCondition } from "./errors.mjs";
import { validateNoExecutionHandoff } from "./generator-contract.mjs";
import { assertNoSecrets } from "./secrets.mjs";

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function rawSha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function readRegular(filePath, label) {
  const stat = await lstat(filePath).catch(() => fail("RUN_INTEGRITY", `${label} is missing.`));
  requireCondition(stat.isFile() && !stat.isSymbolicLink(), "RUN_INTEGRITY", `${label} is unsafe.`);
  return readFile(filePath);
}

function validateCounts(counts, caseCount) {
  const names = ["passed", "failed", "undetermined", "not_executed"];
  requireCondition(counts && Object.keys(counts).length === names.length && names.every(name => Number.isSafeInteger(counts[name]) && counts[name] >= 0), "RUN_INTEGRITY", "Runner counts are invalid.");
  requireCondition(names.reduce((sum, name) => sum + counts[name], 0) === caseCount, "RUN_INTEGRITY", "Runner counts do not cover every input Case.");
}

function buildTrace(runnerSnapshot, executionLog) {
  const logCases = new Map((executionLog.cases ?? []).map(item => [item.case_id, item]));
  requireCondition(logCases.size === runnerSnapshot.cases.length, "RUN_INTEGRITY", "Runner log Case coverage differs from its snapshot.");
  return runnerSnapshot.cases.map(testCase => {
    const loggedCase = logCases.get(testCase.case_id);
    requireCondition(Boolean(loggedCase), "RUN_INTEGRITY", `Runner log is missing Case ${testCase.case_id}.`);
    const checkpoints = new Map((loggedCase.checkpoints ?? []).map(item => [`${item.step_id}/${item.oracle_id}`, item]));
    const steps = testCase.steps.map(step => ({
      step_id: step.step_id,
      oracles: step.expected.map(oracle => {
        const checkpoint = checkpoints.get(`${step.step_id}/${oracle.oracle_id}`);
        requireCondition(Boolean(checkpoint), "RUN_INTEGRITY", `Runner log is missing checkpoint ${testCase.case_id}/${step.step_id}/${oracle.oracle_id}.`);
        return {
          oracle_id: oracle.oracle_id,
          checkpoint_id: `${testCase.case_id}/${step.step_id}/${oracle.oracle_id}`,
          status: checkpoint.status,
          result: checkpoint.result,
          reason: checkpoint.reason,
          evidence_status: checkpoint.evidence_status,
          evidence_refs: structuredClone(checkpoint.evidence_refs ?? [])
        };
      })
    }));
    return { case_id: testCase.case_id, result: loggedCase.result, steps };
  });
}

export async function finalizeExecuted(input) {
  requireCondition(typeof input.runnerRunRef?.run_root === "string" && path.isAbsolute(input.runnerRunRef.run_root) && input.runnerRunRef?.run_id, "RUN_INTEGRITY", "Runner Run reference is invalid.");
  const runnerRoot = path.resolve(input.runnerRunRef.run_root);
  const rootStat = await lstat(runnerRoot).catch(() => fail("RUN_INTEGRITY", "Runner Run root is missing."));
  requireCondition(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "RUN_INTEGRITY", "Runner Run root is unsafe.");
  requireCondition(await realpath(runnerRoot) === runnerRoot, "RUN_INTEGRITY", "Runner Run root must use its canonical path.");
  requireCondition(typeof input.runnerRunValidator === "function", "RUN_INTEGRITY", "The bundled Runner Run validator is required.");
  let runnerValidation;
  try {
    runnerValidation = await input.runnerRunValidator(runnerRoot);
  } catch {
    fail("RUN_INTEGRITY", "The bundled Runner rejected its Run artifacts or report.");
  }
  requireCondition(
    runnerValidation?.valid === true
      && runnerValidation.runId === input.runnerRunRef.run_id
      && path.resolve(runnerValidation.runRoot) === runnerRoot
      && runnerValidation.snapshotHash === input.reportResult?.snapshotHash
      && runnerValidation.eventCount === input.reportResult?.eventCount,
    "RUN_INTEGRITY",
    "Bundled Runner validation does not match the reported boundary."
  );
  requireCondition(typeof input.reportResult?.chatTableMarkdown === "string" && input.reportResult.chatTableMarkdown.trim(), "RUN_INTEGRITY", "Runner report did not return the required complete chat table.");

  const snapshotPath = path.join(runnerRoot, "test-cases.json");
  const logPath = path.join(runnerRoot, "execution-log.json");
  const [snapshotBytes, logBytes] = await Promise.all([
    readRegular(snapshotPath, "Runner case snapshot"),
    readRegular(logPath, "Runner execution log")
  ]);
  let runnerSnapshot;
  let executionLog;
  try {
    runnerSnapshot = JSON.parse(snapshotBytes);
    executionLog = JSON.parse(logBytes);
  } catch {
    fail("RUN_INTEGRITY", "Runner artifacts are not valid JSON.");
  }
  const snapshotHash = rawSha256(snapshotBytes);
  requireCondition(snapshotHash === executionLog.test_cases?.sha256 && snapshotHash === input.reportResult?.snapshotHash, "RUN_INTEGRITY", "Runner snapshot boundary does not match the ledger and report.");
  requireCondition(executionLog.run?.run_id === input.runnerRunRef.run_id && input.reportResult?.runId === input.runnerRunRef.run_id, "RUN_INTEGRITY", "Runner Run identity is inconsistent.");
  requireCondition(same(runnerSnapshot, input.runnerInput), "RUN_INTEGRITY", "Runner snapshot differs from the compiled input.");

  const reportPath = path.resolve(input.reportResult?.reportPath ?? "");
  const htmlReportPath = path.resolve(input.reportResult?.htmlReportPath ?? "");
  const expectedReportPath = path.join(runnerRoot, "report.html");
  requireCondition(reportPath === htmlReportPath && reportPath === expectedReportPath && input.reportResult?.reportFormat === "html-only-v1", "RUN_INTEGRITY", "Runner report paths do not identify the unique report.html.");
  await readRegular(reportPath, "Runner HTML report");
  const canonicalRunnerRoot = await realpath(runnerRoot);
  const canonicalReport = await realpath(reportPath);
  requireCondition(canonicalReport === path.join(canonicalRunnerRoot, "report.html"), "RUN_INTEGRITY", "Runner report escapes its Run root.");

  requireCondition(input.reportResult.eventCount === executionLog.events?.length, "RUN_INTEGRITY", "Runner event count is inconsistent.");
  requireCondition(input.reportResult.lastSequence === (executionLog.events?.at(-1)?.sequence ?? 0), "RUN_INTEGRITY", "Runner last sequence is inconsistent.");
  requireCondition(same(runnerSnapshot.suite?.lineage?.case_document_ref, input.generationRef?.case_document_ref), "RUNNER_LINEAGE_MISMATCH", "Runner Case Document lineage is inconsistent.");
  requireCondition(runnerSnapshot.suite?.lineage?.case_ids_digest === input.executionPlan?.runner_projection?.case_ids_digest, "RUNNER_LINEAGE_MISMATCH", "Runner projected Case digest is inconsistent.");
  requireCondition(same(runnerSnapshot.cases.map(item => item.case_id), input.executionPlan.runner_projection.case_ids), "RUNNER_LINEAGE_MISMATCH", "Runner Case order differs from the Execution Plan projection.");
  validateCounts(input.reportResult.counts, runnerSnapshot.cases.length);

  const value = {
    schema_version: "1.0",
    outer_run_id: input.outerRunId,
    completion_kind: "executed",
    prd_sources: structuredClone(input.request.prd_sources),
    case_document: {
      ref: structuredClone(input.generationRef.case_document_ref),
      manifest_sha256: input.generationRef.manifest_sha256 ?? input.generationRef.case_document_ref.manifest_digest,
      bundle_sha256: input.generationRef.bundle_sha256 ?? input.generationRef.case_document_ref.bundle_digest
    },
    execution_plan: {
      ref: structuredClone(input.executionPlanRef),
      selected_case_ids: structuredClone(input.executionPlan.runner_projection.case_ids)
    },
    runner: {
      run_id: input.runnerRunRef.run_id,
      run_root: input.runnerRunRef.run_root,
      counts: structuredClone(input.reportResult.counts),
      report_path: input.reportResult.reportPath,
      snapshot_hash: snapshotHash,
      event_count: input.reportResult.eventCount,
      last_sequence: input.reportResult.lastSequence
    },
    traceability: buildTrace(runnerSnapshot, executionLog)
  };
  assertNoSecrets(value);
  const text = canonicalJsonBytes(value);
  return { value, text, sha256: sha256Text(text) };
}

export function finalizeNoExecution(input) {
  validateNoExecutionHandoff(input);
  const plan = input.executionPlan;
  requireCondition(plan?.status === "finished" && plan.result_kind === "no_execution_selected" && plan.runner_ready === false, "RUN_INTEGRITY", "Execution Plan is not a completed no-execution result.");
  requireCondition(Array.isArray(plan.runner_projection?.case_ids) && plan.runner_projection.case_ids.length === 0, "RUN_INTEGRITY", "No-execution projection must be empty.");
  requireCondition(same(plan.case_document_ref, input.generationRef?.case_document_ref), "HANDOFF_REF_MISMATCH", "No-execution plan references another Case Document.");
  const value = {
    schema_version: "1.0",
    outer_run_id: input.outerRunId,
    completion_kind: "no_execution_selected",
    prd_sources: structuredClone(input.request.prd_sources),
    case_document: { ref: structuredClone(input.generationRef.case_document_ref) },
    execution_plan: { ref: structuredClone(input.executionPlanRef), selected_case_ids: [] },
    runner: null,
    reason: "The confirmed Execution Plan selected no Cases for execution."
  };
  assertNoSecrets(value);
  const text = canonicalJsonBytes(value);
  return { value, text, sha256: sha256Text(text) };
}

export async function writeFinalIndex(runRoot, result) {
  const root = path.resolve(runRoot);
  const stat = await lstat(root).catch(() => fail("RUN_INTEGRITY", "Outer Run root is missing."));
  requireCondition(stat.isDirectory() && !stat.isSymbolicLink(), "RUN_INTEGRITY", "Outer Run root is unsafe.");
  requireCondition(await realpath(root) === root, "RUN_INTEGRITY", "Outer Run root must use its canonical path.");
  requireCondition(result?.text === canonicalJsonBytes(result.value) && result.sha256 === sha256Text(result.text), "RUN_INTEGRITY", "Final index result is inconsistent.");
  const outputPath = path.join(root, "final-index.json");
  await atomicWriteText(outputPath, result.text);
  return { path: outputPath, sha256: result.sha256 };
}
