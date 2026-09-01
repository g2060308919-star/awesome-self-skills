import assert from "node:assert/strict";

import { createBusinessOperations } from "../../src/domain/operations.mjs";
import { createRunCoordinator } from "../../src/domain/run-coordinator.mjs";

export function profile(overrides = {}) {
  return {
    profileId: "DOMAIN",
    fixtureVersion: "core-v1",
    uiVariant: "northstar",
    randomSeed: 4201,
    locale: "en-US",
    timezone: "UTC",
    fault: null,
    protectedRecords: ["customer:CUS-1001", "project:PRJ-1001"],
    allowedMutations: [
      { entity: "customer", target: "CUS-1001", field: "plan", operation: "update", maxCount: 1 },
      { entity: "project", target: "PRJ-1001", field: "status", operation: "update", maxCount: 1 },
      { entity: "approval", target: "created", field: "*", operation: "create", maxCount: 1 },
      { entity: "approval", target: "created", field: "status", operation: "update", maxCount: 1 }
    ],
    fixture: {
      tenant: { id: "TENANT-BENCH", name: "Northstar Test Works" },
      accounts: [
        { id: "acct-viewer", displayName: "Vera Viewer", role: "Viewer" },
        { id: "acct-operator", displayName: "Owen Operator", role: "Operator" },
        { id: "acct-approver", displayName: "Ari Approver", role: "Approver" },
        { id: "acct-admin", displayName: "Ada Administrator", role: "Administrator" }
      ],
      customers: [
        {
          id: "CUS-1001",
          name: "Acme Synthetic",
          email: "ops@acme.invalid",
          timezone: "UTC",
          status: "Active",
          owner: "Owen Operator",
          plan: "Core",
          tags: ["benchmark"]
        }
      ],
      projects: [
        {
          id: "PRJ-1001",
          name: "Mercury",
          customerId: "CUS-1001",
          description: "Synthetic migration",
          status: "Inactive"
        }
      ],
      approvals: [],
      sessions: [],
      businessAudit: [],
      oracleEvents: [],
      outbox: [],
      delayedJobs: []
    },
    ...overrides
  };
}

export async function setup(overrides = {}) {
  const coordinator = createRunCoordinator({ runIdFactory: () => "run-domain" });
  await coordinator.prepare(profile(overrides));
  let sessionNumber = 1;
  let entityNumber = 1;
  const operations = createBusinessOperations({
    coordinator,
    sessionIdFactory: () => `session-${sessionNumber++}`,
    entityIdFactory: (prefix) => `${prefix}-${String(entityNumber++).padStart(4, "0")}`
  });
  return { coordinator, operations };
}

export async function login(operations, accountId) {
  const result = await operations.login(accountId, { provenance: "manual-evaluator" });
  assert.equal(result.ok, true);
  return { sessionId: result.session.id };
}
