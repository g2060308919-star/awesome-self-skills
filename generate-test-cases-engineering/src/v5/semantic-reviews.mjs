import { canonicalV5Stringify } from './canonical-v5.mjs';
import { stableId } from '../canonical.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';
import { sealV5Record } from './storage-records.mjs';

/** @param {unknown[]} left @param {unknown[]} right */
function sameSet(left, right) {
  return canonicalV5Stringify([...left].sort()) === canonicalV5Stringify([...right].sort());
}

/** @param {Record<string, any>} claim @param {Record<string, any>} candidate */
function sharedSignatureMatches(claim, candidate) {
  for (const key of ['subject_slot_digest', 'condition_slot_digest', 'action_slot_digest', 'branch_slot_digest']) {
    if (claim.primary_outcome_signature?.[key] !== candidate.atom_signature[key]) return false;
  }
  return true;
}

/**
 * @param {Record<string, any>} seed
 * @param {Record<string, any>} artifact
 * @param {{acceptedDecisionIds:string[]}} context
 * @returns {Record<string, any>}
 */
export function validateSemanticReviews(seed, artifact, context) {
  if (artifact.semantic_review_seed_digest !== seed.seed_digest) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Semantic review seed digest is stale.');
  const candidates = /** @type {Array<Record<string, any>>} */ (seed.normative_units.flatMap((/** @type {Record<string, any>} */ unit) => unit.outcome_candidates));
  const decomposition = /** @type {Array<Record<string, any>>} */ (artifact.decomposition_reviews ?? []);
  if (decomposition.length !== candidates.length) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Every outcome candidate must be reviewed exactly once.');
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidate_id, candidate]));
  const claimByKey = new Map(/** @type {Array<Record<string, any>>} */ (artifact.claims ?? []).map((claim) => [claim.claim_client_key, claim]));
  if (claimByKey.size !== (artifact.claims ?? []).length || [...claimByKey.keys()].some((key) => typeof key !== 'string' || key.trim().length === 0)) throw new V5ProtocolError('CLIENT_KEY_INVALID', 'Evidence Claim client keys must be nonblank and unique within the batch.');
  /** @type {Map<string, string[]>} */
  const candidateIdsByClaimKey = new Map();
  const bindClaimCandidate = (/** @type {string} */ claimKey, /** @type {string} */ candidateId) => candidateIdsByClaimKey.set(claimKey, [...new Set([...(candidateIdsByClaimKey.get(claimKey) ?? []), candidateId])].sort());
  const seenCandidates = new Set();
  for (const review of decomposition) {
    const candidate = candidateById.get(review.candidate_id);
    if (!candidate || review.seed_digest !== seed.seed_digest || seenCandidates.has(review.candidate_id)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Outcome review candidate binding is invalid.');
    seenCandidates.add(review.candidate_id);
    const disposition = review.disposition;
    if (disposition.kind === 'single_claim') {
      const claim = claimByKey.get(disposition.claim_client_key);
      if (!claim || candidate.required_observation_slot_digests.length !== 1 || !sharedSignatureMatches(claim, candidate) || claim.primary_outcome_signature.primary_observation_slot_digest !== candidate.required_observation_slot_digests[0] || !sameSet(claim.observation_slot_digests, candidate.required_observation_slot_digests)) throw new V5ProtocolError('ATOMIC_OUTCOME_NOT_SINGLE', 'Single Claim does not close exactly one advertised observation slot.');
      bindClaimCandidate(disposition.claim_client_key, candidate.candidate_id);
    } else if (disposition.kind === 'split_claims') {
      if (!Array.isArray(disposition.claim_client_keys) || disposition.claim_client_keys.length < 2 || new Set(disposition.claim_client_keys).size !== disposition.claim_client_keys.length) throw new V5ProtocolError('ATOMIC_OUTCOME_NOT_SINGLE', 'Composite outcome must split into unique Claims.');
      const primary = [];
      for (const key of disposition.claim_client_keys) {
        const claim = claimByKey.get(key);
        const primaryDigest = claim?.primary_outcome_signature?.primary_observation_slot_digest;
        if (!claim || !sharedSignatureMatches(claim, candidate) || !candidate.required_observation_slot_digests.includes(primaryDigest) || !sameSet(claim.observation_slot_digests, [primaryDigest])) throw new V5ProtocolError('ATOMIC_OUTCOME_NOT_SINGLE', 'Split Claim does not isolate one advertised observation slot.');
        primary.push(primaryDigest);
        bindClaimCandidate(key, candidate.candidate_id);
      }
      if (!sameSet(primary, candidate.required_observation_slot_digests)) throw new V5ProtocolError('ATOMIC_OUTCOME_NOT_SINGLE', 'Split Claims do not exactly cover the composite outcome.');
    } else if (disposition.kind === 'semantic_gap') {
      if (!/** @type {Array<Record<string, any>>} */ (artifact.semantic_gaps ?? []).some((gap) => gap.semantic_gap_client_key === disposition.semantic_gap_client_key && gap.target?.origin?.kind === 'outcome_decomposition' && gap.target.origin.outcome_candidate_id === candidate.candidate_id)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Outcome semantic gap is not exact.');
    } else if (disposition.kind === 'non_normative') {
      if (typeof disposition.reason !== 'string' || disposition.reason.trim().length === 0 || typeof disposition.source_review_id !== 'string' || disposition.source_review_id.length === 0) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Non-normative disposition needs direct review basis.');
    } else throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Outcome disposition kind is unknown.');
  }
  if ([...claimByKey.keys()].some((claimKey) => !candidateIdsByClaimKey.has(claimKey))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Every submitted Claim must close at least one advertised outcome candidate.');
  const compiledClaims = /** @type {Array<Record<string,any>>} */ ([...claimByKey.entries()].map(([claimClientKey, claim]) => {
    const semanticClaim = {
      accepted_source_state_digest: seed.accepted_source_state_digest,
      outcome_candidate_ids: candidateIdsByClaimKey.get(claimClientKey),
      primary_outcome_signature: claim.primary_outcome_signature,
      observation_slot_digests: [...claim.observation_slot_digests].sort(),
      ...(claim.subject_ref === undefined ? {} : { subject_ref: claim.subject_ref }),
      ...(claim.intent_ref === undefined ? {} : { intent_ref: claim.intent_ref })
    };
    return { ...structuredClone(claim), claim_id: stableId('claim', semanticClaim), outcome_candidate_ids: semanticClaim.outcome_candidate_ids };
  }).sort((left, right) => left.claim_id.localeCompare(right.claim_id)));
  const claimIdByClientKey = new Map(compiledClaims.map((claim) => [claim.claim_client_key, claim.claim_id]));
  for (const claim of compiledClaims) {
    if (Array.isArray(claim.basis)) claim.basis = claim.basis.map((basis) => basis.kind === 'claim' && claimIdByClientKey.has(basis.claim_id) ? { ...basis, claim_id: claimIdByClientKey.get(basis.claim_id) } : basis);
  }
  const clientKeyBindings = compiledClaims.map((claim) => ({ client_key: claim.claim_client_key, stable_id: claim.claim_id })).sort((left, right) => left.client_key.localeCompare(right.client_key));

  const ambiguities = /** @type {Array<Record<string, any>>} */ (artifact.ambiguity_reviews ?? []);
  if (ambiguities.length !== seed.ambiguity_candidates.length) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Every ambiguity candidate must be reviewed exactly once.');
  const ambiguityById = new Map(/** @type {Array<Record<string, any>>} */ (seed.ambiguity_candidates).map((candidate) => [candidate.candidate_id, candidate]));
  const ambiguitySeen = new Set();
  for (const review of ambiguities) {
    const candidate = ambiguityById.get(review.candidate_id);
    if (!candidate || review.seed_digest !== seed.seed_digest || ambiguitySeen.has(review.candidate_id)) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_UNKNOWN', 'Ambiguity review binding is invalid.');
    ambiguitySeen.add(review.candidate_id);
    const disposition = review.disposition;
    if (disposition.kind === 'resolved_by_claims' || disposition.kind === 'not_ambiguous') {
      if (!Array.isArray(disposition.claim_client_keys) || disposition.claim_client_keys.length === 0 || /** @type {string[]} */ (disposition.claim_client_keys).some((key) => !claimByKey.has(key)) || (disposition.kind === 'not_ambiguous' && (typeof disposition.reason !== 'string' || disposition.reason.trim().length === 0))) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Ambiguity resolution Claim basis is missing.');
    } else if (disposition.kind === 'resolved_by_decision') {
      if (!Array.isArray(disposition.decision_ids) || disposition.decision_ids.length === 0 || /** @type {string[]} */ (disposition.decision_ids).some((id) => !context.acceptedDecisionIds.includes(id))) throw new V5ProtocolError('AMBIGUITY_UNRESOLVED', 'Ambiguity Decision basis is not accepted in the current lineage.');
    } else if (disposition.kind === 'semantic_gap') {
      if (!/** @type {Array<Record<string, any>>} */ (artifact.semantic_gaps ?? []).some((gap) => gap.semantic_gap_client_key === disposition.semantic_gap_client_key && gap.target?.origin?.kind === 'ambiguity' && gap.target.origin.ambiguity_candidate_id === candidate.candidate_id && gap.target.origin.ambiguity_kind === candidate.ambiguity_kind)) throw new V5ProtocolError('AMBIGUITY_UNRESOLVED', 'Ambiguity gap target is not exact.');
    } else throw new V5ProtocolError('AMBIGUITY_UNRESOLVED', 'Ambiguity disposition kind is unknown.');
  }

  const groups = /** @type {Array<Record<string, any>>} */ (seed.entity_conflict_groups ?? []);
  const entityReviews = /** @type {Array<Record<string, any>>} */ (artifact.entity_resolutions ?? []);
  if (entityReviews.length !== groups.length) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Every entity conflict group must be reviewed.');
  const mentionsById = new Map(/** @type {Array<Record<string, any>>} */ (seed.entity_mention_candidates).map((mention) => [mention.candidate_id, mention]));
  /** @type {Map<string, Record<string, any>>} */
  const entityAggregates = new Map();
  for (const group of groups) {
    const review = entityReviews.find((item) => item.conflict_group_id === group.conflict_group_id);
    if (!review || review.seed_digest !== seed.seed_digest || !sameSet(review.mention_candidate_ids, group.mention_candidate_ids)) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Entity group review set is incomplete.');
    if (review.resolution.kind === 'unresolved') {
      if (!/** @type {Array<Record<string, any>>} */ (artifact.semantic_gaps ?? []).some((gap) => gap.semantic_gap_client_key === review.resolution.semantic_gap_client_key && gap.target?.origin?.kind === 'entity_resolution' && gap.target.origin.conflict_group_id === group.conflict_group_id && sameSet(gap.target.origin.mention_candidate_ids, group.mention_candidate_ids))) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Unresolved entity group needs one exact gap.');
      continue;
    }
    if (review.resolution.kind !== 'resolved_clusters' || !Array.isArray(review.resolution.clusters) || review.resolution.clusters.length === 0) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Entity resolution must be a nonempty cluster partition.');
    const covered = [];
    for (const cluster of review.resolution.clusters) {
      const basis = [.../** @type {string[]} */ (cluster.basis_claim_client_keys ?? []).map((claimKey) => ({ kind: 'claim', claim_id: claimIdByClientKey.get(claimKey) })), .../** @type {string[]} */ (cluster.basis_decision_ids ?? []).map((decisionId) => ({ kind: 'decision', decision_id: decisionId }))];
      if (!cluster.entity_client_key || !cluster.canonical_name?.trim() || !Array.isArray(cluster.mentions) || cluster.mentions.length === 0 || basis.length === 0 || /** @type {string[]} */ (cluster.basis_claim_client_keys).some((key) => !claimByKey.has(key)) || /** @type {string[]} */ (cluster.basis_decision_ids).some((id) => !context.acceptedDecisionIds.includes(id))) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Entity cluster needs canonical identity and current evidence.');
      const canonicalMentions = /** @type {Array<Record<string, any>>} */ (cluster.mentions).filter((entry) => ['canonical_business_name', 'canonical_business_name_and_exact_ui_label'].includes(entry.name_role));
      if (canonicalMentions.length !== 1 || mentionsById.get(canonicalMentions[0].mention_candidate_id)?.observed_name !== cluster.canonical_name) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Entity cluster must designate one exact canonical-name mention.');
      for (const entry of cluster.mentions) {
        if (!mentionsById.has(entry.mention_candidate_id) || !group.mention_candidate_ids.includes(entry.mention_candidate_id)) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Entity cluster contains an unknown mention.');
        covered.push(entry.mention_candidate_id);
      }
      const aggregate = entityAggregates.get(cluster.entity_client_key) ?? { canonical_name: cluster.canonical_name, mentions: [], basis: [] };
      if (aggregate.canonical_name !== cluster.canonical_name) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Reused entity client keys must preserve the canonical name.');
      aggregate.mentions.push(...cluster.mentions);
      aggregate.basis.push(...basis);
      entityAggregates.set(cluster.entity_client_key, aggregate);
    }
    if (!sameSet(covered, group.mention_candidate_ids)) throw new V5ProtocolError('ENTITY_RESOLUTION_UNRESOLVED', 'Entity clusters must exactly partition the conflict group.');
  }
  const termEntryRows = [...entityAggregates.entries()].map(([clientKey, aggregate]) => {
    const mentionIds = [...new Set(/** @type {Array<Record<string, any>>} */ (aggregate.mentions).map((entry) => entry.mention_candidate_id))].sort();
    const basis = [...new Map(/** @type {Array<Record<string, any>>} */ (aggregate.basis).map((item) => [canonicalV5Stringify(item), item])).values()].sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right)));
    return { clientKey, entry: {
      entity_id: stableV5Id('entity', { accepted_source_state_digest: seed.accepted_source_state_digest, canonical_name: aggregate.canonical_name, mention_candidate_ids: mentionIds, basis }),
      canonical_name: aggregate.canonical_name,
      alias_names: [...new Set(/** @type {Array<Record<string, any>>} */ (aggregate.mentions).filter((entry) => ['business_alias', 'business_alias_and_exact_ui_label'].includes(entry.name_role)).map((entry) => mentionsById.get(entry.mention_candidate_id)?.observed_name).filter(Boolean))].sort(),
      exact_ui_labels: [...new Set(/** @type {Array<Record<string, any>>} */ (aggregate.mentions).filter((entry) => entry.name_role.includes('exact_ui_label')).map((entry) => mentionsById.get(entry.mention_candidate_id)?.observed_name).filter(Boolean))].sort(),
      mention_candidate_ids: mentionIds, basis
    } };
  }).sort((left, right) => left.entry.entity_id.localeCompare(right.entry.entity_id));
  const termEntries = termEntryRows.map((row) => row.entry);
  clientKeyBindings.push(...termEntryRows.map((row) => ({ client_key: row.clientKey, stable_id: row.entry.entity_id })));
  clientKeyBindings.sort((left, right) => left.client_key.localeCompare(right.client_key));
  return {
    ...structuredClone(artifact), compiled_claims: compiledClaims, client_key_bindings: clientKeyBindings,
    term_registry: sealV5Record({ semantic_root_digest: seed.seed_digest, entries: termEntries }, 'registry_digest')
  };
}
