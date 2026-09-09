import artifactSchema from '../skill/generate-test-cases/scripts/schemas/ordering-registry.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from './canonical.mjs';
import { validateCaseSemanticsV4 } from './case-semantics-v4.mjs';
import { canonicalIds, compareScalar } from './not-applicable.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

const text = { type: 'string', minLength: 1, pattern: '\\S' };
const ids = { type: 'array', minItems: 1, uniqueItems: true, items: text };
const integer = { type: 'integer', minimum: 0 };
/** @param {Record<string,unknown>} properties */
const closed = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
/** @param {Record<string,unknown>} items */
const array = items => ({ type: 'array', items });
const flowSubject = { module_id: text, subject_ref: text };
const actionSubject = { module_id: text, flow_subject_ref: text, subject_ref: text };
const dependencySubject = { predecessor_outcome_id: text, successor_outcome_id: text };
const basisSchema = { oneOf: [
  closed({ kind: { const: 'evidence' }, claim_ids: ids }),
  closed({ kind: { const: 'decision' }, decision_ids: ids })
] };
const semanticSubjectSchema = { oneOf: [
  closed({ kind: { const: 'flow' }, ...flowSubject }),
  closed({ kind: { const: 'action' }, ...actionSubject }),
  closed({ kind: { const: 'outcome_dependency' }, ...dependencySubject })
] };
const contextSchema = closed({
  sources: array(closed({ stable_source_id: text })),
  locators: array(closed({ locator_id: text, stable_source_id: text, unit_kind: { enum: ['text', 'table', 'image'] },
    structural_coordinates: { type: 'array', minItems: 1, items: integer }, start_scalar: integer })),
  modules: array(closed({ module_id: text, role: { enum: ['primary', 'upstream', 'downstream', 'external'] }, locator_ids: ids })),
  flows: array(closed({ ...flowSubject, locator_id: text, claim_ids: ids })),
  actions: array(closed({ ...actionSubject, locator_id: text, claim_ids: ids })),
  dependencies: array(closed({ ...dependencySubject, basis: basisSchema })),
  verified_claims: array(closed({ claim_id: text, locator_ids: ids, subjects: { ...array(semanticSubjectSchema), minItems: 1, uniqueItems: true } })),
  verified_decisions: array(closed({ decision_id: text, subjects: { ...array(closed({ kind: { const: 'outcome_dependency' }, ...dependencySubject })), minItems: 1, uniqueItems: true } }))
});
const pointSchema = closed({ formal_test_point_id: text, outcome_id: text, acceptance_role: { enum: ['primary_acceptance', 'dependency_contract', 'context_only'] } });
const moduleRoles = ['primary', 'upstream', 'downstream', 'external'];
const units = ['text', 'table', 'image'];
/** @param {any} input @returns {any} */
function normalize(input) {
  if (typeof input === 'string') return input.normalize('NFC');
  if (Array.isArray(input)) return input.map(normalize);
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, normalize(value)]));
  return input;
}
/** @param {any[]} values @param {string} key */
function uniqueMap(values, key) {
  const result = new Map();
  for (const value of values) {
    if (result.has(value[key])) throw new TypeError('ORDERING_ID_AMBIGUOUS');
    result.set(value[key], value);
  }
  return result;
}
/** Lexicographic numeric coordinates preserve row/column ordering (2 before 10).
 * @param {any[]} left @param {any[]} right @returns {number}
 */
function compareTuple(left, right) {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const difference = Array.isArray(left[index]) ? compareTuple(left[index], right[index]) : left[index] - right[index];
    if (difference) return difference;
  }
  return left.length - right.length;
}
/** @param {unknown} input */
function verifiedContext(input) {
  const context = normalize(input);
  if (validateAgainstSchema(context, contextSchema).length) throw new TypeError('ORDERING_CONTEXT_INVALID');
  const sources = uniqueMap(context.sources, 'stable_source_id');
  const sourceIndex = new Map([...sources.keys()].sort(compareScalar).map((id, index) => [id, index]));
  const locators = uniqueMap(context.locators, 'locator_id');
  const modules = uniqueMap(context.modules, 'module_id');
  const claims = uniqueMap(context.verified_claims, 'claim_id');
  const decisions = uniqueMap(context.verified_decisions, 'decision_id');
  for (const locator of locators.values()) {
    if (!sources.has(locator.stable_source_id) || !Number.isSafeInteger(locator.start_scalar)
      || locator.structural_coordinates.some((/** @type {number} */ value) => !Number.isSafeInteger(value))) throw new TypeError('ORDERING_LOCATOR_INVALID');
  }
  for (const owner of [...modules.values(), ...claims.values()]) {
    if (owner.locator_ids.some((/** @type {string} */ id) => !locators.has(id))) throw new TypeError('ORDERING_LOCATOR_UNRESOLVED');
  }
  /** @param {string} locatorId @returns {any[]} */
  const keyFor = locatorId => {
    const locator = locators.get(locatorId);
    if (!locator) throw new TypeError('ORDERING_LOCATOR_UNRESOLVED');
    return [sourceIndex.get(locator.stable_source_id), units.indexOf(locator.unit_kind), [...locator.structural_coordinates], locator.start_scalar];
  };
  return { context, modules, claims, decisions, keyFor };
}
/** @param {any} assessment @param {any} subject */
const entails = (assessment, subject) => assessment?.subjects.some((/** @type {any} */ item) => canonicalStringify(item) === canonicalStringify(subject));

/**
 * Input Facts and Claim/Decision assessments are compiler-owned outputs of
 * source audit and Evidence validation, not Adapter-writable registry data.
 * Coordinates are already canonical source locators; no prose is parsed for rank.
 * @param {unknown} input
 */
export function compileOrderingRegistry(input) {
  const { context, modules, claims, decisions, keyFor } = verifiedContext(input);
  /** @type {Map<string,any>} */ const flows = new Map();
  /** @type {Map<string,any>} */ const actions = new Map();
  /** @type {Map<string,any>} */ const dependencies = new Map();
  /** @param {any} fact @param {any} subject */
  const requireEvidence = (fact, subject) => {
    if (!modules.has(fact.module_id)) throw new TypeError('ORDERING_MODULE_UNRESOLVED');
    for (const id of fact.claim_ids) {
      const claim = claims.get(id);
      if (!entails(claim, subject) || !claim.locator_ids.includes(fact.locator_id)) throw new TypeError('ORDERING_EVIDENCE_UNVERIFIED');
    }
  };
  /** @param {Map<string,any>} registry @param {string} id @param {any} entry */
  const merge = (registry, id, entry) => {
    const previous = registry.get(id);
    if (!previous) registry.set(id, entry);
    else {
      previous.claim_ids = canonicalIds([...previous.claim_ids, ...entry.claim_ids]);
      if (compareTuple(entry.locator_order_key, previous.locator_order_key) < 0) previous.locator_order_key = entry.locator_order_key;
    }
  };
  for (const fact of context.flows) {
    const subject = { kind: 'flow', module_id: fact.module_id, subject_ref: fact.subject_ref };
    requireEvidence(fact, subject);
    const flowId = `FLOW-${digest(subject)}`;
    merge(flows, flowId, { flow_id: flowId, module_id: fact.module_id, locator_order_key: keyFor(fact.locator_id), claim_ids: canonicalIds(fact.claim_ids) });
  }
  for (const fact of context.actions) {
    const subject = { kind: 'action', module_id: fact.module_id, flow_subject_ref: fact.flow_subject_ref, subject_ref: fact.subject_ref };
    requireEvidence(fact, subject);
    const flowId = `FLOW-${digest({ kind: 'flow', module_id: fact.module_id, subject_ref: fact.flow_subject_ref })}`;
    if (!flows.has(flowId)) throw new TypeError('ORDERING_FLOW_UNRESOLVED');
    const actionId = `ACTION-${digest(subject)}`;
    merge(actions, actionId, { action_id: actionId, flow_id: flowId, locator_order_key: keyFor(fact.locator_id), claim_ids: canonicalIds(fact.claim_ids) });
  }
  for (const rule of context.dependencies) {
    const subject = { kind: 'outcome_dependency', predecessor_outcome_id: rule.predecessor_outcome_id, successor_outcome_id: rule.successor_outcome_id };
    const field = rule.basis.kind === 'evidence' ? 'claim_ids' : 'decision_ids';
    const assessments = rule.basis.kind === 'evidence' ? claims : decisions;
    for (const id of rule.basis[field]) if (!entails(assessments.get(id), subject)) throw new TypeError('ORDERING_DEPENDENCY_BASIS_UNVERIFIED');
    const body = { predecessor_outcome_id: rule.predecessor_outcome_id, successor_outcome_id: rule.successor_outcome_id,
      basis: { kind: rule.basis.kind, [field]: canonicalIds(rule.basis[field]) } };
    const ruleId = `DEP-${digest(body)}`;
    dependencies.set(ruleId, { dependency_rule_id: ruleId, ...body });
  }
  const result = {
    business_flows: [...flows.values()].sort((a, b) => compareTuple(a.locator_order_key, b.locator_order_key) || compareScalar(a.flow_id, b.flow_id)),
    page_actions: [...actions.values()].sort((a, b) => compareTuple(a.locator_order_key, b.locator_order_key) || compareScalar(a.action_id, b.action_id)),
    dependency_rules: [...dependencies.values()].sort((a, b) => compareScalar(a.dependency_rule_id, b.dependency_rule_id))
  };
  if (validateAgainstSchema(result, artifactSchema).length) throw new TypeError('ORDERING_ARTIFACT_INVALID');
  return result;
}
/** @param {string} code */
const failure = code => ({ kind: 'fatal', result_kind: 'quality_failure', diagnostics: [{ category: 'quality_failure', code, path: '/ordering',
  message: 'Canonical Case ordering requires verified source-backed references and a complete acyclic dependency graph.' }] });

/**
 * Selectors come from Case Draft; dependencies are compiler-only output. This
 * pure result is not a public runner reply and performs no persistence/execution.
 * @param {unknown} inputCases @param {unknown} inputPoints @param {unknown} registry @param {unknown} systemContext
 * @returns {any}
 */
export function compileCaseOrdering(inputCases, inputPoints, registry, systemContext) {
  try {
    const expected = compileOrderingRegistry(systemContext);
    if (canonicalStringify(registry) !== canonicalStringify(expected)) throw new TypeError('ORDERING_REGISTRY_MISMATCH');
    const cases = normalize(inputCases);
    const points = normalize(inputPoints);
    if (!Array.isArray(cases) || validateAgainstSchema(points, array(pointSchema)).length) throw new TypeError('ORDERING_CASE_INPUT_INVALID');
    const byCaseId = uniqueMap(cases, 'case_id');
    const byPointId = uniqueMap(points, 'formal_test_point_id');
    const { modules, keyFor } = verifiedContext(systemContext);
    const flows = uniqueMap(expected.business_flows, 'flow_id');
    const actions = uniqueMap(expected.page_actions, 'action_id');
    /** @type {Map<string,Set<string>>} */ const caseIdsByOutcome = new Map();
    /** @type {Map<string,Set<string>>} */ const dependencies = new Map();
    for (const candidate of cases) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new TypeError('ORDERING_CASE_INPUT_INVALID');
      const { semantic_status, ...draft } = candidate;
      if (validateCaseSemanticsV4(draft).length || (semantic_status !== undefined && !['Grounded', 'Conditional', 'Blocked'].includes(semantic_status))) {
        throw new TypeError('ORDERING_CASE_INPUT_INVALID');
      }
      const point = byPointId.get(candidate.primary_test_point_id);
      if (!point || point.acceptance_role !== candidate.acceptance_role) throw new TypeError('ORDERING_TEST_POINT_UNRESOLVED');
      if (!modules.has(candidate.module_id)) throw new TypeError('ORDERING_MODULE_UNRESOLVED');
      const flow = flows.get(candidate.ordering.business_flow_ref);
      const action = actions.get(candidate.ordering.page_action_ref);
      if ((candidate.ordering.business_flow_ref !== null && (!flow || flow.module_id !== candidate.module_id))
        || (candidate.ordering.page_action_ref !== null && (!action || !flow || action.flow_id !== flow.flow_id))) throw new TypeError('ORDERING_CASE_REFERENCE_UNRESOLVED');
      const outcomeIds = caseIdsByOutcome.get(point.outcome_id) ?? new Set();
      outcomeIds.add(candidate.case_id); caseIdsByOutcome.set(point.outcome_id, outcomeIds);
      dependencies.set(candidate.case_id, new Set());
    }
    for (const rule of expected.dependency_rules) {
      const predecessors = caseIdsByOutcome.get(rule.predecessor_outcome_id);
      const successors = caseIdsByOutcome.get(rule.successor_outcome_id);
      if (!predecessors?.size || !successors?.size) throw new TypeError('CASE_DEPENDENCY_ENDPOINT_MISSING');
      for (const successor of successors) for (const predecessor of predecessors) {
        if (successor === predecessor) throw new TypeError('CASE_DEPENDENCY_SELF_REFERENCE');
        dependencies.get(successor)?.add(predecessor);
      }
    }
    const rankedModules = [...modules.values()].map(module => ({ ...module,
      first_locator: module.locator_ids.map(keyFor).sort(compareTuple)[0] })).sort((a, b) =>
      moduleRoles.indexOf(a.role) - moduleRoles.indexOf(b.role) || compareTuple(a.first_locator, b.first_locator) || compareScalar(a.module_id, b.module_id));
    const moduleRank = new Map(rankedModules.map((module, index) => [module.module_id, index]));
    const flowRank = new Map(expected.business_flows.map((flow, index) => [flow.flow_id, index]));
    const actionRank = new Map(expected.page_actions.map((action, index) => [action.action_id, index]));
    /** @param {any} candidate */
    const rank = candidate => [moduleRank.get(candidate.module_id), flowRank.get(candidate.ordering.business_flow_ref) ?? Number.MAX_SAFE_INTEGER,
      actionRank.get(candidate.ordering.page_action_ref) ?? Number.MAX_SAFE_INTEGER, ['P0', 'P1', 'P2', 'P3'].indexOf(candidate.priority)];
    /** @param {string} left @param {string} right */
    const compareCase = (left, right) => {
      const a = byCaseId.get(left); const b = byCaseId.get(right);
      return compareTuple(rank(a), rank(b)) || compareScalar(a.title, b.title) || compareScalar(a.case_id, b.case_id);
    };
    const remaining = new Map([...dependencies].map(([id, refs]) => [id, new Set(refs)]));
    /** @type {any[]} */ const ordered = [];
    while (remaining.size) {
      const ready = [...remaining].filter(([, refs]) => refs.size === 0).map(([id]) => id).sort(compareCase);
      if (!ready.length) throw new TypeError('CASE_DEPENDENCY_CYCLE');
      const id = ready[0]; const candidate = byCaseId.get(id);
      ordered.push({ ...candidate, ordering: { ...candidate.ordering, depends_on_case_ids: canonicalIds([...(dependencies.get(id) ?? [])]) } });
      remaining.delete(id);
      for (const refs of remaining.values()) refs.delete(id);
    }
    return { kind: 'ordered', cases: ordered };
  } catch (error) { return failure(error instanceof Error ? error.message : 'ORDERING_INVALID'); }
}

/** Recompute the exact compiler-injected sets; never trust a persisted claim.
 * @param {unknown} inputCases @param {unknown} points @param {unknown} registry @param {unknown} systemContext
 */
export function validateCaseOrdering(inputCases, points, registry, systemContext) {
  if (!Array.isArray(inputCases)) return failure('ORDERING_CASE_INPUT_INVALID').diagnostics;
  const drafts = inputCases.map(candidate => {
    if (!candidate || typeof candidate !== 'object' || !candidate.ordering) return candidate;
    const { depends_on_case_ids, ...selectors } = candidate.ordering;
    return { ...candidate, ordering: selectors };
  });
  const result = compileCaseOrdering(drafts, points, registry, systemContext);
  if (result.kind === 'fatal') return result.diagnostics;
  for (const candidate of inputCases) {
    const expected = result.cases.find((/** @type {any} */ item) => item.case_id === candidate.case_id);
    if (!expected || canonicalStringify(expected.ordering.depends_on_case_ids) !== canonicalStringify(candidate.ordering.depends_on_case_ids)) {
      return failure('CASE_DEPENDENCY_SET_MISMATCH').diagnostics;
    }
  }
  return [];
}
