import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { constructV4Action } from '../../src/agent-action-adapter-v4.mjs';
import { stageV4PrdCollectionObservation } from '../../src/prd-source-collection-v4.mjs';
import { stageV4SourceAcquisitionAction } from '../../src/source-acquisition-v4.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { latestV4Contract } from '../../src/v4-contract.mjs';
import { bindGeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

const runner = process.env.GTC_RECOVERY_RUNNER ?? fileURLToPath(new URL('../../src/entry.mjs', import.meta.url));
const contract = latestV4Contract();

/** @param {string} directory @param {{crash?:string|null,crashLog?:string|null}} [options] */
export async function run(directory, { crash = null, crashLog = null } = {}) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...(crash ? ['--import', new URL('./acquisition-crash-preload.mjs', import.meta.url).href] : []), runner, directory], { env: { ...process.env, GTC_CRASH_PHASE: crash ?? '', GTC_CRASH_LOG: crashLog ?? '' } });
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
  });
  if (crash) { assert.equal(result.code, 86, result.stdout + result.stderr); return { status: 'interrupted' }; }
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

/** @param {string} directory @param {string} name @param {any} value */
export async function stage(directory, name, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', `${name.replaceAll('_', '-')}.json`),
    `${canonicalStringify(value)}\n`);
}

/** @param {any} priorSource @param {any} priorEvidence */
export function evidenceRepairCandidate(priorSource, priorEvidence) {
  const source = structuredClone(priorSource);
  source.source_revision += 1;
  source.artifact_repairs ??= [];
  source.artifact_repairs.push({
    repair_seq: source.artifact_repairs.length + 1,
    base_source_revision: priorSource.source_revision,
    stage: 'evidence_claims', accepted_artifact_digest: digest(priorEvidence),
    reason: 'Correct accepted Evidence extraction'
  });
  const evidence = structuredClone(priorEvidence);
  evidence.source_revision += 1;
  return { source, evidence };
}



/** @param {string} directory @param {{initialCrash?:boolean,activeTarget?:boolean}} [options] */
export async function startImageBaseline(directory, { initialCrash = false, activeTarget = false } = {}) {
    const runId = 'RUN-0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
    const fixture = bindGeneralQualityFixture(await bendReviewJourneyFixture(runId), contract.schema_version);
    const assetUri = 'https://assets.test/rules/recommendation.png';
    const assetBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    fixture.artifacts.source_pack.source_assets = [{
      asset_id: 'ASSET-decorative', source_id: fixture.artifacts.source_pack.sources[0].source_id,
      locator_id: fixture.artifacts.source_pack.locators[0].locator_id,
      status: 'unavailable', classification: 'non_normative',
      review_basis: { reviewer: 'operator', method: 'inspection', evidence: 'decorative image' },
      canonical_uri: assetUri
    }];
    await ensureV4RunInstance(directory, {
      run_id: runId, delivery_intent: 'case_document', contract
    });
    const initial = await run(directory);
    const source = fixture.artifacts.source_pack.sources[0];
    const capture = new TextEncoder().encode(source.content);
    await stageV4PrdCollectionObservation(directory, initial, {
      version: '1.0.0', scope: {
        mode: 'provided_materials', root_ref: 'provided:gtc-acquired-fixture', source_version: source.version,
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
    }, [{ item_id: 'body', raw_response_bytes: capture, capture_bytes: capture }]);
    await stage(directory, 'source_pack', fixture.artifacts.source_pack);
    const blockedR0 = await run(directory);
    assert.equal(blockedR0.status, 'need_artifact', JSON.stringify(blockedR0));
    await stageV4SourceAcquisitionAction(directory, blockedR0, fixture.artifacts.source_pack, [{
      artifact_request_id: blockedR0.artifact_requests[0].artifact_request_id,
      input: { kind: 'safe_upload_ref', upload_id: 'UPLOAD-r0-asset', media_type: 'image/png',
        byte_length: assetBytes.length, content_digest: sourceByteDigest(assetBytes) },
      material: assetBytes,
      asset_review: { classification: 'non_normative', review_basis: {
        reviewer: 'operator', method: 'inspection', evidence: 'verified decorative image'
      } }
    }]);
    if (initialCrash) await run(directory, { crash: 'initial_material_saved', crashLog: path.join(directory, 'crash-observed.json') });
    const materialReply = await run(directory);
    assert.equal(materialReply.stage, 'evidence_claims', JSON.stringify(materialReply));
    if (activeTarget) fixture.artifacts.evidence_claims.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === 'FACT-ip').status = 'active';
    await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
    const question = await run(directory);
    assert.equal(question.status, 'need_user_answers', JSON.stringify(question));

    return { fixture, question, assetBytes, runId };
}

/** @param {string} directory @param {any} baseline @param {string} [answerText] */
export async function answerCandidates(directory, baseline, answerText = '发布者提交评价时的 IP 归属地') {
  const { question, runId } = baseline;
    const part = question.semantic_presentation.question_parts.find((/** @type {any} */ item) =>
      /IP/u.test(item.question));
    assert.ok(part);
    const answer = answerText;
    const message = `答复：${answer}`;
    const event = constructV4Action(question, {
      action: 'answer_question_part', question_part_id: part.question_part_id,
      answer, user_message: message, resolution: 'temporary', origin_type: 'user_statement'
    });
    const revision = bindGeneralQualityFixture(await bendReviewJourneyFixture(
      runId, 1, [event], { clarification_messages: [message] }
    ), contract.schema_version);
    const acceptedR0 = JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json')));
    const valid = revision.artifacts.source_pack;
    valid.artifact_events = structuredClone(acceptedR0.artifact_events);
    valid.source_assets = structuredClone(acceptedR0.source_assets);
    valid.sources[0].semantic_projection.assets = structuredClone(
      acceptedR0.sources[0].semantic_projection.assets
    );
    valid.sources[0].semantic_digest = `sha256:${digest(valid.sources[0].semantic_projection)}`;
    for (const locator of valid.locators) locator.semantic_digest = valid.sources[0].semantic_digest;
    for (const review of valid.source_reviews) review.semantic_digest = valid.sources[0].semantic_digest;
    const invalid = structuredClone(valid);
    invalid.sources[0].semantic_projection.structure = invalid.sources[0].semantic_projection.structure.filter(
      (/** @type {any} */ unit) => unit.type !== 'user_statement'
    );
    invalid.sources[0].semantic_digest = `sha256:${digest(invalid.sources[0].semantic_projection)}`;
    invalid.locators = invalid.locators.filter((/** @type {any} */ locator) => locator.type !== 'user_statement');
    for (const locator of invalid.locators) locator.semantic_digest = invalid.sources[0].semantic_digest;
    for (const review of invalid.source_reviews) {
      review.semantic_digest = invalid.sources[0].semantic_digest;
      review.units = review.units.filter((/** @type {any} */ unit) =>
        invalid.sources[0].semantic_projection.structure.some((/** @type {any} */ current) => current.unit_id === unit.unit_id));
    }
    return { valid, invalid, acceptedR0, event };
}

/** Append only compiler-bound user messages to a legal immutable source prefix.
 * @param {any} prior @param {any[]} events */
export function sourceAppend(prior, events) {
  const pack = structuredClone(prior);
  pack.source_revision += 1;
  pack.clarification_events.push(...events);
  const source = pack.sources[0];
  for (const event of events.filter(event => event.event_type === 'answer_question_part')) {
    const unitId = `UNIT-answer-${event.event_id}`;
    const text = `测试 fixture 模拟业务确认：${event.answer}`;
    assert.equal(sourceByteDigest(new TextEncoder().encode(text)), event.answer_origin.message_digest);
    const span = {
      start: event.answer_origin.answer_span.start_scalar, end: event.answer_origin.answer_span.end_scalar
    };
    source.semantic_projection.structure.push({
      unit_id: unitId, type: 'user_statement', text, presentation_id: event.presentation_id,
      message_digest: event.answer_origin.message_digest, answer_span: span
    });
    pack.source_reviews[0].units.push({ unit_id: unitId, content_digest: sourceByteDigest(new TextEncoder().encode(text)), classification: 'non_normative' });
    pack.locators.push({
      locator_id: `LOC-answer-${event.event_id}`, source_id: source.source_id,
      semantic_digest: source.semantic_digest, type: 'user_statement', unit_id: unitId,
      excerpt: event.answer, excerpt_digest: event.answer_origin.answer_span.excerpt_digest,
      domain: 'business', field_path: `/clarification_answers/${pack.clarification_events.length}`,
      presentation_id: event.presentation_id, message_digest: event.answer_origin.message_digest, answer_span: span
    });
  }
  source.semantic_digest = `sha256:${digest(source.semantic_projection)}`;
  for (const locator of pack.locators) locator.semantic_digest = source.semantic_digest;
  pack.source_reviews[0].semantic_digest = source.semantic_digest;
  return pack;
}
