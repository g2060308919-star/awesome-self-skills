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
