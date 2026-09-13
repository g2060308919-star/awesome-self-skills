import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { digestFilename, resolveRunLayout, validateV5RelativePath } from './storage-paths.mjs';
import { canonicalObjectDigest, rawBytesDigest, sealV5Record, verifyV5Record } from './storage-records.mjs';

/** @param {string} directory */
export async function ensureV5Directory(directory) {
  const absolute = path.resolve(directory);
  const root = path.parse(absolute).root;
  const relative = path.relative(root, absolute);
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      const entry = await lstat(current);
      const systemTemporaryAlias = current === '/var' || current === '/tmp';
      if ((!systemTemporaryAlias && entry.isSymbolicLink()) || (!entry.isSymbolicLink() && !entry.isDirectory())) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', `Unsafe storage directory: ${current}`);
    } catch (error) {
      if (error instanceof V5ProtocolError) throw error;
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await mkdir(current);
      else throw error;
    }
  }
}

/** @param {string} filePath @param {any} bytes */
export async function writeAtomicFile(filePath, bytes) {
  await ensureV5Directory(path.dirname(filePath));
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.tmp-${process.pid}-${randomUUID()}`);
  const handle = await open(temporaryPath, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, filePath);
  const directoryHandle = await open(path.dirname(filePath), fsConstants.O_RDONLY);
  try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
}

/** @param {string} directory @param {unknown} value */
export async function writeCasJson(directory, value) {
  await ensureV5Directory(directory);
  const bytes = Buffer.from(canonicalV5Stringify(value));
  const digestValue = rawBytesDigest(bytes);
  const filePath = path.join(directory, digestFilename(digestValue));
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'CAS key collision or corrupted immutable object.');
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: digestValue, path: filePath };
}

/** @param {string} directory @param {Record<string, unknown>} record @param {string} digestField */
export async function writeSealedV5Record(directory, record, digestField) {
  const sealed = Object.hasOwn(record, digestField) ? verifyV5Record(record, digestField) : sealV5Record(record, digestField);
  const digestValue = /** @type {string} */ (sealed[digestField]);
  const filePath = path.join(directory, digestFilename(digestValue));
  const bytes = Buffer.from(canonicalV5Stringify(sealed));
  await ensureV5Directory(directory);
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Sealed record storage collision.');
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: digestValue, path: filePath, record: sealed };
}

/**
 * Store a canonical compiler-owned record under a semantic digest whose
 * preimage is defined by that record's contract instead of its storage bytes.
 * @param {string} directory
 * @param {Record<string, unknown>} record
 * @param {string} semanticDigest
 */
export async function writeSemanticV5Record(directory, record, semanticDigest) {
  const filePath = path.join(directory, digestFilename(semanticDigest));
  const bytes = Buffer.from(canonicalV5Stringify(record));
  await ensureV5Directory(directory);
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Semantic record storage collision.');
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: semanticDigest, path: filePath, record };
}

/** @param {string} directory @param {string} semanticDigest */
export async function readSemanticV5Record(directory, semanticDigest) {
  const filePath = path.join(directory, digestFilename(semanticDigest));
  let text;
  try { text = await readFile(filePath, 'utf8'); } catch { throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', `Semantic record ${semanticDigest} is unavailable.`); }
  let record;
  try { record = JSON.parse(text); } catch { throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Semantic record is not valid JSON.'); }
  if (canonicalV5Stringify(record) !== text) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Semantic record is not canonical JSON.');
  return record;
}

/** @param {string} filePath @param {string} expectedDigest */
export async function readCasJson(filePath, expectedDigest) {
  const bytes = await readFile(filePath);
  if (rawBytesDigest(bytes) !== expectedDigest) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'CAS object bytes do not match their digest.');
  let parsed;
  try { parsed = JSON.parse(bytes.toString('utf8')); } catch { throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'CAS object is not valid JSON.'); }
  if (canonicalV5Stringify(parsed) !== bytes.toString('utf8')) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'CAS object is not canonical JSON.');
  return parsed;
}

/** @param {string} directory @param {string} expectedDigest @param {string} digestField */
export async function readSealedV5Record(directory, expectedDigest, digestField) {
  const filePath = path.join(directory, digestFilename(expectedDigest));
  let parsed;
  try { parsed = JSON.parse(await readFile(filePath, 'utf8')); } catch { throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', `Sealed record ${expectedDigest} is unavailable.`); }
  verifyV5Record(parsed, digestField);
  if (parsed[digestField] !== expectedDigest || canonicalV5Stringify(parsed) !== await readFile(filePath, 'utf8')) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Sealed record binding is invalid.');
  return parsed;
}

/** @param {string} directory @param {any} bytes */
export async function writeRawSourceBytes(directory, bytes) {
  await ensureV5Directory(directory);
  const digestValue = rawBytesDigest(bytes);
  const filePath = path.join(directory, digestFilename(digestValue, '.bin'));
  try {
    const existing = await readFile(filePath);
    if (!existing.equals(bytes)) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Raw source CAS collision.');
  } catch (error) {
    if (error instanceof V5ProtocolError) throw error;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') await writeAtomicFile(filePath, bytes);
    else throw error;
  }
  return { digest: digestValue, path: filePath };
}

/** @param {string} fixedPath @param {string} digestField */
export async function readFixedSealedRecord(fixedPath, digestField) {
  let text;
  try { text = await readFile(fixedPath, 'utf8'); } catch { throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', `Required record ${path.basename(fixedPath)} is unavailable.`); }
  let record;
  try { record = JSON.parse(text); } catch { throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Fixed record is invalid JSON.'); }
  verifyV5Record(record, digestField);
  if (canonicalV5Stringify(record) !== text) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Fixed record is not canonical JSON.');
  return { record, bytes: Buffer.from(text) };
}

/** @param {string} fixedPath @param {Record<string, unknown>} record @param {string} digestField @param {any|null} expectedBytes */
export async function publishFixedRecord(fixedPath, record, digestField, expectedBytes) {
  const sealed = Object.hasOwn(record, digestField) ? verifyV5Record(record, digestField) : sealV5Record(record, digestField);
  let current = null;
  try { current = await readFile(fixedPath); } catch (error) { if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error; }
  if ((expectedBytes === null && current !== null) || (expectedBytes !== null && (current === null || !current.equals(expectedBytes)))) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Fixed-record compare-and-swap failed.');
  await writeAtomicFile(fixedPath, Buffer.from(canonicalV5Stringify(sealed)));
  return sealed;
}

/** @param {string} runDirectory */
export async function readVerifiedRun(runDirectory) {
  const layout = await resolveRunLayout(runDirectory);
  const identityFixed = await readFixedSealedRecord(layout.identity, 'run_identity_digest');
  const pointerFixed = await readFixedSealedRecord(layout.currentPointer, 'pointer_digest');
  const pointer = pointerFixed.record;
  if (pointer.run_id !== identityFixed.record.run_id) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Run pointer identity binding is invalid.');
  const genesis = await readSealedV5Record(layout.genesisRecords, pointer.run_genesis_record_digest, 'run_genesis_record_digest');
  const transaction = await readSealedV5Record(layout.transactions, pointer.head_transaction_digest, 'transaction_digest');
  if (transaction.transaction_kind === 'integrity_quarantine') {
    const checkpoint = await readSealedV5Record(layout.checkpoints, transaction.checkpoint_digest, 'checkpoint_digest');
    const selectorSidecar = await readSealedV5Record(layout.selectorSidecars, transaction.selector_sidecar_digest, 'selector_sidecar_digest');
    const index = await readSealedV5Record(layout.idempotencyIndexes, transaction.idempotency_index_digest, 'index_digest');
    const reply = await readCasJson(path.join(layout.replies, digestFilename(transaction.reply_object_digest)), transaction.reply_object_digest);
    const receipt = await readSealedV5Record(layout.receipts, transaction.receipt_digest, 'receipt_digest');
    const incident = await readSealedV5Record(layout.incidents, transaction.incident_record_digest, 'incident_record_digest');
    if (genesis.run_id !== identityFixed.record.run_id || genesis.run_identity_digest !== identityFixed.record.run_identity_digest || canonicalV5Stringify(genesis.run_identity) !== canonicalV5Stringify(identityFixed.record) || transaction.run_id !== identityFixed.record.run_id || transaction.run_genesis_record_digest !== genesis.run_genesis_record_digest || transaction.previous_run_transaction_digest !== null || transaction.recovery_sequence !== 1) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Quarantine transaction identity binding is invalid.');
    if (checkpoint.run_id !== identityFixed.record.run_id || checkpoint.run_lifecycle !== 'fatal' || checkpoint.fatal_incident_record_digest !== incident.incident_record_digest || selectorSidecar.checkpoint_digest !== checkpoint.checkpoint_digest) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Quarantine checkpoint binding is invalid.');
    if (index.scope !== 'run_integrity_quarantine' || index.index_sequence !== 1 || index.entries.length !== 1 || receipt.scope !== 'run_integrity_quarantine') throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Quarantine idempotency scope is invalid.');
    const entry = index.entries[0];
    if (entry.idempotency_key !== receipt.idempotency_key || entry.canonical_action_digest !== receipt.canonical_action_digest || entry.receipt_digest !== receipt.receipt_digest || entry.reply_digest !== transaction.reply_object_digest || receipt.reply_object_ref.reply_digest !== transaction.reply_object_digest) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Quarantine receipt/index/reply binding is invalid.');
    return { layout, identity: identityFixed.record, pointer, pointerBytes: pointerFixed.bytes, genesis, transaction, checkpoint, selectorSidecar, index, receipt, operationalEvent: null, incident, reply };
  }
  let chainCursor = transaction;
  let expectedSequence = transaction.transaction_sequence;
  while (chainCursor.previous_run_transaction_digest !== null) {
    const predecessor = await readSealedV5Record(layout.transactions, chainCursor.previous_run_transaction_digest, 'transaction_digest');
    if (predecessor.run_id !== identityFixed.record.run_id || predecessor.transaction_sequence !== expectedSequence - 1) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Run transaction chain is not contiguous.');
    chainCursor = predecessor;
    expectedSequence -= 1;
  }
  if (expectedSequence !== 0 || chainCursor.transaction_kind !== 'genesis' || chainCursor.transaction_digest !== genesis.initial_run_transaction_digest) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Run transaction genesis binding is invalid.');
  const checkpoint = await readSealedV5Record(layout.checkpoints, transaction.checkpoint_digest, 'checkpoint_digest');
  const selectorSidecar = await readSealedV5Record(layout.selectorSidecars, transaction.selector_sidecar_digest, 'selector_sidecar_digest');
  const index = await readSealedV5Record(layout.idempotencyIndexes, transaction.idempotency_index_digest, 'index_digest');
  const replyPath = path.join(layout.replies, digestFilename(transaction.reply_object_digest));
  const reply = await readCasJson(replyPath, transaction.reply_object_digest);
  const receipt = transaction.receipt_digest === null ? null : await readSealedV5Record(layout.receipts, transaction.receipt_digest, 'receipt_digest');
  let operationalEvent = null;
  let incident = null;
  if (transaction.operational_event_ref?.kind !== 'none') {
    if (transaction.operational_event_ref?.kind !== 'cancel_event' || typeof transaction.operational_event_ref.event_digest !== 'string') throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Operational event reference is invalid.');
    operationalEvent = await readSealedV5Record(layout.events, transaction.operational_event_ref.event_digest, 'cancel_event_digest');
  }
  if (transaction.transaction_kind === 'normal_fatal') {
    if (typeof transaction.incident_record_digest !== 'string') throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Normal fatal transaction has no incident binding.');
    incident = await readSealedV5Record(layout.incidents, transaction.incident_record_digest, 'incident_record_digest');
    if (checkpoint.fatal_incident_record_digest !== incident.incident_record_digest || incident.previous_run_transaction_digest !== transaction.previous_run_transaction_digest) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Normal fatal incident binding is invalid.');
  } else if (Object.hasOwn(transaction, 'incident_record_digest')) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Non-fatal transaction unexpectedly references a fatal incident.');
  if (genesis.run_id !== identityFixed.record.run_id || genesis.run_identity_digest !== identityFixed.record.run_identity_digest || canonicalV5Stringify(genesis.run_identity) !== canonicalV5Stringify(identityFixed.record) || genesis.run_directory_key !== identityFixed.record.run_directory_key || genesis.case_document_lineage_id !== identityFixed.record.case_document_lineage_id || genesis.checkpoint_digest !== chainCursor.checkpoint_digest || genesis.selector_sidecar_digest !== chainCursor.selector_sidecar_digest || chainCursor.run_identity_digest !== identityFixed.record.run_identity_digest || path.basename(layout.root) !== identityFixed.record.run_directory_key || transaction.run_id !== identityFixed.record.run_id || checkpoint.run_id !== identityFixed.record.run_id || index.run_id !== identityFixed.record.run_id) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Run object cross-binding is invalid.');
  if (selectorSidecar.checkpoint_digest !== checkpoint.checkpoint_digest || index.index_sequence !== transaction.transaction_sequence || index.entries.length !== transaction.transaction_sequence) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Checkpoint/sidecar/index sequence binding is invalid.');
  if (receipt && (receipt.reply_object_ref.reply_digest !== transaction.reply_object_digest || !index.entries.some((/** @type {Record<string, any>} */ entry) => entry.receipt_digest === receipt.receipt_digest && entry.reply_digest === transaction.reply_object_digest))) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Receipt/index/reply binding is invalid.');
  if (operationalEvent && (checkpoint.cancel_event_digest !== operationalEvent.cancel_event_digest || receipt?.canonical_action_digest !== operationalEvent.canonical_cancel_action_digest || transaction.previous_run_transaction_digest !== operationalEvent.previous_run_transaction_digest)) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Cancel event transaction binding is invalid.');
  for (const entry of index.entries) {
    const indexedReceipt = await readSealedV5Record(layout.receipts, entry.receipt_digest, 'receipt_digest');
    if (indexedReceipt.run_id !== identityFixed.record.run_id || indexedReceipt.idempotency_key !== entry.idempotency_key || indexedReceipt.canonical_action_digest !== entry.canonical_action_digest || indexedReceipt.reply_object_ref.reply_digest !== entry.reply_digest) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Indexed receipt binding is invalid.');
    await readCasJson(path.join(layout.replies, digestFilename(entry.reply_digest)), entry.reply_digest);
  }
  return { layout, identity: identityFixed.record, pointer, pointerBytes: pointerFixed.bytes, genesis, transaction, checkpoint, selectorSidecar, index, receipt, operationalEvent, incident, reply };
}

const COMPILER_SEALED_DIGEST_FIELDS = new Map([
  ['source_acquisition_state_digest', 'state_digest'],
  ['semantic_review_seed_digest', 'seed_digest'],
  ['term_registry_digest', 'registry_digest'],
  ['behavior_contract_seed_digest', 'seed_digest'],
  ['clarification_gaps_digest', 'gaps_digest'],
  ['pending_clarification_digest', 'pending_record_digest'],
  ['test_obligations_digest', 'obligations_digest'],
  ['case_compilation_context_digest', 'context_digest'],
  ['provenance_graph_digest', 'graph_digest']
]);

/** @param {string} code @param {string} targetKind @param {string[]} affectedRefs @param {unknown} cause */
function acceptedClosureFailure(code, targetKind, affectedRefs, cause) {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const error = new V5ProtocolError(code, `${targetKind} accepted-closure verification failed: ${detail}`);
  error.integrity_target_kind = targetKind;
  error.affected_refs = [...affectedRefs];
  return error;
}

/** @param {Record<string,any>} current */
export async function verifyV5AcceptedClosure(current) {
  const acceptedDigests = [...new Set(current.checkpoint.accepted_artifact_digests ?? [])].sort();
  for (const digest of acceptedDigests) {
    try { await readSealedV5Record(current.layout.acceptedArtifacts, digest, 'envelope_digest'); } catch (error) {
      throw acceptedClosureFailure('ACCEPTED_STATE_INTEGRITY_FAILURE', 'accepted_artifact', [digest], error);
    }
  }

  /** @type {Array<{field:string,digest:string}>} */
  const compilerRefs = [];
  const scalarFields = [
    'source_acquisition_state_digest', 'accepted_source_state_digest', 'semantic_review_seed_digest',
    'term_registry_digest', 'behavior_contract_seed_digest', 'clarification_gaps_digest',
    'question_part_state_set_digest', 'presentation_digest', 'preview_digest',
    'pending_clarification_digest', 'test_obligations_digest', 'risk_ledger_digest',
    'case_compilation_context_digest', 'provenance_graph_digest',
    'case_document_digest', 'execution_plan_digest', 'execution_snapshot_digest',
    'final_execution_projection_digest'
  ];
  for (const field of scalarFields) if (typeof current.checkpoint[field] === 'string') compilerRefs.push({ field, digest: current.checkpoint[field] });
  const arrayFields = ['accepted_decision_digests', 'accepted_execution_receipt_digests', 'compiler_projection_digests'];
  for (const field of arrayFields) for (const digest of current.checkpoint[field] ?? []) if (typeof digest === 'string') compilerRefs.push({ field, digest });
  for (const { field, digest } of compilerRefs.sort((left, right) => `${left.field}:${left.digest}`.localeCompare(`${right.field}:${right.digest}`))) {
    try {
      const digestField = field === 'compiler_projection_digests' ? 'projection_record_digest' : COMPILER_SEALED_DIGEST_FIELDS.get(field);
      if (digestField) await readSealedV5Record(current.layout.compilerState, digest, digestField);
      else await readSemanticV5Record(current.layout.compilerState, digest);
    } catch (error) {
      throw acceptedClosureFailure('ACCEPTED_STATE_INTEGRITY_FAILURE', 'compiler_state', [digest], error);
    }
  }

  if (typeof current.checkpoint.applied_clarification_impact_digest === 'string') {
    const digest = current.checkpoint.applied_clarification_impact_digest;
    try {
      const impact = await readSemanticV5Record(current.layout.compilerState, digest);
      if (impact.impact_digest !== digest) throw new V5ProtocolError('CLARIFICATION_IMPACT_MISMATCH', 'Applied clarification impact digest binding is invalid.');
    } catch (error) {
      throw acceptedClosureFailure('CLARIFICATION_IMPACT_MISMATCH', 'compiler_projection', [digest], error);
    }
  }

  for (const digest of [...new Set(current.checkpoint.rendered_output_digests ?? [])].sort()) {
    try { await readSealedV5Record(current.layout.renderedOutputs, digest, 'rendered_output_digest'); } catch (error) {
      throw acceptedClosureFailure('CANONICAL_RENDER_MISMATCH', 'renderer_output', [digest], error);
    }
  }
  return current;
}

/** @param {string} runDirectory @param {() => Promise<any>} operation */
export async function withV5RunLock(runDirectory, operation) {
  const layout = await resolveRunLayout(runDirectory);
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await mkdir(layout.lockDirectory);
      try { return await operation(); } finally { await rm(layout.lockDirectory, { recursive: true, force: true }); }
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Timed out acquiring V5 run lock.');
}

export { canonicalObjectDigest, validateV5RelativePath };
