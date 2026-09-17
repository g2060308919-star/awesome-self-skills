import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { finalizeExecuted, finalizeNoExecution, writeFinalIndex } from "../scripts/lib/finalizer.mjs";
import { validateFinalizerBindings } from "../scripts/lib/handoff-paths.mjs";

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalBytes(value) {
  return `${canonical(value)}\n`;
}

function prefixedDigest(bytes) {
  return `sha256:${hash(bytes)}`;
}

async function fixture() {
  const runnerRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "prd-e2e-finalizer-runner-")));
  const caseDocumentRef = {
    run_id: "CASE-RUN",
    revision: 3,
    manifest_digest: `sha256:${"1".repeat(64)}`,
    bundle_digest: `sha256:${"2".repeat(64)}`
  };
  const runnerSnapshot = {
    schema_version: "2.0",
    suite: {
      name: "Acceptance",
      target_urls: ["https://example.invalid"],
      lineage: { case_document_ref: caseDocumentRef, case_ids_digest: `sha256:${"3".repeat(64)}` }
    },
    cases: [{
      case_id: "CASE-1",
      module: "Module",
      title: "Case",
      preconditions: [],
      steps: [{
        step_id: "STEP-1",
        action: "Do it",
        expected: [{ oracle_id: "ORACLE-1", text: "Expected", surface: "ui", claim_ids: ["CLAIM-1"] }]
      }]
    }]
  };
  const snapshotText = `${JSON.stringify(runnerSnapshot, null, 2)}\n`;
  const snapshotHash = hash(snapshotText);
  const executionLog = {
    schema_version: "2.0",
    run: { run_id: "RUNNER-1", status: "completed" },
    test_cases: { path: "./test-cases.json", sha256: snapshotHash },
    cases: [{
      case_id: "CASE-1",
      result: "passed",
      checkpoints: [{
        step_id: "STEP-1",
        oracle_id: "ORACLE-1",
        status: "completed",
        result: "passed",
        reason: "Matched exactly",
        evidence_refs: ["EVIDENCE-1"],
        evidence_status: "complete"
      }]
    }],
    events: [
      { type: "workflow_profile", sequence: 1 },
      { type: "checkpoint", sequence: 2 }
    ],
    cleanup: { attempted: true, completed: true, items: [] }
  };
  const reportPath = path.join(runnerRoot, "report.html");
  await writeFile(path.join(runnerRoot, "test-cases.json"), snapshotText);
  await writeFile(path.join(runnerRoot, "execution-log.json"), `${JSON.stringify(executionLog, null, 2)}\n`);
  await writeFile(reportPath, "<!doctype html><title>Runner report</title>");
  return {
    outerRunId: "OUTER-1",
    request: { prd_sources: ["docs/prd.md"] },
    generationRef: { case_document_ref: caseDocumentRef, manifest_sha256: caseDocumentRef.manifest_digest, bundle_sha256: caseDocumentRef.bundle_digest },
    executionPlanRef: { run_id: "PLAN-RUN", manifest_path: "/plan/output/current.json", artifact_path: "/plan/output/execution-plan.json" },
    executionPlan: { runner_projection: { case_ids: ["CASE-1"], case_ids_digest: runnerSnapshot.suite.lineage.case_ids_digest } },
    runnerInput: structuredClone(runnerSnapshot),
    runnerRunRef: { run_id: "RUNNER-1", run_root: runnerRoot },
    reportResult: {
      reportFormat: "html-only-v1",
      reportPath,
      htmlReportPath: reportPath,
      chatTableMarkdown: "| ID | Module | Result |",
      snapshotHash,
      eventCount: 2,
      lastSequence: 2,
      counts: { passed: 1, failed: 0, undetermined: 0, not_executed: 0 },
      runId: "RUNNER-1"
    }
  };
}

test("executed final index preserves Runner counts and ordered Case/Step/Oracle trace without persisting chat markdown", async () => {
  const input = await fixture();
  let validatorCalls = 0;
  input.runnerRunValidator = async runRoot => {
    validatorCalls += 1;
    assert.equal(runRoot, input.runnerRunRef.run_root);
    return { valid: true, runId: "RUNNER-1", runRoot, snapshotHash: input.reportResult.snapshotHash, eventCount: 2 };
  };
  const result = await finalizeExecuted(input);
  assert.equal(validatorCalls, 1);
  assert.equal(result.value.completion_kind, "executed");
  assert.deepEqual(result.value.runner.counts, input.reportResult.counts);
  assert.equal(result.value.runner.report_path, input.reportResult.reportPath);
  assert.deepEqual(result.value.traceability.map(item => item.case_id), ["CASE-1"]);
  assert.equal(result.value.traceability[0].steps[0].oracles[0].checkpoint_id, "CASE-1/STEP-1/ORACLE-1");
  assert.equal(JSON.stringify(result.value).includes("chatTableMarkdown"), false);
});

test("executed finalizer rejects snapshot, report boundary, and lineage mismatches", async () => {
  const tampered = await fixture();
  tampered.runnerRunValidator = async () => { throw new Error("Runner validation failed"); };
  await assert.rejects(() => finalizeExecuted(tampered), error => error.code === "RUN_INTEGRITY");

  const snapshotTampered = await fixture();
  snapshotTampered.runnerRunValidator = async () => ({
    valid: true,
    runId: "RUNNER-1",
    runRoot: snapshotTampered.runnerRunRef.run_root,
    snapshotHash: snapshotTampered.reportResult.snapshotHash,
    eventCount: 2
  });
  await writeFile(path.join(snapshotTampered.runnerRunRef.run_root, "test-cases.json"), "{}\n");
  await assert.rejects(() => finalizeExecuted(snapshotTampered), error => error.code === "RUN_INTEGRITY");

  const pathMismatch = await fixture();
  pathMismatch.runnerRunValidator = async () => ({
    valid: true,
    runId: "RUNNER-1",
    runRoot: pathMismatch.runnerRunRef.run_root,
    snapshotHash: pathMismatch.reportResult.snapshotHash,
    eventCount: 2
  });
  pathMismatch.reportResult.reportPath = path.join(pathMismatch.runnerRunRef.run_root, "other.html");
  await assert.rejects(() => finalizeExecuted(pathMismatch), error => error.code === "RUN_INTEGRITY");

  const lineageMismatch = await fixture();
  lineageMismatch.runnerRunValidator = async () => ({
    valid: true,
    runId: "RUNNER-1",
    runRoot: lineageMismatch.runnerRunRef.run_root,
    snapshotHash: lineageMismatch.reportResult.snapshotHash,
    eventCount: 2
  });
  lineageMismatch.generationRef.case_document_ref.run_id = "OTHER";
  await assert.rejects(() => finalizeExecuted(lineageMismatch), error => error.code === "RUNNER_LINEAGE_MISMATCH");

  const symlinkedRoot = await fixture();
  const linkedRoot = `${symlinkedRoot.runnerRunRef.run_root}-link`;
  await symlink(symlinkedRoot.runnerRunRef.run_root, linkedRoot);
  symlinkedRoot.runnerRunRef.run_root = linkedRoot;
  symlinkedRoot.reportResult.reportPath = path.join(linkedRoot, "report.html");
  symlinkedRoot.reportResult.htmlReportPath = symlinkedRoot.reportResult.reportPath;
  symlinkedRoot.runnerRunValidator = async runRoot => ({
    valid: true,
    runId: "RUNNER-1",
    runRoot,
    snapshotHash: symlinkedRoot.reportResult.snapshotHash,
    eventCount: 2
  });
  await assert.rejects(() => finalizeExecuted(symlinkedRoot), error => error.code === "RUN_INTEGRITY");
});

test("no-execution final index has null Runner fields and must be written before completion", async () => {
  const caseDocumentRef = {
    run_id: "CASE-RUN",
    revision: 1,
    manifest_digest: `sha256:${"1".repeat(64)}`,
    bundle_digest: `sha256:${"2".repeat(64)}`
  };
  const executionPlan = {
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "execution_plan",
    status: "finished",
    result_kind: "no_execution_selected",
    case_document_ref: structuredClone(caseDocumentRef),
    items: [{ case_id: "CASE-1", semantic_status: "Grounded", disposition: "do_not_execute", ready: false }],
    runner_ready: false,
    runner_projection: { case_ids: [], case_ids_digest: prefixedDigest(canonical([])) }
  };
  const executionPlanBytes = canonicalBytes(executionPlan);
  const executionPlanManifest = {
    run_id: "PLAN-RUN",
    revision: 2,
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "execution_plan",
    authority: "canonical",
    result_kind: "no_execution_selected",
    completed_at: "2026-09-17T00:00:00.000Z",
    case_document_ref: structuredClone(caseDocumentRef),
    execution_plan_artifact: { path: "output/revision-000002/execution-plan.json", digest: prefixedDigest(executionPlanBytes) },
    runner_projection: structuredClone(executionPlan.runner_projection),
    runner_ready: false
  };
  const input = {
    outerRunId: "OUTER-1",
    request: { prd_sources: ["docs/prd.md"] },
    generationRef: { case_document_ref: caseDocumentRef },
    executionPlanRef: { run_id: "PLAN-RUN" },
    executionPlanManifest,
    executionPlanManifestBytes: canonicalBytes(executionPlanManifest),
    executionPlan,
    executionPlanBytes
  };
  const caseDocument = {
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "case_document",
    source_revision: 1,
    result_kind: "delivered_cases",
    ordered_case_ids: ["CASE-1"],
    cases: [{ case_id: "CASE-1" }]
  };
  const caseDocumentBytes = canonicalBytes(caseDocument);
  const caseDocumentManifest = {
    run_id: "CASE-RUN",
    revision: 1,
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "case_document",
    authority: "canonical",
    result_kind: "delivered_cases",
    bundle: { path: "output/revision-000001/test-bundle.json", digest: prefixedDigest(caseDocumentBytes) }
  };
  const caseDocumentManifestBytes = canonicalBytes(caseDocumentManifest);
  input.caseDocument = caseDocument;
  input.caseDocumentBytes = caseDocumentBytes;
  input.caseDocumentManifest = caseDocumentManifest;
  input.caseDocumentManifestBytes = caseDocumentManifestBytes;
  input.generationRef.case_document_ref.manifest_digest = prefixedDigest(caseDocumentManifestBytes);
  input.generationRef.case_document_ref.bundle_digest = prefixedDigest(caseDocumentBytes);
  input.executionPlan.case_document_ref = structuredClone(input.generationRef.case_document_ref);
  input.executionPlanBytes = canonicalBytes(input.executionPlan);
  input.executionPlanManifest.case_document_ref = structuredClone(input.generationRef.case_document_ref);
  input.executionPlanManifest.execution_plan_artifact.digest = prefixedDigest(input.executionPlanBytes);
  input.executionPlanManifestBytes = canonicalBytes(input.executionPlanManifest);
  const value = finalizeNoExecution(input);
  assert.equal(value.value.completion_kind, "no_execution_selected");
  assert.equal(value.value.runner, null);
  const tampered = structuredClone(input);
  tampered.executionPlanManifest.execution_plan_artifact.digest = `sha256:${"0".repeat(64)}`;
  tampered.executionPlanManifestBytes = canonicalBytes(tampered.executionPlanManifest);
  assert.throws(() => finalizeNoExecution(tampered), error => error.code === "HANDOFF_REF_MISMATCH");
  const tamperedCaseDocument = structuredClone(input);
  tamperedCaseDocument.caseDocument.result_kind = "delivered_with_gaps";
  tamperedCaseDocument.caseDocumentBytes = canonicalBytes(tamperedCaseDocument.caseDocument);
  assert.throws(() => finalizeNoExecution(tamperedCaseDocument), error => error.code === "HANDOFF_REF_MISMATCH");
  const runRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "prd-e2e-final-index-")));
  const written = await writeFinalIndex(runRoot, value);
  assert.equal(JSON.parse(await readFile(written.path, "utf8")).completion_kind, "no_execution_selected");
});

test("Finalizer payload references must equal the references persisted in workflow state", () => {
  const generation = { run_root: "/generator/run", case_document_ref: { run_id: "CASE-RUN" } };
  const executionPlan = { run_root: "/generator/plan", run_id: "PLAN-RUN" };
  const runnerRun = { run_root: "/runner/run", run_id: "RUNNER-RUN" };
  const state = { refs: { generation, execution_plan: executionPlan, runner_run: runnerRun } };
  const payload = { generationRef: generation, executionPlanRef: executionPlan, runnerRunRef: runnerRun };
  assert.doesNotThrow(() => validateFinalizerBindings({ state, payload, mode: "executed" }));
  assert.throws(
    () => validateFinalizerBindings({
      state,
      payload: { ...payload, runnerRunRef: { ...runnerRun, run_id: "OTHER" } },
      mode: "executed"
    }),
    error => error.code === "RUNNER_LINEAGE_MISMATCH"
  );
});
