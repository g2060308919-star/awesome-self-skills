import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skill = path.join(root, 'skill/generate-test-cases');
/** @param {string} name */
const text = (name) => readFile(path.join(skill, name), 'utf8');

test('Skill adapter requires the execution policy before decisions, confirmation, or post-ready change', async () => {
  const content = await text('SKILL.md');
  assert.match(content, /references\/execution-closure-policy\.md/u);
  assert.match(content, /before (?:writing|handling).*(?:execution|confirmation|post-ready)/iu);
  for (const purpose of ['semantic_clarification', 'execution_closure', 'final_confirmation']) {
    assert.match(content, new RegExp(purpose, 'u'));
  }
  assert.match(content, /PIPELINE_NO_PROGRESS/u);
});

test('Skill and UI metadata promise a confirmed plan but never automatic E2E execution', async () => {
  const [content, metadata] = await Promise.all([text('SKILL.md'), text('agents/openai.yaml')]);
  assert.match(content, /runner_case_ids/u);
  assert.match(content, /does not automatically|不会自动/u);
  assert.match(metadata, /确认.*执行清单|confirmed execution plan/iu);
  assert.match(metadata, /不(?:会|自动).*执行|does not.*execute/iu);
  assert.doesNotMatch(metadata, /自动启动.*(?:E2E|测试)/iu);
});

test('progressive references keep truth, execution disposition, and Case atomicity separate', async () => {
  const [closure, evidence, clarification, cases] = await Promise.all([
    text('references/execution-closure-policy.md'), text('references/evidence-policy.md'),
    text('references/clarification-policy.md'), text('references/case-writing-policy.md')
  ]);
  assert.match(closure, /Grounded.*Execute/isu);
  assert.match(closure, /Conditional.*Blocked.*NotApplicable.*Exploratory.*(?:cannot|不得).*Execute/isu);
  assert.match(closure, /post-ready-preview-request\.json/u);
  assert.match(closure, /preview_epoch/u);
  assert.match(evidence, /execution decision|执行决定/iu);
  assert.match(evidence, /(?:not evidence|不是.*证据)/iu);
  assert.match(clarification, /pending/iu);
  assert.match(clarification, /request_delivery.*execution closure/isu);
  assert.match(cases, /atomic execution unit|原子执行单位/iu);
  assert.match(cases, /partial.*(?:step|步骤)|部分步骤/iu);
});
