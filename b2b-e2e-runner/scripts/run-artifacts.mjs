#!/usr/bin/env node
import crypto from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { writeJsonAtomic, writeTextAtomic } from "./lib/atomic-json.mjs";
import {
  expectedCheckpointIds,
  normalizeTestCases,
  validateCheckpointEvent,
  validateTestCases
} from "./lib/contracts.mjs";
import { assertNoSecrets } from "./lib/redaction.mjs";
import { aggregateCase, buildReport } from "./lib/report.mjs";
import { buildReportModel } from "./lib/report-model.mjs";
import { buildHtmlReport } from "./lib/report-html.mjs";
import {
  permissionWorkflowProfile,
  validatePermissionEvent,
  validatePermissionLog
} from "./lib/permission-batches.mjs";

function ensureRuntime() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) throw runnerError("INPUT_CONTRACT", "B2B E2E Runner 需要 Node.js 22 或更高版本");
}

function runnerError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function digest(contents) {
  return crypto.createHash("sha256").update(contents).digest("hex");
}

function createRunId() {
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 17);
  return `${timestamp}-${crypto.randomUUID()}`;
}

async function loadRun(runRoot) {
  const snapshotPath = path.join(runRoot, "test-cases.json");
  const logPath = path.join(runRoot, "execution-log.json");
  const [snapshotBytes, logBytes] = await Promise.all([
    readFile(snapshotPath),
    readFile(logPath)
  ]);
  const snapshotHash = digest(snapshotBytes);
  const log = JSON.parse(logBytes);
  if (snapshotHash !== log.test_cases?.sha256) {
    throw runnerError("RUN_HASH_MISMATCH", "用例快照 SHA-256 与执行日志不一致", {
      expected: log.test_cases?.sha256,
      actual: snapshotHash
    });
  }
  const testCases = JSON.parse(snapshotBytes);
  validateTestCases(testCases);
  return { snapshotPath, logPath, snapshotHash, logHash: digest(logBytes), testCases, log };
}

function consistencyError(message, details = {}) {
  return runnerError("RUN_CONSISTENCY", message, details);
}

function resolveEvidencePath(runRoot, relativePath) {
  if (typeof relativePath !== "string" || path.isAbsolute(relativePath)) {
    throw consistencyError("证据路径必须是 evidence/ 下的相对路径");
  }
  const normalized = path.normalize(relativePath);
  if (normalized === "evidence" || !normalized.startsWith(`evidence${path.sep}`)) {
    throw consistencyError(`证据路径越界：${relativePath}`);
  }
  const absolute = path.resolve(runRoot, normalized);
  const evidenceRoot = path.resolve(runRoot, "evidence");
  if (!absolute.startsWith(`${evidenceRoot}${path.sep}`)) throw consistencyError(`证据路径越界：${relativePath}`);
  return absolute;
}

async function validateEvidenceEntry(runRoot, entry, checkpointIds) {
  if (!entry || typeof entry !== "object") throw consistencyError("证据条目必须是对象");
  for (const key of ["evidence_id", "description"]) {
    if (typeof entry[key] !== "string" || !entry[key]) throw consistencyError(`证据缺少 ${key}`);
  }
  if (entry.at !== undefined && !Number.isFinite(Date.parse(entry.at))) throw consistencyError("证据时间无效");
  if (entry.at === undefined) throw consistencyError("证据缺少 at");
  if (!Array.isArray(entry.checkpoint_ids)) throw consistencyError("证据 checkpoint_ids 必须是数组");
  for (const id of entry.checkpoint_ids) {
    if (!checkpointIds.has(id)) throw consistencyError(`证据引用未知检查点：${id}`);
  }
  if ((entry.path ? 1 : 0) + (entry.inline !== undefined ? 1 : 0) !== 1) {
    throw consistencyError("证据必须且只能提供 path 或 inline");
  }
  if (entry.path) {
    const absolute = resolveEvidencePath(runRoot, entry.path);
    const stats = await lstat(absolute).catch(error => {
      if (error.code === "ENOENT") throw consistencyError(`证据文件不存在：${entry.path}`);
      throw error;
    });
    if (!stats.isFile() || stats.isSymbolicLink()) throw consistencyError(`证据必须是普通文件：${entry.path}`);
  } else {
    assertNoSecrets(entry.inline);
  }
}

async function scanEvidenceDirectory(runRoot) {
  const evidenceRoot = path.join(runRoot, "evidence");
  const pending = [evidenceRoot];
  const textExtensions = new Set([".json", ".txt", ".md", ".log", ".har", ".csv", ".xml", ".html"]);
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw consistencyError(`证据目录不得包含符号链接：${path.relative(runRoot, absolute)}`);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) {
        assertNoSecrets(entry.name);
        if (textExtensions.has(path.extname(entry.name).toLowerCase())) {
          assertNoSecrets(await readFile(absolute, "utf8"));
        }
      }
    }
  }
}

export async function initializeRun({ workspaceRoot, casesPath, runId = createRunId(), workflowProfile }) {
  ensureRuntime();
  if (!workspaceRoot || !casesPath) throw runnerError("INPUT_CONTRACT", "workspaceRoot 与 casesPath 必填");
  if (workflowProfile !== undefined && workflowProfile !== permissionWorkflowProfile) {
    throw runnerError("INPUT_CONTRACT", "未知 workflow profile");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw runnerError("INPUT_CONTRACT", "Run ID 只能包含字母、数字、点、下划线和连字符");
  let input;
  try { input = JSON.parse(await readFile(casesPath, "utf8")); }
  catch (error) {
    if (error instanceof SyntaxError) throw runnerError("INPUT_CONTRACT", "测试用例不是合法 JSON");
    throw error;
  }
  const testCases = normalizeTestCases(input);
  assertNoSecrets(testCases);
  const runsRoot = path.join(path.resolve(workspaceRoot), "b2b-e2e-runs");
  await mkdir(runsRoot, { recursive: true });
  let selectedRunId = runId;
  let runRoot;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    runRoot = path.join(runsRoot, selectedRunId);
    try {
      await mkdir(runRoot, { recursive: false, mode: 0o700 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || runId !== selectedRunId || attempt === 9) throw error;
      selectedRunId = createRunId();
    }
  }
  try {
  const evidenceRoot = path.join(runRoot, "evidence");
  await mkdir(evidenceRoot, { mode: 0o700 });
  const snapshotPath = path.join(runRoot, "test-cases.json");
  await writeJsonAtomic(snapshotPath, testCases);
  const snapshotHash = digest(await readFile(snapshotPath));
  const now = new Date().toISOString();
  const caseStates = testCases.cases.map(testCase => {
    const excluded = testCase.excluded === true;
    return {
      case_id: testCase.case_id,
      execution_index: null,
      result: excluded ? "not_executed" : "undetermined",
      reason: excluded ? "整条用例在正式执行前已明确排除" : "检查点尚未全部执行",
      checkpoints: testCase.steps.flatMap(step => step.expected.map(oracle => ({
        step_id: step.step_id,
        oracle_id: oracle.oracle_id,
        status: excluded ? "skipped" : "pending",
        result: excluded ? "not_executed" : null,
        reason: excluded ? "整条用例在正式执行前已明确排除" : null,
        observations: [],
        evidence_refs: [],
        evidence_status: "not_required",
        blocker: null,
        started_at: null,
        completed_at: null
      })))
    };
  });
  const executionLog = {
    schema_version: "2.0",
    run: {
      run_id: selectedRunId,
      status: "initialized",
      started_at: now,
      completed_at: null,
      workspace_root: ".",
      actual_case_order: [],
      resume_count: 0
    },
    test_cases: { path: "./test-cases.json", sha256: snapshotHash },
    browser: {
      mcp_status: "unknown",
      owned_target_ids: [],
      preexisting_target_ids: [],
      attached_preexisting_target_ids: [],
      role_observations: []
    },
    proxy: {
      required: false,
      state: "not_required",
      rules_path: null,
      target_id: null,
      verifications: [],
      cleanup: { attempted: false, succeeded: null, reason: null }
    },
    cases: caseStates,
    events: workflowProfile ? [{ type: "workflow_profile", profile: workflowProfile, sequence: 1, at: now }] : [],
    cleanup: { attempted: false, completed: false, items: [] }
  };
  await writeJsonAtomic(path.join(runRoot, "execution-log.json"), executionLog);
  await chmod(snapshotPath, 0o400).catch(() => {});
  return { runId: selectedRunId, runRoot, snapshotHash, evidenceRoot };
  } catch (error) {
    await rm(runRoot, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function validateRun(runRoot, { checkReport = true } = {}) {
  const run = await loadRun(path.resolve(runRoot));
  assertNoSecrets(run.testCases);
  assertNoSecrets(run.log);
  if (run.log.schema_version !== "2.0" || typeof run.log.run?.run_id !== "string" || !Array.isArray(run.log.events)) {
    throw consistencyError("execution-log.json 契约无效");
  }
  const runStatuses = new Set(["initialized", "running", "awaiting_user", "completed", "interrupted"]);
  if (!runStatuses.has(run.log.run.status) || !Array.isArray(run.log.run.actual_case_order) || !Number.isInteger(run.log.run.resume_count)) {
    throw consistencyError("Run 状态结构无效");
  }
  if (!run.log.browser || !Array.isArray(run.log.browser.role_observations) || !run.log.proxy || !run.log.cleanup) {
    throw consistencyError("执行日志缺少 browser、proxy 或 cleanup 结构");
  }
  const expected = expectedCheckpointIds(run.testCases);
  if (!Array.isArray(run.log.cases) || run.log.cases.length !== run.testCases.cases.length) {
    throw consistencyError("日志用例数量与快照不一致");
  }
  const knownCases = new Set(run.testCases.cases.map(item => item.case_id));
  if (new Set(run.log.run.actual_case_order).size !== run.log.run.actual_case_order.length ||
      run.log.run.actual_case_order.some(id => !knownCases.has(id))) {
    throw consistencyError("actual_case_order 包含重复或未知用例 ID");
  }
  const evidenceIds = new Set();
  for (const [index, event] of (run.log.events ?? []).entries()) {
    if (event.sequence !== index + 1 || !Number.isFinite(Date.parse(event.at))) {
      throw consistencyError(`事件顺序或时间无效：events[${index}]`);
    }
    if (event.type === "checkpoint_result") {
      validateCheckpointEvent(event);
      if (!expected.has(event.checkpoint_id)) {
        throw runnerError("RUN_CONSISTENCY", `执行日志引用未知检查点：${event.checkpoint_id}`, { index });
      }
    }
    if (event.evidence !== undefined && !Array.isArray(event.evidence)) throw consistencyError(`events[${index}].evidence 必须是数组`);
    for (const evidence of event.evidence ?? []) {
      await validateEvidenceEntry(path.resolve(runRoot), evidence, expected);
      if (evidenceIds.has(evidence.evidence_id)) throw consistencyError(`证据 ID 重复：${evidence.evidence_id}`);
      evidenceIds.add(evidence.evidence_id);
    }
  }
  validatePermissionLog(run.testCases, run.log);
  const checkpointStatuses = new Set(["pending", "running", "completed", "skipped"]);
  const resultStates = new Set(["passed", "failed", "undetermined", "not_executed"]);
  const evidenceStates = new Set(["complete", "partial", "missing", "not_required"]);
  for (let caseIndex = 0; caseIndex < run.testCases.cases.length; caseIndex += 1) {
    const sourceCase = run.testCases.cases[caseIndex];
    const loggedCase = run.log.cases[caseIndex];
    if (loggedCase.case_id !== sourceCase.case_id) throw consistencyError(`日志用例顺序或 ID 不一致：cases[${caseIndex}]`);
    const expectedPairs = sourceCase.steps.flatMap(step => step.expected.map(oracle => [step.step_id, oracle.oracle_id]));
    if (!Array.isArray(loggedCase.checkpoints) || loggedCase.checkpoints.length !== expectedPairs.length) {
      throw consistencyError(`检查点数量不一致：${sourceCase.case_id}`);
    }
    loggedCase.checkpoints.forEach((checkpoint, checkpointIndex) => {
      const [stepId, oracleId] = expectedPairs[checkpointIndex];
      if (checkpoint.step_id !== stepId || checkpoint.oracle_id !== oracleId) throw consistencyError(`检查点 ID 或顺序不一致：${sourceCase.case_id}`);
      if (!checkpointStatuses.has(checkpoint.status) || !evidenceStates.has(checkpoint.evidence_status)) throw consistencyError(`检查点状态无效：${sourceCase.case_id}`);
      if (checkpoint.result !== null && !resultStates.has(checkpoint.result)) throw consistencyError(`检查点结果无效：${sourceCase.case_id}`);
      if (!Array.isArray(checkpoint.observations) || !Array.isArray(checkpoint.evidence_refs)) throw consistencyError(`检查点事实结构无效：${sourceCase.case_id}`);
      if (checkpoint.evidence_refs.some(id => !evidenceIds.has(id))) throw consistencyError(`检查点引用未知证据：${sourceCase.case_id}`);
    });
    const derived = aggregateCase({ excluded: sourceCase.excluded === true, checkpoints: loggedCase.checkpoints });
    if (loggedCase.result !== derived || typeof loggedCase.reason !== "string" || !loggedCase.reason) {
      throw consistencyError(`用例聚合或原因不一致：${sourceCase.case_id}`);
    }
  }
  const proxyStates = new Set(["not_required", "configured", "starting", "active", "degraded", "stopped", "cleanup_failed"]);
  if (!proxyStates.has(run.log.proxy.state) || !Array.isArray(run.log.proxy.verifications) || !run.log.proxy.cleanup) {
    throw consistencyError("代理状态结构无效");
  }
  if (typeof run.log.cleanup.attempted !== "boolean" || typeof run.log.cleanup.completed !== "boolean" || !Array.isArray(run.log.cleanup.items)) {
    throw consistencyError("清理状态结构无效");
  }
  await scanEvidenceDirectory(path.resolve(runRoot));
  const reportPath = path.join(path.resolve(runRoot), "report.md");
  const htmlReportPath = path.join(path.resolve(runRoot), "report.html");
  if (checkReport) {
    const [reportStats, htmlStats] = await Promise.all([
      lstat(reportPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error)),
      lstat(htmlReportPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error))
    ]);
    const profile = workflowProfile(run.log);
    const deliveryState = ["awaiting_user", "completed"].includes(run.log.run.status);
    if (profile === permissionWorkflowProfile && (deliveryState || reportStats || htmlStats) && (!reportStats || !htmlStats)) {
      throw consistencyError("新工作流阶段或最终交付必须同时存在 report.md 与 report.html 两份报告");
    }
    const model = buildReportModel(run.testCases, run.log);
    if (reportStats) {
      if (!reportStats.isFile() || reportStats.isSymbolicLink()) throw consistencyError("report.md 必须是普通文件");
      const report = await readFile(reportPath, "utf8");
      assertNoSecrets(report);
      if (report !== buildReport(run.testCases, run.log).markdown) {
        throw consistencyError("report.md 与用例快照和执行日志的确定性派生结果不一致");
      }
    }
    if (htmlStats) {
      if (!htmlStats.isFile() || htmlStats.isSymbolicLink()) throw consistencyError("report.html 必须是普通文件");
      const html = await readFile(htmlReportPath, "utf8");
      assertNoSecrets(html);
      if (html !== buildHtmlReport(model)) {
        throw consistencyError("report.html 与用例快照和执行日志的确定性派生结果不一致");
      }
    }
  }
  return {
    valid: true,
    runId: run.log.run.run_id,
    runRoot: path.resolve(runRoot),
    snapshotHash: run.snapshotHash,
    eventCount: (run.log.events ?? []).length
  };
}

export async function recordEvent(runRoot, event) {
  assertNoSecrets(event);
  const run = await loadRun(path.resolve(runRoot));
  if (!event || typeof event !== "object" || typeof event.type !== "string") {
    throw runnerError("INPUT_CONTRACT", "事件必须包含 type");
  }
  if (["workflow_profile", "resume_check"].includes(event.type)) {
    throw runnerError("INPUT_CONTRACT", `${event.type} 只能由其所属命令写入`);
  }
  if (event.type === "checkpoint_result") {
    validateCheckpointEvent(event);
    if (!expectedCheckpointIds(run.testCases).has(event.checkpoint_id)) {
      throw runnerError("RUN_CONSISTENCY", `未知检查点：${event.checkpoint_id}`);
    }
  }
  validatePermissionEvent(run.testCases, run.log, event);
  const ids = expectedCheckpointIds(run.testCases);
  for (const evidence of event.evidence ?? []) await validateEvidenceEntry(path.resolve(runRoot), evidence, ids);
  const logged = {
    ...structuredClone(event),
    ...(event.type === "checkpoint_result" ? {
      status: event.status ?? "completed",
      observation: event.observation ?? event.reason,
      blocker: event.blocker ?? null,
      evidence: event.evidence ?? []
    } : {}),
    sequence: run.log.events.length + 1,
    at: new Date().toISOString()
  };
  run.log.events.push(logged);
  if (event.type === "run_state") {
    run.log.run.status = event.status ?? event.state;
    if (run.log.run.status === "completed") run.log.run.completed_at = logged.at;
  }
  if (event.type === "mcp_preflight") run.log.browser.mcp_status = event.status;
  if (event.type === "role_observation") run.log.browser.role_observations.push({ ...event.observation, at: logged.at });
  if (event.type === "target_inventory") {
    for (const key of ["owned_target_ids", "preexisting_target_ids", "attached_preexisting_target_ids"]) {
      if (event[key]) run.log.browser[key] = [...event[key]];
    }
  }
  if (event.type === "proxy_state") run.log.proxy = { ...run.log.proxy, ...event.proxy };
  if (event.type === "cleanup_state") run.log.cleanup = { ...run.log.cleanup, ...event.cleanup };
  if (event.type === "case_started") {
    if (!run.log.cases.some(item => item.case_id === event.case_id)) throw consistencyError(`未知用例：${event.case_id}`);
    if (!run.log.run.actual_case_order.includes(event.case_id)) run.log.run.actual_case_order.push(event.case_id);
    const state = run.log.cases.find(item => item.case_id === event.case_id);
    state.execution_index = run.log.run.actual_case_order.indexOf(event.case_id) + 1;
  }
  if (event.type === "checkpoint_started") {
    const found = findCheckpoint(run.testCases, run.log, event.checkpoint_id);
    if (!found) throw consistencyError(`未知检查点：${event.checkpoint_id}`);
    found.checkpoint.status = "running";
    found.checkpoint.started_at ??= logged.at;
  }
  if (event.type === "checkpoint_result") {
    const found = findCheckpoint(run.testCases, run.log, event.checkpoint_id);
    if (!found) throw consistencyError(`未知检查点：${event.checkpoint_id}`);
    const { sourceCase, state, checkpoint } = found;
    checkpoint.status = event.status ?? "completed";
    checkpoint.result = event.result;
    checkpoint.reason = event.reason;
    checkpoint.observations.push(event.observation ?? event.reason);
    checkpoint.evidence_refs = (event.evidence ?? []).map(item => item.evidence_id);
    checkpoint.evidence_status = event.evidence_status;
    checkpoint.blocker = event.blocker ?? null;
    checkpoint.started_at ??= logged.at;
    checkpoint.completed_at = logged.at;
    if (event.permission_group_ids !== undefined) checkpoint.permission_group_ids = [...event.permission_group_ids];
    state.result = aggregateCase({ excluded: sourceCase.excluded === true, checkpoints: state.checkpoints });
    const decisive = state.checkpoints.find(item => item.result === "failed") ??
      state.checkpoints.find(item => item.result === "undetermined") ?? state.checkpoints.at(-1);
    state.reason = decisive?.reason ?? (state.result === "passed" ? "所有必需检查点均通过" : "检查点尚未全部执行");
  }
  if (event.type === "permission_wait") {
    for (const checkpointId of event.checkpoint_ids) {
      const found = findCheckpoint(run.testCases, run.log, checkpointId);
      found.checkpoint.reason = event.reason;
      found.checkpoint.blocker = event.reason;
      found.checkpoint.permission_group_ids = [event.group_id];
      if (!found.state.checkpoints.some(item => item.result === "failed" || item.result === "undetermined")) {
        found.state.reason = event.reason;
      }
    }
  }
  await writeJsonAtomic(run.logPath, run.log);
  return { recorded: true, sequence: logged.sequence, runId: run.log.run.run_id };
}

export async function resumeCheck(runRoot) {
  await validateRun(runRoot);
  const { log, logPath } = await loadRun(path.resolve(runRoot));
  const confirmed = new Set(log.events
    .filter(event => event.type === "action_confirmed")
    .map(event => event.action_id));
  const possiblyCommitted = log.events.filter(event =>
    event.type === "action_dispatched" && event.side_effect === true && !confirmed.has(event.action_id)
  );
  const completed = log.cases.flatMap(testCase => testCase.checkpoints.map(checkpoint => ({ testCase, checkpoint })))
    .filter(item => item.checkpoint.status === "completed")
    .at(-1);
  for (const testCase of log.cases) {
    for (const checkpoint of testCase.checkpoints) {
      if (checkpoint.status === "running" && checkpoint.result === null) checkpoint.status = "pending";
    }
  }
  const previousLastEvent = log.events.at(-1) ?? null;
  log.run.resume_count += 1;
  if (workflowProfile(log) === permissionWorkflowProfile) {
    log.events.push({
      type: "resume_check",
      resume_count: log.run.resume_count,
      sequence: log.events.length + 1,
      at: new Date().toISOString()
    });
  }
  await writeJsonAtomic(logPath, log);
  return {
    run_id: log.run.run_id,
    state: log.run.status,
    last_event: previousLastEvent,
    last_completed_checkpoint: completed
      ? `${completed.testCase.case_id}/${completed.checkpoint.step_id}/${completed.checkpoint.oracle_id}`
      : null,
    possibly_committed_actions: possiblyCommitted,
    auto_replay_allowed: possiblyCommitted.length === 0,
    reverify: "恢复前必须重新验证页面、角色和代理状态；对可能已提交的副作用动作不得自动重放。"
  };
}

function findCheckpoint(testCases, log, id) {
  for (let caseIndex = 0; caseIndex < testCases.cases.length; caseIndex += 1) {
    const sourceCase = testCases.cases[caseIndex];
    const state = log.cases[caseIndex];
    let checkpointIndex = 0;
    for (const step of sourceCase.steps) {
      for (const oracle of step.expected) {
        const checkpoint = state.checkpoints[checkpointIndex++];
        if (`${sourceCase.case_id}/${step.step_id}/${oracle.oracle_id}` === id) {
          return { sourceCase, state, checkpoint };
        }
      }
    }
  }
  return null;
}

function workflowProfile(log) {
  return log.events?.find(event => event.type === "workflow_profile")?.profile ?? null;
}

export async function generateReport(runRoot) {
  await validateRun(runRoot, { checkReport: false });
  const loaded = await loadRun(path.resolve(runRoot));
  const { testCases, log } = loaded;
  const model = buildReportModel(testCases, log);
  assertNoSecrets(model);
  const generated = buildReport(testCases, log);
  const html = buildHtmlReport(model);
  assertNoSecrets(generated.markdown);
  assertNoSecrets(html);
  const reportPath = path.join(path.resolve(runRoot), "report.md");
  const htmlReportPath = path.join(path.resolve(runRoot), "report.html");
  await writeTextAtomic(reportPath, generated.markdown);
  await writeTextAtomic(htmlReportPath, html);
  const [writtenMarkdown, writtenHtml, latestLog] = await Promise.all([
    readFile(reportPath, "utf8"),
    readFile(htmlReportPath, "utf8"),
    readFile(loaded.logPath)
  ]);
  assertNoSecrets(writtenMarkdown);
  assertNoSecrets(writtenHtml);
  if (writtenMarkdown !== generated.markdown || writtenHtml !== html) throw consistencyError("报告写入后内容校验失败");
  if (digest(latestLog) !== loaded.logHash) throw consistencyError("报告生成期间执行日志发生变化，拒绝交付过期报告");
  await validateRun(runRoot);
  return { reportPath, htmlReportPath, counts: generated.counts, runId: log.run.run_id };
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    if (!flag?.startsWith("--") || rest[index + 1] === undefined) {
      throw runnerError("INPUT_CONTRACT", `参数格式错误：${flag ?? "<缺失>"}`);
    }
    options[flag.slice(2)] = rest[index + 1];
  }
  return { command, options };
}

function exitCode(error) {
  if (error.code === "INPUT_CONTRACT") return 2;
  if (["RUN_HASH_MISMATCH", "RUN_CONSISTENCY"].includes(error.code)) return 3;
  if (error.code === "SECRET_DETECTED") return 4;
  return 5;
}

async function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  let result;
  if (command === "init") {
    result = await initializeRun({ workspaceRoot: options.workspace, casesPath: options.cases, workflowProfile: options["workflow-profile"] });
  } else if (command === "record") {
    const event = JSON.parse(await readFile(options.event, "utf8"));
    result = await recordEvent(options.run, event);
  } else if (command === "resume-check") {
    result = await resumeCheck(options.run);
  } else if (command === "validate") {
    result = await validateRun(options.run);
  } else if (command === "report") {
    result = await generateReport(options.run);
  } else {
    throw runnerError("INPUT_CONTRACT", "命令必须是 init、record、resume-check、validate 或 report");
  }
  process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch(error => {
    process.stdout.write(JSON.stringify({
      ok: false,
      error: { code: error.code ?? "FILESYSTEM", message: error.message, path: error.path }
    }) + "\n");
    process.exitCode = exitCode(error);
  });
}
