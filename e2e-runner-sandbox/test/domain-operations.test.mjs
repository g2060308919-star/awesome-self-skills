import assert from "node:assert/strict";
import test from "node:test";

import { login, setup } from "./helpers/domain-harness.mjs";

test("Viewer edit denial records attempt and authorization without mutation", async () => {
  const { coordinator, operations } = await setup();
  const viewer = await login(operations, "acct-viewer");

  const result = await operations.updateCustomer(viewer, "CUS-1001", { plan: "Scale" });

  assert.equal(result.code, "PERMISSION_DENIED");
  assert.equal(coordinator.read().customers[0].plan, "Core");
  const relevant = coordinator.read().oracleEvents.filter(
    ({ logicalOperation }) => logicalOperation === "customer.update"
  );
  assert.deepEqual(relevant.map(({ type }) => type), [
    "operation_attempt",
    "authorization_denial"
  ]);
});

test("customer validation rejection records both field messages and zero mutation", async () => {
  const { coordinator, operations } = await setup();
  const operator = await login(operations, "acct-operator");

  const result = await operations.createCustomer(operator, {
    name: "",
    email: "not-an-email",
    timezone: "UTC",
    status: "Active",
    owner: "Owen Operator",
    plan: "Core",
    tags: []
  });

  assert.equal(result.code, "VALIDATION_REJECTED");
  assert.deepEqual(Object.keys(result.fields).sort(), ["email", "name"]);
  assert.equal(coordinator.read().customers.length, 1);
  assert.deepEqual(
    coordinator.read().oracleEvents.filter(({ logicalOperation }) => logicalOperation === "customer.create").map(({ type }) => type),
    ["operation_attempt", "validation_rejection"]
  );
});

test("approval submission commits mutation, notification event, and outbox exactly once", async () => {
  const { coordinator, operations } = await setup();
  const operator = await login(operations, "acct-operator");

  const result = await operations.submitApproval(operator, {
    targetType: "project",
    targetId: "PRJ-1001",
    action: "activate"
  });

  assert.equal(result.ok, true);
  const state = coordinator.read();
  assert.equal(state.approvals.length, 1);
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].idempotencyKey, `run-domain:${result.approval.id}:submitted`);
  assert.deepEqual(
    state.oracleEvents.filter(({ logicalOperation }) => logicalOperation === "approval.submit").map(({ type }) => type),
    ["operation_attempt", "state_mutation", "notification_enqueued"]
  );
});

test("approver decision and external action keep their provenance distinct", async () => {
  const { coordinator, operations } = await setup();
  const operator = await login(operations, "acct-operator");
  const approver = await login(operations, "acct-approver");
  const submitted = await operations.submitApproval(operator, {
    targetType: "project",
    targetId: "PRJ-1001",
    action: "activate"
  });

  const decision = await operations.decideApproval(
    approver,
    submitted.approval.id,
    "Approved"
  );
  assert.equal(decision.ok, true);
  assert.equal(decision.approval.decisionBy, "acct-approver");

  const external = await operations.completeExternalAction({
    approvalId: submitted.approval.id,
    decision: "Approved",
    actor: "external-approver"
  });
  assert.equal(external.code, "ALREADY_DECIDED");
  assert.equal(
    coordinator.read().oracleEvents.filter(({ type }) => type === "external_action").length,
    0
  );
  assert.equal(
    coordinator.read().oracleEvents.filter(
      ({ type, logicalOperation }) =>
        type === "operation_attempt" &&
        logicalOperation === "approval.external-decision"
    ).length,
    1
  );
});

test("out-of-whitelist protected mutation is rejected and audited", async () => {
  const { coordinator, operations } = await setup();
  const operator = await login(operations, "acct-operator");

  const result = await operations.updateCustomer(operator, "CUS-1001", {
    owner: "Ada Administrator"
  });

  assert.equal(result.code, "MUTATION_NOT_ALLOWED");
  assert.equal(coordinator.read().customers[0].owner, "Owen Operator");
  assert.equal(
    coordinator.read().oracleEvents.at(-1).outcome,
    "rejected-out-of-whitelist"
  );
});

test("role changes take effect on the next authorization check without changing account", async () => {
  const { coordinator, operations } = await setup();
  const viewer = await login(operations, "acct-viewer");

  await operations.changeAccountRole("acct-viewer", "Operator", "evaluator");
  const updated = await operations.updateCustomer(viewer, "CUS-1001", { plan: "Scale" });

  assert.equal(updated.ok, true);
  assert.equal(coordinator.read().customers[0].plan, "Scale");
  assert.ok(
    coordinator.read().oracleEvents.some(
      ({ type, outcome }) => type === "session_event" && outcome === "role-changed"
    )
  );
});
