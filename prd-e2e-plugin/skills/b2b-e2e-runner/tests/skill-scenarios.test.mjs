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
    readFile(path.join(skillRoot, "references/proxy-protocol.md"), "utf8"),
    readFile(path.join(skillRoot, "references/artifact-contract.md"), "utf8"),
    readFile(path.join(skillRoot, "references/security-and-evidence.md"), "utf8")
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

test("PBH AC-01/03/04/05/30/32: role requirements are classified without fixed names, counts, or account mapping", async () => {
  const [, workflow, resultModel] = await sources();
  assert.equal(workflow.includes("所需角色 | 对应权限 | 受影响用例 | 对应账号 | 密码状态 | 当前准备情况"), true);
  for (const phrase of [
    "已就绪 / 待用户准备 / 无法提供 / 待说明",
    "没有任何已就绪权限组时不得初始化正式 Run",
    "只追问仍未明确的分类或当前批次实际缺失的登录字段",
    "全部权限均明确无法提供",
    "角色、权限组和账号不要求一一对应",
    "不预设角色名称、组数或账号数量上限"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
  assert.equal(workflow.includes("其余角色明确无法提供"), false);
  assert.equal(workflow.includes("权限如何申请或切换 | 状态"), false);
  assert.equal(resultModel.includes("待用户准备"), true);
  assert.equal(resultModel.includes("明确无法提供"), true);
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

test("PBH AC-08/09/10/12/14/15/16/31: waiting and resume loop is contextual, repeatable, and never automates permission work", async () => {
  const [skill, workflow, , proxy, artifact] = await sources();
  for (const phrase of [
    "先完成所有当前已就绪且可执行的工作",
    "每批结束或准备状态更新后重新计算剩余工作",
    "不限定等待次数或批次数",
    "自然语言",
    "一次说明多个权限组",
    "实际核验",
    "原 Run",
    "不得创建轮询、定时任务"
  ]) assert.equal(`${skill}\n${workflow}`.includes(phrase), true, phrase);
  assert.equal(proxy.includes("进入 `awaiting_user` 前"), true);
  assert.equal(artifact.includes("permission_plan"), true);
  assert.equal(artifact.includes("permission_availability"), true);
  assert.equal(artifact.includes("permission_wait"), true);
  assert.equal(artifact.includes("resume_check"), true);
});

test("v2 AC-02/03/24: HTML is the only persisted report and dialogue keeps the same-model full table", async () => {
  const [skill, workflow, resultModel, proxy, artifact] = await sources();
  for (const phrase of [
    "默认环境清理只包括本 Run 的代理",
    "无需用户确认",
    "不得默认关闭标签页",
    "用例明确声明的业务副作用清理"
  ]) assert.equal(workflow.includes(phrase), true, phrase);
  assert.equal(proxy.includes("不得释放其他 Run 的锁"), true);
  assert.equal(skill.includes("chatTableMarkdown"), true);
  assert.equal(resultModel.includes("报告链接不能替代对话内全量表格"), true);
  assert.equal(resultModel.includes("ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因"), true);
  assert.equal(resultModel.includes("report.html"), true);
  assert.equal(resultModel.includes("`reportPath` 和 `htmlReportPath` 均指向 `report.html`"), true);
  assert.equal(workflow.includes("新版不生成 `report.md`"), true);
  assert.equal(artifact.includes("`reportFormat: \"html-only-v1\"`"), true);
  assert.equal(artifact.includes("`chatTableMarkdown`"), true);
  assert.equal(artifact.includes("历史 v1"), true);
  assert.equal(workflow.includes("密码状态只能显示“已提供”或“待提供”"), true);
  assert.equal(workflow.includes("最终回复不得回显密码"), true);
});

test("v2 AC-11/12/29/30: report instructions require escaping, local evidence boundaries, secret blocking, and profile-aware rebuild", async () => {
  const [, , , , artifact, security] = await sources();
  for (const phrase of ["动态文本统一转义", "禁止外部脚本", "普通图片", "符号链接", "HTML 编码不能替代秘密扫描"]) {
    assert.equal(security.includes(phrase), true, phrase);
  }
  for (const phrase of ["reportPath", "htmlReportPath", "reportFormat", "重新生成 `report.html`", "无 profile 的历史 Run"]) {
    assert.equal(artifact.includes(phrase), true, phrase);
  }
});

test("v2 AC-13..17: instructions require real critical screenshots and honest request-detail capability limits", async () => {
  const [skill, workflow, , , artifact, security] = await sources();
  const combined = `${skill}\n${workflow}\n${artifact}\n${security}`;
  for (const phrase of [
    "包括通过项",
    "真实请求详情",
    "普通页面截图不能代替请求详情截图",
    "captured` / `failed` / `unavailable",
    "不得生成或重绘替代图片",
    "证据状态与产品结果分开"
  ]) assert.equal(combined.includes(phrase), true, phrase);
});

test("v2 AC-18..28: instructions separate readiness, execution context, assistance lifecycle, and same-Run recovery", async () => {
  const [skill, workflow, resultModel, , artifact] = await sources();
  const combined = `${skill}\n${workflow}\n${resultModel}\n${artifact}`;
  for (const phrase of [
    "`verification_scope` 固定为 `execution_context`",
    "被测权限行为",
    "assistance_id",
    "required_user_action",
    "开放协作",
    "只暂停真正依赖",
    "同 Run",
    "不自动重放"
  ]) assert.equal(combined.includes(phrase), true, phrase);
});

test("v2 AC-33..41: workflow routes information gaps through fact-led exploration without fixed scenario branches", async () => {
  const [, workflow, resultModel, , artifact] = await sources();
  const combined = `${workflow}\n${resultModel}\n${artifact}`;
  for (const phrase of [
    "具体缺少的事实",
    "一次无结果不等于",
    "不新增通用固定尝试次数",
    "不能替换原指定样本",
    "只暂停真正依赖",
    "exploration_summary",
    "exploration_ref",
    "not_attempted_reason",
    "cannot_continue_reason"
  ]) assert.equal(combined.includes(phrase), true, phrase);
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
