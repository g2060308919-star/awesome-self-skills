// @ts-nocheck
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceV5Run, createV5RunDirectory } from '../../src/entry.mjs';
import { canonicalObjectDigest, actionDigestV5 } from '../../src/v5/storage-records.mjs';
import { commitCatalogGenesis } from '../../src/v5/transactions.mjs';
import {
  V5_EXECUTION_OPERATION_KINDS,
  advanceV5ExecutionProjection,
  canonicalExistingExecutionReceiptPayloadDigest,
  createV5ExecutionProjection,
  projectInheritedExecutionReceipt,
  validateImmutableV5CaseDocumentRef
} from '../../src/v5/execution-wrapper.mjs';
import { createResumeInheritanceProjection } from '../../src/v5/resume.mjs';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const caseRef = { run_id: 'RUN-case', revision: 4, manifest_digest: digest('a'), bundle_digest: digest('b'), case_document_lineage_id: 'LINEAGE-case', schema_version: '5.0.0' };
const planPayload = { schema_version: '5.0.0', compiler_version: '0.6.0', delivery_intent: 'execution_plan', case_document_ref: caseRef, operation_kinds: ['confirm_execution_plan', 'pause_execution', 'provide_capability_proof', 'set_execution_disposition'], items: [{ case_id: 'CASE-one', title: 'One', semantic_status: 'Grounded', execution_disposition: 'pending', available_actions: ['provide_capability_proof', 'set_execution_disposition'] }] };
const plan = { ...planPayload, plan_digest: canonicalObjectDigest(planPayload) };

process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY = Buffer.alloc(32, 23).toString('base64');
process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID = 'execution-test';

test('immutable V5 Case refs are exact and closed', () => {
  assert.deepEqual(validateImmutableV5CaseDocumentRef(caseRef), caseRef);
  assert.throws(() => validateImmutableV5CaseDocumentRef({ ...caseRef, schema_version: '4.0.0' }), /CASE_DOCUMENT_REFERENCE_INVALID/u);
  assert.throws(() => validateImmutableV5CaseDocumentRef({ ...caseRef, extra: true }), /CASE_DOCUMENT_REFERENCE_INVALID/u);
  assert.throws(() => createV5ExecutionProjection({ ...plan, plan_digest: digest('c') }), /CASE_DOCUMENT_REFERENCE_INVALID/u);
});

test('resume projects verified execution receipts into child-local identity', () => {
  const receiptPayload = { kind: 'capability_proof', ready: true, case_id: 'CASE-one' };
  const receipt = { ...receiptPayload, receipt_digest: canonicalObjectDigest(receiptPayload) };
  const inheritance = createResumeInheritanceProjection({ parentRunId: 'RUN-parent', childRunId: 'RUN-child', parentCheckpointDigest: digest('a'), parentCancelEventDigest: digest('b'), caseDocumentLineageId: 'LINEAGE-one', inheritedObject: { kind: 'existing_execution_receipt', parent_receipt_digest: receipt.receipt_digest, receipt_kind: receipt.kind, canonical_receipt_payload_digest: canonicalExistingExecutionReceiptPayloadDigest(receipt) } });
  const child = projectInheritedExecutionReceipt(receipt, inheritance, { run_id: 'RUN-child', case_document_lineage_id: 'LINEAGE-one' });
  assert.equal(child.producer_run_id, 'RUN-child');
  assert.equal(child.revision, 0);
  assert.equal(child.resume_inheritance.projection_record_digest, inheritance.projection_record_digest);
  assert.throws(() => canonicalExistingExecutionReceiptPayloadDigest({ ...receipt, ready: false }), /RESUME_PARENT_INVALID/u);
});

test('execution wrapper preserves exactly the four pre-existing operations', async () => {
  assert.deepEqual(V5_EXECUTION_OPERATION_KINDS, ['confirm_execution_plan', 'pause_execution', 'provide_capability_proof', 'set_execution_disposition']);
  const initial = createV5ExecutionProjection(plan);
  const disposition = await advanceV5ExecutionProjection(initial, { kind: 'set_execution_disposition', case_id: 'CASE-one', disposition: 'execute' });
  assert.equal(disposition.projection.items[0].execution_disposition, 'execute');
  assert.equal(disposition.result_key, 'set_execution_disposition:closure_complete');
  const paused = await advanceV5ExecutionProjection(disposition.projection, { kind: 'pause_execution' });
  assert.equal(paused.result_key, 'pause_execution');
  await assert.rejects(() => advanceV5ExecutionProjection(initial, { kind: 'execute_cases' }), /ACTION_NOT_ADVERTISED/u);
  assert.equal(JSON.stringify(initial).includes('execute_cases'), false);
});

test('capability proof is verified externally and never trusted from the submitted value', async () => {
  const initial = createV5ExecutionProjection(plan);
  await assert.rejects(() => advanceV5ExecutionProjection(initial, { kind: 'provide_capability_proof', case_id: 'CASE-one', proof: { type: 'account', value: 'claimed' } }), /ACTION_NOT_ADVERTISED/u);
  const receiptPayload = { kind: 'capability_proof', ready: true, case_id: 'CASE-one' };
  const result = await advanceV5ExecutionProjection(initial, { kind: 'provide_capability_proof', case_id: 'CASE-one', proof: { type: 'account', value: 'claimed' } }, { verifyCapabilityProof: async () => ({ verified: true, ready: true, receipt: { ...receiptPayload, receipt_digest: canonicalObjectDigest(receiptPayload) } }) });
  assert.equal(result.result_key, 'provide_capability_proof:closure_open');
  assert.equal(result.receipt.kind, 'capability_proof');
});

test('public execution run wraps a verified finished V5 Case and reaches confirmation without executing cases', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-execution-'));
  const storedPlanPayload = { ...plan, plan_digest: undefined };
  delete storedPlanPayload.plan_digest;
  const storedPlan = { ...storedPlanPayload, plan_digest: canonicalObjectDigest(storedPlanPayload) };
  const storedRef = storedPlan.case_document_ref;
  const identity = {
    kind: 'v5_run_identity', schema_version: '5.0.0', compiler_version: '0.6.0',
    run_id: storedRef.run_id, run_directory_key: storedRef.run_id, delivery_intent: 'case_document',
    case_document_lineage_id: storedRef.case_document_lineage_id,
    canonical_create_request_digest: canonicalObjectDigest({ fixture: 'finished-case' }),
    creation_binding: { kind: 'case_document', source_bootstrap_digest: `sha256:${'a'.repeat(64)}`, source_acquisition_policy_digest: `sha256:${'b'.repeat(64)}` }
  };
  const checkpoint = { kind: 'v5_run_checkpoint', schema_version: '5.0.0', compiler_version: '0.6.0', run_id: identity.run_id, case_document_lineage_id: identity.case_document_lineage_id, delivery_intent: 'case_document', run_lifecycle: 'finished', current_revision: storedRef.revision, fsm_cell_id: 'cd.terminal.finished', stage: 'delivery', obligation: 'complete', case_document_ref: storedRef, execution_plan_digest: storedPlan.plan_digest };
  await commitCatalogGenesis(catalog, { identity, checkpoint, selectorSidecar: { kind: 'v5_selector_sidecar', selectors: [] }, reply: { kind: 'run_reply', projection_kind: 'persisted_run_state', reply_status: 'finished', run_id: identity.run_id }, idempotencyKey: 'finished-case', canonicalActionDigest: actionDigestV5('create', { fixture: 'case' }), compilerStateRecords: [{ record: storedPlan, semanticDigest: storedPlan.plan_digest }] });

  const created = await createV5RunDirectory(catalog, { idempotency_key: 'create-execution', delivery_intent: 'execution_plan', case_document_ref: storedRef });
  assert.equal(created.obligation, 'resolve_execution_closure');
  const closure = created.available_actions.find((selector) => selector.capability.kind === 'advance_execution_plan');
  const ready = await advanceV5Run(created.run_directory, { idempotency_key: 'set-disposition', action: { kind: 'advance_execution_plan', action_token: closure.action_token, operation: { kind: 'set_execution_disposition', case_id: 'CASE-one', disposition: 'execute' } } });
  assert.equal(ready.reply_status, 'ready');
  const final = ready.available_actions.find((selector) => selector.capability.kind === 'advance_execution_plan');
  const finished = await advanceV5Run(created.run_directory, { idempotency_key: 'confirm', action: { kind: 'advance_execution_plan', action_token: final.action_token, operation: { kind: 'confirm_execution_plan' } } });
  assert.equal(finished.reply_status, 'finished');
  assert.equal(finished.work_packet.terminal_kind, 'execution_plan_finished');
});
