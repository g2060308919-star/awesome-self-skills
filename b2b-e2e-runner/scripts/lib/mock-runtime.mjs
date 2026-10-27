import crypto from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./atomic-json.mjs";
import { deriveMockState } from "./mock-fallback.mjs";
import { compileMockScenario, MockScenarioEngine } from "./mock-scenario.mjs";
import { assertNoSecrets } from "./redaction.mjs";
import { assertCurrentWorkflow } from "./workflow-contract.mjs";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function string(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function digest(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeRelative(value, label) {
  if (!string(value) || path.isAbsolute(value) || value.includes("\\")) fail("MOCK_BINDING", `${label} 必须是 Run 内相对路径`);
  const normalized = path.posix.normalize(value);
  if (normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) fail("MOCK_BINDING", `${label} 不得越出 Run 目录`);
  return normalized;
}

function inside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function resolveExistingFile(runRoot, relative, label) {
  const candidate = path.resolve(runRoot, safeRelative(relative, label));
  if (!inside(runRoot, candidate)) fail("MOCK_BINDING", `${label} 越出 Run 目录`);
  const stats = await lstat(candidate).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  if (!stats?.isFile() || stats.isSymbolicLink()) fail("MOCK_BINDING", `${label} 必须是 Run 内普通文件`);
  const resolved = await realpath(candidate);
  if (!inside(await realpath(runRoot), resolved)) fail("MOCK_BINDING", `${label} 的真实路径越出 Run 目录`);
  return candidate;
}

async function resolveOutputFile(runRoot, relative, label) {
  const candidate = path.resolve(runRoot, safeRelative(relative, label));
  if (!inside(runRoot, candidate)) fail("MOCK_BINDING", `${label} 越出 Run 目录`);
  const parent = await realpath(path.dirname(candidate));
  if (!inside(await realpath(runRoot), parent)) fail("MOCK_BINDING", `${label} 的父目录越出 Run 目录`);
  const stats = await lstat(candidate).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  if (stats && (!stats.isFile() || stats.isSymbolicLink())) fail("MOCK_BINDING", `${label} 已存在但不是普通文件`);
  return candidate;
}

function validateReference(reference) {
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) fail("MOCK_BINDING", "mock_scenario 引用必须是对象");
  const allowed = new Set(["path", "sha256", "attempt_id", "state_path", "receipts_path"]);
  const unknown = Object.keys(reference).find(key => !allowed.has(key));
  if (unknown) fail("MOCK_BINDING", `mock_scenario 包含未知字段：${unknown}`);
  if (!string(reference.path) || !/^[a-f0-9]{64}$/.test(reference.sha256) || !string(reference.attempt_id) ||
      !string(reference.state_path) || !string(reference.receipts_path)) {
    fail("MOCK_BINDING", "mock_scenario 缺少场景路径、哈希、尝试或运行资产路径");
  }
}

function currentPolicy(log) {
  return (log.events ?? []).filter(event => event.type === "mock_policy").at(-1)?.decision ?? null;
}

// Coverage is evidence in the Run ledger, not an opt-in boolean. A route
// observation must come from the exact page Target and verified context.
export function verifyMockChannelCoverage(log, config, scenario, attempt) {
  const ref = config.mock_channel_coverage_ref;
  const coverage = (log.events ?? []).find(event => event.sequence === ref);
  const targetId = config.target_id ?? config.targetId;
  const context = (log.events ?? []).find(event => event.type === "coverage_context" &&
    event.context_ref === coverage?.context_ref && attempt.context_refs?.includes(event.sequence));
  if (!Number.isInteger(ref) || coverage?.type !== "mock_channel_coverage" ||
      coverage.target_id !== targetId || coverage.scenario_hash !== config.mock_scenario.sha256 ||
      !context || context.verification !== "verified" || context.target_id !== targetId || context.sequence >= ref) {
    fail("MOCK_CHANNEL_UNVERIFIED", "Mock 请求通道缺少本 Run 同 Target/场景/上下文的核验证据");
  }
  if ((log.events ?? []).some(event => event.sequence > context.sequence && (
    event.type === "resume_check" || (event.type === "browser_session" && ["disconnected", "target_lost", "retired"].includes(event.phase) && (!event.target_id || event.target_id === targetId)) || (event.type === "run_state" && ["awaiting_user", "interrupted"].includes(event.status ?? event.state)) ||
    (event.type === "execution_context_change" && (event.context_ref === context.context_ref || (event.target_ids ?? []).includes(targetId)))
  ))) fail("MOCK_CHANNEL_UNVERIFIED", "Mock 请求通道上下文已失效，必须重新核验");
  if (!Array.isArray(coverage.uncovered_channels) || coverage.uncovered_channels.length ||
      !Array.isArray(coverage.channels) || !coverage.channels.length ||
      coverage.channels.some(channel => channel.kind !== "page-http" || channel.target_id !== targetId ||
        !Array.isArray(channel.request_refs) || !channel.request_refs.length) ||
      !Array.isArray(coverage.request_refs) || !coverage.request_refs.length ||
      !Array.isArray(coverage.covered_route_ids)) {
    fail("MOCK_CHANNEL_UNVERIFIED", "Mock 存在未覆盖或无法核验的 worker/子目标/请求通道");
  }
  const observations = coverage.request_refs.map(sequence => {
    const event = (log.events ?? []).find(item => item.sequence === sequence);
    if (!Number.isInteger(sequence) || sequence >= ref || event?.type !== "network_observation" ||
        event.target_id !== targetId || event.context_ref !== context.context_ref || event.channel !== "page-http" ||
        !coverage.channels.some(channel => channel.request_refs.includes(sequence))) {
      fail("MOCK_CHANNEL_UNVERIFIED", "Mock 通道引用不是同 Target 的已观察页面 HTTP 请求");
    }
    return event;
  });
  if (coverage.channels.some(channel => channel.request_refs.some(sequence => !coverage.request_refs.includes(sequence)))) {
    fail("MOCK_CHANNEL_UNVERIFIED", "Mock 通道请求引用集合不一致");
  }
  for (const route of scenario.routes) {
    const matches = observations.some(event => {
      let url;
      try { url = new URL(event.url); } catch { return false; }
      return event.route_id === route.route_id && url.origin === route.match.origin &&
        url.pathname === route.match.pathname && event.method === route.match.method;
    });
    if (!coverage.covered_route_ids.includes(route.route_id) || !matches) {
      fail("MOCK_CHANNEL_UNVERIFIED", "Mock 场景路由尚未证明进入绑定 Target 的请求通道");
    }
  }
  return structuredClone(coverage);
}

export async function loadMockProxyBinding(config) {
  const reference = config.mock_scenario;
  if (!reference) return null;
  validateReference(reference);
  if (!path.isAbsolute(config.run_root ?? "")) fail("MOCK_BINDING", "启用 Mock 时 run_root 必须是绝对路径");
  const runRoot = await realpath(config.run_root);
  const logPath = await resolveExistingFile(runRoot, "execution-log.json", "execution-log.json");
  const scenarioPath = await resolveExistingFile(runRoot, reference.path, "mock_scenario.path");
  const statePath = await resolveOutputFile(runRoot, reference.state_path, "mock_scenario.state_path");
  const receiptsPath = await resolveOutputFile(runRoot, reference.receipts_path, "mock_scenario.receipts_path");
  const [logBytes, scenarioBytes] = await Promise.all([readFile(logPath), readFile(scenarioPath)]);
  if (digest(scenarioBytes) !== reference.sha256) fail("MOCK_HASH_MISMATCH", "Mock 场景文件 SHA-256 与配置不一致");
  const log = JSON.parse(logBytes.toString("utf8"));
  assertCurrentWorkflow(log);
  const scenario = compileMockScenario(JSON.parse(scenarioBytes.toString("utf8")));
  assertNoSecrets(scenario);
  if (log.extensions?.mock_fallback?.schema_version !== "1.0" || currentPolicy(log) !== "allowed") {
    fail("MOCK_NOT_ALLOWED", "当前 Run 未明确允许 Mock 或授权已撤回");
  }
  if (log.run?.run_id !== config.run_id || scenario.run_id !== log.run.run_id || scenario.attempt_id !== reference.attempt_id) {
    fail("MOCK_BINDING", "Mock 场景、代理配置与 Run/尝试归属不一致");
  }
  const state = deriveMockState(null, log);
  const attempt = state.attempts.get(reference.attempt_id);
  if (attempt?.state !== "running") fail("MOCK_BINDING", "Mock 尝试不存在或当前不处于 running");
  if (attempt.scenario_hash !== reference.sha256 || attempt.scenario_revision !== scenario.revision || attempt.case_id !== scenario.case_id) {
    fail("MOCK_BINDING", "Mock 尝试登记的场景版本、哈希或用例归属不一致");
  }
  if (!attempt.proxy_cycle_refs?.includes(config.proxy_cycle_id)) {
    fail("MOCK_BINDING", "Mock 代理周期未登记在当前尝试中");
  }
  const same = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  if (!same(attempt.candidate_checkpoint_ids, scenario.candidate_checkpoint_ids) ||
      !same(attempt.supporting_checkpoint_ids, scenario.supporting_checkpoint_ids)) {
    fail("MOCK_BINDING", "Mock 场景检查点范围与当前尝试不一致");
  }

  const channelCoverage = verifyMockChannelCoverage(log, config, scenario, attempt);

  let runtimeState = null;
  const stateStats = await lstat(statePath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  const receiptStats = await lstat(receiptsPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  if (Boolean(stateStats) !== Boolean(receiptStats)) fail("MOCK_STATE_MISMATCH", "Mock 状态与回执文件不完整，拒绝从中间继续");
  if (stateStats) {
    runtimeState = JSON.parse(await readFile(statePath, "utf8"));
    const receiptFile = JSON.parse(await readFile(receiptsPath, "utf8"));
    assertNoSecrets(runtimeState);
    assertNoSecrets(receiptFile);
    if (runtimeState.state_version < attempt.state_version || receiptFile.schema_version !== "mock-receipts-v1" ||
        receiptFile.run_id !== log.run.run_id || receiptFile.attempt_id !== attempt.attempt_id ||
        JSON.stringify(receiptFile.receipts) !== JSON.stringify(runtimeState.processed_requests?.map(item => item.receipt))) {
      fail("MOCK_STATE_MISMATCH", "Mock 状态版本或回执集合与执行日志不一致");
    }
  } else if (attempt.state_version !== 0) {
    fail("MOCK_STATE_MISSING", "Mock 尝试已有状态版本但运行状态文件缺失，不能从中间恢复");
  }

  const persist = async ({ runtime }) => {
    assertNoSecrets(runtime);
    await writeJsonAtomic(receiptsPath, {
      schema_version: "mock-receipts-v1",
      run_id: log.run.run_id,
      attempt_id: attempt.attempt_id,
      receipts: runtime.processed_requests.map(item => item.receipt)
    });
    await writeJsonAtomic(statePath, runtime);
  };
  const engine = new MockScenarioEngine(scenario, { runtimeState, persist });
  for (const item of runtimeState?.processed_requests ?? []) {
    const cycle = item.key.split("\u0000")[1];
    if (!attempt.proxy_cycle_refs.includes(cycle)) fail("MOCK_BINDING", "Mock 回执代理周期不属于当前尝试");
  }
  const assertAuthorized = async () => {
    const latest = JSON.parse(await readFile(logPath, "utf8"));
    assertCurrentWorkflow(latest);
    if (latest.run?.run_id !== config.run_id || latest.run?.status !== "running" || currentPolicy(latest) !== "allowed") {
      fail("MOCK_NOT_ALLOWED", "Mock 授权已撤回或 Run 已停止，拒绝新业务模拟");
    }
    const current = deriveMockState(null, latest).attempts.get(reference.attempt_id);
    if (current?.state !== "running" || current.scenario_hash !== reference.sha256 || current.scenario_revision !== scenario.revision ||
        !current.proxy_cycle_refs?.includes(config.proxy_cycle_id)) fail("MOCK_BINDING", "Mock 尝试或代理周期已失效");
    verifyMockChannelCoverage(latest, config, scenario, current);
  };
  const receiptSink = async receipt => {
    await assertAuthorized();
    // Atomic files are a checked pair, not a two-file database transaction.
    // Validate the complete persisted chain before importing any ledger fact.
    await resolveExistingFile(runRoot, reference.state_path, "mock_scenario.state_path");
    await resolveExistingFile(runRoot, reference.receipts_path, "mock_scenario.receipts_path");
    const [runtime, receipts] = await Promise.all([
      readFile(statePath, "utf8").then(JSON.parse), readFile(receiptsPath, "utf8").then(JSON.parse)
    ]);
    assertNoSecrets(runtime); assertNoSecrets(receipts);
    new MockScenarioEngine(scenario, { runtimeState: runtime });
    if (receipts.schema_version !== "mock-receipts-v1" || receipts.run_id !== config.run_id ||
        receipts.attempt_id !== attempt.attempt_id ||
        JSON.stringify(receipts.receipts) !== JSON.stringify(runtime.processed_requests.map(item => item.receipt))) {
      fail("MOCK_STATE_MISMATCH", "Mock 持久化状态和回执不一致，不能导入日志");
    }
    const target = runtime.processed_requests.find(item => item.receipt.receipt_id === receipt.receipt_id);
    if (!target || JSON.stringify(target.receipt) !== JSON.stringify(receipt)) fail("MOCK_STATE_MISMATCH", "待导入回执不属于已持久化事务");
    const { recordEvent } = await import("../run-artifacts.mjs");
    for (const item of runtime.processed_requests.filter(item => item.receipt.state_version <= receipt.state_version)) {
      const [attemptId, cycleId, requestId] = item.key.split("\u0000");
      const fresh = JSON.parse(await readFile(logPath, "utf8"));
      const current = deriveMockState(null, fresh).attempts.get(attemptId);
      if (attemptId !== attempt.attempt_id || !current?.proxy_cycle_refs?.includes(cycleId)) fail("MOCK_BINDING", "Mock 持久回执的尝试或周期不一致");
      const expected = {
        type: "mock_observation", attempt_id: attemptId, receipt_id: item.receipt.receipt_id,
        route_id: item.receipt.route_id, request_id: requestId, disposition: "mocked",
        request_facts: [`Request 阶段声明路由 ${item.receipt.route_id} 已匹配；未继续至真实上游`],
        response_facts: [`模拟响应状态 ${item.receipt.response.status} 已持久化；尚不证明页面消费`],
        state_before_version: item.receipt.state_version - 1, state_after_version: item.receipt.state_version,
        evidence_refs: [], proxy_cycle_ref: cycleId
      };
      const existing = fresh.events.find(event => event.type === "mock_observation" && event.receipt_id === expected.receipt_id);
      if (existing) {
        for (const field of ["attempt_id", "route_id", "request_id", "disposition", "state_before_version", "state_after_version", "proxy_cycle_ref"]) {
          if (existing[field] !== expected[field]) fail("MOCK_STATE_MISMATCH", "日志中的回执身份或状态版本与持久事务不一致");
        }
        continue;
      }
      if (current.state_version !== expected.state_before_version) fail("MOCK_STATE_MISMATCH", "日志缺少完整连续回执链，拒绝补记");
      await recordEvent(runRoot, expected);
    }
  };
  if (runtimeState?.state_version > attempt.state_version) {
    await receiptSink(runtimeState.processed_requests.at(-1).receipt);
  }
  return {
    engine,
    assertAuthorized,
    receiptSink,
    channelCoverage,
    proxyCycleId: config.proxy_cycle_id,
    statePath,
    receiptsPath,
    scenarioPath,
    attemptId: attempt.attempt_id
  };
}
