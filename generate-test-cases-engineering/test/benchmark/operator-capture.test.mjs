import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = path.join(repositoryRoot, 'benchmark/operator-capture.mjs');

/** @param {string} executable @param {string[]} args @param {any} [options] */
async function execFileResult(executable, args, options) {
  try {
    const result = await execFileAsync(executable, args, options);
    return { ...result, exitCode: 0 };
  } catch (error) {
    const failure = /** @type {any} */ (error);
    return { stdout: failure.stdout ?? '', stderr: failure.stderr ?? '', exitCode: failure.code };
  }
}

/** @param {any} context */
async function cleanCaptureRepository(context) {
  const root = await fsPromises.realpath(await mkdtemp(path.join(os.tmpdir(), 'operator-capture-repository-')));
  context.after(async () => rm(root, { recursive: true, force: true }));
  for (const directory of [
    'benchmark/public-pilot/v1', 'benchmark/release/v1', 'skill/generate-test-cases/scripts/schemas',
    'src'
  ]) await mkdir(path.join(root, directory), { recursive: true });
  for (const filename of [
    'benchmark/operator-capture.mjs', 'benchmark/candidate-binding.mjs',
    'benchmark/candidate-runtime.mjs', 'benchmark/operator-witness.mjs',
    'benchmark/cli-exit-code.mjs'
  ]) {
    await fsPromises.copyFile(path.join(repositoryRoot, filename), path.join(root, filename));
  }
  await writeFile(path.join(root, '.gitignore'), 'benchmark/release/v1/operator-work/\n');
  await writeFile(path.join(root, 'benchmark/release/v1/manifest.json'), '{}\n');
  await writeFile(path.join(root, 'benchmark/public-pilot/v1/catalog.json'), `${JSON.stringify({
    items: [{
      pilot_id: 'PF-TR-01', status: 'pilot-admitted',
      source: { sha256: 'a'.repeat(64) }, task: { sha256: 'b'.repeat(64) }
    }]
  })}\n`);
  await writeFile(path.join(root, 'src/compiler.mjs'), 'export const fixture = true;\n');
  await writeFile(path.join(root, 'skill/generate-test-cases/SKILL.md'), '# Fixture\n');
  await writeFile(path.join(root, 'skill/generate-test-cases/scripts/schema-manifest.json'), '{}\n');
  await writeFile(path.join(root, 'skill/generate-test-cases/scripts/schemas/fixture.schema.json'), '{}\n');
  await writeFile(path.join(root, 'skill/generate-test-cases/scripts/schemas/reply.schema.json'), '{}\n');
  await writeFile(path.join(root, 'skill/generate-test-cases/scripts/schemas/test-bundle.schema.json'), '{}\n');
  await writeFile(path.join(root, 'skill/generate-test-cases/scripts/test-compiler.mjs'), `
import { access } from 'node:fs/promises';
import path from 'node:path';
const runDirectory = process.argv[2];
let staged = false;
try { await access(path.join(runDirectory, 'staging/source-pack.json')); staged = true; } catch {}
process.stdout.write(JSON.stringify(staged
  ? { status: 'need_artifact', stage: 'evidence_claims' }
  : { status: 'need_artifact', stage: 'source_pack' }) + '\\n');
`);
  await execFileAsync('git', ['init', '-q'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Capture Test'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'capture@example.invalid'], { cwd: root });
  await execFileAsync('git', ['add', '.'], { cwd: root });
  await execFileAsync('git', ['commit', '-qm', 'fixture'], { cwd: root });
  return {
    root,
    entry: path.join(root, 'benchmark/operator-capture.mjs'),
    workspace: path.join(root, 'benchmark/release/v1/operator-work/capture')
  };
}

test('operator capture starts a fresh witnessed durable run with one JSON reply', async (/** @type {any} */ context) => {
  const fixture = await cleanCaptureRepository(context);
  const { workspace } = fixture;
  const result = await execFileResult(process.execPath, [
    fixture.entry, 'start', workspace, 'PF-TR-01', '1', '/root/v4_pressure_transactions_identity'
  ], { cwd: fixture.root });
  const output = JSON.parse(result.stdout);

  assert.equal(result.stderr, '');
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.equal(output.status, 'started');
  assert.equal(output.reply.status, 'need_artifact');
  assert.equal(output.reply.stage, 'source_pack');
  const state = JSON.parse(await readFile(path.join(workspace, 'capture-state.json'), 'utf8'));
  assert.equal(state.operator_witness.method, 'operator-observed-codex-subagent-v1');
  assert.equal(state.operator_witness.agent_task_id, '/root/v4_pressure_transactions_identity');
  assert.equal(state.events.length, 0);
});

test('operator capture refuses an unwitnessed Agent identity', async (/** @type {any} */ context) => {
  const workspace = path.join(
    repositoryRoot, 'benchmark/release/v1/operator-work', `.capture-test-reject-${process.pid}`
  );
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  const result = await execFileResult(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/unobserved-agent'
  ], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(result.exitCode, 1);
  assert.equal(output.status, 'fatal');
  assert.match(output.message, /witnessed Agent task/u);
});

test('operator capture refuses an allowed Agent assigned to another corpus stratum', async (/** @type {any} */ context) => {
  const workspace = path.join(
    repositoryRoot, 'benchmark/release/v1/operator-work', `.capture-test-wrong-assignment-${process.pid}`
  );
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  const result = await execFileResult(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/v4_pressure_workflow_forms'
  ], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /witnessed Agent task/u);
});

test('operator capture refuses a worker-edited witness in capture state', async (/** @type {any} */ context) => {
  const fixture = await cleanCaptureRepository(context);
  const { workspace } = fixture;
  await execFileAsync(process.execPath, [
    fixture.entry, 'start', workspace, 'PF-TR-01', '1', '/root/v4_pressure_transactions_identity'
  ], { cwd: fixture.root });
  const statePath = path.join(workspace, 'capture-state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.operator_witness.agent_task_id = '/root/v4_pressure_workflow_forms';
  await writeFile(statePath, `${JSON.stringify(state)}\n`);
  const artifactPath = path.join(workspace, 'submission.json');
  await writeFile(artifactPath, '{}\n');

  const result = await execFileResult(process.execPath, [
    fixture.entry, 'submit', workspace, artifactPath
  ], { cwd: fixture.root });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /witnessed Agent assignment/u);
});

test('operator capture start refuses a dirty candidate worktree', async (/** @type {any} */ context) => {
  const fixture = await cleanCaptureRepository(context);
  await writeFile(path.join(fixture.root, 'src/compiler.mjs'), 'export const fixture = false;\n');

  const result = await execFileResult(process.execPath, [
    fixture.entry, 'start', fixture.workspace, 'PF-TR-01', '1',
    '/root/v4_pressure_transactions_identity'
  ], { cwd: fixture.root });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /clean candidate binding/u);
});

test('operator capture submit refuses candidate worktree drift after start', async (/** @type {any} */ context) => {
  const fixture = await cleanCaptureRepository(context);
  await execFileAsync(process.execPath, [
    fixture.entry, 'start', fixture.workspace, 'PF-TR-01', '1',
    '/root/v4_pressure_transactions_identity'
  ], { cwd: fixture.root });
  await writeFile(path.join(fixture.root, 'src/compiler.mjs'), 'export const fixture = false;\n');
  const artifactPath = path.join(fixture.workspace, 'submission.json');
  await writeFile(artifactPath, '{}\n');

  const result = await execFileResult(process.execPath, [
    fixture.entry, 'submit', fixture.workspace, artifactPath
  ], { cwd: fixture.root });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /candidate binding/u);
});

test('operator capture submit refuses a worker-edited runtime revision', async (/** @type {any} */ context) => {
  const fixture = await cleanCaptureRepository(context);
  await execFileAsync(process.execPath, [
    fixture.entry, 'start', fixture.workspace, 'PF-TR-01', '1',
    '/root/v4_pressure_transactions_identity'
  ], { cwd: fixture.root });
  const statePath = path.join(fixture.workspace, 'capture-state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.runtime_revision = '0'.repeat(40);
  await writeFile(statePath, `${JSON.stringify(state)}\n`);
  const artifactPath = path.join(fixture.workspace, 'submission.json');
  await writeFile(artifactPath, '{}\n');

  const result = await execFileResult(process.execPath, [
    fixture.entry, 'submit', fixture.workspace, artifactPath
  ], { cwd: fixture.root });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /candidate binding/u);
});

test('operator capture submit refuses worker-edited candidate artifact digests', async (/** @type {any} */ context) => {
  const fixture = await cleanCaptureRepository(context);
  await execFileAsync(process.execPath, [
    fixture.entry, 'start', fixture.workspace, 'PF-TR-01', '1',
    '/root/v4_pressure_transactions_identity'
  ], { cwd: fixture.root });
  const statePath = path.join(fixture.workspace, 'capture-state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.artifact_digests.skill = '0'.repeat(64);
  await writeFile(statePath, `${JSON.stringify(state)}\n`);
  const artifactPath = path.join(fixture.workspace, 'submission.json');
  await writeFile(artifactPath, '{}\n');

  const result = await execFileResult(process.execPath, [
    fixture.entry, 'submit', fixture.workspace, artifactPath
  ], { cwd: fixture.root });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /candidate binding/u);
});

test('operator capture refuses a workspace whose ancestor resolves outside operator-work', async (/** @type {any} */ context) => {
  const external = await mkdtemp(path.join(os.tmpdir(), 'capture-workspace-external-'));
  const linkPath = path.join(
    repositoryRoot, 'benchmark/release/v1/operator-work', `.capture-test-parent-link-${process.pid}`
  );
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(external, linkPath);
  context.after(async () => {
    await rm(linkPath, { force: true });
    await rm(external, { recursive: true, force: true });
  });
  const workspace = path.join(linkPath, 'capture');

  const result = await execFileResult(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/v4_pressure_transactions_identity'
  ], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /resolved outside operator-work/u);
});
