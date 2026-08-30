import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
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
const link = /** @type {any} */ (fsPromises).link;
const lstat = /** @type {any} */ (fsPromises).lstat;

/** @param {Uint8Array} bytes */
function byteDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function yieldSharedResources() {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

/** @param {string} runnerPath @param {string} runDirectory */
function invokeInstalledWorker(runnerPath, runDirectory) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: { runnerPath, runDirectory } });
    /** @type {any} */
    let result = null;
    worker.on('message', (/** @type {any} */ message) => { result = message; });
    worker.on('error', reject);
    worker.on('exit', (/** @type {number} */ code) => {
      if (code !== 0) reject(new Error(result?.error ?? `installed runner worker exited ${code}`));
      else if (!result || typeof result.output !== 'string') {
        reject(new Error('installed runner worker did not return its public reply'));
      } else {
        const lines = result.output.trimEnd().split('\n');
        if (lines.length !== 1) reject(new Error(`installed runner emitted ${lines.length} lines`));
        else resolve(JSON.parse(lines[0]));
      }
    });
  });
}

async function main() {
  const [runnerPath, revisionPath, repetitionText, runRoot] = process.argv.slice(2);
  const repetitions = Number.parseInt(repetitionText ?? '', 10);
  assert.ok(path.isAbsolute(runnerPath ?? ''), 'runner path must be absolute');
  assert.ok(path.isAbsolute(revisionPath ?? ''), 'revision path must be absolute');
  assert.ok(path.isAbsolute(runRoot ?? ''), 'run root must be absolute');
  assert.ok(Number.isSafeInteger(repetitions) && repetitions > 0, 'repetitions must be positive');
  const revision = JSON.parse(await readFile(revisionPath, 'utf8'));
  const runnerDigest = byteDigest(await readFile(runnerPath));
  const acceptedTemplate = path.join(runRoot, 'accepted-template');
  await mkdir(acceptedTemplate, { recursive: true });
  for (const [stageName, fileName] of Object.entries(stageFiles)) {
    await writeFile(
      path.join(acceptedTemplate, fileName),
      `${JSON.stringify(revision[stageName])}\n`,
      'utf8'
    );
    const templateShape = await lstat(path.join(acceptedTemplate, fileName));
    assert.ok(templateShape.isFile() && !templateShape.isSymbolicLink());
  }
  /** @type {string[]} */
  const bundleDigests = [];
  /** @type {string[]} */
  const markdownDigests = [];

  const runInstance = async () => {
    const runDirectory = await mkdtemp(path.join(runRoot, 'installed-run-'));
    const acceptedDirectory = path.join(runDirectory, 'accepted/r000');
    await mkdir(acceptedDirectory, { recursive: true });
    for (const fileName of Object.values(stageFiles)) {
      await link(
        path.join(acceptedTemplate, fileName),
        path.join(acceptedDirectory, fileName)
      );
    }
    const reply = await invokeInstalledWorker(runnerPath, runDirectory);
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    const bundleDigest = byteDigest(await readFile(reply.bundle_path));
    const markdownDigest = byteDigest(await readFile(reply.markdown_path));
    return { bundleDigest, markdownDigest };
  };

  const maximumConcurrent = 10;
  for (let start = 0; start < repetitions; start += maximumConcurrent) {
    const batchSize = Math.min(maximumConcurrent, repetitions - start);
    const batch = await Promise.all(Array.from({ length: batchSize }, runInstance));
    for (const [offset, observation] of batch.entries()) {
      bundleDigests.push(observation.bundleDigest);
      markdownDigests.push(observation.markdownDigest);
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

  process.stdout.write(`${JSON.stringify({
    repetitions,
    runnerDigest,
    bundleDigests,
    markdownDigests
  })}\n`);
}

await main().catch((error) => {
  process.exitCode = 1;
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`installed runner repetition harness failed: ${message}\n`);
});
