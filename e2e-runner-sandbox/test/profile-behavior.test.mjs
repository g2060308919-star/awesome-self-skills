import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { createBusinessOperations } from "../src/domain/operations.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bundle = await loadBundle(join(packageRoot, "benchmark"), "v1");

async function harness(profileId) {
  const profile = bundle.profiles.find((entry) => entry.profileId === profileId);
  const coordinator = createRunCoordinator({ runIdFactory: () => `${profileId.toLowerCase()}-run` });
  await coordinator.prepare(profile);
  let next = 1;
  const operations = createBusinessOperations({
    coordinator,
    sessionIdFactory: () => `session-${next++}`,
    entityIdFactory: (prefix) => `${prefix}-DYNAMIC`
  });
  return { coordinator, operations };
}

async function login(operations, accountId = "acct-operator") {
  const result = await operations.login(accountId, { provenance: "manual-evaluator" });
  return { sessionId: result.session.id };
}

test("representative profiles produce their configured independent truth", async () => {
  const observed = {};

  {
    const { coordinator, operations } = await harness("B03");
    const context = await login(operations);
    const result = await operations.createCustomer(context, { name: "", email: "not-an-email", timezone: "UTC", status: "Active", owner: "Owen Operator", plan: "Core", tags: [] });
    observed.B03 = { code: result.code, fields: Object.keys(result.fields).sort(), mutations: coordinator.read().oracleEvents.filter(({ type }) => type === "state_mutation").length };
  }
  {
    const { coordinator, operations } = await harness("B04");
    const context = await login(operations, "acct-viewer");
    const result = await operations.changeProjectStatus(context, "PRJ-1001", "Active");
    observed.B04 = { code: result.code, status: coordinator.read().projects.find(({ id }) => id === "PRJ-1001").status };
  }
  {
    const { coordinator, operations } = await harness("B09");
    const context = await login(operations);
    const result = await operations.updateCustomer(context, "CUS-1012", { timezone: "Europe/London" });
    observed.B09 = { response: result.customer.timezone, persisted: coordinator.read().customers.find(({ id }) => id === "CUS-1012").timezone, fault: operations.faultStatus() };
  }
  {
    const { operations } = await harness("B10");
    const context = await login(operations);
    const first = await operations.readBusinessAudit(context);
    const second = await operations.readBusinessAudit(context);
    observed.B10 = { first: first.code, second: second.ok, fault: operations.faultStatus() };
  }
  {
    const { coordinator, operations } = await harness("B11");
    const context = await login(operations);
    let createCode;
    try {
      await operations.createCustomer(context, { name: "Bench-b11-run", email: "b11@example.invalid", timezone: "UTC", status: "Active", owner: "Owen Operator", plan: "Core", tags: [] });
    } catch (error) {
      createCode = error.code;
    }
    const created = coordinator.read().customers.find(({ id }) => id === "CUS-DYNAMIC");
    await operations.deleteCustomer(context, created.id);
    observed.B11 = { createCode, createdOnce: coordinator.read().oracleEvents.filter(({ type, operation }) => type === "state_mutation" && operation === "create").length, residual: coordinator.read().customers.some(({ id }) => id === created.id) };
  }
  {
    const { coordinator, operations } = await harness("B12");
    const firstContext = await login(operations);
    const first = await operations.updateProjectDescription(firstContext, "PRJ-1001", "Approved renewal workspace");
    const secondContext = await login(operations);
    const second = await operations.updateProjectDescription(secondContext, "PRJ-1001", "Approved renewal workspace");
    observed.B12 = { first: first.code, second: second.ok, description: coordinator.read().projects.find(({ id }) => id === "PRJ-1001").description };
  }
  {
    const { coordinator, operations } = await harness("B13");
    const context = await login(operations);
    const created = await operations.createCustomer(context, { name: "Bench-b13-run", email: "b13@example.invalid", timezone: "UTC", status: "Active", owner: "Owen Operator", plan: "Core", tags: [] });
    const cleanup = await operations.deleteCustomer(context, created.customer.id);
    observed.B13 = { cleanup: cleanup.code, residualId: cleanup.residualId, remains: coordinator.read().customers.some(({ id }) => id === created.customer.id) };
  }
  {
    const { coordinator, operations } = await harness("B18");
    const context = await login(operations);
    const started = await operations.changeProjectStatus(context, "PRJ-1001", "Active");
    const tickOne = await operations.runDueJobs();
    const tickTwo = await operations.runDueJobs();
    observed.B18 = { intermediate: started.project.status, firstCompleted: tickOne.completed.length, secondCompleted: tickTwo.completed.length, final: coordinator.read().projects.find(({ id }) => id === "PRJ-1001").status };
  }

  assert.deepEqual(observed, {
    B03: { code: "VALIDATION_REJECTED", fields: ["email", "name"], mutations: 0 },
    B04: { code: "PERMISSION_DENIED", status: "Inactive" },
    B09: { response: "Europe/London", persisted: "America/New_York", fault: { id: "success-without-persistence", armed: true, triggered: 1, consumed: true } },
    B10: { first: "TRANSIENT_READ_FAILURE", second: true, fault: { id: "transient-read-once", armed: true, triggered: 1, consumed: true } },
    B11: { createCode: "RESPONSE_DISCONNECTED", createdOnce: 1, residual: false },
    B12: { first: "MANUAL_LOGIN_REQUIRED", second: true, description: "Approved renewal workspace" },
    B13: { cleanup: "CLEANUP_CONFLICT", residualId: "CUS-DYNAMIC", remains: true },
    B18: { intermediate: "Processing", firstCompleted: 0, secondCompleted: 1, final: "Active" }
  });
});
