import {
  ASSERTION_STATES,
  ATTRIBUTION_CLASSES,
  CASE_VERDICTS,
  EVENT_TYPES
} from "../shared/constants.mjs";
import { SandboxError } from "../shared/errors.mjs";

function sameMembers(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((item) => actual.includes(item))
  );
}

function fail(reason) {
  throw new SandboxError("BUNDLE_INVALID", "Benchmark bundle validation failed", {
    reason
  });
}

function requireUnique(values, label) {
  if (values.some((value) => typeof value !== "string") || new Set(values).size !== values.length) {
    fail(`${label} identifiers must be unique strings`);
  }
}

function validateDependencyGraph(cases, profileId) {
  const caseIds = cases.map(({ caseId }) => caseId);
  const known = new Set(caseIds);
  const dependencies = new Map(cases.map(({ caseId, dependsOn }) => [caseId, dependsOn ?? []]));
  for (const [caseId, dependsOn] of dependencies) {
    if (!Array.isArray(dependsOn) || dependsOn.some((dependency) => !known.has(dependency))) {
      fail(`${profileId} case ${caseId} has an unresolved dependency`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (caseId) => {
    if (visiting.has(caseId)) fail(`${profileId} dependency graph is cyclic`);
    if (visited.has(caseId)) return;
    visiting.add(caseId);
    for (const dependency of dependencies.get(caseId)) visit(dependency);
    visiting.delete(caseId);
    visited.add(caseId);
  };
  for (const caseId of caseIds) visit(caseId);
}

function verdictMatchesStates(verdict, states) {
  if (verdict === "Passed") return states.length > 0 && states.every((state) => state === "verified-pass");
  if (verdict === "Failed") return states.includes("verified-fail");
  if (verdict === "Inconclusive") return states.includes("unverified") && !states.includes("verified-fail");
  if (verdict === "Not Run") return states.length > 0 && states.every((state) => state === "not-run");
  return false;
}

function validateProfile(profile) {
  const id = profile.profileId;
  if (!profile.runnerInput || !profile.oracle || !profile.assistance || !profile.fixture) {
    fail(`${id} is missing a joined corpus component`);
  }
  if (profile.runnerInput.planId !== profile.oracle.planId || profile.oracle.profileId !== id) {
    fail(`${id} plan and Oracle references disagree`);
  }
  const cases = profile.runnerInput.cases;
  if (!Array.isArray(cases) || cases.length === 0) fail(`${id} must contain cases`);
  requireUnique(cases.map(({ caseId }) => caseId), `${id} case`);
  validateDependencyGraph(cases, id);
  const stepIds = cases.flatMap(({ steps }) => (steps ?? []).map(({ stepId }) => stepId));
  const assertionIds = cases.flatMap(({ assertions }) => (assertions ?? []).map(({ assertionId }) => assertionId));
  requireUnique(stepIds, `${id} step`);
  requireUnique(assertionIds, `${id} assertion`);
  if (stepIds.length === 0 || assertionIds.length === 0) fail(`${id} cases require steps and assertions`);

  const oracleAssertions = new Map(profile.oracle.assertions?.map((entry) => [entry.assertionId, entry]));
  if (oracleAssertions.size !== assertionIds.length || assertionIds.some((assertionId) => !oracleAssertions.has(assertionId))) {
    fail(`${id} Oracle assertions must exactly cover Runner assertions`);
  }
  const verdicts = new Map(profile.oracle.expectedCaseVerdicts?.map((entry) => [entry.caseId, entry.verdict]));
  if (verdicts.size !== cases.length) fail(`${id} Oracle verdicts must exactly cover cases`);
  for (const caseEntry of cases) {
    const states = caseEntry.assertions.map(({ assertionId }) => oracleAssertions.get(assertionId).expectedState);
    if (!verdictMatchesStates(verdicts.get(caseEntry.caseId), states)) {
      fail(`${id} case verdict contradicts its assertion states`);
    }
  }
  if (!sameMembers(profile.runnerInput.runIdPointers, profile.oracle.runIdPointers)) {
    fail(`${id} runId substitution pointers disagree`);
  }
  if (!ATTRIBUTION_CLASSES.includes(profile.oracle.expectedAttribution)) {
    fail(`${id} attribution is outside the closed taxonomy`);
  }
  if (!Array.isArray(profile.oracle.expectedEvents) || profile.oracle.expectedEvents.some(
    (event) => !EVENT_TYPES.includes(event.type) || !Number.isInteger(event.count) || event.count < 0
  )) fail(`${id} expected events are invalid`);
  const eventIds = profile.oracle.expectedEvents.map(({ checkId }) => checkId);
  requireUnique(eventIds, `${id} event check`);
  const eventIdSet = new Set(eventIds);
  if (profile.oracle.expectedEvents.some(({ after }) => !Array.isArray(after) || after.some((value) => !eventIdSet.has(value)))) {
    fail(`${id} event partial order is unresolved`);
  }
  if (!Array.isArray(profile.oracle.allowedMutations) || profile.oracle.allowedMutations.some(
    (rule) => !["create", "update", "delete"].includes(rule.operation) || !Number.isInteger(rule.maxCount) || rule.maxCount < 1
  )) fail(`${id} mutation whitelist is invalid`);
  if (!profile.oracle.budgets || profile.oracle.budgets.activeElapsedMs <= 0) fail(`${id} budgets are invalid`);
  if (profile.assistance.profileId !== id || profile.assistance.events.some(
    (event) => !event.trigger || !event.action || !Number.isInteger(event.deadlineMs) || event.deadlineMs <= 0
  )) fail(`${id} assistance script is invalid`);
  if (Object.values(profile.componentDigests ?? {}).some((digest) => !/^[a-f0-9]{64}$/.test(digest ?? ""))) {
    fail(`${id} component digest reference is missing`);
  }
}

function validateExecutionMatrix(bundle) {
  const profileIds = new Set(bundle.profiles.map(({ profileId }) => profileId));
  const units = bundle.executionMatrix?.units;
  if (!Array.isArray(units)) fail("execution matrix units are required");
  requireUnique(units.map(({ unitId }) => unitId), "execution unit");
  for (const unit of units) {
    if (!profileIds.has(unit.profileId) || !["northstar", "harbor"].includes(unit.uiVariant)) {
      fail("execution matrix contains an unknown profile or UI variant");
    }
    if (!Number.isInteger(unit.repetition) || unit.repetition < 1 || unit.repetition > 5) {
      fail("execution matrix repetition is invalid");
    }
  }
  for (const profileId of profileIds) {
    const repetitions = units.filter((unit) => unit.profileId === profileId).map(({ repetition }) => repetition).sort();
    if (JSON.stringify(repetitions) !== JSON.stringify([1, 2, 3, 4, 5])) {
      fail(`${profileId} must have five precommitted release repetitions`);
    }
  }
}

export function validateBundle(bundle) {
  if (!bundle || typeof bundle !== "object") fail("bundle must be an object");
  if (!/^v[1-9][0-9]*$/.test(bundle.bundleVersion ?? "")) {
    fail("bundleVersion must use vN form");
  }
  if (!sameMembers(bundle.contracts?.eventTypes, EVENT_TYPES)) {
    fail("event taxonomy differs from contract version 1");
  }
  if (!sameMembers(bundle.contracts?.attributionClasses, ATTRIBUTION_CLASSES)) {
    fail("attribution classes differ from contract version 1");
  }
  if (!sameMembers(bundle.contracts?.assertionStates, ASSERTION_STATES)) {
    fail("assertion states differ from contract version 1");
  }
  if (!sameMembers(bundle.contracts?.caseVerdicts, CASE_VERDICTS)) {
    fail("case verdicts differ from contract version 1");
  }

  const weightValues = Object.values(bundle.scoring?.weights ?? {});
  if (
    weightValues.length !== 6 ||
    weightValues.some((value) => !Number.isInteger(value) || value < 0) ||
    weightValues.reduce((sum, value) => sum + value, 0) !== 100
  ) {
    fail("scoring weights must contain six integer categories totaling 100");
  }
  if (!Array.isArray(bundle.scoring?.hardGates) || bundle.scoring.hardGates.length !== 10) {
    fail("the v1 scoring contract requires ten hard gates");
  }
  if (new Set(bundle.scoring.hardGates).size !== bundle.scoring.hardGates.length) {
    fail("hard gate identifiers must be unique");
  }
  if (!Array.isArray(bundle.profiles)) fail("profiles must be an array");
  if (!Array.isArray(bundle.hostTraceClassifier?.classes)) {
    fail("host trace classifier classes are required");
  }
  requireUnique(bundle.profiles.map(({ profileId }) => profileId), "profile");
  for (const profile of bundle.profiles) validateProfile(profile);
  if (bundle.profiles.length > 0) validateExecutionMatrix(bundle);
  return { valid: true };
}
