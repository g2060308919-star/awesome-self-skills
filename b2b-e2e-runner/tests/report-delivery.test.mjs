import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as runtime from "../scripts/run-artifacts.mjs";

async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-delivery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({ schema_version: "2.0", suite: { name: "交付", target_urls: ["http://localhost"] }, cases: [{ case_id: "C", module: "观察", title: "结果", preconditions: [], steps: [{ step_id: "s", action: "查看", expected: [{ oracle_id: "o", text: "完成" }] }] }] }));
  const run = await runtime.initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
  await runtime.recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["C"] });
  return run;
}

test("stage artifacts remain available internally; ordinary turn end does not deliver report/table", async t => {
  const run = await setup(t);
  assert.equal(typeof runtime.deliverReport, "function");
  const internal = await runtime.generateReport(run.runRoot);
  assert.equal(internal.delivery.kind, "stage");
  assert.equal(internal.delivery.automaticallyPresent, false);
  assert.equal(typeof internal.chatTableMarkdown, "string");
  const response = await runtime.deliverReport(run.runRoot);
  assert.equal(response.deliverable, false);
  for (const key of ["reportPath", "htmlReportPath", "chatTableMarkdown", "counts"]) assert.equal(key in response, false);
  await runtime.recordEvent(run.runRoot, { type: "assistance", assistance_id: "help-data", phase: "requested", checkpoint_ids: ["C/s/o"], description: "缺少指定业务数据", attempts: ["已核对授权内的列表与详情"], required_user_action: "请提供符合用例条件的数据", decision_source: "agent" });
  await runtime.recordEvent(run.runRoot, { type: "run_state", status: "awaiting_user", reason: "没有其他独立工作，等待数据", assistance_ids: ["help-data"] });
  await runtime.generateReport(run.runRoot);
  assert.equal((await runtime.deliverReport(run.runRoot)).deliverable, false);
  const requested = await runtime.deliverReport(run.runRoot, { stageRequested: true });
  assert.equal(requested.deliverable, true);
  assert.equal(requested.delivery.kind, "stage");
  assert.match(requested.chatTableMarkdown, /TC-001/);
});

test("actual completed Run delivers complete validated results", async t => {
  const run = await setup(t);
  assert.equal(typeof runtime.deliverReport, "function");
  await runtime.recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "C/s/o" });
  await runtime.recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "C/s/o", result: "passed", reason: "页面显示完成", observation: "已观察到完成", evidence_status: "missing" });
  await runtime.recordEvent(run.runRoot, { type: "evidence_capture", capture_kind: "screenshot", outcome: "unavailable", checkpoint_ids: ["C/s/o"], description: "安全采集不可用", attempts: ["已核对采集能力"], reason: "必要区域含不可排除的秘密" });
  await runtime.recordEvent(run.runRoot, { type: "run_state", status: "completed" });
  const delivered = await runtime.deliverReport(run.runRoot);
  assert.equal(delivered.deliverable, true);
  assert.equal(delivered.delivery.kind, "final");
  assert.equal(delivered.counts.passed, 1);
  assert.match(await readFile(delivered.htmlReportPath, "utf8"), /页面显示完成/);
});

test("explicit user early end is labeled and cannot bypass unfinished checkpoint gates", async t => {
  const run = await setup(t);
  const ended = await runtime.recordEvent(run.runRoot, { type: "assistance", assistance_id: "end-run", phase: "stop_run", checkpoint_ids: ["C/s/o"], description: "用户明确要求提前结束本轮", decision_source: "user" });
  await assert.rejects(runtime.recordEvent(run.runRoot, { type: "run_state", status: "completed" }));
  await runtime.recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "C/s/o", result: "undetermined", reason: "用户明确提前结束，该检查点尚未执行", observation: "没有业务观察，不推断产品结果", evidence_status: "missing", resolution_ref: ended.sequence, exploration_summary: { checkpoint_ids: ["C/s/o"], missing_fact: "尚未观察业务行为", known_facts: ["用户明确提前结束"], attempts: [], not_attempted_reason: "结束决定发生于执行前", cannot_continue_reason: "用户不再执行本轮" } });
  await runtime.recordEvent(run.runRoot, { type: "run_state", status: "completed" });
  const delivered = await runtime.deliverReport(run.runRoot);
  assert.equal(delivered.delivery.kind, "early_end");
  assert.match(delivered.delivery.label, /提前结束/);
  assert.equal(delivered.counts.undetermined, 1);
});
