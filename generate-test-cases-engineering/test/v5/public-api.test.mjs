import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as publicApi from '../../src/entry.mjs';
import { readSemanticV5Record, readSealedV5Record, readVerifiedRun } from '../../src/v5/run-store.mjs';
import { canonicalObjectDigest } from '../../src/v5/storage-records.mjs';

process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID = 'test-key';

let createSequence = 0;

function createRequest(count = 18) {
  return {
    idempotency_key: `create-${count}-${createSequence += 1}`,
    delivery_intent: 'case_document',
    source_bootstrap: {
      source_request_seeds: Array.from({ length: count }, (_, index) => ({
        source_request_client_key: `seed-${index}`,
        source_role: index === 0 ? 'primary_prd' : 'reference',
        locator: { kind: 'inline_text', media_type: 'text/markdown', content: `Requirement ${index}` },
        required: index === 0 || index < count - 1
      }))
    }
  };
}

/** @param {string[]} arguments_ */
async function runCli(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.resolve('src/entry.mjs'), ...arguments_], {
      env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (/** @type {any} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {any} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
  });
}

test('the public module exports exactly the three v5 APIs', () => {
  assert.deepEqual(Object.keys(publicApi).sort(), ['advanceV5Run', 'createV5RunDirectory', 'inspectV5Run']);
});

test('case creation requires a closed nonempty bootstrap with a required request and writes nothing on rejection', async () => {
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-public-invalid-'));
  const before = await readdir(catalogRoot);
  const reply = await publicApi.createV5RunDirectory(catalogRoot, { idempotency_key: 'bad', delivery_intent: 'case_document', source_bootstrap: { source_request_seeds: [] }, extra: true });
  assert.equal(reply.reply_kind, 'pre_run_error');
  assert.equal(reply.diagnostics[0].code, 'RUN_ARGUMENT_INVALID');
  assert.deepEqual(await readdir(catalogRoot), before);
});

test('create, inspect, and source batch advancement use deterministic advertised capabilities', async () => {
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-public-'));
  const created = await publicApi.createV5RunDirectory(catalogRoot, createRequest());
  assert.equal(created.reply_kind, 'persisted_run_state');
  assert.equal(created.status, 'need_artifact');
  assert.equal(created.work_packet.kind, 'source_work');
  assert.equal(created.work_packet.source_requests.length, 16);
  assert.ok(created.work_packet.source_requests.slice(0, -1).every((/** @type {Record<string, any>} */ request) => request.required));
  assert.deepEqual(await publicApi.inspectV5Run(created.run_directory), created);

  const sourceSelector = created.available_actions.find((/** @type {Record<string, any>} */ selector) => selector.capability.kind === 'submit_source_batch');
  const requestIds = created.work_packet.source_requests.map((/** @type {Record<string, any>} */ request) => request.request_id);
  const sourceKeys = requestIds.map((/** @type {string} */ _, /** @type {number} */ index) => `source-${index}`);
  const action = {
    kind: 'submit_source_batch', action_token: sourceSelector.action_token, request_ids: requestIds,
    request_dispositions: requestIds.map((/** @type {string} */ requestId, /** @type {number} */ index) => ({ request_id: requestId, outcome: 'fulfilled', source_client_keys: [sourceKeys[index]] })),
    source_payload: { kind: 'fulfilled_sources', source_pack: { sources: sourceKeys.map((/** @type {string} */ sourceClientKey, /** @type {number} */ index) => ({ source_client_key: sourceClientKey, media_type: 'text/markdown', content: `Accepted ${index}` })) } }
  };
  const advanced = await publicApi.advanceV5Run(created.run_directory, { idempotency_key: 'batch-1', action });
  assert.equal(advanced.status, 'need_artifact');
  assert.equal(advanced.current_revision, 1);
  assert.equal(advanced.work_packet.source_requests.length, 2);
  assert.deepEqual(await publicApi.advanceV5Run(created.run_directory, { idempotency_key: 'batch-1', action }), advanced);

  const current = await readVerifiedRun(created.run_directory);
  const acceptedState = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.accepted_source_state_digest);
  assert.equal(acceptedState.state_digest, canonicalObjectDigest({
    namespace: 'generate-test-cases/v5/accepted-source-state', format_version: 1,
    accepted_source_payload_digests: acceptedState.accepted_source_payload_digests
  }));
  const acceptedEnvelope = await readSealedV5Record(current.layout.acceptedArtifacts, current.checkpoint.accepted_artifact_digests[0], 'envelope_digest');
  assert.equal(JSON.stringify(acceptedEnvelope).includes('source-0'), false, 'temporary source client keys must not persist');
});

test('source batch mismatch and required skip are zero-revision rejections', async () => {
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-public-reject-'));
  const created = await publicApi.createV5RunDirectory(catalogRoot, createRequest(2));
  const pointerPath = path.join(created.run_directory, 'current-transaction.json');
  const before = await readFile(pointerPath);
  const selector = created.available_actions.find((/** @type {Record<string, any>} */ item) => item.capability.kind === 'submit_source_batch');
  const requests = created.work_packet.source_requests;
  const reply = await publicApi.advanceV5Run(created.run_directory, { idempotency_key: 'bad-batch', action: {
    kind: 'submit_source_batch', action_token: selector.action_token,
    request_ids: requests.map((/** @type {Record<string, any>} */ request) => request.request_id),
    request_dispositions: requests.map((/** @type {Record<string, any>} */ request) => ({ request_id: request.request_id, outcome: 'skipped_optional', skip_reason: 'skip' })),
    source_payload: { kind: 'all_skipped_optional' }
  } });
  assert.equal(reply.status, 'need_revision');
  assert.equal(reply.diagnostics[0].code, 'SCHEMA_VALIDATION_FAILED');
  assert.deepEqual(await readFile(pointerPath), before);
});

test('create rejects relative roots, legacy requests, and idempotency conflicts without publishing a second run', async () => {
  const relative = await publicApi.createV5RunDirectory('relative/catalog', createRequest(1));
  assert.equal(relative.diagnostics[0].code, 'RUN_ARGUMENT_INVALID');
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-public-idem-'));
  const request = createRequest(1);
  const first = await publicApi.createV5RunDirectory(catalogRoot, request);
  assert.deepEqual(await publicApi.createV5RunDirectory(catalogRoot, request), first);
  const conflict = await publicApi.createV5RunDirectory(catalogRoot, { ...request, source_bootstrap: { source_request_seeds: [{ ...request.source_bootstrap.source_request_seeds[0], locator: { kind: 'inline_text', media_type: 'text/markdown', content: 'different' } }] } });
  assert.equal(conflict.diagnostics[0].code, 'IDEMPOTENCY_CONFLICT');
  const legacy = await publicApi.createV5RunDirectory(catalogRoot, { idempotency_key: 'v4', schema_version: '4.0.0', run_directory: catalogRoot });
  assert.equal(legacy.diagnostics[0].code, 'RUN_ARGUMENT_INVALID');
  assert.equal((await readdir(path.join(catalogRoot, 'runs'))).length, 1);
});

test('the direct CLI is inspect-only and rejects every non-single-absolute argument shape', async () => {
  const catalogRoot = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-cli-'));
  const created = await publicApi.createV5RunDirectory(catalogRoot, createRequest(1));
  const before = await readFile(path.join(created.run_directory, 'current-transaction.json'));
  const inspected = /** @type {any} */ (await runCli([created.run_directory]));
  assert.equal(inspected.code, 0);
  assert.deepEqual(JSON.parse(inspected.stdout), created);
  for (const args of [[], ['relative'], [created.run_directory, 'extra']]) {
    const rejected = /** @type {any} */ (await runCli(args));
    assert.equal(rejected.code, 0);
    assert.equal(JSON.parse(rejected.stdout).diagnostics[0].code, 'RUN_ARGUMENT_INVALID');
  }
  assert.deepEqual(await readFile(path.join(created.run_directory, 'current-transaction.json')), before);
});
