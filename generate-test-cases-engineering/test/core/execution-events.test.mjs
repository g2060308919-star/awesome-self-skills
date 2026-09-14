import assert from 'node:assert/strict';
import test from 'node:test';
import { createPresentationSnapshot, replayWorkflowHistory } from '../../src/execution-events.mjs';

const sha = 'a'.repeat(64);
const runId = 'RUN-12345678-1234-4234-8234-123456789abc';

/** @param {Record<string,unknown>} [overrides] */
function item(overrides = {}) {
  return {
    item_kind: 'case', item_id: 'case_a', title: 'Save settings',
    semantic_status: 'grounded', item_semantic_digest: sha,
    item_semantic_change_head_seq: 0, related_obligation_ids: ['tp_a'],
    execution_disposition: 'execute', reason_code: 'selected_for_run',
    reason: 'Selected for this run.', basis: { origin: 'default_grounded_recommendation' },
    ...overrides
  };
}

/** @param {any[]} [items] @param {string} [purpose] */
function presentation(items = [item()], purpose = 'execution_closure') {
  return createPresentationSnapshot({
    purpose, entryContext: 'active_analysis', runInstanceId: runId,
    sourceRevision: 0, planDigest: sha, planChangeHeadSeq: 0,
    groups: [{
      question: 'Choose execution disposition.', items,
      allowedOptions: [
        { option_code: 'execute', label: 'Execute', meaning: 'Run this Case.' },
        { option_code: 'do_not_execute', label: 'Do not execute', meaning: 'Exclude this Case.' }
      ],
      answerExample: 'Do not execute because it is deferred.'
    }]
  });
}

/** @param {Record<string,unknown>} [overrides] */
function replay(overrides = {}) {
  const currentPresentation = presentation();
  return replayWorkflowHistory({
    sourcePack: { decision_records: [], clarification_events: [], execution_events: [] },
    items: [item()], priorState: null, currentPresentation,
    runInstanceId: runId, runIdentityDigest: sha, sourceRevision: 0,
    planDigest: sha, planChangeHeadSeq: 0, ...overrides
  });
}

/** @param {number} seq @param {string} type */
function common(seq, type) {
  return {
    event_id: `event_${seq}`, clarification_event_seq: seq, type,
    actor: 'owner', event_at: `2026-09-03T00:00:0${seq}.000Z`,
    authority_scope: 'checkout', run_instance_id: runId, run_identity_digest: sha
  };
}

test('decision clarification and execution histories share one exact global sequence and digest', () => {
  const finalPresentation = presentation([item()], 'final_confirmation');
  const valid = replay({
    priorWorkflowEventHeadSeq: 2,
    currentPresentation: finalPresentation,
    sourcePack: {
      decision_records: [{ decision_id: 'decision_1', clarification_event_seq: 1 }],
      clarification_events: [{ event_id: 'clarification_2', clarification_event_seq: 2, type: 'request_delivery' }],
      execution_events: [{ ...common(3, 'pause_execution_closure'),
        presented_presentation_id: finalPresentation.presentation_id,
        presented_plan_digest: sha, pending_item_refs: [],
        resume_target: 'final_confirmation', reason: 'user_requested' }]
    }
  });
  assert.deepEqual(valid.diagnostics, []);
  assert.equal(valid.workflow_event_head_seq, 3);
  assert.match(valid.workflow_event_log_digest, /^[a-f0-9]{64}$/u);

  for (const sequences of [[1, 3], [1, 1]]) {
    const invalid = replay({
      sourcePack: {
        decision_records: [{ decision_id: 'decision_a', clarification_event_seq: sequences[0] }],
        clarification_events: [{ event_id: 'clarification_a', clarification_event_seq: sequences[1], type: 'request_delivery' }],
        execution_events: []
      }
    });
    assert.equal(invalid.diagnostics.some((entry) => entry.code === 'WORKFLOW_EVENT_SEQUENCE_INVALID'), true, sequences.join(','));
  }
});

test('set disposition applies only to the displayed item digest head and option', () => {
  const shown = presentation();
  const decision = {
    ...common(1, 'set_dispositions'), presented_plan_digest: sha,
    presented_presentation_id: shown.presentation_id,
    decision_group_ids: [shown.groups[0].group_id],
    decisions: [{
      item_kind: 'case', item_id: 'case_a', item_semantic_digest: sha,
      item_semantic_change_head_seq: 0, execution_disposition: 'do_not_execute',
      reason_code: 'user_deferred', reason: 'Run it next release.'
    }]
  };
  const valid = replay({
    currentPresentation: shown,
    sourcePack: { decision_records: [], clarification_events: [], execution_events: [decision] }
  });
  assert.equal(valid.items[0].semantic_status, 'grounded');
  assert.equal(valid.items[0].execution_disposition, 'do_not_execute');
  assert.equal(valid.items[0].basis.origin, 'user_execution_decision');

  const stale = structuredClone(decision);
  stale.decisions[0].item_semantic_change_head_seq = 4;
  const rejected = replay({
    currentPresentation: shown,
    sourcePack: { decision_records: [], clarification_events: [], execution_events: [stale] }
  });
  assert.equal(rejected.diagnostics.some((entry) => entry.code === 'PRESENTED_ITEM_VERSION_INVALID'), true);
  assert.equal(rejected.items[0].execution_disposition, 'execute');
});

test('later legal execution event wins while history remains in the workflow digest', () => {
  const shown = presentation();
  /** @param {number} seq @param {string} disposition @param {string} reasonCode @param {string} reason */
  const makeDecision = (seq, disposition, reasonCode, reason) => ({
    ...common(seq, 'set_dispositions'), presented_plan_digest: sha,
    presented_presentation_id: shown.presentation_id,
    decision_group_ids: [shown.groups[0].group_id], decisions: [{
      item_kind: 'case', item_id: 'case_a', item_semantic_digest: sha,
      item_semantic_change_head_seq: 0, execution_disposition: disposition,
      reason_code: reasonCode, reason
    }]
  });
  const one = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [],
    execution_events: [makeDecision(1, 'do_not_execute', 'user_deferred', 'Later.')]
  } });
  const priorItem = item({
    execution_disposition: 'do_not_execute', reason_code: 'user_deferred', reason: 'Later.',
    basis: { origin: 'user_execution_decision', execution_event_id: 'event_1' }
  });
  const two = replay({ currentPresentation: shown, items: [priorItem],
    priorWorkflowEventHeadSeq: 1, planChangeHeadSeq: 1, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [
      makeDecision(1, 'do_not_execute', 'user_deferred', 'Later.'),
      makeDecision(2, 'execute', 'selected_for_run', 'Run now.')
    ]
  } });
  assert.equal(two.items[0].execution_disposition, 'execute');
  assert.notEqual(one.workflow_event_log_digest, two.workflow_event_log_digest);
});

test('one append batch cannot modify the same item twice or confirm a changed plan', () => {
  const shown = presentation();
  const change = {
    ...common(1, 'set_dispositions'), presented_plan_digest: sha,
    presented_presentation_id: shown.presentation_id,
    decision_group_ids: [shown.groups[0].group_id], decisions: [{
      item_kind: 'case', item_id: 'case_a', item_semantic_digest: sha,
      item_semantic_change_head_seq: 0, execution_disposition: 'do_not_execute',
      reason_code: 'user_deferred', reason: 'Later.'
    }]
  };
  const duplicate = { ...structuredClone(change), event_id: 'event_2', clarification_event_seq: 2 };
  const rejectedDuplicate = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [change, duplicate]
  } });
  assert.equal(rejectedDuplicate.diagnostics.some((entry) => entry.code === 'WORKFLOW_BATCH_SUBJECT_DUPLICATE'), true);
  assert.equal(rejectedDuplicate.items[0].execution_disposition, 'execute');

  const finalShown = presentation([item()], 'final_confirmation');
  const confirmation = {
    ...common(2, 'confirm_execution_plan'), presented_prompt_id: finalShown.presentation_id,
    presented_plan_digest: sha, presented_plan_change_head_seq: 0, presented_source_revision: 0
  };
  const rejectedConfirmation = replay({ currentPresentation: finalShown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [change, confirmation]
  } });
  assert.equal(rejectedConfirmation.diagnostics.some((entry) => entry.code === 'CONFIRMATION_BATCH_CONFLICT'), true);
  assert.equal(rejectedConfirmation.confirmation, null);
});

test('pause requires one unmatched pause and resume cannot reuse it', () => {
  const shown = presentation([item()], 'final_confirmation');
  const pause = {
    ...common(1, 'pause_execution_closure'), presented_presentation_id: shown.presentation_id,
    presented_plan_digest: sha, pending_item_refs: [], resume_target: 'final_confirmation', reason: 'user_requested'
  };
  const paused = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [pause]
  } });
  assert.equal(paused.active_pause.event_id, 'event_1');
  const resumed = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [
      pause, { ...common(2, 'resume_execution_closure'), pause_event_id: 'event_1' }
    ]
  } });
  assert.equal(resumed.active_pause, null);
  const duplicateResume = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [
      pause, { ...common(2, 'resume_execution_closure'), pause_event_id: 'event_1' },
      { ...common(3, 'resume_execution_closure'), pause_event_id: 'event_1' }
    ]
  } });
  assert.equal(duplicateResume.diagnostics.some((entry) => entry.code === 'PAUSE_RESUME_INVALID'), true);
});

test('confirmation binds the actual final-confirmation presentation and current plan head', () => {
  const shown = presentation([item()], 'final_confirmation');
  const confirmation = {
    ...common(1, 'confirm_execution_plan'), presented_prompt_id: shown.presentation_id,
    presented_plan_digest: sha, presented_plan_change_head_seq: 0, presented_source_revision: 0
  };
  const accepted = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [confirmation]
  } });
  assert.equal(accepted.confirmation.confirmed_plan_digest, sha);

  const oldPrompt = structuredClone(confirmation);
  oldPrompt.presented_prompt_id = 'PRESENTATION-old';
  const rejected = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [oldPrompt]
  } });
  assert.equal(rejected.confirmation, null);
  assert.equal(rejected.diagnostics.some((entry) => entry.code === 'CONFIRMATION_PRESENTATION_INVALID'), true);
});

test('presentation IDs bind complete visible membership and are deterministic', () => {
  const first = presentation();
  const second = presentation();
  assert.deepEqual(first, second);
  const changed = presentation([item({ title: 'Different title' })]);
  assert.notEqual(first.presentation_id, changed.presentation_id);
  assert.equal(first.groups[0].item_refs[0].title, 'Save settings');
  assert.equal(first.groups[0].item_refs[0].item_semantic_change_head_seq, 0);
});

test('an invalid record makes the new event batch atomic across items pause confirmation and plan head', () => {
  const shown = presentation();
  const validChange = {
    ...common(1, 'set_dispositions'), presented_plan_digest: sha,
    presented_presentation_id: shown.presentation_id,
    decision_group_ids: [shown.groups[0].group_id], decisions: [{
      item_kind: 'case', item_id: 'case_a', item_semantic_digest: sha,
      item_semantic_change_head_seq: 0, execution_disposition: 'do_not_execute',
      reason_code: 'user_deferred', reason: 'Later.'
    }]
  };
  const invalidPause = {
    ...common(2, 'pause_execution_closure'), presented_presentation_id: shown.presentation_id,
    presented_plan_digest: sha, pending_item_refs: [{ item_kind: 'case', item_id: 'missing' }],
    resume_target: 'execution_closure', reason: 'user_requested'
  };
  const rejected = replay({ currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [validChange, invalidPause]
  } });
  assert.notDeepEqual(rejected.diagnostics, []);
  assert.equal(rejected.items[0].execution_disposition, 'execute');
  assert.equal(rejected.active_pause, null);
  assert.equal(rejected.confirmation, null);
  assert.equal(rejected.plan_change_head_seq, 0);
});

test('pause binds the exact pending inventory and reason codes match semantic status', () => {
  const blocked = item({
    item_kind: 'formal_test_point', item_id: 'tp_a', title: 'Missing rule',
    semantic_status: 'blocked', execution_disposition: 'pending', reason_code: null,
    reason: null, basis: null
  });
  const shown = presentation([blocked]);
  const wrongReason = {
    ...common(1, 'set_dispositions'), presented_plan_digest: sha,
    presented_presentation_id: shown.presentation_id,
    decision_group_ids: [shown.groups[0].group_id], decisions: [{
      item_kind: 'formal_test_point', item_id: 'tp_a', item_semantic_digest: sha,
      item_semantic_change_head_seq: 0, execution_disposition: 'do_not_execute',
      reason_code: 'risk_not_adopted', reason: 'Wrong reason family.'
    }]
  };
  const rejectedReason = replay({ items: [blocked], currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [wrongReason]
  } });
  assert.equal(rejectedReason.diagnostics.some((entry) => entry.code === 'EXECUTION_REASON_STATUS_MISMATCH'), true);

  const pause = {
    ...common(1, 'pause_execution_closure'), presented_presentation_id: shown.presentation_id,
    presented_plan_digest: sha, pending_item_refs: [],
    resume_target: 'execution_closure', reason: 'user_requested'
  };
  const rejectedPause = replay({ items: [blocked], currentPresentation: shown, sourcePack: {
    decision_records: [], clarification_events: [], execution_events: [pause]
  } });
  assert.equal(rejectedPause.diagnostics.some((entry) => entry.code === 'PAUSE_PENDING_SET_INVALID'), true);
});

test('request_reanalysis binds existing locators and the current item version without supplying truth', () => {
  const shown = presentation();
  shown.groups[0].allowed_options.push({
    option_code: 'request_reanalysis', label: 'Reanalyze', meaning: 'Re-read source.'
  });
  const request = {
    event_id: 'event_reanalysis', clarification_event_seq: 1,
    type: 'request_reanalysis', actor: 'owner', event_at: '2026-09-03T00:00:00.000Z',
    presentation_id: shown.presentation_id, decision_group_ids: [shown.groups[0].group_id],
    source_locator_ids: ['locator_a'], reason: 'Re-read the cited acceptance criterion.',
    affected_items: [{
      item_kind: 'case', item_id: 'case_a', item_semantic_digest: sha,
      item_semantic_change_head_seq: 0
    }]
  };
  const accepted = replay({ currentPresentation: shown, sourcePack: {
    locators: [{ locator_id: 'locator_a' }], decision_records: [],
    clarification_events: [request], execution_events: []
  } });
  assert.deepEqual(accepted.diagnostics, []);
  assert.equal(accepted.plan_change_head_seq, 1);
  assert.equal(accepted.confirmation, null);

  const stale = structuredClone(request);
  stale.affected_items[0].item_semantic_digest = 'b'.repeat(64);
  const rejected = replay({ currentPresentation: shown, sourcePack: {
    locators: [{ locator_id: 'locator_other' }], decision_records: [],
    clarification_events: [stale], execution_events: []
  } });
  assert.equal(rejected.diagnostics.some((entry) => entry.code === 'REANALYSIS_LOCATOR_INVALID'), true);
  assert.equal(rejected.diagnostics.some((entry) => entry.code === 'REANALYSIS_ITEM_VERSION_INVALID'), true);
  assert.equal(rejected.plan_change_head_seq, 0);
});

test('Exploratory adoption is version-bound and temporary truth is superseded append-only', () => {
  const risk = item({
    item_kind: 'exploratory', item_id: 'risk_a', title: 'Retry risk',
    semantic_status: 'exploratory', related_obligation_ids: [],
    execution_disposition: 'pending', reason_code: null, reason: null, basis: null
  });
  const shown = presentation([risk]);
  shown.groups[0].allowed_options.push({
    option_code: 'adopt', label: 'Adopt', meaning: 'Adopt this risk.'
  });
  const adoption = {
    decision_id: 'decision_adopt', decision_type: 'exploratory_adoption',
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-09-03',
    presentation_id: shown.presentation_id, decision_group_ids: [shown.groups[0].group_id],
    exploratory_id: 'risk_a', item_semantic_digest: sha, item_semantic_change_head_seq: 0,
    business_rule: 'Retry once.', expected_result: 'The retry succeeds.',
    authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_a', evidence_level: 'E3'
  };
  const adopted = replay({ items: [risk], currentPresentation: shown, sourcePack: {
    locators: [{ locator_id: 'locator_a' }], decision_records: [adoption],
    clarification_events: [], execution_events: []
  } });
  assert.deepEqual(adopted.diagnostics, []);
  assert.equal(adopted.plan_change_head_seq, 1);
  const staleAdoption = structuredClone(adoption);
  staleAdoption.item_semantic_change_head_seq = 1;
  const rejectedAdoption = replay({ items: [risk], currentPresentation: shown, sourcePack: {
    locators: [{ locator_id: 'locator_a' }], decision_records: [staleAdoption],
    clarification_events: [], execution_events: []
  } });
  assert.equal(rejectedAdoption.diagnostics.some((entry) => entry.code === 'ADOPTION_ITEM_VERSION_INVALID'), true);

  const postReady = createPresentationSnapshot({
    purpose: 'semantic_clarification', entryContext: 'post_ready_change',
    postReadyControl: { preview_epoch: 1, originating_request_instance_id: 'PREVIEW-1' },
    runInstanceId: runId, sourceRevision: 0, planDigest: sha, planChangeHeadSeq: 0,
    groups: [{
      question: 'Adopt this risk?', items: [risk],
      allowedOptions: [{ option_code: 'apply', label: 'Apply', meaning: 'Apply change.' }],
      answerExample: 'Apply.', proposedChange: { kind: 'supplement_business_rule', text: 'Retry once.' }
    }]
  });
  const alteredAdoption = {
    ...adoption, presentation_id: postReady.presentation_id,
    decision_group_ids: [postReady.groups[0].group_id], business_rule: 'Retry twice.'
  };
  const rejectedAlteration = replay({ items: [risk], currentPresentation: postReady, sourcePack: {
    locators: [{ locator_id: 'locator_a' }], decision_records: [alteredAdoption],
    clarification_events: [], execution_events: []
  } });
  assert.equal(rejectedAlteration.diagnostics.some(
    (entry) => entry.code === 'POST_READY_PROPOSED_CHANGE_MISMATCH'
  ), true);

  const temporary = {
    decision_id: 'decision_temp', clarification_event_seq: 1, disposition: 'temporary',
    root_issue_ids: ['root_a']
  };
  const semanticShown = presentation([item({
    item_kind: 'formal_test_point', item_id: 'tp_a', semantic_status: 'blocked',
    execution_disposition: 'pending', reason_code: null, reason: null, basis: null
  })]);
  semanticShown.groups[0].allowed_options.push(
    { option_code: 'temporary', label: 'Temporary', meaning: 'Temporary answer.' },
    { option_code: 'final', label: 'Final', meaning: 'Final answer.' }
  );
  const final = {
    decision_id: 'decision_final', clarification_event_seq: 2, disposition: 'final',
    root_issue_ids: ['root_a'], supersedes_decision_ids: ['decision_temp'],
    presentation_id: semanticShown.presentation_id,
    decision_group_ids: [semanticShown.groups[0].group_id]
  };
  const validFinal = replay({ priorWorkflowEventHeadSeq: 1, currentPresentation: semanticShown, sourcePack: {
    decision_records: [temporary, final], clarification_events: [], execution_events: []
  } });
  assert.deepEqual(validFinal.diagnostics, []);
  const missingLink = structuredClone(final);
  delete (/** @type {any} */ (missingLink)).supersedes_decision_ids;
  const rejectedFinal = replay({ priorWorkflowEventHeadSeq: 1, currentPresentation: semanticShown, sourcePack: {
    decision_records: [temporary, missingLink], clarification_events: [], execution_events: []
  } });
  assert.equal(rejectedFinal.diagnostics.some((entry) => entry.code === 'DECISION_SUPERSESSION_REQUIRED'), true);
});
