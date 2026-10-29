function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

export function interfaceIdentity(value) {
  const origin = new URL(value.origin).origin;
  const pathname = value.pathname;
  const method = String(value.method ?? "").toUpperCase();
  if (!pathname || !pathname.startsWith("/") || !method) {
    throw Object.assign(new Error("接口必须包含 origin、pathname 和 method"), { code: "INPUT_CONTRACT" });
  }
  return { origin, pathname, method };
}

export function sameInterface(left, right) {
  const a = interfaceIdentity(left);
  const b = interfaceIdentity(right);
  return a.origin === b.origin && a.pathname === b.pathname && a.method === b.method;
}

function pointerSegments(pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/") || pointer === "/") return null;
  const segments = pointer.slice(1).split("/").map(segment => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  if (segments.some(segment => !segment || ["__proto__", "prototype", "constructor"].includes(segment))) return null;
  return segments;
}

export function readJsonPointer(value, pointer) {
  const segments = pointerSegments(pointer);
  if (!segments) return { found: false, value: undefined };
  let current = value;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) return { found: false, value: undefined };
    current = current[segment];
  }
  return { found: true, value: current };
}

function setJsonPointer(value, pointer, next) {
  const segments = pointerSegments(pointer);
  if (!segments) throw Object.assign(new Error(`JSON Pointer 无效：${pointer}`), { code: "INPUT_CONTRACT" });
  let current = value;
  for (const segment of segments.slice(0, -1)) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) {
      throw Object.assign(new Error(`响应里没有字段 ${pointer}`), { code: "INPUT_CONTRACT" });
    }
    current = current[segment];
  }
  const key = segments.at(-1);
  if (!current || typeof current !== "object" || !Object.hasOwn(current, key)) {
    throw Object.assign(new Error(`响应里没有字段 ${pointer}`), { code: "INPUT_CONTRACT" });
  }
  current[key] = next;
}

function stringLeaves(value, prefix = "") {
  if (typeof value === "string") return [{ pointer: prefix || "/", value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => stringLeaves(item, `${prefix}/${index}`));
  if (object(value)) {
    return Object.keys(value).flatMap(key => stringLeaves(value[key], `${prefix}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`));
  }
  return [];
}

export function uniquePointerForText(responseJson, visibleText) {
  if (typeof visibleText !== "string" || !visibleText) return null;
  const hits = stringLeaves(responseJson).filter(item => item.value.includes(visibleText));
  return hits.length === 1 ? hits[0].pointer : null;
}

export function pageResultsOfCase(testCase) {
  return (testCase?.steps ?? []).flatMap(step => (step.expected ?? []).map(oracle => oracle.text)).filter(text => typeof text === "string" && text);
}

function caseIdOfCheckpoint(cases, checkpointId) {
  return [...cases].filter(item => checkpointId === item.case_id || checkpointId.startsWith(`${item.case_id}/`))
    .sort((left, right) => right.case_id.length - left.case_id.length)[0]?.case_id ?? null;
}

function locationPathname(locationRef) {
  if (typeof locationRef !== "string" || !locationRef.trim()) return null;
  try { return new URL(locationRef).pathname; }
  catch { return null; }
}

function caseMatchesPage(caseId, coveragePlan, pagePathname, cases) {
  const items = (coveragePlan?.items ?? []).filter(item => caseIdOfCheckpoint(cases, item.checkpoint_id) === caseId);
  const pathnames = items.flatMap(item => item.scopes ?? []).map(scope => locationPathname(scope.location_ref)).filter(Boolean);
  if (pathnames.length === 0) return false;
  return pathnames.includes(pagePathname);
}

export function collectPageResults({ cases, currentCaseId, pagePathname, coveragePlan, executedCaseIds = [] }) {
  const executed = new Set(executedCaseIds);
  const results = [];
  const push = text => { if (text && !results.includes(text)) results.push(text); };
  const current = cases.find(item => item.case_id === currentCaseId);
  for (const text of pageResultsOfCase(current)) push(text);
  for (const testCase of cases) {
    if (testCase.case_id === currentCaseId || executed.has(testCase.case_id)) continue;
    if (!caseMatchesPage(testCase.case_id, coveragePlan, pagePathname, cases)) continue;
    for (const text of pageResultsOfCase(testCase)) push(text);
  }
  return results;
}

function determinedBindings(responseJson, pageResults) {
  const determined = [];
  const unknown = [];
  for (const pageResult of pageResults) {
    const pointer = responseJson == null ? null : uniquePointerForText(responseJson, pageResult);
    if (pointer) determined.push({ page_result: pageResult, response_pointer: pointer });
    else unknown.push(pageResult);
  }
  return { determined, unknown };
}

function closedDecision({ existingMapping, pageResults, responseJson }) {
  const bound = new Map((existingMapping.bindings ?? []).map(item => [item.page_result, item.response_pointer]));
  const other = new Set(existingMapping.other_interface_results ?? []);
  const usable = [];
  const ruleGaps = [];
  for (const pageResult of pageResults) {
    if (other.has(pageResult)) continue;
    if (bound.has(pageResult)) {
      usable.push({ page_result: pageResult, response_pointer: bound.get(pageResult) });
      continue;
    }
    const pointer = responseJson == null ? null : uniquePointerForText(responseJson, pageResult);
    if (pointer) usable.push({ page_result: pageResult, response_pointer: pointer });
    else ruleGaps.push({ page_result: pageResult, cause: "unbound_after_close" });
  }
  return { action: "closed", ask: null, mapping: null, usable, rule_gaps: ruleGaps };
}

export function planMockFieldInquiry({
  interface: requestInterface,
  responseJson = null,
  pageResults,
  existingMapping = null,
  userReply = null
}) {
  const identity = interfaceIdentity(requestInterface);
  if (existingMapping) return closedDecision({ existingMapping, pageResults, responseJson });
  const { determined, unknown } = determinedBindings(responseJson, pageResults);
  if (unknown.length === 0) {
    return {
      action: "record",
      ask: null,
      mapping: { interface: identity, bindings: determined, source: "observed", other_interface_results: [] },
      usable: determined,
      rule_gaps: []
    };
  }
  if (!userReply) {
    return {
      action: "ask",
      ask: { interface: identity, page_results: [...unknown] },
      mapping: null,
      usable: [],
      rule_gaps: []
    };
  }
  const other = new Set(userReply.other_interface_results ?? []);
  const declined = new Set([...(userReply.declined_page_results ?? []), ...(userReply.declined_all ? unknown : [])]);
  const userBindings = [];
  for (const binding of userReply.bindings ?? []) {
    if (other.has(binding.page_result) || !unknown.includes(binding.page_result)) continue;
    const found = readJsonPointer(responseJson, binding.response_pointer);
    if (!found.found) continue;
    userBindings.push({ page_result: binding.page_result, response_pointer: binding.response_pointer });
  }
  const userPointed = new Set(userBindings.map(item => item.page_result));
  const bindings = [
    ...determined.filter(item => !other.has(item.page_result)),
    ...userBindings
  ];
  const source = userBindings.length > 0 ? "user" : "observed";
  const ruleGaps = unknown.filter(result => !userPointed.has(result) && !other.has(result)).map(pageResult => ({
    page_result: pageResult,
    cause: declined.has(pageResult) ? "user_declined" : "user_omitted"
  }));
  return {
    action: "record",
    ask: null,
    mapping: {
      interface: identity,
      bindings,
      source,
      other_interface_results: [...other],
      ...(source === "user" ? { assistance_ref: userReply.assistance_ref } : {})
    },
    usable: bindings,
    rule_gaps: ruleGaps
  };
}

export function formatFieldQuestions(asks) {
  return asks.map((ask, index) => {
    const identity = interfaceIdentity(ask.interface);
    const lines = ask.page_results.map(result => `- ${result}`);
    return `（${index + 1}） 接口 ${identity.origin} ${identity.method} ${identity.pathname}\n请只指出下列页面结果来自这一接口响应的哪一个 JSON pointer。明确来自其他接口的结果请单独标明，不要写入这一接口：\n${lines.join("\n")}`;
  }).join("\n\n");
}

export function applyMappedResponse(responseJson, bindings, valuesByPageResult) {
  const body = structuredClone(responseJson);
  for (const [pageResult, writeValue] of Object.entries(valuesByPageResult)) {
    const binding = bindings.find(item => item.page_result === pageResult);
    if (!binding) continue;
    setJsonPointer(body, binding.response_pointer, writeValue ?? pageResult);
  }
  return body;
}

export function mockRuleGapFacts({ interface: requestInterface, pageResult, cause }) {
  const identity = interfaceIdentity(requestInterface);
  const userDidNotProvide = cause === "user_declined" || cause === "user_omitted";
  return {
    missing_fact: `接口 ${identity.origin} ${identity.method} ${identity.pathname} 的页面结果「${pageResult}」缺少字段对应关系`,
    known_facts: [
      "真实请求没有确定出唯一字段",
      userDidNotProvide ? "用户没有提供该字段" : "该页面结果不在已写入的字段对应关系里，且新的真实响应也不能确定唯一字段"
    ],
    cannot_continue_reason: "不能猜测字段，这一接口也不再第二次询问"
  };
}

export function singleInterfaceScenario({
  runId, caseId, attemptId, scenarioId, checkpointIds, interface: requestInterface, body, syntheticValues = []
}) {
  const identity = interfaceIdentity(requestInterface);
  return {
    schema_version: "mock-scenario-v1",
    scenario_id: scenarioId,
    revision: 1,
    run_id: runId,
    case_id: caseId,
    attempt_id: attemptId,
    candidate_checkpoint_ids: [...checkpointIds],
    supporting_checkpoint_ids: [],
    initial_state: {},
    routes: [{
      route_id: "case-interface",
      match: {
        origin: identity.origin,
        pathname: identity.pathname,
        method: identity.method,
        query: {},
        ignore_unlisted_query: true,
        body: { rules: [], allowed_extra_pointers: [] },
        ignore_unlisted_body: true
      },
      effect: [],
      response: { status: 200, headers: { "content-type": "application/json" }, body },
      provenance: { source_refs: ["observed-response"], synthetic_values: [...syntheticValues] }
    }],
    passthrough: [],
    provenance: { source_refs: ["observed-response"], synthetic_values: [...syntheticValues] }
  };
}
