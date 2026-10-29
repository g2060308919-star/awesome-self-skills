import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import * as api from '../../src/entry.mjs';
import {STAGE_FILES} from '../../src/run-store.mjs';
import {v4GeneralQualityFixture} from './v4-general-quality-fixture.mjs';
/** @param {any} directory @param {any} initial @param {any} pack */
async function collect(directory, initial, pack) {
  const source = pack.sources[0];
  const bytes = new TextEncoder().encode(source.content);
  await api.stageV4PrdCollectionObservation(directory, initial, {
    version: '1.0.0', scope: {
      mode: 'provided_materials', root_ref: 'provided:synthetic-reliability-full-flow-fixture',
      source_version: source.version,
      collection_window: { started_at: '2026-10-22T00:00:00.000Z', ended_at: '2026-10-22T00:00:01.000Z' }
    },
    channels: [
      { channel: 'body', enumeration_status: 'exhausted', page_count: 1, terminal_page_observed: true, diagnostic_code: null },
      ...['table', 'image', 'comment', 'reply'].map(channel => ({
        channel, enumeration_status: 'not_applicable', page_count: 0,
        terminal_page_observed: false, diagnostic_code: null
      }))
    ],
    items: [{
      item_id: 'synthetic-body', parent_item_id: null, channel: 'body', source_id: source.source_id,
      asset_id: null, unit_ids: source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id),
      acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null
    }]
  }, [{ item_id: 'synthetic-body', raw_response_bytes: bytes, capture_bytes: bytes }]);
}


/** @param {any} t */
export async function start(t, options = /** @type {any} */ ({})) {
  const runner = options.api ?? api;
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'remediation-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await runner.createV4RunDirectory(catalog, 'case_document');
  const fixture = v4GeneralQualityFixture('4.3.3');
  fixture.artifacts.source_pack.run_instance_id = run.run_id;
  const dir = run.run_directory;
  await mkdir(path.join(dir, 'staging'), { recursive: true });
  let reply = await runner.advanceStrict(dir);
  await collect(dir, reply, fixture.artifacts.source_pack);
  for (const stage of /** @type {const} */ (['source_pack', 'evidence_claims', 'behavior_views'])) {
    if (stage === 'behavior_views' && options.stopBeforeBehavior) break;
    assert.equal(reply.stage, stage, JSON.stringify(reply));
    await writeFile(path.join(dir, 'staging', STAGE_FILES[stage]), JSON.stringify(fixture.artifacts[stage]));
    reply = await runner.advanceStrict(dir);
  }
  return { dir, fixture, reply };
}
