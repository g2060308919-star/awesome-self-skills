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
  return { valid: true };
}
