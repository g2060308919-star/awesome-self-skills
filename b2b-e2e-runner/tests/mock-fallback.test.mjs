import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveMockState,
  projectEffectiveResults,
  validateMockEvent,
  validateMockLog
} from "../scripts/lib/mock-fallback.mjs";
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
      { type: "workflow_profile", profile: "permission-batches-html-v2", sequence: 1, at: "2026-09-20T00:00:01.000Z" },
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
    type: "mock_candidate", candidate_id: "candidate-1", case_id: "CASE-1", checkpoint_ids: [checkpointId],
    gap_ids: ["gap-1"], purpose: "补测前端收到可用记录后的选择和详情链路"
  });
}

function addCompletedAttempt(log, result = "passed") {
  append(log, {
    type: "coverage_context", scope_ids: ["scope-1"], account_ref: null, observed_account_ref: null,
    target_id: "target-1", context_ref: "context-1", environment_ref: "staging", observed_url: "https://fixture.example.test/app",
    verification: "verified", switch_status: "not_required", fact_refs: [5]
  });
  append(log, {
    type: "mock_attempt", attempt_id: "attempt-1", candidate_ids: ["candidate-1"], case_id: "CASE-1", action: "started",
    scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: [8], proxy_cycle_refs: ["proxy-cycle-1"],
    candidate_checkpoint_ids: [checkpointId], supporting_checkpoint_ids: []
  });
  append(log, {
    type: "mock_observation", attempt_id: "attempt-1", receipt_id: "receipt-1", route_id: "route-1", request_id: "request-1",
    disposition: "mocked", request_facts: ["POST /api/items matched exact body"], response_facts: ["201 with ITEM-1"],
    state_before_version: 0, state_after_version: 1, evidence_refs: [], proxy_cycle_ref: "proxy-cycle-1"
  });
  append(log, {
    type: "mock_checkpoint", attempt_id: "attempt-1", checkpoint_id: checkpointId, action: "started",
    scope_ids: ["scope-1"], context_refs: [8]
  });
  log.events.push({
    type: "coverage_review", review_id: "mock-close", purpose: "checkpoint_close", plan_revision: 1,
    based_on_sequence: 11, scope_ids: ["scope-1"], checkpoint_ids: [checkpointId], fact_refs: [10], assistance_refs: [],
    ready_scope_ids: ["scope-1"], preparable_scope_ids: [], blocked_scope_ids: [],
    closures: [{ checkpoint_id: checkpointId, closure_kind: "observed", basis_refs: [10] }],
    choice: "close", reason: "Mock 页面和请求事实足以判断前端原预期", sequence: 12, at: "2026-09-20T00:00:12.000Z"
  });
  append(log, {
    type: "mock_checkpoint", attempt_id: "attempt-1", checkpoint_id: checkpointId, action: "result", result,
    observation: result === "passed" ? "前端显示 ITEM-1" : "前端未显示 ITEM-1", reason: result === "passed" ? "Mock 前端链路符合原预期" : "Mock 前端链路不符合原预期",
    evidence_refs: [], request_refs: ["receipt-1"], execution_refs: [10], coverage_review_ref: 12
  });
  append(log, {
    type: "mock_attempt", attempt_id: "attempt-1", candidate_ids: ["candidate-1"], case_id: "CASE-1", action: "finished",
    scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 1, context_refs: [8], proxy_cycle_refs: ["proxy-cycle-1"]
  });
  append(log, {
    type: "mock_disposition", candidate_id: "candidate-1", outcome: "supplemented", attempt_id: "attempt-1", basis_refs: [13, 14]
  });
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

test("v1.1 AC-02/04/10/35/39: declined or revoked policy, real failures, and forged gap references cannot become candidates", () => {
  const declined = baseLog("declined");
  append(declined, {
    type: "data_gap", gap_id: "gap-1", checkpoint_ids: [checkpointId], real_blocker_refs: [5], exploration_refs: [5],
    missing_conditions: ["缺数据"], known_request_facts: ["空响应"], not_started_dependencies: ["需要记录 ID"]
  });
  assert.throws(() => append(declined, {
    type: "mock_candidate", candidate_id: "candidate-1", case_id: "CASE-1", checkpoint_ids: [checkpointId], gap_ids: ["gap-1"], purpose: "补测"
  }), /允许|政策/);

  const revoked = baseLog();
  append(revoked, { type: "mock_policy", action: "revoked", decision: "declined", decision_source: "user", basis: "用户撤回允许" });
  assert.throws(() => addGapAndCandidate(revoked), /允许|政策/);

  const failed = baseLog();
  failed.cases[0].checkpoints[0].result = "failed";
  failed.cases[0].result = "failed";
  append(failed, {
    type: "data_gap", gap_id: "gap-1", checkpoint_ids: [checkpointId], real_blocker_refs: [5], exploration_refs: [5],
    missing_conditions: ["缺数据"], known_request_facts: ["空响应"], not_started_dependencies: ["需要记录 ID"]
  });
  assert.throws(() => append(failed, {
    type: "mock_candidate", candidate_id: "candidate-1", case_id: "CASE-1", checkpoint_ids: [checkpointId], gap_ids: ["gap-1"], purpose: "覆盖真实失败"
  }), /真实失败/);
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
    case_id: "CASE-1", real_result: "undetermined", effective_result: "passed", source: "mock", reason: "Mock 前端链路符合原预期"
  });

  const mockFailed = baseLog();
  addGapAndCandidate(mockFailed);
  addCompletedAttempt(mockFailed, "failed");
  projection = projectEffectiveResults(testCases, mockFailed);
  assert.equal(projection.cases[0].effective_result, "failed");
  assert.equal(projection.cases[0].source, "mock");

  const realFailed = baseLog();
  realFailed.cases[0].checkpoints[0].result = "failed";
  realFailed.cases[0].checkpoints[0].reason = "真实链路失败";
  realFailed.cases[0].result = "failed";
  projection = projectEffectiveResults(testCases, realFailed);
  assert.equal(projection.cases[0].effective_result, "failed");
  assert.equal(projection.cases[0].source, "real");
  assert.equal(projection.cases[0].reason, "真实链路失败");
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

test("v1.1 AC-41: passing checkpoints from different Mock attempts cannot be spliced into one passed case", () => {
  const cases = {
    schema_version: "2.0",
    suite: { name: "不可拼接场景", target_urls: ["https://fixture.example.test"] },
    cases: [{
      case_id: "CASE-MIX", module: "订单", title: "同一场景的两个检查点", preconditions: [],
      steps: [
        { step_id: "s1", action: "创建", expected: [{ oracle_id: "o1", text: "显示已创建" }] },
        { step_id: "s2", action: "读取", expected: [{ oracle_id: "o2", text: "显示同一记录" }] }
      ]
    }]
  };
  const log = {
    extensions: { execution_coverage: { schema_version: "1.0" }, mock_fallback: { schema_version: "1.0" } },
    cases: [{
      case_id: "CASE-MIX", result: "undetermined", reason: "真实数据缺失",
      checkpoints: [
        { step_id: "s1", oracle_id: "o1", result: "undetermined", reason: "缺创建数据" },
        { step_id: "s2", oracle_id: "o2", result: "undetermined", reason: "缺读取数据" }
      ]
    }],
    events: [
      { type: "mock_candidate", candidate_id: "c1", case_id: "CASE-MIX", checkpoint_ids: ["CASE-MIX/s1/o1"], gap_ids: ["g1"] },
      { type: "mock_candidate", candidate_id: "c2", case_id: "CASE-MIX", checkpoint_ids: ["CASE-MIX/s2/o2"], gap_ids: ["g2"] },
      { type: "mock_attempt", action: "started", attempt_id: "a1", case_id: "CASE-MIX", candidate_ids: ["c1"], candidate_checkpoint_ids: ["CASE-MIX/s1/o1"], supporting_checkpoint_ids: [], scenario_revision: 1, scenario_hash: "a".repeat(64), state_version: 0, context_refs: [1], proxy_cycle_refs: ["cycle-1"] },
      { type: "mock_checkpoint", action: "result", attempt_id: "a1", checkpoint_id: "CASE-MIX/s1/o1", result: "passed", reason: "尝试一通过" },
      { type: "mock_attempt", action: "finished", attempt_id: "a1", context_refs: [1], proxy_cycle_refs: ["cycle-1"], state_version: 1 },
      { type: "mock_disposition", candidate_id: "c1", outcome: "supplemented", attempt_id: "a1" },
      { type: "mock_attempt", action: "started", attempt_id: "a2", case_id: "CASE-MIX", candidate_ids: ["c2"], candidate_checkpoint_ids: ["CASE-MIX/s2/o2"], supporting_checkpoint_ids: [], scenario_revision: 1, scenario_hash: "b".repeat(64), state_version: 0, context_refs: [1], proxy_cycle_refs: ["cycle-2"] },
      { type: "mock_checkpoint", action: "result", attempt_id: "a2", checkpoint_id: "CASE-MIX/s2/o2", result: "passed", reason: "尝试二通过" },
      { type: "mock_attempt", action: "finished", attempt_id: "a2", context_refs: [1], proxy_cycle_refs: ["cycle-2"], state_version: 1 },
      { type: "mock_disposition", candidate_id: "c2", outcome: "supplemented", attempt_id: "a2" }
    ]
  };
  const projection = projectEffectiveResults(cases, log);
  assert.equal(projection.cases[0].effective_result, "undetermined");
  assert.match(projection.cases[0].reason, /不能拼接|同一.*尝试/);
});
