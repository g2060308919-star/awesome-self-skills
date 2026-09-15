const SURFACE_RANK = Object.freeze([
  'ui', 'request', 'response', 'persistence', 'event', 'callback',
  'compensation', 'side_effect', 'external_observation'
]);

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
function tableCell(value) {
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
export function buildCaseDocumentPresentationV4(bundle) {
  if (!record(bundle) || !Array.isArray(bundle.cases) || !Array.isArray(bundle.ordered_case_ids)
    || !record(bundle.scope_manifest) || !Array.isArray(bundle.scope_manifest.modules)) {
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
      primary_test_point_id: candidate.primary_test_point_id,
      business_flow_ref: candidate.ordering.business_flow_ref,
      preconditions: candidate.business_preconditions.map((/** @type {any} */ item) => item.description),
      data_conditions: candidate.data_conditions.map((/** @type {any} */ item) => item.description),
      steps: candidate.steps.map((/** @type {any} */ item, /** @type {number} */ step) => ({ number: step + 1, action: item.action })),
      oracles
    };
  });
  return {
    result_kind: bundle.result_kind,
    case_count: rows.length,
    coverage: structuredClone(bundle.coverage),
    rows
  };
}

/** @param {ReturnType<typeof buildCaseDocumentPresentationV4>} presentation */
export function renderCaseTableV4(presentation) {
  const lines = [
    '| 序号 | 模块 | 用例/流程名称 | 预期结果 | 优先级 | 依据状态 |',
    '| ---: | --- | --- | --- | --- | --- |'
  ];
  for (const row of presentation.rows) lines.push([
    row.ordinal, row.module, row.title,
    row.oracles.map((/** @type {any} */ item) => item.expected).join('；'), row.priority, row.evidence_status
  ].map(tableCell).join(' | ').replace(/^/u, '| ').replace(/$/u, ' |'));
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
export function renderBusinessHtmlV4(presentation, sourceReading) {
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
