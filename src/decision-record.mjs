/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'reference', code, path, message };
}

/** @param {string} container @param {string} candidate */
export function scopeContains(container, candidate) {
  const left = container.trim();
  const right = candidate.trim();
  if (left.length === 0 || right.length === 0) return false;
  return left === '*' || left === 'all' || left === right
    || right.startsWith(`${left}.`) || right.startsWith(`${left}/`);
}

/**
 * Validate Decision Records once so source-policy and evidence use identical gates.
 * @param {unknown} sourcePack
 */
export function validateDecisionRecords(sourcePack) {
  const pack = isObject(sourcePack) ? sourcePack : {};
  const sources = objectArray(pack.sources);
  const locators = objectArray(pack.locators);
  const decisions = objectArray(pack.decision_records);
  const sourceIds = new Set(sources.flatMap((source) => typeof source.source_id === 'string' ? [source.source_id] : []));
  const locatorById = new Map(locators.flatMap((locator) => typeof locator.locator_id === 'string' ? [[locator.locator_id, locator]] : []));
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];
  const invalidLocatorIds = new Set();

  locators.forEach((locator, index) => {
    if (typeof locator.locator_id !== 'string') return;
    if (typeof locator.source_id !== 'string' || !sourceIds.has(locator.source_id)) {
      invalidLocatorIds.add(locator.locator_id);
      diagnostics.push(diagnostic(
        'LOCATOR_SOURCE_DANGLING',
        `/locators/${index}/source_id`,
        `locator references unknown source "${typeof locator.source_id === 'string' ? locator.source_id : ''}"`
      ));
    }
  });

  const decisionsById = new Map();
  const validFinalDecisionIds = new Set();
  const validTemporaryDecisionIds = new Set();

  decisions.forEach((decision, index) => {
    if (typeof decision.decision_id !== 'string') return;
    decisionsById.set(decision.decision_id, decision);
    if (decision.disposition !== 'final' && decision.disposition !== 'temporary') return;
    let valid = true;
    const expectedLevel = decision.disposition === 'final' ? 'E3' : 'E1';
    if (decision.evidence_level !== expectedLevel) {
      diagnostics.push(diagnostic(
        'DECISION_EVIDENCE_LEVEL_INVALID',
        `/decision_records/${index}/evidence_level`,
        `${decision.disposition} Decision Record must use ${expectedLevel}`
      ));
      valid = false;
    }
    if (typeof decision.answer !== 'string' || decision.answer.trim().length === 0) {
      diagnostics.push(diagnostic(
        'DECISION_ANSWER_EMPTY',
        `/decision_records/${index}/answer`,
        'Decision Record answer must be nonempty'
      ));
      valid = false;
    }
    const authorityScope = typeof decision.authority_scope === 'string' ? decision.authority_scope : '';
    const effectiveScope = typeof decision.effective_scope === 'string' ? decision.effective_scope : '';
    if (!scopeContains(authorityScope, effectiveScope)) {
      diagnostics.push(diagnostic(
        'DECISION_AUTHORITY_SCOPE_MISMATCH',
        `/decision_records/${index}/effective_scope`,
        'Decision Record authority scope must contain its effective scope'
      ));
      valid = false;
    }
    const evidenceRef = typeof decision.evidence_ref === 'string' ? decision.evidence_ref : '';
    const locator = locatorById.get(evidenceRef);
    if (!locator) {
      diagnostics.push(diagnostic(
        'DECISION_EVIDENCE_DANGLING',
        `/decision_records/${index}/evidence_ref`,
        'Decision Record must reference an existing evidence locator'
      ));
      valid = false;
    } else {
      if (invalidLocatorIds.has(evidenceRef)) valid = false;
      if (locator.extraction_integrity === 'uncertain') {
        diagnostics.push(diagnostic(
          'DECISION_EVIDENCE_UNCERTAIN',
          `/decision_records/${index}/evidence_ref`,
          'uncertain extraction cannot authorize a Decision Record'
        ));
        valid = false;
      }
    }
    if (valid && decision.disposition === 'final') validFinalDecisionIds.add(decision.decision_id);
    if (valid && decision.disposition === 'temporary') validTemporaryDecisionIds.add(decision.decision_id);
  });

  return { decisionsById, validFinalDecisionIds, validTemporaryDecisionIds, diagnostics };
}
