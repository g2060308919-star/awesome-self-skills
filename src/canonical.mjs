import { createHash } from 'node:crypto';

const VOLATILE_FIELDS = new Set(['source_revision', 'created_at', 'updated_at', 'confirmed_at', 'event_at', 'timestamp', 'position', 'index', 'array_index']);
const ORDERED_ARRAY_FIELDS = new Set(['steps', 'action_path', 'flow', 'flow_sequence', 'sequence', 'transition_order']);
const SET_ARRAY_FIELDS = new Set(['source_locator_ids', 'source_claim_ids', 'root_issue_ids', 'affected_obligation_ids', 'case_ids', 'obligation_ids', 'view_element_refs', 'required_oracle_refs', 'required_capabilities', 'parent_claim_ids']);
const ROOT_ISSUE_ASSOCIATIONS = new Set(['case_ids', 'case_id', 'test_point_ids', 'test_point_id', 'obligation_ids', 'obligation_id']);
const EXECUTION_SIGNATURE_ASSOCIATIONS = new Set(['test_point_ids', 'test_point_id', 'obligation_ids', 'obligation_id']);

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {unknown} value @returns {string} */
function stableSemanticKey(value) {
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'number') return `number:${value}`;
  if (typeof value === 'boolean') return `boolean:${value}`;
  if (value === null) return 'null';
  return JSON.stringify(canonicalize(value, []));
}

/** @param {unknown} value @param {string[]} [path] @returns {unknown} */
function canonicalize(value, path = []) {
  if (Array.isArray(value)) {
    const field = path.at(-1) ?? '';
    const values = value.map((item) => canonicalize(item, path));
    if (ORDERED_ARRAY_FIELDS.has(field)) return values;
    if (SET_ARRAY_FIELDS.has(field)) return [...values].sort((left, right) => compareCodePoints(stableSemanticKey(left), stableSemanticKey(right)));
    return values;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, item]) => [key, canonicalize(item, [...path, key])]));
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

/** @param {unknown} value @param {'root' | 'execution' | 'other'} entity @param {string[]} [path] @returns {unknown} */
function stripForEntity(value, entity, path = []) {
  if (Array.isArray(value)) return value.map((item) => stripForEntity(item, entity, path));
  if (!value || typeof value !== 'object') return value;
  const inExecutionSignature = path.includes('execution_signature');
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_FIELDS.has(key))
    .filter(([key]) => !(entity === 'root' && ROOT_ISSUE_ASSOCIATIONS.has(key)))
    .filter(([key]) => !(inExecutionSignature && EXECUTION_SIGNATURE_ASSOCIATIONS.has(key)))
    .map(([key, item]) => [key, stripForEntity(item, entity, [...path, key])]));
}

/** @param {unknown} value @param {string} [entity] @returns {unknown} */
export function stripVolatileFields(value, entity = 'other') {
  return stripForEntity(value, entity === 'root' ? 'root' : 'other');
}

/** @param {string} prefix @param {unknown} semanticSignature */
export function stableId(prefix, semanticSignature) {
  const entity = prefix === 'root' || prefix === 'root_issue' ? 'root' : 'other';
  return `${prefix}_${digest(stripVolatileFields(semanticSignature, entity)).slice(0, 16)}`;
}
