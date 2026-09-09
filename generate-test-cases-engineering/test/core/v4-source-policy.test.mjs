import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from '../../src/canonical.mjs';

const moduleUrl = new URL('../../src/source-subjects-v4.mjs', import.meta.url);
const api = /** @type {any} */ (await import(moduleUrl.href).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
}));
/** @param {string} name @param {...any} args */
function call(name, ...args) { assert.equal(typeof api[name], 'function', name + ' is required'); return api[name](...args); }
function registry() { return call('createSourceSubjectRegistry', { scope_refs: ['scope1', 'scope2'], module_ids: ['module1', 'module2'], entity_types: ['review', 'order'] }); }
/** @param {any} [overrides] */
function descriptor(overrides = {}) { return { scope_ref: 'scope1', module_id: 'module1', entity_type: 'review', entity_key: 'cafe\u0301', field_path: '/source', condition: { source: 22, flags: [2, 1] }, ...overrides }; }
/** @param {any} [subject] */
const subjectKey = (subject = descriptor()) => call('canonicalSourceSubject', subject, registry()).subject_key;
/** @param {string|undefined} mode @param {any} [options] */
function fixture(mode, options = {}) {
  const claims = [
    { claim_id: 'C1', claim_form: 'direct', kind: 'requirement', source_id: 'S1', subject_descriptor: descriptor(), value: { enum: ['a', 'b'] } },
    { claim_id: 'C2', claim_form: 'direct', kind: 'requirement', source_id: 'S2', subject_descriptor: descriptor(), value: { enum: ['a', 'b'] } }
  ];
  const rule = { rule_id: 'R1', scope: 'review', status: 'effective', source_ids: ['S1', 'S2'],
    ...(mode === undefined ? {} : { composition_mode: mode }),
    rule_internal_conflict_review: [{ subject_key: subjectKey(), left_claim_id: 'C1', right_claim_id: 'C2', status: 'consistent' }], ...options };
  return { pack: { sources: [{ source_id: 'S1' }, { source_id: 'S2' }], source_policy: { rules: [rule] } }, claims, rule };
}
/** @param {any} f */
const resolve = f => call('resolveV4SourceComposition', f.pack, f.claims, registry());

test('T11 source subject identity is complete, typed, NFC and independent of object key order', () => {
  const first = call('canonicalSourceSubject', descriptor(), registry());
  assert.equal(first.subject_descriptor.entity_key, 'café');
  assert.equal(first.subject_key, 'sha256:' + digest(first.subject_descriptor));
  assert.equal(first.subject_key, subjectKey({ condition: { flags: [2, 1], source: 22 }, field_path: '/source', entity_key: 'café', entity_type: 'review', module_id: 'module1', scope_ref: 'scope1' }));
  for (const changed of [
    { scope_ref: 'scope2' }, { module_id: 'module2' }, { entity_type: 'order' }, { entity_key: 'other' },
    { field_path: '/other' }, { condition: { source: '22', flags: [2, 1] } }, { condition: { source: 22, flags: [1, 2] } }
  ]) assert.notEqual(subjectKey(descriptor(changed)), first.subject_key);
  assert.throws(() => subjectKey(descriptor({ module_id: 'unregistered' })), /SOURCE_SUBJECT_INVALID/);
  assert.throws(() => subjectKey(descriptor({ field_path: 'source' })), /SOURCE_SUBJECT_INVALID/);
  assert.throws(() => subjectKey(descriptor({ field_path: '/bad~2escape' })), /SOURCE_SUBJECT_INVALID/);
  assert.throws(() => subjectKey({ ...descriptor(), title: 'Do not identify by title' }), /SOURCE_SUBJECT_INVALID/);
});

test('T11 condition arrays preserve order unless the trusted condition Schema declares a set', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['roles'], properties: { roles: { type: 'array', uniqueItems: true, items: { type: 'string' } } } };
  const r = call('createSourceSubjectRegistry', { scope_refs: ['scope1'], module_ids: ['module1'], entity_types: ['review'], condition_schema: schema });
  const a = call('canonicalSourceSubject', descriptor({ condition: { roles: ['viewer', 'admin'] } }), r);
  const b = call('canonicalSourceSubject', descriptor({ condition: { roles: ['admin', 'viewer'] } }), r);
  assert.equal(a.subject_key, b.subject_key);
  assert.throws(() => call('canonicalSourceSubject', descriptor({ condition: { roles: ['admin'], extra: true } }), r), /SOURCE_SUBJECT_INVALID/);
  // Domain field names that happen to match the legacy compiler's set paths do not silently become sets.
  assert.notEqual(subjectKey(descriptor({ condition: { source_ids: ['B', 'A'] } })), subjectKey(descriptor({ condition: { source_ids: ['A', 'B'] } })));
});

test('T11 source-policy defaults to single_source and refuses a hidden second source', () => {
  const f = fixture(undefined); const invalid = resolve(f);
  assert.ok(invalid.diagnostics.some((/** @type {any} */ d) => d.code === 'SOURCE_COMPOSITION_SINGLE_SOURCE'));
  assert.deepEqual(invalid.effective_claim_ids, []);
  f.rule.source_ids = ['S1']; f.rule.rule_internal_conflict_review = []; f.claims.pop();
  assert.deepEqual(resolve(f).effective_claim_ids, ['C1']);
});

test('T11 merge_non_overlapping requires disjoint semantic subjects, not distinct natural-language titles', () => {
  const f = fixture('merge_non_overlapping');
  assert.ok(resolve(f).diagnostics.some((/** @type {any} */ d) => d.code === 'SOURCE_SUBJECT_OVERLAP'));
  f.claims[1].subject_descriptor.field_path = '/other'; f.rule.rule_internal_conflict_review = [];
  const result = resolve(f); assert.deepEqual(result.diagnostics, []); assert.deepEqual(result.effective_claim_ids, ['C1', 'C2']);
});

test('T11 consensus conflicting same-rule values produce exactly one stable source-conflict root', () => {
  const f = fixture('consensus');
  assert.deepEqual(resolve(f).effective_claim_ids, ['C1', 'C2']);
  f.claims[1].value = { enum: ['opposite'] }; f.rule.rule_internal_conflict_review[0].status = 'conflicted';
  const result = resolve(f);
  assert.equal(result.conflicts.length, 1); assert.deepEqual(result.effective_claim_ids, []);
  assert.equal(result.conflicts[0].subject_key, subjectKey());
  const root = result.conflicts[0].root_issue_id;
  f.claims.reverse(); f.rule.source_ids.reverse();
  assert.equal(resolve(f).conflicts[0].root_issue_id, root);
  f.rule.rule_internal_conflict_review[0].status = 'consistent';
  assert.ok(resolve(f).diagnostics.some((/** @type {any} */ d) => d.code === 'SOURCE_INTERNAL_REVIEW_INVALID'));
});

test('T11 priority_order needs complete strict ordering, explicit supersession and exact conflict audit', () => {
  const f = fixture('priority_order', { priority_order: ['S1', 'S2'] });
  f.claims[1].value = { enum: ['old'] };
  f.rule.rule_internal_conflict_review[0].status = 'conflicted';
  assert.equal(resolve(f).conflicts.length, 1);
  /** @type {any} */ (f.claims[1]).superseded_by = 'C1'; f.rule.rule_internal_conflict_review[0].status = 'superseded';
  const success = resolve(f);
  assert.deepEqual(success.diagnostics, []); assert.deepEqual(success.effective_claim_ids, ['C1']);
  assert.equal(success.audit[0].status, 'superseded');
  for (const order of [['S1'], ['S1', 'S1'], ['S1', 'missing']]) {
    f.rule.priority_order = order; assert.ok(resolve(f).diagnostics.some((/** @type {any} */ d) => d.code === 'SOURCE_PRIORITY_ORDER_INVALID'));
  }
});

test('T11 rule-internal reviews cover exact claim pairs and cannot fabricate consistency or supersession', () => {
  const f = fixture('consensus');
  for (const entries of [[], [f.rule.rule_internal_conflict_review[0], f.rule.rule_internal_conflict_review[0]], [{ ...f.rule.rule_internal_conflict_review[0], right_claim_id: 'UNKNOWN' }]]) {
    const bad = structuredClone(f); bad.rule = bad.pack.source_policy.rules[0]; bad.rule.rule_internal_conflict_review = entries;
    assert.ok(resolve(bad).diagnostics.some((/** @type {any} */ d) => d.code === 'SOURCE_INTERNAL_REVIEW_INVALID'));
  }
  f.rule.rule_internal_conflict_review[0].status = 'superseded';
  assert.ok(resolve(f).diagnostics.some((/** @type {any} */ d) => d.code === 'SOURCE_INTERNAL_REVIEW_INVALID'));
});

test('T11 a three-source priority rule keeps its explicit common winner without a false loser-pair conflict', () => {
  const f = fixture('priority_order', { priority_order: ['S1', 'S2', 'S3'] });
  f.pack.sources.push({ source_id: 'S3' }); f.rule.source_ids.push('S3');
  f.claims[1].value = { enum: ['old'] }; /** @type {any} */ (f.claims[1]).superseded_by = 'C1';
  f.claims.push(/** @type {any} */ ({ ...f.claims[1], claim_id: 'C3', source_id: 'S3', value: { enum: ['older'] }, superseded_by: 'C1' }));
  f.rule.rule_internal_conflict_review = [['C1', 'C2'], ['C1', 'C3'], ['C2', 'C3']].map(([left, right]) => ({ subject_key: subjectKey(), left_claim_id: left, right_claim_id: right, status: 'superseded' }));
  const result = resolve(f);
  assert.deepEqual(result.conflicts, []); assert.deepEqual(result.diagnostics, []); assert.deepEqual(result.effective_claim_ids, ['C1']);
});
