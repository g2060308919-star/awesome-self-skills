import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compileCaseDocumentRevisionV4 } from "../../generate-test-cases-engineering/src/v4-pipeline.mjs";
import { materializeCaseDocumentDeliveryV4, materializeExecutionPlanDeliveryV4 } from "../../generate-test-cases-engineering/src/canonical-delivery-v4.mjs";
import { candidateDeliveryInput } from "../../generate-test-cases-engineering/test/helpers/v4-candidate-delivery-fixture.mjs";
import { v4GeneralQualityFixture } from "../../generate-test-cases-engineering/test/helpers/v4-general-quality-fixture.mjs";
import { compileRunnerInput } from "../skills/run-prd-e2e/scripts/lib/compiler.mjs";
import { canonicalJsonBytes, sha256Text, sha256Value } from "../skills/run-prd-e2e/scripts/lib/digest.mjs";
import { validateTestCases } from "../skills/b2b-e2e-runner/scripts/lib/contracts.mjs";
import { initializeRun, recordEvent, deliverReport, validateRun } from "../skills/b2b-e2e-runner/scripts/run-artifacts.mjs";
import { finalizeExecuted, finalizeNoExecution } from "../skills/run-prd-e2e/scripts/lib/finalizer.mjs";

test("actual 4.3 Generator materialization compiles losslessly and finalizes actual Runner 2.0 artifacts", async t => {
  // Readiness and independent-review inputs are isolated test fixtures, not Agent evidence.
  const fixture = v4GeneralQualityFixture();
  const compiled = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(compiled.status, "compiled");
  const document = materializeCaseDocumentDeliveryV4({ ...candidateDeliveryInput(), bundle: compiled.bundle });
  const caseDocument = JSON.parse(document.bundle_bytes);
  assert.equal(caseDocument.schema_version, "4.3.0");
  const manifestBytes = canonicalJsonBytes(document.manifest);
  const ref = { run_id: document.manifest.run_id, revision: document.manifest.revision, manifest_digest: sha256Text(manifestBytes), bundle_digest: document.manifest.bundle.digest };
  const ids = caseDocument.ordered_case_ids;
  assert.ok(ids.length > 0);
  const plan = await materializeExecutionPlanDeliveryV4({
    run_id: "RUN-22222222-2222-4222-8222-222222222222", revision: 1, completed_at: "2026-09-18T00:00:00.000Z", case_document_ref: ref,
    execution_plan: {
      schema_version: "4.3.0", compiler_version: "0.8.0", delivery_intent: "execution_plan", status: "finished", result_kind: "execution_ready",
      case_document_ref: ref,
      items: ids.map(case_id => ({ case_id, semantic_status: "Grounded", disposition: "execute", ready: true })),
      runner_ready: true, runner_projection: { case_ids: ids, case_ids_digest: sha256Value(ids) }
    }, non_blocking_diagnostics: []
  }, { resolve_case_document: async () => ({ manifest_bytes: manifestBytes, bundle_bytes: document.bundle_bytes }) });
  const input = {
    request: { schema_version: "1.0", prd_sources: ["prd.md"], target_urls: ["https://example.invalid"] },
    generationRef: { schema_version: "1.0", run_root: "/case", manifest_path: "/case/output/current.json", bundle_path: "/case/output/test-bundle.json", case_document_ref: ref },
    caseDocumentManifest: document.manifest, caseDocumentManifestBytes: manifestBytes,
    caseDocument, caseDocumentBytes: document.bundle_bytes,
    executionPlanManifest: plan.manifest, executionPlanManifestBytes: canonicalJsonBytes(plan.manifest),
    executionPlan: JSON.parse(plan.execution_plan_bytes), executionPlanBytes: plan.execution_plan_bytes,
    executionProfile: {
      schema_version: "1.0", environment: { classification: "non-production", evidence: "Isolated fixture" },
      execution_scope: { case_ids: ids }, test_data: { kind: "case-document", requirements: [] },
      evidence_policy: { kind: "runner-default", requirements: [] },
      business_cleanup: { cases: ids.map(case_id => ({ case_id, disposition: "not_required", reason: "Compiler fixture, no business operation" })) },
      pass_standard: { kind: "exact-expected-text" }
    }, runnerValidator: validateTestCases
  };
  const result = compileRunnerInput(input).value;
  assert.equal(validateTestCases(result), result);
  assert.deepEqual(result.cases.map(item => item.case_id), ids);
  for (const actual of result.cases) {
    const original = caseDocument.cases.find(item => item.case_id === actual.case_id);
    assert.deepEqual(actual.steps.map(step => [step.step_id, step.action]), original.steps.map(step => [step.step_id, step.action]));
    for (const step of actual.steps) {
      assert.deepEqual(step.expected.map(item => [item.oracle_id, item.text]), original.oracles.filter(item => item.observe_after_step_id === step.step_id).map(item => [item.oracle_id, item.expected]));
    }
  }
  assert.throws(() => compileRunnerInput({ ...input, caseDocumentBytes: document.bundle_bytes + " " }), { code: "HANDOFF_REF_MISMATCH" });

  const workspaceRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "prd-current-journey-")));
  t.after(() => rm(workspaceRoot, { recursive: true, force: true }));
  const casesPath = path.join(workspaceRoot, "runner-input.json");
  await writeFile(casesPath, canonicalJsonBytes(result));
  const run = await initializeRun({ workspaceRoot, casesPath, workflowProfile: "permission-batches-html-v2" });
  await recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ids });
  for (const testCase of result.cases) for (const step of testCase.steps) for (const oracle of step.expected) {
    const checkpoint_id = `${testCase.case_id}/${step.step_id}/${oracle.oracle_id}`;
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id });
    await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id, result: "passed", reason: "Synthetic integration observation", observation: oracle.text, evidence_status: "missing" });
    await recordEvent(run.runRoot, { type: "evidence_capture", capture_kind: "screenshot", outcome: "unavailable", checkpoint_ids: [checkpoint_id], description: "Offline artifact fixture", attempts: ["No browser is attached to this unit test"], reason: "Not actual browser execution evidence" });
  }
  await recordEvent(run.runRoot, { type: "run_state", status: "completed" });
  const reportResult = await deliverReport(run.runRoot);
  const final = await finalizeExecuted({
    ...input, outerRunId: "OUTER-INTEGRATION", runnerInput: result,
    runnerRunRef: { run_id: run.runId, run_root: run.runRoot },
    executionPlanRef: { run_id: plan.manifest.run_id, manifest_path: "/plan/output/current.json", artifact_path: "/plan/output/execution-plan.json" },
    reportResult, runnerRunValidator: validateRun
  });
  assert.deepEqual(final.value.runner.counts, { passed: ids.length, failed: 0, undetermined: 0, not_executed: 0 });
  assert.deepEqual(final.value.traceability.map(item => item.case_id), ids);
  assert.equal(final.value.runner.report_path, reportResult.htmlReportPath);

  const noPlan = structuredClone(input.executionPlan);
  noPlan.result_kind = "no_execution_selected";
  noPlan.runner_ready = false;
  noPlan.items = noPlan.items.map(item => ({ ...item, disposition: "do_not_execute", ready: false }));
  noPlan.runner_projection = { case_ids: [], case_ids_digest: sha256Value([]) };
  const noDelivery = await materializeExecutionPlanDeliveryV4({
    run_id: plan.manifest.run_id, revision: 2, completed_at: "2026-09-18T01:00:00.000Z", case_document_ref: ref, execution_plan: noPlan, non_blocking_diagnostics: []
  }, { resolve_case_document: async () => ({ manifest_bytes: manifestBytes, bundle_bytes: document.bundle_bytes }) });
  const noInput = { ...input, outerRunId: "OUTER-NO-EXECUTION", executionPlanRef: { run_id: noDelivery.manifest.run_id, manifest_path: "/plan/output/current.json", artifact_path: "/plan/output/execution-plan.json" }, executionPlan: noPlan, executionPlanBytes: noDelivery.execution_plan_bytes, executionPlanManifest: noDelivery.manifest, executionPlanManifestBytes: canonicalJsonBytes(noDelivery.manifest) };
  assert.equal(finalizeNoExecution(noInput).value.completion_kind, "no_execution_selected");
  const mixed = { ...noInput, executionPlan: structuredClone(noInput.executionPlan), executionPlanManifest: structuredClone(noInput.executionPlanManifest) };
  mixed.executionPlan.schema_version = "4.2.0";
  mixed.executionPlan.compiler_version = "0.7.0";
  mixed.executionPlanBytes = canonicalJsonBytes(mixed.executionPlan);
  mixed.executionPlanManifest.execution_plan_artifact.digest = sha256Text(mixed.executionPlanBytes);
  mixed.executionPlanManifestBytes = canonicalJsonBytes(mixed.executionPlanManifest);
  assert.throws(() => finalizeNoExecution(mixed), { code: "HANDOFF_REF_MISMATCH" });
});
