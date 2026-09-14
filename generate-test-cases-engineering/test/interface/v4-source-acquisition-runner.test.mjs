import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { advanceStrict } from '../../src/advance-strict.mjs';
import { constructV4Action } from '../../src/agent-action-adapter-v4.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { createProvideArtifactEvent } from '../../src/source-events.mjs';
import { createSourceProviderRegistry, sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { createExpiryMatcherRegistry } from '../../src/source-capture-audit.mjs';
import { compileAuditedSource } from '../../src/source-compiler-v4.mjs';
import {
  constructCancelRunEventV4, createResumeCancelledSiblingV4
} from '../../src/run-cancellation-v4.mjs';
import {
  loadSourceAcquisitionCompilerStateV4, stageV4SourceAcquisitionAction
} from '../../src/source-acquisition-v4.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';
import { seedLegacyV4RunInstance } from '../helpers/v4-run-contract-fixture.mjs';

const providerRegistry = createSourceProviderRegistry([]);
const cooperProviderRegistry = createSourceProviderRegistry([{
  provider: 'cooper', version: '1', hosts: ['cooper.test', 'prd-assets.example.invalid'],
  kind: 'cooper', query_order: 'sensitive'
}]);
const expiryPrefix = '<span data-cooper-expiry="v1">临时链接将在 ';
const expirySuffix = ' 小时后过期</span>';
const cooperExpiryRegistry = createExpiryMatcherRegistry([{
  provider: 'cooper', provider_contract_version: '1', matcher_version: 'cooper-expiry-v1',
  prefix: expiryPrefix, suffix: expirySuffix
}]);

/** @param {any} event */
function reidentify(event) {
  const { event_id: ignored, ...payload } = event;
  return { ...payload, event_id: `EVENT-${digest(payload)}` };
}

/** @param {string} directory @param {string} eventId */
function materialPath(directory, eventId) {
  return path.join(directory, 'staging', 'source-acquisition', `${eventId}.bin`);
}

/** @param {string} directory @param {number} [requestCount] */
async function pendingAcquisition(directory, requestCount = 1) {
  const initial = /** @type {any} */ (await advanceStrict(directory));
  const input = v4PipelineFixture();
  input.artifacts.source_pack.run_instance_id = initial.scope.run_instance_id;
  const unsafeLinks = Array.from({ length: requestCount }, (_, index) =>
    `[private-${index}](https://unknown.example.invalid/doc?id=${index + 7}&signature=AUDIT_SECRET_${index})`
  ).join('\n');
  input.artifacts.source_pack.sources[0].content += `\n${unsafeLinks}`;
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(path.join(directory, 'staging/source-pack.json'),
    `${canonicalStringify(input.artifacts.source_pack)}\n`, 'utf8');
  const reply = /** @type {any} */ (await advanceStrict(directory));
  return { initial, input, reply };
}

/** @param {any} input @param {any} reply */
function resumedCandidate(input, reply) {
  const candidate = v4PipelineFixture().artifacts.source_pack;
  candidate.run_instance_id = input.artifacts.source_pack.run_instance_id;
  const bytes = new TextEncoder().encode(candidate.sources[0].semantic_projection.content);
  candidate.artifact_events = reply.artifact_requests.map((/** @type {any} */ request, /** @type {number} */ index) =>
    createProvideArtifactEvent(request, reply.resume_ref, {
      kind: 'safe_upload_ref', upload_id: `UPLOAD-${index + 1}`, media_type: 'text/markdown',
      byte_length: bytes.byteLength, content_digest: sourceByteDigest(bytes)
    }, providerRegistry)
  );
  return { candidate, bytes };
}

/** @param {string} root @returns {Promise<string[]>} */
async function files(root) {
  /** @type {string[]} */ const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await files(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stageName @param {any} value */
async function stage(directory, stageName, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stageName]),
    `${canonicalStringify(value)}\n`, 'utf8'
  );
}

/** @param {string} directory @param {string} runId */
async function startSemanticQuestion(directory, runId) {
  await seedLegacyV4RunInstance(directory, { run_id: runId, delivery_intent: 'case_document' });
  const fixture = await bendReviewJourneyFixture(runId);
  await stage(directory, 'source_pack', fixture.artifacts.source_pack);
  assert.equal((/** @type {any} */ (await advanceStrict(directory))).stage, 'evidence_claims');
  await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
  const reply = /** @type {any} */ (await advanceStrict(directory));
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  assert.equal(reply.phase, 'requirements_analysis');
  return { fixture, reply };
}

/** @param {any} reply @param {RegExp} pattern @param {string} answer */
function answerRequest(reply, pattern, answer) {
  const matches = reply.semantic_presentation.question_parts.filter(
    (/** @type {any} */ part) => pattern.test(part.question)
  );
  assert.equal(matches.length, 1, pattern.source);
  const userMessage = `答复：${answer}`;
  return {
    event: constructV4Action(reply, {
      action: 'answer_question_part', question_part_id: matches[0].question_part_id,
      answer, user_message: userMessage, resolution: 'temporary',
      origin_type: 'user_statement'
    }),
    userMessage
  };
}

/** Stage a safe replacement for a quarantined semantic append through the
 * production Adapter seam. @param {string} directory @param {any} blocked
 * @param {any} safeSource @param {Uint8Array} material */
async function stageSafeSemanticResume(directory, blocked, safeSource, material) {
  return stageV4SourceAcquisitionAction(
    directory, blocked, safeSource,
    blocked.artifact_requests.map((/** @type {any} */ request, /** @type {number} */ index) => ({
      artifact_request_id: request.artifact_request_id,
      input: {
        kind: 'safe_upload_ref', upload_id: `UPLOAD-semantic-${index + 1}`,
        media_type: 'text/markdown', byte_length: material.byteLength,
        content_digest: sourceByteDigest(material)
      },
      material
    }))
  );
}

/** @param {any} source */
function sourceMetadata(source) {
  return Object.fromEntries([
    'source_id', 'kind', 'version', 'status', 'authority', 'title', 'scope', 'domain'
  ].filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}

/** @param {any} source @param {Uint8Array} captureBytes @param {any[]} assets @param {any} acquisition */
function compiledSource(source, captureBytes, assets, acquisition = {}) {
  const result = compileAuditedSource(sourceMetadata(source), {
    source_id: source.source_id,
    input: {
      stable_source_id: source.source_id, source_type: source.kind,
      capture_bytes: captureBytes, assets
    },
    acquisition,
    additional_units: []
  }, {
    provider_registry: cooperProviderRegistry,
    expiry_registry: cooperExpiryRegistry
  });
  assert.equal(result.status, 'canonical', JSON.stringify(result));
  return result.source;
}

test('v4 runner quarantines an unknown signed source before any credential-bearing bytes become durable', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-quarantine-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const input = v4PipelineFixture();
    input.artifacts.source_pack.run_instance_id = initial.scope.run_instance_id;
    const secret = 'AUDIT_SECRET_DO_NOT_PERSIST';
    input.artifacts.source_pack.sources[0].content +=
      `\nhttps://unknown.example.invalid/doc?id=7&signature=${secret}`;
    await mkdir(path.join(directory, 'staging'), { recursive: true });
    await writeFile(
      path.join(directory, 'staging/source-pack.json'),
      `${canonicalStringify(input.artifacts.source_pack)}\n`, 'utf8'
    );

    const reply = /** @type {any} */ (await advanceStrict(directory));

    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.phase, 'source_acquisition');
    assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
    assert.equal(reply.incomplete_reason.code, 'UNSUPPORTED_SIGNED_URL_PROVIDER');
    assert.deepEqual(reply.available_actions, ['provide_artifact', 'cancel_run']);
    assert.doesNotMatch(JSON.stringify(reply), /AUDIT_SECRET|signature=|id=7|https:\/\/unknown/iu);
    await assert.rejects(readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(directory, 'staging/source-pack.json'), 'utf8'), { code: 'ENOENT' });
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /AUDIT_SECRET|signature=|id=7/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('BR-13 pre-case clarification quarantines a signed answer before r+1 promotion and resumes one safe semantic event', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-pre-case-answer-'));
  const runId = 'RUN-31313131-3131-4313-8313-313131313131';
  try {
    const { reply } = await startSemanticQuestion(directory, runId);
    const secret = 'PRE_CASE_ANSWER_SECRET';
    const unsafeAnswer = `https://unknown.example.invalid/decision?id=17&signature=${secret}`;
    const unsafe = answerRequest(reply, /IP/u, unsafeAnswer);
    const unsafeRevision = await bendReviewJourneyFixture(runId, 1, [unsafe.event], {
      clarification_messages: [unsafe.userMessage]
    });
    await stage(directory, 'source_pack', unsafeRevision.artifacts.source_pack);

    const blocked = /** @type {any} */ (await advanceStrict(directory));

    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));
    assert.equal(blocked.phase, 'source_acquisition');
    assert.equal(blocked.incomplete_reason.code, 'UNSUPPORTED_SIGNED_URL_PROVIDER');
    await assert.rejects(readFile(path.join(directory, 'accepted/r001/source-pack.json')), { code: 'ENOENT' });
    const quarantinedText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(quarantinedText, /PRE_CASE_ANSWER_SECRET|signature=|id=17/iu);

    const safe = answerRequest(reply, /IP/u, '发布者提交评价时的 IP 归属地');
    const safeRevision = await bendReviewJourneyFixture(runId, 1, [safe.event], {
      clarification_messages: [safe.userMessage]
    });
    const material = new TextEncoder().encode(
      safeRevision.artifacts.source_pack.sources[0].semantic_projection.content
    );
    await stageSafeSemanticResume(
      directory, blocked, safeRevision.artifacts.source_pack, material
    );

    const resumed = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(resumed.status, 'need_user_answers', JSON.stringify(resumed));
    assert.equal(resumed.phase, 'requirements_analysis');
    const accepted = JSON.parse(await readFile(
      path.join(directory, 'accepted/r001/source-pack.json'), 'utf8'
    ));
    assert.deepEqual(accepted.clarification_events, [safe.event]);
    assert.equal(accepted.decision_records.length, 1);
    assert.equal(accepted.decision_records[0].answer, '发布者提交评价时的 IP 归属地');
    assert.deepEqual(await advanceStrict(directory), resumed,
      'recovery must replay the accepted semantic event instead of appending it twice');
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /PRE_CASE_ANSWER_SECRET|signature=|id=17/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('BR-13 clarification acquisition stop remains cancellable without reviving the quarantined answer', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-answer-cancel-'));
  const runId = 'RUN-33333333-3333-4333-8333-333333333333';
  try {
    const { fixture, reply } = await startSemanticQuestion(directory, runId);
    const unsafe = answerRequest(
      reply, /IP/u,
      'https://unknown.example.invalid/cancel?id=51&signature=CANCELLED_ANSWER_SECRET'
    );
    const unsafeRevision = await bendReviewJourneyFixture(runId, 1, [unsafe.event], {
      clarification_messages: [unsafe.userMessage]
    });
    await stage(directory, 'source_pack', unsafeRevision.artifacts.source_pack);
    const blocked = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));

    const cancellation = constructV4Action(blocked, { action: 'cancel_run' });
    const cancelledCandidate = structuredClone(fixture.artifacts.source_pack);
    cancelledCandidate.source_revision = 1;
    cancelledCandidate.clarification_events = [cancellation];
    await stage(directory, 'source_pack', cancelledCandidate);
    const cancelled = /** @type {any} */ (await advanceStrict(directory));

    assert.equal(cancelled.status, 'cancelled', JSON.stringify(cancelled));
    assert.deepEqual(await advanceStrict(directory), cancelled);
    await assert.rejects(readFile(path.join(directory, 'accepted/r001/source-pack.json')), { code: 'ENOENT' });
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /CANCELLED_ANSWER_SECRET|signature=|id=51/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('BR-13 post-case clarification quarantines a signed answer and resumes the same pending root exactly once', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-post-case-answer-'));
  const runId = 'RUN-32323232-3232-4323-8323-323232323232';
  try {
    await seedLegacyV4RunInstance(directory, { run_id: runId, delivery_intent: 'case_document' });
    const fixture = await bendReviewJourneyFixture(runId);
    fixture.artifacts.evidence_claims.semantic_gaps = [{
      ...structuredClone(fixture.artifacts.evidence_claims.semantic_gaps[0]),
      discovery_phase: 'post_case'
    }];
    for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (
      ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']
    )) {
      await stage(directory, stageName, fixture.artifacts[stageName]);
      var pending = /** @type {any} */ (await advanceStrict(directory));
    }
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    assert.equal(pending.phase, 'case_design');

    const secret = 'POST_CASE_ANSWER_SECRET';
    const unsafeAnswer = `https://unknown.example.invalid/refresh?id=23&signature=${secret}`;
    const unsafe = answerRequest(pending, /IP/u, unsafeAnswer);
    const unsafeRevision = await bendReviewJourneyFixture(runId, 1, [unsafe.event], {
      clarification_messages: [unsafe.userMessage]
    });
    await stage(directory, 'source_pack', unsafeRevision.artifacts.source_pack);
    const blocked = /** @type {any} */ (await advanceStrict(directory));

    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));
    assert.equal(blocked.phase, 'source_acquisition');
    await assert.rejects(readFile(path.join(directory, 'accepted/r001/source-pack.json')), { code: 'ENOENT' });
    const quarantinedText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(quarantinedText, /POST_CASE_ANSWER_SECRET|signature=|id=23/iu);

    const safe = answerRequest(pending, /IP/u, '发布者提交评价时的 IP 归属地');
    const safeRevision = await bendReviewJourneyFixture(runId, 1, [safe.event], {
      clarification_messages: [safe.userMessage]
    });
    const material = new TextEncoder().encode(
      safeRevision.artifacts.source_pack.sources[0].semantic_projection.content
    );
    await stageSafeSemanticResume(
      directory, blocked, safeRevision.artifacts.source_pack, material
    );
    const resumed = /** @type {any} */ (await advanceStrict(directory));

    assert.equal(resumed.status, 'finished', JSON.stringify(resumed));
    const accepted = JSON.parse(await readFile(
      path.join(directory, 'accepted/r001/source-pack.json'), 'utf8'
    ));
    assert.deepEqual(accepted.clarification_events, [safe.event]);
    assert.equal(accepted.decision_records.length, 1);
    assert.equal(accepted.decision_records[0].answer, '发布者提交评价时的 IP 归属地');
    assert.deepEqual(await advanceStrict(directory), resumed);
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /POST_CASE_ANSWER_SECRET|signature=|id=23/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('BR-13 acquired capture receipts allow only verified user-statement append and reject base capture mutation', { timeout: 60_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-acquired-append-'));
  try {
    await seedLegacyV4RunInstance(directory);
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const runId = initial.scope.run_instance_id;
    const fixture = await bendReviewJourneyFixture(runId);
    const unsafeSource = structuredClone(fixture.artifacts.source_pack);
    unsafeSource.sources[0].content +=
      '\nhttps://unknown.example.invalid/prd?id=31&signature=ACQUIRED_APPEND_SECRET';
    await stage(directory, 'source_pack', unsafeSource);
    const blocked = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));
    const material = new TextEncoder().encode(
      fixture.artifacts.source_pack.sources[0].semantic_projection.content
    );
    await stageSafeSemanticResume(
      directory, blocked, fixture.artifacts.source_pack, material
    );
    const evidenceRequest = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(evidenceRequest.stage, 'evidence_claims', JSON.stringify(evidenceRequest));
    const acquiredR0 = JSON.parse(await readFile(
      path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'
    ));
    await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
    const pending = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));

    const unsafe = answerRequest(
      pending, /IP/u,
      'https://unknown.example.invalid/decision?id=41&signature=SECOND_ACQUISITION_SECRET'
    );
    const unsafeRevision = await bendReviewJourneyFixture(
      runId, 1, [unsafe.event], { clarification_messages: [unsafe.userMessage] }
    );
    unsafeRevision.artifacts.source_pack.artifact_events = structuredClone(acquiredR0.artifact_events);
    await stage(directory, 'source_pack', unsafeRevision.artifacts.source_pack);
    const appendBlocked = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(appendBlocked.status, 'need_artifact', JSON.stringify(appendBlocked));
    assert.equal(appendBlocked.phase, 'source_acquisition');
    await assert.rejects(readFile(path.join(directory, 'accepted/r001/source-pack.json')), { code: 'ENOENT' });

    const answers = [
      answerRequest(pending, /IP/u, '发布者提交评价时的 IP 归属地'),
      answerRequest(pending, /空值/u, '—'),
      answerRequest(pending, /排序/u, '降序')
    ];
    const revision1 = await bendReviewJourneyFixture(
      runId, 1, answers.map(item => item.event),
      { clarification_messages: answers.map(item => item.userMessage) }
    );
    revision1.artifacts.source_pack.artifact_events = structuredClone(acquiredR0.artifact_events);
    await stageSafeSemanticResume(
      directory, appendBlocked, revision1.artifacts.source_pack, material
    );
    const behaviorRequest = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(behaviorRequest.status, 'need_revision', JSON.stringify(behaviorRequest));
    assert.equal(behaviorRequest.stage, 'behavior_views');

    const acceptedR1 = JSON.parse(await readFile(
      path.join(directory, 'accepted/r001/source-pack.json'), 'utf8'
    ));
    const tampered = structuredClone(acceptedR1);
    const baseUnit = tampered.sources[0].semantic_projection.structure.find(
      (/** @type {any} */ unit) => unit.type !== 'user_statement'
    );
    baseUnit.text += ' tampered';
    await assert.rejects(
      loadSourceAcquisitionCompilerStateV4(directory, tampered),
      /SOURCE_ACQUISITION_STATE_INVALID/u
    );

    revision1.artifacts.behavior_views.source_revision = 1;
    await stage(directory, 'behavior_views', revision1.artifacts.behavior_views);
    const caseRequest = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(caseRequest.status, 'need_revision', JSON.stringify(caseRequest));
    assert.equal(caseRequest.stage, 'case_drafts');
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(
      durableText,
      /ACQUIRED_APPEND_SECRET|SECOND_ACQUISITION_SECRET|signature=|id=(?:31|41)/iu
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T11 registered-provider signed URI is also acquisition-only and can never be promoted as Source Pack text', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-registered-quarantine-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const input = v4PipelineFixture();
    input.artifacts.source_pack.run_instance_id = initial.scope.run_instance_id;
    const secret = 'REGISTERED_PROVIDER_SECRET';
    input.artifacts.source_pack.sources[0].content +=
      `\nhttps://cooper.test/doc?business=7&X-Amz-Signature=${secret}`;
    await mkdir(path.join(directory, 'staging'), { recursive: true });
    await writeFile(path.join(directory, 'staging/source-pack.json'),
      `${canonicalStringify(input.artifacts.source_pack)}\n`, 'utf8');

    const reply = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    assert.equal(reply.incomplete_reason.code, 'SOURCE_ASSET_UNAVAILABLE');
    assert.deepEqual(reply.artifact_requests[0].allowed_input_kinds,
      ['stable_resource_id', 'safe_upload_ref']);
    await assert.rejects(readFile(path.join(directory, 'accepted/r000/source-pack.json')), { code: 'ENOENT' });
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /REGISTERED_PROVIDER_SECRET|X-Amz-Signature|business=7/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v4 runner durably replays one exact need_artifact request set bound to the checkpoint bytes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-replay-'));
  try {
    const { reply } = await pendingAcquisition(directory, 2);
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    const checkpoint = await readFile(path.join(directory, 'checkpoint.json'));
    assert.equal(reply.resume_ref.committed_checkpoint_digest, sourceByteDigest(checkpoint));
    assert.equal(reply.artifact_requests.length, 2);

    const replay = await advanceStrict(directory);
    assert.deepEqual(replay, reply, 'a restart must replay the committed acquisition stop, not ask for a new Source Pack');
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /AUDIT_SECRET|signature=|[?&]id=/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T12 source-acquisition cancellation is terminal, idempotent, secret-free, and resumes only in a new sibling', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-cancel-catalog-'));
  const runId = 'RUN-10101010-1010-4010-8010-101010101010';
  const siblingRunId = 'RUN-20202020-2020-4020-8020-202020202020';
  const directory = path.join(catalog, 'runs', runId);
  try {
    await mkdir(directory, { recursive: true });
    await ensureV4RunInstance(directory, {
      run_id: runId, delivery_intent: 'case_document'
    });
    const { input, reply } = await pendingAcquisition(directory);
    assert.equal(reply.phase, 'source_acquisition');
    const candidate = structuredClone(input.artifacts.source_pack);
    candidate.clarification_events = [constructCancelRunEventV4(reply.cancel_context)];
    await writeFile(
      path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(candidate)}\n`, 'utf8'
    );

    const first = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(first.status, 'cancelled', JSON.stringify(first));
    assert.equal(first.phase, 'source_acquisition');
    assert.equal(first.result_kind, 'cancelled');
    assert.deepEqual(validateAgainstSchema(first, replySchema), []);
    assert.deepEqual(await advanceStrict(directory), first, 'repeat cancellation must replay exact terminal reply');
    await assert.rejects(readFile(path.join(directory, 'accepted/r000/source-pack.json')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(directory, 'output/current.json')), { code: 'ENOENT' });
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /AUDIT_SECRET|signature=|[?&]id=/iu);

    const ordinaryAppend = v4PipelineFixture().artifacts.source_pack;
    ordinaryAppend.run_instance_id = runId;
    await mkdir(path.join(directory, 'staging'), { recursive: true });
    await writeFile(
      path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(ordinaryAppend)}\n`, 'utf8'
    );
    assert.deepEqual(await advanceStrict(directory), first, 'a cancelled run rejects ordinary append by replaying terminal state');
    await assert.rejects(readFile(path.join(directory, 'accepted/r000/source-pack.json')), { code: 'ENOENT' });

    const sibling = await createResumeCancelledSiblingV4(catalog, {
      parent_run_id: runId, run_id: siblingRunId
    });
    assert.deepEqual(sibling.lineage, {
      parent_run_id: runId, creation_reason: 'resume_cancelled'
    });
    const resumed = /** @type {any} */ (await advanceStrict(path.join(catalog, 'runs', siblingRunId)));
    assert.equal(resumed.status, 'need_revision', JSON.stringify(resumed));
    assert.equal(resumed.stage, 'source_pack');
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('v4 runner consumes schema-valid provide_artifact events only through digest-bound private bytes and replays idempotently', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-resume-'));
  try {
    const { input, reply } = await pendingAcquisition(directory);
    const { candidate, bytes } = resumedCandidate(input, reply);
    for (const event of candidate.artifact_events) {
      await mkdir(path.dirname(materialPath(directory, event.event_id)), { recursive: true });
      await writeFile(materialPath(directory, event.event_id), bytes);
    }
    await writeFile(path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(candidate)}\n`, 'utf8');

    const accepted = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(accepted.status, 'need_revision', JSON.stringify(accepted));
    assert.equal(accepted.stage, 'evidence_claims');
    const acceptedSource = JSON.parse(await readFile(path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'));
    assert.deepEqual(acceptedSource.artifact_events, candidate.artifact_events);
    const stateBeforeReplay = await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8');

    assert.deepEqual(await advanceStrict(directory), accepted);
    assert.equal(await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8'), stateBeforeReplay);

    // A crash may leave the acquisition record committed immediately before
    // Source Pack promotion. Replaying the identical event repairs that exact
    // promotion without another material read or acquisition append.
    await rm(path.join(directory, 'accepted/r000/source-pack.json'));
    await writeFile(path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(candidate)}\n`, 'utf8');
    assert.deepEqual(await advanceStrict(directory), accepted);
    assert.equal(await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8'), stateBeforeReplay);

    await writeFile(path.join(directory, 'staging/evidence-claims.json'),
      `${canonicalStringify(v4PipelineFixture().artifacts.evidence_claims)}\n`, 'utf8');
    const continued = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(continued.status, 'need_revision', JSON.stringify(continued));
    assert.equal(continued.stage, 'behavior_views');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T11 production runner resolves a registered stable Cooper resource, applies the versioned expiry matcher, and persists no raw material', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-cooper-'));
  try {
    const { input, reply } = await pendingAcquisition(directory);
    assert.equal(reply.status, 'need_artifact', JSON.stringify(reply));
    const candidate = v4PipelineFixture().artifacts.source_pack;
    candidate.run_instance_id = input.artifacts.source_pack.run_instance_id;
    const original = candidate.sources[0];
    const secret = 'COOPER_SIGNED_VALUE_MUST_NOT_PERSIST';
    const rawText = original.semantic_projection.content
      + `\n\n[contract](https://cooper.test/doc?business=7&X-Amz-Signature=${secret})`
      + `${expiryPrefix}3${expirySuffix}`;
    const rawBytes = new TextEncoder().encode(rawText);
    candidate.sources[0] = compiledSource(original, rawBytes, [], {
      provider: 'cooper', provider_contract_version: '1'
    });
    candidate.artifact_events = [createProvideArtifactEvent(
      reply.artifact_requests[0], reply.resume_ref,
      {
        kind: 'stable_resource_id', provider: 'cooper', provider_contract_version: '1',
        resource_id: 'documents/review-contract'
      },
      cooperProviderRegistry
    )];
    const event = candidate.artifact_events[0];
    await mkdir(path.dirname(materialPath(directory, event.event_id)), { recursive: true });
    await writeFile(materialPath(directory, event.event_id), rawBytes);
    await writeFile(path.join(directory, 'staging/source-pack.json'),
      `${canonicalStringify(candidate)}\n`, 'utf8');

    const accepted = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(accepted.status, 'need_revision', JSON.stringify(accepted));
    assert.equal(accepted.stage, 'evidence_claims');
    const persisted = JSON.parse(await readFile(
      path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'
    ));
    assert.equal(persisted.sources[0].capture_audit.semantic_exclusions.length, 1);
    assert.doesNotMatch(JSON.stringify(persisted), /COOPER_SIGNED_VALUE|X-Amz-Signature|data-cooper-expiry|临时链接将在/iu);
    await assert.rejects(readFile(materialPath(directory, event.event_id)), { code: 'ENOENT' });
    assert.equal((await files(directory)).some(file => file.endsWith('.b64')), false,
      'accepted acquisition must not retain a base64 copy of the raw signed capture');
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /COOPER_SIGNED_VALUE|X-Amz-Signature|data-cooper-expiry|临时链接将在/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T11 production runner reuses the digest receipt for an expiry-audited source during Evidence compilation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-receipt-'));
  try {
    const { input, reply } = await pendingAcquisition(directory);
    const fixture = v4PipelineFixture();
    const candidate = fixture.artifacts.source_pack;
    candidate.run_instance_id = input.artifacts.source_pack.run_instance_id;
    const original = candidate.sources[0];
    const rawBytes = new TextEncoder().encode(
      original.semantic_projection.content + `${expiryPrefix}9${expirySuffix}`
    );
    candidate.sources[0] = compiledSource(original, rawBytes, [], {
      provider: 'cooper', provider_contract_version: '1'
    });
    candidate.artifact_events = [createProvideArtifactEvent(
      reply.artifact_requests[0], reply.resume_ref,
      {
        kind: 'stable_resource_id', provider: 'cooper', provider_contract_version: '1',
        resource_id: 'documents/review-contract'
      },
      cooperProviderRegistry
    )];
    const event = candidate.artifact_events[0];
    await mkdir(path.dirname(materialPath(directory, event.event_id)), { recursive: true });
    await writeFile(materialPath(directory, event.event_id), rawBytes);
    await writeFile(path.join(directory, 'staging/source-pack.json'),
      `${canonicalStringify(candidate)}\n`, 'utf8');
    const sourceAccepted = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(sourceAccepted.stage, 'evidence_claims', JSON.stringify(sourceAccepted));

    await writeFile(path.join(directory, 'staging/evidence-claims.json'),
      `${canonicalStringify(fixture.artifacts.evidence_claims)}\n`, 'utf8');
    const evidenceAccepted = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(evidenceAccepted.status, 'need_revision', JSON.stringify(evidenceAccepted));
    assert.equal(evidenceAccepted.stage, 'behavior_views');
    assert.equal((await files(directory)).some(file => file.endsWith('.b64')), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T11 production runner blocks a missing normative asset, then binds verified asset bytes to the requested asset target', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-asset-'));
  try {
    const initial = /** @type {any} */ (await advanceStrict(directory));
    const fixture = v4PipelineFixture();
    const candidate = fixture.artifacts.source_pack;
    candidate.run_instance_id = initial.scope.run_instance_id;
    const source = candidate.sources[0];
    const assetUri = 'https://assets.test/rules/recommendation.png';
    // The attachment is explicitly inventoried by Source Pack even though the
    // text does not embed a mutable retrieval URI.
    const sourceBytes = new TextEncoder().encode(source.semantic_projection.content);
    candidate.sources[0] = compiledSource(source, sourceBytes, [], {});
    candidate.source_assets = [{
      asset_id: 'ASSET-recommendation-rule', source_id: source.source_id,
      locator_id: candidate.locators[0].locator_id, status: 'unavailable',
      classification: 'normative',
      review_basis: { reviewer: 'operator', method: 'inspection', evidence: 'normative rule image' },
      canonical_uri: assetUri
    }];
    await mkdir(path.join(directory, 'staging'), { recursive: true });
    await writeFile(path.join(directory, 'staging/source-pack.json'),
      `${canonicalStringify(candidate)}\n`, 'utf8');

    const blocked = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));
    assert.equal(blocked.incomplete_reason.code, 'SOURCE_ASSET_UNAVAILABLE');
    assert.equal(blocked.artifact_requests.length, 1);
    await assert.rejects(readFile(path.join(directory, 'accepted/r000/source-pack.json')), { code: 'ENOENT' });
    await assert.rejects(readFile(path.join(directory, 'accepted/r000/evidence-claims.json')), { code: 'ENOENT' });

    const assetBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const resumed = structuredClone(candidate);
    resumed.sources[0] = compiledSource(source, sourceBytes, [{
      retrieval_uri: assetUri, bytes: assetBytes
    }], {});
    resumed.source_assets[0].status = 'reviewed';
    resumed.source_assets[0].classification = 'non_normative';
    resumed.source_assets[0].review_basis.evidence = 'verified decorative attachment';
    resumed.source_assets[0].asset_digest = sourceByteDigest(assetBytes);
    for (const locator of resumed.locators) {
      if (locator.source_id === source.source_id) {
        locator.semantic_digest = resumed.sources[0].semantic_digest;
      }
    }
    resumed.source_reviews[0].semantic_digest = resumed.sources[0].semantic_digest;
    resumed.artifact_events = [createProvideArtifactEvent(
      blocked.artifact_requests[0], blocked.resume_ref,
      {
        kind: 'safe_upload_ref', upload_id: 'UPLOAD-normative-asset', media_type: 'image/png',
        byte_length: assetBytes.byteLength, content_digest: sourceByteDigest(assetBytes)
      }, providerRegistry
    )];
    const event = resumed.artifact_events[0];
    await mkdir(path.dirname(materialPath(directory, event.event_id)), { recursive: true });
    await writeFile(materialPath(directory, event.event_id), assetBytes);
    await writeFile(path.join(directory, 'staging/source-pack.json'),
      `${canonicalStringify(resumed)}\n`, 'utf8');

    const accepted = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(accepted.status, 'need_revision', JSON.stringify(accepted));
    assert.equal(accepted.stage, 'evidence_claims');
    const persisted = JSON.parse(await readFile(
      path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'
    ));
    assert.deepEqual(persisted.sources[0].semantic_projection.assets, [{
      canonical_uri: assetUri, asset_digest: sourceByteDigest(assetBytes)
    }]);
    await assert.rejects(readFile(materialPath(directory, event.event_id)), { code: 'ENOENT' });
    assert.equal((await files(directory)).some(file => file.endsWith('.b64')), false);

    await writeFile(path.join(directory, 'staging/evidence-claims.json'),
      `${canonicalStringify(fixture.artifacts.evidence_claims)}\n`, 'utf8');
    const evidenceAccepted = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(evidenceAccepted.status, 'need_revision', JSON.stringify(evidenceAccepted));
    assert.equal(evidenceAccepted.stage, 'behavior_views');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const [name, mutate, expectedCode] of /** @type {Array<[string,(event:any)=>void,string]>} */ ([
  ['stale committed revision', event => { event.resume_ref.committed_revision += 1; }, 'ARTIFACT_RESUME_STALE'],
  ['stale checkpoint digest', event => { event.resume_ref.committed_checkpoint_digest = `sha256:${'f'.repeat(64)}`; }, 'ARTIFACT_RESUME_STALE'],
  ['stale request-set digest', event => { event.resume_ref.request_set_digest = `sha256:${'e'.repeat(64)}`; }, 'ARTIFACT_RESUME_STALE'],
  ['stale request version', event => { event.request_version_digest = `sha256:${'d'.repeat(64)}`; }, 'ARTIFACT_REQUEST_STALE'],
  ['signed resource input', event => {
    event.input = {
      kind: 'stable_resource_id', provider: 'unknown', provider_contract_version: '1',
      resource_id: 'https://unknown.example.invalid/doc?signature=SHOULD_NOT_BE_READ'
    };
  }, 'ARTIFACT_INPUT_INVALID']
])) test(`v4 runner rejects ${name} before material read or committed mutation`, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-stale-'));
  try {
    const { input, reply } = await pendingAcquisition(directory);
    const { candidate } = resumedCandidate(input, reply);
    mutate(candidate.artifact_events[0]);
    candidate.artifact_events[0] = reidentify(candidate.artifact_events[0]);
    await writeFile(path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(candidate)}\n`, 'utf8');
    const before = await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8');

    const rejected = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.ok(rejected.diagnostics.some((/** @type {any} */ item) => item.code === expectedCode), JSON.stringify(rejected));
    await assert.rejects(readFile(path.join(directory, 'accepted/r000/source-pack.json')), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8'), before);
    if (name === 'signed resource input') {
      const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
      assert.doesNotMatch(durableText, /SHOULD_NOT_BE_READ|signature=/iu);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v4 runner deletes credential-bearing private material when byte verification fails', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-secret-material-'));
  try {
    const { input, reply } = await pendingAcquisition(directory);
    const { candidate } = resumedCandidate(input, reply);
    const unsafeBytes = new TextEncoder().encode(
      'https://unknown.example.invalid/doc?id=99&signature=MATERIAL_SECRET'
    );
    candidate.artifact_events[0] = createProvideArtifactEvent(
      reply.artifact_requests[0], reply.resume_ref, {
        kind: 'safe_upload_ref', upload_id: 'UPLOAD-unsafe', media_type: 'text/plain',
        byte_length: unsafeBytes.byteLength, content_digest: sourceByteDigest(unsafeBytes)
      }, providerRegistry
    );
    await mkdir(path.dirname(materialPath(directory, candidate.artifact_events[0].event_id)), { recursive: true });
    await writeFile(materialPath(directory, candidate.artifact_events[0].event_id), unsafeBytes);
    await writeFile(path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(candidate)}\n`, 'utf8');

    const rejected = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.ok(rejected.diagnostics.some((/** @type {any} */ item) =>
      item.code === 'ARTIFACT_SOURCE_BINDING_INVALID'), JSON.stringify(rejected));
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /MATERIAL_SECRET|signature=|id=99/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('T11 incomplete private byte batch is discarded instead of retaining a partial raw capture', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-partial-material-'));
  try {
    const { input, reply } = await pendingAcquisition(directory, 2);
    const { candidate } = resumedCandidate(input, reply);
    const first = candidate.artifact_events[0];
    const secretBytes = new TextEncoder().encode(
      'https://unknown.example.invalid/doc?signature=PARTIAL_MATERIAL_SECRET'
    );
    await mkdir(path.dirname(materialPath(directory, first.event_id)), { recursive: true });
    await writeFile(materialPath(directory, first.event_id), secretBytes);
    await writeFile(path.join(directory, 'staging/source-pack.json'),
      `${canonicalStringify(candidate)}\n`, 'utf8');

    const stopped = /** @type {any} */ (await advanceStrict(directory));
    assert.equal(stopped.status, 'need_artifact', JSON.stringify(stopped));
    assert.equal(stopped.phase, 'source_acquisition');
    await assert.rejects(readFile(materialPath(directory, first.event_id)), { code: 'ENOENT' });
    const durableText = (await Promise.all((await files(directory)).map(file => readFile(file, 'utf8')))).join('\n');
    assert.doesNotMatch(durableText, /PARTIAL_MATERIAL_SECRET|signature=/iu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('v4 runner rejects incomplete request sets and source/material binding mismatches atomically', async () => {
  for (const mode of ['incomplete-set', 'binding-mismatch']) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-source-atomic-'));
    try {
      const { input, reply } = await pendingAcquisition(directory, mode === 'incomplete-set' ? 2 : 1);
      const { candidate, bytes } = resumedCandidate(input, reply);
      const submittedEvents = [...candidate.artifact_events];
      if (mode === 'incomplete-set') candidate.artifact_events.pop();
      for (const event of submittedEvents) {
        await mkdir(path.dirname(materialPath(directory, event.event_id)), { recursive: true });
        await writeFile(materialPath(directory, event.event_id), mode === 'binding-mismatch'
          ? new TextEncoder().encode('different source bytes') : bytes);
      }
      await writeFile(path.join(directory, 'staging/source-pack.json'), `${canonicalStringify(candidate)}\n`, 'utf8');
      const before = await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8');

      const rejected = /** @type {any} */ (await advanceStrict(directory));
      assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
      const expected = mode === 'incomplete-set' ? 'ARTIFACT_REQUEST_SET_INCOMPLETE' : 'ARTIFACT_SOURCE_BINDING_INVALID';
      assert.ok(rejected.diagnostics.some((/** @type {any} */ item) => item.code === expected), JSON.stringify(rejected));
      await assert.rejects(readFile(path.join(directory, 'accepted/r000/source-pack.json')), { code: 'ENOENT' });
      assert.equal(await readFile(path.join(directory, 'derived/source-acquisition.json'), 'utf8'), before);
      for (const event of submittedEvents) {
        await assert.rejects(readFile(materialPath(directory, event.event_id)), { code: 'ENOENT' });
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});
