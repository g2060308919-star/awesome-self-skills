import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
/** @param {string} file */
const read = file => readFile(path.join(root, 'skill/generate-test-cases', file), 'utf8');

test('P1 policy requires closed body/table/image/comment/reply collection and technical/business separation', async () => {
  const skill = await read('SKILL.md');
  const evidence = await read('references/evidence-policy.md');
  assert.match(skill, /`stageV4PrdCollectionObservation`/u);
  assert.match(evidence, /正文.*表格.*图片.*评论.*回复/su);
  assert.match(evidence, /分页.*(?:结束|末页|terminal)/isu);
  assert.match(evidence, /父子|上下文/u);
  assert.match(evidence, /采集技术记录.*(?:不是|不得).*业务(?:事实|证据|权威)/su);
  assert.match(evidence, /离线|provided_materials/u);
});

test('P2/P4 policies drive independent-result Cases plus same-object closed paths without replacing single points', async () => {
  const views = await read('references/behavior-views.md');
  const cases = await read('references/case-writing-policy.md');
  assert.match(views, /对象.*条件.*(?:触发|动作).*独立(?:业务)?结果/su);
  assert.match(cases, /不同(?:枚举|权限|分支).*(?:拆分|各自).*(?:输入|预期)/su);
  assert.match(cases, /完整流程.*同一(?:业务)?对象.*起点.*终点/su);
  assert.match(cases, /单点.*(?:保留|不能取代|不得取代)/su);
  assert.match(cases, /普通(?:多步)? Case/u);
  assert.match(cases, /不(?:新增|引入)[^。\n]*(?:Case 类型|流程引擎|状态机)/u);
});

test('P3/P5 policy keeps two clarification phases and makes full Table plus HTML the candidate delivery contract', async () => {
  const skill = await read('SKILL.md');
  const clarification = await read('references/clarification-policy.md');
  assert.match(clarification, /对象、条件、角色、状态、顺序、输入范围、文案或结果/u);
  assert.match(clarification, /前置.*后置/su);
  assert.match(skill, /`test-cases\.html`.*(?:主要阅读|primary)/isu);
  assert.match(skill, /序号 \| 模块 \| 用例\/流程名称 \| 预期结果 \| 优先级 \| 依据状态/u);
  assert.match(skill, /`ordered_case_ids`.*(?:全量|全部).*Table/isu);
  assert.match(skill, /JSON.*HTML.*CSV.*Markdown.*(?:同一|same).*(?:规范|canonical)/isu);
});
