import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";
import { createEvaluationWorkflow } from "../src/evaluator/workflow.mjs";
import { classifyHostTrace } from "../src/evaluator/host-trace.mjs";
import { runReferenceCase } from "../src/reference-driver/driver.mjs";
import { createBusinessOperations } from "../src/domain/operations.mjs";
import { createBusinessServer } from "../src/business/server.mjs";
import { evaluateTrial } from "../src/evaluator/evaluate.mjs";
import { readArtifacts } from "../src/evaluator/read-artifacts.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const benchmarkRoot = join(packageRoot, "benchmark");
const STEP_NAMES = [
  "select-profile", "prepare-materialize-and-capture-pre", "fresh-context",
  "deliver-input", "resolve-environment", "assist-and-confirm",
  "start-chrome-and-manual-login", "later-assistance", "terminal-and-host-trace",
  "collect-artifacts", "capture-post-oracle", "evaluate", "reset-and-release"
];

test("evaluation workflow follows the 13-step protocol and archives exact digests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "evaluation-workflow-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bundle = await loadBundle(benchmarkRoot, "v1");
  const coordinator = createRunCoordinator({ runIdFactory: () => "workflow-run" });
  const workflow = createEvaluationWorkflow({ bundle, coordinator, archiveRoot: directory });

  const trial = await workflow.createTrial({ profileId: "B11", unitId: "B11-R1" });

  assert.deepEqual(trial.steps.map(({ name }) => name), STEP_NAMES);
  assert.deepEqual(trial.steps.slice(0, 2).map(({ status }) => status), ["completed", "completed"]);
  assert.ok(trial.steps.slice(2).every(({ status }) => status === "pending"));
  assert.match(trial.materializedInputSha256, /^[a-f0-9]{64}$/);
  assert.equal(trial.preSnapshot.digest, coordinator.status().preSnapshot.digest);
  assert.equal(trial.steps[1].previousDigest, trial.steps[0].digest);
  const archived = JSON.parse(await readFile(trial.materializedInputPath, "utf8"));
  assert.equal(archived.cases[0].data.customerName, "Bench-workflow-run");
  assert.equal(trial.materializedInputSha256, workflow.materializedDigest(archived));
});

test("workflow records assistance waits outside active elapsed time", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "evaluation-assistance-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bundle = await loadBundle(benchmarkRoot, "v1");
  const coordinator = createRunCoordinator({ runIdFactory: () => "assistance-run" });
  const workflow = createEvaluationWorkflow({ bundle, coordinator, archiveRoot: directory });
  const trial = await workflow.createTrial({ profileId: "B07", unitId: "B07-R1" });

  const updated = await workflow.recordAssistance(trial.trialId, {
    eventId: "B07-HELP-SPECIAL", trigger: "ambiguous-mercury-target-reported",
    reply: "Use Mercury with business identifier PRJ-MER-2087.", action: "target-clarification",
    provenance: "evaluator", startedAtMs: 1000, endedAtMs: 4500
  });

  assert.equal(updated.excludedWaitMs, 3500);
  assert.equal(updated.assistance.length, 1);
  assert.equal(updated.assistance[0].elapsedMs, 3500);
});

test("the trusted reference driver establishes healthy UI truth but is rejected as Runner provenance", async (t) => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  const profile = bundle.profiles.find(({ profileId }) => profileId === "B02");
  const coordinator = createRunCoordinator({ runIdFactory: () => "reference-run" });
  await coordinator.prepare(profile);
  const operations = createBusinessOperations({ coordinator });
  const business = createBusinessServer({ coordinator, operations });
  const address = await business.listen();
  t.after(() => business.close());

  const trace = await runReferenceCase({
    origin: address.origin, accountId: "acct-operator", profileId: "B02", runId: "reference-run"
  });

  assert.equal(trace.provenance, "trusted-reference");
  assert.equal(trace.assertions.every(({ state }) => state === "verified-pass"), true);
  assert.equal(classifyHostTrace(trace, bundle.hostTraceClassifier).eligible, false);
});

test("H02 records an honest Not Run without alternate-browser or direct-API activity", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  const profile = bundle.profiles.find(({ profileId }) => profileId === "H02");
  const artifacts = await readArtifacts(join(packageRoot, "test", "fixtures", "artifacts", "not-run"));
  const result = evaluateTrial({
    oracle: profile.oracle,
    artifacts,
    hostTraceClassifier: bundle.hostTraceClassifier,
    scoring: bundle.scoring,
    snapshot: { changes: [] },
    events: [],
    outbox: [],
    fault: null,
    hostTrace: [],
    assistanceLog: [],
    metrics: {
      activeElapsedMs: 0, browserReads: 0, businessRequests: 0,
      writes: 0, repeatedNoProgressActions: 0
    }
  });

  assert.equal(result.caseVerdicts[0].actualVerdict, "Not Run");
  assert.deepEqual(result.hostTrace.forbiddenActions, []);
  assert.deepEqual(result.gateFailures, []);
  assert.equal(result.excludeFromNumericScoring, true);
});
