import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyCaseDrafts } from '../../src/classify.mjs';
import {
  IDS, acceptedClaim, baseCase, baseClaims, baseObligation, classificationContext
} from '../helpers/classification-context.mjs';

/** @param {ReturnType<typeof classificationContext>} context */
function blockedReason(context) {
  const result = classifyCaseDrafts(context);
  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.blocked.length, 1);
  return result.blocked[0].reason;
}

test('every key expectation requires all frozen Oracle and observation fields', () => {
  /** @type {Array<[string, (expectation: any) => void]>} */
  const mutations = [
    ['business_assertion', (expectation) => { expectation.business_assertion = ''; }],
    ['preceding_action_id', (expectation) => { delete expectation.preceding_action_id; }],
    ['observer', (expectation) => { expectation.observer = ''; }],
    ['observation_surface', (expectation) => { expectation.observation_surface = '   '; }],
    ['observation_target', (expectation) => { delete expectation.observation_target; }],
    ['expected result', (expectation) => { expectation.oracle.expected_state = ''; }],
    ['comparison', (expectation) => { delete expectation.oracle.comparison; }],
    ['evidence reference', (expectation) => { expectation.evidence_ref = ''; }],
    ['support review', (expectation) => { delete expectation.support_review; }]
  ];
  for (const [name, mutate] of mutations) {
    const context = classificationContext();
    mutate(context.caseDrafts.cases[0].steps[0].expectations[0]);
    assert.match(blockedReason(context), /EXPECTATION_GATE_INVALID|ORACLE_INVALID|SUPPORT_REVIEW_MISSING/u, name);
  }
});

test('Oracle tolerance and window bounds are valid for every comparison and required by within', () => {
  /** @param {(oracle: any) => void} mutate */
  const classifyOracle = (mutate) => {
    const context = classificationContext();
    mutate(context.caseDrafts.cases[0].steps[0].expectations[0].oracle);
    return classifyCaseDrafts(context);
  };
  /** @type {Array<(oracle: any) => void>} */
  const positives = [
    (oracle) => { oracle.comparison = 'within'; oracle.tolerance = 0; },
    (oracle) => { oracle.comparison = 'within'; oracle.window = '2 seconds'; },
    (oracle) => { oracle.comparison = 'equals'; oracle.tolerance = 1.5; oracle.window = 'eventually'; }
  ];
  for (const mutate of positives) {
    const result = classifyOracle(mutate);
    assert.equal(result.grounded.length, 1);
  }

  /** @type {Array<(oracle: any) => void>} */
  const negatives = [
    (oracle) => { oracle.comparison = 'within'; },
    (oracle) => { oracle.comparison = 'within'; oracle.tolerance = -1; },
    (oracle) => { oracle.comparison = 'within'; oracle.tolerance = Number.NaN; },
    (oracle) => { oracle.comparison = 'within'; oracle.tolerance = Number.POSITIVE_INFINITY; },
    (oracle) => { oracle.comparison = 'equals'; oracle.tolerance = Number.NEGATIVE_INFINITY; },
    (oracle) => { oracle.comparison = 'equals'; oracle.window = '   '; }
  ];
  for (const mutate of negatives) {
    const result = classifyOracle(mutate);
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.match(result.blocked[0].reason, /ORACLE_INVALID/u);
  }
});

test('preceding actions and independently located expectations must resolve exactly', () => {
  const dangling = classificationContext();
  dangling.caseDrafts.cases[0].steps[0].expectations[0].preceding_action_id = 'step_missing';
  const duplicate = classificationContext();
  duplicate.caseDrafts.cases[0].steps.push({
    step_id: 'step_confirm',
    action: 'Confirm checkout',
    action_evidence_ref: 'claim_action',
    support_review: 'supported',
    expectations: [{
      ...structuredClone(duplicate.caseDrafts.cases[0].steps[0].expectations[0]),
      preceding_action_id: 'step_confirm'
    }]
  });
  duplicate.caseDrafts.cases[0].execution_signature.action_path.push('Confirm checkout');

  assert.match(blockedReason(dangling), /PRECEDING_ACTION_UNKNOWN/u);
  const duplicateResult = classifyCaseDrafts(duplicate);
  assert.equal(duplicateResult.diagnostics.some((item) => item.code === 'EXPECTATION_ID_DUPLICATE'), true);
});

test('an expectation must point to its containing action rather than any future or neighboring step', () => {
  const context = classificationContext();
  const draft = context.caseDrafts.cases[0];
  draft.steps.push({
    step_id: 'step_confirm',
    action: 'Confirm checkout',
    action_evidence_ref: 'claim_action',
    support_review: 'supported',
    expectations: [{
      ...structuredClone(draft.steps[0].expectations[0]),
      expectation_id: 'expectation_confirmation',
      preceding_action_id: 'step_confirm'
    }]
  });
  draft.steps[0].expectations[0].preceding_action_id = 'step_confirm';
  const steps = /** @type {any[]} */ (draft.steps);
  draft.execution_signature.action_path = steps.map((step) => step.action);
  draft.execution_signature.oracle_refs = steps.flatMap((step) =>
    (/** @type {any[]} */ (step.expectations)).map((expectation) => expectation.expectation_id));
  const result = classifyCaseDrafts(context);

  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.match(result.blocked[0].reason, /PRECEDING_ACTION_NOT_CONTAINING/u);
});

test('observation_target never substitutes for an independently provided tester observer', () => {
  const context = classificationContext();
  context.caseDrafts.cases[0].testability_profile.observers = [];
  context.caseDrafts.cases[0].testability_profile.capabilities.push({
    capability: 'order status', status: 'verified', provenance_ref: 'claim_capability'
  });

  assert.match(blockedReason(context), /OBSERVER_MISSING/u);
});

test('missing or empty observer, control, capability, and required capability all block with a root reason', () => {
  /** @type {Array<[string, (draft: any) => void, RegExp]>} */
  const mutations = [
    ['observer', (draft) => { draft.testability_profile.observers = []; }, /OBSERVER_MISSING/u],
    ['control', (draft) => { draft.testability_profile.controls = []; }, /CONTROL_MISSING/u],
    ['capability', (draft) => { draft.testability_profile.capabilities = []; }, /CAPABILITY_MISSING/u],
    ['required capability', (draft) => { draft.testability_profile.capabilities[0].capability = 'other-control'; }, /REQUIRED_CAPABILITY_MISSING/u],
    ['capability provenance', (draft) => { delete draft.testability_profile.capabilities[0].provenance_ref; }, /CAPABILITY_PROVENANCE_MISSING/u],
    ['observer provenance', (draft) => { draft.testability_profile.observers[0].provenance_ref = ''; }, /CAPABILITY_PROVENANCE_MISSING/u],
    ['control provenance', (draft) => {
      draft.testability_profile.controls[0].provenance_ref = 'claim_missing';
      draft.evidence_refs.push('claim_missing');
    }, /EVIDENCE_REFERENCE_UNKNOWN/u]
  ];
  for (const [name, mutate, expected] of mutations) {
    const context = classificationContext();
    mutate(context.caseDrafts.cases[0]);
    assert.match(blockedReason(context), expected, name);
  }
});

test('capability status uses the lowest status across capabilities, observers, and controls', () => {
  for (const collection of ['capabilities', 'observers', 'controls']) {
    const conditional = classificationContext();
    conditional.caseDrafts.cases[0].testability_profile[collection][0].status = 'approved-assumption';
    conditional.caseDrafts.cases[0].temporary_assumption = {
      claim_id: 'claim_capability', invalidation_condition: 'The environment access is verified.'
    };
    conditional.evidence.claimsById.set('claim_capability', acceptedClaim('claim_capability', 'E1'));
    const conditionalResult = classifyCaseDrafts(conditional);
    assert.equal(conditionalResult.conditional.length, 1, collection);

    for (const status of ['unknown', 'unavailable']) {
      const blocked = classificationContext();
      blocked.caseDrafts.cases[0].testability_profile[collection][0].status = status;
      assert.match(blockedReason(blocked), new RegExp(`CAPABILITY_${status.toUpperCase()}`, 'u'), `${collection}:${status}`);
    }
  }
});

test('a sole approved-assumption provenance root matches the singleton temporary assumption regardless of evidence level', () => {
  const context = classificationContext();
  const draft = context.caseDrafts.cases[0];
  draft.testability_profile.capabilities[0].status = 'approved-assumption';
  draft.temporary_assumption = {
    claim_id: 'claim_capability', invalidation_condition: 'The environment access is verified.'
  };
  const result = classifyCaseDrafts(context);

  assert.equal(result.conditional.length, 1);
  assert.equal(result.blocked.length + result.diagnostics.length, 0);
});

test('the lowest evidence level propagates through every fact and obligation closure member', () => {
  const context = classificationContext();
  const assumption = acceptedClaim('claim_fact_parent', 'E1');
  context.evidence.claimsById.set('claim_fact_parent', assumption);
  context.evidence.factLedger[0].source_claim_ids.push('claim_fact_parent');
  context.caseDrafts.cases[0].evidence_refs.push('claim_fact_parent');
  context.caseDrafts.cases[0].temporary_assumption = {
    claim_id: 'claim_fact_parent', invalidation_condition: 'The parent business rule is finalized.'
  };
  const result = classifyCaseDrafts(context);

  assert.equal(result.conditional.length, 1, 'a later E1 closure member cannot be hidden by the first E3');
  assert.equal(result.grounded.length, 0);
});

test('invalid E2 kind-target or derivation target blocks instead of inheriting a parent level', () => {
  const context = classificationContext();
  const derived = context.evidence.claimsById.get('claim_data');
  derived.derivation_target = 'expected-value';

  assert.match(blockedReason(context), /E2_KIND_TARGET_INVALID/u);
});

test('fact conflicts and ambiguity block every dependent obligation, independent of array position', () => {
  for (const status of ['conflicted', 'ambiguous']) {
    const facts = [
      { fact_id: 'fact_unrelated', claim_id: 'claim_oracle', status: 'active', source_claim_ids: ['claim_oracle'] },
      { fact_id: IDS.fact, claim_id: 'claim_fact', status, source_claim_ids: ['claim_fact'] }
    ];
    const context = classificationContext({ facts });
    assert.match(blockedReason(context), /FACT_UNRESOLVED/u, status);
    facts.reverse();
    assert.match(blockedReason(classificationContext({ facts })), /FACT_UNRESOLVED/u, `${status}:reordered`);
  }
});

test('support review is reduced across every assertion rather than trusting the first review', () => {
  const context = classificationContext();
  context.caseDrafts.cases[0].cleanup.support_review = 'contradicted';

  assert.match(blockedReason(context), /SUPPORT_REVIEW_CONTRADICTED/u);
});

test('Conditional requires a matching nonblank temporary assumption and invalidation condition', () => {
  const missing = classificationContext();
  missing.evidence.claimsById.set('claim_role', acceptedClaim('claim_role', 'E1'));
  assert.match(blockedReason(missing), /TEMPORARY_ASSUMPTION_MISSING/u);

  const wrong = classificationContext();
  wrong.evidence.claimsById.set('claim_role', acceptedClaim('claim_role', 'E1'));
  wrong.caseDrafts.cases[0].temporary_assumption = {
    claim_id: 'claim_other', invalidation_condition: ' '
  };
  assert.match(blockedReason(wrong), /TEMPORARY_ASSUMPTION_INVALID/u);
});

test('all required Case fields remain enforced at the classifier seam', () => {
  /** @type {Array<(draft: any) => void>} */
  const mutations = [
    (draft) => { draft.title = ''; },
    (draft) => { draft.fact_ids = []; },
    (draft) => { draft.preconditions = []; },
    (draft) => {
      draft.data = [];
      draft.evidence_refs = draft.evidence_refs.filter((/** @type {string} */ ref) => ref !== 'claim_data');
    },
    (draft) => {
      draft.steps = [];
      draft.evidence_refs = draft.evidence_refs.filter((/** @type {string} */ ref) => ref !== 'claim_action');
    },
    (draft) => { draft.post_state.state = ''; },
    (draft) => {
      delete draft.cleanup;
      draft.evidence_refs = draft.evidence_refs.filter((/** @type {string} */ ref) => ref !== 'claim_cleanup');
    }
  ];
  for (const mutate of mutations) {
    const context = classificationContext();
    mutate(context.caseDrafts.cases[0]);
    assert.match(blockedReason(context), /CASE_GATE_INVALID|FORMAL_ORACLE_MISSING/u);
  }
  const noEvidenceSummary = classificationContext();
  noEvidenceSummary.caseDrafts.cases[0].evidence_refs = [];
  assert.equal(classifyCaseDrafts(noEvidenceSummary).diagnostics.some((item) =>
    item.code === 'CASE_EVIDENCE_SUMMARY_INVALID'), true);
  const invalidScope = classificationContext();
  invalidScope.caseDrafts.cases[0].scope = '';
  assert.equal(classifyCaseDrafts(invalidScope).diagnostics.some((item) => item.code === 'CANONICAL_STRING_INVALID'), true);
});

test('closed records reject unknown keys, custom prototypes, accessors, sparse arrays, and padded identifiers', () => {
  const unknownKey = classificationContext();
  unknownKey.caseDrafts.cases[0].invented = true;
  assert.equal(classifyCaseDrafts(unknownKey).diagnostics.some((item) => item.code === 'UNKNOWN_KEY'), true);

  const inherited = classificationContext();
  inherited.caseDrafts.cases[0].role = Object.assign(Object.create({ inherited: true }), inherited.caseDrafts.cases[0].role);
  assert.equal(classifyCaseDrafts(inherited).diagnostics.some((item) => item.code === 'RECORD_PROTOTYPE_INVALID'), true);

  let getterReads = 0;
  const accessor = classificationContext();
  Object.defineProperty(accessor.caseDrafts.cases[0].role, 'value', {
    enumerable: true,
    get() { getterReads += 1; return 'buyer'; }
  });
  assert.equal(classifyCaseDrafts(accessor).diagnostics.some((item) => item.code === 'ACCESSOR_NOT_ALLOWED'), true);
  assert.equal(getterReads, 0);

  let iteratorReads = 0;
  class SubmittedMap extends Map {
    [Symbol.iterator]() {
      iteratorReads += 1;
      return super[Symbol.iterator]();
    }
  }
  const customMap = classificationContext();
  customMap.evidence.claimsById = new SubmittedMap(customMap.evidence.claimsById);
  assert.equal(classifyCaseDrafts(customMap).diagnostics.some((item) => item.code === 'RECORD_PROTOTYPE_INVALID'), true);
  assert.equal(iteratorReads, 0);

  let ownIteratorReads = 0;
  const ownIterator = classificationContext();
  Object.defineProperty(ownIterator.evidence.claimsById, Symbol.iterator, {
    value() {
      ownIteratorReads += 1;
      return Map.prototype.entries.call(this);
    }
  });
  const ownIteratorResult = classifyCaseDrafts(ownIterator);
  assert.equal(ownIteratorResult.diagnostics.some((item) => item.code === 'MAP_OWN_PROPERTY_INVALID'), true);
  assert.equal(ownIteratorReads, 0);

  const fakeMap = classificationContext();
  fakeMap.evidence.claimsById = Object.create(Map.prototype);
  assert.equal(classifyCaseDrafts(fakeMap).diagnostics.some((item) => item.code === 'MAP_BRAND_INVALID'), true);

  const sparse = classificationContext();
  delete sparse.caseDrafts.cases[0].steps[0].expectations[0];
  assert.equal(classifyCaseDrafts(sparse).diagnostics.some((item) => item.code === 'ARRAY_HOLE'), true);

  const padded = classificationContext();
  padded.caseDrafts.cases[0].scope = ' checkout ';
  assert.equal(classifyCaseDrafts(padded).diagnostics.some((item) => item.code === 'CANONICAL_STRING_INVALID'), true);
});

test('controlled arrays reject own symbol and named properties without executing a submitted iterator', () => {
  const symbolContext = classificationContext();
  let iteratorCalls = 0;
  Object.defineProperty(symbolContext.caseDrafts.obligation_dispositions, Symbol.iterator, {
    value() {
      iteratorCalls += 1;
      return Array.prototype[Symbol.iterator].call(this);
    }
  });
  const symbolResult = classifyCaseDrafts(symbolContext);
  assert.equal(iteratorCalls, 0);
  assert.equal(symbolResult.diagnostics.some((item) => item.code === 'ARRAY_SYMBOL_PROPERTY_INVALID'), true);

  const namedContext = classificationContext();
  namedContext.caseDrafts.cases.extra = true;
  const namedResult = classifyCaseDrafts(namedContext);
  assert.equal(namedResult.diagnostics.some((item) => item.code === 'UNKNOWN_KEY'), true);
});

test('classification uses one trusted descriptor snapshot and never reads a getter injected after Map capture', () => {
  const context = classificationContext();
  const claims = context.evidence.claimsById;
  const target = claims.get('claim_action');
  let accessorReads = 0;
  let injected = false;
  const poison = acceptedClaim('claim_poison');
  Object.defineProperty(poison, 'claim_form', {
    configurable: true,
    enumerable: true,
    get() {
      accessorReads += 1;
      return 'direct';
    }
  });
  claims.set('claim_action', new Proxy(target, {
    getPrototypeOf(value) {
      if (!injected) {
        injected = true;
        claims.set('claim_poison', poison);
      }
      return Reflect.getPrototypeOf(value);
    }
  }));

  const result = classifyCaseDrafts(context);
  assert.equal(injected, true);
  assert.equal(accessorReads, 0);
  assert.equal(result.grounded.length, 1);
  assert.deepEqual(result.diagnostics, []);
});

test('malformed input returns bounded stable diagnostics instead of throwing raw errors', () => {
  assert.doesNotThrow(() => classifyCaseDrafts({}));
  const empty = classifyCaseDrafts({});
  assert.equal(empty.diagnostics.length > 0, true);

  const obligations = Array.from({ length: 400 }, (_, index) => baseObligation({
    obligation_id: `obligation_${index.toString(16).padStart(16, '0')}`,
    required_capabilities: [],
    view_element_refs: [`view_checkout#edge_${index}`]
  }));
  const context = classificationContext({ obligations, cases: [], dispositions: [] });
  context.obligations.fact_routes[0].obligation_ids = obligations.map((item) => item.obligation_id);
  const diagnostics = classifyCaseDrafts(context).diagnostics;
  assert.equal(diagnostics.length <= 256, true);
  assert.deepEqual(diagnostics, [...diagnostics].sort((left, right) => {
    const a = `${left.category}\0${left.code}\0${left.path}\0${left.message}`;
    const b = `${right.category}\0${right.code}\0${right.path}\0${right.message}`;
    return a < b ? -1 : a > b ? 1 : 0;
  }));
});

test('snapshot diagnostics use a canonical bounded top-K independent of property insertion order', () => {
  /** @param {boolean} reverse */
  const accessorBomb = (reverse) => {
    const context = classificationContext();
    const indices = Array.from({ length: 300 }, (_, index) => index);
    if (reverse) indices.reverse();
    let getterCalls = 0;
    for (const index of indices) {
      Object.defineProperty(context.caseDrafts.cases[0], `bad_${index.toString().padStart(3, '0')}`, {
        enumerable: true,
        get() {
          getterCalls += 1;
          return index;
        }
      });
    }
    const diagnostics = classifyCaseDrafts(context).diagnostics;
    assert.equal(getterCalls, 0);
    return diagnostics;
  };

  const forward = accessorBomb(false);
  const reverse = accessorBomb(true);
  assert.equal(JSON.stringify(forward), JSON.stringify(reverse));
  assert.equal(forward.length, 256);
  assert.equal(forward.some((item) => item.code === 'DIAGNOSTICS_TRUNCATED'), true);
  assert.equal(forward.filter((item) => item.code === 'ACCESSOR_NOT_ALLOWED').length, 255);
});

test('very large sparse arrays derive canonical holes from own descriptors without scanning declared length', () => {
  /** @param {number[]} indices */
  const sparseDiagnostics = (indices) => {
    const context = classificationContext();
    const sparse = new Array(1_000_000);
    for (const index of indices) sparse[index] = baseCase({ case_id: `case_${index.toString(16).padStart(16, '0')}` });
    context.caseDrafts.cases = sparse;

    const nativeString = globalThis.String;
    let numericConversions = 0;
    globalThis.String = /** @type {StringConstructor} */ (new Proxy(nativeString, {
      apply(target, thisArg, args) {
        numericConversions += 1;
        return Reflect.apply(target, thisArg, args);
      }
    }));
    let diagnostics;
    try {
      diagnostics = classifyCaseDrafts(context).diagnostics;
    } finally {
      globalThis.String = nativeString;
    }
    assert.equal(numericConversions < 5_000, true,
      `sparse snapshot performed ${numericConversions} String conversions for ${indices.length} own entries`);
    assert.equal(diagnostics.some((item) => item.code === 'ARRAY_HOLE'), true);
    assert.equal(diagnostics.some((item) => item.code === 'DIAGNOSTICS_TRUNCATED'), true);
    return diagnostics;
  };

  const forward = sparseDiagnostics([2, 7, 999_999]);
  const reverse = sparseDiagnostics([999_999, 7, 2]);
  assert.equal(JSON.stringify(forward), JSON.stringify(reverse));
});

test('sparse hole diagnostics consume only the real remaining budget before truncating', () => {
  /** @param {number} length */
  const holes = (length) => {
    const context = classificationContext();
    context.caseDrafts.cases = new Array(length);
    return classifyCaseDrafts(context).diagnostics;
  };

  const small = holes(2);
  assert.deepEqual(small.map((item) => [item.code, item.path]), [
    ['ARRAY_HOLE', '/caseDrafts/cases/0'],
    ['ARRAY_HOLE', '/caseDrafts/cases/1']
  ]);

  const exact = holes(255);
  assert.equal(exact.length, 255);
  assert.equal(exact.every((item) => item.code === 'ARRAY_HOLE'), true);
  assert.equal(exact.some((item) => item.code === 'DIAGNOSTICS_TRUNCATED'), false);
  assert.equal(exact.at(-1)?.path, '/caseDrafts/cases/99');

  const over = holes(256);
  assert.equal(over.length, 256);
  assert.equal(over.filter((item) => item.code === 'ARRAY_HOLE').length, 255);
  assert.equal(over.some((item) => item.code === 'DIAGNOSTICS_TRUNCATED'), true);
  assert.equal(over.some((item) => item.path === '/caseDrafts/cases/255'), false);
});

test('deep evidence ancestry is evaluated iteratively without call-stack recursion', () => {
  const claims = baseClaims();
  let parent = 'claim_fact';
  for (let index = 0; index < 5000; index += 1) {
    const id = `claim_deep_${index}`;
    claims.push(acceptedClaim(id, 'E2', {
      kind: 'model-element',
      derivation_kind: 'graph-reachability',
      derivation_target: 'model-element',
      value: `node-${index}`,
      parent_claim_ids: [parent],
      rule_input: { from: `node-${index}`, to: `node-${index + 1}` }
    }));
    parent = id;
  }
  const draft = baseCase();
  draft.role.evidence_ref = parent;
  draft.evidence_refs = draft.evidence_refs.map((/** @type {string} */ ref) => ref === 'claim_role' ? parent : ref);
  const result = classifyCaseDrafts(classificationContext({ claims, cases: [draft] }));

  assert.equal(result.grounded.length, 1);
  assert.deepEqual(result.diagnostics, []);
});
