import { materializeCaseDocumentDeliveryV4 } from '../../src/canonical-delivery-v4.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { deriveV4SystemContext } from '../../src/v4-system-context.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

export const BEND_REVIEW_RUN_ID = 'RUN-15151515-1515-4515-8515-151515151515';
export const BEND_REVIEW_COMPLETED_AT = '2026-09-09T12:00:00.000Z';

/**
 * Compile the normative B-end fixture through the pure production v4 pipeline.
 * The three deliberately ambiguous facts are removed only for this final-output
 * golden: their clarification lifecycle is covered by the production-runner
 * journey, while this helper freezes the post-clarification business result.
 *
 * @param {{retain_case_count?:number}} [options]
 */
export async function compileBendReviewGolden(options = {}) {
  const fixture = await bendReviewJourneyFixture(BEND_REVIEW_RUN_ID);
  fixture.artifacts.evidence_claims.semantic_gaps = [];
  if (options.retain_case_count !== undefined) {
    fixture.artifacts.case_drafts.cases = fixture.artifacts.case_drafts.cases.slice(
      0, options.retain_case_count
    );
  }
  const system = deriveV4SystemContext(fixture.artifacts);
  const compilation = compileCaseDocumentRevisionV4(fixture.artifacts, system);
  return { fixture, compilation };
}

/** Materialize all three canonical delivery representations from one compiled bundle. */
export async function materializeBendReviewGolden() {
  const result = await compileBendReviewGolden();
  if (result.compilation.status !== 'compiled') {
    throw new TypeError(`BEND_REVIEW_GOLDEN_NOT_COMPILED:${JSON.stringify(result.compilation)}`);
  }
  return {
    ...result,
    delivery: materializeCaseDocumentDeliveryV4({
      run_id: BEND_REVIEW_RUN_ID,
      completed_at: BEND_REVIEW_COMPLETED_AT,
      bundle: result.compilation.bundle,
      render_options: { include_audit_appendix: false },
      non_blocking_diagnostics: []
    })
  };
}
