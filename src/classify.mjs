import { canonicalStringify, stableId } from './canonical.mjs';
import { scopeContains } from './decision-record.mjs';
import { E2_TARGETS } from './evidence.mjs';

/** @typedef {{category: string, code: string, path: string, message: string}} Diagnostic */
/** @typedef {{obligation_id: string, root_issue_id: string, reason: string, risk: string, evidence_refs: string[]}} BlockedCase */
/**
 * Task 8 is an internal pure seam, not a persisted artifact. Its closed result
 * keeps frozen Case/NotApplicable/Exploratory objects and adds only the
 * downstream blocker shape needed by Task 9:
 * `{obligation_id, root_issue_id, reason, risk, evidence_refs}`.
 * @typedef {{grounded: Record<string, unknown>[], conditional: Record<string, unknown>[], blocked: BlockedCase[], not_applicable: Record<string, unknown>[], exploratory: Record<string, unknown>[], diagnostics: Diagnostic[]}} ClassificationResult
 */

const DIAGNOSTIC_LIMIT = 256;
const RISKS = new Set(['critical', 'high', 'medium', 'low']);
const CAPABILITY_STATUSES = new Set(['provided', 'verified', 'approved-assumption', 'unavailable', 'unknown']);
const GROUNDED_CAPABILITIES = new Set(['provided', 'verified']);
const COMPARISONS = new Set(['equals', 'contains', 'matches', 'within']);
const ORACLE_FIELDS = Object.freeze({
  value: 'expected_value', state: 'expected_state', event: 'expected_event', 'side-effect': 'expected_side_effect'
});
const NATIVE_MAP_ENTRIES = Map.prototype.entries;
const NATIVE_MAP_SET = Map.prototype.set;
const NATIVE_MAP_ITERATOR_NEXT = Object.getPrototypeOf(NATIVE_MAP_ENTRIES.call(new Map())).next;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;
const NATIVE_REFLECT_OWN_KEYS = Reflect.ownKeys;
const KEYS = Object.freeze({
  context: ['sourceRevision', 'evidence', 'obligations', 'caseDrafts'],
  evidence: ['claimsById', 'factLedger', 'conflicts'],
  obligationsArtifact: ['schema_version', 'source_revision', 'obligations', 'fact_routes', 'interaction_routes'],
  caseDraftsArtifact: ['schema_version', 'source_revision', 'cases', 'obligation_dispositions', 'exploratory_candidates'],
  obligation: ['obligation_id', 'kind', 'risk', 'scope', 'source_claim_ids', 'view_element_refs', 'required_oracle_refs', 'required_capabilities'],
  fact: ['fact_id', 'claim_id', 'status', 'source_claim_ids'],
  conflict: ['conflict_id', 'root_issue_id', 'scope', 'rule_ids', 'source_ids'],
  caseDraft: ['case_id', 'title', 'scope', 'risk', 'role', 'fact_ids', 'obligation_ids', 'source_claim_ids', 'preconditions', 'data', 'steps', 'testability_profile', 'post_state', 'cleanup', 'evidence_refs', 'temporary_assumption', 'execution_signature'],
  role: ['value', 'evidence_ref', 'support_review'],
  precondition: ['condition', 'reachable_from', 'source_claim_ids', 'evidence_ref', 'support_review'],
  data: ['name', 'value', 'provenance', 'support_review'],
  provenance: ['type', 'ref'],
  step: ['step_id', 'action', 'action_evidence_ref', 'support_review', 'expectations'],
  expectation: ['expectation_id', 'business_assertion', 'preceding_action_id', 'observer', 'observation_surface', 'observation_target', 'oracle', 'evidence_ref', 'support_review'],
  oracle: ['type', 'expected_value', 'expected_state', 'expected_event', 'expected_side_effect', 'comparison', 'tolerance', 'window'],
  profile: ['capabilities', 'observers', 'controls'],
  capability: ['capability', 'status', 'provenance_ref'],
  observer: ['observer', 'observation_target', 'status', 'provenance_ref'],
  control: ['control', 'status', 'provenance_ref'],
  postState: ['state', 'evidence_ref', 'support_review'],
  cleanup: ['required', 'steps', 'evidence_ref', 'no_cleanup_reason', 'no_cleanup_evidence_ref', 'support_review'],
  temporaryAssumption: ['claim_id', 'invalidation_condition'],
  execution: ['role', 'precondition_state', 'data_partition', 'action_path', 'oracle_refs', 'test_point_ids'],
  exploratory: ['exploratory_id', 'title', 'scope', 'risk', 'source_claim_ids']
});

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

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !NATIVE_ARRAY_IS_ARRAY(value) && !(value instanceof Map);
}

/** @param {unknown} value @returns {value is string} */
function isNonblank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** @param {unknown} value @returns {value is string} */
function isCanonicalString(value) {
  return isNonblank(value) && value === value.trim();
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
  for (const item of diagnostics) {
    unique.set(`${item.category}\0${item.code}\0${item.path}\0${item.message}`, item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT) {
    const truncated = diagnostic(
      'classification', 'DIAGNOSTICS_TRUNCATED', '/',
      `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
    );
    unique.set(`${truncated.category}\0${truncated.code}\0${truncated.path}\0${truncated.message}`, truncated);
  }
  return [...unique.values()].sort((left, right) => compareCodePoints(
    `${left.category}\0${left.code}\0${left.path}\0${left.message}`,
    `${right.category}\0${right.code}\0${right.path}\0${right.message}`
  )).slice(0, DIAGNOSTIC_LIMIT);
}

/** @param {Diagnostic[]} diagnostics @returns {ClassificationResult} */
function resultWithDiagnostics(diagnostics) {
  return {
    grounded: [], conditional: [], blocked: [], not_applicable: [], exploratory: [],
    diagnostics: finalizeDiagnostics(diagnostics)
  };
}

/**
 * Build one trusted deep snapshot exclusively from captured own descriptors and
 * native Map entries. Classification never reads the submitted graph again.
 * @param {unknown} root
 */
function snapshotControlled(root) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  let diagnosticsTruncated = false;
  /** @param {Diagnostic} item */
  const addSnapshotDiagnostic = (item) => {
    if (diagnostics.length < DIAGNOSTIC_LIMIT - 1) diagnostics.push(item);
    else diagnosticsTruncated = true;
  };
  /** @type {unknown} */
  let snapshot;
  /** @type {Array<{source: unknown, path: string, assign: (value: unknown) => void}>} */
  const pending = [{ source: root, path: '', assign(value) { snapshot = value; } }];
  const seen = new Map();
  while (pending.length > 0) {
    const { source, path, assign } = /** @type {{source: unknown, path: string, assign: (value: unknown) => void}} */ (pending.pop());
    if (!source || typeof source !== 'object') {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      assign(seen.get(source));
      continue;
    }
    if (source instanceof Map) {
      if (NATIVE_GET_PROTOTYPE_OF(source) !== Map.prototype) {
        addSnapshotDiagnostic(diagnostic(
          'schema', 'RECORD_PROTOTYPE_INVALID', path || '/', 'accepted evidence Map must use the built-in Map prototype'
        ));
        assign(null);
        continue;
      }
      if (NATIVE_REFLECT_OWN_KEYS(source).length > 0) {
        addSnapshotDiagnostic(diagnostic(
          'schema', 'MAP_OWN_PROPERTY_INVALID', path || '/', 'accepted evidence Map cannot have own string or symbol properties'
        ));
        assign(null);
        continue;
      }
      let entries;
      try {
        entries = NATIVE_MAP_ENTRIES.call(source);
      } catch {
        addSnapshotDiagnostic(diagnostic(
          'schema', 'MAP_BRAND_INVALID', path || '/', 'accepted evidence Map must have genuine native Map internal slots'
        ));
        assign(null);
        continue;
      }
      /** @type {Array<[unknown, unknown]>} */
      const capturedEntries = [];
      while (true) {
        const next = NATIVE_MAP_ITERATOR_NEXT.call(entries);
        if (next.done) break;
        capturedEntries.push(next.value);
      }
      const target = new Map();
      seen.set(source, target);
      assign(target);
      const validEntries = capturedEntries.filter(([key]) => typeof key === 'string')
        .sort(([left], [right]) => compareCodePoints(String(left), String(right)));
      if (validEntries.length !== capturedEntries.length) addSnapshotDiagnostic(diagnostic(
        'schema', 'CANONICAL_STRING_INVALID', `${path}/invalid-map-key`, 'accepted evidence Map keys must be strings'
      ));
      for (let index = validEntries.length - 1; index >= 0; index -= 1) {
        const [key, child] = validEntries[index];
        pending.push({
          source: child,
          path: `${path}/${pointerPart(String(key))}`,
          assign(value) { NATIVE_MAP_SET.call(target, String(key), value); }
        });
      }
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY(source)) {
      if (NATIVE_GET_PROTOTYPE_OF(source) !== Array.prototype) {
        addSnapshotDiagnostic(diagnostic(
          'schema', 'RECORD_PROTOTYPE_INVALID', path || '/', 'controlled arrays must use the built-in Array prototype'
        ));
        assign(null);
        continue;
      }
      const descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS(source);
      const lengthDescriptor = /** @type {PropertyDescriptor | undefined} */ (descriptors['length']);
      const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, 'value')
        && Number.isSafeInteger(lengthDescriptor.value) ? Number(lengthDescriptor.value) : 0;
      let validOwnKeys = true;
      const ownKeys = NATIVE_REFLECT_OWN_KEYS(descriptors);
      let hasSymbol = false;
      for (const key of ownKeys) if (typeof key === 'symbol') hasSymbol = true;
      if (hasSymbol) {
        validOwnKeys = false;
        addSnapshotDiagnostic(diagnostic(
          'schema', 'ARRAY_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled arrays cannot contain own symbol properties'
        ));
      }
      const stringKeys = ownKeys.filter((key) => typeof key === 'string').sort(compareCodePoints);
      for (const key of stringKeys) {
        if (key === 'length') continue;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
          validOwnKeys = false;
          addSnapshotDiagnostic(diagnostic('schema', 'UNKNOWN_KEY', `${path}/${pointerPart(key)}`, 'controlled arrays cannot contain named properties'));
        }
      }
      if (!validOwnKeys) {
        assign(null);
        continue;
      }
      const target = new Array(length);
      seen.set(source, target);
      assign(target);
      /** @type {Array<{source: unknown, path: string, assign: (value: unknown) => void}>} */
      const children = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) {
          addSnapshotDiagnostic(diagnostic('schema', 'ARRAY_HOLE', `${path}/${index}`, 'controlled arrays must be dense'));
        } else if (!Object.hasOwn(descriptor, 'value')) {
          addSnapshotDiagnostic(diagnostic('schema', 'ACCESSOR_NOT_ALLOWED', `${path}/${index}`, 'controlled values must be own data properties'));
        } else {
          children.push({
            source: descriptor.value,
            path: `${path}/${index}`,
            assign(value) { target[index] = value; }
          });
        }
      }
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
      continue;
    }
    const prototype = NATIVE_GET_PROTOTYPE_OF(source);
    if (prototype !== Object.prototype && prototype !== null) {
      addSnapshotDiagnostic(diagnostic(
        'schema', 'RECORD_PROTOTYPE_INVALID', path || '/', 'controlled records must use a plain or null prototype'
      ));
      assign(null);
      continue;
    }
    const descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS(source);
    const target = prototype === null ? Object.create(null) : {};
    seen.set(source, target);
    assign(target);
    const ownKeys = NATIVE_REFLECT_OWN_KEYS(descriptors);
    let hasSymbol = false;
    for (const key of ownKeys) if (typeof key === 'symbol') hasSymbol = true;
    if (hasSymbol) addSnapshotDiagnostic(diagnostic(
      'schema', 'RECORD_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled records cannot contain own symbol properties'
    ));
    const stringKeys = ownKeys.filter((key) => typeof key === 'string').sort(compareCodePoints);
    /** @type {Array<{source: unknown, path: string, assign: (value: unknown) => void}>} */
    const children = [];
    for (const key of stringKeys) {
      const descriptor = descriptors[key];
      const childPath = `${path}/${pointerPart(key)}`;
      if (!Object.hasOwn(descriptor, 'value')) addSnapshotDiagnostic(diagnostic(
        'schema', 'ACCESSOR_NOT_ALLOWED', childPath, 'controlled values must be own data properties'
      ));
      else children.push({
        source: descriptor.value,
        path: childPath,
        assign(value) {
          NATIVE_DEFINE_PROPERTY(target, key, { value, enumerable: true, writable: true, configurable: true });
        }
      });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  if (diagnosticsTruncated) diagnostics.push(diagnostic(
    'classification', 'DIAGNOSTICS_TRUNCATED', '/',
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return { snapshot, diagnostics };
}

/** @param {unknown} value @param {readonly string[]} allowed @param {string} path @param {Diagnostic[]} diagnostics */
function checkKeys(value, allowed, path, diagnostics) {
  if (!isRecord(value)) return;
  const permitted = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!permitted.has(key)) diagnostics.push(diagnostic(
      'schema', 'UNKNOWN_KEY', `${path}/${pointerPart(key)}`, 'unknown controlled field is not allowed'
    ));
  }
}

/** @param {unknown} value @param {boolean} [nonempty] */
function stringArray(value, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) return null;
  /** @type {string[]} */
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isCanonicalString(item) || seen.has(item)) return null;
    seen.add(item);
    output.push(item);
  }
  return output;
}

/** @param {unknown} value */
function objectArray(value) {
  return Array.isArray(value) && value.every(isRecord) ? /** @type {Record<string, unknown>[]} */ (value) : null;
}

/** @param {unknown} value */
function normalizeSemanticString(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

/** @param {Record<string, unknown>[]} entries */
function canonicalSetProjection(entries) {
  const byCanonicalValue = new Map();
  for (const entry of entries) byCanonicalValue.set(canonicalStringify(entry), entry);
  return canonicalStringify([...byCanonicalValue]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([, entry]) => entry));
}

/** @param {Record<string, unknown>} draft */
function derivePreconditionState(draft) {
  return canonicalSetProjection((objectArray(draft.preconditions) ?? []).map((item) => ({
    condition: normalizeSemanticString(item.condition),
    reachable_from: normalizeSemanticString(item.reachable_from)
  })));
}

/** @param {Record<string, unknown>} draft */
function deriveDataPartition(draft) {
  return canonicalSetProjection((objectArray(draft.data) ?? []).map((item) => ({
    name: normalizeSemanticString(item.name),
    value: normalizeSemanticString(item.value)
  })));
}

/**
 * Build the exact, NUL-safe execution signature. Oracle references are a set;
 * the action path is an ordered sequence and is deliberately never sorted.
 * @param {unknown} caseDraft
 */
export function executionSignature(caseDraft) {
  try {
    const trusted = snapshotControlled(caseDraft);
    const draft = trusted.diagnostics.length === 0 && isRecord(trusted.snapshot) ? trusted.snapshot : {};
    const role = isRecord(draft.role) ? normalizeSemanticString(draft.role.value) : '';
    const steps = objectArray(draft.steps) ?? [];
    const actionPath = steps.map((step) => normalizeSemanticString(step.action));
    const oracleRefs = [...new Set(steps.flatMap((step) =>
      (objectArray(step.expectations) ?? []).map((expectation) => normalizeSemanticString(expectation.expectation_id))
    ))].sort(compareCodePoints);
    return canonicalStringify({
      role,
      precondition_state: derivePreconditionState(draft),
      data_partition: deriveDataPartition(draft),
      action_path: actionPath,
      oracle_refs: oracleRefs
    });
  } catch {
    return canonicalStringify({ role: '', precondition_state: '', data_partition: '', action_path: [], oracle_refs: [] });
  }
}

/** @param {string} left @param {string} right */
function scopesIntersect(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics */
function checkCanonical(value, path, diagnostics) {
  if (!isCanonicalString(value)) diagnostics.push(diagnostic(
    'schema', 'CANONICAL_STRING_INVALID', path, 'identifier, reference, scope, or capability must be nonblank and unpadded'
  ));
}

/**
 * Validate closed controlled keys and canonical identity-like strings. Semantic
 * omissions that must become Blocked are intentionally left to the gate.
 * @param {Record<string, unknown>} context
 * @param {Diagnostic[]} diagnostics
 */
function validateClosedShape(context, diagnostics) {
  checkKeys(context, KEYS.context, '', diagnostics);
  const evidence = isRecord(context.evidence) ? context.evidence : null;
  const obligations = isRecord(context.obligations) ? context.obligations : null;
  const drafts = isRecord(context.caseDrafts) ? context.caseDrafts : null;
  if (!Number.isInteger(context.sourceRevision) || !evidence || !obligations || !drafts) {
    diagnostics.push(diagnostic('classification', 'CONTEXT_INVALID', '/', 'classification context requires sourceRevision, evidence, obligations, and caseDrafts'));
    return;
  }
  checkKeys(evidence, KEYS.evidence, '/evidence', diagnostics);
  checkKeys(obligations, KEYS.obligationsArtifact, '/obligations', diagnostics);
  checkKeys(drafts, KEYS.caseDraftsArtifact, '/caseDrafts', diagnostics);
  if (!(evidence.claimsById instanceof Map) || !Array.isArray(evidence.factLedger) || !Array.isArray(evidence.conflicts)
    || !Array.isArray(obligations.obligations) || !Array.isArray(obligations.fact_routes) || !Array.isArray(obligations.interaction_routes)
    || !Array.isArray(drafts.cases) || !Array.isArray(drafts.obligation_dispositions) || !Array.isArray(drafts.exploratory_candidates)) {
    diagnostics.push(diagnostic('classification', 'CONTEXT_INVALID', '/', 'classification context collections have invalid types'));
    return;
  }
  if (obligations.schema_version !== '1.0.0' || drafts.schema_version !== '1.0.0'
    || obligations.source_revision !== context.sourceRevision || drafts.source_revision !== context.sourceRevision) {
    diagnostics.push(diagnostic('classification', 'SOURCE_REVISION_MISMATCH', '/', 'all classification inputs must share source_revision'));
  }

  for (const [claimId, claim] of NATIVE_MAP_ENTRIES.call(evidence.claimsById)) {
    checkCanonical(claimId, `/evidence/claimsById/${pointerPart(String(claimId))}`, diagnostics);
    if (!isRecord(claim)) continue;
    const form = claim.claim_form;
    const allowed = form === 'derived'
      ? ['claim_id', 'claim_form', 'level', 'kind', 'scope', 'value', 'source_locator_ids', 'derivation_kind', 'derivation_target', 'parent_claim_ids', 'parameters', 'rule_input']
      : form === 'decision-record'
        ? ['claim_id', 'claim_form', 'level', 'kind', 'scope', 'value', 'source_locator_ids', 'decision_id', 'authority']
        : ['claim_id', 'claim_form', 'level', 'kind', 'scope', 'value', 'source_locator_ids', 'source_id'];
    checkKeys(claim, allowed, `/evidence/claimsById/${pointerPart(String(claimId))}`, diagnostics);
    checkCanonical(claim.claim_id, `/evidence/claimsById/${pointerPart(String(claimId))}/claim_id`, diagnostics);
    checkCanonical(claim.scope, `/evidence/claimsById/${pointerPart(String(claimId))}/scope`, diagnostics);
  }
  evidence.factLedger.forEach((fact, index) => {
    checkKeys(fact, KEYS.fact, `/evidence/factLedger/${index}`, diagnostics);
    if (isRecord(fact)) {
      checkCanonical(fact.fact_id, `/evidence/factLedger/${index}/fact_id`, diagnostics);
      checkCanonical(fact.claim_id, `/evidence/factLedger/${index}/claim_id`, diagnostics);
    }
  });
  evidence.conflicts.forEach((conflict, index) => {
    checkKeys(conflict, KEYS.conflict, `/evidence/conflicts/${index}`, diagnostics);
    if (isRecord(conflict)) checkCanonical(conflict.scope, `/evidence/conflicts/${index}/scope`, diagnostics);
  });
  obligations.obligations.forEach((obligation, index) => {
    checkKeys(obligation, KEYS.obligation, `/obligations/obligations/${index}`, diagnostics);
    if (!isRecord(obligation)) return;
    for (const [field, value] of [['obligation_id', obligation.obligation_id], ['scope', obligation.scope]]) {
      checkCanonical(value, `/obligations/obligations/${index}/${field}`, diagnostics);
    }
    const capabilities = Array.isArray(obligation.required_capabilities) ? obligation.required_capabilities : [];
    capabilities.forEach((item, itemIndex) => checkCanonical(item, `/obligations/obligations/${index}/required_capabilities/${itemIndex}`, diagnostics));
  });
  obligations.fact_routes.forEach((route, index) => {
    if (!isRecord(route)) return;
    const allowed = route.route_type === 'obligations' ? ['fact_id', 'route_type', 'obligation_ids']
      : route.route_type === 'blocked' ? ['fact_id', 'route_type', 'blocker_root_issue_id']
        : ['fact_id', 'route_type', 'not_applicable_claim_id'];
    checkKeys(route, allowed, `/obligations/fact_routes/${index}`, diagnostics);
  });
  obligations.interaction_routes.forEach((route, index) => {
    if (!isRecord(route)) return;
    const allowed = route.route_type === 'formal-view' ? ['candidate_id', 'route_type', 'formal_view_id']
      : route.route_type === 'blocked' ? ['candidate_id', 'route_type', 'blocker_root_issue_id']
        : ['candidate_id', 'route_type', 'exploratory_id'];
    checkKeys(route, allowed, `/obligations/interaction_routes/${index}`, diagnostics);
  });

  drafts.cases.forEach((draft, caseIndex) => {
    const base = `/caseDrafts/cases/${caseIndex}`;
    checkKeys(draft, KEYS.caseDraft, base, diagnostics);
    if (!isRecord(draft)) return;
    for (const [field, value] of [['case_id', draft.case_id], ['scope', draft.scope]]) checkCanonical(value, `${base}/${field}`, diagnostics);
    if (isRecord(draft.role)) checkKeys(draft.role, KEYS.role, `${base}/role`, diagnostics);
    objectArray(draft.preconditions)?.forEach((item, index) => checkKeys(item, KEYS.precondition, `${base}/preconditions/${index}`, diagnostics));
    objectArray(draft.data)?.forEach((item, index) => {
      checkKeys(item, KEYS.data, `${base}/data/${index}`, diagnostics);
      if (isRecord(item.provenance)) checkKeys(item.provenance, KEYS.provenance, `${base}/data/${index}/provenance`, diagnostics);
    });
    objectArray(draft.steps)?.forEach((step, stepIndex) => {
      checkKeys(step, KEYS.step, `${base}/steps/${stepIndex}`, diagnostics);
      objectArray(step.expectations)?.forEach((expectation, expectationIndex) => {
        checkKeys(expectation, KEYS.expectation, `${base}/steps/${stepIndex}/expectations/${expectationIndex}`, diagnostics);
        if (isRecord(expectation.oracle)) checkKeys(expectation.oracle, KEYS.oracle, `${base}/steps/${stepIndex}/expectations/${expectationIndex}/oracle`, diagnostics);
      });
    });
    if (isRecord(draft.testability_profile)) {
      checkKeys(draft.testability_profile, KEYS.profile, `${base}/testability_profile`, diagnostics);
      objectArray(draft.testability_profile.capabilities)?.forEach((item, index) => {
        checkKeys(item, KEYS.capability, `${base}/testability_profile/capabilities/${index}`, diagnostics);
        checkCanonical(item.capability, `${base}/testability_profile/capabilities/${index}/capability`, diagnostics);
      });
      objectArray(draft.testability_profile.observers)?.forEach((item, index) => checkKeys(item, KEYS.observer, `${base}/testability_profile/observers/${index}`, diagnostics));
      objectArray(draft.testability_profile.controls)?.forEach((item, index) => checkKeys(item, KEYS.control, `${base}/testability_profile/controls/${index}`, diagnostics));
    }
    if (isRecord(draft.post_state)) checkKeys(draft.post_state, KEYS.postState, `${base}/post_state`, diagnostics);
    if (isRecord(draft.cleanup)) checkKeys(draft.cleanup, KEYS.cleanup, `${base}/cleanup`, diagnostics);
    if (isRecord(draft.temporary_assumption)) checkKeys(draft.temporary_assumption, KEYS.temporaryAssumption, `${base}/temporary_assumption`, diagnostics);
    if (isRecord(draft.execution_signature)) checkKeys(draft.execution_signature, KEYS.execution, `${base}/execution_signature`, diagnostics);
  });
  drafts.obligation_dispositions.forEach((disposition, index) => {
    if (!isRecord(disposition)) return;
    const allowed = disposition.status === 'case_candidate' ? ['obligation_id', 'status', 'case_ids']
      : disposition.status === 'blocker' ? ['obligation_id', 'status', 'blocker_root_issue_id', 'evidence_refs']
        : disposition.status === 'not_applicable' ? ['obligation_id', 'status', 'exclusion_claim_id', 'scope', 'support_review']
          : ['obligation_id', 'status', 'case_ids', 'blocker_root_issue_id', 'evidence_refs', 'exclusion_claim_id', 'scope', 'support_review'];
    checkKeys(disposition, allowed, `/caseDrafts/obligation_dispositions/${index}`, diagnostics);
  });
  drafts.exploratory_candidates.forEach((candidate, index) => checkKeys(candidate, KEYS.exploratory, `/caseDrafts/exploratory_candidates/${index}`, diagnostics));
}

/** @typedef {{claim: Record<string, unknown>, rank: number, reasons: string[], parents: string[], children: string[]}} ClaimAssessment */

/**
 * Snapshot and index accepted evidence once. Kahn processing marks cycles and
 * invalid E2 ancestry iteratively, so deep chains never use the call stack.
 * @param {Map<unknown, unknown>} submitted
 * @param {Diagnostic[]} diagnostics
 */
function buildEvidenceIndex(submitted, diagnostics) {
  /** @type {Map<string, ClaimAssessment>} */
  const assessments = new Map();
  /** @type {Map<string, string[]>} */
  const children = new Map();
  /** @type {Map<string, number>} */
  const indegree = new Map();
  for (const [mapKey, value] of NATIVE_MAP_ENTRIES.call(submitted)) {
    if (typeof mapKey !== 'string' || !isRecord(value) || value.claim_id !== mapKey) {
      diagnostics.push(diagnostic('reference', 'EVIDENCE_MAP_IDENTITY_INVALID', `/evidence/claimsById/${pointerPart(String(mapKey))}`, 'accepted evidence Map key must equal an own claim_id'));
      continue;
    }
    const parents = value.level === 'E2' ? stringArray(value.parent_claim_ids, true) ?? [] : [];
    const reasons = [];
    let rank = value.level === 'E1' ? 1 : value.level === 'E2' || value.level === 'E3' ? 2 : 0;
    if (rank === 0) reasons.push('EVIDENCE_LEVEL_INVALID');
    if (value.level === 'E2') {
      const kind = typeof value.derivation_kind === 'string' ? value.derivation_kind : '';
      const target = typeof value.derivation_target === 'string' ? value.derivation_target : '';
      const allowed = E2_TARGETS[/** @type {keyof typeof E2_TARGETS} */ (kind)];
      if (!allowed || !allowed.includes(target) || value.kind !== target || parents.length === 0) {
        reasons.push('E2_KIND_TARGET_INVALID');
        rank = 0;
      }
    }
    assessments.set(mapKey, { claim: structuredClone(value), rank, reasons, parents, children: [] });
    indegree.set(mapKey, parents.length);
    for (const parent of parents) {
      const bucket = children.get(parent);
      if (bucket) bucket.push(mapKey);
      else children.set(parent, [mapKey]);
    }
  }
  for (const [parentId, childIds] of children) {
    const assessment = assessments.get(parentId);
    if (assessment) assessment.children = [...childIds].sort(compareCodePoints);
  }
  for (const [claimId, assessment] of assessments) {
    if (assessment.claim.level !== 'E2') continue;
    for (const parentId of assessment.parents) {
      const parent = assessments.get(parentId);
      if (!parent) {
        assessment.reasons.push('E2_PARENT_UNKNOWN');
        assessment.rank = 0;
      } else if (parent.claim.level !== 'E3' && parent.claim.level !== 'E2') {
        assessment.reasons.push('E2_PARENT_LEVEL_INVALID');
        assessment.rank = 0;
      }
    }
  }
  const queue = [...indegree].filter(([, count]) => count === 0).map(([id]) => id).sort(compareCodePoints);
  let cursor = 0;
  while (cursor < queue.length) {
    const parentId = queue[cursor++];
    for (const childId of children.get(parentId) ?? []) {
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) queue.push(childId);
    }
  }
  for (const [claimId, remaining] of indegree) {
    if (remaining > 0) {
      const assessment = assessments.get(claimId);
      if (assessment) {
        assessment.rank = 0;
        assessment.reasons.push('E2_CYCLE_OR_UNGROUNDED_CHAIN');
      }
    }
  }
  return assessments;
}

/**
 * @typedef {{rank: number, reasons: Set<string>, refs: Set<string>, sourceIds: Set<string>}} EvidenceResult
 */

/** @param {string[]} roots @param {Map<string, ClaimAssessment>} evidence @param {Map<string, EvidenceResult>} [cache] */
function assessEvidenceRoots(roots, evidence, cache) {
  const cacheKey = canonicalStringify([...new Set(roots)].sort(compareCodePoints));
  const cached = cache?.get(cacheKey);
  if (cached) return cached;
  let rank = 2;
  const reasons = new Set();
  const refs = new Set();
  const sourceIds = new Set();
  const pending = [...roots];
  while (pending.length > 0) {
    const claimId = /** @type {string} */ (pending.pop());
    if (refs.has(claimId)) continue;
    refs.add(claimId);
    const assessment = evidence.get(claimId);
    if (!assessment) {
      rank = 0;
      reasons.add('EVIDENCE_REFERENCE_UNKNOWN');
      continue;
    }
    rank = Math.min(rank, assessment.rank);
    for (const reason of assessment.reasons) reasons.add(reason);
    if (typeof assessment.claim.source_id === 'string') sourceIds.add(assessment.claim.source_id);
    for (const parentId of assessment.parents) pending.push(parentId);
  }
  const result = { rank, reasons, refs, sourceIds };
  cache?.set(cacheKey, result);
  return result;
}

/**
 * Each required Oracle owns one bit. Propagating those bits once from accepted
 * parents to children makes every expectation-to-Oracle ancestry lookup O(1).
 * @param {Map<string, ClaimAssessment>} evidence
 * @param {Record<string, unknown>[]} obligations
 */
function buildOracleReachability(evidence, obligations) {
  const oracleRefs = [...new Set(obligations.flatMap((obligation) =>
    stringArray(obligation.required_oracle_refs) ?? []))].sort(compareCodePoints);
  /** @type {Map<string, bigint>} */
  const bitByOracle = new Map();
  /** @type {Map<string, bigint>} */
  const masksByClaim = new Map();
  for (const [index, oracleRef] of oracleRefs.entries()) {
    const bit = 1n << BigInt(index);
    bitByOracle.set(oracleRef, bit);
    const assessment = evidence.get(oracleRef);
    if (assessment && assessment.rank > 0 && assessment.reasons.length === 0) masksByClaim.set(oracleRef, bit);
  }

  /** @type {Map<string, number>} */
  const indegree = new Map();
  for (const [claimId, assessment] of evidence) {
    indegree.set(claimId, assessment.parents.reduce((count, parentId) =>
      count + (evidence.has(parentId) ? 1 : 0), 0));
  }
  const queue = [...indegree].filter(([, count]) => count === 0)
    .map(([claimId]) => claimId).sort(compareCodePoints);
  let cursor = 0;
  while (cursor < queue.length) {
    const claimId = queue[cursor++];
    const mask = masksByClaim.get(claimId) ?? 0n;
    for (const childId of evidence.get(claimId)?.children ?? []) {
      const child = evidence.get(childId);
      if (mask !== 0n && child && child.rank > 0 && child.reasons.length === 0) {
        masksByClaim.set(childId, (masksByClaim.get(childId) ?? 0n) | mask);
      }
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) queue.push(childId);
    }
  }

  /** @type {Map<string, bigint>} */
  const masksByObligation = new Map();
  for (const obligation of obligations) {
    let mask = 0n;
    for (const oracleRef of stringArray(obligation.required_oracle_refs) ?? []) {
      mask |= bitByOracle.get(oracleRef) ?? 0n;
    }
    if (isCanonicalString(obligation.obligation_id)) masksByObligation.set(String(obligation.obligation_id), mask);
  }
  return { masksByClaim, masksByObligation };
}

/**
 * Deterministic iterative augmenting paths require one independently located
 * expectation per formal obligation. Every edge already means that one
 * expectation covers all required Oracles for the obligation.
 * @param {Record<string, unknown>} draft
 * @param {Record<string, unknown>[]} obligations
 * @param {Array<{expectationId: string, evidenceRef: string}>} expectations
 * @param {{masksByClaim: Map<string, bigint>, masksByObligation: Map<string, bigint>}} reachability
 * @param {Set<string>} reasons
 * @param {Diagnostic[]} diagnostics
 */
function requireOracleOwnership(draft, obligations, expectations, reachability, reasons, diagnostics) {
  if (expectations.length === 0) return;
  const orderedExpectations = [...expectations].sort((left, right) =>
    compareCodePoints(left.expectationId, right.expectationId));
  const orderedObligations = obligations.filter((obligation) =>
    (stringArray(obligation.required_oracle_refs) ?? []).length > 0)
    .sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id)));
  /** @type {number[][]} */
  const edges = [];
  let missingEdge = false;
  for (const obligation of orderedObligations) {
    const obligationId = String(obligation.obligation_id);
    const requiredMask = reachability.masksByObligation.get(obligationId) ?? 0n;
    const candidates = [];
    for (const [expectationIndex, expectation] of orderedExpectations.entries()) {
      const expectationMask = reachability.masksByClaim.get(expectation.evidenceRef) ?? 0n;
      if (requiredMask !== 0n && (expectationMask & requiredMask) === requiredMask) candidates.push(expectationIndex);
    }
    edges.push(candidates);
    if (candidates.length === 0) {
      missingEdge = true;
      diagnostics.push(diagnostic(
        'traceability', 'OBLIGATION_ORACLE_EXPECTATION_UNMAPPED',
        `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/obligations/${pointerPart(obligationId)}/required_oracle_refs`,
        'one concrete expectation must cover every required Oracle for the formal obligation'
      ));
    }
  }
  if (missingEdge) {
    reasons.add('OBLIGATION_ORACLE_EXPECTATION_UNMAPPED');
    return;
  }

  const ownerByExpectation = new Array(orderedExpectations.length).fill(-1);
  const expectationByObligation = new Array(orderedObligations.length).fill(-1);
  for (let start = 0; start < orderedObligations.length; start += 1) {
    const obligationQueue = [start];
    const seenObligations = new Set([start]);
    const seenExpectations = new Set();
    const parentObligationByExpectation = new Map();
    let cursor = 0;
    let freeExpectation = -1;
    while (cursor < obligationQueue.length && freeExpectation < 0) {
      const obligationIndex = obligationQueue[cursor++];
      for (const expectationIndex of edges[obligationIndex]) {
        if (seenExpectations.has(expectationIndex)) continue;
        seenExpectations.add(expectationIndex);
        parentObligationByExpectation.set(expectationIndex, obligationIndex);
        const owner = ownerByExpectation[expectationIndex];
        if (owner < 0) {
          freeExpectation = expectationIndex;
          break;
        }
        if (!seenObligations.has(owner)) {
          seenObligations.add(owner);
          obligationQueue.push(owner);
        }
      }
    }
    if (freeExpectation < 0) {
      diagnostics.push(diagnostic(
        'traceability', 'OBLIGATION_ORACLE_EXPECTATION_OWNERSHIP_CONFLICT',
        `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/obligation_ids`,
        'linked formal obligations require distinct concrete expectations with complete Oracle coverage'
      ));
      reasons.add('OBLIGATION_ORACLE_EXPECTATION_OWNERSHIP_CONFLICT');
      return;
    }
    let expectationIndex = freeExpectation;
    while (expectationIndex >= 0) {
      const obligationIndex = /** @type {number} */ (parentObligationByExpectation.get(expectationIndex));
      const previousExpectation = expectationByObligation[obligationIndex];
      expectationByObligation[obligationIndex] = expectationIndex;
      ownerByExpectation[expectationIndex] = obligationIndex;
      expectationIndex = previousExpectation;
    }
  }
}

/** @param {unknown} review @param {Set<string>} reasons */
function applyReview(review, reasons) {
  if (review === 'contradicted') reasons.add('SUPPORT_REVIEW_CONTRADICTED');
  else if (review === 'uncertain') reasons.add('SUPPORT_REVIEW_UNCERTAIN');
  else if (review !== 'supported') reasons.add('SUPPORT_REVIEW_MISSING');
}

/** @param {unknown} status @param {{rank: number}} gate @param {Set<string>} reasons */
function applyCapabilityStatus(status, gate, reasons) {
  if (status === 'approved-assumption') gate.rank = Math.min(gate.rank, 1);
  else if (status === 'unknown') {
    gate.rank = 0;
    reasons.add('CAPABILITY_UNKNOWN');
  } else if (status === 'unavailable') {
    gate.rank = 0;
    reasons.add('CAPABILITY_UNAVAILABLE');
  } else if (!GROUNDED_CAPABILITIES.has(/** @type {string} */ (status))) {
    gate.rank = 0;
    reasons.add('CAPABILITY_STATUS_INVALID');
  }
}

/** @param {Record<string, unknown>} draft @param {Record<string, unknown>[]} obligations @param {string[]} routedFactIds @param {Map<string, Record<string, unknown>[]>} routesByFact @param {Map<string, Record<string, unknown>>} factsById @param {Map<string, ClaimAssessment>} evidence @param {Map<string, EvidenceResult>} evidenceCache @param {{masksByClaim: Map<string, bigint>, masksByObligation: Map<string, bigint>}} oracleReachability @param {Record<string, unknown>[]} conflicts @param {Diagnostic[]} diagnostics */
function evaluateCase(draft, obligations, routedFactIds, routesByFact, factsById, evidence, evidenceCache, oracleReachability, conflicts, diagnostics) {
  const reasons = new Set();
  const submittedEvidenceRefs = stringArray(draft.evidence_refs, true);
  const evidenceRoots = new Set();
  const formalEvidenceRoots = new Set();
  const downgradeRoots = new Set();
  const gate = { rank: 2 };
  const requiredFieldsValid = isCanonicalString(draft.case_id) && isNonblank(draft.title) && isCanonicalString(draft.scope)
    && RISKS.has(/** @type {string} */ (draft.risk)) && isRecord(draft.role)
    && (stringArray(draft.fact_ids, true) !== null) && (stringArray(draft.obligation_ids, true) !== null)
    && (objectArray(draft.preconditions)?.length ?? 0) > 0 && (objectArray(draft.data)?.length ?? 0) > 0
    && (objectArray(draft.steps)?.length ?? 0) > 0 && isRecord(draft.testability_profile)
    && isRecord(draft.post_state) && isRecord(draft.cleanup) && submittedEvidenceRefs !== null
    && isRecord(draft.execution_signature);
  if (!requiredFieldsValid) reasons.add('CASE_GATE_INVALID');

  if (isRecord(draft.role)) {
    if (!isNonblank(draft.role.value) || !isCanonicalString(draft.role.evidence_ref)) reasons.add('CASE_GATE_INVALID');
    if (isCanonicalString(draft.role.evidence_ref)) evidenceRoots.add(draft.role.evidence_ref);
    applyReview(draft.role.support_review, reasons);
  }

  const sourceClaimIds = draft.source_claim_ids === undefined ? [] : stringArray(draft.source_claim_ids);
  if (!sourceClaimIds) reasons.add('CASE_GATE_INVALID');
  for (const ref of sourceClaimIds ?? []) evidenceRoots.add(ref);
  const factIds = stringArray(draft.fact_ids, true) ?? [];
  const obligationIds = new Set(stringArray(draft.obligation_ids, true) ?? []);
  for (const factId of factIds) {
    const routes = routesByFact.get(factId) ?? [];
    const validRoute = routes.length === 1 && routes[0].route_type === 'obligations'
      && (stringArray(routes[0].obligation_ids, true) ?? []).some((id) => obligationIds.has(id));
    if (!validRoute) reasons.add('CASE_FACT_ROUTE_INVALID');
  }
  for (const routedFactId of routedFactIds) if (!factIds.includes(routedFactId)) reasons.add('FACT_ROUTE_LINK_MISSING');
  for (const factId of new Set([...factIds, ...routedFactIds])) {
    const fact = factsById.get(factId);
    if (!fact) {
      reasons.add('FACT_REFERENCE_UNKNOWN');
      continue;
    }
    if (fact.status === 'conflicted' || fact.status === 'ambiguous') reasons.add('FACT_UNRESOLVED');
    if (isCanonicalString(fact.claim_id)) {
      evidenceRoots.add(fact.claim_id);
      formalEvidenceRoots.add(fact.claim_id);
    }
    for (const ref of stringArray(fact.source_claim_ids) ?? []) {
      evidenceRoots.add(ref);
      formalEvidenceRoots.add(ref);
    }
  }

  /** @type {Set<string>} */
  const requiredCapabilities = new Set();
  for (const obligation of obligations) {
    const sources = stringArray(obligation.source_claim_ids, true) ?? [];
    const oracles = stringArray(obligation.required_oracle_refs) ?? [];
    if (oracles.length === 0) reasons.add('FORMAL_ORACLE_MISSING');
    for (const ref of [...sources, ...oracles]) {
      evidenceRoots.add(ref);
      formalEvidenceRoots.add(ref);
    }
    for (const capability of stringArray(obligation.required_capabilities) ?? []) requiredCapabilities.add(capability);
  }

  const preconditions = objectArray(draft.preconditions) ?? [];
  for (const precondition of preconditions) {
    if (!isNonblank(precondition.condition) || !isNonblank(precondition.reachable_from)
      || stringArray(precondition.source_claim_ids, true) === null || !isCanonicalString(precondition.evidence_ref)) reasons.add('CASE_GATE_INVALID');
    for (const ref of stringArray(precondition.source_claim_ids) ?? []) evidenceRoots.add(ref);
    if (isCanonicalString(precondition.evidence_ref)) evidenceRoots.add(precondition.evidence_ref);
    applyReview(precondition.support_review, reasons);
  }
  const data = objectArray(draft.data) ?? [];
  for (const datum of data) {
    if (!isNonblank(datum.name) || !isNonblank(datum.value) || !isRecord(datum.provenance)
      || !isCanonicalString(isRecord(datum.provenance) ? datum.provenance.ref : null)
      || !['evidence', 'derivation'].includes(String(isRecord(datum.provenance) ? datum.provenance.type : ''))) reasons.add('CASE_GATE_INVALID');
    if (isRecord(datum.provenance) && isCanonicalString(datum.provenance.ref)) evidenceRoots.add(datum.provenance.ref);
    applyReview(datum.support_review, reasons);
  }

  const steps = objectArray(draft.steps) ?? [];
  /** @type {Set<string>} */
  const stepIds = new Set();
  /** @type {Set<string>} */
  const expectationIds = new Set();
  /** @type {Array<{expectationId: string, evidenceRef: string}>} */
  const expectationsForOwnership = [];
  /** @type {Array<{observer: string, target: string}>} */
  const requiredObservers = [];
  for (const [stepIndex, step] of steps.entries()) {
    if (!isCanonicalString(step.step_id) || stepIds.has(step.step_id)) {
      if (stepIds.has(/** @type {string} */ (step.step_id))) diagnostics.push(diagnostic(
        'traceability', 'STEP_ID_DUPLICATE', `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/steps/${stepIndex}/step_id`, 'step IDs must be unique inside a Case'
      ));
      reasons.add('CASE_GATE_INVALID');
    } else stepIds.add(step.step_id);
    if (!isNonblank(step.action) || !isCanonicalString(step.action_evidence_ref)) reasons.add('CASE_GATE_INVALID');
    if (isCanonicalString(step.action_evidence_ref)) evidenceRoots.add(step.action_evidence_ref);
    applyReview(step.support_review, reasons);
    const expectations = objectArray(step.expectations) ?? [];
    if (expectations.length === 0) reasons.add('FORMAL_ORACLE_MISSING');
    for (const [expectationIndex, expectation] of expectations.entries()) {
      const expectationLocatable = isCanonicalString(expectation.expectation_id) && !expectationIds.has(expectation.expectation_id);
      if (!expectationLocatable) {
        if (expectationIds.has(/** @type {string} */ (expectation.expectation_id))) diagnostics.push(diagnostic(
          'traceability', 'EXPECTATION_ID_DUPLICATE', `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/steps/${stepIndex}/expectations/${expectationIndex}/expectation_id`, 'expectation IDs must be independently locatable'
        ));
        reasons.add('EXPECTATION_GATE_INVALID');
      } else expectationIds.add(/** @type {string} */ (expectation.expectation_id));
      if (expectation.preceding_action_id !== step.step_id) reasons.add('PRECEDING_ACTION_NOT_CONTAINING');
      const expectationFieldsValid = isNonblank(expectation.business_assertion) && isCanonicalString(expectation.preceding_action_id)
        && isNonblank(expectation.observer) && isNonblank(expectation.observation_surface)
        && isNonblank(expectation.observation_target) && isCanonicalString(expectation.evidence_ref);
      if (!expectationFieldsValid) reasons.add('EXPECTATION_GATE_INVALID');
      if (isCanonicalString(expectation.evidence_ref)) evidenceRoots.add(expectation.evidence_ref);
      if (expectationFieldsValid && expectationLocatable) {
        expectationsForOwnership.push({
          expectationId: /** @type {string} */ (expectation.expectation_id),
          evidenceRef: /** @type {string} */ (expectation.evidence_ref)
        });
        requiredObservers.push({ observer: String(expectation.observer), target: String(expectation.observation_target) });
      }
      const oracle = isRecord(expectation.oracle) ? expectation.oracle : null;
      const expectedField = oracle ? ORACLE_FIELDS[/** @type {keyof typeof ORACLE_FIELDS} */ (oracle.type)] : null;
      const comparisonValid = oracle && COMPARISONS.has(/** @type {string} */ (oracle.comparison));
      const toleranceValid = !oracle || oracle.tolerance === undefined
        || (typeof oracle.tolerance === 'number' && Number.isFinite(oracle.tolerance) && oracle.tolerance >= 0);
      const windowValid = !oracle || oracle.window === undefined || isNonblank(oracle.window);
      const withinBounded = !oracle || oracle.comparison !== 'within'
        || (oracle.tolerance !== undefined && toleranceValid) || (oracle.window !== undefined && windowValid);
      if (!oracle || !expectedField || !isNonblank(oracle[expectedField]) || !comparisonValid
        || !toleranceValid || !windowValid || !withinBounded) reasons.add('ORACLE_INVALID');
      applyReview(expectation.support_review, reasons);
    }
  }
  for (const step of steps) {
    for (const expectation of objectArray(step.expectations) ?? []) {
      if (!stepIds.has(/** @type {string} */ (expectation.preceding_action_id))) reasons.add('PRECEDING_ACTION_UNKNOWN');
    }
  }
  requireOracleOwnership(draft, obligations, expectationsForOwnership, oracleReachability, reasons, diagnostics);

  const profile = isRecord(draft.testability_profile) ? draft.testability_profile : {};
  const capabilities = objectArray(profile.capabilities) ?? [];
  const observers = objectArray(profile.observers) ?? [];
  const controls = objectArray(profile.controls) ?? [];
  if (capabilities.length === 0) reasons.add('CAPABILITY_MISSING');
  if (observers.length === 0) reasons.add('OBSERVER_MISSING');
  if (controls.length === 0) reasons.add('CONTROL_MISSING');
  /** @type {Set<string>} */
  const providedCapabilities = new Set();
  for (const capability of capabilities) {
    if (!isCanonicalString(capability.capability) || !CAPABILITY_STATUSES.has(/** @type {string} */ (capability.status))) reasons.add('CAPABILITY_MISSING');
    else providedCapabilities.add(capability.capability);
    applyCapabilityStatus(capability.status, gate, reasons);
    if (isCanonicalString(capability.provenance_ref)) {
      evidenceRoots.add(capability.provenance_ref);
      if (capability.status === 'approved-assumption') downgradeRoots.add(capability.provenance_ref);
    }
    else reasons.add('CAPABILITY_PROVENANCE_MISSING');
  }
  for (const observer of observers) {
    if (!isNonblank(observer.observer) || !isNonblank(observer.observation_target)) reasons.add('OBSERVER_MISSING');
    applyCapabilityStatus(observer.status, gate, reasons);
    if (isCanonicalString(observer.provenance_ref)) {
      evidenceRoots.add(observer.provenance_ref);
      if (observer.status === 'approved-assumption') downgradeRoots.add(observer.provenance_ref);
    }
    else reasons.add('CAPABILITY_PROVENANCE_MISSING');
  }
  for (const control of controls) {
    if (!isNonblank(control.control)) reasons.add('CONTROL_MISSING');
    applyCapabilityStatus(control.status, gate, reasons);
    if (isCanonicalString(control.provenance_ref)) {
      evidenceRoots.add(control.provenance_ref);
      if (control.status === 'approved-assumption') downgradeRoots.add(control.provenance_ref);
    }
    else reasons.add('CAPABILITY_PROVENANCE_MISSING');
  }
  for (const required of requiredCapabilities) if (!providedCapabilities.has(required)) reasons.add('REQUIRED_CAPABILITY_MISSING');
  for (const required of requiredObservers) {
    if (!observers.some((observer) => observer.observer === required.observer && observer.observation_target === required.target)) reasons.add('OBSERVER_MISSING');
  }

  if (isRecord(draft.post_state)) {
    if (!isNonblank(draft.post_state.state) || !isCanonicalString(draft.post_state.evidence_ref)) reasons.add('CASE_GATE_INVALID');
    if (isCanonicalString(draft.post_state.evidence_ref)) evidenceRoots.add(draft.post_state.evidence_ref);
    applyReview(draft.post_state.support_review, reasons);
  }
  if (isRecord(draft.cleanup)) {
    if (draft.cleanup.required === true) {
      if (stringArray(draft.cleanup.steps, true) === null || !isCanonicalString(draft.cleanup.evidence_ref)) reasons.add('CASE_GATE_INVALID');
      if (isCanonicalString(draft.cleanup.evidence_ref)) evidenceRoots.add(draft.cleanup.evidence_ref);
    } else if (draft.cleanup.required === false) {
      if (!isNonblank(draft.cleanup.no_cleanup_reason) || !isCanonicalString(draft.cleanup.no_cleanup_evidence_ref)) reasons.add('CASE_GATE_INVALID');
      if (isCanonicalString(draft.cleanup.no_cleanup_evidence_ref)) evidenceRoots.add(draft.cleanup.no_cleanup_evidence_ref);
    } else reasons.add('CASE_GATE_INVALID');
    applyReview(draft.cleanup.support_review, reasons);
  }

  const evidenceSummaryPath = `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/evidence_refs`;
  if (!submittedEvidenceRefs) {
    diagnostics.push(diagnostic(
      'classification', 'CASE_EVIDENCE_SUMMARY_INVALID', evidenceSummaryPath,
      'Case evidence_refs must be a dense, unique array of canonical direct evidence roots'
    ));
    reasons.add('CASE_EVIDENCE_SUMMARY_INVALID');
  } else {
    const actualDirectRefs = [...evidenceRoots].sort(compareCodePoints);
    const submittedDirectRefs = [...submittedEvidenceRefs].sort(compareCodePoints);
    if (canonicalStringify(actualDirectRefs) !== canonicalStringify(submittedDirectRefs)) {
      const actualSet = new Set(actualDirectRefs);
      const submittedSet = new Set(submittedDirectRefs);
      const missing = actualDirectRefs.filter((ref) => !submittedSet.has(ref));
      const extra = submittedDirectRefs.filter((ref) => !actualSet.has(ref));
      diagnostics.push(diagnostic(
        'traceability', 'CASE_EVIDENCE_SUMMARY_MISMATCH', evidenceSummaryPath,
        `Case evidence_refs direct-root summary differs; missing=[${missing.join(', ')}], extra=[${extra.join(', ')}]`
      ));
      reasons.add('CASE_EVIDENCE_SUMMARY_MISMATCH');
    }
  }

  const signature = isRecord(draft.execution_signature) ? draft.execution_signature : {};
  const submittedRole = normalizeSemanticString(signature.role);
  const submittedActions = Array.isArray(signature.action_path) ? signature.action_path.map(normalizeSemanticString) : [];
  const submittedOracles = Array.isArray(signature.oracle_refs)
    ? [...new Set(signature.oracle_refs.map(normalizeSemanticString))].sort(compareCodePoints) : [];
  const submittedTestPoints = stringArray(signature.test_point_ids, true);
  const actualTestPoints = [...(stringArray(draft.obligation_ids, true) ?? [])].sort(compareCodePoints);
  const actualSignature = JSON.parse(executionSignature(draft));
  if (signature.precondition_state !== actualSignature.precondition_state
    || signature.data_partition !== actualSignature.data_partition) {
    reasons.add('EXECUTION_SIGNATURE_MISMATCH');
  }
  if (submittedRole !== actualSignature.role
    || canonicalStringify(submittedActions) !== canonicalStringify(actualSignature.action_path)
    || canonicalStringify(submittedOracles) !== canonicalStringify(actualSignature.oracle_refs)
    || (signature.test_point_ids !== undefined && (!submittedTestPoints
      || canonicalStringify([...submittedTestPoints].sort(compareCodePoints)) !== canonicalStringify(actualTestPoints)))) {
    reasons.add('EXECUTION_SIGNATURE_MISMATCH');
  }

  const evidenceResult = assessEvidenceRoots([...evidenceRoots], evidence, evidenceCache);
  const formalEvidenceResult = assessEvidenceRoots([...formalEvidenceRoots], evidence, evidenceCache);
  for (const ref of sourceClaimIds ?? []) {
    if (!formalEvidenceResult.refs.has(ref)) reasons.add('CASE_SOURCE_CLAIM_OUTSIDE_CLOSURE');
  }
  gate.rank = Math.min(gate.rank, evidenceResult.rank);
  for (const reason of evidenceResult.reasons) reasons.add(reason);
  for (const ref of evidenceResult.refs) if (evidence.get(ref)?.claim.level === 'E1') downgradeRoots.add(ref);
  for (const conflict of conflicts) {
    const scope = typeof conflict.scope === 'string' ? conflict.scope : '';
    const sourceIds = new Set(stringArray(conflict.source_ids) ?? []);
    if (isCanonicalString(draft.scope) && isCanonicalString(scope) && scopesIntersect(draft.scope, scope)
      && [...evidenceResult.sourceIds].some((sourceId) => sourceIds.has(sourceId))) reasons.add('UNRESOLVED_CONFLICT');
  }
  if (reasons.size === 0 && gate.rank === 1) {
    const orderedDowngradeRoots = [...downgradeRoots].sort(compareCodePoints);
    if (orderedDowngradeRoots.length > 1) {
      diagnostics.push(diagnostic(
        'classification', 'CONDITIONAL_ASSUMPTIONS_AMBIGUOUS', `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/temporary_assumption`,
        `singleton temporary_assumption cannot represent downgrade roots ${orderedDowngradeRoots.join(', ')}`
      ));
      reasons.add('CONDITIONAL_ASSUMPTIONS_AMBIGUOUS');
    }
    const assumption = isRecord(draft.temporary_assumption) ? draft.temporary_assumption : null;
    if (!assumption) reasons.add('TEMPORARY_ASSUMPTION_MISSING');
    else {
      if (!isCanonicalString(assumption.claim_id) || !isNonblank(assumption.invalidation_condition)
        || orderedDowngradeRoots.length !== 1 || assumption.claim_id !== orderedDowngradeRoots[0]) {
        reasons.add('TEMPORARY_ASSUMPTION_INVALID');
      }
    }
  }
  if (reasons.size === 0 && gate.rank === 2 && Object.hasOwn(draft, 'temporary_assumption')) {
    diagnostics.push(diagnostic(
      'classification', 'TEMPORARY_ASSUMPTION_UNEXPECTED',
      `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/temporary_assumption`,
      'Grounded Case cannot retain a temporary assumption without a consumed downgrade root'
    ));
    reasons.add('TEMPORARY_ASSUMPTION_UNEXPECTED');
  }
  if (reasons.size > 0) gate.rank = 0;
  return {
    rank: gate.rank,
    reasons: [...reasons].sort(compareCodePoints),
    evidenceRefs: [...evidenceResult.refs].sort(compareCodePoints)
  };
}

/** @param {Map<string, BlockedCase>} blocked @param {Record<string, unknown>} obligation @param {string[]} reasonCodes @param {string[]} evidenceRefs @param {string | null} rootIssueId */
function addBlocked(blocked, obligation, reasonCodes, evidenceRefs, rootIssueId) {
  const obligationId = String(obligation.obligation_id);
  const existing = blocked.get(obligationId);
  const reasons = new Set([...(existing?.reason.split(',') ?? []), ...reasonCodes]);
  reasons.delete('');
  const refs = new Set([...(existing?.evidence_refs ?? []), ...evidenceRefs]);
  const reason = [...reasons].sort(compareCodePoints).join(',');
  blocked.set(obligationId, {
    obligation_id: obligationId,
    root_issue_id: rootIssueId ?? stableId('root', {
      missing_type: 'case-classification', obligation_id: obligationId,
      reason_codes: [...reasons].sort(compareCodePoints), scope: obligation.scope
    }),
    reason,
    risk: String(obligation.risk),
    evidence_refs: [...refs].sort(compareCodePoints)
  });
}

/** @param {string} root @param {string} target @param {Map<string, ClaimAssessment>} evidence */
function reachesEvidence(root, target, evidence) {
  const pending = [root];
  const seen = new Set();
  while (pending.length > 0) {
    const current = /** @type {string} */ (pending.pop());
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const parent of evidence.get(current)?.parents ?? []) pending.push(parent);
  }
  return false;
}

/** @param {string[]} roots @param {Map<string, ClaimAssessment>} evidence @param {Map<string, EvidenceResult>} ancestryCache @param {Map<string, Set<string>>} relationCache */
function relatedEvidenceClosure(roots, evidence, ancestryCache, relationCache) {
  const cacheKey = canonicalStringify([...new Set(roots)].sort(compareCodePoints));
  const cached = relationCache.get(cacheKey);
  if (cached) return cached;
  const related = new Set(assessEvidenceRoots(roots, evidence, ancestryCache).refs);
  const pending = [...new Set(roots)].sort(compareCodePoints);
  const seenDescendants = new Set();
  let cursor = 0;
  while (cursor < pending.length) {
    const claimId = pending[cursor++];
    if (seenDescendants.has(claimId)) continue;
    seenDescendants.add(claimId);
    related.add(claimId);
    for (const childId of evidence.get(claimId)?.children ?? []) pending.push(childId);
  }
  relationCache.set(cacheKey, related);
  return related;
}

/** @param {Record<string, unknown>} draft */
function comparableCase(draft) {
  const copy = structuredClone(draft);
  delete copy.case_id;
  delete copy.fact_ids;
  delete copy.obligation_ids;
  delete copy.source_claim_ids;
  delete copy.evidence_refs;
  if (isRecord(copy.execution_signature)) delete copy.execution_signature.test_point_ids;
  return canonicalStringify(copy);
}

/** @param {Record<string, unknown>[]} drafts */
function mergeExactCases(drafts) {
  const sorted = [...drafts].sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id)));
  const merged = structuredClone(sorted[0]);
  for (const field of ['fact_ids', 'obligation_ids', 'source_claim_ids', 'evidence_refs']) {
    const values = new Set(sorted.flatMap((draft) => stringArray(draft[field]) ?? []));
    merged[field] = [...values].sort(compareCodePoints);
  }
  const signature = JSON.parse(executionSignature(merged));
  merged.case_id = stableId('case', signature);
  if (isRecord(merged.execution_signature)) {
    merged.execution_signature.test_point_ids = [...new Set(sorted.flatMap((draft) =>
      isRecord(draft.execution_signature) ? stringArray(draft.execution_signature.test_point_ids) ?? [] : []
    ))].sort(compareCodePoints);
  }
  return merged;
}

/** @param {Array<{draft: Record<string, unknown>, rank: number}>} executable @param {Diagnostic[]} diagnostics */
function deduplicateCases(executable, diagnostics) {
  /** @type {Map<string, Array<{draft: Record<string, unknown>, rank: number}>>} */
  const groups = new Map();
  for (const item of executable) {
    const signature = executionSignature(item.draft);
    const bucket = groups.get(signature);
    if (bucket) bucket.push(item);
    else groups.set(signature, [item]);
  }
  /** @type {Record<string, unknown>[]} */
  const grounded = [];
  /** @type {Record<string, unknown>[]} */
  const conditional = [];
  for (const [signature, items] of [...groups].sort(([left], [right]) => compareCodePoints(left, right))) {
    const semanticKeys = new Set(items.map((item) => `${item.rank}\0${comparableCase(item.draft)}`));
    if (semanticKeys.size > 1) {
      const caseIds = items.map((item) => String(item.draft.case_id)).sort(compareCodePoints);
      diagnostics.push(diagnostic(
        'classification', 'DUPLICATE_SIGNATURE_SEMANTIC_CONFLICT', `/execution_signatures/${pointerPart(stableId('execution', JSON.parse(signature)))}`,
        `same execution signature has conflicting non-signature semantics in Cases ${caseIds.join(', ')}`
      ));
      for (const item of items.sort((left, right) => compareCodePoints(String(left.draft.case_id), String(right.draft.case_id)))) {
        (item.rank === 2 ? grounded : conditional).push(structuredClone(item.draft));
      }
      continue;
    }
    const merged = mergeExactCases(items.map((item) => item.draft));
    (items[0].rank === 2 ? grounded : conditional).push(merged);
  }
  grounded.sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id)));
  conditional.sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id)));
  return { grounded, conditional };
}

/**
 * Classify a complete Task 8 snapshot. The context is deliberately closed:
 * `{sourceRevision, evidence:{claimsById,factLedger,conflicts}, obligations,
 * caseDrafts}`. It reads no global state and returns diagnostics rather than
 * throwing for submitted-data errors.
 * @param {unknown} submittedContext
 * @returns {ClassificationResult}
 */
export function classifyCaseDrafts(submittedContext) {
  try {
    const trusted = snapshotControlled(submittedContext);
    if (trusted.diagnostics.length > 0) return resultWithDiagnostics(trusted.diagnostics);
    if (!isRecord(trusted.snapshot)) return resultWithDiagnostics([
      diagnostic('classification', 'CONTEXT_INVALID', '/', 'classification context must be a closed own-data record')
    ]);
    /** @type {Diagnostic[]} */
    const diagnostics = [];
    validateClosedShape(trusted.snapshot, diagnostics);
    if (diagnostics.length > 0) return resultWithDiagnostics(diagnostics);

    const context = trusted.snapshot;
    const evidenceContext = /** @type {Record<string, unknown>} */ (context.evidence);
    const obligationArtifact = /** @type {Record<string, unknown>} */ (context.obligations);
    const draftArtifact = /** @type {Record<string, unknown>} */ (context.caseDrafts);
    const evidence = buildEvidenceIndex(/** @type {Map<unknown, unknown>} */ (evidenceContext.claimsById), diagnostics);
    /** @type {Map<string, EvidenceResult>} */
    const evidenceCache = new Map();
    /** @type {Map<string, Set<string>>} */
    const relatedEvidenceCache = new Map();
    const facts = /** @type {Record<string, unknown>[]} */ (evidenceContext.factLedger);
    const conflicts = /** @type {Record<string, unknown>[]} */ (evidenceContext.conflicts);
    const obligations = /** @type {Record<string, unknown>[]} */ (obligationArtifact.obligations);
    const drafts = /** @type {Record<string, unknown>[]} */ (draftArtifact.cases);
    const dispositions = /** @type {Record<string, unknown>[]} */ (draftArtifact.obligation_dispositions);
    const exploratory = /** @type {Record<string, unknown>[]} */ (draftArtifact.exploratory_candidates);
    const factRoutes = /** @type {Record<string, unknown>[]} */ (obligationArtifact.fact_routes);
    const interactionRoutes = /** @type {Record<string, unknown>[]} */ (obligationArtifact.interaction_routes);
    const oracleReachability = buildOracleReachability(evidence, obligations);

    /** @type {Map<string, Record<string, unknown>>} */
    const factsById = new Map();
    for (const fact of facts) {
      const factId = typeof fact.fact_id === 'string' ? fact.fact_id : '';
      if (factsById.has(factId)) diagnostics.push(diagnostic('traceability', 'FACT_ID_DUPLICATE', `/facts/${pointerPart(factId)}`, 'fact IDs must be unique'));
      else factsById.set(factId, fact);
    }
    /** @type {Map<string, Record<string, unknown>>} */
    const obligationsById = new Map();
    for (const obligation of obligations) {
      const id = typeof obligation.obligation_id === 'string' ? obligation.obligation_id : '';
      if (obligationsById.has(id)) diagnostics.push(diagnostic('traceability', 'OBLIGATION_ID_DUPLICATE', `/obligations/${pointerPart(id)}`, 'formal obligation IDs must be unique'));
      else obligationsById.set(id, obligation);
    }
    /** @type {Map<string, Set<string>>} */
    const routedFactsByObligation = new Map();
    /** @type {Map<string, Record<string, unknown>[]>} */
    const routesByFact = new Map();
    for (const [routeIndex, route] of factRoutes.entries()) {
      const factId = typeof route.fact_id === 'string' ? route.fact_id : '';
      const routeBucket = routesByFact.get(factId);
      if (routeBucket) routeBucket.push(route);
      else routesByFact.set(factId, [route]);
      if (!factsById.has(factId)) diagnostics.push(diagnostic(
        'reference', 'FACT_ROUTE_FACT_UNKNOWN', `/obligations/fact_routes/${routeIndex}/fact_id`, 'fact route references an unknown fact'
      ));
      if (route.route_type !== 'obligations') continue;
      const routedObligations = stringArray(route.obligation_ids, true);
      if (!routedObligations) diagnostics.push(diagnostic(
        'traceability', 'FACT_ROUTE_OBLIGATIONS_INVALID', `/obligations/fact_routes/${routeIndex}/obligation_ids`, 'formal fact route requires a nonempty dense obligation list'
      ));
      for (const obligationId of routedObligations ?? []) {
        if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic(
          'reference', 'FACT_ROUTE_OBLIGATION_UNKNOWN', `/obligations/fact_routes/${routeIndex}/obligation_ids/${pointerPart(obligationId)}`, 'fact route references an unknown formal obligation'
        ));
        const routed = routedFactsByObligation.get(obligationId) ?? new Set();
        routed.add(factId);
        routedFactsByObligation.set(obligationId, routed);
      }
    }
    /** @type {Map<string, Record<string, unknown>>} */
    const casesById = new Map();
    for (const draft of drafts) {
      const id = typeof draft.case_id === 'string' ? draft.case_id : '';
      if (casesById.has(id)) diagnostics.push(diagnostic('traceability', 'CASE_ID_DUPLICATE', `/cases/${pointerPart(id)}`, 'Case IDs must be unique before exact-signature deduplication'));
      else casesById.set(id, draft);
    }
    /** @type {Map<string, Record<string, unknown>>} */
    const dispositionByObligation = new Map();
    for (const disposition of dispositions) {
      const obligationId = typeof disposition.obligation_id === 'string' ? disposition.obligation_id : '';
      if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic(
        'reference', 'OBLIGATION_DISPOSITION_UNKNOWN', `/obligation_dispositions/${pointerPart(obligationId)}`, 'disposition references an unknown formal obligation'
      ));
      if (dispositionByObligation.has(obligationId)) diagnostics.push(diagnostic(
        'traceability', 'OBLIGATION_DISPOSITION_DUPLICATE', `/obligation_dispositions/${pointerPart(obligationId)}`, 'every formal obligation must have exactly one disposition'
      ));
      else dispositionByObligation.set(obligationId, disposition);
      if (!['case_candidate', 'blocker', 'not_applicable'].includes(String(disposition.status))) diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_DISPOSITION_STATUS_INVALID', `/obligation_dispositions/${pointerPart(obligationId)}/status`,
        'formal obligation disposition status is outside the frozen lanes'
      ));
      if (disposition.status === 'case_candidate') {
        const caseIds = stringArray(disposition.case_ids) ?? [];
        if (caseIds.length === 0) {
          const obligation = obligationsById.get(obligationId);
          const routedRoots = [...(routedFactsByObligation.get(obligationId) ?? [])].flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [String(fact.claim_id), ...(stringArray(fact.source_claim_ids) ?? [])] : [];
          });
          const evidenceResult = obligation ? assessEvidenceRoots([
            ...(stringArray(obligation.source_claim_ids) ?? []),
            ...(stringArray(obligation.required_oracle_refs) ?? []), ...routedRoots
          ], evidence, evidenceCache) : null;
          const fullyGroundable = obligation && (stringArray(obligation.required_oracle_refs) ?? []).length > 0
            && (stringArray(obligation.required_capabilities) ?? []).length === 0
            && evidenceResult?.rank === 2 && evidenceResult.reasons.size === 0;
          diagnostics.push(diagnostic(
            'classification', fullyGroundable ? 'GROUNDABLE_OBLIGATION_CASE_MISSING' : 'DISPOSITION_CASES_MISSING',
            `/obligation_dispositions/${pointerPart(obligationId)}/case_ids`,
            fullyGroundable
              ? 'fully groundable formal obligation requires at least one candidate Case'
              : 'case_candidate disposition requires at least one Case'
          ));
        }
        for (const caseId of caseIds) {
          const candidate = casesById.get(caseId);
          if (!candidate) diagnostics.push(diagnostic(
            'reference', 'DISPOSITION_CASE_UNKNOWN', `/obligation_dispositions/${pointerPart(obligationId)}/case_ids/${pointerPart(caseId)}`, 'candidate disposition references an unknown Case'
          ));
          else if (!(stringArray(candidate.obligation_ids) ?? []).includes(obligationId)) diagnostics.push(diagnostic(
            'traceability', 'CASE_LANE_DISPOSITION_MISMATCH', `/obligation_dispositions/${pointerPart(obligationId)}/case_ids/${pointerPart(caseId)}`,
            'case_candidate disposition and Case must reference each other'
          ));
        }
      }
    }
    for (const obligationId of obligationsById.keys()) {
      if (!dispositionByObligation.has(obligationId)) diagnostics.push(diagnostic(
        'traceability', 'OBLIGATION_DISPOSITION_MISSING', `/obligation_dispositions/${pointerPart(obligationId)}`, 'every formal obligation must have exactly one disposition'
      ));
    }
    if (diagnostics.length > 0) return resultWithDiagnostics(diagnostics);

    /** @type {Map<string, BlockedCase>} */
    const blocked = new Map();
    /** @type {Record<string, unknown>[]} */
    const notApplicable = [];
    /** @type {Array<{draft: Record<string, unknown>, rank: number}>} */
    const executable = [];

    for (const disposition of dispositions) {
      const obligation = /** @type {Record<string, unknown>} */ (obligationsById.get(/** @type {string} */ (disposition.obligation_id)));
      const obligationId = /** @type {string} */ (obligation.obligation_id);
      if (disposition.status === 'blocker') {
        const roots = [
          ...(stringArray(obligation.source_claim_ids) ?? []), ...(stringArray(obligation.required_oracle_refs) ?? []),
          ...[...(routedFactsByObligation.get(obligationId) ?? [])].flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [String(fact.claim_id), ...(stringArray(fact.source_claim_ids) ?? [])] : [];
          })
        ];
        const evidenceResult = assessEvidenceRoots(roots, evidence, evidenceCache);
        const relatedEvidence = relatedEvidenceClosure(roots, evidence, evidenceCache, relatedEvidenceCache);
        const blockerEvidenceRefs = stringArray(disposition.evidence_refs, true);
        if (!blockerEvidenceRefs) {
          diagnostics.push(diagnostic(
            'classification', 'BLOCKER_EVIDENCE_REFS_INVALID', `/obligation_dispositions/${pointerPart(obligationId)}/evidence_refs`,
            'explicit blocker evidence_refs must be a dense, unique array of canonical nonblank references'
          ));
          continue;
        }
        let blockerRefsValid = true;
        for (const ref of blockerEvidenceRefs) {
          const blockerAssessment = evidence.get(ref);
          if (!blockerAssessment) {
            blockerRefsValid = false;
            diagnostics.push(diagnostic(
              'reference', 'BLOCKER_EVIDENCE_UNKNOWN', `/obligation_dispositions/${pointerPart(obligationId)}/evidence_refs/${pointerPart(ref)}`,
              'explicit blocker references unknown accepted evidence'
            ));
          } else if (blockerAssessment.rank === 0 || blockerAssessment.reasons.length > 0) {
            blockerRefsValid = false;
            diagnostics.push(diagnostic(
              'classification', 'BLOCKER_EVIDENCE_INVALID', `/obligation_dispositions/${pointerPart(obligationId)}/evidence_refs/${pointerPart(ref)}`,
              'explicit blocker evidence must be accepted before it can justify a blocker'
            ));
          } else if (!relatedEvidence.has(ref)) {
            blockerRefsValid = false;
            diagnostics.push(diagnostic(
              'traceability', 'BLOCKER_EVIDENCE_UNRELATED', `/obligation_dispositions/${pointerPart(obligationId)}/evidence_refs/${pointerPart(ref)}`,
              'explicit blocker evidence must be related to the formal obligation evidence closure'
            ));
          }
        }
        if (!blockerRefsValid) continue;
        const oracles = stringArray(obligation.required_oracle_refs) ?? [];
        const capabilities = stringArray(obligation.required_capabilities) ?? [];
        if (oracles.length > 0 && capabilities.length === 0 && evidenceResult.rank === 2 && evidenceResult.reasons.size === 0) {
          diagnostics.push(diagnostic(
            'classification', 'GROUNDABLE_OBLIGATION_CASE_MISSING', `/obligation_dispositions/${pointerPart(obligationId)}`,
            'fully groundable formal obligation requires a candidate Case instead of an unjustified blocker'
          ));
          continue;
        }
        const reasons = oracles.length === 0 ? ['FORMAL_ORACLE_MISSING']
          : evidenceResult.reasons.size > 0 ? [...evidenceResult.reasons].sort(compareCodePoints) : ['EXPLICIT_BLOCKER'];
        addBlocked(
          blocked, obligation, reasons,
          blockerEvidenceRefs,
          isCanonicalString(disposition.blocker_root_issue_id) ? String(disposition.blocker_root_issue_id) : null
        );
      } else if (disposition.status === 'not_applicable') {
        const exclusionId = typeof disposition.exclusion_claim_id === 'string' ? disposition.exclusion_claim_id : '';
        const exclusion = evidence.get(exclusionId);
        const obligationRoots = [
          ...(stringArray(obligation.source_claim_ids) ?? []), ...(stringArray(obligation.required_oracle_refs) ?? []),
          ...[...(routedFactsByObligation.get(obligationId) ?? [])].flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [String(fact.claim_id), ...(stringArray(fact.source_claim_ids) ?? [])] : [];
          })
        ];
        const levelValid = exclusion?.rank === 2 && (exclusion.claim.level === 'E3' || exclusion.claim.level === 'E2');
        const scopeValid = exclusion && typeof exclusion.claim.scope === 'string' && typeof disposition.scope === 'string'
          && scopeContains(exclusion.claim.scope, disposition.scope) && scopeContains(disposition.scope, /** @type {string} */ (obligation.scope));
        const independent = exclusion && obligationRoots.every((root) =>
          !reachesEvidence(exclusionId, root, evidence) && !reachesEvidence(root, exclusionId, evidence));
        const reviewValid = disposition.support_review === 'supported';
        if (levelValid && scopeValid && independent && reviewValid) notApplicable.push(structuredClone(disposition));
        else {
          const reason = !levelValid ? 'EXCLUSION_EVIDENCE_INVALID' : !scopeValid ? 'EXCLUSION_SCOPE_INVALID'
            : !reviewValid ? 'EXCLUSION_REVIEW_INVALID' : 'EXCLUSION_NOT_INDEPENDENT';
          addBlocked(blocked, obligation, [reason], exclusionId ? [exclusionId] : [], stableId('root', {
            missing_type: 'invalid-exclusion', obligation_id: obligationId, exclusion_claim_id: exclusionId, scope: disposition.scope
          }));
        }
      }
    }

    for (const draft of drafts) {
      const obligationIds = stringArray(draft.obligation_ids, true) ?? [];
      const linked = obligationIds.flatMap((id) => obligationsById.has(id) ? [/** @type {Record<string, unknown>} */ (obligationsById.get(id))] : []);
      for (const obligationId of obligationIds) {
        if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic(
          'reference', 'CASE_OBLIGATION_UNKNOWN', `/cases/${pointerPart(String(draft.case_id))}/obligation_ids/${pointerPart(obligationId)}`, 'Case references an unknown formal obligation'
        ));
        const disposition = dispositionByObligation.get(obligationId);
        if (disposition?.status !== 'case_candidate' || !(stringArray(disposition.case_ids) ?? []).includes(/** @type {string} */ (draft.case_id))) {
          diagnostics.push(diagnostic(
            'traceability', 'CASE_LANE_DISPOSITION_MISMATCH', `/cases/${pointerPart(String(draft.case_id))}/obligation_ids/${pointerPart(obligationId)}`,
            'Case and formal disposition must reference each other in the case_candidate lane'
          ));
        }
      }
      const routedFactIds = [...new Set(linked.flatMap((obligation) =>
        [...(routedFactsByObligation.get(String(obligation.obligation_id)) ?? [])]
      ))].sort(compareCodePoints);
      const evaluation = evaluateCase(
        draft, linked, routedFactIds, routesByFact, factsById,
        evidence, evidenceCache, oracleReachability, conflicts, diagnostics
      );
      if (evaluation.rank === 0) {
        for (const obligation of linked) addBlocked(blocked, obligation, evaluation.reasons, evaluation.evidenceRefs, null);
      } else executable.push({ draft: structuredClone(draft), rank: evaluation.rank });
    }

    // Traverse the obligation↔Case graph once. A blocked Test Point invalidates
    // every Case that contains it, which may transitively block other Test Points.
    const executableObligationIds = executable.map((item) => stringArray(item.draft.obligation_ids, true) ?? []);
    /** @type {Map<string, number[]>} */
    const executableCasesByObligation = new Map();
    for (const [caseIndex, obligationIds] of executableObligationIds.entries()) {
      for (const obligationId of obligationIds) {
        const bucket = executableCasesByObligation.get(obligationId);
        if (bucket) bucket.push(caseIndex);
        else executableCasesByObligation.set(obligationId, [caseIndex]);
      }
    }
    const blockedQueue = [...blocked.keys()].sort(compareCodePoints);
    const invalidExecutableCases = new Set();
    let blockedCursor = 0;
    while (blockedCursor < blockedQueue.length) {
      const blockedObligationId = blockedQueue[blockedCursor++];
      for (const caseIndex of executableCasesByObligation.get(blockedObligationId) ?? []) {
        if (invalidExecutableCases.has(caseIndex)) continue;
        invalidExecutableCases.add(caseIndex);
        for (const obligationId of executableObligationIds[caseIndex]) {
          const obligation = obligationsById.get(obligationId);
          if (!obligation) continue;
          const alreadyBlocked = blocked.has(obligationId);
          addBlocked(blocked, obligation, ['CASE_SHARES_BLOCKED_OBLIGATION'], [], null);
          if (!alreadyBlocked) blockedQueue.push(obligationId);
        }
      }
    }
    const uniquelyExecutable = executable.filter((_, index) => !invalidExecutableCases.has(index));

    /** @type {Map<string, Set<number>>} */
    const executableRanksByObligation = new Map();
    for (const item of uniquelyExecutable) {
      for (const obligationId of stringArray(item.draft.obligation_ids, true) ?? []) {
        const ranks = executableRanksByObligation.get(obligationId) ?? new Set();
        ranks.add(item.rank);
        executableRanksByObligation.set(obligationId, ranks);
      }
    }
    for (const [obligationId, ranks] of executableRanksByObligation) {
      if (ranks.size > 1) diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_EXECUTABLE_LANE_CONFLICT', `/obligations/${pointerPart(obligationId)}`,
        'formal obligation has candidates in both Grounded and Conditional lanes'
      ));
    }

    const exploratoryRouteIds = new Set(interactionRoutes.flatMap((route) =>
      route.route_type === 'exploratory' && isCanonicalString(route.exploratory_id) ? [String(route.exploratory_id)] : []));
    const formalRoots = new Set();
    for (const obligation of obligations) {
      for (const ref of [...(stringArray(obligation.source_claim_ids) ?? []), ...(stringArray(obligation.required_oracle_refs) ?? [])]) formalRoots.add(ref);
      for (const factId of routedFactsByObligation.get(String(obligation.obligation_id)) ?? []) {
        const fact = factsById.get(factId);
        if (fact && isCanonicalString(fact.claim_id)) formalRoots.add(String(fact.claim_id));
        for (const ref of fact ? stringArray(fact.source_claim_ids) ?? [] : []) formalRoots.add(ref);
      }
    }
    const formalEvidence = assessEvidenceRoots([...formalRoots], evidence, evidenceCache).refs;
    const formalDependence = new Set(formalEvidence);
    const dependenceQueue = [...formalEvidence].sort(compareCodePoints);
    let dependenceCursor = 0;
    while (dependenceCursor < dependenceQueue.length) {
      const claimId = dependenceQueue[dependenceCursor++];
      for (const childId of evidence.get(claimId)?.children ?? []) {
        if (formalDependence.has(childId)) continue;
        formalDependence.add(childId);
        dependenceQueue.push(childId);
      }
    }
    /** @type {Record<string, unknown>[]} */
    const exploratoryOutput = [];
    for (const candidate of [...exploratory].sort((left, right) =>
      compareCodePoints(String(left.exploratory_id), String(right.exploratory_id)))) {
      const candidateId = String(candidate.exploratory_id);
      let valid = true;
      if (!exploratoryRouteIds.has(candidateId)) {
        valid = false;
        diagnostics.push(diagnostic(
          'traceability', 'EXPLORATORY_ROUTE_MISSING', `/exploratory/${pointerPart(candidateId)}`,
          'Exploratory candidate requires a Task 7 exploratory interaction route'
        ));
      }
      for (const ref of stringArray(candidate.source_claim_ids, true) ?? []) {
        const claim = evidence.get(ref);
        if (!claim) {
          valid = false;
          diagnostics.push(diagnostic(
          'reference', 'EXPLORATORY_EVIDENCE_UNKNOWN', `/exploratory/${pointerPart(String(candidate.exploratory_id))}/source_claim_ids/${pointerPart(ref)}`,
          'Exploratory candidate references unknown risk evidence'
          ));
        } else if (formalDependence.has(ref)) {
          valid = false;
          diagnostics.push(diagnostic(
            'classification', 'EXPLORATORY_FORMAL_EVIDENCE_OVERLAP', `/exploratory/${pointerPart(candidateId)}/source_claim_ids/${pointerPart(ref)}`,
            'formal Test Point evidence cannot be reclassified as an independent risk hypothesis'
          ));
        }
      }
      if (valid) exploratoryOutput.push(structuredClone(candidate));
    }
    const deduplicated = deduplicateCases(uniquelyExecutable, diagnostics);
    if (diagnostics.length > 0) return resultWithDiagnostics(diagnostics);
    return {
      grounded: deduplicated.grounded,
      conditional: deduplicated.conditional,
      blocked: [...blocked.values()].sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id)),
      not_applicable: notApplicable.sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id))),
      exploratory: exploratoryOutput,
      diagnostics: finalizeDiagnostics(diagnostics)
    };
  } catch (error) {
    return resultWithDiagnostics([diagnostic(
      'classification', 'CLASSIFICATION_INPUT_UNREADABLE', '/',
      'classification input could not be read from trusted own data'
    )]);
  }
}
