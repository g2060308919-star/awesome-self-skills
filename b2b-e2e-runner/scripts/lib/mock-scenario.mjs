import crypto from "node:crypto";

export const MOCK_BODY_LIMIT_BYTES = 5 * 1024 * 1024;

export class MockScenarioError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "MockScenarioError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new MockScenarioError(code, message);
}

function requireValue(condition, message) {
  if (!condition) fail("MOCK_SCENARIO_CONTRACT", message);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function rejectUnknown(value, allowed, label) {
  requireValue(object(value), `${label} 必须是对象`);
  const unknown = Object.keys(value).find(key => !allowed.has(key));
  requireValue(!unknown, `${label} 包含未知字段：${unknown}`);
}

function strings(value, label, { empty = false } = {}) {
  requireValue(Array.isArray(value) && (empty || value.length > 0), `${label} 必须是${empty ? "" : "非空"}字符串数组`);
  requireValue(value.every(nonEmpty) && new Set(value).size === value.length, `${label} 包含空值、非字符串或重复值`);
}

function assertJson(value, label) {
  try {
    const encoded = JSON.stringify(value);
    requireValue(encoded !== undefined, `${label} 不是 JSON 值`);
    JSON.parse(encoded);
  } catch (error) {
    if (error instanceof MockScenarioError) throw error;
    fail("MOCK_SCENARIO_CONTRACT", `${label} 不是可复制 JSON`);
  }
}

function scanUnsupported(value, label = "$", seen = new Set()) {
  if (!value || typeof value !== "object") return;
  if (seen.has(value)) fail("MOCK_SCENARIO_CONTRACT", `${label} 不得包含循环引用`);
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:callback|function|javascript|eval|script|stream|sse|websocket|binary)$/i.test(key)) {
      fail("MOCK_SCENARIO_CONTRACT", `${label}.${key} 是不支持的可执行或流式字段`);
    }
    scanUnsupported(child, `${label}.${key}`, seen);
  }
  seen.delete(value);
}

function pointerSegments(pointer) {
  requireValue(typeof pointer === "string" && pointer.startsWith("/") && pointer !== "/", `JSON Pointer 无效：${pointer}`);
  const segments = pointer.slice(1).split("/").map(segment => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
  requireValue(segments.every(segment => segment && !["__proto__", "prototype", "constructor"].includes(segment)),
    `JSON Pointer 包含危险或空路径：${pointer}`);
  return segments;
}

function pointerRead(value, pointer) {
  let current = value;
  for (const segment of pointerSegments(pointer)) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) return { found: false, value: undefined };
    current = current[segment];
  }
  return { found: true, value: current };
}

function pointerParent(value, pointer) {
  const segments = pointerSegments(pointer);
  let parent = value;
  for (const segment of segments.slice(0, -1)) {
    if (!parent || typeof parent !== "object" || !Object.hasOwn(parent, segment)) {
      fail("MOCK_STATE_PATH", `状态路径不存在：${pointer}`);
    }
    parent = parent[segment];
  }
  if (!parent || typeof parent !== "object") fail("MOCK_STATE_PATH", `状态路径父级不是对象：${pointer}`);
  const key = segments.at(-1);
  if (Array.isArray(parent)) {
    if (!/^\d+$/.test(key) || Number(key) >= parent.length) fail("MOCK_STATE_PATH", `数组路径越界：${pointer}`);
  }
  return { parent, key };
}

function normalizeOrigin(value, label) {
  let parsed;
  try { parsed = new URL(value); } catch { fail("MOCK_SCENARIO_CONTRACT", `${label} 不是合法 origin`); }
  requireValue(["http:", "https:"].includes(parsed.protocol) && parsed.pathname === "/" && !parsed.search && !parsed.hash && !parsed.username && !parsed.password,
    `${label} 必须是无认证信息、无路径的 HTTP(S) origin`);
  return parsed.origin;
}

function validateBodyMatcher(value, label) {
  rejectUnknown(value, new Set(["rules", "allowed_extra_pointers"]), label);
  requireValue(Array.isArray(value.rules), `${label}.rules 必须是数组`);
  strings(value.allowed_extra_pointers, `${label}.allowed_extra_pointers`, { empty: true });
  const pointers = new Set();
  for (const [index, rule] of value.rules.entries()) {
    const ruleLabel = `${label}.rules[${index}]`;
    rejectUnknown(rule, new Set(["pointer", "presence", "type", "value"]), ruleLabel);
    pointerSegments(rule.pointer);
    requireValue(!pointers.has(rule.pointer), `${label} 包含重复 pointer：${rule.pointer}`);
    pointers.add(rule.pointer);
    requireValue(["required", "absent"].includes(rule.presence), `${ruleLabel}.presence 无效`);
    if (rule.presence === "required") {
      requireValue(["string", "number", "boolean", "object", "array", "null"].includes(rule.type), `${ruleLabel}.type 无效`);
      if (Object.hasOwn(rule, "value")) assertJson(rule.value, `${ruleLabel}.value`);
    } else {
      requireValue(rule.type === undefined && !Object.hasOwn(rule, "value"), `${ruleLabel} absent 不得指定 type/value`);
    }
  }
  for (const pointer of value.allowed_extra_pointers) pointerSegments(pointer);
}

function compileMatch(value, label) {
  rejectUnknown(value, new Set(["origin", "pathname", "method", "query", "ignored_query_keys", "body"]), label);
  const compiled = structuredClone(value);
  compiled.origin = normalizeOrigin(value.origin, `${label}.origin`);
  requireValue(nonEmpty(value.pathname) && value.pathname.startsWith("/"), `${label}.pathname 必须是绝对路径`);
  requireValue(!value.pathname.includes("?") && !value.pathname.includes("#"), `${label}.pathname 不得含 query/hash`);
  requireValue(nonEmpty(value.method), `${label}.method 必填`);
  compiled.method = value.method.toUpperCase();
  requireValue(object(value.query), `${label}.query 必须是对象`);
  for (const [key, values] of Object.entries(value.query)) {
    requireValue(nonEmpty(key) && Array.isArray(values) && values.every(item => typeof item === "string"), `${label}.query.${key} 必须是字符串数组`);
  }
  strings(value.ignored_query_keys ?? [], `${label}.ignored_query_keys`, { empty: true });
  compiled.ignored_query_keys = [...(value.ignored_query_keys ?? [])];
  validateBodyMatcher(value.body, `${label}.body`);
  return compiled;
}

function validateProvenance(value, label) {
  rejectUnknown(value, new Set(["source_refs", "synthetic_values"]), label);
  strings(value.source_refs, `${label}.source_refs`);
  strings(value.synthetic_values, `${label}.synthetic_values`, { empty: true });
}

function validateEffect(effect, label) {
  requireValue(Array.isArray(effect), `${label} 必须是数组`);
  for (const [index, operation] of effect.entries()) {
    const operationLabel = `${label}[${index}]`;
    rejectUnknown(operation, new Set(["op", "path", "value"]), operationLabel);
    requireValue(["set", "delete"].includes(operation.op), `${operationLabel}.op 无效`);
    pointerSegments(operation.path);
    if (operation.op === "set") {
      requireValue(Object.hasOwn(operation, "value"), `${operationLabel}.set 缺少 value`);
      assertJson(operation.value, `${operationLabel}.value`);
    } else requireValue(!Object.hasOwn(operation, "value"), `${operationLabel}.delete 不得包含 value`);
  }
}

function validateResponse(response, label) {
  rejectUnknown(response, new Set(["status", "headers", "body"]), label);
  requireValue(Number.isInteger(response.status) && response.status >= 100 && response.status <= 599, `${label}.status 无效`);
  requireValue(object(response.headers), `${label}.headers 必须是对象`);
  for (const [name, value] of Object.entries(response.headers)) {
    requireValue(nonEmpty(name) && typeof value === "string", `${label}.headers 必须为字符串键值`);
    requireValue(!/^(?:content-length|content-encoding)$/i.test(name), `${label}.headers 不得写入失效长度或编码`);
  }
  assertJson(response.body, `${label}.body`);
}

export function compileMockScenario(scenario) {
  scanUnsupported(scenario);
  rejectUnknown(scenario, new Set([
    "schema_version", "scenario_id", "revision", "run_id", "case_id", "attempt_id",
    "candidate_checkpoint_ids", "supporting_checkpoint_ids", "initial_state", "routes", "passthrough", "provenance"
  ]), "mock_scenario");
  requireValue(scenario.schema_version === "mock-scenario-v1", "mock_scenario.schema_version 无效");
  for (const key of ["scenario_id", "run_id", "case_id", "attempt_id"]) requireValue(nonEmpty(scenario[key]), `mock_scenario.${key} 必填`);
  requireValue(Number.isInteger(scenario.revision) && scenario.revision > 0, "mock_scenario.revision 必须为正整数");
  strings(scenario.candidate_checkpoint_ids, "mock_scenario.candidate_checkpoint_ids");
  strings(scenario.supporting_checkpoint_ids, "mock_scenario.supporting_checkpoint_ids", { empty: true });
  requireValue(object(scenario.initial_state), "mock_scenario.initial_state 必须是 JSON 对象");
  assertJson(scenario.initial_state, "mock_scenario.initial_state");
  requireValue(Array.isArray(scenario.routes) && scenario.routes.length > 0, "mock_scenario.routes 必须是非空数组");
  const routeIds = new Set();
  const routes = scenario.routes.map((route, index) => {
    const label = `mock_scenario.routes[${index}]`;
    rejectUnknown(route, new Set(["route_id", "match", "effect", "response", "provenance"]), label);
    requireValue(nonEmpty(route.route_id) && !routeIds.has(route.route_id), `${label}.route_id 缺失或重复`);
    routeIds.add(route.route_id);
    validateEffect(route.effect, `${label}.effect`);
    validateResponse(route.response, `${label}.response`);
    validateProvenance(route.provenance, `${label}.provenance`);
    return { ...structuredClone(route), match: compileMatch(route.match, `${label}.match`) };
  });
  requireValue(Array.isArray(scenario.passthrough), "mock_scenario.passthrough 必须是数组");
  const passthroughIds = new Set();
  const passthrough = scenario.passthrough.map((item, index) => {
    const label = `mock_scenario.passthrough[${index}]`;
    rejectUnknown(item, new Set(["passthrough_id", "match", "basis_refs"]), label);
    requireValue(nonEmpty(item.passthrough_id) && !passthroughIds.has(item.passthrough_id), `${label}.passthrough_id 缺失或重复`);
    passthroughIds.add(item.passthrough_id);
    strings(item.basis_refs, `${label}.basis_refs`);
    return { ...structuredClone(item), match: compileMatch(item.match, `${label}.match`) };
  });
  validateProvenance(scenario.provenance, "mock_scenario.provenance");
  return { ...structuredClone(scenario), routes, passthrough };
}

function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  if (object(left) && object(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && deepEqual(left[key], right[key]));
  }
  return false;
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return object(value);
  return typeof value === type;
}

function leafPointers(value, prefix = "") {
  if (Array.isArray(value)) return value.flatMap((item, index) => leafPointers(item, `${prefix}/${index}`));
  if (object(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) return [];
    return keys.flatMap(key => leafPointers(value[key], `${prefix}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`));
  }
  return [prefix || "/"];
}

function parseBody(request) {
  if (request.body === undefined || request.body === "") return {};
  const bytes = Buffer.byteLength(request.body);
  if (bytes > MOCK_BODY_LIMIT_BYTES) fail("MOCK_REQUEST_BLOCKED", "请求体超过 5 MiB Mock 上限");
  const header = Object.entries(request.headers ?? {}).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";
  if (!/application\/(?:[^;]+\+)?json/i.test(String(header))) fail("MOCK_REQUEST_BLOCKED", "Mock 只解析已知 JSON 请求体编码");
  try { return JSON.parse(request.body); }
  catch { fail("MOCK_REQUEST_BLOCKED", "请求体不是合法 JSON"); }
}

function queryValues(url) {
  const result = {};
  for (const key of new Set(url.searchParams.keys())) result[key] = url.searchParams.getAll(key);
  return result;
}

function containsSyntheticValue(request, normalizedBody, syntheticValues) {
  const url = String(request.url ?? "");
  let decodedUrl = url;
  try { decodedUrl = decodeURIComponent(url); } catch { /* malformed escaping is still checked in its raw form */ }
  const haystacks = [
    url,
    decodedUrl,
    JSON.stringify(request.headers ?? {}),
    JSON.stringify(normalizedBody)
  ];
  return syntheticValues.some(value => haystacks.some(item => item.includes(value)));
}

function matchRequest(match, request, normalizedBody) {
  let url;
  try { url = new URL(request.url); } catch { return false; }
  if (url.origin !== match.origin || url.pathname !== match.pathname || String(request.method).toUpperCase() !== match.method) return false;
  const ignored = new Set(match.ignored_query_keys);
  const actualQuery = queryValues(url);
  const actualKeys = Object.keys(actualQuery).filter(key => !ignored.has(key)).sort();
  const expectedKeys = Object.keys(match.query).sort();
  if (!deepEqual(actualKeys, expectedKeys)) return false;
  for (const key of expectedKeys) if (!deepEqual(actualQuery[key], match.query[key])) return false;
  const declared = new Set(match.body.rules.map(rule => rule.pointer));
  const allowed = new Set(match.body.allowed_extra_pointers);
  for (const rule of match.body.rules) {
    const found = pointerRead(normalizedBody, rule.pointer);
    if (rule.presence === "absent") {
      if (found.found) return false;
      continue;
    }
    if (!found.found || !typeMatches(found.value, rule.type)) return false;
    if (Object.hasOwn(rule, "value") && !deepEqual(found.value, rule.value)) return false;
  }
  const extras = leafPointers(normalizedBody).filter(pointer => !declared.has(pointer) && !allowed.has(pointer));
  return extras.length === 0;
}

function renderTemplate(value, state, requestBody) {
  if (Array.isArray(value)) return value.map(item => renderTemplate(item, state, requestBody));
  if (!object(value)) return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === "$literal") return structuredClone(value.$literal);
  if (keys.length === 1 && ["$state", "$request"].includes(keys[0])) {
    const source = keys[0] === "$state" ? state : requestBody;
    const resolved = pointerRead(source, value[keys[0]]);
    if (!resolved.found) fail("MOCK_TEMPLATE_MISSING", `模板引用不存在：${value[keys[0]]}`);
    return structuredClone(resolved.value);
  }
  if (keys.some(key => ["$state", "$request", "$literal"].includes(key))) {
    fail("MOCK_SCENARIO_CONTRACT", "模板对象必须只包含一个保留键");
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderTemplate(item, state, requestBody)]));
}

function applyEffects(state, effects, requestView) {
  for (const operation of effects) {
    const { parent, key } = pointerParent(state, operation.path);
    if (operation.op === "set") parent[key] = renderTemplate(operation.value, state, requestView);
    else if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
  }
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildResponse(route, state, requestView) {
  const bodyValue = renderTemplate(route.response.body, state, requestView);
  const declaredContentType = Object.entries(route.response.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "";
  const textResponse = /^text\//i.test(declaredContentType);
  if (textResponse) requireValue(typeof bodyValue === "string", "text/* Mock 响应体必须是字符串");
  const body = textResponse ? bodyValue : JSON.stringify(bodyValue);
  if (Buffer.byteLength(body) > MOCK_BODY_LIMIT_BYTES) fail("MOCK_BODY_TOO_LARGE", "Mock 响应超过 5 MiB 上限");
  const headers = Object.fromEntries(Object.entries(route.response.headers).filter(([name]) => !/^(?:content-length|content-encoding)$/i.test(name)));
  if (!Object.keys(headers).some(name => name.toLowerCase() === "content-type")) headers["content-type"] = "application/json; charset=utf-8";
  return { status: route.response.status, headers, body };
}

export class MockScenarioEngine {
  constructor(scenario, { runtimeState = null, persist = async () => {} } = {}) {
    this.scenario = compileMockScenario(scenario);
    this.persist = persist;
    this.state = structuredClone(runtimeState?.state ?? this.scenario.initial_state);
    this.stateVersion = runtimeState?.state_version ?? 0;
    this.receipts = new Map();
    this.usedRoutes = new Set();
    if (runtimeState) {
      requireValue(runtimeState.schema_version === "mock-runtime-v1", "Mock 状态 schema_version 无效");
      requireValue(runtimeState.scenario_id === this.scenario.scenario_id && runtimeState.attempt_id === this.scenario.attempt_id &&
        runtimeState.revision === this.scenario.revision, "Mock 状态与场景归属或修订不一致");
      requireValue(Number.isInteger(runtimeState.state_version) && runtimeState.state_version >= 0 &&
        runtimeState.state_hash === digest(runtimeState.state), "Mock 状态版本或哈希无效");
      requireValue(Array.isArray(runtimeState.processed_requests), "Mock 状态缺少已处理请求记录");
      for (const item of runtimeState.processed_requests) {
        requireValue(nonEmpty(item?.key) && object(item.receipt) && nonEmpty(item.receipt.route_id), "Mock 状态包含无效请求回执");
        this.receipts.set(item.key, structuredClone(item.receipt));
        this.usedRoutes.add(item.receipt.route_id);
      }
    }
    this.queue = Promise.resolve();
    this.active = 0;
  }

  handle(request, identity) {
    const operation = this.queue.then(() => this.#handle(request, identity));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async #handle(request, identity) {
    requireValue(nonEmpty(identity?.proxy_cycle_id) && nonEmpty(identity?.request_id), "请求缺少 proxy_cycle_id 或 request_id");
    const key = `${this.scenario.attempt_id}\u0000${identity.proxy_cycle_id}\u0000${identity.request_id}`;
    if (this.receipts.has(key)) return structuredClone(this.receipts.get(key));
    this.active += 1;
    try {
      const body = parseBody(request);
      const matches = this.scenario.routes.filter(route => matchRequest(route.match, request, body));
      if (matches.length > 1) fail("MOCK_RULE_CONFLICT", "同一请求匹配多个 Mock route，拒绝按顺序猜测");
      if (matches.length === 0) {
        const safe = this.scenario.passthrough.filter(item => matchRequest(item.match, request, body));
        if (safe.length > 1) fail("MOCK_RULE_CONFLICT", "同一请求匹配多个安全透传条件");
        if (safe.length === 1) {
          const syntheticValues = [...new Set([
            ...this.scenario.provenance.synthetic_values,
            ...this.scenario.routes.flatMap(route => route.provenance.synthetic_values)
          ])];
          if (containsSyntheticValue(request, body, syntheticValues)) {
            fail("MOCK_REQUEST_BLOCKED", "安全透传请求携带合成业务值，已阻止真实上游访问");
          }
          return { disposition: "passthrough", passthrough_id: safe[0].passthrough_id };
        }
        fail("MOCK_REQUEST_BLOCKED", "未知业务请求未获明确安全透传依据，已阻止真实上游访问");
      }
      const route = matches[0];
      const before = structuredClone(this.state);
      const tentative = structuredClone(this.state);
      const requestView = { url: request.url, method: String(request.method).toUpperCase(), headers: structuredClone(request.headers ?? {}), body };
      applyEffects(tentative, route.effect, requestView);
      const response = buildResponse(route, tentative, requestView);
      const nextVersion = this.stateVersion + 1;
      const receipt = {
        disposition: "mocked",
        route_id: route.route_id,
        receipt_id: digest({ key, route: route.route_id }),
        transaction_id: digest({ key, version: nextVersion }),
        state_before_hash: digest(before),
        state_after_hash: digest(tentative),
        state_version: nextVersion,
        response
      };
      const nextReceipts = new Map(this.receipts);
      nextReceipts.set(key, structuredClone(receipt));
      const runtime = this.#runtimeState(tentative, nextVersion, nextReceipts);
      await this.persist({ runtime: structuredClone(runtime), receipt: structuredClone(receipt) });
      this.state = tentative;
      this.stateVersion = nextVersion;
      this.usedRoutes.add(route.route_id);
      this.receipts = nextReceipts;
      return receipt;
    } finally {
      this.active -= 1;
    }
  }

  snapshot() {
    return {
      scenario_id: this.scenario.scenario_id,
      revision: this.scenario.revision,
      attempt_id: this.scenario.attempt_id,
      state: structuredClone(this.state),
      state_version: this.stateVersion,
      state_hash: digest(this.state)
    };
  }

  runtimeState() {
    return this.#runtimeState(this.state, this.stateVersion, this.receipts);
  }

  #runtimeState(state, stateVersion, receipts) {
    return {
      schema_version: "mock-runtime-v1",
      scenario_id: this.scenario.scenario_id,
      revision: this.scenario.revision,
      attempt_id: this.scenario.attempt_id,
      state: structuredClone(state),
      state_version: stateVersion,
      state_hash: digest(state),
      processed_requests: [...receipts].map(([key, receipt]) => ({ key, receipt: structuredClone(receipt) }))
    };
  }

  requestPatterns() {
    const seen = new Set();
    return [...this.scenario.routes, ...this.scenario.passthrough].flatMap(item => {
      const pattern = `${item.match.origin}${item.match.pathname}*`;
      if (seen.has(pattern)) return [];
      seen.add(pattern);
      return [{ urlPattern: pattern, requestStage: "Request" }];
    });
  }

  updateScenario(scenario) {
    const next = compileMockScenario(scenario);
    if (this.active > 0) fail("MOCK_REVISION_CONFLICT", "事务执行中不能更新 Mock 场景");
    if (next.run_id !== this.scenario.run_id || next.case_id !== this.scenario.case_id || next.attempt_id !== this.scenario.attempt_id ||
        next.revision !== this.scenario.revision + 1) {
      fail("MOCK_REVISION_CONFLICT", "Mock 场景修订必须保持 Run/用例/尝试并连续递增");
    }
    const previous = new Map(this.scenario.routes.map(route => [route.route_id, route]));
    const incoming = new Map(next.routes.map(route => [route.route_id, route]));
    for (const routeId of this.usedRoutes) {
      if (!incoming.has(routeId) || !deepEqual(previous.get(routeId), incoming.get(routeId))) {
        fail("MOCK_REVISION_CONFLICT", `已执行 route ${routeId} 的语义不得在同一尝试中修改`);
      }
    }
    this.scenario = next;
    return this.snapshot();
  }
}
