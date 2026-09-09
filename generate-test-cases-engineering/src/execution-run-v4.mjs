import path from 'node:path';

import {
  publishExecutionPlanDeliveryV4, verifyExecutionPlanDeliveryV4
} from './canonical-delivery-v4.mjs';
import { canonicalStringify, digest } from './canonical.mjs';
import {
  applyV4ExecutionAction, createV4ExecutionPresentation,
  createV4FinalConfirmationPresentation, deriveV4ExecutionReadinessTarget,
  validateV4CapabilityReceipt, validateV4FinalConfirmationEvent,
  verifyAndRecomputeV4ExecutionReadiness
} from './execution-events.mjs';
import { compileExecutionPlanFromCaseDocument } from './execution-plan.mjs';
import { classifyFinalOutcomeV4 } from './final-outcome-v4.mjs';
import { routeGapCategoryV4 } from './gap-kinds-v4.mjs';
import {
  cancelRunV4WithHeldLock, constructCancelRunEventV4,
  replayCancelledRunV4WithHeldLock
} from './run-cancellation-v4.mjs';
import {
  ensureActiveRunLifecycleV4WithHeldLock,
  executeSemanticReopenTransactionV4,
  readCaseDocumentSemanticRootRefsV4
} from './semantic-reopen-transaction-v4.mjs';
import { AGENT_STAGE_SCHEMA } from './reply-routing.mjs';
import {
  acceptedPath, acceptedSourceRevisions, atomicWriteJson, discardStagingSnapshot, promoteArtifact, readJson, readJsonIfPresent,
  readText, readTextIfPresent, stagingPath
} from './run-store.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { createSemanticQuestionReplyV4 } from './stop-replies-v4.mjs';

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {string} runId @param {string} code @param {string} summary */
function qualityFailure(runId, code, summary) {
  const route = routeGapCategoryV4('quality_failure', { delivery_intent: 'execution_plan' });
  return {
    status: route.status, phase: 'execution_closure', result_kind: route.result_kind, run_id: runId,
    produced_artifacts: [], incomplete_reason: { code, summary },
    user_next_steps: [{ action: 'revise_artifact', description: summary }],
    recovery: {
      mode: 'resume_from_committed_checkpoint',
      description: '修正执行引用或私有执行绑定后，从最后已提交状态继续。'
    },
    non_blocking_diagnostics: []
  };
}

const EXECUTION_ACTION_DESCRIPTIONS = Object.freeze({
  set_execution_disposition: '按展示的绑定逐项选择执行或不执行。',
  provide_capability_proof: '按展示的执行根提交已登记类型的能力证明，由编译器重算 readiness。',
  reopen_semantic_question: '按展示的语义根在新的关联运行中重新确认业务问题。',
  pause_execution: '按展示的上下文暂停本次执行准备。',
  cancel_run: '按展示的运行上下文取消本次运行。'
});

/** Build the operator next-step list from actions that this exact presentation
 * actually exposes. This prevents a Conditional-only plan from advertising a
 * Grounded-only capability-proof action that cannot be constructed.
 * @param {string} runId @param {any} presentation */
export function createV4ExecutionPendingReply(runId, presentation) {
  const route = routeGapCategoryV4('execution_readiness', { delivery_intent: 'execution_plan' });
  const advertisedActions = [...new Set([
    ...(Array.isArray(presentation?.items)
      ? presentation.items.flatMap((/** @type {any} */ item) => (
          Array.isArray(item?.available_actions) ? item.available_actions : []
        )) : []),
    ...(Array.isArray(presentation?.run_actions) ? presentation.run_actions : [])
  ])];
  if (!advertisedActions.length || advertisedActions.some(
    (action) => !Object.hasOwn(EXECUTION_ACTION_DESCRIPTIONS, action)
  )) throw new TypeError('EXECUTION_PRESENTATION_ACTION_INVALID');
  if (route.status !== 'execution_plan_only') throw new TypeError('EXECUTION_GAP_ROUTE_INVALID');
  return {
    status: 'need_user_answers', phase: 'execution_closure', run_id: runId,
    produced_artifacts: [],
    incomplete_reason: {
      code: 'EXECUTION_PENDING', summary: '仍有用例尚未确定本次执行去向或执行准备尚未通过。'
    },
    user_next_steps: advertisedActions.map((action) => ({
      action, description: EXECUTION_ACTION_DESCRIPTIONS[
        /** @type {keyof typeof EXECUTION_ACTION_DESCRIPTIONS} */ (action)
      ]
    })),
    recovery: { mode: 'append', description: '把展示返回的 action_context 原样带入下一版 Source Pack 事件。' },
    non_blocking_diagnostics: [], execution_presentation: presentation
  };
}

/** @param {string} runId @param {any} presentation */
function finalConfirmationReply(runId, presentation) {
  return {
    status: 'need_user_answers', phase: 'final_confirmation', run_id: runId,
    produced_artifacts: [],
    incomplete_reason: {
      code: 'FINAL_CONFIRMATION_REQUIRED',
      summary: '执行去向已闭合，但尚未确认实际展示的这一版完整执行计划。'
    },
    user_next_steps: [
      { action: 'confirm_execution_plan', description: '确认展示的同一 source revision 与 plan digest。' },
      { action: 'cancel_run', description: '取消本次运行且不创建新的交付 manifest。' }
    ],
    recovery: {
      mode: 'append_execution_event',
      description: '把 execution_presentation 的 action_context 原样提交为确认事件。'
    },
    non_blocking_diagnostics: [], execution_presentation: presentation
  };
}

/** @param {string} runDirectory */
function finalConfirmationPath(runDirectory) {
  return path.join(runDirectory, 'state', 'execution-final-confirmation.json');
}

/** @param {any} result */
function executionPlanDigest(result) {
  return `sha256:${digest({
    case_document_ref: result.case_document_ref,
    items: result.items,
    result_kind: result.result_kind,
    runner_ready: result.runner_ready,
    runner_projection: result.runner_projection
  })}`;
}

/** @param {string} runDirectory @param {string} runId @param {number} revision @param {any} source @param {any} result */
async function commitFinalConfirmationPresentation(runDirectory, runId, revision, source, result) {
  const presentation = createV4FinalConfirmationPresentation({
    run_id: runId, source_revision: revision,
    case_document_ref: source.case_document_ref,
    result_kind: result.result_kind, runner_projection: result.runner_projection,
    plan_digest: executionPlanDigest(result)
  });
  const record = {
    schema_version: '4.0.0', compiler_version: '0.5.0', run_id: runId,
    status: 'pending', source_revision: revision,
    source_pack_digest: `sha256:${digest(source)}`,
    presentation, presentation_digest: `sha256:${digest(presentation)}`
  };
  const existing = await readJsonIfPresent(runDirectory, finalConfirmationPath(runDirectory));
  if (existing && existing.value.source_revision === revision
    && canonicalStringify(existing.value) !== canonicalStringify(record)) {
    throw new TypeError('FINAL_CONFIRMATION_STATE_CONFLICT');
  }
  if (!existing || existing.value.source_revision !== revision) {
    await atomicWriteJson(runDirectory, finalConfirmationPath(runDirectory), record);
  }
  return presentation;
}

/** @param {string} runDirectory @param {string} runId @param {any} source @param {any} result @param {any} event */
async function verifyDisplayedFinalConfirmation(runDirectory, runId, source, result, event) {
  const snapshot = await readJsonIfPresent(runDirectory, finalConfirmationPath(runDirectory));
  const record = snapshot?.value;
  if (!record || record.schema_version !== '4.0.0' || record.compiler_version !== '0.5.0'
    || record.run_id !== runId || record.status !== 'pending'
    || !Number.isSafeInteger(record.source_revision)
    || record.source_revision + 1 !== source.source_revision
    || record.source_pack_digest !== `sha256:${digest({ ...source, source_revision: record.source_revision,
      execution_events: source.execution_events.slice(0, -1) })}`
    || record.presentation_digest !== `sha256:${digest(record.presentation)}`) {
    throw new TypeError('FINAL_CONFIRMATION_NOT_DISPLAYED');
  }
  const expected = createV4FinalConfirmationPresentation({
    run_id: runId, source_revision: record.source_revision,
    case_document_ref: source.case_document_ref,
    result_kind: result.result_kind, runner_projection: result.runner_projection,
    plan_digest: executionPlanDigest(result)
  });
  if (canonicalStringify(record.presentation) !== canonicalStringify(expected)) {
    throw new TypeError('FINAL_CONFIRMATION_STALE');
  }
  validateV4FinalConfirmationEvent(expected, event);
  return record;
}

/** @param {string} runDirectory */
function catalogRunRoot(runDirectory) { return path.dirname(runDirectory); }

/** @param {string} runDirectory */
function catalogRoot(runDirectory) { return path.dirname(catalogRunRoot(runDirectory)); }

/** Resolve immutable Case Document bytes by a sibling run ID, never by an
 * Agent-provided filesystem path. @param {string} runDirectory */
function caseDocumentResolver(runDirectory) {
  return async (/** @type {any} */ ref) => {
    if (!record(ref) || typeof ref.run_id !== 'string'
      || path.basename(ref.run_id) !== ref.run_id || ref.run_id.includes(path.sep)) {
      throw new TypeError('CASE_DOCUMENT_REFERENCE_INVALID');
    }
    const documentDirectory = path.resolve(catalogRunRoot(runDirectory), ref.run_id);
    if (path.dirname(documentDirectory) !== path.resolve(catalogRunRoot(runDirectory))) {
      throw new TypeError('CASE_DOCUMENT_REFERENCE_INVALID');
    }
    const manifestPath = path.join(documentDirectory, 'output', 'current.json');
    const manifestBytes = await readText(documentDirectory, manifestPath);
    let manifest;
    try { manifest = JSON.parse(manifestBytes); } catch {
      throw new TypeError('CASE_DOCUMENT_MANIFEST_INVALID');
    }
    if (!record(manifest?.bundle) || typeof manifest.bundle.path !== 'string') {
      throw new TypeError('CASE_DOCUMENT_MANIFEST_INVALID');
    }
    const bundlePath = path.resolve(documentDirectory, manifest.bundle.path);
    if (bundlePath !== documentDirectory && !bundlePath.startsWith(`${documentDirectory}${path.sep}`)) {
      throw new TypeError('CASE_DOCUMENT_MANIFEST_INVALID');
    }
    const bundleBytes = await readText(documentDirectory, bundlePath);
    return { manifest_bytes: manifestBytes, bundle_bytes: bundleBytes };
  };
}

/** @param {string} runDirectory */
function capabilityReceiptLedgerPath(runDirectory) {
  return path.join(runDirectory, 'state', 'execution-capability-receipts.json');
}

/** @param {string} runId @param {any} caseDocumentRef @param {any[]} receipts */
function capabilityReceiptLedger(runId, caseDocumentRef, receipts) {
  const body = {
    schema_version: '4.0.0', compiler_version: '0.5.0', run_id: runId,
    case_document_ref: structuredClone(caseDocumentRef),
    receipts: receipts.map((receipt) => validateV4CapabilityReceipt(receipt, {
      case_document_ref: caseDocumentRef
    }))
  };
  return { ...body, ledger_digest: `sha256:${digest(body)}` };
}

/**
 * Persist the replay-derived receipt ledger only after its Source Pack revision
 * is durable. The file is a rebuildable compiler cache, but an existing ledger
 * must remain an exact prefix so accepted capability history cannot be rewritten.
 * @param {string} runDirectory @param {string} runId @param {any} caseDocumentRef
 * @param {any[]} receipts
 */
async function persistCapabilityReceiptLedger(runDirectory, runId, caseDocumentRef, receipts) {
  const desired = capabilityReceiptLedger(runId, caseDocumentRef, receipts);
  const existing = await readJsonIfPresent(runDirectory, capabilityReceiptLedgerPath(runDirectory));
  if (existing) {
    const value = existing.value;
    if (!record(value) || value.schema_version !== '4.0.0' || value.compiler_version !== '0.5.0'
      || value.run_id !== runId
      || canonicalStringify(value.case_document_ref) !== canonicalStringify(caseDocumentRef)
      || !Array.isArray(value.receipts)
      || value.ledger_digest !== `sha256:${digest({
        schema_version: value.schema_version, compiler_version: value.compiler_version,
        run_id: value.run_id, case_document_ref: value.case_document_ref,
        receipts: value.receipts
      })}`
      || value.receipts.length > desired.receipts.length
      || value.receipts.some((/** @type {any} */ receipt, /** @type {number} */ index) => {
        try { validateV4CapabilityReceipt(receipt, { case_document_ref: caseDocumentRef }); } catch { return true; }
        return canonicalStringify(receipt) !== canonicalStringify(desired.receipts[index]);
      })) throw new TypeError('EXECUTION_CAPABILITY_LEDGER_INVALID');
    if (canonicalStringify(value) === canonicalStringify(desired)) return desired;
  }
  await atomicWriteJson(runDirectory, capabilityReceiptLedgerPath(runDirectory), desired);
  return desired;
}

/** @param {string} runDirectory */
async function stagedSource(runDirectory) {
  const text = await readTextIfPresent(runDirectory, stagingPath(runDirectory, 'source_pack'));
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return { text, value, digest: digest(value), parse_diagnostics: [] };
  } catch {
    return {
      text, value: text, digest: digest(text),
      parse_diagnostics: [{
        category: 'schema', code: 'ARTIFACT_JSON_INVALID', path: '/',
        message: 'The staged execution Source Pack is not valid JSON.'
      }]
    };
  }
}

/** @param {string} runDirectory @param {number} revision @param {unknown} value
 * @param {any[]} diagnostics @param {string} runId
 * @param {'execution_closure'|'final_confirmation'} [phase] */
function revisionReply(
  runDirectory, revision, value, diagnostics, runId, phase = 'execution_closure'
) {
  const route = routeGapCategoryV4('adapter_revision', { delivery_intent: 'execution_plan' });
  const stable = diagnostics.map(item => ({
    category: String(item.category ?? 'adapter_revision'),
    code: String(item.code ?? 'ARTIFACT_INVALID'),
    ...(typeof item.path === 'string' ? { path: item.path } : {}),
    message: String(item.message ?? 'The execution Source Pack failed validation.')
  }));
  return {
    status: route.status, stage: 'source_pack', schema_ref: AGENT_STAGE_SCHEMA.source_pack,
    source_revision: revision, artifact_path: stagingPath(runDirectory, 'source_pack'),
    artifact_digest: digest(value), diagnostics: stable, phase, run_id: runId,
    produced_artifacts: [],
    incomplete_reason: {
      code: stable[0]?.code ?? 'ARTIFACT_INVALID',
      summary: stable[0]?.message ?? '执行 Source Pack 未通过确定性校验。'
    },
    user_next_steps: [{
      action: 'revise_artifact',
      description: '修正 execution Source Pack 后在同一运行目录重试。'
    }],
    recovery: {
      mode: 'retry_current_run',
      description: '保留已接受 execution revision，只替换未接受的 staging Source Pack。'
    },
    non_blocking_diagnostics: []
  };
}

/** @param {string} runDirectory @param {string} runId */
function sourceArtifactRequest(runDirectory, runId) {
  return {
    status: 'need_artifact', phase: 'execution_closure', run_id: runId,
    stage: 'source_pack', schema_ref: AGENT_STAGE_SCHEMA.source_pack,
    scope: { source_revision: 0, run_instance_id: runId }, diagnostics: [],
    produced_artifacts: [],
    incomplete_reason: {
      code: 'STAGE_ARTIFACT_REQUIRED',
      summary: '执行计划 sibling 仍需要绑定 Case Document 的 Source Pack。'
    },
    user_next_steps: [{
      action: 'write_stage_artifact',
      description: '写入 delivery_intent=execution_plan 的 v4 Source Pack 后重调 runner。'
    }],
    recovery: {
      mode: 'write_staging_artifact',
      description: '保留 execution run identity，在同一运行目录补齐 staging Source Pack。'
    },
    non_blocking_diagnostics: []
  };
}

/** @param {any} prior @param {any} candidate */
function appendDiagnostics(prior, candidate) {
  /** @type {any[]} */ const output = [];
  const stablePrior = structuredClone(prior); const stableCandidate = structuredClone(candidate);
  delete stablePrior.source_revision; delete stableCandidate.source_revision;
  delete stablePrior.execution_events; delete stableCandidate.execution_events;
  if (canonicalStringify(stablePrior) !== canonicalStringify(stableCandidate)) output.push({
    category: 'traceability', code: 'EXECUTION_SOURCE_IMMUTABLE_CHANGED', path: '/',
    message: 'An execution revision may append only execution events.'
  });
  const before = Array.isArray(prior.execution_events) ? prior.execution_events : [];
  const after = Array.isArray(candidate.execution_events) ? candidate.execution_events : [];
  if (after.length <= before.length || before.some((/** @type {any} */ item, /** @type {number} */ index) =>
    canonicalStringify(item) !== canonicalStringify(after[index]))) output.push({
    category: 'traceability', code: 'EXECUTION_EVENT_APPEND_INVALID', path: '/execution_events',
    message: 'Execution events must append to the exact committed prefix.'
  });
  return output;
}

/** Replay authority is the complete accepted Source Pack chain, not merely the
 * latest parsed object. Every revision must be canonical, bind its directory,
 * and append to the exact preceding event prefix.
 * @param {string} runDirectory @param {any} registry @param {string} runId */
async function acceptedExecutionHistory(runDirectory, registry, runId) {
  const revisions = await acceptedSourceRevisions(runDirectory);
  if (revisions.some((revision, index) => revision !== index)) {
    throw new TypeError('EXECUTION_HISTORY_NOT_CONTIGUOUS');
  }
  /** @type {any[]} */ const sources = [];
  for (const revision of revisions) {
    const stored = await readJson(
      runDirectory, acceptedPath(runDirectory, revision, 'source_pack')
    );
    const source = stored.value;
    const diagnostics = [
      ...validateAgainstSchema(source, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack)),
      ...validateUniqueStableIds(source)
    ];
    if (stored.text !== `${canonicalStringify(source)}\n`
      || diagnostics.length || source.run_instance_id !== runId
      || source.delivery_intent !== 'execution_plan'
      || source.source_revision !== revision) {
      throw new TypeError('EXECUTION_HISTORY_REVISION_INVALID');
    }
    const prior = sources.at(-1);
    if (prior && appendDiagnostics(prior, source).length) {
      throw new TypeError('EXECUTION_HISTORY_APPEND_INVALID');
    }
    sources.push(source);
  }
  return {
    revisions, sources,
    source: sources.at(-1) ?? null,
    revision: revisions.at(-1) ?? 0
  };
}

/** Validate a terminal execution append against the exact phase that the
 * runner previously displayed. No disposition, confirmation, binding, or
 * source field may share the cancellation revision.
 * @param {string} runDirectory @param {any} prior @param {any} candidate
 * @param {string} runId @param {number} revision
 */
async function executionCancellationAppend(runDirectory, prior, candidate, runId, revision) {
  const before = Array.isArray(prior.execution_events) ? prior.execution_events : [];
  const after = Array.isArray(candidate.execution_events) ? candidate.execution_events : [];
  const appended = after.slice(before.length);
  if (!appended.some((/** @type {any} */ event) => event?.event_type === 'cancel_run')) return null;
  if (appended.length !== 1 || appended[0]?.event_type !== 'cancel_run') {
    throw new TypeError('CANCEL_EVENT_BATCH_CONFLICT');
  }
  const snapshot = await readJsonIfPresent(runDirectory, finalConfirmationPath(runDirectory));
  const finalDisplayed = snapshot?.value?.schema_version === '4.0.0'
    && snapshot.value.run_id === runId && snapshot.value.status === 'pending'
    && snapshot.value.source_revision === revision;
  const phase = finalDisplayed ? 'final_confirmation' : 'execution_closure';
  const expectedEvent = constructCancelRunEventV4({
    run_id: runId, phase, phase_version: revision
  });
  if (canonicalStringify(appended[0]) !== canonicalStringify(expectedEvent)) {
    throw new TypeError('CANCEL_EVENT_STALE');
  }
  if (finalDisplayed && canonicalStringify(snapshot.value.presentation?.cancel_context)
    !== canonicalStringify({ run_id: runId, phase, phase_version: revision })) {
    throw new TypeError('CANCEL_EVENT_STALE');
  }
  const expected = structuredClone(prior);
  expected.source_revision = revision + 1;
  expected.execution_events = [...structuredClone(before), expectedEvent];
  if (canonicalStringify(candidate) !== canonicalStringify(expected)) {
    throw new TypeError('CANCEL_EVENT_BATCH_CONFLICT');
  }
  return expectedEvent;
}

/** @param {any} ref @param {any[]} items @param {any[]} rootRefs @param {string} runId */
function presentationState(ref, items, rootRefs, runId) {
  const caseIds = items.map(item => item.case_id);
  const executionReadinessTargets = items
    .filter((item) => item.semantic_status === 'Grounded')
    .map((item) => deriveV4ExecutionReadinessTarget(ref, item.case_id));
  const identity = {
    run_id: runId, case_document_ref: ref, case_ids: caseIds, root_refs: rootRefs,
    execution_readiness_targets: executionReadinessTargets
  };
  return {
    delivery_intent: 'execution_plan', phase: 'execution_closure', run_id: runId,
    presentation_id: `PRES-${digest(identity)}`,
    case_document_ref: structuredClone(ref), case_ids: caseIds,
    root_refs: structuredClone(rootRefs),
    execution_readiness_targets: executionReadinessTargets,
    dispositions: {}, readiness: Object.fromEntries(executionReadinessTargets.map(
      (target) => [target.root_refs[0].root_issue_id, false]
    )), capability_receipts: [], paused: false, source_revision: 0
  };
}

/** @param {any[]} items @param {any} state */
function mergedBindings(items, state) {
  const receiptsByCase = new Map();
  for (const receipt of state.capability_receipts) {
    const verified = validateV4CapabilityReceipt(receipt, {
      case_document_ref: state.case_document_ref
    });
    receiptsByCase.set(verified.case_ids[0], verified);
  }
  return items.map(item => {
    const receipt = receiptsByCase.get(item.case_id);
    return {
      case_id: item.case_id,
      disposition: state.dispositions[item.case_id] ?? 'pending',
      availability: receipt ? (receipt.ready ? 'verified' : 'unavailable') : 'unknown',
      ...(receipt ? { capability_receipt: structuredClone(receipt) } : {})
    };
  });
}

/** @param {string} runDirectory @param {number} revision @param {any} source
 * @param {any} candidate @param {string} runId @param {any} state */
async function commitExecutionCapabilityState(
  runDirectory, revision, source, candidate, runId, state
) {
  if (candidate) await promoteArtifact(runDirectory, revision, 'source_pack', source, candidate);
  await persistCapabilityReceiptLedger(
    runDirectory, runId, source.case_document_ref, state.capability_receipts
  );
}

/**
 * Advance the private execution-plan sibling. It accepts only the Source Pack
 * execution event stream plus compiler-private verified bindings; it never
 * reads the four Case-generation artifacts or mutates the referenced document.
 * @param {string} runDirectory @param {any} registry @param {any} runInstance
 * @param {unknown} lockOwnership
 */
export async function advanceExecutionRunV4Locked(
  runDirectory, registry, runInstance, lockOwnership
) {
  const runId = runInstance.run_id ?? runInstance.run_instance_id;
  if (typeof runId !== 'string') throw new TypeError('V4_RUN_ID_INVALID');
  try {
    const lifecycle = await readJsonIfPresent(
      runDirectory, path.join(runDirectory, 'state', 'lifecycle.json')
    );
    if (!lifecycle) {
      await ensureActiveRunLifecycleV4WithHeldLock(runDirectory, lockOwnership);
    } else if (lifecycle.value?.schema_version !== '4.0.0'
      || lifecycle.value.run_id !== runId
      || lifecycle.value.delivery_intent !== 'execution_plan'
      || !['active', 'superseded_by_semantic_reopen'].includes(lifecycle.value.status)) {
      throw new TypeError('RUN_LIFECYCLE_INVALID');
    }
  } catch (error) {
    return qualityFailure(
      runId, error instanceof Error ? error.message : 'RUN_LIFECYCLE_INVALID',
      '执行运行的生命周期状态无法安全恢复。'
    );
  }
  const resolver = caseDocumentResolver(runDirectory);
  let verifiedDelivery = null;
  try {
    const verified = await verifyExecutionPlanDeliveryV4(runDirectory, {
      resolve_case_document: resolver
    });
    if (verified.manifest.run_id === runId) verifiedDelivery = verified;
  } catch {
    // An accepted Source Pack remains the authority from which a missing/torn
    // derived execution delivery can be rebuilt below.
  }

  let history;
  try {
    history = await acceptedExecutionHistory(runDirectory, registry, runId);
  } catch (error) {
    return qualityFailure(
      runId, error instanceof Error ? error.message : 'RUN_INTEGRITY_ERROR',
      'Accepted execution history failed deterministic append-only validation.'
    );
  }
  const { revisions } = history;
  let { source, revision } = history;
  let appendBaseSource = null;
  let appendBaseRevision = null;
  let finalConfirmationDisplayed = false;
  let onlyFinalConfirmation = false;
  if (verifiedDelivery && !source) return qualityFailure(
    runId, 'EXECUTION_DELIVERY_HISTORY_MISSING',
    '已交付执行计划缺少可重放的 accepted execution history。'
  );

  let candidate = verifiedDelivery ? null : await stagedSource(runDirectory);
  if (candidate) {
    const expectedRevision = revisions.length ? revision + 1 : 0;
    const candidateDiagnostics = candidate.parse_diagnostics.length ? candidate.parse_diagnostics : [
      ...validateAgainstSchema(candidate.value, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack)),
      ...validateUniqueStableIds(candidate.value)
    ];
    if (candidateDiagnostics.length) return revisionReply(
      runDirectory, expectedRevision, candidate.value, candidateDiagnostics, runId
    );
    if (!record(candidate.value) || candidate.value.schema_version !== '4.0.0'
      || candidate.value.delivery_intent !== 'execution_plan'
      || candidate.value.run_instance_id !== runId) return revisionReply(
      runDirectory, expectedRevision, candidate.value, [{
        category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
        message: 'The execution Source Pack must bind this run and exact next revision.'
      }], runId
    );
    if (source && candidate.value.source_revision === revision
      && canonicalStringify(candidate.value) === canonicalStringify(source)) {
      await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
      candidate = null;
    }
    if (candidate && candidate.value.source_revision !== expectedRevision) return revisionReply(
      runDirectory, expectedRevision, candidate.value, [{
        category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
        message: 'The execution Source Pack must bind this run and exact next revision.'
      }], runId
    );
    if (candidate && source) {
      appendBaseSource = source;
      appendBaseRevision = revision;
      const differences = appendDiagnostics(source, candidate.value);
      if (differences.length) return revisionReply(
        runDirectory, expectedRevision, candidate.value, differences, runId
      );
      try {
        const cancellation = await executionCancellationAppend(
          runDirectory, source, candidate.value, runId, revision
        );
        if (cancellation) {
          await cancelRunV4WithHeldLock(runDirectory, cancellation, lockOwnership);
          return await replayCancelledRunV4WithHeldLock(
            runDirectory, runId, lockOwnership
          );
        }
      } catch (error) {
        return revisionReply(runDirectory, expectedRevision, candidate.value, [{
          category: 'traceability',
          code: error instanceof Error ? error.message : 'CANCEL_EVENT_INVALID',
          path: '/execution_events',
          message: 'Cancellation must be the sole append and bind the execution phase actually displayed.'
        }], runId);
      }
      const finalConfirmation = await readJsonIfPresent(
        runDirectory, finalConfirmationPath(runDirectory)
      );
      finalConfirmationDisplayed = finalConfirmation?.value?.schema_version === '4.0.0'
        && finalConfirmation.value.run_id === runId
        && finalConfirmation.value.status === 'pending'
        && finalConfirmation.value.source_revision === revision;
      const appendedEvents = candidate.value.execution_events.slice(source.execution_events.length);
      const exactPriorEventReplay = appendedEvents.length > 0 && appendedEvents.every(
        (/** @type {any} */ event) => source.execution_events.some(
          (/** @type {any} */ prior) => canonicalStringify(prior) === canonicalStringify(event)
        )
      );
      onlyFinalConfirmation = appendedEvents.length === 1
        && appendedEvents[0]?.event_type === 'confirm_execution_plan';
      if (finalConfirmationDisplayed && !onlyFinalConfirmation && !exactPriorEventReplay) {
        return revisionReply(runDirectory, expectedRevision, candidate.value, [{
          category: 'adapter_revision', code: 'FINAL_CONFIRMATION_ACTION_STALE',
          path: '/execution_events',
          message: 'Only the displayed final confirmation or cancellation may follow a final confirmation presentation.'
        }], runId, 'final_confirmation');
      }
    }
    if (candidate) {
      source = candidate.value;
      revision = expectedRevision;
    }
  }
  if (!source) return sourceArtifactRequest(runDirectory, runId);

  const request = {
    delivery_intent: 'execution_plan', case_document_ref: source.case_document_ref
  };
  let initial; let rootRefs;
  try {
    initial = await compileExecutionPlanFromCaseDocument(request, {
      resolve: resolver, bindings: []
    });
    rootRefs = await readCaseDocumentSemanticRootRefsV4(
      catalogRoot(runDirectory), source.case_document_ref
    );
  } catch (error) {
    const code = error instanceof Error ? error.message : 'CASE_DOCUMENT_REFERENCE_INVALID';
    return qualityFailure(runId, code.startsWith('EXECUTION_BINDING')
      ? 'EXECUTION_BINDING_INVALID' : code, '执行计划引用或受信执行绑定无法通过完整性校验。');
  }
  const state = presentationState(source.case_document_ref, initial.items, rootRefs, runId);
  state.source_revision = revision;
  const executionServices = {
    verify_and_recompute_readiness: verifyAndRecomputeV4ExecutionReadiness,
    semantic_reopen_handler: (/** @type {any} */ event) =>
      executeSemanticReopenTransactionV4(catalogRoot(runDirectory), event, {
        resolve_run_directory: (/** @type {string} */ targetRunId) =>
          path.join(catalogRoot(runDirectory), 'runs', targetRunId)
      })
  };
  const presentation = createV4ExecutionPresentation(state, executionServices);
  let stateBeforeCandidateAppend = null;
  const candidateAppendStart = candidate && appendBaseSource
    ? appendBaseSource.execution_events.length : null;
  const reopenEvents = source.execution_events.filter(
    (/** @type {any} */ event) => event.event_type === 'reopen_semantic_question'
  );
  if (verifiedDelivery && reopenEvents.length) return qualityFailure(
    runId, 'EXECUTION_DELIVERY_HISTORY_MISMATCH',
    '已交付执行计划的 accepted history 含有不可能属于完成态的语义重开事件。'
  );
  if (reopenEvents.length > 1 || (reopenEvents.length === 1
    && source.execution_events.at(-1) !== reopenEvents[0])) {
    return revisionReply(runDirectory, revision, source, [{
      category: 'adapter_revision', code: 'REOPEN_EVENT_BATCH_CONFLICT',
      path: '/execution_events',
      message: 'Semantic reopen is terminal and may occur only once as the final execution event.'
    }], runId);
  }
  if (candidate && reopenEvents.length === 1) {
    const priorEvents = revisions.length
      ? /** @type {any} */ ((await readJson(
          runDirectory, acceptedPath(runDirectory, revisions[revisions.length - 1], 'source_pack')
        )).value).execution_events
      : [];
    const appendedEvents = source.execution_events.slice(priorEvents.length);
    if (!revisions.length || appendedEvents.length !== 1
      || appendedEvents[0] !== reopenEvents[0]) {
      return revisionReply(runDirectory, revision, source, [{
        category: 'adapter_revision', code: 'REOPEN_EVENT_BATCH_CONFLICT',
        path: '/execution_events',
        message: 'Semantic reopen must be the sole append after its execution presentation was committed.'
      }], runId);
    }
  }
  const confirmations = source.execution_events.filter(
    (/** @type {any} */ event) => event.event_type === 'confirm_execution_plan'
  );
  if (confirmations.length > 1
    || (confirmations.length === 1
      && source.execution_events.at(-1) !== confirmations[0])) {
    if (verifiedDelivery) return qualityFailure(
      runId, 'EXECUTION_DELIVERY_HISTORY_MISMATCH',
      '已交付执行计划的 accepted confirmation history 无法安全重放。'
    );
    return revisionReply(runDirectory, revision, source, [{
      category: 'adapter_revision', code: 'CONFIRMATION_BATCH_CONFLICT',
      path: '/execution_events',
      message: 'Final confirmation must be the only newly appended event and remain last.'
    }], runId, 'final_confirmation');
  }
  try {
    for (const [index, event] of source.execution_events.entries()) {
      if (candidateAppendStart === index) stateBeforeCandidateAppend = structuredClone(state);
      if (event.event_type === 'confirm_execution_plan') continue;
      const applied = await applyV4ExecutionAction(
        state, presentation, event, executionServices
      );
      if (applied?.status === 'semantic_reopen_committed') {
        await commitExecutionCapabilityState(
          runDirectory, revision, source, candidate, runId, state
        );
        const siblingDirectory = path.join(
          catalogRoot(runDirectory), 'runs', applied.sibling_run_id
        );
        const siblingCheckpoint = await readJsonIfPresent(
          siblingDirectory, path.join(siblingDirectory, 'checkpoint.json')
        );
        const siblingPresentation = siblingCheckpoint?.value?.clarification_state?.presentation;
        if (!siblingPresentation) throw new TypeError('REOPEN_SIBLING_PRESENTATION_MISSING');
        return createSemanticQuestionReplyV4(
          applied.sibling_run_id, siblingPresentation
        );
      }
      if (!applied?.state) throw new TypeError('EXECUTION_ACTION_UNAVAILABLE');
      Object.assign(state, applied.state);
    }
  } catch (error) {
    if (verifiedDelivery) return qualityFailure(
      runId, error instanceof Error ? error.message : 'EXECUTION_DELIVERY_HISTORY_MISMATCH',
      '已交付执行计划的 accepted event history 无法按原展示上下文重放。'
    );
    return revisionReply(runDirectory, revision, source, [{
      category: 'adapter_revision',
      code: error instanceof Error ? error.message : 'EXECUTION_ACTION_INVALID',
      path: '/execution_events', message: 'Execution events must match the exact displayed action context.'
    }], runId);
  }
  let result;
  try {
    result = await compileExecutionPlanFromCaseDocument(request, {
      resolve: resolver,
      bindings: mergedBindings(initial.items, state)
    });
  } catch (error) {
    return qualityFailure(runId,
      error instanceof Error ? error.message : 'EXECUTION_BINDING_INVALID',
      '执行计划无法从不可变 Case Document 与受信执行绑定安全重算。');
  }

  const candidateAppendedEvents = candidate && appendBaseSource
    ? source.execution_events.slice(appendBaseSource.execution_events.length) : [];
  const noOpAppendTypes = new Set([
    'set_execution_disposition', 'provide_capability_proof', 'pause_execution'
  ]);
  if (candidate && appendBaseSource && appendBaseRevision !== null && stateBeforeCandidateAppend
    && candidateAppendedEvents.length > 0
    && candidateAppendedEvents.every((/** @type {any} */ event) => noOpAppendTypes.has(event.event_type))) {
    try {
      const priorResult = await compileExecutionPlanFromCaseDocument(request, {
        resolve: resolver, bindings: mergedBindings(initial.items, stateBeforeCandidateAppend)
      });
      if (stateBeforeCandidateAppend.paused === state.paused
        && canonicalStringify(priorResult) === canonicalStringify(result)) {
        await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
        stateBeforeCandidateAppend.source_revision = appendBaseRevision;
        const priorPresentation = createV4ExecutionPresentation(
          stateBeforeCandidateAppend, executionServices
        );
        if (priorResult.status !== 'finished' || stateBeforeCandidateAppend.paused) {
          return createV4ExecutionPendingReply(runId, priorPresentation);
        }
        const priorFinalPresentation = await commitFinalConfirmationPresentation(
          runDirectory, runId, appendBaseRevision, appendBaseSource, priorResult
        );
        return finalConfirmationReply(runId, priorFinalPresentation);
      }
    } catch (error) {
      return qualityFailure(runId,
        error instanceof Error ? error.message : 'EXECUTION_NO_OP_REPLAY_INVALID',
        '执行追加无法安全重算其先前状态。');
    }
  }
  // The preliminary final-confirmation check lets an exact prior event reach
  // the semantic no-op fold above. If that replay changes the current state or
  // plan, it was not a replay at all: reject it before it can be promoted.
  if (candidate && finalConfirmationDisplayed && !onlyFinalConfirmation) {
    return revisionReply(runDirectory, revision, source, [{
      category: 'adapter_revision', code: 'FINAL_CONFIRMATION_ACTION_STALE',
      path: '/execution_events',
      message: 'Only the displayed final confirmation or cancellation may follow a final confirmation presentation.'
    }], runId, 'final_confirmation');
  }
  const pendingExecutionCount = result.items.filter((/** @type {any} */ item) => (
    item.disposition === 'pending' || (item.disposition === 'execute' && item.ready !== true)
  )).length;
  let outcome;
  try {
    outcome = classifyFinalOutcomeV4({
      delivery_intent: 'execution_plan', cancelled: false,
      selected_case_count: result.runner_projection.case_ids.length,
      all_execution_gates_passed: result.status === 'finished',
      pending_execution_count: pendingExecutionCount
    });
  } catch {
    return qualityFailure(runId, 'EXECUTION_OUTCOME_INVALID',
      '执行计划状态无法通过最终结果矩阵校验。');
  }

  if (verifiedDelivery) {
    const prior = history.sources.at(-2);
    const priorEvents = Array.isArray(prior?.execution_events) ? prior.execution_events : [];
    const appendedEvents = source.execution_events.slice(priorEvents.length);
    if (state.paused || outcome.status !== 'finished' || confirmations.length !== 1
      || appendedEvents.length !== 1 || appendedEvents[0] !== confirmations[0]
      || verifiedDelivery.manifest.revision !== revision
      || canonicalStringify(verifiedDelivery.manifest.case_document_ref)
        !== canonicalStringify(source.case_document_ref)
      || canonicalStringify(verifiedDelivery.execution_plan) !== canonicalStringify(result)) {
      return qualityFailure(
        runId, 'EXECUTION_DELIVERY_HISTORY_MISMATCH',
        '已交付执行计划与 accepted event history、Case Document 引用或重算 readiness 不全等。'
      );
    }
    try {
      await verifyDisplayedFinalConfirmation(
        runDirectory, runId, source, result, confirmations[0]
      );
      await persistCapabilityReceiptLedger(
        runDirectory, runId, source.case_document_ref, state.capability_receipts
      );
    } catch (error) {
      return qualityFailure(
        runId, error instanceof Error ? error.message : 'EXECUTION_DELIVERY_HISTORY_MISMATCH',
        '已交付执行计划的确认记录或能力 receipt ledger 无法安全重放。'
      );
    }
    return verifiedDelivery.reply;
  }

  if (state.paused || outcome.status !== 'finished') {
    if (confirmations.length) return revisionReply(runDirectory, revision, source, [{
      category: 'adapter_revision', code: 'CONFIRMATION_BEFORE_PLAN_READY',
      path: '/execution_events', message: 'A pending execution plan cannot be confirmed.'
    }], runId, 'final_confirmation');
    try {
      await commitExecutionCapabilityState(
        runDirectory, revision, source, candidate, runId, state
      );
    } catch (error) {
      return qualityFailure(runId,
        error instanceof Error ? error.message : 'EXECUTION_CAPABILITY_LEDGER_INVALID',
        '执行能力证明记录无法安全提交或重放。');
    }
    return createV4ExecutionPendingReply(runId, presentation);
  }

  if (!confirmations.length) {
    try {
      await commitExecutionCapabilityState(
        runDirectory, revision, source, candidate, runId, state
      );
    } catch (error) {
      return qualityFailure(runId,
        error instanceof Error ? error.message : 'EXECUTION_CAPABILITY_LEDGER_INVALID',
        '执行能力证明记录无法安全提交或重放。');
    }
    let finalPresentation;
    try {
      finalPresentation = await commitFinalConfirmationPresentation(
        runDirectory, runId, revision, source, result
      );
    } catch (error) {
      return qualityFailure(runId,
        error instanceof Error ? error.message : 'FINAL_CONFIRMATION_STATE_INVALID',
        '最终确认展示状态无法安全提交。');
    }
    return finalConfirmationReply(runId, finalPresentation);
  }

  const priorEvents = candidate && revisions.length
    ? /** @type {any} */ ((await readJson(
      runDirectory, acceptedPath(runDirectory, revision - 1, 'source_pack')
    )).value).execution_events : source.execution_events.slice(0, -1);
  const appendedEvents = source.execution_events.slice(priorEvents.length);
  if (appendedEvents.length !== 1 || appendedEvents[0] !== confirmations[0]) {
    return revisionReply(runDirectory, revision, source, [{
      category: 'adapter_revision', code: 'CONFIRMATION_BATCH_CONFLICT',
      path: '/execution_events',
      message: 'Plan-changing events must be displayed in a separate revision before confirmation.'
    }], runId, 'final_confirmation');
  }
  try {
    await verifyDisplayedFinalConfirmation(
      runDirectory, runId, source, result, confirmations[0]
    );
  } catch (error) {
    return revisionReply(runDirectory, revision, source, [{
      category: 'adapter_revision',
      code: error instanceof Error ? error.message : 'FINAL_CONFIRMATION_INVALID',
      path: '/execution_events',
      message: 'Confirmation must bind the exact final plan previously returned by this run.'
    }], runId, 'final_confirmation');
  }
  try {
    await commitExecutionCapabilityState(
      runDirectory, revision, source, candidate, runId, state
    );
  } catch (error) {
    return qualityFailure(runId,
      error instanceof Error ? error.message : 'EXECUTION_CAPABILITY_LEDGER_INVALID',
      '执行能力证明记录无法安全提交或重放。');
  }

  const published = await publishExecutionPlanDeliveryV4(runDirectory, {
    run_id: runId, revision, completed_at: runInstance.created_at,
    case_document_ref: source.case_document_ref,
    execution_plan: result, non_blocking_diagnostics: []
  }, { resolve_case_document: resolver });
  return published.reply;
}
