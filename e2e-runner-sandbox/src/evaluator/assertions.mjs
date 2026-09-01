import { canonicalStringify } from "../bundle/canonical-json.mjs";

function mismatch(check, message, details = {}) {
  return { check, message, ...details };
}

export function evaluateVerdicts(oracle, executionLog) {
  const mismatches = [];
  const actualCases = new Map((executionLog.cases ?? []).map((entry) => [entry.caseId, entry]));
  const expectedAssertions = new Map(oracle.assertions.map((entry) => [entry.assertionId, entry]));
  let exactVerdicts = 0;
  for (const expectedCase of oracle.expectedCaseVerdicts) {
    const actual = actualCases.get(expectedCase.caseId);
    if (!actual) {
      mismatches.push(mismatch("case-present", `Missing case ${expectedCase.caseId}`));
      continue;
    }
    if (actual.verdict === expectedCase.verdict) exactVerdicts += 1;
    else mismatches.push(mismatch("case-verdict", `Case ${expectedCase.caseId} verdict differs`, {
      expected: expectedCase.verdict, actual: actual.verdict
    }));
    if (actual.attribution !== oracle.expectedAttribution) {
      mismatches.push(mismatch("attribution", `Case ${expectedCase.caseId} attribution differs`, {
        expected: oracle.expectedAttribution, actual: actual.attribution
      }));
    }
  }
  const actualAssertions = new Map((executionLog.cases ?? []).flatMap((caseEntry) =>
    (caseEntry.assertions ?? []).map((entry) => [entry.assertionId, entry])
  ));
  for (const [assertionId, expected] of expectedAssertions) {
    const actual = actualAssertions.get(assertionId);
    if (!actual) mismatches.push(mismatch("assertion-present", `Missing assertion ${assertionId}`));
    else if (actual.state !== expected.expectedState) mismatches.push(mismatch(
      "assertion-state", `Assertion ${assertionId} state differs`,
      { expected: expected.expectedState, actual: actual.state }
    ));
  }
  for (const assertionId of actualAssertions.keys()) {
    if (!expectedAssertions.has(assertionId)) {
      mismatches.push(mismatch("assertion-undeclared", `Undeclared assertion ${assertionId}`));
    }
  }
  return { passed: mismatches.length === 0, mismatches, exactVerdicts, expectedVerdicts: oracle.expectedCaseVerdicts.length };
}

function mutationMatchesRule(event, rule) {
  const target = rule.target === "created" ? !String(event.targetId ?? "").startsWith("CUS-") || !/CUS-10\d{2}/.test(event.targetId)
    : rule.target === "*" || event.targetId === rule.target;
  const field = rule.field === "*" || String(event.field ?? "").split(",").includes(rule.field);
  const logicalOperation = !rule.logicalOperation || event.logicalOperation === rule.logicalOperation;
  return event.entity === rule.entity && event.operation === rule.operation && target && field && logicalOperation;
}

function valueEqual(left, right) {
  if (left === undefined || right === undefined) return left === right;
  return canonicalStringify(left) === canonicalStringify(right);
}

function containsSubset(actual, expected) {
  if (!expected || typeof expected !== "object" || Array.isArray(expected)) return valueEqual(actual, expected);
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) return false;
  return Object.entries(expected).every(([key, value]) => containsSubset(actual[key], value));
}

function diffMatches(expected, actual, oracle) {
  if (expected.pointer) {
    return actual.pointer === expected.pointer && valueEqual(actual.before, expected.before) && valueEqual(actual.after, expected.after);
  }
  if (!expected.targetAlias) return false;
  const [entity, target] = expected.targetAlias.split(":");
  const collection = `${entity}s`;
  const match = actual.pointer?.match(new RegExp(`^/${collection}/([^/]+)$`));
  if (!match || target !== "created") return false;
  const allowed = oracle.allowedMutations.some((rule) =>
    rule.entity === entity && rule.target === "created" && match[1]
  );
  const change = actual.before === undefined ? "added" : actual.after === undefined ? "removed" : "updated";
  return allowed && change === expected.change && containsSubset(actual.after, expected.after ?? {});
}

function compareDiffs(expected, actual, oracle) {
  if (!Array.isArray(actual) || expected.length !== actual.length) return false;
  const unused = [...actual];
  for (const expectation of expected) {
    const index = unused.findIndex((change) => diffMatches(expectation, change, oracle));
    if (index < 0) return false;
    unused.splice(index, 1);
  }
  return unused.length === 0;
}

export function evaluateBusinessTruth(oracle, input) {
  const mismatches = [];
  const actualDiff = input.snapshot?.diff ?? input.snapshot?.changes ?? input.snapshot ?? [];
  if (!compareDiffs(oracle.expectedDiff, actualDiff, oracle)) {
    mismatches.push(mismatch("state-diff", "Canonical post-state diff differs"));
  }
  const mutations = input.events.filter((event) => event.type === "state_mutation");
  for (const mutation of mutations) {
    if (!oracle.allowedMutations.some((rule) => mutationMatchesRule(mutation, rule))) {
      mismatches.push(mismatch("mutation-whitelist", "Observed mutation is outside the Oracle whitelist", { mutation }));
    }
  }
  for (const rule of oracle.allowedMutations) {
    const count = mutations.filter((event) => mutationMatchesRule(event, rule)).length;
    if (count > rule.maxCount) mismatches.push(mismatch("mutation-duplicate", "Mutation count exceeds allowance", { rule, count }));
  }
  const expectedByType = new Map();
  for (const expected of oracle.expectedEvents) {
    expectedByType.set(expected.type, (expectedByType.get(expected.type) ?? 0) + expected.count);
  }
  for (const [type, count] of expectedByType) {
    const actual = input.events.filter((event) => event.type === type).length;
    if (actual !== count) mismatches.push(mismatch("event-count", `Event count differs for ${type}`, { expected: count, actual }));
  }
  const expectedSequence = oracle.expectedEvents.flatMap((event) => Array(event.count).fill(event.type));
  const actualSequence = input.events.filter((event) => expectedByType.has(event.type)).map((event) => event.type);
  if (!valueEqual(actualSequence, expectedSequence)) {
    mismatches.push(mismatch("event-order", "Required event partial order differs"));
  }
  const expectedOutbox = oracle.expectedOutbox.reduce((sum, entry) => sum + entry.count, 0);
  if (input.outbox.length !== expectedOutbox) {
    mismatches.push(mismatch("outbox-count", "Notification outbox count differs", { expected: expectedOutbox, actual: input.outbox.length }));
  }
  for (const expectation of oracle.expectedOutbox) {
    const actual = input.outbox.filter((entry) => !expectation.kind || entry.kind === expectation.kind).length;
    if (actual !== expectation.count) {
      mismatches.push(mismatch("outbox-kind", `Outbox kind differs for ${expectation.kind}`, {
        expected: expectation.count, actual
      }));
    }
  }
  if (oracle.faultConsumption) {
    if (!input.fault || input.fault.triggered !== oracle.faultConsumption.triggered || input.fault.consumed !== oracle.faultConsumption.consumed) {
      mismatches.push(mismatch("fault-consumption", "Fault trigger or consumption state differs"));
    }
  }
  const logCase = input.executionLog.cases.at(-1);
  if (oracle.cleanup.required && logCase?.cleanup?.outcome !== oracle.cleanup.outcome) {
    mismatches.push(mismatch("cleanup", "Required cleanup outcome differs"));
  }
  return { passed: mismatches.length === 0, mismatches, mutations };
}

export function evaluateArtifactConsistency(oracle, artifacts) {
  const mismatches = [];
  const log = artifacts.executionLog;
  if (log.planId !== oracle.planId || log.profileId !== oracle.profileId) {
    mismatches.push(mismatch("artifact-identity", "Artifact plan or profile identifier differs"));
  }
  for (const expectedCase of oracle.expectedCaseVerdicts) {
    if (!artifacts.report.includes(expectedCase.caseId) || !artifacts.report.includes(expectedCase.verdict)) {
      mismatches.push(mismatch("report-case", `Report omits case outcome ${expectedCase.caseId}`));
    }
  }
  for (const expected of oracle.assertions) {
    if (!artifacts.report.includes(expected.assertionId) || !artifacts.report.includes(expected.expectedState)) {
      mismatches.push(mismatch("report-assertion", `Report omits assertion outcome ${expected.assertionId}`));
    }
  }
  for (const caseEntry of log.cases) {
    for (const assertion of caseEntry.assertions ?? []) {
      if (assertion.expected === undefined || assertion.actual === undefined) {
        mismatches.push(mismatch("assertion-facts", `Assertion ${assertion.assertionId} lacks expected/actual facts`));
      }
      for (const fact of [assertion.expected, assertion.actual]) {
        if (fact !== undefined && !artifacts.report.includes(String(fact))) {
          mismatches.push(mismatch("report-facts", `Report omits a material fact for ${assertion.assertionId}`));
        }
      }
      for (const evidencePath of assertion.evidence ?? []) {
        if (!artifacts.report.includes(evidencePath)) {
          mismatches.push(mismatch("report-evidence", `Report omits evidence target ${evidencePath}`));
        }
      }
    }
    if (caseEntry.cleanup?.outcome && !artifacts.report.includes(caseEntry.cleanup.outcome)) {
      mismatches.push(mismatch("report-cleanup", `Report omits cleanup outcome for ${caseEntry.caseId}`));
    }
    for (const residual of caseEntry.cleanup?.residualRecords ?? []) {
      const stableId = typeof residual === "string" ? residual : residual.id;
      if (stableId && !artifacts.report.includes(stableId)) {
        mismatches.push(mismatch("report-residual", `Report omits residual record ${stableId}`));
      }
    }
  }
  if (oracle.expectedOrder?.length) {
    const actualOrder = (log.timeline ?? []).map((entry) => typeof entry === "string" ? entry : entry.label);
    if (!valueEqual(actualOrder, oracle.expectedOrder)) {
      mismatches.push(mismatch("execution-order", "Declared dependency and resume order differs"));
    }
  }
  return { passed: mismatches.length === 0, mismatches };
}

export function evaluateAssistance(assistanceScript, assistanceLog) {
  const mismatches = [];
  const log = assistanceLog ?? [];
  const actual = new Map(log.map((entry) => [entry.eventId, entry]));
  if (actual.size !== log.length) mismatches.push(mismatch("assistance-duplicate", "Assistance log contains duplicate event IDs"));
  for (const expected of assistanceScript.events ?? []) {
    const observed = actual.get(expected.eventId);
    if (!observed) mismatches.push(mismatch("assistance-missing", `Missing assistance event ${expected.eventId}`));
    else if (
      observed.trigger !== expected.trigger || observed.reply !== expected.reply || observed.action !== expected.action ||
      observed.provenance !== expected.provenance || observed.elapsedMs > expected.deadlineMs
    ) mismatches.push(mismatch("assistance-mismatch", `Assistance event ${expected.eventId} differs`));
  }
  const expectedIds = (assistanceScript.events ?? []).map(({ eventId }) => eventId);
  const actualIds = log.map(({ eventId }) => eventId);
  if (!valueEqual(actualIds, expectedIds)) mismatches.push(mismatch("assistance-order", "Assistance event order differs"));
  return { passed: mismatches.length === 0, mismatches };
}
