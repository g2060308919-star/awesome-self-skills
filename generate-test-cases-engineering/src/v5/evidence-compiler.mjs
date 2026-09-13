import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }

/** @param {string} prefix @param {unknown} value */
function phase0StableId(prefix, value) { return `${prefix}-${canonicalObjectDigest(value).slice(7)}`; }

/**
 * Rebuild the frozen Phase 0 Fact → AtomicOutcome → FormalTestPoint projection
 * from accepted, stable-ID Claims. Batch-local Agent keys are intentionally not
 * part of any identity preimage.
 * @param {{semanticRootDigest:string,sourceRevision:number,claims:Array<Record<string,any>>}} input
 */
export function compileEvidenceSemantics(input) {
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.semanticRootDigest) || !Number.isSafeInteger(input.sourceRevision) || input.sourceRevision < 0 || !Array.isArray(input.claims)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Evidence semantic compilation input is invalid.');
  const claimIds = new Set();
  const rows = input.claims.map((claim) => {
    if (!nonblank(claim.claim_id) || claimIds.has(claim.claim_id) || !Array.isArray(claim.outcome_candidate_ids) || claim.outcome_candidate_ids.length === 0 || !claim.primary_outcome_signature) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Accepted Claim projection is incomplete or duplicated.');
    claimIds.add(claim.claim_id);
    const signature = structuredClone(claim.primary_outcome_signature);
    const statement = canonicalV5Stringify({ primary_outcome_signature: signature });
    const factIdentity = {
      statement,
      status: 'active',
      acceptance_role: 'primary_acceptance',
      claim_ids: [claim.claim_id],
      module_refs: [claim.subject_ref ?? 'requirements'],
      field_path: '/'
    };
    const fact = { fact_id: phase0StableId('FACT', factIdentity), ...factIdentity };
    const outcomeIdentity = {
      fact_id: fact.fact_id,
      condition: {
        condition_slot_digest: signature.condition_slot_digest,
        action_slot_digest: signature.action_slot_digest,
        branch_slot_digest: signature.branch_slot_digest
      },
      expected: signature.primary_observation_slot_digest,
      acceptance_role: fact.acceptance_role
    };
    const outcome = { outcome_id: phase0StableId('OUT', outcomeIdentity), ...outcomeIdentity, claim_ids: [claim.claim_id] };
    const formalTestPoint = { formal_test_point_id: phase0StableId('TP', { outcome_id: outcome.outcome_id }), outcome_id: outcome.outcome_id, semantic_gap_refs: [] };
    const supportingObservations = [...new Set(claim.observation_slot_digests ?? [])]
      .filter((digest) => digest !== signature.primary_observation_slot_digest)
      .map((assertion) => {
        const identity = { outcome_id: outcome.outcome_id, surface: 'external_observation', assertion };
        return { supporting_observation_id: phase0StableId('OBS', identity), ...identity, claim_ids: [claim.claim_id] };
      });
    return { claim, fact, outcome, formalTestPoint, supportingObservations };
  }).sort((left, right) => left.fact.fact_id.localeCompare(right.fact.fact_id));
  const facts = rows.map((row) => row.fact);
  const outcomes = rows.map((row) => row.outcome).sort((left, right) => left.outcome_id.localeCompare(right.outcome_id));
  const formalTestPoints = rows.map((row) => row.formalTestPoint).sort((left, right) => left.formal_test_point_id.localeCompare(right.formal_test_point_id));
  const supportingObservations = rows.flatMap((row) => row.supportingObservations).sort((left, right) => left.supporting_observation_id.localeCompare(right.supporting_observation_id));
  return {
    facts,
    test_obligations: {
      schema_version: '4.0.0', source_revision: input.sourceRevision,
      outcomes, formal_test_points: formalTestPoints, supporting_observations: supportingObservations,
      risk_review_ledger: [], not_applicable_records: [], exploratory: []
    },
    fact_assessments: facts.map((fact) => ({ fact_id: fact.fact_id, claim_ids: [...fact.claim_ids] })),
    formal_test_point_dispositions: formalTestPoints.map((point) => ({ formal_test_point_id: point.formal_test_point_id, kind: 'formal' }))
  };
}
