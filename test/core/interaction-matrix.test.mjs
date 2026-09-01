import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditInteractionMatrix, INTERACTION_DIMENSIONS } from '../../src/views/interaction-matrix.mjs';
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

test('interaction matrix uses exactly the seven frozen dimensions', () => {
  assert.deepEqual(INTERACTION_DIMENSIONS, [
    'shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'
  ]);
  assert.equal(Object.isFrozen(INTERACTION_DIMENSIONS), true);
});

test('interaction matrix fixtures stay schema-valid across semantic pass and failure boundaries', async () => {
  for (const name of ['interaction-valid.json', 'interaction-no-signal.json', 'interaction-three-modules.json', 'interaction-invalid.json', 'interaction-collision.json']) {
    const artifact = await fixture(name);
    assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), [], name);
    assert.deepEqual(validateUniqueStableIds(artifact), [], name);
  }
});

test('interaction matrix accepts every disposition exactly once for a complete unordered module pair', async () => {
  const artifact = await fixture('interaction-valid.json');

  const result = auditInteractionMatrix(artifact);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.candidates.map((candidate) => candidate.candidate_id), [
    'candidate_blocked', 'candidate_exploratory', 'candidate_formal'
  ]);
  assert.deepEqual(result.candidates.map((candidate) => candidate.disposition), ['blocker', 'exploratory', 'formal-view']);
});

test('interaction matrix accepts an explicit seven-record one-module no-signal audit', async () => {
  const artifact = await fixture('interaction-no-signal.json');

  assert.deepEqual(auditInteractionMatrix(artifact), { candidates: [], diagnostics: [] });
});

test('interaction matrix requires all seven dimensions for every unordered pair in a three-module audit', async () => {
  const artifact = await fixture('interaction-three-modules.json');
  assert.deepEqual(auditInteractionMatrix(artifact), { candidates: [], diagnostics: [] });

  artifact.interaction_matrix = artifact.interaction_matrix.filter((/** @type {any} */ cell) => !(
    cell.module_ids.includes('accounts') && cell.module_ids.includes('payments') && cell.dimension === 'time'
  ));
  const incomplete = auditInteractionMatrix(artifact);
  assert.equal(incomplete.diagnostics.some((item) => item.code === 'INTERACTION_CELL_MISSING'
    && item.message.includes(JSON.stringify(['accounts', 'payments'])) && item.message.includes('time')), true);
});

test('interaction matrix rejects an empty audit instead of treating it as no signal', () => {
  const result = auditInteractionMatrix({ schema_version: '1.0.0', source_revision: 0, views: [], interaction_matrix: [], interaction_candidates: [] });

  assert.equal(result.diagnostics.some((item) => item.code === 'INTERACTION_AUDIT_EMPTY'), true);
});

test('interaction matrix diagnoses duplicate, missing, extra, disappearing, and orphan cells independently', async () => {
  const artifact = await fixture('interaction-invalid.json');

  const result = auditInteractionMatrix(artifact);
  const codes = new Set(result.diagnostics.map((item) => item.code));

  assert.equal(codes.has('INTERACTION_CELL_DUPLICATE'), true);
  assert.equal(codes.has('INTERACTION_CELL_MISSING'), true);
  assert.equal(codes.has('INTERACTION_CELL_EXTRA'), true);
  assert.equal(codes.has('INTERACTION_CANDIDATE_MISSING'), true);
  assert.equal(codes.has('INTERACTION_CANDIDATE_WITHOUT_CELL'), true);
  assert.equal(codes.has('INTERACTION_CANDIDATE_ON_NO_SIGNAL'), true);
});

test('interaction matrix reports the exact missing pair and dimension without depending on module order', async () => {
  const artifact = await fixture('interaction-valid.json');
  artifact.interaction_matrix = artifact.interaction_matrix.filter((/** @type {any} */ cell) => cell.dimension !== 'side-effect');

  const result = auditInteractionMatrix(artifact);

  assert.equal(result.diagnostics.some((item) => item.code === 'INTERACTION_CELL_MISSING'
    && item.message.includes(JSON.stringify(['orders', 'payments'])) && item.message.includes('side-effect')), true);
});

test('interaction matrix tuple keys cannot collide when schema-valid module IDs contain NUL', async () => {
  const artifact = await fixture('interaction-collision.json');

  const result = auditInteractionMatrix(artifact);
  const missing = result.diagnostics.filter((item) => item.code === 'INTERACTION_CELL_MISSING');

  assert.equal(artifact.interaction_matrix.length, 35);
  assert.equal(missing.length, 7);
  for (const dimension of INTERACTION_DIMENSIONS) assert.equal(missing.some(
    (item) => item.message.includes(JSON.stringify(['a\0b', 'c'])) && item.message.includes(dimension)
  ), true, dimension);
});

test('interaction matrix rejects dangling, cross-type, and multiple candidate dispositions', async () => {
  const crossType = await fixture('interaction-valid.json');
  crossType.interaction_candidates[0].disposition = 'blocker';
  assert.equal(auditInteractionMatrix(crossType).diagnostics.some((item) => item.code === 'CANDIDATE_DISPOSITION_NOT_EXACT'), true);

  const dangling = await fixture('interaction-valid.json');
  dangling.interaction_candidates[0].formal_view_id = 'view_missing';
  assert.equal(auditInteractionMatrix(dangling).diagnostics.some((item) => item.code === 'FORMAL_INTERACTION_VIEW_DANGLING'), true);

  const multiple = await fixture('interaction-valid.json');
  multiple.interaction_candidates[0].exploratory_id = 'exploratory_extra';
  assert.equal(auditInteractionMatrix(multiple).diagnostics.some((item) => item.code === 'CANDIDATE_DISPOSITION_NOT_EXACT'), true);

  const evidenceFree = await fixture('interaction-valid.json');
  evidenceFree.interaction_candidates[0].source_claim_ids = [];
  assert.equal(auditInteractionMatrix(evidenceFree).diagnostics.some((item) => item.code === 'FORMAL_CANDIDATE_EVIDENCE_REQUIRED'), true);

  const unsupportedView = await fixture('interaction-valid.json');
  unsupportedView.views[0].type = 'unsupported';
  assert.equal(auditInteractionMatrix(unsupportedView).diagnostics.some((item) => item.code === 'FORMAL_INTERACTION_VIEW_TYPE_INVALID'), true);
});

test('interaction matrix returns and counts only candidates attached to one candidate-status cell', async () => {
  const noCell = await fixture('interaction-valid.json');
  noCell.interaction_candidates[0].module_ids = ['orders', 'shipping'];
  const noCellResult = auditInteractionMatrix(noCell);
  assert.equal(noCellResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  assert.equal(noCellResult.diagnostics.some((item) => item.code === 'INTERACTION_CANDIDATE_WITHOUT_CELL'), true);
  assert.equal(noCellResult.diagnostics.some((item) => item.code === 'INTERACTION_CANDIDATE_MISSING'
    && item.message.includes('shared-entity')), true);

  const noSignal = await fixture('interaction-valid.json');
  noSignal.interaction_candidates[0].dimension = 'time';
  const noSignalResult = auditInteractionMatrix(noSignal);
  assert.equal(noSignalResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  assert.equal(noSignalResult.diagnostics.some((item) => item.code === 'INTERACTION_CANDIDATE_ON_NO_SIGNAL'), true);
  assert.equal(noSignalResult.diagnostics.some((item) => item.code === 'INTERACTION_CANDIDATE_MISSING'
    && item.message.includes('shared-entity')), true);

  const invalidOnly = await fixture('interaction-valid.json');
  invalidOnly.interaction_candidates[0].formal_view_id = 'view_missing';
  const invalidOnlyResult = auditInteractionMatrix(invalidOnly);
  assert.equal(invalidOnlyResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  assert.equal(invalidOnlyResult.diagnostics.some((item) => item.code === 'INTERACTION_CANDIDATE_MISSING'
    && item.message.includes('shared-entity')), true);
});

test('interaction matrix invalidates every duplicate candidate ID deterministically', async () => {
  const artifact = await fixture('interaction-valid.json');
  artifact.interaction_candidates[1].candidate_id = 'candidate_duplicate';
  artifact.interaction_candidates[2].candidate_id = 'candidate_duplicate';
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  assert.equal(validateUniqueStableIds(artifact).some((item) => item.code === 'DUPLICATE_STABLE_ID'), true);

  const reversed = structuredClone(artifact);
  reversed.views.reverse();
  reversed.interaction_matrix.reverse();
  reversed.interaction_candidates.reverse();
  for (const cell of reversed.interaction_matrix) cell.module_ids.reverse();
  for (const candidate of reversed.interaction_candidates) candidate.module_ids.reverse();

  const result = auditInteractionMatrix(artifact);
  assert.deepEqual(auditInteractionMatrix(reversed), result);
  assert.equal(result.candidates.some((candidate) => candidate.candidate_id === 'candidate_duplicate'), false);
  assert.equal(result.diagnostics.filter((item) => item.code === 'INTERACTION_CANDIDATE_ID_INVALID').length, 1);
  assert.equal(result.diagnostics.filter((item) => item.code === 'INTERACTION_CANDIDATE_MISSING').length, 2);
});

test('interaction matrix rejects empty and unrelated formal target views without counting the candidate', async () => {
  const empty = await fixture('interaction-valid.json');
  empty.views[0].elements = [];
  const emptyResult = auditInteractionMatrix(empty);
  assert.equal(emptyResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  assert.equal(emptyResult.diagnostics.some((item) => item.code === 'FORMAL_INTERACTION_VIEW_EMPTY'), true);
  assert.equal(emptyResult.diagnostics.some((item) => item.code === 'INTERACTION_CANDIDATE_MISSING'
    && item.message.includes('shared-entity')), true);

  const unrelated = await fixture('interaction-valid.json');
  unrelated.views[0].elements[0].source_claim_ids = ['claim_other'];
  const unrelatedResult = auditInteractionMatrix(unrelated);
  assert.equal(unrelatedResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  assert.equal(unrelatedResult.diagnostics.some((item) => item.code === 'FORMAL_INTERACTION_VIEW_SUPPORT_MISMATCH'), true);

  const invalidGraph = await fixture('interaction-valid.json');
  invalidGraph.views[0] = {
    view_id: 'view_orders', type: 'flow', scope: 'orders', source_claim_ids: ['claim_shared'],
    elements: [
      { element_id: 'node_end', kind: 'flow-node', node_type: 'end', label: 'End', source_claim_ids: ['claim_shared'], model_refs: [] },
      { element_id: 'edge_self', kind: 'flow-edge', from_element_id: 'edge_self', to_element_id: 'node_end', condition: 'Always', result: 'End', sequence: 0, source_claim_ids: ['claim_shared'], model_refs: [] }
    ],
    relations: []
  };
  assert.deepEqual(validateAgainstSchema(invalidGraph, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(invalidGraph), []);
  const invalidGraphResult = auditInteractionMatrix(invalidGraph);
  assert.equal(invalidGraphResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  assert.equal(invalidGraphResult.diagnostics.some((item) => item.code === 'FORMAL_INTERACTION_VIEW_INVALID'), true);
});

test('interaction matrix preserves a formal candidate whose source is proven through E2 modeled ancestry', async () => {
  const artifact = await fixture('interaction-valid.json');
  artifact.views[0].source_claim_ids = ['claim_model'];
  artifact.views[0].elements[0].source_claim_ids = [];
  artifact.views[0].elements[0].model_refs = ['claim_model'];
  artifact.interaction_candidates[0].source_claim_ids = ['claim_parent'];
  const graph = { claimsById: new Map([
    ['claim_shared', { claim_id: 'claim_shared', level: 'E3', kind: 'requirement', scope: '*' }],
    ['claim_parent', { claim_id: 'claim_parent', level: 'E3', kind: 'requirement', scope: 'orders' }],
    ['claim_model', { claim_id: 'claim_model', level: 'E2', kind: 'model-element', derivation_target: 'model-element', scope: 'orders', parent_claim_ids: ['claim_parent'] }]
  ]) };
  assert.deepEqual(validateAgainstSchema(artifact, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(artifact), []);
  assert.deepEqual(validateBehaviorViews(graph, artifact).diagnostics, []);

  const result = auditInteractionMatrix(artifact);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), true);
});

test('interaction matrix rejects duplicate state and nested class identities in formal targets deterministically', async () => {
  const duplicateState = await fixture('interaction-valid.json');
  duplicateState.views[0] = {
    view_id: 'view_orders', type: 'state', scope: 'orders', source_claim_ids: ['claim_shared'],
    elements: [
      { element_id: 'state_ready_a', kind: 'state', state: 'ready', source_claim_ids: ['claim_shared'], model_refs: [] },
      { element_id: 'state_ready_b', kind: 'state', state: 'ready', source_claim_ids: ['claim_shared'], model_refs: [] },
      { element_id: 'transition_retry', kind: 'transition', from_state: 'ready', event: 'retry', to_state: 'ready', condition: 'Retry', transition_order: ['retry'], source_claim_ids: ['claim_shared'], model_refs: [] }
    ], relations: []
  };
  assert.deepEqual(validateAgainstSchema(duplicateState, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(duplicateState), []);
  const stateResult = auditInteractionMatrix(duplicateState);
  assert.equal(stateResult.diagnostics.some((item) => item.code === 'STATE_NAME_DUPLICATE'
    && item.path === '/views/view_orders/state_names/ready'), true);
  assert.equal(stateResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  assert.equal(stateResult.diagnostics.some((item) => item.code === 'INTERACTION_CANDIDATE_MISSING'
    && item.message.includes('shared-entity')), true);
  const reversedState = structuredClone(duplicateState);
  reversedState.views[0].elements.reverse();
  assert.deepEqual(auditInteractionMatrix(reversedState), stateResult);

  const duplicateClass = await fixture('interaction-valid.json');
  duplicateClass.views[0] = {
    view_id: 'view_orders', type: 'input-domain', scope: 'orders', source_claim_ids: ['claim_shared'],
    elements: [{
      element_id: 'input_primary', kind: 'input-domain', domain: 'amount',
      classes: [{ class_id: 'class_shared', label: 'first' }, { class_id: 'class_shared', label: 'second' }],
      bounds: { lower: 1, upper: 10, inclusive: true }, source_claim_ids: ['claim_shared'], model_refs: []
    }], relations: []
  };
  assert.deepEqual(validateAgainstSchema(duplicateClass, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(duplicateClass), []);
  const classResult = auditInteractionMatrix(duplicateClass);
  assert.equal(classResult.diagnostics.some((item) => item.code === 'INPUT_CLASS_ID_DUPLICATE'
    && item.path === '/views/view_orders/elements/input_primary/classes/class_shared'), true);
  assert.equal(classResult.candidates.some((candidate) => candidate.candidate_id === 'candidate_formal'), false);
  const reversedClass = structuredClone(duplicateClass);
  reversedClass.views[0].elements[0].classes.reverse();
  assert.deepEqual(auditInteractionMatrix(reversedClass), classResult);
});

test('interaction matrix accepts a unique state self-transition and class IDs reused across input elements', async () => {
  const selfTransition = await fixture('interaction-valid.json');
  selfTransition.views[0] = {
    view_id: 'view_orders', type: 'state', scope: 'orders', source_claim_ids: ['claim_shared'],
    elements: [
      { element_id: 'state_ready', kind: 'state', state: 'ready', source_claim_ids: ['claim_shared'], model_refs: [] },
      { element_id: 'transition_retry', kind: 'transition', from_state: 'ready', event: 'retry', to_state: 'ready', condition: 'Retry', transition_order: ['retry'], source_claim_ids: ['claim_shared'], model_refs: [] }
    ], relations: []
  };
  assert.deepEqual(validateAgainstSchema(selfTransition, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(selfTransition), []);
  assert.deepEqual(auditInteractionMatrix(selfTransition).diagnostics, []);

  const localClasses = await fixture('interaction-valid.json');
  localClasses.views[0] = {
    view_id: 'view_orders', type: 'input-domain', scope: 'orders', source_claim_ids: ['claim_shared'],
    elements: [
      { element_id: 'input_primary', kind: 'input-domain', domain: 'amount', classes: [{ class_id: 'class_shared', label: 'primary' }], bounds: { lower: 1, upper: 10, inclusive: true }, source_claim_ids: ['claim_shared'], model_refs: [] },
      { element_id: 'input_secondary', kind: 'input-domain', domain: 'quantity', classes: [{ class_id: 'class_shared', label: 'secondary' }], bounds: { lower: 1, upper: 5, inclusive: true }, source_claim_ids: ['claim_shared'], model_refs: [] }
    ], relations: []
  };
  assert.deepEqual(validateAgainstSchema(localClasses, behaviorViewsSchema), []);
  assert.deepEqual(validateUniqueStableIds(localClasses), []);
  assert.deepEqual(auditInteractionMatrix(localClasses).diagnostics, []);
});

test('interaction matrix module universe comes only from declared matrix and candidate module IDs', async () => {
  const artifact = await fixture('interaction-no-signal.json');
  artifact.views.push({ view_id: 'view_wholly_omitted', type: 'flow', scope: 'shipping', source_claim_ids: [], elements: [], relations: [] });

  assert.deepEqual(auditInteractionMatrix(artifact), { candidates: [], diagnostics: [] });
});

test('interaction matrix audits 120 declared modules and 49,980 cells in bounded time', () => {
  const modules = Array.from({ length: 120 }, (_, index) => `module_${String(index).padStart(3, '0')}`);
  const matrix = [];
  for (let left = 0; left < modules.length; left += 1) {
    for (let right = left + 1; right < modules.length; right += 1) {
      for (const dimension of INTERACTION_DIMENSIONS) matrix.push({
        module_ids: [modules[left], modules[right]], dimension, status: 'checked-no-signal'
      });
    }
  }
  const artifact = { schema_version: '1.0.0', source_revision: 0, views: [], interaction_matrix: matrix, interaction_candidates: [] };

  const startedAt = performance.now();
  const result = auditInteractionMatrix(artifact);
  const elapsed = performance.now() - startedAt;

  assert.equal(matrix.length, 49_980);
  assert.deepEqual(result, { candidates: [], diagnostics: [] });
  assert.equal(elapsed < 5_000, true, `120-module audit took ${elapsed.toFixed(1)}ms`);
});

test('interaction matrix output is deterministic across set-like cell, module, candidate, and view order', async () => {
  const artifact = await fixture('interaction-valid.json');
  const frozenInput = structuredClone(artifact);
  const reordered = structuredClone(artifact);
  reordered.views.reverse();
  reordered.interaction_matrix.reverse();
  reordered.interaction_candidates.reverse();
  for (const cell of reordered.interaction_matrix) cell.module_ids.reverse();
  for (const candidate of reordered.interaction_candidates) candidate.module_ids.reverse();

  assert.deepEqual(auditInteractionMatrix(reordered), auditInteractionMatrix(artifact));
  assert.deepEqual(artifact, frozenInput);
});
