import { scopeContains } from '../decision-record.mjs';
import { canonicalStringify } from '../canonical.mjs';

const VIEW_ELEMENT_KINDS = Object.freeze({
  flow: Object.freeze(['flow-node', 'flow-edge']),
  decision: Object.freeze(['decision-rule']),
  state: Object.freeze(['state', 'transition']),
  'input-domain': Object.freeze(['input-domain']),
  role: Object.freeze(['role-permission']),
  timing: Object.freeze(['timing-rule']),
  integration: Object.freeze(['integration-contract'])
});
const VIEW_TYPES = new Set(Object.keys(VIEW_ELEMENT_KINDS));

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {unknown} value @returns {string[]} */
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
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

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {Array<{category: string, code: string, path: string, message: string}>} diagnostics */
function sortDiagnostics(diagnostics) {
  const unique = new Map();
  for (const item of diagnostics) unique.set(JSON.stringify([item.category, item.code, item.path, item.message]), item);
  return [...unique.entries()]
    .sort(([left], [right]) => compareCodePoints(left, right))
    .map(([, item]) => item);
}

/** @param {unknown} evidenceGraph */
function acceptedClaims(evidenceGraph) {
  if (!isObject(evidenceGraph) || !(evidenceGraph.claimsById instanceof Map)) return new Map();
  return /** @type {Map<string, Record<string, unknown>>} */ (evidenceGraph.claimsById);
}

/** @param {unknown} evidenceGraph */
function factLedger(evidenceGraph) {
  if (!isObject(evidenceGraph)) return [];
  if (evidenceGraph.factsById instanceof Map) return [...evidenceGraph.factsById.values()].filter(isObject);
  return objectArray(evidenceGraph.factLedger ?? evidenceGraph.fact_ledger);
}

/** @param {Map<string, Record<string, unknown>>} claimsById @param {string[]} seeds */
function claimClosure(claimsById, seeds) {
  const closure = new Set();
  const pending = [...seeds];
  while (pending.length > 0) {
    const claimId = pending.pop();
    if (claimId === undefined || closure.has(claimId)) continue;
    closure.add(claimId);
    const claim = claimsById.get(claimId);
    if (!claim) continue;
    for (const parentId of stringArray(claim.parent_claim_ids)) pending.push(parentId);
  }
  return closure;
}

/** @param {Record<string, unknown>} claim */
function isBehaviorSourceClaim(claim) {
  return (claim.level === 'E3' && claim.kind === 'requirement')
    || (claim.level === 'E1' && claim.kind === 'assumption');
}

/** @param {Record<string, unknown>} claim */
function isE2ModelElement(claim) {
  return claim.level === 'E2' && claim.kind === 'model-element' && claim.derivation_target === 'model-element';
}

/** @param {Record<string, unknown>} view */
function canonicalView(view) {
  const canonical = /** @type {{views: Record<string, unknown>[]}} */ (JSON.parse(canonicalStringify({ views: [view] })));
  return canonical.views[0];
}

/** @param {string} viewType */
function relationEndpointKind(viewType) {
  if (viewType === 'flow') return 'flow-node';
  if (viewType === 'state') return 'state';
  const kinds = VIEW_ELEMENT_KINDS[/** @type {keyof typeof VIEW_ELEMENT_KINDS} */ (viewType)];
  return kinds?.length === 1 ? kinds[0] : null;
}

/** @param {string} value */
function escapePointerSegment(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** @param {string[]} values */
function duplicateStrings(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort(compareCodePoints);
}

/** @param {string} left @param {string} right */
function scopesOverlap(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}

/**
 * Validate evidence support and complete normative-fact routing for adaptive views.
 * The evidence graph supplies only claims already accepted by the Task 3 gate.
 * @param {unknown} evidenceGraph
 * @param {unknown} artifact
 */
export function validateBehaviorViews(evidenceGraph, artifact) {
  const graph = isObject(evidenceGraph) ? evidenceGraph : {};
  const input = isObject(artifact) ? artifact : {};
  const claimsById = acceptedClaims(graph);
  const views = objectArray(input.views);
  const facts = factLedger(graph);
  const runScope = typeof graph.runScope === 'string' ? graph.runScope
    : typeof graph.run_scope === 'string' ? graph.run_scope : null;
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];
  /** @type {Map<string, Record<string, unknown>>} */
  const validViews = new Map();
  /** @type {Map<string, Set<string>>} */
  const viewModeledClaims = new Map();
  /** @type {Map<string, Set<string>>} */
  const claimViews = new Map();

  /** @param {Record<string, unknown>} owner @param {string} path @param {string} viewScope @param {string} supportCode */
  function validateSupport(owner, path, viewScope, supportCode) {
    const sourceIds = stringArray(owner.source_claim_ids);
    const modelIds = stringArray(owner.model_refs);
    /** @type {string[]} */
    const acceptedIds = [];
    let valid = true;
    sourceIds.forEach((claimId, index) => {
      const claim = claimsById.get(claimId);
      const claimPath = `${path}/source_claim_ids/${escapePointerSegment(claimId || String(index))}`;
      if (!claim) {
        diagnostics.push(diagnostic('reference', 'SOURCE_CLAIM_DANGLING', claimPath, `source claim "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isBehaviorSourceClaim(claim)) {
        diagnostics.push(diagnostic('classification', 'SOURCE_CLAIM_NOT_BEHAVIOR_EVIDENCE', claimPath, `source claim "${claimId}" cannot support a formal behavior element`));
        valid = false;
      } else if (typeof claim.scope === 'string' && !scopeContains(claim.scope, viewScope)) {
        diagnostics.push(diagnostic('classification', 'SOURCE_CLAIM_SCOPE_MISMATCH', claimPath, `source claim "${claimId}" does not cover view scope "${viewScope}"`));
        valid = false;
      } else acceptedIds.push(claimId);
    });
    modelIds.forEach((claimId, index) => {
      const claim = claimsById.get(claimId);
      const claimPath = `${path}/model_refs/${escapePointerSegment(claimId || String(index))}`;
      if (!claim) {
        diagnostics.push(diagnostic('reference', 'MODEL_REF_DANGLING', claimPath, `model ref "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isE2ModelElement(claim)) {
        diagnostics.push(diagnostic('classification', 'MODEL_REF_NOT_E2_MODEL_ELEMENT', claimPath, `model ref "${claimId}" is not an accepted E2 model element`));
        valid = false;
      } else if (typeof claim.scope === 'string' && !scopeContains(claim.scope, viewScope)) {
        diagnostics.push(diagnostic('classification', 'MODEL_REF_SCOPE_MISMATCH', claimPath, `model ref "${claimId}" does not cover view scope "${viewScope}"`));
        valid = false;
      } else acceptedIds.push(claimId);
    });
    if (acceptedIds.length === 0) {
      diagnostics.push(diagnostic('traceability', supportCode, path, 'every modeled item requires an accepted Source Claim or E2 model element'));
      valid = false;
    }
    return { valid, claimIds: claimClosure(claimsById, acceptedIds) };
  }

  views.forEach((view, viewIndex) => {
    const viewId = typeof view.view_id === 'string' ? view.view_id : '';
    const path = `/views/${escapePointerSegment(viewId || String(viewIndex))}`;
    const type = typeof view.type === 'string' ? view.type : '';
    const scope = typeof view.scope === 'string' ? view.scope : '';
    let valid = viewId.length > 0 && scope.length > 0;
    if (!VIEW_TYPES.has(type)) {
      diagnostics.push(diagnostic('classification', 'VIEW_TYPE_UNSUPPORTED', `${path}/type`, `view type "${type}" is outside the closed behavior-view set`));
      valid = false;
    }
    if (runScope !== null && scope.length > 0 && !scopesOverlap(runScope, scope)) {
      diagnostics.push(diagnostic(
        'classification', 'VIEW_SCOPE_DISJOINT', `${path}/scope`,
        `view scope "${scope}" does not overlap run scope "${runScope}"`
      ));
      valid = false;
    }
    for (const [claimIndex, claimId] of stringArray(view.source_claim_ids).entries()) {
      const claim = claimsById.get(claimId);
      const claimPath = `${path}/source_claim_ids/${escapePointerSegment(claimId || String(claimIndex))}`;
      if (!claim) {
        diagnostics.push(diagnostic('reference', 'SOURCE_CLAIM_DANGLING', claimPath, `source claim "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isBehaviorSourceClaim(claim) && !isE2ModelElement(claim)) {
        diagnostics.push(diagnostic('classification', 'VIEW_SOURCE_CLAIM_INVALID', claimPath, `source claim "${claimId}" cannot support a formal behavior view`));
        valid = false;
      } else if (typeof claim.scope === 'string' && !scopeContains(claim.scope, scope)) {
        diagnostics.push(diagnostic('classification', 'SOURCE_CLAIM_SCOPE_MISMATCH', claimPath, `source claim "${claimId}" does not cover view scope "${scope}"`));
        valid = false;
      }
    }

    const elements = objectArray(view.elements);
    const elementIds = new Set();
    /** @type {Map<string, string>} */
    const elementKinds = new Map();
    /** @type {Array<{claims: Set<string>}>} */
    const modeledItems = [];
    elements.forEach((element, elementIndex) => {
      const elementId = typeof element.element_id === 'string' ? element.element_id : '';
      const elementPath = `${path}/elements/${escapePointerSegment(elementId || String(elementIndex))}`;
      if (elementId.length === 0 || elementIds.has(elementId)) {
        diagnostics.push(diagnostic('schema', 'VIEW_ELEMENT_ID_INVALID', `${elementPath}/element_id`, 'element_id must be nonblank and unique inside its view'));
        valid = false;
      }
      elementIds.add(elementId);
      const kind = typeof element.kind === 'string' ? element.kind : '';
      elementKinds.set(elementId, kind);
      if (!VIEW_TYPES.has(type) || !VIEW_ELEMENT_KINDS[/** @type {keyof typeof VIEW_ELEMENT_KINDS} */ (type)].includes(kind)) {
        diagnostics.push(diagnostic('classification', 'VIEW_ELEMENT_KIND_MISMATCH', `${elementPath}/kind`, `element kind "${kind}" is not legal in a ${type} view`));
        valid = false;
      }
      const support = validateSupport(element, elementPath, scope, 'VIEW_ELEMENT_SUPPORT_REQUIRED');
      if (!support.valid) valid = false;
      modeledItems.push({ claims: support.claimIds });
      if (kind === 'input-domain') {
        const classIds = objectArray(element.classes).flatMap((item) => typeof item.class_id === 'string' ? [item.class_id] : []);
        for (const classId of duplicateStrings(classIds)) {
          diagnostics.push(diagnostic(
            'schema', 'INPUT_CLASS_ID_DUPLICATE', `${elementPath}/classes/${escapePointerSegment(classId)}`,
            `input-domain class_id "${classId}" must be unique within element "${elementId}"`
          ));
          valid = false;
        }
      }
    });

    elements.forEach((element, elementIndex) => {
      const elementId = typeof element.element_id === 'string' ? element.element_id : '';
      const elementPath = `${path}/elements/${escapePointerSegment(elementId || String(elementIndex))}`;
      if (element.kind === 'flow-edge') {
        for (const field of ['from_element_id', 'to_element_id']) {
          const endpoint = element[field];
          if (typeof endpoint !== 'string' || !elementIds.has(endpoint)) {
            diagnostics.push(diagnostic('reference', 'FLOW_EDGE_ENDPOINT_DANGLING', `${elementPath}/${field}`, `flow edge endpoint "${String(endpoint)}" is not in its view`));
            valid = false;
          } else if (elementKinds.get(endpoint) !== 'flow-node') {
            diagnostics.push(diagnostic('reference', 'FLOW_EDGE_ENDPOINT_TYPE_INVALID', `${elementPath}/${field}`, `flow edge endpoint "${endpoint}" must reference a flow-node`));
            valid = false;
          }
        }
      }
    });

    if (type === 'state') {
      const stateNames = elements.flatMap((element) => element.kind === 'state' && typeof element.state === 'string'
        ? [element.state] : []);
      const declaredStates = new Set(stateNames);
      for (const stateName of duplicateStrings(stateNames)) {
        diagnostics.push(diagnostic(
          'schema', 'STATE_NAME_DUPLICATE', `${path}/state_names/${escapePointerSegment(stateName)}`,
          `state name "${stateName}" must be unique within its state view`
        ));
        valid = false;
      }
      elements.forEach((element, elementIndex) => {
        if (element.kind !== 'transition') return;
        const elementId = typeof element.element_id === 'string' ? element.element_id : '';
        const elementPath = `${path}/elements/${escapePointerSegment(elementId || String(elementIndex))}`;
        for (const field of ['from_state', 'to_state']) {
          const state = element[field];
          if (typeof state !== 'string' || !declaredStates.has(state)) {
            diagnostics.push(diagnostic('reference', 'STATE_TRANSITION_STATE_DANGLING', `${elementPath}/${field}`, `transition state "${String(state)}" is not declared by this view`));
            valid = false;
          }
        }
      });
    }

    objectArray(view.relations).forEach((relation, relationIndex) => {
      const relationId = typeof relation.relation_id === 'string' ? relation.relation_id : '';
      const relationPath = `${path}/relations/${escapePointerSegment(relationId || String(relationIndex))}`;
      const support = validateSupport(relation, relationPath, scope, 'VIEW_RELATION_SUPPORT_REQUIRED');
      if (!support.valid) valid = false;
      modeledItems.push({ claims: support.claimIds });
      for (const field of ['from_element_id', 'to_element_id']) {
        const endpoint = relation[field];
        if (typeof endpoint !== 'string' || !elementIds.has(endpoint)) {
          diagnostics.push(diagnostic('reference', 'VIEW_RELATION_ENDPOINT_DANGLING', `${relationPath}/${field}`, `relation endpoint "${String(endpoint)}" is not in its view`));
          valid = false;
        } else {
          const expectedKind = relationEndpointKind(type);
          if (expectedKind !== null && elementKinds.get(endpoint) !== expectedKind) {
            diagnostics.push(diagnostic('reference', 'VIEW_RELATION_ENDPOINT_TYPE_INVALID', `${relationPath}/${field}`, `relation endpoint "${endpoint}" must reference a ${expectedKind}`));
            valid = false;
          }
        }
      }
    });

    if (valid && !validViews.has(viewId)) {
      validViews.set(viewId, canonicalView(view));
      const modeledClaims = new Set();
      for (const item of modeledItems) {
        for (const claimId of item.claims) {
          modeledClaims.add(claimId);
          const route = claimViews.get(claimId) ?? new Set();
          route.add(viewId);
          claimViews.set(claimId, route);
        }
      }
      viewModeledClaims.set(viewId, modeledClaims);
    }
  });

  objectArray(input.interaction_candidates).forEach((candidate, candidateIndex) => {
    if (candidate.disposition !== 'formal-view') return;
    const candidateId = typeof candidate.candidate_id === 'string' && candidate.candidate_id.length > 0
      ? escapePointerSegment(candidate.candidate_id) : String(candidateIndex);
    const candidatePath = `/interaction_candidates/${candidateId}`;
    const sourceIds = stringArray(candidate.source_claim_ids);
    if (sourceIds.length === 0) diagnostics.push(diagnostic(
      'classification', 'FORMAL_CANDIDATE_EVIDENCE_REQUIRED', `${candidatePath}/source_claim_ids`, 'a formal interaction candidate requires accepted source evidence'
    ));
    const formalViewId = typeof candidate.formal_view_id === 'string' ? candidate.formal_view_id : '';
    const submittedView = views.find((view) => view.view_id === formalViewId);
    const formalView = validViews.get(formalViewId);
    if (!submittedView) diagnostics.push(diagnostic(
      'reference', 'FORMAL_INTERACTION_VIEW_DANGLING', `${candidatePath}/formal_view_id`, `formal interaction view "${formalViewId}" does not exist`
    ));
    else if (!formalView) diagnostics.push(diagnostic(
      'traceability', 'FORMAL_INTERACTION_VIEW_INVALID', `${candidatePath}/formal_view_id`, `formal interaction view "${formalViewId}" did not pass behavior-view validation`
    ));
    else if (objectArray(formalView.elements).length + objectArray(formalView.relations).length === 0) diagnostics.push(diagnostic(
      'traceability', 'FORMAL_INTERACTION_VIEW_EMPTY', `${candidatePath}/formal_view_id`, 'a formal interaction candidate must route to a nonempty behavior view'
    ));
    const modeledClaims = viewModeledClaims.get(formalViewId) ?? new Set();
    const targetScope = formalView && typeof formalView.scope === 'string' ? formalView.scope : '';
    sourceIds.forEach((claimId, claimIndex) => {
      const claim = claimsById.get(claimId);
      const claimPath = `${candidatePath}/source_claim_ids/${escapePointerSegment(claimId || String(claimIndex))}`;
      if (!claim) diagnostics.push(diagnostic(
        'reference', 'SOURCE_CLAIM_DANGLING', claimPath, `source claim "${claimId}" is not in the accepted evidence graph`
      ));
      else if (!isBehaviorSourceClaim(claim) && !isE2ModelElement(claim)) diagnostics.push(diagnostic(
        'classification', 'FORMAL_CANDIDATE_EVIDENCE_INVALID', claimPath, `source claim "${claimId}" cannot support a formal interaction`
      ));
      else {
        if (targetScope.length > 0 && (typeof claim.scope !== 'string' || !scopeContains(claim.scope, targetScope))) diagnostics.push(diagnostic(
          'classification', 'FORMAL_CANDIDATE_SCOPE_MISMATCH', claimPath, `source claim "${claimId}" does not cover formal view scope "${targetScope}"`
        ));
        if (formalView && !modeledClaims.has(claimId)) diagnostics.push(diagnostic(
          'traceability', 'FORMAL_CANDIDATE_CLAIM_UNMODELED', claimPath, `formal view "${formalViewId}" does not model source claim "${claimId}"`
        ));
      }
    });
  });

  /** @type {Array<Record<string, unknown>>} */
  const factRoutes = [];

  for (const fact of facts) {
    const factId = typeof fact.fact_id === 'string' ? fact.fact_id : '';
    const primaryClaim = typeof fact.claim_id === 'string' ? claimsById.get(fact.claim_id) : undefined;
    if (!primaryClaim || (primaryClaim.kind !== 'requirement' && primaryClaim.kind !== 'assumption') || fact.status === 'diagnostic') continue;
    const factClaimIds = [...new Set([...(typeof fact.claim_id === 'string' ? [fact.claim_id] : []), ...stringArray(fact.source_claim_ids)])];
    const viewIds = [...new Set(factClaimIds.flatMap((claimId) => [...(claimViews.get(claimId) ?? [])]))].sort(compareCodePoints);
    if (viewIds.length === 0) {
      const claimScope = typeof primaryClaim.scope === 'string' ? primaryClaim.scope : '';
      const overlapsRun = runScope === null || claimScope.length === 0
        || scopesOverlap(runScope, claimScope);
      diagnostics.push(diagnostic(
        'traceability', overlapsRun ? 'NORMATIVE_FACT_UNMODELED' : 'OUT_OF_SCOPE_NORMATIVE_FACT_UNMODELED', `/facts/${factId}`,
        overlapsRun
          ? `in-scope normative fact "${factId}" is not modeled by a valid behavior view`
          : `out-of-scope normative fact "${factId}" is not modeled; Blocked/NotApplicable routing is owned by the Test Obligations stage`
      ));
      continue;
    }
    factRoutes.push({ fact_id: factId, route_type: 'views', view_ids: viewIds });
  }

  const sortedViews = new Map([...validViews].sort(([left], [right]) => compareCodePoints(left, right)));
  factRoutes.sort((left, right) => compareCodePoints(/** @type {string} */ (left.fact_id), /** @type {string} */ (right.fact_id)));
  return { viewsById: sortedViews, factRoutes, diagnostics: sortDiagnostics(diagnostics) };
}
