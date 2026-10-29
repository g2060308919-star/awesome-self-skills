import assert from 'node:assert/strict';
import test from 'node:test';
import {assertSupportedSchema,validateAgainstSchema,validateUniqueStableIds} from '../../src/schema-validator.mjs';
const minimumClaims=()=>/** @type {any} */({claims:[],fact_ledger:[]});
test('schema diagnostics escape user-controlled JSON Pointer segments', () => {
  const schema = { type: 'object', properties: {}, additionalProperties: false };

  assert.deepEqual(validateAgainstSchema({ 'a/b': true, 'c~d': true }, schema), [
    { category: 'schema', code: 'ADDITIONAL_PROPERTY', path: '/a~1b', message: 'additional properties are not allowed' },
    { category: 'schema', code: 'ADDITIONAL_PROPERTY', path: '/c~0d', message: 'additional properties are not allowed' }
  ]);
});

test('schema detects duplicate stable IDs only inside definition collections', () => {
  const artifact = minimumClaims();
  artifact.claims.push(
    { claim_id: 'claim_same', source_locator_ids: ['locator_a'] },
    { claim_id: 'claim_same', source_locator_ids: ['locator_a'] }
  );

  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema',
    code: 'DUPLICATE_STABLE_ID',
    path: '/claims/1/claim_id',
    message: 'duplicate stable ID in this collection'
  }]);
});

test('schema detects duplicate fact ledger definition IDs without treating references as definitions', () => {
  const artifact = minimumClaims();
  artifact.fact_ledger.push(
    { fact_id: 'fact_same', claim_id: 'claim_a' },
    { fact_id: 'fact_same', claim_id: 'claim_b' }
  );

  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema',
    code: 'DUPLICATE_STABLE_ID',
    path: '/fact_ledger/1/fact_id',
    message: 'duplicate stable ID in this collection'
  }]);
});

test('schema grammar rejects malformed supported keyword values before validation', () => {
  assert.throws(() => assertSupportedSchema({ type: 'record' }), /type/);
  assert.throws(() => assertSupportedSchema({ required: 'id' }), /required/);
  assert.throws(() => assertSupportedSchema({ properties: [] }), /properties/);
  assert.throws(() => assertSupportedSchema({ uniqueItems: 'yes' }), /uniqueItems/);
  assert.throws(() => assertSupportedSchema({ additionalProperties: 1 }), /additionalProperties/);
  assert.throws(() => assertSupportedSchema({ pattern: '[' }), /regular expression/);
  assert.throws(() => assertSupportedSchema({ minimum: 2, maximum: 1 }), /minimum/);
});

test('schema detects duplicate nested definition IDs but excludes reference arrays', () => {
  const artifact = {
    schema_version: '3.0.0', source_revision: 0,
    views: [{ view_id: 'view_a', type: 'flow', scope: 'checkout', source_claim_ids: ['claim_a'], elements: [
      { element_id: 'element_same', kind: 'flow-node', node_type: 'action', label: 'Open', source_claim_ids: ['claim_a'], model_refs: [] },
      { element_id: 'element_same', kind: 'flow-node', node_type: 'action', label: 'Open again', source_claim_ids: ['claim_a'], model_refs: [] }
    ], relations: [] }], interaction_matrix: [], obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: []
  };
  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema', code: 'DUPLICATE_STABLE_ID', path: '/views/0/elements/1/element_id', message: 'duplicate stable ID in this collection'
  }]);
});

test('schema detects nested rule, candidate, and exploratory duplicate definition IDs', () => {
  const artifact = {
    source_policy: { rules: [{ rule_id: 'rule_same' }, { rule_id: 'rule_same' }] },
    obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: [{ candidate_id: 'candidate_same' }, { candidate_id: 'candidate_same' }],
    exploratory_candidates: [{ exploratory_id: 'explore_same' }, { exploratory_id: 'explore_same' }]
  };
  assert.deepEqual(validateUniqueStableIds(artifact).map((item) => item.path), [
    '/source_policy/rules/1/rule_id', '/interaction_candidates/1/candidate_id', '/exploratory_candidates/1/exploratory_id'
  ]);
});

test('artifact-global identity namespaces reject duplicate element and bundle case IDs', () => {
  const artifact = { views: [{ elements: [{ element_id: 'element_a' }], relations: [] }, { elements: [{ element_id: 'element_a' }], relations: [] }], grounded: [{ case_id: 'case_a' }], conditional: [{ case_id: 'case_a' }] };
  assert.deepEqual(validateUniqueStableIds(artifact).map((item) => item.path), ['/views/1/elements/0/element_id', '/conditional/0/case_id']);
});
