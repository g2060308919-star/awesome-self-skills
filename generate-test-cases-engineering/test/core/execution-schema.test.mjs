import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemas = path.join(root, 'skill/generate-test-cases/scripts/schemas');
const sha = 'a'.repeat(64);

/** @param {string} name */
async function schema(name) {
  return JSON.parse(await readFile(path.join(schemas, name), 'utf8'));
}

/** @param {Record<string,unknown>} [overrides] */
function baseItem(overrides = {}) {
  return {
    item_kind: 'case', item_id: 'case_a', title: 'Save settings',
    semantic_status: 'grounded', item_semantic_digest: sha,
    item_semantic_change_head_seq: 0, related_obligation_ids: ['obligation_a'],
    execution_disposition: 'execute', reason_code: 'selected_for_run',
    reason: 'Run this Case.', basis: { origin: 'default_grounded_recommendation' },
    ...overrides
  };
}

function summary() {
  return {
    case_count: 1, formal_test_point_count: 1,
    applicable_formal_test_point_count: 1, not_applicable_formal_test_point_count: 0,
    full_test_point_count: 1, partial_test_point_count: 0, none_test_point_count: 0,
    exploratory_count: 0, execute_case_count: 1, do_not_execute_case_count: 0,
    do_not_execute_formal_test_point_count: 0, do_not_execute_exploratory_count: 0,
    pending_case_count: 0, pending_formal_test_point_count: 0,
    pending_exploratory_count: 0
  };
}

test('execution plan schema validates closed working and ready projections', async () => {
  const contract = await schema('execution-plan.schema.json');
  /** @type {any} */
  const working = {
    status: 'awaiting_confirmation', resume_target: null,
    run_identity_digest: sha, semantic_source_digest: sha, plan_digest: sha,
    plan_change_head_seq: 0, items: [baseItem()], runner_case_ids: ['case_a'],
    promoted_exploratory: [],
    test_point_execution_coverage: [{
      obligation_id: 'obligation_a', related_grounded_case_ids: ['case_a'],
      execute_case_ids: ['case_a'], status: 'full'
    }],
    summary: summary(), confirmation: null
  };
  assert.deepEqual(validateAgainstSchema(working, contract), []);

  const ready = structuredClone(working);
  ready.status = 'ready';
  delete ready.resume_target;
  delete ready.plan_change_head_seq;
  delete ready.items[0].item_semantic_change_head_seq;
  ready.semantic_result_digest = sha;
  ready.confirmation = {
    confirmed: true, confirmed_plan_digest: sha, actor: 'owner',
    authority_scope: 'checkout', confirmation_semantic_digest: sha
  };
  assert.deepEqual(validateAgainstSchema(ready, contract), []);

  ready.unexpected = true;
  assert.equal(validateAgainstSchema(ready, contract).some((item) => item.code === 'ADDITIONAL_PROPERTY'), true);
});

test('run instance and current pointer schemas reject mixed state', async () => {
  const runInstance = await schema('run-instance.schema.json');
  const current = await schema('current-pointer.schema.json');
  assert.deepEqual(validateAgainstSchema({
    schema_version: '2.1.0', run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc',
    created_at: '2026-09-03T00:00:00.000Z'
  }, runInstance), []);
  assert.deepEqual(validateAgainstSchema({
    status: 'ready', run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc',
    source_revision: 2, bundle_path: 'output/r002/test-bundle.json',
    bundle_digest: sha, plan_digest: sha
  }, current), []);
  const mixed = {
    status: 'stale', run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc',
    active_source_revision: 3, reason: 'higher_revision_not_ready', previous_ready_revision: 2,
    bundle_path: 'output/r002/test-bundle.json'
  };
  assert.equal(validateAgainstSchema(mixed, current).some((item) => item.code === 'ADDITIONAL_PROPERTY'), true);
});

test('post-ready preview schema binds open replace and cancel as closed operations', async () => {
  const contract = await schema('post-ready-preview-request.schema.json');
  const base = {
    request_instance_id: 'PREVIEW-REQUEST-a', expected_preview_epoch: 0,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc',
    bound_source_revision: 2, bound_bundle_digest: sha, bound_plan_digest: sha,
    bound_confirmation_semantic_digest: sha
  };
  const open = {
    ...base, operation: 'open_preview',
    candidate_item_refs: [{ item_kind: 'case', item_id: 'case_a', item_semantic_digest: sha }],
    verbatim_user_request: 'Do not execute Save settings.',
    proposed_change: {
      kind: 'change_execution_disposition', disposition: 'do_not_execute',
      reason_code: 'user_deferred', reason: 'Wait for the next release.'
    }
  };
  assert.deepEqual(validateAgainstSchema(open, contract), []);
  assert.deepEqual(validateAgainstSchema({ ...open, operation: 'replace_preview', replaces_presentation_id: 'PRESENTATION-a' }, contract), []);
  assert.deepEqual(validateAgainstSchema({ ...base, operation: 'cancel_preview', cancels_presentation_id: 'PRESENTATION-a' }, contract), []);
  assert.equal(validateAgainstSchema({ ...open, unexpected: true }, contract).some((item) => item.code === 'ADDITIONAL_PROPERTY'), true);
});

test('source pack v2 requires run identity and three append-only event collections', async () => {
  const contract = await schema('source-pack.schema.json');
  /** @type {any} */
  const artifact = {
    schema_version: '2.1.0', source_revision: 0,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout',
    sources: [], locators: [], source_reviews: [], source_policy: { rules: [] }, decision_records: [],
    clarification_events: [], execution_events: []
  };
  assert.deepEqual(validateAgainstSchema(artifact, contract), []);
  delete artifact.execution_events;
  assert.equal(validateAgainstSchema(artifact, contract).some((item) => item.path === '/execution_events'), true);
});

test('source pack uses closed decisions for supersession and version-bound Exploratory adoption', async () => {
  const contract = await schema('source-pack.schema.json');
  const base = {
    schema_version: '2.1.0', source_revision: 1,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc', run_scope: 'checkout',
    sources: [], locators: [], source_reviews: [], source_policy: { rules: [] }, clarification_events: [], execution_events: []
  };
  const answer = {
    decision_id: 'decision_final', question_id: 'question_a', root_issue_ids: ['root_a'],
    presentation_id: 'PRESENTATION-a', decision_group_ids: ['GROUP-a'],
    affected_obligation_ids: ['obligation_a'], clarification_event_seq: 1,
    confirmer: 'owner', confirmed_at: '2026-09-03', question: 'Final rule?', answer: 'Approved',
    disposition: 'final', authority_scope: 'checkout', effective_scope: 'checkout',
    evidence_ref: 'locator_a', evidence_level: 'E3', supersedes_decision_ids: ['decision_temporary']
  };
  assert.deepEqual(validateAgainstSchema({ ...base, decision_records: [answer] }, contract), []);
  const adoption = {
    decision_id: 'decision_adopt', decision_type: 'exploratory_adoption',
    clarification_event_seq: 1, confirmer: 'owner', confirmed_at: '2026-09-03',
    presentation_id: 'PRESENTATION-a', decision_group_ids: ['GROUP-a'],
    exploratory_id: 'exploratory_a', item_semantic_digest: sha,
    item_semantic_change_head_seq: 0, business_rule: 'Retry once after timeout.',
    expected_result: 'The second request succeeds.', authority_scope: 'checkout',
    effective_scope: 'checkout', evidence_ref: 'locator_a', evidence_level: 'E3'
  };
  assert.deepEqual(validateAgainstSchema({ ...base, decision_records: [adoption] }, contract), []);
  assert.notDeepEqual(validateAgainstSchema({
    ...base, decision_records: [{ ...adoption, item_semantic_digest: undefined }]
  }, contract), []);
});

test('all artifact schemas use protocol version 2.1.0', async () => {
  for (const name of [
    'source-pack.schema.json', 'evidence-claims.schema.json', 'behavior-views.schema.json',
    'test-obligations.schema.json', 'case-drafts.schema.json', 'checkpoint.schema.json',
    'test-bundle.schema.json'
  ]) {
    const contract = await schema(name);
    assert.equal(contract.properties?.schema_version?.const, '2.1.0', name);
  }
});
