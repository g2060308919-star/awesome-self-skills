import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent } from "../scripts/run-artifacts.mjs";

async function runFor(root) {
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0", suite: { name: "来源与证据", target_urls: ["https://staging.example.test"] },
    cases: [{ case_id: "CASE", module: "重试", title: "保存失败后重试", preconditions: [],
      steps: [{ step_id: "s", action: "保存并查询", expected: [{ oracle_id: "o", text: "首次失败后重试成功并回读一致" }] }] }]
  }));
  const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v3" });
  await recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["CASE"] });
  await recordEvent(run.runRoot, { type: "target_inventory", owned_target_ids: ["target-1"], preexisting_target_ids: [], attached_preexisting_target_ids: [] });
  await recordEvent(run.runRoot, { type: "case_started", case_id: "CASE" });
  await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "CASE/s/o" });
  return run;
}

test("P02 applied control is reported as mixed; a configured rule alone is not real proof", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v3-source-"));
  try {
    const run = await runFor(root);
    await recordEvent(run.runRoot, { type: "control_effect", checkpoint_ids: ["CASE/s/o"],
      attempt_id: "first-save", target_id: "target-1", phase: "response",
      match: "POST /save", description: "第一次保存失败由测试响应注入" });
    await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "CASE/s/o",
      result: "passed", reason: "首次失败后真实重试并回读一致", observation: "第二次保存和查询为真实观察",
      evidence_status: "partial", verification_source: "mock_affected" });
    const report = await generateReport(run.runRoot);
    const html = await readFile(report.htmlReportPath, "utf8");
    assert.match(html, /含模拟/);
    assert.match(html, /第一次保存失败由测试响应注入/);
    assert.match(html, /第二次保存和查询为真实观察/);
    await assert.rejects(recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "CASE/s/o",
      result: "passed", reason: "纯真实", observation: "保存成功", evidence_status: "partial",
      verification_source: "real" }), /补测/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("P08 missing request detail capture prevents a complete evidence label", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v3-evidence-"));
  try {
    const run = await runFor(root);
    await recordEvent(run.runRoot, { type: "evidence_capture", checkpoint_ids: ["CASE/s/o"],
      capture_kind: "screenshot", capture_scope: "request_details", outcome: "failed",
      description: "请求详情截图未保存", attempts: ["检查 Network 请求详情"], reason: "截图归档失败" });
    await assert.rejects(recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "CASE/s/o",
      result: "passed", reason: "行为已观察", observation: "保存与查询成功",
      evidence_status: "complete", verification_source: "real" }), /证据|截图/u);
    await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "CASE/s/o",
      result: "passed", reason: "行为已观察但请求截图缺失", observation: "保存与查询成功",
      evidence_status: "partial", verification_source: "real" });
    const report = await generateReport(run.runRoot);
    assert.match(await readFile(report.htmlReportPath, "utf8"), /请求详情截图未保存|截图归档失败/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
