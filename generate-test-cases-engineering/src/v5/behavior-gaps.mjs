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
 * @param {{permissionMatrices?:Array<Record<string,any>>,permissionMatrixReviews?:Array<Record<string,any>>,riskReviews?:Array<Record<string,any>>,acceptedBehaviorGaps?:Array<Record<string,any>>}} [context]
 */
export function compileBehaviorSemanticGaps(semanticRootDigest, seed, proposals, reviews, context = {}) {
  const requirements = new Map(/** @type {Array<Record<string,any>>} */ (seed.required_contracts ?? []).map((requirement) => [requirement.required_contract_key, requirement]));
  const permissionCells = new Map((context.permissionMatrices ?? []).flatMap((matrix) => matrix.required_cells.map((/** @type {Record<string,any>} */ cell) => [`${matrix.matrix_id}\0${cell.required_cell_key}`, { ...cell, matrix_id: matrix.matrix_id }])));
  const riskKeys = new Set((seed.risk_review_module_ids ?? []).flatMap((/** @type {string} */ moduleRef) => ['null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay', 'long_content', 'pagination', 'refresh', 'business_permission_boundary'].map((riskKind) => `${moduleRef}\0${riskKind}`)));
  const proposalByClientKey = new Map();
  const acceptedById = new Map();
  const accepted = [];
  const bindings = [];
  for (const gap of context.acceptedBehaviorGaps ?? []) {
    const normalized = {
      target: structuredClone(gap.target), missing_semantics: gap.missing_semantics,
      question: gap.question, answer_contract: structuredClone(gap.answer_contract), basis: structuredClone(gap.basis)
    };
    const sourceProposalDigest = canonicalObjectDigest({ namespace: 'generate-test-cases/v5/behavior-semantic-gap-proposal', format_version: 1, proposal: normalized });
    const expectedId = stableV5Id('behavior_semantic_gap', {
      input_semantic_root_digest: gap.semantic_root_digest, target: normalized.target,
      missing_semantics: normalized.missing_semantics, answer_contract_digest: questionAnswerContractDigest(normalized.answer_contract),
      basis: normalized.basis
    });
    if (!nonblank(gap.semantic_gap_id) || acceptedById.has(gap.semantic_gap_id) || gap.source_proposal_digest !== sourceProposalDigest || gap.semantic_gap_id !== expectedId) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Accepted Behavior gap does not pass reverse identity verification.');
    acceptedById.set(gap.semantic_gap_id, structuredClone(gap));
  }
  for (const proposal of proposals) {
    if (!object(proposal) || !nonblank(proposal.semantic_gap_client_key) || proposalByClientKey.has(proposal.semantic_gap_client_key) || !object(proposal.target) || !nonblank(proposal.missing_semantics) || !nonblank(proposal.question) || !Array.isArray(proposal.basis) || proposal.basis.length === 0) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior gap proposal identity, target, question, or basis is invalid.');
    if (proposal.target.kind === 'behavior_contract') {
      const requirement = requirements.get(proposal.target.required_contract_key);
      if (!requirement || !/** @type {Record<string,Set<string>>} */ (COMPATIBLE_MISSING_SEMANTICS)[requirement.contract_kind]?.has(proposal.missing_semantics)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior gap target or missing semantics does not match the advertised requirement.');
    } else if (proposal.target.kind === 'permission_cell') {
      const cell = permissionCells.get(`${proposal.target.matrix_id}\0${proposal.target.required_cell_key}`);
      const requiredMissing = cell?.permission_dimension === 'decision' ? 'permission_outcome' : cell?.permission_dimension;
      if (!cell || proposal.missing_semantics !== requiredMissing) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Permission gap must target one advertised cell and its exact missing semantics.');
    } else if (proposal.target.kind === 'risk') {
      if (!riskKeys.has(`${proposal.target.module_ref}\0${proposal.target.risk_kind}`) || proposal.missing_semantics !== 'risk_rule') throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Risk gap must target one advertised module × risk cell.');
    } else throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Behavior gap target kind is not registered.');
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
  const referencedGaps = new Map();
  const resolveGapReference = (/** @type {Record<string,any>} */ reference, /** @type {Record<string,any>} */ expectedTarget, /** @type {string} */ message) => {
    let gap;
    if (object(reference) && reference.kind === 'same_behavior_batch' && nonblank(reference.semantic_gap_client_key)) {
      gap = proposalByClientKey.get(reference.semantic_gap_client_key);
      if (!gap || referenced.has(reference.semantic_gap_client_key)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', message);
      referenced.add(reference.semantic_gap_client_key);
    } else if (object(reference) && reference.kind === 'accepted_gap' && nonblank(reference.semantic_gap_id)) gap = acceptedById.get(reference.semantic_gap_id);
    else throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', message);
    if (!gap || canonicalV5Stringify(gap.target) !== canonicalV5Stringify(expectedTarget)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', message);
    referencedGaps.set(gap.semantic_gap_id, gap);
    return gap;
  };
  for (const review of reviews) {
    if (review.disposition?.kind !== 'semantic_gap') continue;
    const reference = review.disposition.gap_ref;
    resolveGapReference(reference, { kind: 'behavior_contract', required_contract_key: review.required_contract_key }, 'Behavior gap review target is missing, duplicated, or cross-wired.');
  }
  for (const matrixReview of context.permissionMatrixReviews ?? []) {
    for (const row of matrixReview.cell_dispositions ?? []) {
      if (row.disposition?.kind !== 'semantic_gap') continue;
      const reference = row.disposition.gap_ref;
      resolveGapReference(reference, { kind: 'permission_cell', matrix_id: matrixReview.matrix_id, required_cell_key: row.required_cell_key }, 'Permission gap reference is missing, duplicated, or cross-wired.');
    }
  }
  for (const riskReview of context.riskReviews ?? []) {
    if (riskReview.risk_item?.risk_disposition !== 'semantic_gap') continue;
    const reference = riskReview.risk_item.gap_ref;
    resolveGapReference(reference, { kind: 'risk', module_ref: riskReview.module_ref, risk_kind: riskReview.risk_kind }, 'Risk gap reference is missing, duplicated, or cross-wired.');
  }
  if (referenced.size !== proposalByClientKey.size) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Every same-batch Behavior gap must have exactly one matching review.');
  accepted.sort((left, right) => left.semantic_gap_id.localeCompare(right.semantic_gap_id));
  bindings.sort((left, right) => left.client_key.localeCompare(right.client_key));
  return { accepted_gaps: [...referencedGaps.values()].sort((left, right) => left.semantic_gap_id.localeCompare(right.semantic_gap_id)), new_accepted_gaps: accepted, client_key_bindings: bindings };
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
