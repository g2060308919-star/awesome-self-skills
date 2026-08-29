import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  compileObligations, ObligationCompilationError
} from '../../src/obligations/compile-obligations.mjs';
import { createObligationRegistry } from '../../src/obligations/registry.mjs';
import { responsibilityKey } from '../../src/obligations/responsibility.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const interactionDimensions = [
  'shared-entity', 'role', 'client', 'interface-event',
  'time', 'concurrency', 'side-effect'
];

async function ledgerFixture() {
  return JSON.parse(await readFile(path.join(
    repositoryRoot, 'test/fixtures/journeys/obligation-ledger-valid.json'
  ), 'utf8'));
}

async function interactionFixture() {
  return JSON.parse(await readFile(path.join(
    repositoryRoot, 'test/fixtures/views/interaction-valid.json'
  ), 'utf8'));
}

/** @param {string} key */
function responsibilityBinding(key) {
  return {
    responsibility_key: key,
    risk: 'medium',
    source_claim_ids: ['claim_shared'],
    required_oracle_refs: [],
    required_capabilities: ['integration-observer']
  };
}

/** @param {any} behaviorViews */
function interactionGraph(behaviorViews) {
  const element = behaviorViews.views[0].elements[0];
  const surfaceBindings = [
    'request', 'response', 'persistence', 'event', 'callback', 'compensation'
  ].map((surface) => responsibilityBinding(responsibilityKey(
    'integration', element.element_id, { responsibility: 'surface', surface }
  )));
  const sideEffectBindings = element.side_effects.map((/** @type {any} */ sideEffect) => responsibilityBinding(
    responsibilityKey('integration', element.element_id, {
      responsibility: 'side-effect', side_effect: sideEffect
    })
  ));
  return {
    claimsById: new Map([['claim_shared', {
      claim_id: 'claim_shared', level: 'E3', kind: 'requirement', scope: '*', parent_claim_ids: []
    }]]),
    factLedger: [],
    runScope: '*',
    obligationCompilation: {
      sourceRevision: behaviorViews.source_revision,
      contextsByViewId: new Map([
        ['view_orders', { responsibilityBindings: [...surfaceBindings, ...sideEffectBindings] }],
        ['view_payments', { responsibilityBindings: [] }]
      ]),
      factRoutes: [],
      notApplicableReviews: [],
      customObligations: []
    }
  };
}

/** @param {any} fixture */
function graphFrom(fixture) {
  const claims = structuredClone(fixture.claims);
  return {
    claimsById: new Map(claims.map((/** @type {any} */ claim) => [claim.claim_id, claim])),
    factLedger: structuredClone(fixture.fact_ledger),
    runScope: fixture.run_scope,
    obligationCompilation: {
      sourceRevision: fixture.source_revision,
      contextsByViewId: new Map(Object.entries(structuredClone(fixture.contexts_by_view_id))),
      factRoutes: structuredClone(fixture.fact_routes),
      notApplicableReviews: structuredClone(fixture.not_applicable_reviews),
      customObligations: structuredClone(fixture.custom_obligations)
    }
  };
}

/** @param {any} fixture @param {number} size */
function scaleLedgerInput(fixture, size) {
  const behaviorViews = structuredClone(fixture.behavior_views);
  const claims = Array.from({ length: size }, (_, index) => ({
    claim_id: `claim_scale_${index}`,
    level: 'E3',
    kind: 'requirement',
    scope: 'checkout',
    parent_claim_ids: []
  }));
  behaviorViews.views[0].source_claim_ids = claims.map((claim) => claim.claim_id);
  behaviorViews.views[0].elements = claims.map((claim, index) => ({
    element_id: `rule_scale_${index}`,
    kind: 'decision-rule',
    conditions: [`condition ${index}`],
    result: `result ${index}`,
    priority: index,
    source_claim_ids: [claim.claim_id],
    model_refs: []
  }));
  const contextsByViewId = new Map([['view_decision', {
    riskByElementId: Object.fromEntries(claims.map((_, index) => [`rule_scale_${index}`, 'medium'])),
    requiredOracleRefsByElementId: Object.fromEntries(claims.map((claim, index) => [
      `rule_scale_${index}`, [claim.claim_id]
    ])),
    requiredCapabilitiesByElementId: Object.fromEntries(claims.map((_, index) => [
      `rule_scale_${index}`, ['scale-observer']
    ]))
  }]]);
  return {
    behaviorViews,
    evidenceGraph: {
      claimsById: new Map(claims.map((claim) => [claim.claim_id, claim])),
      factLedger: claims.map((claim, index) => ({
        fact_id: `fact_scale_${index}`,
        claim_id: claim.claim_id,
        status: 'active',
        source_claim_ids: [claim.claim_id]
      })),
      runScope: 'checkout',
      obligationCompilation: {
        sourceRevision: behaviorViews.source_revision,
        contextsByViewId,
        factRoutes: [],
        notApplicableReviews: [],
        customObligations: []
      }
    }
  };
}

/** @param {() => unknown} action @returns {ObligationCompilationError} */
function compilationError(action) {
  try {
    action();
  } catch (error) {
    assert.equal(error instanceof ObligationCompilationError, true);
    return /** @type {ObligationCompilationError} */ (error);
  }
  assert.fail('expected obligation compilation to require revision');
  throw new Error('unreachable after assertion failure');
}

test('obligation ledger compiles an empty formal scope into the frozen artifact shape', () => {
  const evidenceGraph = {
    claimsById: new Map(),
    factLedger: [],
    runScope: 'empty',
    obligationCompilation: {
      sourceRevision: 0,
      contextsByViewId: new Map(),
      factRoutes: [],
      notApplicableReviews: [],
      customObligations: []
    }
  };
  const behaviorViews = {
    schema_version: '1.0.0',
    source_revision: 0,
    views: [],
    interaction_matrix: interactionDimensions.map((dimension) => ({
      module_ids: ['empty'], dimension, status: 'checked-no-signal'
    })),
    interaction_candidates: []
  };

  assert.deepEqual(compileObligations(evidenceGraph, behaviorViews), {
    schema_version: '1.0.0',
    source_revision: 0,
    obligations: [],
    fact_routes: [],
    interaction_routes: []
  });
});

test('obligation ledger reconciles modeled, Blocked, and NotApplicable fact routes', async () => {
  const fixture = await ledgerFixture();
  const result = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));

  assert.equal(result.obligations.length, 2);
  assert.equal(result.obligations.some((/** @type {any} */ item) => item.obligation_id === 'obligation_0123456789abcdef'), true);
  const modeled = result.fact_routes.find((/** @type {any} */ route) => route.fact_id === 'fact_rule');
  assert.equal(modeled?.route_type, 'obligations');
  assert.equal(modeled?.obligation_ids.length, 2);
  assert.deepEqual(result.fact_routes.filter((/** @type {any} */ route) => route.fact_id !== 'fact_rule'), [
    {
      fact_id: 'fact_blocked', route_type: 'blocked',
      blocker_root_issue_id: 'root_checkout_rule'
    },
    {
      fact_id: 'fact_not_applicable', route_type: 'not_applicable',
      not_applicable_claim_id: 'claim_exclusion'
    }
  ]);
});

test('obligation ledger rejects missing, duplicate, unknown, and Exploratory fact routes', async () => {
  const fixture = await ledgerFixture();

  const missing = graphFrom(fixture);
  missing.obligationCompilation.factRoutes = missing.obligationCompilation.factRoutes
    .filter((/** @type {any} */ route) => route.fact_id !== 'fact_blocked');
  const missingError = compilationError(() => compileObligations(missing, fixture.behavior_views));
  assert.equal(missingError.status, 'need_revision');
  assert.equal(missingError.diagnostics.some((item) => item.category === 'traceability'
    && item.code === 'NORMATIVE_FACT_UNMODELED' && item.path === '/facts/fact_blocked'), true);

  const duplicate = graphFrom(fixture);
  duplicate.obligationCompilation.factRoutes.push({
    fact_id: 'fact_blocked', route_type: 'not_applicable',
    not_applicable_claim_id: 'claim_exclusion'
  });
  const duplicateError = compilationError(() => compileObligations(duplicate, fixture.behavior_views));
  assert.equal(duplicateError.diagnostics.some((item) => item.code === 'FACT_ROUTE_MULTIPLE'), true);

  const unknown = graphFrom(fixture);
  unknown.obligationCompilation.factRoutes.push({
    fact_id: 'fact_unknown', route_type: 'blocked', blocker_root_issue_id: 'root_unknown'
  });
  const unknownError = compilationError(() => compileObligations(unknown, fixture.behavior_views));
  assert.equal(unknownError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'FACT_ROUTE_UNKNOWN'), true);

  const exploratory = graphFrom(fixture);
  exploratory.obligationCompilation.factRoutes[0] = {
    fact_id: 'fact_blocked', route_type: 'exploratory', exploratory_id: 'exploratory_forbidden'
  };
  const exploratoryError = compilationError(() => compileObligations(exploratory, fixture.behavior_views));
  assert.equal(exploratoryError.diagnostics.some((item) => item.category === 'classification'
    && item.code === 'FORMAL_FACT_EXPLORATORY_FORBIDDEN'), true);
});

test('obligation ledger enforces Blocked/NotApplicable exclusivity and route references', async () => {
  const fixture = await ledgerFixture();
  const modeledAndBlocked = graphFrom(fixture);
  modeledAndBlocked.obligationCompilation.factRoutes.push({
    fact_id: 'fact_rule', route_type: 'blocked', blocker_root_issue_id: 'root_duplicate_route'
  });
  const multipleError = compilationError(() => compileObligations(modeledAndBlocked, fixture.behavior_views));
  assert.equal(multipleError.diagnostics.some((item) => item.code === 'FACT_ROUTE_MULTIPLE'), true);

  const danglingExclusion = graphFrom(fixture);
  danglingExclusion.obligationCompilation.factRoutes[1] = {
    fact_id: 'fact_not_applicable', route_type: 'not_applicable',
    not_applicable_claim_id: 'claim_missing'
  };
  const danglingError = compilationError(() => compileObligations(danglingExclusion, fixture.behavior_views));
  assert.equal(danglingError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'NOT_APPLICABLE_CLAIM_DANGLING'), true);
});

test('obligation ledger requires an independent supported E3/E2 review before NotApplicable can resolve Task 4', async () => {
  const fixture = await ledgerFixture();

  const missingReview = graphFrom(fixture);
  missingReview.obligationCompilation.notApplicableReviews = [];
  const missingError = compilationError(() => compileObligations(missingReview, fixture.behavior_views));
  assert.equal(missingError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_REVIEW_MISSING'), true);
  assert.equal(missingError.diagnostics.some((item) => item.code === 'NORMATIVE_FACT_UNMODELED'
    && item.path === '/facts/fact_not_applicable'), true);

  const temporary = graphFrom(fixture);
  Object.assign(temporary.claimsById.get('claim_exclusion'), { level: 'E1', kind: 'assumption' });
  const temporaryError = compilationError(() => compileObligations(temporary, fixture.behavior_views));
  assert.equal(temporaryError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_CLAIM_LEVEL_INVALID'), true);

  const wrongScope = graphFrom(fixture);
  wrongScope.claimsById.get('claim_exclusion').scope = 'other-scope';
  const scopeError = compilationError(() => compileObligations(wrongScope, fixture.behavior_views));
  assert.equal(scopeError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_SCOPE_MISMATCH'), true);

  const notIndependent = graphFrom(fixture);
  notIndependent.obligationCompilation.factRoutes[1].not_applicable_claim_id = 'claim_not_applicable';
  notIndependent.obligationCompilation.notApplicableReviews[0].claim_id = 'claim_not_applicable';
  const independentError = compilationError(() => compileObligations(notIndependent, fixture.behavior_views));
  assert.equal(independentError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT'), true);

  const unsupported = graphFrom(fixture);
  unsupported.obligationCompilation.notApplicableReviews[0].support_review = 'unsupported';
  const unsupportedError = compilationError(() => compileObligations(unsupported, fixture.behavior_views));
  assert.equal(unsupportedError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_REVIEW_INVALID'), true);

  const duplicate = graphFrom(fixture);
  duplicate.obligationCompilation.notApplicableReviews.push({
    fact_id: 'fact_not_applicable', claim_id: 'claim_exclusion', support_review: 'supported'
  });
  const duplicateError = compilationError(() => compileObligations(duplicate, fixture.behavior_views));
  assert.equal(duplicateError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_REVIEW_MULTIPLE'), true);

  const unknown = graphFrom(fixture);
  unknown.obligationCompilation.notApplicableReviews.push({
    fact_id: 'fact_unknown', claim_id: 'claim_exclusion', support_review: 'supported'
  });
  const unknownError = compilationError(() => compileObligations(unknown, fixture.behavior_views));
  assert.equal(unknownError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_REVIEW_UNKNOWN'), true);

  const derived = graphFrom(fixture);
  Object.assign(derived.claimsById.get('claim_exclusion'), { level: 'E2', kind: 'test-data' });
  const derivedResult = /** @type {any} */ (compileObligations(derived, fixture.behavior_views));
  assert.equal(derivedResult.fact_routes.some((/** @type {any} */ route) => route.fact_id === 'fact_not_applicable'
    && route.route_type === 'not_applicable'), true);
});

test('obligation ledger rejects malformed evidence identity and cross-revision compilation', async () => {
  const fixture = await ledgerFixture();

  const revision = graphFrom(fixture);
  revision.obligationCompilation.sourceRevision += 1;
  const revisionError = compilationError(() => compileObligations(revision, fixture.behavior_views));
  assert.equal(revisionError.diagnostics.some((item) => item.code === 'OBLIGATION_SOURCE_REVISION_MISMATCH'), true);

  const plainClaims = graphFrom(fixture);
  plainClaims.claimsById = Object.fromEntries(plainClaims.claimsById);
  const plainError = compilationError(() => compileObligations(plainClaims, fixture.behavior_views));
  assert.equal(plainError.diagnostics.some((item) => item.code === 'EVIDENCE_CLAIMS_MAP_REQUIRED'), true);

  const mismatchedKey = graphFrom(fixture);
  const claimRule = mismatchedKey.claimsById.get('claim_rule');
  mismatchedKey.claimsById.delete('claim_rule');
  mismatchedKey.claimsById.set('claim_wrong_key', claimRule);
  const keyError = compilationError(() => compileObligations(mismatchedKey, fixture.behavior_views));
  assert.equal(keyError.diagnostics.some((item) => item.code === 'EVIDENCE_CLAIM_KEY_MISMATCH'), true);

  const duplicateFact = graphFrom(fixture);
  duplicateFact.factLedger.push(structuredClone(duplicateFact.factLedger[0]));
  const duplicateError = compilationError(() => compileObligations(duplicateFact, fixture.behavior_views));
  assert.equal(duplicateError.diagnostics.some((item) => item.code === 'EVIDENCE_FACT_ID_DUPLICATE'), true);

  const sparseFact = graphFrom(fixture);
  sparseFact.factLedger.length += 1;
  const sparseError = compilationError(() => compileObligations(sparseFact, fixture.behavior_views));
  assert.equal(sparseError.diagnostics.some((item) => item.code === 'EVIDENCE_FACT_LEDGER_INVALID'), true);

  const openFact = graphFrom(fixture);
  openFact.factLedger[0].unexpected = true;
  const openError = compilationError(() => compileObligations(openFact, fixture.behavior_views));
  assert.equal(openError.diagnostics.some((item) => item.code === 'EVIDENCE_FACT_NOT_CLOSED'), true);

  const danglingFact = graphFrom(fixture);
  danglingFact.factLedger[0].source_claim_ids.push('claim_missing');
  const danglingError = compilationError(() => compileObligations(danglingFact, fixture.behavior_views));
  assert.equal(danglingError.diagnostics.some((item) => item.code === 'EVIDENCE_FACT_SOURCE_DANGLING'), true);
});

test('obligation ledger merges duplicate signatures without losing gates or leaking into siblings', async () => {
  const fixture = await ledgerFixture();
  const graph = graphFrom(fixture);
  graph.obligationCompilation.customObligations.push(
    {
      obligation_id: 'obligation_0123456789abcdef',
      kind: 'decision',
      risk: 'medium',
      scope: 'checkout',
      source_claim_ids: ['claim_rule_parent'],
      view_element_refs: ['view_decision#rule_checkout'],
      required_oracle_refs: ['claim_rule_parent'],
      required_capabilities: ['second-observer']
    },
    {
      obligation_id: 'obligation_1111111111111111',
      kind: 'interaction',
      risk: 'low',
      scope: 'checkout',
      source_claim_ids: ['claim_exclusion'],
      view_element_refs: [],
      required_oracle_refs: [],
      required_capabilities: ['sibling-only']
    }
  );

  const result = /** @type {any} */ (compileObligations(graph, fixture.behavior_views));
  const merged = result.obligations.find((/** @type {any} */ item) => item.obligation_id === 'obligation_0123456789abcdef');
  const sibling = result.obligations.find((/** @type {any} */ item) => item.obligation_id === 'obligation_1111111111111111');
  assert.deepEqual(merged?.source_claim_ids, ['claim_rule', 'claim_rule_parent']);
  assert.deepEqual(merged?.required_oracle_refs, ['claim_rule', 'claim_rule_parent']);
  assert.deepEqual(merged?.required_capabilities, ['custom-observer', 'second-observer']);
  assert.deepEqual(sibling?.source_claim_ids, ['claim_exclusion']);
  assert.deepEqual(sibling?.required_capabilities, ['sibling-only']);
  assert.equal(sibling?.required_capabilities.includes('second-observer'), false);

  const reordered = graphFrom(fixture);
  reordered.obligationCompilation.customObligations.push(
    structuredClone(graph.obligationCompilation.customObligations[1]),
    structuredClone(graph.obligationCompilation.customObligations[2])
  );
  reordered.obligationCompilation.customObligations.reverse();
  assert.deepEqual(compileObligations(reordered, fixture.behavior_views), result);

  const conflict = graphFrom(fixture);
  conflict.obligationCompilation.customObligations.push({
    ...conflict.obligationCompilation.customObligations[0],
    risk: 'critical'
  });
  const conflictError = compilationError(() => compileObligations(conflict, fixture.behavior_views));
  assert.equal(conflictError.diagnostics.some((item) => item.code === 'OBLIGATION_SIGNATURE_CONFLICT'), true);
});

test('obligation ledger rejects custom obligations with dangling or ambiguous input references', async () => {
  const fixture = await ledgerFixture();

  const dangling = graphFrom(fixture);
  dangling.obligationCompilation.customObligations.push({
    obligation_id: 'obligation_2222222222222222',
    kind: 'decision',
    risk: 'low',
    scope: 'checkout',
    source_claim_ids: ['claim_missing'],
    view_element_refs: ['view_decision#element_missing'],
    required_oracle_refs: ['claim_missing'],
    required_capabilities: []
  });
  const danglingError = compilationError(() => compileObligations(dangling, fixture.behavior_views));
  assert.equal(danglingError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'CUSTOM_OBLIGATION_CLAIM_DANGLING'), true);
  assert.equal(danglingError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'CUSTOM_OBLIGATION_VIEW_ELEMENT_DANGLING'), true);

  const openInput = graphFrom(fixture);
  openInput.obligationCompilation.customObligations[0].unexpected = true;
  const openError = compilationError(() => compileObligations(openInput, fixture.behavior_views));
  assert.equal(openError.diagnostics.some((item) => item.category === 'schema'
    && item.code === 'CUSTOM_OBLIGATION_INPUT_NOT_CLOSED'), true);
});

test('obligation ledger rejects custom system collisions and conflicting semantic owners', async () => {
  const fixture = await ledgerFixture();
  const base = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  const system = base.obligations.find((/** @type {any} */ obligation) => obligation.risk === 'high');
  const collision = graphFrom(fixture);
  collision.obligationCompilation.customObligations.push(structuredClone(system));
  const collisionError = compilationError(() => compileObligations(collision, fixture.behavior_views));
  assert.equal(collisionError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_SYSTEM_ID_COLLISION'), true);

  const ownerFixture = structuredClone(fixture);
  ownerFixture.claims.push({
    claim_id: 'claim_other_owner', level: 'E3', kind: 'requirement', scope: 'checkout', parent_claim_ids: []
  });
  ownerFixture.behavior_views.views[0].source_claim_ids.push('claim_other_owner');
  ownerFixture.behavior_views.views[0].elements.push({
    element_id: 'rule_other', kind: 'decision-rule', conditions: ['other condition'],
    result: 'other result', priority: 1, source_claim_ids: ['claim_other_owner'], model_refs: []
  });
  Object.assign(ownerFixture.contexts_by_view_id.view_decision, {
    riskByElementId: { ...ownerFixture.contexts_by_view_id.view_decision.riskByElementId, rule_other: 'medium' },
    requiredOracleRefsByElementId: {
      ...ownerFixture.contexts_by_view_id.view_decision.requiredOracleRefsByElementId,
      rule_other: ['claim_other_owner']
    },
    requiredCapabilitiesByElementId: {
      ...ownerFixture.contexts_by_view_id.view_decision.requiredCapabilitiesByElementId,
      rule_other: ['other-observer']
    }
  });
  const ownerConflict = graphFrom(ownerFixture);
  ownerConflict.obligationCompilation.customObligations.push(
    {
      obligation_id: 'obligation_3333333333333333', kind: 'decision', risk: 'low', scope: 'checkout',
      source_claim_ids: ['claim_rule'], view_element_refs: ['view_decision#rule_checkout'],
      required_oracle_refs: ['claim_rule'], required_capabilities: []
    },
    {
      obligation_id: 'obligation_3333333333333333', kind: 'decision', risk: 'low', scope: 'checkout',
      source_claim_ids: ['claim_other_owner'], view_element_refs: ['view_decision#rule_other'],
      required_oracle_refs: ['claim_other_owner'], required_capabilities: []
    }
  );
  const ownerError = compilationError(() => compileObligations(ownerConflict, ownerFixture.behavior_views));
  assert.equal(ownerError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_OWNER_CONFLICT'), true);

  const siblingLeak = graphFrom(ownerFixture);
  siblingLeak.obligationCompilation.customObligations.push({
    obligation_id: 'obligation_8888888888888888', kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_rule', 'claim_other_owner'],
    view_element_refs: ['view_decision#rule_checkout', 'view_decision#rule_other'],
    required_oracle_refs: ['claim_rule', 'claim_other_owner'], required_capabilities: []
  });
  const siblingError = compilationError(() => compileObligations(siblingLeak, ownerFixture.behavior_views));
  assert.equal(siblingError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_SOURCE_UNRELATED'), true);
  assert.equal(siblingError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_ORACLE_UNRELATED'), true);

  const sourceOwner = graphFrom(fixture);
  sourceOwner.obligationCompilation.customObligations.push(
    {
      obligation_id: 'obligation_4444444444444444', kind: 'interaction', risk: 'low', scope: 'checkout',
      source_claim_ids: ['claim_exclusion'], view_element_refs: [], required_oracle_refs: [], required_capabilities: []
    },
    {
      obligation_id: 'obligation_4444444444444444', kind: 'interaction', risk: 'low', scope: 'checkout',
      source_claim_ids: ['claim_blocked'], view_element_refs: [], required_oracle_refs: [], required_capabilities: []
    }
  );
  const sourceOwnerError = compilationError(() => compileObligations(sourceOwner, fixture.behavior_views));
  assert.equal(sourceOwnerError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_OWNER_CONFLICT'), true);
});

test('obligation ledger rejects custom evidence poison, invalid Oracles, and unrelated owner ancestry', async () => {
  const fixture = await ledgerFixture();

  const unrelated = graphFrom(fixture);
  unrelated.obligationCompilation.customObligations.push({
    obligation_id: 'obligation_5555555555555555', kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_blocked'], view_element_refs: ['view_decision#rule_checkout'],
    required_oracle_refs: ['claim_blocked'], required_capabilities: []
  });
  const unrelatedError = compilationError(() => compileObligations(unrelated, fixture.behavior_views));
  assert.equal(unrelatedError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_SOURCE_UNRELATED'), true);
  assert.equal(unrelatedError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_ORACLE_UNRELATED'), true);

  const invalidOracle = graphFrom(fixture);
  invalidOracle.claimsById.set('claim_test_data', {
    claim_id: 'claim_test_data', level: 'E2', kind: 'test-data', scope: 'checkout',
    derivation_kind: 'boundary-representative', derivation_target: 'test-data', parent_claim_ids: ['claim_rule']
  });
  invalidOracle.obligationCompilation.customObligations.push({
    obligation_id: 'obligation_6666666666666666', kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_rule', 'claim_test_data'], view_element_refs: ['view_decision#rule_checkout'],
    required_oracle_refs: ['claim_test_data'], required_capabilities: []
  });
  const oracleError = compilationError(() => compileObligations(invalidOracle, fixture.behavior_views));
  assert.equal(oracleError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_ORACLE_INVALID'), true);

  const wrongScope = graphFrom(fixture);
  wrongScope.claimsById.set('claim_wrong_scope', {
    claim_id: 'claim_wrong_scope', level: 'E3', kind: 'requirement', scope: 'other', parent_claim_ids: []
  });
  wrongScope.obligationCompilation.customObligations.push({
    obligation_id: 'obligation_7777777777777777', kind: 'interaction', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_wrong_scope'], view_element_refs: [],
    required_oracle_refs: ['claim_wrong_scope'], required_capabilities: []
  });
  const scopeError = compilationError(() => compileObligations(wrongScope, fixture.behavior_views));
  assert.equal(scopeError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_CLAIM_SCOPE_MISMATCH'), true);
});

test('obligation ledger consumes every audited interaction disposition into one frozen route', async () => {
  const behaviorViews = await interactionFixture();
  const result = /** @type {any} */ (compileObligations(interactionGraph(behaviorViews), behaviorViews));

  assert.equal(result.obligations.length, 7);
  assert.equal(result.obligations.every((/** @type {any} */ obligation) => obligation.required_oracle_refs.length === 0), true);
  assert.deepEqual(result.interaction_routes, [
    {
      candidate_id: 'candidate_blocked', route_type: 'blocked',
      blocker_root_issue_id: 'root_cross_role'
    },
    {
      candidate_id: 'candidate_exploratory', route_type: 'exploratory',
      exploratory_id: 'exploratory_cross_client'
    },
    {
      candidate_id: 'candidate_formal', route_type: 'formal-view',
      formal_view_id: 'view_orders'
    }
  ]);
});

test('obligation ledger surfaces Task 4 interaction omissions and mutually exclusive destinations', async () => {
  const missing = await interactionFixture();
  missing.interaction_candidates = missing.interaction_candidates.filter(
    (/** @type {any} */ candidate) => candidate.candidate_id !== 'candidate_blocked'
  );
  const missingError = compilationError(() => compileObligations(interactionGraph(missing), missing));
  assert.equal(missingError.diagnostics.some((item) => item.category === 'traceability'
    && item.code === 'INTERACTION_CANDIDATE_MISSING'), true);

  const multiple = await interactionFixture();
  multiple.interaction_candidates[0].exploratory_id = 'exploratory_extra';
  const multipleError = compilationError(() => compileObligations(interactionGraph(multiple), multiple));
  assert.equal(multipleError.diagnostics.some((item) => item.category === 'classification'
    && (item.code === 'CANDIDATE_DISPOSITION_NOT_EXACT' || item.code === 'ONE_OF_MISMATCH')), true);
});

test('obligation ledger orchestrates the closed seven-strategy registry and rejects unknown or duplicate registrations', () => {
  const viewTypes = ['flow', 'decision', 'state', 'input-domain', 'role', 'timing', 'integration'];
  const behaviorViews = {
    schema_version: '1.0.0',
    source_revision: 11,
    views: viewTypes.map((type) => ({
      view_id: `view_${type}`,
      type,
      scope: 'all-types',
      source_claim_ids: [],
      elements: [],
      relations: []
    })),
    interaction_matrix: interactionDimensions.map((dimension) => ({
      module_ids: ['all-types'], dimension, status: 'checked-no-signal'
    })),
    interaction_candidates: []
  };
  const evidenceGraph = {
    claimsById: new Map(),
    factLedger: [],
    runScope: 'all-types',
    obligationCompilation: {
      sourceRevision: 11,
      contextsByViewId: new Map(viewTypes.map((type) => [
        `view_${type}`,
        ['input-domain', 'role', 'timing', 'integration'].includes(type)
          ? { responsibilityBindings: [] } : {}
      ])),
      factRoutes: [],
      notApplicableReviews: [],
      customObligations: []
    }
  };

  assert.deepEqual(compileObligations(evidenceGraph, behaviorViews).obligations, []);

  const compileEmpty = () => [];
  const registry = createObligationRegistry().registerObligationStrategy('flow', compileEmpty);
  assert.throws(
    () => createObligationRegistry().registerObligationStrategy('unknown', compileEmpty),
    /unsupported obligation strategy view type "unknown"/
  );
  assert.throws(
    () => registry.registerObligationStrategy('flow', compileEmpty),
    /duplicate obligation strategy for view type "flow"/
  );
  assert.throws(
    () => registry.compile({ type: 'unknown' }, {}),
    /no obligation strategy registered for view type "unknown"/
  );
});

test('obligation ledger rejects open or evidence-overriding per-view compilation contexts', async () => {
  const fixture = await ledgerFixture();
  const openContext = graphFrom(fixture);
  openContext.obligationCompilation.contextsByViewId.get('view_decision').unexpected = true;
  const openError = compilationError(() => compileObligations(openContext, fixture.behavior_views));
  assert.equal(openError.diagnostics.some((item) => item.category === 'schema'
    && item.code === 'OBLIGATION_CONTEXT_NOT_CLOSED'), true);

  const override = graphFrom(fixture);
  override.obligationCompilation.contextsByViewId.get('view_decision').claimsById = new Map();
  const overrideError = compilationError(() => compileObligations(override, fixture.behavior_views));
  assert.equal(overrideError.diagnostics.some((item) => item.category === 'classification'
    && item.code === 'OBLIGATION_CONTEXT_EVIDENCE_OVERRIDE'), true);

  const sparseRouteInput = graphFrom(fixture);
  /** @type {any[]} */ (sparseRouteInput.obligationCompilation.factRoutes).push(null);
  const sparseError = compilationError(() => compileObligations(sparseRouteInput, fixture.behavior_views));
  assert.equal(sparseError.diagnostics.some((item) => item.category === 'schema'
    && item.code === 'OBLIGATION_COMPILATION_INPUT_TYPE_INVALID'), true);

  const holeRouteInput = graphFrom(fixture);
  holeRouteInput.obligationCompilation.factRoutes.length += 1;
  const holeError = compilationError(() => compileObligations(holeRouteInput, fixture.behavior_views));
  assert.equal(holeError.diagnostics.some((item) => item.code === 'OBLIGATION_COMPILATION_INPUT_TYPE_INVALID'), true);
});

test('obligation ledger rejects whitespace and padded private IDs, refs, scopes, and capabilities', async () => {
  const fixture = await ledgerFixture();

  const custom = graphFrom(fixture);
  custom.obligationCompilation.customObligations[0].scope = ' checkout';
  custom.obligationCompilation.customObligations[0].required_capabilities = [' '];
  const customError = compilationError(() => compileObligations(custom, fixture.behavior_views));
  assert.equal(customError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_STRINGS_INVALID'), true);

  const blocked = graphFrom(fixture);
  blocked.obligationCompilation.factRoutes[0].blocker_root_issue_id = ' ';
  const blockedError = compilationError(() => compileObligations(blocked, fixture.behavior_views));
  assert.equal(blockedError.diagnostics.some((item) => item.code === 'FACT_BLOCKED_ROUTE_INVALID'), true);

  const context = graphFrom(fixture);
  context.obligationCompilation.contextsByViewId.get('view_decision')
    .requiredCapabilitiesByElementId.rule_checkout = [' padded-capability '];
  const contextError = compilationError(() => compileObligations(context, fixture.behavior_views));
  assert.equal(contextError.diagnostics.some((item) => item.code === 'OBLIGATION_CONTEXT_STRINGS_INVALID'), true);

  const behaviorViews = await interactionFixture();
  behaviorViews.interaction_candidates[1].blocker_root_issue_id = ' root_cross_role';
  const interactionError = compilationError(() => compileObligations(interactionGraph(behaviorViews), behaviorViews));
  assert.equal(interactionError.diagnostics.some((item) => item.code === 'INTERACTION_ROUTE_STRING_INVALID'), true);
});

test('obligation ledger rejects context prototype values and unknown or padded map keys', async () => {
  const fixture = await ledgerFixture();

  const prototype = graphFrom(fixture);
  const prototypeRisk = Object.create({ rule_checkout: 'high' });
  prototype.obligationCompilation.contextsByViewId.get('view_decision').riskByElementId = prototypeRisk;
  const prototypeError = compilationError(() => compileObligations(prototype, fixture.behavior_views));
  assert.equal(prototypeError.diagnostics.some((item) => item.code === 'OBLIGATION_CONTEXT_MAP_PROTOTYPE_FORBIDDEN'), true);

  const unknownElement = graphFrom(fixture);
  unknownElement.obligationCompilation.contextsByViewId.get('view_decision')
    .requiredOracleRefsByElementId.rule_unknown = ['claim_rule'];
  const elementError = compilationError(() => compileObligations(unknownElement, fixture.behavior_views));
  assert.equal(elementError.diagnostics.some((item) => item.code === 'OBLIGATION_CONTEXT_ELEMENT_UNKNOWN'), true);

  const paddedView = graphFrom(fixture);
  paddedView.obligationCompilation.contextsByViewId.set(
    ' view_decision', structuredClone(paddedView.obligationCompilation.contextsByViewId.get('view_decision'))
  );
  const viewError = compilationError(() => compileObligations(paddedView, fixture.behavior_views));
  assert.equal(viewError.diagnostics.some((item) => item.code === 'OBLIGATION_CONTEXT_VIEW_KEY_INVALID'), true);
});

test('obligation ledger rejects sparse behavior arrays before Task 4 can clean them', async () => {
  const fixture = await ledgerFixture();

  const sparseViews = structuredClone(fixture.behavior_views);
  sparseViews.views.length += 1;
  const viewsError = compilationError(() => compileObligations(graphFrom(fixture), sparseViews));
  assert.equal(viewsError.diagnostics.some((item) => item.code === 'BEHAVIOR_ARRAY_SPARSE'
    && item.path === '/views/1'), true);

  const sparseMatrix = structuredClone(fixture.behavior_views);
  sparseMatrix.interaction_matrix.length += 1;
  const matrixError = compilationError(() => compileObligations(graphFrom(fixture), sparseMatrix));
  assert.equal(matrixError.diagnostics.some((item) => item.code === 'BEHAVIOR_ARRAY_SPARSE'
    && item.path.startsWith('/interaction_matrix/')), true);

  const sparseNested = structuredClone(fixture.behavior_views);
  sparseNested.views[0].elements[0].conditions.length += 1;
  const nestedError = compilationError(() => compileObligations(graphFrom(fixture), sparseNested));
  assert.equal(nestedError.diagnostics.some((item) => item.code === 'BEHAVIOR_ARRAY_SPARSE'
    && item.path.includes('/conditions/')), true);
});

test('obligation ledger returns frozen-schema diagnostics instead of an invalid artifact', async () => {
  const fixture = await ledgerFixture();
  const graph = graphFrom(fixture);
  graph.obligationCompilation.customObligations[0].risk = 'not-a-risk';

  const error = compilationError(() => compileObligations(graph, fixture.behavior_views));
  assert.equal(error.stage, 'test_obligations');
  assert.equal(error.diagnostics.some((item) => item.category === 'schema'
    && item.path.includes('/obligations/')), true);

  const lossy = graphFrom(fixture);
  lossy.obligationCompilation.customObligations[0].required_capabilities = [42];
  const lossyError = compilationError(() => compileObligations(lossy, fixture.behavior_views));
  assert.equal(lossyError.diagnostics.some((item) => item.category === 'schema'
    && item.path.includes('/required_capabilities/')), true);
});

test('obligation ledger is reorder-stable, fresh, and non-mutating', async () => {
  const fixture = await ledgerFixture();
  const before = JSON.stringify(fixture);
  const first = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));

  const reordered = structuredClone(fixture);
  reordered.claims.reverse();
  reordered.fact_ledger.reverse();
  reordered.fact_routes.reverse();
  reordered.behavior_views.interaction_matrix.reverse();
  reordered.behavior_views.views[0].source_claim_ids.reverse();
  reordered.behavior_views.views[0].elements[0].source_claim_ids.reverse();
  const second = /** @type {any} */ (compileObligations(graphFrom(reordered), reordered.behavior_views));

  assert.deepEqual(second, first);
  assert.notStrictEqual(second, first);
  assert.notStrictEqual(second.obligations, first.obligations);
  assert.notStrictEqual(second.obligations[0], first.obligations[0]);
  first.obligations[0].source_claim_ids.push('claim_mutated_after_return');
  const third = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  assert.equal(third.obligations.some(
    (/** @type {any} */ obligation) => obligation.source_claim_ids.includes('claim_mutated_after_return')
  ), false);
  assert.equal(JSON.stringify(fixture), before);
});

test('obligation ledger canonicalizes terminal-route diagnostics before duplicate decisions', async () => {
  const fixture = await ledgerFixture();
  const first = graphFrom(fixture);
  first.obligationCompilation.factRoutes.push({
    fact_id: 'fact_blocked', route_type: 'blocked', blocker_root_issue_id: 'root_second'
  });
  first.obligationCompilation.factRoutes.push({
    fact_id: 'fact_unknown', route_type: 'blocked', blocker_root_issue_id: 'root_unknown'
  });
  const second = graphFrom(fixture);
  second.obligationCompilation.factRoutes = structuredClone(first.obligationCompilation.factRoutes).reverse();

  const firstError = compilationError(() => compileObligations(first, fixture.behavior_views));
  const secondError = compilationError(() => compileObligations(second, fixture.behavior_views));
  assert.deepEqual(secondError.diagnostics, firstError.diagnostics);
});

test('obligation ledger indexes fact reconciliation instead of rescanning every obligation per fact', async () => {
  const fixture = await ledgerFixture();
  const size = 40;
  const { evidenceGraph, behaviorViews } = scaleLedgerInput(fixture, size);
  const originalFlatMap = Array.prototype.flatMap;
  let obligationEntriesScanned = 0;
  Object.defineProperty(Array.prototype, 'flatMap', {
    configurable: true,
    writable: true,
    value(/** @type {any} */ callback, /** @type {any} */ thisArg) {
      if (this.length > 0 && Object.hasOwn(Object(this[0]), 'obligation_id')) {
        obligationEntriesScanned += this.length;
      }
      return originalFlatMap.call(this, callback, thisArg);
    }
  });
  let compiled;
  try {
    compiled = /** @type {any} */ (compileObligations(evidenceGraph, behaviorViews));
  } finally {
    Object.defineProperty(Array.prototype, 'flatMap', {
      configurable: true, writable: true, value: originalFlatMap
    });
  }

  assert.equal(compiled.fact_routes.length, size);
  assert.equal(compiled.obligations.length, size);
  assert.ok(obligationEntriesScanned <= size * 2, `scanned ${obligationEntriesScanned} obligation entries`);
});
