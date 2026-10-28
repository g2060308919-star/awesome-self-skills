import { requestFixturePermission, resolveFixturePermission, recordFixtureScreenshotGaps } from "./test-helpers.mjs";
import { recordFixtureEvent as recordEvent } from "./test-helpers.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, resumeCheck, validateRun } from "../scripts/run-artifacts.mjs";

async function createCases(root) {
  const file = path.join(root, "cases.json");
  await writeFile(file, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "权限恢复", target_urls: ["https://staging.example.test"] },
    cases: [
      { case_id: "READY", module: "订单", title: "就绪工作", preconditions: [], steps: [{ step_id: "s", action: "查看", expected: [{ oracle_id: "o", text: "可见" }] }] },
      { case_id: "LATER", module: "审计", title: "准备后工作", preconditions: [], steps: [{ step_id: "s", action: "审阅", expected: [{ oracle_id: "o", text: "可审阅" }] }] },
      { case_id: "NONE", module: "配置", title: "无法提供", preconditions: [], steps: [{ step_id: "s", action: "配置", expected: [{ oracle_id: "o", text: "可配置" }] }] }
    ]
  }));
  return file;
}

const permissionPlan = {
  type: "permission_plan",
  version: "1.0",
  groups: [
    { group_id: "g-ready", role_text: "订单观察员", permissions: ["查看订单"], case_ids: ["READY"], checkpoint_ids: ["READY/s/o"], availability: "ready", account_ref: "acct-1", preparation_owner: null, declaration: "用户提供当前可用账号" },
    { group_id: "g-later", role_text: "风险审阅员", permissions: ["审阅记录"], case_ids: ["LATER"], checkpoint_ids: ["LATER/s/o"], availability: "user_preparation_required", account_ref: null, preparation_owner: "user", declaration: "用户稍后自行准备" },
    { group_id: "g-none", role_text: "配置管理员", permissions: ["租户配置"], case_ids: ["NONE"], checkpoint_ids: ["NONE/s/o"], availability: "unavailable", account_ref: null, preparation_owner: "user", declaration: "用户明确本轮无法提供" }
  ],
  role_independent_case_ids: []
};

test("AC-02/08/09/10/12/14/15/18: one Run executes ready work, waits, re-verifies, resumes, and preserves side-effect safety", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "permission-resume-"));
  try {
    const run = await initializeRun({ mockFallback: "declined", workspaceRoot: root, casesPath: await createCases(root), workflowProfile: "b2b-e2e-current" });
    let log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json")));
    assert.equal(log.events[0].type, "workflow_profile");
    assert.equal(log.events[0].profile, "b2b-e2e-current");

    await assert.rejects(recordEvent(run.runRoot, { type: "case_started", case_id: "READY" }), /权限计划/);
    await recordEvent(run.runRoot, permissionPlan);
    await assert.rejects(recordEvent(run.runRoot, { type: "case_started", case_id: "READY" }), /实际核验/);
    await recordEvent(run.runRoot, { type: "role_observation", observation: { group_id: "g-ready", account_ref: "acct-1", role: "订单观察员", verification: "verified", description: "页面显示订单观察权限" } });
    await recordEvent(run.runRoot, { type: "case_started", case_id: "READY" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "READY/s/o" });
    await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "READY/s/o", result: "passed", reason: "订单页显示目标记录", observation: "目标记录可见", evidence_status: "not_required" });

    await recordEvent(run.runRoot, { type: "action_dispatched", action_id: "write-risk", checkpoint_id: "LATER/s/o", side_effect: true, description: "恢复前效果未知的写动作" });
    await requestFixturePermission(run.runRoot, { group_id: "g-later", checkpoint_ids: ["LATER/s/o"], reason: "等待用户自行准备风险审阅权限" });
    await recordEvent(run.runRoot, { type: "proxy_state", proxy: { state: "stopped", cleanup: { attempted: true, succeeded: true, reason: "等待前已恢复原行为" } } });
    await recordFixtureScreenshotGaps(run.runRoot);
    await recordEvent(run.runRoot, { type: "run_state", status: "awaiting_user", reason: "等待用户准备审阅权限", assistance_ids: ["fixture-permission:g-later"] });
    await generateReport(run.runRoot);
    const beforeResume = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json")));
    const snapshotHash = beforeResume.test_cases.sha256;

    const resume = await resumeCheck(run.runRoot);
    assert.equal(resume.run_id, run.runId);
    assert.equal(resume.auto_replay_allowed, false);
    assert.deepEqual(resume.possibly_committed_actions.map(item => item.action_id), ["write-risk"]);

    await recordEvent(run.runRoot, { type: "permission_availability", group_id: "g-later", availability: "ready", account_ref: "acct-2", declaration: "用户说明 acct-2 已有风险审阅权限" });
    await assert.rejects(recordEvent(run.runRoot, { type: "case_started", case_id: "LATER" }), /实际核验/);
    await recordEvent(run.runRoot, { type: "role_observation", observation: { group_id: "g-later", account_ref: "acct-2", role: "风险审阅员", verification: "mismatch", description: "页面仍显示无审阅权限" } });
    await assert.rejects(recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "LATER/s/o" }), /实际核验/);
    await recordEvent(run.runRoot, { type: "role_observation", observation: { group_id: "g-later", account_ref: "acct-2", role: "风险审阅员", verification: "verified", description: "重新登录后页面显示审阅入口" } });
    await resolveFixturePermission(run.runRoot, { group_id: "g-later", checkpoint_ids: ["LATER/s/o"], description: "用户已准备风险审阅权限" });
    await recordEvent(run.runRoot, { type: "case_started", case_id: "LATER" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "LATER/s/o" });
    await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: "LATER/s/o", result: "passed", reason: "风险页显示可审阅记录", observation: "审阅入口和记录可见", evidence_status: "not_required" });

    await recordEvent(run.runRoot, { type: "assistance", assistance_id: "no-config", phase: "requested", checkpoint_ids: ["NONE/s/o"], description: "核对配置权限是否可提供", required_user_action: "说明配置权限可用性", attempts: ["已核对权限计划"], decision_source: "agent" });
    const unavailable = await recordEvent(run.runRoot, { type: "assistance", assistance_id: "no-config", phase: "unavailable", checkpoint_ids: ["NONE/s/o"], description: "用户明确本轮无法提供配置权限", decision_source: "user" });
    await recordEvent(run.runRoot, { type: "checkpoint_result", resolution_ref: unavailable.sequence, exploration_summary: { checkpoint_ids: ["NONE/s/o"], missing_fact: "配置权限", known_facts: ["用户无法提供"], attempts: [], not_attempted_reason: "授权身份不可用", cannot_continue_reason: "无法确认配置功能" }, checkpoint_id: "NONE/s/o", result: "undetermined", reason: "缺少租户配置权限，用户已明确本轮无法提供", observation: "未执行页面操作", evidence_status: "not_required", permission_group_ids: ["g-none"] });
    await recordEvent(run.runRoot, { type: "run_state", status: "completed" });
    await assert.doesNotReject(validateRun(run.runRoot, { checkReport: false }));

    log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json")));
    assert.equal(log.test_cases.sha256, snapshotHash);
    assert.deepEqual(log.run.actual_case_order, ["READY", "LATER"]);
    assert.equal(log.cases[0].result, "passed");
    assert.equal(log.cases[1].result, "passed");
    assert.equal(log.cases[2].result, "undetermined");
    assert.deepEqual(log.cases[2].checkpoints[0].permission_group_ids, ["g-none"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("R02: default initialization selects current workflow and unknown profiles fail at the input boundary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "permission-compat-"));
  try {
    const casesPath = await createCases(root);
    const legacy = await initializeRun({ mockFallback: "declined", workspaceRoot: root, casesPath });
    const log = JSON.parse(await readFile(path.join(legacy.runRoot, "execution-log.json")));
    assert.equal(log.events[0].profile, "b2b-e2e-current");
    await assert.rejects(
      recordEvent(legacy.runRoot, { type: "workflow_profile", profile: "b2b-e2e-current" }),
      error => error.code === "INPUT_CONTRACT"
    );
    await assert.rejects(
      initializeRun({ mockFallback: "declined", workspaceRoot: root, casesPath, workflowProfile: "unknown-profile" }),
      error => error.code === "INPUT_CONTRACT"
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile and resume markers can only be emitted by their owning commands", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "permission-owned-events-"));
  try {
    const run = await initializeRun({ mockFallback: "declined", workspaceRoot: root, casesPath: await createCases(root), workflowProfile: "b2b-e2e-current" });
    await assert.rejects(
      recordEvent(run.runRoot, { type: "resume_check", resume_count: 1 }),
      error => error.code === "INPUT_CONTRACT"
    );
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("AC-15/31: stop-waiting closes only named groups without converting availability or ending other waits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "permission-stop-waiting-"));
  try {
    const run = await initializeRun({ mockFallback: "declined", workspaceRoot: root, casesPath: await createCases(root), workflowProfile: "b2b-e2e-current" });
    const plan = structuredClone(permissionPlan);
    plan.groups[0].availability = "user_preparation_required";
    plan.groups[0].account_ref = null;
    plan.groups[0].preparation_owner = "user";
    plan.groups[0].declaration = "用户稍后准备订单权限";
    await recordEvent(run.runRoot, plan);
    await requestFixturePermission(run.runRoot, { group_id: "g-ready", checkpoint_ids: ["READY/s/o"], reason: "等待订单权限" });
    await requestFixturePermission(run.runRoot, { group_id: "g-later", checkpoint_ids: ["LATER/s/o"], reason: "等待审阅权限" });
    const stopped = await resolveFixturePermission(run.runRoot, { group_id: "g-ready", checkpoint_ids: ["READY/s/o"], phase: "stop_waiting", description: "用户决定本轮不再等待订单权限" });
    await recordEvent(run.runRoot, { type: "checkpoint_result", resolution_ref: stopped.sequence, exploration_summary: { checkpoint_ids: ["READY/s/o"], missing_fact: "订单权限", known_facts: ["用户停止等待"], attempts: [], not_attempted_reason: "授权身份不可用", cannot_continue_reason: "用户停止等待" }, checkpoint_id: "READY/s/o", result: "undetermined", reason: "用户决定本轮不再等待订单权限", observation: "未执行页面操作", evidence_status: "not_required", permission_group_ids: ["g-ready"] });
    await assert.rejects(recordEvent(run.runRoot, { type: "run_state", status: "completed" }), /未处理|未执行|终结依据/);
    const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json")));
    const availability = log.events.find(event => event.type === "permission_plan").groups.find(group => group.group_id === "g-ready").availability;
    assert.equal(availability, "user_preparation_required");
    assert.equal(log.cases[1].checkpoints[0].result, null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
