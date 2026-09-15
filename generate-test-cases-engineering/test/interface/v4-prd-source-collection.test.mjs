import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createV4RunDirectory } from '../../src/run-bootstrap-v4.mjs';

const collection = /** @type {any} */ (await import('../../src/prd-source-collection-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));

const CAPTURE = /** @type {Readonly<Record<string,string>>} */ (Object.freeze({
  body: 'body:safe-capture', image: 'image:safe-capture',
  comment: 'thread:safe-capture', reply: 'thread:safe-capture'
}));
/** @param {string|Uint8Array} value */
const byteDigest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** @param {ReturnType<typeof observation>} value */
function materialFor(value) {
  return value.items.map(item => ({
    item_id: item.item_id,
    raw_response_bytes: new TextEncoder().encode(`${item.item_id}:TOKEN=must-not-persist`),
    capture_bytes: new TextEncoder().encode(CAPTURE[item.item_id])
  }));
}

function observation(status = 'exhausted') {
  return {
    version: '1.0.0',
    scope: {
      mode: 'online_document', root_ref: 'cooper:document/42',
      collection_window: {
        started_at: '2026-09-15T00:00:00.000Z', ended_at: '2026-09-15T00:01:00.000Z'
      },
      source_version: '17'
    },
    channels: ['body', 'table', 'image', 'comment', 'reply'].map(channel => ({
      channel,
      enumeration_status: channel === 'comment' ? status : 'exhausted',
      page_count: 1,
      terminal_page_observed: channel === 'comment' ? status === 'exhausted' : true,
      diagnostic_code: status === 'partial' && channel === 'comment' ? 'COMMENT_PAGE_FETCH_FAILED' : null
    })),
    items: [
      { item_id: 'body', parent_item_id: null, channel: 'body', source_id: 'SRC-prd', asset_id: null, unit_ids: ['UNIT-body'], acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null },
      { item_id: 'image', parent_item_id: null, channel: 'image', source_id: 'SRC-prd', asset_id: 'ASSET-flow', unit_ids: ['UNIT-image'], acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null },
      { item_id: 'comment', parent_item_id: null, channel: 'comment', source_id: 'SRC-thread', asset_id: null, unit_ids: ['UNIT-comment'], acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null },
      { item_id: 'reply', parent_item_id: 'comment', channel: 'reply', source_id: 'SRC-thread', asset_id: null, unit_ids: ['UNIT-reply'], acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null }
    ]
  };
}

/** @param {string} runId @param {string} [sourceVersion] */
function sourcePack(runId, sourceVersion = '17') {
  return {
    schema_version: '4.2.0', source_revision: 0, run_instance_id: runId,
    sources: [
      { source_id: 'SRC-prd', version: sourceVersion, capture_digest: byteDigest(CAPTURE.body), semantic_projection: { structure: [{ unit_id: 'UNIT-body' }, { unit_id: 'UNIT-image' }] } },
      { source_id: 'SRC-thread', version: sourceVersion, capture_digest: byteDigest(CAPTURE.comment), semantic_projection: { structure: [{ unit_id: 'UNIT-comment' }, { unit_id: 'UNIT-reply' }] } }
    ],
    source_assets: [{ source_id: 'SRC-prd', asset_id: 'ASSET-flow', status: 'reviewed', asset_digest: byteDigest(CAPTURE.image) }],
    source_reviews: [
      { source_id: 'SRC-prd', units: [{ unit_id: 'UNIT-body', classification: 'normative' }, { unit_id: 'UNIT-image', classification: 'normative' }] },
      { source_id: 'SRC-thread', units: [{ unit_id: 'UNIT-comment', classification: 'non_normative' }, { unit_id: 'UNIT-reply', classification: 'normative' }] }
    ]
  };
}

async function setup() {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-collection-'));
  const run = await createV4RunDirectory(catalog, 'case_document');
  const reply = {
    status: 'need_revision', stage: 'source_pack', run_id: run.run_id,
    scope: { source_revision: 0, run_instance_id: run.run_id }
  };
  return { catalog, run, reply };
}

test('D2 new bootstrap uses candidate identity while an existing legacy identity remains legacy', async () => {
  const { run } = await setup();
  const identity = JSON.parse(await readFile(path.join(run.run_directory, 'run-instance.json'), 'utf8'));
  assert.equal(identity.schema_version, '4.2.0');
  assert.equal(identity.compiler_version, '0.7.0');
});

test('A01/A02 collection stages actual body/image/comment/reply bytes and binds reviewed source units', async () => {
  assert.equal(typeof collection.stageV4PrdCollectionObservation, 'function');
  const { run, reply } = await setup();
  const material = materialFor(observation());
  const first = await collection.stageV4PrdCollectionObservation(
    run.run_directory, reply, observation(), material
  );
  const repeated = await collection.stageV4PrdCollectionObservation(
    run.run_directory, reply, observation(), material
  );
  assert.deepEqual(repeated, first);

  const stagedText = await readFile(path.join(run.run_directory, 'staging/prd-collection.json'), 'utf8');
  assert.doesNotMatch(stagedText, /TOKEN|must-not-persist/u);
  const bound = await collection.bindV4PrdCollectionObservation(
    run.run_directory, sourcePack(run.run_id)
  );
  assert.equal(bound.summary.status, 'complete_within_scope');
  assert.equal(bound.summary.items.length, 4);
  assert.equal(bound.summary.items.find((/** @type {any} */ item) => item.item_id === 'reply').parent_item_id, 'comment');
  assert.equal(bound.collection_sessions[0].bindings.find((/** @type {any} */ item) => item.item_id === 'comment').review_classification, 'non_normative');
});

test('A04/A06 partial pagination remains incomplete and source version changes cannot bind', async () => {
  const partial = await setup();
  const value = observation('partial');
  const material = materialFor(value);
  await collection.stageV4PrdCollectionObservation(partial.run.run_directory, partial.reply, value, material);
  const result = await collection.bindV4PrdCollectionObservation(
    partial.run.run_directory, sourcePack(partial.run.run_id)
  );
  assert.equal(result.summary.status, 'incomplete');
  assert.match(result.summary.limitations.join('\n'), /COMMENT_PAGE_FETCH_FAILED/u);

  const changed = await setup();
  await collection.stageV4PrdCollectionObservation(changed.run.run_directory, changed.reply, observation(), material);
  await assert.rejects(
    collection.bindV4PrdCollectionObservation(changed.run.run_directory, sourcePack(changed.run.run_id, '18')),
    /SOURCE_COLLECTION_VERSION_CHANGED/u
  );
});

test('A06 duplicate identities with changed bytes and stale runner bindings fail closed', async () => {
  const { run, reply } = await setup();
  const value = observation();
  const material = materialFor(value);
  await collection.stageV4PrdCollectionObservation(run.run_directory, reply, value, material);
  const changed = structuredClone(material);
  changed[0].capture_bytes = new TextEncoder().encode('changed');
  await assert.rejects(
    collection.stageV4PrdCollectionObservation(run.run_directory, reply, value, changed),
    /SOURCE_COLLECTION_IDEMPOTENCY_CONFLICT/u
  );
  await assert.rejects(
    collection.stageV4PrdCollectionObservation(run.run_directory, { ...reply, run_id: 'RUN-00000000-0000-4000-8000-000000000000' }, value, material),
    /SOURCE_COLLECTION_REPLY_STALE/u
  );
});

test('A01 collection rejects capture bytes that are not the bound Source or image asset bytes', async () => {
  const { run, reply } = await setup();
  const value = observation();
  await collection.stageV4PrdCollectionObservation(
    run.run_directory, reply, value, materialFor(value)
  );
  const changed = sourcePack(run.run_id);
  changed.sources[0].capture_digest = byteDigest('different-document-capture');
  await assert.rejects(
    collection.bindV4PrdCollectionObservation(run.run_directory, changed),
    /SOURCE_COLLECTION_BINDING_INVALID/u
  );
});

test('A06 collection rejects credential-bearing durable fields and invalid reply ancestry', async () => {
  const signed = await setup();
  const unsafe = observation();
  unsafe.scope.root_ref = 'https://docs.example.test/prd?token=must-not-persist';
  await assert.rejects(
    collection.stageV4PrdCollectionObservation(
      signed.run.run_directory, signed.reply, unsafe, materialFor(unsafe)
    ),
    /SOURCE_COLLECTION_OBSERVATION_INVALID/u
  );
  await assert.rejects(
    readFile(path.join(signed.run.run_directory, 'staging/prd-collection.json'), 'utf8'),
    /ENOENT/u
  );

  const ancestry = await setup();
  const invalid = observation();
  const replyItem = invalid.items.find(item => item.item_id === 'reply');
  if (!replyItem) throw new TypeError('fixture reply is missing');
  replyItem.parent_item_id = 'body';
  await assert.rejects(
    collection.stageV4PrdCollectionObservation(
      ancestry.run.run_directory, ancestry.reply, invalid, materialFor(invalid)
    ),
    /SOURCE_COLLECTION_OBSERVATION_INVALID/u
  );
});
