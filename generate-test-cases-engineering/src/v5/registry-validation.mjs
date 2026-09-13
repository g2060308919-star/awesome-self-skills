import { digest } from '../canonical.mjs';
import {
  V5_ACTION_TEMPLATE_IDS,
  V5_ERROR_CATALOG,
  V5_ERROR_PHASES,
  V5_FSM_CELL_IDS,
  V5_INVARIANT_REFS,
  V5_STABLE_ID_ROWS
} from './constants.mjs';

/** @param {unknown} condition @param {string} message */
function invariant(condition, message) {
  if (!condition) throw new Error(`POLICY_REGISTRY_INCONSISTENT: ${message}`);
}

/** @param {any[]} values @param {(value: any) => string} keyOf @param {string} name */
function assertUnique(values, keyOf, name) {
  const keys = values.map(keyOf);
  invariant(new Set(keys).size === keys.length, `${name} contains duplicates`);
}

/** @param {any[]} left @param {any[]} right */
function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

/** @param {Record<string, unknown>} record */
function declaredDigestEntry(record) {
  const selfDigestKeys = new Set(['registry_digest', 'policy_digest', 'inventory_digest', 'rules_bundle_digest', 'manifest_digest']);
  const keys = Object.keys(record).filter((key) => selfDigestKeys.has(key));
  invariant(keys.length === 1, 'each registry must have exactly one top-level digest');
  return keys[0];
}

/** @param {Record<string, unknown>} registry */
export function assertRegistrySelfDigest(registry) {
  const key = declaredDigestEntry(registry);
  const { [key]: declared, ...payload } = registry;
  invariant(declared === `sha256:${digest(payload)}`, `${key} does not match canonical payload`);
}

/** @param {Record<string, any>} fsm */
export function validateV5FsmRegistry(fsm) {
  assertRegistrySelfDigest(fsm);
  invariant(fsm.schema_version === '5.0.0' && fsm.registry_format_version === 1, 'FSM version mismatch');
  invariant(fsm.action_templates.length === 9, 'FSM must contain 9 action templates');
  invariant(fsm.cells.length === 16, 'FSM must contain 16 cells');
  invariant(fsm.outcomes.length === 51, 'FSM must contain 51 outcomes');
  invariant(fsm.read_only_profiles.length === 4, 'FSM must contain 4 read-only profiles');
  assertUnique(fsm.action_templates, (row) => row.template_id, 'FSM action templates');
  assertUnique(fsm.cells, (row) => row.cell_id, 'FSM cells');
  assertUnique(fsm.outcomes, (row) => row.outcome_id, 'FSM outcomes');
  assertUnique(fsm.read_only_profiles, (row) => row.profile_id, 'FSM read-only profiles');
  invariant(sameSet(fsm.action_templates.map((/** @type {any} */ row) => row.template_id), [...V5_ACTION_TEMPLATE_IDS]), 'FSM action template inventory mismatch');
  invariant(sameSet(fsm.cells.map((/** @type {any} */ row) => row.cell_id), [...V5_FSM_CELL_IDS]), 'FSM cell inventory mismatch');
  const cellIds = new Set(fsm.cells.map((/** @type {any} */ row) => row.cell_id));
  const actionIds = new Set(fsm.action_templates.map((/** @type {any} */ row) => row.template_id));
  for (const outcome of fsm.outcomes) {
    invariant(cellIds.has(outcome.target_cell_id), `unknown outcome target ${outcome.target_cell_id}`);
    if (outcome.trigger.kind === 'advance') {
      invariant(cellIds.has(outcome.trigger.from_cell_id), `unknown outcome source ${outcome.trigger.from_cell_id}`);
      invariant(actionIds.has(outcome.trigger.action_template_id), `unknown outcome action ${outcome.trigger.action_template_id}`);
    }
  }
  for (const cell of fsm.cells) {
    for (const actionId of cell.allowed_action_template_ids) invariant(actionIds.has(actionId), `unknown cell action ${actionId}`);
    for (const targetId of cell.successor_cell_ids) invariant(cellIds.has(targetId), `unknown successor ${targetId}`);
    if (cell.lifecycle === 'active') invariant(cellIds.has(cell.integrity_fatal_target_cell_id), `unknown integrity target for ${cell.cell_id}`);
    else invariant(cell.allowed_action_template_ids.length === 0 && cell.successor_cell_ids.length === 0, `terminal cell ${cell.cell_id} exposes mutation`);
  }
}

/** @param {Record<string, any>} policy @param {Record<string, any>} fsm */
export function validateV5PolicyRegistry(policy, fsm) {
  assertRegistrySelfDigest(policy);
  invariant(policy.schema_version === '5.0.0' && policy.registry_format_version === 1, 'Policy version mismatch');
  invariant(policy.fsm_registry_digest === fsm.registry_digest, 'Policy/FSM digest mismatch');
  assertUnique(policy.rules, (row) => row.rule_id, 'Policy rules');
  const runtimeRules = policy.rules.filter((/** @type {any} */ row) => row.kind === 'runtime_error');
  const invariantRules = policy.rules.filter((/** @type {any} */ row) => row.kind === 'invariant');
  invariant(runtimeRules.length === 40, 'Policy must contain 40 runtime errors');
  invariant(invariantRules.length === 34, 'Policy must contain 34 invariant groups');
  invariant(sameSet(runtimeRules.map((/** @type {any} */ row) => row.error_code), Object.keys(V5_ERROR_CATALOG)), 'Runtime error inventory mismatch');
  invariant(sameSet(invariantRules.map((/** @type {any} */ row) => row.assertion_ref), [...V5_INVARIANT_REFS]), 'Invariant inventory mismatch');
  for (const [phase, codes] of Object.entries(V5_ERROR_PHASES)) {
    const rows = runtimeRules.filter((/** @type {any} */ row) => row.validator_phase === phase).sort((/** @type {any} */ left, /** @type {any} */ right) => left.validator_priority - right.validator_priority);
    invariant(JSON.stringify(rows.map((/** @type {any} */ row) => row.error_code)) === JSON.stringify(codes), `${phase} priority is not contiguous and exact`);
  }
  const runtimeCodes = new Set(runtimeRules.map((/** @type {any} */ row) => row.error_code));
  for (const row of policy.accepted_closure_integrity_policy.target_rules) invariant(runtimeCodes.has(row.diagnostic_code), `unregistered closure diagnostic ${row.diagnostic_code}`);
  assertUnique(policy.provenance_policy.allowed_edges, (row) => row.edge_rule_id, 'Provenance allowed edges');
}

/** @param {Record<string, any>} registry */
export function validateStableIdRegistry(registry) {
  assertRegistrySelfDigest(registry);
  invariant(registry.rows.length === 28, 'Stable-ID registry must contain 28 rows');
  assertUnique(registry.rows, (row) => row.object_kind, 'Stable-ID object kinds');
  assertUnique(registry.rows, (row) => row.prefix, 'Stable-ID prefixes');
  assertUnique(registry.rows, (row) => row.projection_id, 'Stable-ID projections');
  invariant(sameSet(registry.rows.map((/** @type {any} */ row) => `${row.object_kind}:${row.prefix}:${row.projection_id}`), V5_STABLE_ID_ROWS.map((row) => row.join(':'))), 'Stable-ID registry inventory mismatch');
}

/** @param {Record<string, Record<string, any>>} contracts */
export function validateGeneratedV5Contracts(contracts) {
  for (const contract of Object.values(contracts)) assertRegistrySelfDigest(contract);
  validateV5FsmRegistry(contracts.fsmRegistry);
  validateV5PolicyRegistry(contracts.policyRegistry, contracts.fsmRegistry);
  validateStableIdRegistry(contracts.stableIdPreimageRegistry);
  invariant(contracts.sourceAcquisitionPolicy.max_requests_per_batch === 16, 'source batch limit must be 16');
  invariant(contracts.sourceAcquisitionPolicy.batch_order === 'required_desc_then_request_id_asc', 'source batch order mismatch');
  invariant(contracts.permissionDerivationRegistry.rules.length === 1, 'permission derivation must have one normative rule');
}
