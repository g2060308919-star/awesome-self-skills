import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5_ERROR_PHASES } from './constants.mjs';
import { V5ProtocolError } from './errors.mjs';

const EXECUTION_CLOSURE_OPERATIONS = new Set(['provide_capability_proof', 'set_execution_disposition']);
const EXECUTION_FINAL_OPERATIONS = new Set(['pause_execution', 'confirm_execution_plan']);

/** @param {Record<string,any>} registry */
export function validateV5FsmRegistry(registry) {
  if (!registry || registry.schema_version !== '5.0.0' || registry.cells?.length !== 16 || registry.action_templates?.length !== 9 || registry.outcomes?.length !== 51 || registry.read_only_profiles?.length !== 4) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'The V5 FSM registry cardinality is invalid.');
  const cells = new Map(registry.cells.map((/** @type {Record<string,any>} */ cell) => [cell.cell_id, cell]));
  const templates = new Map(registry.action_templates.map((/** @type {Record<string,any>} */ template) => [template.template_id, template]));
  const triggers = new Set();
  const ids = new Set();
  for (const outcome of registry.outcomes) {
    const trigger = canonicalV5Stringify(outcome.trigger);
    if (ids.has(outcome.outcome_id) || triggers.has(trigger) || !cells.has(outcome.target_cell_id)) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'FSM outcomes must have unique IDs and triggers and known targets.');
    if (outcome.trigger.kind === 'advance') {
      const from = cells.get(outcome.trigger.from_cell_id);
      if (!from || !templates.has(outcome.trigger.action_template_id) || !from.allowed_action_template_ids.includes(outcome.trigger.action_template_id) || !from.successor_cell_ids.includes(outcome.target_cell_id)) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'FSM advance outcome is not reachable from its declared cell.');
    }
    ids.add(outcome.outcome_id);
    triggers.add(trigger);
  }
  return true;
}

/** @param {Record<string,any>} registry @param {Record<string,any>} trigger @returns {Record<string,any>} */
export function selectV5Outcome(registry, trigger) {
  validateV5FsmRegistry(registry);
  const key = canonicalV5Stringify(trigger);
  const matches = registry.outcomes.filter((/** @type {Record<string,any>} */ outcome) => canonicalV5Stringify(outcome.trigger) === key);
  if (matches.length !== 1) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', `FSM trigger resolved to ${matches.length} outcomes.`);
  return structuredClone(matches[0]);
}

/** @param {Record<string,any>} registry @param {string} cellId @param {Record<string,any>} action @returns {Record<string,any>} */
export function actionTemplateForV5Action(registry, cellId, action) {
  validateV5FsmRegistry(registry);
  const cell = registry.cells.find((/** @type {Record<string,any>} */ candidate) => candidate.cell_id === cellId);
  if (!cell || cell.lifecycle !== 'active' || !action || typeof action.kind !== 'string') throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'The action is not advertised by the current FSM cell.');
  const matches = registry.action_templates.filter((/** @type {Record<string,any>} */ template) => {
    if (!cell.allowed_action_template_ids.includes(template.template_id) || template.action_kind !== action.kind) return false;
    if (template.action_kind === 'submit_artifact') return template.artifact_kind === action.artifact_kind;
    if (template.template_id === 'execution.advance_closure') return EXECUTION_CLOSURE_OPERATIONS.has(action.operation?.kind);
    if (template.template_id === 'execution.confirm_or_pause') return EXECUTION_FINAL_OPERATIONS.has(action.operation?.kind);
    return true;
  });
  if (matches.length !== 1) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'The action does not match one advertised closed action template.');
  return structuredClone(matches[0]);
}

/** @param {Record<string,any>} policyRegistry @param {Array<{code:string,[key:string]:any}>} candidates */
export function selectV5Error(policyRegistry, candidates) {
  const rules = new Map((policyRegistry?.rules ?? []).filter((/** @type {Record<string,any>} */ rule) => rule.kind === 'runtime_error').map((/** @type {Record<string,any>} */ rule) => [rule.error_code, rule]));
  const phaseOrder = Object.keys(V5_ERROR_PHASES);
  const ranked = candidates.map((candidate, index) => {
    const rule = rules.get(candidate.code);
    if (!rule) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', `Runtime error ${candidate.code} is not registered.`);
    return { candidate, index, phase: phaseOrder.indexOf(rule.validator_phase), priority: rule.validator_priority };
  });
  if (ranked.length === 0) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'At least one runtime error candidate is required.');
  ranked.sort((left, right) => left.phase - right.phase || left.priority - right.priority || left.index - right.index);
  return structuredClone(ranked[0].candidate);
}
