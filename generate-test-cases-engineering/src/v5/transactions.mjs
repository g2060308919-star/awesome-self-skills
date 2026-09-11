import { lstat, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { V5_COMPILER_VERSION, V5_SCHEMA_VERSION } from './constants.mjs';
import { V5ProtocolError } from './errors.mjs';
import {
  ensureV5Directory,
  publishFixedRecord,
  readCasJson,
  readFixedSealedRecord,
  readSealedV5Record,
  readVerifiedRun,
  withV5RunLock,
  writeAtomicFile,
  writeCasJson,
  writeSemanticV5Record,
  writeSealedV5Record
} from './run-store.mjs';
import { resolveCatalogLayout, resolveRunLayout, digestFilename } from './storage-paths.mjs';
import { actionDigestV5, sealV5Record } from './storage-records.mjs';
import { canonicalV5Stringify } from './canonical-v5.mjs';

/** @param {Record<string, unknown>} value @param {string} digestField */
function withoutDigest(value, digestField) {
  const { [digestField]: ignored, ...payload } = value;
  return payload;
}

/** @param {Record<string, any>} checkpoint @param {Record<string, any>} identity */
function validateCheckpointIdentity(checkpoint, identity) {
  if (checkpoint.run_id !== identity.run_id || checkpoint.case_document_lineage_id !== identity.case_document_lineage_id || checkpoint.delivery_intent !== identity.delivery_intent || checkpoint.schema_version !== V5_SCHEMA_VERSION || checkpoint.compiler_version !== V5_COMPILER_VERSION) {
    throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Checkpoint identity binding is invalid.');
  }
}

/** @param {string} catalogRoot @param {string} idempotencyKey @param {string} canonicalActionDigest */
async function resolveCatalogIdempotency(catalogRoot, idempotencyKey, canonicalActionDigest) {
  const layout = await resolveCatalogLayout(catalogRoot);
  let pointer;
  try { pointer = await readFixedSealedRecord(layout.currentPointer, 'pointer_digest'); } catch (error) {
    if (error instanceof V5ProtocolError && error.message.includes('unavailable')) return null;
    throw error;
  }
  const transaction = await readSealedV5Record(layout.catalogTransactions, pointer.record.head_transaction_digest, 'transaction_digest');
  const entry = transaction.entries.find((/** @type {Record<string, any>} */ row) => row.idempotency_key === idempotencyKey);
  if (!entry) return { layout, pointer, transaction };
  if (entry.canonical_action_digest !== canonicalActionDigest) throw new V5ProtocolError('IDEMPOTENCY_CONFLICT', 'Catalog idempotency key was used with a different create request.');
  const reply = await readCasJson(path.join(layout.catalogReplies, digestFilename(entry.reply_digest)), entry.reply_digest);
  return { replay: true, runDirectory: path.join(layout.runsDirectory, entry.run_id), reply };
}

/**
 * @param {string} catalogRoot
 * @param {{identity:Record<string,any>,checkpoint:Record<string,any>,selectorSidecar:Record<string,any>,reply:Record<string,any>,idempotencyKey:string,canonicalActionDigest:string,compilerStateRecords?:Array<{record:Record<string,any>,digestField?:string,semanticDigest?:string}>}} input
 * @param {{failAt?:string}} [services]
 */
export async function commitCatalogGenesis(catalogRoot, input, services = {}) {
  const existing = await resolveCatalogIdempotency(catalogRoot, input.idempotencyKey, input.canonicalActionDigest);
  if (existing?.replay) return { runDirectory: existing.runDirectory, reply: existing.reply, replayed: true };
  const catalog = await resolveCatalogLayout(catalogRoot);
  if (!/^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u.test(input.identity.run_id) || input.identity.schema_version !== V5_SCHEMA_VERSION || input.identity.compiler_version !== V5_COMPILER_VERSION) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Run identity is invalid.');
  const runDirectory = path.join(catalog.runsDirectory, input.identity.run_id);
  try { await lstat(runDirectory); throw new V5ProtocolError('IDEMPOTENCY_CONFLICT', 'Run directory already exists.'); } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  await ensureV5Directory(catalog.catalogTransactions);
  await ensureV5Directory(catalog.catalogRunGenesisRecords);
  await ensureV5Directory(catalog.catalogReplies);
  await ensureV5Directory(catalog.runsDirectory);
  await mkdir(runDirectory);
  const run = await resolveRunLayout(runDirectory);
  for (const directory of [run.transactions, run.receipts, run.idempotencyIndexes, run.replies, run.checkpoints, run.selectorSidecars, run.genesisRecords, run.acceptedArtifacts, run.compilerState, run.renderedOutputs, run.events, run.incidents, run.rawSourceBytes, run.staging]) await ensureV5Directory(directory);
  for (const item of input.compilerStateRecords ?? []) {
    if (item.semanticDigest) await writeSemanticV5Record(run.compilerState, item.record, item.semanticDigest);
    else if (item.digestField) await writeSealedV5Record(run.compilerState, item.record, item.digestField);
    else throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Compiler state record storage contract is missing.');
  }

  validateCheckpointIdentity(input.checkpoint, input.identity);
  const identity = sealV5Record(input.identity, 'identity_digest');
  const checkpoint = await writeSealedV5Record(run.checkpoints, input.checkpoint, 'checkpoint_digest');
  const sidecarPayload = Object.hasOwn(input.selectorSidecar, 'selector_sidecar_digest') ? withoutDigest(input.selectorSidecar, 'selector_sidecar_digest') : input.selectorSidecar;
  const sidecar = await writeSealedV5Record(run.selectorSidecars, { ...sidecarPayload, schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id, checkpoint_digest: checkpoint.digest }, 'selector_sidecar_digest');
  const reply = await writeCasJson(run.replies, input.reply);
  const index = await writeSealedV5Record(run.idempotencyIndexes, { kind: 'operational_idempotency_index', schema_version: V5_SCHEMA_VERSION, scope: 'run_normal', run_id: input.identity.run_id, index_sequence: 0, entries: [] }, 'index_digest');
  const transaction = await writeSealedV5Record(run.transactions, {
    scope: { kind: 'run', run_id: input.identity.run_id }, run_id: input.identity.run_id,
    transaction_kind: 'genesis', transaction_sequence: 0, previous_run_transaction_digest: null,
    checkpoint_digest: checkpoint.digest, selector_sidecar_digest: sidecar.digest,
    reply_object_digest: reply.digest, receipt_digest: null, idempotency_index_digest: index.digest
  }, 'transaction_digest');
  const genesis = await writeSealedV5Record(run.genesisRecords, {
    kind: 'catalog_run_genesis_record', schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id,
    identity_digest: identity.identity_digest, initial_run_transaction_digest: transaction.digest
  }, 'run_genesis_record_digest');
  await writeSealedV5Record(catalog.catalogRunGenesisRecords, genesis.record, 'run_genesis_record_digest');
  await writeAtomicFile(run.identity, Buffer.from(canonicalV5Stringify(identity)));
  if (services.failAt === 'after_run_transaction') throw new Error('INJECTED_CRASH: after_run_transaction');
  const pointer = await publishFixedRecord(run.currentPointer, { kind: 'run_current_transaction_pointer', schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id, run_genesis_record_digest: genesis.digest, head_transaction_digest: transaction.digest }, 'pointer_digest', null);
  if (services.failAt === 'after_run_pointer') throw new Error('INJECTED_CRASH: after_run_pointer');

  const catalogReply = await writeCasJson(catalog.catalogReplies, input.reply);
  const priorEntries = existing?.transaction?.entries ?? [];
  const catalogTransaction = await writeSealedV5Record(catalog.catalogTransactions, {
    scope: { kind: 'catalog' }, transaction_kind: 'catalog_create', transaction_sequence: (existing?.transaction?.transaction_sequence ?? -1) + 1,
    previous_catalog_transaction_digest: existing?.transaction?.transaction_digest ?? null,
    entries: [...priorEntries, { idempotency_key: input.idempotencyKey, canonical_action_digest: input.canonicalActionDigest, run_id: input.identity.run_id, run_genesis_record_digest: genesis.digest, reply_digest: catalogReply.digest }].sort((left, right) => left.idempotency_key.localeCompare(right.idempotency_key))
  }, 'transaction_digest');
  await publishFixedRecord(catalog.currentPointer, { kind: 'catalog_current_transaction_pointer', schema_version: V5_SCHEMA_VERSION, scope: { kind: 'catalog' }, head_transaction_digest: catalogTransaction.digest }, 'pointer_digest', existing?.pointer?.bytes ?? null);
  return {
    runDirectory,
    reply: await readCasJson(path.join(run.replies, digestFilename(reply.digest)), reply.digest),
    pointer,
    head: transaction.record,
    replayed: false
  };
}

/**
 * @param {string} runDirectory
 * @param {{idempotency_key:string,action:Record<string,any>}} request
 * @param {{checkpoint:Record<string,any>,selectorSidecar:Record<string,any>,reply:Record<string,any>,commitReceipt:Record<string,any>,acceptedArtifacts?:Array<{record:Record<string,any>,digestField:string}>,compilerStateRecords?:Array<{record:Record<string,any>,digestField?:string,semanticDigest?:string}>}} nextState
 * @param {{failAt?:string}} [services]
 */
export async function commitNormalRunTransaction(runDirectory, request, nextState, services = {}) {
  return withV5RunLock(runDirectory, async () => {
    const current = await readVerifiedRun(runDirectory);
    const canonicalActionDigest = actionDigestV5('advance', request.action);
    const existing = current.index.entries.find((/** @type {Record<string, any>} */ entry) => entry.idempotency_key === request.idempotency_key);
    if (existing) {
      if (existing.canonical_action_digest !== canonicalActionDigest) throw new V5ProtocolError('IDEMPOTENCY_CONFLICT', 'Idempotency key was used with a different action.');
      return readCasJson(path.join(current.layout.replies, digestFilename(existing.reply_digest)), existing.reply_digest);
    }
    validateCheckpointIdentity(nextState.checkpoint, current.identity);
    const semanticDelta = nextState.commitReceipt.semantic_revision_delta;
    if (![0, 1].includes(semanticDelta) || nextState.checkpoint.current_revision !== current.checkpoint.current_revision + semanticDelta) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Semantic revision delta does not match the committed checkpoint.');
    for (const item of nextState.acceptedArtifacts ?? []) await writeSealedV5Record(current.layout.acceptedArtifacts, item.record, item.digestField);
    for (const item of nextState.compilerStateRecords ?? []) {
      if (item.semanticDigest) await writeSemanticV5Record(current.layout.compilerState, item.record, item.semanticDigest);
      else if (item.digestField) await writeSealedV5Record(current.layout.compilerState, item.record, item.digestField);
      else throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Compiler state record storage contract is missing.');
    }
    const checkpointPayload = Object.hasOwn(nextState.checkpoint, 'checkpoint_digest') ? withoutDigest(nextState.checkpoint, 'checkpoint_digest') : nextState.checkpoint;
    const checkpoint = await writeSealedV5Record(current.layout.checkpoints, checkpointPayload, 'checkpoint_digest');
    const sidecarPayload = Object.hasOwn(nextState.selectorSidecar, 'selector_sidecar_digest') ? withoutDigest(nextState.selectorSidecar, 'selector_sidecar_digest') : nextState.selectorSidecar;
    const sidecar = await writeSealedV5Record(current.layout.selectorSidecars, { ...sidecarPayload, schema_version: V5_SCHEMA_VERSION, run_id: current.identity.run_id, checkpoint_digest: checkpoint.digest }, 'selector_sidecar_digest');
    const reply = await writeCasJson(current.layout.replies, nextState.reply);
    const sequence = current.transaction.transaction_sequence + 1;
    const receipt = await writeSealedV5Record(current.layout.receipts, {
      kind: 'v5_action_receipt', schema_version: V5_SCHEMA_VERSION, scope: 'run_normal', run_id: current.identity.run_id,
      receipt_sequence: sequence, idempotency_key: request.idempotency_key, canonical_action_digest: canonicalActionDigest,
      reply_object_ref: { reply_digest: reply.digest }, commit_receipt: { ...nextState.commitReceipt, committed_action_digest: canonicalActionDigest }
    }, 'receipt_digest');
    const index = await writeSealedV5Record(current.layout.idempotencyIndexes, {
      kind: 'operational_idempotency_index', schema_version: V5_SCHEMA_VERSION, scope: 'run_normal', run_id: current.identity.run_id,
      index_sequence: sequence,
      entries: [...current.index.entries, { idempotency_key: request.idempotency_key, canonical_action_digest: canonicalActionDigest, receipt_digest: receipt.digest, reply_digest: reply.digest }].sort((left, right) => left.idempotency_key.localeCompare(right.idempotency_key))
    }, 'index_digest');
    const transactionKind = nextState.reply.status === 'fatal' ? 'normal_fatal' : 'normal';
    const transaction = await writeSealedV5Record(current.layout.transactions, {
      scope: { kind: 'run', run_id: current.identity.run_id }, run_id: current.identity.run_id,
      transaction_kind: transactionKind, transaction_sequence: sequence,
      previous_run_transaction_digest: current.transaction.transaction_digest,
      run_genesis_record_digest: current.genesis.run_genesis_record_digest,
      checkpoint_digest: checkpoint.digest, selector_sidecar_digest: sidecar.digest,
      reply_object_digest: reply.digest, receipt_digest: receipt.digest, idempotency_index_digest: index.digest
    }, 'transaction_digest');
    if (services.failAt === 'before_pointer_publish') throw new Error('INJECTED_CRASH: before_pointer_publish');
    await publishFixedRecord(current.layout.currentPointer, { kind: 'run_current_transaction_pointer', schema_version: V5_SCHEMA_VERSION, run_id: current.identity.run_id, run_genesis_record_digest: current.genesis.run_genesis_record_digest, head_transaction_digest: transaction.digest }, 'pointer_digest', current.pointerBytes);
    return readCasJson(path.join(current.layout.replies, digestFilename(reply.digest)), reply.digest);
  });
}

/**
 * Publish a minimal, separately-scoped quarantine head after the ordinary
 * operational chain cannot be trusted.
 * @param {string} runDirectory
 * @param {Record<string,any>} incident
 * @param {{idempotency_key:string,action:Record<string,any>}} request
 */
export async function publishIntegrityQuarantine(runDirectory, incident, request) {
  return withV5RunLock(runDirectory, async () => {
    const layout = await resolveRunLayout(runDirectory);
    const identityFixed = await readFixedSealedRecord(layout.identity, 'identity_digest');
    const identity = identityFixed.record;
    const reply = { reply_kind: 'read_only_integrity_fatal', status: 'fatal', run_id: identity.run_id, diagnostic: { code: 'ACCEPTED_STATE_INTEGRITY_FAILURE', affected_refs: [] }, available_actions: [] };
    const replyObject = await writeCasJson(layout.replies, reply);
    const incidentRecord = await writeSealedV5Record(layout.incidents, { kind: 'integrity_quarantine_incident', schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, ...incident }, 'incident_record_digest');
    const checkpoint = await writeSealedV5Record(layout.checkpoints, { kind: 'v5_run_checkpoint', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION, run_id: identity.run_id, case_document_lineage_id: identity.case_document_lineage_id, delivery_intent: identity.delivery_intent, run_lifecycle: 'fatal', current_revision: incident.last_verified_revision ?? 0, fsm_cell_id: identity.delivery_intent === 'case_document' ? 'cd.terminal.fatal' : 'ep.terminal.fatal', stage: 'delivery', obligation: 'complete', fatal_incident_record_digest: incidentRecord.digest }, 'checkpoint_digest');
    const sidecar = await writeSealedV5Record(layout.selectorSidecars, { kind: 'v5_selector_sidecar', schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, checkpoint_digest: checkpoint.digest, selectors: [] }, 'selector_sidecar_digest');
    const actionDigest = actionDigestV5('advance', request.action);
    const receipt = await writeSealedV5Record(layout.receipts, { kind: 'v5_action_receipt', schema_version: V5_SCHEMA_VERSION, scope: 'run_integrity_quarantine', run_id: identity.run_id, receipt_sequence: 1, idempotency_key: request.idempotency_key, canonical_action_digest: actionDigest, reply_object_ref: { reply_digest: replyObject.digest }, commit_receipt: { kind: 'operational_commit', committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'fatal_incident_recorded' } }, 'receipt_digest');
    const index = await writeSealedV5Record(layout.idempotencyIndexes, { kind: 'operational_idempotency_index', schema_version: V5_SCHEMA_VERSION, scope: 'run_integrity_quarantine', run_id: identity.run_id, index_sequence: 1, entries: [{ idempotency_key: request.idempotency_key, canonical_action_digest: actionDigest, receipt_digest: receipt.digest, reply_digest: replyObject.digest }] }, 'index_digest');
    let oldBytes = null;
    try { oldBytes = await readFile(layout.currentPointer); } catch {}
    const transaction = await writeSealedV5Record(layout.transactions, { scope: { kind: 'run', run_id: identity.run_id }, run_id: identity.run_id, transaction_kind: 'integrity_quarantine', recovery_sequence: 1, transaction_sequence: 1, previous_run_transaction_digest: null, run_genesis_record_digest: identity.run_genesis_record_digest, incident_record_digest: incidentRecord.digest, checkpoint_digest: checkpoint.digest, selector_sidecar_digest: sidecar.digest, reply_object_digest: replyObject.digest, receipt_digest: receipt.digest, idempotency_index_digest: index.digest }, 'transaction_digest');
    await publishFixedRecord(layout.currentPointer, { kind: 'run_current_transaction_pointer', schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, run_genesis_record_digest: identity.run_genesis_record_digest, head_transaction_digest: transaction.digest }, 'pointer_digest', oldBytes);
    return reply;
  });
}
