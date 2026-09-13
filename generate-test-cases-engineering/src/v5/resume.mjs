import { canonicalV5Stringify } from './canonical-v5.mjs';
import { verifyV5CancelEvent } from './cancellation.mjs';
import { V5ProtocolError } from './errors.mjs';
import { canonicalObjectDigest, sealV5Record } from './storage-records.mjs';

const CONFIRM_REWIND = Object.freeze({
  'cd.active.requirements.confirm': 'cd.active.requirements.resolve',
  'cd.active.case.confirm': 'cd.active.case.resolve'
});

/** @param {string} priorCellId */
export function resumeTargetCell(priorCellId) {
  const target = /** @type {Record<string,string>} */ (CONFIRM_REWIND)[priorCellId] ?? priorCellId;
  const allowed = new Set(['cd.active.source.provide', 'cd.active.requirements.review', 'cd.active.requirements.resolve', 'cd.active.case.behavior', 'cd.active.case.drafts', 'cd.active.case.resolve', 'ep.active.closure.resolve', 'ep.active.final.confirm']);
  if (!allowed.has(target)) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Cancelled parent cell is not resumable.');
  return target;
}

/** @param {Record<string,any>} priorCheckpoint */
export function deriveResumeBase(priorCheckpoint) {
  if (!priorCheckpoint || typeof priorCheckpoint.checkpoint_digest !== 'string') throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Parent checkpoint is unavailable.');
  if (priorCheckpoint.delivery_intent === 'execution_plan') {
    if (!priorCheckpoint.case_document_ref || typeof priorCheckpoint.execution_snapshot_digest !== 'string' || !Array.isArray(priorCheckpoint.accepted_execution_receipt_digests)) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Execution resume closure is incomplete.');
    return { kind: 'execution_checkpoint', parent_checkpoint_digest: priorCheckpoint.checkpoint_digest, case_document_ref: structuredClone(priorCheckpoint.case_document_ref), execution_snapshot_digest: priorCheckpoint.execution_snapshot_digest, accepted_execution_receipt_digests: [...priorCheckpoint.accepted_execution_receipt_digests].sort() };
  }
  if (typeof priorCheckpoint.semantic_root_digest === 'string') return { kind: 'case_semantic_checkpoint', parent_checkpoint_digest: priorCheckpoint.checkpoint_digest, semantic_root_digest: priorCheckpoint.semantic_root_digest, accepted_artifact_digests: [...(priorCheckpoint.accepted_artifact_digests ?? [])].sort() };
  if (typeof priorCheckpoint.source_acquisition_state_digest !== 'string') throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Source resume closure is incomplete.');
  return {
    kind: 'source_checkpoint', parent_checkpoint_digest: priorCheckpoint.checkpoint_digest,
    source_acquisition_state_digest: priorCheckpoint.source_acquisition_state_digest,
    accepted_source_state: priorCheckpoint.accepted_source_state_digest == null ? { kind: 'none' } : { kind: 'accepted', accepted_source_state_digest: priorCheckpoint.accepted_source_state_digest }
  };
}

/** @param {{identity:Record<string,any>,terminalCheckpoint:Record<string,any>,priorCheckpoint:Record<string,any>,cancelEvent:Record<string,any>,previousTransactionDigest:string,canonicalCancelActionDigest:string}} input */
export function validateResumeParent(input) {
  if (input.identity?.schema_version !== '5.0.0') throw new V5ProtocolError('UNSUPPORTED_SCHEMA_VERSION', 'Only V5 parents may be resumed.');
  const terminal = input.terminalCheckpoint;
  if (!terminal || terminal.run_lifecycle !== 'cancelled' || terminal.cancel_event_digest !== input.cancelEvent?.cancel_event_digest || terminal.prior_fsm_cell_id !== input.priorCheckpoint?.fsm_cell_id || terminal.terminal_fsm_cell_id !== terminal.fsm_cell_id) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Parent is not a verified cancelled run.');
  verifyV5CancelEvent(input.cancelEvent, { identity: input.identity, priorCheckpoint: input.priorCheckpoint, previousTransactionDigest: input.previousTransactionDigest, canonicalCancelActionDigest: input.canonicalCancelActionDigest, terminalFsmCellId: terminal.fsm_cell_id });
  resumeTargetCell(input.priorCheckpoint.fsm_cell_id);
  deriveResumeBase(input.priorCheckpoint);
  return true;
}

/** @param {{parentRunId:string,childRunId:string,parentCheckpointDigest:string,parentCancelEventDigest:string,caseDocumentLineageId:string,inheritedObject:Record<string,any>}} input */
export function createResumeInheritanceProjection(input) {
  if (!['artifact', 'existing_execution_receipt'].includes(input.inheritedObject?.kind)) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Inherited object kind is invalid.');
  return sealV5Record({
    kind: 'resume_inheritance', parent_run_id: input.parentRunId, child_run_id: input.childRunId,
    parent_checkpoint_digest: input.parentCheckpointDigest, parent_cancel_event_digest: input.parentCancelEventDigest,
    case_document_lineage_id: input.caseDocumentLineageId, inherited_object: structuredClone(input.inheritedObject)
  }, 'projection_record_digest');
}

/** @param {Record<string,any>} parentEnvelope @param {Record<string,any>} projection @param {Record<string,any>} childIdentity @param {Map<string,string>} [digestReplacements] */
export function projectInheritedArtifact(parentEnvelope, projection, childIdentity, digestReplacements = new Map()) {
  if (projection.inherited_object?.kind !== 'artifact' || projection.parent_run_id !== parentEnvelope.producer_run_id || projection.child_run_id !== childIdentity.run_id || projection.case_document_lineage_id !== childIdentity.case_document_lineage_id || projection.inherited_object.parent_artifact_digest !== parentEnvelope.envelope_digest || projection.inherited_object.artifact_kind !== parentEnvelope.artifact_kind || projection.inherited_object.canonical_payload_digest !== parentEnvelope.canonical_payload_digest) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Artifact inheritance projection is not cross-bound.');
  const base = {
    kind: 'accepted_artifact_envelope', artifact_kind: parentEnvelope.artifact_kind, schema_version: '5.0.0', compiler_version: '0.6.0',
    payload_producer: 'agent', envelope_producer: 'compiler', producer_stage: parentEnvelope.producer_stage ?? 'source_acquisition',
    producer_run_id: childIdentity.run_id, case_document_lineage_id: childIdentity.case_document_lineage_id,
    accepted_revision: 0, input_digests: [...new Set((parentEnvelope.input_digests ?? []).map((/** @type {string} */ digest) => digestReplacements.get(digest) ?? digest))].sort(),
    canonical_payload_digest: parentEnvelope.canonical_payload_digest, payload: structuredClone(parentEnvelope.payload),
    resume_inheritance: { kind: 'resume_inheritance', projection_record_digest: projection.projection_record_digest }
  };
  return { ...base, envelope_digest: canonicalObjectDigest(base) };
}

/** @param {Record<string,any>} projection */
export function verifyResumeInheritanceProjection(projection) {
  const { projection_record_digest: declared, ...payload } = projection ?? {};
  if (canonicalObjectDigest(payload) !== declared || canonicalV5Stringify(projection).includes('action_token')) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Resume inheritance projection is invalid.');
  return true;
}
