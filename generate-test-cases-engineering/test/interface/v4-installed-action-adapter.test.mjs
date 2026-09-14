import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import sourcePackSchema from '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { createArtifactRequest, createArtifactResumeRef } from '../../src/source-events.mjs';
import { createNeedArtifactReplyV4 } from '../../src/stop-replies-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import {
  createV4ExecutionPresentation, createV4FinalConfirmationPresentation,
  deriveV4ExecutionReadinessTarget, verifyAndRecomputeV4ExecutionReadiness
} from '../../src/execution-events.mjs';
import { createV4ExecutionPendingReply } from '../../src/execution-run-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';

const bundlePath = fileURLToPath(new URL(
  '../../skill/generate-test-cases/scripts/test-compiler.mjs', import.meta.url
));

/** @param {string|Uint8Array} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

test('installed run bootstrap couples a compiler ID to one canonical sibling directory', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-bootstrap-'));
  try {
    const first = await installed.createV4RunDirectory(catalog, 'case_document');
    const second = await installed.createV4RunDirectory(catalog, 'execution_plan');
    assert.notEqual(first.run_id, second.run_id);
    for (const created of [first, second]) {
      assert.equal(path.basename(created.run_directory), created.run_id);
      assert.equal(path.basename(path.dirname(created.run_directory)), 'runs');
      const instance = JSON.parse(await readFile(
        path.join(created.run_directory, 'run-instance.json'), 'utf8'
      ));
      assert.equal(instance.run_id, created.run_id);
      assert.equal(instance.delivery_intent, created.delivery_intent);
    }
    await assert.rejects(
      installed.createV4RunDirectory('relative/catalog', 'case_document'),
      /BOOTSTRAP_INPUT_INVALID/u
    );
    await assert.rejects(
      installed.createV4RunDirectory(catalog, 'unknown'),
      /BOOTSTRAP_INPUT_INVALID/u
    );
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

/** @param {string} directory @param {keyof typeof STAGE_FILES} stageName @param {any} value */
async function stage(directory, stageName, value) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stageName]),
    `${canonicalStringify(value)}\n`, 'utf8'
  );
}

/** @param {any} installed @param {string} directory */
async function pendingSemanticReply(installed, directory) {
  const initial = await installed.advanceStrict(directory);
  const runId = initial.scope.run_instance_id;
  const fixture = await bendReviewJourneyFixture(runId);
  await stage(directory, 'source_pack', fixture.artifacts.source_pack);
  assert.equal((await installed.advanceStrict(directory)).stage, 'evidence_claims');
  await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
  const reply = await installed.advanceStrict(directory);
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  return { runId, fixture, reply };
}

test('installed ordinary create-run entry resumes a cancelled parent with a compiler-owned sibling ID', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-cancel-resume-'));
  try {
    const parent = await installed.createV4RunDirectory(catalog, 'case_document');
    const { runId, reply } = await pendingSemanticReply(installed, parent.run_directory);
    const cancel = installed.constructV4Action(reply, { action: 'cancel_run' });
    const revision = await bendReviewJourneyFixture(runId, 1, [cancel]);
    await stage(parent.run_directory, 'source_pack', revision.artifacts.source_pack);
    const cancelled = await installed.advanceStrict(parent.run_directory);
    assert.equal(cancelled.status, 'cancelled', JSON.stringify(cancelled));

    const sibling = await installed.createV4RunDirectory(catalog, {
      parent_run_id: runId,
      creation_reason: 'resume_cancelled'
    });
    assert.notEqual(sibling.run_id, runId);
    assert.deepEqual(sibling.lineage, {
      parent_run_id: runId,
      creation_reason: 'resume_cancelled'
    });
    const instance = JSON.parse(await readFile(
      path.join(sibling.run_directory, 'run-instance.json'), 'utf8'
    ));
    assert.equal(instance.run_id, sibling.run_id);
    assert.deepEqual(instance.lineage, sibling.lineage);
    assert.equal(JSON.parse(await readFile(path.join(
      sibling.run_directory, 'derived/semantic-answer-policy.json'
    ), 'utf8')).run_id, sibling.run_id);
    const resumed = await installed.advanceStrict(sibling.run_directory);
    assert.equal(resumed.scope.run_instance_id, sibling.run_id, JSON.stringify(resumed));
    assert.equal(resumed.status, 'need_revision', JSON.stringify(resumed));

    const tamperedInstance = { ...instance, delivery_intent: 'execution_plan' };
    await writeFile(
      path.join(sibling.run_directory, 'run-instance.json'),
      `${canonicalStringify(tamperedInstance)}\n`,
      'utf8'
    );
    const tamperedReply = await installed.advanceStrict(sibling.run_directory);
    assert.equal(tamperedReply.status, 'fatal', JSON.stringify(tamperedReply));
    assert.match(JSON.stringify(tamperedReply), /RESUME_CANCELLED_SIBLING_INVALID/u);

    const activeParent = await installed.createV4RunDirectory(catalog, 'case_document');
    await assert.rejects(
      installed.createV4RunDirectory(catalog, {
        parent_run_id: activeParent.run_id,
        creation_reason: 'resume_cancelled'
      }),
      /PARENT_NOT_CANCELLED/u
    );
    await assert.rejects(
      installed.createV4RunDirectory(catalog, {
        parent_run_id: runId,
        creation_reason: 'migration_v3'
      }),
      /BOOTSTRAP_INPUT_INVALID/u
    );
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

/** @param {string} runId @param {any} caseDocumentRef @param {any[]} events @param {number} revision */
function executionSourcePack(runId, caseDocumentRef, events, revision) {
  return {
    schema_version: '4.0.0', source_revision: revision, run_instance_id: runId,
    run_scope: `execution:${caseDocumentRef.run_id}`, delivery_intent: 'execution_plan',
    case_document_ref: structuredClone(caseDocumentRef), output_language: 'zh-CN',
    sources: [], locators: [], source_reviews: [], source_policy: { rules: [] },
    decision_records: [], clarification_events: [], execution_events: structuredClone(events),
    source_assets: [], artifact_events: []
  };
}

/** @param {any} installed @param {string} catalog */
async function deliverInstalledCaseDocument(installed, catalog) {
  const created = await installed.createV4RunDirectory(catalog, 'case_document');
  const directory = created.run_directory;
  const runId = created.run_id;
  const fixture = await bendReviewJourneyFixture(runId);
  fixture.artifacts.evidence_claims.semantic_gaps = [];
  let reply;
  for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (Object.keys(STAGE_FILES))) {
    await stage(directory, stageName, fixture.artifacts[stageName]);
    reply = await installed.advanceStrict(directory);
  }
  assert.equal(reply.status, 'finished', JSON.stringify(reply));
  const manifestBytes = await readFile(path.join(directory, 'output/current.json'), 'utf8');
  const manifest = JSON.parse(manifestBytes);
  const bundle = JSON.parse(await readFile(path.join(directory, manifest.bundle.path), 'utf8'));
  return {
    bundle,
    caseDocumentRef: {
      run_id: runId, revision: manifest.revision,
      manifest_digest: byteDigest(manifestBytes), bundle_digest: manifest.bundle.digest
    }
  };
}

test('installed legacy V4 run keeps its original naked-answer contract without silent enrolment', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-action-'));
  try {
    const initial = await installed.advanceStrict(directory);
    const runId = initial.scope.run_instance_id;
    const bootstrap = JSON.parse(await readFile(path.join(directory, 'run-instance.json'), 'utf8'));
    await writeFile(path.join(directory, 'run-instance.json'), `${canonicalStringify({
      schema_version: '4.0.0', compiler_version: '0.5.0', run_id: runId,
      delivery_intent: 'case_document', created_at: bootstrap.created_at, lineage: null
    })}\n`, 'utf8');
    const fixture = await bendReviewJourneyFixture(runId);
    await stage(directory, 'source_pack', fixture.artifacts.source_pack);
    assert.equal((await installed.advanceStrict(directory)).stage, 'evidence_claims');
    await stage(directory, 'evidence_claims', fixture.artifacts.evidence_claims);
    const pending = await installed.advanceStrict(directory);
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    const part = pending.semantic_presentation.question_parts.find(
      (/** @type {any} */ item) => /IP/u.test(item.question)
    );
    assert.ok(part);
    const answer = '发布者提交评价时的 IP 归属地';
    const event = installed.constructV4Action(pending, {
      action: 'answer_question_part', question_part_id: part.question_part_id,
      answer, user_message: `答复：${answer}`,
      resolution: 'temporary', origin_type: 'user_statement'
    });
    assert.deepEqual(validateAgainstSchema(event, {
      $defs: sourcePackSchema.$defs, $ref: '#/$defs/v4SemanticClarificationEvent'
    }), []);
    assert.match(event.event_id, /^EVENT-[0-9a-f]{64}$/u);

    const revision1 = await bendReviewJourneyFixture(runId, 1, [event]);
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const accepted = await installed.advanceStrict(directory);
    assert.equal(accepted.status, 'need_user_answers', JSON.stringify(accepted));
    assert.equal(accepted.semantic_presentation.question_parts.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('installed new-bundle adoption enrols a direct directory and rejects a naked answer append', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-direct-preview-'));
  try {
    const { runId, reply } = await pendingSemanticReply(installed, directory);
    const identity = JSON.parse(await readFile(path.join(directory, 'run-instance.json'), 'utf8'));
    assert.equal(identity.schema_version, '4.1.0');
    assert.equal(identity.compiler_version, '0.6.0');
    const policy = JSON.parse(await readFile(path.join(
      directory, 'derived/semantic-answer-policy.json'
    ), 'utf8'));
    assert.equal(policy.run_id, runId);
    const part = reply.semantic_presentation.question_parts.find(
      (/** @type {any} */ item) => /IP/u.test(item.question)
    );
    assert.ok(part);
    const answer = '发布者提交评价时的 IP 归属地';
    const event = installed.constructV4Action(reply, {
      action: 'answer_question_part', question_part_id: part.question_part_id,
      answer, user_message: `答复：${answer}`,
      resolution: 'temporary', origin_type: 'user_statement'
    });
    const revision1 = await bendReviewJourneyFixture(runId, 1, [event]);
    await stage(directory, 'source_pack', revision1.artifacts.source_pack);
    const rejected = await installed.advanceStrict(directory);
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.ok(rejected.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'PREVIEW_CONFIRMATION_REQUIRED'
    ));
    await assert.rejects(
      readFile(path.join(directory, 'accepted/r001/source-pack.json'), 'utf8'),
      (/** @type {any} */ error) => error && error.code === 'ENOENT'
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('installed bundle exposes and enforces the compiler-owned semantic preview transaction', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  assert.equal(typeof installed.prepareSemanticAnswerBatchV4, 'function');
  assert.equal(typeof installed.commitSemanticAnswerBatchV4, 'function');
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-preview-'));
  try {
    const created = await installed.createV4RunDirectory(catalog, 'case_document');
    const { reply } = await pendingSemanticReply(installed, created.run_directory);
    const part = reply.semantic_presentation.question_parts.find(
      (/** @type {any} */ item) => /IP/u.test(item.question)
    );
    assert.ok(part);
    const answer = '发布者提交评价时的 IP 归属地';
    const userMessage = `答复：${answer}`;
    const prepared = await installed.prepareSemanticAnswerBatchV4(created.run_directory, {
      presentation_id: reply.semantic_presentation.presentation_id,
      user_message: userMessage,
      requests: [{
        action: 'answer_question_part', question_part_id: part.question_part_id,
        answer, user_message: userMessage, resolution: 'temporary',
        origin_type: 'user_statement'
      }]
    });
    assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    const accepted = await installed.commitSemanticAnswerBatchV4(created.run_directory, {
      preview_id: prepared.value.preview_id,
      confirmation_message: '确认按该预览应用',
      decision: 'apply'
    });
    assert.equal(accepted.status, 'need_user_answers', JSON.stringify(accepted));
    await readFile(path.join(created.run_directory, 'accepted/r001/source-pack.json'), 'utf8');
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('installed private action seam submits every advertised semantic control through the installed runner', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  for (const action of ['defer_question_part', 'mark_question_unknown', 'request_delivery', 'cancel_run']) {
    const directory = await mkdtemp(path.join(os.tmpdir(), `gtc-v4-installed-${action}-`));
    try {
      const { runId, fixture, reply } = await pendingSemanticReply(installed, directory);
      const part = reply.semantic_presentation.question_parts[0];
      const event = installed.constructV4Action(
        reply, action === 'cancel_run'
          ? { action }
          : { action, question_part_id: part.question_part_id }
      );
      assert.deepEqual(validateAgainstSchema(event, {
        $defs: sourcePackSchema.$defs, $ref: '#/$defs/v4SemanticClarificationEvent'
      }), [], action);
      const revision = await bendReviewJourneyFixture(runId, 1, [event]);
      await stage(directory, 'source_pack', revision.artifacts.source_pack);
      const accepted = await installed.advanceStrict(directory);
      if (action === 'cancel_run') {
        assert.equal(accepted.status, 'cancelled', JSON.stringify(accepted));
      } else {
        assert.equal(['need_user_answers', 'need_revision'].includes(accepted.status), true,
          `${action}:${JSON.stringify(accepted)}`);
        assert.notEqual(accepted.status, 'fatal', action);
        await readFile(path.join(directory, 'accepted/r001/source-pack.json'), 'utf8');
      }
      assert.equal(fixture.artifacts.source_pack.run_instance_id, runId);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test('installed private action seam submits all-DNE and final confirmation to the installed runner', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-execution-submit-'));
  try {
    const document = await deliverInstalledCaseDocument(installed, catalog);
    const execution = await installed.createV4RunDirectory(catalog, 'execution_plan');
    const executionDirectory = execution.run_directory;
    const executionRunId = execution.run_id;
    const source = executionSourcePack(executionRunId, document.caseDocumentRef, [], 0);
    await stage(executionDirectory, 'source_pack', source);
    const pending = await installed.advanceStrict(executionDirectory);
    assert.equal(pending.phase, 'execution_closure', JSON.stringify(pending));
    assert.ok(pending.execution_presentation, JSON.stringify(pending));
    const events = pending.execution_presentation.items
      .filter((/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition'))
      .map((/** @type {any} */ item) => installed.constructV4Action(pending, {
        action: 'set_execution_disposition', action_context: item.action_context,
        disposition: 'do_not_execute'
      }));
    assert.ok(events.length > 0);
    await stage(executionDirectory, 'source_pack', executionSourcePack(
      executionRunId, document.caseDocumentRef, events, 1
    ));
    const confirmation = await installed.advanceStrict(executionDirectory);
    assert.equal(confirmation.phase, 'final_confirmation', JSON.stringify(confirmation));
    const confirm = installed.constructV4Action(confirmation, { action: 'confirm_execution_plan' });
    await stage(executionDirectory, 'source_pack', executionSourcePack(
      executionRunId, document.caseDocumentRef, [...events, confirm], 2
    ));
    const finished = await installed.advanceStrict(executionDirectory);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.result_kind, 'no_execution_selected');
    const current = JSON.parse(await readFile(
      path.join(executionDirectory, 'output/current.json'), 'utf8'
    ));
    assert.equal(current.runner_ready, false);
    assert.deepEqual(current.runner_projection.case_ids, []);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('installed private action seam submits Execute, capability proof and a nonempty runner projection', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-execution-ready-'));
  try {
    const document = await deliverInstalledCaseDocument(installed, catalog);
    const selectedCaseId = document.bundle.cases.find(
      (/** @type {any} */ item) => item.semantic_status === 'Grounded'
    )?.case_id;
    assert.equal(typeof selectedCaseId, 'string');
    const execution = await installed.createV4RunDirectory(catalog, 'execution_plan');
    /** @type {any[]} */
    const events = [];
    await stage(execution.run_directory, 'source_pack', executionSourcePack(
      execution.run_id, document.caseDocumentRef, events, 0
    ));
    const pending = await installed.advanceStrict(execution.run_directory);
    for (const item of pending.execution_presentation.items.filter(
      (/** @type {any} */ candidate) => candidate.available_actions.includes('set_execution_disposition')
    )) {
      events.push(installed.constructV4Action(pending, {
        action: 'set_execution_disposition', action_context: item.action_context,
        disposition: item.case_ids.includes(selectedCaseId) ? 'execute' : 'do_not_execute'
      }));
    }
    await stage(execution.run_directory, 'source_pack', executionSourcePack(
      execution.run_id, document.caseDocumentRef, events, 1
    ));
    const proofPending = await installed.advanceStrict(execution.run_directory);
    const proofItem = proofPending.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('provide_capability_proof')
        && item.case_ids.includes(selectedCaseId)
    );
    assert.ok(proofItem, JSON.stringify(proofPending));
    events.push(installed.constructV4Action(proofPending, {
      action: 'provide_capability_proof', action_context: proofItem.action_context,
      proof: { type: proofItem.proof_contract.type, value: 'verified_available' }
    }));
    await stage(execution.run_directory, 'source_pack', executionSourcePack(
      execution.run_id, document.caseDocumentRef, events, 2
    ));
    const confirmation = await installed.advanceStrict(execution.run_directory);
    assert.equal(confirmation.phase, 'final_confirmation', JSON.stringify(confirmation));
    events.push(installed.constructV4Action(confirmation, { action: 'confirm_execution_plan' }));
    await stage(execution.run_directory, 'source_pack', executionSourcePack(
      execution.run_id, document.caseDocumentRef, events, 3
    ));
    const finished = await installed.advanceStrict(execution.run_directory);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.result_kind, 'execution_ready');
    const current = JSON.parse(await readFile(
      path.join(execution.run_directory, 'output/current.json'), 'utf8'
    ));
    assert.equal(current.runner_ready, true);
    assert.deepEqual(current.runner_projection.case_ids, [selectedCaseId]);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('installed private action seam constructs source recovery, cancellation and material staging from replies', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const context = {
    run_id: 'RUN-17171717-1717-4717-8717-171717171717', committed_revision: 0,
    stable_source_id: 'SOURCE-installed-action', structural_locator: { unit_id: 'BLOCK-1' },
    url_ordinal: 0, reason_code: 'SOURCE_ASSET_UNAVAILABLE'
  };
  const request = createArtifactRequest(context, {
    status: 'need_artifact', reason_code: 'SOURCE_ASSET_UNAVAILABLE', provider: 'cooper',
    redacted_resource_ref: 'cooper.test/documents/review-contract',
    ordinary_query_digest: byteDigest('[]')
  });
  const resumeRef = createArtifactResumeRef({
    ...context, checkpoint_bytes: new TextEncoder().encode('{"checkpoint":true}\n'),
    artifact_requests: [request]
  });
  const reply = createNeedArtifactReplyV4({
    run_id: context.run_id, artifact_requests: [request], resume_ref: resumeRef,
    produced_artifacts: [], non_blocking_diagnostics: []
  });
  assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const event = installed.constructV4Action(reply, {
    action: 'provide_artifact', artifact_request_id: request.artifact_request_id,
    input: {
      kind: 'safe_upload_ref', upload_id: 'UPLOAD-installed-action',
      media_type: 'application/octet-stream', byte_length: bytes.byteLength,
      content_digest: byteDigest(bytes)
    }
  });
  assert.deepEqual(validateAgainstSchema(event, {
    $defs: sourcePackSchema.$defs, $ref: '#/$defs/provideArtifactEvent'
  }), []);
  assert.equal(
    installed.sourceAcquisitionMaterialPathV4('/absolute/run', event.event_id),
    path.join('/absolute/run', 'staging/source-acquisition', `${event.event_id}.bin`)
  );
  const cancellation = installed.constructV4Action(reply, { action: 'cancel_run' });
  assert.equal(cancellation.event_type, 'cancel_run');
  assert.match(cancellation.event_id, /^EVENT-[0-9a-f]{64}$/u);
  assert.throws(() => installed.constructV4Action(reply, {
    action: 'provide_artifact', artifact_request_id: 'ARQ-' + '0'.repeat(64),
    input: event.input
  }), /ACTION_NOT_ADVERTISED|ARTIFACT_REQUEST/u);
});

test('installed source-action seam alone stages a canonical resumed Source Pack that the installed runner accepts', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-source-action-'));
  try {
    const initial = await installed.advanceStrict(directory);
    const fixture = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    const original = structuredClone(fixture.artifacts.source_pack);
    const submitted = structuredClone(original);
    const secret = 'INSTALLED_ACTION_SECRET_MUST_NOT_PERSIST';
    submitted.sources[0].content +=
      `\n[temporary](https://unknown.example.invalid/doc?id=17&signature=${secret})`;
    await stage(directory, 'source_pack', submitted);

    const blocked = await installed.advanceStrict(directory);
    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));
    const material = new TextEncoder().encode(original.sources[0].semantic_projection.content);
    const staged = await installed.stageV4SourceAcquisitionAction(
      directory,
      blocked,
      original,
      [{
        artifact_request_id: blocked.artifact_requests[0].artifact_request_id,
        input: {
          kind: 'safe_upload_ref', upload_id: 'UPLOAD-installed-forward',
          media_type: 'text/markdown', byte_length: material.byteLength,
          content_digest: byteDigest(material)
        },
        material
      }]
    );
    assert.equal(staged.artifact_events.length, 1);
    assert.doesNotMatch(JSON.stringify(staged), /INSTALLED_ACTION_SECRET|signature=|id=17/iu);

    const accepted = await installed.advanceStrict(directory);
    assert.equal(accepted.status, 'need_revision', JSON.stringify(accepted));
    assert.equal(accepted.stage, 'evidence_claims');
    const persisted = JSON.parse(await readFile(
      path.join(directory, 'accepted/r000/source-pack.json'), 'utf8'
    ));
    assert.deepEqual(persisted, staged);
    assert.doesNotMatch(JSON.stringify(persisted), /INSTALLED_ACTION_SECRET|signature=|id=17/iu);
    await assert.rejects(readFile(installed.sourceAcquisitionMaterialPathV4(
      directory, staged.artifact_events[0].event_id
    )), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('installed source-action seam derives reviewed asset digests and resumes without private compiler imports', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-installed-asset-action-'));
  try {
    const initial = await installed.advanceStrict(directory);
    const fixture = await bendReviewJourneyFixture(initial.scope.run_instance_id);
    const sourcePack = /** @type {any} */ (structuredClone(fixture.artifacts.source_pack));
    const source = sourcePack.sources[0];
    const assetUri = 'https://assets.test/review/decorative.png';
    sourcePack.source_assets = [{
      asset_id: 'ASSET-installed-forward', source_id: source.source_id,
      locator_id: sourcePack.locators[0].locator_id, status: 'unavailable',
      classification: 'uncertain',
      review_basis: {
        reviewer: 'operator', method: 'pending inspection', evidence: 'attachment not yet available'
      },
      canonical_uri: assetUri
    }];
    await stage(directory, 'source_pack', sourcePack);
    const blocked = await installed.advanceStrict(directory);
    assert.equal(blocked.status, 'need_artifact', JSON.stringify(blocked));

    const material = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
    const staged = await installed.stageV4SourceAcquisitionAction(
      directory,
      blocked,
      sourcePack,
      [{
        artifact_request_id: blocked.artifact_requests[0].artifact_request_id,
        input: {
          kind: 'safe_upload_ref', upload_id: 'UPLOAD-installed-asset-forward',
          media_type: 'image/png', byte_length: material.byteLength,
          content_digest: byteDigest(material)
        },
        material,
        asset_review: {
          classification: 'non_normative',
          review_basis: {
            reviewer: 'operator', method: 'visual inspection', evidence: 'decorative illustration only'
          }
        }
      }]
    );
    assert.equal(staged.source_assets[0].status, 'reviewed');
    assert.equal(staged.source_assets[0].asset_digest, byteDigest(material));
    assert.deepEqual(staged.sources[0].semantic_projection.assets, [{
      canonical_uri: assetUri, asset_digest: byteDigest(material)
    }]);
    const accepted = await installed.advanceStrict(directory);
    assert.equal(accepted.status, 'need_revision', JSON.stringify(accepted));
    assert.equal(accepted.stage, 'evidence_claims');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('installed private action seam constructs every advertised execution and final-confirmation action', async () => {
  const installed = /** @type {any} */ (await import(pathToFileURL(bundlePath).href));
  const caseDocumentRef = {
    run_id: 'RUN-18181818-1818-4818-8818-181818181818', revision: 0,
    manifest_digest: 'sha256:' + '1'.repeat(64), bundle_digest: 'sha256:' + '2'.repeat(64)
  };
  const state = {
    run_id: 'RUN-19191919-1919-4919-8919-191919191919',
    presentation_id: 'PRES-installed-execution', delivery_intent: 'execution_plan',
    phase: 'execution_closure', source_revision: 0, case_document_ref: caseDocumentRef,
    case_ids: ['CASE-installed'],
    root_refs: [{ root_issue_id: 'ROOT-installed', root_version_digest: 'sha256:' + '3'.repeat(64) }],
    execution_readiness_targets: [deriveV4ExecutionReadinessTarget(caseDocumentRef, 'CASE-installed')]
  };
  const presentation = createV4ExecutionPresentation(state, {
    verify_and_recompute_readiness: verifyAndRecomputeV4ExecutionReadiness,
    semantic_reopen_handler: async () => ({})
  });
  const reply = createV4ExecutionPendingReply(state.run_id, presentation);
  assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
  for (const item of presentation.items) {
    const action = item.available_actions[0];
    const request = {
      action, action_context: item.action_context,
      ...(action === 'set_execution_disposition' ? { disposition: 'do_not_execute' } : {}),
      ...(action === 'provide_capability_proof' ? {
        proof: { type: item.proof_contract.type, value: 'verified_available' }
      } : {})
    };
    const event = installed.constructV4Action(reply, request);
    assert.deepEqual(validateAgainstSchema(event, {
      $defs: sourcePackSchema.$defs, $ref: '#/$defs/v4ExecutionEvent'
    }), [], action);
  }
  assert.equal(installed.constructV4Action(reply, { action: 'cancel_run' }).event_type, 'cancel_run');

  const finalPresentation = createV4FinalConfirmationPresentation({
    run_id: state.run_id, source_revision: 1, case_document_ref: caseDocumentRef,
    result_kind: 'no_execution_selected',
    runner_projection: { case_ids: [], case_ids_digest: byteDigest('[]') },
    plan_digest: 'sha256:' + '4'.repeat(64)
  });
  const finalReply = {
    status: 'need_user_answers', phase: 'final_confirmation', run_id: state.run_id,
    produced_artifacts: [],
    incomplete_reason: {
      code: 'FINAL_CONFIRMATION_REQUIRED',
      summary: '执行去向已闭合，但尚未确认实际展示的这一版完整执行计划。'
    },
    user_next_steps: [
      { action: 'confirm_execution_plan', description: '确认展示的同一 source revision 与 plan digest。' },
      { action: 'cancel_run', description: '取消本次运行且不创建新的交付 manifest。' }
    ],
    recovery: {
      mode: 'append_execution_event',
      description: '把 execution_presentation 的 action_context 原样提交为确认事件。'
    },
    non_blocking_diagnostics: [], execution_presentation: finalPresentation
  };
  assert.deepEqual(validateAgainstSchema(finalReply, replySchema), []);
  for (const action of ['confirm_execution_plan', 'cancel_run']) {
    const event = installed.constructV4Action(finalReply, { action });
    assert.match(event.event_id, /^EVENT-[0-9a-f]{64}$/u);
    assert.equal(event.event_type, action);
  }
});
