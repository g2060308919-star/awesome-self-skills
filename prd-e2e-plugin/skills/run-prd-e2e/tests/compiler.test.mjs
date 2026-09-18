import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { compileAndWriteRunnerInput, compileRunnerInput } from "../scripts/lib/compiler.mjs";
import {
  readJsonRegular,
  validateCompileFileBindings,
  validateManifestArtifactBindings
} from "../scripts/lib/handoff-paths.mjs";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function bytes(value) {
  return `${canonical(value)}\n`;
}

function digestText(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function digestValue(value) {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}

function makeCase(id, moduleId, suffix) {
  return {
    case_id: id,
    title: `Case ${suffix}`,
    module_id: moduleId,
    priority: "P1",
    ordering: { business_flow_ref: null, page_action_ref: null, depends_on_case_ids: [] },
    acceptance_role: "primary_acceptance",
    fact_ids: [`FACT-${suffix}`],
    semantic_status: "Grounded",
    primary_test_point_id: `TP-${suffix}`,
    supporting_observation_ids: [],
    business_preconditions: [{ precondition_id: `PRE-${suffix}`, description: `Precondition ${suffix}` }],
    data_conditions: [{ condition_id: `DATA-${suffix}`, description: `Data ${suffix}` }],
    steps: [
      { step_id: `STEP-${suffix}-1`, action: `Action ${suffix} 1` },
      { step_id: `STEP-${suffix}-2`, action: `Action ${suffix} 2` }
    ],
    oracles: [
      { oracle_id: `ORACLE-${suffix}-1`, observe_after_step_id: `STEP-${suffix}-1`, surface: "ui", expected: `Expected ${suffix}\nline two`, claim_ids: [`CLAIM-${suffix}-1`] },
      { oracle_id: `ORACLE-${suffix}-2`, observe_after_step_id: `STEP-${suffix}-2`, surface: "response", expected: `Expected ${suffix} final`, claim_ids: [`CLAIM-${suffix}-2`] }
    ],
    test_values: [{
      value_id: `VALUE-${suffix}`,
      subject_ref: `SUBJECT-${suffix}`,
      field_path: "/name",
      value: `Value ${suffix}`,
      used_by_refs: [`STEP-${suffix}-1`],
      value_origin: { kind: "requirement", claim_ids: [`CLAIM-${suffix}-1`] }
    }]
  };
}

function fixture() {
  const caseA = makeCase("CASE-A", "MOD-A", "A");
  const caseB = makeCase("CASE-B", "MOD-B", "B");
  const caseDocument = {
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "case_document",
    source_revision: 3,
    result_kind: "delivered_cases",
    ordered_case_ids: ["CASE-A", "CASE-B"],
    scope_manifest: {
      primary_surface: "Admin UI",
      modules: [
        { module_id: "MOD-A", name: "Module A", role: "primary", claim_ids: ["CLAIM-MOD-A"] },
        { module_id: "MOD-B", name: "Module B", role: "primary", claim_ids: ["CLAIM-MOD-B"] }
      ],
      boundaries: []
    },
    cases: [caseA, caseB],
    coverage: {
      primary: { reviewed_formal_test_point_count: 2, covered_formal_test_point_count: 2, not_applicable_formal_test_point_count: 0 },
      boundary: { reviewed_formal_test_point_count: 0, covered_formal_test_point_count: 0, not_applicable_formal_test_point_count: 0 },
      semantic_gap_count: 0,
      exploratory_count: 0,
      not_applicable_count: 0
    },
    semantic_root_groups: [],
    exploratory: [],
    not_applicable: [],
    risk_review_ledger: []
  };
  const caseDocumentBytes = bytes(caseDocument);
  const caseDocumentManifest = {
    run_id: "RUN-11111111-1111-4111-8111-111111111111",
    revision: 3,
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "case_document",
    authority: "canonical",
    result_kind: "delivered_cases",
    completed_at: "2026-09-17T00:00:00.000Z",
    bundle: { path: "output/revision-000003/test-bundle.json", digest: digestText(caseDocumentBytes) },
    markdown: { path: "output/revision-000003/test-cases.md", digest: `sha256:${"1".repeat(64)}` },
    execution_worksheet: { path: "output/revision-000003/test-cases.csv", digest: `sha256:${"2".repeat(64)}`, format: "csv" },
    html: { path: "output/revision-000003/test-cases.html", digest: `sha256:${"3".repeat(64)}`, format: "html" },
    chat_table: { path: "output/revision-000003/case-table.txt", digest: `sha256:${"4".repeat(64)}`, format: "commonmark-table" },
    source_reading: { path: "output/revision-000003/source-reading.json", digest: `sha256:${"5".repeat(64)}`, format: "json" },
    primary_readable: "html",
    render_options: { include_audit_appendix: false },
    case_count: 2,
    blocked_root_count: 0,
    closed_for_delivery_root_count: 0,
    not_applicable_count: 0,
    exploratory_count: 0
  };
  const caseDocumentManifestBytes = bytes(caseDocumentManifest);
  const caseDocumentRef = {
    run_id: caseDocumentManifest.run_id,
    revision: 3,
    manifest_digest: digestText(caseDocumentManifestBytes),
    bundle_digest: digestText(caseDocumentBytes)
  };
  const executionPlan = {
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "execution_plan",
    status: "finished",
    result_kind: "execution_ready",
    case_document_ref: structuredClone(caseDocumentRef),
    items: [
      { case_id: "CASE-A", semantic_status: "Grounded", disposition: "execute", ready: true },
      { case_id: "CASE-B", semantic_status: "Grounded", disposition: "execute", ready: true }
    ],
    runner_ready: true,
    runner_projection: { case_ids: ["CASE-B", "CASE-A"], case_ids_digest: digestValue(["CASE-B", "CASE-A"]) }
  };
  const executionPlanBytes = bytes(executionPlan);
  const executionPlanManifest = {
    run_id: "RUN-22222222-2222-4222-8222-222222222222",
    revision: 1,
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "execution_plan",
    authority: "canonical",
    result_kind: "execution_ready",
    completed_at: "2026-09-17T00:01:00.000Z",
    case_document_ref: structuredClone(caseDocumentRef),
    execution_plan_artifact: { path: "output/revision-000001/execution-plan.json", digest: digestText(executionPlanBytes) },
    runner_projection: structuredClone(executionPlan.runner_projection),
    runner_ready: true
  };
  const executionPlanManifestBytes = bytes(executionPlanManifest);
  const request = {
    schema_version: "1.0",
    prd_sources: ["docs/prd.md"],
    target_urls: ["https://example.invalid/app"],
    suite_name: "Acceptance"
  };
  const executionProfile = {
    schema_version: "1.0",
    environment: { classification: "non-production", evidence: "Environment owner identified staging explicitly." },
    execution_scope: { case_ids: ["CASE-B", "CASE-A"] },
    test_data: { kind: "case-document", requirements: ["Use the named sample"] },
    evidence_policy: { kind: "runner-default", requirements: [] },
    business_cleanup: { cases: [
      { case_id: "CASE-B", disposition: "required", instruction: "Delete the created test record" },
      { case_id: "CASE-A", disposition: "not_required", reason: "Read-only" }
    ] },
    pass_standard: { kind: "exact-expected-text" }
  };
  return {
    request,
    generationRef: {
      schema_version: "1.0",
      run_root: "/generator/run",
      manifest_path: "/generator/run/output/current.json",
      bundle_path: "/generator/run/output/revision-000003/test-bundle.json",
      case_document_ref: structuredClone(caseDocumentRef)
    },
    caseDocumentManifest,
    caseDocumentManifestBytes,
    caseDocument,
    caseDocumentBytes,
    executionPlanManifest,
    executionPlanManifestBytes,
    executionPlan,
    executionPlanBytes,
    executionProfile
  };
}

function compile(input = fixture()) {
  let validatorCalls = 0;
  const result = compileRunnerInput({
    ...input,
    runnerValidator(value) {
      validatorCalls += 1;
      assert.equal(value.schema_version, "2.0");
      return value;
    }
  });
  return { result, validatorCalls };
}

test("compiler selects only projected Cases in projection order and preserves all semantic text and IDs", () => {
  const input = fixture();
  const { result, validatorCalls } = compile(input);
  assert.equal(validatorCalls, 1);
  assert.deepEqual(result.value.cases.map(item => item.case_id), ["CASE-B", "CASE-A"]);
  assert.deepEqual(result.value.cases[0].steps.map(item => item.step_id), ["STEP-B-1", "STEP-B-2"]);
  assert.deepEqual(result.value.cases[0].steps[0].expected.map(item => item.oracle_id), ["ORACLE-B-1"]);
  assert.equal(Buffer.compare(Buffer.from(result.value.cases[0].steps[0].expected[0].text), Buffer.from(input.caseDocument.cases[1].oracles[0].expected)), 0);
  assert.deepEqual(result.value.cases[0].data_conditions, input.caseDocument.cases[1].data_conditions);
  assert.deepEqual(result.value.cases[0].test_values, input.caseDocument.cases[1].test_values);
  assert.deepEqual(result.value.suite.lineage.case_document_ref, input.generationRef.case_document_ref);
  assert.equal(result.value.suite.lineage.case_ids_digest, input.executionPlan.runner_projection.case_ids_digest);
  assert.match(result.sha256, /^sha256:[a-f0-9]{64}$/);
});

test("compiler rejects any Case Document or Execution Plan reference mismatch", () => {
  const manifestMismatch = fixture();
  manifestMismatch.generationRef.case_document_ref.manifest_digest = `sha256:${"0".repeat(64)}`;
  assert.throws(() => compile(manifestMismatch), error => error.code === "HANDOFF_REF_MISMATCH");
  const planMismatch = fixture();
  planMismatch.executionPlan.case_document_ref.revision = 99;
  planMismatch.executionPlanBytes = bytes(planMismatch.executionPlan);
  planMismatch.executionPlanManifest.execution_plan_artifact.digest = digestText(planMismatch.executionPlanBytes);
  planMismatch.executionPlanManifestBytes = bytes(planMismatch.executionPlanManifest);
  assert.throws(() => compile(planMismatch), error => error.code === "HANDOFF_REF_MISMATCH");

  const missingPlanIdentity = fixture();
  delete missingPlanIdentity.executionPlanManifest.run_id;
  missingPlanIdentity.executionPlanManifestBytes = bytes(missingPlanIdentity.executionPlanManifest);
  assert.throws(() => compile(missingPlanIdentity), error => error.code === "HANDOFF_REF_MISMATCH");

  const nonCanonicalPlanManifest = fixture();
  nonCanonicalPlanManifest.executionPlanManifestBytes = `${JSON.stringify(nonCanonicalPlanManifest.executionPlanManifest, null, 2)}\n`;
  assert.throws(() => compile(nonCanonicalPlanManifest), error => error.code === "HANDOFF_REF_MISMATCH");
});

test("compiler rejects non-Grounded, non-execute, or not-ready projected items", () => {
  for (const change of [
    item => { item.semantic_status = "Conditional"; },
    item => { item.disposition = "do_not_execute"; },
    item => { item.ready = false; }
  ]) {
    const input = fixture();
    change(input.executionPlan.items[1]);
    input.executionPlanBytes = bytes(input.executionPlan);
    input.executionPlanManifest.execution_plan_artifact.digest = digestText(input.executionPlanBytes);
    input.executionPlanManifestBytes = bytes(input.executionPlanManifest);
    assert.throws(() => compile(input), error => error.code === "CASE_NOT_EXECUTABLE");
  }
});

test("compiler rejects duplicate IDs, missing modules, bad Oracle links, and Steps without Oracles", () => {
  const duplicate = fixture();
  duplicate.caseDocument.cases[1].steps[1].step_id = duplicate.caseDocument.cases[1].steps[0].step_id;
  duplicate.caseDocumentBytes = bytes(duplicate.caseDocument);
  duplicate.caseDocumentManifest.bundle.digest = digestText(duplicate.caseDocumentBytes);
  duplicate.caseDocumentManifestBytes = bytes(duplicate.caseDocumentManifest);
  duplicate.generationRef.case_document_ref.bundle_digest = digestText(duplicate.caseDocumentBytes);
  duplicate.generationRef.case_document_ref.manifest_digest = digestText(duplicate.caseDocumentManifestBytes);
  duplicate.executionPlan.case_document_ref = structuredClone(duplicate.generationRef.case_document_ref);
  duplicate.executionPlanManifest.case_document_ref = structuredClone(duplicate.generationRef.case_document_ref);
  duplicate.executionPlanBytes = bytes(duplicate.executionPlan);
  duplicate.executionPlanManifest.execution_plan_artifact.digest = digestText(duplicate.executionPlanBytes);
  duplicate.executionPlanManifestBytes = bytes(duplicate.executionPlanManifest);
  assert.throws(() => compile(duplicate), error => error.code === "INPUT_CONTRACT");

  const missingModule = fixture();
  missingModule.caseDocument.cases[1].module_id = "UNKNOWN";
  refreshCaseDigests(missingModule);
  assert.throws(() => compile(missingModule), error => error.code === "MODULE_NOT_FOUND");

  const badOracle = fixture();
  badOracle.caseDocument.cases[1].oracles[0].observe_after_step_id = "MISSING";
  refreshCaseDigests(badOracle);
  assert.throws(() => compile(badOracle), error => error.code === "ORACLE_STEP_MISMATCH");

  const noOracle = fixture();
  noOracle.caseDocument.cases[1].oracles = [noOracle.caseDocument.cases[1].oracles[0]];
  refreshCaseDigests(noOracle);
  assert.throws(() => compile(noOracle), error => error.code === "STEP_WITHOUT_ORACLE");
});

test("compiler rejects empty expected text, incomplete profile gates, and secret material", () => {
  const empty = fixture();
  empty.caseDocument.cases[1].oracles[0].expected = "   ";
  refreshCaseDigests(empty);
  assert.throws(() => compile(empty), error => error.code === "INPUT_CONTRACT");

  const incomplete = fixture();
  incomplete.executionProfile.business_cleanup.cases.pop();
  assert.throws(() => compile(incomplete), error => error.code === "EXECUTION_PROFILE_INCOMPLETE");

  const secret = fixture();
  secret.executionProfile.test_data.requirements = ["Cookie: sid=never-persist"];
  assert.throws(() => compile(secret), error => error.code === "SECRET_MATERIAL_FORBIDDEN" && !error.message.includes("never-persist"));
});

test("compiler fails when the bundled Runner validator rejects output", () => {
  assert.throws(() => compileRunnerInput({
    ...fixture(),
    runnerValidator() { throw new Error("runner detail with token=never-echo"); }
  }), error => error.code === "INPUT_CONTRACT" && !error.message.includes("never-echo"));
});

test("compiler atomically writes only runner-input.json and returns its byte digest", async () => {
  const runRoot = await realpath(await mkdtemp(path.join(os.tmpdir(), "prd-e2e-compile-")));
  const input = fixture();
  const result = await compileAndWriteRunnerInput({
    runRoot,
    ...input,
    runnerValidator(value) { return value; }
  });
  assert.equal(result.path, path.join(runRoot, "runner-input.json"));
  const written = await readFile(result.path, "utf8");
  assert.equal(written, result.text);
  assert.equal(result.sha256, digestText(written));

  const replay = await compileAndWriteRunnerInput({
    runRoot,
    ...input,
    runnerValidator(value) { return value; }
  });
  assert.equal(replay.reused, true);
  assert.equal(replay.text, written);

  const changed = structuredClone(input);
  changed.executionProfile.environment.evidence = "A different non-production evidence binding";
  await assert.rejects(
    () => compileAndWriteRunnerInput({
      runRoot,
      ...changed,
      runnerValidator(value) { return value; }
    }),
    error => error.code === "NEW_RUN_REQUIRED"
  );
  assert.equal(await readFile(result.path, "utf8"), written);
});

test("Compiler CLI paths are bound to the outer Run and stored child references", () => {
  const runRoot = "/workspace/e2e-runs/20260917T000000000Z-abcdef123456";
  const generation = {
    run_root: "/workspace/generator/run-1",
    manifest_path: "/workspace/generator/run-1/output/current.json",
    bundle_path: "/workspace/generator/run-1/output/revision-000001/test-bundle.json"
  };
  const executionPlan = {
    run_root: "/workspace/generator/run-2",
    manifest_path: "/workspace/generator/run-2/output/current.json",
    artifact_path: "/workspace/generator/run-2/output/revision-000001/execution-plan.json"
  };
  const valid = {
    request: path.join(runRoot, "request.json"),
    generationRef: path.join(runRoot, "generation-ref.json"),
    executionProfile: path.join(runRoot, "execution-profile.json"),
    caseManifest: generation.manifest_path,
    caseBundle: generation.bundle_path,
    executionManifest: executionPlan.manifest_path,
    executionPlan: executionPlan.artifact_path
  };
  assert.doesNotThrow(() => validateCompileFileBindings({ runRoot, generation, executionPlan, files: valid }));
  assert.throws(
    () => validateCompileFileBindings({ runRoot, generation, executionPlan, files: { ...valid, request: "/tmp/request.json" } }),
    error => error.code === "RUN_INTEGRITY"
  );
  assert.throws(
    () => validateCompileFileBindings({ runRoot, generation, executionPlan, files: { ...valid, caseBundle: "/workspace/generator/other/test-bundle.json" } }),
    error => error.code === "HANDOFF_REF_MISMATCH"
  );
  assert.throws(
    () => validateCompileFileBindings({
      runRoot,
      generation: { ...generation, manifest_path: "/workspace/generator/run-1/output/not-current.json" },
      executionPlan,
      files: { ...valid, caseManifest: "/workspace/generator/run-1/output/not-current.json" }
    }),
    error => error.code === "HANDOFF_REF_MISMATCH"
  );

  assert.doesNotThrow(() => validateManifestArtifactBindings({
    generation,
    executionPlan: { ...executionPlan, run_id: "PLAN-RUN" },
    caseManifest: { run_id: "CASE-RUN", bundle: { path: "output/revision-000001/test-bundle.json" } },
    planManifest: { run_id: "PLAN-RUN", execution_plan_artifact: { path: "output/revision-000001/execution-plan.json" } }
  }));
  assert.throws(
    () => validateManifestArtifactBindings({
      generation,
      executionPlan: { ...executionPlan, run_id: "PLAN-RUN" },
      caseManifest: { run_id: "CASE-RUN", bundle: { path: "output/other.json" } },
      planManifest: { run_id: "PLAN-RUN", execution_plan_artifact: { path: "output/revision-000001/execution-plan.json" } }
    }),
    error => error.code === "HANDOFF_REF_MISMATCH"
  );
});

test("handoff artifact reads reject a child root reached through a parent symlink", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-child-path-"));
  const actual = path.join(parent, "actual");
  const linked = path.join(parent, "linked");
  await mkdir(actual);
  await writeFile(path.join(actual, "artifact.json"), "{}\n");
  await symlink(actual, linked);
  await assert.rejects(
    () => readJsonRegular(path.join(linked, "artifact.json"), "Child artifact", { withinRoot: linked }),
    error => error.code === "RUN_INTEGRITY"
  );
});

function refreshCaseDigests(input) {
  input.caseDocumentBytes = bytes(input.caseDocument);
  input.caseDocumentManifest.bundle.digest = digestText(input.caseDocumentBytes);
  input.caseDocumentManifestBytes = bytes(input.caseDocumentManifest);
  input.generationRef.case_document_ref.bundle_digest = digestText(input.caseDocumentBytes);
  input.generationRef.case_document_ref.manifest_digest = digestText(input.caseDocumentManifestBytes);
  input.executionPlan.case_document_ref = structuredClone(input.generationRef.case_document_ref);
  input.executionPlanManifest.case_document_ref = structuredClone(input.generationRef.case_document_ref);
  input.executionPlanBytes = bytes(input.executionPlan);
  input.executionPlanManifest.execution_plan_artifact.digest = digestText(input.executionPlanBytes);
  input.executionPlanManifestBytes = bytes(input.executionPlanManifest);
}

test("current 4.3 / 0.8 handoff preserves the same Runner projection as historical 4.2 / 0.7", () => {
  const old = fixture();
  const current = fixture();
  for (const key of ["caseDocument", "caseDocumentManifest", "executionPlan", "executionPlanManifest"]) {
    current[key].schema_version = "4.3.0";
    current[key].compiler_version = "0.8.0";
  }
  refreshCaseDigests(current);
  assert.deepEqual(compile(current).result.value.cases, compile(old).result.value.cases);
  assert.deepEqual(compile(current).result.value.suite.lineage.case_document_ref, current.generationRef.case_document_ref);
});

test("handoff rejects mixed artifact versions and unknown schema/compiler pairs", () => {
  for (const [schema, compiler] of [["4.3.0", "0.7.0"], ["4.2.0", "0.8.0"], ["4.4.0", "0.9.0"]]) {
    const input = fixture();
    for (const key of ["caseDocument", "caseDocumentManifest", "executionPlan", "executionPlanManifest"]) {
      input[key].schema_version = schema; input[key].compiler_version = compiler;
    }
    refreshCaseDigests(input);
    assert.throws(() => compile(input), { code: "HANDOFF_REF_MISMATCH" });
  }
  for (const keys of [["caseDocument"], ["caseDocumentManifest"], ["executionPlan", "executionPlanManifest"]]) {
    const input = fixture();
    for (const key of keys) { input[key].schema_version = "4.3.0"; input[key].compiler_version = "0.8.0"; }
    refreshCaseDigests(input);
    assert.throws(() => compile(input), { code: "HANDOFF_REF_MISMATCH" });
  }
});
