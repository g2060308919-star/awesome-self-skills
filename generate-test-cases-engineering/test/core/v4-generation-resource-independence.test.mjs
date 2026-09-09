import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCaseSemanticsV4 } from '../../src/case-semantics-v4.mjs';
import * as caseSemantics from '../../src/case-semantics-v4.mjs';
import { routeGapDiagnosticV4 } from '../../src/gap-kinds-v4.mjs';
import { compileCaseDocument } from '../../src/execution-plan.mjs';

/** @param {string} field @param {string} condition @param {string} expected */
function logicalCase(field = 'source', condition = '存在 source=22 的评价', expected = '来源列显示打车去过') {
  return {
    case_id: `CASE-${field}`, title: expected, module_id: 'admin', priority: 'P0',
    ordering: { business_flow_ref: null, page_action_ref: null },
    acceptance_role: 'primary_acceptance', fact_ids: [`FACT-${field}`],
    primary_test_point_id: `TP-${field}`, supporting_observation_ids: [],
    business_preconditions: [{ precondition_id: 'PRE-view', description: '操作者具有评价列表查看权限' }],
    data_conditions: [{ condition_id: 'COND-value', description: condition }],
    steps: [{ step_id: 'STEP-open', action: '打开评价列表并定位目标评价' }],
    oracles: [{ oracle_id: 'ORACLE-label', observe_after_step_id: 'STEP-open', surface: 'ui', expected, claim_ids: [`CLM-${field}`] }]
  };
}

test('v4 generation accepts logical source star-level and business-line Cases without execution resources', () => {
  const cases = [
    logicalCase(),
    logicalCase('star_level', '存在 star_level=2 的评价', '评价星级显示两颗星'),
    logicalCase('business_line', '评价属于打车业务线', '筛选结果只展示打车业务线评价')
  ];
  for (const candidate of cases) assert.deepEqual(validateCaseSemanticsV4(candidate), [], candidate.case_id);
});

test('v4 generation permits sparse logical Cases and multiple observation surfaces for one outcome', () => {
  const candidate = logicalCase();
  candidate.business_preconditions = [];
  candidate.data_conditions = [];
  candidate.oracles.push({
    oracle_id: 'ORACLE-response', observe_after_step_id: 'STEP-open', surface: 'response',
    expected: 'source 字段返回 22', claim_ids: ['CLM-source']
  });
  assert.deepEqual(validateCaseSemanticsV4(candidate), []);
});

test('v4 generation optional semantic effects require typed sourced changes, never cleanup placeholders', () => {
  const candidate = logicalCase();
  assert.deepEqual(validateCaseSemanticsV4(candidate), []);
  const effect = { effect_id: 'EFFECT-state', kind: 'state_change', subject: '评价审核状态', before: '待审核', after: '已通过', claim_ids: ['CLM-transition'] };
  assert.deepEqual(validateCaseSemanticsV4({ ...candidate, semantic_effects: [effect] }), []);
  const { before, ...withoutBefore } = effect;
  assert.deepEqual(validateCaseSemanticsV4({ ...candidate, semantic_effects: [withoutBefore] }), []);
  for (const semantic_effects of [[], ['状态变成已通过'], [{ ...effect, claim_ids: [] }], [{ ...effect, kind: 1 }], [{ ...effect, cleanup: 'reset' }]]) {
    assert.ok(validateCaseSemanticsV4({ ...candidate, semantic_effects }).length > 0);
  }
});

test('v4 generation rejects missing logical oracles, dangling steps and adapter supplied execution fields', () => {
  const candidate = logicalCase();
  const invalid = [
    { ...candidate, oracles: [] },
    { ...candidate, oracles: [{ ...candidate.oracles[0], claim_ids: [] }] },
    { ...candidate, oracles: [{ ...candidate.oracles[0], observe_after_step_id: 'STEP-missing' }] },
    { ...candidate, steps: [...candidate.steps, candidate.steps[0]] },
    { ...candidate, ordering: { ...candidate.ordering, depends_on_case_ids: ['CASE-other'] } },
    { ...candidate, testability_profile: { capabilities: [] } },
    { ...candidate, resource_readiness: 'verified' },
    { ...candidate, execution_disposition: 'execute' },
    { ...candidate, runner_projection: { case_ids: ['CASE-source'] } }
  ];
  for (const item of invalid) {
    const diagnostics = validateCaseSemanticsV4(item);
    assert.ok(diagnostics.length > 0);
    assert.ok(diagnostics.every(diagnostic => diagnostic.category === 'adapter_revision'));
  }
});

test('v4 generation fingerprint preserves all five semantic invariants across absent unknown and verified resources', () => {
  assert.equal(typeof caseSemantics.generationFingerprintV4, 'function', 'new v4 fingerprint seam is required');
  const cases = [
    { ...logicalCase(), semantic_status: 'Grounded' },
    { ...logicalCase('star_level', '存在 star_level=2 的评价', '评价星级显示两颗星'), semantic_status: 'Conditional' },
    { ...logicalCase('business_line', '评价属于打车业务线', '筛选结果只展示打车业务线评价'), semantic_status: 'Grounded' }
  ];
  const formal_test_points = cases.map(item => ({
    formal_test_point_id: item.primary_test_point_id, outcome_id: `OUT-${item.case_id}`,
    acceptance_role: item.acceptance_role
  }));
  const missing = caseSemantics.generationFingerprintV4({ cases, formal_test_points });
  for (const state of ['unknown', 'verified', 'unavailable']) {
    const execution_resources = Object.fromEntries([
      'environment_url', 'account', 'permission_proof', 'data_tool', 'observer', 'control', 'sql', 'logs', 'mock'
    ].map(kind => [kind, { status: state }]));
    assert.deepEqual(caseSemantics.generationFingerprintV4({ cases, formal_test_points, execution_resources }), missing);
  }
  assert.deepEqual(missing.case_id_set, ['CASE-business_line', 'CASE-source', 'CASE-star_level']);
  assert.deepEqual(missing.formal_test_point_id_set, ['TP-business_line', 'TP-source', 'TP-star_level']);
  assert.deepEqual(missing.semantic_classification_by_case, {
    'CASE-business_line': 'Grounded', 'CASE-source': 'Grounded', 'CASE-star_level': 'Conditional'
  });
  assert.equal(missing.formal_coverage_denominator, 3);
  assert.match(missing.semantic_bundle_digest_without_runtime_metadata, /^sha256:[a-f0-9]{64}$/);
});

test('v4 generation fingerprint is deterministic but still detects real business and classification changes', () => {
  assert.equal(typeof caseSemantics.generationFingerprintV4, 'function');
  const first = { ...logicalCase(), semantic_status: 'Grounded' };
  const second = { ...logicalCase('contract', '收到评价请求', '返回约定字段'), acceptance_role: 'dependency_contract', semantic_status: 'Grounded' };
  const points = [
    { formal_test_point_id: 'TP-source', outcome_id: 'OUT-source', acceptance_role: 'primary_acceptance' },
    { formal_test_point_id: 'TP-contract', outcome_id: 'OUT-contract', acceptance_role: 'dependency_contract' }
  ];
  const baseline = caseSemantics.generationFingerprintV4({ cases: [first, second], formal_test_points: points });
  assert.deepEqual(caseSemantics.generationFingerprintV4({ cases: [second, first], formal_test_points: [...points].reverse() }), baseline);
  assert.equal(baseline.formal_coverage_denominator, 1, 'dependency contracts are not in the primary denominator');
  const changed = { ...first, oracles: [{ ...first.oracles[0], expected: '来源列显示不同业务含义' }] };
  assert.notEqual(caseSemantics.generationFingerprintV4({ cases: [changed, second], formal_test_points: points }).semantic_bundle_digest_without_runtime_metadata,
    baseline.semantic_bundle_digest_without_runtime_metadata);
  assert.notDeepEqual(caseSemantics.generationFingerprintV4({ cases: [{ ...first, semantic_status: 'Conditional' }, second], formal_test_points: points }), baseline);
  assert.throws(() => caseSemantics.generationFingerprintV4({ cases: [first, first], formal_test_points: points }), /DUPLICATE_CASE_ID/);
  assert.throws(() => caseSemantics.generationFingerprintV4({ cases: [first], formal_test_points: [] }), /PRIMARY_TEST_POINT_UNRESOLVED/);
});

test('v4 generation fingerprint never coerces an arbitrary status object into Grounded', () => {
  assert.throws(() => caseSemantics.generationFingerprintV4({
    cases: [{ ...logicalCase(), semantic_status: { toString: () => 'Grounded' } }],
    formal_test_points: [{ formal_test_point_id: 'TP-source', outcome_id: 'OUT-source', acceptance_role: 'primary_acceptance' }]
  }), /SEMANTIC_CLASSIFICATION_INVALID/);
});

test('v4 adapter diagnostics route directly to need_revision with closed affected sets', () => {
  const diagnostics = validateCaseSemanticsV4({});
  assert.ok(diagnostics.length > 0);
  for (const diagnostic of diagnostics) {
    const routed = routeGapDiagnosticV4(diagnostic, { delivery_intent: 'case_document' });
    assert.equal(routed.status, 'need_revision');
    assert.deepEqual(routed.affected_fact_ids, []);
    assert.deepEqual(routed.affected_test_point_ids, []);
  }
});

test('v4 semantic fingerprint canonicalizes reference sets but preserves ordered business steps', () => {
  const candidate = { ...logicalCase(), semantic_status: 'Grounded',
    fact_ids: ['FACT-source', 'FACT-label'], supporting_observation_ids: ['OBS-ui', 'OBS-response'],
    oracles: [{ ...logicalCase().oracles[0], claim_ids: ['CLM-source', 'CLM-label'] }] };
  const points = [{ formal_test_point_id: 'TP-source', outcome_id: 'OUT-source', acceptance_role: 'primary_acceptance' }];
  const baseline = caseSemantics.generationFingerprintV4({ cases: [candidate], formal_test_points: points });
  const reordered = structuredClone(candidate);
  reordered.fact_ids.reverse(); reordered.supporting_observation_ids.reverse(); reordered.oracles[0].claim_ids.reverse();
  assert.deepEqual(caseSemantics.generationFingerprintV4({ cases: [reordered], formal_test_points: points }), baseline);
  const reversedSteps = structuredClone(candidate);
  reversedSteps.steps = [
    { step_id: 'STEP-open', action: '先执行第一步' },
    { step_id: 'STEP-b', action: '再执行第二步' }
  ];
  const ordered = caseSemantics.generationFingerprintV4({ cases: [reversedSteps], formal_test_points: points });
  reversedSteps.steps.reverse();
  assert.notEqual(caseSemantics.generationFingerprintV4({ cases: [reversedSteps], formal_test_points: points }).semantic_bundle_digest_without_runtime_metadata,
    ordered.semantic_bundle_digest_without_runtime_metadata);
});

test('production Case Document compilation derives IDs and status before ignoring all execution metadata', () => {
  const semantic_input = {
    source_revision: 4,
    case_drafts: [logicalCase(), logicalCase('star_level', '存在 star_level=2 的评价', '评价星级显示两颗星')],
    formal_test_points: [
      { formal_test_point_id: 'TP-source', outcome_id: 'OUT-source', acceptance_role: 'primary_acceptance' },
      { formal_test_point_id: 'TP-star_level', outcome_id: 'OUT-star', acceptance_role: 'primary_acceptance' }
    ],
    claim_assessments: [
      { claim_id: 'CLM-source', domain: 'business_semantics', level: 'E3', support_review: 'supported' },
      { claim_id: 'CLM-star_level', domain: 'business_semantics', level: 'E1', support_review: 'supported' }
    ]
  };
  const outputs = [undefined, 'unknown', 'verified'].map(resource_status => compileCaseDocument({
    delivery_intent: 'case_document', semantic_input,
    ...(resource_status ? { execution_resources: { environment: { status: resource_status } } } : {})
  }));
  assert.deepEqual(outputs[1], outputs[0]);
  assert.deepEqual(outputs[2], outputs[0]);
  assert.deepEqual(outputs[0].cases.map((/** @type {any} */ item) => item.semantic_status), ['Grounded', 'Conditional']);
  assert.ok(outputs[0].cases.every((/** @type {any} */ item) => /^CASE-[a-f0-9]{64}$/.test(item.case_id)));
  assert.ok(outputs[0].cases.every((/** @type {any} */ item) => !['CASE-source', 'CASE-star_level'].includes(item.case_id)));
});
