import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const stageFiles = Object.freeze({
  source_pack: 'source-pack.json',
  evidence_claims: 'evidence-claims.json',
  behavior_views: 'behavior-views.json',
  case_drafts: 'case-drafts.json'
});
const workerPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)), 'repeat-installed-runner-worker.mjs'
);

/** @param {Uint8Array} bytes */
function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function yieldSharedResources() {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

/** @param {string} runnerPath @param {string} runDirectory @param {any} stageInputs @param {number} runIndex */
function invokeInstalledWorker(runnerPath, runDirectory, stageInputs, runIndex) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { runnerPath, runDirectory, stageFiles, stageInputs, runIndex }
    });
    /** @type {any} */
    let result = null;
    worker.on('message', (/** @type {any} */ message) => { result = message; });
    worker.on('error', reject);
    worker.on('exit', (/** @type {number} */ code) => {
      if (code !== 0) reject(new Error(result?.error ?? `installed runner worker exited ${code}`));
      else if (!result || !Array.isArray(result.replySequence)) {
        reject(new Error('installed runner worker did not return its staged public replies'));
      } else resolve(result);
    });
  });
}

async function main() {
  const [runnerPath, inputManifestPath, repetitionText, runRoot] = process.argv.slice(2);
  const repetitions = Number.parseInt(repetitionText ?? '', 10);
  assert.ok(path.isAbsolute(runnerPath ?? ''), 'runner path must be absolute');
  assert.ok(path.isAbsolute(inputManifestPath ?? ''), 'input manifest path must be absolute');
  assert.ok(path.isAbsolute(runRoot ?? ''), 'run root must be absolute');
  assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0, 'repetitions must be positive');
  const stageInputs = JSON.parse(await readFile(inputManifestPath, 'utf8'));
  for (const stageName of Object.keys(stageFiles)) {
    assert.ok(typeof stageInputs[stageName] === 'string' && stageInputs[stageName].length > 0);
  }
  const runnerDigest = sha256Hex(await readFile(runnerPath));
  /** @type {string[]} */
  const bundleDigests = [];
  /** @type {string[]} */
  const markdownDigests = [];
  /** @type {any[]} */
  const runObservations = [];

  const runInstance = async (/** @type {number} */ runIndex) => {
    const runDirectory = await mkdtemp(path.join(runRoot, 'installed-run-'));
    const observation = await invokeInstalledWorker(
      runnerPath, runDirectory, stageInputs, runIndex
    );
    const bundleDigest = sha256Hex(await readFile(observation.bundlePath));
    const markdownDigest = sha256Hex(await readFile(observation.markdownPath));
    return { ...observation, bundleDigest, markdownDigest };
  };

  const maximumConcurrent = 10;
  for (let start = 0; start < repetitions; start += maximumConcurrent) {
    const batchSize = Math.min(maximumConcurrent, repetitions - start);
    const batch = await Promise.all(Array.from(
      { length: batchSize }, (_, offset) => runInstance(start + offset)
    ));
    for (const [offset, observation] of batch.entries()) {
      bundleDigests.push(observation.bundleDigest);
      markdownDigests.push(observation.markdownDigest);
      runObservations.push({
        replySequence: observation.replySequence,
        inputs: observation.inputs
      });
      assert.equal(
        observation.bundleDigest, bundleDigests[0],
        `bundle bytes changed at run ${start + offset + 1}`
      );
      assert.equal(
        observation.markdownDigest, markdownDigests[0],
        `Markdown bytes changed at run ${start + offset + 1}`
      );
    }
    if (start + batchSize < repetitions) await yieldSharedResources();
  }

  for (const stageName of Object.keys(stageFiles)) for (const identityKey of [
    'beforeFileIdentity', 'afterFileIdentity'
  ]) assert.equal(new Set(runObservations.map(
    (observation) => observation.inputs[stageName][identityKey]
  )).size, repetitions, `${stageName} inputs must have independent ${identityKey} values`);

  process.stdout.write(`${JSON.stringify({
    repetitions,
    runnerDigest,
    bundleDigests,
    markdownDigests,
    runObservations
  })}\n`);
}

await main().catch((error) => {
  process.exitCode = 1;
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`installed runner repetition harness failed: ${message}\n`);
});
