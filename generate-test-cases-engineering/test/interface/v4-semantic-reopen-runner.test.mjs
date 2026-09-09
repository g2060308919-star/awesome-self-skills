import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import sourcePackSchema from '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { advanceStrict } from '../../src/advance-strict.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { constructSemanticClarificationEventV4 } from '../../src/clarification-v4.mjs';
import { ensureV4RunInstance } from '../../src/revision-transaction-v4.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { v4PipelineFixture } from '../helpers/v4-pipeline-fixture.mjs';

/** @param {string} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

/** @param {string} directory @param {keyof typeof STAGE_FILES} stageName @param {any} artifact */
async function stage(directory, stageName, artifact) {
  await mkdir(path.join(directory, 'staging'), { recursive: true });
  await writeFile(
    path.join(directory, 'staging', STAGE_FILES[stageName]),
    `${canonicalStringify(artifact)}\n`,
    'utf8'
  );
}

/** @param {string} runId @param {any} caseDocumentRef */
function executionSourcePack(runId, caseDocumentRef) {
  return {
    schema_version: '4.0.0', source_revision: 0, run_instance_id: runId,
    run_scope: `execution:${caseDocumentRef.run_id}`, delivery_intent: 'execution_plan',
    case_document_ref: structuredClone(caseDocumentRef), output_language: 'zh-CN',
    sources: [], locators: [], source_reviews: [], source_policy: { rules: [] },
    decision_records: [], clarification_events: [], execution_events: [],
    source_assets: [], artifact_events: []
  };
}

/** @param {any} source @param {any} presentation @param {string} answer */
function appendSemanticAnswer(source, presentation, answer) {
  const part = presentation.question_parts[0];
  const prefix = '答复：';
  const message = `${prefix}${answer}`;
  const start = Array.from(prefix).length;
  const event = /** @type {any} */ (constructSemanticClarificationEventV4(
    presentation, part, 'answer_question_part', {
      answer, resolution: 'temporary', authority: 'task_scoped',
      answer_origin: {
        type: 'user_statement', presentation_id: presentation.presentation_id,
        message_digest: byteDigest(message),
        answer_span: {
          start_scalar: start, end_scalar: start + Array.from(answer).length,
          excerpt_digest: byteDigest(answer)
        }
      }
    }
  ));
  const next = /** @type {any} */ (structuredClone(source));
  next.source_revision += 1;
  next.clarification_events.push(event);
  const unit = {
    unit_id: `UNIT-answer-${event.event_id.slice('EVENT-'.length, 'EVENT-'.length + 12)}`,
    text: message, type: 'user_statement', presentation_id: event.presentation_id,
    message_digest: event.answer_origin.message_digest,
    answer_span: {
      start: event.answer_origin.answer_span.start_scalar,
      end: event.answer_origin.answer_span.end_scalar
    }
  };
  next.sources[0].semantic_projection.structure.push(unit);
  const semanticDigest = `sha256:${digest(next.sources[0].semantic_projection)}`;
  next.sources[0].semantic_digest = semanticDigest;
  for (const locator of next.locators) locator.semantic_digest = semanticDigest;
  next.locators.push({
    locator_id: `LOC-answer-${event.event_id.slice('EVENT-'.length, 'EVENT-'.length + 12)}`,
    source_id: next.sources[0].source_id, semantic_digest: semanticDigest,
    type: 'user_statement', unit_id: unit.unit_id, excerpt: answer,
    excerpt_digest: event.answer_origin.answer_span.excerpt_digest,
    domain: 'business', field_path: '/clarification_answers/0',
    presentation_id: event.presentation_id,
    message_digest: event.answer_origin.message_digest,
    answer_span: { start: unit.answer_span.start, end: unit.answer_span.end }
  });
  const review = next.source_reviews.find(
    (/** @type {any} */ item) => item.source_id === next.sources[0].source_id
  );
  review.semantic_digest = semanticDigest;
  review.units.push({
    unit_id: unit.unit_id, content_digest: byteDigest(message),
    classification: 'non_normative'
  });
  return { source: next, event };
}

/** @param {string} catalog @param {string} runId */
async function deliverCaseDocumentWithClosedSemanticRoot(catalog, runId) {
  const directory = path.join(catalog, 'runs', runId);
  await mkdir(directory, { recursive: true });
  await ensureV4RunInstance(directory, { run_id: runId, delivery_intent: 'case_document' });

  const fixture = v4PipelineFixture();
  fixture.artifacts.source_pack.run_instance_id = runId;
  const fact = fixture.artifacts.evidence_claims.fact_ledger[0];
  const claim = fixture.artifacts.evidence_claims.claims[0];
  fixture.artifacts.evidence_claims.semantic_gaps = [{
    category: 'semantic_gap', code: 'REFRESH_TIMING_UNRESOLVED',
    subject_fact_ids: [fact.fact_id], missing_aspect: 'refresh_timing',
    scope_ref: 'checkout', question: '刷新后何时应看到最新订单状态？',
    why_needed: '需要明确刷新后的业务完成时机。',
    decision_impact: '答案会改变刷新步骤和观察时点。',
    unresolved_outcome: '刷新时机场景保持待确认。',
    answer_options: ['刷新完成后立即', '后台同步完成后'], risk_level: 'high',
    source_claim_ids: [claim.claim_id], discovery_phase: 'post_case',
    affected_test_point_ids: []
  }];

  let reply;
  for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (
    ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']
  )) {
    await stage(directory, stageName, fixture.artifacts[stageName]);
    reply = /** @type {any} */ (await advanceStrict(directory));
  }
  assert.equal(reply.status, 'need_user_answers', JSON.stringify(reply));
  assert.equal(reply.phase, 'case_design');
  assert.equal(reply.semantic_presentation.question_parts.length, 1);

  const deliveryEvent = constructSemanticClarificationEventV4(
    reply.semantic_presentation,
    reply.semantic_presentation.question_parts[0],
    'request_delivery'
  );
  const requested = structuredClone(fixture.artifacts.source_pack);
  requested.source_revision = 1;
  requested.clarification_events.push(deliveryEvent);
  await stage(directory, 'source_pack', requested);
  const finished = /** @type {any} */ (await advanceStrict(directory));
  assert.equal(finished.status, 'finished', JSON.stringify(finished));
  assert.equal(finished.result_kind, 'delivered_with_gaps');

  const manifestPath = path.join(directory, 'output', 'current.json');
  const manifestBytes = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestBytes);
  const bundlePath = path.join(directory, manifest.bundle.path);
  const bundleBytes = await readFile(bundlePath, 'utf8');
  const checkpointPath = path.join(directory, 'checkpoint.json');
  const checkpointBytes = await readFile(checkpointPath, 'utf8');
  const checkpoint = JSON.parse(checkpointBytes);
  const roots = checkpoint.semantic_gap_ledger;
  assert.equal(roots.length, 1);
  assert.equal(checkpoint.clarification_state.root_states[0].status, 'closed_for_delivery');
  assert.equal(manifest.bundle.digest, byteDigest(bundleBytes));

  return {
    directory, manifestPath, manifestBytes, bundlePath, bundleBytes,
    checkpointPath, checkpointBytes, root: roots[0],
    caseDocumentRef: {
      run_id: runId, revision: manifest.revision,
      manifest_digest: byteDigest(manifestBytes), bundle_digest: manifest.bundle.digest
    }
  };
}

test('BR17 real runner advertises and commits a version-bound semantic reopen into one recoverable sibling', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-semantic-reopen-runner-'));
  const documentRunId = 'RUN-17171717-1717-4717-8717-171717171717';
  const executionRunId = 'RUN-18181818-1818-4818-8818-181818181818';
  try {
    const parent = await deliverCaseDocumentWithClosedSemanticRoot(catalog, documentRunId);
    const executionDirectory = path.join(catalog, 'runs', executionRunId);
    await mkdir(executionDirectory, { recursive: true });
    await ensureV4RunInstance(executionDirectory, {
      run_id: executionRunId, delivery_intent: 'execution_plan'
    });

    const source = executionSourcePack(executionRunId, parent.caseDocumentRef);
    assert.deepEqual(validateAgainstSchema(source, sourcePackSchema), []);
    await stage(executionDirectory, 'source_pack', source);
    const pending = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.equal(pending.status, 'need_user_answers', JSON.stringify(pending));
    assert.equal(pending.phase, 'execution_closure');
    assert.deepEqual(validateAgainstSchema(pending, replySchema), []);

    const reopenItems = pending.execution_presentation.items.filter(
      (/** @type {any} */ item) => item.available_actions.includes('reopen_semantic_question')
    );
    assert.equal(reopenItems.length, 1, 'a caseable closed semantic root must advertise its real reopen action');
    const displayed = reopenItems[0];
    assert.deepEqual(displayed.root_refs, [{
      root_issue_id: parent.root.root_issue_id,
      root_version_digest: parent.root.root_version_digest
    }]);
    assert.deepEqual(displayed.action_context.root_refs, displayed.root_refs);
    assert.deepEqual(displayed.action_context.case_document_ref, parent.caseDocumentRef);
    assert.equal(typeof displayed.action_context.reopen_event_id, 'string');

    const reopenEvent = {
      event_type: 'reopen_semantic_question',
      ...structuredClone(displayed.action_context)
    };
    const next = /** @type {any} */ (structuredClone(source));
    next.source_revision = 1;
    next.execution_events.push(reopenEvent);
    assert.deepEqual(validateAgainstSchema(next, sourcePackSchema), []);
    await stage(executionDirectory, 'source_pack', next);
    const reopened = /** @type {any} */ (await advanceStrict(executionDirectory));

    assert.equal(reopened.status, 'need_user_answers', JSON.stringify(reopened));
    assert.equal(reopened.phase, 'requirements_analysis');
    assert.notEqual(reopened.run_id, executionRunId);
    assert.match(reopened.run_id, /^RUN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    assert.deepEqual(validateAgainstSchema(reopened, replySchema), []);
    assert.equal(reopened.recovery.mode, 'append_clarification_event');
    assert.equal(reopened.semantic_presentation.recovery.run_id, reopened.run_id);
    assert.equal(reopened.semantic_presentation.question_parts.length, 1);
    assert.equal(
      reopened.semantic_presentation.question_parts[0].root_issue_id,
      parent.root.root_issue_id
    );
    assert.notEqual(
      reopened.semantic_presentation.question_parts[0].root_version_digest,
      parent.root.root_version_digest,
      'the sibling must present a compiler-owned successor root version'
    );

    assert.equal(await readFile(parent.manifestPath, 'utf8'), parent.manifestBytes);
    assert.equal(await readFile(parent.bundlePath, 'utf8'), parent.bundleBytes);
    assert.equal(await readFile(parent.checkpointPath, 'utf8'), parent.checkpointBytes);

    const lifecyclePath = path.join(executionDirectory, 'state', 'lifecycle.json');
    const lifecycle = JSON.parse(await readFile(lifecyclePath, 'utf8'));
    assert.equal(lifecycle.status, 'superseded_by_semantic_reopen');
    assert.equal(lifecycle.version, 2);
    assert.equal(lifecycle.superseded_by, reopened.run_id);

    const replay = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.deepEqual(replay, reopened, 'the accepted reopen event must replay the same sibling reply');
    assert.equal(JSON.parse(await readFile(lifecyclePath, 'utf8')).version, 2);

    const siblingDirectory = path.join(catalog, 'runs', reopened.run_id);
    const siblingReplay = /** @type {any} */ (await advanceStrict(siblingDirectory));
    assert.deepEqual(
      siblingReplay,
      reopened,
      'the sibling runner must recover the same single-target semantic presentation'
    );
    const committedSiblingCheckpoint = JSON.parse(await readFile(
      path.join(siblingDirectory, 'derived/r000/checkpoint.json'), 'utf8'
    ));
    assert.equal(committedSiblingCheckpoint.base_checkpoint_digest, byteDigest(
      `${canonicalStringify({
        schema_version: '4.0.0', compiler_version: '0.5.0',
        run_id: reopened.run_id, genesis: true
      })}\n`
    ));
    assert.equal((await readFile(
      path.join(siblingDirectory, 'transactions/committed/r000.json'), 'utf8'
    )).length > 0, true);
    await assert.rejects(
      readFile(path.join(siblingDirectory, 'output/current.json'), 'utf8'),
      (/** @type {any} */ error) => error instanceof Error
        && 'code' in error && error.code === 'ENOENT'
    );

    const siblingSource = JSON.parse(await readFile(
      path.join(siblingDirectory, 'accepted/r000/source-pack.json'), 'utf8'
    ));
    const answered = appendSemanticAnswer(
      siblingSource, reopened.semantic_presentation, '刷新完成后立即'
    );
    assert.deepEqual(validateAgainstSchema(answered.source, sourcePackSchema), []);
    await stage(siblingDirectory, 'source_pack', answered.source);
    const afterAnswer = /** @type {any} */ (await advanceStrict(siblingDirectory));
    assert.equal(afterAnswer.status, 'need_artifact', JSON.stringify(afterAnswer));
    assert.equal(afterAnswer.stage, 'behavior_views');
    const siblingCheckpoint0 = JSON.parse(await readFile(
      path.join(siblingDirectory, 'derived/r000/checkpoint.json'), 'utf8'
    ));
    const siblingCheckpoint1 = JSON.parse(await readFile(
      path.join(siblingDirectory, 'derived/r001/checkpoint.json'), 'utf8'
    ));
    assert.deepEqual(siblingCheckpoint1.reopened_targets, siblingCheckpoint0.reopened_targets);
    assert.deepEqual(
      siblingCheckpoint1.decision_suspension_ledger,
      siblingCheckpoint0.decision_suspension_ledger
    );
    assert.equal(
      siblingCheckpoint1.decision_reopen_overlay_digest,
      siblingCheckpoint0.decision_reopen_overlay_digest
    );
    assert.equal(siblingCheckpoint1.clarification_state.root_states[0].status, 'resolved_temporary');
    const siblingJournal1 = JSON.parse(await readFile(
      path.join(siblingDirectory, 'derived/r001/decision-journal.json'), 'utf8'
    ));
    const newDecision = siblingJournal1.decisions.at(-1);
    assert.deepEqual(
      newDecision.supersedes_decision_ids,
      siblingCheckpoint0.reopened_targets[0].decision_suspension.newly_suspended_decision_ids
    );
    assert.equal(
      newDecision.target.root_version_digest,
      siblingCheckpoint0.reopened_targets[0].reopened_root_version_digest
    );

  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('BR17 semantic reopen is the sole terminal append and cannot share a revision with execution changes', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v4-semantic-reopen-batch-'));
  const documentRunId = 'RUN-27272727-2727-4727-8727-272727272727';
  const executionRunId = 'RUN-28282828-2828-4828-8828-282828282828';
  try {
    const parent = await deliverCaseDocumentWithClosedSemanticRoot(catalog, documentRunId);
    const executionDirectory = path.join(catalog, 'runs', executionRunId);
    await mkdir(executionDirectory, { recursive: true });
    await ensureV4RunInstance(executionDirectory, {
      run_id: executionRunId, delivery_intent: 'execution_plan'
    });
    const source = executionSourcePack(executionRunId, parent.caseDocumentRef);
    await stage(executionDirectory, 'source_pack', source);
    const pending = /** @type {any} */ (await advanceStrict(executionDirectory));
    const disposition = pending.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('set_execution_disposition')
    );
    const reopen = pending.execution_presentation.items.find(
      (/** @type {any} */ item) => item.available_actions.includes('reopen_semantic_question')
    );
    assert.ok(disposition && reopen);
    const batched = /** @type {any} */ (structuredClone(source));
    batched.source_revision = 1;
    batched.execution_events = [
      {
        event_type: 'set_execution_disposition', disposition: 'do_not_execute',
        ...structuredClone(disposition.action_context)
      },
      { event_type: 'reopen_semantic_question', ...structuredClone(reopen.action_context) }
    ];
    await stage(executionDirectory, 'source_pack', batched);
    const rejected = /** @type {any} */ (await advanceStrict(executionDirectory));
    assert.equal(rejected.status, 'need_revision', JSON.stringify(rejected));
    assert.equal(rejected.diagnostics[0].code, 'REOPEN_EVENT_BATCH_CONFLICT');
    assert.equal(
      JSON.parse(await readFile(path.join(executionDirectory, 'state/lifecycle.json'), 'utf8')).status,
      'active'
    );
    assert.deepEqual((await readdir(path.join(catalog, 'runs'))).sort(), [
      documentRunId, executionRunId
    ].sort());
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});
