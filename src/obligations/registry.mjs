import { stableId } from '../canonical.mjs';

const RISK_LEVELS = new Set(['critical', 'high', 'medium', 'low']);

/**
 * @typedef {object} ObligationSeed
 * @property {string} obligation_id
 * @property {string} kind
 * @property {string} risk
 * @property {string} scope
 * @property {string[]} source_claim_ids
 * @property {string[]} view_element_refs
 * @property {string[]} required_oracle_refs
 * @property {string[]} required_capabilities
 */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
export function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {string} left @param {string} right */
export function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** @param {unknown} value @param {boolean} [unique] */
export function sortedStrings(value, unique = false) {
  const strings = Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
  return (unique ? [...new Set(strings)] : [...strings]).sort(compareCodePoints);
}

/** @param {unknown} context @returns {Map<string, Record<string, unknown>>} */
export function claimsByIdFrom(context) {
  if (!isObject(context)) return new Map();
  const direct = context.claimsById;
  if (direct instanceof Map) return /** @type {Map<string, Record<string, unknown>>} */ (direct);
  const graph = isObject(context.evidenceGraph) ? context.evidenceGraph : {};
  return graph.claimsById instanceof Map
    ? /** @type {Map<string, Record<string, unknown>>} */ (graph.claimsById) : new Map();
}

/** @param {unknown} container @param {string} key @returns {unknown} */
function keyedValue(container, key) {
  if (container instanceof Map) return container.get(key);
  return isObject(container) ? container[key] : undefined;
}

/** @param {Record<string, unknown>} element */
export function elementEvidenceRefs(element) {
  return sortedStrings([
    ...sortedStrings(element.source_claim_ids),
    ...sortedStrings(element.model_refs)
  ], true);
}

/** @param {Record<string, unknown>} view @param {Record<string, unknown>} element */
function qualifiedElementRef(view, element) {
  return `${String(view.view_id)}#${String(element.element_id)}`;
}

/**
 * Build the frozen eight-field seed from validated view elements and explicit compilation context.
 * @param {{
 *   view: Record<string, unknown>,
 *   primaryElement: Record<string, unknown>,
 *   supportingElements: Record<string, unknown>[],
 *   context: unknown,
 *   identity: Record<string, unknown>,
 *   extraSourceClaimIds?: string[]
 * }} input
 * @returns {ObligationSeed}
 */
export function buildObligationSeed(input) {
  const { view, primaryElement, context, identity } = input;
  if (!isObject(context)) throw new TypeError('obligation compilation context must be an object');
  const primaryId = typeof primaryElement.element_id === 'string' ? primaryElement.element_id : '';
  const risk = keyedValue(context.riskByElementId, primaryId);
  if (typeof risk !== 'string' || !RISK_LEVELS.has(risk)) {
    throw new TypeError(`compilation context has no valid risk for element "${primaryId}"`);
  }
  const oracleRefs = sortedStrings(keyedValue(context.requiredOracleRefsByElementId, primaryId), true);
  const capabilities = sortedStrings(keyedValue(context.requiredCapabilitiesByElementId, primaryId), true);
  const primaryEvidenceRefs = new Set(elementEvidenceRefs(primaryElement));
  for (const claimId of oracleRefs) {
    if (!primaryEvidenceRefs.has(claimId)) {
      throw new TypeError(`Oracle claim "${claimId}" is not validated evidence for element "${primaryId}"`);
    }
  }
  const elements = [...new Map(input.supportingElements.map((element) => [element.element_id, element])).values()];
  const sourceClaimIds = sortedStrings([
    ...elements.flatMap(elementEvidenceRefs),
    ...oracleRefs,
    ...(input.extraSourceClaimIds ?? [])
  ], true);
  const claimsById = claimsByIdFrom(context);
  for (const claimId of [...sourceClaimIds, ...oracleRefs]) {
    if (!claimsById.has(claimId)) throw new TypeError(`compilation evidence context does not contain claim "${claimId}"`);
  }
  if (sourceClaimIds.length === 0) throw new TypeError(`obligation element "${primaryId}" has no accepted evidence`);
  const viewElementRefs = sortedStrings(elements.map((element) => qualifiedElementRef(view, element)), true);
  return {
    obligation_id: stableId('obligation', identity),
    kind: String(view.type),
    risk,
    scope: String(view.scope),
    source_claim_ids: sourceClaimIds,
    view_element_refs: viewElementRefs,
    required_oracle_refs: oracleRefs,
    required_capabilities: capabilities
  };
}

/** @param {ObligationSeed[]} seeds @param {string} label */
export function finishObligationSeeds(seeds, label) {
  const seen = new Set();
  for (const seed of seeds) {
    if (seen.has(seed.obligation_id)) throw new TypeError(`duplicate ${label} obligation semantic signature`);
    seen.add(seed.obligation_id);
  }
  return [...seeds]
    .sort((left, right) => compareCodePoints(left.obligation_id, right.obligation_id))
    .map((seed) => ({
      ...seed,
      source_claim_ids: [...seed.source_claim_ids],
      view_element_refs: [...seed.view_element_refs],
      required_oracle_refs: [...seed.required_oracle_refs],
      required_capabilities: [...seed.required_capabilities]
    }));
}

/** @param {unknown} view @param {string} expectedType @returns {asserts view is Record<string, unknown>} */
export function assertViewType(view, expectedType) {
  if (!isObject(view) || view.type !== expectedType || typeof view.view_id !== 'string'
    || typeof view.scope !== 'string' || !Array.isArray(view.elements)) {
    throw new TypeError(`expected a validated ${expectedType} behavior view`);
  }
}

/** @typedef {(view: Record<string, unknown>, context: unknown) => ObligationSeed[]} ObligationCompiler */

/** Create one isolated registry. No strategy state is shared across calls or tests. */
export function createObligationRegistry() {
  /** @type {Map<string, ObligationCompiler>} */
  const strategies = new Map();
  const registry = {
    /** @param {string} viewType @param {ObligationCompiler} compile */
    registerObligationStrategy(viewType, compile) {
      if (typeof viewType !== 'string' || viewType.length === 0) throw new TypeError('obligation strategy view type must be nonblank');
      if (typeof compile !== 'function') throw new TypeError(`obligation strategy for view type "${viewType}" must be a function`);
      if (strategies.has(viewType)) throw new TypeError(`duplicate obligation strategy for view type "${viewType}"`);
      strategies.set(viewType, compile);
      return registry;
    },
    /** @param {Record<string, unknown>} view @param {unknown} context */
    compile(view, context) {
      const viewType = typeof view?.type === 'string' ? view.type : '';
      const compile = strategies.get(viewType);
      if (!compile) throw new TypeError(`no obligation strategy registered for view type "${viewType}"`);
      return compile(view, context);
    },
    registeredViewTypes() {
      return [...strategies.keys()].sort(compareCodePoints);
    }
  };
  return Object.freeze(registry);
}

/**
 * Start a new isolated registry with one strategy.
 * @param {string} viewType
 * @param {ObligationCompiler} compile
 */
export function registerObligationStrategy(viewType, compile) {
  return createObligationRegistry().registerObligationStrategy(viewType, compile);
}
