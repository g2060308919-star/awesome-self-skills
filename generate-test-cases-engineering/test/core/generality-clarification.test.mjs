import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../../src/render-markdown.mjs';
import { buildJourney, completeJourneyRevision, evaluateJourneyRevision, journeyRule, revisionFromRules } from '../helpers/run-journey.mjs';

test('generality P17: partial overlap retains exact X+Y and X dependencies without multiplying Test Points', () => {
  const input = revisionFromRules([
    journeyRule('save', { scope: 'checkout', capabilityStatus: 'unknown' }),
    journeyRule('cancel', { scope: 'checkout', capabilityStatus: 'unknown' })
  ]);
  const first = input.case_drafts.cases[0];
  first.testability_profile.capabilities.push({
    ...first.testability_profile.capabilities[0], capability: 'extra audit fixture'
  });
  const result = completeJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.equal(result.bundle.blocked.length, 2);
  assert.equal(result.bundle.coverage.formal.total, 2);
  const a = result.bundle.blocked.find((/** @type {any} */ item) => first.obligation_ids.includes(item.obligation_id));
  const b = result.bundle.blocked.find((/** @type {any} */ item) => item !== a);
  assert.equal(a.blocking_roots.length, 2);
  assert.equal(b.blocking_roots.length, 1);
  assert.ok(a.blocking_roots.some((/** @type {any} */ root) => root.root_issue_id === b.blocking_roots[0].root_issue_id));
  assert.match(renderMarkdown(result.bundle), /extra audit fixture/u);
  const reordered = structuredClone(input);
  reordered.case_drafts.cases.reverse();
  reordered.case_drafts.cases.forEach((item) => item.testability_profile.capabilities.reverse());
  const replay = completeJourneyRevision(reordered);
  assert.equal(replay.status, 'finished', JSON.stringify(replay.diagnostics));
  assert.deepEqual(replay.bundle.blocked, result.bundle.blocked);
  const restored = structuredClone(input);
  for (const draft of restored.case_drafts.cases) {
    // Accepted fixture provenance comes from the same sourced rule, not a user decision.
    draft.testability_profile.capabilities[0] = {
      capability: 'run-control', status: 'provided', provenance_ref: draft.source_claim_ids[0]
    };
  }
  const restoredResult = completeJourneyRevision(restored);
  assert.equal(restoredResult.status, 'finished', JSON.stringify(restoredResult.diagnostics));
  assert.equal(restoredResult.bundle.blocked.length, 1);
  assert.equal(restoredResult.bundle.grounded.length, 1);
  assert.equal(restoredResult.bundle.blocked[0].blocking_roots.length, 1);
  assert.match(restoredResult.bundle.blocked[0].recovery.required_material, /extra audit fixture/u);
});

test('generality P17: authored capability blockers split partial overlap with exact shared resource identity', () => {
  const input = revisionFromRules([
    journeyRule('save', { scope: 'checkout', mode: 'blocker', viewType: 'role' }),
    journeyRule('cancel', { scope: 'checkout', mode: 'blocker', viewType: 'role' })
  ]);
  input.case_drafts.obligation_dispositions.forEach((/** @type {any} */ item, index) => {
    item.issue_intent = { ...item.issue_intent, missing_type: 'testability', answerable: false, reasons: ['CAPABILITY_UNKNOWN'] };
    item.subject = { kind: 'capabilities', capabilities: index === 0 ? ['fixture X', 'fixture Y'] : ['fixture X'] };
  });
  input.behavior_views.obligation_inputs.view_contexts.forEach((item, index) => {
    item.bindings[0].required_capabilities = index === 0 ? ['fixture X', 'fixture Y'] : ['fixture X'];
  });
  const result = completeJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.deepEqual(result.bundle.blocked.map((/** @type {any} */ item) => item.blocking_roots.length).sort(), [1, 2]);
  const ids = result.bundle.blocked.flatMap((/** @type {any} */ item) => item.blocking_roots.map((/** @type {any} */ root) => root.root_issue_id));
  assert.equal(new Set(ids).size, 2);
});

test('generality P16: clarification displays the business subject, not compiler Test Point and root IDs', () => {
  const input = buildJourney('clarification-grounded');
  const result = evaluateJourneyRevision(input);
  assert.equal(result.purpose, 'semantic_clarification');
  const group = result.presentation.groups[0];
  const display = JSON.stringify({ question: group.question, items: group.item_refs.map((/** @type {any} */ item) => item.title), example: group.answer_example });
  assert.doesNotMatch(display, /Formal Test Point|root_[a-f\d]{16}|tp_[a-f\d]{16}/);
  assert.ok(group.item_refs.every((/** @type {any} */ item) => item.title.length > 0));
  assert.ok(display.includes(input.evidence_claims.claims[0].value), display);
});

test('generality P15/P16: shared fact-owned execution preparation gaps ask about resources, not product rules', () => {
  for (const language of ['zh-CN', 'en']) {
    const input = revisionFromRules([
      journeyRule('save', { scope: 'checkout', mode: 'blocker', viewType: 'role' }),
      journeyRule('cancel', { scope: 'checkout', mode: 'blocker', viewType: 'role' })
    ]);
    input.source_pack.output_language = language;
    const dispositions = input.case_drafts.obligation_dispositions;
    input.case_drafts.obligation_dispositions = [{
      status: 'blocker',
      affected_obligation_ids: dispositions.flatMap((/** @type {any} */ item) => item.affected_obligation_ids),
      subject: { kind: 'facts', fact_ids: input.evidence_claims.fact_ledger.map((/** @type {any} */ item) => item.fact_id) },
      issue_intent: {
        missing_type: 'execution-preparation', scope: 'checkout', answerable: true, risk: 'high',
        reasons: ['No verified environment or sample resource has been supplied.'], evidence_refs: []
      }
    }];
    const result = evaluateJourneyRevision(input);
    assert.equal(result.status, 'need_user_answers', JSON.stringify(result));
    assert.equal(result.presentation.groups.length, 1);
    assert.equal(result.presentation.groups[0].item_refs.length, 2);
    const question = result.presentation.groups[0].question;
    assert.doesNotMatch(question, /正式产品规则|authoritative product rule/u);
    assert.match(question, language === 'zh-CN' ? /准备|资源|观察/u : /setup|resource|observation/u);
    const visible = JSON.stringify(result.presentation.groups[0]);
    assert.doesNotMatch(visible, /正式业务答案|给出正式规则|authoritative final business answer|confirmed rule and source/u);
    const delivered = completeJourneyRevision(input, 'record_only');
    assert.equal(delivered.status, 'finished', JSON.stringify(delivered.diagnostics));
    const markdown = renderMarkdown(delivered.bundle);
    const businessHeading = language === 'zh-CN' ? '## 待补充业务规则' : '## Business Rule Gaps';
    const executionHeading = language === 'zh-CN' ? '## 待补齐执行准备' : '## Execution Preparation Gaps';
    const business = markdown.split(businessHeading)[1].split(executionHeading)[0];
    assert.doesNotMatch(business, /### /u);
    const execution = markdown.split(executionHeading)[1].split('\n## ')[0];
    assert.match(execution, /### /u);
    assert.doesNotMatch(execution, /明确的产品规则及预期结果|An authoritative product rule and expected result/u);
  }
});

test('generality P17: one unavailable capability in one scope creates one shared root', () => {
  const input = revisionFromRules([
    journeyRule('save', { scope: 'checkout', capabilityStatus: 'unknown' }),
    journeyRule('cancel', { scope: 'checkout', capabilityStatus: 'unknown' })
  ]);
  const result = completeJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.equal(result.bundle.blocked.length, 2);
  assert.equal(new Set(result.bundle.blocked.map((/** @type {any} */ item) => item.root_issue_id)).size, 1);
});

test('generality P17: different capability subjects do not collapse into one root', () => {
  const input = revisionFromRules([
    journeyRule('save', { scope: 'checkout', capabilityStatus: 'unknown' }),
    journeyRule('cancel', { scope: 'checkout', capabilityStatus: 'unknown' })
  ]);
  // Distinct declared missing resources must stay distinct even in the same module.
  input.case_drafts.cases.forEach((item, index) => { item.testability_profile.capabilities[0].capability = `control-${index}`; });
  const result = completeJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.equal(new Set(result.bundle.blocked.map((/** @type {any} */ item) => item.root_issue_id)).size, 2);
});

test('generality P17: identical resources in distinct scopes retain distinct roots', () => {
  const result = completeJourneyRevision(revisionFromRules([
    journeyRule('save', { scope: 'checkout', capabilityStatus: 'unknown' }),
    journeyRule('cancel', { scope: 'refund', capabilityStatus: 'unknown' })
  ]));
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.equal(new Set(result.bundle.blocked.map((/** @type {any} */ item) => item.root_issue_id)).size, 2);
  assert.equal(result.bundle.coverage.formal.total, 2);
});

test('generality P17: local observer and target handles cannot split one semantic observation resource', () => {
  const input = revisionFromRules([journeyRule('save', { scope: 'checkout' }), journeyRule('cancel', { scope: 'checkout' })]);
  input.case_drafts.cases.forEach((draft, index) => {
    const observer = /** @type {any} */ (draft.testability_profile.observers[0]);
    observer.status = 'unknown';
    observer.observer_id = `local-observer-${index}`;
    observer.target_id = `local-target-${index}`;
    const expectation = /** @type {any} */ (draft.steps[0].expectations[0]);
    expectation.observer_ref = observer.observer_id;
    expectation.target_ref = observer.target_id;
  });
  const result = completeJourneyRevision(input);
  assert.equal(result.status, 'finished', JSON.stringify(result.diagnostics));
  assert.equal(new Set(result.bundle.blocked.map((/** @type {any} */ item) => item.root_issue_id)).size, 1);
  const draft = input.case_drafts.cases[0];
  draft.testability_profile.observers[0].observation_target = 'audit result';
  draft.steps[0].expectations[0].observation_target = 'audit result';
  const distinct = completeJourneyRevision(input);
  assert.equal(distinct.status, 'finished', JSON.stringify(distinct.diagnostics));
  assert.equal(new Set(distinct.bundle.blocked.map((/** @type {any} */ item) => item.root_issue_id)).size, 2);
});

test('authorized request_reanalysis preserves its closed event shape through core root translation', () => {
  const input = buildJourney('all-blocked');
  const shown = evaluateJourneyRevision(input);
  assert.equal(shown.purpose, 'execution_closure');
  const group = shown.presentation.groups[0];
  assert.ok(group.allowed_options.some((/** @type {any} */ option) => option.option_code === 'request_reanalysis'));
  const event = {
    event_id: 'event-authored-reanalysis', clarification_event_seq: 1, type: 'request_reanalysis',
    actor: 'owner', event_at: '2026-09-05T00:00:00Z', presentation_id: shown.presentation.presentation_id,
    decision_group_ids: [group.group_id], source_locator_ids: [input.source_pack.locators[0].locator_id],
    affected_items: group.item_refs.map((/** @type {any} */ item) => ({ item_kind: item.item_kind,
      item_id: item.item_id, item_semantic_digest: item.item_semantic_digest,
      item_semantic_change_head_seq: item.item_semantic_change_head_seq })), reason: 'Re-read the accepted source.'
  };
  for (const artifact of [input.source_pack, input.evidence_claims, input.behavior_views, input.case_drafts]) artifact.source_revision = 1;
  input.source_pack.clarification_events = [event];
  input.clarification.prior_state = shown.clarification_state;
  input.clarification.append_batch.clarification_events = [structuredClone(event)];
  input.workflow = shown.workflow_state;
  const result = evaluateJourneyRevision(input);
  assert.deepEqual(result.diagnostics, []);
  assert.equal(Object.hasOwn(event, 'root_issue_ids'), false);
  const unauthorized = structuredClone(input);
  unauthorized.source_pack.clarification_events[0].presentation_id = 'presentation-not-shown';
  unauthorized.clarification.append_batch.clarification_events[0].presentation_id = 'presentation-not-shown';
  assert.equal(evaluateJourneyRevision(unauthorized).status, 'need_revision');
});
