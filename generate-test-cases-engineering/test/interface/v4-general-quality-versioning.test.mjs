import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { stageV4PrdCollectionObservation } from '../../src/prd-source-collection-v4.mjs';
import { createV4RunDirectory } from '../../src/run-bootstrap-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { SOURCE_RELIABILITY_V4_CONTRACT } from '../../src/v4-contract.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';
import runInstanceSchema from '../../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with { type: 'json' };

test('new run bootstrap persists the 4.3.2/0.8.2 identity', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'v43-bootstrap-'));
  try {
    const created = await createV4RunDirectory(catalog, 'case_document');
    const stored = JSON.parse(await readFile(path.join(created.run_directory, 'run-instance.json'), 'utf8'));
    assert.equal(stored.schema_version, '4.3.2');
    assert.equal(stored.compiler_version, '0.8.2');
    assert.deepEqual(validateAgainstSchema(stored, runInstanceSchema), []);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('run-instance schema accepts every exact contract and rejects mixed pairs', () => {
  const base = {
    run_id: 'RUN-00000000-0000-4000-8000-000000000001',
    delivery_intent: 'case_document',
    created_at: '2026-09-17T00:00:00.000Z',
    lineage: null
  };
  for (const [schema_version, compiler_version] of [
    ['4.0.0', '0.5.0'], ['4.2.0', '0.7.0'], ['4.3.0', '0.8.0'],
    ['4.3.1', '0.8.1'], ['4.3.2', '0.8.2']
  ]) {
    assert.deepEqual(validateAgainstSchema({ ...base, schema_version, compiler_version }, runInstanceSchema), []);
  }
  assert.notDeepEqual(
    validateAgainstSchema({ ...base, schema_version: '4.3.0', compiler_version: '0.7.0' }, runInstanceSchema),
    []
  );
  assert.notDeepEqual(
    validateAgainstSchema({ ...base, schema_version: '4.3.1', compiler_version: '0.8.0' }, runInstanceSchema),
    []
  );
  assert.notDeepEqual(
    validateAgainstSchema({ ...base, schema_version: '4.3.2', compiler_version: '0.8.1' }, runInstanceSchema),
    []
  );
});

test('existing 4.3.1 run retains its exact identity and can request its next artifact', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'v431-resume-'));
  try {
    const run = await ensureV4RunInstance(directory, {
      run_id: 'RUN-00000000-0000-4000-8000-000000000431',
      delivery_intent: 'case_document', contract: SOURCE_RELIABILITY_V4_CONTRACT
    });
    assert.equal(run.schema_version, '4.3.1');
    assert.equal(run.compiler_version, '0.8.1');
    const reply = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'source_pack');
    assert.equal(reply.run_id, run.run_id);
    assert.deepEqual(await advanceStrict(directory), reply);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('existing 4.3.1 run completes under its original version without migration', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'v431-completion-'));
  try {
    const run = await ensureV4RunInstance(directory, {
      run_id: 'RUN-00000000-0000-4000-8000-000000000432',
      delivery_intent: 'case_document', contract: SOURCE_RELIABILITY_V4_CONTRACT
    });
    const fixture = v4GeneralQualityFixture('4.3.1');
    fixture.artifacts.source_pack.run_instance_id = run.run_id;
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const source = fixture.artifacts.source_pack.sources[0];
    const bytes = new TextEncoder().encode(source.content);
    await stageV4PrdCollectionObservation(directory, initial, {
      version: '1.0.0', scope: {
        mode: 'provided_materials', root_ref: 'provided:legacy-fixture', source_version: source.version,
        collection_window: { started_at: '2026-09-16T00:00:00.000Z', ended_at: '2026-09-16T00:00:01.000Z' }
      },
      channels: ['body', 'table', 'image', 'comment', 'reply'].map(channel => ({
        channel, enumeration_status: channel === 'body' ? 'exhausted' : 'not_applicable',
        page_count: channel === 'body' ? 1 : 0,
        terminal_page_observed: channel === 'body', diagnostic_code: null
      })),
      items: [{ item_id: 'body', parent_item_id: null, channel: 'body', source_id: source.source_id,
        asset_id: null, unit_ids: [source.semantic_projection.structure[0].unit_id],
        acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null }]
    }, [{ item_id: 'body', raw_response_bytes: bytes, capture_bytes: bytes }]);
    let reply = initial;
    for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ ([
      'source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'
    ])) {
      await mkdir(path.join(directory, 'staging'), { recursive: true });
      await writeFile(path.join(directory, 'staging', STAGE_FILES[stage]),
        `${canonicalStringify(fixture.artifacts[stage])}\n`);
      reply = /** @type {any} */ (await advanceStrict(directory));
    }
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    const manifest = JSON.parse(await readFile(path.join(directory, 'output/current.json'), 'utf8'));
    assert.equal(manifest.schema_version, '4.3.1');
    assert.equal(manifest.compiler_version, '0.8.1');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
