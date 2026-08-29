import { createHash } from 'node:crypto';

const volatileField = /^(?:source_revision|(?:created|updated|confirmed|event)_at|timestamp|position|index)$/;
const orderedArrayField = /^(?:steps|action_path|flow|flow_sequence|sequence)$/;
const setLikeArrayField = /(?:_ids|_refs|root_issue_ids|source_locator_ids|affected_obligation_ids)$/;

/** @param {unknown} value @param {string} [field] @returns {unknown} */
function canonicalize(value, field = '') {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonicalize(item));
    if (orderedArrayField.test(field)) return values;
    if (setLikeArrayField.test(field)) {
      return [...values].sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
    }
    return values;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item, key)]));
  }
  return value;
}

/** @param {unknown} value @returns {string} */
export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

/** @param {unknown} value @returns {string} */
export function digest(value) {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

/** @param {unknown} value @param {string} [field] @returns {unknown} */
export function stripVolatileFields(value, field = '') {
  if (Array.isArray(value)) {
    if (field === 'test_point_ids' || field === 'obligation_ids') return [];
    return value.map((item) => stripVolatileFields(item));
  }
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !volatileField.test(key))
    .filter(([key]) => !(field === 'execution_signature' && /(?:test_point|obligation)_ids$/.test(key)))
    .filter(([key]) => !(field === 'root_issue_id' && /(?:case|test_point|obligation)_ids$/.test(key)))
    .map(([key, item]) => [key, stripVolatileFields(item, key)]));
}

/** @param {string} prefix @param {unknown} semanticSignature */
export function stableId(prefix, semanticSignature) {
  return `${prefix}_${digest(stripVolatileFields(semanticSignature)).slice(0, 16)}`;
}
