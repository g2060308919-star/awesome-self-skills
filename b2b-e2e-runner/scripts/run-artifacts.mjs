#!/usr/bin/env node
import crypto from "node:crypto";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
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
import { readScreenshotSource, writeScreenshotExclusive } from "./lib/evidence-import.mjs";
import { validateScreenshotBytes } from "./lib/screenshot-validation.mjs";
import { aggregateCase, buildReport, renderChatTableMarkdown } from "./lib/report.mjs";
import { buildReportModel, deriveActivityDurations } from "./lib/report-model.mjs";
import { mergeRetakeModels, sameCase } from "./lib/retake.mjs";
import { loadGCaseDocumentHandoff } from "./lib/g-case-document-handoff.mjs";
import { buildHtmlReport } from "./lib/report-html.mjs";
import { validateCoverageEvent, validateCoverageLog } from "./lib/execution-coverage.mjs";
import { validateMockEvent, validateMockLog } from "./lib/mock-fallback.mjs";
import {
  permissionWorkflowProfile,
  permissionWorkflowProfileV2,
  permissionWorkflowProfileV3,
  permissionWorkflowProfiles,
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

const EXECUTION_COVERAGE_EXTENSION = "execution_coverage";
const MOCK_FALLBACK_EXTENSION = "mock_fallback";
const RUN_EXTENSION_VERSION = "1.0";
const MOCK_FALLBACK_DECISIONS = new Set(["allowed", "declined"]);

function validateRunExtensions(log) {
  if (log.extensions === undefined) return;
  if (!log.extensions || typeof log.extensions !== "object" || Array.isArray(log.extensions)) {
    throw consistencyError("Run 扩展必须是对象");
  }
  const supported = new Set([EXECUTION_COVERAGE_EXTENSION, MOCK_FALLBACK_EXTENSION]);
  const unknown = Object.keys(log.extensions).find(key => !supported.has(key));
  if (unknown) throw consistencyError(`未知 Run 扩展：${unknown}`);
  const profile = log.events?.find(event => event.type === "workflow_profile")?.profile;
  if (profile !== permissionWorkflowProfileV2) throw consistencyError("Run 扩展只允许用于 v2 工作流");
  for (const [name, extension] of Object.entries(log.extensions)) {
    if (!extension || typeof extension !== "object" || Array.isArray(extension) ||
        Object.keys(extension).length !== 1 || extension.schema_version !== RUN_EXTENSION_VERSION) {
      throw consistencyError(`Run 扩展 ${name} 版本无效`);
    }
  }
  if (!log.extensions[EXECUTION_COVERAGE_EXTENSION]) throw consistencyError("v1.1 Run 扩展缺少执行覆盖能力");
  if (log.extensions[MOCK_FALLBACK_EXTENSION] && !log.extensions[EXECUTION_COVERAGE_EXTENSION]) {
    throw consistencyError("Mock 扩展必须与执行覆盖扩展共同启用");
  }
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
  validateRunExtensions(log);
  return { snapshotPath, logPath, snapshotHash, logHash: digest(logBytes), testCases, log };
}

function retakeEvent(log) {
  return log.events?.find(event => event.type === "retake_link") ?? null;
}

async function validateRetakeLink(runRoot, run, lineage = []) {
  const link = retakeEvent(run.log);
  if (!link) return null;
  const current = path.resolve(runRoot);
  if (lineage.includes(current)) throw consistencyError("补测关联形成环");
  if (![link.parent_run_id, link.root_run_id].every(id => typeof id === "string" && /^[A-Za-z0-9._-]+$/.test(id))
    || link.parent_run_id === run.log.run.run_id || link.root_run_id === run.log.run.run_id) {
    throw consistencyError("补测关联指向自身或非法 Run");
  }
  const runsRoot = path.dirname(current);
  const parentRoot = path.join(runsRoot, link.parent_run_id);
  const rootRoot = path.join(runsRoot, link.root_run_id);
  if (lineage.includes(parentRoot)) throw consistencyError("补测关联形成环");
  const parent = await loadRun(parentRoot);
  const original = await loadRun(rootRoot);
  if (parent.log.run.run_id !== link.parent_run_id || original.log.run.run_id !== link.root_run_id
    || parent.logHash !== link.parent_log_sha256 || original.snapshotHash !== link.root_snapshot_sha256
    || parent.log.run.status !== "completed" || original.log.run.status !== "completed") {
    throw consistencyError("补测父轮、根快照或读取边界不匹配");
  }
  const parentLink = retakeEvent(parent.log);
  if (parentLink ? parentLink.root_run_id !== link.root_run_id : link.parent_run_id !== link.root_run_id) {
    throw consistencyError("补测父轮与根任务不一致");
  }
  if (!sameCase(original.testCases.suite, run.testCases.suite)
    || run.testCases.cases.some(testCase => !original.testCases.cases.some(item =>
      item.case_id === testCase.case_id && sameCase(item, testCase)))) {
    throw consistencyError("补测用例语义或预期与根快照不兼容");
  }
  await validateRun(parentRoot, { checkReport: true, _lineage: [...lineage, current] });
  return { link, parentRoot, rootRoot };
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
    const evidenceRoot = path.resolve(runRoot, "evidence");
    const evidenceRootStats = await lstat(evidenceRoot).catch(error => {
      if (error.code === "ENOENT") throw consistencyError("evidence/ 目录不存在");
      throw error;
    });
    if (!evidenceRootStats.isDirectory() || evidenceRootStats.isSymbolicLink()) {
      throw consistencyError("evidence/ 根目录必须是真实目录且不得是符号链接");
    }
    let current = evidenceRoot;
    for (const segment of path.relative(evidenceRoot, absolute).split(path.sep)) {
      current = path.join(current, segment);
      const partStats = await lstat(current).catch(error => {
        if (error.code === "ENOENT") throw consistencyError(`证据文件不存在：${entry.path}`);
        throw error;
      });
      if (partStats.isSymbolicLink()) throw consistencyError(`证据路径不得包含符号链接：${entry.path}`);
    }
    const stats = await lstat(absolute).catch(error => {
      if (error.code === "ENOENT") throw consistencyError(`证据文件不存在：${entry.path}`);
      throw error;
    });
    if (!stats.isFile() || stats.isSymbolicLink()) throw consistencyError(`证据必须是普通文件：${entry.path}`);
    if (entry.kind === "screenshot") {
      const extension = path.extname(entry.path).toLowerCase();
      const bytes = await readFile(absolute);
      if (entry.sha256 !== undefined && (!/^[a-f0-9]{64}$/.test(entry.sha256) || digest(bytes) !== entry.sha256)) {
        throw consistencyError("截图图片摘要不一致");
      }
      if (["tool_file", "tool_image_return"].includes(entry.capture_source)) {
        await validateScreenshotBytes(bytes);
      }
      const png = extension === ".png" && bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const jpeg = [".jpg", ".jpeg"].includes(extension) && bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const webp = extension === ".webp" && bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
      if (!png && !jpeg && !webp) throw consistencyError(`截图图片文件格式与允许类型不一致：${entry.path}`);
    }
  } else {
    assertNoSecrets(entry.inline);
  }
}

async function scanEvidenceDirectory(runRoot) {
  const evidenceRoot = path.join(runRoot, "evidence");
  const rootStats = await lstat(evidenceRoot).catch(error => {
    if (error.code === "ENOENT") throw consistencyError("evidence/ 目录不存在");
    throw error;
  });
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw consistencyError("evidence/ 根目录必须是真实目录且不得是符号链接");
  }
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

export async function initializeRun({ workspaceRoot, casesPath, casesInput, runId = createRunId(), workflowProfile, mockFallback }) {
  ensureRuntime();
  if (!workspaceRoot || (casesPath === undefined) === (casesInput === undefined)) {
    throw runnerError("INPUT_CONTRACT", "workspaceRoot 与 casesPath 或 casesInput 必填，且只能选择一种");
  }
  if (workflowProfile !== undefined && !permissionWorkflowProfiles.includes(workflowProfile)) {
    throw runnerError("INPUT_CONTRACT", "未知 workflow profile");
  }
  if (mockFallback !== undefined && !MOCK_FALLBACK_DECISIONS.has(mockFallback)) {
    throw runnerError("INPUT_CONTRACT", "Mock fallback 只接受 allowed 或 declined");
  }
  if (mockFallback !== undefined && workflowProfile !== permissionWorkflowProfileV2) {
    throw runnerError("INPUT_CONTRACT", "Mock fallback 只允许用于 permission-batches-html-v2");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(runId)) throw runnerError("INPUT_CONTRACT", "Run ID 只能包含字母、数字、点、下划线和连字符");
  let input = casesInput;
  if (casesPath !== undefined) {
    try { input = JSON.parse(await readFile(casesPath, "utf8")); }
    catch (error) {
      if (error instanceof SyntaxError) throw runnerError("INPUT_CONTRACT", "测试用例不是合法 JSON");
      throw error;
    }
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
  const events = workflowProfile
    ? [{ type: "workflow_profile", profile: workflowProfile, sequence: 1, at: now }]
    : [];
  if (mockFallback !== undefined) {
    events.push({
      type: "mock_policy",
      action: "initial",
      decision: mockFallback,
      decision_source: "user",
      basis: "用户在执行前明确选择",
      sequence: events.length + 1,
      at: now
    });
  }
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
    ...(workflowProfile === permissionWorkflowProfileV2 ? {
      extensions: {
        [EXECUTION_COVERAGE_EXTENSION]: { schema_version: RUN_EXTENSION_VERSION },
        ...(mockFallback !== undefined ? { [MOCK_FALLBACK_EXTENSION]: { schema_version: RUN_EXTENSION_VERSION } } : {})
      }
    } : {}),
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
    events,
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

export async function validateRun(runRoot, { checkReport = true, _lineage = [] } = {}) {
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
  const evidenceEntries = new Map();
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
      if (evidenceEntries.has(evidence.evidence_id)) throw consistencyError(`证据 ID 重复：${evidence.evidence_id}`);
      evidenceEntries.set(evidence.evidence_id, evidence);
    }
    if (event.type === "checkpoint_result" && event.evidence_refs !== undefined) {
      if (!Array.isArray(event.evidence_refs) || new Set(event.evidence_refs).size !== event.evidence_refs.length) throw consistencyError("checkpoint_result.evidence_refs 必须是无重复字符串数组");
      for (const evidenceId of event.evidence_refs) {
        const evidence = evidenceEntries.get(evidenceId);
        if (!evidence) throw consistencyError(`检查点引用未注册证据：${evidenceId}`);
        if (!evidence.checkpoint_ids.includes(event.checkpoint_id)) throw consistencyError(`证据 ${evidenceId} 不支持检查点 ${event.checkpoint_id}`);
      }
    }
  }
  validatePermissionLog(run.testCases, run.log);
  validateCoverageLog(run.testCases, run.log);
  validateMockLog(run.testCases, run.log);
  if ([permissionWorkflowProfileV2, permissionWorkflowProfileV3].includes(workflowProfile(run.log)) && ["awaiting_user", "completed"].includes(run.log.run.status)) {
    const captureEvents = run.log.events.filter(event => event.type === "evidence_capture");
    for (const caseId of run.log.run.actual_case_order) {
      const sourceCase = run.testCases.cases.find(item => item.case_id === caseId);
      if (!sourceCase || sourceCase.excluded) continue;
      const ids = new Set(sourceCase.steps.flatMap(step => step.expected.map(oracle => `${caseId}/${step.step_id}/${oracle.oracle_id}`)));
      const documented = captureEvents.some(event => (event.checkpoint_ids ?? []).some(checkpointId => ids.has(checkpointId)));
      if (!documented) throw consistencyError(`已执行用例 ${caseId} 缺少成功或明确缺失的截图采集记录`);
    }
  }
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
      if (checkpoint.evidence_refs.some(id => !evidenceEntries.has(id))) throw consistencyError(`检查点引用未知证据：${sourceCase.case_id}`);
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
  await validateRetakeLink(runRoot, run, _lineage);
  const reportPath = path.join(path.resolve(runRoot), "report.md");
  const htmlReportPath = path.join(path.resolve(runRoot), "report.html");
  if (checkReport) {
    const [reportStats, htmlStats] = await Promise.all([
      lstat(reportPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error)),
      lstat(htmlReportPath).catch(error => error.code === "ENOENT" ? null : Promise.reject(error))
    ]);
    const profile = workflowProfile(run.log);
    const deliveryState = ["awaiting_user", "completed"].includes(run.log.run.status);
    if ([permissionWorkflowProfileV2, permissionWorkflowProfileV3].includes(profile)) {
      if (reportStats) throw consistencyError("v2 工作流不得生成 report.md");
      if ((deliveryState || htmlStats) && !htmlStats) throw consistencyError("v2 阶段或最终交付必须存在 report.html");
    } else if (profile === permissionWorkflowProfile && (deliveryState || reportStats || htmlStats) && (!reportStats || !htmlStats)) {
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
  validateCoverageEvent(run.testCases, run.log, event);
  validateMockEvent(run.testCases, run.log, event);
  const ids = expectedCheckpointIds(run.testCases);
  const registeredEvidence = new Map((run.log.events ?? []).flatMap(item => item.evidence ?? []).map(item => [item.evidence_id, item]));
  for (const evidence of event.evidence ?? []) {
    await validateEvidenceEntry(path.resolve(runRoot), evidence, ids);
    if (registeredEvidence.has(evidence.evidence_id)) throw consistencyError(`证据 ID 重复：${evidence.evidence_id}`);
    registeredEvidence.set(evidence.evidence_id, evidence);
  }
  if (event.type === "checkpoint_result" && event.evidence_refs !== undefined) {
    if (!Array.isArray(event.evidence_refs) || new Set(event.evidence_refs).size !== event.evidence_refs.length) throw consistencyError("checkpoint_result.evidence_refs 必须是无重复字符串数组");
    for (const evidenceId of event.evidence_refs) {
      const evidence = registeredEvidence.get(evidenceId);
      if (!evidence) throw consistencyError(`检查点引用未注册证据：${evidenceId}`);
      if (!evidence.checkpoint_ids.includes(event.checkpoint_id)) throw consistencyError(`证据 ${evidenceId} 不支持检查点 ${event.checkpoint_id}`);
    }
  }
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
    checkpoint.evidence_refs = [...new Set([
      ...(event.evidence_refs ?? []),
      ...(event.evidence ?? []).map(item => item.evidence_id)
    ])];
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

export async function linkRetake(runRoot, parentRunRoot) {
  const currentRoot = path.resolve(runRoot);
  const selectedParentRoot = path.resolve(parentRunRoot);
  if (path.dirname(currentRoot) !== path.dirname(selectedParentRoot) || currentRoot === selectedParentRoot) {
    throw consistencyError("补测与父轮必须属于同一工作区且不能指向自身");
  }
  const current = await loadRun(currentRoot);
  if (workflowProfile(current.log) !== permissionWorkflowProfileV3) {
    throw consistencyError("跨轮补测需要新建 v3 Run");
  }
  await validateRun(selectedParentRoot);
  const parent = await loadRun(selectedParentRoot);
  if (parent.log.run.status !== "completed") throw consistencyError("补测父轮尚未结束");
  const rootId = retakeEvent(parent.log)?.root_run_id ?? parent.log.run.run_id;
  const original = await loadRun(path.join(path.dirname(currentRoot), rootId));
  if (!sameCase(original.testCases.suite, current.testCases.suite)
    || current.testCases.cases.some(testCase => !original.testCases.cases.some(item =>
      item.case_id === testCase.case_id && sameCase(item, testCase)))) {
    throw consistencyError("补测用例语义或预期与根快照不兼容");
  }
  return recordEvent(currentRoot, { type: "retake_link", parent_run_id: parent.log.run.run_id,
    parent_log_sha256: parent.logHash, root_run_id: rootId,
    root_snapshot_sha256: original.snapshotHash,
    case_ids: current.testCases.cases.map(item => item.case_id) });
}

export async function beginActivity(runRoot) {
  return recordEvent(runRoot, { type: "activity_start" });
}

export async function endActivity(runRoot) {
  return recordEvent(runRoot, { type: "activity_end" });
}

export async function completeActivity(runRoot) {
  return recordEvent(runRoot, { type: "activity_complete" });
}

export async function archiveScreenshot(runRoot, options) {
  const event = structuredClone(options.event);
  assertNoSecrets(event);
  const run = await loadRun(path.resolve(runRoot));
  if (event?.type !== "evidence_capture" || event.outcome !== "captured" || event.evidence?.length !== 1 || event.evidence[0].kind !== "screenshot") {
    throw consistencyError("截图归档需要一个成功的 evidence_capture 和一份 screenshot 证据");
  }
  validatePermissionEvent(run.testCases, run.log, event);
  const entry = event.evidence[0];
  if (run.log.events.some(item => item.evidence?.some(previous => previous.evidence_id === entry.evidence_id))) throw consistencyError("证据 ID 重复");
  const source = await readScreenshotSource(options);
  entry.sha256 = source.sha256;
  entry.capture_source = source.capture_source;
  const destination = await writeScreenshotExclusive(runRoot, entry.path, source);
  try {
    const result = await recordEvent(runRoot, event);
    return { ...result, evidencePath: entry.path, sha256: entry.sha256 };
  } catch (error) {
    // Only this call's exclusively created file may be removed on rejection.
    await rm(destination, { force: true });
    throw error;
  }
}

export async function resumeCheck(runRoot) {
  await validateRun(runRoot, { checkReport: false });
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
  if (permissionWorkflowProfiles.includes(workflowProfile(log))) {
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

function reportDelivery(log) {
  const final = log.run.status === "completed";
  const early = final && log.events.some(event => event.type === "assistance" && event.phase === "stop_run" && event.decision_source === "user");
  return { kind: final ? (early ? "early_end" : "final") : "stage", automaticallyPresent: final,
    label: final ? (early ? "用户明确提前结束，未完成范围见报告" : "本轮测试已明确结束") : "阶段记录，测试尚未结束；默认仅内部保存" };
}

async function linkedRetakes(rootRunRoot) {
  const root = await loadRun(rootRunRoot);
  const runsRoot = path.dirname(rootRunRoot);
  const candidates = [];
  for (const entry of await readdir(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === root.log.run.run_id) continue;
    const directory = path.join(runsRoot, entry.name);
    let candidate;
    try { candidate = await loadRun(directory); }
    catch (error) { if (error.code === "ENOENT" || error instanceof SyntaxError) continue; throw error; }
    if (retakeEvent(candidate.log)?.root_run_id !== root.log.run.run_id) continue;
    await validateRun(directory);
    candidates.push({ directory, ...candidate, link: retakeEvent(candidate.log) });
  }
  const byId = new Map(candidates.map(item => [item.log.run.run_id, item]));
  const depth = item => {
    let current = item;
    let count = 0;
    const seen = new Set();
    while (current.link.parent_run_id !== root.log.run.run_id) {
      if (seen.has(current.log.run.run_id)) throw consistencyError("补测关联形成环");
      seen.add(current.log.run.run_id);
      current = byId.get(current.link.parent_run_id);
      if (!current) throw consistencyError("补测父轮缺失");
      count += 1;
    }
    return count;
  };
  candidates.sort((a, b) => depth(a) - depth(b) || a.log.run.run_id.localeCompare(b.log.run.run_id));
  const ownerByCase = new Map();
  for (const item of candidates) {
    for (const testCase of item.testCases.cases) {
      const prior = ownerByCase.get(testCase.case_id);
      if (prior) {
        let parentId = item.link.parent_run_id;
        while (parentId !== root.log.run.run_id && parentId !== prior) {
          parentId = byId.get(parentId)?.link.parent_run_id;
          if (!parentId) throw consistencyError("补测父轮缺失");
        }
        if (parentId !== prior) throw consistencyError(`用例 ${testCase.case_id} 存在无法排序的补测候选`);
      }
      ownerByCase.set(testCase.case_id, item.log.run.run_id);
    }
  }
  return candidates;
}

async function generateAggregateReport(rootRunRoot, retakes) {
  await validateRun(rootRunRoot);
  const root = await loadRun(rootRunRoot);
  const sources = [{ directory: rootRunRoot, ...root }, ...retakes];
  const models = retakes.map(item => ({ runId: item.log.run.run_id,
    model: buildReportModel(item.testCases, item.log) }));
  let model;
  try { model = mergeRetakeModels(buildReportModel(root.testCases, root.log), models); }
  catch (error) { throw consistencyError(error.message); }
  model.run.durations = deriveActivityDurations(sources.map(item => item.log));
  model.overview.execution_duration = model.run.durations.execution_label;
  model.overview.waiting_duration = model.run.durations.waiting_label;
  model.case_details = model.case_details.map(detail => ({
    ...detail, source_run_id: detail.source_run_id ?? root.log.run.run_id,
    source_kind: detail.source_kind ?? "原轮"
  }));
  const selection = Object.fromEntries(model.case_details.map(detail => [detail.case_id, detail.source_run_id]));
  const sourceHashes = sources.map(item => ({ run_id: item.log.run.run_id,
    snapshot_sha256: item.snapshotHash, log_sha256: item.logHash }));
  const manifest = { version: "1.0", root_run_id: root.log.run.run_id,
    root_snapshot_sha256: root.snapshotHash, source_runs: sourceHashes, selected_case_run: selection };
  const reportId = digest(JSON.stringify(manifest));
  const reportsRoot = path.join(path.dirname(rootRunRoot), "..", "b2b-e2e-reports");
  const reportDirectory = path.join(reportsRoot, reportId);
  const tempDirectory = `${reportDirectory}.tmp-${crypto.randomUUID()}`;
  const sourceById = new Map(sources.map(item => [item.log.run.run_id, item]));
  try {
    await mkdir(reportsRoot, { recursive: true });
    await mkdir(tempDirectory, { recursive: false, mode: 0o700 });
    for (const detail of model.case_details) {
      for (const step of detail.steps) for (const expected of step.expected) for (const evidence of expected.evidence) {
        if (!evidence.path) continue;
        const source = sourceById.get(detail.source_run_id);
        const original = resolveEvidencePath(source.directory, evidence.path);
        const rewritten = path.join("evidence", detail.source_run_id, path.relative("evidence", evidence.path));
        const target = path.join(tempDirectory, rewritten);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(original, target);
        if (digest(await readFile(original)) !== digest(await readFile(target))) throw consistencyError("汇总证据复制后摘要不一致");
        evidence.path = rewritten;
      }
    }
    assertNoSecrets(model);
    const html = buildHtmlReport(model);
    const chatTableMarkdown = renderChatTableMarkdown(model);
    assertNoSecrets(html);
    assertNoSecrets(chatTableMarkdown);
    await writeTextAtomic(path.join(tempDirectory, "report.html"), html);
    await writeJsonAtomic(path.join(tempDirectory, "manifest.json"), manifest);
    try { await rename(tempDirectory, reportDirectory); }
    catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
      await rm(tempDirectory, { recursive: true, force: true });
    }
    const persisted = await readFile(path.join(reportDirectory, "report.html"), "utf8");
    if (persisted !== html) throw consistencyError("汇总报告与已验证来源不一致");
    const persistedManifest = JSON.parse(await readFile(path.join(reportDirectory, "manifest.json"), "utf8"));
    if (JSON.stringify(persistedManifest) !== JSON.stringify(manifest)) throw consistencyError("汇总清单被修改");
    for (const detail of model.case_details) {
      for (const step of detail.steps) for (const expected of step.expected) for (const evidence of expected.evidence) {
        if (!evidence.path) continue;
        const source = sourceById.get(detail.source_run_id);
        const original = resolveEvidencePath(source.directory,
          path.join("evidence", path.relative(path.join("evidence", detail.source_run_id), evidence.path)));
        const target = path.join(reportDirectory, evidence.path);
        if (digest(await readFile(original)) !== digest(await readFile(target))) {
          throw consistencyError("汇总证据与来源不一致");
        }
      }
    }
    for (const item of sources) {
      if (digest(await readFile(item.logPath)) !== item.logHash) throw consistencyError("汇总期间原轮或补测账本发生变化");
    }
    return { deliverable: true, reportFormat: "html-only-v1",
      reportPath: path.join(reportDirectory, "report.html"), htmlReportPath: path.join(reportDirectory, "report.html"),
      chatTableMarkdown, snapshotHash: root.snapshotHash, counts: model.counts,
      runId: root.log.run.run_id, sourceRuns: sourceHashes, delivery: reportDelivery(root.log) };
  } catch (error) {
    await rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function deliverReport(runRoot, { stageRequested = false } = {}) {
  await validateRun(runRoot, { checkReport: false });
  const selected = await loadRun(path.resolve(runRoot));
  const { log } = selected;
  const delivery = reportDelivery(log);
  if (!delivery.automaticallyPresent && !stageRequested) {
    return { deliverable: false, runId: log.run.run_id, delivery,
      nextAction: "仅说明当前进度、阻塞与需要用户完成的动作；继续保存内部阶段产物" };
  }
  const rootId = retakeEvent(log)?.root_run_id ?? log.run.run_id;
  const rootRunRoot = path.join(path.dirname(path.resolve(runRoot)), rootId);
  const retakes = await linkedRetakes(rootRunRoot);
  if (retakes.length) {
    if (retakes.some(item => item.log.run.status !== "completed")) return { deliverable: false,
      runId: rootId, nextAction: "关联补测仍在进行；完成或明确结束后再交付全范围报告" };
    return generateAggregateReport(rootRunRoot, retakes);
  }
  return { deliverable: true, ...await generateReport(runRoot) };
}

export async function generateReport(runRoot) {
  await validateRun(runRoot, { checkReport: false });
  const loaded = await loadRun(path.resolve(runRoot));
  const { testCases, log } = loaded;
  const model = buildReportModel(testCases, log);
  assertNoSecrets(model);
  const generated = buildReport(testCases, log);
  const html = buildHtmlReport(model);
  const chatTableMarkdown = renderChatTableMarkdown(model);
  assertNoSecrets(generated.markdown);
  assertNoSecrets(html);
  assertNoSecrets(chatTableMarkdown);
  const reportPath = path.join(path.resolve(runRoot), "report.md");
  const htmlReportPath = path.join(path.resolve(runRoot), "report.html");
  const profile = workflowProfile(log);
  if ([permissionWorkflowProfileV2, permissionWorkflowProfileV3].includes(profile)) {
    await writeTextAtomic(htmlReportPath, html);
  } else {
    await writeTextAtomic(reportPath, generated.markdown);
    await writeTextAtomic(htmlReportPath, html);
  }
  const writtenHtml = await readFile(htmlReportPath, "utf8");
  const latestLog = await readFile(loaded.logPath);
  if (![permissionWorkflowProfileV2, permissionWorkflowProfileV3].includes(profile)) {
    const writtenMarkdown = await readFile(reportPath, "utf8");
    assertNoSecrets(writtenMarkdown);
    if (writtenMarkdown !== generated.markdown) throw consistencyError("报告写入后内容校验失败");
  }
  assertNoSecrets(writtenHtml);
  if (writtenHtml !== html) throw consistencyError("报告写入后内容校验失败");
  if (digest(latestLog) !== loaded.logHash) throw consistencyError("报告生成期间执行日志发生变化，拒绝交付过期报告");
  await validateRun(runRoot);
  if ([permissionWorkflowProfileV2, permissionWorkflowProfileV3].includes(profile)) {
    return {
      reportFormat: "html-only-v1",
      reportPath: htmlReportPath,
      htmlReportPath,
      chatTableMarkdown,
      snapshotHash: loaded.snapshotHash,
      eventCount: log.events.length,
      lastSequence: log.events.at(-1)?.sequence ?? 0,
      delivery: reportDelivery(log),
      counts: generated.counts,
      runId: log.run.run_id
    };
  }
  return { reportPath, htmlReportPath, counts: generated.counts, runId: log.run.run_id, delivery: reportDelivery(log) };
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
    result = await initializeRun({
      workspaceRoot: options.workspace,
      casesPath: options.cases,
      workflowProfile: options["workflow-profile"],
      mockFallback: options["mock-fallback"]
    });
  } else if (command === "init-g") {
    if (options["workflow-profile"] !== permissionWorkflowProfileV3) {
      throw runnerError("INPUT_CONTRACT", "init-g 必须使用 permission-batches-html-v3");
    }
    if (!options.suite) throw runnerError("INPUT_CONTRACT", "init-g 需要已确认的 suite JSON");
    let suite;
    try { suite = JSON.parse(await readFile(options.suite, "utf8")); }
    catch (error) {
      if (error instanceof SyntaxError) throw runnerError("INPUT_CONTRACT", "suite 不是合法 JSON");
      throw error;
    }
    const casesInput = await loadGCaseDocumentHandoff({
      caseManifestPath: options["case-manifest"], planManifestPath: options["plan-manifest"],
      gCompilerPath: options["g-compiler"], suite
    });
    result = await initializeRun({ workspaceRoot: options.workspace, casesInput,
      workflowProfile: options["workflow-profile"] });
  } else if (command === "record") {
    const event = JSON.parse(await readFile(options.event, "utf8"));
    if (["activity_start", "activity_end", "activity_complete"].includes(event.type)) {
      throw runnerError("INPUT_CONTRACT", "活动时间由 activity-start、activity-end、activity-complete 命令记录");
    }
    result = await recordEvent(options.run, event);
  } else if (command === "activity-start") {
    result = await beginActivity(options.run);
  } else if (command === "activity-end") {
    result = await endActivity(options.run);
  } else if (command === "activity-complete") {
    result = await completeActivity(options.run);
  } else if (command === "link-retake") {
    result = await linkRetake(options.run, options.parent);
  } else if (command === "resume-check") {
    result = await resumeCheck(options.run);
  } else if (command === "validate") {
    result = await validateRun(options.run);
  } else if (command === "report") {
    result = await generateReport(options.run);
  } else if (command === "deliver") {
    if (options.stage !== undefined && options.stage !== "requested") throw runnerError("INPUT_CONTRACT", "阶段交付只接受 --stage requested（用户明确要求阶段结果）");
    result = await deliverReport(options.run, { stageRequested: options.stage === "requested" });
  } else if (command === "archive-screenshot") {
    const event = JSON.parse(await readFile(options.event, "utf8"));
    let returned = {};
    if (options["image-stdin"] === "true") {
      const chunks = [];
      let length = 0;
      for await (const chunk of process.stdin) {
        length += chunk.length;
        if (length > 36 * 1024 * 1024) throw runnerError("INPUT_CONTRACT", "图片输入超过归档上限");
        chunks.push(chunk);
      }
      returned = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    result = await archiveScreenshot(options.run, { event, sourcePath: options.source, allowedSourceRoot: options["source-root"], imageBase64: returned.data, mimeType: returned.mimeType });
  } else {
    throw runnerError("INPUT_CONTRACT", "命令必须是 init、init-g、record、resume-check、validate、report、deliver、link-retake、activity-start、activity-end、activity-complete 或 archive-screenshot");
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
