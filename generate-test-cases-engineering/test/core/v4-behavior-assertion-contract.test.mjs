import assert from 'node:assert/strict';
import test from 'node:test';

import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { deriveV4SystemContext } from '../../src/v4-system-context.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

/** @param {(claim:any, evidence:any) => void} mutate */
function evaluate(mutate) {
  const fixture = v4GeneralQualityFixture();
  const evidence = fixture.artifacts.evidence_claims;
  mutate(evidence.claims[0], evidence);
  const system = deriveV4SystemContext(fixture.artifacts);
  return {
    diagnostics: system.behavior_evidence.diagnostics,
    result: compileCaseDocumentRevisionV4(fixture.artifacts, system)
  };
}

test('4.3 behavior assertions form a closed, deterministic Evidence contract', () => {
  const fixture = v4GeneralQualityFixture();
  const first = deriveV4SystemContext(fixture.artifacts).behavior_evidence;
  const second = deriveV4SystemContext(structuredClone(fixture.artifacts)).behavior_evidence;
  assert.deepEqual(first.diagnostics, []);
  assert.deepEqual(second, first);
});

test('4.3 behavior assertions reject malformed families and items at Evidence', () => {
  for (const [mutate, code] of [
    [(/** @type {any} */ claim) => { claim.semantic_value.behavior_assertions = {}; }, 'BEHAVIOR_ASSERTIONS_ARRAY_REQUIRED'],
    [(/** @type {any} */ claim) => { claim.semantic_value.behavior_assertions[0].extra = true; }, 'BEHAVIOR_ASSERTION_SHAPE_INVALID'],
    [(/** @type {any} */ claim) => { claim.semantic_value.behavior_assertions[0].fact_id = ' '; }, 'BEHAVIOR_ASSERTION_FACT_INVALID'],
    [(/** @type {any} */ claim) => { claim.semantic_value.behavior_assertions[0].field_path = '/partitions/00/value'; }, 'BEHAVIOR_ASSERTION_FIELD_PATH_INVALID'],
    [(/** @type {any} */ claim) => { claim.semantic_value.behavior_assertions[0].field_path = '/title'; }, 'BEHAVIOR_ASSERTION_FIELD_PATH_INVALID'],
    [(/** @type {any} */ claim) => { claim.semantic_value.behavior_assertions[0].fact_id = 'FACT-missing'; }, 'BEHAVIOR_ASSERTION_FACT_UNRESOLVED']
  ]) {
    const checked = evaluate(/** @type {any} */ (mutate));
    assert.ok(checked.diagnostics.some((item) => item.code === code), JSON.stringify(checked.diagnostics));
    assert.equal(checked.result.status, 'need_revision', JSON.stringify(checked.result));
    assert.equal(checked.result.stage, 'evidence_claims');
  }
});

test('4.3 behavior assertions require exact Claim-to-Fact ownership', () => {
  const checked = evaluate((claim, evidence) => {
    evidence.fact_ledger[0].claim_ids = ['CLM-other'];
    claim.semantic_value.behavior_assertions[0].fact_id = evidence.fact_ledger[0].fact_id;
  });
  assert.ok(checked.diagnostics.some((item) => item.code === 'BEHAVIOR_ASSERTION_FACT_CLAIM_MISMATCH'));
  assert.equal(checked.result.status, 'need_revision');
  assert.equal(checked.result.stage, 'evidence_claims');
});

test('4.3 behavior assertions reject duplicate and conflicting values for one Claim field', () => {
  for (const [value, code] of [
    ['订单进入已接受状态', 'BEHAVIOR_ASSERTION_DUPLICATE'],
    ['订单进入已拒绝状态', 'BEHAVIOR_ASSERTION_CONFLICT']
  ]) {
    const checked = evaluate((claim) => {
      claim.semantic_value.behavior_assertions.push({
        fact_id: claim.semantic_value.behavior_assertions[0].fact_id,
        field_path: claim.semantic_value.behavior_assertions[0].field_path,
        value
      });
    });
    assert.ok(checked.diagnostics.some((item) => item.code === code), JSON.stringify(checked.diagnostics));
    assert.equal(checked.result.status, 'need_revision');
    assert.equal(checked.result.stage, 'evidence_claims');
  }
});

test('legacy 4.0 behavior assertion filtering remains byte-compatible', () => {
  const fixture = v4GeneralQualityFixture();
  for (const artifact of Object.values(fixture.artifacts)) artifact.schema_version = '4.0.0';
  delete fixture.artifacts.behavior_views.design_assurance;
  delete fixture.artifacts.case_drafts.independent_review;
  fixture.artifacts.evidence_claims.claims[0].semantic_value.behavior_assertions.push({ invalid: true });
  const behavior = deriveV4SystemContext(fixture.artifacts).behavior_evidence;
  assert.deepEqual(behavior.diagnostics, []);
  assert.equal(behavior.claims[0].assertions.length, 3);
});
