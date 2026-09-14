import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  cancelRunV4WithHeldLock, constructCancelRunEventV4,
  createResumeCancelledSiblingV4, readCancelledRunV4,
  replayCancelledRunV4, verifyResumeCancelledSiblingV4
} from '../../src/run-cancellation-v4.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { acquireRunLock } from '../../src/run-store.mjs';

const PHASES = [
  'source_acquisition', 'requirements_analysis', 'execution_closure', 'final_confirmation'
];

/** @param {(catalog:string)=>Promise<void>} operation */
async function withCatalog(operation) {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-cancel-'));
  try { await mkdir(path.join(catalog, 'runs')); await operation(catalog); }
  finally { await rm(catalog, { recursive: true, force: true }); }
}

/** @param {string} catalog @param {string} runId @param {'case_document'|'execution_plan'} intent */
async function createRun(catalog, runId, intent) {
  const directory = path.join(catalog, 'runs', runId);
  await mkdir(directory);
  await ensureV4RunInstance(directory, { run_id: runId, delivery_intent: intent });
  return directory;
}

test('T12 all four cancellable phases commit one idempotent terminal event and preserve prior manifest bytes', async () => {
  await withCatalog(async (catalog) => {
    for (const [index, phase] of PHASES.entries()) {
      const suffix = String(index + 1).repeat(32);
      const runId = `RUN-${suffix.slice(0, 8)}-${suffix.slice(8, 12)}-4${suffix.slice(13, 16)}-8${suffix.slice(17, 20)}-${suffix.slice(20, 32)}`;
      const intent = index < 2 ? 'case_document' : 'execution_plan';
      const directory = await createRun(catalog, runId, intent);
      const manifestText = `${JSON.stringify({ run_id: runId, authority: 'canonical', marker: phase })}\n`;
      await mkdir(path.join(directory, 'output'));
      await writeFile(path.join(directory, 'output/current.json'), manifestText, 'utf8');
      const event = constructCancelRunEventV4({ run_id: runId, phase, phase_version: 3 });
      const release = await acquireRunLock(directory);
      let first;
      try {
        first = await cancelRunV4WithHeldLock(directory, event, release);
        assert.deepEqual(await cancelRunV4WithHeldLock(directory, event, release), first);
      } finally { await release(); }
      assert.equal(first.status, 'cancelled');
      assert.equal(first.phase, phase);
      assert.equal(first.result_kind, 'cancelled');
      assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), manifestText);
      assert.deepEqual(await replayCancelledRunV4(directory, runId), first);
      const record = await readCancelledRunV4(directory);
      assert.ok(record);
      assert.equal(/** @type {any} */ (record).event.event_id, event.event_id);
      assert.equal(/** @type {any} */ (record).prior_manifest.digest.startsWith('sha256:'), true);
    }
  });
});

test('T12 cancelled runs resume only through a canonical new sibling lineage', async () => {
  await withCatalog(async (catalog) => {
    const parentRunId = 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const siblingRunId = 'RUN-bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const parent = await createRun(catalog, parentRunId, 'case_document');
    const event = constructCancelRunEventV4({
      run_id: parentRunId, phase: 'requirements_analysis', phase_version: 0
    });
    const release = await acquireRunLock(parent);
    try { await cancelRunV4WithHeldLock(parent, event, release); }
    finally { await release(); }

    const created = await createResumeCancelledSiblingV4(catalog, {
      parent_run_id: parentRunId, run_id: siblingRunId
    });
    assert.equal(created.run_id, siblingRunId);
    assert.deepEqual(created.lineage, {
      parent_run_id: parentRunId, creation_reason: 'resume_cancelled'
    });
    assert.deepEqual(
      await createResumeCancelledSiblingV4(catalog, {
        parent_run_id: parentRunId, run_id: siblingRunId
      }),
      created
    );
    const siblingDirectory = path.join(catalog, 'runs', siblingRunId);
    assert.deepEqual(
      await verifyResumeCancelledSiblingV4(siblingDirectory, created), created
    );

    const activeRunId = 'RUN-cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    await createRun(catalog, activeRunId, 'case_document');
    await assert.rejects(
      createResumeCancelledSiblingV4(catalog, {
        parent_run_id: activeRunId,
        run_id: 'RUN-dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      }),
      /PARENT_NOT_CANCELLED/u
    );

    const tampered = { ...created, delivery_intent: 'execution_plan' };
    await writeFile(
      path.join(siblingDirectory, 'run-instance.json'),
      `${JSON.stringify(tampered)}\n`,
      'utf8'
    );
    await assert.rejects(
      verifyResumeCancelledSiblingV4(siblingDirectory, tampered),
      /RESUME_CANCELLED_SIBLING_INVALID/u
    );
  });
});
