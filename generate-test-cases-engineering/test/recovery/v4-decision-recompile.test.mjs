import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import * as clarification from '../../src/clarification.mjs';
import { digest } from '../../src/canonical.mjs';
import { compileV4DecisionEvidenceOverlay, validateV4EvidenceSourceBoundary } from '../../src/evidence.mjs';
import sourcePackSchema from '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { sourceBoundaryFixture } from '../helpers/v4-source-boundary.mjs';

/** @param {string} character */
const sha = (character) => `sha256:${character.repeat(64)}`;
const checkpointBytes = new TextEncoder().encode('{"revision":8}\n');
/** @param {string} value */
const digestText = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

/** @param {{second?:boolean,prior?:any,revision?:number,bytes?:Uint8Array,changedQuestion?:boolean}} [options] */
function checkpoint(options = {}) {
  const facts = [{ fact_id: 'FACT-ip', statement: 'IP 列业务含义不明确', claim_ids: ['CLM-ip'] }];
  const claims = [{ claim_id: 'CLM-ip', value: 'IP 列业务含义不明确' }];
  const diagnosticCandidates = [{
    category: 'semantic_gap', code: 'IP_MEANING_UNRESOLVED', subject_fact_ids: ['FACT-ip'], missing_aspect: 'meaning',
    scope_ref: 'review.ip', question: options.changedQuestion ? 'IP 列最终业务含义是什么？' : 'IP 表示什么？',
    why_needed: '需要确定业务含义。', decision_impact: '决定列值预期。', unresolved_outcome: '该列用例保持待确认。',
    answer_options: ['网络 IP', '定位城市'], risk_level: 'high', source_claim_ids: ['CLM-ip'],
    discovery_phase: 'pre_case', affected_test_point_ids: []
  }];
  if (options.second) {
    facts.push({ fact_id: 'FACT-sort', statement: '排序方向不明确', claim_ids: ['CLM-sort'] });
    claims.push({ claim_id: 'CLM-sort', value: '排序方向不明确' });
    diagnosticCandidates.push({
      category: 'semantic_gap', code: 'SORT_UNRESOLVED', subject_fact_ids: ['FACT-sort'], missing_aspect: 'ordering',
      scope_ref: 'review.sort', question: '默认按什么方向排序？', why_needed: '需要确定默认顺序。',
      decision_impact: '决定首屏顺序。', unresolved_outcome: '排序用例保持待确认。',
      answer_options: ['升序', '降序'], risk_level: 'high', source_claim_ids: ['CLM-sort'],
      discovery_phase: 'pre_case', affected_test_point_ids: []
    });
  }
  return clarification.compileSemanticClarificationCheckpointV4({
    run_id: 'RUN-decision-recompile', committed_revision: options.revision ?? 8,
    committed_checkpoint_bytes: options.bytes ?? checkpointBytes,
    discovery_phase: 'pre_case', source_review_witness: { expected_unit_ids: ['U-1'], reviewed_unit_ids: ['U-1'] },
    fact_ledger_digest: sha('1'), scope_manifest_digest: sha('2'), behavior_views_digest: null, case_drafts_digest: null,
    facts, claims, diagnostic_candidates: diagnosticCandidates, prior_checkpoint: options.prior ?? null
  });
}

/** @param {any} result @param {string} message @param {string} answer @param {any} [target]
 * @param {{resolution?:'temporary'|'final',origin?:'user_statement'|'authorized_confirmation',authority?:'task_scoped'|'product_final'}} [options] */
function event(result, message, answer, target = result.presentation.question_parts[0], options = {}) {
  const normalized = message.normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const chars = Array.from(normalized); const answerChars = Array.from(answer); const start = chars.join('').indexOf(answer);
  assert.ok(start >= 0);
  const scalarStart = Array.from(chars.join('').slice(0, start)).length;
  return clarification.constructSemanticClarificationEventV4(result.presentation, target, 'answer_question_part', {
    answer, resolution: options.resolution ?? 'temporary', authority: options.authority ?? 'task_scoped',
    answer_origin: { type: options.origin ?? 'user_statement', presentation_id: result.presentation.presentation_id, message_digest: digestText(normalized),
      answer_span: { start_scalar: scalarStart, end_scalar: scalarStart + answerChars.length, excerpt_digest: digestText(answer) } }
  });
}

/** @param {any} base @param {any} answerEvent @param {any[]} decisions @param {any[]} history @param {string[]} messages @param {string[]} previous @param {string[]} current */
function apply(base, answerEvent, decisions, history, messages, previous = ['OBL-before'], current = ['OBL-after']) {
  const root = base.checkpoint.semantic_gap_ledger[0];
  return clarification.applySemanticClarificationEventsV4({ checkpoint: base.checkpoint,
    clarification_events: [answerEvent], existing_decisions: decisions, presentation_history: history,
    normalized_user_messages: messages,
    previous_obligations_by_root: [{ root_issue_id: root.root_issue_id, obligation_ids: previous }],
    current_obligations_by_root: [{ root_issue_id: root.root_issue_id, obligation_ids: current }]
  });
}

test('Decision identity binds the stable root version, while replacement/deletion is retained only as obligation audit', () => {
  const base = checkpoint(); const answer = '定位城市'; const message = `用户回答：${answer}`; const answerEvent = event(base, message, answer);
  const replaced = apply(base, answerEvent, [], [base.presentation], [message], ['OBL-v1'], ['OBL-v2', 'OBL-v3']);
  const deleted = apply(base, answerEvent, [], [base.presentation], [message], ['OBL-v1'], []);
  assert.equal(replaced.decisions[0].decision_id, deleted.decisions[0].decision_id);
  assert.deepEqual(replaced.decisions[0].obligation_audit, {
    previous_obligation_ids: ['OBL-v1'], current_obligation_ids: ['OBL-v2', 'OBL-v3'],
    mappings: [{ previous_obligation_id: 'OBL-v1', current_obligation_ids: ['OBL-v2', 'OBL-v3'] }]
  });
  assert.deepEqual(deleted.decisions[0].obligation_audit.mappings, [{ previous_obligation_id: 'OBL-v1', current_obligation_ids: [] }]);
  assert.doesNotMatch(JSON.stringify(replaced), /DECISION_OBLIGATION_UNKNOWN/);
  const decisionSchema = { $defs: sourcePackSchema.$defs, $ref: '#/$defs/v4SemanticDecision' };
  assert.deepEqual(validateAgainstSchema(replaced.decisions[0], decisionSchema), []);
  const forged = { ...replaced.decisions[0], affected_obligation_ids: ['OBL-v1'] };
  assert.notDeepEqual(validateAgainstSchema(forged, decisionSchema), [], 'old obligation identity must not return as a writable field');
});

test('Decision Claim completes the ambiguous Fact through an auditable supersede overlay', () => {
  const base = checkpoint(); const root = base.checkpoint.semantic_gap_ledger[0];
  const message = '用户回答：定位城市'; const accepted = apply(base, event(base, message, '定位城市'), [], [base.presentation], [message]);
  const evidence = {
    schema_version: '4.0.0', source_revision: 0,
    claims: [{ claim_id: 'CLM-ip', claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'review.ip',
      value: 'IP 列业务含义不明确', source_locator_ids: ['LOC-prd'], source_id: 'SRC-prd', domain: 'business',
      field_path: '/ip', document_level_claim: false,
      subject_descriptor: { scope_ref: 'review.ip', module_id: 'review', entity_type: 'row', entity_key: 'ip', field_path: '/ip', condition: {} },
      semantic_value: 'ambiguous' }],
    fact_ledger: [{ fact_id: 'FACT-ip', statement: 'IP 业务含义待确认', status: 'ambiguous',
      acceptance_role: 'primary_acceptance', claim_ids: ['CLM-ip'], module_refs: ['review'], field_path: '/ip' }],
    semantic_gaps: []
  };
  const overlay = /** @type {any} */ (compileV4DecisionEvidenceOverlay(evidence, accepted.decisions, [{
    root_issue_id: root.root_issue_id, root_version_digest: root.root_version_digest,
    source_locator_id: 'LOC-answer', field_path: '/ip'
  }]));
  const decisionClaim = overlay.evidence.claims.find((/** @type {any} */ claim) => claim.claim_form === 'decision-record');
  assert.equal(decisionClaim.value, '定位城市');
  assert.equal(decisionClaim.level, 'E1');
  assert.equal(overlay.evidence.claims.find((/** @type {any} */ claim) => claim.claim_id === 'CLM-ip').superseded_by, decisionClaim.claim_id);
  assert.deepEqual(overlay.evidence.fact_ledger[0], {
    ...evidence.fact_ledger[0], claim_ids: [decisionClaim.claim_id], status: 'active'
  });
});

test('the accepted answer event, Decision and Decision Claim pass the real v4 Source/Evidence boundary', () => {
  const base = checkpoint(); const root = base.checkpoint.semantic_gap_ledger[0];
  for (const authority of [
    { resolution: 'temporary', origin: 'user_statement', authority: 'task_scoped', level: 'E1' },
    { resolution: 'final', origin: 'authorized_confirmation', authority: 'product_final', level: 'E3' }
  ]) {
    const message = `用户回答：定位城市（${authority.level}）`;
    const answerEvent = /** @type {any} */ (event(base, message, '定位城市', undefined, /** @type {any} */ (authority)));
    const accepted = apply(base, answerEvent, [], [base.presentation], [message]);
    const fixture = sourceBoundaryFixture();
    const originalClaim = fixture.evidence.claims[0]; const originalFact = fixture.evidence.fact_ledger[0];
    originalClaim.claim_id = 'CLM-ip';
    originalFact.fact_id = 'FACT-ip'; originalFact.claim_ids = ['CLM-ip']; originalFact.status = 'ambiguous';
    const source = fixture.pack.sources[0];
    const answerUnit = {
      unit_id: `UNIT-answer-${authority.level}`, text: message.normalize('NFC'), type: 'user_statement',
      presentation_id: answerEvent.presentation_id, message_digest: answerEvent.answer_origin.message_digest,
      answer_span: { start: answerEvent.answer_origin.answer_span.start_scalar, end: answerEvent.answer_origin.answer_span.end_scalar }
    };
    source.semantic_projection.structure.push(answerUnit);
    source.semantic_digest = `sha256:${digest(source.semantic_projection)}`;
    fixture.pack.locators.forEach((/** @type {any} */ item) => { item.semantic_digest = source.semantic_digest; });
    fixture.pack.source_reviews[0].semantic_digest = source.semantic_digest;
    fixture.pack.source_reviews[0].units.push({
      unit_id: answerUnit.unit_id, content_digest: digestText(answerUnit.text), classification: 'non_normative'
    });
    originalClaim.document_level_claim = false;
    const locator = {
      locator_id: 'LOC-answer', source_id: source.source_id,
      semantic_digest: source.semantic_digest,
      unit_id: answerUnit.unit_id,
      excerpt: '定位城市', excerpt_digest: answerEvent.answer_origin.answer_span.excerpt_digest,
      domain: 'business', field_path: '/state', type: 'user_statement',
      presentation_id: answerEvent.presentation_id, message_digest: answerEvent.answer_origin.message_digest,
      answer_span: { start: answerEvent.answer_origin.answer_span.start_scalar, end: answerEvent.answer_origin.answer_span.end_scalar }
    };
    fixture.pack.locators.push(locator);
    fixture.pack.clarification_events = [answerEvent]; fixture.pack.decision_records = accepted.decisions;
    const overlay = /** @type {any} */ (compileV4DecisionEvidenceOverlay(fixture.evidence, accepted.decisions, [{
      root_issue_id: root.root_issue_id, root_version_digest: root.root_version_digest,
      source_locator_id: locator.locator_id, field_path: '/state'
    }]));
    assert.deepEqual(validateAgainstSchema(fixture.pack, sourcePackSchema), [], authority.level);
    const validated = validateV4EvidenceSourceBoundary(fixture.pack, overlay.evidence, fixture.subjects);
    assert.deepEqual(validated.diagnostics, [], authority.level);
    assert.equal(overlay.evidence.claims.find((/** @type {any} */ claim) => claim.claim_form === 'decision-record').level, authority.level);
    assert.ok(validated.claimsById.has(overlay.audit[0].decision_claim_id));

    const forgedPack = structuredClone(fixture.pack);
    const forgedSource = forgedPack.sources[0];
    const forgedUnit = forgedSource.semantic_projection.structure.find((/** @type {any} */ item) => item.unit_id === answerUnit.unit_id);
    forgedUnit.text = message.replace('定位城市', '网络地址');
    forgedSource.semantic_digest = `sha256:${digest(forgedSource.semantic_projection)}`;
    forgedPack.locators.forEach((/** @type {any} */ item) => { item.semantic_digest = forgedSource.semantic_digest; });
    forgedPack.source_reviews[0].semantic_digest = forgedSource.semantic_digest;
    forgedPack.source_reviews[0].units.find((/** @type {any} */ item) => item.unit_id === forgedUnit.unit_id).content_digest = digestText(forgedUnit.text);
    assert.notDeepEqual(
      validateV4EvidenceSourceBoundary(forgedPack, overlay.evidence, fixture.subjects).diagnostics,
      [],
      'persisted Decision provenance must be revalidated against the exact user-statement unit'
    );
  }
});

test('a uniquely mapped late answer is accepted once; replay is stable and stale cases never request a revision', () => {
  const initial = checkpoint({ second: true }); const oldPresentation = initial.presentation;
  const oldPart = oldPresentation.question_parts.find((/** @type {any} */ part) => part.root_issue_id === initial.checkpoint.semantic_gap_ledger.find((/** @type {any} */ root) => root.missing_aspect === 'meaning').root_issue_id);
  const otherPart = oldPresentation.question_parts.find((/** @type {any} */ part) => part.question_part_id !== oldPart.question_part_id);
  const otherMessage = `先回答排序：${otherPart.answer_options[0]}`;
  const intermediate = apply(initial, event(initial, otherMessage, otherPart.answer_options[0], otherPart), [], [oldPresentation], [otherMessage]);
  const base = { checkpoint: intermediate.checkpoint, presentation: intermediate.presentation };
  const syntheticCurrent = intermediate.presentation;
  const message = '迟到答复：定位城市'; const lateEvent = event(initial, message, '定位城市', oldPart);
  const late = apply(base, lateEvent, intermediate.decisions, [oldPresentation, syntheticCurrent], [otherMessage, message]);
  const lateDecision = late.decisions.find((/** @type {any} */ decision) => decision.target.root_issue_id === oldPart.root_issue_id);
  assert.equal(lateDecision.accepted_from_superseded_presentation, true);
  const replayBase = { checkpoint: late.checkpoint, presentation: late.presentation };
  const replay = /** @type {any} */ (apply(replayBase, lateEvent, late.decisions,
    [oldPresentation, syntheticCurrent, late.presentation], [message]));
  assert.equal(replay.status, 'replayed_decision');
  assert.equal(replay.commit_required, false);
  assert.equal(replay.replayed_decision_id, lateDecision.decision_id);
  assert.deepEqual(replay.decisions, late.decisions);

  const currentTarget = syntheticCurrent.question_parts[0];
  const closedTransition = clarification.applyRequestDeliveryV4(intermediate.checkpoint,
    clarification.constructSemanticClarificationEventV4(syntheticCurrent, currentTarget, 'request_delivery'));
  const changed = checkpoint({ second: true, prior: intermediate.checkpoint, revision: 9,
    bytes: new TextEncoder().encode('{"revision":9}\n'), changedQuestion: true });
  const staleFixtures = [
    { checkpoint: changed.checkpoint, presentation: changed.presentation, history: [oldPresentation, changed.presentation] },
    { checkpoint: closedTransition.checkpoint, presentation: closedTransition.presentation, history: [oldPresentation, syntheticCurrent] },
    { checkpoint: intermediate.checkpoint, presentation: syntheticCurrent, history: [oldPresentation, structuredClone(oldPresentation), syntheticCurrent] }
  ];
  for (const staleBase of staleFixtures) {
    const stale = apply(staleBase, lateEvent, intermediate.decisions, staleBase.history, [message, otherMessage]);
    assert.equal(stale.status, 'stale_answer');
    assert.equal(stale.commit_required, false);
    assert.deepEqual(stale.diagnostics.map((/** @type {any} */ item) => item.code), ['STALE_ANSWER']);
    assert.deepEqual(stale.non_blocking_diagnostics, [{
      code: 'STALE_ANSWER', severity: 'warning',
      message: '该答复针对的问题版本已失效；请以当前展示的问题为准。',
      source_event_id: lateEvent.event_id,
      affected_question_part_ids: [oldPart.question_part_id]
    }]);
    assert.equal(stale.committed_revision, staleBase.checkpoint.revision);
    assert.equal(stale.presentation?.presentation_id ?? null, staleBase.presentation?.presentation_id ?? null);
  }
});
