import { currentAcquisitionContextV4, readAcquisitionSnapshotV4 } from '../../src/source-acquisition-context-v4.mjs';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
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
import { stageCollection } from '../helpers/v4-reliability-fixture.mjs';

const runner = fileURLToPath(new URL('../../skill/generate-test-cases/scripts/test-compiler.mjs', import.meta.url));
const contract = latestV4Contract();

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


for (const corruption of ['active', 'shared_fact', 'shared_claim']) {
  test(`T01-T03 presentation rejects ${corruption} target ownership before asking`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-target-red-'));
    try {
      const runId = 'RUN-0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
      const fixture = bindGeneralQualityFixture(await bendReviewJourneyFixture(runId), contract.schema_version);
      const evidence = fixture.artifacts.evidence_claims;
      const [first, second] = evidence.semantic_gaps;
      if (corruption === 'active') evidence.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === first.subject_fact_ids[0]).status = 'active';
      if (corruption === 'shared_fact') second.subject_fact_ids = [...first.subject_fact_ids];
      if (corruption === 'shared_claim') {
        const target = evidence.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === second.subject_fact_ids[0]);
        const owner = evidence.fact_ledger.find((/** @type {any} */ fact) => fact.fact_id === first.subject_fact_ids[0]);
        target.claim_ids = [...owner.claim_ids]; target.field_path = owner.field_path;
      }
      await ensureV4RunInstance(directory, { run_id: runId, delivery_intent: 'case_document', contract });
      await stageCollection(directory, await run(directory), fixture.artifacts.source_pack);
      await stage(directory, 'source_pack', fixture.artifacts.source_pack);
      assert.equal((await run(directory)).stage, 'evidence_claims');
      await stage(directory, 'evidence_claims', evidence);
      const reply = await run(directory);
      assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
      assert.ok(!reply.semantic_presentation);
      assert.match(JSON.stringify(reply), /CLARIFICATION_(?:TARGET|WRITE)_/);
      await assert.rejects(readFile(path.join(directory, 'accepted/r000/evidence-claims.json')), { code: 'ENOENT' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}
test('T08-T09 acquired material then semantic rejection must allow accepted-base Evidence repair', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-acquired-semantic-'));
  try {
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
    const rejectedContext = await currentAcquisitionContextV4(directory);
    assert.equal(rejectedContext.phase, 'rejected');
    const rejectedMaterial = await readAcquisitionSnapshotV4(directory, rejectedContext.state_ref);
    assert.equal(rejectedMaterial.status, 'acquired');
    assert.equal(rejectedMaterial.committed_revision, 1);
    assert.equal(JSON.parse(await readFile(path.join(directory, 'checkpoint.json'))).revision, 0);
    const priorEvidence = JSON.parse(await readFile(path.join(directory, 'accepted/r000/evidence-claims.json')));
    const before = await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8');
    const repair = evidenceRepairCandidate(acceptedR0, priorEvidence);
    await stage(directory, 'source_pack', repair.source);
    await stage(directory, 'evidence_claims', repair.evidence);
    const repaired = await run(directory);
    assert.equal(repaired.status, 'need_user_answers', JSON.stringify(repaired));
    const acceptedRepair = JSON.parse(await readFile(path.join(directory, 'accepted/r001/source-pack.json')));
    assert.deepEqual(acceptedRepair.artifact_events, acceptedR0.artifact_events);
    assert.deepEqual(acceptedRepair.clarification_events, acceptedR0.clarification_events);
    assert.deepEqual(acceptedRepair.decision_records, acceptedR0.decision_records);
    assert.equal(await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'), before);
    assert.deepEqual(await run(directory), repaired);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
