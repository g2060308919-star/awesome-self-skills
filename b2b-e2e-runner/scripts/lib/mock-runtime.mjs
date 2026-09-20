import crypto from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { writeJsonAtomic } from "./atomic-json.mjs";
import { deriveMockState } from "./mock-fallback.mjs";
import { compileMockScenario, MockScenarioEngine } from "./mock-scenario.mjs";
import { assertNoSecrets } from "./redaction.mjs";

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
  const same = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  if (!same(attempt.candidate_checkpoint_ids, scenario.candidate_checkpoint_ids) ||
      !same(attempt.supporting_checkpoint_ids, scenario.supporting_checkpoint_ids)) {
    fail("MOCK_BINDING", "Mock 场景检查点范围与当前尝试不一致");
  }

  let runtimeState = null;
  const stateStats = await lstat(statePath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  const receiptStats = await lstat(receiptsPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error));
  if (Boolean(stateStats) !== Boolean(receiptStats)) fail("MOCK_STATE_MISMATCH", "Mock 状态与回执文件不完整，拒绝从中间继续");
  if (stateStats) {
    runtimeState = JSON.parse(await readFile(statePath, "utf8"));
    const receiptFile = JSON.parse(await readFile(receiptsPath, "utf8"));
    assertNoSecrets(runtimeState);
    assertNoSecrets(receiptFile);
    if (runtimeState.state_version !== attempt.state_version || receiptFile.schema_version !== "mock-receipts-v1" ||
        receiptFile.attempt_id !== attempt.attempt_id ||
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
  return {
    engine,
    proxyCycleId: config.proxy_cycle_id,
    statePath,
    receiptsPath,
    scenarioPath,
    attemptId: attempt.attempt_id
  };
}
