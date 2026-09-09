import assert from 'node:assert/strict';
import test from 'node:test';
import * as semantics from '../../src/case-semantics-v4.mjs';

/** @returns {any} */
function candidate() {
  return {
    case_id: 'CASE-review', title: '评价来源', module_id: 'admin', priority: 'P0',
    ordering: { business_flow_ref: null, page_action_ref: null }, acceptance_role: 'primary_acceptance',
    fact_ids: ['FACT-source'], primary_test_point_id: 'TP-source', supporting_observation_ids: [],
    business_preconditions: [{ precondition_id: 'PRE-view', description: '有查看权限' }],
    data_conditions: [{ condition_id: 'COND-source', description: '存在评价' }],
    steps: [{ step_id: 'STEP-open', action: '打开评价' }],
    oracles: [{ oracle_id: 'ORACLE-source', observe_after_step_id: 'STEP-open', surface: 'ui', expected: '来源符合需求', claim_ids: ['CLM-source'] }],
    semantic_effects: [{ effect_id: 'EFFECT-read', kind: 'state_change', subject: '已读状态', after: '已读', claim_ids: ['CLM-read'] }],
    test_values: [{ value_id: 'VAL-source', subject_ref: 'admin.review', field_path: '/response/source', value: 22,
      used_by_refs: ['COND-source'], value_origin: { kind: 'requirement', claim_ids: ['CLM-source'] } }]
  };
}
/** @returns {any} */
function context() {
  return {
    semantic_status: 'Grounded',
    claims: [{ claim_id: 'CLM-source', origin_kind: 'requirement', subject_ref: 'admin.review', field_path: '/response/source', value: 22, supported: true }],
    derivations: [{ method_id: 'sum', method_version: '1', inputs_digest: `sha256:${'a'.repeat(64)}`,
      input_claim_ids: ['CLM-source'], subject_ref: 'admin.review', field_path: '/response/source', value: 22 }],
    supported_claim_ids: ['CLM-source'],
    semantic_gap_ids: ['GAP-source']
  };
}
/** @param {any} draft @param {any} [state] */
function validate(draft, state = context()) {
  const fn = /** @type {any} */ (semantics).validateTestValueOriginsV4;
  assert.equal(typeof fn, 'function', 'the semantic value-origin checker must exist');
  return fn(draft, state);
}

test('v4 value origins accept the four closed branches and all five Case-local reference kinds', () => {
  const item = candidate();
  const origins = [
    { kind: 'requirement', claim_ids: ['CLM-source'] },
    { kind: 'example', claim_ids: ['CLM-source'], replaceable: true },
    { kind: 'derived', input_claim_ids: ['CLM-source'], derivation: context().derivations[0], evidence_level: 'derived' },
    { kind: 'temporary_assumption', assumption_id: 'ASM-source', semantic_gap_ids: ['GAP-source'], reason: '等待业务规则确认', requires_case_status: 'Conditional' }
  ];
  origins[2].derivation = { method_id: 'sum', method_version: '1', inputs_digest: `sha256:${'a'.repeat(64)}` };
  for (const origin of origins) {
    item.test_values[0].value_origin = origin;
    assert.deepEqual(semantics.validateCaseSemanticsV4(item), []);
  }
  item.test_values[0].value_origin = origins[0];
  for (const ref of ['PRE-view', 'COND-source', 'STEP-open', 'ORACLE-source', 'EFFECT-read']) {
    item.test_values[0].used_by_refs = [ref];
    assert.deepEqual(validate(item), []);
  }
});

test('v4 value origins reject cross-branch fields, missing IDs, malformed subject pointers and ambiguous local references', () => {
  const item = candidate();
  const invalid = [
    { kind: 'requirement', claim_ids: [] },
    { kind: 'requirement', claim_ids: ['CLM-source'], replaceable: true },
    { kind: 'example', claim_ids: ['CLM-source'], replaceable: false },
    { kind: 'derived', input_claim_ids: ['CLM-source'], derivation: { method_id: 'sum', inputs_digest: `sha256:${'a'.repeat(64)}` }, evidence_level: 'derived' },
    { kind: 'temporary_assumption', assumption_id: 'ASM-source', semantic_gap_ids: [], reason: '待确认', requires_case_status: 'Conditional' }
  ];
  for (const origin of invalid) {
    item.test_values[0].value_origin = origin;
    assert.ok(semantics.validateCaseSemanticsV4(item).length);
  }
  for (const refs of [[], ['STEP-other-case'], ['CASE-review'], [{ kind: 'unknown', id: 'STEP-open' }]]) {
    const draft = candidate(); draft.test_values[0].used_by_refs = refs;
    assert.ok(semantics.validateCaseSemanticsV4(draft).length);
  }
  for (const pointer of ['/response/~3', 'response/source']) {
    const draft = candidate(); draft.test_values[0].field_path = pointer;
    assert.ok(semantics.validateCaseSemanticsV4(draft).length);
  }
  const prose = candidate(); prose.test_values[0].subject_ref = prose.case_id; prose.test_values[0].field_path = '/steps/0/action';
  assert.ok(semantics.validateCaseSemanticsV4(prose).length);
  const duplicate = candidate(); duplicate.test_values.push(structuredClone(duplicate.test_values[0]));
  assert.ok(semantics.validateCaseSemanticsV4(duplicate).length);
});

test('v4 example values remain replaceable construction samples, never fixed Oracle or effect expectations', () => {
  const item = candidate(); item.test_values[0].value_origin = { kind: 'example', claim_ids: ['CLM-source'], replaceable: true };
  const exampleContext = context(); exampleContext.claims[0].origin_kind = 'example';
  assert.deepEqual(validate(item, exampleContext), []);
  for (const ref of ['ORACLE-source', 'EFFECT-read']) {
    item.test_values[0].used_by_refs = [ref];
    assert.equal(validate(item, exampleContext)[0].code, 'EXAMPLE_FIXED_EXPECTATION');
  }
  item.test_values[0].used_by_refs = ['COND-source'];
  const missing = exampleContext; missing.claims = [];
  assert.equal(validate(item, missing)[0].code, 'VALUE_EVIDENCE_UNRESOLVED');
});

test('v4 derived values require the exact verified version, inputs digest, Claim set and result', () => {
  const item = candidate(); item.test_values[0].value_origin = {
    kind: 'derived', input_claim_ids: ['CLM-source'],
    derivation: { method_id: 'sum', method_version: '1', inputs_digest: `sha256:${'a'.repeat(64)}` }, evidence_level: 'derived'
  };
  assert.deepEqual(validate(item), []);
  for (const mutate of [
    (/** @type {any} */ state) => { state.derivations = []; },
    (/** @type {any} */ state) => { state.derivations[0].method_version = '2'; },
    (/** @type {any} */ state) => { state.derivations[0].inputs_digest = `sha256:${'b'.repeat(64)}`; },
    (/** @type {any} */ state) => { state.derivations[0].value = 23; },
    (/** @type {any} */ state) => { state.supported_claim_ids = []; }
  ]) { const state = context(); mutate(state); assert.ok(validate(item, state).length); }
});

test('v4 temporary assumptions require a real semantic gap and exactly Conditional classification', () => {
  const item = candidate(); item.test_values[0].value_origin = {
    kind: 'temporary_assumption', assumption_id: 'ASM-source', semantic_gap_ids: ['GAP-source'], reason: '规则尚未确认', requires_case_status: 'Conditional'
  };
  assert.equal(validate(item)[0].code, 'ASSUMPTION_REQUIRES_CONDITIONAL');
  assert.deepEqual(validate(item, { ...context(), semantic_status: 'Conditional' }), []);
  assert.equal(validate(item, { ...context(), semantic_status: 'Conditional', semantic_gap_ids: [] })[0].code, 'ASSUMPTION_GAP_UNRESOLVED');
  const state = context(); state.claims[0].supported = false;
  assert.equal(validate(candidate(), state)[0].code, 'VALUE_EVIDENCE_UNRESOLVED');
});

test('v4 business subject can contain a steps field without being mistaken for Case prose', () => {
  const item = candidate(); const state = context();
  item.test_values[0].subject_ref = 'admin.workflow'; item.test_values[0].field_path = '/steps/0/action';
  state.claims[0].subject_ref = 'admin.workflow'; state.claims[0].field_path = '/steps/0/action';
  assert.deepEqual(validate(item, state), []);
});
