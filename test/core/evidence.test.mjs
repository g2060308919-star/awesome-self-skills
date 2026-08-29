import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stableId } from '../../src/canonical.mjs';
import { E2_TARGETS, validateEvidenceGraph } from '../../src/evidence.mjs';
import { resolveSourcePolicy } from '../../src/source-policy.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digestA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function paymentConflictRootId() {
  return stableId('root', {
    missing_type: 'source-conflict',
    rule_ids: ['rule_payment_new', 'rule_payment_old'],
    scope: 'checkout.payment',
    source_ids: ['source_payment_new', 'source_payment_old']
  });
}

function factResultConflictRootId() {
  return stableId('root', {
    missing_type: 'fact-conflict',
    fact_id: 'fact_result',
    source_claim_ids: ['claim_approved', 'claim_rejected'],
    scope: 'checkout'
  });
}

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

/** @param {'final' | 'temporary'} disposition @returns {any} */
function decisionRecord(disposition) {
  return {
    decision_id: 'decision_review', question_id: 'question_review', root_issue_ids: ['root_review'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Result?', answer: 'approved', disposition,
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_rule', evidence_level: disposition === 'final' ? 'E3' : 'E1'
  };
}

/** @param {'final' | 'temporary'} disposition @returns {any} */
function decisionClaim(disposition) {
  return {
    claim_id: 'claim_decision', claim_form: 'decision-record', level: disposition === 'final' ? 'E3' : 'E1',
    kind: disposition === 'final' ? 'requirement' : 'assumption', scope: 'checkout', value: 'approved', source_locator_ids: ['locator_rule'],
    decision_id: 'decision_review', authority: 'checkout'
  };
}

/** @param {string} family @returns {{parent: any, claim: any}} */
function derivationFamily(family) {
  if (family === 'formula') return {
    parent: direct({ value: 'subtotal + tax', scope: 'checkout.payment' }),
    claim: derived({ derivation_kind: 'formula', derivation_target: 'expected-value', kind: 'expected-value', scope: 'checkout.payment', value: '12.50',
      rule_input: { formula: 'subtotal + tax', inputs: [{ name: 'subtotal', value: 10 }, { name: 'tax', value: 2.5 }], unit: 'USD', precision: 2, rounding: 'half-up' } })
  };
  if (family === 'decision-table-instance') return {
    parent: direct({ value: 'approved', scope: 'checkout.payment' }),
    claim: derived({ derivation_kind: family, derivation_target: 'expected-value', kind: 'expected-value', scope: 'checkout.payment', value: 'approved', rule_input: { conditions: ['paid'], outcome: 'approved' } })
  };
  if (family === 'enumeration-complement') return {
    parent: direct({ scope: 'checkout.payment' }),
    claim: derived({ derivation_kind: family, scope: 'checkout.payment', value: 'archived', rule_input: { enumerated_values: ['draft', 'saved'], closed_world: true } })
  };
  if (family === 'graph-reachability') return {
    parent: direct({ value: 'draft->approved', scope: 'checkout.payment' }),
    claim: derived({ derivation_kind: family, derivation_target: 'model-element', kind: 'model-element', scope: 'checkout.payment', value: 'draft->approved', rule_input: { from: 'draft', to: 'approved' } })
  };
  return { parent: direct({ scope: 'checkout.payment' }), claim: derived({ scope: 'checkout.payment' }) };
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

test('source policy and evidence share strict Decision Record validation', () => {
  /** @type {Array<{name: string, disposition: string, mutate: (pack: any) => void, code: string}>} */
  const cases = [
    { name: 'final empty answer', disposition: 'final', mutate: (pack) => { pack.decision_records[0].answer = '   '; }, code: 'DECISION_ANSWER_EMPTY' },
    { name: 'temporary empty answer', disposition: 'temporary', mutate: (pack) => { pack.decision_records[0].answer = ''; }, code: 'DECISION_ANSWER_EMPTY' },
    { name: 'missing locator', disposition: 'final', mutate: (pack) => { pack.decision_records[0].evidence_ref = 'locator_missing'; }, code: 'DECISION_EVIDENCE_DANGLING' },
    { name: 'locator source missing', disposition: 'temporary', mutate: (pack) => { pack.locators[0].source_id = 'source_missing'; }, code: 'LOCATOR_SOURCE_DANGLING' },
    { name: 'final uncertain locator', disposition: 'final', mutate: (pack) => { pack.locators[0].extraction_integrity = 'uncertain'; }, code: 'DECISION_EVIDENCE_UNCERTAIN' },
    { name: 'temporary uncertain locator', disposition: 'temporary', mutate: (pack) => { pack.locators[0].extraction_integrity = 'uncertain'; }, code: 'DECISION_EVIDENCE_UNCERTAIN' },
    { name: 'authority does not contain effective scope', disposition: 'final', mutate: (pack) => { pack.decision_records[0].authority_scope = 'checkout.shipping'; }, code: 'DECISION_AUTHORITY_SCOPE_MISMATCH' },
    { name: 'empty authority scope', disposition: 'temporary', mutate: (pack) => { pack.decision_records[0].authority_scope = ''; }, code: 'DECISION_AUTHORITY_SCOPE_MISMATCH' },
    { name: 'empty effective scope', disposition: 'final', mutate: (pack) => { pack.decision_records[0].effective_scope = '   '; }, code: 'DECISION_AUTHORITY_SCOPE_MISMATCH' }
  ];

  for (const item of cases) {
    const pack = sourcePack();
    pack.decision_records.push(decisionRecord(/** @type {'final' | 'temporary'} */ (item.disposition)));
    item.mutate(pack);
    const policy = resolveSourcePolicy(pack);
    const evidence = validateEvidenceGraph(pack, artifact([decisionClaim(/** @type {'final' | 'temporary'} */ (item.disposition))]));
    assert.equal(policy.diagnostics.some((diagnostic) => diagnostic.code === item.code), true, `${item.name}: source policy`);
    assert.equal(evidence.diagnostics.some((diagnostic) => diagnostic.code === item.code), true, `${item.name}: evidence`);
    assert.equal(evidence.claimsById.has('claim_decision'), false, item.name);
  }
});

test('Decision Record claims emit local diagnostics for every disposition and claim-level pairing', () => {
  const cases = [
    { disposition: 'final', level: 'E3', accepted: true },
    { disposition: 'final', level: 'E1', accepted: false },
    { disposition: 'temporary', level: 'E1', accepted: true },
    { disposition: 'temporary', level: 'E3', accepted: false }
  ];
  for (const item of cases) {
    const pack = sourcePack();
    pack.decision_records.push(decisionRecord(/** @type {'final' | 'temporary'} */ (item.disposition)));
    const claim = decisionClaim(/** @type {'final' | 'temporary'} */ (item.disposition));
    claim.level = item.level;
    claim.kind = item.level === 'E3' ? 'requirement' : 'assumption';

    const result = validateEvidenceGraph(pack, artifact([claim]));

    assert.equal(result.claimsById.has('claim_decision'), item.accepted, `${item.disposition}/${item.level}`);
    assert.equal(result.diagnostics.some((entry) => entry.code === 'DECISION_CLAIM_LEVEL_MISMATCH'), !item.accepted, `${item.disposition}/${item.level}`);
  }
});

test('unknown and deferred Decision Records are diagnosed as non-evidence', () => {
  for (const disposition of ['unknown', 'deferred']) {
    const pack = sourcePack();
    const record = decisionRecord('final');
    record.disposition = disposition;
    pack.decision_records.push(record);
    const claim = decisionClaim('final');

    const result = validateEvidenceGraph(pack, artifact([claim]));

    assert.equal(result.diagnostics.some((entry) => entry.code === 'DECISION_DISPOSITION_NOT_EVIDENCE'), true, disposition);
    assert.equal(result.claimsById.has('claim_decision'), false, disposition);
  }
});

test('fact ledger diagnoses raw claims that failed evidence acceptance', () => {
  const claims = artifact([direct({ claim_id: 'claim_bad', level: 'E1' })]);
  claims.fact_ledger.push({ fact_id: 'fact_bad', claim_id: 'claim_bad', status: 'grounded', source_claim_ids: ['claim_bad'] });

  const result = validateEvidenceGraph(sourcePack(), claims);

  assert.equal(result.diagnostics.some((entry) => entry.code === 'FACT_CLAIM_NOT_ACCEPTED'), true);
  assert.equal(result.diagnostics.some((entry) => entry.code === 'FACT_SOURCE_CLAIM_NOT_ACCEPTED'), true);
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

test('every E2 family requires parent scope containment and inherited provenance anchors', () => {
  const families = ['formula', 'decision-table-instance', 'boundary-representative', 'enumeration-complement', 'graph-reachability'];
  for (const family of families) {
    const differentAnchor = derivationFamily(family);
    differentAnchor.claim.source_locator_ids = ['locator_formula'];
    const anchorResult = validateEvidenceGraph(sourcePack(), artifact([differentAnchor.parent, differentAnchor.claim]));
    assert.equal(anchorResult.diagnostics.some((item) => item.code === 'E2_PROVENANCE_ANCHOR_NOT_IN_PARENTS'), true, `${family}: anchor`);
    assert.equal(anchorResult.claimsById.has('claim_e2'), false, `${family}: anchor`);

    const crossScope = derivationFamily(family);
    crossScope.claim.scope = 'checkout.shipping';
    const scopeResult = validateEvidenceGraph(sourcePack(), artifact([crossScope.parent, crossScope.claim]));
    assert.equal(scopeResult.diagnostics.some((item) => item.code === 'E2_PARENT_SCOPE_MISMATCH'), true, `${family}: scope`);
    assert.equal(scopeResult.claimsById.has('claim_e2'), false, `${family}: scope`);
  }
});

test('formula recomputation uses exact signed decimal rounding and safe parser behavior', () => {
  const cases = [
    { name: 'positive half-up tie', formula: 'amount', inputs: [{ name: 'amount', value: '1.005' }], rounding: 'half-up', want: '1.01' },
    { name: 'positive half-even tie', formula: 'amount', inputs: [{ name: 'amount', value: '1.005' }], rounding: 'half-even', want: '1.00' },
    { name: 'negative half-up tie', formula: '-amount', inputs: [{ name: 'amount', value: '1.005' }], rounding: 'half-up', want: '-1.01' },
    { name: 'negative half-even tie', formula: '-amount', inputs: [{ name: 'amount', value: '1.005' }], rounding: 'half-even', want: '-1.00' },
    { name: 'positive floor', formula: 'amount', inputs: [{ name: 'amount', value: '1.009' }], rounding: 'floor', want: '1.00' },
    { name: 'positive ceiling', formula: 'amount', inputs: [{ name: 'amount', value: '1.001' }], rounding: 'ceiling', want: '1.01' },
    { name: 'positive truncate', formula: 'amount', inputs: [{ name: 'amount', value: '1.009' }], rounding: 'truncate', want: '1.00' },
    { name: 'negative floor', formula: '-amount', inputs: [{ name: 'amount', value: '1.001' }], rounding: 'floor', want: '-1.01' },
    { name: 'negative ceiling', formula: '-amount', inputs: [{ name: 'amount', value: '1.009' }], rounding: 'ceiling', want: '-1.00' },
    { name: 'negative truncate', formula: '-amount', inputs: [{ name: 'amount', value: '1.009' }], rounding: 'truncate', want: '-1.00' },
    { name: 'unary and trailing whitespace', formula: ' -amount / divisor   ', inputs: [{ name: 'amount', value: '1' }, { name: 'divisor', value: '2' }], rounding: 'half-up', want: '-0.50' }
  ];

  for (const item of cases) {
    const parent = direct({ value: item.formula });
    const claim = derived({ derivation_kind: 'formula', derivation_target: 'expected-value', kind: 'expected-value', value: item.want,
      parameters: { unit: 'USD', precision: 2, rounding: item.rounding },
      rule_input: { formula: item.formula, inputs: item.inputs, unit: 'USD', precision: 2, rounding: item.rounding } });
    const result = validateEvidenceGraph(sourcePack(), artifact([parent, claim]));
    assert.deepEqual(result.diagnostics, [], item.name);
    assert.equal(result.claimsById.has('claim_e2'), true, item.name);
  }
});

test('formula recomputation rejects duplicate variables, metadata disagreement, and zero division', () => {
  const cases = [
    { name: 'duplicate variables', parameters: { unit: 'USD', precision: 2, rounding: 'half-up' },
      input: { formula: 'amount', inputs: [{ name: 'amount', value: 1 }, { name: 'amount', value: 2 }], unit: 'USD', precision: 2, rounding: 'half-up' }, code: 'E2_FORMULA_VARIABLE_DUPLICATE' },
    { name: 'metadata mismatch', parameters: { unit: 'USD', precision: 2, rounding: 'half-up' },
      input: { formula: 'amount', inputs: [{ name: 'amount', value: 1 }], unit: 'EUR', precision: 2, rounding: 'half-up' }, code: 'E2_FORMULA_METADATA_MISMATCH' },
    { name: 'division by zero', parameters: { unit: 'USD', precision: 2, rounding: 'half-up' },
      input: { formula: 'amount / zero', inputs: [{ name: 'amount', value: 1 }, { name: 'zero', value: 0 }], unit: 'USD', precision: 2, rounding: 'half-up' }, code: 'E2_FORMULA_INVALID' }
  ];
  for (const item of cases) {
    const parent = direct({ value: item.input.formula });
    const claim = derived({ derivation_kind: 'formula', derivation_target: 'expected-value', kind: 'expected-value', value: '1.00', parameters: item.parameters, rule_input: item.input });
    const result = validateEvidenceGraph(sourcePack(), artifact([parent, claim]));
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === item.code), true, item.name);
    assert.equal(result.claimsById.has('claim_e2'), false, item.name);
  }
});

test('formula recomputation requires nonblank output and optional input units', () => {
  const cases = [
    { name: 'blank rule output unit', parameters: {}, unit: '   ', inputUnit: undefined },
    { name: 'blank parameter output unit', parameters: { unit: '\t', precision: 2, rounding: 'half-up' }, unit: undefined, inputUnit: undefined },
    { name: 'blank optional input unit', parameters: {}, unit: 'USD', inputUnit: '  ' }
  ];
  for (const item of cases) {
    const input = { name: 'amount', value: '1', ...(item.inputUnit === undefined ? {} : { unit: item.inputUnit }) };
    const ruleInput = {
      formula: 'amount', inputs: [input], ...(item.unit === undefined ? {} : { unit: item.unit }), precision: 2, rounding: 'half-up'
    };
    const claim = derived({
      derivation_kind: 'formula', derivation_target: 'expected-value', kind: 'expected-value', value: '1.00',
      parameters: item.parameters, rule_input: ruleInput
    });

    const result = validateEvidenceGraph(sourcePack(), artifact([direct({ value: 'amount' }), claim]));

    assert.equal(result.diagnostics.some((entry) => entry.code === 'E2_FORMULA_INPUT_INCOMPLETE'), true, item.name);
    assert.equal(result.claimsById.has('claim_e2'), false, item.name);
  }
});

test('graph reachability validates node existence, multi-hop paths, cycles, and reflexive paths', () => {
  const edges = [
    direct({ claim_id: 'claim_ab', value: 'A->B' }),
    direct({ claim_id: 'claim_bc', value: 'B->C' }),
    direct({ claim_id: 'claim_ca', value: 'C->A' })
  ];
  /** @param {string} claimId @param {string} from @param {string} to */
  const graphClaim = (claimId, from, to) => derived({
    claim_id: claimId, derivation_kind: 'graph-reachability', derivation_target: 'model-element', kind: 'model-element',
    parent_claim_ids: edges.map((edge) => edge.claim_id), value: `${from}->${to}`, rule_input: { from, to }
  });

  const valid = validateEvidenceGraph(sourcePack(), artifact([...edges, graphClaim('claim_path', 'A', 'C'), graphClaim('claim_reflexive', 'A', 'A')]));
  assert.deepEqual(valid.diagnostics, []);
  assert.equal(valid.claimsById.has('claim_path'), true);
  assert.equal(valid.claimsById.has('claim_reflexive'), true);

  const unknown = validateEvidenceGraph(sourcePack(), artifact([...edges, graphClaim('claim_unknown', 'A', 'Z')]));
  assert.equal(unknown.diagnostics.some((item) => item.code === 'E2_GRAPH_NODE_UNKNOWN'), true);
  assert.equal(unknown.claimsById.has('claim_unknown'), false);

  const noNodes = derived({ claim_id: 'claim_no_nodes', derivation_kind: 'graph-reachability', derivation_target: 'model-element', kind: 'model-element',
    parent_claim_ids: ['claim_root'], value: 'Z->Z', rule_input: { from: 'Z', to: 'Z' } });
  const reflexiveUnknown = validateEvidenceGraph(sourcePack(), artifact([direct(), noNodes]));
  assert.equal(reflexiveUnknown.diagnostics.some((item) => item.code === 'E2_GRAPH_NODE_UNKNOWN'), true);
});

test('graph reachability handles high fanout without adjacency copying or argument expansion', { timeout: 5000 }, () => {
  const edgeCount = 125000;
  const edges = Array.from({ length: edgeCount }, (_, index) => direct({
    claim_id: `claim_edge_${String(index).padStart(5, '0')}`,
    value: `hub->node_${index}`
  }));
  const claim = derived({
    claim_id: 'claim_high_fanout', derivation_kind: 'graph-reachability', derivation_target: 'model-element', kind: 'model-element',
    parent_claim_ids: edges.map((edge) => edge.claim_id), value: `hub->node_${edgeCount - 1}`,
    rule_input: { from: 'hub', to: `node_${edgeCount - 1}` }
  });

  const result = validateEvidenceGraph(sourcePack(), artifact([...edges, claim]));

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.claimsById.has('claim_high_fanout'), true);
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
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: [paymentConflictRootId()], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Temporary settlement?', answer: 'Use two days.', disposition: 'temporary',
    authority_scope: 'checkout.payment', effective_scope: 'checkout.payment', evidence_ref: 'locator_rule', evidence_level: 'E1'
  });
  const claim = { claim_id: 'claim_temp', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout.payment', value: 'Use two days.', source_locator_ids: ['locator_rule'], decision_id: 'decision_temp', authority: 'checkout.payment' };

  const result = validateEvidenceGraph(pack, artifact([claim]));

  assert.equal(result.diagnostics.some((item) => item.code === 'E1_CANNOT_OVERRIDE_CONFLICT'), true);
  assert.equal(result.claimsById.has('claim_temp'), false);
});

test('evidence accepts overlapping E1 when it names no matching source-conflict root', async () => {
  const pack = await fixture('adversarial/source-conflict-local.json');
  pack.locators.push({ locator_id: 'locator_rule', source_id: 'source_payment_new', type: 'text-range', text_range: { start: 0, end: 4 }, content_digest: digestA, extraction_integrity: 'verified' });
  pack.decision_records.push({
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: ['root_shipping'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Temporary settlement?', answer: 'Use two days.', disposition: 'temporary',
    authority_scope: 'checkout.payment', effective_scope: 'checkout.payment', evidence_ref: 'locator_rule', evidence_level: 'E1'
  });
  const claim = { claim_id: 'claim_temp', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout.payment', value: 'Use two days.', source_locator_ids: ['locator_rule'], decision_id: 'decision_temp', authority: 'checkout.payment' };

  const result = validateEvidenceGraph(pack, artifact([claim]));

  assert.equal(result.diagnostics.some((item) => item.code === 'E1_CANNOT_OVERRIDE_CONFLICT'), false);
  assert.equal(result.claimsById.has('claim_temp'), true);
});

test('evidence does not let E1 override a conflicted fact backed by E3 claims', () => {
  const pack = sourcePack();
  pack.sources.push({ source_id: 'source_rule', kind: 'formal-rule', version: '1', status: 'effective', authority: 'owner', content: 'Rejected', content_digest: 'b'.repeat(64), scope: 'checkout' });
  pack.locators.push({ locator_id: 'locator_second', source_id: 'source_rule', type: 'text-range', text_range: { start: 0, end: 8 }, content_digest: 'b'.repeat(64), extraction_integrity: 'verified' });
  pack.source_policy.rules[0].source_ids.push('source_rule');
  pack.decision_records.push({
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: [factResultConflictRootId()], affected_obligation_ids: [], clarification_event_seq: 1,
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

test('evidence accepts overlapping E1 when it names no matching fact-conflict root', () => {
  const pack = sourcePack();
  pack.sources.push({ source_id: 'source_rule', kind: 'formal-rule', version: '1', status: 'effective', authority: 'owner', content: 'Rejected', content_digest: 'b'.repeat(64), scope: 'checkout' });
  pack.locators.push({ locator_id: 'locator_second', source_id: 'source_rule', type: 'text-range', text_range: { start: 0, end: 8 }, content_digest: 'b'.repeat(64), extraction_integrity: 'verified' });
  pack.source_policy.rules[0].source_ids.push('source_rule');
  pack.decision_records.push({
    decision_id: 'decision_temp', question_id: 'question_temp', root_issue_ids: ['root_unrelated'], affected_obligation_ids: [], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-08-29T00:00:00Z', question: 'Temporary result?', answer: 'Use approved.', disposition: 'temporary',
    authority_scope: 'checkout', effective_scope: 'checkout', evidence_ref: 'locator_rule', evidence_level: 'E1'
  });
  const first = direct({ claim_id: 'claim_approved', value: 'approved' });
  const second = direct({ claim_id: 'claim_rejected', value: 'rejected', source_id: 'source_rule', source_locator_ids: ['locator_second'] });
  const temporary = { claim_id: 'claim_temp', claim_form: 'decision-record', level: 'E1', kind: 'assumption', scope: 'checkout', value: 'Use approved.', source_locator_ids: ['locator_rule'], decision_id: 'decision_temp', authority: 'checkout' };
  const claims = artifact([first, second, temporary]);
  claims.fact_ledger.push({ fact_id: 'fact_result', claim_id: 'claim_approved', status: 'conflicted', source_claim_ids: ['claim_approved', 'claim_rejected'] });

  const result = validateEvidenceGraph(pack, claims);

  assert.equal(result.diagnostics.some((item) => item.code === 'E1_CANNOT_OVERRIDE_CONFLICT'), false);
  assert.equal(result.claimsById.has('claim_temp'), true);
});

test('evidence returns claimsById in stable claim_id order independent of artifact order', () => {
  const claims = [direct({ claim_id: 'claim_z' }), direct({ claim_id: 'claim_a' })];
  const forward = validateEvidenceGraph(sourcePack(), artifact(claims));
  const reversed = validateEvidenceGraph(sourcePack(), artifact([...claims].reverse()));

  assert.deepEqual(forward.diagnostics, []);
  assert.deepEqual(reversed.diagnostics, []);
  assert.deepEqual([...forward.claimsById.keys()], ['claim_a', 'claim_z']);
  assert.deepEqual([...reversed.claimsById.keys()], ['claim_a', 'claim_z']);
});

test('evidence handles a reversed 4000-claim E2 chain without recursion failure or depth caps', () => {
  const count = 4000;
  /** @type {Array<Record<string, unknown>>} */
  const claims = [direct({ claim_id: 'claim_0000' })];
  for (let index = 1; index < count; index += 1) {
    claims.push(derived({
      claim_id: `claim_${String(index).padStart(4, '0')}`,
      parent_claim_ids: [`claim_${String(index - 1).padStart(4, '0')}`]
    }));
  }

  const result = validateEvidenceGraph(sourcePack(), artifact([...claims].reverse()));

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.claimsById.size, count);
  assert.equal([...result.claimsById.keys()][0], 'claim_0000');
  assert.equal([...result.claimsById.keys()].at(-1), 'claim_3999');
});
