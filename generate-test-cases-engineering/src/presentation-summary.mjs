import { validateSemanticPresentationV4 } from './clarification-v4.mjs';

/** Count compiled formal obligations once, even when several displayed Cases
 * or a direct Test Point reference share the same responsibility.
 * @param {{item_refs: any[]}} group
 * @param {any[]} obligations
 * @param {{items: any[]}|null} [plan]
 */
export function groupRiskCounts(group, obligations, plan = null) {
  const risks = new Map(obligations.map((item) => [item.obligation_id, item.risk]));
  const cases = new Map((plan?.items ?? []).filter((item) => item.item_kind === 'case')
    .map((item) => [item.item_id, item.related_obligation_ids ?? []]));
  const ids = new Set();
  for (const item of group.item_refs) {
    if (item.item_kind === 'formal_test_point') ids.add(item.item_id);
    else if (item.item_kind === 'case') {
      const related = cases.get(item.item_id);
      if (!Array.isArray(related) || related.length === 0) throw new Error('Presented Case lacks compiled formal responsibility bindings.');
      for (const id of related) ids.add(id);
    } else if (item.item_kind !== 'exploratory') throw new Error('Presented item kind has no formal risk projection.');
  }
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const id of ids) {
    const risk = String(risks.get(id));
    if (!risks.has(id)) throw new Error('Presented formal responsibility is absent from the compiled obligation ledger.');
    if (risk !== 'critical' && risk !== 'high' && risk !== 'medium' && risk !== 'low') throw new Error('Presented formal responsibility has invalid compiled risk.');
    counts[risk] += 1;
  }
  return counts;
}

const SEMANTIC_ACTION_LABELS = Object.freeze({
  'zh-CN': {
    answer_question_part: '回答问题', defer_question_part: '暂缓',
    mark_question_unknown: '标记未知', request_delivery: '按当前结果交付'
  },
  en: {
    answer_question_part: 'Answer question', defer_question_part: 'Defer',
    mark_question_unknown: 'Mark unknown', request_delivery: 'Deliver current result'
  }
});

/**
 * Mechanically render a semantic presentation without exposing protocol IDs or
 * digests. The structured presentation remains the sole event-construction
 * authority; this string is only its user-facing projection.
 * @param {unknown} submitted
 * @param {'zh-CN'|'en'} [language]
 */
export function renderSemanticPresentationSummaryV4(submitted, language = 'zh-CN') {
  const diagnostics = validateSemanticPresentationV4(submitted);
  if (diagnostics.length) throw new TypeError('SEMANTIC_PRESENTATION_INVALID');
  if (language !== 'zh-CN' && language !== 'en') throw new TypeError('OUTPUT_LANGUAGE_INVALID');
  const presentation = /** @type {any} */ (submitted);
  const zh = language === 'zh-CN';
  const title = presentation.phase === 'requirements_analysis'
    ? (zh ? '需求分析待确认' : 'Requirements questions')
    : (zh ? '用例设计待确认' : 'Case-design questions');
  const lines = [`## ${title}`, ''];
  for (let index = 0; index < presentation.question_parts.length; index += 1) {
    const part = presentation.question_parts[index];
    lines.push(`${index + 1}. ${part.question}`);
    lines.push(`   - ${zh ? '为什么需要' : 'Why needed'}：${part.why_needed}`);
    lines.push(`   - ${zh ? '决策影响' : 'Decision impact'}：${part.decision_impact}`);
    lines.push(`   - ${zh ? '暂不处理的结果' : 'If unresolved'}：${part.unresolved_outcome}`);
    lines.push(`   - ${zh ? '可选答案' : 'Answer options'}：${part.answer_options.join(zh ? '；' : '; ')}`);
    lines.push(`   - ${zh ? '可执行操作' : 'Available actions'}：${part.available_actions
      .map((/** @type {keyof typeof SEMANTIC_ACTION_LABELS['zh-CN']} */ action) => SEMANTIC_ACTION_LABELS[language][action])
      .join(zh ? '；' : '; ')}`);
    lines.push('');
  }
  lines.push(zh
    ? '可逐项回答；未回答项会保留在下一版清单中，也可以明确暂缓、标记未知或按当前结果交付。'
    : 'You may answer any subset. Unanswered items remain in the successor list; you may also defer, mark unknown, or deliver the current result.');
  return lines.join('\n');
}
