import { canonicalStringify } from './canonical.mjs';
import { compareUnicodeScalar } from './semantic-gaps-v4.mjs';

/** @param {any} left @param {any} right */
function compareNonBlockingDiagnosticsV4(left, right) {
  for (const [leftValue, rightValue] of [
    [String(left.code ?? ''), String(right.code ?? '')],
    [String(left.source_event_id ?? ''), String(right.source_event_id ?? '')],
    [canonicalStringify(left.affected_question_part_ids ?? []),
      canonicalStringify(right.affected_question_part_ids ?? [])]
  ]) {
    const comparison = compareUnicodeScalar(leftValue, rightValue);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

/**
 * Canonical public warning order is part of the v4 reply contract.
 * @param {any[]} diagnostics
 */
export function sortNonBlockingDiagnosticsV4(diagnostics) {
  return structuredClone(diagnostics).sort(compareNonBlockingDiagnosticsV4);
}
