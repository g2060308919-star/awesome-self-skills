import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSemanticCaseDocumentV4 } from '../../src/case-semantics-v4.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { CANDIDATE_V4_CONTRACT } from '../../src/v4-contract.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';

test('D2 candidate contract propagates through the unchanged four semantic inputs and canonical bundle', () => {
  const fixture = v4PipelineFixture();
  for (const artifact of Object.values(fixture.artifacts)) artifact.schema_version = '4.2.0';
  const result = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(result.status, 'compiled', JSON.stringify(result));
  assert.equal(result.bundle.schema_version, '4.2.0');
  assert.equal(result.bundle.compiler_version, '0.7.0');
  assert.equal(result.obligations.schema_version, '4.2.0');
});

test('A07/A08/A14/A18 compiler preserves independent results and a same-object multi-step scenario as ordinary Cases', () => {
  const fixture = v4PipelineFixture();
  const original = fixture.artifacts.case_drafts.cases[0];
  const second = structuredClone(original);
  second.case_id = 'CASE-second-placeholder';
  second.primary_test_point_id = 'TP-second';
  second.title = '拒绝不符合要求的订单';
  second.steps = [{ step_id: 'STEP-reject', action: '提交不符合要求的订单' }];
  second.oracles = [{
    oracle_id: 'ORACLE-reject', observe_after_step_id: 'STEP-reject', surface: 'ui',
    expected: '订单显示为已拒绝', claim_ids: [...original.oracles[0].claim_ids]
  }];
  const flow = structuredClone(original);
  flow.case_id = 'CASE-flow-placeholder';
  flow.title = '本用例新建的订单从创建进入已接受状态';
  flow.ordering.business_flow_ref = 'FLOW-order';
  flow.data_conditions = [{ condition_id: 'DATA-same', description: '后续步骤使用本用例新建的同一订单' }];
  flow.steps = [
    { step_id: 'STEP-create', action: '新建订单并保存' },
    { step_id: 'STEP-submit-flow', action: '提交本用例新建的同一订单' }
  ];
  flow.oracles = [
    { oracle_id: 'ORACLE-created', observe_after_step_id: 'STEP-create', surface: 'ui', expected: '同一订单保存成功', claim_ids: [...original.oracles[0].claim_ids] },
    { oracle_id: 'ORACLE-accepted', observe_after_step_id: 'STEP-submit-flow', surface: 'ui', expected: '同一订单显示为已接受', claim_ids: [...original.oracles[0].claim_ids] }
  ];

  const result = compileSemanticCaseDocumentV4({
    source_revision: 0,
    case_drafts: [original, second, flow],
    formal_test_points: [
      { formal_test_point_id: original.primary_test_point_id, outcome_id: 'OUT-accepted', acceptance_role: 'primary_acceptance' },
      { formal_test_point_id: 'TP-second', outcome_id: 'OUT-rejected', acceptance_role: 'primary_acceptance' }
    ],
    claim_assessments: fixture.system.claim_assessments
  }, CANDIDATE_V4_CONTRACT);

  assert.equal(result.cases.length, 3);
  assert.equal(new Set(result.cases.map((/** @type {any} */ item) => item.case_id)).size, 3);
  assert.deepEqual(result.cases.map((/** @type {any} */ item) => item.primary_test_point_id), [
    original.primary_test_point_id, 'TP-second', original.primary_test_point_id
  ]);
  assert.equal(result.cases[2].steps.length, 2);
  assert.equal(Object.hasOwn(result.cases[2], 'flow_case'), false);
});
