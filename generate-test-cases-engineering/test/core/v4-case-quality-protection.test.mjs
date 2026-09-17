import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSemanticCaseDocumentV4 } from '../../src/case-semantics-v4.mjs';
import { compileCaseDocument } from '../../src/execution-plan.mjs';
import { compileBusinessOutcomesV4 } from '../../src/obligations/business-outcomes-v4.mjs';
import { GENERAL_QUALITY_V4_CONTRACT } from '../../src/v4-contract.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

test('AT10-AT13 one-result single-point Cases remain alongside a same-object complete flow', () => {
  const fixture = v4GeneralQualityFixture();
  const single = fixture.artifacts.case_drafts.cases[0];
  const flow = structuredClone(single);
  flow.case_id = 'CASE-flow-placeholder';
  flow.title = '同一订单从创建到提交后进入已接受状态';
  flow.data_conditions = [{
    condition_id: 'DATA-same-order', description: '后续步骤持续使用本用例创建的同一订单'
  }];
  flow.steps = [
    { step_id: 'STEP-create-order', action: '创建订单并保存' },
    { step_id: 'STEP-submit-order', action: '提交本用例创建的同一订单' }
  ];
  flow.oracles = [
    {
      oracle_id: 'ORACLE-created', observe_after_step_id: 'STEP-create-order', surface: 'ui',
      expected: '同一订单保存成功', claim_ids: [...single.oracles[0].claim_ids]
    },
    {
      oracle_id: 'ORACLE-accepted', observe_after_step_id: 'STEP-submit-order', surface: 'ui',
      expected: '同一订单最终显示为已接受', claim_ids: [...single.oracles[0].claim_ids]
    }
  ];
  const result = compileSemanticCaseDocumentV4({
    source_revision: 0,
    case_drafts: [single, flow],
    formal_test_points: [{
      formal_test_point_id: single.primary_test_point_id,
      outcome_id: 'OUT-order-accepted', acceptance_role: 'primary_acceptance'
    }],
    claim_assessments: fixture.system.claim_assessments
  }, GENERAL_QUALITY_V4_CONTRACT);

  assert.equal(result.cases.length, 2);
  assert.equal(new Set(result.cases.map((/** @type {any} */ item) => item.case_id)).size, 2);
  assert.deepEqual(result.cases.map((/** @type {any} */ item) => item.primary_test_point_id), [
    single.primary_test_point_id, single.primary_test_point_id
  ]);
  assert.equal(result.cases.find((/** @type {any} */ item) => item.steps.length === 2).steps[0].action, '创建订单并保存');
  assert.ok(result.cases.every((/** @type {any} */ item) => Object.hasOwn(item, 'primary_test_point_id')));
});

test('AT14 explicit enumeration values compile to distinct formal results without representative loss', () => {
  const element = {
    element_id: 'EL-order-state', kind: 'input_domain', fact_id: 'FACT-order-state',
    business_outcome: '订单状态展示对应结果',
    partitions: [
      { kind: 'enum', value: 'created', expected: '显示已创建' },
      { kind: 'enum', value: 'accepted', expected: '显示已接受' },
      { kind: 'enum', value: 'rejected', expected: '显示已拒绝' }
    ],
    evidence_bindings: [
      { field_path: '/business_outcome', claim_ids: ['CLM-order-state'] },
      ...[0, 1, 2].flatMap((index) => ['value', 'expected'].map((field) => ({
        field_path: `/partitions/${index}/${field}`, claim_ids: ['CLM-order-state']
      })))
    ]
  };
  const artifact = {
    schema_version: '4.2.0', source_revision: 0,
    views: [{
      view_id: 'VIEW-order-state', module_id: 'orders', type: 'input-domain', scope: 'orders',
      source_claim_ids: ['CLM-order-state'], elements: [element], relations: []
    }],
    interaction_matrix: [], interaction_candidates: [],
    obligation_inputs: {
      view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: []
    }
  };
  const evidence = {
    facts: [{
      fact_id: element.fact_id, module_id: 'orders',
      acceptance_role: 'primary_acceptance', condition_field: 'state'
    }],
    claims: [{
      claim_id: 'CLM-order-state', level: 'E3', supported: true,
      assertions: element.evidence_bindings.map((binding) => ({
        fact_id: element.fact_id, field_path: binding.field_path,
        value: binding.field_path === '/business_outcome'
          ? element.business_outcome
          : binding.field_path.includes('/0/')
            ? element.partitions[0][binding.field_path.endsWith('/value') ? 'value' : 'expected']
            : binding.field_path.includes('/1/')
              ? element.partitions[1][binding.field_path.endsWith('/value') ? 'value' : 'expected']
              : element.partitions[2][binding.field_path.endsWith('/value') ? 'value' : 'expected']
      }))
    }]
  };
  const result = compileBusinessOutcomesV4(artifact, evidence);
  assert.equal(result.kind, 'compiled');
  assert.deepEqual(
    result.outcomes.map((/** @type {any} */ item) => item.condition.state).sort(),
    ['accepted', 'created', 'rejected']
  );
  assert.equal(result.formal_test_points.length, 3);
});

test('AT15 Case generation is invariant to absent, unknown, or verified execution resources', () => {
  const fixture = v4GeneralQualityFixture();
  const candidate = fixture.artifacts.case_drafts.cases[0];
  const semanticInput = {
    source_revision: 0, case_drafts: [candidate],
    formal_test_points: [{
      formal_test_point_id: candidate.primary_test_point_id,
      outcome_id: 'OUT-order-accepted', acceptance_role: 'primary_acceptance'
    }],
    claim_assessments: fixture.system.claim_assessments
  };
  const results = [undefined, 'unknown', 'verified'].map((status) => compileCaseDocument({
    delivery_intent: 'case_document', semantic_input: semanticInput,
    ...(status ? { execution_resources: { environment: { status } } } : {})
  }));
  assert.deepEqual(results[1], results[0]);
  assert.deepEqual(results[2], results[0]);
  assert.equal(results[0].cases.length, 1);
});
