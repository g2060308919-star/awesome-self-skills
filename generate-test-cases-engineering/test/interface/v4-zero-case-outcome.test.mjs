import assert from 'node:assert/strict';
import test from 'node:test';

const outcome = /** @type {any} */ (await import('../../src/final-outcome-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));

const documentState = (overrides = {}) => ({
  delivery_intent: 'case_document', cancelled: false,
  case_count: 0, applicable_formal_test_point_count: 0,
  decidable_primary_acceptance_count: 0, blocked_root_count: 0,
  closed_for_delivery_root_count: 0, open_semantic_gap_count: 0,
  not_applicable_count: 0, all_reviewed_formal_points_not_applicable: false,
  delivery_requested: false, ...overrides
});

test('[P-08][BR-15] v4 zero-Case outcome cannot masquerade as an ordinary successful delivery', () => {
  assert.equal(typeof outcome.classifyFinalOutcomeV4, 'function');
  assert.deepEqual(outcome.classifyFinalOutcomeV4(documentState({
    applicable_formal_test_point_count: 1, decidable_primary_acceptance_count: 1
  })), { status: 'fatal', result_kind: 'quality_failure', reason_code: 'APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE' });
  assert.deepEqual(outcome.classifyFinalOutcomeV4(documentState({
    applicable_formal_test_point_count: 1, open_semantic_gap_count: 1, blocked_root_count: 1
  })), { status: 'need_user_answers', result_kind: null, reason_code: 'SEMANTIC_GAPS_REMAIN' });
  assert.deepEqual(outcome.classifyFinalOutcomeV4(documentState({
    applicable_formal_test_point_count: 1, blocked_root_count: 2,
    closed_for_delivery_root_count: 2, delivery_requested: true
  })), { status: 'finished', result_kind: 'blocked_only', reason_code: 'GAPS_EXPLICITLY_CLOSED_FOR_DELIVERY' });
  assert.deepEqual(outcome.classifyFinalOutcomeV4(documentState({
    not_applicable_count: 3, all_reviewed_formal_points_not_applicable: true
  })), { status: 'finished', result_kind: 'no_applicable_cases', reason_code: 'ALL_REVIEWED_FORMAL_POINTS_NOT_APPLICABLE' });
});

test('v4 Case delivery differentiates complete and explicitly gap-bearing documents', () => {
  assert.deepEqual(outcome.classifyFinalOutcomeV4(documentState({ case_count: 2, applicable_formal_test_point_count: 2 })),
    { status: 'finished', result_kind: 'delivered_cases', reason_code: 'CASES_CANONICALLY_DELIVERED' });
  assert.deepEqual(outcome.classifyFinalOutcomeV4(documentState({
    case_count: 2, applicable_formal_test_point_count: 3, blocked_root_count: 1,
    closed_for_delivery_root_count: 1, delivery_requested: true
  })), { status: 'finished', result_kind: 'delivered_with_gaps', reason_code: 'CASES_DELIVERED_WITH_EXPLICITLY_CLOSED_GAPS' });
  assert.equal(outcome.classifyFinalOutcomeV4(documentState({
    case_count: 2, blocked_root_count: 1, closed_for_delivery_root_count: 0,
    open_semantic_gap_count: 1
  })).status, 'need_user_answers');
});

test('v4 execution and cancellation result kinds are mutually exclusive', () => {
  assert.deepEqual(outcome.classifyFinalOutcomeV4({
    delivery_intent: 'execution_plan', cancelled: false, selected_case_count: 2,
    all_execution_gates_passed: true, pending_execution_count: 0
  }), { status: 'finished', result_kind: 'execution_ready', reason_code: 'SELECTED_CASES_READY' });
  assert.deepEqual(outcome.classifyFinalOutcomeV4({
    delivery_intent: 'execution_plan', cancelled: false, selected_case_count: 0,
    all_execution_gates_passed: true, pending_execution_count: 0
  }), { status: 'finished', result_kind: 'no_execution_selected', reason_code: 'ALL_CASES_EXPLICITLY_NOT_SELECTED' });
  assert.equal(outcome.classifyFinalOutcomeV4({
    delivery_intent: 'execution_plan', cancelled: false, selected_case_count: 1,
    all_execution_gates_passed: false, pending_execution_count: 1
  }).status, 'need_user_answers');
  assert.deepEqual(outcome.classifyFinalOutcomeV4(documentState({ cancelled: true })),
    { status: 'cancelled', result_kind: 'cancelled', reason_code: 'USER_CANCELLED' });
});

test('v4 final outcome rejects contradictory or caller-extended state', () => {
  assert.throws(() => outcome.classifyFinalOutcomeV4(documentState({ surprise: true })), /FINAL_OUTCOME_INPUT/);
  assert.throws(() => outcome.classifyFinalOutcomeV4(documentState({
    blocked_root_count: 1, closed_for_delivery_root_count: 2
  })), /FINAL_OUTCOME_INPUT/);
  assert.throws(() => outcome.classifyFinalOutcomeV4({
    delivery_intent: 'execution_plan', cancelled: false, selected_case_count: 0,
    all_execution_gates_passed: false, pending_execution_count: 0
  }), /FINAL_OUTCOME_INPUT/);
});
