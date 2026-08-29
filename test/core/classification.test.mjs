import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { classifyCaseDrafts } from '../../src/classify.mjs';
import {
  IDS, acceptedClaim, baseCase, baseClaims, baseObligation, classificationContext, clone
} from '../helpers/classification-context.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const classificationTable = JSON.parse(await readFile(
  path.join(repositoryRoot, 'test/fixtures/micro/classification-table.json'), 'utf8'
));

/** @param {string} mutation */
function contextForMutation(mutation) {
  const context = classificationContext();
  const caseDraft = context.caseDrafts.cases[0];
  if (mutation === 'e1-role') {
    context.evidence.claimsById.set('claim_role', acceptedClaim('claim_role', 'E1'));
    caseDraft.temporary_assumption = {
      claim_id: 'claim_role', invalidation_condition: 'A final role rule is approved.'
    };
  } else if (mutation === 'approved-capability') {
    context.evidence.claimsById.set('claim_capability', acceptedClaim('claim_capability', 'E1'));
    caseDraft.testability_profile.capabilities[0].status = 'approved-assumption';
    caseDraft.temporary_assumption = {
      claim_id: 'claim_capability', invalidation_condition: 'Environment access is verified.'
    };
  } else if (mutation === 'unknown-evidence') {
    caseDraft.role.evidence_ref = 'risk_e0';
    caseDraft.evidence_refs.push('risk_e0');
  } else if (mutation === 'uncertain-review') {
    caseDraft.steps[0].expectations[0].support_review = 'uncertain';
  } else if (mutation === 'unavailable-capability') {
    caseDraft.testability_profile.capabilities[0].status = 'unavailable';
  } else if (mutation === 'relevant-conflict') {
    context.evidence.conflicts.push({
      conflict_id: 'source_conflict_1111111111111111',
      root_issue_id: 'root_1111111111111111',
      scope: 'checkout',
      rule_ids: ['rule_a', 'rule_b'],
      source_ids: ['source_other', 'source_prd']
    });
  }
  return context;
}

test('classification freezes the lowest-gate table and catches its rule reversals', () => {
  for (const row of classificationTable) {
    const result = classifyCaseDrafts(contextForMutation(row.mutation));
    /** @type {Record<string, number>} */
    const counts = {
      grounded: result.grounded.length,
      conditional: result.conditional.length,
      blocked: result.blocked.length
    };
    assert.equal(counts[String(row.expected)], 1, row.name);
    for (const lane of Object.keys(counts).filter((lane) => lane !== row.expected)) {
      assert.equal(counts[lane], 0, `${row.name}: must not also enter ${lane}`);
    }
  }
});

test('E1 never becomes Grounded and approved-assumption never becomes Grounded', () => {
  const e1 = classifyCaseDrafts(contextForMutation('e1-role'));
  const approvedCapability = classifyCaseDrafts(contextForMutation('approved-capability'));

  assert.equal(e1.grounded.length, 0, 'reversing this assertion permits E1-as-Grounded');
  assert.equal(e1.conditional.length, 1);
  assert.equal(approvedCapability.grounded.length, 0, 'reversing this assertion permits approved-assumption-as-Grounded');
  assert.equal(approvedCapability.conditional.length, 1);
});

test('E0-like unknown evidence and unsupported review never become Conditional', () => {
  const unknown = classifyCaseDrafts(contextForMutation('unknown-evidence'));
  const unsupported = classifyCaseDrafts(contextForMutation('uncertain-review'));

  assert.equal(unknown.conditional.length, 0, 'reversing this assertion permits E0-as-Conditional');
  assert.equal(unknown.blocked.length, 1);
  assert.match(unknown.blocked[0].reason, /EVIDENCE_REFERENCE_UNKNOWN/u);
  assert.equal(unsupported.grounded.length + unsupported.conditional.length, 0);
  assert.match(unsupported.blocked[0].reason, /SUPPORT_REVIEW_UNCERTAIN/u);
});

test('a conflict blocks only dependent Case evidence in the intersecting scope', () => {
  const related = classifyCaseDrafts(contextForMutation('relevant-conflict'));
  const unrelatedContext = contextForMutation('relevant-conflict');
  unrelatedContext.evidence.conflicts[0].scope = 'shipping';
  const unrelated = classifyCaseDrafts(unrelatedContext);

  assert.equal(related.blocked.length, 1);
  assert.match(related.blocked[0].reason, /UNRESOLVED_CONFLICT/u);
  assert.equal(unrelated.grounded.length, 1);
  assert.equal(unrelated.blocked.length, 0);
});

test('a formal obligation with no Oracle is Blocked and never reclassified Exploratory', () => {
  const obligation = baseObligation({ required_oracle_refs: [] });
  const result = classifyCaseDrafts(classificationContext({ obligations: [obligation] }));

  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.blocked.length, 1, 'reversing this assertion drops a missing Blocked Test Point');
  assert.match(result.blocked[0].reason, /FORMAL_ORACLE_MISSING/u);
  assert.equal(result.exploratory.length, 0);
});

test('a schema-legal explicit blocker stays Blocked when its formal Oracle is missing', () => {
  const obligation = baseObligation({ required_oracle_refs: [] });
  const result = classifyCaseDrafts(classificationContext({
    obligations: [obligation],
    cases: [],
    dispositions: [{
      obligation_id: IDS.obligation,
      status: 'blocker',
      blocker_root_issue_id: 'root_missing_oracle',
      evidence_refs: ['claim_fact']
    }]
  }));

  assert.deepEqual(result.blocked, [{
    obligation_id: IDS.obligation,
    root_issue_id: 'root_missing_oracle',
    reason: 'FORMAL_ORACLE_MISSING',
    risk: 'high',
    evidence_refs: ['claim_fact']
  }]);
});

test('a fully groundable obligation submitted as blocker requires case-draft revision', () => {
  const obligation = baseObligation({ required_capabilities: [] });
  const result = classifyCaseDrafts(classificationContext({
    obligations: [obligation],
    cases: [],
    dispositions: [{
      obligation_id: IDS.obligation,
      status: 'blocker',
      blocker_root_issue_id: 'root_unjustified',
      evidence_refs: ['claim_fact', 'claim_oracle']
    }]
  }));

  assert.equal(result.blocked.length, 0);
  assert.equal(result.diagnostics.some((item) =>
    item.category === 'classification' && item.code === 'GROUNDABLE_OBLIGATION_CASE_MISSING'), true);
});

test('NotApplicable accepts only an independent supported E3/E2 exclusion with covering scope', () => {
  const validClaims = [...baseClaims(), acceptedClaim('claim_exclusion', 'E3', {
    scope: 'checkout', value: 'This flow is excluded.'
  })];
  const disposition = {
    obligation_id: IDS.obligation,
    status: 'not_applicable',
    exclusion_claim_id: 'claim_exclusion',
    scope: 'checkout',
    support_review: 'supported'
  };
  const valid = classifyCaseDrafts(classificationContext({
    claims: validClaims, cases: [], dispositions: [disposition]
  }));
  const e1Claims = [...baseClaims(), acceptedClaim('claim_exclusion', 'E1')];
  const invalid = classifyCaseDrafts(classificationContext({
    claims: e1Claims, cases: [], dispositions: [disposition]
  }));

  assert.deepEqual(valid.not_applicable, [disposition]);
  assert.equal(valid.blocked.length, 0);
  assert.equal(invalid.not_applicable.length, 0, 'reversing this assertion permits E1 to fabricate NotApplicable');
  assert.equal(invalid.blocked.length, 1);
  assert.match(invalid.blocked[0].reason, /EXCLUSION_EVIDENCE_INVALID/u);
});

test('NotApplicable rejects an exclusion derived from the obligation evidence closure', () => {
  const exclusion = acceptedClaim('claim_exclusion', 'E2', {
    kind: 'model-element',
    derivation_kind: 'graph-reachability',
    derivation_target: 'model-element',
    value: 'excluded',
    parent_claim_ids: ['claim_fact'],
    rule_input: { from: 'checkout', to: 'excluded' }
  });
  const disposition = {
    obligation_id: IDS.obligation,
    status: 'not_applicable',
    exclusion_claim_id: 'claim_exclusion',
    scope: 'checkout',
    support_review: 'supported'
  };
  const result = classifyCaseDrafts(classificationContext({
    claims: [...baseClaims(), exclusion], cases: [], dispositions: [disposition]
  }));

  assert.equal(result.not_applicable.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0].reason, /EXCLUSION_NOT_INDEPENDENT/u);
});

test('risk hypotheses without a formal Test Point stay Exploratory and outside formal dispositions', () => {
  const risk = acceptedClaim('claim_risk', 'E3', { kind: 'diagnostic', value: 'Retry may duplicate an order.' });
  const exploratory = {
    exploratory_id: 'exploratory_1111111111111111',
    title: 'Explore duplicate retry behavior',
    scope: 'checkout',
    risk: 'medium',
    source_claim_ids: ['claim_risk']
  };
  const context = classificationContext({
    claims: [...baseClaims(), risk], exploratory: [exploratory]
  });
  context.obligations.interaction_routes = [{
    candidate_id: 'candidate_retry', route_type: 'exploratory', exploratory_id: exploratory.exploratory_id
  }];
  const result = classifyCaseDrafts(context);

  assert.deepEqual(result.exploratory, [exploratory]);
  assert.equal(result.grounded.length, 1, 'Exploratory must not enter or replace the formal denominator');
  assert.equal(result.blocked.length, 0);
});

test('formal evidence cannot be repackaged as an independent Exploratory candidate', () => {
  const exploratory = {
    exploratory_id: 'exploratory_1111111111111111',
    title: 'Explore the formal checkout rule',
    scope: 'checkout',
    risk: 'medium',
    source_claim_ids: ['claim_fact']
  };
  const context = classificationContext({ exploratory: [exploratory] });
  context.obligations.interaction_routes = [{
    candidate_id: 'candidate_formal', route_type: 'exploratory', exploratory_id: exploratory.exploratory_id
  }];
  const result = classifyCaseDrafts(context);

  assert.equal(result.exploratory.length, 0);
  assert.equal(result.diagnostics.some((item) => item.code === 'EXPLORATORY_FORMAL_EVIDENCE_OVERLAP'), true);
});

test('execution signature projection must match the actual role, ordered actions, and independently located Oracles', () => {
  /** @type {Array<(draft: any) => void>} */
  const mutations = [
    (draft) => { draft.execution_signature.role = 'administrator'; },
    (draft) => { draft.execution_signature.action_path = ['Approve checkout']; },
    (draft) => { draft.execution_signature.oracle_refs = ['expectation_other']; }
  ];
  for (const mutate of mutations) {
    const context = classificationContext();
    mutate(context.caseDrafts.cases[0]);
    const result = classifyCaseDrafts(context);
    assert.equal(result.grounded.length + result.conditional.length, 0);
    assert.match(result.blocked[0].reason, /EXECUTION_SIGNATURE_MISMATCH/u);
  }
});

test('formal fact routes participate in the obligation evidence closure even when a Case omits the routed fact', () => {
  const context = classificationContext();
  context.evidence.claimsById.set('claim_hidden', acceptedClaim('claim_hidden', 'E1'));
  context.evidence.factLedger.push({
    fact_id: 'fact_hidden', claim_id: 'claim_hidden', status: 'active', source_claim_ids: ['claim_hidden']
  });
  context.obligations.fact_routes.push({
    fact_id: 'fact_hidden', route_type: 'obligations', obligation_ids: [IDS.obligation]
  });
  const result = classifyCaseDrafts(context);

  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.match(result.blocked[0].reason, /FACT_ROUTE_LINK_MISSING/u);
});

test('one failed candidate makes a formal Test Point Blocked instead of also executable', () => {
  const valid = baseCase();
  const invalid = baseCase({ case_id: 'case_2222222222222222' });
  invalid.steps[0].expectations[0].oracle.expected_state = '';
  const context = classificationContext({
    cases: [valid, invalid],
    dispositions: [{
      obligation_id: IDS.obligation, status: 'case_candidate', case_ids: [valid.case_id, invalid.case_id]
    }]
  });
  const result = classifyCaseDrafts(context);

  assert.equal(result.grounded.length + result.conditional.length, 0);
  assert.equal(result.blocked.length, 1);
  assert.match(result.blocked[0].reason, /ORACLE_INVALID/u);
});

test('formal obligations have exactly one known disposition and known candidate cases', () => {
  const duplicate = classificationContext();
  duplicate.caseDrafts.obligation_dispositions.push(clone(duplicate.caseDrafts.obligation_dispositions[0]));
  const missing = classificationContext({ dispositions: [] });
  const unknown = classificationContext();
  unknown.caseDrafts.obligation_dispositions[0].obligation_id = 'obligation_9999999999999999';
  const unknownCase = classificationContext();
  unknownCase.caseDrafts.obligation_dispositions[0].case_ids = ['case_9999999999999999'];
  const emptyCandidate = classificationContext();
  emptyCandidate.caseDrafts.obligation_dispositions[0].case_ids = [];
  emptyCandidate.obligations.obligations[0].required_capabilities = [];
  const invalidStatus = classificationContext();
  invalidStatus.caseDrafts.obligation_dispositions[0].status = 'exploratory';

  for (const [context, code] of [
    [duplicate, 'OBLIGATION_DISPOSITION_DUPLICATE'],
    [missing, 'OBLIGATION_DISPOSITION_MISSING'],
    [unknown, 'OBLIGATION_DISPOSITION_UNKNOWN'],
    [unknownCase, 'DISPOSITION_CASE_UNKNOWN'],
    [emptyCandidate, 'GROUNDABLE_OBLIGATION_CASE_MISSING'],
    [invalidStatus, 'OBLIGATION_DISPOSITION_STATUS_INVALID']
  ]) {
    const result = classifyCaseDrafts(context);
    assert.equal(result.diagnostics.some((item) => item.code === code), true, code);
  }
});

test('case-candidate dispositions and Cases require bidirectional obligation linkage', () => {
  const secondId = 'obligation_2222222222222222';
  const context = classificationContext({
    obligations: [baseObligation(), baseObligation({
      obligation_id: secondId,
      view_element_refs: ['view_checkout#edge_secondary']
    })],
    dispositions: [
      { obligation_id: IDS.obligation, status: 'case_candidate', case_ids: [IDS.case] },
      { obligation_id: secondId, status: 'case_candidate', case_ids: [IDS.case] }
    ]
  });
  context.obligations.fact_routes[0].obligation_ids.push(secondId);
  const result = classifyCaseDrafts(context);

  assert.equal(result.diagnostics.some((item) => item.code === 'CASE_LANE_DISPOSITION_MISMATCH'), true);
  assert.equal(result.grounded.length + result.conditional.length + result.blocked.length + result.not_applicable.length, 0);
});

test('source revisions must match across the closed context artifacts', () => {
  const context = classificationContext();
  context.caseDrafts.source_revision = 4;
  const result = classifyCaseDrafts(context);

  assert.equal(result.diagnostics.some((item) =>
    item.category === 'classification' && item.code === 'SOURCE_REVISION_MISMATCH'), true);
});

test('the public result is fresh, closed, and never mutates its input', () => {
  const context = classificationContext();
  const before = structuredClone(context);
  const first = classifyCaseDrafts(context);
  first.grounded[0].title = 'mutated output';
  const second = classifyCaseDrafts(context);

  assert.deepEqual(context, before);
  assert.equal(second.grounded[0].title, 'Submit a ready cart');
  assert.deepEqual(Object.keys(second).sort(), [
    'blocked', 'conditional', 'diagnostics', 'exploratory', 'grounded', 'not_applicable'
  ]);
});
