import { mkdir, writeFile } from 'node:fs/promises';

const outputDirectory = new URL('../tests/fixtures/v5/requests/', import.meta.url);
const binding = () => ({ $fixture_binding: 'required' });
const evidence = (claimId = 'claim-save') => [{ kind: 'claim', claim_id: claimId }];
const riskKinds = [
  'null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay',
  'long_content', 'pagination', 'refresh', 'business_permission_boundary'
];

function oracle(index) {
  const claimId = index === 0 ? 'claim-save' : 'claim-message';
  return {
    oracle_contract_client_key: `oracle-contract-${index}`,
    formal_test_point_id: `tp-${index}`,
    observation_ref: { kind: 'response', logical_surface_ref: 'orders-api', subject_ref: claimId, field_path: '/status' },
    assertion: { kind: 'exact_text', expected_text: index === 0 ? 'saved' : 'success' },
    evaluation_scope: { kind: 'single' }, observation_window: { kind: 'after_step' }, basis: evidence(claimId)
  };
}

function artifact() {
  return {
    behavior_contract_seed_digest: binding(),
    field_correspondences: [], value_states: [], predicate_contracts: [], domain_contracts: [], behavior_equivalence_contracts: [],
    population_contracts: [], population_proofs: [], permission_auxiliary_contracts: [],
    oracle_semantic_contracts: [oracle(0), oracle(1)],
    behavior_contract_reviews: [0, 1].map((index) => ({ seed_digest: binding(), required_contract_key: binding(), disposition: { kind: 'formal', contract_client_keys: [`oracle-contract-${index}`] } })),
    permission_matrix_reviews: [],
    risk_reviews: ['claim-save', 'claim-message'].flatMap((moduleRef) => riskKinds.map((riskKind) => ({ review_client_key: `risk-${moduleRef}-${riskKind}`, module_ref: moduleRef, risk_kind: riskKind, risk_signal_status: 'no_signal', review_basis: evidence() }))),
    semantic_gap_proposals: [], formal_test_point_ids: ['tp-0', 'tp-1']
  };
}

function request(kind) {
  const current = artifact();
  if (kind === 'oracle') current.oracle_semantic_contracts[0].assertion = { expected: '结果正常' };
  if (kind === 'field') current.field_correspondences.push({
    mapping_client_key: 'mapping-invalid', authority_side: 'right',
    left: { semantic_role: 'ui', logical_surface_ref: 'orders-ui', collection_path: '/orders', item_field_path: '/status' },
    right: { semantic_role: 'authoritative_source', logical_surface_ref: 'orders-api', collection_path: '/items', item_field_path: '/status' },
    join: { kind: 'singleton' }, transform: { kind: 'identity' }, comparison: { kind: 'strict_equal' },
    null_policy_ref: { source: 'closed_registry', registry_digest: `sha256:${'0'.repeat(64)}`, rule_id: 'missing', rule_kind: 'null_policy', implementation_digest: `sha256:${'1'.repeat(64)}` },
    freshness: { kind: 'same_logical_snapshot' }, basis: evidence()
  });
  if (kind === 'value') current.value_states.push({ axes: 'render_only', render_state: { presence: 'rendered', content: { kind: 'text', value: '' } } });
  if (kind === 'domain') current.domain_contracts.push({ domain_client_key: 'empty', subject_ref: 'orders', field_path: '/status', domain: { kind: 'closed_enum', members: [], closed_world_basis: evidence() }, partitions: [] });
  if (kind === 'population') current.population_contracts.push({ population_contract_client_key: 'wrong-kind', scope: { kind: 'current_response', collection_ref: { contract_id: 'orders', contract_kind: 'snapshot', semantic_root_digest: binding() } } });
  if (kind === 'permission') current.permission_matrix_reviews.push({ matrix_id: 'unadvertised', seed_digest: `sha256:${'2'.repeat(64)}`, cell_dispositions: [] });
  if (kind === 'risk') current.risk_reviews.shift();
  return { idempotency_key: `fixture-behavior-${kind}`, action: { kind: 'submit_artifact', action_token: binding(), artifact_kind: 'behavior_views', artifact: current } };
}

await mkdir(outputDirectory, { recursive: true });
for (const kind of ['oracle', 'field', 'value', 'domain', 'population', 'permission', 'risk']) {
  await writeFile(new URL(`behavior-invalid-${kind}.json`, outputDirectory), `${JSON.stringify(request(kind), null, 2)}\n`);
}
