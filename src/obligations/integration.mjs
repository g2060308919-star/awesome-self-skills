import { assertViewType, isObject, objectArray } from './registry.mjs';
import { compileResponsibilitySeeds, responsibilityKey } from './responsibility.mjs';

const CORE_RESPONSIBILITIES = [
  'request', 'response', 'persistence', 'event', 'callback', 'compensation'
];
const SPECIAL_TYPES = new Set([
  'contract-compatibility', 'concurrency', 'idempotency', 'security-abuse'
]);

/** @param {unknown} container @param {string} key */
function keyedValue(container, key) {
  if (container instanceof Map) return container.get(key);
  return isObject(container) ? container[key] : undefined;
}

/** @param {unknown} context @param {string} property @param {string} elementId */
function declarations(context, property, elementId) {
  if (!isObject(context)) return [];
  return objectArray(keyedValue(context[property], elementId));
}

/**
 * Compile each distinct integration surface plus independently supported
 * invariants and approved special signals.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'integration');
  const elements = objectArray(view.elements).filter((element) => element.kind === 'integration-contract');
  /** @type {import('./responsibility.mjs').ResponsibilityDescriptor[]} */
  const descriptors = [];

  for (const element of elements) {
    const elementId = String(element.element_id);
    for (const responsibility of CORE_RESPONSIBILITIES) {
      descriptors.push({
        key: responsibilityKey('integration', elementId, {
          responsibility: 'surface', surface: responsibility
        }),
        element,
        required: true,
        identity: {
          kind: 'integration', responsibility, scope: view.scope,
          contract_element_id: elementId,
          [responsibility]: element[responsibility]
        }
      });
    }
    for (const sideEffect of objectArray(element.side_effects)) {
      descriptors.push({
        key: responsibilityKey('integration', elementId, {
          responsibility: 'side-effect',
          side_effect: { kind: sideEffect.kind, target: sideEffect.target }
        }),
        element,
        required: true,
        identity: {
          kind: 'integration', responsibility: 'side-effect', scope: view.scope,
          contract_element_id: elementId,
          side_effect: { kind: sideEffect.kind, target: sideEffect.target }
        }
      });
    }

    for (const invariant of declarations(context, 'integrationInvariantsByElementId', elementId)) {
      if (typeof invariant.invariant !== 'string' || invariant.invariant.length === 0) continue;
      descriptors.push({
        key: responsibilityKey('integration', elementId, {
          responsibility: 'invariant', invariant: invariant.invariant
        }),
        element,
        required: false,
        identity: {
          kind: 'integration', responsibility: 'invariant', scope: view.scope,
          contract_element_id: elementId, invariant: invariant.invariant
        }
      });
    }

    for (const special of declarations(context, 'integrationSpecialResponsibilitiesByElementId', elementId)) {
      if (typeof special.type !== 'string' || !SPECIAL_TYPES.has(special.type)
        || typeof special.signal !== 'string' || special.signal.length === 0) continue;
      descriptors.push({
        key: responsibilityKey('integration', elementId, {
          responsibility: special.type, signal: special.signal
        }),
        element,
        required: false,
        identity: {
          kind: 'integration', responsibility: special.type, scope: view.scope,
          contract_element_id: elementId, signal: special.signal
        }
      });
    }
  }
  return compileResponsibilitySeeds(view, context, descriptors, 'integration');
}
