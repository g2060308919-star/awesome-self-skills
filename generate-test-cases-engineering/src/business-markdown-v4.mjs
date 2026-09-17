import { validateCaseSemanticsV4 } from './case-semantics-v4.mjs';

const RESULT_KINDS = new Set(['delivered_cases', 'delivered_with_gaps', 'blocked_only', 'no_applicable_cases']);
const ROOT_STATUSES = new Set([
  'presented', 'resolved', 'resolved_final', 'resolved_temporary',
  'deferred_by_user', 'unknown_by_user', 'closed_for_delivery', 'obsolete'
]);
const ACTIVE_ROOT_STATUSES = new Set(['presented', 'deferred_by_user', 'unknown_by_user', 'closed_for_delivery']);
const SURFACE_RANK = Object.freeze([
  'ui', 'request', 'response', 'persistence', 'event', 'callback',
  'compensation', 'side_effect', 'external_observation'
]);
const SURFACE_LABEL = Object.freeze({
  ui: '界面', request: '请求', response: '响应', persistence: '持久化', event: '事件',
  callback: '回调', compensation: '补偿', side_effect: '副作用', external_observation: '外部观察'
});
const INTERNAL_ID = /(?:ROOT|FACT|CLM|CLAIM|OBL|OBLIGATION|TP|CASE|EXP|NA)-[A-Za-z0-9_.:/#-]+/u;
const ROOT_KEYS = ['result_kind', 'ordered_case_ids', 'scope_manifest', 'cases', 'coverage', 'semantic_root_groups', 'exploratory', 'not_applicable', 'render_options'];
const GENERAL_QUALITY_ROOT_KEYS = [
  ...ROOT_KEYS, 'schema_version', 'compiler_version',
  'design_assurance_summary', 'independent_review_summary'
];
const SEMANTIC_ROOT_KEYS = ['root_issue_id', 'status', 'title', 'business_object', 'question', 'why_needed', 'decision_impact', 'unresolved_outcome', 'affected_business_items'];
const GENERAL_QUALITY_SEMANTIC_ROOT_KEYS = [
  ...SEMANTIC_ROOT_KEYS, 'root_version_digest', 'acceptance_impact', 'critical_resolution_basis'
];
const CASE_KEYS = [
  'case_id', 'title', 'module_id', 'priority', 'ordering', 'acceptance_role', 'fact_ids', 'semantic_status',
  'primary_test_point_id', 'supporting_observation_ids', 'business_preconditions', 'data_conditions', 'steps',
  'oracles', 'semantic_effects', 'baseline_spec', 'test_values'
];

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {Record<string, any>} value @param {string[]} keys @param {string} code */
function closed(value, keys, code = 'MARKDOWN_PROJECTION_INVALID') {
  const actual = Object.keys(value).sort(compareText);
  const expected = [...keys].sort(compareText);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new TypeError(code);
}

/** @param {string} left @param {string} right */
function compareText(left, right) {
  const a = left.normalize('NFC'); const b = right.normalize('NFC');
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {unknown} value @param {string} [code] */
function businessText(value, code = 'MARKDOWN_PROJECTION_INVALID') {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(code);
  const normalized = value.normalize('NFC').replace(/\r\n?/gu, '\n');
  if (INTERNAL_ID.test(normalized)) throw new TypeError('BUSINESS_TEXT_INTERNAL_ID');
  return normalized;
}

/** @param {unknown} value */
function traceId(value) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  return value.normalize('NFC');
}

/** @param {string} value */
function inline(value) {
  return businessText(value).replace(/\s+/gu, ' ').trim()
    .replace(/\\/gu, '\\\\').replace(/([`*_[\]<>#|])/gu, '\\$1');
}

/** @param {string} value */
function tableCell(value) { return inline(value); }

/** @param {unknown} value */
function nonNegativeInteger(value) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  return Number(value);
}

/** @param {unknown} values @param {string} code */
function uniqueIds(values, code = 'MARKDOWN_PROJECTION_INVALID') {
  if (!Array.isArray(values)) throw new TypeError(code);
  const normalized = values.map(traceId);
  if (new Set(normalized).size !== normalized.length) throw new TypeError(code);
  return normalized;
}

/** @param {Record<string, any>} candidate */
function validateCanonicalCase(candidate) {
  if (!record(candidate)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  const allowed = new Set(CASE_KEYS);
  if (Object.keys(candidate).some(key => !allowed.has(key))
    || CASE_KEYS.slice(0, 14).some(key => !Object.hasOwn(candidate, key))) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  if (!['Grounded', 'Conditional'].includes(candidate.semantic_status)
    || !record(candidate.ordering) || !Array.isArray(candidate.ordering.depends_on_case_ids)) {
    throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  }
  const dependencies = uniqueIds(candidate.ordering.depends_on_case_ids);
  const draft = structuredClone(candidate);
  delete draft.semantic_status;
  delete draft.ordering.depends_on_case_ids;
  const diagnostics = validateCaseSemanticsV4(draft);
  if (diagnostics.some(item => item.code === 'ORACLE_STEP_UNRESOLVED')) throw new TypeError('ORACLE_STEP_UNRESOLVED');
  if (diagnostics.length) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  const textFields = [candidate.title];
  for (const item of candidate.business_preconditions) textFields.push(item.description);
  for (const item of candidate.data_conditions) textFields.push(item.description);
  for (const item of candidate.steps) textFields.push(item.action);
  for (const item of candidate.oracles) textFields.push(item.expected);
  for (const value of textFields) businessText(value);
  return dependencies;
}

/** @param {unknown} raw */
function validateProjection(raw) {
  if (!record(raw)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  const generalQuality = raw.schema_version === '4.3.0';
  closed(raw, generalQuality ? GENERAL_QUALITY_ROOT_KEYS : ROOT_KEYS);
  if (generalQuality && (raw.compiler_version !== '0.8.0'
    || !record(raw.design_assurance_summary) || !record(raw.independent_review_summary))) {
    throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  }
  if (!RESULT_KINDS.has(raw.result_kind) || !Array.isArray(raw.cases) || !record(raw.scope_manifest)
    || !Array.isArray(raw.semantic_root_groups) || !Array.isArray(raw.exploratory)
    || !Array.isArray(raw.not_applicable) || !record(raw.coverage) || !record(raw.render_options)) {
    throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  }
  closed(raw.render_options, ['include_audit_appendix']);
  if (typeof raw.render_options.include_audit_appendix !== 'boolean') throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  if (generalQuality) {
    const assurance = raw.design_assurance_summary;
    closed(assurance, [
      'status', 'plan_revision', 'batch_count', 'rule_group_count',
      'candidate_responsibility_count', 'candidate_disposition_counts'
    ]);
    closed(assurance.candidate_disposition_counts, [
      'retained', 'representative_value', 'equivalent_merge',
      'evidence_exclusion', 'semantic_gap', 'exploratory'
    ]);
    const dispositionTotal = Object.values(assurance.candidate_disposition_counts)
      .reduce((sum, value) => sum + nonNegativeInteger(value), 0);
    const planRevision = nonNegativeInteger(assurance.plan_revision);
    const batchCount = nonNegativeInteger(assurance.batch_count);
    const ruleGroupCount = nonNegativeInteger(assurance.rule_group_count);
    const responsibilityCount = nonNegativeInteger(assurance.candidate_responsibility_count);
    if (assurance.status !== 'complete' || planRevision < 1 || batchCount < 1 || ruleGroupCount < 1
      || dispositionTotal !== responsibilityCount) {
      throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    }
    const review = raw.independent_review_summary;
    closed(review, [
      'status', 'protocol_version', 'review_mode', 'reviewer_identity_class',
      'source_first_target_count', 'target_assessment_counts', 'finding_counts',
      'review_target_digest'
    ]);
    closed(review.target_assessment_counts, ['verified', 'semantic_gap', 'evidence_excluded']);
    closed(review.finding_counts, ['confirmed', 'rejected']);
    const assessmentTotal = Object.values(review.target_assessment_counts)
      .reduce((sum, value) => sum + nonNegativeInteger(value), 0);
    for (const value of Object.values(review.finding_counts)) nonNegativeInteger(value);
    const sourceFirstTargetCount = nonNegativeInteger(review.source_first_target_count);
    if (review.status !== 'completed' || review.protocol_version !== '1.0.0'
      || review.review_mode !== 'independent_source_first'
      || !['independent_context', 'independent_agent', 'qualified_external_reviewer']
        .includes(review.reviewer_identity_class)
      || sourceFirstTargetCount < 1 || assessmentTotal !== sourceFirstTargetCount
      || !/^sha256:[0-9a-f]{64}$/u.test(review.review_target_digest)) {
      throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    }
  }

  closed(raw.scope_manifest, ['primary_surface', 'modules', 'boundaries']);
  if (!Array.isArray(raw.scope_manifest.modules) || !Array.isArray(raw.scope_manifest.boundaries)) {
    throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  }
  const modules = new Map();
  for (const item of raw.scope_manifest.modules) {
    if (!record(item)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    closed(item, ['module_id', 'name', 'role', 'claim_ids']);
    const moduleId = traceId(item.module_id);
    if (modules.has(moduleId) || !['primary', 'upstream', 'downstream', 'external'].includes(item.role)) {
      throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    }
    uniqueIds(item.claim_ids);
    modules.set(moduleId, businessText(item.name));
  }
  const primarySurface = traceId(raw.scope_manifest.primary_surface);
  const primaryModule = raw.scope_manifest.modules.find((/** @type {any} */ item) => item.module_id === primarySurface);
  if (!primaryModule || primaryModule.role !== 'primary') throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  for (const boundary of raw.scope_manifest.boundaries) {
    if (!record(boundary)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    closed(boundary, ['from', 'to', 'channel', 'acceptance_scope', 'claim_ids']);
    if (!modules.has(boundary.from) || !modules.has(boundary.to) || boundary.from === boundary.to
      || typeof boundary.channel !== 'string' || !boundary.channel.trim()
      || boundary.acceptance_scope !== 'contract_only') throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    uniqueIds(boundary.claim_ids);
  }

  const cases = new Map();
  for (const candidate of raw.cases) {
    const dependencies = validateCanonicalCase(candidate);
    const caseId = traceId(candidate.case_id);
    if (cases.has(caseId) || !modules.has(candidate.module_id) || dependencies.includes(caseId)) {
      throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    }
    cases.set(caseId, candidate);
  }
  for (const candidate of cases.values()) {
    if (candidate.ordering.depends_on_case_ids.some((/** @type {string} */ id) => !cases.has(id))) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  }
  const order = uniqueIds(raw.ordered_case_ids, 'CASE_ORDER_INVALID');
  if (order.length !== cases.size || order.some(id => !cases.has(id))) throw new TypeError('CASE_ORDER_INVALID');

  closed(raw.coverage, ['primary', 'boundary', 'semantic_gap_count', 'exploratory_count', 'not_applicable_count']);
  const countPair = (/** @type {any} */ pair) => {
    if (!record(pair)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    closed(pair, ['reviewed_formal_test_point_count', 'covered_formal_test_point_count', 'not_applicable_formal_test_point_count']);
    const reviewed = nonNegativeInteger(pair.reviewed_formal_test_point_count);
    const covered = nonNegativeInteger(pair.covered_formal_test_point_count);
    const notApplicable = nonNegativeInteger(pair.not_applicable_formal_test_point_count);
    if (covered > reviewed || covered + notApplicable > reviewed) throw new TypeError('COVERAGE_COUNT_MISMATCH');
    return { reviewed, covered, notApplicable };
  };
  const primary = countPair(raw.coverage.primary);
  const boundary = countPair(raw.coverage.boundary);
  const gapCount = nonNegativeInteger(raw.coverage.semantic_gap_count);
  const exploratoryCount = nonNegativeInteger(raw.coverage.exploratory_count);
  const notApplicableCount = nonNegativeInteger(raw.coverage.not_applicable_count);

  const rootIds = new Set();
  for (const root of raw.semantic_root_groups) {
    if (!record(root)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    closed(root, generalQuality ? GENERAL_QUALITY_SEMANTIC_ROOT_KEYS : SEMANTIC_ROOT_KEYS);
    const rootId = traceId(root.root_issue_id);
    if (rootIds.has(rootId) || !ROOT_STATUSES.has(root.status)
      || !Array.isArray(root.affected_business_items) || root.affected_business_items.length === 0) {
      throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    }
    rootIds.add(rootId);
    for (const field of ['title', 'business_object', 'question', 'why_needed', 'decision_impact', 'unresolved_outcome']) businessText(root[field]);
    const members = new Set();
    for (const member of root.affected_business_items) {
      if (!record(member)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
      closed(member, ['item_kind', 'item_id', 'display_name']);
      if (!['formal_test_point', 'case', 'business_outcome', 'risk'].includes(member.item_kind)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
      const memberId = `${member.item_kind}\0${traceId(member.item_id)}`;
      if (members.has(memberId)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
      members.add(memberId); businessText(member.display_name);
    }
  }

  const exploratoryIds = new Set();
  for (const item of raw.exploratory) {
    if (!record(item)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    closed(item, ['exploratory_id', 'module_id', 'title', 'reason']);
    const id = traceId(item.exploratory_id);
    if (exploratoryIds.has(id) || !modules.has(item.module_id)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    exploratoryIds.add(id); businessText(item.title); businessText(item.reason);
  }
  const notApplicableIds = new Set();
  for (const item of raw.not_applicable) {
    if (!record(item)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    closed(item, ['not_applicable_record_id', 'module_id', 'subject', 'reason']);
    const id = traceId(item.not_applicable_record_id);
    if (notApplicableIds.has(id) || !modules.has(item.module_id)) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
    notApplicableIds.add(id); businessText(item.subject); businessText(item.reason);
  }
  const activeRoots = raw.semantic_root_groups.filter((/** @type {any} */ root) => ACTIVE_ROOT_STATUSES.has(root.status));
  if (gapCount !== activeRoots.length || exploratoryCount !== raw.exploratory.length
    || notApplicableCount !== raw.not_applicable.length) throw new TypeError('COVERAGE_COUNT_MISMATCH');
  if ((raw.result_kind === 'delivered_cases' && (cases.size === 0 || gapCount !== 0))
    || (raw.result_kind === 'delivered_with_gaps' && (cases.size === 0 || gapCount === 0 || activeRoots.some((/** @type {any} */ root) => root.status !== 'closed_for_delivery')))
    || (raw.result_kind === 'blocked_only' && (cases.size !== 0 || gapCount === 0 || primary.covered !== 0 || boundary.covered !== 0
      || activeRoots.some((/** @type {any} */ root) => root.status !== 'closed_for_delivery')))
    || (raw.result_kind === 'no_applicable_cases' && (cases.size !== 0 || gapCount !== 0 || notApplicableCount === 0
      || primary.reviewed === 0 || primary.covered !== 0 || boundary.covered !== 0
      || primary.notApplicable !== primary.reviewed || boundary.notApplicable !== boundary.reviewed))) {
    throw new TypeError('RESULT_KIND_MISMATCH');
  }
  return { raw, modules, cases, order, primary, boundary, gapCount, exploratoryCount, notApplicableCount, activeRoots };
}

/** @param {string[]} lines @param {any[]} items @param {string} empty */
function renderNumberedDescriptions(lines, items, empty) {
  if (items.length === 0) { lines.push(`_${empty}_`); return; }
  for (let index = 0; index < items.length; index += 1) lines.push(`${index + 1}. ${inline(items[index].description)}`);
}

/** @param {string[]} lines @param {any} candidate @param {Map<string,string>} modules */
function renderCase(lines, candidate, modules) {
  const moduleName = modules.get(candidate.module_id);
  if (moduleName === undefined) throw new TypeError('MARKDOWN_PROJECTION_INVALID');
  lines.push(`### ${inline(candidate.title)}`);
  lines.push(`- 模块：${inline(moduleName)}`);
  lines.push(`- 优先级：${candidate.priority}`);
  lines.push(`- 状态：${candidate.semantic_status === 'Grounded' ? '已确认' : '待确认'}`);
  lines.push('');
  lines.push('#### 前置条件');
  renderNumberedDescriptions(lines, candidate.business_preconditions, '无额外业务前置条件。');
  lines.push('');
  lines.push('#### 数据条件');
  renderNumberedDescriptions(lines, candidate.data_conditions, '无额外数据条件。');
  lines.push('');
  lines.push('#### 步骤与预期');
  const stepIndex = new Map(candidate.steps.map((/** @type {any} */ step, /** @type {number} */ index) => [step.step_id, index]));
  const oracles = [...candidate.oracles].sort((left, right) => {
    const leftStep = stepIndex.get(left.observe_after_step_id);
    const rightStep = stepIndex.get(right.observe_after_step_id);
    if (leftStep === undefined || rightStep === undefined) throw new TypeError('ORACLE_STEP_UNRESOLVED');
    return leftStep - rightStep || SURFACE_RANK.indexOf(left.surface) - SURFACE_RANK.indexOf(right.surface)
      || compareText(left.expected, right.expected) || compareText(left.oracle_id, right.oracle_id);
  });
  for (let index = 0; index < candidate.steps.length; index += 1) {
    const step = candidate.steps[index];
    lines.push(`${index + 1}. ${inline(step.action)}`);
    for (const oracle of oracles) if (oracle.observe_after_step_id === step.step_id) {
      const surface = /** @type {keyof typeof SURFACE_LABEL} */ (oracle.surface);
      lines.push(`   - 预期（${SURFACE_LABEL[surface]}）：${inline(oracle.expected)}`);
    }
  }
  lines.push('');
}

/** @param {string[]} lines @param {string} title @param {any[]} cases @param {Map<string,string>} modules */
function renderCaseSection(lines, title, cases, modules) {
  lines.push(`## ${title}`);
  lines.push('');
  if (cases.length === 0) { lines.push('_无。_'); lines.push(''); return; }
  for (const candidate of cases) renderCase(lines, candidate, modules);
}

/** @param {string[]} lines @param {ReturnType<typeof validateProjection>} view */
function renderQualityAssurance(lines, view) {
  if (view.raw.schema_version !== '4.3.0') return;
  const design = view.raw.design_assurance_summary;
  const review = view.raw.independent_review_summary;
  lines.push('## 设计保障与独立审查', '');
  lines.push(`- 设计保障：计划修订 ${design.plan_revision}；${design.batch_count} 个批次、${design.rule_group_count} 个规则组、${design.candidate_responsibility_count} 项候选验证责任均已处置。`);
  lines.push(`- 独立审查：${review.source_first_target_count} 个来源优先目标均已评估；确认发现 ${review.finding_counts.confirmed} 项，驳回发现 ${review.finding_counts.rejected} 项。`);
  lines.push('_上述记录用于过程审计，不提升业务证据等级。_', '');
}

/** @param {string[]} lines @param {ReturnType<typeof validateProjection>} view */
function renderAudit(lines, view) {
  lines.push('## 审计附录');
  lines.push('');
  lines.push('_以下技术标识仅用于机器追踪，不属于业务执行正文。_');
  lines.push('');
  lines.push('### Case 追踪');
  for (const caseId of view.order) {
    const candidate = view.cases.get(caseId);
    const oracleRefs = candidate.oracles.map((/** @type {any} */ oracle) =>
      `${oracle.oracle_id} → ${oracle.observe_after_step_id} [${oracle.claim_ids.join(', ')}]`).join('；');
    lines.push(`- \`${candidate.case_id}\`：Fact [${candidate.fact_ids.join(', ')}]；主要 Test Point \`${candidate.primary_test_point_id}\`；Oracle ${oracleRefs}`);
  }
  lines.push('');
  lines.push('### Semantic root 追踪');
  for (const root of view.raw.semantic_root_groups) {
    const members = root.affected_business_items.map((/** @type {any} */ item) => `${item.item_kind}:${item.item_id}`).join('；');
    lines.push(`- \`${root.root_issue_id}\`：${members}`);
  }
  lines.push('');
  lines.push('### 排除与探索追踪');
  for (const item of view.raw.not_applicable) lines.push(`- NotApplicable：\`${item.not_applicable_record_id}\``);
  for (const item of view.raw.exploratory) lines.push(`- Exploratory：\`${item.exploratory_id}\``);
  if (view.raw.schema_version === '4.3.0') {
    lines.push(`- 当前独立审查目标：\`${view.raw.independent_review_summary.review_target_digest}\``);
  }
  lines.push('');
}

/**
 * Render the business-facing Markdown from the compiler-owned canonical Case
 * Document projection and its already-compiled presentation order. Technical
 * identities stay in the optional audit appendix; they are never needed to
 * understand or execute the business body.
 * @param {unknown} input
 */
export function renderBusinessMarkdownV4(input) {
  const view = validateProjection(structuredClone(input));
  const orderedCases = view.order.map(caseId => view.cases.get(caseId));
  const title = view.raw.result_kind === 'blocked_only' ? '未决业务问题报告'
    : view.raw.result_kind === 'no_applicable_cases' ? '无适用测试用例说明'
      : view.raw.result_kind === 'delivered_with_gaps' ? '人工功能测试用例（含待确认项）' : '人工功能测试用例';
  const lines = [`# ${title}`, '', '## 场景总览', ''];
  if (orderedCases.length === 0) lines.push('_当前没有可交付的正式测试用例。_');
  else {
    lines.push('| 模块 | 优先级 | 标题 | 状态 |');
    lines.push('| --- | --- | --- | --- |');
    for (const candidate of orderedCases) lines.push(`| ${tableCell(view.modules.get(candidate.module_id))} | ${candidate.priority} | ${tableCell(candidate.title)} | ${candidate.semantic_status === 'Grounded' ? '已确认' : '待确认'} |`);
  }
  lines.push('');

  renderQualityAssurance(lines, view);

  renderCaseSection(lines, '主验收', orderedCases.filter(item => item.acceptance_role === 'primary_acceptance' && item.semantic_status === 'Grounded'), view.modules);
  renderCaseSection(lines, '边界契约', orderedCases.filter(item => item.acceptance_role === 'dependency_contract' && item.semantic_status === 'Grounded'), view.modules);
  const contextCases = orderedCases.filter(item => item.acceptance_role === 'context_only' && item.semantic_status === 'Grounded');
  if (contextCases.length) renderCaseSection(lines, '上下文追踪', contextCases, view.modules);

  lines.push('## 待确认');
  lines.push('');
  const conditional = orderedCases.filter(item => item.semantic_status === 'Conditional');
  if (conditional.length === 0 && view.activeRoots.length === 0) { lines.push('_无。_'); lines.push(''); }
  for (const candidate of conditional) renderCase(lines, candidate, view.modules);
  for (const root of view.activeRoots) {
    lines.push(`### ${inline(root.title)}`);
    lines.push(`- 业务对象：${inline(root.business_object)}`);
    lines.push(`- 待确认问题：${inline(root.question)}`);
    lines.push(`- 提问原因：${inline(root.why_needed)}`);
    lines.push(`- 决策影响：${inline(root.decision_impact)}`);
    lines.push(`- 未处理结果：${inline(root.unresolved_outcome)}`);
    lines.push(`- 受影响业务项：${root.affected_business_items.length} 项`);
    for (const item of root.affected_business_items) lines.push(`  - ${inline(item.display_name)}`);
    lines.push('');
  }

  lines.push('## 排除与探索');
  lines.push('');
  lines.push('### 已确认不适用');
  if (view.raw.not_applicable.length === 0) lines.push('_无。_');
  for (const item of view.raw.not_applicable) lines.push(`- ${inline(view.modules.get(item.module_id))}｜${inline(item.subject)}：${inline(item.reason)}`);
  lines.push('');
  lines.push('### 探索建议');
  if (view.raw.exploratory.length === 0) lines.push('_无。_');
  for (const item of view.raw.exploratory) lines.push(`- ${inline(view.modules.get(item.module_id))}｜${inline(item.title)}：${inline(item.reason)}`);
  lines.push('');

  lines.push('## 覆盖情况');
  lines.push('');
  lines.push('### 已审阅 formal test-point 覆盖');
  lines.push(`- 主验收：已覆盖 ${view.primary.covered} 项，已审阅 ${view.primary.reviewed} 项，其中 NotApplicable ${view.primary.notApplicable} 项`);
  lines.push(`- 边界契约：已覆盖 ${view.boundary.covered} 项，已审阅 ${view.boundary.reviewed} 项，其中 NotApplicable ${view.boundary.notApplicable} 项`);
  lines.push(`- semantic gap：${view.gapCount} 项`);
  lines.push(`- Exploratory：${view.exploratoryCount} 项`);
  lines.push(`- NotApplicable：${view.notApplicableCount} 项`);

  const body = lines.join('\n');
  if (!view.raw.render_options.include_audit_appendix) return `${body}\n`;
  /** @type {string[]} */
  const appendix = [];
  renderAudit(appendix, view);
  return `${body}\n${appendix.join('\n')}`;
}
