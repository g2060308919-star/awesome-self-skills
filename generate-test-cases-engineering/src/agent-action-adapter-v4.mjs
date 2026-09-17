import replySchema from '../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };

import { canonicalStringify } from './canonical.mjs';
import { constructSemanticClarificationEventV4 } from './clarification-v4.mjs';
import { normalizeDecisionMessageV4 } from './decision-record.mjs';
import { constructV4ExecutionRunEvent } from './execution-events.mjs';
import { constructCancelRunEventV4 } from './run-cancellation-v4.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { createProvideArtifactEvent } from './source-events.mjs';
import { createCompilerSourceRuntimeV4 } from './source-runtime-registry-v4.mjs';
import { sourceByteDigest } from './source-canonicalization.mjs';

/** @param {unknown} value @returns {value is Record<string,any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {readonly string[]} keys @param {string} code */
function exactKeys(value, keys, code) {
  if (!record(value)) throw new TypeError(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) throw new TypeError(code);
  return value;
}

/** @param {unknown} reply */
function validatedReply(reply) {
  if (validateAgainstSchema(reply, replySchema).length) {
    throw new TypeError('V4_ACTION_REPLY_INVALID');
  }
  return /** @type {Record<string,any>} */ (structuredClone(reply));
}

/** @param {string[]} message @param {string[]} answer @param {number|undefined} submittedStart */
function exactAnswerStart(message, answer, submittedStart) {
  if (Number.isSafeInteger(submittedStart)) {
    const start = Number(submittedStart);
    if (start < 0 || message.slice(start, start + answer.length).join('') !== answer.join('')) {
      throw new TypeError('V4_ACTION_ANSWER_SPAN_INVALID');
    }
    return start;
  }
  const candidates = [];
  for (let index = 0; index <= message.length - answer.length; index += 1) {
    if (message.slice(index, index + answer.length).join('') === answer.join('')) candidates.push(index);
  }
  if (candidates.length !== 1) throw new TypeError('V4_ACTION_ANSWER_SPAN_AMBIGUOUS');
  return candidates[0];
}

/** @param {any} presentation @param {Record<string,any>} request */
function semanticAction(presentation, request) {
  if (request.action === 'cancel_run') {
    exactKeys(request, ['action'], 'V4_ACTION_REQUEST_INVALID');
    return constructSemanticClarificationEventV4(
      presentation, null, 'cancel_run', {}
    );
  }
  if (request.action === 'answer_question_part') {
    const allowed = [
      'action', 'question_part_id', 'answer', 'user_message', 'resolution',
      'origin_type', 'answer_start_scalar'
    ];
    if (!record(request) || Object.keys(request).some((key) => !allowed.includes(key))
      || allowed.slice(0, 6).some((key) => !Object.hasOwn(request, key))) {
      throw new TypeError('V4_ACTION_REQUEST_INVALID');
    }
    const part = presentation.question_parts.find(
      (/** @type {any} */ item) => item.question_part_id === request.question_part_id
    );
    if (!part) throw new TypeError('V4_ACTION_NOT_ADVERTISED');
    const message = normalizeDecisionMessageV4(request.user_message);
    if (typeof request.answer !== 'string') throw new TypeError('V4_ACTION_ANSWER_INVALID');
    const answer = request.answer.normalize('NFC').trim();
    if (!answer) throw new TypeError('V4_ACTION_ANSWER_INVALID');
    const messageScalars = Array.from(message);
    const answerScalars = Array.from(answer);
    const start = exactAnswerStart(
      messageScalars, answerScalars,
      Object.hasOwn(request, 'answer_start_scalar') ? request.answer_start_scalar : undefined
    );
    const excerpt = messageScalars.slice(start, start + answerScalars.length).join('');
    const originType = request.origin_type;
    if (!['user_statement', 'authorized_confirmation'].includes(originType)) {
      throw new TypeError('V4_ACTION_ANSWER_ORIGIN_INVALID');
    }
    return constructSemanticClarificationEventV4(
      presentation, part, 'answer_question_part', {
        answer, resolution: request.resolution,
        authority: originType === 'authorized_confirmation' ? 'product_final' : 'task_scoped',
        answer_origin: {
          type: originType, presentation_id: presentation.presentation_id,
          message_digest: sourceByteDigest(new TextEncoder().encode(message)),
          answer_span: {
            start_scalar: start, end_scalar: start + answerScalars.length,
            excerpt_digest: sourceByteDigest(new TextEncoder().encode(excerpt))
          }
        }
      }
    );
  }
  if (['defer_question_part', 'mark_question_unknown', 'request_delivery'].includes(request.action)) {
    exactKeys(request, ['action', 'question_part_id'], 'V4_ACTION_REQUEST_INVALID');
    const part = presentation.question_parts.find(
      (/** @type {any} */ item) => item.question_part_id === request.question_part_id
    );
    if (!part) throw new TypeError('V4_ACTION_NOT_ADVERTISED');
    return constructSemanticClarificationEventV4(
      presentation, part, request.action, {}
    );
  }
  throw new TypeError('V4_ACTION_NOT_ADVERTISED');
}

/** @param {Record<string,any>} reply @param {Record<string,any>} request */
function sourceAction(reply, request) {
  if (request.action === 'cancel_run') {
    exactKeys(request, ['action'], 'V4_ACTION_REQUEST_INVALID');
    if (!reply.available_actions.includes('cancel_run')) throw new TypeError('V4_ACTION_NOT_ADVERTISED');
    return constructCancelRunEventV4(reply.cancel_context);
  }
  if (request.action !== 'provide_artifact') throw new TypeError('V4_ACTION_NOT_ADVERTISED');
  exactKeys(
    request, ['action', 'artifact_request_id', 'input'], 'V4_ACTION_REQUEST_INVALID'
  );
  if (!reply.available_actions.includes('provide_artifact')) throw new TypeError('V4_ACTION_NOT_ADVERTISED');
  const matches = reply.artifact_requests.filter(
    (/** @type {any} */ item) => item.artifact_request_id === request.artifact_request_id
  );
  if (matches.length !== 1) throw new TypeError('V4_ACTION_NOT_ADVERTISED');
  const runtime = createCompilerSourceRuntimeV4();
  return createProvideArtifactEvent(
    matches[0], reply.resume_ref, request.input, runtime.provider_registry
  );
}

/** @param {any} presentation @param {Record<string,any>} request */
function executionAction(presentation, request) {
  if (request.action === 'cancel_run' || request.action === 'confirm_execution_plan') {
    exactKeys(request, ['action'], 'V4_ACTION_REQUEST_INVALID');
    return constructV4ExecutionRunEvent(presentation, request.action);
  }
  const required = ['action', 'action_context'];
  if (request.action === 'set_execution_disposition') required.push('disposition');
  if (request.action === 'provide_capability_proof') required.push('proof');
  exactKeys(request, required, 'V4_ACTION_REQUEST_INVALID');
  const matches = presentation.items.filter((/** @type {any} */ item) => (
    item.available_actions.includes(request.action)
      && canonicalStringify(item.action_context) === canonicalStringify(request.action_context)
  ));
  if (matches.length !== 1) throw new TypeError('V4_ACTION_NOT_ADVERTISED');
  const event = {
    event_type: request.action, ...structuredClone(request.action_context),
    ...(Object.hasOwn(request, 'disposition') ? { disposition: request.disposition } : {}),
    ...(Object.hasOwn(request, 'proof') ? { proof: structuredClone(request.proof) } : {})
  };
  if (validateAgainstSchema(event, {
    $defs: sourcePackSchema.$defs, $ref: '#/$defs/v4ExecutionEvent'
  }).length) throw new TypeError('V4_ACTION_EVENT_INVALID');
  return event;
}

/**
 * Bind an Agent-authored assessment/finding body to the exact compiler-issued
 * source-first inventory and generated-content digest. The Adapter copies all
 * identities so the Agent never guesses target IDs or hashes.
 * @param {unknown} submittedReply
 * @param {unknown} submittedReviewBody
 */
export function constructIndependentReviewCompletionV4(submittedReply, submittedReviewBody) {
  if (!record(submittedReply) || !record(submittedReply.review_request)
    || !record(submittedReviewBody)) throw new TypeError('INDEPENDENT_REVIEW_ACTION_INVALID');
  exactKeys(
    submittedReviewBody, ['target_assessments', 'findings'],
    'INDEPENDENT_REVIEW_ACTION_INVALID'
  );
  const request = submittedReply.review_request;
  exactKeys(request, [
    'protocol_version', 'review_mode', 'reviewer_identity', 'source_first_targets',
    'review_target_digest', 'review_target_projection'
  ], 'INDEPENDENT_REVIEW_REQUEST_INVALID');
  if (request.protocol_version !== '1.0.0'
    || request.review_mode !== 'independent_source_first'
    || !Array.isArray(request.source_first_targets)
    || typeof request.review_target_digest !== 'string'
    || !Array.isArray(submittedReviewBody.target_assessments)
    || !Array.isArray(submittedReviewBody.findings)) {
    throw new TypeError('INDEPENDENT_REVIEW_ACTION_INVALID');
  }
  return {
    protocol_version: request.protocol_version,
    status: 'completed',
    review_mode: request.review_mode,
    reviewer_identity: structuredClone(request.reviewer_identity),
    source_first_targets: structuredClone(request.source_first_targets),
    review_target_digest: request.review_target_digest,
    target_assessments: structuredClone(submittedReviewBody.target_assessments),
    findings: structuredClone(submittedReviewBody.findings)
  };
}

/**
 * Construct the exact private event for one action advertised by a validated
 * runner reply. Protocol IDs and digests are copied or compiler-derived; the
 * Adapter supplies only the user's semantic answer, safe artifact input, or
 * execution choice.
 * @param {unknown} submittedReply @param {unknown} submittedRequest
 */
export function constructV4Action(submittedReply, submittedRequest) {
  const reply = validatedReply(submittedReply);
  const request = /** @type {Record<string,any>} */ (
    record(submittedRequest) ? structuredClone(submittedRequest) : {}
  );
  if (typeof request.action !== 'string') throw new TypeError('V4_ACTION_REQUEST_INVALID');
  if (reply.semantic_presentation) {
    return semanticAction(reply.semantic_presentation, request);
  }
  if (reply.status === 'need_artifact' && reply.phase === 'source_acquisition'
    && Array.isArray(reply.artifact_requests)) {
    return sourceAction(reply, request);
  }
  if (reply.execution_presentation) {
    return executionAction(reply.execution_presentation, request);
  }
  throw new TypeError('V4_ACTION_NOT_ADVERTISED');
}
