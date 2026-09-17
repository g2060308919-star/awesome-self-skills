import { v4PipelineFixture } from './v4-pipeline-fixture.mjs';

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
  return fixture;
}

/** A minimal valid 4.3 four-artifact revision. Later slices extend it in place. */
export function v4GeneralQualityFixture() {
  return bindGeneralQualityFixture(v4PipelineFixture());
}
