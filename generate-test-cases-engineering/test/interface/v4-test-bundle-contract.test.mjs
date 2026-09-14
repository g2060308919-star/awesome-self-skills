import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { evaluateJourney } from '../helpers/run-journey.mjs';

const schema = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json', import.meta.url), 'utf8'));
/** @returns {Record<string, unknown>} */
const minimalDocument = () => ({
  schema_version: '4.0.0',
  compiler_version: '0.5.0',
  delivery_intent: 'case_document',
  source_revision: 0,
  result_kind: 'delivered_cases',
  ordered_case_ids: [],
  scope_manifest: {
    primary_surface: 'admin',
    modules: [{ module_id: 'admin', name: '评价中台', role: 'primary', claim_ids: ['CLM-admin'] }],
    boundaries: []
  },
  cases: [],
  coverage: {
    primary: { reviewed_formal_test_point_count: 0, covered_formal_test_point_count: 0, not_applicable_formal_test_point_count: 0 },
    boundary: { reviewed_formal_test_point_count: 0, covered_formal_test_point_count: 0, not_applicable_formal_test_point_count: 0 },
    semantic_gap_count: 0, exploratory_count: 0, not_applicable_count: 0
  },
  semantic_root_groups: [], exploratory: [], not_applicable: [], risk_review_ledger: []
});

/** @returns {Record<string, unknown>} */
const canonicalCase = () => ({
  case_id: 'CASE-source-22', title: '来源为打车去过时展示对应文案', module_id: 'admin',
  priority: 'P0', ordering: { business_flow_ref: 'FLOW-review-list', page_action_ref: 'ACTION-view-review-row', depends_on_case_ids: [] },
  acceptance_role: 'primary_acceptance', fact_ids: ['FACT-source-22'], semantic_status: 'Grounded',
  primary_test_point_id: 'TP-source-label-22', supporting_observation_ids: ['OBS-response-source-22'],
  business_preconditions: [{ precondition_id: 'PRE-view', description: '操作者拥有评价列表查看权限' }],
  data_conditions: [{ condition_id: 'COND-source-22', description: '存在 source=22 的评价记录' }],
  steps: [{ step_id: 'STEP-open', action: '进入评价中台列表' }, { step_id: 'STEP-find', action: '定位该评价记录' }],
  oracles: [{ oracle_id: 'ORACLE-label', observe_after_step_id: 'STEP-find', surface: 'ui',
    expected: '来源列展示“打车去过”', claim_ids: ['CLM-source-enum'] }],
  test_values: [{ value_id: 'VAL-source-22', subject_ref: 'admin.review', field_path: '/response/source', value: 22,
    used_by_refs: ['COND-source-22', 'ORACLE-label'], value_origin: { kind: 'requirement', claim_ids: ['CLM-source-enum'] } }]
});

test('v4 Case Document has a closed intent envelope without execution prerequisites', () => {
  assert.deepEqual(validateAgainstSchema(minimalDocument(), schema), []);
});

test('v4 bundle rejects absent or mismatched envelope identity', () => {
  for (const field of ['schema_version', 'compiler_version', 'delivery_intent', 'source_revision', 'result_kind',
    'ordered_case_ids', 'scope_manifest', 'cases', 'coverage', 'semantic_root_groups', 'exploratory',
    'not_applicable', 'risk_review_ledger']) {
    const missing = minimalDocument();
    delete missing[field];
    assert.notDeepEqual(validateAgainstSchema(missing, schema), [], field);
  }
  for (const [field, value] of /** @type {Array<[string, unknown]>} */ ([
    ['schema_version', '3.0.0'], ['compiler_version', '0.4.0'],
    ['delivery_intent', 'execution_plan'], ['delivery_intent', 'unknown'],
    ['source_revision', -1], ['source_revision', 0.5], ['cases', {}]
  ])) assert.notDeepEqual(validateAgainstSchema({ ...minimalDocument(), [field]: value }, schema), [], field);
});

test('v4 Case Document cannot acquire execution state through extra fields', () => {
  for (const [field, value] of /** @type {Array<[string, unknown]>} */ ([
    ['execution_plan', {}], ['runner_case_ids', []], ['runner_projection', { case_ids: [] }],
    ['runner_ready', false], ['resource_readiness', 'unknown'], ['readiness', {}],
    ['execution_disposition', 'pending'], ['case_document_ref', {}], ['unrecognized', true]
  ])) assert.notDeepEqual(validateAgainstSchema({ ...minimalDocument(), [field]: value }, schema), [], field);
});

test('T02 envelope does not admit an unvalidated nonempty CaseSpec', () => {
  assert.notDeepEqual(validateAgainstSchema({ ...minimalDocument(), cases: [{}] }, schema), []);
});

test('v4 Case Document admits a complete canonical logical Case and closes compiler fields', () => {
  assert.deepEqual(validateAgainstSchema({ ...minimalDocument(), ordered_case_ids: ['CASE-source-22'], cases: [canonicalCase()] }, schema), []);
  for (const mutate of [
    (/** @type {any} */ item) => { item.semantic_status = 'Blocked'; },
    (/** @type {any} */ item) => { item.execution_disposition = 'execute'; },
    (/** @type {any} */ item) => { item.ordering.rank = 1; },
    (/** @type {any} */ item) => { item.oracles[0].claim_ids = []; }
  ]) {
    const item = canonicalCase(); mutate(item);
    assert.notDeepEqual(validateAgainstSchema({ ...minimalDocument(), ordered_case_ids: ['CASE-source-22'], cases: [item] }, schema), []);
  }
});

test('v4 canonical bundle closes scope, coverage, root, exclusion and risk-ledger records', () => {
  const base = /** @type {any} */ (minimalDocument());
  for (const [field, value] of /** @type {Array<[string, unknown]>} */ ([
    ['scope_manifest', { ...base.scope_manifest, extra: true }],
    ['coverage', { ...base.coverage, total: 0 }],
    ['semantic_root_groups', [{ root_issue_id: 'ROOT-a' }]],
    ['exploratory', [{ exploratory_id: 'EXP-a', module_id: 'admin', title: '超长内容', reason: '检查布局', extra: true }]],
    ['not_applicable', [{ not_applicable_record_id: 'NA-a', module_id: 'admin', subject: '自动刷新', reason: '范围排除', basis: {} }]],
    ['risk_review_ledger', [{ module_id: 'admin', risk_kind: 'refresh', acceptance_role: 'primary_acceptance', status: 'exploratory', review_basis: { kind: 'evidence', claim_ids: ['CLM-a'] }, exploratory_ids: ['EXP-a'] }]]
  ])) assert.notDeepEqual(validateAgainstSchema({ ...base, [field]: value }, schema), [], field);

  const risk = {
    module_id: 'admin', risk_kind: 'refresh', acceptance_role: 'primary_acceptance', status: 'exploratory',
    review_basis: { kind: 'risk_catalog', policy_id: 'risk.refresh', policy_version: '1' }, exploratory_ids: ['EXP-a']
  };
  assert.deepEqual(validateAgainstSchema({ ...base, risk_review_ledger: [risk] }, schema), []);
});

test('v3 historical bundle goldens retain their complete legacy contract', async () => {
  const directory = new URL('../golden/journeys/', import.meta.url);
  const files = (await readdir(directory)).filter((/** @type {string} */ name) => name.endsWith('.json'));
  assert.ok(files.length >= 10);
  for (const name of files) {
    const legacy = JSON.parse(await readFile(new URL(name, directory), 'utf8'));
    assert.deepEqual(validateAgainstSchema(legacy, schema), [], name);
    assert.notDeepEqual(validateAgainstSchema({ ...legacy, delivery_intent: 'case_document' }, schema), [], name);
    const incomplete = structuredClone(legacy);
    delete incomplete.execution_plan;
    assert.notDeepEqual(validateAgainstSchema(incomplete, schema), [], name);
  }
});

test('v3 coverage intermediate validation still produces the reviewed legacy bundle', async () => {
  const expected = JSON.parse(await readFile(new URL('../golden/journeys/all-e3.json', import.meta.url), 'utf8'));
  const result = await evaluateJourney('all-e3');
  assert.equal(result.status, 'finished', JSON.stringify(result));
  assert.deepEqual(result.bundle, expected);
});
