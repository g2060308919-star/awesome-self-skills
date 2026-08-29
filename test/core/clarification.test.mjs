import assert from 'node:assert/strict';
import * as childProcess from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as nodeUrl from 'node:url';
import { canonicalStringify, digest, stableId } from '../../src/canonical.mjs';
import { evaluateClarification } from '../../src/clarification.mjs';

const repositoryRoot = path.resolve(path.dirname(nodeUrl.fileURLToPath(import.meta.url)), '../..');
const pathToFileURL = /** @type {any} */ (nodeUrl).pathToFileURL;
const fixture = JSON.parse(await readFile(
  path.join(repositoryRoot, 'test/fixtures/clarification/base-context.json'), 'utf8'
));
const ROOT_ORACLE = 'root_f5525106a963b78d';
const ROOT_CAPABILITY = 'root_b092ebaad4c62e78';
const ROOT_CHANGED_SCOPE = 'root_e4a7333e4d2c59ba';
const ROOT_NEW = 'root_3d23c801bcf8a1c4';

function baseContext() {
  return structuredClone(fixture);
}

/** @param {string[]} values */
function sortedIds(values) {
  return [...values].sort((left, right) => {
    const leftPoints = Array.from(left);
    const rightPoints = Array.from(right);
    const length = Math.min(leftPoints.length, rightPoints.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (leftPoints[index].codePointAt(0) ?? 0) - (rightPoints[index].codePointAt(0) ?? 0);
      if (difference !== 0) return difference;
    }
    return leftPoints.length - rightPoints.length;
  });
}

/** @param {string[]} rootIds */
function questionId(rootIds) {
  return stableId('question', { root_issue_ids: sortedIds(rootIds) });
}

/** @param {string[]} rootIds */
function pendingDigest(rootIds) {
  return rootIds.length === 0 ? '' : digest(sortedIds(rootIds));
}

/** @param {Record<string, unknown>} [overrides] */
function blocker(overrides = {}) {
  return {
    obligation_id: 'obligation_refund_failure',
    missing_type: 'oracle',
    semantic_refs: ['claim_refund', 'view_refund#failure'],
    scope: 'refund',
    risk: 'high',
    reason: 'MISSING_ORACLE',
    evidence_refs: ['claim_refund'],
    answerable: true,
    question: 'What state and side effects must follow a failed refund?',
    ...overrides
  };
}

/** @param {string} obligationId @param {'grounded'|'conditional'|'blocked'|'not_applicable'} classification @param {'E0'|'E1'|'E2'|'E3'} evidenceLevel @param {string|null} reason */
function formalPoint(obligationId, classification = 'blocked', evidenceLevel = 'E0', reason = 'MISSING_ORACLE') {
  return { obligation_id: obligationId, evidence_level: evidenceLevel, classification, blocked_reason: reason };
}

/** @param {ReturnType<typeof formalPoint>[]} points @param {string[]} [exploratory] */
function semanticSnapshot(points, exploratory = []) {
  const ids = (/** @type {string} */ lane) => points.filter((point) => point.classification === lane)
    .map((point) => point.obligation_id).sort();
  const executable = ids('grounded').length + ids('conditional').length;
  const blocked = ids('blocked');
  return {
    formal_test_points: [...points].sort((left, right) => left.obligation_id.localeCompare(right.obligation_id)),
    coverage_denominator: points.length,
    delivery_sections: {
      grounded: ids('grounded'),
      conditional: ids('conditional'),
      blocked,
      exploratory: [...exploratory].sort(),
      coverage: { formal_denominator: points.length },
      quality: { delivery_status: executable === 0 && blocked.length > 0 ? 'no_deterministic_cases' : 'executable_subset_ready' }
    }
  };
}

/** @param {any} context @param {any[]} descriptors @param {ReturnType<typeof formalPoint>[]} [points] */
function setCurrent(context, descriptors, points = descriptors.map((item) =>
  formalPoint(String(item.obligation_id), 'blocked', 'E0', String(item.reason)))) {
  context.blocked_obligations = descriptors;
  context.semantic_snapshot = semanticSnapshot(points);
  return context;
}

/** @param {any[]} descriptors */
function rootLedger(descriptors) {
  const groups = new Map();
  for (const item of descriptors) {
    const signature = {
      missing_type: item.missing_type,
      semantic_refs: sortedIds(item.semantic_refs),
      scope: item.scope
    };
    const rootId = stableId('root', signature);
    let root = groups.get(rootId);
    if (!root) {
      root = {
        root_issue_id: rootId,
        root_issue_key: canonicalStringify(signature),
        missing_type: item.missing_type,
        semantic_refs: sortedIds(item.semantic_refs),
        scope: item.scope,
        affected_obligation_ids: [],
        risk_counts: { critical: 0, high: 0, medium: 0, low: 0 },
        question: item.question,
        answerable: item.answerable,
        reasons: [],
        evidence_refs: [],
        current: true
      };
      groups.set(rootId, root);
    }
    root.affected_obligation_ids.push(item.obligation_id);
    root.risk_counts[item.risk] += 1;
    root.reasons.push(item.reason);
    root.evidence_refs.push(...item.evidence_refs);
  }
  for (const root of groups.values()) {
    root.affected_obligation_ids = sortedIds([...new Set(root.affected_obligation_ids)]);
    root.reasons = sortedIds([...new Set(root.reasons)]);
    root.evidence_refs = sortedIds([...new Set(root.evidence_refs)]);
  }
  return [...groups.values()].sort((left, right) => left.root_issue_id.localeCompare(right.root_issue_id));
}

/** @param {any} semantic @param {Array<{root_issue_id:string,status:string}>} [dispositions] @param {string[]} [pending] @param {any[]} [descriptors] */
function priorState(semantic, dispositions = [{ root_issue_id: ROOT_ORACLE, status: 'asked' }], pending = [ROOT_ORACLE], descriptors = [blocker()]) {
  const asked = dispositions.filter((item) => item.status !== 'open').map((item) => item.root_issue_id);
  return {
    source_revision: 0,
    clarification_event_seq: 0,
    asked_root_issue_ids: sortedIds(asked),
    root_issue_dispositions: dispositions,
    last_pending_root_issue_ids: [...pending],
    last_question_set_digest: pendingDigest(pending),
    clarification_stop: null,
    semantic_snapshot: structuredClone(semantic),
    root_snapshot_ledger: rootLedger(descriptors)
  };
}

/** @param {number} seq @param {'final'|'temporary'|'unknown'|'deferred'} disposition @param {string[]} rootIds @param {string[]} affectedIds */
function decision(seq, disposition, rootIds, affectedIds) {
  return {
    decision_id: `decision_${seq}_${disposition}`,
    question_id: questionId(rootIds),
    root_issue_ids: [...rootIds],
    affected_obligation_ids: [...affectedIds],
    clarification_event_seq: seq,
    confirmer: 'refund-owner',
    confirmed_at: `2026-08-${String(seq).padStart(2, '0')}`,
    question: 'What should happen?',
    answer: disposition === 'unknown' ? 'I do not know.' : disposition === 'deferred' ? 'Defer this.' : 'Apply the stated refund rule.',
    disposition,
    authority_scope: 'refund',
    effective_scope: 'refund',
    evidence_ref: `locator_decision_${seq}`,
    evidence_level: disposition === 'final' ? 'E3' : 'E1'
  };
}

/** @param {number} seq @param {'request_delivery'|'reopen_root_issues'} type @param {string[]} rootIds */
function control(seq, type, rootIds) {
  return {
    event_id: `event_${seq}_${type}`,
    clarification_event_seq: seq,
    type,
    actor: 'refund-owner',
    event_at: `2026-08-${String(seq).padStart(2, '0')}`,
    root_issue_ids: [...rootIds]
  };
}

function capabilityBlocker(overrides = {}) {
  return blocker({
    obligation_id: 'obligation_refund_observation',
    missing_type: 'testability',
    semantic_refs: ['capability_refund_db'],
    risk: 'low',
    reason: 'CAPABILITY_UNKNOWN',
    evidence_refs: ['claim_capability'],
    question: 'Can the tester observe the refund database state?',
    ...overrides
  });
}

test('clarification groups one semantic root across twelve formal Test Points and derives stable identity', () => {
  const context = baseContext();
  const descriptors = Array.from({ length: 12 }, (_, index) => blocker({
    obligation_id: `obligation_refund_${String(index + 1).padStart(2, '0')}`
  }));
  setCurrent(context, descriptors);
  const before = structuredClone(context);
  const result = evaluateClarification(context, 'pause_for_clarification');

  assert.equal(result.action, 'need_user_answers');
  assert.equal(result.pending_root_issues.length, 1);
  assert.equal(result.pending_root_issues[0].root_issue_id, ROOT_ORACLE);
  assert.equal(result.pending_root_issues[0].affected_obligation_ids.length, 12);
  assert.deepEqual(result.pending_root_issues[0].risk_counts, { critical: 0, high: 12, medium: 0, low: 0 });
  assert.deepEqual(context, before);

  const later = structuredClone(context);
  later.source_revision = 9;
  later.prior_state.source_revision = 9;
  later.blocked_obligations.forEach((/** @type {any} */ item, /** @type {number} */ index) => { item.obligation_id = `obligation_later_${index}`; });
  setCurrent(later, later.blocked_obligations);
  assert.equal(evaluateClarification(later, 'pause_for_clarification').pending_root_issues[0].root_issue_id, ROOT_ORACLE);
});

test('clarification state freezes the current root semantics and formal obligation associations', () => {
  const result = evaluateClarification(baseContext(), 'pause_for_clarification');
  assert.deepEqual(result.state.root_snapshot_ledger, [{
    root_issue_id: ROOT_ORACLE,
    root_issue_key: '{"missing_type":"oracle","scope":"refund","semantic_refs":["claim_refund","view_refund#failure"]}',
    missing_type: 'oracle',
    semantic_refs: ['claim_refund', 'view_refund#failure'],
    scope: 'refund',
    affected_obligation_ids: ['obligation_refund_failure'],
    risk_counts: { critical: 0, high: 1, medium: 0, low: 0 },
    question: 'What state and side effects must follow a failed refund?',
    answerable: true,
    reasons: ['MISSING_ORACLE'],
    evidence_refs: ['claim_refund'],
    current: true
  }]);
});

test('clarification returns every fresh root in one batch and risk changes ordering only', () => {
  const first = baseContext();
  setCurrent(first, [blocker({ risk: 'low' }), capabilityBlocker({ risk: 'critical' })]);
  const highFirst = evaluateClarification(first, 'pause_for_clarification');
  assert.deepEqual(highFirst.pending_root_issues.map((/** @type {any} */ root) => root.root_issue_id), [ROOT_CAPABILITY, ROOT_ORACLE]);

  const second = structuredClone(first);
  second.blocked_obligations[0].risk = 'critical';
  second.blocked_obligations[1].risk = 'low';
  const oracleFirst = evaluateClarification(second, 'pause_for_clarification');
  assert.deepEqual(oracleFirst.pending_root_issues.map((/** @type {any} */ root) => root.root_issue_id), [ROOT_ORACLE, ROOT_CAPABILITY]);
  assert.deepEqual(new Set(oracleFirst.pending_root_issues.map((/** @type {any} */ root) => root.root_issue_id)), new Set([ROOT_ORACLE, ROOT_CAPABILITY]));
});

test('clarification applies final, temporary, unknown, and deferred lifecycle dispositions', () => {
  const cases = [
    ['final', 'resolved_final', formalPoint('obligation_refund_failure', 'grounded', 'E3', null), 'converged'],
    ['temporary', 'resolved_temporary', formalPoint('obligation_refund_failure', 'conditional', 'E1', null), 'converged'],
    ['unknown', 'suppressed_unknown', formalPoint('obligation_refund_failure'), 'no_information_gain'],
    ['deferred', 'suppressed_deferred', formalPoint('obligation_refund_failure'), 'no_information_gain']
  ];
  for (const [disposition, expectedStatus, point, stop] of cases) {
    const context = baseContext();
    context.source_revision = 1;
    context.prior_state = priorState(context.semantic_snapshot);
    context.append_batch.decision_records = [decision(1, /** @type {any} */ (disposition), [ROOT_ORACLE], ['obligation_refund_failure'])];
    setCurrent(context, disposition === 'final' || disposition === 'temporary' ? [] : [blocker()], [/** @type {any} */ (point)]);
    const result = evaluateClarification(context, 'pause_for_clarification');
    assert.equal(result.action, 'deliver', disposition);
    assert.equal(result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE).status, expectedStatus, disposition);
    assert.equal(result.state.clarification_stop.reason, stop, disposition);
  }
});

test('clarification never automatically reopens suppressed roots and never asks technical blockers', () => {
  const suppressed = baseContext();
  suppressed.source_revision = 1;
  suppressed.prior_state = priorState(suppressed.semantic_snapshot, [{ root_issue_id: ROOT_ORACLE, status: 'suppressed_unknown' }], []);
  suppressed.prior_state.source_revision = 1;
  suppressed.prior_state.clarification_event_seq = 1;
  suppressed.prior_state.clarification_stop = { reason: 'no_information_gain', source_revision: 1 };
  const suppressedResult = evaluateClarification(suppressed, 'pause_for_clarification');
  assert.equal(suppressedResult.action, 'deliver');
  assert.deepEqual(suppressedResult.pending_root_issues, []);

  const technical = baseContext();
  technical.blocked_obligations[0].answerable = false;
  const technicalResult = evaluateClarification(technical, 'pause_for_clarification');
  assert.equal(technicalResult.action, 'deliver');
  assert.equal(technicalResult.root_issues.length, 1);
  assert.deepEqual(technicalResult.pending_root_issues, []);
  assert.equal(technicalResult.semantic_snapshot.delivery_sections.blocked.length, 1);
});

test('clarification material root or scope changes create a new identity', () => {
  const changedScope = baseContext();
  changedScope.blocked_obligations[0].scope = 'refund.v2';
  const changedReference = baseContext();
  changedReference.blocked_obligations[0].semantic_refs = ['claim_new'];
  assert.equal(evaluateClarification(changedScope, 'pause_for_clarification').pending_root_issues[0].root_issue_id, ROOT_CHANGED_SCOPE);
  assert.equal(evaluateClarification(changedReference, 'pause_for_clarification').pending_root_issues[0].root_issue_id, ROOT_NEW);
  assert.notEqual(ROOT_CHANGED_SCOPE, ROOT_ORACLE);
  assert.notEqual(ROOT_NEW, ROOT_ORACLE);
});

test('clarification explicit reopen returns the union of reopened and newly revealed roots', () => {
  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = priorState(context.semantic_snapshot, [{ root_issue_id: ROOT_ORACLE, status: 'suppressed_unknown' }], []);
  context.prior_state.clarification_event_seq = 1;
  context.prior_state.clarification_stop = { reason: 'no_information_gain', source_revision: 0 };
  const newBlocker = blocker({ obligation_id: 'obligation_new', semantic_refs: ['claim_new'] });
  setCurrent(context, [blocker(), newBlocker]);
  context.append_batch.clarification_events = [control(2, 'reopen_root_issues', [ROOT_ORACLE])];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_user_answers');
  assert.deepEqual(new Set(result.pending_root_issues.map((/** @type {any} */ root) => root.root_issue_id)), new Set([ROOT_ORACLE, ROOT_NEW]));
  assert.equal(result.state.clarification_stop, null);
});

test('clarification keeps an absent explicitly reopened historical root replayable', () => {
  const initial = baseContext();
  setCurrent(initial, [blocker(), capabilityBlocker()], [
    formalPoint('obligation_refund_failure'),
    formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
  ]);
  const first = evaluateClarification(initial, 'pause_for_clarification');
  const deliveredContext = baseContext();
  deliveredContext.source_revision = 1;
  deliveredContext.prior_state = first.state;
  setCurrent(deliveredContext, [blocker(), capabilityBlocker()], [
    formalPoint('obligation_refund_failure'),
    formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
  ]);
  deliveredContext.append_batch.clarification_events = [control(
    1, 'request_delivery', [ROOT_ORACLE, ROOT_CAPABILITY]
  )];
  const delivered = evaluateClarification(deliveredContext, 'pause_for_clarification');

  const reopenedContext = baseContext();
  reopenedContext.source_revision = 2;
  reopenedContext.prior_state = delivered.state;
  setCurrent(reopenedContext, [], [
    formalPoint('obligation_refund_failure'),
    formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
  ]);
  reopenedContext.append_batch.clarification_events = [control(2, 'reopen_root_issues', [ROOT_ORACLE])];
  const reopened = evaluateClarification(reopenedContext, 'pause_for_clarification');
  assert.deepEqual(reopened.diagnostics, []);
  assert.equal(reopened.action, 'deliver');
  assert.deepEqual(reopened.state.asked_root_issue_ids, sortedIds([ROOT_ORACLE, ROOT_CAPABILITY]));
  assert.deepEqual(reopened.state.last_pending_root_issue_ids, []);
  assert.equal(reopened.state.root_issue_dispositions.find(
    (/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE
  ).status, 'open');
  assert.equal(reopened.state.root_snapshot_ledger.find(
    (/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE
  ).current, false);

  const replay = structuredClone(reopenedContext);
  replay.prior_state = reopened.state;
  replay.append_batch = { decision_records: [], clarification_events: [] };
  const replayed = evaluateClarification(replay, 'pause_for_clarification');
  assert.deepEqual(replayed.diagnostics, []);
  assert.equal(replayed.action, 'deliver');
  assert.equal(replayed.state.root_issue_dispositions.find(
    (/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE
  ).status, 'open');

  const reappeared = baseContext();
  reappeared.source_revision = 3;
  reappeared.prior_state = reopened.state;
  setCurrent(reappeared, [blocker()], [
    formalPoint('obligation_refund_failure'),
    formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
  ]);
  reappeared.append_batch.clarification_events = [control(
    3, 'reopen_root_issues', [ROOT_CAPABILITY]
  )];
  const askedAgain = evaluateClarification(reappeared, 'pause_for_clarification');
  assert.deepEqual(askedAgain.diagnostics, []);
  assert.equal(askedAgain.action, 'need_user_answers');
  assert.deepEqual(askedAgain.state.last_pending_root_issue_ids, [ROOT_ORACLE]);
  assert.equal(askedAgain.state.root_snapshot_ledger.find(
    (/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE
  ).current, true);
});

test('clarification request_delivery requires the exact prior pending set and defers every then-pending root', () => {
  for (const ids of [[], [ROOT_ORACLE, 'root_unknown']]) {
    const invalid = baseContext();
    invalid.source_revision = 1;
    invalid.prior_state = priorState(invalid.semantic_snapshot);
    invalid.append_batch.clarification_events = [control(1, 'request_delivery', ids)];
    const result = evaluateClarification(invalid, 'pause_for_clarification');
    assert.equal(result.action, 'need_revision');
    assert.equal(result.diagnostics.some((/** @type {any} */ item) => item.code === 'REQUEST_DELIVERY_PENDING_SET_MISMATCH'), true);
  }

  const valid = baseContext();
  valid.source_revision = 1;
  valid.prior_state = priorState(valid.semantic_snapshot);
  const newlyRevealed = blocker({ obligation_id: 'obligation_new', semantic_refs: ['claim_new'] });
  setCurrent(valid, [blocker(), newlyRevealed]);
  valid.append_batch.clarification_events = [control(1, 'request_delivery', [ROOT_ORACLE])];
  const result = evaluateClarification(valid, 'pause_for_clarification');
  assert.equal(result.action, 'deliver');
  assert.equal(result.state.clarification_stop.reason, 'user_requested_delivery');
  for (const rootId of [ROOT_ORACLE, ROOT_NEW]) assert.equal(
    result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === rootId).status,
    'suppressed_deferred'
  );
});

test('clarification delivery requires every gated formal Test Point to remain in the current ledger', () => {
  const first = evaluateClarification(baseContext(), 'pause_for_clarification');

  const exact = baseContext();
  exact.source_revision = 1;
  exact.prior_state = first.state;
  exact.append_batch.clarification_events = [control(1, 'request_delivery', [ROOT_ORACLE])];
  const exactResult = evaluateClarification(exact, 'pause_for_clarification');
  assert.deepEqual(exactResult.diagnostics, []);
  assert.equal(exactResult.action, 'deliver');

  const omitted = baseContext();
  omitted.source_revision = 1;
  omitted.prior_state = first.state;
  setCurrent(omitted, [], []);
  omitted.append_batch.clarification_events = [control(1, 'request_delivery', [ROOT_ORACLE])];
  const omittedResult = evaluateClarification(omitted, 'pause_for_clarification');
  assert.equal(omittedResult.action, 'need_revision');
  assert.equal(omittedResult.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'GATED_FORMAL_TEST_POINT_MISSING'
  ), true);
});

test('clarification answer plus delivery defers both the answered root and roots revealed by recompilation', () => {
  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = priorState(context.semantic_snapshot);
  const newlyRevealed = blocker({ obligation_id: 'obligation_new', semantic_refs: ['claim_new'] });
  setCurrent(context, [newlyRevealed], [
    formalPoint('obligation_refund_failure', 'grounded', 'E3', null),
    formalPoint('obligation_new')
  ]);
  context.append_batch.decision_records = [decision(1, 'final', [ROOT_ORACLE], ['obligation_refund_failure'])];
  context.append_batch.clarification_events = [control(2, 'request_delivery', [ROOT_ORACLE])];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'deliver');
  assert.equal(result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE).status, 'suppressed_deferred');
  assert.equal(result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === ROOT_NEW).status, 'suppressed_deferred');
  assert.deepEqual(result.state.asked_root_issue_ids, [ROOT_ORACLE]);
  assert.deepEqual(result.semantic_snapshot.formal_test_points, [
    formalPoint('obligation_new'),
    formalPoint('obligation_refund_failure')
  ]);
  assert.deepEqual(result.semantic_snapshot.delivery_sections.grounded, []);
  assert.deepEqual(result.semantic_snapshot.delivery_sections.conditional, []);
  assert.deepEqual(result.semantic_snapshot.delivery_sections.blocked, [
    'obligation_new', 'obligation_refund_failure'
  ]);
});

test('clarification replays a user-delivery projection from the unchanged compiler snapshot', () => {
  const first = evaluateClarification(baseContext(), 'pause_for_clarification');
  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = first.state;
  setCurrent(context, [], [formalPoint('obligation_refund_failure', 'grounded', 'E3', null)]);
  context.append_batch.decision_records = [decision(
    1, 'final', [ROOT_ORACLE], ['obligation_refund_failure']
  )];
  context.append_batch.clarification_events = [control(2, 'request_delivery', [ROOT_ORACLE])];
  const delivered = evaluateClarification(context, 'pause_for_clarification');
  assert.deepEqual(delivered.diagnostics, []);
  assert.deepEqual(delivered.semantic_snapshot.formal_test_points, [formalPoint('obligation_refund_failure')]);

  const replay = structuredClone(context);
  replay.prior_state = delivered.state;
  replay.append_batch = { decision_records: [], clarification_events: [] };
  const replayed = evaluateClarification(replay, 'pause_for_clarification');
  assert.deepEqual(replayed.diagnostics, []);
  assert.equal(replayed.action, 'deliver');
  assert.deepEqual(replayed.semantic_snapshot, delivered.semantic_snapshot);
  assert.deepEqual(replayed.state, delivered.state);
});

test('clarification request_delivery overrides an ineffective same-batch answer that remains Blocked', () => {
  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = priorState(context.semantic_snapshot);
  context.append_batch.decision_records = [decision(1, 'temporary', [ROOT_ORACLE], ['obligation_refund_failure'])];
  context.append_batch.clarification_events = [control(2, 'request_delivery', [ROOT_ORACLE])];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.action, 'deliver');
  assert.equal(result.state.clarification_stop.reason, 'user_requested_delivery');
  assert.equal(result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE).status, 'suppressed_deferred');
});

test('clarification no-information-gain suppresses invalid answers and unanswered pending roots', () => {
  const context = baseContext();
  const second = capabilityBlocker();
  setCurrent(context, [blocker(), second]);
  const priorSemantic = structuredClone(context.semantic_snapshot);
  context.source_revision = 1;
  context.prior_state = priorState(priorSemantic, [
    { root_issue_id: ROOT_ORACLE, status: 'asked' },
    { root_issue_id: ROOT_CAPABILITY, status: 'asked' }
  ], [ROOT_ORACLE, ROOT_CAPABILITY], [blocker(), second]);
  context.append_batch.decision_records = [decision(1, 'final', [ROOT_ORACLE], ['obligation_refund_failure'])];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'deliver');
  assert.equal(result.state.clarification_stop.reason, 'no_information_gain');
  for (const rootId of [ROOT_ORACLE, ROOT_CAPABILITY]) assert.equal(
    result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === rootId).status,
    'suppressed_deferred'
  );
  assert.deepEqual(result.state.asked_root_issue_ids, [ROOT_CAPABILITY, ROOT_ORACLE]);
});

test('clarification does not forge asked history for a newly revealed root suppressed without display', () => {
  const context = baseContext();
  const newlyRevealed = blocker({ obligation_id: 'obligation_new', semantic_refs: ['claim_new'] });
  context.source_revision = 1;
  context.prior_state = priorState(context.semantic_snapshot);
  setCurrent(context, [blocker(), newlyRevealed]);
  context.append_batch.decision_records = [decision(
    1, 'final', [ROOT_ORACLE], ['obligation_refund_failure']
  )];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'deliver');
  assert.equal(result.state.clarification_stop.reason, 'no_information_gain');
  assert.deepEqual(result.state.asked_root_issue_ids, [ROOT_ORACLE]);
  assert.equal(result.state.root_issue_dispositions.find(
    (/** @type {any} */ item) => item.root_issue_id === ROOT_NEW
  ).status, 'suppressed_deferred');
});

test('clarification fails closed when a same-ID current root cannot own every gated prior Test Point', () => {
  const initial = baseContext();
  setCurrent(initial, [
    blocker(),
    blocker({ obligation_id: 'obligation_refund_second' })
  ]);
  const first = evaluateClarification(initial, 'pause_for_clarification');
  assert.equal(first.action, 'need_user_answers');

  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = first.state;
  setCurrent(context, [blocker()], [
    formalPoint('obligation_refund_failure'),
    formalPoint('obligation_refund_second', 'grounded', 'E3', null)
  ]);
  context.append_batch.decision_records = [decision(
    1, 'final', [ROOT_ORACLE], ['obligation_refund_second']
  )];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_revision');
  assert.equal(result.state, null);
  assert.equal(result.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'PRIOR_ROOT_PARTITION_INVALID'
  ), true);
});

test('clarification computes information gain per decided root from its formal semantic changes', () => {
  const third = blocker({
    obligation_id: 'obligation_refund_audit',
    semantic_refs: ['claim_refund_audit'],
    reason: 'MISSING_AUDIT_ORACLE'
  });
  const rootThird = stableId('root', {
    missing_type: third.missing_type,
    semantic_refs: third.semantic_refs,
    scope: third.scope
  });
  const context = baseContext();
  const priorDescriptors = [blocker(), capabilityBlocker(), third];
  const priorSemantic = semanticSnapshot(priorDescriptors.map((item) => formalPoint(item.obligation_id, 'blocked', 'E0', item.reason)));
  context.source_revision = 1;
  context.prior_state = priorState(priorSemantic, [
    { root_issue_id: ROOT_ORACLE, status: 'asked' },
    { root_issue_id: ROOT_CAPABILITY, status: 'asked' },
    { root_issue_id: rootThird, status: 'asked' }
  ], [ROOT_ORACLE, ROOT_CAPABILITY, rootThird], priorDescriptors);
  setCurrent(context, [capabilityBlocker(), third], [
    formalPoint('obligation_refund_failure', 'grounded', 'E3', null),
    formalPoint('obligation_refund_observation', 'blocked', 'E0', capabilityBlocker().reason),
    formalPoint('obligation_refund_audit', 'blocked', 'E0', 'MISSING_AUDIT_ORACLE')
  ]);
  context.append_batch.decision_records = [
    decision(1, 'final', [ROOT_ORACLE], ['obligation_refund_failure']),
    decision(2, 'temporary', [ROOT_CAPABILITY], ['obligation_refund_observation'])
  ];

  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.action, 'deliver');
  const statuses = new Map(result.state.root_issue_dispositions.map((/** @type {any} */ item) => [item.root_issue_id, item.status]));
  assert.equal(statuses.get(ROOT_ORACLE), 'resolved_final');
  assert.equal(statuses.get(ROOT_CAPABILITY), 'suppressed_deferred');
  assert.equal(statuses.get(rootThird), 'suppressed_deferred');
  assert.equal(result.state.clarification_stop.reason, 'converged');
});

test('clarification cannot authorize one decided root with another root own obligation change', () => {
  const context = baseContext();
  const priorDescriptors = [blocker(), capabilityBlocker()];
  const priorSemantic = semanticSnapshot([
    formalPoint('obligation_refund_failure'),
    formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
  ]);
  context.source_revision = 1;
  context.prior_state = priorState(priorSemantic, [
    { root_issue_id: ROOT_ORACLE, status: 'asked' },
    { root_issue_id: ROOT_CAPABILITY, status: 'asked' }
  ], [ROOT_ORACLE, ROOT_CAPABILITY], priorDescriptors);
  setCurrent(context, [], [
    formalPoint('obligation_refund_failure', 'grounded', 'E3', null),
    formalPoint('obligation_refund_observation', 'grounded', 'E3', null)
  ]);
  context.append_batch.decision_records = [decision(
    1, 'final', [ROOT_ORACLE, ROOT_CAPABILITY], ['obligation_refund_failure']
  )];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.deepEqual(result.diagnostics, []);
  const statuses = new Map(result.state.root_issue_dispositions.map((/** @type {any} */ item) => [item.root_issue_id, item.status]));
  assert.equal(statuses.get(ROOT_ORACLE), 'resolved_final');
  assert.equal(statuses.get(ROOT_CAPABILITY), 'suppressed_deferred');
  assert.equal(result.state.clarification_stop.reason, 'converged');
  assert.deepEqual(result.semantic_snapshot.formal_test_points, [
    formalPoint('obligation_refund_failure', 'grounded', 'E3', null),
    formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
  ]);
  assert.equal(priorDescriptors.length, 2);
});

test('clarification gates unknown, deferred, and unanswered roots beside an effective root', () => {
  for (const mode of ['unknown', 'deferred', 'unanswered']) {
    const initial = baseContext();
    setCurrent(initial, [blocker(), capabilityBlocker()], [
      formalPoint('obligation_refund_failure'),
      formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
    ]);
    const first = evaluateClarification(initial, 'pause_for_clarification');
    const context = baseContext();
    context.source_revision = 1;
    context.prior_state = first.state;
    setCurrent(context, [], [
      formalPoint('obligation_refund_failure', 'grounded', 'E3', null),
      formalPoint('obligation_refund_observation', 'grounded', 'E3', null)
    ]);
    context.append_batch.decision_records = [decision(
      1, 'final', [ROOT_ORACLE], ['obligation_refund_failure']
    )];
    if (mode !== 'unanswered') context.append_batch.decision_records.push(decision(
      2, /** @type {'unknown'|'deferred'} */ (mode), [ROOT_CAPABILITY], ['obligation_refund_observation']
    ));
    const result = evaluateClarification(context, 'pause_for_clarification');
    assert.deepEqual(result.diagnostics, [], mode);
    assert.equal(result.action, 'deliver', mode);
    assert.deepEqual(result.semantic_snapshot.formal_test_points, [
      formalPoint('obligation_refund_failure', 'grounded', 'E3', null),
      formalPoint('obligation_refund_observation', 'blocked', 'E0', 'CAPABILITY_UNKNOWN')
    ], mode);
    const expectedStatus = mode === 'unknown' ? 'suppressed_unknown' : 'suppressed_deferred';
    assert.equal(result.state.root_issue_dispositions.find(
      (/** @type {any} */ item) => item.root_issue_id === ROOT_CAPABILITY
    ).status, expectedStatus, mode);
  }
});

test('clarification ignores delivery metadata and treats a materially changed same-obligation root as gain', () => {
  const unchanged = baseContext();
  unchanged.source_revision = 1;
  unchanged.prior_state = priorState(unchanged.semantic_snapshot);
  unchanged.semantic_snapshot.delivery_sections.quality.delivery_status = 'critical_gaps';
  unchanged.append_batch.decision_records = [decision(1, 'final', [ROOT_ORACLE], ['obligation_refund_failure'])];
  const unchangedResult = evaluateClarification(unchanged, 'pause_for_clarification');
  assert.deepEqual(unchangedResult.diagnostics, []);
  assert.equal(unchangedResult.state.clarification_stop.reason, 'no_information_gain');
  assert.equal(unchangedResult.state.root_issue_dispositions[0].status, 'suppressed_deferred');

  const changedCause = baseContext();
  changedCause.source_revision = 1;
  changedCause.prior_state = priorState(changedCause.semantic_snapshot);
  setCurrent(changedCause, [blocker({ semantic_refs: ['claim_new'] })]);
  changedCause.append_batch.decision_records = [decision(1, 'final', [ROOT_ORACLE], ['obligation_refund_failure'])];
  const changedCauseResult = evaluateClarification(changedCause, 'pause_for_clarification');
  assert.deepEqual(changedCauseResult.diagnostics, []);
  assert.equal(changedCauseResult.action, 'need_user_answers');
  const changedStatuses = new Map(changedCauseResult.state.root_issue_dispositions.map((/** @type {any} */ item) => [item.root_issue_id, item.status]));
  assert.equal(changedStatuses.get(ROOT_ORACLE), 'resolved_final');
  assert.equal(changedStatuses.get(ROOT_NEW), 'asked');
  assert.deepEqual(changedCauseResult.pending_root_issues.map((/** @type {any} */ root) => root.root_issue_id), [ROOT_NEW]);
});

test('clarification same-revision replay binds both root and six-section semantic snapshots', () => {
  const firstContext = baseContext();
  const first = evaluateClarification(firstContext, 'pause_for_clarification');

  const replay = baseContext();
  replay.prior_state = structuredClone(first.state);
  const replayResult = evaluateClarification(replay, 'pause_for_clarification');
  assert.deepEqual(replayResult.diagnostics, []);
  assert.equal(replayResult.action, 'need_user_answers');
  assert.deepEqual(replayResult.state.last_pending_root_issue_ids, [ROOT_ORACLE]);
  assert.deepEqual(replayResult.state, first.state);

  const rootDrift = baseContext();
  rootDrift.prior_state = structuredClone(first.state);
  rootDrift.blocked_obligations[0].risk = 'low';
  const rootDriftResult = evaluateClarification(rootDrift, 'pause_for_clarification');
  assert.equal(rootDriftResult.action, 'need_revision');
  assert.equal(rootDriftResult.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'IMMUTABLE_ROOT_SNAPSHOT_MISMATCH'
  ), true);

  const semanticDrift = baseContext();
  semanticDrift.prior_state = structuredClone(first.state);
  semanticDrift.semantic_snapshot.delivery_sections.quality.delivery_status = 'critical_gaps';
  const semanticDriftResult = evaluateClarification(semanticDrift, 'pause_for_clarification');
  assert.equal(semanticDriftResult.action, 'need_revision');
  assert.equal(semanticDriftResult.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'IMMUTABLE_SEMANTIC_SNAPSHOT_MISMATCH'
  ), true);
});

test('clarification binds empty and nonempty append batches to exact revision transitions', () => {
  const first = evaluateClarification(baseContext(), 'pause_for_clarification');
  const invalid = [];

  const emptyJump = baseContext();
  emptyJump.source_revision = 5;
  emptyJump.prior_state = structuredClone(first.state);
  emptyJump.blocked_obligations[0].risk = 'low';
  invalid.push(emptyJump);

  for (const revision of [0, 2, 5]) {
    const nonempty = baseContext();
    nonempty.source_revision = revision;
    nonempty.prior_state = structuredClone(first.state);
    nonempty.append_batch.clarification_events = [control(
      1, 'request_delivery', [ROOT_ORACLE]
    )];
    invalid.push(nonempty);
  }
  for (const context of invalid) {
    const result = evaluateClarification(context, 'pause_for_clarification');
    assert.equal(result.action, 'need_revision', `revision=${context.source_revision}`);
    assert.equal(result.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'APPEND_REVISION_INVALID'
    ), true, `revision=${context.source_revision}`);
  }

  const next = baseContext();
  next.source_revision = 1;
  next.prior_state = structuredClone(first.state);
  next.append_batch.clarification_events = [control(
    1, 'request_delivery', [ROOT_ORACLE]
  )];
  const accepted = evaluateClarification(next, 'pause_for_clarification');
  assert.deepEqual(accepted.diagnostics, []);
  assert.equal(accepted.action, 'deliver');
  assert.equal(accepted.state.source_revision, 1);

  const emptyBackstep = structuredClone(next);
  emptyBackstep.source_revision = 0;
  emptyBackstep.prior_state = structuredClone(accepted.state);
  emptyBackstep.append_batch = { decision_records: [], clarification_events: [] };
  const rejectedBackstep = evaluateClarification(emptyBackstep, 'pause_for_clarification');
  assert.equal(rejectedBackstep.action, 'need_revision');
  assert.equal(rejectedBackstep.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'APPEND_REVISION_INVALID'
  ), true);
});

test('clarification binds the null-snapshot prior sentinel to the exact replay revision', () => {
  const sameRevision = evaluateClarification(baseContext(), 'pause_for_clarification');
  assert.deepEqual(sameRevision.diagnostics, []);
  assert.equal(sameRevision.action, 'need_user_answers');

  const forward = baseContext();
  forward.source_revision = 5;
  forward.blocked_obligations[0].semantic_refs = ['claim_refund_changed', 'view_refund#failure'];
  const backward = baseContext();
  backward.prior_state.source_revision = 5;
  backward.blocked_obligations[0].risk = 'low';
  for (const context of [forward, backward]) {
    const result = evaluateClarification(context, 'pause_for_clarification');
    assert.equal(result.action, 'need_revision');
    assert.equal(result.state, null);
    assert.equal(result.diagnostics.some(
      (/** @type {any} */ item) => item.code === 'APPEND_REVISION_INVALID'
    ), true);
  }
});

test('clarification preserves a causally effective disposition while asking a genuinely new root', () => {
  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = priorState(context.semantic_snapshot);
  setCurrent(context, [blocker({ obligation_id: 'obligation_new', semantic_refs: ['claim_new'] })], [
    formalPoint('obligation_refund_failure', 'conditional', 'E1', null),
    formalPoint('obligation_new')
  ]);
  context.append_batch.decision_records = [decision(1, 'temporary', [ROOT_ORACLE], ['obligation_refund_failure'])];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.action, 'need_user_answers');
  assert.deepEqual(result.pending_root_issues.map((/** @type {any} */ item) => item.root_issue_id), [ROOT_NEW]);
  assert.equal(result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE).status, 'resolved_temporary');
});

test('clarification a higher revision invalidates a prior stop before explicit reopen', () => {
  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = priorState(context.semantic_snapshot, [{ root_issue_id: ROOT_ORACLE, status: 'suppressed_deferred' }], []);
  context.prior_state.clarification_event_seq = 1;
  context.prior_state.clarification_stop = { reason: 'no_information_gain', source_revision: 0 };
  context.append_batch.clarification_events = [control(2, 'reopen_root_issues', [ROOT_ORACLE])];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_user_answers');
  assert.equal(result.state.clarification_stop, null);
});

test('clarification accepts unbounded genuine information across N=1..20 revisions', () => {
  for (let length = 1; length <= 20; length += 1) {
    let context = baseContext();
    let points = [formalPoint('obligation_chain_0')];
    setCurrent(context, [blocker({ obligation_id: 'obligation_chain_0', semantic_refs: ['claim_chain_0'] })], points);
    let result = evaluateClarification(context, 'pause_for_clarification');
    let asks = result.action === 'need_user_answers' ? 1 : 0;
    for (let index = 1; index < length; index += 1) {
      const priorRoot = result.pending_root_issues[0].root_issue_id;
      points = points.map((point) => ({ ...point, classification: 'grounded', evidence_level: 'E3', blocked_reason: null }));
      points.push(formalPoint(`obligation_chain_${index}`));
      context = baseContext();
      context.source_revision = index;
      context.prior_state = result.state;
      setCurrent(context, [blocker({ obligation_id: `obligation_chain_${index}`, semantic_refs: [`claim_chain_${index}`] })], points);
      context.append_batch.decision_records = [decision(result.state.clarification_event_seq + 1, 'final', [priorRoot], [`obligation_chain_${index - 1}`])];
      result = evaluateClarification(context, 'pause_for_clarification');
      if (result.action === 'need_user_answers') asks += 1;
    }
    const lastRoot = result.pending_root_issues[0].root_issue_id;
    const finalContext = baseContext();
    finalContext.source_revision = length;
    finalContext.prior_state = result.state;
    const finishedPoints = /** @type {ReturnType<typeof formalPoint>[]} */ (points.map((point) => ({
      ...point, classification: 'grounded', evidence_level: 'E3', blocked_reason: null
    })));
    setCurrent(finalContext, [], finishedPoints);
    finalContext.append_batch.decision_records = [decision(result.state.clarification_event_seq + 1, 'final', [lastRoot], [`obligation_chain_${length - 1}`])];
    const finished = evaluateClarification(finalContext, 'pause_for_clarification');
    assert.equal(asks, length, `N=${length}`);
    assert.equal(finished.action, 'deliver', `N=${length}`);
  }
});

test('clarification rejects invalid append histories and lifecycle references deterministically', () => {
  /** @type {Array<[string, (context:any)=>void, string]>} */
  const cases = [
    ['duplicate sequence', (context) => {
      context.append_batch.decision_records = [decision(1, 'final', [ROOT_ORACLE], ['obligation_refund_failure'])];
      context.append_batch.clarification_events = [control(1, 'request_delivery', [ROOT_ORACLE])];
    }, 'CLARIFICATION_EVENT_SEQUENCE_DUPLICATE'],
    ['nonmonotone sequence', (context) => {
      context.append_batch.decision_records = [decision(2, 'final', [ROOT_ORACLE], ['obligation_refund_failure']), decision(1, 'temporary', [ROOT_ORACLE], ['obligation_refund_failure'])];
    }, 'CLARIFICATION_EVENT_SEQUENCE_NONMONOTONE'],
    ['dangling decision root', (context) => {
      context.append_batch.decision_records = [decision(1, 'final', ['root_unknown'], ['obligation_refund_failure'])];
    }, 'DECISION_ROOT_UNKNOWN'],
    ['same revision control', (context) => {
      context.source_revision = 0;
      context.append_batch.clarification_events = [control(1, 'request_delivery', [ROOT_ORACLE])];
    }, 'APPEND_REVISION_INVALID'],
    ['stale revision control', (context) => {
      context.source_revision = 0;
      context.prior_state.source_revision = 1;
      context.prior_state.clarification_event_seq = 1;
      context.append_batch.clarification_events = [control(2, 'request_delivery', [ROOT_ORACLE])];
    }, 'APPEND_REVISION_INVALID'],
    ['unknown reopen', (context) => {
      context.append_batch.clarification_events = [control(1, 'reopen_root_issues', ['root_unknown'])];
    }, 'REOPEN_ROOT_UNKNOWN'],
    ['resolved reopen', (context) => {
      context.prior_state.root_issue_dispositions = [{ root_issue_id: ROOT_ORACLE, status: 'resolved_final' }];
      context.append_batch.clarification_events = [control(1, 'reopen_root_issues', [ROOT_ORACLE])];
    }, 'REOPEN_STATUS_INVALID']
  ];
  for (const [name, mutate, code] of cases) {
    const context = baseContext();
    context.source_revision = 1;
    context.prior_state = priorState(context.semantic_snapshot);
    mutate(context);
    const first = evaluateClarification(context, 'pause_for_clarification');
    const second = evaluateClarification(structuredClone(context), 'pause_for_clarification');
    assert.equal(first.action, 'need_revision', name);
    assert.equal(first.diagnostics.some((/** @type {any} */ item) => item.code === code), true, name);
    assert.deepEqual(second, first, name);
  }
});

test('clarification binds prior pending roots, dispositions, asked history, and digest', () => {
  /** @type {Array<[string, (context:any)=>void, string]>} */
  const cases = [
    ['forged digest', (context) => { context.prior_state.last_question_set_digest = 'forged'; }, 'PRIOR_PENDING_DIGEST_MISMATCH'],
    ['asked disposition omitted from pending', (context) => { context.prior_state.last_pending_root_issue_ids = []; context.prior_state.last_question_set_digest = ''; }, 'PRIOR_PENDING_DISPOSITION_MISMATCH'],
    ['pending root is resolved', (context) => { context.prior_state.root_issue_dispositions[0].status = 'resolved_final'; }, 'PRIOR_PENDING_DISPOSITION_MISMATCH'],
    ['pending root was never asked', (context) => { context.prior_state.asked_root_issue_ids = []; }, 'PRIOR_PENDING_NOT_ASKED'],
    ['asked history has an open root', (context) => {
      context.prior_state.root_issue_dispositions[0].status = 'open';
      context.prior_state.last_pending_root_issue_ids = [];
      context.prior_state.last_question_set_digest = '';
    }, 'PRIOR_LIFECYCLE_STATE_INVALID'],
    ['resolved root absent from asked history', (context) => {
      context.prior_state.root_issue_dispositions[0].status = 'resolved_final';
      context.prior_state.last_pending_root_issue_ids = [];
      context.prior_state.last_question_set_digest = '';
      context.prior_state.asked_root_issue_ids = [];
    }, 'PRIOR_DISPOSITION_HISTORY_MISMATCH'],
    ['forged root obligation association', (context) => {
      context.prior_state.root_snapshot_ledger[0].affected_obligation_ids = ['obligation_forged'];
    }, 'PRIOR_ROOT_ASSOCIATION_INVALID']
  ];
  for (const [name, mutate, code] of cases) {
    const context = baseContext();
    context.prior_state = priorState(context.semantic_snapshot);
    mutate(context);
    const result = evaluateClarification(context, 'pause_for_clarification');
    assert.equal(result.action, 'need_revision', name);
    assert.equal(result.diagnostics.some((/** @type {any} */ item) => item.code === code), true, name);
  }
});

test('clarification rejects a forged overlapping root-to-obligation partition', () => {
  const second = blocker({
    obligation_id: 'obligation_refund_second',
    semantic_refs: ['claim_refund_second'],
    evidence_refs: ['claim_refund_second']
  });
  const secondRoot = stableId('root', {
    missing_type: second.missing_type,
    semantic_refs: second.semantic_refs,
    scope: second.scope
  });
  const initial = baseContext();
  setCurrent(initial, [blocker(), second]);
  const first = evaluateClarification(initial, 'pause_for_clarification');
  const forged = structuredClone(first.state);
  forged.root_snapshot_ledger.find(
    (/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE
  ).affected_obligation_ids.push('obligation_refund_second');

  const context = structuredClone(initial);
  context.source_revision = 1;
  context.prior_state = forged;
  context.append_batch.clarification_events = [control(
    1, 'request_delivery', sortedIds([ROOT_ORACLE, secondRoot])
  )];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_revision');
  assert.equal(result.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'PRIOR_ROOT_PARTITION_INVALID'
  ), true);
});

test('clarification binds a prior stop to its revision and an empty pending set', () => {
  const withPending = baseContext();
  withPending.prior_state = priorState(withPending.semantic_snapshot);
  withPending.prior_state.clarification_stop = { reason: 'converged', source_revision: 0 };

  const wrongRevision = baseContext();
  wrongRevision.prior_state = priorState(
    wrongRevision.semantic_snapshot,
    [{ root_issue_id: ROOT_ORACLE, status: 'suppressed_deferred' }],
    []
  );
  wrongRevision.prior_state.clarification_stop = { reason: 'no_information_gain', source_revision: 1 };

  const results = [withPending, wrongRevision].map((context) =>
    evaluateClarification(context, 'pause_for_clarification'));
  assert.deepEqual(results.map((result) => ({
    action: result.action,
    bound: result.diagnostics.some((/** @type {any} */ item) => item.code === 'PRIOR_STOP_STATE_INVALID')
  })), [
    { action: 'need_revision', bound: true },
    { action: 'need_revision', bound: true }
  ]);
});

test('clarification validates Decision question identity from the sorted root set', () => {
  const context = baseContext();
  context.source_revision = 1;
  context.prior_state = priorState(context.semantic_snapshot);
  const record = decision(1, 'unknown', [ROOT_ORACLE], ['obligation_refund_failure']);
  record.question_id = 'question_arbitrary';
  context.append_batch.decision_records = [record];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_revision');
  assert.equal(result.diagnostics.some((/** @type {any} */ item) => item.code === 'DECISION_QUESTION_ID_MISMATCH'), true);
});

test('clarification detects a stable-ID collision before merging distinct root semantics', async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'task9-collision-'));
  const loaderPath = path.join(temporaryDirectory, 'loader.mjs');
  const probePath = path.join(temporaryDirectory, 'probe.mjs');
  const clarificationUrl = pathToFileURL(path.join(repositoryRoot, 'src/clarification.mjs')).href;
  const fixturePath = path.join(repositoryRoot, 'test/fixtures/clarification/base-context.json');
  await writeFile(loaderPath, `export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (!url.endsWith('/src/clarification.mjs')) return result;
  const source = String(result.source).replace(
    "import { canonicalStringify, digest, stableId } from './canonical.mjs';",
    "import { canonicalStringify, digest } from './canonical.mjs';\\nconst stableId = (prefix, signature) => prefix === 'root' ? 'root_forced_collision' : \\\`${'${prefix}_${digest(signature).slice(0, 16)}'}\\\`;"
  );
  return { ...result, source };
}\n`, 'utf8');
  await writeFile(probePath, `import { readFile } from 'node:fs/promises';
import { evaluateClarification } from ${JSON.stringify(clarificationUrl)};
const context = JSON.parse(await readFile(${JSON.stringify(fixturePath)}, 'utf8'));
context.blocked_obligations.push({ ...structuredClone(context.blocked_obligations[0]), obligation_id: 'obligation_second', semantic_refs: ['claim_distinct'], evidence_refs: ['claim_distinct'] });
context.semantic_snapshot.formal_test_points.push({ obligation_id: 'obligation_second', evidence_level: 'E0', classification: 'blocked', blocked_reason: 'MISSING_ORACLE' });
context.semantic_snapshot.coverage_denominator = 2;
context.semantic_snapshot.delivery_sections.blocked.push('obligation_second');
context.semantic_snapshot.delivery_sections.coverage.formal_denominator = 2;
const intraRevision = evaluateClarification(context, 'pause_for_clarification');
const firstContext = JSON.parse(await readFile(${JSON.stringify(fixturePath)}, 'utf8'));
const first = evaluateClarification(firstContext, 'pause_for_clarification');
const next = JSON.parse(await readFile(${JSON.stringify(fixturePath)}, 'utf8'));
next.source_revision = 1;
next.prior_state = first.state;
next.blocked_obligations[0].semantic_refs = ['claim_distinct'];
next.blocked_obligations[0].evidence_refs = ['claim_distinct'];
next.append_batch.clarification_events = [{ event_id: 'event_1_delivery', clarification_event_seq: 1, type: 'request_delivery', actor: 'owner', event_at: '2026-08-30', root_issue_ids: ['root_forced_collision'] }];
const crossRevision = evaluateClarification(next, 'pause_for_clarification');
console.log(JSON.stringify({ intraRevision, crossRevision }));\n`, 'utf8');
  try {
    const output = (/** @type {any} */ (childProcess)).execFileSync(
      process.execPath, [`--experimental-loader=${pathToFileURL(loaderPath).href}`, probePath], {
      encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' }
      }
    );
    const result = JSON.parse(output);
    for (const actual of [result.intraRevision, result.crossRevision]) {
      assert.equal(actual.action, 'need_revision');
      assert.equal(actual.diagnostics.some((/** @type {any} */ item) => item.code === 'ROOT_ISSUE_ID_COLLISION'), true);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('clarification validates closed dense canonical input and is stable under set-like reorder', () => {
  const first = baseContext();
  setCurrent(first, [blocker(), capabilityBlocker()]);
  const second = structuredClone(first);
  second.blocked_obligations.reverse();
  second.blocked_obligations.forEach((/** @type {any} */ item) => item.semantic_refs.reverse());
  second.semantic_snapshot.formal_test_points.reverse();
  second.semantic_snapshot.delivery_sections.blocked.reverse();
  assert.deepEqual(
    evaluateClarification(second, 'pause_for_clarification'),
    evaluateClarification(first, 'pause_for_clarification')
  );

  const invalids = [];
  const unknown = baseContext();
  unknown.extra = true;
  invalids.push(unknown);
  const sparse = baseContext();
  sparse.blocked_obligations = new Array(2);
  sparse.blocked_obligations[1] = blocker();
  invalids.push(sparse);
  const padded = baseContext();
  padded.blocked_obligations[0].scope = ' refund ';
  invalids.push(padded);
  const inherited = baseContext();
  Object.setPrototypeOf(inherited.blocked_obligations[0], { injected: true });
  invalids.push(inherited);
  let getterReads = 0;
  const accessor = baseContext();
  Object.defineProperty(accessor.blocked_obligations[0], 'scope', { enumerable: true, get() { getterReads += 1; return 'refund'; } });
  invalids.push(accessor);
  for (const context of invalids) {
    const result = evaluateClarification(context, 'pause_for_clarification');
    assert.equal(result.action, 'need_revision');
    assert.equal(result.diagnostics.length > 0, true);
  }
  assert.equal(getterReads, 0);
});

test('clarification requires blocker reason to equal its formal blocked reason', () => {
  const context = baseContext();
  context.semantic_snapshot.formal_test_points[0].blocked_reason = 'CAPABILITY_UNKNOWN';
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_revision');
  assert.equal(result.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'BLOCKED_REASON_DESCRIPTOR_MISMATCH'
  ), true);
});

test('clarification binds a retained suppressed root reason to its Blocked formal tuple', () => {
  const first = evaluateClarification(baseContext(), 'pause_for_clarification');
  const deliveredContext = baseContext();
  deliveredContext.source_revision = 1;
  deliveredContext.prior_state = first.state;
  setCurrent(deliveredContext, [], [formalPoint('obligation_refund_failure', 'grounded', 'E3', null)]);
  deliveredContext.append_batch.clarification_events = [control(1, 'request_delivery', [ROOT_ORACLE])];
  const delivered = evaluateClarification(deliveredContext, 'pause_for_clarification');
  assert.deepEqual(delivered.diagnostics, []);
  assert.equal(delivered.state.root_snapshot_ledger[0].current, false);

  const replay = structuredClone(deliveredContext);
  replay.prior_state = structuredClone(delivered.state);
  replay.prior_state.root_snapshot_ledger[0].reasons = ['CAPABILITY_UNKNOWN'];
  replay.append_batch = { decision_records: [], clarification_events: [] };
  const result = evaluateClarification(replay, 'pause_for_clarification');
  assert.equal(result.action, 'need_revision');
  assert.equal(result.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'PRIOR_ROOT_ASSOCIATION_INVALID'
  ), true);
});

test('clarification replaces a current suppressed root reason and replays the delivered tuple', () => {
  const first = evaluateClarification(baseContext(), 'pause_for_clarification');
  const changed = baseContext();
  changed.source_revision = 1;
  changed.prior_state = first.state;
  setCurrent(changed, [blocker({ reason: 'ORACLE_INCOMPLETE' })], [
    formalPoint('obligation_refund_failure', 'blocked', 'E0', 'ORACLE_INCOMPLETE')
  ]);
  changed.append_batch.decision_records = [decision(
    1, 'unknown', [ROOT_ORACLE], ['obligation_refund_failure']
  )];
  const result = evaluateClarification(changed, 'pause_for_clarification');
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.action, 'deliver');
  assert.deepEqual(result.state.root_snapshot_ledger[0].reasons, ['ORACLE_INCOMPLETE']);
  const publicRoot = structuredClone(result.root_issues[0]);
  delete publicRoot.source_revision;
  delete publicRoot.batch_id;
  assert.deepEqual(result.state.root_snapshot_ledger[0], { ...publicRoot, current: true });

  const replay = structuredClone(changed);
  replay.prior_state = result.state;
  replay.append_batch = { decision_records: [], clarification_events: [] };
  const replayed = evaluateClarification(replay, 'pause_for_clarification');
  assert.deepEqual(replayed.diagnostics, []);
  assert.deepEqual(replayed.state, result.state);
});

test('clarification compares same-revision suppressed roots before any retained projection', () => {
  const recorded = evaluateClarification(baseContext(), 'record_only');
  assert.deepEqual(recorded.diagnostics, []);

  const replay = baseContext();
  replay.prior_state = recorded.state;
  const replayed = evaluateClarification(replay, 'record_only');
  assert.deepEqual(replayed.diagnostics, []);
  const publicRoot = structuredClone(replayed.root_issues[0]);
  delete publicRoot.source_revision;
  delete publicRoot.batch_id;
  assert.deepEqual(replayed.state.root_snapshot_ledger[0], { ...publicRoot, current: true });

  const drifted = baseContext();
  drifted.prior_state = recorded.state;
  drifted.blocked_obligations[0].risk = 'low';
  const rejected = evaluateClarification(drifted, 'record_only');
  assert.equal(rejected.action, 'need_revision');
  assert.equal(rejected.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'IMMUTABLE_ROOT_SNAPSHOT_MISMATCH'
  ), true);
});

test('clarification diagnostics are canonical and reserve truncation only for real overflow', () => {
  /** @param {number} count @param {boolean} [reverse] */
  const withAccessors = (count, reverse = false) => {
    const context = baseContext();
    const indexes = Array.from({ length: count }, (_, index) => index);
    if (reverse) indexes.reverse();
    for (const index of indexes) Object.defineProperty(
      context.blocked_obligations[0], `bad_${String(index).padStart(3, '0')}`,
      { enumerable: true, get() { throw new Error('submitted accessors must not execute'); } }
    );
    return context;
  };
  const boundaries = /** @type {Array<[number, number, boolean]>} */ (
    [[255, 255, false], [256, 256, false], [257, 256, true]]
  );
  for (const [count, expectedCount, marker] of boundaries) {
    const result = evaluateClarification(withAccessors(count), 'pause_for_clarification');
    assert.equal(result.diagnostics.length, expectedCount, `count=${count}`);
    assert.equal(result.diagnostics.some((/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'), marker, `count=${count}`);
  }
  const first = evaluateClarification(withAccessors(300), 'pause_for_clarification');
  const reversed = evaluateClarification(withAccessors(300, true), 'pause_for_clarification');
  assert.deepEqual(reversed.diagnostics, first.diagnostics);
  assert.equal(first.diagnostics.some((/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'), true);
  const keys = first.diagnostics.map((/** @type {any} */ item) => `${item.category}\0${item.code}\0${item.path}\0${item.message}`);
  assert.deepEqual(keys, [...keys].sort());

  const unknowns = baseContext();
  for (let index = 299; index >= 0; index -= 1) unknowns[`unknown_${String(index).padStart(3, '0')}`] = true;
  const unknownResult = evaluateClarification(unknowns, 'pause_for_clarification');
  const unknownKeys = unknownResult.diagnostics.map((/** @type {any} */ item) => `${item.category}\0${item.code}\0${item.path}\0${item.message}`);
  assert.equal(unknownResult.diagnostics.length, 256);
  assert.equal(unknownResult.diagnostics.some((/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'), true);
  assert.deepEqual(unknownKeys, [...unknownKeys].sort());
});

test('clarification always reserves one canonical diagnostic slot for a real overflow marker', () => {
  /** @param {number} count @param {boolean} [reverse] */
  const withDuplicateDecisions = (count, reverse = false) => {
    const pending = evaluateClarification(baseContext(), 'pause_for_clarification');
    assert.deepEqual(pending.diagnostics, []);
    const context = baseContext();
    context.source_revision = 1;
    context.prior_state = pending.state;
    const indexes = Array.from({ length: count }, (_, index) => index);
    if (reverse) indexes.reverse();
    context.append_batch.decision_records = indexes.map((sourceIndex, position) => ({
      decision_id: `decision_${String(sourceIndex).padStart(3, '0')}`,
      question_id: questionId([ROOT_ORACLE]),
      root_issue_ids: [ROOT_ORACLE],
      affected_obligation_ids: [],
      clarification_event_seq: position + 1,
      confirmer: 'refund-owner',
      confirmed_at: '2026-08-30',
      question: 'What should happen?',
      answer: 'I do not know.',
      disposition: 'unknown',
      authority_scope: 'refund',
      effective_scope: 'refund',
      evidence_ref: `locator_${String(sourceIndex).padStart(3, '0')}`,
      evidence_level: 'E1'
    }));
    return evaluateClarification(context, 'pause_for_clarification');
  };

  const below = withDuplicateDecisions(256);
  assert.equal(below.diagnostics.length, 255);
  assert.equal(below.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'
  ), false);
  const boundary = withDuplicateDecisions(257);
  assert.equal(boundary.diagnostics.length, 256);
  assert.equal(boundary.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'
  ), false);

  const overflow = withDuplicateDecisions(300);
  const reversed = withDuplicateDecisions(300, true);
  assert.equal(overflow.diagnostics.length, 256);
  assert.equal(overflow.diagnostics.filter(
    (/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'
  ).length, 1);
  assert.deepEqual(reversed.diagnostics, overflow.diagnostics);
  const keys = overflow.diagnostics.map(
    (/** @type {any} */ item) => `${item.category}\0${item.code}\0${item.path}\0${item.message}`
  );
  assert.deepEqual(keys, [...keys].sort());
});

test('clarification snapshot traversal discloses overflow and never executes later accessors or iterators', () => {
  let accessorReads = 0;
  const context = baseContext();
  for (let index = 0; index < 256; index += 1) Object.defineProperty(
    context.blocked_obligations[0], `bad_${String(index).padStart(3, '0')}`,
    { enumerable: true, get() { accessorReads += 1; return true; } }
  );
  Object.defineProperty(context.prior_state, 'bad_sibling', {
    enumerable: true, get() { accessorReads += 1; return true; }
  });
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_revision');
  assert.equal(accessorReads, 0);
  assert.equal(result.diagnostics.some((/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'), true);

  let iteratorCalls = 0;
  const iteratorContext = baseContext();
  Object.defineProperty(iteratorContext.blocked_obligations, Symbol.iterator, {
    configurable: true,
    value() { iteratorCalls += 1; return [][Symbol.iterator](); }
  });
  const iteratorResult = evaluateClarification(iteratorContext, 'pause_for_clarification');
  assert.equal(iteratorResult.action, 'need_revision');
  assert.equal(iteratorCalls, 0);
  assert.equal(iteratorResult.diagnostics.some((/** @type {any} */ item) => item.code === 'ARRAY_SYMBOL_PROPERTY_INVALID'), true);
});

test('clarification snapshot never reads an inherited replacement for a missing own field', () => {
  const context = baseContext();
  delete (/** @type {any} */ (context)).source_revision;
  let reads = 0;
  Object.defineProperty(Object.prototype, 'source_revision', {
    configurable: true,
    get() { reads += 1; return 0; }
  });
  /** @type {any} */
  let result;
  try {
    result = evaluateClarification(context, 'pause_for_clarification');
  } finally {
    delete (/** @type {any} */ (Object.prototype)).source_revision;
  }
  assert.equal(reads, 0);
  assert.equal(result.action, 'need_revision');
  assert.equal(result.diagnostics.some(
    (/** @type {any} */ item) => item.code === 'INTEGER_INVALID'
  ), true);
});

test('clarification normalization captures Array entries and has no direct mutable-array method calls', async () => {
  const context = baseContext();
  let calls = 0;
  const original = Object.getOwnPropertyDescriptor(Array.prototype, 'entries');
  if (!original || typeof original.value !== 'function') throw new Error('Array.prototype.entries must exist');
  Object.defineProperty(Array.prototype, 'entries', {
    ...original,
    /** @param {...any} args */
    value: function (...args) {
      calls += 1;
      return Reflect.apply(/** @type {Function} */ (original.value), this, args);
    }
  });
  /** @type {any} */
  let result;
  try {
    result = evaluateClarification(context, 'pause_for_clarification');
  } finally {
    Object.defineProperty(Array.prototype, 'entries', original);
  }
  assert.equal(result.action, 'need_user_answers');
  assert.equal(calls, 0);
  const source = await readFile(path.join(repositoryRoot, 'src/clarification.mjs'), 'utf8');
  for (const method of ['entries', 'map', 'filter', 'sort', 'some', 'at', 'push', 'pop', 'slice', 'includes']) {
    assert.equal(new RegExp(`\\.${method}\\(`, 'u').test(source), false, method);
  }
});

test('clarification sparse arrays derive bounded hole diagnostics from own descriptors', async () => {
  const context = baseContext();
  context.blocked_obligations = new Array(5_000_000);
  context.blocked_obligations[4_999_999] = blocker();
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'need_revision');
  assert.equal(result.diagnostics.some((/** @type {any} */ item) => item.code === 'ARRAY_HOLE'), true);
  assert.equal(result.diagnostics.some((/** @type {any} */ item) => item.code === 'DIAGNOSTICS_TRUNCATED'), true);
  const source = await readFile(path.join(repositoryRoot, 'src/clarification.mjs'), 'utf8');
  assert.equal(source.includes('numeric[index] !== index'), false);
});

test('clarification indexes retained suppressed roots instead of rescanning every formal point', async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'task9-retained-scale-'));
  const probePath = path.join(temporaryDirectory, 'probe.mjs');
  const clarificationUrl = pathToFileURL(path.join(repositoryRoot, 'src/clarification.mjs')).href;
  const canonicalUrl = pathToFileURL(path.join(repositoryRoot, 'src/canonical.mjs')).href;
  await writeFile(probePath, `import { canonicalStringify, stableId } from ${JSON.stringify(canonicalUrl)};
const original = Array.prototype.includes;
let includeCalls = 0;
Object.defineProperty(Array.prototype, 'includes', { configurable: true, writable: true, value(...args) {
  includeCalls += 1;
  return Reflect.apply(original, this, args);
} });
const { evaluateClarification } = await import(${JSON.stringify(clarificationUrl)});
Object.defineProperty(Array.prototype, 'includes', { configurable: true, writable: true, value: original });
function semantic(points) {
  const blocked = points.map((point) => point.obligation_id);
  return { formal_test_points: points, coverage_denominator: points.length, delivery_sections: {
    grounded: [], conditional: [], blocked, exploratory: [], coverage: { formal_denominator: points.length },
    quality: { delivery_status: 'no_deterministic_cases' }
  } };
}
function run(size) {
  const points = [];
  const ledger = [];
  const dispositions = [];
  for (let index = 0; index < size; index += 1) {
    const obligationId = \`obligation_\${String(index).padStart(5, '0')}\`;
    const claimId = \`claim_\${String(index).padStart(5, '0')}\`;
    const signature = { missing_type: 'oracle', semantic_refs: [claimId], scope: 'refund' };
    const rootId = stableId('root', signature);
    points.push({ obligation_id: obligationId, evidence_level: 'E0', classification: 'blocked', blocked_reason: 'MISSING_ORACLE' });
    ledger.push({ root_issue_id: rootId, root_issue_key: canonicalStringify(signature), missing_type: 'oracle', semantic_refs: [claimId], scope: 'refund', affected_obligation_ids: [obligationId], risk_counts: { critical: 0, high: 1, medium: 0, low: 0 }, question: 'What should happen?', answerable: true, reasons: ['MISSING_ORACLE'], evidence_refs: [claimId], current: false });
    dispositions.push({ root_issue_id: rootId, status: 'suppressed_deferred' });
  }
  const snapshot = semantic(points);
  const context = { source_revision: 0, blocked_obligations: [], prior_state: {
    source_revision: 0, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: dispositions,
    last_pending_root_issue_ids: [], last_question_set_digest: '', clarification_stop: null,
    semantic_snapshot: structuredClone(snapshot), root_snapshot_ledger: ledger
  }, append_batch: { decision_records: [], clarification_events: [] }, semantic_snapshot: snapshot };
  includeCalls = 0;
  const result = evaluateClarification(context, 'pause_for_clarification');
  return { size, includeCalls, action: result.action, diagnostics: result.diagnostics };
}
console.log(JSON.stringify([1000, 2000, 4000].map(run)));
`, 'utf8');
  try {
    const output = (/** @type {any} */ (childProcess)).execFileSync(process.execPath, [probePath], {
      encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    });
    const measurements = JSON.parse(output);
    for (const item of measurements) {
      assert.equal(item.action, 'deliver', `N=${item.size}`);
      assert.deepEqual(item.diagnostics, [], `N=${item.size}`);
      assert.equal(item.includeCalls, 0, `N=${item.size}, calls=${item.includeCalls}`);
    }
    assert.deepEqual(measurements.map((/** @type {any} */ item) => item.includeCalls), [0, 0, 0]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('clarification uses constant-time membership for root reasons and Decision obligations', async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'task9-decision-membership-'));
  const probePath = path.join(temporaryDirectory, 'probe.mjs');
  const clarificationUrl = pathToFileURL(path.join(repositoryRoot, 'src/clarification.mjs')).href;
  const canonicalUrl = pathToFileURL(path.join(repositoryRoot, 'src/canonical.mjs')).href;
  await writeFile(probePath, `import { canonicalStringify, digest, stableId } from ${JSON.stringify(canonicalUrl)};
const original = Array.prototype.includes;
let comparisons = 0;
Object.defineProperty(Array.prototype, 'includes', { configurable: true, writable: true, value(search, from = 0) {
  const length = this.length >>> 0;
  for (let index = Math.max(0, Number(from) || 0); index < length; index += 1) {
    comparisons += 1;
    const value = this[index];
    if (value === search || (value !== value && search !== search)) return true;
  }
  return false;
} });
const { evaluateClarification } = await import(${JSON.stringify(clarificationUrl)});
Object.defineProperty(Array.prototype, 'includes', { configurable: true, writable: true, value: original });
function semantic(ids, classification) {
  const points = ids.map((obligation_id) => ({
    obligation_id, evidence_level: classification === 'blocked' ? 'E0' : 'E3', classification,
    blocked_reason: classification === 'blocked' ? 'MISSING_ORACLE' : null
  }));
  return { formal_test_points: points, coverage_denominator: ids.length, delivery_sections: {
    grounded: classification === 'grounded' ? [...ids] : [], conditional: [],
    blocked: classification === 'blocked' ? [...ids] : [], exploratory: [],
    coverage: { formal_denominator: ids.length },
    quality: { delivery_status: classification === 'blocked' ? 'no_deterministic_cases' : 'executable_subset_ready' }
  } };
}
function run(size) {
  const ids = Array.from({ length: size }, (_, index) => \`obligation_\${String(index).padStart(5, '0')}\`);
  const signature = { missing_type: 'oracle', semantic_refs: ['claim_shared'], scope: 'refund' };
  const rootId = stableId('root', signature);
  const priorSemantic = semantic(ids, 'blocked');
  const currentSemantic = semantic(ids, 'grounded');
  const root = {
    root_issue_id: rootId, root_issue_key: canonicalStringify(signature), ...signature,
    affected_obligation_ids: [...ids], risk_counts: { critical: 0, high: size, medium: 0, low: 0 },
    question: 'What should happen?', answerable: true, reasons: ['MISSING_ORACLE'],
    evidence_refs: ['claim_shared'], current: true
  };
  const context = { source_revision: 1, blocked_obligations: [], prior_state: {
    source_revision: 0, clarification_event_seq: 0, asked_root_issue_ids: [rootId],
    root_issue_dispositions: [{ root_issue_id: rootId, status: 'asked' }],
    last_pending_root_issue_ids: [rootId], last_question_set_digest: digest([rootId]), clarification_stop: null,
    semantic_snapshot: priorSemantic, root_snapshot_ledger: [root]
  }, append_batch: { decision_records: [{
    decision_id: 'decision_final', question_id: stableId('question', { root_issue_ids: [rootId] }),
    root_issue_ids: [rootId], affected_obligation_ids: [...ids], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-30', question: 'What should happen?', answer: 'Apply the oracle.',
    disposition: 'final', authority_scope: 'refund', effective_scope: 'refund',
    evidence_ref: 'locator_decision', evidence_level: 'E3'
  }], clarification_events: [] }, semantic_snapshot: currentSemantic };
  comparisons = 0;
  const result = evaluateClarification(context, 'pause_for_clarification');
  return { size, comparisons, action: result.action, diagnostics: result.diagnostics };
}
console.log(JSON.stringify([500, 1000, 2000].map(run)));
`, 'utf8');
  try {
    const output = (/** @type {any} */ (childProcess)).execFileSync(process.execPath, [probePath], {
      encoding: 'utf8', maxBuffer: 10 * 1024 * 1024
    });
    const measurements = JSON.parse(output);
    for (const item of measurements) {
      assert.equal(item.action, 'deliver', `N=${item.size}`);
      assert.deepEqual(item.diagnostics, [], `N=${item.size}`);
      assert.equal(item.comparisons, 0, `N=${item.size}, comparisons=${item.comparisons}`);
    }
    assert.deepEqual(measurements.map((/** @type {any} */ item) => item.comparisons), [0, 0, 0]);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test('clarification production and test sources contain no fixed iteration fields', async () => {
  const forbidden = [
    ['clarification', 'round'].join('_'),
    ['max', 'rounds'].join('_'),
    ['round', 'budget'].join('_')
  ];
  const sources = await Promise.all([
    'src/clarification.mjs', 'test/core/clarification.test.mjs', 'test/core/record-only.test.mjs'
  ].map((file) => readFile(path.join(repositoryRoot, file), 'utf8')));
  for (const symbol of forbidden) for (const source of sources) assert.equal(source.includes(symbol), false, symbol);
});
