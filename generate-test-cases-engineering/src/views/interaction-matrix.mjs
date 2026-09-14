import { scopeContains } from '../decision-record.mjs';

export const INTERACTION_DIMENSIONS = Object.freeze([
  'shared-entity', 'role', 'client', 'interface-event',
  'time', 'concurrency', 'side-effect'
]);

const DIMENSION_SET = new Set(INTERACTION_DIMENSIONS);
const CELL_STATUSES = new Set(['checked-no-signal', 'candidate']);
const FORMAL_VIEW_TYPES = new Set(['flow', 'decision', 'state', 'input-domain', 'role', 'timing', 'integration']);
const VIEW_ELEMENT_KINDS = Object.freeze({
  flow: Object.freeze(['flow-node', 'flow-edge']),
  decision: Object.freeze(['decision-rule']),
  state: Object.freeze(['state', 'transition']),
  'input-domain': Object.freeze(['input-domain']),
  role: Object.freeze(['role-permission']),
  timing: Object.freeze(['timing-rule']),
  integration: Object.freeze(['integration-contract'])
});
const DISPOSITION_FIELDS = Object.freeze([
  'formal_view_id', 'exploratory_id'
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** @param {unknown} value */
function normalizedStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string' && item.trim().length > 0))]
    .sort(compareCodePoints);
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {Array<{category: string, code: string, path: string, message: string}>} diagnostics */
function sortDiagnostics(diagnostics) {
  const unique = new Map();
  for (const item of diagnostics) unique.set(JSON.stringify([item.category, item.code, item.path, item.message]), item);
  return [...unique.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([, item]) => item);
}

/** @param {string[]} moduleIds @param {string} dimension */
function cellKey(moduleIds, dimension) {
  return JSON.stringify([moduleIds, dimension]);
}

/** @param {string[]} moduleIds */
function moduleLabel(moduleIds) {
  return JSON.stringify(moduleIds);
}

/** @param {string} value */
function escapePointerSegment(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** @param {string[]} values */
function duplicateStrings(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort(compareCodePoints);
}

/** @param {string[]} moduleIds @param {string} dimension */
function cellPath(moduleIds, dimension) {
  return `/interaction_matrix/${escapePointerSegment(cellKey(moduleIds, dimension))}`;
}

/** @param {Record<string, unknown>} candidate */
function candidateSemanticKey(candidate) {
  return JSON.stringify([
    normalizedStrings(candidate.module_ids),
    typeof candidate.dimension === 'string' ? candidate.dimension : '',
    normalizedSemanticRefs(candidate.semantic_subject_refs)
  ]);
}

/** @param {unknown} value */
function normalizedSemanticRefs(value) {
  if (!Array.isArray(value)) return [];
  return [...new Map(value.filter(isObject).map((item) => [JSON.stringify(
    Object.fromEntries(Object.entries(item).sort(([left], [right]) => compareCodePoints(left, right)))
  ), item])).keys()].sort(compareCodePoints);
}

/** @param {Record<string, unknown>} candidate */
function candidatePath(candidate) {
  const candidateId = typeof candidate.candidate_id === 'string' && candidate.candidate_id.length > 0
    ? candidate.candidate_id : candidateSemanticKey(candidate);
  return `/interaction_candidates/${escapePointerSegment(candidateId)}`;
}

/** @param {string} viewType */
function relationEndpointKind(viewType) {
  if (viewType === 'flow') return 'flow-node';
  if (viewType === 'state') return 'state';
  const kinds = VIEW_ELEMENT_KINDS[/** @type {keyof typeof VIEW_ELEMENT_KINDS} */ (viewType)];
  return kinds?.length === 1 ? kinds[0] : null;
}

/** @param {Record<string, unknown>} view */
function formalViewIdentityDiagnostics(view) {
  const viewId = typeof view.view_id === 'string' ? view.view_id : '';
  const viewPath = `/views/${escapePointerSegment(viewId)}`;
  const elements = objectArray(view.elements);
  const diagnostics = [];
  if (view.type === 'state') {
    const stateNames = elements.flatMap((element) => element.kind === 'state' && typeof element.state === 'string'
      ? [element.state] : []);
    for (const stateName of duplicateStrings(stateNames)) diagnostics.push(diagnostic(
      'schema', 'STATE_NAME_DUPLICATE', `${viewPath}/state_names/${escapePointerSegment(stateName)}`,
      `state name "${stateName}" must be unique within its state view`
    ));
  }
  for (const element of elements) {
    if (element.kind !== 'input-domain') continue;
    const elementId = typeof element.element_id === 'string' ? element.element_id : '';
    const classIds = objectArray(element.classes).flatMap((item) => typeof item.class_id === 'string' ? [item.class_id] : []);
    for (const classId of duplicateStrings(classIds)) diagnostics.push(diagnostic(
      'schema', 'INPUT_CLASS_ID_DUPLICATE',
      `${viewPath}/elements/${escapePointerSegment(elementId)}/classes/${escapePointerSegment(classId)}`,
      `input-domain class_id "${classId}" must be unique within element "${elementId}"`
    ));
  }
  return diagnostics;
}

/** @param {Record<string, unknown>} view */
function formalViewStructureValid(view) {
  if (formalViewIdentityDiagnostics(view).length > 0) return false;
  const type = typeof view.type === 'string' ? view.type : '';
  const legalKinds = VIEW_ELEMENT_KINDS[/** @type {keyof typeof VIEW_ELEMENT_KINDS} */ (type)];
  if (!legalKinds || typeof view.scope !== 'string' || view.scope.length === 0) return false;
  const elements = objectArray(view.elements);
  const relations = objectArray(view.relations);
  const kindsById = new Map();
  for (const element of elements) {
    const elementId = typeof element.element_id === 'string' ? element.element_id : '';
    const kind = typeof element.kind === 'string' ? element.kind : '';
    if (elementId.length === 0 || kindsById.has(elementId) || !legalKinds.includes(kind)) return false;
    if (normalizedStrings(element.source_claim_ids).length + normalizedStrings(element.model_refs).length === 0) return false;
    kindsById.set(elementId, kind);
  }
  for (const element of elements) {
    if (element.kind !== 'flow-edge') continue;
    if (typeof element.from_element_id !== 'string' || kindsById.get(element.from_element_id) !== 'flow-node') return false;
    if (typeof element.to_element_id !== 'string' || kindsById.get(element.to_element_id) !== 'flow-node') return false;
  }
  if (type === 'state') {
    const states = new Set(elements.flatMap((element) => element.kind === 'state' && typeof element.state === 'string' ? [element.state] : []));
    for (const element of elements) {
      if (element.kind !== 'transition') continue;
      if (typeof element.from_state !== 'string' || !states.has(element.from_state)) return false;
      if (typeof element.to_state !== 'string' || !states.has(element.to_state)) return false;
    }
  }
  const expectedRelationKind = relationEndpointKind(type);
  for (const relation of relations) {
    if (normalizedStrings(relation.source_claim_ids).length + normalizedStrings(relation.model_refs).length === 0) return false;
    if (typeof relation.from_element_id !== 'string' || !kindsById.has(relation.from_element_id)) return false;
    if (typeof relation.to_element_id !== 'string' || !kindsById.has(relation.to_element_id)) return false;
    if (expectedRelationKind !== null && (kindsById.get(relation.from_element_id) !== expectedRelationKind
      || kindsById.get(relation.to_element_id) !== expectedRelationKind)) return false;
  }
  return true;
}

/**
 * Reconcile the fixed cross-module signal audit without interpreting business semantics.
 * The frozen artifact has no authoritative module registry. Therefore the seven-dimension
 * grid is complete relative only to the universe declared by matrix and candidate module_ids;
 * a wholly omitted module is intentionally not inferred from behavior-view scope.
 * @param {unknown} artifact
 */
export function auditInteractionMatrix(artifact) {
  const input = isObject(artifact) ? artifact : {};
  const matrix = objectArray(input.interaction_matrix);
  const submittedCandidates = objectArray(input.interaction_candidates);
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];

  if (matrix.length === 0) diagnostics.push(diagnostic(
    'coverage', 'INTERACTION_AUDIT_EMPTY', '/interaction_matrix', 'an empty interaction matrix cannot represent a completed audit'
  ));

  const moduleIds = new Set();
  for (const record of [...matrix, ...submittedCandidates]) {
    for (const moduleId of normalizedStrings(record.module_ids)) moduleIds.add(moduleId);
  }
  const modules = [...moduleIds].sort(compareCodePoints);

  /** @type {Array<{record: Record<string, unknown>, modules: string[], dimension: string, status: string, key: string}>} */
  const cells = [];
  for (const record of matrix) {
    const modulesForCell = normalizedStrings(record.module_ids);
    const rawModuleCount = Array.isArray(record.module_ids) ? record.module_ids.length : 0;
    const dimension = typeof record.dimension === 'string' ? record.dimension : '';
    const status = typeof record.status === 'string' ? record.status : '';
    const path = cellPath(modulesForCell, dimension);
    let valid = true;
    if (modulesForCell.length !== rawModuleCount || modulesForCell.length === 0) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_MODULE_SET_INVALID', `${path}/module_ids`, 'module_ids must contain unique nonblank module IDs'));
      valid = false;
    }
    if (!DIMENSION_SET.has(dimension)) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_DIMENSION_INVALID', `${path}/dimension`, 'dimension is not in the fixed interaction matrix'));
      valid = false;
    }
    if (!CELL_STATUSES.has(status)) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_STATUS_INVALID', `${path}/status`, 'status must be checked-no-signal or candidate'));
      valid = false;
    }
    if (valid) cells.push({ record, modules: modulesForCell, dimension, status, key: cellKey(modulesForCell, dimension) });
  }

  /** @type {Map<string, {modules: string[], dimension: string}>} */
  const expectedCells = new Map();
  if (modules.length === 1) {
    for (const dimension of INTERACTION_DIMENSIONS) expectedCells.set(cellKey(modules, dimension), { modules, dimension });
  } else if (modules.length >= 2) {
    for (let left = 0; left < modules.length; left += 1) {
      for (let right = left + 1; right < modules.length; right += 1) {
        const pair = [modules[left], modules[right]];
        for (const dimension of INTERACTION_DIMENSIONS) expectedCells.set(cellKey(pair, dimension), { modules: pair, dimension });
      }
    }
  }

  /** @type {Map<string, Array<typeof cells[number]>>} */
  const cellsByKey = new Map();
  for (const cell of cells) {
    const expectedModuleCount = modules.length === 1 ? 1 : 2;
    const path = cellPath(cell.modules, cell.dimension);
    if (cell.modules.length !== expectedModuleCount || !expectedCells.has(cell.key)) {
      diagnostics.push(diagnostic(
        'coverage', 'INTERACTION_CELL_EXTRA', path,
        `cell ${moduleLabel(cell.modules)} / ${cell.dimension} is outside the required audit grid`
      ));
      continue;
    }
    const matches = cellsByKey.get(cell.key) ?? [];
    matches.push(cell);
    cellsByKey.set(cell.key, matches);
    if (matches.length > 1) diagnostics.push(diagnostic(
      'coverage', 'INTERACTION_CELL_DUPLICATE', path,
      `cell ${moduleLabel(cell.modules)} / ${cell.dimension} appears more than once`
    ));
  }

  for (const [key, expected] of [...expectedCells.entries()].sort(([left], [right]) => compareCodePoints(left, right))) {
    if (cellsByKey.has(key)) continue;
    diagnostics.push(diagnostic(
      'coverage', 'INTERACTION_CELL_MISSING', cellPath(expected.modules, expected.dimension),
      `missing interaction cell for ${moduleLabel(expected.modules)} / ${expected.dimension}`
    ));
  }

  const candidateIdCounts = new Map();
  for (const candidate of submittedCandidates) {
    const candidateId = typeof candidate.candidate_id === 'string' ? candidate.candidate_id : '';
    candidateIdCounts.set(candidateId, (candidateIdCounts.get(candidateId) ?? 0) + 1);
  }

  const candidateSemanticCounts = new Map();
  for (const candidate of submittedCandidates) {
    const key = candidateSemanticKey(candidate);
    candidateSemanticCounts.set(key, (candidateSemanticCounts.get(key) ?? 0) + 1);
  }
  for (const [candidateId, count] of [...candidateIdCounts.entries()].sort(([left], [right]) => compareCodePoints(left, right))) {
    if (candidateId.length === 0 || count < 2) continue;
    diagnostics.push(diagnostic(
      'schema', 'INTERACTION_CANDIDATE_ID_INVALID',
      `/interaction_candidates/${escapePointerSegment(candidateId)}/candidate_id`,
      'candidate_id must be nonblank and unique'
    ));
  }

  /** @type {Record<string, unknown>[]} */
  const candidates = [];
  const orderedCandidates = [...submittedCandidates].sort((left, right) => compareCodePoints(
    `${candidateSemanticKey(left)}\0${String(left.candidate_id ?? '')}`,
    `${candidateSemanticKey(right)}\0${String(right.candidate_id ?? '')}`
  ));
  for (const candidate of orderedCandidates) {
    const path = candidatePath(candidate);
    const candidateId = typeof candidate.candidate_id === 'string' ? candidate.candidate_id : '';
    const modulesForCandidate = normalizedStrings(candidate.module_ids);
    const rawModuleCount = Array.isArray(candidate.module_ids) ? candidate.module_ids.length : 0;
    const dimension = typeof candidate.dimension === 'string' ? candidate.dimension : '';
    let valid = true;
    if (candidateId.length === 0) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_CANDIDATE_ID_INVALID', `${path}/candidate_id`, 'candidate_id must be nonblank and unique'));
      valid = false;
    } else if ((candidateIdCounts.get(candidateId) ?? 0) > 1) valid = false;
    if ((candidateSemanticCounts.get(candidateSemanticKey(candidate)) ?? 0) > 1) {
      diagnostics.push(diagnostic(
        'traceability', 'INTERACTION_CANDIDATE_SUBJECT_DUPLICATE', path,
        'module_ids, dimension, and semantic_subject_refs must identify one interaction candidate'
      ));
      valid = false;
    }
    if (modulesForCandidate.length !== rawModuleCount || modulesForCandidate.length === 0 || !DIMENSION_SET.has(dimension)) {
      diagnostics.push(diagnostic('reference', 'INTERACTION_CANDIDATE_CELL_INVALID', path, 'candidate must name one valid audit cell'));
      valid = false;
    }
    const sourceClaimIds = normalizedStrings(candidate.source_claim_ids);
    const semanticSubjectRefs = normalizedSemanticRefs(candidate.semantic_subject_refs);
    if (sourceClaimIds.length === 0) {
      diagnostics.push(diagnostic('classification', 'INTERACTION_CANDIDATE_EVIDENCE_REQUIRED', `${path}/source_claim_ids`, 'every interaction candidate requires nonempty provenance evidence'));
      valid = false;
    }
    if (semanticSubjectRefs.length === 0 || semanticSubjectRefs.length !== (Array.isArray(candidate.semantic_subject_refs) ? candidate.semantic_subject_refs.length : 0)) {
      diagnostics.push(diagnostic('classification', 'INTERACTION_CANDIDATE_SUBJECT_REQUIRED', `${path}/semantic_subject_refs`, 'every interaction candidate requires nonempty unique semantic subject references'));
      valid = false;
    }
    if (valid) {
      /** @type {Record<string, unknown>} */
      const normalized = { ...candidate, module_ids: modulesForCandidate };
      normalized.source_claim_ids = sourceClaimIds;
      normalized.semantic_subject_refs = objectArray(candidate.semantic_subject_refs)
        .sort((left, right) => compareCodePoints(JSON.stringify(left), JSON.stringify(right)));
      candidates.push(normalized);
    }
  }

  candidates.sort((left, right) => compareCodePoints(/** @type {string} */ (left.candidate_id), /** @type {string} */ (right.candidate_id)));
  return { candidates, diagnostics: sortDiagnostics(diagnostics) };
}

/** @param {Record<string, unknown>} claim */
function isFormalInteractionEvidence(claim) {
  return (claim.level === 'E3' && claim.kind === 'requirement')
    || (claim.level === 'E1' && claim.kind === 'assumption')
    || (claim.level === 'E2' && claim.kind === 'model-element'
      && claim.derivation_target === 'model-element');
}

/**
 * Resolve terminal interaction dispositions only after views, obligation inputs,
 * built-in strategies, and custom responsibilities have been compiled. The
 * earlier audit deliberately owns only matrix/candidate structure.
 * @param {unknown} artifact
 * @param {Record<string, unknown>[]} candidates
 * @param {Map<string, Record<string, unknown>>} viewsById
 * @param {Map<string, Set<string>>} viewModeledClaims
 * @param {Map<string, Record<string, unknown>>} claimsById
 */
export function reconcileInteractionMatrix(
  artifact, candidates, viewsById, viewModeledClaims, claimsById
) {
  const input = isObject(artifact) ? artifact : {};
  const submittedViews = objectArray(input.views);
  const cells = objectArray(input.interaction_matrix).map((record) => ({
    modules: normalizedStrings(record.module_ids),
    dimension: typeof record.dimension === 'string' ? record.dimension : '',
    status: typeof record.status === 'string' ? record.status : ''
  }));
  /** @type {Map<string, Array<typeof cells[number]>>} */
  const cellsByKey = new Map();
  for (const cell of cells) {
    const key = cellKey(cell.modules, cell.dimension);
    const matches = cellsByKey.get(key) ?? [];
    matches.push(cell);
    cellsByKey.set(key, matches);
  }
  /** @type {Map<string, Record<string, unknown>[]>} */
  const acceptedByCell = new Map();
  /** @type {Record<string, unknown>[]} */
  const acceptedCandidates = [];
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];

  for (const candidate of candidates) {
    const path = candidatePath(candidate);
    const candidateId = String(candidate.candidate_id ?? '');
    const modules = normalizedStrings(candidate.module_ids);
    const dimension = typeof candidate.dimension === 'string' ? candidate.dimension : '';
    const disposition = typeof candidate.disposition === 'string' ? candidate.disposition : '';
    let valid = true;
    const destinationFields = DISPOSITION_FIELDS.filter((field) => (
      typeof candidate[field] === 'string' && String(candidate[field]).trim().length > 0
    ));
    const expectedField = disposition === 'formal-view' ? 'formal_view_id'
      : disposition === 'exploratory' ? 'exploratory_id' : null;
    const dispositionExact = disposition === 'blocker'
      ? destinationFields.length === 0 && isObject(candidate.issue_intent)
      : destinationFields.length === 1 && expectedField !== null
        && destinationFields[0] === expectedField;
    if (!dispositionExact) {
      diagnostics.push(diagnostic(
        'classification', 'CANDIDATE_DISPOSITION_NOT_EXACT', path,
        'candidate must have exactly one destination matching its disposition'
      ));
      valid = false;
    }

    if (disposition === 'formal-view') {
      const viewId = typeof candidate.formal_view_id === 'string'
        ? candidate.formal_view_id : '';
      const matchingSubmittedViews = submittedViews.filter((view) => view.view_id === viewId);
      const formalView = viewsById.get(viewId);
      if (matchingSubmittedViews.length === 0) {
        diagnostics.push(diagnostic(
          'reference', 'FORMAL_INTERACTION_VIEW_DANGLING', `${path}/formal_view_id`,
          `formal interaction view "${viewId}" does not exist`
        ));
        valid = false;
      } else if (matchingSubmittedViews.length !== 1) {
        diagnostics.push(diagnostic(
          'reference', 'FORMAL_INTERACTION_VIEW_AMBIGUOUS', `${path}/formal_view_id`,
          `formal interaction view "${viewId}" is not uniquely defined`
        ));
        valid = false;
      } else {
        const submittedView = matchingSubmittedViews[0];
        if (typeof submittedView.type !== 'string' || !FORMAL_VIEW_TYPES.has(submittedView.type)) {
          diagnostics.push(diagnostic(
            'classification', 'FORMAL_INTERACTION_VIEW_TYPE_INVALID', `${path}/formal_view_id`,
            'a formal interaction candidate must route to one of the seven formal behavior views'
          ));
          valid = false;
        } else if (objectArray(submittedView.elements).length
          + objectArray(submittedView.relations).length === 0) {
          diagnostics.push(diagnostic(
            'traceability', 'FORMAL_INTERACTION_VIEW_EMPTY', `${path}/formal_view_id`,
            'a formal interaction candidate must route to a nonempty behavior view'
          ));
          valid = false;
        } else if (formalViewIdentityDiagnostics(submittedView).length > 0
          || !formalViewStructureValid(submittedView) || !formalView) {
          diagnostics.push(diagnostic(
            'traceability', 'FORMAL_INTERACTION_VIEW_INVALID', `${path}/formal_view_id`,
            `formal interaction view "${viewId}" did not pass behavior-view validation`
          ));
          valid = false;
        } else {
          const modeledClaims = viewModeledClaims.get(viewId) ?? new Set();
          const targetScope = typeof formalView.scope === 'string' ? formalView.scope : '';
          for (const claimId of normalizedStrings(candidate.source_claim_ids)) {
            const claim = claimsById.get(claimId);
            const claimPath = `${path}/source_claim_ids/${escapePointerSegment(claimId)}`;
            if (!claim) {
              diagnostics.push(diagnostic(
                'reference', 'SOURCE_CLAIM_DANGLING', claimPath,
                `source claim "${claimId}" is not in the accepted evidence graph`
              ));
              valid = false;
            } else if (!isFormalInteractionEvidence(claim)) {
              diagnostics.push(diagnostic(
                'classification', 'FORMAL_CANDIDATE_EVIDENCE_INVALID', claimPath,
                `source claim "${claimId}" cannot support a formal interaction`
              ));
              valid = false;
            } else {
              if (targetScope.length > 0 && (typeof claim.scope !== 'string'
                || !scopeContains(claim.scope, targetScope))) {
                diagnostics.push(diagnostic(
                  'classification', 'FORMAL_CANDIDATE_SCOPE_MISMATCH', claimPath,
                  `source claim "${claimId}" does not cover formal view scope "${targetScope}"`
                ));
                valid = false;
              }
              if (!modeledClaims.has(claimId)) {
                diagnostics.push(diagnostic(
                  'traceability', 'FORMAL_CANDIDATE_CLAIM_UNMODELED', claimPath,
                  `formal view "${viewId}" does not model source claim "${claimId}"`
                ));
                valid = false;
              }
            }
          }
        }
      }
    }

    const key = cellKey(modules, dimension);
    const matchingCells = cellsByKey.get(key) ?? [];
    if (matchingCells.length === 0) {
      diagnostics.push(diagnostic(
        'traceability', 'INTERACTION_CANDIDATE_WITHOUT_CELL', path,
        `candidate ${candidateId} does not match an audited cell`
      ));
      valid = false;
    } else {
      if (matchingCells.every((cell) => cell.status === 'checked-no-signal')) {
        diagnostics.push(diagnostic(
          'classification', 'INTERACTION_CANDIDATE_ON_NO_SIGNAL', path,
          `candidate ${candidateId} is attached to a checked-no-signal cell`
        ));
        valid = false;
      }
      if (matchingCells.length !== 1) {
        diagnostics.push(diagnostic(
          'traceability', 'INTERACTION_CANDIDATE_CELL_AMBIGUOUS', path,
          `candidate ${candidateId} does not match exactly one audited cell`
        ));
        valid = false;
      }
    }
    if (!valid) continue;
    acceptedCandidates.push(candidate);
    const matches = acceptedByCell.get(key) ?? [];
    matches.push(candidate);
    acceptedByCell.set(key, matches);
  }

  for (const [key, matchingCells] of cellsByKey) {
    const candidateCells = matchingCells.filter((cell) => cell.status === 'candidate');
    if (candidateCells.length === 0 || (acceptedByCell.get(key) ?? []).length > 0) continue;
    const sample = candidateCells[0];
    diagnostics.push(diagnostic(
      'traceability', 'INTERACTION_CANDIDATE_MISSING',
      cellPath(sample.modules, sample.dimension),
      `candidate cell ${moduleLabel(sample.modules)} / ${sample.dimension} has no valid disposition`
    ));
  }

  acceptedCandidates.sort((left, right) => compareCodePoints(
    String(left.candidate_id), String(right.candidate_id)
  ));
  return { candidates: acceptedCandidates, diagnostics: sortDiagnostics(diagnostics) };
}
