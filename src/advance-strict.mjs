import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStringify, digest } from './canonical.mjs';
import { evaluateRevision } from './core.mjs';
import { validateEvidenceGraph } from './evidence.mjs';
import {
  compileObligations, ObligationCompilationError
} from './obligations/compile-obligations.mjs';
import {
  acceptedPath, acceptedSourceRevisions, atomicWriteJson, clarificationStatePath,
  obligationsPath, outputPaths, promoteArtifact, readJson, readJsonIfPresent, stagingPath,
  STAGE_FILES, writeCheckpoint, writeFinalOutput
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
  let text;
  try { text = await readFile(candidatePath, 'utf8'); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    return { value: JSON.parse(text), parseDiagnostics: [] };
  } catch {
    return {
      value: text,
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
    const values = Array.isArray(sourcePack[field]) ? sourcePack[field] : [];
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
  const priorDecisions = Array.isArray(prior.decision_records) ? prior.decision_records : [];
  const nextDecisions = Array.isArray(next.decision_records) ? next.decision_records : [];
  const priorEvents = Array.isArray(prior.clarification_events) ? prior.clarification_events : [];
  const nextEvents = Array.isArray(next.clarification_events) ? next.clarification_events : [];
  if (!isExactPrefix(priorDecisions, nextDecisions) || !isExactPrefix(priorEvents, nextEvents)) {
    return fatalReply('RUN_INTEGRITY_ERROR', 'Decision and clarification histories are append-only and order-preserving.');
  }
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
  const views = Array.isArray(behaviorViews.views) ? behaviorViews.views : [];
  for (let viewIndex = 0; viewIndex < views.length; viewIndex += 1) {
    const view = views[viewIndex];
    if (!view || typeof view !== 'object' || typeof view.view_id !== 'string') continue;
    /** @type {Record<string,string>} */
    const riskByElementId = {};
    /** @type {Record<string,string[]>} */
    const requiredOracleRefsByElementId = {};
    /** @type {Record<string,string[]>} */
    const requiredCapabilitiesByElementId = {};
    const elements = Array.isArray(view.elements) ? view.elements : [];
    for (let elementIndex = 0; elementIndex < elements.length; elementIndex += 1) {
      const element = elements[elementIndex];
      if (!element || typeof element !== 'object' || typeof element.element_id !== 'string') continue;
      riskByElementId[element.element_id] = 'medium';
      requiredOracleRefsByElementId[element.element_id] = Array.isArray(element.source_claim_ids)
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
    factLedger: structuredClone(Array.isArray(evidenceClaims.fact_ledger) ? evidenceClaims.fact_ledger : []),
    conflicts: structuredClone(Array.isArray(policy.conflicts) ? policy.conflicts : []),
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
  const previousDecisions = Array.isArray(previous.decision_records) ? previous.decision_records : [];
  const previousEvents = Array.isArray(previous.clarification_events) ? previous.clarification_events : [];
  const decisions = Array.isArray(current.decision_records) ? current.decision_records : [];
  const events = Array.isArray(current.clarification_events) ? current.clarification_events : [];
  return {
    decision_records: structuredClone(decisions.slice(previousDecisions.length)),
    clarification_events: structuredClone(events.slice(previousEvents.length))
  };
}

/** @param {string} runDirectory @param {number} sourceRevision @param {Record<string, unknown>} sourcePack */
async function clarificationInput(runDirectory, sourceRevision, sourcePack) {
  const sameRevision = await readJsonIfPresent(clarificationStatePath(runDirectory, sourceRevision));
  if (sameRevision) return {
    prior_state: sameRevision.value,
    append_batch: { decision_records: [], clarification_events: [] }
  };
  if (sourceRevision === 0) return {
    prior_state: initialClarificationState(0, maximumEventSequence(sourcePack)),
    append_batch: { decision_records: [], clarification_events: [] }
  };
  const previousSource = await readJsonIfPresent(acceptedPath(
    runDirectory, sourceRevision - 1, 'source_pack'
  ));
  const previousState = await readJsonIfPresent(clarificationStatePath(
    runDirectory, sourceRevision - 1
  ));
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
    asked_root_issue_ids: state && Array.isArray(state.asked_root_issue_ids)
      ? state.asked_root_issue_ids : [],
    root_issue_dispositions: state && Array.isArray(state.root_issue_dispositions)
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
    const accepted = await readJsonIfPresent(acceptedPath(
      runDirectory, sourceRevision, /** @type {keyof typeof STAGE_FILES} */ (stage)
    ));
    if (accepted) values[stage] = accepted.digest;
  }
  const obligations = await readJsonIfPresent(obligationsPath(runDirectory, sourceRevision));
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
 * Advance one strict test-case-generation run.
 * @param {string} runDirectory
 */
export async function advanceStrict(runDirectory) {
  let registry;
  try {
    registry = await loadSchemaRegistry(
      schemaDirectory, embeddedManifestDigest, embeddedCompilerVersion
    );
    if (embeddedSchemaVersion && registry.schemaVersion !== embeddedSchemaVersion) {
      return fatalReply('SCHEMA_INTEGRITY_MISMATCH', 'Bundled schema version does not match the compiler.');
    }
  } catch {
    return fatalReply(
      'SCHEMA_INTEGRITY_MISMATCH',
      'Bundled schemas or schema manifest failed integrity verification.'
    );
  }
  if (!path.isAbsolute(runDirectory)) return fatalReply(
    'run_directory_absolute', 'Run directory must be an absolute path.'
  );

  try {
    if (!(await stat(runDirectory)).isDirectory()) return fatalReply(
      'run_directory_directory', 'Run directory must be a directory.'
    );
    let revisions = await acceptedSourceRevisions(runDirectory);
    const sourceCandidate = await stagedArtifact(
      runDirectory, 'source_pack', revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1
    );
    if (sourceCandidate) {
      const candidateRecord = sourceCandidate.value && typeof sourceCandidate.value === 'object'
        ? /** @type {Record<string, unknown>} */ (sourceCandidate.value) : null;
      const candidateRevision = candidateRecord && Number.isSafeInteger(candidateRecord.source_revision)
        ? /** @type {number} */ (candidateRecord.source_revision)
        : revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
      const diagnostics = sourceCandidate.parseDiagnostics.length > 0
        ? sourceCandidate.parseDiagnostics
        : artifactDiagnostics(sourceCandidate.value, registry.schemas.get(STAGE_SCHEMA.source_pack));
      if (diagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value, diagnostics
      );
      const expectedRevision = revisions.length === 0 ? 0 : revisions[revisions.length - 1] + 1;
      if (candidateRevision !== expectedRevision) return fatalReply(
        'RUN_INTEGRITY_ERROR', 'Source revisions must begin at r000 and advance by exactly one.'
      );
      const sourcePolicy = resolveSourcePolicy(
        /** @type {Record<string, unknown>} */ (sourceCandidate.value)
      );
      if (sourcePolicy.diagnostics.length > 0) return revisionReply(
        runDirectory, 'source_pack', candidateRevision, sourceCandidate.value,
        sourcePolicy.diagnostics
      );
      if (revisions.length > 0) {
        const previous = await readJson(acceptedPath(
          runDirectory, revisions[revisions.length - 1], 'source_pack'
        ));
        const integrity = sourceRevisionIntegrity(
          /** @type {Record<string, unknown>} */ (previous.value),
          /** @type {Record<string, unknown>} */ (sourceCandidate.value)
        );
        if (integrity) return integrity;
      }
      await promoteArtifact(
        runDirectory, candidateRevision, 'source_pack', sourceCandidate.value
      );
      const sourceDigests = await acceptedDigests(runDirectory, candidateRevision);
      await writeCheckpoint(runDirectory, checkpoint(
        candidateRevision, 'source_pack',
        /** @type {Record<string, unknown>} */ (sourceCandidate.value), null, sourceDigests
      ));
      revisions = await acceptedSourceRevisions(runDirectory);
    }
    if (revisions.length === 0) return artifactRequest(0, 'source_pack');
    const sourceRevision = revisions[revisions.length - 1];
    const sourceAccepted = await readJson(acceptedPath(runDirectory, sourceRevision, 'source_pack'));
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
      let artifact = await readJsonIfPresent(acceptedPath(runDirectory, sourceRevision, typedStage));
      if (!artifact) {
        const candidate = await stagedArtifact(runDirectory, typedStage, sourceRevision);
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
        await promoteArtifact(runDirectory, sourceRevision, typedStage, candidate.value);
        if (candidateObligations) await atomicWriteJson(
          obligationsPath(runDirectory, sourceRevision), candidateObligations
        );
        artifact = await readJson(acceptedPath(runDirectory, sourceRevision, typedStage));
        const digests = await acceptedDigests(runDirectory, sourceRevision);
        await writeCheckpoint(runDirectory, checkpoint(
          sourceRevision, typedStage, sourcePack, null, digests
        ));
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
    await atomicWriteJson(obligationsPath(runDirectory, sourceRevision), derived.artifact);

    let caseArtifact = await readJsonIfPresent(acceptedPath(runDirectory, sourceRevision, 'case_drafts'));
    let caseFromStaging = false;
    if (!caseArtifact) {
      const candidate = await stagedArtifact(runDirectory, 'case_drafts', sourceRevision);
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
      caseArtifact = { value: candidate.value, digest: digest(candidate.value), text: '' };
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
    const clarification = await clarificationInput(runDirectory, sourceRevision, sourcePack);
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
    if (caseFromStaging) await promoteArtifact(
      runDirectory, sourceRevision, 'case_drafts', caseArtifact.value
    );
    const clarificationState = /** @type {Record<string, unknown>} */ (result.clarification_state);
    await atomicWriteJson(
      clarificationStatePath(runDirectory, sourceRevision), clarificationState
    );
    const digests = await acceptedDigests(runDirectory, sourceRevision);
    if (result.status === 'need_user_answers') {
      await writeCheckpoint(runDirectory, checkpoint(
        sourceRevision, 'verification', sourcePack, clarificationState, digests
      ));
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
    const paths = await writeFinalOutput(
      runDirectory, sourceRevision, result.bundle, result.markdown
    );
    digests.test_bundle = result.bundle_digest;
    await writeCheckpoint(runDirectory, checkpoint(
      sourceRevision, 'finished', sourcePack, clarificationState, digests
    ));
    const current = {
      source_revision: sourceRevision,
      bundle_path: paths.bundle,
      bundle_digest: result.bundle_digest,
      markdown_path: paths.markdown
    };
    await atomicWriteJson(outputPaths(runDirectory, sourceRevision).current, current);
    return { status: 'finished', ...current };
  } catch (error) {
    return fatalReply('RUN_INTEGRITY_ERROR', errorMessage(error));
  }
}
