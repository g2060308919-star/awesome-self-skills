import test from 'node:test';
import assert from 'node:assert/strict';
import { assertClarificationWriteTargetsV4 } from '../../src/clarification-targets-v4.mjs';
import { compileV4DecisionEvidenceOverlay } from '../../src/evidence.mjs';
import { reliabilityFixture } from '../helpers/v4-reliability-fixture.mjs';

/** @param {string} id @param {string[]} claims @param {string} [status] */
const fact = (id, claims, status = 'ambiguous') => ({ fact_id: id, claim_ids: claims, status });
/** @param {string} id @param {string[]} facts */
const root = (id, facts) => ({ root_issue_id: id, subject_fact_ids: facts, source_claim_ids: ['background'] });
const claims = ['c1', 'c2', 'c3', 'background'].map(claim_id => ({ claim_id }));
test('T03 shared Claim diagnostics identify the target, both roots and the actual conflict', () => {
  assert.throws(() => assertClarificationWriteTargetsV4([fact('f1', ['c1']), fact('f2', ['c1'])],
    claims, [root('r1', ['f1']), root('r2', ['f2'])]), (/** @type {any} */ error) => {
    assert.equal(error.message, 'CLARIFICATION_WRITE_CLAIM_SHARED');
    assert.equal(error.diagnostic.path, '/semantic_gaps');
    for (const id of ['c1', 'r1', 'r2', 'f1', 'f2']) assert.ok(error.diagnostic.message.includes(id));
    return true;
  });
});
for (const order of ['forward', 'reverse']) {
  for (const [name, facts, roots, code] of /** @type {Array<[string,any[],any[],string]>} */ ([
    ['active', [fact('f1', ['c1'], 'active')], [root('r1', ['f1'])], 'TARGET_FACT_NOT_AMBIGUOUS'],
    ['unknown', [], [root('r1', ['missing'])], 'TARGET_FACT_UNKNOWN'],
    ['Fact overlap', [fact('f1', ['c1'])], [root('r1', ['f1']), root('r2', ['f1'])], 'WRITE_FACT_SHARED'],
    ['Claim overlap', [fact('f1', ['c1']), fact('f2', ['c1'])], [root('r1', ['f1']), root('r2', ['f2'])], 'WRITE_CLAIM_SHARED'],
    ['partial same-root sets', [fact('f1', ['c1','c2']), fact('f2', ['c2','c3'])], [root('r1', ['f1','f2'])], 'WRITE_CLAIM_PARTIAL_OVERLAP'],
    ['non-target known rule', [fact('f1', ['c1']), fact('known', ['c1'], 'active')], [root('r1', ['f1'])], 'WRITE_NON_TARGET_FACT']
  ])) test(`T01-T05 ${name} rejected ${order} without mutation`, () => {
    const before = structuredClone({ facts, roots });
    assert.throws(() => assertClarificationWriteTargetsV4(order === 'reverse' ? [...facts].reverse() : facts,
      claims, order === 'reverse' ? [...roots].reverse() : roots), new RegExp(`CLARIFICATION_${code}`));
    assert.deepEqual({ facts, roots }, before);
  });
}
for (const sameGroup of [false, true]) test(`T04-T05 readonly context and ${sameGroup ? 'exact' : 'independent'} Claim groups remain valid`, () => {
  const facts = [fact('f1', ['c1']), fact('f2', sameGroup ? ['c1'] : ['c2']), fact('known', ['background'], 'active')];
  assert.doesNotThrow(() => assertClarificationWriteTargetsV4(facts, claims, [root('r1', ['f1','f2'])]));
  if (!sameGroup) assert.doesNotThrow(() => assertClarificationWriteTargetsV4(facts, claims, [root('r1', ['f1']), root('r2', ['f2'])]));
});

test('T06 completing an unknown reopening rule preserves known cancel and required-name Facts and Claims', () => {
  const evidence = reliabilityFixture('RUN-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa').artifacts.evidence_claims;
  const sample = evidence.claims[0];
  evidence.claims = ['cancel', 'reopen', 'required'].map((id, i) => ({ ...structuredClone(sample),
    claim_id: id, value: ['取消关闭表单', '重新打开后数据规则未定义', '名称必填'][i], superseded_by: undefined }));
  evidence.fact_ledger = evidence.claims.map((/** @type {any} */ claim, /** @type {number} */ i) => ({ fact_id: `f${i}`, statement: claim.value,
    claim_ids: [claim.claim_id], status: i === 1 ? 'ambiguous' : 'active' }));
  for (const claim of evidence.claims) delete claim.superseded_by;
  const before = structuredClone(evidence);
  assertClarificationWriteTargetsV4(evidence.fact_ledger, evidence.claims, [root('reopen', ['f1'])]);
  const result = /** @type {any} */ (compileV4DecisionEvidenceOverlay(evidence, [{ decision_id: 'DEC-reopen',
    target: { root_issue_id: 'reopen', root_version_digest: 'sha256:' + '1'.repeat(64) },
    subject_fact_ids: ['f1'], evidence_level: 'E3', answer: '重新打开时清空未提交内容', authority: 'product_final' }],
  [{ root_issue_id: 'reopen', root_version_digest: 'sha256:' + '1'.repeat(64), source_locator_id: 'LOC-user' }]));
  for (const index of [0,2]) {
    assert.deepEqual(result.evidence.fact_ledger[index], before.fact_ledger[index]);
    assert.deepEqual(result.evidence.claims[index], before.claims[index]);
  }
  assert.equal(result.evidence.fact_ledger[1].status, 'active');
  assert.deepEqual(evidence, before);
});
