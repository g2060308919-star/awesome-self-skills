import { fail, requireCondition } from "./errors.mjs";
import { assertNoSecrets, isSecretQueryKey } from "./secrets.mjs";

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, path, code = "INPUT_CONTRACT") {
  requireCondition(isRecord(value), code, `${path} must be an object.`);
}

function requireClosed(value, allowed, path, code = "INPUT_CONTRACT") {
  requireRecord(value, path, code);
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  requireCondition(unexpected.length === 0, code, `${path} contains unknown fields.`, { path, fields: unexpected });
}

function requireText(value, path, code = "INPUT_CONTRACT") {
  requireCondition(typeof value === "string" && value.trim().length > 0, code, `${path} must be a non-empty string.`);
}

function requireStringArray(value, path, { nonEmpty = false, unique = false, code = "INPUT_CONTRACT" } = {}) {
  requireCondition(Array.isArray(value), code, `${path} must be an array.`);
  if (nonEmpty) requireCondition(value.length > 0, code, `${path} must not be empty.`);
  value.forEach((item, index) => requireText(item, `${path}[${index}]`, code));
  if (unique) requireCondition(new Set(value).size === value.length, code, `${path} must not contain duplicates.`);
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateTargetUrl(value, path) {
  requireText(value, path);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INPUT_CONTRACT", `${path} must be a valid HTTP(S) URL.`);
  }
  requireCondition(parsed.protocol === "http:" || parsed.protocol === "https:", "INPUT_CONTRACT", `${path} must use HTTP(S).`);
  if (parsed.username || parsed.password || [...parsed.searchParams.keys()].some(isSecretQueryKey)) {
    fail("AUTHENTICATED_URL_FORBIDDEN", `Authenticated URL material is forbidden at ${path}.`);
  }
}

export function validateRequest(input) {
  requireClosed(input, ["schema_version", "prd_sources", "target_urls", "suite_name"], "$");
  requireCondition(input.schema_version === "1.0", "INPUT_CONTRACT", "$.schema_version must be 1.0.");
  requireStringArray(input.prd_sources, "$.prd_sources", { nonEmpty: true, unique: true });
  requireStringArray(input.target_urls, "$.target_urls", { nonEmpty: true, unique: true });
  input.target_urls.forEach((value, index) => validateTargetUrl(value, `$.target_urls[${index}]`));
  if (input.suite_name !== undefined) requireText(input.suite_name, "$.suite_name");
  const normalized = structuredClone(input);
  normalized.suite_name ??= "PRD E2E";
  assertNoSecrets({ ...normalized, target_urls: [] });
  return normalized;
}

function validateRequirements(value, path, kinds) {
  requireClosed(value, ["kind", "requirements"], path);
  requireCondition(kinds.includes(value.kind), "EXECUTION_PROFILE_INCOMPLETE", `${path}.kind is unsupported.`);
  requireStringArray(value.requirements, `${path}.requirements`);
}

function validateCleanup(value, expectedCaseIds) {
  requireClosed(value, ["cases"], "$.business_cleanup");
  requireCondition(Array.isArray(value.cases), "EXECUTION_PROFILE_INCOMPLETE", "$.business_cleanup.cases must be an array.");
  const seen = new Set();
  for (const [index, entry] of value.cases.entries()) {
    const path = `$.business_cleanup.cases[${index}]`;
    requireRecord(entry, path);
    requireText(entry.case_id, `${path}.case_id`, "EXECUTION_PROFILE_INCOMPLETE");
    requireCondition(!seen.has(entry.case_id), "EXECUTION_PROFILE_INCOMPLETE", `${path}.case_id is duplicated.`);
    seen.add(entry.case_id);
    if (entry.disposition === "required") {
      requireClosed(entry, ["case_id", "disposition", "instruction"], path);
      requireText(entry.instruction, `${path}.instruction`, "EXECUTION_PROFILE_INCOMPLETE");
    } else if (entry.disposition === "not_required") {
      requireClosed(entry, ["case_id", "disposition", "reason"], path);
      requireText(entry.reason, `${path}.reason`, "EXECUTION_PROFILE_INCOMPLETE");
    } else {
      fail("EXECUTION_PROFILE_INCOMPLETE", `${path}.disposition is unsupported.`);
    }
  }
  requireCondition(
    seen.size === expectedCaseIds.length && expectedCaseIds.every(caseId => seen.has(caseId)),
    "EXECUTION_PROFILE_INCOMPLETE",
    "Cleanup coverage must exactly match projected Case IDs."
  );
}

export function validateExecutionProfile(input, expectedCaseIds) {
  assertNoSecrets(input);
  requireStringArray(expectedCaseIds, "$expectedCaseIds", { nonEmpty: true, unique: true, code: "EXECUTION_PROFILE_INCOMPLETE" });
  requireClosed(input, ["schema_version", "environment", "execution_scope", "test_data", "evidence_policy", "business_cleanup", "pass_standard"], "$");
  requireCondition(input.schema_version === "1.0", "EXECUTION_PROFILE_INCOMPLETE", "$.schema_version must be 1.0.");

  requireClosed(input.environment, ["classification", "evidence"], "$.environment");
  requireCondition(input.environment.classification === "non-production", "EXECUTION_PROFILE_INCOMPLETE", "Environment must be explicitly non-production.");
  requireText(input.environment.evidence, "$.environment.evidence", "EXECUTION_PROFILE_INCOMPLETE");

  requireClosed(input.execution_scope, ["case_ids"], "$.execution_scope");
  requireStringArray(input.execution_scope.case_ids, "$.execution_scope.case_ids", { nonEmpty: true, unique: true, code: "EXECUTION_PROFILE_INCOMPLETE" });
  requireCondition(sameArray(input.execution_scope.case_ids, expectedCaseIds), "EXECUTION_PROFILE_INCOMPLETE", "Execution scope must exactly match the Runner projection.");

  validateRequirements(input.test_data, "$.test_data", ["case-document", "explicit"]);
  validateRequirements(input.evidence_policy, "$.evidence_policy", ["runner-default", "explicit"]);
  validateCleanup(input.business_cleanup, expectedCaseIds);

  requireClosed(input.pass_standard, ["kind"], "$.pass_standard");
  requireCondition(input.pass_standard.kind === "exact-expected-text", "EXECUTION_PROFILE_INCOMPLETE", "Pass standard must use exact expected text.");
  return structuredClone(input);
}
