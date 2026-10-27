import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { initializeRun, recordEvent, resumeCheck, generateReport, validateRun } from '../scripts/run-artifacts.mjs';

const fixture = new URL('./fixtures/test-cases.json', import.meta.url);
const execute = promisify(execFile);
const cli = fileURLToPath(new URL('../scripts/run-artifacts.mjs', import.meta.url));
const retired = ['permission-batches-html-v1', 'permission-batches-html-v2', 'permission-batches-html-v3'];
async function withRoot(fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'runner-current-contract-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}
async function bytes(root) {
  const entries = [];
  async function visit(dir) {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) await visit(full);
      else entries.push([path.relative(root, full), (await readFile(full)).toString('base64')]);
    }
  }
  await visit(root);
  return entries.sort((a, b) => a[0].localeCompare(b[0]));
}

test('R02 A03: omitted workflow selects the unique current workflow and both capabilities without inventing authorization', async () => {
  await withRoot(async root => {
    const run = await initializeRun({ workspaceRoot: root, casesPath: fixture });
    const log = JSON.parse(await readFile(path.join(run.runRoot, 'execution-log.json'), 'utf8'));
    assert.deepEqual(log.events.map(event => [event.type, event.profile]), [['workflow_profile', 'b2b-e2e-current']]);
    assert.deepEqual(log.extensions, { execution_coverage: { schema_version: '1.0' }, mock_fallback: { schema_version: '1.0' } });
    assert.equal(log.events.some(event => event.type === 'mock_policy'), false);
  });
});

test('R02 A03: retired workflow arguments reject before creating any Run files', async () => {
  await withRoot(async root => {
    const before = await bytes(root);
    for (const workflowProfile of retired) {
      await assert.rejects(initializeRun({ workspaceRoot: root, casesPath: fixture, workflowProfile }), error => error.code === 'INPUT_CONTRACT');
      assert.deepEqual(await bytes(root), before);
    }
  });
});

test('R02 A03: validation, append, resume and report reject retired or unprofiled Runs without touching their bytes', async () => {
  for (const workflow of [...retired, null]) {
    await withRoot(async root => {
      const run = await initializeRun({ workspaceRoot: root, casesPath: fixture });
      const logPath = path.join(run.runRoot, 'execution-log.json');
      const log = JSON.parse(await readFile(logPath, 'utf8'));
      log.events = workflow ? [{ type: 'workflow_profile', profile: workflow, sequence: 1, at: log.run.started_at }] : [];
      delete log.extensions;
      await writeFile(logPath, JSON.stringify(log, null, 2) + '\n');
      const before = await bytes(run.runRoot);
      for (const action of [
        () => validateRun(run.runRoot),
        () => recordEvent(run.runRoot, { type: 'note', description: 'must not append to retired data' }),
        () => resumeCheck(run.runRoot),
        () => generateReport(run.runRoot)
      ]) {
        await assert.rejects(action, error => error.code === 'UNSUPPORTED_WORKFLOW' && /workflow|流程|旧|支持/i.test(error.message));
        assert.deepEqual(await bytes(run.runRoot), before);
      }
    });
  }
});

test('R02: retired activity and cross-Run retake commands reject without mutating either Run', async () => {
  await withRoot(async root => {
    const current = await initializeRun({ workspaceRoot: root, casesPath: fixture });
    const original = await initializeRun({ workspaceRoot: root, casesPath: fixture });
    const before = await bytes(root);
    for (const command of ['activity-start', 'activity-end', 'activity-complete', 'link-retake']) {
      await assert.rejects(execute(process.execPath, [cli, command, '--run', current.runRoot, '--parent', original.runRoot]), error => {
        assert.equal(error.code, 2);
        assert.equal(error.stderr, '');
        const output = JSON.parse(error.stdout);
        assert.equal(output.ok, false);
        assert.equal(output.error.code, 'INPUT_CONTRACT');
        assert.match(output.error.message, /命令|退役|不支持/u);
        return true;
      });
      assert.deepEqual(await bytes(root), before);
    }
  });
});

test('R02: generic append cannot smuggle retired activity or cross-Run retake events into the current workflow', async () => {
  await withRoot(async root => {
    const run = await initializeRun({ workspaceRoot: root, casesPath: fixture });
    await recordEvent(run.runRoot, { type: 'permission_plan', version: '1.0', groups: [], role_independent_case_ids: ['CASE-原始-01'] });
    const before = await bytes(run.runRoot);
    for (const type of ['activity_start', 'activity_end', 'activity_complete', 'retake_link']) {
      await assert.rejects(recordEvent(run.runRoot, { type }), error => /退役|不支持|未知|旧|允许/u.test(error.message));
      assert.deepEqual(await bytes(run.runRoot), before);
    }
  });
});
