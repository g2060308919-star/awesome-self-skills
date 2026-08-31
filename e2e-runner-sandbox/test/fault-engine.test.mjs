import assert from "node:assert/strict";
import test from "node:test";

import { login, setup } from "./helpers/domain-harness.mjs";

function fault(effect, overrides = {}) {
  return {
    id: `fault-${effect}`,
    logicalOperation: "project.status.update",
    actorId: "acct-operator",
    targetId: "PRJ-1001",
    occurrence: 1,
    phase: "after-commit-before-response",
    effect,
    maximumWaitMs: 1_000,
    triggered: 0,
    consumed: false,
    ...overrides
  };
}

test("commit-then-disconnect changes state once and consumes the exact fault", async () => {
  const { coordinator, operations } = await setup({
    fault: fault("commit-then-disconnect")
  });
  const operator = await login(operations, "acct-operator");

  await assert.rejects(
    operations.changeProjectStatus(operator, "PRJ-1001", "Active"),
    { code: "RESPONSE_DISCONNECTED" }
  );

  assert.equal(coordinator.read().projects[0].status, "Active");
  assert.equal(
    coordinator.read().oracleEvents.filter(({ type, targetId }) =>
      type === "state_mutation" && targetId === "PRJ-1001").length,
    1
  );
  assert.deepEqual(operations.faultStatus(), {
    id: "fault-commit-then-disconnect",
    armed: true,
    triggered: 1,
    consumed: true
  });
});

test("background polling does not consume a business-operation transient fault", async () => {
  const { operations } = await setup({
    fault: fault("transient-read", {
      logicalOperation: "business-audit.read",
      targetId: null,
      phase: "response"
    })
  });
  const operator = await login(operations, "acct-operator");

  assert.equal((await operations.listProjects(operator, { source: "background-poll" })).ok, true);
  assert.equal(operations.faultStatus().consumed, false);
  const first = await operations.readBusinessAudit(operator);
  assert.equal(first.code, "TRANSIENT_READ_FAILURE");
  assert.equal(operations.faultStatus().consumed, true);
  assert.equal((await operations.readBusinessAudit(operator)).ok, true);
});

test("success-without-persistence returns success but records no mutation", async () => {
  const { coordinator, operations } = await setup({
    fault: fault("success-without-persistence", {
      logicalOperation: "customer.update",
      targetId: "CUS-1001",
      phase: "before-commit"
    })
  });
  const operator = await login(operations, "acct-operator");

  const result = await operations.updateCustomer(operator, "CUS-1001", { plan: "Scale" });

  assert.equal(result.ok, true);
  assert.equal(result.persistence, "suppressed-by-profile");
  assert.equal(coordinator.read().customers[0].plan, "Core");
  assert.equal(
    coordinator.read().oracleEvents.filter(({ type }) => type === "state_mutation").length,
    0
  );
});

test("configured session expiry happens before authorization and before mutation", async () => {
  const { coordinator, operations } = await setup({
    fault: fault("expire-session", {
      logicalOperation: "project.status.update",
      phase: "before-authorization"
    })
  });
  const operator = await login(operations, "acct-operator");

  const result = await operations.changeProjectStatus(operator, "PRJ-1001", "Active");

  assert.equal(result.code, "MANUAL_LOGIN_REQUIRED");
  assert.equal(coordinator.read().projects[0].status, "Inactive");
  assert.equal(coordinator.read().sessions[0].active, false);
});

test("fault occurrence and actor match exactly", async () => {
  const { operations } = await setup({
    fault: fault("transient-read", {
      logicalOperation: "business-audit.read",
      targetId: null,
      actorId: "acct-viewer",
      occurrence: 2,
      phase: "response"
    })
  });
  const viewer = await login(operations, "acct-viewer");
  const operator = await login(operations, "acct-operator");

  assert.equal((await operations.readBusinessAudit(operator)).ok, true);
  assert.equal(operations.faultStatus().triggered, 0);
  assert.equal((await operations.readBusinessAudit(viewer)).ok, true);
  assert.equal((await operations.readBusinessAudit(viewer)).code, "TRANSIENT_READ_FAILURE");
  assert.equal(operations.faultStatus().triggered, 1);
});
