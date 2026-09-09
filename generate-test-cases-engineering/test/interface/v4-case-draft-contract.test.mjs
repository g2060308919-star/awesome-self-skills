import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateCaseSemanticsV4 } from '../../src/case-semantics-v4.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const caseDraftSchema = JSON.parse(await readFile(new URL(
  '../../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json', import.meta.url
), 'utf8'));

/** @returns {any} */
function logicalCase() {
  return {
    case_id: 'CASE-source-22', title: '来源为打车去过时展示对应文案', module_id: 'admin',
    priority: 'P0', ordering: { business_flow_ref: 'FLOW-review-list', page_action_ref: 'ACTION-view-review-row' },
    acceptance_role: 'primary_acceptance', fact_ids: ['FACT-source-22'],
    primary_test_point_id: 'TP-source-label-22', supporting_observation_ids: ['OBS-response-source-22'],
    business_preconditions: [{ precondition_id: 'PRE-view', description: '操作者拥有评价列表查看权限' }],
    data_conditions: [{ condition_id: 'COND-source-22', description: '存在 source=22 的评价记录' }],
    steps: [{ step_id: 'STEP-open', action: '进入评价中台列表' }, { step_id: 'STEP-find', action: '定位该评价记录' }],
    oracles: [{ oracle_id: 'ORACLE-label', observe_after_step_id: 'STEP-find', surface: 'ui',
      expected: '来源列展示“打车去过”', claim_ids: ['CLM-source-enum'] }],
    test_values: [{ value_id: 'VAL-source-22', subject_ref: 'admin.review', field_path: '/response/source', value: 22,
      used_by_refs: ['COND-source-22', 'ORACLE-label'], value_origin: { kind: 'requirement', claim_ids: ['CLM-source-enum'] } }]
  };
}

/** @param {any} value */
function errors(value) { return validateAgainstSchema(value, caseDraftSchema); }

test('v4 Case Draft admits only the closed logical CaseSpec and retains the v3 branch', () => {
  const artifact = { schema_version: '4.0.0', source_revision: 4, cases: [logicalCase()] };
  assert.deepEqual(errors(artifact), []);
  for (const forbidden of ['testability_profile', 'post_state', 'cleanup', 'execution_effects', 'runner_case_ids', 'depends_on_case_ids']) {
    const candidate = structuredClone(artifact);
    if (forbidden === 'depends_on_case_ids') candidate.cases[0].ordering[forbidden] = [];
    else candidate.cases[0][forbidden] = forbidden === 'post_state' ? [] : {};
    assert.notDeepEqual(errors(candidate), [], forbidden);
  }
  assert.notDeepEqual(errors({ ...artifact, unexpected: true }), []);
  assert.notDeepEqual(errors({ schema_version: '3.0.0', source_revision: 4, cases: [logicalCase()] }), []);
});

test('v4 Case Draft closes baseline, effect, value-origin and step-oracle unions', () => {
  const artifact = { schema_version: '4.0.0', source_revision: 4, cases: [logicalCase()] };
  artifact.cases[0].baseline_spec = {
    baseline_id: 'BASELINE-existing-filters', kind: 'declared_reference', acquisition: 'capture_at_execution',
    reference: '当前线上评价中台', claim_ids: ['CLM-baseline'],
    comparison_contract: { kind: 'all_observable_behavior_except', exceptions: ['新增业务线筛选项'] }
  };
  artifact.cases[0].semantic_effects = [{ effect_id: 'EFFECT-status', kind: 'state_change', subject: '评价状态',
    before: '待审核', after: '已通过', claim_ids: ['CLM-transition'] }];
  assert.deepEqual(errors(artifact), []);
  const dangling = structuredClone(artifact);
  dangling.cases[0].oracles[0].observe_after_step_id = 'STEP-missing';
  assert.notDeepEqual(validateCaseSemanticsV4(dangling.cases[0]), []);
  const crossBranch = structuredClone(artifact);
  crossBranch.cases[0].test_values[0].value_origin.replaceable = true;
  assert.notDeepEqual(errors(crossBranch), []);
  const inventedDimensions = structuredClone(artifact);
  inventedDimensions.cases[0].baseline_spec.comparison_contract.dimensions = ['名称', '顺序'];
  assert.notDeepEqual(errors(inventedDimensions), []);
});
