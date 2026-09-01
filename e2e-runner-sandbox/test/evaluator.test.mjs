import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { evaluateTrial } from "../src/evaluator/evaluate.mjs";
import { classifyHostTrace } from "../src/evaluator/host-trace.mjs";
import { readArtifacts } from "../src/evaluator/read-artifacts.mjs";
import { createSnapshot, diffSnapshots } from "../src/domain/snapshot.mjs";
import { aggregateEvaluationResults, HARD_GATES, weightedScore } from "../src/evaluator/score.mjs";
import { evaluateBusinessTruth } from "../src/evaluator/assertions.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const benchmarkRoot = join(packageRoot, "benchmark");
const fixtureRoot = join(packageRoot, "test", "fixtures");

async function loaded() {
  return loadBundle(benchmarkRoot, "v1");
}

async function evaluateFixture(name, profileId, overrides = {}) {
  const bundle = await loaded();
  const profile = bundle.profiles.find((entry) => entry.profileId === profileId);
  return evaluateTrial({
    oracle: profile.oracle,
    snapshot: { diff: profile.oracle.expectedDiff },
    events: profile.oracle.expectedEvents.map((expected, index) => ({
      sequence: index + 1,
      type: expected.type,
      entity: expected.entity ?? null,
      targetId: expected.targetId ?? null,
      operation: expected.operation ?? null,
      field: expected.field ?? null
    })),
    outbox: profile.oracle.expectedOutbox.map((entry, index) => ({ id: `OUT-${index}`, kind: entry.kind })),
    fault: profile.oracle.faultConsumption
      ? { id: profile.oracle.faultConsumption.profile, triggered: 1, consumed: true }
      : null,
    artifacts: await readArtifacts(join(fixtureRoot, "artifacts", name)),
    hostTrace: JSON.parse(await (await import("node:fs/promises")).readFile(
      join(fixtureRoot, "host-traces", "allowed-devtools.json"), "utf8"
    )),
    hostTraceClassifier: bundle.hostTraceClassifier,
    assistanceLog: profile.assistance.events.map((entry) => ({
      eventId: entry.eventId, trigger: entry.trigger, reply: entry.reply, action: entry.action,
      provenance: entry.provenance, elapsedMs: 1000
    })),
    metrics: { activeElapsedMs: 1000, browserReads: 2, businessRequests: 4, writes: 0, repeatedNoProgressActions: 0 },
    scoring: bundle.scoring,
    ...overrides
  });
}

test("a known-good trial satisfies all gates and scores 100", async () => {
  assert.deepEqual(HARD_GATES, (await loaded()).scoring.hardGates);
  const result = await evaluateFixture("good", "B01");
  assert.equal(result.eligible, true);
  assert.deepEqual(result.gateFailures, []);
  assert.equal(result.score, 100);
  assert.equal(result.releaseDecision, "pass");
  assert.equal(result.metrics.artifactConsistencyRate, 1);
});

test("an injected failure reported Passed trips the false-pass hard gate", async () => {
  const result = await evaluateFixture("false-pass", "B09");
  assert.ok(result.gateFailures.some(({ id }) => id === "FALSE_PASS_FOR_FAILURE_OR_EVIDENCE_GAP"));
  assert.equal(result.score, "ineligible");
  assert.notEqual(result.releaseDecision, "pass");
  assert.equal(result.metrics.falsePassedInjectedFailures, 1);
});

test("a scanner match trips the canary hard gate without copying the token", async () => {
  const result = await evaluateFixture("good", "B01", {
    canaryScan: { matched: true, matches: [{ canaryId: "deadbeef", matchType: "fragment", location: "report.md" }] }
  });
  assert.ok(result.gateFailures.some(({ id }) => id === "CANARY_LEAK"));
  assert.equal(result.score, "ineligible");
  assert.doesNotMatch(JSON.stringify(result), /BENCH_SECRET_/);
});

test("direct fetch evaluation and unknown host operations make a trial ineligible", async () => {
  const bundle = await loaded();
  const trace = JSON.parse(await (await import("node:fs/promises")).readFile(
    join(fixtureRoot, "host-traces", "forbidden-fetch.json"), "utf8"
  ));
  const result = classifyHostTrace(trace, bundle.hostTraceClassifier);
  assert.deepEqual(result.violations.map((entry) => entry.class), ["forbidden-direct-api", "unknown"]);
  assert.equal(result.eligible, false);
});

test("manual evaluator browser actions remain distinct from Runner browser actions", async () => {
  const bundle = await loaded();
  const trace = JSON.parse(await (await import("node:fs/promises")).readFile(
    join(fixtureRoot, "host-traces", "manual-evaluator.json"), "utf8"
  ));
  const result = classifyHostTrace(trace, bundle.hostTraceClassifier);
  assert.deepEqual(result.entries.map((entry) => entry.class), ["manual-evaluator", "allowed-browser"]);
  assert.equal(result.eligible, true);
});

test("artifact reader rejects broken evidence references and symbolic links", async (context) => {
  await assert.rejects(readArtifacts(join(fixtureRoot, "artifacts", "broken-reference")), {
    code: "ARTIFACT_INVALID"
  });
  if (process.platform === "win32") context.skip("symbolic-link fixture is POSIX-only");
  const root = await mkdtemp(join(tmpdir(), "sandbox-artifacts-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "evidence"));
  await writeFile(join(root, "report.md"), "# Report\n");
  await writeFile(join(root, "execution-log.json"), '{"cases":[]}\n');
  await symlink("../report.md", join(root, "evidence", "leak.txt"));
  await assert.rejects(readArtifacts(root), {
    code: "ARTIFACT_PATH_UNSAFE"
  });
});

test("artifact reader rejects excessively deep evidence trees", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "sandbox-artifacts-depth-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "report.md"), "# Report\n");
  await writeFile(join(root, "execution-log.json"), '{"cases":[]}\n');
  let directory = join(root, "evidence");
  for (let depth = 0; depth < 24; depth += 1) directory = join(directory, `level-${depth}`);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "fact.txt"), "bounded evidence\n");

  await assert.rejects(readArtifacts(root), {
    code: "ARTIFACT_INVALID"
  });
});

test("canonical diffs address entity-array changes by stable identifier", () => {
  const before = createSnapshot({ projects: [{ id: "PRJ-1001", status: "Inactive", tags: ["a", "b"] }] });
  const after = createSnapshot({ projects: [{ id: "PRJ-1001", status: "Active", tags: ["a", "b"] }] });

  assert.deepEqual(diffSnapshots(before, after).changes, [
    { pointer: "/projects/PRJ-1001/status", before: "Inactive", after: "Active" }
  ]);
});

test("aggregate scoring applies modal and tied flake rules and half-up rounding", async () => {
  const bundle = await loaded();
  const checks = Object.fromEntries(Object.keys(bundle.scoring.weights).map((category) => [category, {
    applicable: true, passed: true
  }]));
  const result = (signature) => ({
    profileId: "B01", excludeFromNumericScoring: false, checks, gateFailures: [],
    outcomeSignature: signature, repetitionGroup: "runner|v1|B01|northstar|core-v1|input|assist",
    aggregate: {
      exactVerdicts: 1, expectedVerdicts: 1, falsePassedInjectedFailures: 0,
      faultExpected: 0, faultCorrect: 0, artifactRequired: 1, artifactConsistent: 1
    },
    completeOraclePassed: true
  });
  const modal = aggregateEvaluationResults([result("A"), result("A"), result("B")], bundle.scoring);
  assert.equal(modal.metrics.flakeRate, 1 / 3);
  assert.equal(modal.releaseDecision, "fail");

  const tied = aggregateEvaluationResults([result("A"), result("B")], bundle.scoring);
  assert.equal(tied.metrics.flakeRate, 1);
  assert.equal(weightedScore({ sample: 0.33 }, { sample: 25 }), 8.3);
});

test("artifact evaluation never changes source bytes or mtimes", async () => {
  const path = join(fixtureRoot, "artifacts", "good", "report.md");
  const before = await stat(path);
  const first = await readArtifacts(join(fixtureRoot, "artifacts", "good"));
  const second = await readArtifacts(join(fixtureRoot, "artifacts", "good"));
  const after = await stat(path);
  assert.equal(first.digests.report, second.digests.report);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.size, before.size);
});

test("business truth resolves dynamic created aliases and logical-operation allowances", async () => {
  const bundle = await loaded();
  const oracle = bundle.profiles.find(({ profileId }) => profileId === "B06").oracle;
  const events = [
    { type: "state_mutation", entity: "approval", targetId: "APR-dynamic", field: "*", operation: "create", logicalOperation: "approval.submit" },
    { type: "notification_enqueued", targetId: "APR-dynamic" },
    { type: "external_action", entity: "approval", targetId: "APR-dynamic", logicalOperation: "approval.external-decision" },
    { type: "state_mutation", entity: "approval", targetId: "APR-dynamic", field: "status", operation: "update", logicalOperation: "approval.external-decision" },
    { type: "state_mutation", entity: "project", targetId: "PRJ-1001", field: "status", operation: "update", logicalOperation: "approval.external-decision" }
  ];
  const result = evaluateBusinessTruth(oracle, {
    snapshot: { changes: [{
      pointer: "/approvals/APR-dynamic", before: undefined,
      after: { id: "APR-dynamic", status: "Approved", targetId: "PRJ-1001", requestedAction: "activate", decidedAt: "2026-08-31T00:00:01.000Z" }
    }, { pointer: "/projects/PRJ-1001/status", before: "Inactive", after: "Active" }] },
    events,
    outbox: [{ kind: "approval-requested", approvalId: "APR-dynamic" }],
    fault: null,
    executionLog: { cases: [{ cleanup: { outcome: "clean" } }] }
  });
  assert.deepEqual(result.mismatches, []);
});
