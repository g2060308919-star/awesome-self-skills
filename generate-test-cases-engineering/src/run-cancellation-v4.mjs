import { createHash } from 'node:crypto';
import path from 'node:path';

import runInstanceSchema from '../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from './canonical.mjs';
import {
  RunStoreIntegrityError, acquireRunLock, atomicWriteJson,
  discardStagingSnapshot, readJsonIfPresent, readTextIfPresent, stagingPath
} from './run-store.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

const SCHEMA_VERSION = '4.0.0';
const COMPILER_VERSION = '0.5.0';
const RUN_ID = /^RUN-[0-9a-fA-F-]{36}$/u;
const EVENT_ID = /^EVENT-[0-9a-f]{64}$/u;
const PHASES = new Set([
  'source_acquisition', 'requirements_analysis', 'case_design',
  'execution_closure', 'final_confirmation'
]);

/** @param {unknown} value @returns {value is Record<string,any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {unknown} ownership */
function requireHeldLock(ownership) {
  if (typeof ownership !== 'function'
    || typeof /** @type {any} */ (ownership).assertHealthy !== 'function') {
    throw new TypeError('RUN_LOCK_OWNERSHIP_REQUIRED');
  }
  /** @type {any} */ (ownership).assertHealthy();
  return /** @type {(()=>Promise<void>) & {assertHealthy:()=>void}} */ (ownership);
}

/** @param {string|Uint8Array} value */
function byteDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** @param {string} runDirectory */
export function cancellationStatePathV4(runDirectory) {
  return path.join(runDirectory, 'state', 'cancellation.json');
}

/** @param {string} runDirectory */
function lifecyclePath(runDirectory) { return path.join(runDirectory, 'state', 'lifecycle.json'); }

/** @param {unknown} submitted */
function validateCancelEvent(submitted) {
  if (!record(submitted)) throw new TypeError('CANCEL_EVENT_INVALID');
  const event = structuredClone(submitted);
  const keys = ['event_id', 'event_type', 'run_id', 'phase', 'phase_version'];
  if (Object.keys(event).length !== keys.length || keys.some(key => !Object.hasOwn(event, key))
    || !EVENT_ID.test(event.event_id) || event.event_type !== 'cancel_run'
    || typeof event.run_id !== 'string' || !RUN_ID.test(event.run_id)
    || !PHASES.has(event.phase)
    || !Number.isSafeInteger(event.phase_version) || event.phase_version < 0) {
    throw new TypeError('CANCEL_EVENT_INVALID');
  }
  const body = { ...event }; delete body.event_id;
  if (event.event_id !== `EVENT-${digest(body)}`) throw new TypeError('CANCEL_EVENT_ID_INVALID');
  return event;
}

/** Construct the exact run-level action advertised by every cancellable reply.
 * @param {{run_id:string,phase:string,phase_version:number}} context
 */
export function constructCancelRunEventV4(context) {
  if (!record(context)) throw new TypeError('CANCEL_CONTEXT_INVALID');
  const body = {
    event_type: 'cancel_run', run_id: context.run_id,
    phase: context.phase, phase_version: context.phase_version
  };
  return validateCancelEvent({ event_id: `EVENT-${digest(body)}`, ...body });
}

/** @param {string} runDirectory @param {any} runInstance @param {any} recordValue */
async function syncCancelledLifecycle(runDirectory, runInstance, recordValue) {
  const stored = await readJsonIfPresent(runDirectory, lifecyclePath(runDirectory));
  if (stored?.value?.status === 'cancelled') {
    if (stored.value.run_id !== runInstance.run_id
      || stored.value.cancellation_event_id !== recordValue.event.event_id) {
      throw new RunStoreIntegrityError('CANCEL_LIFECYCLE_CONFLICT');
    }
    return;
  }
  if (stored && stored.value.status !== 'active') throw new RunStoreIntegrityError('RUN_NOT_ACTIVE');
  const version = stored ? Number(stored.value.version) + 1 : 1;
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new RunStoreIntegrityError('CANCEL_LIFECYCLE_INVALID');
  }
  await atomicWriteJson(runDirectory, lifecyclePath(runDirectory), {
    schema_version: SCHEMA_VERSION, run_id: runInstance.run_id,
    delivery_intent: runInstance.delivery_intent, status: 'cancelled', version,
    superseded_by: null, semantic_reopen_txn_id: null,
    cancellation_event_id: recordValue.event.event_id
  });
}

/** @param {string} runDirectory @param {any} value */
async function validateCancellationRecord(runDirectory, value) {
  if (!record(value)) throw new RunStoreIntegrityError('CANCEL_STATE_INVALID');
  const keys = [
    'schema_version', 'compiler_version', 'run_id', 'delivery_intent', 'status',
    'version', 'event', 'event_digest', 'prior_manifest', 'reply'
  ];
  const event = validateCancelEvent(value.event);
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))
    || value.schema_version !== SCHEMA_VERSION || value.compiler_version !== COMPILER_VERSION
    || value.run_id !== event.run_id || !['case_document', 'execution_plan'].includes(value.delivery_intent)
    || value.status !== 'cancelled' || value.version !== 1
    || value.event_digest !== `sha256:${digest(event)}`
    || !record(value.reply) || value.reply.status !== 'cancelled'
    || value.reply.run_id !== value.run_id || value.reply.phase !== event.phase
    || value.reply.result_kind !== 'cancelled') {
    throw new RunStoreIntegrityError('CANCEL_STATE_INVALID');
  }
  const current = await readTextIfPresent(runDirectory, path.join(runDirectory, 'output', 'current.json'));
  if (value.prior_manifest === null) {
    if (current !== null) throw new RunStoreIntegrityError('CANCEL_MANIFEST_CHANGED');
  } else if (!record(value.prior_manifest)
    || value.prior_manifest.path !== 'output/current.json'
    || typeof value.prior_manifest.digest !== 'string'
    || current === null || byteDigest(current) !== value.prior_manifest.digest) {
    throw new RunStoreIntegrityError('CANCEL_MANIFEST_CHANGED');
  }
  return value;
}

/** @param {string} runDirectory */
export async function readCancelledRunV4(runDirectory) {
  const snapshot = await readJsonIfPresent(runDirectory, cancellationStatePathV4(runDirectory));
  return snapshot ? validateCancellationRecord(runDirectory, snapshot.value) : null;
}

/**
 * Commit terminal cancellation while the production runner owns the run lock.
 * The cancellation record is authoritative; the lifecycle mirror is repaired
 * on replay if a process stopped between those two atomic writes.
 * @param {string} runDirectory @param {unknown} submittedEvent @param {unknown} ownership
 */
export async function cancelRunV4WithHeldLock(runDirectory, submittedEvent, ownership) {
  const heldLock = requireHeldLock(ownership);
  try {
    const event = validateCancelEvent(submittedEvent);
    const run = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'run-instance.json'));
    if (!run || validateAgainstSchema(run.value, runInstanceSchema).length
      || run.value.schema_version !== SCHEMA_VERSION || run.value.run_id !== event.run_id) {
      throw new RunStoreIntegrityError('CANCEL_RUN_INSTANCE_INVALID');
    }
    const existing = await readCancelledRunV4(runDirectory);
    if (existing) {
      await syncCancelledLifecycle(runDirectory, run.value, existing);
      return structuredClone(existing.reply);
    }
    const current = await readTextIfPresent(runDirectory, path.join(runDirectory, 'output', 'current.json'));
    const priorManifest = current === null ? null : {
      path: 'output/current.json', digest: byteDigest(current)
    };
    const reply = {
      status: 'cancelled', phase: event.phase, result_kind: 'cancelled', run_id: event.run_id,
      produced_artifacts: priorManifest ? [{
        kind: 'historical_delivery_manifest', path: priorManifest.path, digest: priorManifest.digest
      }] : [],
      incomplete_reason: {
        code: 'USER_CANCELLED', summary: '用户已取消本次运行；没有创建或覆盖新的交付 manifest。'
      },
      user_next_steps: [{
        action: 'create_new_run',
        description: '如需继续，创建携带 parent_run_id 与 creation_reason=resume_cancelled 的 sibling。'
      }],
      recovery: {
        mode: 'create_sibling_run',
        description: '已取消运行拒绝普通 append；仅可通过新的 sibling 运行继续。'
      },
      non_blocking_diagnostics: []
    };
    const state = {
      schema_version: SCHEMA_VERSION, compiler_version: COMPILER_VERSION,
      run_id: event.run_id, delivery_intent: run.value.delivery_intent,
      status: 'cancelled', version: 1, event,
      event_digest: `sha256:${digest(event)}`, prior_manifest: priorManifest, reply
    };
    await atomicWriteJson(runDirectory, cancellationStatePathV4(runDirectory), state);
    await syncCancelledLifecycle(runDirectory, run.value, state);
    return structuredClone(reply);
  } finally {
    heldLock.assertHealthy();
  }
}

/** @param {string} runDirectory @param {string} runId */
export async function replayCancelledRunV4(runDirectory, runId) {
  const state = await readCancelledRunV4(runDirectory);
  if (!state) return null;
  if (state.run_id !== runId) throw new RunStoreIntegrityError('CANCEL_RUN_INSTANCE_INVALID');
  return structuredClone(state.reply);
}

/** Replay terminal cancellation while holding the production run lock and
 * retire any later staged Agent append. The cancellation record remains the
 * authority; staging can never revive or advance a cancelled run.
 * @param {string} runDirectory @param {string} runId @param {unknown} ownership
 */
export async function replayCancelledRunV4WithHeldLock(runDirectory, runId, ownership) {
  const heldLock = requireHeldLock(ownership);
  const reply = await replayCancelledRunV4(runDirectory, runId);
  if (!reply) return null;
  for (const stage of /** @type {const} */ (
    ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']
  )) {
    const text = await readTextIfPresent(runDirectory, stagingPath(runDirectory, stage));
    if (text !== null) await discardStagingSnapshot(runDirectory, stage, { text });
  }
  heldLock.assertHealthy();
  return reply;
}

/** @param {string} catalogRoot @param {string} runId */
function catalogRunDirectory(catalogRoot, runId) {
  if (!RUN_ID.test(runId)) throw new TypeError('V4_RUN_ID_INVALID');
  return path.join(path.resolve(catalogRoot), 'runs', runId);
}

/**
 * Ordinary private run-creation seam for resuming a cancelled run. It writes no
 * data to the parent and creates only the canonical v4 sibling identity.
 * @param {string} catalogRoot
 * @param {{parent_run_id:string,run_id:string}} input
 */
export async function createResumeCancelledSiblingV4(catalogRoot, input) {
  if (!record(input) || Object.keys(input).length !== 2
    || typeof input.parent_run_id !== 'string' || typeof input.run_id !== 'string') {
    throw new TypeError('RESUME_CANCELLED_INPUT_INVALID');
  }
  const release = await acquireRunLock(catalogRoot);
  try {
    const parentDirectory = catalogRunDirectory(catalogRoot, input.parent_run_id);
    const parentState = await readCancelledRunV4(parentDirectory);
    if (!parentState) throw new RunStoreIntegrityError('RESUME_CANCELLED_PARENT_NOT_CANCELLED');
    const deliveryIntent = parentState.delivery_intent;
    const siblingDirectory = catalogRunDirectory(catalogRoot, input.run_id);
    if (path.resolve(parentDirectory) === path.resolve(siblingDirectory)) {
      throw new TypeError('RESUME_CANCELLED_SIBLING_REQUIRED');
    }
    const target = path.join(siblingDirectory, 'run-instance.json');
    const existing = await readJsonIfPresent(catalogRoot, target);
    if (existing) {
      if (existing.value.schema_version !== SCHEMA_VERSION
        || existing.value.run_id !== input.run_id
        || existing.value.delivery_intent !== deliveryIntent
        || canonicalStringify(existing.value.lineage) !== canonicalStringify({
          parent_run_id: input.parent_run_id, creation_reason: 'resume_cancelled'
        })) throw new RunStoreIntegrityError('RESUME_CANCELLED_SIBLING_CONFLICT');
      return structuredClone(existing.value);
    }
    const instance = {
      schema_version: SCHEMA_VERSION, compiler_version: COMPILER_VERSION,
      run_id: input.run_id, delivery_intent: deliveryIntent,
      created_at: new Date().toISOString(),
      lineage: { parent_run_id: input.parent_run_id, creation_reason: 'resume_cancelled' }
    };
    if (validateAgainstSchema(instance, runInstanceSchema).length) {
      throw new TypeError('RESUME_CANCELLED_SIBLING_INVALID');
    }
    await atomicWriteJson(catalogRoot, target, instance);
    return structuredClone(instance);
  } finally { await release(); }
}

/** Validate a resume_cancelled identity before the runner touches its staged inputs.
 * @param {string} runDirectory @param {unknown} submittedInstance
 */
export async function verifyResumeCancelledSiblingV4(runDirectory, submittedInstance) {
  if (!record(submittedInstance)
    || submittedInstance.lineage?.creation_reason !== 'resume_cancelled'
    || typeof submittedInstance.lineage.parent_run_id !== 'string') {
    throw new RunStoreIntegrityError('RESUME_CANCELLED_SIBLING_INVALID');
  }
  const resolved = path.resolve(runDirectory);
  const runsDirectory = path.dirname(resolved);
  if (path.basename(runsDirectory) !== 'runs' || path.basename(resolved) !== submittedInstance.run_id) {
    throw new RunStoreIntegrityError('RESUME_CANCELLED_SIBLING_INVALID');
  }
  const catalogRoot = path.dirname(runsDirectory);
  const parentDirectory = catalogRunDirectory(catalogRoot, submittedInstance.lineage.parent_run_id);
  const parentState = await readCancelledRunV4(parentDirectory);
  if (!parentState) {
    throw new RunStoreIntegrityError('RESUME_CANCELLED_PARENT_NOT_CANCELLED');
  }
  if (submittedInstance.run_id === parentState.run_id
    || submittedInstance.delivery_intent !== parentState.delivery_intent) {
    throw new RunStoreIntegrityError('RESUME_CANCELLED_SIBLING_INVALID');
  }
  const stored = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'run-instance.json'));
  if (!stored || validateAgainstSchema(stored.value, runInstanceSchema).length
    || canonicalStringify(stored.value) !== canonicalStringify(submittedInstance)) {
    throw new RunStoreIntegrityError('RESUME_CANCELLED_SIBLING_INVALID');
  }
  return structuredClone(stored.value);
}
