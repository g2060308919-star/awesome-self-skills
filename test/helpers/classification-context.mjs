import { stableId } from '../../src/canonical.mjs';

export const IDS = Object.freeze({
  fact: 'fact_checkout',
  obligation: 'obligation_1111111111111111',
  case: 'case_1111111111111111',
  expectation: 'expectation_result'
});

/** @param {string} id @param {string} [level] @param {Record<string, unknown>} [overrides] @returns {any} */
export function acceptedClaim(id, level = 'E3', overrides = {}) {
  if (level === 'E2') {
    return {
      claim_id: id,
      claim_form: 'derived',
      level: 'E2',
      kind: 'test-data',
      scope: 'checkout',
      value: '100.00',
      source_locator_ids: ['locator_rule'],
      derivation_kind: 'boundary-representative',
      derivation_target: 'test-data',
      parent_claim_ids: ['claim_fact'],
      parameters: {},
      rule_input: { lower: 0, upper: 100, inclusive: true },
      ...overrides
    };
  }
  if (level === 'E1') {
    return {
      claim_id: id,
      claim_form: 'decision-record',
      level: 'E1',
      kind: 'assumption',
      scope: 'checkout',
      value: 'temporary rule',
      source_locator_ids: ['locator_decision'],
      decision_id: `decision_${id}`,
      authority: 'checkout',
      ...overrides
    };
  }
  return {
    claim_id: id,
    claim_form: 'direct',
    level: 'E3',
    kind: 'requirement',
    scope: 'checkout',
    value: `${id} rule`,
    source_locator_ids: ['locator_rule'],
    source_id: 'source_prd',
    ...overrides
  };
}

/** @returns {any[]} */
export function baseClaims() {
  return [
    acceptedClaim('claim_action'),
    acceptedClaim('claim_capability', 'E3', { kind: 'description' }),
    acceptedClaim('claim_cleanup', 'E3', { kind: 'description' }),
    acceptedClaim('claim_data', 'E2'),
    acceptedClaim('claim_fact'),
    acceptedClaim('claim_oracle'),
    acceptedClaim('claim_role')
  ];
}

/** @param {Record<string, unknown>} [overrides] @returns {any} */
export function baseObligation(overrides = {}) {
  return {
    obligation_id: IDS.obligation,
    kind: 'flow',
    risk: 'high',
    scope: 'checkout',
    source_claim_ids: ['claim_fact'],
    view_element_refs: ['view_checkout#edge_submit'],
    required_oracle_refs: ['claim_oracle'],
    required_capabilities: ['checkout-control'],
    ...overrides
  };
}

/** @param {Record<string, unknown>} [overrides] @returns {any} */
export function baseCase(overrides = {}) {
  const draft = {
    case_id: IDS.case,
    title: 'Submit a ready cart',
    scope: 'checkout',
    risk: 'high',
    role: { value: 'buyer', evidence_ref: 'claim_role', support_review: 'supported' },
    fact_ids: [IDS.fact],
    obligation_ids: [IDS.obligation],
    source_claim_ids: ['claim_fact'],
    preconditions: [{
      condition: 'cart is ready',
      reachable_from: 'empty cart',
      source_claim_ids: ['claim_fact'],
      evidence_ref: 'claim_fact',
      support_review: 'supported'
    }],
    data: [{
      name: 'cart total boundary',
      value: '100.00',
      provenance: { type: 'derivation', ref: 'claim_data' },
      support_review: 'supported'
    }],
    steps: [{
      step_id: 'step_submit',
      action: 'Submit checkout',
      action_evidence_ref: 'claim_action',
      support_review: 'supported',
      expectations: [{
        expectation_id: IDS.expectation,
        business_assertion: 'The order is accepted',
        preceding_action_id: 'step_submit',
        observer: 'tester',
        observation_surface: 'UI',
        observation_target: 'order status',
        oracle: { type: 'state', expected_state: 'accepted', comparison: 'equals' },
        evidence_ref: 'claim_oracle',
        support_review: 'supported'
      }]
    }],
    testability_profile: {
      capabilities: [{ capability: 'checkout-control', status: 'provided', provenance_ref: 'claim_capability' }],
      observers: [{ observer: 'tester', observation_target: 'order status', status: 'verified', provenance_ref: 'claim_capability' }],
      controls: [{ control: 'submit checkout', status: 'provided', provenance_ref: 'claim_capability' }]
    },
    post_state: { state: 'order accepted', evidence_ref: 'claim_oracle', support_review: 'supported' },
    cleanup: {
      required: false,
      no_cleanup_reason: 'The isolated order may remain for audit',
      no_cleanup_evidence_ref: 'claim_cleanup',
      support_review: 'supported'
    },
    evidence_refs: [
      'claim_action', 'claim_capability', 'claim_cleanup', 'claim_data',
      'claim_fact', 'claim_oracle', 'claim_role'
    ],
    execution_signature: {
      role: 'buyer',
      precondition_state: 'cart is ready',
      data_partition: 'total=100.00 boundary',
      action_path: ['Submit checkout'],
      oracle_refs: [IDS.expectation],
      test_point_ids: [IDS.obligation]
    },
    ...overrides
  };
  if (Object.hasOwn(overrides, 'obligation_ids') && !Object.hasOwn(overrides, 'execution_signature')) {
    draft.execution_signature.test_point_ids = [...draft.obligation_ids];
  }
  return draft;
}

/** @param {{claims?: Record<string, unknown>[], obligations?: Record<string, unknown>[], cases?: Record<string, unknown>[], dispositions?: Record<string, unknown>[], exploratory?: Record<string, unknown>[], facts?: Record<string, unknown>[], conflicts?: Record<string, unknown>[], sourceRevision?: number}} [options] @returns {any} */
export function classificationContext(options = {}) {
  const sourceRevision = options.sourceRevision ?? 3;
  const claims = options.claims ?? baseClaims();
  const obligations = options.obligations ?? [baseObligation()];
  const cases = options.cases ?? [baseCase()];
  const dispositions = options.dispositions ?? [{
    obligation_id: IDS.obligation,
    status: 'case_candidate',
    case_ids: [IDS.case]
  }];
  return {
    sourceRevision,
    evidence: {
      claimsById: new Map(claims.map((claim) => [String(claim.claim_id), claim])),
      factLedger: options.facts ?? [{
        fact_id: IDS.fact,
        claim_id: 'claim_fact',
        status: 'active',
        source_claim_ids: ['claim_fact']
      }],
      conflicts: options.conflicts ?? []
    },
    obligations: {
      schema_version: '1.0.0',
      source_revision: sourceRevision,
      obligations,
      fact_routes: [{ fact_id: IDS.fact, route_type: 'obligations', obligation_ids: [IDS.obligation] }],
      interaction_routes: []
    },
    caseDrafts: {
      schema_version: '1.0.0',
      source_revision: sourceRevision,
      cases,
      obligation_dispositions: dispositions,
      exploratory_candidates: options.exploratory ?? []
    }
  };
}

/** @param {ReturnType<typeof baseCase>} caseDraft */
export function expectedCanonicalCaseId(caseDraft) {
  const signature = {
    role: caseDraft.execution_signature.role,
    precondition_state: caseDraft.execution_signature.precondition_state,
    data_partition: caseDraft.execution_signature.data_partition,
    action_path: caseDraft.execution_signature.action_path,
    oracle_refs: caseDraft.execution_signature.oracle_refs
  };
  return stableId('case', signature);
}

/** @template T @param {T} value @returns {T} */
export function clone(value) {
  return structuredClone(value);
}
