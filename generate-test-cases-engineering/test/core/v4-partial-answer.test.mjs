import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import * as clarification from '../../src/clarification.mjs';

/** @param {string} character */
const sha = (character) => `sha256:${character.repeat(64)}`;
const checkpointBytes = new TextEncoder().encode('{"revision":3}\n');

/** @param {string} value */
function textDigest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function baseCheckpoint() {
  const facts = [
    ['ip', '评价列表包含 IP 列'],
    ['empty', '评价列表展示可为空的评价字段'],
    ['sort', '评价列表支持排序']
  ].map(([id, statement]) => ({ fact_id: `FACT-${id}`, statement, claim_ids: [`CLM-${id}`] }));
  /** @param {string} id @param {string} missingAspect @param {string} question @param {string[]} options @param {string} [risk] */
  const issue = (id, missingAspect, question, options, risk = 'high') => ({
    category: 'semantic_gap', code: `${id.toUpperCase()}_UNRESOLVED`, subject_fact_ids: [`FACT-${id}`],
    missing_aspect: missingAspect, scope_ref: `review.${id}`, question,
    why_needed: `需要明确${question}`, decision_impact: `答案决定 ${id} 的测试预期。`,
    unresolved_outcome: `${id} 场景保持待确认。`, answer_options: options, risk_level: risk,
    source_claim_ids: [`CLM-${id}`], discovery_phase: 'pre_case', affected_test_point_ids: []
  });
  return clarification.compileSemanticClarificationCheckpointV4({
    run_id: 'RUN-partial-answer', committed_revision: 3, committed_checkpoint_bytes: checkpointBytes,
    discovery_phase: 'pre_case', source_review_witness: {
      expected_unit_ids: ['BLOCK-prd'], reviewed_unit_ids: ['BLOCK-prd']
    },
    fact_ledger_digest: sha('1'), scope_manifest_digest: sha('2'), behavior_views_digest: null,
    case_drafts_digest: null, facts, diagnostic_candidates: [
      issue('ip', 'meaning', 'IP 列表示网络 IP 还是定位城市？', ['网络 IP', '定位城市']),
      issue('empty', 'empty_value', '空值字段展示为空白还是占位符？', ['空白', '-'], 'medium'),
      issue('sort', 'ordering', '列表默认按时间升序还是降序？', ['升序', '降序'])
    ], prior_checkpoint: null
  });
}

/**
 * @param {any} presentation
 * @param {any} part
 * @param {string} message
 * @param {string} answer
 * @param {'temporary'|'final'} [resolution]
 * @param {'user_statement'|'authorized_confirmation'} [originType]
 */
function answerEvent(presentation, part, message, answer, resolution = 'temporary', originType = 'user_statement') {
  const normalized = message.normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const characters = Array.from(normalized);
  const answerCharacters = Array.from(answer.normalize('NFC'));
  let start = -1;
  for (let index = 0; index <= characters.length - answerCharacters.length; index += 1) {
    if (answerCharacters.every((value, offset) => characters[index + offset] === value)) { start = index; break; }
  }
  assert.notEqual(start, -1);
  const excerpt = characters.slice(start, start + answerCharacters.length).join('');
  const answer_origin = {
    type: originType, presentation_id: presentation.presentation_id, message_digest: textDigest(normalized),
    answer_span: { start_scalar: start, end_scalar: start + answerCharacters.length, excerpt_digest: textDigest(excerpt) }
  };
  return clarification.constructSemanticClarificationEventV4(
    presentation, part, 'answer_question_part', {
      answer, resolution, authority: originType === 'authorized_confirmation' ? 'product_final' : 'task_scoped', answer_origin
    }
  );
}

/** @param {any} checkpoint @param {any[]} events @param {any[]} decisions @param {any[]} history @param {string[]} messages */
function apply(checkpoint, events, decisions, history, messages) {
  return clarification.applySemanticClarificationEventsV4({
    checkpoint, clarification_events: events, existing_decisions: decisions,
    presentation_history: history, normalized_user_messages: messages,
    previous_obligations_by_root: checkpoint.semantic_gap_ledger.map((/** @type {any} */ root) => ({
      root_issue_id: root.root_issue_id, obligation_ids: [`OBL-old-${root.missing_aspect}`]
    })),
    current_obligations_by_root: checkpoint.semantic_gap_ledger.map((/** @type {any} */ root) => ({
      root_issue_id: root.root_issue_id, obligation_ids: [`OBL-new-${root.missing_aspect}`]
    }))
  });
}

test('three-question presentation converges 3 -> 2 -> 1 and explicit defer closes only the selected root', () => {
  const initial = baseCheckpoint();
  const p1 = initial.presentation;
  const firstPart = p1.question_parts[0];
  const firstMessage = `第一项回答：${firstPart.answer_options[0]}`;
  const firstEvent = answerEvent(p1, firstPart, firstMessage, firstPart.answer_options[0]);
  const first = apply(initial.checkpoint, [firstEvent], [], [p1], [firstMessage]);
  assert.equal(first.commit_required, true);
  assert.equal(first.decisions.length, 1);
  assert.equal(first.checkpoint.clarification_state.root_states.find((/** @type {any} */ state) => state.root_issue_id === firstPart.root_issue_id).status, 'resolved_temporary');
  assert.equal(first.presentation.question_parts.length, 2);
  assert.ok(first.presentation.question_parts.every((/** @type {any} */ part) => part.question_part_id !== firstPart.question_part_id));

  const p2 = first.presentation;
  const secondPart = p2.question_parts[0];
  const secondMessage = `第二项回答：${secondPart.answer_options[0]}`;
  const second = apply(first.checkpoint, [answerEvent(p2, secondPart, secondMessage, secondPart.answer_options[0])], first.decisions, [p1, p2], [firstMessage, secondMessage]);
  assert.equal(second.presentation.question_parts.length, 1);
  assert.deepEqual(second.checkpoint.clarification_state.remaining_part_ids, [second.presentation.question_parts[0].question_part_id]);

  const p3 = second.presentation;
  const finalPart = p3.question_parts[0];
  const deferred = clarification.constructSemanticClarificationEventV4(p3, finalPart, 'defer_question_part');
  const third = apply(second.checkpoint, [deferred], second.decisions, [p1, p2, p3], [firstMessage, secondMessage]);
  assert.equal(third.presentation, null);
  assert.equal(third.checkpoint.clarification_state.root_states.find((/** @type {any} */ state) => state.root_issue_id === finalPart.root_issue_id).status, 'deferred_by_user');
});

test('one append may answer multiple question parts from the same presented batch without making later events stale', () => {
  const initial = baseCheckpoint();
  const presentation = initial.presentation;
  const answeredParts = presentation.question_parts.slice(0, 2);
  const messages = answeredParts.map((/** @type {any} */ part, /** @type {number} */ index) => `第 ${index + 1} 项：${part.answer_options[0]}`);
  const events = answeredParts.map((/** @type {any} */ part, /** @type {number} */ index) => (
    answerEvent(presentation, part, messages[index], part.answer_options[0])
  ));

  const result = apply(initial.checkpoint, events, [], [presentation], messages);

  assert.equal(result.commit_required, true);
  assert.equal(result.decisions.length, 2);
  assert.equal(result.presentation.question_parts.length, 1);
  assert.deepEqual(
    result.checkpoint.clarification_state.root_states
      .filter((/** @type {any} */ state) => state.status === 'resolved_temporary')
      .map((/** @type {any} */ state) => state.question_part_id)
      .sort(),
    answeredParts.map((/** @type {any} */ part) => part.question_part_id).sort()
  );

  const conflicting = apply(initial.checkpoint, [
    events[0], clarification.constructSemanticClarificationEventV4(presentation, answeredParts[0], 'request_delivery')
  ], [], [presentation], messages);
  assert.equal(conflicting.commit_required, false);
  assert.deepEqual(conflicting.checkpoint, initial.checkpoint);
});

test('blank, unparseable and no-information-gain input preserve exact checkpoint and revision', () => {
  const initial = baseCheckpoint();
  for (const events of [[], [{ event_type: 'answer_question_part', answer: '   ' }]]) {
    const result = apply(initial.checkpoint, events, [], [initial.presentation], []);
    assert.equal(result.status, 'no_information_gain');
    assert.equal(result.commit_required, false);
    assert.equal(result.committed_revision, initial.checkpoint.revision);
    assert.deepEqual(result.checkpoint, initial.checkpoint);
    assert.deepEqual(result.presentation.remaining_part_ids, initial.presentation.remaining_part_ids);
    assert.deepEqual(result.diagnostics.map((/** @type {any} */ item) => item.code), ['NO_INFORMATION_GAIN']);
  }
});

test('authority is compiler-enforced: ordinary answer is E1, authorized final E3, requested final without grant is downgraded once', () => {
  for (const fixture of [
    { origin: 'user_statement', resolution: 'temporary', expectedResolution: 'temporary', level: 'E1', state: 'resolved_temporary', classification: 'conditional', warning: false },
    { origin: 'authorized_confirmation', resolution: 'final', expectedResolution: 'final', level: 'E3', state: 'resolved_final', classification: 'grounded', warning: false },
    { origin: 'user_statement', resolution: 'final', expectedResolution: 'temporary', level: 'E1', state: 'resolved_temporary', classification: 'conditional', warning: true }
  ]) {
    const initial = baseCheckpoint(); const part = initial.presentation.question_parts[0];
    const answer = part.answer_options[0]; const message = `答复：${answer}`;
    const event = answerEvent(initial.presentation, part, message, answer, /** @type {any} */ (fixture.resolution), /** @type {any} */ (fixture.origin));
    const result = /** @type {any} */ (apply(initial.checkpoint, [event], [], [initial.presentation], [message]));
    assert.equal(result.decisions[0].resolution, fixture.expectedResolution);
    assert.equal(result.decisions[0].evidence_level, fixture.level);
    assert.equal(result.decision_claim_summaries[0].level, fixture.level);
    assert.equal(result.case_classification, fixture.classification);
    assert.equal(result.checkpoint.clarification_state.root_states.find((/** @type {any} */ state) => state.root_issue_id === part.root_issue_id).status, fixture.state);
    assert.deepEqual(result.non_blocking_diagnostics.map((/** @type {any} */ item) => item.code), fixture.warning ? ['FINAL_AUTHORITY_NOT_GRANTED'] : []);
    if (fixture.warning) {
      const replay = /** @type {any} */ (apply(result.checkpoint, [event], result.decisions,
        [initial.presentation, result.presentation], [message]));
      assert.equal(replay.status, 'replayed_decision');
      assert.deepEqual(replay.non_blocking_diagnostics, result.non_blocking_diagnostics);
      const unrelatedPart = result.presentation.question_parts[0];
      const unrelated = clarification.constructSemanticClarificationEventV4(result.presentation, unrelatedPart, 'defer_question_part');
      assert.deepEqual(apply(result.checkpoint, [unrelated], result.decisions,
        [initial.presentation, result.presentation], [message]).non_blocking_diagnostics, []);
    }
  }
  const initial = baseCheckpoint(); const part = initial.presentation.question_parts[0];
  const answer = part.answer_options[0]; const message = `答复：${answer}`;
  const authorized = answerEvent(initial.presentation, part, message, answer, 'final', 'authorized_confirmation');
  assert.throws(() => clarification.constructSemanticClarificationEventV4(
    initial.presentation, part, 'answer_question_part', { ...authorized, authority: 'task_scoped' }
  ), /SEMANTIC_ANSWER_INVALID/);
});

test('answer span is a normalized Unicode-scalar half-open binding and malformed bindings are rejected without a revision', () => {
  const initial = baseCheckpoint(); const part = initial.presentation.question_parts[0];
  const answer = '定位城市'; const message = `😀\r\n答案：${answer}`;
  const event = answerEvent(initial.presentation, part, message, answer);
  const accepted = apply(initial.checkpoint, [event], [], [initial.presentation], [message]);
  assert.equal(accepted.commit_required, true);
  assert.equal(accepted.decisions[0].answer, answer);
  for (const mutate of [
    (/** @type {any} */ copy) => { copy.answer_origin.answer_span.end_scalar = 999; },
    (/** @type {any} */ copy) => { copy.answer_origin.answer_span.excerpt_digest = sha('f'); },
    (/** @type {any} */ copy) => { copy.answer = '网络 IP'; }
  ]) {
    const copy = /** @type {any} */ (structuredClone(event)); mutate(copy);
    const canonicalMalformedEvent = clarification.constructSemanticClarificationEventV4(
      initial.presentation, part, 'answer_question_part', {
        answer: copy.answer, resolution: copy.resolution, authority: copy.authority,
        answer_origin: copy.answer_origin
      }
    );
    const rejected = apply(initial.checkpoint, [canonicalMalformedEvent], [], [initial.presentation], [message]);
    assert.equal(rejected.commit_required, false);
    assert.equal(rejected.status, 'no_information_gain');
    assert.deepEqual(rejected.checkpoint, initial.checkpoint);
  }
});
