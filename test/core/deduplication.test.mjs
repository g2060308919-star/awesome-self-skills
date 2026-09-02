import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyCaseDrafts, executionSignature } from '../../src/classify.mjs';
import { stableId } from '../../src/canonical.mjs';
import { buildBundle } from '../../src/coverage.mjs';
import {
  IDS, acceptedClaim, baseCase, baseClaims, baseObligation, classificationContext,
  refreshExecutionSignature
} from '../helpers/classification-context.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const signatureBoundaries = JSON.parse(await readFile(
  path.join(repositoryRoot, 'test/fixtures/adversarial/case-signature-boundaries.json'), 'utf8'
));
const coverageFixture = JSON.parse(await readFile(
  path.join(repositoryRoot, 'test/fixtures/journeys/final-critical-gaps.json'), 'utf8'
));

/** @param {any[]} cases @param {any[]} [extraClaims] */
function fixtureClassificationContext(cases, extraClaims = []) {
  const obligations = structuredClone(coverageFixture.obligations_artifact);
  obligations.obligations = obligations.obligations.filter(
    (/** @type {any} */ item) => item.obligation_id === 'obligation_grounded'
  );
  obligations.fact_routes = obligations.fact_routes.filter(
    (/** @type {any} */ item) => item.fact_id === 'fact_grounded'
  );
  obligations.interaction_routes = [];
  return {
    sourceRevision: coverageFixture.source_revision,
    evidence: {
      claimsById: new Map([...coverageFixture.evidence_claims.claims, ...extraClaims].map(
        (claim) => [String(claim.claim_id), structuredClone(claim)]
      )),
      factLedger: structuredClone(coverageFixture.evidence_claims.fact_ledger).filter(
        (/** @type {any} */ fact) => fact.fact_id === 'fact_grounded'
      ),
      conflicts: []
    },
    obligations,
    caseDrafts: {
      schema_version: '1.0.0', source_revision: coverageFixture.source_revision,
      cases,
      obligation_dispositions: [{
        obligation_id: 'obligation_grounded', status: 'case_candidate',
        case_ids: cases.map((draft) => draft.case_id)
      }],
      exploratory_candidates: []
    }
  };
}

/** @param {any} draft @param {string} ref @param {boolean} keepExisting */
function replaceDirectEvidence(draft, ref, keepExisting) {
  if (!keepExisting) draft.evidence_refs = draft.evidence_refs.filter(
    (/** @type {string} */ item) => item !== ref.replace('_alternate', '')
  );
  draft.evidence_refs = [...new Set([...draft.evidence_refs, ref])].sort();
}

/** @param {any[]} cases @param {any[]} extraClaims */
function classifyFixtureCases(cases, extraClaims) {
  for (const draft of cases) refreshExecutionSignature(draft);
  return classifyCaseDrafts(fixtureClassificationContext(cases, extraClaims));
}

test('executionSignature contains only normalized frozen dimensions', () => {
  const first = baseCase();
  first.role.value = '  buye\u0301r   role ';
  first.preconditions.push({
    ...structuredClone(first.preconditions[0]), condition: '  address   is valid ', reachable_from: 'cart is ready'
  });
  first.data.push({
    ...structuredClone(first.data[0]), name: ' currency ', value: ' USD '
  });
  first.steps[0].action = '  Submit   checkout  ';
  first.steps[0].expectations[0].expectation_id = 'oracle_😀';
  refreshExecutionSignature(first);
  first.execution_signature.test_point_ids = ['obligation_aaaaaaaaaaaaaaaa'];
  first.execution_signature.source_revision = 99;
  first.execution_signature.timestamp = '2099-01-01T00:00:00Z';
  const second = baseCase();
  second.role.value = 'buyér role';
  second.preconditions.unshift({
    ...structuredClone(second.preconditions[0]), condition: 'address is valid', reachable_from: 'cart is ready'
  });
  second.data.unshift({
    ...structuredClone(second.data[0]), name: 'currency', value: 'USD'
  });
  second.steps[0].action = 'Submit checkout';
  second.steps[0].expectations[0].expectation_id = 'oracle_😀';
  refreshExecutionSignature(second);
  second.execution_signature.test_point_ids = ['obligation_bbbbbbbbbbbbbbbb'];

  assert.equal(executionSignature(first), executionSignature(second));
  assert.doesNotMatch(executionSignature(first), /source_revision|timestamp|test_point/u);
});

test('every execution dimension keeps Cases separate', () => {
  const original = baseCase();
  for (const boundary of signatureBoundaries) {
    const changed = structuredClone(original);
    if (boundary.dimension === 'role') changed.role.value = boundary.value;
    if (boundary.dimension === 'precondition_state') changed.preconditions[0].condition = boundary.value;
    if (boundary.dimension === 'data_partition') changed.data[0].value = boundary.value;
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
      changed.steps[0].expectations[0].oracle.expected_state = boundary.value[0];
    }
    refreshExecutionSignature(changed);
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
  refreshExecutionSignature(first);
  const second = structuredClone(first);
  second.steps.reverse();
  refreshExecutionSignature(second);

  assert.notEqual(executionSignature(first), executionSignature(second));
});

test('signature encoding is NUL-safe and compares Unicode by code point', () => {
  const first = baseCase();
  first.execution_signature.action_path = ['a\0b', 'c'];
  first.steps = ['a\0b', 'c'].map((action, index) => ({ ...structuredClone(first.steps[0]), step_id: `step_${index}`, action }));
  refreshExecutionSignature(first);
  const second = baseCase();
  second.steps = ['a', 'b\0c'].map((action, index) => ({ ...structuredClone(second.steps[0]), step_id: `step_${index}`, action }));
  refreshExecutionSignature(second);

  assert.notEqual(executionSignature(first), executionSignature(second));
});

test('precondition and data signature dimensions are derived from actual Case semantics, not submitted strings', () => {
  /** @type {Array<(draft: any) => void>} */
  const mutations = [
    (draft) => { draft.preconditions[0].reachable_from = 'saved cart'; },
    (draft) => { draft.data[0].value = '99.99'; }
  ];
  for (const mutate of mutations) {
    const draft = baseCase();
    const before = executionSignature(draft);
    mutate(draft);
    assert.notEqual(executionSignature(draft), before);
    const result = classifyCaseDrafts(classificationContext({ cases: [draft] }));
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.match(result.blocked[0].reason, /EXECUTION_SIGNATURE_MISMATCH/u);
  }
});

test('data provenance is not an execution partition and provenance-only variants never remain separate executable Cases', () => {
  const first = baseCase();
  const second = baseCase({ case_id: 'case_2222222222222222' });
  second.data[0].provenance.ref = 'claim_data_equivalent';
  second.evidence_refs = second.evidence_refs.map((/** @type {string} */ ref) =>
    ref === 'claim_data' ? 'claim_data_equivalent' : ref);
  refreshExecutionSignature(second);

  assert.equal(executionSignature(first), executionSignature(second));

  const result = classifyCaseDrafts(classificationContext({
    claims: [...baseClaims(), acceptedClaim('claim_data_equivalent', 'E2')],
    cases: [first, second],
    dispositions: [{
      obligation_id: IDS.obligation,
      status: 'case_candidate',
      case_ids: [first.case_id, second.case_id]
    }]
  }));
  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.diagnostics.some((item) => item.code === 'DUPLICATE_SIGNATURE_SEMANTIC_CONFLICT'), true);
});

function exactDuplicateContext() {
  const secondObligationId = 'obligation_2222222222222222';
  const secondCaseId = 'case_2222222222222222';
  const secondFactId = 'fact_checkout_secondary';
  const alternateOracle = acceptedClaim('claim_oracle_alternate', 'E2', {
    kind: 'expected-value', derivation_kind: 'formula', derivation_target: 'expected-value',
    parent_claim_ids: ['claim_oracle'], rule_input: { expression: 'accepted' }
  });
  const claims = [...baseClaims(), acceptedClaim('claim_fact_secondary'), alternateOracle];
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
  secondCase.steps[0].expectations[0].closes_obligation_id = secondObligationId;
  secondCase.steps[0].expectations[0].evidence_ref = alternateOracle.claim_id;
  secondCase.steps[0].expectations[0].oracle_evidence_refs = ['claim_oracle', alternateOracle.claim_id];
  secondCase.evidence_refs.push(alternateOracle.claim_id);
  refreshExecutionSignature(firstCase);
  refreshExecutionSignature(secondCase);
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

test('same-signature Cases never silently discard single-valued evidence or provenance', async (/** @type {any} */ t) => {
  /** @type {Array<[string,string,boolean,(draft:any,claimId:string)=>void]>} */
  const fields = [
    ['role evidence', 'claim_role_alternate', false,
      (draft, claimId) => { draft.role.evidence_ref = claimId; }],
    ['precondition evidence', 'claim_grounded_alternate', true,
      (draft, claimId) => { draft.preconditions[0].evidence_ref = claimId; }],
    ['data provenance', 'claim_data_alternate', false,
      (draft, claimId) => { draft.data[0].provenance.ref = claimId; }],
    ['action evidence', 'claim_action_alternate', false,
      (draft, claimId) => { draft.steps[0].action_evidence_ref = claimId; }],
    ['capability provenance', 'claim_capability_alternate', true,
      (draft, claimId) => { draft.testability_profile.capabilities[0].provenance_ref = claimId; }],
    ['observer provenance', 'claim_capability_alternate', true,
      (draft, claimId) => { draft.testability_profile.observers[0].provenance_ref = claimId; }],
    ['control provenance', 'claim_capability_alternate', true,
      (draft, claimId) => { draft.testability_profile.controls[0].provenance_ref = claimId; }],
    ['post-state evidence', 'claim_oracle_grounded_alternate', true,
      (draft, claimId) => { draft.post_state.evidence_ref = claimId; }],
    ['cleanup evidence', 'claim_cleanup_alternate', false,
      (draft, claimId) => { draft.cleanup.no_cleanup_evidence_ref = claimId; }]
  ];
  for (const [name, claimId, keepExisting, mutate] of fields) await t.test(name, () => {
    const alternate = acceptedClaim(claimId, 'E3', { kind: 'description' });
    const first = structuredClone(coverageFixture.classification.grounded[0]);
    const second = structuredClone(first);
    second.case_id = `case_${claimId}`;
    mutate(second, claimId);
    replaceDirectEvidence(second, claimId, keepExisting);

    const forward = classifyFixtureCases([first, second], [alternate]);
    assert.equal(forward.grounded.length, 0, JSON.stringify(forward));
    assert.equal(forward.diagnostics.some(
      (item) => item.code === 'DUPLICATE_SIGNATURE_SEMANTIC_CONFLICT'
    ), true, JSON.stringify(forward));

    const reverse = classifyFixtureCases([structuredClone(second), structuredClone(first)], [alternate]);
    assert.deepEqual(reverse, forward);
  });
});

test('same-signature set-valued provenance is merged losslessly and replayable', async (/** @type {any} */ t) => {
  const alternate = acceptedClaim('claim_precondition_alternate', 'E3', { kind: 'description' });
  const first = structuredClone(coverageFixture.classification.grounded[0]);
  const second = structuredClone(first);
  second.case_id = 'case_precondition_alternate';
  second.preconditions[0].source_claim_ids.push(alternate.claim_id);
  second.evidence_refs.push(alternate.claim_id);

  const firstPass = classifyFixtureCases([first, second], [alternate]);
  assert.equal(firstPass.grounded.length, 1, JSON.stringify(firstPass));
  assert.deepEqual(firstPass.diagnostics, []);
  const merged = /** @type {any} */ (structuredClone(firstPass.grounded[0]));

  await t.test('preserves every nested source association', () => {
    assert.deepEqual(merged.preconditions[0].source_claim_ids, [
      'claim_grounded', alternate.claim_id
    ].sort());
  });

  await t.test('reclassifies without weakening the exact evidence summary', () => {
    const replay = classifyFixtureCases([structuredClone(merged)], [alternate]);
    assert.equal(replay.grounded.length, 1, JSON.stringify(replay));
    assert.deepEqual(replay.diagnostics, []);
  });

  await t.test('passes the independent coverage replay', () => {
    const coverage = structuredClone(coverageFixture);
    coverage.evidence_claims.claims.push(structuredClone(alternate));
    coverage.classification.grounded = [structuredClone(merged)];
    assert.doesNotThrow(() => buildBundle(coverage));
  });
});

test('same-signature merge preserves complete Oracle ownership and remains valid on replay', () => {
  const secondObligationId = 'obligation_2222222222222222';
  const secondCaseId = 'case_2222222222222222';
  const obligations = [
    baseObligation(),
    baseObligation({
      obligation_id: secondObligationId,
      view_element_refs: ['view_checkout#edge_secondary']
    })
  ];
  /** @param {any[]} cases */
  const makeContext = (cases) => {
    const context = classificationContext({
      obligations,
      cases,
      dispositions: obligations.map((obligation, index) => ({
        obligation_id: obligation.obligation_id,
        status: 'case_candidate',
        case_ids: [cases[Math.min(index, cases.length - 1)].case_id]
      }))
    });
    context.obligations.fact_routes[0].obligation_ids.push(secondObligationId);
    return context;
  };

  const insufficientFirst = baseCase();
  const insufficientSecond = baseCase({
    case_id: secondCaseId,
    obligation_ids: [secondObligationId]
  });
  const insufficient = classifyCaseDrafts(makeContext([insufficientFirst, insufficientSecond]));
  assert.equal(insufficient.grounded.length + insufficient.conditional.length + insufficient.blocked.length, 0);
  assert.equal(insufficient.diagnostics.some((item) =>
    item.code === 'EXPECTATION_CLOSE_TARGET_UNLINKED'
      || item.code === 'OBLIGATION_ORACLE_EXPECTATION_UNMAPPED'), true);

  const sufficientFirst = baseCase();
  const sufficientSecond = baseCase({
    case_id: secondCaseId,
    obligation_ids: [secondObligationId]
  });
  sufficientSecond.steps[0].expectations[0].closes_obligation_id = secondObligationId;
  refreshExecutionSignature(sufficientFirst);
  refreshExecutionSignature(sufficientSecond);
  const firstPass = classifyCaseDrafts(makeContext([sufficientFirst, sufficientSecond]));
  assert.equal(firstPass.grounded.length, 1);
  assert.deepEqual(firstPass.diagnostics, []);

  const merged = firstPass.grounded[0];
  const replayDraft = refreshExecutionSignature(structuredClone(merged));
  const replay = classificationContext({
    obligations,
    cases: [replayDraft],
    dispositions: obligations.map((obligation) => ({
      obligation_id: obligation.obligation_id,
      status: 'case_candidate',
      case_ids: [merged.case_id]
    }))
  });
  replay.obligations.fact_routes[0].obligation_ids.push(secondObligationId);
  const secondPass = classifyCaseDrafts(replay);
  assert.equal(secondPass.grounded.length, 1);
  assert.deepEqual(secondPass.diagnostics, []);
});

test('merged Case preserves complete explicit Oracle closures without Test Point signature IDs', () => {
  const obligationIds = [IDS.obligation, 'obligation_2222222222222222'];
  const caseIds = [IDS.case, 'case_2222222222222222'];
  const baseObligations = [
    baseObligation(),
    baseObligation({
      obligation_id: obligationIds[1],
      view_element_refs: ['view_checkout#edge_second']
    })
  ];
  /** @param {boolean} reverse */
  const makeContext = (reverse = false) => {
    const cases = caseIds.map((caseId, index) => {
      const draft = baseCase({ case_id: caseId, obligation_ids: [obligationIds[index]] });
      draft.steps[0].expectations[0].closes_obligation_id = obligationIds[index];
      if (index === 1) {
        draft.steps[0].step_id = 'step_submit_alternate';
        draft.steps[0].expectations[0].preceding_action_id = 'step_submit_alternate';
      }
      refreshExecutionSignature(draft);
      return draft;
    });
    const obligations = structuredClone(baseObligations);
    const dispositions = obligationIds.map((obligationId, index) => ({
      obligation_id: obligationId,
      status: 'case_candidate',
      case_ids: [caseIds[index]]
    }));
    if (reverse) {
      cases.reverse();
      obligations.reverse();
      dispositions.reverse();
    }
    const context = classificationContext({ obligations, cases, dispositions });
    context.obligations.fact_routes[0].obligation_ids = [...obligationIds].reverse();
    return context;
  };
  /** @param {any} merged */
  const replay = (merged) => {
    const replayDraft = refreshExecutionSignature(structuredClone(merged));
    const context = classificationContext({
      obligations: structuredClone(baseObligations),
      cases: [replayDraft],
      dispositions: obligationIds.map((obligationId) => ({
        obligation_id: obligationId,
        status: 'case_candidate',
        case_ids: [merged.case_id]
      }))
    });
    context.obligations.fact_routes[0].obligation_ids = [...obligationIds];
    return classifyCaseDrafts(context);
  };

  const forward = classifyCaseDrafts(makeContext());
  assert.equal(forward.grounded.length, 1);
  assert.deepEqual(forward.diagnostics, []);
  const merged = /** @type {any} */ (forward.grounded[0]);
  assert.deepEqual(merged.obligation_ids, obligationIds);
  assert.equal(Object.hasOwn(merged.execution_signature, 'test_point_ids'), false);
  assert.deepEqual(merged.steps[0].expectations.map(
    (/** @type {any} */ item) => item.closes_obligation_id
  ).sort(), obligationIds);
  assert.equal(merged.steps[0].expectations.every(
    (/** @type {any} */ item) => item.preceding_action_id === merged.steps[0].step_id
  ), true);
  const replayed = replay(merged);
  assert.equal(replayed.grounded.length, 1);
  assert.deepEqual(replayed.diagnostics, []);

  const reverse = classifyCaseDrafts(makeContext(true));
  assert.deepEqual(reverse, forward);
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
  second.data[0].value = '99.99';
  refreshExecutionSignature(second);
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
    ['Oracle wording', (draft) => { draft.steps[0].expectations[0].business_assertion = 'A conflicting Oracle explanation'; }],
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

test('same-signature cleanup action order remains an ordered semantic conflict', () => {
  const first = baseCase();
  const second = baseCase({ case_id: 'case_2222222222222222' });
  for (const draft of [first, second]) draft.cleanup = {
    required: true,
    steps: ['Release checkout lock', 'Restore checkout fixture'],
    evidence_ref: 'claim_cleanup',
    support_review: 'supported'
  };
  second.cleanup.steps.reverse();
  const context = classificationContext({
    cases: [first, second],
    dispositions: [{
      obligation_id: IDS.obligation,
      status: 'case_candidate',
      case_ids: [first.case_id, second.case_id]
    }]
  });
  const result = classifyCaseDrafts(context);

  assert.equal(result.diagnostics.some(
    (item) => item.code === 'DUPLICATE_SIGNATURE_SEMANTIC_CONFLICT'
  ), true, JSON.stringify(result));
  assert.equal(result.grounded.length, 0);
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
    draft.steps[0].expectations[0].closes_obligation_id = obligationId;
    draft.data[0].value = `partition-${index}`;
    refreshExecutionSignature(draft);
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

test('same-signature bucket insertion performs only linear array iteration work', () => {
  const size = 160;
  const cases = Array.from({ length: size }, (_, index) => baseCase({
    case_id: `case_${index.toString(16).padStart(16, '0')}`
  }));
  const context = classificationContext({
    cases,
    dispositions: [{
      obligation_id: IDS.obligation, status: 'case_candidate', case_ids: cases.map((item) => item.case_id)
    }]
  });
  const nativeGet = Map.prototype.get;
  let bucketIterationYields = 0;
  /** @this {Map<unknown, unknown>} @param {unknown} key */
  function instrumentedGet(key) {
    const value = nativeGet.call(this, key);
    const isSignatureBucket = Array.isArray(value) && typeof key === 'string'
      && key.includes('"action_path"') && (new Error().stack?.includes('deduplicateCases') ?? false);
    if (!isSignatureBucket) return value;
    return new Proxy(value, {
      get(target, property, receiver) {
        if (property !== Symbol.iterator) return Reflect.get(target, property, receiver);
        return function* countedBucketIterator() {
          for (let index = 0; index < target.length; index += 1) {
            bucketIterationYields += 1;
            yield target[index];
          }
        };
      }
    });
  }
  Map.prototype.get = /** @type {any} */ (instrumentedGet);
  let result;
  try {
    result = classifyCaseDrafts(context);
  } finally {
    Map.prototype.get = nativeGet;
  }

  assert.equal(result.grounded.length, 1);
  assert.equal(bucketIterationYields <= size, true,
    `same-signature insertion iterated ${bucketIterationYields} existing bucket values for ${size} Cases`);
});

test('blocked propagation visits the obligation-to-Case graph linearly while preserving transitive blocking', () => {
  const size = 120;
  const obligations = Array.from({ length: size }, (_, index) => baseObligation({
    obligation_id: `obligation_${index.toString(16).padStart(16, '0')}`,
    view_element_refs: [`view_checkout#edge_${index}`]
  }));
  /** @type {any[]} */
  const cases = [];
  for (let index = 0; index < size - 1; index += 1) {
    const obligationIds = [obligations[index].obligation_id, obligations[index + 1].obligation_id];
    const draft = baseCase({
      case_id: `case_${index.toString(16).padStart(16, '0')}`,
      obligation_ids: obligationIds
    });
    draft.steps[0].expectations[0].closes_obligation_id = obligationIds[0];
    draft.steps[0].expectations.push({
      ...structuredClone(draft.steps[0].expectations[0]),
      expectation_id: `expectation_bridge_${index.toString(16).padStart(8, '0')}`,
      closes_obligation_id: obligationIds[1]
    });
    refreshExecutionSignature(draft);
    cases.push(draft);
  }
  const invalid = baseCase({
    case_id: 'case_ffffffffffffffff',
    obligation_ids: [obligations[size - 1].obligation_id]
  });
  invalid.steps[0].expectations[0].closes_obligation_id = obligations[size - 1].obligation_id;
  invalid.steps[0].expectations[0].oracle.expected_state = '';
  cases.push(invalid);
  const dispositions = obligations.map((obligation, obligationIndex) => ({
    obligation_id: obligation.obligation_id,
    status: 'case_candidate',
    case_ids: cases.filter((draft) => draft.obligation_ids.includes(obligation.obligation_id)).map((draft) => draft.case_id)
  }));
  const context = classificationContext({ obligations, cases, dispositions });
  context.obligations.fact_routes[0].obligation_ids = obligations.map((item) => item.obligation_id);
  const nativeSome = Array.prototype.some;
  let someCalls = 0;
  /** @this {unknown[]} @param {(value: unknown, index: number, array: unknown[]) => unknown} callback @param {unknown} thisArg */
  function instrumentedSome(callback, thisArg) {
    if (new Error().stack?.includes('classifyCaseDrafts')) someCalls += 1;
    return nativeSome.call(this, callback, thisArg);
  }
  Array.prototype.some = /** @type {any} */ (instrumentedSome);
  let result;
  try {
    result = classifyCaseDrafts(context);
  } finally {
    Array.prototype.some = nativeSome;
  }

  assert.equal(result.blocked.length, size);
  assert.equal(someCalls <= size * 20, true,
    `blocked propagation called Array#some ${someCalls} times for ${size} obligations`);
});
