import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  nextTrialActions,
  transitionTrial
} from "../src/trial/state-machine.mjs";
import { createTrialStore } from "../src/trial/store.mjs";

function manifest(overrides = {}) {
  return {
    schemaVersion: "trial-manifest-v1",
    trialId: "trial-B01",
    state: "created",
    revision: 0,
    timeline: [],
    ...overrides
  };
}

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), "trial-store-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { recursive: true, force: true });
  });
  return root;
}

test("state machine follows the main lifecycle with monotonic audit revisions", () => {
  let current = manifest();
  const states = [
    "prepared", "awaiting_scope_confirmation", "awaiting_runner", "running",
    "collecting", "evaluating", "evaluated", "resetting", "completed"
  ];
  for (const state of states) {
    current = transitionTrial(current, state, {
      at: `2026-09-01T00:00:${String(current.revision).padStart(2, "0")}.000Z`,
      reason: `test-${state}`
    });
  }
  assert.equal(current.revision, states.length);
  assert.deepEqual(current.timeline.map(({ to }) => to), states);
  assert.deepEqual(nextTrialActions(current), []);
});

test("invalid transitions fail closed while same idempotency key returns current state", () => {
  assert.throws(() => transitionTrial(manifest(), "running", { at: "2026-09-01T00:00:00.000Z" }), {
    code: "TRIAL_STATE_INVALID"
  });
  const prepared = transitionTrial(manifest(), "prepared", {
    at: "2026-09-01T00:00:00.000Z", idempotencyKey: "prepare-1"
  });
  assert.deepEqual(transitionTrial(prepared, "prepared", {
    at: "2026-09-01T00:00:01.000Z", idempotencyKey: "prepare-1"
  }), prepared);
  assert.throws(() => transitionTrial(prepared, "prepared", {
    at: "2026-09-01T00:00:01.000Z", idempotencyKey: "prepare-2"
  }), { code: "TRIAL_STATE_INVALID" });
});

test("running interruption requires explicit reconciliation and never implies replay", () => {
  const running = manifest({ state: "running", revision: 4 });
  const blocked = transitionTrial(running, "blocked", {
    at: "2026-09-01T00:00:04.000Z",
    reason: "runner-interrupted-with-uncertain-write",
    resumeState: "running",
    requiresManualReconciliation: true
  });
  assert.deepEqual(nextTrialActions(blocked), ["reconcile", "abandon", "status"]);
  assert.equal(blocked.blocking.requiresManualReconciliation, true);
});

test("store writes owner-only integrity-bound manifests and uses revision compare-and-swap", async (t) => {
  const root = await directory(t);
  const store = await createTrialStore({ root });
  await store.create(manifest());
  const created = await store.read("trial-B01");
  const paths = store.paths("trial-B01");

  assert.equal((await lstat(root)).mode & 0o777, 0o700);
  assert.equal((await lstat(paths.trialDirectory)).mode & 0o777, 0o700);
  assert.equal((await lstat(paths.manifestPath)).mode & 0o777, 0o600);
  assert.match(created.manifestDigest, /^sha256:[a-f0-9]{64}$/);

  const updated = await store.transact("trial-B01", 0, (current) =>
    transitionTrial(current, "prepared", { at: "2026-09-01T00:00:00.000Z" })
  );
  assert.equal(updated.revision, 1);
  await assert.rejects(store.transact("trial-B01", 0, (current) => current), {
    code: "TRIAL_STATE_INVALID"
  });
});

test("store detects manifest tampering and rejects unsafe identifiers", async (t) => {
  const root = await directory(t);
  const store = await createTrialStore({ root });
  await store.create(manifest());
  const path = store.paths("trial-B01").manifestPath;
  const changed = JSON.parse(await readFile(path, "utf8"));
  changed.state = "completed";
  await writeFile(path, `${JSON.stringify(changed)}\n`, { mode: 0o600 });
  await assert.rejects(store.read("trial-B01"), { code: "TRIAL_INPUT_CHANGED" });
  assert.throws(() => store.paths("../escape"), { code: "TRIAL_STATE_INVALID" });
});

test("store rejects group-readable manifests", async (t) => {
  const root = await directory(t);
  const store = await createTrialStore({ root });
  await store.create(manifest());
  await chmod(store.paths("trial-B01").manifestPath, 0o640);
  await assert.rejects(store.read("trial-B01"), { code: "TRIAL_INPUT_CHANGED" });
});

test("store recovers a lock left by a terminated process", async (t) => {
  const root = await directory(t);
  const store = await createTrialStore({ root });
  await store.create(manifest());
  await writeFile(store.paths("trial-B01").lockPath, `${JSON.stringify({
    pid: 99999999,
    acquiredAt: "2020-01-01T00:00:00.000Z"
  })}\n`, { mode: 0o600 });
  const updated = await store.transact("trial-B01", 0, (current) =>
    transitionTrial(current, "prepared", { at: "2026-09-01T00:00:00.000Z" })
  );
  assert.equal(updated.state, "prepared");
});
