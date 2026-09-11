import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { issueSelectors, verifySelector } from './action-tokens.mjs';
import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5_COMPILER_VERSION, V5_SCHEMA_VERSION } from './constants.mjs';
import { acceptArtifactEnvelope } from './envelopes.mjs';
import { V5ProtocolError } from './errors.mjs';
import { generateV5Contracts } from './registry-generator.mjs';
import { readCasJson, readSealedV5Record, readVerifiedRun, writeRawSourceBytes } from './run-store.mjs';
import { applySourceBatch, currentSourceBatch, deriveSourceRequests, validateSourceBootstrap } from './source-acquisition.mjs';
import { resolveCatalogLayout, digestFilename } from './storage-paths.mjs';
import { actionDigestV5, canonicalObjectDigest, sealV5Record } from './storage-records.mjs';
import { commitCatalogGenesis, commitNormalRunTransaction } from './transactions.mjs';

const contracts = generateV5Contracts();
const fsmByCell = new Map(contracts.fsmRegistry.cells.map((/** @type {Record<string, any>} */ cell) => [cell.cell_id, cell]));

/** @param {unknown} value @returns {value is Record<string, any>} */
function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** @param {Record<string, any>} value @param {string[]} expected */
function hasExactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

/** @param {string} code @param {'protocol_error'|'fatal'} status @param {string} message */
function preRunReply(code, status, message) {
  return { reply_kind: 'pre_run_error', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION, status, diagnostics: [{ code, affected_refs: [], message }], available_actions: [] };
}

/** @param {Record<string, any>} currentReply @param {string} code @param {string} status @param {string} message @param {string} [replyKind] */
function runRejection(currentReply, code, status, message, replyKind = 'persisted_run_state') {
  return { ...structuredClone(currentReply), reply_kind: replyKind, status, diagnostics: [{ code, affected_refs: [], message }], commit_receipt: null };
}

function loadActionKeyring() {
  const encoded = process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY;
  const keyId = process.env.GENERATE_TEST_CASES_V5_ACTION_TOKEN_KEY_ID ?? 'default';
  const key = typeof encoded === 'string' ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  if (key.length < 32) throw new V5ProtocolError('ACTION_TOKEN_KEY_UNAVAILABLE', 'Configure a persistent V5 action-token master key.');
  return { current: { key_id: keyId, key }, retained: [] };
}

/** @param {Record<string, any>} request */
function validateCreateRequest(request) {
  if (!plainObject(request) || typeof request.idempotency_key !== 'string' || request.idempotency_key.length === 0) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Create request is invalid.');
  if (request.delivery_intent === 'case_document') {
    if (!hasExactKeys(request, ['idempotency_key', 'delivery_intent', 'source_bootstrap'])) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Case create request has extra or missing fields.');
    return { kind: 'case_document', sourceBootstrap: validateSourceBootstrap(request.source_bootstrap) };
  }
  if (request.delivery_intent === 'execution_plan') {
    if (!hasExactKeys(request, ['idempotency_key', 'delivery_intent', 'case_document_ref'])) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Execution create request has extra or missing fields.');
    throw new V5ProtocolError('CASE_DOCUMENT_REFERENCE_INVALID', 'Execution Plan create requires a verified immutable V5 Case Document.');
  }
  if (request.creation_reason === 'resume_cancelled') {
    if (!hasExactKeys(request, ['idempotency_key', 'creation_reason', 'parent_run_id'])) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Resume create request has extra or missing fields.');
    throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Cancelled parent verification is unavailable before the resume reducer is installed.');
  }
  throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Create request does not match a V5 branch.');
}

/** @param {Record<string, any>} checkpoint @param {Array<Record<string, any>>} capabilities */
function checkpointSelectors(checkpoint, capabilities) {
  const sealedCheckpoint = sealV5Record(checkpoint, 'checkpoint_digest');
  const issued = issueSelectors(sealedCheckpoint, capabilities, loadActionKeyring());
  return { checkpoint: sealedCheckpoint, selectors: issued.selectors, sidecar: issued.sidecar };
}

/** @param {Record<string, any>} request @param {Array<Record<string, any>>} sourceRequests */
function createSourceState(request, sourceRequests) {
  const ledger = sealV5Record({
    schema_version: V5_SCHEMA_VERSION,
    source_bootstrap_digest: `sha256:${createHash('sha256').update(canonicalV5Stringify(request.source_bootstrap)).digest('hex')}`,
    source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest,
    dispositions: [], accepted_source_state_digest: null,
    next_batch_request_ids: currentSourceBatch(sourceRequests).map((sourceRequest) => sourceRequest.request_id)
  }, 'ledger_digest');
  return sealV5Record({ schema_version: V5_SCHEMA_VERSION, source_bootstrap: request.source_bootstrap, source_requests: sourceRequests, source_acquisition_policy: contracts.sourceAcquisitionPolicy, ledger }, 'state_digest');
}

/** @param {Record<string, any>} state */
function sourceWorkPacket(state) {
  const disposed = new Set(state.ledger.dispositions.map((/** @type {Record<string, any>} */ disposition) => disposition.request_id));
  const batch = currentSourceBatch(state.source_requests.filter((/** @type {Record<string, any>} */ request) => !disposed.has(request.request_id)));
  return {
    kind: 'source_work',
    accepted_source_state: state.ledger.accepted_source_state_digest === null ? { kind: 'none' } : { kind: 'partial', accepted_source_state_digest: state.ledger.accepted_source_state_digest },
    source_requests: batch,
    source_acquisition_policy: contracts.sourceAcquisitionPolicy,
    source_acquisition_state_digest: state.state_digest
  };
}

/** @param {Record<string, any>} checkpoint @param {Record<string, any>} workPacket @param {Array<Record<string, any>>} selectors @param {Record<string, any>} receipt @param {string} runDirectory */
function persistedReply(checkpoint, workPacket, selectors, receipt, runDirectory) {
  const cell = fsmByCell.get(checkpoint.fsm_cell_id);
  return {
    reply_kind: 'persisted_run_state', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION,
    status: cell.normal_reply_status, run_id: checkpoint.run_id, run_directory: runDirectory,
    case_document_lineage_id: checkpoint.case_document_lineage_id, delivery_intent: checkpoint.delivery_intent,
    run_lifecycle: checkpoint.run_lifecycle, stage: checkpoint.stage, obligation: checkpoint.obligation,
    current_revision: checkpoint.current_revision, checkpoint_digest: checkpoint.checkpoint_digest,
    diagnostics: [], available_actions: selectors, commit_receipt: receipt, work_packet: workPacket
  };
}

/** @param {Record<string, any>} current @param {Record<string, any>} request */
async function resolveRunReplay(current, request) {
  const entry = current.index.entries.find((/** @type {Record<string, any>} */ row) => row.idempotency_key === request.idempotency_key);
  if (!entry) return null;
  const submittedDigest = actionDigestV5('advance', request.action);
  if (entry.canonical_action_digest !== submittedDigest) throw new V5ProtocolError('IDEMPOTENCY_CONFLICT', 'Idempotency key was used with a different action.');
  return readCasJson(path.join(current.layout.replies, digestFilename(entry.reply_digest)), entry.reply_digest);
}

/** @param {Record<string, any>} current @param {Record<string, any>} action @param {Record<string, any>} capability */
function validateAdvertisedAction(current, action, capability) {
  const sidecarEntry = current.selectorSidecar.selectors.find((/** @type {Record<string, any>} */ selector) => canonicalV5Stringify(selector.capability) === canonicalV5Stringify(capability));
  if (!sidecarEntry || typeof action.action_token !== 'string' || sidecarEntry.token_digest !== `sha256:${createHash('sha256').update(action.action_token).digest('hex')}`) throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Action is not advertised by the current checkpoint.');
  verifySelector(current.checkpoint, capability, action.action_token, loadActionKeyring());
}

/** @param {string} catalogRoot @param {unknown} requestValue */
export async function createV5RunDirectory(catalogRoot, requestValue) {
  try {
    const branch = validateCreateRequest(/** @type {Record<string, any>} */ (requestValue));
    const catalog = await resolveCatalogLayout(catalogRoot);
    if (branch.kind !== 'case_document') throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Unsupported create branch.');
    const request = /** @type {Record<string, any>} */ (requestValue);
    const sourceRequests = deriveSourceRequests(branch.sourceBootstrap);
    const runId = `RUN-${randomUUID()}`;
    const lineageId = `LINEAGE-${randomUUID()}`;
    const runDirectory = path.join(catalog.runsDirectory, runId);
    const createPayload = {
      delivery_intent: 'case_document',
      source_bootstrap: branch.sourceBootstrap,
      source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest
    };
    const createActionDigest = actionDigestV5('create', createPayload);
    const sourceState = createSourceState({ source_bootstrap: branch.sourceBootstrap }, sourceRequests);
    const selectorState = checkpointSelectors({
      kind: 'v5_run_checkpoint', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION,
      run_id: runId, case_document_lineage_id: lineageId, delivery_intent: 'case_document', run_lifecycle: 'active', current_revision: 0,
      fsm_cell_id: 'cd.active.source.provide', stage: 'source_acquisition', obligation: 'provide_source_pack',
      fsm_registry_digest: contracts.fsmRegistry.registry_digest, rules_bundle_digest: contracts.replyContracts.rules_bundle_digest,
      source_acquisition_state_digest: sourceState.state_digest, accepted_artifact_digests: [], semantic_root_digest: null
    }, [{ kind: 'submit_source_batch', request_ids: sourceWorkPacket(sourceState).source_requests.map((item) => item.request_id) }, { kind: 'cancel_run' }]);
    const receipt = { kind: 'operational_commit', committed_action_digest: createActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'run_created' };
    const reply = persistedReply(selectorState.checkpoint, sourceWorkPacket(sourceState), selectorState.selectors, receipt, runDirectory);
    const identity = {
      kind: 'v5_run_identity', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION,
      run_id: runId, delivery_intent: 'case_document', case_document_lineage_id: lineageId,
      source_bootstrap_digest: /** @type {Record<string, any>} */ (sourceState.ledger).source_bootstrap_digest,
      source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest,
      canonical_create_action_digest: createActionDigest
    };
    const committed = await commitCatalogGenesis(catalog.root, {
      identity, checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply,
      idempotencyKey: request.idempotency_key, canonicalActionDigest: createActionDigest,
      compilerStateRecords: [{ record: sourceState, digestField: 'state_digest' }]
    });
    return committed.reply;
  } catch (error) {
    if (error instanceof V5ProtocolError) {
      if (error.code === 'ACTION_TOKEN_KEY_UNAVAILABLE' || error.code === 'POLICY_REGISTRY_INCONSISTENT') throw error;
      const status = ['UNSUPPORTED_SCHEMA_VERSION', 'ACCEPTED_STATE_INTEGRITY_FAILURE'].includes(error.code) ? 'fatal' : 'protocol_error';
      return preRunReply(error.code, status, error.message);
    }
    throw error;
  }
}

/** @param {string} runDirectory @param {unknown} requestValue */
export async function advanceV5Run(runDirectory, requestValue) {
  let current;
  try { current = await readVerifiedRun(runDirectory); } catch (error) {
    if (error instanceof V5ProtocolError) return preRunReply(error.code, error.code === 'ACCEPTED_STATE_INTEGRITY_FAILURE' ? 'fatal' : 'protocol_error', error.message);
    throw error;
  }
  if (!plainObject(requestValue) || !hasExactKeys(requestValue, ['idempotency_key', 'action']) || typeof requestValue.idempotency_key !== 'string' || requestValue.idempotency_key.length === 0 || !plainObject(requestValue.action)) return runRejection(current.reply, 'SCHEMA_VALIDATION_FAILED', 'need_revision', 'Advance request is invalid.');
  const request = /** @type {Record<string, any>} */ (requestValue);
  try {
    const replay = await resolveRunReplay(current, request);
    if (replay) return replay;
    if (current.identity.schema_version !== V5_SCHEMA_VERSION) throw new V5ProtocolError('UNSUPPORTED_SCHEMA_VERSION', 'Only V5 runs are operational.');
    if (current.checkpoint.run_lifecycle !== 'active') return runRejection(current.reply, 'ACTION_NOT_ADVERTISED', 'protocol_error', 'Terminal runs do not accept new actions.', 'read_only_terminal_rejection');
    const action = request.action;
    if (action.kind === 'submit_source_batch' && current.checkpoint.fsm_cell_id === 'cd.active.source.provide') return await advanceSourceBatch(current, request);
    if (action.kind === 'cancel_run') return await advanceCancel(current, request);
    throw new V5ProtocolError('ACTION_NOT_ADVERTISED', 'Action is not advertised in the current FSM cell.');
  } catch (error) {
    if (!(error instanceof V5ProtocolError)) throw error;
    if (error.code === 'ACTION_TOKEN_KEY_UNAVAILABLE') throw error;
    const status = error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'ACTION_NOT_ADVERTISED' ? 'protocol_error' : 'need_revision';
    return runRejection(current.reply, error.code, status, error.message);
  }
}

/** @param {Record<string, any>} current @param {Record<string, any>} request */
async function advanceSourceBatch(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'request_ids', 'request_dispositions', 'source_payload'])) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source batch action has extra or missing fields.');
  const sourceState = /** @type {Record<string, any>} */ (await readSealedV5Record(current.layout.compilerState, current.checkpoint.source_acquisition_state_digest, 'state_digest'));
  const work = sourceWorkPacket(sourceState);
  const capability = { kind: 'submit_source_batch', request_ids: work.source_requests.map((/** @type {Record<string, any>} */ item) => item.request_id) };
  validateAdvertisedAction(current, action, capability);
  const applied = applySourceBatch(work.source_requests, action);
  const acceptedArtifacts = [];
  const compilerStateRecords = [];
  let acceptedSourceStateDigest = sourceState.ledger.accepted_source_state_digest;
  let acceptedEnvelope = null;
  /** @type {Map<string, string>} */
  const acceptedDigestByClientKey = new Map();
  /** @type {string[]} */
  let acceptedSourcePayloadDigests = current.checkpoint.accepted_source_payload_digests ?? [];
  if (applied.sourcePack) {
    const acceptedSources = [];
    for (const source of applied.sourcePack.sources) {
      const sourcePayload = { media_type: source.media_type, content: source.content };
      const sourceObjectDigest = canonicalObjectDigest(sourcePayload);
      acceptedDigestByClientKey.set(source.source_client_key, sourceObjectDigest);
      acceptedSources.push({ ...sourcePayload, source_object_digest: sourceObjectDigest });
      await writeRawSourceBytes(current.layout.rawSourceBytes, Buffer.from(source.content, 'utf8'));
    }
    acceptedEnvelope = acceptArtifactEnvelope({ artifactKind: 'source_pack', payload: { sources: acceptedSources }, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: 'source_acquisition', inputDigests: [sourceState.state_digest] });
    acceptedArtifacts.push({ record: acceptedEnvelope, digestField: 'envelope_digest' });
    acceptedSourcePayloadDigests = [...new Set([...acceptedSourcePayloadDigests, ...acceptedDigestByClientKey.values()])].sort();
    const acceptedSourceStateBase = {
      kind: 'accepted_source_state',
      schema_version: V5_SCHEMA_VERSION,
      accepted_source_payload_digests: acceptedSourcePayloadDigests
    };
    const acceptedSourceState = {
      ...acceptedSourceStateBase,
      state_digest: canonicalObjectDigest({
        namespace: 'generate-test-cases/v5/accepted-source-state',
        format_version: 1,
        accepted_source_payload_digests: acceptedSourcePayloadDigests
      })
    };
    acceptedSourceStateDigest = acceptedSourceState.state_digest;
    compilerStateRecords.push({ record: acceptedSourceState, semanticDigest: acceptedSourceState.state_digest });
  }
  const newDispositions = applied.dispositions.map((disposition) => disposition.outcome === 'fulfilled'
    ? {
        request_id: disposition.request_id,
        outcome: 'fulfilled',
        accepted_source_object_digests: [...new Set(disposition.source_client_keys.map((/** @type {string} */ key) => acceptedDigestByClientKey.get(key)))].sort()
      }
    : disposition);
  const dispositions = [...sourceState.ledger.dispositions, ...newDispositions].sort((left, right) => left.request_id.localeCompare(right.request_id));
  const disposed = new Set(dispositions.map((disposition) => disposition.request_id));
  const outstanding = sourceState.source_requests.filter((/** @type {Record<string, any>} */ sourceRequest) => !disposed.has(sourceRequest.request_id));
  const nextBatch = currentSourceBatch(outstanding);
  const ledger = sealV5Record({ schema_version: V5_SCHEMA_VERSION, source_bootstrap_digest: sourceState.ledger.source_bootstrap_digest, source_acquisition_policy_digest: contracts.sourceAcquisitionPolicy.policy_digest, dispositions, accepted_source_state_digest: acceptedSourceStateDigest, next_batch_request_ids: nextBatch.map((item) => item.request_id) }, 'ledger_digest');
  const nextSourceState = sealV5Record({ schema_version: V5_SCHEMA_VERSION, source_bootstrap: sourceState.source_bootstrap, source_requests: sourceState.source_requests, source_acquisition_policy: contracts.sourceAcquisitionPolicy, ledger }, 'state_digest');
  compilerStateRecords.push({ record: nextSourceState, digestField: 'state_digest' });
  const complete = nextBatch.length === 0;
  const nextCell = complete ? 'cd.active.requirements.review' : 'cd.active.source.provide';
  const revisionDelta = acceptedEnvelope ? 1 : 0;
  const acceptedArtifactDigests = [...new Set([...current.checkpoint.accepted_artifact_digests, ...(acceptedEnvelope ? [acceptedEnvelope.envelope_digest] : [])])].sort();
  const checkpointBase = {
    ...current.checkpoint, checkpoint_digest: undefined,
    current_revision: current.checkpoint.current_revision + revisionDelta,
    fsm_cell_id: nextCell, stage: complete ? 'requirements_analysis' : 'source_acquisition', obligation: complete ? 'review_semantic_seed' : 'provide_source_pack',
    source_acquisition_state_digest: nextSourceState.state_digest, accepted_artifact_digests: acceptedArtifactDigests,
    accepted_source_payload_digests: acceptedSourcePayloadDigests, accepted_source_state_digest: acceptedSourceStateDigest
  };
  delete checkpointBase.checkpoint_digest;
  const capabilities = complete
    ? [{ kind: 'submit_artifact', artifact_kind: 'evidence_claims' }, { kind: 'cancel_run' }]
    : [{ kind: 'submit_source_batch', request_ids: nextBatch.map((item) => item.request_id) }, { kind: 'cancel_run' }];
  const selectorState = checkpointSelectors(checkpointBase, capabilities);
  const workPacket = complete ? {
    kind: 'semantic_review_work',
    context: { source: { accepted_source_state_digest: acceptedSourceStateDigest, source_pack_digests: acceptedArtifactDigests }, compiler_rules: { rules_bundle_digest: contracts.replyContracts.rules_bundle_digest } },
    semantic_review_seed: { status: 'compiler_derivation_pending', accepted_source_state_digest: acceptedSourceStateDigest }
  } : sourceWorkPacket(nextSourceState);
  const committedActionDigest = actionDigestV5('advance', action);
  const commitReceipt = acceptedEnvelope
    ? { kind: 'artifact_commit', committed_action_digest: committedActionDigest, semantic_revision_delta: 1, client_key_bindings: [] }
    : { kind: 'operational_commit', committed_action_digest: committedActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: complete ? 'source_acquisition_advanced' : 'source_acquisition_advanced' };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root);
  return commitNormalRunTransaction(current.layout.root, /** @type {{idempotency_key:string,action:Record<string,any>}} */ (request), { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, acceptedArtifacts, compilerStateRecords });
}

/** @param {Record<string, any>} current @param {Record<string, any>} request */
async function advanceCancel(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'reason']) || typeof action.reason !== 'string' || action.reason.trim().length === 0) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Cancel action is invalid.');
  validateAdvertisedAction(current, action, { kind: 'cancel_run' });
  const targetCell = current.identity.delivery_intent === 'case_document' ? 'cd.terminal.cancelled' : 'ep.terminal.cancelled';
  const checkpointBase = { ...current.checkpoint, checkpoint_digest: undefined, run_lifecycle: 'cancelled', fsm_cell_id: targetCell, stage: 'delivery', obligation: 'complete', prior_fsm_cell_id: current.checkpoint.fsm_cell_id };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, []);
  const digestValue = actionDigestV5('advance', action);
  const commitReceipt = { kind: 'operational_commit', committed_action_digest: digestValue, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'run_cancelled' };
  const reply = persistedReply(selectorState.checkpoint, { kind: 'terminal_work', terminal_kind: current.identity.delivery_intent === 'case_document' ? 'case_document_cancelled' : 'execution_plan_cancelled' }, [], commitReceipt, current.layout.root);
  return commitNormalRunTransaction(current.layout.root, /** @type {{idempotency_key:string,action:Record<string,any>}} */ (request), { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt });
}

/** @param {string} runDirectory */
export async function inspectV5Run(runDirectory) {
  try {
    const current = await readVerifiedRun(runDirectory);
    return structuredClone(current.reply);
  } catch (error) {
    if (error instanceof V5ProtocolError) {
      if (error.code === 'RUN_ARGUMENT_INVALID') return preRunReply('RUN_ARGUMENT_INVALID', 'protocol_error', error.message);
      return { reply_kind: 'read_only_integrity_fatal', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION, status: 'fatal', diagnostics: [{ code: 'ACCEPTED_STATE_INTEGRITY_FAILURE', affected_refs: [], message: error.message }], available_actions: [], last_verified_state: { kind: 'none' } };
    }
    throw error;
  }
}
