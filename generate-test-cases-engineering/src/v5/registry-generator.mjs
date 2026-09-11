import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalStringify, digest } from '../canonical.mjs';
import { validateAgainstSchema } from '../schema-validator.mjs';
import {
  V5_ACTIVE_FSM_CELL_IDS,
  V5_CANONICAL_PROFILE,
  V5_CLARIFICATION_TOKENS,
  V5_COMPILER_VERSION,
  V5_ERROR_CATALOG,
  V5_ERROR_PHASES,
  V5_INVARIANT_REFS,
  V5_REGISTRY_FORMAT_VERSION,
  V5_RESUMABLE_FSM_CELL_IDS,
  V5_SCHEMA_VERSION,
  V5_STABLE_ID_ROWS
} from './constants.mjs';
import { validateGeneratedV5Contracts } from './registry-validation.mjs';

export const V5_POLICY_FILE_MAP = Object.freeze({
  sourceAcquisitionPolicy: 'v5-source-acquisition-policy',
  fsmRegistry: 'v5-fsm-registry',
  policyRegistry: 'v5-policy-registry',
  permissionDerivationRegistry: 'v5-permission-derivation-registry',
  answerConstraintRegistry: 'v5-answer-constraint-registry',
  clarificationControlRegistry: 'v5-clarification-control-registry',
  stableIdPreimageRegistry: 'v5-stable-id-preimage-registry',
  storageLayoutRegistry: 'v5-storage-layout-registry',
  normativeRuleInventory: 'v5-normative-rule-inventory',
  replyContracts: 'v5-reply-contracts.generated',
  canonicalArrayManifest: 'v5-canonical-array-manifest'
});

export const V5_POLICY_DIGEST_KEYS = Object.freeze({
  sourceAcquisitionPolicy: 'policy_digest',
  fsmRegistry: 'registry_digest',
  policyRegistry: 'registry_digest',
  permissionDerivationRegistry: 'registry_digest',
  answerConstraintRegistry: 'registry_digest',
  clarificationControlRegistry: 'registry_digest',
  stableIdPreimageRegistry: 'registry_digest',
  storageLayoutRegistry: 'registry_digest',
  normativeRuleInventory: 'inventory_digest',
  replyContracts: 'rules_bundle_digest',
  canonicalArrayManifest: 'manifest_digest'
});

/** @param {Record<string, any>} payload @param {string} key */
function attachDigest(payload, key) {
  return { ...payload, [key]: `sha256:${digest(payload)}` };
}

/** @param {string[]} values */
function sorted(values) {
  return [...values].sort();
}

function createActionTemplates() {
  return [
    { template_id: 'run.cancel', action_kind: 'cancel_run' },
    { template_id: 'source.submit_batch', action_kind: 'submit_source_batch' },
    { template_id: 'artifact.submit_evidence_claims', action_kind: 'submit_artifact', artifact_kind: 'evidence_claims' },
    { template_id: 'clarification.preview', action_kind: 'preview_clarification_response' },
    { template_id: 'clarification.commit', action_kind: 'commit_clarification_response' },
    { template_id: 'artifact.submit_behavior_views', action_kind: 'submit_artifact', artifact_kind: 'behavior_views' },
    { template_id: 'artifact.submit_case_drafts', action_kind: 'submit_artifact', artifact_kind: 'case_drafts' },
    { template_id: 'execution.advance_closure', action_kind: 'advance_execution_plan', operation_source: 'phase0_closed_non_sibling_closure_operations' },
    { template_id: 'execution.confirm_or_pause', action_kind: 'advance_execution_plan', operation_source: 'phase0_closed_confirm_or_pause_operations' }
  ].sort((left, right) => left.template_id.localeCompare(right.template_id));
}

/** @param {object} row */
function activeCell(row) {
  const value = /** @type {any} */ (row);
  return {
    ...value,
    allowed_action_template_ids: sorted(value.allowed_action_template_ids),
    successor_cell_ids: sorted(value.successor_cell_ids),
    integrity_fatal_target_cell_id: value.delivery_intent === 'case_document' ? 'cd.terminal.fatal' : 'ep.terminal.fatal',
    terminal_kind: null,
    inspect_projection_kind: 'persisted_run_state'
  };
}

/** @param {string} cellId @param {'case_document'|'execution_plan'} deliveryIntent @param {'finished'|'cancelled'|'fatal'} lifecycle @param {string} terminalKind */
function terminalCell(cellId, deliveryIntent, lifecycle, terminalKind) {
  return {
    cell_id: cellId,
    delivery_intent: deliveryIntent,
    lifecycle,
    stage: 'delivery',
    obligation: 'complete',
    normal_reply_status: lifecycle,
    work_packet_kind: 'terminal_work',
    allowed_action_template_ids: [],
    successor_cell_ids: [],
    integrity_fatal_target_cell_id: lifecycle === 'fatal'
      ? null : deliveryIntent === 'case_document' ? 'cd.terminal.fatal' : 'ep.terminal.fatal',
    terminal_kind: terminalKind,
    inspect_projection_kind: 'persisted_run_state'
  };
}

function createFsmCells() {
  return [
    activeCell({ cell_id: 'cd.active.source.provide', delivery_intent: 'case_document', lifecycle: 'active', stage: 'source_acquisition', obligation: 'provide_source_pack', normal_reply_status: 'need_artifact', work_packet_kind: 'source_work', allowed_action_template_ids: ['source.submit_batch', 'run.cancel'], successor_cell_ids: ['cd.active.source.provide', 'cd.active.requirements.review', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    activeCell({ cell_id: 'cd.active.requirements.review', delivery_intent: 'case_document', lifecycle: 'active', stage: 'requirements_analysis', obligation: 'review_semantic_seed', normal_reply_status: 'need_revision', work_packet_kind: 'semantic_review_work', allowed_action_template_ids: ['artifact.submit_evidence_claims', 'run.cancel'], successor_cell_ids: ['cd.active.requirements.review', 'cd.active.requirements.resolve', 'cd.active.case.behavior', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    activeCell({ cell_id: 'cd.active.requirements.resolve', delivery_intent: 'case_document', lifecycle: 'active', stage: 'requirements_analysis', obligation: 'resolve_requirements_questions', normal_reply_status: 'need_user_answers', work_packet_kind: 'clarification_work', allowed_action_template_ids: ['clarification.preview', 'run.cancel'], successor_cell_ids: ['cd.active.requirements.resolve', 'cd.active.requirements.confirm', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    activeCell({ cell_id: 'cd.active.requirements.confirm', delivery_intent: 'case_document', lifecycle: 'active', stage: 'requirements_analysis', obligation: 'confirm_clarification', normal_reply_status: 'clarification_confirmation_required', work_packet_kind: 'clarification_confirmation_work', allowed_action_template_ids: ['clarification.commit', 'clarification.preview', 'run.cancel'], successor_cell_ids: ['cd.active.requirements.confirm', 'cd.active.requirements.resolve', 'cd.active.requirements.review', 'cd.active.case.behavior', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    activeCell({ cell_id: 'cd.active.case.behavior', delivery_intent: 'case_document', lifecycle: 'active', stage: 'case_design', obligation: 'provide_behavior_views', normal_reply_status: 'need_revision', work_packet_kind: 'behavior_work', allowed_action_template_ids: ['artifact.submit_behavior_views', 'run.cancel'], successor_cell_ids: ['cd.active.case.behavior', 'cd.active.case.resolve', 'cd.active.case.drafts', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    activeCell({ cell_id: 'cd.active.case.drafts', delivery_intent: 'case_document', lifecycle: 'active', stage: 'case_design', obligation: 'provide_case_drafts', normal_reply_status: 'need_revision', work_packet_kind: 'case_work', allowed_action_template_ids: ['artifact.submit_case_drafts', 'run.cancel'], successor_cell_ids: ['cd.active.case.drafts', 'cd.active.case.behavior', 'cd.terminal.finished', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    activeCell({ cell_id: 'cd.active.case.resolve', delivery_intent: 'case_document', lifecycle: 'active', stage: 'case_design', obligation: 'resolve_case_questions', normal_reply_status: 'need_user_answers', work_packet_kind: 'clarification_work', allowed_action_template_ids: ['clarification.preview', 'run.cancel'], successor_cell_ids: ['cd.active.case.resolve', 'cd.active.case.confirm', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    activeCell({ cell_id: 'cd.active.case.confirm', delivery_intent: 'case_document', lifecycle: 'active', stage: 'case_design', obligation: 'confirm_clarification', normal_reply_status: 'clarification_confirmation_required', work_packet_kind: 'clarification_confirmation_work', allowed_action_template_ids: ['clarification.commit', 'clarification.preview', 'run.cancel'], successor_cell_ids: ['cd.active.case.confirm', 'cd.active.case.resolve', 'cd.active.requirements.review', 'cd.active.case.behavior', 'cd.active.case.drafts', 'cd.terminal.finished', 'cd.terminal.cancelled', 'cd.terminal.fatal'] }),
    terminalCell('cd.terminal.finished', 'case_document', 'finished', 'case_document_finished'),
    terminalCell('cd.terminal.cancelled', 'case_document', 'cancelled', 'case_document_cancelled'),
    terminalCell('cd.terminal.fatal', 'case_document', 'fatal', 'case_document_fatal'),
    activeCell({ cell_id: 'ep.active.closure.resolve', delivery_intent: 'execution_plan', lifecycle: 'active', stage: 'execution_closure', obligation: 'resolve_execution_closure', normal_reply_status: 'need_revision', work_packet_kind: 'execution_work', allowed_action_template_ids: ['execution.advance_closure', 'run.cancel'], successor_cell_ids: ['ep.active.closure.resolve', 'ep.active.final.confirm', 'ep.terminal.cancelled', 'ep.terminal.fatal'] }),
    activeCell({ cell_id: 'ep.active.final.confirm', delivery_intent: 'execution_plan', lifecycle: 'active', stage: 'final_confirmation', obligation: 'confirm_execution_plan', normal_reply_status: 'ready', work_packet_kind: 'execution_work', allowed_action_template_ids: ['execution.confirm_or_pause', 'run.cancel'], successor_cell_ids: ['ep.active.final.confirm', 'ep.terminal.finished', 'ep.terminal.cancelled', 'ep.terminal.fatal'] }),
    terminalCell('ep.terminal.finished', 'execution_plan', 'finished', 'execution_plan_finished'),
    terminalCell('ep.terminal.cancelled', 'execution_plan', 'cancelled', 'execution_plan_cancelled'),
    terminalCell('ep.terminal.fatal', 'execution_plan', 'fatal', 'execution_plan_fatal')
  ].sort((left, right) => left.cell_id.localeCompare(right.cell_id));
}

/** @param {string} artifactKind */
function artifactCommit(artifactKind) {
  return { kind: 'artifact_commit', artifact_kind: artifactKind, semantic_revision_delta: 1 };
}

/** @param {string} effect */
function operationalCommit(effect) {
  return { kind: 'operational_commit', effect, semantic_revision_delta: 0 };
}

const clarificationCommit = Object.freeze({ kind: 'clarification_commit', semantic_revision_delta: 1 });

/** @param {string} outcomeId @param {string} fromCellId @param {string} actionTemplateId @param {string} resultKey @param {string} targetCellId @param {object} commitProjection */
function advanceOutcome(outcomeId, fromCellId, actionTemplateId, resultKey, targetCellId, commitProjection) {
  return { outcome_id: outcomeId, trigger: { kind: 'advance', from_cell_id: fromCellId, action_template_id: actionTemplateId, result_key: resultKey }, target_cell_id: targetCellId, commit_projection: commitProjection };
}

function createFsmOutcomes() {
  const outcomes = [
    { outcome_id: 'OUT5.create.case.initial', trigger: { kind: 'create', create_variant: 'case_document', result_key: 'initial' }, target_cell_id: 'cd.active.source.provide', commit_projection: operationalCommit('run_created') },
    { outcome_id: 'OUT5.create.execution.initial', trigger: { kind: 'create', create_variant: 'execution_plan', result_key: 'initial' }, target_cell_id: 'ep.active.closure.resolve', commit_projection: operationalCommit('run_created') },
    ...V5_RESUMABLE_FSM_CELL_IDS.map((target) => ({ outcome_id: `OUT5.create.resume.${target}`, trigger: { kind: 'create', create_variant: 'resume_cancelled', result_key: `target:${target}` }, target_cell_id: target, commit_projection: operationalCommit('run_created') })),
    advanceOutcome('OUT5.cd.source.batch.payload.more', 'cd.active.source.provide', 'source.submit_batch', 'payload:sources_remaining', 'cd.active.source.provide', artifactCommit('source_pack')),
    advanceOutcome('OUT5.cd.source.batch.payload.complete', 'cd.active.source.provide', 'source.submit_batch', 'payload:sources_complete', 'cd.active.requirements.review', artifactCommit('source_pack')),
    advanceOutcome('OUT5.cd.source.batch.skip.more', 'cd.active.source.provide', 'source.submit_batch', 'all_skipped_optional:sources_remaining', 'cd.active.source.provide', operationalCommit('source_acquisition_advanced')),
    advanceOutcome('OUT5.cd.source.batch.skip.complete', 'cd.active.source.provide', 'source.submit_batch', 'all_skipped_optional:sources_complete', 'cd.active.requirements.review', operationalCommit('source_acquisition_advanced')),
    advanceOutcome('OUT5.cd.requirements.review.gaps', 'cd.active.requirements.review', 'artifact.submit_evidence_claims', 'actionable_gaps', 'cd.active.requirements.resolve', artifactCommit('evidence_claims')),
    advanceOutcome('OUT5.cd.requirements.review.ready', 'cd.active.requirements.review', 'artifact.submit_evidence_claims', 'no_actionable_gap', 'cd.active.case.behavior', artifactCommit('evidence_claims')),
    advanceOutcome('OUT5.cd.requirements.resolve.preview.changed', 'cd.active.requirements.resolve', 'clarification.preview', 'semantic_change', 'cd.active.requirements.confirm', operationalCommit('clarification_pending_created')),
    advanceOutcome('OUT5.cd.requirements.resolve.discard', 'cd.active.requirements.resolve', 'clarification.preview', 'discard_pending', 'cd.active.requirements.resolve', operationalCommit('idempotency_only')),
    advanceOutcome('OUT5.cd.requirements.confirm.repreview.changed', 'cd.active.requirements.confirm', 'clarification.preview', 'semantic_change', 'cd.active.requirements.confirm', operationalCommit('clarification_pending_replaced')),
    advanceOutcome('OUT5.cd.requirements.confirm.discard', 'cd.active.requirements.confirm', 'clarification.preview', 'discard_pending', 'cd.active.requirements.resolve', operationalCommit('pending_discarded')),
    advanceOutcome('OUT5.cd.requirements.confirm.commit.review', 'cd.active.requirements.confirm', 'clarification.commit', 'requirements_review_invalidated', 'cd.active.requirements.review', clarificationCommit),
    advanceOutcome('OUT5.cd.requirements.confirm.commit.resolve', 'cd.active.requirements.confirm', 'clarification.commit', 'actionable_gaps', 'cd.active.requirements.resolve', clarificationCommit),
    advanceOutcome('OUT5.cd.requirements.confirm.commit.behavior', 'cd.active.requirements.confirm', 'clarification.commit', 'requirements_ready', 'cd.active.case.behavior', clarificationCommit),
    advanceOutcome('OUT5.cd.case.behavior.gaps', 'cd.active.case.behavior', 'artifact.submit_behavior_views', 'actionable_gaps', 'cd.active.case.resolve', artifactCommit('behavior_views')),
    advanceOutcome('OUT5.cd.case.behavior.ready', 'cd.active.case.behavior', 'artifact.submit_behavior_views', 'no_actionable_gap', 'cd.active.case.drafts', artifactCommit('behavior_views')),
    advanceOutcome('OUT5.cd.case.drafts.finished', 'cd.active.case.drafts', 'artifact.submit_case_drafts', 'all_gates_passed', 'cd.terminal.finished', artifactCommit('case_drafts')),
    advanceOutcome('OUT5.cd.case.resolve.preview.changed', 'cd.active.case.resolve', 'clarification.preview', 'semantic_change', 'cd.active.case.confirm', operationalCommit('clarification_pending_created')),
    advanceOutcome('OUT5.cd.case.resolve.discard', 'cd.active.case.resolve', 'clarification.preview', 'discard_pending', 'cd.active.case.resolve', operationalCommit('idempotency_only')),
    advanceOutcome('OUT5.cd.case.confirm.repreview.changed', 'cd.active.case.confirm', 'clarification.preview', 'semantic_change', 'cd.active.case.confirm', operationalCommit('clarification_pending_replaced')),
    advanceOutcome('OUT5.cd.case.confirm.discard', 'cd.active.case.confirm', 'clarification.preview', 'discard_pending', 'cd.active.case.resolve', operationalCommit('pending_discarded')),
    advanceOutcome('OUT5.cd.case.confirm.commit.requirements', 'cd.active.case.confirm', 'clarification.commit', 'requirements_invalidated', 'cd.active.requirements.review', clarificationCommit),
    advanceOutcome('OUT5.cd.case.confirm.commit.resolve', 'cd.active.case.confirm', 'clarification.commit', 'actionable_gaps', 'cd.active.case.resolve', clarificationCommit),
    advanceOutcome('OUT5.cd.case.confirm.commit.behavior', 'cd.active.case.confirm', 'clarification.commit', 'behavior_invalidated', 'cd.active.case.behavior', clarificationCommit),
    advanceOutcome('OUT5.cd.case.confirm.commit.drafts', 'cd.active.case.confirm', 'clarification.commit', 'case_drafts_required', 'cd.active.case.drafts', clarificationCommit),
    advanceOutcome('OUT5.cd.case.confirm.commit.finished', 'cd.active.case.confirm', 'clarification.commit', 'all_gates_passed', 'cd.terminal.finished', clarificationCommit),
    advanceOutcome('OUT5.ep.closure.provide_capability_proof.stay', 'ep.active.closure.resolve', 'execution.advance_closure', 'provide_capability_proof:closure_open', 'ep.active.closure.resolve', operationalCommit('execution_plan_advanced')),
    advanceOutcome('OUT5.ep.closure.provide_capability_proof.ready', 'ep.active.closure.resolve', 'execution.advance_closure', 'provide_capability_proof:closure_complete', 'ep.active.final.confirm', operationalCommit('execution_plan_advanced')),
    advanceOutcome('OUT5.ep.closure.set_execution_disposition.stay', 'ep.active.closure.resolve', 'execution.advance_closure', 'set_execution_disposition:closure_open', 'ep.active.closure.resolve', operationalCommit('execution_plan_advanced')),
    advanceOutcome('OUT5.ep.closure.set_execution_disposition.ready', 'ep.active.closure.resolve', 'execution.advance_closure', 'set_execution_disposition:closure_complete', 'ep.active.final.confirm', operationalCommit('execution_plan_advanced')),
    advanceOutcome('OUT5.ep.final.pause', 'ep.active.final.confirm', 'execution.confirm_or_pause', 'pause_execution', 'ep.active.final.confirm', operationalCommit('execution_plan_paused')),
    advanceOutcome('OUT5.ep.final.confirm', 'ep.active.final.confirm', 'execution.confirm_or_pause', 'confirm_execution_plan', 'ep.terminal.finished', operationalCommit('execution_plan_confirmed')),
    ...V5_ACTIVE_FSM_CELL_IDS.map((fromCell) => advanceOutcome(`OUT5.cancel.${fromCell}`, fromCell, 'run.cancel', 'cancelled', fromCell.startsWith('cd.') ? 'cd.terminal.cancelled' : 'ep.terminal.cancelled', operationalCommit('run_cancelled')))
  ];
  return outcomes.sort((left, right) => left.outcome_id.localeCompare(right.outcome_id));
}

function createFsmRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: V5_REGISTRY_FORMAT_VERSION,
    action_templates: createActionTemplates(),
    cells: createFsmCells(),
    outcomes: createFsmOutcomes(),
    read_only_profiles: [
      { profile_id: 'inspect.integrity_failure.with_verified_checkpoint', api: 'inspectV5Run', projection_kind: 'read_only_integrity_fatal', trigger_state_kind: 'verified_fsm_cell', last_verified_state_kind: 'checkpoint' },
      { profile_id: 'inspect.integrity_failure.without_verified_checkpoint', api: 'inspectV5Run', projection_kind: 'read_only_integrity_fatal', trigger_state_kind: 'no_verified_fsm_cell', last_verified_state_kind: 'none' },
      { profile_id: 'terminal.fatal.integrity_advance_rejection', api: 'advanceV5Run', projection_kind: 'read_only_integrity_fatal', trigger_lifecycle: 'fatal', last_verified_state_kind: 'checkpoint' },
      { profile_id: 'terminal.advance_rejection', api: 'advanceV5Run', projection_kind: 'read_only_terminal_rejection' }
    ].sort((left, right) => left.profile_id.localeCompare(right.profile_id))
  }, 'registry_digest');
}

function createSourceAcquisitionPolicy() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    policy_format_version: 1,
    max_requests_per_batch: 16,
    batch_order: 'required_desc_then_request_id_asc',
    bootstrap_array_semantics: 'set',
    disposition_array_semantics: 'set'
  }, 'policy_digest');
}

function createPermissionDerivationRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    rules: [{
      rule_id: 'permission.atomic-candidate-to-cells.v1',
      required_coordinate_cardinality: { role: 1, resource: 1, action: 1, context: 1 },
      required_dimension: 'decision',
      optional_signaled_dimensions: ['denial_behavior', 'data_scope'],
      allowed_actions: ['discover', 'enter', 'view', 'query', 'mutate'],
      ambiguous_coordinate_result: 'requirements_gap',
      emitted_cell_rule: 'one_cell_per_signaled_dimension'
    }]
  }, 'registry_digest');
}

const allowedControls = Object.freeze(['answer', 'defer', 'unknown', 'close_for_delivery']);

/** @param {object} key @param {object} derivation */
function answerRule(key, derivation) {
  return { ...key, derivation: { ...derivation, allowed_controls: [...allowedControls] } };
}

function createAnswerConstraintRegistry() {
  /** @type {Array<[string, string, Record<string, any>]>} */
  const requirementsPairs = [
    ['condition', 'condition', { kind: 'bounded_text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' }],
    ['expected_outcome', 'expected_outcome', { kind: 'bounded_text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' }],
    ['timing', 'timing', { kind: 'duration_ms', maximum: 31_536_000_000 }],
    ['quantifier_scope', 'quantifier_scope', { kind: 'requirements_quantifier_from_target' }],
    ['comparison', 'comparison', { kind: 'enum_catalog', catalog_id: 'comparison_mode', output_kind: 'enum' }],
    ['authority_source', 'authority_source', { kind: 'requirements_refs_from_target', target_field: 'allowed_authority_refs', min_items: 1 }],
    ['value_state', 'value_state', { kind: 'enum_catalog', catalog_id: 'value_state', output_kind: 'set', min_items: 1 }],
    ['complement', 'complement', { kind: 'set_from_target_domain', min_items: 1 }],
    ['role_domain', 'role_domain', { kind: 'requirements_set_from_target', min_items: 1 }],
    ['reference', 'reference', { kind: 'requirements_refs_from_target', target_field: 'allowed_entity_refs', min_items: 1 }]
  ];
  const rules = requirementsPairs.map(([ambiguityKind, targetKind, derivation]) => answerRule({ source_kind: 'requirements_gap', origin_kind: 'ambiguity', ambiguity_kind: ambiguityKind, target_kind: targetKind }, derivation));
  rules.push(
    answerRule({ source_kind: 'requirements_gap', origin_kind: 'ambiguity', ambiguity_kind: 'other', target_kind: 'other', target_code: 'ambiguity.other' }, { kind: 'bounded_text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' }),
    answerRule({ source_kind: 'requirements_gap', origin_kind: 'outcome_decomposition', unresolved_aspect: 'atomic_boundary', target_kind: 'other', target_code: 'outcome.atomic_boundary' }, { kind: 'requirements_set_from_target', min_items: 1 }),
    answerRule({ source_kind: 'requirements_gap', origin_kind: 'outcome_decomposition', unresolved_aspect: 'normative_status', target_kind: 'other', target_code: 'outcome.normative_status' }, { kind: 'bounded_text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' }),
    answerRule({ source_kind: 'requirements_gap', origin_kind: 'entity_resolution', target_kind: 'other', target_code: 'entity.resolution' }, { kind: 'entity_resolution_from_origin' }),
    answerRule({ source_kind: 'requirements_gap', origin_kind: 'permission_scope', target_kind: 'permission_coordinates' }, { kind: 'permission_coordinates_from_origin' })
  );
  const behaviorDerivations = {
    authority: { kind: 'requirements_refs_from_target', target_field: 'allowed_authority_refs', min_items: 1 },
    join: { kind: 'mapping_from_target_fields', key_kind: 'identifier', mapped_value_kind: 'identifier' },
    transform: { kind: 'requirements_refs_from_target', target_field: 'allowed_entity_refs', min_items: 1 },
    null_policy: { kind: 'enum_catalog', catalog_id: 'null_policy', output_kind: 'enum' },
    freshness: { kind: 'duration_ms', maximum: 31_536_000_000 },
    domain_boundary: { kind: 'domain_boundary_from_target', open_domain_fallback: { kind: 'text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' } },
    population_scope: { kind: 'population_scope_from_target' },
    population_proof: { kind: 'population_proof_from_target' },
    oracle_observation: { kind: 'oracle_observation_from_target' },
    oracle_assertion: { kind: 'oracle_assertion_from_target' },
    oracle_scope: { kind: 'oracle_scope_from_target' },
    oracle_window: { kind: 'oracle_window_from_target' },
    permission_outcome: { kind: 'permission_outcome_from_target_action' },
    denial_behavior: { kind: 'permission_auxiliary_from_target', expected_contract_kind: 'denial_behavior' },
    data_scope: { kind: 'permission_auxiliary_from_target', expected_contract_kind: 'data_scope' },
    risk_rule: { kind: 'bounded_text', min_scalars: 1, max_scalars: 1024, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' }
  };
  for (const [missingSemantics, derivation] of Object.entries(behaviorDerivations)) {
    const targetKind = ['permission_outcome', 'denial_behavior', 'data_scope'].includes(missingSemantics)
      ? 'permission_cell' : missingSemantics === 'risk_rule' ? 'risk' : 'behavior_contract';
    rules.push(answerRule({ source_kind: 'behavior_gap', target_kind: targetKind, missing_semantics: missingSemantics }, derivation));
  }
  return attachDigest({
    registry_version: 1,
    identifier_patterns: [
      { pattern_ref: 'identifier.client-key.v1', engine: 'RE2', expression: '^[A-Za-z][A-Za-z0-9_.:-]{0,127}$' },
      { pattern_ref: 'identifier.stable-ref.v1', engine: 'RE2', expression: '^[a-z][a-z0-9]*_[0-9a-f]{64}$' }
    ],
    scope_ref_kinds: ['module', 'entity', 'field', 'behavior_contract', 'permission_cell', 'population_contract'].map((refKind) => ({ ref_kind: refKind, target_object_kind: refKind })),
    enum_catalogs: [
      { catalog_id: 'comparison_mode', members: ['strict_equal', 'normalized_equal', 'semantic_equivalent', 'set_contains', 'set_equals'] },
      { catalog_id: 'value_state', members: ['missing', 'null', 'empty_string', 'present_value', 'not_rendered', 'rendered_empty'] },
      { catalog_id: 'null_policy', members: ['null_is_missing', 'null_is_value', 'null_is_invalid', 'null_is_not_applicable'] }
    ],
    text_ambiguity_guards: [{ guard_ref: 'answer.no-unresolved-vague-token.v1', match_mode: 'unicode_scalar_substring', forbidden_tokens: ['正常', '正确', '对应', '原值', '按原值', '所有', '否则', '其他', '及时', '合理', '默认'] }],
    contract_derivation_rules: rules
  }, 'registry_digest');
}

function createClarificationControlRegistry() {
  return attachDigest({ registry_version: 1, ...V5_CLARIFICATION_TOKENS }, 'registry_digest');
}

function createStableIdRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    canonical_profile: V5_CANONICAL_PROFILE,
    rows: V5_STABLE_ID_ROWS.map(([objectKind, prefix, projectionId]) => ({
      object_kind: objectKind,
      prefix,
      projection_id: projectionId,
      golden_test_id: `F-C15-protocol.protocol.stable-id.${objectKind}`
    })).sort((left, right) => left.object_kind.localeCompare(right.object_kind))
  }, 'registry_digest');
}

function createStorageLayoutRegistry() {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    path_rules: { separator: '/', forbid_empty_segments: true, forbid_dot_segments: true, forbid_backslash: true, forbid_nul: true, symlink_policy: 'deny' },
    catalog: {
      current_pointer: 'catalog/current-transaction.json',
      transactions: 'catalog/objects/transactions',
      receipts: 'catalog/objects/receipts',
      idempotency_indexes: 'catalog/objects/idempotency-indexes',
      replies: 'catalog/objects/replies',
      run_genesis_records: 'catalog/objects/run-genesis-records',
      runs: 'runs'
    },
    run: {
      identity: 'identity.json',
      current_pointer: 'current-transaction.json',
      transactions: 'objects/transactions',
      receipts: 'objects/receipts',
      idempotency_indexes: 'objects/idempotency-indexes',
      replies: 'objects/replies',
      checkpoints: 'objects/checkpoints',
      selector_sidecars: 'objects/selector-sidecars',
      accepted_artifacts: 'objects/accepted-artifacts',
      compiler_state: 'objects/compiler-state',
      rendered_outputs: 'objects/rendered-outputs',
      events: 'objects/events',
      incidents: 'objects/incidents',
      run_genesis_records: 'objects/run-genesis-records',
      raw_source_bytes: 'objects/raw-source-bytes',
      staging: '.staging',
      lock: '.v5-run.lock'
    },
    object_key_format: 'sha256-lowercase-hex-json',
    publication_protocol: 'write_temp_fsync_rename_directory_fsync_pointer_raw_bytes_cas'
  }, 'registry_digest');
}

function createCanonicalArrayManifest() {
  const setEntries = [
    ['/source_bootstrap/source_request_seeds', 'source_request_client_key'],
    ['/source_requests', 'request_id'], ['/request_ids', '$canonical'], ['/request_dispositions', 'request_id'],
    ['/ledger/dispositions', 'request_id'], ['/ledger/next_batch_request_ids', '$canonical'],
    ['/source_payload/source_pack/sources', 'source_client_key'], ['/accepted_source_payload_digests', '$canonical'],
    ['/source_packs', 'artifact_digest'], ['/decomposition_reviews', 'candidate_id'], ['/ambiguity_reviews', 'candidate_id'],
    ['/entity_resolutions', 'conflict_group_id'], ['/entity_conflict_groups', 'conflict_group_id'],
    ['/entity_conflict_groups/mention_candidate_ids', '$canonical'], ['/permission_scope_groups', 'scope_group_id'],
    ['/permission_scope_groups/permission_scope_candidate_ids', '$canonical'], ['/exact_mention_candidate_ids', '$canonical'],
    ['/clusters', '$canonical'], ['/clusters/mentions', 'mention_candidate_id'], ['/question_part_state_set/parts', 'question_part_id'],
    ['/clarification_preview/bindings', 'unit_client_key'], ['/pending/canonical_units', 'unit_client_key'],
    ['/pending/decision_proposals', 'question_part_id'], ['/applied_clarification_impact/decision_ids', '$canonical'],
    ['/idempotency_index/entries', 'idempotency_key'], ['/stable_id_preimage_registry/rows', 'object_kind'],
    ['/fsm/action_templates', 'template_id'], ['/fsm/cells', 'cell_id'], ['/fsm/outcomes', 'outcome_id'],
    ['/fsm/read_only_profiles', 'profile_id'], ['/fsm/cells/successor_cell_ids', '$canonical'],
    ['/permission/unresolved_coordinates', '$permission-coordinate-order'], ['/permission/coordinate_resolutions', 'coordinate'],
    ['/risk_reviews', '$module-risk'], ['/basis', '$canonical'], ['/affected_refs', '$canonical'],
    ['/selectors', '$canonical'], ['/client_key_bindings', 'client_key']
  ];
  const sequenceEntries = [
    ['/source_pack/sources/units', '$position'], ['/cases/steps', '$position'],
    ['/clarification_presentation/parts', '$position'], ['/question_part_state/transition_history', 'transition_sequence']
  ];
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    manifest_format_version: 1,
    entries: [
      ...setEntries.map(([jsonPointer, uniqueKey]) => ({ json_pointer: jsonPointer, semantics: 'set', unique_key: uniqueKey, sort_key: uniqueKey })),
      ...sequenceEntries.map(([jsonPointer, positionKey]) => ({ json_pointer: jsonPointer, semantics: 'sequence', position_key: positionKey }))
    ].sort((left, right) => left.json_pointer.localeCompare(right.json_pointer))
  }, 'manifest_digest');
}

function createProvenancePolicy() {
  /** @param {string} id @param {string} from @param {string} to @param {string} semantics @param {object[]} conditions */
  const edge = (id, from, to, semantics, conditions) => ({ edge_rule_id: id, from_kind: from, to_kind: to, semantics, conditions, test_ids: [`F-C16-provenance.${id}`] });
  const sameSemantic = [{ kind: 'same_lineage' }, { kind: 'current_semantic_root' }, { kind: 'accepted_ancestor' }];
  return {
    unlisted_edge_policy: 'deny',
    cycle_policy: 'reject',
    same_run_downstream_source_reentry: 'deny',
    external_artifact_default_evidence_level: 'E0',
    allowed_edges: [
      edge('edge.source-unit.claim', 'source_unit', 'claim', 'evidence', [{ kind: 'same_run' }, ...sameSemantic]),
      edge('edge.decision.claim', 'decision', 'claim', 'evidence', [{ kind: 'same_lineage' }, { kind: 'current_semantic_root' }, { kind: 'accepted_ancestor' }, { kind: 'evidence_level_in', levels: ['E1', 'E3'] }]),
      edge('edge.claim.claim', 'claim', 'claim', 'derivation', [{ kind: 'same_run' }, ...sameSemantic, { kind: 'evidence_level_in', levels: ['E2'] }]),
      edge('edge.claim.fact', 'claim', 'fact', 'derivation', [{ kind: 'same_run' }, ...sameSemantic]),
      edge('edge.claim.behavior-contract', 'claim', 'behavior_contract', 'evidence', [...sameSemantic]),
      edge('edge.decision.behavior-contract', 'decision', 'behavior_contract', 'evidence', [...sameSemantic, { kind: 'evidence_level_in', levels: ['E1', 'E3'] }]),
      edge('edge.fact.behavior-contract', 'fact', 'behavior_contract', 'derivation', [...sameSemantic]),
      edge('edge.fact.atomic-outcome', 'fact', 'atomic_outcome', 'derivation', [...sameSemantic]),
      edge('edge.behavior-contract.atomic-outcome', 'behavior_contract', 'atomic_outcome', 'derivation', [...sameSemantic]),
      edge('edge.atomic-outcome.formal-test-point', 'atomic_outcome', 'formal_test_point', 'derivation', [...sameSemantic]),
      edge('edge.formal-test-point.case', 'formal_test_point', 'case', 'derivation', [...sameSemantic]),
      edge('edge.behavior-contract.case', 'behavior_contract', 'case', 'derivation', [...sameSemantic]),
      edge('edge.case.case-oracle', 'case', 'case_oracle', 'ownership', [{ kind: 'same_run' }, { kind: 'same_lineage' }, { kind: 'current_semantic_root' }]),
      edge('edge.claim.case-oracle', 'claim', 'case_oracle', 'evidence', [{ kind: 'same_lineage' }, { kind: 'current_semantic_root' }, { kind: 'accepted_ancestor' }, { kind: 'evidence_level_in', levels: ['E1', 'E2', 'E3'] }]),
      edge('edge.case.case-document', 'case', 'case_document', 'ownership', [{ kind: 'same_run' }, { kind: 'same_lineage' }, { kind: 'current_semantic_root' }]),
      edge('edge.case-document.execution-plan', 'case_document', 'execution_plan', 'execution_derivation', [{ kind: 'same_lineage' }, { kind: 'immutable_digest_ref' }]),
      edge('edge.case-document.execution-result', 'case_document', 'execution_result', 'execution_derivation', [{ kind: 'same_lineage' }, { kind: 'immutable_digest_ref' }, { kind: 'external_downstream_only' }]),
      edge('edge.execution-plan.execution-result', 'execution_plan', 'execution_result', 'execution_derivation', [{ kind: 'same_lineage' }, { kind: 'immutable_digest_ref' }, { kind: 'external_downstream_only' }]),
      edge('edge.case-document.rendered-output', 'case_document', 'rendered_output', 'render_derivation', [{ kind: 'same_run' }, { kind: 'same_lineage' }, { kind: 'immutable_digest_ref' }])
    ].sort((left, right) => left.edge_rule_id.localeCompare(right.edge_rule_id))
  };
}

/** @param {string} cellId */
function verifiedState(cellId) {
  return { kind: 'verified_fsm_cell', fsm_cell_id: cellId };
}

/** @param {string} cellId @param {string} [replyCellId] */
function persistedProfile(cellId, replyCellId = cellId) {
  return { state_profile_id: `state.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: 'persisted_fsm_cell', reply_fsm_cell_id: replyCellId } };
}

/** @param {string} errorCode @param {readonly string[]} catalogRow */
function createRuntimeResponses(errorCode, catalogRow) {
  const [replyStatus, semanticCommitPolicy, recoveryInstructionKey] = catalogRow;
  const preRunCodes = new Set(['UNSUPPORTED_SCHEMA_VERSION', 'RUN_ARGUMENT_INVALID', 'RESUME_PARENT_INVALID', 'CASE_DOCUMENT_REFERENCE_INVALID']);
  if (preRunCodes.has(errorCode)) return [{ response_variant_id: 'pre_run', context: 'pre_run', response_channel: 'pre_run_error', reply_status: replyStatus, semantic_commit_policy: semanticCommitPolicy, failure_record_policy: 'none', exact_commit: { kind: 'none' }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey }];
  if (errorCode === 'ACCEPTED_STATE_INTEGRITY_FAILURE') {
    /** @type {any[]} */
    const inspectProfiles = V5_ACTIVE_FSM_CELL_IDS.concat(['cd.terminal.finished', 'cd.terminal.cancelled', 'cd.terminal.fatal', 'ep.terminal.finished', 'ep.terminal.cancelled', 'ep.terminal.fatal']).map((cellId) => ({ state_profile_id: `inspect.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: 'read_only_integrity_fatal', last_verified_state_kind: 'checkpoint' } }));
    inspectProfiles.push(
      { state_profile_id: 'inspect.none.case', trigger_state: { kind: 'no_verified_fsm_cell', delivery_intent: 'case_document' }, reply_projection: { kind: 'read_only_integrity_fatal', last_verified_state_kind: 'none' } },
      { state_profile_id: 'inspect.none.execution', trigger_state: { kind: 'no_verified_fsm_cell', delivery_intent: 'execution_plan' }, reply_projection: { kind: 'read_only_integrity_fatal', last_verified_state_kind: 'none' } }
    );
    return [
      { response_variant_id: 'pre_run_identity', context: 'pre_run', response_channel: 'pre_run_error', reply_status: 'fatal', semantic_commit_policy: 'no_semantic_commit', failure_record_policy: 'none', exact_commit: { kind: 'none' }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: 'inspect_verified', context: 'run_inspect', state_profiles: inspectProfiles, response_channel: 'run_reply', reply_status: 'fatal', semantic_commit_policy: 'no_semantic_commit', failure_record_policy: 'none', exact_commit: { kind: 'none' }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: 'mutation_terminalize', context: 'run_mutation', state_profiles: V5_ACTIVE_FSM_CELL_IDS.concat(['cd.terminal.finished', 'cd.terminal.cancelled', 'ep.terminal.finished', 'ep.terminal.cancelled']).map((cellId) => persistedProfile(cellId, cellId.startsWith('cd.') ? 'cd.terminal.fatal' : 'ep.terminal.fatal')), response_channel: 'run_reply', reply_status: 'fatal', semantic_commit_policy: 'no_semantic_commit', failure_record_policy: 'record_terminal_fatal', exact_commit: operationalCommit('fatal_incident_recorded'), next_action_templates: [], recovery_instruction_key: recoveryInstructionKey },
      { response_variant_id: 'mutation_already_fatal', context: 'run_mutation', state_profiles: ['cd.terminal.fatal', 'ep.terminal.fatal'].map((cellId) => ({ state_profile_id: `fatal.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: 'read_only_integrity_fatal', last_verified_state_kind: 'checkpoint' } })), response_channel: 'run_reply', reply_status: 'fatal', semantic_commit_policy: 'no_semantic_commit', failure_record_policy: 'none', exact_commit: { kind: 'none' }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey }
    ];
  }
  const responses = [];
  if (errorCode === 'IDEMPOTENCY_CONFLICT') responses.push({ response_variant_id: 'pre_run_create', context: 'pre_run', response_channel: 'pre_run_error', reply_status: 'protocol_error', semantic_commit_policy: 'no_semantic_commit', failure_record_policy: 'none', exact_commit: { kind: 'none' }, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey });
  /** @type {any[]} */
  let profiles = V5_ACTIVE_FSM_CELL_IDS.map((cellId) => persistedProfile(cellId));
  /** @type {any} */
  let exactCommit = { kind: 'none' };
  let failureRecordPolicy = 'none';
  if (replyStatus === 'fatal') {
    profiles = V5_ACTIVE_FSM_CELL_IDS.map((cellId) => persistedProfile(cellId, cellId.startsWith('cd.') ? 'cd.terminal.fatal' : 'ep.terminal.fatal'));
    exactCommit = operationalCommit('fatal_incident_recorded');
    failureRecordPolicy = 'record_terminal_fatal';
  } else if (errorCode === 'ORACLE_SEMANTICS_REQUIRED') {
    profiles = [persistedProfile('cd.active.case.drafts', 'cd.active.case.behavior')];
    exactCommit = operationalCommit('oracle_work_rerouted');
  } else if (semanticCommitPolicy === 'commit_artifact') {
    const requirementsError = ['AMBIGUITY_UNRESOLVED', 'ENTITY_RESOLUTION_UNRESOLVED'].includes(errorCode);
    profiles = [persistedProfile(requirementsError ? 'cd.active.requirements.review' : 'cd.active.case.behavior', requirementsError ? 'cd.active.requirements.resolve' : 'cd.active.case.resolve')];
    exactCommit = artifactCommit(requirementsError ? 'evidence_claims' : 'behavior_views');
  } else if (semanticCommitPolicy === 'preview_only') {
    profiles = [persistedProfile('cd.active.requirements.resolve', 'cd.active.requirements.confirm')];
    exactCommit = operationalCommit('clarification_pending_created');
  }
  if (errorCode === 'ACTION_NOT_ADVERTISED' || errorCode === 'IDEMPOTENCY_CONFLICT') profiles = profiles.concat(['cd.terminal.finished', 'cd.terminal.cancelled', 'cd.terminal.fatal', 'ep.terminal.finished', 'ep.terminal.cancelled', 'ep.terminal.fatal'].map((cellId) => ({ state_profile_id: `terminal.${cellId}`, trigger_state: verifiedState(cellId), reply_projection: { kind: 'read_only_terminal_rejection', terminal_fsm_cell_id: cellId } })));
  responses.push({ response_variant_id: 'run_mutation', context: 'run_mutation', state_profiles: profiles, response_channel: 'run_reply', reply_status: replyStatus, semantic_commit_policy: semanticCommitPolicy, failure_record_policy: failureRecordPolicy, exact_commit: exactCommit, next_action_templates: [], recovery_instruction_key: recoveryInstructionKey });
  return responses;
}

/** @param {Record<string, any>} fsm */
function createPolicyRegistry(fsm) {
  const phaseLookup = new Map();
  for (const [phase, errorCodes] of Object.entries(V5_ERROR_PHASES)) errorCodes.forEach((errorCode, index) => phaseLookup.set(errorCode, { phase, priority: index + 1 }));
  const runtimeRules = Object.entries(V5_ERROR_CATALOG).map(([errorCode, catalogRow]) => {
    const phase = phaseLookup.get(errorCode);
    const responses = createRuntimeResponses(errorCode, catalogRow);
    return {
      rule_id: `ERROR.${errorCode}`,
      owner: 'compiler',
      enforcement: ['schema', 'invariant', 'fsm', 'transaction'],
      applicability: [...new Set(responses.map((response) => response.context))].map((context) => context === 'pre_run' ? { kind: 'pre_run' } : { kind: context, stages: ['source_acquisition', 'requirements_analysis', 'case_design', 'execution_closure', 'final_confirmation', 'delivery'] }),
      normative_refs: [`SPEC.ERROR.${errorCode}`],
      test_ids: [`F-C15-protocol.error.${errorCode.toLowerCase()}`],
      kind: 'runtime_error',
      trigger_ref: `trigger.${errorCode.toLowerCase()}`,
      error_code: errorCode,
      validator_phase: phase.phase,
      validator_priority: phase.priority,
      schema_issue_matchers: phase.phase === 'specialized_shape' ? [{ validation_surface: 'advance_action', json_pointer_prefix: '/', keyword: 'required' }] : [],
      responses
    };
  });
  const invariantRules = V5_INVARIANT_REFS.map((normativeRef) => ({
    rule_id: `INVARIANT.${normativeRef.slice(5)}`,
    owner: 'compiler',
    enforcement: ['invariant', 'ci'],
    applicability: [{ kind: 'build' }, { kind: 'ci' }, { kind: 'release' }],
    normative_refs: [normativeRef],
    test_ids: [`F-${normativeRef.toLowerCase().replaceAll('.', '-')}`],
    kind: 'invariant',
    assertion_ref: normativeRef
  }));
  const acceptedClosureRules = [
    { target_kind: 'accepted_artifact', target_selector: 'all_except_applied_clarification_impact_and_rendered_output', diagnostic_code: 'ACCEPTED_STATE_INTEGRITY_FAILURE' },
    { target_kind: 'compiler_state', target_selector: 'checkpoint_referenced_semantic_state_except_applied_clarification_impact', diagnostic_code: 'ACCEPTED_STATE_INTEGRITY_FAILURE' },
    { target_kind: 'compiler_projection', target_selector: 'applied_clarification_impact', diagnostic_code: 'CLARIFICATION_IMPACT_MISMATCH' },
    { target_kind: 'renderer_output', target_selector: 'json_or_markdown_or_csv', diagnostic_code: 'CANONICAL_RENDER_MISMATCH' }
  ].sort((left, right) => left.target_kind.localeCompare(right.target_kind));
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    registry_format_version: 1,
    fsm_registry_digest: fsm.registry_digest,
    rules: [...invariantRules, ...runtimeRules].sort((left, right) => left.rule_id.localeCompare(right.rule_id)),
    accepted_closure_integrity_policy: {
      policy_version: 1,
      inspect_effect: 'read_only_integrity_fatal',
      mutation_effect: 'normal_fatal_reclassification',
      mutation_scope: 'advance_new_idempotency_key_only',
      mutation_applicable_lifecycles: ['active', 'finished', 'cancelled'],
      already_fatal_effect: 'read_only_integrity_fatal_no_commit',
      dispatch_position: 'after_operational_chain_and_existing_key_resolution_before_terminal_guard',
      on_untrusted_operational_chain: 'integrity_quarantine',
      target_rules: acceptedClosureRules
    },
    provenance_policy: createProvenancePolicy()
  }, 'registry_digest');
}

/** @param {Record<string, any>} fsm @param {Record<string, any>} policy */
function createNormativeRuleInventory(fsm, policy) {
  return attachDigest({
    schema_version: V5_SCHEMA_VERSION,
    inventory_format_version: 1,
    fsm_registry_digest: fsm.registry_digest,
    policy_registry_digest: policy.registry_digest,
    invariant_refs: [...V5_INVARIANT_REFS],
    runtime_error_refs: Object.keys(V5_ERROR_CATALOG).map((code) => `SPEC.ERROR.${code}`).sort()
  }, 'inventory_digest');
}

/** @param {Record<string,any>} fsm @param {Record<string,any>} cell */
function nextActionTemplates(fsm, cell) {
  const byId = new Map(fsm.action_templates.map((/** @type {Record<string,any>} */ template) => [template.template_id, template]));
  return cell.allowed_action_template_ids.map((/** @type {string} */ id) => {
    const template = byId.get(id);
    if (template.action_kind === 'submit_artifact') return { kind: 'submit_artifact', artifact_kind: template.artifact_kind };
    if (template.action_kind === 'advance_execution_plan') return { kind: 'advance_execution_plan', operation_kinds_source: 'existing_closed_union' };
    return { kind: template.action_kind };
  }).sort((/** @type {Record<string,any>} */ left, /** @type {Record<string,any>} */ right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
}

/** @param {string} value */
function replyContractId(value) {
  return `RPL.${value.toUpperCase().replaceAll(/[^A-Z0-9_.-]/gu, '.')}`;
}

/** @param {Record<string,any>} fsm */
function createFsmReplyRows(fsm) {
  const cells = new Map(fsm.cells.map((/** @type {Record<string,any>} */ cell) => [cell.cell_id, cell]));
  return fsm.outcomes.map((/** @type {Record<string,any>} */ outcome) => {
    const cell = cells.get(outcome.target_cell_id);
    return {
      reply_contract_id: replyContractId(`FSM.${outcome.outcome_id}`),
      source: { kind: 'fsm_outcome', outcome_id: outcome.outcome_id },
      exact_projection_kind: 'persisted_run_state', exact_lifecycle: cell.lifecycle,
      exact_stage: cell.stage, exact_obligation: cell.obligation,
      exact_last_verified_state: { kind: 'absent' }, exact_reply_status: cell.normal_reply_status,
      exact_work_packet: cell.lifecycle === 'active' ? { kind: 'nonterminal', packet_kind: cell.work_packet_kind } : { kind: 'terminal', terminal_kind: cell.terminal_kind },
      exact_action_templates: nextActionTemplates(fsm, cell), exact_commit: outcome.commit_projection,
      exact_diagnostic: { kind: 'none' }
    };
  });
}

/** @param {Record<string,any>} fsm @param {Record<string,any>} policy */
function createErrorReplyRows(fsm, policy) {
  const cells = new Map(fsm.cells.map((/** @type {Record<string,any>} */ cell) => [cell.cell_id, cell]));
  const rows = [];
  for (const rule of policy.rules.filter((/** @type {Record<string,any>} */ candidate) => candidate.kind === 'runtime_error')) {
    for (const response of rule.responses) {
      const profiles = response.state_profiles ?? [null];
      for (const profile of profiles) {
        const trigger = profile?.trigger_state;
        const projection = profile?.reply_projection;
        const projectedCellId = projection?.reply_fsm_cell_id ?? projection?.terminal_fsm_cell_id ?? trigger?.fsm_cell_id;
        const cell = projectedCellId ? cells.get(projectedCellId) : null;
        const projectionKind = response.context === 'pre_run' ? 'pre_run_error'
          : projection?.kind === 'read_only_integrity_fatal' ? 'read_only_integrity_fatal'
            : projection?.kind === 'read_only_terminal_rejection' ? 'read_only_terminal_rejection' : 'persisted_run_state';
        const stateSuffix = profile ? `.${profile.state_profile_id}` : '';
        const source = response.context === 'pre_run'
          ? { kind: 'runtime_error', error_code: rule.error_code, response_context: 'pre_run', response_variant_id: response.response_variant_id }
          : { kind: 'runtime_error', error_code: rule.error_code, response_context: response.context, response_variant_id: response.response_variant_id, state_profile_id: profile.state_profile_id, trigger_state: trigger };
        rows.push({
          reply_contract_id: replyContractId(`ERROR.${rule.error_code}.${response.context}.${response.response_variant_id}${stateSuffix}`),
          source, exact_projection_kind: projectionKind,
          exact_lifecycle: response.context === 'pre_run' ? 'absent' : projectionKind === 'read_only_integrity_fatal' ? 'fatal' : cell.lifecycle,
          exact_stage: response.context === 'pre_run' || projectionKind === 'read_only_integrity_fatal' ? 'absent' : cell.stage,
          exact_obligation: response.context === 'pre_run' || projectionKind === 'read_only_integrity_fatal' ? 'absent' : cell.obligation,
          exact_last_verified_state: response.context === 'pre_run' || projectionKind === 'persisted_run_state' || projectionKind === 'read_only_terminal_rejection'
            ? { kind: 'absent' } : projection.last_verified_state_kind === 'none' ? { kind: 'none' } : { kind: 'checkpoint', fsm_cell_id: trigger.fsm_cell_id },
          exact_reply_status: response.reply_status,
          exact_work_packet: response.context === 'pre_run' ? { kind: 'absent' }
            : projectionKind === 'read_only_integrity_fatal'
              ? { kind: 'terminal', terminal_kind: trigger?.delivery_intent === 'execution_plan' || trigger?.fsm_cell_id?.startsWith('ep.') ? 'execution_plan_fatal' : 'case_document_fatal' }
              : cell.lifecycle === 'active' ? { kind: 'nonterminal', packet_kind: cell.work_packet_kind } : { kind: 'terminal', terminal_kind: cell.terminal_kind },
          exact_action_templates: response.context === 'pre_run' || projectionKind.startsWith('read_only') ? [] : nextActionTemplates(fsm, cell),
          exact_commit: response.exact_commit, exact_diagnostic: { kind: 'one', error_code: rule.error_code }
        });
      }
    }
  }
  return rows;
}

/** @param {Record<string,any>} fsm */
function createInspectReplyRows(fsm) {
  return fsm.cells.map((/** @type {Record<string,any>} */ cell) => ({
    reply_contract_id: replyContractId(`INSPECT.${cell.cell_id}`),
    source: { kind: 'inspect_success', fsm_cell_id: cell.cell_id }, exact_projection_kind: 'persisted_run_state',
    exact_lifecycle: cell.lifecycle, exact_stage: cell.stage, exact_obligation: cell.obligation,
    exact_last_verified_state: { kind: 'absent' }, exact_reply_status: cell.normal_reply_status,
    exact_work_packet: cell.lifecycle === 'active' ? { kind: 'nonterminal', packet_kind: cell.work_packet_kind } : { kind: 'terminal', terminal_kind: cell.terminal_kind },
    exact_action_templates: nextActionTemplates(fsm, cell), exact_commit: { kind: 'none' }, exact_diagnostic: { kind: 'none' }
  }));
}

/** @param {Record<string, any>} fsm @param {Record<string, any>} policy */
function createReplyContracts(fsm, policy) {
  const payload = {
    schema_version: V5_SCHEMA_VERSION,
    contract_format_version: 1,
    fsm_registry_digest: fsm.registry_digest,
    policy_registry_digest: policy.registry_digest,
    error_codes: Object.keys(V5_ERROR_CATALOG).sort(),
    reply_branches: ['pre_run_error', 'persisted_run_state', 'read_only_integrity_fatal', 'read_only_terminal_rejection'],
    reply_statuses: ['need_artifact', 'need_revision', 'need_user_answers', 'clarification_confirmation_required', 'ready', 'finished', 'cancelled', 'protocol_error', 'fatal'],
    work_packet_by_cell: Object.fromEntries(fsm.cells.map((/** @type {any} */ cell) => [cell.cell_id, cell.work_packet_kind])),
    rows: [...createFsmReplyRows(fsm), ...createErrorReplyRows(fsm, policy), ...createInspectReplyRows(fsm)]
      .sort((left, right) => left.reply_contract_id.localeCompare(right.reply_contract_id))
  };
  return attachDigest(payload, 'rules_bundle_digest');
}

/** @returns {Record<string, Record<string, any>>} */
export function generateV5Contracts() {
  const sourceAcquisitionPolicy = createSourceAcquisitionPolicy();
  const fsmRegistry = createFsmRegistry();
  const policyRegistry = createPolicyRegistry(fsmRegistry);
  const permissionDerivationRegistry = createPermissionDerivationRegistry();
  const answerConstraintRegistry = createAnswerConstraintRegistry();
  const clarificationControlRegistry = createClarificationControlRegistry();
  const stableIdPreimageRegistry = createStableIdRegistry();
  const storageLayoutRegistry = createStorageLayoutRegistry();
  const normativeRuleInventory = createNormativeRuleInventory(fsmRegistry, policyRegistry);
  const replyContracts = createReplyContracts(fsmRegistry, policyRegistry);
  const canonicalArrayManifest = createCanonicalArrayManifest();
  const contracts = { sourceAcquisitionPolicy, fsmRegistry, policyRegistry, permissionDerivationRegistry, answerConstraintRegistry, clarificationControlRegistry, stableIdPreimageRegistry, storageLayoutRegistry, normativeRuleInventory, replyContracts, canonicalArrayManifest };
  validateGeneratedV5Contracts(contracts);
  return contracts;
}

/** @param {unknown} value @returns {Record<string, any>} */
function exactSnapshotSchema(value) {
  if (Array.isArray(value)) {
    /** @type {any} */
    const schema = { type: 'array', minItems: value.length, maxItems: value.length, items: false };
    if (value.length > 0) schema.prefixItems = value.map(exactSnapshotSchema);
    return schema;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return { type: 'object', required: entries.map(([key]) => key), properties: Object.fromEntries(entries.map(([key, child]) => [key, exactSnapshotSchema(child)])), additionalProperties: false };
  }
  return { const: value };
}

/** @param {string} id @param {Record<string, any>} value */
export function generateExactV5PolicySchema(id, value) {
  return { '$schema': 'https://json-schema.org/draft/2020-12/schema', '$id': `https://awesome-self-skills.local/schemas/${id}.schema.json`, ...exactSnapshotSchema(value) };
}

/** @param {string|URL} directory */
function directoryPath(directory) {
  return directory instanceof URL ? fileURLToPath(directory) : directory;
}

/** @param {string|URL} schemaDirectory @param {string|URL} policyDirectory */
export async function loadV5Contracts(schemaDirectory, policyDirectory) {
  const contracts = /** @type {Record<string, any>} */ ({});
  for (const [contractKey, fileBase] of Object.entries(V5_POLICY_FILE_MAP)) {
    const policy = JSON.parse(await readFile(path.join(directoryPath(policyDirectory), `${fileBase}.json`), 'utf8'));
    const schema = JSON.parse(await readFile(path.join(directoryPath(schemaDirectory), `${fileBase}.schema.json`), 'utf8'));
    const issues = validateAgainstSchema(policy, schema);
    if (issues.length > 0) throw new Error(`POLICY_REGISTRY_INCONSISTENT: ${fileBase} does not validate`);
    contracts[contractKey] = policy;
  }
  validateGeneratedV5Contracts(contracts);
  return { contracts, rulesBundleDigest: contracts.replyContracts.rules_bundle_digest };
}

/** @param {string|URL} schemaDirectory @param {string|URL} policyDirectory */
export async function writeV5Contracts(schemaDirectory, policyDirectory) {
  const schemaPath = directoryPath(schemaDirectory);
  const policyPath = directoryPath(policyDirectory);
  await mkdir(schemaPath, { recursive: true });
  await mkdir(policyPath, { recursive: true });
  const contracts = generateV5Contracts();
  for (const [contractKey, fileBase] of Object.entries(V5_POLICY_FILE_MAP)) {
    const policy = contracts[contractKey];
    const schema = generateExactV5PolicySchema(fileBase, policy);
    await writeFile(path.join(policyPath, `${fileBase}.json`), `${canonicalStringify(policy)}\n`);
    await writeFile(path.join(schemaPath, `${fileBase}.schema.json`), `${canonicalStringify(schema)}\n`);
  }
}

/** @param {string|URL} schemaDirectory @param {string|URL} policyDirectory */
export async function checkV5Contracts(schemaDirectory, policyDirectory) {
  const schemaPath = directoryPath(schemaDirectory);
  const policyPath = directoryPath(policyDirectory);
  const contracts = generateV5Contracts();
  const expectedPolicyFiles = [];
  const expectedSchemaFiles = [];
  for (const [contractKey, fileBase] of Object.entries(V5_POLICY_FILE_MAP)) {
    expectedPolicyFiles.push(`${fileBase}.json`);
    expectedSchemaFiles.push(`${fileBase}.schema.json`);
    const expectedPolicy = `${canonicalStringify(contracts[contractKey])}\n`;
    const expectedSchema = `${canonicalStringify(generateExactV5PolicySchema(fileBase, contracts[contractKey]))}\n`;
    const [actualPolicy, actualSchema] = await Promise.all([
      readFile(path.join(policyPath, `${fileBase}.json`), 'utf8'),
      readFile(path.join(schemaPath, `${fileBase}.schema.json`), 'utf8')
    ]);
    if (actualPolicy !== expectedPolicy || actualSchema !== expectedSchema) throw new Error(`generated artifact is stale: ${fileBase}`);
  }
  const actualPolicies = (await readdir(policyPath)).filter((/** @type {string} */ file) => file.startsWith('v5-')).sort();
  const actualSchemas = (await readdir(schemaPath)).filter((/** @type {string} */ file) => file.startsWith('v5-')).sort();
  if (JSON.stringify(actualPolicies) !== JSON.stringify(expectedPolicyFiles.sort()) || JSON.stringify(actualSchemas) !== JSON.stringify(expectedSchemaFiles.sort())) throw new Error('generated V5 policy/schema inventory is stale');
}
