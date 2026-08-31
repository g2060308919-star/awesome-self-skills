import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify, digest } from './canonical.mjs';
import { evaluateRevision } from './core.mjs';
import { validateEvidenceGraph } from './evidence.mjs';
import {
  compileObligations, ObligationCompilationError
} from './obligations/compile-obligations.mjs';
import {
  acceptedPath, acceptedSourceRevisions, acquireRunLock, atomicWriteJson, clarificationStatePath,
  cleanupTemporaryFiles, discardStagingSnapshot, obligationsPath, outputPaths,
  prepareRunStore, promoteArtifact, readJson, readJsonIfPresent, readTextIfPresent,
  recoverStagingClaims,
  runStoreIntrinsicsIntact, stagingPath, STAGE_FILES, writeCheckpoint, writeFinalOutput
} from './run-store.mjs';
import { loadSchemaRegistry } from './schema-registry.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { resolveSourcePolicy } from './source-policy.mjs';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
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

const STAGE_SCHEMA = Object.freeze({
  source_pack: 'source-pack.schema.json',
  evidence_claims: 'evidence-claims.schema.json',
  behavior_views: 'behavior-views.schema.json',
  case_drafts: 'case-drafts.schema.json'
});

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

/** @param {number} sourceRevision @param {keyof typeof STAGE_SCHEMA} stage */
function artifactRequest(sourceRevision, stage) {
  return {
    status: 'need_artifact', stage, schema_ref: STAGE_SCHEMA[stage],
    scope: { source_revision: sourceRevision }, diagnostics: []
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
  for (const field of ['decision_records', 'clarification_events']) {
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
    ['decision_records', 'decision_id'], ['clarification_events', 'event_id']
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
  if (!isExactPrefix(priorDecisions, nextDecisions) || !isExactPrefix(priorEvents, nextEvents)) {
    return fatalReply('RUN_INTEGRITY_ERROR', 'Decision and clarification histories are append-only and order-preserving.');
  }
  const historyIntegrity = historySequenceIntegrity(next);
  if (historyIntegrity) return historyIntegrity;
  const added = [
    ...nextDecisions.slice(priorDecisions.length), ...nextEvents.slice(priorEvents.length)
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

/** @param {Record<string, unknown>} behaviorViews */
function inferredCompilation(behaviorViews) {
  /** @type {Record<string, unknown>} */
  const contexts = {};
  const views = arrayIsArray(behaviorViews.views) ? behaviorViews.views : [];
  for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
    const view = views[viewIndex];
    if (!view || typeof view !== 'object' || typeof view.view_id !== 'string') continue;
    if (['input-domain', 'role', 'timing', 'integration'].includes(String(view.type))) {
      // The public Behavior Views artifact contains only element-wide support.
      // It cannot prove responsibility-specific evidence, Oracles, risk, or
      // capabilities. An empty closed binding set therefore makes every
      // required responsibility fail closed in the strategy validator instead
      // of broadcasting element evidence and manufacturing coverage.
      contexts[view.view_id] = { responsibilityBindings: [] };
      continue;
    }
    /** @type {Record<string,string>} */
    const riskByElementId = {};
    /** @type {Record<string,string[]>} */
    const requiredOracleRefsByElementId = {};
    /** @type {Record<string,string[]>} */
    const requiredCapabilitiesByElementId = {};
    const elements = arrayIsArray(view.elements) ? view.elements : [];
    for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
      const element = elements[elementIndex];
      if (!element || typeof element !== 'object' || typeof element.element_id !== 'string') continue;
      riskByElementId[element.element_id] = 'medium';
      requiredOracleRefsByElementId[element.element_id] = arrayIsArray(element.source_claim_ids)
        ? [...element.source_claim_ids] : [];
      requiredCapabilitiesByElementId[element.element_id] = [];
    }
    contexts[view.view_id] = {
      riskByElementId, requiredOracleRefsByElementId, requiredCapabilitiesByElementId
    };
  }
  return {
    contexts_by_view_id: contexts, custom_obligations: [], fact_routes: [],
    not_applicable_reviews: []
  };
}

/** @param {Record<string, unknown>} sourcePack @param {Record<string, unknown>} evidenceClaims @param {Record<string, unknown>} behaviorViews @param {number} sourceRevision */
function deriveObligations(sourcePack, evidenceClaims, behaviorViews, sourceRevision) {
  const policy = resolveSourcePolicy(sourcePack);
  if (policy.diagnostics.length > 0) return { diagnostics: policy.diagnostics, artifact: null };
  const evidence = validateEvidenceGraph(sourcePack, evidenceClaims);
  if (evidence.diagnostics.length > 0) return { diagnostics: evidence.diagnostics, artifact: null };
  const compilation = inferredCompilation(behaviorViews);
  const graph = {
    claimsById: evidence.claimsById,
    factLedger: structuredClone(arrayIsArray(evidenceClaims.fact_ledger) ? evidenceClaims.fact_ledger : []),
    conflicts: structuredClone(arrayIsArray(policy.conflicts) ? policy.conflicts : []),
    runScope: String(sourcePack.run_scope),
    obligationCompilation: {
      sourceRevision,
      contextsByViewId: new Map(Object.entries(compilation.contexts_by_view_id)),
      factRoutes: [], notApplicableReviews: [], customObligations: []
    }
  };
  try { return { diagnostics: [], artifact: compileObligations(graph, behaviorViews), compilation }; } catch (error) {
    if (error instanceof ObligationCompilationError) return {
      diagnostics: error.diagnostics, artifact: null, compilation
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

/** @param {string} runDirectory @param {number} sourceRevision @param {Record<string, unknown>} sourcePack */
async function clarificationInput(runDirectory, sourceRevision, sourcePack) {
  const sameRevision = await guardedAwait(readJsonIfPresent(
    runDirectory, clarificationStatePath(runDirectory, sourceRevision)
  ));
  if (sameRevision) return {
    prior_state: sameRevision.value,
    append_batch: { decision_records: [], clarification_events: [] }
  };
  if (sourceRevision === 0) return {
    prior_state: initialClarificationState(0, maximumEventSequence(sourcePack)),
    append_batch: { decision_records: [], clarification_events: [] }
  };
  const previousSource = await guardedAwait(readJsonIfPresent(runDirectory, acceptedPath(
    runDirectory, sourceRevision - 1, 'source_pack'
  )));
  const previousState = await guardedAwait(readJsonIfPresent(runDirectory, clarificationStatePath(
    runDirectory, sourceRevision - 1
  )));
  return {
    prior_state: previousState?.value
      ?? initialClarificationState(sourceRevision - 1, previousSource
        ? maximumEventSequence(/** @type {Record<string, unknown>} */ (previousSource.value)) : 0),
    append_batch: previousSource
      ? appendBatch(
        /** @type {Record<string, unknown>} */ (previousSource.value), sourcePack
      ) : { decision_records: [], clarification_events: [] }
  };
}

/** @param {number} sourceRevision @param {string} stage @param {Record<string, unknown>} sourcePack @param {Record<string, unknown>|null} state @param {Record<string,string>} acceptedDigests */
function checkpoint(sourceRevision, stage, sourcePack, state, acceptedDigests) {
  return {
    input_digest: digest({ source_revision: sourceRevision, accepted_artifact_digests: acceptedDigests }),
    source_revision: sourceRevision, stage,
    compiler_version: embeddedCompilerVersion ?? '0.1.0',
    schema_version: embeddedSchemaVersion ?? '1.0.0',
    accepted_artifact_digests: acceptedDigests,
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
    clarification_stop: state?.clarification_stop ?? null
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

/** @param {string} stage */
function externalStage(stage) {
  if (stage === 'source_policy') return 'source_pack';
  if (stage === 'evidence_claims') return 'evidence_claims';
  if (stage === 'behavior_views' || stage === 'test_obligations') return 'behavior_views';
  return 'case_drafts';
}

/**
 * Rebuild accepted state from r000 through the highest revision. No checkpoint,
 * derived artifact, output pointer, or later valid-looking directory can hide a
 * broken historical hop.
 * @param {string} runDirectory
 * @param {number[]} revisions
 * @param {any} registry
 */
async function acceptedRunIntegrity(runDirectory, revisions, registry) {
  if (revisions.length === 0) return null;
  for (let index = 0; index < revisions.length; index += 1) {
    if (revisions[index] !== index) return fatalReply(
      'RUN_INTEGRITY_ERROR', 'Accepted source revisions must start at r000 and remain consecutive.'
    );
  }
  let previousSource = null;
  for (let revisionIndex = 0; revisionIndex < revisions.length; revisionIndex += 1) {
    const sourceRevision = revisions[revisionIndex];
    const sourceArtifact = await guardedAwait(readJson(
      runDirectory, acceptedPath(runDirectory, sourceRevision, 'source_pack')
    ));
    const sourcePack = /** @type {Record<string, unknown>} */ (sourceArtifact.value);
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
    /** @type {Record<string, unknown>|null} */
    let compilation = null;
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
        if (validateEvidenceGraph(sourcePack, evidenceClaims).diagnostics.length > 0) return fatalReply(
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
        compilation = /** @type {Record<string, unknown>} */ (derived.compilation);
      } else caseDrafts = record;
    }
    if (caseDrafts) {
      const clarification = await guardedAwait(
        clarificationInput(runDirectory, sourceRevision, sourcePack)
      );
      const replay = /** @type {any} */ (evaluateRevision({
        schema_version: '1.0.0', source_revision: sourceRevision,
        compiler_version: registry.compilerVersion,
        lineage: {
          source_digest: digest(sourcePack), case_draft_digest: digest(caseDrafts)
        },
        source_pack: sourcePack,
        evidence_claims: evidenceClaims,
        behavior_views: behaviorViews,
        obligation_compilation: compilation,
        case_drafts: caseDrafts,
        clarification,
        limits: ['Compilation is limited to the accepted immutable revision.'],
        expert_recall_limits: ['Expert recall is benchmark-only.']
      }, { interactionPolicy: 'pause_for_clarification' }));
      if (replay.status === 'need_revision') return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Accepted complete revision failed deterministic semantic replay.'
      );
    }
    previousSource = sourcePack;
  }
  return null;
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
      await guardedAwait(() => recoverStagingClaims(runDirectory));
      await guardedAwait(() => cleanupTemporaryFiles(runDirectory));
      let revisions = await guardedAwait(() => acceptedSourceRevisions(runDirectory));
    const acceptedIntegrity = await guardedAwait(() =>
      acceptedRunIntegrity(runDirectory, revisions, registry)
    );
    if (acceptedIntegrity) return acceptedIntegrity;
    let sourceCandidate = await guardedAwait(() => stagedArtifact(
      runDirectory, 'source_pack', revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1
    ));
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
      const diagnostics = sourceCandidate.parseDiagnostics.length > 0
        ? sourceCandidate.parseDiagnostics
        : stableDiagnostics(validateAgainstSchema(
          sourceCandidate.value, registry.schemas.get(STAGE_SCHEMA.source_pack)
        ));
      if (diagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value, diagnostics
      );
      if (candidateRecord) {
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
      await guardedAwait(() => promoteArtifact(
        runDirectory, candidateRevision, 'source_pack', sourceCandidate.value, sourceCandidate
      ));
      const sourceDigests = await guardedAwait(() => acceptedDigests(runDirectory, candidateRevision));
      await guardedAwait(() => writeCheckpoint(runDirectory, checkpoint(
        candidateRevision, 'source_pack',
        /** @type {Record<string, unknown>} */ (sourceCandidate.value), null, sourceDigests
      )));
      revisions = await guardedAwait(() => acceptedSourceRevisions(runDirectory));
    }
    if (revisions.length === 0) return artifactRequest(0, 'source_pack');
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
        if (!candidate) return artifactRequest(sourceRevision, typedStage);
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
          sourceRevision, typedStage, sourcePack, null, digests
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
      if (!candidate) return artifactRequest(sourceRevision, 'case_drafts');
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
    const compilation = derived.compilation ?? inferredCompilation(
      /** @type {Record<string, unknown>} */ (accepted.behavior_views)
    );
    const clarification = await guardedAwait(() =>
      clarificationInput(runDirectory, sourceRevision, sourcePack)
    );
    const result = /** @type {any} */ (evaluateRevision({
      schema_version: '1.0.0', source_revision: sourceRevision,
      compiler_version: registry.compilerVersion,
      lineage: {
        source_digest: digest(sourcePack), case_draft_digest: digest(caseArtifact.value)
      },
      source_pack: sourcePack,
      evidence_claims: accepted.evidence_claims,
      behavior_views: accepted.behavior_views,
      obligation_compilation: compilation,
      case_drafts: caseArtifact.value,
      clarification,
      limits: ['Compilation is limited to the accepted immutable revision.'],
      expert_recall_limits: ['Expert recall is benchmark-only.']
    }, { interactionPolicy: 'pause_for_clarification' }));
    if (result.status === 'need_revision') {
      if (!caseFromStaging) return fatalReply(
        'RUN_INTEGRITY_ERROR',
        'Accepted complete revision no longer passes deterministic evaluation.'
      );
      const stage = /** @type {keyof typeof STAGE_SCHEMA} */ (externalStage(result.stage));
      return revisionReply(
        runDirectory, stage, sourceRevision, caseArtifact.value, result.diagnostics
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
      await guardedAwait(() => writeCheckpoint(runDirectory, checkpoint(
        sourceRevision, 'verification', sourcePack, clarificationState, digests
      )));
      return {
        status: 'need_user_answers', source_revision: sourceRevision, stage: 'clarification',
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
    await guardedAwait(() => writeCheckpoint(runDirectory, checkpoint(
      sourceRevision, 'finished', sourcePack, clarificationState, digests
    )));
    const current = {
      source_revision: sourceRevision,
      bundle_path: paths.bundle,
      bundle_digest: result.bundle_digest,
      markdown_path: paths.markdown
    };
    await guardedAwait(() => atomicWriteJson(
      runDirectory, outputPaths(runDirectory, sourceRevision).current, current
    ));
      return { status: 'finished', ...current };
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
