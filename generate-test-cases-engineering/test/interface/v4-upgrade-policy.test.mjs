import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const skillRoot = new URL('../../skill/generate-test-cases/', import.meta.url);
/** @param {string} relative */
const read = (relative) => readFile(new URL(relative, skillRoot), 'utf8');

test('T02 AT01-05 and AT34 policies preserve atomic branches, exact wording, identity, and risk truth', async () => {
  const [skill, clarification, evidence] = await Promise.all([
    read('SKILL.md'), read('references/clarification-policy.md'), read('references/evidence-policy.md')
  ]);
  assert.match(`${skill}\n${clarification}\n${evidence}`, /punctuation[\s\S]*table[\s\S]*formatting/iu);
  assert.match(clarification, /保存后状态显示[\s\S]*查询后结果正常/iu);
  assert.match(`${clarification}\n${evidence}`, /object identity[\s\S]*alias[\s\S]*display/iu);
  assert.match(clarification, /risk[\s\S]*fold[\s\S]*(cannot|must not)[\s\S]*(delete|hide)/iu);
});

test('T04/T05 AT21-33 policies keep manual Oracles, finite instances, populations, and permissions', async () => {
  const [cases, behavior] = await Promise.all([
    read('references/case-writing-policy.md'), read('references/behavior-views.md')
  ]);
  assert.match(cases, /valid manual Oracle[\s\S]*selector[\s\S]*API/iu);
  assert.match(`${cases}\n${behavior}`, /finite mapping[\s\S]*independently/iu);
  assert.match(behavior, /all records[\s\S]*live row count/iu);
  assert.match(`${cases}\n${behavior}`, /administrator[\s\S]*ordinary user[\s\S]*(different|separate) outcome/iu);
});

test('T03/T06 semantic answer policy requires one preview confirmation without replacing either clarification phase', async () => {
  const [skill, preview, runs] = await Promise.all([
    read('SKILL.md'), read('references/semantic-answer-preview.md'),
    read('references/run-management.md')
  ]);
  assert.match(skill, /prepareSemanticAnswerBatchV4[\s\S]*business[- ]readable preview[\s\S]*explicit[\s\S]*commitSemanticAnswerBatchV4/iu);
  assert.match(`${skill}\n${preview}`, /pre-case[\s\S]*post-case[\s\S]*(does not replace|must not replace)/iu);
  assert.match(preview, /apply[\s\S]*revise[\s\S]*cancel_preview[\s\S]*cancel_run/iu);
  assert.match(preview, /confirmation_message[\s\S]*separate[\s\S]*user_message/iu);
  assert.match(`${preview}\n${runs}`, /accepted revision[\s\S]*unchanged[\s\S]*prepare/iu);
  assert.match(`${preview}\n${runs}`, /legacy[\s\S]*without[\s\S]*marker[\s\S]*(compatible|unchanged)/iu);
  assert.match(`${preview}\n${runs}`, /execution[- ]plan[\s\S]*(excluded|does not use|not enrolled)/iu);
});
