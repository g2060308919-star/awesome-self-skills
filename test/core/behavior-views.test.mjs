import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateBehaviorViews } from '../../src/views/validate-views.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../../src/schema-validator.mjs';

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
    runScope: input.run_scope
  };
}

test('behavior view fixtures stay inside the frozen schema-valid boundary', async () => {
  for (const name of ['view-validation-valid.json', 'view-validation-invalid.json']) {
    const input = await fixture(name);
    assert.deepEqual(validateAgainstSchema(input.artifact, behaviorViewsSchema), [], name);
    assert.deepEqual(validateUniqueStableIds(input.artifact), [], name);
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
    { fact_id: 'fact_decision', route_type: 'views', view_ids: ['view_decision'] },
    { fact_id: 'fact_flow', route_type: 'views', view_ids: ['view_flow'] },
    { fact_id: 'fact_input', route_type: 'views', view_ids: ['view_input'] },
    { fact_id: 'fact_integration', route_type: 'views', view_ids: ['view_integration'] },
    { fact_id: 'fact_model', route_type: 'views', view_ids: ['view_flow'] },
    { fact_id: 'fact_role', route_type: 'views', view_ids: ['view_role'] },
    { fact_id: 'fact_state', route_type: 'views', view_ids: ['view_state'] },
    { fact_id: 'fact_timing', route_type: 'views', view_ids: ['view_timing'] }
  ]);
});

test('behavior view validation diagnoses every unmodeled fact and classifies scope by hierarchical overlap', async () => {
  const input = await fixture('view-validation-invalid.json');

  const result = validateBehaviorViews(evidenceGraph(input), input.artifact);

  for (const factId of ['fact_broad', 'fact_global', 'fact_narrow']) assert.equal(result.diagnostics.some(
    (item) => item.code === 'NORMATIVE_FACT_UNMODELED' && item.path === `/facts/${factId}`
  ), true, factId);
  assert.equal(result.diagnostics.some(
    (item) => item.code === 'OUT_OF_SCOPE_NORMATIVE_FACT_UNMODELED' && item.path === '/facts/fact_disjoint'
  ), true);
  assert.equal(result.diagnostics.some((item) => item.path === '/facts/fact_present'), false);
  assert.deepEqual(result.factRoutes, [{ fact_id: 'fact_present', route_type: 'views', view_ids: ['view_present'] }]);
});

test('behavior view validation ignores unfrozen submitted fact routes including E2 test-data exclusions', async () => {
  const input = await fixture('view-validation-invalid.json');
  input.claims.push({ claim_id: 'claim_test_data', level: 'E2', kind: 'test-data', derivation_target: 'test-data', scope: 'shipping' });
  const graph = {
    ...evidenceGraph(input),
    factRoutes: [
      { fact_id: 'fact_broad', route_type: 'blocked', blocker_root_issue_id: 'root_broad' },
      { fact_id: 'fact_disjoint', route_type: 'not_applicable', not_applicable_claim_id: 'claim_test_data' }
    ],
    fact_routes: [{ fact_id: 'fact_narrow', route_type: 'blocked', blocker_root_issue_id: 'root_narrow' }]
  };

  const result = validateBehaviorViews(graph, input.artifact);

  assert.equal(result.factRoutes.some((route) => route.fact_id !== 'fact_present'), false);
  assert.equal(result.diagnostics.some((item) => item.path === '/facts/fact_broad'), true);
  assert.equal(result.diagnostics.some((item) => item.path === '/facts/fact_narrow'), true);
  assert.equal(result.diagnostics.some((item) => item.path === '/facts/fact_disjoint'), true);
});

test('behavior view validation requires claim or valid E2 model-element support for every modeled element and relation', async () => {
  const input = await fixture('view-validation-valid.json');
  const dangling = structuredClone(input);
  const decisionElement = dangling.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_decision').elements[0];
  decisionElement.source_claim_ids = ['claim_missing'];
  assert.equal(validateBehaviorViews(evidenceGraph(dangling), dangling.artifact).diagnostics.some(
    (item) => item.code === 'SOURCE_CLAIM_DANGLING' && item.path.endsWith('/source_claim_ids/claim_missing')
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

test('behavior view validation enforces flow-node, state-name, and relation endpoint graph semantics', async () => {
  const input = await fixture('view-validation-valid.json');

  const edgeToEdge = structuredClone(input);
  const flow = edgeToEdge.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_flow');
  flow.elements.find((/** @type {any} */ element) => element.kind === 'flow-edge').to_element_id = 'flow_submit';
  assert.deepEqual(validateAgainstSchema(edgeToEdge.artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(edgeToEdge.artifact), []);
  assert.equal(validateBehaviorViews(evidenceGraph(edgeToEdge), edgeToEdge.artifact).diagnostics.some(
    (item) => item.code === 'FLOW_EDGE_ENDPOINT_TYPE_INVALID'
  ), true);

  const transitionToMissingState = structuredClone(input);
  transitionToMissingState.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_state')
    .elements.find((/** @type {any} */ element) => element.kind === 'transition').to_state = 'missing';
  assert.deepEqual(validateAgainstSchema(transitionToMissingState.artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(transitionToMissingState.artifact), []);
  assert.equal(validateBehaviorViews(evidenceGraph(transitionToMissingState), transitionToMissingState.artifact).diagnostics.some(
    (item) => item.code === 'STATE_TRANSITION_STATE_DANGLING'
  ), true);

  const relationToEdge = structuredClone(input);
  relationToEdge.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_flow')
    .relations[0].to_element_id = 'flow_submit';
  assert.deepEqual(validateAgainstSchema(relationToEdge.artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(relationToEdge.artifact), []);
  assert.equal(validateBehaviorViews(evidenceGraph(relationToEdge), relationToEdge.artifact).diagnostics.some(
    (item) => item.code === 'VIEW_RELATION_ENDPOINT_TYPE_INVALID'
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
  const frozenInput = structuredClone(input);
  const reordered = structuredClone(input);
  reordered.claims.reverse();
  reordered.facts.reverse();
  reordered.artifact.views.reverse();
  for (const view of reordered.artifact.views) {
    view.source_claim_ids.reverse();
    view.elements.reverse();
    view.relations.reverse();
    for (const element of view.elements) {
      element.source_claim_ids.reverse();
      element.model_refs.reverse();
      if (Array.isArray(element.conditions)) element.conditions.reverse();
      if (Array.isArray(element.permissions)) element.permissions.reverse();
      if (Array.isArray(element.classes)) element.classes.reverse();
      if (Array.isArray(element.side_effects)) element.side_effects.reverse();
    }
    for (const relation of view.relations) {
      relation.source_claim_ids.reverse();
      relation.model_refs.reverse();
    }
  }

  const originalResult = validateBehaviorViews(evidenceGraph(input), input.artifact);
  const reorderedResult = validateBehaviorViews(evidenceGraph(reordered), reordered.artifact);

  assert.deepEqual([...reorderedResult.viewsById], [...originalResult.viewsById]);
  assert.deepEqual(reorderedResult.factRoutes, originalResult.factRoutes);
  assert.deepEqual(reorderedResult.diagnostics, originalResult.diagnostics);
  assert.deepEqual(input, frozenInput);
});

test('behavior view diagnostics are stable when invalid set-like definitions and references are reordered', async () => {
  const input = await fixture('view-validation-valid.json');
  const flow = input.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_flow');
  flow.elements.find((/** @type {any} */ element) => element.element_id === 'flow_start')
    .source_claim_ids = ['claim_z_missing', 'claim_a_missing'];
  flow.relations[0].model_refs = ['model_z_missing', 'model_a_missing'];
  const decision = input.artifact.views.find((/** @type {any} */ view) => view.view_id === 'view_decision');
  decision.source_claim_ids = ['claim_decision_secondary', 'claim_z_missing', 'claim_decision'];
  assert.deepEqual(validateAgainstSchema(input.artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(input.artifact), []);

  const reversed = structuredClone(input);
  reversed.claims.reverse();
  reversed.facts.reverse();
  reversed.artifact.views.reverse();
  for (const view of reversed.artifact.views) {
    view.source_claim_ids.reverse();
    view.elements.reverse();
    view.relations.reverse();
    for (const element of view.elements) {
      element.source_claim_ids.reverse();
      element.model_refs.reverse();
    }
    for (const relation of view.relations) {
      relation.source_claim_ids.reverse();
      relation.model_refs.reverse();
    }
  }

  assert.deepEqual(
    validateBehaviorViews(evidenceGraph(reversed), reversed.artifact).diagnostics,
    validateBehaviorViews(evidenceGraph(input), input.artifact).diagnostics
  );
});

test('behavior view validation binds a formal interaction candidate to a valid modeled claim closure and covering scope', async () => {
  const artifact = await fixture('interaction-valid.json');
  const graph = { claimsById: new Map([['claim_shared', { claim_id: 'claim_shared', level: 'E3', kind: 'requirement', scope: '*' }]]) };
  assert.deepEqual(validateBehaviorViews(graph, artifact).diagnostics, []);

  const dangling = structuredClone(artifact);
  dangling.interaction_candidates[0].source_claim_ids = ['claim_missing'];
  assert.equal(validateBehaviorViews(graph, dangling).diagnostics.some((item) => item.code === 'SOURCE_CLAIM_DANGLING'), true);

  const empty = structuredClone(artifact);
  empty.views[0].elements = [];
  assert.equal(validateBehaviorViews(graph, empty).diagnostics.some(
    (item) => item.code === 'FORMAL_INTERACTION_VIEW_EMPTY'
  ), true);

  const unrelated = structuredClone(artifact);
  unrelated.views[0].elements[0].source_claim_ids = ['claim_other'];
  unrelated.views[0].source_claim_ids = ['claim_other'];
  const unrelatedGraph = { claimsById: new Map([
    ['claim_shared', { claim_id: 'claim_shared', level: 'E3', kind: 'requirement', scope: '*' }],
    ['claim_other', { claim_id: 'claim_other', level: 'E3', kind: 'requirement', scope: '*' }]
  ]) };
  assert.equal(validateBehaviorViews(unrelatedGraph, unrelated).diagnostics.some(
    (item) => item.code === 'FORMAL_CANDIDATE_CLAIM_UNMODELED'
  ), true);

  const narrowScope = structuredClone(artifact);
  narrowScope.interaction_candidates[0].source_claim_ids = ['claim_narrow'];
  narrowScope.views[0].elements[0].model_refs = ['claim_model'];
  narrowScope.views[0].elements[0].source_claim_ids = [];
  const narrowGraph = { claimsById: new Map([
    ['claim_shared', { claim_id: 'claim_shared', level: 'E3', kind: 'requirement', scope: '*' }],
    ['claim_narrow', { claim_id: 'claim_narrow', level: 'E3', kind: 'requirement', scope: 'orders.child' }],
    ['claim_model', { claim_id: 'claim_model', level: 'E2', kind: 'model-element', derivation_target: 'model-element', scope: 'orders', parent_claim_ids: ['claim_narrow'] }]
  ]) };
  assert.equal(validateBehaviorViews(narrowGraph, narrowScope).diagnostics.some(
    (item) => item.code === 'FORMAL_CANDIDATE_SCOPE_MISMATCH'
  ), true);
});
