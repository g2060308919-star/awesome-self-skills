import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ProxyListener, compileRules, stopProxyFromState } from "../scripts/cdp-fetch-proxy.mjs";

class FakeCdp {
  constructor(targetId) {
    this.targetId = targetId;
    this.calls = [];
    this.handlers = new Map();
    this.closed = false;
  }

  async command(method, params = {}, sessionId) {
    this.calls.push({ method, params, sessionId });
    if (method === "Target.attachToTarget") {
      assert.equal(params.targetId, this.targetId);
      return { sessionId: `session-${this.targetId}` };
    }
    if (method === "Fetch.getResponseBody") return { body: "origin", base64Encoded: false };
    return {};
  }

  on(sessionId, method, handler) {
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

  close() {
    this.closed = true;
  }
}

function config(root, targetId, client) {
  return {
    endpoint: "http://127.0.0.1:9222",
    browserWebSocketUrl: "ws://127.0.0.1/devtools/browser/test",
    targetId,
    rules: compileRules([{
      match: { protocol: "https:", hostname: "fixture.test", path_prefix: "/api", methods: ["GET"] },
      response: { status: 201, body: { text: `${targetId}-rewritten` } }
    }]),
    lockRoot: root,
    clientFactory: async () => client
  };
}

test("AC-023: start attaches exact target and stop disables Fetch, detaches, and releases", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-life-"));
  const client = new FakeCdp("A");
  const listener = new ProxyListener(config(root, "A", client));
  try {
    const running = await listener.start();
    assert.equal(running.targetId, "A");
    assert.equal(running.state, "active");
    assert.equal(Object.hasOwn(running, "sessionId"), false);
    assert.equal(running.session, "attached");
    assert.deepEqual(client.calls.slice(0, 3).map(call => call.method), [
      "Target.attachToTarget", "Network.enable", "Fetch.enable"
    ]);
    const fetchEnable = client.calls.find(call => call.method === "Fetch.enable");
    assert.deepEqual(fetchEnable.params.patterns.map(item => item.urlPattern), [
      "https://fixture.test*/api*", "https://fixture.test*/api*"
    ]);
    const stopped = await listener.stop();
    assert.equal(stopped.state, "stopped");
    assert.equal(client.calls.some(call => call.method === "Fetch.disable"), true);
    assert.equal(client.calls.some(call => call.method === "Target.detachFromTarget"), true);
    assert.equal(client.closed, true);
  } finally {
    await listener.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-024: two target listeners are independent; stopping A leaves B running", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-two-"));
  const clientA = new FakeCdp("A");
  const clientB = new FakeCdp("B");
  const a = new ProxyListener(config(root, "A", clientA));
  const b = new ProxyListener(config(root, "B", clientB));
  try {
    await Promise.all([a.start(), b.start()]);
    await a.stop();
    assert.equal(a.status().state, "stopped");
    assert.equal(b.status().state, "active");
    assert.equal(clientB.calls.some(call => call.method === "Fetch.disable"), false);
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-11: a proxy bound to page A cannot handle the same request from page B", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-isolation-"));
  const clientA = new FakeCdp("A");
  const listener = new ProxyListener(config(root, "A", clientA));
  try {
    await listener.start();
    const paused = {
      requestId: "request-A",
      request: { url: "https://fixture.test/api/value", method: "GET", headers: {} },
      responseStatusCode: 200,
      responseHeaders: [{ name: "content-type", value: "text/plain" }]
    };
    assert.equal(await clientA.emit("session-A", "Fetch.requestPaused", paused), true);
    assert.equal(clientA.calls.some(call => call.method === "Fetch.fulfillRequest" && call.sessionId === "session-A"), true);
    const callsBeforePageB = clientA.calls.length;
    assert.equal(await clientA.emit("session-B", "Fetch.requestPaused", { ...paused, requestId: "request-B" }), false);
    assert.equal(clientA.calls.length, callsBeforePageB);
  } finally {
    await listener.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-12: stopping page A leaves page B proxy active and able to fulfill requests", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-independent-"));
  const clientA = new FakeCdp("A");
  const clientB = new FakeCdp("B");
  const a = new ProxyListener(config(root, "A", clientA));
  const b = new ProxyListener(config(root, "B", clientB));
  try {
    await Promise.all([a.start(), b.start()]);
    await a.stop();
    const handled = await clientB.emit("session-B", "Fetch.requestPaused", {
      requestId: "request-B",
      request: { url: "https://fixture.test/api/value", method: "GET", headers: {} }
    });
    assert.equal(handled, true);
    assert.equal(clientB.calls.some(call => call.method === "Fetch.continueRequest" && call.sessionId === "session-B"), true);
    assert.equal(clientB.calls.some(call => call.method === "Fetch.disable"), false);
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-13: a new target is untouched until a new proxy is explicitly bound", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-migrate-"));
  const clientA = new FakeCdp("A");
  const clientB = new FakeCdp("B");
  const a = new ProxyListener(config(root, "A", clientA));
  const b = new ProxyListener(config(root, "B", clientB));
  try {
    await a.start();
    const paused = {
      requestId: "request-B",
      request: { url: "https://fixture.test/api/value", method: "GET", headers: {} }
    };
    assert.equal(await clientA.emit("session-B", "Fetch.requestPaused", paused), false);
    await a.stop();
    await b.start();
    assert.equal(await clientB.emit("session-B", "Fetch.requestPaused", paused), true);
    assert.equal(clientB.calls.some(call => call.method === "Fetch.continueRequest" && call.sessionId === "session-B"), true);
  } finally {
    await Promise.all([a.stop(), b.stop()]);
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-022/FR-076: stop verifies state owner token before signaling exactly its process", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy-owner-"));
  const statePath = path.join(root, "state.json");
  const client = new FakeCdp("A");
  const listener = new ProxyListener({ ...config(root, "A", client), statusPath: statePath });
  try {
    await listener.start();
    const state = JSON.parse(await readFile(statePath, "utf8"));
    const signaled = [];
    await stopProxyFromState(statePath, { signal: (pid, name) => signaled.push([pid, name]), wait: false });
    assert.deepEqual(signaled, [[process.pid, "SIGTERM"]]);

    state.ownerToken = "not-the-owner";
    await (await import("../scripts/lib/atomic-json.mjs")).writeJsonAtomic(statePath, state);
    await assert.rejects(
      stopProxyFromState(statePath, { signal: () => assert.fail("must not signal") }),
      error => error.code === "LOCK_OWNER_MISMATCH"
    );
  } finally {
    await listener.stop();
    await rm(root, { recursive: true, force: true });
  }
});
