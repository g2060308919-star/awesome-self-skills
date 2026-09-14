import { canonicalStringify } from './canonical.mjs';
import { compileCaseOrdering } from './ordering-registry.mjs';

/** @param {string} code */
const failure = code => ({
  kind: 'fatal', result_kind: 'quality_failure',
  diagnostics: [{
    category: 'quality_failure', code, path: '/presentation_order',
    message: 'The displayed Case order must be recomputed from verified business dependencies and source-backed ranks.'
  }]
});

/**
 * Compiler-owned boundary for the single Case order shared by canonical JSON,
 * business Markdown and the execution worksheet. Adapter input contains only
 * semantic selectors; dependency Case IDs are injected by compileCaseOrdering.
 * @param {unknown} input
 * @returns {any}
 */
export function compilePresentationOrderV4(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return failure('PRESENTATION_ORDER_INPUT_INVALID');
  const value = /** @type {any} */ (input);
  const ordered = compileCaseOrdering(value.cases, value.formal_test_points, value.ordering_registry, value.ordering_context);
  if (ordered.kind === 'fatal') return ordered;
  return {
    kind: 'ordered',
    ordered_case_ids: ordered.cases.map((/** @type {any} */ candidate) => candidate.case_id),
    cases: ordered.cases
  };
}

/**
 * Recompute instead of trusting persisted dependency sets or a caller-supplied
 * order. Returns diagnostics in the same closed quality-failure vocabulary.
 * @param {unknown} compiled
 * @param {unknown} input
 * @returns {any[]}
 */
export function validatePresentationOrderV4(compiled, input) {
  const expected = compilePresentationOrderV4(input);
  if (expected.kind === 'fatal') return expected.diagnostics;
  if (!compiled || typeof compiled !== 'object' || Array.isArray(compiled)) {
    return failure('PRESENTATION_ORDER_INVALID').diagnostics;
  }
  const value = /** @type {any} */ (compiled);
  if (value.kind !== 'ordered' || canonicalStringify(value.ordered_case_ids) !== canonicalStringify(expected.ordered_case_ids)) {
    return failure('PRESENTATION_ORDER_MISMATCH').diagnostics;
  }
  if (!Array.isArray(value.cases) || value.cases.length !== expected.cases.length) {
    return failure('CASE_DEPENDENCY_SET_MISMATCH').diagnostics;
  }
  for (let index = 0; index < expected.cases.length; index += 1) {
    const actual = value.cases[index];
    const target = expected.cases[index];
    if (!actual || actual.case_id !== target.case_id
      || canonicalStringify(actual.ordering?.depends_on_case_ids) !== canonicalStringify(target.ordering.depends_on_case_ids)) {
      return failure('CASE_DEPENDENCY_SET_MISMATCH').diagnostics;
    }
  }
  return [];
}
