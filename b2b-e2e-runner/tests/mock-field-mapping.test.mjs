import assert from "node:assert/strict";
import test from "node:test";

import { assertExecutionComplete, deriveExecutionProgress, validateProgressEvent } from "../scripts/lib/execution-progress.mjs";
import { validateMockEvent } from "../scripts/lib/mock-fallback.mjs";
import {
  applyMappedResponse, collectPageResults, formatFieldQuestions, mockRuleGapFacts, planMockFieldInquiry, singleInterfaceScenario
} from "../scripts/lib/mock-field-mapping.mjs";
import { MockScenarioEngine, compileMockScenario } from "../scripts/lib/mock-scenario.mjs";

const iface = { origin: "https://fixture.example.test", pathname: "/api/orders", method: "GET" };
const response = { data: { status: "已发货", note: "备注" } };

function testCase(id, texts) {
  return {
    case_id: id, module: "订单", title: id, preconditions: [],
    steps: [{ step_id: "s", action: "查看", expected: texts.map((text, index) => ({ oracle_id: `o${index + 1}`, text })) }]
  };
}

function coverage(entries) {
  return {
    items: entries.map(entry => ({
      checkpoint_id: `${entry.id}/s/o1`,
      scopes: [{ location_ref: entry.location ?? null }]
    }))
  };
}

test("collected page results from one interface are asked once, then a new unbound result is a rule gap", () => {
  const cases = [
    testCase("current", ["待确定A", "已发货"]),
    testCase("same", ["待确定B"]),
    testCase("done", ["已经执行"]),
    testCase("other", ["其他页面"]),
    testCase("noloc", ["没有位置"])
  ];
  const pageResults = collectPageResults({
    cases, currentCaseId: "current", pagePathname: "/orders", executedCaseIds: ["done"],
    coveragePlan: coverage([
      { id: "current", location: "https://fixture.example.test/orders" },
      { id: "same", location: "https://fixture.example.test/orders?tab=1" },
      { id: "done", location: "https://fixture.example.test/orders" },
      { id: "other", location: "https://fixture.example.test/other" },
      { id: "noloc" }
    ])
  });
  assert.deepEqual(pageResults, ["待确定A", "已发货", "待确定B"]);
  const asked = planMockFieldInquiry({ interface: iface, responseJson: response, pageResults });
  assert.equal(asked.action, "ask");
  assert.equal(asked.mapping, null);
  assert.deepEqual(asked.rule_gaps, []);
  assert.deepEqual(asked.ask.page_results, ["待确定A", "待确定B"]);
  const message = formatFieldQuestions([
    asked.ask,
    { interface: { ...iface, pathname: "/api/other" }, page_results: ["另一接口结果"] }
  ]);
  assert.match(message, /（1） 接口 https:\/\/fixture\.example\.test GET \/api\/orders/);
  assert.match(message, /（2） 接口 https:\/\/fixture\.example\.test GET \/api\/other/);
  assert.match(message, /待确定A/);
  assert.match(message, /待确定B/);
  assert.doesNotMatch(message, /已发货/);

  const recorded = planMockFieldInquiry({
    interface: iface, responseJson: response, pageResults,
    userReply: { assistance_ref: 8, bindings: [{ page_result: "待确定A", response_pointer: "/data/status" }], other_interface_results: ["待确定B"] }
  });
  assert.equal(recorded.action, "record");
  assert.equal(recorded.mapping.source, "user");
  assert.deepEqual(recorded.mapping.bindings.map(item => item.page_result), ["已发货", "待确定A"]);
  assert.deepEqual(recorded.rule_gaps, []);
  const closed = planMockFieldInquiry({
    interface: iface, responseJson: { data: { status: "已发货", note: "备注" } },
    pageResults: ["已发货", "新出现的结果"], existingMapping: recorded.mapping
  });
  assert.equal(closed.action, "closed");
  assert.equal(closed.ask, null);
  assert.equal(closed.mapping, null);
  assert.deepEqual(closed.rule_gaps, [{ page_result: "新出现的结果", cause: "unbound_after_close" }]);
});

test("fifty cases sharing one interface produce a single question", () => {
  const cases = Array.from({ length: 50 }, (_, index) => testCase(`C-${index + 1}`, [`结果 ${index + 1}`]));
  const pageResults = collectPageResults({
    cases, currentCaseId: "C-1", pagePathname: "/orders",
    coveragePlan: coverage(cases.map(item => ({ id: item.case_id, location: "https://fixture.example.test/orders" })))
  });
  assert.equal(pageResults.length, 50);
  const plan = planMockFieldInquiry({ interface: iface, responseJson: response, pageResults });
  assert.equal(plan.action, "ask");
  assert.equal(plan.ask.page_results.length, 50);
  const message = formatFieldQuestions([plan.ask]);
  assert.equal(message.split("（").length - 1, 1);
});

test("a fully determined response is recorded as observed and rewrites only that field", async () => {
  const plan = planMockFieldInquiry({
    interface: iface, responseJson: response, pageResults: ["已发货", "备注"]
  });
  assert.equal(plan.action, "record");
  assert.equal(plan.ask, null);
  assert.equal(plan.mapping.source, "observed");
  assert.deepEqual(plan.mapping.bindings, [
    { page_result: "已发货", response_pointer: "/data/status" },
    { page_result: "备注", response_pointer: "/data/note" }
  ]);
  const body = applyMappedResponse(response, plan.mapping.bindings, { 已发货: "待签收" });
  assert.deepEqual(body, { data: { status: "待签收", note: "备注" } });
  const raw = singleInterfaceScenario({
    runId: "RUN-1", caseId: "C-1", attemptId: "A-1", scenarioId: "S-1", checkpointIds: ["C-1/s/o1"],
    interface: iface, body, syntheticValues: ["待签收"]
  });
  const scenario = compileMockScenario(raw);
  assert.equal(scenario.routes.length, 1);
  const engine = new MockScenarioEngine(raw);
  const matched = await engine.handle({
    url: "https://fixture.example.test/api/orders?page=2", method: "GET", headers: { "content-type": "application/json" }, body: JSON.stringify({ unused: true })
  }, { proxy_cycle_id: "cycle-1", request_id: "matched" });
  assert.equal(matched.disposition, "mocked");
  assert.equal(matched.response.status, 200);
  const passed = await engine.handle({
    url: "https://fixture.example.test/api/config", method: "GET", headers: {}
  }, { proxy_cycle_id: "cycle-1", request_id: "other" });
  assert.deepEqual(passed, { disposition: "passthrough" });
  await assert.rejects(engine.handle({
    url: "https://fixture.example.test/api/config?value=待签收", method: "GET", headers: {}
  }, { proxy_cycle_id: "cycle-1", request_id: "synthetic" }), error => error.code === "MOCK_REQUEST_BLOCKED");
});

test("allowed mock_rule_gap completes a case and a plain undetermined does not", () => {
  const cases = {
    schema_version: "2.0", suite: { name: "完成条件", target_urls: ["https://fixture.example.test"] },
    cases: [testCase("CASE-1", ["看到状态"])]
  };
  const base = extra => ({
    schema_version: "2.0",
    extensions: { execution_coverage: { schema_version: "1.0" }, mock_fallback: { schema_version: "1.0" } },
    run: { run_id: "RUN-1", status: "running" },
    events: [
      { type: "mock_policy", decision: "allowed", sequence: 1 },
      { type: "coverage_plan", items: [{ checkpoint_id: "CASE-1/s/o1", dependencies: [], scopes: [{ scope_id: "scope-1", group_ids: [], step_refs: ["s"], source_refs: ["case"] }] }], sequence: 2 },
      extra
    ]
  });
  const gap = { type: "checkpoint_result", checkpoint_id: "CASE-1/s/o1", result: "undetermined", mock_rule_gap: true, sequence: 3 };
  assert.equal(deriveExecutionProgress(cases, base(gap)).complete, true);
  assert.doesNotThrow(() => assertExecutionComplete(cases, base(gap)));
  const plain = { type: "checkpoint_result", checkpoint_id: "CASE-1/s/o1", result: "undetermined", sequence: 3 };
  assert.equal(deriveExecutionProgress(cases, base(plain)).complete, false);
  assert.throws(() => assertExecutionComplete(cases, base(plain)), /未实际执行|不能/);
  const facts = mockRuleGapFacts({ interface: iface, pageResult: "看到状态", cause: "user_omitted" });
  assert.match(facts.missing_fact, /看到状态/);
  assert.ok(facts.known_facts.some(item => item.includes("唯一字段")));
  assert.ok(facts.known_facts.some(item => item.includes("用户没有提供")));
  assert.throws(() => validateProgressEvent(cases, base(plain), {
    type: "checkpoint_result", checkpoint_id: "CASE-1/s/o1", result: "passed", mock_rule_gap: true
  }), /mock_rule_gap/);
});

test("one interface mapping is written once and must point at the real response", () => {
  const log = {
    extensions: { mock_fallback: { schema_version: "1.0" } },
    events: [
      { type: "mock_policy", decision: "allowed", sequence: 1 },
      { type: "network_observation", sequence: 2, response_json: response },
      { type: "assistance", sequence: 3, assistance_id: "ask-orders", phase: "resolved" }
    ]
  };
  const cases = { cases: [] };
  const mapping = {
    type: "mock_field_mapping", interface: iface, source: "user", response_ref: 2, assistance_ref: 3,
    bindings: [{ page_result: "已发货", response_pointer: "/data/status" }],
    other_interface_results: ["来自其他接口"]
  };
  assert.doesNotThrow(() => validateMockEvent(cases, log, mapping));
  log.events.push({ ...mapping, sequence: 4 });
  assert.throws(() => validateMockEvent(cases, log, mapping), /只能写一次/);
  assert.throws(() => validateMockEvent(cases, { ...log, events: log.events.slice(0, 3) }, {
    ...mapping, bindings: [{ page_result: "已发货", response_pointer: "/data/missing" }]
  }), /response_pointer|真实响应/);
  assert.throws(() => validateMockEvent(cases, { ...log, events: log.events.slice(0, 3) }, {
    ...mapping, source: "observed"
  }), /observed/);
});
