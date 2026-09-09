import assert from 'node:assert/strict';
import test from 'node:test';
const load = async (/** @type {string} */ file) => import(file).catch(error => { if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error; });
const na = /** @type {any} */ (await load('../../src/not-applicable.mjs'));
const risk = /** @type {any} */ (await load('../../src/risk-review.mjs'));
const kinds = ['null_or_missing', 'unknown_enum', 'api_failure', 'loading_failure', 'sync_delay', 'long_content', 'pagination', 'refresh', 'business_permission_boundary'];
/** @param {string} [risk_kind] @returns {any} */
const subject = (risk_kind = 'business_permission_boundary') => ({ kind: 'risk', module_id: 'admin', risk_kind });
/** @param {any} [target] @returns {any} */
function intent(target = subject()) {
  return { subject: target, acceptance_role: 'primary_acceptance', reason_code: 'inapplicable_condition', reason: '只读显示不改变权限',
    basis: { kind: 'evidence', claim_ids: ['CLM-read', 'CLM-scope'] } };
}
/** @param {any} [request] @returns {any} */
function context(request = intent()) {
  const { subject, acceptance_role, reason_code, basis } = request;
  return { subjects: [{ subject, acceptance_role }], verified_bases: [{ subject, acceptance_role, reason_code, basis }] };
}
/** @param {any} [request] @param {any} [state] */
function compile(request = intent(), state = context(request)) {
  assert.equal(typeof na.compileNotApplicable, 'function', 'compiler-owned NotApplicable compilation must exist');
  return na.compileNotApplicable(request, state);
}

test('v4 NotApplicable creates closed risk and formal-Test-Point records with deterministic canonical basis identities', () => {
  const request = intent();
  const record = compile(request);
  assert.match(record.not_applicable_record_id, /^NA-[0-9a-f]{64}$/);
  assert.deepEqual(record.subject, { kind: 'risk', module_id: 'admin', risk_kind: 'business_permission_boundary' });
  assert.deepEqual(na.validateNotApplicable(record, context()), []);
  const reordered = intent(); reordered.basis.claim_ids.reverse(); reordered.reason = '同义说明';
  assert.equal(compile(reordered).not_applicable_record_id, record.not_applicable_record_id);
  const unicode = intent(); unicode.basis.claim_ids = ['CLM-\u{10000}', 'CLM-\ue000', 'CLM-e\u0301', 'CLM-é'];
  const normalized = compile(unicode);
  assert.deepEqual(normalized.basis.claim_ids, ['CLM-é', 'CLM-\ue000', 'CLM-\u{10000}']);
  const changed = intent(); changed.basis.claim_ids = ['CLM-different'];
  assert.notEqual(compile(changed).not_applicable_record_id, record.not_applicable_record_id);
  const point = intent({ kind: 'formal_test_point', formal_test_point_id: 'TP-removed' });
  point.basis = { kind: 'scope_decision', decision_ids: ['DEC-scope'] }; point.reason_code = 'out_of_scope';
  assert.deepEqual(na.validateNotApplicable(compile(point), context(point)), []);
});

test('v4 NotApplicable rejects mixed subjects, unverified basis, forged IDs, wrong role and bare N/A', () => {
  const request = intent(); const record = compile();
  for (const input of ['N/A', { ...request, not_applicable_record_id: 'NA-forged' },
    { ...request, subject: { ...request.subject, formal_test_point_id: 'TP-other' } },
    { ...request, basis: { kind: 'risk_catalog', policy_id: 'generic', policy_version: '1' } },
    { ...request, reason_code: 'prd_not_mentioned' }]) assert.throws(() => compile(input, context()));
  assert.throws(() => compile(request, { ...context(), verified_bases: [] }), /NOT_APPLICABLE_BASIS_UNVERIFIED/);
  assert.throws(() => compile({ ...request, acceptance_role: 'context_only' }, context()), /NOT_APPLICABLE_SUBJECT_UNRESOLVED/);
  assert.ok(na.validateNotApplicable({ ...record, not_applicable_record_id: `NA-${'0'.repeat(64)}` }, context()).length);
  assert.ok(na.validateNotApplicable('N/A', context()).length);
});

/** @returns {any} */
function fixture() {
  const record = compile();
  const ledger = /** @type {any[]} */ (kinds.map(risk_kind => ({ module_id: 'admin', risk_kind, acceptance_role: 'primary_acceptance', status: 'exploratory',
    review_basis: { kind: 'risk_catalog', policy_id: 'general', policy_version: '1' }, exploratory_ids: [`EXP-${risk_kind}`] })));
  Object.assign(ledger[0], { status: 'formal', review_basis: { kind: 'evidence', claim_ids: ['CLM-null'] }, formal_test_point_ids: ['TP-null'] });
  delete ledger[0].exploratory_ids;
  Object.assign(ledger[1], { status: 'semantic_gap', review_basis: { kind: 'semantic_gap_analysis', subject_fact_ids: ['FACT-enum'], missing_aspect: '未知枚举处理' }, semantic_gap_ids: ['GAP-enum'] });
  delete ledger[1].exploratory_ids;
  Object.assign(ledger[8], { status: 'not_applicable', review_basis: record.basis, not_applicable_record_ids: [record.not_applicable_record_id] });
  delete ledger[8].exploratory_ids;
  return { ledger, context: {
    primary_module_ids: ['admin'],
    formal_test_points: [{ formal_test_point_id: 'TP-null', module_id: 'admin', risk_kind: 'null_or_missing', acceptance_role: 'primary_acceptance', claim_ids: ['CLM-null'] }],
    semantic_gaps: [{ semantic_gap_id: 'GAP-enum', module_id: 'admin', risk_kind: 'unknown_enum', acceptance_role: 'primary_acceptance', subject_fact_ids: ['FACT-enum'], missing_aspect: '未知枚举处理' }],
    exploratory: kinds.slice(2, 8).map(risk_kind => ({ exploratory_id: `EXP-${risk_kind}`, module_id: 'admin', risk_kind, acceptance_role: 'primary_acceptance', policy_id: 'general', policy_version: '1' })),
    not_applicable_records: [record], not_applicable_context: context()
  } };
}
/** @param {any} value */
function review(value) {
  assert.equal(typeof risk.validateRiskReviewLedger, 'function', 'the complete risk review gate must exist');
  return risk.validateRiskReviewLedger(value.ledger, value.context);
}

test('v4 risk ledger covers all nine risks with four source-backed dispositions and no fake exploratory Claim', () => {
  const value = fixture(); assert.deepEqual(review(value), []);
  value.ledger.reverse(); assert.deepEqual(review(value), []);
});

test('v4 risk ledger rejects every missing risk, duplicate review, wrong basis and cross-branch result fields', () => {
  for (let index = 0; index < kinds.length; index++) {
    const value = fixture(); value.ledger.splice(index, 1);
    assert.ok(review(value).some((/** @type {any} */ item) => item.code === 'RISK_REVIEW_INCOMPLETE'));
  }
  for (const index of [0, 1, 2, 8]) {
    const wrongBasis = fixture(); wrongBasis.ledger[index].review_basis = { kind: 'note', reason: 'PRD 未提及' };
    assert.ok(review(wrongBasis).length);
    const extra = fixture(); extra.ledger[index].unexpected_result_ids = ['forged']; assert.ok(review(extra).length);
  }
  const duplicate = fixture(); duplicate.ledger.push(duplicate.ledger[0]); assert.ok(review(duplicate).length);
});

test('v4 risk ledger requires exact target identity, acceptance role and NotApplicable canonical basis', () => {
  for (const [index, field] of [[0, 'formal_test_point_ids'], [1, 'semantic_gap_ids'], [2, 'exploratory_ids'], [8, 'not_applicable_record_ids']]) {
    const value = fixture(); value.ledger[index][field] = ['MISSING']; assert.ok(review(value).length);
  }
  for (const mutate of [
    (/** @type {any} */ value) => { value.ledger[8].review_basis.claim_ids = ['CLM-different']; },
    (/** @type {any} */ value) => { value.ledger[8].acceptance_role = 'context_only'; },
    (/** @type {any} */ value) => { value.ledger[8].risk_kind = 'refresh'; },
    (/** @type {any} */ value) => { value.context.formal_test_points[0].module_id = 'other'; },
    (/** @type {any} */ value) => { value.context.semantic_gaps[0].missing_aspect = '另一个问题'; },
    (/** @type {any} */ value) => { value.context.exploratory[0].policy_version = '2'; }
  ]) { const value = fixture(); mutate(value); assert.ok(review(value).length); }
});
