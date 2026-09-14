import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalStringify, stableId } from '../../src/canonical.mjs';
import { classifyCaseDrafts } from '../../src/classify.mjs';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { auditInteractionMatrix } from '../../src/views/interaction-matrix.mjs';
import {
  IDS, acceptedClaim, baseCase, baseObligation, blockerDisposition, classificationContext
} from '../helpers/classification-context.mjs';
import {
  addExploratory, buildJourney, completeJourneyRevision, evaluateJourneyRevision, journeyRule,
  loadHardGateExpectations, revisionFromRules, setSourceRevision
} from '../helpers/run-journey.mjs';

// Production defect caught: an irrelevant ordering/revision/module change can
// perturb stable identities or widen a local evidence/testability decision.
// Rule reversal caught: global downgrades, unstable IDs, incomplete interaction
// audits, or broadened Decision scope make these metamorphic comparisons fail.

const hardGateExpectations = await loadHardGateExpectations();

/** @param {any} input @param {'pause_for_clarification'|'record_only'} [policy] @returns {any} */
function finished(input, policy = 'pause_for_clarification') {
  const result = completeJourneyRevision(input, policy);
  assert.equal(result.status, 'finished', canonicalStringify(result));
  return result.bundle;
}

test('metamorphic: artifact array reorder leaves the canonical bundle unchanged', () => {
  const input = revisionFromRules([
    journeyRule('checkout'),
    journeyRule('shipping', {
      sourceId: 'source_shipping', scope: 'shipping',
      digest: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    })
  ], {
    modules: ['checkout', 'shipping'],
    extraSources: [{
      source_id: 'source_shipping', kind: 'prd', version: '1', status: 'effective',
      authority: 'shipping-owner', content: 'Frozen shipping requirements.',
      content_digest: 'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      scope: 'shipping'
    }],
    extraPolicyRules: [{
      rule_id: 'policy_shipping', source_ids: ['source_shipping'], scope: 'shipping',
      authority: 'shipping-owner', status: 'effective'
    }]
  });
  input.source_pack.source_policy.rules[0].scope = 'checkout';
  const baseline = finished(input);
  const reordered = structuredClone(input);
  for (const [label, collection] of [
    ['sources', reordered.source_pack.sources],
    ['locators', reordered.source_pack.locators],
    ['source-policy rules', reordered.source_pack.source_policy.rules],
    ['claims', reordered.evidence_claims.claims],
    ['facts', reordered.evidence_claims.fact_ledger],
    ['views', reordered.behavior_views.views],
    ['interaction matrix cells', reordered.behavior_views.interaction_matrix],
    ['Cases', reordered.case_drafts.cases],
    ['dispositions', reordered.case_drafts.obligation_dispositions]
  ]) {
    assert.ok(collection.length >= 2, `${label} reorder precondition is non-vacuous`);
    collection.reverse();
  }
  assert.equal(canonicalStringify(finished(reordered)), canonicalStringify(baseline));
});

test('metamorphic: adding an independent module preserves prior IDs and lanes', () => {
  const original = finished(revisionFromRules([journeyRule('checkout')]));
  const expanded = finished(revisionFromRules([
    journeyRule('checkout'),
    journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] }));
  const originalCase = original.grounded.find((/** @type {any} */ item) => item.scope === 'checkout');
  const retainedCase = expanded.grounded.find((/** @type {any} */ item) => item.scope === 'checkout');
  assert.equal(retainedCase.case_id, originalCase.case_id);
  assert.deepEqual(retainedCase.obligation_ids, originalCase.obligation_ids);
});

test('metamorphic hard gates: E3→E1 only moves Grounded to Conditional', () => {
  assert.equal(hardGateExpectations.get('E1-as-Grounded'), 'conditional');
  const grounded = finished(revisionFromRules([
    journeyRule('checkout'), journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] }));
  const conditional = finished(revisionFromRules([
    journeyRule('checkout', { level: 'E1', decisionDisposition: 'temporary' }),
    journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] }));
  const originalCheckout = grounded.grounded.find(
    (/** @type {any} */ item) => item.scope === 'checkout'
  );
  const originalShipping = grounded.grounded.find(
    (/** @type {any} */ item) => item.scope === 'shipping'
  );
  assert.equal(grounded.grounded.length, 2);
  assert.equal(conditional.grounded.length, 1, 'reversal permits E1-as-Grounded');
  assert.deepEqual(conditional.grounded[0], originalShipping, 'unrelated module changed');
  assert.equal(conditional.conditional.length, 1);
  assert.equal(conditional.blocked.length, 0);
  assert.equal(conditional.exploratory.length, 0);
  assert.equal(conditional.conditional[0].case_id, originalCheckout.case_id);
  assert.deepEqual(conditional.conditional[0].obligation_ids, originalCheckout.obligation_ids);
});

test('metamorphic hard gate: E1→E0 blocks only the dependent module', () => {
  assert.equal(hardGateExpectations.get('E0-as-Conditional'), 'blocked');
  const e1Input = revisionFromRules([
    journeyRule('checkout', {
      level: 'E1', decisionDisposition: 'temporary', viewType: 'role'
    }),
    journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] });
  assert.equal(e1Input.evidence_claims.claims.some(
    (/** @type {any} */ item) => item.level === 'E0'
  ), false, 'E0 must never be authored into a legal Agent evidence artifact');
  const e1 = finished(e1Input, 'record_only');
  assert.deepEqual(e1.conditional.map((/** @type {any} */ item) => item.scope), ['checkout']);
  assert.deepEqual(e1.grounded.map((/** @type {any} */ item) => item.scope), ['shipping']);
  const unaffectedBaseline = e1.grounded[0];

  const e0Input = revisionFromRules([
    journeyRule('checkout', {
      viewType: 'role', hasOracle: false, mode: 'blocker'
    }),
    journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] });
  const checkoutClaim = e0Input.evidence_claims.claims.find(
    (/** @type {any} */ item) => item.claim_id === 'claim_checkout'
  );
  checkoutClaim.value = 'Tester can exercise checkout; the expected outcome is unknown.';
  assert.equal(e0Input.evidence_claims.claims.some(
    (/** @type {any} */ item) => item.level === 'E0'
  ), false, 'unknown/E0 remains an internal absence, never accepted evidence');
  assert.equal(e0Input.case_drafts.cases.some(
    (/** @type {any} */ item) => item.scope === 'checkout'
  ), false, 'the Agent must not submit an unsupported Case for an unknown Oracle');
  const e0 = finished(e0Input, 'record_only');
  assert.equal(e0.conditional.length, 0, 'reversal permits E0-as-Conditional');
  assert.equal(e0.blocked.length, 1, 'the dependent formal Test Point must remain Blocked');
  assert.equal(e0.blocked[0].obligation_id, e1Input.case_drafts.cases.find(
    (/** @type {any} */ item) => item.scope === 'checkout'
  ).obligation_ids[0]);
  assert.deepEqual(e0.grounded, [unaffectedBaseline], 'unrelated module changed lane or content');
  assert.equal(e0.coverage.formal.total, e1.coverage.formal.total);
});

test('metamorphic obligation input: empty Oracle prebinding preserves a Case-supplied Oracle', () => {
  const e1Input = revisionFromRules([
    journeyRule('checkout', {
      level: 'E1', decisionDisposition: 'temporary', viewType: 'role'
    }),
    journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] });
  assert.equal(e1Input.case_drafts.cases.length, 2, 'locality requires two independent Cases');
  assert.deepEqual(
    e1Input.behavior_views.obligation_inputs.view_contexts[0]
      .bindings[0].required_oracle_refs,
    ['claim_checkout'],
    'the E1 baseline must require its accepted E1 Oracle'
  );
  const baselineCheckoutClaim = e1Input.evidence_claims.claims.find(
    (/** @type {any} */ item) => item.claim_id === 'claim_checkout'
  );
  assert.equal(baselineCheckoutClaim.level, 'E1');
  assert.equal(baselineCheckoutClaim.claim_form, 'decision-record');
  const e1 = finished(e1Input, 'record_only');
  assert.equal(e1.conditional.length, 1, 'reversal permits E1-as-Grounded');
  assert.equal(e1.grounded.length, 1);
  assert.equal(e1.coverage.formal.entries.length, 2);
  const affectedBaseline = e1.conditional.find(
    (/** @type {any} */ item) => item.scope === 'checkout'
  );
  const unaffectedBaseline = e1.grounded.find(
    (/** @type {any} */ item) => item.scope === 'shipping'
  );
  assert.ok(affectedBaseline && unaffectedBaseline, 'both locality lanes must exist');
  assert.notEqual(affectedBaseline.case_id, unaffectedBaseline.case_id);
  assert.notEqual(affectedBaseline.obligation_ids[0], unaffectedBaseline.obligation_ids[0]);

  const e0Input = revisionFromRules([
    journeyRule('checkout', {
      level: 'E1', decisionDisposition: 'temporary', hasOracle: false, viewType: 'role'
    }),
    journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] });
  const affectedDraft = e0Input.case_drafts.cases.find(
    (/** @type {any} */ item) => item.scope === 'checkout'
  );
  assert.ok(affectedDraft, 'the affected E1 Case must exist before removing its Oracle');
  assert.deepEqual(
    e0Input.behavior_views.obligation_inputs.view_contexts[0]
      .bindings[0].required_oracle_refs,
    [],
    'the optional-prebinding result must have no compiler-required Oracle dependency'
  );
  assert.equal(e0Input.evidence_claims.claims.some(
    (/** @type {any} */ item) => item.level === 'E0'
  ), false, 'E0/unknown must stay outside accepted evidence');
  const checkoutClaimWithoutOracleRole = e0Input.evidence_claims.claims.find(
    (/** @type {any} */ item) => item.claim_id === 'claim_checkout'
  );
  assert.deepEqual(
    checkoutClaimWithoutOracleRole, baselineCheckoutClaim,
    'the temporary E1 requirement remains accepted but is no longer a formal Oracle'
  );
  assert.deepEqual(
    e0Input.case_drafts.cases, e1Input.case_drafts.cases,
    'removing optional prebinding must not change support_review or submitted Case content'
  );
  const e0 = finished(e0Input, 'record_only');
  assert.equal(e0.grounded.length, 1);
  assert.equal(e0.conditional.length, 1);
  assert.equal(e0.blocked.length, 0, 'an empty prebinding must not erase a Case-supplied Oracle');
  assert.equal(e0.exploratory.length, 0);
  const affectedResult = e0.conditional.find(
    (/** @type {any} */ item) => item.scope === 'checkout'
  );
  assert.deepEqual(affectedResult, affectedBaseline, 'optional prebinding changed the executable Case');
  const unaffectedResult = e0.grounded.find(
    (/** @type {any} */ item) => item.scope === 'shipping'
  );
  assert.deepEqual(unaffectedResult, unaffectedBaseline, 'unrelated Grounded Case changed');
  assert.equal(canonicalStringify(unaffectedResult), canonicalStringify(unaffectedBaseline));
  assert.equal(unaffectedResult.case_id, unaffectedBaseline.case_id);
  assert.deepEqual(unaffectedResult.obligation_ids, unaffectedBaseline.obligation_ids);
  const unaffectedPointId = unaffectedBaseline.obligation_ids[0];
  const unaffectedCoverageBefore = e1.coverage.formal.entries.find(
    (/** @type {any} */ item) => item.obligation_id === unaffectedPointId
  );
  const unaffectedCoverageAfter = e0.coverage.formal.entries.find(
    (/** @type {any} */ item) => item.obligation_id === unaffectedPointId
  );
  assert.deepEqual(unaffectedCoverageAfter, unaffectedCoverageBefore);
  assert.equal(e0.coverage.formal.total, e1.coverage.formal.total);
});

test('metamorphic hard gate: unsupported support review blocks the dependent Case', () => {
  assert.equal(hardGateExpectations.get('unsupported-support-review'), 'blocked');
  const unsupportedContext = classificationContext();
  unsupportedContext.caseDrafts.cases[0].steps[0].expectations[0].support_review = 'uncertain';
  const unsupported = classifyCaseDrafts(unsupportedContext);
  assert.equal(unsupported.grounded.length + unsupported.conditional.length, 0);
  assert.match(unsupported.blocked[0].reason, /SUPPORT_REVIEW_UNCERTAIN/u);
});

test('metamorphic hard gate: approved capability assumption cannot become Grounded', () => {
  assert.equal(hardGateExpectations.get('approved-assumption-as-Grounded'), 'conditional');
  const approvedContext = classificationContext();
  approvedContext.evidence.claimsById.set('claim_capability', acceptedClaim('claim_capability', 'E1'));
  approvedContext.caseDrafts.cases[0].testability_profile.capabilities[0].status = 'approved-assumption';
  approvedContext.caseDrafts.cases[0].temporary_assumption = {
    claim_id: 'claim_capability', invalidation_condition: 'The capability is verified.'
  };
  const approved = classifyCaseDrafts(approvedContext);
  assert.equal(approved.grounded.length, 0, 'reversal permits approved-assumption-as-Grounded');
  assert.equal(approved.conditional.length, 1);
});

test('metamorphic: provided→unknown capability blocks only the affected Case', () => {
  const input = revisionFromRules([
    journeyRule('checkout'),
    journeyRule('shipping', { scope: 'shipping' })
  ], { modules: ['checkout', 'shipping'] });
  const baseline = finished(input, 'record_only');
  const changed = structuredClone(input);
  const affectedCase = changed.case_drafts.cases.find(
    (/** @type {any} */ item) => item.scope === 'checkout'
  );
  affectedCase.testability_profile.capabilities[0].status = 'unknown';
  const result = finished(changed, 'record_only');
  const baselineShipping = baseline.grounded.find(
    (/** @type {any} */ item) => item.scope === 'shipping'
  );
  assert.equal(baseline.grounded.length, 2);
  assert.equal(result.grounded.length, 1);
  assert.deepEqual(result.grounded[0], baselineShipping, 'unaffected shipping Case changed');
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].obligation_id, affectedCase.obligation_ids[0]);
});

test('metamorphic hard gates: adding Exploratory leaves formal coverage unchanged', () => {
  assert.equal(
    hardGateExpectations.get('Exploratory-in-denominator'),
    'formal-coverage-unchanged'
  );
  const baseline = finished(buildJourney('all-e3'));
  const withExploration = finished(addExploratory(buildJourney('all-e3')));
  assert.deepEqual(withExploration.coverage.formal, baseline.coverage.formal);
  assert.deepEqual(withExploration.coverage.requirements, baseline.coverage.requirements);
  assert.equal(withExploration.exploratory.length, 1);
});

test('metamorphic hard gate: semantic no-op revisions preserve stable IDs', () => {
  assert.equal(hardGateExpectations.get('revision-in-stable-ID'), 'same-id');
  const initialInput = buildJourney('all-e3');
  const revisedInput = structuredClone(initialInput);
  setSourceRevision(revisedInput, 9);
  const initial = finished(initialInput);
  const revised = finished(revisedInput);
  assert.deepEqual(
    revised.grounded.map((/** @type {any} */ item) => item.case_id),
    initial.grounded.map((/** @type {any} */ item) => item.case_id)
  );
  assert.deepEqual(
    revised.grounded.flatMap((/** @type {any} */ item) => item.obligation_ids),
    initial.grounded.flatMap((/** @type {any} */ item) => item.obligation_ids)
  );
  assert.equal(
    stableId('fact', { scope: 'checkout', source_revision: 1 }),
    stableId('fact', { scope: 'checkout', source_revision: 99 }),
    'reversal permits revision-in-stable-ID'
  );
});

test('metamorphic: a scoped final Decision changes only its dependency closure', () => {
  const temporary = finished(revisionFromRules([
    journeyRule('payment', { scope: 'checkout.payment', level: 'E1', decisionDisposition: 'temporary' }),
    journeyRule('shipping', { scope: 'checkout.shipping' })
  ], { modules: ['checkout.payment', 'checkout.shipping'] }));
  const final = finished(revisionFromRules([
    journeyRule('payment', { scope: 'checkout.payment', level: 'E3', decisionDisposition: 'final' }),
    journeyRule('shipping', { scope: 'checkout.shipping' })
  ], { modules: ['checkout.payment', 'checkout.shipping'] }));
  const temporaryShipping = temporary.grounded.find(
    (/** @type {any} */ item) => item.scope === 'checkout.shipping'
  );
  const finalShipping = final.grounded.find(
    (/** @type {any} */ item) => item.scope === 'checkout.shipping'
  );
  assert.deepEqual(finalShipping, temporaryShipping);
  assert.equal(temporary.conditional.some(
    (/** @type {any} */ item) => item.scope === 'checkout.payment'
  ), true);
  assert.equal(final.grounded.some(
    (/** @type {any} */ item) => item.scope === 'checkout.payment'
  ), true);
  assert.equal(final.conditional.length, 0);
});

test('metamorphic hard gate: skipped interaction matrix cells fail closed', () => {
  assert.equal(
    hardGateExpectations.get('skipped-interaction-cell'),
    'INTERACTION_CELL_MISSING'
  );
  const interaction = buildJourney('multi-module-interaction').behavior_views;
  interaction.interaction_matrix = interaction.interaction_matrix.slice(1);
  assert.equal(auditInteractionMatrix(interaction).diagnostics.some(
    (item) => item.code === 'INTERACTION_CELL_MISSING'
  ), true, 'reversal permits a skipped interaction cell');
});

test('metamorphic hard gate: invalid E2 derivation target fails closed', () => {
  assert.equal(hardGateExpectations.get('invalid-E2-target'), 'E2_TARGET_NOT_ALLOWED');
  const invalidTarget = buildJourney('all-e3');
  invalidTarget.evidence_claims.claims.push({
    claim_id: 'claim_invalid_target', claim_form: 'derived', level: 'E2',
    kind: 'expected-value', scope: 'checkout', value: 'checkout->accepted',
    source_locator_ids: ['locator_checkout'], derivation_kind: 'graph-reachability',
    derivation_target: 'expected-value', parent_claim_ids: ['claim_checkout'],
    parameters: { graph_id: 'graph_checkout' },
    rule_input: { from: 'checkout', to: 'accepted' }
  });
  assert.equal(validateEvidenceGraph(
    invalidTarget.source_pack, invalidTarget.evidence_claims
  ).diagnostics.some((item) => item.code === 'E2_TARGET_NOT_ALLOWED'), true);
});

test('metamorphic hard gate: E2 derivation cycles fail closed', () => {
  assert.equal(hardGateExpectations.get('E2-cycle'), 'E2_CYCLE');
  const cycle = buildJourney('all-e3');
  cycle.evidence_claims.claims.push(
    {
      claim_id: 'claim_cycle_a', claim_form: 'derived', level: 'E2', kind: 'test-data',
      scope: 'checkout', value: '0', source_locator_ids: ['locator_checkout'],
      derivation_kind: 'boundary-representative', derivation_target: 'test-data',
      parent_claim_ids: ['claim_cycle_b'], parameters: { domain_id: 'domain_a' },
      rule_input: { lower: 0, upper: 1, inclusive: true }
    },
    {
      claim_id: 'claim_cycle_b', claim_form: 'derived', level: 'E2', kind: 'test-data',
      scope: 'checkout', value: '1', source_locator_ids: ['locator_checkout'],
      derivation_kind: 'boundary-representative', derivation_target: 'test-data',
      parent_claim_ids: ['claim_cycle_a'], parameters: { domain_id: 'domain_b' },
      rule_input: { lower: 0, upper: 1, inclusive: true }
    }
  );
  assert.equal(validateEvidenceGraph(
    cycle.source_pack, cycle.evidence_claims
  ).diagnostics.some((item) => item.code === 'E2_CYCLE'), true);
});

test('metamorphic hard gate: a missing formal Oracle retains its Blocked Test Point', () => {
  assert.equal(hardGateExpectations.get('missing-Blocked-Test-Point'), 'blocked-retained');
  const obligation = baseObligation({ required_oracle_refs: [] });
  const result = classifyCaseDrafts(classificationContext({
    obligations: [obligation],
    cases: [],
    dispositions: [blockerDisposition()]
  }));
  assert.equal(result.blocked.length, 1, 'reversal drops the missing Blocked Test Point');
  assert.equal(result.grounded.length + result.conditional.length + result.exploratory.length, 0);
});

test('metamorphic hard gate: hidden record_only changes interruption, never classification gates', () => {
  assert.equal(hardGateExpectations.get('record_only-lowering-gates'), 'blocked');
  const input = buildJourney('local-source-conflict');
  const paused = evaluateJourneyRevision(input, 'pause_for_clarification');
  assert.equal(paused.status, 'need_user_answers');

  const recorded = evaluateJourneyRevision(input, 'record_only');
  assert.equal(recorded.kind, 'analysis_only');
  assert.equal(recorded.semantic_sections.blocked.length, 1);
  assert.equal(recorded.semantic_sections.conditional.length, 0);
  assert.equal(recorded.semantic_sections.coverage.formal.entries.some(
    (/** @type {any} */ item) => item.status === 'blocked'
  ), true, 'reversal lets record_only erase or cover an unresolved formal Test Point');
});
