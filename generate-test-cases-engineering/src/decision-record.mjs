import { createHash } from 'node:crypto';

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

/** @param {string} scope */
export function normalizeScope(scope) {
  const normalized = scope.trim();
  return normalized === 'all' || normalized === '*' ? '*' : normalized;
}

/** @param {string} container @param {string} candidate */
export function scopeContains(container, candidate) {
  const left = normalizeScope(container);
  const right = normalizeScope(candidate);
  if (left.length === 0 || right.length === 0) return false;
  return left === '*' || left === right
    || right.startsWith(`${left}.`) || right.startsWith(`${left}/`);
}

/**
 * Bind every source and locator to one immutable UTF-8 content version.
 * Locator digests are source-version guards; typed selectors identify the
 * exact region inside that version.
 * @param {unknown} sourcePack
 */
export function validateSourceIntegrity(sourcePack) {
  const pack = isObject(sourcePack) ? sourcePack : {};
  const sources = objectArray(pack.sources);
  const locators = objectArray(pack.locators);
  const reviews = objectArray(pack.source_reviews);
  const sourceById = new Map(sources.flatMap((source) => (
    typeof source.source_id === 'string' ? [[source.source_id, source]] : []
  )));
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];
  sources.forEach((source, index) => {
    if (typeof source.content !== 'string' || typeof source.content_digest !== 'string') return;
    const actualDigest = createHash('sha256').update(source.content, 'utf8').digest('hex');
    if (source.content_digest !== actualDigest) diagnostics.push(diagnostic(
      'SOURCE_CONTENT_DIGEST_MISMATCH',
      `/sources/${index}/content_digest`,
      'source content_digest must equal the SHA-256 of the exact UTF-8 source content'
    ));
  });
  const reviewIndexesBySource = new Map();
  reviews.forEach((review, reviewIndex) => {
    if (typeof review.source_id !== 'string') return;
    const indexes = reviewIndexesBySource.get(review.source_id) ?? [];
    indexes.push(reviewIndex);
    reviewIndexesBySource.set(review.source_id, indexes);
    const source = sourceById.get(review.source_id);
    if (!source) {
      diagnostics.push(diagnostic(
        'SOURCE_REVIEW_SOURCE_DANGLING', `/source_reviews/${reviewIndex}/source_id`,
        'source review must reference an existing source'
      ));
      return;
    }
    if (review.content_digest !== source.content_digest) diagnostics.push(diagnostic(
      'SOURCE_REVIEW_CONTENT_DIGEST_MISMATCH', `/source_reviews/${reviewIndex}/content_digest`,
      'source review must bind the exact immutable source version'
    ));
    if (typeof source.content !== 'string') return;
    const sourceContent = source.content;
    /** @type {Array<{start:number,end:number,spanIndex:number}>} */
    const validSpans = [];
    const seenSpanIds = new Set();
    objectArray(review.spans).forEach((span, spanIndex) => {
      if (typeof span.span_id === 'string') {
        if (seenSpanIds.has(span.span_id)) diagnostics.push(diagnostic(
          'SOURCE_REVIEW_SPAN_ID_DUPLICATE', `/source_reviews/${reviewIndex}/spans/${spanIndex}/span_id`,
          'source review span IDs must be unique within one source'
        ));
        seenSpanIds.add(span.span_id);
      }
      const start = span.start;
      const end = span.end;
      if (typeof span.rationale !== 'string' || span.rationale.trim().length === 0) {
        diagnostics.push(diagnostic(
          'SOURCE_REVIEW_RATIONALE_INVALID', `/source_reviews/${reviewIndex}/spans/${spanIndex}/rationale`,
          'source review rationale must contain a non-whitespace explanation'
        ));
      }
      if (typeof start !== 'number' || typeof end !== 'number' || end <= start) {
        diagnostics.push(diagnostic(
          'SOURCE_REVIEW_SPAN_RANGE_INVALID', `/source_reviews/${reviewIndex}/spans/${spanIndex}`,
          'source review span end must be greater than start'
        ));
      } else if (start < 0 || end > sourceContent.length) {
        diagnostics.push(diagnostic(
          'SOURCE_REVIEW_SPAN_RANGE_OUT_OF_BOUNDS', `/source_reviews/${reviewIndex}/spans/${spanIndex}`,
          'source review span must fall within the exact source content'
        ));
      } else validSpans.push({ start, end, spanIndex });
    });
    let cursor = 0;
    for (const span of validSpans) {
      if (span.start < cursor) diagnostics.push(diagnostic(
        'SOURCE_REVIEW_SPAN_OVERLAP', `/source_reviews/${reviewIndex}/spans/${span.spanIndex}`,
        'source review spans must be ordered and non-overlapping'
      ));
      const gapEnd = Math.max(cursor, span.start);
      if (/\S/u.test(sourceContent.slice(cursor, gapEnd))) diagnostics.push(diagnostic(
        'SOURCE_REVIEW_COVERAGE_GAP', `/source_reviews/${reviewIndex}/spans/${span.spanIndex}`,
        'source review spans must account for every non-whitespace source character'
      ));
      cursor = Math.max(cursor, span.end);
    }
    if (/\S/u.test(sourceContent.slice(cursor))) diagnostics.push(diagnostic(
      'SOURCE_REVIEW_COVERAGE_GAP', `/source_reviews/${reviewIndex}/spans`,
      'source review spans must account for every non-whitespace source character'
    ));
  });
  sources.forEach((source, sourceIndex) => {
    if (typeof source.source_id !== 'string') return;
    const reviewIndexes = reviewIndexesBySource.get(source.source_id) ?? [];
    if (reviewIndexes.length === 0) diagnostics.push(diagnostic(
      'SOURCE_REVIEW_MISSING', `/sources/${sourceIndex}`,
      'every source must have one exhaustive source review'
    ));
    if (reviewIndexes.length > 1) diagnostics.push(diagnostic(
      'SOURCE_REVIEW_DUPLICATE', `/source_reviews/${reviewIndexes[1]}`,
      'every source must have exactly one source review'
    ));
  });
  locators.forEach((locator, index) => {
    const source = typeof locator.source_id === 'string'
      ? sourceById.get(locator.source_id) : undefined;
    if (!source) return;
    if (typeof locator.content_digest !== 'string' || locator.content_digest !== source.content_digest) {
      diagnostics.push(diagnostic(
        'LOCATOR_CONTENT_DIGEST_MISMATCH',
        `/locators/${index}/content_digest`,
        'locator content_digest must bind the exact immutable source version'
      ));
    }
    if (locator.type === 'text-range' && isObject(locator.text_range)
      && typeof source.content === 'string') {
      const start = locator.text_range.start;
      const end = locator.text_range.end;
      if (typeof start === 'number' && typeof end === 'number' && end <= start) {
        diagnostics.push(diagnostic(
          'LOCATOR_RANGE_INVALID', `/locators/${index}/text_range`,
          'text-range end must be greater than start'
        ));
      } else if (typeof start === 'number' && typeof end === 'number'
        && (start < 0 || end > source.content.length)) {
        diagnostics.push(diagnostic(
          'LOCATOR_RANGE_OUT_OF_BOUNDS', `/locators/${index}/text_range`,
          'text-range must fall within the exact source content'
        ));
      }
    }
  });
  return diagnostics;
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
  const sourceIds = new Set(sources.flatMap((source) => (
    typeof source.source_id === 'string' ? [source.source_id] : []
  )));
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
      return;
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
