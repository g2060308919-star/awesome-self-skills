import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePermissionState,
  getPermissionWorkSummary,
  validatePermissionEvent
} from "../scripts/lib/permission-batches.mjs";

function cases() {
  return {
    schema_version: "2.0",
    suite: { name: "权限批次", target_urls: ["https://staging.example.test"] },
    cases: [
      { case_id: "Z-先出现", module: "订单", title: "长中文角色", preconditions: [], steps: [{ step_id: "s", action: "查看", expected: [{ oracle_id: "o", text: "可见" }] }] },
      { case_id: "A-后出现", module: "财务", title: "另一角色", preconditions: [], steps: [{ step_id: "s", action: "导出", expected: [{ oracle_id: "o", text: "可导出" }] }] },
      { case_id: "M-第三", module: "审计", title: "第三角色", preconditions: [], steps: [{ step_id: "s", action: "审阅", expected: [{ oracle_id: "o", text: "可审阅" }] }] },
      { case_id: "Q-第四", module: "配置", title: "第四角色", preconditions: [], steps: [{ step_id: "s", action: "配置", expected: [{ oracle_id: "o", text: "可配置" }] }] },
      { case_id: "FREE", module: "公共", title: "无需角色", preconditions: [], steps: [{ step_id: "s", action: "查看", expected: [{ oracle_id: "o", text: "可打开" }] }] }
    ]
  };
}

function log(events = []) {
  return {
    run: { status: "running", actual_case_order: [], resume_count: 0 },
    cases: cases().cases.map(item => ({
      case_id: item.case_id,
      result: "undetermined",
      reason: "检查点尚未全部执行",
      checkpoints: [{ step_id: "s", oracle_id: "o", status: "pending", result: null }]
    })),
    events: events.map((event, index) => ({ ...event, sequence: index + 1, at: `2026-09-15T00:00:0${index}.000Z` }))
  };
}

const plan = {
  type: "permission_plan",
  version: "1.0",
  groups: [
    { group_id: "后排组", role_text: "财务复核人", permissions: ["导出账单"], case_ids: ["A-后出现"], checkpoint_ids: ["A-后出现/s/o"], availability: "ready", account_ref: "acct-shared", preparation_owner: null, declaration: "用户确认当前可导出" },
    { group_id: "第一组", role_text: "区域订单查看人", permissions: ["查看华东订单"], case_ids: ["Z-先出现"], checkpoint_ids: ["Z-先出现/s/o"], availability: "ready", account_ref: "acct-shared", preparation_owner: null, declaration: "用户确认当前可查看" },
    { group_id: "待准备组", role_text: "风险审阅人", permissions: ["审阅高风险记录"], case_ids: ["M-第三"], checkpoint_ids: ["M-第三/s/o"], availability: "user_preparation_required", account_ref: null, preparation_owner: "user", declaration: "用户说明稍后自行准备" },
    { group_id: "无法提供组", role_text: "租户配置人", permissions: ["修改租户配置"], case_ids: ["Q-第四"], checkpoint_ids: ["Q-第四/s/o"], availability: "unavailable", account_ref: null, preparation_owner: "user", declaration: "用户明确本轮无法提供" }
  ],
  role_independent_case_ids: ["FREE"]
};

test("AC-02/29/30/32: arbitrary groups replay in first-case order without fixed role/account cardinality", () => {
  const executionLog = log([
    { type: "workflow_profile", profile: "permission-batches-html-v1" },
    plan,
    { type: "role_observation", observation: { group_id: "第一组", account_ref: "acct-shared", role: "区域订单查看人", verification: "verified", description: "页面显示华东订单权限" } },
    { type: "role_observation", observation: { group_id: "后排组", account_ref: "acct-shared", role: "财务复核人", verification: "verified", description: "页面显示账单导出权限" } }
  ]);
  const state = derivePermissionState(cases(), executionLog);
  assert.deepEqual(state.groups.map(group => group.group_id), ["第一组", "后排组", "待准备组", "无法提供组"]);
  assert.equal(state.groups.length, 4);
  assert.equal(state.groups.filter(group => group.account_ref === "acct-shared").length, 2);
  assert.deepEqual(getPermissionWorkSummary(cases(), executionLog).ready_group_ids, ["第一组", "后排组"]);
});

test("AC-09/11/12/14/31: availability changes invalidate stale verification and repeated notifications do not reset completed work", () => {
  const executionLog = log([
    { type: "workflow_profile", profile: "permission-batches-html-v1" },
    plan,
    { type: "role_observation", observation: { group_id: "第一组", account_ref: "acct-shared", role: "区域订单查看人", verification: "verified", description: "旧会话已核验" } },
    { type: "permission_availability", group_id: "后排组", availability: "ready", account_ref: "acct-shared", declaration: "同一账号新增财务授权" },
    { type: "role_observation", observation: { group_id: "后排组", account_ref: "acct-shared", role: "财务复核人", verification: "mismatch", description: "页面仍没有导出入口" } },
    { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户一次通知风险组也已准备" },
    { type: "role_observation", observation: { group_id: "待准备组", account_ref: "acct-risk", role: "风险审阅人", verification: "verified", description: "页面已显示审阅能力" } }
  ]);
  const state = derivePermissionState(cases(), executionLog);
  assert.equal(state.groups.find(group => group.group_id === "第一组").verification, "stale");
  assert.equal(state.groups.find(group => group.group_id === "后排组").verification, "mismatch");
  assert.equal(state.groups.find(group => group.group_id === "待准备组").verification, "verified");

  executionLog.cases[2].checkpoints[0] = { step_id: "s", oracle_id: "o", status: "completed", result: "passed" };
  const repeated = { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户重复说明已经准备好" };
  assert.doesNotThrow(() => validatePermissionEvent(cases(), executionLog, repeated));
  assert.deepEqual(getPermissionWorkSummary(cases(), executionLog).ready_group_ids.includes("待准备组"), false);
});

test("AC-05/10/17/27: malformed plans, unknown groups, and starts without verified permission fail closed", () => {
  const beforePlan = log([{ type: "workflow_profile", profile: "permission-batches-html-v1" }]);
  assert.throws(
    () => validatePermissionEvent(cases(), beforePlan, { type: "case_started", case_id: "Z-先出现" }),
    error => error.code === "RUN_CONSISTENCY" && /权限计划/.test(error.message)
  );

  const invalid = structuredClone(plan);
  invalid.groups[0].checkpoint_ids = ["UNKNOWN/s/o"];
  assert.throws(
    () => validatePermissionEvent(cases(), beforePlan, invalid),
    error => error.code === "RUN_CONSISTENCY" && /未知检查点/.test(error.message)
  );

  const openEnded = structuredClone(plan);
  openEnded.groups[0].unexpected = "must fail closed";
  assert.throws(
    () => validatePermissionEvent(cases(), beforePlan, openEnded),
    error => error.code === "RUN_CONSISTENCY" && /未知字段/.test(error.message)
  );

  const withPlan = log([{ type: "workflow_profile", profile: "permission-batches-html-v1" }, plan]);
  assert.throws(
    () => validatePermissionEvent(cases(), withPlan, { type: "checkpoint_started", checkpoint_id: "M-第三/s/o" }),
    error => error.code === "RUN_CONSISTENCY" && /未就绪/.test(error.message)
  );
  assert.throws(
    () => validatePermissionEvent(cases(), withPlan, { type: "permission_availability", group_id: "不存在", availability: "ready", account_ref: "acct", declaration: "用户说明" }),
    error => error.code === "RUN_CONSISTENCY"
  );
});

test("AC-08/15/16: permission_wait leaves product checkpoints pending and stop-waiting is explicit", () => {
  const executionLog = log([
    { type: "workflow_profile", profile: "permission-batches-html-v1" },
    plan,
    { type: "permission_wait", group_id: "待准备组", checkpoint_ids: ["M-第三/s/o"], reason: "等待用户自行准备风险审阅权限" },
    { type: "run_state", status: "awaiting_user" }
  ]);
  const state = derivePermissionState(cases(), executionLog);
  assert.deepEqual(state.waiting_checkpoint_ids, ["M-第三/s/o"]);
  assert.equal(executionLog.cases[2].checkpoints[0].result, null);
  assert.equal(state.completed, false);
  assert.throws(
    () => validatePermissionEvent(cases(), executionLog, { type: "run_state", status: "completed" }),
    error => error.code === "RUN_CONSISTENCY" && /未处理/.test(error.message)
  );
});

test("AC-06/17/27: a failed item does not drain independent work and a shared checkpoint requires every role group", () => {
  const source = {
    schema_version: "2.0",
    suite: { name: "复合权限", target_urls: ["https://staging.example.test"] },
    cases: [
      { case_id: "CROSS", module: "复核", title: "双角色复核", preconditions: [], steps: [{ step_id: "s", action: "复核", expected: [{ oracle_id: "o", text: "双方可确认" }] }] },
      { case_id: "NEXT", module: "复核", title: "独立后续", preconditions: [], steps: [{ step_id: "s", action: "查看", expected: [{ oracle_id: "o", text: "仍可查看" }] }] }
    ]
  };
  const compositePlan = {
    type: "permission_plan", version: "1.0", role_independent_case_ids: [], groups: [
      { group_id: "maker", role_text: "发起人", permissions: ["发起"], case_ids: ["CROSS"], checkpoint_ids: ["CROSS/s/o"], availability: "ready", account_ref: "acct-maker", preparation_owner: null, declaration: "用户确认" },
      { group_id: "checker", role_text: "复核人", permissions: ["复核"], case_ids: ["CROSS"], checkpoint_ids: ["CROSS/s/o"], availability: "ready", account_ref: "acct-checker", preparation_owner: null, declaration: "用户确认" },
      { group_id: "reader", role_text: "查看人", permissions: ["查看"], case_ids: ["NEXT"], checkpoint_ids: ["NEXT/s/o"], availability: "ready", account_ref: "acct-reader", preparation_owner: null, declaration: "用户确认" }
    ]
  };
  const executionLog = {
    run: { status: "running", actual_case_order: ["CROSS"], resume_count: 0 },
    cases: [
      { case_id: "CROSS", result: "failed", reason: "复核失败", checkpoints: [{ step_id: "s", oracle_id: "o", status: "completed", result: "failed" }] },
      { case_id: "NEXT", result: "undetermined", reason: "待处理", checkpoints: [{ step_id: "s", oracle_id: "o", status: "pending", result: null }] }
    ],
    events: [
      { type: "workflow_profile", profile: "permission-batches-html-v1" }, compositePlan,
      { type: "role_observation", observation: { group_id: "maker", account_ref: "acct-maker", role: "发起人", verification: "verified", description: "页面核验" } },
      { type: "role_observation", observation: { group_id: "reader", account_ref: "acct-reader", role: "查看人", verification: "verified", description: "页面核验" } }
    ].map((event, index) => ({ ...event, sequence: index + 1, at: `2026-09-15T00:01:0${index}.000Z` }))
  };
  assert.throws(
    () => validatePermissionEvent(source, { ...executionLog, cases: executionLog.cases.map((item, index) => index === 0 ? { ...item, result: "undetermined", checkpoints: [{ ...item.checkpoints[0], status: "pending", result: null }] } : item) }, { type: "checkpoint_started", checkpoint_id: "CROSS/s/o" }),
    /未经实际核验/
  );
  assert.deepEqual(getPermissionWorkSummary(source, executionLog).ready_group_ids, ["reader"]);
  assert.doesNotThrow(() => validatePermissionEvent(source, executionLog, { type: "case_started", case_id: "NEXT" }));
});

test("AC-30: all permission groups may be ready and no artificial waiting group is required", () => {
  const allReady = structuredClone(plan);
  allReady.groups.forEach((group, index) => {
    group.availability = "ready";
    group.account_ref = index < 2 ? "acct-shared" : `acct-${index}`;
    group.preparation_owner = null;
    group.declaration = "用户确认当前已就绪";
  });
  const events = [
    { type: "workflow_profile", profile: "permission-batches-html-v1" },
    allReady,
    ...allReady.groups.map(group => ({ type: "role_observation", observation: { group_id: group.group_id, account_ref: group.account_ref, role: group.role_text, verification: "verified", description: "页面显示所需权限" } }))
  ];
  const summary = getPermissionWorkSummary(cases(), log(events));
  assert.deepEqual(summary.ready_group_ids, ["第一组", "后排组", "待准备组", "无法提供组"]);
  assert.deepEqual(summary.user_preparation_required_group_ids, []);
  assert.deepEqual(summary.unavailable_group_ids, []);
  assert.deepEqual(summary.ready_unverified_group_ids, []);
});

test("AC-31/32: multiple groups can become ready in one notice and completed batches survive later resume cycles", () => {
  const executionLog = log([
    { type: "workflow_profile", profile: "permission-batches-html-v1" },
    plan,
    { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户说明风险审阅和配置两组都已准备" },
    { type: "permission_availability", group_id: "无法提供组", availability: "ready", account_ref: "acct-config", declaration: "用户说明风险审阅和配置两组都已准备" },
    { type: "role_observation", observation: { group_id: "待准备组", account_ref: "acct-risk", role: "风险审阅人", verification: "verified", description: "页面显示风险审阅权限" } },
    { type: "role_observation", observation: { group_id: "无法提供组", account_ref: "acct-config", role: "租户配置人", verification: "verified", description: "页面显示租户配置权限" } },
    { type: "resume_check", resume_count: 2 }
  ]);
  executionLog.cases[2].checkpoints[0] = { step_id: "s", oracle_id: "o", status: "completed", result: "passed" };
  const state = derivePermissionState(cases(), executionLog);
  assert.equal(state.groups.find(group => group.group_id === "待准备组").verification, "verified", "completed batch keeps its verified historical observation");
  assert.equal(state.groups.find(group => group.group_id === "无法提供组").verification, "stale", "unfinished batch must be reverified after a later resume");
  assert.equal(state.groups.find(group => group.group_id === "待准备组").account_ref, "acct-risk");
  assert.equal(state.groups.find(group => group.group_id === "无法提供组").account_ref, "acct-config");
});

test("AC-20: a completed permission batch does not expose its obsolete wait reason as current state", () => {
  const executionLog = log([
    { type: "workflow_profile", profile: "permission-batches-html-v1" },
    plan,
    { type: "permission_wait", group_id: "待准备组", checkpoint_ids: ["M-第三/s/o"], reason: "等待用户准备风险审阅权限" },
    { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户说明已经准备完成" },
    { type: "role_observation", observation: { group_id: "待准备组", account_ref: "acct-risk", role: "风险审阅人", verification: "verified", description: "页面显示风险审阅权限" } },
    { type: "permission_batch", group_id: "待准备组", phase: "drained", description: "风险审阅批次已完成" }
  ]);
  executionLog.cases[2].checkpoints[0] = { step_id: "s", oracle_id: "o", status: "completed", result: "passed" };
  const group = derivePermissionState(cases(), executionLog).groups.find(item => item.group_id === "待准备组");
  assert.equal(group.wait_reason, null);
  assert.deepEqual(group.wait_checkpoint_ids, []);
  assert.equal(group.batch_description, "风险审阅批次已完成");
});
