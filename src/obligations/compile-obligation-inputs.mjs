import { canonicalStringify } from '../canonical.mjs';
import {
  compareCodePoints, isObject, objectArray, sortedStrings
} from './registry.mjs';
import { responsibilityKey } from './responsibility.mjs';

/** @typedef {{category:string,code:string,path:string,message:string}} Diagnostic */
/** @typedef {{contextsByViewId:Map<string,Record<string,unknown>>,terminalFactRoutes:Record<string,unknown>[],notApplicableReviews:Record<string,unknown>[],customResponsibilitySeeds:Record<string,unknown>[],combinationRequests:Record<string,unknown>[],sourceRevision:number,diagnostics:Diagnostic[]}} ObligationInputsResult */

const TARGET_VIEW_TYPES = new Set(['input-domain', 'role', 'timing', 'integration']);
const CORE_INTEGRATION_SURFACES = [
  'request', 'response', 'persistence', 'event', 'callback', 'compensation'
];
const TIMING_SPECIALS = new Set(['timeout', 'retry']);
const INTEGRATION_SPECIALS = new Set([
  'invariant', 'contract-compatibility', 'concurrency', 'idempotency', 'security-abuse'
]);

/** @param {string} code @param {string} path @param {string} message @param {string} [category] */
function diagnostic(code, path, message, category = 'classification') {
  return { category, code, path, message };
}

/** @param {string} value */
function pointerPart(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** @param {Record<string, unknown>} view */
function derivedContext(view) {
  /** @type {Record<string,string>} */
  const riskByElementId = {};
  /** @type {Record<string,string[]>} */
  const requiredOracleRefsByElementId = {};
  /** @type {Record<string,string[]>} */
  const requiredCapabilitiesByElementId = {};
  for (const element of objectArray(view.elements)) {
    if (typeof element.element_id !== 'string') continue;
    riskByElementId[element.element_id] = 'medium';
    requiredOracleRefsByElementId[element.element_id] = sortedStrings(element.source_claim_ids, true);
    requiredCapabilitiesByElementId[element.element_id] = [];
  }
  return { riskByElementId, requiredOracleRefsByElementId, requiredCapabilitiesByElementId };
}

/**
 * Return every required selector for one public responsibility view. Optional
 * signal responsibilities are admitted from bindings after their claim is
 * validated; they are never inferred from free text.
 * @param {Record<string, unknown>} view
 */
function requiredSelectors(view) {
  /** @type {Record<string, unknown>[]} */
  const selectors = [];
  for (const element of objectArray(view.elements)) {
    const elementId = String(element.element_id ?? '');
    if (view.type === 'input-domain' && element.kind === 'input-domain') {
      for (const inputClass of objectArray(element.classes)) selectors.push({
        kind: 'equivalence-class', element_id: elementId, class_id: inputClass.class_id
      });
      if (isObject(element.bounds)) for (const boundary of ['lower', 'upper']) selectors.push({
        kind: 'boundary', element_id: elementId, boundary
      });
    } else if (view.type === 'role' && element.kind === 'role-permission') {
      for (const permission of sortedStrings(element.permissions)) selectors.push({
        kind: 'permission', element_id: elementId, permission
      });
    } else if (view.type === 'timing' && element.kind === 'timing-rule') {
      for (const kind of ['before', 'equal', 'after']) selectors.push({ kind, element_id: elementId });
    } else if (view.type === 'integration' && element.kind === 'integration-contract') {
      for (const kind of CORE_INTEGRATION_SURFACES) selectors.push({ kind, element_id: elementId });
      for (const sideEffect of objectArray(element.side_effects)) selectors.push({
        kind: 'side-effect', element_id: elementId,
        side_effect_kind: sideEffect.kind, target: sideEffect.target
      });
    }
  }
  return selectors;
}

/** @param {Record<string, unknown>} selector */
function selectorResponsibilityKey(selector) {
  const kind = String(selector.kind ?? '');
  const elementId = String(selector.element_id ?? '');
  if (kind === 'equivalence-class') return responsibilityKey('input-domain', elementId, {
    responsibility: 'equivalence-class', class_id: selector.class_id
  });
  if (kind === 'boundary') return responsibilityKey('input-domain', elementId, {
    responsibility: 'boundary', boundary: selector.boundary
  });
  if (kind === 'permission') return responsibilityKey('role', elementId, {
    responsibility: 'permission', permission: selector.permission
  });
  if (kind === 'before' || kind === 'equal' || kind === 'after') {
    return responsibilityKey('timing', elementId, {
      responsibility: 'threshold', threshold_relation: kind
    });
  }
  if (TIMING_SPECIALS.has(kind)) return responsibilityKey('timing', elementId, {
    responsibility: kind, signal: selector.signal_claim_id
  });
  if (CORE_INTEGRATION_SURFACES.includes(kind)) return responsibilityKey('integration', elementId, {
    responsibility: 'surface', surface: kind
  });
  if (kind === 'side-effect') return responsibilityKey('integration', elementId, {
    responsibility: 'side-effect',
    side_effect: { kind: selector.side_effect_kind, target: selector.target }
  });
  if (kind === 'invariant') return responsibilityKey('integration', elementId, {
    responsibility: 'invariant', invariant: selector.signal_claim_id
  });
  if (INTEGRATION_SPECIALS.has(kind)) return responsibilityKey('integration', elementId, {
    responsibility: kind, signal: selector.signal_claim_id
  });
  return '';
}

/**
 * @param {Record<string, unknown>} view
 * @param {Record<string, unknown>} submitted
 * @param {number} contextIndex
 * @param {Diagnostic[]} diagnostics
 */
function publicContext(view, submitted, contextIndex, diagnostics) {
  const viewId = String(view.view_id);
  const path = `/obligation_inputs/view_contexts/${contextIndex}`;
  const required = new Map(requiredSelectors(view).map((selector) => [
    canonicalStringify(selector), selector
  ]));
  const seen = new Set();
  /** @type {Record<string, unknown>[]} */
  const responsibilityBindings = [];
  /** @type {Record<string, Record<string, unknown>[]>} */
  const timingSpecialResponsibilitiesByElementId = {};
  /** @type {Record<string, Record<string, unknown>[]>} */
  const integrationInvariantsByElementId = {};
  /** @type {Record<string, Record<string, unknown>[]>} */
  const integrationSpecialResponsibilitiesByElementId = {};
  for (const [bindingIndex, binding] of objectArray(submitted.bindings).entries()) {
    const bindingPath = `${path}/bindings/${bindingIndex}`;
    const selector = isObject(binding.selector) ? binding.selector : {};
    const selectorSignature = canonicalStringify(selector);
    if (seen.has(selectorSignature)) {
      diagnostics.push(diagnostic(
        'OBLIGATION_BINDING_DUPLICATE', `${bindingPath}/selector`,
        `view "${viewId}" has more than one binding for the same selector`
      ));
      continue;
    }
    seen.add(selectorSignature);
    const element = objectArray(view.elements).find((item) => item.element_id === selector.element_id);
    const kind = String(selector.kind ?? '');
    let allowedOptional = false;
    if (element && view.type === 'timing' && element.kind === 'timing-rule'
      && TIMING_SPECIALS.has(kind)) allowedOptional = true;
    if (element && view.type === 'integration' && element.kind === 'integration-contract'
      && INTEGRATION_SPECIALS.has(kind)) allowedOptional = true;
    if (!required.has(selectorSignature) && !allowedOptional) {
      diagnostics.push(diagnostic(
        'OBLIGATION_SELECTOR_UNKNOWN', `${bindingPath}/selector`,
        `selector does not identify a responsibility in view "${viewId}"`, 'reference'
      ));
      continue;
    }
    if (allowedOptional) {
      const signalClaimId = String(selector.signal_claim_id ?? '');
      const sourceClaimIds = sortedStrings(binding.source_claim_ids, true);
      if (!signalClaimId || !sourceClaimIds.includes(signalClaimId)) {
        diagnostics.push(diagnostic(
          'OBLIGATION_SIGNAL_CLAIM_REQUIRED', `${bindingPath}/selector/signal_claim_id`,
          'signal responsibilities must include their accepted signal claim in source_claim_ids',
          'traceability'
        ));
        continue;
      }
      const elementId = String(selector.element_id);
      if (view.type === 'timing') {
        const entries = timingSpecialResponsibilitiesByElementId[elementId] ?? [];
        entries.push({ type: kind, signal: signalClaimId });
        timingSpecialResponsibilitiesByElementId[elementId] = entries;
      } else if (kind === 'invariant') {
        const entries = integrationInvariantsByElementId[elementId] ?? [];
        entries.push({ invariant: signalClaimId });
        integrationInvariantsByElementId[elementId] = entries;
      } else {
        const entries = integrationSpecialResponsibilitiesByElementId[elementId] ?? [];
        entries.push({ type: kind, signal: signalClaimId });
        integrationSpecialResponsibilitiesByElementId[elementId] = entries;
      }
    }
    responsibilityBindings.push({
      responsibility_key: selectorResponsibilityKey(selector),
      risk: binding.risk,
      source_claim_ids: sortedStrings(binding.source_claim_ids, true),
      required_oracle_refs: sortedStrings(binding.required_oracle_refs, true),
      required_capabilities: sortedStrings(binding.required_capabilities, true)
    });
  }
  for (const [signature, selector] of required) {
    if (!seen.has(signature)) diagnostics.push(diagnostic(
      'OBLIGATION_BINDING_MISSING', `${path}/bindings`,
      `view "${viewId}" is missing the required ${String(selector.kind)} binding`
    ));
  }
  responsibilityBindings.sort((left, right) => compareCodePoints(
    String(left.responsibility_key), String(right.responsibility_key)
  ));
  return {
    responsibilityBindings,
    ...(view.type === 'timing' ? { timingSpecialResponsibilitiesByElementId } : {}),
    ...(view.type === 'integration' ? {
      integrationInvariantsByElementId, integrationSpecialResponsibilitiesByElementId
    } : {})
  };
}

/** @param {unknown} value */
function legacyInputs(value) {
  return isObject(value) && isObject(value.obligationCompilation)
    ? value.obligationCompilation : null;
}

/** @param {unknown} value */
function isDenseObjectArray(value) {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isObject(value[index])) return false;
  }
  return true;
}

/**
 * Compile the sole behavior-views seam into private strategy inputs. The three
 * later-slice arrays remain required and empty in production for G1-A.
 *
 * @param {unknown} evidenceGraph
 * @param {unknown} behaviorViews
 * @returns {ObligationInputsResult}
 */
export function compileObligationInputs(evidenceGraph, behaviorViews) {
  const graph = isObject(evidenceGraph) ? evidenceGraph : {};
  const artifact = isObject(behaviorViews) ? behaviorViews : {};
  const inputs = isObject(artifact.obligation_inputs) ? artifact.obligation_inputs : {};
  const legacy = legacyInputs(graph);
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  /** @type {Map<string, Record<string, unknown>>} */
  const contextsByViewId = new Map();
  if (legacy) {
    const expected = [
      'contextsByViewId', 'customObligations', 'factRoutes',
      'notApplicableReviews', 'sourceRevision'
    ];
    const actual = Object.keys(legacy).sort(compareCodePoints);
    if (actual.length !== expected.length
      || actual.some((key, index) => key !== expected[index])) diagnostics.push(diagnostic(
      'OBLIGATION_COMPILATION_INPUT_NOT_CLOSED', '/obligationCompilation',
      'legacy obligation compilation input has unknown or missing fields', 'schema'
    ));
    if (!(legacy.contextsByViewId instanceof Map)
      || !isDenseObjectArray(legacy.customObligations)
      || !isDenseObjectArray(legacy.factRoutes)
      || !isDenseObjectArray(legacy.notApplicableReviews)
      || !Number.isInteger(legacy.sourceRevision)
      || Number(legacy.sourceRevision) < 0) diagnostics.push(diagnostic(
      'OBLIGATION_COMPILATION_INPUT_TYPE_INVALID', '/obligationCompilation',
      'legacy contexts must be a Map and route/responsibility inputs must be dense object arrays',
      'schema'
    ));
  }
  const viewsById = new Map(objectArray(artifact.views).map((view) => [String(view.view_id), view]));
  for (const view of viewsById.values()) {
    if (view.type !== 'integration') continue;
    for (const element of objectArray(view.elements)) {
      if (element.kind !== 'integration-contract') continue;
      const seenSideEffects = new Set();
      for (const [index, sideEffect] of objectArray(element.side_effects).entries()) {
        const signature = canonicalStringify({ kind: sideEffect.kind, target: sideEffect.target });
        if (seenSideEffects.has(signature)) diagnostics.push(diagnostic(
          'OBLIGATION_SIDE_EFFECT_DUPLICATE',
          `/views/${pointerPart(String(view.view_id))}/elements/${pointerPart(String(element.element_id))}/side_effects/${index}`,
          'integration side effects must be unique by (kind, target)'
        ));
        seenSideEffects.add(signature);
      }
    }
  }
  const contextsById = new Map();
  for (const [index, context] of objectArray(inputs.view_contexts).entries()) {
    const viewId = String(context.view_id ?? '');
    if (contextsById.has(viewId)) diagnostics.push(diagnostic(
      'OBLIGATION_VIEW_CONTEXT_DUPLICATE', `/obligation_inputs/view_contexts/${index}/view_id`,
      `view "${viewId}" has more than one obligation context`
    ));
    else contextsById.set(viewId, { context, index });
    const view = viewsById.get(viewId);
    if (!view) diagnostics.push(diagnostic(
      'OBLIGATION_VIEW_CONTEXT_UNKNOWN', `/obligation_inputs/view_contexts/${index}/view_id`,
      `obligation context references unknown view "${viewId}"`, 'reference'
    ));
    else if (!TARGET_VIEW_TYPES.has(String(view.type))) diagnostics.push(diagnostic(
      'OBLIGATION_VIEW_CONTEXT_TYPE_FORBIDDEN', `/obligation_inputs/view_contexts/${index}/view_id`,
      'flow, decision, and state contexts are compiler-derived and cannot be submitted'
    ));
  }
  for (const [viewId, view] of viewsById) {
    if (!TARGET_VIEW_TYPES.has(String(view.type))) {
      const legacyContext = legacy?.contextsByViewId instanceof Map
        ? legacy.contextsByViewId.get(viewId) : undefined;
      contextsByViewId.set(viewId, isObject(legacyContext) ? legacyContext : derivedContext(view));
      continue;
    }
    const entry = contextsById.get(viewId);
    if (entry) contextsByViewId.set(viewId, publicContext(
      view, entry.context, entry.index, diagnostics
    ));
    else {
      const legacyContext = legacy?.contextsByViewId instanceof Map
        ? legacy.contextsByViewId.get(viewId) : undefined;
      if (isObject(legacyContext)) contextsByViewId.set(viewId, legacyContext);
      else diagnostics.push(diagnostic(
        'OBLIGATION_VIEW_CONTEXT_MISSING', '/obligation_inputs/view_contexts',
        `responsibility view "${viewId}" requires exactly one view context`
      ));
    }
  }
  if (legacy?.contextsByViewId instanceof Map) {
    for (const [viewId, context] of legacy.contextsByViewId) {
      if (!contextsByViewId.has(viewId)) contextsByViewId.set(viewId, context);
    }
  }
  for (const field of ['terminal_fact_routes', 'custom_responsibilities', 'combination_requests']) {
    if (objectArray(inputs[field]).length > 0 && !legacy) diagnostics.push(diagnostic(
      'OBLIGATION_INPUT_SEMANTICS_DEFERRED', `/obligation_inputs/${field}`,
      `${field} semantics are reserved for a later remediation slice`
    ));
  }
  return {
    contextsByViewId,
    terminalFactRoutes: legacy && isDenseObjectArray(legacy.factRoutes)
      ? /** @type {Record<string, unknown>[]} */ (legacy.factRoutes) : [],
    notApplicableReviews: legacy && isDenseObjectArray(legacy.notApplicableReviews)
      ? /** @type {Record<string, unknown>[]} */ (legacy.notApplicableReviews) : [],
    customResponsibilitySeeds: legacy && isDenseObjectArray(legacy.customObligations)
      ? /** @type {Record<string, unknown>[]} */ (legacy.customObligations) : [],
    combinationRequests: [],
    sourceRevision: legacy && typeof legacy.sourceRevision === 'number'
      && Number.isInteger(legacy.sourceRevision) ? legacy.sourceRevision
      : typeof artifact.source_revision === 'number' && Number.isInteger(artifact.source_revision)
        ? artifact.source_revision : -1,
    diagnostics
  };
}
