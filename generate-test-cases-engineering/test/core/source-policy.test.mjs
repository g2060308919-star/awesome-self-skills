import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stableId } from '../../src/canonical.mjs';
import { normalizeScope } from '../../src/decision-record.mjs';
import { resolveSourcePolicy } from '../../src/source-policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string} relativePath */
async function fixture(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures', relativePath), 'utf8'));
}

function paymentConflictRootId() {
  return stableId('root', {
    missing_type: 'source-conflict',
    rule_ids: ['rule_payment_new', 'rule_payment_old'],
    scope: 'checkout.payment',
    source_ids: ['source_payment_new', 'source_payment_old']
  });
}

test('source policy isolates an absent-supersedes conflict to its intersecting scope', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0], {
    conflict_id: 'source_conflict_8d43da2c21f3048f',
    root_issue_id: paymentConflictRootId(),
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

test('source policy carries scoped precedence through a valid inactive intermediate rule', () => {
  const sourcePack = {
    sources: [
      { source_id: 'source_new', status: 'effective' },
      { source_id: 'source_middle', status: 'superseded' },
      { source_id: 'source_old', status: 'effective' }
    ],
    locators: [], decision_records: [],
    source_policy: { rules: [
      { rule_id: 'rule_new', source_ids: ['source_new'], supersedes: ['rule_middle'], scope: 'checkout.payment', authority: 'owner', status: 'effective' },
      { rule_id: 'rule_middle', source_ids: ['source_middle'], supersedes: ['rule_old'], scope: 'checkout.payment', authority: 'owner', status: 'superseded' },
      { rule_id: 'rule_old', source_ids: ['source_old'], scope: 'checkout.payment', authority: 'owner', status: 'effective' }
    ] }
  };

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.effectiveClaims.map((claim) => claim.claim_id), ['rule_new']);
});

test('source policy does not carry precedence through a dangling inactive intermediate rule', () => {
  const sourcePack = {
    sources: [
      { source_id: 'source_new', status: 'effective' },
      { source_id: 'source_middle', status: 'superseded' },
      { source_id: 'source_old', status: 'effective' }
    ],
    locators: [], decision_records: [],
    source_policy: { rules: [
      { rule_id: 'rule_new', source_ids: ['source_new'], supersedes: ['rule_middle'], scope: 'checkout.payment', authority: 'owner', status: 'effective' },
      { rule_id: 'rule_middle', source_ids: ['source_middle'], supersedes: ['rule_old', 'rule_missing'], scope: 'checkout.payment', authority: 'owner', status: 'superseded' },
      { rule_id: 'rule_old', source_ids: ['source_old'], scope: 'checkout.payment', authority: 'owner', status: 'effective' }
    ] }
  };

  const result = resolveSourcePolicy(sourcePack);

  assert.equal(result.diagnostics.some((entry) => entry.code === 'SOURCE_POLICY_SUPERSEDES_DANGLING'), true);
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.effectiveClaims, []);
});

test('source policy does not carry precedence through an intermediate scope that excludes the queried scope', () => {
  for (const intermediateScope of ['checkout.shipping', 'checkout.payment.card']) {
    const sourcePack = {
      sources: [
        { source_id: 'source_new', status: 'effective' },
        { source_id: 'source_middle', status: 'superseded' },
        { source_id: 'source_old', status: 'effective' }
      ],
      locators: [], decision_records: [],
      source_policy: { rules: [
        { rule_id: 'rule_new', source_ids: ['source_new'], supersedes: ['rule_middle'], scope: 'checkout.payment', authority: 'owner', status: 'effective' },
        { rule_id: 'rule_middle', source_ids: ['source_middle'], supersedes: ['rule_old'], scope: intermediateScope, authority: 'owner', status: 'superseded' },
        { rule_id: 'rule_old', source_ids: ['source_old'], scope: 'checkout.payment', authority: 'owner', status: 'effective' }
      ] }
    };

    const result = resolveSourcePolicy(sourcePack);

    assert.equal(result.conflicts.length, 1, intermediateScope);
    assert.equal(result.conflicts[0].scope, 'checkout.payment', intermediateScope);
    assert.deepEqual(result.effectiveClaims, [], intermediateScope);
  }
});

test('source policy retains a broad superseded rule outside the newer narrow scope', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-superseded.json');
  sourcePack.sources[0].status = 'effective';
  sourcePack.sources[0].scope = 'checkout';
  sourcePack.source_policy.rules[0].status = 'effective';
  sourcePack.source_policy.rules[0].scope = 'checkout';

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.effectiveClaims, [
    { claim_id: 'rule_payment_new', claim_form: 'source-policy', source_ids: ['source_payment_new'], scope: 'checkout.payment', authority: 'payments-owner', excluded_scopes: [] },
    { claim_id: 'rule_payment_old', claim_form: 'source-policy', source_ids: ['source_payment_old'], scope: 'checkout', authority: 'payments-owner', excluded_scopes: ['checkout.payment'] }
  ]);
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

test('source policy preserves unrelated effective rules beside malformed graph components', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');
  sourcePack.source_policy.rules[0].supersedes = ['rule_payment_new'];
  sourcePack.source_policy.rules[1].supersedes = ['rule_payment_old'];

  const cyclic = resolveSourcePolicy(sourcePack);
  assert.equal(cyclic.diagnostics.some((item) => item.code === 'SOURCE_POLICY_CYCLE'), true);
  assert.deepEqual(cyclic.effectiveClaims.map((claim) => claim.claim_id), ['rule_shipping']);

  delete sourcePack.source_policy.rules[0].supersedes;
  sourcePack.source_policy.rules[1].supersedes = ['rule_missing'];
  const dangling = resolveSourcePolicy(sourcePack);
  assert.equal(dangling.diagnostics.some((item) => item.code === 'SOURCE_POLICY_SUPERSEDES_DANGLING'), true);
  assert.deepEqual(dangling.effectiveClaims.map((claim) => claim.claim_id), ['rule_shipping']);
});

test('source policy accepts only a scoped final Decision Record as automatic conflict resolution', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');
  sourcePack.locators.push({
    locator_id: 'locator_decision', source_id: 'source_payment_new', type: 'text-range', text_range: { start: 0, end: 8 },
    content_digest: 'b'.repeat(64), extraction_integrity: 'verified'
  });
  sourcePack.decision_records.push({
    decision_id: 'decision_payment', question_id: 'question_payment', root_issue_ids: [paymentConflictRootId()], affected_obligation_ids: [],
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

test('source policy requires a final decision to name the specific conflict root issue', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-local.json');
  sourcePack.locators.push({
    locator_id: 'locator_decision', source_id: 'source_payment_new', type: 'text-range', text_range: { start: 0, end: 8 },
    content_digest: 'b'.repeat(64), extraction_integrity: 'verified'
  });
  sourcePack.decision_records.push({
    decision_id: 'decision_shipping', question_id: 'question_shipping', root_issue_ids: ['root_shipping'], affected_obligation_ids: [],
    clarification_event_seq: 1, confirmer: 'payments-owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Shipping?', answer: 'Use two days.',
    disposition: 'final', authority_scope: 'checkout', effective_scope: 'checkout.payment', evidence_ref: 'locator_decision', evidence_level: 'E3'
  });

  const result = resolveSourcePolicy(sourcePack);

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0].root_issue_id, paymentConflictRootId());
  assert.equal(result.effectiveClaims.some((claim) => claim.claim_id === 'decision_shipping'), true);
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

test('source policy validates every locator source even when the locator is unused', async () => {
  const sourcePack = await fixture('adversarial/source-conflict-superseded.json');
  sourcePack.locators.push({
    locator_id: 'locator_unused', source_id: 'source_missing', type: 'text-range', text_range: { start: 0, end: 1 },
    content_digest: 'd'.repeat(64), extraction_integrity: 'verified'
  });

  const result = resolveSourcePolicy(sourcePack);

  assert.equal(result.diagnostics.some((item) => item.code === 'LOCATOR_SOURCE_DANGLING' && item.path === '/locators/0/source_id'), true);
});

test('source policy handles a reversed 5000-rule supersedes chain without recursion failure', () => {
  const count = 5000;
  const sources = Array.from({ length: count }, (_, index) => ({
    source_id: `source_${index}`, kind: 'formal-rule', version: String(index), status: 'effective', authority: 'owner',
    content: `Rule ${index}`, content_digest: index.toString(16).padStart(64, '0'), scope: 'checkout'
  }));
  const rules = Array.from({ length: count }, (_, index) => ({
    rule_id: `rule_${index}`, source_ids: [`source_${index}`], ...(index === 0 ? {} : { supersedes: [`rule_${index - 1}`] }),
    scope: 'checkout', authority: 'owner', status: 'effective'
  }));
  const sourcePack = {
    schema_version: '2.1.0', source_revision: 0, run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout', sources, locators: [],
    source_policy: { rules: [...rules].reverse() }, decision_records: [], clarification_events: [], execution_events: []
  };

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.effectiveClaims.map((claim) => claim.claim_id), ['rule_4999']);
});

test('source policy uses sparse scoped reachability for a high-fanout inactive graph', { timeout: 3000 }, () => {
  const bridgeCount = 15000;
  const bridgeIds = Array.from({ length: bridgeCount }, (_, index) => `rule_bridge_${index}`);
  const sourcePack = {
    sources: [
      { source_id: 'source_new', status: 'effective' },
      { source_id: 'source_bridge', status: 'superseded' },
      { source_id: 'source_old', status: 'effective' }
    ],
    locators: [], decision_records: [],
    source_policy: { rules: [
      { rule_id: 'rule_new', source_ids: ['source_new'], supersedes: bridgeIds, scope: 'checkout', authority: 'owner', status: 'effective' },
      ...bridgeIds.map((ruleId, index) => ({
        rule_id: ruleId, source_ids: ['source_bridge'], ...(index === bridgeCount - 1 ? { supersedes: ['rule_old'] } : {}),
        scope: 'checkout', authority: 'owner', status: 'superseded'
      })),
      { rule_id: 'rule_old', source_ids: ['source_old'], scope: 'checkout', authority: 'owner', status: 'effective' }
    ] }
  };

  const result = resolveSourcePolicy(sourcePack);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.effectiveClaims.map((claim) => claim.claim_id), ['rule_new']);
});

test('source policy canonicalizes universal scopes before conflict identity and Decision resolution', () => {
  assert.equal(normalizeScope(' all '), '*');
  assert.equal(normalizeScope(' * '), '*');
  assert.equal(normalizeScope(' checkout.payment '), 'checkout.payment');

  const canonicalRoot = stableId('root', {
    missing_type: 'source-conflict',
    rule_ids: ['rule_alpha', 'rule_beta'],
    scope: '*',
    source_ids: ['source_alpha', 'source_beta']
  });
  /** @param {boolean} reversed @returns {any} */
  const makePack = (reversed) => {
    const rules = [
      { rule_id: 'rule_alpha', source_ids: ['source_alpha'], scope: ' all ', authority: 'owner', status: 'effective' },
      { rule_id: 'rule_beta', source_ids: ['source_beta'], scope: ' * ', authority: 'owner', status: 'effective' }
    ];
    return {
      sources: [
        { source_id: 'source_alpha', status: 'effective' },
        { source_id: 'source_beta', status: 'effective' }
      ],
      locators: [{ locator_id: 'locator_decision', source_id: 'source_alpha', extraction_integrity: 'verified' }],
      source_policy: { rules: reversed ? [...rules].reverse() : rules },
      decision_records: []
    };
  };

  const forwardPack = makePack(false);
  const reversedPack = makePack(true);
  const forward = resolveSourcePolicy(forwardPack);
  const reversed = resolveSourcePolicy(reversedPack);

  assert.equal(forward.conflicts[0].scope, '*');
  assert.equal(forward.conflicts[0].root_issue_id, canonicalRoot);
  assert.equal(forward.conflicts[0].conflict_id, reversed.conflicts[0].conflict_id);
  assert.equal(forward.conflicts[0].root_issue_id, reversed.conflicts[0].root_issue_id);

  for (const pack of [forwardPack, reversedPack]) {
    pack.decision_records.push({
      decision_id: 'decision_global', question_id: 'question_global', root_issue_ids: [canonicalRoot], affected_obligation_ids: [], clarification_event_seq: 1,
      confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Which rule applies?', answer: 'Use alpha.', disposition: 'final',
      authority_scope: ' all ', effective_scope: ' * ', evidence_ref: 'locator_decision', evidence_level: 'E3'
    });
    const resolved = resolveSourcePolicy(pack);
    assert.deepEqual(resolved.conflicts, []);
    assert.deepEqual(resolved.effectiveClaims, [{
      claim_id: 'decision_global', claim_form: 'decision-record', source_ids: [], scope: '*', authority: '*'
    }]);
  }
});
