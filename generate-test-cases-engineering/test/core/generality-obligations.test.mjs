import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJourney, evaluateJourneyRevision } from '../helpers/run-journey.mjs';

/** @param {string} type */
function customRevision(type) {
  const revision = buildJourney('all-e3');
  revision.behavior_views.obligation_inputs.custom_responsibilities = [{
    responsibility_type: type, semantic_key: 'checkout-responsibility',
    owner: { kind: 'facts', fact_ids: ['fact_checkout'] }, scope: 'checkout', risk: 'medium',
    source_claim_ids: ['claim_checkout'], required_oracle_refs: [], required_capabilities: []
  }];
  return revision;
}

for (const type of ['state-transition', 'input-partition', 'temporal-rule', 'integration-contract']) {
  test(`generality P02/P04: ${type} cannot replace its dedicated behavior view`, () => {
    const result = evaluateJourneyRevision(customRevision(type));
    assert.equal(result.status, 'need_revision');
    assert.equal(result.stage, 'behavior_views');
    assert.ok(result.diagnostics.some((/** @type {any} */ entry) => entry.code === 'CUSTOM_RESPONSIBILITY_VIEW_REQUIRED'), JSON.stringify(result.diagnostics));
  });
}

test('generality P03: a custom Test Point cannot cover two independent facts', () => {
  const revision = customRevision('decision-outcome');
  revision.evidence_claims.claims.push({ ...revision.evidence_claims.claims[0], claim_id: 'claim_persistence', value: 'Persist the checkout record.' });
  revision.evidence_claims.fact_ledger.push({ fact_id: 'fact_persistence', claim_id: 'claim_persistence', status: 'active', source_claim_ids: ['claim_persistence'], required_view_kinds: [], view_review_basis: 'Independent persistence assertion.' });
  const custom = revision.behavior_views.obligation_inputs.custom_responsibilities[0];
  custom.owner.fact_ids.push('fact_persistence');
  custom.source_claim_ids.push('claim_persistence');
  const result = evaluateJourneyRevision(revision);
  assert.equal(result.status, 'need_revision');
  assert.equal(result.stage, 'behavior_views');
  assert.ok(result.diagnostics.some((/** @type {any} */ entry) => entry.code === 'CUSTOM_RESPONSIBILITY_NOT_ATOMIC'), JSON.stringify(result.diagnostics));
});
