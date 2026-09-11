import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { issueSelectors, verifySelector } from './action-tokens.mjs';
import { canonicalV5Stringify } from './canonical-v5.mjs';
import { cancelledCheckpointExtension, createV5CancelEvent } from './cancellation.mjs';
import { V5_COMPILER_VERSION, V5_SCHEMA_VERSION } from './constants.mjs';
import { acceptArtifactEnvelope } from './envelopes.mjs';
import { V5ProtocolError } from './errors.mjs';
import { actionTemplateForV5Action, selectV5Outcome } from './fsm.mjs';
import { generateV5Contracts } from './registry-generator.mjs';
import { readCasJson, readFixedSealedRecord, readSealedV5Record, readSemanticV5Record, readVerifiedRun, writeRawSourceBytes } from './run-store.mjs';
import { applySourceBatch, currentSourceBatch, deriveSourceRequests, validateSourceBootstrap } from './source-acquisition.mjs';
import { resolveCatalogLayout, resolveRunLayout, digestFilename } from './storage-paths.mjs';
import { deriveBehaviorContractSeed, validateBehaviorContractReviews, validateRiskReviews } from './behavior-contracts.mjs';
import { deriveSemanticReviewSeed } from './semantic-seed.mjs';
import { validateSemanticReviews } from './semantic-reviews.mjs';
import { createSemanticRuleIndex } from './semantic-rules.mjs';
import { actionDigestV5, canonicalObjectDigest, sealV5Record } from './storage-records.mjs';
import { commitCatalogGenesis, commitNormalRunTransaction } from './transactions.mjs';
import { createResumeInheritanceProjection, deriveResumeBase, projectInheritedArtifact, resumeTargetCell, validateResumeParent } from './resume.mjs';
import { advanceV5ExecutionProjection, canonicalExistingExecutionReceiptPayloadDigest, createV5ExecutionProjection, projectInheritedExecutionReceipt, validateImmutableV5CaseDocumentRef } from './execution-wrapper.mjs';
import { createClarificationPresentation, createQuestionPartStateSet } from './question-parts.mjs';
import { previewClarificationResponse } from './clarification-preview.mjs';
import { commitClarificationResponse, discardPendingClarification } from './clarification-reducer.mjs';
import { compileV5CaseDocument, projectCompatibilityExecutionPlan } from './case-compiler.mjs';
import { renderV5Json } from './render-json.mjs';
import { renderV5Markdown } from './render-markdown.mjs';
import { renderV5Csv } from './render-csv.mjs';
import { runtimeV5ActionKeyring, runtimeV5Uuid } from './runtime-services.mjs';

const contracts = generateV5Contracts();
const fsmByCell = new Map(contracts.fsmRegistry.cells.map((/** @type {Record<string, any>} */ cell) => [cell.cell_id, cell]));
const replyRows = contracts.replyContracts.rows;

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

/** @param {string} code @param {string} message */
function preRunReply(code, message) {
  const row = replyRows.find((/** @type {Record<string,any>} */ candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === code && candidate.source.response_context === 'pre_run');
  if (!row) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', `Pre-run reply contract is missing for ${code}.`);
  return { kind: 'pre_run_error', schema_version: V5_SCHEMA_VERSION, reply_contract_id: row.reply_contract_id, reply_status: row.exact_reply_status, diagnostics: [{ code, affected_refs: [], message }] };
}

/** @param {Record<string, any>} current @param {string} code @param {string} message @param {string} [projectionKind] */
function runRejection(current, code, message, projectionKind = 'persisted_run_state') {
  const cellId = current.checkpoint.fsm_cell_id;
  const row = replyRows.find((/** @type {Record<string,any>} */ candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === code && candidate.source.response_context === 'run_mutation' && candidate.source.trigger_state?.fsm_cell_id === cellId && candidate.exact_projection_kind === projectionKind);
  if (!row) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', `Run reply contract is missing for ${code}/${cellId}/${projectionKind}.`);
  return { ...structuredClone(current.reply), projection_kind: projectionKind, reply_contract_id: row.reply_contract_id, reply_status: row.exact_reply_status, available_actions: projectionKind === 'read_only_terminal_rejection' ? [] : structuredClone(current.reply.available_actions), diagnostics: [{ code, affected_refs: [], message }], commit_receipt: null };
}

/** @param {Record<string,any>} current @param {Record<string,any>} request @param {string} code @param {string} message */
async function persistRunRejection(current, request, code, message) {
  const reply = runRejection(current, code, message);
  const internalReceipt = { kind: 'operational_commit', committed_action_digest: actionDigestV5('advance', request.action), semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'idempotency_only' };
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: current.checkpoint, selectorSidecar: current.selectorSidecar, reply, commitReceipt: internalReceipt });
}

/** @param {Record<string,any>} current @param {Record<string,any>} request @param {string} message */
async function persistOracleReroute(current, request, message) {
  const row = replyRows.find((/** @type {Record<string,any>} */ candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === 'ORACLE_SEMANTICS_REQUIRED' && candidate.source.response_context === 'run_mutation' && candidate.source.trigger_state?.fsm_cell_id === current.checkpoint.fsm_cell_id);
  if (!row || row.exact_commit.kind !== 'operational_commit') throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'Oracle reroute reply contract is unavailable.');
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, 'seed_digest');
  const workPacket = { kind: 'behavior_work', context: current.reply.work_packet.context, permission_matrix_worklists: [], behavior_contract_worklist: seed };
  const checkpointBase = { ...current.checkpoint, fsm_cell_id: 'cd.active.case.behavior', stage: row.exact_stage, obligation: row.exact_obligation };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(checkpointBase.fsm_cell_id, workPacket));
  const actionDigest = actionDigestV5('advance', request.action);
  const commitReceipt = { kind: 'operational_commit', committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: row.exact_commit.effect };
  const reply = {
    ...structuredClone(current.reply), projection_kind: row.exact_projection_kind, reply_contract_id: row.reply_contract_id,
    reply_status: row.exact_reply_status, stage: row.exact_stage, obligation: row.exact_obligation,
    checkpoint_digest: selectorState.checkpoint.checkpoint_digest, selector_snapshot_digest: selectorState.sidecar.selector_sidecar_digest,
    available_actions: selectorState.selectors, work_packet: workPacket, commit_receipt: commitReceipt,
    diagnostics: [{ code: 'ORACLE_SEMANTICS_REQUIRED', affected_refs: [], message }]
  };
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt });
}

function loadActionKeyring() {
  const keyring = runtimeV5ActionKeyring();
  if (keyring.current.key.length < 32) throw new V5ProtocolError('ACTION_TOKEN_KEY_UNAVAILABLE', 'Configure a persistent V5 action-token master key.');
  return keyring;
}

/** @param {Record<string, any>} request @returns {{kind:'case_document',sourceBootstrap:{source_request_seeds:Record<string,any>[]}}|{kind:'execution_plan',caseDocumentRef:Record<string,any>}|{kind:'resume_cancelled',parentRunId:string}} */
function validateCreateRequest(request) {
  if (!plainObject(request) || typeof request.idempotency_key !== 'string' || request.idempotency_key.length === 0) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Create request is invalid.');
  if (request.delivery_intent === 'case_document') {
    if (!hasExactKeys(request, ['idempotency_key', 'delivery_intent', 'source_bootstrap'])) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Case create request has extra or missing fields.');
    return { kind: 'case_document', sourceBootstrap: validateSourceBootstrap(request.source_bootstrap) };
  }
  if (request.delivery_intent === 'execution_plan') {
    if (!hasExactKeys(request, ['idempotency_key', 'delivery_intent', 'case_document_ref'])) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Execution create request has extra or missing fields.');
    return { kind: 'execution_plan', caseDocumentRef: validateImmutableV5CaseDocumentRef(request.case_document_ref) };
  }
  if (request.creation_reason === 'resume_cancelled') {
    if (!hasExactKeys(request, ['idempotency_key', 'creation_reason', 'parent_run_id'])) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Resume create request has extra or missing fields.');
    if (!/^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u.test(request.parent_run_id)) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Parent run ID is invalid.');
    return { kind: 'resume_cancelled', parentRunId: request.parent_run_id };
  }
  throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Create request does not match a V5 branch.');
}

/** @param {string} cellId @param {Record<string,any>} workPacket */
function capabilitiesForCell(cellId, workPacket) {
  const cell = fsmByCell.get(cellId);
  if (!cell || cell.lifecycle !== 'active') return [];
  return cell.allowed_action_template_ids.map((/** @type {string} */ templateId) => {
    if (templateId === 'run.cancel') return { kind: 'cancel_run' };
    if (templateId === 'source.submit_batch') return { kind: 'submit_source_batch', request_ids: workPacket.source_requests.map((/** @type {Record<string,any>} */ request) => request.request_id) };
    if (templateId.startsWith('artifact.submit_')) return { kind: 'submit_artifact', artifact_kind: templateId.slice('artifact.submit_'.length) };
    if (templateId === 'clarification.preview') return { kind: 'preview_clarification_response', presentation_id: workPacket.presentation.presentation_id, semantic_root_digest: workPacket.presentation.semantic_root_digest };
    if (templateId === 'clarification.commit') return { kind: 'commit_clarification_response', presentation_id: workPacket.presentation.presentation_id, semantic_root_digest: workPacket.presentation.semantic_root_digest, preview_digest: workPacket.clarification_preview.preview_digest };
    if (templateId === 'execution.advance_closure') return { kind: 'advance_execution_plan', allowed_operation_kinds: ['provide_capability_proof', 'set_execution_disposition'] };
    if (templateId === 'execution.confirm_or_pause') return { kind: 'advance_execution_plan', allowed_operation_kinds: ['pause_execution', 'confirm_execution_plan'] };
    throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', `Unknown action template ${templateId}.`);
  }).sort((/** @type {Record<string,any>} */ left, /** @type {Record<string,any>} */ right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right)));
}

/** @param {unknown} value @param {Map<string,string>} replacements @returns {unknown} */
function rewriteDigestRefs(value, replacements) {
  if (typeof value === 'string') return replacements.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => rewriteDigestRefs(item, replacements));
  if (plainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteDigestRefs(child, replacements)]));
  return value;
}

/** @param {string} compilerStateDirectory @param {string[]} roots @returns {Promise<Array<{record:Record<string,any>,semanticDigest?:string,digestField?:string}>>} */
async function cloneCompilerStateRecords(compilerStateDirectory, roots) {
  /** @type {Array<{record:Record<string,any>,semanticDigest?:string,digestField?:string}>} */
  const records = [];
  const pending = [...new Set(roots)].filter((value) => /^sha256:[0-9a-f]{64}$/u.test(value));
  const visited = new Set();
  while (pending.length > 0) {
    const semanticDigest = pending.shift();
    if (!semanticDigest) break;
    if (visited.has(semanticDigest)) continue;
    visited.add(semanticDigest);
    const file = path.join(compilerStateDirectory, digestFilename(semanticDigest));
    let record;
    try { record = JSON.parse(await readFile(file, 'utf8')); } catch { continue; }
    if (['clarification_preview', 'pending_clarification'].includes(record.kind) || record.status === 'pending' || record.status === 'superseded') continue;
    records.push({ record, semanticDigest });
    collectDigestRefs(record, pending);
  }
  return records;
}

/** @param {unknown} value @param {string[]} output */
function collectDigestRefs(value, output) {
  if (typeof value === 'string') {
    if (/^sha256:[0-9a-f]{64}$/u.test(value)) output.push(value);
    return;
  }
  if (Array.isArray(value)) for (const child of value) collectDigestRefs(child, output);
  else if (plainObject(value)) for (const child of Object.values(value)) collectDigestRefs(child, output);
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

function agentVisibleCompilerRules() {
  return {
    rules_bundle_digest: contracts.replyContracts.rules_bundle_digest,
    answer_constraint_registry: contracts.answerConstraintRegistry,
    clarification_control_registry: contracts.clarificationControlRegistry,
    source_acquisition_policy: contracts.sourceAcquisitionPolicy,
    permission_derivation_registry: contracts.permissionDerivationRegistry,
    semantic_rule_index_projection: { kind: 'not_available_before_behavior' }
  };
}

/** @param {Array<Record<string,any>>} semanticGaps @param {'requirements_gap'|'behavior_gap'} kind */
function compilerClarificationGaps(semanticGaps, kind) {
  return semanticGaps.map((gap) => {
    if (!plainObject(gap.answer_contract) || typeof gap.question !== 'string' || gap.question.trim().length === 0 || typeof gap.why_needed !== 'string' || gap.why_needed.trim().length === 0 || !plainObject(gap.question_impact_summary) || !plainObject(gap.target)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'A semantic gap must provide its typed answer contract and exact clarification projection.');
    const payload = { kind, target: gap.target, answer_contract: gap.answer_contract, question: gap.question, why_needed: gap.why_needed, question_impact_summary: gap.question_impact_summary };
    const gapPayloadDigest = canonicalObjectDigest(payload);
    return { gap_binding: { kind, gap_id: `GAP-${gapPayloadDigest.slice(7)}`, gap_payload_digest: gapPayloadDigest }, answer_contract: structuredClone(gap.answer_contract), target: structuredClone(gap.target), question: gap.question, why_needed: gap.why_needed, question_impact_summary: structuredClone(gap.question_impact_summary) };
  }).sort((left, right) => left.gap_binding.gap_id.localeCompare(right.gap_binding.gap_id));
}

/** @param {Record<string, any>} checkpoint @param {Record<string, any>} workPacket @param {Array<Record<string, any>>} selectors @param {Record<string, any>} receipt @param {string} runDirectory @param {string} outcomeId @param {string} selectorSnapshotDigest */
function persistedReply(checkpoint, workPacket, selectors, receipt, runDirectory, outcomeId, selectorSnapshotDigest) {
  const cell = fsmByCell.get(checkpoint.fsm_cell_id);
  const row = replyRows.find((/** @type {Record<string,any>} */ candidate) => candidate.source.kind === 'fsm_outcome' && candidate.source.outcome_id === outcomeId);
  if (!cell || !row || row.exact_reply_status !== cell.normal_reply_status) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'FSM reply contract is unavailable or inconsistent.');
  return {
    kind: 'run_reply', schema_version: V5_SCHEMA_VERSION, projection_kind: 'persisted_run_state', reply_contract_id: row.reply_contract_id,
    reply_status: cell.normal_reply_status, run_id: checkpoint.run_id, run_directory: runDirectory,
    case_document_lineage_id: checkpoint.case_document_lineage_id, delivery_intent: checkpoint.delivery_intent,
    run_lifecycle: checkpoint.run_lifecycle, stage: checkpoint.stage, obligation: checkpoint.obligation,
    current_revision: checkpoint.current_revision, checkpoint_digest: checkpoint.checkpoint_digest,
    selector_snapshot_digest: selectorSnapshotDigest,
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
    const request = /** @type {Record<string, any>} */ (requestValue);
    if (branch.kind === 'execution_plan') return await createExecutionRun(catalog, request, branch.caseDocumentRef);
    if (branch.kind === 'resume_cancelled') return await createResumedRun(catalog, request, branch.parentRunId);
    const sourceRequests = deriveSourceRequests(branch.sourceBootstrap);
    const runId = `RUN-${runtimeV5Uuid()}`;
    const lineageId = `LINEAGE-${runtimeV5Uuid()}`;
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
    const createOutcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'create', create_variant: 'case_document', result_key: 'initial' });
    const reply = persistedReply(selectorState.checkpoint, sourceWorkPacket(sourceState), selectorState.selectors, receipt, runDirectory, createOutcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
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
      return preRunReply(error.code, error.message);
    }
    throw error;
  }
}

/** @param {Record<string,any>} catalog @param {Record<string,any>} request @param {Record<string,any>} caseDocumentRef */
async function createExecutionRun(catalog, request, caseDocumentRef) {
  const sourceRun = await readVerifiedRun(path.join(catalog.runsDirectory, caseDocumentRef.run_id));
  if (sourceRun.identity.schema_version !== V5_SCHEMA_VERSION || sourceRun.identity.delivery_intent !== 'case_document' || sourceRun.checkpoint.run_lifecycle !== 'finished' || canonicalV5Stringify(sourceRun.checkpoint.case_document_ref) !== canonicalV5Stringify(caseDocumentRef) || typeof sourceRun.checkpoint.execution_plan_digest !== 'string') throw new V5ProtocolError('CASE_DOCUMENT_REFERENCE_INVALID', 'Case Document reference is not a verified immutable V5 delivery.');
  const plan = await readSemanticV5Record(sourceRun.layout.compilerState, sourceRun.checkpoint.execution_plan_digest);
  const projection = createV5ExecutionProjection(plan);
  const runId = `RUN-${runtimeV5Uuid()}`;
  const runDirectory = path.join(catalog.runsDirectory, runId);
  const createActionDigest = actionDigestV5('create', request);
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'create', create_variant: 'execution_plan', result_key: 'initial' });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    kind: 'v5_run_checkpoint', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION,
    run_id: runId, case_document_lineage_id: caseDocumentRef.case_document_lineage_id, delivery_intent: 'execution_plan',
    run_lifecycle: 'active', current_revision: 0, fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation,
    fsm_registry_digest: contracts.fsmRegistry.registry_digest, rules_bundle_digest: contracts.replyContracts.rules_bundle_digest,
    case_document_ref: caseDocumentRef, execution_snapshot_digest: projection.execution_snapshot_digest,
    accepted_execution_receipt_digests: []
  };
  const workPacket = { kind: 'execution_work', case_document_ref: caseDocumentRef, execution_projection: projection };
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const receipt = { kind: 'operational_commit', committed_action_digest: createActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'run_created' };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, receipt, runDirectory, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  const identity = {
    kind: 'v5_run_identity', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION,
    run_id: runId, delivery_intent: 'execution_plan', case_document_lineage_id: caseDocumentRef.case_document_lineage_id,
    case_document_ref: caseDocumentRef, canonical_create_action_digest: createActionDigest
  };
  return (await commitCatalogGenesis(catalog.root, {
    identity, checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply,
    idempotencyKey: request.idempotency_key, canonicalActionDigest: createActionDigest,
    compilerStateRecords: [{ record: projection, semanticDigest: projection.execution_snapshot_digest }]
  })).reply;
}

/** @param {Record<string,any>} catalog @param {Record<string,any>} request @param {string} parentRunId */
async function createResumedRun(catalog, request, parentRunId) {
  const parent = await readVerifiedRun(path.join(catalog.runsDirectory, parentRunId));
  if (parent.identity.schema_version !== V5_SCHEMA_VERSION) throw new V5ProtocolError('UNSUPPORTED_SCHEMA_VERSION', 'Only V5 parents may be resumed.');
  if (parent.checkpoint.run_lifecycle !== 'cancelled' || !parent.operationalEvent || !parent.transaction.previous_run_transaction_digest) throw new V5ProtocolError('RESUME_PARENT_INVALID', 'Parent does not have a verified cancellation event.');
  const priorTransaction = await readSealedV5Record(parent.layout.transactions, parent.transaction.previous_run_transaction_digest, 'transaction_digest');
  const priorCheckpoint = await readSealedV5Record(parent.layout.checkpoints, priorTransaction.checkpoint_digest, 'checkpoint_digest');
  validateResumeParent({ identity: parent.identity, terminalCheckpoint: parent.checkpoint, priorCheckpoint, cancelEvent: parent.operationalEvent, previousTransactionDigest: priorTransaction.transaction_digest, canonicalCancelActionDigest: parent.operationalEvent.canonical_cancel_action_digest });
  const resumeBase = deriveResumeBase(priorCheckpoint);
  const targetCellId = resumeTargetCell(priorCheckpoint.fsm_cell_id);
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'create', create_variant: 'resume_cancelled', result_key: `target:${targetCellId}` });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const runId = `RUN-${runtimeV5Uuid()}`;
  const runDirectory = path.join(catalog.runsDirectory, runId);
  const childIdentityProjection = { run_id: runId, delivery_intent: parent.identity.delivery_intent, case_document_lineage_id: parent.identity.case_document_lineage_id };
  /** @type {Map<string,string>} */
  const digestReplacements = new Map();
  /** @type {Array<{record:Record<string,any>,digestField:string}>} */
  const acceptedArtifacts = [];
  const priorReply = await readCasJson(path.join(parent.layout.replies, digestFilename(priorTransaction.reply_object_digest)), priorTransaction.reply_object_digest);
  let workPacket = structuredClone(priorReply.work_packet);
  if (targetCellId.endsWith('.resolve') && workPacket.kind === 'clarification_confirmation_work') {
    workPacket = { kind: 'clarification_work', context: workPacket.context, presentation: workPacket.presentation };
  }
  /** @type {string[]} */
  const closureRootValues = [];
  const checkpointForClosure = structuredClone(priorCheckpoint);
  for (const key of ['checkpoint_digest', 'cancellation', 'cancel_event_digest', 'prior_fsm_cell_id', 'terminal_fsm_cell_id', 'preview_digest', 'pending_clarification_digest']) delete checkpointForClosure[key];
  collectDigestRefs(checkpointForClosure, closureRootValues);
  collectDigestRefs(workPacket, closureRootValues);
  const compilerStateRecords = await cloneCompilerStateRecords(parent.layout.compilerState, closureRootValues);
  /** @type {Array<Record<string,any>>} */
  const parentEnvelopes = [];
  for (const parentArtifactDigest of priorCheckpoint.accepted_artifact_digests ?? []) parentEnvelopes.push(await readSealedV5Record(parent.layout.acceptedArtifacts, parentArtifactDigest, 'envelope_digest'));
  parentEnvelopes.sort((left, right) => left.accepted_revision - right.accepted_revision || left.envelope_digest.localeCompare(right.envelope_digest));
  for (const parentEnvelope of parentEnvelopes) {
    const projection = createResumeInheritanceProjection({ parentRunId, childRunId: runId, parentCheckpointDigest: priorCheckpoint.checkpoint_digest, parentCancelEventDigest: parent.operationalEvent.cancel_event_digest, caseDocumentLineageId: parent.identity.case_document_lineage_id, inheritedObject: { kind: 'artifact', parent_artifact_digest: parentEnvelope.envelope_digest, artifact_kind: parentEnvelope.artifact_kind, canonical_payload_digest: parentEnvelope.canonical_payload_digest } });
    const childEnvelope = projectInheritedArtifact(parentEnvelope, projection, childIdentityProjection, digestReplacements);
    digestReplacements.set(parentEnvelope.envelope_digest, childEnvelope.envelope_digest);
    acceptedArtifacts.push({ record: childEnvelope, digestField: 'envelope_digest' });
    compilerStateRecords.push({ record: projection, digestField: 'projection_record_digest' });
  }
  /** @type {string[]} */
  const projectedExecutionReceiptDigests = [];
  for (const parentReceiptDigest of priorCheckpoint.accepted_execution_receipt_digests ?? []) {
    const receipt = await readSemanticV5Record(parent.layout.compilerState, parentReceiptDigest);
    const canonicalReceiptPayloadDigest = canonicalExistingExecutionReceiptPayloadDigest(receipt);
    const projection = createResumeInheritanceProjection({ parentRunId, childRunId: runId, parentCheckpointDigest: priorCheckpoint.checkpoint_digest, parentCancelEventDigest: parent.operationalEvent.cancel_event_digest, caseDocumentLineageId: parent.identity.case_document_lineage_id, inheritedObject: { kind: 'existing_execution_receipt', parent_receipt_digest: parentReceiptDigest, receipt_kind: receipt.kind, canonical_receipt_payload_digest: canonicalReceiptPayloadDigest } });
    const childReceipt = projectInheritedExecutionReceipt(receipt, projection, childIdentityProjection);
    const childReceiptDigest = canonicalObjectDigest(childReceipt);
    digestReplacements.set(parentReceiptDigest, childReceiptDigest);
    projectedExecutionReceiptDigests.push(childReceiptDigest);
    compilerStateRecords.push({ record: projection, digestField: 'projection_record_digest' }, { record: childReceipt, semanticDigest: childReceiptDigest });
  }
  workPacket = /** @type {Record<string,any>} */ (rewriteDigestRefs(workPacket, digestReplacements));
  const inherited = /** @type {Record<string,any>} */ (rewriteDigestRefs(priorCheckpoint, digestReplacements));
  /** @type {Record<string,any>} */
  const checkpointBase = {
    ...inherited, run_id: runId, run_lifecycle: 'active', current_revision: 0,
    fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation,
    accepted_artifact_digests: acceptedArtifacts.map((item) => item.record.envelope_digest).sort(),
    ...(priorCheckpoint.delivery_intent === 'execution_plan' ? { accepted_execution_receipt_digests: projectedExecutionReceiptDigests.sort() } : {}),
    resume_lineage: { creation_reason: 'resume_cancelled', parent_run_id: parentRunId, parent_cancel_event_digest: parent.operationalEvent.cancel_event_digest, resume_base: resumeBase }
  };
  for (const key of ['checkpoint_digest', 'cancellation', 'cancel_event_digest', 'prior_fsm_cell_id', 'terminal_fsm_cell_id', 'preview_digest', 'pending_clarification_digest']) delete checkpointBase[key];
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const createActionDigest = actionDigestV5('create', request);
  const receipt = { kind: 'operational_commit', committed_action_digest: createActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'run_created' };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, receipt, runDirectory, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  const identity = {
    kind: 'v5_run_identity', schema_version: V5_SCHEMA_VERSION, compiler_version: V5_COMPILER_VERSION,
    run_id: runId, delivery_intent: parent.identity.delivery_intent, case_document_lineage_id: parent.identity.case_document_lineage_id,
    resume_lineage: checkpointBase.resume_lineage, canonical_create_action_digest: createActionDigest
  };
  return (await commitCatalogGenesis(catalog.root, {
    identity, checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply,
    idempotencyKey: request.idempotency_key, canonicalActionDigest: createActionDigest,
    compilerStateRecords, acceptedArtifacts
  })).reply;
}

/** @param {string} runDirectory @param {unknown} requestValue */
export async function advanceV5Run(runDirectory, requestValue) {
  let current;
  try { current = await readVerifiedRun(runDirectory); } catch (error) {
    if (error instanceof V5ProtocolError) return preRunReply(error.code, error.message);
    throw error;
  }
  if (!plainObject(requestValue) || !hasExactKeys(requestValue, ['idempotency_key', 'action']) || typeof requestValue.idempotency_key !== 'string' || requestValue.idempotency_key.length === 0 || !plainObject(requestValue.action)) return runRejection(current, 'SCHEMA_VALIDATION_FAILED', 'Advance request is invalid.');
  const request = /** @type {Record<string, any>} */ (requestValue);
  try {
    const replay = await resolveRunReplay(current, request);
    if (replay) return replay;
    if (current.identity.schema_version !== V5_SCHEMA_VERSION) throw new V5ProtocolError('UNSUPPORTED_SCHEMA_VERSION', 'Only V5 runs are operational.');
    if (current.checkpoint.run_lifecycle !== 'active') return runRejection(current, 'ACTION_NOT_ADVERTISED', 'Terminal runs do not accept new actions.', 'read_only_terminal_rejection');
    const action = request.action;
    const template = actionTemplateForV5Action(contracts.fsmRegistry, current.checkpoint.fsm_cell_id, action);
    if (template.template_id === 'source.submit_batch') return await advanceSourceBatch(current, request);
    if (template.template_id === 'artifact.submit_evidence_claims') return await advanceEvidenceClaims(current, request);
    if (template.template_id === 'artifact.submit_behavior_views') return await advanceBehaviorViews(current, request);
    if (template.template_id === 'artifact.submit_case_drafts') return await advanceCaseDrafts(current, request);
    if (template.template_id === 'clarification.preview') return await advanceClarificationPreview(current, request);
    if (template.template_id === 'clarification.commit') return await advanceClarificationCommit(current, request);
    if (template.template_id === 'execution.advance_closure' || template.template_id === 'execution.confirm_or_pause') return await advanceExecution(current, request, template.template_id);
    if (template.template_id === 'run.cancel') return await advanceCancel(current, request);
    throw new V5ProtocolError('ACTION_NOT_ADVERTISED', `Action handler ${template.template_id} is not installed.`);
  } catch (error) {
    if (!(error instanceof V5ProtocolError)) throw error;
    if (error.code === 'ACTION_TOKEN_KEY_UNAVAILABLE') throw error;
    if (error.code === 'IDEMPOTENCY_CONFLICT') return runRejection(current, error.code, error.message);
    if (error.code === 'ORACLE_SEMANTICS_REQUIRED' && current.checkpoint.fsm_cell_id === 'cd.active.case.drafts') return persistOracleReroute(current, request, error.message);
    return persistRunRejection(current, request, error.code, error.message);
  }
}

/** @param {Record<string,any>} current @param {Record<string,any>} request @param {string} templateId */
async function advanceExecution(current, request, templateId) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'operation']) || action.kind !== 'advance_execution_plan' || !plainObject(action.operation)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Execution action is not a closed operation wrapper.');
  const capability = { kind: 'advance_execution_plan', allowed_operation_kinds: templateId === 'execution.advance_closure' ? ['provide_capability_proof', 'set_execution_disposition'] : ['pause_execution', 'confirm_execution_plan'] };
  validateAdvertisedAction(current, action, capability);
  const advanced = await advanceV5ExecutionProjection(current.reply.work_packet.execution_projection, action.operation);
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: templateId, result_key: advanced.result_key });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    ...current.checkpoint, current_revision: current.checkpoint.current_revision,
    fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation,
    execution_snapshot_digest: advanced.projection.execution_snapshot_digest,
    accepted_execution_receipt_digests: advanced.receipt ? [...new Set([...(current.checkpoint.accepted_execution_receipt_digests ?? []), advanced.receipt.receipt_digest])].sort() : current.checkpoint.accepted_execution_receipt_digests
  };
  delete checkpointBase.checkpoint_digest;
  if (targetCell.lifecycle !== 'active') checkpointBase.run_lifecycle = targetCell.lifecycle;
  const workPacket = targetCell.lifecycle === 'finished'
    ? { kind: 'terminal_work', terminal_kind: 'execution_plan_finished', case_document_ref: current.checkpoint.case_document_ref, execution_projection: advanced.projection }
    : { kind: 'execution_work', case_document_ref: current.checkpoint.case_document_ref, execution_projection: advanced.projection };
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5('advance', action);
  const commitReceipt = { kind: 'operational_commit', committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: outcome.commit_projection.effect };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  /** @type {Array<{record:Record<string,any>,semanticDigest:string}>} */
  const compilerStateRecords = [{ record: advanced.projection, semanticDigest: advanced.projection.execution_snapshot_digest }];
  if (advanced.receipt) compilerStateRecords.push({ record: advanced.receipt, semanticDigest: advanced.receipt.receipt_digest });
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, compilerStateRecords });
}

/** @param {Record<string,any>} current */
async function clarificationState(current) {
  const stateSet = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.question_part_state_set_digest);
  const presentation = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.presentation_digest);
  const inventory = await readSealedV5Record(current.layout.compilerState, current.checkpoint.clarification_gaps_digest, 'gaps_digest');
  return { stateSet, presentation, gaps: inventory.gaps };
}

/** @param {Record<string,any>} current @param {Record<string,any>} request */
async function advanceClarificationPreview(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'presentation_id', 'semantic_root_digest', 'preview_intent', 'raw_response', 'proposed_units']) || !['apply_units', 'discard_pending'].includes(action.preview_intent) || typeof action.raw_response !== 'string' || !Array.isArray(action.proposed_units) || (action.preview_intent === 'discard_pending' && action.proposed_units.length !== 0)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Clarification preview action is invalid.');
  validateAdvertisedAction(current, action, { kind: 'preview_clarification_response', presentation_id: current.reply.work_packet.presentation.presentation_id, semantic_root_digest: current.reply.work_packet.presentation.semantic_root_digest });
  const { stateSet, presentation, gaps } = await clarificationState(current);
  const fromConfirm = current.checkpoint.fsm_cell_id.endsWith('.confirm');
  let resultKey;
  let workPacket;
  let compilerStateRecords = [];
  const checkpointBase = { ...current.checkpoint };
  if (action.preview_intent === 'discard_pending') {
    resultKey = 'discard_pending';
    if (fromConfirm) {
      const pending = await readSealedV5Record(current.layout.compilerState, current.checkpoint.pending_clarification_digest, 'pending_record_digest');
      const superseded = discardPendingClarification(pending);
      const { pending_record_digest: ignored, ...payload } = superseded;
      const sealed = sealV5Record(payload, 'pending_record_digest');
      compilerStateRecords.push({ record: sealed, digestField: 'pending_record_digest' });
    }
    workPacket = { kind: 'clarification_work', context: current.reply.work_packet.context, presentation };
    delete checkpointBase.preview_digest;
    delete checkpointBase.pending_clarification_digest;
  } else {
    const result = previewClarificationResponse({ raw_response: action.raw_response, presentation, state_set: stateSet, gaps, units: action.proposed_units, control_registry: contracts.clarificationControlRegistry, answer_registry: contracts.answerConstraintRegistry, base_checkpoint_digest: current.checkpoint.checkpoint_digest });
    resultKey = 'semantic_change';
    const pending = sealV5Record(result.pending, 'pending_record_digest');
    checkpointBase.preview_digest = result.preview.preview_digest;
    checkpointBase.pending_clarification_digest = pending.pending_record_digest;
    compilerStateRecords = [{ record: result.preview, semanticDigest: result.preview.preview_digest }, { record: pending, digestField: 'pending_record_digest' }];
    workPacket = { kind: 'clarification_confirmation_work', context: current.reply.work_packet.context, presentation, clarification_preview: result.preview };
  }
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: 'clarification.preview', result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  delete checkpointBase.checkpoint_digest;
  checkpointBase.fsm_cell_id = outcome.target_cell_id; checkpointBase.stage = targetCell.stage; checkpointBase.obligation = targetCell.obligation;
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5('advance', action);
  const commitReceipt = { kind: 'operational_commit', committed_action_digest: actionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: outcome.commit_projection.effect };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, compilerStateRecords });
}

/** @param {Record<string,any>} current @param {Record<string,any>} request */
async function advanceClarificationCommit(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'presentation_id', 'semantic_root_digest', 'preview_digest', 'raw_confirmation', 'confirmation_range']) || typeof action.raw_confirmation !== 'string' || !plainObject(action.confirmation_range)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Clarification commit action is invalid.');
  validateAdvertisedAction(current, action, { kind: 'commit_clarification_response', presentation_id: current.reply.work_packet.presentation.presentation_id, semantic_root_digest: current.reply.work_packet.presentation.semantic_root_digest, preview_digest: current.reply.work_packet.clarification_preview.preview_digest });
  const { stateSet, presentation, gaps } = await clarificationState(current);
  const preview = await readSemanticV5Record(current.layout.compilerState, current.checkpoint.preview_digest);
  const pending = await readSealedV5Record(current.layout.compilerState, current.checkpoint.pending_clarification_digest, 'pending_record_digest');
  const committed = commitClarificationResponse({ pending, preview, state_set: stateSet, raw_confirmation: action.raw_confirmation, confirmation_range: action.confirmation_range, control_registry: contracts.clarificationControlRegistry, current: { semantic_root_digest: current.checkpoint.semantic_root_digest, presentation_digest: current.checkpoint.presentation_digest, question_part_state_set_digest: current.checkpoint.question_part_state_set_digest, source_revision: current.checkpoint.current_revision, checkpoint_digest: pending.base_checkpoint_digest } });
  const unresolved = committed.next_state_set.parts.some((/** @type {Record<string,any>} */ part) => ['presented', 'deferred_by_user', 'unknown_by_user'].includes(part.current_state));
  const invalidated = new Set(preview.deterministic_projection.invalidated_artifact_ids ?? []);
  const requirementsStage = current.checkpoint.stage === 'requirements_analysis';
  let resultKey;
  if (unresolved) resultKey = 'actionable_gaps';
  else if (requirementsStage) resultKey = invalidated.size > 0 ? 'requirements_review_invalidated' : 'requirements_ready';
  else if ([...invalidated].some((ref) => String(ref).includes('requirements'))) resultKey = 'requirements_invalidated';
  else if ([...invalidated].some((ref) => String(ref).includes('behavior'))) resultKey = 'behavior_invalidated';
  else resultKey = current.checkpoint.case_document_ref ? 'all_gates_passed' : 'case_drafts_required';
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: 'clarification.commit', result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  let nextPresentation = presentation;
  let workPacket;
  if (targetCell.work_packet_kind === 'clarification_work') {
    nextPresentation = createClarificationPresentation(committed.next_state_set, current.checkpoint.current_revision + 1, gaps);
    workPacket = { kind: 'clarification_work', context: current.reply.work_packet.context, presentation: nextPresentation };
  } else if (targetCell.work_packet_kind === 'semantic_review_work') {
    const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.semantic_review_seed_digest, 'seed_digest');
    workPacket = { kind: 'semantic_review_work', context: current.reply.work_packet.context, semantic_review_seed: seed };
  } else if (targetCell.work_packet_kind === 'behavior_work') {
    const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, 'seed_digest');
    workPacket = { kind: 'behavior_work', context: current.reply.work_packet.context, permission_matrix_worklists: [], behavior_contract_worklist: seed };
  } else if (targetCell.work_packet_kind === 'case_work') workPacket = { kind: 'case_work', context: current.reply.work_packet.context };
  else throw new V5ProtocolError('CLARIFICATION_IMPACT_MISMATCH', 'Clarification cannot terminalize without a compiled delivery.');
  const checkpointBase = {
    ...current.checkpoint, current_revision: current.checkpoint.current_revision + 1,
    semantic_root_digest: committed.impact.after_graph_digest, question_part_state_set_digest: committed.next_state_set.state_set_digest,
    presentation_digest: nextPresentation.presentation_digest, fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation,
    accepted_decision_digests: [...new Set([...(current.checkpoint.accepted_decision_digests ?? []), ...committed.decisions.map((decision) => decision.decision_digest)])].sort()
  };
  for (const key of ['checkpoint_digest', 'preview_digest', 'pending_clarification_digest']) delete checkpointBase[key];
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5('advance', action);
  const commitReceipt = { kind: 'clarification_commit', committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const compilerStateRecords = [
    { record: committed.next_state_set, semanticDigest: committed.next_state_set.state_set_digest },
    { record: nextPresentation, semanticDigest: nextPresentation.presentation_digest },
    { record: { ...committed.impact, impact_digest: canonicalObjectDigest(committed.impact) }, semanticDigest: canonicalObjectDigest(committed.impact) },
    ...committed.decisions.map((decision) => ({ record: decision, semanticDigest: decision.decision_digest }))
  ];
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, compilerStateRecords });
}

/** @param {Record<string,any>} current */
async function acceptedSourceContext(current) {
  const sourcePacks = [];
  for (const artifactDigest of current.checkpoint.accepted_artifact_digests) {
    const envelope = await readSealedV5Record(current.layout.acceptedArtifacts, artifactDigest, 'envelope_digest');
    if (envelope.artifact_kind === 'source_pack') sourcePacks.push({ artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload });
  }
  return { accepted_source_state_digest: current.checkpoint.accepted_source_state_digest, source_packs: sourcePacks.sort((left, right) => left.artifact_digest.localeCompare(right.artifact_digest)) };
}

/** @param {Record<string,any>} current @param {Record<string,any>} request */
async function advanceEvidenceClaims(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'artifact_kind', 'artifact']) || action.artifact_kind !== 'evidence_claims' || !plainObject(action.artifact)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Evidence Claims action is not a closed submit_artifact request.');
  validateAdvertisedAction(current, action, { kind: 'submit_artifact', artifact_kind: 'evidence_claims' });
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.semantic_review_seed_digest, 'seed_digest');
  const validated = validateSemanticReviews(seed, action.artifact, { acceptedDecisionIds: [] });
  const { term_registry: provisionalTermRegistry, ...acceptedPayload } = /** @type {Record<string,any>} */ (validated);
  const envelope = acceptArtifactEnvelope({ artifactKind: 'evidence_claims', payload: acceptedPayload, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: 'requirements_analysis', inputDigests: [seed.seed_digest, current.checkpoint.accepted_source_state_digest] });
  const semanticRootDigest = canonicalObjectDigest({
    namespace: 'generate-test-cases/v5/semantic-root', format_version: 1,
    accepted_source_state_digest: current.checkpoint.accepted_source_state_digest,
    evidence_claims_payload_digest: envelope.canonical_payload_digest,
    decision_ids: []
  });
  const termRegistry = sealV5Record({ semantic_root_digest: semanticRootDigest, entries: provisionalTermRegistry.entries }, 'registry_digest');
  const ruleIndex = createSemanticRuleIndex(semanticRootDigest, { registry_digest: `sha256:${'0'.repeat(64)}`, registered_rules: [], accepted_rule_contract_refs: [] });
  const requirements = (acceptedPayload.claims ?? []).map((/** @type {Record<string,any>} */ claim) => ({
    contract_kind: 'oracle_semantics',
    subject_ref: claim.subject_ref ?? claim.claim_client_key,
    intent_ref: claim.intent_ref ?? claim.claim_client_key,
    basis: claim.basis ?? [{ kind: 'claim', claim_id: claim.claim_client_key }],
    oracle_gap_catalog: { observation_candidates: [], assertion_candidates: [], scope_candidates: [], window_candidates: [] }
  }));
  const behaviorSeed = deriveBehaviorContractSeed(semanticRootDigest, { semanticRuleIndex: ruleIndex, riskModuleIds: [...new Set(requirements.map((/** @type {Record<string,any>} */ item) => item.subject_ref))], requirements });
  const hasGaps = Array.isArray(acceptedPayload.semantic_gaps) && acceptedPayload.semantic_gaps.length > 0;
  const clarificationGaps = hasGaps ? compilerClarificationGaps(acceptedPayload.semantic_gaps, 'requirements_gap') : [];
  const gapInventory = hasGaps ? sealV5Record({ kind: 'clarification_gap_inventory', schema_version: V5_SCHEMA_VERSION, semantic_root_digest: semanticRootDigest, gaps: clarificationGaps }, 'gaps_digest') : null;
  const questionPartStateSet = hasGaps ? createQuestionPartStateSet(current.identity.case_document_lineage_id, semanticRootDigest, clarificationGaps) : null;
  const presentation = hasGaps && questionPartStateSet ? createClarificationPresentation(questionPartStateSet, current.checkpoint.current_revision + 1, clarificationGaps) : null;
  if (hasGaps && (!gapInventory || !questionPartStateSet || !presentation)) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'Clarification projections are incomplete.');
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: 'artifact.submit_evidence_claims', result_key: hasGaps ? 'actionable_gaps' : 'no_actionable_gap' });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    ...current.checkpoint,
    current_revision: current.checkpoint.current_revision + 1,
    fsm_cell_id: outcome.target_cell_id,
    stage: targetCell.stage,
    obligation: targetCell.obligation,
    semantic_root_digest: semanticRootDigest,
    accepted_artifact_digests: [...new Set([...current.checkpoint.accepted_artifact_digests, envelope.envelope_digest])].sort(),
    evidence_claims_artifact_digest: envelope.envelope_digest,
    term_registry_digest: termRegistry.registry_digest,
    behavior_contract_seed_digest: behaviorSeed.seed_digest,
    ...(hasGaps ? { clarification_gaps_digest: /** @type {Record<string,any>} */ (gapInventory).gaps_digest, question_part_state_set_digest: /** @type {Record<string,any>} */ (questionPartStateSet).state_set_digest, presentation_digest: /** @type {Record<string,any>} */ (presentation).presentation_digest } : {})
  };
  delete checkpointBase.checkpoint_digest;
  const capabilities = hasGaps
    ? [{ kind: 'preview_clarification_response', presentation_id: /** @type {Record<string,any>} */ (presentation).presentation_id, semantic_root_digest: semanticRootDigest }, { kind: 'cancel_run' }]
    : [{ kind: 'submit_artifact', artifact_kind: 'behavior_views' }, { kind: 'cancel_run' }];
  const selectorState = checkpointSelectors(checkpointBase, capabilities);
  const source = await acceptedSourceContext(current);
  const context = {
    source,
    semantics: { artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload },
    term_registry: { artifact_digest: termRegistry.registry_digest, accepted_revision: envelope.accepted_revision, payload: termRegistry },
    compiler_rules: { ...agentVisibleCompilerRules(), semantic_rule_index_projection: { kind: 'available', index: ruleIndex } }
  };
  const workPacket = hasGaps
    ? { kind: 'clarification_work', context, presentation }
    : { kind: 'behavior_work', context, permission_matrix_worklists: [], behavior_contract_worklist: behaviorSeed };
  const actionDigest = actionDigestV5('advance', action);
  const commitReceipt = { kind: 'artifact_commit', committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, /** @type {{idempotency_key:string,action:Record<string,any>}} */ (request), {
    checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt,
    acceptedArtifacts: [{ record: envelope, digestField: 'envelope_digest' }],
    compilerStateRecords: [
      { record: termRegistry, digestField: 'registry_digest' }, { record: behaviorSeed, digestField: 'seed_digest' },
      ...(hasGaps ? [{ record: /** @type {Record<string,any>} */ (gapInventory), digestField: 'gaps_digest' }, { record: /** @type {Record<string,any>} */ (questionPartStateSet), semanticDigest: /** @type {Record<string,any>} */ (questionPartStateSet).state_set_digest }, { record: /** @type {Record<string,any>} */ (presentation), semanticDigest: /** @type {Record<string,any>} */ (presentation).presentation_digest }] : [])
    ]
  });
}

/** @param {Record<string,any>} current @param {Record<string,any>} request */
async function advanceBehaviorViews(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'artifact_kind', 'artifact']) || action.artifact_kind !== 'behavior_views' || !plainObject(action.artifact)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Behavior Views action is not a closed submit_artifact request.');
  validateAdvertisedAction(current, action, { kind: 'submit_artifact', artifact_kind: 'behavior_views' });
  const seed = await readSealedV5Record(current.layout.compilerState, current.checkpoint.behavior_contract_seed_digest, 'seed_digest');
  if (action.artifact.behavior_contract_seed_digest !== seed.seed_digest || !Array.isArray(action.artifact.contract_reviews) || !Array.isArray(action.artifact.risk_reviews)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Behavior Views must bind the advertised seed and complete review arrays.');
  validateBehaviorContractReviews(seed, action.artifact.contract_reviews, action.artifact);
  const riskLedger = validateRiskReviews(current.checkpoint.semantic_root_digest, seed.risk_review_module_ids, action.artifact.risk_reviews);
  const envelope = acceptArtifactEnvelope({ artifactKind: 'behavior_views', payload: action.artifact, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: 'case_design', inputDigests: [seed.seed_digest, current.checkpoint.semantic_root_digest] });
  const semanticGaps = Array.isArray(action.artifact.semantic_gaps) ? action.artifact.semantic_gaps : [];
  const reviewHasGap = action.artifact.contract_reviews.some((/** @type {Record<string,any>} */ review) => review.disposition?.kind === 'semantic_gap');
  const hasGaps = reviewHasGap || semanticGaps.length > 0;
  if (reviewHasGap && semanticGaps.length === 0) throw new V5ProtocolError('SEMANTIC_REVIEW_CANDIDATE_MISSING', 'Behavior semantic-gap reviews require exact gap payloads.');
  const resultKey = hasGaps ? 'actionable_gaps' : 'no_actionable_gap';
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: 'artifact.submit_behavior_views', result_key: resultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const testObligations = sealV5Record({ kind: 'test_obligations', schema_version: V5_SCHEMA_VERSION, semantic_root_digest: current.checkpoint.semantic_root_digest, formal_test_point_ids: [...new Set(action.artifact.formal_test_point_ids ?? [])].sort(), behavior_artifact_digest: envelope.envelope_digest }, 'obligations_digest');
  /** @type {Array<{record:Record<string,any>,digestField?:string,semanticDigest?:string}>} */
  const compilerStateRecords = [{ record: testObligations, digestField: 'obligations_digest' }, { record: riskLedger, semanticDigest: canonicalObjectDigest(riskLedger) }];
  let workPacket;
  const context = {
    ...current.reply.work_packet.context,
    behavior: { artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload },
    test_obligations: { artifact_digest: testObligations.obligations_digest, accepted_revision: envelope.accepted_revision, payload: testObligations }
  };
  const checkpointBase = {
    ...current.checkpoint, current_revision: current.checkpoint.current_revision + 1,
    fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation,
    accepted_artifact_digests: [...new Set([...current.checkpoint.accepted_artifact_digests, envelope.envelope_digest])].sort(),
    behavior_views_artifact_digest: envelope.envelope_digest, test_obligations_digest: testObligations.obligations_digest,
    risk_ledger_digest: canonicalObjectDigest(riskLedger)
  };
  if (hasGaps) {
    const gaps = compilerClarificationGaps(semanticGaps, 'behavior_gap');
    const inventory = sealV5Record({ kind: 'clarification_gap_inventory', schema_version: V5_SCHEMA_VERSION, semantic_root_digest: current.checkpoint.semantic_root_digest, gaps }, 'gaps_digest');
    const stateSet = createQuestionPartStateSet(current.identity.case_document_lineage_id, current.checkpoint.semantic_root_digest, gaps);
    const presentation = createClarificationPresentation(stateSet, checkpointBase.current_revision, gaps);
    Object.assign(checkpointBase, { clarification_gaps_digest: inventory.gaps_digest, question_part_state_set_digest: stateSet.state_set_digest, presentation_digest: presentation.presentation_digest });
    compilerStateRecords.push({ record: inventory, digestField: 'gaps_digest' }, { record: stateSet, semanticDigest: stateSet.state_set_digest }, { record: presentation, semanticDigest: presentation.presentation_digest });
    workPacket = { kind: 'clarification_work', context, presentation };
  } else workPacket = { kind: 'case_work', context };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, capabilitiesForCell(outcome.target_cell_id, workPacket));
  const actionDigest = actionDigestV5('advance', action);
  const commitReceipt = { kind: 'artifact_commit', committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, request, { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, acceptedArtifacts: [{ record: envelope, digestField: 'envelope_digest' }], compilerStateRecords });
}

/** @param {string} mediaType @param {string} content */
function renderedOutputRecord(mediaType, content) {
  return sealV5Record({ kind: 'rendered_output', schema_version: V5_SCHEMA_VERSION, media_type: mediaType, content, content_digest: `sha256:${createHash('sha256').update(content).digest('hex')}` }, 'rendered_output_digest');
}

/** @param {Record<string,any>} current @param {Record<string,any>} request */
async function advanceCaseDrafts(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'artifact_kind', 'artifact']) || action.artifact_kind !== 'case_drafts' || !plainObject(action.artifact) || !Array.isArray(action.artifact.case_drafts)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Case Drafts action is not a closed submit_artifact request.');
  validateAdvertisedAction(current, action, { kind: 'submit_artifact', artifact_kind: 'case_drafts' });
  const envelope = acceptArtifactEnvelope({ artifactKind: 'case_drafts', payload: action.artifact, runIdentity: current.identity, revision: current.checkpoint.current_revision + 1, producerStage: 'case_design', inputDigests: [current.checkpoint.semantic_root_digest, current.checkpoint.test_obligations_digest] });
  const document = compileV5CaseDocument({
    ...action.artifact, case_document_lineage_id: current.identity.case_document_lineage_id,
    semantic_root_digest: current.checkpoint.semantic_root_digest, source_revision: current.checkpoint.current_revision + 1
  });
  const executionPlan = projectCompatibilityExecutionPlan(document, { run_id: current.identity.run_id, revision: current.checkpoint.current_revision + 1 });
  const caseDocumentRef = executionPlan.case_document_ref;
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: 'artifact.submit_case_drafts', result_key: 'all_gates_passed' });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const checkpointBase = {
    ...current.checkpoint, run_lifecycle: targetCell.lifecycle, current_revision: current.checkpoint.current_revision + 1,
    fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation,
    accepted_artifact_digests: [...new Set([...current.checkpoint.accepted_artifact_digests, envelope.envelope_digest])].sort(),
    case_drafts_artifact_digest: envelope.envelope_digest, case_document_ref: caseDocumentRef,
    case_document_digest: document.bundle_digest, execution_plan_digest: executionPlan.plan_digest
  };
  delete checkpointBase.checkpoint_digest;
  const workPacket = { kind: 'terminal_work', terminal_kind: 'case_document_finished', case_document_ref: caseDocumentRef };
  const selectorState = checkpointSelectors(checkpointBase, []);
  const actionDigest = actionDigestV5('advance', action);
  const commitReceipt = { kind: 'artifact_commit', committed_action_digest: actionDigest, semantic_revision_delta: 1, client_key_bindings: [] };
  const reply = persistedReply(selectorState.checkpoint, workPacket, [], commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  const renderedOutputs = [renderedOutputRecord('application/json', renderV5Json(document)), renderedOutputRecord('text/markdown', renderV5Markdown(document)), renderedOutputRecord('text/csv', renderV5Csv(document))].map((record) => ({ record, digestField: 'rendered_output_digest' }));
  return commitNormalRunTransaction(current.layout.root, request, {
    checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt,
    acceptedArtifacts: [{ record: envelope, digestField: 'envelope_digest' }],
    compilerStateRecords: [{ record: document, semanticDigest: document.bundle_digest }, { record: executionPlan, semanticDigest: executionPlan.plan_digest }], renderedOutputs
  });
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
  const sourceResultKey = `${acceptedEnvelope ? 'payload' : 'all_skipped_optional'}:${complete ? 'sources_complete' : 'sources_remaining'}`;
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: 'source.submit_batch', result_key: sourceResultKey });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const revisionDelta = acceptedEnvelope ? 1 : 0;
  const acceptedArtifactDigests = [...new Set([...current.checkpoint.accepted_artifact_digests, ...(acceptedEnvelope ? [acceptedEnvelope.envelope_digest] : [])])].sort();
  const sourceEnvelopes = [];
  for (const artifactDigest of current.checkpoint.accepted_artifact_digests) {
    const envelope = await readSealedV5Record(current.layout.acceptedArtifacts, artifactDigest, 'envelope_digest');
    if (envelope.artifact_kind === 'source_pack') sourceEnvelopes.push(envelope);
  }
  if (acceptedEnvelope) sourceEnvelopes.push(acceptedEnvelope);
  const sourceContext = {
    accepted_source_state_digest: acceptedSourceStateDigest,
    source_packs: sourceEnvelopes.map((envelope) => ({ artifact_digest: envelope.envelope_digest, accepted_revision: envelope.accepted_revision, payload: envelope.payload })).sort((left, right) => left.artifact_digest.localeCompare(right.artifact_digest))
  };
  const semanticSeed = complete ? deriveSemanticReviewSeed({
    acceptedSourceStateDigest,
    sourcePacks: sourceContext.source_packs,
    permissionDerivationRegistryDigest: contracts.permissionDerivationRegistry.registry_digest
  }) : null;
  if (semanticSeed) compilerStateRecords.push({ record: semanticSeed, digestField: 'seed_digest' });
  const checkpointBase = {
    ...current.checkpoint, checkpoint_digest: undefined,
    current_revision: current.checkpoint.current_revision + revisionDelta,
    fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation,
    source_acquisition_state_digest: nextSourceState.state_digest, accepted_artifact_digests: acceptedArtifactDigests,
    accepted_source_payload_digests: acceptedSourcePayloadDigests, accepted_source_state_digest: acceptedSourceStateDigest,
    ...(semanticSeed ? { semantic_review_seed_digest: semanticSeed.seed_digest } : {})
  };
  delete checkpointBase.checkpoint_digest;
  const capabilities = complete
    ? [{ kind: 'submit_artifact', artifact_kind: 'evidence_claims' }, { kind: 'cancel_run' }]
    : [{ kind: 'submit_source_batch', request_ids: nextBatch.map((item) => item.request_id) }, { kind: 'cancel_run' }];
  const selectorState = checkpointSelectors(checkpointBase, capabilities);
  const workPacket = complete ? {
    kind: 'semantic_review_work',
    context: { source: sourceContext, compiler_rules: agentVisibleCompilerRules() },
    semantic_review_seed: semanticSeed
  } : {
    ...sourceWorkPacket(nextSourceState),
    accepted_source_state: { kind: 'partial', source: sourceContext }
  };
  const committedActionDigest = actionDigestV5('advance', action);
  const commitReceipt = acceptedEnvelope
    ? { kind: 'artifact_commit', committed_action_digest: committedActionDigest, semantic_revision_delta: 1, client_key_bindings: [] }
    : { kind: 'operational_commit', committed_action_digest: committedActionDigest, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: complete ? 'source_acquisition_advanced' : 'source_acquisition_advanced' };
  const reply = persistedReply(selectorState.checkpoint, workPacket, selectorState.selectors, commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, /** @type {{idempotency_key:string,action:Record<string,any>}} */ (request), { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, acceptedArtifacts, compilerStateRecords });
}

/** @param {Record<string, any>} current @param {Record<string, any>} request */
async function advanceCancel(current, request) {
  const action = request.action;
  if (!hasExactKeys(action, ['kind', 'action_token', 'reason']) || typeof action.reason !== 'string' || action.reason.trim().length === 0) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Cancel action is invalid.');
  validateAdvertisedAction(current, action, { kind: 'cancel_run' });
  const outcome = selectV5Outcome(contracts.fsmRegistry, { kind: 'advance', from_cell_id: current.checkpoint.fsm_cell_id, action_template_id: 'run.cancel', result_key: 'cancelled' });
  const targetCell = fsmByCell.get(outcome.target_cell_id);
  const digestValue = actionDigestV5('advance', action);
  const cancelEvent = createV5CancelEvent({ identity: current.identity, priorCheckpoint: current.checkpoint, previousTransactionDigest: current.transaction.transaction_digest, canonicalCancelActionDigest: digestValue, terminalFsmCellId: outcome.target_cell_id });
  const checkpointBase = { ...current.checkpoint, checkpoint_digest: undefined, ...cancelledCheckpointExtension(cancelEvent), fsm_cell_id: outcome.target_cell_id, stage: targetCell.stage, obligation: targetCell.obligation };
  delete checkpointBase.checkpoint_digest;
  const selectorState = checkpointSelectors(checkpointBase, []);
  const commitReceipt = { kind: 'operational_commit', committed_action_digest: digestValue, semantic_revision_delta: 0, client_key_bindings: [], operational_effect: 'run_cancelled' };
  const terminalPacket = current.identity.delivery_intent === 'case_document'
    ? { kind: 'terminal_work', terminal_kind: 'case_document_cancelled' }
    : { kind: 'terminal_work', terminal_kind: 'execution_plan_cancelled', case_document_ref: current.checkpoint.case_document_ref, last_execution_projection: current.reply.work_packet.execution_projection };
  const reply = persistedReply(selectorState.checkpoint, terminalPacket, [], commitReceipt, current.layout.root, outcome.outcome_id, selectorState.sidecar.selector_sidecar_digest);
  return commitNormalRunTransaction(current.layout.root, /** @type {{idempotency_key:string,action:Record<string,any>}} */ (request), { checkpoint: selectorState.checkpoint, selectorSidecar: selectorState.sidecar, reply, commitReceipt, operationalEvent: { record: cancelEvent, digestField: 'cancel_event_digest', refKind: 'cancel_event' } });
}

/** @param {string} runDirectory */
export async function inspectV5Run(runDirectory) {
  let layout;
  let identity;
  try {
    layout = await resolveRunLayout(runDirectory);
    identity = (await readFixedSealedRecord(layout.identity, 'identity_digest')).record;
    const current = await readVerifiedRun(runDirectory);
    return structuredClone(current.reply);
  } catch (error) {
    if (error instanceof V5ProtocolError) {
      if (error.code === 'RUN_ARGUMENT_INVALID') return preRunReply('RUN_ARGUMENT_INVALID', error.message);
      if (!layout || !identity) return preRunReply('ACCEPTED_STATE_INTEGRITY_FAILURE', error.message);
      /** @type {Record<string,any>} */
      let lastVerifiedState = { kind: 'none' };
      try {
        const pointer = (await readFixedSealedRecord(layout.currentPointer, 'pointer_digest')).record;
        const transaction = await readSealedV5Record(layout.transactions, pointer.head_transaction_digest, 'transaction_digest');
        const checkpoint = await readSealedV5Record(layout.checkpoints, transaction.checkpoint_digest, 'checkpoint_digest');
        if (pointer.run_id === identity.run_id && transaction.run_id === identity.run_id && checkpoint.run_id === identity.run_id) lastVerifiedState = { kind: 'checkpoint', fsm_cell_id: checkpoint.fsm_cell_id, stage: checkpoint.stage, obligation: checkpoint.obligation, current_revision: checkpoint.current_revision, checkpoint_digest: checkpoint.checkpoint_digest };
      } catch {}
      /** @type {Record<string,any>} */
      const trigger = lastVerifiedState.kind === 'checkpoint'
        ? { kind: 'verified_fsm_cell', fsm_cell_id: lastVerifiedState.fsm_cell_id }
        : { kind: 'no_verified_fsm_cell', delivery_intent: identity.delivery_intent };
      const row = replyRows.find((/** @type {Record<string,any>} */ candidate) => candidate.source.kind === 'runtime_error' && candidate.source.error_code === 'ACCEPTED_STATE_INTEGRITY_FAILURE' && candidate.source.response_context === 'run_inspect' && canonicalV5Stringify(candidate.source.trigger_state) === canonicalV5Stringify(trigger));
      if (!row) throw new V5ProtocolError('POLICY_REGISTRY_INCONSISTENT', 'Inspect integrity reply contract is unavailable.');
      return {
        kind: 'run_reply', schema_version: V5_SCHEMA_VERSION, run_id: identity.run_id, run_directory: layout.root,
        case_document_lineage_id: identity.case_document_lineage_id, delivery_intent: identity.delivery_intent,
        projection_kind: 'read_only_integrity_fatal', reply_contract_id: row.reply_contract_id,
        run_lifecycle: 'fatal', reply_status: 'fatal', last_verified_state: lastVerifiedState,
        selector_snapshot_digest: null, available_actions: [],
        work_packet: { kind: 'terminal_work', terminal_kind: identity.delivery_intent === 'case_document' ? 'case_document_fatal' : 'execution_plan_fatal' },
        commit_receipt: null, diagnostics: [{ code: 'ACCEPTED_STATE_INTEGRITY_FAILURE', affected_refs: [], message: error.message }]
      };
    }
    throw error;
  }
}
