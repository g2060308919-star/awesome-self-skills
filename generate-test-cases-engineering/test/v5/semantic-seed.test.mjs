import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveSemanticReviewSeed } from '../../src/v5/semantic-seed.mjs';
import { validateSemanticReviews } from '../../src/v5/semantic-reviews.mjs';
import { derivePermissionMatrices } from '../../src/v5/permission.mjs';

const acceptedSourceStateDigest = `sha256:${'1'.repeat(64)}`;

/** @param {string} content */
function pack(content) {
  return [{
    artifact_digest: `sha256:${'2'.repeat(64)}`,
    payload: { sources: [{ source_object_digest: `sha256:${'3'.repeat(64)}`, media_type: 'text/markdown', content }] }
  }];
}

test('semantic seed deterministically advertises every normative unit and splits composite observations', () => {
  const input = { acceptedSourceStateDigest, sourcePacks: pack('提交后必须保存订单，并显示成功提示。\n结果正常。') };
  const first = /** @type {Record<string, any>} */ (deriveSemanticReviewSeed(input));
  const second = deriveSemanticReviewSeed(input);
  assert.deepEqual(second, first);
  assert.equal(first.normative_units.length, 2);
  assert.ok(first.normative_units.every((/** @type {Record<string, any>} */ unit) => unit.outcome_candidates.length >= 1));
  assert.equal(first.normative_units[0].outcome_candidates[0].required_observation_slot_digests.length, 2);
  assert.equal(first.ambiguity_candidates.some((/** @type {Record<string, any>} */ candidate) => candidate.ambiguity_kind === 'expected_outcome'), true);
  assert.match(first.seed_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.match(first.normative_units[0].outcome_candidates[0].candidate_id, /^out5_[0-9a-f]{64}$/u);
});

test('permission language produces Compiler-owned typed coordinates and a deterministic required cell', () => {
  const registryDigest = `sha256:${'9'.repeat(64)}`;
  const seed = /** @type {Record<string,any>} */ (deriveSemanticReviewSeed({ acceptedSourceStateDigest, sourcePacks: pack('管理员权限：提交后必须保存订单。'), permissionDerivationRegistryDigest: registryDigest }));
  assert.equal(seed.permission_scope_candidates.length, 1);
  assert.equal(seed.permission_scope_groups.length, 1);
  const matrices = derivePermissionMatrices(`sha256:${'a'.repeat(64)}`, seed, registryDigest);
  assert.equal(matrices.length, 1);
  assert.deepEqual(matrices[0].required_cells.map((cell) => cell.permission_dimension), ['decision']);
});

test('semantic review requires exact candidate coverage and atomic observation-slot dispositions', () => {
  const seed = /** @type {Record<string, any>} */ (deriveSemanticReviewSeed({ acceptedSourceStateDigest, sourcePacks: pack('提交后必须保存订单，并显示成功提示。') }));
  const candidate = seed.normative_units[0].outcome_candidates[0];
  const claims = candidate.required_observation_slot_digests.map((/** @type {string} */ slot, /** @type {number} */ index) => ({
    claim_client_key: `claim-${index}`,
    primary_outcome_signature: { ...candidate.atom_signature, primary_observation_slot_digest: slot },
    observation_slot_digests: [slot]
  }));
  const review = {
    semantic_review_seed_digest: seed.seed_digest,
    claims,
    semantic_gaps: [],
    decomposition_reviews: [{ seed_digest: seed.seed_digest, candidate_id: candidate.candidate_id, disposition: { kind: 'split_claims', claim_client_keys: claims.map((/** @type {Record<string, any>} */ claim) => claim.claim_client_key) } }],
    ambiguity_reviews: [],
    entity_resolutions: []
  };
  const accepted = /** @type {Record<string, any>} */ (validateSemanticReviews(seed, review, { acceptedDecisionIds: [] }));
  assert.equal(accepted.claims.length, 2);
  assert.equal(accepted.compiled_claims.length, 2);
  assert.ok(accepted.compiled_claims.every((/** @type {Record<string,any>} */ claim) => /^claim_[0-9a-f]{16}$/u.test(claim.claim_id)));
  assert.deepEqual(accepted.client_key_bindings.map((/** @type {Record<string,any>} */ binding) => binding.client_key), ['claim-0', 'claim-1']);
  const renamed = structuredClone(review);
  renamed.claims.forEach((/** @type {Record<string,any>} */ claim, /** @type {number} */ index) => { claim.claim_client_key = `renamed-${index}`; });
  renamed.decomposition_reviews[0].disposition.claim_client_keys = renamed.claims.map((/** @type {Record<string,any>} */ claim) => claim.claim_client_key);
  assert.deepEqual(
    /** @type {Record<string, any>} */ (validateSemanticReviews(seed, renamed, { acceptedDecisionIds: [] })).compiled_claims.map((/** @type {Record<string,any>} */ claim) => claim.claim_id),
    accepted.compiled_claims.map((/** @type {Record<string,any>} */ claim) => claim.claim_id)
  );
  assert.throws(() => validateSemanticReviews(seed, { ...review, decomposition_reviews: [] }, { acceptedDecisionIds: [] }), /SEMANTIC_REVIEW_CANDIDATE_MISSING/u);
  const bad = structuredClone(review);
  bad.claims[1].observation_slot_digests = [bad.claims[0].observation_slot_digests[0]];
  assert.throws(() => validateSemanticReviews(seed, bad, { acceptedDecisionIds: [] }), /ATOMIC_OUTCOME_NOT_SINGLE/u);
});

test('ambiguity resolutions need nonempty current basis and entity clusters form a complete role-explicit partition', () => {
  const base = deriveSemanticReviewSeed({ acceptedSourceStateDigest, sourcePacks: pack('“订单”与“Order”必须显示正确结果。') });
  const seed = /** @type {Record<string, any>} */ (structuredClone(base));
  seed.entity_mention_candidates = [
    { candidate_id: `emc5_${'4'.repeat(64)}`, conflict_group_id: `ecg5_${'6'.repeat(64)}`, locator_id: 'loc', source_span: { start_scalar: 0, end_scalar: 2, excerpt: '订单', excerpt_digest: `sha256:${'7'.repeat(64)}` }, observed_name: '订单' },
    { candidate_id: `emc5_${'5'.repeat(64)}`, conflict_group_id: `ecg5_${'6'.repeat(64)}`, locator_id: 'loc', source_span: { start_scalar: 3, end_scalar: 8, excerpt: 'Order', excerpt_digest: `sha256:${'8'.repeat(64)}` }, observed_name: 'Order' }
  ];
  seed.entity_conflict_groups = [{ conflict_group_id: `ecg5_${'6'.repeat(64)}`, mention_candidate_ids: seed.entity_mention_candidates.map((/** @type {Record<string, any>} */ item) => item.candidate_id) }];
  const candidate = seed.normative_units[0].outcome_candidates[0];
  const claim = { claim_client_key: 'claim-main', primary_outcome_signature: candidate.atom_signature, observation_slot_digests: candidate.required_observation_slot_digests };
  const artifact = {
    semantic_review_seed_digest: seed.seed_digest, claims: [claim], semantic_gaps: [],
    decomposition_reviews: [{ seed_digest: seed.seed_digest, candidate_id: candidate.candidate_id, disposition: { kind: 'single_claim', claim_client_key: 'claim-main' } }],
    ambiguity_reviews: seed.ambiguity_candidates.map((/** @type {Record<string, any>} */ item) => ({ seed_digest: seed.seed_digest, candidate_id: item.candidate_id, disposition: { kind: 'resolved_by_claims', claim_client_keys: ['claim-main'] } })),
    entity_resolutions: [{ seed_digest: seed.seed_digest, conflict_group_id: seed.entity_conflict_groups[0].conflict_group_id, mention_candidate_ids: seed.entity_conflict_groups[0].mention_candidate_ids, resolution: { kind: 'resolved_clusters', clusters: [{ entity_client_key: 'entity-order', canonical_name: '订单', mentions: [{ mention_candidate_id: seed.entity_mention_candidates[0].candidate_id, name_role: 'canonical_business_name' }, { mention_candidate_id: seed.entity_mention_candidates[1].candidate_id, name_role: 'business_alias' }], basis_claim_client_keys: ['claim-main'], basis_decision_ids: [] }] } }]
  };
  const accepted = /** @type {Record<string, any>} */ (validateSemanticReviews(seed, artifact, { acceptedDecisionIds: [] }));
  assert.equal(accepted.term_registry.entries[0].canonical_name, '订单');
  assert.deepEqual(accepted.term_registry.entries[0].alias_names, ['Order']);
  const incomplete = structuredClone(artifact);
  incomplete.entity_resolutions[0].resolution.clusters[0].mentions.pop();
  assert.throws(() => validateSemanticReviews(seed, incomplete, { acceptedDecisionIds: [] }), /ENTITY_RESOLUTION_UNRESOLVED/u);
  const emptyBasis = structuredClone(artifact);
  emptyBasis.ambiguity_reviews[0].disposition.claim_client_keys = [];
  assert.throws(() => validateSemanticReviews(seed, emptyBasis, { acceptedDecisionIds: [] }), /SEMANTIC_REVIEW_CANDIDATE_MISSING/u);
});
