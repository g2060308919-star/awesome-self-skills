import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJourney, completeJourneyRevision, evaluateJourneyRevision } from '../helpers/run-journey.mjs';
import { renderMarkdown } from '../../src/render-markdown.mjs';

test('generality P24: Markdown lists each Case once and keeps compact audit links', () => {
  const input = buildJourney('all-e3');
  input.source_pack.delivery_intent = 'case_document';
  const result = evaluateJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  const text = result.markdown;
  assert.equal(text.split(input.case_drafts.cases[0].steps[0].action).length - 1, 1);
  assert.ok(text.includes(result.bundle.grounded[0].case_id.replaceAll('_', '\\_')));
  assert.ok(text.includes('Audit'));
});

test('generality P25: Chinese output localizes headings, states and prompts, not source text', () => {
  const input = buildJourney('all-e3');
  input.source_pack.delivery_intent = 'case_document';
  input.source_pack.output_language = 'zh-CN';
  const result = evaluateJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.match(result.markdown, /^# 人工功能测试用例/m);
  assert.match(result.markdown, /待决定/);
  assert.doesNotMatch(result.markdown, /## Execution|## Audit|Evidence status|Post-state and Cleanup/);
  assert.ok(result.markdown.includes(input.case_drafts.cases[0].steps[0].action));
});

test('generality P23: pure PRD-to-document finishes without implying runner readiness', () => {
  const input = buildJourney('all-e3');
  input.source_pack.delivery_intent = 'case_document';
  const result = evaluateJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.equal(result.bundle.execution_plan.status, 'document_only');
  assert.equal(result.bundle.execution_plan.confirmation, null);
  assert.deepEqual(result.bundle.execution_plan.runner_case_ids, []);
  assert.equal(result.bundle.grounded.length, 1);
  assert.equal(result.bundle.execution_plan.items[0].execution_disposition, 'pending');
});

test('generality P24: compact gaps retain actual missing resources and distinguish unknown from unavailable', () => {
  const input = buildJourney('all-blocked');
  input.source_pack.output_language = 'zh-CN';
  const bundle = completeJourneyRevision(input).bundle;
  bundle.blocked[0].recovery.required_material = JSON.stringify({
    kind: 'capability', subject: '订单观察器', target: '支付结果'
  });
  bundle.blocked[0].recovery.question = '订单观察器可以在哪里读取支付结果？';
  bundle.blocked[0].blocking_roots[0].recovery = structuredClone(bundle.blocked[0].recovery);
  bundle.blocked[0].reason = 'CAPABILITY_UNKNOWN';
  let primary = renderMarkdown(bundle).split('## 审计索引')[0];
  assert.ok(primary.includes('订单观察器'));
  assert.ok(primary.includes('支付结果'));
  assert.ok(primary.includes(bundle.blocked[0].recovery.question));
  assert.match(primary, /能力可用性尚未确认/u);
  bundle.blocked[0].reason = 'CAPABILITY_UNAVAILABLE';
  primary = renderMarkdown(bundle).split('## 审计索引')[0];
  assert.match(primary, /能力已确认不可用/u);
});

test('generality P25: compiler default execution reason is localized but explicit operator reasons are preserved', () => {
  const input = buildJourney('all-e3');
  input.source_pack.output_language = 'zh-CN';
  const bundle = completeJourneyRevision(input).bundle;
  let text = renderMarkdown(bundle);
  assert.doesNotMatch(text, /Selected for this run\./u);
  assert.match(text, /已选择纳入本次执行/u);
  bundle.execution_plan.items[0].reason = 'Operator authored English reason.';
  bundle.execution_plan.items[0].basis = {
    origin: 'user_execution_decision', execution_decision_semantic_digest: 'a'.repeat(64)
  };
  text = renderMarkdown(bundle);
  assert.ok(text.includes('Operator authored English reason.'));
});
