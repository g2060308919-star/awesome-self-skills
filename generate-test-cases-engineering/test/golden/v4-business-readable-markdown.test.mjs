import assert from 'node:assert/strict';
import test from 'node:test';

const markdown = /** @type {any} */ (await import('../../src/business-markdown-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));

/** @param {Partial<any>} [overrides] @returns {any} */
function canonicalCase(overrides = {}) {
  return {
    case_id: 'CASE-primary', title: '管理员查看评价来源', module_id: 'admin', priority: 'P0',
    ordering: { business_flow_ref: null, page_action_ref: null, depends_on_case_ids: [] },
    acceptance_role: 'primary_acceptance', fact_ids: ['FACT-source'], semantic_status: 'Grounded',
    primary_test_point_id: 'TP-source-visible', supporting_observation_ids: [],
    business_preconditions: [{ precondition_id: 'PRE-login', description: '管理员已登录评价中台' }],
    data_conditions: [{ condition_id: 'DATA-source', description: '存在来源为打车去过的评价' }],
    steps: [
      { step_id: 'STEP-open', action: '打开评价列表' },
      { step_id: 'STEP-locate', action: '定位目标评价' }
    ],
    oracles: [
      { oracle_id: 'ORACLE-response', observe_after_step_id: 'STEP-open', surface: 'response', expected: '列表接口返回来源字段', claim_ids: ['CLM-response'] },
      { oracle_id: 'ORACLE-ui-b', observe_after_step_id: 'STEP-locate', surface: 'ui', expected: '来源显示为打车去过', claim_ids: ['CLM-ui'] },
      { oracle_id: 'ORACLE-ui-a', observe_after_step_id: 'STEP-locate', surface: 'ui', expected: '来源标签清晰可见', claim_ids: ['CLM-ui'] }
    ],
    ...overrides
  };
}

/** @param {boolean} [includeAuditAppendix] @returns {any} */
function fixture(includeAuditAppendix = false) {
  const affected_items = Array.from({ length: 36 }, (_, index) => ({
    item_kind: 'formal_test_point', item_id: `TP-gap-${String(index + 1).padStart(2, '0')}`,
    display_name: `评价字段 ${index + 1} 的展示规则`
  }));
  return {
    result_kind: 'delivered_with_gaps',
    ordered_case_ids: ['CASE-primary', 'CASE-boundary', 'CASE-conditional'],
    scope_manifest: {
      primary_surface: 'admin',
      modules: [
        { module_id: 'admin', name: '评价中台', role: 'primary', claim_ids: ['CLM-admin'] },
        { module_id: 'content', name: '内容服务', role: 'upstream', claim_ids: ['CLM-content-module'] }
      ],
      boundaries: [{ from: 'content', to: 'admin', channel: 'api', acceptance_scope: 'contract_only', claim_ids: ['CLM-boundary'] }]
    },
    cases: [
      canonicalCase(),
      canonicalCase({
        case_id: 'CASE-boundary', title: '内容服务返回评价来源', module_id: 'content', priority: 'P1',
        acceptance_role: 'dependency_contract', fact_ids: ['FACT-content'], primary_test_point_id: 'TP-content-source',
        ordering: { business_flow_ref: null, page_action_ref: null, depends_on_case_ids: ['CASE-primary'] },
        business_preconditions: [], data_conditions: [],
        steps: [{ step_id: 'STEP-request', action: '查询目标评价' }],
        oracles: [{ oracle_id: 'ORACLE-content', observe_after_step_id: 'STEP-request', surface: 'response', expected: '响应包含规范来源值', claim_ids: ['CLM-content'] }]
      }),
      canonicalCase({
        case_id: 'CASE-conditional', title: '未定义来源的展示策略', module_id: 'admin', priority: 'P2',
        semantic_status: 'Conditional', fact_ids: ['FACT-unknown'], primary_test_point_id: 'TP-unknown-source',
        business_preconditions: [], data_conditions: [],
        steps: [{ step_id: 'STEP-unknown', action: '打开包含未定义来源的评价' }],
        oracles: [{ oracle_id: 'ORACLE-unknown', observe_after_step_id: 'STEP-unknown', surface: 'ui', expected: '按待确认策略展示来源', claim_ids: ['CLM-unknown'] }]
      })
    ],
    coverage: {
      primary: { reviewed_formal_test_point_count: 4, covered_formal_test_point_count: 2, not_applicable_formal_test_point_count: 1 },
      boundary: { reviewed_formal_test_point_count: 1, covered_formal_test_point_count: 1, not_applicable_formal_test_point_count: 0 },
      semantic_gap_count: 1, exploratory_count: 1, not_applicable_count: 1
    },
    semantic_root_groups: [{
      root_issue_id: 'ROOT-source-policy', status: 'closed_for_delivery', title: '未定义来源的展示策略待确认', business_object: '评价来源标签',
      question: '未定义来源应保留、隐藏还是降级展示？', why_needed: '需求只说明了已知来源的展示文案',
      decision_impact: '决定未定义来源是否保留、隐藏或降级展示',
      unresolved_outcome: '相关场景只能作为有条件用例交付', affected_business_items: affected_items
    }],
    exploratory: [{
      exploratory_id: 'EXP-long-content', module_id: 'admin', title: '超长评价来源文案',
      reason: '风险目录建议检查超长内容的布局表现'
    }],
    not_applicable: [{
      not_applicable_record_id: 'NA-refresh', module_id: 'content', subject: '内容自动刷新后的来源变化',
      reason: '本次范围明确不包含自动刷新'
    }],
    render_options: { include_audit_appendix: includeAuditAppendix }
  };
}

test('v4 business Markdown starts with one scenario per overview row and follows canonical business order', () => {
  assert.equal(typeof markdown.renderBusinessMarkdownV4, 'function');
  const output = markdown.renderBusinessMarkdownV4(fixture());
  const overview = output.slice(output.indexOf('## 场景总览'), output.indexOf('## 主验收'));
  const rows = overview.split('\n').filter((/** @type {string} */ line) => /^\| (?:评价中台|内容服务) \|/u.test(line));
  assert.deepEqual(rows, [
    '| 评价中台 | P0 | 管理员查看评价来源 | 已确认 |',
    '| 内容服务 | P1 | 内容服务返回评价来源 | 已确认 |',
    '| 评价中台 | P2 | 未定义来源的展示策略 | 待确认 |'
  ]);
  assert.ok(output.indexOf('## 主验收') < output.indexOf('## 边界契约'));
  assert.ok(output.indexOf('## 边界契约') < output.indexOf('## 待确认'));
  assert.ok(output.indexOf('## 待确认') < output.indexOf('## 排除与探索'));
  assert.equal(output.endsWith('\n'), true);
});

test('v4 business Markdown keeps each expected result immediately after its owning step and is oracle-order deterministic', () => {
  const value = fixture();
  const first = markdown.renderBusinessMarkdownV4(value);
  value.cases[0].oracles.reverse();
  const second = markdown.renderBusinessMarkdownV4(value);
  assert.equal(second, first);
  const lines = first.split('\n');
  const open = lines.indexOf('1. 打开评价列表');
  const locate = lines.indexOf('2. 定位目标评价');
  assert.equal(lines[open + 1], '   - 预期（响应）：列表接口返回来源字段');
  assert.equal(lines[locate + 1], '   - 预期（界面）：来源显示为打车去过');
  assert.equal(lines[locate + 2], '   - 预期（界面）：来源标签清晰可见');

  const broken = fixture();
  broken.cases[0].oracles[0].observe_after_step_id = 'STEP-missing';
  assert.throws(() => markdown.renderBusinessMarkdownV4(broken), /ORACLE_STEP_UNRESOLVED/);
});

test('a shared root affecting 36 business items appears once while the default body exposes no internal IDs', () => {
  const output = markdown.renderBusinessMarkdownV4(fixture());
  assert.equal(output.split('### 未定义来源的展示策略待确认').length - 1, 1);
  assert.match(output, /受影响业务项：36 项/);
  assert.match(output, /评价字段 1 的展示规则/);
  assert.match(output, /评价字段 36 的展示规则/);
  assert.doesNotMatch(output, /(?:ROOT|FACT|CLM|OBL|TP|CASE|EXP|NA)-[A-Za-z0-9]/u);
  assert.doesNotMatch(output, /\b\d+\/\d+\/\d+\/\d+\b/u);
  assert.doesNotMatch(output, /需求\s*100%\s*覆盖/u);
});

test('coverage has a named denominator and parallel semantic-gap, Exploratory and NotApplicable counts', () => {
  const output = markdown.renderBusinessMarkdownV4(fixture());
  assert.match(output, /### 已审阅 formal test-point 覆盖/);
  assert.match(output, /主验收：已覆盖 2 项，已审阅 4 项/);
  assert.match(output, /边界契约：已覆盖 1 项，已审阅 1 项/);
  assert.match(output, /semantic gap：1 项/);
  assert.match(output, /Exploratory：1 项/);
  assert.match(output, /NotApplicable：1 项/);
});

test('audit IDs appear only after the opt-in appendix and the business body stays byte-identical', () => {
  const defaultOutput = markdown.renderBusinessMarkdownV4(fixture(false));
  const auditOutput = markdown.renderBusinessMarkdownV4(fixture(true));
  const marker = '\n## 审计附录\n';
  assert.equal(auditOutput.includes(marker), true);
  assert.equal(auditOutput.slice(0, auditOutput.indexOf(marker)) + '\n', defaultOutput);
  const appendix = auditOutput.slice(auditOutput.indexOf(marker));
  assert.match(appendix, /ROOT-source-policy/);
  assert.match(appendix, /TP-gap-36/);
  assert.match(appendix, /CASE-primary/);
  assert.match(appendix, /CLM-ui/);
});

test('resolved and obsolete roots remain auditable but do not reappear as delivery gaps', () => {
  const value = fixture(true);
  value.semantic_root_groups.push({
    root_issue_id: 'ROOT-resolved', status: 'resolved', title: '已经回答的历史问题', business_object: '评价标题',
    question: '标题是否展示？', why_needed: '曾经缺少展示约定', decision_impact: '影响标题预期',
    unresolved_outcome: '回答前无法形成预期',
    affected_business_items: [{ item_kind: 'formal_test_point', item_id: 'TP-resolved', display_name: '评价标题展示' }]
  });
  const output = markdown.renderBusinessMarkdownV4(value);
  const appendixAt = output.indexOf('\n## 审计附录\n');
  assert.doesNotMatch(output.slice(0, appendixAt), /已经回答的历史问题/);
  assert.match(output.slice(appendixAt), /ROOT-resolved/);
});

test('blocked-only delivery is an unresolved report and never claims test cases were generated', () => {
  const value = fixture();
  value.result_kind = 'blocked_only';
  value.ordered_case_ids = [];
  value.cases = [];
  value.coverage.primary.covered_formal_test_point_count = 0;
  value.coverage.boundary.covered_formal_test_point_count = 0;
  const output = markdown.renderBusinessMarkdownV4(value);
  assert.equal(output.startsWith('# 未决业务问题报告\n'), true);
  assert.doesNotMatch(output, /已生成(?:测试)?用例/u);
  assert.match(output, /当前没有可交付的正式测试用例/);
});

test('no-applicable delivery requires every reviewed formal point to have a verified exclusion count', () => {
  const value = fixture();
  value.result_kind = 'no_applicable_cases';
  value.ordered_case_ids = [];
  value.cases = [];
  value.semantic_root_groups = [];
  value.coverage.semantic_gap_count = 0;
  value.coverage.primary = {
    reviewed_formal_test_point_count: 1, covered_formal_test_point_count: 0, not_applicable_formal_test_point_count: 1
  };
  value.coverage.boundary = {
    reviewed_formal_test_point_count: 0, covered_formal_test_point_count: 0, not_applicable_formal_test_point_count: 0
  };
  const output = markdown.renderBusinessMarkdownV4(value);
  assert.equal(output.startsWith('# 无适用测试用例说明\n'), true);
  value.coverage.primary.not_applicable_formal_test_point_count = 0;
  assert.throws(() => markdown.renderBusinessMarkdownV4(value), /RESULT_KIND_MISMATCH/);
});

test('renderer rejects unclosed projections, mismatched counts and internal IDs smuggled into business prose', () => {
  const extra = fixture();
  extra.adapter_note = 'not canonical';
  assert.throws(() => markdown.renderBusinessMarkdownV4(extra), /MARKDOWN_PROJECTION_INVALID/);

  const mismatch = fixture();
  mismatch.coverage.semantic_gap_count = 2;
  assert.throws(() => markdown.renderBusinessMarkdownV4(mismatch), /COVERAGE_COUNT_MISMATCH/);

  const missing = fixture();
  missing.ordered_case_ids.pop();
  assert.throws(() => markdown.renderBusinessMarkdownV4(missing), /CASE_ORDER_INVALID/);

  const leaked = fixture();
  leaked.semantic_root_groups[0].why_needed = '查看ROOT-source-policy的定义';
  assert.throws(() => markdown.renderBusinessMarkdownV4(leaked), /BUSINESS_TEXT_INTERNAL_ID/);

  const openFinal = fixture();
  openFinal.semantic_root_groups[0].status = 'presented';
  assert.throws(() => markdown.renderBusinessMarkdownV4(openFinal), /RESULT_KIND_MISMATCH/);
});
