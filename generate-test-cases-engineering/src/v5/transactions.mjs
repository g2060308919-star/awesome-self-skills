import { lstat, mkdir, readFile, readdir } from 'node:fs/promises';
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
import { actionDigestV5, canonicalObjectDigest, sealV5Record } from './storage-records.mjs';
import { canonicalV5Stringify } from './canonical-v5.mjs';
import { currentV5TransactionServices } from './runtime-services.mjs';

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
 * @param {{identity:Record<string,any>,checkpoint:Record<string,any>,selectorSidecar:Record<string,any>,reply:Record<string,any>,idempotencyKey:string,canonicalActionDigest:string,compilerStateRecords?:Array<{record:Record<string,any>,digestField?:string,semanticDigest?:string}>,acceptedArtifacts?:Array<{record:Record<string,any>,digestField:string}>}} input
 * @param {{failAt?:string}} [services]
 */
export async function commitCatalogGenesis(catalogRoot, input, services = currentV5TransactionServices()) {
  const existing = await resolveCatalogIdempotency(catalogRoot, input.idempotencyKey, input.canonicalActionDigest);
  if (existing?.replay) return { runDirectory: existing.runDirectory, reply: existing.reply, replayed: true };
  const catalog = await resolveCatalogLayout(catalogRoot);
  if (!/^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u.test(input.identity.run_id) || input.identity.schema_version !== V5_SCHEMA_VERSION || input.identity.compiler_version !== V5_COMPILER_VERSION) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Run identity is invalid.');
  const runDirectory = path.join(catalog.runsDirectory, input.identity.run_id);
  await ensureV5Directory(catalog.catalogTransactions);
  await ensureV5Directory(catalog.catalogRunGenesisRecords);
  await ensureV5Directory(catalog.catalogReplies);
  await ensureV5Directory(catalog.runsDirectory);
  const identity = sealV5Record(input.identity, 'identity_digest');
  let recoveringOrphan = false;
  try {
    await lstat(runDirectory);
    const orphanLayout = await resolveRunLayout(runDirectory);
    const orphanIdentity = await readFixedSealedRecord(orphanLayout.identity, 'identity_digest');
    if (canonicalV5Stringify(orphanIdentity.record) !== canonicalV5Stringify(identity) || (orphanIdentity.record.canonical_create_action_digest !== undefined && orphanIdentity.record.canonical_create_action_digest !== input.canonicalActionDigest)) throw new V5ProtocolError('IDEMPOTENCY_CONFLICT', 'Run directory belongs to a different create transaction.');
    recoveringOrphan = true;
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  if (!recoveringOrphan) await mkdir(runDirectory);
  const run = await resolveRunLayout(runDirectory);
  for (const directory of [run.transactions, run.receipts, run.idempotencyIndexes, run.replies, run.checkpoints, run.selectorSidecars, run.genesisRecords, run.acceptedArtifacts, run.compilerState, run.renderedOutputs, run.events, run.incidents, run.rawSourceBytes, run.staging]) await ensureV5Directory(directory);
  await writeAtomicFile(run.identity, Buffer.from(canonicalV5Stringify(identity)));
  for (const item of input.compilerStateRecords ?? []) {
    if (item.semanticDigest) await writeSemanticV5Record(run.compilerState, item.record, item.semanticDigest);
    else if (item.digestField) await writeSealedV5Record(run.compilerState, item.record, item.digestField);
    else throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Compiler state record storage contract is missing.');
  }
  for (const item of input.acceptedArtifacts ?? []) await writeSealedV5Record(run.acceptedArtifacts, item.record, item.digestField);

  validateCheckpointIdentity(input.checkpoint, input.identity);
  const checkpoint = await writeSealedV5Record(run.checkpoints, input.checkpoint, 'checkpoint_digest');
  const sidecarPayload = Object.hasOwn(input.selectorSidecar, 'selector_sidecar_digest') ? withoutDigest(input.selectorSidecar, 'selector_sidecar_digest') : input.selectorSidecar;
  const sidecar = await writeSealedV5Record(run.selectorSidecars, { ...sidecarPayload, schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id, checkpoint_digest: checkpoint.digest }, 'selector_sidecar_digest');
  const reply = await writeCasJson(run.replies, input.reply);
  const index = await writeSealedV5Record(run.idempotencyIndexes, { kind: 'operational_idempotency_index', schema_version: V5_SCHEMA_VERSION, scope: 'run_normal', run_id: input.identity.run_id, index_sequence: 0, entries: [] }, 'index_digest');
  const transaction = await writeSealedV5Record(run.transactions, {
    scope: { kind: 'run', run_id: input.identity.run_id }, run_id: input.identity.run_id,
    transaction_kind: 'genesis', transaction_sequence: 0, previous_run_transaction_digest: null,
    operational_event_ref: { kind: 'none' },
    checkpoint_digest: checkpoint.digest, selector_sidecar_digest: sidecar.digest,
    reply_object_digest: reply.digest, receipt_digest: null, idempotency_index_digest: index.digest
  }, 'transaction_digest');
  if (services.failAt === 'after_run_transaction') throw new Error('INJECTED_CRASH: after_run_transaction');
  const genesis = await writeSealedV5Record(run.genesisRecords, {
    kind: 'catalog_run_genesis_record', schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id,
    identity_digest: identity.identity_digest, initial_run_transaction_digest: transaction.digest
  }, 'run_genesis_record_digest');
  await writeSealedV5Record(catalog.catalogRunGenesisRecords, genesis.record, 'run_genesis_record_digest');
  if (services.failAt === 'after_catalog_genesis_record') throw new Error('INJECTED_CRASH: after_catalog_genesis_record');
  const runPointerPayload = { kind: 'run_current_transaction_pointer', schema_version: V5_SCHEMA_VERSION, run_id: input.identity.run_id, run_genesis_record_digest: genesis.digest, head_transaction_digest: transaction.digest };
  let pointer;
  try {
    const existingPointer = await readFixedSealedRecord(run.currentPointer, 'pointer_digest');
    const expectedPointer = sealV5Record(runPointerPayload, 'pointer_digest');
    if (canonicalV5Stringify(existingPointer.record) !== canonicalV5Stringify(expectedPointer)) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Recovered run pointer differs from the pending genesis transaction.');
    pointer = existingPointer.record;
  } catch (error) {
    if (error instanceof V5ProtocolError && !error.message.includes('unavailable')) throw error;
    pointer = await publishFixedRecord(run.currentPointer, runPointerPayload, 'pointer_digest', null);
  }
  if (services.failAt === 'after_run_pointer') throw new Error('INJECTED_CRASH: after_run_pointer');

  const catalogReply = await writeCasJson(catalog.catalogReplies, input.reply);
  const priorEntries = existing?.transaction?.entries ?? [];
  const catalogTransaction = await writeSealedV5Record(catalog.catalogTransactions, {
    scope: { kind: 'catalog' }, transaction_kind: 'catalog_create', transaction_sequence: (existing?.transaction?.transaction_sequence ?? -1) + 1,
    previous_catalog_transaction_digest: existing?.transaction?.transaction_digest ?? null,
    entries: [...priorEntries, { idempotency_key: input.idempotencyKey, canonical_action_digest: input.canonicalActionDigest, run_id: input.identity.run_id, run_genesis_record_digest: genesis.digest, reply_digest: catalogReply.digest }].sort((left, right) => left.idempotency_key.localeCompare(right.idempotency_key))
  }, 'transaction_digest');
  await publishFixedRecord(catalog.currentPointer, { kind: 'catalog_current_transaction_pointer', schema_version: V5_SCHEMA_VERSION, scope: { kind: 'catalog' }, head_transaction_digest: catalogTransaction.digest }, 'pointer_digest', existing?.pointer?.bytes ?? null);
  if (services.failAt === 'after_catalog_pointer_cas') throw new Error('INJECTED_CRASH: after_catalog_pointer_cas');
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
 * @param {Record<string,any>} request
 * @param {{checkpoint:Record<string,any>,selectorSidecar:Record<string,any>,reply:Record<string,any>,commitReceipt:Record<string,any>,acceptedArtifacts?:Array<{record:Record<string,any>,digestField:string}>,compilerStateRecords?:Array<{record:Record<string,any>,digestField?:string,semanticDigest?:string}>,renderedOutputs?:Array<{record:Record<string,any>,digestField:string}>,operationalEvent?:{record:Record<string,any>,digestField:string,refKind:string},incidentRecord?:Record<string,any>}} nextState
 * @param {{failAt?:string}} [services]
 */
export async function commitNormalRunTransaction(runDirectory, request, nextState, services = currentV5TransactionServices()) {
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
    for (const item of nextState.renderedOutputs ?? []) await writeSealedV5Record(current.layout.renderedOutputs, item.record, item.digestField);
    /** @type {Record<string,any>} */
    let operationalEventRef = { kind: 'none' };
    if (nextState.operationalEvent) {
      const event = await writeSealedV5Record(current.layout.events, nextState.operationalEvent.record, nextState.operationalEvent.digestField);
      operationalEventRef = { kind: nextState.operationalEvent.refKind, event_digest: event.digest };
    }
    const incident = nextState.incidentRecord
      ? await writeSealedV5Record(current.layout.incidents, nextState.incidentRecord, 'incident_record_digest')
      : null;
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
    const transactionKind = (nextState.reply.reply_status ?? nextState.reply.status) === 'fatal' ? 'normal_fatal' : 'normal';
    /** @type {Record<string,any>} */
    const transactionPayload = {
      scope: { kind: 'run', run_id: current.identity.run_id }, run_id: current.identity.run_id,
      transaction_kind: transactionKind, transaction_sequence: sequence,
      previous_run_transaction_digest: current.transaction.transaction_digest,
      operational_event_ref: operationalEventRef,
      run_genesis_record_digest: current.genesis.run_genesis_record_digest,
      checkpoint_digest: checkpoint.digest, selector_sidecar_digest: sidecar.digest,
      reply_object_digest: reply.digest, receipt_digest: receipt.digest, idempotency_index_digest: index.digest
    };
    if (incident) transactionPayload.incident_record_digest = incident.digest;
    const transaction = await writeSealedV5Record(current.layout.transactions, transactionPayload, 'transaction_digest');
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
export async function publishIntegrityQuarantine(runDirectory, incident, request, services = currentV5TransactionServices()) {
  return withV5RunLock(runDirectory, async () => {
    const layout = await resolveRunLayout(runDirectory);
    const identityFixed = await readFixedSealedRecord(layout.identity, 'identity_digest');
    const identity = identityFixed.record;
    let oldBytes = null;
    try { oldBytes = await readFile(layout.currentPointer); } catch {}
    let runGenesisRecordDigest = null;
    try {
      const pointer = await readFixedSealedRecord(layout.currentPointer, 'pointer_digest');
      if (pointer.record.run_id === identity.run_id) runGenesisRecordDigest = pointer.record.run_genesis_record_digest;
    } catch {}
    if (typeof runGenesisRecordDigest !== 'string') {
      for (const filename of (await readdir(layout.genesisRecords)).sort()) {
        if (!/^[0-9a-f]{64}\.json$/u.test(filename)) continue;
        const digest = `sha256:${filename.slice(0, 64)}`;
        try {
          const genesis = await readSealedV5Record(layout.genesisRecords, digest, 'run_genesis_record_digest');
          if (genesis.run_id === identity.run_id && genesis.identity_digest === identity.identity_digest) {
            runGenesisRecordDigest = digest;
            break;
          }
        } catch {}
      }
    }
    if (typeof runGenesisRecordDigest !== 'string') throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'A trusted run genesis record is required for quarantine publication.');

    const terminalCellId = identity.delivery_intent === 'case_document' ? 'cd.terminal.fatal' : 'ep.terminal.fatal';
    const terminalKind = identity.delivery_intent === 'case_document' ? 'case_document_fatal' : 'execution_plan_fatal';
    const currentRevision = incident.last_verified_revision ?? 0;
    const incidentRecord = await writeSealedV5Record(layout.incidents, {
      kind: 'integrity_quarantine_incident', schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id,
      diagnostic_code: 'ACCEPTED_STATE_INTEGRITY_FAILURE', affected_refs: incident.affected_refs ?? [],
      observed_failure: incident.observed_failure, last_verified_state: incident.last_verified_state ?? { kind: 'none' },
      quarantined_pointer_bytes_digest: oldBytes === null ? null : canonicalObjectDigest({ bytes_base64: oldBytes.toString('base64') })
    }, 'incident_record_digest');
    const checkpoint = await writeSealedV5Record(layout.checkpoints, { kind: 'v5_run_checkpoint', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION, run_id: identity.run_id, case_document_lineage_id: identity.case_document_lineage_id, delivery_intent: identity.delivery_intent, run_lifecycle: 'fatal', current_revision: currentRevision, fsm_cell_id: terminalCellId, stage: 'delivery', obligation: 'complete', fatal_incident_record_digest: incidentRecord.digest }, 'checkpoint_digest');
    const sidecar = await writeSealedV5Record(layout.selectorSidecars, { kind: 'v5_selector_sidecar', schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, checkpoint_digest: checkpoint.digest, selectors: [] }, 'selector_sidecar_digest');
    const actionDigest = actionDigestV5('advance', request.action);
    const commitReceipt = { kind: 'operational_commit', committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'fatal_incident_recorded' };
    const reply = {
      kind: 'run_reply', schema_version: V5_SCHEMA_VERSION, projection_kind: 'persisted_run_state',
      reply_contract_id: incident.reply_contract_id, reply_status: 'fatal', run_id: identity.run_id, run_directory: layout.root,
      case_document_lineage_id: identity.case_document_lineage_id, delivery_intent: identity.delivery_intent,
      run_lifecycle: 'fatal', stage: 'delivery', obligation: 'complete', current_revision: currentRevision,
      checkpoint_digest: checkpoint.digest, selector_snapshot_digest: sidecar.digest,
      diagnostics: [{ code: 'ACCEPTED_STATE_INTEGRITY_FAILURE', affected_refs: incident.affected_refs ?? [], message: incident.observed_failure }],
      available_actions: [], commit_receipt: commitReceipt, work_packet: { kind: 'terminal_work', terminal_kind: terminalKind }
    };
    const replyObject = await writeCasJson(layout.replies, reply);
    const receipt = await writeSealedV5Record(layout.receipts, { kind: 'v5_action_receipt', schema_version: V5_SCHEMA_VERSION, scope: 'run_integrity_quarantine', run_id: identity.run_id, receipt_sequence: 1, idempotency_key: request.idempotency_key, canonical_action_digest: actionDigest, reply_object_ref: { reply_digest: replyObject.digest }, commit_receipt: commitReceipt }, 'receipt_digest');
    const index = await writeSealedV5Record(layout.idempotencyIndexes, { kind: 'operational_idempotency_index', schema_version: V5_SCHEMA_VERSION, scope: 'run_integrity_quarantine', run_id: identity.run_id, index_sequence: 1, entries: [{ idempotency_key: request.idempotency_key, canonical_action_digest: actionDigest, receipt_digest: receipt.digest, reply_digest: replyObject.digest }] }, 'index_digest');
    const transaction = await writeSealedV5Record(layout.transactions, { scope: { kind: 'run', run_id: identity.run_id }, run_id: identity.run_id, transaction_kind: 'integrity_quarantine', recovery_sequence: 1, transaction_sequence: 1, previous_run_transaction_digest: null, run_genesis_record_digest: runGenesisRecordDigest, incident_record_digest: incidentRecord.digest, checkpoint_digest: checkpoint.digest, selector_sidecar_digest: sidecar.digest, reply_object_digest: replyObject.digest, receipt_digest: receipt.digest, idempotency_index_digest: index.digest }, 'transaction_digest');
    if (services.failAt === 'before_pointer_publish') throw new Error('INJECTED_CRASH: before_pointer_publish');
    await publishFixedRecord(layout.currentPointer, { kind: 'run_current_transaction_pointer', schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, run_genesis_record_digest: runGenesisRecordDigest, head_transaction_digest: transaction.digest }, 'pointer_digest', oldBytes);
    if (services.failAt === 'after_run_pointer') throw new Error('INJECTED_CRASH: after_run_pointer');
    return readCasJson(path.join(layout.replies, digestFilename(replyObject.digest)), replyObject.digest);
  });
}
