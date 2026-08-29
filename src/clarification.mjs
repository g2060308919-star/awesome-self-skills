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
const NATIVE_REFLECT_APPLY = Reflect.apply;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;
const NATIVE_ARRAY_ENTRIES = Array.prototype.entries;
const NATIVE_ARRAY_MAP = Array.prototype.map;
const NATIVE_ARRAY_FILTER = Array.prototype.filter;
const NATIVE_ARRAY_SORT = Array.prototype.sort;
const NATIVE_ARRAY_SOME = Array.prototype.some;
const NATIVE_ARRAY_PUSH = Array.prototype.push;
const NATIVE_ARRAY_POP = Array.prototype.pop;
const NATIVE_ARRAY_SLICE = Array.prototype.slice;

/** @param {any[]} value @param {(...args:any[])=>any} callback */
function arrayMap(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_MAP, value, [callback]);
}

/** @param {any[]} value @param {(...args:any[])=>any} callback */
function arrayFilter(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_FILTER, value, [callback]);
}

/** @param {any[]} value @param {(...args:any[])=>any} callback */
function arraySome(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SOME, value, [callback]);
}

/** @param {any[]} value @param {(...args:any[])=>any} callback */
function arraySort(value, callback) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SORT, value, [callback]);
}

/** @param {any[]} value @param {...any} items */
function arrayPush(value, ...items) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_PUSH, value, items);
}

/** @param {any[]} value */
function arrayEntries(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_ENTRIES, value, []);
}

/** @param {any[]} value */
function arrayPop(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_POP, value, []);
}

/** @param {any[]} value @param {number} start @param {number} [end] */
function arraySlice(value, start, end) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SLICE, value, end === undefined ? [start] : [start, end]);
}

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

/** @param {Diagnostic} item */
function diagnosticKey(item) {
  return `${item.category}\0${item.code}\0${item.path}\0${item.message}`;
}

/** @param {Diagnostic} left @param {Diagnostic} right */
function compareDiagnostics(left, right) {
  return compareCodePoints(diagnosticKey(left), diagnosticKey(right));
}

/** @param {Diagnostic[]} diagnostics */
function finalizeDiagnostics(diagnostics) {
  const unique = new Map();
  let overflow = false;
  for (const item of diagnostics) {
    if (item.code === 'DIAGNOSTICS_TRUNCATED') overflow = true;
    else unique.set(diagnosticKey(item), item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT) overflow = true;
  const sorted = arraySort([...unique.values()], compareDiagnostics);
  if (!overflow) return sorted;
  const retained = arraySlice(sorted, 0, DIAGNOSTIC_LIMIT - 1);
  arrayPush(retained, diagnostic(
    'classification', 'DIAGNOSTICS_TRUNCATED', '/', `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return arraySort(retained, compareDiagnostics);
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
    if (diagnostics.length < DIAGNOSTIC_LIMIT) arrayPush(diagnostics, item);
    else diagnosticsTruncated = true;
  };
  /** @type {unknown} */
  let snapshot;
  /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
  const pending = [{ source: root, path: '', assign(value) { snapshot = value; } }];
  const seen = new Set();
  while (pending.length > 0) {
    const { source, path, assign } = /** @type {{source:unknown,path:string,assign:(value:unknown)=>void}} */ (arrayPop(pending));
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
      if (arraySome(keys, (key) => typeof key === 'symbol')) {
        invalidOwnKeys = true;
        addDiagnostic(diagnostic(
          'schema', 'ARRAY_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled arrays cannot contain symbol properties'
        ));
      }
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, 'value') && Number.isSafeInteger(lengthDescriptor.value)
        ? Number(lengthDescriptor.value) : 0;
      /** @type {number[]} */
      const numeric = [];
      for (const key of arraySort(arrayFilter(keys, (item) => typeof item === 'string'), compareCodePoints)) {
        if (key === 'length') continue;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
          invalidOwnKeys = true;
          addDiagnostic(diagnostic(
            'schema', 'ARRAY_NAMED_PROPERTY_INVALID', `${path}/${pointerPart(key)}`, 'controlled arrays cannot contain named properties'
          ));
        }
        else arrayPush(numeric, index);
      }
      if (invalidOwnKeys) {
        assign(null);
        continue;
      }
      arraySort(numeric, (left, right) => left - right);
      /** @type {unknown[]} */
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
        else arrayPush(children, {
          source: descriptor.value, path: `${path}/${index}`,
          /** @param {unknown} value */
          assign(value) { target[index] = value; }
        });
      }
      for (let index = children.length - 1; index >= 0; index -= 1) arrayPush(pending, children[index]);
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      addDiagnostic(diagnostic('schema', 'RECORD_PROTOTYPE_INVALID', path || '/', 'controlled records must use a plain or null prototype'));
      assign(null);
      continue;
    }
    const keys = NATIVE_REFLECT_OWN_KEYS(descriptors);
    if (arraySome(keys, (key) => typeof key === 'symbol')) addDiagnostic(diagnostic(
      'schema', 'RECORD_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled records cannot contain symbol properties'
    ));
    /** @type {Record<string, unknown>} */
    const target = Object.create(null);
    assign(target);
    /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
    const children = [];
    for (const key of arraySort(arrayFilter(keys, (item) => typeof item === 'string'), compareCodePoints)) {
      const descriptor = descriptors[key];
      const childPath = `${path}/${pointerPart(key)}`;
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) addDiagnostic(diagnostic(
        'schema', 'ACCESSOR_NOT_ALLOWED', childPath, 'controlled input must use own data properties'
      ));
      else arrayPush(children, {
        source: descriptor.value,
        path: childPath,
        /** @param {unknown} value */
        assign(value) { NATIVE_DEFINE_PROPERTY(target, key, { value, enumerable: true, writable: true, configurable: true }); }
      });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) arrayPush(pending, children[index]);
  }
  if (diagnosticsTruncated) arrayPush(diagnostics, diagnostic(
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
  for (const key of Object.keys(value)) if (!permitted.has(key)) arrayPush(diagnostics, diagnostic(
    'schema', 'UNKNOWN_KEY', `${path}/${pointerPart(key)}`, 'unknown controlled clarification field is not allowed'
  ));
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function record(value, path, diagnostics) {
  if (isRecord(value)) return value;
  arrayPush(diagnostics, diagnostic('schema', 'RECORD_REQUIRED', path, 'controlled clarification value must be a record'));
  return {};
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function array(value, path, diagnostics) {
  if (Array.isArray(value)) return value;
  arrayPush(diagnostics, diagnostic('schema', 'ARRAY_REQUIRED', path, 'controlled clarification value must be an array'));
  return [];
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {boolean} [allowEmpty] */
function canonicalString(value, path, diagnostics, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && normalizeText(value).length === 0)
    || value !== value.normalize('NFC') || value !== value.trim()) {
    arrayPush(diagnostics, diagnostic('schema', 'CANONICAL_STRING_INVALID', path, 'value must be a canonical nonpadded string'));
    return '';
  }
  return value;
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {boolean} [nonempty] */
function stringSet(value, path, diagnostics, nonempty = false) {
  const input = array(value, path, diagnostics);
  /** @type {string[]} */
  const output = [];
  const seen = new Set();
  for (let index = 0; index < input.length; index += 1) {
    const item = canonicalString(input[index], `${path}/${index}`, diagnostics);
    if (!item) continue;
    if (seen.has(item)) arrayPush(diagnostics, diagnostic('schema', 'SET_VALUE_DUPLICATE', `${path}/${index}`, 'set-like values must be unique'));
    else {
      seen.add(item);
      arrayPush(output, item);
    }
  }
  if (nonempty && output.length === 0) arrayPush(diagnostics, diagnostic('schema', 'NONEMPTY_ARRAY_REQUIRED', path, 'set-like array must not be empty'));
  return arraySort(output, compareCodePoints);
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {number} minimum */
function integer(value, path, diagnostics, minimum) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    arrayPush(diagnostics, diagnostic('schema', 'INTEGER_INVALID', path, `value must be an integer at least ${minimum}`));
    return minimum;
  }
  return Number(value);
}

/** @param {unknown} value @param {Set<string>} allowed @param {string} path @param {Diagnostic[]} diagnostics */
function enumeration(value, allowed, path, diagnostics) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    arrayPush(diagnostics, diagnostic('schema', 'ENUM_INVALID', path, 'value is outside the closed clarification enumeration'));
    return '';
  }
  return value;
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizeSemanticSnapshot(value, path, diagnostics) {
  const snapshot = record(value, path, diagnostics);
  checkKeys(snapshot, ['formal_test_points', 'coverage_denominator', 'delivery_sections'], path, diagnostics);
  /** @type {Array<{obligation_id:string,evidence_level:string,classification:string,blocked_reason:string|null}>} */
  const points = [];
  const pointIds = new Set();
  for (const [index, raw] of arrayEntries(array(snapshot.formal_test_points, `${path}/formal_test_points`, diagnostics))) {
    const point = record(raw, `${path}/formal_test_points/${index}`, diagnostics);
    checkKeys(point, ['obligation_id', 'evidence_level', 'classification', 'blocked_reason'], `${path}/formal_test_points/${index}`, diagnostics);
    const obligationId = canonicalString(point.obligation_id, `${path}/formal_test_points/${index}/obligation_id`, diagnostics);
    const evidenceLevel = enumeration(point.evidence_level, EVIDENCE_LEVELS, `${path}/formal_test_points/${index}/evidence_level`, diagnostics);
    const classification = enumeration(point.classification, CLASSIFICATIONS, `${path}/formal_test_points/${index}/classification`, diagnostics);
    let blockedReason = null;
    if (point.blocked_reason !== null) blockedReason = canonicalString(point.blocked_reason, `${path}/formal_test_points/${index}/blocked_reason`, diagnostics);
    if (classification === 'blocked' && !blockedReason) arrayPush(diagnostics, diagnostic(
      'classification', 'BLOCKED_REASON_REQUIRED', `${path}/formal_test_points/${index}/blocked_reason`, 'Blocked formal Test Point requires a reason'
    ));
    if (classification !== 'blocked' && point.blocked_reason !== null) arrayPush(diagnostics, diagnostic(
      'classification', 'BLOCKED_REASON_UNEXPECTED', `${path}/formal_test_points/${index}/blocked_reason`, 'non-Blocked formal Test Point cannot carry a blocked reason'
    ));
    if (pointIds.has(obligationId)) arrayPush(diagnostics, diagnostic(
      'reference', 'FORMAL_TEST_POINT_DUPLICATE', `${path}/formal_test_points/${index}/obligation_id`, 'formal Test Point IDs must be unique'
    ));
    pointIds.add(obligationId);
    arrayPush(points, { obligation_id: obligationId, evidence_level: evidenceLevel, classification, blocked_reason: blockedReason });
  }
  arraySort(points, (left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  const denominator = integer(snapshot.coverage_denominator, `${path}/coverage_denominator`, diagnostics, 0);
  if (denominator !== points.length) arrayPush(diagnostics, diagnostic(
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
  if (deliveryDenominator !== denominator) arrayPush(diagnostics, diagnostic(
    'coverage', 'DELIVERY_DENOMINATOR_MISMATCH', `${path}/delivery_sections/coverage/formal_denominator`, 'delivery coverage denominator must match the semantic snapshot'
  ));
  const quality = record(delivery.quality, `${path}/delivery_sections/quality`, diagnostics);
  checkKeys(quality, ['delivery_status'], `${path}/delivery_sections/quality`, diagnostics);
  const deliveryStatus = enumeration(quality.delivery_status, DELIVERY_STATUSES, `${path}/delivery_sections/quality/delivery_status`, diagnostics);
  for (const [lane, submitted] of [['grounded', grounded], ['conditional', conditional], ['blocked', blocked]]) {
    const expected = arrayMap(arrayFilter(points, (point) => point.classification === lane), (point) => point.obligation_id);
    if (canonicalStringify(submitted) !== canonicalStringify(expected)) arrayPush(diagnostics, diagnostic(
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
  /** @type {any[]} */
  const output = [];
  const obligationIds = new Set();
  for (const [index, raw] of arrayEntries(array(value, path, diagnostics))) {
    const currentPath = `${path}/${index}`;
    const item = record(raw, currentPath, diagnostics);
    checkKeys(item, [
      'obligation_id', 'missing_type', 'semantic_refs', 'scope', 'risk', 'reason',
      'evidence_refs', 'answerable', 'question'
    ], currentPath, diagnostics);
    const obligationId = canonicalString(item.obligation_id, `${currentPath}/obligation_id`, diagnostics);
    const missingType = canonicalString(item.missing_type, `${currentPath}/missing_type`, diagnostics);
    if (missingType && !/^[a-z][a-z0-9-]*$/u.test(missingType)) arrayPush(diagnostics, diagnostic(
      'schema', 'MISSING_TYPE_INVALID', `${currentPath}/missing_type`, 'missing_type must use canonical lowercase kebab form'
    ));
    const semanticRefs = stringSet(item.semantic_refs, `${currentPath}/semantic_refs`, diagnostics, true);
    const rawScope = canonicalString(item.scope, `${currentPath}/scope`, diagnostics);
    const scope = rawScope ? normalizeScope(rawScope) : '';
    if (rawScope && rawScope !== scope) arrayPush(diagnostics, diagnostic(
      'schema', 'SCOPE_CANONICAL_INVALID', `${currentPath}/scope`, 'scope must already be normalized'
    ));
    const risk = enumeration(item.risk, RISKS, `${currentPath}/risk`, diagnostics);
    const reason = canonicalString(item.reason, `${currentPath}/reason`, diagnostics);
    const evidenceRefs = stringSet(item.evidence_refs, `${currentPath}/evidence_refs`, diagnostics);
    if (typeof item.answerable !== 'boolean') arrayPush(diagnostics, diagnostic(
      'schema', 'BOOLEAN_INVALID', `${currentPath}/answerable`, 'answerable must be boolean'
    ));
    const question = canonicalString(item.question, `${currentPath}/question`, diagnostics);
    if (obligationIds.has(obligationId)) arrayPush(diagnostics, diagnostic(
      'reference', 'BLOCKED_OBLIGATION_DUPLICATE', `${currentPath}/obligation_id`, 'Blocked formal obligation IDs must be unique'
    ));
    obligationIds.add(obligationId);
    arrayPush(output, {
      obligation_id: obligationId, missing_type: missingType, semantic_refs: semanticRefs,
      scope, risk, reason, evidence_refs: evidenceRefs, answerable: item.answerable === true, question
    });
  }
  arraySort(output, (left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  return output;
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizeRootLedger(value, path, diagnostics) {
  /** @type {any[]} */
  const output = [];
  const ids = new Set();
  for (const [index, raw] of arrayEntries(array(value, path, diagnostics))) {
    const itemPath = `${path}/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, [
      'root_issue_id', 'root_issue_key', 'missing_type', 'semantic_refs', 'scope',
      'affected_obligation_ids', 'risk_counts', 'question', 'answerable', 'reasons',
      'evidence_refs', 'current'
    ], itemPath, diagnostics);
    const missingType = canonicalString(item.missing_type, `${itemPath}/missing_type`, diagnostics);
    const semanticRefs = stringSet(item.semantic_refs, `${itemPath}/semantic_refs`, diagnostics, true);
    const scope = canonicalString(item.scope, `${itemPath}/scope`, diagnostics);
    const signature = { missing_type: missingType, semantic_refs: semanticRefs, scope };
    const expectedKey = canonicalStringify(signature);
    const rootIssueId = canonicalString(item.root_issue_id, `${itemPath}/root_issue_id`, diagnostics);
    const rootIssueKey = canonicalString(item.root_issue_key, `${itemPath}/root_issue_key`, diagnostics);
    if (rootIssueKey !== expectedKey) arrayPush(diagnostics, diagnostic(
      'traceability', 'ROOT_ISSUE_KEY_MISMATCH', `${itemPath}/root_issue_key`,
      'root snapshot key must exactly encode its normalized semantic root fields'
    ));
    if (rootIssueId !== stableId('root', signature)) arrayPush(diagnostics, diagnostic(
      'traceability', 'ROOT_ISSUE_ID_MISMATCH', `${itemPath}/root_issue_id`,
      'root snapshot identity must derive from its canonical semantic key'
    ));
    const riskRecord = record(item.risk_counts, `${itemPath}/risk_counts`, diagnostics);
    checkKeys(riskRecord, ['critical', 'high', 'medium', 'low'], `${itemPath}/risk_counts`, diagnostics);
    const riskCounts = {
      critical: integer(riskRecord.critical, `${itemPath}/risk_counts/critical`, diagnostics, 0),
      high: integer(riskRecord.high, `${itemPath}/risk_counts/high`, diagnostics, 0),
      medium: integer(riskRecord.medium, `${itemPath}/risk_counts/medium`, diagnostics, 0),
      low: integer(riskRecord.low, `${itemPath}/risk_counts/low`, diagnostics, 0)
    };
    if (typeof item.answerable !== 'boolean') arrayPush(diagnostics, diagnostic(
      'schema', 'BOOLEAN_INVALID', `${itemPath}/answerable`, 'answerable must be boolean'
    ));
    if (typeof item.current !== 'boolean') arrayPush(diagnostics, diagnostic(
      'schema', 'BOOLEAN_INVALID', `${itemPath}/current`, 'current must be boolean'
    ));
    if (ids.has(rootIssueId)) arrayPush(diagnostics, diagnostic(
      'reference', 'ROOT_SNAPSHOT_DUPLICATE', `${itemPath}/root_issue_id`,
      'root snapshot ledger IDs must be unique'
    ));
    ids.add(rootIssueId);
    arrayPush(output, {
      root_issue_id: rootIssueId,
      root_issue_key: rootIssueKey,
      missing_type: missingType,
      semantic_refs: semanticRefs,
      scope,
      affected_obligation_ids: stringSet(item.affected_obligation_ids, `${itemPath}/affected_obligation_ids`, diagnostics, true),
      risk_counts: riskCounts,
      question: canonicalString(item.question, `${itemPath}/question`, diagnostics),
      answerable: item.answerable === true,
      reasons: stringSet(item.reasons, `${itemPath}/reasons`, diagnostics, true),
      evidence_refs: stringSet(item.evidence_refs, `${itemPath}/evidence_refs`, diagnostics),
      current: item.current === true
    });
  }
  return arraySort(output, (left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizePriorState(value, path, diagnostics) {
  const prior = record(value, path, diagnostics);
  checkKeys(prior, [
    'source_revision', 'clarification_event_seq', 'asked_root_issue_ids', 'root_issue_dispositions',
    'last_pending_root_issue_ids', 'last_question_set_digest', 'clarification_stop', 'semantic_snapshot',
    'root_snapshot_ledger'
  ], path, diagnostics);
  const sourceRevision = integer(prior.source_revision, `${path}/source_revision`, diagnostics, 0);
  const eventSeq = integer(prior.clarification_event_seq, `${path}/clarification_event_seq`, diagnostics, 0);
  const asked = stringSet(prior.asked_root_issue_ids, `${path}/asked_root_issue_ids`, diagnostics);
  const pending = stringSet(prior.last_pending_root_issue_ids, `${path}/last_pending_root_issue_ids`, diagnostics);
  /** @type {any[]} */
  const dispositions = [];
  const dispositionIds = new Set();
  for (const [index, raw] of arrayEntries(array(prior.root_issue_dispositions, `${path}/root_issue_dispositions`, diagnostics))) {
    const itemPath = `${path}/root_issue_dispositions/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, ['root_issue_id', 'status'], itemPath, diagnostics);
    const rootIssueId = canonicalString(item.root_issue_id, `${itemPath}/root_issue_id`, diagnostics);
    const status = enumeration(item.status, ROOT_STATUSES, `${itemPath}/status`, diagnostics);
    if (dispositionIds.has(rootIssueId)) arrayPush(diagnostics, diagnostic(
      'reference', 'ROOT_DISPOSITION_DUPLICATE', `${itemPath}/root_issue_id`, 'root issue disposition IDs must be unique'
    ));
    dispositionIds.add(rootIssueId);
    arrayPush(dispositions, { root_issue_id: rootIssueId, status });
  }
  arraySort(dispositions, (left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
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
  const ledger = normalizeRootLedger(prior.root_snapshot_ledger, `${path}/root_snapshot_ledger`, diagnostics);
  return {
    source_revision: sourceRevision, clarification_event_seq: eventSeq,
    asked_root_issue_ids: asked, root_issue_dispositions: dispositions,
    last_pending_root_issue_ids: pending, last_question_set_digest: lastDigest,
    clarification_stop: stop, semantic_snapshot: semantic, root_snapshot_ledger: ledger
  };
}

/** @param {ReturnType<typeof normalizePriorState>} prior @param {Diagnostic[]} diagnostics */
function validatePriorState(prior, diagnostics) {
  const dispositionById = new Map(arrayMap(prior.root_issue_dispositions, (item) => [item.root_issue_id, item.status]));
  const ledgerById = new Map(arrayMap(prior.root_snapshot_ledger, (item) => [item.root_issue_id, item]));
  const askedHistory = new Set(prior.asked_root_issue_ids);
  const askedDispositions = arrayMap(
    arrayFilter(prior.root_issue_dispositions, (item) => item.status === 'asked'),
    (item) => item.root_issue_id
  );
  if (!sameSet(prior.last_pending_root_issue_ids, askedDispositions)) arrayPush(diagnostics, diagnostic(
    'classification', 'PRIOR_PENDING_DISPOSITION_MISMATCH', '/prior_state/last_pending_root_issue_ids',
    'prior pending roots must exactly equal dispositions whose status is asked'
  ));
  for (const rootId of prior.last_pending_root_issue_ids) if (!askedHistory.has(rootId)) arrayPush(diagnostics, diagnostic(
    'classification', 'PRIOR_PENDING_NOT_ASKED', `/prior_state/last_pending_root_issue_ids/${pointerPart(rootId)}`,
    'every prior pending root must appear in the cumulative asked history'
  ));
  for (const { root_issue_id: rootId, status } of prior.root_issue_dispositions) {
    if (status === 'open' && askedHistory.has(rootId) && ledgerById.get(rootId)?.current !== false) arrayPush(diagnostics, diagnostic(
      'classification', 'PRIOR_LIFECYCLE_STATE_INVALID', `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      'an open prior root can appear in asked history only as an explicitly reopened historical root'
    ));
    if (status !== 'open' && status !== 'suppressed_deferred' && !askedHistory.has(rootId)) arrayPush(diagnostics, diagnostic(
      'classification', 'PRIOR_DISPOSITION_HISTORY_MISMATCH', `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      'asked, resolved, and unknown-suppressed dispositions must appear in cumulative asked history'
    ));
    if (!ledgerById.has(rootId)) arrayPush(diagnostics, diagnostic(
      'traceability', 'PRIOR_ROOT_SNAPSHOT_MISSING', `/prior_state/root_issue_dispositions/${pointerPart(rootId)}`,
      'every lifecycle disposition must retain its canonical root snapshot'
    ));
  }
  for (const rootId of prior.asked_root_issue_ids) if (!dispositionById.has(rootId)) arrayPush(diagnostics, diagnostic(
    'classification', 'PRIOR_DISPOSITION_HISTORY_MISMATCH', `/prior_state/asked_root_issue_ids/${pointerPart(rootId)}`,
    'every cumulative asked root must retain one lifecycle disposition'
  ));
  const priorPointById = new Map(arrayMap(
    prior.semantic_snapshot?.formal_test_points ?? [], (point) => [point.obligation_id, point]
  ));
  for (const root of prior.root_snapshot_ledger) {
    const status = dispositionById.get(root.root_issue_id);
    const requiresBlockedTuple = root.current || isRetainedGateStatus(status);
    const expectedReasons = new Set();
    const reasons = new Set(root.reasons);
    if (!dispositionById.has(root.root_issue_id)) arrayPush(diagnostics, diagnostic(
      'traceability', 'PRIOR_ROOT_DISPOSITION_MISSING', `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}`,
      'every retained root snapshot must retain one lifecycle disposition'
    ));
    for (const obligationId of root.affected_obligation_ids) {
      const point = priorPointById.get(obligationId);
      if (point?.classification === 'blocked' && point.blocked_reason) expectedReasons.add(point.blocked_reason);
      if (!point || (requiresBlockedTuple && (
        point.classification !== 'blocked' || !reasons.has(point.blocked_reason)
      ))) arrayPush(diagnostics, diagnostic(
        'traceability', 'PRIOR_ROOT_ASSOCIATION_INVALID',
        `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}/affected_obligation_ids/${pointerPart(obligationId)}`,
        'a current prior root must retain its own Blocked formal obligation and reason association'
      ));
    }
    if (requiresBlockedTuple && !sameSet(root.reasons, [...expectedReasons])) arrayPush(
      diagnostics,
      diagnostic(
        'traceability', 'PRIOR_ROOT_ASSOCIATION_INVALID',
        `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}/reasons`,
        'an active or retained gated root must exactly summarize its associated Blocked reasons'
      )
    );
  }
  validateRootPartition(
    prior.root_snapshot_ledger, dispositionById, prior.semantic_snapshot, diagnostics, '/prior_state'
  );
  for (const rootId of prior.last_pending_root_issue_ids) if (!ledgerById.get(rootId)?.current) arrayPush(
    diagnostics,
    diagnostic(
      'traceability', 'PRIOR_PENDING_ROOT_SNAPSHOT_INVALID',
      `/prior_state/last_pending_root_issue_ids/${pointerPart(rootId)}`,
      'every pending root must identify a current canonical prior root snapshot'
    )
  );
  const expectedDigest = prior.last_pending_root_issue_ids.length === 0
    ? '' : digest(arraySort([...prior.last_pending_root_issue_ids], compareCodePoints));
  if (prior.last_question_set_digest !== expectedDigest) arrayPush(diagnostics, diagnostic(
    'traceability', 'PRIOR_PENDING_DIGEST_MISMATCH', '/prior_state/last_question_set_digest',
    'prior question-set digest must be derived from the exact sorted pending root set'
  ));
  if (prior.clarification_stop && (
    prior.last_pending_root_issue_ids.length > 0
    || prior.clarification_stop.source_revision !== prior.source_revision
  )) arrayPush(diagnostics, diagnostic(
    'classification', 'PRIOR_STOP_STATE_INVALID', '/prior_state/clarification_stop',
    'prior clarification stop must belong to its exact revision and have no pending roots'
  ));
}

/** @param {string|undefined} status */
function isRetainedGateStatus(status) {
  return status === 'suppressed_deferred' || status === 'suppressed_unknown';
}

/**
 * A Blocked formal Test Point has exactly one active root owner. Current roots
 * take precedence over retained suppressed/reopened historical roots.
 * @param {ReturnType<typeof normalizeRootLedger>} ledger
 * @param {Map<string,string>} dispositionById
 * @param {ReturnType<typeof normalizeSemanticSnapshot>|null} semantics
 * @param {Diagnostic[]} diagnostics
 * @param {string} path
 */
function validateRootPartition(ledger, dispositionById, semantics, diagnostics, path) {
  if (!semantics) return;
  /** @type {Map<string, any[]>} */
  const currentOwners = new Map();
  /** @type {Map<string, any[]>} */
  const retainedOwners = new Map();
  for (const root of ledger) {
    const status = dispositionById.get(root.root_issue_id);
    const retained = !root.current && (isRetainedGateStatus(status) || status === 'open');
    if (!root.current && !retained) continue;
    const index = root.current ? currentOwners : retainedOwners;
    for (const obligationId of root.affected_obligation_ids) {
      const bucket = index.get(obligationId) ?? [];
      arrayPush(bucket, root);
      index.set(obligationId, bucket);
    }
  }
  for (const point of semantics.formal_test_points) {
    if (point.classification !== 'blocked') continue;
    const active = currentOwners.get(point.obligation_id) ?? [];
    const retained = retainedOwners.get(point.obligation_id) ?? [];
    if (active.length !== 1 && (active.length !== 0 || retained.length !== 1)) arrayPush(
      diagnostics,
      diagnostic(
        'traceability', 'PRIOR_ROOT_PARTITION_INVALID', `${path}/root_snapshot_ledger`,
        'Blocked formal Test Points must form a complete nonoverlapping partition across active or retained gated roots'
      )
    );
  }
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function normalizeAppendBatch(value, path, diagnostics) {
  const batch = record(value, path, diagnostics);
  checkKeys(batch, ['decision_records', 'clarification_events'], path, diagnostics);
  /** @type {any[]} */
  const decisions = [];
  const decisionIds = new Set();
  for (const [index, raw] of arrayEntries(array(batch.decision_records, `${path}/decision_records`, diagnostics))) {
    const itemPath = `${path}/decision_records/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, [
      'decision_id', 'question_id', 'root_issue_ids', 'affected_obligation_ids', 'clarification_event_seq',
      'confirmer', 'confirmed_at', 'question', 'answer', 'disposition', 'authority_scope', 'effective_scope',
      'evidence_ref', 'evidence_level'
    ], itemPath, diagnostics);
    const decisionId = canonicalString(item.decision_id, `${itemPath}/decision_id`, diagnostics);
    if (decisionIds.has(decisionId)) arrayPush(diagnostics, diagnostic('reference', 'DECISION_ID_DUPLICATE', `${itemPath}/decision_id`, 'append Decision Record IDs must be unique'));
    decisionIds.add(decisionId);
    const disposition = enumeration(item.disposition, DECISION_DISPOSITIONS, `${itemPath}/disposition`, diagnostics);
    const answer = canonicalString(item.answer, `${itemPath}/answer`, diagnostics, disposition === 'unknown' || disposition === 'deferred');
    const evidenceLevel = enumeration(item.evidence_level, new Set(['E1', 'E3']), `${itemPath}/evidence_level`, diagnostics);
    if (disposition === 'final' && evidenceLevel !== 'E3') arrayPush(diagnostics, diagnostic('classification', 'DECISION_EVIDENCE_LEVEL_INVALID', `${itemPath}/evidence_level`, 'final Decision Record must be E3'));
    if (disposition === 'temporary' && evidenceLevel !== 'E1') arrayPush(diagnostics, diagnostic('classification', 'DECISION_EVIDENCE_LEVEL_INVALID', `${itemPath}/evidence_level`, 'temporary Decision Record must be E1'));
    arrayPush(decisions, {
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
  /** @type {any[]} */
  const events = [];
  const eventIds = new Set();
  for (const [index, raw] of arrayEntries(array(batch.clarification_events, `${path}/clarification_events`, diagnostics))) {
    const itemPath = `${path}/clarification_events/${index}`;
    const item = record(raw, itemPath, diagnostics);
    checkKeys(item, ['event_id', 'clarification_event_seq', 'type', 'actor', 'event_at', 'root_issue_ids'], itemPath, diagnostics);
    const eventId = canonicalString(item.event_id, `${itemPath}/event_id`, diagnostics);
    if (eventIds.has(eventId)) arrayPush(diagnostics, diagnostic('reference', 'CONTROL_EVENT_ID_DUPLICATE', `${itemPath}/event_id`, 'append control event IDs must be unique'));
    eventIds.add(eventId);
    arrayPush(events, {
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
  return canonicalStringify(arraySort([...left], compareCodePoints)) === canonicalStringify(arraySort([...right], compareCodePoints));
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
  if (!strictlyIncreasing(batch.decision_records, 'clarification_event_seq')) arrayPush(diagnostics, diagnostic(
    'classification', 'CLARIFICATION_EVENT_SEQUENCE_NONMONOTONE', '/append_batch/decision_records', 'Decision Record append order must be strictly monotonic'
  ));
  if (!strictlyIncreasing(batch.clarification_events, 'clarification_event_seq')) arrayPush(diagnostics, diagnostic(
    'classification', 'CLARIFICATION_EVENT_SEQUENCE_NONMONOTONE', '/append_batch/clarification_events', 'control event append order must be strictly monotonic'
  ));
  const combined = [
    ...arrayMap(batch.decision_records, (item) => ({ kind: 'decision', seq: item.clarification_event_seq, item })),
    ...arrayMap(batch.clarification_events, (item) => ({ kind: 'control', seq: item.clarification_event_seq, item }))
  ];
  arraySort(combined, (left, right) => left.seq - right.seq || compareCodePoints(left.kind, right.kind));
  const seenSeq = new Set();
  for (const entry of combined) {
    if (seenSeq.has(entry.seq)) arrayPush(diagnostics, diagnostic(
      'classification', 'CLARIFICATION_EVENT_SEQUENCE_DUPLICATE', '/append_batch', 'Decision Records and control events share one unique sequence'
    ));
    seenSeq.add(entry.seq);
  }
  for (let index = 0; index < combined.length; index += 1) {
    if (combined[index].seq !== prior.clarification_event_seq + index + 1) arrayPush(diagnostics, diagnostic(
      'classification', 'CLARIFICATION_EVENT_SEQUENCE_GAP', '/append_batch', 'append sequence must continue the prior sequence without gaps'
    ));
  }
  if (combined.length === 0) {
    if (sourceRevision !== prior.source_revision) arrayPush(diagnostics, diagnostic(
      'classification', 'APPEND_REVISION_INVALID', '/source_revision',
      'an empty append batch must replay the exact prior immutable source revision'
    ));
  } else if (sourceRevision !== prior.source_revision + 1) arrayPush(diagnostics, diagnostic(
    'classification', 'APPEND_REVISION_INVALID', '/source_revision', 'one append batch must create exactly the next immutable source revision'
  ));
  const formalIds = new Set(arrayMap(semantics.formal_test_points, (point) => point.obligation_id));
  const pending = new Set(prior.last_pending_root_issue_ids);
  const decidedRoots = new Set();
  for (const [index, item] of arrayEntries(batch.decision_records)) {
    const expectedQuestionId = stableId('question', { root_issue_ids: arraySort([...item.root_issue_ids], compareCodePoints) });
    if (item.question_id !== expectedQuestionId) arrayPush(diagnostics, diagnostic(
      'traceability', 'DECISION_QUESTION_ID_MISMATCH', `/append_batch/decision_records/${index}/question_id`,
      'Decision question identity must be derived only from its sorted root issue set'
    ));
    for (const rootId of item.root_issue_ids) {
      if (!pending.has(rootId)) arrayPush(diagnostics, diagnostic(
        'reference', 'DECISION_ROOT_UNKNOWN', `/append_batch/decision_records/${index}/root_issue_ids/${pointerPart(rootId)}`,
        'Decision Record must resolve a root from the prior complete pending set'
      ));
      if (decidedRoots.has(rootId)) arrayPush(diagnostics, diagnostic(
        'classification', 'DECISION_ROOT_DUPLICATE', `/append_batch/decision_records/${index}/root_issue_ids/${pointerPart(rootId)}`,
        'one append batch cannot decide the same root more than once'
      ));
      decidedRoots.add(rootId);
    }
    for (const obligationId of item.affected_obligation_ids) if (!formalIds.has(obligationId)) arrayPush(diagnostics, diagnostic(
      'reference', 'DECISION_OBLIGATION_UNKNOWN', `/append_batch/decision_records/${index}/affected_obligation_ids/${pointerPart(obligationId)}`,
      'Decision Record affected Test Point must exist in the current formal snapshot'
    ));
  }
  const priorDisposition = new Map(arrayMap(prior.root_issue_dispositions, (item) => [item.root_issue_id, item.status]));
  const reopened = new Set();
  let requestDeliveryCount = 0;
  for (const [index, event] of arrayEntries(batch.clarification_events)) {
    if (event.type === 'request_delivery') {
      requestDeliveryCount += 1;
      if (!sameSet(event.root_issue_ids, prior.last_pending_root_issue_ids)) arrayPush(diagnostics, diagnostic(
        'classification', 'REQUEST_DELIVERY_PENDING_SET_MISMATCH', `/append_batch/clarification_events/${index}/root_issue_ids`,
        'request_delivery must exactly equal the prior complete pending root set'
      ));
      if (combined[combined.length - 1]?.seq !== event.clarification_event_seq) arrayPush(diagnostics, diagnostic(
        'classification', 'REQUEST_DELIVERY_ORDER_INVALID', `/append_batch/clarification_events/${index}`,
        'request_delivery must be the final item in its append batch'
      ));
    } else if (event.type === 'reopen_root_issues') {
      for (const rootId of event.root_issue_ids) {
        const status = priorDisposition.get(rootId);
        if (!status) arrayPush(diagnostics, diagnostic(
          'reference', 'REOPEN_ROOT_UNKNOWN', `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          'reopen event references an unknown prior root issue'
        ));
        else if (status !== 'suppressed_unknown' && status !== 'suppressed_deferred') arrayPush(diagnostics, diagnostic(
          'classification', 'REOPEN_STATUS_INVALID', `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          'only suppressed unknown or deferred roots may be reopened'
        ));
        if (reopened.has(rootId)) arrayPush(diagnostics, diagnostic(
          'classification', 'REOPEN_ROOT_DUPLICATE', `/append_batch/clarification_events/${index}/root_issue_ids/${pointerPart(rootId)}`,
          'one append batch cannot reopen the same root twice'
        ));
        reopened.add(rootId);
      }
    }
  }
  if (requestDeliveryCount > 1) arrayPush(diagnostics, diagnostic(
    'classification', 'REQUEST_DELIVERY_DUPLICATE', '/append_batch/clarification_events', 'one append batch may contain at most one delivery request'
  ));
  if (requestDeliveryCount > 0 && reopened.size > 0) arrayPush(diagnostics, diagnostic(
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
      arrayPush(diagnostics, diagnostic(
        'traceability', 'ROOT_ISSUE_ID_COLLISION', `/blocked_obligations/${pointerPart(item.obligation_id)}`,
        'distinct semantic root keys cannot share one stable root issue ID'
      ));
      continue;
    } else {
      if (existing.question !== item.question || existing.answerable !== item.answerable) arrayPush(diagnostics, diagnostic(
        'classification', 'ROOT_DESCRIPTOR_CONFLICT', `/blocked_obligations/${pointerPart(item.obligation_id)}`,
        'one semantic root must have one answerability and question contract'
      ));
      arrayPush(existing.affected_obligation_ids, item.obligation_id);
      arrayPush(existing.reasons, item.reason);
      arrayPush(existing.evidence_refs, ...item.evidence_refs);
    }
    groups.get(rootIssueId).risk_counts[item.risk] += 1;
  }
  const output = [...groups.values()];
  for (const root of output) {
    root.affected_obligation_ids = arraySort([...new Set(root.affected_obligation_ids)], compareCodePoints);
    root.reasons = arraySort([...new Set(root.reasons)], compareCodePoints);
    root.evidence_refs = arraySort([...new Set(root.evidence_refs)], compareCodePoints);
  }
  return arraySort(output, (left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
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
  const sortedIds = arraySort(arrayMap(roots, (root) => root.root_issue_id), compareCodePoints);
  const batchId = stableId('batch', { root_issue_ids: sortedIds });
  return arrayMap(roots, (root) => ({ ...structuredClone(root), batch_id: batchId }));
}

/** @param {any} root @param {boolean} current */
function rootSnapshot(root, current) {
  return {
    root_issue_id: root.root_issue_id,
    root_issue_key: root.root_issue_key,
    missing_type: root.missing_type,
    semantic_refs: [...root.semantic_refs],
    scope: root.scope,
    affected_obligation_ids: [...root.affected_obligation_ids],
    risk_counts: { ...root.risk_counts },
    question: root.question,
    answerable: root.answerable,
    reasons: [...root.reasons],
    evidence_refs: [...root.evidence_refs],
    current
  };
}

/**
 * @param {ReturnType<typeof normalizeRootLedger>} priorLedger
 * @param {any[]} roots
 * @param {Diagnostic[]} diagnostics
 */
function nextRootLedger(priorLedger, roots, diagnostics) {
  const byId = new Map();
  for (const prior of priorLedger) byId.set(prior.root_issue_id, { ...structuredClone(prior), current: false });
  for (const root of roots) {
    const prior = byId.get(root.root_issue_id);
    if (prior && prior.root_issue_key !== root.root_issue_key) {
      arrayPush(diagnostics, diagnostic(
        'traceability', 'ROOT_ISSUE_ID_COLLISION', `/prior_state/root_snapshot_ledger/${pointerPart(root.root_issue_id)}`,
        'a current root cannot reuse a historical ID for a different canonical semantic key'
      ));
      continue;
    }
    byId.set(root.root_issue_id, rootSnapshot(root, true));
  }
  return arraySort([...byId.values()], (left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
}

/** @param {ReturnType<typeof normalizeSemanticSnapshot>} semantics */
function projectDeliveryLanes(semantics) {
  /** @param {string} classification */
  const lane = (classification) => arrayMap(
    arrayFilter(semantics.formal_test_points, (point) => point.classification === classification),
    (point) => point.obligation_id
  );
  semantics.delivery_sections.grounded = lane('grounded');
  semantics.delivery_sections.conditional = lane('conditional');
  semantics.delivery_sections.blocked = lane('blocked');
  const executable = semantics.delivery_sections.grounded.length + semantics.delivery_sections.conditional.length;
  semantics.delivery_sections.quality.delivery_status = semantics.formal_test_points.length === 0
    ? 'no_applicable_formal_test_points'
    : executable === 0 && semantics.delivery_sections.blocked.length > 0
      ? 'no_deterministic_cases'
      : 'executable_subset_ready';
  return semantics;
}

/**
 * Keep every obligation behind a delivery/no-gain root fail-closed.
 * @param {ReturnType<typeof normalizeSemanticSnapshot>} semantics
 * @param {ReturnType<typeof normalizeSemanticSnapshot>|null} priorSemantics
 * @param {Set<string>} obligationIds
 * @param {Diagnostic[]} diagnostics
 */
function projectBlockedSemantics(semantics, priorSemantics, obligationIds, diagnostics) {
  const output = structuredClone(semantics);
  const priorPoints = new Map(arrayMap(priorSemantics?.formal_test_points ?? [], (point) => [point.obligation_id, point]));
  for (const point of output.formal_test_points) {
    if (!obligationIds.has(point.obligation_id) || point.classification === 'blocked') continue;
    const priorPoint = priorPoints.get(point.obligation_id);
    if (priorPoint?.classification !== 'blocked') {
      arrayPush(diagnostics, diagnostic(
        'classification', 'BLOCKED_PROJECTION_UNAVAILABLE', `/semantic_snapshot/formal_test_points/${pointerPart(point.obligation_id)}`,
        'delivery suppression requires a retained prior Blocked formal tuple'
      ));
      continue;
    }
    point.classification = 'blocked';
    point.evidence_level = priorPoint.evidence_level;
    point.blocked_reason = priorPoint.blocked_reason;
  }
  return projectDeliveryLanes(output);
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
  if (!POLICIES.has(interactionPolicy)) arrayPush(diagnostics, diagnostic(
    'classification', 'INTERACTION_POLICY_INVALID', '/interaction_policy', 'internal interaction policy is outside the closed two-value contract'
  ));
  const captured = snapshotControlled(submittedContext);
  arrayPush(diagnostics, ...captured.diagnostics);
  if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics);
  try {
    const context = record(captured.snapshot, '/', diagnostics);
    checkKeys(context, ['source_revision', 'blocked_obligations', 'prior_state', 'append_batch', 'semantic_snapshot'], '', diagnostics);
    const sourceRevision = integer(context.source_revision, '/source_revision', diagnostics, 0);
    const blocked = normalizeBlocked(context.blocked_obligations, '/blocked_obligations', diagnostics);
    const prior = normalizePriorState(context.prior_state, '/prior_state', diagnostics);
    const batch = normalizeAppendBatch(context.append_batch, '/append_batch', diagnostics);
    const semantics = normalizeSemanticSnapshot(context.semantic_snapshot, '/semantic_snapshot', diagnostics);
    validatePriorState(prior, diagnostics);
    const combined = validateHistory(prior, batch, sourceRevision, semantics, diagnostics);
    const roots = buildRootIssues(blocked, sourceRevision, diagnostics);
    const pointById = new Map(arrayMap(semantics.formal_test_points, (point) => [point.obligation_id, point]));
    const descriptorIds = new Set(arrayMap(blocked, (item) => item.obligation_id));
    const priorDispositionById = new Map(arrayMap(
      prior.root_issue_dispositions, (item) => [item.root_issue_id, item.status]
    ));
    const replayGateRootIds = new Set(arrayMap(
      arrayFilter(prior.root_issue_dispositions, (item) => isRetainedGateStatus(item.status)),
      (item) => item.root_issue_id
    ));
    const replayLedger = nextRootLedger(prior.root_snapshot_ledger, roots, diagnostics);
    /** @type {Map<string, any[]>} */
    const retainedRootsByObligation = new Map();
    for (const root of prior.root_snapshot_ledger) {
      const status = priorDispositionById.get(root.root_issue_id);
      const retained = isRetainedGateStatus(status) || (!root.current && status === 'open')
        || (combined.length > 0 && status === 'asked');
      if (!retained) continue;
      for (const obligationId of root.affected_obligation_ids) {
        const bucket = retainedRootsByObligation.get(obligationId) ?? [];
        arrayPush(bucket, root);
        retainedRootsByObligation.set(obligationId, bucket);
      }
    }
    for (const item of blocked) {
      const point = pointById.get(item.obligation_id);
      if (point?.classification !== 'blocked') arrayPush(
        diagnostics,
        diagnostic(
          'traceability', 'BLOCKED_DESCRIPTOR_SET_MISMATCH', '/blocked_obligations',
          'every current root descriptor must identify a Blocked formal Test Point'
        )
      );
      else if (point.blocked_reason !== item.reason) arrayPush(
        diagnostics,
        diagnostic(
          'traceability', 'BLOCKED_REASON_DESCRIPTOR_MISMATCH',
          `/blocked_obligations/${pointerPart(item.obligation_id)}/reason`,
          'each current blocker descriptor reason must exactly equal its formal Test Point blocked reason'
        )
      );
    }
    for (const point of semantics.formal_test_points) if (point.classification === 'blocked' && !descriptorIds.has(point.obligation_id)) {
      const retainedSuppression = (retainedRootsByObligation.get(point.obligation_id)?.length ?? 0) > 0;
      if (!retainedSuppression) arrayPush(diagnostics, diagnostic(
        'traceability', 'BLOCKED_DESCRIPTOR_SET_MISMATCH', '/blocked_obligations',
        'every current Blocked formal Test Point must have a current or retained suppressed root descriptor'
      ));
    }
    if (combined.length === 0 && sourceRevision === prior.source_revision && prior.semantic_snapshot !== null) {
      const currentSnapshots = arrayFilter(replayLedger, (root) => root.current);
      const priorCurrentSnapshots = arrayFilter(prior.root_snapshot_ledger, (root) => root.current);
      if (canonicalStringify(currentSnapshots) !== canonicalStringify(priorCurrentSnapshots)) arrayPush(
        diagnostics,
        diagnostic(
          'traceability', 'IMMUTABLE_ROOT_SNAPSHOT_MISMATCH', '/blocked_obligations',
          'one immutable revision must replay the exact same canonical root snapshot'
        )
      );
      const replayBlockedObligationIds = new Set();
      for (const root of prior.root_snapshot_ledger) if (replayGateRootIds.has(root.root_issue_id)) {
        for (const obligationId of root.affected_obligation_ids) replayBlockedObligationIds.add(obligationId);
      }
      for (const obligationId of replayBlockedObligationIds) if (!pointById.has(obligationId)) arrayPush(
        diagnostics,
        diagnostic(
          'traceability', 'GATED_FORMAL_TEST_POINT_MISSING',
          `/semantic_snapshot/formal_test_points/${pointerPart(obligationId)}`,
          'every gated root must retain each affected formal Test Point in the current ledger'
        )
      );
      const replaySemantics = replayBlockedObligationIds.size > 0
        ? projectBlockedSemantics(semantics, prior.semantic_snapshot, replayBlockedObligationIds, diagnostics)
        : semantics;
      if (canonicalStringify(replaySemantics) !== canonicalStringify(prior.semantic_snapshot)) arrayPush(
        diagnostics,
        diagnostic(
          'traceability', 'IMMUTABLE_SEMANTIC_SNAPSHOT_MISMATCH', '/semantic_snapshot',
          'one immutable revision must replay the exact same six-section semantic snapshot'
        )
      );
    }
    if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics, sourceRevision);

    const dispositions = new Map(arrayMap(prior.root_issue_dispositions, (item) => [item.root_issue_id, item.status]));
    for (const root of roots) if (!dispositions.has(root.root_issue_id)) dispositions.set(root.root_issue_id, 'open');
    const currentRootIds = new Set(arrayMap(roots, (root) => root.root_issue_id));
    const currentRootById = new Map(arrayMap(roots, (root) => [root.root_issue_id, root]));
    const priorRootById = new Map(arrayMap(prior.root_snapshot_ledger, (root) => [root.root_issue_id, root]));
    const priorAffectedByRootId = new Map(arrayMap(
      prior.root_snapshot_ledger,
      (root) => [root.root_issue_id, new Set(root.affected_obligation_ids)]
    ));
    /** @type {Map<string, any[]>} */
    const currentRootsByObligation = new Map();
    for (const root of roots) for (const obligationId of root.affected_obligation_ids) {
      const bucket = currentRootsByObligation.get(obligationId) ?? [];
      arrayPush(bucket, root);
      currentRootsByObligation.set(obligationId, bucket);
    }
    const priorPoints = new Map(arrayMap(
      prior.semantic_snapshot?.formal_test_points ?? [], (point) => [point.obligation_id, point]
    ));
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
        for (const rootId of decisionRecord.root_issue_ids) {
          const priorRoot = priorRootById.get(rootId);
          const priorAffected = priorAffectedByRootId.get(rootId);
          let ownGain = false;
          if (canProvideEvidence && priorRoot && priorAffected && !currentRootIds.has(rootId)) {
            for (const obligationId of decisionRecord.affected_obligation_ids) {
              if (!priorAffected.has(obligationId)) continue;
              const priorPoint = priorPoints.get(obligationId);
              const currentPoint = pointById.get(obligationId);
              const tupleChanged = priorPoint?.classification === 'blocked' && currentPoint
                && formalTuple(priorPoint) !== formalTuple(currentPoint);
              const replacement = priorPoint?.classification === 'blocked'
                && arraySome(currentRootsByObligation.get(obligationId) ?? [], (currentRoot) => (
                  currentRoot.root_issue_id !== rootId && currentRoot.root_issue_key !== priorRoot.root_issue_key
                ));
              if (tupleChanged || replacement) ownGain = true;
            }
          }
          const effective = canProvideEvidence && ownGain;
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
    const gateRootIds = new Set();
    for (const [rootId, status] of dispositions) if (isRetainedGateStatus(status)) gateRootIds.add(rootId);
    if (requestDelivery) {
      for (const rootId of prior.last_pending_root_issue_ids) {
        dispositions.set(rootId, 'suppressed_deferred');
        gateRootIds.add(rootId);
      }
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (root.answerable && (status === 'open' || status === 'asked'
          || decidedKinds.has(root.root_issue_id))) {
          dispositions.set(root.root_issue_id, 'suppressed_deferred');
          gateRootIds.add(root.root_issue_id);
        }
      }
      stop = { reason: 'user_requested_delivery', source_revision: sourceRevision };
    } else if (batch.decision_records.length > 0 && !hasReopen && !hasEffectiveDecision) {
      for (const rootId of prior.last_pending_root_issue_ids) gateRootIds.add(rootId);
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (root.answerable && (status === 'open' || status === 'asked')) {
          dispositions.set(root.root_issue_id, 'suppressed_deferred');
          gateRootIds.add(root.root_issue_id);
        }
      }
      stop = { reason: 'no_information_gain', source_revision: sourceRevision };
    } else if (interactionPolicy === 'record_only') {
      for (const root of roots) {
        const status = dispositions.get(root.root_issue_id);
        if (status === 'open' || status === 'asked') {
          dispositions.set(root.root_issue_id, 'suppressed_deferred');
          gateRootIds.add(root.root_issue_id);
        }
      }
    } else if (interactionPolicy === 'pause_for_clarification') {
      const idempotentPending = combined.length === 0 && sourceRevision === prior.source_revision
        ? new Set(prior.last_pending_root_issue_ids) : null;
      pendingRoots = arrayFilter(roots, (root) => root.answerable && (
        dispositions.get(root.root_issue_id) === 'open'
        || (idempotentPending?.has(root.root_issue_id) && dispositions.get(root.root_issue_id) === 'asked')
      ));
      arraySort(pendingRoots, riskOrder);
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
    const pendingIds = arraySort(arrayMap(pendingOutput, (root) => root.root_issue_id), compareCodePoints);
    const askedIds = new Set(prior.asked_root_issue_ids);
    for (const rootId of pendingIds) askedIds.add(rootId);
    const blockedObligationIds = new Set();
    for (const rootId of gateRootIds) {
      const priorRoot = priorRootById.get(rootId);
      const currentRoot = currentRootById.get(rootId);
      for (const obligationId of priorRoot?.affected_obligation_ids ?? []) blockedObligationIds.add(obligationId);
      for (const obligationId of currentRoot?.affected_obligation_ids ?? []) blockedObligationIds.add(obligationId);
    }
    for (const obligationId of blockedObligationIds) if (!pointById.has(obligationId)) arrayPush(
      diagnostics,
      diagnostic(
        'traceability', 'GATED_FORMAL_TEST_POINT_MISSING',
        `/semantic_snapshot/formal_test_points/${pointerPart(obligationId)}`,
        'every gated root must retain each affected formal Test Point in the current ledger'
      )
    );
    const deliveredSemantics = blockedObligationIds.size > 0
      ? projectBlockedSemantics(semantics, prior.semantic_snapshot, blockedObligationIds, diagnostics)
      : structuredClone(semantics);
    const nextEventSeq = combined.length > 0 ? combined[combined.length - 1].seq : prior.clarification_event_seq;
    const dispositionOutput = arrayMap([...dispositions], ([root_issue_id, status]) => ({ root_issue_id, status }));
    arraySort(dispositionOutput, (left, right) => compareCodePoints(left.root_issue_id, right.root_issue_id));
    const nextLedger = nextRootLedger(prior.root_snapshot_ledger, roots, diagnostics);
    validateRootPartition(nextLedger, dispositions, deliveredSemantics, diagnostics, '/state');
    if (diagnostics.length > 0) return invalidDecision(interactionPolicy, diagnostics, sourceRevision);
    const state = {
      source_revision: sourceRevision,
      clarification_event_seq: nextEventSeq,
      asked_root_issue_ids: arraySort([...askedIds], compareCodePoints),
      root_issue_dispositions: dispositionOutput,
      last_pending_root_issue_ids: pendingIds,
      last_question_set_digest: pendingIds.length > 0 ? digest(pendingIds) : '',
      clarification_stop: interactionPolicy === 'record_only' ? null : stop,
      semantic_snapshot: structuredClone(deliveredSemantics),
      root_snapshot_ledger: structuredClone(nextLedger)
    };
    return {
      action, source_revision: sourceRevision,
      root_issues: structuredClone(roots), pending_root_issues: pendingOutput,
      state, semantic_snapshot: structuredClone(deliveredSemantics),
      interaction: { policy: interactionPolicy, paused: action === 'need_user_answers' },
      diagnostics: []
    };
  } catch {
    return invalidDecision(interactionPolicy, [diagnostic(
      'classification', 'CLARIFICATION_INPUT_UNREADABLE', '/', 'clarification input could not be evaluated from its trusted snapshot'
    )]);
  }
}
