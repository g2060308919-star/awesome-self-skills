import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { questionAnswerContractDigest } from './question-parts.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

const COMPATIBLE_MISSING_SEMANTICS = Object.freeze({
  field_correspondence: new Set(['authority', 'join', 'transform', 'null_policy', 'freshness']),
  domain: new Set(['domain_boundary']),
  population: new Set(['population_scope', 'population_proof']),
  oracle_semantics: new Set(['oracle_observation', 'oracle_assertion', 'oracle_scope', 'oracle_window']),
  permission_auxiliary: new Set(['denial_behavior', 'data_scope'])
});

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }

/** @param {Record<string,any>} contract */
function validateAnswerContract(contract) {
  if (!object(contract) || !Array.isArray(contract.allowed_controls) || contract.allowed_controls.length === 0 || new Set(contract.allowed_controls).size !== contract.allowed_controls.length || !object(contract.value_schema)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Behavior gap answer contract is invalid.');
  if (contract.answer_mode === 'typed_answer') {
    if (canonicalV5Stringify(contract.allowed_controls) !== '["answer","defer","unknown","close_for_delivery"]' || contract.value_schema.kind === 'unavailable') throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'V1 Behavior answers must advertise the frozen typed controls and a typed value schema.');
  } else throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'V1 does not register control-only Behavior gaps.');
  return structuredClone(contract);
}

/**
 * Compile Agent-proposed Behavior gaps into accepted, target-bound stable gaps.
 * @param {string} semanticRootDigest
 * @param {Record<string,any>} seed
 * @param {Array<Record<string,any>>} proposals
 * @param {Array<Record<string,any>>} reviews
 */
export function compileBehaviorSemanticGaps(semanticRootDigest, seed, proposals, reviews) {
  const requirements = new Map(/** @type {Array<Record<string,any>>} */ (seed.required_contracts ?? []).map((requirement) => [requirement.required_contract_key, requirement]));
  const proposalByClientKey = new Map();
  const accepted = [];
  const bindings = [];
  for (const proposal of proposals) {
    if (!object(proposal) || !nonblank(proposal.semantic_gap_client_key) || proposalByClientKey.has(proposal.semantic_gap_client_key) || !object(proposal.target) || proposal.target.kind !== 'behavior_contract' || !nonblank(proposal.target.required_contract_key) || !nonblank(proposal.missing_semantics) || !nonblank(proposal.question) || !Array.isArray(proposal.basis) || proposal.basis.length === 0) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior gap proposal identity, target, question, or basis is invalid.');
    const requirement = requirements.get(proposal.target.required_contract_key);
    if (!requirement || !COMPATIBLE_MISSING_SEMANTICS[requirement.contract_kind]?.has(proposal.missing_semantics)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior gap target or missing semantics does not match the advertised requirement.');
    const answerContract = validateAnswerContract(proposal.answer_contract);
    const normalized = {
      target: structuredClone(proposal.target), missing_semantics: proposal.missing_semantics,
      question: proposal.question.trim(), answer_contract: answerContract,
      basis: structuredClone(proposal.basis)
    };
    const sourceProposalDigest = canonicalObjectDigest({ namespace: 'generate-test-cases/v5/behavior-semantic-gap-proposal', format_version: 1, proposal: normalized });
    const answerContractDigest = questionAnswerContractDigest(answerContract);
    const semanticGapId = stableV5Id('behavior_semantic_gap', {
      input_semantic_root_digest: semanticRootDigest, target: normalized.target,
      missing_semantics: normalized.missing_semantics, answer_contract_digest: answerContractDigest,
      basis: normalized.basis
    });
    const row = {
      semantic_gap_id: semanticGapId, semantic_root_digest: semanticRootDigest,
      ...normalized, source_proposal_digest: sourceProposalDigest
    };
    proposalByClientKey.set(proposal.semantic_gap_client_key, row);
    accepted.push(row);
    bindings.push({ client_key: proposal.semantic_gap_client_key, stable_id: semanticGapId });
  }
  const referenced = new Set();
  for (const review of reviews) {
    if (review.disposition?.kind !== 'semantic_gap') continue;
    const reference = review.disposition.gap_ref;
    if (!object(reference) || reference.kind !== 'same_behavior_batch' || !nonblank(reference.semantic_gap_client_key)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior gap review must use an exact same-batch reference.');
    const gap = proposalByClientKey.get(reference.semantic_gap_client_key);
    if (!gap || gap.target.required_contract_key !== review.required_contract_key || referenced.has(reference.semantic_gap_client_key)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior gap review target is missing, duplicated, or cross-wired.');
    referenced.add(reference.semantic_gap_client_key);
  }
  if (referenced.size !== proposalByClientKey.size) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Every same-batch Behavior gap must have exactly one matching review.');
  accepted.sort((left, right) => left.semantic_gap_id.localeCompare(right.semantic_gap_id));
  bindings.sort((left, right) => left.client_key.localeCompare(right.client_key));
  return { accepted_gaps: accepted, client_key_bindings: bindings };
}

/** @param {Array<Record<string,any>>} acceptedGaps */
export function clarificationGapsFromAcceptedBehavior(acceptedGaps) {
  return acceptedGaps.map((gap) => {
    const gapPayloadDigest = canonicalObjectDigest(gap);
    return {
      gap_binding: { kind: 'behavior_gap', gap_id: gap.semantic_gap_id, gap_payload_digest: gapPayloadDigest },
      answer_contract: structuredClone(gap.answer_contract), target: structuredClone(gap.target),
      question: gap.question,
      why_needed: gap.why_needed ?? `The ${gap.missing_semantics} semantics must be resolved before dependent cases can be formal.`,
      question_impact_summary: structuredClone(gap.question_impact_summary ?? { affected_case_keys: [], impact_kinds: [gap.missing_semantics] })
    };
  }).sort((left, right) => left.gap_binding.gap_id.localeCompare(right.gap_binding.gap_id));
}
