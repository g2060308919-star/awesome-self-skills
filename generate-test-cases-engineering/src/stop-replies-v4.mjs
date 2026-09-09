import replySchema from '../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from './canonical.mjs';
import { routeGapCategoryV4 } from './gap-kinds-v4.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

/** @param {unknown} value */
const hash = value => 'sha256:' + digest(value);

/**
 * Project one committed semantic presentation into the public stop-reply
 * contract. Keeping this projection shared prevents a cross-run recovery
 * (for example semantic reopen) from inventing a second reply shape.
 * @param {string} runId @param {any} presentation @param {any[]} [nonBlockingDiagnostics]
 */
export function createSemanticQuestionReplyV4(
  runId, presentation, nonBlockingDiagnostics = []
) {
  const route = routeGapCategoryV4('semantic_gap', { delivery_intent: 'case_document' });
  const reply = {
    status: route.status, phase: presentation?.phase, run_id: runId,
    produced_artifacts: [],
    incomplete_reason: {
      code: 'SEMANTIC_GAP',
      summary: '需求中仍有会改变业务预期的语义问题，需要逐项决定。'
    },
    user_next_steps: [{
      action: 'answer_question_part',
      description: '回答、暂缓、标记未知，或明确按当前结果交付展示的问题。'
    }],
    recovery: {
      mode: 'append_clarification_event',
      description: '从已提交检查点追加展示中允许的澄清事件。'
    },
    semantic_presentation: structuredClone(presentation),
    non_blocking_diagnostics: structuredClone(nonBlockingDiagnostics)
  };
  const diagnostics = validateAgainstSchema(reply, replySchema);
  if (diagnostics.length) {
    throw new TypeError(`SEMANTIC_QUESTION_REPLY_INVALID:${canonicalStringify(diagnostics)}`);
  }
  return reply;
}

/**
 * Build the only source-acquisition stop reply. The request/resume identities
 * are independently recomputed here so a stale or caller-forged request cannot
 * be advertised as an executable recovery action.
 * @param {unknown} input
 */
export function createNeedArtifactReplyV4(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('NEED_ARTIFACT_INPUT_INVALID');
  const value = /** @type {any} */ (structuredClone(input));
  const allowed = ['run_id', 'artifact_requests', 'resume_ref', 'produced_artifacts', 'non_blocking_diagnostics'];
  if (Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !(key in value))
    || typeof value.run_id !== 'string' || !value.run_id.trim()
    || !Array.isArray(value.artifact_requests) || value.artifact_requests.length === 0
    || !value.resume_ref || value.resume_ref.run_id !== value.run_id) throw new TypeError('NEED_ARTIFACT_INPUT_INVALID');

  const ids = new Set();
  for (const request of value.artifact_requests) {
    if (validateAgainstSchema(request, { $ref: '#/$defs/artifactRequest', $defs: replySchema.$defs }).length) {
      throw new TypeError('NEED_ARTIFACT_REQUEST_INVALID');
    }
    const { request_version_digest: version, ...body } = request;
    if (version !== hash(body) || ids.has(request.artifact_request_id)) throw new TypeError('NEED_ARTIFACT_REQUEST_INVALID');
    ids.add(request.artifact_request_id);
  }
  const requests = [...value.artifact_requests].sort((left, right) =>
    left.artifact_request_id < right.artifact_request_id ? -1 : left.artifact_request_id > right.artifact_request_id ? 1 : 0);
  if (validateAgainstSchema(value.resume_ref, { $ref: '#/$defs/resumeRef', $defs: replySchema.$defs }).length
    || value.resume_ref.request_set_digest !== hash(requests)) throw new TypeError('NEED_ARTIFACT_RESUME_INVALID');

  const reason = requests.some(request => request.reason_code === 'UNSUPPORTED_SIGNED_URL_PROVIDER')
    ? 'UNSUPPORTED_SIGNED_URL_PROVIDER' : 'SOURCE_ASSET_UNAVAILABLE';
  const route = routeGapCategoryV4('source_artifact', { delivery_intent: 'case_document' });
  const reply = {
    status: route.status, phase: 'source_acquisition', run_id: value.run_id,
    produced_artifacts: value.produced_artifacts,
    incomplete_reason: {
      code: reason,
      summary: reason === 'UNSUPPORTED_SIGNED_URL_PROVIDER'
        ? '来源引用包含无法安全持久化的临时凭据，需要提供稳定资源标识或安全上传。'
        : '需求材料引用的资源当前不可获取，需要提供稳定资源标识或安全上传。'
    },
    user_next_steps: [
      { action: 'provide_artifact', description: '按请求提供稳定资源标识或已校验的安全上传。' },
      { action: 'cancel_run', description: '若不再继续本次生成，可取消当前运行。' }
    ],
    recovery: {
      mode: 'resume_from_committed_checkpoint',
      description: '材料验真后从回复绑定的已提交 checkpoint 幂等恢复，不切换交付 manifest。'
    },
    artifact_requests: requests, resume_ref: value.resume_ref,
    available_actions: ['provide_artifact', 'cancel_run'],
    cancel_context: {
      run_id: value.run_id, phase: 'source_acquisition',
      phase_version: value.resume_ref.committed_revision
    },
    non_blocking_diagnostics: value.non_blocking_diagnostics
  };
  const diagnostics = validateAgainstSchema(reply, { $ref: '#/$defs/needArtifactReply', $defs: replySchema.$defs });
  if (diagnostics.length) throw new TypeError(`NEED_ARTIFACT_REPLY_INVALID:${canonicalStringify(diagnostics)}`);
  return reply;
}
