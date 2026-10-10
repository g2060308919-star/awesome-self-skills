import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { verifyCaseDocumentDeliveryV4 } from '../../src/canonical-delivery-v4.mjs';
import { constructV4Action } from '../../src/agent-action-adapter-v4.mjs';
import { stageV4PrdCollectionObservation } from '../../src/prd-source-collection-v4.mjs';
import { loadV4SourceReadingSummary } from '../../src/prd-source-collection-v4.mjs';
import { stageV4SourceAcquisitionAction } from '../../src/source-acquisition-v4.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { SOURCE_BINDING_V4_CONTRACT } from '../../src/v4-contract.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';
import { bindGeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

const runner = fileURLToPath(new URL('../../skill/generate-test-cases/scripts/test-compiler.mjs', import.meta.url));

/** @param {string} directory */
async function run(directory) {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runner, directory]);
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, result.stderr);
  return JSON.parse(result.stdout);
}

/** @param {string} directory @param {string} name @param {any} value */
async function stage(directory, name, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging', `${name.replaceAll('_', '-')}.json`),
    `${canonicalStringify(value)}\n`);
}

/** @param {string} directory @param {any} [providedFixture] */
async function startAcceptedEvidence(directory, providedFixture = null) {
  const runId = 'RUN-0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
  await ensureV4RunInstance(directory, {
    run_id: runId, delivery_intent: 'case_document', contract: SOURCE_BINDING_V4_CONTRACT
  });
  const fixture = providedFixture ?? v4GeneralQualityFixture('4.3.2');
  fixture.artifacts.source_pack.run_instance_id = runId;
  const initial = await run(directory);
  assert.equal(initial.stage, 'source_pack');
  const source = fixture.artifacts.source_pack.sources[0];
  const bytes = new TextEncoder().encode(source.content);
  await stageV4PrdCollectionObservation(directory, initial, {
    version: '1.0.0', scope: {
      mode: 'provided_materials', root_ref: 'provided:gtc-repair-fixture', source_version: source.version,
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
  await stage(directory, 'source_pack', fixture.artifacts.source_pack);
  assert.equal((await run(directory)).stage, 'evidence_claims');
  await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
  const accepted = await run(directory);
  assert.ok(accepted.stage === 'behavior_views' || accepted.status === 'need_user_answers',
    JSON.stringify(accepted));
  return { fixture, accepted };
}

/** @param {any} priorSource @param {any} priorEvidence */
function evidenceRepairCandidate(priorSource, priorEvidence) {
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

test('GTC-03 accepted Evidence repair enters the revision transaction without a clarification event', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-evidence-repair-'));
  try {
    const { fixture } = await startAcceptedEvidence(directory);
    await stage(directory, 'behavior_views', fixture.artifacts.behavior_views);
    assert.equal((await run(directory)).stage, 'case_drafts');
    await stage(directory, 'case_drafts', fixture.artifacts.case_drafts);
    assert.equal((await run(directory)).status, 'finished');
    assert.equal(JSON.parse(await readFile(path.join(directory, 'output/current.json'))).revision, 0);
    const priorSource = JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json')));
    const priorEvidence = JSON.parse(await readFile(path.join(directory, 'accepted/r000/evidence-claims.json')));
    const { source, evidence } = evidenceRepairCandidate(priorSource, priorEvidence);
    await stage(directory, 'source_pack', source);
    await stage(directory, 'evidence_claims', evidence);
    const reply = await run(directory);
    assert.equal(reply.stage, 'behavior_views', JSON.stringify(reply));
    assert.equal(reply.scope.source_revision, 1);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'accepted/r001/source-pack.json'))), source);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'accepted/r001/evidence-claims.json'))), evidence);
    const current = JSON.parse(await readFile(path.join(directory, 'output/current.json')));
    assert.equal(current.status, 'stale');
    assert.equal(current.active_revision, 1);
    await stage(directory, 'source_pack', source);
    await stage(directory, 'evidence_claims', evidence);
    assert.equal((await run(directory)).stage, 'behavior_views');
    await assert.rejects(readFile(path.join(directory, 'accepted/r002/source-pack.json')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(directory, 'staging/source-pack.json')), { code: 'ENOENT' });
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'accepted/r000/evidence-claims.json'))), priorEvidence);
    const regenerated = v4GeneralQualityFixture('4.3.2');
    for (const artifact of Object.values(regenerated.artifacts)) artifact.source_revision = 1;
    regenerated.artifacts.source_pack = structuredClone(source);
    regenerated.artifacts.evidence_claims = structuredClone(evidence);
    bindGeneralQualityFixture(regenerated, '4.3.2');
    await stage(directory, 'behavior_views', regenerated.artifacts.behavior_views);
    assert.equal((await run(directory)).stage, 'case_drafts');
    await stage(directory, 'case_drafts', regenerated.artifacts.case_drafts);
    assert.equal((await run(directory)).status, 'finished');
    assert.equal((await verifyCaseDocumentDeliveryV4(directory)).manifest.revision, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('GTC-03 rejects invalid repair bindings and invalid Evidence without partial revision', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-evidence-repair-invalid-'));
  try {
    await startAcceptedEvidence(directory);
    const priorSource = JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json')));
    const priorEvidence = JSON.parse(await readFile(path.join(directory, 'accepted/r000/evidence-claims.json')));
    const missingEvidence = evidenceRepairCandidate(priorSource, priorEvidence);
    await stage(directory, 'source_pack', missingEvidence.source);
    const requested = await run(directory);
    assert.equal(requested.stage, 'evidence_claims');
    assert.equal(requested.scope.source_revision, 1);
    const cases = /** @type {Array<[string,(pair:any)=>void]>} */ ([
      ['digest', (/** @type {any} */ pair) => { pair.source.artifact_repairs[0].accepted_artifact_digest = 'f'.repeat(64); }],
      ['base revision', (/** @type {any} */ pair) => { pair.source.artifact_repairs[0].base_source_revision = 1; }],
      ['repair sequence', (/** @type {any} */ pair) => { pair.source.artifact_repairs[0].repair_seq = 2; }],
      ['source revision', (/** @type {any} */ pair) => { pair.source.source_revision = 2; }],
      ['two repairs', (/** @type {any} */ pair) => { pair.source.artifact_repairs.push({
        ...pair.source.artifact_repairs[0], repair_seq: 2
      }); }],
      ['source mutation', (/** @type {any} */ pair) => { pair.source.run_scope = 'changed scope'; }],
      ['event mutation', (/** @type {any} */ pair) => { pair.source.execution_events.push({ event_id: 'invalid' }); }],
      ['Evidence provenance', (/** @type {any} */ pair) => {
        pair.evidence.claims[0].source_locator_ids = ['locator_missing'];
      }]
    ]);
    for (const [name, mutate] of cases) {
      const pair = evidenceRepairCandidate(priorSource, priorEvidence);
      mutate(pair);
      await stage(directory, 'source_pack', pair.source);
      await stage(directory, 'evidence_claims', pair.evidence);
      const reply = await run(directory);
      assert.equal(reply.status, 'need_revision', `${name}: ${JSON.stringify(reply)}`);
      assert.notEqual(reply.incomplete_reason?.code, 'V4_CLARIFICATION_APPEND_INVALID', name);
      await assert.rejects(readFile(path.join(directory, 'accepted/r001/source-pack.json')), { code: 'ENOENT' });
      await assert.rejects(readFile(path.join(directory, 'accepted/r001/evidence-claims.json')), { code: 'ENOENT' });
    }
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json'))), priorSource);
    assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'accepted/r000/evidence-claims.json'))), priorEvidence);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('GTC-01 acquired asset is reused while an unaccepted semantic answer is corrected', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-acquired-semantic-'));
  try {
    const runId = 'RUN-0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
    const fixture = bindGeneralQualityFixture(await bendReviewJourneyFixture(runId), '4.3.2');
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
      run_id: runId, delivery_intent: 'case_document', contract: SOURCE_BINDING_V4_CONTRACT
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
    assert.equal((await run(directory)).stage, 'evidence_claims');
    await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
    const question = await run(directory);
    assert.equal(question.status, 'need_user_answers', JSON.stringify(question));

    const part = question.semantic_presentation.question_parts.find((/** @type {any} */ item) =>
      /IP/u.test(item.question));
    assert.ok(part);
    const answer = '发布者提交评价时的 IP 归属地';
    const message = `答复：${answer}`;
    const event = constructV4Action(question, {
      action: 'answer_question_part', question_part_id: part.question_part_id,
      answer, user_message: message, resolution: 'temporary', origin_type: 'user_statement'
    });
    const revision = bindGeneralQualityFixture(await bendReviewJourneyFixture(
      runId, 1, [event], { clarification_messages: [message] }
    ), '4.3.2');
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
    await stage(directory, 'source_pack', invalid);
    const blockedR1 = await run(directory);
    assert.equal(blockedR1.status, 'need_artifact', JSON.stringify(blockedR1));
    await stageV4SourceAcquisitionAction(directory, blockedR1, invalid, [{
      artifact_request_id: blockedR1.artifact_requests[0].artifact_request_id,
      input: { kind: 'safe_upload_ref', upload_id: 'UPLOAD-r1-asset', media_type: 'image/png',
        byte_length: assetBytes.length, content_digest: sourceByteDigest(assetBytes) },
      material: assetBytes
    }]);
    // Model a crash after the immutable base is written but before acquired
    // state is committed. The pending state must still complete once.
    const basePath = path.join(directory, 'derived/source-acquisition-base-r001.json');
    await writeFile(basePath, await readFile(path.join(directory, 'staging/source-pack.json')));
    const semanticFailure = await run(directory);
    assert.equal(semanticFailure.incomplete_reason.code, 'V4_DECISION_MESSAGE_PROVENANCE_INVALID',
      JSON.stringify(semanticFailure));
    const acquiredBefore = await readFile(path.join(directory, 'derived/source-acquisition.json'));
    const acquiredCandidate = JSON.parse(await readFile(path.join(directory, 'staging/source-pack.json')));
    valid.artifact_events = structuredClone(acquiredCandidate.artifact_events);
    const tamperedSource = structuredClone(valid);
    tamperedSource.sources[0].semantic_projection.content += ' changed original bytes';
    await stage(directory, 'source_pack', tamperedSource);
    assert.equal((await run(directory)).incomplete_reason.code, 'ARTIFACT_RESUME_STALE');
    const tamperedAsset = structuredClone(valid);
    tamperedAsset.source_assets[0].asset_digest = `sha256:${'f'.repeat(64)}`;
    await stage(directory, 'source_pack', tamperedAsset);
    assert.equal((await run(directory)).incomplete_reason.code, 'ARTIFACT_RESUME_STALE');
    const tamperedEvents = structuredClone(valid);
    tamperedEvents.artifact_events.pop();
    await stage(directory, 'source_pack', tamperedEvents);
    assert.equal((await run(directory)).incomplete_reason.code, 'ARTIFACT_RESUME_STALE');
    const baseBytes = await readFile(basePath);
    await unlink(basePath);
    await stage(directory, 'source_pack', valid);
    assert.equal((await run(directory)).incomplete_reason.code, 'SOURCE_ACQUISITION_STATE_INVALID');
    const tamperedBase = JSON.parse(baseBytes.toString());
    tamperedBase.run_scope = 'tampered';
    await writeFile(basePath, `${canonicalStringify(tamperedBase)}\n`);
    await stage(directory, 'source_pack', valid);
    assert.equal((await run(directory)).incomplete_reason.code, 'SOURCE_ACQUISITION_STATE_INVALID');
    await writeFile(basePath, baseBytes);
    await stage(directory, 'source_pack', valid);
    const corrected = await run(directory);
    assert.notEqual(corrected.incomplete_reason?.code, 'ARTIFACT_RESUME_STALE', JSON.stringify(corrected));
    assert.equal(corrected.status, 'need_user_answers', JSON.stringify(corrected));
    assert.equal(JSON.parse(await readFile(path.join(directory, 'accepted/r001/source-pack.json'))).source_revision, 1);
    assert.equal(await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8'),
      acquiredBefore.toString());
    const acceptedR1 = JSON.parse(await readFile(path.join(directory, 'accepted/r001/source-pack.json')));
    const reading = await loadV4SourceReadingSummary(directory, acceptedR1);
    const state = JSON.parse(acquiredBefore.toString());
    assert.notEqual(reading.source_binding_digest, state.summary.source_binding_digest);
    assert.deepEqual(await run(directory), corrected);
    const acceptedEvidenceR1 = JSON.parse(await readFile(
      path.join(directory, 'accepted/r001/evidence-claims.json')
    ));
    const repair = evidenceRepairCandidate(acceptedR1, acceptedEvidenceR1);
    await stage(directory, 'source_pack', repair.source);
    await stage(directory, 'evidence_claims', repair.evidence);
    const repaired = await run(directory);
    assert.notEqual(repaired.incomplete_reason?.code, 'V4_CLARIFICATION_APPEND_INVALID');
    assert.equal(repaired.status, 'need_user_answers', JSON.stringify(repaired));
    assert.equal(JSON.parse(await readFile(
      path.join(directory, 'accepted/r002/source-pack.json')
    )).source_revision, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
