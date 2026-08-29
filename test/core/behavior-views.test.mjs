import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateBehaviorViews } from '../../src/views/validate-views.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const behaviorViewsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot,
  'skill/generate-test-cases/scripts/schemas/behavior-views.schema.json'
), 'utf8'));

/** @param {string} name @returns {Promise<any>} */
async function fixture(name) {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures/views', name), 'utf8'));
}

/** @param {any} input */
function evidenceGraph(input) {
  return {
    claimsById: new Map(input.claims.map((/** @type {any} */ claim) => [claim.claim_id, claim])),
    factLedger: input.facts,
    factRoutes: input.fact_routes,
    runScope: input.run_scope
  };
}

test('behavior view fixtures stay inside the frozen schema-valid boundary', async () => {
  for (const name of ['view-validation-valid.json', 'view-validation-invalid.json']) {
    const input = await fixture(name);
    assert.deepEqual(validateAgainstSchema(input.artifact, behaviorViewsSchema), [], name);
  }
});

test('behavior view validation accepts all seven closed view kinds and derives complete fact routes', async () => {
  const input = await fixture('view-validation-valid.json');

  const result = validateBehaviorViews(evidenceGraph(input), input.artifact);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual([...result.viewsById.keys()], [
    'view_decision', 'view_flow', 'view_input', 'view_integration', 'view_role', 'view_state', 'view_timing'
  ]);
  assert.deepEqual(result.factRoutes, [
    { fact_id: 'fact_conflict', route_type: 'blocked', blocker_root_issue_id: 'root_payment_conflict' },
    { fact_id: 'fact_decision', route_type: 'views', view_ids: ['view_decision'] },
    { fact_id: 'fact_external', route_type: 'not_applicable', not_applicable_claim_id: 'claim_exclusion' },
    { fact_id: 'fact_flow', route_type: 'views', view_ids: ['view_flow'] },
    { fact_id: 'fact_input', route_type: 'views', view_ids: ['view_input'] },
    { fact_id: 'fact_integration', route_type: 'views', view_ids: ['view_integration'] },
    { fact_id: 'fact_model', route_type: 'views', view_ids: ['view_flow'] },
    { fact_id: 'fact_role', route_type: 'views', view_ids: ['view_role'] },
    { fact_id: 'fact_state', route_type: 'views', view_ids: ['view_state'] },
    { fact_id: 'fact_timing', route_type: 'views', view_ids: ['view_timing'] }
  ]);
});

test('behavior view validation rejects an omitted normative fact and an unsupported out-of-scope exclusion', async () => {
  const input = await fixture('view-validation-invalid.json');

  const result = validateBehaviorViews(evidenceGraph(input), input.artifact);

  assert.equal(result.diagnostics.some((item) => item.code === 'NORMATIVE_FACT_UNMODELED' && item.path === '/facts/fact_omitted'), true);
  assert.equal(result.diagnostics.some((item) => item.code === 'OUT_OF_SCOPE_FACT_EXCLUSION_REQUIRED' && item.path === '/facts/fact_external'), true);
  assert.equal(result.diagnostics.some((item) => item.path === '/facts/fact_present'), false);

  const routed = structuredClone(input);
  routed.claims.push({ claim_id: 'claim_e1_exclusion', level: 'E1', kind: 'assumption', scope: 'checkout' });
  routed.fact_routes.push({ fact_id: 'fact_external', route_type: 'not_applicable', not_applicable_claim_id: 'claim_e1_exclusion' });
  const unsupported = validateBehaviorViews(evidenceGraph(routed), routed.artifact);
  assert.equal(unsupported.diagnostics.some((item) => item.code === 'NOT_APPLICABLE_EVIDENCE_INVALID'), true);

  const wrongScope = structuredClone(input);
  wrongScope.claims.push({ claim_id: 'claim_wrong_scope', level: 'E3', kind: 'requirement', scope: 'shipping' });
  wrongScope.fact_routes.push({ fact_id: 'fact_external', route_type: 'not_applicable', not_applicable_claim_id: 'claim_wrong_scope' });
  assert.equal(validateBehaviorViews(evidenceGraph(wrongScope), wrongScope.artifact).diagnostics.some(
    (item) => item.code === 'NOT_APPLICABLE_SCOPE_MISMATCH'
  ), true);
});

test('behavior view validation requires claim or valid E2 model-element support for every modeled element and relation', async () => {
  const input = await fixture('view-validation-valid.json');
  const dangling = structuredClone(input);
  const decisionElement = dangling.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_decision').elements[0];
  decisionElement.source_claim_ids = ['claim_missing'];
  assert.equal(validateBehaviorViews(evidenceGraph(dangling), dangling.artifact).diagnostics.some(
    (item) => item.code === 'SOURCE_CLAIM_DANGLING' && item.path.endsWith('/source_claim_ids/0')
  ), true);

  const wrongModelType = structuredClone(input);
  const flowEdge = wrongModelType.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_flow').elements.find((/** @type {any} */ element) => element.kind === 'flow-edge');
  flowEdge.model_refs = ['claim_flow'];
  assert.equal(validateBehaviorViews(evidenceGraph(wrongModelType), wrongModelType.artifact).diagnostics.some(
    (item) => item.code === 'MODEL_REF_NOT_E2_MODEL_ELEMENT'
  ), true);

  const nonBehaviorSource = structuredClone(input);
  nonBehaviorSource.claims.push({ claim_id: 'claim_test_data', level: 'E2', kind: 'test-data', derivation_target: 'test-data', scope: 'checkout.decision' });
  nonBehaviorSource.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_decision').elements[0].source_claim_ids = ['claim_test_data'];
  assert.equal(validateBehaviorViews(evidenceGraph(nonBehaviorSource), nonBehaviorSource.artifact).diagnostics.some(
    (item) => item.code === 'SOURCE_CLAIM_NOT_BEHAVIOR_EVIDENCE'
  ), true);

  const unsupportedRelation = structuredClone(input);
  const relation = unsupportedRelation.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_flow').relations[0];
  relation.source_claim_ids = [];
  relation.model_refs = [];
  assert.equal(validateBehaviorViews(evidenceGraph(unsupportedRelation), unsupportedRelation.artifact).diagnostics.some(
    (item) => item.code === 'VIEW_RELATION_SUPPORT_REQUIRED'
  ), true);
});

test('behavior view validation rejects unsupported view kinds, cross-kind elements, and dangling relation endpoints', async () => {
  const input = await fixture('view-validation-valid.json');

  const unsupportedType = structuredClone(input);
  unsupportedType.artifact.views[0].type = 'workflow';
  assert.equal(validateBehaviorViews(evidenceGraph(unsupportedType), unsupportedType.artifact).diagnostics.some(
    (item) => item.code === 'VIEW_TYPE_UNSUPPORTED'
  ), true);

  const crossKind = structuredClone(input);
  crossKind.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_decision').type = 'flow';
  assert.equal(validateBehaviorViews(evidenceGraph(crossKind), crossKind.artifact).diagnostics.some(
    (item) => item.code === 'VIEW_ELEMENT_KIND_MISMATCH'
  ), true);

  const danglingEndpoint = structuredClone(input);
  danglingEndpoint.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_flow').relations[0].to_element_id = 'element_missing';
  assert.equal(validateBehaviorViews(evidenceGraph(danglingEndpoint), danglingEndpoint.artifact).diagnostics.some(
    (item) => item.code === 'VIEW_RELATION_ENDPOINT_DANGLING'
  ), true);
});

test('behavior view validation rejects a fact with competing modeled and explicit routes', async () => {
  const input = await fixture('view-validation-valid.json');
  input.fact_routes.push({ fact_id: 'fact_flow', route_type: 'blocked', blocker_root_issue_id: 'root_flow' });

  const result = validateBehaviorViews(evidenceGraph(input), input.artifact);

  assert.equal(result.diagnostics.some((item) => item.code === 'FACT_ROUTE_NOT_EXACT'), true);

  const crossType = await fixture('view-validation-valid.json');
  crossType.fact_routes[0].not_applicable_claim_id = 'claim_exclusion';
  assert.equal(validateBehaviorViews(evidenceGraph(crossType), crossType.artifact).diagnostics.some(
    (item) => item.code === 'FACT_EXPLICIT_ROUTE_INVALID'
  ), true);
});

test('behavior view validation treats an accepted E1 assumption as a formal fact that still requires a route', async () => {
  const input = await fixture('view-validation-invalid.json');
  input.claims.push({ claim_id: 'claim_temporary', level: 'E1', kind: 'assumption', scope: 'checkout' });
  input.facts.push({ fact_id: 'fact_temporary', claim_id: 'claim_temporary', status: 'active', source_claim_ids: ['claim_temporary'] });
  input.artifact.views[0].elements[0].source_claim_ids.push('claim_temporary');

  const result = validateBehaviorViews(evidenceGraph(input), input.artifact);

  assert.equal(result.factRoutes.some((route) => route.fact_id === 'fact_temporary' && route.route_type === 'views'), true);
  assert.equal(result.diagnostics.some((item) => item.path === '/facts/fact_temporary'), false);
});

test('behavior view validation is deterministic when set-like inputs are reordered', async () => {
  const input = await fixture('view-validation-valid.json');
  const reordered = structuredClone(input);
  reordered.claims.reverse();
  reordered.facts.reverse();
  reordered.fact_routes.reverse();
  reordered.artifact.views.reverse();
  for (const view of reordered.artifact.views) {
    view.source_claim_ids.reverse();
    view.elements.reverse();
    view.relations.reverse();
  }

  const originalResult = validateBehaviorViews(evidenceGraph(input), input.artifact);
  const reorderedResult = validateBehaviorViews(evidenceGraph(reordered), reordered.artifact);

  assert.deepEqual([...reorderedResult.viewsById.keys()], [...originalResult.viewsById.keys()]);
  assert.deepEqual(reorderedResult.factRoutes, originalResult.factRoutes);
  assert.deepEqual(reorderedResult.diagnostics, originalResult.diagnostics);
});

test('behavior view validation checks formal interaction evidence against the accepted graph', async () => {
  const artifact = await fixture('interaction-valid.json');
  const graph = { claimsById: new Map([['claim_shared', { claim_id: 'claim_shared', level: 'E3', kind: 'requirement', scope: '*' }]]) };
  assert.deepEqual(validateBehaviorViews(graph, artifact).diagnostics, []);

  artifact.interaction_candidates[0].source_claim_ids = ['claim_missing'];
  assert.equal(validateBehaviorViews(graph, artifact).diagnostics.some((item) => item.code === 'SOURCE_CLAIM_DANGLING'), true);
});
