import { canonicalStringify, digest, stableId } from './canonical.mjs';
import { normalizeScope } from './decision-record.mjs';

const POLICIES = new Set(['pause_for_clarification', 'record_only']);
const RISKS = new Set(['critical', 'high', 'medium', 'low']);
const EVIDENCE_LEVELS = new Set(['E0', 'E1', 'E2', 'E3']);
const CLASSIFICATIONS = new Set(['grounded', 'conditional', 'blocked', 'not_applicable']);
const ROOT_STATUSES = new Set([
  'open', 'asked', 'resolved_final', 'resolved_temporary', 'suppressed_unknown', 'suppressed_deferred'
]);
const STOP_REASONS = new Set(['converged', 'user_requested_delivery', 'no_information_gain']);
const DECISION_DISPOSITIONS = new Set(['final', 'temporary', 'unknown', 'deferred']);
const CONTROL_TYPES = new Set(['request_delivery', 'reopen_root_issues']);
const DELIVERY_STATUSES = new Set([
  'no_applicable_formal_test_points', 'no_deterministic_cases', 'critical_gaps', 'executable_subset_ready'
]);
const DIAGNOSTIC_LIMIT = 256;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const NATIVE_REFLECT_OWN_KEYS = Reflect.ownKeys;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;

/** @typedef {{category:string,code:string,path:string,message:string}} Diagnostic */

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

/** @param {string} segment */
function pointerPart(segment) {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** @param {string} category @param {string} code @param {string} path @param {string} message @returns {Diagnostic} */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {Diagnostic[]} diagnostics */
function finalizeDiagnostics(diagnostics) {
  const unique = new Map();
  for (const item of diagnostics) unique.set(
    `${item.category}\0${item.code}\0${item.path}\0${item.message}`, item
  );
  if (unique.size > DIAGNOSTIC_LIMIT) {
    const truncated = diagnostic(
      'classification', 'DIAGNOSTICS_TRUNCATED', '/', `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
    );
    unique.set(`${truncated.category}\0${truncated.code}\0${truncated.path}\0${truncated.message}`, truncated);
  }
  return [...unique.values()].sort((left, right) => compareCodePoints(
    `${left.category}\0${left.code}\0${left.path}\0${left.message}`,
    `${right.category}\0${right.code}\0${right.path}\0${right.message}`
  )).slice(0, DIAGNOSTIC_LIMIT);
}

/**
 * Capture untrusted input through own data descriptors without executing
 * submitted accessors or iterators.
 * @param {unknown} root
 */
function snapshotControlled(root) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  let diagnosticsTruncated = false;
  /** @param {Diagnostic} item */
  const addDiagnostic = (item) => {
    if (diagnostics.length < DIAGNOSTIC_LIMIT) diagnostics.push(item);
    else diagnosticsTruncated = true;
  };
  /** @type {unknown} */
  let snapshot;
  /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
  const pending = [{ source: root, path: '', assign(value) { snapshot = value; } }];
  const seen = new Set();
  while (pending.length > 0) {
    const { source, path, assign } = /** @type {{source:unknown,path:string,assign:(value:unknown)=>void}} */ (pending.pop());
    if (!source || typeof source !== 'object') {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      addDiagnostic(diagnostic('schema', 'CYCLIC_INPUT_INVALID', path || '/', 'clarification context must be acyclic'));
      assign(null);
      continue;
    }
    seen.add(source);
    let prototype;
    let descriptors;
    try {
      prototype = NATIVE_GET_PROTOTYPE_OF(source);
      descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS(source);
    } catch {
      addDiagnostic(diagnostic('schema', 'INPUT_DESCRIPTOR_UNREADABLE', path || '/', 'clarification input descriptors could not be captured'));
      assign(null);
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY(source)) {
      if (prototype !== Array.prototype) {
        addDiagnostic(diagnostic('schema', 'ARRAY_PROTOTYPE_INVALID', path || '/', 'controlled arrays must use Array.prototype'));
        assign(null);
        continue;
      }
      const keys = NATIVE_REFLECT_OWN_KEYS(descriptors);
      let invalidOwnKeys = false;
      if (keys.some((key) => typeof key === 'symbol')) {
        invalidOwnKeys = true;
        addDiagnostic(diagnostic(
          'schema', 'ARRAY_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled arrays cannot contain symbol properties'
        ));
      }
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, 'value') && Number.isSafeInteger(lengthDescriptor.value)
        ? Number(lengthDescriptor.value) : 0;
      const numeric = [];
      for (const key of keys.filter((item) => typeof item === 'string').sort(compareCodePoints)) {
        if (key === 'length') continue;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
          invalidOwnKeys = true;
          addDiagnostic(diagnostic(
            'schema', 'ARRAY_NAMED_PROPERTY_INVALID', `${path}/${pointerPart(key)}`, 'controlled arrays cannot contain named properties'
          ));
        }
        else numeric.push(index);
      }
      if (invalidOwnKeys) {
        assign(null);
        continue;
      }
      numeric.sort((left, right) => left - right);
      const target = new Array(length);
      assign(target);
      let nextExpectedIndex = 0;
      let holesTruncated = false;
      /** @param {number} start @param {number} end */
      const emitHoleGap = (start, end) => {
        if (holesTruncated || start >= end) return;
        const available = Math.max(0, DIAGNOSTIC_LIMIT - diagnostics.length);
        const emitCount = Math.min(end - start, available);
        for (let offset = 0; offset < emitCount; offset += 1) addDiagnostic(diagnostic(
          'schema', 'ARRAY_HOLE', `${path}/${start + offset}`, 'controlled arrays must be dense'
        ));
        if (emitCount < end - start) {
          diagnosticsTruncated = true;
          holesTruncated = true;
        }
      };
      for (const index of numeric) {
        emitHoleGap(nextExpectedIndex, index);
        nextExpectedIndex = index + 1;
      }
      emitHoleGap(nextExpectedIndex, length);
      /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
      const children = [];
      for (const index of numeric) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) addDiagnostic(diagnostic(
          'schema', 'ACCESSOR_NOT_ALLOWED', `${path}/${index}`, 'controlled input must use own data properties'
        ));
        else children.push({ source: descriptor.value, path: `${path}/${index}`, assign(value) { target[index] = value; } });
      }
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      addDiagnostic(diagnostic('schema', 'RECORD_PROTOTYPE_INVALID', path || '/', 'controlled records must use a plain or null prototype'));
      assign(null);
      continue;
    }
    const keys = NATIVE_REFLECT_OWN_KEYS(descriptors);
    if (keys.some((key) => typeof key === 'symbol')) addDiagnostic(diagnostic(
      'schema', 'RECORD_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled records cannot contain symbol properties'
    ));
    const target = {};
    assign(target);
    /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
    const children = [];
    for (const key of keys.filter((item) => typeof item === 'string').sort(compareCodePoints)) {
      const descriptor = descriptors[key];
      const childPath = `${path}/${pointerPart(key)}`;
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) addDiagnostic(diagnostic(
        'schema', 'ACCESSOR_NOT_ALLOWED', childPath, 'controlled input must use own data properties'
      ));
      else children.push({
        source: descriptor.value,
        path: childPath,
        assign(value) { NATIVE_DEFINE_PROPERTY(target, key, { value, enumerable: true, writable: true, configurable: true }); }
      });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  if (diagnosticsTruncated) diagnostics.push(diagnostic(
    'classification', 'DIAGNOSTICS_TRUNCATED', '/', `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return { snapshot, diagnostics };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
function normalizeText(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
}

/** @param {Record<string, unknown>} value @param {string[]} allowed @param {string} path @param {Diagnostic[]} diagnostics */
function checkKeys(value, allowed, path, diagnostics) {
  const permitted = new Set(allowed);
  for (const key of Object.keys(value)) if (!permitted.has(key)) diagnostics.push(diagnostic(
    'schema', 'UNKNOWN_KEY', `${path}/${pointerPart(key)}`, 'unknown controlled clarification field is not allowed'
  ));
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function record(value, path, diagnostics) {
  if (isRecord(value)) return value;
  diagnostics.push(diagnostic('schema', 'RECORD_REQUIRED', path, 'controlled clarification value must be a record'));
  return {};
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function array(value, path, diagnostics) {
  if (Array.isArray(value)) return value;
  diagnostics.push(diagnostic('schema', 'ARRAY_REQUIRED', path, 'controlled clarification value must be an array'));
  return [];
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {boolean} [allowEmpty] */
function canonicalString(value, path, diagnostics, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && normalizeText(value).length === 0)
    || value !== value.normalize('NFC') || value !== value.trim()) {
    diagnostics.push(diagnostic('schema', 'CANONICAL_STRING_INVALID', path, 'value must be a canonical nonpadded string'));
    return '';
  }
  return value;
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {boolean} [nonempty] */
function stringSet(value, path, diagnostics, nonempty = false) {
  const input = array(value, path, diagnostics);
  const output = [];
  const seen = new Set();
  for (let index = 0; index < input.length; index += 1) {
    const item = canonicalString(input[index], `${path}/${index}`, diagnostics);
    if (!item) continue;
    if (seen.has(item)) diagnostics.push(diagnostic('schema', 'SET_VALUE_DUPLICATE', `${path}/${index}`, 'set-like values must be unique'));
    else {
      seen.add(item);
      output.push(item);
    }
  }
  if (nonempty && output.length === 0) diagnostics.push(diagnostic('schema', 'NONEMPTY_ARRAY_REQUIRED', path, 'set-like array must not be empty'));
  return output.sort(compareCodePoints);
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {number} minimum */
function integer(value, path, diagnostics, minimum) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    diagnostics.push(diagnostic('schema', 'INTEGER_INVALID', path, `value must be an integer at least ${minimum}`));
    return minimum;
  }
  return Number(value);
}

/** @param {unknown} value @param {Set<string>} allowed @param {string} path @param {Diagnostic[]} diagnostics */
function enumeration(value, allowed, path, diagnostics) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    diagnostics.push(diagnostic('schema', 'ENUM_INVALID', path, 'value is outside the closed clarification enumeration'));
    return '';
  }
  return value;
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizeSemanticSnapshot(value, path, diagnostics) {
  const snapshot = record(value, path, diagnostics);
  checkKeys(snapshot, ['formal_test_points', 'coverage_denominator', 'delivery_sections'], path, diagnostics);
  const points = [];
  const pointIds = new Set();
  for (const [index, raw] of array(snapshot.formal_test_points, `${path}/formal_test_points`, diagnostics).entries()) {
    const point = record(raw, `${path}/formal_test_points/${index}`, diagnostics);
    checkKeys(point, ['obligation_id', 'evidence_level', 'classification', 'blocked_reason'], `${path}/formal_test_points/${index}`, diagnostics);
    const obligationId = canonicalString(point.obligation_id, `${path}/formal_test_points/${index}/obligation_id`, diagnostics);
    const evidenceLevel = enumeration(point.evidence_level, EVIDENCE_LEVELS, `${path}/formal_test_points/${index}/evidence_level`, diagnostics);
    const classification = enumeration(point.classification, CLASSIFICATIONS, `${path}/formal_test_points/${index}/classification`, diagnostics);
    let blockedReason = null;
    if (point.blocked_reason !== null) blockedReason = canonicalString(point.blocked_reason, `${path}/formal_test_points/${index}/blocked_reason`, diagnostics);
    if (classification === 'blocked' && !blockedReason) diagnostics.push(diagnostic(
      'classification', 'BLOCKED_REASON_REQUIRED', `${path}/formal_test_points/${index}/blocked_reason`, 'Blocked formal Test Point requires a reason'
    ));
    if (classification !== 'blocked' && point.blocked_reason !== null) diagnostics.push(diagnostic(
      'classification', 'BLOCKED_REASON_UNEXPECTED', `${path}/formal_test_points/${index}/blocked_reason`, 'non-Blocked formal Test Point cannot carry a blocked reason'
    ));
    if (pointIds.has(obligationId)) diagnostics.push(diagnostic(
      'reference', 'FORMAL_TEST_POINT_DUPLICATE', `${path}/formal_test_points/${index}/obligation_id`, 'formal Test Point IDs must be unique'
    ));
    pointIds.add(obligationId);
    points.push({ obligation_id: obligationId, evidence_level: evidenceLevel, classification, blocked_reason: blockedReason });
  }
  points.sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  const denominator = integer(snapshot.coverage_denominator, `${path}/coverage_denominator`, diagnostics, 0);
  if (denominator !== points.length) diagnostics.push(diagnostic(
    'coverage', 'FORMAL_DENOMINATOR_MISMATCH', `${path}/coverage_denominator`, 'formal coverage denominator must equal the formal Test Point count'
  ));
  const delivery = record(snapshot.delivery_sections, `${path}/delivery_sections`, diagnostics);
  checkKeys(delivery, ['grounded', 'conditional', 'blocked', 'exploratory', 'coverage', 'quality'], `${path}/delivery_sections`, diagnostics);
  const grounded = stringSet(delivery.grounded, `${path}/delivery_sections/grounded`, diagnostics);
  const conditional = stringSet(delivery.conditional, `${path}/delivery_sections/conditional`, diagnostics);
  const blocked = stringSet(delivery.blocked, `${path}/delivery_sections/blocked`, diagnostics);
  const exploratory = stringSet(delivery.exploratory, `${path}/delivery_sections/exploratory`, diagnostics);
  const coverage = record(delivery.coverage, `${path}/delivery_sections/coverage`, diagnostics);
  checkKeys(coverage, ['formal_denominator'], `${path}/delivery_sections/coverage`, diagnostics);
  const deliveryDenominator = integer(coverage.formal_denominator, `${path}/delivery_sections/coverage/formal_denominator`, diagnostics, 0);
  if (deliveryDenominator !== denominator) diagnostics.push(diagnostic(
    'coverage', 'DELIVERY_DENOMINATOR_MISMATCH', `${path}/delivery_sections/coverage/formal_denominator`, 'delivery coverage denominator must match the semantic snapshot'
  ));
  const quality = record(delivery.quality, `${path}/delivery_sections/quality`, diagnostics);
  checkKeys(quality, ['delivery_status'], `${path}/delivery_sections/quality`, diagnostics);
  const deliveryStatus = enumeration(quality.delivery_status, DELIVERY_STATUSES, `${path}/delivery_sections/quality/delivery_status`, diagnostics);
  for (const [lane, submitted] of [['grounded', grounded], ['conditional', conditional], ['blocked', blocked]]) {
    const expected = points.filter((point) => point.classification === lane).map((point) => point.obligation_id);
    if (canonicalStringify(submitted) !== canonicalStringify(expected)) diagnostics.push(diagnostic(
      'traceability', 'DELIVERY_LANE_MISMATCH', `${path}/delivery_sections/${lane}`, 'delivery lane IDs must exactly project formal Test Point classifications'
    ));
  }
  return {
    formal_test_points: points,
    coverage_denominator: denominator,
    delivery_sections: {
      grounded, conditional, blocked, exploratory,
      coverage: { formal_denominator: deliveryDenominator }, quality: { delivery_status: deliveryStatus }
    }
  };
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizeBlocked(value, path, diagnostics) {
  const output = [];
  const obligationIds = new Set();
  for (const [index, raw] of array(value, path, diagnostics).entries()) {
    const currentPath = `${path}/${index}`;
    const item = record(raw, currentPath, diagnostics);
    checkKeys(item, [
      'obligation_id', 'missing_type', 'semantic_refs', 'scope', 'risk', 'reason',
      'evidence_refs', 'answerable', 'question'
    ], currentPath, diagnostics);
    const obligationId = canonicalString(item.obligation_id, `${currentPath}/obligation_id`, diagnostics);
    const missingType = canonicalString(item.missing_type, `${currentPath}/missing_type`, diagnostics);
    if (missingType && !/^[a-z][a-z0-9-]*$/u.test(missingType)) diagnostics.push(diagnostic(
      'schema', 'MISSING_TYPE_INVALID', `${currentPath}/missing_type`, 'missing_type must use canonical lowercase kebab form'
    ));
    const semanticRefs = stringSet(item.semantic_refs, `${currentPath}/semantic_refs`, diagnostics, true);
    const rawScope = canonicalString(item.scope, `${currentPath}/scope`, diagnostics);
    const scope = rawScope ? normalizeScope(rawScope) : '';
    if (rawScope && rawScope !== scope) diagnostics.push(diagnostic(
      'schema', 'SCOPE_CANONICAL_INVALID', `${currentPath}/scope`, 'scope must already be normalized'
    ));
    const risk = enumeration(item.risk, RISKS, `${currentPath}/risk`, diagnostics);
    const reason = canonicalString(item.reason, `${currentPath}/reason`, diagnostics);
    const evidenceRefs = stringSet(item.evidence_refs, `${currentPath}/evidence_refs`, diagnostics);
    if (typeof item.answerable !== 'boolean') diagnostics.push(diagnostic(
      'schema', 'BOOLEAN_INVALID', `${currentPath}/answerable`, 'answerable must be boolean'
    ));
    const question = canonicalString(item.question, `${currentPath}/question`, diagnostics);
    if (obligationIds.has(obligationId)) diagnostics.push(diagnostic(
      'reference', 'BLOCKED_OBLIGATION_DUPLICATE', `${currentPath}/obligation_id`, 'Blocked formal obligation IDs must be unique'
    ));
    obligationIds.add(obligationId);
    output.push({
      obligation_id: obligationId, missing_type: missingType, semantic_refs: semanticRefs,
      scope, risk, reason, evidence_refs: evidenceRefs, answerable: item.answerable === true, question
    });
  }
  output.sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  return output;
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizePriorState(value, path, diagnostics) {
  const prior = record(value, path, diagnostics);
  checkKeys(prior, [
    'source_revision', 'clarification_event_seq', 'asked_root_issue_ids', 'root_issue_dispositions',
    'last_pending_root_issue_ids', 'last_question_set_digest', 'clarification_stop', 'semantic_snapshot'
  ], path, diagnostics);
  const sourceRevision = integer(prior.source_revision, `${path}/source_revision`, diagnostics, 0);
  const eventSeq = integer(prior.clarification_event_seq, `${path}/clarification_event_seq`, diagnostics, 0);
  const asked = stringSet(prior.asked_root_issue_ids, `${path}/asked_root_issue_ids`, diagnostics);
  const pending = stringSet(prior.last_pending_root_issue_ids, `${path}/last_pending_root_issue_ids`, diagnostics);
  const dispositions = [];
  const dispositionIds = new Set();
  for (const [index, raw] of array(prior.root_issue_dispositions, `${path}/root_issue_dispositions`, diagnostics).entries()) {
    const itemPath = `${path}/root_issue_dispositions/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, ['root_issue_id', 'status'], itemPath, diagnostics);
    const rootIssueId = canonicalString(item.root_issue_id, `${itemPath}/root_issue_id`, diagnostics);
    const status = enumeration(item.status, ROOT_STATUSES, `${itemPath}/status`, diagnostics);
    if (dispositionIds.has(rootIssueId)) diagnostics.push(diagnostic(
      'reference', 'ROOT_DISPOSITION_DUPLICATE', `${itemPath}/root_issue_id`, 'root issue disposition IDs must be unique'
    ));
    dispositionIds.add(rootIssueId);
    dispositions.push({ root_issue_id: rootIssueId, status });
  }
  dispositions.sort((left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
  const lastDigest = canonicalString(prior.last_question_set_digest, `${path}/last_question_set_digest`, diagnostics, true);
  let stop = null;
  if (prior.clarification_stop !== null) {
    const rawStop = record(prior.clarification_stop, `${path}/clarification_stop`, diagnostics);
    checkKeys(rawStop, ['reason', 'source_revision'], `${path}/clarification_stop`, diagnostics);
    stop = {
      reason: enumeration(rawStop.reason, STOP_REASONS, `${path}/clarification_stop/reason`, diagnostics),
      source_revision: integer(rawStop.source_revision, `${path}/clarification_stop/source_revision`, diagnostics, 0)
    };
  }
  const semantic = prior.semantic_snapshot === null ? null
    : normalizeSemanticSnapshot(prior.semantic_snapshot, `${path}/semantic_snapshot`, diagnostics);
  return {
    source_revision: sourceRevision, clarification_event_seq: eventSeq,
    asked_root_issue_ids: asked, root_issue_dispositions: dispositions,
    last_pending_root_issue_ids: pending, last_question_set_digest: lastDigest,
    clarification_stop: stop, semantic_snapshot: semantic
  };
}

/** @param {ReturnType<typeof normalizePriorState>} prior @param {Diagnostic[]} diagnostics */
function validatePriorState(prior, diagnostics) {
  const dispositionById = new Map(prior.root_issue_dispositions.map((item) => [item.root_issue_id, item.status]));
  const askedHistory = new Set(prior.asked_root_issue_ids);
  const askedDispositions = prior.root_issue_dispositions
    .filter((item) => item.status === 'asked').map((item) => item.root_issue_id);
  if (!sameSet(prior.last_pending_root_issue_ids, askedDispositions)) diagnostics.push(diagnostic(
    'classification', 'PRIOR_PENDING_DISPOSITION_MISMATCH', '/prior_state/last_pending_root_issue_ids',
    'prior pending roots must exactly equal dispositions whose status is asked'
  ));
  for (const rootId of prior.last_pending_root_issue_ids) if (!askedHistory.has(rootId)) diagnostics.push(diagnostic(
    'classification', 'PRIOR_PENDING_NOT_ASKED', `/prior_state/last_pending_root_issue_ids/${pointerPart(rootId)}`,
    'every prior pending root must appear in the cumulative asked history'
  ));
  for (const { root_issue_id: rootId, status } of prior.root_issue_dispositions) {
    if (status === 'open' && askedHistory.has(rootId)) diagnostics.push(diagnostic(
      'classification', 'PRIOR_LIFECYCLE_STATE_INVALID', `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      'an open prior root cannot already appear in asked history without an append-only reopen event'
    ));
    if (status !== 'open' && !askedHistory.has(rootId)) diagnostics.push(diagnostic(
      'classification', 'PRIOR_DISPOSITION_HISTORY_MISMATCH', `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      'asked, resolved, and suppressed dispositions must appear in cumulative asked history'
    ));
  }
  for (const rootId of prior.asked_root_issue_ids) if (!dispositionById.has(rootId)) diagnostics.push(diagnostic(
    'classification', 'PRIOR_DISPOSITION_HISTORY_MISMATCH', `/prior_state/asked_root_issue_ids/${pointerPart(rootId)}`,
    'every cumulative asked root must retain one lifecycle disposition'
  ));
  const expectedDigest = prior.last_pending_root_issue_ids.length === 0
    ? '' : digest([...prior.last_pending_root_issue_ids].sort(compareCodePoints));
  if (prior.last_question_set_digest !== expectedDigest) diagnostics.push(diagnostic(
    'traceability', 'PRIOR_PENDING_DIGEST_MISMATCH', '/prior_state/last_question_set_digest',
    'prior question-set digest must be derived from the exact sorted pending root set'
  ));
  if (prior.clarification_stop && (
    prior.last_pending_root_issue_ids.length > 0
    || prior.clarification_stop.source_revision !== prior.source_revision
  )) diagnostics.push(diagnostic(
    'classification', 'PRIOR_STOP_STATE_INVALID', '/prior_state/clarification_stop',
    'prior clarification stop must belong to its exact revision and have no pending roots'
  ));
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizeAppendBatch(value, path, diagnostics) {
  const batch = record(value, path, diagnostics);
  checkKeys(batch, ['decision_records', 'clarification_events'], path, diagnostics);
  const decisions = [];
  const decisionIds = new Set();
  for (const [index, raw] of array(batch.decision_records, `${path}/decision_records`, diagnostics).entries()) {
    const itemPath = `${path}/decision_records/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, [
      'decision_id', 'question_id', 'root_issue_ids', 'affected_obligation_ids', 'clarification_event_seq',
      'confirmer', 'confirmed_at', 'question', 'answer', 'disposition', 'authority_scope', 'effective_scope',
      'evidence_ref', 'evidence_level'
    ], itemPath, diagnostics);
    const decisionId = canonicalString(item.decision_id, `${itemPath}/decision_id`, diagnostics);
    if (decisionIds.has(decisionId)) diagnostics.push(diagnostic('reference', 'DECISION_ID_DUPLICATE', `${itemPath}/decision_id`, 'append Decision Record IDs must be unique'));
    decisionIds.add(decisionId);
    const disposition = enumeration(item.disposition, DECISION_DISPOSITIONS, `${itemPath}/disposition`, diagnostics);
    const answer = canonicalString(item.answer, `${itemPath}/answer`, diagnostics, disposition === 'unknown' || disposition === 'deferred');
    const evidenceLevel = enumeration(item.evidence_level, new Set(['E1', 'E3']), `${itemPath}/evidence_level`, diagnostics);
    if (disposition === 'final' && evidenceLevel !== 'E3') diagnostics.push(diagnostic('classification', 'DECISION_EVIDENCE_LEVEL_INVALID', `${itemPath}/evidence_level`, 'final Decision Record must be E3'));
    if (disposition === 'temporary' && evidenceLevel !== 'E1') diagnostics.push(diagnostic('classification', 'DECISION_EVIDENCE_LEVEL_INVALID', `${itemPath}/evidence_level`, 'temporary Decision Record must be E1'));
    decisions.push({
      decision_id: decisionId,
      question_id: canonicalString(item.question_id, `${itemPath}/question_id`, diagnostics),
      root_issue_ids: stringSet(item.root_issue_ids, `${itemPath}/root_issue_ids`, diagnostics, true),
      affected_obligation_ids: stringSet(item.affected_obligation_ids, `${itemPath}/affected_obligation_ids`, diagnostics),
      clarification_event_seq: integer(item.clarification_event_seq, `${itemPath}/clarification_event_seq`, diagnostics, 1),
      confirmer: canonicalString(item.confirmer, `${itemPath}/confirmer`, diagnostics),
      confirmed_at: canonicalString(item.confirmed_at, `${itemPath}/confirmed_at`, diagnostics),
      question: canonicalString(item.question, `${itemPath}/question`, diagnostics),
      answer, disposition,
      authority_scope: canonicalString(item.authority_scope, `${itemPath}/authority_scope`, diagnostics),
      effective_scope: canonicalString(item.effective_scope, `${itemPath}/effective_scope`, diagnostics),
      evidence_ref: canonicalString(item.evidence_ref, `${itemPath}/evidence_ref`, diagnostics),
      evidence_level: evidenceLevel
    });
  }
  const events = [];
  const eventIds = new Set();
  for (const [index, raw] of array(batch.clarification_events, `${path}/clarification_events`, diagnostics).entries()) {
    const itemPath = `${path}/clarification_events/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, ['event_id', 'clarification_event_seq', 'type', 'actor', 'event_at', 'root_issue_ids'], itemPath, diagnostics);
    const eventId = canonicalString(item.event_id, `${itemPath}/event_id`, diagnostics);
    if (eventIds.has(eventId)) diagnostics.push(diagnostic('reference', 'CONTROL_EVENT_ID_DUPLICATE', `${itemPath}/event_id`, 'append control event IDs must be unique'));
    eventIds.add(eventId);
    events.push({
      event_id: eventId,
      clarification_event_seq: integer(item.clarification_event_seq, `${itemPath}/clarification_event_seq`, diagnostics, 1),
      type: enumeration(item.type, CONTROL_TYPES, `${itemPath}/type`, diagnostics),
      actor: canonicalString(item.actor, `${itemPath}/actor`, diagnostics),
      event_at: canonicalString(item.event_at, `${itemPath}/event_at`, diagnostics),
      root_issue_ids: stringSet(item.root_issue_ids, `${itemPath}/root_issue_ids`, diagnostics, true)
    });
  }
  return { decision_records: decisions, clarification_events: events };
}

/** @param {string[]} left @param {string[]} right */
function sameSet(left, right) {
  return canonicalStringify([...left].sort(compareCodePoints)) === canonicalStringify([...right].sort(compareCodePoints));
}

/** @param {Record<string, unknown>[]} entries @param {string} key */
function strictlyIncreasing(entries, key) {
  for (let index = 1; index < entries.length; index += 1) {
    if (Number(entries[index][key]) <= Number(entries[index - 1][key])) return false;
  }
  return true;
}

/** @param {ReturnType<typeof normalizePriorState>} prior @param {ReturnType<typeof normalizeAppendBatch>} batch @param {number} sourceRevision @param {ReturnType<typeof normalizeSemanticSnapshot>} semantics @param {Diagnostic[]} diagnostics */
function validateHistory(prior, batch, sourceRevision, semantics, diagnostics) {
  if (!strictlyIncreasing(batch.decision_records, 'clarification_event_seq')) diagnostics.push(diagnostic(
    'classification', 'CLARIFICATION_EVENT_SEQUENCE_NONMONOTONE', '/append_batch/decision_records', 'Decision Record append order must be strictly monotonic'
  ));
  if (!strictlyIncreasing(batch.clarification_events, 'clarification_event_seq')) diagnostics.push(diagnostic(
    'classification', 'CLARIFICATION_EVENT_SEQUENCE_NONMONOTONE', '/append_batch/clarification_events', 'control event append order must be strictly monotonic'
  ));
  const combined = [
    ...batch.decision_records.map((item) => ({ kind: 'decision', seq: item.clarification_event_seq, item })),
    ...batch.clarification_events.map((item) => ({ kind: 'control', seq: item.clarification_event_seq, item }))
  ].sort((left, right) => left.seq - right.seq || compareCodePoints(left.kind, right.kind));
  const seenSeq = new Set();
  for (const entry of combined) {
    if (seenSeq.has(entry.seq)) diagnostics.push(diagnostic(
      'classification', 'CLARIFICATION_EVENT_SEQUENCE_DUPLICATE', '/append_batch', 'Decision Records and control events share one unique sequence'
    ));
    seenSeq.add(entry.seq);
  }
  for (let index = 0; index < combined.length; index += 1) {
    if (combined[index].seq !== prior.clarification_event_seq + index + 1) diagnostics.push(diagnostic(
      'classification', 'CLARIFICATION_EVENT_SEQUENCE_GAP', '/append_batch', 'append sequence must continue the prior sequence without gaps'
    ));
  }
  if (combined.length === 0) {
    if (sourceRevision !== prior.source_revision) diagnostics.push(diagnostic(
      'classification', 'APPEND_REVISION_INVALID', '/source_revision', 'revision can advance only with one nonempty append batch'
    ));
  } else if (sourceRevision !== prior.source_revision + 1) diagnostics.push(diagnostic(
    'classification', 'APPEND_REVISION_INVALID', '/source_revision', 'one append batch must create exactly the next immutable source revision'
  ));
  const formalIds = new Set(semantics.formal_test_points.map((point) => point.obligation_id));
  const pending = new Set(prior.last_pending_root_issue_ids);
  const decidedRoots = new Set();
  for (const [index, item] of batch.decision_records.entries()) {
    const expectedQuestionId = stableId('question', { root_issue_ids: [...item.root_issue_ids].sort(compareCodePoints) });
    if (item.question_id !== expectedQuestionId) diagnostics.push(diagnostic(
      'traceability', 'DECISION_QUESTION_ID_MISMATCH', `/append_batch/decision_records/${index}/question_id`,
      'Decision question identity must be derived only from its sorted root issue set'
    ));
    for (const rootId of item.root_issue_ids) {
      if (!pending.has(rootId)) diagnostics.push(diagnostic(
        'reference', 'DECISION_ROOT_UNKNOWN', `/append_batch/decision_records/${index}/root_issue_ids/${pointerPart(rootId)}`,
        'Decision Record must resolve a root from the prior complete pending set'
      ));
      if (decidedRoots.has(rootId)) diagnostics.push(diagnostic(
        'classification', 'DECISION_ROOT_DUPLICATE', `/append_batch/decision_records/${index}/root_issue_ids/${pointerPart(rootId)}`,
        'one append batch cannot decide the same root more than once'
      ));
      decidedRoots.add(rootId);
    }
    for (const obligationId of item.affected_obligation_ids) if (!formalIds.has(obligationId)) diagnostics.push(diagnostic(
      'reference', 'DECISION_OBLIGATION_UNKNOWN', `/append_batch/decision_records/${index}/affected_obligation_ids/${pointerPart(obligationId)}`,
      'Decision Record affected Test Point must exist in the current formal snapshot'
    ));
  }
  const priorDisposition = new Map(prior.root_issue_dispositions.map((item) => [item.root_issue_id, item.status]));
  const reopened = new Set();
  let requestDeliveryCount = 0;
  for (const [index, event] of batch.clarification_events.entries()) {
    if (event.type === 'request_delivery') {
      requestDeliveryCount += 1;
      if (!sameSet(event.root_issue_ids, prior.last_pending_root_issue_ids)) diagnostics.push(diagnostic(
        'classification', 'REQUEST_DELIVERY_PENDING_SET_MISMATCH', `/append_batch/clarification_events/${index}/root_issue_ids`,
        'request_delivery must exactly equal the prior complete pending root set'
      ));
      if (combined.at(-1)?.seq !== event.clarification_event_seq) diagnostics.push(diagnostic(
        'classification', 'REQUEST_DELIVERY_ORDER_INVALID', `/append_batch/clarification_events/${index}`,
        'request_delivery must be the final item in its append batch'
      ));
    } else if (event.type === 'reopen_root_issues') {
      for (const rootId of event.root_issue_ids) {
        const status = priorDisposition.get(rootId);
        if (!status) diagnostics.push(diagnostic(
          'reference', 'REOPEN_ROOT_UNKNOWN', `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          'reopen event references an unknown prior root issue'
        ));
        else if (status !== 'suppressed_unknown' && status !== 'suppressed_deferred') diagnostics.push(diagnostic(
          'classification', 'REOPEN_STATUS_INVALID', `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          'only suppressed unknown or deferred roots may be reopened'
        ));
        if (reopened.has(rootId)) diagnostics.push(diagnostic(
          'classification', 'REOPEN_ROOT_DUPLICATE', `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          'one append batch cannot reopen the same root twice'
        ));
        reopened.add(rootId);
      }
    }
  }
  if (requestDeliveryCount > 1) diagnostics.push(diagnostic(
    'classification', 'REQUEST_DELIVERY_DUPLICATE', '/append_batch/clarification_events', 'one append batch may contain at most one delivery request'
  ));
  if (requestDeliveryCount > 0 && reopened.size > 0) diagnostics.push(diagnostic(
    'classification', 'CONTROL_EVENT_CONFLICT', '/append_batch/clarification_events', 'delivery and reopen controls cannot share one append batch'
  ));
  return combined;
}

/** @param {ReturnType<typeof normalizeBlocked>} blocked @param {number} sourceRevision @param {Diagnostic[]} diagnostics */
function buildRootIssues(blocked, sourceRevision, diagnostics) {
  /** @type {Map<string, any>} */
  const groups = new Map();
  for (const item of blocked) {
    const signature = { missing_type: item.missing_type, semantic_refs: item.semantic_refs, scope: item.scope };
    const rootIssueId = stableId('root', signature);
    const rootIssueKey = canonicalStringify(signature);
    const existing = groups.get(rootIssueId);
    if (!existing) groups.set(rootIssueId, {
      root_issue_id: rootIssueId,
      root_issue_key: rootIssueKey,
      missing_type: item.missing_type,
      semantic_refs: [...item.semantic_refs],
      scope: item.scope,
      affected_obligation_ids: [item.obligation_id],
      risk_counts: { critical: 0, high: 0, medium: 0, low: 0 },
      source_revision: sourceRevision,
      question: item.question,
      answerable: item.answerable,
      reasons: [item.reason],
      evidence_refs: [...item.evidence_refs],
      batch_id: null
    });
    else if (existing.root_issue_key !== rootIssueKey) {
      diagnostics.push(diagnostic(
        'traceability', 'ROOT_ISSUE_ID_COLLISION', `/blocked_obligations/${pointerPart(item.obligation_id)}`,
        'distinct semantic root keys cannot share one stable root issue ID'
      ));
      continue;
    } else {
      if (existing.question !== item.question || existing.answerable !== item.answerable) diagnostics.push(diagnostic(
        'classification', 'ROOT_DESCRIPTOR_CONFLICT', `/blocked_obligations/${pointerPart(item.obligation_id)}`,
        'one semantic root must have one answerability and question contract'
      ));
      existing.affected_obligation_ids.push(item.obligation_id);
      existing.reasons.push(item.reason);
      existing.evidence_refs.push(...item.evidence_refs);
    }
    groups.get(rootIssueId).risk_counts[item.risk] += 1;
  }
  const output = [...groups.values()];
  for (const root of output) {
    root.affected_obligation_ids = [...new Set(root.affected_obligation_ids)].sort(compareCodePoints);
    root.reasons = [...new Set(root.reasons)].sort(compareCodePoints);
    root.evidence_refs = [...new Set(root.evidence_refs)].sort(compareCodePoints);
  }
  return output.sort((left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
}

/** @param {any} left @param {any} right */
function riskOrder(left, right) {
  for (const risk of ['critical', 'high', 'medium', 'low']) {
    const difference = Number(right.risk_counts[risk]) - Number(left.risk_counts[risk]);
    if (difference !== 0) return difference;
  }
  const affected = right.affected_obligation_ids.length - left.affected_obligation_ids.length;
  return affected || compareCodePoints(left.root_issue_id, right.root_issue_id);
}

/** @param {any[]} roots */
function pendingWithBatch(roots) {
  const sortedIds = roots.map((root) => root.root_issue_id).sort(compareCodePoints);
  const batchId = stableId('batch', { root_issue_ids: sortedIds });
  return roots.map((root) => ({ ...structuredClone(root), batch_id: batchId }));
}

/** @param {string} policy @param {Diagnostic[]} diagnostics @param {number} sourceRevision */
function invalidDecision(policy, diagnostics, sourceRevision = 0) {
  return {
    action: 'need_revision', source_revision: sourceRevision,
    root_issues: [], pending_root_issues: [], state: null, semantic_snapshot: null,
    interaction: { policy: POLICIES.has(policy) ? policy : null, paused: false },
    diagnostics: finalizeDiagnostics(diagnostics)
  };
}

/**
 * Evaluate one complete post-classification clarification snapshot.
 * Root identity is derived exclusively from missing type, stable semantic refs,
 * and normalized scope; submitted revision and obligation associations never
 * participate in the ID.
 * @param {unknown} submittedContext
 * @param {string} interactionPolicy
 * @returns {any}
 */
export function evaluateClarification(submittedContext, interactionPolicy) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  if (!POLICIES.has(interactionPolicy)) diagnostics.push(diagnostic(
    'classification', 'INTERACTION_POLICY_INVALID', '/interaction_policy', 'internal interaction policy is outside the closed two-value contract'
  ));
  const captured = snapshotControlled(submittedContext);
  diagnostics.push(...captured.diagnostics);
  if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics);
  try {
    const context = record(captured.snapshot, '/', diagnostics);
    checkKeys(context, ['source_revision', 'blocked_obligations', 'prior_state', 'append_batch', 'semantic_snapshot'], '', diagnostics);
    const sourceRevision = integer(context.source_revision, '/source_revision', diagnostics, 0);
    const blocked = normalizeBlocked(context.blocked_obligations, '/blocked_obligations', diagnostics);
    const prior = normalizePriorState(context.prior_state, '/prior_state', diagnostics);
    const batch = normalizeAppendBatch(context.append_batch, '/append_batch', diagnostics);
    const semantics = normalizeSemanticSnapshot(context.semantic_snapshot, '/semantic_snapshot', diagnostics);
    const blockedIds = blocked.map((item) => item.obligation_id);
    const semanticBlockedIds = semantics.formal_test_points.filter((point) => point.classification === 'blocked')
      .map((point) => point.obligation_id);
    if (!sameSet(blockedIds, semanticBlockedIds)) diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_DESCRIPTOR_SET_MISMATCH', '/blocked_obligations',
      'every current Blocked formal Test Point must have exactly one root descriptor'
    ));
    validatePriorState(prior, diagnostics);
    const combined = validateHistory(prior, batch, sourceRevision, semantics, diagnostics);
    const roots = buildRootIssues(blocked, sourceRevision, diagnostics);
    if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics, sourceRevision);

    const dispositions = new Map(prior.root_issue_dispositions.map((item) => [item.root_issue_id, item.status]));
    for (const root of roots) if (!dispositions.has(root.root_issue_id)) dispositions.set(root.root_issue_id, 'open');
    const currentRootIds = new Set(roots.map((root) => root.root_issue_id));
    const priorPoints = new Map((prior.semantic_snapshot?.formal_test_points ?? [])
      .map((point) => [point.obligation_id, point]));
    const currentPoints = new Map(semantics.formal_test_points.map((point) => [point.obligation_id, point]));
    /** @param {any} point */
    const formalTuple = (point) => canonicalStringify({
      classification: point.classification,
      evidence_level: point.evidence_level,
      blocked_reason: point.blocked_reason
    });
    const decidedKinds = new Map();
    let hasEffectiveDecision = false;
    let hasReopen = false;
    let requestDelivery = false;
    for (const entry of combined) {
      if (entry.kind === 'decision') {
        const decisionRecord = /** @type {any} */ (entry.item);
        const canProvideEvidence = decisionRecord.disposition === 'final' || decisionRecord.disposition === 'temporary';
        const changedBlockedPoint = canProvideEvidence && decisionRecord.affected_obligation_ids.some((/** @type {string} */ obligationId) => {
          const priorPoint = priorPoints.get(obligationId);
          const currentPoint = currentPoints.get(obligationId);
          return priorPoint?.classification === 'blocked' && currentPoint
            && formalTuple(priorPoint) !== formalTuple(currentPoint);
        });
        for (const rootId of decisionRecord.root_issue_ids) {
          const effective = canProvideEvidence && !currentRootIds.has(rootId) && changedBlockedPoint;
          const status = effective
            ? (decisionRecord.disposition === 'final' ? 'resolved_final' : 'resolved_temporary')
            : decisionRecord.disposition === 'unknown' ? 'suppressed_unknown' : 'suppressed_deferred';
          if (effective) hasEffectiveDecision = true;
          dispositions.set(rootId, status);
          decidedKinds.set(rootId, decisionRecord.disposition);
        }
      } else {
        const event = /** @type {any} */ (entry.item);
        if (event.type === 'reopen_root_issues') {
          hasReopen = true;
          for (const rootId of event.root_issue_ids) dispositions.set(rootId, 'open');
        } else requestDelivery = true;
      }
    }
    if (combined.length > 0) {
      for (const rootId of prior.last_pending_root_issue_ids) if (!decidedKinds.has(rootId)) dispositions.set(rootId, 'suppressed_deferred');
    }

    let stop = null;
    let action = 'deliver';
    /** @type {any[]} */
    let pendingRoots = [];
    if (requestDelivery) {
      for (const rootId of prior.last_pending_root_issue_ids) dispositions.set(rootId, 'suppressed_deferred');
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (root.answerable && (status === 'open' || status === 'asked'
          || decidedKinds.has(root.root_issue_id))) dispositions.set(root.root_issue_id, 'suppressed_deferred');
      }
      stop = { reason: 'user_requested_delivery', source_revision: sourceRevision };
    } else if (batch.decision_records.length > 0 && !hasReopen && !hasEffectiveDecision) {
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (root.answerable && (status === 'open' || status === 'asked')) {
          dispositions.set(root.root_issue_id, 'suppressed_deferred');
        }
      }
      stop = { reason: 'no_information_gain', source_revision: sourceRevision };
    } else if (interactionPolicy === 'pause_for_clarification') {
      const idempotentPending = combined.length === 0 && sourceRevision === prior.source_revision
        ? new Set(prior.last_pending_root_issue_ids) : null;
      pendingRoots = roots.filter((root) => root.answerable && (
        dispositions.get(root.root_issue_id) === 'open'
        || (idempotentPending?.has(root.root_issue_id) && dispositions.get(root.root_issue_id) === 'asked')
      )).sort(riskOrder);
      if (pendingRoots.length > 0) {
        action = 'need_user_answers';
        for (const root of pendingRoots) dispositions.set(root.root_issue_id, 'asked');
      } else {
        const activePriorStop = prior.clarification_stop?.source_revision === sourceRevision
          ? prior.clarification_stop : null;
        stop = activePriorStop ? structuredClone(activePriorStop) : { reason: 'converged', source_revision: sourceRevision };
      }
    }

    const pendingOutput = action === 'need_user_answers' ? pendingWithBatch(pendingRoots) : [];
    const pendingIds = pendingOutput.map((root) => root.root_issue_id).sort(compareCodePoints);
    const askedIds = new Set(prior.asked_root_issue_ids);
    for (const [rootId, status] of dispositions) if (status !== 'open') askedIds.add(rootId);
    if (interactionPolicy === 'record_only') for (const rootId of askedIds) {
      if (dispositions.get(rootId) === 'open') dispositions.set(rootId, 'suppressed_deferred');
    }
    const nextEventSeq = combined.length > 0 ? combined[combined.length - 1].seq : prior.clarification_event_seq;
    const state = {
      source_revision: sourceRevision,
      clarification_event_seq: nextEventSeq,
      asked_root_issue_ids: [...askedIds].sort(compareCodePoints),
      root_issue_dispositions: [...dispositions].map(([root_issue_id, status]) => ({ root_issue_id, status }))
        .sort((left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id)),
      last_pending_root_issue_ids: pendingIds,
      last_question_set_digest: pendingIds.length > 0 ? digest(pendingIds) : '',
      clarification_stop: interactionPolicy === 'record_only' ? null : stop,
      semantic_snapshot: structuredClone(semantics)
    };
    return {
      action, source_revision: sourceRevision,
      root_issues: structuredClone(roots), pending_root_issues: pendingOutput,
      state, semantic_snapshot: structuredClone(semantics),
      interaction: { policy: interactionPolicy, paused: action === 'need_user_answers' },
      diagnostics: []
    };
  } catch {
    return invalidDecision(interactionPolicy, [diagnostic(
      'classification', 'CLARIFICATION_INPUT_UNREADABLE', '/', 'clarification input could not be evaluated from its trusted snapshot'
    )]);
  }
}
