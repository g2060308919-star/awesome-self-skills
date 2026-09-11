// @ts-nocheck
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceV5Run, createV5RunDirectory } from '../../src/entry.mjs';
import { createV5CancelEvent, verifyV5CancelEvent } from '../../src/v5/cancellation.mjs';
import {
  createResumeInheritanceProjection,
  deriveResumeBase,
  projectInheritedArtifact,
  resumeTargetCell,
  validateResumeParent
} from '../../src/v5/resume.mjs';

const digest = (letter) => `sha256:${letter.repeat(64)}`;
const identity = { schema_version: '5.0.0', run_id: 'RUN-parent', delivery_intent: 'case_document', case_document_lineage_id: 'LINEAGE-parent' };
const prior = { ...identity, kind: 'v5_run_checkpoint', compiler_version: '0.6.0', run_lifecycle: 'active', fsm_cell_id: 'cd.active.case.behavior', stage: 'case_design', obligation: 'provide_behavior_views', current_revision: 3, checkpoint_digest: digest('a'), semantic_root_digest: digest('b'), accepted_artifact_digests: [digest('c')] };
const transaction = { transaction_digest: digest('d') };
const actionDigest = digest('e');

process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY = Buffer.alloc(32, 19).toString('base64');
process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID = 'resume-test';

test('cancel event is closed, self-digested, and cross-bound to its predecessor', () => {
  const event = createV5CancelEvent({ identity, priorCheckpoint: prior, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest, terminalFsmCellId: 'cd.terminal.cancelled' });
  assert.equal(event.kind, 'v5_run_cancelled');
  assert.equal(verifyV5CancelEvent(event, { identity, priorCheckpoint: prior, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest, terminalFsmCellId: 'cd.terminal.cancelled' }), true);
  assert.throws(() => verifyV5CancelEvent({ ...event, run_id: 'RUN-other' }, { identity, priorCheckpoint: prior, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest, terminalFsmCellId: 'cd.terminal.cancelled' }), /RESUME_PARENT_INVALID/u);
});

test('all three ResumeBase variants and confirm-cell rewinds are deterministic', () => {
  assert.deepEqual(deriveResumeBase({ ...prior, semantic_root_digest: null, source_acquisition_state_digest: digest('f'), accepted_source_state_digest: null }), { kind: 'source_checkpoint', parent_checkpoint_digest: digest('a'), source_acquisition_state_digest: digest('f'), accepted_source_state: { kind: 'none' } });
  assert.equal(deriveResumeBase(prior).kind, 'case_semantic_checkpoint');
  assert.equal(deriveResumeBase({ ...prior, delivery_intent: 'execution_plan', case_document_ref: { run_id: 'RUN-case' }, execution_snapshot_digest: digest('f'), accepted_execution_receipt_digests: [] }).kind, 'execution_checkpoint');
  assert.equal(resumeTargetCell('cd.active.requirements.confirm'), 'cd.active.requirements.resolve');
  assert.equal(resumeTargetCell('cd.active.case.confirm'), 'cd.active.case.resolve');
  assert.equal(resumeTargetCell('ep.active.final.confirm'), 'ep.active.final.confirm');
});

test('resume inheritance creates child-local envelopes without writable parent identity', () => {
  const cancelEvent = createV5CancelEvent({ identity, priorCheckpoint: prior, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest, terminalFsmCellId: 'cd.terminal.cancelled' });
  const parentEnvelope = { schema_version: '5.0.0', artifact_kind: 'source_pack', canonical_payload_digest: digest('1'), envelope_digest: digest('2'), payload: { sources: [] }, accepted_revision: 2, producer_run_id: identity.run_id, case_document_lineage_id: identity.case_document_lineage_id };
  const projection = createResumeInheritanceProjection({ parentRunId: identity.run_id, childRunId: 'RUN-child', parentCheckpointDigest: prior.checkpoint_digest, parentCancelEventDigest: cancelEvent.cancel_event_digest, caseDocumentLineageId: identity.case_document_lineage_id, inheritedObject: { kind: 'artifact', parent_artifact_digest: parentEnvelope.envelope_digest, artifact_kind: parentEnvelope.artifact_kind, canonical_payload_digest: parentEnvelope.canonical_payload_digest } });
  const child = projectInheritedArtifact(parentEnvelope, projection, { run_id: 'RUN-child', delivery_intent: 'case_document', case_document_lineage_id: identity.case_document_lineage_id });
  assert.equal(child.producer_run_id, 'RUN-child');
  assert.equal(child.accepted_revision, 0);
  assert.equal(child.resume_inheritance.projection_record_digest, projection.projection_record_digest);
  assert.notEqual(child.envelope_digest, parentEnvelope.envelope_digest);
  assert.equal(JSON.stringify(child).includes('action_token'), false);
});

test('resume parent requires a verified V5 cancelled closure and matching cancel event', () => {
  const event = createV5CancelEvent({ identity, priorCheckpoint: prior, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest, terminalFsmCellId: 'cd.terminal.cancelled' });
  const terminal = { ...prior, run_lifecycle: 'cancelled', fsm_cell_id: 'cd.terminal.cancelled', prior_fsm_cell_id: prior.fsm_cell_id, terminal_fsm_cell_id: 'cd.terminal.cancelled', cancel_event_digest: event.cancel_event_digest };
  assert.equal(validateResumeParent({ identity, terminalCheckpoint: terminal, priorCheckpoint: prior, cancelEvent: event, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest }), true);
  assert.throws(() => validateResumeParent({ identity: { ...identity, schema_version: '4.0.0' }, terminalCheckpoint: terminal, priorCheckpoint: prior, cancelEvent: event, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest }), /UNSUPPORTED_SCHEMA_VERSION/u);
  assert.throws(() => validateResumeParent({ identity, terminalCheckpoint: { ...terminal, run_lifecycle: 'finished' }, priorCheckpoint: prior, cancelEvent: event, previousTransactionDigest: transaction.transaction_digest, canonicalCancelActionDigest: actionDigest }), /RESUME_PARENT_INVALID/u);
});

test('public cancellation persists one event and resume creates an active child without staging inheritance', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'gtc-v5-resume-'));
  const created = await createV5RunDirectory(catalog, { idempotency_key: 'create-parent', delivery_intent: 'case_document', source_bootstrap: { source_request_seeds: [{ source_request_client_key: 'prd', source_role: 'primary_prd', locator: { kind: 'inline_text', media_type: 'text/markdown', content: 'Create an order.' }, required: true }] } });
  const cancelSelector = created.available_actions.find((selector) => selector.capability.kind === 'cancel_run');
  const cancelled = await advanceV5Run(created.run_directory, { idempotency_key: 'cancel-parent', action: { kind: 'cancel_run', action_token: cancelSelector.action_token, reason: 'operator requested stop' } });
  assert.equal(cancelled.reply_status, 'cancelled');
  const eventFiles = await readdir(path.join(created.run_directory, 'objects', 'events'));
  assert.equal(eventFiles.length, 1);
  const resumed = await createV5RunDirectory(catalog, { idempotency_key: 'resume-child', creation_reason: 'resume_cancelled', parent_run_id: created.run_id });
  assert.equal(resumed.run_lifecycle, 'active');
  assert.equal(resumed.current_revision, 0);
  assert.equal(resumed.obligation, 'provide_source_pack');
  assert.notEqual(resumed.run_id, created.run_id);
  assert.deepEqual(await readdir(path.join(resumed.run_directory, '.staging')), []);
  assert.deepEqual(await advanceV5Run(created.run_directory, { idempotency_key: 'cancel-parent', action: { kind: 'cancel_run', action_token: cancelSelector.action_token, reason: 'operator requested stop' } }), cancelled);
});
