import { canonicalStringify } from '../canonical.mjs';
import { V5ProtocolError } from './errors.mjs';

const SET_FIELD_NAMES = new Set([
  'basis', 'required_observation_slot_digests', 'candidate_ids', 'mention_candidate_ids',
  'permission_scope_candidate_ids', 'signaled_dimensions', 'partition_ids', 'role_domain',
  'trigger_basis', 'affected_refs', 'source_request_ids', 'request_ids', 'input_digests'
]);
const ORDERED_FIELD_NAMES = new Set([
  'visible_question_part_ids', 'coordinate_evidence_digests', 'steps', 'transition_history',
  'presentation_parts', 'source_units'
]);

/** @param {string} left @param {string} right */
function codePointCompare(left, right) {
  const a = Array.from(left, (value) => value.codePointAt(0) ?? 0);
  const b = Array.from(right, (value) => value.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

/** @param {unknown} value @param {string|null} fieldName @returns {unknown} */
export function canonicalizeV5Value(value, fieldName = null) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Non-finite numbers are not canonical.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (value === undefined) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Undefined is not canonical.');
  if (Array.isArray(value)) {
    const normalized = value.map((item) => canonicalizeV5Value(item, null));
    if (!fieldName || ORDERED_FIELD_NAMES.has(fieldName) || !SET_FIELD_NAMES.has(fieldName)) return normalized;
    const keyed = normalized.map((item) => ({ item, key: canonicalStringify(item) }));
    if (new Set(keyed.map(({ key }) => key)).size !== keyed.length) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', `Duplicate member in set field ${fieldName}.`);
    keyed.sort((left, right) => codePointCompare(left.key, right.key));
    return keyed.map(({ item }) => item);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, canonicalizeV5Value(child, key)]));
  }
  return value;
}

/** @param {unknown} value */
export function canonicalV5Stringify(value) {
  return canonicalStringify(canonicalizeV5Value(value));
}
