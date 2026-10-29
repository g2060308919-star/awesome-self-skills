import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { canonicalStringify } from '../../src/canonical.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { bindGeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const installedRunner = path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs'
);

/** @param {string|Uint8Array} value */
function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}

/** @param {string} directory */
function runInstalled(directory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [installedRunner, directory], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => resolve({ code, stdout, stderr }));
  });
}

/** @param {any} result */
function oneReply(result) {
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.endsWith('\n'), true);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, 'installed runner stdout is exactly one JSON reply');
  const reply = JSON.parse(lines[0]);
  assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
  return reply;
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stage @param {any} artifact */
async function stage(directory, stage, artifact) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stage]),
    `${canonicalStringify(artifact)}\n`, 'utf8'
  );
}

/** @param {number} index */
async function installedJourney(index) {
  const installed = /** @type {any} */ (await import(pathToFileURL(installedRunner).href));
  const catalog = await mkdtemp(path.join(os.tmpdir(), `gtc-v4-installed-${index}-`));
  try {
    const { run_directory: directory, run_id: runId } = await installed.createV4RunDirectory(catalog, 'case_document');
    const instance = JSON.parse(await readFile(path.join(directory, 'run-instance.json'), 'utf8'));
    const replies = [];
    const initial = oneReply(await runInstalled(directory));
    replies.push(`${initial.status}/${initial.stage ?? initial.result_kind ?? 'done'}`);
    assert.equal(initial.status, 'need_revision', JSON.stringify(initial));
    assert.equal(initial.stage, 'source_pack');
    assert.equal(initial.scope.run_instance_id, runId);
    const fixture = bindGeneralQualityFixture(await bendReviewJourneyFixture(runId), instance.schema_version);
    const source = fixture.artifacts.source_pack.sources[0];
    const bytes = new TextEncoder().encode(source.content);
    await installed.stageV4PrdCollectionObservation(directory, initial, {
      version: '1.0.0',
      scope: {
        mode: 'provided_materials', root_ref: 'provided:installed-repeatability-prd',
        source_version: source.version,
        collection_window: {
          started_at: '2026-10-22T00:00:00.000Z', ended_at: '2026-10-22T00:00:01.000Z'
        }
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
        asset_id: null, unit_ids: source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id),
        acquisition_status: 'acquired', review_status: 'reviewed', unavailable_reason: null
      }]
    }, [{ item_id: 'provided-body', raw_response_bytes: bytes, capture_bytes: bytes }]);
    // Preserve this fixture's seven-case business projection; semantic closure
    // is exercised separately by the installed full-flow reliability tests.
    fixture.artifacts.evidence_claims.semantic_gaps = [];
    const review = fixture.artifacts.case_drafts.independent_review;
    fixture.artifacts.case_drafts.independent_review = {
      protocol_version: review.protocol_version, status: 'pending', review_mode: review.review_mode,
      reviewer_identity: structuredClone(review.reviewer_identity),
      source_first_targets: review.source_first_targets.map((/** @type {any} */ target) => {
        const { target_id: _targetId, ...sourceTarget } = target;
        return sourceTarget;
      })
    };

    let reviewReply;
    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
      await stage(directory, stageName, fixture.artifacts[stageName]);
      const reply = oneReply(await runInstalled(directory));
      replies.push(`${reply.status}/${reply.stage ?? reply.result_kind ?? 'done'}`);
      reviewReply = reply;
    }
    assert.equal(reviewReply.status, 'need_revision', JSON.stringify(reviewReply));
    assert.ok(reviewReply.review_request, JSON.stringify(reviewReply));
    assert.deepEqual(oneReply(await runInstalled(directory)), reviewReply, 'pending review replays exactly');
    const request = reviewReply.review_request;
    fixture.artifacts.case_drafts.independent_review = installed.constructIndependentReviewCompletionV4(reviewReply, {
      target_assessments: request.source_first_targets.map((/** @type {any} */ target) => {
        const candidate = request.review_target_projection.cases.find((/** @type {any} */ candidate) =>
          candidate.oracles.some((/** @type {any} */ oracle) =>
            oracle.claim_ids.some((/** @type {string} */ claimId) => target.source_claim_ids.includes(claimId))));
        assert.ok(candidate, 'synthetic review identifies a source-supported Case');
        return {
          target_id: target.target_id, disposition: 'verified',
          affected_items: [{ item_kind: 'case', item_id: candidate.case_id }],
          source_claim_ids: target.source_claim_ids, decision_ids: target.decision_ids,
          rationale: '测试夹具的独立复核已核对来源目标、步骤和预期结果。',
          required_recheck: { status: 'passed', affected_items: [{ item_kind: 'case', item_id: candidate.case_id }] }
        };
      }), findings: []
    });
    await stage(directory, 'case_drafts', fixture.artifacts.case_drafts);
    const finished = oneReply(await runInstalled(directory));
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    replies.push(`${finished.status}/${finished.result_kind}`);
    const replay = oneReply(await runInstalled(directory));
    replies.push(`${replay.status}/${replay.stage ?? replay.result_kind ?? 'done'}`);
    assert.equal(replay.status, 'finished', JSON.stringify(replay));
    assert.deepEqual(replay, finished, 'finished reply replays exactly');
    const manifestBytes = await readFile(path.join(directory, 'output/current.json'));
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    const bundleBytes = await readFile(path.join(directory, manifest.bundle.path));
    const markdownBytes = await readFile(path.join(directory, manifest.markdown.path));
    const worksheetBytes = await readFile(path.join(directory, manifest.execution_worksheet.path));
    assert.equal(JSON.parse(bundleBytes.toString('utf8')).cases.length, 7);
    assert.equal(`sha256:${sha(bundleBytes)}`, manifest.bundle.digest);
    assert.equal(`sha256:${sha(markdownBytes)}`, manifest.markdown.digest);
    assert.equal(`sha256:${sha(worksheetBytes)}`, manifest.execution_worksheet.digest);
    return {
      runId: initial.scope.run_instance_id,
      replies,
      bundleDigest: sha(bundleBytes),
      markdownDigest: sha(markdownBytes),
      worksheetDigest: sha(worksheetBytes)
    };
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
}

test('T15 installed v4 runner is deterministic across three fresh durable directories', { timeout: 120_000 }, async () => {
  const observations = [];
  for (let index = 0; index < 3; index += 1) observations.push(await installedJourney(index));

  assert.equal(new Set(observations.map(item => item.runId)).size, 3);
  assert.deepEqual(observations.map(item => item.replies), Array.from({ length: 3 }, () => [
    'need_revision/source_pack',
    'need_revision/evidence_claims',
    'need_revision/behavior_views',
    'need_revision/case_drafts',
    'need_revision/case_drafts',
    'finished/delivered_cases',
    'finished/delivered_cases'
  ]));
  for (const field of ['bundleDigest', 'markdownDigest', 'worksheetDigest']) {
    assert.equal(new Set(observations.map((/** @type {any} */ item) => item[field])).size, 1, field);
  }
  assert.match(sha(await readFile(installedRunner)), /^[0-9a-f]{64}$/u);
});
