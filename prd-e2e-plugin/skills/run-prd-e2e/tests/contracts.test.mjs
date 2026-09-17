import test from "node:test";
import assert from "node:assert/strict";

import {
  validateExecutionProfile,
  validateRequest
} from "../scripts/lib/contracts.mjs";

const validRequest = {
  schema_version: "1.0",
  prd_sources: ["docs/prd.md"],
  target_urls: ["https://example.invalid/app"]
};

const validProfile = {
  schema_version: "1.0",
  environment: {
    classification: "non-production",
    evidence: "The environment owner explicitly identified this as staging."
  },
  execution_scope: { case_ids: ["CASE-001"] },
  test_data: { kind: "case-document", requirements: [] },
  evidence_policy: { kind: "runner-default", requirements: [] },
  business_cleanup: {
    cases: [{ case_id: "CASE-001", disposition: "not_required", reason: "Read-only case" }]
  },
  pass_standard: { kind: "exact-expected-text" }
};

test("request validation supplies the fixed suite name without changing source or URL order", () => {
  assert.deepEqual(validateRequest(validRequest), { ...validRequest, suite_name: "PRD E2E" });
});

test("request validation rejects unknown fields and duplicate or empty values", () => {
  assert.throws(() => validateRequest({ ...validRequest, extra: true }), error => error.code === "INPUT_CONTRACT");
  assert.throws(() => validateRequest({ ...validRequest, prd_sources: ["docs/prd.md", "docs/prd.md"] }), error => error.code === "INPUT_CONTRACT");
  assert.throws(() => validateRequest({ ...validRequest, target_urls: [""] }), error => error.code === "INPUT_CONTRACT");
});

test("request validation accepts only unauthenticated HTTP(S) targets", () => {
  assert.throws(() => validateRequest({ ...validRequest, target_urls: ["ftp://example.invalid"] }), error => error.code === "INPUT_CONTRACT");
  assert.throws(() => validateRequest({ ...validRequest, target_urls: ["https://user:secret@example.invalid"] }), error => error.code === "AUTHENTICATED_URL_FORBIDDEN");
  assert.throws(() => validateRequest({ ...validRequest, target_urls: ["https://example.invalid/?token=secret"] }), error => error.code === "AUTHENTICATED_URL_FORBIDDEN");
  assert.throws(() => validateRequest({ ...validRequest, target_urls: ["https://example.invalid/?signature=abc"] }), error => error.code === "AUTHENTICATED_URL_FORBIDDEN");
});

test("request errors never echo authenticated URL material", () => {
  assert.throws(
    () => validateRequest({ ...validRequest, target_urls: ["https://user:super-secret@example.invalid/?token=also-secret"] }),
    error => error.code === "AUTHENTICATED_URL_FORBIDDEN" && !error.message.includes("super-secret") && !error.message.includes("also-secret")
  );
});

test("execution profile enforces the projected scope and exact cleanup coverage", () => {
  assert.deepEqual(validateExecutionProfile(validProfile, ["CASE-001"]), validProfile);
  assert.throws(() => validateExecutionProfile(validProfile, ["CASE-002"]), error => error.code === "EXECUTION_PROFILE_INCOMPLETE");
  assert.throws(
    () => validateExecutionProfile({ ...validProfile, business_cleanup: { cases: [] } }, ["CASE-001"]),
    error => error.code === "EXECUTION_PROFILE_INCOMPLETE"
  );
  assert.throws(
    () => validateExecutionProfile({ ...validProfile, business_cleanup: { cases: [
      ...validProfile.business_cleanup.cases,
      ...validProfile.business_cleanup.cases
    ] } }, ["CASE-001"]),
    error => error.code === "EXECUTION_PROFILE_INCOMPLETE"
  );
});

test("cleanup coverage is set-based and does not impose an undocumented array order", () => {
  const profile = structuredClone(validProfile);
  profile.execution_scope.case_ids = ["CASE-001", "CASE-002"];
  profile.business_cleanup.cases = [
    { case_id: "CASE-002", disposition: "not_required", reason: "Read-only case" },
    { case_id: "CASE-001", disposition: "not_required", reason: "Read-only case" }
  ];
  assert.doesNotThrow(() => validateExecutionProfile(profile, ["CASE-001", "CASE-002"]));
});

test("execution profile requires explicit non-production evidence and a closed shape", () => {
  assert.throws(
    () => validateExecutionProfile({ ...validProfile, environment: { classification: "production", evidence: "name says prod" } }, ["CASE-001"]),
    error => error.code === "EXECUTION_PROFILE_INCOMPLETE"
  );
  assert.throws(
    () => validateExecutionProfile({ ...validProfile, environment: { ...validProfile.environment, guessed_from_hostname: true } }, ["CASE-001"]),
    error => error.code === "INPUT_CONTRACT"
  );
});

test("execution profile accepts only the two cleanup variants", () => {
  const required = structuredClone(validProfile);
  required.business_cleanup.cases = [{ case_id: "CASE-001", disposition: "required", instruction: "Delete the created test record" }];
  assert.deepEqual(validateExecutionProfile(required, ["CASE-001"]), required);
  required.business_cleanup.cases[0].reason = "extra";
  assert.throws(() => validateExecutionProfile(required, ["CASE-001"]), error => error.code === "INPUT_CONTRACT");
});

test("execution profile recursively rejects secrets without echoing them", () => {
  const secret = structuredClone(validProfile);
  secret.test_data.requirements = ["Authorization: Bearer do-not-print-this"];
  assert.throws(
    () => validateExecutionProfile(secret, ["CASE-001"]),
    error => error.code === "SECRET_MATERIAL_FORBIDDEN" && !error.message.includes("do-not-print-this")
  );
});
