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
      contextsByViewId: new Map([
        ['view_orders', { responsibilityBindings: [...surfaceBindings, ...sideEffectBindings] }],
        ['view_payments', { responsibilityBindings: [] }]
      ]),
      factRoutes: [],
      customObligations: []
    }
  };
}

/** @param {any} fixture */
function graphFrom(fixture) {
  return {
    claimsById: new Map(fixture.claims.map((/** @type {any} */ claim) => [claim.claim_id, claim])),
    factLedger: fixture.fact_ledger.map((/** @type {any} */ fact) => ({ ...fact })),
    runScope: fixture.run_scope,
    obligationCompilation: {
      contextsByViewId: new Map(Object.entries(structuredClone(fixture.contexts_by_view_id))),
      factRoutes: structuredClone(fixture.fact_routes),
      customObligations: structuredClone(fixture.custom_obligations)
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
      contextsByViewId: new Map(),
      factRoutes: [],
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
  assert.equal(result.obligations.some((/** @type {any} */ item) => item.obligation_id === 'obligation_custom_checkout'), true);
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

test('obligation ledger merges duplicate signatures without losing gates or leaking into siblings', async () => {
  const fixture = await ledgerFixture();
  const graph = graphFrom(fixture);
  graph.obligationCompilation.customObligations.push(
    {
      obligation_id: 'obligation_custom_checkout',
      kind: 'decision',
      risk: 'medium',
      scope: 'checkout',
      source_claim_ids: ['claim_blocked'],
      view_element_refs: ['view_decision#rule_checkout'],
      required_oracle_refs: ['claim_blocked'],
      required_capabilities: ['second-observer']
    },
    {
      obligation_id: 'obligation_custom_sibling',
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
  const merged = result.obligations.find((/** @type {any} */ item) => item.obligation_id === 'obligation_custom_checkout');
  const sibling = result.obligations.find((/** @type {any} */ item) => item.obligation_id === 'obligation_custom_sibling');
  assert.deepEqual(merged?.source_claim_ids, ['claim_blocked', 'claim_rule']);
  assert.deepEqual(merged?.required_oracle_refs, ['claim_blocked', 'claim_rule']);
  assert.deepEqual(merged?.required_capabilities, ['custom-observer', 'second-observer']);
  assert.deepEqual(sibling?.source_claim_ids, ['claim_exclusion']);
  assert.deepEqual(sibling?.required_capabilities, ['sibling-only']);
  assert.equal(sibling?.required_capabilities.includes('second-observer'), false);

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
    obligation_id: 'obligation_custom_dangling',
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
      contextsByViewId: new Map(viewTypes.map((type) => [
        `view_${type}`,
        ['input-domain', 'role', 'timing', 'integration'].includes(type)
          ? { responsibilityBindings: [] } : {}
      ])),
      factRoutes: [],
      customObligations: []
    }
  };

  assert.deepEqual(compileObligations(evidenceGraph, behaviorViews).obligations, []);

  const compileEmpty = () => [];
  const registry = createObligationRegistry().registerObligationStrategy('flow', compileEmpty);
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
