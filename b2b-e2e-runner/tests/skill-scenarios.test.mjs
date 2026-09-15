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

test("AC-01/02: MCP is repaired before user intervention and never falls back", async () => {
  const [skill, workflow] = await sources();
  assert.equal(skill.indexOf("自动安装、启用或恢复") < skill.indexOf("Execution preflight"), true);
  for (const phrase of [
    "工具缺失时先使用当前环境支持的机制自动安装并启用",
    "已安装但不可用时先执行安全、可判断的恢复",
    "已观察事实、已尝试动作和用户唯一需要完成的动作",
    "安装成功但当前进程必须重启"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
  assert.equal(skill.includes("If it is missing or unusable, stop"), false);
  assert.equal(workflow.includes("不得换用其他浏览器工具"), true);
});

test("AC-03/04: Chrome and the test page are prepared automatically", async () => {
  const [skill, workflow] = await sources();
  for (const phrase of [
    "Chrome 已安装但未运行时自动启动",
    "没有可操作页面时自动创建测试标签页",
    "只有确认 Chrome 缺失或系统阻止自动启动"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
  assert.equal(skill.indexOf("自动准备 Chrome") < skill.indexOf("Execution preflight"), true);
  assert.equal(workflow.includes("不得要求用户提供调试端口或 `targetId`"), true);
});

test("AC-05/06/07/08: role coverage gates Run initialization and follow-ups ask only for gaps", async () => {
  const [, workflow, resultModel] = await sources();
  assert.equal(workflow.includes("本次需要的角色/权限 | 受影响用例 | 账号 | 密码状态 | 当前权限 | 权限如何申请或切换 | 状态"), true);
  for (const phrase of [
    "一个账号都未提供时不得初始化正式 Run",
    "只追问仍缺失的字段",
    "用户明确某个角色无法提供",
    "至少一个所需角色可执行",
    "验证码、MFA、扫码、SSO、账号锁定或未知登录流程实际出现后"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
  assert.equal(resultModel.includes("缺失角色相关检查点为 `undetermined`"), true);
});

test("AC-09/10: proxy decision is the only preflight proxy input and incomplete rules stay gated", async () => {
  const [skill, workflow] = await sources();
  assert.equal(workflow.includes("是否需要代理 | 匹配范围 | 请求修改 | 响应修改 | 作用页面"), true);
  for (const phrase of [
    "选择“不需要”后不再询问规则，也不启动代理",
    "选择“需要”后只追问不完整的规则字段",
    "仅当前测试页面",
    "代理效果、页面隔离、刷新或导航和停止恢复都不是执行前确认项"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
  assert.equal(skill.includes("Execution preflight asks the user only for account/permission coverage and the proxy decision/rules."), true);
});

test("AC-14/15/16/17: delivery contains the canonical full table and proxy-only automatic cleanup", async () => {
  const [skill, workflow, resultModel, proxy] = await sources();
  for (const phrase of [
    "默认环境清理只包括本 Run 的代理",
    "无需用户确认",
    "不得默认关闭标签页",
    "用例明确声明的业务副作用清理"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
  assert.equal(proxy.includes("不得释放其他 Run 的锁"), true);
  assert.equal(skill.includes("copy the complete five-column table from the validated report into the final reply"), true);
  assert.equal(resultModel.includes("报告链接不能替代对话内全量表格"), true);
  assert.equal(resultModel.includes("ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因"), true);
  assert.equal(workflow.includes("密码状态只能显示“已提供”或“待提供”"), true);
  assert.equal(workflow.includes("最终回复不得回显密码"), true);
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
