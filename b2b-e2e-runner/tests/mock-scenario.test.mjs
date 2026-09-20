import assert from "node:assert/strict";
import test from "node:test";

import { MOCK_BODY_LIMIT_BYTES, MockScenarioEngine, compileMockScenario } from "../scripts/lib/mock-scenario.mjs";

function scenario(overrides = {}) {
  return {
    schema_version: "mock-scenario-v1",
    scenario_id: "scenario-orders",
    revision: 1,
    run_id: "RUN-1",
    case_id: "CASE-1",
    attempt_id: "ATTEMPT-1",
    candidate_checkpoint_ids: ["CASE-1/s/o"],
    supporting_checkpoint_ids: [],
    initial_state: { orders: {}, sequence: 0 },
    routes: [
      {
        route_id: "create-order",
        match: {
          origin: "https://fixture.example.test",
          pathname: "/api/orders",
          method: "POST",
          query: { tenant: ["north"], tag: ["a", "b"] },
          body: {
            rules: [
              { pointer: "/quantity", presence: "required", type: "number", value: 1 },
              { pointer: "/name", presence: "required", type: "string" }
            ],
            allowed_extra_pointers: []
          }
        },
        effect: [
          { op: "set", path: "/sequence", value: 1 },
          { op: "set", path: "/orders/ORDER-1", value: { id: "ORDER-1", name: { $request: "/body/name" }, state: "created" } }
        ],
        response: {
          status: 201,
          headers: { "x-mock-route": "create-order" },
          body: { order: { $state: "/orders/ORDER-1" }, marker: { $literal: { $state: "literal-not-template" } } }
        },
        provenance: { source_refs: ["network:POST /api/orders"], synthetic_values: ["ORDER-1"] }
      },
      {
        route_id: "read-order",
        match: {
          origin: "https://fixture.example.test:443",
          pathname: "/api/orders/ORDER-1",
          method: "GET",
          query: {},
          body: { rules: [], allowed_extra_pointers: [] }
        },
        effect: [],
        response: { status: 200, headers: {}, body: { order: { $state: "/orders/ORDER-1" } } },
        provenance: { source_refs: ["network:GET /api/orders/:id"], synthetic_values: [] }
      }
    ],
    passthrough: [{
      passthrough_id: "safe-config",
      match: { origin: "https://fixture.example.test", pathname: "/api/config", method: "GET", query: {}, body: { rules: [], allowed_extra_pointers: [] } },
      basis_refs: ["user-confirmed:read-only-config"]
    }],
    provenance: { source_refs: ["observed-network"], synthetic_values: ["ORDER-1"] },
    ...overrides
  };
}

function request(url, method = "GET", body) {
  return {
    url,
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  };
}

test("v1.1 AC-15/16/17: origin/path/method/query arrays and JSON body types match exactly", async () => {
  const engine = new MockScenarioEngine(compileMockScenario(scenario()));
  const matched = await engine.handle(request(
    "https://fixture.example.test/api/orders?tag=a&tenant=north&tag=b",
    "POST",
    { quantity: 1, name: "示例订单" }
  ), { proxy_cycle_id: "cycle-1", request_id: "request-1" });
  assert.equal(matched.disposition, "mocked");
  assert.equal(matched.route_id, "create-order");
  assert.equal(matched.response.status, 201);
  assert.deepEqual(JSON.parse(matched.response.body), {
    order: { id: "ORDER-1", name: "示例订单", state: "created" },
    marker: { $state: "literal-not-template" }
  });

  for (const invalid of [
    request("https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b&extra=1", "POST", { quantity: 1, name: "x" }),
    request("https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: "1", name: "x" }),
    request("https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "x", extra: true }),
    request("https://fixture.example.test/api/orders/?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "x" })
  ]) {
    await assert.rejects(engine.handle(invalid, { proxy_cycle_id: "cycle-1", request_id: crypto.randomUUID() }), error =>
      error.code === "MOCK_REQUEST_BLOCKED");
  }
});

test("v1.1 AC-18/24/25: ambiguous or unknown business traffic fails closed; only confirmed safe traffic passes through", async () => {
  const duplicate = scenario();
  duplicate.routes.push({ ...structuredClone(duplicate.routes[1]), route_id: "read-order-copy" });
  const conflict = new MockScenarioEngine(compileMockScenario(duplicate));
  await assert.rejects(conflict.handle(request("https://fixture.example.test/api/orders/ORDER-1"), {
    proxy_cycle_id: "cycle-1", request_id: "request-conflict"
  }), error => error.code === "MOCK_RULE_CONFLICT");

  const engine = new MockScenarioEngine(compileMockScenario(scenario()));
  assert.deepEqual(await engine.handle(request("https://fixture.example.test/api/config"), {
    proxy_cycle_id: "cycle-1", request_id: "request-safe"
  }), { disposition: "passthrough", passthrough_id: "safe-config" });
  await assert.rejects(engine.handle(request("https://fixture.example.test/api/delete-all", "GET"), {
    proxy_cycle_id: "cycle-1", request_id: "request-unknown-get"
  }), error => error.code === "MOCK_REQUEST_BLOCKED", "a mutating GET cannot be inferred safe from its verb");
  await assert.rejects(engine.handle(request("https://fixture.example.test/api/query", "POST", {}), {
    proxy_cycle_id: "cycle-1", request_id: "request-unknown-post"
  }), error => error.code === "MOCK_REQUEST_BLOCKED", "a query POST cannot be inferred write-only from its verb");

  const syntheticPassthrough = scenario();
  syntheticPassthrough.passthrough[0].match.query = { id: ["ORDER-1"] };
  const syntheticEngine = new MockScenarioEngine(compileMockScenario(syntheticPassthrough));
  await assert.rejects(syntheticEngine.handle(request("https://fixture.example.test/api/config?id=ORDER-1"), {
    proxy_cycle_id: "cycle-1", request_id: "request-synthetic-passthrough"
  }), error => error.code === "MOCK_REQUEST_BLOCKED", "synthetic IDs must never pass through to real upstream");
});

test("v1.1 AC-19/20/21: state effects, templates, response validation, and commit are one transaction", async () => {
  const engine = new MockScenarioEngine(compileMockScenario(scenario()));
  const create = await engine.handle(request(
    "https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "事务订单" }
  ), { proxy_cycle_id: "cycle-1", request_id: "request-create" });
  assert.equal(create.state_version, 1);
  const read = await engine.handle(request("https://fixture.example.test/api/orders/ORDER-1"), {
    proxy_cycle_id: "cycle-1", request_id: "request-read"
  });
  assert.deepEqual(JSON.parse(read.response.body).order, { id: "ORDER-1", name: "事务订单", state: "created" });

  const broken = scenario();
  broken.routes[0].response.body = { missing: { $state: "/does-not-exist" } };
  const brokenEngine = new MockScenarioEngine(compileMockScenario(broken));
  await assert.rejects(brokenEngine.handle(request(
    "https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "不会提交" }
  ), { proxy_cycle_id: "cycle-1", request_id: "request-broken" }), error => error.code === "MOCK_TEMPLATE_MISSING");
  assert.deepEqual(brokenEngine.snapshot().state, { orders: {}, sequence: 0 }, "response failure must not commit the tentative state");
});

test("v1.1 AC-22: one attempt serializes transactions and deduplicates only the same Fetch event identity", async () => {
  const engine = new MockScenarioEngine(compileMockScenario(scenario()));
  const requestValue = request("https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "幂等订单" });
  const first = await engine.handle(requestValue, { proxy_cycle_id: "cycle-1", request_id: "same-request" });
  const duplicate = await engine.handle(requestValue, { proxy_cycle_id: "cycle-1", request_id: "same-request" });
  assert.equal(duplicate.receipt_id, first.receipt_id);
  assert.equal(engine.snapshot().state_version, 1);

  const separate = await engine.handle(requestValue, { proxy_cycle_id: "cycle-1", request_id: "new-browser-request" });
  assert.notEqual(separate.receipt_id, first.receipt_id);
  assert.equal(engine.snapshot().state_version, 2);
});

test("v1.1 AC-20/21: unsafe pointers, arbitrary callbacks, oversized responses, and incompatible live revisions are rejected", async () => {
  const unsafe = scenario();
  unsafe.routes[0].effect[0].path = "/__proto__/polluted";
  assert.throws(() => compileMockScenario(unsafe), error => error.code === "MOCK_SCENARIO_CONTRACT");

  const callback = scenario();
  callback.routes[0].response.callback = "return true";
  assert.throws(() => compileMockScenario(callback), error => error.code === "MOCK_SCENARIO_CONTRACT");

  const oversized = scenario();
  oversized.routes[0].response.body = "x".repeat(MOCK_BODY_LIMIT_BYTES);
  const oversizedEngine = new MockScenarioEngine(compileMockScenario(oversized));
  await assert.rejects(oversizedEngine.handle(request(
    "https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "超限响应" }
  ), { proxy_cycle_id: "cycle-large", request_id: "request-large" }), error => error.code === "MOCK_BODY_TOO_LARGE");

  const engine = new MockScenarioEngine(compileMockScenario(scenario()));
  await engine.handle(request(
    "https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "已执行" }
  ), { proxy_cycle_id: "cycle-1", request_id: "request-1" });
  const changed = scenario({ revision: 2 });
  changed.routes[0].response.status = 202;
  assert.throws(() => engine.updateScenario(compileMockScenario(changed)), error => error.code === "MOCK_REVISION_CONFLICT");
});

test("v1.1 AC-11/22: a resumed attempt cannot rewrite a route whose receipt proves it was already used", async () => {
  const original = compileMockScenario(scenario());
  const engine = new MockScenarioEngine(original);
  await engine.handle(request(
    "https://fixture.example.test/api/orders?tenant=north&tag=a&tag=b", "POST", { quantity: 1, name: "恢复前已执行" }
  ), { proxy_cycle_id: "cycle-1", request_id: "request-before-restart" });

  const resumed = new MockScenarioEngine(original, { runtimeState: engine.runtimeState() });
  const changed = scenario({ revision: 2 });
  changed.routes[0].response.status = 202;
  assert.throws(
    () => resumed.updateScenario(compileMockScenario(changed)),
    error => error.code === "MOCK_REVISION_CONFLICT"
  );
});

test("v1.1 response contract: an explicitly confirmed text response stays text instead of becoming a quoted JSON string", async () => {
  const textScenario = scenario();
  textScenario.routes[1].response = { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: "ready" };
  const engine = new MockScenarioEngine(compileMockScenario(textScenario));
  const result = await engine.handle(request("https://fixture.example.test/api/orders/ORDER-1"), {
    proxy_cycle_id: "cycle-1", request_id: "request-text"
  });
  assert.equal(result.response.body, "ready");
  assert.equal(result.response.headers["content-type"], "text/plain; charset=utf-8");
});
