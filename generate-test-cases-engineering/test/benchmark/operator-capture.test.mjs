import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const entry = path.join(repositoryRoot, 'benchmark/operator-capture.mjs');

test('operator capture starts a fresh witnessed durable run with one JSON reply', async (/** @type {any} */ context) => {
  const workspace = path.join(
    repositoryRoot, 'benchmark/release/v1/operator-work', `.capture-test-${process.pid}`
  );
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  const result = await execFileAsync(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/formal_defect_gate_audit'
  ], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(result.stderr, '');
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.equal(output.status, 'started');
  assert.equal(output.reply.status, 'need_artifact');
  assert.equal(output.reply.stage, 'source_pack');
  const state = JSON.parse(await readFile(path.join(workspace, 'capture-state.json'), 'utf8'));
  assert.equal(state.operator_witness.method, 'operator-observed-codex-subagent-v1');
  assert.equal(state.operator_witness.agent_task_id, '/root/formal_defect_gate_audit');
  assert.equal(state.events.length, 0);
});

test('operator capture refuses an unwitnessed Agent identity', async (/** @type {any} */ context) => {
  const workspace = path.join(
    repositoryRoot, 'benchmark/release/v1/operator-work', `.capture-test-reject-${process.pid}`
  );
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  const result = await execFileAsync(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/unobserved-agent'
  ], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /witnessed Agent task/u);
});

test('operator capture refuses an allowed Agent assigned to another corpus stratum', async (/** @type {any} */ context) => {
  const workspace = path.join(
    repositoryRoot, 'benchmark/release/v1/operator-work', `.capture-test-wrong-assignment-${process.pid}`
  );
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  const result = await execFileAsync(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/time_quota_defect_expansion'
  ], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /witnessed Agent task/u);
});

test('operator capture refuses a worker-edited witness in capture state', async (/** @type {any} */ context) => {
  const workspace = path.join(
    repositoryRoot, 'benchmark/release/v1/operator-work', `.capture-test-state-tamper-${process.pid}`
  );
  context.after(async () => rm(workspace, { recursive: true, force: true }));
  await execFileAsync(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/formal_defect_gate_audit'
  ], { cwd: repositoryRoot });
  const statePath = path.join(workspace, 'capture-state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.operator_witness.agent_task_id = '/root/time_quota_defect_expansion';
  await writeFile(statePath, `${JSON.stringify(state)}\n`);
  const artifactPath = path.join(workspace, 'submission.json');
  await writeFile(artifactPath, '{}\n');

  const result = await execFileAsync(process.execPath, [entry, 'submit', workspace, artifactPath], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /witnessed Agent assignment/u);
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

  const result = await execFileAsync(process.execPath, [
    entry, 'start', workspace, 'PF-TR-01', '1', '/root/formal_defect_gate_audit'
  ], { cwd: repositoryRoot });
  const output = JSON.parse(result.stdout);

  assert.equal(output.status, 'fatal');
  assert.match(output.message, /resolved outside operator-work/u);
});
