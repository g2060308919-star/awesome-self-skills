import assert from 'node:assert/strict';
import test from 'node:test';
const ordering = /** @type {any} */ (await import('../../src/ordering-registry.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));

/** @returns {any} */
function context() {
  return {
    sources: [{ stable_source_id: 'SRC-b' }, { stable_source_id: 'SRC-a' }],
    locators: [
      { locator_id: 'LOC-flow', stable_source_id: 'SRC-a', unit_kind: 'text', structural_coordinates: [2], start_scalar: 4 },
      { locator_id: 'LOC-action', stable_source_id: 'SRC-a', unit_kind: 'table', structural_coordinates: [1, 2, 3], start_scalar: 0 },
      { locator_id: 'LOC-other', stable_source_id: 'SRC-b', unit_kind: 'image', structural_coordinates: [0, 1], start_scalar: 2 }
    ],
    modules: [{ module_id: 'admin', role: 'primary', locator_ids: ['LOC-flow'] }, { module_id: 'upstream', role: 'upstream', locator_ids: ['LOC-other'] }],
    flows: [{ module_id: 'admin', subject_ref: 'review-flow', locator_id: 'LOC-flow', claim_ids: ['CLM-flow'] }],
    actions: [{ module_id: 'admin', flow_subject_ref: 'review-flow', subject_ref: 'open-review', locator_id: 'LOC-action', claim_ids: ['CLM-action'] }],
    dependencies: [{ predecessor_outcome_id: 'OUT-create', successor_outcome_id: 'OUT-view', basis: { kind: 'evidence', claim_ids: ['CLM-before'] } }],
    verified_claims: [
      { claim_id: 'CLM-flow', locator_ids: ['LOC-flow'], subjects: [{ kind: 'flow', module_id: 'admin', subject_ref: 'review-flow' }] },
      { claim_id: 'CLM-action', locator_ids: ['LOC-action'], subjects: [{ kind: 'action', module_id: 'admin', flow_subject_ref: 'review-flow', subject_ref: 'open-review' }] },
      { claim_id: 'CLM-before', locator_ids: ['LOC-flow'], subjects: [{ kind: 'outcome_dependency', predecessor_outcome_id: 'OUT-create', successor_outcome_id: 'OUT-view' }] }
    ],
    verified_decisions: []
  };
}
/** @param {any} [state] */
function registry(state = context()) {
  assert.equal(typeof ordering.compileOrderingRegistry, 'function', 'source-backed ordering registry compiler must exist');
  return ordering.compileOrderingRegistry(state);
}
/** @param {string} id @param {string} outcome @param {any} sequence @returns {any} */
function candidate(id, outcome, sequence) {
  return {
    case_id: id, title: id, module_id: 'admin', priority: 'P1', ordering: sequence,
    acceptance_role: 'primary_acceptance', fact_ids: ['FACT-review'], primary_test_point_id: `TP-${outcome}`, supporting_observation_ids: [],
    business_preconditions: [], data_conditions: [], steps: [{ step_id: 'STEP-do', action: '执行业务操作' }],
    oracles: [{ oracle_id: 'ORACLE-result', observe_after_step_id: 'STEP-do', surface: 'ui', expected: '显示声明的业务结果', claim_ids: ['CLM-result'] }]
  };
}
/** @returns {any} */
function fixture() {
  const state = context(); const compiled = registry(state);
  const sequence = { business_flow_ref: compiled.business_flows[0].flow_id, page_action_ref: compiled.page_actions[0].action_id };
  const cases = [candidate('CASE-create-z', 'create', sequence), candidate('CASE-create-a', 'create', sequence), candidate('CASE-view', 'view', sequence)];
  cases[2].priority = 'P0';
  return { state, registry: compiled, cases, points: ['create', 'view'].map(outcome => ({ formal_test_point_id: `TP-${outcome}`, outcome_id: `OUT-${outcome}`, acceptance_role: 'primary_acceptance' })) };
}
/** @param {any} value */
const compile = value => ordering.compileCaseOrdering(value.cases, value.points, value.registry, value.state);

test('v4 ordering derives closed registry stable subjects and locator tuple from verified Facts, never input order', () => {
  const state = context(); const compiled = registry(state);
  assert.deepEqual(Object.keys(compiled).sort(), ['business_flows', 'dependency_rules', 'page_actions']);
  assert.match(compiled.business_flows[0].flow_id, /^FLOW-[0-9a-f]{64}$/);
  assert.deepEqual(compiled.business_flows[0].locator_order_key, [0, 0, [2], 4]);
  assert.deepEqual(compiled.page_actions[0].locator_order_key, [0, 1, [1, 2, 3], 0]);
  for (const key of ['sources', 'locators', 'modules', 'flows', 'actions', 'dependencies', 'verified_claims']) state[key].reverse();
  assert.deepEqual(registry(state), compiled);
  const shifted = context(); shifted.locators[0].start_scalar = 5;
  assert.equal(registry(shifted).business_flows[0].flow_id, compiled.business_flows[0].flow_id);
  assert.notDeepEqual(registry(shifted).business_flows[0].locator_order_key, compiled.business_flows[0].locator_order_key);
});

test('v4 ordering rejects unsupported Facts, unknown locators, invented ranks and unsupported dependency basis', () => {
  for (const mutate of [
    (/** @type {any} */ state) => { state.flows[0].claim_ids = []; },
    (/** @type {any} */ state) => { state.flows[0].rank = 0; },
    (/** @type {any} */ state) => { state.flows[0].locator_id = 'LOC-missing'; },
    (/** @type {any} */ state) => { state.locators[0].locator_order_key = [0, 0, [0], 0]; },
    (/** @type {any} */ state) => { state.verified_claims[0].subjects[0].module_id = 'wrong'; },
    (/** @type {any} */ state) => { state.dependencies[0].basis.claim_ids = ['CLM-flow']; },
    (/** @type {any} */ state) => { state.dependencies[0].basis = { kind: 'decision', decision_ids: ['DEC-missing'] }; },
    (/** @type {any} */ state) => { state.locators[0].start_scalar = -1; }
  ]) { const state = context(); mutate(state); assert.throws(() => registry(state)); }
  const state = context(); state.dependencies[0].basis = { kind: 'decision', decision_ids: ['DEC-order'] };
  state.verified_decisions = [{ decision_id: 'DEC-order', subjects: [{ kind: 'outcome_dependency', predecessor_outcome_id: 'OUT-create', successor_outcome_id: 'OUT-view' }] }];
  assert.equal(registry(state).dependency_rules[0].basis.kind, 'decision');
});

test('v4 ordering resolves outcome endpoints to every canonical predecessor and performs dependency-aware priority ordering', () => {
  const value = fixture(); const result = compile(value);
  assert.equal(result.kind, 'ordered');
  assert.deepEqual(result.cases.map((/** @type {any} */ item) => item.case_id), ['CASE-create-a', 'CASE-create-z', 'CASE-view']);
  assert.deepEqual(result.cases[2].ordering.depends_on_case_ids, ['CASE-create-a', 'CASE-create-z']);
  assert.deepEqual(result.cases[0].ordering.depends_on_case_ids, []);
  value.cases.reverse(); value.points.reverse(); assert.deepEqual(compile(value), result);
  assert.deepEqual(ordering.validateCaseOrdering(result.cases, value.points, value.registry, value.state), []);
  const tampered = structuredClone(result.cases); tampered[2].ordering.depends_on_case_ids = ['CASE-create-a'];
  assert.ok(ordering.validateCaseOrdering(tampered, value.points, value.registry, value.state).length);
});

test('v4 ordering rejects fake or cross-module refs, Adapter dependencies, registry tampering and missing endpoints', () => {
  for (const mutate of [
    (/** @type {any} */ value) => { value.cases[0].ordering.business_flow_ref = 'FLOW-forged'; },
    (/** @type {any} */ value) => { value.cases[0].module_id = 'upstream'; },
    (/** @type {any} */ value) => { value.cases[0].ordering.business_flow_ref = null; },
    (/** @type {any} */ value) => { value.cases[0].ordering.depends_on_case_ids = []; },
    (/** @type {any} */ value) => { value.cases[0].ordering.rank = 0; },
    (/** @type {any} */ value) => { value.registry.business_flows[0].locator_order_key[0] = 99; },
    (/** @type {any} */ value) => { value.cases = value.cases.slice(0, 2); }
  ]) { const value = fixture(); mutate(value); const result = compile(value); assert.equal(result.kind, 'fatal'); assert.equal(result.result_kind, 'quality_failure'); }
});

test('v4 ordering allows null unsequenced cases and orders modules then sourced sequence before unsequenced priority', () => {
  const value = fixture(); value.state.dependencies = []; value.registry = registry(value.state);
  const unsequenced = candidate('CASE-unsequenced', 'create', { business_flow_ref: null, page_action_ref: null }); unsequenced.priority = 'P0';
  const upstream = { ...unsequenced, case_id: 'CASE-upstream', module_id: 'upstream' };
  value.cases = [upstream, unsequenced, value.cases[0]];
  const result = compile(value); assert.equal(result.kind, 'ordered');
  assert.deepEqual(result.cases.map((/** @type {any} */ item) => item.case_id), ['CASE-create-z', 'CASE-unsequenced', 'CASE-upstream']);
  assert.ok(result.cases.every((/** @type {any} */ item) => item.ordering.depends_on_case_ids.length === 0));
});

test('v4 ordering returns fatal quality_failure for a proven dependency cycle or self dependency', () => {
  const value = fixture();
  value.state.dependencies.push({ predecessor_outcome_id: 'OUT-view', successor_outcome_id: 'OUT-create', basis: { kind: 'decision', decision_ids: ['DEC-cycle'] } });
  value.state.verified_decisions.push({ decision_id: 'DEC-cycle', subjects: [{ kind: 'outcome_dependency', predecessor_outcome_id: 'OUT-view', successor_outcome_id: 'OUT-create' }] });
  value.registry = registry(value.state);
  const result = compile(value); assert.equal(result.kind, 'fatal'); assert.equal(result.result_kind, 'quality_failure');
  assert.equal(result.diagnostics[0].code, 'CASE_DEPENDENCY_CYCLE');
  value.state.dependencies[1].successor_outcome_id = 'OUT-view'; value.state.verified_decisions[0].subjects[0].successor_outcome_id = 'OUT-view';
  value.registry = registry(value.state); assert.equal(compile(value).diagnostics[0].code, 'CASE_DEPENDENCY_SELF_REFERENCE');
});
