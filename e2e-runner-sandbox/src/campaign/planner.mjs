import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { CODEX_ADAPTER, TOOL_MAPPING_VERSION } from "../host-evidence/contracts.mjs";
import { METRIC_DERIVER_VERSION } from "../host-evidence/derive-metrics.mjs";
import { SandboxError } from "../shared/errors.mjs";

const CALIBRATION_UNITS = Object.freeze([
  ["H01", "H01-R1"], ["B01", "B01-R1"], ["B02", "B02-R1"],
  ["B09", "B09-R1"], ["B11", "B11-R1"], ["B12", "B12-R1"]
]);

function digest(value) {
  const safe = JSON.parse(JSON.stringify(value));
  return `sha256:${sha256Text(canonicalStringify(safe))}`;
}

function fail(code, message) {
  throw new SandboxError(code, message);
}

function componentDigests(bundle) {
  return {
    bundle: digest({ version: bundle.bundleVersion, digests: bundle.digests }),
    classifier: digest(bundle.hostTraceClassifier),
    metricDeriver: digest(METRIC_DERIVER_VERSION),
    scoring: digest(bundle.scoring)
  };
}

function hostEvidenceContract(options = {}) {
  return {
    adapter: structuredClone(options.adapter ?? CODEX_ADAPTER),
    mappingVersion: options.mappingVersion ?? TOOL_MAPPING_VERSION,
    metricDeriverVersion: options.metricDeriverVersion ?? METRIC_DERIVER_VERSION
  };
}

function finalizePlan(plan) {
  return { ...plan, planDigest: digest(plan) };
}

function validateRunner(runner) {
  if (!runner || typeof runner.version !== "string" || !/^sha256:[a-f0-9]{64}$/.test(runner.digest)) {
    fail("CAMPAIGN_SOURCE_MISMATCH", "Runner version and digest are required");
  }
}

function unitsFromBundle(bundle, references) {
  return references.map(([profileId, unitId]) => {
    const unit = bundle.executionMatrix.units.find((candidate) => candidate.unitId === unitId);
    if (!unit || unit.profileId !== profileId) {
      fail("CAMPAIGN_SOURCE_MISMATCH", "Campaign definition references a missing immutable execution unit");
    }
    return structuredClone(unit);
  });
}

export function createCalibrationPlan(input) {
  validateRunner(input.runner);
  const actual = input.definition?.units?.map(({ profileId, unitId }) => [profileId, unitId]);
  if (input.definition?.version !== "calibration-v1" ||
    canonicalStringify(actual ?? []) !== canonicalStringify(CALIBRATION_UNITS)) {
    fail("CAMPAIGN_SOURCE_MISMATCH", "Calibration definition is not the fixed calibration-v1 set");
  }
  return finalizePlan({
    schemaVersion: "campaign-plan-v1",
    kind: "calibration",
    planVersion: "calibration-v1",
    definitionDigest: digest(input.definition),
    campaignId: input.campaignId,
    createdAt: input.createdAt,
    runner: structuredClone(input.runner),
    bundleVersion: input.bundle.bundleVersion,
    componentDigests: componentDigests(input.bundle),
    hostEvidence: hostEvidenceContract(input.hostEvidence),
    units: unitsFromBundle(input.bundle, CALIBRATION_UNITS)
  });
}

function same(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

export function createReleasePlan(input) {
  validateRunner(input.runner);
  const expectedComponents = componentDigests(input.bundle);
  const expectedHost = hostEvidenceContract(input.hostEvidence);
  const calibration = input.calibrationSummary;
  const { summaryDigest, ...calibrationBody } = calibration ?? {};
  if (!calibration || calibration.kind !== "calibration" || calibration.conclusion !== "pass" ||
    !same(calibration.runner, input.runner) ||
    calibration.bundleVersion !== input.bundle.bundleVersion ||
    !same(calibration.componentDigests, expectedComponents) ||
    !same(calibration.hostEvidence, expectedHost) ||
    !/^sha256:[a-f0-9]{64}$/.test(summaryDigest ?? "") || summaryDigest !== digest(calibrationBody)) {
    fail("CALIBRATION_REQUIRED", "A matching passing calibration is required before Release Matrix creation");
  }
  return finalizePlan({
    schemaVersion: "campaign-plan-v1",
    kind: "release",
    planVersion: `release-matrix-${input.bundle.executionMatrix.version}`,
    campaignId: input.campaignId,
    createdAt: input.createdAt,
    runner: structuredClone(input.runner),
    bundleVersion: input.bundle.bundleVersion,
    componentDigests: expectedComponents,
    hostEvidence: expectedHost,
    calibration: {
      campaignId: calibration.campaignId,
      summaryDigest: calibration.summaryDigest
    },
    units: structuredClone(input.bundle.executionMatrix.units)
  });
}

export function nextCampaignUnit(plan, trials) {
  const completed = new Set(trials.map((entry) => entry.manifest?.unitId ?? entry.unitId));
  return plan.units.find(({ unitId }) => !completed.has(unitId)) ?? null;
}

export function campaignStatus(plan, trials) {
  const counts = { completed: 0, failed: 0, invalid: 0, blocked: 0, remaining: 0 };
  const byUnit = new Map(trials.map((entry) => [entry.manifest?.unitId ?? entry.unitId, entry]));
  for (const unit of plan.units) {
    const trial = byUnit.get(unit.unitId);
    if (!trial) counts.remaining += 1;
    else if ((trial.manifest?.state ?? trial.state) === "completed") counts.completed += 1;
    else if ((trial.manifest?.state ?? trial.state) === "blocked") counts.blocked += 1;
    else if ((trial.manifest?.state ?? trial.state) === "invalid") counts.invalid += 1;
    else counts.failed += 1;
  }
  return { campaignId: plan.campaignId, planned: plan.units.length, ...counts, next: nextCampaignUnit(plan, trials) };
}
