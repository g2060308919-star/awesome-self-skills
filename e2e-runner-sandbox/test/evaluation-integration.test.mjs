import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { aggregateCalibration } from "../src/campaign/aggregate.mjs";
import { createCalibrationPlan } from "../src/campaign/planner.mjs";
import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { evaluateTrial } from "../src/evaluator/evaluate.mjs";
import { readArtifacts } from "../src/evaluator/read-artifacts.mjs";
import { normalizeCodexRollout } from "../src/host-evidence/codex-rollout-adapter.mjs";
import { buildHostEvidence } from "../src/host-evidence/bridge.mjs";
import { createCodexSourcePackage, readHostSourcePackage } from "../src/host-evidence/source-package.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("recorded Host export flows through Bridge, single scoring, and Campaign aggregation without release eligibility", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "evaluation-integration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bundle = await loadBundle(join(packageRoot, "benchmark"), "v1");
  const profile = bundle.profiles.find(({ profileId }) => profileId === "B01");
  const created = await createCodexSourcePackage({
    sourcePath: join(packageRoot, "test", "fixtures", "host-evidence", "codex-rollout-allowed.jsonl"),
    outputDirectory: join(directory, "source-package"),
    trustLevel: "recorded-fixture",
    authorization: {
      explicit: true, actor: "integration-test", authorizedAt: "2026-09-01T01:01:00.000Z"
    }
  });
  const source = await readHostSourcePackage(created.packageDirectory);
  const normalized = await normalizeCodexRollout(source);
  const bridge = buildHostEvidence({
    normalized,
    trial: {
      trialId: "trial-integration-B01", runId: "run-integration-B01",
      sessionDigest: normalized.sessionDigest,
      executionStartedAtMs: Date.parse("2026-09-01T01:00:00.000Z"),
      terminalAtMs: Date.parse("2026-09-01T01:00:07.000Z"),
      waitIntervals: [{
        startMs: Date.parse("2026-09-01T01:00:01.000Z"),
        endMs: Date.parse("2026-09-01T01:00:02.000Z"),
        sessionDigest: normalized.sessionDigest
      }]
    },
    assistanceScript: profile.assistance,
    assistanceMarks: [{
      ...profile.assistance.events[0],
      startedAtMs: Date.parse("2026-09-01T01:00:01.000Z"),
      endedAtMs: Date.parse("2026-09-01T01:00:02.000Z"),
      hostEventDigests: [], controlEventIds: []
    }],
    controlEvents: [{
      id: "EVT-LOGIN", runId: "run-integration-B01", type: "session_event",
      logicalOperation: "session.login", outcome: "logged-in"
    }],
    requestTrace: [{
      requestId: "REQ-000001", runId: "run-integration-B01",
      timestampMs: Date.parse("2026-09-01T01:00:04.000Z"),
      resultDigest: `sha256:${"a".repeat(64)}`
    }],
    oracleEvents: []
  });
  const artifacts = await readArtifacts(join(packageRoot, "test", "fixtures", "artifacts", "good"));
  const diagnostic = evaluateTrial({
    oracle: profile.oracle,
    artifacts,
    hostTraceClassifier: bundle.hostTraceClassifier,
    scoring: bundle.scoring,
    executionUnit: { ...bundle.executionMatrix.units.find(({ unitId }) => unitId === "B01-R1"), runnerVersion: "fixture" },
    snapshot: { changes: [] }, events: [], outbox: [], fault: null,
    hostTrace: bridge.hostTrace,
    assistanceLog: bridge.assistance.events,
    metrics: bridge.metrics,
    canaryScan: { matched: false, matches: [] }
  });

  for (const output of [bridge.hostTrace, bridge.assistance, bridge.metrics]) {
    assert.equal(output.sessionDigest, normalized.sessionDigest);
    assert.equal(output.sourceManifestDigest, normalized.sourceManifestDigest);
    assert.equal(output.normalizedEventsDigest, normalized.normalizedEventsDigest);
  }
  assert.equal(diagnostic.diagnosticScore, 100);
  assert.equal(bridge.releaseEligibility.eligible, false);
  assert.ok(bridge.releaseEligibility.reasons.some(({ code }) => code === "HOST_EXPORT_UNAUTHORIZED"));
  assert.equal(JSON.stringify(bridge).includes("snapshot redacted"), false);

  const definition = JSON.parse(await readFile(join(packageRoot, "config", "calibration-v1.json"), "utf8"));
  const plan = createCalibrationPlan({
    bundle, definition, campaignId: "integration-calibration",
    createdAt: "2026-09-01T02:00:00.000Z",
    runner: { version: "fixture", digest: `sha256:${"b".repeat(64)}` }
  });
  const campaign = aggregateCalibration({ plan, trials: [], bundle });
  assert.equal(campaign.conclusion, "incomplete");
  assert.equal(campaign.failures.length, 6);
});
