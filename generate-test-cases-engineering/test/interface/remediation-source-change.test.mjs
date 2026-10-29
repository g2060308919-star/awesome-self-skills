import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { digest } from '../../src/canonical.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { bindGeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';
import { stageRaw } from '../helpers/v4-reliability-fixture.mjs';

// Match the full-flow suite: use an actual installed/bundled entry by setting
// this absolute path. Every advance below runs the public CLI in a fresh process.
const runner = process.env.GTC_RELIABILITY_RUNNER
  ?? fileURLToPath(new URL('../../src/entry.mjs', import.meta.url));
const adapter = /** @type {any} */ (await import(pathToFileURL(runner).href));
const execute = promisify(execFile);

/** @param {string} text */
function byteDigest(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

/** @param {string} directory */
async function advance(directory) {
  const { stdout, stderr } = await execute(process.execPath, [runner, directory], {
    maxBuffer: 8 * 1024 * 1024, timeout: 30_000
  });
  assert.equal(stderr, '');
  const reply = JSON.parse(stdout);
  assert.deepEqual(validateAgainstSchema(reply, replySchema), [], stdout);
  return reply;
}

/** @param {string} directory @param {number} revision */
function sourcePath(directory, revision) {
  return path.join(directory, `accepted/r${String(revision).padStart(3, '0')}/source-pack.json`);
}

/** @param {string} directory @param {any} reply @param {any} pack */
async function collect(directory, reply, pack) {
  const source = pack.sources[0];
  const bytes = new TextEncoder().encode(source.content);
  await adapter.stageV4PrdCollectionObservation(directory, reply, {
    version: '1.0.0', scope: {
      mode: 'provided_materials', root_ref: 'provided:synthetic-source-change-regression',
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

// These are synthetic test answers, not actual user authorization or an
// independent business review. This regression exercises revision/replay only.
/** @param {any} reply @param {RegExp} pattern @param {string} value */
function answer(reply, pattern, value) {
  const parts = reply.semantic_presentation.question_parts.filter(
    (/** @type {any} */ part) => pattern.test(part.question)
  );
  assert.equal(parts.length, 1);
  return adapter.constructV4Action(reply, {
    action: 'answer_question_part', question_part_id: parts[0].question_part_id,
    answer: value, user_message: `测试 fixture 模拟业务确认：${value}`,
    resolution: 'final', origin_type: 'authorized_confirmation'
  });
}

/** @param {any} prior @param {any} event */
function appendAnswer(prior, event) {
  const pack = structuredClone(prior);
  pack.source_revision += 1;
  pack.clarification_events.push(event);
  const source = pack.sources[0];
  const unitId = `UNIT-answer-${event.event_id}`;
  const text = `测试 fixture 模拟业务确认：${event.answer}`;
  assert.equal(byteDigest(text), event.answer_origin.message_digest);
  const span = {
    start: event.answer_origin.answer_span.start_scalar,
    end: event.answer_origin.answer_span.end_scalar
  };
  source.semantic_projection.structure.push({
    unit_id: unitId, type: 'user_statement', text, presentation_id: event.presentation_id,
    message_digest: event.answer_origin.message_digest, answer_span: span
  });
  pack.source_reviews[0].units.push({ unit_id: unitId, content_digest: byteDigest(text), classification: 'non_normative' });
  pack.locators.push({
    locator_id: `LOC-answer-${event.event_id}`, source_id: source.source_id,
    semantic_digest: source.semantic_digest, type: 'user_statement', unit_id: unitId,
    excerpt: event.answer, excerpt_digest: event.answer_origin.answer_span.excerpt_digest,
    domain: 'business', field_path: `/clarification_answers/${pack.clarification_events.length}`,
    presentation_id: event.presentation_id, message_digest: event.answer_origin.message_digest, answer_span: span
  });
  refreshSemanticDigest(pack);
  return pack;
}

/** @param {any} pack */
function refreshSemanticDigest(pack) {
  const source = pack.sources[0];
  source.semantic_digest = `sha256:${digest(source.semantic_projection)}`;
  for (const locator of pack.locators) locator.semantic_digest = source.semantic_digest;
  pack.source_reviews[0].semantic_digest = source.semantic_digest;
}

test('AT-15: stale snapshots and damaged answer history stay same-run revisions while exact replay and subsequent answers preserve decisions', async (/** @type {any} */ t) => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'remediation-source-change-'));
  t.after(() => rm(catalog, { recursive: true, force: true }));
  const run = await adapter.createV4RunDirectory(catalog, 'case_document');
  const directory = run.run_directory;
  const fixture = bindGeneralQualityFixture(await bendReviewJourneyFixture(run.run_id), latestV4Contract().schema_version);
  fixture.artifacts.evidence_claims.semantic_gaps[2].discovery_phase = 'post_case';
  const initial = await advance(directory);
  assert.equal(initial.stage, 'source_pack');
  await collect(directory, initial, fixture.artifacts.source_pack);
  await stageRaw(directory, 'source_pack', fixture.artifacts.source_pack);
  assert.equal((await advance(directory)).stage, 'evidence_claims');
  await stageRaw(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
  const pending = await advance(directory);
  assert.equal(pending.status, 'need_user_answers');
  assert.equal(pending.semantic_presentation.question_parts.length, 2);

  const originalBytes = await readFile(sourcePath(directory, 0), 'utf8');
  const original = JSON.parse(originalBytes);
  await stageRaw(directory, 'source_pack', appendAnswer(original,
    answer(pending, /IP/u, '发布者提交评价时的 IP 归属地')));
  const partial = await advance(directory);
  assert.equal(partial.status, 'need_user_answers');
  assert.equal(partial.semantic_presentation.question_parts.length, 1);
  const acceptedBytes = await readFile(sourcePath(directory, 1), 'utf8');
  const accepted = JSON.parse(acceptedBytes);
  assert.equal(accepted.decision_records.length, 1);
  const checkpoint = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');
  const assertUnchanged = async () => {
    assert.equal(await readFile(sourcePath(directory, 0), 'utf8'), originalBytes);
    assert.equal(await readFile(sourcePath(directory, 1), 'utf8'), acceptedBytes);
    assert.equal(await readFile(path.join(directory, 'checkpoint.json'), 'utf8'), checkpoint);
    await assert.rejects(readFile(sourcePath(directory, 2)), { code: 'ENOENT' });
  };

  // An older snapshot lacks the appended statement but changes no original
  // material. The source-change guard must not redirect it to a fresh run.
  await stageRaw(directory, 'source_pack', original);
  const stale = await advance(directory);
  assert.equal(stale.status, 'need_revision');
  assert.ok(stale.diagnostics.some((/** @type {any} */ item) => item.code === 'SOURCE_REVISION_MISMATCH'), JSON.stringify(stale));
  assert.ok(!stale.diagnostics.some((/** @type {any} */ item) => item.code === 'NEW_RUN_REQUIRED'), JSON.stringify(stale));
  await assertUnchanged();

  await stageRaw(directory, 'source_pack', accepted);
  assert.deepEqual(await advance(directory), partial);
  await assertUnchanged();

  const next = appendAnswer(accepted, answer(partial, /.*/u, '显示真实评价人数'));
  const damaged = structuredClone(next);
  const units = damaged.sources[0].semantic_projection.structure;
  const oldStatement = units.findIndex((/** @type {any} */ unit) => unit.type === 'user_statement');
  assert.ok(oldStatement >= 0);
  const [removed] = units.splice(oldStatement, 1);
  damaged.locators = damaged.locators.filter((/** @type {any} */ item) => item.unit_id !== removed.unit_id);
  damaged.source_reviews[0].units = damaged.source_reviews[0].units.filter(
    (/** @type {any} */ item) => item.unit_id !== removed.unit_id
  );
  refreshSemanticDigest(damaged);
  await stageRaw(directory, 'source_pack', damaged);
  const rejected = await advance(directory);
  assert.equal(rejected.status, 'need_revision');
  assert.equal(rejected.stage, 'source_pack');
  assert.ok(rejected.diagnostics.some((/** @type {any} */ item) => item.code === 'V4_SOURCE_BYTES_CHANGED'), JSON.stringify(rejected));
  assert.ok(!rejected.diagnostics.some((/** @type {any} */ item) => item.code === 'NEW_RUN_REQUIRED'), JSON.stringify(rejected));
  await assertUnchanged();

  await stageRaw(directory, 'source_pack', next);
  const advanced = await advance(directory);
  assert.equal(advanced.status, 'need_revision');
  assert.equal(advanced.stage, 'behavior_views');
  assert.equal(advanced.incomplete_reason.code, 'STAGE_ARTIFACT_REQUIRED');
  assert.deepEqual(advanced.diagnostics, []);
  const committed = JSON.parse(await readFile(sourcePath(directory, 2), 'utf8'));
  assert.equal(committed.source_revision, 2);
  assert.equal(committed.run_instance_id, run.run_id);
  assert.equal(committed.decision_records.length, 2);
  assert.equal(new Set(committed.decision_records.map((/** @type {any} */ item) => item.decision_id)).size, 2);
  assert.deepEqual(committed.decision_records[0], accepted.decision_records[0]);
  assert.deepEqual(committed.decision_records.map((/** @type {any} */ item) => item.answer),
    ['发布者提交评价时的 IP 归属地', '显示真实评价人数']);
  assert.equal(await readFile(sourcePath(directory, 0), 'utf8'), originalBytes);
  assert.equal(await readFile(sourcePath(directory, 1), 'utf8'), acceptedBytes);
  assert.deepEqual(await advance(directory), advanced);
});
