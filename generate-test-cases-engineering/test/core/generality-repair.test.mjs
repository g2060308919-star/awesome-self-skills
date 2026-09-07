import assert from 'node:assert/strict';
import test from 'node:test';
import { appendedRepair, repairDiagnostics, reusableStages, unconfirmedWorkflow } from '../../src/artifact-repair.mjs';
import { digest } from '../../src/canonical.mjs';

function context() {
  return {
    source_pack: { source_revision: 0, decision_records: [], clarification_events: [], execution_events: [] },
    artifacts: { evidence_claims: { claims: [] }, behavior_views: { views: [] }, case_drafts: { cases: [] } }
  };
}
/** @param {any} prior @param {string} stage */
function repaired(prior, stage) {
  const value = stage === 'source_pack' ? prior.source_pack : prior.artifacts[stage];
  return { ...prior.source_pack, source_revision: 1, artifact_repairs: [{
    repair_seq: 1, base_source_revision: 0, stage, accepted_artifact_digest: digest(value), reason: 'Correct extraction.'
  }] };
}
test('generality P18: repair binds exact immutable target and rejects history rewriting or mixed evidence events', () => {
  const prior = context();
  const next = repaired(prior, 'behavior_views');
  assert.deepEqual(repairDiagnostics(prior, next), []);
  assert.equal(appendedRepair(prior.source_pack, next).stage, 'behavior_views');
  const tampered = structuredClone(next);
  tampered.artifact_repairs[0].accepted_artifact_digest = 'f'.repeat(64);
  assert.equal(repairDiagnostics(prior, tampered)[0].code, 'ARTIFACT_REPAIR_INVALID');
  const mixed = structuredClone(next);
  mixed.execution_events = [{ type: 'confirm_execution_plan' }];
  assert.equal(repairDiagnostics(prior, mixed)[0].code, 'ARTIFACT_REPAIR_INVALID');
  assert.equal(repairDiagnostics({ ...prior, source_pack: next }, prior.source_pack)[0].code, 'ARTIFACT_REPAIR_INVALID');
});

test('generality P18/P19: only stages before the repair boundary carry forward; business answers do not reuse semantics', () => {
  const prior = context();
  for (const [stage, expected] of [
    ['source_pack', []], ['evidence_claims', []],
    ['behavior_views', ['evidence_claims']], ['case_drafts', ['evidence_claims', 'behavior_views']]
  ]) assert.deepEqual(reusableStages(prior.source_pack, repaired(prior, /** @type {string} */ (stage))), expected);
  assert.deepEqual(reusableStages(prior.source_pack, { ...prior.source_pack, decision_records: [{ decision_id: 'new-rule' }] }), []);
  assert.deepEqual(reusableStages(prior.source_pack, { ...prior.source_pack, execution_events: [{ type: 'confirm_execution_plan' }] }), ['evidence_claims', 'behavior_views', 'case_drafts']);
});

test('generality P18: regeneration invalidates confirmation and presentation without erasing accepted event history', () => {
  const state = { confirmation: { confirmed: true }, execution_plan: { status: 'ready', confirmation: { confirmed: true } },
    workflow_event_head_seq: 3, workflow_event_log_digest: 'a'.repeat(64),
    presentation_snapshot: { presentation_id: 'shown' }, active_pause: null };
  const result = unconfirmedWorkflow(state);
  assert.equal(result.confirmation, null);
  assert.equal(result.execution_plan.confirmation, null);
  assert.equal(result.presentation_snapshot, null);
  assert.equal(result.workflow_event_head_seq, 3);
  assert.equal(result.workflow_event_log_digest, state.workflow_event_log_digest);
  assert.equal(state.confirmation.confirmed, true);
});
