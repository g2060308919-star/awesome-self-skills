import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileIndependentReviewTargetV4,
  validateIndependentReviewV4
} from '../../src/independent-review-v4.mjs';

function input() {
  return {
    source_revision: 7,
    source_first_targets: [{
      target_kind: 'business_result', acceptance_role: 'primary_acceptance',
      objective: '有效提交后订单进入已接受状态', source_claim_ids: ['CLM-accept'], decision_ids: []
    }],
    facts: [{ fact_id: 'FACT-accept', statement: '有效提交后订单进入已接受状态', claim_ids: ['CLM-accept'] }],
    views: [{
      view_id: 'VIEW-state', module_id: 'checkout', type: 'state', scope: 'checkout',
      source_claim_ids: ['CLM-accept'], elements: [{ element_id: 'EL-accept', business_outcome: '订单已接受' }],
      relations: []
    }],
    formal_test_points: [{ formal_test_point_id: 'TP-accept', outcome_id: 'OUT-accept' }],
    candidate_responsibilities: [{
      candidate_id: 'CAND-accept', rule_group_id: 'GROUP-state', responsibility: '验证订单接受结果',
      source_claim_ids: ['CLM-accept']
    }],
    cases: [{
      case_id: 'CASE-accept', title: '提交有效订单', primary_test_point_id: 'TP-accept',
      business_preconditions: [{ precondition_id: 'PRE-role', description: '用户具有提交权限' }],
      data_conditions: [{ condition_id: 'DATA-valid', description: '订单数据有效' }],
      steps: [{ step_id: 'STEP-submit', action: '提交订单' }],
      oracles: [{
        oracle_id: 'ORACLE-accepted', observe_after_step_id: 'STEP-submit', surface: 'ui',
        expected: '订单显示为已接受', claim_ids: ['CLM-accept']
      }],
      independent_review: { ignored: 'review record must not enter its own target' }
    }]
  };
}

/** @param {ReturnType<typeof compileIndependentReviewTargetV4>} target @returns {any} */
function completedReview(target) {
  const targetId = target.projection.source_first_targets[0].target_id;
  const caseId = target.projection.cases[0].case_id;
  return {
    protocol_version: '1.0.0', status: 'completed', review_mode: 'independent_source_first',
    reviewer_identity: {
      identity_class: 'independent_context', separation_basis: '先形成来源目标，后读取生成投影。'
    },
    source_first_targets: structuredClone(target.projection.source_first_targets),
    review_target_digest: target.digest,
    target_assessments: [{
      target_id: targetId, disposition: 'verified',
      affected_items: [
        { item_kind: 'formal_test_point', item_id: 'TP-accept' },
        { item_kind: 'case', item_id: caseId }
      ],
      source_claim_ids: ['CLM-accept'], decision_ids: [],
      rationale: 'Case 以可判定 Oracle 验证该来源目标。',
      required_recheck: { status: 'passed', affected_items: [{ item_kind: 'case', item_id: caseId }] }
    }],
    findings: []
  };
}

test('AT23: target projection covers sources, models, responsibilities and executable Case content', () => {
  const target = compileIndependentReviewTargetV4(input());
  assert.match(target.digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(target.projection.projection_version, '1.0.0');
  assert.deepEqual(Object.keys(target.projection).sort(), [
    'candidate_responsibilities', 'cases', 'facts', 'formal_test_points', 'projection_version',
    'source_first_targets', 'source_revision', 'views'
  ]);
  assert.deepEqual(Object.keys(target.projection.cases[0]).sort(), [
    'business_preconditions', 'case_id', 'data_conditions', 'oracles',
    'primary_test_point_id', 'steps', 'title'
  ]);
  assert.doesNotMatch(JSON.stringify(target.projection), /independent_review|ignored/);
});

test('AT23: review validates total target assessment and exact source/item references', () => {
  const target = compileIndependentReviewTargetV4(input());
  assert.deepEqual(validateIndependentReviewV4(completedReview(target), target, {
    source_claim_ids: ['CLM-accept'], decision_ids: [], semantic_gap_ids: []
  }).diagnostics, []);

  const unsupported = completedReview(target);
  unsupported.target_assessments[0].source_claim_ids = ['CLM-invented'];
  assert.match(validateIndependentReviewV4(unsupported, target, {
    source_claim_ids: ['CLM-accept'], decision_ids: [], semantic_gap_ids: []
  }).diagnostics.map((item) => item.code).join(','), /INDEPENDENT_REVIEW_SOURCE_REF_UNKNOWN/);

  const dangling = completedReview(target);
  dangling.target_assessments[0].affected_items[0].item_id = 'TP-invented';
  assert.match(validateIndependentReviewV4(dangling, target, {
    source_claim_ids: ['CLM-accept'], decision_ids: [], semantic_gap_ids: []
  }).diagnostics.map((item) => item.code).join(','), /INDEPENDENT_REVIEW_ITEM_UNKNOWN/);

  const wrongCurrentEvidence = completedReview(target);
  wrongCurrentEvidence.target_assessments[0].source_claim_ids = ['CLM-other-current'];
  assert.match(validateIndependentReviewV4(wrongCurrentEvidence, target, {
    source_claim_ids: ['CLM-accept', 'CLM-other-current'], decision_ids: [], semantic_gap_ids: []
  }).diagnostics.map((item) => item.code).join(','), /INDEPENDENT_REVIEW_TARGET_EVIDENCE_MISMATCH/);
});

test('AT23/AT24: confirmed findings require a repaired item and passed recheck; rejected findings require evidence', () => {
  const target = compileIndependentReviewTargetV4(input());
  const review = completedReview(target);
  review.findings = [{
    finding_kind: 'unsupported_assertion', source_first_target_ids: [],
    source_claim_ids: ['CLM-accept'], decision_ids: [],
    issue: 'Case 声称一个来源没有规定的额外结果。', impact: '可能把错误产品规则写入正式预期。',
    affected_items: [{ item_kind: 'oracle', item_id: 'ORACLE-accepted' }],
    adjudication: 'confirmed', disposition: 'fixed_and_rechecked',
    rationale: '已删除额外断言并复核当前 Oracle。',
    required_recheck: {
      status: 'passed', affected_items: [{ item_kind: 'oracle', item_id: 'ORACLE-accepted' }]
    }
  }];
  const context = { source_claim_ids: ['CLM-accept'], decision_ids: [], semantic_gap_ids: [] };
  assert.deepEqual(validateIndependentReviewV4(review, target, context).diagnostics, []);

  const unchecked = structuredClone(review);
  unchecked.findings[0].required_recheck.status = 'not_required';
  assert.match(validateIndependentReviewV4(unchecked, target, context).diagnostics
    .map((item) => item.code).join(','), /INDEPENDENT_REVIEW_FINDING_NOT_CLOSED/);

  const selfCheck = structuredClone(review);
  selfCheck.reviewer_identity.identity_class = 'generator_self_check';
  assert.match(validateIndependentReviewV4(selfCheck, target, context).diagnostics
    .map((item) => item.code).join(','), /INDEPENDENT_REVIEW_NOT_INDEPENDENT/);
});
