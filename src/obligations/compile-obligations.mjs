import behaviorViewsSchema from '../../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import testObligationsSchema from '../../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { validateAgainstSchema, validateUniqueStableIds } from '../schema-validator.mjs';
import { auditInteractionMatrix } from '../views/interaction-matrix.mjs';
import { validateBehaviorViews } from '../views/validate-views.mjs';
import { compile as compileDecision } from './decision.mjs';
import { compile as compileFlow } from './flow.mjs';
import { compile as compileInputDomain } from './input-domain.mjs';
import { compile as compileIntegration } from './integration.mjs';
import { compile as compileRole } from './role.mjs';
import { createObligationRegistry, compareCodePoints } from './registry.mjs';
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

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
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
  const expected = ['contextsByViewId', 'customObligations', 'factRoutes'];
  const actual = Object.keys(input).sort(compareCodePoints);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ObligationCompilationError([
      diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_NOT_CLOSED', '/obligationCompilation', 'obligation compilation input has unknown or missing fields')
    ]);
  }
  if (!(input.contextsByViewId instanceof Map)
    || !isDenseObjectArray(input.customObligations) || !isDenseObjectArray(input.factRoutes)) {
    throw new ObligationCompilationError([
      diagnostic('schema', 'OBLIGATION_COMPILATION_INPUT_TYPE_INVALID', '/obligationCompilation', 'contextsByViewId must be a Map and route/obligation inputs must be arrays')
    ]);
  }
  return {
    contextsByViewId: /** @type {Map<unknown, unknown>} */ (input.contextsByViewId),
    customObligations: input.customObligations,
    factRoutes: input.factRoutes
  };
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

/** @param {ReturnType<typeof compilationInputs>} inputs @param {Map<string, Record<string, unknown>>} viewsById @param {Map<string, Record<string, unknown>>} claimsById @param {Diagnostic[]} diagnostics */
function validateCustomObligations(inputs, viewsById, claimsById, diagnostics) {
  diagnostics.push(.../** @type {Diagnostic[]} */ (validateAgainstSchema({
    schema_version: '1.0.0',
    source_revision: 0,
    obligations: inputs.customObligations,
    fact_routes: [],
    interaction_routes: []
  }, testObligationsSchema)));
  inputs.customObligations.forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : String(index);
    const path = `/obligationCompilation/customObligations/${obligationId}`;
    const keys = Object.keys(seed).sort(compareCodePoints);
    if (keys.length !== OBLIGATION_FIELDS.length || keys.some((key, keyIndex) => key !== OBLIGATION_FIELDS[keyIndex])) {
      diagnostics.push(diagnostic(
        'schema', 'CUSTOM_OBLIGATION_INPUT_NOT_CLOSED', path,
        'custom obligation must contain exactly the frozen eight obligation fields'
      ));
    }
    for (const [field, claimId] of [
      ...stringArray(seed.source_claim_ids).map((id) => ['source_claim_ids', id]),
      ...stringArray(seed.required_oracle_refs).map((id) => ['required_oracle_refs', id])
    ]) {
      if (!claimsById.has(claimId)) diagnostics.push(diagnostic(
        'reference', 'CUSTOM_OBLIGATION_CLAIM_DANGLING', `${path}/${field}`,
        `custom obligation references unknown accepted claim "${claimId}"`
      ));
    }
    for (const viewElementRef of stringArray(seed.view_element_refs)) {
      const separator = viewElementRef.indexOf('#');
      const viewId = separator > 0 ? viewElementRef.slice(0, separator) : '';
      const elementId = separator > 0 ? viewElementRef.slice(separator + 1) : '';
      const view = viewsById.get(viewId);
      const exists = Boolean(view) && objectArray(view?.elements).some((element) => element.element_id === elementId);
      if (!exists) diagnostics.push(diagnostic(
        'reference', 'CUSTOM_OBLIGATION_VIEW_ELEMENT_DANGLING', `${path}/view_element_refs`,
        `custom obligation references unknown view element "${viewElementRef}"`
      ));
    }
  });
}

/**
 * `obligation_id` is the submitted stable semantic signature. Duplicate IDs may
 * add provenance/gates, but cannot disagree on the obligation's core meaning.
 * @param {Record<string, unknown>[]} seeds
 * @param {Diagnostic[]} diagnostics
 */
function mergeObligations(seeds, diagnostics) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  seeds.forEach((seed, index) => {
    const obligationId = typeof seed.obligation_id === 'string' ? seed.obligation_id : '';
    const path = `/obligations/${obligationId || index}`;
    const existing = byId.get(obligationId);
    if (!existing) {
      byId.set(obligationId, {
        obligation_id: seed.obligation_id,
        kind: seed.kind,
        risk: seed.risk,
        scope: seed.scope,
        ...Object.fromEntries(OBLIGATION_SET_FIELDS.map((field) => [field, [...new Set(stringArray(seed[field]))].sort(compareCodePoints)]))
      });
      return;
    }
    if (existing.kind !== seed.kind || existing.risk !== seed.risk || existing.scope !== seed.scope) {
      diagnostics.push(diagnostic(
        'classification', 'OBLIGATION_SIGNATURE_CONFLICT', path,
        `duplicate obligation signature "${obligationId}" has conflicting kind, risk, or scope`
      ));
      return;
    }
    for (const field of OBLIGATION_SET_FIELDS) {
      existing[field] = [...new Set([...stringArray(existing[field]), ...stringArray(seed[field])])].sort(compareCodePoints);
    }
  });
  return [...byId.values()].sort((left, right) => compareCodePoints(String(left.obligation_id), String(right.obligation_id)));
}

/** @param {Record<string, unknown>} graph @param {Map<string, Record<string, unknown>>} viewsById @param {ReturnType<typeof compilationInputs>} inputs @param {Diagnostic[]} diagnostics */
function compileViewObligations(graph, viewsById, inputs, diagnostics) {
  const registry = defaultRegistry();
  const claimsById = graph.claimsById instanceof Map ? graph.claimsById : new Map();
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
    if (typeof key !== 'string' || !viewsById.has(key)) diagnostics.push(diagnostic(
      'reference', 'OBLIGATION_CONTEXT_VIEW_UNKNOWN', `/obligationCompilation/contextsByViewId/${String(key)}`,
      `compilation context references unknown view "${String(key)}"`
    ));
  }
  return mergeObligations([...seeds, ...inputs.customObligations], diagnostics);
}

/** @param {Record<string, unknown>} graph */
function formalFacts(graph) {
  const claimsById = graph.claimsById instanceof Map
    ? /** @type {Map<string, Record<string, unknown>>} */ (graph.claimsById) : new Map();
  return objectArray(graph.factLedger).filter((fact) => {
    const claim = typeof fact.claim_id === 'string' ? claimsById.get(fact.claim_id) : undefined;
    return fact.status !== 'diagnostic' && (claim?.kind === 'requirement' || claim?.kind === 'assumption');
  });
}

/** @param {ReturnType<typeof compilationInputs>} inputs @param {Map<string, Record<string, unknown>>} factsById @param {Map<string, Record<string, unknown>>} claimsById @param {Diagnostic[]} diagnostics */
function terminalFactRoutes(inputs, factsById, claimsById, diagnostics) {
  /** @type {Map<string, Record<string, unknown>>} */
  const routes = new Map();
  inputs.factRoutes.forEach((route, index) => {
    const factId = typeof route.fact_id === 'string' ? route.fact_id : '';
    const path = `/obligationCompilation/factRoutes/${factId || index}`;
    if (!factsById.has(factId)) {
      diagnostics.push(diagnostic('reference', 'FACT_ROUTE_UNKNOWN', `${path}/fact_id`, `route references unknown formal fact "${factId}"`));
      return;
    }
    if (routes.has(factId)) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_MULTIPLE', path, `formal fact "${factId}" has more than one explicit route`));
      return;
    }
    const routeType = route.route_type;
    if (routeType === 'exploratory') {
      diagnostics.push(diagnostic('classification', 'FORMAL_FACT_EXPLORATORY_FORBIDDEN', path, 'a formal fact cannot route directly to Exploratory'));
      return;
    }
    if (routeType === 'blocked') {
      const keys = Object.keys(route).sort(compareCodePoints);
      if (keys.join('\0') !== ['blocker_root_issue_id', 'fact_id', 'route_type'].sort(compareCodePoints).join('\0')
        || typeof route.blocker_root_issue_id !== 'string' || route.blocker_root_issue_id.length === 0) {
        diagnostics.push(diagnostic('classification', 'FACT_BLOCKED_ROUTE_INVALID', path, 'Blocked route must contain only one blocker_root_issue_id'));
        return;
      }
      routes.set(factId, { fact_id: factId, route_type: 'blocked', blocker_root_issue_id: route.blocker_root_issue_id });
      return;
    }
    if (routeType === 'not_applicable') {
      const keys = Object.keys(route).sort(compareCodePoints);
      const claimId = typeof route.not_applicable_claim_id === 'string' ? route.not_applicable_claim_id : '';
      if (keys.join('\0') !== ['fact_id', 'not_applicable_claim_id', 'route_type'].sort(compareCodePoints).join('\0') || claimId.length === 0) {
        diagnostics.push(diagnostic('classification', 'FACT_NOT_APPLICABLE_ROUTE_INVALID', path, 'NotApplicable route must contain only one exclusion claim'));
        return;
      }
      if (!claimsById.has(claimId)) {
        diagnostics.push(diagnostic('reference', 'NOT_APPLICABLE_CLAIM_DANGLING', `${path}/not_applicable_claim_id`, `NotApplicable route references unknown claim "${claimId}"`));
        return;
      }
      routes.set(factId, { fact_id: factId, route_type: 'not_applicable', not_applicable_claim_id: claimId });
      return;
    }
    diagnostics.push(diagnostic('classification', 'FACT_ROUTE_TYPE_INVALID', `${path}/route_type`, 'explicit fact route must be Blocked or NotApplicable'));
  });
  return routes;
}

/** @param {Diagnostic} item @param {Set<string>} terminalFactIds */
function isResolvedTask4FactDiagnostic(item, terminalFactIds) {
  if (item.code !== 'NORMATIVE_FACT_UNMODELED' && item.code !== 'OUT_OF_SCOPE_NORMATIVE_FACT_UNMODELED') return false;
  const prefix = '/facts/';
  return item.path.startsWith(prefix) && terminalFactIds.has(item.path.slice(prefix.length));
}

/** @param {Record<string, unknown>[]} facts @param {Record<string, unknown>[]} obligations @param {Record<string, unknown>[]} viewRoutes @param {Map<string, Record<string, unknown>>} terminalRoutes @param {Diagnostic[]} diagnostics */
function reconcileFactRoutes(facts, obligations, viewRoutes, terminalRoutes, diagnostics) {
  const viewsByFact = new Map(viewRoutes.flatMap((route) => typeof route.fact_id === 'string'
    ? [[route.fact_id, new Set(stringArray(route.view_ids))]] : []));
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
    const claimIds = new Set([String(fact.claim_id), ...stringArray(fact.source_claim_ids)]);
    const obligationIds = obligations.flatMap((obligation) => {
      const inView = stringArray(obligation.view_element_refs).some((ref) => {
        const split = ref.indexOf('#');
        return split > 0 && viewIds.has(ref.slice(0, split));
      });
      const sharesEvidence = stringArray(obligation.source_claim_ids).some((claimId) => claimIds.has(claimId));
      return inView && sharesEvidence && typeof obligation.obligation_id === 'string' ? [obligation.obligation_id] : [];
    }).sort(compareCodePoints);
    if (obligationIds.length === 0) {
      diagnostics.push(diagnostic('traceability', 'FACT_ROUTE_OBLIGATION_MISSING', `/fact_routes/${factId}`, `modeled fact "${factId}" produced no formal obligation`));
      continue;
    }
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [...new Set(obligationIds)] });
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
 * Compile the frozen formal Test Point artifact from accepted Task 3 evidence
 * and the submitted Task 4 behavior artifact.
 * @param {unknown} evidenceGraph
 * @param {unknown} behaviorViews
 */
export function compileObligations(evidenceGraph, behaviorViews) {
  const graph = isObject(evidenceGraph) ? evidenceGraph : {};
  const artifact = isObject(behaviorViews) ? behaviorViews : {};
  const structuralDiagnostics = [
    .../** @type {Diagnostic[]} */ (validateAgainstSchema(artifact, behaviorViewsSchema)),
    .../** @type {Diagnostic[]} */ (validateUniqueStableIds(artifact))
  ];
  const inputs = compilationInputs(graph);
  const viewValidation = validateBehaviorViews(graph, artifact);
  const interactionAudit = auditInteractionMatrix(artifact);
  const diagnostics = [...structuralDiagnostics];
  const facts = formalFacts(graph);
  const factsById = new Map(facts.flatMap((fact) => typeof fact.fact_id === 'string' ? [[fact.fact_id, fact]] : []));
  const claimsById = graph.claimsById instanceof Map
    ? /** @type {Map<string, Record<string, unknown>>} */ (graph.claimsById) : new Map();
  const terminalRoutes = terminalFactRoutes(inputs, factsById, claimsById, diagnostics);
  diagnostics.push(
    .../** @type {Diagnostic[]} */ (viewValidation.diagnostics)
      .filter((item) => !isResolvedTask4FactDiagnostic(item, new Set(terminalRoutes.keys()))),
    .../** @type {Diagnostic[]} */ (interactionAudit.diagnostics)
  );
  validateCustomObligations(inputs, viewValidation.viewsById, claimsById, diagnostics);
  assertNoDiagnostics(diagnostics);

  const obligations = compileViewObligations(graph, viewValidation.viewsById, inputs, diagnostics);
  const factRoutes = reconcileFactRoutes(
    facts, obligations, /** @type {Record<string, unknown>[]} */ (viewValidation.factRoutes), terminalRoutes, diagnostics
  );
  const interactionRoutes = reconcileInteractionRoutes(
    /** @type {Record<string, unknown>[]} */ (interactionAudit.candidates)
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
