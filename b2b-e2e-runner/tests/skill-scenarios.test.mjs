import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateReport, initializeRun, recordEvent } from "../scripts/run-artifacts.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sources() {
  return Promise.all([
    readFile(path.join(skillRoot, "SKILL.md"), "utf8"),
    readFile(path.join(skillRoot, "references/workflow.md"), "utf8"),
    readFile(path.join(skillRoot, "references/result-model.md"), "utf8"),
    readFile(path.join(skillRoot, "references/proxy-protocol.md"), "utf8")
  ]);
}

async function oneCase(root, expectedTexts) {
  const file = path.join(root, "cases.json");
  await writeFile(file, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "UAT", target_urls: ["https://staging.example.test"] },
    cases: [{
      case_id: "UAT-CASE",
      module: "评测",
      title: "UAT 场景",
      preconditions: [],
      steps: [{
        step_id: "S1",
        action: "观察页面",
        expected: expectedTexts.map((text, index) => ({ oracle_id: `O${index + 1}`, text }))
      }]
    }]
  }));
  return file;
}

test("UAT-01/TASK-07-01..04: MCP gate precedes one dependency confirmation and role isolation", async () => {
  const [skill, workflow] = await sources();
  assert.equal(skill.indexOf("Call Chrome DevTools MCP") < skill.indexOf("一次性确认"), true);
  for (const phrase of ["每个角色的账号/密码", "已有权限", "切换方式", "精确声明式规则"]) {
    assert.equal(workflow.includes(phrase), true, phrase);
  }
  assert.equal(workflow.includes("不得重复询问用例已有的 URL"), true);
  assert.equal(workflow.includes("同一存储上下文内只能串行切换"), true);
  assert.equal(skill.includes("If it is missing or unusable, stop"), true);
  assert.equal((await sources())[2].includes("缺账号"), true);
});

test("UAT-02: strict expected text remains failed when page shows a broader label", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uat-strict-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await oneCase(root, ["评分"]) });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: "UAT-CASE/S1/O1",
      result: "failed",
      reason: "页面字段实际显示“用户评分”，未显示用例要求的“评分”",
      observation: "详情页标签为“用户评分”",
      evidence_status: "complete"
    });
    const report = await generateReport(run.runRoot);
    assert.deepEqual(report.counts, { passed: 0, failed: 1, undetermined: 0, not_executed: 0 });
    assert.equal((await readFile(report.reportPath, "utf8")).includes("用户评分"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("UAT-03/TASK-07-05..06: data exploration and empty-data decision are explicit", async () => {
  const [, workflow] = await sources();
  for (const phrase of [
    "最多 10 个不同结果页",
    "找到后记录稳定记录 ID",
    "接口成功为空、用例未承诺固定数据时",
    "内容检查点无法确定",
    "样本移动可重新寻找"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
});

test("UAT-04: permission layers aggregate menu pass plus direct/data fail to case failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uat-permission-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await oneCase(root, ["菜单隐藏", "直链拒绝", "数据拒绝"]) });
    for (const [oracle, result, reason] of [
      ["O1", "passed", "普通用户页面未显示管理菜单"],
      ["O2", "failed", "普通用户直接访问管理 URL 后页面仍展示管理数据"],
      ["O3", "failed", "管理数据请求返回 200 且响应包含业务记录"]
    ]) await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: `UAT-CASE/S1/${oracle}`, result, reason,
      observation: reason, evidence_status: "complete"
    });
    assert.equal((await generateReport(run.runRoot)).counts.failed, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("UAT-05/TASK-07-07: screenshot failure changes evidence only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "uat-screenshot-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await oneCase(root, ["页面显示成功"]) });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: "UAT-CASE/S1/O1", result: "passed",
      reason: "结构化页面观察确认显示成功；截图写入失败", observation: "页面显示成功",
      evidence_status: "missing"
    });
    assert.equal((await generateReport(run.runRoot)).counts.passed, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("TASK-07-08/10: disconnect recovery and cleanup failure remain independent of product result", async () => {
  const [, workflow, , proxy] = await sources();
  assert.equal(proxy.includes("不能恢复则判 `undetermined`"), true);
  assert.equal(workflow.includes("清理失败记录尝试、原因和残留影响，但不得改写产品结论"), true);
  const root = await mkdtemp(path.join(os.tmpdir(), "uat-cleanup-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await oneCase(root, ["页面显示成功"]) });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: "UAT-CASE/S1/O1", result: "passed",
      reason: "页面显示成功", observation: "页面显示成功", evidence_status: "complete"
    });
    await recordEvent(run.runRoot, {
      type: "cleanup_state",
      cleanup: { attempted: true, completed: false, items: [{ item: "角色恢复", succeeded: false, reason: "测试账号已失效" }] }
    });
    const report = await generateReport(run.runRoot);
    assert.equal(report.counts.passed, 1);
    assert.equal((await readFile(report.reportPath, "utf8")).includes("测试账号已失效"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
