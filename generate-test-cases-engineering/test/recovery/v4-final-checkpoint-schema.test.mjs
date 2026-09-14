import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import checkpointSchema from '../../skill/generate-test-cases/scripts/schemas/checkpoint.schema.json' with { type: 'json' };
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

/** @param {string} value */
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

/** @returns {any} */
function finalCheckpoint() {
  return {
    schema_version: '4.0.0', compiler_version: '0.5.0',
    run_id: 'RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', revision: 4,
    commit_profile: 'final',
    source_review_witness: { expected_unit_ids: ['UNIT-1'], reviewed_unit_ids: ['UNIT-1'] },
    fact_ledger_digest: sha('facts'), scope_manifest_digest: sha('scope'),
    behavior_views_digest: sha('views'), case_drafts_digest: sha('cases'),
    base_checkpoint_digest: sha('base'), semantic_gap_ledger: [],
    clarification_state: {
      root_states: [], answered_part_ids: [], remaining_part_ids: [],
      closed_for_delivery_part_ids: [], cycle_digest: sha('cycle'),
      latest_presentation_id: null, presentation: null, presentation_digest: null
    }
  };
}

test('T10 checkpoint schema accepts a closed final revision with complete behavior and case digests', () => {
  assert.deepEqual(validateAgainstSchema(finalCheckpoint(), checkpointSchema), []);
});

test('T10 final checkpoint schema rejects an active presentation or incomplete downstream digests', () => {
  const missingViews = finalCheckpoint();
  missingViews.behavior_views_digest = null;
  assert.notDeepEqual(validateAgainstSchema(missingViews, checkpointSchema), []);

  const missingCases = finalCheckpoint();
  missingCases.case_drafts_digest = null;
  assert.notDeepEqual(validateAgainstSchema(missingCases, checkpointSchema), []);

  const remaining = finalCheckpoint();
  remaining.clarification_state.remaining_part_ids = [`QP-${'1'.repeat(64)}`];
  assert.notDeepEqual(validateAgainstSchema(remaining, checkpointSchema), []);

  const active = finalCheckpoint();
  const presentationId = `PRES-${'2'.repeat(64)}`;
  const questionPartId = `QP-${'3'.repeat(64)}`;
  const rootIssueId = `ROOT-${'4'.repeat(64)}`;
  const rootVersionDigest = sha('root');
  active.clarification_state.presentation = {
    schema_version: '4.0.0', presentation_id: presentationId,
    phase: 'requirements_analysis', supersedes_presentation_id: null,
    answered_part_ids: [], remaining_part_ids: [questionPartId],
    cycle_digest: sha('active-cycle'), run_actions: ['cancel_run'],
    recovery: {
      mode: 'append_clarification_event', run_id: active.run_id,
      committed_revision: active.revision,
      committed_checkpoint_digest: sha('checkpoint'),
      after_partial_answer: 'issue_successor_for_remaining_parts'
    },
    question_parts: [{
      question_part_id: questionPartId, root_issue_id: rootIssueId,
      root_version_digest: rootVersionDigest, question: 'Which rule?',
      why_needed: 'It changes the outcome.', decision_impact: 'The expected result changes.',
      unresolved_outcome: 'The affected case remains blocked.', affected_facts: ['rule'],
      answer_options: ['A'], risk_level: 'high',
      available_actions: ['answer_question_part', 'defer_question_part', 'mark_question_unknown', 'request_delivery'],
      action_context: {
        presentation_id: presentationId, question_part_id: questionPartId,
        root_issue_id: rootIssueId, root_version_digest: rootVersionDigest
      }
    }]
  };
  assert.notDeepEqual(validateAgainstSchema(active, checkpointSchema), []);

  const activeDigest = finalCheckpoint();
  activeDigest.clarification_state.presentation_digest = sha('presentation');
  assert.notDeepEqual(validateAgainstSchema(activeDigest, checkpointSchema), []);
});
