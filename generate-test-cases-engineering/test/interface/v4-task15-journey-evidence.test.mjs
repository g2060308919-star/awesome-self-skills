import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import sourcePackSchema from '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { constructSemanticClarificationEventV4 } from '../../src/clarification.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import {
  canonicalizeAuditedSourceCapture, createExpiryMatcherRegistry
} from '../../src/source-capture-audit.mjs';
import { createSourceProviderRegistry } from '../../src/source-canonicalization.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

const transactionModuleUrl = new URL('../../src/revision-transaction-v4.mjs', import.meta.url).href;
const installedRunnerModuleUrl = new URL(
  '../../skill/generate-test-cases/scripts/test-compiler.mjs', import.meta.url
).href;
/** @type {any[]} */
const providerRegistry = [{
  provider: 'cooper', version: '1', hosts: ['prd-assets.example.invalid'],
  kind: 'cooper', query_order: 'sensitive'
}];
const emptyProviderRegistry = createSourceProviderRegistry([]);
const emptyExpiryRegistry = createExpiryMatcherRegistry([]);

/** @param {string} directory */
async function installedAdvanceStrict(directory) {
  const installed = /** @type {{advanceStrict:(directory:string)=>Promise<unknown>}} */ (
    await import(installedRunnerModuleUrl)
  );
  return installed.advanceStrict(directory);
}

/** @param {string|Uint8Array} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** @param {string} value */
function maskRotatingSignedQuery(value) {
  return value
    .replace(/([?&]X-Amz-Date=)[^&)\s]+/gu, '$1<rotated>')
    .replace(/([?&]X-Amz-Signature=)[^&)\s]+/gu, '$1<rotated>');
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stageName @param {any} value */
async function stage(directory, stageName, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stageName]),
    `${canonicalStringify(value)}\n`, 'utf8'
  );
}

/** @param {string} target */
async function exists(target) {
  try { await stat(target); return true; } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/** @param {any} presentation @param {RegExp} pattern */
function questionPart(presentation, pattern) {
  const parts = presentation.question_parts.filter(
    (/** @type {any} */ part) => pattern.test(part.question)
  );
  assert.equal(parts.length, 1, pattern.source);
  return parts[0];
}

/** @param {any} presentation @param {RegExp} pattern @param {string} answer
 * @param {{resolution?:'temporary'|'final',authority?:'task_scoped'|'product_final'}} [options] */
function answerEvent(presentation, pattern, answer, options = {}) {
  const part = questionPart(presentation, pattern);
  const prefix = '答复：';
  const message = `${prefix}${answer}`;
  const start = Array.from(prefix).length;
  return {
    part,
    event: constructSemanticClarificationEventV4(
      presentation, part, 'answer_question_part', {
        answer, resolution: options.resolution ?? 'temporary',
        authority: options.authority ?? 'task_scoped',
        answer_origin: {
          type: 'user_statement', presentation_id: presentation.presentation_id,
          message_digest: byteDigest(message),
          answer_span: {
            start_scalar: start, end_scalar: start + Array.from(answer).length,
            excerpt_digest: byteDigest(answer)
          }
        }
      }
    )
  };
}

/** @param {string} directory @param {string} runId
 * @param {(directory:string)=>Promise<unknown>} [advance] */
async function startQuestionJourney(directory, runId, advance = advanceStrict) {
  await ensureV4RunInstance(directory, { run_id: runId, delivery_intent: 'case_document' });
  const fixture = await bendReviewJourneyFixture(runId);
  await stage(directory, 'source_pack', fixture.artifacts.source_pack);
  const evidenceRequest = /** @type {any} */ (await advance(directory));
  assert.equal(evidenceRequest.status, 'need_artifact', JSON.stringify(evidenceRequest));
  assert.equal(evidenceRequest.stage, 'evidence_claims');
  await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
  const pending = /** @type {any} */ (await advance(directory));
  assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
  assert.equal(pending.phase, 'requirements_analysis');
  assert.equal(pending.semantic_presentation.question_parts.length, 3);
  return { fixture, pending };
}

/** @param {string} directory @param {any} manifest @param {'bundle'|'markdown'|'execution_worksheet'} key */
async function readVerifiedArtifact(directory, manifest, key) {
  const text = await readFile(path.join(directory, manifest[key].path), 'utf8');
  assert.equal(byteDigest(text), manifest[key].digest, `${key} digest`);
  return text;
}

test('T09 installed runner rejects a stale answer without turning the recoverable state into fatal', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-task09-stale-answer-'));
  const runId = 'RUN-19191919-1919-4919-8919-191919191919';
  try {
    const { pending } = await startQuestionJourney(directory, runId, installedAdvanceStrict);
    const ip = answerEvent(
      pending.semantic_presentation, /IP/u, '发布者提交评价时的 IP 归属地'
    );
    const revision1 = await bendReviewJourneyFixture(runId, 1, [ip.event]);
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const afterIp = /** @type {any} */ (await installedAdvanceStrict(directory));
    assert.equal(afterIp.status, 'need_user_answers', JSON.stringify(afterIp));
    assert.equal(afterIp.semantic_presentation.question_parts.length, 2);
    const pendingCheckpointBytes = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');

    const staleIp = answerEvent(
      pending.semantic_presentation, /IP/u, '评价地点信息'
    );
    const staleRevision2 = await bendReviewJourneyFixture(
      runId, 2, [ip.event, staleIp.event]
    );
    await stage(directory, 'source_pack', staleRevision2.artifacts.source_pack);
    const staleWhilePending = /** @type {any} */ (await installedAdvanceStrict(directory));
    assert.equal(staleWhilePending.status, 'need_user_answers', JSON.stringify(staleWhilePending));
    assert.equal(
      staleWhilePending.semantic_presentation.presentation_id,
      afterIp.semantic_presentation.presentation_id
    );
    assert.deepEqual(staleWhilePending.non_blocking_diagnostics, [{
      code: 'STALE_ANSWER', severity: 'warning',
      message: '该答复针对的问题版本已失效；请以当前展示的问题为准。',
      source_event_id: staleIp.event.event_id,
      affected_question_part_ids: [staleIp.part.question_part_id]
    }]);
    assert.equal(await exists(path.join(directory, 'accepted/r002/source-pack.json')), false);
    assert.equal(await exists(path.join(directory, 'staging/source-pack.json')), false);
    assert.equal(
      await readFile(path.join(directory, 'checkpoint.json'), 'utf8'),
      pendingCheckpointBytes
    );

    const empty = answerEvent(afterIp.semantic_presentation, /空值/u, '—');
    const sorting = answerEvent(afterIp.semantic_presentation, /排序/u, '降序');
    const revision2 = await bendReviewJourneyFixture(
      runId, 2, [ip.event, empty.event, sorting.event]
    );
    await stage(directory, 'source_pack', revision2.artifacts.source_pack);
    const behaviorRequest = /** @type {any} */ (await installedAdvanceStrict(directory));
    assert.equal(behaviorRequest.status, 'need_artifact', JSON.stringify(behaviorRequest));
    assert.equal(behaviorRequest.stage, 'behavior_views');
    const closedCheckpointBytes = await readFile(path.join(directory, 'checkpoint.json'), 'utf8');

    const staleRevision3 = await bendReviewJourneyFixture(
      runId, 3, [ip.event, empty.event, sorting.event, staleIp.event]
    );
    await stage(directory, 'source_pack', staleRevision3.artifacts.source_pack);
    const staleAfterClose = /** @type {any} */ (await installedAdvanceStrict(directory));
    assert.equal(staleAfterClose.status, 'need_artifact', JSON.stringify(staleAfterClose));
    assert.equal(staleAfterClose.stage, 'behavior_views');
    assert.deepEqual(staleAfterClose.non_blocking_diagnostics, [{
      code: 'STALE_ANSWER', severity: 'warning',
      message: '该答复针对的问题版本已失效；请以当前展示的问题为准。',
      source_event_id: staleIp.event.event_id,
      affected_question_part_ids: [staleIp.part.question_part_id]
    }]);
    assert.equal(await exists(path.join(directory, 'accepted/r003/source-pack.json')), false);
    assert.equal(await exists(path.join(directory, 'staging/source-pack.json')), false);
    assert.equal(
      await readFile(path.join(directory, 'checkpoint.json'), 'utf8'),
      closedCheckpointBytes
    );

    const cleanReplay = /** @type {any} */ (await installedAdvanceStrict(directory));
    assert.equal(cleanReplay.status, 'need_artifact', JSON.stringify(cleanReplay));
    assert.equal(cleanReplay.stage, 'behavior_views');
    assert.deepEqual(cleanReplay.non_blocking_diagnostics, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

/** @param {string} directory @param {number} revision */
async function revisionTransactionRequest(directory, revision) {
  const transactionDirectory = path.join(directory, 'transactions/revisions');
  const records = await Promise.all((await readdir(transactionDirectory)).map(async (/** @type {string} */ file) =>
    JSON.parse(await readFile(path.join(transactionDirectory, file), 'utf8'))));
  const matches = records.filter(record => record.candidate_revision === revision
    && record.commit_profile === 'pre_case_pending' && record.phase === 'complete');
  assert.equal(matches.length, 1, `pre-case transaction r${revision}`);
  const record = matches[0];
  const revisionName = `r${String(revision).padStart(3, '0')}`;
  const json = async (/** @type {string} */ relativePath) => ({
    format: 'json', value: JSON.parse(await readFile(path.join(directory, relativePath), 'utf8'))
  });
  return {
    append_id: record.append_id,
    append_digest: record.append_digest,
    base_revision: record.base_revision,
    candidate_revision: record.candidate_revision,
    commit_profile: record.commit_profile,
    semantic_digest: record.semantic_digest,
    artifacts: {
      source_pack: await json(`accepted/${revisionName}/source-pack.json`),
      decision_journal: await json(`derived/${revisionName}/decision-journal.json`),
      evidence_claims: await json(`accepted/${revisionName}/evidence-claims.json`),
      fact_ledger: await json(`derived/${revisionName}/fact-ledger.json`),
      scope_manifest: await json(`derived/${revisionName}/scope-manifest.json`),
      clarification_state: await json(`derived/${revisionName}/clarification-state.json`),
      checkpoint: await json(`derived/${revisionName}/checkpoint.json`)
    }
  };
}

/** @param {string} driverPath @param {string} directory @param {string} requestPath */
function runCrashDriver(driverPath, directory, requestPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      driverPath, directory, requestPath, transactionModuleUrl
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code, /** @type {string|null} */ signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

test('T15 carries final-authority downgrade warnings into the next stage request', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-task15-authority-warning-'));
  const runId = 'RUN-16161616-1616-4616-8616-161616161616';
  try {
    const { pending } = await startQuestionJourney(directory, runId);
    const events = [
      answerEvent(pending.semantic_presentation, /IP/u, '发布者提交评价时的 IP 归属地', {
        resolution: 'final', authority: 'task_scoped'
      }).event,
      answerEvent(pending.semantic_presentation, /空值/u, '空值按未分配展示', {
        resolution: 'final', authority: 'task_scoped'
      }).event,
      answerEvent(pending.semantic_presentation, /排序/u, '按业务线、来源、星级依次排序', {
        resolution: 'final', authority: 'task_scoped'
      }).event
    ];
    const revision1 = await bendReviewJourneyFixture(runId, 1, events);
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const reply = /** @type {any} */ (await advanceStrict(directory));

    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.stage, 'behavior_views');
    assert.deepEqual(
      reply.non_blocking_diagnostics.map((/** @type {any} */ item) => item.code),
      events.map(() => 'FINAL_AUTHORITY_NOT_GRANTED')
    );

    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const replay = /** @type {any} */ (await advanceStrict(directory));
    assert.deepEqual(replay.non_blocking_diagnostics, reply.non_blocking_diagnostics);

    const laterResume = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(laterResume.status, 'need_artifact', JSON.stringify(laterResume));
    assert.equal(laterResume.stage, 'behavior_views');
    assert.deepEqual(laterResume.non_blocking_diagnostics, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T15 carries accepted final-authority warnings through a downstream need_revision replay exactly once', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-task15-authority-revision-'));
  const runId = 'RUN-17171717-1717-4717-8717-171717171717';
  try {
    const { pending } = await startQuestionJourney(directory, runId);
    const events = [
      answerEvent(pending.semantic_presentation, /IP/u, '发布者提交评价时的 IP 归属地', {
        resolution: 'final', authority: 'task_scoped'
      }).event,
      answerEvent(pending.semantic_presentation, /空值/u, '空值按未分配展示', {
        resolution: 'final', authority: 'task_scoped'
      }).event,
      answerEvent(pending.semantic_presentation, /排序/u, '按业务线、来源、星级依次排序', {
        resolution: 'final', authority: 'task_scoped'
      }).event
    ];
    const revision1 = await bendReviewJourneyFixture(runId, 1, events);
    await stage(directory, 'behavior_views', { invalid: true });
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const reply = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(reply.status, 'need_revision', JSON.stringify(reply));
    assert.equal(reply.stage, 'behavior_views');
    assert.deepEqual(
      reply.non_blocking_diagnostics.map((/** @type {any} */ item) => item.code),
      events.map(() => 'FINAL_AUTHORITY_NOT_GRANTED')
    );

    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const replay = /** @type {any} */ (await advanceStrict(directory));
    assert.deepEqual(replay.non_blocking_diagnostics, reply.non_blocking_diagnostics);

    await rm(path.join(directory, 'staging/behavior-views.json'));
    const later = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(later.status, 'need_artifact', JSON.stringify(later));
    assert.equal(later.stage, 'behavior_views');
    assert.deepEqual(later.non_blocking_diagnostics, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T15 durable runner preserves a blank turn, records explicit defer, then separately closes that gap and delivers seven canonical Cases', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-task15-durable-'));
  const runId = 'RUN-15151515-1515-4515-8515-151515151515';
  try {
    const { fixture: revision0, pending: initial } = await startQuestionJourney(directory, runId);
    const ip = answerEvent(
      initial.semantic_presentation, /IP/u, '发布者提交评价时的 IP 归属地'
    );
    const revision1 = await bendReviewJourneyFixture(runId, 1, [ip.event]);
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const afterIp = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(afterIp.status, 'need_user_answers', JSON.stringify(afterIp));
    assert.deepEqual(afterIp.semantic_presentation.answered_part_ids, [ip.part.question_part_id]);
    assert.equal(afterIp.semantic_presentation.question_parts.length, 2);

    // A blank/unparseable user turn is normalized by the Adapter to no event.
    // Re-entering the durable runner must replay the same committed presentation.
    const afterBlank = /** @type {any} */ (await advanceStrict(directory));
    assert.deepEqual(afterBlank, afterIp);
    assert.equal(afterBlank.semantic_presentation.recovery.committed_revision, 1);
    assert.equal(await exists(path.join(directory, 'accepted/r002/source-pack.json')), false);

    const empty = answerEvent(afterBlank.semantic_presentation, /空值/u, '—');
    const sorting = questionPart(afterBlank.semantic_presentation, /排序/u);
    const deferSorting = constructSemanticClarificationEventV4(
      afterBlank.semantic_presentation, sorting, 'defer_question_part'
    );
    const revision2 = await bendReviewJourneyFixture(
      runId, 2, [ip.event, empty.event, deferSorting]
    );
    await stage(directory, 'source_pack', revision2.artifacts.source_pack);
    const afterDefer = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(afterDefer.status, 'need_artifact', JSON.stringify(afterDefer));
    assert.equal(afterDefer.stage, 'behavior_views');
    const deferredCheckpoint = JSON.parse(await readFile(
      path.join(directory, 'derived/r002/checkpoint.json'), 'utf8'
    ));
    const sortingState = deferredCheckpoint.clarification_state.root_states.find(
      (/** @type {any} */ state) => state.question_part_id === sorting.question_part_id
    );
    assert.equal(sortingState?.status, 'deferred_by_user');

    // BR-15 requires an explicit delivery request before a real gap can appear
    // in delivered_with_gaps. It is a distinct append from the preceding defer.
    const requestSortingDelivery = constructSemanticClarificationEventV4(
      afterBlank.semantic_presentation, sorting, 'request_delivery'
    );
    const revision3 = await bendReviewJourneyFixture(
      runId, 3, [ip.event, empty.event, deferSorting, requestSortingDelivery]
    );
    assert.deepEqual(validateAgainstSchema(revision3.artifacts.source_pack, sourcePackSchema), []);
    await stage(directory, 'source_pack', revision3.artifacts.source_pack);
    const afterDeliveryRequest = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(afterDeliveryRequest.status, 'need_artifact', JSON.stringify(afterDeliveryRequest));
    assert.equal(afterDeliveryRequest.stage, 'behavior_views');
    const closedCheckpoint = JSON.parse(await readFile(
      path.join(directory, 'derived/r003/checkpoint.json'), 'utf8'
    ));
    const closedSortingState = closedCheckpoint.clarification_state.root_states.find(
      (/** @type {any} */ state) => state.question_part_id === sorting.question_part_id
    );
    assert.equal(closedSortingState?.status, 'closed_for_delivery');

    await stage(directory, 'behavior_views', revision3.artifacts.behavior_views);
    const caseRequest = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(caseRequest.status, 'need_artifact', JSON.stringify(caseRequest));
    assert.equal(caseRequest.stage, 'case_drafts');
    await stage(directory, 'case_drafts', revision3.artifacts.case_drafts);
    const finished = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.result_kind, 'delivered_with_gaps');
    assert.deepEqual(validateAgainstSchema(finished, replySchema), []);

    const manifestBytes = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.authority, 'canonical');
    assert.equal(manifest.case_count, 7);
    assert.equal(manifest.blocked_root_count, 1);
    assert.equal(manifest.closed_for_delivery_root_count, 1);
    assert.deepEqual(finished.produced_artifacts.map((/** @type {any} */ item) => item.kind), [
      'case_document', 'business_markdown', 'execution_worksheet'
    ]);
    const bundleText = await readVerifiedArtifact(directory, manifest, 'bundle');
    const markdown = await readVerifiedArtifact(directory, manifest, 'markdown');
    const worksheet = await readVerifiedArtifact(directory, manifest, 'execution_worksheet');
    const bundle = JSON.parse(bundleText);
    assert.equal(bundle.cases.length, 7);
    assert.equal(new Set(bundle.cases.map((/** @type {any} */ item) => item.case_id)).size, 7);
    assert.equal(bundle.semantic_root_groups.find(
      (/** @type {any} */ root) => /sort/u.test(`${root.title} ${root.business_object}`)
    )?.status, 'closed_for_delivery');
    for (const title of revision0.expectations.case_titles) assert.match(markdown, new RegExp(title, 'u'));
    assert.equal(worksheet.split('\n').filter((/** @type {string} */ line) => line.startsWith('CASE-')).length, 7);
    assert.deepEqual(finished.produced_artifacts, [
      { kind: 'case_document', path: manifest.bundle.path, digest: manifest.bundle.digest },
      { kind: 'business_markdown', path: manifest.markdown.path, digest: manifest.markdown.digest },
      {
        kind: 'execution_worksheet', path: manifest.execution_worksheet.path,
        digest: manifest.execution_worksheet.digest
      }
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T15 process crash after transaction reservation recovers one IP Decision and leaves the other pre-case roots pending', { timeout: 60_000 }, async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-task15-crash-'));
  const shadow = path.join(catalog, 'shadow');
  const crashed = path.join(catalog, 'crashed');
  const runId = 'RUN-25252525-2525-4525-8525-252525252525';
  try {
    await mkdir(shadow, { recursive: true });
    await mkdir(crashed, { recursive: true });
    const shadowStart = await startQuestionJourney(shadow, runId);
    const crashedStart = await startQuestionJourney(crashed, runId);
    assert.deepEqual(crashedStart.pending.semantic_presentation, shadowStart.pending.semantic_presentation);
    const ip = answerEvent(
      crashedStart.pending.semantic_presentation, /IP/u, '发布者提交评价时的 IP 归属地'
    );
    const revision1 = await bendReviewJourneyFixture(runId, 1, [ip.event]);

    await stage(shadow, 'source_pack', revision1.artifacts.source_pack);
    const shadowResult = /** @type {any} */ (await advanceStrict(shadow));
    assert.equal(shadowResult.status, 'need_user_answers', JSON.stringify(shadowResult));
    const transactionRequest = await revisionTransactionRequest(shadow, 1);

    await stage(crashed, 'source_pack', revision1.artifacts.source_pack);
    const baseCheckpoint = await readFile(path.join(crashed, 'checkpoint.json'), 'utf8');
    const requestPath = path.join(catalog, 'pre-case-request.json');
    const driverPath = path.join(catalog, 'revision-crash-driver.mjs');
    await writeFile(requestPath, `${canonicalStringify(transactionRequest)}\n`, 'utf8');
    await writeFile(driverPath, [
      "import { readFile } from 'node:fs/promises';",
      'const [directory, requestPath, moduleUrl] = process.argv.slice(2);',
      'const request = JSON.parse(await readFile(requestPath, \'utf8\'));',
      'const { commitRevisionTransactionV4 } = await import(moduleUrl);',
      'await commitRevisionTransactionV4(directory, request, {',
      '  after_phase(phase) {',
      "    if (phase === 'reserved') process.kill(process.pid, 'SIGKILL');",
      '  }',
      '});',
      "throw new Error('FAULT_HOOK_DID_NOT_KILL_PROCESS');",
      ''
    ].join('\n'), 'utf8');

    const child = /** @type {any} */ (await runCrashDriver(driverPath, crashed, requestPath));
    assert.equal(child.signal, 'SIGKILL', `${child.stdout}\n${child.stderr}`);
    assert.equal(child.code, null);
    const pendingTransaction = JSON.parse(await readFile(
      path.join(crashed, 'staging/pending-revision.json'), 'utf8'
    ));
    assert.equal(pendingTransaction.phase, 'reserved');
    assert.equal(pendingTransaction.commit_profile, 'pre_case_pending');
    assert.equal(await readFile(path.join(crashed, 'checkpoint.json'), 'utf8'), baseCheckpoint);
    assert.equal(await exists(path.join(crashed, 'accepted/r001/source-pack.json')), false);

    // A fresh production-runner invocation owns no state from the killed process.
    const recovered = /** @type {any} */ (await advanceStrict(crashed));
    assert.equal(recovered.status, 'need_user_answers', JSON.stringify(recovered));
    assert.equal(recovered.semantic_presentation.question_parts.length, 2);
    assert.equal(await exists(path.join(crashed, 'staging/pending-revision.json')), false);

    const checkpoint = JSON.parse(await readFile(
      path.join(crashed, 'derived/r001/checkpoint.json'), 'utf8'
    ));
    const source = JSON.parse(await readFile(
      path.join(crashed, 'accepted/r001/source-pack.json'), 'utf8'
    ));
    const journal = JSON.parse(await readFile(
      path.join(crashed, 'derived/r001/decision-journal.json'), 'utf8'
    ));
    const ipRoot = checkpoint.semantic_gap_ledger.find(
      (/** @type {any} */ root) => /IP/u.test(root.question)
    );
    assert.ok(ipRoot);
    assert.equal(source.clarification_events.filter(
      (/** @type {any} */ event) => event.event_id === ip.event.event_id
    ).length, 1);
    assert.equal(source.decision_records.length, 1);
    assert.equal(journal.decisions.length, 1);
    assert.equal(journal.decisions[0].target.root_issue_id, ipRoot.root_issue_id);
    assert.deepEqual(checkpoint.clarification_state.answered_part_ids, [ip.part.question_part_id]);
    assert.equal(checkpoint.clarification_state.root_states.find(
      (/** @type {any} */ state) => state.root_issue_id === ipRoot.root_issue_id
    )?.status, 'resolved_temporary');
    for (const pattern of [/空值/u, /排序/u]) {
      const root = checkpoint.semantic_gap_ledger.find(
        (/** @type {any} */ item) => pattern.test(item.question)
      );
      assert.equal(checkpoint.clarification_state.root_states.find(
        (/** @type {any} */ state) => state.root_issue_id === root?.root_issue_id
      )?.status, 'presented', pattern.source);
    }
    assert.equal(await exists(path.join(crashed, 'output/current.json')), false);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

/** @param {'signed-source-a.md'|'signed-source-b.md'} sourceFile @param {number} index */
async function deliverSignedVariant(sourceFile, index) {
  const directory = await mkdtemp(path.join(os.tmpdir(), `gtc-v4-task15-signed-${index}-`));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(initial.status, 'need_artifact', JSON.stringify(initial));
    const fixture = await bendReviewJourneyFixture(
      initial.scope.run_instance_id, 0, [], {
        source_file: sourceFile, source_providers: providerRegistry
      }
    );
    const source = fixture.artifacts.source_pack.sources[0];
    const rawCaptureDigest = source.capture_digest;
    assert.match(fixture.raw.content, /[?&]X-Amz-Signature=/u);
    assert.doesNotMatch(source.semantic_projection.content, /[?&]X-Amz-Signature=/u);

    // The provider adapter has already erased the signed query from the safe
    // semantic capture. Re-capture those credential-free bytes at the durable
    // runner boundary so production can independently recompute the audit
    // without access to the fixture-only provider registry or raw signed URI.
    const safeCapture = canonicalizeAuditedSourceCapture({
      stable_source_id: source.source_id,
      source_type: source.kind,
      capture_bytes: new TextEncoder().encode(source.semantic_projection.content),
      assets: []
    }, emptyProviderRegistry, {}, emptyExpiryRegistry);
    assert.equal(safeCapture.status, 'canonical');
    const safeProjection = {
      ...safeCapture.semantic_projection,
      structure: source.semantic_projection.structure
    };
    assert.equal(`sha256:${digest(safeProjection)}`, source.semantic_digest);
    source.capture_digest = safeCapture.capture_digest;
    source.capture_audit = safeCapture.capture_audit;
    source.semantic_projection = safeProjection;
    fixture.artifacts.evidence_claims.semantic_gaps = [];
    let reply = initial;
    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
      await stage(directory, stageName, fixture.artifacts[stageName]);
      reply = /** @type {any} */ (await advanceStrict(directory));
    }
    assert.equal(reply.status, 'finished', JSON.stringify(reply));
    assert.equal(reply.result_kind, 'delivered_cases');
    assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
    const manifestBytes = await readFile(path.join(directory, 'output/current.json'), 'utf8');
    const manifest = JSON.parse(manifestBytes);
    const bundleText = await readVerifiedArtifact(directory, manifest, 'bundle');
    const markdown = await readVerifiedArtifact(directory, manifest, 'markdown');
    await readVerifiedArtifact(directory, manifest, 'execution_worksheet');
    const acceptedSource = JSON.parse(await readFile(
      path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'
    ));
    const acceptedEvidence = JSON.parse(await readFile(
      path.join(directory, 'accepted/r000/evidence-claims.json'), 'utf8'
    ));
    const bundle = JSON.parse(bundleText);
    assert.notEqual(rawCaptureDigest, acceptedSource.sources[0].capture_digest);
    return {
      raw_capture_digest: rawCaptureDigest,
      masked_raw_capture: maskRotatingSignedQuery(fixture.raw.content),
      durable_capture_digest: acceptedSource.sources[0].capture_digest,
      semantic_projection_digest: acceptedSource.sources[0].semantic_digest,
      fact_ids: acceptedEvidence.fact_ledger.map((/** @type {any} */ fact) => fact.fact_id).sort(),
      case_ids: bundle.cases.map((/** @type {any} */ item) => item.case_id),
      markdown
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('T15 signed-query-only variants traverse full production runners to semantically identical final deliveries', { timeout: 60_000 }, async () => {
  const first = await deliverSignedVariant('signed-source-a.md', 1);
  const second = await deliverSignedVariant('signed-source-b.md', 2);
  assert.notEqual(first.raw_capture_digest, second.raw_capture_digest);
  assert.equal(first.masked_raw_capture, second.masked_raw_capture);
  assert.equal(first.durable_capture_digest, second.durable_capture_digest);
  assert.equal(first.semantic_projection_digest, second.semantic_projection_digest);
  assert.deepEqual(first.fact_ids, second.fact_ids);
  assert.deepEqual(first.case_ids, second.case_ids);
  assert.equal(first.markdown, second.markdown);
  assert.equal(first.case_ids.length, 7);
});
