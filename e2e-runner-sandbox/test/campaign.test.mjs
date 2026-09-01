import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import {
  aggregateCalibration,
  aggregateReleaseCampaign
} from "../src/campaign/aggregate.mjs";
import {
  createCalibrationPlan,
  createReleasePlan,
  nextCampaignUnit
} from "../src/campaign/planner.mjs";
import { renderCampaignMarkdown } from "../src/campaign/report.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runner = { version: "runner-1.0.0", digest: `sha256:${"a".repeat(64)}` };
const navigationNotApplicable = new Set(["B08-preflight", "B15-production", "B15-unresolved", "H02"]);
const collaborationNotApplicable = new Set(["B08-preflight", "B15-production", "B15-unresolved", "H02"]);

async function loaded() {
  const [bundle, definition] = await Promise.all([
    loadBundle(join(packageRoot, "benchmark"), "v1"),
    readFile(join(packageRoot, "config", "calibration-v1.json"), "utf8").then(JSON.parse)
  ]);
  return { bundle, definition };
}

function evaluation(unit, overrides = {}) {
  return {
    profileId: unit.profileId,
    unitId: unit.unitId,
    eligible: true,
    score: 100,
    diagnosticScore: 100,
    releaseDecision: "pass",
    gateFailures: [],
    completeOraclePassed: true,
    excludeFromNumericScoring: unit.excludedFromNumericScoring,
    checks: {
      verdictAttribution: { applicable: true, passed: true },
      stateAction: { applicable: true, passed: true },
      navigation: { applicable: !navigationNotApplicable.has(unit.profileId), passed: true },
      collaboration: { applicable: !collaborationNotApplicable.has(unit.profileId), passed: true },
      artifact: { applicable: true, passed: true },
      stabilityEfficiency: { applicable: true, passed: true }
    },
    outcomeSignature: `signature-${unit.profileId}`,
    repetitionGroup: `group-${unit.profileId}`,
    aggregate: {
      exactVerdicts: 1, expectedVerdicts: 1,
      falsePassedInjectedFailures: 0,
      faultExpected: unit.profileId.startsWith("B0") ? 1 : 0,
      faultCorrect: unit.profileId.startsWith("B0") ? 1 : 0,
      artifactRequired: 1, artifactConsistent: 1
    },
    responsibilityDomains: [],
    ...overrides
  };
}

function trial(plan, unit, index, overrides = {}) {
  const trialId = `trial-${unit.unitId}`;
  const sessionDigest = `sha256:${String(index + 1).padStart(64, "0")}`;
  const runId = `run-${unit.unitId}`;
  return {
    manifest: {
      schemaVersion: "trial-manifest-v1",
      campaignId: plan.campaignId,
      trialId,
      unitId: unit.unitId,
      profileId: unit.profileId,
      runId,
      state: "completed",
      runner: plan.runner,
      bundleVersion: plan.bundleVersion,
      componentDigests: plan.componentDigests,
      hostEvidence: {
        trustLevel: "host-native",
        sessionDigest,
        sourceManifestDigest: `sha256:${String(index + 1001).padStart(64, "0")}`,
        normalizedEventsDigest: `sha256:${String(index + 2001).padStart(64, "0")}`,
        adapter: plan.hostEvidence.adapter,
        mappingVersion: plan.hostEvidence.mappingVersion
      },
      artifacts: {
        root: `/runner-exchange/${trialId}/artifacts`,
        digest: `sha256:${String(index + 3001).padStart(64, "0")}`
      },
      reset: { succeeded: true, epoch: index + 2 },
      releaseEligibility: { eligible: true, reasons: [] },
      assistanceMarks: unit.profileId === "B12" ? [{ action: "manual-relogin", provenance: "evaluator" }] : []
    },
    evaluation: {
      ...evaluation(unit),
      trialId,
      runId,
      unitId: unit.unitId,
      runner: plan.runner,
      bundleVersion: plan.bundleVersion,
      componentDigests: plan.componentDigests,
      hostEvidence: {
        trustLevel: "host-native",
        releaseEligibility: { eligible: true, reasons: [] },
        sessionDigest,
        sourceManifestDigest: `sha256:${String(index + 1001).padStart(64, "0")}`,
        normalizedEventsDigest: `sha256:${String(index + 2001).padStart(64, "0")}`
      }
    },
    ...overrides
  };
}

test("calibration-v1 locks exactly the six representative precommitted units", async () => {
  const { bundle, definition } = await loaded();
  const plan = createCalibrationPlan({
    bundle, definition, runner, campaignId: "calibration-001",
    createdAt: "2026-09-01T01:00:00.000Z"
  });
  assert.equal(plan.kind, "calibration");
  assert.deepEqual(plan.units.map(({ unitId }) => unitId), [
    "H01-R1", "B01-R1", "B02-R1", "B09-R1", "B11-R1", "B12-R1"
  ]);
  assert.match(plan.planDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(nextCampaignUnit(plan, []).unitId, "H01-R1");
});

test("calibration passes only when all six native Trials complete, qualify, and reset", async () => {
  const { bundle, definition } = await loaded();
  const plan = createCalibrationPlan({ bundle, definition, runner, campaignId: "calibration-001", createdAt: "2026-09-01T01:00:00.000Z" });
  const trials = plan.units.map((unit, index) => trial(plan, unit, index));
  const passed = aggregateCalibration({ plan, trials, bundle });
  assert.equal(passed.conclusion, "pass");
  assert.equal(passed.completedUnits, 6);
  assert.match(passed.summaryDigest, /^sha256:[a-f0-9]{64}$/);

  const incomplete = aggregateCalibration({ plan, trials: trials.slice(0, 5), bundle });
  assert.equal(incomplete.conclusion, "incomplete");
  assert.ok(incomplete.failures.some(({ code }) => code === "CAMPAIGN_INCOMPLETE"));

  const untrusted = structuredClone(trials);
  untrusted[0].manifest.hostEvidence.trustLevel = "recorded-fixture";
  untrusted[0].evaluation.hostEvidence.trustLevel = "recorded-fixture";
  const failed = aggregateCalibration({ plan, trials: untrusted, bundle });
  assert.equal(failed.conclusion, "fail");
  assert.ok(failed.failures.some(({ domain }) => domain === "host-evidence"));
});

test("Release plan is gated by a matching passing calibration", async () => {
  const { bundle, definition } = await loaded();
  const calibrationPlan = createCalibrationPlan({ bundle, definition, runner, campaignId: "calibration-001", createdAt: "2026-09-01T01:00:00.000Z" });
  const calibration = aggregateCalibration({
    plan: calibrationPlan,
    trials: calibrationPlan.units.map((unit, index) => trial(calibrationPlan, unit, index)),
    bundle
  });
  const release = createReleasePlan({
    bundle, runner, calibrationSummary: calibration,
    campaignId: "release-001", createdAt: "2026-09-01T02:00:00.000Z"
  });
  assert.equal(release.units.length, bundle.executionMatrix.units.length);
  assert.equal(release.units.length, 130);
  assert.equal(release.calibration.summaryDigest, calibration.summaryDigest);

  assert.throws(() => createReleasePlan({
    bundle, runner, calibrationSummary: { ...calibration, conclusion: "fail" },
    campaignId: "release-bad", createdAt: "2026-09-01T02:00:00.000Z"
  }), { code: "CALIBRATION_REQUIRED" });
});

test("complete consistent Release Matrix aggregates to a passing decision and matching Markdown", async () => {
  const { bundle, definition } = await loaded();
  const calibrationPlan = createCalibrationPlan({ bundle, definition, runner, campaignId: "calibration-001", createdAt: "2026-09-01T01:00:00.000Z" });
  const calibration = aggregateCalibration({ plan: calibrationPlan, trials: calibrationPlan.units.map((unit, index) => trial(calibrationPlan, unit, index)), bundle });
  const plan = createReleasePlan({ bundle, runner, calibrationSummary: calibration, campaignId: "release-001", createdAt: "2026-09-01T02:00:00.000Z" });
  const trials = plan.units.map((unit, index) => trial(plan, unit, index));
  const summary = aggregateReleaseCampaign({ plan, trials, bundle });
  const markdown = renderCampaignMarkdown(summary);

  assert.equal(summary.conclusion, "pass");
  assert.equal(summary.completedUnits, 130);
  assert.equal(summary.aggregate.score, 100);
  assert.match(markdown, /Decision: pass/);
  assert.match(markdown, /130 \/ 130/);
  assert.match(markdown, /100(?:\.0)?/);
});

test("Release aggregation identifies missing, duplicate, mixed-source, reused, and untrusted Trials", async () => {
  const { bundle, definition } = await loaded();
  const calibrationPlan = createCalibrationPlan({ bundle, definition, runner, campaignId: "calibration-001", createdAt: "2026-09-01T01:00:00.000Z" });
  const calibration = aggregateCalibration({ plan: calibrationPlan, trials: calibrationPlan.units.map((unit, index) => trial(calibrationPlan, unit, index)), bundle });
  const plan = createReleasePlan({ bundle, runner, calibrationSummary: calibration, campaignId: "release-001", createdAt: "2026-09-01T02:00:00.000Z" });
  const trials = plan.units.map((unit, index) => trial(plan, unit, index));

  const missing = aggregateReleaseCampaign({ plan, trials: trials.slice(1), bundle });
  assert.equal(missing.conclusion, "incomplete");
  assert.ok(missing.failures.some(({ code }) => code === "CAMPAIGN_INCOMPLETE"));
  assert.throws(() => aggregateReleaseCampaign({ plan, trials: [...trials, trials[0]], bundle }), {
    code: "CAMPAIGN_DUPLICATE_UNIT"
  });

  const mixed = structuredClone(trials);
  mixed[0].manifest.componentDigests.scoring = `sha256:${"f".repeat(64)}`;
  assert.throws(() => aggregateReleaseCampaign({ plan, trials: mixed, bundle }), {
    code: "CAMPAIGN_SOURCE_MISMATCH"
  });

  const reused = structuredClone(trials);
  reused[1].manifest.hostEvidence.sessionDigest = reused[0].manifest.hostEvidence.sessionDigest;
  reused[1].evaluation.hostEvidence.sessionDigest = reused[0].evaluation.hostEvidence.sessionDigest;
  assert.throws(() => aggregateReleaseCampaign({ plan, trials: reused, bundle }), {
    code: "CAMPAIGN_SOURCE_MISMATCH"
  });

  const untrusted = structuredClone(trials);
  untrusted[0].manifest.hostEvidence.trustLevel = "operator-attested";
  untrusted[0].evaluation.hostEvidence.trustLevel = "operator-attested";
  untrusted[0].evaluation.eligible = false;
  const ineligible = aggregateReleaseCampaign({ plan, trials: untrusted, bundle });
  assert.equal(ineligible.conclusion, "ineligible");
  assert.ok(ineligible.failures.some(({ domain }) => domain === "host-evidence"));
});

test("non-modal outcomes above the matrix threshold cause a flake-driven release failure", async () => {
  const { bundle, definition } = await loaded();
  const calibrationPlan = createCalibrationPlan({ bundle, definition, runner, campaignId: "calibration-001", createdAt: "2026-09-01T01:00:00.000Z" });
  const calibration = aggregateCalibration({ plan: calibrationPlan, trials: calibrationPlan.units.map((unit, index) => trial(calibrationPlan, unit, index)), bundle });
  const plan = createReleasePlan({ bundle, runner, calibrationSummary: calibration, campaignId: "release-001", createdAt: "2026-09-01T02:00:00.000Z" });
  const trials = plan.units.map((unit, index) => trial(plan, unit, index));
  const flakyProfiles = new Set(["B01", "B02", "B03", "B04", "B05-reachable", "B05-unavailable", "B06"]);
  for (const changed of trials.filter(({ manifest }) =>
    flakyProfiles.has(manifest.profileId) && manifest.unitId.endsWith("-R5")
  )) changed.evaluation.outcomeSignature = "different-outcome";
  const summary = aggregateReleaseCampaign({ plan, trials, bundle });
  assert.equal(summary.conclusion, "fail");
  assert.ok(summary.aggregate.metrics.flakeRate > bundle.scoring.thresholds.flakeRate);
  assert.ok(summary.failures.some(({ domain }) => domain === "runner"));
});
