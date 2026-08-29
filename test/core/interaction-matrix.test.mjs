import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { auditInteractionMatrix, INTERACTION_DIMENSIONS } from '../../src/views/interaction-matrix.mjs';
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

test('interaction matrix uses exactly the seven frozen dimensions', () => {
  assert.deepEqual(INTERACTION_DIMENSIONS, [
    'shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'
  ]);
  assert.equal(Object.isFrozen(INTERACTION_DIMENSIONS), true);
});

test('interaction matrix fixtures stay schema-valid across semantic pass and failure boundaries', async () => {
  for (const name of ['interaction-valid.json', 'interaction-no-signal.json', 'interaction-three-modules.json', 'interaction-invalid.json']) {
    assert.deepEqual(validateAgainstSchema(await fixture(name), behaviorViewsSchema), [], name);
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
    && item.message.includes('accounts,payments') && item.message.includes('time')), true);
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
    && item.message.includes('orders,payments') && item.message.includes('side-effect')), true);
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

test('interaction matrix output is deterministic across set-like cell, module, candidate, and view order', async () => {
  const artifact = await fixture('interaction-valid.json');
  const reordered = structuredClone(artifact);
  reordered.views.reverse();
  reordered.interaction_matrix.reverse();
  reordered.interaction_candidates.reverse();
  for (const cell of reordered.interaction_matrix) cell.module_ids.reverse();
  for (const candidate of reordered.interaction_candidates) candidate.module_ids.reverse();

  assert.deepEqual(auditInteractionMatrix(reordered), auditInteractionMatrix(artifact));
});
