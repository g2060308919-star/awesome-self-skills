import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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
const unsupportedRuntimePreloadPath = path.join(
  repositoryRoot,
  'test/fixtures/unsupported-node-runtime.cjs'
);
const groundedRevisionPath = path.join(
  repositoryRoot,
  'test/fixtures/recovery/grounded-revision.json'
);

/**
 * @param {string} runDirectory
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {Promise<{code: number | null, stdout: string, stderr: string}>}
 */
function runCompiler(runDirectory, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, runDirectory], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...options.env }
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

test('installed runner accepts the requested source pack after an initial empty invocation', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    const initial = await runCompiler(runDirectory);
    assert.deepEqual(parseSingleJsonValue(initial.stdout), emptyRunReply);

    const revision = JSON.parse(await readFile(groundedRevisionPath, 'utf8'));
    await mkdir(path.join(runDirectory, 'staging'));
    await writeFile(
      path.join(runDirectory, 'staging/source-pack.json'),
      `${JSON.stringify(revision.source_pack)}\n`,
      'utf8'
    );
    const advanced = await runCompiler(runDirectory);

    assert.equal(advanced.code, 0, advanced.stderr);
    assert.deepEqual(parseSingleJsonValue(advanced.stdout), {
      status: 'need_artifact', stage: 'evidence_claims',
      schema_ref: 'evidence-claims.schema.json',
      scope: { source_revision: 0 }, diagnostics: []
    });
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

test('unsupported runtime returns a fatal JSON reply', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'test-compiler-'));
  try {
    const result = await runCompiler(runDirectory, {
      env: { NODE_OPTIONS: `--require ${unsupportedRuntimePreloadPath}` }
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(parseSingleJsonValue(result.stdout).status, 'fatal');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
