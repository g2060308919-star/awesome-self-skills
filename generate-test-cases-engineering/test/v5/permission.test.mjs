import assert from 'node:assert/strict';
import test from 'node:test';

import { applyPermissionCoordinateAnswer, derivePermissionMatrices, permissionCoordinateEvidenceDigest, validatePermissionMatrixReview } from '../../src/v5/permission.mjs';

const root = `sha256:${'a'.repeat(64)}`;
const registryDigest = `sha256:${'b'.repeat(64)}`;

/** @param {string} coordinate @param {any} value @param {string} suffix */
function sourceEvidence(coordinate, value, suffix) {
  const base = { evidence_kind: 'source', coordinate, value, locator_id: `loc-${suffix}`, source_span: { start_scalar: 0, end_scalar: 1, excerpt: suffix, excerpt_digest: `sha256:${suffix.repeat(64).slice(0, 64)}` } };
  return { ...base, coordinate_evidence_digest: permissionCoordinateEvidenceDigest(base) };
}

function permissionSeed(ambiguousRole = false) {
  const roleCandidates = [sourceEvidence('role', { kind: 'requirements_ref', ref: { kind: 'source_unit', source_unit_id: 'role-admin', source_digest: root } }, '1')];
  if (ambiguousRole) roleCandidates.push(sourceEvidence('role', { kind: 'requirements_ref', ref: { kind: 'source_unit', source_unit_id: 'role-owner', source_digest: root } }, '2'));
  const candidate = {
    candidate_id: `psc5_${'1'.repeat(64)}`, scope_group_id: `psg5_${'2'.repeat(64)}`, locator_id: 'loc-permission',
    source_span: { start_scalar: 0, end_scalar: 9, excerpt: '管理员查看订单', excerpt_digest: `sha256:${'3'.repeat(64)}` },
    coordinate_slots: {
      role_candidates: roleCandidates,
      resource_candidates: [sourceEvidence('resource', { kind: 'requirements_ref', ref: { kind: 'source_unit', source_unit_id: 'orders', source_digest: root } }, '4')],
      action_candidates: [sourceEvidence('action', 'view', '5')], context_candidates: [sourceEvidence('context', { context_key: 'tenant:self' }, '6')]
    },
    signaled_dimensions: [sourceEvidence('permission_dimension', 'decision', '7'), sourceEvidence('permission_dimension', 'denial_behavior', '8'), sourceEvidence('permission_dimension', 'data_scope', '9')], detector_codes: ['permission-language']
  };
  return { seed_digest: `sha256:${'c'.repeat(64)}`, permission_derivation_registry_digest: registryDigest, permission_scope_candidates: [candidate], permission_scope_groups: [{ scope_group_id: candidate.scope_group_id, permission_scope_candidate_ids: [candidate.candidate_id] }] };
}

test('permission derivation emits one cell per signaled dimension from unique typed coordinates', () => {
  const matrices = derivePermissionMatrices(root, permissionSeed(false), registryDigest);
  assert.equal(matrices.length, 1);
  assert.equal(matrices[0].required_cells.length, 3);
  assert.deepEqual(matrices[0].required_cells.map((cell) => cell.permission_dimension).sort(), ['data_scope', 'decision', 'denial_behavior']);
  assert.equal(matrices[0].candidate_routes[0].kind, 'required_cells');
  assert.ok(matrices[0].required_cells.every((cell) => /^prc5_[0-9a-f]{64}$/u.test(cell.required_cell_key)));
});

test('multi-coordinate ambiguity creates one exact group gap and a typed Decision closes it deterministically', () => {
  const seed = permissionSeed(true);
  const unresolved = derivePermissionMatrices(root, seed, registryDigest)[0];
  assert.equal(unresolved.required_cells.length, 0);
  assert.equal(unresolved.candidate_routes[0].kind, 'semantic_gap');
  assert.deepEqual(/** @type {Record<string,any>} */ (unresolved.candidate_routes[0]).unresolved_coordinates, ['role']);
  const group = seed.permission_scope_groups[0];
  const selected = seed.permission_scope_candidates[0].coordinate_slots.role_candidates[0];
  const answer = { scope_group_id: group.scope_group_id, permission_scope_candidate_ids: group.permission_scope_candidate_ids, unresolved_coordinates: ['role'], coordinate_resolutions: [{ coordinate: 'role', resolution: { resolution_kind: 'select_candidate', coordinate_evidence_digest: selected.coordinate_evidence_digest } }] };
  const nextSeed = applyPermissionCoordinateAnswer(seed, answer, { decision_id: 'decision-role', answer_value_digest: `sha256:${'d'.repeat(64)}` });
  const resolved = derivePermissionMatrices(root, nextSeed, registryDigest)[0];
  assert.equal(resolved.required_cells.length, 3);
  assert.equal(resolved.candidate_routes[0].kind, 'required_cells');
  assert.throws(() => applyPermissionCoordinateAnswer(seed, { ...answer, unresolved_coordinates: ['role', 'action'] }, { decision_id: 'decision-role', answer_value_digest: `sha256:${'d'.repeat(64)}` }), /PERMISSION_MATRIX_INCOMPLETE/u);
});

test('permission matrix review covers exact cells and keeps decision, denial, and data-scope outcomes independent', () => {
  const matrix = derivePermissionMatrices(root, permissionSeed(false), registryDigest)[0];
  const decision = matrix.required_cells.find((cell) => cell.permission_dimension === 'decision');
  assert.ok(decision);
  const reviews = matrix.required_cells.map((cell) => ({ required_cell_key: cell.required_cell_key, disposition: cell.permission_dimension === 'decision'
    ? { kind: 'formal', outcome: { permission_dimension: 'decision', action_ref: 'view', expected: 'deny' }, basis: [{ kind: 'claim', claim_id: 'claim-permission' }] }
    : cell.permission_dimension === 'denial_behavior'
      ? { kind: 'formal', outcome: { permission_dimension: 'denial_behavior', decision_cell_key: /** @type {Record<string,any>} */ (decision).required_cell_key, denial_contract_ref: { kind: 'accepted', ref: { contract_id: 'deny-ui', contract_kind: 'denial_behavior', semantic_root_digest: root } } }, basis: [{ kind: 'claim', claim_id: 'claim-permission' }] }
      : { kind: 'semantic_gap', gap_ref: { kind: 'accepted_gap', semantic_gap_id: 'gap-data-scope' } } }));
  assert.equal(validatePermissionMatrixReview(matrix, { matrix_id: matrix.matrix_id, seed_digest: matrix.seed_digest, cell_dispositions: reviews }, root).length, 3);
  assert.throws(() => validatePermissionMatrixReview(matrix, { matrix_id: matrix.matrix_id, seed_digest: matrix.seed_digest, cell_dispositions: reviews.slice(1) }, root), /PERMISSION_MATRIX_INCOMPLETE/u);
});
