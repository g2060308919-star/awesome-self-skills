import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const replySchema = JSON.parse(await readFile(new URL(
  '../../skill/generate-test-cases/scripts/schemas/reply.schema.json', import.meta.url
), 'utf8'));

const warning = {
  code: 'FINAL_AUTHORITY_NOT_GRANTED', severity: 'warning',
  message: '该答案已按临时口径接收，尚未获得最终产品口径授权。',
  source_event_id: 'EVENT-answer-1', affected_question_part_ids: ['QP-ip-meaning']
};
const artifactRequest = {
  artifact_request_id: `ARQ-${'a'.repeat(64)}`,
  request_version_digest: `sha256:${'b'.repeat(64)}`,
  reason_code: 'SOURCE_ASSET_UNAVAILABLE', provider: 'prd-platform',
  redacted_resource_ref: 'prd-platform/document-1/image-2',
  source_reference_digest: `sha256:${'c'.repeat(64)}`,
  ordinary_query_digest: `sha256:${'d'.repeat(64)}`,
  why_needed: '该图片定义字段的产品展示规则。',
  allowed_input_kinds: ['stable_resource_id', 'safe_upload_ref']
};
const resumeRef = {
  run_id: 'RUN-v4', committed_revision: 2,
  committed_checkpoint_digest: `sha256:${'e'.repeat(64)}`,
  request_set_digest: `sha256:${'f'.repeat(64)}`
};
const common = {
  run_id: 'RUN-v4', produced_artifacts: [], non_blocking_diagnostics: []
};
const semanticPresentation = {
  schema_version: '4.0.0', presentation_id: `PRES-${'1'.repeat(64)}`,
  phase: 'requirements_analysis', supersedes_presentation_id: null,
  answered_part_ids: [], remaining_part_ids: [`QP-${'2'.repeat(64)}`],
  cycle_digest: `sha256:${'3'.repeat(64)}`, run_actions: ['cancel_run'],
  recovery: {
    mode: 'append_clarification_event', run_id: 'RUN-v4', committed_revision: 2,
    committed_checkpoint_digest: `sha256:${'4'.repeat(64)}`,
    after_partial_answer: 'issue_successor_for_remaining_parts'
  },
  question_parts: [{
    question_part_id: `QP-${'2'.repeat(64)}`, root_issue_id: `ROOT-${'5'.repeat(64)}`,
    root_version_digest: `sha256:${'6'.repeat(64)}`, question: 'IP 列代表什么？',
    why_needed: '需要明确业务含义。', decision_impact: '决定用例数据与预期。',
    unresolved_outcome: '该场景保持待确认。', affected_facts: ['IP 列'],
    answer_options: ['网络 IP', '定位城市'], risk_level: 'high',
    available_actions: ['answer_question_part', 'defer_question_part', 'mark_question_unknown', 'request_delivery'],
    action_context: {
      presentation_id: `PRES-${'1'.repeat(64)}`, question_part_id: `QP-${'2'.repeat(64)}`,
      root_issue_id: `ROOT-${'5'.repeat(64)}`, root_version_digest: `sha256:${'6'.repeat(64)}`
    }
  }]
};
const replies = {
  need_user_answers: {
    ...common, status: 'need_user_answers', phase: 'requirements_analysis',
    incomplete_reason: { code: 'SEMANTIC_GAP', summary: 'IP 列的业务含义尚未明确。' },
    user_next_steps: [{ action: 'answer_question_part', description: '确认 IP 列展示网络地址还是城市。' }],
    recovery: { mode: 'append_clarification_event', description: '在当前运行中提交问题答案。' },
    semantic_presentation: semanticPresentation
  },
  need_artifact: {
    ...common, status: 'need_artifact', phase: 'source_acquisition',
    incomplete_reason: { code: 'SOURCE_ASSET_UNAVAILABLE', summary: '尚未取得规范性图片。' },
    user_next_steps: [{ action: 'provide_artifact', description: '提供图片的稳定资源 ID 或安全上传引用。' }],
    recovery: { mode: 'resume_from_committed_checkpoint', description: '验证材料后从已提交检查点重试。' },
    artifact_requests: [artifactRequest], resume_ref: resumeRef,
    available_actions: ['provide_artifact', 'cancel_run'],
    cancel_context: { run_id: 'RUN-v4', phase: 'source_acquisition', phase_version: 2 }
  },
  need_revision: {
    ...common, status: 'need_revision', phase: 'case_design',
    stage: 'case_drafts', schema_ref: 'case-drafts.schema.json', source_revision: 2,
    artifact_path: '/tmp/run/staging/case-drafts.json', artifact_digest: '7'.repeat(64),
    diagnostics: [{
      category: 'schema', code: 'CASE_DRAFT_INVALID', path: '/cases/0',
      message: '一条用例的预期结果尚未关联测试点。'
    }],
    incomplete_reason: { code: 'CASE_DRAFT_INVALID', summary: '一条用例的预期结果尚未关联测试点。' },
    user_next_steps: [{ action: 'revise_artifact', description: '修正对应工件并重新提交。' }],
    recovery: { mode: 'retry_current_run', description: '保留已接受 revision，重新提交修正工件。' }
  },
  finished: {
    ...common, status: 'finished', phase: 'delivery', delivery_intent: 'case_document',
    result_kind: 'delivered_cases', incomplete_reason: null,
    produced_artifacts: [{ kind: 'case_document', path: 'output/r003/test-bundle.json', digest: `sha256:${'1'.repeat(64)}` }],
    user_next_steps: [{ action: 'read_artifact', description: '查看已生成的人工功能测试用例。' }],
    recovery: { mode: 'create_new_run', description: '实质需求变更时创建新运行。' }
  },
  fatal: {
    ...common, status: 'fatal', phase: 'case_design', result_kind: 'quality_failure',
    incomplete_reason: { code: 'FORMAL_CASE_MISSING', summary: '适用的明确需求没有生成用例。' },
    user_next_steps: [{ action: 'repair_and_retry', description: '修复质量缺陷后重试。' }],
    recovery: { mode: 'retry_current_run', description: '保留此前接受的工件和交付。' }
  },
  cancelled: {
    ...common, status: 'cancelled', phase: 'requirements_analysis', result_kind: 'cancelled',
    incomplete_reason: { code: 'USER_CANCELLED', summary: '用户已取消本次运行，未创建新交付。' },
    user_next_steps: [{ action: 'create_new_run', description: '需要继续时创建关联原运行的新运行。' }],
    recovery: { mode: 'create_sibling_run', description: '新运行引用原 run ID，保留历史交付。' }
  }
};

const stageArtifactReply = {
  ...common, status: 'need_artifact', phase: 'execution_closure',
  stage: 'source_pack', schema_ref: 'source-pack.schema.json',
  scope: { source_revision: 0, run_instance_id: 'RUN-v4' }, diagnostics: [],
  incomplete_reason: { code: 'STAGE_ARTIFACT_REQUIRED', summary: '仍需 execution Source Pack。' },
  user_next_steps: [{ action: 'write_stage_artifact', description: '写入请求的 Source Pack。' }],
  recovery: { mode: 'write_staging_artifact', description: '在同一运行目录补齐工件。' }
};

for (const [status, reply] of Object.entries(replies)) {
  test(`v4 reply ${status} accepts empty or shared non-blocking diagnostics`, () => {
    assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
    assert.deepEqual(validateAgainstSchema({ ...reply, non_blocking_diagnostics: [warning] }, replySchema), []);
  });

  test(`v4 reply ${status} requires diagnostics and rejects an incompatible warning shape`, () => {
    const { non_blocking_diagnostics, ...missing } = reply;
    assert.notDeepEqual(validateAgainstSchema(missing, replySchema), []);
    for (const diagnostics of [null, [warning, warning], [{ ...warning, severity: 'error' }], [{ ...warning, extra: true }]]) {
      assert.notDeepEqual(validateAgainstSchema({ ...reply, non_blocking_diagnostics: diagnostics }, replySchema), []);
    }
  });
}

test('v4 reply six discriminator branches share the exact nonBlockingDiagnostic definition', () => {
  assert.deepEqual(Object.keys(replySchema.$defs.nonBlockingDiagnostic.properties).sort(), [
    'affected_question_part_ids', 'code', 'message', 'severity', 'source_event_id'
  ]);
  const branches = replySchema.$defs.v4Reply.oneOf.map(/** @param {{$ref: string}} reference */ ({ $ref }) => {
    assert.match($ref, /^#\/\$defs\/[^/]+$/);
    return replySchema.$defs[$ref.slice('#/$defs/'.length)];
  });
  assert.deepEqual(branches.map(/** @param {{properties: {status: {const: string}}}} branch */ (branch) => branch.properties.status.const).sort(), Object.keys(replies).sort());
  for (const branch of branches) {
    assert.ok(branch.required.includes('non_blocking_diagnostics'));
    assert.deepEqual(branch.properties.non_blocking_diagnostics, {
      type: 'array', uniqueItems: true, items: { $ref: '#/$defs/nonBlockingDiagnostic' }
    });
  }
});

test('v4 need_artifact requires every frozen recovery field and rejects v3 or extra fields', () => {
  const reply = replies.need_artifact;
  for (const key of Object.keys(reply)) {
    /** @type {Record<string, unknown>} */
    const missing = { ...reply };
    delete missing[key];
    assert.notDeepEqual(validateAgainstSchema(missing, replySchema), [], `missing ${key}`);
  }
  for (const extra of [{ stage: 'source_pack' }, { schema_ref: 'source-pack.schema.json' }, { signed_url: 'https://example.test/?signature=secret' }]) {
    assert.notDeepEqual(validateAgainstSchema({ ...reply, ...extra }, replySchema), []);
  }
  for (const key of Object.keys(artifactRequest)) {
    /** @type {Record<string, unknown>} */
    const missing = { ...artifactRequest };
    delete missing[key];
    assert.notDeepEqual(validateAgainstSchema({ ...reply, artifact_requests: [missing] }, replySchema), [], `request missing ${key}`);
  }
  for (const key of Object.keys(resumeRef)) {
    /** @type {Record<string, unknown>} */
    const missing = { ...resumeRef };
    delete missing[key];
    assert.notDeepEqual(validateAgainstSchema({ ...reply, resume_ref: missing }, replySchema), [], `resume missing ${key}`);
  }
});

test('v4 stage-artifact stop is a closed BR-16 reply for execution and generation stages', () => {
  assert.deepEqual(validateAgainstSchema(stageArtifactReply, replySchema), []);
  assert.deepEqual(validateAgainstSchema({
    ...stageArtifactReply, phase: 'requirements_analysis', stage: 'evidence_claims',
    schema_ref: 'evidence-claims.schema.json'
  }, replySchema), []);
  for (const key of [
    'phase', 'run_id', 'produced_artifacts', 'incomplete_reason',
    'user_next_steps', 'recovery', 'non_blocking_diagnostics'
  ]) {
    const invalid = /** @type {Record<string, any>} */ ({ ...stageArtifactReply });
    delete invalid[key];
    assert.notDeepEqual(validateAgainstSchema(invalid, replySchema), [], `missing ${key}`);
  }
  assert.notDeepEqual(validateAgainstSchema({
    ...stageArtifactReply, phase: 'case_design'
  }, replySchema), [], 'source_pack cannot claim the case-design phase');
});

test('v4 need_artifact freezes provide_artifact then cancel_run as its exact two actions', () => {
  const reply = replies.need_artifact;
  assert.deepEqual(validateAgainstSchema(reply, replySchema), []);
  for (const available_actions of [[], ['provide_artifact'], ['cancel_run', 'provide_artifact'],
    ['provide_artifact', 'cancel_run', 'retry'], ['provide_artifact', 'provide_artifact']]) {
    assert.notDeepEqual(validateAgainstSchema({ ...reply, available_actions }, replySchema), []);
  }
  assert.notDeepEqual(validateAgainstSchema({ ...reply, user_next_steps: [{ action: 'answer_question_part', description: 'wrong phase' }] }, replySchema), []);
});

test('v4 need_artifact binds prefixed digests, allowed input kinds, reasons and redacted references', () => {
  const reply = replies.need_artifact;
  assert.deepEqual(validateAgainstSchema({
    ...reply,
    incomplete_reason: { ...reply.incomplete_reason, code: 'UNSUPPORTED_SIGNED_URL_PROVIDER' },
    artifact_requests: [{ ...artifactRequest, reason_code: 'UNSUPPORTED_SIGNED_URL_PROVIDER' }]
  }, replySchema), []);
  for (const request of [
    { ...artifactRequest, request_version_digest: 'b'.repeat(64) },
    { ...artifactRequest, artifact_request_id: 'ARQ-short' },
    { ...artifactRequest, allowed_input_kinds: ['signed_url'] },
    { ...artifactRequest, allowed_input_kinds: [] },
    { ...artifactRequest, reason_code: 'FINAL_AUTHORITY_NOT_GRANTED' },
    { ...artifactRequest, redacted_resource_ref: 'host/path?signature=secret' },
    { ...artifactRequest, redacted_resource_ref: 'host/path#secret' },
    { ...artifactRequest, ordinary_query: 'id=123' }
  ]) assert.notDeepEqual(validateAgainstSchema({ ...reply, artifact_requests: [request] }, replySchema), []);
  assert.notDeepEqual(validateAgainstSchema({ ...reply, resume_ref: { ...resumeRef, request_set_digest: 'f'.repeat(64) } }, replySchema), []);
  assert.notDeepEqual(validateAgainstSchema({ ...reply, incomplete_reason: { code: warning.code, summary: warning.message } }, replySchema), []);
});

test('v4 finished reply discriminates case-document and execution result kinds', () => {
  const reply = replies.finished;
  for (const result_kind of ['delivered_cases', 'delivered_with_gaps', 'blocked_only', 'no_applicable_cases']) {
    assert.deepEqual(validateAgainstSchema({ ...reply, result_kind }, replySchema), []);
  }
  for (const result_kind of ['execution_ready', 'no_execution_selected']) {
    assert.deepEqual(validateAgainstSchema({ ...reply, delivery_intent: 'execution_plan', result_kind }, replySchema), []);
    assert.notDeepEqual(validateAgainstSchema({ ...reply, result_kind }, replySchema), []);
  }
  assert.notDeepEqual(validateAgainstSchema({ ...reply, delivery_intent: 'execution_plan' }, replySchema), []);
  assert.notDeepEqual(validateAgainstSchema({ ...reply, result_kind: 'cancelled' }, replySchema), []);
});
