import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);
const runnerPath = path.join(
  repositoryRoot,
  'skill/generate-test-cases/scripts/test-compiler.mjs'
);

/**
 * @param {string} runDirectory
 * @returns {Promise<{code: number | null, stdout: string, stderr: string}>}
 */
function runCompiler(runDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, runDirectory], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number | null} */ code) => resolve({ code, stdout, stderr }));
  });
}

/** @param {string} stdout */
function parseSingleJsonValue(stdout) {
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, 'stdout must contain exactly one JSON value');
  return JSON.parse(lines[0]);
}

const emptyRunReply = {
  status: 'need_artifact',
  stage: 'source_pack',
  schema_ref: 'source-pack.schema.json',
  scope: { source_revision: 0 },
  diagnostics: []
};

test('empty run returns the source-pack artifact request', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    const result = await runCompiler(runDirectory);

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(parseSingleJsonValue(result.stdout), emptyRunReply);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('absolute run directory is required and a relative path does not write files', async () => {
  const relativeRunDirectory = 'relative-test-compiler-run';
  const result = await runCompiler(relativeRunDirectory);

  assert.equal(result.code, 0, result.stderr);
  assert.equal(parseSingleJsonValue(result.stdout).status, 'fatal');
  await assert.rejects(readdir(path.join(repositoryRoot, relativeRunDirectory)));
});
