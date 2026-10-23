import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canonicalStringify } from '../../src/canonical.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import { advanceStrict } from '../../src/entry.mjs';
import { acquireRunLock } from '../../src/run-store.mjs';
import { commitRevisionTransactionV4, ensureV4RunInstance, recoverMaterializedRevisionV4WithHeldLock } from '../../src/revision-transaction-v4.mjs';
import { appendRequest, sha, withRun } from '../helpers/v4-revision-transaction-fixture.mjs';

for (const mode of ['initial', 'new_revision', 'profile_promotion']) {
  for (const phase of ['reserved_materialized', 'artifacts_committed', 'checkpoint_committed', 'delivery_committed']) {
    test(`public runner completes ${mode} final transaction interrupted at ${phase}`, async () => {
      await withRun(async directory => {
        const contract = latestV4Contract();
        const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document', contract });
        const semantic = sha(`recovery-${mode}`);
        if (mode !== 'initial') await commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', null, 0, {
          run_id: run.run_id, contract, semantic_digest: mode === 'profile_promotion' ? semantic : sha('previous-semantic')
        }));
        const revision = mode === 'new_revision' ? 1 : 0;
        const request = appendRequest('final', mode === 'initial' ? null : 0, revision, {
          run_id: run.run_id, contract, semantic_digest: semantic, append_id: `APPEND-recovered-final-${mode}`,
          ...(mode === 'initial' ? {} : { base_checkpoint_text: await readFile(path.join(directory, 'checkpoint.json'), 'utf8') })
        });
        let reservedBytes;
        await assert.rejects(commitRevisionTransactionV4(directory, request, { async after_phase(reached) {
          if (reached === 'reserved') reservedBytes = await readFile(path.join(directory, 'staging/pending-revision.json'));
          if (reached === (phase === 'reserved_materialized' ? 'artifacts_committed' : phase)) throw new Error('INJECTED_MATERIALIZED_INTERRUPTION');
        } }), /INJECTED_MATERIALIZED_INTERRUPTION/);
        if (phase === 'reserved_materialized') await writeFile(path.join(directory, 'staging/pending-revision.json'), reservedBytes);
        const reply = await advanceStrict(directory);
        assert.equal(reply.status, 'finished', JSON.stringify(reply));
        await assert.rejects(readFile(path.join(directory, 'staging/pending-revision.json')), { code: 'ENOENT' });
        const manifest = JSON.parse(await readFile(path.join(directory, 'output/current.json')));
        assert.equal(manifest.revision, revision);
        const journals = JSON.parse(await readFile(path.join(directory, 'transactions/committed', `r${String(revision).padStart(3, '0')}.json`)));
        const transaction = JSON.parse(await readFile(path.join(directory, 'transactions/revisions', `${journals.txn_id}.json`)));
        assert.equal(transaction.phase, 'complete');
        assert.equal(transaction.result.status, 'committed');
        assert.deepEqual(await advanceStrict(directory), reply);
      });
    });
  }
}

test('reserved transaction without all materialized artifacts remains available for deterministic compilation', async () => {
  await withRun(async directory => {
    const contract = latestV4Contract();
    const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document', contract });
    await assert.rejects(commitRevisionTransactionV4(directory, appendRequest('pre_case_pending', null, 0, {
      run_id: run.run_id, contract
    }), { after_phase(phase) { if (phase === 'reserved') throw new Error('INJECTED_RESERVED'); } }), /INJECTED_RESERVED/);
    const pending = await readFile(path.join(directory, 'staging/pending-revision.json'));
    const release = await acquireRunLock(directory);
    try { assert.equal(await recoverMaterializedRevisionV4WithHeldLock(directory, release), null); }
    finally { await release(); }
    assert.deepEqual(await readFile(path.join(directory, 'staging/pending-revision.json')), pending);
  });
});

for (const corruption of ['missing_artifact', 'invalid_utf8', 'wrong_identity', 'wrong_base']) {
  test(`public recovery rejects ${corruption} before final publication`, async () => {
    await withRun(async directory => {
      const contract = latestV4Contract();
      const run = await ensureV4RunInstance(directory, { delivery_intent: 'case_document', contract });
      await assert.rejects(commitRevisionTransactionV4(directory, appendRequest('final', null, 0, {
        run_id: run.run_id, contract
      }), { after_phase(phase) { if (phase === 'artifacts_committed') throw new Error('INJECTED_ARTIFACTS'); } }), /INJECTED_ARTIFACTS/);
      if (corruption === 'missing_artifact') await rm(path.join(directory, 'derived/r000/fact-ledger.json'));
      if (corruption === 'invalid_utf8') await writeFile(path.join(directory, 'derived/r000/fact-ledger.json'), new Uint8Array([0xc0, 0x80]));
      if (corruption === 'wrong_identity' || corruption === 'wrong_base') {
        const target = path.join(directory, 'staging/pending-revision.json');
        const pending = JSON.parse(await readFile(target));
        if (corruption === 'wrong_identity') pending.txn_id = `TXN-${'a'.repeat(64)}`;
        else pending.previous_checkpoint_digest = sha('foreign-base');
        await writeFile(target, `${canonicalStringify(pending)}\n`);
      }
      const reply = await advanceStrict(directory);
      assert.equal(reply.status, 'fatal', JSON.stringify(reply));
      await assert.rejects(readFile(path.join(directory, 'output/current.json')), { code: 'ENOENT' });
      assert.ok(await readFile(path.join(directory, 'staging/pending-revision.json')));
    });
  });
}
