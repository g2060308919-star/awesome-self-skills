import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveSourcePolicy } from '../../src/source-policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} relativePath */
async function fixture(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures', relativePath), 'utf8'));
}

test('source policy isolates an absent-supersedes conflict to its intersecting scope', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0], {
    conflict_id: 'source_conflict_8d43da2c21f3048f',
    scope: 'checkout.payment',
    rule_ids: ['rule_payment_new', 'rule_payment_old'],
    source_ids: ['source_payment_new', 'source_payment_old']
  });
  assert.deepEqual(result.effectiveClaims.map((claim) => claim.claim_id), ['rule_shipping']);
});

test('source policy preserves a broader rule outside a narrow conflict intersection', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');
  sourcePack.sources = sourcePack.sources.slice(0, 2);
  sourcePack.source_policy.rules = sourcePack.source_policy.rules.slice(0, 2);
  sourcePack.source_policy.rules[0].scope = 'checkout';

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.conflicts.map((conflict) => conflict.scope), ['checkout.payment']);
  assert.deepEqual(result.effectiveClaims, [{
    claim_id: 'rule_payment_old', claim_form: 'source-policy', source_ids: ['source_payment_old'],
    scope: 'checkout', authority: 'payments-owner', excluded_scopes: ['checkout.payment']
  }]);
});

test('source policy applies explicit supersedes without using document recency as precedence', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-superseded.json');

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.effectiveClaims.map((claim) => claim.claim_id), ['rule_payment_new']);
});

test('source policy reports dangling supersedes and cycles rather than guessing precedence', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-superseded.json');
  sourcePack.source_policy.rules[1].supersedes = ['rule_missing'];
  const dangling = resolveSourcePolicy(sourcePack);
  assert.deepEqual(dangling.diagnostics.map((item) => item.code), ['SOURCE_POLICY_SUPERSEDES_DANGLING']);

  sourcePack.source_policy.rules[0].status = 'effective';
  sourcePack.source_policy.rules[0].supersedes = ['rule_payment_new'];
  sourcePack.source_policy.rules[1].supersedes = ['rule_payment_old'];
  const cyclic = resolveSourcePolicy(sourcePack);
  assert.equal(cyclic.diagnostics.some((item) => item.code === 'SOURCE_POLICY_CYCLE'), true);
  assert.deepEqual(cyclic.effectiveClaims, []);
});

test('source policy accepts only a scoped final Decision Record as automatic conflict resolution', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');
  sourcePack.locators.push({
    locator_id: 'locator_decision', source_id: 'source_payment_new', type: 'text-range', text_range: { start: 0, end: 8 },
    content_digest: 'b'.repeat(64), extraction_integrity: 'verified'
  });
  sourcePack.decision_records.push({
    decision_id: 'decision_payment', question_id: 'question_payment', root_issue_ids: ['root_payment'], affected_obligation_ids: [],
    clarification_event_seq: 1, confirmer: 'payments-owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Which settlement rule applies?', answer: 'Use two days.',
    disposition: 'final', authority_scope: 'checkout.payment', effective_scope: 'checkout.payment', evidence_ref: 'locator_decision', evidence_level: 'E3'
  });

  const resolved = resolveSourcePolicy(sourcePack);
  assert.deepEqual(resolved.conflicts, []);
  assert.deepEqual(resolved.effectiveClaims.map((claim) => claim.claim_id), ['decision_payment', 'rule_shipping']);

  sourcePack.decision_records[0].disposition = 'temporary';
  sourcePack.decision_records[0].evidence_level = 'E1';
  const temporary = resolveSourcePolicy(sourcePack);
  assert.equal(temporary.conflicts.length, 1);
  assert.equal(temporary.effectiveClaims.some((claim) => claim.claim_id === 'decision_payment'), false);
});

test('source policy refuses a final Decision Record with dangling evidence', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');
  sourcePack.decision_records.push({
    decision_id: 'decision_payment', question_id: 'question_payment', root_issue_ids: ['root_payment'], affected_obligation_ids: [],
    clarification_event_seq: 1, confirmer: 'payments-owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Which settlement rule applies?', answer: 'Use two days.',
    disposition: 'final', authority_scope: 'checkout.payment', effective_scope: 'checkout.payment', evidence_ref: 'locator_missing', evidence_level: 'E3'
  });

  const result = resolveSourcePolicy(sourcePack);

  assert.equal(result.diagnostics.some((item) => item.code === 'DECISION_EVIDENCE_DANGLING'), true);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.effectiveClaims.some((claim) => claim.claim_id === 'decision_payment'), false);
});

test('source policy does not apply a Decision Record outside its declared authority scope', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');
  sourcePack.locators.push({
    locator_id: 'locator_decision', source_id: 'source_payment_new', type: 'text-range', text_range: { start: 0, end: 8 },
    content_digest: 'b'.repeat(64), extraction_integrity: 'verified'
  });
  sourcePack.decision_records.push({
    decision_id: 'decision_payment', question_id: 'question_payment', root_issue_ids: ['root_payment'], affected_obligation_ids: [],
    clarification_event_seq: 1, confirmer: 'shipping-owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Which settlement rule applies?', answer: 'Use two days.',
    disposition: 'final', authority_scope: 'checkout.shipping', effective_scope: 'checkout.payment', evidence_ref: 'locator_decision', evidence_level: 'E3'
  });

  const result = resolveSourcePolicy(sourcePack);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.effectiveClaims.some((claim) => claim.claim_id === 'decision_payment'), false);
});
