import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalStringify } from "../src/bundle/canonical-json.mjs";
import { sha256Text } from "../src/bundle/digests.mjs";
import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { createTrialOrchestrator } from "../src/trial/orchestrator.mjs";
import { createTrialStore } from "../src/trial/store.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const emptyEventsDigest = `sha256:${sha256Text(canonicalStringify([]))}`;

async function roots(t) {
  const root = await mkdtemp(join(tmpdir(), "trial-orchestrator-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    root,
    privateRoot: join(root, "private", "trials"),
    exchangeRoot: join(root, "exchange")
  };
}

function fakeControl() {
  const commands = [];
  let lifecycle = "empty";
  let epoch = 0;
  let runNumber = 0;
  let profileId = null;
  return {
    commands,
    forceRun(next) {
      lifecycle = next.lifecycle;
      epoch = next.epoch ?? epoch;
      runNumber = next.runNumber;
      profileId = next.profileId ?? profileId;
    },
    async request(command, args) {
      commands.push({ command, args: structuredClone(args) });
      if (command === "status") return { lifecycle, epoch, profileId, runId: runNumber ? `run-${runNumber}` : null };
      if (["prepare", "reset"].includes(command)) {
        lifecycle = "active";
        epoch += 1;
        runNumber += 1;
        profileId = args.profileId;
        return {
          lifecycle, epoch, profileId, runId: `run-${runNumber}`,
          preSnapshot: { digest: `pre-${runNumber}`, state: {} }
        };
      }
      if (command === "snapshot") return { digest: "after", changes: [] };
      if (["events", "outbox", "requests"].includes(command)) return [];
      if (command === "fault") return null;
      if (command === "canaries") return { canaries: [] };
      throw new Error(`unexpected command ${command}`);
    }
  };
}

async function setup(t, overrides = {}) {
  const directories = await roots(t);
  const bundle = await loadBundle(join(packageRoot, "benchmark"), "v1");
  const store = await createTrialStore({ root: directories.privateRoot });
  const client = fakeControl();
  let clock = 0;
  const orchestrator = createTrialOrchestrator({
    bundle,
    store,
    client,
    exchangeRoot: directories.exchangeRoot,
    businessUrl: "http://127.0.0.1:43100",
    trialIdFactory: () => "trial-B01-fixed",
    now: () => new Date(Date.UTC(2026, 8, 1, 0, 0, clock++)).toISOString(),
    nowMs: () => 1000 + clock * 1000,
    bridgeBuilder: () => ({
      hostTrace: { schemaVersion: "host-trace-v1", entries: [] },
      assistance: { schemaVersion: "assistance-v1", events: [] },
      metrics: { schemaVersion: "metrics-v1", activeElapsedMs: 1000, browserReads: 1, businessRequests: 1, writes: 0, repeatedNoProgressActions: 0 },
      releaseEligibility: { eligible: true, reasons: [] }
    }),
    trialEvaluator: () => ({
      profileId: "B01", eligible: true, score: 100, diagnosticScore: 100,
      releaseDecision: "pass", gateFailures: [], completeOraclePassed: true,
      checks: {}, metrics: {}, aggregate: {}, sourceDigests: {}
    }),
    canaryScanner: async () => ({ matched: false, matches: [] }),
    ...overrides
  });
  return { ...directories, bundle, store, client, orchestrator };
}

test("Trial runs from persisted create through evaluation and safe reset", async (t) => {
  const { orchestrator, store, client, exchangeRoot } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1.0.0", digest: `sha256:${"a".repeat(64)}` }
  });
  assert.equal(trial.state, "awaiting_scope_confirmation");
  assert.equal(trial.runId, "run-1");
  assert.match(trial.componentDigests.bundle, /^sha256:[a-f0-9]{64}$/);

  const shown = await orchestrator.showRunnerInput(trial.trialId);
  assert.equal(shown.businessUrl, "http://127.0.0.1:43100");
  assert.equal(Object.hasOwn(shown, "privateRoot"), false);
  assert.equal(shown.runId, "run-1");

  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production",
    scope: "http://127.0.0.1:43100 only",
    idempotencyKey: "scope-1"
  });
  assert.deepEqual(trial.scopeConfirmation.allowedOrigins, ["http://127.0.0.1:43100"]);
  assert.deepEqual(trial.scopeConfirmation.sandboxIdentity, {
    runId: "run-1", epoch: 1, profileId: "B01"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`,
    executionStartedAtMs: 2000,
    idempotencyKey: "session-1"
  });
  assert.equal(trial.state, "running");

  const artifactRoot = join(exchangeRoot, trial.trialId, "artifacts");
  await cp(join(packageRoot, "test", "fixtures", "artifacts", "good"), artifactRoot, { recursive: true });
  trial = await orchestrator.collect(trial.trialId, { artifactRoot, idempotencyKey: "collect-1" });
  assert.equal(trial.state, "collecting");
  assert.match(trial.artifacts.digest, /^sha256:[a-f0-9]{64}$/);

  trial = await orchestrator.importHost(trial.trialId, {
    normalized: {
      schemaVersion: "host-event-v1", adapter: { name: "codex-rollout", version: "1.0.0" },
      mappingVersion: "chrome-devtools-tools-v1", trustLevel: "host-native",
      sessionDigest: `sha256:${"b".repeat(64)}`,
      sourceManifestDigest: `sha256:${"c".repeat(64)}`,
      normalizedEventsDigest: emptyEventsDigest, events: []
    },
    idempotencyKey: "host-1"
  });
  assert.equal(trial.hostEvidence.sessionDigest, `sha256:${"b".repeat(64)}`);

  trial = await orchestrator.evaluate(trial.trialId, { assistanceMarks: [], idempotencyKey: "evaluate-1" });
  assert.equal(trial.state, "evaluated");
  assert.equal(trial.releaseEligibility.eligible, true);
  const evaluation = JSON.parse(await readFile(trial.outputs.evaluation.path, "utf8"));
  assert.equal(evaluation.releaseDecision, "pass");

  trial = await orchestrator.reset(trial.trialId, { idempotencyKey: "reset-1" });
  assert.equal(trial.state, "completed");
  assert.equal(trial.reset.epoch, 2);
  assert.equal((await store.read(trial.trialId)).state, "completed");
  assert.ok(client.commands.every(({ command }) => !/click|navigate|browser/i.test(command)));
});

test("scripted assistance wait is persisted and excluded without accepting free-form content", async (t) => {
  const { orchestrator } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 1000,
    idempotencyKey: "session"
  });
  trial = await orchestrator.startAssistance(trial.trialId, {
    eventId: "B01-HELP-LOGIN", startedAtMs: 1500, idempotencyKey: "assist-start"
  });
  assert.equal(trial.state, "awaiting_assistance");
  await assert.rejects(orchestrator.completeAssistance(trial.trialId, {
    eventId: "B01-HELP-LOGIN", trigger: "scope-confirmed-and-login-visible",
    reply: "invented reply", action: "manual-account-selection", provenance: "evaluator",
    endedAtMs: 2500, idempotencyKey: "assist-bad"
  }), { code: "ASSISTANCE_PROVENANCE_MISSING" });
  trial = await orchestrator.completeAssistance(trial.trialId, {
    eventId: "B01-HELP-LOGIN", trigger: "scope-confirmed-and-login-visible",
    reply: "Select the requested synthetic account in the visible browser.",
    action: "manual-account-selection", provenance: "evaluator",
    endedAtMs: 2500, idempotencyKey: "assist-complete"
  });
  assert.equal(trial.state, "running");
  assert.equal(trial.assistanceMarks[0].elapsedMs, 1000);
  assert.deepEqual(trial.timing.waitIntervals[0], {
    startMs: 1500, endMs: 2500, sessionDigest: `sha256:${"b".repeat(64)}`
  });
});

test("expired manual assistance is recorded honestly and resumes only as diagnostic evidence", async (t) => {
  const { orchestrator } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 1000,
    idempotencyKey: "session"
  });
  trial = await orchestrator.startAssistance(trial.trialId, {
    eventId: "B01-HELP-LOGIN", startedAtMs: 1500, idempotencyKey: "assist-start"
  });

  await assert.rejects(orchestrator.expireAssistance(trial.trialId, {
    eventId: "B01-HELP-LOGIN", endedAtMs: 31500, idempotencyKey: "assist-not-expired"
  }), { code: "ASSISTANCE_PROVENANCE_MISSING" });

  trial = await orchestrator.expireAssistance(trial.trialId, {
    eventId: "B01-HELP-LOGIN", endedAtMs: 31501, idempotencyKey: "assist-expired"
  });
  assert.equal(trial.state, "running");
  assert.equal(trial.assistanceMarks[0].valid, false);
  assert.equal(trial.assistanceMarks[0].failure.code, "ASSISTANCE_DEADLINE_EXCEEDED");
  assert.deepEqual(trial.timing.waitIntervals, []);
  assert.equal(trial.releaseEligibility.eligible, false);
  assert.ok(trial.releaseEligibility.reasons.some(({ code }) => code === "ASSISTANCE_DEADLINE_EXCEEDED"));
});

test("B12 records both scripted assistance events before the Host session is imported", async (t) => {
  const { orchestrator } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B12-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.startRunner(trial.trialId, {
    executionStartedAtMs: 1000, idempotencyKey: "start"
  });

  const events = [
    {
      eventId: "B12-HELP-SPECIAL", trigger: "session-expired",
      reply: "Please pause; the evaluator will complete manual login in the same visible browser.",
      action: "manual-relogin", provenance: "evaluator"
    },
    {
      eventId: "B12-HELP-LOGIN", trigger: "scope-confirmed-and-login-visible",
      reply: "Select the requested synthetic account in the visible browser.",
      action: "manual-account-selection", provenance: "evaluator"
    }
  ];
  for (const [index, event] of events.entries()) {
    const startedAtMs = 1500 + index * 2000;
    trial = await orchestrator.startAssistance(trial.trialId, {
      eventId: event.eventId, startedAtMs, idempotencyKey: `assist-start-${index}`
    });
    trial = await orchestrator.completeAssistance(trial.trialId, {
      ...event, endedAtMs: startedAtMs + 1000, idempotencyKey: `assist-complete-${index}`
    });
  }
  assert.equal(trial.assistanceMarks.length, 2);
  assert.equal(trial.timing.waitIntervals.length, 2);
  assert.ok(trial.timing.waitIntervals.every(({ sessionDigest }) => sessionDigest === null));

  trial = await orchestrator.importHost(trial.trialId, {
    normalized: {
      schemaVersion: "host-event-v1", adapter: { name: "codex-rollout", version: "1.3.0" },
      mappingVersion: "chrome-devtools-tools-v1", trustLevel: "host-native", sourceValidated: true,
      sessionDigest: `sha256:${"b".repeat(64)}`,
      sourceManifestDigest: `sha256:${"c".repeat(64)}`,
      normalizedEventsDigest: emptyEventsDigest, integrityIssues: [], events: []
    },
    idempotencyKey: "host"
  });
  assert.ok(trial.timing.waitIntervals.every(
    ({ sessionDigest }) => sessionDigest === `sha256:${"b".repeat(64)}`
  ));
});

test("running interruption blocks without replay and resumes only after reconciliation", async (t) => {
  const { orchestrator, client } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 2000,
    idempotencyKey: "session"
  });
  const commandCount = client.commands.length;
  trial = await orchestrator.markInterrupted(trial.trialId, {
    uncertainWrites: true, reason: "Host process stopped", idempotencyKey: "interrupt"
  });
  assert.equal(trial.state, "blocked");
  await assert.rejects(orchestrator.resume(trial.trialId, { reconciled: false }), {
    code: "TRIAL_STATE_INVALID"
  });
  trial = await orchestrator.resume(trial.trialId, { reconciled: true, idempotencyKey: "resume" });
  assert.equal(trial.state, "running");
  assert.equal(client.commands.length, commandCount);
});

test("an in-progress Trial can be explicitly abandoned and safely reset without replay", async (t) => {
  const { orchestrator, client } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.startRunner(trial.trialId, {
    executionStartedAtMs: 2000, idempotencyKey: "start"
  });
  const beforeAbandon = client.commands.length;

  trial = await orchestrator.abandon(trial.trialId, {
    reason: "adapter-version-changed-after-host-import", idempotencyKey: "abandon"
  });
  assert.equal(trial.state, "abandoned");
  assert.equal(trial.abandonment.reason, "adapter-version-changed-after-host-import");
  assert.equal(client.commands.length, beforeAbandon);

  trial = await orchestrator.reset(trial.trialId, { idempotencyKey: "reset" });
  assert.equal(trial.state, "completed");
  assert.equal(client.commands.filter(({ command }) => command === "reset").length, 1);
});

test("creating another Trial cannot reset a run owned by an unfinished Trial", async (t) => {
  let trialNumber = 0;
  const { orchestrator, client } = await setup(t, {
    trialIdFactory: () => `trial-fence-${++trialNumber}`
  });
  await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  const resetsBefore = client.commands.filter(({ command }) => command === "reset").length;
  await assert.rejects(orchestrator.create({
    unitId: "B02-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  }), { code: "SANDBOX_RUN_MISMATCH" });
  assert.equal(client.commands.filter(({ command }) => command === "reset").length, resetsBefore);
});

test("concurrent Trial creation grants the Sandbox to exactly one Trial", async (t) => {
  let trialNumber = 0;
  const { orchestrator, client } = await setup(t, {
    trialIdFactory: () => `trial-concurrent-${++trialNumber}`
  });
  const createInput = (unitId) => ({
    unitId, campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  const results = await Promise.allSettled([
    orchestrator.create(createInput("B01-R1")),
    orchestrator.create(createInput("B02-R1"))
  ]);
  assert.equal(results.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(results.filter(({ status }) => status === "rejected").length, 1);
  assert.equal(client.commands.filter(({ command }) => command === "prepare").length, 1);
  assert.equal(client.commands.filter(({ command }) => command === "reset").length, 0);
});

test("Trial reset refuses to erase a different active run", async (t) => {
  const { orchestrator, client } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.startRunner(trial.trialId, {
    executionStartedAtMs: 1000, idempotencyKey: "start"
  });
  trial = await orchestrator.abandon(trial.trialId, { reason: "diagnostic", idempotencyKey: "abandon" });
  client.forceRun({ lifecycle: "active", runNumber: 99, epoch: 99, profileId: "B02" });
  const resetsBefore = client.commands.filter(({ command }) => command === "reset").length;
  await assert.rejects(orchestrator.reset(trial.trialId, { idempotencyKey: "reset" }), {
    code: "SANDBOX_RUN_MISMATCH"
  });
  assert.equal(client.commands.filter(({ command }) => command === "reset").length, resetsBefore);
});

test("execution may start before the final export and import binds the one completed Host session", async (t) => {
  const { orchestrator } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.startRunner(trial.trialId, {
    executionStartedAtMs: 2000, idempotencyKey: "start"
  });
  assert.equal(trial.state, "running");
  assert.equal(trial.hostSession, null);
  trial = await orchestrator.importHost(trial.trialId, {
    normalized: {
      schemaVersion: "host-event-v1", adapter: { name: "codex-rollout", version: "1.0.0" },
      mappingVersion: "chrome-devtools-tools-v1", trustLevel: "host-native",
      sessionDigest: `sha256:${"b".repeat(64)}`,
      sourceManifestDigest: `sha256:${"c".repeat(64)}`,
      normalizedEventsDigest: emptyEventsDigest, events: []
    },
    idempotencyKey: "host"
  });
  assert.equal(trial.hostSession.sessionDigest, `sha256:${"b".repeat(64)}`);
});

test("evaluation preserves distinct Host, assistance, budget, artifact, and Runner responsibility domains", async (t) => {
  const { orchestrator, exchangeRoot } = await setup(t, {
    bridgeBuilder: () => ({
      hostTrace: { schemaVersion: "host-trace-v1", entries: [] },
      assistance: { schemaVersion: "assistance-v1", events: [] },
      metrics: {
        schemaVersion: "metrics-v1", activeElapsedMs: 1000, browserReads: null,
        businessRequests: 1, writes: 0, repeatedNoProgressActions: 0
      },
      releaseEligibility: {
        eligible: false,
        reasons: [
          { code: "HOST_EVENT_UNKNOWN", message: "unknown tool" },
          { code: "ASSISTANCE_DEADLINE_EXCEEDED", message: "late assistance" },
          { code: "METRIC_NOT_DERIVABLE", message: "missing browser metric" }
        ]
      }
    }),
    trialEvaluator: () => ({
      profileId: "B01", eligible: false, score: "ineligible", diagnosticScore: 42,
      releaseDecision: "fail", gateFailures: [], completeOraclePassed: false,
      checks: {
        verdictAttribution: { applicable: true, passed: false },
        stateAction: { applicable: true, passed: true },
        navigation: { applicable: true, passed: false },
        collaboration: { applicable: true, passed: false },
        artifact: { applicable: true, passed: false },
        stabilityEfficiency: { applicable: true, passed: false }
      },
      metrics: {}, aggregate: {}, sourceDigests: {}
    })
  });
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 2000,
    idempotencyKey: "session"
  });
  const artifactRoot = join(exchangeRoot, trial.trialId, "artifacts");
  await cp(join(packageRoot, "test", "fixtures", "artifacts", "good"), artifactRoot, { recursive: true });
  trial = await orchestrator.collect(trial.trialId, { artifactRoot, idempotencyKey: "collect" });
  trial = await orchestrator.importHost(trial.trialId, {
    normalized: {
      schemaVersion: "host-event-v1", adapter: { name: "codex-rollout", version: "1.1.0" },
      mappingVersion: "chrome-devtools-tools-v1", trustLevel: "host-native", sourceValidated: true,
      sessionDigest: `sha256:${"b".repeat(64)}`,
      sourceManifestDigest: `sha256:${"c".repeat(64)}`,
      normalizedEventsDigest: emptyEventsDigest, events: []
    },
    idempotencyKey: "host"
  });
  trial = await orchestrator.evaluate(trial.trialId, { idempotencyKey: "evaluate" });
  const evaluation = JSON.parse(await readFile(trial.outputs.evaluation.path, "utf8"));
  assert.deepEqual(evaluation.responsibilityDomains, [
    "runner", "host-evidence", "artifact", "assistance", "budget"
  ]);
});

test("Host integrity issues survive Trial import and reach the Bridge", async (t) => {
  let observedIntegrityIssues = null;
  const { orchestrator, exchangeRoot } = await setup(t, {
    bridgeBuilder: (input) => {
      observedIntegrityIssues = input.normalized.integrityIssues;
      return {
        hostTrace: { schemaVersion: "host-trace-v1", entries: [] },
        assistance: { schemaVersion: "assistance-v1", events: [] },
        metrics: { schemaVersion: "metrics-v1", activeElapsedMs: 1000, browserReads: 1, businessRequests: 1, writes: 0, repeatedNoProgressActions: 0 },
        releaseEligibility: { eligible: false, reasons: input.normalized.integrityIssues }
      };
    }
  });
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 2000,
    idempotencyKey: "session"
  });
  const artifactRoot = join(exchangeRoot, trial.trialId, "artifacts");
  await cp(join(packageRoot, "test", "fixtures", "artifacts", "good"), artifactRoot, { recursive: true });
  trial = await orchestrator.collect(trial.trialId, { artifactRoot, idempotencyKey: "collect" });
  trial = await orchestrator.importHost(trial.trialId, {
    normalized: {
      schemaVersion: "host-event-v1", adapter: { name: "codex-rollout", version: "1.3.0" },
      mappingVersion: "chrome-devtools-tools-v1", trustLevel: "host-native", sourceValidated: true,
      sessionDigest: `sha256:${"b".repeat(64)}`,
      sourceManifestDigest: `sha256:${"c".repeat(64)}`,
      normalizedEventsDigest: emptyEventsDigest,
      integrityIssues: [{ code: "HOST_EVENT_INCOMPLETE", message: "one call remained active" }],
      events: []
    },
    idempotencyKey: "host"
  });
  await orchestrator.evaluate(trial.trialId, { idempotencyKey: "evaluate" });
  assert.deepEqual(observedIntegrityIssues, [
    { code: "HOST_EVENT_INCOMPLETE", message: "one call remained active" }
  ]);
});

test("evaluation retry reuses one frozen terminal truth snapshot", async (t) => {
  let attempt = 0;
  const evaluatorResult = {
    profileId: "B01", eligible: true, score: 100, diagnosticScore: 100,
    releaseDecision: "pass", gateFailures: [], completeOraclePassed: true,
    checks: {}, metrics: {}, aggregate: {}, sourceDigests: {}
  };
  const { orchestrator, client, exchangeRoot } = await setup(t, {
    trialEvaluator: () => {
      attempt += 1;
      if (attempt === 1) throw new Error("simulated evaluator crash");
      return evaluatorResult;
    }
  });
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 2000,
    idempotencyKey: "session"
  });
  const artifactRoot = join(exchangeRoot, trial.trialId, "artifacts");
  await cp(join(packageRoot, "test", "fixtures", "artifacts", "good"), artifactRoot, { recursive: true });
  trial = await orchestrator.collect(trial.trialId, { artifactRoot, idempotencyKey: "collect" });
  trial = await orchestrator.importHost(trial.trialId, {
    normalized: {
      schemaVersion: "host-event-v1", adapter: { name: "codex-rollout", version: "1.3.0" },
      mappingVersion: "chrome-devtools-tools-v1", trustLevel: "host-native", sourceValidated: true,
      sessionDigest: `sha256:${"b".repeat(64)}`, sourceManifestDigest: `sha256:${"c".repeat(64)}`,
      normalizedEventsDigest: emptyEventsDigest, integrityIssues: [], events: []
    },
    idempotencyKey: "host"
  });
  await assert.rejects(orchestrator.evaluate(trial.trialId, { idempotencyKey: "evaluate" }), /simulated evaluator crash/);
  trial = await orchestrator.evaluate(trial.trialId, { idempotencyKey: "evaluate" });
  assert.equal(trial.state, "evaluated");
  assert.equal(client.commands.filter(({ command }) => command === "events").length, 1);
});

test("evaluation refuses truth from a Sandbox that differs from confirmed scope", async (t) => {
  const { orchestrator, client, exchangeRoot } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 2000,
    idempotencyKey: "session"
  });
  const artifactRoot = join(exchangeRoot, trial.trialId, "artifacts");
  await cp(join(packageRoot, "test", "fixtures", "artifacts", "good"), artifactRoot, { recursive: true });
  trial = await orchestrator.collect(trial.trialId, { artifactRoot, idempotencyKey: "collect" });
  trial = await orchestrator.importHost(trial.trialId, {
    normalized: {
      schemaVersion: "host-event-v1", adapter: { name: "codex-rollout", version: "1.3.0" },
      mappingVersion: "chrome-devtools-tools-v1", trustLevel: "host-native", sourceValidated: true,
      sessionDigest: `sha256:${"b".repeat(64)}`, sourceManifestDigest: `sha256:${"c".repeat(64)}`,
      normalizedEventsDigest: emptyEventsDigest, integrityIssues: [], events: []
    },
    idempotencyKey: "host"
  });
  client.forceRun({ lifecycle: "active", epoch: 2, runNumber: 2, profileId: "B01" });

  await assert.rejects(orchestrator.evaluate(trial.trialId, { idempotencyKey: "evaluate" }), {
    code: "SANDBOX_RUN_MISMATCH"
  });
  assert.equal(client.commands.some(({ command }) => command === "events"), false);
});

test("collected artifact changes and Host session rebinding are rejected", async (t) => {
  const { orchestrator, exchangeRoot } = await setup(t);
  let trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  trial = await orchestrator.confirmScope(trial.trialId, {
    environmentClassification: "non-production", scope: "local", idempotencyKey: "scope"
  });
  trial = await orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"b".repeat(64)}`, executionStartedAtMs: 2000,
    idempotencyKey: "session"
  });
  await assert.rejects(orchestrator.bindSession(trial.trialId, {
    sessionDigest: `sha256:${"e".repeat(64)}`, executionStartedAtMs: 2000,
    idempotencyKey: "session-other"
  }), { code: "TRIAL_ALREADY_BOUND_TO_SESSION" });
  const artifactRoot = join(exchangeRoot, trial.trialId, "artifacts");
  await cp(join(packageRoot, "test", "fixtures", "artifacts", "good"), artifactRoot, { recursive: true });
  trial = await orchestrator.collect(trial.trialId, { artifactRoot, idempotencyKey: "collect" });
  await writeFile(join(artifactRoot, "report.md"), "# changed after collection\n", "utf8");
  await assert.rejects(orchestrator.collect(trial.trialId, { artifactRoot, idempotencyKey: "collect" }), {
    code: "TRIAL_INPUT_CHANGED"
  });
});

test("materialized Runner input changes are detected before handoff", async (t) => {
  const { orchestrator } = await setup(t);
  const trial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  await writeFile(trial.materializedInput.exchangePath, "{}\n", "utf8");
  await assert.rejects(orchestrator.showRunnerInput(trial.trialId), {
    code: "TRIAL_INPUT_CHANGED"
  });
});

test("reset failure is persisted and prevents completion", async (t) => {
  const broken = fakeControl();
  const original = broken.request.bind(broken);
  broken.request = async (command, args) => {
    if (command === "reset" && broken.commands.some(({ command: prior }) => prior === "prepare")) {
      broken.commands.push({ command, args });
      const error = new Error("fixture failed");
      error.code = "RESET_FAILED";
      throw error;
    }
    return original(command, args);
  };
  const { orchestrator, store } = await setup(t, { client: broken });
  const initial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  let manifest = await store.read(initial.trialId);
  manifest = await store.transact(initial.trialId, manifest.revision, (current) => ({
    ...current, state: "evaluated", revision: current.revision + 1,
    timeline: [...current.timeline, { revision: current.revision + 1, from: current.state, to: "evaluated", at: "2026-09-01T00:01:00.000Z", reason: "test", idempotencyKey: null }]
  }));
  await assert.rejects(orchestrator.reset(manifest.trialId, { idempotencyKey: "reset" }), {
    code: "SANDBOX_RESET_FAILED"
  });
  assert.equal((await store.read(manifest.trialId)).state, "reset_failed");
});

test("reset reconciles the persisted intent after a successful response is lost", async (t) => {
  const control = fakeControl();
  const original = control.request.bind(control);
  let completedOperationId = null;
  control.request = async (command, args) => {
    if (command !== "reset") return original(command, args);
    if (!completedOperationId) {
      const result = await original(command, args);
      completedOperationId = args.operationId;
      const error = new Error("response lost after reset commit");
      error.code = "ECONNRESET";
      throw error;
    }
    assert.equal(args.operationId, completedOperationId);
    control.commands.push({ command, args: structuredClone(args) });
    return original("status", {});
  };
  const { orchestrator, store } = await setup(t, { client: control });
  const initial = await orchestrator.create({
    unitId: "B01-R1", campaignId: "calibration-one",
    runner: { version: "runner-1", digest: `sha256:${"a".repeat(64)}` }
  });
  let manifest = await store.read(initial.trialId);
  manifest = await store.transact(initial.trialId, manifest.revision, (current) => ({
    ...current, state: "evaluated", revision: current.revision + 1,
    timeline: [...current.timeline, { revision: current.revision + 1, from: current.state, to: "evaluated", at: "2026-09-01T00:01:00.000Z", reason: "test", idempotencyKey: null }]
  }));

  await assert.rejects(orchestrator.reset(manifest.trialId, { idempotencyKey: "reset" }), {
    code: "SANDBOX_RESET_FAILED"
  });
  assert.equal((await store.read(manifest.trialId)).state, "reset_failed");

  const completed = await orchestrator.reset(manifest.trialId, { idempotencyKey: "reset" });
  assert.equal(completed.state, "completed");
  assert.equal(completed.reset.runId, "run-2");
  assert.equal(completed.reset.epoch, 2);
  assert.equal((await original("status", {})).runId, "run-2");
});
