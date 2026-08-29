import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compile as compileFlow } from '../../src/obligations/flow.mjs';
import { registerObligationStrategy } from '../../src/obligations/registry.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../../src/schema-validator.mjs';
import { auditInteractionMatrix } from '../../src/views/interaction-matrix.mjs';
import { validateBehaviorViews } from '../../src/views/validate-views.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const behaviorViewsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/behavior-views.schema.json'
), 'utf8'));
const testObligationsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/test-obligations.schema.json'
), 'utf8'));

/** @returns {Promise<any>} */
async function flowFixture() {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures/views/flow-obligations.json'), 'utf8'));
}

/** @param {any} artifact */
function evidenceGraphFor(artifact) {
  const view = artifact.views[0];
  const claimsById = new Map();
  for (const claimId of view.source_claim_ids) claimsById.set(claimId, {
    claim_id: claimId, level: 'E3', kind: 'requirement', scope: view.scope, parent_claim_ids: []
  });
  for (const element of view.elements) {
    for (const claimId of element.source_claim_ids) claimsById.set(claimId, {
      claim_id: claimId, level: 'E3', kind: 'requirement', scope: view.scope, parent_claim_ids: []
    });
    for (const claimId of element.model_refs) claimsById.set(claimId, {
      claim_id: claimId, level: 'E2', kind: 'model-element', derivation_target: 'model-element',
      scope: view.scope, parent_claim_ids: [element.source_claim_ids[0]]
    });
  }
  return { claimsById, factLedger: [], runScope: view.scope };
}

/** @param {any} artifact @param {any} graph @returns {any} */
function validatedFlow(artifact, graph) {
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(artifact), []);
  assert.deepEqual(auditInteractionMatrix(artifact).diagnostics, []);
  const result = validateBehaviorViews(graph, artifact);
  assert.deepEqual(result.diagnostics, []);
  return result.viewsById.get('view_checkout_flow');
}

/** @param {Map<string, any>} claimsById */
function flowContext(claimsById) {
  return {
    claimsById,
    riskByElementId: new Map([
      ['edge_start_authorize', 'medium'], ['edge_authorize_retry', 'high'],
      ['edge_retry_self', 'high'], ['edge_retry_paid', 'critical'],
      ['edge_retry_declined', 'critical'], ['node_paid', 'critical'], ['node_declined', 'high']
    ]),
    requiredOracleRefsByElementId: new Map([
      ['edge_start_authorize', ['claim_start_authorize']],
      ['edge_authorize_retry', ['claim_retryable']],
      ['edge_retry_self', ['claim_retry_repeat']],
      ['edge_retry_paid', ['claim_payment_success']],
      ['edge_retry_declined', ['claim_payment_exhausted']],
      ['node_paid', ['claim_paid_terminal']],
      ['node_declined', ['claim_declined_exception']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['edge_start_authorize', ['payment-api']],
      ['edge_authorize_retry', ['payment-api']],
      ['edge_retry_self', ['payment-api']],
      ['edge_retry_paid', ['order-read', 'payment-api']],
      ['edge_retry_declined', ['payment-api', 'ui-message']],
      ['node_paid', ['order-read']],
      ['node_declined', ['ui-message']]
    ]),
    loopMaximumsByElementId: new Map([
      ['edge_retry_self', { maximum: 3, source_claim_ids: ['claim_retry_max'] }]
    ])
  };
}

const expectedFlowSeeds = [
  {
    obligation_id: 'obligation_13c812f5c02e07e2', kind: 'flow', risk: 'high', scope: 'checkout.payment',
    source_claim_ids: ['claim_declined_exception'],
    view_element_refs: ['view_checkout_flow#node_declined'],
    required_oracle_refs: ['claim_declined_exception'], required_capabilities: ['ui-message']
  },
  {
    obligation_id: 'obligation_13d40c7f11001618', kind: 'flow', risk: 'high', scope: 'checkout.payment',
    source_claim_ids: ['claim_retry_action', 'claim_retry_repeat', 'model_retry_reachable'],
    view_element_refs: ['view_checkout_flow#edge_retry_self', 'view_checkout_flow#node_retry'],
    required_oracle_refs: ['claim_retry_repeat'], required_capabilities: ['payment-api']
  },
  {
    obligation_id: 'obligation_5117ba96723d70a9', kind: 'flow', risk: 'medium', scope: 'checkout.payment',
    source_claim_ids: ['claim_authorize', 'claim_cart', 'claim_start_authorize'],
    view_element_refs: ['view_checkout_flow#edge_start_authorize', 'view_checkout_flow#node_authorize', 'view_checkout_flow#node_cart'],
    required_oracle_refs: ['claim_start_authorize'], required_capabilities: ['payment-api']
  },
  {
    obligation_id: 'obligation_65fd1591b9db0b06', kind: 'flow', risk: 'high', scope: 'checkout.payment',
    source_claim_ids: ['claim_authorize', 'claim_retry_action', 'claim_retryable'],
    view_element_refs: ['view_checkout_flow#edge_authorize_retry', 'view_checkout_flow#node_authorize', 'view_checkout_flow#node_retry'],
    required_oracle_refs: ['claim_retryable'], required_capabilities: ['payment-api']
  },
  {
    obligation_id: 'obligation_6609e40c4376360f', kind: 'flow', risk: 'critical', scope: 'checkout.payment',
    source_claim_ids: ['claim_paid_terminal', 'claim_payment_success', 'claim_retry_action'],
    view_element_refs: ['view_checkout_flow#edge_retry_paid', 'view_checkout_flow#node_paid', 'view_checkout_flow#node_retry'],
    required_oracle_refs: ['claim_payment_success'], required_capabilities: ['order-read', 'payment-api']
  },
  {
    obligation_id: 'obligation_aae59f267e26bc2c', kind: 'flow', risk: 'high', scope: 'checkout.payment',
    source_claim_ids: ['claim_retry_action', 'claim_retry_repeat', 'model_retry_reachable'],
    view_element_refs: ['view_checkout_flow#edge_retry_self', 'view_checkout_flow#node_retry'],
    required_oracle_refs: ['claim_retry_repeat'], required_capabilities: ['payment-api']
  },
  {
    obligation_id: 'obligation_b23da1e0e8037067', kind: 'flow', risk: 'critical', scope: 'checkout.payment',
    source_claim_ids: ['claim_paid_terminal'],
    view_element_refs: ['view_checkout_flow#node_paid'],
    required_oracle_refs: ['claim_paid_terminal'], required_capabilities: ['order-read']
  },
  {
    obligation_id: 'obligation_cd726f3262141955', kind: 'flow', risk: 'critical', scope: 'checkout.payment',
    source_claim_ids: ['claim_declined_exception', 'claim_payment_exhausted', 'claim_retry_action'],
    view_element_refs: ['view_checkout_flow#edge_retry_declined', 'view_checkout_flow#node_declined', 'view_checkout_flow#node_retry'],
    required_oracle_refs: ['claim_payment_exhausted'], required_capabilities: ['payment-api', 'ui-message']
  },
  {
    obligation_id: 'obligation_f1f674a7cc24a98c', kind: 'flow', risk: 'high', scope: 'checkout.payment',
    source_claim_ids: ['claim_retry_action', 'claim_retry_max', 'claim_retry_repeat', 'model_retry_reachable'],
    view_element_refs: ['view_checkout_flow#edge_retry_self', 'view_checkout_flow#node_retry'],
    required_oracle_refs: ['claim_retry_repeat'], required_capabilities: ['payment-api']
  }
];

// The three loop ID literals were hand-calculated from an explicit signature containing
// responsibility='loop-iterations', iterations=0|1|3, and the semantic edge identity.
// Maximum-support claims remain validated output provenance because no ninth seed field is available.

test('flow obligations hand-count every explicit edge, terminal, sourced exception, and 0/1/declared-max loop responsibility', async () => {
  const artifact = await flowFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedFlow(artifact, graph);

  const actual = compileFlow(view, flowContext(graph.claimsById));

  assert.equal(actual.length, 9);
  assert.deepEqual(actual, expectedFlowSeeds);
  const obligationsArtifact = {
    schema_version: '1.0.0', source_revision: 4, obligations: actual, fact_routes: [], interaction_routes: []
  };
  assert.deepEqual(validateAgainstSchema(obligationsArtifact, testObligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds(obligationsArtifact), []);
  assert.equal(new Set(actual.map((seed) => seed.obligation_id)).size, 9);
  const loopIds = ['obligation_aae59f267e26bc2c', 'obligation_13d40c7f11001618', 'obligation_f1f674a7cc24a98c'];
  assert.equal(new Set(loopIds).size, 3);
  for (const id of loopIds.slice(0, 2)) assert.equal(
    actual.find((seed) => seed.obligation_id === id)?.source_claim_ids.includes('claim_retry_max'), false
  );
  assert.equal(actual.find((seed) => seed.obligation_id === loopIds[2])?.source_claim_ids.includes('claim_retry_max'), true);
});

test('flow obligations derive no maximum and no generic duplicate for self-loops or multi-edge loops', async () => {
  const artifact = await flowFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedFlow(artifact, graph);
  const baseContext = flowContext(graph.claimsById);
  const withoutMaximum = { ...baseContext, loopMaximumsByElementId: new Map() };
  const unsupportedMaximum = {
    ...baseContext,
    loopMaximumsByElementId: new Map([['edge_retry_self', { maximum: 5, source_claim_ids: ['claim_missing'] }]])
  };
  const maximumOne = {
    ...baseContext,
    loopMaximumsByElementId: new Map([['edge_retry_self', { maximum: 1, source_claim_ids: ['claim_retry_max'] }]])
  };

  const noMaximumSeeds = compileFlow(view, withoutMaximum);
  assert.equal(noMaximumSeeds.length, 8);
  assert.deepEqual(compileFlow(view, unsupportedMaximum), noMaximumSeeds);
  assert.deepEqual(compileFlow(view, maximumOne), noMaximumSeeds);
  assert.equal(noMaximumSeeds.filter((seed) => seed.view_element_refs.includes('view_checkout_flow#edge_retry_self')).length, 2);

  const cycleArtifact = structuredClone(artifact);
  const cycleEdge = cycleArtifact.views[0].elements.find((/** @type {any} */ element) => element.element_id === 'edge_retry_self');
  cycleEdge.to_element_id = 'node_authorize';
  const cycleGraph = evidenceGraphFor(cycleArtifact);
  const cycleView = validatedFlow(cycleArtifact, cycleGraph);
  const cycleContext = { ...flowContext(cycleGraph.claimsById), loopMaximumsByElementId: new Map() };
  const cycleSeeds = compileFlow(cycleView, cycleContext);
  assert.equal(cycleSeeds.length, 9);
  assert.equal(cycleSeeds.filter((seed) => seed.view_element_refs.includes('view_checkout_flow#edge_authorize_retry')).length, 2);
  assert.equal(cycleSeeds.filter((seed) => seed.view_element_refs.includes('view_checkout_flow#edge_retry_self')).length, 2);
});

test('flow obligations keep equivalent declared-maximum IDs stable when accepted support provenance changes', async () => {
  const artifact = await flowFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedFlow(artifact, graph);
  const original = compileFlow(view, flowContext(graph.claimsById));
  const originalMaximum = original.find((seed) => seed.source_claim_ids.includes('claim_retry_max'));

  const alternativeClaims = new Map(graph.claimsById);
  alternativeClaims.set('claim_retry_max_secondary', {
    claim_id: 'claim_retry_max_secondary', level: 'E3', kind: 'requirement',
    scope: view.scope, parent_claim_ids: []
  });
  const alternativeContext = {
    ...flowContext(alternativeClaims),
    loopMaximumsByElementId: new Map([
      ['edge_retry_self', { maximum: 3, source_claim_ids: ['claim_retry_max_secondary'] }]
    ])
  };
  const alternative = compileFlow(view, alternativeContext);
  const alternativeMaximum = alternative.find((seed) => seed.source_claim_ids.includes('claim_retry_max_secondary'));

  assert.equal(alternativeMaximum?.obligation_id, originalMaximum?.obligation_id);
  assert.equal(originalMaximum?.source_claim_ids.includes('claim_retry_max_secondary'), false);
  assert.equal(alternativeMaximum?.source_claim_ids.includes('claim_retry_max'), false);
});

test('flow obligations keep IDs stable under semantic reorder, return fresh output, and rely on Task 4 for dangling inputs', async () => {
  const artifact = await flowFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedFlow(artifact, graph);
  const context = flowContext(graph.claimsById);
  const before = JSON.stringify(view);
  const first = compileFlow(view, context);
  const second = compileFlow(view, context);
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first[0], second[0]);
  first[0].source_claim_ids.push('claim_test_mutation');
  assert.equal(second[0].source_claim_ids.includes('claim_test_mutation'), false);
  assert.equal(JSON.stringify(view), before);

  const reordered = structuredClone(artifact);
  reordered.source_revision = 99;
  reordered.views[0].elements.reverse();
  for (const element of /** @type {any[]} */ (reordered.views[0].elements)) {
    if (element.kind === 'flow-edge') element.sequence += 100;
  }
  const reorderedView = validatedFlow(reordered, graph);
  assert.deepEqual(compileFlow(reorderedView, context), second);

  const dangling = structuredClone(artifact);
  dangling.views[0].elements.find((/** @type {any} */ element) => element.element_id === 'edge_retry_paid').to_element_id = 'node_missing';
  const invalid = validateBehaviorViews(graph, dangling);
  assert.equal(invalid.diagnostics.some((item) => item.code === 'FLOW_EDGE_ENDPOINT_DANGLING'), true);
  assert.equal(invalid.viewsById.has('view_checkout_flow'), false);
});

test('flow obligation registry is isolated and deterministically refuses duplicate view-type registration', async () => {
  const artifact = await flowFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedFlow(artifact, graph);
  const registry = registerObligationStrategy('flow', compileFlow);
  assert.deepEqual(registry.compile(view, flowContext(graph.claimsById)), expectedFlowSeeds);
  assert.throws(() => registry.registerObligationStrategy('flow', compileFlow), /duplicate obligation strategy for view type "flow"/);
  const isolated = registerObligationStrategy('flow', compileFlow);
  assert.deepEqual(isolated.registeredViewTypes(), ['flow']);
});
