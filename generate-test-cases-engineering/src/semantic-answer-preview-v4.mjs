import path from 'node:path';

import previewSchema from '../skill/generate-test-cases/scripts/schemas/semantic-answer-preview.schema.json' with { type: 'json' };
import replySchema from '../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { constructV4Action } from './agent-action-adapter-v4.mjs';
import { canonicalStringify, digest } from './canonical.mjs';
import { normalizeDecisionMessageV4 } from './decision-record.mjs';
import {
  acceptedPath, acquireRunLock, atomicWriteJson, readJsonIfPresent, stagingPath
} from './run-store.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { sourceByteDigest } from './source-canonicalization.mjs';
import {
  isPreviewRequiredV4RunIdentity, isSupportedV4RunIdentity,
  PREVIEW_REQUIRED_V4_RUN_COMPILER_VERSION,
  PREVIEW_REQUIRED_V4_RUN_SCHEMA_VERSION
} from './v4-run-contract.mjs';

const CONTRACT_VERSION = 'semantic-answer-preview/v1';
const POLICY_PATH = 'derived/semantic-answer-policy.json';

class PreviewContractError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.name = 'PreviewContractError';
    this.code = code;
  }
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value */
function sha256(value) {
  return `sha256:${digest(value)}`;
}

/** @param {string} value */
function messageDigest(value) {
  return sourceByteDigest(new TextEncoder().encode(value));
}

/**
 * Deterministic defence for confirmations that explicitly request a different
 * value, scope, or authority. This does not claim to understand agreement;
 * the caller still supplies `decision` from the user's real intent.
 * @param {string} message @param {Record<string, any>} preview
 */
function confirmationChangesPreparedContent(message, preview) {
  const normalized = message.normalize('NFC').toLocaleLowerCase('und');
  if (/(?:但|同时|并且|and|but).{0,24}(?:改为|改成|修改|变更|调整|扩大|缩小|replace|change|expand|narrow)/u.test(normalized)
    || /(?:改为|改成|扩大|缩小|change|replace|expand|narrow).{0,24}(?:答案|值|口径|范围|scope|final|temporary|最终|暂定)?/u.test(normalized)) {
    return true;
  }
  const answers = preview.targets.filter(
    (/** @type {any} */ target) => target.action === 'answer_question_part'
  );
  if (/(?:最终|final)/u.test(normalized)
    && answers.some((/** @type {any} */ target) => target.evidence_level !== 'E3')) return true;
  if (/(?:暂定|临时|temporary)/u.test(normalized)
    && answers.some((/** @type {any} */ target) => target.evidence_level === 'E3')) return true;
  return false;
}

/** @param {unknown} value @param {string} definition @param {string} code */
function requireSchema(value, definition, code) {
  const diagnostics = validateAgainstSchema(value, {
    $defs: previewSchema.$defs, $ref: `#/$defs/${definition}`
  });
  if (diagnostics.length) throw new PreviewContractError(code, diagnostics[0].message);
  return /** @type {Record<string, any>} */ (value);
}

/** @param {unknown} value @param {string} code */
function requireSourcePack(value, code) {
  const diagnostics = validateAgainstSchema(value, sourcePackSchema);
  if (diagnostics.length) throw new PreviewContractError(code, diagnostics[0].message);
  return /** @type {Record<string, any>} */ (value);
}

/** @param {string} runDirectory */
const policyPath = (runDirectory) => path.join(runDirectory, POLICY_PATH);
/** @param {string} runDirectory */
const previewRoot = (runDirectory) => path.join(runDirectory, 'derived', 'semantic-answer-previews');
/** @param {string} runDirectory */
const activePreviewPath = (runDirectory) => path.join(previewRoot(runDirectory), 'active.json');
/** @param {string} runDirectory @param {string} previewId */
const storedPreviewPath = (runDirectory, previewId) => path.join(previewRoot(runDirectory), 'by-id', `${previewId}.json`);
/** @param {string} runDirectory @param {string} previewId */
const candidateSourcePath = (runDirectory, previewId) => path.join(previewRoot(runDirectory), 'by-id', `${previewId}.source-pack.json`);
/** @param {string} runDirectory @param {string} previewId */
const receiptPath = (runDirectory, previewId) => path.join(
  runDirectory, 'transactions', 'semantic-answer-preview-appends', `${previewId}.json`
);
/** @param {string} runDirectory @param {string} filename */
const auditPath = (runDirectory, filename) => path.join(
  runDirectory, 'transactions', 'semantic-answer-previews', `${filename}.json`
);

/** @param {string} runDirectory @param {string} target @param {unknown} value @param {string} code */
async function writeImmutable(runDirectory, target, value, code) {
  const existing = await readJsonIfPresent(runDirectory, target);
  if (existing) {
    if (canonicalStringify(existing.value) !== canonicalStringify(value)) {
      throw new PreviewContractError(code, 'Compiler-owned preview content conflicts with the durable record.');
    }
    return;
  }
  await atomicWriteJson(runDirectory, target, value);
}

/** @param {Record<string, any>} preview */
function previewPreimage(preview) {
  const value = structuredClone(preview);
  delete value.preview_id;
  delete value.preview_digest;
  return value;
}

/** @param {Record<string, any>} stored */
function storedPreimage(stored) {
  const value = structuredClone(stored);
  delete value.content_digest;
  return value;
}

/** @param {any} reply @param {string} code @param {string} summary */
function annotatedRunnerReply(reply, code, summary) {
  if (reply?.status === 'need_user_answers' && reply.semantic_presentation) {
    const annotated = structuredClone(reply);
    annotated.incomplete_reason = { code, summary };
    annotated.user_next_steps = [{
      action: 'revise_semantic_answer_preview',
      description: '修正预览输入或重新读取当前问题批次后再次准备预览。'
    }];
    annotated.recovery = {
      mode: 'retry_current_run',
      description: 'accepted 业务修订未改变；重新读取当前 presentation 后重试。'
    };
    if (validateAgainstSchema(annotated, replySchema).length === 0) return annotated;
  }
  if (reply?.status === 'cancelled' || reply?.status === 'fatal') return structuredClone(reply);
  return {
    status: 'fatal',
    diagnostics: [{ category: 'reference', code, message: summary }]
  };
}

/** @param {any} reply @param {string} code @param {string} summary */
function notPrepared(reply, code, summary) {
  const result = { kind: 'not_prepared', runner_reply: annotatedRunnerReply(reply, code, summary) };
  requireSchema(result, 'previewReply', 'PREVIEW_INTEGRITY_ERROR');
  return result;
}

/** @param {string} runDirectory */
async function currentRunnerReply(runDirectory) {
  const { advanceStrict } = await import('./advance-strict.mjs');
  return advanceStrict(runDirectory);
}

/** @param {string} runDirectory @param {string} expectedPresentationId */
async function currentContext(runDirectory, expectedPresentationId) {
  const runSnapshot = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'run-instance.json'));
  const run = runSnapshot?.value;
  if (!isPreviewRequiredV4RunIdentity(run) || typeof run.run_id !== 'string') {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'A valid immutable V4 run identity is required.');
  }
  const policySnapshot = await readJsonIfPresent(runDirectory, policyPath(runDirectory));
  if (!policySnapshot) {
    throw new PreviewContractError(
      'PREVIEW_INPUT_INVALID', 'This existing V4 run is not enrolled in the preview-required contract.'
    );
  }
  const policy = requireSchema(policySnapshot.value, 'policyMarker', 'PREVIEW_INTEGRITY_ERROR');
  if (policy.run_id !== run.run_id || policy.run_schema_version !== run.schema_version
    || policy.compiler_version !== run.compiler_version) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Preview policy belongs to another run.');
  }
  const checkpointSnapshot = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'checkpoint.json'));
  const checkpoint = checkpointSnapshot?.value;
  const presentation = checkpoint?.clarification_state?.presentation;
  if (!checkpointSnapshot || !record(checkpoint) || checkpoint.schema_version !== '4.0.0'
    || checkpoint.run_id !== run.run_id || !Number.isSafeInteger(checkpoint.revision)
    || !record(presentation) || presentation.presentation_id !== expectedPresentationId) {
    throw new PreviewContractError('PREVIEW_TARGET_STALE', 'The displayed presentation is no longer current.');
  }
  const sourceSnapshot = await readJsonIfPresent(
    runDirectory, acceptedPath(runDirectory, checkpoint.revision, 'source_pack')
  );
  const source = requireSourcePack(sourceSnapshot?.value, 'PREVIEW_INTEGRITY_ERROR');
  if (source.run_instance_id !== run.run_id || source.source_revision !== checkpoint.revision) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Accepted Source Pack is not bound to the checkpoint.');
  }
  return {
    run, policy, checkpoint, presentation, source,
    checkpoint_digest: `sha256:${checkpointSnapshot.digest}`
  };
}

/** @param {Record<string, any>} source @param {Record<string, any>[]} events @param {string} normalizedMessage */
function sourceCandidate(source, events, normalizedMessage) {
  const candidate = structuredClone(source);
  candidate.source_revision += 1;
  candidate.clarification_events.push(...structuredClone(events));
  const answerEvents = events.filter((/** @type {any} */ event) => event.event_type === 'answer_question_part');
  if (answerEvents.length === 0) return requireSourcePack(candidate, 'PREVIEW_INPUT_INVALID');
  const selectedSource = candidate.sources[0];
  if (!record(selectedSource?.semantic_projection)
    || !Array.isArray(selectedSource.semantic_projection.structure)) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'No canonical source can own the user statement.');
  }
  const review = candidate.source_reviews.find(
    (/** @type {any} */ item) => item.source_id === selectedSource.source_id
  );
  if (!review || !Array.isArray(review.units)) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'The user-statement source review is missing.');
  }
  let answerOrdinal = candidate.clarification_events.filter(
    (/** @type {any} */ event) => event.event_type === 'answer_question_part'
  ).length - answerEvents.length;
  /** @type {Record<string, any>[]} */
  const newLocators = [];
  for (const event of answerEvents) {
    answerOrdinal += 1;
    const identity = event.event_id.slice('EVENT-'.length);
    const unit = {
      unit_id: `UNIT-answer-${identity}`,
      text: normalizedMessage,
      type: 'user_statement',
      presentation_id: event.presentation_id,
      message_digest: event.answer_origin.message_digest,
      answer_span: {
        start: event.answer_origin.answer_span.start_scalar,
        end: event.answer_origin.answer_span.end_scalar
      }
    };
    selectedSource.semantic_projection.structure.push(unit);
    review.units.push({
      unit_id: unit.unit_id,
      content_digest: messageDigest(normalizedMessage),
      classification: 'non_normative'
    });
    newLocators.push({
      locator_id: `LOC-answer-${identity}`,
      source_id: selectedSource.source_id,
      semantic_digest: 'sha256:' + '0'.repeat(64),
      type: 'user_statement',
      unit_id: unit.unit_id,
      excerpt: event.answer,
      excerpt_digest: event.answer_origin.answer_span.excerpt_digest,
      domain: 'business',
      field_path: `/clarification_answers/${answerOrdinal - 1}`,
      presentation_id: event.presentation_id,
      message_digest: event.answer_origin.message_digest,
      answer_span: {
        start: event.answer_origin.answer_span.start_scalar,
        end: event.answer_origin.answer_span.end_scalar
      }
    });
  }
  const semanticDigest = sha256(selectedSource.semantic_projection);
  selectedSource.semantic_digest = semanticDigest;
  review.semantic_digest = semanticDigest;
  for (const locator of candidate.locators) {
    if (locator.source_id === selectedSource.source_id) locator.semantic_digest = semanticDigest;
  }
  for (const locator of newLocators) locator.semantic_digest = semanticDigest;
  candidate.locators.push(...newLocators);
  return requireSourcePack(candidate, 'PREVIEW_INPUT_INVALID');
}

/** @param {any} event */
function adoptedNature(event) {
  if (event.event_type !== 'answer_question_part') return {
    resolution: null, authority: null, evidence_level: null,
    label: event.event_type === 'defer_question_part' ? 'deferred'
      : event.event_type === 'mark_question_unknown' ? 'unknown' : 'closed_for_delivery'
  };
  if (event.answer_origin.type === 'authorized_confirmation' && event.resolution === 'final') {
    return {
      resolution: 'final', authority: 'product_final', evidence_level: 'E3',
      label: 'scope_final_E3'
    };
  }
  return {
    resolution: 'temporary', authority: event.answer_origin.type === 'authorized_confirmation'
      ? 'product_final' : 'task_scoped', evidence_level: 'E1', label: 'temporary_E1'
  };
}

/** @param {any} event */
function eventQuestionTarget(event) {
  if (event?.event_type === 'request_delivery') {
    const target = Array.isArray(event.question_part_refs) ? event.question_part_refs[0] : null;
    return record(target) ? target : {};
  }
  return event;
}

/** @param {any} checkpoint @param {Record<string, any>[]} events */
function projectedRetainedItems(checkpoint, events) {
  const states = checkpoint.clarification_state.root_states.map(
    (/** @type {any} */ state) => structuredClone(state)
  );
  for (const event of events) {
    const target = eventQuestionTarget(event);
    const state = states.find((/** @type {any} */ item) => item.root_issue_id === target.root_issue_id);
    if (!state) continue;
    if (event.event_type === 'answer_question_part') {
      state.status = adoptedNature(event).resolution === 'final' ? 'resolved_final' : 'resolved_temporary';
    } else if (event.event_type === 'defer_question_part') state.status = 'deferred_by_user';
    else if (event.event_type === 'mark_question_unknown') state.status = 'unknown_by_user';
    else if (event.event_type === 'request_delivery') state.status = 'closed_for_delivery';
  }
  /** @param {string[]} status */
  const ids = (status) => states.filter((/** @type {any} */ state) => status.includes(state.status))
    .map((/** @type {any} */ state) => state.question_part_id).sort();
  return {
    pending_part_ids: ids(['presented']),
    deferred_part_ids: ids(['deferred_by_user']),
    unknown_part_ids: ids(['unknown_by_user']),
    closed_for_delivery_part_ids: ids(['closed_for_delivery'])
  };
}

/** @param {any} context @param {Record<string, any>} request */
function prepareCandidate(context, request) {
  const normalizedMessage = normalizeDecisionMessageV4(request.user_message);
  const normalizedRequests = /** @type {Record<string, any>[]} */ (
    request.requests.map((/** @type {any} */ item) => structuredClone(item))
  );
  for (const item of normalizedRequests) {
    if (item.action === 'answer_question_part' && item.user_message !== request.user_message) {
      throw new PreviewContractError('PREVIEW_CONTENT_CHANGED', 'Every answer must bind the complete outer user message.');
    }
  }
  normalizedRequests.sort((/** @type {any} */ left, /** @type {any} */ right) => left.question_part_id.localeCompare(right.question_part_id)
    || left.action.localeCompare(right.action));
  const targets = new Set();
  for (const item of normalizedRequests) {
    if (targets.has(item.question_part_id)) {
      throw new PreviewContractError('PREVIEW_INPUT_INVALID', 'One question part can have only one action in a batch.');
    }
    targets.add(item.question_part_id);
  }
  const currentReply = {
    status: 'need_user_answers', phase: context.presentation.phase, run_id: context.run.run_id,
    produced_artifacts: [],
    incomplete_reason: { code: 'SEMANTIC_GAP', summary: 'Semantic decisions remain.' },
    user_next_steps: [{ action: 'answer_question_part', description: 'Answer the current question batch.' }],
    recovery: { mode: 'append_clarification_event', description: 'Resume from the committed checkpoint.' },
    semantic_presentation: structuredClone(context.presentation), non_blocking_diagnostics: []
  };
  if (validateAgainstSchema(currentReply, replySchema).length) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Current semantic presentation cannot form a runner reply.');
  }
  let events;
  try {
    events = normalizedRequests.map(
      (/** @type {any} */ item) => constructV4Action(currentReply, item)
    ).sort((/** @type {any} */ left, /** @type {any} */ right) => String(eventQuestionTarget(left).question_part_id ?? '').localeCompare(String(eventQuestionTarget(right).question_part_id ?? ''))
      || left.event_type.localeCompare(right.event_type));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'V4_ACTION_REQUEST_INVALID';
    throw new PreviewContractError(
      message === 'V4_ACTION_NOT_ADVERTISED' ? 'PREVIEW_TARGET_STALE' : 'PREVIEW_INPUT_INVALID',
      message
    );
  }
  const candidate = sourceCandidate(context.source, events, normalizedMessage);
  const roots = new Map(context.checkpoint.semantic_gap_ledger.map(
    (/** @type {any} */ root) => [root.root_issue_id, root]
  ));
  const parts = new Map(context.presentation.question_parts.map(
    (/** @type {any} */ part) => [part.question_part_id, part]
  ));
  const previewTargets = events.map((/** @type {any} */ event) => {
    const target = eventQuestionTarget(event);
    const part = parts.get(target.question_part_id);
    const root = roots.get(target.root_issue_id);
    if (!part || !root || target.root_version_digest !== root.root_version_digest) {
      throw new PreviewContractError('PREVIEW_TARGET_STALE', 'A batch target no longer matches the current semantic root.');
    }
    const nature = adoptedNature(event);
    return {
      action: event.event_type,
      question_part_id: target.question_part_id,
      root_issue_id: target.root_issue_id,
      root_version_digest: target.root_version_digest,
      question: part.question,
      business_scope: root.scope_ref,
      original_answer: event.event_type === 'answer_question_part' ? event.answer : null,
      resolution: nature.resolution,
      authority: nature.authority,
      evidence_level: nature.evidence_level,
      message_digest: messageDigest(normalizedMessage),
      answer_span: event.event_type === 'answer_question_part'
        ? structuredClone(event.answer_origin.answer_span) : null
    };
  });
  const reanalyze = previewTargets.map((/** @type {any} */ target) => {
    const root = roots.get(target.root_issue_id);
    return {
      business_scope: target.business_scope,
      reason: context.presentation.phase === 'requirements_analysis'
        ? 'Apply the accepted rule before Behavior Views, formal Test Points, Cases, and official outputs are generated.'
        : 'Recompile the affected existing model, formal Test Points, Cases, and official outputs after apply.',
      known_fact_ids: [...(root.subject_fact_ids ?? [])].sort(),
      known_test_point_ids: [...(root.affected_test_point_ids ?? [])].sort(),
      known_case_ids: []
    };
  });
  const preimage = {
    contract_version: CONTRACT_VERSION,
    status: 'prepared',
    run_binding: {
      run_id: context.run.run_id,
      accepted_revision: context.checkpoint.revision,
      checkpoint_digest: context.checkpoint_digest
    },
    presentation_binding: {
      presentation_id: context.presentation.presentation_id,
      cycle_digest: context.presentation.cycle_digest,
      phase: context.presentation.phase
    },
    input_summary: {
      message_digest: messageDigest(normalizedMessage),
      request_count: events.length,
      actions: events.map((/** @type {any} */ event) => event.event_type),
      authority_policy: "apply confirmation preserves the answer's adopted authority and resolution"
    },
    targets: previewTargets,
    determinate_changes: previewTargets.map((/** @type {any} */ target) => ({
      kind: target.action === 'answer_question_part' ? 'business_rule' : 'question_control',
      question_part_id: target.question_part_id,
      business_scope: target.business_scope,
      adopted_value: target.original_answer ?? target.action,
      adopted_nature: target.action === 'answer_question_part'
        ? target.evidence_level === 'E3' ? 'scope_final_E3' : 'temporary_E1'
        : target.action === 'defer_question_part' ? 'deferred'
        : target.action === 'mark_question_unknown' ? 'unknown' : 'closed_for_delivery'
    })),
    reanalyze_after_apply: reanalyze,
    retained_items: projectedRetainedItems(context.checkpoint, events),
    available_actions: ['apply', 'revise', 'cancel_preview'],
    recovery: {
      mode: 'commit_semantic_answer_preview',
      description: 'Apply, revise, or cancel this exact digest-bound preview; prepare and cancellation do not change accepted business facts.'
    }
  };
  const identity = digest(preimage);
  const preview = {
    contract_version: preimage.contract_version,
    preview_id: `SAP-${identity}`,
    preview_digest: `sha256:${identity}`,
    status: preimage.status,
    run_binding: preimage.run_binding,
    presentation_binding: preimage.presentation_binding,
    input_summary: preimage.input_summary,
    targets: preimage.targets,
    determinate_changes: preimage.determinate_changes,
    reanalyze_after_apply: preimage.reanalyze_after_apply,
    retained_items: preimage.retained_items,
    available_actions: preimage.available_actions,
    recovery: preimage.recovery
  };
  requireSchema(preview, 'semanticAnswerPreview', 'PREVIEW_INTEGRITY_ERROR');
  const recordBase = {
    contract_version: CONTRACT_VERSION,
    preview,
    prepared_request: {
      presentation_id: request.presentation_id,
      user_message: normalizedMessage,
      requests: normalizedRequests
    },
    request_digest: sha256({
      presentation_id: request.presentation_id,
      user_message: normalizedMessage,
      requests: normalizedRequests
    }),
    candidate_source_pack_digest: sha256(candidate),
    event_ids: events.map((/** @type {any} */ event) => event.event_id)
  };
  const stored = { ...recordBase, content_digest: sha256(recordBase) };
  requireSchema(stored, 'storedPreview', 'PREVIEW_INTEGRITY_ERROR');
  return { preview, stored, candidate };
}

/** @param {string} runDirectory @param {any} entry @param {string} suffix */
async function writeAudit(runDirectory, entry, suffix) {
  requireSchema(entry, 'auditEntry', 'PREVIEW_INTEGRITY_ERROR');
  await writeImmutable(
    runDirectory, auditPath(runDirectory, `${entry.preview_id}-${suffix}`), entry,
    'PREVIEW_INTEGRITY_ERROR'
  );
}

/**
 * Enrol a newly compiler-created V4 Case Document run in the preview-required
 * answer contract. Existing directories are never upgraded by this helper.
 * @param {string} runDirectory @param {string} runId
 */
export async function initializeSemanticAnswerPreviewPolicyV4(runDirectory, runId) {
  const marker = {
    contract_version: CONTRACT_VERSION,
    schema_version: '1.0.0',
    compiler_version: PREVIEW_REQUIRED_V4_RUN_COMPILER_VERSION,
    run_schema_version: PREVIEW_REQUIRED_V4_RUN_SCHEMA_VERSION,
    compatible_artifact_schema_versions: ['4.0.0'],
    run_id: runId,
    mode: 'preview_required'
  };
  requireSchema(marker, 'policyMarker', 'PREVIEW_INTEGRITY_ERROR');
  await writeImmutable(runDirectory, policyPath(runDirectory), marker, 'PREVIEW_INTEGRITY_ERROR');
  return structuredClone(marker);
}

/**
 * Prepare a compiler-owned semantic answer/control batch without changing any
 * accepted Source Pack, Decision, checkpoint revision, or canonical output.
 * @param {string} runDirectory @param {unknown} submittedRequest
 */
export async function prepareSemanticAnswerBatchV4(runDirectory, submittedRequest) {
  const runnerReply = await currentRunnerReply(runDirectory);
  if (runnerReply?.status !== 'need_user_answers' || !runnerReply.semantic_presentation) {
    return notPrepared(
      runnerReply, 'PREVIEW_TARGET_STALE', 'A current semantic question presentation is required.'
    );
  }
  let release = null;
  try {
    const request = requireSchema(
      structuredClone(submittedRequest), 'prepareRequest', 'PREVIEW_INPUT_INVALID'
    );
    if (request.presentation_id !== runnerReply.semantic_presentation.presentation_id) {
      throw new PreviewContractError('PREVIEW_TARGET_STALE', 'The requested presentation is stale.');
    }
    release = await acquireRunLock(runDirectory);
    const context = await currentContext(runDirectory, request.presentation_id);
    const prepared = prepareCandidate(context, request);
    const existingActive = await readJsonIfPresent(runDirectory, activePreviewPath(runDirectory));
    if (existingActive) {
      const pointer = requireSchema(existingActive.value, 'previewPointer', 'PREVIEW_INTEGRITY_ERROR');
      if (pointer.state === 'active' && pointer.preview_id !== prepared.preview.preview_id) {
        await writeAudit(runDirectory, {
          contract_version: CONTRACT_VERSION,
          event: 'superseded',
          preview_id: pointer.preview_id,
          preview_digest: pointer.preview_digest,
          base_revision: context.checkpoint.revision,
          related_preview_id: prepared.preview.preview_id,
          confirmation_message: null,
          confirmation_message_digest: null,
          runner_reply_digest: null
        }, `superseded-by-${prepared.preview.preview_id}`);
      }
    }
    await writeImmutable(
      runDirectory, candidateSourcePath(runDirectory, prepared.preview.preview_id), prepared.candidate,
      'PREVIEW_INTEGRITY_ERROR'
    );
    await writeImmutable(
      runDirectory, storedPreviewPath(runDirectory, prepared.preview.preview_id), prepared.stored,
      'PREVIEW_INTEGRITY_ERROR'
    );
    await atomicWriteJson(runDirectory, activePreviewPath(runDirectory), {
      contract_version: CONTRACT_VERSION,
      preview_id: prepared.preview.preview_id,
      preview_digest: prepared.preview.preview_digest,
      state: 'active'
    });
    await writeAudit(runDirectory, {
      contract_version: CONTRACT_VERSION,
      event: 'prepared',
      preview_id: prepared.preview.preview_id,
      preview_digest: prepared.preview.preview_digest,
      base_revision: context.checkpoint.revision,
      related_preview_id: null,
      confirmation_message: null,
      confirmation_message_digest: null,
      runner_reply_digest: null
    }, 'prepared');
    return { kind: 'prepared', value: structuredClone(prepared.preview) };
  } catch (error) {
    const code = error instanceof PreviewContractError ? error.code : 'PREVIEW_INTEGRITY_ERROR';
    const message = error instanceof Error ? error.message : 'Semantic answer preview failed.';
    return notPrepared(runnerReply, code, message);
  } finally {
    if (release) await release();
  }
}

/** @param {string} runDirectory @param {string} previewId */
async function loadStoredPreview(runDirectory, previewId) {
  const snapshot = await readJsonIfPresent(runDirectory, storedPreviewPath(runDirectory, previewId));
  const stored = requireSchema(snapshot?.value, 'storedPreview', 'PREVIEW_INTEGRITY_ERROR');
  if (stored.content_digest !== sha256(storedPreimage(stored))) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Stored preview content digest is invalid.');
  }
  if (stored.request_digest !== sha256(stored.prepared_request)
    || stored.preview.input_summary.message_digest !== messageDigest(stored.prepared_request.user_message)
    || stored.preview.targets.some(
      (/** @type {any} */ target) => target.message_digest !== stored.preview.input_summary.message_digest
    )) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Stored preview input provenance is invalid.');
  }
  const previewIdentity = digest(previewPreimage(stored.preview));
  if (stored.preview.preview_id !== previewId
    || stored.preview.preview_id !== `SAP-${previewIdentity}`
    || stored.preview.preview_digest !== `sha256:${previewIdentity}`) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Stored preview identity is invalid.');
  }
  const candidateSnapshot = await readJsonIfPresent(runDirectory, candidateSourcePath(runDirectory, previewId));
  const candidate = requireSourcePack(candidateSnapshot?.value, 'PREVIEW_INTEGRITY_ERROR');
  if (stored.candidate_source_pack_digest !== sha256(candidate)) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Stored preview candidate digest is invalid.');
  }
  const appendedEventIds = candidate.clarification_events
    .slice(candidate.clarification_events.length - stored.event_ids.length)
    .map((/** @type {any} */ event) => event.event_id);
  if (canonicalStringify(appendedEventIds) !== canonicalStringify(stored.event_ids)) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Stored preview event batch is invalid.');
  }
  return { stored, candidate };
}

/** @param {any} receipt @param {any} stored */
function validateReceipt(receipt, stored) {
  if (receipt.preview_id !== stored.preview.preview_id
    || receipt.preview_digest !== stored.preview.preview_digest
    || receipt.confirmation_message_digest !== messageDigest(receipt.confirmation_message)
    || receipt.base_revision !== stored.preview.run_binding.accepted_revision
    || receipt.target_revision !== receipt.base_revision + 1
    || canonicalStringify(receipt.event_ids) !== canonicalStringify(stored.event_ids)) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Apply receipt bindings are invalid.');
  }
  if ((receipt.state === 'confirmed' && receipt.runner_reply_digest !== null)
    || (receipt.state === 'applied' && receipt.runner_reply_digest === null)) {
    throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Apply receipt state is inconsistent.');
  }
  return receipt;
}

/** @param {string} runDirectory @param {any} stored @param {any} candidate @param {any} runnerReply */
async function acceptedBatchApplied(runDirectory, stored, candidate, runnerReply) {
  const targetRevision = stored.preview.run_binding.accepted_revision + 1;
  const accepted = await readJsonIfPresent(
    runDirectory, acceptedPath(runDirectory, targetRevision, 'source_pack')
  );
  if (!accepted?.value || accepted.value.source_revision !== targetRevision) return false;
  const eventIds = accepted.value.clarification_events.map((/** @type {any} */ event) => event.event_id);
  const acceptedSemanticInput = {
    ...accepted.value,
    decision_records: structuredClone(candidate.decision_records)
  };
  return stored.candidate_source_pack_digest === sha256(acceptedSemanticInput)
    && stored.event_ids.every((/** @type {string} */ eventId) => eventIds.includes(eventId))
    && runnerReply?.run_id === stored.preview.run_binding.run_id;
}

/** @param {string} runDirectory @param {any} stored @param {any} receipt @param {any} pointer @param {any} runnerReply */
async function finalizeApplied(runDirectory, stored, receipt, pointer, runnerReply) {
  await writeAudit(runDirectory, {
    contract_version: CONTRACT_VERSION,
    event: 'confirmed',
    preview_id: receipt.preview_id,
    preview_digest: receipt.preview_digest,
    base_revision: receipt.base_revision,
    related_preview_id: null,
    confirmation_message: receipt.confirmation_message,
    confirmation_message_digest: receipt.confirmation_message_digest,
    runner_reply_digest: null
  }, 'confirmed');
  const applied = receipt.state === 'applied' ? receipt : {
    ...receipt,
    state: 'applied',
    runner_reply_digest: sha256(runnerReply)
  };
  if (receipt.state !== 'applied') {
    await atomicWriteJson(runDirectory, receiptPath(runDirectory, receipt.preview_id), applied);
  }
  if (pointer.preview_id === receipt.preview_id && pointer.preview_digest === receipt.preview_digest) {
    await atomicWriteJson(runDirectory, activePreviewPath(runDirectory), { ...pointer, state: 'applied' });
  }
  await writeAudit(runDirectory, {
    contract_version: CONTRACT_VERSION,
    event: 'applied',
    preview_id: receipt.preview_id,
    preview_digest: receipt.preview_digest,
    base_revision: receipt.base_revision,
    related_preview_id: null,
    confirmation_message: receipt.confirmation_message,
    confirmation_message_digest: receipt.confirmation_message_digest,
    runner_reply_digest: applied.runner_reply_digest
  }, 'applied');
}

/**
 * Apply, revise, or cancel one exact prepared preview. Apply stages one Source
 * Pack append and delegates the accepted revision to the existing V4 runner.
 * @param {string} runDirectory @param {unknown} submittedRequest
 */
export async function commitSemanticAnswerBatchV4(runDirectory, submittedRequest) {
  let runnerReply = await currentRunnerReply(runDirectory);
  let release = null;
  let request;
  let prepared;
  try {
    if (!record(submittedRequest)
      || typeof submittedRequest.confirmation_message !== 'string'
      || !normalizeDecisionMessageV4(submittedRequest.confirmation_message).trim()) {
      throw new PreviewContractError('PREVIEW_CONFIRMATION_REQUIRED', 'A real confirmation message is required.');
    }
    request = requireSchema(
      structuredClone(submittedRequest), 'commitRequest', 'PREVIEW_INPUT_INVALID'
    );
    const confirmationMessage = normalizeDecisionMessageV4(request.confirmation_message);
    release = await acquireRunLock(runDirectory);
    prepared = await loadStoredPreview(runDirectory, request.preview_id);
    const pointerSnapshot = await readJsonIfPresent(runDirectory, activePreviewPath(runDirectory));
    const pointer = requireSchema(pointerSnapshot?.value, 'previewPointer', 'PREVIEW_INTEGRITY_ERROR');
    const existingReceiptSnapshot = await readJsonIfPresent(runDirectory, receiptPath(runDirectory, request.preview_id));
    const existingReceipt = existingReceiptSnapshot
      ? validateReceipt(
          requireSchema(existingReceiptSnapshot.value, 'applyReceipt', 'PREVIEW_INTEGRITY_ERROR'),
          prepared.stored
        ) : null;
    if (existingReceipt) {
      if (request.decision !== 'apply'
        || existingReceipt.preview_digest !== prepared.stored.preview.preview_digest
        || existingReceipt.confirmation_message !== confirmationMessage) {
        throw new PreviewContractError('PREVIEW_CONTENT_CHANGED', 'A replay changed the prior preview decision or confirmation.');
      }
      if (await acceptedBatchApplied(runDirectory, prepared.stored, prepared.candidate, runnerReply)) {
        await finalizeApplied(runDirectory, prepared.stored, existingReceipt, pointer, runnerReply);
        return structuredClone(runnerReply);
      }
      if (existingReceipt.state === 'applied') {
        throw new PreviewContractError('PREVIEW_INTEGRITY_ERROR', 'Applied receipt has no matching accepted revision.');
      }
    }
    if (runnerReply?.status !== 'need_user_answers' || !runnerReply.semantic_presentation) {
      throw new PreviewContractError('PREVIEW_TARGET_STALE', 'The run no longer accepts this semantic preview.');
    }
    if (pointer.preview_id !== request.preview_id || pointer.preview_digest !== prepared.stored.preview.preview_digest
      || pointer.state !== 'active') {
      throw new PreviewContractError('PREVIEW_TARGET_STALE', 'This preview is no longer the active applicable preview.');
    }
    if (request.decision === 'apply'
      && confirmationChangesPreparedContent(confirmationMessage, prepared.stored.preview)) {
      throw new PreviewContractError(
        'PREVIEW_CONTENT_CHANGED',
        'The confirmation explicitly changes the prepared value, scope, or adopted nature; prepare a revised preview.'
      );
    }
    if (request.decision === 'revise' || request.decision === 'cancel_preview') {
      const state = request.decision === 'revise' ? 'revised' : 'cancelled';
      await atomicWriteJson(runDirectory, activePreviewPath(runDirectory), { ...pointer, state });
      await writeAudit(runDirectory, {
        contract_version: CONTRACT_VERSION,
        event: state,
        preview_id: request.preview_id,
        preview_digest: pointer.preview_digest,
        base_revision: prepared.stored.preview.run_binding.accepted_revision,
        related_preview_id: null,
        confirmation_message: confirmationMessage,
        confirmation_message_digest: messageDigest(confirmationMessage),
        runner_reply_digest: sha256(runnerReply)
      }, state);
      return structuredClone(runnerReply);
    }
    if (runnerReply?.status !== 'need_user_answers'
      || runnerReply.semantic_presentation?.presentation_id
        !== prepared.stored.preview.presentation_binding.presentation_id) {
      throw new PreviewContractError('PREVIEW_TARGET_STALE', 'The preview presentation is no longer current.');
    }
    const context = await currentContext(
      runDirectory, prepared.stored.preview.presentation_binding.presentation_id
    );
    if (context.checkpoint.revision !== prepared.stored.preview.run_binding.accepted_revision
      || context.checkpoint_digest !== prepared.stored.preview.run_binding.checkpoint_digest) {
      throw new PreviewContractError('PREVIEW_TARGET_STALE', 'The accepted revision changed after preview preparation.');
    }
    const receipt = existingReceipt ?? {
      contract_version: CONTRACT_VERSION,
      preview_id: request.preview_id,
      preview_digest: prepared.stored.preview.preview_digest,
      decision: 'apply',
      confirmation_message: confirmationMessage,
      confirmation_message_digest: messageDigest(confirmationMessage),
      base_revision: context.checkpoint.revision,
      target_revision: context.checkpoint.revision + 1,
      event_ids: [...prepared.stored.event_ids],
      state: 'confirmed',
      runner_reply_digest: null
    };
    requireSchema(receipt, 'applyReceipt', 'PREVIEW_INTEGRITY_ERROR');
    await atomicWriteJson(runDirectory, receiptPath(runDirectory, request.preview_id), receipt);
    await writeAudit(runDirectory, {
      contract_version: CONTRACT_VERSION,
      event: 'confirmed',
      preview_id: request.preview_id,
      preview_digest: prepared.stored.preview.preview_digest,
      base_revision: context.checkpoint.revision,
      related_preview_id: null,
      confirmation_message: confirmationMessage,
      confirmation_message_digest: messageDigest(confirmationMessage),
      runner_reply_digest: null
    }, 'confirmed');
    const stagingSnapshot = await readJsonIfPresent(runDirectory, stagingPath(runDirectory, 'source_pack'));
    if (stagingSnapshot
      && canonicalStringify(stagingSnapshot.value) !== canonicalStringify(prepared.candidate)) {
      throw new PreviewContractError('PREVIEW_CONTENT_CHANGED', 'Source Pack staging contains a different candidate.');
    }
    if (!stagingSnapshot) {
      await atomicWriteJson(runDirectory, stagingPath(runDirectory, 'source_pack'), prepared.candidate);
    }
  } catch (error) {
    const code = error instanceof PreviewContractError ? error.code : 'PREVIEW_INTEGRITY_ERROR';
    const message = error instanceof Error ? error.message : 'Semantic answer preview commit failed.';
    return annotatedRunnerReply(runnerReply, code, message);
  } finally {
    if (release) await release();
  }

  runnerReply = await currentRunnerReply(runDirectory);
  release = null;
  try {
    release = await acquireRunLock(runDirectory);
    const loaded = prepared ?? await loadStoredPreview(runDirectory, request.preview_id);
    if (await acceptedBatchApplied(runDirectory, loaded.stored, loaded.candidate, runnerReply)) {
      const receiptSnapshot = await readJsonIfPresent(runDirectory, receiptPath(runDirectory, request.preview_id));
      const receipt = validateReceipt(
        requireSchema(receiptSnapshot?.value, 'applyReceipt', 'PREVIEW_INTEGRITY_ERROR'),
        loaded.stored
      );
      const pointerSnapshot = await readJsonIfPresent(runDirectory, activePreviewPath(runDirectory));
      const pointer = requireSchema(pointerSnapshot?.value, 'previewPointer', 'PREVIEW_INTEGRITY_ERROR');
      await finalizeApplied(runDirectory, loaded.stored, receipt, pointer, runnerReply);
    }
  } catch (error) {
    return annotatedRunnerReply(
      runnerReply, 'PREVIEW_INTEGRITY_ERROR',
      error instanceof Error ? error.message : 'Applied preview receipt could not be recovered.'
    );
  } finally {
    if (release) await release();
  }
  return structuredClone(runnerReply);
}

/**
 * Gate the real V4 semantic append boundary for runs created under the new
 * preview policy. Legacy runs without a marker and non-answer controls retain
 * their original behavior.
 * @param {string} runDirectory @param {Record<string, any>} prior @param {Record<string, any>} candidate
 */
export async function semanticAnswerPreviewAppendDiagnosticsV4(runDirectory, prior, candidate) {
  const appended = Array.isArray(candidate.clarification_events)
    ? candidate.clarification_events.slice(prior.clarification_events.length) : [];
  if (!appended.some((/** @type {any} */ event) => event?.event_type === 'answer_question_part')) return [];
  /** @param {string} code @param {string} message */
  const problem = (code, message) => [{
    category: 'traceability', code, path: '/clarification_events', message
  }];
  try {
    const runSnapshot = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'run-instance.json'));
    const runIdentity = runSnapshot?.value;
    if (!isSupportedV4RunIdentity(runIdentity)) {
      return problem('PREVIEW_INTEGRITY_ERROR', 'The run identity version is unsupported for semantic answer append.');
    }
    const previewRequired = isPreviewRequiredV4RunIdentity(runIdentity);
    const policySnapshot = await readJsonIfPresent(runDirectory, policyPath(runDirectory));
    if (!policySnapshot) return previewRequired
      ? problem('PREVIEW_INTEGRITY_ERROR', 'A preview-required run is missing its immutable policy marker.')
      : [];
    if (!previewRequired) {
      return problem('PREVIEW_INTEGRITY_ERROR', 'A legacy run cannot be silently enrolled in the new preview contract.');
    }
    const policy = requireSchema(policySnapshot.value, 'policyMarker', 'PREVIEW_INTEGRITY_ERROR');
    if (policy.run_id !== prior.run_instance_id
      || policy.run_schema_version !== runIdentity.schema_version
      || policy.compiler_version !== runIdentity.compiler_version) {
      return problem('PREVIEW_INTEGRITY_ERROR', 'Preview policy run binding is invalid.');
    }
    const pointerSnapshot = await readJsonIfPresent(runDirectory, activePreviewPath(runDirectory));
    const pointer = requireSchema(pointerSnapshot?.value, 'previewPointer', 'PREVIEW_CONFIRMATION_REQUIRED');
    if (!['active', 'applied'].includes(pointer.state)) {
      return problem('PREVIEW_CONFIRMATION_REQUIRED', 'The answer batch has no active confirmed preview.');
    }
    const { stored, candidate: storedCandidate } = await loadStoredPreview(runDirectory, pointer.preview_id);
    const receiptSnapshot = await readJsonIfPresent(runDirectory, receiptPath(runDirectory, pointer.preview_id));
    const receipt = validateReceipt(
      requireSchema(receiptSnapshot?.value, 'applyReceipt', 'PREVIEW_CONFIRMATION_REQUIRED'),
      stored
    );
    if (!['confirmed', 'applied'].includes(receipt.state)
      || receipt.preview_digest !== pointer.preview_digest
      || receipt.base_revision !== prior.source_revision
      || receipt.target_revision !== candidate.source_revision
      || canonicalStringify(receipt.event_ids) !== canonicalStringify(
        appended.map((/** @type {any} */ event) => event.event_id)
      )) {
      return problem('PREVIEW_CONFIRMATION_REQUIRED', 'The answer append does not match one confirmed preview batch.');
    }
    if (canonicalStringify(stored.event_ids) !== canonicalStringify(receipt.event_ids)
      || canonicalStringify(storedCandidate) !== canonicalStringify(candidate)) {
      return problem('PREVIEW_CONTENT_CHANGED', 'The staged answer content differs from the confirmed preview.');
    }
    return [];
  } catch (error) {
    const code = error instanceof PreviewContractError ? error.code : 'PREVIEW_INTEGRITY_ERROR';
    return problem(code, error instanceof Error ? error.message : 'Preview integrity validation failed.');
  }
}
