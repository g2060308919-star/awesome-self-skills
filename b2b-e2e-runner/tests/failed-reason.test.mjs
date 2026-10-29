import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { failureExplanationDeliverable, renderFailureExplanation, reproducibleFailure } from "../scripts/lib/failed-explanation.mjs";
import { renderChatTableMarkdown } from "../scripts/lib/report.mjs";
import { generateReport } from "../scripts/run-artifacts.mjs";
import { initializeFixtureRun, recordFixtureEvent } from "./test-helpers.mjs";

test("a failure reason without the three records renders 未记录 and is not deliverable", () => {
  const rendered = renderFailureExplanation("页面没有出现目标文案");
  assert.equal(rendered.deliverable, false);
  assert.match(rendered.text, /实际操作顺序：未记录/);
  assert.match(rendered.text, /预期与页面实际表现：未记录/);
  assert.match(rendered.text, /实际表现和预期的差异：未记录/);
  assert.equal(failureExplanationDeliverable(rendered.text), false);
});

test("chat and HTML show the same failure paragraph outside the collapsed details", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "failed-reason-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "未通过说明", target_urls: ["https://staging.example.test"] },
    cases: [{
      case_id: "FAIL-1", module: "订单", title: "查看发货状态", preconditions: [],
      steps: [{ step_id: "s", action: "打开详情", expected: [{ oracle_id: "o", text: "显示已发货" }] }]
    }]
  }));
  const run = await initializeFixtureRun({ workspaceRoot: root, casesPath });
  const explanation = reproducibleFailure({
    operations: "1. 在搜索框填写订单号 SO-1。2. 点击查询。失败发生在第 2 步观察详情。",
    expected: "显示已发货",
    actual: "详情仍显示待发货，发货弹窗没有打开，列表停在第 1 页",
    difference: "页面仍是待发货，不是已发货"
  });
  await recordFixtureEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "FAIL-1/s/o" });
  await assert.rejects(recordFixtureEvent(run.runRoot, {
    type: "checkpoint_result", checkpoint_id: "FAIL-1/s/o", result: "failed",
    reason: "页面没有出现目标文案", evidence_status: "missing"
  }), /未通过原因|实际操作顺序|差异/);
  await recordFixtureEvent(run.runRoot, {
    type: "checkpoint_result", checkpoint_id: "FAIL-1/s/o", result: "failed",
    reason: explanation, observation: explanation, evidence_status: "missing"
  });
  const report = await generateReport(run.runRoot);
  const html = await readFile(report.htmlReportPath, "utf8");
  const chat = renderChatTableMarkdown({ rows: [{ display_id: "TC-001", module: "订单", title: "查看发货状态", result_label: "未通过", reason: explanation }] });
  assert.match(report.chatTableMarkdown, /\| ID \| 模块 \| 测试场景 \| 测试结果 \| 成功\/失败的原因 \|/);
  for (const part of ["实际操作顺序", "在搜索框填写订单号 SO-1", "失败发生在第 2 步", "预期：显示已发货", "详情仍显示待发货", "发货弹窗没有打开", "页面仍是待发货"]) {
    assert.match(report.chatTableMarkdown, new RegExp(part));
    assert.match(html, new RegExp(part));
    assert.match(chat, new RegExp(part));
  }
  const tableReason = html.slice(html.indexOf("<td>TC-"), html.indexOf("查看</button>"));
  assert.match(tableReason, /实际操作顺序/);
  assert.match(tableReason, /预期与页面实际表现/);
  assert.match(tableReason, /实际表现和预期的差异/);
  assert.equal(report.undeliverableFailureCount, 0);
});
