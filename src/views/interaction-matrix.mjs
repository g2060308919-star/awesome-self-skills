export const INTERACTION_DIMENSIONS = Object.freeze([
  'shared-entity', 'role', 'client', 'interface-event',
  'time', 'concurrency', 'side-effect'
]);

const DIMENSION_SET = new Set(INTERACTION_DIMENSIONS);
const CELL_STATUSES = new Set(['checked-no-signal', 'candidate']);
const FORMAL_VIEW_TYPES = new Set(['flow', 'decision', 'state', 'input-domain', 'role', 'timing', 'integration']);
const DISPOSITION_FIELDS = Object.freeze([
  'formal_view_id', 'blocker_root_issue_id', 'exploratory_id'
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
  for (const item of diagnostics) unique.set(`${item.category}\0${item.code}\0${item.path}\0${item.message}`, item);
  return [...unique.values()].sort((left, right) => compareCodePoints(
    `${left.category}\0${left.code}\0${left.path}\0${left.message}`,
    `${right.category}\0${right.code}\0${right.path}\0${right.message}`
  ));
}

/** @param {string[]} moduleIds @param {string} dimension */
function cellKey(moduleIds, dimension) {
  return `${moduleIds.join('\0')}\0${dimension}`;
}

/** @param {string[]} moduleIds */
function moduleLabel(moduleIds) {
  return moduleIds.join(',');
}

/**
 * Reconcile the fixed cross-module signal audit without interpreting business semantics.
 * @param {unknown} artifact
 */
export function auditInteractionMatrix(artifact) {
  const input = isObject(artifact) ? artifact : {};
  const matrix = objectArray(input.interaction_matrix);
  const submittedCandidates = objectArray(input.interaction_candidates);
  const views = objectArray(input.views);
  const viewsById = new Map(views.flatMap((view) => typeof view.view_id === 'string' ? [[view.view_id, view]] : []));
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

  /** @type {Array<{index: number, record: Record<string, unknown>, modules: string[], dimension: string, status: string, key: string}>} */
  const cells = [];
  matrix.forEach((record, index) => {
    const modulesForCell = normalizedStrings(record.module_ids);
    const rawModuleCount = Array.isArray(record.module_ids) ? record.module_ids.length : 0;
    const dimension = typeof record.dimension === 'string' ? record.dimension : '';
    const status = typeof record.status === 'string' ? record.status : '';
    let valid = true;
    if (modulesForCell.length !== rawModuleCount || modulesForCell.length === 0) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_MODULE_SET_INVALID', `/interaction_matrix/${index}/module_ids`, 'module_ids must contain unique nonblank module IDs'));
      valid = false;
    }
    if (!DIMENSION_SET.has(dimension)) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_DIMENSION_INVALID', `/interaction_matrix/${index}/dimension`, 'dimension is not in the fixed interaction matrix'));
      valid = false;
    }
    if (!CELL_STATUSES.has(status)) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_STATUS_INVALID', `/interaction_matrix/${index}/status`, 'status must be checked-no-signal or candidate'));
      valid = false;
    }
    if (valid) cells.push({ index, record, modules: modulesForCell, dimension, status, key: cellKey(modulesForCell, dimension) });
  });

  /** @type {Set<string>} */
  const expectedKeys = new Set();
  if (modules.length === 1) {
    for (const dimension of INTERACTION_DIMENSIONS) expectedKeys.add(cellKey(modules, dimension));
  } else if (modules.length >= 2) {
    for (let left = 0; left < modules.length; left += 1) {
      for (let right = left + 1; right < modules.length; right += 1) {
        const pair = [modules[left], modules[right]];
        for (const dimension of INTERACTION_DIMENSIONS) expectedKeys.add(cellKey(pair, dimension));
      }
    }
  }

  /** @type {Map<string, Array<typeof cells[number]>>} */
  const cellsByKey = new Map();
  for (const cell of cells) {
    const expectedModuleCount = modules.length === 1 ? 1 : 2;
    if (cell.modules.length !== expectedModuleCount || !expectedKeys.has(cell.key)) {
      diagnostics.push(diagnostic(
        'coverage', 'INTERACTION_CELL_EXTRA', `/interaction_matrix/${cell.index}`,
        `cell ${moduleLabel(cell.modules)} / ${cell.dimension} is outside the required audit grid`
      ));
      continue;
    }
    const matches = cellsByKey.get(cell.key) ?? [];
    matches.push(cell);
    cellsByKey.set(cell.key, matches);
    if (matches.length > 1) diagnostics.push(diagnostic(
      'coverage', 'INTERACTION_CELL_DUPLICATE', `/interaction_matrix/${cell.index}`,
      `cell ${moduleLabel(cell.modules)} / ${cell.dimension} appears more than once`
    ));
  }

  for (const key of [...expectedKeys].sort(compareCodePoints)) {
    if (cellsByKey.has(key)) continue;
    const parts = key.split('\0');
    const dimension = /** @type {string} */ (parts.pop());
    diagnostics.push(diagnostic(
      'coverage', 'INTERACTION_CELL_MISSING', '/interaction_matrix',
      `missing interaction cell for ${parts.join(',')} / ${dimension}`
    ));
  }

  const seenCandidateIds = new Set();
  /** @type {Map<string, Array<{index: number, record: Record<string, unknown>}>>} */
  const candidatesByCell = new Map();
  /** @type {Record<string, unknown>[]} */
  const candidates = [];
  submittedCandidates.forEach((candidate, index) => {
    const path = `/interaction_candidates/${index}`;
    const candidateId = typeof candidate.candidate_id === 'string' ? candidate.candidate_id : '';
    const modulesForCandidate = normalizedStrings(candidate.module_ids);
    const rawModuleCount = Array.isArray(candidate.module_ids) ? candidate.module_ids.length : 0;
    const dimension = typeof candidate.dimension === 'string' ? candidate.dimension : '';
    const disposition = typeof candidate.disposition === 'string' ? candidate.disposition : '';
    let valid = true;
    if (candidateId.length === 0 || seenCandidateIds.has(candidateId)) {
      diagnostics.push(diagnostic('schema', 'INTERACTION_CANDIDATE_ID_INVALID', `${path}/candidate_id`, 'candidate_id must be nonblank and unique'));
      valid = false;
    }
    seenCandidateIds.add(candidateId);
    if (modulesForCandidate.length !== rawModuleCount || modulesForCandidate.length === 0 || !DIMENSION_SET.has(dimension)) {
      diagnostics.push(diagnostic('reference', 'INTERACTION_CANDIDATE_CELL_INVALID', path, 'candidate must name one valid audit cell'));
      valid = false;
    }
    const destinationFields = DISPOSITION_FIELDS.filter((field) => typeof candidate[field] === 'string' && /** @type {string} */ (candidate[field]).trim().length > 0);
    const expectedField = disposition === 'formal-view' ? 'formal_view_id'
      : disposition === 'blocker' ? 'blocker_root_issue_id'
        : disposition === 'exploratory' ? 'exploratory_id' : null;
    if (destinationFields.length !== 1 || expectedField === null || destinationFields[0] !== expectedField) {
      diagnostics.push(diagnostic('classification', 'CANDIDATE_DISPOSITION_NOT_EXACT', path, 'candidate must have exactly one destination matching its disposition'));
      valid = false;
    }
    if (disposition === 'formal-view') {
      const sourceClaimIds = normalizedStrings(candidate.source_claim_ids);
      if (sourceClaimIds.length === 0) {
        diagnostics.push(diagnostic('classification', 'FORMAL_CANDIDATE_EVIDENCE_REQUIRED', `${path}/source_claim_ids`, 'a formal interaction candidate requires source evidence'));
        valid = false;
      }
      const viewId = typeof candidate.formal_view_id === 'string' ? candidate.formal_view_id : '';
      const view = viewsById.get(viewId);
      if (!view) {
        diagnostics.push(diagnostic('reference', 'FORMAL_INTERACTION_VIEW_DANGLING', `${path}/formal_view_id`, `formal interaction view "${viewId}" does not exist`));
        valid = false;
      } else if (typeof view.type !== 'string' || !FORMAL_VIEW_TYPES.has(view.type)) {
        diagnostics.push(diagnostic('classification', 'FORMAL_INTERACTION_VIEW_TYPE_INVALID', `${path}/formal_view_id`, 'a formal interaction candidate must route to one of the seven formal behavior views'));
        valid = false;
      }
    }

    const key = cellKey(modulesForCandidate, dimension);
    const matchingCells = cellsByKey.get(key) ?? [];
    if (matchingCells.length === 0) {
      diagnostics.push(diagnostic('traceability', 'INTERACTION_CANDIDATE_WITHOUT_CELL', path, `candidate ${candidateId} does not match an audited cell`));
    } else {
      const matches = candidatesByCell.get(key) ?? [];
      matches.push({ index, record: candidate });
      candidatesByCell.set(key, matches);
      if (matchingCells.every((cell) => cell.status === 'checked-no-signal')) diagnostics.push(diagnostic(
        'classification', 'INTERACTION_CANDIDATE_ON_NO_SIGNAL', path, `candidate ${candidateId} is attached to a checked-no-signal cell`
      ));
    }

    if (valid) {
      /** @type {Record<string, unknown>} */
      const normalized = { ...candidate, module_ids: modulesForCandidate };
      if (Array.isArray(candidate.source_claim_ids)) normalized.source_claim_ids = normalizedStrings(candidate.source_claim_ids);
      candidates.push(normalized);
    }
  });

  for (const [key, matchingCells] of cellsByKey) {
    const candidateCells = matchingCells.filter((cell) => cell.status === 'candidate');
    if (candidateCells.length === 0) continue;
    const dispositions = candidatesByCell.get(key) ?? [];
    const sample = candidateCells[0];
    if (dispositions.length === 0) diagnostics.push(diagnostic(
      'traceability', 'INTERACTION_CANDIDATE_MISSING', `/interaction_matrix/${sample.index}`,
      `candidate cell ${moduleLabel(sample.modules)} / ${sample.dimension} has no disposition`
    ));
    else if (dispositions.length > 1) diagnostics.push(diagnostic(
      'traceability', 'INTERACTION_CANDIDATE_MULTIPLE', `/interaction_matrix/${sample.index}`,
      `candidate cell ${moduleLabel(sample.modules)} / ${sample.dimension} has more than one disposition`
    ));
  }

  candidates.sort((left, right) => compareCodePoints(/** @type {string} */ (left.candidate_id), /** @type {string} */ (right.candidate_id)));
  return { candidates, diagnostics: sortDiagnostics(diagnostics) };
}
