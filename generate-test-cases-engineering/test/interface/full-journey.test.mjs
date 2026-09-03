import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  JOURNEY_NAMES, buildJourney, evaluateJourney, loadJourneySpec,
  loadHardGateExpectations, runClarificationJourney, runInstalledJourney,
  runInstalledRevision, setSourceRevision
} from '../helpers/run-journey.mjs';

// Production defect caught: the public installed-shape runner can diverge from
// the pure core, recover stale state, or expose record_only as a gate bypass.
// Rule reversal caught: any non-strict public path, stale-checkpoint winner, or
// public interaction-policy bypass makes these real runner journeys fail.

const hardGateExpectations = await loadHardGateExpectations();

test('full journey: ten frozen scenarios cross every lane and clarification outcome', async () => {
  assert.equal(JOURNEY_NAMES.length, 10);
  for (const name of JOURNEY_NAMES) {
    const spec = await loadJourneySpec(name);
    const result = await evaluateJourney(name);
    assert.equal(result.status, spec.expected.status, `${name}: ${JSON.stringify(result)}`);
    assert.deepEqual(result.diagnostics, [], name);
    for (const lane of ['grounded', 'conditional', 'blocked', 'exploratory']) {
      assert.equal(result.bundle[lane].length, spec.expected[lane], `${name}: ${lane}`);
    }
    assert.equal(
      result.bundle.coverage.not_applicable.length,
      spec.expected.not_applicable ?? 0,
      name
    );
    assert.equal(result.bundle.quality.delivery_status, spec.expected.delivery_status, name);
  }
  for (const name of ['clarification-conditional', 'clarification-grounded']) {
    const journey = await runClarificationJourney(
      /** @type {'clarification-conditional'|'clarification-grounded'} */ (name)
    );
    assert.equal(journey.pending.status, 'need_user_answers', name);
    assert.equal(journey.pending.pending_root_issues[0].missing_type, 'oracle', name);
    assert.equal(journey.resolved.source_revision, 1, name);
    assert.equal(journey.result.status, 'finished', name);
    const expectedLane = journey.specification.decision.expected_lane;
    assert.equal(journey.result.bundle[expectedLane].length, 1, name);
    assert.equal(journey.result.bundle.blocked.length, 0, name);
  }
});

test('full journey: installed-shape runner accepts the complete all-E3 artifact sequence', async () => {
  const run = await runInstalledJourney('all-e3');
  try {
    assert.deepEqual(run.replies.map(
      (/** @type {any} */ reply) => `${reply.status}/${reply.stage ?? 'done'}`
    ), [
      'need_artifact/evidence_claims',
      'need_artifact/behavior_views',
      'need_artifact/case_drafts',
      'need_user_answers/done',
      'need_artifact/evidence_claims',
      'need_artifact/behavior_views',
      'need_artifact/case_drafts',
      'finished/done'
    ]);
    assert.equal(run.reply.status, 'finished');
    assert.equal(run.bundle.grounded.length, 1);
    assert.match(run.markdown, /^# Test Case Bundle\n/u);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('full journey hard gate: record_only is rejected as an extra public runner argument', async () => {
  assert.equal(
    hardGateExpectations.get('record_only-public-selector'),
    'RUNNER_ARGUMENTS_INVALID'
  );
  const unresolved = setSourceRevision(buildJourney('local-source-conflict'), 0);
  const run = await runInstalledRevision(unresolved, {
    extraArgs: ['record_only']
  });
  try {
    assert.equal(run.reply.status, 'fatal');
    assert.deepEqual(run.reply.diagnostics.map((/** @type {any} */ item) => item.code), [
      'RUNNER_ARGUMENTS_INVALID'
    ]);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('full journey hard gate: an old checkpoint never masks a newer accepted revision', async () => {
  assert.equal(
    hardGateExpectations.get('old-checkpoint-winning'),
    'highest-valid-accepted-revision'
  );
  const revision = buildJourney('clarification-grounded');
  const run = await runInstalledRevision(revision);
  try {
    assert.equal(run.reply.status, 'need_user_answers', JSON.stringify(run.reply));
    const rootIssueIds = run.reply.blockers.map(
      (/** @type {any} */ item) => item.root_issue_id
    );
    const nextSource = structuredClone(revision.source_pack);
    nextSource.source_revision = 1;
    nextSource.clarification_events.push({
      event_id: 'event_deliver_pending', clarification_event_seq: 1,
      type: 'request_delivery', actor: 'owner', event_at: '2026-08-30',
      presentation_id: run.reply.presentation_id,
      decision_group_ids: run.reply.groups.map((/** @type {any} */ group) => group.group_id),
      root_issue_ids: rootIssueIds
    });
    const deliveredRevision = setSourceRevision(structuredClone(revision), 1);
    deliveredRevision.source_pack = nextSource;
    const delivered = await runInstalledRevision(deliveredRevision, {
      runDirectory: run.runDirectory
    });
    assert.equal(delivered.reply.status, 'finished', JSON.stringify(delivered.reply));
    assert.equal(delivered.reply.source_revision, 3);
    const oldCheckpoint = await readFile(path.join(run.runDirectory, 'checkpoint.json'), 'utf8');
    const currentBefore = await readFile(path.join(run.runDirectory, 'output/current.json'), 'utf8');
    const bundleBefore = await readFile(
      path.join(run.runDirectory, 'output/r003/test-bundle.json'), 'utf8'
    );

    const reopenedSource = JSON.parse(await readFile(
      path.join(run.runDirectory, 'accepted/r003/source-pack.json'), 'utf8'
    ));
    const readyBundle = JSON.parse(await readFile(delivered.reply.bundle_path, 'utf8'));
    const previewItem = readyBundle.execution_plan.items.find(
      (/** @type {any} */ item) => item.item_kind === 'formal_test_point'
    ) ?? readyBundle.execution_plan.items[0];
    const previewRequest = {
      operation: 'open_preview',
      request_instance_id: delivered.reply.preview_control.next_request_instance_id,
      expected_preview_epoch: delivered.reply.preview_control.expected_preview_epoch,
      run_instance_id: delivered.reply.run_instance_id,
      bound_source_revision: delivered.reply.source_revision,
      bound_bundle_digest: delivered.reply.bundle_digest,
      bound_plan_digest: delivered.reply.plan_digest,
      bound_confirmation_semantic_digest:
        readyBundle.execution_plan.confirmation.confirmation_semantic_digest,
      candidate_item_refs: [{
        item_kind: previewItem.item_kind, item_id: previewItem.item_id,
        item_semantic_digest: previewItem.item_semantic_digest
      }],
      verbatim_user_request: 'Reopen the delivered requirement issue.',
      proposed_change: { kind: 'reopen_root_issues', root_issue_ids: rootIssueIds }
    };
    await writeFile(
      path.join(run.runDirectory, 'staging/post-ready-preview-request.json'),
      `${JSON.stringify(previewRequest)}\n`, 'utf8'
    );
    const preview = await runInstalledRevision(null, { runDirectory: run.runDirectory });
    assert.equal(preview.reply.entry_context, 'post_ready_change', JSON.stringify(preview.reply));
    reopenedSource.source_revision = 4;
    reopenedSource.clarification_events.push({
      event_id: 'event_reopen_delivered', clarification_event_seq: 4,
      type: 'reopen_root_issues', actor: 'owner', event_at: '2026-08-31',
      presentation_id: preview.reply.presentation_id,
      decision_group_ids: preview.reply.groups.map((/** @type {any} */ group) => group.group_id),
      root_issue_ids: rootIssueIds
    });
    const acceptedReopen = await runInstalledRevision({ source_pack: reopenedSource }, {
      runDirectory: run.runDirectory, stageNames: ['source_pack']
    });
    assert.equal(acceptedReopen.reply.status, 'need_artifact', JSON.stringify(acceptedReopen.reply));
    assert.equal(acceptedReopen.reply.stage, 'evidence_claims');
    assert.equal(acceptedReopen.reply.scope.source_revision, 4);
    assert.match(acceptedReopen.reply.scope.run_instance_id, /^RUN-/u);

    await writeFile(path.join(run.runDirectory, 'checkpoint.json'), oldCheckpoint, 'utf8');
    const replay = await runInstalledRevision(null, { runDirectory: run.runDirectory });
    assert.equal(replay.reply.status, 'need_artifact');
    assert.equal(replay.reply.stage, 'evidence_claims');
    assert.equal(replay.reply.scope.source_revision, 4);
    assert.equal(replay.reply.scope.run_instance_id, acceptedReopen.reply.scope.run_instance_id);
    const reconciledCurrent = JSON.parse(await readFile(
      path.join(run.runDirectory, 'output/current.json'), 'utf8'
    ));
    assert.equal(reconciledCurrent.status, 'stale');
    assert.equal(reconciledCurrent.active_source_revision, 4);
    assert.equal(reconciledCurrent.previous_ready_revision, 3);
    assert.notEqual(JSON.stringify(reconciledCurrent), currentBefore.trim());
    assert.equal(
      await readFile(path.join(run.runDirectory, 'output/r003/test-bundle.json'), 'utf8'),
      bundleBefore
    );
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});
