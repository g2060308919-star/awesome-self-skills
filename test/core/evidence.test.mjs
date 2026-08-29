import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { E2_TARGETS, validateEvidenceGraph } from '../../src/evidence.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digestA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** @param {string} relativePath */
async function fixture(relativePath) {
  return JSON.parse(await readFile(path.join(repositoryRoot, 'test/fixtures', relativePath), 'utf8'));
}

/** @param {'verified' | 'machine-extracted' | 'uncertain'} [integrity] @param {string} [kind] @returns {any} */
function sourcePack(integrity = 'verified', kind = 'prd') {
  return {
    schema_version: '1.0.0', source_revision: 0, run_scope: 'checkout',
    sources: [{ source_id: 'source_prd', kind, version: '1', status: 'effective', authority: 'owner', content: 'Rule', content_digest: digestA, scope: 'checkout' }],
    locators: [
      { locator_id: 'locator_rule', source_id: 'source_prd', type: 'text-range', text_range: { start: 0, end: 4 }, content_digest: digestA, extraction_integrity: integrity },
      { locator_id: 'locator_formula', source_id: 'source_prd', type: 'text-range', text_range: { start: 5, end: 9 }, content_digest: digestA, extraction_integrity: integrity }
    ],
    source_policy: { rules: [{ rule_id: 'rule_prd', source_ids: ['source_prd'], scope: 'checkout', authority: 'owner', status: 'effective' }] },
    decision_records: [], clarification_events: []
  };
}

/** @param {Record<string, unknown>} overrides */
function direct(overrides = {}) {
  return {
    claim_id: 'claim_root', claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout', value: 'approved',
    source_locator_ids: ['locator_rule'], source_id: 'source_prd', ...overrides
  };
}

/** @param {Record<string, unknown>} overrides */
function derived(overrides = {}) {
  return {
    claim_id: 'claim_e2', claim_form: 'derived', level: 'E2', kind: 'test-data', scope: 'checkout', value: '10', source_locator_ids: ['locator_rule'],
    derivation_kind: 'boundary-representative', derivation_target: 'test-data', parent_claim_ids: ['claim_root'], parameters: {}, rule_input: { lower: 1, upper: 10, inclusive: true },
    ...overrides
  };
}

/** @param {Array<Record<string, unknown>>} claims @returns {any} */
function artifact(claims) {
  return { schema_version: '1.0.0', source_revision: 0, claims, fact_ledger: [] };
}

test('evidence accepts verified authoritative E3 and a temporary Decision Record as E1', () => {
  const pack = sourcePack();
  pack.decision_records.push({
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: ['root_temp'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Temporary rule?', answer: 'Use manual review.', disposition: 'temporary',
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_rule', evidence_level: 'E1'
  });
  const claims = artifact([
    direct(),
    { claim_id: 'claim_temp', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout', value: 'Use manual review.', source_locator_ids: ['locator_rule'], decision_id: 'decision_temp', authority: 'checkout' }
  ]);

  const result = validateEvidenceGraph(pack, claims);

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual([...result.claimsById.keys()], ['claim_root', 'claim_temp']);
});

test('evidence rejects a Decision Record claim when the record evidence is dangling', () => {
  const pack = sourcePack();
  pack.decision_records.push({
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: ['root_temp'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Temporary rule?', answer: 'Use manual review.', disposition: 'temporary',
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_missing', evidence_level: 'E1'
  });
  const claim = { claim_id: 'claim_temp', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout', value: 'Use manual review.', source_locator_ids: ['locator_rule'], decision_id: 'decision_temp', authority: 'checkout' };

  const result = validateEvidenceGraph(pack, artifact([claim]));

  assert.equal(result.diagnostics.some((item) => item.code === 'DECISION_EVIDENCE_DANGLING'), true);
  assert.equal(result.claimsById.has('claim_temp'), false);
});

test('evidence rejects a final Decision Record claim outside declared authority scope', () => {
  const pack = sourcePack();
  pack.decision_records.push({
    decision_id: 'decision_final', question_id: 'question_final', root_issue_ids: ['root_final'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'shipping-owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Payment result?', answer: 'approved', disposition: 'final',
    authority_scope: 'checkout.shipping', effective_scope: 'checkout.payment', evidence_ref: 'locator_rule', evidence_level: 'E3'
  });
  const claim = { claim_id: 'claim_final', claim_form: 'decision-record', level: 'E3', kind: 'requirement', scope: 'checkout.payment', value: 'approved', source_locator_ids: ['locator_rule'], decision_id: 'decision_final', authority: 'checkout.shipping' };

  const result = validateEvidenceGraph(pack, artifact([claim]));

  assert.equal(result.diagnostics.some((item) => item.code === 'DECISION_AUTHORITY_SCOPE_MISMATCH'), true);
  assert.equal(result.claimsById.has('claim_final'), false);
});

test('evidence blocks uncertain extraction and diagnostic current behavior from E3', () => {
  const uncertain = validateEvidenceGraph(sourcePack('uncertain'), artifact([direct()]));
  assert.deepEqual(uncertain.diagnostics.map((item) => item.code), ['E3_EXTRACTION_UNCERTAIN']);
  assert.equal(uncertain.claimsById.has('claim_root'), false);

  const diagnostic = validateEvidenceGraph(sourcePack('verified', 'production-behavior'), artifact([direct({ kind: 'diagnostic' })]));
  assert.deepEqual(diagnostic.diagnostics.map((item) => item.code), ['SOURCE_KIND_NOT_NORMATIVE']);
  assert.equal(diagnostic.claimsById.has('claim_root'), false);
});

test('evidence freezes the exact derivation target matrix', () => {
  assert.deepEqual(E2_TARGETS, {
    formula: ['test-data', 'expected-value'],
    'decision-table-instance': ['expected-value', 'model-element'],
    'boundary-representative': ['test-data'],
    'enumeration-complement': ['test-data', 'model-element'],
    'graph-reachability': ['model-element']
  });
  assert.equal(Object.isFrozen(E2_TARGETS), true);
  assert.equal(Object.values(E2_TARGETS).every(Object.isFrozen), true);
});

test('evidence accepts only E2 derivations whose submitted value can be recomputed', async () => {
  const valid = await fixture('micro/evidence-valid.json');
  const accepted = validateEvidenceGraph(sourcePack(), valid);
  assert.deepEqual(accepted.diagnostics, []);
  assert.equal(accepted.claimsById.has('claim_total'), true);

  valid.claims[1].value = '999.00';
  const tampered = validateEvidenceGraph(sourcePack(), valid);
  assert.equal(tampered.diagnostics.some((item) => item.code === 'E2_VALUE_MISMATCH'), true);
  assert.equal(tampered.claimsById.has('claim_total'), false);
});

test('evidence accepts every allowed E2 target only with a recomputable rule input', () => {
  const formulaInput = {
    formula: 'subtotal + tax', inputs: [{ name: 'subtotal', value: 10 }, { name: 'tax', value: 2.5 }],
    unit: 'USD', precision: 2, rounding: 'half-up'
  };
  const cases = [
    { name: 'formula test data', parent: direct({ value: 'subtotal + tax' }), claim: derived({ derivation_kind: 'formula', derivation_target: 'test-data', kind: 'test-data', value: '12.50', rule_input: formulaInput }) },
    { name: 'formula expected value', parent: direct({ value: 'subtotal + tax' }), claim: derived({ derivation_kind: 'formula', derivation_target: 'expected-value', kind: 'expected-value', value: '12.50', rule_input: formulaInput }) },
    { name: 'decision expected value', parent: direct({ value: 'approved' }), claim: derived({ derivation_kind: 'decision-table-instance', derivation_target: 'expected-value', kind: 'expected-value', value: 'approved', rule_input: { conditions: ['paid'], outcome: 'approved' } }) },
    { name: 'decision model element', parent: direct({ value: 'approved' }), claim: derived({ derivation_kind: 'decision-table-instance', derivation_target: 'model-element', kind: 'model-element', value: 'approved', rule_input: { conditions: ['paid'], outcome: 'approved' } }) },
    { name: 'boundary test data', parent: direct(), claim: derived() },
    { name: 'enumeration test data', parent: direct(), claim: derived({ derivation_kind: 'enumeration-complement', derivation_target: 'test-data', kind: 'test-data', value: 'archived', rule_input: { enumerated_values: ['draft', 'saved'], closed_world: true } }) },
    { name: 'enumeration model element', parent: direct(), claim: derived({ derivation_kind: 'enumeration-complement', derivation_target: 'model-element', kind: 'model-element', value: 'archived', rule_input: { enumerated_values: ['draft', 'saved'], closed_world: true } }) },
    { name: 'graph model element', parent: direct({ value: 'draft->approved' }), claim: derived({ derivation_kind: 'graph-reachability', derivation_target: 'model-element', kind: 'model-element', value: 'draft->approved', rule_input: { from: 'draft', to: 'approved' } }) }
  ];

  for (const item of cases) {
    const result = validateEvidenceGraph(sourcePack(), artifact([item.parent, item.claim]));
    assert.deepEqual(result.diagnostics, [], item.name);
    assert.equal(result.claimsById.has('claim_e2'), true, item.name);
  }
});

test('evidence rejects dangling parents, cycles, and chains through E1 or E0', () => {
  const cases = [
    { name: 'dangling', claims: [direct(), derived({ parent_claim_ids: ['claim_missing'] })], code: 'E2_PARENT_DANGLING' },
    { name: 'cycle', claims: [derived({ claim_id: 'claim_a', parent_claim_ids: ['claim_b'] }), derived({ claim_id: 'claim_b', parent_claim_ids: ['claim_a'] })], code: 'E2_CYCLE' },
    { name: 'E1 parent', claims: [{ ...direct({ claim_id: 'claim_e1', claim_form: 'decision-record', level: 'E1', kind: 'assumption' }), decision_id: 'missing', authority: 'checkout' }, derived({ parent_claim_ids: ['claim_e1'] })], code: 'E2_PARENT_LEVEL_INVALID' },
    { name: 'E0 parent', claims: [direct({ claim_id: 'claim_e0', level: 'E0' }), derived({ parent_claim_ids: ['claim_e0'] })], code: 'E2_PARENT_LEVEL_INVALID' }
  ];

  for (const item of cases) {
    const result = validateEvidenceGraph(sourcePack(), artifact(item.claims));
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === item.code), true, item.name);
    assert.equal(result.claimsById.has('claim_e2'), false, item.name);
  }
});

test('evidence rejects every hand-derived E2 rule reversal', () => {
  const cases = [
    { name: 'boundary Oracle', claim: derived({ kind: 'expected-value', derivation_target: 'expected-value' }), code: 'E2_TARGET_NOT_ALLOWED' },
    { name: 'open enumeration', claim: derived({ derivation_kind: 'enumeration-complement', rule_input: { enumerated_values: ['draft', 'saved'], closed_world: false }, value: 'archived' }), code: 'E2_CLOSED_WORLD_REQUIRED' },
    { name: 'decision without outcome', claim: derived({ derivation_kind: 'decision-table-instance', kind: 'expected-value', derivation_target: 'expected-value', rule_input: { conditions: ['paid'] }, value: 'approved' }), code: 'E2_OUTCOME_REQUIRED' },
    { name: 'graph Oracle', claim: derived({ derivation_kind: 'graph-reachability', kind: 'expected-value', derivation_target: 'expected-value', rule_input: { from: 'draft', to: 'approved' }, value: 'reachable' }), code: 'E2_TARGET_NOT_ALLOWED' }
  ];

  for (const item of cases) {
    const result = validateEvidenceGraph(sourcePack(), artifact([direct(), item.claim]));
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === item.code), true, item.name);
    assert.equal(result.claimsById.has('claim_e2'), false, item.name);
  }
});

test('evidence requires a decision-table outcome to be explicitly backed by a parent', () => {
  const unbacked = derived({
    derivation_kind: 'decision-table-instance', kind: 'expected-value', derivation_target: 'expected-value', value: 'rejected',
    rule_input: { conditions: ['paid'], outcome: 'rejected' }
  });
  const result = validateEvidenceGraph(sourcePack(), artifact([direct(), unbacked]));
  assert.equal(result.diagnostics.some((item) => item.code === 'E2_OUTCOME_NOT_SOURCE_BACKED'), true);
  assert.equal(result.claimsById.has('claim_e2'), false);
});

test('evidence does not let E1 override an unresolved higher-evidence source conflict', async () => {
  const pack = await fixture('adversarial/source-conflict-local.json');
  pack.locators.push({ locator_id: 'locator_rule', source_id: 'source_payment_new', type: 'text-range', text_range: { start: 0, end: 4 }, content_digest: digestA, extraction_integrity: 'verified' });
  pack.decision_records.push({
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: ['root_payment'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Temporary settlement?', answer: 'Use two days.', disposition: 'temporary',
    authority_scope: 'checkout.payment', effective_scope: 'checkout.payment', evidence_ref: 'locator_rule', evidence_level: 'E1'
  });
  const claim = { claim_id: 'claim_temp', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout.payment', value: 'Use two days.', source_locator_ids: ['locator_rule'], decision_id: 'decision_temp', authority: 'checkout.payment' };

  const result = validateEvidenceGraph(pack, artifact([claim]));

  assert.equal(result.diagnostics.some((item) => item.code === 'E1_CANNOT_OVERRIDE_CONFLICT'), true);
  assert.equal(result.claimsById.has('claim_temp'), false);
});

test('evidence does not let E1 override a conflicted fact backed by E3 claims', () => {
  const pack = sourcePack();
  pack.sources.push({ source_id: 'source_rule', kind: 'formal-rule', version: '1', status: 'effective', authority: 'owner', content: 'Rejected', content_digest: 'b'.repeat(64), scope: 'checkout' });
  pack.locators.push({ locator_id: 'locator_second', source_id: 'source_rule', type: 'text-range', text_range: { start: 0, end: 8 }, content_digest: 'b'.repeat(64), extraction_integrity: 'verified' });
  pack.source_policy.rules[0].source_ids.push('source_rule');
  pack.decision_records.push({
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: ['root_result'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Temporary result?', answer: 'Use approved.', disposition: 'temporary',
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_rule', evidence_level: 'E1'
  });
  const first = direct({ claim_id: 'claim_approved', value: 'approved' });
  const second = direct({ claim_id: 'claim_rejected', value: 'rejected', source_id: 'source_rule', source_locator_ids: ['locator_second'] });
  const temporary = { claim_id: 'claim_temp', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout', value: 'Use approved.', source_locator_ids: ['locator_rule'], decision_id: 'decision_temp', authority: 'checkout' };
  const claims = artifact([first, second, temporary]);
  claims.fact_ledger.push({ fact_id: 'fact_result', claim_id: 'claim_approved', status: 'conflicted', source_claim_ids: ['claim_approved', 'claim_rejected'] });

  const result = validateEvidenceGraph(pack, claims);

  assert.equal(result.diagnostics.some((item) => item.code === 'E1_CANNOT_OVERRIDE_CONFLICT'), true);
  assert.equal(result.claimsById.has('claim_temp'), false);
  assert.equal(result.claimsById.has('claim_approved'), true);
  assert.equal(result.claimsById.has('claim_rejected'), true);
});
