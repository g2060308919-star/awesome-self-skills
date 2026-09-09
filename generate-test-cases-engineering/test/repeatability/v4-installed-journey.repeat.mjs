import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalStringify } from '../../src/canonical.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installedRunner = path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs'
);

/** @param {string|Uint8Array} value */
function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} directory */
function runInstalled(directory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installedRunner, directory], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
  });
}

/** @param {any} result */
function oneReply(result) {
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.endsWith('\n'), true);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, 'installed runner stdout is exactly one JSON reply');
  return JSON.parse(lines[0]);
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} artifact */
async function stage(directory, stage, artifact) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stage]),
    `${canonicalStringify(artifact)}\n`, 'utf8'
  );
}

/** @param {number} index */
async function installedJourney(index) {
  const directory = await mkdtemp(path.join(os.tmpdir(), `gtc-v4-installed-${index}-`));
  try {
    const replies = [];
    const initial = oneReply(await runInstalled(directory));
    replies.push(`${initial.status}/${initial.stage ?? initial.result_kind ?? 'done'}`);
    assert.equal(initial.status, 'need_artifact', JSON.stringify(initial));
    assert.equal(initial.stage, 'source_pack');
    const fixture = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    fixture.artifacts.evidence_claims.semantic_gaps = [];

    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
      await stage(directory, stageName, fixture.artifacts[stageName]);
      const reply = oneReply(await runInstalled(directory));
      replies.push(`${reply.status}/${reply.stage ?? reply.result_kind ?? 'done'}`);
    }
    const replay = oneReply(await runInstalled(directory));
    replies.push(`${replay.status}/${replay.stage ?? replay.result_kind ?? 'done'}`);
    assert.equal(replay.status, 'finished', JSON.stringify(replay));
    const manifestBytes = await readFile(path.join(directory, 'output/current.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const bundleBytes = await readFile(path.join(directory, manifest.bundle.path));
    const markdownBytes = await readFile(path.join(directory, manifest.markdown.path));
    const worksheetBytes = await readFile(path.join(directory, manifest.execution_worksheet.path));
    assert.equal(JSON.parse(bundleBytes.toString('utf8')).cases.length, 7);
    return {
      runId: initial.scope.run_instance_id,
      replies,
      bundleDigest: sha(bundleBytes),
      markdownDigest: sha(markdownBytes),
      worksheetDigest: sha(worksheetBytes)
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('T15 installed v4 runner is deterministic across three fresh durable directories', { timeout: 120_000 }, async () => {
  const observations = [];
  for (let index = 0; index < 3; index += 1) observations.push(await installedJourney(index));

  assert.equal(new Set(observations.map(item => item.runId)).size, 3);
  assert.deepEqual(observations.map(item => item.replies), Array.from({ length: 3 }, () => [
    'need_artifact/source_pack',
    'need_revision/evidence_claims',
    'need_revision/behavior_views',
    'need_revision/case_drafts',
    'finished/delivered_cases',
    'finished/delivered_cases'
  ]));
  for (const field of ['bundleDigest', 'markdownDigest', 'worksheetDigest']) {
    assert.equal(new Set(observations.map((/** @type {any} */ item) => item[field])).size, 1, field);
  }
  assert.match(sha(await readFile(installedRunner)), /^[0-9a-f]{64}$/u);
});
