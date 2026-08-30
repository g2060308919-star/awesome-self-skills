import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  JOURNEY_NAMES, buildJourney, evaluateJourney, loadJourneySpec,
  runClarificationJourney, runInstalledJourney, runInstalledRevision, setSourceRevision
} from '../helpers/run-journey.mjs';

// Production defect caught: the public installed-shape runner can diverge from
// the pure core, recover stale state, or expose record_only as a gate bypass.
// Rule reversal caught: any non-strict public path, stale-checkpoint winner, or
// public interaction-policy bypass makes these real runner journeys fail.

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
      'finished/done'
    ]);
    assert.equal(run.reply.status, 'finished');
    assert.equal(run.bundle.grounded.length, 1);
    assert.match(run.markdown, /^# Test Case Bundle\n/u);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('full journey hard gate: record_only cannot lower the installed public clarification gate', async () => {
  const unresolved = setSourceRevision(buildJourney('local-source-conflict'), 0);
  const run = await runInstalledRevision(unresolved, {
    extraArgs: ['record_only']
  });
  try {
    assert.equal(run.reply.status, 'need_user_answers');
    assert.equal(run.reply.stage, 'clarification');
    assert.equal(run.reply.blockers.length, 1);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});

test('full journey hard gate: an old checkpoint never masks a newer accepted revision', async () => {
  const revision = buildJourney('all-e3');
  const run = await runInstalledJourney('all-e3');
  try {
    const oldCheckpoint = await readFile(path.join(run.runDirectory, 'checkpoint.json'), 'utf8');
    const nextRevision = structuredClone(revision);
    setSourceRevision(nextRevision, 1);
    nextRevision.source_pack.decision_records.push({
      decision_id: 'decision_followup', question_id: 'question_followup',
      root_issue_ids: ['root_followup'],
      affected_obligation_ids: [revision.case_drafts.cases[0].obligation_ids[0]],
      clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-08-30',
      question: 'Keep the accepted behavior?', answer: 'unknown', disposition: 'unknown',
      authority_scope: 'checkout', effective_scope: 'checkout',
      evidence_ref: 'locator_checkout', evidence_level: 'E1'
    });
    const acceptedNext = await runInstalledRevision(nextRevision, {
      runDirectory: run.runDirectory, stageNames: ['source_pack']
    });
    assert.equal(acceptedNext.reply.status, 'need_artifact');
    assert.deepEqual(acceptedNext.reply.scope, { source_revision: 1 });
    await writeFile(path.join(run.runDirectory, 'checkpoint.json'), oldCheckpoint, 'utf8');
    const replay = await runInstalledRevision(null, { runDirectory: run.runDirectory });
    assert.equal(replay.reply.status, 'need_artifact');
    assert.equal(replay.reply.stage, 'evidence_claims');
    assert.deepEqual(replay.reply.scope, { source_revision: 1 });
    const current = JSON.parse(await readFile(
      path.join(run.runDirectory, 'output/current.json'), 'utf8'
    ));
    assert.equal(current.source_revision, 0);
  } finally {
    await rm(run.runDirectory, { recursive: true, force: true });
  }
});
