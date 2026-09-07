import { canonicalStringify, stableId } from '../../src/canonical.mjs';

export const IDS = Object.freeze({
  fact: 'fact_checkout',
  obligation: 'obligation_1111111111111111',
  case: 'case_1111111111111111',
  expectation: 'expectation_result'
});

/** @param {unknown} value */
function normalizeSemanticString(value) {
  return typeof value === 'string' ? value.normalize('NFC').trim().replace(/\s+/gu, ' ') : '';
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
}

/** @param {Record<string, unknown>[]} entries */
function canonicalSetProjection(entries) {
  const unique = new Map(entries.map((entry) => [canonicalStringify(entry), entry]));
  return canonicalStringify([...unique].sort(([left], [right]) => compareCodePoints(left, right)).map(([, entry]) => entry));
}

/** @param {any} caseDraft */
export function expectedPreconditionProjection(caseDraft) {
  const preconditions = /** @type {any[]} */ (caseDraft.preconditions);
  return canonicalSetProjection(preconditions.map((item) => ({
    condition: normalizeSemanticString(item.condition),
    reachable_from: normalizeSemanticString(item.reachable_from),
    ...(item.setup === undefined ? {} : {setup:item.setup})
  })));
}

/** @param {any} caseDraft */
export function expectedDataProjection(caseDraft) {
  const data = /** @type {any[]} */ (caseDraft.data);
  return canonicalSetProjection(data.map((item) => ({
    name: normalizeSemanticString(item.name),
    value: normalizeSemanticString(item.value),
    ...(caseDraft.scenario === undefined ? {} : {scenario:caseDraft.scenario})
  })));
}

/** @param {any} caseDraft */
export function refreshExecutionSignature(caseDraft) {
  const steps = /** @type {any[]} */ (caseDraft.steps);
  caseDraft.execution_signature = {
    role: normalizeSemanticString(caseDraft.role?.value),
    precondition_state: expectedPreconditionProjection(caseDraft),
    data_partition: expectedDataProjection(caseDraft),
    action_path: steps.map((step) => normalizeSemanticString(step.action)),
    oracle_refs: [...new Set(steps.flatMap((step) =>
      (/** @type {any[]} */ (step.expectations)).map((expectation) => normalizeSemanticString(expectation.expectation_id))
    ))].sort(compareCodePoints)
  };
  return caseDraft;
}

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
    caseable: true,
    risk: 'high',
    scope: 'checkout',
    source_claim_ids: ['claim_fact'],
    view_element_refs: ['view_checkout#edge_submit'],
    primary_operation_refs: ['view_checkout#edge_submit'],
    scenario_partition_ref: 'valid-cart',
    required_oracle_refs: ['claim_oracle'],
    required_capabilities: ['checkout-control'],
    ...overrides
  };
}

/**
 * Public grouped blocker input. Root identity remains compiler-owned and is
 * derived from issue intent plus the typed semantic subject.
 * @param {{affectedObligationIds?:string[],evidenceRefs?:string[],missingType?:string,reasons?:string[],subject?:Record<string,unknown>,scope?:string,risk?:string,answerable?:boolean}} [options]
 */
export function blockerDisposition(options = {}) {
  return {
    status: 'blocker',
    affected_obligation_ids: options.affectedObligationIds ?? [IDS.obligation],
    issue_intent: {
      missing_type: options.missingType ?? 'oracle',
      scope: options.scope ?? 'checkout',
      answerable: options.answerable ?? true,
      risk: options.risk ?? 'high',
      reasons: options.reasons ?? ['FORMAL_ORACLE_MISSING'],
      evidence_refs: options.evidenceRefs ?? ['claim_fact']
    },
    subject: options.subject ?? { kind: 'facts', fact_ids: [IDS.fact] }
  };
}

/** @param {ReturnType<typeof blockerDisposition>} disposition */
export function expectedBlockerRootId(disposition) {
  return stableId('root', {
    missing_type: disposition.issue_intent.missing_type,
    semantic_refs: [canonicalStringify(disposition.subject)],
    scope: disposition.issue_intent.scope
  });
}

/** @param {Record<string, unknown>} [overrides] @returns {any} */
export function baseCase(overrides = {}) {
  const draft = {
    case_id: IDS.case,
    title: 'Submit a ready cart',
    scenario: {operation_id:'submit',operation_ref:'view_checkout#edge_submit',partition_id:'valid-cart',subject_ref:'order.status',intent:'behavior'},
    risk_basis: {impact:'Order submission fails',likelihood:'Every submit uses the path',exposure:'All buyers'},
    execution_effects: [],
    scope: 'checkout',
    risk: 'high',
    role: { value: 'buyer', evidence_ref: 'claim_role', support_review: 'supported' },
    fact_ids: [IDS.fact],
    obligation_ids: [IDS.obligation],
    source_claim_ids: ['claim_fact'],
    preconditions: [{
      condition: 'cart is ready',
      reachable_from: 'empty cart',
      setup: {resource_kind:'fixture',resource_ref:'fixture:ready-cart',completion:{subject_ref:'cart.ready',operator:'equals',operand:{type:'boolean',value:true}},mutation_effects:[]},
      source_claim_ids: ['claim_fact'],
      evidence_ref: 'claim_fact',
      support_review: 'supported'
    }],
    data: [{
      name: 'cart total boundary',
      partition_id: 'valid-cart',
      value: '100.00',
      provenance: { type: 'derivation', ref: 'claim_data' },
      support_review: 'supported'
    }],
    steps: [{
      step_id: 'step_submit',
      operation_id: 'submit',
      action: 'Submit checkout',
      action_evidence_ref: 'claim_action',
      support_review: 'supported',
      expectations: [{
        kind: 'obligation-oracle',
        expectation_id: IDS.expectation,
        business_assertion: 'The order is accepted',
        preceding_action_id: 'step_submit',
        observer: 'tester',
        observation_surface: 'UI',
        observation_target: 'order status',
        oracle: { type: 'state', expected_state: 'accepted', comparison: 'equals', assertion:{subject_ref:'order.status',surface:'UI',operator:'equals',operand:{type:'string',value:'accepted'}} },
        evidence_ref: 'claim_oracle',
        oracle_evidence_refs: ['claim_oracle'],
        closes_obligation_id: IDS.obligation,
        support_review: 'supported'
      }]
    }],
    testability_profile: {
      setup_resources: [{resource_id:'fixture:ready-cart',kind:'fixture',locator:'fixture://checkout/ready-cart',evidence_ref:'claim_fact'}],
      capabilities: [{ capability: 'checkout-control', status: 'provided', provenance_ref: 'claim_capability' }],
      observers: [{ observer: 'tester', observation_target: 'order status', subject_ref:'order.status',surface_id:'UI',status: 'verified', provenance_ref: 'claim_capability' }],
      controls: [{ control: 'submit checkout', status: 'provided', provenance_ref: 'claim_capability' }]
    },
    post_state: { state: 'order accepted', evidence_ref: 'claim_oracle', support_review: 'supported' },
    cleanup: {
      resolved_effects: [],
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
      oracle_refs: [IDS.expectation]
    },
    ...overrides
  };
  if (!Object.hasOwn(overrides, 'execution_signature')) refreshExecutionSignature(draft);
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
      schema_version: '3.0.0',
      source_revision: sourceRevision,
      obligations,
      fact_routes: [{ fact_id: IDS.fact, route_type: 'obligations', obligation_ids: [IDS.obligation] }],
      interaction_routes: []
    },
    caseDrafts: {
      schema_version: '3.0.0',
      source_revision: sourceRevision,
      cases,
      obligation_dispositions: dispositions,
      exploratory_candidates: options.exploratory ?? []
    }
  };
}

/** @param {ReturnType<typeof baseCase>} caseDraft */
export function expectedCanonicalCaseId(caseDraft) {
  const steps = /** @type {any[]} */ (caseDraft.steps);
  const signature = JSON.parse(canonicalStringify({
    role: normalizeSemanticString(caseDraft.role.value),
    precondition_state: expectedPreconditionProjection(caseDraft),
    data_partition: expectedDataProjection(caseDraft),
    action_path: steps.map((step) => normalizeSemanticString(step.action)),
    oracle_refs: [...new Set(steps.flatMap((step) =>
      (/** @type {any[]} */ (step.expectations)).map((item) => {
        const expectedField = /** @type {Record<string, string>} */ ({
          value: 'expected_value', state: 'expected_state', event: 'expected_event',
          'side-effect': 'expected_side_effect'
        })[String(item.oracle.type)];
        return stableId('oracle', {
          action: normalizeSemanticString(step.action),
          observer: normalizeSemanticString(item.observer_ref ?? item.observer),
          observation_surface: item.oracle.assertion?.surface ?? normalizeSemanticString(item.observation_surface),
          observation_target: normalizeSemanticString(item.target_ref ?? item.observation_target),
          oracle: {
            type: item.oracle.type,
            ...(item.oracle.assertion === undefined ? {} : {assertion:item.oracle.assertion}),
            ...(expectedField ? { [expectedField]: normalizeSemanticString(item.oracle[expectedField]) } : {}),
            comparison: normalizeSemanticString(item.oracle.comparison),
            ...(item.oracle.tolerance === undefined ? {} : { tolerance: item.oracle.tolerance }),
            ...(item.oracle.window === undefined ? {} : { window: normalizeSemanticString(item.oracle.window) })
          }
        });
      })))].sort(compareCodePoints)
  }));
  return stableId('case', signature);
}

/** @template T @param {T} value @returns {T} */
export function clone(value) {
  return structuredClone(value);
}

/** Explicit conversion of frozen synthetic fixtures, never a production prose interpreter.
 * Callers must select a single modeled operationRef from the fixture obligations.
 * Existing semantic fields are preserved so intentionally malformed tests stay malformed.
 * @param {any} draft @param {{operationRef:string}} options
 */
export function migrateCaseSemantics(draft, {operationRef}) {
  draft.scenario ??= {operation_id:'fixture-operation',operation_ref:operationRef,partition_id:'fixture-partition',subject_ref:'fixture-subject',intent:'behavior'};
  draft.risk_basis ??= {impact:'Synthetic fixture behavior fails',likelihood:'Fixture explicitly exercises this path',exposure:'Fixture test role'};
  draft.execution_effects ??= [];
  if (draft.cleanup) draft.cleanup.resolved_effects ??= [];
  if (draft.testability_profile) draft.testability_profile.setup_resources ??= [];
  for (const [i,p] of (draft.preconditions ?? []).entries()) {
    if (!p.setup) {
      const resourceId=`fixture:setup-${i}`;
      p.setup={resource_kind:'fixture',resource_ref:resourceId,completion:{subject_ref:`fixture-ready-${i}`,operator:'equals',operand:{type:'boolean',value:true}},mutation_effects:[]};
      draft.testability_profile?.setup_resources.push({resource_id:resourceId,kind:'fixture',locator:`fixture://synthetic/setup-${i}`,evidence_ref:p.evidence_ref});
    }
  }
  for (const d of draft.data ?? []) d.partition_id ??= draft.scenario.partition_id;
  for (const step of draft.steps ?? []) {
    step.operation_id ??= draft.scenario.operation_id;
    for (const e of step.expectations ?? []) {
      const field=/** @type {Record<string,string>} */ ({value:'expected_value',state:'expected_state',event:'expected_event','side-effect':'expected_side_effect'})[e.oracle?.type];
      if (field) e.oracle.assertion ??= {subject_ref:draft.scenario.subject_ref,surface:e.observation_surface.replace(/[^A-Za-z0-9_.:/#-]/gu,'-'),operator:e.oracle.comparison,operand:{type:'string',value:e.oracle[field]}};
      for (const o of draft.testability_profile?.observers ?? []) if (o.observer === e.observer && o.observation_target === e.observation_target) {
        o.subject_ref ??= e.oracle?.assertion?.subject_ref;
        o.surface_id ??= e.oracle?.assertion?.surface;
      }
    }
  }
  return refreshExecutionSignature(draft);
}
