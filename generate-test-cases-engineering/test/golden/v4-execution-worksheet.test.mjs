import assert from 'node:assert/strict';
import test from 'node:test';

const output = /** @type {any} */ (await import('../../src/canonical-output-v4.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {}; throw error;
}));

const surfaces = ['ui', 'request', 'response', 'persistence', 'event', 'callback', 'compensation', 'side_effect', 'external_observation'];

/** @returns {any} */
function fixture() {
  return {
    schema_version: '4.0.0', compiler_version: '0.5.0', delivery_intent: 'case_document', source_revision: 4,
    scope_manifest: { modules: [
      { module_id: 'admin', name: '评价“中台”,管理', role: 'primary' },
      { module_id: 'content', name: '内容服务', role: 'upstream' }
    ] },
    cases: [{
      case_id: 'CASE-a', acceptance_role: 'primary_acceptance', module_id: 'admin', priority: 'P0', title: '来源展示',
      ordering: { business_flow_ref: null, page_action_ref: null, depends_on_case_ids: [] }, semantic_status: 'Grounded',
      fact_ids: ['FACT-a'], primary_test_point_id: 'TP-a', supporting_observation_ids: [],
      business_preconditions: [
        { precondition_id: 'PRE-1', description: '有查看权限' },
        { precondition_id: 'PRE-2', description: '账号属于“运营,组”' }
      ],
      data_conditions: [{ condition_id: 'COND-1', description: '存在中文\n多行数据' }],
      steps: [{ step_id: 'STEP-1', action: '打开列表' }, { step_id: 'STEP-2', action: '定位评价' }],
      oracles: surfaces.map((surface, index) => ({ oracle_id: `ORACLE-${index}`, observe_after_step_id: index % 2 ? 'STEP-1' : 'STEP-2',
        surface, expected: index === 0 ? '显示“打车,去过”' : `${surface} 可观察`, claim_ids: ['CLM-a'] })).reverse()
    }, {
      case_id: 'CASE-b', acceptance_role: 'dependency_contract', module_id: 'content', priority: 'P2', title: '空条件',
      ordering: { business_flow_ref: null, page_action_ref: null, depends_on_case_ids: ['CASE-a'] }, semantic_status: 'Conditional',
      fact_ids: ['FACT-b'], primary_test_point_id: 'TP-b', supporting_observation_ids: [],
      business_preconditions: [], data_conditions: [], steps: [{ step_id: 'STEP-b', action: '读取内容' }],
      oracles: [{ oracle_id: 'ORACLE-b', observe_after_step_id: 'STEP-b', surface: 'response', expected: '返回内容', claim_ids: ['CLM-b'] }]
    }]
  };
}

test('[P-09][BR-14] v4 worksheet has the fixed columns, canonical Case order and empty execution record fields', () => {
  assert.equal(typeof output.renderExecutionWorksheetCsvV4, 'function');
  const csv = output.renderExecutionWorksheetCsvV4(fixture(), ['CASE-a', 'CASE-b']);
  assert.equal(csv.charCodeAt(0) === 0xfeff, false);
  assert.ok(csv.endsWith('\n'));
  const lines = csv.split('\n');
  assert.equal(lines[0], 'case_id,acceptance_role,module,priority,title,preconditions,data_conditions,steps,expected_results,execution_status,defect_ids,test_data_used,owner,notes');
  assert.match(csv, /CASE-a,primary_acceptance,"评价“中台”,管理",P0,来源展示/);
  assert.match(csv, /not_run,,,,\nCASE-b,dependency_contract,内容服务,P2,空条件,,,1\. 读取内容/);
  assert.match(csv, /"1\. 有查看权限\n2\. 账号属于“运营,组”"/);
  assert.match(csv, /"1\. 存在中文\n多行数据"/);
  assert.match(csv, /"1\. 打开列表\n2\. 定位评价"/);
});

test('v4 worksheet aligns every Oracle to its step and uses the frozen surface rank deterministically', () => {
  const first = fixture();
  const baseline = output.renderExecutionWorksheetCsvV4(first, ['CASE-a', 'CASE-b']);
  first.cases[0].oracles.reverse();
  assert.equal(output.renderExecutionWorksheetCsvV4(first, ['CASE-a', 'CASE-b']), baseline);
  const expected = surfaces.map((surface, index) => ({ surface, index }))
    .filter(item => item.index % 2 === 1).map(item => `步骤1：${item.surface} 可观察`);
  let cursor = -1;
  for (const value of expected) {
    const next = baseline.indexOf(value);
    assert.ok(next > cursor, value); cursor = next;
  }
  const broken = fixture(); broken.cases[0].oracles[0].observe_after_step_id = 'STEP-missing';
  assert.throws(() => output.renderExecutionWorksheetCsvV4(broken, ['CASE-a', 'CASE-b']), /ORACLE_STEP/);
});

test('v4 worksheet rejects missing, duplicate or noncanonical Case membership', () => {
  const value = fixture();
  assert.throws(() => output.renderExecutionWorksheetCsvV4(value, ['CASE-a']), /CASE_ORDER/);
  assert.throws(() => output.renderExecutionWorksheetCsvV4(value, ['CASE-a', 'CASE-a']), /CASE_ORDER/);
  assert.throws(() => output.renderExecutionWorksheetCsvV4(value, ['CASE-a', 'CASE-missing']), /CASE_ORDER/);
  value.scope_manifest.modules.pop();
  assert.throws(() => output.renderExecutionWorksheetCsvV4(value, ['CASE-a', 'CASE-b']), /MODULE/);
});
