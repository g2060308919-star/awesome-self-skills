import { compileRelativeBaselineCaseV4 } from './case-semantics-v4.mjs';

/**
 * Materialize the four-step relative-baseline protocol from the verified
 * declaration while preserving the Adapter's business title and selectors.
 * Both delivery and recovery validation use this exact function so the
 * independent-review target cannot drift from the delivered Case.
 * @param {any[]} candidates
 * @param {any} semanticEvidence
 * @param {any[]} claimAssessments
 */
export function materializeRelativeBaselinesV4(
  candidates, semanticEvidence, claimAssessments
) {
  const assessmentById = new Map((Array.isArray(claimAssessments) ? claimAssessments : [])
    .map((/** @type {any} */ item) => [item.claim_id, item]));
  /** @type {any[]} */ const diagnostics = [];
  const cases = candidates.map(candidate => {
    if (!candidate.baseline_spec) return candidate;
    const assertion = semanticEvidence.baseline_assertions.find((/** @type {any} */ item) =>
      candidate.baseline_spec.claim_ids.includes(item.claim_id));
    if (!assertion) return candidate;
    const support = candidate.baseline_spec.claim_ids.map((/** @type {string} */ claimId) => {
      const assessment = assessmentById.get(claimId);
      const source = semanticEvidence.baseline_assertions.find(
        (/** @type {any} */ item) => item.claim_id === claimId
      );
      return {
        claim_id: claimId, level: assessment?.level, scope: source?.scope_ref,
        support_review: assessment?.support_review
      };
    });
    const result = compileRelativeBaselineCaseV4({
      case_context: {
        module_id: candidate.module_id, scope_ref: assertion.scope_ref,
        business_scope: candidate.title,
        operation: candidate.steps.map((/** @type {any} */ item) => item.action).join('；'),
        priority: candidate.priority, ordering: candidate.ordering,
        acceptance_role: candidate.acceptance_role, fact_ids: candidate.fact_ids,
        primary_test_point_id: candidate.primary_test_point_id,
        business_preconditions: candidate.business_preconditions,
        data_conditions: candidate.data_conditions
      },
      baseline_spec: candidate.baseline_spec
    }, { claim_assessments: support });
    diagnostics.push(...result.diagnostics);
    if (result.semantic_gaps.length || result.cases.length !== 1) {
      diagnostics.push({
        category: 'adapter_revision', code: 'BASELINE_DECLARATION_INCOMPLETE',
        path: '/baseline_spec',
        message: 'A persisted relative baseline must already contain a complete source-declared comparison contract.'
      });
      return candidate;
    }
    return {
      ...candidate, steps: result.cases[0].steps, oracles: result.cases[0].oracles,
      baseline_spec: result.cases[0].baseline_spec
    };
  });
  return { cases, diagnostics };
}
