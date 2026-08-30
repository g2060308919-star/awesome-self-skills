import evidenceClaimsSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import caseDraftsSchema from '../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json' with { type: 'json' };
import testBundleSchema from '../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json' with { type: 'json' };
import testObligationsSchema from '../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify, stableId } from './canonical.mjs';
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

/**
 * Build one sparse accepted-evidence DAG index. Forest ancestry uses DFS
 * intervals; general DAG queries keep only traversal-local state and never
 * copy every required Oracle label through the graph.
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {Diagnostic[]} diagnostics
 */
function buildEvidenceGraph(claimsById, diagnostics) {
  /** @type {Map<string, string[]>} */
  const parentsByClaim = new Map();
  /** @type {Map<string, string[]>} */
  const childrenByClaim = new Map();
  const indegree = new Map();
  let forest = true;
  for (const claimId of claimsById.keys()) {
    parentsByClaim.set(claimId, []);
    childrenByClaim.set(claimId, []);
    indegree.set(claimId, 0);
  }
  for (const [claimId, claim] of claimsById) for (const parentId of strings(claim.parent_claim_ids)) {
    if (!claimsById.has(parentId)) {
      diagnostics.push(diagnostic(
        'reference', 'EVIDENCE_PARENT_UNKNOWN', `/evidence_claims/claims/${pointerPart(claimId)}/parent_claim_ids/${pointerPart(parentId)}`,
        'accepted evidence ancestry references an unknown parent'
      ));
      continue;
    }
    parentsByClaim.get(claimId)?.push(parentId);
    childrenByClaim.get(parentId)?.push(claimId);
    indegree.set(claimId, (indegree.get(claimId) ?? 0) + 1);
    if ((indegree.get(claimId) ?? 0) > 1) forest = false;
  }
  /** @type {string[]} */
  const queue = [];
  for (const [claimId, degree] of indegree) if (degree === 0) queue.push(claimId);
  queue.sort(compareCodePoints);
  let cursor = 0;
  while (cursor < queue.length) {
    const claimId = /** @type {string} */ (queue[cursor]);
    cursor += 1;
    const children = /** @type {string[]} */ (childrenByClaim.get(claimId) ?? []);
    children.sort(compareCodePoints);
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const childId = /** @type {string} */ (children[childIndex]);
      const remaining = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, remaining);
      if (remaining === 0) queue.push(childId);
    }
  }
  if (cursor !== claimsById.size) diagnostics.push(diagnostic(
    'traceability', 'EVIDENCE_ANCESTRY_INVALID', '/evidence_claims/claims', 'accepted evidence ancestry must be an acyclic closed graph'
  ));
  if (cursor !== claimsById.size) forest = false;

  const componentByClaim = new Map();
  let component = 0;
  for (const claimId of [...claimsById.keys()].sort(compareCodePoints)) {
    if (componentByClaim.has(claimId)) continue;
    const pending = [claimId];
    componentByClaim.set(claimId, component);
    let position = 0;
    while (position < pending.length) {
      const current = pending[position];
      position += 1;
      const neighbors = [...(parentsByClaim.get(current) ?? []), ...(childrenByClaim.get(current) ?? [])].sort(compareCodePoints);
      for (const neighbor of neighbors) if (!componentByClaim.has(neighbor)) {
        componentByClaim.set(neighbor, component);
        pending.push(neighbor);
      }
    }
    component += 1;
  }

  const entryByClaim = new Map();
  const exitByClaim = new Map();
  const topologicalIndexByClaim = new Map();
  for (let index = 0; index < cursor; index += 1) topologicalIndexByClaim.set(queue[index], index);
  if (forest) {
    let time = 0;
    const roots = [...claimsById.keys()].filter((claimId) => (parentsByClaim.get(claimId)?.length ?? 0) === 0).sort(compareCodePoints);
    for (const root of roots) {
      /** @type {Array<{claimId:string,exit:boolean}>} */
      const pending = [{ claimId: root, exit: false }];
      while (pending.length > 0) {
        const item = /** @type {{claimId:string,exit:boolean}} */ (pending.pop());
        if (item.exit) {
          exitByClaim.set(item.claimId, time - 1);
          continue;
        }
        entryByClaim.set(item.claimId, time);
        time += 1;
        pending.push({ claimId: item.claimId, exit: true });
        const children = childrenByClaim.get(item.claimId) ?? [];
        for (let index = children.length - 1; index >= 0; index -= 1) pending.push({ claimId: children[index], exit: false });
      }
    }
  }
  return {
    claimsById, parentsByClaim, childrenByClaim, componentByClaim,
    entryByClaim, exitByClaim, topologicalIndexByClaim, forest
  };
}

/**
 * @param {string} ancestor
 * @param {string} descendant
 * @param {ReturnType<typeof buildEvidenceGraph>} graph
 */
function isEvidenceAncestor(ancestor, descendant, graph) {
  if (ancestor === descendant) return graph.claimsById.has(ancestor);
  if (!graph.claimsById.has(ancestor) || !graph.claimsById.has(descendant)
    || graph.componentByClaim.get(ancestor) !== graph.componentByClaim.get(descendant)) return false;
  if (graph.forest) {
    const ancestorEntry = graph.entryByClaim.get(ancestor);
    const descendantEntry = graph.entryByClaim.get(descendant);
    return ancestorEntry !== undefined && descendantEntry !== undefined
      && ancestorEntry <= descendantEntry && descendantEntry <= (graph.exitByClaim.get(ancestor) ?? -1);
  }
  if ((graph.topologicalIndexByClaim.get(ancestor) ?? Number.MAX_SAFE_INTEGER)
    >= (graph.topologicalIndexByClaim.get(descendant) ?? -1)) return false;
  const pending = [descendant];
  const visited = new Set();
  let found = false;
  while (pending.length > 0 && !found) {
    const claimId = /** @type {string} */ (pending.pop());
    if (claimId === ancestor) {
      found = true;
      break;
    }
    if (visited.has(claimId)) continue;
    visited.add(claimId);
    const parents = graph.parentsByClaim.get(claimId) ?? [];
    for (let index = parents.length - 1; index >= 0; index -= 1) pending.push(parents[index]);
  }
  return found;
}

/** @param {string} left @param {string} right @param {ReturnType<typeof buildEvidenceGraph>} graph */
function isEvidenceRelated(left, right, graph) {
  return isEvidenceAncestor(left, right, graph) || isEvidenceAncestor(right, left, graph);
}

/** @param {number} size */
function fenwick(size) {
  const tree = new Array(size + 1).fill(0);
  return {
    /** @param {number} index @param {number} delta */
    add(index, delta) {
      for (let cursor = index + 1; cursor < tree.length; cursor += cursor & -cursor) tree[cursor] += delta;
    },
    /** @param {number} end */
    sum(end) {
      let total = 0;
      for (let cursor = end; cursor > 0; cursor -= cursor & -cursor) total += tree[cursor];
      return total;
    },
    /** @param {number} target */
    lowerBound(target) {
      let index = 0;
      let step = 1;
      while (step * 2 < tree.length) step *= 2;
      for (; step > 0; step = Math.floor(step / 2)) {
        const next = index + step;
        if (next < tree.length && tree[next] < target) {
          index = next;
          target -= tree[next];
        }
      }
      return index;
    }
  };
}

/**
 * Exact matching for forest ancestry: qualifying expectation sets are nested
 * or disjoint subtrees, so deepest-first interval allocation is sufficient.
 * @param {Array<{required:string[]}>} requirements
 * @param {Array<{evidenceRef:string}>} expectations
 * @param {ReturnType<typeof buildEvidenceGraph>} graph
 */
function matchForestOracleOwnership(requirements, expectations, graph) {
  const anchors = [];
  for (const requirement of requirements) {
    if (requirement.required.length === 0) return false;
    let anchor = requirement.required[0];
    for (let index = 1; index < requirement.required.length; index += 1) {
      const candidate = requirement.required[index];
      if (isEvidenceAncestor(anchor, candidate, graph)) anchor = candidate;
      else if (!isEvidenceAncestor(candidate, anchor, graph)) return null;
    }
    const start = graph.entryByClaim.get(anchor);
    const end = graph.exitByClaim.get(anchor);
    if (start === undefined || end === undefined) return false;
    anchors.push({ start, end });
  }
  anchors.sort((left, right) => right.start - left.start || left.end - right.end);
  /** @type {number[]} */
  const positions = [];
  for (const expectation of expectations) {
    const position = graph.entryByClaim.get(expectation.evidenceRef);
    if (position !== undefined) positions.push(position);
  }
  positions.sort((left, right) => left - right);
  const capacity = fenwick(positions.length);
  for (let index = 0; index < positions.length; index += 1) capacity.add(index, 1);
  /** @param {number} target @param {boolean} after */
  const localBoundary = (target, after) => {
    let low = 0;
    let high = positions.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (positions[middle] < target || (after && positions[middle] === target)) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  for (const anchor of anchors) {
    const start = localBoundary(anchor.start, false);
    const end = localBoundary(anchor.end, true);
    const before = capacity.sum(start);
    if (capacity.sum(end) === before) return false;
    const position = capacity.lowerBound(before + 1);
    capacity.add(position, -1);
  }
  return true;
}

/**
 * General-DAG fallback searches accepted evidence descendants while building
 * an augmenting path. It stores O(graph + requirements + expectations) state,
 * stops as soon as a free concrete expectation is found, and never materializes
 * the potentially dense transitive obligation/expectation relation.
 * @param {Array<{required:string[]}>} requirements
 * @param {Array<{evidenceRef:string}>} expectations
 * @param {ReturnType<typeof buildEvidenceGraph>} graph
 */
function matchGeneralOracleOwnership(requirements, expectations, graph) {
  const matchedRequirementByExpectation = new Array(expectations.length).fill(-1);
  const matchedExpectationByRequirement = new Array(requirements.length).fill(-1);
  /** @type {Map<string, number[]>} */
  const expectationsByClaim = new Map();
  for (let index = 0; index < expectations.length; index += 1) {
    const claimId = expectations[index].evidenceRef;
    const atClaim = expectationsByClaim.get(claimId) ?? [];
    atClaim.push(index);
    expectationsByClaim.set(claimId, atClaim);
  }
  /** @type {string[]} */
  const anchorByRequirement = [];
  /** @type {Set<string>[]} */
  const requiredRootsByRequirement = [];
  /** @type {string[]} */
  const requiredSignatureByRequirement = [];
  for (const requirement of requirements) {
    if (requirement.required.length === 0
      || requirement.required.some((root) => !graph.claimsById.has(root))) return false;
    let anchor = requirement.required[0];
    for (let index = 1; index < requirement.required.length; index += 1) {
      const candidate = requirement.required[index];
      if ((graph.topologicalIndexByClaim.get(candidate) ?? -1)
        > (graph.topologicalIndexByClaim.get(anchor) ?? -1)) anchor = candidate;
    }
    anchorByRequirement.push(anchor);
    const roots = new Set(requirement.required);
    requiredRootsByRequirement.push(roots);
    requiredSignatureByRequirement.push(canonicalStringify([...roots].sort(compareCodePoints)));
  }
  const requirementOrder = requirements.map((_, index) => index).sort((left, right) =>
    (graph.topologicalIndexByClaim.get(anchorByRequirement[right]) ?? -1)
      - (graph.topologicalIndexByClaim.get(anchorByRequirement[left]) ?? -1)
    || left - right);
  let lastCompatibilitySignature = '';
  let lastCompatibilityRepresentative = '';
  let lastCompatibilityResult = false;
  /** @param {number} requirementIndex @param {string} claimId */
  const compatible = (requirementIndex, claimId) => {
    const requiredRoots = requiredRootsByRequirement[requirementIndex];
    if (requiredRoots.size === 1) return true;
    let representative = claimId;
    let climbBudget = graph.claimsById.size;
    while (!requiredRoots.has(representative) && climbBudget > 0) {
      climbBudget -= 1;
      const parents = graph.parentsByClaim.get(representative) ?? [];
      if (parents.length !== 1) break;
      representative = parents[0];
    }
    const signature = requiredSignatureByRequirement[requirementIndex];
    if (signature === lastCompatibilitySignature && representative === lastCompatibilityRepresentative) {
      return lastCompatibilityResult;
    }
    const pending = [representative];
    const visited = new Set();
    let found = 0;
    while (pending.length > 0 && found < requiredRoots.size) {
      const current = /** @type {string} */ (pending.pop());
      if (visited.has(current)) continue;
      visited.add(current);
      if (requiredRoots.has(current)) found += 1;
      const parents = graph.parentsByClaim.get(current) ?? [];
      for (let index = parents.length - 1; index >= 0; index -= 1) pending.push(parents[index]);
    }
    lastCompatibilitySignature = signature;
    lastCompatibilityRepresentative = representative;
    lastCompatibilityResult = found === requiredRoots.size;
    return lastCompatibilityResult;
  };
  for (const start of requirementOrder) {
    const seenRequirements = new Set([start]);
    const seenExpectations = new Set();
    const parentRequirementByExpectation = new Array(expectations.length).fill(-1);
    const queue = [start];
    let cursor = 0;
    let freeExpectation = -1;
    while (cursor < queue.length && freeExpectation < 0) {
      const requirementIndex = queue[cursor];
      cursor += 1;
      const pendingClaims = [anchorByRequirement[requirementIndex]];
      const seenClaims = new Set();
      let claimCursor = 0;
      while (claimCursor < pendingClaims.length && freeExpectation < 0) {
        const claimId = pendingClaims[claimCursor];
        claimCursor += 1;
        if (seenClaims.has(claimId)) continue;
        seenClaims.add(claimId);
        const atClaim = expectationsByClaim.get(claimId) ?? [];
        if (atClaim.length > 0 && compatible(requirementIndex, claimId)) {
          for (let offset = 0; offset < atClaim.length; offset += 1) {
            const expectationIndex = atClaim[offset];
            if (seenExpectations.has(expectationIndex)) continue;
            seenExpectations.add(expectationIndex);
            parentRequirementByExpectation[expectationIndex] = requirementIndex;
            const matched = matchedRequirementByExpectation[expectationIndex];
            if (matched < 0) {
              freeExpectation = expectationIndex;
              break;
            }
            if (!seenRequirements.has(matched)) {
              seenRequirements.add(matched);
              queue.push(matched);
            }
          }
        }
        const children = graph.childrenByClaim.get(claimId) ?? [];
        for (let childIndex = 0; childIndex < children.length; childIndex += 1) pendingClaims.push(children[childIndex]);
      }
    }
    if (freeExpectation < 0) return false;
    let expectationIndex = freeExpectation;
    while (expectationIndex >= 0) {
      const requirementIndex = parentRequirementByExpectation[expectationIndex];
      const previousExpectation = matchedExpectationByRequirement[requirementIndex];
      matchedExpectationByRequirement[requirementIndex] = expectationIndex;
      matchedRequirementByExpectation[expectationIndex] = requirementIndex;
      expectationIndex = previousExpectation;
    }
  }
  return true;
}

/** @param {Array<{required:string[]}>} requirements @param {Array<{evidenceRef:string}>} expectations @param {ReturnType<typeof buildEvidenceGraph>} graph */
function hasCompleteOracleOwnership(requirements, expectations, graph) {
  if (requirements.length > expectations.length) return false;
  if (graph.forest) {
    const forestResult = matchForestOracleOwnership(requirements, expectations, graph);
    if (forestResult !== null) return forestResult;
  }
  return matchGeneralOracleOwnership(requirements, expectations, graph);
}

/**
 * Rebuild the exact Task 8 direct-root summary from frozen Case fields.
 * @param {Record<string, unknown>} caseDraft
 * @param {Record<string, unknown>[]} obligations
 * @param {Map<string, Record<string, unknown>>} factsById
 * @param {boolean} [includeAssumption]
 */
function caseDirectEvidence(caseDraft, obligations, factsById, includeAssumption = true) {
  const direct = new Set();
  /** @param {unknown} value */
  const add = (value) => { if (typeof value === 'string' && value.length > 0) direct.add(value); };
  if (isRecord(caseDraft.role)) add(caseDraft.role.evidence_ref);
  for (const ref of strings(caseDraft.source_claim_ids)) add(ref);
  for (const factId of strings(caseDraft.fact_ids)) {
    const fact = factsById.get(factId);
    if (!fact) continue;
    add(fact.claim_id);
    for (const ref of strings(fact.source_claim_ids)) add(ref);
  }
  for (const obligation of obligations) {
    for (const ref of strings(obligation.source_claim_ids)) add(ref);
    for (const ref of strings(obligation.required_oracle_refs)) add(ref);
  }
  for (const precondition of records(caseDraft.preconditions)) {
    add(precondition.evidence_ref);
    for (const ref of strings(precondition.source_claim_ids)) add(ref);
  }
  for (const datum of records(caseDraft.data)) if (isRecord(datum.provenance)) add(datum.provenance.ref);
  for (const step of records(caseDraft.steps)) {
    add(step.action_evidence_ref);
    for (const expectation of records(step.expectations)) add(expectation.evidence_ref);
  }
  if (isRecord(caseDraft.testability_profile)) {
    for (const capability of records(caseDraft.testability_profile.capabilities)) add(capability.provenance_ref);
    for (const observer of records(caseDraft.testability_profile.observers)) add(observer.provenance_ref);
    for (const control of records(caseDraft.testability_profile.controls)) add(control.provenance_ref);
  }
  if (isRecord(caseDraft.post_state)) add(caseDraft.post_state.evidence_ref);
  if (isRecord(caseDraft.cleanup)) {
    if (caseDraft.cleanup.required === true) add(caseDraft.cleanup.evidence_ref);
    else if (caseDraft.cleanup.required === false) add(caseDraft.cleanup.no_cleanup_evidence_ref);
  }
  if (includeAssumption && isRecord(caseDraft.temporary_assumption)) add(caseDraft.temporary_assumption.claim_id);
  return [...direct].sort(compareCodePoints);
}

/**
 * Revalidate the frozen Task 8 lane gate from actual Case evidence and
 * structured approved-assumption provenance, excluding the assumption
 * declaration itself so it cannot authorize its own use.
 * @param {Record<string, unknown>} caseDraft
 * @param {string} lane
 * @param {Record<string, unknown>[]} obligations
 * @param {Map<string, Record<string, unknown>>} factsById
 * @param {ReturnType<typeof buildEvidenceGraph>} graph
 * @param {string} path
 * @param {Diagnostic[]} diagnostics
 */
function validateCaseAssumption(caseDraft, lane, obligations, factsById, graph, path, diagnostics) {
  const assumption = isRecord(caseDraft.temporary_assumption) ? caseDraft.temporary_assumption : null;
  if (lane === 'grounded' && assumption) diagnostics.push(diagnostic(
    'classification', 'CASE_TEMPORARY_ASSUMPTION_UNEXPECTED', `${path}/temporary_assumption`,
    'Grounded Cases cannot carry a temporary assumption'
  ));

  const structuredRoots = new Set();
  if (isRecord(caseDraft.testability_profile)) {
    for (const field of ['capabilities', 'observers', 'controls']) {
      for (const item of records(caseDraft.testability_profile[field])) {
        if (item.status === 'approved-assumption' && typeof item.provenance_ref === 'string') {
          structuredRoots.add(item.provenance_ref);
        }
      }
    }
  }
  const supportingRoots = caseDirectEvidence(caseDraft, obligations, factsById, false);
  const evidenceClosure = new Set();
  const pending = [...supportingRoots].sort(compareCodePoints);
  let cursor = 0;
  while (cursor < pending.length) {
    const claimId = pending[cursor];
    cursor += 1;
    if (evidenceClosure.has(claimId)) continue;
    evidenceClosure.add(claimId);
    for (const parentId of graph.parentsByClaim.get(claimId) ?? []) pending.push(parentId);
  }
  const downgradeRoots = new Set(structuredRoots);
  for (const claimId of evidenceClosure) if (graph.claimsById.get(claimId)?.level === 'E1') downgradeRoots.add(claimId);

  const supportRecords = [];
  if (isRecord(caseDraft.role)) supportRecords.push(caseDraft.role);
  supportRecords.push(...records(caseDraft.preconditions), ...records(caseDraft.data));
  for (const step of records(caseDraft.steps)) {
    supportRecords.push(step, ...records(step.expectations));
  }
  if (isRecord(caseDraft.post_state)) supportRecords.push(caseDraft.post_state);
  if (isRecord(caseDraft.cleanup)) supportRecords.push(caseDraft.cleanup);
  for (const item of supportRecords) if (item.support_review !== 'supported') diagnostics.push(diagnostic(
    'classification', 'CASE_SUPPORT_REVIEW_INVALID', path,
    'executable Case evidence must have supported support reviews'
  ));

  if (lane === 'grounded') {
    if (downgradeRoots.size > 0) diagnostics.push(diagnostic(
      'classification', 'CASE_GROUNDED_DOWNGRADE_ROOT_INVALID', path,
      'Grounded Cases cannot depend on E1 or approved-assumption evidence'
    ));
    return;
  }
  if (lane !== 'conditional') return;
  const assumptionId = assumption && typeof assumption.claim_id === 'string' ? assumption.claim_id : '';
  const assumptionClaim = graph.claimsById.get(assumptionId);
  if (!assumption || assumptionId.length === 0 || !assumptionClaim
    || (assumptionClaim.level !== 'E1' && !structuredRoots.has(assumptionId))
    || typeof assumptionClaim.scope !== 'string' || typeof caseDraft.scope !== 'string'
    || !scopeContains(assumptionClaim.scope, caseDraft.scope)) diagnostics.push(diagnostic(
    'classification', 'CASE_TEMPORARY_ASSUMPTION_INVALID', `${path}/temporary_assumption`,
    'Conditional temporary assumption must be accepted E1 or approved-assumption evidence covering the Case scope'
  ));
  if (downgradeRoots.size === 0) diagnostics.push(diagnostic(
    'classification', 'CASE_DOWNGRADE_ROOT_MISSING', path,
    'Conditional Case requires exactly one independently derived downgrade root'
  ));
  else if (downgradeRoots.size > 1) diagnostics.push(diagnostic(
    'classification', 'CASE_DOWNGRADE_ROOTS_AMBIGUOUS', path,
    'frozen Conditional Case schema cannot represent more than one downgrade root'
  ));
  else if (!downgradeRoots.has(assumptionId)) diagnostics.push(diagnostic(
    'traceability', 'CASE_TEMPORARY_ASSUMPTION_MISMATCH', `${path}/temporary_assumption/claim_id`,
    'temporary assumption must identify the sole downgrade root derived from actual Case support'
  ));
}

/**
 * @param {Record<string, unknown>} caseDraft
 * @param {string} lane
 * @param {Map<string, Record<string, unknown>>} obligationsById
 * @param {Map<string, Record<string, unknown>>} routesByFact
 * @param {Map<string, Record<string, unknown>>} factsById
 * @param {Map<string, Set<string>>} factIdsByObligation
 * @param {Map<string, Record<string, unknown>>} pointsById
 * @param {ReturnType<typeof buildEvidenceGraph>} evidenceGraph
 * @param {Diagnostic[]} diagnostics
 */
function validateCaseTraceability(
  caseDraft, lane, obligationsById, routesByFact, factsById,
  factIdsByObligation, pointsById, evidenceGraph, diagnostics
) {
  const caseId = typeof caseDraft.case_id === 'string' ? caseDraft.case_id : 'invalid';
  const path = `/${lane}/${pointerPart(caseId)}`;
  const factIds = strings(caseDraft.fact_ids);
  const obligationIds = strings(caseDraft.obligation_ids);
  const linkedObligations = [];
  for (const obligationId of obligationIds) {
    const obligation = obligationsById.get(obligationId);
    if (!obligation) diagnostics.push(diagnostic(
      'reference', 'CASE_OBLIGATION_UNKNOWN', `${path}/obligation_ids/${pointerPart(obligationId)}`, 'Case references an unknown formal Test Point'
    ));
    else {
      linkedObligations.push(obligation);
      const point = pointsById.get(obligationId);
      if (point?.classification !== lane) diagnostics.push(diagnostic(
        'traceability', 'CASE_DISPOSITION_MISMATCH', `${path}/obligation_ids/${pointerPart(obligationId)}`, 'Case lane and final formal disposition must match'
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
  const requiredFactIds = new Set();
  for (const obligationId of obligationIds) {
    for (const factId of factIdsByObligation.get(obligationId) ?? []) requiredFactIds.add(factId);
  }
  const submittedFactIds = new Set(factIds);
  for (const factId of requiredFactIds) if (!submittedFactIds.has(factId)) diagnostics.push(diagnostic(
    'traceability', 'CASE_FACT_ROUTE_LINK_MISSING', `${path}/fact_ids/${pointerPart(factId)}`,
    'every Case must include every normative fact routed to one of its linked formal Test Points'
  ));
  validateCaseAssumption(caseDraft, lane, linkedObligations, factsById, evidenceGraph, path, diagnostics);
  const actualEvidence = caseDirectEvidence(caseDraft, linkedObligations, factsById);
  const submittedEvidence = strings(caseDraft.evidence_refs).sort(compareCodePoints);
  for (const ref of actualEvidence) {
    const claim = evidenceGraph.claimsById.get(ref);
    if (!claim) diagnostics.push(diagnostic(
      'reference', 'CASE_EVIDENCE_REFERENCE_UNKNOWN', `${path}/evidence_refs/${pointerPart(ref)}`,
      'every direct Case evidence reference must exist in accepted evidence'
    ));
  }
  if (canonicalStringify(actualEvidence) !== canonicalStringify(submittedEvidence)) diagnostics.push(diagnostic(
    'traceability', 'CASE_EVIDENCE_SUMMARY_MISMATCH', `${path}/evidence_refs`,
    'Case evidence_refs must exactly summarize all direct evidence roots used by frozen Case fields'
  ));
  const formalRoots = new Set();
  for (const obligation of linkedObligations) {
    for (const ref of strings(obligation.source_claim_ids)) formalRoots.add(ref);
    for (const ref of strings(obligation.required_oracle_refs)) formalRoots.add(ref);
  }
  for (const factId of factIds) {
    const fact = factsById.get(factId);
    if (!fact) continue;
    formalRoots.add(String(fact.claim_id ?? ''));
    for (const ref of strings(fact.source_claim_ids)) formalRoots.add(ref);
  }
  for (const ref of strings(caseDraft.source_claim_ids)) if (![...formalRoots].some(
    (root) => isEvidenceAncestor(ref, root, evidenceGraph)
  )) diagnostics.push(diagnostic(
    'traceability', 'CASE_SOURCE_CLAIM_OUTSIDE_CLOSURE', `${path}/source_claim_ids/${pointerPart(ref)}`,
    'Case source_claim_ids must stay inside the linked formal evidence ancestry'
  ));
  const expectations = caseExpectations(caseDraft);
  const expectationIds = strings(expectations.map((item) => item.expectation_id));
  const signature = isRecord(caseDraft.execution_signature) ? caseDraft.execution_signature : {};
  const submittedOracleIds = strings(signature.oracle_refs);
  if (expectations.length < obligationIds.length || expectationIds.length !== expectations.length
    || new Set(expectationIds).size !== expectationIds.length || !sameStrings(expectationIds, submittedOracleIds)) diagnostics.push(diagnostic(
    'traceability', 'CASE_ORACLE_TRACE_MISSING', `${path}/execution_signature/oracle_refs`,
    'every covered Test Point requires a distinct independently locatable expectation Oracle'
  ));
  /** @type {Array<{required:string[]}>} */
  const requirementList = [];
  for (const obligationId of obligationIds) {
    const oracleRoots = strings(obligationsById.get(obligationId)?.required_oracle_refs).sort(compareCodePoints);
    requirementList.push({ required: oracleRoots });
  }
  /** @type {Array<{evidenceRef:string}>} */
  const expectationList = [];
  for (const expectation of expectations) {
    const evidenceRef = String(expectation.evidence_ref ?? '');
    expectationList.push({ evidenceRef });
  }
  if (!hasCompleteOracleOwnership(requirementList, expectationList, evidenceGraph)) diagnostics.push(diagnostic(
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
  canonicalStrings(root.evidence_refs, `${path}/evidence_refs`, diagnostics);
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
    const expectedId = stableId('root', {
      missing_type: String(entry.missing_type ?? ''), semantic_refs: semanticRefs, scope: String(entry.scope ?? '')
    });
    if (rootId !== expectedId) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_ID_MISMATCH', `/clarification/state/root_snapshot_ledger/${pointerPart(rootId)}/root_issue_id`,
      'root ledger identity must derive from its canonical semantic key'
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
  const dispositionById = new Map();
  for (const disposition of dispositions) {
    const rootId = String(disposition.root_issue_id ?? '');
    requireClosed(disposition, ['root_issue_id', 'status'], `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}`, diagnostics, 'ROOT_LEDGER_PROPERTY_UNKNOWN');
    if (dispositionIds.has(rootId)) diagnostics.push(diagnostic(
      'traceability', 'ROOT_LEDGER_DISPOSITION_DUPLICATE', `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}`,
      'each ledger root requires exactly one lifecycle disposition'
    ));
    dispositionIds.add(rootId);
    dispositionById.set(rootId, String(disposition.status ?? ''));
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
  for (const entry of ledger) {
    const rootId = String(entry.root_issue_id ?? '');
    const status = dispositionById.get(rootId);
    if (entry.current === true && (status === 'resolved_final' || status === 'resolved_temporary')) diagnostics.push(diagnostic(
      'classification', 'ROOT_LEDGER_DISPOSITION_CURRENT_INVALID', `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}`,
      'a current Blocked root cannot simultaneously be resolved'
    ));
    if (entry.current !== true && status === 'asked') diagnostics.push(diagnostic(
      'classification', 'ROOT_LEDGER_DISPOSITION_CURRENT_INVALID', `/clarification/state/root_issue_dispositions/${pointerPart(rootId)}`,
      'an asked Blocked root must remain current'
    ));
  }
  /** @type {Map<string, Map<string, Record<string, unknown>[]>>} */
  const currentByObligationReason = new Map();
  /** @type {Map<string, Map<string, Record<string, unknown>[]>>} */
  const retainedByObligationReason = new Map();
  for (const entry of ledger) {
    const status = dispositionById.get(String(entry.root_issue_id ?? ''));
    const target = entry.current === true ? currentByObligationReason
      : (status === 'suppressed_unknown' || status === 'suppressed_deferred' || status === 'open')
        ? retainedByObligationReason : null;
    if (!target) continue;
    const reasons = strings(entry.reasons);
    const obligationIds = strings(entry.affected_obligation_ids);
    for (let obligationIndex = 0; obligationIndex < obligationIds.length; obligationIndex += 1) {
      for (let reasonIndex = 0; reasonIndex < reasons.length; reasonIndex += 1) {
        const obligationId = obligationIds[obligationIndex];
        const reason = reasons[reasonIndex];
        const byReason = target.get(obligationId) ?? new Map();
        const matches = byReason.get(reason) ?? [];
        matches.push(entry);
        byReason.set(reason, matches);
        target.set(obligationId, byReason);
      }
    }
  }
  return { ledgerById, dispositionById, currentByObligationReason, retainedByObligationReason };
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
  const allFacts = records(normalized.evidenceClaims.fact_ledger);
  const obligationsById = new Map();
  const claimsById = new Map();
  for (const claim of records(normalized.evidenceClaims.claims)) {
    const claimId = String(claim.claim_id ?? '');
    if (claimsById.has(claimId)) diagnostics.push(diagnostic(
      'reference', 'EVIDENCE_CLAIM_DUPLICATE', `/evidence_claims/claims/${pointerPart(claimId)}`, 'accepted claim IDs must be unique'
    ));
    else claimsById.set(claimId, claim);
  }
  const allFactsById = new Map();
  const factsById = new Map();
  const facts = [];
  for (const fact of allFacts) {
    const factId = String(fact.fact_id ?? '');
    if (allFactsById.has(factId)) diagnostics.push(diagnostic(
      'coverage', 'REQUIREMENT_FACT_DUPLICATE', `/evidence_claims/fact_ledger/${pointerPart(factId)}`, 'accepted requirement fact IDs must be unique'
    ));
    else allFactsById.set(factId, fact);
    const claimRefs = [String(fact.claim_id ?? ''), ...strings(fact.source_claim_ids)];
    for (let index = 0; index < claimRefs.length; index += 1) if (!claimsById.has(claimRefs[index])) diagnostics.push(diagnostic(
      'reference', 'REQUIREMENT_FACT_CLAIM_UNKNOWN', `/evidence_claims/fact_ledger/${pointerPart(factId)}`, 'fact ledger references must exist in accepted evidence'
    ));
    const owningClaim = claimsById.get(String(fact.claim_id ?? ''));
    if (fact.status !== 'diagnostic' && (owningClaim?.kind === 'requirement' || owningClaim?.kind === 'assumption')) {
      facts.push(fact);
      factsById.set(factId, fact);
    }
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
    if (!allFactsById.has(factId)) diagnostics.push(diagnostic(
      'reference', 'FACT_ROUTE_FACT_UNKNOWN', `/fact_routes/${pointerPart(factId)}`, 'fact route references an unknown accepted requirement fact'
    ));
    else if (!factsById.has(factId)) diagnostics.push(diagnostic(
      'classification', 'FACT_ROUTE_NON_NORMATIVE', `/fact_routes/${pointerPart(factId)}`,
      'Task 7 formal routes may contain only normative requirement or assumption facts'
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
  const evidenceGraph = buildEvidenceGraph(claimsById, diagnostics);
  /** @type {Map<string, Set<string>>} */
  const factRootsByObligation = new Map();
  /** @type {Map<string, Set<string>>} */
  const factIdsByObligation = new Map();
  for (const route of factRoutes) if (route.route_type === 'obligations') {
    const fact = factsById.get(String(route.fact_id ?? ''));
    if (!fact) continue;
    const roots = [String(fact.claim_id ?? ''), ...strings(fact.source_claim_ids)];
    for (const obligationId of strings(route.obligation_ids)) {
      const target = factRootsByObligation.get(obligationId) ?? new Set();
      for (const ref of roots) target.add(ref);
      factRootsByObligation.set(obligationId, target);
      const factIds = factIdsByObligation.get(obligationId) ?? new Set();
      factIds.add(String(route.fact_id ?? ''));
      factIdsByObligation.set(obligationId, factIds);
    }
  }
  /** @type {Map<string, Set<string>>} */
  const formalRootsByObligation = new Map();
  for (const obligation of obligations) {
    const obligationId = String(obligation.obligation_id ?? '');
    for (const field of ['source_claim_ids', 'required_oracle_refs']) {
      for (const ref of strings(obligation[field])) if (!claimsById.has(ref)) diagnostics.push(diagnostic(
        'reference', 'FORMAL_EVIDENCE_REFERENCE_UNKNOWN',
        `/obligations/${pointerPart(obligationId)}/${field}/${pointerPart(ref)}`,
        'formal Test Point evidence roots must exist in accepted evidence before reconciliation'
      ));
    }
    const roots = new Set([
      ...strings(obligation.source_claim_ids), ...strings(obligation.required_oracle_refs),
      ...(factRootsByObligation.get(obligationId) ?? [])
    ]);
    formalRootsByObligation.set(obligationId, roots);
  }

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
      validateCaseTraceability(
        caseDraft, lane, obligationsById, routesByFact, factsById,
        factIdsByObligation, pointsById, evidenceGraph, diagnostics
      );
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
    canonicalStrings(item.evidence_refs, `/classification/blocked/${pointerPart(id)}/evidence_refs`, diagnostics);
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
  const rootLedger = validateRootLedger(
    roots, ledger, records(state.root_issue_dispositions), normalized.sourceRevision, diagnostics
  );
  for (const entry of ledger) {
    const rootId = String(entry.root_issue_id ?? '');
    const status = rootLedger.dispositionById.get(rootId);
    if (entry.current !== true && status !== 'suppressed_unknown'
      && status !== 'suppressed_deferred' && status !== 'open') continue;
    const evidenceRefs = strings(entry.evidence_refs);
    const semanticClaimRefs = strings(entry.semantic_refs).filter((ref) => claimsById.has(ref));
    const claimRefs = [...evidenceRefs, ...semanticClaimRefs];
    const affectedRoots = new Set();
    for (const obligationId of strings(entry.affected_obligation_ids)) {
      const formalRoots = formalRootsByObligation.get(obligationId);
      if (!formalRoots) {
        diagnostics.push(diagnostic(
          'reference', 'BLOCKED_ROOT_OBLIGATION_UNKNOWN', `/clarification/state/root_snapshot_ledger/${pointerPart(rootId)}/affected_obligation_ids/${pointerPart(obligationId)}`,
          'root ledger associations must reference a formal Test Point'
        ));
        continue;
      }
      for (const formalRef of formalRoots) affectedRoots.add(formalRef);
    }
    for (const ref of claimRefs) if (!claimsById.has(ref)
      || ![...affectedRoots].some((formalRef) => isEvidenceRelated(ref, formalRef, evidenceGraph))) diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_ROOT_EVIDENCE_INVALID', `/clarification/state/root_snapshot_ledger/${pointerPart(rootId)}/evidence_refs/${pointerPart(ref)}`,
      'Blocked root claim evidence must be accepted and related to one affected formal Test Point closure'
    ));
  }
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
    if (task8Blocker) for (const ref of strings(task8Blocker.evidence_refs)) {
      const formalRoots = formalRootsByObligation.get(obligationId) ?? new Set();
      if (!claimsById.has(ref) || ![...formalRoots].some((formalRef) => isEvidenceRelated(ref, formalRef, evidenceGraph))) diagnostics.push(diagnostic(
        'traceability', 'BLOCKED_ROOT_EVIDENCE_INVALID', `/classification/blocked/${pointerPart(obligationId)}/evidence_refs/${pointerPart(ref)}`,
        'Task 8 Blocked evidence must be accepted and related to the formal Test Point closure'
      ));
    }
    const currentCandidates = rootLedger.currentByObligationReason.get(obligationId)?.get(reason) ?? [];
    const retainedCandidates = rootLedger.retainedByObligationReason.get(obligationId)?.get(reason) ?? [];
    const candidates = currentCandidates.length > 0 ? currentCandidates : retainedCandidates;
    if (candidates.length !== 1) {
      diagnostics.push(diagnostic(
        'traceability', 'BLOCKED_ROOT_TRACE_INVALID', `/blocked/${pointerPart(obligationId)}`,
        `Blocked formal Test Point requires exactly one root issue; found ${candidates.length}`
      ));
      continue;
    }
    const root = candidates[0];
    if (task8Blocker && task8Blocker.root_issue_id !== root.root_issue_id) diagnostics.push(diagnostic(
      'traceability', 'BLOCKED_ROOT_ID_MISMATCH', `/classification/blocked/${pointerPart(obligationId)}/root_issue_id`,
      'Task 8 Blocked root identity must equal the selected authoritative Task 9 owner'
    ));
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
  const naByExclusionId = new Map();
  for (const item of naInput) {
    const obligationId = String(item.obligation_id ?? '');
    requireClosed(item, ['obligation_id', 'status', 'exclusion_claim_id', 'scope', 'support_review'], `/classification/not_applicable/${pointerPart(obligationId)}`, diagnostics, 'CONTEXT_PROPERTY_UNKNOWN');
    const obligation = obligationsById.get(obligationId);
    const exclusionId = String(item.exclusion_claim_id ?? '');
    const exclusion = claimsById.get(exclusionId);
    const sameExclusion = naByExclusionId.get(exclusionId) ?? [];
    sameExclusion.push(item);
    naByExclusionId.set(exclusionId, sameExclusion);
    if (naById.has(obligationId)) diagnostics.push(diagnostic('coverage', 'FORMAL_DISPOSITION_DUPLICATE', `/classification/not_applicable/${pointerPart(obligationId)}`, 'NotApplicable disposition must be unique'));
    else naById.set(obligationId, item);
    if (item.status !== 'not_applicable') diagnostics.push(diagnostic(
      'classification', 'NOT_APPLICABLE_STATUS_INVALID', `/classification/not_applicable/${pointerPart(obligationId)}/status`,
      'NotApplicable disposition status must be not_applicable'
    ));
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
      const obligationRoots = formalRootsByObligation.get(obligationId) ?? new Set();
      if ([...obligationRoots].some((root) => isEvidenceRelated(exclusionId, root, evidenceGraph))) diagnostics.push(diagnostic(
        'traceability', 'NOT_APPLICABLE_EXCLUSION_RELATED', `/classification/not_applicable/${pointerPart(obligationId)}/exclusion_claim_id`,
        'NotApplicable exclusion must be independent of the formal Test Point evidence closure'
      ));
    }
  }
  for (const route of factRoutes) if (route.route_type === 'not_applicable') {
    const factId = String(route.fact_id ?? '');
    const targetId = String(route.not_applicable_claim_id ?? '');
    const target = claimsById.get(targetId);
    if (!target || (target.level !== 'E3' && target.level !== 'E2')) diagnostics.push(diagnostic(
      'reference', 'NOT_APPLICABLE_ROUTE_TARGET_INVALID', `/fact_routes/${pointerPart(factId)}/not_applicable_claim_id`,
      'terminal NotApplicable route target must be accepted E3 or E2 exclusion evidence'
    ));
    const fact = factsById.get(factId);
    const factRoots = fact ? [String(fact.claim_id ?? ''), ...strings(fact.source_claim_ids)] : [];
    const primaryFactClaim = fact ? claimsById.get(String(fact.claim_id ?? '')) : undefined;
    if (target && (!primaryFactClaim || typeof target.scope !== 'string'
      || typeof primaryFactClaim.scope !== 'string' || !scopeContains(target.scope, primaryFactClaim.scope))) {
      diagnostics.push(diagnostic(
        'traceability', 'NOT_APPLICABLE_ROUTE_SCOPE_INVALID', `/fact_routes/${pointerPart(factId)}/not_applicable_claim_id`,
        'terminal NotApplicable exclusion scope must cover the routed normative fact scope'
      ));
    }
    if (target && factRoots.some((ref) => isEvidenceRelated(targetId, ref, evidenceGraph))) diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_ROUTE_TARGET_RELATED', `/fact_routes/${pointerPart(factId)}/not_applicable_claim_id`,
      'terminal NotApplicable exclusion must be independent of every routed fact evidence root'
    ));
    const matching = [];
    for (const item of naByExclusionId.get(targetId) ?? []) {
      if (item.exclusion_claim_id !== targetId || item.status !== 'not_applicable') continue;
      const obligation = obligationsById.get(String(item.obligation_id ?? ''));
      if (!obligation) continue;
      const obligationRoots = [...strings(obligation.source_claim_ids), ...strings(obligation.required_oracle_refs)];
      let related = false;
      for (let factIndex = 0; factIndex < factRoots.length && !related; factIndex += 1) {
        for (let rootIndex = 0; rootIndex < obligationRoots.length; rootIndex += 1) {
          if (isEvidenceRelated(factRoots[factIndex], obligationRoots[rootIndex], evidenceGraph)) {
            related = true;
            break;
          }
        }
      }
      if (related) matching.push(item);
    }
    if (matching.length !== 1) diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_ROUTE_DISPOSITION_MISMATCH', `/fact_routes/${pointerPart(factId)}/not_applicable_claim_id`,
      'terminal NotApplicable fact route must identify exactly one related verified disposition exclusion'
    ));
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
  const allFormalRoots = new Set();
  for (const roots of formalRootsByObligation.values()) for (const ref of roots) allFormalRoots.add(ref);
  const formalEvidence = new Set();
  const upward = [...allFormalRoots].sort(compareCodePoints);
  let evidenceCursor = 0;
  while (evidenceCursor < upward.length) {
    const claimId = upward[evidenceCursor];
    evidenceCursor += 1;
    if (!claimsById.has(claimId) || formalEvidence.has(claimId)) continue;
    formalEvidence.add(claimId);
    for (const parentId of evidenceGraph.parentsByClaim.get(claimId) ?? []) upward.push(parentId);
  }
  const formalDependence = new Set(formalEvidence);
  const downward = [...formalEvidence].sort(compareCodePoints);
  evidenceCursor = 0;
  while (evidenceCursor < downward.length) {
    const claimId = downward[evidenceCursor];
    evidenceCursor += 1;
    for (const childId of evidenceGraph.childrenByClaim.get(claimId) ?? []) {
      if (formalDependence.has(childId)) continue;
      formalDependence.add(childId);
      downward.push(childId);
    }
  }
  for (const item of exploratoryInput) {
    const exploratoryId = String(item.exploratory_id ?? '');
    requireClosed(
      item, ['exploratory_id', 'title', 'scope', 'risk', 'source_claim_ids'],
      `/classification/exploratory/${pointerPart(exploratoryId)}`, diagnostics, 'CONTEXT_PROPERTY_UNKNOWN'
    );
    canonicalStrings(
      item.source_claim_ids,
      `/classification/exploratory/${pointerPart(exploratoryId)}/source_claim_ids`, diagnostics, true
    );
    for (const ref of strings(item.source_claim_ids)) if (!claimsById.has(ref)
      || formalDependence.has(ref)) diagnostics.push(diagnostic(
      'traceability', 'EXPLORATORY_EVIDENCE_INVALID', `/classification/exploratory/${pointerPart(exploratoryId)}/source_claim_ids/${pointerPart(ref)}`,
      'Exploratory source evidence must be accepted and independent of every formal Test Point closure'
    ));
  }
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
  /** @type {Map<string, Set<number>>} */
  const caseIndexesByFact = new Map();
  /** @type {Map<string, Set<number>>} */
  const caseIndexesByObligation = new Map();
  for (let caseIndex = 0; caseIndex < executableCases.length; caseIndex += 1) {
    const caseDraft = executableCases[caseIndex];
    for (const factId of strings(caseDraft.fact_ids)) {
      const indexes = caseIndexesByFact.get(factId) ?? new Set();
      indexes.add(caseIndex);
      caseIndexesByFact.set(factId, indexes);
    }
    for (const obligationId of strings(caseDraft.obligation_ids)) {
      const indexes = caseIndexesByObligation.get(obligationId) ?? new Set();
      indexes.add(caseIndex);
      caseIndexesByObligation.set(obligationId, indexes);
    }
  }
  /** @param {string} factId @param {string} obligationId */
  const sharesCase = (factId, obligationId) => {
    const factCases = caseIndexesByFact.get(factId);
    const obligationCases = caseIndexesByObligation.get(obligationId);
    if (!factCases || !obligationCases) return false;
    const smaller = factCases.size <= obligationCases.size ? factCases : obligationCases;
    const larger = smaller === factCases ? obligationCases : factCases;
    for (const caseIndex of smaller) if (larger.has(caseIndex)) return true;
    return false;
  };
  const requirementEntries = [];
  for (const fact of facts) {
    const factId = String(fact.fact_id);
    const route = routesByFact.get(factId);
    let status = 'blocked';
    if (route?.route_type === 'not_applicable') status = 'not_applicable';
    else if (route?.route_type === 'obligations') {
      const obligationIds = strings(route.obligation_ids);
      const dispositions = obligationIds.map((id) => String(pointsById.get(id)?.classification ?? 'unknown'));
      const executableRouteIds = obligationIds.filter((id, index) => dispositions[index] === 'grounded' || dispositions[index] === 'conditional');
      if (executableRouteIds.length > 0 && executableRouteIds.every((id) => sharesCase(factId, id))) status = 'covered';
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
