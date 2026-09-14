import {
  assertViewType, buildObligationSeed,
  finishObligationSeeds, objectArray
} from './registry.mjs';

/** @param {Record<string, unknown>} state */
function stateIdentity(state) {
  return { kind: 'state', state: state.state };
}

/**
 * Compile exactly the explicit, validated transitions. Risk-only illegal transitions are deliberately
 * outside formal seed output and remain available to later Blocked/Exploratory routing.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'state');
  const elements = objectArray(view.elements);
  const states = elements.filter((element) => element.kind === 'state');
  const statesByName = new Map(states.map((state) => [state.state, state]));
  const transitions = elements.filter((element) => element.kind === 'transition');
  const seeds = transitions.map((transition) => {
    const from = statesByName.get(transition.from_state);
    const to = statesByName.get(transition.to_state);
    if (!from || !to) throw new TypeError(`state transition "${String(transition.element_id)}" is not from a validated view`);
    return buildObligationSeed({
      view, primaryElement: transition, supportingElements: [transition, from, to], context,
      identity: {
        kind: 'state', responsibility: 'transition', scope: view.scope,
        transition: {
          kind: 'transition', from: stateIdentity(from), to: stateIdentity(to),
          event: transition.event, condition: transition.condition,
          transition_order: Array.isArray(transition.transition_order) ? [...transition.transition_order] : []
        }
      }
    });
  });
  return finishObligationSeeds(seeds, 'state');
}
