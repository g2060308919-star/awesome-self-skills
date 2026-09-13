import assert from 'node:assert/strict';
import test from 'node:test';

import { compileEvidenceSemantics } from '../../src/v5/evidence-compiler.mjs';
import { canonicalObjectDigest } from '../../src/v5/storage-records.mjs';

const root = `sha256:${'a'.repeat(64)}`;
const signature = (/** @type {string} */ suffix) => ({
  subject_slot_digest: `sha256:${suffix.repeat(64)}`,
  condition_slot_digest: `sha256:${'2'.repeat(64)}`,
  action_slot_digest: `sha256:${'3'.repeat(64)}`,
  primary_observation_slot_digest: `sha256:${'4'.repeat(64)}`,
  branch_slot_digest: `sha256:${'5'.repeat(64)}`
});

test('Compiler derives the frozen Fact, AtomicOutcome, and FormalTestPoint chain from accepted Claims', () => {
  const claims = [
    { claim_id: 'claim-a', outcome_candidate_ids: ['source-a'], primary_outcome_signature: signature('1'), observation_slot_digests: [`sha256:${'4'.repeat(64)}`] },
    { claim_id: 'claim-b', outcome_candidate_ids: ['source-b'], primary_outcome_signature: { ...signature('6'), primary_observation_slot_digest: `sha256:${'7'.repeat(64)}` }, observation_slot_digests: [`sha256:${'7'.repeat(64)}`] }
  ];
  const compiled = compileEvidenceSemantics({ semanticRootDigest: root, sourceRevision: 2, claims });
  assert.equal(compiled.facts.length, 2);
  assert.equal(compiled.test_obligations.schema_version, '4.0.0');
  assert.equal(compiled.test_obligations.outcomes.length, 2);
  assert.equal(compiled.test_obligations.formal_test_points.length, 2);
  for (const fact of compiled.facts) {
    assert.match(fact.fact_id, /^FACT-[0-9a-f]{64}$/u);
    assert.equal(claims.some((claim) => claim.claim_id === fact.claim_ids[0]), true);
    const outcome = /** @type {Record<string,any>} */ (compiled.test_obligations.outcomes.find((candidate) => candidate.fact_id === fact.fact_id));
    assert.match(outcome.outcome_id, /^OUT-[0-9a-f]{64}$/u);
    assert.equal(outcome.outcome_id, `OUT-${canonicalObjectDigest({ fact_id: outcome.fact_id, condition: outcome.condition, expected: outcome.expected, acceptance_role: outcome.acceptance_role }).slice(7)}`);
    const point = /** @type {Record<string,any>} */ (compiled.test_obligations.formal_test_points.find((candidate) => candidate.outcome_id === outcome.outcome_id));
    assert.equal(point.formal_test_point_id, `TP-${canonicalObjectDigest({ outcome_id: outcome.outcome_id }).slice(7)}`);
  }
  assert.deepEqual(compiled.formal_test_point_dispositions.map((row) => row.kind), ['formal', 'formal']);
});

test('Compiler semantic identities are independent of claim order and batch-local fields', () => {
  const claims = [
    { claim_id: 'claim-b', claim_client_key: 'local-b', outcome_candidate_ids: ['source-b'], primary_outcome_signature: signature('6'), observation_slot_digests: [`sha256:${'4'.repeat(64)}`] },
    { claim_id: 'claim-a', claim_client_key: 'local-a', outcome_candidate_ids: ['source-a'], primary_outcome_signature: signature('1'), observation_slot_digests: [`sha256:${'4'.repeat(64)}`] }
  ];
  const first = compileEvidenceSemantics({ semanticRootDigest: root, sourceRevision: 2, claims });
  const renamed = structuredClone(claims).reverse();
  renamed.forEach((claim) => { claim.claim_client_key = `renamed-${claim.claim_id}`; });
  assert.deepEqual(compileEvidenceSemantics({ semanticRootDigest: root, sourceRevision: 2, claims: renamed }), first);
});
