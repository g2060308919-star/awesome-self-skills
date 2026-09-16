const SURFACE_RANK = Object.freeze([
  'ui', 'request', 'response', 'persistence', 'event', 'callback',
  'compensation', 'side_effect', 'external_observation'
]);
/** @type {Readonly<Record<string,string>>} */
const SURFACE_LABEL = Object.freeze({
  ui: '界面', request: '请求', response: '响应', persistence: '持久化', event: '事件',
  callback: '回调', compensation: '补偿', side_effect: '副作用', external_observation: '外部观察'
});
/** @type {Readonly<Record<string,string>>} */
const ACCEPTANCE_ROLE_LABEL = Object.freeze({
  primary_acceptance: '主验收', dependency_contract: '边界契约', context_only: '上下文'
});
/** @type {Readonly<Record<string,string>>} */
const VALUE_ORIGIN_LABEL = Object.freeze({
  requirement: '需求指定', example: '可替换示例', derived: '合法推导', temporary_assumption: '临时口径'
});
const ACTIVE_ROOT_STATUSES = new Set(['presented', 'deferred_by_user', 'unknown_by_user', 'closed_for_delivery']);
/** @type {Readonly<Record<string,{title:string,empty:string}>>} */
const RESULT_COPY = Object.freeze({
  delivered_cases: {
    title: '人工功能测试用例', empty: '当前正式结果没有 Case。'
  },
  delivered_with_gaps: {
    title: '人工功能测试用例（含待确认项）', empty: '当前仅有待确认事项，没有可交付的正式 Case。'
  },
  blocked_only: {
    title: '未决业务问题报告', empty: '没有可交付的正式 Case；以下未决事项会影响业务判定。'
  },
  no_applicable_cases: {
    title: '无适用测试用例说明', empty: '经有依据的适用性审阅，当前范围没有适用的正式 Case。'
  }
});

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {string} left @param {string} right */
function compareText(left, right) {
  const a = left.normalize('NFC'); const b = right.normalize('NFC');
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {unknown} value */
function html(value) {
  /** @type {Record<string,string>} */
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').normalize('NFC').replace(/[&<>"']/gu, character => ({
    ...entities
  })[character] ?? character);
}

/** @param {unknown} value */
function legacyTableCell(value) {
  return String(value ?? '').normalize('NFC').replace(/\s+/gu, ' ').trim()
    .replace(/[\\`*_[\]{}()#+\-.!<>|]/gu, '\\$&');
}

/** @param {any} candidate */
function orderedOracles(candidate) {
  const stepIndex = new Map(candidate.steps.map((/** @type {any} */ step, /** @type {number} */ index) => [step.step_id, index + 1]));
  return [...candidate.oracles].sort((left, right) => {
    const leftStep = stepIndex.get(left.observe_after_step_id);
    const rightStep = stepIndex.get(right.observe_after_step_id);
    if (!leftStep || !rightStep) throw new TypeError('ORACLE_STEP_UNRESOLVED');
    return leftStep - rightStep || SURFACE_RANK.indexOf(left.surface) - SURFACE_RANK.indexOf(right.surface)
      || compareText(left.expected, right.expected) || compareText(left.oracle_id, right.oracle_id);
  });
}

/**
 * Build the one canonical presentation projection used by HTML and the chat
 * table. It never invents order, evidence, or a second business result.
 * @param {unknown} bundle
 */
export function buildCaseDocumentPresentationV4(bundle, renderOptions = { include_audit_appendix: false }) {
  if (!record(bundle) || !Array.isArray(bundle.cases) || !Array.isArray(bundle.ordered_case_ids)
    || !record(bundle.scope_manifest) || !Array.isArray(bundle.scope_manifest.modules)) {
    throw new TypeError('CASE_DOCUMENT_INVALID');
  }
  const resultCopy = RESULT_COPY[bundle.result_kind];
  if (!resultCopy || !record(renderOptions) || typeof renderOptions.include_audit_appendix !== 'boolean') {
    throw new TypeError('CASE_DOCUMENT_INVALID');
  }
  const modules = new Map(bundle.scope_manifest.modules.map((/** @type {any} */ item) => [item.module_id, item.name]));
  const cases = new Map(bundle.cases.map((/** @type {any} */ item) => [item.case_id, item]));
  if (cases.size !== bundle.cases.length || bundle.ordered_case_ids.length !== cases.size
    || new Set(bundle.ordered_case_ids).size !== bundle.ordered_case_ids.length
    || bundle.ordered_case_ids.some((/** @type {unknown} */ id) => typeof id !== 'string' || !cases.has(id))) {
    throw new TypeError('CASE_ORDER_INVALID');
  }
  const rows = bundle.ordered_case_ids.map((/** @type {string} */ caseId, /** @type {number} */ index) => {
    const candidate = cases.get(caseId);
    const moduleName = modules.get(candidate.module_id);
    if (typeof moduleName !== 'string' || !moduleName.trim()) throw new TypeError('MODULE_MANIFEST_INVALID');
    const stepIndex = new Map(candidate.steps.map((/** @type {any} */ step, /** @type {number} */ index) => [step.step_id, index + 1]));
    const oracles = orderedOracles(candidate).map((/** @type {any} */ item) => ({
      oracle_id: item.oracle_id,
      step_number: stepIndex.get(item.observe_after_step_id),
      surface: item.surface,
      expected: item.expected
    }));
    return {
      ordinal: index + 1,
      case_id: candidate.case_id,
      module: moduleName,
      title: candidate.title,
      priority: candidate.priority,
      evidence_status: candidate.semantic_status === 'Grounded' ? '依据明确' : '含临时口径',
      acceptance_role: candidate.acceptance_role,
      acceptance_role_label: ACCEPTANCE_ROLE_LABEL[candidate.acceptance_role],
      primary_test_point_id: candidate.primary_test_point_id,
      business_flow_ref: candidate.ordering.business_flow_ref,
      preconditions: candidate.business_preconditions.map((/** @type {any} */ item) => item.description),
      data_conditions: candidate.data_conditions.map((/** @type {any} */ item) => item.description),
      steps: candidate.steps.map((/** @type {any} */ item, /** @type {number} */ step) => ({ number: step + 1, action: item.action })),
      test_values: (candidate.test_values ?? []).map((/** @type {any} */ item) => ({
        field_path: item.field_path,
        value: structuredClone(item.value),
        origin: item.value_origin.kind,
        origin_label: VALUE_ORIGIN_LABEL[item.value_origin.kind]
      })),
      baseline: candidate.baseline_spec ? {
        reference: candidate.baseline_spec.reference,
        comparison_contract: structuredClone(candidate.baseline_spec.comparison_contract)
      } : null,
      semantic_effects: (candidate.semantic_effects ?? []).map((/** @type {any} */ item) => ({
        kind: item.kind, subject: item.subject,
        ...(Object.hasOwn(item, 'before') ? { before: item.before } : {}), after: item.after
      })),
      oracles
    };
  });
  return {
    result_kind: bundle.result_kind,
    title: resultCopy.title,
    empty_message: resultCopy.empty,
    case_count: rows.length,
    coverage: structuredClone(bundle.coverage),
    semantic_roots: bundle.semantic_root_groups
      .filter((/** @type {any} */ item) => ACTIVE_ROOT_STATUSES.has(item.status))
      .map((/** @type {any} */ item) => structuredClone(item)),
    exploratory: bundle.exploratory.map((/** @type {any} */ item) => ({
      ...structuredClone(item), module: modules.get(item.module_id)
    })),
    not_applicable: bundle.not_applicable.map((/** @type {any} */ item) => ({
      ...structuredClone(item), module: modules.get(item.module_id)
    })),
    render_options: structuredClone(renderOptions),
    rows
  };
}

/** @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation */
export function renderLegacyCaseTableV42(presentation) {
  const lines = [
    '| 序号 | 模块 | 用例/流程名称 | 预期结果 | 优先级 | 依据状态 |',
    '| ---: | --- | --- | --- | --- | --- |'
  ];
  for (const row of presentation.rows) lines.push([
    row.ordinal, row.module, row.title,
    row.oracles.map((/** @type {any} */ item) => item.expected).join('；'), row.priority, row.evidence_status
  ].map(legacyTableCell).join(' | ').replace(/^/u, '| ').replace(/$/u, ' |'));
  return `${lines.join('\n')}\n`;
}

/** @param {string} title @param {string[]} values */
function htmlList(title, values) {
  return `<section><h4>${html(title)}</h4>${values.length
    ? `<ol>${values.map(value => `<li>${html(value)}</li>`).join('')}</ol>`
    : '<p class="empty">无</p>'}</section>`;
}

/**
 * Render a standalone offline primary reading file. Every visible value comes
 * from the canonical bundle projection or the validated technical reading
 * summary; the summary is never treated as business evidence.
 * @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation
 * @param {Record<string, any>} sourceReading
 */
export function renderLegacyBusinessHtmlV42(presentation, sourceReading) {
  const sourceRows = sourceReading.items.map((/** @type {any} */ item) => `<tr><td>${html(item.item_id)}</td><td>${html(item.channel)}</td><td>${html(item.acquisition_status)}</td><td>${html(item.review_status)}</td></tr>`).join('');
  const overviewRows = presentation.rows.map(row => `<tr><td>${row.ordinal}</td><td>${html(row.module)}</td><td><a href="#${html(row.case_id)}">${html(row.title)}</a></td><td>${html(row.oracles.map(item => item.expected).join('；'))}</td><td>${html(row.priority)}</td><td>${html(row.evidence_status)}</td></tr>`).join('');
  const cases = presentation.rows.map(row => {
    const expectations = row.oracles.map((/** @type {any} */ item) => `<li><strong>步骤 ${item.step_number} 后：</strong>${html(item.expected)} <span class="surface">${html(item.surface)}</span></li>`).join('');
    return `<article id="${html(row.case_id)}"><header><p class="eyebrow">${html(row.case_id)} · ${html(row.module)} · ${html(row.priority)} · ${html(row.evidence_status)}</p><h3>${html(row.title)}</h3><p>主要测试点：${html(row.primary_test_point_id)}${row.business_flow_ref ? ` · 完整流程：${html(row.business_flow_ref)}` : ''}</p></header>${htmlList('业务前置条件', row.preconditions)}${htmlList('数据条件', row.data_conditions)}<section><h4>步骤与预期</h4><ol class="steps">${row.steps.map((/** @type {any} */ step) => `<li><p>${html(step.action)}</p><ul>${row.oracles.filter((/** @type {any} */ item) => item.step_number === step.number).map((/** @type {any} */ item) => `<li>${html(item.expected)} <span class="surface">${html(item.surface)}</span></li>`).join('')}</ul></li>`).join('')}</ol>${expectations ? `<details><summary>全部预期结果</summary><ol>${expectations}</ol></details>` : ''}</section></article>`;
  }).join('');
  const limitations = sourceReading.limitations.length
    ? `<ul>${sourceReading.limitations.map((/** @type {any} */ item) => `<li>${html(item)}</li>`).join('')}</ul>`
    : '<p class="complete">当前采集范围内未记录限制。</p>';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>人工功能测试用例</title><style>
:root{color-scheme:light;--ink:#1d2433;--muted:#657086;--line:#d9dfeb;--paper:#fff;--soft:#f5f7fb;--accent:#174ea6}*{box-sizing:border-box}body{margin:0;background:var(--soft);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1180px;margin:auto;padding:32px 20px 64px}h1,h2,h3,h4{line-height:1.25}h1{font-size:2rem}h2{margin-top:2.2rem}h3{font-size:1.35rem}.lede,.meta{color:var(--muted)}.panel,article{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 4px 18px #23324d0d}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:var(--paper)}th,td{padding:10px 12px;border:1px solid var(--line);text-align:left;vertical-align:top}th{background:#eef3fb;white-space:nowrap}a{color:var(--accent)}.eyebrow,.surface{color:var(--muted);font-size:.88rem}.surface{margin-left:.5em}.steps>li{margin-bottom:1rem}.complete{color:#236b3b}.empty{color:var(--muted)}code{overflow-wrap:anywhere}@media print{body{background:#fff}.panel,article{box-shadow:none;break-inside:avoid}main{max-width:none;padding:0}}
</style></head><body><main><header><p class="eyebrow">V4 增量增强 · HTML 主阅读文件</p><h1>人工功能测试用例</h1><p class="lede">共 ${presentation.case_count} 条。每条 Case 只有一个主要测试点；完整流程仍是一条普通多步 Case。</p></header><section class="panel"><h2>资料读取摘要</h2><p class="meta">这是采集技术记录，不是业务事实或业务证据。</p><p>范围：${html(sourceReading.scope.root_ref)} · 模式：${html(sourceReading.scope.mode)} · 状态：${html(sourceReading.status)} · 版本：${html(sourceReading.scope.source_version ?? '未提供')}</p><div class="table-wrap"><table><thead><tr><th>项目</th><th>通道</th><th>采集</th><th>审阅</th></tr></thead><tbody>${sourceRows}</tbody></table></div><h3>限制</h3>${limitations}</section><section><h2>用例总览</h2><div class="table-wrap"><table><thead><tr><th>序号</th><th>模块</th><th>用例/流程名称</th><th>预期结果</th><th>优先级</th><th>依据状态</th></tr></thead><tbody>${overviewRows}</tbody></table></div></section><section><h2>用例详情</h2>${cases || '<div class="panel"><p>当前没有适用的正式 Case。</p></div>'}</section></main></body></html>\n`;
}

/** Escape user-authored content before renderer-owned <br> markers are added. @param {unknown} value */
function tableUserText(value) {
  return String(value ?? '').normalize('NFC').replace(/\r\n?/gu, '\n').split('\n')
    .map(part => html(part).replace(/([\\`*_[\]|])/gu, '\\$1')).join('<br>');
}

/** @param {any} row */
function tableCaseDescription(row) {
  return [
    tableUserText(row.title),
    ...row.preconditions.map((/** @type {string} */ value, /** @type {number} */ index) => `前提 ${index + 1}：${tableUserText(value)}`),
    ...row.data_conditions.map((/** @type {string} */ value, /** @type {number} */ index) => `数据 ${index + 1}：${tableUserText(value)}`),
    ...row.steps.map((/** @type {any} */ item) => `步骤 ${item.number}：${tableUserText(item.action)}`),
    ...row.test_values.map((/** @type {any} */ item, /** @type {number} */ index) =>
      `取值 ${index + 1}：${tableUserText(item.field_path)} = ${tableUserText(JSON.stringify(item.value))}（${tableUserText(item.origin_label)}）`),
    ...(row.baseline ? [`相对基线：${tableUserText(row.baseline.reference)}；${tableUserText(baselineComparison(row.baseline.comparison_contract))}`] : [])
  ].join('<br>');
}

/** @param {any} contract */
function baselineComparison(contract) {
  if (contract.kind === 'selected_dimensions') {
    return `比较${contract.dimensions.join('、')}；允许差异：${contract.allowed_differences.length ? contract.allowed_differences.join('、') : '无'}`;
  }
  return `比较除${contract.exceptions.length ? contract.exceptions.join('、') : '无'}以外的全部可观察行为`;
}

/** @param {any} row */
function tableExpectations(row) {
  return [
    ...row.oracles.map((/** @type {any} */ item) => {
      const surface = SURFACE_LABEL[item.surface] ?? item.surface;
      return `步骤 ${item.step_number} 后（${tableUserText(surface)}）：${tableUserText(item.expected)}`;
    }),
    ...row.semantic_effects.map((/** @type {any} */ item) =>
      `结果变化：${tableUserText(item.subject)}：${Object.hasOwn(item, 'before') ? `${tableUserText(item.before)} → ` : ''}${tableUserText(item.after)}`)
  ].join('<br>');
}

/** @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation */
function tableContext(presentation) {
  const lines = ['', `结果状态：${tableUserText(presentation.title)}`];
  if (presentation.semantic_roots.length) {
    lines.push('', '待确认事项与交付限制：');
    for (const root of presentation.semantic_roots) {
      const affected = root.affected_business_items.map((/** @type {any} */ item) => tableUserText(item.display_name)).join('；');
      lines.push(`- ${tableUserText(root.title)}：${tableUserText(root.unresolved_outcome)}；影响：${affected}`);
    }
  }
  if (presentation.not_applicable.length) {
    lines.push('', '已确认不适用：');
    for (const item of presentation.not_applicable) {
      lines.push(`- ${tableUserText(item.module)}｜${tableUserText(item.subject)}：${tableUserText(item.reason)}`);
    }
  }
  const coverage = presentation.coverage;
  lines.push('', '已审阅 formal test-point 覆盖：',
    `- 主验收：已覆盖 ${coverage.primary.covered_formal_test_point_count} 项，已审阅 ${coverage.primary.reviewed_formal_test_point_count} 项，其中 NotApplicable ${coverage.primary.not_applicable_formal_test_point_count} 项`,
    `- 边界契约：已覆盖 ${coverage.boundary.covered_formal_test_point_count} 项，已审阅 ${coverage.boundary.reviewed_formal_test_point_count} 项，其中 NotApplicable ${coverage.boundary.not_applicable_formal_test_point_count} 项`,
    `- semantic gap：${coverage.semantic_gap_count} 项；Exploratory：${coverage.exploratory_count} 项；NotApplicable：${coverage.not_applicable_count} 项`);
  return lines;
}

/** Render the complete conversation Table from the canonical presentation. @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation */
export function renderCaseTableV4(presentation) {
  const lines = [
    '| 序号 | 模块 | 用例/流程名称 | 预期结果 | 优先级 | 依据状态 |',
    '| ---: | --- | --- | --- | --- | --- |'
  ];
  for (const row of presentation.rows) lines.push(`| ${row.ordinal} | ${tableUserText(row.module)} | ${tableCaseDescription(row)} | ${tableExpectations(row)} | ${tableUserText(row.priority)} | ${tableUserText(row.acceptance_role_label)} · ${tableUserText(row.evidence_status)} |`);
  if (!presentation.rows.length) lines.push('', tableUserText(presentation.empty_message));
  lines.push(...tableContext(presentation));
  return `${lines.join('\n')}\n`;
}

/** @param {any[]} values @param {(value:any)=>string} render */
function htmlItems(values, render) {
  return values.length ? `<ul>${values.map(render).join('')}</ul>` : '<p class="empty">无。</p>';
}

/** @param {any} row */
function htmlOverviewCase(row) {
  const setup = [
    ...row.preconditions.map((/** @type {string} */ value, /** @type {number} */ index) => `前提 ${index + 1}：${value}`),
    ...row.data_conditions.map((/** @type {string} */ value, /** @type {number} */ index) => `数据 ${index + 1}：${value}`),
    ...row.steps.map((/** @type {any} */ item) => `步骤 ${item.number}：${item.action}`),
    ...row.test_values.map((/** @type {any} */ item, /** @type {number} */ index) =>
      `取值 ${index + 1}：${item.field_path} = ${JSON.stringify(item.value)}（${item.origin_label}）`),
    ...(row.baseline ? [`相对基线：${row.baseline.reference}；${baselineComparison(row.baseline.comparison_contract)}`] : [])
  ];
  const expectations = row.oracles.map((/** @type {any} */ item) =>
    `步骤 ${item.step_number} 后（${SURFACE_LABEL[item.surface] ?? item.surface}）：${item.expected}`);
  expectations.push(...row.semantic_effects.map((/** @type {any} */ item) =>
    `结果变化：${item.subject}：${Object.hasOwn(item, 'before') ? `${item.before} → ` : ''}${item.after}`));
  return `<tr><td>${row.ordinal}</td><td>${html(row.module)}<br><span class="meta">${html(row.acceptance_role_label)}</span></td><td><a href="#case-${row.ordinal}">${html(row.title)}</a>${setup.length ? `<ul class="compact">${setup.map(value => `<li>${html(value)}</li>`).join('')}</ul>` : ''}</td><td>${htmlItems(expectations, value => `<li>${html(value)}</li>`)}</td><td>${html(row.priority)}</td><td>${html(row.evidence_status)}</td></tr>`;
}

/** @param {any} row */
function htmlCase(row) {
  const steps = row.steps.map((/** @type {any} */ step) => {
    const expectations = row.oracles.filter((/** @type {any} */ item) => item.step_number === step.number)
      .map((/** @type {any} */ item) => `<li><strong>步骤 ${item.step_number} 后（${html(SURFACE_LABEL[item.surface] ?? item.surface)}）：</strong>${html(item.expected)}</li>`).join('');
    return `<li><p>${html(step.action)}</p>${expectations ? `<ul>${expectations}</ul>` : '<p class="empty">本步骤没有独立预期。</p>'}</li>`;
  }).join('');
  const values = row.test_values.map((/** @type {any} */ item) =>
    `${item.field_path} = ${JSON.stringify(item.value)}（${item.origin_label}）`);
  const baseline = row.baseline
    ? `<section><h4>相对基线</h4><p>${html(row.baseline.reference)}；${html(baselineComparison(row.baseline.comparison_contract))}</p></section>` : '';
  const effects = row.semantic_effects.map((/** @type {any} */ item) =>
    `${item.subject}：${Object.hasOwn(item, 'before') ? `${item.before} → ` : ''}${item.after}`);
  return `<article id="case-${row.ordinal}"><header><p class="eyebrow">${html(row.acceptance_role_label)} · ${html(row.module)} · ${html(row.priority)} · ${html(row.evidence_status)}</p><h3>${html(row.title)}</h3></header>${htmlList('业务前置条件', row.preconditions)}${htmlList('数据条件', row.data_conditions)}${htmlList('结构化测试取值', values)}${baseline}<section><h4>步骤与预期</h4><ol class="steps">${steps}</ol></section>${htmlList('业务结果变化', effects)}</article>`;
}

/** @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation */
function htmlSemanticRoots(presentation) {
  return htmlItems(presentation.semantic_roots, root => `<li><h3>${html(root.title)}</h3><p><strong>业务对象：</strong>${html(root.business_object)}</p><p><strong>待确认问题：</strong>${html(root.question)}</p><p><strong>原因：</strong>${html(root.why_needed)}</p><p><strong>影响：</strong>${html(root.decision_impact)}</p><p><strong>当前处理：</strong>${html(root.unresolved_outcome)}</p><p><strong>受影响业务项：</strong></p>${htmlItems(root.affected_business_items, item => `<li>${html(item.display_name)}</li>`)}</li>`);
}

/** @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation */
function htmlCoverage(presentation) {
  const coverage = presentation.coverage;
  return `<section class="panel"><h2>覆盖情况</h2><h3>已审阅 formal test-point 覆盖</h3><ul><li>主验收：已覆盖 ${coverage.primary.covered_formal_test_point_count} 项，已审阅 ${coverage.primary.reviewed_formal_test_point_count} 项，其中 NotApplicable ${coverage.primary.not_applicable_formal_test_point_count} 项</li><li>边界契约：已覆盖 ${coverage.boundary.covered_formal_test_point_count} 项，已审阅 ${coverage.boundary.reviewed_formal_test_point_count} 项，其中 NotApplicable ${coverage.boundary.not_applicable_formal_test_point_count} 项</li><li>semantic gap：${coverage.semantic_gap_count} 项</li><li>Exploratory：${coverage.exploratory_count} 项</li><li>NotApplicable：${coverage.not_applicable_count} 项</li></ul></section>`;
}

/** @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation */
function htmlAudit(presentation) {
  if (!presentation.render_options.include_audit_appendix) return '';
  const cases = presentation.rows.map(row => `<li><code>${html(row.case_id)}</code> · Test Point <code>${html(row.primary_test_point_id)}</code>${row.business_flow_ref ? ` · Flow <code>${html(row.business_flow_ref)}</code>` : ''}</li>`).join('');
  const roots = presentation.semantic_roots.map((/** @type {any} */ root) => `<li><code>${html(root.root_issue_id)}</code></li>`).join('');
  return `<details class="panel audit"><summary>审计标识</summary><p class="meta">以下标识仅用于机器追踪，不属于业务执行正文。</p><h3>Case</h3><ul>${cases}</ul><h3>Semantic root</h3><ul>${roots}</ul></details>`;
}

/**
 * Render the current standalone offline primary reading file. The renderer
 * only rearranges validated canonical content and never creates business truth.
 * @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation
 * @param {Record<string, any>} sourceReading
 */
export function renderBusinessHtmlV4(presentation, sourceReading) {
  const sourceRows = sourceReading.items.map((/** @type {any} */ item, /** @type {number} */ index) => `<tr><td>${index + 1}</td><td>${html(item.channel)}</td><td>${html(item.acquisition_status)}</td><td>${html(item.review_status)}</td></tr>`).join('');
  const limitations = sourceReading.limitations.length
    ? htmlItems(sourceReading.limitations, item => `<li>${html(item)}</li>`)
    : '<p class="complete">当前采集范围内未记录限制。</p>';
  const overviewRows = presentation.rows.map(htmlOverviewCase).join('');
  const cases = presentation.rows.map(htmlCase).join('');
  const notApplicable = htmlItems(presentation.not_applicable, item => `<li>${html(item.module)}｜${html(item.subject)}：${html(item.reason)}</li>`);
  const exploratory = htmlItems(presentation.exploratory, item => `<li>${html(item.module)}｜${html(item.title)}：${html(item.reason)}</li>`);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(presentation.title)}</title><style>
:root{color-scheme:light;--ink:#1d2433;--muted:#657086;--line:#d9dfeb;--paper:#fff;--soft:#f5f7fb;--accent:#174ea6;--warn:#8a4b00}*{box-sizing:border-box}body{margin:0;background:var(--soft);color:var(--ink);font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{max-width:1180px;margin:auto;padding:32px 20px 64px}h1,h2,h3,h4{line-height:1.25}h1{font-size:2rem}h2{margin-top:2.2rem}h3{font-size:1.2rem}.lede,.meta{color:var(--muted)}.panel,article{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:20px;margin:16px 0;box-shadow:0 4px 18px #23324d0d}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;background:var(--paper)}th,td{padding:10px 12px;border:1px solid var(--line);text-align:left;vertical-align:top}th{background:#eef3fb;white-space:nowrap}a{color:var(--accent)}.eyebrow,.surface{color:var(--muted);font-size:.88rem}.steps>li{margin-bottom:1rem}.compact{margin:.5rem 0 0;padding-left:1.25rem}.complete{color:#236b3b}.empty{color:var(--muted)}.warning{border-left:4px solid var(--warn)}code{overflow-wrap:anywhere}@media print{body{background:#fff}.panel,article{box-shadow:none;break-inside:avoid}main{max-width:none;padding:0}}
</style></head><body><main><header><p class="eyebrow">V4 · HTML 主阅读文件</p><h1>${html(presentation.title)}</h1><p class="lede">共 ${presentation.case_count} 条。每条 Case 只有一个独立主要结果；必要的同对象多步动作与过程观察保持连续。</p></header><section class="panel"><h2>资料读取摘要</h2><p class="meta">这是采集技术记录，不是业务事实或业务证据。</p><p>范围：${html(sourceReading.scope.root_ref)} · 模式：${html(sourceReading.scope.mode)} · 状态：${html(sourceReading.status)} · 版本：${html(sourceReading.scope.source_version ?? '未提供')}</p><div class="table-wrap"><table><thead><tr><th>序号</th><th>通道</th><th>采集</th><th>审阅</th></tr></thead><tbody>${sourceRows}</tbody></table></div><h3>采集限制</h3>${limitations}</section><section><h2>用例总览</h2><div class="table-wrap"><table><thead><tr><th>序号</th><th>模块</th><th>用例/流程名称</th><th>预期结果</th><th>优先级</th><th>依据状态</th></tr></thead><tbody>${overviewRows}</tbody></table></div>${presentation.rows.length ? '' : `<div class="panel"><p>${html(presentation.empty_message)}</p></div>`}</section><section><h2>用例详情</h2>${cases || `<div class="panel"><p>${html(presentation.empty_message)}</p></div>`}</section><section class="panel${presentation.semantic_roots.length ? ' warning' : ''}"><h2>待确认事项与交付限制</h2>${htmlSemanticRoots(presentation)}</section><section class="panel"><h2>排除与探索</h2><h3>已确认不适用</h3>${notApplicable}<h3>探索建议</h3>${exploratory}</section>${htmlCoverage(presentation)}${htmlAudit(presentation)}</main></body></html>\n`;
}

/**
 * Verify HTML and Table as one indivisible presentation family. A caller may
 * not select a different family per artifact.
 * @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation
 * @param {Record<string, any>} sourceReading
 * @param {{html:string,table:string}} artifacts
 */
export function matchCasePresentationFamilyV42(presentation, sourceReading, artifacts) {
  if (!record(artifacts) || typeof artifacts.html !== 'string' || typeof artifacts.table !== 'string') {
    throw new TypeError('CASE_PRESENTATION_FAMILY_INVALID');
  }
  if (renderBusinessHtmlV4(presentation, sourceReading) === artifacts.html
    && renderCaseTableV4(presentation) === artifacts.table) return 'current-4.2';
  if (renderLegacyBusinessHtmlV42(presentation, sourceReading) === artifacts.html
    && renderLegacyCaseTableV42(presentation) === artifacts.table) return 'legacy-4.2';
  throw new TypeError('CASE_PRESENTATION_FAMILY_INVALID');
}
