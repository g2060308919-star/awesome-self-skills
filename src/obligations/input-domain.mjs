import {
  assertViewType, buildObligationSeed, finishObligationSeeds, isObject, objectArray
} from './registry.mjs';

/**
 * Compile each explicit equivalence class and each inclusive/exclusive boundary
 * responsibility. Values outside the declared bounds are never synthesized.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'input-domain');
  const elements = objectArray(view.elements).filter((element) => element.kind === 'input-domain');
  /** @type {import('./registry.mjs').ObligationSeed[]} */
  const seeds = [];

  for (const element of elements) {
    for (const equivalenceClass of objectArray(element.classes)) {
      seeds.push(buildObligationSeed({
        view, primaryElement: element, supportingElements: [element], context,
        identity: {
          kind: 'input-domain', responsibility: 'equivalence-class', scope: view.scope,
          domain: element.domain,
          class: { class_id: equivalenceClass.class_id, label: equivalenceClass.label }
        }
      }));
    }

    if (!isObject(element.bounds)) continue;
    for (const boundary of ['lower', 'upper']) {
      seeds.push(buildObligationSeed({
        view, primaryElement: element, supportingElements: [element], context,
        identity: {
          kind: 'input-domain', responsibility: 'boundary', scope: view.scope,
          domain: element.domain, boundary,
          value: element.bounds[boundary], inclusive: element.bounds.inclusive
        }
      }));
    }
  }
  return finishObligationSeeds(seeds, 'input-domain');
}
