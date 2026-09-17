import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { atomicWriteText } from "./atomic-json.mjs";
import { canonicalJsonBytes, sha256Text } from "./digest.mjs";
import { fail, requireCondition } from "./errors.mjs";
import { validateGeneratorHandoff } from "./generator-contract.mjs";
import { assertNoSecrets } from "./secrets.mjs";
import { validateExecutionProfile, validateRequest } from "./contracts.mjs";

function requireText(value, code, message) {
  requireCondition(typeof value === "string" && value.trim().length > 0, code, message);
}

function uniqueMap(items, key, label) {
  requireCondition(Array.isArray(items), "INPUT_CONTRACT", `${label} must be an array.`);
  const map = new Map();
  for (const item of items) {
    const id = item?.[key];
    requireText(id, "INPUT_CONTRACT", `${label} contains a missing ${key}.`);
    requireCondition(!map.has(id), "INPUT_CONTRACT", `${label} contains a duplicate ${key}.`);
    map.set(id, item);
  }
  return map;
}

function mapCase(testCase, moduleName, cleanup, seenStepIds, seenOracleIds) {
  requireCondition(testCase.semantic_status === "Grounded", "CASE_NOT_EXECUTABLE", `Case ${testCase.case_id} is not Grounded.`);
  requireText(testCase.title, "INPUT_CONTRACT", `Case ${testCase.case_id} has no title.`);
  const steps = uniqueMap(testCase.steps, "step_id", `Case ${testCase.case_id} Steps`);
  const grouped = new Map([...steps.keys()].map(stepId => [stepId, []]));

  for (const step of steps.values()) {
    requireCondition(!seenStepIds.has(step.step_id), "INPUT_CONTRACT", `Step ID ${step.step_id} is duplicated.`);
    seenStepIds.add(step.step_id);
    requireText(step.action, "INPUT_CONTRACT", `Step ${step.step_id} has no action.`);
  }

  requireCondition(Array.isArray(testCase.oracles), "INPUT_CONTRACT", `Case ${testCase.case_id} Oracles must be an array.`);
  for (const oracle of testCase.oracles) {
    requireText(oracle?.oracle_id, "INPUT_CONTRACT", `Case ${testCase.case_id} has an Oracle without an ID.`);
    requireCondition(!seenOracleIds.has(oracle.oracle_id), "INPUT_CONTRACT", `Oracle ID ${oracle.oracle_id} is duplicated.`);
    seenOracleIds.add(oracle.oracle_id);
    requireCondition(grouped.has(oracle.observe_after_step_id), "ORACLE_STEP_MISMATCH", `Oracle ${oracle.oracle_id} points to a missing Step.`);
    requireText(oracle.expected, "INPUT_CONTRACT", `Oracle ${oracle.oracle_id} has empty expected text.`);
    requireText(oracle.surface, "INPUT_CONTRACT", `Oracle ${oracle.oracle_id} has no surface.`);
    requireCondition(Array.isArray(oracle.claim_ids), "INPUT_CONTRACT", `Oracle ${oracle.oracle_id} claim IDs are invalid.`);
    grouped.get(oracle.observe_after_step_id).push({
      oracle_id: oracle.oracle_id,
      text: oracle.expected,
      surface: oracle.surface,
      claim_ids: structuredClone(oracle.claim_ids)
    });
  }

  const runnerSteps = [];
  for (const step of steps.values()) {
    const expected = grouped.get(step.step_id);
    requireCondition(expected.length > 0, "STEP_WITHOUT_ORACLE", `Step ${step.step_id} has no Oracle and cannot be converted losslessly.`);
    runnerSteps.push({ step_id: step.step_id, action: step.action, expected });
  }

  requireCondition(Array.isArray(testCase.business_preconditions), "INPUT_CONTRACT", `Case ${testCase.case_id} preconditions are invalid.`);
  const preconditions = testCase.business_preconditions.map((item, index) => {
    requireText(item?.description, "INPUT_CONTRACT", `Case ${testCase.case_id} precondition ${index} is invalid.`);
    return item.description;
  });
  requireCondition(Array.isArray(testCase.data_conditions), "INPUT_CONTRACT", `Case ${testCase.case_id} data conditions are invalid.`);

  return {
    case_id: testCase.case_id,
    module: moduleName,
    title: testCase.title,
    preconditions,
    data_conditions: structuredClone(testCase.data_conditions),
    ...(testCase.test_values !== undefined ? { test_values: structuredClone(testCase.test_values) } : {}),
    cleanup: structuredClone(cleanup),
    steps: runnerSteps
  };
}

export function compileRunnerInput(input) {
  const request = validateRequest(input.request);
  assertNoSecrets(input.generationRef);
  const { reference, projectedCaseIds } = validateGeneratorHandoff(input);
  const profile = validateExecutionProfile(input.executionProfile, projectedCaseIds);

  const casesById = uniqueMap(input.caseDocument.cases, "case_id", "Case Document Cases");
  const modulesById = uniqueMap(input.caseDocument.scope_manifest?.modules, "module_id", "Scope modules");
  const cleanupById = uniqueMap(profile.business_cleanup.cases, "case_id", "Cleanup declarations");
  const seenStepIds = new Set();
  const seenOracleIds = new Set();
  const cases = projectedCaseIds.map(caseId => {
    const testCase = casesById.get(caseId);
    requireCondition(Boolean(testCase), "CASE_NOT_EXECUTABLE", `Projected Case ${caseId} is absent from the Case Document.`);
    const module = modulesById.get(testCase.module_id);
    requireCondition(Boolean(module), "MODULE_NOT_FOUND", `Module ${testCase.module_id} is absent from the scope manifest.`);
    requireText(module.name, "MODULE_NOT_FOUND", `Module ${testCase.module_id} has no name.`);
    return mapCase(testCase, module.name, cleanupById.get(caseId), seenStepIds, seenOracleIds);
  });

  const value = {
    schema_version: "2.0",
    suite: {
      name: request.suite_name,
      target_urls: structuredClone(request.target_urls),
      lineage: {
        case_document_ref: reference,
        case_ids_digest: input.executionPlan.runner_projection.case_ids_digest
      },
      execution: structuredClone(profile)
    },
    cases
  };
  assertNoSecrets(value);
  requireCondition(typeof input.runnerValidator === "function", "INPUT_CONTRACT", "The bundled Runner validator is required.");
  try {
    input.runnerValidator(value);
  } catch {
    fail("INPUT_CONTRACT", "Compiled Runner input was rejected by the bundled Runner validator.");
  }
  const text = canonicalJsonBytes(value);
  return { value, text, sha256: sha256Text(text) };
}

export async function compileAndWriteRunnerInput({ runRoot, ...input }) {
  requireCondition(typeof runRoot === "string" && path.isAbsolute(runRoot), "RUN_INTEGRITY", "Outer Run root must be absolute.");
  const stat = await lstat(runRoot).catch(() => fail("RUN_INTEGRITY", "Outer Run root does not exist."));
  requireCondition(stat.isDirectory() && !stat.isSymbolicLink(), "RUN_INTEGRITY", "Outer Run root is unsafe.");
  const canonicalRoot = await realpath(runRoot);
  requireCondition(canonicalRoot === path.resolve(runRoot), "RUN_INTEGRITY", "Outer Run root must be canonical.");
  const result = compileRunnerInput(input);
  const outputPath = path.join(canonicalRoot, "runner-input.json");
  const existing = await lstat(outputPath).catch(error => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (existing) {
    requireCondition(existing.isFile() && !existing.isSymbolicLink(), "RUN_INTEGRITY", "Existing Runner input is unsafe.");
    requireCondition(await realpath(outputPath) === outputPath, "RUN_INTEGRITY", "Existing Runner input path is not canonical.");
    const existingText = await readFile(outputPath, "utf8");
    requireCondition(existingText === result.text, "NEW_RUN_REQUIRED", "Existing Runner input differs from the deterministic recompilation.");
    return { ...result, path: outputPath, reused: true };
  }
  await atomicWriteText(outputPath, result.text);
  return { ...result, path: outputPath, reused: false };
}
