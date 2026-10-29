import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import http from "node:http";
import { recordEvent, validateRun } from "../scripts/run-artifacts.mjs";
import { initializeFixtureRun, recordFixtureEvent, fixtureState } from "./test-helpers.mjs";
import { browserIdentity } from "../scripts/lib/browser-session.mjs";
import { proxyRulesDigest } from "../scripts/lib/proxy-authorization.mjs";

import { ProxyListener, probeMockChannels, createProxyListener } from "../scripts/cdp-fetch-proxy.mjs";
import { CURRENT_WORKFLOW } from "../scripts/lib/workflow-contract.mjs";
import { loadMockProxyBinding } from "../scripts/lib/mock-runtime.mjs";
import { MockScenarioEngine } from "../scripts/lib/mock-scenario.mjs";

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const request = { url: "https://fixture.test/api/save", method: "POST", headers: { "content-type": "application/json" }, body: '{"name":"synthetic"}' };
const identity = { proxy_cycle_id: "cycle-1", request_id: "request-1" };

function scenario() {
  return {
    schema_version: "mock-scenario-v1", scenario_id: "scenario-1", revision: 1,
    run_id: "RUN-1", case_id: "CASE-1", attempt_id: "attempt-1",
    candidate_checkpoint_ids: ["CASE-1/s/o"], supporting_checkpoint_ids: [], initial_state: { saved: false },
    routes: [{
      route_id: "save", match: {
        origin: "https://fixture.test", pathname: "/api/save", method: "POST", query: {},
        body: { rules: [{ pointer: "/name", presence: "required", type: "string" }], allowed_extra_pointers: [] }
      },
      effect: [{ op: "set", path: "/saved", value: true }],
      response: { status: 201, headers: {}, body: { saved: { $state: "/saved" } } },
      provenance: { source_refs: ["local-fixture-network"], synthetic_values: [] }
    }], passthrough: [], provenance: { source_refs: ["local-fixture-network"], synthetic_values: [] }
  };
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "latest-mock-regression-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "mock"));
  const encoded = JSON.stringify(scenario());
  const hash = sha(encoded);
  const log = {
    schema_version: "2.0", extensions: { execution_coverage: { schema_version: "1.0" }, mock_fallback: { schema_version: "1.0" } },
    run: { run_id: "RUN-1", status: "running" }, events: [
      { type: "mock_policy", action: "initial", decision: "allowed", decision_source: "user", basis: "User explicitly permits fixture simulation", sequence: 1 },
      {
        type: "mock_attempt", attempt_id: "attempt-1", candidate_ids: ["candidate-1"], case_id: "CASE-1", action: "started",
        scenario_revision: 1, scenario_hash: hash, state_version: 0, context_refs: [1], proxy_cycle_refs: ["cycle-1"],
        candidate_checkpoint_ids: ["CASE-1/s/o"], supporting_checkpoint_ids: [], sequence: 2
      }
    ]
  };
  log.events.push(
    { type: "coverage_context", sequence: 3, context_ref: "context-1", target_id: "A", verification: "verified" },
    { type: "network_observation", sequence: 4, context_ref: "context-1", target_id: "A", channel: "page-http", route_id: "save", url: request.url, method: "POST" },
    { type: "mock_channel_coverage", sequence: 5, context_ref: "context-1", target_id: "A", scenario_hash: hash,
      covered_route_ids: ["save"], request_refs: [4], channels: [{ kind: "page-http", target_id: "A", request_refs: [4] }], uncovered_channels: [] }
  );
  log.events[1].context_refs = [3];
  log.events[0].sequence = 2;
  log.events[1].sequence = 6;
  log.events.unshift({ type: "workflow_profile", profile: CURRENT_WORKFLOW, sequence: 1 });
  log.events.sort((left, right) => left.sequence - right.sequence);
  await writeFile(path.join(root, "mock/scenario.json"), encoded);
  await writeFile(path.join(root, "execution-log.json"), JSON.stringify(log));
  const config = { run_root: root, run_id: "RUN-1", proxy_cycle_id: "cycle-1", target_id: "A", mock_channel_coverage_ref: 5, mock_scenario: {
    path: "mock/scenario.json", sha256: hash, attempt_id: "attempt-1", state_path: "mock/state.json", receipts_path: "mock/receipts.json"
  } };
  return { root, log, config };
}

async function savedFixture(t) {
  const fixtureState = await fixture(t);
  const binding = await loadMockProxyBinding(fixtureState.config);
  const receipt = await binding.engine.handle(request, identity);
  fixtureState.log.events.push({
    type: "mock_observation", attempt_id: "attempt-1", receipt_id: receipt.receipt_id, route_id: "save", request_id: "request-1",
    disposition: "mocked", request_facts: ["local fixture request"], response_facts: ["201"], state_before_version: 0,
    state_after_version: 1, evidence_refs: [], proxy_cycle_ref: "cycle-1", sequence: 7
  });
  await writeFile(path.join(fixtureState.root, "execution-log.json"), JSON.stringify(fixtureState.log));
  return { ...fixtureState, binding };
}

test("A19: a mock runtime cannot attach using an unregistered proxy cycle", async t => {
  const { config } = await fixture(t);
  await assert.rejects(loadMockProxyBinding({ ...config, proxy_cycle_id: "another-cycle" }), /cycle|周期|绑定|归属/i);
});

test("A17: matching receipt contents do not excuse a foreign Run receipt envelope", async t => {
  const { config, binding } = await savedFixture(t);
  const receipts = JSON.parse(await readFile(binding.receiptsPath, "utf8"));
  receipts.run_id = "ANOTHER-RUN";
  await writeFile(binding.receiptsPath, JSON.stringify(receipts));
  await assert.rejects(loadMockProxyBinding(config), /Run|回执|归属|状态/i);
});

test("A17: paired files with a broken receipt state hash chain cannot resume", async t => {
  const { config, binding } = await savedFixture(t);
  const runtime = JSON.parse(await readFile(binding.statePath, "utf8"));
  const receipts = JSON.parse(await readFile(binding.receiptsPath, "utf8"));
  runtime.processed_requests[0].receipt.state_after_hash = "0".repeat(64);
  receipts.receipts = runtime.processed_requests.map(item => item.receipt);
  await writeFile(binding.statePath, JSON.stringify(runtime));
  await writeFile(binding.receiptsPath, JSON.stringify(receipts));
  await assert.rejects(loadMockProxyBinding(config), /回执|哈希|状态|receipt|hash/i);
});

test("A17: a later request cannot hide a prior split-file persistence failure", async t => {
  let writes = 0;
  const engine = new MockScenarioEngine(scenario(), { persist: async () => {
    writes += 1;
    if (writes === 1) throw Object.assign(new Error("receipt replacement succeeded, state replacement failed"), { code: "EACCES" });
  } });
  await assert.rejects(engine.handle(request, identity), /state replacement failed/);
  await assert.rejects(engine.handle(request, { ...identity, request_id: "request-2" }), /persist|状态|持久化|恢复|failed|blocked/i);
  assert.equal(engine.snapshot().state_version, 0, "a failed persistence boundary must be reconciled before later business simulation");
});

// This fake applies Fetch URL patterns before dispatch. Directly emitting a
// requestPaused event for an unmatched URL would conceal gaps in the guard.
class PatternAwareCdp {
  constructor() { this.calls = []; this.handlers = new Map(); this.patterns = []; this.upstream = []; this.closed = false; }
  async command(method, params = {}, sessionId) {
    if (this.closed) throw Object.assign(new Error("CDP transport closed"), { code: "CDP_CLOSED" });
    this.calls.push({ method, params, sessionId });
    if (method === "Target.getTargets") return { targetInfos: [{ targetId: "A", type: "page", url: "https://fixture.test" }] };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: "A" } } };
    if (method === "Target.attachToTarget") return { sessionId: "session-A" };
    if (method === "Fetch.enable") this.patterns = params.patterns;
    if (method === "Fetch.continueRequest") this.upstream.push(params.requestId);
    return {};
  }
  on(sessionId, method, handler) {
    const key = `${sessionId}:${method}`;
    this.handlers.set(key, handler);
    return () => this.handlers.delete(key);
  }
  async request(requestId, url) {
    const matches = this.patterns.some(pattern => pattern.requestStage === "Request" &&
      new RegExp(`^${pattern.urlPattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(url));
    if (!matches) { this.upstream.push(requestId); return; }
    await this.handlers.get("session-A:Fetch.requestPaused")({ requestId, request: { url, method: "GET", headers: {} } });
  }
  async disconnect() {
    this.closed = true;
    await this.handlers.get(":__transport_closed__")({ reason: "fixture forced disconnect" });
  }
  close() { this.closed = true; }
}

async function listenerFixture(t) {
  const { root } = await fixture(t);
  const client = new PatternAwareCdp();
  const listener = new ProxyListener({
    endpoint: "http://127.0.0.1:9222", browserWebSocketUrl: "ws://127.0.0.1/devtools/browser/local-fixture",
    targetId: "A", rules: [], lockRoot: root, runId: "RUN-1", clientFactory: async () => client,
    mockChannelCoverage: { target_id: "A" },
    mockScenarioEngine: new MockScenarioEngine(scenario()), mockProxyCycleId: "cycle-1",
    prepareOwnedTargetForCleanup: async () => { if (client.closed) throw new Error("MCP unavailable after fixture disconnect"); },
    verifyOwnedTargetForCleanup: async () => !client.closed
  });
  t.after(async () => {
    client.closed = false;
    listener.transportLost = false;
    listener.prepareOwnedTargetForCleanup = async () => {};
    listener.verifyOwnedTargetForCleanup = async () => true;
    await listener.stop();
  });
  await listener.start();
  return { listener, client };
}

test("A18: unknown same-origin and cross-origin HTTP requests actually enter the Request guard", async t => {
  const { client } = await listenerFixture(t);
  await client.request("unknown-same-origin", "https://fixture.test/api/unknown?synthetic_id=mock-1");
  await client.request("unknown-cross-origin", "https://another-fixture.test/api/unknown?synthetic_id=mock-1");
  assert.deepEqual(client.calls.filter(call => call.method === "Fetch.continueRequest").map(call => call.params.requestId),
    ["unknown-same-origin", "unknown-cross-origin"]);
  assert.deepEqual(client.calls.filter(call => call.method === "Fetch.failRequest"), []);
});

test("A22: transport loss explicitly leaves isolation unknown rather than claiming cleanup", async t => {
  const { client, listener } = await listenerFixture(t);
  await client.disconnect();
  await listener.stop();
  assert.notEqual(listener.status().state, "stopped");
  assert.match(JSON.stringify(listener.status()), /isolation_unknown|隔离未知/, "a dead CDP channel cannot prove that Fetch remains installed");
});


test("A21: failed Fetch disable cannot be reported as a fully stopped proxy", async t => {
  const { client, listener } = await listenerFixture(t);
  const command = client.command.bind(client);
  client.command = async (method, ...args) => {
    if (method === "Fetch.disable") throw new Error("disable rejected by CDP");
    return command(method, ...args);
  };
  const result = await listener.stop();
  assert.equal(result.state, "cleanup_failed");
  assert.equal(client.calls.some(call => call.method === "Target.detachFromTarget"), false);
  client.command = command;
});


test("A39: mock binding rejects absent, foreign-target, and unsupported-channel evidence", async t => {
  const { root, log, config } = await fixture(t);
  await assert.rejects(loadMockProxyBinding({ ...config, mock_channel_coverage_ref: undefined }), /通道|核验/);
  for (const change of [
    candidate => { candidate.events.find(event => event.type === "network_observation").target_id = "B"; },
    candidate => { candidate.events.find(event => event.type === "network_observation").channel = "service-worker"; },
    candidate => { candidate.events.find(event => event.type === "mock_channel_coverage").uncovered_channels = ["worker"]; },
    candidate => { candidate.events.push({ type: "execution_context_change", context_ref: "context-1", sequence: 7 }); }
  ]) {
    const changed = structuredClone(log);
    change(changed);
    await writeFile(path.join(root, "execution-log.json"), JSON.stringify(changed));
    await assert.rejects(loadMockProxyBinding(config), /通道|核验|失效/);
  }
});

test("A13: a loaded binding rechecks revocation before the next request", async t => {
  const { root, log, config } = await fixture(t);
  const binding = await loadMockProxyBinding(config);
  await binding.assertAuthorized();
  log.events.push({ type: "mock_policy", action: "revoked", decision: "declined", decision_source: "user", basis: "撤回", sequence: 7 });
  await writeFile(path.join(root, "execution-log.json"), JSON.stringify(log));
  await assert.rejects(binding.assertAuthorized(), /撤回|授权|停止/);
  await rm(path.join(root, "execution-log.json"));
  await assert.rejects(binding.assertAuthorized(), /ENOENT/);
});


test("A39: read-only channel probes reject workers and child frames without attaching to them", async () => {
  for (const kind of ["worker", "service_worker", "shared_worker", "iframe"]) {
    const calls = [];
    const client = { command: async method => {
      calls.push(method);
      return method === "Target.getTargets"
        ? { targetInfos: [{ targetId: "A", type: "page" }, { targetId: "W", type: kind, openerId: "A" }] }
        : { frameTree: { frame: { id: "A" } } };
    } };
    await assert.rejects(probeMockChannels(client, "A", "session-A", { target_id: "A" }), /worker|Target/);
    assert.equal(calls.some(method => method.includes("attach") || method.includes("close")), false);
  }
  const client = { command: async method => method === "Target.getTargets"
    ? { targetInfos: [{ targetId: "A", type: "page" }] }
    : { frameTree: { frame: { id: "A" }, childFrames: [{ frame: { id: "child" } }] } } };
  await assert.rejects(probeMockChannels(client, "A", "session-A", { target_id: "A" }), /子框架/);
});

test("A39: a provably unrelated worker is observed without being attached or blocking the owned page", async () => {
  const calls = [];
  const client = { command: async method => {
    calls.push(method);
    return method === "Target.getTargets" ? { targetInfos: [
      { targetId: "A", type: "page", browserContextId: "context-A" },
      { targetId: "B", type: "page", browserContextId: "context-B" },
      { targetId: "W", type: "worker", browserContextId: "context-B", openerId: "B" }
    ] } : { frameTree: { frame: { id: "A" } } };
  } };
  await probeMockChannels(client, "A", "session-A", { target_id: "A" });
  assert.deepEqual(calls.sort(), ["Page.getFrameTree", "Target.getTargets"]);
});

test("A13: revocation blocks the next intercepted request without an upstream fallback", async t => {
  const { client, listener } = await listenerFixture(t);
  listener.mockAssertAuthorized = async () => { throw new Error("Mock authorization revoked"); };
  await client.request("after-revocation", "https://fixture.test/api/save");
  assert.deepEqual(client.upstream, []);
  assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "after-revocation"), true);
  assert.equal(client.calls.some(call => call.method === "Fetch.fulfillRequest" && call.params.requestId === "after-revocation"), false);
});

test("A22: recovering isolation requires the same Target to be already blank and never navigates it", async t => {
  const { client, listener } = await listenerFixture(t);
  await client.disconnect();
  await listener.stop();
  const restored = new PatternAwareCdp();
  let targetUrl = "https://fixture.test/business";
  const command = restored.command.bind(restored);
  restored.command = async (method, params, sessionId) => method === "Target.getTargetInfo"
    ? { targetInfo: { targetId: "A", type: "page", url: targetUrl } }
    : command(method, params, sessionId);
  await assert.rejects(listener.recoverIsolation({ client: restored }), /about:blank/);
  assert.equal(listener.status().isolation, "isolation_unknown");
  targetUrl = "about:blank";
  const result = await listener.recoverIsolation({ client: restored });
  assert.equal(result.state, "stopped");
  assert.equal(result.cleanup.page_isolated, true);
  assert.equal(result.cleanup.real_response_restored, null, "restoring real responses still requires separate safe observation");
  assert.equal(restored.calls.some(call => ["Page.navigate", "Target.createTarget", "Target.closeTarget"].includes(call.method)), false);
});

test("A17: failed receipt import prevents later simulation until ledger reconciliation", async t => {
  const { client, listener } = await listenerFixture(t);
  listener.mockReceiptSink = async () => { throw new Error("ledger import failed"); };
  const pause = client.handlers.get("session-A:Fetch.requestPaused");
  const event = { requestId: "first", request: { url: request.url, method: "POST", headers: request.headers, postData: request.body } };
  await pause(event);
  listener.mockReceiptSink = async () => {};
  await pause({ ...event, requestId: "second" });
  assert.equal(client.calls.some(call => call.method === "Fetch.fulfillRequest"), false);
  assert.deepEqual(client.upstream, []);
  assert.equal(listener.mockScenarioEngine.snapshot().state_version, 1, "the already persisted receipt must be reconciled before another transaction");
});


async function officialFixture(t) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "latest-mock-official-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const casesPath = path.join(workspace, "cases.json");
  await writeFile(casesPath, JSON.stringify({ schema_version: "2.0", suite: { name: "Mock official entry component fixture", target_urls: ["https://fixture.test"] },
    cases: [{ case_id: "CASE-1", module: "fixture", title: "Render a saved item", preconditions: [],
      steps: [{ step_id: "s", action: "Save fixture", expected: [{ oracle_id: "o", text: "Show saved confirmation" }] }] }] }));
  const run = await initializeFixtureRun({ workspaceRoot: workspace, casesPath, mockFallback: "allowed" });
  let discoveryRequests = 0;
  const server = http.createServer((req, res) => {
    discoveryRequests += 1;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/json/list" ? [{ id: context.target_id, type: "page" }] : { webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/fixture` }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const session = { type: "browser_session", run_id: run.runId, generation: "fixture-generation", storage_context: "fixture-storage", config_sha256: "a".repeat(64) };
  await recordEvent(run.runRoot, { ...session, phase: "prepared", shared_connection: "pending" });
  await recordEvent(run.runRoot, { ...session, phase: "bound", shared_connection: "ready", target_id: "fixture-target",
    mcp_page_id: "component-page-1", endpoint: `http://127.0.0.1:${server.address().port}`,
    browser_identity: browserIdentity("/devtools/browser/fixture"), mapping_proof: "host_target_metadata", mapping_evidence: { page_id: "component-page-1", target_id: "fixture-target", source: "host_target_metadata" } });
  await recordFixtureEvent(run.runRoot, { type: "run_state", status: "running" });
  await recordFixtureEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "CASE-1/s/o" });
  const { log } = await fixtureState(run.runRoot);
  const context = log.events.find(event => event.type === "coverage_context");
  const observed = await recordEvent(run.runRoot, { type: "page_observation", checkpoint_ids: ["CASE-1/s/o"], description: "Local fixture has no suitable records" });
  await recordEvent(run.runRoot, { type: "data_gap", gap_id: "gap-1", checkpoint_ids: ["CASE-1/s/o"],
    real_blocker_refs: [observed.sequence], exploration_refs: [observed.sequence], missing_conditions: ["Available fixture record"],
    known_request_facts: ["Fixture list is empty"], not_started_dependencies: ["Requires fixture record"] });
  await recordEvent(run.runRoot, { type: "mock_candidate", candidate_id: "candidate-1", case_id: "CASE-1", checkpoint_ids: ["CASE-1/s/o"], gap_ids: ["gap-1"], assertion_domain: "frontend", assertion_basis: "Original oracle only asserts the visible saved confirmation", purpose: "Check frontend confirmation" });
  const definition = { ...scenario(), run_id: run.runId };
  const encoded = JSON.stringify(definition);
  const hash = sha(encoded);
  await mkdir(path.join(run.runRoot, "mock"));
  await writeFile(path.join(run.runRoot, "mock/scenario.json"), encoded);
  const network = await recordEvent(run.runRoot, { type: "network_observation", target_id: context.target_id, context_ref: context.context_ref,
    channel: "page-http", route_id: "save", url: request.url, method: "POST" });
  const coverage = await recordEvent(run.runRoot, { type: "mock_channel_coverage", target_id: context.target_id, context_ref: context.context_ref,
    scenario_hash: hash, covered_route_ids: ["save"], request_refs: [network.sequence], uncovered_channels: [],
    channels: [{ kind: "page-http", target_id: context.target_id, request_refs: [network.sequence] }] });
  await recordEvent(run.runRoot, { type: "mock_attempt", attempt_id: "attempt-1", candidate_ids: ["candidate-1"], case_id: "CASE-1", action: "started",
    scenario_revision: 1, scenario_hash: hash, state_version: 0, context_refs: [context.sequence], proxy_cycle_refs: ["cycle-1"],
    candidate_checkpoint_ids: ["CASE-1/s/o"], supporting_checkpoint_ids: [] });
  const client = new PatternAwareCdp();
  const original = client.command.bind(client);
  client.command = async (method, params, sessionId) => {
    if (method === "Target.getTargets") return { targetInfos: [{ targetId: context.target_id, type: "page" }] };
    return original(method, params, sessionId);
  };
  return { run, client, discoveryRequests: () => discoveryRequests, config: {
    environment: "test", endpoint: `http://127.0.0.1:${server.address().port}`,
    run_root: run.runRoot, run_id: run.runId, target_id: context.target_id, lock_root: path.join(workspace, "locks"), rules: [],
    proxy_cycle_id: "cycle-1", mock_channel_coverage_ref: coverage.sequence,
    mock_scenario: { path: "mock/scenario.json", sha256: hash, attempt_id: "attempt-1", state_path: "mock/state.json", receipts_path: "mock/receipts.json" },
    clientFactory: async () => client, prepareOwnedTargetForCleanup: async () => {}, verifyOwnedTargetForCleanup: async () => true
  } };
}

test("A14/A16/A17: official proxy entry persists and imports each receipt before delivery, with idempotent recovery", async t => {
  const { run, client, config } = await officialFixture(t);
  const listener = await createProxyListener(config);
  t.after(() => listener.stop());
  await listener.start();
  const paused = client.handlers.get("session-A:Fetch.requestPaused");
  const event = { requestId: "official-request", request: { url: request.url, method: "POST", headers: request.headers, postData: request.body } };
  await Promise.all([paused(event), paused({ ...event, requestId: "second-official-request" })]);
  await paused(event);
  const { log } = await fixtureState(run.runRoot);
  const receipts = log.events.filter(item => item.type === "mock_observation");
  assert.equal(receipts.length, 2);
  assert.deepEqual(receipts.map(item => [item.state_before_version, item.state_after_version]), [[0, 1], [1, 2]]);
  assert.equal(log.events.some(item => item.type === "mock_checkpoint"), false, "receipt import does not invent page consumption or checkpoint results");
  assert.equal(client.calls.filter(call => call.method === "Fetch.fulfillRequest").length, 3);
  assert.equal(client.calls.some(call => call.method === "Fetch.continueRequest"), false);
  await validateRun(run.runRoot, { checkReport: false });
  await listener.stop();
  const lifecycle = (await fixtureState(run.runRoot)).log.events.filter(item => item.type === "proxy_state");
  assert.equal(lifecycle.at(-1).proxy.state, "stopped");
  assert.equal(lifecycle.at(-1).proxy.cleanup.real_response_restored, null, "process/lock cleanup is not a UI restoration claim");
  assert.equal(lifecycle.at(-1).proxy.cleanup.lock_released, true);
  const recovered = await loadMockProxyBinding(config);
  assert.equal(recovered.engine.snapshot().state_version, 2);
  assert.equal((await fixtureState(run.runRoot)).log.events.filter(item => item.type === "mock_observation").length, 2);
});

test("A17: official binding backfills a verified persisted receipt after a crash without replaying the write", async t => {
  const { run, config } = await officialFixture(t);
  const beforeCrash = await loadMockProxyBinding(config);
  await beforeCrash.engine.handle(request, identity);
  assert.equal((await fixtureState(run.runRoot)).log.events.some(event => event.type === "mock_observation"), false);
  const recovered = await loadMockProxyBinding(config);
  assert.equal(recovered.engine.snapshot().state_version, 1);
  const observations = (await fixtureState(run.runRoot)).log.events.filter(event => event.type === "mock_observation");
  assert.equal(observations.length, 1);
  await recovered.receiptSink(recovered.engine.runtimeState().processed_requests[0].receipt);
  assert.equal((await fixtureState(run.runRoot)).log.events.filter(event => event.type === "mock_observation").length, 1);
});

test("A12: official proxy uses the authorized raw-rule digest and rejects case-Mock purpose before CDP discovery", async t => {
  const { run, config, discoveryRequests } = await officialFixture(t);
  const rules = [{ match: { protocol: "https:", hostname: "FIXTURE.TEST", path_prefix: "/api/config", methods: ["get"] }, request: { headers: { set: { "x-fixture": "yes" } } } }];
  await recordEvent(run.runRoot, { type: "proxy_policy", action: "initial", decision: "allowed", decision_source: "user", purpose: "environment_access", basis: "Fixture header rule allowed", rules_sha256: proxyRulesDigest(rules) });
  const ordinary = { ...config, mock_scenario: undefined, rules, purpose: "environment_access" };
  const listener = await createProxyListener(ordinary);
  t.after(() => listener.stop());
  assert.equal(listener.rules[0].match.hostname, "fixture.test");
  assert.deepEqual(listener.rules[0].match.methods, ["GET"]);
  const count = discoveryRequests();
  await assert.rejects(createProxyListener({ ...ordinary, purpose: "case_mock", response_data_kind: "non_business" }), /用途|场景/);
  assert.equal(discoveryRequests(), count);
  await listener.stop();
});

test("A21: cleanup drains the in-flight mock transaction before disabling interception", async t => {
  const { client, listener } = await listenerFixture(t);
  let release;
  let observed;
  const began = new Promise(resolve => { observed = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  listener.mockScenarioEngine.persist = async () => { observed(); await gate; };
  const paused = client.handlers.get("session-A:Fetch.requestPaused");
  const processing = paused({ requestId: "in-flight", request: { url: request.url, method: "POST", headers: request.headers, postData: request.body } });
  await began;
  const stopping = listener.stop();
  await new Promise(resolve => setImmediate(resolve));
  const disabledEarly = client.calls.some(call => call.method === "Fetch.disable");
  release();
  await Promise.all([processing, stopping]);
  assert.equal(disabledEarly, false, "Fetch must protect the page while its mock transaction is unsettled");
});

test("A15/A22: a failed CDP block command never falls through to real upstream", async t => {
  const { client, listener } = await listenerFixture(t);
  listener.mockScenarioEngine.scenario.provenance.synthetic_values.push("blocked-token");
  const command = client.command.bind(client);
  client.command = async (method, ...args) => {
    if (method === "Fetch.failRequest") throw new Error("fixture CDP block rejected");
    return command(method, ...args);
  };
  await client.request("cannot-block", "https://fixture.test/api/unknown?value=blocked-token");
  assert.deepEqual(client.upstream, []);
  assert.equal(listener.status().isolation, "isolation_unknown");
});

test("A07: official proxy rejects Target inventory without a bound browser session before discovery", async t => {
  const { config, discoveryRequests } = await officialFixture(t);
  const logPath = path.join(config.run_root, "execution-log.json");
  const log = JSON.parse(await readFile(logPath, "utf8"));
  log.events = log.events.filter(event => event.type !== "browser_session");
  await writeFile(logPath, JSON.stringify(log));
  await assert.rejects(createProxyListener(config), /浏览器|session|绑定/i);
  assert.equal(discoveryRequests(), 0);
});


test("A05/A07: official proxy rechecks browser session invalidation before business guard and request", async t => {
  const { run, config, client } = await officialFixture(t);
  const listener = await createProxyListener(config);
  t.after(() => listener.stop());
  await listener.start();
  const { log } = await fixtureState(run.runRoot);
  const bound = log.events.filter(event => event.type === "browser_session").at(-1);
  const { sequence, at, ...session } = bound;
  await recordEvent(run.runRoot, { ...session, phase: "disconnected", reason: "Component fixture transport invalidation" });
  await assert.rejects(listener.assertReadyForBusiness(), /浏览器|失效|绑定/);
  await client.request("after-session-invalidated", "https://fixture.test/api/save");
  assert.deepEqual(client.upstream, []);
  assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "after-session-invalidated"), true);
  await listener.stop();
});

test("A39: a newly observed worker blocks both business guard and the next paused request", async t => {
  const { client, listener } = await listenerFixture(t);
  const command = client.command.bind(client);
  client.command = async (method, ...args) => method === "Target.getTargets"
    ? { targetInfos: [{ targetId: "A", type: "page" }, { targetId: "worker", type: "worker", openerId: "A" }] }
    : command(method, ...args);
  await assert.rejects(listener.assertReadyForBusiness(), /worker|Target/);
  await client.request("after-worker-created", "https://fixture.test/api/save");
  assert.deepEqual(client.upstream, []);
  assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "after-worker-created"), true);
});
