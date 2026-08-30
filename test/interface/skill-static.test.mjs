import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const skillRoot = path.join(repositoryRoot, 'skill/generate-test-cases');

/** @param {string} relativePath */
async function text(relativePath) {
  return readFile(path.join(skillRoot, relativePath), 'utf8');
}

test('skill static contract keeps the adapter private concise and complete', async () => {
  const skill = await text('SKILL.md');
  const lines = skill.split(/\r?\n/u);
  assert.ok(lines.length < 500, `SKILL.md has ${lines.length} lines`);

  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---\n/u);
  assert.ok(frontmatter, 'SKILL.md must begin with YAML frontmatter');
  const keys = [...frontmatter[1].matchAll(/^([a-z_]+):/gmu)].map((match) => match[1]);
  assert.deepEqual(keys, ['name', 'description']);
  assert.match(frontmatter[1], /PRD/u);
  assert.match(frontmatter[1], /module description/u);
  assert.match(frontmatter[1], /manual functional/u);
  assert.match(frontmatter[1], /accuracy/u);
  assert.match(frontmatter[1], /coverage/u);
  assert.match(frontmatter[1], /traceab/u);
  assert.match(frontmatter[1], /Blocked/u);
  assert.match(frontmatter[1], /clarification/u);

  assert.ok(skill.includes(
    'node <skill-dir>/scripts/test-compiler.mjs <absolute-run-directory>'
  ));
  for (const status of [
    'need_artifact', 'need_user_answers', 'need_revision', 'finished', 'fatal'
  ]) assert.match(skill, new RegExp(`Handle ${String.fromCodePoint(96)}${status}${String.fromCodePoint(96)}`, 'u'));
  assert.match(skill, /INPUT_UNAVAILABLE/u);
  assert.match(skill, /complete A–G analysis before (?:asking|presenting) clarification/u);
  assert.match(skill, /three repair attempts/u);
  assert.match(skill, /fourth identical no-progress result/u);
  assert.match(skill, /PIPELINE_NO_PROGRESS/u);
  assert.doesNotMatch(skill, /record_only/iu);
  assert.doesNotMatch(skill, /\bnpm\b/iu);
  assert.doesNotMatch(skill, /\bCLI\b/u);
  assert.doesNotMatch(skill, /batch interface/iu);

  const references = [
    'evidence-policy.md', 'behavior-views.md',
    'clarification-policy.md', 'case-writing-policy.md'
  ];
  for (const reference of references) {
    const tick = String.fromCodePoint(96);
    assert.match(skill, new RegExp(`Read ${tick}references/${reference}${tick} when`, 'u'));
    assert.ok((await text(`references/${reference}`)).trim().length > 0);
  }
});

test('skill static policies freeze clarification and source-review boundaries', async () => {
  const behavior = await text('references/behavior-views.md');
  for (const viewType of [
    'flow', 'decision', 'state', 'input-domain', 'role', 'timing', 'integration'
  ]) assert.match(behavior, new RegExp(`${String.fromCodePoint(96)}${viewType}${String.fromCodePoint(96)}`, 'u'));

  const clarification = await text('references/clarification-policy.md');
  assert.match(clarification, /task-scoped E3/u);
  assert.match(clarification, /explicit temporary assumption[\s\S]*E1/u);
  assert.match(clarification, /unknown[\s\S]*skip[\s\S]*defer[\s\S]*Blocked[\s\S]*suppressed/iu);
  assert.match(clarification, /defaults to E1/u);
  assert.match(clarification, /unanswered[\s\S]*deferred/iu);
  assert.match(clarification, /request_delivery/u);
  assert.match(clarification, /complete pending-root set/u);
  assert.match(clarification, /reopen_root_issues/u);
  assert.match(clarification, /new Source Pack revision/u);

  const cases = await text('references/case-writing-policy.md');
  assert.match(cases, /read-only source rebuttal pass/u);
  assert.match(cases, /support_review = supported \| contradicted \| uncertain/u);
  assert.match(cases, /never introduce a new business fact/iu);
});

test('skill static UI metadata remains the generated closed interface', async () => {
  assert.equal(await text('agents/openai.yaml'), `interface:\n  display_name: "高精度测试用例生成"\n  short_description: "从 PRD 生成高准确、高覆盖且可追溯的人工功能测试用例"\n  default_prompt: "使用 $generate-test-cases 根据这份 PRD 生成有依据、可执行的测试用例。"\n`);
});
