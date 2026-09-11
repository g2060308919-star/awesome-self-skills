import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compileClosedDomain,
  compileDomain,
  deriveBehaviorContractSeed,
  validateBehaviorContractReviews,
  validateRiskReviews,
  validateFieldCorrespondence,
  validatePopulationContract,
  validateValueState
} from '../../src/v5/behavior-contracts.mjs';
import { createSemanticRuleIndex } from '../../src/v5/semantic-rules.mjs';

const root = `sha256:${'a'.repeat(64)}`;
const evidence = [{ kind: 'claim', claim_id: 'claim-1' }];

/** @param {string} ruleKind @param {string} [ruleId] */
function registryRule(ruleKind, ruleId = `rule.${ruleKind}`) {
  return { source: 'closed_registry', registry_digest: `sha256:${'b'.repeat(64)}`, rule_id: ruleId, rule_kind: ruleKind, implementation_digest: `sha256:${'c'.repeat(64)}` };
}

test('ValueState keeps data and render axes orthogonal including numeric zero', () => {
  const state = { axes: 'data_and_render', data_state: { presence: 'present', value: { kind: 'number', value: 0 } }, render_state: { presence: 'not_rendered' } };
  assert.deepEqual(validateValueState(state), state);
  assert.throws(() => validateValueState({ axes: 'data_only', data_state: { presence: 'present', value: { kind: 'string', value: '' } } }), /VALUE_STATE_INVALID/u);
  assert.throws(() => validateValueState({ axes: 'render_only', render_state: { presence: 'rendered', content: { kind: 'text', value: '' } } }), /VALUE_STATE_INVALID/u);
  assert.throws(() => validateValueState({ axes: 'data_only', data_state: { presence: 'not_observed' } }), /VALUE_STATE_INVALID/u);
});

test('field correspondence requires one authoritative side and exact typed rule refs', () => {
  const index = createSemanticRuleIndex(root, {
    registry_digest: `sha256:${'b'.repeat(64)}`,
    registered_rules: [
      { rule_id: 'rule.null_policy', rule_kind: 'null_policy', implementation_digest: `sha256:${'c'.repeat(64)}` },
      { rule_id: 'rule.transform', rule_kind: 'transform', implementation_digest: `sha256:${'c'.repeat(64)}` }
    ], accepted_rule_contract_refs: []
  });
  const mapping = {
    mapping_client_key: 'mapping-1', authority_side: 'right',
    left: { semantic_role: 'ui', logical_surface_ref: 'orders-ui', collection_path: '/orders', item_field_path: '/amount' },
    right: { semantic_role: 'authoritative_source', logical_surface_ref: 'orders-api', collection_path: '/items', item_field_path: '/amount' },
    join: { kind: 'key_equality', left_key_path: '/id', right_key_path: '/id', cardinality: 'one_to_one' },
    transform: { kind: 'registered', transform_ref: registryRule('transform') }, comparison: { kind: 'strict_equal' },
    null_policy_ref: registryRule('null_policy'), freshness: { kind: 'same_logical_snapshot' }, basis: evidence
  };
  assert.equal(validateFieldCorrespondence(mapping, index).mapping_client_key, 'mapping-1');
  assert.throws(() => validateFieldCorrespondence({ ...mapping, authority_side: 'left' }, index), /FIELD_CORRESPONDENCE_REQUIRED/u);
  assert.throws(() => validateFieldCorrespondence({ ...mapping, transform: { kind: 'registered', transform_ref: 'rule.transform' } }, index), /FIELD_CORRESPONDENCE_REQUIRED/u);
});

test('closed domains derive nonempty complements and reject overlap or incomplete closure', () => {
  const domain = {
    domain_client_key: 'domain-status', subject_ref: 'order', field_path: '/status',
    domain: { kind: 'closed_enum', members: [{ kind: 'string', value: 'open' }, { kind: 'string', value: 'closed' }], closed_world_basis: evidence },
    partitions: [
      { partition_client_key: 'target', kind: 'exact_members', semantic_role: 'target', values: [{ kind: 'string', value: 'open' }] },
      { partition_client_key: 'complement', kind: 'complement', semantic_role: 'complement', universe: { kind: 'parent_domain' }, excluded_values: [{ kind: 'string', value: 'open' }] }
    ]
  };
  const compiled = /** @type {Record<string, any>} */ (compileClosedDomain(root, domain));
  assert.deepEqual(compiled.partitions.find((/** @type {Record<string, any>} */ item) => item.semantic_role === 'complement')?.derived_members, [{ kind: 'string', value: 'closed' }]);
  const emptyComplement = structuredClone(domain);
  if (emptyComplement.partitions[1]) emptyComplement.partitions[1].excluded_values = structuredClone(domain.domain.members);
  assert.throws(() => compileClosedDomain(root, emptyComplement), /DOMAIN_CONTRACT_REQUIRED/u);
  const overlap = structuredClone(domain);
  const firstPartition = overlap.partitions[0];
  if (firstPartition?.values) firstPartition.values.push({ kind: 'string', value: 'closed' });
  assert.throws(() => compileClosedDomain(root, overlap), /DOMAIN_CONTRACT_REQUIRED/u);
});

test('open domains accept only non-exhaustive typed predicate partitions', () => {
  const predicate = { predicate_contract_client_key: 'nonblank', predicate_ref: { contract_id: 'pred', contract_kind: 'domain_predicate', semantic_root_digest: root }, mutual_exclusion_group: 'text', exhaustiveness: 'non_exhaustive_open_set', basis: evidence };
  const domain = { domain_client_key: 'open-text', subject_ref: 'order', field_path: '/note', domain: { kind: 'open_domain', boundary_description: 'User supplied text', boundary_basis: evidence }, partitions: [{ partition_client_key: 'nonblank-text', kind: 'predicate', semantic_role: 'target', predicate_contract_client_key: 'nonblank' }] };
  assert.equal(/** @type {Record<string,any>} */ (compileDomain(root, domain, [predicate])).domain.kind, 'open_domain');
  assert.throws(() => compileDomain(root, { ...domain, partitions: [{ partition_client_key: 'bad', kind: 'complement', semantic_role: 'complement', universe: { kind: 'parent_domain' }, excluded_values: [] }] }, [predicate]), /DOMAIN_CONTRACT_REQUIRED/u);
  assert.throws(() => compileDomain(root, domain, [{ ...predicate, exhaustiveness: 'closed_partition_set' }]), /DOMAIN_CONTRACT_REQUIRED/u);
});

test('population scope branches require kind-exact current-root typed refs', () => {
  const contract = { population_contract_client_key: 'population-all', scope: {
    kind: 'all_pages',
    collection_ref: { contract_id: 'collection', contract_kind: 'collection', semantic_root_digest: root },
    page_model_ref: { contract_id: 'pages', contract_kind: 'page_model', semantic_root_digest: root },
    termination_contract_ref: { contract_id: 'end', contract_kind: 'termination', semantic_root_digest: root },
    consistency_contract_ref: { contract_id: 'consistent', contract_kind: 'consistency', semantic_root_digest: root }
  } };
  assert.deepEqual(validatePopulationContract(contract, root), contract);
  const wrong = structuredClone(contract);
  wrong.scope.termination_contract_ref.contract_kind = 'snapshot';
  assert.throws(() => validatePopulationContract(wrong, root), /POPULATION_CONTRACT_REQUIRED/u);
});

test('risk review denominator is module by all nine kinds and display remains low-noise', () => {
  const riskKinds = ['null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay', 'long_content', 'pagination', 'refresh', 'business_permission_boundary'];
  const reviews = /** @type {Array<Record<string, any>>} */ (riskKinds.map((riskKind) => ({ review_client_key: `review-${riskKind}`, module_ref: 'orders', risk_kind: riskKind, risk_signal_status: 'no_signal', review_basis: [{ kind: 'claim', claim_id: 'claim-1' }] })));
  reviews[0] = {
    ...reviews[0], risk_signal_status: 'signal_found',
    risk_item: { candidate_client_key: 'risk-null', trigger_basis: [{ kind: 'claim', claim_id: 'claim-1' }], affected_refs: ['field-amount'], why_material: 'Null changes the amount meaning.', recommended_action: 'Add an explicit null case.', severity: 'critical', likelihood: 'high', evidence_confidence: 'high', testability: 'high', risk_disposition: 'formal_requirement', formal_claim_id: 'claim-1' }
  };
  const ledger = validateRiskReviews(root, ['orders'], reviews);
  assert.equal(ledger.items.length, 1);
  assert.equal(ledger.items[0].display_tier, 'primary');
  assert.throws(() => validateRiskReviews(root, ['orders'], reviews.slice(1)), /RISK_LEDGER_INVALID/u);
  const bad = structuredClone(reviews);
  if (bad[0]?.risk_item) bad[0].risk_item.why_material = '  ';
  assert.throws(() => validateRiskReviews(root, ['orders'], bad), /RISK_LEDGER_INVALID/u);
});

test('behavior requirements are stable worklist rows and every row has one formal, gap, or N/A disposition', () => {
  const semanticRuleIndex = createSemanticRuleIndex(root, { registry_digest: `sha256:${'b'.repeat(64)}`, registered_rules: [], accepted_rule_contract_refs: [] });
  const seed = /** @type {Record<string,any>} */ (deriveBehaviorContractSeed(root, {
    semanticRuleIndex, riskModuleIds: ['orders'], requirements: [{
      contract_kind: 'population', subject_ref: 'orders', intent_ref: 'all-orders-visible', basis: evidence,
      population_gap_catalog: { scope_candidates: [], proof_candidates: [] }
    }]
  }));
  assert.match(seed.required_contracts[0].required_contract_key, /^brq5_[0-9a-f]{64}$/u);
  assert.deepEqual(seed.required_contracts[0].population_gap_catalog, { scope_candidates: [], proof_candidates: [] });
  const artifact = { population_contracts: [{ population_contract_client_key: 'all-orders', scope: { kind: 'visible_region', region_contract_ref: { contract_id: 'region', contract_kind: 'region', semantic_root_digest: root } } }] };
  const reviews = [{ seed_digest: seed.seed_digest, required_contract_key: seed.required_contracts[0].required_contract_key, disposition: { kind: 'formal', contract_client_keys: ['all-orders'] } }];
  assert.equal(validateBehaviorContractReviews(seed, reviews, artifact).length, 1);
  assert.throws(() => validateBehaviorContractReviews(seed, [], artifact), /SEMANTIC_REVIEW_CANDIDATE_MISSING/u);
});
