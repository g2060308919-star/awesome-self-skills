import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDesignAssuranceV4 } from '../../src/design-assurance-v4.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

function validationInput() {
  const fixture = v4GeneralQualityFixture();
  const behavior = fixture.artifacts.behavior_views;
  return {
    assurance: behavior.design_assurance,
    context: {
      source_claim_ids: fixture.artifacts.evidence_claims.claims.map((/** @type {any} */ item) => item.claim_id),
      semantic_gap_ids: fixture.artifacts.evidence_claims.semantic_gaps.map((/** @type {any} */ item) => item.semantic_gap_id),
      view_element_ids: behavior.views.flatMap((/** @type {any} */ view) => view.elements.map((/** @type {any} */ item) => item.element_id))
    }
  };
}

test('AT04-AT09 valid design assurance closes every candidate responsibility and disposition', () => {
  const { assurance, context } = validationInput();
  const result = validateDesignAssuranceV4(assurance, context);
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.normalized, assurance);
});

test('AT04-AT09 design assurance rejects incomplete batches and stale plan revisions', () => {
  for (const mutate of [
    (/** @type {any} */ value) => { value.batches[0].status = 'in_progress'; },
    (/** @type {any} */ value) => { value.batches[0].sequence = 2; value.plan_revision = 1; },
    (/** @type {any} */ value) => { value.batches[0].rule_group_ids = []; }
  ]) {
    const { assurance, context } = validationInput();
    mutate(assurance);
    assert.notDeepEqual(validateDesignAssuranceV4(assurance, context).diagnostics, []);
  }
});

test('AT04-AT09 design assurance rejects missing, duplicate, or unknown candidate ownership', () => {
  for (const mutate of [
    (/** @type {any} */ value) => { value.candidate_responsibilities = []; },
    (/** @type {any} */ value) => { value.candidate_dispositions = []; },
    (/** @type {any} */ value) => { value.candidate_responsibilities.push(structuredClone(value.candidate_responsibilities[0])); },
    (/** @type {any} */ value) => { value.candidate_dispositions[0].candidate_id = 'DESIGN-CANDIDATE-unknown'; }
  ]) {
    const { assurance, context } = validationInput();
    mutate(assurance);
    assert.notDeepEqual(validateDesignAssuranceV4(assurance, context).diagnostics, []);
  }
});

test('AT05-AT06 retained and merged targets must exist and merge graphs cannot cycle', () => {
  const unknown = validationInput();
  unknown.assurance.candidate_dispositions[0].retained_element_ids = ['EL-unknown'];
  assert.notDeepEqual(validateDesignAssuranceV4(unknown.assurance, unknown.context).diagnostics, []);

  const cycle = validationInput();
  const group = cycle.assurance.rule_groups[0];
  group.candidate_ids.push('DESIGN-CANDIDATE-second');
  cycle.assurance.candidate_responsibilities.push({
    candidate_id: 'DESIGN-CANDIDATE-second', rule_group_id: group.rule_group_id,
    responsibility: '第二个等价候选', source_claim_ids: [...group.source_claim_ids]
  });
  cycle.assurance.candidate_dispositions = [
    { candidate_id: group.candidate_ids[0], disposition: 'equivalent_merge', retained_candidate_id: group.candidate_ids[1], rationale: '等价' },
    { candidate_id: group.candidate_ids[1], disposition: 'equivalent_merge', retained_candidate_id: group.candidate_ids[0], rationale: '等价' }
  ];
  assert.match(
    validateDesignAssuranceV4(cycle.assurance, cycle.context).diagnostics.map((item) => item.code).join(','),
    /DESIGN_ASSURANCE_MERGE_CYCLE/
  );
});

test('AT05: representative and merge chains must terminate at a retained candidate', () => {
  const input = validationInput();
  const group = input.assurance.rule_groups[0];
  const retainedCandidateId = group.candidate_ids[0];
  const excludedCandidateId = 'DESIGN-CANDIDATE-excluded';
  group.candidate_ids.push(excludedCandidateId);
  input.assurance.candidate_responsibilities.push({
    candidate_id: excludedCandidateId, rule_group_id: group.rule_group_id,
    responsibility: '被排除候选', source_claim_ids: [...group.source_claim_ids]
  });
  input.assurance.candidate_dispositions = [
    {
      candidate_id: retainedCandidateId, disposition: 'equivalent_merge',
      retained_candidate_id: excludedCandidateId, rationale: '错误合并到非保留终点'
    },
    {
      candidate_id: excludedCandidateId, disposition: 'evidence_exclusion',
      source_claim_ids: [...group.source_claim_ids], rationale: '来源证明不适用'
    }
  ];
  assert.match(
    validateDesignAssuranceV4(input.assurance, input.context).diagnostics
      .map((item) => item.code).join(','),
    /DESIGN_ASSURANCE_RETAINED_CHAIN_INVALID/u
  );
});

test('AT09: an unknown impacted-batch trigger returns a diagnostic instead of throwing', () => {
  const input = validationInput();
  const triggerGroupId = 'RULE-GROUP-unknown-batch';
  const triggerCandidateId = 'DESIGN-CANDIDATE-unknown-batch';
  input.assurance.rule_groups.push({
    rule_group_id: triggerGroupId, batch_id: 'BATCH-unknown',
    source_claim_ids: [...input.assurance.batches[0].source_claim_ids],
    objective: '未知批次规则组', method: input.assurance.rule_groups[0].method,
    candidate_ids: [triggerCandidateId]
  });
  input.assurance.candidate_responsibilities.push({
    candidate_id: triggerCandidateId, rule_group_id: triggerGroupId,
    responsibility: '未知批次候选',
    source_claim_ids: [...input.assurance.batches[0].source_claim_ids]
  });
  input.assurance.candidate_dispositions.push({
    candidate_id: triggerCandidateId, disposition: 'retained',
    retained_element_ids: [input.context.view_element_ids[0]], rationale: '保留'
  });
  input.assurance.impacted_prior_batches = [{
    batch_id: input.assurance.batches[0].batch_id,
    trigger_rule_group_ids: [triggerGroupId],
    source_claim_ids: [...input.assurance.batches[0].source_claim_ids],
    rationale: '未知规则组不能触发重审。'
  }];
  assert.doesNotThrow(() => validateDesignAssuranceV4(input.assurance, input.context));
  assert.match(
    validateDesignAssuranceV4(input.assurance, input.context).diagnostics
      .map((item) => item.code).join(','),
    /DESIGN_ASSURANCE_PRIOR_BATCH_INVALID/u
  );
});

test('AT07 exclusion and semantic-gap disposition require current evidence references', () => {
  const exclusion = validationInput();
  exclusion.assurance.candidate_dispositions[0] = {
    candidate_id: exclusion.assurance.candidate_responsibilities[0].candidate_id,
    disposition: 'evidence_exclusion',
    source_claim_ids: ['CLM-unknown'], rationale: '不适用'
  };
  assert.notDeepEqual(validateDesignAssuranceV4(exclusion.assurance, exclusion.context).diagnostics, []);

  const gap = validationInput();
  gap.assurance.candidate_dispositions[0] = {
    candidate_id: gap.assurance.candidate_responsibilities[0].candidate_id,
    disposition: 'semantic_gap',
    semantic_gap_id: 'GAP-unknown', rationale: '语义未决'
  };
  assert.notDeepEqual(validateDesignAssuranceV4(gap.assurance, gap.context).diagnostics, []);
});

test('4.3 pipeline requires design assurance while 4.2 keeps its frozen artifact shape', () => {
  const current = v4GeneralQualityFixture();
  delete current.artifacts.behavior_views.design_assurance;
  const rejected = compileCaseDocumentRevisionV4(current.artifacts, current.system);
  assert.equal(rejected.status, 'need_revision');
  assert.equal(rejected.stage, 'behavior_views');

  const legacy = v4GeneralQualityFixture();
  for (const artifact of Object.values(legacy.artifacts)) artifact.schema_version = '4.2.0';
  delete legacy.artifacts.behavior_views.design_assurance;
  delete legacy.artifacts.case_drafts.independent_review;
  assert.equal(compileCaseDocumentRevisionV4(legacy.artifacts, legacy.system).status, 'compiled');
});
