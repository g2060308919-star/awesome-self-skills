import { digest } from './canonical.mjs';

export const REPLY_STATUS = Object.freeze([
  'need_artifact',
  'need_user_answers',
  'need_revision',
  'finished',
  'fatal'
]);

export const DIAGNOSTIC_CATEGORY = Object.freeze([
  'schema',
  'reference',
  'traceability',
  'coverage',
  'classification'
]);

/**
 * Refine an already Schema-valid v4 manifest without I/O or mutation.
 * This does not prove canonical authority, resolve artifact references, or
 * reconcile counts with bundle/coverage/risk ledgers; those are verifier gates.
 * Legacy pointers retain their existing read-only interpretation.
 * @param {any} manifest
 * @returns {Array<{category:string,code:string,path:string,message:string}>}
 */
export function validateCanonicalManifestRelations(manifest) {
  if (manifest.schema_version !== '4.0.0') return [];
  const diagnostics = [];
  if (manifest.delivery_intent === 'case_document'
    && ['delivered_with_gaps', 'blocked_only'].includes(manifest.result_kind)
    && manifest.closed_for_delivery_root_count !== manifest.blocked_root_count) {
    diagnostics.push({
      category: 'coverage', code: 'MANIFEST_GAP_COUNT_MISMATCH',
      path: '/closed_for_delivery_root_count',
      message: 'Every blocked root must be explicitly closed for delivery.'
    });
  }
  if (manifest.delivery_intent === 'execution_plan') {
    const caseIds = manifest.runner_projection.case_ids;
    const selected = manifest.result_kind === 'execution_ready';
    if (manifest.runner_ready !== selected || (caseIds.length > 0) !== selected) {
      diagnostics.push({
        category: 'classification', code: 'MANIFEST_RUNNER_READINESS_MISMATCH',
        path: '/runner_ready',
        message: 'Execution readiness requires a nonempty selection; no execution selected requires an empty selection.'
      });
    }
    // Hash the array itself: canonical business order is significant, not a set.
    if (manifest.runner_projection.case_ids_digest !== 'sha256:' + digest(caseIds)) {
      diagnostics.push({
        category: 'traceability', code: 'MANIFEST_RUNNER_DIGEST_MISMATCH',
        path: '/runner_projection/case_ids_digest',
        message: 'Runner digest must match the canonical ordered Case ID array.'
      });
    }
  }
  return diagnostics;
}

/** Definition collections are intentionally local to one artifact. */
export const STABLE_ID_COLLECTIONS = Object.freeze([
  Object.freeze({ path: Object.freeze(['sources']), id: 'source_id' }),
  Object.freeze({ path: Object.freeze(['locators']), id: 'locator_id' }),
  Object.freeze({ path: Object.freeze(['source_policy', 'rules']), id: 'rule_id' }),
  Object.freeze({ path: Object.freeze(['decision_records']), id: 'decision_id' }),
  Object.freeze({ path: Object.freeze(['clarification_events']), id: 'event_id' }),
  Object.freeze({ path: Object.freeze(['claims']), id: 'claim_id' }),
  Object.freeze({ path: Object.freeze(['fact_ledger']), id: 'fact_id' }),
  Object.freeze({ path: Object.freeze(['views']), id: 'view_id' }),
  Object.freeze({ path: Object.freeze(['views', '*', 'elements']), id: 'element_id', namespace: 'elements' }),
  Object.freeze({ path: Object.freeze(['views', '*', 'relations']), id: 'relation_id' }),
  Object.freeze({ path: Object.freeze(['interaction_candidates']), id: 'candidate_id' }),
  Object.freeze({ path: Object.freeze(['obligations']), id: 'obligation_id' }),
  Object.freeze({ path: Object.freeze(['cases']), id: 'case_id', namespace: 'cases' }),
  Object.freeze({ path: Object.freeze(['cases', '*', 'steps']), id: 'step_id', namespace: 'case_steps', scopeSegments: 1 }),
  Object.freeze({ path: Object.freeze(['cases', '*', 'steps', '*', 'expectations']), id: 'expectation_id', namespace: 'case_expectations', scopeSegments: 3 }),
  Object.freeze({ path: Object.freeze(['exploratory_candidates']), id: 'exploratory_id' }),
  Object.freeze({ path: Object.freeze(['root_issue_dispositions']), id: 'root_issue_id' }),
  Object.freeze({ path: Object.freeze(['grounded']), id: 'case_id', namespace: 'bundle_cases' }),
  Object.freeze({ path: Object.freeze(['conditional']), id: 'case_id', namespace: 'bundle_cases' }),
  Object.freeze({ path: Object.freeze(['grounded', '*', 'steps']), id: 'step_id', namespace: 'case_steps', scopeSegments: 1 }),
  Object.freeze({ path: Object.freeze(['conditional', '*', 'steps']), id: 'step_id', namespace: 'case_steps', scopeSegments: 1 }),
  Object.freeze({ path: Object.freeze(['grounded', '*', 'steps', '*', 'expectations']), id: 'expectation_id', namespace: 'case_expectations', scopeSegments: 3 }),
  Object.freeze({ path: Object.freeze(['conditional', '*', 'steps', '*', 'expectations']), id: 'expectation_id', namespace: 'case_expectations', scopeSegments: 3 }),
  Object.freeze({ path: Object.freeze(['blockers']), id: 'root_issue_id', namespace: 'reply_root_issues' }),
  Object.freeze({ path: Object.freeze(['blocked']), id: 'obligation_id' }),
  Object.freeze({ path: Object.freeze(['exploratory']), id: 'exploratory_id' })
]);
