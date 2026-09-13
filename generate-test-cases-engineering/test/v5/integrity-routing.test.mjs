import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceV5Run, createV5RunDirectory, inspectV5Run } from '../../src/entry.mjs';
import { readVerifiedRun } from '../../src/v5/run-store.mjs';
import { digestFilename } from '../../src/v5/storage-paths.mjs';

process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY = Buffer.alloc(32, 11).toString('base64');
process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID = 'integrity-test-key';

/** @param {string} prefix */
async function createSourceRun(prefix) {
  const catalog = await mkdtemp(path.join(os.tmpdir(), prefix));
  const created = await createV5RunDirectory(catalog, {
    idempotency_key: 'create',
    delivery_intent: 'case_document',
    source_bootstrap: {
      source_request_seeds: [{
        source_request_client_key: 'prd',
        source_role: 'primary_prd',
        locator: { kind: 'inline_text', media_type: 'text/markdown', content: '提交后保存订单，并显示成功提示。' },
        required: true
      }]
    }
  });
  const sourceRequest = created.work_packet.source_requests[0];
  const selector = created.available_actions.find((/** @type {Record<string,any>} */ item) => item.capability.kind === 'submit_source_batch');
  const sourceAction = {
    kind: 'submit_source_batch',
    action_token: selector.action_token,
    request_ids: [sourceRequest.request_id],
    request_dispositions: [{ request_id: sourceRequest.request_id, outcome: 'fulfilled', source_client_keys: ['prd'] }],
    source_payload: { kind: 'fulfilled_sources', source_pack: { sources: [{ source_client_key: 'prd', media_type: 'text/markdown', content: '提交后保存订单，并显示成功提示。' }] } }
  };
  const sourceRequestValue = { idempotency_key: 'source', action: sourceAction };
  const advanced = await advanceV5Run(created.run_directory, sourceRequestValue);
  return { created, advanced, sourceAction, sourceRequestValue };
}

test('accepted-closure tamper stays read-only for inspect, replays first, and normal-fatalizes a new key', async () => {
  const { created, advanced, sourceAction, sourceRequestValue } = await createSourceRun('gtc-v5-closure-integrity-');
  const before = await readVerifiedRun(created.run_directory);
  const pointerBefore = await readFile(before.layout.currentPointer);
  const acceptedDigest = before.checkpoint.accepted_artifact_digests[0];
  await writeFile(path.join(before.layout.acceptedArtifacts, digestFilename(acceptedDigest)), '{"tampered":true}');

  const inspected = await inspectV5Run(created.run_directory);
  assert.equal(inspected.projection_kind, 'read_only_integrity_fatal');
  assert.equal(inspected.reply_status, 'fatal');
  assert.equal(inspected.diagnostics[0].code, 'ACCEPTED_STATE_INTEGRITY_FAILURE');
  assert.equal(inspected.last_verified_state.checkpoint_digest, before.checkpoint.checkpoint_digest);
  assert.equal(Object.hasOwn(inspected, 'stage'), false);
  assert.equal(Object.hasOwn(inspected, 'obligation'), false);
  assert.deepEqual(await readFile(before.layout.currentPointer), pointerBefore);

  assert.deepEqual(await advanceV5Run(created.run_directory, sourceRequestValue), advanced, 'existing-key replay must precede closure verification');
  assert.deepEqual(await readFile(before.layout.currentPointer), pointerBefore);

  const fatal = await advanceV5Run(created.run_directory, { idempotency_key: 'closure-fatal', action: sourceAction });
  assert.equal(fatal.projection_kind, 'persisted_run_state');
  assert.equal(fatal.reply_status, 'fatal');
  assert.equal(fatal.run_lifecycle, 'fatal');
  assert.equal(fatal.current_revision, before.checkpoint.current_revision);
  assert.equal(fatal.diagnostics[0].code, 'ACCEPTED_STATE_INTEGRITY_FAILURE');
  assert.deepEqual(fatal.available_actions, []);
  assert.equal(fatal.commit_receipt.semantic_revision_delta, 0);
  assert.equal(fatal.commit_receipt.operational_effect, 'fatal_incident_recorded');

  const after = await readVerifiedRun(created.run_directory);
  assert.equal(after.transaction.transaction_kind, 'normal_fatal');
  assert.equal(after.checkpoint.fsm_cell_id, 'cd.terminal.fatal');
  assert.equal(after.index.scope, 'run_normal');
  assert.notDeepEqual(await readFile(before.layout.currentPointer), pointerBefore);
});

test('untrusted operational chain is inspected read-only then committed to an idempotent quarantine head', async () => {
  const { created } = await createSourceRun('gtc-v5-quarantine-');
  const before = await readVerifiedRun(created.run_directory);
  const pointerBefore = await readFile(before.layout.currentPointer);
  const replyPath = path.join(before.layout.replies, digestFilename(before.transaction.reply_object_digest));
  await writeFile(replyPath, '{"tampered":true}');

  const inspected = await inspectV5Run(created.run_directory);
  assert.equal(inspected.projection_kind, 'read_only_integrity_fatal');
  assert.equal(inspected.reply_status, 'fatal');
  assert.deepEqual(await readFile(before.layout.currentPointer), pointerBefore);

  const cancelSelector = before.reply.available_actions.find((/** @type {Record<string,any>} */ item) => item.capability.kind === 'cancel_run');
  const request = { idempotency_key: 'quarantine', action: { kind: 'cancel_run', action_token: cancelSelector.action_token, reason: 'integrity recovery' } };
  const quarantined = await advanceV5Run(created.run_directory, request);
  assert.equal(quarantined.projection_kind, 'persisted_run_state');
  assert.equal(quarantined.reply_status, 'fatal');
  assert.equal(quarantined.run_lifecycle, 'fatal');
  assert.equal(quarantined.diagnostics[0].code, 'ACCEPTED_STATE_INTEGRITY_FAILURE');
  assert.deepEqual(quarantined.available_actions, []);
  assert.equal(quarantined.commit_receipt.semantic_revision_delta, 0);
  assert.equal(quarantined.commit_receipt.operational_effect, 'fatal_incident_recorded');

  const recovered = await readVerifiedRun(created.run_directory);
  assert.equal(recovered.transaction.transaction_kind, 'integrity_quarantine');
  assert.equal(recovered.index.scope, 'run_integrity_quarantine');
  assert.equal(recovered.checkpoint.fsm_cell_id, 'cd.terminal.fatal');
  assert.deepEqual(await advanceV5Run(created.run_directory, request), quarantined);
  const conflict = await advanceV5Run(created.run_directory, { ...request, action: { ...request.action, reason: 'different' } });
  assert.equal(conflict.reply_status, 'protocol_error');
  assert.equal(conflict.diagnostics[0].code, 'IDEMPOTENCY_CONFLICT');
});
