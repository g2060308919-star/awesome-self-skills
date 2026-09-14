import { validateAgainstSchema } from './schema-validator.mjs';

const categories = ['semantic_gap', 'source_artifact', 'adapter_revision', 'protocol_failure',
  'quality_failure', 'capacity_limit', 'heuristic_risk', 'execution_readiness'];
const text = { type: 'string', minLength: 1, pattern: '\\S' };
const refs = { type: 'array', items: text, uniqueItems: true };
const diagnosticSchema = {
  type: 'object', additionalProperties: false,
  required: ['category', 'code', 'message', 'affected_fact_ids', 'affected_test_point_ids'],
  properties: {
    category: { enum: categories }, code: text, message: text,
    path: text,
    affected_fact_ids: refs, affected_test_point_ids: refs
  }
};

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
function recoverableProtocol(value) {
  return isRecord(value) && value.committed_digests_valid === true
    && value.unique_committed_state === true && value.append_digest_conflict === false
    && typeof value.damage_scope === 'string' && ['staging', 'temporary', 'rebuildable_checkpoint'].includes(value.damage_scope)
    && Object.keys(value).every(key => ['committed_digests_valid', 'unique_committed_state', 'append_digest_conflict', 'damage_scope'].includes(key));
}

/** @param {unknown} value */
function splittableCapacity(value) {
  return isRecord(value) && value.source_fact_scopes_disjoint === true
    && value.outcome_unique_ownership === true && value.merged_coverage_verifiable === true
    && value.minimal_shard_exceeds_limit === false && value.atomic_outcomes_preserved === true
    && Object.keys(value).every(key => ['source_fact_scopes_disjoint', 'outcome_unique_ownership', 'merged_coverage_verifiable', 'minimal_shard_exceeds_limit', 'atomic_outcomes_preserved'].includes(key));
}

/**
 * Internal diagnostic routing, not a runner reply and not an execution engine.
 * Protocol/capacity facts come from compiler-owned integrity/partition checks;
 * their absence or uncertainty cannot authorize recovery or splitting.
 * @param {unknown} diagnostic
 * @param {unknown} systemContext
 */
export function routeGapDiagnosticV4(diagnostic, systemContext) {
  if (validateAgainstSchema(diagnostic, diagnosticSchema).length) throw new Error('DIAGNOSTIC_INPUT_INVALID');
  const route = routeGapCategoryV4(
    /** @type {any} */ (diagnostic).category, systemContext
  );
  const issue = /** @type {{category:string,code:string,message:string,affected_fact_ids:string[],affected_test_point_ids:string[]}} */ (diagnostic);
  return {
    category: issue.category, code: issue.code, message: issue.message,
    ...route,
    affected_fact_ids: [...issue.affected_fact_ids].sort(),
    affected_test_point_ids: [...issue.affected_test_point_ids].sort()
  };
}

/**
 * Authoritative compiler-private routing table for the eight gap categories.
 * The returned status describes state-machine routing; values such as
 * `recover_from_committed` and `deterministic_split` are internal transitions,
 * never additional runner reply kinds.
 * @param {typeof categories[number]} category
 * @param {unknown} systemContext
 */
export function routeGapCategoryV4(category, systemContext) {
  if (!categories.includes(category)) throw new Error('DIAGNOSTIC_CATEGORY_INVALID');
  if (!isRecord(systemContext) || typeof systemContext.delivery_intent !== 'string'
    || !['case_document', 'execution_plan'].includes(systemContext.delivery_intent)) {
    throw new Error('DELIVERY_INTENT_INVALID');
  }
  if (Object.keys(systemContext).some(key => !['delivery_intent', 'protocol_state', 'capacity_state'].includes(key))) {
    throw new Error('DIAGNOSTIC_SYSTEM_CONTEXT_INVALID');
  }
  let owner;
  let recovery_action;
  let status;
  let user_actionable = false;
  /** @type {string|null} */ let result_kind = null;
  if (category === 'semantic_gap') {
    owner = 'user_or_normative_source'; recovery_action = 'answer_semantic_question'; status = 'need_user_answers'; user_actionable = true;
  } else if (category === 'source_artifact') {
    owner = 'source_provider'; recovery_action = 'provide_artifact'; status = 'need_artifact'; user_actionable = true;
  } else if (category === 'adapter_revision') {
    owner = 'agent_adapter'; recovery_action = 'revise_artifact'; status = 'need_revision';
  } else if (category === 'protocol_failure') {
    const recoverable = recoverableProtocol(systemContext.protocol_state);
    owner = 'compiler'; recovery_action = recoverable ? 'recover_from_committed' : 'repair_integrity';
    status = recoverable ? 'recover_from_committed' : 'fatal';
  } else if (category === 'quality_failure') {
    owner = 'compiler_or_agent'; recovery_action = 'reanalyze'; status = 'fatal'; result_kind = 'quality_failure';
  } else if (category === 'capacity_limit') {
    const splittable = splittableCapacity(systemContext.capacity_state);
    owner = 'compiler'; recovery_action = splittable ? 'deterministic_split' : 'reduce_scope_or_increase_limit';
    status = splittable ? 'deterministic_split' : 'fatal'; result_kind = splittable ? null : 'quality_failure';
  } else if (category === 'heuristic_risk') {
    owner = 'test_designer'; recovery_action = 'review_exploratory_risk'; status = 'exploratory';
  } else {
    const execution = systemContext.delivery_intent === 'execution_plan';
    owner = 'execution_plan_owner'; recovery_action = execution ? 'provide_execution_binding' : 'evaluate_in_execution_plan';
    status = execution ? 'execution_plan_only' : 'ignored_for_case_document'; user_actionable = execution;
  }
  return {
    owner, user_actionable, recovery_action, status, result_kind,
    enters_business_questions: category === 'semantic_gap',
    semantic_status: category === 'semantic_gap' ? 'Blocked' : null
  };
}
