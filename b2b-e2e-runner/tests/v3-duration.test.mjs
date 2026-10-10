import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as reportModel from "../scripts/lib/report-model.mjs";
import * as artifacts from "../scripts/run-artifacts.mjs";
const deriveDurations = (...args) => {
  assert.equal(typeof reportModel.deriveDurations, "function");
  return reportModel.deriveDurations(...args);
};

const at = minutes => new Date(Date.parse("2026-10-09T10:00:00.000Z") + minutes * 60_000).toISOString();

test("P11 trusted execution windows use an interval union", () => {
  const log = { run: { started_at: at(0), completed_at: at(20) }, events: [
    { type: "workflow_profile", profile: "permission-batches-html-v3", at: at(0) },
    { type: "activity_start", at: at(0) }, { type: "activity_end", at: at(10) },
    { type: "activity_start", at: at(5) }, { type: "activity_end", at: at(15) },
    { type: "activity_complete", at: at(20) }
  ] };
  const duration = deriveDurations(log);
  assert.equal(duration.execution_ms, 15 * 60_000);
  assert.equal(duration.execution_label, "15 分钟 0 秒");
});

test("P11 missing end or coverage marker leaves actual work time unknown", () => {
  for (const events of [
    [{ type: "activity_start", at: at(0) }],
    [{ type: "activity_start", at: at(0) }, { type: "activity_end", at: at(10) }]
  ]) {
    const duration = deriveDurations({ run: { started_at: at(0), completed_at: at(20) },
      events: [{ type: "workflow_profile", profile: "permission-batches-html-v3" }, ...events] });
    assert.equal(duration.execution_label, "无法准确计算");
  }
});

test("P11 linked runs union overlapping trusted intervals", () => {
  const events = (start, end) => [
    { type: "workflow_profile", profile: "permission-batches-html-v3" },
    { type: "activity_start", at: at(start) }, { type: "activity_end", at: at(end) },
    { type: "activity_complete", at: at(end) }
  ];
  assert.equal(reportModel.deriveActivityDurations([
    { events: events(0, 10) }, { events: events(5, 15) }
  ]).execution_ms, 15 * 60_000);
  assert.equal(reportModel.deriveActivityDurations([
    { events: events(0, 10) }, { events: events(5, 15).slice(0, -1) }
  ]).execution_label, "无法准确计算");
  assert.equal(reportModel.deriveActivityDurations([
    { events: [...events(0, 10), { type: "checkpoint_result", at: at(11) }] }
  ]).execution_label, "无法准确计算");
});

test("P11 official activity commands own timestamps and reject unpaired windows", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-activity-"));
  try {
    const casesPath = path.join(root, "cases.json");
    await writeFile(casesPath, JSON.stringify({ schema_version: "2.0", suite: { name: "time", target_urls: ["https://staging.example.test"] },
      cases: [{ case_id: "C", module: "M", title: "T", preconditions: [],
        steps: [{ step_id: "s", action: "查看", expected: [{ oracle_id: "o", text: "可见" }] }] }] }));
    const run = await artifacts.initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v3" });
    await artifacts.recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["C"] });
    assert.equal(typeof artifacts.beginActivity, "function");
    assert.equal(typeof artifacts.endActivity, "function");
    assert.equal(typeof artifacts.completeActivity, "function");
    await assert.rejects(artifacts.endActivity(run.runRoot), /活动|区段/u);
    await artifacts.beginActivity(run.runRoot);
    await assert.rejects(artifacts.beginActivity(run.runRoot), /活动|区段/u);
    await artifacts.endActivity(run.runRoot);
    await artifacts.completeActivity(run.runRoot);
    await assert.rejects(artifacts.beginActivity(run.runRoot), /活动|区段/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});
