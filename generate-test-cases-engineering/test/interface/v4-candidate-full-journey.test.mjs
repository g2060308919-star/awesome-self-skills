import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { stageV4PrdCollectionObservation } from '../../src/prd-source-collection-v4.mjs';
import { constructCancelRunEventV4 } from '../../src/run-cancellation-v4.mjs';
import { createV4RunDirectory } from '../../src/run-bootstrap-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

/** @param {string} runDirectory @param {keyof typeof STAGE_FILES} stage @param {any} value */
async function stageArtifact(runDirectory, stage, value) {
  await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
  await writeFile(
    path.join(runDirectory, 'staging', STAGE_FILES[stage]),
    `${canonicalStringify(value)}\n`, 'utf8'
  );
}

test('A22 latest runner commits one complete deterministic Case Document transaction', async (/** @type {any} */ t) => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v43-journey-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await createV4RunDirectory(catalog, 'case_document');
  const fixture = v4GeneralQualityFixture();
  fixture.artifacts.source_pack.run_instance_id = run.run_id;

  let reply = /** @type {any} */ (await advanceStrict(run.run_directory));
  assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
  assert.equal(reply.stage, 'source_pack');
  const source = fixture.artifacts.source_pack.sources[0];
  const unit = source.semantic_projection.structure[0];
  const bytes = new TextEncoder().encode(source.content);
  await stageV4PrdCollectionObservation(run.run_directory, reply, {
    version: '1.0.0',
    scope: {
      mode: 'provided_materials', root_ref: 'provided:journey-prd', source_version: source.version,
      collection_window: { started_at: '2026-09-16T00:00:00.000Z', ended_at: '2026-09-16T00:00:01.000Z' }
    },
    channels: [
      { channel: 'body', enumeration_status: 'exhausted', page_count: 1, terminal_page_observed: true, diagnostic_code: null },
      ...['table', 'image', 'comment', 'reply'].map(channel => ({
        channel, enumeration_status: 'not_applicable', page_count: 0,
        terminal_page_observed: false, diagnostic_code: null
      }))
    ],
    items: [{
      item_id: 'provided-body', parent_item_id: null, channel: 'body', source_id: source.source_id,
      asset_id: null, unit_ids: [unit.unit_id], acquisition_status: 'acquired',
      review_status: 'reviewed', unavailable_reason: null
    }]
  }, [{ item_id: 'provided-body', raw_response_bytes: bytes, capture_bytes: bytes }]);

  for (const stage of /** @type {Array<keyof typeof STAGE_FILES>} */ ([
    'source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'
  ])) {
    await stageArtifact(run.run_directory, stage, fixture.artifacts[stage]);
    reply = /** @type {any} */ (await advanceStrict(run.run_directory));
    if (stage === 'source_pack') {
      const accepted = JSON.parse(await readFile(path.join(
        run.run_directory, 'accepted/r000/source-pack.json'
      ), 'utf8'));
      const state = JSON.parse(await readFile(path.join(
        run.run_directory, 'derived/source-acquisition.json'
      ), 'utf8'));
      assert.equal(state.accepted_source_pack_digest, `sha256:${digest(accepted)}`);
    }
  }

  assert.equal(reply.status, 'finished', JSON.stringify(reply));
  assert.equal(reply.delivery_intent, 'case_document');
  assert.deepEqual(reply.produced_artifacts.map((/** @type {any} */ item) => item.kind), [
    'case_document', 'business_markdown', 'execution_worksheet',
    'business_html', 'case_table', 'source_reading_summary'
  ]);
  const manifest = JSON.parse(await readFile(path.join(run.run_directory, 'output/current.json'), 'utf8'));
  assert.equal(manifest.schema_version, '4.3.0');
  assert.equal(manifest.compiler_version, '0.8.0');
  assert.equal(manifest.primary_readable, 'html');
  for (const key of ['bundle', 'markdown', 'execution_worksheet', 'html', 'chat_table', 'source_reading']) {
    assert.ok((await readFile(path.join(run.run_directory, manifest[key].path))).length > 0, key);
  }
  assert.match(await readFile(path.join(run.run_directory, manifest.execution_worksheet.path), 'utf8'), /,not_run,/u);

  const manifestBytes = await readFile(path.join(run.run_directory, 'output/current.json'), 'utf8');
  const execution = await createV4RunDirectory(catalog, 'execution_plan');
  const documentRef = {
    run_id: run.run_id, revision: manifest.revision,
    manifest_digest: `sha256:${createHash('sha256').update(manifestBytes).digest('hex')}`,
    bundle_digest: manifest.bundle.digest
  };
  /** @type {any} */
  const executionSource = {
    schema_version: '4.3.0', source_revision: 0, run_instance_id: execution.run_id,
    run_scope: `execution:${run.run_id}`, delivery_intent: 'execution_plan',
    case_document_ref: documentRef, output_language: 'zh-CN',
    sources: [], locators: [], source_reviews: [], source_policy: { rules: [] },
    decision_records: [], clarification_events: [], execution_events: [],
    source_assets: [], artifact_events: []
  };
  await stageArtifact(execution.run_directory, 'source_pack', executionSource);
  const executionReply = /** @type {any} */ (await advanceStrict(execution.run_directory));
  assert.equal(executionReply.status, 'need_user_answers', JSON.stringify(executionReply));
  assert.equal(executionReply.phase, 'execution_closure');
  assert.deepEqual(executionReply.produced_artifacts, []);
  const orderedCaseIds = JSON.parse(
    await readFile(path.join(run.run_directory, manifest.bundle.path), 'utf8')
  ).ordered_case_ids;
  assert.deepEqual(executionReply.execution_presentation.items.flatMap(
    (/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition')
      ? item.case_ids : []
  ), orderedCaseIds);
  await assert.rejects(readFile(path.join(execution.run_directory, 'output/current.json')), /ENOENT/u);

  const cancelledSource = structuredClone(executionSource);
  cancelledSource.source_revision = 1;
  cancelledSource.execution_events = [constructCancelRunEventV4({
    run_id: execution.run_id, phase: 'execution_closure', phase_version: 0
  })];
  await stageArtifact(execution.run_directory, 'source_pack', cancelledSource);
  const cancelled = /** @type {any} */ (await advanceStrict(execution.run_directory));
  assert.equal(cancelled.status, 'cancelled', JSON.stringify(cancelled));
  const resumed = await createV4RunDirectory(catalog, {
    parent_run_id: execution.run_id, creation_reason: 'resume_cancelled'
  });
  const resumedIdentity = JSON.parse(await readFile(
    path.join(resumed.run_directory, 'run-instance.json'), 'utf8'
  ));
  assert.equal(resumedIdentity.schema_version, '4.3.0');
  assert.equal(resumedIdentity.compiler_version, '0.8.0');
  assert.equal(resumedIdentity.lineage.parent_run_id, execution.run_id);
});
