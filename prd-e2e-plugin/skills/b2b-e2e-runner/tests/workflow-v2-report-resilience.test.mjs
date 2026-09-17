import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent, resumeCheck, validateRun } from "../scripts/run-artifacts.mjs";

async function writeCases(root, count = 1, { hostile = false } = {}) {
  const casesPath = path.join(root, "cases.json");
  const cases = Array.from({ length: count }, (_, index) => ({
    case_id: `CASE-${index + 1}`,
    module: hostile ? "模块</td><script>globalThis.pwned=1</script>" : `模块 ${index + 1}`,
    title: hostile ? "<img src=https://outside.invalid/a.png onerror=alert(1)>" : `场景 ${index + 1}`,
    preconditions: hostile ? ["<svg onload=alert(2)>"] : [],
    steps: [{ step_id: "s", action: "执行原步骤", expected: [{ oracle_id: "o", text: "显示目标事实" }] }]
  }));
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0",
    suite: { name: hostile ? "<script>alert(3)</script>" : "v2 报告韧性", target_urls: ["https://staging.example.test"] },
    cases
  }));
  return { casesPath, cases };
}

async function baseRun(root, count = 1, options) {
  const { casesPath, cases } = await writeCases(root, count, options);
  const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
  await recordEvent(run.runRoot, {
    type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: cases.map(item => item.case_id)
  });
  return { run, cases };
}

test("AC-05: 19 and 20 cases remain on one page while the existing 21-case boundary uses two", async () => {
  for (const count of [19, 20]) {
    const root = await mkdtemp(path.join(os.tmpdir(), `runner-v2-page-${count}-`));
    try {
      const { run } = await baseRun(root, count);
      const generated = await generateReport(run.runRoot);
      const html = await readFile(generated.htmlReportPath, "utf8");
      assert.equal((html.match(/class="case-row"/g) ?? []).length, count);
      assert.equal((html.match(/class="case-row" hidden/g) ?? []).length, 0);
      assert.match(html, /第 1 \/ 1 页/);
      assert.match(html, /data-page-next disabled/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("AC-09: multiple global pauses are deducted once while active assistance time remains execution time", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-duration-"));
  try {
    const { run } = await baseRun(root);
    for (const assistanceId of ["assist-1", "assist-2"]) {
      await recordEvent(run.runRoot, {
        type: "assistance", assistance_id: assistanceId, phase: "requested", checkpoint_ids: ["CASE-1/s/o"],
        description: "需要用户提供当前事实", required_user_action: "请核对后通知 Runner", attempts: [], decision_source: "agent"
      });
      await recordEvent(run.runRoot, {
        type: "run_state", status: "awaiting_user", reason: "当前没有可安全继续的独立工作", assistance_ids: [assistanceId]
      });
      await generateReport(run.runRoot);
      await resumeCheck(run.runRoot);
      await recordEvent(run.runRoot, {
        type: "assistance", assistance_id: assistanceId, phase: assistanceId === "assist-1" ? "resolved" : "unavailable",
        checkpoint_ids: ["CASE-1/s/o"], description: assistanceId === "assist-1" ? "用户提供了所需事实" : "用户明确本轮无法提供",
        decision_source: "user"
      });
      await recordEvent(run.runRoot, { type: "run_state", status: "running" });
    }

    const logPath = path.join(run.runRoot, "execution-log.json");
    const log = JSON.parse(await readFile(logPath, "utf8"));
    log.run.started_at = "2026-09-17T00:00:00.000Z";
    const times = [0, 1, 5, 10, 10, 20, 20, 25, 30, 30, 35, 35];
    log.events.forEach((event, index) => { event.at = `2026-09-17T00:00:${String(times[index]).padStart(2, "0")}.000Z`; });
    await writeFile(logPath, JSON.stringify(log, null, 2));

    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");
    assert.match(html, /执行耗时<\/span><strong>20 秒<\/strong>/);
    assert.match(html, /全局暂停等待时长：15 秒/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-09: a missing timing boundary is shown as not accurately calculable", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-duration-missing-"));
  try {
    const { run } = await baseRun(root);
    const logPath = path.join(run.runRoot, "execution-log.json");
    const log = JSON.parse(await readFile(logPath, "utf8"));
    log.run.started_at = null;
    await writeFile(logPath, JSON.stringify(log, null, 2));
    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");
    assert.match(html, /执行耗时<\/span><strong>无法准确计算<\/strong>/);
    assert.match(html, /全局暂停等待时长：无法准确计算/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-10/25/29: a stage report stays pending and same-Run recovery preserves a later failure", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-stage-resume-"));
  try {
    const { run } = await baseRun(root);
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-stage", phase: "requested", checkpoint_ids: ["CASE-1/s/o"],
      description: "缺少用户才能提供的页面状态", required_user_action: "请完成外部动作后通知 Runner", attempts: [], decision_source: "agent"
    });
    await recordEvent(run.runRoot, {
      type: "run_state", status: "awaiting_user", reason: "没有其他独立检查可继续", assistance_ids: ["assist-stage"]
    });
    const stage = await generateReport(run.runRoot);
    const stageHtml = await readFile(stage.htmlReportPath, "utf8");
    assert.match(stageHtml, /本报告尚未完成/);
    assert.match(stageHtml, /未完成，等待用户协作/);
    assert.equal(stageHtml.includes("等待用户准备权限"), false, "通用阻塞不得被报告伪装为权限等待");
    assert.match(stageHtml, /阶段聚合中的“无法确定”不是最终结论/);
    assert.match(stageHtml, /待处理/);
    let log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
    assert.equal(log.cases[0].checkpoints[0].result, null);
    assert.equal(log.cases[0].checkpoints[0].status, "pending");

    await resumeCheck(run.runRoot);
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-stage", phase: "resolved", checkpoint_ids: ["CASE-1/s/o"],
      description: "用户已完成外部动作并通知 Runner", decision_source: "user"
    });
    await recordEvent(run.runRoot, { type: "run_state", status: "running" });
    await recordEvent(run.runRoot, { type: "case_started", case_id: "CASE-1" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "CASE-1/s/o" });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: "CASE-1/s/o", result: "failed",
      reason: "上下文正确，但页面实际未显示目标事实", observation: "页面显示与原预期不一致", evidence_status: "missing"
    });
    await recordEvent(run.runRoot, {
      type: "evidence_capture", checkpoint_ids: ["CASE-1/s/o"], capture_kind: "screenshot", outcome: "unavailable",
      description: "当前页面区域无法在不包含敏感信息的情况下保存", attempts: ["已核对可安全截图的区域"],
      reason: "目标事实与认证信息显示在同一区域"
    });
    await recordEvent(run.runRoot, { type: "run_state", status: "completed" });
    const finalReport = await generateReport(run.runRoot);
    const finalHtml = await readFile(finalReport.htmlReportPath, "utf8");
    assert.equal(finalReport.counts.failed, 1);
    assert.match(finalHtml, /上下文正确，但页面实际未显示目标事实/);
    assert.equal(finalHtml.includes("本报告尚未完成"), false);

    await writeFile(finalReport.htmlReportPath, "<!doctype html><p>tampered</p>");
    await assert.rejects(validateRun(run.runRoot), error => error.code === "RUN_CONSISTENCY" && /report\.html/.test(error.message));
    await generateReport(run.runRoot);
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-11: hostile v2 input remains text and cannot add executable or remote-loading markup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-hostile-"));
  try {
    const { run } = await baseRun(root, 1, { hostile: true });
    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");
    assert.equal(html.includes("<script>alert(3)</script>"), false);
    assert.equal(html.includes("<img src=https://outside.invalid"), false);
    assert.match(html, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=https:\/\/outside\.invalid/);
    assert.equal((html.match(/<script>/g) ?? []).length, 1, "only the fixed renderer script is present");
    assert.equal(html.includes("https://outside.invalid/a.png\""), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-04/41: structured execution observations render as semantic facts, not object serialization", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-semantic-observation-"));
  try {
    const { run } = await baseRun(root);
    await recordEvent(run.runRoot, {
      type: "effect_observed",
      case_id: "CASE-1",
      checkpoint_id: "CASE-1/s/o",
      observation: { status: "可用", count: 2 }
    });
    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");
    assert.equal(html.includes("[object Object]"), false);
    assert.match(html, /状态：可用/);
    assert.match(html, /数量：2/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
