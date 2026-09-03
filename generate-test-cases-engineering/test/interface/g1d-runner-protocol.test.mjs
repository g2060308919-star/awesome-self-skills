import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runnerPath = path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs'
);
const revisionPath = path.join(
  repositoryRoot, 'test/fixtures/recovery/grounded-revision.json'
);

/** @param {string[]} args @param {string} cwd */
function runBundle(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, ...args], {
      cwd, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

/** @param {string} stdout */
function parseOneLine(stdout) {
  assert.equal(stdout.endsWith('\n'), true, 'runner reply must end with one newline');
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, 'runner must write exactly one stdout JSON line');
  return JSON.parse(lines[0]);
}

/** @param {string} directory @param {string} [prefix] */
async function directorySnapshot(directory, prefix = '') {
  /** @type {Array<[string,string]>} */
  const snapshot = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return snapshot;
    }
    throw error;
  }
  entries.sort((/** @type {any} */ left, /** @type {any} */ right) =>
    left.name.localeCompare(right.name, 'en'));
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      snapshot.push([`${relative}/`, '<directory>']);
      snapshot.push(...await directorySnapshot(absolute, relative));
    } else {
      snapshot.push([relative, (await readFile(absolute)).toString('base64')]);
    }
  }
  return snapshot;
}

test('runner entry dynamic import exposes only advanceStrict and has zero process or run side effects', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-import-run-'));
  const revision = JSON.parse(await readFile(revisionPath, 'utf8'));
  await mkdir(path.join(runDirectory, 'staging'));
  await writeFile(
    path.join(runDirectory, 'staging/source-pack.json'),
    `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
  );
  const runBefore = await directorySnapshot(runDirectory);
  const probe = `
    import { readdir } from 'node:fs/promises';
    const runDirectory = ${JSON.stringify(runDirectory)};
    const runnerUrl = ${JSON.stringify(pathToFileURL(runnerPath).href)};
    process.argv.splice(0, process.argv.length, process.execPath, 'import-probe', runDirectory);
    const argvBefore = JSON.stringify(process.argv);
    const exitCodeBefore = process.exitCode ?? null;
    const nativeStdout = process.stdout.write.bind(process.stdout);
    const nativeStderr = process.stderr.write.bind(process.stderr);
    let importedStdout = '';
    let importedStderr = '';
    process.stdout.write = (chunk) => { importedStdout += String(chunk); return true; };
    process.stderr.write = (chunk) => { importedStderr += String(chunk); return true; };
    const imported = await import(runnerUrl);
    const entries = (await readdir(runDirectory)).sort();
    const result = {
      exports: Object.keys(imported).sort(),
      importedStdout,
      importedStderr,
      exitCodeBefore,
      exitCodeAfter: process.exitCode ?? null,
      argvUnchanged: JSON.stringify(process.argv) === argvBefore,
      runEntries: entries
    };
    process.stdout.write = nativeStdout;
    process.stderr.write = nativeStderr;
    nativeStdout(JSON.stringify(result) + '\\n');
  `;
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '--eval', probe], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
      child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (/** @type {number|null} */ code) => {
        resolve({ code, stdout, stderr });
      });
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.deepEqual({
      probe: parseOneLine(result.stdout),
      runSnapshot: await directorySnapshot(runDirectory)
    }, {
      probe: {
        exports: ['advanceStrict'], importedStdout: '', importedStderr: '',
        exitCodeBefore: null, exitCodeAfter: null, argvUnchanged: true,
        runEntries: ['staging']
      },
      runSnapshot: runBefore
    });
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('runner zero user arguments return RUNNER_ARGUMENTS_INVALID without filesystem writes', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'g1d-zero-argv-'));
  try {
    const before = await directorySnapshot(cwd);
    const result = /** @type {any} */ (await runBundle([], cwd));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const reply = parseOneLine(result.stdout);
    assert.equal(reply.status, 'fatal');
    assert.deepEqual(reply.diagnostics.map((/** @type {any} */ item) => item.code), [
      'RUNNER_ARGUMENTS_INVALID'
    ]);
    assert.deepEqual(await directorySnapshot(cwd), before);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('runner two or more user arguments return RUNNER_ARGUMENTS_INVALID without consuming staging', async (/** @type {any} */ t) => {
  for (const extraArguments of [['extra'], ['extra', 'third']]) {
    await t.test(`${extraArguments.length + 1} user arguments`, async () => {
      const cwd = await mkdtemp(path.join(os.tmpdir(), 'g1d-extra-argv-cwd-'));
      const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-extra-argv-run-'));
      const revision = JSON.parse(await readFile(revisionPath, 'utf8'));
      try {
        await mkdir(path.join(runDirectory, 'staging'));
        await writeFile(
          path.join(runDirectory, 'staging/source-pack.json'),
          `${JSON.stringify(revision.source_pack)}\n`, 'utf8'
        );
        const before = await directorySnapshot(runDirectory);
        const result = /** @type {any} */ (
          await runBundle([runDirectory, ...extraArguments], cwd)
        );
        assert.equal(result.code, 0, result.stderr);
        assert.equal(result.stderr, '');
        const reply = parseOneLine(result.stdout);
        assert.equal(reply.status, 'fatal');
        assert.deepEqual(reply.diagnostics.map((/** @type {any} */ item) => item.code), [
          'RUNNER_ARGUMENTS_INVALID'
        ]);
        assert.deepEqual(await directorySnapshot(runDirectory), before);
      } finally {
        await rm(cwd, { recursive: true, force: true });
        await rm(runDirectory, { recursive: true, force: true });
      }
    });
  }
});

test('runner one absolute user argument starts the normal workflow', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'g1d-one-argv-cwd-'));
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d one 参数-'));
  try {
    const result = /** @type {any} */ (await runBundle([runDirectory], cwd));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const reply = parseOneLine(result.stdout);
    assert.match(reply.scope.run_instance_id, /^RUN-[0-9a-f-]{36}$/u);
    assert.deepEqual({ ...reply, scope: { source_revision: reply.scope.source_revision } }, {
      status: 'need_artifact', stage: 'source_pack',
      schema_ref: 'source-pack.schema.json', scope: { source_revision: 0 }, diagnostics: []
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('runner symlink main remains directly executable with preserve-symlinks-main', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'g1d-symlink-main-cwd-'));
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'g1d-symlink-main-run-'));
  const linkedRunner = path.join(cwd, 'linked-test-compiler.mjs');
  try {
    await symlink(runnerPath, linkedRunner);
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--preserve-symlinks-main', linkedRunner, runDirectory],
        { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
      child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
      child.on('error', reject);
      child.on('close', (/** @type {number|null} */ code) => {
        resolve({ code, stdout, stderr });
      });
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const reply = parseOneLine(result.stdout);
    assert.match(reply.scope.run_instance_id, /^RUN-[0-9a-f-]{36}$/u);
    assert.deepEqual({ ...reply, scope: { source_revision: reply.scope.source_revision } }, {
      status: 'need_artifact', stage: 'source_pack',
      schema_ref: 'source-pack.schema.json', scope: { source_revision: 0 }, diagnostics: []
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('runner one relative user argument keeps run_directory_absolute and writes nothing', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'g1d-relative-argv-'));
  try {
    const before = await directorySnapshot(cwd);
    const result = /** @type {any} */ (await runBundle(['relative-run'], cwd));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    const reply = parseOneLine(result.stdout);
    assert.equal(reply.status, 'fatal');
    assert.deepEqual(reply.diagnostics.map((/** @type {any} */ item) => item.code), [
      'run_directory_absolute'
    ]);
    assert.deepEqual(await directorySnapshot(cwd), before);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('runner one nonexistent absolute run directory fails without creating it', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'g1d-nonexistent-parent-'));
  const runDirectory = path.join(parent, '不存在 run with spaces');
  try {
    const result = /** @type {any} */ (await runBundle([runDirectory], parent));
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(parseOneLine(result.stdout).status, 'fatal');
    await assert.rejects(stat(runDirectory));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
