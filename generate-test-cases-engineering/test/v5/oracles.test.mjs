import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateOracleAssertion, validateOracleAssertion, validateTypedOracle } from '../../src/v5/oracles.mjs';
import { createSemanticRuleIndex } from '../../src/v5/semantic-rules.mjs';

const root = `sha256:${'a'.repeat(64)}`;
const registry = `sha256:${'b'.repeat(64)}`;
const implementation = `sha256:${'c'.repeat(64)}`;
const index = createSemanticRuleIndex(root, { registry_digest: registry, registered_rules: [
  { rule_id: 'semantic', rule_kind: 'semantic_equivalence', implementation_digest: implementation },
  { rule_id: 'normalize', rule_kind: 'value_normalization', implementation_digest: implementation },
  { rule_id: 'locator', rule_kind: 'locator', implementation_digest: implementation }
], accepted_rule_contract_refs: [] });
/** @param {string} kind @param {string} id */
const rule = (kind, id) => ({ source: 'closed_registry', registry_digest: registry, rule_id: id, rule_kind: kind, implementation_digest: implementation });

test('all closed assertion branches have one deterministic positive and negative verdict', () => {
  const rows = /** @type {Array<[Record<string,any>, any, any]>} */ ([
    [{ kind: 'exact_text', expected_text: 'Saved' }, 'Saved', 'Failed'],
    [{ kind: 'semantic_text', expected_text: 'Saved', equivalence_rule_ref: rule('semantic_equivalence', 'semantic') }, 'saved', 'failed'],
    [{ kind: 'value_equals', expected_value: { kind: 'number', value: 0 } }, 0, null],
    [{ kind: 'value_state_equals', expected_value_state: { axes: 'data_only', data_state: { presence: 'present', value: { kind: 'number', value: 0 } } } }, { axes: 'data_only', data_state: { presence: 'present', value: { kind: 'number', value: 0 } } }, { axes: 'data_only', data_state: { presence: 'missing' } }],
    [{ kind: 'exists' }, 'x', undefined],
    [{ kind: 'absent' }, undefined, 'x'],
    [{ kind: 'set_contains', expected_members: [{ kind: 'string', value: 'a' }], normalization_ref: rule('value_normalization', 'normalize') }, ['a', 'b'], ['b']],
    [{ kind: 'set_equals', expected_members: [{ kind: 'string', value: 'a' }], order_sensitive: false, normalization_ref: rule('value_normalization', 'normalize') }, ['a'], ['a', 'b']],
    [{ kind: 'count_equals', expected_count: 2 }, [1, 2], [1]],
    [{ kind: 'count_at_least', minimum_count: 2 }, [1, 2], [1]],
    [{ kind: 'transition', from_state: { kind: 'string', value: 'draft' }, to_state: { kind: 'string', value: 'saved' }, trigger_action_ref: { action_id: 'save', semantic_root_digest: root } }, { from: 'draft', to: 'saved', action_id: 'save' }, { from: 'draft', to: 'failed', action_id: 'save' }],
    [{ kind: 'cross_surface_equals', field_correspondence_id: 'mapping-1' }, { left: 1, right: 1 }, { left: 1, right: 2 }],
    [{ kind: 'permission', expected: 'allow', decision_cell_ref: { matrix_id: 'matrix', required_cell_key: 'decision' } }, 'allow', 'deny']
  ]);
  for (const [assertion, positive, negative] of rows) {
    validateOracleAssertion(assertion, { semanticRootDigest: root, semanticRuleIndex: index, fieldCorrespondenceIds: ['mapping-1'], permissionDecisionCells: [{ matrix_id: 'matrix', required_cell_key: 'decision' }] });
    assert.equal(evaluateOracleAssertion(assertion, positive), true, assertion.kind);
    assert.equal(evaluateOracleAssertion(assertion, negative), false, assertion.kind);
  }
});

test('assertion branches are closed and reject prose, wrong rule kinds, and incomplete permission denial', () => {
  assert.throws(() => validateOracleAssertion({ kind: 'exact_text', expected_text: 'Saved', extra: true }, { semanticRootDigest: root, semanticRuleIndex: index }), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ kind: 'semantic_text', expected_text: 'Saved', equivalence_rule_ref: rule('value_normalization', 'normalize') }, { semanticRootDigest: root, semanticRuleIndex: index }), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ kind: 'permission', expected: 'deny', decision_cell_ref: { matrix_id: 'm', required_cell_key: 'c' } }, { semanticRootDigest: root, semanticRuleIndex: index, permissionDecisionCells: [] }), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ expected: '结果正常' }, { semanticRootDigest: root, semanticRuleIndex: index }), /ORACLE_NOT_DECIDABLE/u);
});

test('TypedOracle binds observation, owning step, scope/window, claims, and transition trigger step', () => {
  const oracle = {
    oracle_client_key: 'oracle-save', oracle_semantic_contract_id: 'osc-save', observe_after_step_client_key: 'step-save',
    observation_ref: { kind: 'ui', logical_surface_ref: 'orders', subject_ref: 'order', locator_contract_ref: rule('locator', 'locator'), field_path: '/status' },
    assertion: { kind: 'transition', from_state: { kind: 'string', value: 'draft' }, to_state: { kind: 'string', value: 'saved' }, trigger_action_ref: { action_id: 'save', semantic_root_digest: root }, trigger_step_client_key: 'step-save' },
    evaluation_scope: { kind: 'single' }, observation_window: { kind: 'within', duration_ms: 5000 }, claim_ids: ['claim-save']
  };
  assert.deepEqual(validateTypedOracle(oracle, { semanticRootDigest: root, semanticRuleIndex: index, stepClientKeys: ['step-save'], acceptedClaimIds: ['claim-save'], oracleSemanticContractIds: ['osc-save'] }), oracle);
  assert.throws(() => validateTypedOracle({ ...oracle, observe_after_step_client_key: 'step-missing' }, { semanticRootDigest: root, semanticRuleIndex: index, stepClientKeys: ['step-save'], acceptedClaimIds: ['claim-save'], oracleSemanticContractIds: ['osc-save'] }), /ORACLE_SEMANTICS_REQUIRED/u);
});
