import { canonicalV5Stringify } from './canonical-v5.mjs';
import { typedContractRefKey } from './behavior-contracts.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

const COORDINATES = Object.freeze(['role', 'resource', 'action', 'context', 'permission_dimension']);
const ACTIONS = new Set(['discover', 'enter', 'view', 'query', 'mutate']);
const DIMENSIONS = new Set(['decision', 'denial_behavior', 'data_scope']);

/** @param {Record<string,any>} evidence */
export function permissionCoordinateEvidenceDigest(evidence) {
  const payload = evidence.evidence_kind === 'source'
    ? { evidence_kind: 'source', coordinate: evidence.coordinate, value: evidence.value, locator_id: evidence.locator_id, source_span: evidence.source_span }
    : { evidence_kind: 'decision', coordinate: evidence.coordinate, value: evidence.value, decision_id: evidence.decision_id, answer_value_digest: evidence.answer_value_digest };
  return canonicalObjectDigest(payload);
}

/** @param {Record<string,any>} candidate */
function unresolvedCoordinates(candidate) {
  /** @type {string[]} */
  const unresolved = [];
  const slots = candidate.coordinate_slots;
  if (slots.role_candidates.length !== 1) unresolved.push('role');
  if (slots.resource_candidates.length !== 1) unresolved.push('resource');
  if (slots.action_candidates.length !== 1) unresolved.push('action');
  if (slots.context_candidates.length !== 1) unresolved.push('context');
  const dimensions = /** @type {Array<Record<string,any>>} */ (candidate.signaled_dimensions).map((item) => item.value);
  if (dimensions.length !== new Set(dimensions).size || dimensions.filter((/** @type {string} */ value) => value === 'decision').length !== 1 || dimensions.some((/** @type {string} */ value) => !DIMENSIONS.has(value))) unresolved.push('permission_dimension');
  return COORDINATES.filter((coordinate) => unresolved.includes(coordinate));
}

/** @param {Record<string,any>} evidence @param {string} coordinate */
function verifyEvidence(evidence, coordinate) {
  if (evidence.coordinate !== coordinate || evidence.coordinate_evidence_digest !== permissionCoordinateEvidenceDigest(evidence)) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission coordinate evidence digest is invalid.');
}

/**
 * @param {string} semanticRootDigest
 * @param {Record<string,any>} seed
 * @param {string} registryDigest
 */
export function derivePermissionMatrices(semanticRootDigest, seed, registryDigest) {
  if (seed.permission_derivation_registry_digest !== registryDigest) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'Permission derivation Registry digest is stale.');
  const candidateById = new Map(/** @type {Array<Record<string,any>>} */ (seed.permission_scope_candidates).map((candidate) => [candidate.candidate_id, candidate]));
  return /** @type {Array<Record<string,any>>} */ (seed.permission_scope_groups).map((group) => {
    const maybeCandidates = /** @type {string[]} */ (group.permission_scope_candidate_ids).map((id) => candidateById.get(id));
    if (maybeCandidates.length === 0 || maybeCandidates.some((candidate) => !candidate || candidate.scope_group_id !== group.scope_group_id)) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission scope group membership is invalid.');
    const candidates = /** @type {Array<Record<string,any>>} */ (maybeCandidates);
    const unresolved = COORDINATES.filter((coordinate) => candidates.some((candidate) => unresolvedCoordinates(candidate).includes(coordinate)));
    const resolvable = unresolved.length === 0;
    const roleRefs = resolvable ? candidates.map((candidate) => ({ coordinate: 'role', coordinate_evidence_digest: candidate.coordinate_slots.role_candidates[0].coordinate_evidence_digest })) : [];
    const resourceRefs = resolvable ? candidates.map((candidate) => ({ coordinate: 'resource', coordinate_evidence_digest: candidate.coordinate_slots.resource_candidates[0].coordinate_evidence_digest })) : [];
    const actionRefs = resolvable ? candidates.map((candidate) => candidate.coordinate_slots.action_candidates[0].value) : [];
    const contexts = resolvable ? candidates.map((candidate) => ({ context_key: candidate.coordinate_slots.context_candidates[0].value.context_key, context_ref: { coordinate: 'context', coordinate_evidence_digest: candidate.coordinate_slots.context_candidates[0].coordinate_evidence_digest } })) : [];
    const roleDomain = { role_refs: [...new Map(roleRefs.map((/** @type {Record<string,any>} */ ref) => [canonicalV5Stringify(ref), ref])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))), basis: [] };
    const matrixScope = { resource_refs: [...new Map(resourceRefs.map((/** @type {Record<string,any>} */ ref) => [canonicalV5Stringify(ref), ref])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))), action_refs: [...new Set(actionRefs)].sort(), contexts: [...new Map(contexts.map((/** @type {Record<string,any>} */ ref) => [canonicalV5Stringify(ref), ref])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))), basis: [] };
    const matrixId = stableV5Id('permission_matrix_seed', { input_semantic_root_digest: semanticRootDigest, permission_derivation_registry_digest: registryDigest, scope_candidate_ids: group.permission_scope_candidate_ids, role_domain: roleDomain, matrix_scope: matrixScope });
    if (!resolvable) {
      const gapId = `reqgap5_${canonicalObjectDigest({ seed_digest: seed.seed_digest, scope_group_id: group.scope_group_id, permission_scope_candidate_ids: group.permission_scope_candidate_ids, unresolved_coordinates: unresolved }).slice(7)}`;
      return { matrix_id: matrixId, semantic_root_digest: semanticRootDigest, seed_digest: seed.seed_digest, permission_derivation_registry_digest: registryDigest, scope_candidate_ids: group.permission_scope_candidate_ids, candidate_routes: candidates.map((candidate) => ({ candidate_id: candidate.candidate_id, kind: 'semantic_gap', semantic_gap_id: gapId, unresolved_coordinates: unresolved })), role_domain: roleDomain, matrix_scope: matrixScope, required_cells: [] };
    }
    const cells = [];
    const routes = [];
    for (const candidate of candidates) {
      const role = candidate.coordinate_slots.role_candidates[0];
      const resource = candidate.coordinate_slots.resource_candidates[0];
      const action = candidate.coordinate_slots.action_candidates[0];
      const context = candidate.coordinate_slots.context_candidates[0];
      [role, resource, action, context].forEach((evidence, index) => verifyEvidence(evidence, COORDINATES[index]));
      const candidateCellKeys = [];
      for (const dimension of candidate.signaled_dimensions) {
        verifyEvidence(dimension, 'permission_dimension');
        const coordinateDigests = [role, resource, action, context, dimension].map((item) => item.coordinate_evidence_digest).sort();
        const cell = {
          required_cell_key: stableV5Id('permission_required_cell', { matrix_id: matrixId, role_value: role.value, resource_value: resource.value, action_value: action.value, context_value: context.value, permission_dimension_value: dimension.value, coordinate_evidence_digests: coordinateDigests }),
          role_ref: { coordinate: 'role', coordinate_evidence_digest: role.coordinate_evidence_digest }, resource_ref: { coordinate: 'resource', coordinate_evidence_digest: resource.coordinate_evidence_digest },
          action_ref: action.value, context_key: context.value.context_key, permission_dimension: dimension.value,
          coordinate_refs: { action: { coordinate: 'action', coordinate_evidence_digest: action.coordinate_evidence_digest }, context: { coordinate: 'context', coordinate_evidence_digest: context.coordinate_evidence_digest }, permission_dimension: { coordinate: 'permission_dimension', coordinate_evidence_digest: dimension.coordinate_evidence_digest } }
        };
        cells.push(cell); candidateCellKeys.push(cell.required_cell_key);
      }
      routes.push({ candidate_id: candidate.candidate_id, kind: 'required_cells', required_cell_keys: candidateCellKeys.sort() });
    }
    const uniqueCells = [...new Map(cells.map((cell) => [cell.required_cell_key, cell])).values()].sort((left, right) => left.required_cell_key.localeCompare(right.required_cell_key));
    return { matrix_id: matrixId, semantic_root_digest: semanticRootDigest, seed_digest: seed.seed_digest, permission_derivation_registry_digest: registryDigest, scope_candidate_ids: group.permission_scope_candidate_ids, candidate_routes: routes.sort((left, right) => left.candidate_id.localeCompare(right.candidate_id)), role_domain: roleDomain, matrix_scope: matrixScope, required_cells: uniqueCells };
  });
}

/** @param {Record<string,any>} seed @param {Record<string,any>} answer @param {{decision_id:string,answer_value_digest:string}} decision */
export function applyPermissionCoordinateAnswer(seed, answer, decision) {
  const group = /** @type {Array<Record<string,any>>} */ (seed.permission_scope_groups).find((item) => item.scope_group_id === answer.scope_group_id);
  if (!group || canonicalV5Stringify([...answer.permission_scope_candidate_ids].sort()) !== canonicalV5Stringify([...group.permission_scope_candidate_ids].sort())) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission answer scope group or candidate set is invalid.');
  const candidates = /** @type {Array<Record<string,any>>} */ (seed.permission_scope_candidates).filter((candidate) => group.permission_scope_candidate_ids.includes(candidate.candidate_id));
  const unresolved = COORDINATES.filter((coordinate) => candidates.some((candidate) => unresolvedCoordinates(candidate).includes(coordinate)));
  if (canonicalV5Stringify(answer.unresolved_coordinates) !== canonicalV5Stringify(unresolved) || !Array.isArray(answer.coordinate_resolutions) || answer.coordinate_resolutions.length !== unresolved.length || new Set(answer.coordinate_resolutions.map((item) => item.coordinate)).size !== unresolved.length) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission answer must cover the exact canonical unresolved coordinate set once.');
  const next = structuredClone(seed);
  for (const resolutionRow of answer.coordinate_resolutions) {
    if (!unresolved.includes(resolutionRow.coordinate)) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission answer contains an unadvertised coordinate.');
    let values;
    if (resolutionRow.resolution.resolution_kind === 'select_candidate') {
      const available = candidates.flatMap((candidate) => resolutionRow.coordinate === 'permission_dimension' ? candidate.signaled_dimensions : candidate.coordinate_slots[`${resolutionRow.coordinate}_candidates`]);
      const selected = available.find((item) => item.coordinate_evidence_digest === resolutionRow.resolution.coordinate_evidence_digest);
      if (!selected) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission answer selected an unadvertised coordinate candidate.');
      values = [selected.value];
    } else if (resolutionRow.resolution.resolution_kind === 'select_candidates' && resolutionRow.coordinate === 'permission_dimension') {
      const available = candidates.flatMap((candidate) => candidate.signaled_dimensions);
      values = /** @type {string[]} */ (resolutionRow.resolution.coordinate_evidence_digests).map((digest) => available.find((/** @type {Record<string,any>} */ item) => item.coordinate_evidence_digest === digest)?.value);
      if (values.some((/** @type {unknown} */ value) => value === undefined)) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission dimension selection is not advertised.');
    } else if (resolutionRow.resolution.resolution_kind === 'create_typed') {
      const payload = resolutionRow.resolution.payload;
      if (resolutionRow.coordinate === 'role' || resolutionRow.coordinate === 'resource') values = [{ kind: 'decision_defined', canonical_name: payload.canonical_name }];
      else if (resolutionRow.coordinate === 'action') values = [payload.action];
      else if (resolutionRow.coordinate === 'context') values = [{ context_key: payload.context_key }];
      else values = payload.dimensions;
    } else throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission coordinate resolution kind is invalid.');
    if (!Array.isArray(values) || values.length === 0 || (resolutionRow.coordinate === 'action' && values.some((value) => !ACTIONS.has(value))) || (resolutionRow.coordinate === 'permission_dimension' && (new Set(values).size !== values.length || values.some((value) => !DIMENSIONS.has(value)) || !values.includes('decision')))) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission coordinate typed value is invalid.');
    for (const candidate of /** @type {Array<Record<string,any>>} */ (next.permission_scope_candidates).filter((item) => group.permission_scope_candidate_ids.includes(item.candidate_id))) {
      const evidences = values.map((value) => {
        const base = { evidence_kind: 'decision', coordinate: resolutionRow.coordinate, value, decision_id: decision.decision_id, answer_value_digest: decision.answer_value_digest };
        return { ...base, coordinate_evidence_digest: permissionCoordinateEvidenceDigest(base) };
      });
      if (resolutionRow.coordinate === 'permission_dimension') candidate.signaled_dimensions = evidences;
      else candidate.coordinate_slots[`${resolutionRow.coordinate}_candidates`] = evidences;
    }
  }
  const { seed_digest: ignored, ...payload } = next;
  return { ...payload, seed_digest: canonicalObjectDigest(payload) };
}

/** @param {Record<string,any>} matrix @param {Record<string,any>} review @param {string} semanticRootDigest @param {{evidenceLevels:Map<string,string>,acceptedContractRefs?:Set<string>}} [evidenceContext] */
export function validatePermissionMatrixReview(matrix, review, semanticRootDigest, evidenceContext) {
  if (review.matrix_id !== matrix.matrix_id || review.seed_digest !== matrix.seed_digest || !Array.isArray(review.cell_dispositions) || review.cell_dispositions.length !== matrix.required_cells.length) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission review must cover every required cell exactly once.');
  const cellByKey = new Map(/** @type {Array<Record<string,any>>} */ (matrix.required_cells).map((cell) => [cell.required_cell_key, cell]));
  const dispositionByKey = new Map();
  for (const row of review.cell_dispositions) {
    const cell = cellByKey.get(row.required_cell_key);
    if (!cell || dispositionByKey.has(row.required_cell_key)) throw new V5ProtocolError('PERMISSION_MATRIX_INCOMPLETE', 'Permission review cell is unknown or duplicated.');
    dispositionByKey.set(row.required_cell_key, row.disposition);
    const disposition = row.disposition;
    if (disposition.kind === 'semantic_gap') { if (!disposition.gap_ref) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Permission gap reference is missing.'); continue; }
    if (disposition.kind === 'not_applicable') {
      const levels = (disposition.basis ?? []).map((/** @type {Record<string,any>} */ ref) => evidenceContext?.evidenceLevels.get(ref.claim_id ?? ref.decision_id));
      if (!Array.isArray(disposition.basis) || disposition.basis.length === 0 || (evidenceContext && levels.some((/** @type {string|undefined} */ level) => !level || !['E2', 'E3'].includes(level)))) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Permission N/A needs accepted E2/E3 basis.');
      continue;
    }
    if (disposition.kind !== 'formal' || !Array.isArray(disposition.basis) || disposition.basis.length === 0 || disposition.outcome.permission_dimension !== cell.permission_dimension) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Permission formal outcome does not match its cell.');
    const outcome = disposition.outcome;
    if (cell.permission_dimension === 'decision') {
      const expectedAllowed = cell.action_ref === 'discover' ? ['visible', 'hidden'] : ['allow', 'deny'];
      if (outcome.action_ref !== cell.action_ref || !expectedAllowed.includes(outcome.expected)) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Permission decision outcome is incompatible with the action.');
    } else if (cell.permission_dimension === 'data_scope') {
      const ref = outcome.data_scope_contract_ref?.ref;
      if (outcome.data_scope_contract_ref?.kind !== 'accepted' || !ref || ref.contract_kind !== 'data_scope' || ref.semantic_root_digest !== semanticRootDigest
        || (evidenceContext?.acceptedContractRefs && !evidenceContext.acceptedContractRefs.has(typedContractRefKey(ref)))) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Data-scope cell requires an accepted current-root typed contract.');
    }
  }
  for (const row of review.cell_dispositions) {
    const cell = cellByKey.get(row.required_cell_key);
    const outcome = row.disposition.outcome;
    if (cell?.permission_dimension !== 'denial_behavior' || row.disposition.kind !== 'formal') continue;
    const decisionCell = cellByKey.get(outcome.decision_cell_key);
    const decisionDisposition = dispositionByKey.get(outcome.decision_cell_key);
    const sameCoordinates = decisionCell && ['role_ref', 'resource_ref', 'action_ref', 'context_key'].every((key) => canonicalV5Stringify(decisionCell[key]) === canonicalV5Stringify(cell[key]));
    const ref = outcome.denial_contract_ref?.ref;
    if (!sameCoordinates || decisionCell.permission_dimension !== 'decision' || decisionDisposition?.kind !== 'formal' || decisionDisposition.outcome.expected !== 'deny'
      || outcome.denial_contract_ref?.kind !== 'accepted' || !ref || ref.contract_kind !== 'denial_behavior' || ref.semantic_root_digest !== semanticRootDigest
      || (evidenceContext?.acceptedContractRefs && !evidenceContext.acceptedContractRefs.has(typedContractRefKey(ref)))) throw new V5ProtocolError('PERMISSION_OUTCOME_UNRESOLVED', 'Denial behavior must bind the same-coordinate deny decision and an accepted typed contract.');
  }
  return structuredClone(review.cell_dispositions);
}
