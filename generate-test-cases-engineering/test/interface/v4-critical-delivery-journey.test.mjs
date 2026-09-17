import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyRequestDeliveryV4,
  applySemanticClarificationEventsV4,
  compileSemanticClarificationCheckpointV4,
  constructSemanticClarificationEventV4
} from '../../src/clarification-v4.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { compileSemanticGapRootsV4 } from '../../src/semantic-gaps-v4.mjs';
import { GENERAL_QUALITY_V4_CONTRACT } from '../../src/v4-contract.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

/** @param {string} character */
const sha = (character) => `sha256:${character.repeat(64)}`;
const checkpointBytes = new TextEncoder().encode('{"revision":1}\n');

/** @param {'critical'|'noncritical'} classification */
function gap(classification) {
  const critical = classification === 'critical';
  return {
    category: 'semantic_gap', code: critical ? 'BRANCH_UNKNOWN' : 'LABEL_UNKNOWN',
    subject_fact_ids: [critical ? 'FACT-branch' : 'FACT-label'],
    missing_aspect: critical ? 'approval_branch' : 'display_label',
    scope_ref: critical ? 'order.approval' : 'order.label',
    question: critical ? '订单是否必须经过人工审批？' : '辅助标签使用哪个文案？',
    why_needed: critical ? '必须得到最终适用规则才能确定必经分支。' : '用于补充非关键展示预期。',
    decision_impact: critical ? '不同答案会改变必经审批分支。' : '不改变核心验收与必经分支。',
    unresolved_outcome: critical ? '无法确定完整必经流程。' : '标签场景保持 Conditional。',
    answer_options: critical ? ['必须', '不需要'] : ['标签 A', '标签 B'],
    risk_level: critical ? 'low' : 'critical', source_claim_ids: [critical ? 'CLM-branch' : 'CLM-label'],
    discovery_phase: 'pre_case', affected_test_point_ids: [],
    acceptance_impact: critical ? {
      classification, criteria: ['changes_required_branch'], rationale: '不同答案会改变必经审批分支。'
    } : {
      classification, criteria: ['does_not_change_required_acceptance'], rationale: '不改变正式验收结果。'
    }
  };
}

function checkpoint() {
  return compileSemanticClarificationCheckpointV4({
    schema_version: '4.3.0', compiler_version: '0.8.0', run_id: 'RUN-critical-gate',
    committed_revision: 1, committed_checkpoint_bytes: checkpointBytes,
    discovery_phase: 'pre_case', source_review_witness: {
      expected_unit_ids: ['BLOCK-prd'], reviewed_unit_ids: ['BLOCK-prd']
    },
    fact_ledger_digest: sha('1'), scope_manifest_digest: sha('2'),
    behavior_views_digest: null, case_drafts_digest: null,
    facts: [
      { fact_id: 'FACT-branch', statement: '订单存在审批流程', claim_ids: ['CLM-branch'] },
      { fact_id: 'FACT-label', statement: '订单显示辅助标签', claim_ids: ['CLM-label'] }
    ],
    diagnostic_candidates: [gap('critical'), gap('noncritical')], prior_checkpoint: null
  });
}

test('AT17/AT18: a mixed request_delivery selection fails atomically and critical part has no bypass action', () => {
  const initial = checkpoint();
  const presentation = /** @type {any} */ (initial.presentation);
  const criticalPart = presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('审批'));
  const noncriticalPart = presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('标签'));
  assert.ok(!criticalPart.available_actions.includes('request_delivery'));
  assert.ok(noncriticalPart.available_actions.includes('request_delivery'));

  const forgedMixed = {
    event_type: 'request_delivery', presentation_id: presentation.presentation_id,
    question_part_refs: [criticalPart, noncriticalPart].map((/** @type {any} */ part) => ({
      question_part_id: part.question_part_id, root_issue_id: part.root_issue_id,
      root_version_digest: part.root_version_digest
    }))
  };
  assert.throws(() => applyRequestDeliveryV4(initial.checkpoint, forgedMixed), /CRITICAL_SEMANTIC_DELIVERY_FORBIDDEN/);
  assert.deepEqual(initial.checkpoint.clarification_state.closed_for_delivery_part_ids, []);
});

test('AT19: defer/unknown keeps a critical question recoverable while noncritical delivery remains legal', () => {
  const initial = checkpoint();
  const presentation = /** @type {any} */ (initial.presentation);
  const criticalPart = presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('审批'));
  const defer = constructSemanticClarificationEventV4(
    presentation, criticalPart, 'defer_question_part'
  );
  const deferred = applySemanticClarificationEventsV4({
    checkpoint: initial.checkpoint, clarification_events: [defer], existing_decisions: [],
    presentation_history: [presentation], normalized_user_messages: [],
    previous_obligations_by_root: [], current_obligations_by_root: []
  });
  assert.equal(deferred.status, 'need_user_answers');
  const deferredPresentation = /** @type {any} */ (deferred.presentation);
  const recovered = deferredPresentation.question_parts.find(
    (/** @type {any} */ part) => part.root_issue_id === criticalPart.root_issue_id
  );
  assert.ok(recovered);
  assert.deepEqual(recovered.available_actions, ['answer_question_part']);

  const noncriticalPart = deferredPresentation.question_parts.find(
    (/** @type {any} */ part) => part.question.includes('标签')
  );
  const closeNoncritical = constructSemanticClarificationEventV4(
    deferredPresentation, noncriticalPart, 'request_delivery'
  );
  const narrowed = applyRequestDeliveryV4(deferred.checkpoint, closeNoncritical);
  assert.equal(narrowed.status, 'need_user_answers');
  const narrowedPresentation = /** @type {any} */ (narrowed.presentation);
  assert.equal(narrowedPresentation.question_parts.length, 1);
  assert.equal(narrowedPresentation.question_parts[0].root_issue_id, criticalPart.root_issue_id);
});

/** @param {'critical'|'noncritical'} classification */
function pipelineFixture(classification) {
  const fixture = v4GeneralQualityFixture();
  const fact = fixture.artifacts.evidence_claims.fact_ledger[0];
  const claimId = fact.claim_id ?? fact.claim_ids[0];
  const candidate = {
    category: 'semantic_gap', code: 'REVIEW_BRANCH_UNKNOWN', subject_fact_ids: [fact.fact_id],
    missing_aspect: 'review_branch', scope_ref: 'checkout.review', question: '提交后是否必须人工复核？',
    why_needed: '必须得到最终适用规则才能确定必经分支。', decision_impact: '不同答案会改变必经复核分支。',
    unresolved_outcome: '完整必经流程暂不可判定。', answer_options: ['必须', '不需要'],
    risk_level: classification === 'critical' ? 'low' : 'critical', source_claim_ids: [claimId],
    discovery_phase: 'pre_case', affected_test_point_ids: [], acceptance_impact: classification === 'critical'
      ? { classification, criteria: ['changes_required_branch'], rationale: '不同答案改变必经复核分支。' }
      : { classification, criteria: ['does_not_change_required_acceptance'], rationale: '只影响补充说明。' }
  };
  fixture.artifacts.evidence_claims.semantic_gaps = [candidate];
  const root = compileSemanticGapRootsV4({
    contract: GENERAL_QUALITY_V4_CONTRACT,
    facts: fixture.artifacts.evidence_claims.fact_ledger,
    claims: fixture.artifacts.evidence_claims.claims,
    diagnostic_candidates: [candidate], discovery_phase: 'pre_case'
  })[0];
  return { fixture, root };
}

test('AT17/AT20/AT26: final pipeline blocks critical closure but accepts exact final E3 resolution', () => {
  const blocked = pipelineFixture('critical');
  blocked.fixture.system.decisions = {
    delivery_requested: true,
    root_statuses: [{
      root_issue_id: blocked.root.root_issue_id,
      root_version_digest: blocked.root.root_version_digest,
      status: 'closed_for_delivery'
    }], records: []
  };
  const rejected = compileCaseDocumentRevisionV4(blocked.fixture.artifacts, blocked.fixture.system);
  assert.equal(rejected.status, 'need_user_answers');
  assert.equal(rejected.phase, 'requirements_analysis');

  const resolved = pipelineFixture('critical');
  resolved.fixture.system.decisions = {
    delivery_requested: false,
    root_statuses: [{
      root_issue_id: resolved.root.root_issue_id,
      root_version_digest: resolved.root.root_version_digest,
      status: 'resolved_final'
    }],
    records: [{
      target: {
        root_issue_id: resolved.root.root_issue_id,
        root_version_digest: resolved.root.root_version_digest
      },
      resolution: 'final', evidence_level: 'E3', authority: 'product_final'
    }]
  };
  assert.equal(compileCaseDocumentRevisionV4(resolved.fixture.artifacts, resolved.fixture.system).status, 'compiled');
});

test('AT21: a high-risk noncritical gap retains 4.3 Conditional delivery semantics', () => {
  const { fixture, root } = pipelineFixture('noncritical');
  fixture.system.decisions = {
    delivery_requested: true,
    root_statuses: [{
      root_issue_id: root.root_issue_id,
      root_version_digest: root.root_version_digest,
      status: 'closed_for_delivery'
    }], records: []
  };
  const compiled = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(compiled.status, 'compiled');
  assert.equal(compiled.result_kind, 'delivered_with_gaps');
});
