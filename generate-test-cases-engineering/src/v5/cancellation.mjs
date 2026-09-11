import { V5ProtocolError } from './errors.mjs';
import { canonicalV5Stringify } from './canonical-v5.mjs';
import { sealV5Record, verifyV5Record } from './storage-records.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const EVENT_KEYS = ['kind', 'schema_version', 'run_id', 'delivery_intent', 'case_document_lineage_id', 'prior_fsm_cell_id', 'terminal_fsm_cell_id', 'prior_checkpoint_digest', 'previous_run_transaction_digest', 'canonical_cancel_action_digest', 'cancel_event_digest'];

/** @param {Record<string,any>} value @param {string[]} keys */
function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** @param {{identity:Record<string,any>,priorCheckpoint:Record<string,any>,previousTransactionDigest:string,canonicalCancelActionDigest:string,terminalFsmCellId:string}} input */
export function createV5CancelEvent(input) {
  const { identity, priorCheckpoint, previousTransactionDigest, canonicalCancelActionDigest, terminalFsmCellId } = input;
  if (identity.schema_version !== '5.0.0' || priorCheckpoint.run_id !== identity.run_id || priorCheckpoint.case_document_lineage_id !== identity.case_document_lineage_id || priorCheckpoint.delivery_intent !== identity.delivery_intent || priorCheckpoint.run_lifecycle !== 'active' || !DIGEST.test(priorCheckpoint.checkpoint_digest) || !DIGEST.test(previousTransactionDigest) || !DIGEST.test(canonicalCancelActionDigest)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Cancel event predecessor binding is invalid.');
  const expectedTarget = identity.delivery_intent === 'case_document' ? 'cd.terminal.cancelled' : 'ep.terminal.cancelled';
  if (terminalFsmCellId !== expectedTarget) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Cancel event terminal cell does not match delivery intent.');
  return sealV5Record({
    kind: 'v5_run_cancelled', schema_version: '5.0.0', run_id: identity.run_id,
    delivery_intent: identity.delivery_intent, case_document_lineage_id: identity.case_document_lineage_id,
    prior_fsm_cell_id: priorCheckpoint.fsm_cell_id, terminal_fsm_cell_id: terminalFsmCellId,
    prior_checkpoint_digest: priorCheckpoint.checkpoint_digest,
    previous_run_transaction_digest: previousTransactionDigest,
    canonical_cancel_action_digest: canonicalCancelActionDigest
  }, 'cancel_event_digest');
}

/** @param {Record<string,any>} event @param {{identity:Record<string,any>,priorCheckpoint:Record<string,any>,previousTransactionDigest:string,canonicalCancelActionDigest:string,terminalFsmCellId:string}} input */
export function verifyV5CancelEvent(event, input) {
  try {
    if (!event || !exactKeys(event, EVENT_KEYS)) throw new Error('shape');
    verifyV5Record(event, 'cancel_event_digest');
    const expected = createV5CancelEvent(input);
    if (canonicalV5Stringify(event) !== canonicalV5Stringify(expected)) throw new Error('binding');
    return true;
  } catch {
    throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Cancel event does not bind the verified parent predecessor.');
  }
}

/** @param {Record<string,any>} event */
export function cancelledCheckpointExtension(event) {
  return {
    cancellation: 'cancelled', run_lifecycle: 'cancelled', stage: 'delivery', obligation: 'complete',
    prior_fsm_cell_id: event.prior_fsm_cell_id, terminal_fsm_cell_id: event.terminal_fsm_cell_id,
    cancel_event_digest: event.cancel_event_digest
  };
}
