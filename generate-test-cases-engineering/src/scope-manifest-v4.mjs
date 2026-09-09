import { canonicalStringify, digest } from './canonical.mjs';
import { discoverTopologyV4, snapshotTopologyInputV4 } from './topology-discovery.mjs';

const TOPOLOGY_ROLES = new Set(['primary', 'upstream', 'downstream', 'external']);
const ACCEPTANCE_ROLES = new Set(['primary_acceptance', 'dependency_contract', 'context_only']);
const DIMENSIONS = ['shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'];

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const a = Array.from(left, character => character.codePointAt(0) ?? 0);
  const b = Array.from(right, character => character.codePointAt(0) ?? 0);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {unknown} value */
function isText(value) { return typeof value === 'string' && value.trim().length > 0; }

/** @param {unknown} value @returns {string[]|null} */
function strings(value) {
  if (!Array.isArray(value) || value.some(item => !isText(item))) return null;
  const result = value.map(item => String(item).normalize('NFC'));
  return new Set(result).size === result.length ? result.sort(compareCodePoints) : null;
}

/** @param {unknown} value @param {string[]} expected @returns {value is Record<string, any>} */
function hasExactKeys(value, expected) {
  if (!isRecord(value)) return false;
  const actual = Reflect.ownKeys(value);
  return actual.every(key => typeof key === 'string')
    && actual.length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) { return { category, code, path, message }; }

/** @param {string[]} left @param {string[]} right */
function sameStrings(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/** @param {any} left @param {any} right */
function sameBoundary(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

/** @param {any} value @returns {any|null} */
function normalizeBoundary(value) {
  if (!hasExactKeys(value, ['from_module_ref', 'to_module_ref', 'channel', 'acceptance_scope'])
    || !isText(value.from_module_ref) || !isText(value.to_module_ref) || !isText(value.channel)
    || value.acceptance_scope !== 'contract_only') return null;
  return {
    from_module_ref: value.from_module_ref.normalize('NFC'),
    to_module_ref: value.to_module_ref.normalize('NFC'),
    channel: value.channel.normalize('NFC'), acceptance_scope: 'contract_only'
  };
}

/** @param {unknown} systemContext @param {Array<any>} diagnostics @returns {any|null} */
function normalizeTopologyContext(systemContext, diagnostics) {
  let value;
  try { value = snapshotTopologyInputV4(systemContext); } catch (error) {
    diagnostics.push(diagnostic('quality_failure', 'TOPOLOGY_SYSTEM_CONTEXT_INVALID', '/', String(error)));
    return null;
  }
  const baseKeys = ['canonical_source_structure', 'verified_claims', 'effective_scope_decisions'];
  const contextShapeValid = hasExactKeys(value, baseKeys)
    || hasExactKeys(value, [...baseKeys, 'semantic_topology_candidates']);
  if (!contextShapeValid
    || !Array.isArray(value.verified_claims) || !Array.isArray(value.effective_scope_decisions)) {
    diagnostics.push(diagnostic('quality_failure', 'TOPOLOGY_SYSTEM_CONTEXT_INVALID', '/', 'Compiler topology context must use the closed trusted shape.'));
    return null;
  }
  const claims = new Map();
  for (const [index, claim] of value.verified_claims.entries()) {
    const candidateIds = strings(claim?.candidate_ids);
    const roles = strings(claim?.authorized_topology_roles);
    if (!hasExactKeys(claim, ['claim_id', 'candidate_ids', 'authorized_topology_roles', 'authorized_boundaries', 'reviewable_interaction_cells'])
      || !isText(claim.claim_id) || !candidateIds || !roles || roles.some(role => !TOPOLOGY_ROLES.has(role))
      || !Array.isArray(claim.authorized_boundaries) || !Array.isArray(claim.reviewable_interaction_cells)
      || claim.authorized_boundaries.some(item => !normalizeBoundary(item))) {
      diagnostics.push(diagnostic('quality_failure', 'TOPOLOGY_VERIFIED_CLAIM_INVALID', `/verified_claims/${index}`, 'Verified topology Claim has an invalid closed authorization.'));
      continue;
    }
    if (claims.has(claim.claim_id)) {
      diagnostics.push(diagnostic('quality_failure', 'TOPOLOGY_VERIFIED_CLAIM_DUPLICATE', `/verified_claims/${index}/claim_id`, 'Verified Claim identity must be unique.'));
      continue;
    }
    claims.set(claim.claim_id, {
      claim_id: claim.claim_id, candidate_ids: candidateIds, authorized_topology_roles: roles,
      authorized_boundaries: claim.authorized_boundaries.map(normalizeBoundary),
      reviewable_interaction_cells: claim.reviewable_interaction_cells
    });
  }
  const decisions = new Map();
  for (const [index, decision] of value.effective_scope_decisions.entries()) {
    const candidateIds = strings(decision?.candidate_ids);
    if (!hasExactKeys(decision, ['decision_id', 'effective', 'candidate_ids']) || !isText(decision.decision_id)
      || typeof decision.effective !== 'boolean' || !candidateIds || decisions.has(decision.decision_id)) {
      diagnostics.push(diagnostic('quality_failure', 'TOPOLOGY_SCOPE_DECISION_INVALID', `/effective_scope_decisions/${index}`, 'Scope Decision must be unique, closed and explicitly effective or inactive.'));
      continue;
    }
    decisions.set(decision.decision_id, { ...decision, candidate_ids: candidateIds });
  }
  return { value, claims, decisions };
}

/**
 * Recompute compiler discovery from canonical source, then reconcile the
 * Adapter's review. The Adapter never supplies the candidate registry.
 * @param {unknown} review
 * @param {unknown} systemContext
 * @returns {any}
 */
export function compileScopeManifestV4(review, systemContext) {
  /** @type {Array<{category:string,code:string,path:string,message:string}>} */
  const diagnostics = [];
  const context = normalizeTopologyContext(systemContext, diagnostics);
  if (!context) return { discovery: null, scope_manifest: null, scope_manifest_digest: null, diagnostics };
  let discovery;
  try { discovery = discoverTopologyV4(context.value.canonical_source_structure, {
    semantic_candidates: context.value.semantic_topology_candidates ?? []
  }); } catch (error) {
    diagnostics.push(diagnostic('quality_failure', 'TOPOLOGY_DISCOVERY_FAILED', '/canonical_source_structure', String(error)));
    return { discovery: null, scope_manifest: null, scope_manifest_digest: null, diagnostics };
  }
  let input;
  try { input = snapshotTopologyInputV4(review); } catch (error) {
    diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_REVIEW_INPUT_INVALID', '/', String(error)));
    return { discovery, scope_manifest: null, scope_manifest_digest: null, diagnostics };
  }
  if (!hasExactKeys(input, ['discovery_digest', 'primary_surface', 'topology_review', 'topology_dispositions'])) {
    diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_REVIEW_INPUT_INVALID', '/', 'Topology review cannot submit or omit compiler-owned fields.'));
    return { discovery, scope_manifest: null, scope_manifest_digest: null, diagnostics };
  }
  if (input.discovery_digest !== discovery.discovery_digest) diagnostics.push(diagnostic(
    'adapter_revision', 'TOPOLOGY_DISCOVERY_DIGEST_MISMATCH', '/discovery_digest', 'Review must bind the current compiler discovery digest.'
  ));
  if (!isText(input.primary_surface)) diagnostics.push(diagnostic('adapter_revision', 'SCOPE_PRIMARY_SURFACE_INVALID', '/primary_surface', 'Primary surface must name a source-backed module.'));
  const topologyReview = input.topology_review;
  const expectedReviewKeys = ['reviewed_block_ids', 'reviewed_table_ids', 'reviewed_asset_digests', 'unresolved_candidate_ids'];
  if (!hasExactKeys(topologyReview, expectedReviewKeys)) diagnostics.push(diagnostic(
    'adapter_revision', 'TOPOLOGY_COMPLETENESS_WITNESS_INVALID', '/topology_review', 'Topology review completeness witness must use the closed shape.'
  ));
  const reviewedBlocks = strings(topologyReview?.reviewed_block_ids);
  const reviewedTables = strings(topologyReview?.reviewed_table_ids);
  const reviewedAssets = strings(topologyReview?.reviewed_asset_digests);
  const unresolvedSubmitted = strings(topologyReview?.unresolved_candidate_ids);
  if (!reviewedBlocks || !sameStrings(reviewedBlocks, discovery.scanned_units.reviewed_block_ids)
    || !reviewedTables || !sameStrings(reviewedTables, discovery.scanned_units.reviewed_table_ids)
    || !reviewedAssets || !sameStrings(reviewedAssets, discovery.scanned_units.reviewed_asset_digests)) diagnostics.push(diagnostic(
    'adapter_revision', 'TOPOLOGY_STRUCTURE_REVIEW_INCOMPLETE', '/topology_review', 'Every normative or uncertain text block, table and image asset must be reviewed exactly once.'
  ));
  if (!Array.isArray(input.topology_dispositions)) {
    diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_DISPOSITIONS_INVALID', '/topology_dispositions', 'Candidate dispositions must be an array.'));
    return { discovery, scope_manifest: null, scope_manifest_digest: null, diagnostics };
  }
  const candidateById = new Map(discovery.topology_candidates.map((/** @type {any} */ candidate) => [candidate.candidate_id, candidate]));
  const seen = new Set();
  /** @type {Array<any>} */
  const modules = [];
  /** @type {Array<any>} */
  const boundaries = [];
  const moduleRefByCandidateLabel = new Map();
  for (const [index, raw] of input.topology_dispositions.entries()) {
    const path = `/topology_dispositions/${index}`;
    if (!isRecord(raw) || !isText(raw.candidate_id) || !isText(raw.disposition)) {
      diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_DISPOSITION_INVALID', path, 'Candidate disposition is not a closed typed object.'));
      continue;
    }
    const candidate = candidateById.get(raw.candidate_id);
    if (!candidate || seen.has(raw.candidate_id)) {
      diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_CANDIDATE_SET_MISMATCH', `${path}/candidate_id`, 'Disposition must identify one current compiler candidate exactly once.'));
      continue;
    }
    seen.add(raw.candidate_id);
    if (raw.disposition === 'module') {
      if (!hasExactKeys(raw, ['candidate_id', 'disposition', 'module_ref', 'role', 'review_basis_claim_ids'])
        || candidate.kind !== 'module_mention' || !isText(raw.module_ref) || !TOPOLOGY_ROLES.has(raw.role)) {
        diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_MODULE_DISPOSITION_INVALID', path, 'Module disposition must map a module candidate using one supported topology role.'));
        continue;
      }
      const basis = strings(raw.review_basis_claim_ids);
      const validBasis = basis?.length && basis.every(claimId => {
        const claim = context.claims.get(claimId);
        return claim?.candidate_ids.includes(candidate.candidate_id) && claim.authorized_topology_roles.includes(raw.role);
      });
      if (!validBasis) {
        diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_ROLE_BASIS_INVALID', `${path}/review_basis_claim_ids`, 'Module role must be authorized by source-backed reviewed Claims for this candidate.'));
        continue;
      }
      const moduleRef = raw.module_ref.normalize('NFC');
      const priorRef = moduleRefByCandidateLabel.get(candidate.label);
      if (priorRef && priorRef !== moduleRef) diagnostics.push(diagnostic(
        'adapter_revision', 'TOPOLOGY_MODULE_ID_CONFLICT', `${path}/module_ref`, 'One compiler candidate label cannot map to multiple module IDs.'
      ));
      moduleRefByCandidateLabel.set(candidate.label, moduleRef);
      modules.push({ module_id: moduleRef, name: candidate.label, role: raw.role, claim_ids: basis });
    } else if (raw.disposition === 'boundary') {
      const boundary = normalizeBoundary({
        from_module_ref: raw.from_module_ref, to_module_ref: raw.to_module_ref,
        channel: raw.channel, acceptance_scope: raw.acceptance_scope
      });
      if (!hasExactKeys(raw, ['candidate_id', 'disposition', 'from_module_ref', 'to_module_ref', 'channel', 'acceptance_scope', 'review_basis_claim_ids'])
        || candidate.kind !== 'boundary_signal' || !boundary) {
        diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_BOUNDARY_DISPOSITION_INVALID', path, 'Boundary disposition must map one arrow candidate using the closed contract-only shape.'));
        continue;
      }
      const basis = strings(raw.review_basis_claim_ids);
      const validBasis = basis?.length && basis.every(claimId => {
        const claim = context.claims.get(claimId);
        return claim?.candidate_ids.includes(candidate.candidate_id)
          && claim.authorized_boundaries.some((/** @type {any} */ item) => sameBoundary(item, boundary));
      });
      if (!validBasis) {
        diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_BOUNDARY_BASIS_INVALID', `${path}/review_basis_claim_ids`, 'Boundary contract must be authorized by reviewed Claims for this arrow.'));
        continue;
      }
      boundaries.push({ from: boundary.from_module_ref, to: boundary.to_module_ref, channel: boundary.channel,
        acceptance_scope: boundary.acceptance_scope, claim_ids: basis, signal_label: candidate.label });
    } else if (raw.disposition === 'not_relevant') {
      if (!hasExactKeys(raw, ['candidate_id', 'disposition', 'reason', 'review_basis']) || !isText(raw.reason) || !isRecord(raw.review_basis)) {
        diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_NOT_RELEVANT_BASIS_INVALID', path, 'Not-relevant disposition requires a readable reason and supported basis.'));
        continue;
      }
      const basis = raw.review_basis;
      let valid = false;
      if (hasExactKeys(basis, ['kind', 'claim_ids']) && basis.kind === 'claim') {
        const ids = strings(basis.claim_ids);
        valid = Boolean(ids?.length && ids.every(id => context.claims.get(id)?.candidate_ids.includes(candidate.candidate_id)));
      } else if (hasExactKeys(basis, ['kind', 'decision_ids']) && basis.kind === 'decision') {
        const ids = strings(basis.decision_ids);
        valid = Boolean(ids?.length && ids.every(id => {
          const decision = context.decisions.get(id);
          return decision?.effective === true && decision.candidate_ids.includes(candidate.candidate_id);
        }));
      }
      if (!valid) diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_NOT_RELEVANT_BASIS_INVALID', `${path}/review_basis`, 'Not-relevant basis must be supported evidence or an effective scope Decision for this candidate.'));
    } else diagnostics.push(diagnostic('adapter_revision', 'TOPOLOGY_DISPOSITION_INVALID', `${path}/disposition`, 'Disposition must be module, boundary or not_relevant.'));
  }
  const unresolvedActual = discovery.topology_candidates.map((/** @type {any} */ candidate) => String(candidate.candidate_id))
    .filter((/** @type {string} */ candidateId) => !seen.has(candidateId)).sort(compareCodePoints);
  if (!unresolvedSubmitted || !sameStrings(unresolvedSubmitted, unresolvedActual)) diagnostics.push(diagnostic(
    'adapter_revision', 'TOPOLOGY_UNRESOLVED_WITNESS_MISMATCH', '/topology_review/unresolved_candidate_ids', 'Unresolved witness must equal the compiler candidate set without a disposition.'
  ));
  if (unresolvedActual.length) diagnostics.push(diagnostic(
    'adapter_revision', 'TOPOLOGY_CANDIDATE_REVIEW_INCOMPLETE', '/topology_dispositions', 'Every compiler candidate must receive exactly one reviewed disposition.'
  ));
  const mergedModules = new Map();
  for (const module of modules) {
    const current = mergedModules.get(module.module_id);
    if (current && current.role !== module.role) diagnostics.push(diagnostic(
      'adapter_revision', 'TOPOLOGY_MODULE_ROLE_CONFLICT', '/topology_dispositions', 'One module cannot receive conflicting topology roles.'
    ));
    else if (current) {
      current.name = [current.name, module.name].sort(compareCodePoints)[0];
      current.claim_ids = [...new Set([...current.claim_ids, ...module.claim_ids])].sort(compareCodePoints);
    } else mergedModules.set(module.module_id, { ...module });
  }
  const moduleIds = new Set(mergedModules.keys());
  for (const [index, boundary] of boundaries.entries()) {
    if (!moduleIds.has(boundary.from) || !moduleIds.has(boundary.to) || boundary.from === boundary.to) diagnostics.push(diagnostic(
      'adapter_revision', 'TOPOLOGY_BOUNDARY_ENDPOINT_INVALID', `/topology_dispositions/${index}`, 'Boundary endpoints must resolve to two distinct manifest modules.'
    ));
    const labels = boundary.signal_label.split(' → ');
    if (labels.length !== 2 || moduleRefByCandidateLabel.get(labels[0]) !== boundary.from
      || moduleRefByCandidateLabel.get(labels[1]) !== boundary.to) diagnostics.push(diagnostic(
      'adapter_revision', 'TOPOLOGY_BOUNDARY_ENDPOINT_MISMATCH', `/topology_dispositions/${index}`, 'Boundary endpoints must preserve the compiler-discovered arrow direction.'
    ));
  }
  const primarySurface = isText(input.primary_surface) ? input.primary_surface.normalize('NFC') : '';
  if (!moduleIds.has(primarySurface) || mergedModules.get(primarySurface)?.role !== 'primary') diagnostics.push(diagnostic(
    'adapter_revision', 'SCOPE_PRIMARY_SURFACE_INVALID', '/primary_surface', 'Primary surface must resolve to a source-backed primary module.'
  ));
  if (diagnostics.length) return { discovery, scope_manifest: null, scope_manifest_digest: null, diagnostics };
  const scope_manifest = {
    primary_surface: primarySurface,
    modules: [...mergedModules.values()].sort((left, right) => compareCodePoints(left.module_id, right.module_id)),
    boundaries: boundaries.map(({ signal_label, ...boundary }) => boundary).sort((left, right) => compareCodePoints(
      canonicalStringify([left.from, left.to, left.channel]), canonicalStringify([right.from, right.to, right.channel])
    ))
  };
  return { discovery, scope_manifest, scope_manifest_digest: `sha256:${digest(scope_manifest)}`, diagnostics: [] };
}

/** @param {unknown} manifest @returns {Array<{module_ids:string[],dimension:string}>} */
export function expectedInteractionCellsV4(manifest) {
  const value = snapshotTopologyInputV4(manifest);
  if (!hasExactKeys(value, ['primary_surface', 'modules', 'boundaries']) || !Array.isArray(value.modules)
    || !Array.isArray(value.boundaries) || !isText(value.primary_surface)) throw new TypeError('SCOPE_MANIFEST_INVALID');
  const moduleIds = value.modules.map(module => {
    if (!hasExactKeys(module, ['module_id', 'name', 'role', 'claim_ids']) || !isText(module.module_id)
      || !isText(module.name) || !TOPOLOGY_ROLES.has(module.role) || !strings(module.claim_ids)?.length) {
      throw new TypeError('SCOPE_MANIFEST_INVALID');
    }
    return module.module_id.normalize('NFC');
  }).sort(compareCodePoints);
  if (!moduleIds.length || new Set(moduleIds).size !== moduleIds.length || !moduleIds.includes(value.primary_surface)) {
    throw new TypeError('SCOPE_MANIFEST_INVALID');
  }
  /** @type {Array<{module_ids:string[],dimension:string}>} */
  const cells = [];
  if (moduleIds.length === 1) {
    for (const dimension of DIMENSIONS) cells.push({ module_ids: [moduleIds[0]], dimension });
  } else {
    for (let left = 0; left < moduleIds.length; left += 1) for (let right = left + 1; right < moduleIds.length; right += 1) {
      for (const dimension of DIMENSIONS) cells.push({ module_ids: [moduleIds[left], moduleIds[right]], dimension });
    }
  }
  return cells;
}

/** @param {unknown} value @returns {{module_ids:string[],dimension:string}|null} */
function normalizeCell(value) {
  if (!isRecord(value)) return null;
  const moduleIds = strings(value.module_ids);
  if (!moduleIds || !moduleIds.length || moduleIds.length > 2 || !DIMENSIONS.includes(value.dimension)) return null;
  return { module_ids: moduleIds, dimension: value.dimension };
}

/** @param {{module_ids:string[],dimension:string}} cell */
function cellKey(cell) { return canonicalStringify(cell); }

/** @param {unknown} systemContext @param {Array<any>} diagnostics @returns {Map<string,Set<string>>|null} */
function interactionClaims(systemContext, diagnostics) {
  let value;
  try { value = snapshotTopologyInputV4(systemContext); } catch (error) {
    diagnostics.push(diagnostic('quality_failure', 'INTERACTION_REVIEW_CONTEXT_INVALID', '/', String(error)));
    return null;
  }
  if (!hasExactKeys(value, ['verified_claims']) || !Array.isArray(value.verified_claims)) {
    diagnostics.push(diagnostic('quality_failure', 'INTERACTION_REVIEW_CONTEXT_INVALID', '/', 'Interaction review requires compiler-verified Claims.'));
    return null;
  }
  const claims = new Map();
  for (const [index, claim] of value.verified_claims.entries()) {
    if (!hasExactKeys(claim, ['claim_id', 'candidate_ids', 'authorized_topology_roles', 'authorized_boundaries', 'reviewable_interaction_cells'])
      || !isText(claim.claim_id) || claims.has(claim.claim_id) || !Array.isArray(claim.reviewable_interaction_cells)) {
      diagnostics.push(diagnostic('quality_failure', 'INTERACTION_REVIEW_CLAIM_INVALID', `/verified_claims/${index}`, 'Interaction Claim authorization must use the closed unique shape.'));
      continue;
    }
    const cells = /** @type {Array<{module_ids:string[],dimension:string}|null>} */ (claim.reviewable_interaction_cells.map(normalizeCell));
    if (cells.some(item => !item)) {
      diagnostics.push(diagnostic('quality_failure', 'INTERACTION_REVIEW_CLAIM_INVALID', `/verified_claims/${index}/reviewable_interaction_cells`, 'Reviewable cells must identify canonical manifest cells.'));
      continue;
    }
    const validCells = /** @type {Array<{module_ids:string[],dimension:string}>} */ (cells.filter((cell) => cell !== null));
    claims.set(claim.claim_id, new Set(validCells.map(cell => cellKey(cell))));
  }
  return claims;
}

/**
 * Validate an Adapter interaction audit against the cell set generated solely
 * from the compiler-owned Scope Manifest.
 * @param {unknown} manifest
 * @param {unknown} review
 * @param {unknown} systemContext
 * @returns {Array<{category:string,code:string,path:string,message:string}>}
 */
export function validateInteractionReviewV4(manifest, review, systemContext) {
  /** @type {Array<{category:string,code:string,path:string,message:string}>} */
  const diagnostics = [];
  let expected;
  try { expected = expectedInteractionCellsV4(manifest); } catch (error) {
    return [diagnostic('quality_failure', 'SCOPE_MANIFEST_INVALID', '/', String(error))];
  }
  const claims = interactionClaims(systemContext, diagnostics);
  let items;
  try { items = snapshotTopologyInputV4(review); } catch (error) {
    diagnostics.push(diagnostic('adapter_revision', 'INTERACTION_REVIEW_INVALID', '/', String(error)));
    return diagnostics;
  }
  if (!Array.isArray(items)) {
    diagnostics.push(diagnostic('adapter_revision', 'INTERACTION_REVIEW_INVALID', '/', 'Interaction review must be an array.'));
    return diagnostics;
  }
  const expectedKeys = new Set(expected.map(cellKey));
  const seen = new Set();
  for (const [index, item] of items.entries()) {
    const path = `/${index}`;
    const cell = normalizeCell(item);
    if (!cell || !isText(item.status) || !['candidate', 'checked-no-signal'].includes(item.status)) {
      diagnostics.push(diagnostic('adapter_revision', 'INTERACTION_REVIEW_CELL_INVALID', path, 'Interaction review item must identify one expected cell and one supported status.'));
      continue;
    }
    const key = cellKey(cell);
    if (!expectedKeys.has(key) || seen.has(key)) {
      diagnostics.push(diagnostic('adapter_revision', 'INTERACTION_REVIEW_CELL_SET_MISMATCH', path, 'Interaction review cannot add, duplicate or omit manifest-generated cells.'));
      continue;
    }
    seen.add(key);
    if (item.status === 'candidate') {
      if (!hasExactKeys(item, ['module_ids', 'dimension', 'status'])) diagnostics.push(diagnostic(
        'adapter_revision', 'INTERACTION_REVIEW_CELL_INVALID', path, 'Candidate cell uses the closed audit shape.'
      ));
      continue;
    }
    if (!hasExactKeys(item, ['module_ids', 'dimension', 'status', 'reviewed_claim_ids', 'review_basis'])) {
      diagnostics.push(diagnostic('adapter_revision', 'INTERACTION_NO_SIGNAL_BASIS_INVALID', path, 'Checked-no-signal requires reviewed Claims and review basis.'));
      continue;
    }
    const reviewedClaimIds = strings(item.reviewed_claim_ids);
    if (!reviewedClaimIds?.length || !isText(item.review_basis) || !claims
      || reviewedClaimIds.some(claimId => !claims.get(claimId)?.has(key))) diagnostics.push(diagnostic(
      'adapter_revision', 'INTERACTION_NO_SIGNAL_BASIS_INVALID', path, 'Checked-no-signal Claims must be verified for this exact module pair and dimension.'
    ));
  }
  if (seen.size !== expectedKeys.size) diagnostics.push(diagnostic(
    'adapter_revision', 'INTERACTION_REVIEW_INCOMPLETE', '/', 'Interaction audit must cover every manifest-generated cell exactly once.'
  ));
  return diagnostics.sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right)));
}

const ENTITY_KINDS = new Set(['fact', 'test_point', 'case']);
const ROLE_RANK = new Map([['context_only', 0], ['dependency_contract', 1], ['primary_acceptance', 2]]);

/** @param {unknown} value @param {'claim'|'decision'} kind @returns {any|null} */
function normalizeRoleAuthorization(value, kind) {
  const item = isRecord(value) ? value : {};
  const idField = kind === 'claim' ? 'claim_id' : 'decision_id';
  const keys = kind === 'claim'
    ? [idField, 'entity_id', 'scope_ref', 'acceptance_role', 'allows_upgrade_from']
    : [idField, 'effective', 'entity_id', 'scope_ref', 'acceptance_role', 'allows_upgrade_from'];
  const allowedFrom = strings(item.allows_upgrade_from);
  if (!hasExactKeys(item, keys) || !isText(item[idField]) || !isText(item.entity_id) || !isText(item.scope_ref)
    || !ACCEPTANCE_ROLES.has(item.acceptance_role) || !allowedFrom
    || allowedFrom.some(role => !ACCEPTANCE_ROLES.has(role))
    || (kind === 'decision' && typeof item.effective !== 'boolean')) return null;
  return {
    kind, basis_id: item[idField].normalize('NFC'), effective: kind === 'claim' ? true : item.effective,
    entity_id: item.entity_id.normalize('NFC'), scope_ref: item.scope_ref.normalize('NFC'),
    acceptance_role: item.acceptance_role, allows_upgrade_from: allowedFrom
  };
}

/** @param {unknown} systemContext @param {Array<any>} diagnostics @returns {any|null} */
function roleAuthorizations(systemContext, diagnostics) {
  let value;
  try { value = snapshotTopologyInputV4(systemContext); } catch (error) {
    diagnostics.push(diagnostic('quality_failure', 'ACCEPTANCE_ROLE_CONTEXT_INVALID', '/', String(error)));
    return null;
  }
  if (!hasExactKeys(value, ['claim_authorizations', 'decision_authorizations'])
    || !Array.isArray(value.claim_authorizations) || !Array.isArray(value.decision_authorizations)) {
    diagnostics.push(diagnostic('quality_failure', 'ACCEPTANCE_ROLE_CONTEXT_INVALID', '/', 'Role validation requires closed compiler authorization registries.'));
    return null;
  }
  const claims = new Map();
  const decisions = new Map();
  for (const [kind, source, target] of /** @type {const} */ ([
    ['claim', value.claim_authorizations, claims], ['decision', value.decision_authorizations, decisions]
  ])) {
    for (const [index, raw] of source.entries()) {
      const authorization = normalizeRoleAuthorization(raw, kind);
      if (!authorization || target.has(authorization.basis_id)) diagnostics.push(diagnostic(
        'quality_failure', 'ACCEPTANCE_ROLE_AUTHORIZATION_INVALID', `/${kind}_authorizations/${index}`, 'Role authorization must be unique, closed and semantically scoped.'
      ));
      else target.set(authorization.basis_id, authorization);
    }
  }
  return { claims, decisions };
}

/** @param {any} assignment @param {Map<string,any>} claims @param {Map<string,any>} decisions @returns {any[]|null} */
function assignmentBasis(assignment, claims, decisions) {
  let ids;
  let registry;
  if (Object.hasOwn(assignment, 'role_basis_claim_ids') && !Object.hasOwn(assignment, 'role_basis_decision_ids')) {
    ids = strings(assignment.role_basis_claim_ids); registry = claims;
  } else if (Object.hasOwn(assignment, 'role_basis_decision_ids') && !Object.hasOwn(assignment, 'role_basis_claim_ids')) {
    ids = strings(assignment.role_basis_decision_ids); registry = decisions;
  } else return null;
  if (!ids?.length) return null;
  const authorizations = ids.map(id => registry.get(id));
  if (authorizations.some(item => !item || item.effective !== true || item.entity_id !== assignment.entity_id
    || item.scope_ref !== assignment.scope_ref || item.acceptance_role !== assignment.acceptance_role)) return null;
  return authorizations;
}

/**
 * Validate source/Decision-backed Fact -> Test Point -> Case acceptance roles.
 * A stronger child role requires an explicit new authorization naming the
 * parent's weaker role; ordinary recompilation can never silently upgrade it.
 * @param {unknown} assignments
 * @param {unknown} systemContext
 * @returns {any}
 */
export function validateAcceptanceRoleAssignmentsV4(assignments, systemContext) {
  /** @type {Array<{category:string,code:string,path:string,message:string}>} */
  const diagnostics = [];
  const registries = roleAuthorizations(systemContext, diagnostics);
  let items;
  try { items = snapshotTopologyInputV4(assignments); } catch (error) {
    diagnostics.push(diagnostic('adapter_revision', 'ACCEPTANCE_ROLE_ASSIGNMENTS_INVALID', '/', String(error)));
    return { assignments: [], coverage: emptyCoverage(), diagnostics };
  }
  if (!Array.isArray(items)) {
    diagnostics.push(diagnostic('adapter_revision', 'ACCEPTANCE_ROLE_ASSIGNMENTS_INVALID', '/', 'Acceptance role assignments must be an array.'));
    return { assignments: [], coverage: emptyCoverage(), diagnostics };
  }
  const byId = new Map();
  /** @type {Array<{assignment:any,basis:any[],path:string}>} */
  const accepted = [];
  for (const [index, assignment] of items.entries()) {
    const path = `/${index}`;
    const expectedKeys = Object.hasOwn(assignment ?? {}, 'role_basis_claim_ids')
      ? ['entity_kind', 'entity_id', 'scope_ref', 'acceptance_role', 'parent_entity_ids', 'role_basis_claim_ids']
      : ['entity_kind', 'entity_id', 'scope_ref', 'acceptance_role', 'parent_entity_ids', 'role_basis_decision_ids'];
    const parents = strings(assignment?.parent_entity_ids);
    if (!hasExactKeys(assignment, expectedKeys) || !ENTITY_KINDS.has(assignment.entity_kind)
      || !isText(assignment.entity_id) || !isText(assignment.scope_ref) || !ACCEPTANCE_ROLES.has(assignment.acceptance_role)
      || !parents || byId.has(assignment.entity_id)) {
      diagnostics.push(diagnostic('adapter_revision', 'ACCEPTANCE_ROLE_ASSIGNMENT_INVALID', path, 'Role assignment must be closed, unique and use a supported entity and role.'));
      continue;
    }
    assignment.entity_id = assignment.entity_id.normalize('NFC');
    assignment.scope_ref = assignment.scope_ref.normalize('NFC');
    assignment.parent_entity_ids = parents;
    const basis = registries ? assignmentBasis(assignment, registries.claims, registries.decisions) : null;
    if (!basis) diagnostics.push(diagnostic(
      'adapter_revision', 'ACCEPTANCE_ROLE_BASIS_INVALID', path, 'Each acceptance role must be authorized for this exact entity and scope by Claims or an effective scope Decision.'
    ));
    byId.set(assignment.entity_id, assignment);
    accepted.push({ assignment, basis: basis ?? [], path });
  }
  for (const { assignment, basis, path } of accepted) {
    const parents = assignment.parent_entity_ids.map((/** @type {string} */ id) => byId.get(id));
    const expectedParentKind = assignment.entity_kind === 'test_point' ? 'fact' : assignment.entity_kind === 'case' ? 'test_point' : null;
    if ((assignment.entity_kind === 'fact' && assignment.parent_entity_ids.length !== 0)
      || (assignment.entity_kind !== 'fact' && assignment.parent_entity_ids.length === 0)
      || parents.some((/** @type {any} */ parent) => !parent || parent.entity_kind !== expectedParentKind
        || parent.scope_ref !== assignment.scope_ref)) {
      diagnostics.push(diagnostic('adapter_revision', 'ACCEPTANCE_ROLE_LINEAGE_INVALID', `${path}/parent_entity_ids`, 'Role lineage must follow Fact to Test Point to Case without missing parents.'));
      continue;
    }
    for (const parent of parents) {
      if ((ROLE_RANK.get(assignment.acceptance_role) ?? -1) > (ROLE_RANK.get(parent.acceptance_role) ?? -1)
        && !basis.some(item => item.allows_upgrade_from.includes(parent.acceptance_role))) diagnostics.push(diagnostic(
        'adapter_revision', 'ACCEPTANCE_ROLE_UPGRADE_UNAUTHORIZED', path, 'A child cannot upgrade its parent acceptance role without a new explicit Claim or Decision authorization.'
      ));
    }
  }
  const normalized = accepted.map(item => item.assignment).sort((left, right) => {
    const rank = new Map([['fact', 0], ['test_point', 1], ['case', 2]]);
    return (rank.get(left.entity_kind) ?? -1) - (rank.get(right.entity_kind) ?? -1) || compareCodePoints(left.entity_id, right.entity_id);
  });
  if (diagnostics.length) return {
    assignments: [], coverage: emptyCoverage(),
    diagnostics: diagnostics.sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right)))
  };
  const coverage = emptyCoverage();
  for (const assignment of normalized) if (assignment.entity_kind === 'test_point') {
    /** @type {any} */ (coverage)[assignment.acceptance_role] += 1;
  }
  coverage.primary_denominator = coverage.primary_acceptance;
  coverage.boundary_denominator = coverage.dependency_contract;
  return { assignments: normalized, coverage, diagnostics: diagnostics.sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right))) };
}

function emptyCoverage() {
  return { primary_acceptance: 0, dependency_contract: 0, context_only: 0, primary_denominator: 0, boundary_denominator: 0 };
}
