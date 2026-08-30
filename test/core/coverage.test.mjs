import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { canonicalStringify, stableId } from '../../src/canonical.mjs';
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

/** @returns {any} */
function conditionalContext() {
  const input = context();
  input.evidence_claims.claims.push({
    claim_id: 'claim_assumption', claim_form: 'decision-record', level: 'E1', kind: 'assumption',
    scope: 'checkout', value: 'Treat checkout control as temporarily available.',
    source_locator_ids: ['locator_checkout'], decision_id: 'decision_assumption', authority: 'product-owner'
  });
  const candidate = input.classification.grounded.pop();
  candidate.testability_profile.capabilities[0].status = 'approved-assumption';
  candidate.testability_profile.capabilities[0].provenance_ref = 'claim_assumption';
  candidate.temporary_assumption = {
    claim_id: 'claim_assumption', invalidation_condition: 'The owner rejects the temporary rule.'
  };
  candidate.evidence_refs = [...new Set([...candidate.evidence_refs, 'claim_assumption'])].sort();
  input.classification.conditional.push(candidate);
  const point = input.clarification.semantic_snapshot.formal_test_points.find(
    (/** @type {any} */ item) => item.obligation_id === 'obligation_grounded'
  );
  point.classification = 'conditional';
  point.evidence_level = 'E1';
  input.clarification.semantic_snapshot.delivery_sections.grounded = [];
  input.clarification.semantic_snapshot.delivery_sections.conditional = ['obligation_grounded'];
  return input;
}

/** @param {number} size */
function sharedAssumptionClosureContext(size) {
  const input = context();
  /** @type {any[]} */
  const chain = [{
    claim_id: 'claim_shared_chain_0000', claim_form: 'direct', level: 'E3', kind: 'requirement',
    scope: 'checkout', value: 'shared root', source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
  }];
  for (let index = 1; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const previous = String(index - 1).padStart(4, '0');
    chain.push({
      claim_id: `claim_shared_chain_${suffix}`, claim_form: 'derived', level: 'E2', kind: 'expected-value',
      scope: 'checkout', value: `shared ${suffix}`, source_locator_ids: ['locator_checkout'],
      derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
      parent_claim_ids: [`claim_shared_chain_${previous}`], parameters: { table_id: `table_shared_${suffix}` },
      rule_input: { conditions: [`shared ${suffix}`], outcome: `shared ${suffix}` }
    });
  }
  const finalClaim = `claim_shared_chain_${String(size - 1).padStart(4, '0')}`;
  const facts = [];
  const obligations = [];
  const routes = [];
  const cases = [];
  const points = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const factId = `fact_shared_${suffix}`;
    const obligationId = `obligation_shared_${suffix}`;
    facts.push({ fact_id: factId, claim_id: 'claim_grounded', status: 'active', source_claim_ids: ['claim_grounded'] });
    obligations.push({
      obligation_id: obligationId, kind: 'flow', risk: 'high', scope: 'checkout',
      source_claim_ids: ['claim_grounded'], view_element_refs: [`view_checkout#shared_${suffix}`],
      required_oracle_refs: [finalClaim], required_capabilities: ['checkout-control']
    });
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [obligationId] });
    points.push({ obligation_id: obligationId, evidence_level: 'E2', classification: 'grounded', blocked_reason: null });
    const candidate = structuredClone(input.classification.grounded[0]);
    candidate.case_id = `case_shared_${suffix}`;
    candidate.fact_ids = [factId];
    candidate.obligation_ids = [obligationId];
    candidate.steps[0].expectations[0].expectation_id = `expectation_shared_${suffix}`;
    candidate.steps[0].expectations[0].evidence_ref = finalClaim;
    candidate.evidence_refs = [...new Set([...candidate.evidence_refs, finalClaim])].sort();
    candidate.execution_signature.oracle_refs = [`expectation_shared_${suffix}`];
    candidate.execution_signature.test_point_ids = [obligationId];
    cases.push(candidate);
  }
  input.evidence_claims.claims.push(...chain);
  input.evidence_claims.fact_ledger = facts;
  input.obligations_artifact.obligations = obligations;
  input.obligations_artifact.fact_routes = routes;
  input.obligations_artifact.interaction_routes = [];
  input.classification = { grounded: cases, conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: [] };
  input.clarification.root_issues = [];
  input.clarification.pending_root_issues = [];
  input.clarification.state = {
    source_revision: 4, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: [],
    last_pending_root_issue_ids: [], last_question_set_digest: '',
    clarification_stop: { reason: 'converged', source_revision: 4 }, semantic_snapshot: null, root_snapshot_ledger: []
  };
  input.clarification.semantic_snapshot = {
    formal_test_points: points, coverage_denominator: size,
    delivery_sections: {
      grounded: obligations.map((item) => item.obligation_id), conditional: [], blocked: [], exploratory: [],
      coverage: { formal_denominator: size }, quality: { delivery_status: 'executable_subset_ready' }
    }
  };
  return input;
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

test('executable lanes revalidate the complete temporary-assumption downgrade closure', () => {
  const valid = conditionalContext();
  assert.equal(buildBundle(valid).conditional.length, 1);

  for (const invalidationCondition of ['', '   ', '\n\t']) {
    const invalidCondition = conditionalContext();
    invalidCondition.classification.conditional[0].temporary_assumption.invalidation_condition = invalidationCondition;
    assert.equal(
      diagnosticCodes(() => buildBundle(invalidCondition)).includes('CASE_TEMPORARY_ASSUMPTION_INVALID'),
      true,
      JSON.stringify(invalidationCondition)
    );
  }

  const groundedStray = context();
  groundedStray.classification.grounded[0].temporary_assumption = {
    claim_id: 'claim_grounded', invalidation_condition: 'The accepted requirement changes.'
  };
  assert.equal(diagnosticCodes(() => buildBundle(groundedStray)).includes('CASE_TEMPORARY_ASSUMPTION_UNEXPECTED'), true);

  const dangling = conditionalContext();
  dangling.classification.conditional[0].temporary_assumption.claim_id = 'claim_missing';
  assert.equal(diagnosticCodes(() => buildBundle(dangling)).includes('CASE_TEMPORARY_ASSUMPTION_INVALID'), true);

  const mismatch = conditionalContext();
  mismatch.classification.conditional[0].temporary_assumption.claim_id = 'claim_capability';
  assert.equal(diagnosticCodes(() => buildBundle(mismatch)).includes('CASE_TEMPORARY_ASSUMPTION_MISMATCH'), true);

  const unconsumed = conditionalContext();
  unconsumed.classification.conditional[0].testability_profile.capabilities[0] = {
    capability: 'checkout-control', status: 'provided', provenance_ref: 'claim_capability'
  };
  assert.equal(diagnosticCodes(() => buildBundle(unconsumed)).includes('CASE_DOWNGRADE_ROOT_MISSING'), true);

  const outsideScope = conditionalContext();
  outsideScope.evidence_claims.claims.find(
    (/** @type {any} */ claim) => claim.claim_id === 'claim_assumption'
  ).scope = 'checkout/other';
  assert.equal(diagnosticCodes(() => buildBundle(outsideScope)).includes('CASE_TEMPORARY_ASSUMPTION_INVALID'), true);

  const unsupported = conditionalContext();
  unsupported.classification.conditional[0].role.support_review = 'uncertain';
  assert.equal(diagnosticCodes(() => buildBundle(unsupported)).includes('CASE_SUPPORT_REVIEW_INVALID'), true);

  const multiple = conditionalContext();
  multiple.evidence_claims.claims.push({
    claim_id: 'claim_assumption_observer', claim_form: 'decision-record', level: 'E1', kind: 'assumption',
    scope: 'checkout', value: 'Treat order observation as temporarily available.',
    source_locator_ids: ['locator_checkout'], decision_id: 'decision_assumption_observer', authority: 'product-owner'
  });
  const candidate = multiple.classification.conditional[0];
  candidate.testability_profile.observers[0].status = 'approved-assumption';
  candidate.testability_profile.observers[0].provenance_ref = 'claim_assumption_observer';
  candidate.evidence_refs = [...new Set([...candidate.evidence_refs, 'claim_assumption_observer'])].sort();
  assert.equal(diagnosticCodes(() => buildBundle(multiple)).includes('CASE_DOWNGRADE_ROOTS_AMBIGUOUS'), true);
});

test('temporary-assumption downgrade summaries are propagated once per evidence DAG', () => {
  const nativeAdd = Set.prototype.add;
  const measurements = [];
  try {
    for (const size of [40, 80, 160]) {
      let chainAdds = 0;
      Set.prototype.add = function (value) {
        if (typeof value === 'string' && value.startsWith('claim_shared_chain_')) chainAdds += 1;
        return Reflect.apply(nativeAdd, this, [value]);
      };
      assert.equal(buildBundle(sharedAssumptionClosureContext(size)).grounded.length, size);
      measurements.push(chainAdds);
    }
  } finally {
    Set.prototype.add = nativeAdd;
  }
  assert.equal(measurements.every((count, index) => count <= [40, 80, 160][index] * 25), true, measurements.join('/'));
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

test('the accepted fact ledger is the requirement denominator and every fact has exactly one route', () => {
  /** @type {Array<{code:string,apply:(input:any)=>void}>} */
  const mutations = [
    {
      code: 'REQUIREMENT_FACT_ROUTE_MISSING',
      apply(input) {
        input.evidence_claims.claims.push({
          claim_id: 'claim_unrouted', claim_form: 'direct', level: 'E3', kind: 'requirement',
          scope: 'checkout', value: 'A real accepted fact without a route.',
          source_locator_ids: ['locator_unrouted'], source_id: 'source_prd'
        });
        input.evidence_claims.fact_ledger.push({
          fact_id: 'fact_unrouted', claim_id: 'claim_unrouted', status: 'active',
          source_claim_ids: ['claim_unrouted']
        });
      }
    },
    {
      code: 'FACT_ROUTE_FACT_UNKNOWN',
      apply(input) {
        input.obligations_artifact.fact_routes.push({
          fact_id: 'fact_fabricated', route_type: 'obligations', obligation_ids: ['obligation_grounded']
        });
      }
    },
    {
      code: 'CASE_FACT_UNKNOWN',
      apply(input) {
        input.classification.grounded[0].fact_ids.push('fact_fabricated');
      }
    },
    {
      code: 'REQUIREMENT_FACT_ROUTE_DUPLICATE',
      apply(input) {
        input.obligations_artifact.fact_routes.push(structuredClone(input.obligations_artifact.fact_routes[0]));
      }
    }
  ];
  for (const mutation of mutations) {
    const input = context();
    mutation.apply(input);
    assert.equal(diagnosticCodes(() => buildBundle(input)).includes(mutation.code), true, mutation.code);
  }
});

test('NotApplicable revalidates accepted supported scoped independent exclusion evidence', () => {
  /** @type {Array<[string,(input:any)=>void]>} */
  const cases = [
    ['NOT_APPLICABLE_EXCLUSION_UNKNOWN', (input) => {
      input.evidence_claims.claims = input.evidence_claims.claims.filter((/** @type {any} */ claim) => claim.claim_id !== 'claim_exclusion');
    }],
    ['NOT_APPLICABLE_EXCLUSION_LEVEL_INVALID', (input) => {
      const claim = input.evidence_claims.claims.find((/** @type {any} */ item) => item.claim_id === 'claim_exclusion');
      Object.assign(claim, {
        claim_form: 'decision-record', level: 'E1', kind: 'assumption',
        decision_id: 'decision_exclusion', authority: 'product-owner'
      });
      delete claim.source_id;
    }],
    ['NOT_APPLICABLE_EXCLUSION_REVIEW_INVALID', (input) => {
      input.classification.not_applicable[0].support_review = 'uncertain';
    }],
    ['NOT_APPLICABLE_EXCLUSION_SCOPE_INVALID', (input) => {
      input.evidence_claims.claims.find((/** @type {any} */ item) => item.claim_id === 'claim_exclusion').scope = 'checkout/other';
    }],
    ['NOT_APPLICABLE_EXCLUSION_RELATED', (input) => {
      const claim = input.evidence_claims.claims.find((/** @type {any} */ item) => item.claim_id === 'claim_exclusion');
      Object.assign(claim, {
        claim_form: 'derived', level: 'E2', kind: 'model-element',
        derivation_kind: 'graph-reachability', derivation_target: 'model-element',
        parent_claim_ids: ['claim_legacy'], parameters: { graph_id: 'legacy_scope' },
        rule_input: { from: 'legacy', to: 'excluded' }
      });
      delete claim.source_id;
    }],
    ['FORMAL_EVIDENCE_REFERENCE_UNKNOWN', (input) => {
      input.obligations_artifact.obligations.find(
        (/** @type {any} */ obligation) => obligation.obligation_id === 'obligation_na'
      ).source_claim_ids = ['claim_missing'];
    }]
  ];
  for (const [code, mutate] of cases) {
    const input = context();
    mutate(input);
    assert.equal(diagnosticCodes(() => buildBundle(input)).includes(code), true, code);
  }
});

test('NotApplicable independence includes fact evidence routed to the excluded formal Test Point', () => {
  const input = context();
  input.evidence_claims.claims.push({
    claim_id: 'claim_na_fact', claim_form: 'direct', level: 'E3', kind: 'requirement',
    scope: 'checkout/legacy', value: 'Legacy behavior remains a formal fact.',
    source_locator_ids: ['locator_na_fact'], source_id: 'source_prd'
  });
  input.evidence_claims.fact_ledger.push({
    fact_id: 'fact_na_support', claim_id: 'claim_na_fact', status: 'active', source_claim_ids: ['claim_na_fact']
  });
  input.obligations_artifact.fact_routes.push({
    fact_id: 'fact_na_support', route_type: 'obligations', obligation_ids: ['obligation_na']
  });
  const exclusion = input.evidence_claims.claims.find((/** @type {any} */ item) => item.claim_id === 'claim_exclusion');
  Object.assign(exclusion, {
    claim_form: 'derived', level: 'E2', kind: 'model-element',
    derivation_kind: 'graph-reachability', derivation_target: 'model-element',
    parent_claim_ids: ['claim_na_fact'], parameters: { graph_id: 'legacy_scope' },
    rule_input: { from: 'legacy', to: 'excluded' }
  });
  delete exclusion.source_id;

  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('NOT_APPLICABLE_EXCLUSION_RELATED'), true);
});

test('NotApplicable accepts the real Task 8 shape where a normative fact routes to the excluded obligation', () => {
  const input = context();
  input.obligations_artifact.fact_routes[2] = {
    fact_id: 'fact_na', route_type: 'obligations', obligation_ids: ['obligation_na']
  };

  const bundle = buildBundle(input);
  assert.deepEqual(bundle.coverage.not_applicable, [{
    obligation_id: 'obligation_na', exclusion_claim_id: 'claim_exclusion',
    scope: 'checkout/legacy', support_review: 'supported'
  }]);
  assert.deepEqual(bundle.coverage.requirements.entries.find((/** @type {any} */ item) => item.fact_id === 'fact_na'), {
    fact_id: 'fact_na', status: 'not_applicable'
  });
});

test('terminal NotApplicable fact routes form a requirement-only ledger independent of formal dispositions', () => {
  assert.equal(buildBundle(context()).coverage.requirements.entries.find(
    (/** @type {any} */ item) => item.fact_id === 'fact_na'
  ).status, 'not_applicable');

  const terminalOnly = context();
  terminalOnly.obligations_artifact.obligations = terminalOnly.obligations_artifact.obligations.filter(
    (/** @type {any} */ obligation) => obligation.obligation_id !== 'obligation_na'
  );
  terminalOnly.classification.not_applicable = [];
  terminalOnly.clarification.semantic_snapshot.formal_test_points = terminalOnly.clarification.semantic_snapshot.formal_test_points.filter(
    (/** @type {any} */ point) => point.obligation_id !== 'obligation_na'
  );
  terminalOnly.clarification.semantic_snapshot.coverage_denominator = 2;
  terminalOnly.clarification.semantic_snapshot.delivery_sections.coverage.formal_denominator = 2;
  const terminalBundle = buildBundle(terminalOnly);
  assert.equal(terminalBundle.coverage.formal.total, 2);
  assert.deepEqual(terminalBundle.coverage.not_applicable, []);
  assert.deepEqual(terminalBundle.coverage.requirements.entries.find(
    (/** @type {any} */ item) => item.fact_id === 'fact_na'
  ), { fact_id: 'fact_na', status: 'not_applicable' });

  const missing = context();
  missing.obligations_artifact.fact_routes.find(
    (/** @type {any} */ route) => route.fact_id === 'fact_na'
  ).not_applicable_claim_id = 'claim_missing';
  assert.equal(diagnosticCodes(() => buildBundle(missing)).includes('NOT_APPLICABLE_ROUTE_TARGET_INVALID'), true);

  const broadPrimaryFact = context();
  broadPrimaryFact.evidence_claims.claims.push({
    claim_id: 'claim_na_broad', claim_form: 'direct', level: 'E3', kind: 'requirement',
    scope: 'checkout', value: 'A broad fact cannot use a narrow exclusion.',
    source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
  });
  const broadFact = broadPrimaryFact.evidence_claims.fact_ledger.find(
    (/** @type {any} */ item) => item.fact_id === 'fact_na'
  );
  broadFact.claim_id = 'claim_na_broad';
  broadFact.source_claim_ids = ['claim_legacy'];
  assert.equal(diagnosticCodes(() => buildBundle(broadPrimaryFact)).includes('NOT_APPLICABLE_ROUTE_SCOPE_INVALID'), true);

  const dependentTarget = context();
  dependentTarget.evidence_claims.claims.push({
    claim_id: 'claim_na_primary', claim_form: 'direct', level: 'E3', kind: 'requirement',
    scope: 'checkout/legacy', value: 'A separate terminal fact.',
    source_locator_ids: ['locator_legacy'], source_id: 'source_prd'
  });
  const dependentFact = dependentTarget.evidence_claims.fact_ledger.find(
    (/** @type {any} */ item) => item.fact_id === 'fact_na'
  );
  dependentFact.claim_id = 'claim_na_primary';
  dependentFact.source_claim_ids = ['claim_legacy'];
  const exclusion = dependentTarget.evidence_claims.claims.find(
    (/** @type {any} */ item) => item.claim_id === 'claim_exclusion'
  );
  Object.assign(exclusion, {
    claim_form: 'derived', level: 'E2', kind: 'model-element',
    derivation_kind: 'graph-reachability', derivation_target: 'model-element',
    parent_claim_ids: ['claim_na_primary'], parameters: { graph_id: 'terminal_scope' },
    rule_input: { from: 'terminal', to: 'excluded' }
  });
  delete exclusion.source_id;
  assert.equal(diagnosticCodes(() => buildBundle(dependentTarget)).includes('NOT_APPLICABLE_ROUTE_TARGET_RELATED'), true);

  const directTargetFact = context();
  directTargetFact.evidence_claims.fact_ledger.find(
    (/** @type {any} */ item) => item.fact_id === 'fact_na'
  ).source_claim_ids.push('claim_exclusion');
  assert.equal(diagnosticCodes(() => buildBundle(directTargetFact)).includes('NOT_APPLICABLE_ROUTE_TARGET_RELATED'), true);

  const wrongStatus = context();
  wrongStatus.classification.not_applicable[0].status = 'grounded';
  assert.equal(diagnosticCodes(() => buildBundle(wrongStatus)).includes('NOT_APPLICABLE_STATUS_INVALID'), true);
});

/** @param {any} input @param {string} status */
function appendHistoricalBlockedRoot(input, status = 'suppressed_deferred') {
  input.evidence_claims.claims.push({
    claim_id: 'claim_blocked_old', claim_form: 'derived', level: 'E2', kind: 'expected-value',
    scope: 'checkout/refund', value: 'legacy blocked evidence', source_locator_ids: ['locator_refund'],
    derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
    parent_claim_ids: ['claim_blocked'], parameters: { table_id: 'legacy_refund' },
    rule_input: { conditions: ['legacy refund'], outcome: 'legacy blocked evidence' }
  });
  const signature = {
    missing_type: 'oracle-old', semantic_refs: ['claim_blocked_old'], scope: 'checkout/refund'
  };
  const root = {
    root_issue_id: stableId('root', signature), root_issue_key: canonicalStringify(signature),
    ...signature, affected_obligation_ids: ['obligation_blocked'],
    risk_counts: { critical: 1, high: 0, medium: 0, low: 0 },
    question: 'What legacy state proves failure?', answerable: true,
    reasons: ['MISSING_ORACLE'], evidence_refs: ['claim_blocked_old'], current: false
  };
  input.clarification.state.root_snapshot_ledger.push(root);
  input.clarification.state.root_issue_dispositions.push({ root_issue_id: root.root_issue_id, status });
  return root;
}

test('Blocked ownership prefers the unique current root over retained history and binds the Task 8 blocker', () => {
  const input = context();
  appendHistoricalBlockedRoot(input);
  const bundle = buildBundle(input);
  assert.equal(bundle.blocked[0].root_issue_id, input.clarification.root_issues[0].root_issue_id);

  const dangling = context();
  dangling.classification.blocked[0].root_issue_id = 'root_dangling';
  assert.equal(diagnosticCodes(() => buildBundle(dangling)).includes('BLOCKED_ROOT_ID_MISMATCH'), true);

  const forgedLedgerId = context();
  forgedLedgerId.clarification.root_issues[0].root_issue_id = 'root_forged';
  forgedLedgerId.clarification.state.root_snapshot_ledger[0].root_issue_id = 'root_forged';
  forgedLedgerId.clarification.state.root_issue_dispositions[0].root_issue_id = 'root_forged';
  forgedLedgerId.classification.blocked[0].root_issue_id = 'root_forged';
  assert.equal(diagnosticCodes(() => buildBundle(forgedLedgerId)).includes('ROOT_LEDGER_ID_MISMATCH'), true);
});

test('Blocked ownership falls back only to one unresolved retained or reopened historical root', () => {
  for (const status of ['suppressed_unknown', 'suppressed_deferred', 'open']) {
    const input = context();
    const retained = appendHistoricalBlockedRoot(input, status);
    input.clarification.root_issues = [];
    input.clarification.state.root_snapshot_ledger[0].current = false;
    input.clarification.state.root_issue_dispositions[0].status = 'resolved_final';
    input.classification.blocked[0].root_issue_id = retained.root_issue_id;
    assert.equal(buildBundle(input).blocked[0].root_issue_id, retained.root_issue_id, status);
  }

  const resolved = context();
  const retained = appendHistoricalBlockedRoot(resolved, 'resolved_final');
  resolved.clarification.root_issues = [];
  resolved.clarification.state.root_snapshot_ledger[0].current = false;
  resolved.clarification.state.root_issue_dispositions[0].status = 'resolved_final';
  resolved.classification.blocked[0].root_issue_id = retained.root_issue_id;
  assert.equal(diagnosticCodes(() => buildBundle(resolved)).includes('BLOCKED_ROOT_TRACE_INVALID'), true);
});

test('resolved historical roots do not revalidate removed obligations or evidence against the current revision', () => {
  const input = context();
  const signature = { missing_type: 'oracle-old', semantic_refs: ['claim_removed'], scope: 'archived' };
  const rootId = stableId('root', signature);
  input.clarification.state.root_snapshot_ledger.push({
    root_issue_id: rootId, root_issue_key: canonicalStringify(signature), ...signature,
    affected_obligation_ids: ['obligation_removed'],
    risk_counts: { critical: 0, high: 0, medium: 0, low: 1 },
    question: 'What used to prove the removed behavior?', answerable: true,
    reasons: ['MISSING_ORACLE'], evidence_refs: ['claim_removed'], current: false
  });
  input.clarification.state.root_issue_dispositions.push({ root_issue_id: rootId, status: 'resolved_final' });

  assert.equal(buildBundle(input).blocked.length, 1);
});

test('Blocked root evidence and claim semantic refs remain accepted and inside the obligation closure', () => {
  const danglingEvidence = context();
  danglingEvidence.clarification.root_issues[0].evidence_refs = ['claim_missing'];
  danglingEvidence.clarification.state.root_snapshot_ledger[0].evidence_refs = ['claim_missing'];
  assert.equal(diagnosticCodes(() => buildBundle(danglingEvidence)).includes('BLOCKED_ROOT_EVIDENCE_INVALID'), true);

  const unrelatedSemantic = context();
  unrelatedSemantic.evidence_claims.claims.push({
    claim_id: 'claim_unrelated_root', claim_form: 'direct', level: 'E3', kind: 'description',
    scope: 'checkout/refund', value: 'Unrelated prose', source_locator_ids: ['locator_refund'], source_id: 'source_prd'
  });
  const signature = {
    missing_type: 'oracle', semantic_refs: ['claim_unrelated_root'], scope: 'checkout/refund'
  };
  const rootId = stableId('root', signature);
  Object.assign(unrelatedSemantic.clarification.root_issues[0], {
    root_issue_id: rootId, root_issue_key: canonicalStringify(signature), ...signature,
    semantic_refs: [...signature.semantic_refs],
    evidence_refs: ['claim_unrelated_root']
  });
  Object.assign(unrelatedSemantic.clarification.state.root_snapshot_ledger[0], {
    root_issue_id: rootId, root_issue_key: canonicalStringify(signature), ...signature,
    semantic_refs: [...signature.semantic_refs],
    evidence_refs: ['claim_unrelated_root']
  });
  unrelatedSemantic.clarification.state.root_issue_dispositions[0].root_issue_id = rootId;
  unrelatedSemantic.classification.blocked[0].root_issue_id = rootId;
  const unrelatedCodes = diagnosticCodes(() => buildBundle(unrelatedSemantic));
  assert.equal(unrelatedCodes.includes('BLOCKED_ROOT_EVIDENCE_INVALID'), true, unrelatedCodes.join(','));
});

test('Case evidence is the exact accepted direct-root summary reconstructed from every frozen nested field', () => {
  const mutations = [
    { code: 'CASE_EVIDENCE_REFERENCE_UNKNOWN', apply: (/** @type {any} */ input) => { input.classification.grounded[0].role.evidence_ref = 'claim_missing'; } },
    { code: 'CASE_EVIDENCE_REFERENCE_UNKNOWN', apply: (/** @type {any} */ input) => { input.classification.grounded[0].steps[0].action_evidence_ref = 'claim_missing'; } },
    { code: 'CASE_EVIDENCE_REFERENCE_UNKNOWN', apply: (/** @type {any} */ input) => { input.classification.grounded[0].cleanup.no_cleanup_evidence_ref = 'claim_missing'; } },
    { code: 'CASE_EVIDENCE_SUMMARY_MISMATCH', apply: (/** @type {any} */ input) => { input.classification.grounded[0].evidence_refs.push('claim_latency_risk'); } },
    { code: 'CASE_EVIDENCE_SUMMARY_MISMATCH', apply: (/** @type {any} */ input) => {
      input.evidence_claims.claims.push({
        claim_id: 'claim_oracle_child', claim_form: 'derived', level: 'E2', kind: 'expected-value',
        scope: 'checkout', value: 'accepted', source_locator_ids: ['locator_checkout'],
        derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
        parent_claim_ids: ['claim_oracle_grounded'], parameters: { table_id: 'checkout_child' },
        rule_input: { conditions: ['cart is ready'], outcome: 'accepted' }
      });
      input.classification.grounded[0].steps[0].expectations[0].evidence_ref = 'claim_oracle_child';
    } },
    { code: 'CASE_ORACLE_OWNERSHIP_INCOMPLETE', apply: (/** @type {any} */ input) => {
      input.evidence_claims.claims.push({
        claim_id: 'claim_unrelated_oracle', claim_form: 'direct', level: 'E3', kind: 'description',
        scope: 'inventory', value: 'Inventory remains stable.',
        source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
      });
      const candidate = input.classification.grounded[0];
      candidate.steps[0].expectations[0].evidence_ref = 'claim_unrelated_oracle';
      candidate.post_state.evidence_ref = 'claim_unrelated_oracle';
      candidate.evidence_refs = candidate.evidence_refs.filter(
        (/** @type {string} */ ref) => ref !== 'claim_oracle_grounded'
      );
      candidate.evidence_refs.push('claim_unrelated_oracle');
      candidate.evidence_refs.sort();
    } }
  ];
  for (const mutation of mutations) {
    const input = context();
    mutation.apply(input);
    assert.equal(diagnosticCodes(() => buildBundle(input)).includes(mutation.code), true, mutation.code);
  }
});

test('every Case independently includes every normative fact routed to its linked Test Points', () => {
  const input = context();
  input.evidence_claims.fact_ledger.push({
    fact_id: 'fact_grounded_second', claim_id: 'claim_grounded', status: 'active',
    source_claim_ids: ['claim_grounded']
  });
  input.obligations_artifact.fact_routes.push({
    fact_id: 'fact_grounded_second', route_type: 'obligations', obligation_ids: ['obligation_grounded']
  });
  input.classification.grounded[0].fact_ids.push('fact_grounded_second');
  const incomplete = structuredClone(input.classification.grounded[0]);
  incomplete.case_id = 'case_grounded_incomplete';
  incomplete.title = 'Grounded checkout without the complete fact route';
  incomplete.fact_ids = incomplete.fact_ids.filter((/** @type {string} */ id) => id !== 'fact_grounded_second');
  input.classification.grounded.push(incomplete);

  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('CASE_FACT_ROUTE_LINK_MISSING'), true);
});

test('Exploratory output accepts only accepted independent source claims', () => {
  const input = context();
  input.classification.exploratory[0].source_claim_ids = ['claim_forged_exploratory'];
  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('EXPLORATORY_EVIDENCE_INVALID'), true);
});

test('Exploratory evidence cannot be a derived sibling sharing accepted formal ancestry', () => {
  const input = context();
  input.evidence_claims.claims.push({
    claim_id: 'claim_shared_ancestor', claim_form: 'direct', level: 'E3', kind: 'requirement',
    scope: 'checkout', value: 'Shared accepted checkout basis.',
    source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
  });
  for (const [claimId, outcome] of [
    ['claim_oracle_grounded', 'order accepted'], ['claim_latency_risk', 'latency risk']
  ]) {
    const claim = input.evidence_claims.claims.find((/** @type {any} */ item) => item.claim_id === claimId);
    Object.assign(claim, {
      claim_form: 'derived', level: 'E2', kind: 'expected-value',
      derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
      parent_claim_ids: ['claim_shared_ancestor'], parameters: { table_id: `shared_${claimId}` },
      rule_input: { conditions: ['shared checkout basis'], outcome }
    });
    delete claim.source_id;
  }

  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('EXPLORATORY_EVIDENCE_INVALID'), true);
});

test('Blocked and Exploratory submitted evidence lists stay canonical and duplicate-free', () => {
  const blocked = context();
  blocked.classification.blocked[0].evidence_refs.push(blocked.classification.blocked[0].evidence_refs[0]);
  assert.equal(diagnosticCodes(() => buildBundle(blocked)).includes('STRING_ARRAY_INVALID'), true);

  const exploratory = context();
  exploratory.classification.exploratory[0].source_claim_ids.push(
    exploratory.classification.exploratory[0].source_claim_ids[0]
  );
  assert.equal(diagnosticCodes(() => buildBundle(exploratory)).includes('STRING_ARRAY_INVALID'), true);
});

test('empty Task 8 blocker and Task 9 root evidence summaries remain valid canonical arrays', () => {
  const input = context();
  const signature = {
    missing_type: input.clarification.root_issues[0].missing_type,
    semantic_refs: ['view_refund#failure'], scope: input.clarification.root_issues[0].scope
  };
  const rootId = stableId('root', signature);
  input.classification.blocked[0].evidence_refs = [];
  input.classification.blocked[0].root_issue_id = rootId;
  Object.assign(input.clarification.root_issues[0], {
    root_issue_id: rootId, root_issue_key: canonicalStringify(signature),
    missing_type: signature.missing_type, semantic_refs: [...signature.semantic_refs],
    scope: signature.scope, evidence_refs: []
  });
  Object.assign(input.clarification.state.root_snapshot_ledger[0], {
    root_issue_id: rootId, root_issue_key: canonicalStringify(signature),
    missing_type: signature.missing_type, semantic_refs: [...signature.semantic_refs],
    scope: signature.scope, evidence_refs: []
  });
  input.clarification.state.root_issue_dispositions[0].root_issue_id = rootId;

  assert.equal(buildBundle(input).blocked.length, 1);
});

test('diagnostic and descriptive facts stay outside the normative requirement denominator', () => {
  const input = context();
  input.evidence_claims.claims.push(
    {
      claim_id: 'claim_diagnostic_fact', claim_form: 'direct', level: 'E3', kind: 'diagnostic',
      scope: 'checkout', value: 'Runtime trace only', source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
    },
    {
      claim_id: 'claim_description_fact', claim_form: 'direct', level: 'E3', kind: 'description',
      scope: 'checkout', value: 'Background prose only', source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
    }
  );
  input.evidence_claims.fact_ledger.push(
    { fact_id: 'fact_diagnostic', claim_id: 'claim_diagnostic_fact', status: 'diagnostic', source_claim_ids: ['claim_diagnostic_fact'] },
    { fact_id: 'fact_description', claim_id: 'claim_description_fact', status: 'active', source_claim_ids: ['claim_description_fact'] }
  );

  const bundle = buildBundle(input);
  assert.equal(bundle.coverage.requirements.total, 3);
  assert.equal(bundle.coverage.requirements.entries.some((/** @type {any} */ item) => item.fact_id === 'fact_diagnostic'), false);
  assert.equal(bundle.coverage.requirements.entries.some((/** @type {any} */ item) => item.fact_id === 'fact_description'), false);
});

test('current Task 9 roots must exactly match authoritative current root ledger entries', () => {
  /** @type {Array<(input:any)=>void>} */
  const mutations = [
    (input) => { input.clarification.root_issues[0].root_issue_id = 'root_forged'; },
    (input) => { input.clarification.root_issues[0].question = 'Forged recovery question?'; },
    (input) => { input.clarification.root_issues[0].semantic_refs = ['claim_forged']; },
    (input) => { input.clarification.root_issues[0].evidence_refs = ['claim_forged']; },
    (input) => { input.clarification.state.root_snapshot_ledger[0].current = false; }
  ];
  for (const mutate of mutations) {
    const input = context();
    mutate(input);
    const codes = diagnosticCodes(() => buildBundle(input));
    assert.equal(codes.some((code) => code.startsWith('ROOT_LEDGER_')), true, codes.join(','));
  }
});

test('Task 9 root ledger records and lifecycle dispositions remain closed', () => {
  const unknown = context();
  unknown.clarification.state.root_snapshot_ledger[0].free_text = 'not frozen';
  assert.equal(diagnosticCodes(() => buildBundle(unknown)).includes('ROOT_LEDGER_PROPERTY_UNKNOWN'), true);

  const invalidDisposition = context();
  invalidDisposition.clarification.state.root_issue_dispositions[0].status = 'invented';
  assert.equal(diagnosticCodes(() => buildBundle(invalidDisposition)).includes('ROOT_LEDGER_DISPOSITION_INVALID'), true);
});

test('entry snapshot uses only own data descriptors and never executes submitted accessors', () => {
  for (const nested of [false, true]) {
    const input = context();
    let reads = 0;
    const target = nested ? input.lineage : input;
    const key = nested ? 'source_digest' : 'source_revision';
    Object.defineProperty(target, key, {
      enumerable: true,
      get() { reads += 1; return nested ? 'a'.repeat(64) : 4; }
    });
    const codes = diagnosticCodes(() => buildBundle(input));
    assert.equal(reads, 0);
    assert.equal(codes.includes('ACCESSOR_NOT_ALLOWED'), true, codes.join(','));
  }

  let inheritedReads = 0;
  const own = context();
  delete own.source_revision;
  const inherited = Object.create({
    get source_revision() { inheritedReads += 1; return 4; }
  }, Object.getOwnPropertyDescriptors(own));
  const inheritedCodes = diagnosticCodes(() => buildBundle(inherited));
  assert.equal(inheritedReads, 0);
  assert.equal(inheritedCodes.some((code) => code === 'RECORD_PROTOTYPE_INVALID' || code === 'CONTEXT_PROPERTY_MISSING'), true);
});

test('entry snapshot rejects submitted array iteration hooks without calling them', () => {
  const input = context();
  let calls = 0;
  Object.defineProperty(input.limits, Symbol.iterator, {
    enumerable: false,
    value() { calls += 1; return [][Symbol.iterator](); }
  });
  const codes = diagnosticCodes(() => buildBundle(input));
  assert.equal(calls, 0);
  assert.equal(codes.includes('ARRAY_SYMBOL_PROPERTY_INVALID'), true, codes.join(','));
});

test('entry snapshot never invokes inherited numeric array setters while copying data', () => {
  const input = context();
  input.limits = Array.from({ length: 301 }, (_, index) => `limit-${index}`);
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, '300');
  const nativeDefine = Object.defineProperty;
  let setterCalls = 0;
  try {
    Object.defineProperty(Array.prototype, '300', {
      configurable: true,
      set(value) {
        if (this.length === 301) setterCalls += 1;
        nativeDefine(this, '300', { value, enumerable: true, writable: true, configurable: true });
      }
    });
    assert.equal(buildBundle(input).quality.limits.length, 301);
  } finally {
    if (descriptor) Object.defineProperty(Array.prototype, '300', descriptor);
    else delete Array.prototype[300];
  }
  assert.equal(setterCalls, 0);
});

test('entry snapshot rejects sparse, named, and custom-prototype controlled arrays', () => {
  /** @type {Array<{code:string,apply:(input:any)=>void}>} */
  const mutations = [
    {
      code: 'ARRAY_HOLE',
      apply(input) { input.limits = new Array(2); input.limits[1] = 'retained'; }
    },
    {
      code: 'ARRAY_NAMED_PROPERTY_INVALID',
      apply(input) { input.limits.extra = 'not allowed'; }
    },
    {
      code: 'ARRAY_PROTOTYPE_INVALID',
      apply(input) { Object.setPrototypeOf(input.limits, Object.create(Array.prototype)); }
    }
  ];
  for (const mutation of mutations) {
    const input = context();
    mutation.apply(input);
    assert.equal(diagnosticCodes(() => buildBundle(input)).includes(mutation.code), true, mutation.code);
  }
});

test('entry snapshot rejects huge sparse arrays with descriptor-bounded work', () => {
  const nativeHasOwn = Object.hasOwn;
  const measurements = [];
  try {
    for (const length of [10_000, 80_000]) {
      const input = context();
      input.limits = new Array(length);
      input.limits[length - 1] = 'retained';
      let hasOwnCalls = 0;
      Object.hasOwn = function (...args) {
        hasOwnCalls += 1;
        return Reflect.apply(nativeHasOwn, this, args);
      };
      const codes = diagnosticCodes(() => buildBundle(input));
      assert.equal(codes.includes('ARRAY_HOLE'), true);
      assert.equal(codes.includes('DIAGNOSTICS_TRUNCATED'), true);
      measurements.push(hasOwnCalls);
    }
  } finally {
    Object.hasOwn = nativeHasOwn;
  }
  assert.equal(measurements[0] < 5_000, true, measurements.join('/'));
  assert.equal(measurements[1] <= measurements[0] + 100, true, measurements.join('/'));
});

test('descriptor capture failures return structured reconciliation diagnostics rather than raw errors', () => {
  const target = context();
  const proxy = Proxy.revocable(target, {});
  proxy.revoke();
  const codes = diagnosticCodes(() => buildBundle(proxy.proxy));
  assert.equal(codes.some((code) => code === 'INPUT_DESCRIPTOR_UNREADABLE' || code === 'INPUT_NORMALIZATION_FAILED'), true);
});

test('entry snapshot never invokes replaceable array methods on submitted arrays', () => {
  const input = context();
  const submittedArrays = new WeakSet();
  const pending = [input];
  while (pending.length > 0) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) submittedArrays.add(value);
    for (const child of Reflect.ownKeys(Object.getOwnPropertyDescriptors(value))) {
      const descriptor = Object.getOwnPropertyDescriptor(value, child);
      if (descriptor && Object.hasOwn(descriptor, 'value')) pending.push(descriptor.value);
    }
  }
  const names = ['filter', 'map', 'sort', 'some', 'every', 'includes', 'flatMap'];
  const arrayPrototype = /** @type {any} */ (Array.prototype);
  /** @type {Map<string,Function>} */
  const originals = new Map(names.map((name) => [name, arrayPrototype[name]]));
  const originalIterator = Array.prototype[Symbol.iterator];
  let calls = 0;
  try {
    for (const name of names) arrayPrototype[name] = function (/** @type {any[]} */ ...args) {
      if (submittedArrays.has(this)) calls += 1;
      return Reflect.apply(/** @type {Function} */ (originals.get(name)), this, args);
    };
    Array.prototype[Symbol.iterator] = function () {
      if (submittedArrays.has(this)) calls += 1;
      return Reflect.apply(originalIterator, this, []);
    };
    buildBundle(input);
  } finally {
    for (const [name, implementation] of originals) arrayPrototype[name] = implementation;
    Array.prototype[Symbol.iterator] = originalIterator;
  }
  assert.equal(calls, 0);
});

test('entry diagnostics are bounded, canonical, and insertion-order independent', () => {
  /** @param {boolean} reversed @returns {any[]} */
  const make = (reversed) => {
    const input = context();
    const keys = Array.from({ length: 300 }, (_, index) => `unknown_${String(index).padStart(3, '0')}`);
    if (reversed) keys.reverse();
    for (const key of keys) Object.defineProperty(input, key, {
      enumerable: true,
      get() { throw new Error('must not execute'); }
    });
    try { buildBundle(input); } catch (error) { return /** @type {any} */ (error).diagnostics; }
    assert.fail('expected need_revision');
    return [];
  };
  const forward = make(false);
  const reverse = make(true);
  assert.equal(forward.length, 256);
  assert.equal(forward.filter((item) => item.code === 'DIAGNOSTICS_TRUNCATED').length, 1);
  assert.equal(canonicalStringify(forward), canonicalStringify(reverse));
});

/** @param {number} size */
function blockedScaleContext(size) {
  const input = context();
  const claims = [];
  const facts = [];
  const obligations = [];
  const routes = [];
  const blocked = [];
  const roots = [];
  const ledger = [];
  const dispositions = [];
  const points = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const claimId = `claim_scale_${suffix}`;
    const factId = `fact_scale_${suffix}`;
    const obligationId = `obligation_scale_${suffix}`;
    const rootSignature = { missing_type: 'oracle', semantic_refs: [claimId], scope: `scale/${suffix}` };
    const rootId = stableId('root', rootSignature);
    claims.push({
      claim_id: claimId, claim_form: 'direct', level: 'E3', kind: 'requirement',
      scope: `scale/${suffix}`, value: `Scale requirement ${suffix}`,
      source_locator_ids: [`locator_scale_${suffix}`], source_id: 'source_scale'
    });
    facts.push({ fact_id: factId, claim_id: claimId, status: 'active', source_claim_ids: [claimId] });
    obligations.push({
      obligation_id: obligationId, kind: 'flow', risk: 'medium', scope: `scale/${suffix}`,
      source_claim_ids: [claimId], view_element_refs: [`view_scale#${suffix}`],
      required_oracle_refs: [claimId], required_capabilities: []
    });
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [obligationId] });
    blocked.push({
      obligation_id: obligationId, root_issue_id: rootId, reason: 'MISSING_ORACLE',
      risk: 'medium', evidence_refs: [claimId]
    });
    const rootIssueKey = canonicalStringify(rootSignature);
    roots.push({
      root_issue_id: rootId, root_issue_key: rootIssueKey, missing_type: 'oracle',
      semantic_refs: [claimId], scope: `scale/${suffix}`, affected_obligation_ids: [obligationId],
      risk_counts: { critical: 0, high: 0, medium: 1, low: 0 }, source_revision: 4,
      question: `What proves scale ${suffix}?`, answerable: true, reasons: ['MISSING_ORACLE'],
      evidence_refs: [claimId], batch_id: null
    });
    ledger.push({
      root_issue_id: rootId, root_issue_key: rootIssueKey, missing_type: 'oracle',
      semantic_refs: [claimId], scope: `scale/${suffix}`, affected_obligation_ids: [obligationId],
      risk_counts: { critical: 0, high: 0, medium: 1, low: 0 },
      question: `What proves scale ${suffix}?`, answerable: true, reasons: ['MISSING_ORACLE'],
      evidence_refs: [claimId], current: true
    });
    dispositions.push({ root_issue_id: rootId, status: 'suppressed_deferred' });
    points.push({
      obligation_id: obligationId, evidence_level: 'E0', classification: 'blocked', blocked_reason: 'MISSING_ORACLE'
    });
  }
  input.evidence_claims.claims = claims;
  input.evidence_claims.fact_ledger = facts;
  input.obligations_artifact.obligations = obligations;
  input.obligations_artifact.fact_routes = routes;
  input.obligations_artifact.interaction_routes = [];
  input.classification = {
    grounded: [], conditional: [], blocked, not_applicable: [], exploratory: [], diagnostics: []
  };
  input.clarification.root_issues = roots;
  input.clarification.pending_root_issues = [];
  input.clarification.state = {
    source_revision: 4, clarification_event_seq: 1,
    asked_root_issue_ids: roots.map((root) => root.root_issue_id),
    root_issue_dispositions: dispositions, last_pending_root_issue_ids: [],
    last_question_set_digest: '', clarification_stop: { reason: 'user_requested_delivery', source_revision: 4 },
    semantic_snapshot: null, root_snapshot_ledger: ledger
  };
  input.clarification.semantic_snapshot = {
    formal_test_points: points, coverage_denominator: size,
    delivery_sections: {
      grounded: [], conditional: [], blocked: obligations.map((item) => item.obligation_id),
      exploratory: [], coverage: { formal_denominator: size }, quality: { delivery_status: 'no_deterministic_cases' }
    }
  };
  return input;
}

test('Blocked root lookup is indexed once instead of scanning every root for every Test Point', () => {
  const nativeIncludes = Array.prototype.includes;
  const measurements = [];
  for (const size of [250, 500, 1000, 2000]) {
    const input = blockedScaleContext(size);
    let comparisons = 0;
    try {
      Array.prototype.includes = function (...args) {
        comparisons += 1;
        return Reflect.apply(nativeIncludes, this, args);
      };
      assert.equal(buildBundle(input).blocked.length, size);
    } finally {
      Array.prototype.includes = nativeIncludes;
    }
    measurements.push(comparisons);
  }
  assert.equal(measurements.every((count, index) => count <= [250, 500, 1000, 2000][index] * 4), true, measurements.join('/'));
});

test('one grouped current root may retain union evidence from only one affected obligation', () => {
  const input = blockedScaleContext(2);
  const signature = { missing_type: 'oracle', semantic_refs: ['view_scale#shared'], scope: 'scale' };
  const rootId = stableId('root', signature);
  const shared = {
    root_issue_id: rootId, root_issue_key: canonicalStringify(signature), ...signature,
    affected_obligation_ids: ['obligation_scale_0000', 'obligation_scale_0001'],
    risk_counts: { critical: 0, high: 0, medium: 2, low: 0 },
    question: 'What proves the shared result?', answerable: true, reasons: ['MISSING_ORACLE'],
    evidence_refs: ['claim_scale_0000']
  };
  input.clarification.root_issues = [{ ...structuredClone(shared), source_revision: 4, batch_id: null }];
  input.clarification.state.root_snapshot_ledger = [{ ...structuredClone(shared), current: true }];
  input.clarification.state.root_issue_dispositions = [{ root_issue_id: rootId, status: 'suppressed_deferred' }];
  input.clarification.state.asked_root_issue_ids = [rootId];
  for (const blocker of input.classification.blocked) blocker.root_issue_id = rootId;
  input.classification.blocked[1].evidence_refs = [];

  assert.equal(buildBundle(input).blocked.length, 2);
});

test('a current Blocked owner cannot carry a resolved lifecycle disposition', () => {
  const input = context();
  input.clarification.state.root_issue_dispositions[0].status = 'resolved_final';
  assert.equal(diagnosticCodes(() => buildBundle(input)).includes('ROOT_LEDGER_DISPOSITION_CURRENT_INVALID'), true);
});

/** @param {number} size */
function notApplicableScaleContext(size) {
  const input = context();
  const claims = [];
  const facts = [];
  const obligations = [];
  const routes = [];
  const notApplicable = [];
  const points = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const factClaimId = `claim_na_fact_${suffix}`;
    const exclusionId = `claim_na_exclusion_${suffix}`;
    const factId = `fact_na_${suffix}`;
    const obligationId = `obligation_na_${suffix}`;
    claims.push(
      {
        claim_id: factClaimId, claim_form: 'direct', level: 'E3', kind: 'requirement',
        scope: `checkout/legacy/${suffix}`, value: `Legacy requirement ${suffix}`,
        source_locator_ids: ['locator_legacy'], source_id: 'source_prd'
      },
      {
        claim_id: exclusionId, claim_form: 'direct', level: 'E3', kind: 'requirement',
        scope: `checkout/legacy/${suffix}`, value: `Legacy exclusion ${suffix}`,
        source_locator_ids: ['locator_legacy_exclusion'], source_id: 'source_scope'
      }
    );
    facts.push({ fact_id: factId, claim_id: factClaimId, status: 'active', source_claim_ids: [factClaimId] });
    obligations.push({
      obligation_id: obligationId, kind: 'flow', risk: 'low', scope: `checkout/legacy/${suffix}`,
      source_claim_ids: [factClaimId], view_element_refs: [`view_checkout#legacy_${suffix}`],
      required_oracle_refs: [], required_capabilities: []
    });
    routes.push({ fact_id: factId, route_type: 'not_applicable', not_applicable_claim_id: exclusionId });
    notApplicable.push({
      obligation_id: obligationId, status: 'not_applicable', exclusion_claim_id: exclusionId,
      scope: `checkout/legacy/${suffix}`, support_review: 'supported'
    });
    points.push({ obligation_id: obligationId, evidence_level: 'E3', classification: 'not_applicable', blocked_reason: null });
  }
  input.evidence_claims.claims = claims;
  input.evidence_claims.fact_ledger = facts;
  input.obligations_artifact.obligations = obligations;
  input.obligations_artifact.fact_routes = routes;
  input.obligations_artifact.interaction_routes = [];
  input.classification = {
    grounded: [], conditional: [], blocked: [], not_applicable: notApplicable, exploratory: [], diagnostics: []
  };
  input.clarification.root_issues = [];
  input.clarification.pending_root_issues = [];
  input.clarification.state = {
    source_revision: 4, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: [],
    last_pending_root_issue_ids: [], last_question_set_digest: '',
    clarification_stop: { reason: 'converged', source_revision: 4 }, semantic_snapshot: null, root_snapshot_ledger: []
  };
  input.clarification.semantic_snapshot = {
    formal_test_points: points, coverage_denominator: size,
    delivery_sections: {
      grounded: [], conditional: [], blocked: [], exploratory: [],
      coverage: { formal_denominator: size }, quality: { delivery_status: 'no_applicable_formal_test_points' }
    }
  };
  return input;
}

test('NotApplicable route reconciliation is indexed instead of rescanning every route per obligation', () => {
  const nativeFilter = Array.prototype.filter;
  const measurements = [];
  for (const size of [100, 200, 400, 800]) {
    const input = notApplicableScaleContext(size);
    let routeVisits = 0;
    try {
      Array.prototype.filter = function (/** @type {any} */ callback, /** @type {any} */ thisArg) {
        if (this.length === size && this[0]?.route_type !== undefined) {
          return Reflect.apply(nativeFilter, this, [function (...args) {
            routeVisits += 1;
            return Reflect.apply(callback, thisArg, args);
          }]);
        }
        return Reflect.apply(nativeFilter, this, [callback, thisArg]);
      };
      assert.equal(buildBundle(input).coverage.not_applicable.length, size);
    } finally {
      Array.prototype.filter = nativeFilter;
    }
    measurements.push(routeVisits);
  }
  assert.equal(measurements.every((count, index) => count <= [100, 200, 400, 800][index] * 4), true, measurements.join('/'));
});

test('shared terminal exclusions do not scan the independent formal NotApplicable ledger', () => {
  const nativeGet = Map.prototype.get;
  const measurements = [];
  try {
    for (const size of [50, 100, 200]) {
      const input = notApplicableScaleContext(size);
      input.evidence_claims.claims.push({
        claim_id: 'claim_na_exclusion_shared', claim_form: 'direct', level: 'E3', kind: 'requirement',
        scope: 'checkout/legacy', value: 'All enumerated legacy paths are out of scope.',
        source_locator_ids: ['locator_legacy_exclusion'], source_id: 'source_scope'
      });
      for (const route of input.obligations_artifact.fact_routes) {
        route.not_applicable_claim_id = 'claim_na_exclusion_shared';
      }
      for (const disposition of input.classification.not_applicable) {
        disposition.exclusion_claim_id = 'claim_na_exclusion_shared';
      }
      let factClaimGets = 0;
      Map.prototype.get = function (key) {
        if (typeof key === 'string' && key.startsWith('claim_na_fact_')) factClaimGets += 1;
        return Reflect.apply(nativeGet, this, [key]);
      };
      assert.equal(buildBundle(input).coverage.requirements.total, size);
      measurements.push(factClaimGets);
    }
  } finally {
    Map.prototype.get = nativeGet;
  }
  assert.equal(measurements.every((count, index) => count <= [50, 100, 200][index] * 20), true, measurements.join('/'));
});

/** @param {number} size */
function denseOracleContext(size) {
  const input = context();
  const candidate = structuredClone(input.classification.grounded[0]);
  const obligations = [];
  const routes = [];
  const facts = [];
  const points = [];
  const expectations = [];
  const derivedClaims = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const obligationId = `obligation_dense_${suffix}`;
    const factId = `fact_dense_${suffix}`;
    const expectationId = `expectation_dense_${suffix}`;
    const evidenceRef = `claim_dense_${suffix}`;
    obligations.push({
      obligation_id: obligationId, kind: 'flow', risk: 'high', scope: 'checkout',
      source_claim_ids: ['claim_grounded'], view_element_refs: [`view_checkout#dense_${suffix}`],
      required_oracle_refs: ['claim_oracle_grounded'], required_capabilities: ['checkout-control']
    });
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [obligationId] });
    facts.push({ fact_id: factId, claim_id: 'claim_grounded', status: 'active', source_claim_ids: ['claim_grounded'] });
    points.push({ obligation_id: obligationId, evidence_level: 'E2', classification: 'grounded', blocked_reason: null });
    expectations.push({
      ...structuredClone(candidate.steps[0].expectations[0]), expectation_id: expectationId, evidence_ref: evidenceRef
    });
    derivedClaims.push({
      claim_id: evidenceRef, claim_form: 'derived', level: 'E2', kind: 'expected-value', scope: 'checkout',
      value: 'accepted', source_locator_ids: [`locator_dense_${suffix}`],
      derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
      parent_claim_ids: ['claim_oracle_grounded'], parameters: { table_id: `table_dense_${suffix}` },
      rule_input: { conditions: [`dense ${suffix}`], outcome: 'accepted' }
    });
  }
  candidate.case_id = 'case_dense';
  candidate.fact_ids = facts.map((item) => item.fact_id);
  candidate.obligation_ids = obligations.map((item) => item.obligation_id);
  candidate.steps[0].expectations = expectations;
  candidate.evidence_refs = [...new Set([...candidate.evidence_refs, ...derivedClaims.map((claim) => claim.claim_id)])].sort();
  candidate.execution_signature.oracle_refs = expectations.map((item) => item.expectation_id);
  candidate.execution_signature.test_point_ids = obligations.map((item) => item.obligation_id);
  input.evidence_claims.claims.push(...derivedClaims);
  input.evidence_claims.fact_ledger = facts;
  input.obligations_artifact.obligations = obligations;
  input.obligations_artifact.fact_routes = routes;
  input.obligations_artifact.interaction_routes = [];
  input.classification = {
    grounded: [candidate], conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
  };
  input.clarification.root_issues = [];
  input.clarification.pending_root_issues = [];
  input.clarification.state = {
    source_revision: 4, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: [],
    last_pending_root_issue_ids: [], last_question_set_digest: '',
    clarification_stop: { reason: 'converged', source_revision: 4 }, semantic_snapshot: null, root_snapshot_ledger: []
  };
  input.clarification.semantic_snapshot = {
    formal_test_points: points, coverage_denominator: size,
    delivery_sections: {
      grounded: obligations.map((item) => item.obligation_id), conditional: [], blocked: [], exploratory: [],
      coverage: { formal_denominator: size }, quality: { delivery_status: 'executable_subset_ready' }
    }
  };
  return input;
}

/** @param {number} size */
function prefixOracleContext(size) {
  const input = context();
  const candidate = structuredClone(input.classification.grounded[0]);
  const obligations = [];
  const points = [];
  const expectations = [];
  const prefixClaims = [];
  const facts = [];
  const routes = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const oracleId = `claim_prefix_oracle_${suffix}`;
    const evidenceRef = `claim_prefix_expectation_${suffix}`;
    prefixClaims.push({
      claim_id: oracleId, claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout',
      value: 'Prefix root Oracle', source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
    });
    prefixClaims.push({
      claim_id: evidenceRef, claim_form: 'derived', level: 'E2', kind: 'expected-value', scope: 'checkout',
      value: `prefix ${suffix}`, source_locator_ids: ['locator_checkout'],
      derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
      parent_claim_ids: index === 0 ? [oracleId] : [
        `claim_prefix_expectation_${String(index - 1).padStart(4, '0')}`, oracleId
      ],
      parameters: { table_id: `prefix_${suffix}` },
      rule_input: { conditions: [`prefix ${suffix}`], outcome: `prefix ${suffix}` }
    });
    const obligationId = `obligation_prefix_${suffix}`;
    obligations.push({
      obligation_id: obligationId, kind: 'flow', risk: 'high', scope: 'checkout',
      source_claim_ids: ['claim_grounded'], view_element_refs: [`view_checkout#prefix_${suffix}`],
      required_oracle_refs: [oracleId], required_capabilities: ['checkout-control']
    });
    points.push({ obligation_id: obligationId, evidence_level: 'E2', classification: 'grounded', blocked_reason: null });
    facts.push({
      fact_id: `fact_prefix_${suffix}`, claim_id: 'claim_grounded', status: 'active',
      source_claim_ids: ['claim_grounded']
    });
    routes.push({
      fact_id: `fact_prefix_${suffix}`, route_type: 'obligations', obligation_ids: [obligationId]
    });
    expectations.push({
      ...structuredClone(candidate.steps[0].expectations[0]),
      expectation_id: `expectation_prefix_${suffix}`, evidence_ref: evidenceRef
    });
  }
  candidate.case_id = 'case_prefix';
  candidate.fact_ids = facts.map((item) => item.fact_id);
  candidate.obligation_ids = obligations.map((item) => item.obligation_id);
  candidate.steps[0].expectations = expectations;
  candidate.evidence_refs = [...new Set([
    ...candidate.evidence_refs, ...prefixClaims.map((claim) => claim.claim_id)
  ])].sort();
  candidate.execution_signature.oracle_refs = expectations.map((item) => item.expectation_id);
  candidate.execution_signature.test_point_ids = obligations.map((item) => item.obligation_id);
  input.evidence_claims.claims.push(...prefixClaims);
  input.evidence_claims.fact_ledger = facts;
  input.obligations_artifact.obligations = obligations;
  input.obligations_artifact.fact_routes = routes;
  input.obligations_artifact.interaction_routes = [];
  input.classification = {
    grounded: [candidate], conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
  };
  input.clarification.root_issues = [];
  input.clarification.pending_root_issues = [];
  input.clarification.state = {
    source_revision: 4, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: [],
    last_pending_root_issue_ids: [], last_question_set_digest: '',
    clarification_stop: { reason: 'converged', source_revision: 4 }, semantic_snapshot: null, root_snapshot_ledger: []
  };
  input.clarification.semantic_snapshot = {
    formal_test_points: points, coverage_denominator: size,
    delivery_sections: {
      grounded: obligations.map((item) => item.obligation_id), conditional: [], blocked: [], exploratory: [],
      coverage: { formal_denominator: size }, quality: { delivery_status: 'executable_subset_ready' }
    }
  };
  return input;
}

test('prefix Oracle ancestry stays compressed without copying every required label to every descendant', () => {
  const nativeAdd = Set.prototype.add;
  const measurements = [];
  const associationMeasurements = [];
  for (const size of [20, 40, 80, 160]) {
    let prefixAdds = 0;
    let associationAdds = 0;
    try {
      Set.prototype.add = function (value) {
        if (typeof value === 'string' && value.startsWith('claim_prefix_')) prefixAdds += 1;
        if (typeof value === 'string' && value.startsWith('obligation_prefix_')) associationAdds += 1;
        return Reflect.apply(nativeAdd, this, [value]);
      };
      assert.equal(buildBundle(prefixOracleContext(size)).grounded.length, 1);
    } finally {
      Set.prototype.add = nativeAdd;
    }
    measurements.push(prefixAdds);
    associationMeasurements.push(associationAdds);
  }
  assert.equal(measurements.every((count, index) => count <= [20, 40, 80, 160][index] * 20), true, measurements.join('/'));
  assert.equal(
    associationMeasurements.every((count, index) => count <= [20, 40, 80, 160][index] * 20),
    true, associationMeasurements.join('/')
  );
});

test('general Oracle reachability never retains an unbounded pairwise boolean matrix', async () => {
  const source = await readFile(new URL('../../src/coverage.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('reachabilityByDescendant'), false);
});

test('dense accepted Oracle ownership compresses equivalent relations and never recurses through Cases', () => {
  const nativeHas = Set.prototype.has;
  const measurements = [];
  for (const size of [20, 40, 80, 160]) {
    let operations = 0;
    try {
      Set.prototype.has = function (...args) {
        operations += 1;
        return Reflect.apply(nativeHas, this, args);
      };
      assert.equal(buildBundle(denseOracleContext(size)).grounded.length, 1);
    } finally {
      Set.prototype.has = nativeHas;
    }
    measurements.push(operations);
  }
  assert.equal(measurements[3] <= measurements[2] * 2.8, true, measurements.join('/'));
});

/** @param {number} size */
function multiRootOracleContext(size) {
  const input = context();
  const candidate = structuredClone(input.classification.grounded[0]);
  const roots = [];
  const merges = [];
  for (let index = 0; index < size; index += 1) roots.push({
    claim_id: `claim_multi_root_${String(index).padStart(4, '0')}`,
    claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout', value: 'accepted',
    source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
  });
  for (let index = 1; index < size; index += 1) merges.push({
    claim_id: `claim_multi_merge_${String(index).padStart(4, '0')}`,
    claim_form: 'derived', level: 'E2', kind: 'expected-value', scope: 'checkout', value: 'accepted',
    source_locator_ids: ['locator_checkout'], derivation_kind: 'decision-table-instance',
    derivation_target: 'expected-value', parent_claim_ids: [
      index === 1 ? 'claim_multi_root_0000' : `claim_multi_merge_${String(index - 1).padStart(4, '0')}`,
      `claim_multi_root_${String(index).padStart(4, '0')}`
    ],
    parameters: { table_id: `table_multi_${index}` },
    rule_input: { conditions: [`merge ${index}`], outcome: 'accepted' }
  });
  const finalEvidence = `claim_multi_merge_${String(size - 1).padStart(4, '0')}`;
  input.evidence_claims.claims.push(...roots, ...merges);
  input.evidence_claims.fact_ledger = [{
    fact_id: 'fact_multi', claim_id: 'claim_grounded', status: 'active', source_claim_ids: ['claim_grounded']
  }];
  input.obligations_artifact.obligations = [{
    obligation_id: 'obligation_multi', kind: 'flow', risk: 'high', scope: 'checkout',
    source_claim_ids: ['claim_grounded'], view_element_refs: ['view_checkout#multi'],
    required_oracle_refs: roots.map((item) => item.claim_id), required_capabilities: ['checkout-control']
  }];
  input.obligations_artifact.fact_routes = [{
    fact_id: 'fact_multi', route_type: 'obligations', obligation_ids: ['obligation_multi']
  }];
  input.obligations_artifact.interaction_routes = [];
  candidate.case_id = 'case_multi';
  candidate.fact_ids = ['fact_multi'];
  candidate.obligation_ids = ['obligation_multi'];
  candidate.steps[0].expectations = [{
    ...candidate.steps[0].expectations[0], expectation_id: 'expectation_multi', evidence_ref: finalEvidence
  }];
  candidate.evidence_refs = [...new Set([
    ...candidate.evidence_refs, ...roots.map((item) => item.claim_id), finalEvidence
  ])].sort();
  candidate.execution_signature.oracle_refs = ['expectation_multi'];
  candidate.execution_signature.test_point_ids = ['obligation_multi'];
  input.classification = {
    grounded: [candidate], conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
  };
  input.clarification.root_issues = [];
  input.clarification.pending_root_issues = [];
  input.clarification.state = {
    source_revision: 4, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: [],
    last_pending_root_issue_ids: [], last_question_set_digest: '',
    clarification_stop: { reason: 'converged', source_revision: 4 }, semantic_snapshot: null, root_snapshot_ledger: []
  };
  input.clarification.semantic_snapshot = {
    formal_test_points: [{
      obligation_id: 'obligation_multi', evidence_level: 'E2', classification: 'grounded', blocked_reason: null
    }],
    coverage_denominator: 1,
    delivery_sections: {
      grounded: ['obligation_multi'], conditional: [], blocked: [], exploratory: [],
      coverage: { formal_denominator: 1 }, quality: { delivery_status: 'executable_subset_ready' }
    }
  };
  return input;
}

test('multi-root DAG Oracle compatibility visits each merge ancestry once per concrete expectation', () => {
  const nativeAdd = Set.prototype.add;
  const measurements = [];
  for (const size of [20, 40, 80, 160]) {
    let mergeVisits = 0;
    try {
      Set.prototype.add = function (value) {
        if (typeof value === 'string' && value.startsWith('claim_multi_merge_')) mergeVisits += 1;
        return Reflect.apply(nativeAdd, this, [value]);
      };
      assert.equal(buildBundle(multiRootOracleContext(size)).grounded.length, 1);
    } finally {
      Set.prototype.add = nativeAdd;
    }
    measurements.push(mergeVisits);
  }
  assert.equal(measurements.every((count, index) => count <= [20, 40, 80, 160][index] * 16), true, measurements.join('/'));
});

/** @param {number} size */
function sharedMultiRootExpectationsContext(size) {
  const input = multiRootOracleContext(size);
  const candidate = input.classification.grounded[0];
  const roots = input.obligations_artifact.obligations[0].required_oracle_refs;
  const finalMerge = `claim_multi_merge_${String(size - 1).padStart(4, '0')}`;
  const claims = [];
  const facts = [];
  const routes = [];
  const obligations = [];
  const points = [];
  const expectations = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const expectationRef = `claim_multi_leaf_${suffix}`;
    const obligationId = `obligation_multi_${suffix}`;
    const factId = `fact_multi_${suffix}`;
    claims.push({
      claim_id: expectationRef, claim_form: 'derived', level: 'E2', kind: 'expected-value',
      scope: 'checkout', value: `accepted ${suffix}`, source_locator_ids: ['locator_checkout'],
      derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
      parent_claim_ids: [finalMerge], parameters: { table_id: `table_multi_leaf_${suffix}` },
      rule_input: { conditions: [`leaf ${suffix}`], outcome: `accepted ${suffix}` }
    });
    facts.push({
      fact_id: factId, claim_id: 'claim_grounded', status: 'active', source_claim_ids: ['claim_grounded']
    });
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [obligationId] });
    obligations.push({
      obligation_id: obligationId, kind: 'flow', risk: 'high', scope: 'checkout',
      source_claim_ids: ['claim_grounded'], view_element_refs: [`view_checkout#multi_${suffix}`],
      required_oracle_refs: [...roots], required_capabilities: ['checkout-control']
    });
    points.push({ obligation_id: obligationId, evidence_level: 'E2', classification: 'grounded', blocked_reason: null });
    expectations.push({
      ...structuredClone(candidate.steps[0].expectations[0]),
      expectation_id: `expectation_multi_${suffix}`, evidence_ref: expectationRef
    });
  }
  input.evidence_claims.claims.push(...claims);
  input.evidence_claims.fact_ledger = facts;
  input.obligations_artifact.obligations = obligations;
  input.obligations_artifact.fact_routes = routes;
  candidate.fact_ids = facts.map((item) => item.fact_id);
  candidate.obligation_ids = obligations.map((item) => item.obligation_id);
  candidate.steps[0].expectations = expectations;
  candidate.evidence_refs = [...new Set([
    ...candidate.evidence_refs.filter((/** @type {string} */ ref) => ref !== finalMerge),
    ...claims.map((claim) => claim.claim_id)
  ])].sort();
  candidate.execution_signature.oracle_refs = expectations.map((item) => item.expectation_id);
  candidate.execution_signature.test_point_ids = obligations.map((item) => item.obligation_id);
  input.clarification.semantic_snapshot.formal_test_points = points;
  input.clarification.semantic_snapshot.coverage_denominator = size;
  input.clarification.semantic_snapshot.delivery_sections.grounded = obligations.map((item) => item.obligation_id);
  input.clarification.semantic_snapshot.delivery_sections.coverage.formal_denominator = size;
  return input;
}

test('multi-root ownership reuses shared expectation ancestry without retaining an expectation by root matrix', async () => {
  const nativeAdd = Set.prototype.add;
  const measurements = [];
  for (const size of [20, 40, 80]) {
    let mergeVisits = 0;
    try {
      Set.prototype.add = function (value) {
        if (typeof value === 'string' && value.startsWith('claim_multi_merge_')) mergeVisits += 1;
        return Reflect.apply(nativeAdd, this, [value]);
      };
      assert.equal(buildBundle(sharedMultiRootExpectationsContext(size)).grounded.length, 1);
    } finally {
      Set.prototype.add = nativeAdd;
    }
    measurements.push(mergeVisits);
  }
  assert.equal(measurements.every((count, index) => count <= [20, 40, 80][index] * 24), true, measurements.join('/'));
  const source = await readFile(new URL('../../src/coverage.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('coverageByExpectation'), false);
});

/** @param {number} size */
function manyCaseForestContext(size) {
  const input = context();
  const claims = [];
  const facts = [];
  const obligations = [];
  const routes = [];
  const cases = [];
  const points = [];
  for (let index = 0; index < size; index += 1) {
    const suffix = String(index).padStart(4, '0');
    const oracleId = `claim_case_oracle_${suffix}`;
    const evidenceRef = `claim_case_expectation_${suffix}`;
    const obligationId = `obligation_case_${suffix}`;
    const factId = `fact_case_${suffix}`;
    claims.push(
      {
        claim_id: oracleId, claim_form: 'direct', level: 'E3', kind: 'requirement', scope: 'checkout',
        value: 'accepted', source_locator_ids: ['locator_checkout'], source_id: 'source_prd'
      },
      {
        claim_id: evidenceRef, claim_form: 'derived', level: 'E2', kind: 'expected-value', scope: 'checkout',
        value: 'accepted', source_locator_ids: ['locator_checkout'],
        derivation_kind: 'decision-table-instance', derivation_target: 'expected-value',
        parent_claim_ids: [oracleId], parameters: { table_id: `table_case_${suffix}` },
        rule_input: { conditions: [`case ${suffix}`], outcome: 'accepted' }
      }
    );
    facts.push({ fact_id: factId, claim_id: 'claim_grounded', status: 'active', source_claim_ids: ['claim_grounded'] });
    obligations.push({
      obligation_id: obligationId, kind: 'flow', risk: 'high', scope: 'checkout',
      source_claim_ids: ['claim_grounded'], view_element_refs: [`view_checkout#case_${suffix}`],
      required_oracle_refs: [oracleId], required_capabilities: ['checkout-control']
    });
    routes.push({ fact_id: factId, route_type: 'obligations', obligation_ids: [obligationId] });
    points.push({ obligation_id: obligationId, evidence_level: 'E2', classification: 'grounded', blocked_reason: null });
    const candidate = structuredClone(input.classification.grounded[0]);
    candidate.case_id = `case_independent_${suffix}`;
    candidate.fact_ids = [factId];
    candidate.obligation_ids = [obligationId];
    candidate.steps[0].expectations[0].expectation_id = `expectation_case_${suffix}`;
    candidate.steps[0].expectations[0].evidence_ref = evidenceRef;
    candidate.evidence_refs = [...new Set([...candidate.evidence_refs, oracleId, evidenceRef])].sort();
    candidate.execution_signature.oracle_refs = [`expectation_case_${suffix}`];
    candidate.execution_signature.test_point_ids = [obligationId];
    cases.push(candidate);
  }
  input.evidence_claims.claims.push(...claims);
  input.evidence_claims.fact_ledger = facts;
  input.obligations_artifact.obligations = obligations;
  input.obligations_artifact.fact_routes = routes;
  input.obligations_artifact.interaction_routes = [];
  input.classification = {
    grounded: cases, conditional: [], blocked: [], not_applicable: [], exploratory: [], diagnostics: []
  };
  input.clarification.root_issues = [];
  input.clarification.pending_root_issues = [];
  input.clarification.state = {
    source_revision: 4, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: [],
    last_pending_root_issue_ids: [], last_question_set_digest: '',
    clarification_stop: { reason: 'converged', source_revision: 4 }, semantic_snapshot: null, root_snapshot_ledger: []
  };
  input.clarification.semantic_snapshot = {
    formal_test_points: points, coverage_denominator: size,
    delivery_sections: {
      grounded: obligations.map((item) => item.obligation_id), conditional: [], blocked: [], exploratory: [],
      coverage: { formal_denominator: size }, quality: { delivery_status: 'executable_subset_ready' }
    }
  };
  return input;
}

test('forest Oracle matching initializes Fenwick capacity from each Case local expectations only', () => {
  const nativeFill = Array.prototype.fill;
  const measurements = [];
  for (const size of [50, 100, 200]) {
    let localCells = 0;
    try {
      Array.prototype.fill = function (...args) {
        if (this.length === 2 && args[0] === 0) localCells += this.length;
        return Reflect.apply(nativeFill, this, args);
      };
      assert.equal(buildBundle(manyCaseForestContext(size)).grounded.length, size);
    } finally {
      Array.prototype.fill = nativeFill;
    }
    measurements.push(localCells);
  }
  assert.deepEqual(measurements, [100, 200, 400]);
});
