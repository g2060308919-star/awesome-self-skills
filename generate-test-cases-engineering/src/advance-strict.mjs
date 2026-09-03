import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify, digest } from './canonical.mjs';
import { evaluateRevision } from './core.mjs';
import { scopeContains } from './decision-record.mjs';
import { validateEvidenceGraph } from './evidence.mjs';
import {
  compileObligations, ObligationCompilationError
} from './obligations/compile-obligations.mjs';
import {
  acceptedPath, acceptedSourceRevisions, acquireRunLock, atomicWriteJson, clarificationStatePath,
  cleanupTemporaryFiles, discardPostReadyPreviewRequest, discardStagingSnapshot,
  obligationsPath, outputPaths, postReadyPreviewRequestPath,
  ensureRunInstance, prepareRunStore, promoteArtifact, readJson, readJsonIfPresent, readTextIfPresent,
  readCurrentState, recoverStagingClaims,
  runStoreIntrinsicsIntact, stagingPath, STAGE_FILES, writeCheckpoint, writeFinalOutput,
  writeNonReadyCurrent, writeReadyCurrent
} from './run-store.mjs';
import { nextPreviewControl, processPreviewRequest } from './post-ready-preview.mjs';
import { loadSchemaRegistry } from './schema-registry.mjs';
import { AGENT_STAGE_SCHEMA, mapInternalRevision } from './reply-routing.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { resolveSourcePolicy } from './source-policy.mjs';

const moduleDirectory = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
const schemaDirectory = path.resolve(
  moduleDirectory,
  typeof __SCHEMA_DIRECTORY__ === 'string'
    ? __SCHEMA_DIRECTORY__
    : '../skill/generate-test-cases/scripts/schemas'
);
const embeddedManifestDigest = typeof __SCHEMA_MANIFEST_DIGEST__ === 'string'
  ? __SCHEMA_MANIFEST_DIGEST__
  : undefined;
const embeddedSchemaVersion = typeof __SCHEMA_VERSION__ === 'string'
  ? __SCHEMA_VERSION__
  : undefined;
const embeddedCompilerVersion = typeof __COMPILER_VERSION__ === 'string'
  ? __COMPILER_VERSION__
  : undefined;

const STAGE_SCHEMA = AGENT_STAGE_SCHEMA;

const NATIVE_ARRAY = Array;
const NATIVE_MAP = Map;
const NATIVE_MAP_GET = Map.prototype.get;
const NATIVE_MAP_SET = Map.prototype.set;
const NATIVE_MAP_DELETE = Map.prototype.delete;
const NATIVE_PROMISE = Promise;
const NATIVE_REFLECT_APPLY = Reflect.apply;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_PATH_IS_ABSOLUTE = path.isAbsolute;
const NATIVE_PATH_RESOLVE = path.resolve;
/** @type {Map<string,Promise<void>>} */
const ACTIVE_RUNS = new NATIVE_MAP();

class CoreIntrinsicMutationError extends Error {}

/** @template T @param {Promise<T>} promise @returns {Promise<T>} */
async function guardedAwait(promise) {
  try {
    return await promise;
  } finally {
    if (!runStoreIntrinsicsIntact()) throw new CoreIntrinsicMutationError();
  }
}

const loadedRegistry = await (async () => {
  try {
    const registry = await loadSchemaRegistry(
      schemaDirectory, embeddedManifestDigest, embeddedCompilerVersion
    );
    return embeddedSchemaVersion && registry.schemaVersion !== embeddedSchemaVersion
      ? null : registry;
  } catch {
    return null;
  }
})();

/** @param {Map<any,any>} map @param {unknown} key */
function mapGet(map, key) {
  return NATIVE_REFLECT_APPLY(NATIVE_MAP_GET, map, [key]);
}

/** @param {Map<any,any>} map @param {unknown} key @param {unknown} value */
function mapSet(map, key, value) {
  NATIVE_REFLECT_APPLY(NATIVE_MAP_SET, map, [key, value]);
}

/** @param {Map<any,any>} map @param {unknown} key */
function mapDelete(map, key) {
  NATIVE_REFLECT_APPLY(NATIVE_MAP_DELETE, map, [key]);
}

/** @param {unknown} value @returns {value is any[]} */
function arrayIsArray(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_IS_ARRAY, NATIVE_ARRAY, [value]);
}

/** @param {string} value */
function pathIsAbsolute(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_IS_ABSOLUTE, path, [value]);
}

/** @param {string} value */
function pathResolve(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_RESOLVE, path, [value]);
}

/** @param {number} sourceRevision @param {keyof typeof STAGE_SCHEMA} stage @param {string} runInstanceId */
function artifactRequest(sourceRevision, stage, runInstanceId) {
  return {
    status: 'need_artifact', stage, schema_ref: STAGE_SCHEMA[stage],
    scope: { source_revision: sourceRevision, run_instance_id: runInstanceId }, diagnostics: []
  };
}

/** @param {string} code @param {string} message */
function fatalReply(code, message) {
  return {
    status: 'fatal',
    diagnostics: [{ category: 'reference', code, message }]
  };
}

/** @param {string} message */
function newRunRequired(message) {
  return {
    status: 'fatal', diagnostics: [
      { category: 'reference', code: 'RUN_INTEGRITY_ERROR', message },
      {
        category: 'traceability', code: 'NEW_RUN_REQUIRED',
        message: 'Original sources or task scope changed; create a new run.'
      }
    ]
  };
}

function migrationRequired() {
  return {
    status: 'fatal', diagnostics: [
      {
        category: 'reference', code: 'RUN_MIGRATION_REQUIRED',
        message: 'Schema v1 runs cannot resume under the v2 execution-closure protocol.'
      },
      {
        category: 'traceability', code: 'NEW_RUN_REQUIRED',
        message: 'Create a new v2 run; the prior run remains preserved and read-only.'
      }
    ]
  };
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : 'Run directory is unavailable.';
}

/** @param {any[]} diagnostics */
function stableDiagnostics(diagnostics) {
  const seen = new Set();
  const output = [];
  for (let index = 0; index < diagnostics.length; index += 1) {
    const item = diagnostics[index];
    const normalized = {
      category: String(item.category ?? 'schema'),
      code: String(item.code ?? 'ARTIFACT_INVALID'),
      ...(typeof item.path === 'string' ? { path: item.path } : {}),
      message: String(item.message ?? 'artifact failed deterministic validation')
    };
    const key = canonicalStringify(normalized);
    if (!seen.has(key)) { seen.add(key); output.push(normalized); }
  }
  output.sort((left, right) => canonicalStringify(left) < canonicalStringify(right) ? -1
    : canonicalStringify(left) > canonicalStringify(right) ? 1 : 0);
  return output;
}

/** @param {string} runDirectory @param {keyof typeof STAGE_SCHEMA} stage @param {number} sourceRevision @param {unknown} artifact @param {any[]} diagnostics */
function revisionReply(runDirectory, stage, sourceRevision, artifact, diagnostics) {
  return {
    status: 'need_revision', stage, schema_ref: STAGE_SCHEMA[stage], source_revision: sourceRevision,
    artifact_path: stagingPath(runDirectory, stage), artifact_digest: digest(artifact),
    diagnostics: stableDiagnostics(diagnostics)
  };
}

/** @param {unknown} artifact @param {any} schema */
function artifactDiagnostics(artifact, schema) {
  return stableDiagnostics([
    ...validateAgainstSchema(artifact, schema),
    ...validateUniqueStableIds(artifact)
  ]);
}

/** @param {string} runDirectory @param {keyof typeof STAGE_SCHEMA} stage @param {number} sourceRevision */
async function stagedArtifact(runDirectory, stage, sourceRevision) {
  const candidatePath = stagingPath(runDirectory, stage);
  const text = await guardedAwait(readTextIfPresent(runDirectory, candidatePath));
  if (text === null) return null;
  try {
    const value = JSON.parse(text);
    return { text, value, digest: digest(value), parseDiagnostics: [] };
  } catch {
    return {
      text, value: text, digest: digest(text),
      parseDiagnostics: [{
        category: 'schema', code: 'ARTIFACT_JSON_INVALID', path: '/',
        message: `${stage} staging artifact is not valid JSON for source revision ${sourceRevision}`
      }]
    };
  }
}

/** @param {Record<string, unknown>} sourcePack */
function maximumEventSequence(sourcePack) {
  let maximum = 0;
  for (const field of ['decision_records', 'clarification_events', 'execution_events']) {
    const values = arrayIsArray(sourcePack[field]) ? sourcePack[field] : [];
    for (let index = 0; index < values.length; index += 1) {
      const sequence = values[index]?.clarification_event_seq;
      if (Number.isSafeInteger(sequence) && sequence > maximum) maximum = sequence;
    }
  }
  return maximum;
}

/** @param {unknown[]} prior @param {unknown[]} next */
function isExactPrefix(prior, next) {
  if (next.length < prior.length) return false;
  for (let index = 0; index < prior.length; index += 1) {
    if (canonicalStringify(prior[index]) !== canonicalStringify(next[index])) return false;
  }
  return true;
}

/** @param {Record<string, unknown>} sourcePack */
function historySequenceIntegrity(sourcePack) {
  const sequences = [];
  for (const [field, identityField] of [
    ['decision_records', 'decision_id'], ['clarification_events', 'event_id'],
    ['execution_events', 'event_id']
  ]) {
    const values = arrayIsArray(sourcePack[field]) ? sourcePack[field] : [];
    const identities = new Set();
    let previous = 0;
    for (let index = 0; index < values.length; index += 1) {
      const sequence = values[index]?.clarification_event_seq;
      if (!Number.isSafeInteger(sequence) || sequence <= previous) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Decision and control histories must preserve increasing event order.'
      );
      previous = sequence;
      sequences.push(sequence);
      const identity = values[index]?.[identityField];
      if (typeof identity === 'string' && identities.has(identity)) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Decision and control histories cannot reuse event identities.'
      );
      if (typeof identity === 'string') identities.add(identity);
    }
  }
  sequences.sort((left, right) => left - right);
  for (let index = 0; index < sequences.length; index += 1) {
    if (sequences[index] !== index + 1) return fatalReply(
      'RUN_INTEGRITY_ERROR',
      'Combined Decision and control history must start at one without gaps or reused sequences.'
    );
  }
  return null;
}

/** @param {Record<string, unknown>} sourcePack */
function initialClarificationHistoryDiagnostics(sourcePack) {
  const diagnostics = [];
  const events = arrayIsArray(sourcePack.clarification_events)
    ? sourcePack.clarification_events : [];
  if (events.length > 0) diagnostics.push({
      category: 'classification', code: 'INITIAL_CLARIFICATION_HISTORY_UNSUPPORTED',
      path: '/clarification_events',
      message: 'An initial run has no prior clarification lifecycle on which to apply control events.'
    });
  const decisions = arrayIsArray(sourcePack.decision_records)
    ? sourcePack.decision_records : [];
  for (let index = 0; index < decisions.length; index += 1) {
    if (decisions[index]?.disposition === 'unknown'
      || decisions[index]?.disposition === 'deferred') diagnostics.push({
        category: 'classification', code: 'INITIAL_DECISION_DISPOSITION_UNSUPPORTED',
        path: `/decision_records/${index}/disposition`,
        message: 'Initial unknown or deferred Decisions require a prior clarification lifecycle.'
      });
  }
  return diagnostics;
}

/** @param {Record<string, unknown>} prior @param {Record<string, unknown>} next */
function sourceRevisionIntegrity(prior, next) {
  const immutablePrior = {
    run_scope: prior.run_scope, sources: prior.sources,
    locators: prior.locators, source_policy: prior.source_policy
  };
  const immutableNext = {
    run_scope: next.run_scope, sources: next.sources,
    locators: next.locators, source_policy: next.source_policy
  };
  if (canonicalStringify(immutablePrior) !== canonicalStringify(immutableNext)) {
    return newRunRequired('RUN_INTEGRITY_ERROR: immutable original source set or run scope changed.');
  }
  const priorDecisions = arrayIsArray(prior.decision_records) ? prior.decision_records : [];
  const nextDecisions = arrayIsArray(next.decision_records) ? next.decision_records : [];
  const priorEvents = arrayIsArray(prior.clarification_events) ? prior.clarification_events : [];
  const nextEvents = arrayIsArray(next.clarification_events) ? next.clarification_events : [];
  const priorExecution = arrayIsArray(prior.execution_events) ? prior.execution_events : [];
  const nextExecution = arrayIsArray(next.execution_events) ? next.execution_events : [];
  if (!isExactPrefix(priorDecisions, nextDecisions) || !isExactPrefix(priorEvents, nextEvents)
    || !isExactPrefix(priorExecution, nextExecution)) {
    return fatalReply('RUN_INTEGRITY_ERROR', 'Decision and clarification histories are append-only and order-preserving.');
  }
  const historyIntegrity = historySequenceIntegrity(next);
  if (historyIntegrity) return historyIntegrity;
  const added = [
    ...nextDecisions.slice(priorDecisions.length), ...nextEvents.slice(priorEvents.length),
    ...nextExecution.slice(priorExecution.length)
  ];
  if (added.length === 0) return fatalReply(
    'RUN_INTEGRITY_ERROR', 'A higher source revision must contain one nonempty append batch.'
  );
  const priorMaximum = maximumEventSequence(prior);
  const sequences = added.map((item) => item?.clarification_event_seq);
  const unique = new Set(sequences);
  if (unique.size !== sequences.length || sequences.some((item) => (
    !Number.isSafeInteger(item) || item <= priorMaximum
  ))) return fatalReply(
    'RUN_INTEGRITY_ERROR', 'Appended clarification_event_seq values must be unique and greater than prior history.'
  );
  const ordered = [...sequences].sort((left, right) => left - right);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index] !== ordered[index - 1] + 1) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Appended clarification_event_seq values must form one monotonic batch.'
    );
  }
  return null;
}

/** @param {Record<string, unknown>} evidenceClaims @param {Map<string,Record<string,unknown>>} claimsById */
function adapterEvidenceDiagnostics(evidenceClaims, claimsById) {
  /** @type {Map<string,Array<{entry:Record<string,unknown>,valid:boolean}>>} */
  const ownersByClaimId = new Map();
  /** @param {string} claimId @param {Record<string,unknown>} entry @param {boolean} valid */
  function addOwner(claimId, entry, valid) {
    const owners = ownersByClaimId.get(claimId) ?? [];
    owners.push({ entry, valid });
    ownersByClaimId.set(claimId, owners);
  }
  for (const value of arrayIsArray(evidenceClaims.fact_ledger) ? evidenceClaims.fact_ledger : []) {
    if (!value || typeof value !== 'object') continue;
    const entry = /** @type {Record<string,unknown>} */ (value);
    if (typeof entry.claim_id !== 'string') continue;
    const primaryClaim = claimsById.get(entry.claim_id);
    const primaryNormative = primaryClaim?.kind === 'requirement'
      || primaryClaim?.kind === 'assumption';
    if (!primaryNormative) continue;
    const sourceClaimIds = arrayIsArray(entry.source_claim_ids) ? entry.source_claim_ids : [];
    let primaryInSources = false;
    let aggregateEvidenceAccepted = true;
    let aggregateEvidenceHigher = true;
    let aggregateScopesContainPrimary = true;
    for (let index = 0; index < sourceClaimIds.length; index += 1) {
      const sourceClaimId = sourceClaimIds[index];
      if (sourceClaimId === entry.claim_id) primaryInSources = true;
      const sourceClaim = typeof sourceClaimId === 'string' ? claimsById.get(sourceClaimId) : undefined;
      if (!sourceClaim) aggregateEvidenceAccepted = false;
      else {
        if (sourceClaim.level !== 'E3' && sourceClaim.level !== 'E2') aggregateEvidenceHigher = false;
        if (typeof primaryClaim?.scope !== 'string' || typeof sourceClaim.scope !== 'string'
          || !scopeContains(sourceClaim.scope, primaryClaim.scope)) aggregateScopesContainPrimary = false;
      }
    }
    const groupedStatus = entry.status === 'conflicted' || entry.status === 'ambiguous';
    const higherConflictEvidence = entry.status !== 'conflicted'
      || (primaryClaim?.level === 'E3' || primaryClaim?.level === 'E2')
      && aggregateEvidenceHigher;
    const validAggregate = entry.status === 'conflicted'
      ? sourceClaimIds.length >= 2 && primaryInSources
        && aggregateEvidenceAccepted && aggregateScopesContainPrimary && higherConflictEvidence
      : entry.status === 'ambiguous'
        ? primaryInSources && aggregateEvidenceAccepted && aggregateScopesContainPrimary
        : true;
    addOwner(entry.claim_id, entry, primaryInSources && validAggregate);
    if (!groupedStatus || !validAggregate) continue;
    for (let index = 0; index < sourceClaimIds.length; index += 1) {
      const sourceClaimId = sourceClaimIds[index];
      if (typeof sourceClaimId !== 'string' || sourceClaimId === entry.claim_id) continue;
      const sourceClaim = claimsById.get(sourceClaimId);
      if (sourceClaim?.kind === 'requirement' || sourceClaim?.kind === 'assumption') {
        addOwner(sourceClaimId, entry, true);
      }
    }
  }
  return [...claimsById.entries()]
    .filter(([, claim]) => (claim.kind === 'requirement' || claim.kind === 'assumption'))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .flatMap(([claimId]) => {
      const indexedOwners = ownersByClaimId.get(claimId) ?? [];
      /** @type {Array<{entry:Record<string,unknown>,valid:boolean}>} */
      const owners = [];
      let diagnosticOwner = false;
      for (const owner of indexedOwners) {
        if (owner.entry.status === 'diagnostic') diagnosticOwner = true;
        else owners.push(owner);
      }
      if (owners.length === 0 && !diagnosticOwner) return [{
        category: 'traceability', code: 'NORMATIVE_CLAIM_UNLEDGERED',
        path: `/claims/${encodeURIComponent(claimId)}`,
        message: `accepted normative claim "${claimId}" requires its own Fact Ledger entry`
      }];
      if (owners.length !== 1 || diagnosticOwner || !owners[0].valid) return [{
        category: 'traceability', code: 'NORMATIVE_CLAIM_LEDGER_INVALID',
        path: `/claims/${encodeURIComponent(claimId)}`,
        message: `accepted normative claim "${claimId}" requires exactly one non-diagnostic Fact Ledger owner, either primary or a conflicted/ambiguous alternative`
      }];
      return [];
    });
}

/** @param {Record<string, unknown>} sourcePack @param {Record<string, unknown>} evidenceClaims @param {Record<string, unknown>} behaviorViews @param {number} sourceRevision */
function deriveObligations(sourcePack, evidenceClaims, behaviorViews, sourceRevision) {
  const policy = resolveSourcePolicy(sourcePack);
  if (policy.diagnostics.length > 0) return { diagnostics: policy.diagnostics, artifact: null };
  const evidence = validateEvidenceGraph(sourcePack, evidenceClaims);
  if (evidence.diagnostics.length > 0) return { diagnostics: evidence.diagnostics, artifact: null };
  const evidenceDiagnostics = adapterEvidenceDiagnostics(evidenceClaims, evidence.claimsById);
  if (evidenceDiagnostics.length > 0) return { diagnostics: evidenceDiagnostics, artifact: null };
  const graph = {
    claimsById: evidence.claimsById,
    factLedger: structuredClone(arrayIsArray(evidenceClaims.fact_ledger) ? evidenceClaims.fact_ledger : []),
    conflicts: structuredClone(arrayIsArray(policy.conflicts) ? policy.conflicts : []),
    runScope: String(sourcePack.run_scope)
  };
  try { return { diagnostics: [], artifact: compileObligations(graph, behaviorViews) }; } catch (error) {
    if (error instanceof ObligationCompilationError) return {
      diagnostics: error.diagnostics, artifact: null
    };
    throw error;
  }
}

/** @param {number} sourceRevision @param {number} eventSequence */
function initialClarificationState(sourceRevision, eventSequence) {
  return {
    source_revision: sourceRevision,
    clarification_event_seq: eventSequence,
    asked_root_issue_ids: [], root_issue_dispositions: [],
    last_pending_root_issue_ids: [], last_question_set_digest: '',
    clarification_stop: null, semantic_snapshot: null, root_snapshot_ledger: []
  };
}

/** @param {Record<string, unknown>} previous @param {Record<string, unknown>} current */
function appendBatch(previous, current) {
  const previousDecisions = arrayIsArray(previous.decision_records) ? previous.decision_records : [];
  const previousEvents = arrayIsArray(previous.clarification_events) ? previous.clarification_events : [];
  const decisions = arrayIsArray(current.decision_records) ? current.decision_records : [];
  const events = arrayIsArray(current.clarification_events) ? current.clarification_events : [];
  return {
    decision_records: structuredClone(decisions.slice(previousDecisions.length)),
    clarification_events: structuredClone(events.slice(previousEvents.length))
  };
}

/** Preserve clarification semantics when a revision contains only execution events.
 * @param {any} previousState @param {any} previousSource @param {any} sourcePack
 */
function clarificationAppendInput(previousState, previousSource, sourcePack) {
  const append = appendBatch(previousSource, sourcePack);
  const priorState = structuredClone(previousState);
  if (append.decision_records.length === 0 && append.clarification_events.length === 0) {
    priorState.source_revision = sourcePack.source_revision;
    priorState.clarification_event_seq = maximumEventSequence(sourcePack);
    if (priorState.clarification_stop) {
      priorState.clarification_stop.source_revision = sourcePack.source_revision;
    }
  }
  return { prior_state: priorState, append_batch: append };
}

/** @param {number} sourceRevision @param {string} stage @param {Record<string, unknown>} sourcePack @param {Record<string, unknown>|null} state @param {Record<string,string>} acceptedDigests @param {string} runInstanceId @param {Record<string,unknown>|null} [workflowState] @param {Record<string,unknown>|null} [priorCheckpoint] */
function checkpoint(sourceRevision, stage, sourcePack, state, acceptedDigests, runInstanceId, workflowState = null, priorCheckpoint = null) {
  const presentation = workflowState?.presentation_snapshot ?? null;
  const plan = workflowState?.execution_plan ?? null;
  return {
    input_digest: digest({ source_revision: sourceRevision, accepted_artifact_digests: acceptedDigests }),
    source_revision: sourceRevision, stage,
    compiler_version: embeddedCompilerVersion ?? '0.2.0',
    schema_version: embeddedSchemaVersion ?? '2.0.0',
    run_instance_id: runInstanceId,
    accepted_artifact_digests: acceptedDigests,
    audit_lineage: structuredClone(acceptedDigests),
    clarification_event_seq: state && Number.isSafeInteger(state.clarification_event_seq)
      ? state.clarification_event_seq : maximumEventSequence(sourcePack),
    asked_root_issue_ids: state && arrayIsArray(state.asked_root_issue_ids)
      ? state.asked_root_issue_ids : [],
    root_issue_dispositions: state && arrayIsArray(state.root_issue_dispositions)
      ? state.root_issue_dispositions.map((item) => ({
        root_issue_id: item.root_issue_id, status: item.status
      })) : [],
    last_question_set_digest: state && typeof state.last_question_set_digest === 'string'
      ? state.last_question_set_digest : '',
    clarification_stop: state?.clarification_stop ?? null,
    workflow_event_head_seq: Number(workflowState?.workflow_event_head_seq ?? maximumEventSequence(sourcePack)),
    workflow_event_log_digest: typeof workflowState?.workflow_event_log_digest === 'string'
      ? workflowState.workflow_event_log_digest : digest([]),
    execution_plan_snapshot: plan ? structuredClone(plan) : null,
    presentation_snapshot: presentation ? structuredClone(presentation) : null,
    presentation_snapshot_digest: presentation ? digest(presentation) : null,
    confirmation: workflowState?.confirmation ? structuredClone(workflowState.confirmation) : null,
    preview_epoch: Number(priorCheckpoint?.preview_epoch ?? 0),
    preview_state: priorCheckpoint?.preview_state ?? 'idle',
    active_preview_presentation: priorCheckpoint?.active_preview_presentation ?? null,
    last_preview_request: priorCheckpoint?.last_preview_request ?? null,
    internal_result_kind: null
  };
}

/** @param {any} result @param {Record<string,unknown>} checkpointValue @param {Record<string,unknown>} current @param {string} markdownPath @param {string|null} [noticeCode] */
function finishedReply(result, checkpointValue, current, markdownPath, noticeCode = null) {
  const summary = result.bundle.execution_plan.summary;
  return {
    ...current, status: 'finished', markdown_path: markdownPath,
    semantic_result_digest: result.bundle.execution_plan.semantic_result_digest,
    execute_case_count: summary.execute_case_count,
    do_not_execute_case_count: summary.do_not_execute_case_count,
    do_not_execute_formal_test_point_count: summary.do_not_execute_formal_test_point_count,
    do_not_execute_exploratory_count: summary.do_not_execute_exploratory_count,
    applicable_test_point_coverage: {
      full: summary.full_test_point_count,
      partial: summary.partial_test_point_count,
      none: summary.none_test_point_count
    },
    modification_hint: 'This Skill does not start E2E execution. You may later supplement rules, reopen issues, request reanalysis, or change this run disposition.',
    preview_control: nextPreviewControl({
      run_instance_id: checkpointValue.run_instance_id,
      source_revision: result.source_revision,
      bundle_digest: result.bundle_digest,
      plan_digest: result.bundle.execution_plan.plan_digest,
      confirmation_semantic_digest: result.bundle.execution_plan.confirmation.confirmation_semantic_digest
    }, checkpointValue, String(checkpointValue.compiler_version)),
    ...(noticeCode ? { notice_code: noticeCode } : {})
  };
}

/** @param {string} runDirectory @param {number} sourceRevision */
async function acceptedDigests(runDirectory, sourceRevision) {
  /** @type {Record<string,string>} */
  const values = {};
  for (const stage of Object.keys(STAGE_FILES)) {
    const accepted = await guardedAwait(readJsonIfPresent(runDirectory, acceptedPath(
      runDirectory, sourceRevision, /** @type {keyof typeof STAGE_FILES} */ (stage)
    )));
    if (accepted) values[stage] = accepted.digest;
  }
  const obligations = await guardedAwait(readJsonIfPresent(
    runDirectory, obligationsPath(runDirectory, sourceRevision)
  ));
  if (obligations) values.test_obligations = obligations.digest;
  return values;
}

/** @param {Record<string, Record<string, unknown>>} artifacts @param {Record<string, unknown>} clarification @param {any} registry */
function evaluateAdapterRevision(artifacts, clarification, registry, workflowState = null) {
  const sourcePack = artifacts.source_pack;
  const caseDrafts = artifacts.case_drafts;
  return /** @type {any} */ (evaluateRevision(artifacts, {
    systemLineage: {
      compiler_version: registry.compilerVersion,
      lineage: {
        source_digest: digest(sourcePack), case_draft_digest: digest(caseDrafts)
      },
      expert_recall_limits: ['Expert recall is benchmark-only.']
    },
    clarificationState: clarification,
    workflowState,
    interactionPolicy: 'pause_for_clarification',
    limits: ['Compilation is limited to the accepted immutable revision.']
  }));
}

/**
 * Validate a clarification/source revision against the prior accepted semantic
 * state before the candidate can become immutable. Missing derived state is
 * rebuilt from accepted artifacts; incomplete prior revisions cannot authorize
 * a clarification append.
 * @param {number} sourceRevision
 * @param {Record<string, unknown>} sourcePack
 * @param {any} registry
 * @param {any} prior
 */
function validateSourceRevisionAppend(sourceRevision, sourcePack, registry, prior) {
  if (sourceRevision === 0) return null;
  if (!prior) return fatalReply(
    'RUN_INTEGRITY_ERROR', 'The prior accepted source revision is unavailable.'
  );
  const appended = appendBatch(prior.source_pack, sourcePack);
  if (prior.workflow_state?.presentation_snapshot?.entry_context === 'post_ready_change') {
    const previousExecutionEvents = arrayIsArray(prior.source_pack.execution_events)
      ? prior.source_pack.execution_events : [];
    const currentExecutionEvents = arrayIsArray(sourcePack.execution_events)
      ? sourcePack.execution_events : [];
    const appendedExecutionMutations = currentExecutionEvents.slice(previousExecutionEvents.length)
      .filter((event) => event?.type === 'set_dispositions');
    const appliedRecordCount = appended.decision_records.length
      + appended.clarification_events.length
      + appendedExecutionMutations.length;
    if (appliedRecordCount === 0) return { kind: 'need_revision', diagnostics: [{
      category: 'classification', code: 'POST_READY_PREVIEW_APPLICATION_REQUIRED',
      path: '/source_revision',
      message: 'A higher revision created from an active preview must append the bound proposed change.'
    }] };
  }
  if (!prior.complete) {
    const diagnostics = [];
    if (appended.decision_records.length > 0) diagnostics.push({
      category: 'classification', code: 'PRIOR_REVISION_INCOMPLETE',
      path: '/decision_records',
      message: 'A Decision append requires a complete prior clarification lifecycle.'
    });
    if (appended.clarification_events.length > 0) diagnostics.push({
      category: 'classification', code: 'PRIOR_REVISION_INCOMPLETE',
      path: '/clarification_events',
      message: 'A clarification event append requires a complete prior clarification lifecycle.'
    });
    if (diagnostics.length === 0) diagnostics.push({
      category: 'classification', code: 'PRIOR_REVISION_INCOMPLETE',
      path: '/source_revision',
      message: 'A higher source revision requires a complete prior accepted revision.'
    });
    return { kind: 'need_revision', diagnostics };
  }
  /** @type {Record<string, Record<string, unknown>>} */
  const priorArtifacts = {};
  for (const stage of ['evidence_claims', 'behavior_views', 'case_drafts']) priorArtifacts[stage] = {
    .../** @type {Record<string, unknown>} */ (prior.artifacts[stage]),
    source_revision: sourceRevision
  };
  const clarification = clarificationAppendInput(
    prior.state, prior.source_pack, sourcePack
  );
  const caseDrafts = priorArtifacts.case_drafts;
  const result = evaluateAdapterRevision({
    source_pack: sourcePack,
    evidence_claims: priorArtifacts.evidence_claims,
    behavior_views: priorArtifacts.behavior_views,
    case_drafts: caseDrafts
  }, clarification, registry, prior.workflow_state ?? null);
  if (result.status === 'finished' || result.status === 'need_user_answers') return null;
  if (result.status !== 'need_revision') return fatalReply(
    'RUNNER_PROTOCOL_VIOLATION',
    'Pure revision evaluation returned an unrecognized clarification result.'
  );
  // At this boundary the only changed input is the candidate Source Pack append;
  // all reused downstream artifacts were already accepted and replay-verified.
  return { kind: 'need_revision', diagnostics: result.diagnostics };
}

/**
 * Rebuild accepted state from r000 through the highest revision. No checkpoint,
 * derived artifact, output pointer, or later valid-looking directory can hide a
 * broken historical hop.
 * @param {string} runDirectory
 * @param {number[]} revisions
 * @param {any} registry
 * @param {any} runInstance
 */
async function acceptedRunIntegrity(runDirectory, revisions, registry, runInstance) {
  if (revisions.length === 0) return { kind: 'accepted_context', active: null };
  for (let index = 0; index < revisions.length; index += 1) {
    if (revisions[index] !== index) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Accepted source revisions must start at r000 and remain consecutive.'
    );
  }
  let previousSource = null;
  let previousState = null;
  let previousComplete = true;
  /** @type {any} */
  let active = null;
  for (let revisionIndex = 0; revisionIndex < revisions.length; revisionIndex += 1) {
    const sourceRevision = revisions[revisionIndex];
    if (sourceRevision > 0 && !previousComplete) return fatalReply(
      'RUN_INTEGRITY_ERROR',
      'A higher accepted source revision cannot follow an incomplete prior revision.'
    );
    const sourceArtifact = await guardedAwait(readJson(
      runDirectory, acceptedPath(runDirectory, sourceRevision, 'source_pack')
    ));
    const sourcePack = /** @type {Record<string, unknown>} */ (sourceArtifact.value);
    if (sourcePack.schema_version !== '2.0.0') return migrationRequired();
    if (sourcePack.run_instance_id !== runInstance.run_instance_id) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Accepted Source Pack belongs to a different run instance.'
    );
    if (sourcePack.source_revision !== sourceRevision) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Accepted Source Pack revision does not match its revision directory.'
    );
    const transition = previousSource
      ? sourceRevisionIntegrity(previousSource, sourcePack)
      : historySequenceIntegrity(sourcePack);
    if (transition) return transition;
    const sourceDiagnostics = artifactDiagnostics(
      sourcePack, registry.schemas.get(STAGE_SCHEMA.source_pack)
    );
    if (sourceDiagnostics.length > 0) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Accepted Source Pack failed deterministic schema validation.'
    );
    if (sourceRevision === 0 && initialClarificationHistoryDiagnostics(sourcePack).length > 0) {
      return fatalReply(
        'RUN_INTEGRITY_ERROR',
        'Accepted initial clarification controls have no prior lifecycle and cannot be replayed.'
      );
    }
    if (resolveSourcePolicy(sourcePack).diagnostics.length > 0) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Accepted Source Pack failed deterministic policy validation.'
    );

    /** @type {Record<string, unknown>|null} */
    let evidenceClaims = null;
    /** @type {Record<string, unknown>|null} */
    let behaviorViews = null;
    /** @type {Record<string, unknown>|null} */
    let caseDrafts = null;
    let missingEarlierStage = false;
    for (const stage of ['evidence_claims', 'behavior_views', 'case_drafts']) {
      const typedStage = /** @type {'evidence_claims'|'behavior_views'|'case_drafts'} */ (stage);
      const artifact = await guardedAwait(readJsonIfPresent(
        runDirectory, acceptedPath(runDirectory, sourceRevision, typedStage)
      ));
      if (!artifact) { missingEarlierStage = true; continue; }
      if (missingEarlierStage) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Accepted artifacts must preserve the fixed stage prefix.'
      );
      const record = /** @type {Record<string, unknown>} */ (artifact.value);
      if (record.source_revision !== sourceRevision) return fatalReply(
        'RUN_INTEGRITY_ERROR', `Accepted ${typedStage} revision does not match its directory.`
      );
      if (artifactDiagnostics(record, registry.schemas.get(STAGE_SCHEMA[typedStage])).length > 0) {
        return fatalReply(
          'RUN_INTEGRITY_ERROR', `Accepted ${typedStage} failed deterministic schema validation.`
        );
      }
      if (typedStage === 'evidence_claims') {
        evidenceClaims = record;
        const acceptedEvidence = validateEvidenceGraph(sourcePack, evidenceClaims);
        if (acceptedEvidence.diagnostics.length > 0
          || adapterEvidenceDiagnostics(evidenceClaims, acceptedEvidence.claimsById).length > 0) return fatalReply(
          'RUN_INTEGRITY_ERROR', 'Accepted evidence_claims failed deterministic semantic validation.'
        );
      } else if (typedStage === 'behavior_views') {
        behaviorViews = record;
        const derived = deriveObligations(
          sourcePack, /** @type {Record<string, unknown>} */ (evidenceClaims), behaviorViews,
          sourceRevision
        );
        if (derived.diagnostics.length > 0 || !derived.artifact) return fatalReply(
          'RUN_INTEGRITY_ERROR', 'Accepted behavior_views failed deterministic semantic validation.'
        );
      } else caseDrafts = record;
    }
    const clarificationInput = sourceRevision === 0 ? {
      prior_state: initialClarificationState(0, maximumEventSequence(sourcePack)),
      append_batch: { decision_records: [], clarification_events: [] }
    } : clarificationAppendInput(
      previousState, /** @type {Record<string, unknown>} */ (previousSource), sourcePack
    );
    if (caseDrafts) {
      /** @type {Record<string, Record<string, unknown>>} */
      const artifacts = {
        source_pack: sourcePack,
        evidence_claims: /** @type {Record<string, unknown>} */ (evidenceClaims),
        behavior_views: /** @type {Record<string, unknown>} */ (behaviorViews),
        case_drafts: caseDrafts
      };
      const replay = evaluateAdapterRevision(
        artifacts, clarificationInput, registry, active?.workflow_state ?? null
      );
      if ((replay.status !== 'finished' && replay.status !== 'need_user_answers')
        || !replay.clarification_state
        || typeof replay.clarification_state !== 'object') return fatalReply(
        'RUN_INTEGRITY_ERROR',
        'Accepted complete revision failed deterministic semantic replay.'
      );
      const state = /** @type {Record<string, unknown>} */ (replay.clarification_state);
      const statePath = clarificationStatePath(runDirectory, sourceRevision);
      const storedState = await guardedAwait(readJsonIfPresent(runDirectory, statePath));
      if (storedState
        && canonicalStringify(storedState.value) !== canonicalStringify(state)) return fatalReply(
        'RUN_INTEGRITY_ERROR',
        'Stored clarification state does not match deterministic accepted-artifact replay.'
      );
      if (!storedState) await guardedAwait(atomicWriteJson(runDirectory, statePath, state));
      previousState = state;
      previousComplete = true;
      active = {
        complete: true, source_pack: sourcePack, artifacts, state,
        clarification_input: clarificationInput, result: replay,
        workflow_state: replay.workflow_state ?? active?.workflow_state ?? null
      };
    } else {
      previousState = null;
      previousComplete = false;
      active = {
        complete: false, source_pack: sourcePack,
        clarification_input: clarificationInput,
        workflow_state: active?.workflow_state ?? null
      };
    }
    previousSource = sourcePack;
  }
  return { kind: 'accepted_context', active };
}

/**
 * Advance one strict test-case-generation run.
 * @param {string} runDirectory
 */
async function advanceStrictExclusive(runDirectory) {
  if (!runStoreIntrinsicsIntact()) return fatalReply(
    'CORE_INTRINSIC_INVALID',
    'Run-store evaluation requires captured native collection traversal intrinsics.'
  );
  const registry = loadedRegistry;
  if (!registry) {
    return fatalReply(
      'SCHEMA_INTEGRITY_MISMATCH',
      'Bundled schemas or schema manifest failed integrity verification.'
    );
  }
  try {
    if (typeof runDirectory !== 'string' || !pathIsAbsolute(runDirectory)) return fatalReply(
      'run_directory_absolute', 'Run directory must be an absolute path.'
    );
    runDirectory = await guardedAwait(prepareRunStore(runDirectory));
    const releaseRunLock = await acquireRunLock(runDirectory);
    const baseGuardedAwait = guardedAwait;
    {
    /** @template T @param {()=>Promise<T>} operation @returns {Promise<T>} */
    const guardedAwait = async (operation) => {
      return releaseRunLock.guardedAwait(() => baseGuardedAwait(operation()));
    };
    try {
      if (!runStoreIntrinsicsIntact()) throw new CoreIntrinsicMutationError();
      runDirectory = await guardedAwait(() => prepareRunStore(runDirectory));
      const runInstance = await guardedAwait(() => ensureRunInstance(runDirectory));
      await guardedAwait(() => recoverStagingClaims(runDirectory));
      await guardedAwait(() => cleanupTemporaryFiles(runDirectory));
      let revisions = await guardedAwait(() => acceptedSourceRevisions(runDirectory));
    const acceptedAudit = await guardedAwait(() =>
      acceptedRunIntegrity(runDirectory, revisions, registry, runInstance)
    );
    if ('status' in acceptedAudit) return acceptedAudit;
    const acceptedContext = /** @type {any} */ (acceptedAudit);
    let recoveryCheckpointArtifact = null;
    try {
      recoveryCheckpointArtifact = await guardedAwait(() => readJsonIfPresent(
        runDirectory, path.join(runDirectory, 'checkpoint.json')
      ));
    } catch {
      // Accepted artifacts are authoritative and can deterministically rebuild a
      // torn checkpoint; no user-authored input is inferred from the corrupt bytes.
      recoveryCheckpointArtifact = null;
    }
    const recoveryCheckpoint = /** @type {any} */ (recoveryCheckpointArtifact?.value ?? null);
    if (acceptedContext.active && recoveryCheckpoint
      && recoveryCheckpoint.run_instance_id === runInstance.run_instance_id
      && recoveryCheckpoint.source_revision === acceptedContext.active.source_pack.source_revision
      && (recoveryCheckpoint.active_preview_presentation || recoveryCheckpoint.presentation_snapshot)) {
      acceptedContext.active.workflow_state = {
        ...(acceptedContext.active.workflow_state ?? {}),
        presentation_snapshot: recoveryCheckpoint.active_preview_presentation
          ?? recoveryCheckpoint.presentation_snapshot
      };
    }
    if (acceptedContext.active) {
      const activeRevision = Number(acceptedContext.active.source_pack.source_revision);
      const activeIsReady = acceptedContext.active.complete
        && acceptedContext.active.result?.status === 'finished';
      const currentState = /** @type {any} */ (await guardedAwait(() => readCurrentState(runDirectory)));
      if (currentState?.status === 'ready'
        && (currentState.source_revision < activeRevision || !activeIsReady)) {
        await guardedAwait(() => writeNonReadyCurrent(
          runDirectory, runInstance.run_instance_id, activeRevision
        ));
      }
    }
    let sourceCandidate = await guardedAwait(() => stagedArtifact(
      runDirectory, 'source_pack', revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1
    ));
    const previewRequestPath = postReadyPreviewRequestPath(runDirectory);
    const previewRequestText = await guardedAwait(() => readTextIfPresent(
      runDirectory, previewRequestPath
    ));
    /** @type {any} */
    let previewCandidate = null;
    if (previewRequestText !== null) {
      try {
        const value = JSON.parse(previewRequestText);
        previewCandidate = { text: previewRequestText, value, digest: digest(value) };
      } catch {
        return revisionReply(runDirectory, 'source_pack', revisions.at(-1) ?? 0, previewRequestText, [{
          category: 'schema', code: 'PREVIEW_REQUEST_JSON_INVALID', path: '/',
          message: 'Private post-ready preview request is not valid JSON.'
        }]);
      }
    }
    if (sourceCandidate && previewCandidate) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'A source revision and post-ready preview request cannot be staged together.'
    );
    if (sourceCandidate) {
      const candidateRecord = sourceCandidate.value && typeof sourceCandidate.value === 'object'
        ? /** @type {Record<string, unknown>} */ (sourceCandidate.value) : null;
      const candidateRevision = candidateRecord && Number.isSafeInteger(candidateRecord.source_revision)
        ? /** @type {number} */ (candidateRecord.source_revision)
        : revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
      if (candidateRecord && revisions.length > 0
        && candidateRevision === revisions[revisions.length - 1]) {
        const acceptedSource = await guardedAwait(() => readJson(
          runDirectory, acceptedPath(runDirectory, candidateRevision, 'source_pack')
        ));
        if (acceptedSource.digest !== sourceCandidate.digest) return fatalReply(
          'RUN_INTEGRITY_ERROR',
          'Staging Source Pack conflicts with the immutable accepted revision.'
        );
        await guardedAwait(() => discardStagingSnapshot(
          runDirectory, 'source_pack', /** @type {{text:string}} */ (sourceCandidate)
        ));
        sourceCandidate = null;
      }
    }
    if (sourceCandidate) {
      const candidateRecord = sourceCandidate.value && typeof sourceCandidate.value === 'object'
        ? /** @type {Record<string, unknown>} */ (sourceCandidate.value) : null;
      const candidateRevision = candidateRecord && Number.isSafeInteger(candidateRecord.source_revision)
        ? /** @type {number} */ (candidateRecord.source_revision)
        : revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
      const expectedRevision = revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
      if (candidateRevision !== expectedRevision) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Source revisions must begin at r000 and advance by exactly one.'
      );
      if (candidateRecord?.schema_version === '1.0.0') return migrationRequired();
      const diagnostics = sourceCandidate.parseDiagnostics.length > 0
        ? sourceCandidate.parseDiagnostics
        : stableDiagnostics(validateAgainstSchema(
          sourceCandidate.value, registry.schemas.get(STAGE_SCHEMA.source_pack)
        ));
      if (diagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value, diagnostics
      );
      if (candidateRecord) {
        if (candidateRecord.run_instance_id !== runInstance.run_instance_id) return fatalReply(
          'RUN_INTEGRITY_ERROR', 'Staged Source Pack belongs to a different run instance.'
        );
        const transition = revisions.length === 0
          ? historySequenceIntegrity(candidateRecord)
          : sourceRevisionIntegrity(
            /** @type {Record<string, unknown>} */ ((await guardedAwait(() => readJson(
              runDirectory, acceptedPath(
                runDirectory, revisions[revisions.length - 1], 'source_pack'
              )
            ))).value),
            candidateRecord
        );
        if (transition) return transition;
      }
      const identityDiagnostics = stableDiagnostics(
        validateUniqueStableIds(sourceCandidate.value)
      );
      if (identityDiagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value,
        identityDiagnostics
      );
      const initialControlDiagnostics = candidateRevision === 0 && candidateRecord
        ? initialClarificationHistoryDiagnostics(candidateRecord) : [];
      if (initialControlDiagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value,
        initialControlDiagnostics
      );
      const sourcePolicy = resolveSourcePolicy(
        /** @type {Record<string, unknown>} */ (sourceCandidate.value)
      );
      if (sourcePolicy.diagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value,
        sourcePolicy.diagnostics
      );
      const appendValidation = candidateRecord
        ? validateSourceRevisionAppend(
            candidateRevision, candidateRecord, registry, acceptedContext.active
          ) : null;
      if (appendValidation && 'status' in appendValidation
        && appendValidation.status === 'fatal') return appendValidation;
      if (appendValidation && 'kind' in appendValidation
        && appendValidation.kind === 'need_revision') return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value,
        appendValidation.diagnostics
      );
      await guardedAwait(() => promoteArtifact(
        runDirectory, candidateRevision, 'source_pack', sourceCandidate.value, sourceCandidate
      ));
      await guardedAwait(() => writeNonReadyCurrent(
        runDirectory, runInstance.run_instance_id, candidateRevision
      ));
      const priorActiveContext = acceptedContext.active;
      acceptedContext.active = {
        complete: false,
        source_pack: /** @type {Record<string, unknown>} */ (sourceCandidate.value),
        workflow_state: priorActiveContext?.workflow_state ?? null,
        clarification_input: candidateRevision === 0 ? {
          prior_state: initialClarificationState(
            0, maximumEventSequence(
              /** @type {Record<string, unknown>} */ (sourceCandidate.value)
            )
          ),
          append_batch: { decision_records: [], clarification_events: [] }
        } : clarificationAppendInput(
          priorActiveContext.state, priorActiveContext.source_pack,
          /** @type {Record<string, unknown>} */ (sourceCandidate.value)
        )
      };
      const sourceDigests = await guardedAwait(() => acceptedDigests(runDirectory, candidateRevision));
      const sourceCheckpoint = checkpoint(
        candidateRevision, 'source_pack',
        /** @type {Record<string, unknown>} */ (sourceCandidate.value), null, sourceDigests,
        runInstance.run_instance_id, priorActiveContext?.workflow_state ?? null,
        recoveryCheckpoint
      );
      if (recoveryCheckpoint?.preview_state === 'active') {
        sourceCheckpoint.preview_epoch = Number(recoveryCheckpoint.preview_epoch ?? 0) + 1;
        sourceCheckpoint.preview_state = 'consumed';
        sourceCheckpoint.active_preview_presentation = null;
      }
      await guardedAwait(() => writeCheckpoint(runDirectory, sourceCheckpoint));
      revisions = await guardedAwait(() => acceptedSourceRevisions(runDirectory));
    }
    if (previewCandidate) {
      const active = acceptedContext.active;
      if (!active?.complete || active.result?.status !== 'finished') return revisionReply(
        runDirectory, 'source_pack', revisions.at(-1) ?? 0, previewCandidate.value, [{
          category: 'classification', code: 'POST_READY_PREVIEW_NOT_READY', path: '/',
          message: 'A post-ready preview requires the current highest accepted revision to be ready.'
        }]
      );
      const previewDiagnostics = artifactDiagnostics(
        previewCandidate.value,
        registry.schemas.get('post-ready-preview-request.schema.json')
      );
      if (previewDiagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', revisions.at(-1) ?? 0,
        previewCandidate.value, previewDiagnostics
      );
      const currentState = /** @type {any} */ (await guardedAwait(() => readCurrentState(runDirectory)));
      const result = active.result;
      if (!currentState || currentState.status !== 'ready'
        || currentState.source_revision !== result.source_revision
        || currentState.bundle_digest !== result.bundle_digest
        || currentState.plan_digest !== result.bundle.execution_plan.plan_digest) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'The ready pointer does not match the highest accepted ready revision.'
      );
      const storedCheckpoint = /** @type {any} */ ((await guardedAwait(() => readJsonIfPresent(
        runDirectory, path.join(runDirectory, 'checkpoint.json')
      )))?.value ?? {});
      const processed = processPreviewRequest({
        request: previewCandidate.value,
        state: storedCheckpoint,
        ready: {
          run_instance_id: runInstance.run_instance_id,
          source_revision: result.source_revision,
          bundle_digest: result.bundle_digest,
          plan_digest: result.bundle.execution_plan.plan_digest,
          plan_change_head_seq: result.workflow_state.execution_plan.plan_change_head_seq,
          confirmation_semantic_digest: result.bundle.execution_plan.confirmation.confirmation_semantic_digest,
          items: result.bundle.execution_plan.items
        },
        compilerVersion: registry.compilerVersion
      });
      if (processed.kind === 'rejected') return revisionReply(
        runDirectory, 'source_pack', result.source_revision,
        previewCandidate.value, processed.diagnostics
      );
      const updatedCheckpoint = {
        ...storedCheckpoint,
        preview_epoch: processed.state.preview_epoch,
        preview_state: processed.state.preview_state,
        active_preview_presentation: processed.state.active_preview_presentation,
        last_preview_request: processed.state.last_preview_request,
        presentation_snapshot: processed.presentation,
        presentation_snapshot_digest: processed.presentation ? digest(processed.presentation) : null
      };
      await guardedAwait(() => writeCheckpoint(runDirectory, updatedCheckpoint));
      await guardedAwait(() => discardPostReadyPreviewRequest(runDirectory, previewCandidate));
      if (processed.kind === 'cancelled') return finishedReply(
        result, updatedCheckpoint, currentState,
        outputPaths(runDirectory, result.source_revision).markdown,
        'POST_READY_CHANGE_CANCELLED'
      );
      const groups = processed.presentation.groups.map((/** @type {any} */ group) => ({
        question_id: group.question_id,
        presentation_id: processed.presentation.presentation_id,
        group_id: group.group_id,
        question: group.question,
        affected_items: group.item_refs.map((/** @type {any} */ item) => ({
          item_kind: item.item_kind, item_id: item.item_id, title: item.title
        })),
        counts_by_kind: group.item_refs.reduce((/** @type {any} */ counts, /** @type {any} */ item) => {
          counts[item.item_kind] = (counts[item.item_kind] ?? 0) + 1;
          return counts;
        }, { case: 0, formal_test_point: 0, exploratory: 0 }),
        risk_counts: { critical: 0, high: 0, medium: 0, low: 0 },
        options: group.allowed_options,
        answer_example: group.answer_example
      }));
      return {
        status: 'need_user_answers', purpose: processed.presentation.purpose,
        entry_context: 'post_ready_change', run_instance_id: runInstance.run_instance_id,
        run_identity_digest: result.workflow_state.execution_plan.run_identity_digest,
        source_revision: result.source_revision,
        next_event_seq: Number(updatedCheckpoint.workflow_event_head_seq ?? 0) + 1,
        presentation_id: processed.presentation.presentation_id,
        presentation_digest: digest(processed.presentation),
        execution_plan: result.bundle.execution_plan,
        ready_binding: {
          bundle_digest: result.bundle_digest,
          plan_digest: result.bundle.execution_plan.plan_digest,
          confirmation_semantic_digest: result.bundle.execution_plan.confirmation.confirmation_semantic_digest
        },
        proposed_change: previewCandidate.value.proposed_change,
        groups,
        preview_control: nextPreviewControl({
          run_instance_id: runInstance.run_instance_id,
          source_revision: result.source_revision,
          bundle_digest: result.bundle_digest,
          plan_digest: result.bundle.execution_plan.plan_digest,
          confirmation_semantic_digest: result.bundle.execution_plan.confirmation.confirmation_semantic_digest
        }, updatedCheckpoint, registry.compilerVersion),
        diagnostics: []
      };
    }
    if (revisions.length === 0) return artifactRequest(0, 'source_pack', runInstance.run_instance_id);
    const sourceRevision = revisions[revisions.length - 1];
    const sourceAccepted = await guardedAwait(() => readJson(
      runDirectory, acceptedPath(runDirectory, sourceRevision, 'source_pack')
    ));
    const sourcePack = /** @type {Record<string, unknown>} */ (sourceAccepted.value);
    const acceptedSourceDiagnostics = artifactDiagnostics(
      sourcePack, registry.schemas.get(STAGE_SCHEMA.source_pack)
    );
    const acceptedSourcePolicy = resolveSourcePolicy(sourcePack);
    if (acceptedSourceDiagnostics.length > 0 || acceptedSourcePolicy.diagnostics.length > 0) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Accepted Source Pack failed deterministic integrity validation.'
    );
    /** @type {Record<string, unknown>} */
    const accepted = { source_pack: sourcePack };

    for (const stage of ['evidence_claims', 'behavior_views']) {
      const typedStage = /** @type {'evidence_claims'|'behavior_views'} */ (stage);
      let artifact = await guardedAwait(() => readJsonIfPresent(
        runDirectory, acceptedPath(runDirectory, sourceRevision, typedStage)
      ));
      let candidate = await guardedAwait(() => stagedArtifact(
        runDirectory, typedStage, sourceRevision
      ));
      if (artifact && candidate) {
        if (candidate.parseDiagnostics.length > 0 || artifact.digest !== candidate.digest) {
          return fatalReply(
            'RUN_INTEGRITY_ERROR',
            `Staging ${typedStage} conflicts with the immutable accepted artifact.`
          );
        }
        await guardedAwait(() => discardStagingSnapshot(
          runDirectory, typedStage, /** @type {{text:string}} */ (candidate)
        ));
        candidate = null;
      }
      if (!artifact) {
        if (!candidate) return artifactRequest(sourceRevision, typedStage, runInstance.run_instance_id);
        const diagnostics = candidate.parseDiagnostics.length > 0
          ? candidate.parseDiagnostics
          : artifactDiagnostics(candidate.value, registry.schemas.get(STAGE_SCHEMA[typedStage]));
        if (diagnostics.length > 0) return revisionReply(
          runDirectory, typedStage, sourceRevision, candidate.value, diagnostics
        );
        const candidateRecord = /** @type {Record<string, unknown>} */ (candidate.value);
        if (candidateRecord.source_revision !== sourceRevision) return revisionReply(
          runDirectory, typedStage, sourceRevision, candidate.value, [{
            category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
            message: 'The staged artifact must match the active accepted source revision.'
          }]
        );
        if (typedStage === 'evidence_claims') {
          const evidence = validateEvidenceGraph(sourcePack, candidateRecord);
          if (evidence.diagnostics.length > 0) return revisionReply(
            runDirectory, typedStage, sourceRevision, candidate.value, evidence.diagnostics
          );
          const adapterDiagnostics = adapterEvidenceDiagnostics(candidateRecord, evidence.claimsById);
          if (adapterDiagnostics.length > 0) return revisionReply(
            runDirectory, typedStage, sourceRevision, candidate.value, adapterDiagnostics
          );
        }
        let candidateObligations = null;
        if (typedStage === 'behavior_views') {
          const derivedCandidate = deriveObligations(
            sourcePack,
            /** @type {Record<string, unknown>} */ (accepted.evidence_claims),
            candidateRecord,
            sourceRevision
          );
          if (derivedCandidate.diagnostics.length > 0 || !derivedCandidate.artifact) return revisionReply(
            runDirectory, typedStage, sourceRevision, candidate.value,
            derivedCandidate.diagnostics
          );
          candidateObligations = derivedCandidate.artifact;
        }
        await guardedAwait(() => promoteArtifact(
          runDirectory, sourceRevision, typedStage, candidate.value, candidate
        ));
        if (candidateObligations) await guardedAwait(() => atomicWriteJson(
          runDirectory, obligationsPath(runDirectory, sourceRevision), candidateObligations
        ));
        artifact = await guardedAwait(() => readJson(
          runDirectory, acceptedPath(runDirectory, sourceRevision, typedStage)
        ));
        const digests = await guardedAwait(() => acceptedDigests(runDirectory, sourceRevision));
        await guardedAwait(() => writeCheckpoint(runDirectory, checkpoint(
          sourceRevision, typedStage, sourcePack, null, digests, runInstance.run_instance_id,
          acceptedContext.active?.workflow_state ?? null, recoveryCheckpoint
        )));
      }
      const diagnostics = artifactDiagnostics(
        artifact.value, registry.schemas.get(STAGE_SCHEMA[typedStage])
      );
      if (diagnostics.length > 0) return fatalReply(
        'RUN_INTEGRITY_ERROR', `Accepted ${typedStage} failed deterministic integrity validation.`
      );
      accepted[typedStage] = artifact.value;
    }

    const derived = deriveObligations(
      sourcePack,
      /** @type {Record<string, unknown>} */ (accepted.evidence_claims),
      /** @type {Record<string, unknown>} */ (accepted.behavior_views),
      sourceRevision
    );
    if (derived.diagnostics.length > 0 || !derived.artifact) return fatalReply(
      'RUN_INTEGRITY_ERROR',
      'Accepted evidence or behavior artifacts failed deterministic obligation derivation.'
    );
    await guardedAwait(() => atomicWriteJson(
      runDirectory, obligationsPath(runDirectory, sourceRevision), derived.artifact
    ));

    let caseArtifact = await guardedAwait(() => readJsonIfPresent(
      runDirectory, acceptedPath(runDirectory, sourceRevision, 'case_drafts')
    ));
    let caseCandidate = await guardedAwait(() => stagedArtifact(
      runDirectory, 'case_drafts', sourceRevision
    ));
    if (caseArtifact && caseCandidate) {
      if (caseCandidate.parseDiagnostics.length > 0
        || caseArtifact.digest !== caseCandidate.digest) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Staging case_drafts conflicts with the immutable accepted artifact.'
      );
      await guardedAwait(() => discardStagingSnapshot(
        runDirectory, 'case_drafts', /** @type {{text:string}} */ (caseCandidate)
      ));
      caseCandidate = null;
    }
    let caseFromStaging = false;
    if (!caseArtifact) {
      const candidate = caseCandidate;
      if (!candidate) return artifactRequest(sourceRevision, 'case_drafts', runInstance.run_instance_id);
      const diagnostics = candidate.parseDiagnostics.length > 0
        ? candidate.parseDiagnostics
        : artifactDiagnostics(candidate.value, registry.schemas.get(STAGE_SCHEMA.case_drafts));
      if (diagnostics.length > 0) return revisionReply(
        runDirectory, 'case_drafts', sourceRevision, candidate.value, diagnostics
      );
      const candidateRecord = /** @type {Record<string, unknown>} */ (candidate.value);
      if (candidateRecord.source_revision !== sourceRevision) return revisionReply(
        runDirectory, 'case_drafts', sourceRevision, candidate.value, [{
          category: 'traceability', code: 'SOURCE_REVISION_MISMATCH', path: '/source_revision',
          message: 'The staged artifact must match the active accepted source revision.'
        }]
      );
      caseArtifact = candidate;
      caseFromStaging = true;
    }
    if (!caseFromStaging) {
      const acceptedCaseDiagnostics = artifactDiagnostics(
        caseArtifact.value, registry.schemas.get(STAGE_SCHEMA.case_drafts)
      );
      if (acceptedCaseDiagnostics.length > 0) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Accepted case_drafts failed deterministic integrity validation.'
      );
    }
    const activeContext = acceptedContext.active;
    if (!activeContext || activeContext.source_pack.source_revision !== sourceRevision) {
      return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Accepted lifecycle context does not match the active revision.'
      );
    }
    /** @type {Record<string, Record<string, unknown>>} */
    const evaluationArtifacts = {
      source_pack: sourcePack,
      evidence_claims: /** @type {Record<string, unknown>} */ (accepted.evidence_claims),
      behavior_views: /** @type {Record<string, unknown>} */ (accepted.behavior_views),
      case_drafts: /** @type {Record<string, unknown>} */ (caseArtifact.value)
    };
    const result = !caseFromStaging && activeContext.complete
      ? activeContext.result
      : evaluateAdapterRevision(
          evaluationArtifacts, activeContext.clarification_input, registry,
          activeContext.workflow_state ?? null
        );
    if (result.status === 'need_revision') {
      if (!caseFromStaging) return fatalReply(
        'RUN_INTEGRITY_ERROR',
        'Accepted complete revision no longer passes deterministic evaluation.'
      );
      const route = mapInternalRevision(result);
      if (route.kind === 'fatal') return fatalReply(
        route.code, `Pure revision diagnostics have no unique Agent-writable artifact owner: ${canonicalStringify(result.diagnostics)}`
      );
      const stage = /** @type {keyof typeof STAGE_SCHEMA} */ (route.stage);
      const replyArtifacts = {
        source_pack: sourcePack,
        evidence_claims: accepted.evidence_claims,
        behavior_views: accepted.behavior_views,
        case_drafts: caseArtifact.value
      };
      return revisionReply(
        runDirectory, stage, sourceRevision, replyArtifacts[stage], result.diagnostics
      );
    }
    if (caseFromStaging) await guardedAwait(() => promoteArtifact(
      runDirectory, sourceRevision, 'case_drafts', caseArtifact.value, caseArtifact
    ));
    const clarificationState = /** @type {Record<string, unknown>} */ (result.clarification_state);
    await guardedAwait(() => atomicWriteJson(
      runDirectory, clarificationStatePath(runDirectory, sourceRevision), clarificationState
    ));
    const digests = await guardedAwait(() => acceptedDigests(runDirectory, sourceRevision));
    if (result.status === 'need_user_answers') {
      const workflowState = /** @type {Record<string,unknown>|null} */ (result.workflow_state ?? null);
      const checkpointValue = checkpoint(
        sourceRevision, 'verification', sourcePack, clarificationState, digests,
        runInstance.run_instance_id, workflowState, recoveryCheckpoint
      );
      await guardedAwait(() => writeCheckpoint(runDirectory, checkpointValue));
      await guardedAwait(() => writeNonReadyCurrent(
        runDirectory, runInstance.run_instance_id, sourceRevision
      ));
      if (result.purpose === 'execution_closure' || result.purpose === 'final_confirmation') {
        const plan = result.execution_plan;
        const groups = result.presentation.groups.map((/** @type {any} */ group) => ({
          question_id: group.question_id,
          presentation_id: result.presentation.presentation_id,
          group_id: group.group_id,
          question: group.question,
          affected_items: group.item_refs.map((/** @type {any} */ item) => ({
            item_kind: item.item_kind, item_id: item.item_id, title: item.title
          })),
          counts_by_kind: group.item_refs.reduce((/** @type {any} */ counts, /** @type {any} */ item) => {
            counts[item.item_kind] = (counts[item.item_kind] ?? 0) + 1;
            return counts;
          }, { case: 0, formal_test_point: 0, exploratory: 0 }),
          risk_counts: { critical: 0, high: 0, medium: 0, low: 0 },
          options: group.allowed_options,
          answer_example: group.answer_example
        }));
        return {
          status: 'need_user_answers', purpose: result.purpose,
          entry_context: result.entry_context,
          run_instance_id: runInstance.run_instance_id,
          source_revision: sourceRevision,
          next_event_seq: result.next_event_seq,
          presentation_id: result.presentation.presentation_id,
          presentation_digest: digest(result.presentation),
          execution_plan: plan,
          groups,
          ...(result.purpose === 'execution_closure' ? {
            pending_items: plan.items.filter((/** @type {any} */ item) => item.execution_disposition === 'pending'),
            resume_hint: plan.status === 'paused'
              ? `Resume run ${runInstance.run_instance_id} at ${plan.resume_target}.` : null
          } : {
            prompt_id: result.presentation.presentation_id,
            execute_summary: { case_ids: plan.runner_case_ids },
            do_not_execute_summary: plan.items.filter((/** @type {any} */ item) => item.execution_disposition === 'do_not_execute')
              .map((/** @type {any} */ item) => ({ item_kind: item.item_kind, item_id: item.item_id, title: item.title })),
            critical_high_do_not_execute: [], pending_count: 0
          }),
          diagnostics: []
        };
      }
      return {
        status: 'need_user_answers', purpose: 'semantic_clarification',
        entry_context: 'active_analysis', run_instance_id: runInstance.run_instance_id,
        source_revision: sourceRevision, next_event_seq: result.next_event_seq,
        presentation_id: result.presentation.presentation_id,
        presentation_digest: digest(result.presentation),
        groups: result.presentation.groups.map((/** @type {any} */ group) => ({
          question_id: group.question_id,
          presentation_id: result.presentation.presentation_id,
          group_id: group.group_id,
          question: group.question,
          affected_items: group.item_refs.map((/** @type {any} */ item) => ({
            item_kind: item.item_kind, item_id: item.item_id, title: item.title
          })),
          counts_by_kind: group.item_refs.reduce((/** @type {any} */ counts, /** @type {any} */ item) => {
            counts[item.item_kind] = (counts[item.item_kind] ?? 0) + 1;
            return counts;
          }, { case: 0, formal_test_point: 0, exploratory: 0 }),
          risk_counts: { critical: 0, high: 0, medium: 0, low: 0 },
          options: group.allowed_options,
          answer_example: group.answer_example
        })),
        diagnostics: [], blockers: result.pending_root_issues.map((/** @type {any} */ item) => ({
          root_issue_id: item.root_issue_id,
          root_issue_key: item.root_issue_key,
          missing_type: item.missing_type,
          scope: item.scope,
          affected_obligation_ids: item.affected_obligation_ids,
          risk_counts: item.risk_counts,
          source_revision: item.source_revision,
          question: item.question,
          batch_id: item.batch_id
        }))
      };
    }
    if (result.status !== 'finished') return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Pure revision evaluator returned an unsupported workflow result.'
    );
    const paths = await guardedAwait(() => writeFinalOutput(
      runDirectory, sourceRevision, result.bundle, result.markdown
    ));
    digests.test_bundle = result.bundle_digest;
    const priorCheckpointArtifact = recoveryCheckpointArtifact;
    const priorCheckpoint = /** @type {Record<string,unknown>|null} */ (
      priorCheckpointArtifact?.value ?? null
    );
    const checkpointValue = checkpoint(
      sourceRevision, 'finished', sourcePack, clarificationState, digests,
      runInstance.run_instance_id, result.workflow_state ?? null, priorCheckpoint
    );
    if (priorCheckpoint?.preview_state === 'active') {
      checkpointValue.preview_epoch = Number(priorCheckpoint.preview_epoch ?? 0) + 1;
      checkpointValue.preview_state = 'consumed';
      checkpointValue.active_preview_presentation = null;
      checkpointValue.presentation_snapshot = null;
      checkpointValue.presentation_snapshot_digest = null;
    }
    await guardedAwait(() => writeCheckpoint(runDirectory, checkpointValue));
    const current = {
      run_instance_id: runInstance.run_instance_id,
      source_revision: sourceRevision,
      bundle_path: paths.bundle,
      bundle_digest: result.bundle_digest,
      plan_digest: result.bundle.execution_plan.plan_digest
    };
    await guardedAwait(() => writeReadyCurrent(runDirectory, current));
    return finishedReply(result, checkpointValue, current, paths.markdown);
    } finally {
      await baseGuardedAwait(releaseRunLock());
    }
    }
  } catch (error) {
    if (error instanceof CoreIntrinsicMutationError) return fatalReply(
      'CORE_INTRINSIC_INVALID',
      'Run-store evaluation requires captured native collection traversal intrinsics.'
    );
    return fatalReply('RUN_INTEGRITY_ERROR', errorMessage(error));
  }
}

/**
 * Serialize advances for one run. The mandatory first microtask boundary makes
 * the intrinsic check in the exclusive evaluator observe mutations made while
 * the caller holds the returned Promise, before any artifact can be accepted.
 * @param {string} runDirectory
 */
export function advanceStrict(runDirectory) {
  if (!runStoreIntrinsicsIntact()) return new NATIVE_PROMISE((resolve) => resolve(fatalReply(
    'CORE_INTRINSIC_INVALID',
    'Run-store evaluation requires captured native collection traversal intrinsics.'
  )));
  let key;
  try {
    key = typeof runDirectory === 'string' ? pathResolve(runDirectory) : '<invalid-run>';
  } catch {
    return new NATIVE_PROMISE((resolve) => resolve(fatalReply(
      'RUN_INTEGRITY_ERROR', 'Run directory could not be resolved at the outer run boundary.'
    )));
  }
  const previous = mapGet(ACTIVE_RUNS, key);
  /** @type {()=>void} */
  let release = () => {};
  const turn = new NATIVE_PROMISE((resolve) => {
    release = () => { resolve(undefined); };
  });
  mapSet(ACTIVE_RUNS, key, turn);
  return (async () => {
    if (previous) await previous;
    else await new NATIVE_PROMISE((resolve) => resolve(undefined));
    try {
      return await advanceStrictExclusive(runDirectory);
    } finally {
      release();
      if (mapGet(ACTIVE_RUNS, key) === turn) mapDelete(ACTIVE_RUNS, key);
    }
  })();
}
