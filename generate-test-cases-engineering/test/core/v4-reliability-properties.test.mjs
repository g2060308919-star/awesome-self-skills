import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalArtifactSnapshot, canonicalStringify, digest, evidenceComponentDigests } from '../../src/canonical.mjs';
import { compileSemanticGapRootsV4 } from '../../src/semantic-gaps-v4.mjs';
import { compileSemanticClarificationCheckpointV4, validateSemanticClarificationCheckpointV4 } from '../../src/clarification-v4.mjs';
import { reliabilityFixture } from '../helpers/v4-reliability-fixture.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import * as sourceAdapter from '../../src/entry.mjs';
import { twoModuleReliabilityFixture } from '../helpers/v4-reliability-two-module-fixture.mjs';

const contract = latestV4Contract();
const runId = 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function evidence() { return reliabilityFixture(runId).artifacts.evidence_claims; }
/** @param {any} e */
function roots(e) { return compileSemanticGapRootsV4({ contract, facts: e.fact_ledger, claims: e.claims,
  diagnostic_candidates: e.semantic_gaps, discovery_phase: 'pre_case' }); }
/** @param {any} e @param {'pre_case'|'post_case'} phase @param {any} [prior] */
function checkpoint(e, phase = 'pre_case', prior = null) {
  return compileSemanticClarificationCheckpointV4({ ...contract, run_id: runId,
    committed_revision: 0, committed_checkpoint_bytes: new TextEncoder().encode('{}\n'),
    discovery_phase: phase, source_review_witness: { expected_unit_ids: ['test-unit'], reviewed_unit_ids: ['test-unit'] },
    ...evidenceComponentDigests(e), behavior_views_digest: phase === 'pre_case' ? null : `sha256:${digest({})}`,
    case_drafts_digest: phase === 'pre_case' ? null : `sha256:${digest({})}`,
    facts: e.fact_ledger, claims: e.claims, diagnostic_candidates: e.semantic_gaps, prior_checkpoint: prior
  }).checkpoint;
}

test('T01/T03 merged roots retain complete IDs and derive distinguishable labels', () => {
  const e = evidence();
  const original = structuredClone(e);
  const candidate = structuredClone(e.semantic_gaps[0]);
  e.semantic_gaps[0].source_claim_ids = ['c200'];
  candidate.source_claim_ids = ['c205'];
  e.semantic_gaps.push(candidate);
  const root = roots(e)[0];
  assert.deepEqual(root.subject_fact_ids, ['f200', 'f205']);
  assert.deepEqual(root.source_claim_ids, ['c200', 'c205']);
  assert.deepEqual(root.affected_facts, [
    '权益配置：重复提交记录数未定义（保存草稿）', '权益配置：重复提交记录数未定义（保存并生效）'
  ]);
  assert.deepEqual(e.fact_ledger, original.fact_ledger);
});

test('T02 four roots across two modules survive checkpoint and presentation validation', () => {
  const e = twoModuleReliabilityFixture(runId, sourceAdapter).evidence_claims;
  const result = checkpoint(e);
  assert.equal(result.semantic_gap_ledger.length, 4);
  assert.equal(result.clarification_state.presentation.question_parts.length, 4);
  assert.deepEqual(validateSemanticClarificationCheckpointV4(result), []);
});

test('T06 nested Fact and scope sets normalize only in the latest artifact snapshot', () => {
  const e = twoModuleReliabilityFixture(runId, sourceAdapter).evidence_claims;
  e.fact_ledger[0].claim_ids = ['c200', 'c205'];
  e.fact_ledger[0].module_refs = ['benefits', 'theme'];
  e.scope_manifest.modules[0].claim_ids = ['c200', 'c205'];
  const changed = structuredClone(e);
  changed.fact_ledger[0].claim_ids.reverse();
  changed.fact_ledger[0].module_refs.reverse();
  changed.scope_manifest.modules[0].claim_ids.reverse();
  changed.scope_manifest.modules.reverse();
  assert.deepEqual(evidenceComponentDigests(changed), evidenceComponentDigests(e));
  assert.equal(digest(canonicalArtifactSnapshot(changed)), digest(canonicalArtifactSnapshot(e)));
  const historical = { ...e, schema_version: '4.3.2' };
  assert.equal(canonicalStringify(canonicalArtifactSnapshot(historical)), canonicalStringify(historical),
    'historical canonical bytes remain unchanged');
});

test('T04 identical supported context collapses only labels; conflicting semantics are rejected', () => {
  const e = evidence();
  e.claims.find((/** @type {any} */ claim) => claim.claim_id === 'c205').subject_descriptor =
    structuredClone(e.claims.find((/** @type {any} */ claim) => claim.claim_id === 'c200').subject_descriptor);
  const root = roots(e)[0];
  assert.equal(root.affected_facts.length, 1);
  assert.equal(root.subject_fact_ids.length, 2);
  assert.equal(root.source_claim_ids.length, 2);
  e.semantic_gaps.push({ ...structuredClone(e.semantic_gaps[0]), question: '另一个不相容的问题' });
  assert.throws(() => roots(e), /SEMANTIC_GAP_ROOT_CONFLICT/);
});

test('T06/T07 64 seeded fact permutations preserve semantic digests and roundtrips without mutation', () => {
  const e = evidence();
  for (const id of ['f3', 'f10', 'f100']) e.fact_ledger.push({ ...structuredClone(e.fact_ledger[0]), fact_id: id });
  const expected = evidenceComponentDigests(e);
  for (let seed = 1; seed <= 64; seed++) {
    let state = seed;
    const shuffled = structuredClone(e);
    for (let i = shuffled.fact_ledger.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const j = state % (i + 1);
      [shuffled.fact_ledger[i], shuffled.fact_ledger[j]] = [shuffled.fact_ledger[j], shuffled.fact_ledger[i]];
    }
    const before = JSON.stringify(shuffled);
    const snapshot = canonicalArtifactSnapshot(shuffled);
    assert.deepEqual(evidenceComponentDigests(shuffled), expected, `seed=${seed} order=${shuffled.fact_ledger.map((/** @type {any} */ f) => f.fact_id)}`);
    assert.deepEqual(canonicalArtifactSnapshot(snapshot), snapshot);
    assert.deepEqual(canonicalArtifactSnapshot(JSON.parse(canonicalStringify(snapshot))), snapshot);
    assert.equal(JSON.stringify(shuffled), before);
  }
});

test('T08 business values and ordered steps/events remain significant', () => {
  const e = evidence();
  const changed = structuredClone(e);
  changed.fact_ledger[0].statement += 'changed';
  assert.notEqual(evidenceComponentDigests(e).fact_ledger_digest, evidenceComponentDigests(changed).fact_ledger_digest);
  for (const key of ['steps', 'events']) {
    assert.notEqual(digest({ [key]: ['first', 'second'] }), digest({ [key]: ['second', 'first'] }));
  }
});

test('T09 pre/post checkpoints bind the same persisted fact collection', () => {
  const e = evidence();
  const pre = checkpoint(e);
  e.semantic_gaps = e.semantic_gaps.map((/** @type {any} */ gap) => ({ ...gap, discovery_phase: 'post_case' }));
  const post = checkpoint(e, 'post_case', pre);
  const persisted = JSON.parse(canonicalStringify(e));
  assert.equal(pre.fact_ledger_digest, `sha256:${digest(persisted.fact_ledger)}`);
  assert.equal(post.fact_ledger_digest, pre.fact_ledger_digest);
  assert.deepEqual(validateSemanticClarificationCheckpointV4(post), []);
});
