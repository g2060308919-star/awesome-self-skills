import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createProxyListener } from "../scripts/cdp-fetch-proxy.mjs";
import { initializeRun, recordEvent } from "../scripts/run-artifacts.mjs";
import { browserIdentity } from "../scripts/lib/browser-session.mjs";
import { proxyRulesDigest } from "../scripts/lib/proxy-authorization.mjs";

const checkpointId = "CASE/s/o";
const targetId = "fixture-target";
const fixtureOrigin = "https://fixture.test";

// Same pattern-aware FakeCdp boundary as latest-mock-regression: requests
// outside installed patterns reach its upstream ledger instead of being
// force-emitted into Fetch. This is component evidence, not Chrome evidence.
class FakeCdp {
  constructor() {
    this.calls = []; this.handlers = new Map(); this.patterns = []; this.upstream = [];
    this.extraTargets = []; this.closed = false;
  }
  async command(method, params = {}, sessionId) {
    this.calls.push({ method, params, sessionId });
    if (method === "Target.attachToTarget") {
      assert.equal(params.targetId, targetId);
      return { sessionId: "session-fixture" };
    }
    if (method === "Target.getTargets") return { targetInfos: [{ targetId, type: "page", url: fixtureOrigin }, ...this.extraTargets] };
    if (method === "Target.getTargetInfo") return { targetInfo: { targetId, type: "page", url: "about:blank" } };
    if (method === "Page.getFrameTree") return { frameTree: { frame: { id: targetId } } };
    if (method === "Fetch.enable") this.patterns = params.patterns;
    if (method === "Fetch.continueRequest") this.upstream.push(params.requestId);
    if (method === "Fetch.getResponseBody") return { body: JSON.stringify({ tenant: { id: "origin-tenant" }, endpoint: "/production-disabled" }), base64Encoded: false };
    return {};
  }
  on(sessionId, method, handler) {
    const key = `${sessionId}:${method}`;
    this.handlers.set(key, handler);
    return () => this.handlers.delete(key);
  }
  async pause(event, { sessionId = "session-fixture" } = {}) {
    const stage = event.responseStatusCode === undefined ? "Request" : "Response";
    const matches = this.patterns.some(pattern => pattern.requestStage === stage &&
      new RegExp(`^${pattern.urlPattern.split("*").map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(event.request.url));
    const handler = this.handlers.get(`${sessionId}:Fetch.requestPaused`);
    if (!matches || !handler) {
      if (stage === "Request") this.upstream.push(event.requestId);
      return false;
    }
    await handler(event);
    return true;
  }
  close() { this.closed = true; }
}

async function fixture(t, { mockDecision = "declined" } = {}) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "mock-integration-proxy-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const casesPath = path.join(workspace, "cases.json");
  await writeFile(casesPath, JSON.stringify({ schema_version: "2.0", suite: { name: "Offline proxy integration fixture", target_urls: [fixtureOrigin] },
    cases: [{ case_id: "CASE", module: "fixture", title: "Frontend saved confirmation", preconditions: [],
      steps: [{ step_id: "s", action: "Save through the fixture page", expected: [{ oracle_id: "o", text: "Show saved confirmation" }] }] }] }));
  const run = await initializeRun({ workspaceRoot: workspace, casesPath, ...(mockDecision ? { mockFallback: mockDecision } : {}) });
  await recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["CASE"] });
  await recordEvent(run.runRoot, { type: "target_inventory", owned_target_ids: [targetId], preexisting_target_ids: [], attached_preexisting_target_ids: [] });
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(req.url === "/json/list" ? [{ id: targetId, type: "page", url: fixtureOrigin }] :
      { webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/browser/integration-fixture` }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const session = { type: "browser_session", run_id: run.runId, generation: "fixture-generation", storage_context: "fixture-storage", config_sha256: "a".repeat(64) };
  await recordEvent(run.runRoot, { ...session, phase: "prepared", shared_connection: "pending" });
  await recordEvent(run.runRoot, { ...session, phase: "bound", shared_connection: "ready", target_id: targetId,
    mcp_page_id: "fixture-page", endpoint, browser_identity: browserIdentity("/devtools/browser/integration-fixture"),
    mapping_proof: "host_target_metadata", mapping_evidence: { page_id: "fixture-page", target_id: targetId, source: "host_target_metadata" } });
  const client = new FakeCdp();
  return { run, client, config: { environment: "test", endpoint, run_root: run.runRoot, run_id: run.runId, target_id: targetId,
    lock_root: path.join(workspace, "locks"), rules: [], clientFactory: async () => client,
    prepareOwnedTargetForCleanup: async () => {}, verifyOwnedTargetForCleanup: async () => true } };
}

async function authorizeBase(run, rules) {
  await recordEvent(run.runRoot, { type: "proxy_policy", action: "initial", decision: "allowed", decision_source: "user",
    purpose: "environment_access",
    basis: "Explicitly confirmed tenant routing and bootstrap body correction required to access the non-production environment; not a case data scenario",
    rules_sha256: proxyRulesDigest(rules) });
}

test("AC-01/02: confirmed environment access rewrites headers and business-shaped bootstrap body even when case Mock is declined or unanswered", async t => {
  for (const mockDecision of ["declined", null]) {
    await t.test(mockDecision ?? "unanswered", async t => {
      const { run, config, client } = await fixture(t, { mockDecision });
      const rules = [{ match: { protocol: "https:", hostname: "fixture.test", path_prefix: "/bootstrap", methods: ["GET"] },
        request: { headers: { set: { "x-environment-route": "fixture-tenant" } } },
        response: { headers: { set: { "x-environment-ready": "yes" } }, body: { mode: "json_patch", operations: [
          { op: "set", path: "/tenant/id", value: "fixture-tenant" }, { op: "set", path: "/endpoint", value: "/fixture-api" }
        ] } } }];
      await authorizeBase(run, rules);
      const listener = await createProxyListener({ ...config, rules, purpose: "environment_access", response_data_kind: "environment_access" });
      t.after(() => listener.stop());
      await listener.start();
      const request = { url: `${fixtureOrigin}/bootstrap`, method: "GET", headers: {} };
      await client.pause({ requestId: "bootstrap", request });
      const continued = client.calls.find(call => call.method === "Fetch.continueRequest" && call.params.requestId === "bootstrap");
      assert.ok(continued.params.headers.some(item => item.name === "x-environment-route" && item.value === "fixture-tenant"));
      await client.pause({ requestId: "bootstrap", request, responseStatusCode: 200, responseHeaders: [{ name: "content-type", value: "application/json" }] });
      const fulfilled = client.calls.find(call => call.method === "Fetch.fulfillRequest" && call.params.requestId === "bootstrap");
      assert.ok(fulfilled.params.responseHeaders.some(item => item.name === "x-environment-ready" && item.value === "yes"));
      assert.deepEqual(JSON.parse(Buffer.from(fulfilled.params.body, "base64").toString()), { tenant: { id: "fixture-tenant" }, endpoint: "/fixture-api" });
      assert.deepEqual(client.upstream, ["bootstrap"], "environment response rewrite must not pretend request-stage write isolation");
      const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
      assert.equal(log.events.some(event => ["mock_candidate", "mock_attempt", "mock_checkpoint"].includes(event.type)), false);
      await listener.stop();
    });
  }
});

async function discoveryFixture(t, options) {
  const built = await fixture(t, { mockDecision: "allowed", ...options });
  const { run } = built;
  await recordEvent(run.runRoot, { type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: run.snapshotHash,
    source: "Original offline fixture oracle and confirmed test URL", items: [{ checkpoint_id: checkpointId, dependencies: [], scopes: [{
      scope_id: "fixture-scope", group_ids: [], location_ref: fixtureOrigin, location_status: "known",
      step_refs: ["CASE/s"], source_refs: ["snapshot:CASE/s"]
    }] }] });
  const identity = await recordEvent(run.runRoot, { type: "page_observation", checkpoint_ids: [checkpointId],
    description: "Offline component fixture: public non-production entry page, no login or target permission impersonated" });
  await recordEvent(run.runRoot, { type: "coverage_context", scope_ids: ["fixture-scope"], account_ref: null, observed_account_ref: null,
    target_id: targetId, context_ref: "verified-fixture-context", environment_ref: "non-production-fixture",
    observed_url: fixtureOrigin, verification: "verified", switch_status: "not_required", fact_refs: [identity.sequence] });
  await recordEvent(run.runRoot, { type: "run_state", status: "running" });
  built.config.discovery = { discovery_id: "discovery-1", checkpoint_ids: [checkpointId], context_ref: "verified-fixture-context",
    safe_probe: { url: `${fixtureOrigin}/known-read-only-health`, method: "GET" }, passthrough: [] };
  return built;
}

test("AC-16: controlled discovery blocks a safe probe then unknown writes without a candidate, scenario, hash or attempt", async t => {
  const { run, config, client } = await discoveryFixture(t);
  const before = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
  assert.equal(before.events.some(event => ["mock_candidate", "mock_attempt", "mock_channel_coverage", "checkpoint_started"].includes(event.type)), false);
  assert.equal(config.mock_scenario, undefined);
  const listener = await createProxyListener(config);
  t.after(() => listener.stop());
  await listener.start();
  const probe = { requestId: "safe-probe", request: { url: config.discovery.safe_probe.url, method: "GET", headers: {} } };
  await client.pause(probe);
  assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === probe.requestId), true,
    "the read-only probe proves the installed Request interception by being captured and blocked");
  for (const [requestId, method, url] of [
    ["unknown-save", "POST", `${fixtureOrigin}/api/save`],
    ["unknown-get-write", "GET", `${fixtureOrigin}/api/delete-all`],
    ["unknown-other-origin", "POST", "https://second-fixture.test/api/save"]
  ]) {
    await client.pause({ requestId, request: { url, method, headers: {}, ...(method === "POST" ? { postData: '{"name":"fixture"}' } : {}) } });
    assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === requestId), true, requestId);
    assert.equal(client.calls.some(call => ["Fetch.continueRequest", "Fetch.fulfillRequest"].includes(call.method) && call.params.requestId === requestId), false, requestId);
  }
  assert.deepEqual(client.upstream, [], "no protected probe or unknown request may reach upstream");
  const callsBeforeOtherPage = client.calls.length;
  await client.pause({ requestId: "independent-page", request: { url: `${fixtureOrigin}/api/save`, method: "POST", headers: {}, postData: "{}" } }, { sessionId: "session-other-page" });
  assert.equal(client.calls.length, callsBeforeOtherPage);
  assert.deepEqual(client.upstream, ["independent-page"], "a separate Target remains outside this page's interceptor");
  const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
  const observations = log.events.filter(event => event.type === "network_observation" && event.discovery_id === "discovery-1");
  assert.equal(observations.filter(event => event.kind === "discovery_probe").length, 1);
  assert.equal(observations.filter(event => event.kind === "discovery_request").length, 3);
  for (const event of observations) {
    assert.equal(event.target_id, targetId);
    assert.equal(event.context_ref, "verified-fixture-context");
    assert.deepEqual(event.checkpoint_ids, [checkpointId]);
  }
  assert.equal(log.events.some(event => ["mock_observation", "mock_checkpoint", "checkpoint_result"].includes(event.type)), false,
    "discovery facts are neither formal Mock receipts nor execution outcomes");
  await listener.stop();
});

test("AC-16: discovery refuses unavailable authorization, unsafe probe contracts and foreign identity contexts", async t => {
  for (const mockDecision of ["declined", null]) {
    await t.test(mockDecision ?? "unanswered", async t => {
      const { config, client } = await discoveryFixture(t, { mockDecision });
      let listener;
      try {
        await assert.rejects(async () => {
          listener = await createProxyListener(config);
          await listener.start();
        }, /授权|Mock|模拟|发现|discovery/i);
        assert.equal(client.calls.some(call => call.method === "Fetch.enable"), false);
      } finally { if (listener) await listener.stop(); }
    });
  }
  for (const patch of [{ safe_probe: undefined }, { safe_probe: { url: `${fixtureOrigin}/api/save`, method: "POST" } }, { context_ref: "another-page-context" }]) {
    await t.test(JSON.stringify(patch), async t => {
      const { config, client } = await discoveryFixture(t);
      let listener;
      try {
        await assert.rejects(async () => {
          listener = await createProxyListener({ ...config, discovery: { ...config.discovery, ...patch } });
          await listener.start();
        }, /探测|上下文|发现|probe|context|discovery/i);
        assert.equal(client.calls.some(call => call.method === "Fetch.enable"), false);
      } finally { if (listener) await listener.stop(); }
    });
  }
});

test("AC-16: discovery checks worker coverage before installing interception on the bound Target", async t => {
  const { config, client } = await discoveryFixture(t);
  client.extraTargets = [{ targetId: "worker-1", type: "service_worker", openerId: targetId, url: `${fixtureOrigin}/worker.js` }];
  let listener;
  try {
    await assert.rejects(async () => {
      listener = await createProxyListener(config);
      await listener.start();
    }, /worker|子|通道|覆盖/i);
    assert.equal(client.calls.some(call => call.method === "Fetch.enable"), false);
  } finally { if (listener) await listener.stop(); }
});

test("AC-02: an explicit case-Mock purpose cannot borrow environment authorization or a non_business label", async t => {
  const { run, config, client } = await fixture(t, { mockDecision: "declined" });
  const rules = [{ match: { protocol: "https:", hostname: "fixture.test", path_prefix: "/api/items", methods: ["GET"] },
    response: { body: { mode: "replace_text", value: '{"items":[{"id":"synthetic-required-item"}]}' } } }];
  await authorizeBase(run, rules);
  let listener;
  try {
    await assert.rejects(async () => {
      listener = await createProxyListener({ ...config, rules, purpose: "case_mock", response_data_kind: "non_business" });
    }, /Mock|模拟|用途|场景|purpose/i);
    assert.equal(client.calls.some(call => call.method === "Fetch.enable"), false);
  } finally { if (listener) await listener.stop(); }
});


async function mockResponseFixture(t, responseHeaders = {}, discovery = null) {
  const built = discovery?.built ?? await discoveryFixture(t);
  const { run, config } = built;
  delete config.discovery;
  const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
  const context = log.events.find(event => event.type === "coverage_context");
  const observed = await recordEvent(run.runRoot, { type: "page_observation", checkpoint_ids: [checkpointId],
    target_id: targetId, context_ref: context.context_ref, description: "组件夹具列表为空，需要受控补充数据" });
  await recordEvent(run.runRoot, { type: "data_gap", gap_id: "gap-response", checkpoint_ids: [checkpointId],
    real_blocker_refs: [observed.sequence], exploration_refs: [observed.sequence], missing_conditions: ["可供展示的记录"],
    known_request_facts: ["组件契约 POST /api/save 返回保存确认"], not_started_dependencies: ["需要可用数据"] });
  await recordEvent(run.runRoot, { type: "mock_candidate", candidate_id: "candidate-response", case_id: "CASE", checkpoint_ids: [checkpointId],
    gap_ids: ["gap-response"], assertion_domain: "frontend", assertion_basis: "原检查仅验证前端保存确认展示", purpose: "补充前端数据" });
  const scenario = { schema_version: "mock-scenario-v1", scenario_id: "response-scenario", revision: 1, run_id: run.runId,
    case_id: "CASE", attempt_id: "attempt-response", candidate_checkpoint_ids: [checkpointId], supporting_checkpoint_ids: [], initial_state: { saved: false },
    routes: [{ route_id: "save", match: { origin: fixtureOrigin, pathname: "/api/save", method: "POST", query: {},
      body: { rules: [{ pointer: "/name", presence: "required", type: "string" }], allowed_extra_pointers: [] } },
      effect: [{ op: "set", path: "/saved", value: true }], response: { status: 201, headers: responseHeaders, body: { saved: { $state: "/saved" } } },
      provenance: { source_refs: ["component-fixture-contract"], synthetic_values: [] } }], passthrough: [],
    provenance: { source_refs: ["component-fixture-contract"], synthetic_values: [] } };
  const bytes = JSON.stringify(scenario);
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  await mkdir(path.join(run.runRoot, "mock"));
  await writeFile(path.join(run.runRoot, "mock/scenario.json"), bytes);
  const network = discovery?.request ?? await recordEvent(run.runRoot, { type: "network_observation", checkpoint_ids: [checkpointId], target_id: targetId,
    context_ref: context.context_ref, channel: "page-http", route_id: "save", url: `${fixtureOrigin}/api/save`, method: "POST" });
  const coverage = await recordEvent(run.runRoot, { type: "mock_channel_coverage", target_id: targetId, context_ref: context.context_ref,
    scenario_hash: hash, covered_route_ids: ["save"], request_refs: [network.sequence], uncovered_channels: [],
    ...(discovery ? { route_bindings: [{ route_id: "save", request_ref: network.sequence }] } : {}),
    channels: [{ kind: "page-http", target_id: targetId, request_refs: [network.sequence] }] });
  await recordEvent(run.runRoot, { type: "mock_attempt", attempt_id: "attempt-response", candidate_ids: ["candidate-response"], case_id: "CASE",
    action: "started", scenario_revision: 1, scenario_hash: hash, state_version: 0, context_refs: [context.sequence],
    proxy_cycle_refs: ["cycle-response"], candidate_checkpoint_ids: [checkpointId], supporting_checkpoint_ids: [] });
  Object.assign(config, { proxy_cycle_id: "cycle-response", mock_channel_coverage_ref: coverage.sequence,
    mock_scenario: { path: "mock/scenario.json", sha256: hash, attempt_id: "attempt-response", state_path: "mock/state.json", receipts_path: "mock/receipts.json" } });
  return { ...built, context };
}

test("AC-04: a final Mock response must explicitly preserve matching environment response header requirements", async t => {
  for (const [name, headers, compatible] of [["missing", {}, false], ["conflicting", { "x-env": "wrong" }, false], ["consistent", { "x-env": "ready" }, true]]) {
    await t.test(name, async t => {
      const { run, config, client } = await mockResponseFixture(t, headers);
      const rules = [{ match: { protocol: "https:", hostname: "fixture.test", path_prefix: "/api/save", methods: ["POST"] },
        response: { headers: { set: { "x-env": "ready" } } } }];
      await authorizeBase(run, rules);
      let listener;
      try {
        const create = async () => { listener = await createProxyListener({ ...config, rules, purpose: "environment_access" }); await listener.start(); };
        if (!compatible) {
          await assert.rejects(create, /header|头|冲突|环境/i);
          assert.equal(client.calls.some(call => call.method === "Fetch.enable"), false, "reject the incompatible composition before interception is enabled");
        } else {
          await create();
          await client.pause({ requestId: "save-with-env-header", request: { url: `${fixtureOrigin}/api/save`, method: "POST",
            headers: { "content-type": "application/json" }, postData: '{"name":"fixture"}' } });
          const delivered = client.calls.find(call => call.method === "Fetch.fulfillRequest");
          assert.ok(delivered, "compatible Mock response reaches the page");
          assert.ok(delivered.params.responseHeaders.some(header => header.name.toLowerCase() === "x-env" && header.value === "ready"));
          assert.deepEqual(client.upstream, []);
        }
      } finally { if (listener) await listener.stop(); }
    });
  }
});

test("review regression: Mock channel authorization expires after a new actual identity is observed on the same Target", async t => {
  const { run, config, client, context } = await mockResponseFixture(t);
  const listener = await createProxyListener(config);
  t.after(() => listener.stop());
  await listener.start();
  const observed = await recordEvent(run.runRoot, { type: "page_observation", checkpoint_ids: [checkpointId],
    target_id: targetId, context_ref: context.context_ref, description: "组件页面已切换到另一个真实账号" });
  await recordEvent(run.runRoot, { type: "identity_observation", account_ref: "another-fixture-account", observed_account_ref: "another-fixture-account",
    target_id: targetId, context_ref: context.context_ref, environment_ref: context.environment_ref, observed_url: fixtureOrigin,
    verification: "verified", fact_refs: [observed.sequence] });
  await assert.rejects(listener.assertReadyForBusiness(), /上下文|身份|失效|核验/);
  await client.pause({ requestId: "stale-identity-save", request: { url: `${fixtureOrigin}/api/save`, method: "POST",
    headers: { "content-type": "application/json" }, postData: '{"name":"fixture"}' } });
  assert.equal(client.calls.some(call => call.method === "Fetch.fulfillRequest" && call.params.requestId === "stale-identity-save"), false);
  assert.equal(client.calls.some(call => call.method === "Fetch.failRequest" && call.params.requestId === "stale-identity-save"), true);
  assert.deepEqual(client.upstream, []);
  await listener.stop();
});

test("review regression: a prepared Mock execution cannot start after its attempt moves to another scenario hash", async t => {
  const { run, config, context } = await mockResponseFixture(t);
  const facts = await recordEvent(run.runRoot, { type: "page_observation", checkpoint_ids: [checkpointId],
    target_id: targetId, context_ref: context.context_ref, description: "版本 1 场景的输入已验证" });
  const preparation = await recordEvent(run.runRoot, { type: "scenario_preparation", checkpoint_id: checkpointId,
    scenario_id: "fixture-scope", execution_id: "prepared-on-old-scenario", batch_id: "general", context_refs: [context.sequence],
    fact_refs: [facts.sequence], data_source: "mock", permission_source: "real", attempt_id: "attempt-response",
    scenario_hash: config.mock_scenario.sha256, state_version: 0 });
  const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
  const { sequence, at, ...attempt } = log.events.find(event => event.type === "mock_attempt");
  const revised = JSON.parse(await readFile(path.join(run.runRoot, "mock/scenario.json"), "utf8"));
  revised.revision = 2;
  revised.routes[0].response.body = { saved: { $state: "/saved" }, revision: 2 };
  const bytes = JSON.stringify(revised);
  await writeFile(path.join(run.runRoot, "mock/scenario-v2.json"), bytes);
  await recordEvent(run.runRoot, { ...attempt, action: "scenario_updated", scenario_revision: 2,
    scenario_hash: crypto.createHash("sha256").update(bytes).digest("hex") });
  await assert.rejects(recordEvent(run.runRoot, { type: "mock_checkpoint", action: "started", attempt_id: "attempt-response",
    checkpoint_id: checkpointId, scenario_id: "fixture-scope", execution_id: "prepared-on-old-scenario",
    scope_ids: ["fixture-scope"], context_refs: [context.sequence], preparation_ref: preparation.sequence }), /场景|哈希|状态|准备|失效/);
});


test("AC-16: route bindings promote blocked discovery facts without rewriting history or inventing route IDs", async t => {
  for (const mode of ["valid", "wrong-url", "wrong-method", "foreign-target", "missing-probe", "other-discovery-probe"]) {
    await t.test(mode, async t => {
      const built = await discoveryFixture(t);
      const discovery = await createProxyListener(built.config);
      let discovered;
      try {
        await discovery.start();
        if (mode !== "missing-probe") await built.client.pause({ requestId: "binding-probe", request: {
          url: built.config.discovery.safe_probe.url, method: "GET", headers: {} } });
        await built.client.pause({ requestId: "binding-unknown", request: {
          url: `${fixtureOrigin}${mode === "wrong-url" ? "/api/another-route" : "/api/save"}`,
          method: mode === "wrong-method" ? "GET" : "POST", headers: { "content-type": "application/json" }, postData: '{"name":"fixture"}' } });
        const log = JSON.parse(await readFile(path.join(built.run.runRoot, "execution-log.json"), "utf8"));
        discovered = log.events.find(event => event.kind === "discovery_request");
        assert.equal(discovered.route_id, undefined, "the route is not known during discovery");
        assert.equal(discovered.disposition, "blocked");
        assert.deepEqual(built.client.upstream, []);
      } finally { await discovery.stop(); }
      const originalFact = JSON.stringify(discovered);
      if (["foreign-target", "other-discovery-probe"].includes(mode)) {
        // Invalid new references use public append-only facts, never mutate the
        // real discovery record. The channel validator must reject their binding.
        const { sequence, at, ...fact } = discovered;
        discovered = await recordEvent(built.run.runRoot, { ...fact,
          ...(mode === "foreign-target" ? { target_id: "another-target" } : { discovery_id: "another-discovery-without-probe" }) });
      }
      const formalClient = new FakeCdp();
      built.client = formalClient;
      built.config.clientFactory = async () => formalClient;
      const { run, config } = await mockResponseFixture(t, {}, { built, request: discovered });
      let formal;
      try {
        if (mode === "valid") {
          formal = await createProxyListener(config);
          await formal.start();
          await formal.assertReadyForBusiness();
          await formalClient.pause({ requestId: "formal-save", request: { url: `${fixtureOrigin}/api/save`, method: "POST",
            headers: { "content-type": "application/json" }, postData: '{"name":"fixture"}' } });
          assert.equal(formalClient.calls.some(call => call.method === "Fetch.fulfillRequest" && call.params.requestId === "formal-save"), true);
          assert.deepEqual(formalClient.upstream, []);
          const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
          assert.equal(JSON.stringify(log.events.find(event => event.sequence === discovered.sequence)), originalFact,
            "binding a compiled route must preserve the original discovery observation byte for byte");
          assert.equal(log.events.some(event => event.type === "mock_observation" && event.route_id === "save"), true);
        } else {
          await assert.rejects(async () => { formal = await createProxyListener(config); await formal.start(); }, /通道|Target|路由|核验/);
          assert.equal(formalClient.calls.some(call => call.method === "Fetch.enable"), false, "invalid discovery chains cannot enable formal interception");
        }
      } finally { if (formal) await formal.stop(); }
    });
  }
});
