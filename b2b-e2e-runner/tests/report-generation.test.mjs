import { initializeFixtureRun as initializeRun } from "./test-helpers.mjs";
import { recordFixtureEvent as recordEvent, recordFixtureScreenshotGaps } from "./test-helpers.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { reproducibleFailure } from "../scripts/lib/failed-explanation.mjs";
import {
  generateReport,
  validateRun
} from "../scripts/run-artifacts.mjs";

async function fixtureCases(root) {
  const file = path.join(root, "cases.json");
  await writeFile(file, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "报告套件", target_urls: ["https://staging.example.test"] },
    cases: [
      {
        case_id: "R-01",
        module: "订单",
        title: "通过场景",
        preconditions: [],
        steps: [{ step_id: "s1", action: "查看", expected: [{ oracle_id: "o1", text: "严格文案" }] }]
      },
      {
        case_id: "R-02",
        module: "权限",
        title: "失败场景",
        preconditions: [],
        steps: [{ step_id: "s1", action: "访问", expected: [{ oracle_id: "o1", text: "禁止访问" }] }]
      },
      {
        case_id: "R-03",
        module: "数据",
        title: "无法确定场景",
        preconditions: [],
        steps: [{ step_id: "s1", action: "查询", expected: [{ oracle_id: "o1", text: "存在动态样本" }] }]
      },
      {
        case_id: "R-04",
        module: "范围",
        title: "未执行场景",
        excluded: true,
        preconditions: [],
        steps: [{ step_id: "s1", action: "跳过", expected: [{ oracle_id: "o1", text: "不执行" }] }]
      }
    ]
  }));
  return file;
}

test("AC-007/008/009/15: report exposes the complete ordered five-column table for final delivery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-test-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await fixtureCases(root) });
    const failedReason = reproducibleFailure({
      operations: "打开权限页面，失败发生在核对返回数据。",
      expected: "权限不足时不展示数据",
      actual: "权限页面实际返回 200 并展示数据，弹窗未出现",
      difference: "权限页面实际返回 200 并展示数据"
    });
    for (const [checkpoint_id, result, reason] of [
      ["R-01/s1/o1", "passed", "页面显示严格文案"],
      ["R-02/s1/o1", "failed", failedReason],
      ["R-03/s1/o1", "undetermined", "10 个不同结果页均无动态样本"]
    ]) {
      await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id });
      await recordEvent(run.runRoot, {
        type: "checkpoint_result",
        checkpoint_id,
        result,
        ...(result === "undetermined" ? { exploration_summary: { checkpoint_ids: [checkpoint_id], missing_fact: "不存在动态样本", known_facts: ["列表查询成功"], attempts: [{ action: "查看十个不同结果页", observation: "无目标记录" }], cannot_continue_reason: "用例未承诺固定样本，缺少可用于内容断言的记录" } } : {}),
        reason,
        evidence_status: "partial",
        observation: reason
      });
    }
    await recordFixtureScreenshotGaps(run.runRoot);
    const generated = await generateReport(run.runRoot);
    const report = generated.chatTableMarkdown;
    const html = await readFile(generated.reportPath, "utf8");
    assert.equal(report.includes("| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |"), true);
    const rows = report.split("\n").filter(line => /^\| TC-00[1-4] \|/.test(line));
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map(row => row.split("|")[1].trim()), ["TC-001", "TC-002", "TC-003", "TC-004"]);
    assert.equal(rows.every(row => row.split("|")[5].trim().length > 0), true);
    assert.deepEqual(generated.counts, {
      passed: 1,
      failed: 1,
      undetermined: 1,
      not_executed: 1
    });
    const canonicalTable = report.split("\n").filter(line => line.startsWith("|")).slice(0, 6);
    assert.deepEqual(canonicalTable, [
      "| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |",
      "|---|---|---|---|---|",
      "| TC-001 | 订单 | 通过场景 | 通过 | 页面显示严格文案 |",
      `| TC-002 | 权限 | 失败场景 | 未通过 | ${failedReason.replaceAll("\n", "<br>")} |`,
      "| TC-003 | 数据 | 无法确定场景 | 无法确定 | 10 个不同结果页均无动态样本 |",
      "| TC-004 | 范围 | 未执行场景 | 未执行 | 整条用例在正式执行前已明确排除 |"
    ]);
    for (const heading of [
      "用例详情", "无法确定", "证据", "代理", "清理", "一致性"
    ]) assert.equal(html.includes(heading), true, heading);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("UAT-07: regenerating overwrites a tampered report from JSON facts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-regen-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await fixtureCases(root) });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "R-01/s1/o1" });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: "R-01/s1/o1",
      result: "passed",
      reason: "页面显示严格文案",
      evidence_status: "partial",
      observation: "页面显示严格文案"
    });
    await recordFixtureScreenshotGaps(run.runRoot);
    const first = await generateReport(run.runRoot);
    await writeFile(first.reportPath, "tampered: 未通过");
    await assert.rejects(validateRun(run.runRoot), error => error.code === "RUN_CONSISTENCY");
    await generateReport(run.runRoot);
    const restored = await readFile(first.reportPath, "utf8");
    assert.equal(restored.includes("tampered"), false);
    assert.equal(restored.includes("页面显示严格文案"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
