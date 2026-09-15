import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  generateReport,
  initializeRun,
  recordEvent,
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
    for (const [checkpoint_id, result, reason] of [
      ["R-01/s1/o1", "passed", "页面显示严格文案"],
      ["R-02/s1/o1", "failed", "权限页面实际返回 200 并展示数据"],
      ["R-03/s1/o1", "undetermined", "10 个不同结果页均无动态样本"]
    ]) {
      await recordEvent(run.runRoot, {
        type: "checkpoint_result",
        checkpoint_id,
        result,
        reason,
        evidence_status: "complete",
        observation: reason
      });
    }
    const generated = await generateReport(run.runRoot);
    const report = await readFile(generated.reportPath, "utf8");
    assert.equal(report.includes("| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |"), true);
    const rows = report.split("\n").filter(line => /^\| R-0[1-4] \|/.test(line));
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.map(row => row.split("|")[1].trim()), ["R-01", "R-02", "R-03", "R-04"]);
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
      "| R-01 | 订单 | 通过场景 | 通过 | 页面显示严格文案 |",
      "| R-02 | 权限 | 失败场景 | 未通过 | 权限页面实际返回 200 并展示数据 |",
      "| R-03 | 数据 | 无法确定场景 | 无法确定 | 10 个不同结果页均无动态样本 |",
      "| R-04 | 范围 | 未执行场景 | 未执行 | 整条用例在正式执行前已明确排除 |"
    ]);
    for (const heading of [
      "## 未通过详情",
      "## 无法确定详情",
      "## 用户协助与阻塞",
      "## 证据状态与数据处理",
      "## 代理状态与真实验证",
      "## 清理结果",
      "## 产物一致性校验"
    ]) assert.equal(report.includes(heading), true, heading);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("UAT-07: regenerating overwrites a tampered report from JSON facts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-regen-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await fixtureCases(root) });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: "R-01/s1/o1",
      result: "passed",
      reason: "页面显示严格文案",
      evidence_status: "complete",
      observation: "页面显示严格文案"
    });
    const first = await generateReport(run.runRoot);
    await writeFile(first.reportPath, "tampered: 未通过");
    await assert.rejects(validateRun(run.runRoot), error => error.code === "RUN_CONSISTENCY");
    await generateReport(run.runRoot);
    const restored = await readFile(first.reportPath, "utf8");
    assert.equal(restored.includes("tampered"), false);
    assert.equal(restored.includes("| R-01 | 订单 | 通过场景 | 通过 | 页面显示严格文案 |"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
