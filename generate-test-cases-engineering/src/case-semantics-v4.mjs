import { canonicalStringify, digest } from './canonical.mjs';
import { scopeContains } from './decision-record.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { LEGACY_V4_CONTRACT, requireV4Contract } from './v4-contract.mjs';

const text = { type: 'string', minLength: 1, pattern: '\\S' };
const refs = { type: 'array', items: text, uniqueItems: true };
const claimRefs = { ...refs, minItems: 1 };
const acceptanceRole = { enum: ['primary_acceptance', 'dependency_contract', 'context_only'] };
const surfaces = ['ui', 'request', 'response', 'persistence', 'event', 'callback', 'compensation', 'side_effect', 'external_observation'];
/** @param {Record<string, unknown>} properties @param {string[]} [required] */
const closed = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const ordering = closed({
  business_flow_ref: { oneOf: [text, { type: 'null' }] },
  page_action_ref: { oneOf: [text, { type: 'null' }] }
});
const effectSchema = closed({
  effect_id: text, kind: text, subject: text, before: text, after: text, claim_ids: claimRefs
}, ['effect_id', 'kind', 'subject', 'after', 'claim_ids']);
const comparisonContractSchema = { oneOf: [
  closed({ kind: { const: 'all_observable_behavior_except' }, exceptions: refs }),
  closed({ kind: { const: 'selected_dimensions' }, dimensions: claimRefs, allowed_differences: refs })
] };
/** @param {Record<string, unknown>} comparisonContract */
const baselineShape = comparisonContract => closed({
  baseline_id: text, kind: { const: 'declared_reference' }, acquisition: { const: 'capture_at_execution' },
  reference: text, comparison_contract: comparisonContract, claim_ids: claimRefs
});
const baselineSpecSchema = baselineShape(comparisonContractSchema);
const derivationSchema = closed({ method_id: text, method_version: text, inputs_digest: { type: 'string', pattern: '^sha256:[0-9a-f]{64}$' } });
const testValueOriginSchema = { oneOf: [
  closed({ kind: { const: 'requirement' }, claim_ids: claimRefs }),
  closed({ kind: { const: 'example' }, claim_ids: claimRefs, replaceable: { const: true } }),
  closed({ kind: { const: 'derived' }, input_claim_ids: claimRefs, derivation: derivationSchema, evidence_level: { const: 'derived' } }),
  closed({ kind: { const: 'temporary_assumption' }, assumption_id: text, semantic_gap_ids: claimRefs,
    reason: text, requires_case_status: { const: 'Conditional' } })
] };
const valueSubject = { subject_ref: text, field_path: { type: 'string', pattern: '^(?:/(?:[^~/]|~[01])*)+$' }, value: {} };
const testValueSchema = closed({ value_id: text, ...valueSubject, used_by_refs: claimRefs, value_origin: testValueOriginSchema });
const caseSpecSchema = closed({
  case_id: text, title: text, module_id: text, priority: { enum: ['P0', 'P1', 'P2', 'P3'] },
  ordering, acceptance_role: acceptanceRole, fact_ids: claimRefs, primary_test_point_id: text,
  supporting_observation_ids: refs,
  business_preconditions: { type: 'array', items: closed({ precondition_id: text, description: text }) },
  data_conditions: { type: 'array', items: closed({ condition_id: text, description: text }) },
  steps: { type: 'array', minItems: 1, items: closed({ step_id: text, action: text }) },
  oracles: { type: 'array', minItems: 1, items: closed({
    oracle_id: text, observe_after_step_id: text, surface: { enum: surfaces }, expected: text, claim_ids: claimRefs
  }) },
  semantic_effects: { type: 'array', minItems: 1, items: effectSchema },
  baseline_spec: baselineSpecSchema,
  test_values: { type: 'array', minItems: 1, items: testValueSchema }
}, ['case_id', 'title', 'module_id', 'priority', 'ordering', 'acceptance_role', 'fact_ids',
  'primary_test_point_id', 'supporting_observation_ids', 'business_preconditions', 'data_conditions', 'steps', 'oracles']);

/** @param {unknown} draft @param {Record<string, any>} item @returns {{category:string,code:string,path:string,message:string,affected_fact_ids:string[],affected_test_point_ids:string[]}} */
function closeCaseDiagnostic(draft, item) {
  const candidate = isRecord(draft) ? draft : {};
  const affected_fact_ids = Array.isArray(candidate.fact_ids)
    ? candidate.fact_ids.filter((value) => typeof value === 'string').sort(compare) : [];
  const affected_test_point_ids = typeof candidate.primary_test_point_id === 'string'
    ? [candidate.primary_test_point_id] : [];
  return {
    category: String(item.category), code: String(item.code), path: String(item.path ?? '/'),
    message: String(item.message), affected_fact_ids, affected_test_point_ids
  };
}

/**
 * Validate the logical CaseSpec slice on an already snapshotted v4 draft.
 * Claim existence/entailment and semantic classification remain owned by the
 * evidence pipeline; a non-empty claim reference is not proof of Grounded status.
 * No execution binding, capability availability, or setup/cleanup is consulted.
 * @param {unknown} draft
 */
export function validateCaseSemanticsV4(draft) {
  /** @type {Array<{category:string,code:string,path:string,message:string,affected_fact_ids?:string[],affected_test_point_ids?:string[]}>} */
  const diagnostics = validateAgainstSchema(draft, caseSpecSchema)
    .map(item => closeCaseDiagnostic(draft, { ...item, category: 'adapter_revision' }));
  if (diagnostics.length) return diagnostics;
  const candidate = /** @type {Record<string, any>} */ (draft);
  const localIds = new Set();
  const collections = [
    ['business_preconditions', 'precondition_id'], ['data_conditions', 'condition_id'],
    ['steps', 'step_id'], ['oracles', 'oracle_id'], ['semantic_effects', 'effect_id']
  ];
  for (const [collection, idField] of collections) {
    for (const [index, item] of (candidate[collection] ?? []).entries()) {
      if (localIds.has(item[idField])) diagnostics.push({
        category: 'adapter_revision', code: 'CASE_LOCAL_ID_DUPLICATE',
        path: `/${collection}/${index}/${idField}`, message: 'Case-local references must identify exactly one logical element.'
      });
      localIds.add(item[idField]);
    }
  }
  const stepIds = new Set(candidate.steps.map((/** @type {{step_id: string}} */ step) => step.step_id));
  for (const [index, oracle] of candidate.oracles.entries()) {
    if (!stepIds.has(oracle.observe_after_step_id)) diagnostics.push({
      category: 'adapter_revision', code: 'ORACLE_STEP_UNRESOLVED',
      path: `/oracles/${index}/observe_after_step_id`, message: 'Every logical Oracle must observe one existing Case step.'
    });
  }
  const valueIds = new Set();
  for (const [index, value] of (candidate.test_values ?? []).entries()) {
    if (valueIds.has(value.value_id) || localIds.has(value.value_id)) diagnostics.push({ category: 'adapter_revision',
      code: 'CASE_LOCAL_ID_DUPLICATE', path: `/test_values/${index}/value_id`, message: 'Test values must have unambiguous Case-local IDs.' });
    valueIds.add(value.value_id);
    if (value.subject_ref === candidate.case_id || localIds.has(value.subject_ref)) {
      diagnostics.push({ category: 'adapter_revision', code: 'VALUE_SUBJECT_POINTER_INVALID', path: `/test_values/${index}/field_path`,
        message: 'A test value identifies a business subject field, not Case prose.' });
    }
    for (const ref of value.used_by_refs) if (!localIds.has(ref)) diagnostics.push({ category: 'adapter_revision',
      code: 'VALUE_USAGE_UNRESOLVED', path: `/test_values/${index}/used_by_refs`, message: 'Every test value usage must identify an existing element of this Case.' });
  }
  return diagnostics.map(item => closeCaseDiagnostic(draft, item));
}

const valueContextSchema = closed({
  semantic_status: { enum: ['Grounded', 'Conditional', 'Blocked'] },
  claims: { type: 'array', items: closed({
    claim_id: text, origin_kind: { enum: ['requirement', 'example'] },
    ...valueSubject, supported: { type: 'boolean' }
  }) },
  derivations: { type: 'array', items: closed({ ...derivationSchema.properties, input_claim_ids: claimRefs, ...valueSubject }) },
  supported_claim_ids: refs,
  semantic_gap_ids: refs
});
/**
 * Check value provenance against compiler-owned, verified Evidence results.
 * The Evidence engine, not the Adapter, supplies claims and completed derivation
 * assessments. This function never executes Agent-named formulas or trusts prose
 * as a derivation chain. It also cannot detect values omitted from extraction.
 * @param {unknown} draft @param {unknown} systemContext
 */
export function validateTestValueOriginsV4(draft, systemContext) {
  /** @type {Array<{category:string,code:string,path:string,message:string,affected_fact_ids?:string[],affected_test_point_ids?:string[]}>} */
  const diagnostics = validateCaseSemanticsV4(draft);
  if (diagnostics.length) return diagnostics;
  if (validateAgainstSchema(systemContext, valueContextSchema).length) return [closeCaseDiagnostic(draft, { category: 'quality_failure',
    code: 'VALUE_CONTEXT_INVALID', path: '/', message: 'Value validation requires verified compiler Evidence context.' })];
  const context = /** @type {any} */ (systemContext);
  const candidate = /** @type {any} */ (draft);
  const claimById = new Map();
  for (const claim of context.claims) {
    const current = claimById.get(claim.claim_id) ?? [];
    if (!current.some((/** @type {any} */ item) => canonicalStringify(item) === canonicalStringify(claim))) current.push(claim);
    claimById.set(claim.claim_id, current);
  }
  const fixedRefs = new Set([...candidate.oracles.map((/** @type {any} */ item) => item.oracle_id),
    ...(candidate.semantic_effects ?? []).map((/** @type {any} */ item) => item.effect_id)]);
  /** @param {string} code @param {number} index @param {string} message */
  const add = (code, index, message) => diagnostics.push(closeCaseDiagnostic(draft, {
    category: 'adapter_revision', code, path: `/test_values/${index}/value_origin`, message
  }));
  /** @param {any} left @param {any} right */
  const sameValue = (left, right) => left.subject_ref === right.subject_ref && left.field_path === right.field_path
    && canonicalStringify(left.value) === canonicalStringify(right.value);
  for (const [index, value] of (candidate.test_values ?? []).entries()) {
    const origin = value.value_origin;
    if (origin.kind === 'temporary_assumption') {
      if (context.semantic_status !== 'Conditional') add('ASSUMPTION_REQUIRES_CONDITIONAL', index, 'Temporary assumptions cannot become Grounded Cases.');
      if (origin.semantic_gap_ids.some((/** @type {string} */ id) => !context.semantic_gap_ids.includes(id))) add('ASSUMPTION_GAP_UNRESOLVED', index, 'Temporary assumptions require existing semantic gaps.');
      continue;
    }
    const claimIds = origin.kind === 'derived' ? origin.input_claim_ids : origin.claim_ids;
    if (claimIds.some((/** @type {string} */ id) => {
      const claims = claimById.get(id) ?? [];
      return origin.kind === 'derived'
        ? !context.supported_claim_ids.includes(id)
        : !claims.some((/** @type {any} */ claim) => claim.supported
          && claim.origin_kind === origin.kind && sameValue(claim, value));
    })) add('VALUE_EVIDENCE_UNRESOLVED', index, 'Test values require supported Claims for their exact subject and provenance.');
    if (origin.kind === 'example' && value.used_by_refs.some((/** @type {string} */ ref) => fixedRefs.has(ref))) {
      add('EXAMPLE_FIXED_EXPECTATION', index, 'Replaceable examples cannot supply fixed Oracle or effect expectations.');
    }
    if (origin.kind === 'derived') {
      const matches = context.derivations.filter((/** @type {any} */ result) =>
        result.method_id === origin.derivation.method_id && result.method_version === origin.derivation.method_version
        && result.inputs_digest === origin.derivation.inputs_digest && sameValue(result, value)
        && canonicalStringify([...result.input_claim_ids].sort()) === canonicalStringify([...claimIds].sort()));
      if (matches.length !== 1) add('VALUE_DERIVATION_UNRESOLVED', index, 'Derived values require one verified, versioned derivation with exact inputs and result.');
    }
  }
  return diagnostics;
}

/** Validate a persisted relative-baseline declaration against reviewed Claim
 * semantics. The draft may choose wording and Case-local IDs, but it cannot
 * change the reference or comparison contract and cite an unrelated Claim as
 * proof. @param {unknown} draft @param {unknown} systemContext */
export function validateRelativeBaselineEvidenceV4(draft, systemContext) {
  if (!isRecord(draft) || !draft.baseline_spec) return [];
  const candidate = /** @type {any} */ (draft);
  const context = isRecord(systemContext) && Array.isArray(systemContext.baseline_assertions)
    ? systemContext.baseline_assertions : [];
  const contract = structuredClone(candidate.baseline_spec.comparison_contract);
  if (contract?.kind === 'all_observable_behavior_except') contract.exceptions = sortedRefs(contract.exceptions ?? []);
  if (contract?.kind === 'selected_dimensions') {
    contract.dimensions = sortedRefs(contract.dimensions ?? []);
    contract.allowed_differences = sortedRefs(contract.allowed_differences ?? []);
  }
  const expected = {
    module_id: candidate.module_id, reference: candidate.baseline_spec.reference,
    comparison_contract: contract
  };
  for (const claimId of candidate.baseline_spec.claim_ids ?? []) {
    const matches = context.filter((/** @type {any} */ assertion) => assertion.claim_id === claimId
      && canonicalStringify({
        module_id: assertion.module_id, reference: assertion.reference,
        comparison_contract: assertion.comparison_contract
      }) === canonicalStringify(expected));
    if (matches.length !== 1) return [closeCaseDiagnostic(draft, {
      category: 'adapter_revision', code: 'BASELINE_EVIDENCE_UNRESOLVED', path: '/baseline_spec',
      message: 'The relative baseline reference and comparison contract must exactly match a verified Claim.'
    })];
  }
  return [];
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {string} left @param {string} right */
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

/** @param {string[]} values */
function sortedRefs(values) { return [...values].sort(compare); }

/** Canonicalize only fields whose contract is set-valued; ordered business steps remain ordered. @param {Record<string, any>} value */
function canonicalCaseProjection(value) {
  const candidate = structuredClone(value);
  candidate.fact_ids = sortedRefs(candidate.fact_ids);
  candidate.supporting_observation_ids = sortedRefs(candidate.supporting_observation_ids);
  for (const oracle of candidate.oracles) oracle.claim_ids = sortedRefs(oracle.claim_ids);
  for (const effect of candidate.semantic_effects ?? []) effect.claim_ids = sortedRefs(effect.claim_ids);
  if (candidate.baseline_spec) {
    candidate.baseline_spec.claim_ids = sortedRefs(candidate.baseline_spec.claim_ids);
    const contract = candidate.baseline_spec.comparison_contract;
    if (contract.kind === 'all_observable_behavior_except') contract.exceptions = sortedRefs(contract.exceptions);
    else {
      contract.dimensions = sortedRefs(contract.dimensions);
      contract.allowed_differences = sortedRefs(contract.allowed_differences);
    }
  }
  for (const testValue of candidate.test_values ?? []) {
    testValue.used_by_refs = sortedRefs(testValue.used_by_refs);
    const origin = testValue.value_origin;
    if (Array.isArray(origin.claim_ids)) origin.claim_ids = sortedRefs(origin.claim_ids);
    if (Array.isArray(origin.input_claim_ids)) origin.input_claim_ids = sortedRefs(origin.input_claim_ids);
    if (Array.isArray(origin.semantic_gap_ids)) origin.semantic_gap_ids = sortedRefs(origin.semantic_gap_ids);
  }
  return candidate;
}

const semanticCompilationInputSchema = closed({
  source_revision: { type: 'integer', minimum: 0 },
  case_drafts: { type: 'array', items: caseSpecSchema },
  formal_test_points: { type: 'array', items: closed({
    formal_test_point_id: text, outcome_id: text, acceptance_role: acceptanceRole
  }) },
  claim_assessments: { type: 'array', items: closed({
    claim_id: text, domain: { const: 'business_semantics' }, level: { enum: ['E3', 'E2', 'E1'] },
    support_review: { enum: ['supported', 'uncertain', 'unsupported'] }
  }) }
});

/** @param {Record<string, any>} candidate */
function requiredSemanticClaimIds(candidate) {
  const ids = [];
  for (const oracle of candidate.oracles) ids.push(...oracle.claim_ids);
  for (const effect of candidate.semantic_effects ?? []) ids.push(...effect.claim_ids);
  if (candidate.baseline_spec) ids.push(...candidate.baseline_spec.claim_ids);
  for (const testValue of candidate.test_values ?? []) {
    if (Array.isArray(testValue.value_origin.claim_ids)) ids.push(...testValue.value_origin.claim_ids);
    if (Array.isArray(testValue.value_origin.input_claim_ids)) ids.push(...testValue.value_origin.input_claim_ids);
  }
  return sortedRefs([...new Set(ids)]);
}

/**
 * Production v4 semantic compiler. IDs and classification are derived from a
 * closed logical draft plus compiler-verified business Evidence; execution
 * resources are absent from both the input contract and identity projection.
 * @param {unknown} input
 */
export function compileSemanticCaseDocumentV4(
  input,
  /** @type {unknown} */ submittedContract = LEGACY_V4_CONTRACT
) {
  const contract = requireV4Contract(submittedContract);
  if (validateAgainstSchema(input, semanticCompilationInputSchema).length) {
    throw new TypeError('SEMANTIC_CASE_COMPILATION_INPUT_INVALID');
  }
  const source = /** @type {any} */ (structuredClone(input));
  const assessments = new Map();
  for (const assessment of source.claim_assessments) {
    if (assessments.has(assessment.claim_id)) throw new TypeError('SEMANTIC_CLAIM_ASSESSMENT_AMBIGUOUS');
    assessments.set(assessment.claim_id, assessment);
  }
  const points = new Map();
  for (const point of source.formal_test_points) {
    if (points.has(point.formal_test_point_id)) throw new TypeError('FORMAL_TEST_POINT_AMBIGUOUS');
    points.set(point.formal_test_point_id, point);
  }
  const caseIds = new Set();
  const cases = source.case_drafts.map((/** @type {any} */ candidate) => {
    const point = points.get(candidate.primary_test_point_id);
    if (!point || point.acceptance_role !== candidate.acceptance_role) throw new TypeError('PRIMARY_TEST_POINT_UNRESOLVED');
    let semantic_status = (candidate.test_values ?? []).some(
      (/** @type {any} */ value) => value.value_origin.kind === 'temporary_assumption'
    ) ? 'Conditional' : 'Grounded';
    for (const claimId of requiredSemanticClaimIds(candidate)) {
      const assessment = assessments.get(claimId);
      if (!assessment || assessment.support_review !== 'supported') throw new TypeError('SEMANTIC_CLAIM_UNSUPPORTED');
      if (assessment.level === 'E1') semantic_status = 'Conditional';
    }
    const normalized = canonicalCaseProjection(candidate);
    delete normalized.case_id;
    const case_id = `CASE-${digest({
      module_id: normalized.module_id, primary_test_point_id: normalized.primary_test_point_id,
      acceptance_role: normalized.acceptance_role, fact_ids: normalized.fact_ids,
      business_preconditions: normalized.business_preconditions, data_conditions: normalized.data_conditions,
      steps: normalized.steps, oracles: normalized.oracles, semantic_effects: normalized.semantic_effects ?? null,
      baseline_spec: normalized.baseline_spec ?? null, test_values: normalized.test_values ?? null
    })}`;
    if (caseIds.has(case_id)) throw new TypeError('DUPLICATE_DERIVED_CASE_ID');
    caseIds.add(case_id);
    return {
      ...normalized, case_id,
      ordering: { ...normalized.ordering, depends_on_case_ids: [] }, semantic_status
    };
  });
  return {
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    delivery_intent: 'case_document',
    source_revision: source.source_revision, cases
  };
}

/**
 * Audit five generation invariants from compiler-classified logical Cases.
 * This is not a classifier or a final-delivery gate. Execution metadata is a
 * separate input field and is never included in the semantic projection.
 * @param {unknown} input
 */
export function generationFingerprintV4(input) {
  if (!isRecord(input) || !Array.isArray(input.cases) || !Array.isArray(input.formal_test_points)
    || Object.keys(input).some(key => !['cases', 'formal_test_points', 'execution_resources'].includes(key))) {
    throw new Error('GENERATION_FINGERPRINT_INPUT_INVALID');
  }
  const pointSchema = closed({ formal_test_point_id: text, outcome_id: text, acceptance_role: acceptanceRole });
  const pointIds = new Set();
  const points = input.formal_test_points.map(point => {
    if (validateAgainstSchema(point, pointSchema).length) throw new Error('FORMAL_TEST_POINT_INVALID');
    if (pointIds.has(point.formal_test_point_id)) throw new Error('DUPLICATE_FORMAL_TEST_POINT_ID');
    pointIds.add(point.formal_test_point_id);
    return { ...point };
  }).sort((left, right) => compare(left.formal_test_point_id, right.formal_test_point_id));
  const pointById = new Map(points.map(point => [point.formal_test_point_id, point]));
  const caseIds = new Set();
  const cases = input.cases.map(item => {
    if (!isRecord(item)) throw new Error('LOGICAL_CASE_INVALID');
    const { semantic_status, ...candidate } = item;
    if (caseIds.has(candidate.case_id)) throw new Error('DUPLICATE_CASE_ID');
    if (validateCaseSemanticsV4(candidate).length) throw new Error('LOGICAL_CASE_INVALID');
    if (typeof semantic_status !== 'string' || !['Grounded', 'Conditional', 'Blocked'].includes(semantic_status)) throw new Error('SEMANTIC_CLASSIFICATION_INVALID');
    const point = pointById.get(candidate.primary_test_point_id);
    if (!point || point.acceptance_role !== candidate.acceptance_role) throw new Error('PRIMARY_TEST_POINT_UNRESOLVED');
    caseIds.add(candidate.case_id);
    return { ...canonicalCaseProjection(candidate), case_id: String(candidate.case_id), semantic_status };
  }).sort((left, right) => compare(String(left.case_id), String(right.case_id)));
  return {
    semantic_bundle_digest_without_runtime_metadata: `sha256:${digest({ cases, formal_test_points: points })}`,
    case_id_set: cases.map(item => String(item.case_id)),
    formal_test_point_id_set: points.map(point => String(point.formal_test_point_id)),
    semantic_classification_by_case: Object.fromEntries(cases.map(item => [String(item.case_id), item.semantic_status])),
    formal_coverage_denominator: points.filter(point => point.acceptance_role === 'primary_acceptance').length
  };
}

const unknownOrRefs = { oneOf: [refs, { type: 'null' }] };
// Only an explicit null/empty source finding represents unknown business
// semantics. An omitted required field remains an Adapter repair, not a question.
const baselineDeclarationSchema = baselineShape({ oneOf: [
  closed({ kind: { type: 'null' } }),
  closed({ kind: { const: 'all_observable_behavior_except' }, exceptions: unknownOrRefs }),
  closed({ kind: { const: 'selected_dimensions' }, dimensions: unknownOrRefs, allowed_differences: unknownOrRefs })
] });
const relativeBaselineRequestSchema = closed({
  case_context: closed({
    module_id: text, scope_ref: text, business_scope: { oneOf: [text, { type: 'null' }] }, operation: text,
    priority: { enum: ['P0', 'P1', 'P2', 'P3'] }, ordering, acceptance_role: acceptanceRole,
    fact_ids: claimRefs, primary_test_point_id: text,
    business_preconditions: caseSpecSchema.properties.business_preconditions,
    data_conditions: caseSpecSchema.properties.data_conditions
  }),
  baseline_spec: baselineDeclarationSchema
});
const claimAssessmentsSchema = { type: 'array', items: closed({
  claim_id: text, level: { enum: ['E3', 'E2', 'E1'] }, scope: text,
  support_review: { enum: ['supported', 'uncertain', 'unsupported'] }
}) };

/**
 * Compile one source-declared compatibility outcome from trusted semantic
 * findings and already verified Evidence assessments. This is not a prose
 * extractor: it never infers selected dimensions from an all-behavior contract.
 * E2 assessments must already include validated ancestry/target checks in the
 * Evidence stage. Execution resources are deliberately outside this decision.
 * @param {unknown} input
 * @param {unknown} systemContext
 * @returns {{cases: Array<Record<string, any>>, semantic_gaps: Array<Record<string, any>>, diagnostics: Array<{category:string,code:string,path:string,message:string}>}}
 */
export function compileRelativeBaselineCaseV4(input, systemContext) {
  const diagnostics = validateAgainstSchema(input, relativeBaselineRequestSchema)
    .map(item => ({ ...item, category: 'adapter_revision' }));
  if (diagnostics.length) return { cases: [], semantic_gaps: [], diagnostics };
  const request = /** @type {{case_context:Record<string,any>,baseline_spec:Record<string,any>}} */ (input);
  const context = request.case_context;
  const declaration = request.baseline_spec;
  if (!isRecord(systemContext) || Object.keys(systemContext).some(key => !['claim_assessments', 'execution_resources'].includes(key))
    || validateAgainstSchema(systemContext.claim_assessments, claimAssessmentsSchema).length) {
    return { cases: [], semantic_gaps: [], diagnostics: [{
      category: 'quality_failure', code: 'BASELINE_EVIDENCE_CONTEXT_INVALID', path: '/claim_assessments',
      message: 'Relative baseline compilation requires verified semantic Evidence assessments.'
    }] };
  }
  const assessments = /** @type {Array<{claim_id:string,level:string,scope:string,support_review:string}>} */ (systemContext.claim_assessments);
  const byId = new Map();
  for (const assessment of assessments) {
    if (byId.has(assessment.claim_id)) diagnostics.push({
      category: 'quality_failure', code: 'BASELINE_EVIDENCE_AMBIGUOUS', path: '/claim_assessments',
      message: 'Every source Claim must resolve to exactly one verified Evidence assessment.'
    });
    byId.set(assessment.claim_id, assessment);
  }
  let semanticStatus = 'Grounded';
  for (const claimId of declaration.claim_ids) {
    const assessment = byId.get(claimId);
    if (!assessment || assessment.support_review !== 'supported' || !scopeContains(assessment.scope, context.scope_ref)) {
      diagnostics.push({ category: 'quality_failure', code: 'BASELINE_EVIDENCE_UNSUPPORTED', path: '/baseline_spec/claim_ids',
        message: 'Every baseline Claim must be supported and cover the declared business scope.' });
    } else if (assessment.level === 'E1') semanticStatus = 'Conditional';
  }
  if (diagnostics.length) return { cases: [], semantic_gaps: [], diagnostics };

  /** @type {Array<Record<string, any>>} */
  const semanticGaps = [];
  /** @param {string} code @param {string} path @param {string} message */
  const gap = (code, path, message) => semanticGaps.push({
    category: 'semantic_gap', code, path, message,
    affected_fact_ids: [...context.fact_ids], affected_test_point_ids: [context.primary_test_point_id]
  });
  const contract = declaration.comparison_contract;
  if (context.business_scope === null) gap('BASELINE_SCOPE_UNRESOLVED', '/case_context/business_scope', '哪些业务范围必须与当前线上保持一致？');
  if (contract.kind === null) gap('BASELINE_CONTRACT_UNRESOLVED', '/baseline_spec/comparison_contract/kind', '一致性要求覆盖全部可观察行为，还是来源明确列出的比较维度？');
  else if (contract.kind === 'all_observable_behavior_except' && contract.exceptions === null) {
    gap('BASELINE_EXCEPTIONS_UNRESOLVED', '/baseline_spec/comparison_contract/exceptions', '除哪些明确允许的差异外，其余业务行为应保持一致？');
  } else if (contract.kind === 'selected_dimensions') {
    if (contract.dimensions === null || contract.dimensions.length === 0) gap('BASELINE_DIMENSIONS_UNRESOLVED', '/baseline_spec/comparison_contract/dimensions', '来源要求逐项比较哪些业务维度？');
    if (contract.allowed_differences === null) gap('BASELINE_ALLOWED_DIFFERENCES_UNRESOLVED', '/baseline_spec/comparison_contract/allowed_differences', '所列业务维度允许哪些差异，或是否明确不允许差异？');
  }
  if (semanticGaps.length) return { cases: [], semantic_gaps: semanticGaps, diagnostics: [] };

  const comparison = contract.kind === 'all_observable_behavior_except'
    ? '全部可观察行为' : `来源明确列出的维度：${contract.dimensions.join('、')}`;
  const differences = contract.kind === 'all_observable_behavior_except' ? contract.exceptions : contract.allowed_differences;
  const differenceRule = differences.length ? `只允许以下已声明差异：${differences.join('；')}` : '不允许任何未声明差异';
  const caseDigest = digest({
    module_id: context.module_id, primary_test_point_id: context.primary_test_point_id,
    scope_ref: context.scope_ref, reference: declaration.reference, comparison_contract: contract
  });
  const caseId = `CASE-${caseDigest}`;
  const stepIds = ['capture', 'candidate', 'compare', 'differences'].map(action => `STEP-${action}-${caseDigest}`);
  const candidate = {
    case_id: caseId, title: `${context.business_scope}与${declaration.reference}保持声明的一致性`,
    module_id: context.module_id, priority: context.priority, ordering: { ...context.ordering },
    acceptance_role: context.acceptance_role, fact_ids: [...context.fact_ids],
    primary_test_point_id: context.primary_test_point_id, supporting_observation_ids: [],
    business_preconditions: context.business_preconditions.map((/** @type {Record<string,unknown>} */ item) => ({ ...item })),
    data_conditions: context.data_conditions.map((/** @type {Record<string,unknown>} */ item) => ({ ...item })),
    steps: [
      { step_id: stepIds[0], action: `执行时，在相同业务条件下记录${declaration.reference}中${context.business_scope}的表现。` },
      { step_id: stepIds[1], action: `在待测版本执行相同操作：${context.operation}。` },
      { step_id: stepIds[2], action: `比较${context.business_scope}的${comparison}。` },
      { step_id: stepIds[3], action: `核对差异：${differenceRule}。` }
    ],
    oracles: [{ oracle_id: `ORACLE-${caseDigest}`, observe_after_step_id: stepIds[3], surface: 'external_observation',
      expected: `${context.business_scope}的${comparison}与执行时采集的${declaration.reference}一致；${differenceRule}。`,
      claim_ids: [...declaration.claim_ids] }],
    baseline_spec: {
      ...declaration, claim_ids: [...declaration.claim_ids],
      comparison_contract: contract.kind === 'all_observable_behavior_except'
        ? { kind: contract.kind, exceptions: [...contract.exceptions] }
        : { kind: contract.kind, dimensions: [...contract.dimensions], allowed_differences: [...contract.allowed_differences] }
    }
  };
  const finalDiagnostics = validateCaseSemanticsV4(candidate);
  if (finalDiagnostics.length) return { cases: [], semantic_gaps: [], diagnostics: finalDiagnostics };
  return { cases: [{ ...candidate, semantic_status: semanticStatus }], semantic_gaps: [], diagnostics: [] };
}
