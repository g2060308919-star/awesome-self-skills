import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { materializeRunnerInput } from "../src/bundle/materialize-input.mjs";
import { validateBundle } from "../src/bundle/validate-bundle.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const benchmarkRoot = join(packageRoot, "benchmark");

test("v1 freezes scoring weights, taxonomy, thresholds, and hard gates", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");

  assert.deepEqual(bundle.scoring.weights, {
    verdictAttribution: 25,
    stateAction: 20,
    navigation: 15,
    collaboration: 15,
    artifact: 15,
    stabilityEfficiency: 10
  });
  assert.equal(bundle.scoring.thresholds.overall, 85);
  assert.equal(bundle.scoring.thresholds.caseVerdictCorrectness, 0.9);
  assert.equal(bundle.scoring.thresholds.falsePassedInjectedFailures, 0);
  assert.equal(bundle.scoring.thresholds.faultAttribution, 0.95);
  assert.equal(bundle.scoring.thresholds.artifactConsistency, 1);
  assert.equal(bundle.scoring.hardGates.length, 10);
  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(Object.isFrozen(bundle.scoring.weights), true);
});

test("materialization changes only declared JSON pointers", () => {
  const template = {
    planId: "PLAN-B02",
    cases: [{ caseId: "B02-C1", data: { runId: "{{runId}}", name: "Bench-{{runId}}" } }]
  };

  const output = materializeRunnerInput(
    template,
    "run-opaque",
    ["/cases/0/data/runId"]
  );

  assert.equal(output.cases[0].data.runId, "run-opaque");
  assert.equal(output.cases[0].data.name, "Bench-{{runId}}");
  assert.equal(template.cases[0].data.runId, "{{runId}}");
});

test("materialization rejects missing, duplicate, and prototype JSON pointers", () => {
  const template = { data: { runId: "{{runId}}" } };

  assert.throws(
    () => materializeRunnerInput(template, "run-a", ["/missing"]),
    { code: "RUN_ID_POINTER_INVALID" }
  );
  assert.throws(
    () => materializeRunnerInput(template, "run-a", ["/data/runId", "/data/runId"]),
    { code: "RUN_ID_POINTER_DUPLICATE" }
  );
  assert.throws(
    () => materializeRunnerInput(template, "run-a", ["/__proto__/polluted"]),
    { code: "RUN_ID_POINTER_UNSAFE" }
  );
  assert.equal(Object.prototype.polluted, undefined);
});

test("bundle validation rejects unknown event and attribution classes", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  const invalid = structuredClone(bundle);
  invalid.contracts.eventTypes.push("invented_event");

  assert.throws(() => validateBundle(invalid), { code: "BUNDLE_INVALID" });

  const invalidAttribution = structuredClone(bundle);
  invalidAttribution.contracts.attributionClasses.push("invented-class");
  assert.throws(() => validateBundle(invalidAttribution), {
    code: "BUNDLE_INVALID"
  });
});

test("bundle loading rejects symlinked version directories", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-bundle-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const outside = join(directory, "outside");
  const root = join(directory, "benchmark");
  await mkdir(outside);
  await mkdir(root);
  await writeFile(join(outside, "bundle.json"), "{}", "utf8");
  await symlink(outside, join(root, "v1"));

  await assert.rejects(loadBundle(root, "v1"), {
    code: "BUNDLE_PATH_UNSAFE"
  });
});
