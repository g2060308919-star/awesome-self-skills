import { canonicalV5Stringify } from './canonical-v5.mjs';
import { validateV5CaseDocument } from './case-compiler.mjs';

/** @param {unknown} value */
function csv(value) {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** @param {Record<string,any>} document */
export function renderV5Csv(document) {
  validateV5CaseDocument(document);
  const rows = [['case_id', 'semantic_status', 'title', 'module_id', 'primary_test_point_id', 'scope_kind', 'canonical_names', 'step_sequence', 'step_id', 'action', 'oracle_id', 'oracle_kind', 'oracle_assertion']];
  for (const current of document.cases) {
    for (const step of current.steps) {
      const oracles = current.oracles.filter((/** @type {Record<string,any>} */ oracle) => oracle.observe_after_step_id === step.step_id);
      if (oracles.length === 0) oracles.push({});
      for (const oracle of oracles) rows.push([
        current.case_id, current.semantic_status, current.title, current.module_id, current.primary_test_point_id,
        [...new Set(current.oracles.map((/** @type {Record<string,any>} */ item) => item.evaluation_scope.kind))].join('|'), current.canonical_names.join('|'), step.sequence, step.step_id, step.action,
        oracle.oracle_id ?? '', oracle.assertion?.kind ?? '', oracle.assertion ? canonicalV5Stringify(oracle.assertion) : ''
      ]);
    }
  }
  return `${rows.map((row) => row.map(csv).join(',')).join('\n')}\n`;
}
