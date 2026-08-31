import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildScript = path.join(repositoryRoot, 'build/build.mjs');

/** @param {string} cwd @param {string[]} args */
function runBuild(cwd, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildScript, ...args], {
      cwd, stdio: ['ignore', 'pipe', 'pipe']
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

test('full check verifies committed generated artifacts without silently rewriting them', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'));
  assert.match(packageJson.scripts.check, /node build\/build\.mjs --check/u);
  assert.doesNotMatch(packageJson.scripts.check, /npm run build/u);

  const temporary = await mkdtemp(path.join(os.tmpdir(), 'generated-artifact-freshness-'));
  const runnerPath = path.join(temporary, 'skill/generate-test-cases/scripts/test-compiler.mjs');
  try {
    await cp(path.join(repositoryRoot, 'src'), path.join(temporary, 'src'), { recursive: true });
    await mkdir(path.dirname(runnerPath), { recursive: true });
    await cp(
      path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schemas'),
      path.join(temporary, 'skill/generate-test-cases/scripts/schemas'),
      { recursive: true }
    );
    assert.equal((/** @type {any} */ (await runBuild(temporary))).code, 0);
    assert.equal((/** @type {any} */ (await runBuild(temporary, ['--check']))).code, 0);

    const fresh = await readFile(runnerPath, 'utf8');
    await writeFile(runnerPath, `${fresh}\n// stale generated artifact\n`, 'utf8');
    const stale = /** @type {any} */ (await runBuild(temporary, ['--check']));
    assert.equal(stale.code, 1, `${stale.stdout}\n${stale.stderr}`);
    assert.match(stale.stderr, /generated artifact is stale/u);
    assert.match(await readFile(runnerPath, 'utf8'), /stale generated artifact/u);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
