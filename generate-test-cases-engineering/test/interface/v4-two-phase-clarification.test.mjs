import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as clarification from '../../src/clarification.mjs';
import { renderSemanticPresentationSummaryV4 } from '../../src/presentation-summary.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { sha256CanonicalV4 } from '../../src/semantic-gaps-v4.mjs';

const replySchema = JSON.parse(await readFile(new URL(
  '../../skill/generate-test-cases/scripts/schemas/reply.schema.json', import.meta.url
), 'utf8'));

/** @param {string} character */
const sha = (character) => `sha256:${character.repeat(64)}`;
const checkpointBytes = new TextEncoder().encode('{"revision":7}\n');

const facts = [
  { fact_id: 'FACT-ip', statement: 'IP 列', claim_ids: ['CLM-ip'] },
  { fact_id: 'FACT-empty', statement: '空值展示', claim_ids: ['CLM-empty'] },
  { fact_id: 'FACT-sort', statement: '默认排序', claim_ids: ['CLM-sort'] },
  { fact_id: 'FACT-refresh', statement: '刷新列表', claim_ids: ['CLM-refresh'] }
];

/** @param {'ip'|'empty'|'sort'|'refresh'} subject @param {'pre_case'|'post_case'} [phase] @returns {any} */
function gap(subject, phase = 'pre_case') {
  /** @type {Record<string, any[]>} */
  const table = {
    ip: ['FACT-ip', 'meaning', 'admin.ip', 'IP 表示网络地址还是定位城市？', '需要明确 IP 的业务含义。', '决定数据格式与列值预期。', '该列场景待确认。', ['网络 IP', '定位城市'], 'high'],
    empty: ['FACT-empty', 'empty_display', 'admin.empty', '空值显示为空白还是短横线？', '需要明确空值表现。', '决定空值展示预期。', '空值场景待确认。', ['空白', '-'], 'medium'],
    sort: ['FACT-sort', 'sort_direction', 'admin.sort', '默认排序是升序还是降序？', '需要明确列表顺序。', '决定首屏顺序预期。', '排序场景待确认。', ['升序', '降序'], 'high'],
    refresh: ['FACT-refresh', 'refresh_timing', 'admin.refresh', '刷新后何时应看到最新评价？', '需要明确刷新完成时机。', '决定刷新步骤后的观察时点。', '刷新时机场景待确认。', ['刷新完成后立即', '后台同步完成后'], 'high']
  };
  const [factId, missing, scope, question, why, impact, outcome, options, risk] = table[subject];
  return {
    category: 'semantic_gap', code: `${subject.toUpperCase()}_UNRESOLVED`, subject_fact_ids: [factId],
    missing_aspect: missing, scope_ref: scope, question, why_needed: why, decision_impact: impact,
    unresolved_outcome: outcome, answer_options: options, risk_level: risk, source_claim_ids: [`CLM-${subject}`],
    discovery_phase: phase
  };
}

/** @param {any} [options] @returns {any} */
function request(options = {}) {
  const { phase = 'pre_case', candidates = [gap('ip'), gap('empty'), gap('sort')], prior_checkpoint = null, ...overrides } = options;
  return {
    run_id: 'RUN-two-phase', committed_revision: 7, committed_checkpoint_bytes: checkpointBytes,
    discovery_phase: phase,
    source_review_witness: { expected_unit_ids: ['B1', 'T1', 'I1'], reviewed_unit_ids: ['T1', 'I1', 'B1'] },
    fact_ledger_digest: sha('1'), scope_manifest_digest: sha('2'),
    behavior_views_digest: phase === 'pre_case' ? null : sha('3'),
    case_drafts_digest: phase === 'pre_case' ? null : sha('4'),
    facts, diagnostic_candidates: candidates, prior_checkpoint, ...overrides
  };
}

test('post-case adds a genuinely new root, carries remaining roots, and never repeats a resolved root', () => {
  assert.equal(typeof clarification.compileSemanticClarificationCheckpointV4, 'function');
  const first = clarification.compileSemanticClarificationCheckpointV4(request());
  const ip = first.presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('IP'));
  const narrowed = clarification.applyRequestDeliveryV4(first.checkpoint, {
    event_type: 'request_delivery', presentation_id: first.presentation.presentation_id,
    question_part_refs: [{
      question_part_id: ip.question_part_id, root_issue_id: ip.root_issue_id,
      root_version_digest: ip.root_version_digest
    }]
  });
  const prior = structuredClone(narrowed.checkpoint);
  prior.clarification_state.root_states.find(
    (/** @type {any} */ root) => root.question_part_id === ip.question_part_id
  ).status = 'resolved_temporary';
  prior.clarification_state.answered_part_ids = [ip.question_part_id];
  prior.clarification_state.closed_for_delivery_part_ids = [];
  prior.clarification_state.presentation.answered_part_ids = [ip.question_part_id];
  prior.clarification_state.presentation_digest = sha256CanonicalV4(prior.clarification_state.presentation);

  const second = clarification.compileSemanticClarificationCheckpointV4(request({
    phase: 'post_case', candidates: [gap('ip', 'post_case'), gap('empty', 'post_case'), gap('sort', 'post_case'), gap('refresh', 'post_case')],
    prior_checkpoint: prior
  }));
  assert.equal(second.presentation.phase, 'case_design');
  assert.equal(second.checkpoint.commit_profile, 'post_case_pending');
  assert.equal(second.presentation.question_parts.length, 3);
  assert.equal(second.presentation.question_parts
    .some((/** @type {any} */ part) => part.root_issue_id === ip.root_issue_id), false);
  assert.equal(second.presentation.question_parts
    .filter((/** @type {any} */ part) => part.question.includes('刷新')).length, 1);
  assert.deepEqual(second.presentation.answered_part_ids, [ip.question_part_id]);
  assert.equal(second.presentation.supersedes_presentation_id, prior.clarification_state.presentation.presentation_id);
});

test('no-information-gain is a byte-stable replay that keeps the same pending set and revision', () => {
  assert.equal(typeof clarification.replayNoInformationGainV4, 'function');
  const first = clarification.compileSemanticClarificationCheckpointV4(request());
  const replay = clarification.replayNoInformationGainV4(first.checkpoint, {
    presentation_id: first.presentation.presentation_id,
    cycle_digest: first.presentation.cycle_digest,
    committed_revision: 7
  });
  assert.equal(replay.status, 'need_user_answers');
  assert.equal(replay.committed_revision, 7);
  assert.deepEqual(replay.presentation, first.presentation);
  assert.deepEqual(replay.checkpoint.clarification_state.remaining_part_ids, first.checkpoint.clarification_state.remaining_part_ids);
  assert.deepEqual(replay.checkpoint.clarification_state.root_states, first.checkpoint.clarification_state.root_states);
  assert.equal(replay.no_information_gain, true);
  assert.throws(() => clarification.replayNoInformationGainV4(first.checkpoint, {
    presentation_id: first.presentation.presentation_id, cycle_digest: sha('f'), committed_revision: 7
  }), /STALE_PRESENTATION/);
});

test('request_delivery closes only explicit question-part refs and cannot suppress later roots', () => {
  assert.equal(typeof clarification.applyRequestDeliveryV4, 'function');
  const first = clarification.compileSemanticClarificationCheckpointV4(request());
  const ip = first.presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('IP'));
  const event = {
    event_type: 'request_delivery', presentation_id: first.presentation.presentation_id,
    question_part_refs: [{
      question_part_id: ip.question_part_id, root_issue_id: ip.root_issue_id, root_version_digest: ip.root_version_digest
    }]
  };
  const selected = clarification.applyRequestDeliveryV4(first.checkpoint, event);
  assert.deepEqual(selected.checkpoint.clarification_state.closed_for_delivery_part_ids, [ip.question_part_id]);
  assert.equal(selected.checkpoint.clarification_state.remaining_part_ids.includes(ip.question_part_id), false);
  assert.equal(selected.checkpoint.clarification_state.remaining_part_ids.length, 2);

  const later = clarification.compileSemanticClarificationCheckpointV4(request({
    phase: 'post_case', candidates: [gap('ip', 'post_case'), gap('empty', 'post_case'), gap('sort', 'post_case'), gap('refresh', 'post_case')],
    prior_checkpoint: selected.checkpoint
  }));
  assert.equal(later.presentation.question_parts
    .some((/** @type {any} */ part) => part.question.includes('IP')), false);
  assert.equal(later.presentation.question_parts
    .some((/** @type {any} */ part) => part.question.includes('刷新')), true);
  assert.equal(later.checkpoint.clarification_state.closed_for_delivery_part_ids.includes(ip.question_part_id), true);
});

test('pre/post checkpoint profiles reject phase-incomplete or cross-phase artifacts atomically', () => {
  const pre = clarification.compileSemanticClarificationCheckpointV4(request());
  assert.equal(clarification.validateSemanticClarificationCheckpointV4(pre.checkpoint).length, 0);
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(request({
    phase: 'post_case', candidates: [gap('refresh', 'post_case')],
    behavior_views_digest: null, case_drafts_digest: sha('4'), prior_checkpoint: pre.checkpoint
  })), /POST_CASE_ARTIFACT_ORDER_INVALID/);
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(request({
    phase: 'post_case', candidates: [gap('refresh', 'post_case')],
    behavior_views_digest: sha('3'), case_drafts_digest: null, prior_checkpoint: pre.checkpoint
  })), /POST_CASE_ARTIFACT_ORDER_INVALID/);
  const forged = /** @type {any} */ (structuredClone(pre.checkpoint));
  forged.commit_profile = 'post_case_pending';
  assert.ok(clarification.validateSemanticClarificationCheckpointV4(forged).some((item) => item.code === 'CHECKPOINT_PROFILE_MISMATCH'));
});

test('checkpoint atomically binds pending state, ledger, presentation and recovery identity', () => {
  const { checkpoint } = clarification.compileSemanticClarificationCheckpointV4(request());
  const withoutPresentation = /** @type {any} */ (structuredClone(checkpoint));
  withoutPresentation.clarification_state.presentation = null;
  withoutPresentation.clarification_state.presentation_digest = null;
  assert.ok(clarification.validateSemanticClarificationCheckpointV4(withoutPresentation)
    .some((/** @type {any} */ item) => item.code === 'CHECKPOINT_PRESENTATION_STATE_MISMATCH'));

  const staleRoot = /** @type {any} */ (structuredClone(checkpoint));
  staleRoot.clarification_state.root_states[0].root_version_digest = sha('f');
  assert.ok(clarification.validateSemanticClarificationCheckpointV4(staleRoot)
    .some((/** @type {any} */ item) => item.code === 'CHECKPOINT_ROOT_BINDING_MISMATCH'));

  const staleRecovery = /** @type {any} */ (structuredClone(checkpoint));
  staleRecovery.clarification_state.presentation.recovery.committed_checkpoint_digest = sha('e');
  assert.ok(clarification.validateSemanticClarificationCheckpointV4(staleRecovery)
    .some((/** @type {any} */ item) => item.code === 'CHECKPOINT_RECOVERY_MISMATCH'));
});

test('every advertised semantic action can be built from the presentation into a closed Source Pack event', async () => {
  assert.equal(typeof clarification.constructSemanticClarificationEventV4, 'function');
  const first = clarification.compileSemanticClarificationCheckpointV4(request());
  const part = first.presentation.question_parts[0];
  const sourceSchema = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json', import.meta.url), 'utf8'));
  const eventSchema = { $defs: sourceSchema.$defs, $ref: '#/$defs/v4SemanticClarificationEvent' };
  for (const action of part.available_actions) {
    const answer = '业务口径';
    const messageDigest = `sha256:${createHash('sha256').update(answer, 'utf8').digest('hex')}`;
    const event = clarification.constructSemanticClarificationEventV4(first.presentation, part, action,
      action === 'answer_question_part' ? {
        answer, resolution: 'temporary', authority: 'task_scoped',
        answer_origin: {
          type: 'user_statement', presentation_id: first.presentation.presentation_id,
          message_digest: messageDigest,
          answer_span: { start_scalar: 0, end_scalar: 4, excerpt_digest: messageDigest }
        }
      } : {});
    assert.deepEqual(validateAgainstSchema(event, eventSchema), [], action);
  }
  const cancel = clarification.constructSemanticClarificationEventV4(first.presentation, null, 'cancel_run', {});
  assert.deepEqual(validateAgainstSchema(cancel, eventSchema), []);
  const forged = /** @type {any} */ (clarification.constructSemanticClarificationEventV4(
    first.presentation, part, 'defer_question_part', {}
  ));
  forged.execution_resource = 'https://example.test';
  assert.notDeepEqual(validateAgainstSchema(forged, eventSchema), []);
  const detachedPart = /** @type {any} */ (structuredClone(part));
  detachedPart.action_context.root_issue_id = 'ROOT-' + 'f'.repeat(64);
  assert.throws(() => clarification.constructSemanticClarificationEventV4(
    first.presentation, detachedPart, 'defer_question_part', {}
  ), /SEMANTIC_ACTION_NOT_ADVERTISED/);
});

test('clarification policy orders pre-case and post-case discovery and preserves omitted answers', async () => {
  const policy = await readFile(new URL(
    '../../skill/generate-test-cases/references/clarification-policy.md', import.meta.url
  ), 'utf8');
  assert.match(policy, /pre-case[\s\S]*source review[\s\S]*atomic fact[\s\S]*scope manifest[\s\S]*before[\s\S]*Behavior Views/iu);
  assert.match(policy, /post-case|case_design/iu);
  assert.match(policy, /unanswered[\s\S]*(?:remain|stay)[\s\S]*(?:presented|pending)/iu);
  assert.match(policy, /blank|unparseable|cannot be reliably bound/iu);
  assert.match(policy, /no_information_gain[\s\S]*same pending[\s\S]*(?:no|without)[\s\S]*(?:revision|suppress)/iu);
});

test('default semantic presentation rendering is business-readable and hides protocol bindings', () => {
  const { presentation } = clarification.compileSemanticClarificationCheckpointV4(request());
  const rendered = renderSemanticPresentationSummaryV4(presentation, 'zh-CN');
  for (const part of presentation.question_parts) {
    assert.match(rendered, new RegExp(part.question.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.match(rendered, new RegExp(part.why_needed.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.match(rendered, new RegExp(part.decision_impact.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
    assert.match(rendered, new RegExp(part.unresolved_outcome.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }
  assert.match(rendered, /回答问题|暂缓|标记未知|按当前结果交付/u);
  assert.doesNotMatch(rendered, /ROOT-|QP-|PRES-|sha256:/u);
});

test('requirements and case-design replies carry the exact closed semantic presentation', () => {
  for (const phase of ['pre_case', 'post_case']) {
    const prior = phase === 'post_case'
      ? clarification.compileSemanticClarificationCheckpointV4(request()).checkpoint
      : null;
    const result = clarification.compileSemanticClarificationCheckpointV4(request({
      phase,
      candidates: phase === 'pre_case' ? [gap('ip')] : [gap('refresh', 'post_case')],
      prior_checkpoint: prior
    }));
    const reply = {
      status: 'need_user_answers', phase: result.presentation.phase, run_id: 'RUN-two-phase',
      produced_artifacts: [],
      incomplete_reason: { code: 'SEMANTIC_GAP', summary: '业务语义仍需确认。' },
      user_next_steps: [{ action: 'answer_question_part', description: '回答展示的问题。' }],
      recovery: { mode: 'append_clarification_event', description: '从已提交检查点追加回答。' },
      semantic_presentation: result.presentation,
      non_blocking_diagnostics: []
    };
    assert.deepEqual(validateAgainstSchema(reply, replySchema), [], JSON.stringify(reply));
    const missing = structuredClone(reply);
    delete missing.semantic_presentation;
    assert.notDeepEqual(validateAgainstSchema(missing, replySchema), []);
    const wrongPhase = structuredClone(reply);
    wrongPhase.semantic_presentation.phase = result.presentation.phase === 'requirements_analysis'
      ? 'case_design' : 'requirements_analysis';
    assert.notDeepEqual(validateAgainstSchema(wrongPhase, replySchema), []);
    assert.notDeepEqual(validateAgainstSchema({ ...reply, execution_presentation: {} }, replySchema), []);
  }
});
