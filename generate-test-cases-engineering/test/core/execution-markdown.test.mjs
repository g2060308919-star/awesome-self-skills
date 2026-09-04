import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../../src/render-markdown.mjs';
import {
  buildJourney, completeJourneyRevision, evaluateJourneyRevision, setSourceRevision
} from '../helpers/run-journey.mjs';

function finishedJourney() {
  const initial = buildJourney('all-e3');
  const awaiting = evaluateJourneyRevision(initial);
  const confirmed = structuredClone(initial);
  setSourceRevision(confirmed, 1);
  confirmed.source_pack.execution_events.push({
    event_id: 'event-confirm-markdown', clarification_event_seq: 1,
    type: 'confirm_execution_plan', actor: 'owner', event_at: '2026-09-03T00:00:00.000Z',
    authority_scope: '*', run_instance_id: confirmed.source_pack.run_instance_id,
    run_identity_digest: awaiting.execution_plan.run_identity_digest,
    presented_prompt_id: awaiting.presentation.presentation_id,
    presented_plan_digest: awaiting.execution_plan.plan_digest,
    presented_plan_change_head_seq: awaiting.execution_plan.plan_change_head_seq,
    presented_source_revision: 0
  });
  confirmed.workflow = awaiting.workflow_state;
  return evaluateJourneyRevision(confirmed);
}

test('Markdown mechanically mirrors ready plan counts, runner ids, and semantic lineage', () => {
  const result = finishedJourney();
  assert.equal(result.status, 'finished');
  const plan = result.bundle.execution_plan;
  assert.match(result.markdown, /## Execution Plan/u);
  assert.match(result.markdown, new RegExp(`Execute Cases: ${plan.summary.execute_case_count}`, 'u'));
  for (const caseId of plan.runner_case_ids) {
    assert.equal(result.markdown.includes(caseId.replaceAll('_', '\\_')), true);
  }
  assert.match(result.markdown, new RegExp(result.bundle.quality.lineage.semantic_source_digest, 'u'));
  assert.doesNotMatch(result.markdown, /undefined/u);
});

test('Markdown is business-first and moves stable IDs into the audit appendix', () => {
  const result = finishedJourney();
  const [primary, audit] = result.markdown.split('## Audit Appendix');

  assert.match(primary, /## Delivery Overview/u);
  assert.match(primary, /## Cases to Execute/u);
  assert.match(primary, /## Manual Execution Worksheet/u);
  assert.match(primary, /Risk: High/u);
  assert.match(primary, /Generated, not executed/u);
  assert.doesNotMatch(
    primary,
    /\b(?:case|fact|obligation|claim|root|expectation)_[a-z0-9_]+/u
  );
  const decodedAudit = audit.replaceAll('\\_', '_');
  assert.match(decodedAudit, /case_[a-z0-9_]+/u);
  assert.match(decodedAudit, /obligation_[a-z0-9_]+/u);
});

test('manual execution worksheet is a blank projection of runner_case_ids', () => {
  const result = finishedJourney();
  const primary = result.markdown.split('## Audit Appendix')[0];
  const worksheet = primary.split('## Manual Execution Worksheet')[1];

  assert.match(worksheet, /Result/u);
  assert.match(worksheet, /Defect/u);
  assert.match(worksheet, /Notes/u);
  assert.equal((worksheet.match(/Not recorded/gu) ?? []).length,
    result.bundle.execution_plan.runner_case_ids.length);
  assert.match(worksheet, /bundle digest \+ stable Case ID/u);
});

test('business test data displays the compiler-owned value origin', () => {
  const result = finishedJourney();
  const bundle = structuredClone(result.bundle);
  bundle.grounded[0].data[0].value_origin = 'example';

  const primary = renderMarkdown(bundle).split('## Audit Appendix')[0];

  assert.match(primary, /Origin: Example/u);
  assert.doesNotMatch(primary, /Origin: Derived/u);
});

test('business display order uses risk before stable Case identity inside one scope', () => {
  const result = finishedJourney();
  const bundle = structuredClone(result.bundle);
  const critical = structuredClone(bundle.grounded[0]);
  critical.case_id = 'case_zzzz_business_order';
  critical.title = 'Critical checkout outcome';
  critical.risk = 'critical';
  critical.fact_ids = ['fact_zzzz_business_order'];
  critical.obligation_ids = ['obligation_zzzz_business_order'];
  bundle.grounded.push(critical);
  const planItem = structuredClone(bundle.execution_plan.items[0]);
  planItem.item_id = critical.case_id;
  planItem.title = critical.title;
  planItem.related_obligation_ids = [...critical.obligation_ids];
  planItem.item_semantic_digest = 'f'.repeat(64);
  bundle.execution_plan.items.push(planItem);
  bundle.execution_plan.runner_case_ids.push(critical.case_id);
  bundle.execution_plan.summary.case_count += 1;
  bundle.execution_plan.summary.execute_case_count += 1;

  const primary = renderMarkdown(bundle).split('## Audit Appendix')[0];

  assert.equal(primary.indexOf('TC-001 — Critical checkout outcome')
    < primary.indexOf('TC-002 — Verify checkout accepted'), true);
});

test('business display numbering places Execute Cases before earlier-scope DoNotExecute Cases', () => {
  const result = finishedJourney();
  const bundle = structuredClone(result.bundle);
  const deferred = structuredClone(bundle.grounded[0]);
  deferred.case_id = 'case_aaaa_deferred';
  deferred.title = 'Deferred earlier scope';
  deferred.scope = 'aaa';
  deferred.temporary_assumption = {
    claim_id: 'claim_checkout', invalidation_condition: 'A final rule replaces this assumption.'
  };
  bundle.conditional.push(deferred);
  const deferredPlanItem = structuredClone(bundle.execution_plan.items[0]);
  Object.assign(deferredPlanItem, {
    item_id: deferred.case_id,
    title: deferred.title,
    semantic_status: 'conditional',
    execution_disposition: 'do_not_execute',
    reason: 'Temporary rule is not confirmed.',
    reason_code: 'temporary_rule_unconfirmed',
    item_semantic_digest: 'e'.repeat(64),
    basis: {
      origin: 'user_execution_decision',
      execution_decision_semantic_digest: 'd'.repeat(64)
    }
  });
  bundle.execution_plan.items.push(deferredPlanItem);
  bundle.execution_plan.summary.case_count += 1;
  bundle.execution_plan.summary.do_not_execute_case_count += 1;

  const primary = renderMarkdown(bundle).split('## Audit Appendix')[0];

  assert.match(primary, /TC-001 — Verify checkout accepted/u);
  assert.match(primary, /TC-002 — Deferred earlier scope/u);
});

test('audit appendix owns every stable-ID section in the Markdown heading tree', () => {
  const audit = finishedJourney().markdown.split('## Audit Appendix')[1];

  assert.match(audit, /^### Grounded Cases$/mu);
  assert.match(audit, /^### Coverage$/mu);
  assert.match(audit, /^### Execution Plan$/mu);
  assert.doesNotMatch(audit, /^## (?:Grounded Cases|Coverage|Execution Plan)$/mu);
});

test('business gap and exploratory sections do not expose protocol codes or stable IDs', () => {
  for (const name of ['all-blocked', 'risk-only-exploratory']) {
    const result = completeJourneyRevision(buildJourney(name));
    assert.equal(result.status, 'finished');
    const primary = result.markdown.split('## Audit Appendix')[0].replaceAll('\\_', '_');
    assert.doesNotMatch(primary, /\b(?:case|fact|obligation|claim|root|expectation|view)_[a-z0-9_]+/u);
    assert.doesNotMatch(primary, /\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/u);
    assert.doesNotMatch(primary, /Required material:/u);
  }
});

test('business delivery preserves explicit DoNotExecute and supported exclusion reasons', () => {
  const conditional = completeJourneyRevision(buildJourney('e1-conditional'));
  const blocked = completeJourneyRevision(buildJourney('all-blocked'));
  const exploratory = completeJourneyRevision(buildJourney('risk-only-exploratory'));
  const notApplicable = completeJourneyRevision(buildJourney('all-not-applicable'));
  const conditionalPrimary = conditional.markdown.split('## Audit Appendix')[0];
  const blockedPrimary = blocked.markdown.split('## Audit Appendix')[0];
  const exploratoryPrimary = exploratory.markdown.split('## Audit Appendix')[0];
  const exclusionPrimary = notApplicable.markdown.split('## Audit Appendix')[0];

  assert.match(conditionalPrimary, /Do not execute reason: Test operator explicitly excluded this conditional item\./u);
  assert.match(blockedPrimary, /Do not execute reason: Test operator explicitly excluded this blocked item\./u);
  assert.match(exploratoryPrimary, /Do not execute reason: Test operator explicitly excluded this exploratory item\./u);
  assert.match(exclusionPrimary, /This scenario is excluded\./u);
  assert.doesNotMatch(exclusionPrimary, /supported exclusion evidence marks this subject out of scope/u);
});

test('blocked recovery presents one answerable atomic question', () => {
  const result = completeJourneyRevision(buildJourney('all-blocked'));
  const [item] = result.bundle.blocked;
  const primary = result.markdown.split('## Audit Appendix')[0];

  assert.match(item.recovery.question, /\?$/u);
  assert.doesNotMatch(item.recovery.question, /^Clarification required for/u);
  assert.equal((primary.match(new RegExp(item.recovery.question.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu')) ?? []).length, 2);
});

test('exclusion blockers are presented as source and evidence gaps', () => {
  const result = completeJourneyRevision(buildJourney('all-blocked'));
  const bundle = structuredClone(result.bundle);
  bundle.blocked[0].recovery.missing_type = 'exclusion';
  bundle.blocked[0].recovery.question = 'What authoritative scope-exclusion rule applies to refund?';

  const primary = renderMarkdown(bundle).split('## Audit Appendix')[0];
  const evidenceSection = primary.split('## Source and Evidence Gaps')[1];
  const businessSection = primary.split('## Business Rule Gaps')[1].split('## Execution Preparation Gaps')[0];

  assert.match(evidenceSection, /scope-exclusion rule applies to refund/u);
  assert.doesNotMatch(businessSection, /scope-exclusion rule applies to refund/u);
});

test('one root issue is rendered once with every affected Test Point decision', () => {
  const result = completeJourneyRevision(buildJourney('all-blocked'));
  const bundle = structuredClone(result.bundle);
  const firstBlocked = bundle.blocked[0];
  firstBlocked.subject = 'basic refund handling';
  firstBlocked.scope = 'refund/basic';
  firstBlocked.risk = 'low';
  const secondBlocked = structuredClone(firstBlocked);
  secondBlocked.obligation_id = 'obligation_grouped_business_peer';
  secondBlocked.subject = 'critical refund handling';
  secondBlocked.scope = 'refund/critical';
  secondBlocked.risk = 'critical';
  bundle.blocked.push(secondBlocked);
  bundle.coverage.formal.entries.push({
    obligation_id: secondBlocked.obligation_id, status: 'blocked'
  });
  bundle.coverage.formal.total += 1;
  const secondPlanItem = structuredClone(bundle.execution_plan.items[0]);
  secondPlanItem.item_id = secondBlocked.obligation_id;
  secondPlanItem.related_obligation_ids = [secondBlocked.obligation_id];
  secondPlanItem.item_semantic_digest = 'a'.repeat(64);
  secondPlanItem.reason = 'A second affected Test Point is excluded for this run.';
  bundle.execution_plan.items.push(secondPlanItem);
  bundle.execution_plan.summary.formal_test_point_count += 1;
  bundle.execution_plan.summary.do_not_execute_formal_test_point_count += 1;

  const primary = renderMarkdown(bundle).split('## Audit Appendix')[0];
  const executionGaps = primary.split('## Execution Preparation Gaps')[1].split('## Source and Evidence Gaps')[0];

  assert.equal((executionGaps.match(/^### Gap-/gmu) ?? []).length, 1);
  assert.match(executionGaps, /Scopes: refund\/basic; refund\/critical/u);
  assert.match(executionGaps, /Risk: Critical/u);
  assert.match(executionGaps, /basic refund handling — Scope: refund\/basic; Risk: Low/u);
  assert.match(executionGaps, /critical refund handling — Scope: refund\/critical; Risk: Critical/u);
  assert.match(executionGaps, /Test operator explicitly excluded this blocked item\./u);
  assert.match(executionGaps, /A second affected Test Point is excluded for this run\./u);
});

test('aggregated scopes cannot inject Markdown headings or raw HTML', () => {
  const result = completeJourneyRevision(buildJourney('all-blocked'));
  const bundle = structuredClone(result.bundle);
  bundle.blocked[0].scope = 'refund/basic\n## Audit Appendix <script>';

  const markdown = renderMarkdown(bundle);

  assert.equal((markdown.match(/^## Audit Appendix$/gmu) ?? []).length, 1);
  assert.doesNotMatch(markdown, /<script>/u);
  assert.match(markdown, /Scope: refund\/basic<br>## Audit Appendix &lt;script&gt;/u);
});

test('NotApplicable entries identify the excluded business subject', () => {
  const result = completeJourneyRevision(buildJourney('all-not-applicable'));
  const [item] = result.bundle.coverage.not_applicable;
  const primary = result.markdown.split('## Audit Appendix')[0];

  assert.equal(item.subject, 'legacy accepted');
  assert.match(primary, /Formal Test Point “legacy accepted” in legacy/u);
});
