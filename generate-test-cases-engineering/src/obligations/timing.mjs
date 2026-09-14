import { assertViewType, isObject, objectArray } from './registry.mjs';
import { compileResponsibilitySeeds, responsibilityKey } from './responsibility.mjs';

const SPECIAL_TYPES = new Set(['timeout', 'retry']);

/** @param {unknown} container @param {string} key */
function keyedValue(container, key) {
  if (container instanceof Map) return container.get(key);
  return isObject(container) ? container[key] : undefined;
}

/** @param {unknown} context @param {string} elementId */
function specialResponsibilities(context, elementId) {
  if (!isObject(context)) return [];
  return objectArray(keyedValue(context.timingSpecialResponsibilitiesByElementId, elementId));
}

/**
 * Compile before/equal/after threshold semantics and only independently bound
 * timeout/retry signals. No concrete neighboring time value is invented.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'timing');
  const elements = objectArray(view.elements).filter((element) => element.kind === 'timing-rule');
  /** @type {import('./responsibility.mjs').ResponsibilityDescriptor[]} */
  const descriptors = [];

  for (const element of elements) {
    const elementId = String(element.element_id);
    for (const relation of ['before', 'equal', 'after']) {
      descriptors.push({
        key: responsibilityKey('timing', elementId, {
          responsibility: 'threshold', threshold_relation: relation
        }),
        element,
        required: true,
        identity: {
          kind: 'timing', responsibility: 'threshold', scope: view.scope,
          timing_element_id: elementId, order: element.order,
          timing_event: element.timing_event, threshold: element.threshold,
          threshold_relation: relation
        }
      });
    }

    for (const special of specialResponsibilities(context, elementId)) {
      if (typeof special.type !== 'string' || !SPECIAL_TYPES.has(special.type)
        || typeof special.signal !== 'string' || special.signal.length === 0) continue;
      descriptors.push({
        key: responsibilityKey('timing', elementId, {
          responsibility: special.type, signal: special.signal
        }),
        element,
        required: false,
        identity: {
          kind: 'timing', responsibility: special.type, scope: view.scope,
          timing_element_id: elementId, order: element.order,
          timing_event: element.timing_event, threshold: element.threshold,
          signal: special.signal
        }
      });
    }
  }
  return compileResponsibilitySeeds(view, context, descriptors, 'timing');
}
