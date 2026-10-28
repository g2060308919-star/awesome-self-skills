import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveMockState,
  projectEffectiveResults,
  validateMockEvent,
  validateMockLog
} from "../scripts/lib/mock-fallback.mjs";
import { validateProgressEvent, validateProgressLog, deriveExecutionProgress } from "../scripts/lib/execution-progress.mjs";
import { buildReportModel } from "../scripts/lib/report-model.mjs";
import { renderChatTableMarkdown } from "../scripts/lib/report.mjs";
import { buildHtmlReport } from "../scripts/lib/report-html.mjs";

const checkpointId = "CASE-1/s/o";
const testCases = {
  schema_version: "2.0",
  suite: { name: "Mock 补测", target_urls: ["https://fixture.example.test"] },
  cases: [{ case_id: "CASE-1", module: "订单", title: "显示模拟数据", preconditions: [], steps: [{ step_id: "s", action: "查看详情", expected: [{ oracle_id: "o", text: "显示模拟数据" }] }] }]
};

function baseLog(decision = "allowed") {
  return {
    schema_version: "2.0",
    extensions: {
      execution_coverage: { schema_version: "1.0" },
      mock_fallback: { schema_version: "1.0" }
    },
    run: { run_id: "RUN-1", status: "running" },
    test_cases: { sha256: "a".repeat(64) },
    cases: [{
      case_id: "CASE-1", result: "undetermined",
      checkpoints: [{ step_id: "s", oracle_id: "o", status: "completed", result: "undetermined", reason: "真实数据缺失", observations: ["真实列表为空"], evidence_refs: [], evidence_status: "not_required", blocker: "缺少真实记录" }]
    }],
    browser: { role_observations: [], owned_target_ids: ["target-1"], preexisting_target_ids: [], attached_preexisting_target_ids: [] },
    proxy: { required: true, state: "stopped", verifications: [], cleanup: { succeeded: true, reason: "Mock 拦截已停止" } },
    cleanup: { attempted: true, completed: true, items: [] },
    events: [
      { type: "workflow_profile", profile: "b2b-e2e-current", sequence: 1, at: "2026-09-20T00:00:01.000Z" },
      { type: "mock_policy", action: "initial", decision, decision_source: "user", basis: "用户明确选择", sequence: 2, at: "2026-09-20T00:00:02.000Z" },
      { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["CASE-1"], sequence: 3, at: "2026-09-20T00:00:03.000Z" },
      {
        type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: "a".repeat(64), source: "原用例",
        items: [{ checkpoint_id: checkpointId, scopes: [{
          scope_id: "scope-1", group_ids: [], location_ref: "https://fixture.example.test/app", location_status: "known",
          step_refs: ["CASE-1/s"], source_refs: ["snapshot:CASE-1/s"]
        }], dependencies: [] }], sequence: 4, at: "2026-09-20T00:00:04.000Z"
      },
      {
        type: "blocker", checkpoint_ids: [checkpointId], description: "列表没有满足原场景的数据",
        exploration_summary: { checkpoint_ids: [checkpointId], missing_fact: "可用业务记录", known_facts: ["请求成功且返回空列表"], attempts: [{ action: "检查 3 个合法结果页", observation: "均无可用记录" }], cannot_continue_reason: "缺少记录 ID" },
        sequence: 5, at: "2026-09-20T00:00:05.000Z"
      }
    ]
  };
}

function append(log, event) {
  validateMockEvent(testCases, log, event);
  const stored = { ...structuredClone(event), sequence: log.events.length + 1, at: `2026-09-20T00:00:${String(log.events.length + 1).padStart(2, "0")}.000Z` };
  log.events.push(stored);
  return stored;
}

function addGapAndCandidate(log) {
  append(log, {
    type: "data_gap", gap_id: "gap-1", checkpoint_ids: [checkpointId], real_blocker_refs: [5], exploration_refs: [5],
    missing_conditions: ["返回至少一条可选择记录"], known_request_facts: ["GET /api/items 返回 200 和空数组"],
    not_started_dependencies: ["详情步骤需要列表记录 ID"]
  });
  append(log, {
    type: "mock_candidate", assertion_domain: "frontend", assertion_basis: "原断言验证页面展示与交互", candidate_id: "candidate-1", case_id: "CASE-1", checkpoint_ids: [checkpointId],
    gap_ids: ["gap-1"], purpose: "补测前端收到可用记录后的选择和详情链路"
  });
}

function addCompletedAttempt(log, result = "passed", { scenarioId = "scope-1", attemptId = "attempt-1", candidateId = "candidate-1" } = {}) {
  const record = event => { validateProgressEvent(testCases, log, event); return append(log, event); };
  const context = record({ type: "coverage_context", scope_ids: ["scope-1"], account_ref: null, observed_account_ref: null,
    target_id: "target-1", context_ref: "context-1", environment_ref: "staging", observed_url: "https://fixture.example.test/app",
    verification: "verified", switch_status: "not_required", fact_refs: [5] });
  const attempt = { attempt_id: attemptId, candidate_ids: [candidateId], case_id: "CASE-1", scenario_revision: 1,
    scenario_hash: "b".repeat(64), context_refs: [context.sequence], proxy_cycle_refs: ["proxy-cycle-1"] };
  record({ type: "mock_attempt", ...attempt, action: "started", state_version: 0, candidate_checkpoint_ids: [checkpointId], supporting_checkpoint_ids: [] });
  const execution = { checkpoint_id: checkpointId, scenario_id: scenarioId, execution_id: `execution:${attemptId}`, batch_id: "general" };
  const input = record({ type: "network_observation", ...execution, checkpoint_ids: [checkpointId], description: "组件夹具输入已按提供契约准备，尚不判断页面效果" });
  const prep = record({ type: "scenario_preparation", ...execution, context_refs: [context.sequence], fact_refs: [input.sequence],
    data_source: "mock", permission_source: "real", attempt_id: attemptId, scenario_hash: attempt.scenario_hash, state_version: 0 });
  const bound = { ...execution, attempt_id: attemptId, preparation_ref: prep.sequence };
  record({ type: "mock_checkpoint", ...bound, action: "started", scope_ids: ["scope-1"], context_refs: [context.sequence] });
  record({ type: "action_dispatched", ...bound, action_id: `open:${attemptId}`, side_effect: false, description: "组件夹具实际触发详情页面导航" });
  const receipt = record({ type: "mock_observation", scenario_id: scenarioId, execution_id: execution.execution_id, attempt_id: attemptId, receipt_id: `receipt:${attemptId}`, route_id: "route-1", request_id: `request:${attemptId}`,
    disposition: "mocked", request_facts: ["GET /api/items matched exact route"], response_facts: ["200 with ITEM-1"],
    state_before_version: 0, state_after_version: 1, evidence_refs: [], proxy_cycle_ref: "proxy-cycle-1" });
  const page = record({ type: "page_observation", ...bound, checkpoint_ids: [checkpointId], description: result === "passed" ? "组件夹具页面消费事实：显示 ITEM-1" : "组件夹具页面消费事实：未显示 ITEM-1" });
  const review = record({ type: "coverage_review", review_id: `mock-close:${attemptId}`, purpose: "checkpoint_close", plan_revision: 1,
    based_on_sequence: log.events.length, scope_ids: ["scope-1"], checkpoint_ids: [checkpointId], fact_refs: [receipt.sequence, page.sequence], assistance_refs: [],
    ready_scope_ids: ["scope-1"], preparable_scope_ids: [], blocked_scope_ids: [],
    closures: [{ checkpoint_id: checkpointId, closure_kind: "observed", basis_refs: [receipt.sequence, page.sequence] }],
    choice: "close", reason: "Mock 页面和请求事实足以判断前端原预期" });
  const outcome = record({ type: "mock_checkpoint", ...bound, action: "result", result,
    observation: result === "passed" ? "前端显示 ITEM-1" : "前端未显示 ITEM-1", reason: result === "passed" ? "Mock 前端链路符合原预期" : "Mock 前端链路不符合原预期",
    evidence_refs: [], request_refs: [receipt.receipt_id], execution_refs: [receipt.sequence, page.sequence], page_observation_refs: [page.sequence], coverage_review_ref: review.sequence });
  const finished = record({ type: "mock_attempt", ...attempt, action: "finished", state_version: 1 });
  record({ type: "mock_disposition", candidate_id: candidateId, outcome: "supplemented", attempt_id: attemptId, basis_refs: [outcome.sequence, finished.sequence] });
}

function addRealFailure(log) {
  const record = event => { validateProgressEvent(testCases, log, event); return append(log, event); };
  const context = record({ type: "coverage_context", scope_ids: ["scope-1"], account_ref: null, observed_account_ref: null,
    target_id: "target-1", context_ref: "context-1", environment_ref: "staging", observed_url: "https://fixture.example.test/app", verification: "verified", switch_status: "not_required", fact_refs: [5] });
  const identity = { checkpoint_id: checkpointId, scenario_id: "scope-1", execution_id: "real-failure", batch_id: "general" };
  const input = record({ type: "network_observation", ...identity, checkpoint_ids: [checkpointId], description: "真实接口返回正确输入" });
  const preparation = record({ type: "scenario_preparation", ...identity, data_source: "real", permission_source: "real", context_refs: [context.sequence], fact_refs: [input.sequence] });
  record({ type: "checkpoint_started", ...identity, preparation_ref: preparation.sequence, context_refs: [context.sequence], scope_ids: ["scope-1"] });
  record({ type: "action_dispatched", ...identity, action_id: "real-open", side_effect: false, description: "实际导航打开详情" });
  const page = record({ type: "page_observation", ...identity, checkpoint_ids: [checkpointId], description: "真实前端未显示正确记录" });
  record({ type: "checkpoint_result", ...identity, preparation_ref: preparation.sequence, result: "failed", reason: "真实链路失败", execution_refs: [page.sequence] });
  log.cases[0].result = "failed";
  Object.assign(log.cases[0].checkpoints[0], { result: "failed", reason: "真实链路失败" });
}

test("v1.1 AC-03/33/36/38: a data gap becomes one traceable candidate and closes only after a finished matching attempt", () => {
  const log = baseLog();
  addGapAndCandidate(log);
  addCompletedAttempt(log);
  const state = deriveMockState(testCases, log);
  assert.equal(state.policy, "allowed");
  assert.equal(state.gaps.get("gap-1").checkpoint_ids[0], checkpointId);
  assert.equal(state.candidates.get("candidate-1").outcome, "supplemented");
  assert.equal(state.attempts.get("attempt-1").state, "finished");
  assert.doesNotThrow(() => validateMockLog(testCases, log));
});

test("v1.1 AC-02/04/10/35/39: declined or revoked policy and forged gaps fail closed; later supplementation cannot erase a real failure", () => {
  const declined = baseLog("declined");
  append(declined, {
    type: "data_gap", gap_id: "gap-1", checkpoint_ids: [checkpointId], real_blocker_refs: [5], exploration_refs: [5],
    missing_conditions: ["缺数据"], known_request_facts: ["空响应"], not_started_dependencies: ["需要记录 ID"]
  });
  assert.throws(() => append(declined, {
    type: "mock_candidate", assertion_domain: "frontend", assertion_basis: "原断言验证页面展示与交互", candidate_id: "candidate-1", case_id: "CASE-1", checkpoint_ids: [checkpointId], gap_ids: ["gap-1"], purpose: "补测"
  }), /允许|政策/);

  const revoked = baseLog();
  append(revoked, { type: "mock_policy", action: "revoked", previous_decision_ref: 2, decision: "declined", decision_source: "user", basis: "用户撤回允许" });
  assert.throws(() => addGapAndCandidate(revoked), /允许|政策/);

  const failed = baseLog();
  failed.events.find(event => event.type === "coverage_plan").items[0].scopes[0].scenario_requirements = ["scope-1", "remaining-independent"].map(scenario_id => ({
    scenario_id, step_refs: ["CASE-1/s"], source_refs: ["snapshot:CASE-1/s"], preconditions: [], assertion_kind: "ui", assertion_domain: "frontend", chain_id: null
  }));
  addRealFailure(failed);
  assert.throws(() => append(failed, {
    type: "mock_candidate", assertion_domain: "frontend", assertion_basis: "原断言验证页面展示与交互", candidate_id: "forged", case_id: "CASE-1", checkpoint_ids: [checkpointId], gap_ids: ["missing-gap"], purpose: "补测"
  }), /数据缺口/);
  addGapAndCandidate(failed);
  addCompletedAttempt(failed, "passed");
  assert.equal(projectEffectiveResults(testCases, failed).cases[0].effective_result, "failed", "真实前端失败不能被后来的 Mock 通过洗掉");
  assert.equal(failed.cases[0].result, "failed");
});

test("v1.1 AC-34/36/37: unknown attempts, receipts, cross-case checkpoints, and duplicate terminal results fail closed", () => {
  const log = baseLog();
  addGapAndCandidate(log);
  assert.throws(() => append(log, {
    type: "mock_observation", attempt_id: "missing", receipt_id: "r", route_id: "route", request_id: "request",
    disposition: "mocked", request_facts: ["fact"], response_facts: ["fact"], state_before_version: 0, state_after_version: 1,
    evidence_refs: [], proxy_cycle_ref: "proxy-cycle-1"
  }), /尝试/);
  assert.throws(() => append(log, {
    type: "mock_attempt", attempt_id: "attempt-cross", candidate_ids: ["candidate-1"], case_id: "OTHER", action: "started",
    scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: [4], proxy_cycle_refs: ["proxy-cycle-1"],
    candidate_checkpoint_ids: [checkpointId], supporting_checkpoint_ids: []
  }), /用例|case/);
});

test("v1.1 AC-41/42/43: effective projection keeps real failures, allows valid data-gap supplementation, and gives Mock failure priority", () => {
  const passed = baseLog();
  addGapAndCandidate(passed);
  addCompletedAttempt(passed, "passed");
  let projection = projectEffectiveResults(testCases, passed);
  assert.deepEqual(projection.cases[0], {
    case_id: "CASE-1", real_result: "undetermined", effective_result: "passed", complete: true, source: "mock", reason: "Mock 前端链路符合原预期；Mock 前端补测，不证明真实后端"
  });

  const mockFailed = baseLog();
  addGapAndCandidate(mockFailed);
  addCompletedAttempt(mockFailed, "failed");
  projection = projectEffectiveResults(testCases, mockFailed);
  assert.equal(projection.cases[0].effective_result, "failed");
  assert.equal(projection.cases[0].source, "mock");

  const realFailed = baseLog();
  addRealFailure(realFailed);
  projection = projectEffectiveResults(testCases, realFailed);
  assert.equal(projection.cases[0].effective_result, "failed");
  assert.equal(projection.cases[0].source, "real");
  assert.match(projection.cases[0].reason, /真实链路失败/);
  assert.equal(realFailed.cases[0].checkpoints[0].reason, "真实链路失败");
});

test("v1.1 AC-38/44: completion rejects open candidates, running attempts, and open assistance", () => {
  const openCandidate = baseLog();
  addGapAndCandidate(openCandidate);
  assert.throws(() => validateMockEvent(testCases, openCandidate, { type: "run_state", status: "completed" }), /候选|收尾/);

  const running = baseLog();
  addGapAndCandidate(running);
  append(running, {
    type: "coverage_context", scope_ids: ["scope-1"], account_ref: null, observed_account_ref: null,
    target_id: "target-1", context_ref: "context-1", environment_ref: "staging", observed_url: "https://fixture.example.test/app",
    verification: "verified", switch_status: "not_required", fact_refs: [5]
  });
  append(running, {
    type: "mock_attempt", attempt_id: "attempt-1", candidate_ids: ["candidate-1"], case_id: "CASE-1", action: "started",
    scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: [8], proxy_cycle_refs: ["proxy-cycle-1"],
    candidate_checkpoint_ids: [checkpointId], supporting_checkpoint_ids: []
  });
  assert.throws(() => validateMockEvent(testCases, running, { type: "run_state", status: "completed" }), /尝试|收尾/);
});

test("v1.1 AC-43/44: HTML and chat share one effective four-state row while preserving the real result", () => {
  const log = baseLog();
  addGapAndCandidate(log);
  addCompletedAttempt(log, "passed");
  const model = buildReportModel(testCases, log);
  assert.equal(log.cases[0].result, "undetermined", "report projection must not rewrite the real ledger");
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].result, "passed");
  assert.equal(model.rows[0].result_source, "mock");
  assert.match(model.rows[0].reason, /Mock 前端补测/);
  assert.deepEqual(model.mock_summary, { enabled: true, used: true, real_passed: 0, mock_supplemented_passed: 1 });
  const chat = renderChatTableMarkdown(model);
  assert.match(chat, /\| TC-001 \| 订单 \| 显示模拟数据 \| 通过 \| .*Mock 前端补测/);
  const html = buildHtmlReport(model);
  assert.match(html, /1 条包含 Mock 前端补测/);
  assert.match(html, /不证明真实后端已创建、修改或持久化业务数据/);
  assert.doesNotMatch(html, /ownerToken|"type":"mock_/);
});

test("v1.1 AC-02/03: a declined Mock choice never makes the report claim that a Mock proxy was used", () => {
  const log = baseLog("declined");
  log.proxy = { required: false, state: "not_required", verifications: [], cleanup: { succeeded: null, reason: null } };
  const model = buildReportModel(testCases, log);
  assert.deepEqual(model.mock_summary, {
    enabled: false,
    used: false,
    real_passed: 0,
    mock_supplemented_passed: 0
  });
  assert.equal(model.report_context.proxy_method, "未使用代理");
  const html = buildHtmlReport(model);
  assert.doesNotMatch(html, /有效通过中.*Mock 前端补测/);
});

test("v1.1 AC-41: a named state chain cannot splice different attempts, while independent scenarios may use separate attempts", () => {
  for (const chainId of ["shared-business-record", null]) {
    const log = baseLog();
    log.events.find(event => event.type === "coverage_plan").items[0].scopes[0].scenario_requirements = ["branch-a", "branch-b"].map(scenario_id => ({
      scenario_id, step_refs: ["CASE-1/s"], source_refs: ["snapshot:CASE-1/s"], preconditions: [], assertion_kind: "ui", assertion_domain: "frontend", chain_id: chainId
    }));
    addGapAndCandidate(log);
    addCompletedAttempt(log, "passed", { scenarioId: "branch-a" });
    append(log, { type: "mock_candidate", candidate_id: "candidate-2", case_id: "CASE-1", checkpoint_ids: [checkpointId], gap_ids: ["gap-1"],
      assertion_domain: "frontend", assertion_basis: "原断言第二必测分支", purpose: "执行剩余分支" });
    addCompletedAttempt(log, "passed", { scenarioId: "branch-b", attemptId: "attempt-2", candidateId: "candidate-2" });
    assert.doesNotThrow(() => validateMockLog(testCases, log));
    assert.doesNotThrow(() => validateProgressLog(testCases, log));
    const projection = projectEffectiveResults(testCases, log);
    assert.equal(projection.cases[0].effective_result, chainId ? "undetermined" : "passed");
    assert.equal(projection.cases[0].complete, chainId === null);
    assert.equal(deriveExecutionProgress(testCases, log).scenes.every(scene => scene.executed), true, "不能用缺少执行事实制造拒绝拼接");
  }
});

test('R05 A13: declined→allowed→revoked→allowed decisions append with exact previous decision',()=>{
 const log=baseLog('declined');
 append(log,{type:'mock_policy',action:'changed',decision:'allowed',decision_source:'user',basis:'User explicitly allows frontend simulation now',previous_decision_ref:2});
 const allowed=log.events.at(-1).sequence;
 append(log,{type:'mock_policy',action:'revoked',decision:'declined',decision_source:'user',basis:'User revokes mock',previous_decision_ref:allowed});
 const revoked=log.events.at(-1).sequence;
 assert.throws(()=>append(log,{type:'mock_policy',action:'changed',decision:'allowed',decision_source:'user',basis:'stale reference',previous_decision_ref:2}),/previous/);
 append(log,{type:'mock_policy',action:'changed',decision:'allowed',decision_source:'user',basis:'User explicitly allows again',previous_decision_ref:revoked});
 assert.deepEqual(log.events.filter(e=>e.type==='mock_policy').map(e=>e.decision),['declined','allowed','declined','allowed']);
});
test('R10 A28: mock success cannot prove real backend or permission, receipt cannot substitute visible UI consumption',()=>{
 for(const domain of ['real_backend','real_permission']) {
  const log=baseLog(); addGapAndCandidate(log); log.events.at(-1).assertion_domain=domain;
  assert.throws(()=>addCompletedAttempt(log),/真实后端|真实权限/);
 }
 const valid=baseLog(); addGapAndCandidate(valid); addCompletedAttempt(valid);
 const result=valid.events.find(e=>e.type==='mock_checkpoint' && e.action==='result');
 delete result.page_observation_refs;
 assert.throws(()=>validateMockLog(testCases,valid),/page_observation_refs/);
});

test('A28: stale page observations before checkpoint execution cannot prove mock UI consumption',()=>{
 const log=baseLog(); addGapAndCandidate(log); addCompletedAttempt(log);
 const observed=log.events.find(e=>e.type==='page_observation'); const result=log.events.find(e=>e.type==='mock_checkpoint' && e.action==='result');
 observed.sequence=4; result.page_observation_refs=[4];
 assert.throws(()=>validateMockLog(testCases,log),/页面消费/);
});
