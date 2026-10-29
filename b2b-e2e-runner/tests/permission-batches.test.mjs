import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePermissionState,
  getPermissionWorkSummary,
  validatePermissionEvent
} from "../scripts/lib/permission-batches.mjs";
import { validateCoverageEvent } from "../scripts/lib/execution-coverage.mjs";
import { validateProgressEvent } from "../scripts/lib/execution-progress.mjs";
import { validateExecutionFact } from "../scripts/lib/execution-facts.mjs";

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

function log(events = [], source = cases()) {
  return {
    run: { status: "running", actual_case_order: [], resume_count: 0 },
    cases: source.cases.map(item => ({
      case_id: item.case_id,
      result: "undetermined",
      reason: "检查点尚未全部执行",
      checkpoints: [{ step_id: "s", oracle_id: "o", status: "pending", result: null }]
    })),
    events: events.map((event, index) => ({ ...event, sequence: index + 1, at: `2026-09-15T00:00:0${index}.000Z` }))
  };
}

// These reducer fixtures declare their original input order before the Run exists.
// Risk completion tests start with the risk case; no active plan is reordered.
function riskFirstCases() {
  const source = cases();
  source.cases = [source.cases[2], ...source.cases.filter(item => item.case_id !== "M-第三")];
  return source;
}

function appendFact(source, executionLog, event) {
  validatePermissionEvent(source, executionLog, event);
  validateCoverageEvent(source, executionLog, event);
  validateProgressEvent(source, executionLog, event);
  validateExecutionFact(source, executionLog, event);
  const stored = { ...structuredClone(event), sequence: executionLog.events.length + 1,
    at: new Date(Date.UTC(2026, 8, 15, 0, 0, executionLog.events.length)).toISOString() };
  executionLog.events.push(stored);
  return stored;
}

function completeCheckpoint(source, executionLog, checkpointId, result = "passed") {
  executionLog.extensions = { execution_coverage: { schema_version: "1.0" } };
  executionLog.test_cases = { sha256: "a".repeat(64) };
  executionLog.browser = { owned_target_ids: ["target-fixture"], preexisting_target_ids: [], attached_preexisting_target_ids: [] };
  const permission = executionLog.events.find(event => event.type === "permission_plan");
  const items = source.cases.flatMap(item => item.steps.flatMap(step => step.expected.map(oracle => {
    const id = `${item.case_id}/${step.step_id}/${oracle.oracle_id}`;
    return { checkpoint_id: id, dependencies: [], scopes: [{ scope_id: `scope-${id}`,
      group_ids: permission.groups.filter(group => group.checkpoint_ids.includes(id)).map(group => group.group_id),
      location_ref: "https://staging.example.test/review", location_status: "known", step_refs: [`${item.case_id}/${step.step_id}`],
      source_refs: [`snapshot:${item.case_id}/${step.step_id}`] }] };
  })));
  appendFact(source, executionLog, { type: "coverage_plan", action: "initial", revision: 1,
    snapshot_hash: executionLog.test_cases.sha256, source: "组件原用例与权限计划", items });
  const scope = items.find(item => item.checkpoint_id === checkpointId).scopes[0];
  const groups = derivePermissionState(source, executionLog).groups.filter(group => scope.group_ids.includes(group.group_id));
  const account = groups[0].account_ref;
  const roleRefs = groups.map(group => appendFact(source, executionLog, { type: "role_observation", observation: {
    group_id: group.group_id, account_ref: account, observed_account_ref: account,
    verification_scope: "execution_context", verification: "verified", target_id: "target-fixture",
    context_ref: "profile-fixture", environment_ref: "staging", switch_status: "not_required", description: "组件页面事实已核对账号与权限"
  } }).sequence);
  if (scope.group_ids.length === 1) appendFact(source, executionLog, { type: "permission_batch", group_id: scope.group_ids[0], phase: "started", description: "开始原输入中的首个权限批次" });
  const context = appendFact(source, executionLog, { type: "coverage_context", scope_ids: [scope.scope_id],
    account_ref: account, observed_account_ref: account, target_id: "target-fixture", context_ref: "profile-fixture",
    environment_ref: "staging", observed_url: scope.location_ref, verification: "verified", switch_status: "not_required",
    fact_refs: roleRefs, role_observation_refs: roleRefs });
  const fact = appendFact(source, executionLog, { type: "page_observation", checkpoint_ids: [checkpointId],
    target_id: "target-fixture", context_ref: "profile-fixture", description: "组件页面准备数据已存在" });
  const execution_id = `execution-${checkpointId}`;
  const scenario_id = scope.scope_id;
  const preparation = appendFact(source, executionLog, { type: "scenario_preparation", checkpoint_id: checkpointId,
    scenario_id, execution_id, batch_id: [...scope.group_ids].sort().join("+"), context_refs: [context.sequence],
    fact_refs: [fact.sequence], data_source: "real", permission_source: "real" });
  appendFact(source, executionLog, { type: "checkpoint_started", checkpoint_id: checkpointId, scenario_id, execution_id,
    preparation_ref: preparation.sequence, scope_ids: [scope.scope_id], context_refs: [context.sequence] });
  const action = appendFact(source, executionLog, { type: "action_dispatched", checkpoint_id: checkpointId, scenario_id, execution_id,
    action_id: `action-${checkpointId}`, side_effect: false, description: "执行组件检查动作" });
  const failedExplanation = "实际操作顺序：执行组件检查动作，失败发生在观察页面。\n预期与页面实际表现：预期：检查点通过；页面实际表现：组件页面结果为 failed，弹窗未出现。\n实际表现和预期的差异：组件实际动作与页面事实";
  const observed = appendFact(source, executionLog, { type: "page_observation", checkpoint_ids: [checkpointId], scenario_id,
    execution_id, action_id: action.action_id, target_id: "target-fixture", context_ref: "profile-fixture", description: result === "failed" ? failedExplanation : `组件页面结果为 ${result}` });
  const review = appendFact(source, executionLog, { type: "coverage_review", review_id: `close-${checkpointId}`,
    purpose: "checkpoint_close", plan_revision: 1, based_on_sequence: executionLog.events.length, scope_ids: [scope.scope_id],
    checkpoint_ids: [checkpointId], fact_refs: [observed.sequence], assistance_refs: [], ready_scope_ids: [scope.scope_id],
    preparable_scope_ids: [], blocked_scope_ids: [], closures: [{ checkpoint_id: checkpointId, closure_kind: "observed", basis_refs: [observed.sequence] }],
    choice: "close", reason: "动作后页面观察完成" });
  appendFact(source, executionLog, { type: "checkpoint_result", checkpoint_id: checkpointId, scenario_id, execution_id,
    result, reason: result === "failed" ? failedExplanation : "组件实际动作与页面事实", execution_refs: [action.sequence, observed.sequence], coverage_review_ref: review.sequence });
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
    { type: "workflow_profile", profile: "b2b-e2e-current" },
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
  const source = riskFirstCases();
  const executionLog = log([
    { type: "workflow_profile", profile: "b2b-e2e-current" },
    plan,
    { type: "role_observation", observation: { group_id: "第一组", account_ref: "acct-shared", role: "区域订单查看人", verification: "verified", description: "旧会话已核验" } },
    { type: "permission_availability", group_id: "后排组", availability: "ready", account_ref: "acct-shared", declaration: "同一账号新增财务授权" },
    { type: "role_observation", observation: { group_id: "后排组", account_ref: "acct-shared", role: "财务复核人", verification: "mismatch", description: "页面仍没有导出入口" } },
    { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户一次通知风险组也已准备" },
    { type: "role_observation", observation: { group_id: "待准备组", account_ref: "acct-risk", role: "风险审阅人", verification: "verified", description: "页面已显示审阅能力" } }
  ], source);
  const state = derivePermissionState(source, executionLog);
  assert.equal(state.groups.find(group => group.group_id === "第一组").verification, "stale");
  assert.equal(state.groups.find(group => group.group_id === "后排组").verification, "mismatch");
  assert.equal(state.groups.find(group => group.group_id === "待准备组").verification, "verified");

  completeCheckpoint(source, executionLog, "M-第三/s/o");
  assert.equal(executionLog.cases.find(item => item.case_id === "M-第三").checkpoints[0].result, null, "progress comes from validated events even while the component cache is pending");
  const repeated = { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户重复说明已经准备好" };
  assert.doesNotThrow(() => validatePermissionEvent(source, executionLog, repeated));
  assert.deepEqual(getPermissionWorkSummary(source, executionLog).ready_group_ids.includes("待准备组"), false);
});

test("AC-05/10/17/27: malformed plans, unknown groups, and starts without verified permission fail closed", () => {
  const beforePlan = log([{ type: "workflow_profile", profile: "b2b-e2e-current" }]);
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

  const withPlan = log([{ type: "workflow_profile", profile: "b2b-e2e-current" }, plan]);
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
    { type: "workflow_profile", profile: "b2b-e2e-current" },
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
    error => error.code === "RUN_CONSISTENCY" && /未处理|未实际执行/.test(error.message)
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
      { group_id: "checker", role_text: "复核人", permissions: ["复核"], case_ids: ["CROSS"], checkpoint_ids: ["CROSS/s/o"], availability: "ready", account_ref: "acct-maker", preparation_owner: null, declaration: "用户确认" },
      { group_id: "reader", role_text: "查看人", permissions: ["查看"], case_ids: ["NEXT"], checkpoint_ids: ["NEXT/s/o"], availability: "ready", account_ref: "acct-reader", preparation_owner: null, declaration: "用户确认" }
    ]
  };
  const executionLog = {
    run: { status: "running", actual_case_order: ["CROSS"], resume_count: 0 },
    cases: [
      { case_id: "CROSS", result: "undetermined", reason: "待处理", checkpoints: [{ step_id: "s", oracle_id: "o", status: "pending", result: null }] },
      { case_id: "NEXT", result: "undetermined", reason: "待处理", checkpoints: [{ step_id: "s", oracle_id: "o", status: "pending", result: null }] }
    ],
    events: [
      { type: "workflow_profile", profile: "b2b-e2e-current" }, compositePlan,
      { type: "role_observation", observation: { group_id: "maker", account_ref: "acct-maker", role: "发起人", verification: "verified", description: "页面核验" } },
      { type: "role_observation", observation: { group_id: "reader", account_ref: "acct-reader", role: "查看人", verification: "verified", description: "页面核验" } }
    ].map((event, index) => ({ ...event, sequence: index + 1, at: `2026-09-15T00:01:0${index}.000Z` }))
  };
  assert.throws(
    () => validatePermissionEvent(source, executionLog, { type: "checkpoint_started", checkpoint_id: "CROSS/s/o" }),
    /未经实际核验/
  );
  completeCheckpoint(source, executionLog, "CROSS/s/o", "failed");
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
    { type: "workflow_profile", profile: "b2b-e2e-current" },
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
  const source = riskFirstCases();
  const executionLog = log([
    { type: "workflow_profile", profile: "b2b-e2e-current" },
    plan,
    { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户说明风险审阅和配置两组都已准备" },
    { type: "permission_availability", group_id: "无法提供组", availability: "ready", account_ref: "acct-config", declaration: "用户说明风险审阅和配置两组都已准备" },
    { type: "role_observation", observation: { group_id: "待准备组", account_ref: "acct-risk", role: "风险审阅人", verification: "verified", description: "页面显示风险审阅权限" } },
    { type: "role_observation", observation: { group_id: "无法提供组", account_ref: "acct-config", role: "租户配置人", verification: "verified", description: "页面显示租户配置权限" } }
  ], source);
  completeCheckpoint(source, executionLog, "M-第三/s/o");
  appendFact(source, executionLog, { type: "resume_check", resume_count: 2 });
  const state = derivePermissionState(source, executionLog);
  assert.equal(state.groups.find(group => group.group_id === "待准备组").verification, "verified", "completed batch keeps its verified historical observation");
  assert.equal(state.groups.find(group => group.group_id === "无法提供组").verification, "stale", "unfinished batch must be reverified after a later resume");
  assert.equal(state.groups.find(group => group.group_id === "待准备组").account_ref, "acct-risk");
  assert.equal(state.groups.find(group => group.group_id === "无法提供组").account_ref, "acct-config");
});

test("AC-20: a completed permission batch does not expose its obsolete wait reason as current state", () => {
  const source = riskFirstCases();
  const executionLog = log([
    { type: "workflow_profile", profile: "b2b-e2e-current" },
    plan,
    { type: "permission_wait", group_id: "待准备组", checkpoint_ids: ["M-第三/s/o"], reason: "等待用户准备风险审阅权限" },
    { type: "permission_availability", group_id: "待准备组", availability: "ready", account_ref: "acct-risk", declaration: "用户说明已经准备完成" },
    { type: "role_observation", observation: { group_id: "待准备组", account_ref: "acct-risk", role: "风险审阅人", verification: "verified", description: "页面显示风险审阅权限" } }
  ], source);
  completeCheckpoint(source, executionLog, "M-第三/s/o");
  const review = appendFact(source, executionLog, { type: "coverage_review", review_id: "risk-batch-end", purpose: "batch_end",
    plan_revision: 1, based_on_sequence: executionLog.events.length, scope_ids: ["scope-M-第三/s/o"], checkpoint_ids: ["M-第三/s/o"],
    fact_refs: [executionLog.events.at(-1).sequence], assistance_refs: [], ready_scope_ids: [], preparable_scope_ids: [], blocked_scope_ids: [],
    closures: [], choice: "drain", reason: "风险审阅检查已完成" });
  appendFact(source, executionLog, { type: "permission_batch", group_id: "待准备组", phase: "drained", description: "风险审阅批次已完成", coverage_review_ref: review.sequence });
  const group = derivePermissionState(source, executionLog).groups.find(item => item.group_id === "待准备组");
  assert.equal(group.wait_reason, null);
  assert.deepEqual(group.wait_checkpoint_ids, []);
  assert.equal(group.batch_description, "风险审阅批次已完成");
});
