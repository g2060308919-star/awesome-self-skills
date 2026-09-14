import behaviorSchema from '../../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import obligationSchema from '../../skill/generate-test-cases/scripts/schemas/test-obligations.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from '../canonical.mjs';
import { canonicalIds, compareScalar, notApplicableContextSchema, notApplicableRecordSchema, validateNotApplicable } from '../not-applicable.mjs';
import { validateRiskReviewLedger } from '../risk-review.mjs';
import { validateAgainstSchema } from '../schema-validator.mjs';
import { sparseEvidenceContextSchema, validateSparseBehaviorElementV4 } from '../views/sparse-behavior-v4.mjs';

const text = { type: 'string', minLength: 1, pattern: '\\S' };
const refs = { type: 'array', uniqueItems: true, items: text };
/** @param {Record<string,unknown>} properties */
const closed = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
/** @param {string} name */
const ref = name => ({ $ref: `#/$defs/${name}` });
const compilationSchema = { $defs: obligationSchema.$defs, ...closed({ kind: { const: 'compiled' }, source_revision: { type: 'integer', minimum: 0 },
  outcomes: { type: 'array', items: ref('outcome') }, formal_test_points: { type: 'array', items: ref('formalTestPoint') },
  supporting_observations: { type: 'array', items: ref('supportingObservation') },
  fact_modules: { type: 'array', items: closed({ fact_id: text, module_id: text }) }, diagnostics: { type: 'array', maxItems: 0 }
}) };
/** @param {string} code @param {string} [path] */
const problem = (code, path = '/') => ({ category: 'quality_failure', code, path, message: 'Business outcome compilation and coverage require complete, verified, consistently owned semantic records.' });
/** @param {any[]} diagnostics */
const fatal = diagnostics => ({ kind: 'fatal', result_kind: 'quality_failure', diagnostics });
/** @param {any} input @returns {any} */
function normalize(input) {
  if (typeof input === 'string') return input.normalize('NFC');
  if (Array.isArray(input)) return input.map(normalize);
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, normalize(value)]));
  return input;
}
/** @param {any} outcome */
const outcomeIdentity = outcome => ({ fact_id: outcome.fact_id, condition: outcome.condition, expected: outcome.expected, acceptance_role: outcome.acceptance_role });
/** @param {any} observation */
const observationIdentity = observation => ({ outcome_id: observation.outcome_id, surface: observation.surface, assertion: observation.assertion });
/** @param {any[]} values @param {string} key */
const sorted = (values, key) => values.sort((left, right) => compareScalar(left[key], right[key]));

/**
 * Compiles modeled business outcomes only. Formal fact/interaction terminal
 * reconciliation and authoritative Scope membership remain production seams.
 * No positional boundary, timing neighbor or absent integration surface is added.
 * @param {unknown} input @param {unknown} systemContext @returns {any}
 */
export function compileBusinessOutcomesV4(input, systemContext) {
  const artifact = normalize(input); const context = normalize(systemContext);
  const diagnostics = validateAgainstSchema(artifact, { $defs: behaviorSchema.$defs, $ref: '#/$defs/v4Artifact' });
  if (diagnostics.length) return { kind: 'need_revision', stage: 'behavior_views', diagnostics };
  if (validateAgainstSchema(context, sparseEvidenceContextSchema).length) return fatal([problem('BEHAVIOR_EVIDENCE_CONTEXT_INVALID')]);
  /** @type {Map<string,any>} */ const outcomes = new Map();
  /** @type {Map<string,any>} */ const observations = new Map();
  /** @type {Map<string,any>} */ const factModules = new Map();
  const viewIds = new Set(); const conditionOwners = new Map();
  for (const view of artifact.views) {
    if (viewIds.has(view.view_id)) diagnostics.push(problem('BEHAVIOR_VIEW_ID_DUPLICATE'));
    viewIds.add(view.view_id); const elementIds = new Set();
    for (const element of view.elements) {
      const elementDiagnostics = validateSparseBehaviorElementV4(element, context);
      diagnostics.push(...elementDiagnostics); if (elementDiagnostics.length) continue;
      const fact = context.facts.find((/** @type {any} */ item) => item.fact_id === element.fact_id);
      const kind = element.kind === 'input_domain' ? 'input-domain' : element.kind;
      if (fact.module_id !== view.module_id || kind !== view.type) diagnostics.push(problem('BEHAVIOR_OWNER_MISMATCH'));
      if (elementIds.has(element.element_id)) diagnostics.push(problem('BEHAVIOR_ELEMENT_ID_DUPLICATE'));
      elementIds.add(element.element_id);
      const allRefs = canonicalIds(element.evidence_bindings.flatMap((/** @type {any} */ binding) => binding.claim_ids));
      if (allRefs.some(id => !view.source_claim_ids.includes(id))) diagnostics.push(problem('BEHAVIOR_VIEW_EVIDENCE_MISSING'));
      factModules.set(fact.fact_id, { fact_id: fact.fact_id, module_id: fact.module_id });
      const descriptors = element.kind === 'input_domain'
        ? element.partitions.map((/** @type {any} */ partition, /** @type {number} */ index) => ({
          condition: { [fact.condition_field]: partition.kind === 'enum' ? partition.value : { ...partition.bounds } }, expected: partition.expected, prefix: `/partitions/${index}/`
        }))
        : [{ condition: element.condition ?? {}, expected: element.expected ?? element.business_outcome, prefix: null }];
      for (const descriptor of descriptors) {
        const body = { fact_id: fact.fact_id, condition: descriptor.condition, expected: descriptor.expected, acceptance_role: fact.acceptance_role };
        const outcomeId = `OUT-${digest(body)}`;
        const owner = canonicalStringify({ fact_id: fact.fact_id, condition: descriptor.condition, acceptance_role: fact.acceptance_role });
        if (conditionOwners.has(owner) && conditionOwners.get(owner) !== outcomeId) diagnostics.push(problem('BUSINESS_OUTCOME_CONFLICT'));
        conditionOwners.set(owner, outcomeId);
        const claimIds = canonicalIds(element.evidence_bindings.filter((/** @type {any} */ binding) => descriptor.prefix === null
          || !binding.field_path.startsWith('/partitions/') || binding.field_path.startsWith(descriptor.prefix))
          .flatMap((/** @type {any} */ binding) => binding.claim_ids));
        const previous = outcomes.get(outcomeId);
        outcomes.set(outcomeId, { outcome_id: outcomeId, ...body, claim_ids: canonicalIds([...(previous?.claim_ids ?? []), ...claimIds]) });
        for (const [index, surface] of (element.surfaces ?? []).entries()) {
          const identity = { outcome_id: outcomeId, surface: surface.kind, assertion: surface.assertion };
          const id = `OBS-${digest(identity)}`;
          const source = element.evidence_bindings.find((/** @type {any} */ binding) => binding.field_path === `/surfaces/${index}/assertion`);
          const prior = observations.get(id);
          observations.set(id, { supporting_observation_id: id, ...identity, claim_ids: canonicalIds([...(prior?.claim_ids ?? []), ...source.claim_ids]) });
        }
      }
    }
  }
  if (diagnostics.length) return { kind: 'need_revision', stage: 'behavior_views', diagnostics };
  const result = { kind: 'compiled', source_revision: artifact.source_revision,
    outcomes: sorted([...outcomes.values()], 'outcome_id'),
    formal_test_points: sorted([...outcomes.keys()].map(outcome_id => ({ formal_test_point_id: `TP-${digest({ outcome_id })}`, outcome_id, semantic_gap_refs: [] })), 'formal_test_point_id'),
    supporting_observations: sorted([...observations.values()], 'supporting_observation_id'),
    fact_modules: sorted([...factModules.values()], 'fact_id'), diagnostics: [] };
  const errors = validateAgainstSchema(result, compilationSchema);
  return errors.length ? fatal(errors) : result;
}
/** @param {any} compiled */
function compilationErrors(compiled) {
  const errors = validateAgainstSchema(compiled, compilationSchema); if (errors.length) return errors;
  const outcomeIds = new Set(); const pointIds = new Set(); const pointOutcomes = new Set(); const observationIds = new Set();
  const factIds = new Set();
  for (const fact of compiled.fact_modules) {
    if (factIds.has(fact.fact_id)) errors.push(problem('OUTCOME_FACT_OWNER_AMBIGUOUS'));
    factIds.add(fact.fact_id);
  }
  for (const outcome of compiled.outcomes) {
    if (outcomeIds.has(outcome.outcome_id) || outcome.outcome_id !== `OUT-${digest(outcomeIdentity(outcome))}`) errors.push(problem('OUTCOME_ID_MISMATCH'));
    if (!factIds.has(outcome.fact_id)) errors.push(problem('OUTCOME_FACT_OWNER_MISSING'));
    outcomeIds.add(outcome.outcome_id);
  }
  for (const point of compiled.formal_test_points) {
    if (pointIds.has(point.formal_test_point_id) || pointOutcomes.has(point.outcome_id) || !outcomeIds.has(point.outcome_id)
      || point.formal_test_point_id !== `TP-${digest({ outcome_id: point.outcome_id })}`) errors.push(problem('FORMAL_TEST_POINT_ID_MISMATCH'));
    pointIds.add(point.formal_test_point_id); pointOutcomes.add(point.outcome_id);
  }
  if (pointOutcomes.size !== outcomeIds.size) errors.push(problem('FORMAL_TEST_POINT_MISSING'));
  for (const observation of compiled.supporting_observations) {
    if (observationIds.has(observation.supporting_observation_id) || !outcomeIds.has(observation.outcome_id)
      || observation.supporting_observation_id !== `OBS-${digest(observationIdentity(observation))}`) errors.push(problem('SUPPORTING_OBSERVATION_ID_MISMATCH'));
    observationIds.add(observation.supporting_observation_id);
  }
  return errors;
}
/** @param {any} compiled @param {any} context */
function exclusionErrors(compiled, context) {
  const errors = []; const ids = new Set();
  for (const record of context.not_applicable_records) {
    errors.push(...validateNotApplicable(record, context.not_applicable_context));
    if (ids.has(record.not_applicable_record_id)) errors.push(problem('NOT_APPLICABLE_RECORD_DUPLICATE'));
    ids.add(record.not_applicable_record_id);
    if (record.subject.kind !== 'formal_test_point') continue;
    const point = compiled.formal_test_points.find((/** @type {any} */ item) => item.formal_test_point_id === record.subject.formal_test_point_id);
    const outcome = compiled.outcomes.find((/** @type {any} */ item) => item.outcome_id === point?.outcome_id);
    if (!outcome) errors.push(problem('NOT_APPLICABLE_TEST_POINT_UNRESOLVED'));
    else if (outcome.acceptance_role !== record.acceptance_role) errors.push(problem('NOT_APPLICABLE_ROLE_MISMATCH'));
  }
  return errors;
}
const candidateSchema = closed({ case_id: text, primary_test_point_id: text, valid: { type: 'boolean' }, semantic_status: { enum: ['Grounded', 'Conditional', 'Blocked'] } });
const coverageContextSchema = { $defs: obligationSchema.$defs, ...closed({
  semantic_gaps: { type: 'array', items: closed({ semantic_gap_id: text, formal_test_point_ids: { ...refs, minItems: 1 } }) },
  not_applicable_records: { type: 'array', items: notApplicableRecordSchema }, not_applicable_context: notApplicableContextSchema
}) };

/** Already validated Case results are compiler-owned classifier output, not
 * Agent classification. A failed candidate never mutates another Case or point.
 * @param {any} compiled @param {unknown} inputCases @param {unknown} systemContext @returns {any}
 */
export function aggregateBusinessOutcomeCoverageV4(compiled, inputCases, systemContext) {
  const errors = compilationErrors(compiled);
  errors.push(...validateAgainstSchema(inputCases, { type: 'array', items: candidateSchema }), ...validateAgainstSchema(systemContext, coverageContextSchema));
  if (errors.length) return fatal(errors);
  const cases = /** @type {any[]} */ (inputCases); const context = /** @type {any} */ (systemContext);
  const points = new Map(compiled.formal_test_points.map((/** @type {any} */ point) => [point.formal_test_point_id, point]));
  const seenCases = new Set();
  for (const item of cases) {
    if (seenCases.has(item.case_id) || !points.has(item.primary_test_point_id)) errors.push(problem('CASE_TEST_POINT_UNRESOLVED'));
    seenCases.add(item.case_id);
  }
  const gapIds = new Set();
  for (const gap of context.semantic_gaps) {
    if (gapIds.has(gap.semantic_gap_id) || gap.formal_test_point_ids.some((/** @type {string} */ id) => !points.has(id))) errors.push(problem('SEMANTIC_GAP_TEST_POINT_UNRESOLVED'));
    gapIds.add(gap.semantic_gap_id);
  }
  errors.push(...exclusionErrors(compiled, context));
  if (errors.length) return fatal(errors);
  const outcomes = new Map(compiled.outcomes.map((/** @type {any} */ item) => [item.outcome_id, item]));
  const ledger = compiled.formal_test_points.map((/** @type {any} */ point) => {
    const outcome = /** @type {any} */ (outcomes.get(point.outcome_id));
    const candidates = cases.filter(item => item.primary_test_point_id === point.formal_test_point_id && item.valid);
    const gaps = context.semantic_gaps.filter((/** @type {any} */ gap) => gap.formal_test_point_ids.includes(point.formal_test_point_id));
    const exclusions = context.not_applicable_records.filter((/** @type {any} */ record) => record.subject.kind === 'formal_test_point' && record.subject.formal_test_point_id === point.formal_test_point_id);
    if (exclusions.some((/** @type {any} */ record) => record.acceptance_role !== outcome.acceptance_role)) errors.push(problem('NOT_APPLICABLE_ROLE_MISMATCH'));
    const classification = candidates.some(item => item.semantic_status === 'Grounded') ? 'Grounded'
      : candidates.some(item => item.semantic_status === 'Conditional') ? 'Conditional' : gaps.length ? 'Blocked' : exclusions.length ? 'NotApplicable' : null;
    if (classification === null) errors.push(problem('FORMAL_TEST_POINT_UNCOVERED', `/formal_test_points/${point.formal_test_point_id}`));
    return { formal_test_point_id: point.formal_test_point_id, outcome_id: point.outcome_id, acceptance_role: outcome.acceptance_role, classification,
      case_ids: canonicalIds(candidates.filter(item => item.semantic_status === classification).map(item => item.case_id)),
      semantic_gap_refs: canonicalIds(gaps.map((/** @type {any} */ gap) => gap.semantic_gap_id)),
      not_applicable_record_ids: canonicalIds(exclusions.map((/** @type {any} */ record) => record.not_applicable_record_id)) };
  });
  const primary = ledger.filter((/** @type {any} */ item) => item.acceptance_role === 'primary_acceptance');
  const counts = { reviewed_formal_count: primary.length, applicable_count: primary.filter((/** @type {any} */ item) => item.classification !== 'NotApplicable').length,
    covered_count: primary.filter((/** @type {any} */ item) => ['Grounded', 'Conditional'].includes(item.classification)).length };
  return errors.length ? { ...fatal(errors), ledger, ...counts } : { kind: 'assessed', ledger, ...counts, diagnostics: [] };
}

/** Assemble only after complete risk review. No benchmark, runner or writes.
 * @param {any} compiled @param {unknown} ledger @param {any} context @returns {any}
 */
export function assembleObligationsArtifactV4(compiled, ledger, context) {
  const errors = compilationErrors(compiled); if (errors.length) return fatal(errors);
  errors.push(...validateRiskReviewLedger(ledger, context)); if (errors.length) return fatal(errors);
  for (const outcome of compiled.outcomes.filter((/** @type {any} */ item) => item.acceptance_role === 'primary_acceptance')) {
    const owner = compiled.fact_modules.find((/** @type {any} */ fact) => fact.fact_id === outcome.fact_id);
    if (!context.primary_module_ids.includes(owner.module_id)) errors.push(problem('PRIMARY_RISK_MODULE_MISSING'));
  }
  const pointById = new Map(compiled.formal_test_points.map((/** @type {any} */ point) => [point.formal_test_point_id, point]));
  for (const target of context.formal_test_points) {
    const point = /** @type {any} */ (pointById.get(target.formal_test_point_id));
    const outcome = compiled.outcomes.find((/** @type {any} */ item) => item.outcome_id === point?.outcome_id);
    const owner = compiled.fact_modules.find((/** @type {any} */ item) => item.fact_id === outcome?.fact_id);
    if (!outcome || outcome.acceptance_role !== target.acceptance_role || owner?.module_id !== target.module_id
      || target.claim_ids.some((/** @type {string} */ id) => !outcome.claim_ids.includes(id))) errors.push(problem('RISK_FORMAL_OUTCOME_MISMATCH'));
  }
  errors.push(...exclusionErrors(compiled, context));
  if (errors.length) return fatal(errors);
  /** Only closed review records are canonicalized here; no business sequence is reordered.
   * @param {any} input @returns {any}
   */
  const canonicalReview = input => Object.fromEntries(Object.entries(normalize(input)).map(([key, value]) => [key,
    Array.isArray(value) && key.endsWith('_ids') ? canonicalIds(value) : value && typeof value === 'object' && !Array.isArray(value) ? canonicalReview(value) : value]));
  const artifact = { schema_version: '4.0.0', source_revision: compiled.source_revision, outcomes: structuredClone(compiled.outcomes),
    formal_test_points: structuredClone(compiled.formal_test_points), supporting_observations: structuredClone(compiled.supporting_observations),
    risk_review_ledger: /** @type {any[]} */ (ledger).map(canonicalReview).sort((a, b) => compareScalar(a.module_id, b.module_id) || compareScalar(a.risk_kind, b.risk_kind)),
    not_applicable_records: sorted(context.not_applicable_records.map(canonicalReview), 'not_applicable_record_id'),
    exploratory: sorted(context.exploratory.map(canonicalReview), 'exploratory_id') };
  errors.push(...validateAgainstSchema(artifact, obligationSchema));
  return errors.length ? fatal(errors) : { kind: 'assembled', artifact, diagnostics: [] };
}
