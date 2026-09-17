import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent, resumeCheck, validateRun } from "../scripts/run-artifacts.mjs";
import { buildReportModel } from "../scripts/lib/report-model.mjs";

async function casesFile(root) {
  const file = path.join(root, "cases.json");
  await writeFile(file, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "双报告套件", target_urls: ["https://staging.example.test"] },
    cases: [
      { case_id: "HTML-PASS", module: "订单", title: "通过场景", preconditions: ["已经登录"], steps: [{ step_id: "s", action: "查看订单", expected: [{ oracle_id: "o", text: "显示订单" }] }] },
      { case_id: "HTML-FAIL", module: "财务", title: "失败场景", preconditions: [], steps: [{ step_id: "s", action: "查看账单", expected: [{ oracle_id: "o", text: "拒绝访问" }] }] },
      { case_id: "HTML-WAIT-这是一个很长很长的标识符-001", module: "审计", title: "等待用户准备权限的长中文场景", preconditions: [], steps: [{ step_id: "s", action: "查看审计", expected: [{ oracle_id: "o", text: "显示审计记录" }] }] },
      { case_id: "HTML-SKIP", module: "范围", title: "预先排除场景", excluded: true, preconditions: [], steps: [{ step_id: "s", action: "不执行", expected: [{ oracle_id: "o", text: "无" }] }] }
    ]
  }));
  return file;
}

async function preparedRun(root, { legacy = false } = {}) {
  const run = await initializeRun({
    workspaceRoot: root,
    casesPath: await casesFile(root),
    workflowProfile: legacy ? undefined : "permission-batches-html-v1"
  });
  if (legacy) return run;
  await recordEvent(run.runRoot, {
    type: "permission_plan", version: "1.0", role_independent_case_ids: [], groups: [
      { group_id: "g-pass", role_text: "订单查看人", permissions: ["查看订单"], case_ids: ["HTML-PASS"], checkpoint_ids: ["HTML-PASS/s/o"], availability: "ready", account_ref: "acct-1", preparation_owner: null, declaration: "用户确认可用" },
      { group_id: "g-fail", role_text: "账单查看人", permissions: ["查看账单"], case_ids: ["HTML-FAIL"], checkpoint_ids: ["HTML-FAIL/s/o"], availability: "ready", account_ref: "acct-2", preparation_owner: null, declaration: "用户确认可用" },
      { group_id: "g-wait", role_text: "审计查看人", permissions: ["查看审计"], case_ids: ["HTML-WAIT-这是一个很长很长的标识符-001"], checkpoint_ids: ["HTML-WAIT-这是一个很长很长的标识符-001/s/o"], availability: "user_preparation_required", account_ref: null, preparation_owner: "user", declaration: "用户稍后自行准备" },
      { group_id: "g-skip", role_text: "范围管理员", permissions: ["范围外能力"], case_ids: ["HTML-SKIP"], checkpoint_ids: ["HTML-SKIP/s/o"], availability: "unavailable", account_ref: null, preparation_owner: "user", declaration: "用户明确无法提供" }
    ]
  });
  for (const [group_id, account_ref, role] of [["g-pass", "acct-1", "订单查看人"], ["g-fail", "acct-2", "账单查看人"]]) {
    await recordEvent(run.runRoot, { type: "role_observation", observation: { group_id, account_ref, role, verification: "verified", description: `页面显示${role}权限` } });
  }
  for (const [caseId, result, reason] of [
    ["HTML-PASS", "passed", "订单详情页显示订单号 ORD-42，满足原检查点"],
    ["HTML-FAIL", "failed", "期望拒绝访问，实际账单页返回数据并显示金额"]
  ]) {
    await recordEvent(run.runRoot, { type: "case_started", case_id: caseId });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: `${caseId}/s/o` });
    await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: `${caseId}/s/o`, result, reason, observation: reason, evidence_status: "not_required" });
  }
  await recordEvent(run.runRoot, { type: "permission_batch", group_id: "g-wait", phase: "waiting", description: "当前无其他就绪工作，等待审计权限" });
  await recordEvent(run.runRoot, { type: "permission_wait", group_id: "g-wait", checkpoint_ids: ["HTML-WAIT-这是一个很长很长的标识符-001/s/o"], reason: "等待用户自行准备审计查看权限" });
  await recordEvent(run.runRoot, { type: "cleanup_state", cleanup: { attempted: true, completed: true, items: [{ item: "本 Run 代理", observation: "未使用代理", succeeded: true }] } });
  await recordEvent(run.runRoot, { type: "run_state", status: "awaiting_user" });
  return run;
}

test("AC-19/20/21: Markdown and HTML use one ordered row/count model and expose the additive HTML path", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-html-"));
  try {
    const run = await preparedRun(root);
    const generated = await generateReport(run.runRoot);
    assert.equal(generated.reportPath, path.join(run.runRoot, "report.md"));
    assert.equal(generated.htmlReportPath, path.join(run.runRoot, "report.html"));
    assert.deepEqual(generated.counts, { passed: 1, failed: 1, undetermined: 1, not_executed: 1 });

    const [snapshot, log, markdown, html] = await Promise.all([
      readFile(path.join(run.runRoot, "test-cases.json"), "utf8").then(JSON.parse),
      readFile(path.join(run.runRoot, "execution-log.json"), "utf8").then(JSON.parse),
      readFile(generated.reportPath, "utf8"),
      readFile(generated.htmlReportPath, "utf8")
    ]);
    const model = buildReportModel(snapshot, log);
    assert.deepEqual(model.rows.map(row => row.case_id), ["HTML-PASS", "HTML-FAIL", "HTML-WAIT-这是一个很长很长的标识符-001", "HTML-SKIP"]);
    assert.deepEqual(model.counts, generated.counts);
    assert.equal(model.permission.groups.find(group => group.group_id === "g-pass").verification, "verified", "completed work keeps its historical verified observation");
    for (const row of model.rows) {
      assert.equal(markdown.includes(row.case_id), true, row.case_id);
      assert.equal(html.includes(row.case_id), true, row.case_id);
      assert.equal(html.includes(row.reason), true, row.reason);
    }
    for (const expected of ["未完成，等待用户准备权限", "用例详情", "权限准备与执行批次", "关键执行记录", "一致性及证据说明", "Content-Security-Policy"]) {
      assert.equal(html.includes(expected), true, expected);
    }
    assert.equal(html.includes("<h4>"), false, "the report must not skip from h2 to h4 in case details");
    assert.equal(html.includes("<h3>原前置条件</h3>"), true);
    for (const expected of ["准备=已就绪", "准备=待用户准备", "准备=无法提供", "核验=已核验", "核验=未核验"]) {
      assert.equal(markdown.includes(expected), true, expected);
    }
    for (const expected of ["本次不需要代理", "清理已完成", "4 个检查点不需要额外证据"]) {
      assert.equal(markdown.includes(expected), true, expected);
    }
    for (const machineDetail of ["not_required", '"attempted"', '"completed"', '"succeeded"']) {
      assert.equal(markdown.includes(machineDetail), false, `Markdown must not expose ${machineDetail}`);
    }
    for (const expected of [">已就绪<", ">待用户准备<", ">无法提供<", ">已核验<", ">未核验<"]) {
      assert.equal(html.includes(expected), true, expected);
    }
    for (const expected of ["本次不需要代理", "清理已完成", "执行记录完整", "不需要额外证据"]) {
      assert.equal(html.includes(expected), true, expected);
    }
    for (const machineDetail of ["<pre", "cleanup_state", "permission_wait", "not_required", "&quot;attempted&quot;", "&quot;succeeded&quot;"]) {
      assert.equal(html.includes(machineDetail), false, `HTML must not expose ${machineDetail}`);
    }
    for (const internalGroupId of ["g-pass", "g-fail", "g-wait", "g-skip"]) {
      assert.equal(html.includes(internalGroupId), false, `HTML must not expose internal permission group ID ${internalGroupId}`);
    }
    assert.match(html, /<td>本 Run 代理<\/td><td>未使用代理<\/td><td>已完成<\/td>/, "cleanup actions use completion language");
    assert.match(html, /<td>影响范围<\/td><td>没有页面受到代理影响<\/td><td>未启用<\/td>/, "proxy scope separates observation from conclusion");
    assert.match(html, /<td>停止后恢复<\/td><td>本次未启用代理，不需要恢复原始行为<\/td><td>无需恢复<\/td>/, "no-proxy restoration is explained once");
    assert.equal(html.includes(log.test_cases.sha256), false, "the human report must not expose the raw snapshot digest");
    assert.equal(html.includes("overflow-x:hidden"), true, "wide report sections must not create document-level horizontal scrolling");
    assert.equal(/<script\b/i.test(html), false);
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("HTML turns machine events into a semantic timeline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-semantic-"));
  try {
    const run = await preparedRun(root);
    await generateReport(run.runRoot);
    await resumeCheck(run.runRoot);
    await recordEvent(run.runRoot, {
      type: "mcp_preflight",
      status: "available",
      description: "Chrome DevTools MCP 已实际调用"
    });
    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");

    for (const expected of [
      "浏览器连接检查",
      "恢复检查",
      "继续执行前需要重新核验页面、账号权限和代理状态"
    ]) assert.equal(html.includes(expected), true, expected);
    assert.match(html, /\d{4}年\d{2}月\d{2}日 \d{2}:\d{2}:\d{2}（UTC）/, "visible event times use a readable Chinese format");
    assert.match(html, /<strong>开始 \/ 完成<\/strong><br>\d{4}年\d{2}月\d{2}日/, "run times use the same readable format");
    for (const machineDetail of ["mcp_preflight", "resume_check", "cleanup_state", "permission_wait", "<pre"]) {
      assert.equal(html.includes(machineDetail), false, `HTML must not expose ${machineDetail}`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("HTML describes proxy scope, verification, and restoration without exposing proxy internals", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-proxy-semantic-"));
  try {
    const run = await preparedRun(root);
    await recordEvent(run.runRoot, {
      type: "proxy_state",
      proxy: {
        required: true,
        state: "stopped",
        target_id: "TARGET-INTERNAL-01",
        verifications: [
          { item: "请求改写", observation: "服务器回显测试请求已按规则修改", succeeded: true },
          { item: "页面隔离", observation: "另一测试页面仍返回原始响应", succeeded: true }
        ],
        cleanup: { attempted: true, succeeded: true, reason: "代理停止后页面恢复原始响应" }
      }
    });
    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");

    for (const expected of [
      "服务器回显测试请求已按规则修改",
      "另一测试页面仍返回原始响应",
      "单个测试页面",
      "原始行为已恢复"
    ]) assert.equal(html.includes(expected), true, expected);
    for (const machineDetail of [
      "proxy_state",
      "TARGET-INTERNAL-01",
      "&quot;required&quot;",
      "&quot;succeeded&quot;",
      "<pre"
    ]) assert.equal(html.includes(machineDetail), false, `HTML must not expose ${machineDetail}`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AC-24: a missing, stale, or tampered half of a new-profile report pair fails and regeneration repairs both", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-pair-"));
  try {
    const run = await preparedRun(root);
    const generated = await generateReport(run.runRoot);
    await writeFile(generated.htmlReportPath, "<!doctype html><p>tampered</p>");
    await assert.rejects(validateRun(run.runRoot), error => error.code === "RUN_CONSISTENCY" && /report\.html/.test(error.message));
    await generateReport(run.runRoot);
    await unlink(generated.reportPath);
    await assert.rejects(validateRun(run.runRoot), error => error.code === "RUN_CONSISTENCY" && /两份报告/.test(error.message));
    await generateReport(run.runRoot);
    await recordEvent(run.runRoot, { type: "assistance", description: "用户尚未准备审计权限" });
    await assert.rejects(validateRun(run.runRoot), error => error.code === "RUN_CONSISTENCY" && /派生结果不一致/.test(error.message));
    await generateReport(run.runRoot);
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AC-25: a legacy Run keeps reportPath semantics and does not require report.html", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-legacy-"));
  try {
    const run = await preparedRun(root, { legacy: true });
    const generated = await generateReport(run.runRoot);
    assert.equal(generated.reportPath, path.join(run.runRoot, "report.md"));
    assert.equal(generated.htmlReportPath, path.join(run.runRoot, "report.html"));
    await unlink(generated.htmlReportPath);
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AC-20: rebuilding after resume and completion replaces the waiting view with the final state", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-stages-"));
  try {
    const run = await preparedRun(root);
    const waiting = await generateReport(run.runRoot);
    assert.match(await readFile(waiting.htmlReportPath, "utf8"), /未完成，等待用户准备权限/);

    await resumeCheck(run.runRoot);
    await recordEvent(run.runRoot, { type: "permission_availability", group_id: "g-wait", availability: "ready", account_ref: "acct-3", declaration: "用户说明审计权限已准备" });
    await recordEvent(run.runRoot, { type: "role_observation", observation: { group_id: "g-wait", account_ref: "acct-3", role: "审计查看人", verification: "verified", description: "页面显示审计查看权限" } });
    await recordEvent(run.runRoot, { type: "run_state", status: "running" });
    await recordEvent(run.runRoot, { type: "case_started", case_id: "HTML-WAIT-这是一个很长很长的标识符-001" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "HTML-WAIT-这是一个很长很长的标识符-001/s/o" });
    await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "HTML-WAIT-这是一个很长很长的标识符-001/s/o", result: "passed", reason: "审计记录可见", observation: "页面显示目标记录", evidence_status: "not_required" });
    await recordEvent(run.runRoot, { type: "run_state", status: "completed" });

    const completed = await generateReport(run.runRoot);
    const html = await readFile(completed.htmlReportPath, "utf8");
    assert.match(html, /四态统计（最终结果）/);
    assert.match(html, /<strong>当前阶段<\/strong><br>已完成/);
    assert.equal(html.includes('<aside class="waiting"'), false);
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally { await rm(root, { recursive: true, force: true }); }
});
