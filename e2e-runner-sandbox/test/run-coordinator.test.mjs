import assert from "node:assert/strict";
import test from "node:test";

import { createLogicalClock } from "../src/domain/logical-clock.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";

function fixture(customerId = "CUS-1001") {
  return {
    tenant: { id: "TENANT-BENCH", name: "Northstar Test Works" },
    accounts: [{ id: "acct-viewer", displayName: "Vera Viewer", roles: ["Viewer"] }],
    customers: [{ id: customerId, name: "Acme Synthetic", status: "Active" }],
    projects: [],
    approvals: [],
    sessions: [],
    businessAudit: [],
    oracleEvents: [],
    outbox: [],
    delayedJobs: []
  };
}

function profile(overrides = {}) {
  return {
    profileId: "B01",
    fixtureVersion: "core-v1",
    uiVariant: "northstar",
    randomSeed: 4101,
    locale: "en-US",
    timezone: "UTC",
    fault: null,
    protectedRecords: ["customer:CUS-1001"],
    allowedMutations: [],
    fixture: fixture(),
    ...overrides
  };
}

function coordinatorWithIds(...ids) {
  const queue = [...ids];
  return createRunCoordinator({
    clock: createLogicalClock("2026-08-31T00:00:00.000Z"),
    runIdFactory: () => queue.shift()
  });
}

test("prepare installs one run and records a deterministic pre-snapshot", async () => {
  const coordinator = coordinatorWithIds("run-a");

  const run = await coordinator.prepare(profile());

  assert.equal(run.runId, "run-a");
  assert.equal(run.epoch, 1);
  assert.equal(run.lifecycle, "active");
  assert.equal(run.preSnapshot.digest.length, 64);
  assert.equal(coordinator.status().acceptingBusinessRequests, true);
  assert.equal(coordinator.read().customers[0].id, "CUS-1001");
});

test("a transaction captured before reset cannot commit into the next fixture", async () => {
  const coordinator = coordinatorWithIds("run-a", "run-b");
  await coordinator.prepare(profile());
  const gate = Promise.withResolvers();
  const entered = Promise.withResolvers();

  const stale = coordinator.transact(
    { logicalOperation: "customer.create", runId: "run-a" },
    async (draft) => {
      entered.resolve();
      await gate.promise;
      draft.customers.push({ id: "CUS-STALE", name: "Old run" });
      return { created: "CUS-STALE" };
    }
  );
  await entered.promise;
  await coordinator.reset(profile({ fixture: fixture("CUS-NEW") }));
  gate.resolve();

  await assert.rejects(stale, { code: "RUN_ABORTED" });
  assert.equal(coordinator.read().customers.some(({ id }) => id === "CUS-STALE"), false);
  assert.equal(coordinator.read().customers[0].id, "CUS-NEW");
  assert.equal(coordinator.status().epoch, 2);
});

test("failed reset fences business operations until explicit recovery succeeds", async () => {
  const coordinator = coordinatorWithIds("run-a", "run-b", "run-c");
  await coordinator.prepare(profile());

  await assert.rejects(
    coordinator.reset(profile({ fixture: { customers: [] } })),
    { code: "RESET_FAILED" }
  );
  assert.equal(coordinator.status().lifecycle, "failed-reset");
  await assert.rejects(
    coordinator.transact({ logicalOperation: "customer.read" }, () => {}),
    { code: "SANDBOX_UNAVAILABLE" }
  );
  await assert.rejects(coordinator.prepare(profile()), { code: "SANDBOX_UNAVAILABLE" });

  const recovered = await coordinator.recoverPrepare(profile());
  assert.equal(recovered.lifecycle, "active");
  assert.equal(recovered.runId, "run-c");
});

test("a reset operation is idempotent after its response is lost", async () => {
  const coordinator = coordinatorWithIds("run-a", "run-b", "run-c");
  await coordinator.prepare(profile());
  const intent = {
    operationId: "trial-reset-1",
    expectedRunId: "run-a",
    expectedEpoch: 1
  };

  const first = await coordinator.reset(profile(), intent);
  const repeated = await coordinator.reset(profile(), intent);

  assert.equal(first.runId, "run-b");
  assert.equal(repeated.runId, "run-b");
  assert.equal(repeated.epoch, 2);
});

test("repeating the same reset intent explicitly recovers failed-reset", async () => {
  let canaryCalls = 0;
  const coordinator = createRunCoordinator({
    clock: createLogicalClock("2026-08-31T00:00:00.000Z"),
    runIdFactory: (() => {
      const ids = ["run-a", "run-b", "run-c"];
      return () => ids.shift();
    })(),
    canaryFactory: (prefix) => {
      canaryCalls += 1;
      if (canaryCalls === 3) throw new Error("one-shot fixture failure");
      return { canaryId: `${prefix}-${canaryCalls}`, prefix: `${prefix}_`, token: `${prefix}_${canaryCalls}_END` };
    }
  });
  await coordinator.prepare(profile());
  const intent = {
    operationId: "trial-reset-recover",
    expectedRunId: "run-a",
    expectedEpoch: 1
  };

  await assert.rejects(coordinator.reset(profile(), intent), { code: "RESET_FAILED" });
  assert.equal(coordinator.status().lifecycle, "failed-reset");

  const recovered = await coordinator.reset(profile(), intent);
  assert.equal(recovered.lifecycle, "active");
  assert.equal(recovered.runId, "run-c");
  assert.equal(recovered.epoch, 2);
});

test("reset removes sessions, events, outbox, jobs, and one-shot fault state", async () => {
  const coordinator = coordinatorWithIds("run-a", "run-b");
  await coordinator.prepare(profile({ fault: { id: "transient", consumed: true } }));
  await coordinator.transact({ logicalOperation: "test.seed" }, (draft) => {
    draft.sessions.push({ id: "session-old" });
    draft.oracleEvents.push({ id: "event-old" });
    draft.outbox.push({ id: "outbox-old" });
    draft.delayedJobs.push({ id: "job-old" });
  });

  await coordinator.reset(profile({ fault: null }));
  const state = coordinator.read();
  assert.deepEqual(state.sessions, []);
  assert.deepEqual(state.oracleEvents, []);
  assert.deepEqual(state.outbox, []);
  assert.deepEqual(state.delayedJobs, []);
  assert.equal(coordinator.status().fault, null);
});

test("preparing the same fixture on independent coordinators yields one canonical hash", async () => {
  const first = coordinatorWithIds("run-a");
  const second = coordinatorWithIds("run-b");

  const firstRun = await first.prepare(profile());
  const secondRun = await second.prepare(profile());

  assert.equal(firstRun.preSnapshot.digest, secondRun.preSnapshot.digest);
  assert.deepEqual(firstRun.preSnapshot.normalized, secondRun.preSnapshot.normalized);
});

test("abort invalidates the run and rejects new business work", async () => {
  const coordinator = coordinatorWithIds("run-a");
  await coordinator.prepare(profile());

  await coordinator.abort("evaluation cancelled");

  assert.equal(coordinator.status().lifecycle, "aborted");
  await assert.rejects(
    coordinator.transact({ logicalOperation: "customer.read" }, () => {}),
    { code: "SANDBOX_UNAVAILABLE" }
  );
});
