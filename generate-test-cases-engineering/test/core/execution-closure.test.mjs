import assert from 'node:assert/strict';
import test from 'node:test';
import { compileExecutionPlan } from '../../src/execution-plan.mjs';

const runId = 'RUN-12345678-1234-4234-8234-123456789abc';
const runDigest = 'a'.repeat(64);

/** @param {string} [status] */
function caseEntry(status = 'grounded') {
  return {
    case_id: 'case_a', title: 'Verify save', scope: 'checkout', risk: 'high',
    obligation_ids: ['tp_a'], evidence_refs: ['claim_a'], source_claim_ids: ['claim_a'],
    steps: [{ step_id: 'step_a', action: 'Save', expectations: [{
      expectation_id: 'expect_a', business_assertion: 'Saved',
      oracle: { type: 'state', expected_state: 'saved', comparison: 'equals' },
      support_review: 'supported'
    }]}], semantic_status: status
  };
}

/** @param {string} [status] @returns {any} */
function base(status = 'grounded') {
  return {
    semanticBundle: {
      schema_version: '2.1.0', source_revision: 0,
      grounded: status === 'grounded' ? [caseEntry()] : [],
      conditional: status === 'conditional' ? [caseEntry('conditional')] : [],
      blocked: status === 'blocked' ? [{
        obligation_id: 'tp_a', root_issue_id: 'root_a', reason: 'Missing rule', risk: 'high',
        recovery: { missing_type: 'oracle', required_material: 'Outcome', question: 'What happens?' }
      }] : [],
      exploratory: [],
      coverage: {
        formal: { total: 1, covered: status === 'blocked' ? 0 : 1, entries: [{ obligation_id: 'tp_a', status }] },
        not_applicable: []
      }
    },
    obligations: [{ obligation_id: 'tp_a', title: 'Save', scope: 'checkout', risk: 'high' }],
    evidenceClaims: { claims: [{ claim_id: 'claim_a', level: status === 'conditional' ? 'E1' : 'E3', kind: 'requirement', scope: 'checkout', value: 'Save.' }] },
    sourcePack: {
      schema_version: '2.1.0', source_revision: 0, run_instance_id: runId,
      run_scope: 'checkout', sources: [{ source_id: 'source_a', content_digest: runDigest }],
      decision_records: [], clarification_events: [], execution_events: []
    },
    runIdentityDigest: runDigest, priorWorkflowState: null
  };
}

/** @param {any} result */
function stateOf(result) {
  return {
    execution_plan: result.plan,
    presentation_snapshot: result.presentation,
    workflow_event_head_seq: result.workflow_event_head_seq,
    workflow_event_log_digest: result.workflow_event_log_digest,
    confirmation: result.plan.confirmation,
    active_pause: result.plan.status === 'paused' ? { resume_target: result.plan.resume_target } : null,
    promoted_exploratory: result.plan.promoted_exploratory
  };
}

/** @param {number} seq @param {string} type */
function common(seq, type) {
  return {
    event_id: `event_${seq}`, clarification_event_seq: seq, type,
    actor: 'owner', event_at: `2026-09-03T00:00:0${seq}.000Z`, authority_scope: 'checkout',
    run_instance_id: runId, run_identity_digest: runDigest
  };
}

test('all Grounded plan is displayed once and cannot be ready until that exact plan is confirmed', () => {
  const first = compileExecutionPlan(base());
  assert.equal(first.kind, 'analysis_only');
  assert.equal(first.plan.status, 'awaiting_confirmation');
  assert.equal(first.presentation.purpose, 'final_confirmation');
  assert.equal(first.plan.summary.pending_case_count, 0);

  const confirmedInput = base();
  confirmedInput.sourcePack.source_revision = 1;
  confirmedInput.sourcePack.execution_events.push({
    ...common(1, 'confirm_execution_plan'),
    presented_prompt_id: first.presentation.presentation_id,
    presented_plan_digest: first.plan.plan_digest,
    presented_plan_change_head_seq: first.plan.plan_change_head_seq,
    presented_source_revision: 0
  });
  confirmedInput.priorWorkflowState = stateOf(first);
  const confirmed = compileExecutionPlan(confirmedInput);
  assert.deepEqual(confirmed.diagnostics, []);
  assert.equal(confirmed.kind, 'ready');
  assert.equal(confirmed.plan.status, 'ready');
  assert.equal(confirmed.presentation, null);
  assert.deepEqual(confirmed.plan.runner_case_ids, ['case_a']);
});

test('Conditional remains pending, DNE keeps it Conditional, and the changed plan needs a new confirmation', () => {
  const firstInput = base('conditional');
  const first = compileExecutionPlan(firstInput);
  assert.equal(first.plan.status, 'decision_required');
  assert.equal(first.presentation.purpose, 'execution_closure');
  const pending = first.plan.items[0];

  const decidedInput = base('conditional');
  decidedInput.sourcePack.source_revision = 1;
  decidedInput.sourcePack.execution_events.push({
    ...common(1, 'set_dispositions'),
    presented_plan_digest: first.plan.plan_digest,
    presented_presentation_id: first.presentation.presentation_id,
    decision_group_ids: [first.presentation.groups[0].group_id],
    decisions: [{
      item_kind: pending.item_kind, item_id: pending.item_id,
      item_semantic_digest: pending.item_semantic_digest,
      item_semantic_change_head_seq: pending.item_semantic_change_head_seq,
      execution_disposition: 'do_not_execute', reason_code: 'temporary_rule_unconfirmed',
      reason: 'The final business rule is not confirmed.'
    }]
  });
  decidedInput.priorWorkflowState = stateOf(first);
  const decided = compileExecutionPlan(decidedInput);
  assert.deepEqual(decided.diagnostics, []);
  assert.equal(decided.plan.items[0].semantic_status, 'conditional');
  assert.equal(decided.plan.items[0].execution_disposition, 'do_not_execute');
  assert.equal(decided.plan.status, 'awaiting_confirmation');
  assert.equal(decided.kind, 'analysis_only');
  assert.notEqual(decided.plan.plan_digest, first.plan.plan_digest);

  const confirmedInput = base('conditional');
  confirmedInput.sourcePack.source_revision = 2;
  confirmedInput.sourcePack.execution_events = [
    ...decidedInput.sourcePack.execution_events,
    {
      ...common(2, 'confirm_execution_plan'),
      presented_prompt_id: decided.presentation.presentation_id,
      presented_plan_digest: decided.plan.plan_digest,
      presented_plan_change_head_seq: decided.plan.plan_change_head_seq,
      presented_source_revision: 1
    }
  ];
  confirmedInput.priorWorkflowState = stateOf(decided);
  const confirmed = compileExecutionPlan(confirmedInput);
  assert.deepEqual(confirmed.diagnostics, []);
  assert.equal(confirmed.kind, 'ready');
  assert.deepEqual(confirmed.plan.runner_case_ids, []);
});

test('request_delivery enters execution closure and cannot finish a Blocked Test Point', () => {
  const input = base('blocked');
  input.sourcePack.clarification_events.push({
    event_id: 'clarification_1', clarification_event_seq: 1,
    type: 'request_delivery', actor: 'owner', event_at: '2026-09-03T00:00:01.000Z',
    root_issue_ids: ['root_a']
  });
  const result = compileExecutionPlan(input);
  assert.equal(result.kind, 'analysis_only');
  assert.equal(result.plan.status, 'decision_required');
  assert.equal(result.plan.items[0].semantic_status, 'blocked');
  assert.equal(result.plan.items[0].execution_disposition, 'pending');
  assert.equal(result.presentation.purpose, 'execution_closure');
});
