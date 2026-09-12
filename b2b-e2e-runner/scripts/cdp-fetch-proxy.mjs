#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { writeJsonAtomic } from "./lib/atomic-json.mjs";
import { CdpClient, fetchCdpJson } from "./lib/cdp-client.mjs";
import { assertNoSecrets, sanitizeUrl } from "./lib/redaction.mjs";
import { TargetLock } from "./lib/target-lock.mjs";

export const BODY_LIMIT_BYTES = 5 * 1024 * 1024;

export class ProxyRuleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProxyRuleError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProxyRuleError(code, message);
}

function unsupported(value, keyPath = "$") {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    const current = `${keyPath}.${key}`;
    if (/^(?:callback|javascript|js|stream|sse|websocket|websocket_frames?|binary_stream)$/i.test(key)) {
      fail("UNSUPPORTED_TRAFFIC", `不支持的规则字段：${current}`);
    }
    unsupported(item, current);
  }
}

export function compileRules(rules) {
  if (!Array.isArray(rules)) fail("RULE_CONTRACT", "rules 必须是数组");
  const seen = new Set();
  return rules.filter(rule => rule.enabled !== false).map((rule, index) => {
    unsupported(rule);
    const match = rule?.match;
    if (!match || typeof match !== "object") fail("RULE_CONTRACT", `rules[${index}].match 缺失`);
    if (!/^(?:http|https):$/.test(match.protocol)) fail("RULE_CONTRACT", "protocol 必须是 http: 或 https:");
    if (typeof match.hostname !== "string" || !match.hostname) fail("RULE_CONTRACT", "hostname 必填");
    if (typeof match.path_prefix !== "string" || !match.path_prefix.startsWith("/")) fail("RULE_CONTRACT", "path_prefix 必须以 / 开头");
    if (match.methods !== undefined && (!Array.isArray(match.methods) || match.methods.length === 0)) {
      fail("RULE_CONTRACT", "methods 必须省略或使用非空数组");
    }
    const compiled = structuredClone(rule);
    compiled.match.hostname = compiled.match.hostname.toLowerCase();
    compiled.match.methods = compiled.match.methods === undefined
      ? null
      : [...new Set(compiled.match.methods.map(method => String(method).toUpperCase()))];
    const key = JSON.stringify([
      compiled.match.protocol,
      compiled.match.hostname,
      compiled.match.path_prefix,
      compiled.match.methods ? [...compiled.match.methods].sort() : "*"
    ]);
    if (seen.has(key)) fail("RULE_CONFLICT", `重复匹配规则：rules[${index}]`);
    seen.add(key);
    let body = compiled.response?.body;
    if (body?.mode !== undefined) {
      if (body.mode === "none") delete compiled.response.body;
      else if (body.mode === "replace_text") compiled.response.body = { text: body.text ?? body.value };
      else if (body.mode === "replace_base64") compiled.response.body = { base64: body.base64 ?? body.value };
      else if (body.mode === "json_patch") compiled.response.body = { json_patch: body.operations };
      else fail("RULE_CONTRACT", `不支持的 body.mode：${body.mode}`);
      body = compiled.response?.body;
    }
    if (body) {
      const modes = ["text", "base64", "json_patch"].filter(name => Object.hasOwn(body, name));
      if (modes.length !== 1) fail("RULE_CONTRACT", "响应 body 必须且只能指定 text、base64、json_patch 之一");
    }
    return compiled;
  });
}

function isLoopback(hostname) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname.toLowerCase());
}

export function validateProxyConfig(config) {
  if (!config || typeof config !== "object") fail("RULE_CONTRACT", "代理配置必须是对象");
  if (!["development", "test", "testing", "staging", "non-production"].includes(config.environment)) {
    fail("PRODUCTION_REJECTED", "代理只允许明确的非生产环境");
  }
  let endpoint;
  try { endpoint = new URL(config.endpoint); } catch { fail("RULE_CONTRACT", "CDP endpoint URL 无效"); }
  if (!isLoopback(endpoint.hostname)) fail("ENDPOINT_REJECTED", "V1 只连接本机 loopback CDP endpoint");
  const targetId = config.target_id ?? config.targetId;
  const runId = config.run_id ?? config.runId ?? "runner";
  const lockRoot = config.lock_root ?? config.lockRoot;
  if (typeof targetId !== "string" || !targetId) fail("RULE_CONTRACT", "target_id 必填");
  if (typeof lockRoot !== "string" || !path.isAbsolute(lockRoot)) fail("RULE_CONTRACT", "lock_root 必须是绝对路径");
  assertNoSecrets(config.rules);
  const rules = compileRules(config.rules);
  for (const rule of rules) {
    if (rule.match.protocol === "http:" && !isLoopback(rule.match.hostname) &&
      !(config.allow_insecure_non_loopback_http === true && config.insecure_http_confirmed_by_cases === true)) {
      fail("INSECURE_HTTP_REJECTED", "非 loopback 明文 HTTP 需要用例明确确认后双重显式放行");
    }
  }
  return { ...config, endpoint: endpoint.toString(), targetId, runId, lockRoot, rules };
}

export function matchRule(rule, requestUrl, method) {
  let url;
  try { url = new URL(requestUrl); } catch { return false; }
  return url.protocol === rule.match.protocol &&
    url.hostname.toLowerCase() === rule.match.hostname &&
    url.pathname.startsWith(rule.match.path_prefix) &&
    (rule.match.methods === null || rule.match.methods.includes(String(method).toUpperCase()));
}

export function applyHeaderOperations(headers = [], operations = {}) {
  const remove = new Set((operations?.remove ?? []).map(name => String(name).toLowerCase()));
  const replacements = new Map(Object.entries(operations?.set ?? {}).map(([name, value]) => [
    name.toLowerCase(), { name, value: String(value) }
  ]));
  const emitted = new Set();
  const output = [];
  for (const header of headers ?? []) {
    const lower = String(header.name).toLowerCase();
    if (remove.has(lower) || emitted.has(lower)) continue;
    output.push(replacements.get(lower) ?? { name: header.name, value: String(header.value) });
    emitted.add(lower);
  }
  for (const [lower, replacement] of replacements) {
    if (!remove.has(lower) && !emitted.has(lower)) output.push(replacement);
  }
  return output;
}

function pointerSegments(pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/") || pointer === "/") {
    fail("INVALID_JSON_POINTER", `仅支持非根 JSON Pointer：${pointer}`);
  }
  return pointer.slice(1).split("/").map(segment => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function applyJsonPatch(value, operations) {
  const copy = structuredClone(value);
  for (const operation of operations ?? []) {
    const segments = pointerSegments(operation.path);
    let parent = copy;
    for (const segment of segments.slice(0, -1)) {
      if (!parent || typeof parent !== "object" || !(segment in parent)) fail("JSON_POINTER_NOT_FOUND", operation.path);
      parent = parent[segment];
    }
    const key = segments.at(-1);
    if (!parent || typeof parent !== "object") fail("JSON_POINTER_NOT_FOUND", operation.path);
    if (operation.op === "set") parent[key] = structuredClone(operation.value);
    else if (operation.op === "delete") {
      if (Array.isArray(parent)) {
        if (!/^\d+$/.test(key) || Number(key) >= parent.length) fail("JSON_POINTER_NOT_FOUND", operation.path);
        parent.splice(Number(key), 1);
      } else delete parent[key];
    } else fail("UNSUPPORTED_JSON_OPERATION", `不支持 ${operation.op}`);
  }
  return copy;
}

export function applyResponseRule(response, rule = {}) {
  const original = Buffer.isBuffer(response.body) ? response.body : Buffer.from(response.body ?? "");
  if (original.length > BODY_LIMIT_BYTES) fail("BODY_TOO_LARGE", "响应体超过 5 MiB 修改上限");
  let body = Buffer.from(original);
  if (rule.body?.text !== undefined) body = Buffer.from(String(rule.body.text), "utf8");
  else if (rule.body?.base64 !== undefined) {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(rule.body.base64)) {
      fail("INVALID_BASE64", "响应 body.base64 无效");
    }
    body = Buffer.from(rule.body.base64, "base64");
  } else if (rule.body?.json_patch !== undefined) {
    let parsed;
    try { parsed = JSON.parse(original.toString("utf8")); } catch { fail("INVALID_JSON", "响应体不是有效 JSON"); }
    body = Buffer.from(JSON.stringify(applyJsonPatch(parsed, rule.body.json_patch)), "utf8");
  }
  if (body.length > BODY_LIMIT_BYTES) fail("BODY_TOO_LARGE", "改写后的响应体超过 5 MiB 上限");
  let headers = applyHeaderOperations(response.headers, rule.headers);
  if (rule.body) headers = applyHeaderOperations(headers, { remove: ["content-length", "content-encoding"] });
  return { status: rule.status ?? response.status, headers, body };
}

function objectHeaders(headers = {}) {
  return Object.entries(headers).map(([name, value]) => ({ name, value: String(value) }));
}

export class ProxyListener {
  constructor({
    endpoint,
    browserWebSocketUrl,
    targetId,
    rules,
    lockRoot,
    runId = "runner",
    statusPath,
    clientFactory = CdpClient.connect,
    diagnostic = () => {}
  }) {
    this.endpoint = endpoint;
    this.browserWebSocketUrl = browserWebSocketUrl;
    this.targetId = targetId;
    this.rules = rules;
    this.statusPath = statusPath;
    this.clientFactory = clientFactory;
    this.diagnostic = diagnostic;
    this.lock = new TargetLock({ root: lockRoot, endpoint, targetId, runId });
    this.client = null;
    this.sessionId = null;
    this.unsubscribers = [];
    this.started = false;
    this.state = "configured";
    this.stopping = null;
    this.counts = { requestMatched: 0, responseMatched: 0, continued: 0, fulfilled: 0, ruleErrors: 0 };
    this.recentErrors = [];
  }

  status() {
    return {
      schema_version: "1.0",
      runId: this.lock.runId,
      endpoint: this.endpoint,
      targetId: this.targetId,
      pid: process.pid,
      session: this.sessionId ? "attached" : "detached",
      ownerToken: this.lock.ownerToken,
      lockRoot: this.lock.root,
      state: this.state,
      counts: { ...this.counts },
      recentErrors: [...this.recentErrors]
    };
  }

  async start() {
    if (this.started) return this.status();
    await this.lock.acquire();
    this.state = "target_locked";
    await this.#persist();
    try {
      this.client = await this.clientFactory(this.browserWebSocketUrl);
      const attached = await this.client.command("Target.attachToTarget", { targetId: this.targetId, flatten: true });
      this.sessionId = attached.sessionId;
      this.state = "attached";
      await this.#persist();
      await this.client.command("Network.enable", {}, this.sessionId);
      const patterns = this.rules.flatMap(rule => ["Request", "Response"].map(requestStage => ({
        urlPattern: `${rule.match.protocol}//${rule.match.hostname}*${rule.match.path_prefix}*`,
        requestStage
      })));
      await this.client.command("Fetch.enable", {
        patterns
      }, this.sessionId);
      this.state = "fetch_enabled";
      this.unsubscribers.push(this.client.on(this.sessionId, "Fetch.requestPaused", event => this.#handlePaused(event)));
      this.unsubscribers.push(this.client.on("", "Target.detachedFromTarget", event => {
        if (event.sessionId === this.sessionId || event.targetId === this.targetId) this.stop().catch(() => {});
      }));
      this.unsubscribers.push(this.client.on(this.sessionId, "Inspector.detached", () => this.stop().catch(() => {})));
      this.unsubscribers.push(this.client.on("", "__transport_closed__", event => {
        this.#recordError("CDP_DISCONNECTED", event.reason ?? "CDP transport closed");
        this.stop().catch(() => {});
      }));
      this.started = true;
      this.state = "active";
      await this.#persist();
      return this.status();
    } catch (error) {
      this.#recordError(error.code ?? "PROXY_START_FAILED", error.message);
      this.state = "degraded";
      if (this.client && this.sessionId) {
        await this.client.command("Fetch.disable", {}, this.sessionId).catch(() => {});
        await this.client.command("Target.detachFromTarget", { sessionId: this.sessionId }).catch(() => {});
      }
      for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
      this.client?.close();
      this.client = null;
      this.sessionId = null;
      this.started = false;
      await this.lock.release().catch(() => {});
      await this.#persist().catch(() => {});
      throw error;
    }
  }

  async stop() {
    if (this.stopping) return this.stopping;
    this.stopping = this.#stop();
    try { return await this.stopping; } finally { this.stopping = null; }
  }

  async #stop() {
    this.state = "stopping";
    await this.#persist().catch(() => {});
    if (this.client && this.sessionId) {
      await this.client.command("Fetch.disable", {}, this.sessionId).catch(() => {});
      this.state = "fetch_disabled";
      await this.client.command("Target.detachFromTarget", { sessionId: this.sessionId }).catch(() => {});
      this.state = "detached";
    }
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
    this.client?.close();
    this.client = null;
    this.sessionId = null;
    this.started = false;
    await this.lock.release().catch(error => {
      if (error.code !== "ENOENT") throw error;
    });
    this.state = "lock_released";
    this.state = "stopped";
    await this.#persist();
    return this.status();
  }

  async #handlePaused(event) {
    const responseStage = event.responseStatusCode !== undefined;
    const rule = this.rules.find(item => matchRule(item, event.request.url, event.request.method));
    try {
      if (!rule) {
        this.counts.continued += 1;
        await this.client.command(responseStage ? "Fetch.continueResponse" : "Fetch.continueRequest", { requestId: event.requestId }, this.sessionId);
      } else if (responseStage) await this.#handleResponse(event, rule);
      else await this.#handleRequest(event, rule);
    } catch (error) {
      this.counts.ruleErrors += 1;
      this.#recordError(error.code ?? "PROXY_ERROR", error.message);
      this.diagnostic({
        event: "rule-error",
        code: error.code ?? "PROXY_ERROR",
        message: error.message,
        url: sanitizeUrl(event.request.url),
        stage: responseStage ? "response" : "request"
      });
      await this.client.command(responseStage ? "Fetch.continueResponse" : "Fetch.continueRequest", { requestId: event.requestId }, this.sessionId).catch(() => {});
    } finally {
      await this.#persist().catch(() => {});
    }
  }

  async #handleRequest(event, rule) {
    const headers = applyHeaderOperations(objectHeaders(event.request.headers), rule.request?.headers);
    const params = { requestId: event.requestId };
    if (rule.request?.headers) params.headers = headers;
    await this.client.command("Fetch.continueRequest", params, this.sessionId);
    this.counts.requestMatched += 1;
  }

  async #handleResponse(event, rule) {
    if (!rule.response) {
      await this.client.command("Fetch.continueResponse", { requestId: event.requestId }, this.sessionId);
      this.counts.continued += 1;
      return;
    }
    const contentType = (event.responseHeaders ?? []).find(header => header.name.toLowerCase() === "content-type")?.value ?? "";
    if (/text\/event-stream/i.test(contentType)) fail("UNSUPPORTED_TRAFFIC", "SSE 响应不支持改写");
    let originalBody = Buffer.alloc(0);
    if (rule.response.body) {
      const received = await this.client.command("Fetch.getResponseBody", { requestId: event.requestId }, this.sessionId);
      originalBody = Buffer.from(received.body, received.base64Encoded ? "base64" : "utf8");
    }
    const rewritten = applyResponseRule({
      status: event.responseStatusCode,
      headers: event.responseHeaders ?? [],
      body: originalBody
    }, rule.response);
    const params = {
      requestId: event.requestId,
      responseCode: rewritten.status,
      responseHeaders: rewritten.headers
    };
    if (rule.response.body) params.body = rewritten.body.toString("base64");
    await this.client.command("Fetch.fulfillRequest", params, this.sessionId);
    this.counts.responseMatched += 1;
    this.counts.fulfilled += 1;
  }

  async #persist() {
    if (this.statusPath) await writeJsonAtomic(this.statusPath, { ...this.status(), updatedAt: new Date().toISOString() });
  }

  #recordError(code, message) {
    this.recentErrors.push({ code, message, at: new Date().toISOString() });
    if (this.recentErrors.length > 10) this.recentErrors.shift();
  }
}

export async function createProxyListener(config) {
  const validated = validateProxyConfig(config);
  const endpoint = validated.endpoint;
  const [version, targets] = await Promise.all([
    fetchCdpJson(endpoint, "/json/version"),
    fetchCdpJson(endpoint, "/json/list")
  ]);
  const target = targets.find(item => item.id === validated.targetId && item.type === "page");
  if (!target) fail("TARGET_NOT_FOUND", `endpoint 上不存在页面 Target：${validated.targetId}`);
  return new ProxyListener({
    ...validated,
    endpoint,
    browserWebSocketUrl: version.webSocketDebuggerUrl,
    rules: validated.rules
  });
}

export async function stopProxyFromState(statePath, {
  signal = process.kill,
  wait = true,
  timeoutMs = 5_000
} = {}) {
  const state = JSON.parse(await readFile(statePath, "utf8"));
  if (state.state === "stopped") return { stopped: true, alreadyStopped: true, targetId: state.targetId };
  if (!state.endpoint || !state.targetId || !state.lockRoot || !Number.isSafeInteger(state.pid) || !state.ownerToken) {
    fail("STATE_CONTRACT", "代理 state 缺少所有权字段");
  }
  const candidate = new TargetLock({
    root: state.lockRoot,
    endpoint: state.endpoint,
    targetId: state.targetId,
    pid: state.pid,
    ownerToken: state.ownerToken
  });
  const owner = JSON.parse(await readFile(candidate.ownerFile, "utf8"));
  if (owner.pid !== state.pid || owner.ownerToken !== state.ownerToken || owner.runId !== state.runId) {
    fail("LOCK_OWNER_MISMATCH", "state 文件与 Target 锁所有者不一致");
  }
  signal(state.pid, "SIGTERM");
  if (wait) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
      const current = JSON.parse(await readFile(statePath, "utf8")).state;
      if (current === "stopped") return { stopped: true, targetId: state.targetId };
    }
    fail("STOP_TIMEOUT", "代理进程未在期限内确认停止");
  }
  return { stopped: true, signaled: true, targetId: state.targetId };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = name => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  if (command === "status") {
    const status = JSON.parse(await readFile(option("state"), "utf8"));
    process.stdout.write(JSON.stringify({ ok: true, ...status }) + "\n");
    return;
  }
  if (command === "stop") {
    const stopped = await stopProxyFromState(option("state"));
    process.stdout.write(JSON.stringify({ ok: true, ...stopped }) + "\n");
    return;
  }
  if (command !== "start") fail("INPUT_CONTRACT", "命令必须是 start、status 或 stop");
  const config = JSON.parse(await readFile(option("config"), "utf8"));
  config.endpoint = option("endpoint");
  config.statusPath = option("state");
  const listener = await createProxyListener(config);
  await listener.start();
  process.stdout.write(JSON.stringify({ ok: true, ...listener.status() }) + "\n");
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await listener.stop();
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stdout.write(JSON.stringify({ ok: false, error: { code: error.code ?? "PROXY_ERROR", message: error.message } }) + "\n");
    process.exitCode = error.code === "INPUT_CONTRACT" ? 2 : 1;
  });
}
