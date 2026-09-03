import assert from 'node:assert/strict';
import test from 'node:test';
import { compileExecutionPlan, projectReadyExecutionPlan } from '../../src/execution-plan.mjs';

const sha = 'a'.repeat(64);

/** @param {string} caseId @param {string} status @param {string[]} obligationIds */
function caseEntry(caseId, status, obligationIds) {
  return {
    case_id: caseId, title: `Case ${caseId}`, scope: 'checkout', risk: 'high',
    obligation_ids: obligationIds, evidence_refs: [`claim_${caseId}`],
    steps: [{ step_id: `step_${caseId}`, action: 'Act', expectations: [{
      expectation_id: `expect_${caseId}`, business_assertion: 'Saved',
      oracle: { type: 'state', expected_state: 'saved', comparison: 'equals' },
      support_review: 'supported'
    }]}],
    semantic_status: status
  };
}

/** @returns {any} */
function semanticBundle() {
  return {
    schema_version: '2.0.0', source_revision: 0,
    grounded: [caseEntry('case_a', 'grounded', ['tp_a', 'tp_shared'])],
    conditional: [
      caseEntry('case_b', 'conditional', ['tp_b']),
      caseEntry('case_c', 'conditional', ['tp_b'])
    ],
    blocked: [{
      obligation_id: 'tp_blocked', root_issue_id: 'root_a', reason: 'Missing rule', risk: 'high',
      recovery: { missing_type: 'oracle', required_material: 'Outcome', question: 'What happens?' }
    }],
    exploratory: [{ exploratory_id: 'exp_a', title: 'Rapid retries', scope: 'checkout', risk: 'medium', reason: 'Risk.' }],
    coverage: {
      formal: { total: 5, covered: 3, entries: [
        { obligation_id: 'tp_a', status: 'grounded' },
        { obligation_id: 'tp_shared', status: 'grounded' },
        { obligation_id: 'tp_b', status: 'conditional' },
        { obligation_id: 'tp_blocked', status: 'blocked' },
        { obligation_id: 'tp_na', status: 'not_applicable' }
      ] },
      not_applicable: [{ obligation_id: 'tp_na', exclusion_claim_id: 'claim_exclusion', scope: 'checkout', support_review: 'supported' }]
    }
  };
}

/** @param {Record<string,unknown>} [overrides] @returns {any} */
function input(overrides = {}) {
  return {
    semanticBundle: semanticBundle(),
    obligations: [
      { obligation_id: 'tp_a', title: 'Primary save', scope: 'checkout', risk: 'high' },
      { obligation_id: 'tp_shared', title: 'Shared audit', scope: 'checkout', risk: 'medium' },
      { obligation_id: 'tp_b', title: 'Conditional save', scope: 'checkout', risk: 'medium' },
      { obligation_id: 'tp_blocked', title: 'Duplicate save', scope: 'checkout', risk: 'high' },
      { obligation_id: 'tp_na', title: 'Guest save', scope: 'checkout', risk: 'low' }
    ],
    evidenceClaims: {
      claims: [
        { claim_id: 'claim_case_a', level: 'E3', kind: 'requirement', scope: 'checkout', value: 'Save.' },
        { claim_id: 'claim_case_b', level: 'E1', kind: 'approved-assumption', scope: 'checkout', value: 'Maybe save.' },
        { claim_id: 'claim_case_c', level: 'E1', kind: 'approved-assumption', scope: 'checkout', value: 'Maybe save twice.' },
        { claim_id: 'claim_exclusion', level: 'E3', kind: 'exclusion', scope: 'checkout', value: 'Guests excluded.' }
      ]
    },
    sourcePack: {
      run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout',
      sources: [{ source_id: 'source_a', content_digest: sha }], decision_records: [],
      clarification_events: [], execution_events: []
    },
    runIdentityDigest: sha,
    priorWorkflowState: null,
    ...overrides
  };
}

test('decision inventory has one item per Case and only case-less Blocked or NotApplicable formal points', () => {
  const result = compileExecutionPlan(input());
  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.plan.items.map((/** @type {any} */ item) => [item.item_kind, item.item_id]), [
    ['case', 'case_a'], ['case', 'case_b'], ['case', 'case_c'],
    ['exploratory', 'exp_a'], ['formal_test_point', 'tp_blocked'], ['formal_test_point', 'tp_na']
  ]);
  assert.deepEqual(result.plan.items.find((/** @type {any} */ item) => item.item_id === 'case_a').related_obligation_ids, ['tp_a', 'tp_shared']);
  assert.equal(result.plan.items.filter((/** @type {any} */ item) => item.item_id === 'tp_b').length, 0);
});

test('defaults keep truth separate from execution and force non-grounded choices pending', () => {
  const { plan } = compileExecutionPlan(input());
  const byId = new Map(plan.items.map((/** @type {any} */ item) => [item.item_id, item]));
  assert.deepEqual([
    byId.get('case_a').semantic_status, byId.get('case_a').execution_disposition,
    byId.get('case_a').reason_code, byId.get('case_a').basis.origin
  ], ['grounded', 'execute', 'selected_for_run', 'default_grounded_recommendation']);
  assert.deepEqual([
    byId.get('tp_na').semantic_status, byId.get('tp_na').execution_disposition,
    byId.get('tp_na').reason_code, byId.get('tp_na').basis.origin
  ], ['not_applicable', 'do_not_execute', 'not_applicable', 'derived_not_applicable']);
  for (const id of ['case_b', 'case_c', 'tp_blocked', 'exp_a']) {
    assert.equal(byId.get(id).execution_disposition, 'pending', id);
    assert.equal(byId.get(id).reason_code, null, id);
  }
  assert.equal(plan.status, 'decision_required');
});

test('runner projection and TP execution coverage are mechanical and hand-counted', () => {
  const { plan } = compileExecutionPlan(input());
  assert.deepEqual(plan.runner_case_ids, ['case_a']);
  assert.deepEqual(plan.test_point_execution_coverage, [
    { obligation_id: 'tp_a', related_grounded_case_ids: ['case_a'], execute_case_ids: ['case_a'], status: 'full' },
    { obligation_id: 'tp_b', related_grounded_case_ids: [], execute_case_ids: [], status: 'none' },
    { obligation_id: 'tp_blocked', related_grounded_case_ids: [], execute_case_ids: [], status: 'none' },
    { obligation_id: 'tp_shared', related_grounded_case_ids: ['case_a'], execute_case_ids: ['case_a'], status: 'full' }
  ]);
  assert.deepEqual({
    formal: plan.summary.formal_test_point_count,
    applicable: plan.summary.applicable_formal_test_point_count,
    notApplicable: plan.summary.not_applicable_formal_test_point_count,
    full: plan.summary.full_test_point_count,
    partial: plan.summary.partial_test_point_count,
    none: plan.summary.none_test_point_count
  }, { formal: 5, applicable: 4, notApplicable: 1, full: 2, partial: 0, none: 2 });
});

test('item and plan digests ignore run identity but retain ordered Case semantics', () => {
  const first = compileExecutionPlan(input());
  const anotherRun = compileExecutionPlan(input({ runIdentityDigest: 'b'.repeat(64) }));
  assert.equal(first.plan.plan_digest, anotherRun.plan.plan_digest);
  const changed = input();
  changed.semanticBundle.grounded[0].steps[0].action = 'Different action';
  const second = compileExecutionPlan(changed);
  assert.notEqual(first.plan.items[0].item_semantic_digest, second.plan.items[0].item_semantic_digest);
  assert.notEqual(first.plan.plan_digest, second.plan.plan_digest);
});

test('duplicate inventory identity and inconsistent formal coverage fail closed', () => {
  const duplicate = input();
  duplicate.semanticBundle.conditional[0].case_id = 'case_a';
  const result = compileExecutionPlan(duplicate);
  assert.equal(result.diagnostics.some((item) => item.code === 'EXECUTION_ITEM_DUPLICATE'), true);

  const missing = input();
  missing.semanticBundle.coverage.formal.entries.pop();
  const invalid = compileExecutionPlan(missing);
  assert.equal(invalid.diagnostics.some((item) => item.code === 'FORMAL_COUNT_MISMATCH'), true);
});

test('accepted Exploratory adoption promotes only after a linked formal Test Point exists', () => {
  const firstInput = input();
  firstInput.semanticBundle.grounded = [];
  firstInput.semanticBundle.conditional = [];
  firstInput.semanticBundle.blocked = [];
  firstInput.semanticBundle.coverage.formal = { total: 0, covered: 0, entries: [] };
  firstInput.semanticBundle.coverage.not_applicable = [];
  firstInput.obligations = [];
  const first = compileExecutionPlan(firstInput);
  const risk = first.plan.items.find((/** @type {any} */ item) => item.item_id === 'exp_a');
  assert.ok(risk);

  const adoptedInput = input();
  adoptedInput.semanticBundle.exploratory = [
    { exploratory_id: 'exp_a', title: 'Rapid retries', scope: 'checkout', risk: 'medium', reason: 'Risk.' }
  ];
  adoptedInput.semanticBundle.grounded = [caseEntry('case_promoted', 'grounded', ['tp_promoted'])];
  adoptedInput.semanticBundle.conditional = [];
  adoptedInput.semanticBundle.blocked = [];
  adoptedInput.semanticBundle.coverage.formal = {
    total: 1, covered: 1, entries: [{ obligation_id: 'tp_promoted', status: 'grounded' }]
  };
  adoptedInput.semanticBundle.coverage.not_applicable = [];
  adoptedInput.obligations = [{
    obligation_id: 'tp_promoted', title: 'Retry once', scope: 'checkout', risk: 'medium',
    source_claim_ids: ['claim_adoption']
  }];
  adoptedInput.evidenceClaims.claims.push({
    claim_id: 'claim_adoption', decision_id: 'decision_adopt', level: 'E3',
    kind: 'requirement', scope: 'checkout', value: 'Retry once.'
  });
  adoptedInput.sourcePack.decision_records.push({
    decision_id: 'decision_adopt', decision_type: 'exploratory_adoption',
    clarification_event_seq: 1, exploratory_id: 'exp_a',
    business_rule: 'Retry once.', expected_result: 'The retry succeeds.',
    confirmer: 'owner', authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_a', evidence_level: 'E3'
  });
  adoptedInput.priorWorkflowState = {
    execution_plan: first.plan, presentation_snapshot: first.presentation,
    workflow_event_head_seq: 1, workflow_event_log_digest: sha,
    confirmation: null, active_pause: null, promoted_exploratory: []
  };
  const promoted = compileExecutionPlan(adoptedInput);
  assert.deepEqual(promoted.diagnostics, []);
  assert.equal(promoted.plan.items.some((/** @type {any} */ item) => item.item_id === 'exp_a'), false);
  assert.deepEqual(promoted.plan.promoted_exploratory, [{
    exploratory_id: 'exp_a', adoption_decision_id: 'decision_adopt',
    obligation_ids: ['tp_promoted'], case_ids: ['case_promoted']
  }]);

  promoted.plan.status = 'ready';
  promoted.plan.confirmation = {
    actor: 'owner', authority_scope: 'checkout', confirmed_plan_digest: promoted.plan.plan_digest
  };
  const projected = projectReadyExecutionPlan(
    promoted.plan, adoptedInput.sourcePack, adoptedInput.evidenceClaims
  );
  assert.match(projected.promoted_exploratory[0].adoption_decision_semantic_digest, /^[a-f0-9]{64}$/u);
  assert.equal('adoption_decision_id' in projected.promoted_exploratory[0], false);
});
