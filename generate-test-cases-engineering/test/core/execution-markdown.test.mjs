import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJourney, evaluateJourneyRevision, setSourceRevision } from '../helpers/run-journey.mjs';

function finishedJourney() {
  const initial = buildJourney('all-e3');
  const awaiting = evaluateJourneyRevision(initial);
  const confirmed = structuredClone(initial);
  setSourceRevision(confirmed, 1);
  confirmed.source_pack.execution_events.push({
    event_id: 'event-confirm-markdown', clarification_event_seq: 1,
    type: 'confirm_execution_plan', actor: 'owner', event_at: '2026-09-03T00:00:00.000Z',
    authority_scope: '*', run_instance_id: confirmed.source_pack.run_instance_id,
    run_identity_digest: awaiting.execution_plan.run_identity_digest,
    presented_prompt_id: awaiting.presentation.presentation_id,
    presented_plan_digest: awaiting.execution_plan.plan_digest,
    presented_plan_change_head_seq: awaiting.execution_plan.plan_change_head_seq,
    presented_source_revision: 0
  });
  confirmed.workflow = awaiting.workflow_state;
  return evaluateJourneyRevision(confirmed);
}

test('Markdown mechanically mirrors ready plan counts, runner ids, and semantic lineage', () => {
  const result = finishedJourney();
  assert.equal(result.status, 'finished');
  const plan = result.bundle.execution_plan;
  assert.match(result.markdown, /## Execution Plan/u);
  assert.match(result.markdown, new RegExp(`Execute Cases: ${plan.summary.execute_case_count}`, 'u'));
  for (const caseId of plan.runner_case_ids) {
    assert.equal(result.markdown.includes(caseId.replaceAll('_', '\\_')), true);
  }
  assert.match(result.markdown, new RegExp(result.bundle.quality.lineage.semantic_source_digest, 'u'));
  assert.doesNotMatch(result.markdown, /undefined/u);
});
