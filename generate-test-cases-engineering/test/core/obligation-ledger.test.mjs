import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { completeSourcePack } from '../helpers/source-pack.mjs';
import {
  compileObligations as compileObligationsProduction, ObligationCompilationError
} from '../../src/obligations/compile-obligations.mjs';
import { canonicalStringify, stableId } from '../../src/canonical.mjs';
import { validateEvidenceGraph } from '../../src/evidence.mjs';
import { createObligationRegistry } from '../../src/obligations/registry.mjs';
import { responsibilityKey } from '../../src/obligations/responsibility.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePackSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/source-pack.schema.json'
), 'utf8'));
const evidenceClaimsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json'
), 'utf8'));
const digestA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const interactionDimensions = [
  'shared-entity', 'role', 'client', 'interface-event',
  'time', 'concurrency', 'side-effect'
];
/** @type {WeakMap<object, {original:any, publicArtifact:any}>} */
const behaviorViewsByGraph = new WeakMap();

/** @param {any} graph @param {any} behaviorViews */
function compileObligations(graph, behaviorViews) {
  const entry = behaviorViewsByGraph.get(graph);
  return compileObligationsProduction(
    graph, entry && behaviorViews === entry.original ? entry.publicArtifact : behaviorViews
  );
}

/** @param {any} graph */
function publicEntry(graph) {
  const entry = behaviorViewsByGraph.get(graph);
  if (!entry) throw new TypeError('test graph has no public behavior artifact');
  return entry;
}

/** @param {any} graph */
function publicInputs(graph) {
  return publicEntry(graph).publicArtifact.obligation_inputs;
}

/** @param {any} graph */
function publicViews(graph) {
  return publicEntry(graph).publicArtifact;
}

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

const RESPONSIBILITY_TYPE = new Map([
  ['flow', 'flow-path'], ['decision', 'decision-outcome'], ['state', 'state-transition'],
  ['input-domain', 'input-partition'], ['role', 'role-permission'],
  ['timing', 'temporal-rule'], ['integration', 'integration-contract'],
  ['interaction', 'cross-module-interaction']
]);

/** @param {string} factId */
function blockedRoute(factId) {
  return {
    fact_id: factId, disposition: 'blocked',
    issue_intent: {
      missing_type: 'requirement', scope: 'checkout', answerable: true, risk: 'high',
      reasons: ['Required behavior is unresolved.'], evidence_refs: []
    }
  };
}

/** @param {string} factId @param {string} claimId */
function notApplicableRoute(factId, claimId) {
  return {
    fact_id: factId, disposition: 'not_applicable', exclusion_claim_id: claimId,
    scope: 'checkout', support_review: 'supported'
  };
}

/** @param {string} semanticKey @param {any} obligation */
function customInput(semanticKey, obligation) {
  const viewElementRefs = obligation.view_element_refs.map((/** @type {string} */ ref) => {
    const separator = ref.indexOf('#');
    return {
      view_id: decodeURIComponent(ref.slice(0, separator)),
      element_id: decodeURIComponent(ref.slice(separator + 1))
    };
  });
  return {
    responsibility_type: RESPONSIBILITY_TYPE.get(obligation.kind), semantic_key: semanticKey,
    owner: viewElementRefs.length > 0
      ? { kind: 'view-elements', view_element_refs: viewElementRefs }
      : { kind: 'facts', fact_ids: ['fact_rule'] },
    scope: obligation.scope, risk: obligation.risk,
    source_claim_ids: [...obligation.source_claim_ids],
    required_oracle_refs: [...obligation.required_oracle_refs],
    required_capabilities: [...obligation.required_capabilities]
  };
}

/** @param {any} responsibility */
function customId(responsibility) {
  const owner = responsibility.owner;
  const responsibilityKey = canonicalStringify({
    responsibility_type: responsibility.responsibility_type,
    owner: owner.kind === 'facts'
      ? { fact_ids: [...owner.fact_ids].sort(), kind: 'facts' }
      : { kind: 'view-elements', view_element_refs: [...owner.view_element_refs]
        .sort((/** @type {any} */ left, /** @type {any} */ right) => JSON.stringify(left).localeCompare(JSON.stringify(right))) },
    scope: responsibility.scope
  });
  const kind = [...RESPONSIBILITY_TYPE].find(([, type]) => type === responsibility.responsibility_type)?.[0];
  return stableId('obligation', { kind, responsibility_key: responsibilityKey });
}

/** @returns {any} */
function task3SourcePack() {
  return completeSourcePack({
    schema_version: '2.1.0', source_revision: 7,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout',
    sources: [{
      source_id: 'source_prd', kind: 'prd', version: '1', status: 'effective',
      authority: 'owner', content: 'Rule', content_digest: digestA, scope: 'checkout'
    }],
    locators: [{
      locator_id: 'locator_rule', source_id: 'source_prd', type: 'text-range',
      text_range: { start: 0, end: 4 }, content_digest: digestA, extraction_integrity: 'verified'
    }],
    source_policy: {
      rules: [{
        rule_id: 'rule_prd', source_ids: ['source_prd'], scope: 'checkout',
        authority: 'owner', status: 'effective'
      }]
    },
    decision_records: [], clarification_events: [], execution_events: []
  }, task3DirectEvidence());
}

function task3DirectEvidence() {
  return {
    schema_version: '2.1.0', source_revision: 7,
    claims: [{
      claim_id: 'claim_rule', claim_form: 'direct', level: 'E3', kind: 'requirement',
      scope: 'checkout', value: 'approved', source_locator_ids: ['locator_rule'], source_id: 'source_prd'
    }],
    fact_ledger: [{
      fact_id: 'fact_rule', claim_id: 'claim_rule', status: 'active', source_claim_ids: ['claim_rule']
    }]
  };
}

/** @param {'final' | 'temporary'} disposition */
function task3DecisionEvidence(disposition) {
  const level = disposition === 'final' ? 'E3' : 'E1';
  return {
    packDecision: {
      decision_id: 'decision_rule', question_id: 'question_rule', root_issue_ids: ['root_rule'],
      presentation_id: 'presentation_rule', decision_group_ids: ['group_rule'],
      affected_obligation_ids: [], clarification_event_seq: 1, confirmer: 'owner',
      confirmed_at: '2026-08-30T00:00:00Z', question: 'Result?', answer: 'approved',
      disposition, authority_scope: 'checkout', effective_scope: 'checkout',
      evidence_ref: 'locator_rule', evidence_level: level
    },
    artifact: {
      schema_version: '2.1.0', source_revision: 7,
      claims: [{
        claim_id: 'claim_rule', claim_form: 'decision-record', level,
        kind: disposition === 'final' ? 'requirement' : 'assumption', scope: 'checkout',
        value: 'approved', source_locator_ids: ['locator_rule'],
        decision_id: 'decision_rule', authority: 'checkout'
      }],
      fact_ledger: [{
        fact_id: 'fact_rule', claim_id: 'claim_rule', status: 'active', source_claim_ids: ['claim_rule']
      }]
    }
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
  behaviorViews.obligation_inputs.view_contexts = behaviorViews.views.map((/** @type {any} */ view) => ({
    view_id: view.view_id,
    bindings: view.elements.flatMap((/** @type {any} */ element) => [
      ...['request', 'response', 'persistence', 'event', 'callback', 'compensation'].map((kind) => ({
        selector: { kind, element_id: element.element_id }, risk: 'medium',
        source_claim_ids: ['claim_shared'], required_oracle_refs: [],
        required_capabilities: ['integration-observer']
      })),
      ...element.side_effects.map((/** @type {any} */ sideEffect) => ({
        selector: { kind: 'side-effect', element_id: element.element_id,
          side_effect_kind: sideEffect.kind, target: sideEffect.target }, risk: 'medium',
        source_claim_ids: ['claim_shared'], required_oracle_refs: [],
        required_capabilities: ['integration-observer']
      }))
    ])
  }));
  return {
    claimsById: new Map([['claim_shared', {
      claim_id: 'claim_shared', level: 'E3', kind: 'requirement', scope: '*', parent_claim_ids: []
    }]]),
    factLedger: [],
    runScope: '*'
  };
}

/** @param {any} fixture */
function graphFrom(fixture) {
  const claims = structuredClone(fixture.claims);
  const graph = {
    claimsById: new Map(claims.map((/** @type {any} */ claim) => [claim.claim_id, claim])),
    factLedger: structuredClone(fixture.fact_ledger),
    runScope: fixture.run_scope
  };
  behaviorViewsByGraph.set(graph, {
    original: fixture.behavior_views, publicArtifact: structuredClone(fixture.behavior_views)
  });
  return graph;
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
  behaviorViews.obligation_inputs = {
    view_contexts: [], terminal_fact_routes: [],
    custom_responsibilities: [], combination_requests: []
  };
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
      runScope: 'checkout'
    }
  };
}

/** @param {() => unknown} action @returns {ObligationCompilationError} */
function compilationError(action) {
  try {
    action();
  } catch (error) {
    assert.equal(error instanceof ObligationCompilationError, true, String(error));
    return /** @type {ObligationCompilationError} */ (error);
  }
  assert.fail('expected obligation compilation to require revision');
  throw new Error('unreachable after assertion failure');
}

/** @param {string} claimPrefix @param {() => unknown} action */
function countTaggedMapReads(claimPrefix, action) {
  const originalGet = Map.prototype.get;
  let reads = 0;
  Object.defineProperty(Map.prototype, 'get', {
    configurable: true,
    writable: true,
    value(/** @type {unknown} */ key) {
      if (typeof key === 'string' && key.startsWith(claimPrefix)) reads += 1;
      return originalGet.call(this, key);
    }
  });
  try {
    action();
  } finally {
    Object.defineProperty(Map.prototype, 'get', {
      configurable: true, writable: true, value: originalGet
    });
  }
  return reads;
}

test('obligation ledger compiles an empty formal scope into the frozen artifact shape', () => {
  const evidenceGraph = {
    claimsById: new Map(),
    factLedger: [],
    runScope: 'empty'
  };
  const behaviorViews = {
    schema_version: '2.1.0',
    source_revision: 0,
    views: [],
    interaction_matrix: interactionDimensions.map((dimension) => ({
      module_ids: ['empty'], dimension, status: 'checked-no-signal'
    })),
    obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: []
  };

  assert.deepEqual(compileObligations(evidenceGraph, behaviorViews), {
    schema_version: '2.1.0',
    source_revision: 0,
    obligations: [],
    fact_routes: [],
    interaction_routes: []
  });
});

test('obligation ledger consumes a real schema-valid Task 3 direct E3 snapshot', async () => {
  const fixture = await ledgerFixture();
  const sourcePack = task3SourcePack();
  const evidenceArtifact = task3DirectEvidence();
  assert.deepEqual(validateAgainstSchema(sourcePack, sourcePackSchema), []);
  assert.deepEqual(validateAgainstSchema(evidenceArtifact, evidenceClaimsSchema), []);
  const accepted = validateEvidenceGraph(sourcePack, evidenceArtifact);
  assert.deepEqual(accepted.diagnostics, []);
  const acceptedClaim = accepted.claimsById.get('claim_rule');
  assert.ok(acceptedClaim);
  assert.equal(Object.hasOwn(/** @type {Record<string, unknown>} */ (acceptedClaim), 'parent_claim_ids'), false);

  const graph = graphFrom(fixture);
  graph.claimsById = accepted.claimsById;
  graph.factLedger = structuredClone(evidenceArtifact.fact_ledger);
  publicViews(graph).source_revision = evidenceArtifact.source_revision;
  publicInputs(graph).terminal_fact_routes = [];

  const result = /** @type {any} */ (compileObligations(graph, fixture.behavior_views));
  assert.equal(result.fact_routes.length, 1);
  assert.equal(result.fact_routes[0].fact_id, 'fact_rule');
  assert.equal(result.fact_routes[0].route_type, 'obligations');

  for (const disposition of /** @type {const} */ (['final', 'temporary'])) {
    const decisionFixture = await ledgerFixture();
    const decisionSourcePack = task3SourcePack();
    const decisionInput = task3DecisionEvidence(disposition);
    decisionSourcePack.decision_records.push(decisionInput.packDecision);
    completeSourcePack(decisionSourcePack, decisionInput.artifact);
    assert.deepEqual(validateAgainstSchema(decisionSourcePack, sourcePackSchema), []);
    assert.deepEqual(validateAgainstSchema(decisionInput.artifact, evidenceClaimsSchema), []);
    const decisionAccepted = validateEvidenceGraph(decisionSourcePack, decisionInput.artifact);
    assert.deepEqual(decisionAccepted.diagnostics, []);
    const decisionClaim = decisionAccepted.claimsById.get('claim_rule');
    assert.ok(decisionClaim);
    assert.equal(Object.hasOwn(
      /** @type {Record<string, unknown>} */ (decisionClaim), 'parent_claim_ids'
    ), false);
    const decisionGraph = graphFrom(decisionFixture);
    decisionGraph.claimsById = decisionAccepted.claimsById;
    decisionGraph.factLedger = structuredClone(decisionInput.artifact.fact_ledger);
    publicViews(decisionGraph).source_revision = decisionInput.artifact.source_revision;
    publicInputs(decisionGraph).terminal_fact_routes = [];
    const decisionResult = /** @type {any} */ (compileObligations(
      decisionGraph, decisionFixture.behavior_views
    ));
    assert.equal(decisionResult.fact_routes[0].route_type, 'obligations');
  }
});

test('obligation ledger reconciles modeled, Blocked, and NotApplicable fact routes', async () => {
  const fixture = await ledgerFixture();
  const result = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));

  assert.equal(result.obligations.length, 3);
  const expectedCustomId = customId(fixture.behavior_views.obligation_inputs.custom_responsibilities[0]);
  assert.equal(result.obligations.some((/** @type {any} */ item) => item.obligation_id === expectedCustomId), true);
  const modeled = result.fact_routes.find((/** @type {any} */ route) => route.fact_id === 'fact_rule');
  assert.equal(modeled?.route_type, 'obligations');
  assert.equal(modeled?.obligation_ids.length, 2);
  assert.deepEqual(result.fact_routes.filter((/** @type {any} */ route) => route.fact_id !== 'fact_rule'), [
    {
      fact_id: 'fact_blocked', route_type: 'blocked',
      blocker_root_issue_id: stableId('root', {
        missing_type: 'requirement',
        semantic_refs: [canonicalStringify({ kind: 'facts', fact_ids: ['fact_blocked'] })],
        scope: 'checkout'
      }),
      gap_obligation_id: stableId('obligation', {
        kind: 'requirement-gap', owner: { kind: 'fact', fact_id: 'fact_blocked' },
        missing_type: 'requirement', scope: 'checkout'
      })
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
  publicInputs(missing).terminal_fact_routes = publicInputs(missing).terminal_fact_routes
    .filter((/** @type {any} */ route) => route.fact_id !== 'fact_blocked');
  const missingError = compilationError(() => compileObligations(missing, fixture.behavior_views));
  assert.equal(missingError.status, 'need_revision');
  assert.equal(missingError.diagnostics.some((item) => item.category === 'traceability'
    && item.code === 'FACT_ROUTE_MISSING' && item.path === '/fact_routes/fact_blocked'), true);

  const duplicate = graphFrom(fixture);
  publicInputs(duplicate).terminal_fact_routes.push(
    notApplicableRoute('fact_blocked', 'claim_exclusion')
  );
  const duplicateError = compilationError(() => compileObligations(duplicate, fixture.behavior_views));
  assert.equal(duplicateError.diagnostics.some((item) => item.code === 'FACT_ROUTE_MULTIPLE'), true);

  const unknown = graphFrom(fixture);
  publicInputs(unknown).terminal_fact_routes.push(blockedRoute('fact_unknown'));
  const unknownError = compilationError(() => compileObligations(unknown, fixture.behavior_views));
  assert.equal(unknownError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'FACT_ROUTE_UNKNOWN'), true);

  const exploratory = graphFrom(fixture);
  publicInputs(exploratory).terminal_fact_routes[0] = {
    fact_id: 'fact_blocked', disposition: 'exploratory', exploratory_id: 'exploratory_forbidden'
  };
  const exploratoryError = compilationError(() => compileObligations(exploratory, fixture.behavior_views));
  assert.equal(exploratoryError.diagnostics.some((item) => item.category === 'schema'
    && item.code === 'OBLIGATION_TERMINAL_ROUTE_INVALID'), true);
});

test('obligation ledger enforces Blocked/NotApplicable exclusivity and route references', async () => {
  const fixture = await ledgerFixture();
  const modeledAndBlocked = graphFrom(fixture);
  publicInputs(modeledAndBlocked).terminal_fact_routes.push(blockedRoute('fact_rule'));
  const multipleError = compilationError(() => compileObligations(modeledAndBlocked, fixture.behavior_views));
  assert.equal(multipleError.diagnostics.some((item) => item.code === 'FACT_ROUTE_MULTIPLE'), true);

  const danglingExclusion = graphFrom(fixture);
  publicInputs(danglingExclusion).terminal_fact_routes[1] = notApplicableRoute(
    'fact_not_applicable', 'claim_missing'
  );
  const danglingError = compilationError(() => compileObligations(danglingExclusion, fixture.behavior_views));
  assert.equal(danglingError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'NOT_APPLICABLE_CLAIM_DANGLING'), true);
});

test('obligation ledger requires an independent supported E3/E2 review before NotApplicable can resolve Task 4', async () => {
  const fixture = await ledgerFixture();

  const missingReview = graphFrom(fixture);
  publicInputs(missingReview).terminal_fact_routes = publicInputs(missingReview).terminal_fact_routes
    .filter((/** @type {any} */ route) => route.fact_id !== 'fact_not_applicable');
  const missingError = compilationError(() => compileObligations(missingReview, fixture.behavior_views));
  assert.equal(missingError.diagnostics.some((item) => item.code === 'FACT_ROUTE_MISSING'
    && item.path === '/fact_routes/fact_not_applicable'), true);

  const temporary = graphFrom(fixture);
  Object.assign(temporary.claimsById.get('claim_exclusion'), { level: 'E1', kind: 'assumption' });
  const temporaryError = compilationError(() => compileObligations(temporary, fixture.behavior_views));
  assert.equal(temporaryError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_CLAIM_LEVEL_INVALID'), true);

  const wrongScope = graphFrom(fixture);
  wrongScope.claimsById.get('claim_exclusion').scope = 'other-scope';
  const scopeError = compilationError(() => compileObligations(wrongScope, fixture.behavior_views));
  assert.equal(scopeError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_SCOPE_MISMATCH'), true);

  const notIndependent = graphFrom(fixture);
  publicInputs(notIndependent).terminal_fact_routes[1].exclusion_claim_id = 'claim_not_applicable';
  const independentError = compilationError(() => compileObligations(notIndependent, fixture.behavior_views));
  assert.equal(independentError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT'), true);

  const unsupported = graphFrom(fixture);
  publicInputs(unsupported).terminal_fact_routes[1].support_review = 'unsupported';
  const unsupportedError = compilationError(() => compileObligations(unsupported, fixture.behavior_views));
  assert.equal(unsupportedError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_REVIEW_INVALID'), true);

  const duplicate = graphFrom(fixture);
  publicInputs(duplicate).terminal_fact_routes.push(
    notApplicableRoute('fact_not_applicable', 'claim_exclusion')
  );
  const duplicateError = compilationError(() => compileObligations(duplicate, fixture.behavior_views));
  assert.equal(duplicateError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_REVIEW_MULTIPLE'), true);

  const unknown = graphFrom(fixture);
  publicInputs(unknown).terminal_fact_routes.push(
    notApplicableRoute('fact_unknown', 'claim_exclusion')
  );
  const unknownError = compilationError(() => compileObligations(unknown, fixture.behavior_views));
  assert.equal(unknownError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_REVIEW_UNKNOWN'), true);

  const derived = graphFrom(fixture);
  derived.claimsById.set('claim_exclusion_parent', {
    claim_id: 'claim_exclusion_parent', level: 'E3', kind: 'requirement', scope: 'checkout'
  });
  Object.assign(derived.claimsById.get('claim_exclusion'), {
    level: 'E2', kind: 'test-data', derivation_kind: 'enumeration-complement',
    derivation_target: 'test-data', parent_claim_ids: ['claim_exclusion_parent']
  });
  const derivedResult = /** @type {any} */ (compileObligations(derived, fixture.behavior_views));
  assert.equal(derivedResult.fact_routes.some((/** @type {any} */ route) => route.fact_id === 'fact_not_applicable'
    && route.route_type === 'not_applicable'), true);
});

test('obligation ledger rejects malformed evidence identity', async () => {
  const fixture = await ledgerFixture();

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

test('obligation ledger normalizes only own accepted claim fields and rejects cycles', async () => {
  const fixture = await ledgerFixture();

  const prototypeGraph = graphFrom(fixture);
  let inheritedReads = 0;
  const forgedPrototype = {};
  for (const [field, value] of [['level', 'E3'], ['kind', 'requirement'], ['scope', 'checkout']]) {
    Object.defineProperty(forgedPrototype, field, {
      get() {
        inheritedReads += 1;
        return value;
      }
    });
  }
  const forgedClaim = Object.assign(Object.create(forgedPrototype), {
    claim_id: 'claim_rule', parent_claim_ids: []
  });
  prototypeGraph.claimsById.set('claim_rule', forgedClaim);
  const prototypeError = compilationError(() => compileObligations(prototypeGraph, fixture.behavior_views));
  assert.equal(prototypeError.diagnostics.some((item) => item.code === 'EVIDENCE_CLAIM_PROTOTYPE_INVALID'), true);
  assert.equal(inheritedReads, 0);

  const invalidEnum = graphFrom(fixture);
  invalidEnum.claimsById.set('claim_invalid_enum', {
    claim_id: 'claim_invalid_enum', level: 'E4', kind: 'requirement', scope: 'checkout', parent_claim_ids: []
  });
  const enumError = compilationError(() => compileObligations(invalidEnum, fixture.behavior_views));
  assert.equal(enumError.diagnostics.some((item) => item.code === 'EVIDENCE_CLAIM_FIELDS_INVALID'), true);

  const missingParents = graphFrom(fixture);
  missingParents.claimsById.set('claim_missing_own_parents', {
    claim_id: 'claim_missing_own_parents', level: 'E2', kind: 'model-element', scope: 'checkout',
    derivation_kind: 'graph-reachability', derivation_target: 'model-element'
  });
  const parentError = compilationError(() => compileObligations(missingParents, fixture.behavior_views));
  assert.equal(parentError.diagnostics.some((item) => item.code === 'EVIDENCE_CLAIM_PARENTS_INVALID'), true);

  const forgedDerivation = graphFrom(fixture);
  forgedDerivation.claimsById.set('claim_forged_derivation', {
    claim_id: 'claim_forged_derivation', level: 'E2', kind: 'model-element', scope: 'checkout',
    parent_claim_ids: ['claim_rule'], derivation_kind: new String('graph-reachability'),
    derivation_target: 'model-element'
  });
  const derivationError = compilationError(() => compileObligations(forgedDerivation, fixture.behavior_views));
  assert.equal(derivationError.diagnostics.some(
    (item) => item.code === 'EVIDENCE_CLAIM_DERIVATION_INVALID'
  ), true);

  const impossibleDerivation = graphFrom(fixture);
  impossibleDerivation.claimsById.set('claim_impossible_derivation', {
    claim_id: 'claim_impossible_derivation', level: 'E2', kind: 'model-element', scope: 'checkout',
    parent_claim_ids: ['claim_rule'], derivation_kind: 'formula', derivation_target: 'model-element'
  });
  const targetError = compilationError(() => compileObligations(impossibleDerivation, fixture.behavior_views));
  assert.equal(targetError.diagnostics.some(
    (item) => item.code === 'EVIDENCE_CLAIM_DERIVATION_INVALID'
  ), true);

  const getterBoom = graphFrom(fixture);
  const accessorClaim = {
    claim_id: 'claim_accessor', level: 'E3', kind: 'requirement', parent_claim_ids: []
  };
  Object.defineProperty(accessorClaim, 'scope', {
    enumerable: true,
    get() {
      throw new Error('getter boom');
    }
  });
  getterBoom.claimsById.set('claim_accessor', accessorClaim);
  const getterError = compilationError(() => compileObligations(getterBoom, fixture.behavior_views));
  assert.equal(getterError.diagnostics.some(
    (item) => item.code === 'EVIDENCE_CLAIM_DESCRIPTOR_INVALID'
  ), true);

  const changing = graphFrom(fixture);
  let scopeReads = 0;
  const changingClaim = {
    claim_id: 'claim_changing', level: 'E3', kind: 'requirement', parent_claim_ids: []
  };
  Object.defineProperty(changingClaim, 'scope', {
    enumerable: true,
    get() {
      scopeReads += 1;
      return scopeReads === 1 ? 'checkout' : 'shipping';
    }
  });
  changing.claimsById.set('claim_changing', changingClaim);
  const changingError = compilationError(() => compileObligations(changing, fixture.behavior_views));
  assert.equal(changingError.diagnostics.some(
    (item) => item.code === 'EVIDENCE_CLAIM_DESCRIPTOR_INVALID'
  ), true);
  assert.equal(scopeReads, 0);

  const cycle = graphFrom(fixture);
  cycle.claimsById.set('claim_cycle_a', {
    claim_id: 'claim_cycle_a', level: 'E2', kind: 'model-element', scope: 'checkout',
    parent_claim_ids: ['claim_cycle_b'], derivation_kind: 'graph-reachability',
    derivation_target: 'model-element'
  });
  cycle.claimsById.set('claim_cycle_b', {
    claim_id: 'claim_cycle_b', level: 'E2', kind: 'model-element', scope: 'checkout',
    parent_claim_ids: ['claim_cycle_a'], derivation_kind: 'graph-reachability',
    derivation_target: 'model-element'
  });
  const cycleError = compilationError(() => compileObligations(cycle, fixture.behavior_views));
  assert.equal(cycleError.diagnostics.some((item) => item.code === 'EVIDENCE_CLAIM_CYCLE'), true);
});

test('obligation ledger requires an own nonblank unpadded run scope', async () => {
  const fixture = await ledgerFixture();

  const padded = graphFrom(fixture);
  padded.runScope = ' checkout';
  const paddedError = compilationError(() => compileObligations(padded, fixture.behavior_views));
  assert.equal(paddedError.diagnostics.some((item) => item.code === 'EVIDENCE_RUN_SCOPE_INVALID'), true);

  const inherited = graphFrom(fixture);
  delete inherited.runScope;
  Object.setPrototypeOf(inherited, { runScope: 'checkout' });
  const inheritedError = compilationError(() => compileObligations(inherited, fixture.behavior_views));
  assert.equal(inheritedError.diagnostics.some((item) => item.code === 'EVIDENCE_RUN_SCOPE_INVALID'), true);
});

test('obligation ledger rejects duplicate custom responsibilities without leaking gates into siblings', async () => {
  const fixture = await ledgerFixture();
  const graph = graphFrom(fixture);
  graph.claimsById.set('claim_rule_expected', {
    claim_id: 'claim_rule_expected', level: 'E2', kind: 'expected-value', scope: 'checkout',
    parent_claim_ids: ['claim_rule'], derivation_kind: 'decision-table-instance',
    derivation_target: 'expected-value'
  });
  const siblingInput = customInput('sibling-only', {
    kind: 'interaction', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_rule'], view_element_refs: [],
    required_oracle_refs: [], required_capabilities: ['sibling-only']
  });
  publicInputs(graph).custom_responsibilities.push(
    customInput('custom-checkout-observer', {
      kind: 'decision',
      risk: 'medium',
      scope: 'checkout',
      source_claim_ids: ['claim_rule_expected'],
      view_element_refs: ['view_decision#rule_checkout'],
      required_oracle_refs: ['claim_rule_expected'],
      required_capabilities: ['second-observer']
    }),
    siblingInput
  );

  const error = compilationError(() => compileObligations(graph, fixture.behavior_views));
  assert.equal(error.diagnostics.some(
    (item) => item.code === 'CUSTOM_RESPONSIBILITY_DUPLICATE'
  ), true);

  const reordered = graphFrom(fixture);
  reordered.claimsById.set(
    'claim_rule_expected', structuredClone(graph.claimsById.get('claim_rule_expected'))
  );
  publicInputs(reordered).custom_responsibilities.push(
    structuredClone(publicInputs(graph).custom_responsibilities[1]),
    structuredClone(publicInputs(graph).custom_responsibilities[2])
  );
  publicInputs(reordered).custom_responsibilities.reverse();
  assert.deepEqual(
    compilationError(() => compileObligations(reordered, fixture.behavior_views)).diagnostics,
    error.diagnostics
  );

  const siblingGraph = graphFrom(fixture);
  publicInputs(siblingGraph).custom_responsibilities.push(siblingInput);
  const siblingResult = /** @type {any} */ (compileObligations(siblingGraph, fixture.behavior_views));
  const sibling = siblingResult.obligations.find(
    (/** @type {any} */ item) => item.obligation_id === customId(siblingInput)
  );
  assert.deepEqual(sibling?.source_claim_ids, ['claim_rule']);
  assert.deepEqual(sibling?.required_capabilities, ['sibling-only']);
  assert.equal(sibling?.required_capabilities.includes('second-observer'), false);

  const conflict = graphFrom(fixture);
  publicInputs(conflict).custom_responsibilities.push({
    ...structuredClone(publicInputs(conflict).custom_responsibilities[0]), risk: 'critical'
  });
  const conflictError = compilationError(() => compileObligations(conflict, fixture.behavior_views));
  assert.equal(conflictError.diagnostics.some(
    (item) => item.code === 'CUSTOM_RESPONSIBILITY_DUPLICATE'
  ), true);
});

test('obligation ledger rejects custom obligations with dangling or ambiguous input references', async () => {
  const fixture = await ledgerFixture();

  const dangling = graphFrom(fixture);
  publicInputs(dangling).custom_responsibilities.push(customInput('dangling-owner', {
    kind: 'decision',
    risk: 'low',
    scope: 'checkout',
    source_claim_ids: ['claim_missing'],
    view_element_refs: ['view_decision#element_missing'],
    required_oracle_refs: ['claim_missing'],
    required_capabilities: []
  }));
  const danglingError = compilationError(() => compileObligations(dangling, fixture.behavior_views));
  assert.equal(danglingError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'CUSTOM_OBLIGATION_CLAIM_DANGLING'), true);
  assert.equal(danglingError.diagnostics.some((item) => item.category === 'reference'
    && item.code === 'CUSTOM_OBLIGATION_VIEW_ELEMENT_DANGLING'), true);

  const openInput = graphFrom(fixture);
  publicInputs(openInput).custom_responsibilities[0].unexpected = true;
  const openError = compilationError(() => compileObligations(openInput, fixture.behavior_views));
  assert.equal(openError.diagnostics.some((item) => item.category === 'schema'
    && item.code === 'OBLIGATION_CUSTOM_RESPONSIBILITY_INVALID'), true);
});

test('obligation ledger rejects custom system collisions and conflicting semantic owners', async () => {
  const fixture = await ledgerFixture();
  const base = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  const system = base.obligations.find((/** @type {any} */ obligation) => (
    obligation.kind === 'decision' && obligation.required_capabilities.length === 0
  ));
  const collision = graphFrom(fixture);
  publicInputs(collision).custom_responsibilities.push(customInput('system-semantic-clone', structuredClone(system)));
  const collisionError = compilationError(() => compileObligations(collision, fixture.behavior_views));
  assert.equal(collisionError.diagnostics.some(
    (item) => item.code === 'CUSTOM_OBLIGATION_SYSTEM_SEMANTIC_COLLISION'
  ), true);

  const ownerFixture = structuredClone(fixture);
  ownerFixture.claims.push({
    claim_id: 'claim_other_owner', level: 'E3', kind: 'requirement', scope: 'checkout', parent_claim_ids: []
  });
  ownerFixture.fact_ledger.push({
    fact_id: 'fact_other_owner', claim_id: 'claim_other_owner', status: 'active',
    source_claim_ids: ['claim_other_owner']
  });
  ownerFixture.behavior_views.views[0].source_claim_ids.push('claim_other_owner');
  ownerFixture.behavior_views.views[0].elements.push({
    element_id: 'rule_other', kind: 'decision-rule', conditions: ['other condition'],
    result: 'other result', priority: 1, source_claim_ids: ['claim_other_owner'], model_refs: []
  });
  const ownerConflict = graphFrom(ownerFixture);
  publicInputs(ownerConflict).custom_responsibilities = [];
  const firstOwner = customInput('shared-owner-key', {
    kind: 'decision', risk: 'low', scope: 'checkout', source_claim_ids: ['claim_rule'],
    view_element_refs: ['view_decision#rule_checkout'], required_oracle_refs: ['claim_rule'], required_capabilities: []
  });
  publicInputs(ownerConflict).custom_responsibilities.push(
    firstOwner,
    customInput('shared-owner-key', {
      kind: 'decision', risk: 'low', scope: 'checkout',
      source_claim_ids: ['claim_other_owner'], view_element_refs: ['view_decision#rule_other'],
      required_oracle_refs: ['claim_other_owner'], required_capabilities: []
    })
  );
  const ownerResult = /** @type {any} */ (compileObligations(ownerConflict, ownerFixture.behavior_views));
  assert.equal(ownerResult.obligations.some((/** @type {any} */ item) => item.obligation_id === customId(firstOwner)), true);

  const siblingLeak = graphFrom(ownerFixture);
  const bipartiteInput = customInput('bipartite-owner', {
    kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_rule', 'claim_other_owner'],
    view_element_refs: ['view_decision#rule_checkout', 'view_decision#rule_other'],
    required_oracle_refs: ['claim_rule', 'claim_other_owner'], required_capabilities: []
  });
  publicInputs(siblingLeak).custom_responsibilities.push(bipartiteInput);
  const siblingResult = /** @type {any} */ (compileObligations(siblingLeak, ownerFixture.behavior_views));
  assert.equal(siblingResult.obligations.some(
    (/** @type {any} */ item) => item.obligation_id === customId(bipartiteInput)
  ), true);

  const sourceOwner = graphFrom(fixture);
  const firstSourceOwner = customInput('shared-source-owner', {
      kind: 'interaction', risk: 'low', scope: 'checkout',
      source_claim_ids: ['claim_rule'], view_element_refs: [], required_oracle_refs: [], required_capabilities: []
    });
  const secondSourceOwner = customInput('shared-source-owner', {
      kind: 'interaction', risk: 'low', scope: 'checkout',
      source_claim_ids: ['claim_rule'], view_element_refs: [], required_oracle_refs: [], required_capabilities: []
    });
  publicInputs(sourceOwner).custom_responsibilities.push(firstSourceOwner, secondSourceOwner);
  assert.equal(customId(firstSourceOwner), customId(secondSourceOwner));
  const sourceOwnerError = compilationError(() => compileObligations(sourceOwner, fixture.behavior_views));
  assert.equal(sourceOwnerError.diagnostics.some(
    (item) => item.code === 'CUSTOM_RESPONSIBILITY_DUPLICATE'
  ), true);
});

test('obligation ledger rejects custom evidence poison, invalid Oracles, and unrelated owner ancestry', async () => {
  const fixture = await ledgerFixture();

  const unrelated = graphFrom(fixture);
  publicInputs(unrelated).custom_responsibilities.push(customInput('unrelated-owner', {
    kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_blocked'], view_element_refs: ['view_decision#rule_checkout'],
    required_oracle_refs: ['claim_blocked'], required_capabilities: []
  }));
  const unrelatedError = compilationError(() => compileObligations(unrelated, fixture.behavior_views));
  assert.equal(unrelatedError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_SOURCE_UNRELATED'), true);
  assert.equal(unrelatedError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_ORACLE_UNRELATED'), true);

  const invalidOracle = graphFrom(fixture);
  invalidOracle.claimsById.set('claim_test_data', {
    claim_id: 'claim_test_data', level: 'E2', kind: 'test-data', scope: 'checkout',
    derivation_kind: 'boundary-representative', derivation_target: 'test-data', parent_claim_ids: ['claim_rule']
  });
  publicInputs(invalidOracle).custom_responsibilities.push(customInput('invalid-oracle', {
    kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_rule', 'claim_test_data'], view_element_refs: ['view_decision#rule_checkout'],
    required_oracle_refs: ['claim_test_data'], required_capabilities: []
  }));
  const oracleError = compilationError(() => compileObligations(invalidOracle, fixture.behavior_views));
  assert.equal(oracleError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_ORACLE_INVALID'), true);

  const wrongScope = graphFrom(fixture);
  wrongScope.claimsById.set('claim_wrong_scope', {
    claim_id: 'claim_wrong_scope', level: 'E3', kind: 'requirement', scope: 'other', parent_claim_ids: []
  });
  publicInputs(wrongScope).custom_responsibilities.push(customInput('wrong-scope', {
    kind: 'interaction', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_wrong_scope'], view_element_refs: [],
    required_oracle_refs: ['claim_wrong_scope'], required_capabilities: []
  }));
  const scopeError = compilationError(() => compileObligations(wrongScope, fixture.behavior_views));
  assert.equal(scopeError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_CLAIM_SCOPE_MISMATCH'), true);
});

test('obligation ledger binds custom stable IDs to responsibility types and qualified owners', async () => {
  const fixture = await ledgerFixture();

  const duplicateSemantic = graphFrom(fixture);
  publicInputs(duplicateSemantic).custom_responsibilities.push(
    structuredClone(publicInputs(duplicateSemantic).custom_responsibilities[0])
  );
  const duplicateError = compilationError(() => compileObligations(duplicateSemantic, fixture.behavior_views));
  assert.equal(duplicateError.diagnostics.some(
    (item) => item.code === 'CUSTOM_RESPONSIBILITY_DUPLICATE'
  ), true);

  const distinct = graphFrom(fixture);
  const secondResponsibility = customInput('custom-checkout-audit', {
    kind: 'interaction', risk: 'medium', scope: 'checkout', source_claim_ids: ['claim_rule'],
    view_element_refs: [], required_oracle_refs: ['claim_rule'],
    required_capabilities: ['audit-observer']
  });
  publicInputs(distinct).custom_responsibilities.push(secondResponsibility);
  const distinctResult = /** @type {any} */ (compileObligations(distinct, fixture.behavior_views));
  assert.notEqual(
    customId(publicInputs(distinct).custom_responsibilities[0]),
    customId(secondResponsibility)
  );
  assert.deepEqual(distinctResult.obligations.find(
    (/** @type {any} */ item) => item.obligation_id === customId(secondResponsibility)
  )?.required_capabilities, ['audit-observer']);

  const ownerFixture = structuredClone(fixture);
  ownerFixture.claims.push({
    claim_id: 'claim_other_owner', level: 'E3', kind: 'requirement', scope: 'checkout', parent_claim_ids: []
  });
  ownerFixture.fact_ledger.push({
    fact_id: 'fact_other_owner', claim_id: 'claim_other_owner', status: 'active',
    source_claim_ids: ['claim_other_owner']
  });
  ownerFixture.behavior_views.views[0].source_claim_ids.push('claim_other_owner');
  ownerFixture.behavior_views.views[0].elements.push({
    element_id: 'rule_other', kind: 'decision-rule', conditions: ['other'], result: 'other', priority: 1,
    source_claim_ids: ['claim_other_owner'], model_refs: []
  });
  const firstOwner = customInput('cross-call-owner', {
    kind: 'decision', risk: 'low', scope: 'checkout', source_claim_ids: ['claim_rule'],
    view_element_refs: ['view_decision#rule_checkout'], required_oracle_refs: ['claim_rule'], required_capabilities: []
  });
  const firstGraph = graphFrom(ownerFixture);
  publicInputs(firstGraph).custom_responsibilities = [firstOwner];
  compileObligations(firstGraph, ownerFixture.behavior_views);
  const secondGraph = graphFrom(ownerFixture);
  const secondOwner = customInput('cross-call-owner', {
    kind: 'decision', risk: 'low', scope: 'checkout', source_claim_ids: ['claim_other_owner'],
    view_element_refs: ['view_decision#rule_other'], required_oracle_refs: ['claim_other_owner'], required_capabilities: []
  });
  publicInputs(secondGraph).custom_responsibilities = [secondOwner];
  assert.notEqual(customId(firstOwner), customId(secondOwner));
  compileObligations(secondGraph, ownerFixture.behavior_views);

  const sourceOwnedA = customInput('source-owned', {
    kind: 'interaction', risk: 'low', scope: 'checkout', source_claim_ids: ['claim_rule'],
    view_element_refs: [], required_oracle_refs: ['claim_rule'], required_capabilities: []
  });
  const sourceOwnedB = customInput('source-owned', {
    kind: 'interaction', risk: 'low', scope: 'checkout', source_claim_ids: ['claim_rule_model'],
    view_element_refs: [], required_oracle_refs: [], required_capabilities: []
  });
  assert.equal(customId(sourceOwnedA), customId(sourceOwnedB));
  const sourceGraphA = graphFrom(fixture);
  publicInputs(sourceGraphA).custom_responsibilities = [sourceOwnedA];
  const sourceGraphB = graphFrom(fixture);
  sourceGraphB.claimsById.set('claim_rule_model', {
    claim_id: 'claim_rule_model', level: 'E2', kind: 'model-element', scope: 'checkout',
    parent_claim_ids: ['claim_rule'], derivation_kind: 'graph-reachability',
    derivation_target: 'model-element'
  });
  publicInputs(sourceGraphB).custom_responsibilities = [sourceOwnedB];
  assert.equal(/** @type {any} */ (compileObligations(sourceGraphA, fixture.behavior_views))
    .obligations.some((/** @type {any} */ item) => item.obligation_id === customId(sourceOwnedA)), true);
  assert.equal(/** @type {any} */ (compileObligations(sourceGraphB, fixture.behavior_views))
    .obligations.some((/** @type {any} */ item) => item.obligation_id === customId(sourceOwnedB)), true);
});

test('custom audit labels cannot isolate one real responsibility into multiple obligations', async () => {
  const fixture = await ledgerFixture();
  const graph = graphFrom(fixture);
  const duplicate = structuredClone(publicInputs(graph).custom_responsibilities[0]);
  duplicate.semantic_key = 'a-different-audit-label';
  publicInputs(graph).custom_responsibilities.push(duplicate);

  const error = compilationError(() => compileObligations(graph, fixture.behavior_views));
  assert.equal(error.diagnostics.some(
    (item) => item.code === 'CUSTOM_RESPONSIBILITY_DUPLICATE'
  ), true);
});

test('obligation ledger consumes every audited interaction disposition into one frozen route', async () => {
  const behaviorViews = await interactionFixture();
  const result = /** @type {any} */ (compileObligations(interactionGraph(behaviorViews), behaviorViews));
  const blockedCandidate = behaviorViews.interaction_candidates.find(
    (/** @type {any} */ candidate) => candidate.candidate_id === 'candidate_blocked'
  );
  const subject = {
    kind: 'interactions', module_ids: ['orders', 'payments'], dimension: 'role',
    semantic_subject_refs: blockedCandidate.semantic_subject_refs
  };
  const signature = {
    missing_type: blockedCandidate.issue_intent.missing_type,
    semantic_refs: [canonicalStringify(subject)], scope: blockedCandidate.issue_intent.scope
  };
  const rootIssueId = stableId('root', signature);
  const gapObligationId = stableId('obligation', {
    kind: 'requirement-gap', owner: { kind: 'interaction', subject },
    missing_type: blockedCandidate.issue_intent.missing_type,
    scope: blockedCandidate.issue_intent.scope
  });

  assert.equal(result.obligations.length, 8);
  assert.equal(result.obligations.every((/** @type {any} */ obligation) => obligation.required_oracle_refs.length === 0), true);
  assert.equal(result.obligations.some((/** @type {any} */ obligation) => (
    obligation.obligation_id === gapObligationId && obligation.caseable === false
  )), true);
  assert.deepEqual(result.interaction_routes, [
    {
      candidate_id: 'candidate_blocked', route_type: 'blocked',
      blocker_root_issue_id: rootIssueId, gap_obligation_id: gapObligationId
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
    && (item.code === 'CANDIDATE_DISPOSITION_NOT_EXACT' || item.code === 'ONE_OF_MISMATCH')), true,
    JSON.stringify(multipleError.diagnostics));

  const dangling = await interactionFixture();
  dangling.interaction_candidates[0].formal_view_id = 'view_missing';
  const danglingError = compilationError(() => compileObligations(
    interactionGraph(dangling), dangling
  ));
  assert.equal(danglingError.diagnostics.some(
    (item) => item.code === 'FORMAL_INTERACTION_VIEW_DANGLING'
  ), true, JSON.stringify(danglingError.diagnostics));

  const noSignal = await interactionFixture();
  noSignal.interaction_candidates[0].dimension = 'time';
  const noSignalError = compilationError(() => compileObligations(
    interactionGraph(noSignal), noSignal
  ));
  assert.equal(noSignalError.diagnostics.some(
    (item) => item.code === 'INTERACTION_CANDIDATE_ON_NO_SIGNAL'
  ), true, JSON.stringify(noSignalError.diagnostics));
  assert.equal(noSignalError.diagnostics.some(
    (item) => item.code === 'INTERACTION_CANDIDATE_MISSING'
  ), true, JSON.stringify(noSignalError.diagnostics));
});

test('obligation ledger orchestrates the closed seven-strategy registry and rejects unknown or duplicate registrations', () => {
  const viewTypes = ['flow', 'decision', 'state', 'input-domain', 'role', 'timing', 'integration'];
  const behaviorViews = {
    schema_version: '2.1.0',
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
    obligation_inputs: {
      view_contexts: ['input-domain', 'role', 'timing', 'integration'].map((type) => ({
        view_id: `view_${type}`, bindings: []
      })),
      terminal_fact_routes: [], custom_responsibilities: [], combination_requests: []
    }, interaction_candidates: []
  };
  const evidenceGraph = {
    claimsById: new Map(),
    factLedger: [],
    runScope: 'all-types'
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

test('obligation ledger ignores removed hidden contexts and rejects sparse public route arrays', async () => {
  const fixture = await ledgerFixture();
  const injected = graphFrom(fixture);
  /** @type {any} */ (injected).obligationCompilation = {
    contextsByViewId: new Map([['view_decision', { claimsById: new Map() }]])
  };
  assert.deepEqual(
    compileObligations(injected, fixture.behavior_views),
    compileObligations(graphFrom(fixture), fixture.behavior_views)
  );

  const sparseRouteInput = graphFrom(fixture);
  /** @type {any[]} */ (publicInputs(sparseRouteInput).terminal_fact_routes).push(null);
  const sparseError = compilationError(() => compileObligations(sparseRouteInput, fixture.behavior_views));
  assert.equal(sparseError.diagnostics.some((item) => item.category === 'schema'
    && item.code === 'OBLIGATION_RESERVED_INPUT_INVALID'), true);

  for (const field of ['terminal_fact_routes', 'custom_responsibilities', 'combination_requests']) {
    const holeInput = graphFrom(fixture);
    publicInputs(holeInput)[field].length += 1;
    const holeError = compilationError(() => compileObligations(holeInput, fixture.behavior_views));
    assert.equal(holeError.diagnostics.some(
      (item) => item.code === 'OBLIGATION_RESERVED_INPUT_INVALID'
        && item.path === `/obligation_inputs/${field}`
    ), true);
  }
});

test('obligation ledger rejects whitespace in public custom responsibilities', async () => {
  const fixture = await ledgerFixture();

  const custom = graphFrom(fixture);
  publicInputs(custom).custom_responsibilities[0].scope = ' checkout';
  publicInputs(custom).custom_responsibilities[0].required_capabilities = [' '];
  const customError = compilationError(() => compileObligations(custom, fixture.behavior_views));
  assert.equal(customError.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_STRINGS_INVALID'), true);

  const behaviorViews = await interactionFixture();
  behaviorViews.interaction_candidates[1].blocker_root_issue_id = ' root_cross_role';
  const interactionError = compilationError(() => compileObligations(interactionGraph(behaviorViews), behaviorViews));
  assert.equal(interactionError.diagnostics.some((item) => item.code === 'BEHAVIOR_STRING_INVALID'), true);
});

test('obligation ledger rejects unknown and forbidden public view contexts', async () => {
  const fixture = await ledgerFixture();

  const unknown = graphFrom(fixture);
  publicInputs(unknown).view_contexts.push({ view_id: 'view_unknown', bindings: [] });
  const unknownError = compilationError(() => compileObligations(unknown, fixture.behavior_views));
  assert.equal(unknownError.diagnostics.some((item) => item.code === 'OBLIGATION_VIEW_CONTEXT_UNKNOWN'), true);

  const forbidden = graphFrom(fixture);
  publicInputs(forbidden).view_contexts.push({ view_id: 'view_decision', bindings: [] });
  const forbiddenError = compilationError(() => compileObligations(forbidden, fixture.behavior_views));
  assert.equal(forbiddenError.diagnostics.some(
    (item) => item.code === 'OBLIGATION_VIEW_CONTEXT_TYPE_FORBIDDEN'
  ), true);
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

  const sparseDos = structuredClone(fixture.behavior_views);
  sparseDos.views = new Array(50_000);
  const dosError = compilationError(() => compileObligations(graphFrom(fixture), sparseDos));
  assert.equal(dosError.diagnostics.filter((item) => item.code === 'BEHAVIOR_ARRAY_SPARSE').length, 1);
  assert.ok(dosError.diagnostics.length < 20);
});

test('obligation ledger rejects padded persisted behavior IDs, refs, and scopes', async () => {
  const fixture = await ledgerFixture();

  const scope = structuredClone(fixture.behavior_views);
  scope.views[0].scope = ' checkout';
  const scopeError = compilationError(() => compileObligations(graphFrom(fixture), scope));
  assert.equal(scopeError.diagnostics.some((item) => item.code === 'BEHAVIOR_STRING_INVALID'), true);

  const element = structuredClone(fixture.behavior_views);
  element.views[0].elements[0].element_id = ' rule_checkout';
  const elementGraph = graphFrom(fixture);
  const elementError = compilationError(() => compileObligations(elementGraph, element));
  assert.equal(elementError.diagnostics.some((item) => item.code === 'BEHAVIOR_STRING_INVALID'), true);

  const matrix = structuredClone(fixture.behavior_views);
  matrix.interaction_matrix[0].module_ids = [' checkout'];
  const matrixError = compilationError(() => compileObligations(graphFrom(fixture), matrix));
  assert.equal(matrixError.diagnostics.some((item) => item.code === 'BEHAVIOR_STRING_INVALID'), true);
});

test('obligation ledger preserves schema-valid padded free and protocol text', async () => {
  const fixture = await ledgerFixture();
  fixture.behavior_views.views[0].elements[0].result = ' approved result ';

  const result = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  assert.equal(result.fact_routes.some((/** @type {any} */ route) => route.fact_id === 'fact_rule'), true);
});

test('obligation ledger round-trips qualified refs containing hash, percent, and NUL characters', async () => {
  const fixture = await ledgerFixture();
  const viewId = 'view#decision%owner\0';
  const elementId = 'rule#checkout%owner\0';
  const qualifiedRef = `${encodeURIComponent(viewId)}#${encodeURIComponent(elementId)}`;
  fixture.behavior_views.views[0].view_id = viewId;
  fixture.behavior_views.views[0].elements[0].element_id = elementId;
  fixture.behavior_views.obligation_inputs.custom_responsibilities = [];

  const systemResult = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  assert.equal(systemResult.obligations.some(
    (/** @type {any} */ obligation) => obligation.view_element_refs.includes(qualifiedRef)
  ), true);
  assert.equal(systemResult.fact_routes.find((/** @type {any} */ item) => item.fact_id === 'fact_rule')
    .obligation_ids.length, 1);

  const custom = customInput('encoded-owner', {
    kind: 'decision', risk: 'low', scope: 'checkout', source_claim_ids: ['claim_rule'],
    view_element_refs: [qualifiedRef], required_oracle_refs: ['claim_rule'], required_capabilities: []
  });
  fixture.behavior_views.obligation_inputs.custom_responsibilities = [custom];
  const customResult = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  assert.equal(customResult.obligations.some(
    (/** @type {any} */ item) => item.obligation_id === customId(custom)
  ), true);
});

test('obligation ledger returns frozen-schema diagnostics instead of an invalid artifact', async () => {
  const fixture = await ledgerFixture();
  const graph = graphFrom(fixture);
  publicInputs(graph).custom_responsibilities[0].risk = 'not-a-risk';

  const error = compilationError(() => compileObligations(graph, fixture.behavior_views));
  assert.equal(error.stage, 'test_obligations');
  assert.equal(error.diagnostics.some((item) => item.category === 'schema'
    && item.path.includes('/obligations/')), true);

  const lossy = graphFrom(fixture);
  publicInputs(lossy).custom_responsibilities[0].required_capabilities = [42];
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
  reordered.behavior_views.obligation_inputs.terminal_fact_routes.reverse();
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
  publicInputs(first).terminal_fact_routes.push(blockedRoute('fact_blocked'));
  publicInputs(first).terminal_fact_routes.push(blockedRoute('fact_unknown'));
  const second = graphFrom(fixture);
  publicInputs(second).terminal_fact_routes = structuredClone(
    publicInputs(first).terminal_fact_routes
  ).reverse();

  const firstError = compilationError(() => compileObligations(first, fixture.behavior_views));
  const secondError = compilationError(() => compileObligations(second, fixture.behavior_views));
  assert.deepEqual(
    secondError.diagnostics.map(({ path, ...diagnostic }) => diagnostic),
    firstError.diagnostics.map(({ path, ...diagnostic }) => diagnostic)
  );
  const cases = /** @type {Array<[any, ObligationCompilationError]>} */ (
    [[first, firstError], [second, secondError]]
  );
  for (const [graph, error] of cases) {
    const routes = publicInputs(graph).terminal_fact_routes;
    const unknownIndex = routes.findIndex((/** @type {any} */ route) => route.fact_id === 'fact_unknown');
    assert.equal(error.diagnostics.find((item) => item.code === 'FACT_ROUTE_UNKNOWN')?.path,
      `/obligation_inputs/terminal_fact_routes/${unknownIndex}/fact_id`);
    assert.equal(error.diagnostics.find((item) => item.code === 'FACT_ROUTE_MULTIPLE')?.path
      .startsWith('/obligation_inputs/terminal_fact_routes/'), true);
  }
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

test('obligation ledger batches all obligation source roots into one linear fact-index walk', async () => {
  const fixture = await ledgerFixture();
  /** @param {number} size */
  const countAncestryReads = (size) => {
    const graph = graphFrom(fixture);
    const sourceClaimIds = ['claim_rule'];
    for (let index = 0; index < size; index += 1) {
      const claimId = `claim_fact_index_scale_${index}`;
      const parentId = index === 0 ? 'claim_rule' : `claim_fact_index_scale_${index - 1}`;
      graph.claimsById.set(claimId, {
        claim_id: claimId, level: 'E2', kind: 'model-element', scope: 'checkout',
        parent_claim_ids: [parentId], derivation_kind: 'graph-reachability',
        derivation_target: 'model-element'
      });
      sourceClaimIds.push(claimId);
    }
    publicInputs(graph).custom_responsibilities = [customInput('fact-index-scale', {
      kind: 'decision', risk: 'low', scope: 'checkout', source_claim_ids: sourceClaimIds,
      view_element_refs: ['view_decision#rule_checkout'], required_oracle_refs: ['claim_rule'],
      required_capabilities: []
    })];
    return countTaggedMapReads('claim_fact_index_scale_', () => {
      compileObligations(graph, fixture.behavior_views);
    });
  };

  const sizes = [500, 1_000, 2_000, 4_000];
  const reads = sizes.map(countAncestryReads);
  for (let index = 0; index < sizes.length; index += 1) {
    assert.ok(reads[index] <= sizes[index] * 30, `${sizes[index]} claims caused ${reads[index]} ancestry reads`);
    if (index > 0) assert.ok(
      reads[index] <= reads[index - 1] * 2 + 30,
      `doubling ${sizes[index - 1]} claims changed reads ${reads[index - 1]} -> ${reads[index]}`
    );
  }
});

test('obligation ledger reuses shared custom roots and joins facts from direct-source buckets', async () => {
  const fixture = await ledgerFixture();
  /** @param {number} size */
  const countSharedRootReads = (size) => {
    const graph = graphFrom(fixture);
    const ownerClaimIds = Array.from(
      { length: size }, (_, index) => `claim_shared_root_owner_${index}`
    );
    for (const claimId of ownerClaimIds) graph.claimsById.set(claimId, {
      claim_id: claimId, level: 'E3', kind: 'requirement', scope: 'checkout',
      parent_claim_ids: []
    });
    const sourceClaimId = 'claim_shared_root_model';
    graph.claimsById.set(sourceClaimId, {
      claim_id: sourceClaimId, level: 'E2', kind: 'model-element', scope: 'checkout',
      parent_claim_ids: ownerClaimIds, derivation_kind: 'graph-reachability',
      derivation_target: 'model-element'
    });
    graph.factLedger.push(...ownerClaimIds.map((claimId, index) => ({
      fact_id: `fact_shared_root_owner_${index}`, claim_id: claimId,
      status: 'active', source_claim_ids: [claimId]
    })));
    const joinedResponsibility = customInput('shared-root-route-join', {
      kind: 'interaction', risk: 'low', scope: 'checkout', source_claim_ids: ['claim_rule'],
      view_element_refs: [], required_oracle_refs: [],
      required_capabilities: []
    });
    publicInputs(graph).custom_responsibilities = [
      joinedResponsibility,
      ...Array.from({ length: size }, (_, index) => {
        const responsibility = customInput(`shared-root-responsibility-${index}`, {
          kind: 'decision', risk: 'low', scope: 'checkout', source_claim_ids: [sourceClaimId],
          view_element_refs: [], required_oracle_refs: [],
          required_capabilities: []
        });
        responsibility.owner = {
          kind: 'facts', fact_ids: [`fact_shared_root_owner_${index}`]
        };
        return responsibility;
      })
    ];
    return countTaggedMapReads('claim_shared_root_', () => {
      const compiled = /** @type {any} */ (compileObligations(graph, fixture.behavior_views));
      const route = compiled.fact_routes.find((/** @type {any} */ item) => item.fact_id === 'fact_rule');
      assert.equal(route.obligation_ids.includes(customId(joinedResponsibility)), true);
      assert.ok(compiled.obligations.length >= size);
    });
  };

  const sizes = [100, 200, 400, 800];
  const reads = sizes.map(countSharedRootReads);
  for (let index = 0; index < sizes.length; index += 1) {
    assert.ok(reads[index] <= sizes[index] * 100, `${sizes[index]} shared roots caused ${reads[index]} Map reads`);
    if (index > 0) assert.ok(
      reads[index] <= reads[index - 1] * 2 + 200,
      `doubling ${sizes[index - 1]} shared roots changed reads ${reads[index - 1]} -> ${reads[index]}`
    );
  }
});

test('obligation ledger memoizes one NotApplicable exclusion closure across many facts', () => {
  const size = 500;
  /** @type {Map<string, any>} */
  const claimsById = new Map([['claim_fact_scale', {
    claim_id: 'claim_fact_scale', level: 'E3', kind: 'requirement', scope: 'checkout'
  }], ['claim_exclusion_root', {
    claim_id: 'claim_exclusion_root', level: 'E3', kind: 'requirement', scope: 'checkout'
  }]]);
  let exclusionId = 'claim_exclusion_root';
  for (let index = 0; index < size; index += 1) {
    const claimId = `claim_na_scale_${index}`;
    claimsById.set(claimId, {
      claim_id: claimId, level: 'E2', kind: 'model-element', scope: 'checkout',
      parent_claim_ids: [exclusionId], derivation_kind: 'graph-reachability',
      derivation_target: 'model-element'
    });
    exclusionId = claimId;
  }
  const facts = Array.from({ length: size }, (_, index) => ({
    fact_id: `fact_na_scale_${index}`, claim_id: 'claim_fact_scale', status: 'active',
    source_claim_ids: ['claim_fact_scale']
  }));
  /** @type {any} */
  const behaviorViews = {
    schema_version: '2.1.0', source_revision: 0, views: [],
    interaction_matrix: interactionDimensions.map((dimension) => ({
      module_ids: ['checkout'], dimension, status: 'checked-no-signal'
    })),
    obligation_inputs: {
      view_contexts: [],
      terminal_fact_routes: facts.map((fact) => notApplicableRoute(fact.fact_id, exclusionId)),
      custom_responsibilities: [], combination_requests: []
    }, interaction_candidates: []
  };
  const graph = {
    claimsById, factLedger: facts, runScope: 'checkout'
  };

  const reads = countTaggedMapReads('claim_na_scale_', () => {
    const result = /** @type {any} */ (compileObligations(graph, behaviorViews));
    assert.equal(result.fact_routes.length, size);
  });
  assert.ok(reads <= size * 30, `${size} shared exclusions caused ${reads} ancestry reads`);
});

test('obligation ledger answers distinct independent NotApplicable exclusions without per-claim closures', () => {
  /** @param {number} size */
  const countDistinctExclusionReads = (size) => {
    /** @type {Map<string, any>} */
    const claimsById = new Map([['claim_distinct_na_fact', {
      claim_id: 'claim_distinct_na_fact', level: 'E3', kind: 'requirement', scope: 'checkout'
    }], ['claim_distinct_na_scale_0', {
      claim_id: 'claim_distinct_na_scale_0', level: 'E3', kind: 'requirement', scope: 'checkout'
    }]]);
    const exclusionIds = ['claim_distinct_na_scale_0'];
    for (let index = 1; index < size; index += 1) {
      const claimId = `claim_distinct_na_scale_${index}`;
      claimsById.set(claimId, {
        claim_id: claimId, level: 'E2', kind: 'model-element', scope: 'checkout',
        parent_claim_ids: [exclusionIds[index - 1]], derivation_kind: 'graph-reachability',
        derivation_target: 'model-element'
      });
      exclusionIds.push(claimId);
    }
    const facts = exclusionIds.map((_, index) => ({
      fact_id: `fact_distinct_na_scale_${index}`, claim_id: 'claim_distinct_na_fact',
      status: 'active', source_claim_ids: ['claim_distinct_na_fact']
    }));
    const behaviorViews = {
      schema_version: '2.1.0', source_revision: 0, views: [],
      interaction_matrix: interactionDimensions.map((dimension) => ({
        module_ids: ['checkout'], dimension, status: 'checked-no-signal'
      })),
      obligation_inputs: {
        view_contexts: [],
        terminal_fact_routes: facts.map((fact, index) => notApplicableRoute(
          fact.fact_id, exclusionIds[index]
        )),
        custom_responsibilities: [], combination_requests: []
      }, interaction_candidates: []
    };
    const graph = {
      claimsById, factLedger: facts, runScope: 'checkout'
    };
    return countTaggedMapReads('claim_distinct_na_scale_', () => {
      const result = /** @type {any} */ (compileObligations(graph, behaviorViews));
      assert.equal(result.fact_routes.length, size);
    });
  };

  const sizes = [100, 200, 400, 800];
  const reads = sizes.map(countDistinctExclusionReads);
  for (let index = 0; index < sizes.length; index += 1) {
    assert.ok(reads[index] <= sizes[index] * 100, `${sizes[index]} exclusions caused ${reads[index]} Map reads`);
    if (index > 0) assert.ok(
      reads[index] <= reads[index - 1] * 2 + 200,
      `doubling ${sizes[index - 1]} exclusions changed reads ${reads[index - 1]} -> ${reads[index]}`
    );
  }
});

test('obligation ledger keeps related NotApplicable rejection deterministic under route reorder', () => {
  const claims = [
    { claim_id: 'claim_na_related_fact', level: 'E3', kind: 'requirement', scope: 'checkout' },
    {
      claim_id: 'claim_na_related_child_a', level: 'E2', kind: 'model-element', scope: 'checkout',
      parent_claim_ids: ['claim_na_related_fact'], derivation_kind: 'graph-reachability',
      derivation_target: 'model-element'
    },
    {
      claim_id: 'claim_na_related_child_b', level: 'E2', kind: 'model-element', scope: 'checkout',
      parent_claim_ids: ['claim_na_related_child_a'], derivation_kind: 'graph-reachability',
      derivation_target: 'model-element'
    }
  ];
  const facts = ['a', 'b'].map((suffix) => ({
    fact_id: `fact_na_related_${suffix}`, claim_id: 'claim_na_related_fact',
    status: 'active', source_claim_ids: ['claim_na_related_fact']
  }));
  /** @type {any} */
  const behaviorViews = {
    schema_version: '2.1.0', source_revision: 0, views: [],
    interaction_matrix: interactionDimensions.map((dimension) => ({
      module_ids: ['checkout'], dimension, status: 'checked-no-signal'
    })),
    obligation_inputs: { view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: [] }, interaction_candidates: []
  };
  const exclusionByFactId = new Map([
    ['fact_na_related_a', 'claim_na_related_child_a'],
    ['fact_na_related_b', 'claim_na_related_child_b']
  ]);
  const makeInput = (/** @type {boolean} */ reversed) => {
    const orderedFacts = reversed ? [...facts].reverse() : facts;
    const views = structuredClone(behaviorViews);
    views.obligation_inputs.terminal_fact_routes = orderedFacts.map((fact) => notApplicableRoute(
      fact.fact_id, String(exclusionByFactId.get(fact.fact_id))
    ));
    return {
      graph: {
        claimsById: new Map((reversed ? [...claims].reverse() : claims)
          .map((claim) => [claim.claim_id, claim])),
        factLedger: orderedFacts, runScope: 'checkout'
      },
      views
    };
  };

  const first = makeInput(false);
  const second = makeInput(true);
  const forward = compilationError(() => compileObligations(first.graph, first.views));
  const reversed = compilationError(() => compileObligations(second.graph, second.views));
  assert.equal(forward.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT'), true);
  assert.deepEqual(reversed.diagnostics, forward.diagnostics);
});

test('obligation ledger batch-checks thousands of independent custom owners without scans', async () => {
  const fixture = await ledgerFixture();
  const size = 8_000;
  const behaviorViews = structuredClone(fixture.behavior_views);
  const view = behaviorViews.views[0];
  const claimIds = Array.from({ length: size }, (_, index) => `claim_owner_scale_${index}`);
  const elementIds = Array.from({ length: size }, (_, index) => `rule_owner_scale_${index}`);
  view.source_claim_ids = [...claimIds];
  view.elements = elementIds.map((elementId, index) => ({
    element_id: elementId, kind: 'decision-rule', conditions: [`condition ${index}`],
    result: `result ${index}`, priority: index, source_claim_ids: [claimIds[index]], model_refs: []
  }));
  view.relations = [];
  behaviorViews.obligation_inputs.terminal_fact_routes = [];
  behaviorViews.obligation_inputs.custom_responsibilities = [customInput(
    'independent-owner-scale', {
      kind: 'decision', risk: 'medium', scope: 'checkout', source_claim_ids: [...claimIds],
      view_element_refs: elementIds.map((elementId) => `view_decision#${elementId}`),
      required_oracle_refs: [], required_capabilities: []
    }
  )];
  const graph = {
    claimsById: new Map(claimIds.map((claimId) => [claimId, {
      claim_id: claimId, level: 'E3', kind: 'requirement', scope: 'checkout'
    }])),
    factLedger: claimIds.map((claimId, index) => ({
      fact_id: `fact_owner_scale_${index}`, claim_id: claimId, status: 'active',
      source_claim_ids: [claimId]
    })),
    runScope: 'checkout'
  };
  const originalFind = Array.prototype.find;
  const originalHas = Set.prototype.has;
  let elementScans = 0;
  let relationChecks = 0;
  Object.defineProperty(Array.prototype, 'find', {
    configurable: true, writable: true,
    value(/** @type {any} */ predicate, /** @type {any} */ thisArg) {
      if (this.length === size && this[0]?.element_id?.startsWith('rule_owner_scale_')) elementScans += 1;
      return originalFind.call(this, predicate, thisArg);
    }
  });
  Object.defineProperty(Set.prototype, 'has', {
    configurable: true, writable: true,
    value(/** @type {unknown} */ value) {
      if (typeof value === 'string' && value.startsWith('claim_owner_scale_')) relationChecks += 1;
      return originalHas.call(this, value);
    }
  });
  try {
    compileObligations(graph, behaviorViews);
  } finally {
    Object.defineProperty(Array.prototype, 'find', {
      configurable: true, writable: true, value: originalFind
    });
    Object.defineProperty(Set.prototype, 'has', {
      configurable: true, writable: true, value: originalHas
    });
  }
  assert.ok(elementScans <= 2, `${size} owners caused ${elementScans} element-array scans`);
  assert.ok(relationChecks <= size * 50, `${size} owners caused ${relationChecks} relation checks`);
});

test('obligation ledger joins a formal fact to an obligation through a directed E2 model child', async () => {
  const fixture = await ledgerFixture();
  fixture.claims.push({
    claim_id: 'claim_rule_model', level: 'E2', kind: 'model-element', scope: 'checkout',
    derivation_kind: 'graph-reachability', derivation_target: 'model-element',
    parent_claim_ids: ['claim_rule']
  });
  fixture.behavior_views.views[0].source_claim_ids = ['claim_rule_model'];
  fixture.behavior_views.views[0].elements[0].source_claim_ids = [];
  fixture.behavior_views.views[0].elements[0].model_refs = ['claim_rule_model'];
  fixture.behavior_views.obligation_inputs.custom_responsibilities = [];

  const compiled = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  const route = compiled.fact_routes.find((/** @type {any} */ item) => item.fact_id === 'fact_rule');
  assert.equal(route.route_type, 'obligations');
  assert.equal(route.obligation_ids.length, 1);
});

test('obligation ledger rejects NotApplicable evidence in either dependency direction', async () => {
  const fixture = await ledgerFixture();

  const derivedExclusion = graphFrom(fixture);
  Object.assign(derivedExclusion.claimsById.get('claim_exclusion'), {
    level: 'E2', kind: 'test-data', derivation_kind: 'enumeration-complement',
    derivation_target: 'test-data', parent_claim_ids: ['claim_not_applicable']
  });
  const derivedError = compilationError(() => compileObligations(derivedExclusion, fixture.behavior_views));
  assert.equal(derivedError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT'), true);

  const reverseDependency = graphFrom(fixture);
  reverseDependency.claimsById.set('claim_fact_dependency', {
    claim_id: 'claim_fact_dependency', level: 'E2', kind: 'model-element', scope: 'checkout',
    parent_claim_ids: ['claim_exclusion'], derivation_kind: 'graph-reachability',
    derivation_target: 'model-element'
  });
  reverseDependency.factLedger.find((/** @type {any} */ fact) => fact.fact_id === 'fact_not_applicable')
    .source_claim_ids.push('claim_fact_dependency');
  const reverseError = compilationError(() => compileObligations(reverseDependency, fixture.behavior_views));
  assert.equal(reverseError.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT'), true);
});

test('obligation ledger rejects sibling custom evidence that only shares a parent with its owner', async () => {
  const fixture = await ledgerFixture();
  fixture.claims.push(
    { claim_id: 'claim_common', level: 'E3', kind: 'requirement', scope: 'checkout' },
    {
      claim_id: 'claim_owner_a', level: 'E2', kind: 'model-element', scope: 'checkout',
      parent_claim_ids: ['claim_common'], derivation_kind: 'graph-reachability',
      derivation_target: 'model-element'
    },
    {
      claim_id: 'claim_owner_b', level: 'E2', kind: 'expected-value', scope: 'checkout',
      parent_claim_ids: ['claim_common'], derivation_kind: 'decision-table-instance',
      derivation_target: 'expected-value'
    }
  );
  fixture.behavior_views.views[0].source_claim_ids.push('claim_owner_a');
  fixture.behavior_views.views[0].elements[0].model_refs = ['claim_owner_a'];
  fixture.behavior_views.obligation_inputs.custom_responsibilities.push(customInput('shared-parent-sibling', {
    kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_owner_b'], view_element_refs: ['view_decision#rule_checkout'],
    required_oracle_refs: ['claim_owner_b'], required_capabilities: []
  }));

  const error = compilationError(() => compileObligations(graphFrom(fixture), fixture.behavior_views));
  assert.equal(error.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_SOURCE_UNRELATED'), true);
  assert.equal(error.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_ORACLE_UNRELATED'), true);
});

test('obligation ledger accepts bipartite custom coverage across independent owners', async () => {
  const fixture = await ledgerFixture();
  fixture.claims.push({
    claim_id: 'claim_owner_b', level: 'E3', kind: 'requirement', scope: 'checkout', parent_claim_ids: []
  });
  fixture.fact_ledger.push({
    fact_id: 'fact_owner_b', claim_id: 'claim_owner_b', status: 'active',
    source_claim_ids: ['claim_owner_b']
  });
  fixture.behavior_views.views[0].source_claim_ids.push('claim_owner_b');
  fixture.behavior_views.views[0].elements.push({
    element_id: 'rule_owner_b', kind: 'decision-rule', conditions: ['owner B'], result: 'B', priority: 1,
    source_claim_ids: ['claim_owner_b'], model_refs: []
  });
  const bipartite = customInput('two-owner-coverage', {
    kind: 'decision', risk: 'low', scope: 'checkout',
    source_claim_ids: ['claim_rule', 'claim_owner_b'],
    view_element_refs: ['view_decision#rule_checkout', 'view_decision#rule_owner_b'],
    required_oracle_refs: ['claim_rule', 'claim_owner_b'], required_capabilities: []
  });
  fixture.behavior_views.obligation_inputs.custom_responsibilities.push(bipartite);

  const compiled = /** @type {any} */ (compileObligations(graphFrom(fixture), fixture.behavior_views));
  assert.equal(compiled.obligations.some(
    (/** @type {any} */ item) => item.obligation_id === customId(bipartite)
  ), true);
});

test('obligation ledger requires every named custom owner scope to contain the obligation scope', async () => {
  const fixture = await ledgerFixture();
  fixture.claims.push({
    claim_id: 'claim_wide_child', level: 'E3', kind: 'requirement', scope: '*',
    parent_claim_ids: ['claim_rule']
  });
  fixture.behavior_views.obligation_inputs.custom_responsibilities.push(customInput('disjoint-owner-scope', {
    kind: 'decision', risk: 'low', scope: 'other',
    source_claim_ids: ['claim_wide_child'], view_element_refs: ['view_decision#rule_checkout'],
    required_oracle_refs: ['claim_wide_child'], required_capabilities: []
  }));

  const error = compilationError(() => compileObligations(graphFrom(fixture), fixture.behavior_views));
  assert.equal(error.diagnostics.some((item) => item.code === 'CUSTOM_OBLIGATION_OWNER_SCOPE_MISMATCH'), true);
});
