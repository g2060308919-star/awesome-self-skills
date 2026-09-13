const root = `sha256:${'a'.repeat(64)}`;

/** @param {string} key @param {string} claimId @param {Record<string,any>} classification @returns {Record<string,any>} */
function draft(key, claimId, classification = {}) {
  const stepKey = `step-${key}`;
  return {
    case_client_key: key, title: `Case ${key}`, module_id: 'orders', priority: 'P1',
    ordering: { business_flow_ref: 'orders-flow', page_action_ref: null }, acceptance_role: 'primary_acceptance',
    fact_ids: [`fact-${claimId}`], primary_test_point_id: `tp-${key}`, supporting_observation_ids: [],
    business_preconditions: [{ precondition_id: `precondition-${key}`, description: '已登录' }],
    data_conditions: [{ condition_id: `condition-${key}`, description: '订单状态为 draft' }],
    steps: [{ step_client_key: stepKey, action: `execute ${key}` }],
    case_step_semantic_bindings: [{ case_client_key: key, step_client_key: stepKey, action_ref: { action_id: `action-${key}`, semantic_root_digest: root } }],
    domain_selections: [],
    oracles: [{ oracle_client_key: `oracle-${key}`, oracle_semantic_contract_id: `osc-${key}`, observe_after_step_client_key: stepKey, observation_ref: { kind: 'response', logical_surface_ref: 'order-api', subject_ref: 'order', field_path: '/status' }, assertion: { kind: 'exact_text', expected_text: `done-${key}` }, evaluation_scope: { kind: 'single' }, observation_window: { kind: 'after_step' }, claim_ids: [claimId] }],
    ...classification
  };
}

/** @returns {Record<string,any>} */
export function caseOutputFixture() {
  const caseDrafts = [
    draft('grounded', 'claim-e2'),
    draft('conditional', 'claim-e1'),
    draft('blocked', 'claim-e2'),
    draft('not-applicable', 'claim-e2'),
    draft('exploratory', 'claim-e2')
  ];
  return {
    case_document_lineage_id: 'lineage-output', semantic_root_digest: root, source_revision: 7,
    case_drafts: caseDrafts,
    claim_assessments: [{ claim_id: 'claim-e2', level: 'E2', support_review: 'supported' }, { claim_id: 'claim-e1', level: 'E1', support_review: 'supported' }],
    fact_assessments: [
      { fact_id: 'fact-claim-e2', claim_ids: ['claim-e2'] },
      { fact_id: 'fact-claim-e1', claim_ids: ['claim-e1'] }
    ],
    accepted_gap_ids: ['gap-delivery-closed'],
    formal_test_point_dispositions: [
      { formal_test_point_id: 'tp-grounded', kind: 'formal' },
      { formal_test_point_id: 'tp-conditional', kind: 'formal' },
      { formal_test_point_id: 'tp-blocked', kind: 'semantic_gap', semantic_gap_ids: ['gap-delivery-closed'] },
      { formal_test_point_id: 'tp-not-applicable', kind: 'not_applicable', exclusion_basis: [{ kind: 'claim', claim_id: 'claim-e2' }] },
      { formal_test_point_id: 'tp-exploratory', kind: 'exploratory', observation_intent: 'Observe retry latency without asserting a product requirement.' }
    ],
    formal_test_point_ids: ['tp-grounded', 'tp-conditional', 'tp-blocked', 'tp-not-applicable'],
    oracle_semantic_contracts: caseDrafts.flatMap((current) => current.oracles.map((/** @type {Record<string,any>} */ oracle) => ({
      oracle_semantic_contract_id: oracle.oracle_semantic_contract_id,
      observation_ref: oracle.observation_ref, assertion: oracle.assertion,
      evaluation_scope: oracle.evaluation_scope, observation_window: oracle.observation_window
    }))),
    semantic_partitions: [{ partition_id: 'partition-target', disposition: 'covered' }, { partition_id: 'partition-other', disposition: 'gap' }],
    value_instances: [{ value_instance_id: 'value-draft', disposition: 'covered' }],
    permission_cells: [
      { required_cell_key: 'cell-decision', permission_dimension: 'decision', action_ref: 'view', disposition: 'formal', expected: 'allow' },
      { required_cell_key: 'cell-denial', permission_dimension: 'denial_behavior', action_ref: 'view', disposition: 'not_applicable' },
      { required_cell_key: 'cell-scope', permission_dimension: 'data_scope', action_ref: 'view', disposition: 'semantic_gap' }
    ],
    risk_ledger: { reviewed_cell_count: 9, items: [{ risk_key: 'risk-api', risk_kind: 'api_failure', display_tier: 'primary' }, { risk_key: 'risk-refresh', risk_kind: 'refresh', display_tier: 'background' }] },
    semantic_audit: {
      value_states: [{ axes: 'data_and_render', data_state: { presence: 'present', value: { kind: 'number', value: 0 } }, render_state: { presence: 'rendered', content: { kind: 'formatted_value', value: '0', format_ref: 'decimal' } } }],
      field_correspondences: [{ mapping_id: 'mapping-order-status', authority_side: 'right' }],
      domains: [{ domain_contract_id: 'domain-status', kind: 'closed_enum', partition_ids: ['partition-target', 'partition-other'] }],
      populations: [{ population_contract_id: 'population-response', scope_kind: 'current_response' }]
    }
  };
}
