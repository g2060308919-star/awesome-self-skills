import { V5ProtocolError } from './errors.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

export const V5_EXECUTION_OPERATION_KINDS = Object.freeze(['confirm_execution_plan', 'pause_execution', 'provide_capability_proof', 'set_execution_disposition']);
const DIGEST = /^sha256:[0-9a-f]{64}$/u;

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {Record<string,any>} value @param {string[]} keys */
function exact(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }

/** @param {unknown} value */
export function validateImmutableV5CaseDocumentRef(value) {
  if (!object(value) || !exact(value, ['run_id', 'revision', 'manifest_digest', 'bundle_digest', 'case_document_lineage_id', 'schema_version']) || value.schema_version !== '5.0.0' || !nonblank(value.run_id) || !nonblank(value.case_document_lineage_id) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !DIGEST.test(value.manifest_digest) || !DIGEST.test(value.bundle_digest)) throw new V5ProtocolError('CASE_DOCUMENT_REFERENCE_INVALID', 'Immutable V5 Case Document reference is invalid.');
  return structuredClone(value);
}

/** @param {Record<string,any>} plan */
export function createV5ExecutionProjection(plan) {
  validateImmutableV5CaseDocumentRef(plan?.case_document_ref);
  if (!object(plan) || !exact(plan, ['schema_version', 'compiler_version', 'delivery_intent', 'case_document_ref', 'operation_kinds', 'items', 'plan_digest']) || plan.schema_version !== '5.0.0' || plan.compiler_version !== '0.6.0' || plan.delivery_intent !== 'execution_plan' || !Array.isArray(plan.operation_kinds) || JSON.stringify([...plan.operation_kinds].sort()) !== JSON.stringify(V5_EXECUTION_OPERATION_KINDS) || !Array.isArray(plan.items)) throw new V5ProtocolError('CASE_DOCUMENT_REFERENCE_INVALID', 'Compatibility Execution Plan is invalid.');
  const { plan_digest: declaredPlanDigest, ...planPayload } = plan;
  if (!DIGEST.test(declaredPlanDigest) || canonicalObjectDigest(planPayload) !== declaredPlanDigest) throw new V5ProtocolError('CASE_DOCUMENT_REFERENCE_INVALID', 'Compatibility Execution Plan digest is invalid.');
  const payload = {
    kind: 'v5_execution_projection', schema_version: '5.0.0', compiler_version: '0.6.0',
    case_document_ref: structuredClone(plan.case_document_ref), plan_digest: plan.plan_digest,
    operation_kinds: [...V5_EXECUTION_OPERATION_KINDS], items: structuredClone(plan.items),
    capability_receipts: [], paused: false, confirmed: false
  };
  return { ...payload, execution_snapshot_digest: canonicalObjectDigest(payload) };
}

/** @param {Record<string,any>} receipt */
export function canonicalExistingExecutionReceiptPayloadDigest(receipt) {
  if (!object(receipt) || !nonblank(receipt.kind) || !DIGEST.test(receipt.receipt_digest)) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Existing execution receipt is not in the closed receipt union.');
  const { receipt_digest: declared, ...payload } = receipt;
  if (canonicalObjectDigest(payload) !== declared) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Existing execution receipt digest is invalid.');
  return declared;
}

/** @param {Record<string,any>} receipt @param {Record<string,any>} inheritance @param {{run_id:string,case_document_lineage_id:string}} childIdentity */
export function projectInheritedExecutionReceipt(receipt, inheritance, childIdentity) {
  const canonicalReceiptPayloadDigest = canonicalExistingExecutionReceiptPayloadDigest(receipt);
  if (inheritance?.inherited_object?.kind !== 'existing_execution_receipt' || inheritance.inherited_object.parent_receipt_digest !== receipt.receipt_digest || inheritance.inherited_object.receipt_kind !== receipt.kind || inheritance.inherited_object.canonical_receipt_payload_digest !== canonicalReceiptPayloadDigest || inheritance.child_run_id !== childIdentity.run_id || inheritance.case_document_lineage_id !== childIdentity.case_document_lineage_id) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Execution receipt inheritance projection is not cross-bound.');
  return {
    receipt: structuredClone(receipt), producer_run_id: childIdentity.run_id, revision: 0,
    case_document_lineage_id: childIdentity.case_document_lineage_id,
    canonical_receipt_payload_digest: canonicalReceiptPayloadDigest,
    resume_inheritance: { kind: 'resume_inheritance', projection_record_digest: inheritance.projection_record_digest }
  };
}

/** @param {Record<string,any>} projection @returns {Record<string,any>} */
function reseal(projection) {
  const { execution_snapshot_digest: ignored, ...payload } = projection;
  return { ...payload, execution_snapshot_digest: canonicalObjectDigest(payload) };
}

/** @param {Record<string,any>} projection @param {Record<string,any>} operation @param {{verifyCapabilityProof?:(input:Record<string,any>)=>Promise<Record<string,any>>}} [services] @returns {Promise<Record<string,any>>} */
export async function advanceV5ExecutionProjection(projection, operation, services = {}) {
  if (!object(operation) || !V5_EXECUTION_OPERATION_KINDS.includes(operation.kind) || projection?.kind !== 'v5_execution_projection' || projection.confirmed === true) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Execution operation is not advertised.');
  const next = structuredClone(projection);
  let receipt = null;
  if (operation.kind === 'set_execution_disposition') {
    if (!exact(operation, ['kind', 'case_id', 'disposition']) || !['execute', 'do_not_execute'].includes(operation.disposition)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Execution disposition operation is invalid.');
    const item = next.items.find((/** @type {Record<string,any>} */ candidate) => candidate.case_id === operation.case_id && candidate.available_actions.includes(operation.kind));
    if (!item) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Execution disposition target is not advertised.');
    item.execution_disposition = operation.disposition;
    next.paused = false;
  } else if (operation.kind === 'provide_capability_proof') {
    if (!exact(operation, ['kind', 'case_id', 'proof']) || typeof services.verifyCapabilityProof !== 'function') throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Capability proof requires the registered external verifier.');
    const item = next.items.find((/** @type {Record<string,any>} */ candidate) => candidate.case_id === operation.case_id && candidate.available_actions.includes(operation.kind));
    if (!item) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Capability proof target is not advertised.');
    const verified = await services.verifyCapabilityProof({ case_document_ref: structuredClone(next.case_document_ref), case_id: operation.case_id, proof: structuredClone(operation.proof) });
    if (verified?.verified !== true || typeof verified.ready !== 'boolean' || !object(verified.receipt)) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Capability proof was not independently verified.');
    receipt = structuredClone(verified.receipt);
    next.capability_receipts.push(receipt);
    item.capability_ready = verified.ready;
    next.paused = false;
  } else if (operation.kind === 'pause_execution') {
    if (!exact(operation, ['kind'])) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Pause operation is invalid.');
    next.paused = true;
  } else {
    if (!exact(operation, ['kind'])) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Confirmation operation is invalid.');
    if (!next.items.every((/** @type {Record<string,any>} */ item) => item.execution_disposition !== 'pending')) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Execution Plan cannot be confirmed while dispositions are pending.');
    next.confirmed = true;
    next.paused = false;
  }
  const sealed = reseal(next);
  const closureComplete = sealed.items.every((/** @type {Record<string,any>} */ item) => item.execution_disposition !== 'pending');
  const resultKey = operation.kind === 'provide_capability_proof' || operation.kind === 'set_execution_disposition'
    ? `${operation.kind}:${closureComplete ? 'closure_complete' : 'closure_open'}` : operation.kind;
  return { projection: sealed, result_key: resultKey, ...(receipt ? { receipt } : {}) };
}
