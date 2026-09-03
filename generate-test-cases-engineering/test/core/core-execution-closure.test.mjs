import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJourney, evaluateJourneyRevision, setSourceRevision } from '../helpers/run-journey.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import presentationSchema from '../../skill/generate-test-cases/scripts/schemas/presentation.schema.json' with { type: 'json' };

const runDigestPattern = /^[a-f0-9]{64}$/u;

test('pure core returns final confirmation before a Grounded plan and ready only after bound confirmation', () => {
  const initial = buildJourney('all-e3');
  const awaiting = evaluateJourneyRevision(initial);
  assert.equal(awaiting.status, 'need_user_answers');
  assert.equal(awaiting.purpose, 'final_confirmation');
  assert.equal(awaiting.execution_plan.status, 'awaiting_confirmation');
  assert.equal(awaiting.execution_plan.summary.pending_case_count, 0);
  assert.match(awaiting.execution_plan.plan_digest, runDigestPattern);

  const confirmed = structuredClone(initial);
  setSourceRevision(confirmed, 1);
  const plan = awaiting.execution_plan;
  const presentation = awaiting.presentation;
  confirmed.source_pack.execution_events.push({
    event_id: 'event_confirm', clarification_event_seq: 1,
    type: 'confirm_execution_plan', actor: 'owner', event_at: '2026-09-03T00:00:01.000Z',
    authority_scope: '*', run_instance_id: confirmed.source_pack.run_instance_id,
    run_identity_digest: plan.run_identity_digest,
    presented_prompt_id: presentation.presentation_id,
    presented_plan_digest: plan.plan_digest,
    presented_plan_change_head_seq: plan.plan_change_head_seq,
    presented_source_revision: 0
  });
  confirmed.workflow = awaiting.workflow_state;
  const finished = evaluateJourneyRevision(confirmed);
  assert.equal(finished.status, 'finished');
  assert.equal(finished.bundle.execution_plan.status, 'ready');
  assert.deepEqual(finished.bundle.execution_plan.runner_case_ids, [finished.bundle.grounded[0].case_id]);
  assert.equal(finished.bundle.execution_plan.items[0].item_semantic_change_head_seq, undefined);
  assert.match(finished.bundle.execution_plan.semantic_result_digest, runDigestPattern);
});

test('pure record_only returns analysis_only and never exposes a public workflow status', () => {
  const result = evaluateJourneyRevision(buildJourney('all-e3'), 'record_only');
  assert.equal(result.kind, 'analysis_only');
  assert.equal(Object.hasOwn(result, 'status'), false);
  assert.equal(result.execution_plan_snapshot.status, 'awaiting_confirmation');
  assert.equal(Object.hasOwn(result, 'bundle'), false);
});

test('pure core keeps Blocked request_delivery in execution closure rather than finalizing', () => {
  const input = buildJourney('all-blocked');
  input.source_pack.clarification_events.push({
    event_id: 'event_delivery', clarification_event_seq: 1, type: 'request_delivery',
    actor: 'owner', event_at: '2026-09-03T00:00:01.000Z',
    root_issue_ids: []
  });
  const result = evaluateJourneyRevision(input);
  assert.notEqual(result.status, 'finished');
});

test('semantic clarification exposes the exact compiler-owned presentation shown to the user', () => {
  const result = evaluateJourneyRevision(buildJourney('local-source-conflict'));
  assert.equal(result.status, 'need_user_answers');
  assert.equal(result.purpose, 'semantic_clarification');
  assert.equal(result.entry_context, 'active_analysis');
  assert.equal(result.presentation.purpose, 'semantic_clarification');
  assert.equal(result.presentation.entry_context, 'active_analysis');
  assert.equal(result.presentation.post_ready_control, null);
  assert.equal(result.presentation.groups.length, result.pending_root_issues.length);
  assert.deepEqual(validateAgainstSchema(result.presentation, presentationSchema), []);
  const group = result.presentation.groups[0];
  assert.equal(group.question, result.pending_root_issues[0].question);
  assert.equal(group.item_refs.length > 0, true);
  assert.equal(group.allowed_options.some((/** @type {any} */ option) => option.option_code === 'unknown'), true);
});
