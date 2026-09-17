import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileIndependentReviewTargetV4,
  validateIndependentReviewV4
} from '../../src/independent-review-v4.mjs';

/** @returns {any} */
function input() {
  return {
    source_revision: 2,
    source_first_targets: [{
      target_kind: 'business_result', acceptance_role: 'primary_acceptance', objective: '保存成功',
      source_claim_ids: ['CLM-save'], decision_ids: []
    }],
    facts: [{ fact_id: 'FACT-save', statement: '保存后显示成功', claim_ids: ['CLM-save'] }],
    views: [{ view_id: 'VIEW-save', elements: [{ element_id: 'EL-save', business_outcome: '保存成功' }] }],
    formal_test_points: [{ formal_test_point_id: 'TP-save', outcome_id: 'OUT-save' }],
    candidate_responsibilities: [{ candidate_id: 'CAND-save', responsibility: '验证保存结果' }],
    cases: [{
      case_id: 'CASE-save', title: '保存记录', primary_test_point_id: 'TP-save',
      business_preconditions: [], data_conditions: [{ condition_id: 'DATA-new', description: '新记录' }],
      steps: [{ step_id: 'STEP-save', action: '保存记录' }],
      oracles: [{ oracle_id: 'ORACLE-save', observe_after_step_id: 'STEP-save', expected: '显示保存成功' }]
    }]
  };
}

/** @param {any} target @returns {any} */
function completed(target) {
  const caseId = target.projection.cases[0].case_id;
  return {
    protocol_version: '1.0.0', status: 'completed', review_mode: 'independent_source_first',
    reviewer_identity: { identity_class: 'independent_agent', separation_basis: '来源先行的独立审阅。' },
    source_first_targets: structuredClone(target.projection.source_first_targets),
    review_target_digest: target.digest,
    target_assessments: [{
      target_id: target.projection.source_first_targets[0].target_id,
      disposition: 'verified', affected_items: [{ item_kind: 'case', item_id: caseId }],
      source_claim_ids: ['CLM-save'], decision_ids: [], rationale: '当前 Case 验证保存结果。',
      required_recheck: { status: 'passed', affected_items: [{ item_kind: 'case', item_id: caseId }] }
    }], findings: []
  };
}

test('AT24: review-only prose is self-excluded but data, step, and Oracle changes invalidate the digest', () => {
  const base = input();
  const first = compileIndependentReviewTargetV4(base);
  const proseOnly = structuredClone(base);
  proseOnly.cases[0].independent_review = { arbitrary_review_prose: '复核说明变化' };
  assert.equal(compileIndependentReviewTargetV4(proseOnly).digest, first.digest);

  for (const mutate of [
    (/** @type {any} */ value) => { value.cases[0].data_conditions[0].description = '已存在记录'; },
    (/** @type {any} */ value) => { value.cases[0].steps[0].action = '跳过保存'; },
    (/** @type {any} */ value) => { value.cases[0].oracles[0].expected = '显示任意内容'; }
  ]) {
    const changed = structuredClone(base);
    mutate(changed);
    assert.notEqual(compileIndependentReviewTargetV4(changed).digest, first.digest);
  }
});

test('AT24: a completed review cannot be replayed against changed generated content', () => {
  const original = compileIndependentReviewTargetV4(input());
  const changedInput = input();
  changedInput.cases[0].steps[0].action = '取消记录';
  const changed = compileIndependentReviewTargetV4(changedInput);
  const result = validateIndependentReviewV4(completed(original), changed, {
    source_claim_ids: ['CLM-save'], decision_ids: [], semantic_gap_ids: []
  });
  assert.match(result.diagnostics.map((item) => item.code).join(','), /INDEPENDENT_REVIEW_TARGET_MISMATCH/);
});

test('AT23/AT24: absent source-first inventory and staging-only pending review never satisfy completion', () => {
  assert.throws(() => compileIndependentReviewTargetV4({
    ...input(), source_first_targets: []
  }), /INDEPENDENT_REVIEW_SOURCE_FIRST_TARGETS_REQUIRED/);
  const target = compileIndependentReviewTargetV4(input());
  const pending = {
    protocol_version: '1.0.0', status: 'pending', review_mode: 'independent_source_first',
    reviewer_identity: { identity_class: 'independent_context', separation_basis: '来源先行。' },
    source_first_targets: input().source_first_targets
  };
  assert.match(validateIndependentReviewV4(pending, target, {
    source_claim_ids: ['CLM-save'], decision_ids: [], semantic_gap_ids: []
  }).diagnostics.map((item) => item.code).join(','), /INDEPENDENT_REVIEW_INCOMPLETE/);
});
