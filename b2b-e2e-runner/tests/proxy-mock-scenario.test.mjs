import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ProxyListener } from "../scripts/cdp-fetch-proxy.mjs";
import { MockScenarioEngine, compileMockScenario } from "../scripts/lib/mock-scenario.mjs";

class FakeCdp {
  constructor(targetId) {
    this.targetId = targetId;
    this.calls = [];
    this.handlers = new Map();
  }

  async command(method, params = {}, sessionId) {
    this.calls.push({ method, params, sessionId });
    if (method === "Target.attachToTarget") return { sessionId: `session-${this.targetId}` };
    return {};
  }

  on(sessionId, method, handler) {
    this.calls.push({ method: "__on__", params: { event: method }, sessionId });
    const key = `${sessionId}:${method}`;
    this.handlers.set(key, handler);
    return () => this.handlers.delete(key);
  }

  async emit(sessionId, method, event) {
    const handler = this.handlers.get(`${sessionId}:${method}`);
    if (!handler) return false;
    await handler(event);
    return true;
  }

  close() {}
}

function engine(options) {
  return new MockScenarioEngine(compileMockScenario({
    schema_version: "mock-scenario-v1", scenario_id: "scenario-1", revision: 1,
    run_id: "RUN-1", case_id: "CASE-1", attempt_id: "attempt-1",
    candidate_checkpoint_ids: ["CASE-1/s/o"], supporting_checkpoint_ids: [], initial_state: { saved: false },
    routes: [{
      route_id: "save", match: {
        origin: "https://fixture.test", pathname: "/api/save", method: "POST", query: {},
        body: { rules: [{ pointer: "/name", presence: "required", type: "string" }], allowed_extra_pointers: [] }
      },
      effect: [{ op: "set", path: "/saved", value: true }],
      response: { status: 201, headers: { "x-mock": "yes" }, body: { saved: { $state: "/saved" } } },
      provenance: { source_refs: ["observed-network"], synthetic_values: [] }
    }],
    passthrough: [{
      passthrough_id: "safe-config", match: {
        origin: "https://fixture.test", pathname: "/api/config", method: "GET", query: {},
        body: { rules: [], allowed_extra_pointers: [] }
      }, basis_refs: ["confirmed-read-only"]
    }],
    provenance: { source_refs: ["observed-network"], synthetic_values: [] }
  }), options);
}

function listenerConfig(root, client, receipts, cleanupOrder) {
  return {
    endpoint: "http://127.0.0.1:9222",
    browserWebSocketUrl: "ws://127.0.0.1/devtools/browser/test",
    targetId: "A",
    rules: [],
    lockRoot: root,
    runId: "RUN-1",
    clientFactory: async () => client,
    mockScenarioEngine: engine(),
    mockProxyCycleId: "proxy-cycle-1",
    mockReceiptSink: async receipt => receipts.push(receipt),
    prepareOwnedTargetForCleanup: async () => cleanupOrder.push("blank-owned-target"),
    verifyOwnedTargetForCleanup: async () => true
  };
}

test("v1.1 AC-23/24/25/26: Mock decides at Request stage, fulfills before upstream, and blocks unknown business traffic", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-mock-request-"));
  const client = new FakeCdp("A");
  const receipts = [];
  const cleanupOrder = [];
  const listener = new ProxyListener(listenerConfig(root, client, receipts, cleanupOrder));
  try {
    await listener.start();
    const pausedHandlerIndex = client.calls.findIndex(call => call.method === "__on__" && call.params.event === "Fetch.requestPaused");
    const fetchEnableIndex = client.calls.findIndex(call => call.method === "Fetch.enable");
    assert.ok(pausedHandlerIndex >= 0 && pausedHandlerIndex < fetchEnableIndex,
      "Mock requestPaused handler must exist before Fetch is enabled");
    const fetchEnable = client.calls.find(call => call.method === "Fetch.enable");
    assert.deepEqual(fetchEnable.params.patterns, [{ urlPattern: "https://fixture.test/api/save*", requestStage: "Request" }, { urlPattern: "https://fixture.test/api/config*", requestStage: "Request" }]);

    await client.emit("session-A", "Fetch.requestPaused", {
      requestId: "request-save",
      request: {
        url: "https://fixture.test/api/save", method: "POST", headers: { "content-type": "application/json" }, postData: JSON.stringify({ name: "synthetic" })
      }
    });
    const fulfill = client.calls.find(call => call.method === "Fetch.fulfillRequest" && call.params.requestId === "request-save");
    assert.equal(fulfill.params.responseCode, 201);
    assert.deepEqual(JSON.parse(Buffer.from(fulfill.params.body, "base64")), { saved: true });
    assert.equal(client.calls.some(call => call.method === "Fetch.continueRequest" && call.params.requestId === "request-save"), false,
      "mocked write must never be forwarded to real upstream");
    assert.equal(receipts.length, 1);

    await client.emit("session-A", "Fetch.requestPaused", {
      requestId: "request-unknown",
      request: { url: "https://fixture.test/api/delete-all", method: "GET", headers: {} }
    });
    assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "request-unknown"), true);
    assert.equal(client.calls.some(call => call.method === "Fetch.continueRequest" && call.params.requestId === "request-unknown"), false);

    await client.emit("session-A", "Fetch.requestPaused", {
      requestId: "request-safe",
      request: { url: "https://fixture.test/api/config", method: "GET", headers: {} }
    });
    assert.equal(client.calls.some(call => call.method === "Fetch.continueRequest" && call.params.requestId === "request-safe"), true);
    assert.deepEqual(listener.status().counts, {
      requestMatched: 0, responseMatched: 0, continued: 1, fulfilled: 1, ruleErrors: 0,
      mockFulfilled: 1, mockBlocked: 1, mockPassthrough: 1
    });
  } finally {
    await listener.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.1 AC-27/31: Mock remains single-Target and cleanup blanks only the owned page before disabling Fetch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-mock-cleanup-"));
  const client = new FakeCdp("A");
  const receipts = [];
  const order = [];
  const originalCommand = client.command.bind(client);
  client.command = async (...args) => {
    if (args[0] === "Fetch.disable") order.push("fetch-disable");
    return originalCommand(...args);
  };
  const listener = new ProxyListener(listenerConfig(root, client, receipts, order));
  try {
    await listener.start();
    assert.equal(await client.emit("session-B", "Fetch.requestPaused", {
      requestId: "other-target", request: { url: "https://fixture.test/api/save", method: "POST", headers: {}, postData: "{}" }
    }), false);
    assert.equal(client.calls.some(call => call.params.requestId === "other-target"), false);
    await listener.stop();
    assert.deepEqual(order.slice(0, 2), ["blank-owned-target", "fetch-disable"]);
  } finally {
    await listener.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.1 AC-19/24/32: state persistence failure blocks the request before any upstream or success response", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-mock-persist-fail-"));
  const client = new FakeCdp("A");
  const receipts = [];
  const settings = listenerConfig(root, client, receipts, []);
  settings.mockScenarioEngine = engine({ persist: async () => { throw Object.assign(new Error("disk unavailable"), { code: "EACCES" }); } });
  const listener = new ProxyListener(settings);
  try {
    await listener.start();
    await client.emit("session-A", "Fetch.requestPaused", {
      requestId: "request-persist-fail",
      request: { url: "https://fixture.test/api/save", method: "POST", headers: { "content-type": "application/json" }, postData: '{"name":"synthetic"}' }
    });
    assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "request-persist-fail"), true);
    assert.equal(client.calls.some(call => ["Fetch.continueRequest", "Fetch.fulfillRequest"].includes(call.method) && call.params.requestId === "request-persist-fail"), false);
    assert.equal(settings.mockScenarioEngine.snapshot().state_version, 0);
    assert.equal(receipts.length, 0);
  } finally {
    await listener.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.1 AC-31/32: cleanup refuses to release interception or the Target lock until MCP has isolated the owned page", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-mock-cleanup-gate-"));
  const client = new FakeCdp("A");
  const settings = listenerConfig(root, client, [], []);
  settings.prepareOwnedTargetForCleanup = null;
  settings.verifyOwnedTargetForCleanup = async () => false;
  const listener = new ProxyListener(settings);
  try {
    await listener.start();
    const stopped = await listener.stop();
    assert.equal(stopped.state, "cleanup_failed");
    assert.equal(client.calls.some(call => call.method === "Fetch.disable"), false);
    assert.equal(client.calls.some(call => call.method === "Target.detachFromTarget"), false);
    settings.verifyOwnedTargetForCleanup = async () => true;
    listener.verifyOwnedTargetForCleanup = async () => true;
    const recovered = await listener.stop();
    assert.equal(recovered.state, "stopped");
  } finally {
    listener.verifyOwnedTargetForCleanup = async () => true;
    await listener.stop();
    await rm(root, { recursive: true, force: true });
  }
});
