import {
  assertViewType, buildObligationSeed, finishObligationSeeds, objectArray, sortedStrings
} from './registry.mjs';

/**
 * Compile every sourced role-permission combination. In particular, deny entries
 * remain formal responsibilities and do not receive a generic denial Oracle.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'role');
  const roles = objectArray(view.elements).filter((element) => element.kind === 'role-permission');
  const seeds = roles.flatMap((role) => sortedStrings(role.permissions).map((permission) => buildObligationSeed({
    view, primaryElement: role, supportingElements: [role], context,
    identity: {
      kind: 'role', responsibility: 'permission', scope: view.scope,
      role: role.role, permission
    }
  })));
  return finishObligationSeeds(seeds, 'role');
}
