import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateOracleAssertion, validateOracleAssertion, validateOracleSemanticContract, validateTypedOracle } from '../../src/v5/oracles.mjs';
import { typedContractRefKey } from '../../src/v5/behavior-contracts.mjs';
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
    validateOracleAssertion(assertion, { semanticRootDigest: root, semanticRuleIndex: index, fieldCorrespondenceIds: ['mapping-1'], permissionCells: [{ matrix_id: 'matrix', required_cell_key: 'decision', permission_dimension: 'decision', formal_outcome: { permission_dimension: 'decision', action_ref: 'view', expected: 'allow' } }] });
    assert.equal(evaluateOracleAssertion(assertion, positive), true, assertion.kind);
    assert.equal(evaluateOracleAssertion(assertion, negative), false, assertion.kind);
  }
});

test('assertion branches are closed and reject prose, wrong rule kinds, and incomplete permission denial', () => {
  assert.throws(() => validateOracleAssertion({ kind: 'exact_text', expected_text: 'Saved', extra: true }, { semanticRootDigest: root, semanticRuleIndex: index }), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ kind: 'semantic_text', expected_text: 'Saved', equivalence_rule_ref: rule('value_normalization', 'normalize') }, { semanticRootDigest: root, semanticRuleIndex: index }), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ kind: 'permission', expected: 'deny', decision_cell_ref: { matrix_id: 'm', required_cell_key: 'c' } }, { semanticRootDigest: root, semanticRuleIndex: index, permissionCells: [] }), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ expected: '结果正常' }, { semanticRootDigest: root, semanticRuleIndex: index }), /ORACLE_NOT_DECIDABLE/u);
});

test('permission Oracle expected value and denial requiredness are Compiler-owned by exact matrix coordinates', () => {
  const decisionRef = { matrix_id: 'matrix', required_cell_key: 'decision' };
  const coordinates = { role_ref: { coordinate: 'role', coordinate_evidence_digest: 'role' }, resource_ref: { coordinate: 'resource', coordinate_evidence_digest: 'resource' }, action_ref: 'view', context_key: 'tenant:self' };
  const denialRef = { contract_id: 'deny-ui', contract_kind: 'denial_behavior', semantic_root_digest: root };
  const allowContext = {
    semanticRootDigest: root, semanticRuleIndex: index,
    permissionCells: [{ ...decisionRef, ...coordinates, permission_dimension: 'decision', formal_outcome: { permission_dimension: 'decision', action_ref: 'view', expected: 'allow' } }]
  };
  assert.deepEqual(validateOracleAssertion({ kind: 'permission', expected: 'allow', decision_cell_ref: decisionRef }, allowContext), { kind: 'permission', expected: 'allow', decision_cell_ref: decisionRef });
  assert.throws(() => validateOracleAssertion({ kind: 'permission', expected: 'deny', decision_cell_ref: decisionRef, denial_behavior: { kind: 'not_required' } }, allowContext), /ORACLE_NOT_DECIDABLE/u);

  const denyContext = {
    semanticRootDigest: root, semanticRuleIndex: index, acceptedContractRefs: new Set([typedContractRefKey(denialRef)]),
    permissionCells: [
      { ...decisionRef, ...coordinates, permission_dimension: 'decision', formal_outcome: { permission_dimension: 'decision', action_ref: 'view', expected: 'deny' } },
      { matrix_id: 'matrix', required_cell_key: 'denial', ...coordinates, permission_dimension: 'denial_behavior', formal_outcome: { permission_dimension: 'denial_behavior', decision_cell_key: 'decision', denial_contract_ref: { kind: 'accepted', ref: denialRef } } }
    ]
  };
  const required = { kind: 'permission', expected: 'deny', decision_cell_ref: decisionRef, denial_behavior: { kind: 'required', denial_required_cell_key: 'denial', denial_contract_ref: { kind: 'accepted', ref: denialRef } } };
  assert.deepEqual(validateOracleAssertion(required, denyContext), required);
  assert.throws(() => validateOracleAssertion({ ...required, denial_behavior: { kind: 'not_required' } }, denyContext), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ ...required, denial_behavior: { ...required.denial_behavior, denial_required_cell_key: 'other' } }, denyContext), /ORACLE_NOT_DECIDABLE/u);
  assert.throws(() => validateOracleAssertion({ ...required, denial_behavior: { ...required.denial_behavior, denial_contract_ref: { kind: 'accepted', ref: { ...denialRef, contract_id: 'other' } } } }, denyContext), /ORACLE_NOT_DECIDABLE/u);
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

test('Behavior-owned Oracle semantics are closed before Case-local step binding', () => {
  const contract = {
    oracle_contract_client_key: 'oracle-save', formal_test_point_id: 'tp-save',
    observation_ref: { kind: 'response', logical_surface_ref: 'orders', subject_ref: 'order', field_path: '/status' },
    assertion: { kind: 'transition', from_state: { kind: 'string', value: 'draft' }, to_state: { kind: 'string', value: 'saved' }, trigger_action_ref: { action_id: 'save', semantic_root_digest: root } },
    evaluation_scope: { kind: 'single' }, observation_window: { kind: 'after_step' }, basis: [{ kind: 'claim', claim_id: 'claim-save' }]
  };
  assert.deepEqual(validateOracleSemanticContract(contract, { semanticRootDigest: root, semanticRuleIndex: index }), contract);
  assert.throws(() => validateOracleSemanticContract({ ...contract, assertion: { expected: '结果正常' } }, { semanticRootDigest: root, semanticRuleIndex: index }), /ORACLE_NOT_DECIDABLE/u);
});
