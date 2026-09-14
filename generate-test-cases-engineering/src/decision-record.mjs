import { createHash } from 'node:crypto';
import { validReviewBasis, validateSourceAssetAudit } from './source-audit.mjs';
import { canonicalStringify } from './canonical.mjs';

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
  const diagnostics = validateSourceAssetAudit(pack);
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
      if (!validReviewBasis(span.review_basis)) diagnostics.push(diagnostic(
        'SOURCE_REVIEW_BASIS_INVALID', `/source_reviews/${reviewIndex}/spans/${spanIndex}/review_basis`,
        'every disposition requires a reviewer, review method and review evidence'
      ));
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
  const sourceById = new Map(sources.flatMap((source) => (
    typeof source.source_id === 'string' ? [[source.source_id, source]] : []
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
    if (isObject(decision.target) && isObject(decision.answer_origin)) {
      let valid = true;
      const resolution = decision.resolution;
      const expectedLevel = resolution === 'final' ? 'E3' : resolution === 'temporary' ? 'E1' : null;
      if (!expectedLevel || decision.evidence_level !== expectedLevel) {
        diagnostics.push(diagnostic(
          'DECISION_EVIDENCE_LEVEL_INVALID', `/decision_records/${index}/evidence_level`,
          'v4 final Decisions require E3 and v4 temporary Decisions require E1'
        ));
        valid = false;
      }
      if (typeof decision.answer !== 'string' || decision.answer.trim().length === 0) {
        diagnostics.push(diagnostic(
          'DECISION_ANSWER_EMPTY', `/decision_records/${index}/answer`, 'Decision Record answer must be nonempty'
        ));
        valid = false;
      }
      const origin = decision.answer_origin;
      if (origin.presentation_id !== decision.target.presentation_id) {
        diagnostics.push(diagnostic(
          'DECISION_ANSWER_ORIGIN_TARGET_MISMATCH', `/decision_records/${index}/answer_origin/presentation_id`,
          'Decision answer origin must bind the target presentation'
        ));
        valid = false;
      }
      if ((origin.type === 'user_statement' && decision.authority !== 'task_scoped')
        || (origin.type === 'authorized_confirmation' && decision.authority !== 'product_final')
        || (origin.type !== 'user_statement' && origin.type !== 'authorized_confirmation')) {
        diagnostics.push(diagnostic(
          'DECISION_AUTHORITY_INVALID', `/decision_records/${index}/authority`,
          'v4 Decision authority must match the recorded user-statement or authorized-confirmation origin'
        ));
        valid = false;
      }
      const identity = {
        target: decision.target,
        answer: decision.answer,
        answer_origin: origin,
        authority: decision.authority,
        resolution
      };
      const expectedDecisionId = `DEC-${createHash('sha256').update(canonicalStringify(identity), 'utf8').digest('hex')}`;
      if (decision.decision_id !== expectedDecisionId) {
        diagnostics.push(diagnostic(
          'DECISION_ID_MISMATCH', `/decision_records/${index}/decision_id`,
          'Decision ID must bind its stable target, answer provenance, authority and effective resolution'
        ));
        valid = false;
      }
      if (!isObject(decision.obligation_audit)) {
        diagnostics.push(diagnostic(
          'DECISION_OBLIGATION_AUDIT_INVALID', `/decision_records/${index}/obligation_audit`,
          'Decision obligation audit must retain deterministic previous-to-current root snapshots'
        ));
        valid = false;
      } else {
        try {
          const previous = sortedUniqueV4(decision.obligation_audit.previous_obligation_ids, 'DECISION_OBLIGATION_AUDIT_INVALID');
          const current = sortedUniqueV4(decision.obligation_audit.current_obligation_ids, 'DECISION_OBLIGATION_AUDIT_INVALID');
          const expectedMappings = previous.map((previousObligationId) => ({
            previous_obligation_id: previousObligationId, current_obligation_ids: [...current]
          }));
          if (canonicalStringify(decision.obligation_audit.previous_obligation_ids) !== canonicalStringify(previous)
            || canonicalStringify(decision.obligation_audit.current_obligation_ids) !== canonicalStringify(current)
            || canonicalStringify(decision.obligation_audit.mappings) !== canonicalStringify(expectedMappings)) {
            throw new TypeError('DECISION_OBLIGATION_AUDIT_INVALID');
          }
        } catch {
          diagnostics.push(diagnostic(
            'DECISION_OBLIGATION_AUDIT_INVALID', `/decision_records/${index}/obligation_audit`,
            'Decision obligation audit must retain deterministic previous-to-current root snapshots'
          ));
          valid = false;
        }
      }
      const span = isObject(origin.answer_span) ? origin.answer_span : {};
      const matchingLocators = locators.filter((locator) => locator.type === 'user_statement'
        && locator.presentation_id === origin.presentation_id
        && locator.message_digest === origin.message_digest
        && isObject(locator.answer_span)
        && locator.answer_span.start === span.start_scalar
        && locator.answer_span.end === span.end_scalar
        && locator.excerpt_digest === span.excerpt_digest
        && typeof locator.excerpt === 'string'
        && locator.excerpt.normalize('NFC').trim() === String(decision.answer).normalize('NFC').trim());
      if (matchingLocators.length !== 1) {
        diagnostics.push(diagnostic(
          matchingLocators.length === 0 ? 'DECISION_USER_STATEMENT_DANGLING' : 'DECISION_USER_STATEMENT_AMBIGUOUS',
          `/decision_records/${index}/answer_origin`,
          'v4 Decision provenance must resolve to exactly one matching user-statement locator'
        ));
        valid = false;
      } else {
        const locator = matchingLocators[0];
        const source = typeof locator.source_id === 'string' ? sourceById.get(locator.source_id) : undefined;
        const structure = isObject(source?.semantic_projection) && Array.isArray(source.semantic_projection.structure)
          ? objectArray(source.semantic_projection.structure) : [];
        const units = structure.filter((unit) => unit.unit_id === locator.unit_id);
        const unit = units.length === 1 ? units[0] : null;
        const unitSpan = isObject(unit?.answer_span) ? unit.answer_span : {};
        const locatorSpan = isObject(locator.answer_span) ? locator.answer_span : {};
        const message = typeof unit?.text === 'string' ? normalizeDecisionMessageV4(unit.text) : null;
        const scalars = message === null ? [] : Array.from(message);
        const start = Number(locatorSpan.start);
        const end = Number(locatorSpan.end);
        const excerpt = Number.isSafeInteger(start) && Number.isSafeInteger(end)
          && start >= 0 && end > start && end <= scalars.length
          ? scalars.slice(start, end).join('') : null;
        const exactUserStatement = unit !== null && unit.type === 'user_statement'
          && source?.semantic_digest === locator.semantic_digest
          && unit.presentation_id === origin.presentation_id
          && locator.presentation_id === unit.presentation_id
          && unit.message_digest === origin.message_digest
          && locator.message_digest === unit.message_digest
          && unitSpan.start === locatorSpan.start && unitSpan.end === locatorSpan.end
          && locatorSpan.start === span.start_scalar && locatorSpan.end === span.end_scalar
          && message !== null && unit.text === message && sha256Text(message) === origin.message_digest
          && excerpt !== null && locator.excerpt === excerpt
          && sha256Text(excerpt) === locator.excerpt_digest
          && locator.excerpt_digest === span.excerpt_digest
          && excerpt.normalize('NFC') === String(decision.answer).normalize('NFC');
        if (invalidLocatorIds.has(String(locator.locator_id)) || !exactUserStatement) {
          diagnostics.push(diagnostic(
            'DECISION_USER_STATEMENT_INVALID', `/decision_records/${index}/answer_origin`,
            'v4 Decision provenance must bind the exact normalized user-statement unit and Unicode-scalar span'
          ));
          valid = false;
        }
      }
      if (resolution === 'final'
        && origin.type !== 'authorized_confirmation') {
        diagnostics.push(diagnostic(
          'FINAL_AUTHORITY_NOT_GRANTED', `/decision_records/${index}/resolution`,
          'only an explicitly authorized product-final confirmation can form a final Decision'
        ));
        valid = false;
      }
      if (valid && resolution === 'final') validFinalDecisionIds.add(decision.decision_id);
      if (valid && resolution === 'temporary') validTemporaryDecisionIds.add(decision.decision_id);
      return;
    }
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

const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const V4_ORIGINS = new Set(['user_statement', 'authorized_confirmation']);
const V4_AUTHORITIES = new Set(['task_scoped', 'product_final']);

/** @param {string} value */
function sha256Text(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/** @param {unknown} value */
function v4Text(value) {
  if (typeof value !== 'string') throw new TypeError('DECISION_ANSWER_INVALID');
  const normalized = value.normalize('NFC').trim();
  if (!normalized) throw new TypeError('DECISION_ANSWER_INVALID');
  return normalized;
}

/** @param {unknown} value @param {string} code */
function sortedUniqueV4(value, code) {
  if (!Array.isArray(value)) throw new TypeError(code);
  const result = [...new Set(value.map((item) => {
    if (typeof item !== 'string' || !item.normalize('NFC').trim()) throw new TypeError(code);
    return item.normalize('NFC').trim();
  }))].sort((left, right) => {
    const a = Array.from(left); const b = Array.from(right);
    for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
      const delta = (a[index].codePointAt(0) ?? 0) - (b[index].codePointAt(0) ?? 0);
      if (delta !== 0) return delta;
    }
    return a.length - b.length;
  });
  return result;
}

/**
 * User-message normalization is deliberately small and deterministic: Unicode
 * NFC plus one newline representation. Whitespace remains part of the message
 * because answer_span is an auditable source coordinate, not a trimmed hint.
 * @param {unknown} value
 */
export function normalizeDecisionMessageV4(value) {
  if (typeof value !== 'string') throw new TypeError('DECISION_MESSAGE_INVALID');
  return value.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n').normalize('NFC');
}

/**
 * Reconstruct the non-blocking authority warning directly from the immutable
 * semantic event. This lets an exact append replay return the same warning
 * without persisting reply text or treating every temporary Decision as a
 * failed final request.
 * @param {unknown} submitted
 */
export function finalAuthorityWarningV4(submitted) {
  if (!isObject(submitted)) return null;
  const event = submitted;
  if (event.event_type !== 'answer_question_part'
    || event.resolution !== 'final'
    || event.authority !== 'task_scoped'
    || !isObject(event.answer_origin)
    || event.answer_origin.type !== 'user_statement'
    || typeof event.event_id !== 'string' || !event.event_id
    || typeof event.question_part_id !== 'string' || !event.question_part_id) return null;
  return {
    code: 'FINAL_AUTHORITY_NOT_GRANTED', severity: 'warning',
    message: '该答案已按临时口径接收，尚未获得最终产品口径授权。',
    source_event_id: event.event_id,
    affected_question_part_ids: [event.question_part_id]
  };
}

/**
 * Validate the exact half-open Unicode-scalar provenance of one answer.
 * @param {unknown} submitted
 * @param {unknown} rawMessage
 */
export function validateDecisionAnswerSpanV4(submitted, rawMessage) {
  if (!isObject(submitted)) throw new TypeError('DECISION_ANSWER_ORIGIN_INVALID');
  const decision = submitted;
  const answer = v4Text(decision.answer);
  if (!isObject(decision.answer_origin)) throw new TypeError('DECISION_ANSWER_ORIGIN_INVALID');
  const origin = decision.answer_origin;
  if (typeof origin.type !== 'string' || !V4_ORIGINS.has(origin.type)
    || typeof origin.presentation_id !== 'string' || !origin.presentation_id
    || typeof origin.message_digest !== 'string' || !SHA256.test(origin.message_digest)
    || !isObject(origin.answer_span)) throw new TypeError('DECISION_ANSWER_ORIGIN_INVALID');
  const message = normalizeDecisionMessageV4(rawMessage);
  if (sha256Text(message) !== origin.message_digest) throw new TypeError('DECISION_MESSAGE_DIGEST_MISMATCH');
  const start = origin.answer_span.start_scalar;
  const end = origin.answer_span.end_scalar;
  const scalars = Array.from(message);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || Number(start) < 0 || Number(end) <= Number(start) || Number(end) > scalars.length) {
    throw new TypeError('DECISION_ANSWER_SPAN_INVALID');
  }
  const excerpt = scalars.slice(Number(start), Number(end)).join('');
  if (typeof origin.answer_span.excerpt_digest !== 'string'
    || sha256Text(excerpt) !== origin.answer_span.excerpt_digest) {
    throw new TypeError('DECISION_ANSWER_EXCERPT_DIGEST_MISMATCH');
  }
  if (excerpt.normalize('NFC') !== answer) throw new TypeError('DECISION_ANSWER_EXCERPT_MISMATCH');
  return { normalized_message: message, excerpt, answer };
}

/** @param {unknown} value */
function requireV4Target(value) {
  if (!isObject(value)) throw new TypeError('DECISION_TARGET_INVALID');
  for (const key of ['presentation_id', 'question_part_id', 'root_issue_id', 'root_version_digest']) {
    if (typeof value[key] !== 'string' || !String(value[key]).trim()) throw new TypeError('DECISION_TARGET_INVALID');
  }
  if (!SHA256.test(String(value.root_version_digest))) throw new TypeError('DECISION_TARGET_INVALID');
  return {
    presentation_id: String(value.presentation_id), question_part_id: String(value.question_part_id),
    root_issue_id: String(value.root_issue_id), root_version_digest: String(value.root_version_digest)
  };
}

/**
 * Compile, rather than accept, every authority/evidence/audit field on a v4
 * Decision. Obligation IDs are snapshots only and never participate in ID.
 * @param {unknown} submitted
 */
export function compileSemanticDecisionV4(submitted) {
  if (!isObject(submitted) || !isObject(submitted.event)) throw new TypeError('DECISION_INPUT_INVALID');
  const event = submitted.event;
  const target = requireV4Target(event);
  if (event.event_type !== 'answer_question_part' || typeof event.event_id !== 'string' || !event.event_id) {
    throw new TypeError('DECISION_EVENT_INVALID');
  }
  if (!isObject(event.answer_origin)) throw new TypeError('DECISION_ANSWER_ORIGIN_INVALID');
  const eventAnswerOrigin = event.answer_origin;
  if (eventAnswerOrigin.presentation_id !== target.presentation_id) {
    throw new TypeError('DECISION_ANSWER_ORIGIN_TARGET_MISMATCH');
  }
  validateDecisionAnswerSpanV4(event, submitted.normalized_user_message);
  const subjectFactIds = sortedUniqueV4(submitted.subject_fact_ids, 'DECISION_FACT_REFS_INVALID');
  if (subjectFactIds.length === 0) throw new TypeError('DECISION_FACT_REFS_INVALID');
  const missingAspect = v4Text(submitted.missing_aspect);
  const previous = sortedUniqueV4(submitted.previous_obligation_ids ?? [], 'DECISION_OBLIGATION_AUDIT_INVALID');
  const current = sortedUniqueV4(submitted.current_obligation_ids ?? [], 'DECISION_OBLIGATION_AUDIT_INVALID');
  const supersedesDecisionIds = sortedUniqueV4(submitted.supersedes_decision_ids ?? [], 'DECISION_SUPERSESSION_INVALID');
  const requestedFinal = event.resolution === 'final';
  const authority = v4Text(event.authority);
  if (!V4_AUTHORITIES.has(authority)
    || (eventAnswerOrigin.type === 'user_statement' && authority !== 'task_scoped')
    || (eventAnswerOrigin.type === 'authorized_confirmation' && authority !== 'product_final')) {
    throw new TypeError('DECISION_AUTHORITY_INVALID');
  }
  const finalAuthority = eventAnswerOrigin.type === 'authorized_confirmation' && authority === 'product_final';
  const resolution = requestedFinal && finalAuthority ? 'final' : 'temporary';
  const evidenceLevel = resolution === 'final' ? 'E3' : 'E1';
  const answer = v4Text(event.answer);
  const answerOrigin = structuredClone(eventAnswerOrigin);
  const identity = { target, answer, answer_origin: answerOrigin, authority, resolution };
  const decisionId = `DEC-${createHash('sha256').update(canonicalStringify(identity), 'utf8').digest('hex')}`;
  const obligationAudit = {
    previous_obligation_ids: previous,
    current_obligation_ids: current,
    mappings: previous.map((previousObligationId) => ({
      previous_obligation_id: previousObligationId, current_obligation_ids: [...current]
    }))
  };
  const decision = {
    decision_id: decisionId,
    target,
    subject_fact_ids: subjectFactIds,
    missing_aspect: missingAspect,
    answer,
    answer_origin: answerOrigin,
    authority,
    resolution,
    evidence_level: evidenceLevel,
    accepted_from_superseded_presentation: Boolean(submitted.accepted_from_superseded_presentation),
    supersedes_decision_ids: supersedesDecisionIds,
    obligation_audit: obligationAudit
  };
  const authorityWarning = finalAuthorityWarningV4(event);
  const warnings = requestedFinal && !finalAuthority && authorityWarning
    ? [authorityWarning] : [];
  return { decision, warnings, case_classification: resolution === 'final' ? 'grounded' : 'conditional' };
}
