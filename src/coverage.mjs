import evidenceClaimsSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import caseDraftsSchema from '../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json' with { type: 'json' };
import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import testObligationsSchema from '../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { scopeContains } from './decision-record.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';

/** @typedef {{category:string,code:string,path:string,message:string}} Diagnostic */

const CONTEXT_KEYS = [
  'schema_version', 'source_revision', 'compiler_version', 'lineage',
  'evidence_claims', 'obligations_artifact', 'classification', 'clarification',
  'limits', 'expert_recall_limits'
];
const CLASSIFICATION_KEYS = [
  'grounded', 'conditional', 'blocked', 'not_applicable', 'exploratory', 'diagnostics'
];
const CLARIFICATION_KEYS = [
  'action', 'source_revision', 'root_issues', 'pending_root_issues', 'state',
  'semantic_snapshot', 'interaction', 'diagnostics'
];
const CLARIFICATION_STATE_KEYS = [
  'source_revision', 'clarification_event_seq', 'asked_root_issue_ids', 'root_issue_dispositions',
  'last_pending_root_issue_ids', 'last_question_set_digest', 'clarification_stop',
  'semantic_snapshot', 'root_snapshot_ledger'
];
const CURRENT_ROOT_KEYS = [
  'root_issue_id', 'root_issue_key', 'missing_type', 'semantic_refs', 'scope',
  'affected_obligation_ids', 'risk_counts', 'source_revision', 'question', 'answerable',
  'reasons', 'evidence_refs', 'batch_id'
];
const LEDGER_ROOT_KEYS = [
  'root_issue_id', 'root_issue_key', 'missing_type', 'semantic_refs', 'scope',
  'affected_obligation_ids', 'risk_counts', 'question', 'answerable', 'reasons',
  'evidence_refs', 'current'
];
const DISPOSITIONS = new Set(['grounded', 'conditional', 'blocked', 'not_applicable']);
const RISKS = new Set(['critical', 'high', 'medium', 'low']);
const ROOT_DISPOSITIONS = new Set([
  'open', 'asked', 'resolved_final', 'resolved_temporary', 'suppressed_unknown', 'suppressed_deferred'
]);
const DIAGNOSTIC_LIMIT = 256;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const NATIVE_REFLECT_OWN_KEYS = Reflect.ownKeys;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;

export class BundleReconciliationError extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super('test-bundle reconciliation requires revision');
    this.name = 'BundleReconciliationError';
    this.status = 'need_revision';
    this.stage = 'coverage';
    this.diagnostics = finalizeDiagnostics(diagnostics);
  }
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {string} value */
function pointerPart(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
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

/** @param {Diagnostic[]} diagnostics */
function finalizeDiagnostics(diagnostics) {
  const unique = new Map();
  let overflow = false;
  for (const item of diagnostics) {
    if (item.code === 'DIAGNOSTICS_TRUNCATED') overflow = true;
    else unique.set(canonicalStringify(item), item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT) overflow = true;
  const sorted = [...unique.values()].sort((left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.message, right.message));
  if (!overflow) return sorted;
  const retained = sorted.slice(0, DIAGNOSTIC_LIMIT - 1);
  retained.push(diagnostic(
    'classification', 'DIAGNOSTICS_TRUNCATED', '/', `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return retained.sort((left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.message, right.message));
}

/**
 * Capture untrusted input once through own data descriptors. Submitted
 * accessors, iterators, array methods, and mutable prototypes are never used.
 * @param {unknown} root
 */
function snapshotControlled(root) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  let overflow = false;
  /** @param {Diagnostic} item */
  const addDiagnostic = (item) => {
    if (diagnostics.length < DIAGNOSTIC_LIMIT) diagnostics.push(item);
    else overflow = true;
  };
  /** @type {unknown} */
  let snapshot;
  /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
  const pending = [{ source: root, path: '', assign(value) { snapshot = value; } }];
  const seen = new Set();
  while (pending.length > 0) {
    const item = /** @type {{source:unknown,path:string,assign:(value:unknown)=>void}} */ (pending.pop());
    const { source, path, assign } = item;
    if (!source || typeof source !== 'object') {
      assign(source);
      continue;
    }
    if (seen.has(source)) {
      addDiagnostic(diagnostic('schema', 'CYCLIC_INPUT_INVALID', path || '/', 'Task 10 context must be acyclic'));
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
      addDiagnostic(diagnostic('schema', 'INPUT_DESCRIPTOR_UNREADABLE', path || '/', 'Task 10 input descriptors could not be captured'));
      assign(null);
      continue;
    }
    if (NATIVE_ARRAY_IS_ARRAY(source)) {
      if (prototype !== Array.prototype) {
        addDiagnostic(diagnostic('schema', 'ARRAY_PROTOTYPE_INVALID', path || '/', 'controlled arrays must use Array.prototype'));
        assign(null);
        continue;
      }
      const keys = NATIVE_REFLECT_OWN_KEYS(descriptors).sort((left, right) =>
        compareCodePoints(typeof left === 'symbol' ? String(left.description ?? '') : left,
          typeof right === 'symbol' ? String(right.description ?? '') : right));
      let invalidOwnKeys = false;
      const numeric = [];
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        if (typeof key === 'symbol') {
          invalidOwnKeys = true;
          addDiagnostic(diagnostic('schema', 'ARRAY_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled arrays cannot contain symbol properties'));
          continue;
        }
        if (key === 'length') continue;
        const numericKey = Number(key);
        const lengthDescriptor = descriptors.length;
        const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, 'value') && Number.isSafeInteger(lengthDescriptor.value)
          ? Number(lengthDescriptor.value) : 0;
        if (!Number.isSafeInteger(numericKey) || numericKey < 0 || numericKey >= length || String(numericKey) !== key) {
          invalidOwnKeys = true;
          addDiagnostic(diagnostic('schema', 'ARRAY_NAMED_PROPERTY_INVALID', `${path}/${pointerPart(key)}`, 'controlled arrays cannot contain named properties'));
        } else numeric.push(numericKey);
      }
      if (invalidOwnKeys) {
        assign(null);
        continue;
      }
      numeric.sort((left, right) => left - right);
      const lengthDescriptor = descriptors.length;
      const length = lengthDescriptor && Object.hasOwn(lengthDescriptor, 'value') && Number.isSafeInteger(lengthDescriptor.value)
        ? Number(lengthDescriptor.value) : 0;
      /** @type {unknown[]} */
      const target = new Array(length);
      assign(target);
      let expected = 0;
      for (let position = 0; position < numeric.length; position += 1) {
        const numericKey = numeric[position];
        while (expected < numericKey && diagnostics.length < DIAGNOSTIC_LIMIT) {
          addDiagnostic(diagnostic('schema', 'ARRAY_HOLE', `${path}/${expected}`, 'controlled arrays must be dense'));
          expected += 1;
        }
        if (expected < numericKey) overflow = true;
        expected = numericKey + 1;
      }
      while (expected < length && diagnostics.length < DIAGNOSTIC_LIMIT) {
        addDiagnostic(diagnostic('schema', 'ARRAY_HOLE', `${path}/${expected}`, 'controlled arrays must be dense'));
        expected += 1;
      }
      if (expected < length) overflow = true;
      /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
      const children = [];
      for (let position = 0; position < numeric.length; position += 1) {
        const numericKey = numeric[position];
        const descriptor = descriptors[String(numericKey)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) addDiagnostic(diagnostic(
          'schema', 'ACCESSOR_NOT_ALLOWED', `${path}/${numericKey}`, 'controlled input must use own data properties'
        ));
        else children.push({
          source: descriptor.value, path: `${path}/${numericKey}`,
          assign(value) { target[numericKey] = value; }
        });
      }
      for (let position = children.length - 1; position >= 0; position -= 1) pending.push(children[position]);
      continue;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      addDiagnostic(diagnostic('schema', 'RECORD_PROTOTYPE_INVALID', path || '/', 'controlled records must use a plain or null prototype'));
      assign(null);
      continue;
    }
    const keys = NATIVE_REFLECT_OWN_KEYS(descriptors).sort((left, right) =>
      compareCodePoints(typeof left === 'symbol' ? String(left.description ?? '') : left,
        typeof right === 'symbol' ? String(right.description ?? '') : right));
    /** @type {Record<string, unknown>} */
    const target = Object.create(null);
    assign(target);
    /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
    const children = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key === 'symbol') {
        addDiagnostic(diagnostic('schema', 'RECORD_SYMBOL_PROPERTY_INVALID', path || '/', 'controlled records cannot contain symbol properties'));
        continue;
      }
      const descriptor = descriptors[key];
      const childPath = `${path}/${pointerPart(key)}`;
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) addDiagnostic(diagnostic(
        'schema', 'ACCESSOR_NOT_ALLOWED', childPath, 'controlled input must use own data properties'
      ));
      else children.push({
        source: descriptor.value, path: childPath,
        assign(value) { NATIVE_DEFINE_PROPERTY(target, key, { value, enumerable: true, writable: true, configurable: true }); }
      });
    }
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  if (overflow) diagnostics.push(diagnostic(
    'classification', 'DIAGNOSTICS_TRUNCATED', '/', `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return { snapshot, diagnostics: finalizeDiagnostics(diagnostics) };
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** @param {unknown} value @returns {string[]} */
function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {Record<string, unknown>} value @param {string[]} allowed @param {string} path @param {Diagnostic[]} diagnostics @param {string} code */
function requireClosed(value, allowed, path, diagnostics, code) {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value).sort(compareCodePoints)) if (!allowedKeys.has(key)) diagnostics.push(diagnostic(
    'schema', code, `${path}/${pointerPart(key)}`, 'property is outside the closed Task 10 contract'
  ));
  for (const key of allowed) if (!Object.hasOwn(value, key)) diagnostics.push(diagnostic(
    'schema', 'CONTEXT_PROPERTY_MISSING', `${path}/${pointerPart(key)}`, 'required Task 10 context property is missing'
  ));
}

/** @param {unknown} value @param {string} path @param {Diagnostic[]} diagnostics @param {boolean} [nonempty] */
function canonicalStrings(value, path, diagnostics, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    diagnostics.push(diagnostic('schema', 'STRING_ARRAY_INVALID', path, 'value must be a dense canonical string array'));
    return [];
  }
  const output = [];
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || typeof value[index] !== 'string'
      || value[index].length === 0 || value[index] !== value[index].trim() || seen.has(value[index])) {
      diagnostics.push(diagnostic('schema', 'STRING_ARRAY_INVALID', `${path}/${index}`, 'value must be a dense unique nonpadded string array'));
      continue;
    }
    seen.add(value[index]);
    output.push(value[index]);
  }
  return output.sort(compareCodePoints);
}

/** @param {unknown} submittedContext */
function normalizeContext(submittedContext) {
  /** @type {{snapshot:unknown,diagnostics:Diagnostic[]}} */
  const captured = snapshotControlled(submittedContext);
  const diagnostics = [...captured.diagnostics];
  submittedContext = captured.snapshot;
  if (!isRecord(submittedContext)) throw new BundleReconciliationError([
    ...diagnostics, diagnostic('schema', 'CONTEXT_INVALID', '/', 'Task 10 context must be a closed own-data record')
  ]);
  requireClosed(submittedContext, CONTEXT_KEYS, '', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  if (submittedContext.schema_version !== '1.0.0') diagnostics.push(diagnostic(
    'schema', 'SCHEMA_VERSION_INVALID', '/schema_version', 'Task 10 requires schema version 1.0.0'
  ));
  if (!Number.isSafeInteger(submittedContext.source_revision) || Number(submittedContext.source_revision) < 0) diagnostics.push(diagnostic(
    'schema', 'SOURCE_REVISION_INVALID', '/source_revision', 'source revision must be a nonnegative safe integer'
  ));
  if (typeof submittedContext.compiler_version !== 'string' || submittedContext.compiler_version.trim().length === 0
    || submittedContext.compiler_version !== submittedContext.compiler_version.trim()) diagnostics.push(diagnostic(
    'schema', 'COMPILER_VERSION_INVALID', '/compiler_version', 'compiler version must be nonblank and nonpadded'
  ));
  const lineage = isRecord(submittedContext.lineage) ? submittedContext.lineage : {};
  requireClosed(lineage, ['source_digest', 'case_draft_digest'], '/lineage', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  for (const key of ['source_digest', 'case_draft_digest']) if (
    typeof lineage[key] !== 'string' || !/^[a-f0-9]{64}$/u.test(lineage[key])
  ) diagnostics.push(diagnostic('schema', 'LINEAGE_DIGEST_INVALID', `/lineage/${key}`, 'lineage digest must be lowercase SHA-256 hexadecimal'));

  const obligations = isRecord(submittedContext.obligations_artifact) ? submittedContext.obligations_artifact : {};
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema(obligations, testObligationsSchema)));
  const evidenceClaims = isRecord(submittedContext.evidence_claims) ? submittedContext.evidence_claims : {};
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema(evidenceClaims, evidenceClaimsSchema)));
  const classification = isRecord(submittedContext.classification) ? submittedContext.classification : {};
  requireClosed(classification, CLASSIFICATION_KEYS, '/classification', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  const clarification = isRecord(submittedContext.clarification) ? submittedContext.clarification : {};
  requireClosed(clarification, CLARIFICATION_KEYS, '/clarification', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  const revision = Number(submittedContext.source_revision);
  if (evidenceClaims.source_revision !== revision || obligations.source_revision !== revision || clarification.source_revision !== revision) diagnostics.push(diagnostic(
    'traceability', 'SOURCE_REVISION_MISMATCH', '/source_revision', 'Task 7, Task 9, and Task 10 must identify one source revision'
  ));
  if (clarification.action !== 'deliver') diagnostics.push(diagnostic(
    'classification', 'CLARIFICATION_NOT_DELIVERABLE', '/clarification/action', 'coverage may run only after clarification chooses delivery'
  ));
  if (!Array.isArray(classification.diagnostics) || classification.diagnostics.length > 0
    || !Array.isArray(clarification.diagnostics) || clarification.diagnostics.length > 0) diagnostics.push(diagnostic(
    'classification', 'UPSTREAM_DIAGNOSTICS_UNRESOLVED', '/', 'coverage cannot reconcile an upstream result with diagnostics'
  ));
  const limits = canonicalStrings(submittedContext.limits, '/limits', diagnostics, true);
  const expertLimits = canonicalStrings(submittedContext.expert_recall_limits, '/expert_recall_limits', diagnostics, true);
  if (diagnostics.length > 0) throw new BundleReconciliationError(diagnostics);
  return {
    sourceRevision: revision,
    compilerVersion: String(submittedContext.compiler_version),
    lineage: { source_digest: String(lineage.source_digest), case_draft_digest: String(lineage.case_draft_digest) },
    evidenceClaims,
    obligations,
    classification,
    clarification,
    limits,
    expertLimits
  };
}

/** @param {Record<string, unknown>} caseDraft */
function caseExpectations(caseDraft) {
  const expectations = [];
  for (const step of records(caseDraft.steps)) for (const expectation of records(step.expectations)) expectations.push(expectation);
  return expectations;
}

/** @param {string[]} left @param {string[]} right */
function sameStrings(left, right) {
  return canonicalStringify([...left].sort(compareCodePoints)) === canonicalStringify([...right].sort(compareCodePoints));
}

/** @param {string} start @param {string} target @param {Map<string, Record<string, unknown>>} claimsById */
function evidenceReaches(start, target, claimsById) {
  const pending = [start];
  const seen = new Set();
  while (pending.length > 0) {
    const claimId = /** @type {string} */ (pending.pop());
    if (seen.has(claimId)) continue;
    seen.add(claimId);
    if (claimId === target) return true;
    const claim = claimsById.get(claimId);
    for (const parentId of strings(claim?.parent_claim_ids)) pending.push(parentId);
  }
  return false;
}

/**
 * Propagate only required-Oracle labels from accepted parents to descendants.
 * This is built once per invocation and shared by every Case.
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {Record<string, unknown>[]} obligations
 * @param {Diagnostic[]} diagnostics
 */
function buildOracleReachability(claimsById, obligations, diagnostics) {
  const required = new Set();
  for (const obligation of obligations) for (const ref of strings(obligation.required_oracle_refs)) required.add(ref);
  /** @type {Map<string, Set<string>>} */
  const labelsByClaim = new Map();
  /** @type {Map<string, string[]>} */
  const childrenByClaim = new Map();
  const indegree = new Map();
  for (const claimId of claimsById.keys()) {
    childrenByClaim.set(claimId, []);
    indegree.set(claimId, 0);
    if (required.has(claimId)) labelsByClaim.set(claimId, new Set([claimId]));
  }
  for (const [claimId, claim] of claimsById) for (const parentId of strings(claim.parent_claim_ids)) {
    if (!claimsById.has(parentId)) {
      diagnostics.push(diagnostic(
        'reference', 'EVIDENCE_PARENT_UNKNOWN', `/evidence_claims/claims/${pointerPart(claimId)}/parent_claim_ids/${pointerPart(parentId)}`,
        'accepted evidence ancestry references an unknown parent'
      ));
      continue;
    }
    childrenByClaim.get(parentId)?.push(claimId);
    indegree.set(claimId, (indegree.get(claimId) ?? 0) + 1);
  }
  /** @type {string[]} */
  const queue = [];
  for (const [claimId, degree] of indegree) if (degree === 0) queue.push(claimId);
  queue.sort(compareCodePoints);
  let cursor = 0;
  while (cursor < queue.length) {
    const claimId = /** @type {string} */ (queue[cursor]);
    cursor += 1;
    const labels = labelsByClaim.get(claimId);
    const children = /** @type {string[]} */ (childrenByClaim.get(claimId) ?? []);
    children.sort(compareCodePoints);
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const childId = /** @type {string} */ (children[childIndex]);
      if (labels && labels.size > 0) {
        const childLabels = labelsByClaim.get(childId) ?? new Set();
        for (const label of labels) childLabels.add(label);
        labelsByClaim.set(childId, childLabels);
      }
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) queue.push(childId);
    }
  }
  if (cursor !== claimsById.size) diagnostics.push(diagnostic(
    'traceability', 'EVIDENCE_ANCESTRY_INVALID', '/evidence_claims/claims', 'accepted evidence ancestry must be an acyclic closed graph'
  ));
  return labelsByClaim;
}

/**
 * Exact iterative capacitated matching over compressed relation groups.
 * @param {Array<{count:number,required:Set<string>}>} requirements
 * @param {Array<{count:number,available:Set<string>}>} expectations
 */
function hasCompleteOracleOwnership(requirements, expectations) {
  const source = 0;
  const requirementOffset = 1;
  const expectationOffset = requirementOffset + requirements.length;
  const sink = expectationOffset + expectations.length;
  /** @type {Array<Array<{to:number,capacity:number,reverse:number}>>} */
  const graph = Array.from({ length: sink + 1 }, () => []);
  /** @param {number} from @param {number} to @param {number} capacity */
  const addEdge = (from, to, capacity) => {
    const forward = { to, capacity, reverse: graph[to].length };
    const reverse = { to: from, capacity: 0, reverse: graph[from].length };
    graph[from].push(forward);
    graph[to].push(reverse);
  };
  let demand = 0;
  for (let index = 0; index < requirements.length; index += 1) {
    demand += requirements[index].count;
    addEdge(source, requirementOffset + index, requirements[index].count);
    for (let expectationIndex = 0; expectationIndex < expectations.length; expectationIndex += 1) {
      let covered = requirements[index].required.size > 0;
      for (const oracleRef of requirements[index].required) if (!expectations[expectationIndex].available.has(oracleRef)) {
        covered = false;
        break;
      }
      if (covered) addEdge(requirementOffset + index, expectationOffset + expectationIndex, requirements[index].count);
    }
  }
  for (let index = 0; index < expectations.length; index += 1) {
    addEdge(expectationOffset + index, sink, expectations[index].count);
  }
  let flow = 0;
  while (flow < demand) {
    const parentNode = new Array(graph.length).fill(-1);
    const parentEdge = new Array(graph.length).fill(-1);
    const queue = [source];
    parentNode[source] = source;
    let cursor = 0;
    while (cursor < queue.length && parentNode[sink] < 0) {
      const node = queue[cursor];
      cursor += 1;
      for (let edgeIndex = 0; edgeIndex < graph[node].length; edgeIndex += 1) {
        const edge = graph[node][edgeIndex];
        if (edge.capacity <= 0 || parentNode[edge.to] >= 0) continue;
        parentNode[edge.to] = node;
        parentEdge[edge.to] = edgeIndex;
        queue.push(edge.to);
        if (edge.to === sink) break;
      }
    }
    if (parentNode[sink] < 0) return false;
    let amount = demand - flow;
    for (let node = sink; node !== source; node = parentNode[node]) {
      amount = Math.min(amount, graph[parentNode[node]][parentEdge[node]].capacity);
    }
    for (let node = sink; node !== source; node = parentNode[node]) {
      const edge = graph[parentNode[node]][parentEdge[node]];
      edge.capacity -= amount;
      graph[node][edge.reverse].capacity += amount;
    }
    flow += amount;
  }
  return true;
}

/**
 * @param {Record<string, unknown>} caseDraft
 * @param {string} lane
 * @param {Map<string, Record<string, unknown>>} obligationsById
 * @param {Map<string, Record<string, unknown>>} routesByFact
 * @param {Map<string, Record<string, unknown>>} factsById
 * @param {Map<string, Record<string, unknown>>} pointsById
 * @param {Map<string, Set<string>>} oracleLabelsByClaim
 * @param {Diagnostic[]} diagnostics
 */
function validateCaseTraceability(caseDraft, lane, obligationsById, routesByFact, factsById, pointsById, oracleLabelsByClaim, diagnostics) {
  const caseId = typeof caseDraft.case_id === 'string' ? caseDraft.case_id : 'invalid';
  const path = `/${lane}/${pointerPart(caseId)}`;
  const factIds = strings(caseDraft.fact_ids);
  const obligationIds = strings(caseDraft.obligation_ids);
  const evidenceRefs = new Set(strings(caseDraft.evidence_refs));
  for (const obligationId of obligationIds) {
    const obligation = obligationsById.get(obligationId);
    if (!obligation) diagnostics.push(diagnostic(
      'reference', 'CASE_OBLIGATION_UNKNOWN', `${path}/obligation_ids/${pointerPart(obligationId)}`, 'Case references an unknown formal Test Point'
    ));
    else {
      const point = pointsById.get(obligationId);
      if (point?.classification !== lane) diagnostics.push(diagnostic(
        'traceability', 'CASE_DISPOSITION_MISMATCH', `${path}/obligation_ids/${pointerPart(obligationId)}`, 'Case lane and final formal disposition must match'
      ));
      for (const ref of [...strings(obligation.source_claim_ids), ...strings(obligation.required_oracle_refs)]) if (!evidenceRefs.has(ref)) diagnostics.push(diagnostic(
        'traceability', 'CASE_ORACLE_TRACE_MISSING', `${path}/evidence_refs/${pointerPart(ref)}`, 'Case must retain each linked Test Point source and Oracle reference'
      ));
    }
  }
  for (const factId of factIds) {
    const route = routesByFact.get(factId);
    if (!factsById.has(factId)) diagnostics.push(diagnostic(
      'reference', 'CASE_FACT_UNKNOWN', `${path}/fact_ids/${pointerPart(factId)}`, 'Case references an unknown requirement fact'
    ));
    else if (!route || route.route_type !== 'obligations'
      || !strings(route.obligation_ids).some((obligationId) => obligationIds.includes(obligationId))) diagnostics.push(diagnostic(
      'traceability', 'CASE_FACT_TRACE_MISSING', `${path}/fact_ids/${pointerPart(factId)}`, 'Case fact must route to one of the Case formal Test Points'
    ));
  }
  const expectations = caseExpectations(caseDraft);
  const expectationIds = strings(expectations.map((item) => item.expectation_id));
  const signature = isRecord(caseDraft.execution_signature) ? caseDraft.execution_signature : {};
  const submittedOracleIds = strings(signature.oracle_refs);
  if (expectations.length < obligationIds.length || expectationIds.length !== expectations.length
    || new Set(expectationIds).size !== expectationIds.length || !sameStrings(expectationIds, submittedOracleIds)) diagnostics.push(diagnostic(
    'traceability', 'CASE_ORACLE_TRACE_MISSING', `${path}/execution_signature/oracle_refs`,
    'every covered Test Point requires a distinct independently locatable expectation Oracle'
  ));
  /** @type {Map<string, {count:number,required:Set<string>}>} */
  const requirementGroups = new Map();
  for (const obligationId of obligationIds) {
    const oracleRoots = strings(obligationsById.get(obligationId)?.required_oracle_refs).sort(compareCodePoints);
    const key = canonicalStringify(oracleRoots);
    const group = requirementGroups.get(key);
    if (group) group.count += 1;
    else requirementGroups.set(key, { count: 1, required: new Set(oracleRoots) });
  }
  /** @type {Map<string, {count:number,available:Set<string>}>} */
  const expectationGroups = new Map();
  for (const expectation of expectations) {
    const evidenceRef = String(expectation.evidence_ref ?? '');
    const labels = oracleLabelsByClaim.get(evidenceRef) ?? new Set();
    const orderedLabels = [...labels].sort(compareCodePoints);
    const key = canonicalStringify(orderedLabels);
    const group = expectationGroups.get(key);
    if (group) group.count += 1;
    else expectationGroups.set(key, { count: 1, available: new Set(orderedLabels) });
  }
  const requirementList = [...requirementGroups.entries()].sort((left, right) => compareCodePoints(left[0], right[0])).map(([, group]) => group);
  const expectationList = [...expectationGroups.entries()].sort((left, right) => compareCodePoints(left[0], right[0])).map(([, group]) => group);
  if (!hasCompleteOracleOwnership(requirementList, expectationList)) diagnostics.push(diagnostic(
    'traceability', 'CASE_ORACLE_OWNERSHIP_INCOMPLETE', `${path}/steps`,
    'every linked Test Point must own one distinct concrete expectation covering all required Oracles through accepted ancestry'
  ));
  if (Object.hasOwn(signature, 'test_point_ids') && !sameStrings(strings(signature.test_point_ids), obligationIds)) diagnostics.push(diagnostic(
    'traceability', 'CASE_TEST_POINT_TRACE_MISMATCH', `${path}/execution_signature/test_point_ids`, 'Case signature Test Point associations must be exact'
  ));
}

/** @param {Record<string, unknown>} root */
function canonicalRootProjection(root) {
  const riskCounts = isRecord(root.risk_counts) ? root.risk_counts : {};
  return {
    root_issue_id: String(root.root_issue_id ?? ''),
    root_issue_key: String(root.root_issue_key ?? ''),
    missing_type: String(root.missing_type ?? ''),
    semantic_refs: strings(root.semantic_refs).sort(compareCodePoints),
    scope: String(root.scope ?? ''),
    affected_obligation_ids: strings(root.affected_obligation_ids).sort(compareCodePoints),
    risk_counts: {
      critical: Number(riskCounts.critical), high: Number(riskCounts.high),
      medium: Number(riskCounts.medium), low: Number(riskCounts.low)
    },
    question: String(root.question ?? ''),
    answerable: root.answerable,
    reasons: strings(root.reasons).sort(compareCodePoints),
    evidence_refs: strings(root.evidence_refs).sort(compareCodePoints)
  };
}

/** @param {Record<string, unknown>} root @param {string} path @param {boolean} current @param {Diagnostic[]} diagnostics */
function validateRootShape(root, path, current, diagnostics) {
  requireClosed(root, current ? CURRENT_ROOT_KEYS : LEDGER_ROOT_KEYS, path, diagnostics, 'ROOT_LEDGER_PROPERTY_UNKNOWN');
  for (const key of ['root_issue_id', 'root_issue_key', 'missing_type', 'scope', 'question']) {
    if (typeof root[key] !== 'string' || root[key].trim().length === 0 || root[key] !== root[key].trim()) diagnostics.push(diagnostic(
      'schema', 'ROOT_LEDGER_FIELD_INVALID', `${path}/${key}`, 'root ledger identity and recovery text must be nonblank and nonpadded'
    ));
  }
  canonicalStrings(root.semantic_refs, `${path}/semantic_refs`, diagnostics, true);
  canonicalStrings(root.affected_obligation_ids, `${path}/affected_obligation_ids`, diagnostics, true);
  canonicalStrings(root.reasons, `${path}/reasons`, diagnostics, true);
  canonicalStrings(root.evidence_refs, `${path}/evidence_refs`, diagnostics, true);
  if (typeof root.answerable !== 'boolean' || (!current && typeof root.current !== 'boolean')) diagnostics.push(diagnostic(
    'schema', 'ROOT_LEDGER_FIELD_INVALID', path, 'root answerability and ledger currency must be booleans'
  ));
  const riskCounts = isRecord(root.risk_counts) ? root.risk_counts : {};
  requireClosed(riskCounts, ['critical', 'high', 'medium', 'low'], `${path}/risk_counts`, diagnostics, 'ROOT_LEDGER_PROPERTY_UNKNOWN');
  for (const risk of RISKS) if (!Number.isSafeInteger(riskCounts[risk]) || Number(riskCounts[risk]) < 0) diagnostics.push(diagnostic(
    'schema', 'ROOT_LEDGER_RISK_COUNTS_INVALID', `${path}/risk_counts/${risk}`, 'root risk counts must be nonnegative safe integers'
  ));
}

/**
 * Validate Task 9 current roots against the authoritative cumulative ledger
 * and construct the only Blocked recovery index in one pass.
 * @param {Record<string, unknown>[]} roots
 * @param {Record<string, unknown>[]} ledger
 * @param {Record<string, unknown>[]} dispositions
 * @param {number} sourceRevision
 * @param {Diagnostic[]} diagnostics
 */
function validateRootLedger(roots, ledger, dispositions, sourceRevision, diagnostics) {
  const ledgerById = new Map();
  const currentLedgerIds = new Set();
  for (const entry of ledger) {
    const rootId = String(entry.root_issue_id ?? '');
    validateRootShape(entry, `/clarification/state/root_snapshot_ledger/${pointerPart(rootId)}`, false, diagnostics);
    if (ledgerById.has(rootId)) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_ID_DUPLICATE', `/clarification/state/root_snapshot_ledger/${pointerPart(rootId)}`,
      'root ledger identities must be unique'
    ));
    else ledgerById.set(rootId, entry);
    if (entry.current === true) currentLedgerIds.add(rootId);
    const semanticRefs = strings(entry.semantic_refs).sort(compareCodePoints);
    const expectedKey = canonicalStringify({
      missing_type: String(entry.missing_type ?? ''), scope: String(entry.scope ?? ''), semantic_refs: semanticRefs
    });
    if (entry.root_issue_key !== expectedKey) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_KEY_MISMATCH', `/clarification/state/root_snapshot_ledger/${pointerPart(rootId)}/root_issue_key`,
      'root ledger key must be the canonical semantic identity projection'
    ));
  }
  const rootsById = new Map();
  for (const root of roots) {
    const rootId = String(root.root_issue_id ?? '');
    validateRootShape(root, `/clarification/root_issues/${pointerPart(rootId)}`, true, diagnostics);
    if (rootsById.has(rootId)) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_CURRENT_DUPLICATE', `/clarification/root_issues/${pointerPart(rootId)}`,
      'current root identities must be unique'
    ));
    else rootsById.set(rootId, root);
    if (root.source_revision !== sourceRevision) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_CURRENT_REVISION_MISMATCH', `/clarification/root_issues/${pointerPart(rootId)}/source_revision`,
      'current root revision must match the immutable Task 10 source revision'
    ));
    const authoritative = ledgerById.get(rootId);
    if (!authoritative || authoritative.current !== true
      || canonicalStringify(canonicalRootProjection(root)) !== canonicalStringify(canonicalRootProjection(authoritative))) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_CURRENT_MISMATCH', `/clarification/root_issues/${pointerPart(rootId)}`,
      'current root must exactly match its authoritative current ledger entry'
    ));
  }
  const rootIds = new Set(rootsById.keys());
  if (currentLedgerIds.size !== rootIds.size
    || [...currentLedgerIds].some((rootId) => !rootIds.has(rootId))) diagnostics.push(diagnostic(
    'traceability', 'ROOT_LEDGER_CURRENT_SET_MISMATCH', '/clarification/state/root_snapshot_ledger',
    'current root issues must exactly equal ledger entries marked current'
  ));
  const dispositionIds = new Set();
  for (const disposition of dispositions) {
    const rootId = String(disposition.root_issue_id ?? '');
    requireClosed(disposition, ['root_issue_id', 'status'], `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}`, diagnostics, 'ROOT_LEDGER_PROPERTY_UNKNOWN');
    if (dispositionIds.has(rootId)) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_DISPOSITION_DUPLICATE', `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}`,
      'each ledger root requires exactly one lifecycle disposition'
    ));
    dispositionIds.add(rootId);
    if (!ROOT_DISPOSITIONS.has(String(disposition.status ?? ''))) diagnostics.push(diagnostic(
      'classification', 'ROOT_LEDGER_DISPOSITION_INVALID', `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}/status`,
      'root lifecycle disposition is outside the frozen Task 9 enumeration'
    ));
    if (!ledgerById.has(rootId)) diagnostics.push(diagnostic(
      'reference', 'ROOT_LEDGER_DISPOSITION_UNKNOWN', `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}`,
      'root lifecycle disposition references an unknown ledger identity'
    ));
  }
  for (const rootId of ledgerById.keys()) if (!dispositionIds.has(rootId)) diagnostics.push(diagnostic(
    'traceability', 'ROOT_LEDGER_DISPOSITION_MISSING', `/clarification/state/root_snapshot_ledger/${pointerPart(rootId)}`,
    'every authoritative root ledger entry requires one lifecycle disposition'
  ));
  /** @type {Map<string, Map<string, Record<string, unknown>[]>>} */
  const rootsByObligationReason = new Map();
  for (const entry of ledger) {
    const reasons = strings(entry.reasons);
    const obligationIds = strings(entry.affected_obligation_ids);
    for (let obligationIndex = 0; obligationIndex < obligationIds.length; obligationIndex += 1) {
      for (let reasonIndex = 0; reasonIndex < reasons.length; reasonIndex += 1) {
        const obligationId = obligationIds[obligationIndex];
        const reason = reasons[reasonIndex];
        const byReason = rootsByObligationReason.get(obligationId) ?? new Map();
        const matches = byReason.get(reason) ?? [];
        matches.push(entry);
        byReason.set(reason, matches);
        rootsByObligationReason.set(obligationId, byReason);
      }
    }
  }
  return rootsByObligationReason;
}

/**
 * Build the sole canonical delivery artifact from accepted Task 7–9 output.
 * Invalid accounting is represented by BundleReconciliationError diagnostics,
 * never by a partial bundle or an uncovered pseudo-lane.
 * @param {unknown} context
 */
function buildBundleTrusted(context) {
  const normalized = normalizeContext(context);
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const obligations = records(normalized.obligations.obligations);
  const factRoutes = records(normalized.obligations.fact_routes);
  const facts = records(normalized.evidenceClaims.fact_ledger);
  const obligationsById = new Map();
  const claimsById = new Map();
  for (const claim of records(normalized.evidenceClaims.claims)) {
    const claimId = String(claim.claim_id ?? '');
    if (claimsById.has(claimId)) diagnostics.push(diagnostic(
      'reference', 'EVIDENCE_CLAIM_DUPLICATE', `/evidence_claims/claims/${pointerPart(claimId)}`, 'accepted claim IDs must be unique'
    ));
    else claimsById.set(claimId, claim);
  }
  const factsById = new Map();
  for (const fact of facts) {
    const factId = String(fact.fact_id ?? '');
    if (factsById.has(factId)) diagnostics.push(diagnostic(
      'coverage', 'REQUIREMENT_FACT_DUPLICATE', `/evidence_claims/fact_ledger/${pointerPart(factId)}`, 'accepted requirement fact IDs must be unique'
    ));
    else factsById.set(factId, fact);
    const claimRefs = [String(fact.claim_id ?? ''), ...strings(fact.source_claim_ids)];
    for (let index = 0; index < claimRefs.length; index += 1) if (!claimsById.has(claimRefs[index])) diagnostics.push(diagnostic(
      'reference', 'REQUIREMENT_FACT_CLAIM_UNKNOWN', `/evidence_claims/fact_ledger/${pointerPart(factId)}`, 'fact ledger references must exist in accepted evidence'
    ));
  }
  for (const obligation of obligations) {
    const id = String(obligation.obligation_id ?? '');
    if (obligationsById.has(id)) diagnostics.push(diagnostic('coverage', 'FORMAL_TEST_POINT_DUPLICATE', `/obligations/${pointerPart(id)}`, 'formal Test Point IDs must be unique'));
    else obligationsById.set(id, obligation);
  }
  const routesByFact = new Map();
  for (const route of factRoutes) {
    const factId = String(route.fact_id ?? '');
    if (routesByFact.has(factId)) diagnostics.push(diagnostic('coverage', 'REQUIREMENT_FACT_ROUTE_DUPLICATE', `/fact_routes/${pointerPart(factId)}`, 'requirement facts must have exactly one canonical route'));
    else routesByFact.set(factId, route);
    if (!factsById.has(factId)) diagnostics.push(diagnostic(
      'reference', 'FACT_ROUTE_FACT_UNKNOWN', `/fact_routes/${pointerPart(factId)}`, 'fact route references an unknown accepted requirement fact'
    ));
    if (route.route_type === 'obligations') for (const obligationId of strings(route.obligation_ids)) {
      if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic(
        'reference', 'FACT_ROUTE_OBLIGATION_UNKNOWN', `/fact_routes/${pointerPart(factId)}/obligation_ids/${pointerPart(obligationId)}`,
        'requirement fact route references an unknown formal Test Point'
      ));
    }
  }
  for (const factId of factsById.keys()) if (!routesByFact.has(factId)) diagnostics.push(diagnostic(
    'coverage', 'REQUIREMENT_FACT_ROUTE_MISSING', `/evidence_claims/fact_ledger/${pointerPart(factId)}`, 'every accepted requirement fact requires exactly one canonical route'
  ));
  const oracleLabelsByClaim = buildOracleReachability(claimsById, obligations, diagnostics);

  const semantics = isRecord(normalized.clarification.semantic_snapshot)
    ? normalized.clarification.semantic_snapshot : {};
  requireClosed(semantics, ['formal_test_points', 'coverage_denominator', 'delivery_sections'], '/clarification/semantic_snapshot', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  const points = records(semantics.formal_test_points);
  const pointsById = new Map();
  for (const [index, point] of points.entries()) {
    requireClosed(point, ['obligation_id', 'evidence_level', 'classification', 'blocked_reason'], `/clarification/semantic_snapshot/formal_test_points/${index}`, diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
    const obligationId = typeof point.obligation_id === 'string' ? point.obligation_id : '';
    const classification = typeof point.classification === 'string' ? point.classification : '';
    if (pointsById.has(obligationId)) diagnostics.push(diagnostic(
      'coverage', 'FORMAL_TEST_POINT_DUPLICATE', `/clarification/semantic_snapshot/formal_test_points/${index}/obligation_id`, 'formal Test Point must have exactly one disposition'
    ));
    else pointsById.set(obligationId, point);
    if (!DISPOSITIONS.has(classification)) diagnostics.push(diagnostic(
      'coverage', 'FORMAL_DISPOSITION_INVALID', `/clarification/semantic_snapshot/formal_test_points/${index}/classification`, 'formal Test Point disposition is outside the frozen four lanes'
    ));
    const reason = point.blocked_reason;
    if (classification === 'blocked' && (typeof reason !== 'string' || reason.trim().length === 0
      || reason === 'uncovered' || reason === 'not-evaluated')) diagnostics.push(diagnostic(
      'coverage', 'BLOCKED_REASON_INVALID', `/clarification/semantic_snapshot/formal_test_points/${index}/blocked_reason`, 'Blocked formal Test Point requires a concrete root reason'
    ));
    if (classification !== 'blocked' && reason !== null) diagnostics.push(diagnostic(
      'coverage', 'BLOCKED_REASON_UNEXPECTED', `/clarification/semantic_snapshot/formal_test_points/${index}/blocked_reason`, 'only Blocked formal Test Points may carry a reason'
    ));
  }
  for (const obligationId of obligationsById.keys()) if (!pointsById.has(obligationId)) diagnostics.push(diagnostic(
    'coverage', 'FORMAL_TEST_POINT_DISPOSITION_MISSING', `/formal/${pointerPart(obligationId)}`, 'every formal Test Point requires exactly one final disposition'
  ));
  for (const obligationId of pointsById.keys()) if (!obligationsById.has(obligationId)) diagnostics.push(diagnostic(
    'reference', 'FORMAL_TEST_POINT_UNKNOWN', `/formal/${pointerPart(obligationId)}`, 'final disposition references an unknown formal Test Point'
  ));
  const delivery = isRecord(semantics.delivery_sections) ? semantics.delivery_sections : {};
  requireClosed(delivery, ['grounded', 'conditional', 'blocked', 'exploratory', 'coverage', 'quality'], '/clarification/semantic_snapshot/delivery_sections', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  for (const lane of ['grounded', 'conditional', 'blocked']) {
    const expected = points.filter((point) => point.classification === lane).map((point) => String(point.obligation_id));
    if (!sameStrings(strings(delivery[lane]), expected)) diagnostics.push(diagnostic(
      'traceability', 'CLARIFICATION_LANE_MISMATCH', `/clarification/semantic_snapshot/delivery_sections/${lane}`,
      'Task 9 delivery lane must exactly project its formal Test Point dispositions'
    ));
  }
  const deliveryCoverage = isRecord(delivery.coverage) ? delivery.coverage : {};
  requireClosed(deliveryCoverage, ['formal_denominator'], '/clarification/semantic_snapshot/delivery_sections/coverage', diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
  if (semantics.coverage_denominator !== points.length || deliveryCoverage.formal_denominator !== points.length) diagnostics.push(diagnostic(
    'coverage', 'CLARIFICATION_DENOMINATOR_MISMATCH', '/clarification/semantic_snapshot/coverage_denominator',
    'Task 9 semantic denominator must exactly account for its formal Test Point snapshot'
  ));

  /** @type {Map<string, Set<string>>} */
  const baseLanesByObligation = new Map();
  /** @type {Map<string, Record<string, unknown>>} */
  const casesById = new Map();
  /** @type {Record<string, unknown>[]} */
  const grounded = [];
  /** @type {Record<string, unknown>[]} */
  const conditional = [];
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema({
    schema_version: '1.0.0', source_revision: normalized.sourceRevision,
    cases: [...records(normalized.classification.grounded), ...records(normalized.classification.conditional)],
    obligation_dispositions: [], exploratory_candidates: []
  }, caseDraftsSchema)));
  for (const lane of ['grounded', 'conditional']) for (const caseDraft of records(normalized.classification[lane])) {
    const caseId = String(caseDraft.case_id ?? '');
    if (casesById.has(caseId)) diagnostics.push(diagnostic('traceability', 'CASE_ID_DUPLICATE', `/classification/${lane}/${pointerPart(caseId)}`, 'executable Case IDs must be unique across lanes'));
    else casesById.set(caseId, caseDraft);
    const obligationIds = strings(caseDraft.obligation_ids);
    for (const obligationId of obligationIds) {
      const lanes = baseLanesByObligation.get(obligationId) ?? new Set();
      lanes.add(lane);
      baseLanesByObligation.set(obligationId, lanes);
    }
    const finalLanes = new Set(obligationIds.map((id) => String(pointsById.get(id)?.classification ?? 'unknown')));
    if (finalLanes.size === 1 && finalLanes.has(lane)) {
      validateCaseTraceability(caseDraft, lane, obligationsById, routesByFact, factsById, pointsById, oracleLabelsByClaim, diagnostics);
      (lane === 'grounded' ? grounded : conditional).push(structuredClone(caseDraft));
    } else if (!(finalLanes.size === 1 && finalLanes.has('blocked'))) diagnostics.push(diagnostic(
      'traceability', 'CASE_DISPOSITION_MISMATCH', `/classification/${lane}/${pointerPart(caseId)}`, 'one Case cannot cross final executable and blocked dispositions'
    ));
  }
  for (const [obligationId, lanes] of baseLanesByObligation) if (lanes.size > 1) diagnostics.push(diagnostic(
    'coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/formal/${pointerPart(obligationId)}`, 'one formal Test Point cannot enter multiple executable lanes'
  ));

  const blockedInput = records(normalized.classification.blocked);
  const blockedInputById = new Map();
  for (const item of blockedInput) {
    const id = String(item.obligation_id ?? '');
    requireClosed(item, ['obligation_id', 'root_issue_id', 'reason', 'risk', 'evidence_refs'], `/classification/blocked/${pointerPart(id)}`, diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
    if (blockedInputById.has(id)) diagnostics.push(diagnostic('coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/classification/blocked/${pointerPart(id)}`, 'Blocked disposition must be unique'));
    else blockedInputById.set(id, item);
    if (pointsById.get(id)?.classification !== 'blocked') diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_DISPOSITION_MISMATCH', `/classification/blocked/${pointerPart(id)}`, 'upstream Blocked disposition must remain Blocked'
    ));
  }
  const roots = records(normalized.clarification.root_issues);
  const state = isRecord(normalized.clarification.state) ? normalized.clarification.state : {};
  requireClosed(state, CLARIFICATION_STATE_KEYS, '/clarification/state', diagnostics, 'ROOT_LEDGER_PROPERTY_UNKNOWN');
  const ledger = records(state.root_snapshot_ledger);
  const rootsByObligationReason = validateRootLedger(
    roots, ledger, records(state.root_issue_dispositions), normalized.sourceRevision, diagnostics
  );
  /** @type {Record<string, unknown>[]} */
  const blocked = [];
  for (const point of points.filter((item) => item.classification === 'blocked')) {
    const obligationId = String(point.obligation_id);
    const reason = String(point.blocked_reason);
    const obligation = obligationsById.get(obligationId);
    const projectedFromCase = baseLanesByObligation.has(obligationId);
    const task8Blocker = blockedInputById.get(obligationId);
    if (!projectedFromCase && !task8Blocker) diagnostics.push(diagnostic(
      'coverage', 'BLOCKED_DISPOSITION_MISSING', `/classification/blocked/${pointerPart(obligationId)}`,
      'final Blocked Test Point must trace to a Task 8 blocker or an executable Case gated by Task 9'
    ));
    if (projectedFromCase && task8Blocker) diagnostics.push(diagnostic(
      'coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/formal/${pointerPart(obligationId)}`,
      'final Blocked Test Point cannot retain both a Task 8 blocker and an executable Case projection'
    ));
    if (task8Blocker && (task8Blocker.reason !== reason || task8Blocker.risk !== obligation?.risk)) diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_DISPOSITION_MISMATCH', `/classification/blocked/${pointerPart(obligationId)}`,
      'Task 8 and final Blocked reason and risk must agree'
    ));
    const candidates = rootsByObligationReason.get(obligationId)?.get(reason) ?? [];
    if (candidates.length !== 1) {
      diagnostics.push(diagnostic(
        'traceability', 'BLOCKED_ROOT_TRACE_INVALID', `/blocked/${pointerPart(obligationId)}`,
        `Blocked formal Test Point requires exactly one root issue; found ${candidates.length}`
      ));
      continue;
    }
    const root = candidates[0];
    const semanticRefs = strings(root.semantic_refs);
    const missingType = typeof root.missing_type === 'string' ? root.missing_type : '';
    const question = typeof root.question === 'string' ? root.question : '';
    const risk = typeof obligation?.risk === 'string' ? obligation.risk : '';
    if (semanticRefs.length === 0 || missingType.trim().length === 0 || question.trim().length === 0 || !RISKS.has(risk)) diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_RECOVERY_INCOMPLETE', `/blocked/${pointerPart(obligationId)}/recovery`, 'Blocked root must provide missing type, material references, question, and formal risk'
    ));
    blocked.push({
      obligation_id: obligationId,
      root_issue_id: String(root.root_issue_id ?? ''),
      reason,
      recovery: {
        missing_type: missingType,
        required_material: [...semanticRefs].sort(compareCodePoints).join(', '),
        question
      },
      risk
    });
  }

  const naInput = records(normalized.classification.not_applicable);
  const naById = new Map();
  for (const item of naInput) {
    const obligationId = String(item.obligation_id ?? '');
    requireClosed(item, ['obligation_id', 'status', 'exclusion_claim_id', 'scope', 'support_review'], `/classification/not_applicable/${pointerPart(obligationId)}`, diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
    const obligation = obligationsById.get(obligationId);
    const exclusionId = String(item.exclusion_claim_id ?? '');
    const exclusion = claimsById.get(exclusionId);
    if (naById.has(obligationId)) diagnostics.push(diagnostic('coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/classification/not_applicable/${pointerPart(obligationId)}`, 'NotApplicable disposition must be unique'));
    else naById.set(obligationId, item);
    if (pointsById.get(obligationId)?.classification !== 'not_applicable') diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_DISPOSITION_MISMATCH', `/classification/not_applicable/${pointerPart(obligationId)}`, 'NotApplicable disposition must match final formal semantics'
    ));
    if (!exclusion) diagnostics.push(diagnostic(
      'reference', 'NOT_APPLICABLE_EXCLUSION_UNKNOWN', `/classification/not_applicable/${pointerPart(obligationId)}/exclusion_claim_id`,
      'NotApplicable exclusion must exist in accepted Task 3 evidence'
    ));
    else {
      if (exclusion.level !== 'E3' && exclusion.level !== 'E2') diagnostics.push(diagnostic(
        'classification', 'NOT_APPLICABLE_EXCLUSION_LEVEL_INVALID', `/classification/not_applicable/${pointerPart(obligationId)}/exclusion_claim_id`,
        'NotApplicable exclusion requires accepted E3 or E2 evidence'
      ));
      if (item.support_review !== 'supported') diagnostics.push(diagnostic(
        'classification', 'NOT_APPLICABLE_EXCLUSION_REVIEW_INVALID', `/classification/not_applicable/${pointerPart(obligationId)}/support_review`,
        'NotApplicable exclusion support review must be supported'
      ));
      if (!obligation || typeof exclusion.scope !== 'string' || typeof item.scope !== 'string'
        || !scopeContains(exclusion.scope, item.scope) || !scopeContains(item.scope, String(obligation.scope ?? ''))) diagnostics.push(diagnostic(
        'traceability', 'NOT_APPLICABLE_EXCLUSION_SCOPE_INVALID', `/classification/not_applicable/${pointerPart(obligationId)}/scope`,
        'NotApplicable exclusion and submitted scope must cover the formal Test Point scope'
      ));
      const obligationRoots = obligation
        ? [...strings(obligation.source_claim_ids), ...strings(obligation.required_oracle_refs)] : [];
      for (const route of factRoutes) if (route.route_type === 'obligations'
        && strings(route.obligation_ids).includes(obligationId)) {
        const fact = factsById.get(String(route.fact_id ?? ''));
        if (fact) obligationRoots.push(String(fact.claim_id ?? ''), ...strings(fact.source_claim_ids));
      }
      if (obligationRoots.some((root) => evidenceReaches(exclusionId, root, claimsById)
        || evidenceReaches(root, exclusionId, claimsById))) diagnostics.push(diagnostic(
        'traceability', 'NOT_APPLICABLE_EXCLUSION_RELATED', `/classification/not_applicable/${pointerPart(obligationId)}/exclusion_claim_id`,
        'NotApplicable exclusion must be independent of the formal Test Point evidence closure'
      ));
      const exclusionRoutes = factRoutes.filter((route) => route.route_type === 'not_applicable'
        && route.not_applicable_claim_id === exclusionId);
      if (exclusionRoutes.length === 0) diagnostics.push(diagnostic(
        'traceability', 'NOT_APPLICABLE_EXCLUSION_ROUTE_MISSING', `/classification/not_applicable/${pointerPart(obligationId)}/exclusion_claim_id`,
        'NotApplicable exclusion must be retained by a verified Task 7 fact route'
      ));
    }
  }
  for (const point of points) {
    const id = String(point.obligation_id);
    if ((point.classification === 'grounded' || point.classification === 'conditional')
      && !(baseLanesByObligation.get(id)?.has(point.classification))) diagnostics.push(diagnostic(
      'traceability', 'FORMAL_CASE_TRACE_MISSING', `/formal/${pointerPart(id)}`, 'every executable formal Test Point must reference a Case in its final lane'
    ));
    if (point.classification === 'not_applicable' && !naById.has(id)) diagnostics.push(diagnostic(
      'coverage', 'NOT_APPLICABLE_DISPOSITION_MISSING', `/formal/${pointerPart(id)}`, 'NotApplicable formal Test Point requires its verified exclusion record'
    ));
  }
  const notApplicable = [...naById.values()].map((item) => ({
    obligation_id: String(item.obligation_id),
    exclusion_claim_id: String(item.exclusion_claim_id),
    scope: String(item.scope),
    support_review: String(item.support_review)
  })).sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));

  const exploratoryIds = strings(delivery.exploratory);
  const exploratoryInput = records(normalized.classification.exploratory);
  for (const item of exploratoryInput) requireClosed(
    item, ['exploratory_id', 'title', 'scope', 'risk', 'source_claim_ids'],
    `/classification/exploratory/${pointerPart(String(item.exploratory_id ?? ''))}`, diagnostics, 'CONTEXT_PROPERTY_UNKNOWN'
  );
  const exploratory = exploratoryInput.map((item) => ({
    exploratory_id: String(item.exploratory_id ?? ''),
    title: String(item.title ?? ''),
    scope: String(item.scope ?? ''),
    risk: String(item.risk ?? ''),
    reason: `Risk hypothesis outside formal Test Point coverage; evidence: ${strings(item.source_claim_ids).sort(compareCodePoints).join(', ')}`
  })).sort((left, right) => compareCodePoints(left.exploratory_id, right.exploratory_id));
  if (!sameStrings(exploratoryIds, exploratory.map((item) => item.exploratory_id))) diagnostics.push(diagnostic(
    'traceability', 'EXPLORATORY_LANE_MISMATCH', '/exploratory', 'Task 8 and Task 9 Exploratory identities must match exactly'
  ));

  const executableCases = [...grounded, ...conditional];
  const traceByFact = new Map();
  for (const caseDraft of executableCases) for (const factId of strings(caseDraft.fact_ids)) {
    const linked = traceByFact.get(factId) ?? new Set();
    for (const obligationId of strings(caseDraft.obligation_ids)) linked.add(obligationId);
    traceByFact.set(factId, linked);
  }
  const requirementEntries = [];
  for (const fact of facts) {
    const factId = String(fact.fact_id);
    const route = routesByFact.get(factId);
    let status = 'blocked';
    if (route?.route_type === 'not_applicable') status = 'not_applicable';
    else if (route?.route_type === 'obligations') {
      const obligationIds = strings(route.obligation_ids);
      const dispositions = obligationIds.map((id) => String(pointsById.get(id)?.classification ?? 'unknown'));
      const linked = traceByFact.get(factId) ?? new Set();
      const executableRouteIds = obligationIds.filter((id, index) => dispositions[index] === 'grounded' || dispositions[index] === 'conditional');
      if (executableRouteIds.length > 0 && executableRouteIds.every((id) => linked.has(id))) status = 'covered';
      else if (dispositions.every((item) => item === 'not_applicable')) status = 'not_applicable';
      else if (executableRouteIds.length > 0) diagnostics.push(diagnostic(
        'traceability', 'REQUIREMENT_CASE_TRACE_MISSING', `/coverage/requirements/${pointerPart(factId)}`, 'an executable fact route requires a reverse Case association'
      ));
    }
    requirementEntries.push({ fact_id: factId, status });
  }
  requirementEntries.sort((left, right) => compareCodePoints(left.fact_id, right.fact_id));

  const formalEntries = points.map((point) => ({
    obligation_id: String(point.obligation_id), status: String(point.classification)
  })).sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  const executableEntries = [];
  for (const caseDraft of grounded) for (const obligationId of strings(caseDraft.obligation_ids)) executableEntries.push({
    obligation_id: obligationId, case_id: String(caseDraft.case_id)
  });
  executableEntries.sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id)
    || compareCodePoints(left.case_id, right.case_id));
  const applicable = formalEntries.filter((item) => item.status !== 'not_applicable');
  const covered = applicable.filter((item) => item.status === 'grounded' || item.status === 'conditional');
  const groundedIds = new Set(formalEntries.filter((item) => item.status === 'grounded').map((item) => item.obligation_id));
  const highBlocked = blocked.some((item) => item.risk === 'critical' || item.risk === 'high');
  const deliveryStatus = applicable.length === 0
    ? 'no_applicable_formal_test_points'
    : executableCases.length === 0 && blocked.length > 0
      ? 'no_deterministic_cases'
      : executableCases.length > 0 && highBlocked
        ? 'critical_gaps'
        : executableCases.length > 0
          ? 'executable_subset_ready'
          : '';
  if (!deliveryStatus) diagnostics.push(diagnostic(
    'coverage', 'FINAL_STATUS_UNRESOLVED', '/quality/delivery_status', 'formal dispositions do not resolve to one frozen delivery status'
  ));

  if (diagnostics.length > 0) throw new BundleReconciliationError(diagnostics);
  const bundle = {
    schema_version: '1.0.0',
    source_revision: normalized.sourceRevision,
    grounded: grounded.sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id))),
    conditional: conditional.sort((left, right) => compareCodePoints(String(left.case_id), String(right.case_id))),
    blocked: blocked.sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id))),
    exploratory,
    coverage: {
      requirements: { total: requirementEntries.length, accounted: requirementEntries.length, entries: requirementEntries },
      formal: { total: formalEntries.length, covered: covered.length, entries: formalEntries },
      executable: { total: groundedIds.size, grounded: groundedIds.size, entries: executableEntries },
      expert_recall: { status: 'benchmark_only', limits: normalized.expertLimits },
      not_applicable: notApplicable
    },
    quality: {
      delivery_status: deliveryStatus,
      compiler_version: normalized.compilerVersion,
      schema_version: '1.0.0',
      lineage: normalized.lineage,
      limits: normalized.limits
    }
  };
  const canonicalBundle = JSON.parse(canonicalStringify(bundle));
  const outputDiagnostics = [
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(canonicalBundle, testBundleSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(canonicalBundle))
  ];
  if (outputDiagnostics.length > 0) throw new BundleReconciliationError(outputDiagnostics);
  return canonicalBundle;
}

/**
 * Public fail-closed boundary. No malformed descriptor graph may leak a raw
 * exception or be read again after the trusted snapshot is captured.
 * @param {unknown} context
 */
export function buildBundle(context) {
  try {
    return buildBundleTrusted(context);
  } catch (error) {
    if (error instanceof BundleReconciliationError) throw error;
    throw new BundleReconciliationError([
      diagnostic('schema', 'INPUT_NORMALIZATION_FAILED', '/', 'Task 10 input could not be safely normalized')
    ]);
  }
}
