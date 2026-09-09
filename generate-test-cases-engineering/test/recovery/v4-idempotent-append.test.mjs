import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  commitRevisionTransactionV4, ensureV4RunInstance, readRevisionTransactionV4
} from '../../src/revision-transaction-v4.mjs';
import {
  appendRequest, revisionArtifacts, sha, withRun
} from '../helpers/v4-revision-transaction-fixture.mjs';

test('T10 identical append replay is byte-stable and a changed digest conflicts atomically', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const request = appendRequest('final', null, 0, { run_id: run.run_id, append_id: 'APPEND-stable' });
    const first = await commitRevisionTransactionV4(directory, request);
    const receiptPath = path.join(directory, 'transactions/appends', `${first.append_key}.json`);
    const receiptBytes = await readFile(receiptPath, 'utf8');
    const checkpointBytes = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const currentBytes = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const replay = await commitRevisionTransactionV4(directory, structuredClone(request));
    assert.deepEqual(replay, first);
    assert.equal(await readFile(receiptPath, 'utf8'), receiptBytes);
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), checkpointBytes);
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), currentBytes);

    const conflict = { ...request, append_digest: sha('different-event') };
    await assert.rejects(commitRevisionTransactionV4(directory, conflict), /APPEND_DIGEST_CONFLICT/);
    assert.equal(await readFile(receiptPath, 'utf8'), receiptBytes);
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), checkpointBytes);
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), currentBytes);
  });
});

test('T10 semantic no-op does not allocate a revision or replace an existing delivery manifest', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const semantic = sha('same-semantics');
    await commitRevisionTransactionV4(directory, appendRequest('final', null, 0, {
      run_id: run.run_id, semantic_digest: semantic
    }));
    const checkpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
    const current = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const noOp = await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', 0, 1, {
      run_id: run.run_id, append_id: 'APPEND-no-op', semantic_digest: semantic,
      base_checkpoint_text: checkpoint
    }));
    assert.equal(noOp.status, 'no_op');
    assert.equal(noOp.committed_revision, 0);
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), checkpoint);
    assert.equal(await readFile(path.join(directory, 'output/current.json'), 'utf8'), current);
  });
});

test('T10 concurrent duplicate appends converge to one transaction and one receipt', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const request = appendRequest('pre_case_pending', null, 0, {
      run_id: run.run_id, append_id: 'APPEND-concurrent'
    });
    const results = await Promise.all(Array.from({ length: 4 }, () =>
      commitRevisionTransactionV4(directory, structuredClone(request))));
    assert.equal(new Set(results.map((result) => result.txn_id)).size, 1);
    assert.equal(new Set(results.map((result) => JSON.stringify(result))).size, 1);
    assert.equal((await readRevisionTransactionV4(directory, results[0].txn_id)).phase, 'complete');
  });
});

test('T10 an uncommitted candidate can be repaired without changing append identity', async () => {
  await withRun(async (/** @type {string} */ directory) => {
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document' });
    const request = appendRequest('pre_case_pending', null, 0, {
      run_id: run.run_id, append_id: 'APPEND-repair'
    });
    await assert.rejects(commitRevisionTransactionV4(directory, request, {
      after_phase(phase) { if (phase === 'reserved') throw new Error('VALIDATION_INTERRUPTED'); }
    }), /VALIDATION_INTERRUPTED/);
    const repairedArtifacts = revisionArtifacts('pre_case_pending', 0, { run_id: run.run_id });
    repairedArtifacts.source_pack.value.run_scope = 'repaired-scope';
    const repaired = await commitRevisionTransactionV4(directory, {
      ...request, artifacts: repairedArtifacts, repair_pending: true
    });
    assert.equal(repaired.status, 'committed');
    assert.equal(repaired.append_id, request.append_id);
    assert.equal(repaired.append_digest, request.append_digest);
  });
});
