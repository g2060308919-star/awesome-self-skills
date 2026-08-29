import { assertViewType, objectArray, sortedStrings } from './registry.mjs';
import { compileResponsibilitySeeds, responsibilityKey } from './responsibility.mjs';

/**
 * Compile every sourced role-permission combination. In particular, deny entries
 * remain formal responsibilities and do not receive a generic denial Oracle.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'role');
  const roles = objectArray(view.elements).filter((element) => element.kind === 'role-permission');
  const descriptors = roles.flatMap((role) => sortedStrings(role.permissions).map((permission) => ({
    key: responsibilityKey('role', String(role.element_id), {
      responsibility: 'permission', permission
    }),
    element: role,
    required: true,
    identity: {
      kind: 'role', responsibility: 'permission', scope: view.scope,
      role: role.role, permission
    }
  })));
  return compileResponsibilitySeeds(view, context, descriptors, 'role');
}
