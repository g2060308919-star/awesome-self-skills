import assert from 'node:assert/strict';
import test from 'node:test';

import { materializeCaseDocumentDeliveryV4 } from '../../src/canonical-delivery-v4.mjs';
import { candidateDeliveryInput as candidateInput } from '../helpers/v4-candidate-delivery-fixture.mjs';

test('candidate 4.2 materializes HTML, full CommonMark Table, source summary, Markdown and CSV from one canonical JSON', () => {
  const result = /** @type {any} */ (materializeCaseDocumentDeliveryV4(candidateInput()));

  assert.equal(result.manifest.schema_version, '4.2.0');
  assert.equal(result.manifest.compiler_version, '0.7.0');
  assert.equal(result.manifest.primary_readable, 'html');
  assert.equal(result.manifest.html.path, 'output/r002/test-cases.html');
  assert.equal(result.manifest.chat_table.path, 'output/r002/case-table.txt');
  assert.equal(result.manifest.source_reading.path, 'output/r002/source-reading.json');
  assert.equal(result.manifest.source_reading.format, 'json');
  assert.match(result.table_bytes, /^\| 序号 \| 模块 \| 用例\/流程名称 \| 预期结果 \| 优先级 \| 依据状态 \|/u);
  assert.match(result.table_bytes, /步骤 1 后（界面）：同一评价显示为已保存<br>步骤 2 后（界面）：同一评价最终显示为已下线/u);
  assert.equal((result.table_bytes.match(/\| 1 \|/gu) ?? []).length, 1);
  assert.match(result.html_bytes, /<!doctype html>/iu);
  assert.match(result.html_bytes, /同一评价显示为已保存/u);
  assert.match(result.html_bytes, /同一评价最终显示为已下线/u);
  assert.doesNotMatch(result.html_bytes, /<script>alert\(1\)<\/script>/u);
  assert.match(result.html_bytes, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/u);
  assert.doesNotMatch(result.html_bytes, /https?:\/\/|<script\b|<link\b|@import/iu);
  assert.deepEqual(JSON.parse(result.source_reading_bytes), candidateInput().source_reading);
});

test('candidate presentation order comes only from ordered_case_ids and source JSON', () => {
  const input = candidateInput();
  const second = structuredClone(input.bundle.cases[0]);
  second.case_id = 'CASE-single';
  second.title = '单点检查';
  second.ordering.business_flow_ref = null;
  second.primary_test_point_id = 'TP-single';
  second.supporting_observation_ids = [];
  second.steps = [{ step_id: 'STEP-check', action: '查看评价状态' }];
  second.oracles = [{ oracle_id: 'ORACLE-check', observe_after_step_id: 'STEP-check', surface: 'ui', expected: '状态显示为已保存', claim_ids: ['CLM-save'] }];
  input.bundle.cases.push(second);
  input.bundle.ordered_case_ids = ['CASE-single', 'CASE-flow'];
  input.bundle.coverage.primary.reviewed_formal_test_point_count = 2;
  input.bundle.coverage.primary.covered_formal_test_point_count = 2;

  const result = /** @type {any} */ (materializeCaseDocumentDeliveryV4(input));
  assert.ok(result.table_bytes.indexOf('单点检查') < result.table_bytes.indexOf('新增&lt;script'));
  assert.ok(result.html_bytes.indexOf('单点检查') < result.html_bytes.indexOf('新增&lt;script'));
});
