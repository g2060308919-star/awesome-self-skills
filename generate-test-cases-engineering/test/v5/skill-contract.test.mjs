import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const skillRoot = new URL('../../skill/generate-test-cases/', import.meta.url);

test('Skill guidance uses the three V5 APIs and the four-artifact authority boundary', async () => {
  const skill = await readFile(new URL('SKILL.md', skillRoot), 'utf8');
  for (const symbol of ['createV5RunDirectory', 'advanceV5Run', 'inspectV5Run']) assert.match(skill, new RegExp(`\\b${symbol}\\b`, 'u'));
  for (const artifact of ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']) assert.match(skill, new RegExp(`\\b${artifact}\\b`, 'u'));
  for (const concept of ['submit_source_batch', 'preview_clarification_response', 'commit_clarification_response', 'read_only_integrity_fatal', 'case_document_ref']) assert.match(skill, new RegExp(`\\b${concept}\\b`, 'u'));
  assert.doesNotMatch(skill, /\bv[34]\b|V[34]|advanceStrict|createV4|constructV4|stageV4|migration|fallback/u);
});

test('all public reference policy and UI text are V5-only', async () => {
  const paths = [
    'agents/openai.yaml', 'references/behavior-views.md', 'references/case-writing-policy.md',
    'references/clarification-policy.md', 'references/evidence-policy.md',
    'references/execution-closure-policy.md', 'references/run-management.md'
  ];
  for (const relativePath of paths) {
    const text = await readFile(new URL(relativePath, skillRoot), 'utf8');
    assert.doesNotMatch(text, /\bv[34]\b|V[34]|advanceStrict|createV4|constructV4|stageV4|migrat|fallback/u, relativePath);
  }
  const ui = await readFile(new URL('agents/openai.yaml', skillRoot), 'utf8');
  assert.match(ui, /generate test cases/i);
  assert.match(ui, /source/i);
  assert.match(ui, /clarif/i);
});
