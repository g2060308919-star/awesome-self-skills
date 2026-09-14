const DOCUMENT_KEYS = new Set([
  'delivery_intent', 'cancelled', 'case_count', 'applicable_formal_test_point_count',
  'decidable_primary_acceptance_count', 'blocked_root_count', 'closed_for_delivery_root_count',
  'open_semantic_gap_count', 'not_applicable_count', 'all_reviewed_formal_points_not_applicable',
  'delivery_requested'
]);
const EXECUTION_KEYS = new Set([
  'delivery_intent', 'cancelled', 'selected_case_count', 'all_execution_gates_passed',
  'pending_execution_count'
]);

/** @param {unknown} input @returns {asserts input is Record<string,any>} */
function requireRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('FINAL_OUTCOME_INPUT_INVALID');
}

/** @param {Record<string,any>} value @param {Set<string>} allowed */
function requireClosed(value, allowed) {
  if (Object.keys(value).some(key => !allowed.has(key)) || [...allowed].some(key => !(key in value))) {
    throw new TypeError('FINAL_OUTCOME_INPUT_INVALID');
  }
}

/** @param {unknown[]} values */
function countsValid(values) {
  return values.every(value => Number.isSafeInteger(value) && Number(value) >= 0);
}

/**
 * Pure BR-15 result matrix. Its arguments are compiler-recomputed facts; the
 * durable final verifier is responsible for deriving them from canonical files.
 * @param {unknown} input
 */
export function classifyFinalOutcomeV4(input) {
  requireRecord(input);
  const state = /** @type {Record<string,any>} */ (input);
  if (!['case_document', 'execution_plan'].includes(state.delivery_intent)
    || typeof state.cancelled !== 'boolean') throw new TypeError('FINAL_OUTCOME_INPUT_INVALID');
  if (state.delivery_intent === 'case_document') {
    requireClosed(state, DOCUMENT_KEYS);
    const counts = [state.case_count, state.applicable_formal_test_point_count,
      state.decidable_primary_acceptance_count, state.blocked_root_count,
      state.closed_for_delivery_root_count, state.open_semantic_gap_count,
      state.not_applicable_count];
    if (!countsValid(counts)
      || typeof state.all_reviewed_formal_points_not_applicable !== 'boolean'
      || typeof state.delivery_requested !== 'boolean'
      || state.closed_for_delivery_root_count > state.blocked_root_count
      || state.open_semantic_gap_count + state.closed_for_delivery_root_count !== state.blocked_root_count
      || state.decidable_primary_acceptance_count > state.applicable_formal_test_point_count
      || (state.all_reviewed_formal_points_not_applicable
        && (state.applicable_formal_test_point_count !== 0 || state.not_applicable_count === 0))) {
      throw new TypeError('FINAL_OUTCOME_INPUT_INVALID');
    }
    if (state.cancelled) return { status: 'cancelled', result_kind: 'cancelled', reason_code: 'USER_CANCELLED' };
    if (state.blocked_root_count > 0) {
      if (state.open_semantic_gap_count > 0 || !state.delivery_requested) {
        return { status: 'need_user_answers', result_kind: null, reason_code: 'SEMANTIC_GAPS_REMAIN' };
      }
      return state.case_count > 0
        ? { status: 'finished', result_kind: 'delivered_with_gaps', reason_code: 'CASES_DELIVERED_WITH_EXPLICITLY_CLOSED_GAPS' }
        : { status: 'finished', result_kind: 'blocked_only', reason_code: 'GAPS_EXPLICITLY_CLOSED_FOR_DELIVERY' };
    }
    if (state.case_count > 0) {
      return { status: 'finished', result_kind: 'delivered_cases', reason_code: 'CASES_CANONICALLY_DELIVERED' };
    }
    if (state.all_reviewed_formal_points_not_applicable) {
      return { status: 'finished', result_kind: 'no_applicable_cases', reason_code: 'ALL_REVIEWED_FORMAL_POINTS_NOT_APPLICABLE' };
    }
    if (state.applicable_formal_test_point_count > 0 || state.decidable_primary_acceptance_count > 0) {
      return { status: 'fatal', result_kind: 'quality_failure', reason_code: 'APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE' };
    }
    return { status: 'fatal', result_kind: 'quality_failure', reason_code: 'NO_CANONICAL_DELIVERY_OUTCOME' };
  }

  requireClosed(state, EXECUTION_KEYS);
  if (!countsValid([state.selected_case_count, state.pending_execution_count])
    || typeof state.all_execution_gates_passed !== 'boolean'
    || (state.pending_execution_count === 0 && state.selected_case_count === 0 && !state.all_execution_gates_passed)) {
    throw new TypeError('FINAL_OUTCOME_INPUT_INVALID');
  }
  if (state.cancelled) return { status: 'cancelled', result_kind: 'cancelled', reason_code: 'USER_CANCELLED' };
  if (state.pending_execution_count > 0 || !state.all_execution_gates_passed) {
    return { status: 'need_user_answers', result_kind: null, reason_code: 'EXECUTION_CLOSURE_PENDING' };
  }
  return state.selected_case_count > 0
    ? { status: 'finished', result_kind: 'execution_ready', reason_code: 'SELECTED_CASES_READY' }
    : { status: 'finished', result_kind: 'no_execution_selected', reason_code: 'ALL_CASES_EXPLICITLY_NOT_SELECTED' };
}
