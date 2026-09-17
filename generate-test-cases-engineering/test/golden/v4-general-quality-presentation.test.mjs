import assert from 'node:assert/strict';
import test from 'node:test';

import {
  materializeCaseDocumentDeliveryV4, validateCaseDocumentArtifactSetV4
} from '../../src/canonical-delivery-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import { compileCaseDocumentRevisionV4 } from '../../src/v4-pipeline.mjs';
import { candidateDeliveryInput } from '../helpers/v4-candidate-delivery-fixture.mjs';
import { v4GeneralQualityFixture } from '../helpers/v4-general-quality-fixture.mjs';

const REVIEW_DIGEST = `sha256:${'9'.repeat(64)}`;

function summaryFixture() {
  const input = candidateDeliveryInput();
  input.bundle.schema_version = '4.3.0';
  input.bundle.compiler_version = '0.8.0';
  input.bundle.design_assurance_summary = {
    status: 'complete', plan_revision: 3, batch_count: 2, rule_group_count: 4,
    candidate_responsibility_count: 5,
    candidate_disposition_counts: {
      retained: 2, representative_value: 1, equivalent_merge: 1,
      evidence_exclusion: 0, semantic_gap: 0, exploratory: 1
    }
  };
  input.bundle.independent_review_summary = {
    status: 'completed', protocol_version: '1.0.0',
    review_mode: 'independent_source_first', reviewer_identity_class: 'independent_context',
    source_first_target_count: 3,
    target_assessment_counts: { verified: 2, semantic_gap: 1, evidence_excluded: 0 },
    finding_counts: { confirmed: 1, rejected: 1 },
    review_target_digest: REVIEW_DIGEST
  };
  input.bundle.cases[0].data_conditions[0].description = '状态枚举覆盖启用、停用；角色为无下线权限管理员';
  input.bundle.cases[0].oracles[1].expected = '无权限角色收到拒绝，且同一评价仍为已保存';
  input.bundle.semantic_root_groups = [
    {
      root_issue_id: 'ROOT-final', root_version_digest: `sha256:${'a'.repeat(64)}`,
      status: 'resolved_final', title: '最终规则已确认', business_object: '评价',
      question: '是否允许下线？', why_needed: '确定权限结果。', decision_impact: '改变下线结果。',
      unresolved_outcome: '已由最终规则解决。',
      acceptance_impact: {
        classification: 'noncritical', criteria: ['does_not_change_required_acceptance'],
        rationale: '该记录仅验证最终性保真。'
      },
      critical_resolution_basis: null,
      affected_business_items: [{
        item_kind: 'case', item_id: 'CASE-flow', display_name: '评价下线权限'
      }]
    },
    {
      root_issue_id: 'ROOT-temporary', root_version_digest: `sha256:${'b'.repeat(64)}`,
      status: 'resolved_temporary', title: '临时代表值', business_object: '评价标题',
      question: '本轮使用哪个合法标题？', why_needed: '准备本轮数据。',
      decision_impact: '只改变等价代表值。', unresolved_outcome: '等待后续替换代表值。',
      acceptance_impact: {
        classification: 'noncritical', criteria: ['does_not_change_required_acceptance'],
        rationale: '代表值不改变必要验收。'
      },
      critical_resolution_basis: null,
      affected_business_items: [{
        item_kind: 'case', item_id: 'CASE-flow', display_name: '评价标题代表值'
      }]
    }
  ];
  return input;
}

test('AT20/AT28: 4.3 canonical JSON derives closed design/review summaries and retains root finality', () => {
  const fixture = v4GeneralQualityFixture();
  const compiled = compileCaseDocumentRevisionV4(fixture.artifacts, fixture.system);
  assert.equal(compiled.status, 'compiled', JSON.stringify(compiled));
  assert.deepEqual(compiled.bundle.design_assurance_summary, {
    status: 'complete', plan_revision: 1, batch_count: 1, rule_group_count: 1,
    candidate_responsibility_count: 1,
    candidate_disposition_counts: {
      retained: 1, representative_value: 0, equivalent_merge: 0,
      evidence_exclusion: 0, semantic_gap: 0, exploratory: 0
    }
  });
  assert.deepEqual(compiled.bundle.independent_review_summary, {
    status: 'completed', protocol_version: '1.0.0',
    review_mode: 'independent_source_first', reviewer_identity_class: 'independent_context',
    source_first_target_count: 1,
    target_assessment_counts: { verified: 1, semantic_gap: 0, evidence_excluded: 0 },
    finding_counts: { confirmed: 0, rejected: 0 },
    review_target_digest: fixture.artifacts.case_drafts.independent_review.review_target_digest
  });

  const rendered = /** @type {any} */ (materializeCaseDocumentDeliveryV4(summaryFixture()));
  const canonical = JSON.parse(rendered.bundle_bytes);
  assert.deepEqual(canonical.semantic_root_groups.map((/** @type {any} */ root) => root.status), [
    'resolved_final', 'resolved_temporary'
  ]);
  assert.equal(canonical.independent_review_summary.review_target_digest, REVIEW_DIGEST);
  assert.equal(rendered.manifest.review_target_digest, REVIEW_DIGEST);
});

test('AT30: every 4.3 readable projection preserves canonical order, count, steps, enums, permissions and result meaning', () => {
  const output = /** @type {any} */ (materializeCaseDocumentDeliveryV4(summaryFixture()));
  const bundle = JSON.parse(output.bundle_bytes);
  assert.equal(output.manifest.primary_readable, 'html');
  assert.equal(output.manifest.case_count, bundle.ordered_case_ids.length);
  assert.match(output.html_bytes, /共 1 条/u);
  assert.match(output.table_bytes, /状态枚举覆盖启用、停用/u);
  assert.match(output.markdown_bytes, /状态枚举覆盖启用、停用/u);
  assert.match(output.worksheet_bytes, /状态枚举覆盖启用、停用/u);
  for (const artifact of [output.html_bytes, output.table_bytes, output.markdown_bytes, output.worksheet_bytes]) {
    assert.match(artifact, /新增[^\n]*alert\(1\)[^\n]*并下线评价/u);
    assert.match(artifact, /新建评价并保存/u);
    assert.match(artifact, /无权限角色收到拒绝，且同一评价仍为已保存/u);
  }
  for (const artifact of [output.html_bytes, output.table_bytes, output.markdown_bytes]) {
    assert.match(artifact, /设计保障/u);
    assert.match(artifact, /独立审查/u);
  }
  assert.match(output.html_bytes, /人工功能测试用例/u);
  assert.match(output.table_bytes, /结果状态：人工功能测试用例/u);
  assert.match(output.markdown_bytes, /^# 人工功能测试用例$/mu);
});

test('AT28: manifest cannot claim a review digest different from canonical JSON', () => {
  const input = summaryFixture();
  const output = /** @type {any} */ (materializeCaseDocumentDeliveryV4(input));
  const manifest = structuredClone(output.manifest);
  manifest.review_target_digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateCaseDocumentArtifactSetV4(input, {
    bundle: output.bundle_bytes, markdown: output.markdown_bytes,
    worksheet: output.worksheet_bytes, html: output.html_bytes,
    table: output.table_bytes, source_reading: output.source_reading_bytes,
    manifest: `${canonicalStringify(manifest)}\n`
  }), /CANONICAL_MANIFEST_INVALID/u);
});
