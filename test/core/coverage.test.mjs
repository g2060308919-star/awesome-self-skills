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
    const rootId = `root_scale_${suffix}`;
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
    const rootIssueKey = canonicalStringify({ missing_type: 'oracle', scope: `scale/${suffix}`, semantic_refs: [claimId] });
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
