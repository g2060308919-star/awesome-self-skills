import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { actionDigestV5 } from '../../src/v5/storage-records.mjs';
import { readVerifiedRun } from '../../src/v5/run-store.mjs';
import { commitCatalogGenesis, commitNormalRunTransaction } from '../../src/v5/transactions.mjs';

function genesisInput() {
  const identity = {
    kind: 'v5_run_identity', schema_version: '5.0.0', compiler_version: '0.6.0',
    run_id: 'RUN-transaction', delivery_intent: 'case_document', case_document_lineage_id: 'LINEAGE-transaction'
  };
  const checkpoint = {
    kind: 'v5_run_checkpoint', schema_version: '5.0.0', compiler_version: '0.6.0',
    run_id: identity.run_id, case_document_lineage_id: identity.case_document_lineage_id,
    delivery_intent: identity.delivery_intent, run_lifecycle: 'active', current_revision: 0,
    fsm_cell_id: 'cd.active.source.provide', stage: 'source_acquisition', obligation: 'provide_source_pack'
  };
  return {
    identity, checkpoint, selectorSidecar: { kind: 'v5_selector_sidecar', selectors: [] },
    reply: { reply_kind: 'persisted_run_state', status: 'need_artifact', run_id: identity.run_id, current_revision: 0 },
    idempotencyKey: 'create-key', canonicalActionDigest: actionDigestV5('create', { delivery_intent: 'case_document' })
  };
}

test('genesis and normal transactions cross-bind reply, receipt, index, checkpoint, and pointer', async () => {
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-tx-'));
  const created = await commitCatalogGenesis(catalogRoot, genesisInput());
  const initial = await readVerifiedRun(created.runDirectory);
  assert.equal(initial.checkpoint.current_revision, 0);
  assert.equal(initial.transaction.transaction_kind, 'genesis');

  const action = { kind: 'cancel_run', reason: 'stop' };
  const request = { idempotency_key: 'advance-key', action };
  const next = {
    checkpoint: { ...initial.checkpoint, run_lifecycle: 'cancelled', current_revision: 0, fsm_cell_id: 'cd.terminal.cancelled', stage: 'delivery', obligation: 'complete' },
    selectorSidecar: { kind: 'v5_selector_sidecar', selectors: [] },
    reply: { reply_kind: 'persisted_run_state', status: 'cancelled', run_id: initial.identity.run_id, current_revision: 0 },
    commitReceipt: { kind: 'operational_commit', semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'run_cancelled' }
  };
  const first = await commitNormalRunTransaction(created.runDirectory, request, next);
  const replay = await commitNormalRunTransaction(created.runDirectory, request, next);
  assert.deepEqual(replay, first);
  const verified = await readVerifiedRun(created.runDirectory);
  assert.equal(verified.transaction.transaction_sequence, 1);
  assert.equal(verified.receipt.reply_object_ref.reply_digest, verified.transaction.reply_object_digest);
  assert.equal(verified.index.entries[0].receipt_digest, verified.transaction.receipt_digest);

  await assert.rejects(() => commitNormalRunTransaction(created.runDirectory, { ...request, action: { ...action, reason: 'different' } }, next), /IDEMPOTENCY_CONFLICT/u);
  assert.equal((await readVerifiedRun(created.runDirectory)).transaction.transaction_sequence, 1);
});

test('a crash before pointer publication exposes the complete old head', async () => {
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-crash-'));
  const created = await commitCatalogGenesis(catalogRoot, { ...genesisInput(), identity: { ...genesisInput().identity, run_id: 'RUN-crash' }, checkpoint: { ...genesisInput().checkpoint, run_id: 'RUN-crash' }, reply: { ...genesisInput().reply, run_id: 'RUN-crash' } });
  const beforeBytes = await readFile(path.join(created.runDirectory, 'current-transaction.json'));
  const current = await readVerifiedRun(created.runDirectory);
  await assert.rejects(() => commitNormalRunTransaction(created.runDirectory, { idempotency_key: 'crash-key', action: { kind: 'cancel_run', reason: 'crash' } }, {
    checkpoint: { ...current.checkpoint, current_revision: 0 }, selectorSidecar: { kind: 'v5_selector_sidecar', selectors: [] },
    reply: { ...current.reply, current_revision: 0 }, commitReceipt: { kind: 'operational_commit', semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'idempotency_only' }
  }, { failAt: 'before_pointer_publish' }), /INJECTED_CRASH/u);
  assert.deepEqual(await readFile(path.join(created.runDirectory, 'current-transaction.json')), beforeBytes);
  assert.equal((await readVerifiedRun(created.runDirectory)).checkpoint.current_revision, 0);
});
