import assert from 'node:assert/strict';
import test from 'node:test';
import schema from '../../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
const sparse = /** @type {any} */ (await import('../../src/views/sparse-behavior-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));
/** @returns {any} */
function element() {
  return { element_id: 'EL-star', kind: 'input_domain', fact_id: 'FACT-star', business_outcome: '评价星级文案',
    partitions: [{ kind: 'enum', value: 500, expected: '推荐' }, { kind: 'enum', value: 1, expected: '常规' }, { kind: 'enum', value: 0, expected: '不推荐' }],
    evidence_bindings: [
      { field_path: '/business_outcome', claim_ids: ['CLM-star'] },
      ...[0, 1, 2].flatMap(index => ['value', 'expected'].map(field => ({ field_path: `/partitions/${index}/${field}`, claim_ids: ['CLM-star'] })))
    ] };
}
/** @param {any} item */
function structural(item) {
  assert.ok(/** @type {any} */ (schema).$defs?.v4Element, 'the persisted Behavior Views Schema must own the v4 element contract');
  return validateAgainstSchema(item, { $defs: /** @type {any} */ (schema).$defs, $ref: '#/$defs/v4Element' });
}
/** @param {any} item @returns {any} */
function evidence(item) {
  const valueAt = (/** @type {string} */ pointer) => pointer.slice(1).split('/').reduce((value, key) => value[key], item);
  return { facts: [{ fact_id: item.fact_id, module_id: 'admin', acceptance_role: 'primary_acceptance', condition_field: 'star_level' }],
    claims: [{ claim_id: 'CLM-star', level: 'E3', supported: true,
      assertions: item.evidence_bindings.map((/** @type {any} */ binding) => ({ fact_id: item.fact_id, field_path: binding.field_path, value: valueAt(binding.field_path) })) }] };
}
/** @param {any} item @param {any} [context] */
function semantic(item, context = evidence(item)) {
  assert.equal(typeof sparse.validateSparseBehaviorElementV4, 'function');
  return sparse.validateSparseBehaviorElementV4(item, context);
}

test('v4 sparse input domain accepts three enum values without any numeric bounds', () => {
  assert.deepEqual(structural(element()), []);
  assert.deepEqual(semantic(element()), []);
  const range = element(); range.partitions = [{ kind: 'range', bounds: { lower: 1, upper: 10, inclusive: true }, expected: '接受' }];
  range.evidence_bindings = [
    { field_path: '/business_outcome', claim_ids: ['CLM-star'] },
    { field_path: '/partitions/0/bounds/lower', claim_ids: ['CLM-star'] },
    { field_path: '/partitions/0/bounds/upper', claim_ids: ['CLM-star'] },
    { field_path: '/partitions/0/bounds/inclusive', claim_ids: ['CLM-star'] },
    { field_path: '/partitions/0/expected', claim_ids: ['CLM-star'] }
  ];
  assert.deepEqual(structural(range), []); assert.deepEqual(semantic(range), []);
  const malformed = element(); malformed.partitions[0].bounds = { lower: 0, upper: 0, inclusive: true };
  assert.ok(structural(malformed).length);
  const noProof = evidence(range); noProof.claims[0].assertions = noProof.claims[0].assertions.filter((/** @type {any} */ item) => !item.field_path.includes('/bounds/'));
  range.partitions[0].bounds.lower = 0; range.partitions[0].bounds.upper = 0;
  assert.ok(semantic(range, noProof).length, 'placeholder zero bounds must not acquire evidence');
});

test('v4 sparse integration accepts response and UI only, without synthetic state or cleanup', () => {
  const item = { element_id: 'EL-source', kind: 'integration', fact_id: 'FACT-source', business_outcome: '来源 22 显示打车去过',
    surfaces: [{ kind: 'response', assertion: 'source 原值为 22' }, { kind: 'ui', assertion: '来源列显示打车去过' }],
    evidence_bindings: ['/business_outcome', '/surfaces/0/assertion', '/surfaces/1/assertion'].map(field_path => ({ field_path, claim_ids: ['CLM-star'] })) };
  assert.deepEqual(structural(item), []); assert.deepEqual(semantic(item), []);
  for (const bad of [{ ...item, surfaces: [] }, { ...item, persistence: 'N/A' }, { ...item, cleanup: 'N/A' }]) assert.ok(structural(bad).length);
  assert.ok(semantic({ ...item, surfaces: [{ kind: 'response', assertion: 'N/A' }] }, evidence(item)).length);
});

test('v4 sparse formal assertions require exact positive field-level evidence and atomic fact ownership', () => {
  const item = element(); const state = evidence(item);
  for (const mutate of [
    (/** @type {any} */ draft) => { draft.fact_ids = Array.from({ length: 14 }, (_, index) => `FACT-${index}`); },
    (/** @type {any} */ draft) => { draft.fact_id = ['FACT-a', 'FACT-b']; },
    (/** @type {any} */ draft) => { draft.evidence_bindings = ['CLM-star']; },
    (/** @type {any} */ draft) => { draft.evidence_bindings.pop(); },
    (/** @type {any} */ draft) => { draft.evidence_bindings[0].claim_ids = ['CLM-missing']; },
    (/** @type {any} */ draft) => { draft.evidence_bindings[0].field_path = '/missing'; },
    (/** @type {any} */ draft) => { draft.partitions[0].expected = 'PRD 未定义'; }
  ]) { const draft = structuredClone(item); mutate(draft); assert.ok(semantic(draft, state).length); }
  state.claims[0].assertions[0].value = '不支持该业务结果'; assert.ok(semantic(item, state).length);
  const unsupported = evidence(item); unsupported.claims[0].supported = false; assert.ok(semantic(item, unsupported).length);
});

test('v4 sparse flow state and timing compile only explicit expected outcomes and require sourced effects', () => {
  for (const kind of ['flow', 'decision', 'state', 'role', 'timing']) {
    const item = { element_id: `EL-${kind}`, kind, fact_id: `FACT-${kind}`, business_outcome: '保存结果可见', condition: { saved: true }, expected: '显示已保存',
      evidence_bindings: ['/business_outcome', '/condition', '/expected'].map(field_path => ({ field_path, claim_ids: ['CLM-star'] })) };
    assert.deepEqual(structural(item), []); assert.deepEqual(semantic(item), []);
    const withEffect = { ...item, semantic_effects: [{ effect_id: 'EFF-save', kind: 'state_change', subject: '保存状态', after: '已保存', claim_ids: ['CLM-star'] }] };
    assert.ok(semantic(withEffect, evidence(item)).length, 'normal wording cannot replace effect evidence');
    assert.ok(structural({ ...item, semantic_effects: [{ effect_id: 'EFF-save', kind: 'state_change', subject: '保存状态', after: '已保存' }] }).length);
  }
});
