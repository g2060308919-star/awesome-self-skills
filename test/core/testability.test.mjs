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
    ['control provenance', (draft) => { draft.testability_profile.controls[0].provenance_ref = 'claim_missing'; }, /EVIDENCE_REFERENCE_UNKNOWN/u]
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

test('the lowest evidence level propagates through every fact and obligation closure member', () => {
  const context = classificationContext();
  const assumption = acceptedClaim('claim_fact_parent', 'E1');
  context.evidence.claimsById.set('claim_fact_parent', assumption);
  context.evidence.factLedger[0].source_claim_ids.push('claim_fact_parent');
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
    (draft) => { draft.data = []; },
    (draft) => { draft.steps = []; },
    (draft) => { draft.post_state.state = ''; },
    (draft) => { delete draft.cleanup; },
    (draft) => { draft.evidence_refs = []; }
  ];
  for (const mutate of mutations) {
    const context = classificationContext();
    mutate(context.caseDrafts.cases[0]);
    assert.match(blockedReason(context), /CASE_GATE_INVALID|FORMAL_ORACLE_MISSING/u);
  }
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

  const sparse = classificationContext();
  delete sparse.caseDrafts.cases[0].steps[0].expectations[0];
  assert.equal(classifyCaseDrafts(sparse).diagnostics.some((item) => item.code === 'ARRAY_HOLE'), true);

  const padded = classificationContext();
  padded.caseDrafts.cases[0].scope = ' checkout ';
  assert.equal(classifyCaseDrafts(padded).diagnostics.some((item) => item.code === 'CANONICAL_STRING_INVALID'), true);
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
  draft.evidence_refs.push(parent);
  const result = classifyCaseDrafts(classificationContext({ claims, cases: [draft] }));

  assert.equal(result.grounded.length, 1);
  assert.deepEqual(result.diagnostics, []);
});
