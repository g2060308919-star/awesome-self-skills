import { canonicalStringify } from './canonical.mjs';
import { validateCaseSemanticsV4 } from './case-semantics-v4.mjs';
import { isV4SchemaVersion } from './v4-contract.mjs';

export const EXECUTION_WORKSHEET_COLUMNS = Object.freeze([
  'case_id', 'acceptance_role', 'module', 'priority', 'title', 'preconditions',
  'data_conditions', 'steps', 'expected_results', 'execution_status', 'defect_ids',
  'test_data_used', 'owner', 'notes'
]);

export const SURFACE_RANK = Object.freeze([
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
function csvField(value) {
  const text = String(value ?? '').normalize('NFC').replace(/\r\n?/gu, '\n');
  return /[",\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

/** @param {any} candidate */
function validateCanonicalCase(candidate) {
  if (!record(candidate) || !['Grounded', 'Conditional'].includes(candidate.semantic_status)
    || !record(candidate.ordering) || !Array.isArray(candidate.ordering.depends_on_case_ids)) {
    throw new TypeError('CANONICAL_CASE_INVALID');
  }
  const draft = structuredClone(candidate);
  delete draft.semantic_status;
  const dependencies = draft.ordering.depends_on_case_ids;
  delete draft.ordering.depends_on_case_ids;
  const diagnostics = validateCaseSemanticsV4(draft);
  if (diagnostics.some((item) => item.code === 'ORACLE_STEP_UNRESOLVED')) {
    throw new TypeError('ORACLE_STEP_UNRESOLVED');
  }
  if (diagnostics.length || dependencies.some((/** @type {unknown} */ id) => typeof id !== 'string' || !id)
    || new Set(dependencies).size !== dependencies.length) throw new TypeError('CANONICAL_CASE_INVALID');
}

/**
 * Render the canonical initial human execution worksheet. Filled execution
 * records are deliberately absent from the Case Document source object.
 * @param {unknown} input @param {unknown} orderedCaseIds
 */
export function renderExecutionWorksheetCsvV4(input, orderedCaseIds) {
  if (!record(input) || !isV4SchemaVersion(input.schema_version) || input.delivery_intent !== 'case_document'
    || !Array.isArray(input.cases) || !record(input.scope_manifest)
    || !Array.isArray(input.scope_manifest.modules) || !Array.isArray(orderedCaseIds)) {
    throw new TypeError('CASE_DOCUMENT_INVALID');
  }
  const cases = structuredClone(input.cases);
  for (const candidate of cases) validateCanonicalCase(candidate);
  const caseById = new Map(cases.map((candidate) => [candidate.case_id, candidate]));
  const order = structuredClone(orderedCaseIds);
  if (order.length !== cases.length || new Set(order).size !== order.length
    || order.some((/** @type {unknown} */ id) => typeof id !== 'string' || !caseById.has(id))) {
    throw new TypeError('CASE_ORDER_INVALID');
  }
  const moduleById = new Map();
  for (const module of input.scope_manifest.modules) {
    if (!record(module) || typeof module.module_id !== 'string' || typeof module.name !== 'string'
      || !module.name.trim() || moduleById.has(module.module_id)) throw new TypeError('MODULE_MANIFEST_INVALID');
    moduleById.set(module.module_id, module.name.normalize('NFC'));
  }
  const rows = [EXECUTION_WORKSHEET_COLUMNS.join(',')];
  for (const caseId of order) {
    const candidate = caseById.get(caseId);
    const moduleName = moduleById.get(candidate.module_id);
    if (!moduleName) throw new TypeError('MODULE_MANIFEST_INVALID');
    const stepIndex = new Map(candidate.steps.map((/** @type {any} */ step, /** @type {number} */ index) => [step.step_id, index + 1]));
    const oracles = [...candidate.oracles].sort((left, right) => {
      const leftStep = stepIndex.get(left.observe_after_step_id);
      const rightStep = stepIndex.get(right.observe_after_step_id);
      if (!leftStep || !rightStep) throw new TypeError('ORACLE_STEP_UNRESOLVED');
      return leftStep - rightStep || SURFACE_RANK.indexOf(left.surface) - SURFACE_RANK.indexOf(right.surface)
        || compareText(left.expected, right.expected) || compareText(left.oracle_id, right.oracle_id);
    });
    if (oracles.some((oracle) => !stepIndex.has(oracle.observe_after_step_id))) {
      throw new TypeError('ORACLE_STEP_UNRESOLVED');
    }
    const numbered = (/** @type {any[]} */ values, /** @type {string} */ key) => values.map(
      (/** @type {any} */ item, /** @type {number} */ index) => `${index + 1}. ${String(item[key]).normalize('NFC')}`
    ).join('\n');
    const row = [
      candidate.case_id, candidate.acceptance_role, moduleName, candidate.priority,
      candidate.title.normalize('NFC'), numbered(candidate.business_preconditions, 'description'),
      numbered(candidate.data_conditions, 'description'), numbered(candidate.steps, 'action'),
      oracles.map((oracle) => `步骤${stepIndex.get(oracle.observe_after_step_id)}：${oracle.expected.normalize('NFC')}`).join('\n'),
      'not_run', '', '', '', ''
    ];
    if (row.length !== EXECUTION_WORKSHEET_COLUMNS.length) throw new TypeError('WORKSHEET_COLUMN_MISMATCH');
    rows.push(row.map(csvField).join(','));
  }
  return `${rows.join('\n')}\n`;
}

/** Exact semantic projection used by tests and manifest writers. @param {unknown} input */
export function canonicalCaseSetDigestInput(input) {
  if (!record(input) || !Array.isArray(input.cases)) throw new TypeError('CASE_DOCUMENT_INVALID');
  return canonicalStringify(input.cases);
}
