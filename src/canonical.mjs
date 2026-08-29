import { createHash } from 'node:crypto';

const VOLATILE_FIELDS = new Set(['source_revision', 'created_at', 'updated_at', 'confirmed_at', 'event_at', 'timestamp', 'position', 'index', 'array_index']);
const ORDERED_ARRAY_PATHS = new Set(['/steps', '/action_path', '/flow', '/flow_sequence', '/sequence', '/transition_order', '/cases/steps', '/grounded/steps', '/conditional/steps', '/cases/cleanup/steps', '/grounded/cleanup/steps', '/conditional/cleanup/steps', '/cases/execution_signature/action_path', '/grounded/execution_signature/action_path', '/conditional/execution_signature/action_path', '/execution_signature/action_path']);
const SET_ARRAY_PATHS = new Set([
  '/source_ids', '/supersedes', '/source_locator_ids', '/source_claim_ids', '/parent_claim_ids', '/root_issue_ids', '/affected_obligation_ids', '/module_ids', '/view_element_refs', '/required_oracle_refs', '/required_capabilities', '/obligation_ids', '/case_ids', '/oracle_refs', '/test_point_ids', '/asked_root_issue_ids',
  '/sources', '/locators', '/source_policy/rules', '/source_policy/rules/source_ids', '/source_policy/rules/supersedes', '/decision_records/root_issue_ids', '/decision_records/affected_obligation_ids', '/clarification_events/root_issue_ids',
  '/claims', '/claims/source_locator_ids', '/claims/parent_claim_ids', '/claims/closed_world_input/enumerated_values', '/claims/formula_input/inputs', '/fact_ledger', '/fact_ledger/source_claim_ids',
  '/views', '/views/elements', '/views/source_claim_ids', '/views/elements/source_claim_ids', '/views/elements/model_refs', '/views/elements/permissions', '/views/relations', '/views/relations/source_claim_ids', '/views/relations/model_refs', '/interaction_matrix', '/interaction_matrix/module_ids', '/interaction_candidates', '/interaction_candidates/module_ids', '/interaction_candidates/source_claim_ids',
  '/obligations', '/obligations/source_claim_ids', '/obligations/view_element_refs', '/obligations/required_oracle_refs', '/obligations/required_capabilities', '/fact_routes', '/fact_routes/obligation_ids', '/interaction_routes',
  '/cases', '/cases/obligation_ids', '/cases/source_claim_ids', '/cases/fact_ids', '/cases/evidence_refs', '/cases/preconditions', '/cases/preconditions/source_claim_ids', '/cases/data', '/cases/steps/expectations', '/cases/testability_profile/capabilities', '/cases/testability_profile/observers', '/cases/testability_profile/controls', '/cases/execution_signature/oracle_refs', '/cases/execution_signature/test_point_ids', '/execution_signature/oracle_refs', '/execution_signature/test_point_ids', '/obligation_dispositions', '/obligation_dispositions/case_ids', '/obligation_dispositions/evidence_refs', '/exploratory_candidates', '/exploratory_candidates/source_claim_ids',
  '/grounded', '/grounded/fact_ids', '/grounded/obligation_ids', '/grounded/source_claim_ids', '/grounded/evidence_refs', '/grounded/preconditions', '/grounded/preconditions/source_claim_ids', '/grounded/data', '/grounded/steps/expectations', '/grounded/testability_profile/capabilities', '/grounded/testability_profile/observers', '/grounded/testability_profile/controls', '/grounded/execution_signature/oracle_refs', '/grounded/execution_signature/test_point_ids',
  '/conditional', '/conditional/fact_ids', '/conditional/obligation_ids', '/conditional/source_claim_ids', '/conditional/evidence_refs', '/conditional/preconditions', '/conditional/preconditions/source_claim_ids', '/conditional/data', '/conditional/steps/expectations', '/conditional/testability_profile/capabilities', '/conditional/testability_profile/observers', '/conditional/testability_profile/controls', '/conditional/execution_signature/oracle_refs', '/conditional/execution_signature/test_point_ids',
  '/blocked', '/exploratory', '/coverage/not_applicable', '/root_issue_dispositions', '/blockers/affected_obligation_ids'
]);
const ROOT_ISSUE_ASSOCIATIONS = new Set(['case_ids', 'case_id', 'test_point_ids', 'test_point_id', 'obligation_ids', 'obligation_id']);
const EXECUTION_SIGNATURE_ASSOCIATIONS = new Set(['test_point_ids', 'test_point_id', 'obligation_ids', 'obligation_id']);
const COLLECTION_ID_FIELDS = new Map([
  ['/sources', 'source_id'], ['/locators', 'locator_id'], ['/source_policy/rules', 'rule_id'], ['/decision_records', 'decision_id'], ['/clarification_events', 'event_id'], ['/claims', 'claim_id'], ['/fact_ledger', 'fact_id'], ['/views', 'view_id'], ['/views/elements', 'element_id'], ['/views/relations', 'relation_id'], ['/interaction_candidates', 'candidate_id'], ['/obligations', 'obligation_id'], ['/fact_routes', 'fact_id'], ['/interaction_routes', 'candidate_id'], ['/cases', 'case_id'], ['/cases/steps/expectations', 'expectation_id'], ['/obligation_dispositions', 'obligation_id'], ['/exploratory_candidates', 'exploratory_id'], ['/grounded', 'case_id'], ['/grounded/steps/expectations', 'expectation_id'], ['/conditional', 'case_id'], ['/conditional/steps/expectations', 'expectation_id'], ['/blocked', 'obligation_id'], ['/exploratory', 'exploratory_id'], ['/root_issue_dispositions', 'root_issue_id']
]);

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

/** @param {string[]} path */
function pathKey(path) {
  return `/${path.join('/')}`;
}

/** @param {string[]} path @param {unknown} value @returns {string} */
function stableSemanticKey(path, value) {
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'number') return `number:${value}`;
  if (typeof value === 'boolean') return `boolean:${value}`;
  if (value === null) return 'null';
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = /** @type {Record<string, unknown>} */ (value);
    const collectionPath = pathKey(path);
    const idField = COLLECTION_ID_FIELDS.get(collectionPath);
    if (idField && typeof object[idField] === 'string') return `id:${object[idField]}`;
    if (collectionPath === '/interaction_matrix') return `interaction:${JSON.stringify({ dimension: object.dimension, module_ids: object.module_ids })}`;
  }
  return JSON.stringify(canonicalize(value, []));
}

/** @param {unknown} value @param {string[]} [path] @returns {unknown} */
function canonicalize(value, path = []) {
  if (Array.isArray(value)) {
    const values = value.map((item) => canonicalize(item, path));
    const currentPath = pathKey(path);
    if (ORDERED_ARRAY_PATHS.has(currentPath)) return values;
    if (SET_ARRAY_PATHS.has(currentPath)) return [...values].sort((left, right) => compareCodePoints(stableSemanticKey(path, left), stableSemanticKey(path, right)));
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

/** @param {unknown} value @param {'root' | 'case' | 'execution' | 'other'} entity @param {string[]} [path] @returns {unknown} */
function stripForEntity(value, entity, path = []) {
  if (Array.isArray(value)) return value.map((item) => stripForEntity(item, entity, path));
  if (!value || typeof value !== 'object') return value;
  const rootAssociations = entity === 'root' && path.length === 0;
  const directExecutionAssociations = entity === 'execution' && path.length === 0;
  const caseExecutionAssociations = entity === 'case' && path.length === 1 && path[0] === 'execution_signature';
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !VOLATILE_FIELDS.has(key))
    .filter(([key]) => !(rootAssociations && ROOT_ISSUE_ASSOCIATIONS.has(key)))
    .filter(([key]) => !((directExecutionAssociations || caseExecutionAssociations) && EXECUTION_SIGNATURE_ASSOCIATIONS.has(key)))
    .map(([key, item]) => [key, stripForEntity(item, entity, [...path, key])]));
}

/** @param {unknown} value @param {string} [entity] @returns {unknown} */
export function stripVolatileFields(value, entity = 'other') {
  return stripForEntity(value, entity === 'root' ? 'root' : entity === 'case' ? 'case' : entity === 'execution' ? 'execution' : 'other');
}

/** @param {string} prefix @param {unknown} semanticSignature */
export function stableId(prefix, semanticSignature) {
  const isCaseObject = Boolean(semanticSignature && typeof semanticSignature === 'object' && !Array.isArray(semanticSignature) && Object.hasOwn(semanticSignature, 'execution_signature'));
  const entity = prefix === 'root' || prefix === 'root_issue' ? 'root' : prefix === 'case' ? isCaseObject ? 'case' : 'execution' : 'other';
  return `${prefix}_${digest(stripVolatileFields(semanticSignature, entity)).slice(0, 16)}`;
}
