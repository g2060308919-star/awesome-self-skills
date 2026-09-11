import { canonicalV5Stringify } from './canonical-v5.mjs';
import { validateV5CaseDocument } from './case-compiler.mjs';

const SCOPE_LABELS = /** @type {Readonly<Record<string,string>>} */ (Object.freeze({ single_item: '单项', visible_region: '可见区', current_page: '当前页', current_response: '当前响应', all_pages: '全分页', full_dataset: '完整快照' }));

/** @param {Record<string,any>} assertion */
function assertionText(assertion) {
  if (assertion.kind === 'exact_text' || assertion.kind === 'semantic_text') return `${assertion.kind}: ${assertion.expected_text}`;
  if (assertion.kind === 'value_equals') return `value_equals: ${canonicalV5Stringify(assertion.expected_value)}`;
  if (assertion.kind === 'value_state_equals') return `value_state_equals: ${canonicalV5Stringify(assertion.expected_value_state)}`;
  if (assertion.kind === 'exists' || assertion.kind === 'absent') return assertion.kind;
  if (assertion.kind === 'count_equals') return `count_equals: ${assertion.expected_count}`;
  if (assertion.kind === 'count_at_least') return `count_at_least: ${assertion.minimum_count}`;
  if (assertion.kind === 'permission') return `permission: ${assertion.expected}`;
  return `${assertion.kind}: ${canonicalV5Stringify(assertion)}`;
}

/** @param {Record<string,any>} scope */
function scopeText(scope) { return SCOPE_LABELS[scope?.kind] ?? scope?.kind ?? '未声明'; }

/** @param {Record<string,any>} document */
export function renderV5Markdown(document) {
  validateV5CaseDocument(document);
  const lines = [
    '# V5 Case Document', '',
    `- Lineage: ${document.case_document_lineage_id}`,
    `- Semantic root: ${document.semantic_root_digest}`,
    `- Bundle digest: ${document.bundle_digest}`, '',
    '## Classification', '',
    '| Status | Count |', '|---|---:|',
    ...Object.entries(document.classification_counts).map(([status, count]) => `| ${status} | ${count} |`), '',
    '## Coverage', '',
    '| Metric | Total | Covered | Gap/Blocked | N/A |', '|---|---:|---:|---:|---:|',
    `| Formal Test Point | ${document.coverage.formal_test_point.total} | ${document.coverage.formal_test_point.covered} | ${document.coverage.formal_test_point.blocked} | ${document.coverage.formal_test_point.not_applicable} |`,
    `| Semantic partition | ${document.coverage.semantic_partition.total} | ${document.coverage.semantic_partition.covered} | ${document.coverage.semantic_partition.gap} | ${document.coverage.semantic_partition.not_applicable} |`,
    `| Value instance | ${document.coverage.value_instance.total} | ${document.coverage.value_instance.covered} | ${document.coverage.value_instance.gap} | ${document.coverage.value_instance.not_applicable} |`,
    `| Permission cell | ${document.coverage.permission_cell.total} | ${document.coverage.permission_cell.covered} | ${document.coverage.permission_cell.gap} | ${document.coverage.permission_cell.not_applicable} |`, '',
    '## Cases', ''
  ];
  for (const current of document.cases) {
    lines.push(`### ${current.case_id} — ${current.title} [${current.semantic_status}]`, '');
    lines.push(`- Module: ${current.module_id}`);
    lines.push(`- Primary Test Point: ${current.primary_test_point_id}`);
    lines.push(`- Canonical names: ${current.canonical_names.join('、')}`);
    lines.push(`- Scope: ${scopeText(current.population_scope)}`);
    if (current.semantic_gap_ids.length > 0) lines.push(`- Blocking gaps: ${current.semantic_gap_ids.join('、')}`);
    if (current.observation_intent) lines.push(`- Observation intent: ${current.observation_intent}`);
    lines.push('', 'Steps:');
    for (const step of current.steps) {
      lines.push(`${step.sequence}. ${step.action}`);
      for (const oracle of current.oracles.filter((/** @type {Record<string,any>} */ oracle) => oracle.observe_after_step_id === step.step_id)) {
        lines.push(`   - Oracle ${oracle.oracle_id}: ${assertionText(oracle.assertion)}; scope=${oracle.evaluation_scope.kind}; window=${oracle.observation_window.kind}`);
      }
    }
    lines.push('');
  }
  const visibleRisks = document.risk_ledger.items.filter((/** @type {Record<string,any>} */ risk) => risk.display_tier !== 'background');
  lines.push('## Material Risks', '');
  if (visibleRisks.length === 0) lines.push('- None');
  else for (const risk of visibleRisks) lines.push(`- ${risk.risk_key}: ${risk.risk_kind} (${risk.display_tier})`);
  lines.push('');
  return `${lines.join('\n')}\n`;
}
