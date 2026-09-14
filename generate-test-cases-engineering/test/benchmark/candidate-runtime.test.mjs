import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { materializeCandidateRuntime } from '../../benchmark/candidate-runtime.mjs';

const execFileAsync = promisify(execFile);
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} temporaryRoot */
async function cloneCurrentRepository(temporaryRoot) {
  const { stdout: sourceGitRootOutput } = await execFileAsync(
    'git', ['rev-parse', '--show-toplevel'], { cwd: repositoryRoot }
  );
  const sourceGitRoot = await fsPromises.realpath(sourceGitRootOutput.trim());
  const sourceProjectRoot = await fsPromises.realpath(repositoryRoot);
  const projectPrefix = path.relative(sourceGitRoot, sourceProjectRoot);
  const cloneRoot = path.join(temporaryRoot, 'candidate');
  await execFileAsync('git', ['clone', '--quiet', '--no-hardlinks', sourceGitRoot, cloneRoot]);
  const projectRoot = path.join(cloneRoot, projectPrefix);
  const { stdout: revisionOutput } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: cloneRoot });
  return {
    cloneRoot,
    projectRoot,
    projectTreePrefix: projectPrefix.split(path.sep).join('/'),
    revision: revisionOutput.trim()
  };
}

test('candidate runtime is materialized from the frozen Git tree, never mutable worktree bytes', async (/** @type {any} */ context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-frozen-runtime-'));
  context.after(async () => rm(temporaryRoot, { recursive: true, force: true }));
  const clone = await cloneCurrentRepository(temporaryRoot);
  const mutableRunner = path.join(clone.projectRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs');
  await writeFile(mutableRunner, 'throw new Error("worktree tamper executed");\n');

  const runtime = await materializeCandidateRuntime(clone.projectRoot, clone.revision);
  context.after(runtime.cleanup);
  const { stdout: committedRunner } = await execFileAsync(
    'git', ['show', `${clone.revision}:${clone.projectTreePrefix}/skill/generate-test-cases/scripts/test-compiler.mjs`],
    { cwd: clone.cloneRoot, maxBuffer: 64 * 1024 * 1024 }
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

test('candidate runtime rejects committed symlinks inside the installed runtime tree', async (/** @type {any} */ context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-runtime-link-'));
  context.after(async () => rm(temporaryRoot, { recursive: true, force: true }));
  const clone = await cloneCurrentRepository(temporaryRoot);
  const linkPath = path.join(clone.projectRoot, 'skill/generate-test-cases/scripts/unsafe-link');
  await symlink('test-compiler.mjs', linkPath);
  await execFileAsync('git', ['add', 'skill/generate-test-cases/scripts/unsafe-link'], { cwd: clone.projectRoot });
  await execFileAsync('git', [
    '-c', 'user.name=Runtime Test', '-c', 'user.email=runtime-test@example.invalid',
    'commit', '--quiet', '-m', 'test runtime symlink'
  ], { cwd: clone.projectRoot });
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: clone.projectRoot });

  await assert.rejects(materializeCandidateRuntime(clone.projectRoot, stdout.trim()), /missing or unsafe/u);
});
