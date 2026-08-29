import behaviorViewsSchema from '../../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import testObligationsSchema from '../../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify, stableId } from '../canonical.mjs';
import { scopeContains } from '../decision-record.mjs';
import { E2_TARGETS } from '../evidence.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../schema-validator.mjs';
import { auditInteractionMatrix } from '../views/interaction-matrix.mjs';
import { validateBehaviorViews } from '../views/validate-views.mjs';
import { compile as compileDecision } from './decision.mjs';
import { compile as compileFlow } from './flow.mjs';
import { compile as compileInputDomain } from './input-domain.mjs';
import { compile as compileIntegration } from './integration.mjs';
import { compile as compileRole } from './role.mjs';
import {
  compareCodePoints, createObligationRegistry, elementEvidenceRefs, isOracleEvidence,
  parseQualifiedViewElementRef, qualifyViewElementRef
} from './registry.mjs';
import { compile as compileState } from './state.mjs';
import { compile as compileTiming } from './timing.mjs';

/** @typedef {{category: string, code: string, path: string, message: string}} Diagnostic */

export class ObligationCompilationError extends TypeError {
  /** @param {Diagnostic[]} diagnostics */
  constructor(diagnostics) {
    super('test-obligation compilation requires revision');
    this.name = 'ObligationCompilationError';
    this.status = 'need_revision';
    this.stage = 'test_obligations';
    this.diagnostics = diagnostics.map((item) => ({ ...item }));
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {unknown} value @returns {value is Record<string, unknown>[]} */
function isDenseObjectArray(value) {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isObject(value[index])) return false;
  }
  return true;
}

/** @param {unknown} value @returns {string[]} */
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {unknown} value @returns {value is string} */
function isNonblankUnpadded(value) {
  return typeof value === 'string' && value.length > 0 && value.trim().length > 0 && value === value.trim();
}

/** @param {unknown} value @param {boolean} [nonempty] @returns {value is string[]} */
function isDenseUniqueStringArray(value, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) return false;
  const strings = new Set();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isNonblankUnpadded(value[index]) || strings.has(value[index])) return false;
    strings.add(value[index]);
  }
  return true;
}

/** @param {Record<string, unknown>} value @param {string[]} expected */
function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort(compareCodePoints);
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {string} value */
function pointerPart(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/**
 * JSON Schema validators commonly enumerate an array's present entries. Keep
 * holes visible before Task 4 gets a chance to normalize object arrays.
 * The iterative walk also avoids tying accepted artifact depth to call-stack
 * depth.
 * @param {Record<string, unknown>} artifact
 */
function sparseBehaviorDiagnostics(artifact) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Array<{value: unknown, path: string}>} */
  const pending = [{ value: artifact, path: '' }];
  const visited = new Set();
  while (pending.length > 0) {
    const current = /** @type {{value: unknown, path: string}} */ (pending.pop());
    const { value, path } = current;
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    if (Array.isArray(value)) {
      const presentIndexes = Object.keys(value)
        .filter((key) => {
          const index = Number(key);
          return Number.isSafeInteger(index) && index >= 0
            && index < value.length && String(index) === key;
        })
        .map(Number);
      if (presentIndexes.length !== value.length) {
        let firstMissing = 0;
        for (const index of presentIndexes) {
          if (index !== firstMissing) break;
          firstMissing += 1;
        }
        diagnostics.push(diagnostic(
          'schema', 'BEHAVIOR_ARRAY_SPARSE', `${path}/${firstMissing}`,
          `behavior artifact array has a missing entry at index ${firstMissing}`
        ));
      }
      for (const index of presentIndexes) {
        pending.push({ value: value[index], path: `${path}/${index}` });
      }
      continue;
    }
    for (const [key, child] of Object.entries(value)) {
      pending.push({ value: child, path: `${path}/${pointerPart(key)}` });
    }
  }
  return diagnostics;
}

const CANONICAL_BEHAVIOR_FIELDS = new Set([
  'scope', 'state', 'from_state', 'to_state', 'timing_event',
  'permissions', 'transition_order'
]);

/** @param {string} field */
function isCanonicalBehaviorField(field) {
  return CANONICAL_BEHAVIOR_FIELDS.has(field)
    || field.endsWith('_id') || field.endsWith('_ids') || field.endsWith('_refs');
}

/** @param {Record<string, unknown>} artifact */
function behaviorStringDiagnostics(artifact) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Array<{value: unknown, path: string, canonical: boolean}>} */
  const pending = [{ value: artifact, path: '', canonical: false }];
  const visited = new Set();
  while (pending.length > 0) {
    const { value, path, canonical } = /** @type {{value: unknown, path: string, canonical: boolean}} */ (pending.pop());
    if (typeof value === 'string') {
      if (canonical && !isNonblankUnpadded(value)) diagnostics.push(diagnostic(
        'schema', 'BEHAVIOR_STRING_INVALID', path,
        'persisted behavior identifiers, references, scopes, and capabilities must be nonblank and unpadded'
      ));
      continue;
    }
    if (!value || typeof value !== 'object' || visited.has(value)) continue;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      pending.push({
        value: child,
        path: `${path}/${pointerPart(key)}`,
        canonical: Array.isArray(value) ? canonical : isCanonicalBehaviorField(key)
      });
    }
  }
  return diagnostics;
}

/** @param {Record<string, unknown>} artifact */
function interactionStringDiagnostics(artifact) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  for (const [index, candidate] of objectArray(artifact.interaction_candidates).entries()) {
    const candidateId = typeof candidate.candidate_id === 'string' ? candidate.candidate_id : String(index);
    const path = `/interaction_candidates/${pointerPart(candidateId)}`;
    let valid = isNonblankUnpadded(candidate.candidate_id)
      && isDenseUniqueStringArray(candidate.module_ids, true);
    if (candidate.disposition === 'formal-view') {
      valid = valid && isNonblankUnpadded(candidate.formal_view_id)
        && isDenseUniqueStringArray(candidate.source_claim_ids, true);
    } else if (candidate.disposition === 'blocker') {
      valid = valid && isNonblankUnpadded(candidate.blocker_root_issue_id);
    } else if (candidate.disposition === 'exploratory') {
      valid = valid && isNonblankUnpadded(candidate.exploratory_id);
    }
    if (!valid) diagnostics.push(diagnostic(
      'schema', 'INTERACTION_ROUTE_STRING_INVALID', path,
      'interaction route IDs and references must be dense, nonblank, and unpadded'
    ));
  }
  return diagnostics;
}

/** @param {Diagnostic[]} diagnostics */
function sortDiagnostics(diagnostics) {
  const unique = new Map();
  for (const item of diagnostics) unique.set(JSON.stringify([item.category, item.code, item.path, item.message]), item);
  return [...unique.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([, item]) => item);
}

function defaultRegistry() {
  return createObligationRegistry()
    .registerObligationStrategy('flow', compileFlow)
    .registerObligationStrategy('decision', compileDecision)
    .registerObligationStrategy('state', compileState)
    .registerObligationStrategy('input-domain', compileInputDomain)
    .registerObligationStrategy('role', compileRole)
    .registerObligationStrategy('timing', compileTiming)
    .registerObligationStrategy('integration', compileIntegration);
}

/** @param {Diagnostic[]} diagnostics */
function assertNoDiagnostics(diagnostics) {
  if (diagnostics.length > 0) throw new ObligationCompilationError(sortDiagnostics(diagnostics));
}

/** @param {Record<string, unknown>} graph */
function compilationInputs(graph) {
  const input = isObject(graph.obligationCompilation) ? graph.obligationCompilation : null;
  if (!input) throw new ObligationCompilationError([
    diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_REQUIRED', '/obligationCompilation', 'explicit obligation compilation input is required')
  ]);
  const expected = [
    'contextsByViewId', 'customObligations', 'factRoutes', 'notApplicableReviews', 'sourceRevision'
  ];
  const actual = Object.keys(input).sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ObligationCompilationError([
      diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_NOT_CLOSED', '/obligationCompilation', 'obligation compilation input has unknown or missing fields')
    ]);
  }
  if (!(input.contextsByViewId instanceof Map)
    || !isDenseObjectArray(input.customObligations) || !isDenseObjectArray(input.factRoutes)
    || !isDenseObjectArray(input.notApplicableReviews)
    || !Number.isInteger(input.sourceRevision) || /** @type {number} */ (input.sourceRevision) < 0) {
    throw new ObligationCompilationError([
      diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_TYPE_INVALID', '/obligationCompilation', 'contextsByViewId must be a Map and route/obligation inputs must be arrays')
    ]);
  }
  return {
    contextsByViewId: /** @type {Map<unknown, unknown>} */ (input.contextsByViewId),
    customObligations: input.customObligations,
    factRoutes: input.factRoutes,
    notApplicableReviews: input.notApplicableReviews,
    sourceRevision: /** @type {number} */ (input.sourceRevision)
  };
}

const FACT_FIELDS = ['claim_id', 'fact_id', 'source_claim_ids', 'status'];
const FACT_STATUSES = new Set(['active', 'conflicted', 'ambiguous', 'diagnostic']);
const CLAIM_KINDS_BY_LEVEL = new Map([
  ['E1', new Set(['assumption'])],
  ['E2', new Set(['test-data', 'expected-value', 'model-element'])],
  ['E3', new Set(['requirement', 'description', 'example', 'diagnostic'])]
]);

/**
 * Validate Task 3's accepted in-memory graph without coercing an invalid graph
 * into an empty formal denominator.
 * @param {Record<string, unknown>} graph
 * @param {ReturnType<typeof compilationInputs>} inputs
 * @param {Record<string, unknown>} artifact
 * @param {Diagnostic[]} diagnostics
 */
function validateEvidenceInputs(graph, inputs, artifact, diagnostics) {
  if (!Object.hasOwn(graph, 'runScope') || !isNonblankUnpadded(graph.runScope)) diagnostics.push(diagnostic(
    'schema', 'EVIDENCE_RUN_SCOPE_INVALID', '/runScope',
    'accepted evidence graph requires an own nonblank unpadded runScope'
  ));
  /** @type {Map<string, Record<string, unknown>>} */
  const claimsById = new Map();
  if (!(graph.claimsById instanceof Map)) {
    diagnostics.push(diagnostic(
      'schema', 'EVIDENCE_CLAIMS_MAP_REQUIRED', '/claimsById',
      'accepted evidence claimsById must be a Map'
    ));
  } else {
    for (const [key, claim] of graph.claimsById) {
      const path = `/claimsById/${String(key)}`;
      if (!isNonblankUnpadded(key) || !isObject(claim)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_CLAIM_ENTRY_INVALID', path, 'accepted claim entries require a nonblank unpadded Map key and object value'));
        continue;
      }
      if (!isPlainRecord(claim)) {
        diagnostics.push(diagnostic(
          'schema', 'EVIDENCE_CLAIM_PROTOTYPE_INVALID', path,
          'accepted claim values must be own-property plain or null-prototype records'
        ));
        continue;
      }
      let descriptors;
      try {
        descriptors = Object.getOwnPropertyDescriptors(claim);
      } catch {
        diagnostics.push(diagnostic(
          'schema', 'EVIDENCE_CLAIM_DESCRIPTOR_INVALID', path,
          'accepted claim fields must be readable own data properties'
        ));
        continue;
      }
      const requiredDataFields = ['claim_id', 'level', 'kind', 'scope'];
      if (requiredDataFields.some((field) => !descriptors[field]
        || !Object.hasOwn(descriptors[field], 'value'))) {
        diagnostics.push(diagnostic(
          'schema', 'EVIDENCE_CLAIM_DESCRIPTOR_INVALID', path,
          'accepted claim fields must be readable own data properties'
        ));
        continue;
      }
      const claimId = descriptors.claim_id.value;
      const level = descriptors.level.value;
      const kind = descriptors.kind.value;
      const scope = descriptors.scope.value;
      if (claimId !== key || !isNonblankUnpadded(claimId)) {
        diagnostics.push(diagnostic('reference', 'EVIDENCE_CLAIM_KEY_MISMATCH', `${path}/claim_id`, 'claim Map key must exactly match its own claim_id'));
        continue;
      }
      if (!isNonblankUnpadded(level) || !isNonblankUnpadded(kind) || !isNonblankUnpadded(scope)
        || !CLAIM_KINDS_BY_LEVEL.get(level)?.has(kind)) {
        diagnostics.push(diagnostic(
          'schema', 'EVIDENCE_CLAIM_FIELDS_INVALID', path,
          'accepted claim level, kind, and scope must be own, unpadded, and use the frozen accepted enums'
        ));
        continue;
      }
      /** @type {string[]} */
      let parentClaimIds = [];
      let derivationKind;
      let derivationTarget;
      if (level === 'E2') {
        const e2Fields = ['derivation_kind', 'derivation_target'];
        if (e2Fields.some((field) => !descriptors[field]
          || !Object.hasOwn(descriptors[field], 'value'))) {
          diagnostics.push(diagnostic(
            'schema', 'EVIDENCE_CLAIM_DESCRIPTOR_INVALID', path,
            'accepted E2 derivation fields must be own data properties'
          ));
          continue;
        }
        if (!descriptors.parent_claim_ids) {
          diagnostics.push(diagnostic(
            'schema', 'EVIDENCE_CLAIM_PARENTS_INVALID', `${path}/parent_claim_ids`,
            'accepted E2 parent IDs must be an own nonempty dense unique array'
          ));
          continue;
        }
        if (!Object.hasOwn(descriptors.parent_claim_ids, 'value')) {
          diagnostics.push(diagnostic(
            'schema', 'EVIDENCE_CLAIM_DESCRIPTOR_INVALID', path,
            'accepted E2 derivation fields must be own data properties'
          ));
          continue;
        }
        derivationKind = descriptors.derivation_kind.value;
        derivationTarget = descriptors.derivation_target.value;
        const submittedParentClaimIds = descriptors.parent_claim_ids.value;
        if (!isDenseUniqueStringArray(submittedParentClaimIds, true)) {
          diagnostics.push(diagnostic(
            'schema', 'EVIDENCE_CLAIM_PARENTS_INVALID', `${path}/parent_claim_ids`,
            'accepted E2 parent IDs must be a nonempty dense unique array of nonblank unpadded IDs'
          ));
          continue;
        }
        parentClaimIds = [...submittedParentClaimIds];
        const allowedTargets = typeof derivationKind === 'string'
          ? E2_TARGETS[/** @type {keyof typeof E2_TARGETS} */ (derivationKind)] : undefined;
        if (typeof derivationTarget !== 'string' || !allowedTargets?.includes(derivationTarget)
          || kind !== derivationTarget) {
          diagnostics.push(diagnostic(
            'schema', 'EVIDENCE_CLAIM_DERIVATION_INVALID', path,
            'accepted E2 claims must match the frozen derivation kind/target matrix and claim kind'
          ));
          continue;
        }
      }
      claimsById.set(key, {
        claim_id: claimId, level, kind, scope, parent_claim_ids: [...parentClaimIds],
        ...(level === 'E2' ? {
          derivation_kind: derivationKind, derivation_target: derivationTarget
        } : {})
      });
    }
  }
  for (const [claimId, claim] of claimsById) {
    for (const parentId of stringArray(claim.parent_claim_ids)) {
      if (!claimsById.has(parentId)) diagnostics.push(diagnostic(
        'reference', 'EVIDENCE_CLAIM_PARENT_DANGLING', `/claimsById/${claimId}/parent_claim_ids/${parentId}`,
        `accepted claim references missing parent "${parentId}"`
      ));
    }
  }
  const cycle = firstClaimCycle(claimsById);
  if (cycle) diagnostics.push(diagnostic(
    'reference', 'EVIDENCE_CLAIM_CYCLE', `/claimsById/${pointerPart(cycle.claimId)}/parent_claim_ids/${pointerPart(cycle.parentId)}`,
    `accepted claim ancestry contains a cycle through "${cycle.claimId}" and "${cycle.parentId}"`
  ));

  /** @type {Record<string, unknown>[]} */
  const facts = [];
  if (!isDenseObjectArray(graph.factLedger)) {
    diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_LEDGER_INVALID', '/factLedger', 'factLedger must be a dense object array'));
  } else {
    const factIds = new Set();
    for (const fact of graph.factLedger) {
      const factId = typeof fact.fact_id === 'string' ? fact.fact_id : '';
      const path = `/factLedger/${factId || facts.length}`;
      let valid = true;
      if (!hasExactKeys(fact, FACT_FIELDS)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_NOT_CLOSED', path, 'fact entries must contain exactly fact_id, claim_id, status, and source_claim_ids'));
        valid = false;
      }
      if (!isNonblankUnpadded(factId) || !isNonblankUnpadded(fact.claim_id)
        || !FACT_STATUSES.has(String(fact.status)) || !isDenseUniqueStringArray(fact.source_claim_ids, true)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_FIELDS_INVALID', path, 'fact IDs, status, and source refs must satisfy the closed fact contract'));
        valid = false;
      }
      if (factIds.has(factId)) {
        diagnostics.push(diagnostic('schema', 'EVIDENCE_FACT_ID_DUPLICATE', `/factLedger/${factId}/fact_id`, `fact_id "${factId}" must be unique`));
        valid = false;
      }
      factIds.add(factId);
      if (isNonblankUnpadded(fact.claim_id) && !claimsById.has(fact.claim_id)) {
        diagnostics.push(diagnostic('reference', 'EVIDENCE_FACT_CLAIM_DANGLING', `${path}/claim_id`, `fact references missing accepted claim "${fact.claim_id}"`));
        valid = false;
      }
      for (const claimId of stringArray(fact.source_claim_ids)) {
        if (!claimsById.has(claimId)) {
          diagnostics.push(diagnostic('reference', 'EVIDENCE_FACT_SOURCE_DANGLING', `${path}/source_claim_ids/${claimId}`, `fact references missing accepted source claim "${claimId}"`));
          valid = false;
        }
      }
      if (valid) facts.push(fact);
    }
  }
  if (inputs.sourceRevision !== artifact.source_revision) diagnostics.push(diagnostic(
    'reference', 'OBLIGATION_SOURCE_REVISION_MISMATCH', '/obligationCompilation/sourceRevision',
    `compilation source revision ${inputs.sourceRevision} does not match behavior revision ${String(artifact.source_revision)}`
  ));
  const relations = claimRelations(claimsById);
  return { claimsById, facts, relations };
}

/** @param {Map<string, Record<string, unknown>>} claimsById */
function firstClaimCycle(claimsById) {
  const state = new Map();
  for (const start of [...claimsById.keys()].sort(compareCodePoints)) {
    if ((state.get(start) ?? 0) !== 0) continue;
    /** @type {Array<{claimId: string, parents: string[], next: number}>} */
    const stack = [{
      claimId: start,
      parents: [...stringArray(claimsById.get(start)?.parent_claim_ids)].sort(compareCodePoints),
      next: 0
    }];
    state.set(start, 1);
    while (stack.length > 0) {
      const frame = /** @type {{claimId: string, parents: string[], next: number}} */ (stack.at(-1));
      if (frame.next >= frame.parents.length) {
        state.set(frame.claimId, 2);
        stack.pop();
        continue;
      }
      const parentId = frame.parents[frame.next];
      frame.next += 1;
      const parentState = state.get(parentId) ?? 0;
      if (parentState === 1) return { claimId: frame.claimId, parentId };
      if (parentState === 2) continue;
      state.set(parentId, 1);
      stack.push({
        claimId: parentId,
        parents: [...stringArray(claimsById.get(parentId)?.parent_claim_ids)].sort(compareCodePoints),
        next: 0
      });
    }
  }
  return null;
}

/** @param {Map<string, Record<string, unknown>>} claimsById */
function claimRelations(claimsById) {
  /** @type {Map<string, Set<string>>} */
  const parentsById = new Map([...claimsById.keys()].map((claimId) => [claimId, new Set()]));
  /** @type {Map<string, Set<string>>} */
  const childrenById = new Map([...claimsById.keys()].map((claimId) => [claimId, new Set()]));
  for (const [claimId, claim] of claimsById) {
    for (const parentId of stringArray(claim.parent_claim_ids)) {
      parentsById.get(claimId)?.add(parentId);
      childrenById.get(parentId)?.add(claimId);
    }
  }
  const componentById = new Map();
  let componentId = 0;
  for (const rootId of [...claimsById.keys()].sort(compareCodePoints)) {
    if (componentById.has(rootId)) continue;
    const pending = [rootId];
    componentById.set(rootId, componentId);
    while (pending.length > 0) {
      const claimId = /** @type {string} */ (pending.pop());
      const neighbors = new Set([
        ...(parentsById.get(claimId) ?? []),
        ...(childrenById.get(claimId) ?? [])
      ]);
      for (const neighborId of neighbors) {
        if (componentById.has(neighborId)) continue;
        componentById.set(neighborId, componentId);
        pending.push(neighborId);
      }
    }
    componentId += 1;
  }
  /** @type {Map<string, {entry: number, exit: number}>} */
  const forestIntervalsById = new Map();
  const isSingleParentForest = [...parentsById.values()].every((parents) => parents.size <= 1);
  if (isSingleParentForest) {
    let sequence = 0;
    const roots = [...claimsById.keys()].filter((claimId) => parentsById.get(claimId)?.size === 0)
      .sort(compareCodePoints);
    for (const rootId of roots) {
      /** @type {Array<{claimId: string, exiting: boolean}>} */
      const pending = [{ claimId: rootId, exiting: false }];
      while (pending.length > 0) {
        const item = /** @type {{claimId: string, exiting: boolean}} */ (pending.pop());
        if (item.exiting) {
          const interval = forestIntervalsById.get(item.claimId);
          if (interval) interval.exit = sequence++;
          continue;
        }
        forestIntervalsById.set(item.claimId, { entry: sequence++, exit: -1 });
        pending.push({ claimId: item.claimId, exiting: true });
        const children = [...(childrenById.get(item.claimId) ?? [])].sort(compareCodePoints).reverse();
        for (const childId of children) pending.push({ claimId: childId, exiting: false });
      }
    }
  }
  return {
    parentsById,
    childrenById,
    componentById,
    forestIntervalsById,
    pairRelationCache: new Map(),
    directionalByRootSet: new Map(),
    descendantsByRootSet: new Map()
  };
}

/** @param {Map<string, Set<string>>} adjacency @param {Iterable<string>} roots */
function reachableClaims(adjacency, roots) {
  const reached = new Set(roots);
  const pending = [...reached];
  while (pending.length > 0) {
    const claimId = /** @type {string} */ (pending.pop());
    for (const relatedId of adjacency.get(claimId) ?? []) {
      if (reached.has(relatedId)) continue;
      reached.add(relatedId);
      pending.push(relatedId);
    }
  }
  return reached;
}

/** @param {Iterable<string>} roots */
function canonicalRootSet(roots) {
  return [...new Set(roots)].sort(compareCodePoints);
}

/**
 * @param {Map<string, Set<string>>} adjacency
 * @param {Iterable<string>} roots
 * @param {Map<string, Set<string>>} cache
 */
function cachedReachableClaims(adjacency, roots, cache) {
  const rootIds = canonicalRootSet(roots);
  const cacheKey = canonicalStringify(rootIds);
  let reached = cache.get(cacheKey);
  if (!reached) {
    reached = reachableClaims(adjacency, rootIds);
    cache.set(cacheKey, reached);
  }
  return reached;
}

/** @param {ReturnType<typeof claimRelations>} relations @param {Iterable<string>} roots */
function directionallyRelatedClaims(relations, roots) {
  const rootIds = canonicalRootSet(roots);
  const cacheKey = canonicalStringify(rootIds);
  let related = relations.directionalByRootSet.get(cacheKey);
  if (!related) {
    related = new Set([
      ...reachableClaims(relations.parentsById, rootIds),
      ...reachableClaims(relations.childrenById, rootIds)
    ]);
    relations.directionalByRootSet.set(cacheKey, related);
  }
  return related;
}

/**
 * @param {Map<string, Set<string>>} adjacency
 * @param {string} startId
 * @param {string} targetId
 */
function reachesClaim(adjacency, startId, targetId) {
  const visited = new Set([startId]);
  const pending = [startId];
  while (pending.length > 0) {
    const claimId = /** @type {string} */ (pending.pop());
    for (const relatedId of adjacency.get(claimId) ?? []) {
      if (relatedId === targetId) return true;
      if (visited.has(relatedId)) continue;
      visited.add(relatedId);
      pending.push(relatedId);
    }
  }
  return false;
}

/**
 * @param {ReturnType<typeof claimRelations>} relations
 * @param {string} leftId
 * @param {string} rightId
 */
function claimsDirectionallyRelated(relations, leftId, rightId) {
  if (leftId === rightId) return true;
  const pairKey = canonicalStringify([leftId, rightId].sort(compareCodePoints));
  const cached = relations.pairRelationCache.get(pairKey);
  if (cached !== undefined) return cached;
  let related = relations.componentById.get(leftId) === relations.componentById.get(rightId);
  if (related) {
    const left = relations.forestIntervalsById.get(leftId);
    const right = relations.forestIntervalsById.get(rightId);
    if (left && right) {
      const leftContainsRight = left.entry <= right.entry && right.exit <= left.exit;
      const rightContainsLeft = right.entry <= left.entry && left.exit <= right.exit;
      related = leftContainsRight || rightContainsLeft;
    } else {
      related = reachesClaim(relations.parentsById, leftId, rightId)
        || reachesClaim(relations.parentsById, rightId, leftId);
    }
  }
  relations.pairRelationCache.set(pairKey, related);
  return related;
}

const OBLIGATION_SET_FIELDS = [
  'source_claim_ids', 'view_element_refs', 'required_oracle_refs', 'required_capabilities'
];
const OBLIGATION_FIELDS = [
  'kind', 'obligation_id', 'required_capabilities', 'required_oracle_refs',
  'risk', 'scope', 'source_claim_ids', 'view_element_refs'
];
const CONTEXT_FIELDS_BY_VIEW_TYPE = Object.freeze({
  flow: ['loopMaximumsByElementId', 'requiredCapabilitiesByElementId', 'requiredOracleRefsByElementId', 'riskByElementId'],
  decision: ['requiredCapabilitiesByElementId', 'requiredOracleRefsByElementId', 'riskByElementId'],
  state: ['requiredCapabilitiesByElementId', 'requiredOracleRefsByElementId', 'riskByElementId'],
  'input-domain': ['responsibilityBindings'],
  role: ['responsibilityBindings'],
  timing: ['responsibilityBindings', 'timingSpecialResponsibilitiesByElementId'],
  integration: ['integrationInvariantsByElementId', 'integrationSpecialResponsibilitiesByElementId', 'responsibilityBindings']
});
const ELEMENT_CONTEXT_FIELDS = new Set([
  'riskByElementId', 'requiredOracleRefsByElementId', 'requiredCapabilitiesByElementId',
  'loopMaximumsByElementId', 'timingSpecialResponsibilitiesByElementId',
  'integrationInvariantsByElementId', 'integrationSpecialResponsibilitiesByElementId'
]);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainRecord(value) {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @returns {Array<[unknown, unknown]> | null} */
function ownEntries(value) {
  if (value instanceof Map) return [...value.entries()];
  if (!isPlainRecord(value)) return null;
  return Object.entries(value);
}

/**
 * Validate the private per-view strategy contract before spreading it into a
 * compiler. This makes inherited values unusable and proves every element map
 * key belongs to the submitted view.
 * @param {string} viewId
 * @param {Record<string, unknown>} view
 * @param {Record<string, unknown>} context
 * @param {Diagnostic[]} diagnostics
 */
function validateViewContext(viewId, view, context, diagnostics) {
  const path = `/obligationCompilation/contextsByViewId/${pointerPart(viewId)}`;
  let valid = true;
  if (!isPlainRecord(context)) {
    diagnostics.push(diagnostic(
      'schema', 'OBLIGATION_CONTEXT_PROTOTYPE_FORBIDDEN', path,
      'per-view compilation context must be an own-property plain object'
    ));
    valid = false;
  }
  const elementIds = new Set(objectArray(view.elements).flatMap((element) => (
    isNonblankUnpadded(element.element_id) ? [String(element.element_id)] : []
  )));
  for (const field of ELEMENT_CONTEXT_FIELDS) {
    if (!Object.hasOwn(context, field)) continue;
    const entries = ownEntries(context[field]);
    const fieldPath = `${path}/${field}`;
    if (entries === null) {
      diagnostics.push(diagnostic(
        'schema', 'OBLIGATION_CONTEXT_MAP_PROTOTYPE_FORBIDDEN', fieldPath,
        `${field} must be a Map or an own-property plain object`
      ));
      valid = false;
      continue;
    }
    for (const [rawKey, entry] of entries) {
      if (!isNonblankUnpadded(rawKey) || !elementIds.has(String(rawKey))) {
        diagnostics.push(diagnostic(
          'reference', 'OBLIGATION_CONTEXT_ELEMENT_UNKNOWN', `${fieldPath}/${pointerPart(String(rawKey))}`,
          `${field} references an invalid or unknown element "${String(rawKey)}"`
        ));
        valid = false;
        continue;
      }
      if (field === 'riskByElementId' && !isNonblankUnpadded(entry)) {
        diagnostics.push(diagnostic('schema', 'OBLIGATION_CONTEXT_STRINGS_INVALID', fieldPath, 'context risk values must be nonblank and unpadded'));
        valid = false;
      }
      if ((field === 'requiredOracleRefsByElementId' || field === 'requiredCapabilitiesByElementId')
        && !isDenseUniqueStringArray(entry)) {
        diagnostics.push(diagnostic(
          'schema', 'OBLIGATION_CONTEXT_STRINGS_INVALID', fieldPath,
          `${field} values must be dense unique arrays of nonblank unpadded strings`
        ));
        valid = false;
      }
      if (field === 'loopMaximumsByElementId') {
        const definition = isPlainRecord(entry) ? entry : null;
        if (!definition || !hasExactKeys(definition, ['maximum', 'source_claim_ids'])
          || !Number.isInteger(definition.maximum) || Number(definition.maximum) <= 1
          || !isDenseUniqueStringArray(definition.source_claim_ids, true)) {
          diagnostics.push(diagnostic(
            'schema', 'OBLIGATION_CONTEXT_LOOP_INVALID', fieldPath,
            'loop maximums require exact maximum and dense nonblank source_claim_ids fields'
          ));
          valid = false;
        }
      }
      if (field === 'timingSpecialResponsibilitiesByElementId'
        || field === 'integrationSpecialResponsibilitiesByElementId') {
        if (!isDenseObjectArray(entry) || entry.some((item) => !hasExactKeys(item, ['signal', 'type'])
          || !isNonblankUnpadded(item.signal) || !isNonblankUnpadded(item.type))) {
          diagnostics.push(diagnostic(
            'schema', 'OBLIGATION_CONTEXT_SPECIAL_INVALID', fieldPath,
            `${field} values must be dense closed signal/type objects with unpadded strings`
          ));
          valid = false;
        }
      }
      if (field === 'integrationInvariantsByElementId') {
        if (!isDenseObjectArray(entry) || entry.some((item) => !hasExactKeys(item, ['invariant'])
          || !isNonblankUnpadded(item.invariant))) {
          diagnostics.push(diagnostic(
            'schema', 'OBLIGATION_CONTEXT_INVARIANT_INVALID', fieldPath,
            'integration invariant values must be dense closed objects with one unpadded invariant'
          ));
          valid = false;
        }
      }
    }
  }
  if (Object.hasOwn(context, 'responsibilityBindings') && !isDenseObjectArray(context.responsibilityBindings)) {
    diagnostics.push(diagnostic(
      'schema', 'OBLIGATION_CONTEXT_BINDINGS_INVALID', `${path}/responsibilityBindings`,
      'responsibilityBindings must be a dense object array'
    ));
    valid = false;
  }
  return valid;
}

/** @param {ReturnType<typeof compilationInputs>} inputs @param {Map<string, Record<string, unknown>>} viewsById @param {Map<string, Record<string, unknown>>} claimsById @param {ReturnType<typeof claimRelations>} relations @param {Diagnostic[]} diagnostics */
function validateCustomObligations(inputs, viewsById, claimsById, relations, diagnostics) {
  const submittedObligations = inputs.customObligations.flatMap((entry) => (
    isObject(entry.obligation) ? [entry.obligation] : []
  ));
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema({
    schema_version: '1.0.0',
    source_revision: 0,
    obligations: submittedObligations,
    fact_routes: [],
    interaction_routes: []
  }, testObligationsSchema)));
  /** @type {Map<Record<string, unknown>, string>} */
  const ownerBySeed = new Map();
  /** @type {Map<string, {view: Record<string, unknown>, element: Record<string, unknown>, roots: string[]}>} */
  const ownerElementsByRef = new Map();
  for (const [viewId, view] of viewsById) {
    for (const element of objectArray(view.elements)) {
      const elementId = typeof element.element_id === 'string' ? element.element_id : '';
      const ref = qualifyViewElementRef(viewId, elementId);
      if (ownerElementsByRef.has(ref)) {
        diagnostics.push(diagnostic(
          'reference', 'CUSTOM_OBLIGATION_VIEW_ELEMENT_COLLISION', `/views/${pointerPart(viewId)}/elements/${pointerPart(elementId)}`,
          `qualified view element reference "${ref}" is not unique`
        ));
        continue;
      }
      ownerElementsByRef.set(ref, { view, element, roots: elementEvidenceRefs(element) });
    }
  }
  /** @type {Record<string, unknown>[]} */
  const seeds = [];
  inputs.customObligations.forEach((entry, index) => {
    const wrapperPath = `/obligationCompilation/customObligations/${index}`;
    if (!hasExactKeys(entry, ['obligation', 'semantic_key']) || !isNonblankUnpadded(entry.semantic_key)
      || !isObject(entry.obligation)) {
      diagnostics.push(diagnostic(
        'schema', 'CUSTOM_OBLIGATION_WRAPPER_INVALID', wrapperPath,
        'custom obligation input must be a closed semantic_key/obligation wrapper'
      ));
      return;
    }
    const seed = entry.obligation;
    seeds.push(seed);
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : String(index);
    const path = `/obligationCompilation/customObligations/${obligationId}`;
    const keys = Object.keys(seed).sort(compareCodePoints);
    if (keys.length !== OBLIGATION_FIELDS.length || keys.some((key, keyIndex) => key !== OBLIGATION_FIELDS[keyIndex])) {
      diagnostics.push(diagnostic(
        'schema', 'CUSTOM_OBLIGATION_INPUT_NOT_CLOSED', path,
        'custom obligation must contain exactly the frozen eight obligation fields'
      ));
    }
    if (!/^obligation_[0-9a-f]{16}$/.test(obligationId)) diagnostics.push(diagnostic(
      'schema', 'CUSTOM_OBLIGATION_ID_INVALID', `${path}/obligation_id`,
      'custom obligation_id must use stable obligation_<16 lowercase hex> form'
    ));
    const identity = {
      kind: seed.kind,
      scope: seed.scope,
      view_element_refs: [...stringArray(seed.view_element_refs)].sort(compareCodePoints),
      ...(stringArray(seed.view_element_refs).length === 0 ? {
        source_claim_ids: [...stringArray(seed.source_claim_ids)].sort(compareCodePoints)
      } : {}),
      semantic_key: entry.semantic_key
    };
    const expectedId = stableId('obligation', identity);
    if (obligationId !== expectedId) diagnostics.push(diagnostic(
      'classification', 'CUSTOM_OBLIGATION_ID_MISMATCH', `${path}/obligation_id`,
      `custom obligation_id must equal the stable ID of its semantic key and owner; expected "${expectedId}"`
    ));
    if (!isNonblankUnpadded(seed.scope)
      || !isDenseUniqueStringArray(seed.source_claim_ids, true)
      || !isDenseUniqueStringArray(seed.view_element_refs)
      || !isDenseUniqueStringArray(seed.required_oracle_refs)
      || !isDenseUniqueStringArray(seed.required_capabilities)) {
      diagnostics.push(diagnostic(
        'schema', 'CUSTOM_OBLIGATION_STRINGS_INVALID', path,
        'custom scope, refs, and capabilities must be dense, unique, nonblank, and unpadded'
      ));
    }
    const sourceIds = stringArray(seed.source_claim_ids);
    const oracleIds = stringArray(seed.required_oracle_refs);
    const sourceSet = new Set(sourceIds);
    for (const [field, claimId] of [
      ...sourceIds.map((id) => ['source_claim_ids', id]),
      ...oracleIds.map((id) => ['required_oracle_refs', id])
    ]) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        diagnostics.push(diagnostic(
          'reference', 'CUSTOM_OBLIGATION_CLAIM_DANGLING', `${path}/${field}`,
          `custom obligation references unknown accepted claim "${claimId}"`
        ));
        continue;
      }
      if (!isNonblankUnpadded(claim.scope) || !isNonblankUnpadded(seed.scope)
        || !scopeContains(String(claim.scope), String(seed.scope))) diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_CLAIM_SCOPE_MISMATCH', `${path}/${field}`,
        `claim "${claimId}" does not cover custom obligation scope "${String(seed.scope)}"`
      ));
      if (field === 'source_claim_ids') {
        const acceptedSource = isOracleEvidence(claim)
          || (claim.level === 'E2' && claim.kind === 'model-element' && claim.derivation_target === 'model-element');
        if (!acceptedSource) diagnostics.push(diagnostic(
          'classification', 'CUSTOM_OBLIGATION_SOURCE_INVALID', `${path}/source_claim_ids`,
          `claim "${claimId}" is not accepted formal obligation evidence`
        ));
      } else if (!isOracleEvidence(claim)) diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_ORACLE_INVALID', `${path}/required_oracle_refs`,
        `claim "${claimId}" is not eligible Oracle evidence`
      ));
    }
    for (const oracleId of oracleIds) {
      if (!sourceSet.has(oracleId)) diagnostics.push(diagnostic(
        'traceability', 'CUSTOM_OBLIGATION_ORACLE_NOT_SOURCED', `${path}/required_oracle_refs`,
        `Oracle claim "${oracleId}" must also appear in source_claim_ids`
      ));
    }

    /** @type {Array<{ref: string, roots: string[]}>} */
    const owners = [];
    for (const viewElementRef of stringArray(seed.view_element_refs)) {
      const parsedRef = parseQualifiedViewElementRef(viewElementRef);
      const viewId = parsedRef?.viewId ?? '';
      const elementId = parsedRef?.elementId ?? '';
      const ownerElement = ownerElementsByRef.get(viewElementRef);
      if (!isNonblankUnpadded(viewId) || !isNonblankUnpadded(elementId) || !ownerElement) {
        diagnostics.push(diagnostic(
        'reference', 'CUSTOM_OBLIGATION_VIEW_ELEMENT_DANGLING', `${path}/view_element_refs`,
        `custom obligation references unknown view element "${viewElementRef}"`
        ));
        continue;
      }
      const { view, roots } = ownerElement;
      if (!isNonblankUnpadded(view.scope) || !isNonblankUnpadded(seed.scope)
        || !scopeContains(String(view.scope), String(seed.scope))) diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_OWNER_SCOPE_MISMATCH', `${path}/scope`,
        `view element owner "${viewElementRef}" does not contain custom obligation scope "${String(seed.scope)}"`
      ));
      if (roots.length === 0 || roots.some((claimId) => !claimsById.has(claimId))) {
        diagnostics.push(diagnostic(
          'traceability', 'CUSTOM_OBLIGATION_OWNER_EVIDENCE_INVALID', `${path}/view_element_refs`,
          `view element "${viewElementRef}" has no valid accepted evidence closure`
        ));
        continue;
      }
      owners.push({ ref: viewElementRef, roots });
    }
    if (stringArray(seed.view_element_refs).length === 0
      && sourceIds.length > 0 && sourceIds.every((claimId) => claimsById.has(claimId))) {
      owners.push({ ref: '', roots: sourceIds });
    }

    const relatedToAnyOwner = directionallyRelatedClaims(
      relations, owners.flatMap((owner) => owner.roots)
    );
    const relatedToAnySource = directionallyRelatedClaims(relations, sourceIds);

    for (const claimId of sourceIds) {
      if (claimsById.has(claimId) && !relatedToAnyOwner.has(claimId)) diagnostics.push(diagnostic(
        'traceability', 'CUSTOM_OBLIGATION_SOURCE_UNRELATED', `${path}/source_claim_ids`,
        `source claim "${claimId}" is not an ancestor or descendant of any custom obligation owner`
      ));
    }
    for (const claimId of oracleIds) {
      if (claimsById.has(claimId) && !relatedToAnyOwner.has(claimId)) diagnostics.push(diagnostic(
        'traceability', 'CUSTOM_OBLIGATION_ORACLE_UNRELATED', `${path}/required_oracle_refs`,
        `Oracle claim "${claimId}" is not an ancestor or descendant of any custom obligation owner`
      ));
    }
    for (const owner of owners) {
      if (!owner.roots.some((claimId) => relatedToAnySource.has(claimId))) diagnostics.push(diagnostic(
        'traceability', 'CUSTOM_OBLIGATION_OWNER_UNSUPPORTED', `${path}/view_element_refs`,
        `custom obligation owner "${owner.ref}" has no directionally related source evidence`
      ));
    }
    const viewElementRefs = [...stringArray(seed.view_element_refs)].sort(compareCodePoints);
    ownerBySeed.set(seed, canonicalStringify({
      kind: seed.kind,
      risk: seed.risk,
      scope: seed.scope,
      semantic_key: entry.semantic_key,
      view_element_refs: viewElementRefs,
      ...(viewElementRefs.length === 0 ? { source_claim_ids: [...sourceIds].sort(compareCodePoints) } : {})
    }));
  });
  return { ownerBySeed, seeds };
}

/** @param {Record<string, unknown>} accumulator @param {Record<string, unknown>} seed */
function addObligationSets(accumulator, seed) {
  for (const field of OBLIGATION_SET_FIELDS) {
    const values = /** @type {Set<string>} */ (accumulator[field]);
    for (const value of stringArray(seed[field])) values.add(value);
  }
}

/** @param {Map<string, Record<string, unknown>>} byId */
function finishObligationMerge(byId) {
  return [...byId.values()].map((entry) => ({
    obligation_id: entry.obligation_id,
    kind: entry.kind,
    risk: entry.risk,
    scope: entry.scope,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [
      field, [.../** @type {Set<string>} */ (entry[field])].sort(compareCodePoints)
    ]))
  })).sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id)));
}

/** @param {Record<string, unknown>} seed @param {string} [owner] */
function obligationAccumulator(seed, owner = '') {
  return {
    obligation_id: seed.obligation_id,
    kind: seed.kind,
    risk: seed.risk,
    scope: seed.scope,
    owner,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [field, new Set(stringArray(seed[field]))]))
  };
}

/** @param {Record<string, unknown>} obligation */
function obligationContentSignature(obligation) {
  return canonicalStringify({
    kind: obligation.kind,
    risk: obligation.risk,
    scope: obligation.scope,
    ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [
      field, [...stringArray(obligation[field])].sort(compareCodePoints)
    ]))
  });
}

/** @param {Record<string, unknown>[]} seeds @param {Diagnostic[]} diagnostics */
function mergeSystemObligations(seeds, diagnostics) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  [...seeds].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right))).forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : '';
    const path = `/obligations/${obligationId || index}`;
    const existing = byId.get(obligationId);
    if (!existing) {
      byId.set(obligationId, obligationAccumulator(seed));
      return;
    }
    if (existing.kind !== seed.kind || existing.risk !== seed.risk || existing.scope !== seed.scope) {
      diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_SIGNATURE_CONFLICT', path,
        `duplicate obligation signature "${obligationId}" has conflicting kind, risk, or scope`
      ));
      return;
    }
    addObligationSets(existing, seed);
  });
  return finishObligationMerge(byId);
}

/** @param {Record<string, unknown>[]} seeds @param {Map<Record<string, unknown>, string>} ownerBySeed @param {Record<string, unknown>[]} systemObligations @param {Diagnostic[]} diagnostics */
function mergeCustomObligations(seeds, ownerBySeed, systemObligations, diagnostics) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  const systemIds = new Set(systemObligations.map((obligation) => String(obligation.obligation_id)));
  const systemSignatures = new Set(systemObligations.map(obligationContentSignature));
  const collisionIds = new Set();
  [...seeds].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right))).forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : '';
    const path = `/obligationCompilation/customObligations/${obligationId || index}`;
    if (systemIds.has(obligationId)) {
      if (!collisionIds.has(obligationId)) diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_SYSTEM_ID_COLLISION', `${path}/obligation_id`,
        `custom obligation ID "${obligationId}" collides with a system strategy obligation`
      ));
      collisionIds.add(obligationId);
      return;
    }
    if (systemSignatures.has(obligationContentSignature(seed))) {
      diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_SYSTEM_SEMANTIC_COLLISION', path,
        `custom obligation "${obligationId}" duplicates a system strategy obligation`
      ));
      return;
    }
    const owner = ownerBySeed.get(seed) ?? '';
    const existing = byId.get(obligationId);
    if (!existing) {
      byId.set(obligationId, obligationAccumulator(seed, owner));
      return;
    }
    if (existing.owner !== owner) {
      diagnostics.push(diagnostic(
        'classification', 'CUSTOM_OBLIGATION_OWNER_CONFLICT', path,
        `duplicate custom obligation ID "${obligationId}" has conflicting semantic owners`
      ));
      if (existing.kind !== seed.kind || existing.risk !== seed.risk || existing.scope !== seed.scope) diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_SIGNATURE_CONFLICT', path,
        `duplicate obligation signature "${obligationId}" has conflicting kind, risk, or scope`
      ));
      return;
    }
    addObligationSets(existing, seed);
  });
  return finishObligationMerge(byId);
}

/** @param {Map<string, Record<string, unknown>>} claimsById @param {Map<string, Record<string, unknown>>} viewsById @param {ReturnType<typeof compilationInputs>} inputs @param {Diagnostic[]} diagnostics */
function compileViewObligations(claimsById, viewsById, inputs, diagnostics) {
  const registry = defaultRegistry();
  /** @type {Record<string, unknown>[]} */
  const seeds = [];
  for (const [viewId, view] of viewsById) {
    const submittedContext = inputs.contextsByViewId.get(viewId);
    if (!isObject(submittedContext)) {
      diagnostics.push(diagnostic('classification', 'OBLIGATION_CONTEXT_MISSING', `/obligationCompilation/contextsByViewId/${viewId}`, `view "${viewId}" has no isolated compilation context`));
      continue;
    }
    if (Object.hasOwn(submittedContext, 'claimsById') || Object.hasOwn(submittedContext, 'evidenceGraph')) {
      diagnostics.push(diagnostic('classification', 'OBLIGATION_CONTEXT_EVIDENCE_OVERRIDE', `/obligationCompilation/contextsByViewId/${viewId}`, 'view context cannot replace the accepted evidence graph'));
      continue;
    }
    const allowedFields = CONTEXT_FIELDS_BY_VIEW_TYPE[/** @type {keyof typeof CONTEXT_FIELDS_BY_VIEW_TYPE} */ (view.type)];
    const submittedFields = Object.keys(submittedContext).sort(compareCodePoints);
    if (!allowedFields || submittedFields.some((field) => !allowedFields.includes(field))) {
      diagnostics.push(diagnostic(
        'schema', 'OBLIGATION_CONTEXT_NOT_CLOSED', `/obligationCompilation/contextsByViewId/${viewId}`,
        `view "${viewId}" compilation context contains a field outside its ${String(view.type)} strategy contract`
      ));
      continue;
    }
    if (!validateViewContext(viewId, view, submittedContext, diagnostics)) continue;
    try {
      seeds.push(...registry.compile(view, { ...submittedContext, claimsById }));
    } catch (error) {
      diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_STRATEGY_REJECTED', `/views/${viewId}`,
        error instanceof Error ? error.message : 'obligation strategy rejected its input'
      ));
    }
  }
  for (const key of inputs.contextsByViewId.keys()) {
    if (!isNonblankUnpadded(key)) diagnostics.push(diagnostic(
      'schema', 'OBLIGATION_CONTEXT_VIEW_KEY_INVALID', `/obligationCompilation/contextsByViewId/${pointerPart(String(key))}`,
      'compilation context view keys must be nonblank and unpadded'
    ));
    else if (!viewsById.has(key)) diagnostics.push(diagnostic(
      'reference', 'OBLIGATION_CONTEXT_VIEW_UNKNOWN', `/obligationCompilation/contextsByViewId/${pointerPart(key)}`,
      `compilation context references unknown view "${key}"`
    ));
  }
  return seeds;
}

/** @param {Record<string, unknown>[]} facts @param {Map<string, Record<string, unknown>>} claimsById */
function formalFacts(facts, claimsById) {
  return facts.filter((fact) => {
    const claim = typeof fact.claim_id === 'string' ? claimsById.get(fact.claim_id) : undefined;
    return fact.status !== 'diagnostic' && (claim?.kind === 'requirement' || claim?.kind === 'assumption');
  });
}

/** @param {ReturnType<typeof compilationInputs>} inputs @param {Map<string, Record<string, unknown>>} factsById @param {Map<string, Record<string, unknown>>} claimsById @param {ReturnType<typeof claimRelations>} relations @param {Diagnostic[]} diagnostics */
function terminalFactRoutes(inputs, factsById, claimsById, relations, diagnostics) {
  /** @type {Map<string, Record<string, unknown>[]>} */
  const reviewsByFactId = new Map();
  /** @type {Set<Record<string, unknown>>} */
  const validReviews = new Set();
  for (const review of [...inputs.notApplicableReviews].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right)))) {
    const factId = typeof review.fact_id === 'string' ? review.fact_id : '';
    const path = `/obligationCompilation/notApplicableReviews/${factId || 'invalid'}`;
    const group = reviewsByFactId.get(factId) ?? [];
    group.push(review);
    reviewsByFactId.set(factId, group);
    let valid = true;
    if (!hasExactKeys(review, ['claim_id', 'fact_id', 'support_review'])
      || !isNonblankUnpadded(factId) || !isNonblankUnpadded(review.claim_id)
      || review.support_review !== 'supported') {
      diagnostics.push(diagnostic(
        'classification', 'NOT_APPLICABLE_REVIEW_INVALID', path,
        'NotApplicable review must contain exact nonblank fact/claim IDs and support_review "supported"'
      ));
      valid = false;
    }
    if (!factsById.has(factId)) {
      diagnostics.push(diagnostic('reference', 'NOT_APPLICABLE_REVIEW_UNKNOWN', `${path}/fact_id`, `NotApplicable review references unknown formal fact "${factId}"`));
      valid = false;
    }
    if (valid) validReviews.add(review);
  }
  for (const [factId, reviews] of reviewsByFactId) {
    if (reviews.length > 1) diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_REVIEW_MULTIPLE', `/obligationCompilation/notApplicableReviews/${factId}`,
      `formal fact "${factId}" has more than one NotApplicable review`
    ));
  }

  /** @type {Map<string, Record<string, unknown>[]>} */
  const routesByFactId = new Map();
  for (const route of [...inputs.factRoutes].sort((left, right) => compareCodePoints(canonicalStringify(left), canonicalStringify(right)))) {
    const factId = typeof route.fact_id === 'string' ? route.fact_id : '';
    const group = routesByFactId.get(factId) ?? [];
    group.push(route);
    routesByFactId.set(factId, group);
  }
  /** @type {Map<string, Record<string, unknown>>} */
  const routes = new Map();
  const notApplicableFactIds = new Set();
  for (const [factId, submittedRoutes] of [...routesByFactId].sort(([left], [right]) => compareCodePoints(left, right))) {
    const path = `/obligationCompilation/factRoutes/${factId || 'invalid'}`;
    if (!factsById.has(factId)) {
      diagnostics.push(diagnostic('reference', 'FACT_ROUTE_UNKNOWN', `${path}/fact_id`, `route references unknown formal fact "${factId}"`));
    }
    if (submittedRoutes.length > 1) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_MULTIPLE', path, `formal fact "${factId}" has more than one explicit route`));
    }
    /** @type {Map<Record<string, unknown>, Record<string, unknown>>} */
    const normalizedByRoute = new Map();
    for (const route of submittedRoutes) {
      const routeType = route.route_type;
      if (routeType === 'exploratory') {
        diagnostics.push(diagnostic('classification', 'FORMAL_FACT_EXPLORATORY_FORBIDDEN', path, 'a formal fact cannot route directly to Exploratory'));
        continue;
      }
      if (routeType === 'blocked') {
        if (!hasExactKeys(route, ['blocker_root_issue_id', 'fact_id', 'route_type'])
          || !isNonblankUnpadded(route.blocker_root_issue_id)) {
          diagnostics.push(diagnostic('classification', 'FACT_BLOCKED_ROUTE_INVALID', path, 'Blocked route must contain one nonblank unpadded blocker_root_issue_id'));
          continue;
        }
        normalizedByRoute.set(route, { fact_id: factId, route_type: 'blocked', blocker_root_issue_id: route.blocker_root_issue_id });
        continue;
      }
      if (routeType === 'not_applicable') {
        notApplicableFactIds.add(factId);
        const claimId = typeof route.not_applicable_claim_id === 'string' ? route.not_applicable_claim_id : '';
        if (!hasExactKeys(route, ['fact_id', 'not_applicable_claim_id', 'route_type']) || !isNonblankUnpadded(claimId)) {
          diagnostics.push(diagnostic('classification', 'FACT_NOT_APPLICABLE_ROUTE_INVALID', path, 'NotApplicable route must contain one nonblank unpadded exclusion claim ID'));
          continue;
        }
        normalizedByRoute.set(route, { fact_id: factId, route_type: 'not_applicable', not_applicable_claim_id: claimId });
        continue;
      }
      diagnostics.push(diagnostic('classification', 'FACT_ROUTE_TYPE_INVALID', `${path}/route_type`, 'explicit fact route must be Blocked or NotApplicable'));
    }
    if (submittedRoutes.length !== 1 || !factsById.has(factId)) continue;
    const route = submittedRoutes[0];
    const normalized = normalizedByRoute.get(route);
    if (!normalized) continue;
    if (normalized.route_type === 'blocked') {
      routes.set(factId, normalized);
      continue;
    }
    const reviews = reviewsByFactId.get(factId) ?? [];
    if (reviews.length === 0) {
      diagnostics.push(diagnostic('traceability', 'NOT_APPLICABLE_REVIEW_MISSING', `/obligationCompilation/notApplicableReviews/${factId}`, `formal fact "${factId}" has no supported NotApplicable review`));
      continue;
    }
    if (reviews.length !== 1 || !validReviews.has(reviews[0])) continue;
    const review = reviews[0];
    const exclusionId = String(normalized.not_applicable_claim_id);
    const exclusion = claimsById.get(exclusionId);
    if (!exclusion) {
      diagnostics.push(diagnostic('reference', 'NOT_APPLICABLE_CLAIM_DANGLING', `${path}/not_applicable_claim_id`, `NotApplicable route references unknown claim "${exclusionId}"`));
      continue;
    }
    if (review.claim_id !== exclusionId) {
      diagnostics.push(diagnostic('traceability', 'NOT_APPLICABLE_REVIEW_MISMATCH', `/obligationCompilation/notApplicableReviews/${factId}/claim_id`, 'NotApplicable review must name the route exclusion claim'));
      continue;
    }
    if (exclusion.level !== 'E3' && exclusion.level !== 'E2') {
      diagnostics.push(diagnostic('classification', 'NOT_APPLICABLE_CLAIM_LEVEL_INVALID', `${path}/not_applicable_claim_id`, 'NotApplicable exclusion requires accepted E3 or E2 evidence'));
      continue;
    }
    const fact = /** @type {Record<string, unknown>} */ (factsById.get(factId));
    const factClaimIds = new Set([String(fact.claim_id), ...stringArray(fact.source_claim_ids)]);
    if ([...factClaimIds].some((claimId) => claimsDirectionallyRelated(
      relations, exclusionId, claimId
    ))) {
      diagnostics.push(diagnostic('classification', 'NOT_APPLICABLE_CLAIM_NOT_INDEPENDENT', `${path}/not_applicable_claim_id`, 'NotApplicable exclusion must be independent from the fact claim and its sources'));
      continue;
    }
    const primaryClaim = claimsById.get(String(fact.claim_id));
    if (!primaryClaim || !isNonblankUnpadded(exclusion.scope) || !isNonblankUnpadded(primaryClaim.scope)
      || !scopeContains(String(exclusion.scope), String(primaryClaim.scope))) {
      diagnostics.push(diagnostic('classification', 'NOT_APPLICABLE_SCOPE_MISMATCH', `${path}/not_applicable_claim_id`, 'NotApplicable exclusion scope must cover the primary fact scope'));
      continue;
    }
    routes.set(factId, normalized);
  }
  for (const factId of [...reviewsByFactId.keys()].sort(compareCodePoints)) {
    if (factsById.has(factId) && !notApplicableFactIds.has(factId)) diagnostics.push(diagnostic(
      'traceability', 'NOT_APPLICABLE_REVIEW_ORPHAN', `/obligationCompilation/notApplicableReviews/${factId}`,
      `NotApplicable review for fact "${factId}" has no NotApplicable route`
    ));
  }
  return routes;
}

/** @param {Diagnostic} item @param {Set<string>} terminalFactIds */
function isResolvedTask4FactDiagnostic(item, terminalFactIds) {
  if (item.code !== 'NORMATIVE_FACT_UNMODELED' && item.code !== 'OUT_OF_SCOPE_NORMATIVE_FACT_UNMODELED') return false;
  const prefix = '/facts/';
  return item.path.startsWith(prefix) && terminalFactIds.has(item.path.slice(prefix.length));
}

/**
 * Bucket exact obligation sources once. A modeled fact expands only its own
 * descendants and reads the selected view buckets, so repeated obligations do
 * not each materialize the same ancestry closure.
 * @param {Record<string, unknown>[]} obligations
 */
function indexObligationsByViewAndDirectClaim(obligations) {
  /** @type {Map<string, Map<string, Set<string>>>} */
  const index = new Map();
  for (const obligation of obligations) {
    if (!isNonblankUnpadded(obligation.obligation_id)) continue;
    const viewIds = new Set(stringArray(obligation.view_element_refs).flatMap((ref) => {
      const parsed = parseQualifiedViewElementRef(ref);
      return parsed ? [parsed.viewId] : [];
    }));
    for (const viewId of viewIds) {
      let claims = index.get(viewId);
      if (!claims) {
        claims = new Map();
        index.set(viewId, claims);
      }
      for (const claimId of stringArray(obligation.source_claim_ids)) {
        let obligationIds = claims.get(claimId);
        if (!obligationIds) {
          obligationIds = new Set();
          claims.set(claimId, obligationIds);
        }
        obligationIds.add(String(obligation.obligation_id));
      }
    }
  }
  return index;
}

/** @param {Record<string, unknown>[]} facts @param {Record<string, unknown>[]} obligations @param {Record<string, unknown>[]} viewRoutes @param {Map<string, Record<string, unknown>>} terminalRoutes @param {ReturnType<typeof claimRelations>} relations @param {Diagnostic[]} diagnostics */
function reconcileFactRoutes(facts, obligations, viewRoutes, terminalRoutes, relations, diagnostics) {
  const viewsByFact = new Map(viewRoutes.flatMap((route) => typeof route.fact_id === 'string'
    ? [[route.fact_id, new Set(stringArray(route.view_ids))]] : []));
  const obligationIndex = indexObligationsByViewAndDirectClaim(obligations);
  const routes = [];
  for (const fact of facts) {
    const factId = String(fact.fact_id);
    const terminal = terminalRoutes.get(factId);
    const viewIds = viewsByFact.get(factId);
    if (terminal && viewIds) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_MULTIPLE', `/fact_routes/${factId}`, `formal fact "${factId}" is both modeled and terminally routed`));
      continue;
    }
    if (terminal) {
      routes.push({ ...terminal });
      continue;
    }
    if (!viewIds) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_MISSING', `/fact_routes/${factId}`, `formal fact "${factId}" has no explicit route`));
      continue;
    }
    const claimIds = [String(fact.claim_id), ...stringArray(fact.source_claim_ids)];
    const descendantClaimIds = cachedReachableClaims(
      relations.childrenById, claimIds, relations.descendantsByRootSet
    );
    const obligationIds = new Set();
    for (const viewId of viewIds) {
      const claims = obligationIndex.get(viewId);
      if (!claims) continue;
      for (const claimId of descendantClaimIds) {
        for (const obligationId of claims.get(claimId) ?? []) obligationIds.add(obligationId);
      }
    }
    if (obligationIds.size === 0) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_OBLIGATION_MISSING', `/fact_routes/${factId}`, `modeled fact "${factId}" produced no formal obligation`));
      continue;
    }
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [...obligationIds].sort(compareCodePoints) });
  }
  return routes.sort((left, right) => compareCodePoints(String(left.fact_id), String(right.fact_id)));
}

/** @param {Record<string, unknown>[]} candidates */
function reconcileInteractionRoutes(candidates) {
  return candidates.map((candidate) => candidate.disposition === 'formal-view'
    ? { candidate_id: candidate.candidate_id, route_type: 'formal-view', formal_view_id: candidate.formal_view_id }
    : candidate.disposition === 'blocker'
      ? { candidate_id: candidate.candidate_id, route_type: 'blocked', blocker_root_issue_id: candidate.blocker_root_issue_id }
      : { candidate_id: candidate.candidate_id, route_type: 'exploratory', exploratory_id: candidate.exploratory_id })
    .sort((left, right) => compareCodePoints(String(left.candidate_id), String(right.candidate_id)));
}

/**
 * Prove the two formal denominators are closed before schema validation. The
 * frozen schema checks route shape; this check owns identity cardinality.
 * @param {Record<string, unknown>[]} expected
 * @param {Record<string, unknown>[]} routes
 * @param {string} expectedField
 * @param {string} routeField
 * @param {string} label
 * @param {Diagnostic[]} diagnostics
 */
function validateRouteIdentity(expected, routes, expectedField, routeField, label, diagnostics) {
  const expectedIds = new Set(expected.flatMap((item) => (
    isNonblankUnpadded(item[expectedField]) ? [String(item[expectedField])] : []
  )));
  const counts = new Map();
  for (const route of routes) {
    const routeId = isNonblankUnpadded(route[routeField]) ? String(route[routeField]) : '';
    if (!expectedIds.has(routeId)) diagnostics.push(diagnostic(
      'reference', `${label}_ROUTE_IDENTITY_UNKNOWN`, `/${routeField}/${pointerPart(routeId || 'invalid')}`,
      `${label} route references an identity outside the formal denominator`
    ));
    counts.set(routeId, (counts.get(routeId) ?? 0) + 1);
  }
  for (const expectedId of [...expectedIds].sort(compareCodePoints)) {
    const count = counts.get(expectedId) ?? 0;
    if (count !== 1) diagnostics.push(diagnostic(
      'traceability', `${label}_ROUTE_IDENTITY_NOT_EXACT`, `/${routeField}/${pointerPart(expectedId)}`,
      `${label} identity "${expectedId}" must have exactly one explicit route; found ${count}`
    ));
  }
}

/**
 * Compile the frozen formal Test Point artifact from accepted Task 3 evidence
 * and the submitted Task 4 behavior artifact.
 * @param {unknown} evidenceGraph
 * @param {unknown} behaviorViews
 */
export function compileObligations(evidenceGraph, behaviorViews) {
  const graph = isObject(evidenceGraph) ? evidenceGraph : {};
  const artifact = isObject(behaviorViews) ? behaviorViews : {};
  const structuralDiagnostics = [
    ...sparseBehaviorDiagnostics(artifact),
    ...behaviorStringDiagnostics(artifact),
    ...interactionStringDiagnostics(artifact),
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(artifact, behaviorViewsSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(artifact))
  ];
  const inputs = compilationInputs(graph);
  const diagnostics = [...structuralDiagnostics];
  const evidence = validateEvidenceInputs(graph, inputs, artifact, diagnostics);
  const task4Evidence = {
    claimsById: evidence.claimsById,
    factLedger: evidence.facts,
    runScope: Object.hasOwn(graph, 'runScope') && isNonblankUnpadded(graph.runScope)
      ? graph.runScope : ''
  };
  const viewValidation = validateBehaviorViews(task4Evidence, artifact);
  const interactionAudit = auditInteractionMatrix(artifact);
  const facts = formalFacts(evidence.facts, evidence.claimsById);
  const factsById = new Map(facts.flatMap((fact) => typeof fact.fact_id === 'string' ? [[fact.fact_id, fact]] : []));
  const claimsById = evidence.claimsById;
  const terminalRoutes = terminalFactRoutes(inputs, factsById, claimsById, evidence.relations, diagnostics);
  diagnostics.push(
    .../** @type {Diagnostic[]} */ (viewValidation.diagnostics)
      .filter((item) => !isResolvedTask4FactDiagnostic(item, new Set(terminalRoutes.keys()))),
    .../** @type {Diagnostic[]} */ (interactionAudit.diagnostics)
  );
  const customValidation = validateCustomObligations(
    inputs, viewValidation.viewsById, claimsById, evidence.relations, diagnostics
  );
  assertNoDiagnostics(diagnostics);

  const strategySeeds = compileViewObligations(claimsById, viewValidation.viewsById, inputs, diagnostics);
  const systemObligations = mergeSystemObligations(strategySeeds, diagnostics);
  const customObligations = mergeCustomObligations(
    customValidation.seeds, customValidation.ownerBySeed,
    systemObligations, diagnostics
  );
  const obligations = [...systemObligations, ...customObligations]
    .sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id)));
  const factRoutes = reconcileFactRoutes(
    facts, obligations, /** @type {Record<string, unknown>[]} */ (viewValidation.factRoutes),
    terminalRoutes, evidence.relations, diagnostics
  );
  const interactionRoutes = reconcileInteractionRoutes(
    /** @type {Record<string, unknown>[]} */ (interactionAudit.candidates)
  );
  validateRouteIdentity(facts, factRoutes, 'fact_id', 'fact_id', 'FACT', diagnostics);
  validateRouteIdentity(
    /** @type {Record<string, unknown>[]} */ (interactionAudit.candidates), interactionRoutes,
    'candidate_id', 'candidate_id', 'INTERACTION', diagnostics
  );

  const compiled = {
    schema_version: '1.0.0',
    source_revision: typeof artifact.source_revision === 'number' ? artifact.source_revision : -1,
    obligations,
    fact_routes: factRoutes,
    interaction_routes: interactionRoutes
  };
  diagnostics.push(
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(compiled, testObligationsSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(compiled))
  );
  assertNoDiagnostics(diagnostics);
  return compiled;
}
