/** @param {string} value */
const sha = value => `sha256:${value.repeat(64).slice(0, 64)}`;

/** @returns {any} */
export function candidateDeliveryInput() {
  const riskKinds = [
    'null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay',
    'long_content', 'pagination', 'refresh', 'business_permission_boundary'
  ];
  return {
    run_id: 'RUN-42424242-4242-4242-8242-424242424242',
    completed_at: '2026-09-15T00:00:00.000Z',
    bundle: {
      schema_version: '4.2.0', compiler_version: '0.7.0',
      delivery_intent: 'case_document', source_revision: 2,
      result_kind: 'delivered_cases', ordered_case_ids: ['CASE-flow'],
      scope_manifest: {
        primary_surface: 'admin',
        modules: [{ module_id: 'admin', name: '评价中台', role: 'primary', claim_ids: ['CLM-scope'] }],
        boundaries: []
      },
      cases: [{
        case_id: 'CASE-flow', title: '新增<script>alert(1)</script>并下线评价',
        module_id: 'admin', priority: 'P0',
        ordering: { business_flow_ref: 'FLOW-review', page_action_ref: null, depends_on_case_ids: [] },
        acceptance_role: 'primary_acceptance', fact_ids: ['FACT-flow'],
        semantic_status: 'Conditional', primary_test_point_id: 'TP-flow',
        supporting_observation_ids: ['OBS-saved'],
        business_preconditions: [{ precondition_id: 'PRE-login', description: '管理员已登录' }],
        data_conditions: [{ condition_id: 'DATA-new', description: '使用本用例新建的评价对象' }],
        steps: [
          { step_id: 'STEP-create', action: '新建评价并保存' },
          { step_id: 'STEP-disable', action: '定位本用例创建的评价并下线' }
        ],
        oracles: [
          { oracle_id: 'ORACLE-saved', observe_after_step_id: 'STEP-create', surface: 'ui', expected: '同一评价显示为已保存', claim_ids: ['CLM-save'] },
          { oracle_id: 'ORACLE-disabled', observe_after_step_id: 'STEP-disable', surface: 'ui', expected: '同一评价最终显示为已下线', claim_ids: ['CLM-disable'] }
        ]
      }],
      coverage: {
        primary: { reviewed_formal_test_point_count: 1, covered_formal_test_point_count: 1, not_applicable_formal_test_point_count: 0 },
        boundary: { reviewed_formal_test_point_count: 0, covered_formal_test_point_count: 0, not_applicable_formal_test_point_count: 0 },
        semantic_gap_count: 0, exploratory_count: 9, not_applicable_count: 0
      },
      semantic_root_groups: [],
      exploratory: riskKinds.map(kind => ({ exploratory_id: `EXP-${kind}`, module_id: 'admin', title: `${kind} 风险`, reason: '风险目录建议探索检查' })),
      not_applicable: [],
      risk_review_ledger: riskKinds.map(kind => ({
        module_id: 'admin', risk_kind: kind, acceptance_role: 'primary_acceptance',
        status: 'exploratory', review_basis: { kind: 'risk_catalog', policy_id: `risk.${kind}`, policy_version: '1.0.0' },
        exploratory_ids: [`EXP-${kind}`]
      }))
    },
    source_reading: {
      version: '1.0.0', source_binding_digest: sha('a'),
      scope: {
        mode: 'online_document', root_ref: 'cooper:prd-42',
        collection_window: { started_at: '2026-09-15T00:00:00.000Z', ended_at: '2026-09-15T00:01:00.000Z' },
        source_version: '17'
      },
      status: 'complete_within_scope',
      items: [
        { item_id: 'body', parent_item_id: null, channel: 'body', acquisition_status: 'acquired', review_status: 'reviewed', source_id: 'SRC-prd', asset_id: null },
        { item_id: 'comment-1', parent_item_id: null, channel: 'comment', acquisition_status: 'acquired', review_status: 'reviewed', source_id: 'SRC-comment-1', asset_id: null },
        { item_id: 'reply-1', parent_item_id: 'comment-1', channel: 'reply', acquisition_status: 'acquired', review_status: 'reviewed', source_id: 'SRC-comment-1', asset_id: null }
      ],
      limitations: []
    },
    render_options: { include_audit_appendix: false },
    non_blocking_diagnostics: []
  };
}
