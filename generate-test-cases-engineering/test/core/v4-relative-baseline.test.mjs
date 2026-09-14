import assert from 'node:assert/strict';
import test from 'node:test';
import * as semantics from '../../src/case-semantics-v4.mjs';

function baseline() {
  return {
    baseline_id: 'BASELINE-existing-filters', kind: 'declared_reference', acquisition: 'capture_at_execution',
    reference: '当前线上评价中台',
    comparison_contract: { kind: 'all_observable_behavior_except', exceptions: ['新增业务线筛选项'] },
    claim_ids: ['CLM-existing-filters']
  };
}
function caseContext() {
  return {
    module_id: 'admin', scope_ref: 'admin.filters', business_scope: '评价列表的既有筛选项',
    operation: '查看并使用评价列表筛选项', priority: 'P1',
    ordering: { business_flow_ref: null, page_action_ref: null },
    acceptance_role: 'primary_acceptance', fact_ids: ['FACT-existing-filters'],
    primary_test_point_id: 'TP-existing-filters',
    business_preconditions: [{ precondition_id: 'PRE-read', description: '操作者有评价列表查看权限' }],
    data_conditions: [{ condition_id: 'COND-reviews', description: '同一组评价满足各筛选项的业务条件' }]
  };
}
function support() {
  return { claim_assessments: [{ claim_id: 'CLM-existing-filters', level: 'E3', scope: 'admin.filters', support_review: 'supported' }] };
}
function logicalCase() {
  const { scope_ref, business_scope, operation, ...context } = caseContext();
  return {
    ...context, case_id: 'CASE-existing-filters', title: '除业务线外其他筛选项保持线上一致',
    supporting_observation_ids: [], baseline_spec: baseline(),
    steps: [{ step_id: 'STEP-compare', action: '执行时采集线上，执行待测版本并比较允许差异之外的全部可观察行为' }],
    oracles: [{ oracle_id: 'ORACLE-compare', observe_after_step_id: 'STEP-compare', surface: 'ui',
      expected: '只允许新增业务线筛选项的差异', claim_ids: ['CLM-existing-filters'] }]
  };
}

test('v4 relative baseline accepts capture-at-execution without URL snapshot or frozen version', () => {
  assert.deepEqual(semantics.validateCaseSemanticsV4(logicalCase()), []);
});

test('v4 relative baseline selected dimensions are a separate closed contract', () => {
  const candidate = logicalCase();
  const baseline_spec = { ...baseline(), comparison_contract: {
    kind: 'selected_dimensions', dimensions: ['名称', '顺序'], allowed_differences: ['新增业务线筛选项']
  } };
  assert.deepEqual(semantics.validateCaseSemanticsV4({ ...candidate, baseline_spec }), []);
  const invalid = [
    { ...baseline_spec, comparison_contract: { ...baseline_spec.comparison_contract, exceptions: [] } },
    { ...baseline(), comparison_contract: { ...baseline().comparison_contract, dimensions: ['名称', '顺序'] } },
    { ...baseline(), comparison_contract: { kind: 'selected_dimensions', dimensions: [], allowed_differences: [] } },
    { ...baseline(), comparison_contract: { kind: 'selected_dimensions', dimensions: ['名称'] } },
    { ...baseline(), comparison_contract: { kind: 'all_observable_behavior_except' } },
    { ...baseline(), comparison_contract: { kind: 'all_observable_behavior_except', exceptions: null } },
    { ...baseline(), acquisition: 'capture_now' }, { ...baseline(), claim_ids: [] },
    { ...baseline(), resource_locator: 'https://production.example.test' }, { ...baseline(), frozen_version: 'v1' }
  ];
  for (const item of invalid) assert.ok(semantics.validateCaseSemanticsV4({ ...candidate, baseline_spec: item }).length > 0);
});

test('v4 relative baseline compiles one Grounded atomic Case with all four comparison steps', () => {
  assert.equal(typeof semantics.compileRelativeBaselineCaseV4, 'function');
  const result = semantics.compileRelativeBaselineCaseV4({ case_context: caseContext(), baseline_spec: baseline() }, support());
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.semantic_gaps, []);
  assert.equal(result.cases.length, 1);
  const { semantic_status, ...candidate } = result.cases[0];
  assert.equal(semantic_status, 'Grounded');
  assert.equal(candidate.primary_test_point_id, 'TP-existing-filters');
  assert.deepEqual(candidate.baseline_spec.comparison_contract, { kind: 'all_observable_behavior_except', exceptions: ['新增业务线筛选项'] });
  assert.equal(candidate.steps.length, 4);
  assert.match(candidate.steps[0].action, /执行时.*记录.*当前线上/);
  assert.match(candidate.steps[1].action, /待测版本.*相同操作/);
  assert.match(candidate.steps[2].action, /全部可观察行为/);
  assert.match(candidate.steps[3].action, /只允许.*新增业务线筛选项/);
  assert.match(candidate.oracles[0].expected, /新增业务线筛选项/);
  assert.equal(candidate.oracles[0].observe_after_step_id, candidate.steps[3].step_id);
  assert.deepEqual(semantics.validateCaseSemanticsV4(candidate), []);
});

test('v4 relative baseline resources never change generated ID count classification or semantic digest', () => {
  assert.equal(typeof semantics.compileRelativeBaselineCaseV4, 'function');
  const request = { case_context: caseContext(), baseline_spec: baseline() };
  const initial = semantics.compileRelativeBaselineCaseV4(request, support());
  for (const execution_resources of [{}, { environment_url: null, frozen_version: null }, {
    environment_url: 'https://production.example.test', frozen_version: '2026-09-09', screenshot: '/tmp/capture.png', account: 'operator'
  }]) assert.deepEqual(semantics.compileRelativeBaselineCaseV4(request, { ...support(), execution_resources }), initial);
  const points = [{ formal_test_point_id: 'TP-existing-filters', outcome_id: 'OUT-existing-filters', acceptance_role: 'primary_acceptance' }];
  const fingerprint = semantics.generationFingerprintV4({ cases: initial.cases, formal_test_points: points });
  assert.equal(fingerprint.semantic_classification_by_case[initial.cases[0].case_id], 'Grounded');
  assert.equal(fingerprint.case_id_set.length, 1);
});

test('v4 relative baseline never invents selected dimensions for an all-observable declaration', () => {
  assert.equal(typeof semantics.compileRelativeBaselineCaseV4, 'function');
  const all = semantics.compileRelativeBaselineCaseV4({ case_context: caseContext(), baseline_spec: baseline() }, support());
  assert.equal(Object.hasOwn(all.cases[0].baseline_spec.comparison_contract, 'dimensions'), false);
  assert.doesNotMatch(all.cases[0].steps[2].action, /名称|顺序|默认值/);
  const selected = semantics.compileRelativeBaselineCaseV4({ case_context: caseContext(), baseline_spec: {
    ...baseline(), comparison_contract: { kind: 'selected_dimensions', dimensions: ['名称', '顺序'], allowed_differences: [] }
  } }, support());
  assert.deepEqual(selected.semantic_gaps, []);
  assert.deepEqual(selected.cases[0].baseline_spec.comparison_contract.dimensions, ['名称', '顺序']);
  assert.match(selected.cases[0].steps[2].action, /名称.*顺序/);
  assert.doesNotMatch(selected.cases[0].steps[2].action, /默认值|全部可观察行为/);
});

test('v4 relative baseline semantic gaps are limited to explicitly unresolved contract business fields', () => {
  assert.equal(typeof semantics.compileRelativeBaselineCaseV4, 'function');
  const rows = [
    [{ case_context: { ...caseContext(), business_scope: null }, baseline_spec: baseline() }, 'BASELINE_SCOPE_UNRESOLVED'],
    [{ case_context: caseContext(), baseline_spec: { ...baseline(), comparison_contract: { kind: null } } }, 'BASELINE_CONTRACT_UNRESOLVED'],
    [{ case_context: caseContext(), baseline_spec: { ...baseline(), comparison_contract: { kind: 'all_observable_behavior_except', exceptions: null } } }, 'BASELINE_EXCEPTIONS_UNRESOLVED'],
    [{ case_context: caseContext(), baseline_spec: { ...baseline(), comparison_contract: { kind: 'selected_dimensions', dimensions: [], allowed_differences: [] } } }, 'BASELINE_DIMENSIONS_UNRESOLVED'],
    [{ case_context: caseContext(), baseline_spec: { ...baseline(), comparison_contract: { kind: 'selected_dimensions', dimensions: ['名称'], allowed_differences: null } } }, 'BASELINE_ALLOWED_DIFFERENCES_UNRESOLVED']
  ];
  for (const [request, code] of rows) {
    const result = semantics.compileRelativeBaselineCaseV4(request, support());
    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.cases.length, 0);
    assert.equal(result.semantic_gaps.length, 1);
    assert.equal(result.semantic_gaps[0].category, 'semantic_gap');
    assert.equal(result.semantic_gaps[0].code, code);
  }
});

test('v4 relative baseline malformed declarations and missing evidence are not business questions', () => {
  assert.equal(typeof semantics.compileRelativeBaselineCaseV4, 'function');
  const request = { case_context: caseContext(), baseline_spec: baseline() };
  for (const baseline_spec of [{ ...baseline(), claim_ids: [] }, { ...baseline(), unexpected: true }, {
    ...baseline(), comparison_contract: { kind: 'all_observable_behavior_except' }
  }]) {
    const result = semantics.compileRelativeBaselineCaseV4({ ...request, baseline_spec }, support());
    assert.deepEqual(result.semantic_gaps, []);
    assert.equal(result.cases.length, 0);
    assert.ok(result.diagnostics.every(item => item.category === 'adapter_revision'));
    assert.ok(result.diagnostics.length > 0);
  }
  for (const assessment of [null, { ...support().claim_assessments[0], scope: 'other.module' }, {
    ...support().claim_assessments[0], support_review: 'unsupported'
  }]) {
    const result = semantics.compileRelativeBaselineCaseV4(request, { claim_assessments: assessment ? [assessment] : [] });
    assert.deepEqual(result.semantic_gaps, []);
    assert.equal(result.cases.length, 0);
    assert.ok(result.diagnostics.some(item => item.category === 'quality_failure'));
  }
});

test('v4 relative baseline E1 remains Conditional and never becomes Grounded through verified resources', () => {
  assert.equal(typeof semantics.compileRelativeBaselineCaseV4, 'function');
  const result = semantics.compileRelativeBaselineCaseV4({ case_context: caseContext(), baseline_spec: baseline() }, {
    claim_assessments: [{ ...support().claim_assessments[0], level: 'E1' }],
    execution_resources: { status: 'verified' }
  });
  assert.equal(result.cases[0].semantic_status, 'Conditional');
});
