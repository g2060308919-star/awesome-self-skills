import { scopeContains } from '../decision-record.mjs';

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
const FACT_ROUTE_DESTINATIONS = Object.freeze([
  'blocker_root_issue_id', 'not_applicable_claim_id'
]);

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
  for (const item of diagnostics) unique.set(`${item.category}\0${item.code}\0${item.path}\0${item.message}`, item);
  return [...unique.values()].sort((left, right) => compareCodePoints(
    `${left.category}\0${left.code}\0${left.path}\0${left.message}`,
    `${right.category}\0${right.code}\0${right.path}\0${right.message}`
  ));
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

/** @param {unknown} evidenceGraph */
function explicitFactRoutes(evidenceGraph) {
  if (!isObject(evidenceGraph)) return [];
  return objectArray(evidenceGraph.factRoutes ?? evidenceGraph.fact_routes);
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
  const submittedRoutes = explicitFactRoutes(graph);
  const runScope = typeof graph.runScope === 'string' ? graph.runScope
    : typeof graph.run_scope === 'string' ? graph.run_scope : null;
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];
  /** @type {Map<string, Record<string, unknown>>} */
  const validViews = new Map();
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
      if (!claim) {
        diagnostics.push(diagnostic('reference', 'SOURCE_CLAIM_DANGLING', `${path}/source_claim_ids/${index}`, `source claim "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isBehaviorSourceClaim(claim)) {
        diagnostics.push(diagnostic('classification', 'SOURCE_CLAIM_NOT_BEHAVIOR_EVIDENCE', `${path}/source_claim_ids/${index}`, `source claim "${claimId}" cannot support a formal behavior element`));
        valid = false;
      } else if (typeof claim.scope === 'string' && !scopeContains(claim.scope, viewScope)) {
        diagnostics.push(diagnostic('classification', 'SOURCE_CLAIM_SCOPE_MISMATCH', `${path}/source_claim_ids/${index}`, `source claim "${claimId}" does not cover view scope "${viewScope}"`));
        valid = false;
      } else acceptedIds.push(claimId);
    });
    modelIds.forEach((claimId, index) => {
      const claim = claimsById.get(claimId);
      if (!claim) {
        diagnostics.push(diagnostic('reference', 'MODEL_REF_DANGLING', `${path}/model_refs/${index}`, `model ref "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isE2ModelElement(claim)) {
        diagnostics.push(diagnostic('classification', 'MODEL_REF_NOT_E2_MODEL_ELEMENT', `${path}/model_refs/${index}`, `model ref "${claimId}" is not an accepted E2 model element`));
        valid = false;
      } else if (typeof claim.scope === 'string' && !scopeContains(claim.scope, viewScope)) {
        diagnostics.push(diagnostic('classification', 'MODEL_REF_SCOPE_MISMATCH', `${path}/model_refs/${index}`, `model ref "${claimId}" does not cover view scope "${viewScope}"`));
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
    const path = `/views/${viewIndex}`;
    const viewId = typeof view.view_id === 'string' ? view.view_id : '';
    const type = typeof view.type === 'string' ? view.type : '';
    const scope = typeof view.scope === 'string' ? view.scope : '';
    let valid = viewId.length > 0 && scope.length > 0;
    if (!VIEW_TYPES.has(type)) {
      diagnostics.push(diagnostic('classification', 'VIEW_TYPE_UNSUPPORTED', `${path}/type`, `view type "${type}" is outside the closed behavior-view set`));
      valid = false;
    }
    for (const [claimIndex, claimId] of stringArray(view.source_claim_ids).entries()) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        diagnostics.push(diagnostic('reference', 'SOURCE_CLAIM_DANGLING', `${path}/source_claim_ids/${claimIndex}`, `source claim "${claimId}" is not in the accepted evidence graph`));
        valid = false;
      } else if (!isBehaviorSourceClaim(claim) && !isE2ModelElement(claim)) {
        diagnostics.push(diagnostic('classification', 'VIEW_SOURCE_CLAIM_INVALID', `${path}/source_claim_ids/${claimIndex}`, `source claim "${claimId}" cannot support a formal behavior view`));
        valid = false;
      } else if (typeof claim.scope === 'string' && !scopeContains(claim.scope, scope)) {
        diagnostics.push(diagnostic('classification', 'SOURCE_CLAIM_SCOPE_MISMATCH', `${path}/source_claim_ids/${claimIndex}`, `source claim "${claimId}" does not cover view scope "${scope}"`));
        valid = false;
      }
    }

    const elements = objectArray(view.elements);
    const elementIds = new Set();
    /** @type {Array<{claims: Set<string>}>} */
    const modeledItems = [];
    elements.forEach((element, elementIndex) => {
      const elementPath = `${path}/elements/${elementIndex}`;
      const elementId = typeof element.element_id === 'string' ? element.element_id : '';
      if (elementId.length === 0 || elementIds.has(elementId)) {
        diagnostics.push(diagnostic('schema', 'VIEW_ELEMENT_ID_INVALID', `${elementPath}/element_id`, 'element_id must be nonblank and unique inside its view'));
        valid = false;
      }
      elementIds.add(elementId);
      const kind = typeof element.kind === 'string' ? element.kind : '';
      if (!VIEW_TYPES.has(type) || !VIEW_ELEMENT_KINDS[/** @type {keyof typeof VIEW_ELEMENT_KINDS} */ (type)].includes(kind)) {
        diagnostics.push(diagnostic('classification', 'VIEW_ELEMENT_KIND_MISMATCH', `${elementPath}/kind`, `element kind "${kind}" is not legal in a ${type} view`));
        valid = false;
      }
      const support = validateSupport(element, elementPath, scope, 'VIEW_ELEMENT_SUPPORT_REQUIRED');
      if (!support.valid) valid = false;
      modeledItems.push({ claims: support.claimIds });
    });

    elements.forEach((element, elementIndex) => {
      if (element.kind !== 'flow-edge') return;
      for (const field of ['from_element_id', 'to_element_id']) {
        const endpoint = element[field];
        if (typeof endpoint !== 'string' || !elementIds.has(endpoint)) {
          diagnostics.push(diagnostic('reference', 'FLOW_EDGE_ENDPOINT_DANGLING', `${path}/elements/${elementIndex}/${field}`, `flow edge endpoint "${String(endpoint)}" is not in its view`));
          valid = false;
        }
      }
    });

    objectArray(view.relations).forEach((relation, relationIndex) => {
      const relationPath = `${path}/relations/${relationIndex}`;
      const support = validateSupport(relation, relationPath, scope, 'VIEW_RELATION_SUPPORT_REQUIRED');
      if (!support.valid) valid = false;
      modeledItems.push({ claims: support.claimIds });
      for (const field of ['from_element_id', 'to_element_id']) {
        const endpoint = relation[field];
        if (typeof endpoint !== 'string' || !elementIds.has(endpoint)) {
          diagnostics.push(diagnostic('reference', 'VIEW_RELATION_ENDPOINT_DANGLING', `${relationPath}/${field}`, `relation endpoint "${String(endpoint)}" is not in its view`));
          valid = false;
        }
      }
    });

    if (valid && !validViews.has(viewId)) {
      validViews.set(viewId, view);
      for (const item of modeledItems) {
        for (const claimId of item.claims) {
          const route = claimViews.get(claimId) ?? new Set();
          route.add(viewId);
          claimViews.set(claimId, route);
        }
      }
    }
  });

  objectArray(input.interaction_candidates).forEach((candidate, candidateIndex) => {
    if (candidate.disposition !== 'formal-view') return;
    const sourceIds = stringArray(candidate.source_claim_ids);
    if (sourceIds.length === 0) diagnostics.push(diagnostic(
      'classification', 'FORMAL_CANDIDATE_EVIDENCE_REQUIRED', `/interaction_candidates/${candidateIndex}/source_claim_ids`, 'a formal interaction candidate requires accepted source evidence'
    ));
    sourceIds.forEach((claimId, claimIndex) => {
      const claim = claimsById.get(claimId);
      if (!claim) diagnostics.push(diagnostic(
        'reference', 'SOURCE_CLAIM_DANGLING', `/interaction_candidates/${candidateIndex}/source_claim_ids/${claimIndex}`, `source claim "${claimId}" is not in the accepted evidence graph`
      ));
      else if (!isBehaviorSourceClaim(claim) && !isE2ModelElement(claim)) diagnostics.push(diagnostic(
        'classification', 'FORMAL_CANDIDATE_EVIDENCE_INVALID', `/interaction_candidates/${candidateIndex}/source_claim_ids/${claimIndex}`, `source claim "${claimId}" cannot support a formal interaction`
      ));
    });
  });

  /** @type {Map<string, Record<string, unknown>[]>} */
  const routesByFact = new Map();
  for (const route of submittedRoutes) {
    if (typeof route.fact_id !== 'string') continue;
    const routes = routesByFact.get(route.fact_id) ?? [];
    routes.push(route);
    routesByFact.set(route.fact_id, routes);
  }
  /** @type {Array<Record<string, unknown>>} */
  const factRoutes = [];
  const knownFactIds = new Set(facts.flatMap((fact) => typeof fact.fact_id === 'string' ? [fact.fact_id] : []));

  for (const [factId] of routesByFact) {
    if (!knownFactIds.has(factId)) diagnostics.push(diagnostic(
      'reference', 'FACT_ROUTE_DANGLING', `/fact_routes/${factId}`, `fact route references unknown fact "${factId}"`
    ));
  }

  for (const fact of facts) {
    const factId = typeof fact.fact_id === 'string' ? fact.fact_id : '';
    const primaryClaim = typeof fact.claim_id === 'string' ? claimsById.get(fact.claim_id) : undefined;
    if (!primaryClaim || (primaryClaim.kind !== 'requirement' && primaryClaim.kind !== 'assumption') || fact.status === 'diagnostic') continue;
    const factClaimIds = [...new Set([...(typeof fact.claim_id === 'string' ? [fact.claim_id] : []), ...stringArray(fact.source_claim_ids)])];
    const viewIds = [...new Set(factClaimIds.flatMap((claimId) => [...(claimViews.get(claimId) ?? [])]))].sort(compareCodePoints);
    const routes = routesByFact.get(factId) ?? [];
    const routeCount = (viewIds.length > 0 ? 1 : 0) + routes.length;
    if (routeCount !== 1) {
      if (routeCount > 1) diagnostics.push(diagnostic(
        'traceability', 'FACT_ROUTE_NOT_EXACT', `/facts/${factId}`, `normative fact "${factId}" has competing modeled or explicit routes`
      ));
      else {
        const claimScope = typeof primaryClaim.scope === 'string' ? primaryClaim.scope : '';
        const outsideScope = runScope !== null && claimScope.length > 0 && !scopeContains(runScope, claimScope);
        diagnostics.push(diagnostic(
          'traceability', outsideScope ? 'OUT_OF_SCOPE_FACT_EXCLUSION_REQUIRED' : 'NORMATIVE_FACT_UNMODELED', `/facts/${factId}`,
          outsideScope
            ? `out-of-scope normative fact "${factId}" requires an accepted exclusion claim`
            : `in-scope normative fact "${factId}" is neither modeled nor explicitly Blocked/NotApplicable`
        ));
      }
      continue;
    }
    if (viewIds.length > 0) {
      factRoutes.push({ fact_id: factId, route_type: 'views', view_ids: viewIds });
      continue;
    }
    const route = /** @type {Record<string, unknown>} */ (routes[0]);
    const destinationFields = FACT_ROUTE_DESTINATIONS.filter((field) => typeof route[field] === 'string'
      && /** @type {string} */ (route[field]).trim().length > 0);
    if (route.route_type === 'blocked' && typeof route.blocker_root_issue_id === 'string' && route.blocker_root_issue_id.trim().length > 0
      && destinationFields.length === 1 && destinationFields[0] === 'blocker_root_issue_id') {
      factRoutes.push({ fact_id: factId, route_type: 'blocked', blocker_root_issue_id: route.blocker_root_issue_id });
    } else if (route.route_type === 'not_applicable' && typeof route.not_applicable_claim_id === 'string'
      && destinationFields.length === 1 && destinationFields[0] === 'not_applicable_claim_id') {
      const exclusion = claimsById.get(route.not_applicable_claim_id);
      if (!exclusion || (exclusion.level !== 'E3' && exclusion.level !== 'E2')) diagnostics.push(diagnostic(
        'classification', 'NOT_APPLICABLE_EVIDENCE_INVALID', `/fact_routes/${factId}/not_applicable_claim_id`, 'NotApplicable requires an accepted E3/E2 exclusion claim'
      ));
      else if (runScope !== null && (typeof exclusion.scope !== 'string' || !scopeContains(exclusion.scope, runScope))) diagnostics.push(diagnostic(
        'classification', 'NOT_APPLICABLE_SCOPE_MISMATCH', `/fact_routes/${factId}/not_applicable_claim_id`, 'NotApplicable exclusion evidence must cover the current run scope'
      ));
      else factRoutes.push({ fact_id: factId, route_type: 'not_applicable', not_applicable_claim_id: route.not_applicable_claim_id });
    } else diagnostics.push(diagnostic(
      'classification', 'FACT_EXPLICIT_ROUTE_INVALID', `/fact_routes/${factId}`, 'explicit fact route must be exactly Blocked or NotApplicable'
    ));
  }

  const sortedViews = new Map([...validViews].sort(([left], [right]) => compareCodePoints(left, right)));
  factRoutes.sort((left, right) => compareCodePoints(/** @type {string} */ (left.fact_id), /** @type {string} */ (right.fact_id)));
  return { viewsById: sortedViews, factRoutes, diagnostics: sortDiagnostics(diagnostics) };
}
