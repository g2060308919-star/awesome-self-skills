import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { STAGE_FILES } from '../../src/run-store.mjs';
import { buildJourney, setSourceRevision } from '../helpers/run-journey.mjs';
import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import checkpointSchema from '../../skill/generate-test-cases/scripts/schemas/checkpoint.schema.json' with { type: 'json' };

/** @param {any} value @param {any} schema @param {string} label */
function assertSchema(value, schema, label) {
  assert.deepEqual(validateAgainstSchema(value, schema), [], label);
}

/** @param {string} filePath */
async function exists(filePath) {
  try { await stat(filePath); return true; } catch { return false; }
}

/** @param {string} runDirectory @param {keyof typeof STAGE_FILES} stageName @param {any} artifact */
async function stage(runDirectory, stageName, artifact) {
  await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
  await writeFile(path.join(runDirectory, 'staging', STAGE_FILES[stageName]), `${JSON.stringify(artifact)}\n`);
}

/** @param {string} runDirectory @param {any} revision */
async function submitRevision(runDirectory, revision) {
  let reply;
  for (const stageName of /** @type {Array<keyof typeof STAGE_FILES>} */ (['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts'])) {
    await stage(runDirectory, stageName, revision[stageName]);
    reply = await advanceStrict(runDirectory);
  }
  return reply;
}

/** @param {string} runDirectory */
async function createReadyRun(runDirectory) {
  const request = await advanceStrict(runDirectory);
  const revision = buildJourney('all-e3');
  revision.source_pack.run_instance_id = request.scope.run_instance_id;
  const awaiting = await submitRevision(runDirectory, revision);
  const confirmed = structuredClone(revision);
  setSourceRevision(confirmed, 1);
  confirmed.source_pack.execution_events.push({
    event_id: 'event-confirm-runner', clarification_event_seq: awaiting.next_event_seq,
    type: 'confirm_execution_plan', actor: 'owner', event_at: '2026-09-03T00:00:00.000Z',
    authority_scope: '*', run_instance_id: request.scope.run_instance_id,
    run_identity_digest: awaiting.execution_plan.run_identity_digest,
    presented_prompt_id: awaiting.prompt_id,
    presented_plan_digest: awaiting.execution_plan.plan_digest,
    presented_plan_change_head_seq: awaiting.execution_plan.plan_change_head_seq,
    presented_source_revision: 0
  });
  const finished = await submitRevision(runDirectory, confirmed);
  return { request, revision, awaiting, confirmed, finished };
}

test('runner withholds final output until the displayed plan is confirmed', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'execution-closure-runner-'));
  try {
    const request = await advanceStrict(runDirectory);
    assertSchema(request, replySchema, 'initial reply');
    assert.equal(request.status, 'need_artifact');
    assert.match(request.scope.run_instance_id, /^RUN-/u);
    const revision = buildJourney('all-e3');
    revision.source_pack.run_instance_id = request.scope.run_instance_id;

    const awaiting = await submitRevision(runDirectory, revision);
    assertSchema(awaiting, replySchema, 'final confirmation reply');
    assert.equal(awaiting.status, 'need_user_answers', JSON.stringify(awaiting));
    assert.equal(awaiting.purpose, 'final_confirmation');
    assert.equal(awaiting.execution_plan.status, 'awaiting_confirmation');
    assert.equal(awaiting.pending_count, 0);
    assert.equal(await exists(path.join(runDirectory, 'output/r000/test-bundle.json')), false);
    const stale = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(stale.status, 'stale');

    const confirmed = structuredClone(revision);
    setSourceRevision(confirmed, 1);
    confirmed.source_pack.execution_events.push({
      event_id: 'event-confirm-runner', clarification_event_seq: awaiting.next_event_seq,
      type: 'confirm_execution_plan', actor: 'owner', event_at: '2026-09-03T00:00:00.000Z',
      authority_scope: '*', run_instance_id: request.scope.run_instance_id,
      run_identity_digest: awaiting.execution_plan.run_identity_digest,
      presented_prompt_id: awaiting.prompt_id,
      presented_plan_digest: awaiting.execution_plan.plan_digest,
      presented_plan_change_head_seq: awaiting.execution_plan.plan_change_head_seq,
      presented_source_revision: 0
    });
    const finished = await submitRevision(runDirectory, confirmed);
    assertSchema(finished, replySchema, 'finished reply');
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    assert.equal(finished.run_instance_id, request.scope.run_instance_id);
    assert.equal(finished.plan_digest, awaiting.execution_plan.plan_digest);
    assert.equal(finished.execute_case_count, 1);
    assert.match(finished.preview_control.next_request_instance_id, /^PREVIEW-/u);
    const bundle = JSON.parse(await readFile(finished.bundle_path, 'utf8'));
    assert.equal(bundle.execution_plan.status, 'ready');
    assert.deepEqual(bundle.execution_plan.runner_case_ids, [bundle.grounded[0].case_id]);
    const current = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(current.status, 'ready');
    assert.equal(current.source_revision, 1);
    const checkpoint = JSON.parse(await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8'));
    assertSchema(checkpoint, checkpointSchema, 'finished checkpoint');
    const openItem = structuredClone(checkpoint);
    openItem.execution_plan_snapshot.items[0].untracked = true;
    assert.notDeepEqual(
      validateAgainstSchema(openItem, checkpointSchema), [],
      'checkpoint plan items must stay closed'
    );
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('v1 run input is preserved and rejected with explicit migration and new-run diagnostics', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'execution-v1-migration-'));
  try {
    const revision = buildJourney('all-e3');
    revision.source_pack.schema_version = '1.0.0';
    await stage(runDirectory, 'source_pack', revision.source_pack);
    const reply = await advanceStrict(runDirectory);
    assert.equal(reply.status, 'fatal');
    assert.deepEqual(reply.diagnostics.map((/** @type {any} */ item) => item.code), [
      'RUN_MIGRATION_REQUIRED', 'NEW_RUN_REQUIRED'
    ]);
    assert.equal(await exists(path.join(runDirectory, 'accepted/r000/source-pack.json')), false);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('post-ready preview is private, version-bound, cancellable, and cannot revive after cancel', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'post-ready-preview-runner-'));
  try {
    const { finished } = await createReadyRun(runDirectory);
    assert.equal(finished.status, 'finished', JSON.stringify(finished));
    const bundle = JSON.parse(await readFile(finished.bundle_path, 'utf8'));
    const item = bundle.execution_plan.items[0];
    const readyCurrent = await readFile(path.join(runDirectory, 'output/current.json'), 'utf8');
    const request = {
      operation: 'open_preview',
      request_instance_id: finished.preview_control.next_request_instance_id,
      expected_preview_epoch: finished.preview_control.expected_preview_epoch,
      run_instance_id: finished.run_instance_id,
      bound_source_revision: finished.source_revision,
      bound_bundle_digest: finished.bundle_digest,
      bound_plan_digest: finished.plan_digest,
      bound_confirmation_semantic_digest: bundle.execution_plan.confirmation.confirmation_semantic_digest,
      candidate_item_refs: [{
        item_kind: item.item_kind, item_id: item.item_id,
        item_semantic_digest: item.item_semantic_digest
      }],
      verbatim_user_request: '本轮不执行支付用例',
      proposed_change: {
        kind: 'change_execution_disposition', disposition: 'do_not_execute',
        reason_code: 'scope_excluded_for_run', reason: '本轮范围不含支付'
      }
    };
    await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
    await writeFile(path.join(runDirectory, 'staging/post-ready-preview-request.json'), `${JSON.stringify(request)}\n`);
    const preview = await advanceStrict(runDirectory);
    assert.equal(preview.status, 'need_user_answers', JSON.stringify(preview));
    assert.equal(preview.entry_context, 'post_ready_change');
    assert.equal(preview.execution_plan.status, 'ready');
    assert.equal(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'), readyCurrent);

    const cancel = {
      operation: 'cancel_preview',
      request_instance_id: preview.preview_control.next_request_instance_id,
      expected_preview_epoch: preview.preview_control.expected_preview_epoch,
      run_instance_id: finished.run_instance_id,
      bound_source_revision: finished.source_revision,
      bound_bundle_digest: finished.bundle_digest,
      bound_plan_digest: finished.plan_digest,
      bound_confirmation_semantic_digest: bundle.execution_plan.confirmation.confirmation_semantic_digest,
      cancels_presentation_id: preview.presentation_id
    };
    await writeFile(path.join(runDirectory, 'staging/post-ready-preview-request.json'), `${JSON.stringify(cancel)}\n`);
    const cancelled = await advanceStrict(runDirectory);
    assert.equal(cancelled.status, 'finished', JSON.stringify(cancelled));
    assert.equal(cancelled.notice_code, 'POST_READY_CHANGE_CANCELLED');
    assert.equal(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'), readyCurrent);

    await writeFile(path.join(runDirectory, 'staging/post-ready-preview-request.json'), `${JSON.stringify(request)}\n`);
    const replay = await advanceStrict(runDirectory);
    assert.equal(replay.status, 'need_revision');
    assert.equal(['PREVIEW_REQUEST_REPLAY_INVALID', 'PREVIEW_BINDING_INVALID'].includes(
      replay.diagnostics[0].code
    ), true);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('applying a post-ready execution change stales current and requires a newly displayed confirmation', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'post-ready-apply-runner-'));
  try {
    const { confirmed, finished } = await createReadyRun(runDirectory);
    const bundle = JSON.parse(await readFile(finished.bundle_path, 'utf8'));
    const item = bundle.execution_plan.items[0];
    const previewRequest = {
      operation: 'open_preview',
      request_instance_id: finished.preview_control.next_request_instance_id,
      expected_preview_epoch: finished.preview_control.expected_preview_epoch,
      run_instance_id: finished.run_instance_id, bound_source_revision: finished.source_revision,
      bound_bundle_digest: finished.bundle_digest, bound_plan_digest: finished.plan_digest,
      bound_confirmation_semantic_digest: bundle.execution_plan.confirmation.confirmation_semantic_digest,
      candidate_item_refs: [{
        item_kind: item.item_kind, item_id: item.item_id,
        item_semantic_digest: item.item_semantic_digest
      }],
      verbatim_user_request: '本轮不执行',
      proposed_change: {
        kind: 'change_execution_disposition', disposition: 'do_not_execute',
        reason_code: 'scope_excluded_for_run', reason: '本轮不在范围内'
      }
    };
    await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
    await writeFile(path.join(runDirectory, 'staging/post-ready-preview-request.json'), `${JSON.stringify(previewRequest)}\n`);
    const preview = await advanceStrict(runDirectory);
    assert.equal(preview.entry_context, 'post_ready_change', JSON.stringify(preview));

    const unapplied = structuredClone(confirmed);
    setSourceRevision(unapplied, 2);
    unapplied.source_pack.execution_events.push({
      event_id: 'event-pause-instead-of-apply', clarification_event_seq: preview.next_event_seq,
      type: 'pause_execution_closure', actor: 'owner', event_at: '2026-09-03T00:00:01.000Z',
      authority_scope: '*', run_instance_id: finished.run_instance_id,
      run_identity_digest: preview.run_identity_digest,
      presented_presentation_id: preview.presentation_id,
      presented_plan_digest: bundle.execution_plan.plan_digest,
      pending_item_refs: [], resume_target: 'execution_closure', reason: 'user_requested'
    });
    await stage(runDirectory, 'source_pack', unapplied.source_pack);
    const rejectedUnapplied = await advanceStrict(runDirectory);
    assert.equal(rejectedUnapplied.status, 'need_revision', JSON.stringify(rejectedUnapplied));
    assert.equal(rejectedUnapplied.diagnostics.some((/** @type {any} */ diagnostic) => (
      diagnostic.code === 'POST_READY_PREVIEW_APPLICATION_REQUIRED'
    )), true);
    const stillReady = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(stillReady.status, 'ready');
    assert.equal(stillReady.source_revision, finished.source_revision);

    const changed = structuredClone(confirmed);
    setSourceRevision(changed, 2);
    changed.source_pack.execution_events.push({
      event_id: 'event-set-post-ready', clarification_event_seq: preview.next_event_seq,
      type: 'set_dispositions', actor: 'owner', event_at: '2026-09-03T00:00:02.000Z',
      authority_scope: '*', run_instance_id: finished.run_instance_id,
      run_identity_digest: preview.run_identity_digest,
      presented_plan_digest: bundle.execution_plan.plan_digest,
      presented_presentation_id: preview.presentation_id,
      decision_group_ids: [preview.groups[0].group_id],
      decisions: [{
        item_kind: item.item_kind, item_id: item.item_id,
        item_semantic_digest: item.item_semantic_digest,
        item_semantic_change_head_seq: 0,
        execution_disposition: 'do_not_execute', reason_code: 'scope_excluded_for_run',
        reason: '本轮不在范围内'
      }]
    });
    const awaiting = await submitRevision(runDirectory, changed);
    assert.equal(awaiting.status, 'need_user_answers', JSON.stringify(awaiting));
    assert.equal(awaiting.purpose, 'final_confirmation');
    assert.equal(awaiting.execution_plan.summary.execute_case_count, 0);
    assert.equal(awaiting.execution_plan.summary.do_not_execute_case_count, 1);
    const current = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(current.status, 'stale');
    assert.equal(current.active_source_revision, 2);
    const checkpoint = JSON.parse(await readFile(path.join(runDirectory, 'checkpoint.json'), 'utf8'));
    assert.equal(checkpoint.preview_state, 'consumed');
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test('recovery reconciles an old ready pointer behind a higher accepted non-ready revision', async () => {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'execution-current-reconcile-'));
  try {
    const { confirmed, finished } = await createReadyRun(runDirectory);
    const oldReady = await readFile(path.join(runDirectory, 'output/current.json'), 'utf8');
    const bundle = JSON.parse(await readFile(finished.bundle_path, 'utf8'));
    const item = bundle.execution_plan.items[0];
    const previewRequest = {
      operation: 'open_preview',
      request_instance_id: finished.preview_control.next_request_instance_id,
      expected_preview_epoch: finished.preview_control.expected_preview_epoch,
      run_instance_id: finished.run_instance_id, bound_source_revision: finished.source_revision,
      bound_bundle_digest: finished.bundle_digest, bound_plan_digest: finished.plan_digest,
      bound_confirmation_semantic_digest: bundle.execution_plan.confirmation.confirmation_semantic_digest,
      candidate_item_refs: [{
        item_kind: item.item_kind, item_id: item.item_id,
        item_semantic_digest: item.item_semantic_digest
      }],
      verbatim_user_request: 'Do not execute this Case.',
      proposed_change: {
        kind: 'change_execution_disposition', disposition: 'do_not_execute',
        reason_code: 'user_deferred', reason: 'Defer this run.'
      }
    };
    await mkdir(path.join(runDirectory, 'staging'), { recursive: true });
    await writeFile(path.join(runDirectory, 'staging/post-ready-preview-request.json'), `${JSON.stringify(previewRequest)}\n`);
    const preview = await advanceStrict(runDirectory);
    const higher = structuredClone(confirmed);
    setSourceRevision(higher, 2);
    higher.source_pack.execution_events.push({
      event_id: 'event-set-recovery', clarification_event_seq: preview.next_event_seq,
      type: 'set_dispositions', actor: 'owner', event_at: '2026-09-03T00:00:03.000Z',
      authority_scope: '*', run_instance_id: finished.run_instance_id,
      run_identity_digest: preview.run_identity_digest,
      presented_plan_digest: bundle.execution_plan.plan_digest,
      presented_presentation_id: preview.presentation_id,
      decision_group_ids: [preview.groups[0].group_id],
      decisions: [{
        item_kind: item.item_kind, item_id: item.item_id,
        item_semantic_digest: item.item_semantic_digest,
        item_semantic_change_head_seq: 0,
        execution_disposition: 'do_not_execute', reason_code: 'user_deferred',
        reason: 'Defer this run.'
      }]
    });
    await stage(runDirectory, 'source_pack', higher.source_pack);
    const next = await advanceStrict(runDirectory);
    assert.equal(next.status, 'need_artifact', JSON.stringify(next));
    assert.equal(next.stage, 'evidence_claims');

    // Simulate a crash boundary that left an obsolete ready pointer behind.
    await writeFile(path.join(runDirectory, 'output/current.json'), oldReady);
    const recovered = await advanceStrict(runDirectory);
    assert.equal(recovered.status, 'need_artifact');
    const current = JSON.parse(await readFile(path.join(runDirectory, 'output/current.json'), 'utf8'));
    assert.equal(current.status, 'stale');
    assert.equal(current.active_source_revision, 2);
    assert.equal(current.previous_ready_revision, finished.source_revision);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
