import { canonicalStringify } from './canonical.mjs';
import {
  canonicalStringSetV4,
  canonicalTextV4,
  compareUnicodeScalar,
  sha256CanonicalV4
} from './semantic-gaps-v4.mjs';

const TARGET_KINDS = new Set(['business_result', 'condition_distinction', 'required_relation']);
const ACCEPTANCE_ROLES = new Set(['primary_acceptance', 'dependency_contract', 'context_only']);
const REVIEWER_CLASSES = new Set([
  'independent_context', 'independent_agent', 'qualified_external_reviewer'
]);
const ITEM_KEYS = Object.freeze({
  fact: 'fact_id', view: 'view_id', formal_test_point: 'formal_test_point_id',
  candidate_responsibility: 'candidate_id', case: 'case_id', precondition: 'precondition_id',
  data_condition: 'condition_id', step: 'step_id', oracle: 'oracle_id'
});

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Record<string,any>} value @param {string[]} keys @param {string} code */
function closed(value, keys, code) {
  if (Object.keys(value).some(key => !keys.includes(key))) throw new TypeError(code);
}

/** @param {any[]} values @param {string} key */
function sorted(values, key) {
  return values.map(value => structuredClone(value)).sort((left, right) =>
    compareUnicodeScalar(String(left[key] ?? ''), String(right[key] ?? '')));
}

/** @param {any} raw @param {boolean} allowIssuedId */
function sourceFirstTarget(raw, allowIssuedId) {
  if (!record(raw)) throw new TypeError('INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID');
  closed(raw, [
    ...(allowIssuedId ? ['target_id'] : []),
    'target_kind', 'acceptance_role', 'objective', 'source_claim_ids', 'decision_ids'
  ], 'INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID');
  const target = {
    target_kind: canonicalTextV4(raw.target_kind, 'INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID'),
    acceptance_role: canonicalTextV4(raw.acceptance_role, 'INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID'),
    objective: canonicalTextV4(raw.objective, 'INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID'),
    source_claim_ids: canonicalStringSetV4(raw.source_claim_ids, 'INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID', false),
    decision_ids: canonicalStringSetV4(raw.decision_ids, 'INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID', false)
  };
  if (!TARGET_KINDS.has(target.target_kind) || !ACCEPTANCE_ROLES.has(target.acceptance_role)
    || target.source_claim_ids.length + target.decision_ids.length === 0) {
    throw new TypeError('INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_INVALID');
  }
  const targetId = `IRT-${sha256CanonicalV4(target).slice('sha256:'.length)}`;
  if (allowIssuedId && raw.target_id !== targetId) {
    throw new TypeError('INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_ID_INVALID');
  }
  return { target_id: targetId, ...target };
}

/** @param {any} rawCase */
function projectedCase(rawCase) {
  if (!record(rawCase)) throw new TypeError('INDEPENDENT_REVIEW_TARGET_INPUT_INVALID');
  /** @type {Record<string, any>} */
  const content = {};
  for (const key of [
    'title', 'primary_test_point_id', 'business_preconditions',
    'data_conditions', 'steps', 'oracles'
  ]) {
    if (!Object.hasOwn(rawCase, key)) throw new TypeError('INDEPENDENT_REVIEW_TARGET_INPUT_INVALID');
    content[key] = structuredClone(rawCase[key]);
  }
  return {
    case_id: `RCASE-${sha256CanonicalV4(content).slice('sha256:'.length)}`,
    ...content
  };
}

/**
 * Compile the exact self-excluding content an independent source-first review
 * must inspect. IDs and the digest are compiler-owned.
 * @param {unknown} submitted
 */
export function compileIndependentReviewTargetV4(submitted) {
  if (!record(submitted) || !Number.isSafeInteger(submitted.source_revision)
    || submitted.source_revision < 0 || !Array.isArray(submitted.source_first_targets)
    || submitted.source_first_targets.length === 0) {
    throw new TypeError('INDEPENDENT_REVIEW_SOURCE_FIRST_TARGETS_REQUIRED');
  }
  for (const key of ['facts', 'views', 'formal_test_points', 'candidate_responsibilities', 'cases']) {
    if (!Array.isArray(submitted[key])) throw new TypeError('INDEPENDENT_REVIEW_TARGET_INPUT_INVALID');
  }
  const issuedTargets = submitted.source_first_targets.map((target) =>
    sourceFirstTarget(target, Object.hasOwn(target, 'target_id')));
  if (new Set(issuedTargets.map(target => target.target_id)).size !== issuedTargets.length) {
    throw new TypeError('INDEPENDENT_REVIEW_SOURCE_FIRST_TARGET_DUPLICATE');
  }
  const projectedCases = /** @type {any[]} */ (submitted.cases.map(projectedCase));
  const projection = {
    projection_version: '1.0.0',
    source_revision: submitted.source_revision,
    source_first_targets: issuedTargets.sort((left, right) => compareUnicodeScalar(left.target_id, right.target_id)),
    facts: sorted(submitted.facts, 'fact_id'),
    views: sorted(submitted.views, 'view_id'),
    formal_test_points: sorted(submitted.formal_test_points, 'formal_test_point_id'),
    candidate_responsibilities: sorted(submitted.candidate_responsibilities, 'candidate_id'),
    cases: projectedCases.sort((left, right) =>
      compareUnicodeScalar(String(left.case_id), String(right.case_id)))
  };
  return { projection, digest: sha256CanonicalV4(projection) };
}

/** @param {any} target */
function itemRefs(target) {
  /** @type {Set<string>} */
  const refs = new Set();
  /** @param {keyof typeof ITEM_KEYS} kind @param {any} value */
  const add = (kind, value) => {
    const key = ITEM_KEYS[kind];
    if (record(value) && typeof value[key] === 'string') refs.add(`${kind}\0${value[key]}`);
  };
  for (const fact of target.projection.facts) add('fact', fact);
  for (const view of target.projection.views) add('view', view);
  for (const point of target.projection.formal_test_points) add('formal_test_point', point);
  for (const responsibility of target.projection.candidate_responsibilities) add('candidate_responsibility', responsibility);
  for (const candidate of target.projection.cases) {
    add('case', candidate);
    for (const item of candidate.business_preconditions) add('precondition', item);
    for (const item of candidate.data_conditions) add('data_condition', item);
    for (const item of candidate.steps) add('step', item);
    for (const item of candidate.oracles) add('oracle', item);
  }
  return refs;
}

/** @param {any[]} diagnostics @param {string} code @param {string} path @param {string} message */
function diagnostic(diagnostics, code, path, message) {
  diagnostics.push({ category: 'quality', code, path, message });
}

/** @param {any} refs @param {Set<string>} knownItems @param {any[]} diagnostics @param {string} path */
function validateItems(refs, knownItems, diagnostics, path) {
  if (!Array.isArray(refs) || refs.length === 0) {
    diagnostic(diagnostics, 'INDEPENDENT_REVIEW_ITEM_REQUIRED', path, 'At least one reviewed item is required.');
    return;
  }
  for (let index = 0; index < refs.length; index += 1) {
    const ref = refs[index];
    if (!record(ref) || !Object.hasOwn(ITEM_KEYS, ref.item_kind)
      || typeof ref.item_id !== 'string' || !knownItems.has(`${ref.item_kind}\0${ref.item_id}`)) {
      diagnostic(diagnostics, 'INDEPENDENT_REVIEW_ITEM_UNKNOWN', `${path}/${index}`, 'Review item must bind the issued target projection.');
    }
  }
}

/** @param {any} value @param {Set<string>} claims @param {Set<string>} decisions @param {any[]} diagnostics @param {string} path */
function validateEvidenceRefs(value, claims, decisions, diagnostics, path) {
  const claimIds = Array.isArray(value?.source_claim_ids) ? value.source_claim_ids : [];
  const decisionIds = Array.isArray(value?.decision_ids) ? value.decision_ids : [];
  if (claimIds.some((/** @type {any} */ id) => !claims.has(id))
    || decisionIds.some((/** @type {any} */ id) => !decisions.has(id))) {
    diagnostic(diagnostics, 'INDEPENDENT_REVIEW_SOURCE_REF_UNKNOWN', path, 'Review evidence must reference current Claims or Decisions.');
  }
}

/** @param {unknown} left @param {unknown} right */
function sameReferenceSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)
    || left.some(value => typeof value !== 'string')
    || right.some(value => typeof value !== 'string')) return false;
  const order = (/** @type {string} */ first, /** @type {string} */ second) =>
    compareUnicodeScalar(first, second);
  return canonicalStringify([...left].sort(order)) === canonicalStringify([...right].sort(order));
}

/**
 * Validate review binding and structural closure. This proves the review is
 * current and auditable; it deliberately does not claim semantic zero-omission.
 * @param {unknown} submittedReview
 * @param {unknown} submittedTarget
 * @param {unknown} submittedContext
 */
export function validateIndependentReviewV4(submittedReview, submittedTarget, submittedContext) {
  /** @type {any[]} */ const diagnostics = [];
  if (!record(submittedTarget) || !record(submittedTarget.projection)
    || typeof submittedTarget.digest !== 'string' || !record(submittedContext)) {
    return { normalized: null, diagnostics: [{
      category: 'quality', code: 'INDEPENDENT_REVIEW_CONTEXT_INVALID', path: '/',
      message: 'Independent review validation requires a compiler-issued target and current references.'
    }] };
  }
  const review = record(submittedReview) ? submittedReview : {};
  if (review.status !== 'completed') {
    diagnostic(diagnostics, 'INDEPENDENT_REVIEW_INCOMPLETE', '/status', 'Only a completed independent review can release formal delivery.');
    return { normalized: null, diagnostics };
  }
  if (review.protocol_version !== '1.0.0' || review.review_mode !== 'independent_source_first'
    || !record(review.reviewer_identity)
    || !REVIEWER_CLASSES.has(review.reviewer_identity.identity_class)
    || typeof review.reviewer_identity.separation_basis !== 'string'
    || !review.reviewer_identity.separation_basis.trim()) {
    diagnostic(diagnostics, 'INDEPENDENT_REVIEW_NOT_INDEPENDENT', '/reviewer_identity', 'Generator self-check cannot stand in for source-first independent review.');
  }
  if (review.review_target_digest !== submittedTarget.digest
    || canonicalStringify(review.source_first_targets) !== canonicalStringify(
      submittedTarget.projection.source_first_targets
    )) {
    diagnostic(diagnostics, 'INDEPENDENT_REVIEW_TARGET_MISMATCH', '/review_target_digest', 'Review must bind the current compiler-issued target and source-first inventory.');
  }
  const claims = new Set(Array.isArray(submittedContext.source_claim_ids) ? submittedContext.source_claim_ids : []);
  const decisions = new Set(Array.isArray(submittedContext.decision_ids) ? submittedContext.decision_ids : []);
  const gaps = new Set(Array.isArray(submittedContext.semantic_gap_ids) ? submittedContext.semantic_gap_ids : []);
  const knownTargets = new Set(submittedTarget.projection.source_first_targets.map(
    (/** @type {any} */ target) => target.target_id
  ));
  const targetsById = new Map(submittedTarget.projection.source_first_targets.map(
    (/** @type {any} */ target) => [target.target_id, target]
  ));
  const knownItems = itemRefs(submittedTarget);
  for (const target of submittedTarget.projection.source_first_targets) {
    validateEvidenceRefs(target, claims, decisions, diagnostics, `/source_first_targets/${target.target_id}`);
  }
  const assessments = Array.isArray(review.target_assessments) ? review.target_assessments : [];
  const assessmentTargets = new Set();
  for (let index = 0; index < assessments.length; index += 1) {
    const assessment = assessments[index];
    const path = `/target_assessments/${index}`;
    if (!record(assessment) || !knownTargets.has(assessment.target_id)
      || assessmentTargets.has(assessment.target_id)) {
      diagnostic(diagnostics, 'INDEPENDENT_REVIEW_TARGET_ASSESSMENT_INVALID', path, 'Each issued source-first target requires exactly one assessment.');
      continue;
    }
    assessmentTargets.add(assessment.target_id);
    validateEvidenceRefs(assessment, claims, decisions, diagnostics, path);
    const issuedTarget = targetsById.get(assessment.target_id);
    if (!sameReferenceSet(assessment.source_claim_ids, issuedTarget.source_claim_ids)
      || !sameReferenceSet(assessment.decision_ids, issuedTarget.decision_ids)) {
      diagnostic(
        diagnostics, 'INDEPENDENT_REVIEW_TARGET_EVIDENCE_MISMATCH', path,
        'Target assessment evidence must exactly match its issued source-first target.'
      );
    }
    validateItems(assessment.affected_items, knownItems, diagnostics, `${path}/affected_items`);
    if (assessment.disposition === 'semantic_gap') {
      if (!Array.isArray(assessment.semantic_gap_ids) || assessment.semantic_gap_ids.length === 0
        || assessment.semantic_gap_ids.some(id => !gaps.has(id))) {
        diagnostic(diagnostics, 'INDEPENDENT_REVIEW_GAP_REF_INVALID', `${path}/semantic_gap_ids`, 'Gap disposition must bind a current semantic gap.');
      }
    } else if (!['verified', 'evidence_excluded'].includes(assessment.disposition)) {
      diagnostic(diagnostics, 'INDEPENDENT_REVIEW_DISPOSITION_INVALID', `${path}/disposition`, 'Target disposition is invalid.');
    }
    if (!record(assessment.required_recheck) || assessment.required_recheck.status !== 'passed') {
      diagnostic(diagnostics, 'INDEPENDENT_REVIEW_RECHECK_REQUIRED', `${path}/required_recheck`, 'Every final target assessment requires a passed recheck.');
    } else validateItems(assessment.required_recheck.affected_items, knownItems, diagnostics, `${path}/required_recheck/affected_items`);
  }
  if (assessmentTargets.size !== knownTargets.size
    || [...knownTargets].some(id => !assessmentTargets.has(id))) {
    diagnostic(diagnostics, 'INDEPENDENT_REVIEW_TARGET_ASSESSMENT_INCOMPLETE', '/target_assessments', 'Every source-first target must be assessed exactly once.');
  }
  const findings = Array.isArray(review.findings) ? review.findings : [];
  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index];
    const path = `/findings/${index}`;
    if (!record(finding)) {
      diagnostic(diagnostics, 'INDEPENDENT_REVIEW_FINDING_INVALID', path, 'Finding must be a closed object.');
      continue;
    }
    validateEvidenceRefs(finding, claims, decisions, diagnostics, path);
    validateItems(finding.affected_items, knownItems, diagnostics, `${path}/affected_items`);
    if (!Array.isArray(finding.source_first_target_ids)
      || finding.source_first_target_ids.some(id => !knownTargets.has(id))) {
      diagnostic(diagnostics, 'INDEPENDENT_REVIEW_TARGET_REF_UNKNOWN', `${path}/source_first_target_ids`, 'Finding target references must be compiler-issued.');
    }
    const confirmedClosed = finding.adjudication === 'confirmed'
      && finding.disposition === 'fixed_and_rechecked'
      && finding.required_recheck?.status === 'passed';
    const rejectedClosed = finding.adjudication === 'rejected'
      && finding.disposition === 'rejected_with_evidence'
      && finding.required_recheck?.status === 'not_required'
      && ((finding.source_claim_ids?.length ?? 0) + (finding.decision_ids?.length ?? 0) > 0);
    if (!confirmedClosed && !rejectedClosed) {
      diagnostic(diagnostics, 'INDEPENDENT_REVIEW_FINDING_NOT_CLOSED', path, 'A finding must be fixed and rechecked or rejected with current evidence.');
    }
    if (confirmedClosed) validateItems(
      finding.required_recheck.affected_items, knownItems, diagnostics, `${path}/required_recheck/affected_items`
    );
  }
  return {
    normalized: diagnostics.length === 0 ? structuredClone(review) : null,
    diagnostics: diagnostics.sort((left, right) => compareUnicodeScalar(
      `${left.code}\0${left.path}`, `${right.code}\0${right.path}`
    ))
  };
}
