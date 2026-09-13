export const V5_SCHEMA_VERSION = '5.0.0';
export const V5_COMPILER_VERSION = '0.6.0';
export const V5_REGISTRY_FORMAT_VERSION = 1;
export const V5_CANONICAL_PROFILE = 'v5.canonical-json.v1';
export const V5_DIGEST_PATTERN = '^sha256:[0-9a-f]{64}$';

export const V5_FSM_CELL_IDS = Object.freeze([
  'cd.active.source.provide',
  'cd.active.requirements.review',
  'cd.active.requirements.resolve',
  'cd.active.requirements.confirm',
  'cd.active.case.behavior',
  'cd.active.case.drafts',
  'cd.active.case.resolve',
  'cd.active.case.confirm',
  'cd.terminal.finished',
  'cd.terminal.cancelled',
  'cd.terminal.fatal',
  'ep.active.closure.resolve',
  'ep.active.final.confirm',
  'ep.terminal.finished',
  'ep.terminal.cancelled',
  'ep.terminal.fatal'
]);

export const V5_ACTIVE_FSM_CELL_IDS = Object.freeze(V5_FSM_CELL_IDS.filter((cellId) => cellId.includes('.active.')));
export const V5_RESUMABLE_FSM_CELL_IDS = Object.freeze(V5_ACTIVE_FSM_CELL_IDS.filter((cellId) =>
  cellId !== 'cd.active.requirements.confirm' && cellId !== 'cd.active.case.confirm'));

export const V5_ACTION_TEMPLATE_IDS = Object.freeze([
  'run.cancel',
  'source.submit_batch',
  'artifact.submit_evidence_claims',
  'clarification.preview',
  'clarification.commit',
  'artifact.submit_behavior_views',
  'artifact.submit_case_drafts',
  'execution.advance_closure',
  'execution.confirm_or_pause'
]);

export const V5_STABLE_ID_ROWS = Object.freeze([
  ['source_request', 'srq5_', 'stable.source-request.v1'],
  ['outcome_candidate', 'out5_', 'stable.outcome-candidate.v1'],
  ['outcome_dedup_group', 'odg5_', 'stable.outcome-dedup-group.v1'],
  ['ambiguity_candidate', 'amb5_', 'stable.ambiguity-candidate.v1'],
  ['entity_mention_candidate', 'emc5_', 'stable.entity-mention-candidate.v1'],
  ['entity_conflict_group', 'ecg5_', 'stable.entity-conflict-group.v1'],
  ['entity', 'ent5_', 'stable.entity.v1'],
  ['permission_scope_candidate', 'psc5_', 'stable.permission-scope-candidate.v1'],
  ['permission_scope_group', 'psg5_', 'stable.permission-scope-group.v1'],
  ['question_part', 'qpt5_', 'stable.question-part.v1'],
  ['clarification_presentation', 'qpr5_', 'stable.clarification-presentation.v1'],
  ['clarification_decision', 'dec5_', 'stable.clarification-decision.v1'],
  ['behavior_semantic_gap', 'bsg5_', 'stable.behavior-semantic-gap.v1'],
  ['behavior_required_contract', 'brq5_', 'stable.behavior-required-contract.v1'],
  ['field_correspondence', 'fcr5_', 'stable.field-correspondence.v1'],
  ['predicate_contract', 'pdc5_', 'stable.predicate-contract.v1'],
  ['domain_contract', 'dom5_', 'stable.domain-contract.v1'],
  ['domain_partition', 'dpt5_', 'stable.domain-partition.v1'],
  ['behavior_equivalence_contract', 'beq5_', 'stable.behavior-equivalence-contract.v1'],
  ['population_contract', 'pop5_', 'stable.population-contract.v1'],
  ['population_proof', 'ppf5_', 'stable.population-proof.v1'],
  ['oracle_semantic_contract', 'osc5_', 'stable.oracle-semantic-contract.v1'],
  ['permission_auxiliary_contract', 'pac5_', 'stable.permission-auxiliary-contract.v1'],
  ['permission_matrix_seed', 'pms5_', 'stable.permission-matrix-seed.v1'],
  ['permission_required_cell', 'prc5_', 'stable.permission-required-cell.v1'],
  ['domain_selection', 'dsl5_', 'stable.domain-selection.v1'],
  ['risk_review', 'rrv5_', 'stable.risk-review.v1'],
  ['derived_risk_ledger_item', 'rsk5_', 'stable.derived-risk-ledger-item.v1']
]);

export const V5_STABLE_PROJECTION_FIELDS = Object.freeze({
  'stable.source-request.v1': ['source_role', 'locator', 'required'],
  'stable.outcome-candidate.v1': ['accepted_source_state_digest', 'locator_id', 'source_span', 'atom_signature', 'required_observation_slot_digests'],
  'stable.outcome-dedup-group.v1': ['accepted_source_state_digest', 'atom_signature', 'required_observation_slot_digests', 'candidate_ids'],
  'stable.ambiguity-candidate.v1': ['accepted_source_state_digest', 'locator_id', 'source_span', 'ambiguity_kind'],
  'stable.entity-mention-candidate.v1': ['accepted_source_state_digest', 'locator_id', 'source_span', 'observed_name'],
  'stable.entity-conflict-group.v1': ['mention_candidate_ids'],
  'stable.entity.v1': ['accepted_source_state_digest', 'canonical_name', 'mention_candidate_ids', 'basis'],
  'stable.permission-scope-candidate.v1': ['accepted_source_state_digest', 'locator_id', 'source_span', 'coordinate_slots', 'signaled_dimensions'],
  'stable.permission-scope-group.v1': ['permission_scope_candidate_ids'],
  'stable.question-part.v1': ['case_document_lineage_id', 'gap_kind', 'gap_id', 'gap_payload_digest', 'initial_semantic_root_digest', 'answer_contract_digest'],
  'stable.clarification-presentation.v1': ['case_document_lineage_id', 'input_semantic_root_digest', 'question_part_state_set_digest', 'visible_question_part_ids'],
  'stable.clarification-decision.v1': ['case_document_lineage_id', 'input_semantic_root_digest', 'gap_binding', 'target', 'answer_contract_digest', 'answer_value_digest', 'evidence_level'],
  'stable.behavior-semantic-gap.v1': ['input_semantic_root_digest', 'target', 'missing_semantics', 'answer_contract_digest', 'basis'],
  'stable.behavior-required-contract.v1': ['input_semantic_root_digest', 'contract_kind', 'subject_ref', 'intent_ref', 'basis', 'kind_specific_requirement'],
  'stable.field-correspondence.v1': ['input_semantic_root_digest', 'authority_side', 'left', 'right', 'join', 'transform', 'comparison', 'null_policy_ref', 'freshness', 'basis'],
  'stable.predicate-contract.v1': ['input_semantic_root_digest', 'predicate_ref', 'mutual_exclusion_group', 'exhaustiveness', 'basis'],
  'stable.domain-contract.v1': ['input_semantic_root_digest', 'domain_anchor_digest', 'partition_ids'],
  'stable.domain-partition.v1': ['input_semantic_root_digest', 'domain_anchor_digest', 'normalized_partition'],
  'stable.behavior-equivalence-contract.v1': ['input_semantic_root_digest', 'domain_contract_id', 'partition_id', 'formal_test_point_id', 'oracle_semantic_contract_id', 'equivalence_scope', 'basis'],
  'stable.population-contract.v1': ['input_semantic_root_digest', 'scope'],
  'stable.population-proof.v1': ['input_semantic_root_digest', 'population_contract_id', 'payload', 'basis'],
  'stable.oracle-semantic-contract.v1': ['input_semantic_root_digest', 'formal_test_point_id', 'observation_ref', 'assertion', 'evaluation_scope', 'observation_window', 'basis'],
  'stable.permission-auxiliary-contract.v1': ['input_semantic_root_digest', 'contract_kind', 'permission_target', 'payload', 'basis'],
  'stable.permission-matrix-seed.v1': ['input_semantic_root_digest', 'permission_derivation_registry_digest', 'scope_candidate_ids', 'role_domain', 'matrix_scope'],
  'stable.permission-required-cell.v1': ['matrix_id', 'role_value', 'resource_value', 'action_value', 'context_value', 'permission_dimension_value', 'coordinate_evidence_digests'],
  'stable.domain-selection.v1': ['input_semantic_root_digest', 'case_anchor_digest', 'formal_test_point_id', 'oracle_semantic_contract_id', 'domain_contract_id', 'partition_id', 'selection'],
  'stable.risk-review.v1': ['input_semantic_root_digest', 'module_ref', 'risk_kind'],
  'stable.derived-risk-ledger-item.v1': ['module_ref', 'risk_kind', 'trigger_basis', 'affected_refs']
});

export const V5_INVARIANT_REFS = Object.freeze([
  ...Array.from({ length: 16 }, (_, index) => `SPEC.FR${String(index + 1).padStart(3, '0')}`),
  'SPEC.API.CREATE', 'SPEC.API.ADVANCE', 'SPEC.API.INSPECT', 'SPEC.WORKFLOW.RESUME',
  'SPEC.ACTION.TOKEN', 'SPEC.REPLY', 'SPEC.OWNERSHIP', 'SPEC.CANONICAL',
  'SPEC.SEMANTIC.REVIEW', 'SPEC.CLARIFICATION', 'SPEC.BEHAVIOR', 'SPEC.PROVENANCE',
  'SPEC.FSM', 'SPEC.POLICY', 'SPEC.TRANSACTION', 'SPEC.RENDER', 'SPEC.FIXTURE', 'SPEC.RELEASE'
]);

export const V5_ERROR_PHASES = Object.freeze({
  scope_integrity: ['ACCEPTED_STATE_INTEGRITY_FAILURE', 'RUN_ARGUMENT_INVALID', 'UNSUPPORTED_SCHEMA_VERSION', 'RESUME_PARENT_INVALID', 'CASE_DOCUMENT_REFERENCE_INVALID'],
  idempotency: ['IDEMPOTENCY_CONFLICT'],
  capability_protocol: ['ACTION_NOT_ADVERTISED', 'CLARIFICATION_PREVIEW_STALE'],
  specialized_shape: ['COMPILER_OWNED_FIELD_SUBMITTED', 'QUESTION_PART_ACTION_CONFLICT', 'TEMPORARY_BASIS_REQUIRED', 'CLARIFICATION_CONFIRMATION_INVALID', 'CONTROL_ORIGIN_REQUIRED', 'ANSWER_NATURE_INVALID', 'CLIENT_KEY_INVALID'],
  closed_schema_fallback: ['SCHEMA_VALIDATION_FAILED'],
  binding_fsm: ['QUESTION_PART_TRANSITION_INVALID', 'ANSWER_BINDING_AMBIGUOUS', 'ANSWER_BINDING_INVALID', 'CLARIFICATION_CONFIRMATION_REQUIRED'],
  semantic_invariant: ['SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'SEMANTIC_REVIEW_CANDIDATE_MISSING', 'ATOMIC_OUTCOME_NOT_SINGLE', 'AMBIGUITY_UNRESOLVED', 'ENTITY_RESOLUTION_UNRESOLVED', 'CLARIFICATION_IMPACT_MISMATCH', 'ORACLE_SEMANTICS_REQUIRED', 'ORACLE_NOT_DECIDABLE', 'FIELD_CORRESPONDENCE_REQUIRED', 'VALUE_STATE_INVALID', 'COMPLEMENT_COVERAGE_OVERCLAIMED', 'DOMAIN_CONTRACT_REQUIRED', 'POPULATION_CONTRACT_REQUIRED', 'PERMISSION_MATRIX_INCOMPLETE', 'PERMISSION_OUTCOME_UNRESOLVED', 'RISK_LEDGER_INVALID', 'PROVENANCE_EDGE_NOT_ALLOWED', 'PROVENANCE_CYCLE', 'DOWNSTREAM_ARTIFACT_AS_SOURCE'],
  render_integrity: ['CANONICAL_RENDER_MISMATCH']
});

export const V5_ERROR_CATALOG = Object.freeze({
  UNSUPPORTED_SCHEMA_VERSION: ['fatal', 'no_semantic_commit', 'create_v5_run'],
  RUN_ARGUMENT_INVALID: ['protocol_error', 'no_semantic_commit', 'correct_arguments'],
  RESUME_PARENT_INVALID: ['protocol_error', 'no_semantic_commit', 'select_verified_cancelled_v5_parent'],
  CASE_DOCUMENT_REFERENCE_INVALID: ['protocol_error', 'no_semantic_commit', 'select_verified_v5_case_document'],
  ACTION_NOT_ADVERTISED: ['protocol_error', 'no_semantic_commit', 'inspect_and_use_advertised_action'],
  IDEMPOTENCY_CONFLICT: ['protocol_error', 'no_semantic_commit', 'use_new_idempotency_key'],
  SCHEMA_VALIDATION_FAILED: ['need_revision', 'no_semantic_commit', 'revise_to_advertised_schema'],
  COMPILER_OWNED_FIELD_SUBMITTED: ['need_revision', 'no_semantic_commit', 'remove_compiler_owned_fields'],
  CLIENT_KEY_INVALID: ['need_revision', 'no_semantic_commit', 'revise_local_reference'],
  ACCEPTED_STATE_INTEGRITY_FAILURE: ['fatal', 'no_semantic_commit', 'inspect_read_only_and_recover_manually'],
  SEMANTIC_REVIEW_CANDIDATE_MISSING: ['need_revision', 'no_semantic_commit', 'complete_candidate_review'],
  SEMANTIC_REVIEW_CANDIDATE_UNKNOWN: ['need_revision', 'no_semantic_commit', 'remove_unknown_candidate_reference'],
  ATOMIC_OUTCOME_NOT_SINGLE: ['need_revision', 'no_semantic_commit', 'split_claim_or_test_point'],
  AMBIGUITY_UNRESOLVED: ['need_user_answers', 'commit_artifact', 'answer_defer_or_close_gap'],
  ENTITY_RESOLUTION_UNRESOLVED: ['need_user_answers', 'commit_artifact', 'answer_entity_resolution'],
  ANSWER_BINDING_AMBIGUOUS: ['need_user_answers', 'no_semantic_commit', 'resubmit_unambiguous_bindings'],
  ANSWER_BINDING_INVALID: ['need_user_answers', 'no_semantic_commit', 'revise_answer_units'],
  ANSWER_NATURE_INVALID: ['need_user_answers', 'no_semantic_commit', 'choose_final_or_temporary'],
  TEMPORARY_BASIS_REQUIRED: ['need_user_answers', 'no_semantic_commit', 'provide_temporary_basis_or_choose_final'],
  QUESTION_PART_ACTION_CONFLICT: ['need_user_answers', 'no_semantic_commit', 'remove_conflicting_action'],
  QUESTION_PART_TRANSITION_INVALID: ['protocol_error', 'no_semantic_commit', 'inspect_current_question_state'],
  CONTROL_ORIGIN_REQUIRED: ['need_user_answers', 'no_semantic_commit', 'provide_exact_control_statement'],
  CLARIFICATION_CONFIRMATION_REQUIRED: ['clarification_confirmation_required', 'preview_only', 'confirm_same_preview_digest'],
  CLARIFICATION_CONFIRMATION_INVALID: ['clarification_confirmation_required', 'no_semantic_commit', 'use_registered_confirmation_token'],
  CLARIFICATION_PREVIEW_STALE: ['clarification_confirmation_required', 'no_semantic_commit', 'preview_again'],
  CLARIFICATION_IMPACT_MISMATCH: ['fatal', 'no_semantic_commit', 'inspect_compiler_state_integrity'],
  ORACLE_NOT_DECIDABLE: ['need_revision', 'no_semantic_commit', 'revise_case_draft'],
  ORACLE_SEMANTICS_REQUIRED: ['need_revision', 'no_semantic_commit', 'provide_behavior_oracle_contract'],
  FIELD_CORRESPONDENCE_REQUIRED: ['need_user_answers', 'commit_artifact', 'clarify_field_correspondence'],
  VALUE_STATE_INVALID: ['need_revision', 'no_semantic_commit', 'revise_value_state_axes'],
  COMPLEMENT_COVERAGE_OVERCLAIMED: ['need_revision', 'no_semantic_commit', 'reduce_claim_or_add_proof'],
  DOMAIN_CONTRACT_REQUIRED: ['need_user_answers', 'commit_artifact', 'clarify_domain_contract'],
  POPULATION_CONTRACT_REQUIRED: ['need_user_answers', 'commit_artifact', 'clarify_population_contract'],
  PERMISSION_MATRIX_INCOMPLETE: ['need_revision', 'no_semantic_commit', 'complete_advertised_permission_cells'],
  PERMISSION_OUTCOME_UNRESOLVED: ['need_user_answers', 'commit_artifact', 'clarify_permission_outcome'],
  RISK_LEDGER_INVALID: ['need_revision', 'no_semantic_commit', 'revise_risk_review'],
  PROVENANCE_EDGE_NOT_ALLOWED: ['need_revision', 'no_semantic_commit', 'remove_disallowed_provenance_edge'],
  PROVENANCE_CYCLE: ['need_revision', 'no_semantic_commit', 'remove_provenance_cycle'],
  DOWNSTREAM_ARTIFACT_AS_SOURCE: ['need_artifact', 'no_semantic_commit', 'provide_authoritative_source'],
  CANONICAL_RENDER_MISMATCH: ['fatal', 'no_semantic_commit', 'repair_renderer_and_replay']
});

export const V5_CLARIFICATION_TOKENS = Object.freeze({
  confirmation_tokens: ['确认提交', '确认以上变更'],
  temporary_marker_tokens: ['临时按此口径', '暂按此口径'],
  clone_marker_tokens: ['同一回答适用于', '以下回答同时适用'],
  control_wrapper_punctuation: [':', '：', ',', '，', ';', '；', '.', '。', '!', '！', '?', '？', '、', '(', ')', '（', '）', '[', ']', '【', '】'],
  control_tokens: {
    defer: ['暂缓回答', '稍后回答'],
    unknown: ['目前未知', '暂不清楚'],
    close_for_delivery: ['关闭该问题并继续交付', '保留未解决并继续交付']
  }
});
