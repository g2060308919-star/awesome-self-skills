import { stableId } from '../canonical.mjs';
import { scopeContains } from '../decision-record.mjs';
import {
  buildObligationSeed, claimsByIdFrom, elementEvidenceRefs, finishObligationSeeds,
  isObject, sortedStrings
} from './registry.mjs';

const BINDING_KEYS = [
  'required_capabilities', 'required_oracle_refs', 'responsibility_key', 'risk', 'source_claim_ids'
];
const RISK_LEVELS = new Set(['critical', 'high', 'medium', 'low']);

/**
 * @typedef {object} ResponsibilityDescriptor
 * @property {string} key
 * @property {Record<string, unknown>} element
 * @property {Record<string, unknown>} identity
 * @property {boolean} required
 */

/**
 * @typedef {object} ResponsibilityBinding
 * @property {string} responsibility_key
 * @property {string} risk
 * @property {string[]} source_claim_ids
 * @property {string[]} required_oracle_refs
 * @property {string[]} required_capabilities
 */

/**
 * Canonical responsibility binding key shared by Task 6 strategies and the
 * future Task 11/13 context builder. Ownership is a stable frozen element ID;
 * the semantic sub-responsibility must never contain collection position.
 * @param {string} strategy
 * @param {string} elementId
 * @param {Record<string, unknown>} semanticSubresponsibility
 */
export function responsibilityKey(strategy, elementId, semanticSubresponsibility) {
  if (typeof strategy !== 'string' || strategy.trim().length === 0
    || typeof elementId !== 'string' || elementId.trim().length === 0
    || strategy.trim() !== strategy || elementId.trim() !== elementId
    || !isObject(semanticSubresponsibility)) {
    throw new TypeError('responsibility key requires strategy, owning element ID, and semantic responsibility');
  }
  return stableId('responsibility', {
    strategy, element_id: elementId, semantic_subresponsibility: semanticSubresponsibility
  });
}

/** @param {unknown} value @param {string} label @param {boolean} [nonempty] */
function denseUniqueStrings(value, label, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) {
    throw new TypeError(`${label} must be ${nonempty ? 'a nonempty' : 'an'} array`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw new TypeError(`${label} must be a dense array`);
    if (typeof value[index] !== 'string' || value[index].trim().length === 0) {
      throw new TypeError(`${label} must contain nonblank strings`);
    }
    if (value[index].trim() !== value[index]) {
      throw new TypeError(`${label} must contain unpadded strings`);
    }
  }
  const strings = /** @type {string[]} */ (value);
  if (new Set(strings).size !== strings.length) throw new TypeError(`${label} must not contain duplicates`);
  return sortedStrings(strings);
}

/** @param {Record<string, unknown>} object @param {string[]} keys @param {string} label */
function assertExactKeys(object, keys, label) {
  const actual = Object.keys(object).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has unknown or missing fields`);
  }
}

/** @param {Record<string, unknown>} claim */
function isResponsibilityEvidence(claim) {
  return (claim.level === 'E3' && claim.kind === 'requirement')
    || (claim.level === 'E1' && claim.kind === 'assumption')
    || (claim.level === 'E2' && claim.kind === 'model-element'
      && claim.derivation_target === 'model-element');
}

/**
 * The compiler receives Task 3's accepted graph. This walk still rejects a
 * malformed substituted context and proves binding support is owned by the
 * original frozen element before any responsibility clone is constructed.
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {Record<string, unknown>} element
 */
function owningEvidenceClosure(claimsById, element) {
  const closure = new Set();
  const state = new Map();
  for (const root of elementEvidenceRefs(element)) {
    if (!claimsById.has(root)) return null;
    if (state.get(root) === 2) continue;
    /** @type {Array<{claimId: string, parents: string[], next: number}>} */
    const stack = [{
      claimId: root, parents: sortedStrings(claimsById.get(root)?.parent_claim_ids, true), next: 0
    }];
    state.set(root, 1);
    closure.add(root);
    while (stack.length > 0) {
      const frame = /** @type {{claimId: string, parents: string[], next: number}} */ (stack.at(-1));
      if (frame.next >= frame.parents.length) {
        state.set(frame.claimId, 2);
        stack.pop();
        continue;
      }
      const parentId = frame.parents[frame.next];
      frame.next += 1;
      if (!claimsById.has(parentId)) return null;
      closure.add(parentId);
      const parentState = state.get(parentId) ?? 0;
      if (parentState === 1) return null;
      if (parentState === 2) continue;
      state.set(parentId, 1);
      stack.push({
        claimId: parentId,
        parents: sortedStrings(claimsById.get(parentId)?.parent_claim_ids, true),
        next: 0
      });
    }
  }
  return closure;
}

/** @param {unknown} context @returns {Map<string, ResponsibilityBinding>} */
function bindingIndex(context) {
  if (!isObject(context) || !Array.isArray(context.responsibilityBindings)) {
    throw new TypeError('compilation context must contain a dense responsibilityBindings array');
  }
  const rawBindings = context.responsibilityBindings;
  /** @type {Map<string, ResponsibilityBinding>} */
  const bindings = new Map();
  for (let index = 0; index < rawBindings.length; index += 1) {
    if (!Object.hasOwn(rawBindings, index)) {
      throw new TypeError('responsibilityBindings must be a dense array');
    }
    const raw = rawBindings[index];
    if (!isObject(raw)) throw new TypeError(`responsibility binding ${index} must be an object`);
    assertExactKeys(raw, BINDING_KEYS, `responsibility binding ${index}`);
    if (typeof raw.responsibility_key !== 'string' || raw.responsibility_key.trim().length === 0) {
      throw new TypeError(`responsibility binding ${index} must have a nonblank key`);
    }
    if (raw.responsibility_key.trim() !== raw.responsibility_key) {
      throw new TypeError(`responsibility binding ${index} must have an unpadded key`);
    }
    if (bindings.has(raw.responsibility_key)) {
      throw new TypeError(`duplicate responsibility binding "${raw.responsibility_key}"`);
    }
    if (typeof raw.risk !== 'string' || !RISK_LEVELS.has(raw.risk)) {
      throw new TypeError(`responsibility binding "${raw.responsibility_key}" has invalid risk`);
    }
    bindings.set(raw.responsibility_key, {
      responsibility_key: raw.responsibility_key,
      risk: raw.risk,
      source_claim_ids: denseUniqueStrings(
        raw.source_claim_ids, `responsibility binding "${raw.responsibility_key}" source_claim_ids`, true
      ),
      required_oracle_refs: denseUniqueStrings(
        raw.required_oracle_refs, `responsibility binding "${raw.responsibility_key}" required_oracle_refs`
      ),
      required_capabilities: denseUniqueStrings(
        raw.required_capabilities, `responsibility binding "${raw.responsibility_key}" required_capabilities`
      )
    });
  }
  return bindings;
}

/**
 * Build responsibility-isolated Task 5 seeds. Task 11/13 must construct one
 * binding per required descriptor with `responsibilityKey`; element-level maps
 * are intentionally ignored and never serve as a fallback.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 * @param {ResponsibilityDescriptor[]} descriptors
 * @param {string} label
 */
export function compileResponsibilitySeeds(view, context, descriptors, label) {
  const bindings = bindingIndex(context);
  const descriptorKeys = new Set();
  for (const descriptor of descriptors) {
    if (descriptorKeys.has(descriptor.key)) {
      throw new TypeError(`duplicate ${label} responsibility key "${descriptor.key}"`);
    }
    descriptorKeys.add(descriptor.key);
  }
  for (const key of bindings.keys()) {
    if (!descriptorKeys.has(key)) throw new TypeError(`unknown responsibility binding "${key}"`);
  }
  const claimsById = claimsByIdFrom(context);
  /** @type {Map<string, {closure: Set<string> | null}>} */
  const owningClosureByElementId = new Map();
  /** @type {import('./registry.mjs').ObligationSeed[]} */
  const seeds = [];
  for (const descriptor of descriptors) {
    const binding = bindings.get(descriptor.key);
    if (!binding) {
      if (descriptor.required) throw new TypeError(`missing responsibility binding "${descriptor.key}"`);
      continue;
    }
    const elementId = String(descriptor.element.element_id);
    let closureEntry = owningClosureByElementId.get(elementId);
    if (!closureEntry) {
      closureEntry = { closure: owningEvidenceClosure(claimsById, descriptor.element) };
      owningClosureByElementId.set(elementId, closureEntry);
    }
    const { closure } = closureEntry;
    if (closure === null) {
      throw new TypeError(`owning element evidence is malformed for responsibility "${descriptor.key}"`);
    }
    for (const claimId of binding.source_claim_ids) {
      const claim = claimsById.get(claimId);
      if (!claim || !closure.has(claimId)) {
        throw new TypeError(`claim "${claimId}" is not validated support of owning element`);
      }
      if (!isResponsibilityEvidence(claim)) {
        throw new TypeError(`claim "${claimId}" is not accepted responsibility evidence`);
      }
      if (typeof claim.scope !== 'string' || !scopeContains(claim.scope, String(view.scope))) {
        throw new TypeError(`claim "${claimId}" does not cover responsibility scope`);
      }
    }
    const responsibilityElement = {
      ...descriptor.element,
      source_claim_ids: [...binding.source_claim_ids],
      model_refs: []
    };
    const responsibilityContext = {
      .../** @type {Record<string, unknown>} */ (context),
      riskByElementId: new Map([[elementId, binding.risk]]),
      requiredOracleRefsByElementId: new Map([[elementId, binding.required_oracle_refs]]),
      requiredCapabilitiesByElementId: new Map([[elementId, binding.required_capabilities]])
    };
    seeds.push(buildObligationSeed({
      view,
      primaryElement: responsibilityElement,
      supportingElements: [responsibilityElement],
      context: responsibilityContext,
      identity: descriptor.identity
    }));
  }
  return finishObligationSeeds(seeds, label);
}
