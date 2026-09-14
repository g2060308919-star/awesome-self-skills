import {
  assertViewType, buildObligationSeed,
  finishObligationSeeds, objectArray, sortedStrings
} from './registry.mjs';

/**
 * Compile one formal responsibility for each explicit decision rule.
 * Missing combinations are not completed into a truth table.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'decision');
  const rules = objectArray(view.elements).filter((element) => element.kind === 'decision-rule');
  const seeds = rules.map((rule) => buildObligationSeed({
    view, primaryElement: rule, supportingElements: [rule], context,
    identity: {
      kind: 'decision', responsibility: 'rule', scope: view.scope,
      rule: {
        conditions: sortedStrings(rule.conditions),
        result: rule.result,
        priority: rule.priority
      }
    }
  }));
  return finishObligationSeeds(seeds, 'decision');
}
