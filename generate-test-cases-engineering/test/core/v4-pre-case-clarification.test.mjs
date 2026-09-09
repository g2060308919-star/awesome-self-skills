import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as clarification from '../../src/clarification.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { sourceBoundaryFixture } from '../helpers/v4-source-boundary.mjs';

/** @param {string} character */
const sha = (character) => `sha256:${character.repeat(64)}`;
const checkpointBytes = new TextEncoder().encode('{"revision":3}\n');

function facts() {
  return [
    { fact_id: 'FACT-ip', statement: '评价列表包含 IP 列', claim_ids: ['CLM-ip'] },
    { fact_id: 'FACT-empty', statement: '评价列表展示可为空的评价字段', claim_ids: ['CLM-empty'] },
    { fact_id: 'FACT-sort', statement: '评价列表支持排序', claim_ids: ['CLM-sort'] },
    { fact_id: 'FACT-refresh', statement: '评价列表可以刷新', claim_ids: ['CLM-refresh'] }
  ];
}

/** @param {any} overrides @returns {any} */
function semanticIssue(overrides) {
  return {
    category: 'semantic_gap',
    code: 'BUSINESS_RULE_UNRESOLVED',
    subject_fact_ids: ['FACT-ip'],
    missing_aspect: 'meaning',
    scope_ref: 'admin.review-list.ip',
    question: 'IP 列表示网络 IP 还是定位城市？',
    why_needed: '需要明确 IP 列代表的业务对象。',
    decision_impact: '决定测试数据构造方式和列值预期。',
    unresolved_outcome: 'IP 列相关场景保持待确认，其他已明确场景继续处理。',
    answer_options: ['网络 IP', '定位城市'],
    risk_level: 'high',
    source_claim_ids: ['CLM-ip'],
    discovery_phase: 'pre_case',
    ...overrides
  };
}

function issues() {
  return [
    semanticIssue({}),
    semanticIssue({
      code: 'EMPTY_DISPLAY_UNRESOLVED', subject_fact_ids: ['FACT-empty'], missing_aspect: 'empty_display',
      scope_ref: 'admin.review-list.empty-display', question: '空值字段应展示为空白还是占位符？',
      why_needed: '需要明确空值的可观察业务表现。', decision_impact: '决定空值场景的展示预期。',
      unresolved_outcome: '空值展示场景保持待确认，非空场景继续处理。', answer_options: ['空白', '-'] ,
      risk_level: 'medium', source_claim_ids: ['CLM-empty']
    }),
    semanticIssue({
      code: 'SORT_DIRECTION_UNRESOLVED', subject_fact_ids: ['FACT-sort'], missing_aspect: 'sort_direction',
      scope_ref: 'admin.review-list.sort', question: '列表默认按时间升序还是降序？',
      why_needed: '需要明确默认排序的业务口径。', decision_impact: '决定首屏记录顺序的预期。',
      unresolved_outcome: '默认排序场景保持待确认，筛选场景继续处理。', answer_options: ['升序', '降序'],
      risk_level: 'high', source_claim_ids: ['CLM-sort']
    }),
    {
      category: 'execution_readiness', code: 'ENVIRONMENT_URL_MISSING', message: '未提供测试环境 URL',
      affected_fact_ids: ['FACT-ip'], affected_test_point_ids: []
    },
    {
      category: 'execution_readiness', code: 'ACCOUNT_MISSING', message: '未提供测试账号',
      affected_fact_ids: ['FACT-ip'], affected_test_point_ids: []
    },
    {
      category: 'execution_readiness', code: 'DATA_TOOL_MISSING', message: '未提供数据或查询工具',
      affected_fact_ids: ['FACT-empty'], affected_test_point_ids: []
    }
  ];
}

/** @param {any} [overrides] @returns {any} */
function input(overrides = {}) {
  return {
    run_id: 'RUN-bend-review',
    committed_revision: 3,
    committed_checkpoint_bytes: checkpointBytes,
    discovery_phase: 'pre_case',
    source_review_witness: {
      expected_unit_ids: ['BLOCK-prd', 'CELL-enums', 'IMAGE-topology'],
      reviewed_unit_ids: ['IMAGE-topology', 'BLOCK-prd', 'CELL-enums']
    },
    fact_ledger_digest: sha('1'),
    scope_manifest_digest: sha('2'),
    behavior_views_digest: null,
    case_drafts_digest: null,
    facts: facts(),
    diagnostic_candidates: issues(),
    prior_checkpoint: null,
    ...overrides
  };
}

test('pre-case discovery waits for complete source review and precedes Behavior/Case modeling', () => {
  assert.equal(typeof clarification.compileSemanticClarificationCheckpointV4, 'function');
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(input({
    source_review_witness: { expected_unit_ids: ['BLOCK-prd', 'CELL-enums'], reviewed_unit_ids: ['BLOCK-prd'] }
  })), /SOURCE_REVIEW_INCOMPLETE/);
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(input({ behavior_views_digest: sha('a') })), /PRE_CASE_ARTIFACT_ORDER_INVALID/);
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(input({ case_drafts_digest: sha('b') })), /PRE_CASE_ARTIFACT_ORDER_INVALID/);
});

test('one requirements-analysis presentation contains only the three business-semantic questions', () => {
  assert.equal(typeof clarification.compileSemanticClarificationCheckpointV4, 'function');
  const result = clarification.compileSemanticClarificationCheckpointV4(input());
  assert.equal(result.status, 'need_user_answers');
  assert.equal(result.presentation.phase, 'requirements_analysis');
  assert.equal(result.presentation.question_parts.length, 3);
  assert.deepEqual(new Set(result.presentation.question_parts.map((/** @type {any} */ part) => part.question)), new Set([
    'IP 列表示网络 IP 还是定位城市？',
    '空值字段应展示为空白还是占位符？',
    '列表默认按时间升序还是降序？'
  ]));
  assert.doesNotMatch(JSON.stringify(result.presentation), /环境 URL|测试账号|数据或查询工具/);
  assert.equal(result.checkpoint.commit_profile, 'pre_case_pending');
});

test('compiler owns stable semantic root, version and question-part identities', () => {
  assert.equal(typeof clarification.compileSemanticClarificationCheckpointV4, 'function');
  const forward = clarification.compileSemanticClarificationCheckpointV4(input());
  const reversed = clarification.compileSemanticClarificationCheckpointV4(input({
    facts: [...facts()].reverse(), diagnostic_candidates: [...issues()].reverse(),
    source_review_witness: {
      expected_unit_ids: ['IMAGE-topology', 'CELL-enums', 'BLOCK-prd'],
      reviewed_unit_ids: ['CELL-enums', 'BLOCK-prd', 'IMAGE-topology']
    }
  }));
  assert.deepEqual(forward.presentation.question_parts, reversed.presentation.question_parts);
  assert.equal(forward.presentation.presentation_id, reversed.presentation.presentation_id);
  assert.equal(forward.presentation.cycle_digest, reversed.presentation.cycle_digest);
  for (const part of forward.presentation.question_parts) {
    assert.match(part.root_issue_id, /^ROOT-[0-9a-f]{64}$/);
    assert.match(part.root_version_digest, /^sha256:[0-9a-f]{64}$/);
    assert.match(part.question_part_id, /^QP-[0-9a-f]{64}$/);
  }
  const root = forward.presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('IP'));
  const changedAssociation = issues().map((item) => item.category === 'semantic_gap' && item.question.includes('IP')
    ? { ...item, affected_test_point_ids: ['TP-extra'] } : item);
  const changed = clarification.compileSemanticClarificationCheckpointV4(input({ diagnostic_candidates: changedAssociation }));
  const changedRoot = changed.presentation.question_parts.find((/** @type {any} */ part) => part.question.includes('IP'));
  assert.equal(changedRoot.root_issue_id, root.root_issue_id, 'downstream associations must not affect root identity');
});

test('compiler-private migration dispositions preserve explicit terminal intent only after fresh root reproduction', () => {
  const first = clarification.compileSemanticClarificationCheckpointV4(input());
  const [deferred, unknown, closed] = first.checkpoint.semantic_gap_ledger;
  const migrated = clarification.compileSemanticClarificationCheckpointV4(input({
    initial_root_dispositions: [
      { root_issue_id: closed.root_issue_id, status: 'closed_for_delivery' },
      { root_issue_id: deferred.root_issue_id, status: 'deferred_by_user' },
      { root_issue_id: unknown.root_issue_id, status: 'unknown_by_user' }
    ]
  }));
  assert.equal(migrated.status, 'clarification_complete');
  assert.equal(migrated.presentation, null);
  assert.deepEqual(new Map(migrated.checkpoint.clarification_state.root_states.map(
    (/** @type {any} */ state) => [state.root_issue_id, state.status]
  )), new Map([
    [deferred.root_issue_id, 'deferred_by_user'],
    [unknown.root_issue_id, 'unknown_by_user'],
    [closed.root_issue_id, 'closed_for_delivery']
  ]));
  assert.deepEqual(
    migrated.checkpoint.clarification_state.closed_for_delivery_part_ids,
    [closed.question_part_id]
  );
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(input({
    initial_root_dispositions: [{
      root_issue_id: `ROOT-${'f'.repeat(64)}`, status: 'presented'
    }]
  })), /MIGRATION_ROOT_REANALYSIS_MISMATCH/u);
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(input({
    prior_checkpoint: first.checkpoint,
    initial_root_dispositions: [{
      root_issue_id: deferred.root_issue_id, status: 'deferred_by_user'
    }]
  })), /MIGRATION_ROOT_DISPOSITIONS_INVALID/u);
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(input({
    initial_root_dispositions: [{
      root_issue_id: deferred.root_issue_id, status: 'resolved_final'
    }]
  })), /MIGRATION_ROOT_DISPOSITIONS_INVALID/u,
  'a legacy answer cannot bypass fresh v4 Decision provenance');
});

test('question parts contain business rationale, exact recovery and only constructible actions', async () => {
  assert.equal(typeof clarification.validateSemanticPresentationV4, 'function');
  const { presentation } = clarification.compileSemanticClarificationCheckpointV4(input());
  const schema = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/presentation.schema.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateAgainstSchema(presentation, schema), []);
  assert.deepEqual(clarification.validateSemanticPresentationV4(presentation, { committed_checkpoint_bytes: checkpointBytes }), []);
  assert.deepEqual(presentation.run_actions, ['cancel_run']);
  for (const part of presentation.question_parts) {
    for (const field of ['question', 'why_needed', 'decision_impact', 'unresolved_outcome']) assert.ok(part[field].trim(), field);
    assert.ok(part.answer_options.length > 0);
    assert.deepEqual(part.available_actions, ['answer_question_part', 'defer_question_part', 'mark_question_unknown', 'request_delivery']);
    assert.deepEqual(part.action_context, {
      presentation_id: presentation.presentation_id,
      question_part_id: part.question_part_id,
      root_issue_id: part.root_issue_id,
      root_version_digest: part.root_version_digest
    });
  }
  for (const field of ['why_needed', 'decision_impact', 'unresolved_outcome', 'available_actions', 'action_context']) {
    const bad = structuredClone(presentation);
    delete bad.question_parts[0][field];
    assert.notDeepEqual(validateAgainstSchema(bad, schema), [], field);
  }
  const forged = structuredClone(presentation);
  forged.question_parts[0].available_actions[0] = 'provide_capability_proof';
  assert.notDeepEqual(validateAgainstSchema(forged, schema), []);
  const inconsistent = structuredClone(presentation);
  inconsistent.question_parts[0].action_context.root_issue_id = 'ROOT-' + 'f'.repeat(64);
  assert.notDeepEqual(clarification.validateSemanticPresentationV4(inconsistent, { committed_checkpoint_bytes: checkpointBytes }), []);
  assert.notDeepEqual(clarification.validateSemanticPresentationV4(presentation, {
    committed_checkpoint_bytes: new TextEncoder().encode('{}\n')
  }), []);
});

test('v4 semantic validators reject a schema-valid legacy presentation', () => {
  const legacy = {
    presentation_id: 'legacy-presentation', purpose: 'semantic_clarification', entry_context: 'active_analysis',
    post_ready_control: null, run_instance_id: 'legacy-run', source_revision: 1,
    plan_digest: 'a'.repeat(64), plan_change_head_seq: 0,
    groups: [{
      group_id: 'legacy-group', question_id: 'legacy-question', question: 'Legacy question?', item_refs: [],
      allowed_options: [{ option_code: 'answer', label: 'Answer', meaning: 'Supply an answer.' }],
      answer_example: 'Example answer', proposed_change: null
    }]
  };
  assert.ok(clarification.validateSemanticPresentationV4(legacy)
    .some((/** @type {any} */ item) => item.code === 'V4_PRESENTATION_REQUIRED'));
});

test('same decision root is aggregated once and conflicting business wording is rejected', () => {
  const duplicate = semanticIssue({ source_claim_ids: ['CLM-ip-extra'], affected_test_point_ids: ['TP-ip'] });
  const result = clarification.compileSemanticClarificationCheckpointV4(input({ diagnostic_candidates: [...issues(), duplicate] }));
  assert.equal(result.presentation.question_parts
    .filter((/** @type {any} */ part) => part.question.includes('IP')).length, 1);
  const root = result.checkpoint.semantic_gap_ledger.find((item) => item.question.includes('IP'));
  assert.deepEqual(root.source_claim_ids, ['CLM-ip', 'CLM-ip-extra']);
  assert.deepEqual(root.affected_test_point_ids, ['TP-ip']);
  assert.throws(() => clarification.compileSemanticClarificationCheckpointV4(input({
    diagnostic_candidates: [...issues(), semanticIssue({ question: 'IP 到底是什么？' })]
  })), /SEMANTIC_GAP_ROOT_CONFLICT/);
});

test('semantic roots consume the accepted Evidence fact and Claim shapes without an adapter-only fact projection', () => {
  const actualFact = {
    fact_id: 'FACT-ip', claim_id: 'CLM-ip', status: 'ambiguous', source_claim_ids: ['CLM-ip'],
    required_view_kinds: ['integration'], view_review_basis: 'IP 列业务含义未明确'
  };
  const actualClaim = { claim_id: 'CLM-ip', value: '评价列表包含业务含义待明确的 IP 列' };
  const result = clarification.compileSemanticClarificationCheckpointV4(input({
    facts: [actualFact], claims: [actualClaim], diagnostic_candidates: [semanticIssue({})]
  }));
  assert.deepEqual(result.presentation.question_parts[0].affected_facts, [actualClaim.value]);
});

test('v4 Evidence carries closed typed semantic-gap inputs while v3 remains unchanged', async () => {
  const schema = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json', import.meta.url), 'utf8'));
  const fact = {
    fact_id: 'FACT-ip', statement: 'IP 列含义尚未明确', status: 'ambiguous',
    acceptance_role: 'primary_acceptance', claim_ids: ['CLM-ip'], module_refs: ['checkout'],
    field_path: '/response/ip'
  };
  const semanticGap = {
    category: 'semantic_gap', code: 'IP_MEANING_UNRESOLVED', subject_fact_ids: ['FACT-ip'],
    missing_aspect: 'meaning', scope_ref: 'admin.review-list.ip', question: 'IP 表示什么？',
    why_needed: '需要明确业务含义。', decision_impact: '决定列值预期。', unresolved_outcome: '该列场景待确认。',
    answer_options: ['网络 IP', '定位城市'], risk_level: 'high', source_claim_ids: ['CLM-ip'],
    discovery_phase: 'pre_case', affected_test_point_ids: []
  };
  const artifact = sourceBoundaryFixture().evidence;
  artifact.claims = [];
  artifact.fact_ledger = [fact];
  artifact.semantic_gaps = [semanticGap];
  artifact.acceptance_role_assignments = [{ entity_kind: 'fact', entity_id: 'FACT-ip', scope_ref: 'checkout',
    acceptance_role: 'primary_acceptance', parent_entity_ids: [], role_basis_claim_ids: ['CLM-ip'] }];
  assert.deepEqual(validateAgainstSchema(artifact, schema), []);
  const missing = /** @type {any} */ (structuredClone(artifact)); delete missing.semantic_gaps;
  assert.notDeepEqual(validateAgainstSchema(missing, schema), []);
  const forged = /** @type {any} */ (structuredClone(artifact));
  forged.semantic_gaps[0].root_issue_id = 'ROOT-' + 'a'.repeat(64);
  assert.notDeepEqual(validateAgainstSchema(forged, schema), []);
  const legacy = { schema_version: '3.0.0', source_revision: 0, claims: [], fact_ledger: [{
    fact_id: 'FACT-ip', claim_id: 'CLM-ip', status: 'ambiguous', source_claim_ids: ['CLM-ip'],
    required_view_kinds: ['integration'], view_review_basis: 'IP 列含义尚未明确'
  }] };
  assert.deepEqual(validateAgainstSchema(legacy, schema), []);
  assert.notDeepEqual(validateAgainstSchema({ ...legacy, semantic_gaps: [] }, schema), []);
});
