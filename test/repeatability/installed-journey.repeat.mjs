import assert from 'node:assert/strict';
import test from 'node:test';
import { runInstalledAcceptedRepetitions } from '../helpers/run-journey.mjs';

// Production defect caught: the packaged runner can emit non-deterministic
// bundle, Markdown, or accepted-input bytes across fresh complete executions.
// Rule reversal caught: sharing input inodes, skipping a public runner stage,
// mutating input bytes, or changing either output digest makes this phase fail.

test('full journey: 100 fresh installed-shape runs are byte-identical', { timeout: 480_000 }, async () => {
  const result = await runInstalledAcceptedRepetitions('all-e3', 100);
  const stages = ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'];
  const expectedReplies = [
    'need_artifact/evidence_claims',
    'need_artifact/behavior_views',
    'need_artifact/case_drafts',
    'finished/done'
  ];
  assert.equal(result.repetitions, 100);
  assert.match(result.runnerDigest, /^[0-9a-f]{64}$/u);
  assert.equal(result.runObservations.length, 100);
  for (const run of result.runObservations) {
    assert.deepEqual(run.replySequence, expectedReplies);
    assert.deepEqual(Object.keys(run.inputs), stages);
    for (const stage of stages) {
      const input = run.inputs[stage];
      assert.equal(input.observedAfterFinished, true);
      assert.equal(input.isRegularFile, true);
      assert.equal(input.isSymbolicLink, false);
      assert.equal(input.afterIsRegularFile, true);
      assert.equal(input.afterIsSymbolicLink, false);
      assert.equal(input.rawBytesEqual, true, `${stage} input raw bytes changed`);
      assert.equal(input.beforeByteLength, input.afterByteLength);
      assert.equal(input.beforeDigest, input.afterDigest, `${stage} input bytes changed`);
    }
  }
  for (const stage of stages) for (const identityKey of [
    'beforeFileIdentity', 'afterFileIdentity'
  ]) assert.equal(new Set(result.runObservations.map(
    (/** @type {any} */ run) => run.inputs[stage][identityKey]
  )).size, 100, `${stage} inputs do not own 100 independent ${identityKey} values`);
  assert.equal(result.bundleDigests.length, 100);
  assert.equal(result.markdownDigests.length, 100);
  assert.match(result.bundleDigests[0], /^[0-9a-f]{64}$/u);
  assert.match(result.markdownDigests[0], /^[0-9a-f]{64}$/u);
  for (const item of result.bundleDigests) assert.equal(item, result.bundleDigests[0]);
  for (const item of result.markdownDigests) assert.equal(item, result.markdownDigests[0]);
});
