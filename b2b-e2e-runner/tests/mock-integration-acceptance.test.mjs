import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as runtime from "../scripts/run-artifacts.mjs";
import { CURRENT_WORKFLOW } from "../scripts/lib/workflow-contract.mjs";
import { fixtureState, recordFixtureEvent, recordFixtureScreenshotGaps } from "./test-helpers.mjs";

// Public API component fixtures only; these events do not claim real Chrome evidence.
async function setup(t, { grouped = false, decision = "allowed", multiScenario = false, unavailable = false, requestBehavior = false, responseConsumption = false, dependencyKind } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "mock-integration-acceptance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ids = grouped || dependencyKind ? ["FIRST", "NEXT"] : ["FIRST"];
  const run = await runtime.initializeRun({ workspaceRoot: root, workflowProfile: CURRENT_WORKFLOW, mockFallback: decision,
    casesInput: { schema_version: "2.0", suite: { name: "Mock integration component fixture", target_urls: ["http://localhost"] },
      cases: ids.map(case_id => ({ case_id, module: "详情", title: dependencyKind && case_id === "NEXT" ? "实际创建业务记录" : "显示业务详情", preconditions: [dependencyKind && case_id === "FIRST" ? (dependencyKind === "preparation" ? "仅需已存在的可查看记录，创建为数据准备途径" : "必须先实际执行 NEXT 创建记录并得到新ID") : "存在可查看的记录"],
        steps: [{ step_id: "s", action: dependencyKind && case_id === "NEXT" ? "实际点击创建记录并观察新ID" : "打开记录详情", expected: [{ oracle_id: "o", text: dependencyKind && case_id === "NEXT" ? "真实页面实际创建步骤显示新ID" : requestBehavior ? "非空和空名称两条件下，前端本地查看不应发送保存请求" : multiScenario ? "有效名称显示原文，空名称显示占位文案" : "页面显示记录名称" }] }] })) }
  });
  const groups = grouped ? ids.map((caseId, index) => ({ group_id: `g${index + 1}`, role_text: `查看配置${index + 1}`, permissions: [`查看范围${index + 1}`],
    case_ids: [caseId], checkpoint_ids: [`${caseId}/s/o`], availability: unavailable && index === 0 ? "unavailable" : "ready", account_ref: unavailable && index === 0 ? null : `acct${index + 1}`, preparation_owner: unavailable && index === 0 ? "user" : null, declaration: unavailable && index === 0 ? "用户明确当前无法提供该权限配置" : "组件夹具用户已确认账号可用" })) : [];
  await runtime.recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups, role_independent_case_ids: grouped ? [] : ids });
  const { log } = await fixtureState(run.runRoot);
  await runtime.recordEvent(run.runRoot, { type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: log.test_cases.sha256, source: "原快照中的详情断言",
    items: ids.map((caseId, index) => ({ checkpoint_id: `${caseId}/s/o`, dependencies: dependencyKind && caseId === "FIRST" ? [{ dependency_id: "record-input", step_refs: ["NEXT/s"], checkpoint_refs: ["NEXT/s/o"], required_fact: dependencyKind === "preparation" ? "已有详情记录输入" : "原文明确要求实际执行创建步骤", source_refs: ["snapshot:FIRST/s"], condition_kind: dependencyKind }] : [], scopes: [{ scope_id: `scope:${caseId}`, group_ids: grouped ? [`g${index + 1}`] : [],
      location_ref: "http://localhost", location_status: "known", step_refs: [`${caseId}/s`], source_refs: [`snapshot:${caseId}/s`], ...(multiScenario ? { scenario_requirements: ["with-name", "empty-name"].map(scenario_id => ({ scenario_id, step_refs: [`${caseId}/s`], source_refs: [`snapshot:${caseId}/s`], preconditions: [scenario_id === "with-name" ? "记录名称为非空字符串" : "记录名称为空字符串"], assertion_kind: requestBehavior ? "request_behavior" : responseConsumption ? "response_consumption" : "ui", assertion_domain: "frontend", chain_id: null })) } : {}) }] })) });
  for (const group of groups.filter(group => group.availability === "ready")) await recordFixtureEvent(run.runRoot, { type: "role_observation", observation: {
    group_id: group.group_id, account_ref: group.account_ref, role: group.role_text, verification: "verified", description: "组件夹具实际身份核验事实；不验证被测页面效果" } });
  await recordFixtureScreenshotGaps(run.runRoot);
  return run;
}

async function realGap(runRoot, { close = true, candidate = false } = {}) {
  const checkpointId = "FIRST/s/o";
  const blocker = await runtime.recordEvent(runRoot, { type: "blocker", checkpoint_ids: [checkpointId], description: "合法列表请求成功但无可查看的记录",
    exploration_summary: { checkpoint_ids: [checkpointId], missing_fact: "记录 ID", known_facts: ["列表返回 200 空数组"],
      attempts: [{ action: "查看授权内列表和筛选结果", observation: "没有符合条件的数据" }], cannot_continue_reason: "缺少记录 ID 无法打开详情" } });
  const gap = await runtime.recordEvent(runRoot, { type: "data_gap", gap_id: "gap1", checkpoint_ids: [checkpointId], real_blocker_refs: [blocker.sequence], exploration_refs: [blocker.sequence],
    missing_conditions: ["详情记录 ID"], known_request_facts: ["GET /api/items 返回 200 空数组"], not_started_dependencies: ["打开详情需要记录 ID"] });
  if (close) {
    const review = await runtime.recordEvent(runRoot, { type: "coverage_review", review_id: "gap-close", purpose: "checkpoint_close", plan_revision: 1,
      based_on_sequence: gap.sequence, scope_ids: ["scope:FIRST"], checkpoint_ids: [checkpointId], fact_refs: [blocker.sequence, gap.sequence], assistance_refs: [],
      ready_scope_ids: [], preparable_scope_ids: [], blocked_scope_ids: ["scope:FIRST"], closures: [{ checkpoint_id: checkpointId, closure_kind: "dependency_blocked", basis_refs: [gap.sequence], not_attempted_reason: "详情需要真实记录 ID" }], choice: "close_undetermined", reason: "探索证实缺少真实数据" });
    await runtime.recordEvent(runRoot, { type: "checkpoint_result", checkpoint_id: checkpointId, result: "undetermined", reason: "真实详情数据缺失", observation: "列表为空，尚未执行详情断言",
      evidence_status: "missing", exploration_ref: blocker.sequence, data_gap_ref: gap.sequence, not_attempted_reason: "缺少真实记录 ID", execution_refs: [], coverage_review_ref: review.sequence });
  }
  if (candidate) await runtime.recordEvent(runRoot, { type: "mock_candidate", candidate_id: "candidate1", case_id: "FIRST", checkpoint_ids: [checkpointId], gap_ids: ["gap1"],
    assertion_domain: "frontend", assertion_basis: "原 expected 只判断详情名称展示", purpose: "补充缺少数据时的前端详情验证" });
  return { blocker, gap };
}

async function currentContext(runRoot) {
  const { log } = await fixtureState(runRoot);
  const prior = [...log.events].reverse().find(event => event.type === "coverage_context" && event.scope_ids.includes("scope:FIRST"));
  if (prior) return { context_refs: [prior.sequence] };
  const role = log.events.find(event => event.type === "role_observation" && event.observation.group_id === "g1");
  const identity = role?.observation;
  const targetId = identity?.target_id ?? "fixture-target";
  if (!log.browser.owned_target_ids.includes(targetId)) await runtime.recordEvent(runRoot, { type: "target_inventory", owned_target_ids: [...log.browser.owned_target_ids, targetId], preexisting_target_ids: [], attached_preexisting_target_ids: [] });
  const { log: fresh } = await fixtureState(runRoot);
  const context = await runtime.recordEvent(runRoot, { type: "coverage_context", scope_ids: ["scope:FIRST"], account_ref: identity?.account_ref ?? null,
    observed_account_ref: identity?.observed_account_ref ?? null, target_id: targetId, context_ref: identity?.context_ref ?? "fixture-context", environment_ref: "fixture", observed_url: "http://localhost",
    verification: "verified", switch_status: "not_required", fact_refs: [fresh.events.at(-1).sequence], ...(role ? { role_observation_refs: [role.sequence] } : {}) });
  return { context_refs: [context.sequence] };
}

async function batchReview(runRoot) {
  const prepared = await currentContext(runRoot);
  const { log } = await fixtureState(runRoot);
  const complete = log.cases[0].checkpoints[0].result !== null;
  return runtime.recordEvent(runRoot, { type: "coverage_review", review_id: `batch-${log.events.length}`, purpose: "batch_end", plan_revision: 1,
    based_on_sequence: log.events.length, scope_ids: ["scope:FIRST"], checkpoint_ids: ["FIRST/s/o"], fact_refs: prepared.context_refs, assistance_refs: [],
    ready_scope_ids: complete ? [] : ["scope:FIRST"], preparable_scope_ids: [], blocked_scope_ids: [], closures: [],
    choice: "continue", reason: complete ? "原检查点已处理" : "当前批次仍有未执行详情" });
}

for (const closedCandidate of [false, true]) {
  test(`AC11: allowed Mock cannot complete with ${closedCandidate ? "unsupported candidate closure" : "a gap omitted from candidates"}`, async t => {
    const run = await setup(t);
    const { gap } = await realGap(run.runRoot, { candidate: closedCandidate });
    if (closedCandidate) await runtime.recordEvent(run.runRoot, { type: "mock_disposition", candidate_id: "candidate1", outcome: "unsupported", basis_refs: [gap.sequence] });
    await runtime.validateRun(run.runRoot, { checkReport: false });
    await assert.rejects(recordFixtureEvent(run.runRoot, { type: "run_state", status: "completed" }), /场景|执行|完成|Mock|覆盖/);
  });
}

test("AC11: report and deliver cannot label an allowed unresolved gap as normal final delivery", async t => {
  const run = await setup(t);
  await realGap(run.runRoot);
  // A safe refusal by any public completion gate is sufficient. Never forge run.status.
  try { await recordFixtureEvent(run.runRoot, { type: "run_state", status: "completed" }); }
  catch (error) { assert.match(error.message, /场景|执行|完成|Mock|覆盖/); return; }
  const report = await runtime.generateReport(run.runRoot);
  const delivery = await runtime.deliverReport(run.runRoot);
  assert.notEqual(report.delivery.kind, "final", "original undetermined fields are not full frontend coverage");
  assert.notEqual(delivery.delivery?.kind, "final");
  assert.equal(delivery.deliverable, false);
});

test("AC20 control: declined Mock retains legal real data-gap final delivery", async t => {
  const run = await setup(t, { decision: "declined" });
  await realGap(run.runRoot);
  await recordFixtureEvent(run.runRoot, { type: "run_state", status: "completed" });
  const result = await runtime.deliverReport(run.runRoot);
  assert.equal(result.delivery.kind, "final");
  assert.equal(result.counts.undetermined, 1);
});

test("AC11/12: permission batch cannot be drained while its frontend checkpoint is unexecuted", async t => {
  const run = await setup(t, { grouped: true });
  await runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g1", phase: "started", description: "开始第一个固定权限配置" });
  const review = await batchReview(run.runRoot);
  await assert.rejects(runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g1", phase: "drained", coverage_review_ref: review.sequence, description: "仍有未执行详情，不能收尾" }), /批次|场景|执行|完成|检查点/);
});

test("AC12: a verified next permission configuration cannot interrupt an unfinished batch", async t => {
  const run = await setup(t, { grouped: true });
  await runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g1", phase: "started", description: "开始第一个固定权限配置" });
  await assert.rejects(runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g2", phase: "started", description: "第二配置就绪也不能提前切走" }), /批次|配置|未完成|顺序|连续/);
});

test("AC12: a legally completed permission configuration cannot be reopened", async t => {
  const run = await setup(t, { grouped: true, decision: "declined" });
  await runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g1", phase: "started", description: "开始第一个配置" });
  const execution = await prepareScenario(run.runRoot, "scope:FIRST", { batchId: "g1" });
  await scenarioResult(run.runRoot, execution, await observeScenario(run.runRoot, execution), "passed");
  const review = await batchReview(run.runRoot);
  await runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g1", phase: "drained", coverage_review_ref: review.sequence, description: "第一个配置原检查点全部完成" });
  await runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g2", phase: "started", description: "继续第二个固定配置" });
  await assert.rejects(runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g1", phase: "started", description: "禁止返回已结束配置" }), /批次|配置|结束|重开|顺序|连续/);
});

test("AC13: unresolved knowledge assistance keeps the active permission batch despite another ready configuration", async t => {
  const run = await setup(t, { grouped: true });
  await runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g1", phase: "started", description: "开始第一个配置" });
  await runtime.recordEvent(run.runRoot, { type: "assistance", assistance_id: "contract-help", phase: "requested", checkpoint_ids: ["FIRST/s/o"], group_ids: ["g1"],
    description: "已观察空列表，但详情字段语义未知", attempts: ["检查合法页面和 Network 返回"], required_user_action: "提供详情响应中名称字段定义", decision_source: "agent" });
  await assert.rejects(runtime.recordEvent(run.runRoot, { type: "permission_batch", group_id: "g2", phase: "started", description: "等待知识期间不得切换其他配置" }), /批次|配置|未完成|协作|顺序|连续/);
});

for (const result of ["passed", "failed"]) {
  test(`AC07: a mock receipt alone cannot produce a ${result} frontend conclusion`, async t => {
    const run = await setup(t);
    await realGap(run.runRoot, { candidate: true });
    const prepared = await currentContext(run.runRoot);
    await runtime.recordEvent(run.runRoot, { type: "mock_attempt", attempt_id: "attempt1", candidate_ids: ["candidate1"], case_id: "FIRST", action: "started",
      scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: prepared.context_refs, proxy_cycle_refs: ["cycle1"], candidate_checkpoint_ids: ["FIRST/s/o"], supporting_checkpoint_ids: [] });
    const execution = await prepareScenario(run.runRoot, "scope:FIRST", { mock: true, context: prepared });
    const receipt = await runtime.recordEvent(run.runRoot, { type: "mock_observation", attempt_id: "attempt1", receipt_id: "receipt1", route_id: "detail", request_id: "request1", disposition: "mocked",
      request_facts: ["组件夹具只导入 GET /api/items/fixture 回执，没有页面操作"], response_facts: ["200 name=fixture"], state_before_version: 0, state_after_version: 1, evidence_refs: [], proxy_cycle_ref: "cycle1" });
    const review = await runtime.recordEvent(run.runRoot, { type: "coverage_review", review_id: "receipt-only-close", purpose: "checkpoint_close", plan_revision: 1,
      based_on_sequence: receipt.sequence, scope_ids: ["scope:FIRST"], checkpoint_ids: ["FIRST/s/o"], fact_refs: [receipt.sequence], assistance_refs: [], ready_scope_ids: ["scope:FIRST"], preparable_scope_ids: [], blocked_scope_ids: [],
      closures: [{ checkpoint_id: "FIRST/s/o", closure_kind: "observed", basis_refs: [receipt.sequence] }], choice: "close", reason: "只有代理回执，不能证明前端实际判断" });
    await assert.rejects(runtime.recordEvent(run.runRoot, { type: "mock_checkpoint", ...execution, attempt_id: "attempt1", action: "result", result,
      observation: "尚无页面观察", reason: "仅凭回执不得形成产品结论", evidence_refs: [], request_refs: ["receipt1"], execution_refs: [receipt.sequence], coverage_review_ref: review.sequence }), /页面|准备|触发|执行|事实|page_observation/);
  });
}

async function prepareScenario(runRoot, scenarioId, { batchId = "general", mock = false, context: suppliedContext, permissionRef, startAttemptId = "attempt1", stateVersion = 0, preparedDependencyId } = {}) {
  const context = suppliedContext ?? await currentContext(runRoot);
  const identity = { checkpoint_id: "FIRST/s/o", scenario_id: scenarioId, execution_id: `execution:${scenarioId}`, batch_id: batchId };
  const input = await runtime.recordEvent(runRoot, { type: "network_observation", checkpoint_ids: ["FIRST/s/o"], ...identity, ...(mock ? { attempt_id: "attempt1", scenario_hash: "b".repeat(64), state_version: stateVersion } : {}),
    description: scenarioId === "with-name" ? "组件夹具已核对真实前置输入 name=fixture" : "组件夹具已核对真实前置输入 name为空字符串" });
  const prepared = await runtime.recordEvent(runRoot, { type: "scenario_preparation", ...identity, context_refs: context.context_refs,
    fact_refs: [input.sequence], data_source: mock ? "mock" : "real", permission_source: permissionRef ? "mock" : "real",
    ...(mock || permissionRef ? { attempt_id: "attempt1", scenario_hash: "b".repeat(64), state_version: stateVersion } : {}), ...(permissionRef ? { simulated_permission_ref: permissionRef } : {}), ...(preparedDependencyId ? { prepared_dependencies: [{ dependency_id: preparedDependencyId, fact_refs: [input.sequence] }] } : {}) });
  const execution = { ...identity, preparation_ref: prepared.sequence, ...(mock || permissionRef ? { attempt_id: startAttemptId } : {}) };
  await runtime.recordEvent(runRoot, { type: mock || permissionRef ? "mock_checkpoint" : "checkpoint_started", ...(mock || permissionRef ? { action: "started" } : {}), ...execution, scope_ids: ["scope:FIRST"], context_refs: context.context_refs });
  return execution;
}

async function observeScenario(runRoot, execution) {
  const actionId = `action:${execution.scenario_id}`;
  await runtime.recordEvent(runRoot, { type: "action_dispatched", ...execution, action_id: actionId, side_effect: false, description: "组件夹具导航实际触发该输入的详情展示" });
  return runtime.recordEvent(runRoot, { type: "page_observation", ...execution, checkpoint_ids: ["FIRST/s/o"], action_id: actionId, description: `组件夹具页面观察 ${execution.scenario_id}` });
}

async function scenarioResult(runRoot, execution, observation, result) {
  const { log } = await fixtureState(runRoot);
  const review = await runtime.recordEvent(runRoot, { type: "coverage_review", review_id: `scenario-close:${log.events.length}`, purpose: "checkpoint_close", plan_revision: 1,
    based_on_sequence: log.events.length, scope_ids: ["scope:FIRST"], checkpoint_ids: ["FIRST/s/o"], fact_refs: [observation.sequence], assistance_refs: [], ready_scope_ids: ["scope:FIRST"], preparable_scope_ids: [], blocked_scope_ids: [],
    closures: [{ checkpoint_id: "FIRST/s/o", closure_kind: "observed", basis_refs: [observation.sequence] }], choice: "close", reason: "只关闭已触发和观察的当前场景，不省略同 expected 另一分支" });
  return runtime.recordEvent(runRoot, { type: "checkpoint_result", ...execution, result, reason: result === "failed" ? "原非空名称展示断言失败" : "空名称占位文案符合原断言",
    observation: `页面事实属于 ${execution.scenario_id}`, evidence_status: "missing", execution_refs: [observation.sequence], coverage_review_ref: review.sequence });
}

test("AC10/19: first required scenario failure preserves failure without completing or blocking the remaining branch", async t => {
  const run = await setup(t, { multiScenario: true });
  const first = await prepareScenario(run.runRoot, "with-name");
  await scenarioResult(run.runRoot, first, await observeScenario(run.runRoot, first), "failed");
  await assert.rejects(recordFixtureEvent(run.runRoot, { type: "run_state", status: "completed" }), /场景|覆盖|未完成|未执行/);
  const second = await prepareScenario(run.runRoot, "empty-name");
  await scenarioResult(run.runRoot, second, await observeScenario(run.runRoot, second), "passed");
  await recordFixtureEvent(run.runRoot, { type: "run_state", status: "completed" });
  const result = await runtime.deliverReport(run.runRoot);
  assert.equal(result.delivery.kind, "final");
  assert.equal(result.counts.failed, 1, "the other branch passing must never erase the genuine frontend failure");
});

for (const result of ["passed", "failed"]) {
  test(`AC07/08: ${result} cannot borrow another required scenario's action and page observation`, async t => {
    const run = await setup(t, { multiScenario: true });
    const first = await prepareScenario(run.runRoot, "with-name");
    const second = await prepareScenario(run.runRoot, "empty-name");
    const otherObservation = await observeScenario(run.runRoot, second);
    await assert.rejects(scenarioResult(run.runRoot, first, otherObservation, result), /场景|执行|准备|触发|引用|观察/);
  });
}

async function startMockAttempt(runRoot, contextRefs) {
  return runtime.recordEvent(runRoot, { type: "mock_attempt", attempt_id: "attempt1", candidate_ids: ["candidate1"], case_id: "FIRST", action: "started",
    scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: contextRefs, proxy_cycle_refs: ["cycle1"], candidate_checkpoint_ids: ["FIRST/s/o"], supporting_checkpoint_ids: [] });
}

async function mockResult(runRoot, execution, page, { requestObservation, result = "passed" } = {}) {
  const refs = [page.sequence, ...(requestObservation ? [requestObservation.sequence] : [])];
  const { log } = await fixtureState(runRoot);
  const review = await runtime.recordEvent(runRoot, { type: "coverage_review", review_id: `mock-result:${log.events.length}`, purpose: "checkpoint_close", plan_revision: 1,
    based_on_sequence: log.events.length, scope_ids: ["scope:FIRST"], checkpoint_ids: ["FIRST/s/o"], fact_refs: refs, assistance_refs: [], ready_scope_ids: ["scope:FIRST"], preparable_scope_ids: [], blocked_scope_ids: [],
    closures: [{ checkpoint_id: "FIRST/s/o", closure_kind: "observed", basis_refs: refs }], choice: "close", reason: "依据当前场景操作与页面事实判断，不以 Mock 命中作为前提" });
  return runtime.recordEvent(runRoot, { type: "mock_checkpoint", ...execution, action: "result", result, reason: "按原前端预期判断", observation: "当前场景前端实际观察",
    evidence_refs: [], request_refs: [], page_observation_refs: [page.sequence], execution_refs: refs, coverage_review_ref: review.sequence });
}

async function noSendObservation(runRoot, execution, { fixedDelayOnly = false, requestCount = 0 } = {}) {
  const action = await runtime.recordEvent(runRoot, { type: "action_dispatched", ...execution, action_id: `no-send:${execution.scenario_id}`, side_effect: false, description: "组件夹具触发原前端本地操作" });
  const page = await runtime.recordEvent(runRoot, { type: "page_observation", ...execution, action_id: `no-send:${execution.scenario_id}`, checkpoint_ids: ["FIRST/s/o"], description: "控件处理完成且本地校验提示已稳定出现" });
  const requestObservation = await runtime.recordEvent(runRoot, { type: "network_observation", ...execution, checkpoint_ids: ["FIRST/s/o"], description: "已观察本操作至控件处理完成窗口内没有保存请求",
    request_window: fixedDelayOnly ? { action_ref: action.sequence, request_count: 0, completion_basis: "只等待 1000ms" } : {
      action_ref: action.sequence, completion_ref: page.sequence, completion_basis: "页面本地提交处理完成提示已出现，核对关联请求窗口", request_count: requestCount } });
  return { page, requestObservation };
}

test("AC09: request-not-sent assertions can pass without any Mock receipt when a bounded action/completion observation proves absence", async t => {
  const run = await setup(t, { multiScenario: true, requestBehavior: true });
  await realGap(run.runRoot, { close: false, candidate: true });
  const context = await currentContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  const results = [];
  for (const scenarioId of ["with-name", "empty-name"]) {
    const execution = await prepareScenario(run.runRoot, scenarioId, { mock: true, context });
    const observed = await noSendObservation(run.runRoot, execution);
    results.push(await mockResult(run.runRoot, execution, observed.page, { requestObservation: observed.requestObservation }));
  }
  const finished = await runtime.recordEvent(run.runRoot, { type: "mock_attempt", attempt_id: "attempt1", candidate_ids: ["candidate1"], case_id: "FIRST", action: "finished",
    scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: context.context_refs, proxy_cycle_refs: ["cycle1"] });
  await runtime.recordEvent(run.runRoot, { type: "mock_disposition", candidate_id: "candidate1", outcome: "supplemented", attempt_id: "attempt1", basis_refs: [...results.map(result => result.sequence), finished.sequence] });
  const { log } = await fixtureState(run.runRoot);
  assert.equal(log.events.filter(event => event.type === "mock_observation").length, 0);
  await runtime.validateRun(run.runRoot, { checkReport: false });
  const report = await runtime.generateReport(run.runRoot);
  assert.equal(report.counts.passed, 1);
});

test("AC09: a fixed delay with zero request count cannot replace the control completion observation", async t => {
  const run = await setup(t, { multiScenario: true, requestBehavior: true });
  await realGap(run.runRoot, { close: false, candidate: true });
  const context = await currentContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  const execution = await prepareScenario(run.runRoot, "with-name", { mock: true, context });
  const observed = await noSendObservation(run.runRoot, execution, { fixedDelayOnly: true });
  await assert.rejects(mockResult(run.runRoot, execution, observed.page, { requestObservation: observed.requestObservation }), /请求.*窗口|固定等待|控件完成/);
});

async function permissionMockContext(runRoot) {
  const { log } = await fixtureState(runRoot);
  const plan = log.events.find(event => event.type === "permission_plan");
  const actual = { account_ref: "actual-viewer", observed_account_ref: "actual-viewer", target_id: "permission-fixture-target", context_ref: "permission-fixture-context", environment_ref: "fixture", observed_url: "http://localhost/login", verification: "verified" };
  await runtime.recordEvent(runRoot, { type: "target_inventory", owned_target_ids: [...log.browser.owned_target_ids, actual.target_id], preexisting_target_ids: [], attached_preexisting_target_ids: [] });
  const observed = await runtime.recordEvent(runRoot, { type: "page_observation", checkpoint_ids: ["FIRST/s/o"], target_id: actual.target_id, context_ref: actual.context_ref, description: "入口页确认实际登录身份 actual-viewer；用户明确没有目标查看权限" });
  const identity = await runtime.recordEvent(runRoot, { type: "identity_observation", ...actual, fact_refs: [observed.sequence] });
  const gap = await runtime.recordEvent(runRoot, { type: "data_gap", gap_id: "permission-gap", gap_kind: "permission_unavailable", group_id: "g1", identity_ref: identity.sequence, resource_statement_ref: plan.sequence,
    checkpoint_ids: ["FIRST/s/o"], real_blocker_refs: [observed.sequence], exploration_refs: [observed.sequence], missing_conditions: ["目标前端权限输入"], known_request_facts: ["组件夹具契约使用 canViewDetail 控制前端输入"], not_started_dependencies: ["原前端详情展示需要目标权限输入"] });
  const contract = await runtime.recordEvent(runRoot, { type: "network_observation", checkpoint_ids: ["FIRST/s/o"], target_id: actual.target_id, context_ref: actual.context_ref, description: "组件夹具已提供 GET /api/permissions 返回 canViewDetail:boolean 的原契约" });
  const permission = await runtime.recordEvent(runRoot, { type: "simulated_permission", group_id: "g1", identity_ref: identity.sequence, gap_ref: gap.sequence, contract_refs: [contract.sequence], input_description: "只提供前端 canViewDetail=true，未验证被测页面效果或真实服务端授权" });
  const context = await runtime.recordEvent(runRoot, { type: "coverage_context", ...actual, scope_ids: ["scope:FIRST"], switch_status: "not_required", fact_refs: [observed.sequence, contract.sequence],
    identity_ref: identity.sequence, simulated_permission_ref: permission.sequence, verification_stage: "identity" });
  await runtime.recordEvent(runRoot, { type: "mock_candidate", candidate_id: "candidate1", case_id: "FIRST", checkpoint_ids: ["FIRST/s/o"], gap_ids: ["permission-gap"], assertion_domain: "frontend", assertion_basis: "原断言只验证详情前端展示", purpose: "模拟无法提供的前端权限输入" });
  return { context_refs: [context.sequence], permissionRef: permission.sequence, identity, actual };
}

test("AC14: unavailable real permission remains unavailable while independently verified identity executes simulated frontend permission", async t => {
  const run = await setup(t, { grouped: true, unavailable: true });
  const context = await permissionMockContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  const execution = await prepareScenario(run.runRoot, "scope:FIRST", { batchId: "g1", permissionRef: context.permissionRef, context });
  const page = await observeScenario(run.runRoot, execution);
  await mockResult(run.runRoot, execution, page, { result: "failed" });
  await runtime.validateRun(run.runRoot, { checkReport: false });
  const { log } = await fixtureState(run.runRoot);
  assert.equal(log.events.find(event => event.type === "permission_plan").groups[0].availability, "unavailable");
  assert.equal(log.events.some(event => event.type === "permission_availability" && event.group_id === "g1" && event.availability === "ready"), false);
  assert.equal(log.events.some(event => event.type === "role_observation" && event.observation.group_id === "g1"), false);
  assert.equal(log.events.find(event => event.type === "identity_observation").account_ref, "actual-viewer");
  assert.equal(log.events.find(event => event.type === "mock_checkpoint" && event.action === "result").result, "failed", "the permission effect is the tested outcome, never a prerequisite to start");
});

test("AC14/17: permission availability changes invalidate prior real-permission context before Mock preparation", async t => {
  const run = await setup(t, { grouped: true });
  await realGap(run.runRoot, { close: false, candidate: true });
  const context = await currentContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  await runtime.recordEvent(run.runRoot, { type: "permission_availability", group_id: "g1", availability: "unavailable", account_ref: null, preparation_owner: "user", declaration: "用户明确原真实权限已撤销且现在不可提供" });
  await assert.rejects(prepareScenario(run.runRoot, "scope:FIRST", { batchId: "g1", mock: true, context }), /权限|上下文|失效|新鲜/);
});

test("AC08/17: an identity change after start cannot lend its subsequent page observation to the old prepared execution", async t => {
  const run = await setup(t);
  await realGap(run.runRoot, { close: false, candidate: true });
  const context = await currentContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  const execution = await prepareScenario(run.runRoot, "scope:FIRST", { mock: true, context });
  await runtime.recordEvent(run.runRoot, { type: "execution_context_change", context_ref: "fixture-context", target_ids: ["fixture-target"], description: "实际登录身份在准备和开始之后改变，旧执行上下文不再适用" });
  // Refusal may occur before dispatch or when admitting the result; neither may yield a product conclusion.
  await assert.rejects(async () => {
    const page = await observeScenario(run.runRoot, execution);
    await mockResult(run.runRoot, execution, page);
  }, /上下文|身份|失效|新鲜|准备/);
});

test("AC09: a negative request count cannot be admitted as evidence for request absence", async t => {
  const run = await setup(t, { multiScenario: true, requestBehavior: true });
  await realGap(run.runRoot, { close: false, candidate: true });
  const context = await currentContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  const execution = await prepareScenario(run.runRoot, "with-name", { mock: true, context });
  await assert.rejects(async () => {
    const observed = await noSendObservation(run.runRoot, execution, { requestCount: -1 });
    await mockResult(run.runRoot, execution, observed.page, { requestObservation: observed.requestObservation });
  }, /请求|数量|计数|request_count/);
});

test("AC15: a Mock checkpoint cannot attach another attempt to a prepared scenario execution", async t => {
  const run = await setup(t);
  await realGap(run.runRoot, { close: false, candidate: true });
  const context = await currentContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  await runtime.recordEvent(run.runRoot, { type: "mock_candidate", candidate_id: "candidate2", case_id: "FIRST", checkpoint_ids: ["FIRST/s/o"], gap_ids: ["gap1"],
    assertion_domain: "frontend", assertion_basis: "另一独立尝试复用原前端断言", purpose: "另一个不相容场景" });
  await runtime.recordEvent(run.runRoot, { type: "mock_attempt", attempt_id: "attempt2", candidate_ids: ["candidate2"], case_id: "FIRST", action: "started",
    scenario_revision: 1, scenario_hash: "c".repeat(64), state_version: 0, context_refs: context.context_refs, proxy_cycle_refs: ["cycle2"], candidate_checkpoint_ids: ["FIRST/s/o"], supporting_checkpoint_ids: [] });
  // Preparation is legitimately bound to attempt1; only the subsequent start borrows attempt2.
  await assert.rejects(prepareScenario(run.runRoot, "scope:FIRST", { mock: true, context, startAttemptId: "attempt2" }), /尝试|相容|绑定|准备|attempt/);
});

test("AC08/15: a blocked receipt is not a consumed response for a response-consumption pass", async t => {
  const run = await setup(t, { multiScenario: true, responseConsumption: true });
  await realGap(run.runRoot, { close: false, candidate: true });
  const context = await currentContext(run.runRoot);
  await startMockAttempt(run.runRoot, context.context_refs);
  const execution = await prepareScenario(run.runRoot, "with-name", { mock: true, context });
  await runtime.recordEvent(run.runRoot, { type: "action_dispatched", ...execution, action_id: "blocked-response-action", side_effect: false, description: "组件夹具实际触发详情请求" });
  const blocked = await runtime.recordEvent(run.runRoot, { type: "mock_observation", attempt_id: "attempt1", receipt_id: "blocked-receipt", route_id: "unknown-route", request_id: "blocked-request", disposition: "blocked",
    scenario_id: execution.scenario_id, execution_id: execution.execution_id, checkpoint_ids: ["FIRST/s/o"], request_facts: ["当前路由不在场景许可中，已阻断"], response_facts: [], state_before_version: 0, state_after_version: 0, evidence_refs: [], proxy_cycle_ref: "cycle1" });
  const page = await runtime.recordEvent(run.runRoot, { type: "page_observation", ...execution, checkpoint_ids: ["FIRST/s/o"], description: "有后续页面观察，但没有任何匹配响应被提供" });
  await assert.rejects(mockResult(run.runRoot, execution, page, { requestObservation: blocked }), /响应|消费|匹配|blocked|回执/);
});

for (const domain of ["real_backend", "real_permission"]) {
  test(`AC21: a single-scenario ${domain} classification surfaces the allowed-Mock input conflict before execution`, async t => {
    const run = await setup(t);
    await assert.rejects(runtime.recordEvent(run.runRoot, { type: "checkpoint_semantics", checkpoint_id: "FIRST/s/o", assertion_domain: domain, condition_kind: "direct",
      basis: "输入负责人明确本条仅断言真实服务端保存或服务端鉴权，不能改写为前端观察" }), /冲突|后端|服务端|范围|frontend/);
    const { log } = await fixtureState(run.runRoot);
    assert.equal(log.events.some(event => ["scenario_preparation", "checkpoint_started", "mock_checkpoint"].includes(event.type)), false);
  });
}

for (const stateVersion of [0, 1]) {
  test(`AC15: after a committed Mock receipt, preparing the next scenario with state ${stateVersion} is ${stateVersion ? "valid" : "stale"}`, async t => {
    const run = await setup(t, { multiScenario: true });
    await realGap(run.runRoot, { close: false, candidate: true });
    const context = await currentContext(run.runRoot);
    await startMockAttempt(run.runRoot, context.context_refs);
    const first = await prepareScenario(run.runRoot, "with-name", { mock: true, context });
    await runtime.recordEvent(run.runRoot, { type: "action_dispatched", ...first, action_id: "stateful-first-action", side_effect: false, description: "触发首个详情请求" });
    await runtime.recordEvent(run.runRoot, { type: "mock_observation", attempt_id: "attempt1", receipt_id: "stateful-receipt", route_id: "detail", request_id: "stateful-request", disposition: "mocked",
      scenario_id: first.scenario_id, execution_id: first.execution_id, checkpoint_ids: ["FIRST/s/o"], request_facts: ["当前声明式详情路由匹配"], response_facts: ["200: name=fixture"], state_before_version: 0, state_after_version: 1, evidence_refs: [], proxy_cycle_ref: "cycle1" });
    const page = await runtime.recordEvent(run.runRoot, { type: "page_observation", ...first, checkpoint_ids: ["FIRST/s/o"], description: "首个请求输入已被页面消费" });
    await mockResult(run.runRoot, first, page);
    const prepareNext = () => prepareScenario(run.runRoot, "empty-name", { mock: true, context, stateVersion });
    if (stateVersion === 1) await assert.doesNotReject(prepareNext());
    else await assert.rejects(prepareNext(), /状态|版本|相容|state/);
  });
}

for (const decision of ["allowed", "declined"]) {
  test(`AC20/21: ${decision} Mock handles preexcluded input at planning without changing the snapshot`, async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), "mock-preexcluded-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const run = await runtime.initializeRun({ workspaceRoot: root, workflowProfile: CURRENT_WORKFLOW, mockFallback: decision,
      casesInput: { schema_version: "2.0", suite: { name: "明确预排除输入", target_urls: ["http://localhost"] }, cases: [{
        case_id: "EXCLUDED", module: "输入范围", title: "原输入明确排除", excluded: true, preconditions: [],
        steps: [{ step_id: "s", action: "原输入不执行本项", expected: [{ oracle_id: "o", text: "保留原始排除范围" }] }]
      }] } });
    await runtime.recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["EXCLUDED"] });
    const before = await fixtureState(run.runRoot);
    const plan = { type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: before.log.test_cases.sha256,
      source: "不可变输入中该用例明确预排除", items: [{ checkpoint_id: "EXCLUDED/s/o", dependencies: [], scopes: [] }] };
    if (decision === "allowed") {
      await assert.rejects(runtime.recordEvent(run.runRoot, plan), /输入冲突.*预排除|预排除.*冲突/);
      const after = await fixtureState(run.runRoot);
      assert.deepEqual(after.snapshot, before.snapshot);
      assert.equal(after.log.events.some(event => event.type === "coverage_plan"), false);
      assert.equal(after.log.cases[0].result, "not_executed");
    } else {
      await runtime.recordEvent(run.runRoot, plan);
      await recordFixtureEvent(run.runRoot, { type: "run_state", status: "completed" });
      const delivered = await runtime.deliverReport(run.runRoot);
      assert.equal(delivered.delivery.kind, "final");
      assert.equal(delivered.counts.not_executed, 1);
      const after = await fixtureState(run.runRoot);
      assert.deepEqual(after.snapshot, before.snapshot);
      assert.equal(after.log.events.some(event => event.type === "assistance"), false, "合法预排除不新增协作流程");
    }
  });
}

for (const conditionKind of ["preparation", "required_action"]) {
  test(`AC11/15: prepared dependencies ${conditionKind === "preparation" ? "satisfy inputs without fabricating the source action" : "cannot replace a required original action"}`, async t => {
    const run = await setup(t, { dependencyKind: conditionKind });
    await realGap(run.runRoot, { close: false, candidate: true });
    const context = await currentContext(run.runRoot);
    await startMockAttempt(run.runRoot, context.context_refs);
    const prepare = () => prepareScenario(run.runRoot, "scope:FIRST", { mock: true, context, preparedDependencyId: "record-input" });
    if (conditionKind === "required_action") {
      await assert.rejects(prepare(), /原必需操作|依赖.*通过|不得.*替代/);
    } else {
      const execution = await prepare();
      const outcome = await mockResult(run.runRoot, execution, await observeScenario(run.runRoot, execution));
      const finished = await runtime.recordEvent(run.runRoot, { type: "mock_attempt", attempt_id: "attempt1", candidate_ids: ["candidate1"], case_id: "FIRST", action: "finished",
        scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: context.context_refs, proxy_cycle_refs: ["cycle1"] });
      await runtime.recordEvent(run.runRoot, { type: "mock_disposition", candidate_id: "candidate1", outcome: "supplemented", attempt_id: "attempt1", basis_refs: [outcome.sequence, finished.sequence] });
      await runtime.validateRun(run.runRoot, { checkReport: false });
      const report = await runtime.generateReport(run.runRoot);
      assert.equal(report.counts.passed, 1);
      assert.equal(report.counts.undetermined, 1, "准备输入不算原创建动作已经测试");
      await assert.rejects(recordFixtureEvent(run.runRoot, { type: "run_state", status: "completed" }), /未.*执行|未.*完成|覆盖|终结/);
    }
    const { log } = await fixtureState(run.runRoot);
    assert.equal(log.cases.find(item => item.case_id === "NEXT").checkpoints[0].result, null);
    assert.equal(log.events.some(event => event.checkpoint_id === "NEXT/s/o" && ["checkpoint_started", "checkpoint_result", "mock_checkpoint"].includes(event.type)), false);
  });
}
