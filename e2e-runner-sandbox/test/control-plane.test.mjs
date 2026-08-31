import assert from "node:assert/strict";
import { lstat, readFile, rm } from "node:fs/promises";
import test from "node:test";

import { createControlClient } from "../src/control/client.mjs";
import { createRuntimeFiles } from "../src/control/runtime-files.mjs";
import { createControlServer } from "../src/control/server.mjs";
import { profile, setup } from "./helpers/domain-harness.mjs";

async function startControl(t, profileResolver = async (profileId) => profile({ profileId })) {
  const harness = await setup();
  const runtime = await createRuntimeFiles({ businessUrl: "http://127.0.0.1:49001" });
  t.after(() => rm(runtime.runtimeDirectory, { recursive: true, force: true }));
  const server = createControlServer({
    coordinator: harness.coordinator,
    operations: harness.operations,
    socketPath: runtime.socketPath,
    token: runtime.token,
    profileResolver,
    onStop: () => undefined
  });
  await server.listen();
  t.after(() => server.close());
  const client = createControlClient({
    socketPath: runtime.socketPath,
    token: runtime.token
  });
  return { ...harness, runtime, server, client };
}

test("control socket and capability are owner-only and bad tokens fail closed", async (t) => {
  const { runtime, client } = await startControl(t);

  assert.equal((await lstat(runtime.runtimeDirectory)).mode & 0o777, 0o700);
  assert.equal((await lstat(runtime.socketPath)).mode & 0o777, 0o600);
  assert.equal((await lstat(runtime.capabilityPath)).mode & 0o777, 0o600);
  assert.equal((await readFile(runtime.capabilityPath, "utf8")).trim(), runtime.token);
  assert.equal((await client.request("status", {})).lifecycle, "active");

  const unauthorized = createControlClient({
    socketPath: runtime.socketPath,
    token: "0".repeat(64)
  });
  await assert.rejects(unauthorized.request("status", {}), {
    code: "CONTROL_UNAUTHORIZED"
  });
});

test("control inspection returns normalized snapshots, events, outbox, and fault state", async (t) => {
  const { client, operations } = await startControl(t);
  await operations.login("acct-operator", { provenance: "manual-evaluator" });

  const snapshot = await client.request("snapshot", { kind: "current" });
  const events = await client.request("events", {});
  const outbox = await client.request("outbox", {});
  const fault = await client.request("fault", {});

  assert.match(snapshot.digest, /^[a-f0-9]{64}$/);
  assert.ok(events.some(({ type }) => type === "session_event"));
  assert.deepEqual(outbox, []);
  assert.equal(fault, null);
});

test("run canaries are available only through the authenticated evaluator command", async (t) => {
  const { client } = await startControl(t);
  const registry = await client.request("canaries", {});
  assert.deepEqual(registry.canaries.map(({ prefix }) => prefix), ["BENCH_SECRET_", "BENCH_SENSITIVE_"]);
  assert.ok(registry.canaries.every(({ token }) => /_[0-9A-HJKMNP-TV-Z]{20}_END$/.test(token)));
  assert.equal(JSON.stringify(await client.request("status", {})).includes(registry.canaries[0].token), false);
});

test("role changes and session expiry are available only as authenticated evaluator commands", async (t) => {
  const { client, operations, coordinator } = await startControl(t);
  const login = await operations.login("acct-viewer", { provenance: "manual-evaluator" });

  const changed = await client.request("set-role", {
    accountId: "acct-viewer",
    role: "Operator"
  });
  assert.equal(changed.account.role, "Operator");

  const expired = await client.request("expire-session", {
    sessionId: login.session.id
  });
  assert.equal(expired.ok, true);
  assert.equal(coordinator.read().sessions[0].active, false);
});

test("the evaluator can advance deterministic delayed jobs", async (t) => {
  const delayedProfile = profile({
    profileId: "B18",
    fault: {
      id: "delayed-completion",
      effect: "delayed-completion",
      logicalOperation: "project.status.update",
      phase: "before-commit",
      occurrence: 1,
      triggered: 0,
      consumed: false,
      delayTicks: 2
    }
  });
  const { client, operations, coordinator } = await startControl(t, async () => delayedProfile);
  await client.request("reset", { profileId: "B18" });
  const login = await operations.login("acct-operator", { provenance: "manual-evaluator" });
  await operations.changeProjectStatus({ sessionId: login.session.id }, "PRJ-1001", "Active");

  assert.equal(coordinator.read().projects.find(({ id }) => id === "PRJ-1001").status, "Processing");
  assert.deepEqual((await client.request("run-jobs", { actor: "evaluator-worker" })).completed, []);
  assert.deepEqual((await client.request("run-jobs", { actor: "evaluator-worker" })).completed, ["PRJ-1001"]);
  assert.equal(coordinator.read().projects.find(({ id }) => id === "PRJ-1001").status, "Active");
});

test("prepare and reset resolve named profiles and advance the epoch", async (t) => {
  const { client } = await startControl(t);

  const reset = await client.request("reset", { profileId: "B02" });

  assert.equal(reset.profileId, "B02");
  assert.equal(reset.epoch, 2);
  assert.equal((await client.request("status", {})).profileId, "B02");
});

test("unknown commands and oversized protocol messages are rejected", async (t) => {
  const { client } = await startControl(t);

  await assert.rejects(client.request("read-any-file", { path: "/tmp/example" }), {
    code: "CONTROL_COMMAND_UNKNOWN"
  });
  await assert.rejects(
    client.request("status", { padding: "x".repeat(1024 * 1024) }),
    { code: "CONTROL_MESSAGE_TOO_LARGE" }
  );
});

test("runtime metadata never serializes the evaluator capability", async (t) => {
  const { runtime } = await startControl(t);
  const metadata = await readFile(runtime.metadataPath, "utf8");

  assert.doesNotMatch(metadata, new RegExp(runtime.token));
  assert.deepEqual(JSON.parse(metadata), {
    businessUrl: "http://127.0.0.1:49001",
    socketPath: runtime.socketPath,
    protocolVersion: 1
  });
});
