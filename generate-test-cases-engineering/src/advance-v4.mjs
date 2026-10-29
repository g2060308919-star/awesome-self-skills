import { persistableSourceValues } from './source-compiler-v4.mjs';
import { createCompilerSourceRuntimeV4 } from './source-runtime-registry-v4.mjs';
import { prepareSourceAcquisitionCandidateV4, reconcileSourceAcquisitionV4 } from './source-acquisition-v4.mjs';
import { assertCheckpointAnswerTargetsV4, clarificationTargetDiagnosticV4 } from './clarification-targets-v4.mjs';
import { verifyCommittedRevisionReadOnlyV4 } from './revision-transaction-v4.mjs';
import { compileBoundCaseContext } from './case-context-v4.mjs';
import path from 'node:path';

import {
  materializeCaseDocumentDeliveryV4, verifyCaseDocumentDeliveryV4
} from './canonical-delivery-v4.mjs';
import {
  applySemanticClarificationEventsV4,
  compileSemanticClarificationCheckpointV4,
  validateSemanticClarificationCheckpointV4
} from './clarification.mjs';
import { canonicalArtifactSnapshot, canonicalStringify, digest, evidenceComponentDigests } from './canonical.mjs';
import { appendedRepair, repairDiagnostics } from './artifact-repair.mjs';
import {
  finalAuthorityWarningV4, normalizeDecisionMessageV4
} from './decision-record.mjs';
import { compileV4DecisionEvidenceOverlay } from './evidence.mjs';
import { advanceExecutionRunV4Locked } from './execution-run-v4.mjs';
import {
  cancelRunV4WithHeldLock, constructCancelRunEventV4,
  replayCancelledRunV4WithHeldLock
} from './run-cancellation-v4.mjs';
import { compileCaseDocumentRevisionV4, compilePreCaseArtifactsV4 } from './v4-pipeline.mjs';
import { deriveV4AuthoringSystemContext, deriveV4PreCaseSystemContext, deriveV4SystemContext } from './v4-system-context.mjs';
import {
  advanceSourceAcquisitionV4, loadSourceAcquisitionCompilerStateV4,
  replaySourceAcquisitionStopV4, sourceAcquisitionStatePathV4
} from './source-acquisition-v4.mjs';
import {
  commitRevisionTransactionV4WithHeldLock, ensureV4RunInstanceWithHeldLock,
  recoverMaterializedRevisionV4WithHeldLock
} from './revision-transaction-v4.mjs';
import { sourceByteDigest } from './source-canonicalization.mjs';
import {
  acceptedPath, acceptedSourceRevisions, discardStagingSnapshot, promoteArtifact,
  readJson, readJsonIfPresent, readTextIfPresent, revisionName, stagingPath, STAGE_FILES
} from './run-store.mjs';
import { AGENT_STAGE_SCHEMA } from './reply-routing.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { createSemanticQuestionReplyV4 } from './stop-replies-v4.mjs';
import { routeGapCategoryV4 } from './gap-kinds-v4.mjs';
import { sortNonBlockingDiagnosticsV4 } from './non-blocking-diagnostics-v4.mjs';
import {
  isCandidateV4SchemaVersion, isV4SchemaVersion, latestV4Contract, v4ContractForSchema
} from './v4-contract.mjs';
import { loadV4SourceReadingSummary } from './prd-source-collection-v4.mjs';
import { DiagnosticErrorV4, safeDiagnosticsV4 } from './diagnostic-error-v4.mjs';

const STAGES = /** @type {const} */ (['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']);

const SHA256 = /^sha256:[0-9a-f]{64}$/u;

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

/** @param {typeof STAGES[number]} stage */
function stagePhase(stage) {
  if (stage === 'source_pack') return 'source_acquisition';
  if (stage === 'evidence_claims') return 'requirements_analysis';
  return 'case_design';
}

/** @param {string} runDirectory @param {typeof STAGES[number]} stage @param {number} sourceRevision
 * @param {string} runInstanceId @param {any[]} [nonBlockingDiagnostics] */
function artifactRequest(
  runDirectory, stage, sourceRevision, runInstanceId, nonBlockingDiagnostics = []
) {
  return {
    status: 'need_revision', stage, schema_ref: AGENT_STAGE_SCHEMA[stage],
    phase: stagePhase(stage), run_id: runInstanceId,
    scope: { source_revision: sourceRevision, run_instance_id: runInstanceId }, diagnostics: [],
    produced_artifacts: [],
    incomplete_reason: {
      code: 'STAGE_ARTIFACT_REQUIRED',
      summary: `当前运行仍需要 ${stage} 工件才能继续。`
    },
    user_next_steps: [{
      action: 'write_stage_artifact',
      description: `按 ${AGENT_STAGE_SCHEMA[stage]} 写入当前候选 revision 的 ${stage}。`
    }],
    recovery: {
      mode: 'write_staging_artifact',
      description: '保留已接受 revision，在同一运行目录写入所请求的候选工件后重调 runner。'
    },
    non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(nonBlockingDiagnostics)
  };
}

/** @param {string} runDirectory @param {typeof STAGES[number]} stage @param {number} sourceRevision
 * @param {unknown} artifact @param {any[]} diagnostics @param {string} runInstanceId
 * @param {any[]} [nonBlockingDiagnostics] @param {any|null} [reviewRequest] */
function revisionReply(
  runDirectory, stage, sourceRevision, artifact, diagnostics, runInstanceId,
  nonBlockingDiagnostics = [], reviewRequest = null
) {
  const route = routeGapCategoryV4('adapter_revision', { delivery_intent: 'case_document' });
  const stable = safeDiagnosticsV4(diagnostics.map(item => ({
    category: String(item.category ?? 'adapter_revision'),
    code: String(item.code ?? 'ARTIFACT_INVALID'),
    ...(typeof item.path === 'string' ? { path: item.path } : {}),
    message: String(item.message ?? 'The submitted v4 artifact failed deterministic validation.')
  })));
  const newRunRequired = stable.some(item => item.code === 'NEW_RUN_REQUIRED');
  return {
    status: route.status, stage, schema_ref: AGENT_STAGE_SCHEMA[stage], source_revision: sourceRevision,
    artifact_path: stagingPath(runDirectory, stage), artifact_digest: digest(artifact),
    diagnostics: stable, phase: stagePhase(stage), run_id: runInstanceId,
    produced_artifacts: [],
    incomplete_reason: {
      code: stable[0]?.code ?? 'ARTIFACT_INVALID',
      summary: stable[0]?.message ?? '候选工件未通过确定性校验。'
    },
    user_next_steps: [{ action: 'revise_artifact', description: newRunRequired
      ? '来源或范围已变化；保留当前运行，通过 createV4RunDirectory 创建新运行并在 Adapter catalog 记录关联。'
      : `修正 ${stage} 后在同一运行重试。` }],
    recovery: {
      mode: 'retry_current_run',
      description: newRunRequired
        ? '候选未提交，已接受前缀与原交付保持不变。新来源或范围必须在新运行验证；不能修改原运行身份或追加旧日志。'
        : '保留已接受 revision，只替换尚未接受的 staging 候选工件。'
    },
    ...(reviewRequest ? { review_request: structuredClone(reviewRequest) } : {}),
    non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(nonBlockingDiagnostics)
  };
}

/** @param {string} runId @param {string} phase @param {string} code @param {string} summary
 * @param {any[]} [nonBlockingDiagnostics] */
function qualityFailure(runId, phase, code, summary, nonBlockingDiagnostics = []) {
  const route = routeGapCategoryV4('quality_failure', { delivery_intent: 'case_document' });
  return {
    status: route.status, phase, result_kind: route.result_kind, run_id: runId,
    produced_artifacts: [], incomplete_reason: { code, summary },
    user_next_steps: [{ action: 'revise_artifact', description: summary }],
    recovery: {
      mode: 'resume_from_committed_checkpoint',
      description: '修正当前候选工件后，从已提交检查点继续。'
    },
    non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(nonBlockingDiagnostics)
  };
}

/** @param {string} runId @param {any} presentation @param {any[]} [nonBlockingDiagnostics] */
function semanticQuestionReply(runId, presentation, nonBlockingDiagnostics = []) {
  return createSemanticQuestionReplyV4(runId, presentation, nonBlockingDiagnostics);
}

/** @param {any} sourcePack @param {any} evidence @param {string} runId
 * @param {any|null} priorCheckpoint @param {Uint8Array|null} committedCheckpointBytes
 */
function compilePreCaseClarification(
  sourcePack, evidence, runId, priorCheckpoint = null, committedCheckpointBytes = null
) {
  const contract = v4ContractForSchema(sourcePack.schema_version);
  if (!contract) throw new TypeError('V4_CONTRACT_UNSUPPORTED');
  const expected = sourcePack.sources.flatMap((/** @type {any} */ source) =>
    source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id)
  );
  const reviewed = sourcePack.source_reviews.flatMap((/** @type {any} */ review) =>
    review.units.map((/** @type {any} */ unit) => unit.unit_id)
  );
  const genesis = new TextEncoder().encode(`${canonicalStringify({
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    run_id: runId, genesis: true
  })}\n`);
  return compileSemanticClarificationCheckpointV4({
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    run_id: runId, committed_revision: sourcePack.source_revision,
    committed_checkpoint_bytes: committedCheckpointBytes ?? genesis, discovery_phase: 'pre_case',
    source_review_witness: { expected_unit_ids: expected, reviewed_unit_ids: reviewed },
    ...evidenceComponentDigests(evidence),
    behavior_views_digest: null, case_drafts_digest: null,
    facts: evidence.fact_ledger, claims: evidence.claims,
    diagnostic_candidates: evidence.semantic_gaps.filter(
      (/** @type {any} */ gap) => gap.discovery_phase === 'pre_case'
    ),
    prior_checkpoint: priorCheckpoint,

  });
}

/** @param {any} sourcePack @param {any} evidence @param {any} behaviorViews
 * @param {any} caseDrafts @param {string} runId @param {any} priorCheckpoint
 * @param {Uint8Array} committedCheckpointBytes */
function compilePostCaseClarification(
  sourcePack, evidence, behaviorViews, caseDrafts, runId, priorCheckpoint,
  committedCheckpointBytes
) {
  const contract = v4ContractForSchema(sourcePack.schema_version);
  if (!contract) throw new TypeError('V4_CONTRACT_UNSUPPORTED');
  const expected = sourcePack.sources.flatMap((/** @type {any} */ source) =>
    source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id)
  );
  const reviewed = sourcePack.source_reviews.flatMap((/** @type {any} */ review) =>
    review.units.map((/** @type {any} */ unit) => unit.unit_id)
  );
  return compileSemanticClarificationCheckpointV4({
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    run_id: runId, committed_revision: sourcePack.source_revision,
    committed_checkpoint_bytes: committedCheckpointBytes, discovery_phase: 'post_case',
    source_review_witness: { expected_unit_ids: expected, reviewed_unit_ids: reviewed },
    ...evidenceComponentDigests(evidence),
    behavior_views_digest: `sha256:${digest(behaviorViews)}`,
    case_drafts_digest: `sha256:${digest(caseDrafts)}`,
    facts: evidence.fact_ledger, claims: evidence.claims,
    diagnostic_candidates: evidence.semantic_gaps.filter(
      (/** @type {any} */ gap) => gap.discovery_phase === 'post_case'
    ),
    prior_checkpoint: priorCheckpoint
  });
}

/** @param {unknown} value */
function jsonArtifact(value) { return { format: 'json', value: structuredClone(value) }; }

/** @param {string} value */
function textArtifact(value) { return { format: 'text', text: value }; }

/** @param {any} sourcePack @param {any} evidence @param {any} checkpoint */
function semanticRevisionDigest(sourcePack, evidence, checkpoint) {
  return `sha256:${digest({
    source_semantic_digests: sourcePack.sources.map(
      (/** @type {any} */ source) => source.semantic_digest
    ),
    evidence: canonicalArtifactSnapshot(evidence), clarification_state: checkpoint.clarification_state
  })}`;
}

/** @param {string} runId @param {any} sourcePack @param {any} evidence @param {any} checkpoint */
function baseRevisionArtifacts(runId, sourcePack, evidence, checkpoint) {
  evidence = canonicalArtifactSnapshot(evidence);
  const revision = sourcePack.source_revision;
  if (checkpoint.run_id !== runId || checkpoint.revision !== revision) {
    throw new TypeError('V4_CHECKPOINT_BINDING_INVALID');
  }
  return {
    source_pack: jsonArtifact(sourcePack),
    decision_journal: jsonArtifact({
      schema_version: sourcePack.schema_version, source_revision: revision,
      decisions: structuredClone(sourcePack.decision_records)
    }),
    evidence_claims: jsonArtifact(evidence),
    fact_ledger: jsonArtifact({
      schema_version: sourcePack.schema_version, source_revision: revision,
      facts: structuredClone(evidence.fact_ledger)
    }),
    scope_manifest: jsonArtifact({
      schema_version: sourcePack.schema_version, source_revision: revision,
      ...structuredClone(evidence.scope_manifest)
    }),
    clarification_state: jsonArtifact({
      schema_version: sourcePack.schema_version, source_revision: revision,
      ...structuredClone(checkpoint.clarification_state)
    }),
    checkpoint: jsonArtifact(checkpoint)
  };
}

/** @param {string} runId @param {any} sourcePack @param {any} evidence @param {any} checkpoint
 * @param {number|null} baseRevision @param {string[]} eventIds */
function preCaseTransaction(
  runId, sourcePack, evidence, checkpoint, baseRevision = null,
  /** @type {string[]} */ eventIds = []
) {
  const revision = sourcePack.source_revision;
  const artifacts = baseRevisionArtifacts(runId, sourcePack, evidence, checkpoint);
  const semantic = semanticRevisionDigest(sourcePack, evidence, checkpoint);
  const appendIdentity = {
    run_id: runId, base_revision: baseRevision, candidate_revision: revision,
    event_ids: [...eventIds], semantic_digest: semantic
  };
  return {
    append_id: `APPEND-pre-case-${digest(appendIdentity)}`,
    append_digest: `sha256:${digest(appendIdentity)}`,
    base_revision: baseRevision, candidate_revision: revision,
    commit_profile: 'pre_case_pending', semantic_digest: semantic, artifacts
  };
}

/** @param {string} runId @param {any} sourcePack @param {any} evidence
 * @param {any} behaviorViews @param {any} obligations @param {any} caseDrafts
 * @param {any} checkpoint @param {number} baseRevision @param {string} semanticDigest
 * @param {string[]} eventIds */
function postCaseTransaction(
  runId, sourcePack, evidence, behaviorViews, obligations, caseDrafts,
  checkpoint, baseRevision, semanticDigest,
  /** @type {string[]} */ eventIds = []
) {
  const revision = sourcePack.source_revision;
  const artifacts = {
    ...baseRevisionArtifacts(runId, sourcePack, evidence, checkpoint),
    behavior_views: jsonArtifact(behaviorViews),
    test_obligations: jsonArtifact(obligations),
    case_drafts: jsonArtifact(caseDrafts)
  };
  const appendIdentity = {
    run_id: runId, base_revision: baseRevision, candidate_revision: revision,
    event_ids: [...eventIds], semantic_digest: semanticDigest,
    commit_profile: 'post_case_pending'
  };
  return {
    append_id: `APPEND-post-case-${digest(appendIdentity)}`,
    append_digest: `sha256:${digest(appendIdentity)}`,
    base_revision: baseRevision, candidate_revision: revision,
    commit_profile: 'post_case_pending', semantic_digest: semanticDigest, artifacts
  };
}

/** @param {string} runId @param {any} sourcePack @param {any} evidence
 * @param {any} behaviorViews @param {any} obligations @param {any} caseDrafts
 * @param {any} checkpoint @param {any} materialized @param {string} semanticDigest */
function finalTransaction(
  runId, sourcePack, evidence, behaviorViews, obligations, caseDrafts,
  checkpoint, materialized, semanticDigest
) {
  const revision = sourcePack.source_revision;
  const artifacts = {
    ...baseRevisionArtifacts(runId, sourcePack, evidence, checkpoint),
    behavior_views: jsonArtifact(behaviorViews),
    test_obligations: jsonArtifact(obligations),
    case_drafts: jsonArtifact(caseDrafts),
    bundle: jsonArtifact(JSON.parse(materialized.bundle_bytes)),
    markdown: textArtifact(materialized.markdown_bytes),
    worksheet: textArtifact(materialized.worksheet_bytes),
    ...(isCandidateV4SchemaVersion(sourcePack.schema_version) ? {
      html: textArtifact(materialized.html_bytes),
      table: textArtifact(materialized.table_bytes),
      source_reading: jsonArtifact(JSON.parse(materialized.source_reading_bytes))
    } : {}),
    manifest: jsonArtifact(materialized.manifest)
  };
  const appendIdentity = {
    run_id: runId, revision, semantic_digest: semanticDigest,
    manifest_digest: sourceByteDigest(new TextEncoder().encode(
      `${canonicalStringify(materialized.manifest)}\n`
    )),
    commit_profile: 'final'
  };
  return {
    append_id: `APPEND-final-${digest(appendIdentity)}`,
    append_digest: `sha256:${digest(appendIdentity)}`,
    base_revision: revision, candidate_revision: revision,
    commit_profile: 'final', semantic_digest: semanticDigest, artifacts
  };
}

/** @param {unknown} left @param {unknown} right */
function same(left, right) { return canonicalStringify(left) === canonicalStringify(right); }

/** @param {any[]} prefix @param {any[]} complete */
function exactPrefix(prefix, complete) {
  return complete.length >= prefix.length
    && prefix.every((item, index) => same(item, complete[index]));
}

/** Return the only legal cancellation append for an accepted Case Document
 * revision. A cancellation batch may change only source_revision and append
 * the exact compiler-constructible cancel event; it cannot smuggle an answer,
 * source mutation, or another lifecycle action into the terminal transition.
 * @param {any} prior @param {any} candidate @param {'requirements_analysis'|'case_design'} phase
 * @param {string} runId @param {number} revision
 */
function semanticCancellationAppend(prior, candidate, phase, runId, revision) {
  const before = Array.isArray(prior.clarification_events) ? prior.clarification_events : [];
  const after = Array.isArray(candidate.clarification_events) ? candidate.clarification_events : [];
  const appended = after.slice(before.length);
  if (!appended.some((/** @type {any} */ event) => event?.event_type === 'cancel_run')) return null;
  if (appended.length !== 1 || appended[0]?.event_type !== 'cancel_run') {
    throw new TypeError('CANCEL_EVENT_BATCH_CONFLICT');
  }
  const expectedEvent = constructCancelRunEventV4({
    run_id: runId, phase, phase_version: revision
  });
  if (!same(appended[0], expectedEvent)) throw new TypeError('CANCEL_EVENT_STALE');
  const expected = structuredClone(prior);
  expected.source_revision = revision + 1;
  expected.clarification_events = [...structuredClone(before), expectedEvent];
  const normalized = structuredClone(candidate);
  normalized.decision_records = structuredClone(prior.decision_records);
  if (!same(normalized, expected)) throw new TypeError('CANCEL_EVENT_BATCH_CONFLICT');
  return expectedEvent;
}

/** The source-acquisition stop created while consuming a semantic candidate
 * has the candidate revision as its phase version. Cancellation must still be
 * an append to the last accepted semantic Source Pack, never to the discarded
 * credential-bearing candidate. @param {any} prior @param {any} candidate
 * @param {string} runId @param {number} candidateRevision */
function semanticAcquisitionCancellationAppend(prior, candidate, runId, candidateRevision) {
  const before = Array.isArray(prior.clarification_events) ? prior.clarification_events : [];
  const after = Array.isArray(candidate.clarification_events) ? candidate.clarification_events : [];
  const appended = after.slice(before.length);
  if (!appended.some((/** @type {any} */ event) => event?.event_type === 'cancel_run')) return null;
  if (appended.length !== 1 || appended[0]?.event_type !== 'cancel_run') {
    throw new TypeError('CANCEL_EVENT_BATCH_CONFLICT');
  }
  const expectedEvent = constructCancelRunEventV4({
    run_id: runId, phase: 'source_acquisition', phase_version: candidateRevision
  });
  if (!same(appended[0], expectedEvent)) throw new TypeError('CANCEL_EVENT_STALE');
  const expected = structuredClone(prior);
  expected.source_revision = candidateRevision;
  expected.clarification_events = [...structuredClone(before), expectedEvent];
  const normalized = structuredClone(candidate);
  normalized.decision_records = structuredClone(prior.decision_records);
  if (!same(normalized, expected)) throw new TypeError('CANCEL_EVENT_BATCH_CONFLICT');
  return expectedEvent;
}

/** @param {any} source @param {string} runId @param {number} revision */
function sourceAcquisitionCancellation(source, runId, revision) {
  const clarificationEvents = Array.isArray(source.clarification_events)
    ? source.clarification_events : [];
  const executionEvents = Array.isArray(source.execution_events) ? source.execution_events : [];
  const cancellations = [...clarificationEvents, ...executionEvents].filter(
    (/** @type {any} */ event) => event?.event_type === 'cancel_run'
  );
  if (!cancellations.length) return null;
  if (clarificationEvents.length !== 1 || executionEvents.length !== 0
    || cancellations.length !== 1) throw new TypeError('CANCEL_EVENT_BATCH_CONFLICT');
  const expected = constructCancelRunEventV4({
    run_id: runId, phase: 'source_acquisition', phase_version: revision
  });
  if (!same(cancellations[0], expected)) throw new TypeError('CANCEL_EVENT_STALE');
  return expected;
}

/** Compare original material only. User-statement history is checked by the
 * existing append/replay validation and must not be mistaken for a new source.
 * @param {any} prior @param {any} candidate */
function sourceChangeDiagnostics(prior, candidate) {
  /** @type {any[]} */ const changed = [];
  /** @param {string} field */
  const problem = field => changed.push({
    category: 'traceability', code: 'NEW_RUN_REQUIRED', path: field,
    message: `Original source/scope changed at ${field}. No candidate was committed. Preserve this run and create a new run; link it through the Adapter catalog.`
  });
  for (const field of ['run_scope', 'source_assets']) {
    if (!same(prior[field], candidate[field])) problem(`/${field}`);
  }
  const before = new Map(prior.sources.map((/** @type {any} */ source) => [source.source_id, source]));
  const after = new Map(candidate.sources.map((/** @type {any} */ source) => [source.source_id, source]));
  if (before.size !== after.size || [...before.keys()].some(id => !after.has(id))) {
    problem('/sources');
    return changed;
  }
  /** @param {any} source */
  const original = source => {
    const copy = structuredClone(source);
    delete copy.semantic_digest;
    copy.semantic_projection.structure = copy.semantic_projection.structure.filter(
      (/** @type {any} */ unit) => unit.type !== 'user_statement'
    );
    return copy;
  };
  candidate.sources.forEach((/** @type {any} */ source, /** @type {number} */ index) => {
    if (!same(original(before.get(source.source_id)), original(source))) problem(`/sources/${index}`);
  });
  return changed;
}

/** A clarification revision may add only compiler-verifiable user-statement
 * units/locators/reviews and append semantic events. Original PRD bytes,
 * policy, assets, scope and execution history remain immutable.
 * @param {any} prior @param {any} candidate */
function semanticAppendDiagnostics(prior, candidate, acquisitionVerified = false) {
  /** @type {any[]} */
  const output = [];
  /** @param {string} code @param {string} pathValue @param {string} message */
  const problem = (code, pathValue, message) => output.push({
    category: 'traceability', code, path: pathValue, message
  });
  for (const key of [
    'run_instance_id', 'run_scope', 'delivery_intent', 'output_language',
    'source_policy', 'source_assets', 'execution_events'
  ]) if (!same(prior[key], candidate[key])) problem(
    'V4_SOURCE_APPEND_IMMUTABLE_CHANGED', `/${key}`,
    `Clarification revisions must preserve ${key}.`
  );
  if (!acquisitionVerified && !same(prior.artifact_events, candidate.artifact_events)) {
    problem('V4_SOURCE_APPEND_IMMUTABLE_CHANGED', '/artifact_events',
      'Clarification revisions may change artifact_events only through verified source acquisition.');
  }
  if (!Array.isArray(candidate.decision_records)
    || (candidate.decision_records.length > 0 && !same(candidate.decision_records, prior.decision_records))) {
    problem('V4_DECISION_JOURNAL_COMPILER_OWNED', '/decision_records',
      'The Adapter must carry no Decision records or the exact committed compiler journal.');
  }
  if (!Array.isArray(prior.clarification_events) || !Array.isArray(candidate.clarification_events)
    || !exactPrefix(prior.clarification_events, candidate.clarification_events)
    || candidate.clarification_events.length === prior.clarification_events.length) {
    problem('V4_CLARIFICATION_APPEND_INVALID', '/clarification_events',
      'A higher clarification revision must append at least one event to the exact committed prefix.');
  }
  if (!Array.isArray(prior.sources) || !Array.isArray(candidate.sources)
    || prior.sources.length !== candidate.sources.length) {
    problem('V4_SOURCE_SET_CHANGED', '/sources', 'Clarification cannot add, remove, or reorder original sources.');
    return output;
  }
  const appendedUnitIds = new Set();
  for (let index = 0; index < prior.sources.length; index += 1) {
    const before = prior.sources[index]; const after = candidate.sources[index];
    if (!record(before) || !record(after) || before.source_id !== after.source_id
      || !record(before.semantic_projection) || !record(after.semantic_projection)) {
      problem('V4_SOURCE_SET_CHANGED', `/sources/${index}`, 'Source identity and projection must remain bound.');
      continue;
    }
    const beforeStable = structuredClone(before); const afterStable = structuredClone(after);
    delete beforeStable.semantic_digest; delete afterStable.semantic_digest;
    const beforeStructure = beforeStable.semantic_projection.structure;
    const afterStructure = afterStable.semantic_projection.structure;
    delete beforeStable.semantic_projection.structure; delete afterStable.semantic_projection.structure;
    if (!same(beforeStable, afterStable)
      || !Array.isArray(beforeStructure) || !Array.isArray(afterStructure)
      || !exactPrefix(beforeStructure, afterStructure)) {
      problem('V4_SOURCE_BYTES_CHANGED', `/sources/${index}`,
        'Only appended canonical user-statement units may change a clarification source projection.');
      continue;
    }
    for (const unit of afterStructure.slice(beforeStructure.length)) {
      if (!record(unit) || unit.type !== 'user_statement' || typeof unit.unit_id !== 'string') {
        problem('V4_USER_STATEMENT_UNIT_INVALID', `/sources/${index}/semantic_projection/structure`,
          'Every appended source unit must be an exact user_statement.');
      } else appendedUnitIds.add(unit.unit_id);
    }
    if (after.semantic_digest !== `sha256:${digest(after.semantic_projection)}`) {
      problem('V4_SOURCE_SEMANTIC_DIGEST_MISMATCH', `/sources/${index}/semantic_digest`,
        'The changed semantic projection must carry its exact canonical digest.');
    }
  }
  const priorLocators = new Map(prior.locators.map((/** @type {any} */ item) => [item.locator_id, item]));
  const candidateLocators = new Map(candidate.locators.map((/** @type {any} */ item) => [item.locator_id, item]));
  for (const [locatorId, before] of priorLocators) {
    const after = candidateLocators.get(locatorId);
    if (!after) { problem('V4_LOCATOR_REMOVED', '/locators', `Committed locator ${locatorId} was removed.`); continue; }
    const beforeStable = structuredClone(before); const afterStable = structuredClone(after);
    delete beforeStable.semantic_digest; delete afterStable.semantic_digest;
    if (!same(beforeStable, afterStable)) problem('V4_LOCATOR_CHANGED', '/locators',
      `Committed locator ${locatorId} changed outside its source semantic digest.`);
  }
  for (const [locatorId, locator] of candidateLocators) if (!priorLocators.has(locatorId)) {
    if (locator.type !== 'user_statement' || !appendedUnitIds.has(locator.unit_id)) problem(
      'V4_USER_STATEMENT_LOCATOR_INVALID', '/locators',
      `New locator ${locatorId} must bind one newly appended user_statement unit.`
    );
  }
  const priorReviews = new Map(prior.source_reviews.map((/** @type {any} */ item) => [item.source_id, item]));
  const candidateReviews = new Map(candidate.source_reviews.map((/** @type {any} */ item) => [item.source_id, item]));
  if (priorReviews.size !== candidateReviews.size) problem(
    'V4_SOURCE_REVIEW_SET_CHANGED', '/source_reviews', 'Source review owners cannot change during clarification.'
  );
  for (const [sourceId, before] of priorReviews) {
    const after = candidateReviews.get(sourceId);
    if (!after || !Array.isArray(before.units) || !Array.isArray(after.units)
      || !exactPrefix(before.units, after.units)) {
      problem('V4_SOURCE_REVIEW_CHANGED', '/source_reviews',
        `Review history for ${sourceId} must preserve the committed prefix.`);
      continue;
    }
    const stableBefore = structuredClone(before); const stableAfter = structuredClone(after);
    delete stableBefore.semantic_digest; delete stableAfter.semantic_digest;
    stableBefore.units = []; stableAfter.units = [];
    if (!same(stableBefore, stableAfter) || after.units.slice(before.units.length).some(
      (/** @type {any} */ item) => !appendedUnitIds.has(item.unit_id) || item.classification !== 'non_normative'
    )) problem('V4_SOURCE_REVIEW_CHANGED', '/source_reviews',
      `Review history for ${sourceId} may append only non-normative user statements.`);
  }
  return output;
}

/** @param {any} sourcePack @param {any[]} events */
function normalizedAnswerMessages(sourcePack, events) {
  const units = sourcePack.sources.flatMap((/** @type {any} */ source) => source.semantic_projection.structure)
    .filter((/** @type {any} */ unit) => unit.type === 'user_statement');
  return events.filter(event => event.event_type === 'answer_question_part').map(event => {
    const matches = units.filter((/** @type {any} */ unit) =>
      unit.presentation_id === event.presentation_id
      && unit.message_digest === event.answer_origin?.message_digest
      && unit.answer_span?.start === event.answer_origin?.answer_span?.start_scalar
      && unit.answer_span?.end === event.answer_origin?.answer_span?.end_scalar
      && typeof unit.text === 'string'
      && sourceByteDigest(new TextEncoder().encode(normalizeDecisionMessageV4(unit.text))) === unit.message_digest
    );
    if (matches.length !== 1) throw new TypeError('V4_DECISION_MESSAGE_PROVENANCE_INVALID');
    return normalizeDecisionMessageV4(matches[0].text);
  });
}

/** @param {any} sourcePack @param {any[]} decisions */
function decisionEvidenceBindings(sourcePack, decisions) {
  return decisions.map(decision => {
    const origin = decision.answer_origin;
    const matches = sourcePack.locators.filter((/** @type {any} */ locator) =>
      locator.type === 'user_statement'
      && locator.presentation_id === origin.presentation_id
      && locator.message_digest === origin.message_digest
      && locator.answer_span?.start === origin.answer_span.start_scalar
      && locator.answer_span?.end === origin.answer_span.end_scalar
      && locator.excerpt_digest === origin.answer_span.excerpt_digest
    );
    if (matches.length !== 1) throw new TypeError('V4_DECISION_LOCATOR_PROVENANCE_INVALID');
    return {
      root_issue_id: decision.target.root_issue_id,
      root_version_digest: decision.target.root_version_digest,
      source_locator_id: matches[0].locator_id
    };
  });
}

/** @param {string} runDirectory @param {string} runId @param {number} revision */
async function committedSemanticCheckpoint(runDirectory, runId, revision) {
  const snapshot = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'checkpoint.json'));
  if (!snapshot || snapshot.value?.run_id !== runId || snapshot.value?.revision !== revision
    || validateSemanticClarificationCheckpointV4(snapshot.value).length) {
    throw new TypeError('V4_COMMITTED_CHECKPOINT_INVALID');
  }
  return snapshot;
}

/** @param {string} runDirectory @param {number} revision */
async function committedRevisionMetadata(runDirectory, revision) {
  const snapshot = await readJsonIfPresent(
    runDirectory,
    path.join(runDirectory, 'transactions', 'committed', `${revisionName(revision)}.json`)
  );
  if (!snapshot || !isV4SchemaVersion(snapshot.value?.schema_version)
    || snapshot.value?.revision !== revision
    || !SHA256.test(String(snapshot.value?.semantic_digest))) {
    throw new TypeError('V4_COMMITTED_REVISION_RECORD_INVALID');
  }
  return snapshot.value;
}

/** @param {any} checkpoint */
function obligationBindingsByRoot(checkpoint) {
  return checkpoint.semantic_gap_ledger.map((/** @type {any} */ root) => ({
    root_issue_id: root.root_issue_id,
    obligation_ids: Array.isArray(root.affected_test_point_ids)
      ? [...root.affected_test_point_ids] : []
  }));
}

/** @param {string} runDirectory @param {number} revision */
async function presentationHistory(runDirectory, revision) {
  /** @type {any[]} */
  const history = [];
  for (let index = 0; index <= revision; index += 1) {
    const snapshot = await readJsonIfPresent(
      runDirectory, path.join(runDirectory, 'derived', `r${String(index).padStart(3, '0')}`, 'checkpoint.json')
    );
    const presentation = snapshot?.value?.clarification_state?.presentation;
    if (presentation && !history.some(item => item.presentation_id === presentation.presentation_id)) {
      history.push(presentation);
    }
  }
  return history;
}

/** @param {any} system @param {any|null} checkpoint @param {any[]} decisionRecords */
export function withClarificationState(system, checkpoint, decisionRecords = []) {
  const states = checkpoint?.clarification_state?.root_states ?? [];
  return {
    ...system,
    decisions: {
      delivery_requested: states.length > 0 && states.every((/** @type {any} */ item) => item.status !== 'presented'),
      root_statuses: states.map((/** @type {any} */ item) => ({
        root_issue_id: item.root_issue_id,
        root_version_digest: item.root_version_digest,
        status: item.status
      })),
      records: structuredClone(decisionRecords)
    }
  };
}

/** @param {Record<string,any>} artifacts @param {string} runId @param {any|null} checkpoint
 * @param {any[]} [nonBlockingDiagnostics] */
async function replayPreCasePresentation(
  artifacts, runId, checkpoint = null,
  nonBlockingDiagnostics = []
) {
  if (!artifacts.source_pack || !artifacts.evidence_claims || artifacts.behavior_views) return null;
  if (checkpoint) {
    if (checkpoint.run_id !== runId
      || checkpoint.revision !== artifacts.source_pack.source_revision
      || validateSemanticClarificationCheckpointV4(checkpoint).length) {
      throw new TypeError('V4_COMMITTED_CHECKPOINT_INVALID');
    }
    assertCheckpointAnswerTargetsV4(checkpoint, artifacts.evidence_claims);
    return checkpoint.clarification_state.presentation
      ? semanticQuestionReply(
        runId, checkpoint.clarification_state.presentation, nonBlockingDiagnostics
      )
      : null;
  }
  const compiled = compilePreCaseClarification(
    artifacts.source_pack, artifacts.evidence_claims, runId, null, null
  );
  return compiled.presentation ? semanticQuestionReply(runId, compiled.presentation) : null;
}

/** Run the same ephemeral signed-source gate for a semantic append that the
 * initial Source Pack uses. The unsafe staging snapshot is removed before a
 * stop or diagnostic is returned; only the redacted acquisition checkpoint is
 * durable. @param {string} runDirectory @param {any} candidate
 * @param {number} revision @param {string} runId
 * @param {'requirements_analysis'|'case_design'} phase */
async function semanticAppendAcquisition(
  runDirectory, candidate, revision, runId, phase
) {
  /** @type {any} */
  let acquisition;
  try {
    acquisition = await advanceSourceAcquisitionV4(
      runDirectory, candidate.value, runId
    );
  } catch (error) {
    const { provider_registry: providers } = createCompilerSourceRuntimeV4(candidate.value.schema_version);
    if (!persistableSourceValues(candidate.value, providers)) {
      await discardStagingSnapshot(runDirectory, 'source_pack', candidate).catch(() => {});
    }
    return {
      kind: 'reply', reply: qualityFailure(
        runId, phase,
        error instanceof Error ? error.message : 'SOURCE_ACQUISITION_STATE_INVALID',
        '澄清附带的来源材料无法通过确定性隔离检查。'
      )
    };
  }
  if (acquisition.discard_candidate) {
    await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
  }
  if (acquisition.kind === 'need_artifact') {
    return { kind: 'reply', reply: acquisition.reply };
  }
  if (acquisition.kind === 'rejected') {
    return {
      kind: 'reply', reply: revisionReply(
        runDirectory, 'source_pack', revision, candidate.value, [{
          category: 'source', code: acquisition.code, path: '/artifact_events',
          message: 'Clarification source acquisition or recovery binding is invalid.'
        }], runId
      )
    };
  }
  return {
    kind: 'continue',
    verified: ['accepted', 'verified'].includes(acquisition.kind)
  };
}

/** @param {string} runDirectory @param {any} prior @param {any} candidate
 * @param {number} candidateRevision @param {string} runId @param {unknown} lockOwnership */
async function consumeSemanticAcquisitionCancellation(
  runDirectory, prior, candidate, candidateRevision, runId, lockOwnership
) {
  let stop;
  try { stop = await replaySourceAcquisitionStopV4(runDirectory, runId); }
  catch (error) {
    return qualityFailure(
      runId, 'source_acquisition',
      error instanceof Error ? error.message : 'SOURCE_ACQUISITION_STATE_INVALID',
      '已提交的来源获取检查点无法安全恢复。'
    );
  }
  if (!stop) return null;
  try {
    const cancellation = semanticAcquisitionCancellationAppend(
      prior, candidate.value, runId, candidateRevision
    );
    if (!cancellation) return null;
    await cancelRunV4WithHeldLock(runDirectory, cancellation, lockOwnership);
    await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
    return await replayCancelledRunV4WithHeldLock(
      runDirectory, runId, lockOwnership
    );
  } catch (error) {
    return revisionReply(runDirectory, 'source_pack', candidateRevision, candidate.value, [{
      category: 'traceability',
      code: error instanceof Error ? error.message : 'CANCEL_EVENT_INVALID',
      path: '/clarification_events',
      message: 'Source-acquisition cancellation must be the only append and bind the displayed stop.'
    }], runId);
  }
}

/** Reuse the runner's repair validation without committing or reconciling.
 * Read-only callers verify existing material ownership instead of preparing it.
 * @param {string} runDirectory @param {any} registry @param {Record<string,any>} artifacts
 * @param {number} revision @param {string} runId @param {any} candidate @param {boolean} [readOnly]
 * @returns {Promise<any>} */
async function inspectEvidenceRepairCandidate(
  runDirectory, registry, artifacts, revision, runId, candidate, readOnly = false
) {
  const prior = artifacts.source_pack;
  const reject = (/** @type {typeof STAGES[number]} */ stage, /** @type {any} */ value, /** @type {any[]} */ issues) => ({
    kind: 'reply', reply: revisionReply(runDirectory, stage, revision + 1, value, issues, runId)
  });
  const sourceIssues = candidate.parse_diagnostics.length
    ? candidate.parse_diagnostics
    : diagnostics(candidate.value, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack));
  if (sourceIssues.length) return reject('source_pack', candidate.value, sourceIssues);
  const source = candidate.value;
  if (source.run_instance_id !== runId || source.source_revision !== revision + 1) return reject(
    'source_pack', source, [{ category: 'traceability', code: 'SOURCE_REVISION_MISMATCH',
      path: '/source_revision', message: 'Evidence repair must bind this run and the next revision.' }]
  );
  const repairIssues = repairDiagnostics({ source_pack: prior, artifacts }, source);
  if (repairIssues.length) return reject('source_pack', source, repairIssues);
  if (appendedRepair(prior, source)?.stage !== 'evidence_claims') return reject(
    'source_pack', source, [{ category: 'traceability', code: 'ARTIFACT_REPAIR_INVALID',
      path: '/artifact_repairs', message: 'Exactly one Evidence repair must be appended.' }]
  );
  const stablePrior = structuredClone(prior); const stableNext = structuredClone(source);
  delete stablePrior.source_revision; delete stableNext.source_revision;
  delete stablePrior.artifact_repairs; delete stableNext.artifact_repairs;
  if (!same(stablePrior, stableNext)) return reject('source_pack', source, [{
    category: 'traceability', code: 'V4_SOURCE_APPEND_IMMUTABLE_CHANGED', path: '/',
    message: 'An Evidence repair must preserve the complete accepted Source Pack except revision and repair history.'
  }]);
  const stagedEvidence = await stagedArtifact(runDirectory, 'evidence_claims');
  if (!stagedEvidence) return {
    kind: 'reply', reply: artifactRequest(runDirectory, 'evidence_claims', revision + 1, runId)
  };
  const evidenceIssues = stagedEvidence.parse_diagnostics.length
    ? stagedEvidence.parse_diagnostics
    : diagnostics(stagedEvidence.value, registry.schemas.get(AGENT_STAGE_SCHEMA.evidence_claims));
  if (evidenceIssues.length) return reject('evidence_claims', stagedEvidence.value, evidenceIssues);
  const evidence = stagedEvidence.value;
  if (evidence.schema_version !== source.schema_version || evidence.source_revision !== revision + 1) return reject(
    'evidence_claims', evidence, [{ category: 'traceability', code: 'SOURCE_REVISION_MISMATCH',
      path: '/source_revision', message: 'Repaired Evidence must bind the candidate Source revision.' }]
  );
  let system;
  try {
    if (!readOnly) await prepareSourceAcquisitionCandidateV4(runDirectory, source);
    system = await preCaseSystem(runDirectory, source, evidence, readOnly);
  }
  catch (error) { return reject('source_pack', source, [{
    category: 'traceability', code: error instanceof Error ? error.message : 'V4_PRE_CASE_CONTEXT_INVALID',
    path: '/', message: 'Evidence repair cannot reproduce the compiler-owned source context.'
  }]); }
  const gate = compilePreCaseArtifactsV4({ source_pack: source, evidence_claims: evidence }, system);
  if (gate.status === 'need_revision') return reject(resultStage(gate),
    resultStage(gate) === 'source_pack' ? source : evidence, gate.diagnostics ?? []);
  if (!['pre_case', 'need_user_answers'].includes(gate.status)) return {
    kind: 'reply', reply: qualityFailure(runId, 'requirements_analysis',
      gate.reason_code ?? 'V4_PRE_CASE_QUALITY_FAILURE',
      gate.diagnostics?.[0]?.message ?? 'The repaired Evidence failed the pre-case quality gate.')
  };
  let priorCheckpoint; let clarification;
  try {
    priorCheckpoint = await committedSemanticCheckpoint(runDirectory, runId, revision);
    clarification = compilePreCaseClarification(
      source, evidence, runId, priorCheckpoint.value, new TextEncoder().encode(priorCheckpoint.text)
    );
  } catch (error) {
      if (error instanceof Error && /^CLARIFICATION_(TARGET|WRITE)_/u.test(error.message)) return { kind: 'reply', reply: revisionReply(runDirectory, 'evidence_claims', revision + 1, evidence, [clarificationTargetDiagnosticV4(error)], runId) };
 return {
    kind: 'reply', reply: qualityFailure(runId, 'requirements_analysis',
      error instanceof Error ? error.message : 'SEMANTIC_PRESENTATION_INVALID',
      'Repaired Evidence cannot form a recoverable pre-case checkpoint.')
  }; }
  return { kind: 'candidate', source, evidence, clarification, stagedEvidence };
}

/** Consume only an Evidence generation repair. This dispatch happens before
 * clarification and before any completed delivery is replayed.
 * @param {string} runDirectory @param {any} registry @param {Record<string,any>} artifacts
 * @param {number} revision @param {string} runId @param {unknown} lockOwnership */
async function consumeEvidenceRepair(
  runDirectory, registry, artifacts, revision, runId, lockOwnership
) {
  if (!artifacts.source_pack || !artifacts.evidence_claims) return { kind: 'none' };
  if (!['4.3.3'].includes(artifacts.source_pack.schema_version)) return { kind: 'none' };
  const candidate = await stagedArtifact(runDirectory, 'source_pack');
  if (!candidate) return { kind: 'none' };
  if (candidate.parse_diagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value,
      candidate.parse_diagnostics, runId
    )
  };
  const prior = artifacts.source_pack;
  const proposedRepairs = candidate.value?.artifact_repairs;
  const repairChanged = Object.hasOwn(candidate.value ?? {}, 'artifact_repairs')
    && !same(proposedRepairs, prior.artifact_repairs ?? []);
  const evidenceRepair = appendedRepair(prior, candidate.value)?.stage === 'evidence_claims'
    || (repairChanged && (!Array.isArray(proposedRepairs)
      || proposedRepairs.some((/** @type {any} */ repair) => repair?.stage === 'evidence_claims')));
  if (!evidenceRepair) {
    // The previous commit may have completed before staging cleanup.
    if (candidate.value?.source_revision === revision && same(candidate.value, prior)) {
      await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
      const stagedEvidence = await stagedArtifact(runDirectory, 'evidence_claims');
      if (stagedEvidence && stagedEvidence.value?.source_revision === revision
        && same(stagedEvidence.value, artifacts.evidence_claims)) {
        await discardStagingSnapshot(runDirectory, 'evidence_claims', stagedEvidence);
      }
    }
    return { kind: 'none' };
  }
  const inspected = await inspectEvidenceRepairCandidate(
    runDirectory, registry, artifacts, revision, runId, candidate
  );
  if (inspected.kind === 'reply') return inspected;
  const { source, evidence, clarification, stagedEvidence } = inspected;
  try {
    await commitRevisionTransactionV4WithHeldLock(
      runDirectory, preCaseTransaction(runId, source, evidence, clarification.checkpoint, revision),
      lockOwnership
    );
    await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
    await discardStagingSnapshot(runDirectory, 'evidence_claims', stagedEvidence);
  } catch (error) { return {
    kind: 'reply', reply: qualityFailure(runId, 'requirements_analysis',
      error instanceof Error ? error.message : 'V4_REVISION_TRANSACTION_FAILED',
      'Evidence repair revision did not commit atomically.')
  }; }
  if (clarification.presentation) return {
    kind: 'reply', reply: semanticQuestionReply(runId, clarification.presentation)
  };
  return { kind: 'advanced', revision: revision + 1,
    artifacts: { source_pack: source, evidence_claims: evidence },
    checkpoint: clarification.checkpoint };
}

/** Consume one append-only clarification revision before replaying the prior
 * presentation. Returning `advanced` means the new committed revision has no
 * remaining pre-case question and the caller should request Behavior Views.
 * @param {string} runDirectory @param {any} registry @param {Record<string,any>} artifacts
 * @param {number} revision @param {string} runId @param {unknown} lockOwnership */
async function consumeSemanticAppend(
  runDirectory, registry, artifacts, revision, runId, lockOwnership
) {
  if (!artifacts.source_pack || !artifacts.evidence_claims || artifacts.behavior_views) {
    return { kind: 'none' };
  }
  const candidate = await stagedArtifact(runDirectory, 'source_pack');
  if (!candidate) return { kind: 'none' };
  if (candidate.parse_diagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value,
      candidate.parse_diagnostics, runId
    )
  };
  const schemaDiagnostics = diagnostics(
    candidate.value, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack)
  );
  if (schemaDiagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value, schemaDiagnostics, runId
    )
  };
  if (!record(candidate.value)) return { kind: 'none' };
  if (candidate.value.source_revision === revision) {
    const replayCandidate = structuredClone(candidate.value);
    replayCandidate.decision_records = structuredClone(artifacts.source_pack.decision_records);
    if (same(replayCandidate, artifacts.source_pack)) {
      await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
      if (revision === 0) return { kind: 'none' };
      let priorSource; let checkpoint;
      try {
        priorSource = (await readJson(
          runDirectory, acceptedPath(runDirectory, revision - 1, 'source_pack')
        )).value;
        checkpoint = (await committedSemanticCheckpoint(
          runDirectory, runId, revision
        )).value;
      } catch {
        return { kind: 'none' };
      }
      const priorEvents = Array.isArray(priorSource?.clarification_events)
        ? priorSource.clarification_events : [];
      const replayedEvents = candidate.value.clarification_events.slice(priorEvents.length);
      const warnings = replayedEvents
        .map((/** @type {any} */ event) => finalAuthorityWarningV4(event))
        .filter((/** @type {any} */ warning) => warning !== null);
      return {
        kind: 'advanced', revision, artifacts,
        checkpoint, non_blocking_diagnostics: sortNonBlockingDiagnosticsV4(warnings)
      };
    }
    return {
      kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
        category: 'traceability', code: 'V4_SOURCE_REVISION_STALE', path: '/source_revision',
        message: 'A clarification append must use the next committed source revision.'
      }], runId)
    };
  }
  if (candidate.value.source_revision !== revision + 1
    || candidate.value.run_instance_id !== runId) return {
    kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
      category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
      message: 'A clarification append must bind this run and exactly the next source revision.'
    }], runId)
  };
  const pendingCancellation = await consumeSemanticAcquisitionCancellation(
    runDirectory, artifacts.source_pack, candidate, revision + 1, runId, lockOwnership
  );
  if (pendingCancellation) return { kind: 'reply', reply: pendingCancellation };
  try {
    const current = await committedSemanticCheckpoint(runDirectory, runId, revision);
    assertCheckpointAnswerTargetsV4(current.value, artifacts.evidence_claims);
    assertCheckpointAnswerTargetsV4(current.value, artifacts.evidence_claims,
      candidate.value.clarification_events.slice(artifacts.source_pack.clarification_events.length),
      artifacts.source_pack.clarification_events);
  } catch (error) {
    return { kind: 'reply', reply: revisionReply(runDirectory, 'evidence_claims', revision + 1,
      artifacts.evidence_claims, [clarificationTargetDiagnosticV4(error)], runId) };
  }
  const acquisition = await semanticAppendAcquisition(
    runDirectory, candidate, revision + 1, runId, 'requirements_analysis'
  );
  if (acquisition.kind === 'reply') return acquisition;
  const appendDiagnostics = semanticAppendDiagnostics(
    artifacts.source_pack, candidate.value, acquisition.verified
  );
  if (appendDiagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value, appendDiagnostics, runId
    )
  };
  try {
    const cancellation = semanticCancellationAppend(
      artifacts.source_pack, candidate.value, 'requirements_analysis', runId, revision
    );
    if (cancellation) {
      await cancelRunV4WithHeldLock(runDirectory, cancellation, lockOwnership);
      return {
        kind: 'reply', reply: await replayCancelledRunV4WithHeldLock(
          runDirectory, runId, lockOwnership
        )
      };
    }
  } catch (error) {
    return {
      kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
        category: 'traceability',
        code: error instanceof Error ? error.message : 'CANCEL_EVENT_INVALID',
        path: '/clarification_events',
        message: 'Cancellation must be the only append and bind the displayed semantic phase/version.'
      }], runId)
    };
  }
  let committed;
  try { committed = await committedSemanticCheckpoint(runDirectory, runId, revision); }
  catch (error) {
    return {
      kind: 'reply', reply: qualityFailure(runId, 'requirements_analysis',
        error instanceof Error ? error.message : 'V4_COMMITTED_CHECKPOINT_INVALID',
        '已提交的澄清检查点无法安全恢复。')
    };
  }
  const priorEvents = artifacts.source_pack.clarification_events;
  const appendedEvents = candidate.value.clarification_events.slice(priorEvents.length);
  const normalizedSource = {
    ...structuredClone(candidate.value),
    decision_records: structuredClone(artifacts.source_pack.decision_records)
  };
  let applied;
  try {
    applied = applySemanticClarificationEventsV4({
      checkpoint: committed.value,
      clarification_events: appendedEvents,
      existing_decisions: artifacts.source_pack.decision_records,
      presentation_history: await presentationHistory(runDirectory, revision),
      normalized_user_messages: normalizedAnswerMessages(normalizedSource, appendedEvents),
      previous_obligations_by_root: [], current_obligations_by_root: []
    });
  } catch (error) {
    return {
      kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
        category: 'traceability',
        code: error instanceof Error ? error.message : 'V4_CLARIFICATION_APPEND_INVALID',
        path: '/clarification_events',
        message: 'The clarification append could not be bound to exact presented questions and user text.'
      }], runId)
    };
  }
  if (!applied.commit_required) {
    await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
    const nonBlockingDiagnostics = applied.non_blocking_diagnostics ?? [];
    if (!applied.presentation) return {
      kind: 'advanced', revision, artifacts, checkpoint: committed.value,
      non_blocking_diagnostics: nonBlockingDiagnostics
    };
    return {
      kind: 'reply',
      reply: semanticQuestionReply(
        runId, applied.presentation ?? committed.value.clarification_state.presentation,
        nonBlockingDiagnostics
      )
    };
  }
  const newDecisions = applied.decisions.slice(artifacts.source_pack.decision_records.length);
  const nextSource = { ...normalizedSource, decision_records: structuredClone(applied.decisions) };
  let nextEvidence = {
    ...structuredClone(artifacts.evidence_claims), source_revision: revision + 1
  };
  try {
    if (newDecisions.length) nextEvidence = compileV4DecisionEvidenceOverlay(
      nextEvidence, newDecisions, decisionEvidenceBindings(nextSource, newDecisions)
    ).evidence;
  } catch (error) {
    return {
      kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
        category: 'traceability',
        code: error instanceof Error ? error.message : 'V4_DECISION_EVIDENCE_INVALID',
        path: '/clarification_events',
        message: 'The accepted answer could not form an independently traceable Decision Claim.'
      }], runId)
    };
  }
  const compiledArtifactDiagnostics = [
    ...diagnostics(nextSource, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack)),
    ...diagnostics(nextEvidence, registry.schemas.get(AGENT_STAGE_SCHEMA.evidence_claims))
  ];
  if (compiledArtifactDiagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value,
      compiledArtifactDiagnostics, runId
    )
  };
  let clarification;
  try {
    clarification = compilePreCaseClarification(
      nextSource, nextEvidence, runId, applied.checkpoint,
      new TextEncoder().encode(committed.text)
    );
  } catch (error) {
      if (error instanceof Error && /^CLARIFICATION_(TARGET|WRITE)_/u.test(error.message)) return { kind: 'reply', reply: revisionReply(runDirectory, 'evidence_claims', revision + 1, nextEvidence, [clarificationTargetDiagnosticV4(error)], runId) };

    return {
      kind: 'reply', reply: qualityFailure(runId, 'requirements_analysis',
        error instanceof Error ? error.message : 'SEMANTIC_PRESENTATION_INVALID',
        '澄清事件无法形成可恢复的下一版本检查点。')
    };
  }
  try {
    await commitRevisionTransactionV4WithHeldLock(
      runDirectory,
      preCaseTransaction(
        runId, nextSource, nextEvidence, clarification.checkpoint, revision,
        appendedEvents.map((/** @type {any} */ event) => event.event_id)
      ),
      lockOwnership
    );
    await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
  } catch (error) {
    return {
      kind: 'reply', reply: qualityFailure(runId, 'requirements_analysis',
        error instanceof Error ? error.message : 'V4_REVISION_TRANSACTION_FAILED',
        '澄清 revision 未能完整原子提交。')
    };
  }
  if (clarification.presentation) return {
    kind: 'reply',
    reply: semanticQuestionReply(runId, clarification.presentation, applied.non_blocking_diagnostics)
  };
  return {
    kind: 'advanced', revision: revision + 1,
    artifacts: { source_pack: nextSource, evidence_claims: nextEvidence },
    checkpoint: clarification.checkpoint,
    non_blocking_diagnostics: applied.non_blocking_diagnostics
  };
}

/** Commit a post-case answer as the next accepted Source/Evidence prefix.
 * Views and cases are then rechecked through the existing stages against that prefix.
 * @param {string} runDirectory @param {any} registry @param {Record<string,any>} artifacts
 * @param {number} revision @param {string} runId @param {unknown} lockOwnership */
async function consumePostCaseAppend(
  runDirectory, registry, artifacts, revision, runId, lockOwnership
) {
  if (!artifacts.source_pack || !artifacts.evidence_claims
    || !artifacts.behavior_views || !artifacts.case_drafts) return { kind: 'none' };
  const candidate = await stagedArtifact(runDirectory, 'source_pack');
  if (!candidate) return { kind: 'none' };
  if (candidate.parse_diagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value,
      candidate.parse_diagnostics, runId
    )
  };
  const schemaDiagnostics = diagnostics(
    candidate.value, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack)
  );
  if (schemaDiagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value, schemaDiagnostics, runId
    )
  };
  if (!record(candidate.value)) return { kind: 'none' };
  if (candidate.value.source_revision === revision) {
    const replayCandidate = structuredClone(candidate.value);
    replayCandidate.decision_records = structuredClone(artifacts.source_pack.decision_records);
    if (same(replayCandidate, artifacts.source_pack)) {
      await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
      return { kind: 'none' };
    }
  }
  if (candidate.value.source_revision !== revision + 1
    || candidate.value.run_instance_id !== runId) return {
    kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
      category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
      message: 'A post-case clarification append must bind this run and exactly the next source revision.'
    }], runId)
  };
  const pendingCancellation = await consumeSemanticAcquisitionCancellation(
    runDirectory, artifacts.source_pack, candidate, revision + 1, runId, lockOwnership
  );
  if (pendingCancellation) return { kind: 'reply', reply: pendingCancellation };
  try {
    const current = await committedSemanticCheckpoint(runDirectory, runId, revision);
    assertCheckpointAnswerTargetsV4(current.value, artifacts.evidence_claims);
    assertCheckpointAnswerTargetsV4(current.value, artifacts.evidence_claims,
      candidate.value.clarification_events.slice(artifacts.source_pack.clarification_events.length),
      artifacts.source_pack.clarification_events);
  } catch (error) {
    return { kind: 'reply', reply: revisionReply(runDirectory, 'evidence_claims', revision + 1,
      artifacts.evidence_claims, [clarificationTargetDiagnosticV4(error)], runId) };
  }
  const acquisition = await semanticAppendAcquisition(
    runDirectory, candidate, revision + 1, runId, 'case_design'
  );
  if (acquisition.kind === 'reply') return acquisition;
  const immutableDiagnostics = semanticAppendDiagnostics(
    artifacts.source_pack, candidate.value, acquisition.verified
  );
  if (immutableDiagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', revision + 1, candidate.value, immutableDiagnostics, runId
    )
  };
  try {
    const cancellation = semanticCancellationAppend(
      artifacts.source_pack, candidate.value, 'case_design', runId, revision
    );
    if (cancellation) {
      await cancelRunV4WithHeldLock(runDirectory, cancellation, lockOwnership);
      return {
        kind: 'reply', reply: await replayCancelledRunV4WithHeldLock(
          runDirectory, runId, lockOwnership
        )
      };
    }
  } catch (error) {
    return {
      kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
        category: 'traceability',
        code: error instanceof Error ? error.message : 'CANCEL_EVENT_INVALID',
        path: '/clarification_events',
        message: 'Cancellation must be the only append and bind the displayed post-case phase/version.'
      }], runId)
    };
  }

  let committed;
  try {
    committed = await committedSemanticCheckpoint(runDirectory, runId, revision);
    if (committed.value.commit_profile !== 'post_case_pending') {
      throw new TypeError('V4_POST_CASE_CHECKPOINT_REQUIRED');
    }
  } catch (error) {
    return {
      kind: 'reply', reply: qualityFailure(runId, 'case_design',
        error instanceof Error ? error.message : 'V4_COMMITTED_CHECKPOINT_INVALID',
        '已提交的 post-case 检查点无法安全恢复。')
    };
  }
  const priorEvents = artifacts.source_pack.clarification_events;
  const appendedEvents = candidate.value.clarification_events.slice(priorEvents.length);
  const normalizedSource = {
    ...structuredClone(candidate.value),
    decision_records: structuredClone(artifacts.source_pack.decision_records)
  };
  let applied;
  try {
    const bindings = obligationBindingsByRoot(committed.value);
    applied = applySemanticClarificationEventsV4({
      checkpoint: committed.value,
      clarification_events: appendedEvents,
      existing_decisions: artifacts.source_pack.decision_records,
      presentation_history: await presentationHistory(runDirectory, revision),
      normalized_user_messages: normalizedAnswerMessages(normalizedSource, appendedEvents),
      previous_obligations_by_root: bindings,
      current_obligations_by_root: bindings
    });
  } catch (error) {
    return {
      kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', revision + 1, candidate.value, [{
        category: 'traceability',
        code: error instanceof Error ? error.message : 'V4_CLARIFICATION_APPEND_INVALID',
        path: '/clarification_events',
        message: 'The post-case append could not be bound to the exact displayed questions.'
      }], runId)
    };
  }
  if (!applied.commit_required) {
    await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
    const nonBlockingDiagnostics = applied.non_blocking_diagnostics ?? [];
    if (!applied.presentation) return {
      kind: 'advanced', revision, artifacts, checkpoint: committed.value,
      non_blocking_diagnostics: nonBlockingDiagnostics
    };
    return {
      kind: 'reply', reply: semanticQuestionReply(
        runId, applied.presentation ?? committed.value.clarification_state.presentation,
        nonBlockingDiagnostics
      )
    };
  }

  const nextRevision = revision + 1;
  const newDecisions = applied.decisions.slice(artifacts.source_pack.decision_records.length);
  const nextSource = { ...normalizedSource, decision_records: structuredClone(applied.decisions) };
  let nextEvidence = {
    ...structuredClone(artifacts.evidence_claims), source_revision: nextRevision
  };
  try {
    if (newDecisions.length) nextEvidence = compileV4DecisionEvidenceOverlay(
      nextEvidence, newDecisions, decisionEvidenceBindings(nextSource, newDecisions)
    ).evidence;
  } catch (error) {
    return {
      kind: 'reply', reply: revisionReply(runDirectory, 'source_pack', nextRevision, candidate.value, [{
        category: 'traceability',
        code: error instanceof Error ? error.message : 'V4_DECISION_EVIDENCE_INVALID',
        path: '/clarification_events',
        message: 'The post-case answer could not form an independently traceable Decision Claim.'
      }], runId)
    };
  }
  const baseDiagnostics = [
    ...diagnostics(nextSource, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack)),
    ...diagnostics(nextEvidence, registry.schemas.get(AGENT_STAGE_SCHEMA.evidence_claims))
  ];
  if (baseDiagnostics.length) return {
    kind: 'reply', reply: revisionReply(
      runDirectory, 'source_pack', nextRevision, candidate.value, baseDiagnostics, runId
    )
  };
  // Do not carry cases forward by changing only their revision: their context
  // and independent review bind the previous accepted semantic content.
  let clarification;
  try {
    clarification = compilePreCaseClarification(
      nextSource, nextEvidence, runId, applied.checkpoint,
      new TextEncoder().encode(committed.text)
    );
    await commitRevisionTransactionV4WithHeldLock(
      runDirectory,
      preCaseTransaction(
        runId, nextSource, nextEvidence, clarification.checkpoint, revision,
        appendedEvents.map((/** @type {any} */ event) => event.event_id)
      ),
      lockOwnership
    );
    await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
  } catch (error) {
      if (error instanceof Error && /^CLARIFICATION_(TARGET|WRITE)_/u.test(error.message)) return { kind: 'reply', reply: revisionReply(runDirectory, 'evidence_claims', revision + 1, nextEvidence, [clarificationTargetDiagnosticV4(error)], runId) };

    return {
      kind: 'reply', reply: qualityFailure(runId, 'case_design',
        error instanceof Error ? error.message : 'V4_REVISION_TRANSACTION_FAILED',
        'post-case clarification revision 未能完整原子提交。')
    };
  }
  if (clarification.presentation) return {
    kind: 'reply', reply: semanticQuestionReply(
      runId, clarification.presentation, applied.non_blocking_diagnostics
    )
  };
  return {
    kind: 'advanced', revision: nextRevision,
    artifacts: { source_pack: nextSource, evidence_claims: nextEvidence },
    checkpoint: clarification.checkpoint,
    non_blocking_diagnostics: applied.non_blocking_diagnostics
  };
}

/** @param {string} runDirectory @param {typeof STAGES[number]} stage */
async function stagedArtifact(runDirectory, stage) {
  const text = await readTextIfPresent(runDirectory, stagingPath(runDirectory, stage));
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return { text, value, digest: digest(value), parse_diagnostics: [] };
  } catch {
    return {
      text, value: text, digest: digest(text),
      parse_diagnostics: [{
        category: 'schema', code: 'ARTIFACT_JSON_INVALID', path: '/',
        message: `${stage} staging artifact is not valid JSON.`
      }]
    };
  }
}

/** @param {unknown} value @param {any} schema */
function diagnostics(value, schema) {
  return [...validateAgainstSchema(value, schema), ...validateUniqueStableIds(value)];
}

/** @param {any} result */
function resultStage(result) {
  return STAGES.includes(result?.stage) ? result.stage : 'case_drafts';
}

/** @param {string} runDirectory @param {any} sourcePack @param {any} evidence @param {boolean} [readOnly] */
async function preCaseSystem(runDirectory, sourcePack, evidence, readOnly = false) {
  const acquisition = await loadSourceAcquisitionCompilerStateV4(runDirectory, sourcePack, { read_only: readOnly });
  return deriveV4PreCaseSystemContext(
    sourcePack, evidence, acquisition
  );
}

/** @param {string} runDirectory @param {any} artifacts */
async function completeSystem(runDirectory, artifacts) {
  const acquisition = await loadSourceAcquisitionCompilerStateV4(
    runDirectory, artifacts.source_pack
  );
  return deriveV4SystemContext(artifacts, acquisition);
}

/** Promote one fully clarified post-case revision to the only authoritative
 * Case Document delivery. All delivery bytes enter the same final transaction;
 * no output/current.json is written before that commit reaches final profile.
 * @param {string} runDirectory @param {string} runId @param {string} completedAt
 * @param {Record<string,any>} artifacts @param {any} checkpoint
 * @param {unknown} lockOwnership @param {any|null} [compiledResult]
 * @param {any[]} [nonBlockingDiagnostics] */
async function finalizeCaseDocumentRevision(
  runDirectory, runId, completedAt, artifacts, checkpoint, lockOwnership,
  compiledResult = null, nonBlockingDiagnostics = []
) {
  if (checkpoint?.commit_profile !== 'post_case_pending'
    || checkpoint?.clarification_state?.presentation
    || checkpoint?.clarification_state?.remaining_part_ids?.length) {
    return qualityFailure(runId, 'case_design', 'V4_POST_CASE_CHECKPOINT_NOT_READY',
      'post-case 语义问题尚未完全处理，不能发布最终 Case Document。',
      nonBlockingDiagnostics);
  }
  let result = compiledResult;
  try {
    if (!result || result.status !== 'compiled') result = compileCaseDocumentRevisionV4(
      artifacts,
      withClarificationState(
        await completeSystem(runDirectory, artifacts), checkpoint,
        artifacts.source_pack.decision_records
      )
    );
  } catch (error) {
    return qualityFailure(runId, 'case_design',
      error instanceof Error ? error.message : 'V4_SYSTEM_CONTEXT_INVALID',
      '最终提交前无法重算完整 compiler context。', nonBlockingDiagnostics);
  }
  if (result.status === 'need_revision') return revisionReply(
    runDirectory, resultStage(result), artifacts.source_pack.source_revision,
    artifacts[resultStage(result)], result.diagnostics ?? [], runId,
    nonBlockingDiagnostics, result.review_request ?? null
  );
  if (result.status === 'need_artifact') return {
    ...result,
    non_blocking_diagnostics: sortNonBlockingDiagnosticsV4([
      ...(result.non_blocking_diagnostics ?? []), ...structuredClone(nonBlockingDiagnostics)
    ])
  };
  if (result.status !== 'compiled' || !record(result.obligations)) return qualityFailure(
    runId, 'case_design', result.reason_code ?? 'V4_CASE_DOCUMENT_QUALITY_FAILURE',
    result.diagnostics?.[0]?.message ?? '最终 Case Document 质量门禁未闭合。',
    nonBlockingDiagnostics
  );

  try {
    const revision = artifacts.source_pack.source_revision;
    const committed = await committedSemanticCheckpoint(runDirectory, runId, revision);
    const metadata = await committedRevisionMetadata(runDirectory, revision);
    if (committed.value.commit_profile !== 'post_case_pending'
      || canonicalStringify(committed.value) !== canonicalStringify(checkpoint)
      || metadata.commit_profile !== 'post_case_pending') {
      throw new TypeError('V4_POST_CASE_CHECKPOINT_CHANGED');
    }
    const materialized = materializeCaseDocumentDeliveryV4({
      run_id: runId, completed_at: completedAt, bundle: result.bundle,
      ...(isCandidateV4SchemaVersion(artifacts.source_pack.schema_version) ? {
        source_reading: await loadV4SourceReadingSummary(runDirectory, artifacts.source_pack)
      } : {}),
      render_options: { include_audit_appendix: false },
      non_blocking_diagnostics: structuredClone(nonBlockingDiagnostics)
    });
    const finalCheckpoint = structuredClone(checkpoint);
    finalCheckpoint.commit_profile = 'final';
    finalCheckpoint.base_checkpoint_digest = sourceByteDigest(
      new TextEncoder().encode(committed.text)
    );
    await commitRevisionTransactionV4WithHeldLock(
      runDirectory,
      finalTransaction(
        runId, artifacts.source_pack, artifacts.evidence_claims,
        artifacts.behavior_views, result.obligations, artifacts.case_drafts,
        finalCheckpoint, materialized, metadata.semantic_digest
      ),
      lockOwnership
    );
    const verified = await verifyCaseDocumentDeliveryV4(runDirectory);
    if (verified.manifest.run_id !== runId || verified.manifest.revision !== revision) {
      throw new TypeError('CANONICAL_MANIFEST_RUN_MISMATCH');
    }
    return verified.reply;
  } catch (error) {
    return qualityFailure(runId, 'delivery',
      error instanceof Error ? error.message : 'V4_FINAL_TRANSACTION_FAILED',
      '最终 JSON、Markdown、CSV 与 manifest 未能在同一原子事务中提交并重验。',
      nonBlockingDiagnostics);
  }
}

/** @param {string} runDirectory */
export async function detectV4Run(runDirectory) {
  if (await readTextIfPresent(runDirectory, sourceAcquisitionStatePathV4(runDirectory)) !== null) return true;
  const staged = await readTextIfPresent(runDirectory, stagingPath(runDirectory, 'source_pack'));
  if (staged !== null) {
    try { if (isV4SchemaVersion(JSON.parse(staged)?.schema_version)) return true; } catch { /* routed by the active protocol */ }
  }
  const revisions = await acceptedSourceRevisions(runDirectory);
  if (!revisions.length) return false;
  const accepted = await readJson(
    runDirectory, acceptedPath(runDirectory, revisions[revisions.length - 1], 'source_pack')
  );
  return isV4SchemaVersion(accepted.value?.schema_version);
}

/** Read and validate the immutable accepted prefix for the active v4 revision.
 * @param {string} runDirectory @param {number} revision @param {any} registry @param {any} runInstance */
async function acceptedPrefix(runDirectory, revision, registry, runInstance) {
  /** @type {Record<string, any>} */
  const artifacts = {};
  let missing = false;
  for (const stage of STAGES) {
    const stored = await readJsonIfPresent(runDirectory, acceptedPath(runDirectory, revision, stage));
    if (!stored) { missing = true; continue; }
    if (missing) throw new TypeError('V4_ACCEPTED_STAGE_PREFIX_INVALID');
    if (!record(stored.value) || stored.value.schema_version !== runInstance.schema_version
      || stored.value.source_revision !== revision
      || (stage === 'source_pack' && stored.value.run_instance_id !== runInstance.run_id)
      || diagnostics(stored.value, registry.schemas.get(AGENT_STAGE_SCHEMA[stage])).length) {
      throw new TypeError('V4_ACCEPTED_ARTIFACT_INVALID');
    }
    artifacts[stage] = stored.value;
  }
  return artifacts;
}

/** Advance a v4 run while the caller holds the run-directory lock.
 * @param {string} runDirectory
 * @param {any} registry
 * @param {{schema_version:string,compiler_version:string,run_instance_id?:string,run_id?:string,created_at:string,delivery_intent?:string}} runInstance
 * @param {unknown} lockOwnership
 */
async function advanceStrictV4Operation(
  runDirectory, registry, runInstance, lockOwnership
) {
  const runId = runInstance.run_instance_id ?? runInstance.run_id;
  if (typeof runId !== 'string') throw new TypeError('V4_RUN_ID_INVALID');
  try {
    const cancelled = await replayCancelledRunV4WithHeldLock(
      runDirectory, runId, lockOwnership
    );
    if (cancelled) return cancelled;
  } catch (error) {
    return qualityFailure(runId, 'delivery',
      error instanceof Error ? error.message : 'CANCEL_STATE_INVALID',
      '已取消运行的终态或历史交付完整性无法通过重放校验。');
  }
  if (runInstance.delivery_intent === 'execution_plan') {
    return advanceExecutionRunV4Locked(runDirectory, registry, runInstance, lockOwnership);
  }
  if (runInstance.schema_version === latestV4Contract().schema_version) {
    await recoverMaterializedRevisionV4WithHeldLock(runDirectory, lockOwnership);
    await reconcileSourceAcquisitionV4(runDirectory);
  }
  const revisions = await acceptedSourceRevisions(runDirectory);
  if (revisions.some((revision, index) => revision !== index)) {
    return qualityFailure(runId, 'requirements_analysis', 'RUN_INTEGRITY_ERROR',
      'v4 source revisions must be a contiguous sequence beginning at r000.');
  }
  let revision = revisions.at(-1) ?? 0;
  /** @type {Record<string, any>} */
  let artifacts;
  try {
    artifacts = revisions.length
      ? await acceptedPrefix(runDirectory, revision, registry, runInstance) : {};
  } catch (error) {
    return qualityFailure(runId, 'requirements_analysis', 'RUN_INTEGRITY_ERROR',
      error instanceof Error ? error.message : 'Accepted v4 artifacts failed deterministic replay.');
  }

  // Source/scope changes never become same-run repairs, including while the
  // caller is writing cases or recovering a finished delivery. The existing
  // Adapter creates and links the fresh run; this guard only rejects the append.
  if (artifacts.source_pack) {
    const candidate = await stagedArtifact(runDirectory, 'source_pack');
    if (candidate && !candidate.parse_diagnostics.length && record(candidate.value)
      && candidate.value.run_instance_id === runId
      && candidate.value.source_revision === revision + 1
      && !diagnostics(candidate.value, registry.schemas.get(AGENT_STAGE_SCHEMA.source_pack)).length) {
      const changed = sourceChangeDiagnostics(artifacts.source_pack, candidate.value);
      if (changed.length) return revisionReply(
        runDirectory, 'source_pack', revision + 1, candidate.value, changed, runId
      );
    }
  }

  if (runInstance.schema_version === '4.3.3' && !await stagedArtifact(runDirectory, 'source_pack')) {
    const acquisitionStop = await replaySourceAcquisitionStopV4(runDirectory, runId);
    if (acquisitionStop) return acquisitionStop;
  }

  const evidenceRepair = await consumeEvidenceRepair(
    runDirectory, registry, artifacts, revision, runId, lockOwnership
  );
  if (evidenceRepair.kind === 'reply') return evidenceRepair.reply;

  if (evidenceRepair.kind !== 'advanced' && Object.hasOwn(artifacts, 'case_drafts')) {
    try {
      const verified = await verifyCaseDocumentDeliveryV4(runDirectory);
      if (verified.manifest.revision !== revision || verified.manifest.run_id !== runId) {
        throw new TypeError('CANONICAL_MANIFEST_RUN_MISMATCH');
      }
      return verified.reply;
    } catch {
      // A committed artifact prefix is authoritative. Rebuild a missing/torn
      // derived delivery from those same bytes below; never infer Agent input.
    }
  }

  /** @type {any} */
  const append = evidenceRepair.kind === 'advanced' ? evidenceRepair : artifacts.case_drafts
    ? await consumePostCaseAppend(
      runDirectory, registry, artifacts, revision, runId, lockOwnership
    )
    : await consumeSemanticAppend(
      runDirectory, registry, artifacts, revision, runId, lockOwnership
    );
  if (append.kind === 'reply') return append.reply;
  /** @type {any|null} */
  let semanticCheckpoint = null;
  /** @type {any|null} */
  let advancedCompileResult = null;
  /** @type {any[]} */
  let advancedDiagnostics = [];
  if (append.kind === 'advanced') {
    const advanced = /** @type {any} */ (append);
    revision = advanced.revision;
    artifacts = advanced.artifacts;
    semanticCheckpoint = advanced.checkpoint;
    advancedCompileResult = advanced.result ?? null;
    advancedDiagnostics = advanced.non_blocking_diagnostics ?? [];
  } else if (artifacts.source_pack && artifacts.evidence_claims) {
    try {
      semanticCheckpoint = (await committedSemanticCheckpoint(
        runDirectory, runId, revision
      )).value;
    } catch {
      // A pristine no-gap revision from an older interrupted implementation may
      // still be rebuilt below; a committed presentation may never be guessed.
      semanticCheckpoint = null;
    }
  }

  try {
    const replay = await replayPreCasePresentation(
      artifacts, runId, semanticCheckpoint, advancedDiagnostics
    );
    if (replay) return replay;
    if (artifacts.case_drafts && semanticCheckpoint?.clarification_state?.presentation) {
      if (semanticCheckpoint.commit_profile !== 'post_case_pending') {
        throw new TypeError('V4_POST_CASE_CHECKPOINT_REQUIRED');
      }
      assertCheckpointAnswerTargetsV4(semanticCheckpoint, artifacts.evidence_claims);
      return semanticQuestionReply(
        runId, semanticCheckpoint.clarification_state.presentation,
        advancedDiagnostics
      );
    }
  } catch (error) {
    if (error instanceof Error && /^CLARIFICATION_(TARGET|WRITE)_/u.test(error.message)) return revisionReply(
      runDirectory, 'evidence_claims', revision + 1, artifacts.evidence_claims, [clarificationTargetDiagnosticV4(error)], runId);
    return qualityFailure(runId, 'requirements_analysis',
      error instanceof Error ? error.message : 'SEMANTIC_PRESENTATION_INVALID',
      '已接受的 pre-case 澄清状态无法确定性重放。', advancedDiagnostics);
  }

  if (artifacts.case_drafts) {
    if (!semanticCheckpoint) return qualityFailure(
      runId, 'case_design', 'V4_COMMITTED_CHECKPOINT_INVALID',
      '已接受的 Case 工件缺少可恢复的 post-case 检查点。', advancedDiagnostics
    );
    if (semanticCheckpoint.commit_profile === 'final') return qualityFailure(
      runId, 'delivery', 'CANONICAL_DELIVERY_INTEGRITY_ERROR',
      'final revision 已提交，但权威交付无法通过重读校验。', advancedDiagnostics
    );
    return finalizeCaseDocumentRevision(
      runDirectory, runId, runInstance.created_at, artifacts, semanticCheckpoint,
      lockOwnership, advancedCompileResult, advancedDiagnostics
    );
  }

  const nextStage = STAGES[Object.keys(artifacts).length];
  if (!nextStage) return qualityFailure(
    runId, 'case_design', 'RUN_INTEGRITY_ERROR', 'The accepted v4 stage prefix is invalid.',
    advancedDiagnostics
  );
  const candidate = await stagedArtifact(runDirectory, nextStage);
  if (!candidate) {
    if (nextStage === 'source_pack') {
      try {
        const acquisitionStop = await replaySourceAcquisitionStopV4(runDirectory, runId);
        if (acquisitionStop) return acquisitionStop;
      } catch (error) {
        return qualityFailure(runId, 'source_acquisition',
          error instanceof Error ? error.message : 'SOURCE_ACQUISITION_STATE_INVALID',
          '已提交的来源获取恢复状态无法通过完整性校验。');
      }
    }
    return artifactRequest(
      runDirectory, nextStage, revision, runId, advancedDiagnostics
    );
  }
  const candidateDiagnostics = candidate.parse_diagnostics.length
    ? candidate.parse_diagnostics
    : diagnostics(candidate.value, registry.schemas.get(AGENT_STAGE_SCHEMA[nextStage]));
  if (candidateDiagnostics.length) return revisionReply(
    runDirectory, nextStage, revision, candidate.value, candidateDiagnostics, runId,
    advancedDiagnostics
  );
  if (!record(candidate.value)
    || (isV4SchemaVersion(runInstance.schema_version)
      ? candidate.value.schema_version !== runInstance.schema_version
      : !isV4SchemaVersion(candidate.value.schema_version))
    || candidate.value.source_revision !== revision) {
    return revisionReply(runDirectory, nextStage, revision, candidate.value, [{
      category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
      message: 'The v4 artifact must bind the active source revision.'
    }], runId, advancedDiagnostics);
  }
  if (nextStage === 'source_pack' && candidate.value.run_instance_id !== runId) {
    return qualityFailure(runId, 'requirements_analysis', 'RUN_INTEGRITY_ERROR',
      'The staged Source Pack belongs to a different durable run instance.', advancedDiagnostics);
  }
  if (nextStage === 'source_pack') {
    let establishedRunInstance;
    try {
      establishedRunInstance = await ensureV4RunInstanceWithHeldLock(runDirectory, {
        run_id: runId, delivery_intent: candidate.value.delivery_intent
      }, lockOwnership);
    } catch (error) {
      if (error instanceof DiagnosticErrorV4) return { status: 'fatal', diagnostics: error.diagnostics };
      return qualityFailure(runId, 'requirements_analysis', 'RUN_INTEGRITY_ERROR',
        error instanceof Error ? error.message : 'The v4 durable run identity could not be established.');
    }
    // The explicit delivery intent selects the existing execution state machine.
    if (establishedRunInstance.delivery_intent === 'execution_plan') {
      return advanceExecutionRunV4Locked(
        runDirectory, registry, establishedRunInstance, lockOwnership
      );
    }
    try {
      const cancellation = sourceAcquisitionCancellation(candidate.value, runId, revision);
      if (cancellation) {
        await cancelRunV4WithHeldLock(runDirectory, cancellation, lockOwnership);
        return await replayCancelledRunV4WithHeldLock(runDirectory, runId, lockOwnership);
      }
    } catch (error) {
      return revisionReply(runDirectory, 'source_pack', revision, candidate.value, [{
        category: 'traceability',
        code: error instanceof Error ? error.message : 'CANCEL_EVENT_INVALID',
        path: '/clarification_events',
        message: 'Source-acquisition cancellation must be the sole event and bind the displayed run/version.'
      }], runId, advancedDiagnostics);
    }
    /** @type {any} */
    let acquisition;
    try {
      acquisition = await advanceSourceAcquisitionV4(
        runDirectory, candidate.value, runId
      );
    } catch (error) {
      if (error instanceof DiagnosticErrorV4) return { status: 'fatal', diagnostics: error.diagnostics };
      return qualityFailure(runId, 'source_acquisition',
        error instanceof Error ? error.message : 'SOURCE_ACQUISITION_STATE_INVALID',
        '来源获取状态无法通过确定性完整性校验。', advancedDiagnostics);
    }
    if (acquisition.discard_candidate) {
      await discardStagingSnapshot(runDirectory, 'source_pack', candidate);
    }
    if (acquisition.kind === 'need_artifact') return acquisition.reply;
    if (acquisition.kind === 'rejected') return revisionReply(
      runDirectory, 'source_pack', revision, candidate.value, [{
        category: 'source', code: acquisition.code, path: '/artifact_events',
        message: 'Source acquisition event, recovery binding, or verified material is invalid.'
      }], runId, advancedDiagnostics
    );
  }

  const prospective = /** @type {Record<string, any>} */ ({
    ...artifacts, [nextStage]: nextStage === 'evidence_claims'
      ? canonicalArtifactSnapshot(candidate.value) : candidate.value
  });
  if (nextStage === 'evidence_claims') {
    let result;
    try {
      result = compilePreCaseArtifactsV4(
        prospective, await preCaseSystem(
          runDirectory, prospective.source_pack, prospective.evidence_claims
        )
      );
    } catch (error) {
      return revisionReply(runDirectory, nextStage, revision, candidate.value, [{
        category: 'adapter_revision',
        code: error instanceof Error ? error.message : 'V4_PRE_CASE_CONTEXT_INVALID', path: '/',
        message: 'Evidence Claims cannot reproduce the compiler-owned source and scope state.'
      }], runId, advancedDiagnostics);
    }
    if (result.status === 'need_revision') return revisionReply(
      runDirectory, resultStage(result), revision, prospective[resultStage(result)],
      result.diagnostics ?? [], runId, advancedDiagnostics, result.review_request ?? null
    );
    if (result.status === 'need_artifact') return result;
    if (!['pre_case', 'need_user_answers'].includes(result.status)) return qualityFailure(
      runId, 'requirements_analysis',
      result.reason_code ?? 'V4_PRE_CASE_QUALITY_FAILURE',
      result.diagnostics?.[0]?.message ?? 'The pre-case quality gate did not close.',
      advancedDiagnostics
    );
    let clarification;
    try {
      clarification = compilePreCaseClarification(
        prospective.source_pack, prospective.evidence_claims, runId,
        null, null
      );

    } catch (error) {
      if (error instanceof Error && /^CLARIFICATION_(TARGET|WRITE)_/u.test(error.message)) return revisionReply(runDirectory, 'evidence_claims', revision, prospective.evidence_claims, [clarificationTargetDiagnosticV4(error)], runId);

      if (error instanceof DiagnosticErrorV4) return { status: 'fatal', diagnostics: error.diagnostics };
      return qualityFailure(runId, 'requirements_analysis',
        error instanceof Error ? error.message : 'SEMANTIC_PRESENTATION_INVALID',
        '业务语义状态无法形成可提交的 pre-case 检查点。', advancedDiagnostics);
    }
    await commitRevisionTransactionV4WithHeldLock(
      runDirectory,
      preCaseTransaction(
        runId, prospective.source_pack, prospective.evidence_claims, clarification.checkpoint
      ),
      lockOwnership
    );
    // The transaction persisted canonical accepted bytes. Claim and remove
    // only the exact staging snapshot that was compiled.
    await promoteArtifact(runDirectory, revision, nextStage, prospective.evidence_claims, candidate);
    if (clarification.presentation) {
      return semanticQuestionReply(runId, clarification.presentation, advancedDiagnostics);
    }
    return artifactRequest(runDirectory, 'behavior_views', revision, runId, advancedDiagnostics);
  }
  if (nextStage === 'case_drafts') {
    const current = await authoringContext(runDirectory, prospective, semanticCheckpoint, runId);
    if (current.status !== 'authoring') return contextFailure(runDirectory, prospective, revision, runId, current, advancedDiagnostics);
    if (candidate.value.case_context_digest !== current.context.context_digest) return revisionReply(
      runDirectory, 'case_drafts', revision, candidate.value, [{ code: 'CASE_CONTEXT_STALE',
        path: '/case_context_digest', message: 'Candidate basis no longer matches this run. Recheck affected semantics against the current case context before preparing again.' }], runId, advancedDiagnostics
    );
    let system;
    try {
      system = withClarificationState(
        await completeSystem(runDirectory, prospective), semanticCheckpoint,
        prospective.source_pack.decision_records
      );
    } catch (error) {
      return revisionReply(runDirectory, 'evidence_claims', revision, prospective.evidence_claims, [{
        category: 'adapter_revision',
        code: error instanceof Error ? error.message : 'V4_SYSTEM_CONTEXT_INVALID', path: '/',
        message: 'The four v4 artifacts cannot reproduce the private compiler context.'
      }], runId, advancedDiagnostics);
    }
    const result = compileCaseDocumentRevisionV4(prospective, system);
    if (result.status === 'need_revision') return revisionReply(
      runDirectory, resultStage(result), revision, prospective[resultStage(result)],
      result.diagnostics ?? [], runId, advancedDiagnostics, result.review_request ?? null
    );
    if (result.status === 'need_artifact') return result;
    if (!['need_user_answers', 'compiled'].includes(result.status)
      || !record(result.obligations)) return qualityFailure(
      runId, 'case_design', result.reason_code ?? 'V4_CASE_DOCUMENT_QUALITY_FAILURE',
      result.diagnostics?.[0]?.message ?? 'The Case Document quality gate did not close.',
      advancedDiagnostics
    );
    let committed; let metadata; let clarification;
    try {
      committed = await committedSemanticCheckpoint(runDirectory, runId, revision);
      metadata = await committedRevisionMetadata(runDirectory, revision);
      if (committed.value.commit_profile !== 'pre_case_pending'
        || metadata.commit_profile !== 'pre_case_pending') {
        throw new TypeError('V4_PRE_CASE_CHECKPOINT_REQUIRED');
      }
      clarification = compilePostCaseClarification(
        prospective.source_pack, prospective.evidence_claims,
        prospective.behavior_views, prospective.case_drafts, runId,
        committed.value, new TextEncoder().encode(committed.text)
      );
      await commitRevisionTransactionV4WithHeldLock(
        runDirectory,
        postCaseTransaction(
          runId, prospective.source_pack, prospective.evidence_claims,
          prospective.behavior_views, result.obligations, prospective.case_drafts,
          clarification.checkpoint, revision, metadata.semantic_digest
        ),
        lockOwnership
      );
      await discardStagingSnapshot(runDirectory, 'case_drafts', candidate);
    } catch (error) {
      if (error instanceof Error && /^CLARIFICATION_(TARGET|WRITE)_/u.test(error.message)) return revisionReply(runDirectory, 'evidence_claims', revision, artifacts.evidence_claims, [clarificationTargetDiagnosticV4(error)], runId);

      if (error instanceof DiagnosticErrorV4) return { status: 'fatal', diagnostics: error.diagnostics };
      return qualityFailure(runId, 'case_design',
        error instanceof Error ? error.message : 'V4_POST_CASE_TRANSACTION_FAILED',
        'Case 分析结果和 post-case 澄清状态未能完整原子提交。', advancedDiagnostics);
    }
    if (clarification.presentation) return semanticQuestionReply(
      runId, clarification.presentation, result.non_blocking_diagnostics ?? []
    );
    if (result.status !== 'compiled') return qualityFailure(
      runId, 'case_design', 'V4_POST_CASE_PRESENTATION_MISMATCH',
      'post-case 缺口没有形成可展示的已提交问题。', advancedDiagnostics
    );
    return finalizeCaseDocumentRevision(
      runDirectory, runId, runInstance.created_at, prospective,
      clarification.checkpoint, lockOwnership, result,
      result.non_blocking_diagnostics ?? []
    );
  }

  // Before asking for another Agent artifact, recompute every semantic layer
  // that is currently possible. This prevents promotion of a structurally valid
  // artifact whose compiler-owned projection is already known to be invalid.
  if (nextStage === 'behavior_views') {
    const result = await authoringContext(runDirectory, prospective, semanticCheckpoint, runId);
    if (result.status !== 'authoring') return contextFailure(
      runDirectory, prospective, revision, runId, result, advancedDiagnostics
    );
  }

  await promoteArtifact(runDirectory, revision, nextStage, candidate.value, candidate);
  return artifactRequest(
    runDirectory, STAGES[STAGES.indexOf(nextStage) + 1], revision, runId,
    advancedDiagnostics
  );
}

/** Read-only derivation; used both inside the runner lock and by preparation.
 * @param {string} runDirectory @param {any} artifacts @param {any} checkpoint @param {string} runId */
async function authoringContext(runDirectory, artifacts, checkpoint, runId) {
  try {
    const acquisition = await loadSourceAcquisitionCompilerStateV4(runDirectory, artifacts.source_pack, { read_only: true });
    const system = withClarificationState(deriveV4AuthoringSystemContext(
      artifacts.source_pack, artifacts.evidence_claims, acquisition), checkpoint, artifacts.source_pack.decision_records);
    return compileBoundCaseContext(artifacts, system, runId);
  } catch (error) {
    return { status: 'fatal', reason_code: 'CASE_CONTEXT_COMPILATION_FAILED', diagnostics: [{
      code: 'CASE_CONTEXT_COMPILATION_FAILED', path: '/behavior_views',
      message: error instanceof Error ? error.message : 'Authoring context could not be compiled.'
    }] };
  }
}

/** @param {string} directory @param {any} artifacts @param {number} revision @param {string} runId @param {any} result @param {any[]} [extra] */
function contextFailure(directory, artifacts, revision, runId, result, extra = []) {
  if (result.status === 'need_revision') return revisionReply(directory, resultStage(result), revision,
    artifacts[resultStage(result)], result.diagnostics, runId, extra);
  if (result.status === 'need_artifact') return result;
  const details = result.diagnostics?.length ? result.diagnostics.map((/** @type {any} */ item) =>
    `${item.code ?? 'CASE_CONTEXT_COMPILATION_FAILED'} at ${item.path ?? '/behavior_views'}: ${item.message ?? 'Authoring context failed.'}`
  ).join('; ') : `Unexpected authoring status: ${String(result.status)}.`;
  const failure = qualityFailure(runId, 'case_design', result.reason_code ?? 'CASE_CONTEXT_COMPILATION_FAILED',
    `behavior_views: ${details} No candidate was committed.`, extra);
  failure.recovery.description = '当前候选未提交，已接受前缀保持不变。先修复所列编译故障，再从已提交检查点重试；不要重答已接受业务规则。';
  return failure;
}

/** @param {string} directory @param {any} registry @returns {Promise<any>} */
export async function readStagePreparationState(directory, registry) {
  const identity = (await readJson(directory, path.join(directory, 'run-instance.json'))).value;
  identity.run_instance_id ??= identity.run_id;
  const revisions = await acceptedSourceRevisions(directory);
  if (revisions.some((revision, index) => revision !== index)) throw new TypeError('RUN_INTEGRITY_ERROR');
  const revision = revisions.at(-1) ?? 0;
  const artifacts = revisions.length ? await acceptedPrefix(directory, revision, registry, identity) : {};
  const checkpoint = artifacts.evidence_claims
    ? (await committedSemanticCheckpoint(directory, identity.run_instance_id, revision)).value : null;
  const cancelled = await readJsonIfPresent(directory, path.join(directory, 'state', 'cancellation.json'));
  if (artifacts.evidence_claims) await verifyCommittedRevisionReadOnlyV4(directory, revision);
  const context = artifacts.behavior_views
    ? await authoringContext(directory, artifacts, checkpoint, identity.run_instance_id) : null;
  return { identity, revision, artifacts, checkpoint, cancelled, context,
    nextStage: STAGES[Object.keys(artifacts).length] };
}

/** Validate the exact pending repair reply against the runner's current read-only
 * result. A request cannot authorize another revision or a different repair base.
 * @param {string} directory @param {any} registry @param {any} state @param {any} reply
 * @returns {Promise<any|null>} */
export async function readPendingEvidenceRepairPreparation(directory, registry, state, reply) {
  if (state.cancelled || !state.artifacts.source_pack || !state.artifacts.evidence_claims) return null;
  const candidate = await stagedArtifact(directory, 'source_pack');
  if (!candidate) return null;
  const inspected = await inspectEvidenceRepairCandidate(
    directory, registry, state.artifacts, state.revision, state.identity.run_instance_id, candidate, true
  );
  if (inspected.kind !== 'reply' || inspected.reply.stage !== 'evidence_claims'
    || !same(inspected.reply, reply)) return null;
  return { source: candidate.value, revision: state.revision + 1 };
}

/** The caller holds the existing lock throughout computation, promotion and reply binding.
 * @param {string} directory @param {any} registry @param {any} identity @param {any} lock */
export async function advanceStrictV4Locked(directory, registry, identity, lock) {
  const reply = await advanceStrictV4Operation(directory, registry, identity, lock);
  await reconcileSourceAcquisitionV4(directory, reply);
  if (reply.status !== 'need_revision' || reply.stage !== 'case_drafts') return reply;
  const state = await readStagePreparationState(directory, registry);
  if (state.context?.status !== 'authoring') return contextFailure(directory, state.artifacts,
    state.revision, identity.run_instance_id, state.context ?? {status:'fatal'});
  return { ...reply, case_context: state.context.context };
}
