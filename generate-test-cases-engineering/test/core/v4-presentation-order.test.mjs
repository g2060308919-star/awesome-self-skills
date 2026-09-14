import assert from 'node:assert/strict';
import test from 'node:test';

const presentation = /** @type {any} */ (await import('../../src/presentation-order.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));
import { compileOrderingRegistry } from '../../src/ordering-registry.mjs';

function context() {
  return {
    sources: [{ stable_source_id: 'SRC-main' }],
    locators: [
      { locator_id: 'LOC-primary', stable_source_id: 'SRC-main', unit_kind: 'text', structural_coordinates: [1], start_scalar: 0 },
      { locator_id: 'LOC-downstream', stable_source_id: 'SRC-main', unit_kind: 'text', structural_coordinates: [2], start_scalar: 0 },
      { locator_id: 'LOC-flow', stable_source_id: 'SRC-main', unit_kind: 'text', structural_coordinates: [3], start_scalar: 0 },
      { locator_id: 'LOC-action', stable_source_id: 'SRC-main', unit_kind: 'text', structural_coordinates: [4], start_scalar: 0 }
    ],
    modules: [
      { module_id: 'main', role: 'primary', locator_ids: ['LOC-primary'] },
      { module_id: 'ledger', role: 'downstream', locator_ids: ['LOC-downstream'] }
    ],
    flows: [{ module_id: 'main', subject_ref: 'submit', locator_id: 'LOC-flow', claim_ids: ['CLM-flow'] }],
    actions: [{ module_id: 'main', flow_subject_ref: 'submit', subject_ref: 'confirm', locator_id: 'LOC-action', claim_ids: ['CLM-action'] }],
    dependencies: [{ predecessor_outcome_id: 'OUT-create', successor_outcome_id: 'OUT-read', basis: { kind: 'evidence', claim_ids: ['CLM-dependency'] } }],
    verified_claims: [
      { claim_id: 'CLM-flow', locator_ids: ['LOC-flow'], subjects: [{ kind: 'flow', module_id: 'main', subject_ref: 'submit' }] },
      { claim_id: 'CLM-action', locator_ids: ['LOC-action'], subjects: [{ kind: 'action', module_id: 'main', flow_subject_ref: 'submit', subject_ref: 'confirm' }] },
      { claim_id: 'CLM-dependency', locator_ids: ['LOC-flow'], subjects: [{ kind: 'outcome_dependency', predecessor_outcome_id: 'OUT-create', successor_outcome_id: 'OUT-read' }] }
    ],
    verified_decisions: []
  };
}

/** @param {string} id @param {string} point @param {string} title @param {string} [priority] */
function candidate(id, point, title, priority = 'P1') {
  return {
    case_id: id, title, module_id: 'main', priority, acceptance_role: 'primary_acceptance',
    fact_ids: ['FACT-1'], primary_test_point_id: point, supporting_observation_ids: [],
    business_preconditions: [], data_conditions: [],
    steps: [{ step_id: 'STEP-1', action: '提交' }],
    oracles: [{ oracle_id: 'ORACLE-1', observe_after_step_id: 'STEP-1', surface: 'ui', expected: '结果可见', claim_ids: ['CLM-result'] }],
    ordering: { business_flow_ref: null, page_action_ref: null }
  };
}

function fixture() {
  const orderingContext = context();
  return {
    cases: [
      candidate('CASE-read', 'TP-read', '读取结果', 'P0'),
      candidate('CASE-z', 'TP-create', '创建结果', 'P2'),
      candidate('CASE-a', 'TP-create', '创建结果', 'P1')
    ],
    formal_test_points: [
      { formal_test_point_id: 'TP-create', outcome_id: 'OUT-create', acceptance_role: 'primary_acceptance' },
      { formal_test_point_id: 'TP-read', outcome_id: 'OUT-read', acceptance_role: 'primary_acceptance' }
    ],
    ordering_registry: compileOrderingRegistry(orderingContext),
    ordering_context: orderingContext
  };
}

test('v4 presentation order is dependency-aware and uses the frozen business rank instead of input/hash order', () => {
  assert.equal(typeof presentation.compilePresentationOrderV4, 'function');
  const result = presentation.compilePresentationOrderV4(fixture());
  assert.equal(result.kind, 'ordered');
  assert.deepEqual(result.ordered_case_ids, ['CASE-a', 'CASE-z', 'CASE-read']);
  assert.deepEqual(result.cases.find((/** @type {any} */ item) => item.case_id === 'CASE-read').ordering.depends_on_case_ids,
    ['CASE-a', 'CASE-z']);
});

test('v4 presentation order independently rejects forged dependency sets and stale registry content', () => {
  assert.equal(typeof presentation.validatePresentationOrderV4, 'function');
  const input = fixture();
  const compiled = presentation.compilePresentationOrderV4(input);
  const forged = structuredClone(compiled);
  forged.cases[2].ordering.depends_on_case_ids = [];
  assert.match(presentation.validatePresentationOrderV4(forged, input).at(0).code, /DEPENDENCY/);
  input.ordering_registry.business_flows.push(structuredClone(input.ordering_registry.business_flows[0]));
  assert.equal(presentation.compilePresentationOrderV4(input).kind, 'fatal');
});

test('v4 presentation order converts a verified dependency cycle into fatal quality_failure', () => {
  const input = fixture();
  /** @type {any} */ (input.ordering_context.dependencies).push({ predecessor_outcome_id: 'OUT-read', successor_outcome_id: 'OUT-create', basis: { kind: 'decision', decision_ids: ['DEC-cycle'] } });
  /** @type {any} */ (input.ordering_context.verified_decisions).push({ decision_id: 'DEC-cycle', subjects: [{ kind: 'outcome_dependency', predecessor_outcome_id: 'OUT-read', successor_outcome_id: 'OUT-create' }] });
  input.ordering_registry = compileOrderingRegistry(input.ordering_context);
  const result = presentation.compilePresentationOrderV4(input);
  assert.equal(result.kind, 'fatal');
  assert.equal(result.result_kind, 'quality_failure');
  assert.equal(result.diagnostics[0].code, 'CASE_DEPENDENCY_CYCLE');
});
