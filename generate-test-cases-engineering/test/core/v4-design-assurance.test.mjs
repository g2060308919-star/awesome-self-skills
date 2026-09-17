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
  assert.equal(compileCaseDocumentRevisionV4(legacy.artifacts, legacy.system).status, 'compiled');
});
