import { canonicalV5Stringify } from './canonical-v5.mjs';
import { validateTypedValue, validateValueState } from './behavior-contracts.mjs';
import { V5ProtocolError } from './errors.mjs';
import { resolveSemanticRuleRef } from './semantic-rules.mjs';

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {Record<string,any>} value @param {string[]} keys */
function exact(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }
/** @param {unknown[]} values */
function uniqueTyped(values) { return new Set(values.map((value) => canonicalV5Stringify(value))).size === values.length && values.every(validateTypedValue); }

/** @param {Record<string,any>} assertion @param {Record<string,any>} context */
export function validateOracleAssertion(assertion, context) {
  const fail = (message = 'Oracle assertion is not a closed decidable branch.') => { throw new V5ProtocolError('ORACLE_NOT_DECIDABLE', message); };
  if (!object(assertion) || typeof assertion.kind !== 'string') return fail();
  if (assertion.kind === 'exact_text') { if (!exact(assertion, ['kind', 'expected_text']) || !nonblank(assertion.expected_text)) return fail(); }
  else if (assertion.kind === 'semantic_text') { if (!exact(assertion, ['kind', 'expected_text', 'equivalence_rule_ref']) || !nonblank(assertion.expected_text)) return fail(); resolveSemanticRuleRef(assertion.equivalence_rule_ref, 'semantic_equivalence', context.semanticRuleIndex); }
  else if (assertion.kind === 'value_equals') { const keys = assertion.normalization_ref ? ['kind', 'expected_value', 'normalization_ref'] : ['kind', 'expected_value']; if (!exact(assertion, keys) || !validateTypedValue(assertion.expected_value)) return fail(); if (assertion.normalization_ref) resolveSemanticRuleRef(assertion.normalization_ref, 'value_normalization', context.semanticRuleIndex); }
  else if (assertion.kind === 'value_state_equals') { if (!exact(assertion, ['kind', 'expected_value_state'])) return fail(); try { validateValueState(assertion.expected_value_state); } catch { return fail(); } }
  else if (assertion.kind === 'exists' || assertion.kind === 'absent') { if (!exact(assertion, ['kind'])) return fail(); }
  else if (assertion.kind === 'set_contains' || assertion.kind === 'set_equals') {
    const keys = assertion.kind === 'set_contains' ? ['kind', 'expected_members', 'normalization_ref'] : ['kind', 'expected_members', 'order_sensitive', 'normalization_ref'];
    if (!exact(assertion, keys) || !Array.isArray(assertion.expected_members) || (assertion.kind === 'set_contains' && assertion.expected_members.length === 0) || !uniqueTyped(assertion.expected_members) || (assertion.kind === 'set_equals' && typeof assertion.order_sensitive !== 'boolean')) return fail();
    resolveSemanticRuleRef(assertion.normalization_ref, 'value_normalization', context.semanticRuleIndex);
  } else if (assertion.kind === 'count_equals' || assertion.kind === 'count_at_least') {
    const field = assertion.kind === 'count_equals' ? 'expected_count' : 'minimum_count';
    if (!exact(assertion, ['kind', field]) || !Number.isSafeInteger(assertion[field]) || assertion[field] < 0) return fail();
  } else if (assertion.kind === 'transition') {
    const keys = assertion.trigger_step_client_key ? ['kind', 'from_state', 'to_state', 'trigger_action_ref', 'trigger_step_client_key'] : ['kind', 'from_state', 'to_state', 'trigger_action_ref'];
    if (!exact(assertion, keys) || !validateTypedValue(assertion.from_state) || !validateTypedValue(assertion.to_state) || !nonblank(assertion.trigger_action_ref?.action_id) || assertion.trigger_action_ref.semantic_root_digest !== context.semanticRootDigest || (assertion.trigger_step_client_key !== undefined && !nonblank(assertion.trigger_step_client_key))) return fail();
  } else if (assertion.kind === 'cross_surface_equals') {
    if (!exact(assertion, ['kind', 'field_correspondence_id']) || !context.fieldCorrespondenceIds?.includes(assertion.field_correspondence_id)) return fail();
  } else if (assertion.kind === 'permission') {
    if (!/** @type {Array<Record<string,any>>|undefined} */ (context.permissionDecisionCells)?.some((cell) => canonicalV5Stringify(cell) === canonicalV5Stringify(assertion.decision_cell_ref))) return fail('Permission decision cell is not accepted.');
    if (assertion.expected === 'allow') { if (!exact(assertion, ['kind', 'expected', 'decision_cell_ref'])) return fail(); }
    else if (assertion.expected === 'deny') {
      if (!exact(assertion, ['kind', 'expected', 'decision_cell_ref', 'denial_behavior']) || !object(assertion.denial_behavior)) return fail();
      if (assertion.denial_behavior.kind === 'not_required') { if (!exact(assertion.denial_behavior, ['kind'])) return fail(); }
      else if (assertion.denial_behavior.kind === 'required') {
        if (!exact(assertion.denial_behavior, ['kind', 'denial_required_cell_key', 'denial_contract_ref']) || assertion.denial_behavior.denial_contract_ref?.ref?.contract_kind !== 'denial_behavior' || assertion.denial_behavior.denial_contract_ref.ref.semantic_root_digest !== context.semanticRootDigest) return fail();
      } else return fail();
    } else return fail();
  } else return fail();
  return structuredClone(assertion);
}

/** @param {Record<string,any>} value */
function typedPrimitive(value) { if (value.kind === 'null') return null; if (value.kind === 'empty_string') return ''; return value.value; }

/** @param {Record<string,any>} assertion @param {any} observed */
export function evaluateOracleAssertion(assertion, observed) {
  if (assertion.kind === 'exact_text') return observed === assertion.expected_text;
  if (assertion.kind === 'semantic_text') return typeof observed === 'string' && observed.trim().toLocaleLowerCase() === assertion.expected_text.trim().toLocaleLowerCase();
  if (assertion.kind === 'value_equals') return Object.is(observed, typedPrimitive(assertion.expected_value));
  if (assertion.kind === 'value_state_equals') return canonicalV5Stringify(observed) === canonicalV5Stringify(assertion.expected_value_state);
  if (assertion.kind === 'exists') return observed !== undefined;
  if (assertion.kind === 'absent') return observed === undefined;
  if (assertion.kind === 'set_contains') return Array.isArray(observed) && /** @type {Array<Record<string,any>>} */ (assertion.expected_members).every((item) => observed.some((value) => Object.is(value, typedPrimitive(item))));
  if (assertion.kind === 'set_equals') {
    if (!Array.isArray(observed)) return false;
    const expected = assertion.expected_members.map(typedPrimitive);
    return assertion.order_sensitive ? canonicalV5Stringify(observed) === canonicalV5Stringify(expected) : canonicalV5Stringify([...observed].sort()) === canonicalV5Stringify([...expected].sort());
  }
  if (assertion.kind === 'count_equals') return (Array.isArray(observed) ? observed.length : observed) === assertion.expected_count;
  if (assertion.kind === 'count_at_least') return (Array.isArray(observed) ? observed.length : observed) >= assertion.minimum_count;
  if (assertion.kind === 'transition') return observed?.from === typedPrimitive(assertion.from_state) && observed?.to === typedPrimitive(assertion.to_state) && observed?.action_id === assertion.trigger_action_ref.action_id;
  if (assertion.kind === 'cross_surface_equals') return object(observed) && Object.is(observed.left, observed.right);
  if (assertion.kind === 'permission') return observed === assertion.expected;
  return false;
}

/** @param {Record<string,any>} observation @param {Record<string,any>} context */
function validateObservation(observation, context) {
  if (!object(observation) || !['ui', 'response', 'storage', 'event', 'system_state'].includes(observation.kind) || !nonblank(observation.logical_surface_ref) || !nonblank(observation.subject_ref)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Observation reference is invalid.');
  const common = ['kind', 'logical_surface_ref', 'subject_ref', ...(Object.hasOwn(observation, 'field_path') ? ['field_path'] : [])];
  if (Object.hasOwn(observation, 'field_path') && !nonblank(observation.field_path)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Observation field path must be nonblank when present.');
  if (observation.kind === 'ui') {
    if (!exact(observation, [...common, 'locator_contract_ref'])) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'UI observation has non-contract fields.');
    resolveSemanticRuleRef(observation.locator_contract_ref, 'locator', context.semanticRuleIndex);
  } else if (!exact(observation, common)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Observation has non-contract fields.');
}

/** @param {Record<string,any>} window */
function validateObservationWindow(window) {
  return object(window) && (
    window.kind === 'after_step' && exact(window, ['kind']) ||
    ['within', 'stable_for'].includes(window.kind) && exact(window, ['kind', 'duration_ms']) && Number.isSafeInteger(window.duration_ms) && window.duration_ms > 0 ||
    window.kind === 'until_signal' && exact(window, ['kind', 'signal_ref', 'timeout_ms']) && nonblank(window.signal_ref) && Number.isSafeInteger(window.timeout_ms) && window.timeout_ms > 0
  );
}

/** @param {Record<string,any>} contract @param {Record<string,any>} context */
export function validateOracleSemanticContract(contract, context) {
  const keys = ['oracle_contract_client_key', 'formal_test_point_id', 'observation_ref', 'assertion', 'evaluation_scope', 'observation_window', 'basis'];
  if (!object(contract) || !exact(contract, keys) || !nonblank(contract.oracle_contract_client_key) || !nonblank(contract.formal_test_point_id) || !Array.isArray(contract.basis) || contract.basis.length === 0) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Oracle semantic contract identity or basis is incomplete.');
  validateObservation(contract.observation_ref, context);
  validateOracleAssertion(contract.assertion, context);
  const scope = contract.evaluation_scope;
  const validScope = object(scope) && (scope.kind === 'single' && exact(scope, ['kind']) || scope.kind === 'forall' && exact(scope, ['kind', 'population_contract_client_key', 'population_proof_client_key']) && nonblank(scope.population_contract_client_key) && nonblank(scope.population_proof_client_key));
  if (!validScope || !validateObservationWindow(contract.observation_window)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Oracle semantic scope or observation window is invalid.');
  return structuredClone(contract);
}

/** @param {Record<string,any>} oracle @param {Record<string,any>} context */
export function validateTypedOracle(oracle, context) {
  const keys = ['oracle_client_key', 'oracle_semantic_contract_id', 'observe_after_step_client_key', 'observation_ref', 'assertion', 'evaluation_scope', 'observation_window', 'claim_ids'];
  if (!object(oracle) || !exact(oracle, keys) || !nonblank(oracle.oracle_client_key) || !context.oracleSemanticContractIds.includes(oracle.oracle_semantic_contract_id) || !context.stepClientKeys.includes(oracle.observe_after_step_client_key) || !Array.isArray(oracle.claim_ids) || oracle.claim_ids.length === 0 || oracle.claim_ids.some((/** @type {string} */ id) => !context.acceptedClaimIds.includes(id)) || new Set(oracle.claim_ids).size !== oracle.claim_ids.length) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Typed Oracle ownership or evidence binding is invalid.');
  validateObservation(oracle.observation_ref, context);
  validateOracleAssertion(oracle.assertion, context);
  if (oracle.assertion.kind === 'transition' && oracle.assertion.trigger_step_client_key !== oracle.observe_after_step_client_key) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Transition trigger and observation step must be explicitly bound.');
  const window = oracle.observation_window;
  if (!validateObservationWindow(window)) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Oracle observation window is invalid.');
  if (!(oracle.evaluation_scope?.kind === 'single' && exact(oracle.evaluation_scope, ['kind'])) && !(oracle.evaluation_scope?.kind === 'forall' && exact(oracle.evaluation_scope, ['kind', 'population_contract_id', 'population_proof_id']) && nonblank(oracle.evaluation_scope.population_contract_id) && nonblank(oracle.evaluation_scope.population_proof_id))) throw new V5ProtocolError('ORACLE_SEMANTICS_REQUIRED', 'Oracle evaluation scope is invalid.');
  return structuredClone(oracle);
}
