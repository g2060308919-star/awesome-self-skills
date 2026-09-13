import { canonicalStringify } from '../canonical.mjs';
import { V5_COMPILER_VERSION, V5_SCHEMA_VERSION } from './constants.mjs';

export const V5_INTERFACE_SCHEMA_FILE_MAP = Object.freeze({
  createRequest: 'v5-create-request',
  advanceRequest: 'v5-advance-request',
  runIdentity: 'v5-run-identity',
  reply: 'v5-reply-oneof'
});

const DIGEST = '^sha256:[0-9a-f]{64}$';
const CLIENT_KEY = '^[A-Za-z][A-Za-z0-9._:-]{0,127}$';
const RUN_ID = '^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$';

/** @typedef {Record<string, any>} JsonSchema */

/** @param {Record<string, any>} properties @param {string[]} [required] @returns {JsonSchema} */
function closedObject(properties, required = Object.keys(properties)) {
  return { type: 'object', required, properties, additionalProperties: false };
}

/** @param {unknown} value */
function constant(value) { return { const: value }; }

/** @param {Record<string, unknown>} item @param {number} [minimum] */
function arrayOf(item, minimum = 0) {
  return { type: 'array', minItems: minimum, items: item };
}

function nonblankString() { return { type: 'string', minLength: 1 }; }
function digestString() { return { type: 'string', pattern: DIGEST }; }
function clientKeyString() { return { type: 'string', pattern: CLIENT_KEY }; }
function integer() { return { type: 'integer' }; }
function nonnegativeInteger() { return { type: 'integer', minimum: 0 }; }
function positiveInteger() { return { type: 'integer', minimum: 1 }; }
function stringArray(minimum = 0) { return arrayOf(nonblankString(), minimum); }
function digestArray(minimum = 0) { return arrayOf(digestString(), minimum); }

/** @param {unknown} value */
/** @param {any} value @returns {JsonSchema} */
function exactValueSchema(value) {
  if (Array.isArray(value)) return {
    type: 'array', minItems: value.length, maxItems: value.length,
    prefixItems: value.map(exactValueSchema), items: false
  };
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    return closedObject(Object.fromEntries(entries.map(([key, child]) => [key, exactValueSchema(child)])), entries.map(([key]) => key));
  }
  return constant(value);
}

function typedValueSchema() {
  return { oneOf: [
    closedObject({ kind: constant('null') }), closedObject({ kind: constant('empty_string') }),
    closedObject({ kind: constant('string'), value: nonblankString() }),
    closedObject({ kind: constant('number'), value: { type: 'number' } }),
    closedObject({ kind: constant('boolean'), value: { type: 'boolean' } })
  ] };
}

function evidenceRefSchema() {
  return { oneOf: [
    closedObject({ kind: constant('claim'), claim_id: nonblankString() }),
    closedObject({ kind: constant('decision'), decision_id: nonblankString() })
  ] };
}

function requirementsEvidenceRefSchema() {
  return { oneOf: [
    ...evidenceRefSchema().oneOf,
    closedObject({ kind: constant('source_unit'), source_unit_id: nonblankString(), source_digest: digestString() })
  ] };
}

function reviewBasisRefSchema() {
  return { oneOf: [
    ...evidenceRefSchema().oneOf,
    closedObject({ kind: constant('source_unit'), source_unit_id: nonblankString() })
  ] };
}

/** @param {string} [contractKind] */
function typedContractRefSchema(contractKind) {
  return closedObject({ contract_id: nonblankString(), contract_kind: contractKind ? constant(contractKind) : nonblankString(), semantic_root_digest: digestString() });
}

function semanticRuleRefSchema() {
  return closedObject({
    source: constant('closed_registry'), registry_digest: digestString(), rule_id: nonblankString(),
    rule_kind: nonblankString(), implementation_digest: digestString()
  });
}

function outcomeSignatureSchema() {
  return closedObject({
    subject_slot_digest: digestString(), condition_slot_digest: digestString(), action_slot_digest: digestString(),
    primary_observation_slot_digest: digestString(), branch_slot_digest: digestString()
  });
}

function sourceSpanSchema() {
  return closedObject({ start_scalar: nonnegativeInteger(), end_scalar: nonnegativeInteger(), excerpt: { type: 'string' }, excerpt_digest: digestString() });
}

function locatorSchema() {
  return { oneOf: [
    closedObject({ kind: constant('inline_text'), media_type: { enum: ['text/plain', 'text/markdown'] }, content: nonblankString() }),
    closedObject({ kind: constant('local_file'), absolute_path: { type: 'string', minLength: 1, pattern: '^/' } }),
    closedObject({ kind: constant('https_url'), url: { type: 'string', minLength: 9, pattern: '^https://' } }),
    closedObject({ kind: constant('attachment'), attachment_ref: nonblankString() })
  ] };
}

function sourceBootstrapSchema() {
  return closedObject({ source_request_seeds: {
    type: 'array', minItems: 1, uniqueItems: true,
    items: closedObject({
      source_request_client_key: clientKeyString(),
      source_role: { enum: ['primary_prd', 'supplemental_requirement', 'technical_contract', 'reference'] },
      locator: locatorSchema(), required: { type: 'boolean' }
    })
  } });
}

function caseDocumentRefSchema() {
  return closedObject({
    run_id: { type: 'string', pattern: RUN_ID }, revision: { type: 'integer', minimum: 0 },
    manifest_digest: digestString(), bundle_digest: digestString(),
    case_document_lineage_id: nonblankString(), schema_version: constant(V5_SCHEMA_VERSION)
  });
}

function createRequestSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'v5-create-request.schema.json',
    oneOf: [
      closedObject({ idempotency_key: nonblankString(), delivery_intent: constant('case_document'), source_bootstrap: sourceBootstrapSchema() }),
      closedObject({ idempotency_key: nonblankString(), delivery_intent: constant('execution_plan'), case_document_ref: caseDocumentRefSchema() }),
      closedObject({ idempotency_key: nonblankString(), creation_reason: constant('resume_cancelled'), parent_run_id: { type: 'string', pattern: RUN_ID } })
    ]
  };
}

function sourceDispositionSchema() {
  return { oneOf: [
    closedObject({ request_id: nonblankString(), outcome: constant('fulfilled'), source_client_keys: { type: 'array', minItems: 1, uniqueItems: true, items: clientKeyString() } }),
    closedObject({ request_id: nonblankString(), outcome: constant('skipped_optional'), skip_reason: { type: 'string', minLength: 1 } })
  ] };
}

function sourceBatchPayloadSchema() {
  const source = closedObject({ source_client_key: clientKeyString(), media_type: { enum: ['text/plain', 'text/markdown'] }, content: nonblankString() });
  return { oneOf: [
    closedObject({ kind: constant('fulfilled_sources'), source_pack: closedObject({ sources: { type: 'array', minItems: 1, uniqueItems: true, items: source } }) }),
    closedObject({ kind: constant('all_skipped_optional') })
  ] };
}

function answerValueContractSchema() {
  return { oneOf: [
    closedObject({ kind: constant('text'), min_scalars: nonnegativeInteger(), max_scalars: positiveInteger(), ambiguity_guard_ref: nonblankString() }, ['kind', 'min_scalars', 'max_scalars']),
    closedObject({ kind: constant('enum'), allowed_values: stringArray(1) }),
    closedObject({ kind: constant('boolean') }),
    closedObject({ kind: constant('integer'), minimum: integer(), maximum: integer() }, ['kind']),
    closedObject({ kind: constant('number'), minimum: { type: 'number' }, maximum: { type: 'number' } }, ['kind']),
    closedObject({ kind: constant('duration_ms'), minimum: positiveInteger(), maximum: positiveInteger() }, ['kind']),
    closedObject({ kind: constant('identifier'), pattern_ref: nonblankString() }),
    closedObject({ kind: constant('set'), member_schema: nonblankString(), min_items: nonnegativeInteger() }),
    closedObject({ kind: constant('mapping'), key_schema: nonblankString(), value_schema: nonblankString() }),
    closedObject({ kind: constant('scope'), allowed_ref_kinds: stringArray(1) }),
    closedObject({ kind: constant('requirements_quantifier'), allowed_values: stringArray(1) }),
    closedObject({
      kind: { enum: ['population_scope', 'population_proof', 'oracle_observation', 'oracle_assertion', 'oracle_scope', 'oracle_window', 'permission_auxiliary'] }, existing_candidates: stringArray(), allow_typed_creation: { type: 'boolean' },
      creation_constraints: closedObject({ allowed_scope_kinds: stringArray(1), semantic_root_digest: digestString() })
    })
  ] };
}

function answerContractSchema() {
  return closedObject({
    answer_mode: constant('typed_answer'), allowed_controls: stringArray(1), value_schema: answerValueContractSchema()
  });
}

function questionImpactSchema(includePartId = false) {
  const compact = /** @type {Record<string,any>} */ ({ affected_case_keys: stringArray(), impact_kinds: stringArray() });
  if (includePartId) compact.question_part_id = nonblankString();
  const detailed = /** @type {Record<string,any>} */ ({
    affected_module_ids: stringArray(), affected_business_refs: stringArray(), affected_claim_ids: stringArray(),
    current_test_point_ids: stringArray(), blocked_count: nonnegativeInteger(), conditional_count: nonnegativeInteger(),
    unresolved_outcome: nonblankString()
  });
  if (includePartId) detailed.question_part_id = nonblankString();
  return { oneOf: [closedObject(compact), closedObject(detailed)] };
}

function claimInputSchema() {
  return closedObject({
    claim_client_key: clientKeyString(), primary_outcome_signature: outcomeSignatureSchema(),
    observation_slot_digests: digestArray(1), subject_ref: nonblankString(), intent_ref: nonblankString(),
    basis: arrayOf(requirementsEvidenceRefSchema(), 1)
  }, ['claim_client_key', 'primary_outcome_signature', 'observation_slot_digests']);
}

function claimOutputSchema() {
  return closedObject({
    claim_id: nonblankString(), primary_outcome_signature: outcomeSignatureSchema(), observation_slot_digests: digestArray(1),
    outcome_candidate_ids: stringArray(1), subject_ref: nonblankString(), intent_ref: nonblankString(), basis: arrayOf(requirementsEvidenceRefSchema(), 1)
  }, ['claim_id', 'primary_outcome_signature', 'observation_slot_digests', 'outcome_candidate_ids']);
}

function sameBatchGapRefSchema() {
  return closedObject({ kind: constant('same_behavior_batch'), semantic_gap_client_key: clientKeyString() });
}

function semanticGapRefSchema() {
  return { oneOf: [
    closedObject({ kind: constant('accepted_gap'), semantic_gap_id: nonblankString() }),
    sameBatchGapRefSchema()
  ] };
}

function requirementsGapSchema() {
  const origin = { oneOf: [
    closedObject({ kind: constant('outcome_decomposition'), outcome_candidate_id: nonblankString() }),
    closedObject({ kind: constant('ambiguity'), ambiguity_candidate_id: nonblankString(), ambiguity_kind: nonblankString() }),
    closedObject({ kind: constant('entity_resolution'), conflict_group_id: nonblankString(), mention_candidate_ids: stringArray(1) })
  ] };
  const target = { oneOf: [closedObject({ origin }), closedObject({ kind: nonblankString(), origin })] };
  return closedObject({
    semantic_gap_client_key: clientKeyString(), target,
    question: nonblankString(), why_needed: nonblankString(), answer_contract: answerContractSchema(),
    question_impact_summary: questionImpactSchema()
  });
}

function decompositionReviewSchema() {
  return closedObject({
    seed_digest: digestString(), candidate_id: nonblankString(), disposition: { oneOf: [
      closedObject({ kind: constant('single_claim'), claim_client_key: clientKeyString() }),
      closedObject({ kind: constant('split_claims'), claim_client_keys: arrayOf(clientKeyString(), 2) }),
      closedObject({ kind: constant('semantic_gap'), semantic_gap_client_key: clientKeyString() }),
      closedObject({ kind: constant('non_normative'), reason: nonblankString(), source_review_id: nonblankString() })
    ] }
  });
}

function ambiguityReviewSchema() {
  return closedObject({
    seed_digest: digestString(), candidate_id: nonblankString(), disposition: { oneOf: [
      closedObject({ kind: constant('resolved_by_claims'), claim_client_keys: arrayOf(clientKeyString(), 1) }),
      closedObject({ kind: constant('not_ambiguous'), claim_client_keys: arrayOf(clientKeyString(), 1), reason: nonblankString() }),
      closedObject({ kind: constant('resolved_by_decision'), decision_ids: stringArray(1) }),
      closedObject({ kind: constant('semantic_gap'), semantic_gap_client_key: clientKeyString() })
    ] }
  });
}

function entityResolutionSchema() {
  const mention = closedObject({ mention_candidate_id: nonblankString(), name_role: { enum: ['canonical_business_name', 'business_alias', 'exact_ui_label'] } });
  const cluster = closedObject({
    entity_client_key: clientKeyString(), canonical_name: nonblankString(), mentions: arrayOf(mention, 1),
    basis_claim_client_keys: arrayOf(clientKeyString()), basis_decision_ids: stringArray()
  });
  return closedObject({
    seed_digest: digestString(), conflict_group_id: nonblankString(), mention_candidate_ids: stringArray(1), resolution: { oneOf: [
      closedObject({ kind: constant('resolved_clusters'), clusters: arrayOf(cluster, 1) }),
      closedObject({ kind: constant('unresolved'), semantic_gap_client_key: clientKeyString() })
    ] }
  });
}

function valueStateSchema() {
  const dataState = { oneOf: [
    closedObject({ presence: constant('missing') }),
    closedObject({ presence: constant('present'), value: typedValueSchema() })
  ] };
  const content = { oneOf: [
    closedObject({ kind: constant('empty') }),
    closedObject({ kind: constant('text'), value: nonblankString() }),
    closedObject({ kind: constant('formatted_value'), value: nonblankString(), format_ref: nonblankString() })
  ] };
  const renderState = { oneOf: [
    closedObject({ presence: constant('not_rendered') }),
    closedObject({ presence: constant('rendered'), content })
  ] };
  return { oneOf: [
    closedObject({ axes: constant('data_only'), data_state: dataState }),
    closedObject({ axes: constant('render_only'), render_state: renderState }),
    closedObject({ axes: constant('data_and_render'), data_state: dataState, render_state: renderState })
  ] };
}

function fieldCorrespondenceSchema() {
  const side = closedObject({ semantic_role: { enum: ['ui', 'authoritative_source', 'peer_surface'] }, logical_surface_ref: nonblankString(), collection_path: nonblankString(), item_field_path: nonblankString() });
  const join = { oneOf: [
    closedObject({ kind: constant('singleton') }),
    closedObject({ kind: constant('key_equality'), left_key_path: nonblankString(), right_key_path: nonblankString(), cardinality: { enum: ['one_to_one', 'many_to_one', 'one_to_many'] }, key_normalization_ref: semanticRuleRefSchema() }, ['kind', 'left_key_path', 'right_key_path', 'cardinality'])
  ] };
  const transform = { oneOf: [closedObject({ kind: constant('identity') }), closedObject({ kind: constant('registered'), transform_ref: semanticRuleRefSchema() })] };
  const comparison = { oneOf: [closedObject({ kind: constant('strict_equal') }), closedObject({ kind: constant('normalized_equal'), normalization_ref: semanticRuleRefSchema() })] };
  const freshness = { oneOf: [closedObject({ kind: constant('same_logical_snapshot') }), closedObject({ kind: constant('within_business_window'), duration_ms: positiveInteger() })] };
  return closedObject({ mapping_client_key: clientKeyString(), authority_side: { enum: ['left', 'right'] }, left: side, right: side, join, transform, comparison, null_policy_ref: semanticRuleRefSchema(), freshness, basis: arrayOf(evidenceRefSchema(), 1) });
}

function predicateContractSchema() {
  return closedObject({ predicate_contract_client_key: clientKeyString(), predicate_ref: typedContractRefSchema('domain_predicate'), mutual_exclusion_group: nonblankString(), exhaustiveness: { enum: ['closed_partition_set', 'non_exhaustive_open_set'] }, basis: arrayOf(evidenceRefSchema(), 1) });
}

function domainContractSchema() {
  const domain = { oneOf: [
    closedObject({ kind: constant('closed_enum'), members: arrayOf(typedValueSchema(), 1), closed_world_basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ kind: constant('predicate_partition'), universe_ref: typedContractRefSchema('universe'), boundary_basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ kind: constant('open_domain'), boundary_description: nonblankString(), boundary_basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
  const partition = { oneOf: [
    closedObject({ partition_client_key: clientKeyString(), kind: constant('exact_members'), semantic_role: { enum: ['target', 'other'] }, values: arrayOf(typedValueSchema(), 1) }),
    closedObject({ partition_client_key: clientKeyString(), kind: constant('complement'), semantic_role: constant('complement'), universe: closedObject({ kind: constant('parent_domain') }), excluded_values: arrayOf(typedValueSchema()) }),
    closedObject({ partition_client_key: clientKeyString(), kind: constant('predicate'), semantic_role: { enum: ['target', 'other'] }, predicate_contract_client_key: clientKeyString() })
  ] };
  return closedObject({ domain_client_key: clientKeyString(), subject_ref: nonblankString(), field_path: nonblankString(), domain, partitions: arrayOf(partition, 1) });
}

function populationScopeSchema() {
  const optionalFilter = { filter_ref: typedContractRefSchema('filter') };
  return { oneOf: [
    closedObject({ kind: constant('single_item'), identity_contract_ref: typedContractRefSchema('identity') }),
    closedObject({ kind: constant('visible_region'), region_contract_ref: typedContractRefSchema('region') }),
    closedObject({ kind: constant('current_page'), collection_ref: typedContractRefSchema('collection'), ...optionalFilter }, ['kind', 'collection_ref']),
    closedObject({ kind: constant('current_response'), collection_ref: typedContractRefSchema('collection'), ...optionalFilter }, ['kind', 'collection_ref']),
    closedObject({ kind: constant('all_pages'), collection_ref: typedContractRefSchema('collection'), filter_ref: typedContractRefSchema('filter'), page_model_ref: typedContractRefSchema('page_model'), termination_contract_ref: typedContractRefSchema('termination'), consistency_contract_ref: typedContractRefSchema('consistency') }, ['kind', 'collection_ref', 'page_model_ref', 'termination_contract_ref', 'consistency_contract_ref']),
    closedObject({ kind: constant('full_dataset'), universe_ref: typedContractRefSchema('universe'), snapshot_contract_ref: typedContractRefSchema('snapshot'), consistency_contract_ref: typedContractRefSchema('consistency'), filter_ref: typedContractRefSchema('filter'), tenant_or_region_ref: typedContractRefSchema('tenant_or_region') }, ['kind', 'universe_ref', 'snapshot_contract_ref', 'consistency_contract_ref'])
  ] };
}

function populationContractSchema() {
  return closedObject({ population_contract_client_key: clientKeyString(), scope: populationScopeSchema() });
}

function populationProofSchema() {
  return { oneOf: [
    closedObject({ proof_client_key: clientKeyString(), population_contract_client_key: clientKeyString(), payload: closedObject({ kind: constant('enumerate_population'), enumeration_contract_ref: typedContractRefSchema('enumeration') }) }),
    closedObject({ proof_client_key: clientKeyString(), population_contract_client_key: clientKeyString(), payload: closedObject({ kind: constant('authoritative_aggregate'), aggregate_contract_ref: typedContractRefSchema('aggregate') }), basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ proof_client_key: clientKeyString(), population_contract_client_key: clientKeyString(), payload: closedObject({ kind: constant('sourced_invariant'), invariant_contract_ref: typedContractRefSchema('invariant') }), basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
}

function observationRefSchema() {
  const common = { logical_surface_ref: nonblankString(), subject_ref: nonblankString(), field_path: nonblankString() };
  return { oneOf: [
    closedObject({ kind: constant('ui'), ...common, locator_contract_ref: semanticRuleRefSchema() }, ['kind', 'logical_surface_ref', 'subject_ref', 'locator_contract_ref']),
    ...['response', 'storage', 'event', 'system_state'].map((kind) => closedObject({ kind: constant(kind), ...common }, ['kind', 'logical_surface_ref', 'subject_ref']))
  ] };
}

function actionRefSchema() { return closedObject({ action_id: nonblankString(), semantic_root_digest: digestString() }); }

/** @param {string} contractKind */
function acceptedOrBatchContractRefSchema(contractKind) {
  return { oneOf: [
    closedObject({ kind: constant('accepted'), ref: typedContractRefSchema(contractKind) }),
    closedObject({ kind: constant('same_behavior_batch'), contract_client_key: clientKeyString(), contract_kind: constant(contractKind) })
  ] };
}

function oracleAssertionSchema() {
  const normalization = semanticRuleRefSchema();
  const decisionCellRef = closedObject({ matrix_id: nonblankString(), required_cell_key: nonblankString() });
  return { oneOf: [
    closedObject({ kind: constant('exact_text'), expected_text: nonblankString() }),
    closedObject({ kind: constant('semantic_text'), expected_text: nonblankString(), equivalence_rule_ref: semanticRuleRefSchema() }),
    closedObject({ kind: constant('value_equals'), expected_value: typedValueSchema(), normalization_ref: normalization }, ['kind', 'expected_value']),
    closedObject({ kind: constant('value_state_equals'), expected_value_state: valueStateSchema() }),
    closedObject({ kind: constant('exists') }), closedObject({ kind: constant('absent') }),
    closedObject({ kind: constant('set_contains'), expected_members: arrayOf(typedValueSchema(), 1), normalization_ref: normalization }),
    closedObject({ kind: constant('set_equals'), expected_members: arrayOf(typedValueSchema()), order_sensitive: { type: 'boolean' }, normalization_ref: normalization }),
    closedObject({ kind: constant('count_equals'), expected_count: nonnegativeInteger() }),
    closedObject({ kind: constant('count_at_least'), minimum_count: nonnegativeInteger() }),
    closedObject({ kind: constant('transition'), from_state: typedValueSchema(), to_state: typedValueSchema(), trigger_action_ref: actionRefSchema(), trigger_step_client_key: clientKeyString() }, ['kind', 'from_state', 'to_state', 'trigger_action_ref']),
    closedObject({ kind: constant('cross_surface_equals'), field_correspondence_id: nonblankString() }),
    closedObject({ kind: constant('permission'), expected: constant('allow'), decision_cell_ref: decisionCellRef }),
    closedObject({ kind: constant('permission'), expected: constant('deny'), decision_cell_ref: decisionCellRef, denial_behavior: { oneOf: [
      closedObject({ kind: constant('not_required') }),
      closedObject({ kind: constant('required'), denial_required_cell_key: nonblankString(), denial_contract_ref: acceptedOrBatchContractRefSchema('denial_behavior') })
    ] } })
  ] };
}

function observationWindowSchema() {
  return { oneOf: [
    closedObject({ kind: constant('after_step') }),
    closedObject({ kind: constant('within'), duration_ms: positiveInteger() }),
    closedObject({ kind: constant('stable_for'), duration_ms: positiveInteger() }),
    closedObject({ kind: constant('until_signal'), signal_ref: nonblankString(), timeout_ms: positiveInteger() })
  ] };
}

function oracleSemanticContractSchema() {
  return closedObject({
    oracle_contract_client_key: clientKeyString(), formal_test_point_id: nonblankString(), observation_ref: observationRefSchema(),
    assertion: oracleAssertionSchema(), evaluation_scope: { oneOf: [
      closedObject({ kind: constant('single') }),
      closedObject({ kind: constant('forall'), population_contract_client_key: clientKeyString(), population_proof_client_key: clientKeyString() })
    ] }, observation_window: observationWindowSchema(), basis: arrayOf(evidenceRefSchema(), 1)
  });
}

function permissionAuxiliaryContractSchema() {
  const target = closedObject({ matrix_id: nonblankString(), required_cell_key: nonblankString() });
  return { oneOf: [
    closedObject({ contract_client_key: clientKeyString(), permission_target: target, payload: closedObject({ contract_kind: constant('denial_behavior'), observation_ref: observationRefSchema(), assertion: oracleAssertionSchema(), observation_window: observationWindowSchema() }), basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ contract_client_key: clientKeyString(), permission_target: target, payload: closedObject({ contract_kind: constant('data_scope'), scope: populationScopeSchema() }), basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
}

function permissionOutcomeSchema() {
  return { oneOf: [
    closedObject({ permission_dimension: constant('decision'), action_ref: nonblankString(), expected: { enum: ['visible', 'hidden', 'allow', 'deny'] } }),
    closedObject({ permission_dimension: constant('denial_behavior'), decision_cell_key: nonblankString(), denial_contract_ref: acceptedOrBatchContractRefSchema('denial_behavior') }),
    closedObject({ permission_dimension: constant('data_scope'), data_scope_contract_ref: acceptedOrBatchContractRefSchema('data_scope') })
  ] };
}

function permissionMatrixReviewSchema() {
  const disposition = { oneOf: [
    closedObject({ kind: constant('formal'), outcome: permissionOutcomeSchema(), basis: arrayOf(evidenceRefSchema(), 1) }),
    closedObject({ kind: constant('semantic_gap'), gap_ref: semanticGapRefSchema() }),
    closedObject({ kind: constant('not_applicable'), basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
  return closedObject({ matrix_id: nonblankString(), seed_digest: digestString(), cell_dispositions: arrayOf(closedObject({ required_cell_key: nonblankString(), disposition })) });
}

function riskReviewSchema() {
  const commonItem = {
    candidate_client_key: clientKeyString(), trigger_basis: arrayOf(reviewBasisRefSchema(), 1), affected_refs: stringArray(1),
    why_material: nonblankString(), recommended_action: nonblankString(), severity: { enum: ['low', 'medium', 'high', 'critical'] },
    likelihood: { enum: ['low', 'medium', 'high'] }, evidence_confidence: { enum: ['low', 'medium', 'high'] }, testability: { enum: ['low', 'medium', 'high'] }
  };
  const item = { oneOf: [
    closedObject({ ...commonItem, risk_disposition: constant('formal_requirement'), formal_claim_id: nonblankString() }),
    closedObject({ ...commonItem, risk_disposition: constant('semantic_gap'), gap_ref: semanticGapRefSchema() }),
    closedObject({ ...commonItem, risk_disposition: constant('exploratory'), observation_intent: nonblankString() }),
    closedObject({ ...commonItem, risk_disposition: constant('not_applicable'), exclusion_basis: arrayOf(evidenceRefSchema(), 1) })
  ] };
  const common = { review_client_key: clientKeyString(), module_ref: nonblankString(), risk_kind: nonblankString(), review_basis: arrayOf(reviewBasisRefSchema(), 1) };
  return { oneOf: [
    closedObject({ ...common, risk_signal_status: constant('no_signal') }),
    closedObject({ ...common, risk_signal_status: constant('signal_found'), risk_item: item })
  ] };
}

function behaviorGapSchema() {
  const target = { oneOf: [
    closedObject({ kind: constant('behavior_contract'), required_contract_key: nonblankString() }),
    closedObject({ kind: constant('permission_cell'), matrix_id: nonblankString(), required_cell_key: nonblankString() }),
    closedObject({ kind: constant('risk'), module_ref: nonblankString(), risk_kind: nonblankString() })
  ] };
  return closedObject({
    semantic_gap_client_key: clientKeyString(), target, missing_semantics: nonblankString(), question: nonblankString(),
    answer_contract: answerContractSchema(), basis: arrayOf(evidenceRefSchema(), 1), why_needed: nonblankString(),
    question_impact_summary: questionImpactSchema()
  }, ['semantic_gap_client_key', 'target', 'missing_semantics', 'question', 'answer_contract', 'basis']);
}

function behaviorReviewSchema() {
  return closedObject({ seed_digest: digestString(), required_contract_key: nonblankString(), disposition: { oneOf: [
    closedObject({ kind: constant('formal'), contract_client_keys: arrayOf(clientKeyString(), 1) }),
    closedObject({ kind: constant('semantic_gap'), gap_ref: semanticGapRefSchema() }),
    closedObject({ kind: constant('not_applicable'), basis: arrayOf(evidenceRefSchema(), 1) })
  ] } });
}

function behaviorEquivalenceSchema() {
  return closedObject({
    equivalence_contract_client_key: clientKeyString(), domain_contract_client_key: clientKeyString(), partition_client_key: clientKeyString(),
    formal_test_point_id: nonblankString(), oracle_semantic_contract_client_key: clientKeyString(),
    equivalence_scope: constant('all_members_same_observable_behavior'), basis: arrayOf(evidenceRefSchema(), 1)
  });
}

function typedOracleSchema() {
  return closedObject({
    oracle_client_key: clientKeyString(), oracle_semantic_contract_id: nonblankString(), observe_after_step_client_key: clientKeyString(),
    observation_ref: observationRefSchema(), assertion: oracleAssertionSchema(), evaluation_scope: { oneOf: [
      closedObject({ kind: constant('single') }),
      closedObject({ kind: constant('forall'), population_contract_id: nonblankString(), population_proof_id: nonblankString() })
    ] }, observation_window: observationWindowSchema(), claim_ids: stringArray(1)
  });
}

function selectionMembershipSchema() {
  return { oneOf: [
    closedObject({ kind: constant('closed_domain_membership') }),
    closedObject({ kind: constant('decidable_predicate'), predicate_contract_id: nonblankString() }),
    closedObject({ kind: constant('membership_witnesses'), witnesses: arrayOf(closedObject({ selected_value_digest: digestString(), basis: arrayOf(evidenceRefSchema(), 1) }), 1) })
  ] };
}

function domainSelectionSchema() {
  const selection = { oneOf: [
    closedObject({ kind: constant('exhaustive_members'), selected_values: arrayOf(typedValueSchema(), 1), membership: closedObject({ kind: constant('closed_domain_membership') }) }),
    closedObject({ kind: constant('representative'), selected_values: arrayOf(typedValueSchema(), 1), behavior_equivalence_contract_id: nonblankString(), membership: selectionMembershipSchema() }),
    closedObject({ kind: constant('sampled'), selected_values: arrayOf(typedValueSchema(), 1), residual_risk: nonblankString(), membership: selectionMembershipSchema() })
  ] };
  return closedObject({
    selection_client_key: clientKeyString(), case_client_key: clientKeyString(), formal_test_point_id: nonblankString(),
    oracle_semantic_contract_id: nonblankString(), domain_contract_id: nonblankString(), partition_id: nonblankString(), selection
  });
}

function caseDraftSchema() {
  const ordering = closedObject({
    business_flow_ref: { oneOf: [nonblankString(), { type: 'null' }] },
    page_action_ref: { oneOf: [nonblankString(), { type: 'null' }] }
  });
  const step = closedObject({ step_client_key: clientKeyString(), action: nonblankString() });
  const binding = closedObject({ case_client_key: clientKeyString(), step_client_key: clientKeyString(), action_ref: actionRefSchema() });
  const precondition = closedObject({ precondition_id: nonblankString(), description: nonblankString() });
  const dataCondition = closedObject({ condition_id: nonblankString(), description: nonblankString() });
  const semanticEffect = closedObject({
    effect_id: nonblankString(), kind: nonblankString(), subject: nonblankString(), before: nonblankString(),
    after: nonblankString(), claim_ids: stringArray(1)
  }, ['effect_id', 'kind', 'subject', 'after', 'claim_ids']);
  const comparisonContract = { oneOf: [
    closedObject({ kind: constant('all_observable_behavior_except'), exceptions: stringArray() }),
    closedObject({ kind: constant('selected_dimensions'), dimensions: stringArray(1), allowed_differences: stringArray() })
  ] };
  const baselineSpec = closedObject({
    baseline_id: nonblankString(), kind: constant('declared_reference'), acquisition: constant('capture_at_execution'),
    reference: nonblankString(), comparison_contract: comparisonContract, claim_ids: stringArray(1)
  });
  const derivation = closedObject({ method_id: nonblankString(), method_version: nonblankString(), inputs_digest: digestString() });
  const valueOrigin = { oneOf: [
    closedObject({ kind: constant('requirement'), claim_ids: stringArray(1) }),
    closedObject({ kind: constant('example'), claim_ids: stringArray(1), replaceable: constant(true) }),
    closedObject({ kind: constant('derived'), input_claim_ids: stringArray(1), derivation, evidence_level: constant('derived') }),
    closedObject({
      kind: constant('temporary_assumption'), assumption_id: nonblankString(), semantic_gap_ids: stringArray(1),
      reason: nonblankString(), requires_case_status: constant('Conditional')
    })
  ] };
  const testValue = closedObject({
    value_id: nonblankString(), subject_ref: nonblankString(),
    field_path: { type: 'string', pattern: '^(?:/(?:[^~/]|~[01])*)+$' }, value: {},
    used_by_refs: stringArray(1), value_origin: valueOrigin
  });
  return closedObject({
    case_client_key: clientKeyString(), title: nonblankString(), module_id: nonblankString(), priority: { enum: ['P0', 'P1', 'P2', 'P3'] },
    ordering, acceptance_role: { enum: ['primary_acceptance', 'dependency_contract', 'context_only'] }, fact_ids: stringArray(1),
    primary_test_point_id: nonblankString(), supporting_observation_ids: stringArray(),
    business_preconditions: arrayOf(precondition), data_conditions: arrayOf(dataCondition), steps: arrayOf(step, 1),
    case_step_semantic_bindings: arrayOf(binding, 1), domain_selections: arrayOf(domainSelectionSchema()), oracles: arrayOf(typedOracleSchema(), 1),
    semantic_effects: arrayOf(semanticEffect, 1), baseline_spec: baselineSpec, test_values: arrayOf(testValue, 1)
  }, [
    'case_client_key', 'title', 'module_id', 'priority', 'ordering', 'acceptance_role', 'fact_ids',
    'primary_test_point_id', 'supporting_observation_ids', 'business_preconditions', 'data_conditions', 'steps',
    'case_step_semantic_bindings', 'domain_selections', 'oracles'
  ]);
}

function evidenceArtifactSchema() {
  return closedObject({
    semantic_review_seed_digest: digestString(), claims: arrayOf(claimInputSchema()), semantic_gaps: arrayOf(requirementsGapSchema()),
    decomposition_reviews: arrayOf(decompositionReviewSchema()), ambiguity_reviews: arrayOf(ambiguityReviewSchema()),
    entity_resolutions: arrayOf(entityResolutionSchema())
  });
}

function behaviorArtifactSchema() {
  return closedObject({
    behavior_contract_seed_digest: digestString(), field_correspondences: arrayOf(fieldCorrespondenceSchema()), value_states: arrayOf(valueStateSchema()),
    predicate_contracts: arrayOf(predicateContractSchema()), domain_contracts: arrayOf(domainContractSchema()),
    behavior_equivalence_contracts: arrayOf(behaviorEquivalenceSchema()), population_contracts: arrayOf(populationContractSchema()),
    population_proofs: arrayOf(populationProofSchema()), permission_auxiliary_contracts: arrayOf(permissionAuxiliaryContractSchema()),
    oracle_semantic_contracts: arrayOf(oracleSemanticContractSchema()), behavior_contract_reviews: arrayOf(behaviorReviewSchema()),
    permission_matrix_reviews: arrayOf(permissionMatrixReviewSchema()), risk_reviews: arrayOf(riskReviewSchema()),
    semantic_gap_proposals: arrayOf(behaviorGapSchema())
  });
}

/** @param {string} artifactKind */
function artifactRootSchema(artifactKind) {
  if (artifactKind === 'evidence_claims') return evidenceArtifactSchema();
  if (artifactKind === 'behavior_views') return behaviorArtifactSchema();
  if (artifactKind === 'case_drafts') return closedObject({ case_drafts: arrayOf(caseDraftSchema(), 1) });
  throw new Error(`Unknown Agent artifact kind: ${artifactKind}`);
}

function originRangeSchema() {
  return closedObject({ start_scalar: { type: 'integer', minimum: 0 }, end_scalar: { type: 'integer', minimum: 0 } });
}

function scalarAnswerValueSchema() {
  return { oneOf: [
    ...['text', 'enum', 'identifier'].map((kind) => closedObject({ kind: constant(kind), value: nonblankString() })),
    closedObject({ kind: constant('boolean'), value: { type: 'boolean' } }),
    closedObject({ kind: constant('integer'), value: { type: 'integer' } }),
    closedObject({ kind: constant('number'), value: { type: 'number' } }),
    closedObject({ kind: constant('duration_ms'), value: { type: 'integer', minimum: 1 } })
  ] };
}

function answerValueSchema() {
  const scalar = scalarAnswerValueSchema();
  return { oneOf: [
    ...scalar.oneOf,
    closedObject({ kind: constant('set'), members: arrayOf(scalar) }),
    closedObject({ kind: constant('mapping'), entries: arrayOf(closedObject({ from: scalar, to: scalar })) }),
    closedObject({ kind: constant('scope'), included_refs: arrayOf(nonblankString()), excluded_refs: arrayOf(nonblankString()) }),
    closedObject({ kind: constant('requirements_quantifier'), value: { enum: ['one', 'some', 'all', 'none'] } })
  ] };
}

function proposedAnswerSchema() {
  return { oneOf: [
    closedObject({ value: answerValueSchema(), source_text: nonblankString(), nature: constant('final') }),
    closedObject({ value: answerValueSchema(), source_text: nonblankString(), nature: constant('temporary'), temporary_basis: closedObject({ message_digest: digestString(), range: originRangeSchema(), excerpt: nonblankString(), excerpt_digest: digestString() }) })
  ] };
}

function clarificationUnitSchema() {
  const origin = closedObject({ message_digest: digestString(), range: originRangeSchema(), excerpt: nonblankString(), excerpt_digest: digestString() });
  const target = closedObject({ display_token: nonblankString(), question_part_id: nonblankString(), root_version_digest: digestString() });
  const base = { unit_client_key: clientKeyString(), origin, target };
  return { oneOf: [
    closedObject({ ...base, action: { enum: ['defer', 'unknown', 'close_for_delivery'] } }),
    closedObject({ ...base, shared_origin_group_id: clientKeyString(), action: constant('answer'), answer: proposedAnswerSchema() }, ['unit_client_key', 'origin', 'target', 'shared_origin_group_id', 'action', 'answer']),
    closedObject({ ...base, action: constant('answer'), answer: proposedAnswerSchema() })
  ] };
}

function executionOperationSchema() {
  return { oneOf: [
    closedObject({ kind: constant('set_execution_disposition'), case_id: nonblankString(), disposition: { enum: ['execute', 'do_not_execute'] } }),
    closedObject({ kind: constant('provide_capability_proof'), case_id: nonblankString(), proof: closedObject({ type: nonblankString(), value: nonblankString() }) }),
    closedObject({ kind: constant('pause_execution') }),
    closedObject({ kind: constant('confirm_execution_plan') })
  ] };
}

function advanceRequestSchema() {
  const token = nonblankString();
  const actionBranches = [
    closedObject({ kind: constant('cancel_run'), action_token: token, reason: nonblankString() }),
    closedObject({ kind: constant('submit_source_batch'), action_token: token, request_ids: { type: 'array', minItems: 1, uniqueItems: true, items: nonblankString() }, request_dispositions: { type: 'array', minItems: 1, uniqueItems: true, items: sourceDispositionSchema() }, source_payload: sourceBatchPayloadSchema() }),
    ...['evidence_claims', 'behavior_views', 'case_drafts'].map((artifactKind) => closedObject({ kind: constant('submit_artifact'), action_token: token, artifact_kind: constant(artifactKind), artifact: artifactRootSchema(artifactKind) })),
    closedObject({ kind: constant('preview_clarification_response'), action_token: token, presentation_id: nonblankString(), semantic_root_digest: digestString(), preview_intent: { enum: ['apply_units', 'discard_pending'] }, raw_response: { type: 'string' }, proposed_units: arrayOf(clarificationUnitSchema()) }),
    closedObject({ kind: constant('commit_clarification_response'), action_token: token, presentation_id: nonblankString(), semantic_root_digest: digestString(), preview_digest: digestString(), raw_confirmation: nonblankString(), confirmation_range: originRangeSchema() }),
    closedObject({ kind: constant('advance_execution_plan'), action_token: token, operation: executionOperationSchema() })
  ];
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'v5-advance-request.schema.json',
    type: 'object', required: ['idempotency_key', 'action'],
    properties: { idempotency_key: nonblankString(), action: { oneOf: actionBranches } }, additionalProperties: false
  };
}

function resumeLineageSchema() {
  const acceptedSourceState = { oneOf: [
    closedObject({ kind: constant('none') }),
    closedObject({ kind: constant('accepted'), accepted_source_state_digest: digestString() })
  ] };
  const resumeBase = { oneOf: [
    closedObject({ kind: constant('source_checkpoint'), parent_checkpoint_digest: digestString(), source_acquisition_state_digest: digestString(), accepted_source_state: acceptedSourceState }),
    closedObject({ kind: constant('case_semantic_checkpoint'), parent_checkpoint_digest: digestString(), semantic_root_digest: digestString(), accepted_artifact_digests: arrayOf(digestString()) }),
    closedObject({ kind: constant('execution_checkpoint'), parent_checkpoint_digest: digestString(), case_document_ref: caseDocumentRefSchema(), execution_snapshot_digest: digestString(), accepted_execution_receipt_digests: arrayOf(digestString()) })
  ] };
  return closedObject({
    creation_reason: constant('resume_cancelled'), parent_run_id: { type: 'string', pattern: RUN_ID },
    parent_cancel_event_digest: digestString(), resume_base: resumeBase
  });
}

function runIdentitySchema() {
  const common = {
    kind: constant('v5_run_identity'), schema_version: constant(V5_SCHEMA_VERSION), compiler_version: constant(V5_COMPILER_VERSION),
    run_id: { type: 'string', pattern: RUN_ID }, run_directory_key: { type: 'string', pattern: RUN_ID },
    delivery_intent: { enum: ['case_document', 'execution_plan'] }, case_document_lineage_id: nonblankString(),
    canonical_create_request_digest: digestString(), run_identity_digest: digestString()
  };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'v5-run-identity.schema.json',
    oneOf: [
      closedObject({ ...common, delivery_intent: constant('case_document'), creation_binding: closedObject({ kind: constant('case_document'), source_bootstrap_digest: digestString(), source_acquisition_policy_digest: digestString() }) }),
      closedObject({ ...common, delivery_intent: constant('execution_plan'), creation_binding: closedObject({ kind: constant('execution_plan'), case_document_ref: caseDocumentRefSchema() }) }),
      closedObject({ ...common, creation_binding: resumeLineageSchema() })
    ]
  };
}

/** @param {string} errorCode */
function diagnosticSchema(errorCode) {
  return closedObject({
    code: constant(errorCode), json_pointer: nonblankString(), affected_refs: arrayOf(nonblankString()), message: nonblankString()
  }, ['code', 'affected_refs', 'message']);
}

/** @param {Record<string,any>} template */
function capabilitySchema(template) {
  if (template.kind === 'cancel_run') return closedObject({ kind: constant('cancel_run') });
  if (template.kind === 'submit_artifact') return closedObject({ kind: constant('submit_artifact'), artifact_kind: constant(template.artifact_kind) });
  if (template.kind === 'submit_source_batch') return closedObject({ kind: constant('submit_source_batch'), request_ids: { type: 'array', minItems: 1, uniqueItems: true, items: nonblankString() } });
  if (template.kind === 'preview_clarification_response') return closedObject({ kind: constant(template.kind), presentation_id: nonblankString(), semantic_root_digest: digestString() });
  if (template.kind === 'commit_clarification_response') return closedObject({ kind: constant(template.kind), presentation_id: nonblankString(), semantic_root_digest: digestString(), preview_digest: digestString() });
  if (template.kind === 'advance_execution_plan') return closedObject({ kind: constant(template.kind), allowed_operation_kinds: { type: 'array', minItems: 1, uniqueItems: true, items: { enum: ['confirm_execution_plan', 'pause_execution', 'provide_capability_proof', 'set_execution_disposition'] } } });
  throw new Error(`Unknown reply action template: ${template.kind}`);
}

/** @param {Array<Record<string,any>>} templates */
function selectorsSchema(templates) {
  if (templates.length === 0) return { type: 'array', maxItems: 0, items: false };
  return {
    type: 'array', minItems: templates.length, maxItems: templates.length, uniqueItems: true,
    items: { oneOf: templates.map((template) => closedObject({ capability: capabilitySchema(template), action_token: nonblankString() })) }
  };
}

function sourceRequestSchema() {
  return closedObject({
    request_id: nonblankString(), source_request_client_key: clientKeyString(), source_role: { enum: ['primary_prd', 'supplemental_requirement', 'technical_contract', 'reference'] },
    locator: locatorSchema(), required: { type: 'boolean' }
  });
}

function acceptedSourceContextSchema() {
  const source = closedObject({ media_type: { enum: ['text/plain', 'text/markdown'] }, content: { type: 'string' }, source_object_digest: digestString() });
  const pack = closedObject({ artifact_digest: digestString(), accepted_revision: nonnegativeInteger(), payload: closedObject({ sources: arrayOf(source, 1) }) });
  return closedObject({ accepted_source_state_digest: digestString(), source_packs: arrayOf(pack, 1) });
}

function semanticRuleIndexSchema() {
  const registeredRule = closedObject({ rule_id: nonblankString(), rule_kind: { enum: ['locator', 'key_normalization', 'transform', 'value_normalization', 'null_policy', 'semantic_equivalence'] }, implementation_digest: digestString() });
  return closedObject({
    semantic_root_digest: digestString(), registry_digest: digestString(), registered_rules: arrayOf(registeredRule),
    accepted_rule_contract_refs: arrayOf(typedContractRefSchema()), index_digest: digestString()
  });
}

/** @param {Record<string,any>} contracts */
function compilerRulesSchema(contracts) {
  return closedObject({
    rules_bundle_digest: constant(contracts.replyContracts.rules_bundle_digest),
    answer_constraint_registry: exactValueSchema(contracts.answerConstraintRegistry),
    clarification_control_registry: exactValueSchema(contracts.clarificationControlRegistry),
    source_acquisition_policy: exactValueSchema(contracts.sourceAcquisitionPolicy),
    permission_derivation_registry: exactValueSchema(contracts.permissionDerivationRegistry),
    semantic_rule_index_projection: { oneOf: [
      closedObject({ kind: constant('not_available_before_behavior') }),
      closedObject({ kind: constant('available'), index: semanticRuleIndexSchema() })
    ] }
  });
}

function semanticSeedSchema() {
  const ambiguity = closedObject({ candidate_id: nonblankString(), locator_id: nonblankString(), source_span: sourceSpanSchema(), ambiguity_kind: nonblankString(), detector_codes: stringArray(1) });
  const outcome = closedObject({
    candidate_id: nonblankString(), locator_id: nonblankString(), source_span: sourceSpanSchema(), compound_signal_codes: stringArray(),
    atom_signature: outcomeSignatureSchema(), required_observation_slot_digests: digestArray(1)
  });
  const unit = closedObject({ unit_id: nonblankString(), locator_id: nonblankString(), unit_digest: digestString(), outcome_candidates: arrayOf(outcome, 1) });
  const mention = closedObject({ candidate_id: nonblankString(), conflict_group_id: nonblankString(), locator_id: nonblankString(), observed_name: nonblankString(), source_span: sourceSpanSchema() });
  const conflict = closedObject({ conflict_group_id: nonblankString(), mention_candidate_ids: stringArray(1) });
  const requirementRef = closedObject({ kind: constant('requirements_ref'), ref: requirementsEvidenceRefSchema() });
  const decisionDefined = closedObject({ kind: constant('decision_defined'), canonical_name: nonblankString() });
  const coordinateValue = { oneOf: [nonblankString(), closedObject({ context_key: nonblankString() }), requirementRef, decisionDefined] };
  const coordinateEvidence = { oneOf: [
    closedObject({ evidence_kind: constant('source'), coordinate: nonblankString(), value: coordinateValue, locator_id: nonblankString(), source_span: sourceSpanSchema(), coordinate_evidence_digest: digestString() }),
    closedObject({ evidence_kind: constant('decision'), coordinate: nonblankString(), value: coordinateValue, decision_id: nonblankString(), answer_value_digest: digestString(), coordinate_evidence_digest: digestString() })
  ] };
  const slots = closedObject({ role_candidates: arrayOf(coordinateEvidence), resource_candidates: arrayOf(coordinateEvidence), action_candidates: arrayOf(coordinateEvidence), context_candidates: arrayOf(coordinateEvidence) });
  const permission = closedObject({ candidate_id: nonblankString(), scope_group_id: nonblankString(), locator_id: nonblankString(), source_span: sourceSpanSchema(), coordinate_slots: slots, signaled_dimensions: arrayOf(coordinateEvidence, 1), detector_codes: stringArray(1) });
  const permissionGroup = closedObject({ scope_group_id: nonblankString(), permission_scope_candidate_ids: stringArray(1) });
  return closedObject({
    accepted_source_state_digest: digestString(), normative_units: arrayOf(unit, 1), ambiguity_candidates: arrayOf(ambiguity),
    outcome_dedup_groups: { type: 'array', maxItems: 0, items: false }, entity_mention_candidates: arrayOf(mention),
    entity_conflict_groups: arrayOf(conflict), permission_scope_candidates: arrayOf(permission), permission_scope_groups: arrayOf(permissionGroup),
    permission_derivation_registry_digest: digestString(), seed_digest: digestString()
  });
}

function semanticPayloadSchema() {
  return closedObject({
    semantic_review_seed_digest: digestString(), claims: arrayOf(claimOutputSchema()), semantic_gaps: arrayOf(requirementsGapSchema()),
    decomposition_reviews: arrayOf(decompositionReviewSchema()), ambiguity_reviews: arrayOf(ambiguityReviewSchema()), entity_resolutions: arrayOf(entityResolutionSchema())
  });
}

function termRegistrySchema() {
  const entry = closedObject({
    entity_id: nonblankString(), canonical_name: nonblankString(), alias_names: stringArray(), exact_ui_labels: stringArray(),
    mention_candidate_ids: stringArray(1), basis: arrayOf(evidenceRefSchema(), 1)
  });
  return closedObject({ semantic_root_digest: digestString(), entries: arrayOf(entry), registry_digest: digestString() });
}

/** @param {JsonSchema} payload */
function projectionRecordSchema(payload) {
  return closedObject({ artifact_digest: digestString(), accepted_revision: nonnegativeInteger(), payload });
}

function provenanceGraphSchema() {
  const common = { node_id: nonblankString(), run_id: { type: 'string', pattern: RUN_ID }, case_document_lineage_id: nonblankString(), semantic_root_digest: digestString(), accepted: constant(true) };
  const plainKinds = ['source_unit', 'fact', 'behavior_contract', 'atomic_outcome', 'formal_test_point', 'case', 'case_oracle', 'execution_plan', 'rendered_output'];
  const node = { oneOf: [
    ...plainKinds.map((kind) => closedObject({ ...common, kind: constant(kind) })),
    ...['claim', 'decision'].map((kind) => closedObject({ ...common, kind: constant(kind), evidence_level: { enum: ['E1', 'E2', 'E3'] } })),
    closedObject({ ...common, kind: constant('case_document'), immutable_digest: digestString() }),
    closedObject({ ...common, kind: constant('execution_result'), external_downstream: constant(true) })
  ] };
  const edge = { oneOf: [closedObject({ from: nonblankString(), to: nonblankString() }), closedObject({ from: nonblankString(), to: nonblankString(), immutable_digest_ref: digestString() })] };
  return closedObject({ nodes: arrayOf(node), edges: arrayOf(edge), graph_digest: digestString() });
}

function testObligationsSchema() {
  const acceptanceRole = { enum: ['primary_acceptance', 'dependency_contract', 'context_only'] };
  const outcome = closedObject({
    outcome_id: { type: 'string', pattern: '^OUT-[0-9a-f]{64}$' }, fact_id: nonblankString(),
    condition: closedObject({ condition_slot_digest: digestString(), action_slot_digest: digestString(), branch_slot_digest: digestString() }),
    expected: nonblankString(), acceptance_role: acceptanceRole, claim_ids: stringArray(1)
  });
  const formalTestPoint = closedObject({ formal_test_point_id: { type: 'string', pattern: '^TP-[0-9a-f]{64}$' }, outcome_id: nonblankString(), semantic_gap_refs: stringArray() });
  const supportingObservation = closedObject({
    supporting_observation_id: { type: 'string', pattern: '^OBS-[0-9a-f]{64}$' }, outcome_id: nonblankString(),
    surface: { enum: ['ui', 'request', 'response', 'persistence', 'event', 'callback', 'compensation', 'side_effect', 'external_observation'] },
    assertion: nonblankString(), claim_ids: stringArray(1)
  });
  return closedObject({
    schema_version: constant('4.0.0'), source_revision: nonnegativeInteger(), outcomes: arrayOf(outcome),
    formal_test_points: arrayOf(formalTestPoint), supporting_observations: arrayOf(supportingObservation),
    risk_review_ledger: { type: 'array', maxItems: 0, items: false },
    not_applicable_records: { type: 'array', maxItems: 0, items: false },
    exploratory: { type: 'array', maxItems: 0, items: false }
  });
}

/** @param {Record<string,any>} contracts */
function contextSchema(contracts) {
  const source = acceptedSourceContextSchema();
  const compilerRules = compilerRulesSchema(contracts);
  const semantics = projectionRecordSchema(semanticPayloadSchema());
  const termRegistry = projectionRecordSchema(termRegistrySchema());
  const behavior = projectionRecordSchema(behaviorArtifactSchema());
  const testObligations = projectionRecordSchema(testObligationsSchema());
  return { oneOf: [
    closedObject({ source, compiler_rules: compilerRules }),
    closedObject({ source, semantics, term_registry: termRegistry, test_obligations: testObligations, compiler_rules: compilerRules }),
    closedObject({ source, semantics, term_registry: termRegistry, behavior, test_obligations: testObligations, compiler_rules: compilerRules })
  ] };
}

function behaviorSeedSchema() {
  const gapCatalog = (/** @type {string} */ left, /** @type {string} */ right) => closedObject({ [left]: { type: 'array', maxItems: 0, items: false }, [right]: { type: 'array', maxItems: 0, items: false } });
  const base = { required_contract_key: nonblankString(), contract_kind: nonblankString(), subject_ref: nonblankString(), intent_ref: nonblankString(), basis: arrayOf(evidenceRefSchema(), 1) };
  const requirement = { oneOf: [
    closedObject(base),
    closedObject({ ...base, population_gap_catalog: gapCatalog('scope_candidates', 'proof_candidates') }),
    closedObject({ ...base, oracle_gap_catalog: closedObject({ observation_candidates: { type: 'array', maxItems: 0, items: false }, assertion_candidates: { type: 'array', maxItems: 0, items: false }, scope_candidates: { type: 'array', maxItems: 0, items: false }, window_candidates: { type: 'array', maxItems: 0, items: false } }) }),
    closedObject({ ...base, auxiliary_contract_kind: { enum: ['denial_behavior', 'data_scope'] }, permission_target: closedObject({ matrix_id: nonblankString(), required_cell_key: nonblankString() }) })
  ] };
  return closedObject({ semantic_root_digest: digestString(), semantic_rule_index: semanticRuleIndexSchema(), risk_review_module_ids: stringArray(), required_contracts: arrayOf(requirement), seed_digest: digestString() });
}

/** @param {string} coordinate */
function coordinateRefSchema(coordinate) {
  return closedObject({ coordinate: coordinate ? constant(coordinate) : nonblankString(), coordinate_evidence_digest: digestString() });
}

function permissionMatrixSchema() {
  const requiredCell = closedObject({
    required_cell_key: nonblankString(), role_ref: coordinateRefSchema('role'), resource_ref: coordinateRefSchema('resource'),
    action_ref: nonblankString(), context_key: nonblankString(), permission_dimension: { enum: ['decision', 'denial_behavior', 'data_scope'] },
    coordinate_refs: closedObject({ action: coordinateRefSchema('action'), context: coordinateRefSchema('context'), permission_dimension: coordinateRefSchema('permission_dimension') })
  });
  const route = { oneOf: [
    closedObject({ candidate_id: nonblankString(), kind: constant('required_cells'), required_cell_keys: stringArray(1) }),
    closedObject({ candidate_id: nonblankString(), kind: constant('semantic_gap'), semantic_gap_id: nonblankString(), unresolved_coordinates: stringArray(1) })
  ] };
  return closedObject({
    matrix_id: nonblankString(), semantic_root_digest: digestString(), seed_digest: digestString(), permission_derivation_registry_digest: digestString(),
    scope_candidate_ids: stringArray(1), candidate_routes: arrayOf(route, 1),
    role_domain: closedObject({ role_refs: arrayOf(coordinateRefSchema('role')), basis: arrayOf(evidenceRefSchema()) }),
    matrix_scope: closedObject({ resource_refs: arrayOf(coordinateRefSchema('resource')), action_refs: stringArray(), contexts: arrayOf(closedObject({ context_key: nonblankString(), context_ref: coordinateRefSchema('context') })), basis: arrayOf(evidenceRefSchema()) }),
    required_cells: arrayOf(requiredCell)
  });
}

function presentationSchema() {
  const part = closedObject({
    question_part_id: nonblankString(), display_token: { type: 'string', pattern: '^Q[0-9]{3,6}$' }, question_state: nonblankString(),
    current_allowed_controls: stringArray(1), question: nonblankString(), why_needed: nonblankString(), answer_contract: answerContractSchema(),
    question_impact_summary: questionImpactSchema(true)
  });
  return closedObject({ presentation_id: nonblankString(), semantic_root_digest: digestString(), question_part_state_set_digest: digestString(), source_revision: nonnegativeInteger(), parts: arrayOf(part, 1), presentation_digest: digestString() });
}

function deterministicProjectionSchema() {
  return closedObject({
    resolved_gap_ids: stringArray(), invalidated_artifact_ids: stringArray(),
    semantic_changes: { type: 'array', maxItems: 0, items: false },
    status_changes: arrayOf(closedObject({ ref: nonblankString(), from: nonblankString(), to: nonblankString() })),
    coverage_changes: { type: 'array', maxItems: 0, items: false }, no_semantic_change: constant(false)
  });
}

function clarificationPreviewSchema() {
  const bindingBase = { unit_client_key: clientKeyString(), shared_origin_group_id: clientKeyString(), question_part_id: nonblankString(), display_token: nonblankString(), origin: closedObject({ message_digest: digestString(), range: originRangeSchema(), excerpt: nonblankString(), excerpt_digest: digestString() }) };
  const binding = { oneOf: [
    closedObject({ ...bindingBase, action: { enum: ['defer', 'unknown', 'close_for_delivery'] } }, ['unit_client_key', 'question_part_id', 'display_token', 'action', 'origin']),
    closedObject({ ...bindingBase, action: constant('answer'), answer: proposedAnswerSchema() }, ['unit_client_key', 'question_part_id', 'display_token', 'action', 'origin', 'answer'])
  ] };
  return closedObject({
    presentation_id: nonblankString(), presentation_digest: digestString(), semantic_root_digest: digestString(), question_part_state_set_digest: digestString(),
    source_revision: nonnegativeInteger(), response_message_digest: digestString(), bindings: arrayOf(binding),
    deterministic_projection: deterministicProjectionSchema(), unknown_future_effects: stringArray(), preview_digest: digestString()
  });
}

function executionProjectionSchema() {
  const item = closedObject({
    case_id: nonblankString(), title: nonblankString(), semantic_status: { enum: ['Grounded', 'Conditional', 'Blocked', 'NotApplicable', 'Exploratory'] },
    execution_disposition: { enum: ['pending', 'execute', 'do_not_execute'] },
    available_actions: { type: 'array', uniqueItems: true, items: { enum: ['provide_capability_proof', 'set_execution_disposition'] } }, capability_ready: { type: 'boolean' }
  }, ['case_id', 'title', 'semantic_status', 'execution_disposition', 'available_actions']);
  const receipt = closedObject({ kind: constant('capability_proof'), ready: { type: 'boolean' }, case_id: nonblankString(), receipt_digest: digestString() });
  return closedObject({
    kind: constant('v5_execution_projection'), schema_version: constant(V5_SCHEMA_VERSION), compiler_version: constant(V5_COMPILER_VERSION),
    case_document_ref: caseDocumentRefSchema(), plan_digest: digestString(),
    operation_kinds: { type: 'array', minItems: 4, maxItems: 4, uniqueItems: true, items: { enum: ['confirm_execution_plan', 'pause_execution', 'provide_capability_proof', 'set_execution_disposition'] } },
    items: arrayOf(item), capability_receipts: arrayOf(receipt), paused: { type: 'boolean' }, confirmed: { type: 'boolean' }, execution_snapshot_digest: digestString()
  });
}

/** @param {Record<string,any>} exactWorkPacket @param {Record<string,any>} contracts */
function workPacketSchema(exactWorkPacket, contracts) {
  if (exactWorkPacket.kind === 'terminal') {
    const properties = /** @type {Record<string,any>} */ ({ kind: constant('terminal_work'), terminal_kind: constant(exactWorkPacket.terminal_kind) });
    const terminalKind = exactWorkPacket.terminal_kind;
    if (terminalKind === 'case_document_finished') properties.case_document_ref = caseDocumentRefSchema();
    if (terminalKind === 'execution_plan_finished') { properties.case_document_ref = caseDocumentRefSchema(); properties.execution_projection = executionProjectionSchema(); }
    if (terminalKind === 'execution_plan_cancelled') { properties.case_document_ref = caseDocumentRefSchema(); properties.last_execution_projection = executionProjectionSchema(); }
    if (terminalKind === 'execution_plan_fatal') { properties.case_document_ref = caseDocumentRefSchema(); properties.last_verified_execution_projection = { oneOf: [executionProjectionSchema(), { type: 'null' }] }; }
    return closedObject(properties, Object.keys(properties).filter((key) => !['case_document_ref', 'last_verified_execution_projection'].includes(key) || terminalKind !== 'execution_plan_fatal'));
  }
  const kind = exactWorkPacket.packet_kind;
  if (kind === 'source_work') return closedObject({
    kind: constant(kind), accepted_source_state: { oneOf: [
      closedObject({ kind: constant('none') }),
      closedObject({ kind: constant('partial'), accepted_source_state_digest: digestString() }),
      closedObject({ kind: constant('partial'), source: acceptedSourceContextSchema() })
    ] }, source_requests: arrayOf(sourceRequestSchema(), 1), source_acquisition_policy: exactValueSchema(contracts.sourceAcquisitionPolicy), source_acquisition_state_digest: digestString()
  });
  if (kind === 'semantic_review_work') return closedObject({ kind: constant(kind), context: contextSchema(contracts), semantic_review_seed: semanticSeedSchema() });
  if (kind === 'clarification_work') return closedObject({ kind: constant(kind), context: contextSchema(contracts), presentation: presentationSchema() });
  if (kind === 'clarification_confirmation_work') return closedObject({ kind: constant(kind), context: contextSchema(contracts), presentation: presentationSchema(), clarification_preview: clarificationPreviewSchema() });
  if (kind === 'behavior_work') return closedObject({ kind: constant(kind), context: contextSchema(contracts), permission_matrix_worklists: arrayOf(permissionMatrixSchema()), behavior_contract_worklist: behaviorSeedSchema() });
  if (kind === 'case_work') return closedObject({ kind: constant(kind), context: contextSchema(contracts) });
  if (kind === 'execution_work') return closedObject({ kind: constant(kind), case_document_ref: caseDocumentRefSchema(), execution_projection: executionProjectionSchema() });
  throw new Error(`Unknown reply work packet: ${kind}`);
}

function bindingSchema() { return closedObject({ client_key: clientKeyString(), stable_id: nonblankString() }); }

/** @param {Record<string,any>} exactCommit */
function commitReceiptSchema(exactCommit) {
  if (exactCommit.kind === 'none') return { type: 'null' };
  const common = { committed_action_digest: digestString(), client_key_bindings: arrayOf(bindingSchema()) };
  if (exactCommit.kind === 'artifact_commit') return closedObject({ kind: constant('artifact_commit'), ...common, semantic_revision_delta: constant(1) });
  if (exactCommit.kind === 'clarification_commit') return closedObject({
    kind: constant('clarification_commit'), ...common, semantic_revision_delta: constant(1),
    applied_clarification_impact: closedObject({
      preview_digest: digestString(), decision_ids: stringArray(), before_graph_digest: digestString(), after_graph_digest: digestString(),
      actual_projection: deterministicProjectionSchema()
    })
  }, ['kind', 'committed_action_digest', 'semantic_revision_delta', 'client_key_bindings']);
  if (exactCommit.kind === 'operational_commit') return closedObject({ kind: constant('operational_commit'), ...common, semantic_revision_delta: constant(0), operational_effect: constant(exactCommit.effect) });
  throw new Error(`Unknown reply commit kind: ${exactCommit.kind}`);
}

/** @param {Record<string,any>} exactState */
function lastVerifiedStateSchema(exactState) {
  if (exactState.kind === 'none') return closedObject({ kind: constant('none') });
  return closedObject({ kind: constant('checkpoint'), fsm_cell_id: constant(exactState.fsm_cell_id), stage: nonblankString(), obligation: nonblankString(), current_revision: { type: 'integer', minimum: 0 }, checkpoint_digest: digestString() });
}

/** @param {Record<string,any>} exactWorkPacket */
function workPacketDefinitionKey(exactWorkPacket) {
  const suffix = exactWorkPacket.kind === 'terminal' ? exactWorkPacket.terminal_kind : exactWorkPacket.packet_kind;
  return `work_packet_${suffix.replaceAll(/[^A-Za-z0-9_]/gu, '_')}`;
}

/** @param {Record<string,any>} row */
function replySchemaBranch(row) {
  const diagnostics = row.exact_diagnostic.kind === 'none'
    ? { type: 'array', maxItems: 0, items: false }
    : { type: 'array', minItems: 1, maxItems: 1, items: diagnosticSchema(row.exact_diagnostic.error_code) };
  if (row.exact_projection_kind === 'pre_run_error') return closedObject({
    kind: constant('pre_run_error'), schema_version: constant(V5_SCHEMA_VERSION), reply_contract_id: constant(row.reply_contract_id),
    reply_status: constant(row.exact_reply_status), diagnostics
  });
  const identity = {
    kind: constant('run_reply'), schema_version: constant(V5_SCHEMA_VERSION), run_id: { type: 'string', pattern: RUN_ID },
    run_directory: nonblankString(), case_document_lineage_id: nonblankString(), delivery_intent: { enum: ['case_document', 'execution_plan'] },
    projection_kind: constant(row.exact_projection_kind), reply_contract_id: constant(row.reply_contract_id),
    run_lifecycle: constant(row.exact_lifecycle), reply_status: constant(row.exact_reply_status),
    selector_snapshot_digest: row.exact_projection_kind === 'read_only_integrity_fatal' ? { type: 'null' } : digestString(),
    available_actions: selectorsSchema(row.exact_action_templates), work_packet: { $ref: `#/$defs/${workPacketDefinitionKey(row.exact_work_packet)}` },
    commit_receipt: commitReceiptSchema(row.exact_commit), diagnostics
  };
  if (row.exact_projection_kind === 'read_only_integrity_fatal') {
    return closedObject({ ...identity, last_verified_state: lastVerifiedStateSchema(row.exact_last_verified_state) });
  }
  return closedObject({
    ...identity, stage: constant(row.exact_stage), obligation: constant(row.exact_obligation),
    current_revision: { type: 'integer', minimum: 0 }, checkpoint_digest: digestString()
  });
}

/** @param {Record<string, any>} contracts */
function replySchema(contracts) {
  /** @type {Record<string,any>} */
  const workPacketDefinitions = {};
  for (const row of contracts.replyContracts.rows) {
    if (row.exact_work_packet.kind === 'absent') continue;
    const key = workPacketDefinitionKey(row.exact_work_packet);
    if (!workPacketDefinitions[key]) workPacketDefinitions[key] = workPacketSchema(row.exact_work_packet, contracts);
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema', $id: 'v5-reply-oneof.schema.json',
    $defs: workPacketDefinitions,
    oneOf: contracts.replyContracts.rows.map(replySchemaBranch)
  };
}

/** @param {Record<string, any>} contracts */
export function generateV5InterfaceSchemas(contracts) {
  return {
    createRequest: createRequestSchema(), advanceRequest: advanceRequestSchema(),
    runIdentity: runIdentitySchema(), reply: replySchema(contracts)
  };
}

/** @param {Record<string, any>} replyContracts @param {Record<string, any>} schema */
export function validateV5ReplySchemaRegistryAlignment(replyContracts, schema) {
  if (!Array.isArray(schema.oneOf)) return ['reply schema oneOf is missing'];
  const schemaIds = schema.oneOf.map((/** @type {Record<string,any>} */ branch) => branch?.properties?.reply_contract_id?.const);
  if (schemaIds.some((value) => typeof value !== 'string')) return ['reply schema contains a branch without a contract ID'];
  if (new Set(schemaIds).size !== schemaIds.length) return ['reply schema contract IDs are not unique'];
  const registryIds = replyContracts.rows.map((/** @type {Record<string,any>} */ row) => row.reply_contract_id);
  if (canonicalStringify([...schemaIds].sort()) !== canonicalStringify([...registryIds].sort())) return ['reply schema and registry contract IDs differ'];
  return [];
}
