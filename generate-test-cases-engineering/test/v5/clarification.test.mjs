import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  clarificationMessageDigest,
  minimalOriginFromRaw,
  validateAndBindResponseUnits
} from '../../src/v5/clarification-parser.mjs';
import {
  createPendingClarificationCommit,
  previewClarificationResponse
} from '../../src/v5/clarification-preview.mjs';
import {
  commitClarificationResponse,
  discardPendingClarification
} from '../../src/v5/clarification-reducer.mjs';
import {
  createClarificationPresentation,
  createQuestionPartStateSet,
  questionAnswerContractDigest,
  validateQuestionPartStateSet
} from '../../src/v5/question-parts.mjs';

const controls = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/policies/v5-clarification-control-registry.json', import.meta.url), 'utf8'));
const answers = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/policies/v5-answer-constraint-registry.json', import.meta.url), 'utf8'));
const root = `sha256:${'a'.repeat(64)}`;
const checkpoint = `sha256:${'b'.repeat(64)}`;
const lineage = 'lineage-clarification';
const answerContract = {
  answer_mode: 'typed_answer',
  allowed_controls: ['answer', 'defer', 'unknown', 'close_for_delivery'],
  value_schema: { kind: 'text', min_scalars: 1, max_scalars: 128, ambiguity_guard_ref: 'answer.no-unresolved-vague-token.v1' }
};

/** @param {string} id @param {string} question */
function gap(id, question) {
  return {
    gap_binding: { kind: 'requirements_gap', gap_id: id, gap_payload_digest: `sha256:${id.slice(-1).repeat(64)}` },
    answer_contract: answerContract,
    target: { kind: 'expected_outcome', ambiguity_candidate_id: `amb5_${id.slice(-1).repeat(64)}` },
    question,
    why_needed: '否则无法形成唯一验收判断。',
    question_impact_summary: {
      affected_module_ids: ['module-order'], affected_business_refs: ['order'], affected_claim_ids: [], current_test_point_ids: [],
      blocked_count: 1, conditional_count: 0, unresolved_outcome: '保留 Blocked'
    }
  };
}

function setup() {
  const gaps = [gap('gap-1', '保存后应显示什么？'), gap('gap-2', '通知何时出现？')];
  const stateSet = createQuestionPartStateSet(lineage, root, gaps);
  const presentation = createClarificationPresentation(stateSet, 4, gaps);
  return { gaps, stateSet, presentation };
}

/** @param {string} raw @param {number} start @param {number} end */
function origin(raw, start = 0, end = [...raw].length) { return minimalOriginFromRaw(raw, { start_scalar: start, end_scalar: end }); }

/** @param {ReturnType<typeof setup>} context @param {string} raw @param {Array<Record<string,any>>} units */
function bind(context, raw, units) {
  return validateAndBindResponseUnits({ raw_response: raw, presentation: context.presentation, units, control_registry: controls, answer_registry: answers });
}

test('Question Parts are stable, sorted, digest-verified records and presentation tokens are canonical', () => {
  const { stateSet, presentation } = setup();
  assert.equal(validateQuestionPartStateSet(stateSet).parts.length, 2);
  assert.deepEqual(presentation.parts.map((part) => part.display_token), ['Q001', 'Q002']);
  assert.deepEqual(presentation.parts.map((part) => part.question_state), ['presented', 'presented']);
  assert.equal(stateSet.parts.every((/** @type {Record<string,any>} */ part) => part.current_state === 'presented' && part.transition_history.length === 0), true);
  assert.equal(stateSet.parts.every((/** @type {Record<string,any>} */ part) => part.answer_contract_digest === questionAnswerContractDigest(answerContract)), true);
  const tampered = structuredClone(stateSet); tampered.parts[0].current_state = 'resolved_final';
  assert.throws(() => validateQuestionPartStateSet(tampered), /ACCEPTED_STATE_INTEGRITY_FAILURE/u);
});

test('reordered, skipped, and multiline units bind by exact Q token instead of display position', () => {
  const context = setup();
  const raw = 'Q002：通知在 5 秒内出现\nQ001：显示“保存成功”';
  const secondStart = raw.indexOf('Q001');
  const units = [
    { unit_client_key: 'u-two', origin: origin(raw, 0, secondStart - 1), target: { display_token: 'Q002', question_part_id: context.presentation.parts[1].question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '通知在 5 秒内出现' }, source_text: '通知在 5 秒内出现', nature: 'final' } },
    { unit_client_key: 'u-one', origin: origin(raw, secondStart), target: { display_token: 'Q001', question_part_id: context.presentation.parts[0].question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '显示“保存成功”' }, source_text: '显示“保存成功”', nature: 'final' } }
  ];
  const bound = bind(context, raw, units);
  assert.deepEqual(bound.map((unit) => unit.target.display_token), ['Q001', 'Q002']);
  assert.equal(bound.every((unit) => unit.evidence_level === 'E3'), true);
  const skipped = bind(context, 'Q002：稍后回答', [{ unit_client_key: 'u-skip', origin: origin('Q002：稍后回答'), target: { display_token: 'Q002', question_part_id: context.presentation.parts[1].question_part_id, root_version_digest: root }, action: 'defer' }]);
  assert.equal(skipped.length, 1);
});

test('duplicate, foreign, truncated, and missing multi-question tokens reject atomically', () => {
  const context = setup();
  const part = context.presentation.parts[0];
  /** @param {string} raw @param {string} [token] */
  const make = (raw, token = 'Q001') => [{ unit_client_key: 'u', origin: origin(raw), target: { display_token: token, question_part_id: part.question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '显示成功提示' }, source_text: '显示成功提示', nature: 'final' } }];
  assert.throws(() => bind(context, 'Q001 Q001：显示成功提示', make('Q001 Q001：显示成功提示')), /ANSWER_BINDING_AMBIGUOUS/u);
  assert.throws(() => bind(context, 'Q999：显示成功提示', make('Q999：显示成功提示')), /ANSWER_BINDING_AMBIGUOUS/u);
  assert.throws(() => bind(context, 'Q01：显示成功提示', make('Q01：显示成功提示')), /ANSWER_BINDING_AMBIGUOUS/u);
  assert.throws(() => bind(context, '显示成功提示', make('显示成功提示')), /ANSWER_BINDING_AMBIGUOUS/u);
});

test('temporary needs an exact registered basis while final is E3 and vague text cannot close a gap', () => {
  const context = setup(); const part = context.presentation.parts[0];
  const raw = 'Q001：暂按此口径，显示成功提示'; const markerStart = [...raw].indexOf('暂');
  const temporary = [{ unit_client_key: 'u-temp', origin: origin(raw), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '显示成功提示' }, source_text: '显示成功提示', nature: 'temporary', temporary_basis: origin(raw, markerStart, markerStart + [...'暂按此口径'].length) } }];
  assert.equal(bind(context, raw, temporary)[0].evidence_level, 'E1');
  assert.throws(() => bind(context, raw, [{ ...temporary[0], answer: { ...temporary[0].answer, temporary_basis: undefined } }]), /TEMPORARY_BASIS_REQUIRED/u);
  const vagueRaw = 'Q001：结果正常';
  assert.throws(() => bind(context, vagueRaw, [{ unit_client_key: 'u-vague', origin: origin(vagueRaw), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '结果正常' }, source_text: '结果正常', nature: 'final' } }]), /ANSWER_BINDING_INVALID/u);
});

test('control origins accept only exact registered tokens after target and wrapper stripping', () => {
  const context = setup(); const part = context.presentation.parts[0];
  for (const [raw, action] of [['（Q001：稍后回答。）', 'defer'], ['Q001：目前未知！', 'unknown'], ['Q001：保留未解决并继续交付。', 'close_for_delivery']]) {
    const bound = bind(context, raw, [{ unit_client_key: `u-${action}`, origin: origin(raw), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: root }, action }]);
    assert.equal(/** @type {Record<string,any>} */ (bound[0]).action, action);
  }
  const raw = 'Q001：我想稍后回答';
  assert.throws(() => bind(context, raw, [{ unit_client_key: 'u-bad-control', origin: origin(raw), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: root }, action: 'defer' }]), /CONTROL_ORIGIN_REQUIRED/u);
});

test('client-key and Question Part transition failures retain their dedicated protocol codes', () => {
  const context = setup();
  const part = context.presentation.parts[0];
  const raw = 'Q001：稍后回答';
  const valid = { unit_client_key: 'u-defer', origin: origin(raw), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: root }, action: 'defer' };
  assert.throws(() => bind(context, raw, [{ ...valid, unit_client_key: '' }]), /CLIENT_KEY_INVALID/u);
  assert.throws(() => bind(context, raw, [valid, { ...valid }]), /CLIENT_KEY_INVALID/u);

  const presentation = structuredClone(context.presentation);
  presentation.parts[0].current_allowed_controls = ['answer'];
  assert.throws(() => validateAndBindResponseUnits({ raw_response: raw, presentation, units: [valid], control_registry: controls, answer_registry: answers }), /QUESTION_PART_TRANSITION_INVALID/u);
});

test('a single active Question Part may omit Q token and clone is the only exact multi-token origin', () => {
  const oneGap = [gap('gap-1', '保存后应显示什么？')];
  const stateSet = createQuestionPartStateSet(lineage, root, oneGap);
  const presentation = createClarificationPresentation(stateSet, 1, oneGap);
  const tokenless = validateAndBindResponseUnits({ raw_response: '稍后回答', presentation, units: [{ unit_client_key: 'u-tokenless', origin: origin('稍后回答'), target: { display_token: 'Q001', question_part_id: presentation.parts[0].question_part_id, root_version_digest: root }, action: 'defer' }], control_registry: controls, answer_registry: answers });
  assert.equal(tokenless.length, 1);

  const context = setup(); const raw = '以下回答同时适用 Q001 Q002：显示保存成功'; const shared = origin(raw);
  const cloneUnits = context.presentation.parts.map((part, index) => ({ unit_client_key: `u-clone-${index}`, shared_origin_group_id: 'clone-1', origin: shared, target: { display_token: part.display_token, question_part_id: part.question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '显示保存成功' }, source_text: '显示保存成功', nature: 'final' } }));
  assert.equal(bind(context, raw, cloneUnits).length, 2);
  assert.throws(() => bind(context, raw.replace('Q002', 'Q003'), cloneUnits.map((unit) => ({ ...unit, origin: origin(raw.replace('Q002', 'Q003')) }))), /ANSWER_BINDING_AMBIGUOUS/u);
});

test('preview is deterministic and non-semantic; commit requires the same preview and exact confirmation token', () => {
  const context = setup(); const part = context.presentation.parts[0]; const raw = 'Q001：显示保存成功';
  const units = [{ unit_client_key: 'u-confirm', origin: origin(raw), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '显示保存成功' }, source_text: '显示保存成功', nature: 'final' } }];
  const before = structuredClone(context.stateSet);
  const result = previewClarificationResponse({ raw_response: raw, presentation: context.presentation, state_set: context.stateSet, gaps: context.gaps, units, control_registry: controls, answer_registry: answers, base_checkpoint_digest: checkpoint });
  assert.deepEqual(context.stateSet, before);
  assert.equal(result.preview.deterministic_projection.no_semantic_change, false);
  assert.equal(result.pending.status, 'pending');
  assert.equal(Object.hasOwn(result.pending, 'raw_response'), false);
  assert.equal(result.preview.response_message_digest, clarificationMessageDigest(raw));

  assert.throws(() => commitClarificationResponse({ pending: result.pending, preview: result.preview, state_set: context.stateSet, raw_confirmation: '不确认', confirmation_range: { start_scalar: 0, end_scalar: 3 }, control_registry: controls, current: { semantic_root_digest: root, presentation_digest: context.presentation.presentation_digest, question_part_state_set_digest: context.stateSet.state_set_digest, source_revision: 4, checkpoint_digest: checkpoint } }), /CLARIFICATION_CONFIRMATION_INVALID/u);
  const confirmation = '  确认提交  '; const committed = commitClarificationResponse({ pending: result.pending, preview: result.preview, state_set: context.stateSet, raw_confirmation: confirmation, confirmation_range: { start_scalar: 2, end_scalar: 6 }, control_registry: controls, current: { semantic_root_digest: root, presentation_digest: context.presentation.presentation_digest, question_part_state_set_digest: context.stateSet.state_set_digest, source_revision: 4, checkpoint_digest: checkpoint } });
  assert.equal(committed.decisions.length, 1);
  assert.equal(committed.decisions[0].evidence_level, 'E3');
  assert.equal(committed.next_state_set.parts.find((/** @type {Record<string,any>} */ row) => row.question_part_id === part.question_part_id).current_state, 'resolved_final');
  assert.deepEqual(committed.impact.actual_projection, result.preview.deterministic_projection);
  assert.throws(() => commitClarificationResponse({ pending: result.pending, preview: { ...result.preview, preview_digest: `sha256:${'f'.repeat(64)}` }, state_set: context.stateSet, raw_confirmation: '确认提交', confirmation_range: { start_scalar: 0, end_scalar: 4 }, control_registry: controls, current: { semantic_root_digest: root, presentation_digest: context.presentation.presentation_digest, question_part_state_set_digest: context.stateSet.state_set_digest, source_revision: 4, checkpoint_digest: checkpoint } }), /CLARIFICATION_PREVIEW_STALE/u);
});

test('defer/unknown do not resolve and delivery-close remains unresolved; discard is idempotent', () => {
  const context = setup();
  const raw = 'Q001：暂缓回答'; const units = [{ unit_client_key: 'u-defer', origin: origin(raw), target: { display_token: 'Q001', question_part_id: context.presentation.parts[0].question_part_id, root_version_digest: root }, action: 'defer' }];
  const { preview, pending } = previewClarificationResponse({ raw_response: raw, presentation: context.presentation, state_set: context.stateSet, gaps: context.gaps, units, control_registry: controls, answer_registry: answers, base_checkpoint_digest: checkpoint });
  const committed = commitClarificationResponse({ pending, preview, state_set: context.stateSet, raw_confirmation: '确认以上变更', confirmation_range: { start_scalar: 0, end_scalar: 6 }, control_registry: controls, current: { semantic_root_digest: root, presentation_digest: context.presentation.presentation_digest, question_part_state_set_digest: context.stateSet.state_set_digest, source_revision: 4, checkpoint_digest: checkpoint } });
  assert.equal(committed.decisions.length, 0);
  assert.equal(committed.next_state_set.parts[0].current_state, 'deferred_by_user');
  const once = discardPendingClarification(pending);
  const twice = discardPendingClarification(once);
  assert.deepEqual(twice, once);
  assert.equal(once.status, 'superseded');
});

test('pending construction rejects a preview/unit mismatch', () => {
  const context = setup(); const part = context.presentation.parts[0]; const raw = 'Q001：显示成功';
  const bound = bind(context, raw, [{ unit_client_key: 'u', origin: origin(raw), target: { display_token: 'Q001', question_part_id: part.question_part_id, root_version_digest: root }, action: 'answer', answer: { value: { kind: 'text', value: '显示成功' }, source_text: '显示成功', nature: 'final' } }]);
  assert.throws(() => createPendingClarificationCommit({ preview: { preview_digest: `sha256:${'1'.repeat(64)}`, bindings: [] }, canonical_units: bound, decision_proposals: [], base_checkpoint_digest: checkpoint }), /CLARIFICATION_IMPACT_MISMATCH/u);
});
