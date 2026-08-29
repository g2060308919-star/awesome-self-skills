import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { digest } from '../../src/canonical.mjs';
import { evaluateClarification } from '../../src/clarification.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(await readFile(
  path.join(repositoryRoot, 'test/fixtures/clarification/base-context.json'), 'utf8'
));
const ROOT_ORACLE = 'root_f5525106a963b78d';

function baseContext() {
  return structuredClone(fixture);
}

test('record only skips the pause while preserving the complete formal semantic snapshot', () => {
  const context = baseContext();
  const before = structuredClone(context);
  const strict = evaluateClarification(context, 'pause_for_clarification');
  const recorded = evaluateClarification(context, 'record_only');

  assert.equal(strict.action, 'need_user_answers');
  assert.equal(strict.interaction.paused, true);
  assert.equal(recorded.action, 'deliver');
  assert.equal(recorded.interaction.paused, false);
  assert.equal(recorded.root_issues.length, 1, 'record_only retains the Blocked root instead of filtering it');
  assert.deepEqual(recorded.semantic_snapshot, strict.semantic_snapshot);
  assert.deepEqual(recorded.semantic_snapshot.formal_test_points, [{
    obligation_id: 'obligation_refund_failure', evidence_level: 'E0', classification: 'blocked', blocked_reason: 'MISSING_ORACLE'
  }]);
  assert.equal(recorded.semantic_snapshot.coverage_denominator, 1);
  assert.deepEqual(context, before);
});

test('record only and strict user-requested delivery preserve the same six semantic sections', () => {
  const strictContext = baseContext();
  strictContext.source_revision = 1;
  strictContext.prior_state = {
    source_revision: 0,
    clarification_event_seq: 0,
    asked_root_issue_ids: [ROOT_ORACLE],
    root_issue_dispositions: [{ root_issue_id: ROOT_ORACLE, status: 'asked' }],
    last_pending_root_issue_ids: [ROOT_ORACLE],
    last_question_set_digest: digest([ROOT_ORACLE]),
    clarification_stop: null,
    semantic_snapshot: structuredClone(strictContext.semantic_snapshot)
  };
  strictContext.append_batch.clarification_events = [{
    event_id: 'event_deliver', clarification_event_seq: 1, type: 'request_delivery', actor: 'owner',
    event_at: '2026-08-30', root_issue_ids: [ROOT_ORACLE]
  }];
  const strictDelivered = evaluateClarification(strictContext, 'pause_for_clarification');
  const recorded = evaluateClarification(baseContext(), 'record_only');

  assert.equal(strictDelivered.action, 'deliver');
  assert.equal(strictDelivered.state.clarification_stop.reason, 'user_requested_delivery');
  assert.deepEqual(Object.keys(strictDelivered.semantic_snapshot.delivery_sections).sort(), [
    'blocked', 'conditional', 'coverage', 'exploratory', 'grounded', 'quality'
  ]);
  assert.deepEqual(recorded.semantic_snapshot.delivery_sections, strictDelivered.semantic_snapshot.delivery_sections);
  assert.deepEqual(recorded.semantic_snapshot.formal_test_points, strictDelivered.semantic_snapshot.formal_test_points);
  assert.equal(recorded.semantic_snapshot.coverage_denominator, strictDelivered.semantic_snapshot.coverage_denominator);
});

test('record only returns fresh output and cannot lower classifications or evidence levels', () => {
  const context = baseContext();
  const first = evaluateClarification(context, 'record_only');
  first.semantic_snapshot.formal_test_points[0].evidence_level = 'E3';
  first.semantic_snapshot.delivery_sections.blocked.length = 0;
  const second = evaluateClarification(context, 'record_only');
  assert.equal(second.semantic_snapshot.formal_test_points[0].evidence_level, 'E0');
  assert.deepEqual(second.semantic_snapshot.delivery_sections.blocked, ['obligation_refund_failure']);
});

test('record only remains hidden from the process and Skill interfaces', async () => {
  const invalid = evaluateClarification(baseContext(), 'strict');
  assert.equal(invalid.action, 'need_revision');
  assert.equal(invalid.diagnostics.some((/** @type {any} */ item) => item.code === 'INTERACTION_POLICY_INVALID'), true);

  const publicSurfaces = await Promise.all([
    'src/entry.mjs', 'src/advance-strict.mjs', 'package.json', 'skill/generate-test-cases/SKILL.md'
  ].map((file) => readFile(path.join(repositoryRoot, file), 'utf8')));
  const hiddenName = ['record', 'only'].join('_');
  for (const surface of publicSurfaces) assert.equal(surface.includes(hiddenName), false);
});
