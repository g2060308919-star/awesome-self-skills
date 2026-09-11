import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { canonicalObjectDigest, sealV5Record } from './storage-records.mjs';
import { resolveSemanticRuleRef } from './semantic-rules.mjs';

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {Record<string,any>} value @param {string[]} keys */
function exact(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }
/** @param {unknown} value */
function nonempty(value) { return Array.isArray(value) && value.length > 0; }

/** @param {unknown} value */
export function validateTypedValue(value) {
  if (!object(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'null' || value.kind === 'empty_string') return exact(value, ['kind']);
  if (value.kind === 'string') return exact(value, ['kind', 'value']) && nonblank(value.value);
  if (value.kind === 'number') return exact(value, ['kind', 'value']) && typeof value.value === 'number' && Number.isFinite(value.value);
  if (value.kind === 'boolean') return exact(value, ['kind', 'value']) && typeof value.value === 'boolean';
  return false;
}

/** @param {unknown} value */
export function validateValueState(value) {
  const invalid = () => { throw new V5ProtocolError('VALUE_STATE_INVALID', 'ValueState must use one closed data/render branch.'); };
  if (!object(value)) return invalid();
  const validateData = (/** @type {any} */ data) => object(data) && ((data.presence === 'missing' && exact(data, ['presence'])) || (data.presence === 'present' && exact(data, ['presence', 'value']) && validateTypedValue(data.value)));
  const validateRender = (/** @type {any} */ render) => object(render) && ((render.presence === 'not_rendered' && exact(render, ['presence'])) || (render.presence === 'rendered' && exact(render, ['presence', 'content']) && object(render.content) && ((render.content.kind === 'empty' && exact(render.content, ['kind'])) || (render.content.kind === 'text' && exact(render.content, ['kind', 'value']) && nonblank(render.content.value)) || (render.content.kind === 'formatted_value' && exact(render.content, ['kind', 'value', 'format_ref']) && nonblank(render.content.value) && nonblank(render.content.format_ref)))));
  if (value.axes === 'data_only' && exact(value, ['axes', 'data_state']) && validateData(value.data_state)) return structuredClone(value);
  if (value.axes === 'render_only' && exact(value, ['axes', 'render_state']) && validateRender(value.render_state)) return structuredClone(value);
  if (value.axes === 'data_and_render' && exact(value, ['axes', 'data_state', 'render_state']) && validateData(value.data_state) && validateRender(value.render_state)) return structuredClone(value);
  return invalid();
}

/** @param {Record<string,any>} mapping @param {Record<string,any>} ruleIndex */
export function validateFieldCorrespondence(mapping, ruleIndex) {
  const fail = (/** @type {string} */ message) => { throw new V5ProtocolError('FIELD_CORRESPONDENCE_REQUIRED', message); };
  try {
    if (!object(mapping) || !nonblank(mapping.mapping_client_key) || !['left', 'right'].includes(mapping.authority_side) || !nonempty(mapping.basis)) return fail('Field mapping identity or basis is missing.');
    const sideKeys = ['semantic_role', 'logical_surface_ref', 'collection_path', 'item_field_path'];
    if (!exact(mapping.left, sideKeys) || !exact(mapping.right, sideKeys) || ![mapping.left, mapping.right].every((side) => ['ui', 'authoritative_source', 'peer_surface'].includes(side.semantic_role) && [side.logical_surface_ref, side.collection_path, side.item_field_path].every(nonblank))) return fail('Field sides are not closed.');
    if (mapping[mapping.authority_side].semantic_role !== 'authoritative_source' || [mapping.left, mapping.right].filter((side) => side.semantic_role === 'authoritative_source').length !== 1) return fail('Exactly the authority side must be authoritative_source.');
    if (mapping.join?.kind === 'singleton') { if (!exact(mapping.join, ['kind'])) return fail('Singleton join cannot contain record keys.'); }
    else if (mapping.join?.kind === 'key_equality') {
      const allowed = mapping.join.key_normalization_ref ? ['kind', 'left_key_path', 'right_key_path', 'cardinality', 'key_normalization_ref'] : ['kind', 'left_key_path', 'right_key_path', 'cardinality'];
      if (!exact(mapping.join, allowed) || !nonblank(mapping.join.left_key_path) || !nonblank(mapping.join.right_key_path) || !['one_to_one', 'many_to_one', 'one_to_many'].includes(mapping.join.cardinality)) return fail('Key join is incomplete.');
      if (mapping.join.key_normalization_ref) resolveSemanticRuleRef(mapping.join.key_normalization_ref, 'key_normalization', ruleIndex);
    } else return fail('Join kind is unknown.');
    if (mapping.transform?.kind === 'identity') { if (!exact(mapping.transform, ['kind'])) return fail('Identity transform is not closed.'); }
    else if (mapping.transform?.kind === 'registered' && exact(mapping.transform, ['kind', 'transform_ref'])) resolveSemanticRuleRef(mapping.transform.transform_ref, 'transform', ruleIndex);
    else return fail('Transform must be identity or a typed registered rule.');
    if (mapping.comparison?.kind === 'strict_equal') { if (!exact(mapping.comparison, ['kind'])) return fail('Strict comparison cannot carry normalization.'); }
    else if (mapping.comparison?.kind === 'normalized_equal' && exact(mapping.comparison, ['kind', 'normalization_ref'])) resolveSemanticRuleRef(mapping.comparison.normalization_ref, 'value_normalization', ruleIndex);
    else return fail('Comparison branch is invalid.');
    resolveSemanticRuleRef(mapping.null_policy_ref, 'null_policy', ruleIndex);
    if (!(mapping.freshness?.kind === 'same_logical_snapshot' && exact(mapping.freshness, ['kind'])) && !(mapping.freshness?.kind === 'within_business_window' && exact(mapping.freshness, ['kind', 'duration_ms']) && Number.isSafeInteger(mapping.freshness.duration_ms) && mapping.freshness.duration_ms > 0)) return fail('Freshness is not executable.');
    return structuredClone(mapping);
  } catch (error) {
    if (error instanceof V5ProtocolError && error.code === 'ORACLE_NOT_DECIDABLE') return fail(error.message);
    throw error;
  }
}

/** @param {string} semanticRootDigest @param {Record<string,any>} input */
export function compileClosedDomain(semanticRootDigest, input) {
  const fail = (/** @type {string} */ message) => { throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', message); };
  if (!object(input) || input.domain?.kind !== 'closed_enum' || !nonblank(input.domain_client_key) || !nonblank(input.subject_ref) || !nonblank(input.field_path) || !nonempty(input.domain.members) || !nonempty(input.domain.closed_world_basis) || !nonempty(input.partitions)) return fail('Closed Domain is incomplete.');
  if (/** @type {any[]} */ (input.domain.members).some((value) => !validateTypedValue(value))) return fail('Domain members must be typed values.');
  const memberMap = new Map(/** @type {any[]} */ (input.domain.members).map((value) => [canonicalV5Stringify(value), value]));
  if (memberMap.size !== input.domain.members.length) return fail('Domain members must be unique.');
  const claimed = new Set();
  let complementCount = 0;
  const domainAnchorDigest = canonicalObjectDigest({ subject_ref: input.subject_ref, field_path: input.field_path, domain: input.domain });
  const partitions = /** @type {Array<Record<string, any>>} */ (input.partitions).map((partition) => {
    if (partition.kind === 'exact_members') {
      if (!exact(partition, ['partition_client_key', 'kind', 'semantic_role', 'values']) || !['target', 'other'].includes(partition.semantic_role) || !nonempty(partition.values)) return fail('Exact partition is invalid.');
      const values = [...new Map(/** @type {any[]} */ (partition.values).map((value) => [canonicalV5Stringify(value), value])).values()];
      if (values.length !== partition.values.length || values.some((value) => !memberMap.has(canonicalV5Stringify(value)) || claimed.has(canonicalV5Stringify(value)))) return fail('Exact partitions overlap or escape the universe.');
      values.forEach((value) => claimed.add(canonicalV5Stringify(value)));
      const normalized = { kind: partition.kind, semantic_role: partition.semantic_role, values };
      return { ...structuredClone(partition), partition_id: stableV5Id('domain_partition', { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, normalized_partition: normalized }) };
    }
    if (partition.kind === 'complement') {
      complementCount += 1;
      if (complementCount > 1 || !exact(partition, ['partition_client_key', 'kind', 'semantic_role', 'universe', 'excluded_values']) || partition.semantic_role !== 'complement' || canonicalV5Stringify(partition.universe) !== '{"kind":"parent_domain"}' || !Array.isArray(partition.excluded_values)) return fail('Complement partition is invalid.');
      const excluded = new Set(/** @type {any[]} */ (partition.excluded_values).map((value) => canonicalV5Stringify(value)));
      if ([...excluded].some((key) => !memberMap.has(key))) return fail('Complement exclusion escapes the universe.');
      const derived = [...memberMap.entries()].filter(([key]) => !excluded.has(key)).map(([, value]) => value);
      if (derived.length === 0 || derived.some((value) => claimed.has(canonicalV5Stringify(value)))) return fail('Complement must be nonempty and disjoint.');
      derived.forEach((value) => claimed.add(canonicalV5Stringify(value)));
      const normalized = { kind: partition.kind, semantic_role: partition.semantic_role, universe: partition.universe, excluded_values: partition.excluded_values };
      return { ...structuredClone(partition), derived_members: derived, partition_id: stableV5Id('domain_partition', { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, normalized_partition: normalized }) };
    }
    return fail('Closed enums allow only exact and complement partitions.');
  });
  if (claimed.size !== memberMap.size) return fail('Closed Domain partitions must cover the complete universe.');
  const partitionIds = partitions.map((partition) => partition.partition_id).sort();
  return { ...structuredClone(input), partitions, domain_contract_id: stableV5Id('domain_contract', { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, partition_ids: partitionIds }) };
}

/** @param {string} semanticRootDigest @param {Record<string,any>} input @param {Array<Record<string,any>>} [predicateContracts] */
export function compileDomain(semanticRootDigest, input, predicateContracts = []) {
  if (input.domain?.kind === 'closed_enum') return compileClosedDomain(semanticRootDigest, input);
  const fail = (/** @type {string} */ message) => { throw new V5ProtocolError('DOMAIN_CONTRACT_REQUIRED', message); };
  if (!object(input) || !['predicate_partition', 'open_domain'].includes(input.domain?.kind) || !nonblank(input.domain_client_key) || !nonblank(input.subject_ref) || !nonblank(input.field_path) || !nonempty(input.partitions)) return fail('Predicate/Open Domain is incomplete.');
  const contractByKey = new Map(predicateContracts.map((contract) => [contract.predicate_contract_client_key, contract]));
  const boundaryBasis = input.domain.kind === 'open_domain' ? input.domain.boundary_basis : input.domain.boundary_basis;
  if (!nonempty(boundaryBasis) || (input.domain.kind === 'open_domain' && !nonblank(input.domain.boundary_description)) || (input.domain.kind === 'predicate_partition' && !typedRef(input.domain.universe_ref, 'universe', semanticRootDigest))) return fail('Domain boundary is not closed by evidence and a typed universe.');
  const domainAnchorDigest = canonicalObjectDigest({ subject_ref: input.subject_ref, field_path: input.field_path, domain: input.domain });
  const partitions = /** @type {Array<Record<string,any>>} */ (input.partitions).map((partition) => {
    if (!exact(partition, ['partition_client_key', 'kind', 'semantic_role', 'predicate_contract_client_key']) || partition.kind !== 'predicate' || !['target', 'other'].includes(partition.semantic_role)) return fail('Open/predicate Domains allow only predicate partitions.');
    const contract = contractByKey.get(partition.predicate_contract_client_key);
    if (!contract || !nonempty(contract.basis) || !typedRef(contract.predicate_ref, 'domain_predicate', semanticRootDigest) || (input.domain.kind === 'open_domain' && contract.exhaustiveness !== 'non_exhaustive_open_set')) return fail('Predicate partition does not resolve to an admissible typed contract.');
    const normalized = { kind: 'predicate', semantic_role: partition.semantic_role, predicate_contract_client_key: partition.predicate_contract_client_key };
    return { ...structuredClone(partition), partition_id: stableV5Id('domain_partition', { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, normalized_partition: normalized }) };
  });
  if (new Set(partitions.map((/** @type {Record<string,any>} */ partition) => partition.partition_client_key)).size !== partitions.length) return fail('Predicate partition keys must be unique.');
  const partitionIds = partitions.map((partition) => partition.partition_id).sort();
  return { ...structuredClone(input), partitions, domain_contract_id: stableV5Id('domain_contract', { input_semantic_root_digest: semanticRootDigest, domain_anchor_digest: domainAnchorDigest, partition_ids: partitionIds }) };
}

/** @param {Record<string,any>} ref @param {string} kind @param {string} root */
function typedRef(ref, kind, root) { return object(ref) && exact(ref, ['contract_id', 'contract_kind', 'semantic_root_digest']) && nonblank(ref.contract_id) && ref.contract_kind === kind && ref.semantic_root_digest === root; }

/** @param {Record<string,any>} contract @param {string} semanticRootDigest */
export function validatePopulationContract(contract, semanticRootDigest) {
  const fail = () => { throw new V5ProtocolError('POPULATION_CONTRACT_REQUIRED', 'Population scope needs exact current-root typed contracts.'); };
  if (!object(contract) || !exact(contract, ['population_contract_client_key', 'scope']) || !nonblank(contract.population_contract_client_key) || !object(contract.scope)) return fail();
  const scope = contract.scope;
  const optionalFilter = !scope.filter_ref || typedRef(scope.filter_ref, 'filter', semanticRootDigest);
  let valid = false;
  if (scope.kind === 'single_item') valid = exact(scope, ['kind', 'identity_contract_ref']) && typedRef(scope.identity_contract_ref, 'identity', semanticRootDigest);
  else if (scope.kind === 'visible_region') valid = exact(scope, ['kind', 'region_contract_ref']) && typedRef(scope.region_contract_ref, 'region', semanticRootDigest);
  else if (scope.kind === 'current_page' || scope.kind === 'current_response') valid = exact(scope, scope.filter_ref ? ['kind', 'collection_ref', 'filter_ref'] : ['kind', 'collection_ref']) && typedRef(scope.collection_ref, 'collection', semanticRootDigest) && optionalFilter;
  else if (scope.kind === 'all_pages') valid = exact(scope, scope.filter_ref ? ['kind', 'collection_ref', 'filter_ref', 'page_model_ref', 'termination_contract_ref', 'consistency_contract_ref'] : ['kind', 'collection_ref', 'page_model_ref', 'termination_contract_ref', 'consistency_contract_ref']) && typedRef(scope.collection_ref, 'collection', semanticRootDigest) && optionalFilter && typedRef(scope.page_model_ref, 'page_model', semanticRootDigest) && typedRef(scope.termination_contract_ref, 'termination', semanticRootDigest) && typedRef(scope.consistency_contract_ref, 'consistency', semanticRootDigest);
  else if (scope.kind === 'full_dataset') {
    const keys = ['kind', 'universe_ref', 'snapshot_contract_ref', 'consistency_contract_ref', ...(scope.filter_ref ? ['filter_ref'] : []), ...(scope.tenant_or_region_ref ? ['tenant_or_region_ref'] : [])];
    valid = exact(scope, keys) && typedRef(scope.universe_ref, 'universe', semanticRootDigest) && optionalFilter && (!scope.tenant_or_region_ref || typedRef(scope.tenant_or_region_ref, 'tenant_or_region', semanticRootDigest)) && typedRef(scope.snapshot_contract_ref, 'snapshot', semanticRootDigest) && typedRef(scope.consistency_contract_ref, 'consistency', semanticRootDigest);
  }
  if (!valid) return fail();
  return structuredClone(contract);
}

export const RISK_KINDS = Object.freeze([
  'null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay',
  'long_content', 'pagination', 'refresh', 'business_permission_boundary'
]);

/** @param {Record<string,any>} item */
function riskTier(item) {
  const primaryGap = item.risk_disposition === 'semantic_gap' && ['medium', 'high'].includes(item.likelihood);
  const primaryFormal = item.risk_disposition === 'formal_requirement' && ['high', 'critical'].includes(item.severity) && ['medium', 'high'].includes(item.likelihood);
  if (primaryGap || primaryFormal) return 'primary';
  const atLeastMedium = (/** @type {string} */ value) => ['medium', 'high'].includes(value);
  if (item.risk_disposition !== 'not_applicable' && nonblank(item.recommended_action) && atLeastMedium(item.likelihood) && atLeastMedium(item.evidence_confidence) && atLeastMedium(item.testability)) return 'recommended';
  return 'background';
}

/**
 * @param {string} semanticRootDigest
 * @param {string[]} moduleIds
 * @param {Array<Record<string,any>>} reviews
 */
export function validateRiskReviews(semanticRootDigest, moduleIds, reviews) {
  const expected = moduleIds.flatMap((moduleRef) => RISK_KINDS.map((riskKind) => `${moduleRef}\0${riskKind}`)).sort();
  const actual = reviews.map((review) => `${review.module_ref}\0${review.risk_kind}`).sort();
  if (new Set(actual).size !== actual.length || canonicalV5Stringify(actual) !== canonicalV5Stringify(expected)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'Risk reviews must exactly cover module × nine-risk denominator.');
  const items = [];
  for (const review of reviews) {
    if (!nonblank(review.review_client_key) || !nonempty(review.review_basis) || !RISK_KINDS.includes(review.risk_kind)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'Risk review identity or basis is missing.');
    if (review.risk_signal_status === 'no_signal') {
      if (Object.hasOwn(review, 'risk_item')) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'no_signal review cannot carry a risk item.');
      continue;
    }
    const item = review.risk_item;
    if (review.risk_signal_status !== 'signal_found' || !object(item) || !nonblank(item.candidate_client_key) || !nonempty(item.trigger_basis) || !nonempty(item.affected_refs) || !nonblank(item.why_material) || !nonblank(item.recommended_action) || !['low', 'medium', 'high', 'critical'].includes(item.severity) || !['low', 'medium', 'high'].includes(item.likelihood) || !['low', 'medium', 'high'].includes(item.evidence_confidence) || !['low', 'medium', 'high'].includes(item.testability)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'Signal-found risk item is incomplete.');
    if (item.risk_disposition === 'formal_requirement' && !nonblank(item.formal_claim_id)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'Formal risk needs a Claim.');
    if (item.risk_disposition === 'semantic_gap' && !object(item.gap_ref)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'Risk gap reference is missing.');
    if (item.risk_disposition === 'exploratory' && !nonblank(item.observation_intent)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'Exploratory risk needs a nonblank observation intent.');
    if (item.risk_disposition === 'not_applicable' && !nonempty(item.exclusion_basis)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'N/A risk needs E2/E3 exclusion basis.');
    if (!['formal_requirement', 'semantic_gap', 'exploratory', 'not_applicable'].includes(item.risk_disposition)) throw new V5ProtocolError('RISK_LEDGER_INVALID', 'Risk disposition is unknown.');
    const sourceReviewId = stableV5Id('risk_review', { input_semantic_root_digest: semanticRootDigest, module_ref: review.module_ref, risk_kind: review.risk_kind });
    items.push({
      risk_key: stableV5Id('derived_risk_ledger_item', { module_ref: review.module_ref, risk_kind: review.risk_kind, trigger_basis: item.trigger_basis, affected_refs: item.affected_refs }),
      module_ref: review.module_ref, risk_kind: review.risk_kind, display_tier: riskTier(item),
      source_review_ids: [sourceReviewId], affected_refs: [...new Set(item.affected_refs)].sort()
    });
  }
  return { semantic_root_digest: semanticRootDigest, reviewed_cell_count: expected.length, items: items.sort((left, right) => left.risk_key.localeCompare(right.risk_key)) };
}

/**
 * @param {string} semanticRootDigest
 * @param {{semanticRuleIndex:Record<string,any>,riskModuleIds:string[],requirements:Array<Record<string,any>>}} input
 * @returns {Record<string,any>}
 */
export function deriveBehaviorContractSeed(semanticRootDigest, input) {
  const requiredContracts = input.requirements.map((requirement) => {
    if (!['field_correspondence', 'domain', 'population', 'oracle_semantics', 'permission_auxiliary'].includes(requirement.contract_kind) || !nonblank(requirement.subject_ref) || !nonblank(requirement.intent_ref) || !nonempty(requirement.basis)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Behavior requirement needs a closed kind, subject, intent, and basis.');
    if (requirement.contract_kind === 'population' && (!object(requirement.population_gap_catalog) || !Array.isArray(requirement.population_gap_catalog.scope_candidates) || !Array.isArray(requirement.population_gap_catalog.proof_candidates))) throw new V5ProtocolError('POPULATION_CONTRACT_REQUIRED', 'Population candidate catalogs must exist even when empty.');
    const kindSpecificRequirement = Object.fromEntries(Object.entries(requirement).filter(([key]) => !['required_contract_key', 'contract_kind', 'subject_ref', 'intent_ref', 'basis'].includes(key)));
    return {
      ...structuredClone(requirement),
      required_contract_key: stableV5Id('behavior_required_contract', {
        input_semantic_root_digest: semanticRootDigest,
        contract_kind: requirement.contract_kind,
        subject_ref: requirement.subject_ref,
        intent_ref: requirement.intent_ref,
        basis: requirement.basis,
        kind_specific_requirement: kindSpecificRequirement
      })
    };
  }).sort((left, right) => left.required_contract_key.localeCompare(right.required_contract_key));
  if (new Set(requiredContracts.map((item) => item.required_contract_key)).size !== requiredContracts.length) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior requirement identities collide.');
  return sealV5Record({ semantic_root_digest: semanticRootDigest, semantic_rule_index: input.semanticRuleIndex, risk_review_module_ids: [...new Set(input.riskModuleIds)].sort(), required_contracts: requiredContracts }, 'seed_digest');
}

/** @param {Record<string,any>} seed @param {Array<Record<string,any>>} reviews @param {Record<string,any>} artifact */
export function validateBehaviorContractReviews(seed, reviews, artifact) {
  const required = /** @type {Array<Record<string,any>>} */ (seed.required_contracts);
  if (reviews.length !== required.length) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Every behavior contract requirement must have exactly one disposition.');
  const requiredByKey = new Map(required.map((item) => [item.required_contract_key, item]));
  const seen = new Set();
  const collectionByKind = /** @type {Record<string, [string, string]>} */ ({
    field_correspondence: ['field_correspondences', 'mapping_client_key'],
    domain: ['domain_contracts', 'domain_client_key'],
    population: ['population_contracts', 'population_contract_client_key'],
    oracle_semantics: ['oracle_semantic_contracts', 'oracle_contract_client_key'],
    permission_auxiliary: ['permission_auxiliary_contracts', 'contract_client_key']
  });
  for (const review of reviews) {
    const requirement = requiredByKey.get(review.required_contract_key);
    if (!requirement || review.seed_digest !== seed.seed_digest || seen.has(review.required_contract_key)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior review binds an unknown, duplicate, or stale requirement.');
    seen.add(review.required_contract_key);
    const disposition = review.disposition;
    if (disposition.kind === 'formal') {
      if (!Array.isArray(disposition.contract_client_keys) || disposition.contract_client_keys.length === 0 || new Set(disposition.contract_client_keys).size !== disposition.contract_client_keys.length) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Formal behavior disposition must cite contracts.');
      const [collectionKey, clientKey] = collectionByKind[requirement.contract_kind];
      const available = new Set(/** @type {Array<Record<string,any>>} */ (artifact[collectionKey] ?? []).map((item) => item[clientKey]));
      if (disposition.contract_client_keys.some((/** @type {string} */ key) => !available.has(key))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Formal behavior disposition cites a missing or wrong-kind contract.');
      if (requirement.contract_kind === 'permission_auxiliary' && disposition.contract_client_keys.length !== 1) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Permission auxiliary requirement resolves to exactly one contract.');
    } else if (disposition.kind === 'semantic_gap') {
      if (!object(disposition.gap_ref)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Behavior gap disposition needs an exact gap reference.');
    } else if (disposition.kind === 'not_applicable') {
      if (!nonempty(disposition.basis)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'N/A behavior disposition needs E2/E3 basis.');
    } else throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior disposition kind is unknown.');
  }
  return structuredClone(reviews);
}
