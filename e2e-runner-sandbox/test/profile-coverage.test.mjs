import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { sha256File } from "../src/bundle/digests.mjs";
import { validateBundle } from "../src/bundle/validate-bundle.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";
import { ATTRIBUTION_CLASSES } from "../src/shared/constants.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const benchmarkRoot = join(packageRoot, "benchmark");
const bundleRoot = join(benchmarkRoot, "v1");

const REQUIRED_PROFILES = Object.freeze([
  "B01", "B02", "B03", "B04", "B05-reachable", "B05-unavailable",
  "B06", "B07", "B08-preflight", "B08-observed", "B09", "B10", "B11",
  "B12", "B13", "B14", "B15-production", "B15-unknown", "B15-conflict",
  "B15-unresolved", "B16", "B17-separate-accounts", "B17-role-change", "B18",
  "H01", "H02"
]);

test("the v1 matrix contains every required independent truth", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  assert.deepEqual(bundle.profiles.map((profile) => profile.profileId), REQUIRED_PROFILES);
  assert.deepEqual(
    [...new Set(bundle.executionMatrix.units.map((unit) => unit.profileId))].sort(),
    [...REQUIRED_PROFILES].sort()
  );
});

test("every profile joins runner input, Oracle, assistance, fixture, UI, and fault truth", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  for (const profile of bundle.profiles) {
    assert.equal(profile.runnerInput.planId, profile.oracle.planId, profile.profileId);
    assert.ok(profile.runnerInput.cases.length > 0, profile.profileId);
    assert.ok(profile.runnerInput.cases.every((item) => item.steps.length > 0), profile.profileId);
    assert.ok(profile.runnerInput.cases.every((item) => item.assertions.length > 0), profile.profileId);
    assert.ok(profile.oracle.assertions.length > 0, profile.profileId);
    assert.ok(Array.isArray(profile.oracle.allowedMutations), profile.profileId);
    assert.ok(Array.isArray(profile.oracle.expectedEvents), profile.profileId);
    assert.ok(profile.oracle.budgets.activeElapsedMs > 0, profile.profileId);
    assert.ok(profile.oracle.budgets.browserReads >= 0, profile.profileId);
    assert.ok(ATTRIBUTION_CLASSES.includes(profile.oracle.expectedAttribution), profile.profileId);
    assert.ok(["Passed", "Failed", "Inconclusive", "Not Run"].includes(
      profile.oracle.expectedCaseVerdicts[0].verdict
    ), profile.profileId);
    assert.equal(profile.fixture.version, "core-v1", profile.profileId);
    assert.ok(["northstar", "harbor"].includes(profile.uiVariant), profile.profileId);
    assert.equal(profile.uiVariantDefinition.id, profile.uiVariant, profile.profileId);
    assert.equal(profile.assistance.profileId, profile.profileId);
    assert.match(profile.oracle.inputTemplateDigest, /^[a-f0-9]{64}$/, profile.profileId);
    assert.ok(Object.values(profile.oracle.componentDigests).every((digest) => /^[a-f0-9]{64}$/.test(digest)), profile.profileId);
  }
});

test("Runner inputs contain stable semantic IDs and only declared run substitutions", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  for (const profile of bundle.profiles) {
    const ids = [profile.runnerInput.planId];
    for (const caseEntry of profile.runnerInput.cases) {
      ids.push(caseEntry.caseId);
      ids.push(...caseEntry.steps.map((step) => step.stepId));
      ids.push(...caseEntry.assertions.map((assertion) => assertion.assertionId));
    }
    assert.equal(new Set(ids).size, ids.length, profile.profileId);
    assert.deepEqual(profile.runnerInput.runIdPointers, profile.oracle.runIdPointers, profile.profileId);
    assert.doesNotMatch(JSON.stringify(profile.runnerInput), /selector|oracle|control|faultProfile|stableId/i);
    for (const pointer of profile.runnerInput.runIdPointers) {
      assert.match(pointer, /^\/cases\/\d+\/(?:data\/)?[A-Za-z0-9_-]+$/);
    }
  }
});

test("special profiles encode the frozen benchmark truths", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  const byId = Object.fromEntries(bundle.profiles.map((profile) => [profile.profileId, profile]));
  const mercury = byId.B07.fixture.projects.filter((project) => project.name === "Mercury");
  assert.deepEqual(mercury.map((project) => project.id), ["PRJ-MER-1042", "PRJ-MER-2087"]);
  for (const profileId of ["B02", "B11", "B13"]) {
    assert.equal(byId[profileId].fixture.customers.some(({ id }) => id === "CUS-RUN-SCOPED"), false, profileId);
  }
  assert.equal(byId["B17-role-change"].fixture.customers.some(({ id }) => id === "CUS-RUN-SCOPED"), true);
  assert.equal(byId.B14.fixture.projects.find(({ id }) => id === "PRJ-1001").status, "Active");
  assert.deepEqual(byId.B16.runnerInput.cases.map((entry) => entry.caseId), ["B16-A", "B16-B", "B16-C"]);
  assert.deepEqual(byId.B16.runnerInput.cases[2].dependsOn, ["B16-A"]);
  assert.equal(byId["B15-production"].oracle.budgets.chromeStarts, 0);
  assert.equal(byId["B15-unresolved"].oracle.budgets.businessRequests, 0);
  assert.equal(byId.H02.oracle.excludeFromNumericScoring, true);
});

test("SHA256SUMS covers every immutable v1 JSON component and matches bytes", async () => {
  const sums = JSON.parse(await readFile(join(bundleRoot, "SHA256SUMS.json"), "utf8"));
  assert.deepEqual(Object.keys(sums), [...Object.keys(sums)].sort());
  assert.equal(Object.hasOwn(sums, "SHA256SUMS.json"), false);
  for (const [relativePath, expected] of Object.entries(sums)) {
    assert.match(expected, /^[a-f0-9]{64}$/);
    assert.equal(await sha256File(join(bundleRoot, relativePath)), expected, relativePath);
  }
  for (const required of [
    "bundle.json", "execution-matrix.json", "profiles/index.json", "runner-inputs/index.json",
    "oracles/index.json", "assistance/index.json", "fixtures/core-v1.json",
    "ui-variants/northstar.json", "ui-variants/harbor.json"
  ]) assert.ok(Object.hasOwn(sums, required), required);
});

test("bundle validation rejects cyclic dependencies and undeclared matrix profiles", async () => {
  const bundle = structuredClone(await loadBundle(benchmarkRoot, "v1"));
  bundle.profiles.find(({ profileId }) => profileId === "B16").runnerInput.cases[0].dependsOn = ["B16-C"];
  assert.throws(() => validateBundle(bundle), { code: "BUNDLE_INVALID" });

  const matrixBundle = structuredClone(await loadBundle(benchmarkRoot, "v1"));
  matrixBundle.executionMatrix.units[0].profileId = "B99";
  assert.throws(() => validateBundle(matrixBundle), { code: "BUNDLE_INVALID" });
});

test("a loaded run materializes the exact run-scoped fixture value without changing the bundle", async () => {
  const bundle = await loadBundle(benchmarkRoot, "v1");
  const profile = bundle.profiles.find(({ profileId }) => profileId === "B17-role-change");
  const coordinator = createRunCoordinator({ runIdFactory: () => "opaque-4102" });

  await coordinator.prepare(profile);

  assert.equal(
    coordinator.read().customers.find(({ id }) => id === "CUS-RUN-SCOPED").name,
    "Bench-opaque-4102"
  );
  assert.equal(profile.fixture.customers.find(({ id }) => id === "CUS-RUN-SCOPED").name, "Bench-{{runId}}");
});
