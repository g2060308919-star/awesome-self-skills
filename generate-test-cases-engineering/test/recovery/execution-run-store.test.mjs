import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ensureRunInstance, readCurrentState, recoverStagingClaims, writeNonReadyCurrent, writeReadyCurrent
} from '../../src/run-store.mjs';

test('run instance is created once and remains immutable across recovery', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'execution-run-instance-'));
  try {
    const first = await ensureRunInstance(runDirectory);
    const second = await ensureRunInstance(runDirectory);
    assert.match(first.run_instance_id, /^RUN-[0-9a-f-]{36}$/u);
    assert.deepEqual(second, first);
    assert.deepEqual(JSON.parse(await readFile(path.join(runDirectory, 'run-instance.json'), 'utf8')), first);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('higher non-ready revision replaces an older ready pointer with a tombstone', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'execution-current-'));
  try {
    const run = await ensureRunInstance(runDirectory);
    await writeReadyCurrent(runDirectory, {
      run_instance_id: run.run_instance_id, source_revision: 1,
      bundle_path: path.join(runDirectory, 'output/r001/test-bundle.json'),
      bundle_digest: 'a'.repeat(64), plan_digest: 'b'.repeat(64)
    });
    await writeNonReadyCurrent(runDirectory, run.run_instance_id, 2);
    assert.deepEqual(await readCurrentState(runDirectory), {
      status: 'stale', run_instance_id: run.run_instance_id,
      active_source_revision: 2, reason: 'higher_revision_not_ready',
      previous_ready_revision: 1
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('non-ready recovery never revives a ready pointer for another revision', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'execution-current-recovery-'));
  try {
    const run = await ensureRunInstance(runDirectory);
    await writeNonReadyCurrent(runDirectory, run.run_instance_id, 3);
    await writeNonReadyCurrent(runDirectory, run.run_instance_id, 3);
    assert.equal((await readCurrentState(runDirectory)).status, 'stale');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('a preview request claimed immediately before a crash is restored exactly once', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'execution-preview-claim-'));
  try {
    const staging = path.join(runDirectory, 'staging');
    await mkdir(staging, { recursive: true });
    const request = { operation: 'cancel_preview', request_instance_id: 'PREVIEW-a' };
    await writeFile(
      path.join(staging, '.post-ready-preview-request.json.claim-999-1'),
      `${JSON.stringify(request)}\n`
    );
    await recoverStagingClaims(runDirectory);
    assert.deepEqual(
      JSON.parse(await readFile(path.join(staging, 'post-ready-preview-request.json'), 'utf8')),
      request
    );
    assert.deepEqual(
      (await readdir(staging)).filter((/** @type {string} */ name) => name.includes('.claim-')),
      []
    );
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
