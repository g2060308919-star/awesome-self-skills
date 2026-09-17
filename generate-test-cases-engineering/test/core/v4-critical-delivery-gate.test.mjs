import assert from 'node:assert/strict';
import test from 'node:test';

import evidenceClaimsSchema from '../../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import {
  availableSemanticActionsV4,
  deriveSemanticDeliveryGateV4
} from '../../src/semantic-delivery-gate-v4.mjs';
import { GENERAL_QUALITY_V4_CONTRACT } from '../../src/v4-contract.mjs';
import { classifyFinalOutcomeV4 } from '../../src/final-outcome-v4.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

/** @param {string} character */
const digest = (character) => `sha256:${character.repeat(64)}`;

/** @param {'critical'|'noncritical'} classification @param {string} [id] */
function root(classification, id = classification) {
  return {
    root_issue_id: `ROOT-${id}`,
    root_version_digest: digest(classification === 'critical' ? 'a' : 'b'),
    acceptance_impact: classification === 'critical' ? {
      classification,
      criteria: ['changes_required_branch'],
      rationale: '不同答案会改变必经审批分支。'
    } : {
      classification,
      criteria: ['does_not_change_required_acceptance'],
      rationale: '答案只影响非关键展示示例。'
    },
    risk_level: classification === 'critical' ? 'low' : 'critical'
  };
}

/** @param {any} semanticRoot @param {string} status */
const state = (semanticRoot, status) => ({
  root_issue_id: semanticRoot.root_issue_id,
  root_version_digest: semanticRoot.root_version_digest,
  status
});

test('AT16/AT20/AT21: criticality follows acceptance impact, never risk or temporary closure', () => {
  const critical = root('critical');
  const noncritical = root('noncritical');
  for (const status of [
    'presented', 'resolved_temporary', 'deferred_by_user', 'unknown_by_user', 'closed_for_delivery'
  ]) {
    const result = deriveSemanticDeliveryGateV4({
      contract: GENERAL_QUALITY_V4_CONTRACT,
      roots: [critical, noncritical],
      rootStates: [state(critical, status), state(noncritical, 'closed_for_delivery')],
      decisions: []
    });
    assert.equal(result.can_materialize_formal_case_document, false, status);
    assert.deepEqual(result.unresolved_critical_root_ids, [critical.root_issue_id]);
  }
});

test('AT22: 4.3 fails closed when acceptance impact has not been classified', () => {
  const unclassified = { root_issue_id: 'ROOT-unclassified', root_version_digest: digest('c'), risk_level: 'low' };
  assert.throws(() => deriveSemanticDeliveryGateV4({
    contract: GENERAL_QUALITY_V4_CONTRACT,
    roots: [unclassified], rootStates: [state(unclassified, 'presented')], decisions: []
  }), /SEMANTIC_IMPACT_REQUIRED/);
});

test('AT26: only a current final E3 Decision resolves a critical user question', () => {
  const critical = root('critical');
  const finalDecision = {
    target: {
      root_issue_id: critical.root_issue_id,
      root_version_digest: critical.root_version_digest
    },
    resolution: 'final', evidence_level: 'E3', authority: 'product_final'
  };
  const resolved = deriveSemanticDeliveryGateV4({
    contract: GENERAL_QUALITY_V4_CONTRACT,
    roots: [critical], rootStates: [state(critical, 'resolved_final')], decisions: [finalDecision]
  });
  assert.equal(resolved.can_materialize_formal_case_document, true);
  assert.deepEqual(resolved.resolved_critical_roots, [{
    root_issue_id: critical.root_issue_id,
    root_version_digest: critical.root_version_digest,
    basis_kind: 'final_e3_decision'
  }]);

  for (const staleOrWeak of [
    { ...finalDecision, resolution: 'temporary', evidence_level: 'E1' },
    { ...finalDecision, authority: 'task_scoped' },
    { ...finalDecision, target: { ...finalDecision.target, root_version_digest: digest('d') } }
  ]) {
    assert.equal(deriveSemanticDeliveryGateV4({
      contract: GENERAL_QUALITY_V4_CONTRACT,
      roots: [critical], rootStates: [state(critical, 'resolved_final')], decisions: [staleOrWeak]
    }).can_materialize_formal_case_document, false);
  }
});

test('AT26: replayable E2 derivation and evidence-backed non-applicability are legal final bases', () => {
  const critical = root('critical');
  for (const fixture of [
    {
      status: 'resolved_final', record: {
        root_issue_id: critical.root_issue_id, root_version_digest: critical.root_version_digest,
        resolution_kind: 'derived_e2', evidence_level: 'E2', replayable: true,
        source_claim_ids: ['CLM-derived']
      }, basis: 'replayable_e2_derivation'
    },
    {
      status: 'obsolete', record: {
        root_issue_id: critical.root_issue_id, root_version_digest: critical.root_version_digest,
        resolution_kind: 'evidence_not_applicable', evidence_level: 'E3', replayable: true,
        source_claim_ids: ['CLM-not-applicable']
      }, basis: 'evidence_not_applicable'
    }
  ]) {
    const result = deriveSemanticDeliveryGateV4({
      contract: GENERAL_QUALITY_V4_CONTRACT,
      roots: [critical], rootStates: [state(critical, fixture.status)], decisions: [fixture.record]
    });
    assert.equal(result.can_materialize_formal_case_document, true);
    assert.equal(result.resolved_critical_roots[0].basis_kind, fixture.basis);
  }
});

test('AT18/AT19: critical questions never advertise delivery bypass and remain answerable after defer', () => {
  const critical = root('critical');
  const noncritical = root('noncritical');
  assert.deepEqual(availableSemanticActionsV4(critical, state(critical, 'presented')), [
    'answer_question_part', 'defer_question_part', 'mark_question_unknown'
  ]);
  assert.deepEqual(availableSemanticActionsV4(critical, state(critical, 'deferred_by_user')), [
    'answer_question_part'
  ]);
  assert.deepEqual(availableSemanticActionsV4(noncritical, state(noncritical, 'presented')), [
    'answer_question_part', 'defer_question_part', 'mark_question_unknown', 'request_delivery'
  ]);
});

test('AT17: final outcome cannot classify a formal delivery while any critical root is unresolved', () => {
  const input = {
    delivery_intent: 'case_document', cancelled: false, case_count: 3,
    applicable_formal_test_point_count: 3, decidable_primary_acceptance_count: 3,
    blocked_root_count: 1, closed_for_delivery_root_count: 1,
    open_semantic_gap_count: 0, not_applicable_count: 0,
    all_reviewed_formal_points_not_applicable: false, delivery_requested: true,
    strict_semantic_delivery: true, unresolved_critical_semantic_gap_count: 1
  };
  assert.deepEqual(classifyFinalOutcomeV4(input), {
    status: 'need_user_answers', result_kind: null, reason_code: 'CRITICAL_SEMANTIC_GAPS_REMAIN'
  });
  assert.equal(classifyFinalOutcomeV4({
    ...input, unresolved_critical_semantic_gap_count: 0
  }).result_kind, 'delivered_with_gaps');
});

test('AT22: actual Evidence Schema requires a closed acceptance-impact contract only in 4.3', () => {
  const evidence = v4GeneralQualityFixture().artifacts.evidence_claims;
  const fact = evidence.fact_ledger[0];
  const claimId = fact.claim_id ?? fact.claim_ids[0];
  const semanticGap = {
    category: 'semantic_gap', code: 'RULE_UNKNOWN', subject_fact_ids: [fact.fact_id],
    missing_aspect: 'branch', scope_ref: 'checkout.review', question: '是否复核？',
    why_needed: '需要最终规则。', decision_impact: '不同答案改变分支。',
    unresolved_outcome: '流程不可判定。', answer_options: ['是', '否'], risk_level: 'low',
    source_claim_ids: [claimId], discovery_phase: 'pre_case', affected_test_point_ids: []
  };
  evidence.semantic_gaps = [{
    ...semanticGap,
    acceptance_impact: {
      classification: 'critical', criteria: ['changes_required_branch'], rationale: '改变必经分支。'
    }
  }];
  assert.deepEqual(validateAgainstSchema(evidence, evidenceClaimsSchema), []);

  const missing = structuredClone(evidence);
  delete missing.semantic_gaps[0].acceptance_impact;
  assert.notDeepEqual(validateAgainstSchema(missing, evidenceClaimsSchema), []);

  const illegal = structuredClone(evidence);
  illegal.semantic_gaps[0].acceptance_impact.criteria = ['does_not_change_required_acceptance'];
  assert.notDeepEqual(validateAgainstSchema(illegal, evidenceClaimsSchema), []);

  const old = structuredClone(evidence);
  old.schema_version = '4.2.0';
  assert.notDeepEqual(validateAgainstSchema(old, evidenceClaimsSchema), []);
});
