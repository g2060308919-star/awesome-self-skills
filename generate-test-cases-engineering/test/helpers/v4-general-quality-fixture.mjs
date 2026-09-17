import { v4PipelineFixture } from './v4-pipeline-fixture.mjs';
import { compileIndependentReviewTargetV4 } from '../../src/independent-review-v4.mjs';
import { compileBusinessOutcomesV4 } from '../../src/obligations/business-outcomes-v4.mjs';

/** @param {any} fixture */
function behaviorEvidence(fixture) {
  if (fixture.system?.behavior_evidence) return fixture.system.behavior_evidence;
  const evidence = fixture.artifacts.evidence_claims;
  return {
    facts: evidence.fact_ledger.map((/** @type {any} */ fact) => ({
      fact_id: fact.fact_id,
      module_id: fact.module_refs[0],
      acceptance_role: fact.acceptance_role,
      condition_field: fact.field_path.split('/').filter(Boolean).at(-1)
    })),
    claims: evidence.claims.flatMap((/** @type {any} */ claim) => {
      const assertions = claim.semantic_value?.behavior_assertions;
      return Array.isArray(assertions) && assertions.length > 0 ? [{
        claim_id: claim.claim_id, level: claim.level, supported: true,
        assertions: structuredClone(assertions)
      }] : [];
    })
  };
}

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
  for (const gap of evidence.semantic_gaps ?? []) {
    gap.acceptance_impact = {
      classification: 'critical', criteria: ['makes_required_result_undecidable'],
      rationale: '该未决语义直接决定必要验收结果，最终答案前不可正式交付。'
    };
  }
  const compiled = compileBusinessOutcomesV4(behavior, behaviorEvidence(fixture));
  if (compiled.kind !== 'compiled') throw new TypeError('GENERAL_QUALITY_FIXTURE_OUTCOME_INVALID');
  const formalPointIds = new Set(compiled.formal_test_points.map(
    (/** @type {any} */ point) => point.formal_test_point_id
  ));
  const reviewedCase = fixture.artifacts.case_drafts.cases.find(
    (/** @type {any} */ candidate) => formalPointIds.has(candidate.primary_test_point_id)
  );
  if (!reviewedCase) throw new TypeError('GENERAL_QUALITY_FIXTURE_CASE_INVALID');
  const sourceClaimIds = [...new Set(reviewedCase.oracles.flatMap(
    (/** @type {any} */ oracle) => oracle.claim_ids
  ))];
  const sourceFirstTargets = [{
    target_kind: 'business_result', acceptance_role: 'primary_acceptance',
    objective: reviewedCase.title, source_claim_ids: sourceClaimIds, decision_ids: []
  }];
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
  const pointId = reviewedCase.primary_test_point_id;
  fixture.artifacts.case_drafts.independent_review = {
    protocol_version: '1.0.0', status: 'completed', review_mode: 'independent_source_first',
    reviewer_identity: {
      identity_class: 'independent_context', separation_basis: '先形成来源目标，再读取生成投影。'
    },
    source_first_targets: reviewTarget.projection.source_first_targets,
    review_target_digest: reviewTarget.digest,
    target_assessments: [{
      target_id: targetId, disposition: 'verified',
      affected_items: [{ item_kind: 'formal_test_point', item_id: pointId }],
      source_claim_ids: sourceClaimIds, decision_ids: [],
      rationale: '当前 Case 的可判定 Oracle 验证该来源目标。',
      required_recheck: {
        status: 'passed',
        affected_items: [{ item_kind: 'formal_test_point', item_id: pointId }]
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
