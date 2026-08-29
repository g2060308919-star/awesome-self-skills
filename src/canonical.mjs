import { createHash } from 'node:crypto';

const VOLATILE_FIELDS = new Set(['source_revision', 'created_at', 'updated_at', 'confirmed_at', 'event_at', 'timestamp', 'position', 'index', 'array_index']);
const ORDERED_ARRAY_FIELDS = new Set(['steps', 'action_path', 'flow', 'flow_sequence', 'sequence', 'transition_order']);
const SET_ARRAY_FIELDS = new Set([
  'source_ids', 'supersedes', 'source_locator_ids', 'source_claim_ids', 'parent_claim_ids',
  'root_issue_ids', 'affected_obligation_ids', 'module_ids', 'view_element_refs',
  'required_oracle_refs', 'required_capabilities', 'obligation_ids', 'case_ids',
  'oracle_refs', 'test_point_ids', 'asked_root_issue_ids',
  'sources', 'locators', 'decision_records', 'clarification_events', 'claims',
  'fact_ledger', 'views', 'obligations', 'interaction_candidates', 'fact_routes',
  'interaction_routes', 'obligation_dispositions', 'cases', 'exploratory_candidates',
  'grounded', 'conditional', 'blocked', 'exploratory'
]);
const ROOT_ISSUE_ASSOCIATIONS = new Set(['case_ids', 'case_id', 'test_point_ids', 'test_point_id', 'obligation_ids', 'obligation_id']);
const EXECUTION_SIGNATURE_ASSOCIATIONS = new Set(['test_point_ids', 'test_point_id', 'obligation_ids', 'obligation_id']);
const STABLE_SEMANTIC_KEY_FIELDS = ['source_id', 'locator_id', 'decision_id', 'event_id', 'claim_id', 'fact_id', 'view_id', 'obligation_id', 'case_id', 'candidate_id', 'exploratory_id', 'rule_id', 'root_issue_id'];

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** @param {unknown} value @returns {string} */
function stableSemanticKey(value) {
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'number') return `number:${value}`;
  if (typeof value === 'boolean') return `boolean:${value}`;
  if (value === null) return 'null';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = /** @type {Record<string, unknown>} */ (value);
    for (const field of STABLE_SEMANTIC_KEY_FIELDS) {
      if (typeof object[field] === 'string') return `id:${object[field]}`;
    }
  }
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
    .filter(([key]) => !((entity === 'execution' || inExecutionSignature) && EXECUTION_SIGNATURE_ASSOCIATIONS.has(key)))
    .map(([key, item]) => [key, stripForEntity(item, entity, [...path, key])]));
}

/** @param {unknown} value @param {string} [entity] @returns {unknown} */
export function stripVolatileFields(value, entity = 'other') {
  return stripForEntity(value, entity === 'root' ? 'root' : entity === 'execution' ? 'execution' : 'other');
}

/** @param {string} prefix @param {unknown} semanticSignature */
export function stableId(prefix, semanticSignature) {
  const entity = prefix === 'root' || prefix === 'root_issue' ? 'root' : prefix === 'case' ? 'execution' : 'other';
  return `${prefix}_${digest(stripVolatileFields(semanticSignature, entity)).slice(0, 16)}`;
}
