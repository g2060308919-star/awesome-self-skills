import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  materializeCaseDocumentDeliveryV4,
  publishCaseDocumentDeliveryV4
} from '../../src/canonical-delivery-v4.mjs';
import { compileSemanticGapRootsV4 } from '../../src/semantic-gaps-v4.mjs';
import { deriveSemanticDeliveryGateV4 } from '../../src/semantic-delivery-gate-v4.mjs';
import { GENERAL_QUALITY_V4_CONTRACT } from '../../src/v4-contract.mjs';
import { candidateDeliveryInput } from '../helpers/v4-candidate-delivery-fixture.mjs';

const base = {
  category: 'semantic_gap', code: 'RULE_UNKNOWN', subject_fact_ids: ['FACT-rule'],
  missing_aspect: 'required_branch', scope_ref: 'order.review', question: '是否必须复核？',
  why_needed: '需要最终规则。', decision_impact: '可能改变必经分支。',
  unresolved_outcome: '流程结果无法确定。', answer_options: ['是', '否'], risk_level: 'low',
  source_claim_ids: ['CLM-rule'], discovery_phase: 'pre_case', affected_test_point_ids: []
};

/** @param {'critical'|'noncritical'} classification */
function compile(classification) {
  return compileSemanticGapRootsV4({
    contract: GENERAL_QUALITY_V4_CONTRACT,
    facts: [{ fact_id: 'FACT-rule', statement: '订单可能需要复核', claim_ids: ['CLM-rule'] }],
    diagnostic_candidates: [{
      ...base,
      acceptance_impact: classification === 'critical' ? {
        classification, criteria: ['changes_required_branch'], rationale: '不同答案改变必经分支。'
      } : {
        classification, criteria: ['does_not_change_required_acceptance'], rationale: '不改变必经验收。'
      }
    }], discovery_phase: 'pre_case'
  })[0];
}

test('AT27: impact changes invalidate old root versions, states, and final choices', () => {
  const oldRoot = compile('noncritical');
  const currentRoot = compile('critical');
  assert.equal(currentRoot.root_issue_id, oldRoot.root_issue_id);
  assert.notEqual(currentRoot.root_version_digest, oldRoot.root_version_digest);
  assert.notEqual(currentRoot.question_part_id, oldRoot.question_part_id);

  const result = deriveSemanticDeliveryGateV4({
    contract: GENERAL_QUALITY_V4_CONTRACT, roots: [currentRoot],
    rootStates: [{
      root_issue_id: currentRoot.root_issue_id,
      root_version_digest: oldRoot.root_version_digest,
      status: 'resolved_final'
    }],
    decisions: [{
      target: { root_issue_id: oldRoot.root_issue_id, root_version_digest: oldRoot.root_version_digest },
      resolution: 'final', evidence_level: 'E3', authority: 'product_final'
    }]
  });
  assert.equal(result.can_materialize_formal_case_document, false);
  assert.deepEqual(result.stale_root_state_ids, [currentRoot.root_issue_id]);
});

function unresolvedCriticalDelivery() {
  const input = candidateDeliveryInput();
  input.bundle.schema_version = '4.3.0';
  input.bundle.compiler_version = '0.8.0';
  input.bundle.result_kind = 'delivered_with_gaps';
  input.bundle.coverage.semantic_gap_count = 1;
  input.bundle.semantic_root_groups = [{
    root_issue_id: 'ROOT-materialization', root_version_digest: `sha256:${'e'.repeat(64)}`,
    status: 'resolved_temporary', title: '审批分支', business_object: 'order.review',
    question: '是否必须审批？', why_needed: '需要最终适用规则。',
    decision_impact: '不同答案改变必经分支。', unresolved_outcome: '正式结果不可判定。',
    acceptance_impact: {
      classification: 'critical', criteria: ['changes_required_branch'],
      rationale: '不同答案改变必经分支。'
    },
    critical_resolution_basis: null,
    affected_business_items: [{
      item_kind: 'business_outcome', item_id: 'OUT-review', display_name: '订单审批结果'
    }]
  }];
  return input;
}

test('AT17/AT27: materialization and publication recheck the critical gate before current authority', async () => {
  const input = unresolvedCriticalDelivery();
  assert.throws(() => materializeCaseDocumentDeliveryV4(input), /CRITICAL_SEMANTIC_GAPS_REMAIN/);

  const directory = await mkdtemp(path.join(os.tmpdir(), 'v43-critical-gate-'));
  try {
    await assert.rejects(
      publishCaseDocumentDeliveryV4(directory, input),
      /CRITICAL_SEMANTIC_GAPS_REMAIN/
    );
    await assert.rejects(readFile(path.join(directory, 'output/current.json')), /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
