import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalStringify } from '../../src/canonical.mjs';
import { buildBundle, BundleReconciliationError } from '../../src/coverage.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const bundleSchema = JSON.parse(await readFile(path.join(
  repositoryRoot, 'skill/generate-test-cases/scripts/schemas/test-bundle.schema.json'
), 'utf8'));
const fixture = JSON.parse(await readFile(path.join(
  repositoryRoot, 'test/fixtures/journeys/final-critical-gaps.json'
), 'utf8'));

function context() {
  return structuredClone(fixture);
}

/** @type {string[]} */
let lastDiagnosticCodes = [];

/** @param {() => unknown} callback */
function diagnosticCodes(callback) {
  assert.throws(callback, (/** @type {any} */ error) => {
    assert.equal(error instanceof BundleReconciliationError, true);
    assert.equal(error.status, 'need_revision');
    assert.equal(error.stage, 'coverage');
    assert.equal(Array.isArray(error.diagnostics), true);
    lastDiagnosticCodes = error.diagnostics.map((/** @type {any} */ item) => item.code);
    return true;
  });
  return lastDiagnosticCodes;
}

test('coverage builds four independent ledgers with hand-counted denominators', () => {
  const bundle = buildBundle(context());

  assert.deepEqual(bundle.coverage.requirements, {
    total: 3,
    accounted: 3,
    entries: [
      { fact_id: 'fact_blocked', status: 'blocked' },
      { fact_id: 'fact_grounded', status: 'covered' },
      { fact_id: 'fact_na', status: 'not_applicable' }
    ]
  });
  assert.deepEqual(bundle.coverage.formal, {
    total: 3,
    covered: 1,
    entries: [
      { obligation_id: 'obligation_blocked', status: 'blocked' },
      { obligation_id: 'obligation_grounded', status: 'grounded' },
      { obligation_id: 'obligation_na', status: 'not_applicable' }
    ]
  });
  assert.deepEqual(bundle.coverage.executable, {
    total: 1,
    grounded: 1,
    entries: [{ obligation_id: 'obligation_grounded', case_id: 'case_grounded' }]
  });
  assert.deepEqual(bundle.coverage.expert_recall, {
    status: 'benchmark_only',
    limits: ['Expert recall requires hidden benchmark labels.']
  });
  assert.deepEqual(bundle.coverage.not_applicable, [{
    obligation_id: 'obligation_na', exclusion_claim_id: 'claim_exclusion',
    scope: 'checkout/legacy', support_review: 'supported'
  }]);
  assert.equal(bundle.exploratory.length, 1);
  assert.equal(bundle.coverage.formal.total, 3, 'NotApplicable remains declared formal inventory while Exploratory stays outside');
  assert.deepEqual(validateAgainstSchema(bundle, bundleSchema), []);
  assert.equal(canonicalStringify(bundle), canonicalStringify(buildBundle(context())));
});

test('every formal Test Point has exactly one disposition', () => {
  for (const mutate of [
    (/** @type {any} */ input) => input.clarification.semantic_snapshot.formal_test_points.pop(),
    (/** @type {any} */ input) => input.clarification.semantic_snapshot.formal_test_points.push(
      structuredClone(input.clarification.semantic_snapshot.formal_test_points[0])
    ),
    (/** @type {any} */ input) => {
      input.classification.conditional.push(structuredClone(input.classification.grounded[0]));
    }
  ]) {
    const input = context();
    mutate(input);
    const codes = diagnosticCodes(() => buildBundle(input));
    assert.equal(codes.some((code) => code.includes('FORMAL') || code.includes('DISPOSITION')), true, codes.join(','));
  }
});

test('reasonless blocked, uncovered, and not-evaluated dispositions fail closed', () => {
  for (const reason of ['', 'uncovered', 'not-evaluated']) {
    const input = context();
    input.clarification.semantic_snapshot.formal_test_points[0].blocked_reason = reason;
    const codes = diagnosticCodes(() => buildBundle(input));
    assert.equal(codes.includes('BLOCKED_REASON_INVALID'), true, reason);
  }
});

test('Case associations are bidirectional across facts, Test Points, and independently located Oracles', () => {
  const mutations = [
    (/** @type {any} */ input) => input.classification.grounded[0].fact_ids.push('fact_dangling'),
    (/** @type {any} */ input) => input.classification.grounded[0].obligation_ids.push('obligation_dangling'),
    (/** @type {any} */ input) => { input.classification.grounded[0].execution_signature.oracle_refs = ['expectation_missing']; },
    (/** @type {any} */ input) => { input.classification.grounded[0].steps[0].expectations = []; },
    (/** @type {any} */ input) => { input.obligations_artifact.obligations[1].required_oracle_refs = ['claim_oracle_missing']; }
  ];
  for (const mutate of mutations) {
    const input = context();
    mutate(input);
    const codes = diagnosticCodes(() => buildBundle(input));
    assert.equal(codes.some((code) => code.includes('TRACE') || code.includes('UNKNOWN') || code.includes('ORACLE')), true, codes.join(','));
  }
});

test('evidence, classification, clarification, and obligation revisions identify one immutable source snapshot', () => {
  for (const field of ['evidence_claims', 'obligations_artifact', 'clarification']) {
    const input = context();
    input[field].source_revision += 1;
    assert.equal(diagnosticCodes(() => buildBundle(input)).includes('SOURCE_REVISION_MISMATCH'), true);
  }
});

test('bundle context is closed and output remains the frozen eight-key artifact', () => {
  const input = context();
  input.free_form_summary = 'do not admit this';
  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('CONTEXT_PROPERTY_UNKNOWN'), true);

  const bundle = buildBundle(context());
  assert.deepEqual(Object.keys(bundle).sort(), [
    'blocked', 'conditional', 'coverage', 'exploratory', 'grounded', 'quality',
    'schema_version', 'source_revision'
  ]);
  assert.equal(canonicalStringify(bundle).includes('free_form_summary'), false);
  assert.equal(canonicalStringify(bundle).includes('timestamp'), false);
});

test('reconciliation rejects unknown fact-route Test Points and forged Task 9 lane projections', () => {
  const unknownRoute = context();
  unknownRoute.obligations_artifact.fact_routes[0].obligation_ids = ['obligation_unknown'];
  assert.equal(diagnosticCodes(() => buildBundle(unknownRoute)).includes('FACT_ROUTE_OBLIGATION_UNKNOWN'), true);

  const forgedLane = context();
  forgedLane.clarification.semantic_snapshot.delivery_sections.grounded = [];
  assert.equal(diagnosticCodes(() => buildBundle(forgedLane)).includes('CLARIFICATION_LANE_MISMATCH'), true);
});

test('set-like upstream reorder is byte-stable and buildBundle never mutates its context', () => {
  const ordered = context();
  const reordered = context();
  reordered.obligations_artifact.obligations.reverse();
  reordered.obligations_artifact.fact_routes.reverse();
  reordered.evidence_claims.claims.reverse();
  reordered.classification.grounded.reverse();
  reordered.classification.blocked.reverse();
  reordered.classification.not_applicable.reverse();
  reordered.classification.exploratory.reverse();
  reordered.clarification.semantic_snapshot.formal_test_points.reverse();
  reordered.clarification.root_issues.reverse();
  reordered.clarification.state.root_snapshot_ledger.reverse();
  const before = structuredClone(reordered);

  assert.equal(canonicalStringify(buildBundle(ordered)), canonicalStringify(buildBundle(reordered)));
  assert.deepEqual(reordered, before);
});

test('each covered Test Point owns one distinct expectation through accepted Oracle ancestry', () => {
  const input = context();
  const candidate = input.classification.grounded[0];
  input.obligations_artifact.obligations.push({
    obligation_id: 'obligation_second', kind: 'flow', risk: 'medium', scope: 'checkout',
    source_claim_ids: ['claim_second'], view_element_refs: ['view_checkout#second'],
    required_oracle_refs: ['claim_oracle_second'], required_capabilities: []
  });
  input.evidence_claims.claims.push({
    claim_id: 'claim_oracle_second', claim_form: 'direct', level: 'E3', kind: 'requirement',
    scope: 'checkout', value: 'The second result is defined.',
    source_locator_ids: ['locator_second'], source_id: 'source_prd'
  });
  input.obligations_artifact.fact_routes[1].obligation_ids.push('obligation_second');
  candidate.obligation_ids.push('obligation_second');
  candidate.evidence_refs.push('claim_second', 'claim_oracle_second');
  candidate.execution_signature.test_point_ids.push('obligation_second');
  candidate.steps[0].expectations.push({
    ...structuredClone(candidate.steps[0].expectations[0]),
    expectation_id: 'expectation_second'
  });
  candidate.execution_signature.oracle_refs.push('expectation_second');
  input.clarification.semantic_snapshot.formal_test_points.push({
    obligation_id: 'obligation_second', evidence_level: 'E3', classification: 'grounded', blocked_reason: null
  });
  input.clarification.semantic_snapshot.coverage_denominator += 1;
  input.clarification.semantic_snapshot.delivery_sections.grounded.push('obligation_second');
  input.clarification.semantic_snapshot.delivery_sections.coverage.formal_denominator += 1;

  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('CASE_ORACLE_OWNERSHIP_INCOMPLETE'), true);
});

test('a final Blocked Test Point must trace to a Task 8 blocker or a projected executable Case', () => {
  const input = context();
  input.classification.blocked = [];
  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('BLOCKED_DISPOSITION_MISSING'), true);
});

test('a final Blocked Test Point cannot retain both a Task 8 blocker and a projected executable Case', () => {
  const input = context();
  const projected = structuredClone(input.classification.grounded[0]);
  projected.case_id = 'case_projected_blocked';
  projected.fact_ids = ['fact_blocked'];
  projected.obligation_ids = ['obligation_blocked'];
  projected.execution_signature.test_point_ids = ['obligation_blocked'];
  input.classification.grounded.push(projected);

  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('FORMAL_DISPOSITION_DUPLICATE'), true);
});

test('Oracle ownership accepts a concrete expectation derived from the required accepted Oracle', () => {
  const input = context();
  input.evidence_claims.claims.push({
    claim_id: 'claim_oracle_derived', claim_form: 'derived', level: 'E2', kind: 'expected-value',
    scope: 'checkout', value: 'accepted', source_locator_ids: ['locator_checkout'],
    derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
    parent_claim_ids: ['claim_oracle_grounded'], parameters: { table_id: 'table_checkout' },
    rule_input: { conditions: ['cart is ready'], outcome: 'accepted' }
  });
  const candidate = input.classification.grounded[0];
  candidate.steps[0].expectations[0].evidence_ref = 'claim_oracle_derived';
  candidate.evidence_refs.push('claim_oracle_derived');

  assert.equal(buildBundle(input).grounded.length, 1);
});
