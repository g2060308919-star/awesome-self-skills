import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { projectGCaseToRunnerCase } from '../scripts/lib/g-case-document-handoff.mjs';
import { initializeRun } from '../scripts/run-artifacts.mjs';

function sourceCase(id, action, expected, claimId, extras = {}) {
  return {
    case_id: id, title: id, module_id: 'module', semantic_status: 'Grounded',
    business_preconditions: [], data_conditions: [], test_values: [],
    steps: [{ step_id: `S-${id}`, action }],
    oracles: [{ oracle_id: `O-${id}`, observe_after_step_id: `S-${id}`,
      surface: 'ui', expected, claim_ids: [claimId] }], ...extras
  };
}

test('five G-shaped semantic cases retain values, constraints and exact criteria in R snapshot', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'g-projection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = [
    sourceCase('fixed', '上传指定文件 A', '系统接受指定文件 A', 'CLM-fixed', {
      test_values: [{ value_id: 'V-fixed', value: 'A', subject_ref: 'file',
        field_path: '/name', used_by_refs: ['S-fixed'],
        value_origin: { kind: 'requirement', claim_ids: ['CLM-fixed'] } }]
    }),
    sourceCase('example', '按名称精确查询', '只显示精确匹配项，不显示前缀相似项', 'CLM-example', {
      data_conditions: [{ condition_id: 'D-example',
        description: '可换样本实体；保持精确查询和前缀干扰关系' }],
      test_values: [{ value_id: 'V-example', value: '示例名称', subject_ref: 'coupon',
        field_path: '/name', used_by_refs: ['S-example'],
        value_origin: { kind: 'example', claim_ids: ['CLM-example'], replaceable: true } }]
    }),
    sourceCase('literal', '上传超限文件', '逐字显示：文件超过 5MB', 'CLM-literal'),
    sourceCase('meaning', '上传超限文件', '提示必须说明 5MB 上限，措辞可不同', 'CLM-meaning'),
    sourceCase('readonly', '查询券并观察系统回填字段', '有效期来自所查券且不可编辑', 'CLM-readonly', {
      data_conditions: [{ condition_id: 'D-readonly', description: '准备有效期符合要求的券样本' }]
    })
  ];
  const cases = source.map(item => projectGCaseToRunnerCase(item, '示例模块'));
  const input = { schema_version: '2.0',
    suite: { name: '非敏感五类交接夹具', target_urls: ['https://staging.example.test'] }, cases };
  const run = await initializeRun({ workspaceRoot: root, casesInput: input,
    workflowProfile: 'permission-batches-html-v3' });
  const frozen = JSON.parse(await readFile(path.join(run.runRoot, 'test-cases.json'), 'utf8'));
  assert.deepEqual(frozen, input);
  assert.deepEqual(frozen.cases.map(item => item.case_id), source.map(item => item.case_id));
  assert.deepEqual(frozen.cases.map(item => item.steps[0].expected[0].text),
    source.map(item => item.oracles[0].expected));
  assert.equal(frozen.cases[0].test_values[0].value_origin.kind, 'requirement');
  assert.equal(frozen.cases[1].test_values[0].value_origin.replaceable, true);
  assert.match(frozen.cases[1].preconditions[0], /前缀干扰关系/u);
  assert.match(frozen.cases[4].preconditions[0], /有效期/u);

  assert.throws(() => projectGCaseToRunnerCase(sourceCase('bad', '先操作', '观察', 'CLM', {
    steps: [{ step_id: 'S-bad', action: '先操作' }, { step_id: 'S-next', action: '再操作' }]
  }), '示例模块'), /没有可交接的 Oracle/u);
});
