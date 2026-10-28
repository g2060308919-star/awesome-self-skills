import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ProxyListener } from "../scripts/cdp-fetch-proxy.mjs";
import { MockScenarioEngine } from "../scripts/lib/mock-scenario.mjs";

const targetId = "navigation-target";
const rootFrameId = "actual-root-frame-not-the-target-id";
const origin = "https://navigation-fixture.test";

// Emulates the observed CDP renderer stall: browser-level Target enumeration
// still works while a main Document is paused, but Page.getFrameTree times out.
class NavigationCdp {
  calls = [];
  handlers = new Map();
  targets = [{ targetId, type: "page", url: origin }];
  frameTree = { frame: { id: rootFrameId } };
  documentPaused = false;
  upstream = [];
  async command(method, params = {}, sessionId) {
    this.calls.push({ method, params, sessionId });
    if (method === "Target.attachToTarget") return { sessionId: "navigation-session" };
    if (method === "Target.getTargets") return { targetInfos: this.targets };
    if (method === "Page.getFrameTree") {
      if (this.documentPaused) throw Object.assign(new Error("Page.getFrameTree timed out while Document was paused"), { code: "CDP_TIMEOUT" });
      return { frameTree: this.frameTree };
    }
    if (method === "Fetch.continueRequest") this.upstream.push(params.requestId);
    return {};
  }
  on(sessionId, method, callback) {
    const key = `${sessionId}:${method}`;
    this.handlers.set(key, callback);
    return () => this.handlers.delete(key);
  }
  async emit(method, event) { await this.handlers.get(`navigation-session:${method}`)?.(event); }
  async pause({ requestId = "navigate", frameId = rootFrameId, url = `${origin}/`, resourceType = "Document" } = {}) {
    this.documentPaused = resourceType === "Document";
    try {
      await this.emit("Fetch.requestPaused", { requestId, frameId, resourceType, request: { url, method: "GET", headers: {} } });
    } finally { this.documentPaused = false; }
  }
  close() {}
}

function scenario() {
  const match = pathname => ({ origin, pathname, method: "GET", query: {}, body: { rules: [], allowed_extra_pointers: [] } });
  return { schema_version: "mock-scenario-v1", scenario_id: "navigation", revision: 1, run_id: "NAV-RUN", case_id: "NAV",
    attempt_id: "navigation-attempt", candidate_checkpoint_ids: ["NAV/s/o"], supporting_checkpoint_ids: [], initial_state: {},
    routes: [{ route_id: "fixture-data", match: match("/api/data"), effect: [], response: { status: 200, headers: {}, body: { item: "fixture" } },
      provenance: { source_refs: ["local-fixture-contract"], synthetic_values: [] } }],
    passthrough: [{ passthrough_id: "declared-root-document", match: match("/"), basis_refs: ["fixture:known-read-only-root"] }],
    provenance: { source_refs: ["local-fixture-contract"], synthetic_values: [] } };
}

async function fixture(t, mode) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mock-navigation-"));
  const client = new NavigationCdp();
  const listener = new ProxyListener({ endpoint: "http://127.0.0.1:9222", browserWebSocketUrl: "ws://127.0.0.1/devtools/browser/navigation",
    runId: "NAV-RUN", targetId, rules: [], lockRoot: root, clientFactory: async () => client,
    ...(mode === "mock" ? { mockScenarioEngine: new MockScenarioEngine(scenario()), mockProxyCycleId: "navigation-cycle",
      mockChannelCoverage: { target_id: targetId } } : { discovery: {
      // The discovery authorization/matching boundary is independently covered
      // through createProxyListener in mock-integration-proxy.test.mjs.
      channelCoverage: { target_id: targetId }, assertAuthorized: async () => {}, assertProbed: () => {},
      capture: async request => ({ passthrough: request.url === `${origin}/` && request.method === "GET", probe: false }), record: async () => {}
    } }),
    prepareOwnedTargetForCleanup: async () => {}, verifyOwnedTargetForCleanup: async () => true });
  t.after(async () => { await listener.stop(); await rm(root, { recursive: true, force: true }); });
  await listener.start();
  assert.ok(client.calls.some(call => call.method === "Page.getFrameTree"), "establish the actual root frame before enabling Fetch");
  return { client, listener };
}

for (const mode of ["mock", "discovery"]) {
  test(`${mode}: a paused known-root Document uses its preverified frame and exact passthrough without renderer CDP calls`, async t => {
    const { client } = await fixture(t, mode);
    const before = client.calls.length;
    await client.pause();
    assert.deepEqual(client.upstream, ["navigate"]);
    assert.equal(client.calls.slice(before).some(call => call.method === "Page.getFrameTree"), false,
      "renderer frame inspection deadlocks behind its paused navigation");
    assert.ok(client.calls.slice(before).some(call => call.method === "Target.getTargets"), "refresh browser-level Target/worker inventory");
  });

  test(`${mode}: unknown and child-frame Documents cannot borrow the known root's passthrough`, async t => {
    const { client } = await fixture(t, mode);
    for (const frameId of [undefined, targetId, "unobserved-child-frame"]) {
      const requestId = `foreign-frame-${String(frameId)}`;
      // Explicitly omit frameId after construction to exercise missing metadata.
      if (frameId === undefined) {
        client.documentPaused = true;
        try { await client.emit("Fetch.requestPaused", { requestId, resourceType: "Document", request: { url: `${origin}/`, method: "GET", headers: {} } }); }
        finally { client.documentPaused = false; }
      } else await client.pause({ requestId, frameId });
      assert.ok(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === requestId));
    }
    assert.deepEqual(client.upstream, []);
  });

  test(`${mode}: a newly attached child frame invalidates the root navigation shortcut`, async t => {
    const { client } = await fixture(t, mode);
    await client.emit("Page.frameAttached", { frameId: "new-child", parentFrameId: rootFrameId });
    await client.pause({ requestId: "after-frame-attachment" });
    assert.deepEqual(client.upstream, []);
    assert.ok(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "after-frame-attachment"));
  });

  test(`${mode}: a new associated worker is rejected even during a known-root Document pause`, async t => {
    const { client } = await fixture(t, mode);
    client.targets.push({ targetId: "new-worker", type: "worker", openerId: targetId, url: `${origin}/worker.js` });
    await client.pause({ requestId: "after-worker" });
    assert.deepEqual(client.upstream, []);
    assert.ok(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "after-worker"));
  });

  test(`${mode}: the root navigation shortcut never allows an undeclared URL`, async t => {
    const { client } = await fixture(t, mode);
    await client.pause({ requestId: "unknown-url", url: `${origin}/api/delete-all` });
    assert.deepEqual(client.upstream, []);
    assert.ok(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "unknown-url"));
  });

  test(`${mode}: ordinary requests and explicit business readiness retain full frame-tree checks`, async t => {
    const { client, listener } = await fixture(t, mode);
    const before = client.calls.filter(call => call.method === "Page.getFrameTree").length;
    await client.pause({ requestId: "ordinary-root-fetch", resourceType: "Fetch" });
    assert.ok(client.calls.filter(call => call.method === "Page.getFrameTree").length > before);
    client.frameTree.childFrames = [{ frame: { id: "nested-frame", parentId: rootFrameId } }];
    await assert.rejects(listener.assertReadyForBusiness(), /子框架|通道|覆盖/);
  });
}

for (const mode of ["mock", "discovery"]) {
  test(`${mode}: a child-frame event during asynchronous route matching blocks the pending root Document before release`, async t => {
    const { client, listener } = await fixture(t, mode);
    const matcher = mode === "mock" ? listener.mockScenarioEngine : listener.discovery;
    const method = mode === "mock" ? "handle" : "capture";
    const original = matcher[method].bind(matcher);
    matcher[method] = async (...args) => {
      const matched = await original(...args);
      await client.emit("Page.frameAttached", { frameId: "child-during-match", parentFrameId: rootFrameId });
      return matched;
    };
    await client.pause({ requestId: "navigation-boundary-race" });
    assert.deepEqual(client.upstream, [], "a successful pre-match probe cannot authorize release after the frame boundary changed");
    assert.ok(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "navigation-boundary-race"));
  });
}

test("mock: a child-frame event during receipt import prevents final response delivery", async t => {
  const { client, listener } = await fixture(t, "mock");
  listener.mockReceiptSink = async () => {
    await client.emit("Page.frameAttached", { frameId: "child-during-receipt", parentFrameId: rootFrameId });
  };
  await client.pause({ requestId: "response-boundary-race", url: `${origin}/api/data` });
  assert.equal(client.calls.some(call => call.method === "Fetch.fulfillRequest" && call.params.requestId === "response-boundary-race"), false,
    "persisting a receipt does not authorize delivery after the isolation boundary changes");
  assert.ok(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "response-boundary-race"));
  assert.deepEqual(client.upstream, []);
});
