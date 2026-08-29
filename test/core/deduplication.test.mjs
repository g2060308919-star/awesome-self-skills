import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyCaseDrafts, executionSignature } from '../../src/classify.mjs';
import { stableId } from '../../src/canonical.mjs';
import {
  IDS, acceptedClaim, baseCase, baseClaims, baseObligation, classificationContext
} from '../helpers/classification-context.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const signatureBoundaries = JSON.parse(await readFile(
  path.join(repositoryRoot, 'test/fixtures/adversarial/case-signature-boundaries.json'), 'utf8'
));

test('executionSignature contains only normalized frozen dimensions', () => {
  const first = baseCase();
  first.execution_signature.role = '  buye\u0301r   role ';
  first.role.value = '  buye\u0301r   role ';
  first.execution_signature.precondition_state = '  cart   is ready ';
  first.execution_signature.data_partition = ' total=100.00   boundary ';
  first.execution_signature.action_path = ['  Submit   checkout  '];
  first.steps[0].action = '  Submit   checkout  ';
  first.execution_signature.oracle_refs = ['oracle_😀'];
  first.steps[0].expectations[0].expectation_id = 'oracle_😀';
  first.execution_signature.test_point_ids = ['obligation_aaaaaaaaaaaaaaaa'];
  first.execution_signature.source_revision = 99;
  first.execution_signature.timestamp = '2099-01-01T00:00:00Z';
  const second = baseCase();
  second.execution_signature.role = 'buyér role';
  second.role.value = 'buyér role';
  second.execution_signature.precondition_state = 'cart is ready';
  second.execution_signature.data_partition = 'total=100.00 boundary';
  second.execution_signature.action_path = ['Submit checkout'];
  second.steps[0].action = 'Submit checkout';
  second.execution_signature.oracle_refs = ['oracle_😀'];
  second.steps[0].expectations[0].expectation_id = 'oracle_😀';
  second.execution_signature.test_point_ids = ['obligation_bbbbbbbbbbbbbbbb'];

  assert.equal(executionSignature(first), executionSignature(second));
  assert.doesNotMatch(executionSignature(first), /source_revision|timestamp|test_point/u);
});

test('every execution dimension keeps Cases separate', () => {
  const original = baseCase();
  for (const boundary of signatureBoundaries) {
    const changed = structuredClone(original);
    changed.execution_signature[boundary.dimension] = boundary.value;
    if (boundary.dimension === 'role') changed.role.value = boundary.value;
    if (boundary.dimension === 'action_path') {
      const actions = /** @type {string[]} */ (boundary.value);
      changed.steps = actions.map((action, index) => ({
        ...structuredClone(original.steps[0]),
        step_id: `step_${index}`,
        action,
        expectations: index === actions.length - 1 ? [{
          ...structuredClone(original.steps[0].expectations[0]), preceding_action_id: `step_${index}`
        }] : []
      }));
    }
    if (boundary.dimension === 'oracle_refs') {
      changed.steps[0].expectations[0].expectation_id = boundary.value[0];
    }
    assert.notEqual(executionSignature(original), executionSignature(changed), boundary.dimension);
  }
});

test('ordered action paths are never sorted', () => {
  const first = baseCase();
  first.execution_signature.action_path = ['Authorize', 'Capture'];
  first.steps = ['Authorize', 'Capture'].map((action, index) => ({
    ...structuredClone(first.steps[0]), step_id: `step_${index}`, action,
    expectations: index === 1 ? [{ ...structuredClone(first.steps[0].expectations[0]), preceding_action_id: 'step_1' }] : []
  }));
  const second = structuredClone(first);
  second.execution_signature.action_path.reverse();
  second.steps.reverse();

  assert.notEqual(executionSignature(first), executionSignature(second));
});

test('signature encoding is NUL-safe and compares Unicode by code point', () => {
  const first = baseCase();
  first.execution_signature.action_path = ['a\0b', 'c'];
  first.steps = ['a\0b', 'c'].map((action, index) => ({ ...structuredClone(first.steps[0]), step_id: `step_${index}`, action }));
  const second = baseCase();
  second.execution_signature.action_path = ['a', 'b\0c'];
  second.steps = ['a', 'b\0c'].map((action, index) => ({ ...structuredClone(second.steps[0]), step_id: `step_${index}`, action }));

  assert.notEqual(executionSignature(first), executionSignature(second));
});

function exactDuplicateContext() {
  const secondObligationId = 'obligation_2222222222222222';
  const secondCaseId = 'case_2222222222222222';
  const secondFactId = 'fact_checkout_secondary';
  const claims = [...baseClaims(), acceptedClaim('claim_fact_secondary')];
  const firstObligation = baseObligation();
  const secondObligation = baseObligation({
    obligation_id: secondObligationId,
    source_claim_ids: ['claim_fact_secondary'],
    view_element_refs: ['view_checkout#edge_secondary']
  });
  const firstCase = baseCase();
  const secondCase = baseCase({
    case_id: secondCaseId,
    fact_ids: [secondFactId],
    obligation_ids: [secondObligationId],
    source_claim_ids: ['claim_fact_secondary'],
    evidence_refs: [...baseCase().evidence_refs, 'claim_fact_secondary']
  });
  const context = classificationContext({
    claims,
    obligations: [firstObligation, secondObligation],
    cases: [firstCase, secondCase],
    facts: [
      { fact_id: IDS.fact, claim_id: 'claim_fact', status: 'active', source_claim_ids: ['claim_fact'] },
      { fact_id: secondFactId, claim_id: 'claim_fact_secondary', status: 'active', source_claim_ids: ['claim_fact_secondary'] }
    ],
    dispositions: [
      { obligation_id: IDS.obligation, status: 'case_candidate', case_ids: [IDS.case] },
      { obligation_id: secondObligationId, status: 'case_candidate', case_ids: [secondCaseId] }
    ]
  });
  context.obligations.fact_routes = [
    { fact_id: IDS.fact, route_type: 'obligations', obligation_ids: [IDS.obligation] },
    { fact_id: secondFactId, route_type: 'obligations', obligation_ids: [secondObligationId] }
  ];
  return context;
}

test('exact signatures merge without losing fact, evidence, or obligation references', () => {
  const context = exactDuplicateContext();
  const before = structuredClone(context);
  const result = classifyCaseDrafts(context);
  const merged = /** @type {any} */ (result.grounded[0]);
  const expectedId = stableId('case', JSON.parse(executionSignature(context.caseDrafts.cases[0])));

  assert.equal(result.grounded.length, 1);
  assert.equal(merged.case_id, expectedId);
  assert.deepEqual(merged.fact_ids, ['fact_checkout', 'fact_checkout_secondary']);
  assert.deepEqual(merged.obligation_ids, ['obligation_1111111111111111', 'obligation_2222222222222222']);
  assert.equal(merged.evidence_refs.includes('claim_fact'), true);
  assert.equal(merged.evidence_refs.includes('claim_fact_secondary'), true);
  assert.deepEqual(context, before);
});

test('deduplication and merged ID are stable under input reordering', () => {
  const forward = exactDuplicateContext();
  const reversed = exactDuplicateContext();
  reversed.caseDrafts.cases.reverse();
  reversed.caseDrafts.obligation_dispositions.reverse();
  reversed.obligations.obligations.reverse();
  reversed.obligations.fact_routes.reverse();
  reversed.evidence.factLedger.reverse();

  assert.deepEqual(classifyCaseDrafts(forward), classifyCaseDrafts(reversed));
});

test('the same Test Point with a distinct signature stays as a separate Case', () => {
  const first = baseCase();
  const second = baseCase({ case_id: 'case_2222222222222222' });
  second.execution_signature.data_partition = 'total=99.99 interior';
  second.data[0].value = '99.99';
  const context = classificationContext({
    cases: [first, second],
    dispositions: [{
      obligation_id: IDS.obligation,
      status: 'case_candidate',
      case_ids: [first.case_id, second.case_id]
    }]
  });
  const result = classifyCaseDrafts(context);

  assert.equal(result.grounded.length, 2);
  assert.equal(new Set(result.grounded.map((item) => item.case_id)).size, 2);
});

test('same-signature non-signature semantic conflicts are diagnosed and never silently merged', () => {
  /** @type {Array<[string, (draft: any) => void]>} */
  const mutations = [
    ['title', (draft) => { draft.title = 'A conflicting title'; }],
    ['scope', (draft) => { draft.scope = 'checkout.detail'; }],
    ['risk', (draft) => { draft.risk = 'low'; }],
    ['data', (draft) => { draft.data[0].value = '100.01'; }],
    ['Oracle content', (draft) => { draft.steps[0].expectations[0].oracle.expected_state = 'rejected'; }],
    ['cleanup', (draft) => { draft.cleanup.no_cleanup_reason = 'A conflicting cleanup reason'; }]
  ];
  for (const [name, mutate] of mutations) {
    const first = baseCase();
    const second = baseCase({ case_id: 'case_2222222222222222' });
    mutate(second);
    const context = classificationContext({
      cases: [first, second],
      dispositions: [{
        obligation_id: IDS.obligation,
        status: 'case_candidate',
        case_ids: [first.case_id, second.case_id]
      }]
    });
    const result = classifyCaseDrafts(context);
    assert.equal(result.diagnostics.some((item) => item.code === 'DUPLICATE_SIGNATURE_SEMANTIC_CONFLICT'), true, name);
    assert.equal(result.grounded.length, 0, `${name}: diagnostic input must fail closed before downstream lanes`);
  }
});

test('duplicate stable Case IDs reject before lanes can contain the same Case twice', () => {
  const first = baseCase();
  const second = baseCase();
  second.execution_signature.data_partition = 'other partition';
  const context = classificationContext({
    cases: [first, second],
    dispositions: [{ obligation_id: IDS.obligation, status: 'case_candidate', case_ids: [IDS.case] }]
  });
  const result = classifyCaseDrafts(context);

  assert.equal(result.diagnostics.some((item) => item.code === 'CASE_ID_DUPLICATE'), true);
});

test('large independent case and obligation sets are reconciled through indexes', () => {
  const size = 1500;
  const obligations = [];
  const cases = [];
  const dispositions = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = index.toString(16).padStart(16, '0');
    const obligationId = `obligation_${suffix}`;
    const caseId = `case_${suffix}`;
    obligations.push(baseObligation({
      obligation_id: obligationId,
      view_element_refs: [`view_checkout#edge_${index}`]
    }));
    const draft = baseCase({ case_id: caseId, obligation_ids: [obligationId] });
    draft.execution_signature.data_partition = `partition-${index}`;
    cases.push(draft);
    dispositions.push({ obligation_id: obligationId, status: 'case_candidate', case_ids: [caseId] });
  }
  const context = classificationContext({ obligations, cases, dispositions });
  context.obligations.fact_routes[0].obligation_ids = obligations.map((item) => item.obligation_id);
  const started = performance.now();
  const result = classifyCaseDrafts(context);
  const elapsed = performance.now() - started;

  assert.equal(result.grounded.length, size);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(elapsed < 5000, true, `indexed reconciliation took ${elapsed.toFixed(1)}ms`);
});
