import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { compile as compileState } from '../../src/obligations/state.mjs';
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
async function stateFixture() {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures/views/state-obligations.json'), 'utf8'));
}

/** @param {any} artifact */
function evidenceGraphFor(artifact) {
  const view = artifact.views[0];
  const claimsById = new Map();
  for (const claimId of view.source_claim_ids) claimsById.set(claimId, {
    claim_id: claimId, level: 'E3', kind: 'requirement', scope: view.scope, parent_claim_ids: []
  });
  for (const element of view.elements) {
    for (const claimId of element.model_refs) claimsById.set(claimId, {
      claim_id: claimId, level: 'E2', kind: 'model-element', derivation_target: 'model-element',
      scope: view.scope, parent_claim_ids: [element.source_claim_ids[0]]
    });
  }
  return { claimsById, factLedger: [], runScope: view.scope };
}

/** @param {any} artifact @param {any} graph @returns {any} */
function validatedState(artifact, graph) {
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(artifact), []);
  assert.deepEqual(auditInteractionMatrix(artifact).diagnostics, []);
  const result = validateBehaviorViews(graph, artifact);
  assert.deepEqual(result.diagnostics, []);
  return result.viewsById.get('view_approval_state');
}

/** @param {Map<string, any>} claimsById */
function stateContext(claimsById) {
  return {
    claimsById,
    riskByElementId: new Map([
      ['transition_approve', 'high'], ['transition_reject', 'high'], ['transition_audit', 'low']
    ]),
    requiredOracleRefsByElementId: new Map([
      ['transition_approve', ['claim_approve_transition']],
      ['transition_reject', ['claim_reject_transition']],
      ['transition_audit', ['claim_audit_transition']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ['transition_approve', ['request-store']],
      ['transition_reject', ['request-store']],
      ['transition_audit', ['audit-log']]
    ]),
    illegalTransitionRisks: [{
      from_state: 'rejected', event: 'manager approves', to_state: 'approved',
      disposition: 'exploratory', exploratory_id: 'exploratory_illegal_reopen'
    }]
  };
}

const expectedStateSeeds = [
  {
    obligation_id: 'obligation_38611ab2f98189ee', kind: 'state', risk: 'high', scope: 'approval.request',
    source_claim_ids: ['claim_approve_transition', 'claim_approved', 'claim_pending'],
    view_element_refs: ['view_approval_state#state_approved', 'view_approval_state#state_pending', 'view_approval_state#transition_approve'],
    required_oracle_refs: ['claim_approve_transition'], required_capabilities: ['request-store']
  },
  {
    obligation_id: 'obligation_6ad739d4dd3083b4', kind: 'state', risk: 'high', scope: 'approval.request',
    source_claim_ids: ['claim_pending', 'claim_reject_transition', 'claim_rejected'],
    view_element_refs: ['view_approval_state#state_pending', 'view_approval_state#state_rejected', 'view_approval_state#transition_reject'],
    required_oracle_refs: ['claim_reject_transition'], required_capabilities: ['request-store']
  },
  {
    obligation_id: 'obligation_c5b913a6cd0f1dfb', kind: 'state', risk: 'low', scope: 'approval.request',
    source_claim_ids: ['claim_approved', 'claim_audit_transition', 'model_audit_transition'],
    view_element_refs: ['view_approval_state#state_approved', 'view_approval_state#transition_audit'],
    required_oracle_refs: ['claim_audit_transition'], required_capabilities: ['audit-log']
  }
];

test('state obligations hand-count every explicit valid transition once, including a sourced self-transition', async () => {
  const artifact = await stateFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedState(artifact, graph);

  const actual = compileState(view, stateContext(graph.claimsById));

  assert.equal(actual.length, 3);
  assert.deepEqual(actual, expectedStateSeeds);
  const obligationsArtifact = {
    schema_version: '1.0.0', source_revision: 7, obligations: actual, fact_routes: [], interaction_routes: []
  };
  assert.deepEqual(validateAgainstSchema(obligationsArtifact, testObligationsSchema), []);
  assert.deepEqual(validateUniqueStableIds(obligationsArtifact), []);
  assert.equal(actual.filter((seed) => seed.view_element_refs.includes('view_approval_state#transition_audit')).length, 1);
});

test('state obligations leave unsourced illegal-transition risks on their explicit Exploratory route, never in formal output', async () => {
  const artifact = await stateFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedState(artifact, graph);
  const context = stateContext(graph.claimsById);

  const actual = compileState(view, context);

  assert.deepEqual(actual, expectedStateSeeds);
  assert.deepEqual(context.illegalTransitionRisks, [{
    from_state: 'rejected', event: 'manager approves', to_state: 'approved',
    disposition: 'exploratory', exploratory_id: 'exploratory_illegal_reopen'
  }]);
  assert.equal(actual.some((seed) => seed.source_claim_ids.length === 0), false);
  assert.equal(actual.some((seed) => seed.view_element_refs.some((ref) => ref.includes('illegal'))), false);
});

test('state obligations preserve IDs across semantic reorder, inherit model evidence, and return fresh output', async () => {
  const artifact = await stateFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedState(artifact, graph);
  const context = stateContext(graph.claimsById);
  const before = JSON.stringify(view);
  const first = compileState(view, context);

  const reorderedArtifact = structuredClone(artifact);
  reorderedArtifact.source_revision = 91;
  reorderedArtifact.views[0].elements.reverse();
  const reordered = validatedState(reorderedArtifact, graph);
  const second = compileState(reordered, context);

  assert.deepEqual(first, expectedStateSeeds);
  assert.deepEqual(second, expectedStateSeeds);
  assert.equal(JSON.stringify(view), before);
  assert.notStrictEqual(first, compileState(view, context));
  assert.notStrictEqual(first[0], compileState(view, context)[0]);
  assert.deepEqual(first[2].source_claim_ids, ['claim_approved', 'claim_audit_transition', 'model_audit_transition']);
});

test('state obligation identity retains explicit business transition order while ignoring collection position', async () => {
  const artifact = await stateFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedState(artifact, graph);
  const context = stateContext(graph.claimsById);
  const original = compileState(view, context);
  const originalApproveId = original.find((seed) => seed.view_element_refs.includes('view_approval_state#transition_approve'))?.obligation_id;

  const changedOrder = structuredClone(artifact);
  changedOrder.views[0].elements.find((/** @type {any} */ element) => element.element_id === 'transition_approve')
    .transition_order.reverse();
  const changedView = validatedState(changedOrder, graph);
  const changed = compileState(changedView, context);
  const changedApproveId = changed.find((seed) => seed.view_element_refs.includes('view_approval_state#transition_approve'))?.obligation_id;

  assert.notEqual(changedApproveId, originalApproveId);
  assert.deepEqual(
    changed.filter((seed) => !seed.view_element_refs.includes('view_approval_state#transition_approve')),
    original.filter((seed) => !seed.view_element_refs.includes('view_approval_state#transition_approve'))
  );
});

test('state obligations reject duplicate transition semantics while Task 4 rejects dangling state inputs', async () => {
  const artifact = await stateFixture();
  const graph = evidenceGraphFor(artifact);
  const view = validatedState(artifact, graph);
  const context = stateContext(graph.claimsById);
  const duplicateView = structuredClone(view);
  duplicateView.elements.push({ ...structuredClone(
    duplicateView.elements.find((/** @type {any} */ element) => element.element_id === 'transition_approve')
  ), element_id: 'transition_approve_duplicate' });
  const duplicateContext = {
    ...context,
    riskByElementId: new Map([...context.riskByElementId, ['transition_approve_duplicate', 'high']]),
    requiredOracleRefsByElementId: new Map([
      ...context.requiredOracleRefsByElementId, ['transition_approve_duplicate', ['claim_approve_transition']]
    ]),
    requiredCapabilitiesByElementId: new Map([
      ...context.requiredCapabilitiesByElementId, ['transition_approve_duplicate', ['request-store']]
    ])
  };
  assert.throws(() => compileState(duplicateView, duplicateContext), /duplicate state obligation semantic signature/);

  const dangling = structuredClone(artifact);
  dangling.views[0].elements.find((/** @type {any} */ element) => element.element_id === 'transition_approve').to_state = 'archived';
  const invalid = validateBehaviorViews(graph, dangling);
  assert.equal(invalid.diagnostics.some((item) => item.code === 'STATE_TRANSITION_STATE_DANGLING'), true);
  assert.equal(invalid.viewsById.has('view_approval_state'), false);
});
