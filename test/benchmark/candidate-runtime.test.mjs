import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { materializeCandidateRuntime } from '../../benchmark/candidate-runtime.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('candidate runtime is materialized from the frozen Git tree, never mutable worktree bytes', async (/** @type {any} */ context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-frozen-runtime-'));
  context.after(async () => rm(temporaryRoot, { recursive: true, force: true }));
  const cloneRoot = path.join(temporaryRoot, 'candidate');
  await execFileAsync('git', ['clone', '--quiet', '--no-hardlinks', repositoryRoot, cloneRoot]);
  const { stdout: revisionOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: cloneRoot });
  const revision = revisionOutput.trim();
  const mutableRunner = path.join(cloneRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs');
  await writeFile(mutableRunner, 'throw new Error("worktree tamper executed");\n');

  const runtime = await materializeCandidateRuntime(cloneRoot, revision);
  context.after(runtime.cleanup);
  const { stdout: committedRunner } = await execFileAsync(
    'git', ['show', `${revision}:skill/generate-test-cases/scripts/test-compiler.mjs`],
    { cwd: cloneRoot, maxBuffer: 64 * 1024 * 1024 }
  );

  assert.equal(await readFile(runtime.runnerPath, 'utf8'), committedRunner);
  assert.notEqual(await readFile(runtime.runnerPath, 'utf8'), await readFile(mutableRunner, 'utf8'));
  assert.equal(path.dirname(runtime.replySchemaPath), path.dirname(runtime.bundleSchemaPath));
});

test('capture verifier rejects transcript bytes above the fixed resource limit', async () => {
  const { verifyCaptureTranscript, MAX_TRANSCRIPT_BYTES } = await import('../../benchmark/replay-capture.mjs');
  await assert.rejects(
    verifyCaptureTranscript({
      transcriptBytes: new Uint8Array(MAX_TRANSCRIPT_BYTES + 1),
      expected: {}, candidateRoot: repositoryRoot, runnerPath: '',
      replySchemaPath: '', bundleSchemaPath: '', taskContract: {}, sourceContract: {}
    }),
    /size limit/u
  );
});
