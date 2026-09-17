import { v4PipelineFixture } from './v4-pipeline-fixture.mjs';
import { compileIndependentReviewTargetV4 } from '../../src/independent-review-v4.mjs';
import { compileBusinessOutcomesV4 } from '../../src/obligations/business-outcomes-v4.mjs';

/** @param {any} fixture */
export function bindGeneralQualityFixture(fixture) {
  for (const artifact of Object.values(fixture.artifacts)) artifact.schema_version = '4.3.0';
  const behavior = fixture.artifacts.behavior_views;
  const entries = behavior.views.flatMap((/** @type {any} */ view) => view.elements.map((/** @type {any} */ element) => ({
    view, element,
    candidate_id: `DESIGN-CANDIDATE-${element.element_id}`,
    rule_group_id: `RULE-GROUP-${view.view_id}`
  })));
  const groups = behavior.views.map((/** @type {any} */ view) => ({
    rule_group_id: `RULE-GROUP-${view.view_id}`, batch_id: 'BATCH-acceptance',
    source_claim_ids: [...view.source_claim_ids], objective: `验证 ${view.scope} 的业务结果`,
    method: view.type === 'state' ? 'state_transition' : 'scenario',
    candidate_ids: entries.filter((/** @type {any} */ entry) => entry.view.view_id === view.view_id)
      .map((/** @type {any} */ entry) => entry.candidate_id)
  }));
  behavior.design_assurance = {
    plan_revision: 1,
    batches: [{
      batch_id: 'BATCH-acceptance', sequence: 1, status: 'complete',
      source_claim_ids: [...new Set(groups.flatMap((/** @type {any} */ group) => group.source_claim_ids))],
      rule_group_ids: groups.map((/** @type {any} */ group) => group.rule_group_id)
    }],
    rule_groups: groups,
    candidate_responsibilities: entries.map((/** @type {any} */ entry) => ({
      candidate_id: entry.candidate_id, rule_group_id: entry.rule_group_id,
      responsibility: `独立验证 ${entry.element.business_outcome}`,
      source_claim_ids: [...entry.view.source_claim_ids]
    })),
    candidate_dispositions: entries.map((/** @type {any} */ entry) => ({
      candidate_id: entry.candidate_id, disposition: 'retained',
      retained_element_ids: [entry.element.element_id], rationale: '该结果是来源支持的验收目标'
    })),
    impacted_prior_batches: []
  };
  const evidence = fixture.artifacts.evidence_claims;
  const claimId = evidence.claims[0].claim_id;
  const sourceFirstTargets = [{
    target_kind: 'business_result', acceptance_role: 'primary_acceptance',
    objective: '有效提交后订单进入已接受状态', source_claim_ids: [claimId], decision_ids: []
  }];
  const compiled = compileBusinessOutcomesV4(behavior, fixture.system.behavior_evidence);
  if (compiled.kind !== 'compiled') throw new TypeError('GENERAL_QUALITY_FIXTURE_OUTCOME_INVALID');
  const reviewTarget = compileIndependentReviewTargetV4({
    source_revision: fixture.artifacts.case_drafts.source_revision,
    source_first_targets: sourceFirstTargets,
    facts: evidence.fact_ledger,
    views: behavior.views,
    formal_test_points: compiled.formal_test_points,
    candidate_responsibilities: behavior.design_assurance.candidate_responsibilities,
    cases: fixture.artifacts.case_drafts.cases
  });
  const targetId = reviewTarget.projection.source_first_targets[0].target_id;
  const pointId = reviewTarget.projection.formal_test_points[0].formal_test_point_id;
  const caseId = reviewTarget.projection.cases[0].case_id;
  fixture.artifacts.case_drafts.independent_review = {
    protocol_version: '1.0.0', status: 'completed', review_mode: 'independent_source_first',
    reviewer_identity: {
      identity_class: 'independent_context', separation_basis: '先形成来源目标，再读取生成投影。'
    },
    source_first_targets: reviewTarget.projection.source_first_targets,
    review_target_digest: reviewTarget.digest,
    target_assessments: [{
      target_id: targetId, disposition: 'verified',
      affected_items: [
        { item_kind: 'formal_test_point', item_id: pointId },
        { item_kind: 'case', item_id: caseId }
      ],
      source_claim_ids: [claimId], decision_ids: [],
      rationale: '当前 Case 的可判定 Oracle 验证该来源目标。',
      required_recheck: {
        status: 'passed', affected_items: [{ item_kind: 'case', item_id: caseId }]
      }
    }],
    findings: []
  };
  return fixture;
}

/** A minimal valid 4.3 four-artifact revision. Later slices extend it in place. */
export function v4GeneralQualityFixture() {
  return bindGeneralQualityFixture(v4PipelineFixture());
}
