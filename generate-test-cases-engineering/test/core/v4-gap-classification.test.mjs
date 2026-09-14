import assert from 'node:assert/strict';
import test from 'node:test';
import * as gapKinds from '../../src/gap-kinds-v4.mjs';

/** @param {string} category */
function issue(category) {
  return { category, code: 'FIXTURE_DIAGNOSTIC', message: '明确的诊断原因',
    affected_fact_ids: ['FACT-source'], affected_test_point_ids: ['TP-source'] };
}
const recoverable = {
  committed_digests_valid: true, unique_committed_state: true, append_digest_conflict: false,
  damage_scope: 'rebuildable_checkpoint'
};
const splittable = {
  source_fact_scopes_disjoint: true, outcome_unique_ownership: true, merged_coverage_verifiable: true,
  minimal_shard_exceeds_limit: false, atomic_outcomes_preserved: true
};

test('v4 gap classification routes exactly eight categories by owner action and status', () => {
  assert.equal(typeof gapKinds.routeGapDiagnosticV4, 'function', 'new v4 taxonomy seam is required');
  const table = [
    ['semantic_gap', 'user_or_normative_source', 'answer_semantic_question', 'need_user_answers'],
    ['source_artifact', 'source_provider', 'provide_artifact', 'need_artifact'],
    ['adapter_revision', 'agent_adapter', 'revise_artifact', 'need_revision'],
    ['protocol_failure', 'compiler', 'recover_from_committed', 'recover_from_committed'],
    ['quality_failure', 'compiler_or_agent', 'reanalyze', 'fatal'],
    ['capacity_limit', 'compiler', 'deterministic_split', 'deterministic_split'],
    ['heuristic_risk', 'test_designer', 'review_exploratory_risk', 'exploratory'],
    ['execution_readiness', 'execution_plan_owner', 'evaluate_in_execution_plan', 'ignored_for_case_document']
  ];
  for (const [category, owner, action, status] of table) {
    const result = gapKinds.routeGapDiagnosticV4(issue(category), {
      delivery_intent: 'case_document', protocol_state: recoverable, capacity_state: splittable
    });
    assert.equal(result.owner, owner, category);
    assert.equal(result.recovery_action, action, category);
    assert.equal(result.status, status, category);
    assert.deepEqual(result.affected_fact_ids, ['FACT-source']);
    assert.deepEqual(result.affected_test_point_ids, ['TP-source']);
    assert.equal(result.enters_business_questions, category === 'semantic_gap');
    assert.equal(result.semantic_status, category === 'semantic_gap' ? 'Blocked' : null);
    assert.equal(typeof result.user_actionable, 'boolean');
  }
});

test('v4 protocol classification recovers only from proven valid unique committed state', () => {
  assert.equal(typeof gapKinds.routeGapDiagnosticV4, 'function');
  for (const damage_scope of ['staging', 'temporary', 'rebuildable_checkpoint']) {
    const result = gapKinds.routeGapDiagnosticV4(issue('protocol_failure'), {
      delivery_intent: 'case_document', protocol_state: { ...recoverable, damage_scope }
    });
    assert.equal(result.status, 'recover_from_committed');
    assert.equal(result.recovery_action, 'recover_from_committed');
  }
});

test('v4 protocol classification uniquely fails fatal for broken or indeterminate committed integrity', () => {
  assert.equal(typeof gapKinds.routeGapDiagnosticV4, 'function');
  for (const protocol_state of [
    { ...recoverable, committed_digests_valid: false }, { ...recoverable, unique_committed_state: false },
    { ...recoverable, append_digest_conflict: true }, { ...recoverable, damage_scope: 'committed' }, undefined
  ]) {
    const result = gapKinds.routeGapDiagnosticV4(issue('protocol_failure'), { delivery_intent: 'case_document', protocol_state });
    assert.equal(result.status, 'fatal');
    assert.equal(result.recovery_action, 'repair_integrity');
    assert.equal(result.enters_business_questions, false);
  }
});

test('v4 capacity classification uniquely splits only disjoint owner-complete verifiable atomic scopes', () => {
  assert.equal(typeof gapKinds.routeGapDiagnosticV4, 'function');
  const result = gapKinds.routeGapDiagnosticV4(issue('capacity_limit'), {
    delivery_intent: 'case_document', capacity_state: splittable
  });
  assert.equal(result.status, 'deterministic_split');
  assert.equal(result.recovery_action, 'deterministic_split');
  assert.equal(result.result_kind, null);
});

test('v4 capacity classification uniquely returns quality failure when safe complete splitting is unproven', () => {
  assert.equal(typeof gapKinds.routeGapDiagnosticV4, 'function');
  for (const capacity_state of [
    { ...splittable, minimal_shard_exceeds_limit: true }, { ...splittable, atomic_outcomes_preserved: false },
    { ...splittable, source_fact_scopes_disjoint: false }, { ...splittable, outcome_unique_ownership: false },
    { ...splittable, merged_coverage_verifiable: false }, undefined
  ]) {
    const result = gapKinds.routeGapDiagnosticV4(issue('capacity_limit'), { delivery_intent: 'case_document', capacity_state });
    assert.equal(result.status, 'fatal');
    assert.equal(result.result_kind, 'quality_failure');
    assert.equal(result.recovery_action, 'reduce_scope_or_increase_limit');
    assert.equal(result.enters_business_questions, false);
  }
});

test('[P-03][P-06][BR-02][BR-03][BR-05] v4 execution readiness is downstream only and never becomes semantic Blocked or NotApplicable', () => {
  assert.equal(typeof gapKinds.routeGapDiagnosticV4, 'function');
  const result = gapKinds.routeGapDiagnosticV4(issue('execution_readiness'), { delivery_intent: 'execution_plan' });
  assert.equal(result.status, 'execution_plan_only');
  assert.equal(result.owner, 'execution_plan_owner');
  assert.equal(result.recovery_action, 'provide_execution_binding');
  assert.equal(result.semantic_status, null);
  assert.equal(result.enters_business_questions, false);
});

test('v4 gap classification rejects unknown categories, forged ownership and unsupported intent', () => {
  assert.equal(typeof gapKinds.routeGapDiagnosticV4, 'function');
  assert.throws(() => gapKinds.routeGapDiagnosticV4(issue('unknown_gap'), { delivery_intent: 'case_document' }), /DIAGNOSTIC_INPUT_INVALID/);
  assert.throws(() => gapKinds.routeGapDiagnosticV4({ ...issue('semantic_gap'), owner: 'compiler' }, { delivery_intent: 'case_document' }), /DIAGNOSTIC_INPUT_INVALID/);
  assert.throws(() => gapKinds.routeGapDiagnosticV4(issue('semantic_gap'), { delivery_intent: 'default' }), /DELIVERY_INTENT_INVALID/);
});

test('v4 gap classification never coerces unknown protocol or intent objects into authoritative states', () => {
  const result = gapKinds.routeGapDiagnosticV4(issue('protocol_failure'), {
    delivery_intent: 'case_document', protocol_state: { ...recoverable, damage_scope: { toString: () => 'staging' } }
  });
  assert.equal(result.status, 'fatal');
  assert.throws(() => gapKinds.routeGapDiagnosticV4(issue('execution_readiness'), {
    delivery_intent: { toString: () => 'case_document' }
  }), /DELIVERY_INTENT_INVALID/);
});
