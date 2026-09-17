import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compileRunnerInput } from "../skills/run-prd-e2e/scripts/lib/compiler.mjs";
import { canonicalJsonBytes, sha256Text, sha256Value } from "../skills/run-prd-e2e/scripts/lib/digest.mjs";
import { validateTestCases } from "../skills/b2b-e2e-runner/scripts/lib/contracts.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("vendored Generator registry has the locked 4.2.0 / 0.7.0 contract and intact canonical Schema digests", async () => {
  const scripts = path.join(pluginRoot, "skills", "generate-test-cases", "scripts");
  const manifest = JSON.parse(await readFile(path.join(scripts, "schema-manifest.json"), "utf8"));
  assert.equal(manifest.schema_version, "4.2.0");
  assert.equal(manifest.compiler_version, "0.7.0");
  assert.equal(manifest.digest, sha256Value({
    compiler_version: manifest.compiler_version,
    schema_version: manifest.schema_version,
    schemas: manifest.schemas
  }).slice("sha256:".length));
  for (const entry of manifest.schemas) {
    const schema = JSON.parse(await readFile(path.join(scripts, "schemas", entry.file), "utf8"));
    assert.equal(entry.digest, sha256Value(schema).slice("sha256:".length), entry.file);
  }
  const bundleSchema = JSON.parse(await readFile(path.join(scripts, "schemas", "test-bundle.schema.json"), "utf8"));
  const planSchema = JSON.parse(await readFile(path.join(scripts, "schemas", "execution-plan.schema.json"), "utf8"));
  assert.deepEqual(bundleSchema.$defs.caseDocumentBundle.allOf[0].oneOf[1].properties, {
    schema_version: { const: "4.2.0" },
    compiler_version: { const: "0.7.0" }
  });
  assert.deepEqual(planSchema.$defs.v4ContractVersion.oneOf[1].properties, {
    schema_version: { const: "4.2.0" },
    compiler_version: { const: "0.7.0" }
  });
});

test("Compiler output from a Generator 4.2 fixture passes the actual vendored Runner 2.0 validator", () => {
  const caseDocument = {
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "case_document",
    source_revision: 1,
    result_kind: "delivered_cases",
    ordered_case_ids: ["CASE-1"],
    scope_manifest: {
      primary_surface: "Admin UI",
      modules: [{ module_id: "MOD-1", name: "Module", role: "primary", claim_ids: ["CLAIM-MOD"] }],
      boundaries: []
    },
    cases: [{
      case_id: "CASE-1",
      title: "Traceable case",
      module_id: "MOD-1",
      priority: "P1",
      ordering: { business_flow_ref: null, page_action_ref: null, depends_on_case_ids: [] },
      acceptance_role: "primary_acceptance",
      fact_ids: ["FACT-1"],
      semantic_status: "Grounded",
      primary_test_point_id: "TP-1",
      supporting_observation_ids: [],
      business_preconditions: [{ precondition_id: "PRE-1", description: "Prepared test data" }],
      data_conditions: [],
      steps: [{ step_id: "STEP-1", action: "Open the record" }],
      oracles: [{ oracle_id: "ORACLE-1", observe_after_step_id: "STEP-1", surface: "ui", expected: "The record is visible", claim_ids: ["CLAIM-1"] }]
    }],
    coverage: {
      primary: { reviewed_formal_test_point_count: 1, covered_formal_test_point_count: 1, not_applicable_formal_test_point_count: 0 },
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
  const caseDocumentBytes = canonicalJsonBytes(caseDocument);
  const caseManifest = {
    run_id: "RUN-11111111-1111-4111-8111-111111111111",
    revision: 1,
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "case_document",
    authority: "canonical",
    result_kind: "delivered_cases",
    completed_at: "2026-09-17T00:00:00.000Z",
    bundle: { path: "output/revision-000001/test-bundle.json", digest: sha256Text(caseDocumentBytes) },
    markdown: { path: "output/revision-000001/test-cases.md", digest: `sha256:${"1".repeat(64)}` },
    execution_worksheet: { path: "output/revision-000001/test-cases.csv", digest: `sha256:${"2".repeat(64)}`, format: "csv" },
    render_options: { include_audit_appendix: false },
    case_count: 1,
    blocked_root_count: 0,
    closed_for_delivery_root_count: 0,
    not_applicable_count: 0,
    exploratory_count: 0
  };
  const caseManifestBytes = canonicalJsonBytes(caseManifest);
  const ref = {
    run_id: caseManifest.run_id,
    revision: 1,
    manifest_digest: sha256Text(caseManifestBytes),
    bundle_digest: sha256Text(caseDocumentBytes)
  };
  const plan = {
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "execution_plan",
    status: "finished",
    result_kind: "execution_ready",
    case_document_ref: ref,
    items: [{ case_id: "CASE-1", semantic_status: "Grounded", disposition: "execute", ready: true }],
    runner_ready: true,
    runner_projection: { case_ids: ["CASE-1"], case_ids_digest: sha256Value(["CASE-1"]) }
  };
  const planBytes = canonicalJsonBytes(plan);
  const planManifest = {
    run_id: "RUN-22222222-2222-4222-8222-222222222222",
    revision: 1,
    schema_version: "4.2.0",
    compiler_version: "0.7.0",
    delivery_intent: "execution_plan",
    authority: "canonical",
    result_kind: "execution_ready",
    completed_at: "2026-09-17T00:01:00.000Z",
    case_document_ref: ref,
    execution_plan_artifact: { path: "output/revision-000001/execution-plan.json", digest: sha256Text(planBytes) },
    runner_projection: plan.runner_projection,
    runner_ready: true
  };
  const result = compileRunnerInput({
    request: { schema_version: "1.0", prd_sources: ["prd.md"], target_urls: ["https://example.invalid"] },
    generationRef: { schema_version: "1.0", run_root: "/case", manifest_path: "/case/output/current.json", bundle_path: "/case/output/test-bundle.json", case_document_ref: ref },
    caseDocumentManifest: caseManifest,
    caseDocumentManifestBytes: caseManifestBytes,
    caseDocument,
    caseDocumentBytes,
    executionPlanManifest: planManifest,
    executionPlanManifestBytes: canonicalJsonBytes(planManifest),
    executionPlan: plan,
    executionPlanBytes: planBytes,
    executionProfile: {
      schema_version: "1.0",
      environment: { classification: "non-production", evidence: "Explicit staging declaration" },
      execution_scope: { case_ids: ["CASE-1"] },
      test_data: { kind: "case-document", requirements: [] },
      evidence_policy: { kind: "runner-default", requirements: [] },
      business_cleanup: { cases: [{ case_id: "CASE-1", disposition: "not_required", reason: "Read-only" }] },
      pass_standard: { kind: "exact-expected-text" }
    },
    runnerValidator: validateTestCases
  });
  assert.equal(validateTestCases(result.value), result.value);
  assert.equal(result.value.schema_version, "2.0");
  assert.equal(result.value.cases[0].steps[0].expected[0].text, caseDocument.cases[0].oracles[0].expected);
});
