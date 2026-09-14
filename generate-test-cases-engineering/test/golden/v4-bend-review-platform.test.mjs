import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BEND_REVIEW_COMPLETED_AT,
  BEND_REVIEW_RUN_ID,
  compileBendReviewGolden,
  materializeBendReviewGolden
} from '../helpers/v4-bend-review-golden.mjs';

const expectedCaseIds = [
  'CASE-08873383125e5c71f752d00ea63a443584b77fa174a395b1f48f68b59ecab5d1',
  'CASE-69442bc632a121c556ab3cbf39eed5975b770b2d264c36adff3fe3af3d9ab23e',
  'CASE-268afd99779e32cc05aee48235f3c7cf7f01eafe4501a46a41f2d3f984288d86',
  'CASE-b37999e4871aa298b5e6f361e7f17c8bc0fac1e8b771ab3af713de89aa922788',
  'CASE-15ab690cf4675e5cceda21dffdb5ae6ba18863e0b7e282aa315e9938ee5ab56d',
  'CASE-292c847222bd93154a463e34a68e496dc09c14b8cc972c69c9a1f9e69bfc8203',
  'CASE-8a432d50f7e4d43c4ae519b61a8dd32de520ba7182b80b185fbb5a4c1d53df1c'
];

const expectedTitles = [
  '其余筛选项和列保持当前线上一致',
  '按业务线筛选只展示所选评价',
  '推荐程度 0 显示不推荐',
  '推荐程度 1 显示常规',
  '推荐程度 500 显示推荐',
  '来源 22 显示打车去过',
  '来源 23 显示普通用户'
];

test('[P-09][P-11][BR-14][BR-15][BR-19] v4 B-end golden binds one exact seven-Case JSON, Markdown and worksheet result', async () => {
  const { compilation, delivery } = await materializeBendReviewGolden();
  assert.equal(compilation.status, 'compiled');
  assert.equal(compilation.result_kind, 'delivered_cases');
  assert.deepEqual(compilation.bundle.ordered_case_ids, expectedCaseIds);
  assert.deepEqual(compilation.bundle.cases.map((/** @type {any} */ item) => item.title), expectedTitles);
  assert.deepEqual(compilation.bundle.cases.map((/** @type {any} */ item) => item.semantic_status),
    Array(7).fill('Grounded'));
  assert.deepEqual(compilation.bundle.coverage, {
    primary: {
      reviewed_formal_test_point_count: 7,
      covered_formal_test_point_count: 7,
      not_applicable_formal_test_point_count: 0
    },
    boundary: {
      reviewed_formal_test_point_count: 0,
      covered_formal_test_point_count: 0,
      not_applicable_formal_test_point_count: 0
    },
    semantic_gap_count: 0,
    exploratory_count: 9,
    not_applicable_count: 0
  });
  assert.deepEqual(compilation.bundle.scope_manifest.modules.map((/** @type {any} */ module) => [
    module.module_id, module.role
  ]), [
    ['city-guide-backend', 'upstream'],
    ['consumer-app', 'upstream'],
    ['content-safety', 'upstream'],
    ['review-admin', 'primary'],
    ['review-content-service', 'upstream']
  ]);

  assert.deepEqual(delivery.manifest, {
    run_id: BEND_REVIEW_RUN_ID,
    revision: 0,
    schema_version: '4.0.0',
    compiler_version: '0.5.0',
    delivery_intent: 'case_document',
    authority: 'canonical',
    result_kind: 'delivered_cases',
    bundle: {
      path: 'output/r000/test-bundle.json',
      digest: 'sha256:8f9ade13b977674f27babf0193f018e6dd96e627abbbadd3f76d1c283b4f43ef'
    },
    markdown: {
      path: 'output/r000/test-cases.md',
      digest: 'sha256:e9c9dd7de0c2fa738149a91257870e8668bf6cda180217e234084d53232a68f1'
    },
    execution_worksheet: {
      path: 'output/r000/execution-worksheet.csv',
      digest: 'sha256:f94735f1cf59b3ed6d9cfdaac24e78d23be7679f3ef08777efbbfb0b56268904',
      format: 'csv'
    },
    render_options: { include_audit_appendix: false },
    case_count: 7,
    blocked_root_count: 0,
    closed_for_delivery_root_count: 0,
    not_applicable_count: 0,
    exploratory_count: 9,
    completed_at: BEND_REVIEW_COMPLETED_AT
  });

  const bundle = JSON.parse(delivery.bundle_bytes);
  assert.deepEqual(bundle.ordered_case_ids, expectedCaseIds);
  const markdownTitles = expectedTitles.filter(title => delivery.markdown_bytes.includes(title));
  assert.deepEqual(markdownTitles, expectedTitles);
  assert.doesNotMatch(delivery.markdown_bytes, /(?:ROOT|FACT|CLM|OBL|TP|CASE|EXP|NA)-[A-Za-z0-9]/u);
  assert.deepEqual(
    [...delivery.worksheet_bytes.matchAll(/^(CASE-[^,]+)/gmu)].map(match => match[1]),
    expectedCaseIds
  );
  assert.equal(delivery.bundle_bytes.endsWith('\n'), true);
  assert.equal(delivery.markdown_bytes.endsWith('\n'), true);
  assert.equal(delivery.worksheet_bytes.endsWith('\n'), true);
});

test('[P-10][BR-12][BR-15] v4 B-end golden fails closed when applicable outcomes lose their Cases', async () => {
  const { compilation } = await compileBendReviewGolden({ retain_case_count: 1 });
  assert.equal(compilation.status, 'fatal');
  assert.equal(compilation.result_kind, 'quality_failure');
  assert.equal(compilation.reason_code, 'FORMAL_TEST_POINT_UNCOVERED');
  assert.equal(compilation.diagnostics.length, 6);
  assert.equal(compilation.diagnostics.every((/** @type {any} */ item) =>
    item.category === 'quality_failure' && item.code === 'FORMAL_TEST_POINT_UNCOVERED'), true);
  assert.equal(Object.hasOwn(compilation, 'bundle'), false);
});
