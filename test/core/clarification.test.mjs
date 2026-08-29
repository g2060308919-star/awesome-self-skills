import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateClarification } from '../../src/clarification.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
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

/** @param {any} semantic @param {Array<{root_issue_id:string,status:string}>} [dispositions] @param {string[]} [pending] */
function priorState(semantic, dispositions = [{ root_issue_id: ROOT_ORACLE, status: 'asked' }], pending = [ROOT_ORACLE]) {
  return {
    source_revision: 0,
    clarification_event_seq: 0,
    asked_root_issue_ids: [...pending],
    root_issue_dispositions: dispositions,
    last_pending_root_issue_ids: [...pending],
    last_question_set_digest: pending.length > 0 ? 'prior-question-digest' : '',
    clarification_stop: null,
    semantic_snapshot: structuredClone(semantic)
  };
}

/** @param {number} seq @param {'final'|'temporary'|'unknown'|'deferred'} disposition @param {string[]} rootIds @param {string[]} affectedIds */
function decision(seq, disposition, rootIds, affectedIds) {
  return {
    decision_id: `decision_${seq}_${disposition}`,
    question_id: `question_${seq}`,
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

test('clarification answer plus delivery preserves the answer and defers a root revealed by recompilation', () => {
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
  assert.equal(result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === ROOT_ORACLE).status, 'resolved_final');
  assert.equal(result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === ROOT_NEW).status, 'suppressed_deferred');
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
  ], [ROOT_ORACLE, ROOT_CAPABILITY]);
  context.append_batch.decision_records = [decision(1, 'final', [ROOT_ORACLE], ['obligation_refund_failure'])];
  const result = evaluateClarification(context, 'pause_for_clarification');
  assert.equal(result.action, 'deliver');
  assert.equal(result.state.clarification_stop.reason, 'no_information_gain');
  for (const rootId of [ROOT_ORACLE, ROOT_CAPABILITY]) assert.equal(
    result.state.root_issue_dispositions.find((/** @type {any} */ item) => item.root_issue_id === rootId).status,
    'suppressed_deferred'
  );
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
