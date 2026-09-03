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
  obligation: ['obligation_id', 'kind', 'caseable', 'risk', 'scope', 'source_claim_ids', 'view_element_refs', 'required_oracle_refs', 'required_capabilities', 'combination_vector'],
  combinationVector: ['policy_id', 'strength', 'owner', 'assignments', 'forbid_evidence_refs'],
  combinationOwner: ['view_id', 'fact_ids', 'view_element_refs'],
  combinationElementRef: ['view_id', 'element_id'],
  combinationAssignment: ['parameter_id', 'value_id', 'evidence_claim_id'],
  gapObligation: ['obligation_id', 'kind', 'caseable', 'risk', 'scope', 'source_claim_ids', 'view_element_refs', 'required_oracle_refs', 'required_capabilities', 'gap_issue'],
  gapIssue: ['root_issue_id', 'root_issue_key', 'missing_type', 'semantic_refs', 'scope', 'answerable', 'reasons', 'evidence_refs'],
  fact: ['fact_id', 'claim_id', 'status', 'source_claim_ids'],
  conflict: ['conflict_id', 'root_issue_id', 'scope', 'rule_ids', 'source_ids'],
  caseDraft: ['case_id', 'title', 'scope', 'risk', 'role', 'fact_ids', 'obligation_ids', 'source_claim_ids', 'preconditions', 'data', 'steps', 'testability_profile', 'post_state', 'cleanup', 'evidence_refs', 'temporary_assumption', 'execution_signature'],
  role: ['value', 'evidence_ref', 'support_review'],
  precondition: ['condition', 'reachable_from', 'source_claim_ids', 'evidence_ref', 'support_review'],
  data: ['name', 'value', 'provenance', 'support_review'],
  provenance: ['type', 'ref'],
  step: ['step_id', 'action', 'action_evidence_ref', 'support_review', 'expectations'],
  expectation: ['kind', 'expectation_id', 'business_assertion', 'preceding_action_id', 'observer', 'observation_surface', 'observation_target', 'oracle', 'evidence_ref', 'oracle_evidence_refs', 'closes_obligation_id', 'support_review'],
  oracle: ['type', 'expected_value', 'expected_state', 'expected_event', 'expected_side_effect', 'comparison', 'tolerance', 'window'],
  profile: ['capabilities', 'observers', 'controls'],
  capability: ['capability', 'status', 'provenance_ref'],
  observer: ['observer', 'observation_target', 'status', 'provenance_ref'],
  control: ['control', 'status', 'provenance_ref'],
  postState: ['state', 'evidence_ref', 'support_review'],
  cleanup: ['required', 'steps', 'evidence_ref', 'no_cleanup_reason', 'no_cleanup_evidence_ref', 'support_review'],
  temporaryAssumption: ['claim_id', 'invalidation_condition'],
  execution: ['role', 'precondition_state', 'data_partition', 'action_path', 'oracle_refs'],
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
      /** @type {number[]} */
      const numericKeys = [];
      for (const key of stringKeys) {
        if (key === 'length') continue;
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || index >= length || String(index) !== key) {
          validOwnKeys = false;
          addSnapshotDiagnostic(diagnostic('schema', 'UNKNOWN_KEY', `${path}/${pointerPart(key)}`, 'controlled arrays cannot contain named properties'));
        } else numericKeys.push(index);
      }
      if (!validOwnKeys) {
        assign(null);
        continue;
      }
      numericKeys.sort((left, right) => left - right);
      const target = new Array(length);
      seen.set(source, target);
      assign(target);
      let nextExpectedIndex = 0;
      let holesTruncated = false;
      /** @param {number} start @param {number} end */
      const emitHoleGap = (start, end) => {
        if (holesTruncated || start >= end) return;
        const available = Math.max(0, DIAGNOSTIC_LIMIT - 1 - diagnostics.length);
        const emitCount = Math.min(end - start, available);
        for (let offset = 0; offset < emitCount; offset += 1) addSnapshotDiagnostic(diagnostic(
          'schema', 'ARRAY_HOLE', `${path}/${start + offset}`, 'controlled arrays must be dense'
        ));
        if (emitCount < end - start) {
          diagnosticsTruncated = true;
          holesTruncated = true;
        }
      };
      for (const index of numericKeys) {
        emitHoleGap(nextExpectedIndex, index);
        nextExpectedIndex = index + 1;
      }
      emitHoleGap(nextExpectedIndex, length);
      /** @type {Array<{source: unknown, path: string, assign: (value: unknown) => void}>} */
      const children = [];
      for (const index of numericKeys) {
        const descriptor = descriptors[String(index)];
        if (!Object.hasOwn(descriptor, 'value')) {
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

/** @param {Record<string, unknown>} subject */
function normalizedBlockerSubject(subject) {
  if (subject.kind === 'facts') return {
    kind: 'facts', fact_ids: [...(stringArray(subject.fact_ids) ?? [])].sort(compareCodePoints)
  };
  if (subject.kind === 'view-elements') return {
    kind: 'view-elements',
    view_element_refs: [...(objectArray(subject.view_element_refs) ?? [])]
      .map((ref) => ({ view_id: ref.view_id, element_id: ref.element_id }))
      .sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right)))
  };
  if (subject.kind === 'capabilities') return {
    kind: 'capabilities', capabilities: [...(stringArray(subject.capabilities) ?? [])].sort(compareCodePoints)
  };
  return {
    kind: 'evidence-conflict', claim_refs: [...(stringArray(subject.claim_refs) ?? [])].sort(compareCodePoints)
  };
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

/** @param {Record<string, unknown>} step @param {Record<string, unknown>} expectation */
function oracleSemanticId(step, expectation) {
  const oracle = isRecord(expectation.oracle) ? expectation.oracle : {};
  const type = String(oracle.type ?? '');
  const expectedField = ORACLE_FIELDS[/** @type {keyof typeof ORACLE_FIELDS} */ (type)];
  return stableId('oracle', {
    action: normalizeSemanticString(step.action),
    observer: normalizeSemanticString(expectation.observer),
    observation_surface: normalizeSemanticString(expectation.observation_surface),
    observation_target: normalizeSemanticString(expectation.observation_target),
    oracle: {
      type,
      ...(expectedField ? { [expectedField]: normalizeSemanticString(oracle[expectedField]) } : {}),
      comparison: normalizeSemanticString(oracle.comparison),
      ...(oracle.tolerance === undefined ? {} : { tolerance: oracle.tolerance }),
      ...(oracle.window === undefined ? {} : { window: normalizeSemanticString(oracle.window) })
    }
  });
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
      (objectArray(step.expectations) ?? []).map((expectation) => oracleSemanticId(step, expectation))
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
    checkKeys(obligation, obligation?.kind === 'requirement-gap' ? KEYS.gapObligation : KEYS.obligation, `/obligations/obligations/${index}`, diagnostics);
    if (!isRecord(obligation)) return;
    if (obligation.kind === 'requirement-gap' && isRecord(obligation.gap_issue)) checkKeys(
      obligation.gap_issue, KEYS.gapIssue, `/obligations/obligations/${index}/gap_issue`, diagnostics
    );
    if (isRecord(obligation.combination_vector)) {
      const vectorPath = `/obligations/obligations/${index}/combination_vector`;
      checkKeys(obligation.combination_vector, KEYS.combinationVector, vectorPath, diagnostics);
      if (isRecord(obligation.combination_vector.owner)) {
        checkKeys(obligation.combination_vector.owner, KEYS.combinationOwner, `${vectorPath}/owner`, diagnostics);
        objectArray(obligation.combination_vector.owner.view_element_refs)?.forEach((item, itemIndex) => {
          checkKeys(item, KEYS.combinationElementRef, `${vectorPath}/owner/view_element_refs/${itemIndex}`, diagnostics);
        });
      }
      objectArray(obligation.combination_vector.assignments)?.forEach((item, itemIndex) => {
        checkKeys(item, KEYS.combinationAssignment, `${vectorPath}/assignments/${itemIndex}`, diagnostics);
        checkCanonical(item.evidence_claim_id, `${vectorPath}/assignments/${itemIndex}/evidence_claim_id`, diagnostics);
      });
    }
    for (const [field, value] of [['obligation_id', obligation.obligation_id], ['scope', obligation.scope]]) {
      checkCanonical(value, `/obligations/obligations/${index}/${field}`, diagnostics);
    }
    const capabilities = Array.isArray(obligation.required_capabilities) ? obligation.required_capabilities : [];
    capabilities.forEach((item, itemIndex) => checkCanonical(item, `/obligations/obligations/${index}/required_capabilities/${itemIndex}`, diagnostics));
  });
  obligations.fact_routes.forEach((route, index) => {
    if (!isRecord(route)) return;
    const allowed = route.route_type === 'obligations' ? ['fact_id', 'route_type', 'obligation_ids']
      : route.route_type === 'blocked' ? ['fact_id', 'route_type', 'blocker_root_issue_id', 'gap_obligation_id']
        : ['fact_id', 'route_type', 'not_applicable_claim_id'];
    checkKeys(route, allowed, `/obligations/fact_routes/${index}`, diagnostics);
  });
  obligations.interaction_routes.forEach((route, index) => {
    if (!isRecord(route)) return;
    const allowed = route.route_type === 'formal-view' ? ['candidate_id', 'route_type', 'formal_view_id']
      : route.route_type === 'blocked' ? ['candidate_id', 'route_type', 'blocker_root_issue_id', 'gap_obligation_id']
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
      : disposition.status === 'blocker' ? ['status', 'affected_obligation_ids', 'issue_intent', 'subject']
        : disposition.status === 'not_applicable' ? ['obligation_id', 'status', 'exclusion_claim_id', 'scope', 'support_review']
          : ['obligation_id', 'status', 'case_ids', 'blocker_root_issue_id', 'evidence_refs', 'exclusion_claim_id', 'scope', 'support_review'];
    checkKeys(disposition, allowed, `/caseDrafts/obligation_dispositions/${index}`, diagnostics);
    if (disposition.status === 'blocker') {
      if (isRecord(disposition.issue_intent)) checkKeys(
        disposition.issue_intent,
        ['missing_type', 'scope', 'answerable', 'risk', 'reasons', 'evidence_refs'],
        `/caseDrafts/obligation_dispositions/${index}/issue_intent`, diagnostics
      );
      if (isRecord(disposition.subject)) {
        const subjectAllowed = disposition.subject.kind === 'facts' ? ['kind', 'fact_ids']
          : disposition.subject.kind === 'view-elements' ? ['kind', 'view_element_refs']
            : disposition.subject.kind === 'capabilities' ? ['kind', 'capabilities']
              : ['kind', 'claim_refs'];
        checkKeys(disposition.subject, subjectAllowed, `/caseDrafts/obligation_dispositions/${index}/subject`, diagnostics);
      }
    }
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

/** @param {Record<string, unknown>} claim */
function isTypedOracleClaim(claim) {
  if (claim.level === 'E3' && claim.kind === 'requirement') return true;
  if (claim.level === 'E1' && claim.kind === 'assumption') return true;
  return claim.level === 'E2' && claim.kind === 'expected-value'
    && claim.derivation_target === 'expected-value'
    && (claim.derivation_kind === 'formula' || claim.derivation_kind === 'decision-table-instance');
}

/**
 * Precompute the legal closed Oracle seam for every obligation. Direct
 * obligation sources/prebindings are legal typed Oracles; only accepted E2
 * expected-value descendants may extend that closure.
 * @param {Map<string, ClaimAssessment>} evidence
 * @param {Record<string, unknown>[]} obligations
 * @param {Map<string, Set<string>>} routedFactsByObligation
 * @param {Map<string, Record<string, unknown>>} factsById
 */
function buildOracleReachability(evidence, obligations, routedFactsByObligation, factsById) {
  /** @type {Map<string, Set<string>>} */
  const allowedRefsByObligation = new Map();
  /** @type {Map<string, Set<string>>} */
  const forbiddenRefsByObligation = new Map();
  /** @type {Map<string, Set<string>>} */
  const descendantsByRootSignature = new Map();
  for (const obligation of obligations) {
    const obligationId = String(obligation.obligation_id ?? '');
    const factRoots = [...(routedFactsByObligation.get(obligationId) ?? [])].flatMap((factId) => {
      const fact = factsById.get(factId);
      return fact ? [String(fact.claim_id), ...(stringArray(fact.source_claim_ids) ?? [])] : [];
    });
    const roots = new Set([
      ...(stringArray(obligation.source_claim_ids) ?? []),
      ...(stringArray(obligation.required_oracle_refs) ?? []),
      ...factRoots
    ]);
    const vector = isRecord(obligation.combination_vector) ? obligation.combination_vector : {};
    const forbidden = new Set(stringArray(vector.forbid_evidence_refs) ?? []);
    const rootSignature = canonicalStringify([...roots].sort(compareCodePoints));
    let descendants = descendantsByRootSignature.get(rootSignature);
    if (!descendants) {
      descendants = new Set();
      const pending = [...roots];
      let cursor = 0;
      while (cursor < pending.length) {
        const current = pending[cursor++];
        if (descendants.has(current)) continue;
        descendants.add(current);
        for (const childId of evidence.get(current)?.children ?? []) pending.push(childId);
      }
      descendantsByRootSignature.set(rootSignature, descendants);
    }
    const allowed = new Set();
    for (const [claimId, assessment] of evidence) {
      const claim = assessment.claim;
      if (assessment.rank === 0 || assessment.reasons.length > 0 || !isTypedOracleClaim(claim)
        || !scopeContains(String(claim.scope ?? ''), String(obligation.scope ?? ''))) continue;
      if (roots.has(claimId) || (claim.level === 'E2' && descendants.has(claimId))) {
        allowed.add(claimId);
      }
    }
    for (const ref of forbidden) allowed.delete(ref);
    allowedRefsByObligation.set(obligationId, allowed);
    forbiddenRefsByObligation.set(obligationId, forbidden);
  }
  return { allowedRefsByObligation, forbiddenRefsByObligation };
}

/**
 * Enforce the explicit one-to-one obligation-oracle closure. Auxiliary
 * expectations pass the same evidence gate but never close formal coverage.
 * @param {Record<string, unknown>} draft
 * @param {Record<string, unknown>[]} obligations
 * @param {Array<{expectationId: string, evidenceRef: string, kind:string, closesObligationId:string, oracleEvidenceRefs:string[],oracleEvidenceValid:boolean}>} expectations
 * @param {{allowedRefsByObligation: Map<string, Set<string>>,forbiddenRefsByObligation: Map<string, Set<string>>}} reachability
 * @param {Set<string>} reasons
 * @param {Diagnostic[]} diagnostics
 */
function requireOracleOwnership(draft, obligations, expectations, reachability, reasons, diagnostics) {
  const casePath = `/caseDrafts/cases/${pointerPart(String(draft.case_id))}`;
  const obligationsById = new Map(obligations.map((obligation) => [String(obligation.obligation_id), obligation]));
  const closedCounts = new Map([...obligationsById.keys()].map((obligationId) => [obligationId, 0]));
  for (const expectation of expectations) {
    const path = `${casePath}/expectations/${pointerPart(expectation.expectationId)}`;
    if (expectation.oracleEvidenceValid && !expectation.oracleEvidenceRefs.includes(expectation.evidenceRef)) {
      diagnostics.push(diagnostic('traceability', 'ORACLE_PRIMARY_EVIDENCE_NOT_DECLARED', path, 'evidence_ref must be included in oracle_evidence_refs'));
      reasons.add('ORACLE_PRIMARY_EVIDENCE_NOT_DECLARED');
    }
    if (expectation.kind === 'obligation-oracle') {
      const obligation = obligationsById.get(expectation.closesObligationId);
      if (!obligation || obligation.caseable !== true || obligation.kind === 'requirement-gap') {
        diagnostics.push(diagnostic('reference', 'ORACLE_CLOSE_TARGET_INVALID', path, 'obligation-oracle must close one linked caseable obligation'));
        reasons.add('ORACLE_CLOSE_TARGET_INVALID');
        continue;
      }
      closedCounts.set(expectation.closesObligationId, (closedCounts.get(expectation.closesObligationId) ?? 0) + 1);
      if (!expectation.oracleEvidenceValid) continue;
      const allowed = reachability.allowedRefsByObligation.get(expectation.closesObligationId) ?? new Set();
      const forbidden = reachability.forbiddenRefsByObligation.get(expectation.closesObligationId) ?? new Set();
      const required = stringArray(obligation.required_oracle_refs) ?? [];
      if (required.some((ref) => !expectation.oracleEvidenceRefs.includes(ref))) {
        diagnostics.push(diagnostic('traceability', 'OBLIGATION_ORACLE_PREBINDING_MISSING', path, 'the closing expectation must include every required Oracle prebinding'));
        reasons.add('OBLIGATION_ORACLE_PREBINDING_MISSING');
      }
      if (expectation.oracleEvidenceRefs.some((ref) => forbidden.has(ref))) {
        diagnostics.push(diagnostic('traceability', 'OBLIGATION_ORACLE_EVIDENCE_FORBIDDEN', path, 'forbid evidence cannot become a selected-vector Oracle'));
        reasons.add('OBLIGATION_ORACLE_EVIDENCE_FORBIDDEN');
      } else if (expectation.oracleEvidenceRefs.some((ref) => !allowed.has(ref))) {
        diagnostics.push(diagnostic('traceability', 'OBLIGATION_ORACLE_EVIDENCE_UNRELATED', path, 'Oracle evidence must belong to the obligation closure or legal E2 expected-value ancestry'));
        reasons.add('OBLIGATION_ORACLE_EVIDENCE_UNRELATED');
      }
    } else if (expectation.kind === 'auxiliary') {
      if (!expectation.oracleEvidenceValid) continue;
      const allowed = new Set([...obligationsById.keys()].flatMap((obligationId) => [
        ...(reachability.allowedRefsByObligation.get(obligationId) ?? [])
      ]));
      if (expectation.closesObligationId || expectation.oracleEvidenceRefs.some((ref) => !allowed.has(ref))) {
        diagnostics.push(diagnostic('traceability', 'AUXILIARY_ORACLE_EVIDENCE_UNRELATED', path, 'auxiliary expectations cannot close obligations and must use legal Case Oracle evidence'));
        reasons.add('AUXILIARY_ORACLE_EVIDENCE_UNRELATED');
      }
    } else {
      diagnostics.push(diagnostic('classification', 'EXPECTATION_KIND_INVALID', path, 'expectation kind must be obligation-oracle or auxiliary'));
      reasons.add('EXPECTATION_KIND_INVALID');
    }
  }
  for (const [obligationId, count] of closedCounts) {
    if (count !== 1) {
      diagnostics.push(diagnostic(
        'traceability', count === 0 ? 'OBLIGATION_ORACLE_EXPECTATION_UNMAPPED' : 'OBLIGATION_ORACLE_EXPECTATION_DUPLICATE',
        `${casePath}/obligations/${pointerPart(obligationId)}`,
        count === 0 ? 'every linked caseable obligation requires exactly one closing expectation' : 'a linked obligation cannot be closed by multiple expectations'
      ));
      reasons.add(count === 0 ? 'OBLIGATION_ORACLE_EXPECTATION_UNMAPPED' : 'OBLIGATION_ORACLE_EXPECTATION_DUPLICATE');
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

/** @param {Record<string, unknown>} draft @param {Record<string, unknown>[]} obligations @param {string[]} routedFactIds @param {Map<string, Record<string, unknown>[]>} routesByFact @param {Map<string, Record<string, unknown>>} factsById @param {Map<string, ClaimAssessment>} evidence @param {Map<string, EvidenceResult>} evidenceCache @param {{allowedRefsByObligation: Map<string, Set<string>>,forbiddenRefsByObligation: Map<string, Set<string>>}} oracleReachability @param {Record<string, unknown>[]} conflicts @param {Diagnostic[]} diagnostics */
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
  /** @type {Array<{expectationId: string, evidenceRef: string, kind:string, closesObligationId:string, oracleEvidenceRefs:string[],oracleEvidenceValid:boolean}>} */
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
      const oracleEvidenceRefs = stringArray(expectation.oracle_evidence_refs, true);
      const expectationFieldsValid = isNonblank(expectation.business_assertion) && isCanonicalString(expectation.preceding_action_id)
        && isNonblank(expectation.observer) && isNonblank(expectation.observation_surface)
        && isNonblank(expectation.observation_target) && isCanonicalString(expectation.evidence_ref)
        && oracleEvidenceRefs !== null
        && (expectation.kind === 'auxiliary' || (expectation.kind === 'obligation-oracle'
          && isCanonicalString(expectation.closes_obligation_id)));
      if (!expectationFieldsValid) reasons.add('EXPECTATION_GATE_INVALID');
      if (isCanonicalString(expectation.evidence_ref)) evidenceRoots.add(expectation.evidence_ref);
      for (const ref of oracleEvidenceRefs ?? []) {
        evidenceRoots.add(ref);
        formalEvidenceRoots.add(ref);
      }
      const closureDeclarationValid = expectation.kind === 'auxiliary'
        || (expectation.kind === 'obligation-oracle' && isCanonicalString(expectation.closes_obligation_id));
      if (expectationLocatable && closureDeclarationValid) {
        expectationsForOwnership.push({
          expectationId: /** @type {string} */ (expectation.expectation_id),
          evidenceRef: isCanonicalString(expectation.evidence_ref) ? String(expectation.evidence_ref) : '',
          kind: String(expectation.kind),
          closesObligationId: String(expectation.closes_obligation_id ?? ''),
          oracleEvidenceRefs: oracleEvidenceRefs ?? [],
          oracleEvidenceValid: isCanonicalString(expectation.evidence_ref) && oracleEvidenceRefs !== null
        });
      }
      if (expectationFieldsValid && expectationLocatable) {
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
  if (steps.some((step) => (objectArray(step.expectations)?.length ?? 0) > 0)) {
    requireOracleOwnership(draft, obligations, expectationsForOwnership, oracleReachability, reasons, diagnostics);
  }

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
  const actualSignature = JSON.parse(executionSignature(draft));
  const actualAgentOracleRefs = [...expectationIds].sort(compareCodePoints);
  const signatureMismatch = signature.precondition_state !== actualSignature.precondition_state
    || signature.data_partition !== actualSignature.data_partition
    || submittedRole !== actualSignature.role
    || canonicalStringify(submittedActions) !== canonicalStringify(actualSignature.action_path)
    || canonicalStringify(submittedOracles) !== canonicalStringify(actualAgentOracleRefs);
  if (signatureMismatch) {
    diagnostics.push(diagnostic(
      'traceability', 'CASE_EXECUTION_SIGNATURE_MISMATCH',
      `/caseDrafts/cases/${pointerPart(String(draft.case_id))}/execution_signature`,
      'Agent execution_signature must exactly summarize role, preconditions, data, ordered actions, and expectation IDs'
    ));
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
  const ignored = new Set([
    'case_id', 'fact_ids', 'obligation_ids', 'source_claim_ids', 'evidence_refs',
    'oracle_evidence_refs', 'support_review', 'expectation_id',
    'closes_obligation_id', 'step_id', 'preceding_action_id', 'execution_signature'
  ]);
  /** @param {unknown} value @param {(string|number)[]} path @returns {unknown} */
  const strip = (value, path = []) => {
    if (Array.isArray(value)) return value.map((item, index) => strip(item, [...path, index]));
    if (!isRecord(value)) return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => (
      !ignored.has(key) && !(key === 'evidence_ref' && path.includes('expectations'))
    )).map(([key, item]) => [key, strip(item, [...path, key])]));
  };
  return canonicalStringify(strip(copy));
}

/** @param {Record<string, unknown>[]} drafts */
function mergeExactCases(drafts) {
  const sorted = [...drafts].sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id)));
  const merged = structuredClone(sorted[0]);
  for (const field of ['fact_ids', 'obligation_ids', 'source_claim_ids', 'evidence_refs']) {
    const values = new Set(sorted.flatMap((draft) => stringArray(draft[field]) ?? []));
    merged[field] = [...values].sort(compareCodePoints);
  }
  const mergedPreconditions = new Map((objectArray(merged.preconditions) ?? []).map((precondition) => [
    canonicalStringify({ condition: precondition.condition, reachable_from: precondition.reachable_from }),
    precondition
  ]));
  for (const draft of sorted) {
    for (const precondition of objectArray(draft.preconditions) ?? []) {
      const target = mergedPreconditions.get(canonicalStringify({
        condition: precondition.condition, reachable_from: precondition.reachable_from
      }));
      if (!target) continue;
      target.source_claim_ids = [...new Set([
        ...(stringArray(target.source_claim_ids) ?? []),
        ...(stringArray(precondition.source_claim_ids) ?? [])
      ])].sort(compareCodePoints);
    }
  }
  const mergedSteps = objectArray(merged.steps) ?? [];
  for (const [stepIndex, step] of mergedSteps.entries()) {
    const expectationsByClosure = new Map();
    for (const draft of sorted) {
      const sourceStep = (objectArray(draft.steps) ?? [])[stepIndex];
      if (!sourceStep) continue;
      for (const expectation of objectArray(sourceStep.expectations) ?? []) {
        const oracleId = oracleSemanticId(sourceStep, expectation);
        const closureKey = canonicalStringify({
          oracle_id: oracleId, kind: expectation.kind,
          ...(expectation.kind === 'obligation-oracle'
            ? { closes_obligation_id: expectation.closes_obligation_id } : {})
        });
        const existing = expectationsByClosure.get(closureKey);
        if (!existing) expectationsByClosure.set(closureKey, structuredClone(expectation));
        else {
          existing.oracle_evidence_refs = [...new Set([
            ...(stringArray(existing.oracle_evidence_refs) ?? []),
            ...(stringArray(expectation.oracle_evidence_refs) ?? [])
          ])].sort(compareCodePoints);
          const evidenceRefs = [existing.evidence_ref, expectation.evidence_ref]
            .filter(isCanonicalString).sort(compareCodePoints);
          existing.evidence_ref = evidenceRefs[0] ?? '';
        }
      }
    }
    step.expectations = [...expectationsByClosure.entries()]
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([closureKey, expectation]) => ({
        ...expectation,
        preceding_action_id: step.step_id,
        expectation_id: stableId('expectation', JSON.parse(closureKey))
      }));
  }
  const signature = JSON.parse(executionSignature(merged));
  merged.case_id = stableId('case', signature);
  if (isRecord(merged.execution_signature)) {
    merged.execution_signature = signature;
  }
  return merged;
}

/** @param {Record<string, unknown>} draft */
function ownershipExpectations(draft) {
  /** @type {Array<{expectationId: string, evidenceRef: string, kind:string, closesObligationId:string, oracleEvidenceRefs:string[],oracleEvidenceValid:boolean}>} */
  const expectations = [];
  for (const step of objectArray(draft.steps) ?? []) {
    for (const expectation of objectArray(step.expectations) ?? []) {
      const oracleEvidenceRefs = stringArray(expectation.oracle_evidence_refs, true);
      if (isCanonicalString(expectation.expectation_id) && isCanonicalString(expectation.evidence_ref)
        && oracleEvidenceRefs) {
        expectations.push({
          expectationId: String(expectation.expectation_id),
          evidenceRef: String(expectation.evidence_ref),
          kind: String(expectation.kind),
          closesObligationId: String(expectation.closes_obligation_id ?? ''),
          oracleEvidenceRefs,
          oracleEvidenceValid: true
        });
      }
    }
  }
  return expectations;
}

/** @param {Array<{draft: Record<string, unknown>, rank: number}>} executable @param {Map<string, Record<string, unknown>>} obligationsById @param {{allowedRefsByObligation: Map<string, Set<string>>,forbiddenRefsByObligation: Map<string, Set<string>>}} oracleReachability @param {(draft:Record<string,unknown>)=>{rank:number}} evaluateMerged @param {Diagnostic[]} diagnostics */
function deduplicateCases(executable, obligationsById, oracleReachability, evaluateMerged, diagnostics) {
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
    const mergedObligations = (stringArray(merged.obligation_ids, true) ?? []).flatMap((obligationId) => {
      const obligation = obligationsById.get(obligationId);
      return obligation ? [obligation] : [];
    });
    const ownershipReasons = new Set();
    requireOracleOwnership(
      merged, mergedObligations, ownershipExpectations(merged),
      oracleReachability, ownershipReasons, diagnostics
    );
    if (ownershipReasons.size > 0) continue;
    const diagnosticsBeforeEvaluation = diagnostics.length;
    const mergedEvaluation = evaluateMerged(merged);
    if (mergedEvaluation.rank === 0 || diagnostics.length > diagnosticsBeforeEvaluation) continue;
    if (mergedEvaluation.rank !== items[0].rank) {
      diagnostics.push(diagnostic(
        'classification', 'DUPLICATE_SIGNATURE_LANE_CONFLICT',
        `/execution_signatures/${pointerPart(stableId('execution', JSON.parse(signature)))}`,
        'same execution signature cannot change lane after lossless association merging'
      ));
      continue;
    }
    (mergedEvaluation.rank === 2 ? grounded : conditional).push(merged);
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
    const submittedDispositions = /** @type {Record<string, unknown>[]} */ (draftArtifact.obligation_dispositions);
    const exploratory = /** @type {Record<string, unknown>[]} */ (draftArtifact.exploratory_candidates);
    const factRoutes = /** @type {Record<string, unknown>[]} */ (obligationArtifact.fact_routes);
    const interactionRoutes = /** @type {Record<string, unknown>[]} */ (obligationArtifact.interaction_routes);
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
      if (obligation.kind === 'requirement-gap') {
        if (obligation.caseable !== false || !isRecord(obligation.gap_issue)) diagnostics.push(diagnostic(
          'classification', 'REQUIREMENT_GAP_CONTRACT_INVALID', `/obligations/${pointerPart(id)}`,
          'compiler-owned requirement gaps must be non-caseable and contain a gap issue'
        ));
        else {
          const signature = {
            missing_type: obligation.gap_issue.missing_type,
            semantic_refs: stringArray(obligation.gap_issue.semantic_refs) ?? [],
            scope: obligation.gap_issue.scope
          };
          if (obligation.gap_issue.root_issue_key !== canonicalStringify(signature)
            || obligation.gap_issue.root_issue_id !== stableId('root', signature)) diagnostics.push(diagnostic(
            'traceability', 'REQUIREMENT_GAP_ROOT_INVALID', `/obligations/${pointerPart(id)}/gap_issue`,
            'compiler-owned gap root key and ID must match its immutable semantic identity'
          ));
        }
      } else if (obligation.caseable !== true) diagnostics.push(diagnostic(
        'classification', 'CASEABLE_OBLIGATION_CONTRACT_INVALID', `/obligations/${pointerPart(id)}/caseable`,
        'normal compiler-owned obligations must be caseable'
      ));
      const vector = isRecord(obligation.combination_vector) ? obligation.combination_vector : null;
      if (vector) {
        const sourceClaims = new Set(stringArray(obligation.source_claim_ids) ?? []);
        for (const [assignmentIndex, assignment] of (objectArray(vector.assignments) ?? []).entries()) {
          const claimId = String(assignment.evidence_claim_id ?? '');
          const assessment = evidence.get(claimId);
          if (!sourceClaims.has(claimId)) diagnostics.push(diagnostic(
            'traceability', 'TWISE_SELECTED_VALUE_SOURCE_MISSING',
            `/obligations/${pointerPart(id)}/combination_vector/assignments/${assignmentIndex}/evidence_claim_id`,
            'every selected-value evidence claim must be carried by the vector obligation sources'
          ));
          if (!assessment || assessment.rank === 0 || assessment.reasons.length > 0
            || assessment.claim.kind === 'diagnostic'
            || typeof assessment.claim.scope !== 'string' || typeof obligation.scope !== 'string'
            || !scopeContains(assessment.claim.scope, obligation.scope)) diagnostics.push(diagnostic(
            'traceability', 'TWISE_SELECTED_VALUE_EVIDENCE_INVALID',
            `/obligations/${pointerPart(id)}/combination_vector/assignments/${assignmentIndex}/evidence_claim_id`,
            'selected-value evidence must be accepted, non-diagnostic, and cover the obligation scope'
          ));
        }
        const forbidden = new Set(stringArray(vector.forbid_evidence_refs) ?? []);
        for (const ref of stringArray(obligation.required_oracle_refs) ?? []) if (forbidden.has(ref)) diagnostics.push(diagnostic(
          'traceability', 'TWISE_ORACLE_FORBID_CONFLICT',
          `/obligations/${pointerPart(id)}/required_oracle_refs/${pointerPart(ref)}`,
          'forbid evidence cannot be an Oracle prebinding'
        ));
      }
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
      if (route.route_type === 'blocked') {
        const gapId = typeof route.gap_obligation_id === 'string' ? route.gap_obligation_id : '';
        const gap = obligationsById.get(gapId);
        if (!gap || gap.kind !== 'requirement-gap' || gap.caseable !== false) diagnostics.push(diagnostic(
          'reference', 'FACT_ROUTE_GAP_UNKNOWN', `/obligations/fact_routes/${routeIndex}/gap_obligation_id`,
          'blocked fact route must reference one compiler-owned requirement gap'
        ));
        else {
          const routed = routedFactsByObligation.get(gapId) ?? new Set();
          routed.add(factId);
          routedFactsByObligation.set(gapId, routed);
          if (!isRecord(gap.gap_issue) || gap.gap_issue.root_issue_id !== route.blocker_root_issue_id) diagnostics.push(diagnostic(
            'traceability', 'FACT_ROUTE_GAP_ROOT_MISMATCH', `/obligations/fact_routes/${routeIndex}`,
            'blocked fact route root must equal its compiler-owned gap root'
          ));
        }
        continue;
      }
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
    for (const obligation of obligations) {
      const obligationId = String(obligation.obligation_id ?? '');
      const vector = isRecord(obligation.combination_vector) ? obligation.combination_vector : null;
      if (!vector) continue;
      const assignments = objectArray(vector.assignments) ?? [];
      const parameterIds = assignments.map((assignment) => String(assignment.parameter_id ?? ''));
      const validStrength = Number.isSafeInteger(vector.strength)
        && Number(vector.strength) >= 2 && Number(vector.strength) <= assignments.length;
      if (vector.policy_id !== 'twise-candidate-cap-v1' || !validStrength
        || new Set(parameterIds).size !== parameterIds.length
        || obligation.kind !== 'interaction' || obligation.caseable !== true) diagnostics.push(diagnostic(
        'traceability', 'TWISE_VECTOR_CONTRACT_INVALID',
        `/obligations/${pointerPart(obligationId)}/combination_vector`,
        'selected vectors must use the frozen policy, strength within unique assignments, and caseable interaction obligations'
      ));
      const sourceClaims = new Set(stringArray(obligation.source_claim_ids) ?? []);
      const owner = isRecord(vector.owner) ? vector.owner : {};
      const routedFacts = routedFactsByObligation.get(obligationId) ?? new Set();
      for (const factId of stringArray(owner.fact_ids) ?? []) {
        if (!routedFacts.has(factId)) diagnostics.push(diagnostic(
          'traceability', 'TWISE_OWNER_FACT_ROUTE_MISSING',
          `/obligations/${pointerPart(obligationId)}/combination_vector/owner/fact_ids/${pointerPart(factId)}`,
          'every selected-vector owner fact must route to the vector obligation'
        ));
        const fact = factsById.get(factId);
        for (const ref of fact ? [String(fact.claim_id), ...(stringArray(fact.source_claim_ids) ?? [])] : []) {
          if (!sourceClaims.has(ref)) diagnostics.push(diagnostic(
            'traceability', 'TWISE_OWNER_SOURCE_MISSING',
            `/obligations/${pointerPart(obligationId)}/source_claim_ids`,
            'selected-vector sources must inherit every owner fact root'
          ));
        }
      }
      const viewRefs = new Set(stringArray(obligation.view_element_refs) ?? []);
      const ownerViewId = String(owner.view_id ?? '');
      for (const ref of objectArray(owner.view_element_refs) ?? []) {
        if (String(ref.view_id ?? '') !== ownerViewId) diagnostics.push(diagnostic(
          'traceability', 'TWISE_OWNER_VIEW_MISMATCH',
          `/obligations/${pointerPart(obligationId)}/combination_vector/owner/view_element_refs`,
          'every selected-vector owner element must belong to the single named owner view'
        ));
        const qualified = `${String(ref.view_id ?? '')}#${String(ref.element_id ?? '')}`;
        if (!viewRefs.has(qualified)) diagnostics.push(diagnostic(
          'traceability', 'TWISE_OWNER_ELEMENT_REF_MISSING',
          `/obligations/${pointerPart(obligationId)}/combination_vector/owner/view_element_refs`,
          'selected-vector obligations must inherit every owner view element reference'
        ));
      }
    }
    const oracleReachability = buildOracleReachability(
      evidence, obligations, routedFactsByObligation, factsById
    );
    /** @type {Record<string, unknown>[]} */
    const dispositions = [];
    /** @type {Map<number, string[]>} */
    const blockerAffectedBySubmittedIndex = new Map();
    for (const [index, submitted] of submittedDispositions.entries()) {
      if (submitted.status !== 'blocker') {
        dispositions.push(submitted);
        continue;
      }
      const affected = stringArray(submitted.affected_obligation_ids, true);
      if (!affected) {
        diagnostics.push(diagnostic(
          'schema', 'BLOCKER_AFFECTED_OBLIGATIONS_INVALID', `/obligation_dispositions/${index}/affected_obligation_ids`,
          'grouped blocker requires a nonempty dense unique affected obligation list'
        ));
        continue;
      }
      const intent = isRecord(submitted.issue_intent) ? submitted.issue_intent : {};
      const subject = isRecord(submitted.subject) ? submitted.subject : {};
      const signature = {
        missing_type: intent.missing_type,
        semantic_refs: [canonicalStringify(normalizedBlockerSubject(subject))],
        scope: intent.scope
      };
      const rootIssueId = stableId('root', signature);
      blockerAffectedBySubmittedIndex.set(index, affected);
      for (const obligationId of affected) dispositions.push({
        obligation_id: obligationId, status: 'blocker',
        blocker_root_issue_id: rootIssueId,
        evidence_refs: intent.evidence_refs,
        issue_intent: intent, subject, submitted_index: index
      });
    }
    for (const obligation of obligations) {
      if (obligation.kind !== 'requirement-gap' || !isRecord(obligation.gap_issue)) continue;
      dispositions.push({
        obligation_id: obligation.obligation_id, status: 'blocker',
        blocker_root_issue_id: obligation.gap_issue.root_issue_id,
        evidence_refs: stringArray(obligation.gap_issue.evidence_refs) ?? [],
        compiler_gap: true, issue_intent: obligation.gap_issue
      });
    }
    for (const [routeIndex, route] of interactionRoutes.entries()) {
      if (route.route_type !== 'blocked') continue;
      const gap = obligationsById.get(String(route.gap_obligation_id ?? ''));
      if (!gap || gap.kind !== 'requirement-gap' || gap.caseable !== false) diagnostics.push(diagnostic(
        'reference', 'INTERACTION_ROUTE_GAP_UNKNOWN', `/obligations/interaction_routes/${routeIndex}/gap_obligation_id`,
        'blocked interaction route must reference one compiler-owned requirement gap'
      ));
      else if (!isRecord(gap.gap_issue) || gap.gap_issue.root_issue_id !== route.blocker_root_issue_id) diagnostics.push(diagnostic(
        'traceability', 'INTERACTION_ROUTE_GAP_ROOT_MISMATCH', `/obligations/interaction_routes/${routeIndex}`,
        'blocked interaction route root must equal its compiler-owned gap root'
      ));
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
    const validatedBlockerGroups = new Set();
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
      const obligation = obligationsById.get(obligationId);
      if (obligation?.caseable === false && !disposition.compiler_gap) diagnostics.push(diagnostic(
        'classification', 'REQUIREMENT_GAP_AGENT_DISPOSITION_FORBIDDEN', `/obligation_dispositions/${pointerPart(obligationId)}`,
        'Agent case drafts must not resubmit a compiler-owned requirement gap disposition'
      ));
      if (disposition.status === 'blocker' && !disposition.compiler_gap
        && !validatedBlockerGroups.has(disposition.submitted_index)) {
        validatedBlockerGroups.add(disposition.submitted_index);
        const subject = isRecord(disposition.subject) ? disposition.subject : {};
        const intent = isRecord(disposition.issue_intent) ? disposition.issue_intent : {};
        const affected = blockerAffectedBySubmittedIndex.get(
          /** @type {number} */ (disposition.submitted_index)
        ) ?? [];
        const linked = affected.flatMap((id) => obligationsById.has(id)
          ? [/** @type {Record<string, unknown>} */ (obligationsById.get(id))] : []);
        if (linked.some((item) => item.caseable !== true)) diagnostics.push(diagnostic(
          'classification', 'BLOCKER_AFFECTED_OBLIGATION_NOT_CASEABLE', `/obligation_dispositions/${disposition.submitted_index}/affected_obligation_ids`,
          'case-draft blocker groups may affect only compiler-derived caseable obligations'
        ));
        if (linked.some((item) => !scopeContains(String(intent.scope ?? ''), String(item.scope ?? '')))) diagnostics.push(diagnostic(
          'classification', 'BLOCKER_SCOPE_MISMATCH', `/obligation_dispositions/${disposition.submitted_index}/issue_intent/scope`,
          'case-draft blocker scope must cover every affected obligation scope'
        ));
        let reachable = false;
        if (subject.kind === 'facts') {
          const refs = stringArray(subject.fact_ids, true) ?? [];
          reachable = refs.length > 0
            && refs.every((factId) => factsById.has(factId)
              && affected.some((id) => routedFactsByObligation.get(id)?.has(factId)))
            && affected.every((id) => refs.some((factId) => routedFactsByObligation.get(id)?.has(factId)));
        }
        else if (subject.kind === 'view-elements') {
          const refs = objectArray(subject.view_element_refs)?.map((ref) => `${String(ref.view_id)}#${String(ref.element_id)}`) ?? [];
          reachable = refs.length > 0
            && refs.every((ref) => linked.some((item) => (stringArray(item.view_element_refs) ?? []).includes(ref)))
            && linked.every((item) => refs.some((ref) => (stringArray(item.view_element_refs) ?? []).includes(ref)));
        } else if (subject.kind === 'capabilities') {
          const capabilities = stringArray(subject.capabilities, true) ?? [];
          reachable = capabilities.length > 0
            && capabilities.every((capability) => linked.some((item) => (stringArray(item.required_capabilities) ?? []).includes(capability)))
            && linked.every((item) => capabilities.some((capability) => (stringArray(item.required_capabilities) ?? []).includes(capability)));
        }
        else if (subject.kind === 'evidence-conflict') {
          const refs = stringArray(subject.claim_refs, true) ?? [];
          const relatedByObligation = linked.map((item) => relatedEvidenceClosure([
            ...(stringArray(item.source_claim_ids) ?? []), ...(stringArray(item.required_oracle_refs) ?? [])
          ], evidence, evidenceCache, relatedEvidenceCache));
          reachable = refs.length > 0
            && refs.every((ref) => evidence.has(ref) && relatedByObligation.some((related) => related.has(ref)))
            && relatedByObligation.every((related) => refs.some((ref) => related.has(ref)));
        }
        if (!reachable) diagnostics.push(diagnostic(
          'traceability', 'BLOCKER_SUBJECT_UNREACHABLE', `/obligation_dispositions/${disposition.submitted_index}/subject`,
          'typed blocker subject must be reachable from every referenced owner/evidence/capability closure'
        ));
      }
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
        const explicitIntent = isRecord(disposition.issue_intent) ? disposition.issue_intent : null;
        if (disposition.compiler_gap && explicitIntent) {
          addBlocked(
            blocked, obligation,
            (stringArray(explicitIntent.reasons, true) ?? []).length > 0
              ? /** @type {string[]} */ (stringArray(explicitIntent.reasons, true))
              : [String(explicitIntent.missing_type ?? 'requirement-gap')],
            stringArray(explicitIntent.evidence_refs, true) ?? [],
            isCanonicalString(disposition.blocker_root_issue_id) ? String(disposition.blocker_root_issue_id) : null
          );
          continue;
        }
        const roots = [
          ...(stringArray(obligation.source_claim_ids) ?? []), ...(stringArray(obligation.required_oracle_refs) ?? []),
          ...[...(routedFactsByObligation.get(obligationId) ?? [])].flatMap((factId) => {
            const fact = factsById.get(factId);
            return fact ? [String(fact.claim_id), ...(stringArray(fact.source_claim_ids) ?? [])] : [];
          })
        ];
        const evidenceResult = assessEvidenceRoots(roots, evidence, evidenceCache);
        const relatedEvidence = relatedEvidenceClosure(roots, evidence, evidenceCache, relatedEvidenceCache);
        const blockerEvidenceRefs = stringArray(disposition.evidence_refs, !explicitIntent);
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
        if (explicitIntent?.missing_type === 'oracle'
          && oracles.length > 0 && capabilities.length === 0
          && evidenceResult.rank === 2 && evidenceResult.reasons.size === 0) {
          diagnostics.push(diagnostic(
            'classification', 'GROUNDABLE_OBLIGATION_CASE_MISSING', `/obligation_dispositions/${pointerPart(obligationId)}`,
            'fully groundable formal obligation requires a candidate Case instead of an unjustified blocker'
          ));
          continue;
        }
        const intentReasons = explicitIntent ? stringArray(explicitIntent.reasons, true) ?? [] : [];
        const reasons = intentReasons.length > 0 ? intentReasons : oracles.length === 0 ? ['FORMAL_ORACLE_MISSING']
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
        else if (obligationsById.get(obligationId)?.caseable === false) diagnostics.push(diagnostic(
          'classification', 'REQUIREMENT_GAP_CASE_FORBIDDEN', `/cases/${pointerPart(String(draft.case_id))}/obligation_ids/${pointerPart(obligationId)}`,
          'compiler-owned requirement gaps cannot be Case targets'
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
        for (const obligation of linked) {
          const obligationId = String(obligation.obligation_id);
          const formalRoots = [
            ...(stringArray(obligation.source_claim_ids) ?? []),
            ...(stringArray(obligation.required_oracle_refs) ?? []),
            ...[...(routedFactsByObligation.get(obligationId) ?? [])].flatMap((factId) => {
              const fact = factsById.get(factId);
              return fact ? [String(fact.claim_id), ...(stringArray(fact.source_claim_ids) ?? [])] : [];
            })
          ];
          const relatedEvidence = relatedEvidenceClosure(
            formalRoots, evidence, evidenceCache, relatedEvidenceCache
          );
          addBlocked(
            blocked, obligation, evaluation.reasons,
            evaluation.evidenceRefs.filter((ref) => relatedEvidence.has(ref)), null
          );
        }
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
    const deduplicated = deduplicateCases(
      uniquelyExecutable, obligationsById, oracleReachability,
      (draft) => {
        const replayDraft = structuredClone(draft);
        const replaySignature = isRecord(replayDraft.execution_signature)
          ? replayDraft.execution_signature : {};
        replaySignature.oracle_refs = [...new Set(
          (objectArray(replayDraft.steps) ?? []).flatMap((step) => (
            objectArray(step.expectations) ?? []
          )).flatMap((expectation) => (
            isCanonicalString(expectation.expectation_id) ? [String(expectation.expectation_id)] : []
          ))
        )].sort(compareCodePoints);
        replayDraft.execution_signature = replaySignature;
        const linked = (stringArray(draft.obligation_ids, true) ?? []).flatMap((id) => {
          const obligation = obligationsById.get(id);
          return obligation ? [obligation] : [];
        });
        const routedFactIds = [...new Set(linked.flatMap((obligation) => [
          ...(routedFactsByObligation.get(String(obligation.obligation_id)) ?? [])
        ]))].sort(compareCodePoints);
        return evaluateCase(
          replayDraft, linked, routedFactIds, routesByFact, factsById,
          evidence, evidenceCache, oracleReachability, conflicts, diagnostics
        );
      },
      diagnostics
    );
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
