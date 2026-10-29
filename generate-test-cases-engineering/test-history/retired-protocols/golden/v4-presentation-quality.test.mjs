import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  materializeCaseDocumentDeliveryV4, verifyCaseDocumentDeliveryV4
} from '../../src/canonical-delivery-v4.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';
import * as presentation from '../../src/case-document-presentation-v4.mjs';
import { candidateDeliveryInput } from '../helpers/v4-candidate-delivery-fixture.mjs';

/** @param {string} value */
const hash = value => createHash('sha256').update(value, 'utf8').digest('hex');
/** @param {string} value */
const byteDigest = value => `sha256:${hash(value)}`;

/** @param {string} directory @param {Record<string,any>} manifest @param {Record<string,string>} texts */
async function writeDelivery(directory, manifest, texts) {
  const entries = [
    ['bundle', 'bundle'], ['markdown', 'markdown'], ['execution_worksheet', 'worksheet'],
    ['html', 'html'], ['chat_table', 'table'], ['source_reading', 'source_reading']
  ];
  for (const [manifestKey, textKey] of entries) {
    const target = path.join(directory, manifest[manifestKey].path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, texts[textKey], 'utf8');
  }
  const current = path.join(directory, 'output/current.json');
  await mkdir(path.dirname(current), { recursive: true });
  await writeFile(current, `${canonicalStringify(manifest)}\n`, 'utf8');
}

/** @returns {any} */
function deliveredWithGap() {
  const input = candidateDeliveryInput();
  input.bundle.result_kind = 'delivered_with_gaps';
  input.bundle.coverage.semantic_gap_count = 1;
  input.bundle.semantic_root_groups = [{
    root_issue_id: 'ROOT-window', status: 'closed_for_delivery', title: '撤回时间范围待确认',
    business_object: '本用例创建的评价', question: '允许撤回的时间范围是什么？',
    why_needed: '该边界决定撤回场景的数据条件。', decision_impact: '影响撤回用例的适用记录。',
    unresolved_outcome: '当前用例按含待确认项交付。',
    affected_business_items: [{
      item_kind: 'case', item_id: 'CASE-flow', display_name: '新增并下线评价的完整路径'
    }]
  }];
  return input;
}

/** @param {'blocked_only'|'no_applicable_cases'} resultKind @returns {any} */
function emptyDelivery(resultKind) {
  const input = candidateDeliveryInput();
  input.bundle.result_kind = resultKind;
  input.bundle.cases = [];
  input.bundle.ordered_case_ids = [];
  input.bundle.coverage.primary.covered_formal_test_point_count = 0;
  if (resultKind === 'blocked_only') {
    input.bundle.coverage.semantic_gap_count = 1;
    input.bundle.semantic_root_groups = [{
      root_issue_id: 'ROOT-blocked', status: 'closed_for_delivery', title: '结果规则待确认',
      business_object: '评价', question: '操作后的业务状态是什么？',
      why_needed: '缺少主要验收结果。', decision_impact: '影响正式用例判定。',
      unresolved_outcome: '没有可交付 Case，仅交付未决报告。',
      affected_business_items: [{
        item_kind: 'formal_test_point', item_id: 'TP-flow', display_name: '评价操作后的业务状态'
      }]
    }];
  } else {
    input.bundle.coverage.primary.not_applicable_formal_test_point_count = 1;
    input.bundle.coverage.not_applicable_count = 1;
    input.bundle.not_applicable = [{
      not_applicable_record_id: 'NA-review', module_id: 'admin',
      subject: '评价下线能力', reason: '当前声明范围明确排除该能力。'
    }];
  }
  return input;
}

test('A19 Table carries complete conditions, ordered actions, and step-bound observations safely', () => {
  const input = candidateDeliveryInput();
  const candidate = input.bundle.cases[0];
  candidate.business_preconditions[0].description = '管理员已登录｜角色不变\n且页面可访问';
  candidate.data_conditions[0].description = '标题为 A|B，备注为 <img src=x onerror=alert(1)>';
  candidate.steps[0].action = '输入 A|B 后保存\n本用例对象';
  candidate.test_values = [{
    value_id: 'VAL-source', subject_ref: 'admin.review', field_path: '/source', value: 22,
    used_by_refs: ['DATA-new'], value_origin: { kind: 'requirement', claim_ids: ['CLM-save'] }
  }];
  candidate.baseline_spec = {
    baseline_id: 'BASE-review', kind: 'declared_reference', acquisition: 'capture_at_execution',
    reference: '当前线上同一评价',
    comparison_contract: {
      kind: 'selected_dimensions', dimensions: ['状态', '来源'], allowed_differences: ['更新时间']
    },
    claim_ids: ['CLM-save']
  };
  candidate.semantic_effects = [{
    effect_id: 'EFF-disable', kind: 'state_change', subject: '本用例评价',
    before: '已保存', after: '已下线', claim_ids: ['CLM-disable']
  }];

  const output = /** @type {any} */ (materializeCaseDocumentDeliveryV4(input));
  const rows = output.table_bytes.trimEnd().split('\n');

  assert.equal(rows.filter((/** @type {string} */ line) => /^\| \d+ \|/u.test(line)).length, 1,
    'one Case must occupy exactly one body row');
  assert.match(rows[2], /新增&lt;script&gt;alert\(1\)&lt;\/script&gt;并下线评价/u);
  assert.match(rows[2], /<br>前提 1：管理员已登录｜角色不变<br>且页面可访问/u);
  assert.match(rows[2], /<br>数据 1：标题为 A\\\|B，备注为 &lt;img src=x onerror=alert\(1\)&gt;/u);
  assert.match(rows[2], /<br>步骤 1：输入 A\\\|B 后保存<br>本用例对象/u);
  assert.match(rows[2], /<br>取值 1：\/source = 22（需求指定）/u);
  assert.match(rows[2], /<br>相对基线：当前线上同一评价；比较状态、来源；允许差异：更新时间/u);
  assert.match(rows[2], /步骤 1 后（界面）：同一评价显示为已保存/u);
  assert.match(rows[2], /步骤 2 后（界面）：同一评价最终显示为已下线/u);
  assert.match(rows[2], /结果变化：本用例评价：已保存 → 已下线/u);
  assert.doesNotMatch(rows[2], /<img\b|<script\b/iu);
  assert.match(output.html_bytes, /结构化测试取值/u);
  assert.match(output.html_bytes, /\/source = 22（需求指定）/u);
  assert.match(output.html_bytes, /相对基线/u);
  assert.match(output.html_bytes, /比较状态、来源；允许差异：更新时间/u);
  assert.match(output.html_bytes, /业务结果变化/u);
});

test('A19/A20 HTML explains role, gaps, exclusions, coverage, and step ownership without default internal IDs', () => {
  const output = /** @type {any} */ (materializeCaseDocumentDeliveryV4(deliveredWithGap()));

  assert.match(output.html_bytes, /人工功能测试用例（含待确认项）/u);
  assert.match(output.html_bytes, /主验收/u);
  assert.match(output.html_bytes, /待确认事项与交付限制/u);
  assert.match(output.html_bytes, /新增并下线评价的完整路径/u);
  assert.match(output.html_bytes, /排除与探索/u);
  assert.match(output.html_bytes, /已审阅 formal test-point 覆盖/u);
  assert.match(output.html_bytes, /步骤 1 后（界面）/u);
  assert.match(output.html_bytes, /这是采集技术记录，不是业务事实或业务证据/u);
  assert.doesNotMatch(output.html_bytes, /CASE-flow|TP-flow|FLOW-review|ROOT-window|CLM-/u);
});

test('A20 blocked and no-applicable deliveries render distinct reports without placeholder Cases', () => {
  const blocked = /** @type {any} */ (materializeCaseDocumentDeliveryV4(emptyDelivery('blocked_only')));
  const notApplicable = /** @type {any} */ (materializeCaseDocumentDeliveryV4(emptyDelivery('no_applicable_cases')));

  assert.match(blocked.html_bytes, /未决业务问题报告/u);
  assert.match(blocked.html_bytes, /没有可交付的正式 Case/u);
  assert.doesNotMatch(blocked.html_bytes, /当前没有适用的正式 Case/u);
  assert.match(notApplicable.html_bytes, /无适用测试用例说明/u);
  assert.match(notApplicable.html_bytes, /评价下线能力/u);
  assert.doesNotMatch(notApplicable.html_bytes, /未决业务问题报告/u);
});

test('A21 frozen 4.2 presentation remains byte-exact and template families never mix', () => {
  assert.equal(typeof presentation.renderLegacyCaseTableV42, 'function');
  assert.equal(typeof presentation.renderLegacyBusinessHtmlV42, 'function');
  assert.equal(typeof presentation.matchCasePresentationFamilyV42, 'function');

  const input = candidateDeliveryInput();
  const current = /** @type {any} */ (materializeCaseDocumentDeliveryV4(input));
  const canonicalSourceReading = JSON.parse(current.source_reading_bytes);
  const view = presentation.buildCaseDocumentPresentationV4(
    JSON.parse(current.bundle_bytes), input.render_options
  );
  const legacyTable = presentation.renderLegacyCaseTableV42(view);
  const legacyHtml = presentation.renderLegacyBusinessHtmlV42(view, canonicalSourceReading);

  assert.equal(hash(legacyTable), '17b53b5a40126de8c251a46d936699611e53bbfb912b92e134200382b19a8c42');
  assert.equal(hash(legacyHtml), '6d591cac1afa5ff9c15dec50917c8bc5b67f0ef03ef8b848035a3c228bc07da4');
  assert.equal(presentation.matchCasePresentationFamilyV42(view, canonicalSourceReading, {
    html: legacyHtml, table: legacyTable
  }), 'legacy-4.2');

  assert.equal(presentation.matchCasePresentationFamilyV42(view, canonicalSourceReading, {
    html: current.html_bytes, table: current.table_bytes
  }), 'current-4.2');
  assert.throws(() => presentation.matchCasePresentationFamilyV42(view, canonicalSourceReading, {
    html: current.html_bytes, table: legacyTable
  }), /CASE_PRESENTATION_FAMILY_INVALID/u);
});

test('A21 canonical read accepts a whole historical 4.2 family and rejects a digest-valid mixed family', async () => {
  const input = candidateDeliveryInput();
  const current = /** @type {any} */ (materializeCaseDocumentDeliveryV4(input));
  const canonicalSourceReading = JSON.parse(current.source_reading_bytes);
  const view = presentation.buildCaseDocumentPresentationV4(
    JSON.parse(current.bundle_bytes), input.render_options
  );
  const legacyHtml = presentation.renderLegacyBusinessHtmlV42(view, canonicalSourceReading);
  const legacyTable = presentation.renderLegacyCaseTableV42(view);
  const legacyManifest = structuredClone(current.manifest);
  legacyManifest.html.digest = byteDigest(legacyHtml);
  legacyManifest.chat_table.digest = byteDigest(legacyTable);
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v42-legacy-family-'));
  const texts = {
    bundle: current.bundle_bytes, markdown: current.markdown_bytes,
    worksheet: current.worksheet_bytes, html: legacyHtml, table: legacyTable,
    source_reading: current.source_reading_bytes
  };
  await writeDelivery(directory, legacyManifest, texts);
  const verified = await verifyCaseDocumentDeliveryV4(directory);
  assert.equal(verified.artifacts.html, legacyHtml);
  assert.equal(verified.artifacts.table, legacyTable);

  const mixedManifest = structuredClone(legacyManifest);
  mixedManifest.html.digest = byteDigest(current.html_bytes);
  await writeDelivery(directory, mixedManifest, { ...texts, html: current.html_bytes });
  await assert.rejects(
    () => verifyCaseDocumentDeliveryV4(directory), /CANONICAL_ARTIFACT_INVALID/u
  );
});

test('A19/A21 audit mode remains canonical for current and historical 4.2 families', async () => {
  const input = candidateDeliveryInput();
  input.render_options.include_audit_appendix = true;
  const current = /** @type {any} */ (materializeCaseDocumentDeliveryV4(input));
  const sourceReading = JSON.parse(current.source_reading_bytes);
  const view = presentation.buildCaseDocumentPresentationV4(
    JSON.parse(current.bundle_bytes), input.render_options
  );

  assert.match(current.html_bytes, /<summary>审计标识<\/summary>/u);
  assert.match(current.html_bytes, /CASE-flow/u);
  assert.match(current.html_bytes, /TP-flow/u);
  assert.match(current.html_bytes, /FLOW-review/u);
  assert.equal(presentation.matchCasePresentationFamilyV42(view, sourceReading, {
    html: current.html_bytes, table: current.table_bytes
  }), 'current-4.2');

  const currentDirectory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v42-current-audit-'));
  await writeDelivery(currentDirectory, current.manifest, {
    bundle: current.bundle_bytes, markdown: current.markdown_bytes,
    worksheet: current.worksheet_bytes, html: current.html_bytes, table: current.table_bytes,
    source_reading: current.source_reading_bytes
  });
  const currentVerified = await verifyCaseDocumentDeliveryV4(currentDirectory);
  assert.match(currentVerified.artifacts.html, /<summary>审计标识<\/summary>/u);

  const legacyHtml = presentation.renderLegacyBusinessHtmlV42(view, sourceReading);
  const legacyTable = presentation.renderLegacyCaseTableV42(view);
  const legacyManifest = structuredClone(current.manifest);
  legacyManifest.html.digest = byteDigest(legacyHtml);
  legacyManifest.chat_table.digest = byteDigest(legacyTable);
  const legacyDirectory = await mkdtemp(path.join(os.tmpdir(), 'gtc-v42-legacy-audit-'));
  await writeDelivery(legacyDirectory, legacyManifest, {
    bundle: current.bundle_bytes, markdown: current.markdown_bytes,
    worksheet: current.worksheet_bytes, html: legacyHtml, table: legacyTable,
    source_reading: current.source_reading_bytes
  });
  const legacyVerified = await verifyCaseDocumentDeliveryV4(legacyDirectory);
  assert.match(legacyVerified.artifacts.html, /CASE-flow/u);
  assert.equal(presentation.matchCasePresentationFamilyV42(view, sourceReading, {
    html: legacyHtml, table: legacyTable
  }), 'legacy-4.2');
});
