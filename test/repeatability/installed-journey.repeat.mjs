import assert from 'node:assert/strict';
import test from 'node:test';
import { runInstalledAcceptedRepetitions } from '../helpers/run-journey.mjs';

// Production defect caught: the packaged runner can emit non-deterministic
// bundle or Markdown bytes across fresh installed-shape executions.
// Rule reversal caught: any of 100 fresh runner instances or directories that
// changes either raw byte digest makes this dedicated repeatability phase fail.

test('full journey: 100 fresh installed-shape runs are byte-identical', { timeout: 480_000 }, async () => {
  const result = await runInstalledAcceptedRepetitions('all-e3', 100);
  assert.equal(result.repetitions, 100);
  assert.match(result.runnerDigest, /^[0-9a-f]{64}$/u);
  assert.equal(result.bundleDigests.length, 100);
  assert.equal(result.markdownDigests.length, 100);
  assert.match(result.bundleDigests[0], /^[0-9a-f]{64}$/u);
  assert.match(result.markdownDigests[0], /^[0-9a-f]{64}$/u);
  for (const item of result.bundleDigests) assert.equal(item, result.bundleDigests[0]);
  for (const item of result.markdownDigests) assert.equal(item, result.markdownDigests[0]);
});
