import { createHash, randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import runInstanceSchema from '../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import {
  RunStoreIntegrityError,
  acquireRunLock,
  atomicWriteJson,
  atomicWriteText,
  readJsonIfPresent,
  readTextIfPresent,
  revisionName
} from './run-store.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { validateRevisionArtifactsV4 } from './revision-artifact-validation-v4.mjs';
import { assertSemanticBundleDeliveryGateV4 } from './semantic-delivery-gate-v4.mjs';
import {
  LEGACY_V4_CONTRACT, isGeneralQualityV4Contract, isV4SchemaVersion,
  requireV4Contract, v4ContractForIdentity
} from './v4-contract.mjs';

const VERSION = '4.0.0';
const COMPILER_VERSION = '0.5.0';
const SHA256 = /^sha256:[0-9a-f]{64}$/u;
const RUN_ID = /^RUN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

const BASE_ARTIFACTS = Object.freeze([
  'source_pack', 'decision_journal', 'evidence_claims', 'fact_ledger',
  'scope_manifest', 'clarification_state', 'checkpoint'
]);
const POST_CASE_ARTIFACTS = Object.freeze([
  ...BASE_ARTIFACTS, 'behavior_views', 'test_obligations', 'case_drafts'
]);
const FINAL_ARTIFACTS = Object.freeze([
  ...POST_CASE_ARTIFACTS, 'bundle', 'markdown', 'worksheet', 'manifest'
]);
const CANDIDATE_FINAL_ARTIFACTS = Object.freeze([
  ...POST_CASE_ARTIFACTS, 'bundle', 'markdown', 'worksheet',
  'html', 'table', 'source_reading', 'manifest'
]);
const LEGACY_PROFILE_ARTIFACTS = Object.freeze({
  pre_case_pending: BASE_ARTIFACTS,
  post_case_pending: POST_CASE_ARTIFACTS,
  final: FINAL_ARTIFACTS
});

/** @param {string} schemaVersion */
function profileArtifacts(schemaVersion) {
  return ['4.2.0', '4.3.0'].includes(schemaVersion) ? {
    pre_case_pending: BASE_ARTIFACTS,
    post_case_pending: POST_CASE_ARTIFACTS,
    final: CANDIDATE_FINAL_ARTIFACTS
  } : LEGACY_PROFILE_ARTIFACTS;
}
const PROFILE_RANK = Object.freeze({
  pre_case_pending: 0,
  post_case_pending: 1,
  final: 2
});
const PROMOTION_MUTABLE_ARTIFACTS = Object.freeze(['clarification_state', 'checkpoint']);
const PHASES = Object.freeze([
  'reserved', 'artifacts_committed', 'checkpoint_committed',
  'delivery_committed', 'complete', 'aborted'
]);

/** @param {string|Uint8Array} value */
function exactDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** @param {unknown} value */
function canonicalDigest(value) {
  return exactDigest(canonicalStringify(value));
}

/** Canonical key insertion order also makes the in-memory replay byte-stable. @param {any} value */
function canonicalClone(value) {
  return JSON.parse(canonicalStringify(value));
}

/** @param {unknown} value @param {string} code */
function requireRunInstanceSchema(value, code) {
  if (validateAgainstSchema(value, runInstanceSchema).length) throw new RunStoreIntegrityError(code);
  return /** @type {Record<string, any>} */ (value);
}

/** @param {unknown} value @param {string} code */
function requireRecord(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return /** @type {Record<string, any>} */ (value);
}

/** @param {unknown} value @param {string} code */
function requireNonEmptyString(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(code);
  return value;
}

/** @param {unknown} value @param {string} code */
function requireDigest(value, code) {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new TypeError(code);
  return value;
}

/** @param {unknown} ownership */
function requireHeldLock(ownership) {
  if (typeof ownership !== 'function'
    || typeof /** @type {any} */ (ownership).assertHealthy !== 'function') {
    throw new TypeError('RUN_LOCK_OWNERSHIP_REQUIRED');
  }
  /** @type {any} */ (ownership).assertHealthy();
  return /** @type {(()=>Promise<void>) & {assertHealthy:()=>void}} */ (ownership);
}

/** @param {unknown} entry @returns {string} */
function artifactText(entry) {
  const value = requireRecord(entry, 'REVISION_ARTIFACT_INVALID');
  const keys = Object.keys(value).sort();
  if (value.format === 'json' && keys.length === 2 && keys[0] === 'format' && keys[1] === 'value') {
    return `${canonicalStringify(value.value)}\n`;
  }
  if (value.format === 'text' && keys.length === 2 && keys[0] === 'format' && keys[1] === 'text'
    && typeof value.text === 'string') return value.text;
  throw new TypeError('REVISION_ARTIFACT_INVALID');
}

/** @param {string} runDirectory @param {number} revision @param {string} key */
function artifactPath(runDirectory, revision, key) {
  const name = revisionName(revision);
  const paths = {
    source_pack: path.join(runDirectory, 'accepted', name, 'source-pack.json'),
    decision_journal: path.join(runDirectory, 'derived', name, 'decision-journal.json'),
    evidence_claims: path.join(runDirectory, 'accepted', name, 'evidence-claims.json'),
    fact_ledger: path.join(runDirectory, 'derived', name, 'fact-ledger.json'),
    scope_manifest: path.join(runDirectory, 'derived', name, 'scope-manifest.json'),
    clarification_state: path.join(runDirectory, 'derived', name, 'clarification-state.json'),
    checkpoint: path.join(runDirectory, 'derived', name, 'checkpoint.json'),
    behavior_views: path.join(runDirectory, 'accepted', name, 'behavior-views.json'),
    test_obligations: path.join(runDirectory, 'derived', name, 'test-obligations.json'),
    case_drafts: path.join(runDirectory, 'accepted', name, 'case-drafts.json'),
    bundle: path.join(runDirectory, 'output', name, 'test-bundle.json'),
    markdown: path.join(runDirectory, 'output', name, 'test-cases.md'),
    worksheet: path.join(runDirectory, 'output', name, 'execution-worksheet.csv'),
    html: path.join(runDirectory, 'output', name, 'test-cases.html'),
    table: path.join(runDirectory, 'output', name, 'case-table.txt'),
    source_reading: path.join(runDirectory, 'output', name, 'source-reading.json'),
    manifest: path.join(runDirectory, 'output', name, 'manifest.json')
  };
  const target = /** @type {Record<string,string>} */ (paths)[key];
  if (!target) throw new TypeError('REVISION_ARTIFACT_UNKNOWN');
  return target;
}

/** @param {string} runDirectory */
const pendingPath = (runDirectory) => path.join(runDirectory, 'staging', 'pending-revision.json');
/** @param {string} runDirectory @param {string} transactionId */
const transactionPath = (runDirectory, transactionId) =>
  path.join(runDirectory, 'transactions', 'revisions', `${transactionId}.json`);
/** @param {string} runDirectory @param {string} appendKey */
const appendReceiptPath = (runDirectory, appendKey) =>
  path.join(runDirectory, 'transactions', 'appends', `${appendKey}.json`);
/** @param {string} runDirectory @param {number} revision */
const committedRecordPath = (runDirectory, revision) =>
  path.join(runDirectory, 'transactions', 'committed', `${revisionName(revision)}.json`);
/** @param {string} runDirectory @param {string} transactionId @param {string} key */
const promotionBackupPath = (runDirectory, transactionId, key) =>
  path.join(runDirectory, 'transactions', 'revision-backups', transactionId, `${key}.txt`);
/** @param {string} runDirectory @param {string} transactionId */
const promotionBackupDirectory = (runDirectory, transactionId) =>
  path.join(runDirectory, 'transactions', 'revision-backups', transactionId);

/** @param {string} runDirectory */
async function readV4RunInstance(runDirectory) {
  const snapshot = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'run-instance.json'));
  const value = snapshot?.value;
  if (!value || !isV4SchemaVersion(value.schema_version)) {
    throw new RunStoreIntegrityError('V4_RUN_INSTANCE_REQUIRED');
  }
  return requireRunInstanceSchema(value, 'V4_RUN_INSTANCE_REQUIRED');
}

/** @param {string} runDirectory @param {string} directory */
async function hasDurableEntries(runDirectory, directory) {
  try {
    return (await readdir(path.join(runDirectory, directory))).length > 0;
  } catch (error) {
    if (error && typeof error === 'object' && /** @type {{code?:unknown}} */ (error).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Create or adopt the immutable identity while the caller already owns the
 * run lock. This is the entry point used by advanceStrictV4Locked; calling
 * the lock-owning wrapper from there would deadlock on the non-reentrant lock.
 * The legacy bootstrap may be adopted only before any durable v3 revision.
 * @param {string} runDirectory
 * @param {{delivery_intent:'case_document'|'execution_plan',run_id?:string,lineage?:unknown,contract?:unknown}} input
 * @param {unknown} ownership token returned by acquireRunLock(runDirectory)
 */
export async function ensureV4RunInstanceWithHeldLock(runDirectory, input, ownership) {
  const heldLock = requireHeldLock(ownership);
  try {
    const requested = requireRecord(input, 'V4_RUN_INSTANCE_INPUT_INVALID');
    const requestedContract = requested.contract === undefined
      ? LEGACY_V4_CONTRACT : requireV4Contract(requested.contract);
    if (!['case_document', 'execution_plan'].includes(requested.delivery_intent)) {
      throw new TypeError('V4_DELIVERY_INTENT_INVALID');
    }
    if (requested.run_id !== undefined && !RUN_ID.test(String(requested.run_id))) {
      throw new TypeError('V4_RUN_ID_INVALID');
    }
    const target = path.join(runDirectory, 'run-instance.json');
    const existing = await readJsonIfPresent(runDirectory, target);
    if (existing) {
      const value = existing.value;
      if (value?.schema_version === '3.0.0') {
        if (validateAgainstSchema(value, runInstanceSchema).length
          || (requested.run_id !== undefined && requested.run_id !== value.run_instance_id)
          || await readTextIfPresent(runDirectory, path.join(runDirectory, 'checkpoint.json')) !== null
          || await hasDurableEntries(runDirectory, 'accepted')
          || await hasDurableEntries(runDirectory, 'derived')
          || await hasDurableEntries(runDirectory, 'output')) {
          throw new RunStoreIntegrityError('V3_BOOTSTRAP_NOT_ADOPTABLE');
        }
        const adopted = {
          schema_version: VERSION, compiler_version: COMPILER_VERSION,
          run_id: value.run_instance_id, delivery_intent: requested.delivery_intent,
          created_at: value.created_at,
          lineage: Object.hasOwn(requested, 'lineage') ? structuredClone(requested.lineage) : null
        };
        requireRunInstanceSchema(adopted, 'IMMUTABLE_V4_RUN_INSTANCE_INVALID');
        await atomicWriteJson(runDirectory, target, adopted);
        return adopted;
      }
      requireRunInstanceSchema(value, 'IMMUTABLE_V4_RUN_INSTANCE_INVALID');
      if (value.delivery_intent !== requested.delivery_intent
        || (requested.run_id !== undefined && value.run_id !== requested.run_id)
        || (requested.contract !== undefined
          && (value.schema_version !== requestedContract.schema_version
            || value.compiler_version !== requestedContract.compiler_version))
        || (Object.hasOwn(requested, 'lineage')
          && canonicalStringify(value.lineage) !== canonicalStringify(requested.lineage))) {
        throw new RunStoreIntegrityError('RUN_INSTANCE_BINDING_CONFLICT');
      }
      return value;
    }
    const value = {
      schema_version: requestedContract.schema_version,
      compiler_version: requestedContract.compiler_version,
      run_id: requested.run_id ?? `RUN-${randomUUID()}`,
      delivery_intent: requested.delivery_intent,
      created_at: new Date().toISOString(),
      lineage: Object.hasOwn(requested, 'lineage') ? structuredClone(requested.lineage) : null
    };
    requireRunInstanceSchema(value, 'IMMUTABLE_V4_RUN_INSTANCE_INVALID');
    await atomicWriteJson(runDirectory, target, value);
    return value;
  } finally {
    heldLock.assertHealthy();
  }
}

/**
 * Lock-owning convenience wrapper for callers outside advanceStrict.
 * @param {string} runDirectory
 * @param {{delivery_intent:'case_document'|'execution_plan',run_id?:string,lineage?:unknown,contract?:unknown}} input
 */
export async function ensureV4RunInstance(runDirectory, input) {
  const release = await acquireRunLock(runDirectory);
  try {
    return await ensureV4RunInstanceWithHeldLock(runDirectory, input, release);
  } finally {
    await release();
  }
}

/** @param {unknown} submitted @param {Record<string,any>} run */
function normalizeRequest(submitted, run) {
  const runId = run.run_id;
  const contract = requireV4Contract(run);
  const request = requireRecord(submitted, 'REVISION_REQUEST_INVALID');
  const appendId = requireNonEmptyString(request.append_id, 'APPEND_ID_INVALID');
  const appendDigest = requireDigest(request.append_digest, 'APPEND_DIGEST_INVALID');
  const semanticDigest = requireDigest(request.semantic_digest, 'SEMANTIC_DIGEST_INVALID');
  const profile = requireNonEmptyString(request.commit_profile, 'REVISION_PROFILE_INVALID');
  const required = /** @type {readonly string[]|undefined} */ (
    /** @type {Record<string,readonly string[]>} */ (profileArtifacts(contract.schema_version))[profile]
  );
  if (!required) throw new TypeError('REVISION_PROFILE_INVALID');
  const baseRevision = request.base_revision;
  if (baseRevision !== null && (!Number.isSafeInteger(baseRevision) || baseRevision < 0)) {
    throw new TypeError('BASE_REVISION_INVALID');
  }
  const candidateRevision = request.candidate_revision;
  const createsRevision = candidateRevision === (baseRevision === null ? 0 : baseRevision + 1);
  const promotesProfile = baseRevision !== null && candidateRevision === baseRevision;
  if (!Number.isSafeInteger(candidateRevision) || candidateRevision < 0
    || (!createsRevision && !promotesProfile)) {
    throw new TypeError('CANDIDATE_REVISION_INVALID');
  }
  const artifacts = requireRecord(request.artifacts, 'REVISION_ARTIFACTS_INVALID');
  const actualKeys = Object.keys(artifacts).sort();
  const expectedKeys = [...required].sort();
  if (canonicalStringify(actualKeys) !== canonicalStringify(expectedKeys)) {
    throw new TypeError('REVISION_PROFILE_INCOMPLETE');
  }
  /** @type {Record<string,string>} */
  const texts = {};
  /** @type {Record<string,string>} */
  const artifactDigests = {};
  for (const key of required) {
    const entry = requireRecord(artifacts[key], 'REVISION_ARTIFACT_SCHEMA_INVALID');
    const expectedFormat = ['markdown', 'worksheet', 'html', 'table'].includes(key) ? 'text' : 'json';
    if (entry.format !== expectedFormat) throw new TypeError('REVISION_ARTIFACT_SCHEMA_INVALID');
    texts[key] = artifactText(artifacts[key]);
    artifactDigests[key] = exactDigest(texts[key]);
  }
  let checkpoint;
  try { checkpoint = JSON.parse(texts.checkpoint); } catch { throw new TypeError('CHECKPOINT_INVALID'); }
  if (!checkpoint || checkpoint.schema_version !== contract.schema_version
    || checkpoint.compiler_version !== contract.compiler_version
    || checkpoint.run_id !== runId || checkpoint.revision !== candidateRevision
    || checkpoint.commit_profile !== profile) throw new TypeError('CHECKPOINT_BINDING_INVALID');
  let sourcePack;
  try { sourcePack = JSON.parse(texts.source_pack); } catch { throw new TypeError('SOURCE_PACK_INVALID'); }
  if (!sourcePack || sourcePack.schema_version !== contract.schema_version || sourcePack.run_instance_id !== runId
    || sourcePack.source_revision !== candidateRevision) throw new TypeError('SOURCE_PACK_BINDING_INVALID');
  const values = validateRevisionArtifactsV4({
    profile: /** @type {'pre_case_pending'|'post_case_pending'|'final'} */ (profile),
    revision: candidateRevision, run_id: runId, texts
  });
  if (profile === 'final') validateManifest(texts, candidateRevision, run);
  const appendKey = createHash('sha256').update(appendId).digest('hex');
  const transactionId = `TXN-${createHash('sha256').update(
    `${appendId}\0${appendDigest}\0${baseRevision === null ? 'null' : baseRevision}\0${candidateRevision}`
  ).digest('hex')}`;
  const candidateDigest = canonicalDigest({
    base_revision: baseRevision, candidate_revision: candidateRevision,
    commit_profile: profile, semantic_digest: semanticDigest, artifact_digests: artifactDigests
  });
  return {
    schema_version: contract.schema_version,
    compiler_version: contract.compiler_version,
    append_id: appendId, append_digest: appendDigest, append_key: appendKey,
    base_revision: baseRevision, candidate_revision: candidateRevision,
    commit_mode: promotesProfile ? 'profile_promotion' : 'new_revision',
    commit_profile: profile, semantic_digest: semanticDigest,
    artifacts: texts, artifact_digests: artifactDigests,
    artifact_values: values,
    candidate_digest: candidateDigest, txn_id: transactionId,
    repair_pending: request.repair_pending === true
  };
}

/** @param {Record<string,string>} texts @param {number} revision @param {Record<string,any>} run */
function validateManifest(texts, revision, run) {
  const contract = requireV4Contract(run);
  let manifest;
  try { manifest = JSON.parse(texts.manifest); } catch { throw new TypeError('CANONICAL_MANIFEST_INVALID'); }
  if (!manifest || manifest.schema_version !== contract.schema_version
    || manifest.compiler_version !== contract.compiler_version
    || manifest.run_id !== run.run_id || manifest.revision !== revision || manifest.authority !== 'canonical') {
    throw new TypeError('CANONICAL_MANIFEST_INVALID');
  }
  const expected = {
    bundle: { path: `output/${revisionName(revision)}/test-bundle.json`, digest: exactDigest(texts.bundle) },
    markdown: { path: `output/${revisionName(revision)}/test-cases.md`, digest: exactDigest(texts.markdown) },
    execution_worksheet: {
      path: `output/${revisionName(revision)}/execution-worksheet.csv`, digest: exactDigest(texts.worksheet),
      format: 'csv'
    },
    ...(contract.candidate ? {
      html: { path: `output/${revisionName(revision)}/test-cases.html`, digest: exactDigest(texts.html), format: 'html' },
      chat_table: { path: `output/${revisionName(revision)}/case-table.txt`, digest: exactDigest(texts.table), format: 'commonmark-table' },
      source_reading: { path: `output/${revisionName(revision)}/source-reading.json`, digest: exactDigest(texts.source_reading), format: 'json' }
    } : {})
  };
  for (const [key, value] of Object.entries(expected)) {
    if (canonicalStringify(manifest[key]) !== canonicalStringify(value)) {
      throw new TypeError('CANONICAL_MANIFEST_ARTIFACT_MISMATCH');
    }
  }
}

/** @param {string} runDirectory */
async function committedCheckpoint(runDirectory) {
  const snapshot = await readJsonIfPresent(runDirectory, path.join(runDirectory, 'checkpoint.json'));
  if (!snapshot) return null;
  const value = snapshot.value;
  if (!value || !v4ContractForIdentity(value)
    || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new RunStoreIntegrityError('COMMITTED_CHECKPOINT_INVALID');
  }
  return { ...snapshot, revision: value.revision };
}

/** @param {Record<string,any>} run */
function genesisCheckpointText(run) {
  const contract = requireV4Contract(run);
  return `${canonicalStringify({
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    run_id: run.run_id, genesis: true
  })}\n`;
}

/** @param {string} profile */
function profileRank(profile) {
  const rank = /** @type {Record<string,number>} */ (PROFILE_RANK)[profile];
  if (!Number.isSafeInteger(rank)) throw new RunStoreIntegrityError('COMMITTED_REVISION_RECORD_INVALID');
  return rank;
}

/** @param {string} runDirectory @param {number} revision */
async function readCommittedRecord(runDirectory, revision) {
  const snapshot = await readJsonIfPresent(
    runDirectory, committedRecordPath(runDirectory, revision)
  );
  const value = snapshot?.value;
  if (!value || !isV4SchemaVersion(value.schema_version) || value.revision !== revision
    || typeof value.txn_id !== 'string' || typeof value.semantic_digest !== 'string'
    || typeof value.checkpoint_digest !== 'string' || !value.artifact_digests
    || typeof value.artifact_digests !== 'object' || Array.isArray(value.artifact_digests)) {
    throw new RunStoreIntegrityError('COMMITTED_REVISION_RECORD_INVALID');
  }
  profileRank(value.commit_profile);
  return /** @type {Record<string,any>} */ (value);
}

/** @param {string} runDirectory @param {any} record */
async function verifyCommittedArtifacts(runDirectory, record) {
  const required = /** @type {Record<string,readonly string[]>} */ (
    profileArtifacts(record.schema_version)
  )[record.commit_profile];
  for (const key of required) {
    const text = await readTextIfPresent(
      runDirectory, artifactPath(runDirectory, record.revision, key)
    );
    if (text === null || exactDigest(text) !== record.artifact_digests[key]) {
      throw new RunStoreIntegrityError('COMMITTED_REVISION_ARTIFACT_INVALID');
    }
  }
}

/** Validate a new transaction against the currently committed checkpoint.
 * @param {string} runDirectory @param {any} run @param {any} request */
async function validateFreshBase(runDirectory, run, request) {
  const checkpoint = await committedCheckpoint(runDirectory);
  const actualBase = checkpoint?.revision ?? null;
  if (actualBase !== request.base_revision) throw new RunStoreIntegrityError('BASE_REVISION_STALE');
  const expectedBaseText = request.base_revision === null
    ? genesisCheckpointText(run) : checkpoint?.text;
  if (typeof expectedBaseText !== 'string'
    || request.artifact_values.checkpoint.base_checkpoint_digest !== exactDigest(expectedBaseText)) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }
  if (request.base_revision === null) return { checkpoint: null, prior: null };
  if (!checkpoint) throw new RunStoreIntegrityError('BASE_REVISION_STALE');
  const prior = await readCommittedRecord(runDirectory, request.base_revision);
  if (prior.checkpoint_digest !== exactDigest(checkpoint.text)
    || checkpoint.value.commit_profile !== prior.commit_profile) {
    throw new RunStoreIntegrityError('COMMITTED_REVISION_RECORD_INVALID');
  }
  await verifyCommittedArtifacts(runDirectory, prior);
  return { checkpoint, prior };
}

/** A replay may observe either side of the checkpoint rename. The pending
 * transaction is the durable witness that makes both states recoverable.
 * @param {string} runDirectory @param {any} run @param {any} request @param {any} pending */
async function validatePendingBase(runDirectory, run, request, pending) {
  const checkpoint = await committedCheckpoint(runDirectory);
  const candidateText = request.artifacts.checkpoint;
  if (checkpoint?.text === candidateText) return;
  if (!['reserved', 'artifacts_committed'].includes(pending.phase)) {
    throw new RunStoreIntegrityError('COMMITTED_REVISION_CHANGED');
  }
  const expectedBaseText = request.base_revision === null
    ? genesisCheckpointText(run) : checkpoint?.text;
  if (request.base_revision !== null && checkpoint?.revision !== request.base_revision) {
    throw new RunStoreIntegrityError('BASE_REVISION_STALE');
  }
  if (request.base_revision === null && checkpoint !== null) {
    throw new RunStoreIntegrityError('BASE_REVISION_STALE');
  }
  if (typeof expectedBaseText !== 'string'
    || request.artifact_values.checkpoint.base_checkpoint_digest !== exactDigest(expectedBaseText)) {
    throw new TypeError('REVISION_ARTIFACT_RELATION_INVALID');
  }
}

/** @param {any} request @param {any} prior */
function validateProfilePromotion(request, prior) {
  if (request.commit_mode !== 'profile_promotion') return;
  if (profileRank(request.commit_profile) <= profileRank(prior.commit_profile)
    || request.semantic_digest !== prior.semantic_digest) {
    throw new RunStoreIntegrityError('REVISION_PROFILE_PROMOTION_INVALID');
  }
  const mutable = new Set(PROMOTION_MUTABLE_ARTIFACTS);
  const inherited = /** @type {Record<string,readonly string[]>} */ (
    profileArtifacts(prior.schema_version)
  )[prior.commit_profile];
  for (const key of inherited) {
    if (!mutable.has(key) && request.artifact_digests[key] !== prior.artifact_digests[key]) {
      throw new RunStoreIntegrityError('REVISION_PROFILE_PROMOTION_CONTENT_CHANGED');
    }
  }
}

/** @param {string} runDirectory @param {any} request */
async function priorReceipt(runDirectory, request) {
  const snapshot = await readJsonIfPresent(runDirectory, appendReceiptPath(runDirectory, request.append_key));
  if (!snapshot) return null;
  const receipt = snapshot.value;
  if (!receipt || receipt.append_id !== request.append_id) {
    throw new RunStoreIntegrityError('APPEND_RECEIPT_IDENTITY_INVALID');
  }
  if (receipt.append_digest !== request.append_digest) throw new RunStoreIntegrityError('APPEND_DIGEST_CONFLICT');
  return receipt;
}

/** @param {string} runDirectory @param {string} target @param {string} content */
async function writeExactIfDifferent(runDirectory, target, content) {
  const existing = await readTextIfPresent(runDirectory, target);
  if (existing === content) return false;
  await atomicWriteText(runDirectory, target, content);
  return true;
}

/** @param {any} pending @param {string} phase */
function movePhase(pending, phase) {
  const current = PHASES.indexOf(pending.phase);
  const next = PHASES.indexOf(phase);
  if (current < 0 || next < 0 || next !== current + 1) {
    throw new RunStoreIntegrityError('REVISION_PHASE_TRANSITION_INVALID');
  }
  return { ...pending, phase, phase_version: pending.phase_version + 1 };
}

/** @param {Record<string,string>} artifacts */
function publicArtifactDigests(artifacts) {
  return Object.fromEntries(Object.entries(artifacts).sort(([left], [right]) => left.localeCompare(right)));
}

/** @param {any} pending */
function committedResult(pending) {
  return {
    status: 'committed', txn_id: pending.txn_id,
    append_id: pending.append_id, append_digest: pending.append_digest,
    append_key: pending.append_key, committed_revision: pending.candidate_revision,
    commit_profile: pending.commit_profile, semantic_digest: pending.semantic_digest,
    checkpoint_digest: pending.artifact_digests.checkpoint,
    delivery_manifest_digest: pending.commit_profile === 'final'
      ? pending.artifact_digests.manifest : null,
    artifact_digests: publicArtifactDigests(pending.artifact_digests)
  };
}

/** @param {string} runDirectory @param {any} pending */
async function ensurePromotionBackups(runDirectory, pending) {
  if (pending.commit_mode !== 'profile_promotion') return;
  for (const key of PROMOTION_MUTABLE_ARTIFACTS) {
    const expectedDigest = pending.previous_artifact_digests?.[key];
    if (typeof expectedDigest !== 'string') {
      throw new RunStoreIntegrityError('REVISION_PROMOTION_BACKUP_INVALID');
    }
    const backup = promotionBackupPath(runDirectory, pending.txn_id, key);
    const existingBackup = await readTextIfPresent(runDirectory, backup);
    if (existingBackup !== null) {
      if (exactDigest(existingBackup) !== expectedDigest) {
        throw new RunStoreIntegrityError('REVISION_PROMOTION_BACKUP_INVALID');
      }
      continue;
    }
    const current = await readTextIfPresent(
      runDirectory, artifactPath(runDirectory, pending.candidate_revision, key)
    );
    if (current === null || exactDigest(current) !== expectedDigest) {
      throw new RunStoreIntegrityError('COMMITTED_REVISION_ARTIFACT_INVALID');
    }
    await atomicWriteText(runDirectory, backup, current);
  }
}

/** @param {string} runDirectory @param {any} pending */
async function cleanupPromotionBackup(runDirectory, pending) {
  if (pending.commit_mode === 'profile_promotion') {
    await rm(promotionBackupDirectory(runDirectory, pending.txn_id), {
      recursive: true, force: true
    });
  }
}

/** Restore the last committed profile before recording an abort. This also
 * removes files written by a partially materialized brand-new revision.
 * @param {string} runDirectory @param {any} pending */
async function rollbackPendingArtifacts(runDirectory, pending) {
  const candidateKeys = /** @type {Record<string,readonly string[]>} */ (
    profileArtifacts(pending.schema_version)
  )[pending.commit_profile];
  if (pending.commit_mode === 'profile_promotion') {
    const inherited = new Set(
      /** @type {Record<string,readonly string[]>} */ (profileArtifacts(pending.schema_version))[pending.previous_profile]
    );
    for (const key of candidateKeys) {
      if (!inherited.has(key)) {
        await rm(artifactPath(runDirectory, pending.candidate_revision, key), { force: true });
      }
    }
    for (const key of PROMOTION_MUTABLE_ARTIFACTS) {
      const backup = await readTextIfPresent(
        runDirectory, promotionBackupPath(runDirectory, pending.txn_id, key)
      );
      if (backup !== null) {
        if (exactDigest(backup) !== pending.previous_artifact_digests[key]) {
          throw new RunStoreIntegrityError('REVISION_PROMOTION_BACKUP_INVALID');
        }
        await writeExactIfDifferent(
          runDirectory, artifactPath(runDirectory, pending.candidate_revision, key), backup
        );
        if (key === 'checkpoint') {
          await writeExactIfDifferent(runDirectory, path.join(runDirectory, 'checkpoint.json'), backup);
        }
      } else {
        const current = await readTextIfPresent(
          runDirectory, artifactPath(runDirectory, pending.candidate_revision, key)
        );
        if (current === null || exactDigest(current) !== pending.previous_artifact_digests[key]) {
          throw new RunStoreIntegrityError('REVISION_PROMOTION_BACKUP_INVALID');
        }
      }
    }
    await cleanupPromotionBackup(runDirectory, pending);
    return;
  }

  let priorCheckpointText = null;
  if (pending.base_revision !== null) {
    priorCheckpointText = await readTextIfPresent(
      runDirectory, artifactPath(runDirectory, pending.base_revision, 'checkpoint')
    );
    if (priorCheckpointText === null
      || exactDigest(priorCheckpointText) !== pending.previous_checkpoint_digest) {
      throw new RunStoreIntegrityError('COMMITTED_CHECKPOINT_INVALID');
    }
  }
  for (const key of candidateKeys) {
    await rm(artifactPath(runDirectory, pending.candidate_revision, key), { force: true });
  }
  if (priorCheckpointText === null) {
    await rm(path.join(runDirectory, 'checkpoint.json'), { force: true });
  } else {
    await writeExactIfDifferent(
      runDirectory, path.join(runDirectory, 'checkpoint.json'), priorCheckpointText
    );
  }
}

/** @param {string} runDirectory @param {any} pending @param {Record<string,string>} artifacts */
async function materializeArtifacts(runDirectory, pending, artifacts) {
  await ensurePromotionBackups(runDirectory, pending);
  const inherited = new Set(pending.commit_mode === 'profile_promotion'
    ? /** @type {Record<string,readonly string[]>} */ (profileArtifacts(pending.schema_version))[pending.previous_profile]
    : []);
  const mutable = new Set(PROMOTION_MUTABLE_ARTIFACTS);
  for (const key of /** @type {Record<string,readonly string[]>} */ (profileArtifacts(pending.schema_version))[pending.commit_profile]) {
    const target = artifactPath(runDirectory, pending.candidate_revision, key);
    if (inherited.has(key) && !mutable.has(key)) {
      const existing = await readTextIfPresent(runDirectory, target);
      if (existing === null || exactDigest(existing) !== pending.previous_artifact_digests[key]
        || existing !== artifacts[key]) {
        throw new RunStoreIntegrityError('REVISION_PROFILE_PROMOTION_CONTENT_CHANGED');
      }
      continue;
    }
    await writeExactIfDifferent(runDirectory, target, artifacts[key]);
    const actual = await readTextIfPresent(runDirectory, target);
    if (actual === null || exactDigest(actual) !== pending.artifact_digests[key]) {
      throw new RunStoreIntegrityError('REVISION_ARTIFACT_WRITE_MISMATCH');
    }
  }
}

/** @param {string} runDirectory @param {any} pending @param {Record<string,string>} artifacts */
async function commitCheckpoint(runDirectory, pending, artifacts) {
  const target = path.join(runDirectory, 'checkpoint.json');
  const existing = await readTextIfPresent(runDirectory, target);
  if (existing !== null && existing !== artifacts.checkpoint) {
    if (typeof pending.previous_checkpoint_digest !== 'string'
      || exactDigest(existing) !== pending.previous_checkpoint_digest) {
      throw new RunStoreIntegrityError('COMMITTED_REVISION_CHANGED');
    }
  } else if (existing === null && pending.base_revision !== null) {
    throw new RunStoreIntegrityError('COMMITTED_REVISION_CHANGED');
  }
  await writeExactIfDifferent(runDirectory, target, artifacts.checkpoint);
}

/** @param {string} runDirectory @param {any} pending */
async function storeCommittedRecord(runDirectory, pending) {
  const record = {
    schema_version: pending.schema_version, txn_id: pending.txn_id,
    revision: pending.candidate_revision, commit_profile: pending.commit_profile,
    semantic_digest: pending.semantic_digest,
    checkpoint_digest: pending.artifact_digests.checkpoint,
    delivery_manifest_digest: pending.commit_profile === 'final'
      ? pending.artifact_digests.manifest : null,
    artifact_digests: publicArtifactDigests(pending.artifact_digests)
  };
  const target = committedRecordPath(runDirectory, pending.candidate_revision);
  const existing = await readJsonIfPresent(runDirectory, target);
  if (existing && canonicalStringify(existing.value) !== canonicalStringify(record)) {
    if (pending.commit_mode !== 'profile_promotion'
      || existing.value.commit_profile !== pending.previous_profile
      || existing.value.semantic_digest !== pending.semantic_digest
      || canonicalStringify(existing.value.artifact_digests)
        !== canonicalStringify(pending.previous_artifact_digests)) {
      throw new RunStoreIntegrityError('COMMITTED_REVISION_RECORD_CONFLICT');
    }
    await atomicWriteJson(runDirectory, target, record);
    return;
  }
  if (!existing) await atomicWriteJson(runDirectory, target, record);
}

/** @param {any} hooks @param {string} phase */
async function phaseHook(hooks, phase) {
  if (typeof hooks?.after_phase === 'function') await hooks.after_phase(phase);
}

/**
 * Once a higher 4.3 semantic revision is ready to become the committed
 * checkpoint, an older delivered manifest is historical, not current. The
 * tombstone is itself canonical and survives retry; older contracts retain
 * their frozen publication semantics.
 * @param {string} runDirectory @param {Record<string,any>} run @param {Record<string,any>} pending
 */
async function revokeOlderGeneralQualityDelivery(runDirectory, run, pending) {
  if (!isGeneralQualityV4Contract(run) || pending.commit_mode !== 'new_revision'
    || pending.commit_profile === 'final') return;
  const target = path.join(runDirectory, 'output', 'current.json');
  const current = await readJsonIfPresent(runDirectory, target);
  if (!current) return;
  if (current.value.status === 'stale') {
    if (current.value.schema_version !== run.schema_version
      || current.value.compiler_version !== run.compiler_version
      || current.value.run_id !== run.run_id
      || !Number.isSafeInteger(current.value.active_revision)
      || current.value.active_revision > pending.candidate_revision
      || !Number.isSafeInteger(current.value.previous_ready_revision)
      || !SHA256.test(current.value.previous_ready_manifest_digest)) {
      throw new RunStoreIntegrityError('CURRENT_NON_READY_CONFLICT');
    }
    if (current.value.active_revision === pending.candidate_revision) return;
    await atomicWriteJson(runDirectory, target, {
      ...current.value, active_revision: pending.candidate_revision
    });
    return;
  }
  if (current.value.authority !== 'canonical' || current.value.run_id !== run.run_id
    || current.value.schema_version !== run.schema_version
    || current.value.compiler_version !== run.compiler_version
    || current.value.revision !== pending.base_revision) {
    throw new RunStoreIntegrityError('CURRENT_READY_BINDING_INVALID');
  }
  await atomicWriteJson(runDirectory, target, {
    status: 'stale', schema_version: run.schema_version,
    compiler_version: run.compiler_version, run_id: run.run_id,
    active_revision: pending.candidate_revision,
    reason: 'higher_revision_not_ready', previous_ready_revision: current.value.revision,
    previous_ready_manifest_digest: exactDigest(current.text)
  });
}

/**
 * Atomically publish a compiler-owned v4 revision while the caller already
 * owns the run lock. All candidate artifacts are written before the checkpoint
 * becomes visible; only final switches output/current.json.
 * @param {string} runDirectory
 * @param {unknown} submitted
 * @param {unknown} ownership token returned by acquireRunLock(runDirectory)
 * @param {{after_phase?:(phase:string)=>void|Promise<void>}} [hooks]
 */
export async function commitRevisionTransactionV4WithHeldLock(
  runDirectory, submitted, ownership, hooks = {}
) {
  const heldLock = requireHeldLock(ownership);
  try {
    const run = await readV4RunInstance(runDirectory);
    const request = normalizeRequest(submitted, run);
    const receipt = await priorReceipt(runDirectory, request);
    if (receipt) {
      const stalePending = await readJsonIfPresent(runDirectory, pendingPath(runDirectory));
      const stalePendingValue = stalePending?.value;
      if (stalePendingValue?.txn_id === receipt.txn_id) {
        await cleanupPromotionBackup(runDirectory, stalePendingValue);
        await rm(pendingPath(runDirectory), { force: true });
      }
      return canonicalClone(receipt.result);
    }

    let pendingSnapshot = await readJsonIfPresent(runDirectory, pendingPath(runDirectory));
    let pending = pendingSnapshot?.value ?? null;
    if (pending) {
      if (pending.append_id === request.append_id && pending.append_digest !== request.append_digest) {
        throw new RunStoreIntegrityError('APPEND_DIGEST_CONFLICT');
      }
      if (pending.txn_id !== request.txn_id) throw new RunStoreIntegrityError('PENDING_REVISION_EXISTS');
      if (pending.commit_mode !== request.commit_mode
        || pending.commit_profile !== request.commit_profile
        || pending.base_revision !== request.base_revision
        || pending.candidate_revision !== request.candidate_revision) {
        throw new RunStoreIntegrityError('PENDING_CANDIDATE_CONFLICT');
      }
      await validatePendingBase(runDirectory, run, request, pending);
      if (request.commit_mode === 'profile_promotion') validateProfilePromotion(request, {
        commit_profile: pending.previous_profile,
        semantic_digest: pending.previous_semantic_digest,
        artifact_digests: pending.previous_artifact_digests
      });
      if (pending.candidate_digest !== request.candidate_digest) {
        if (!request.repair_pending || pending.phase !== 'reserved') {
          throw new RunStoreIntegrityError('PENDING_CANDIDATE_CONFLICT');
        }
        pending = {
          ...pending,
          candidate_digest: request.candidate_digest,
          artifact_digests: publicArtifactDigests(request.artifact_digests),
          candidate_version: Number(pending.candidate_version ?? 1) + 1
        };
        await atomicWriteJson(runDirectory, pendingPath(runDirectory), pending);
      }
    } else {
      const base = await validateFreshBase(runDirectory, run, request);
      if (request.commit_mode === 'profile_promotion') {
        if (!base.prior) throw new RunStoreIntegrityError('REVISION_PROFILE_PROMOTION_INVALID');
        validateProfilePromotion(request, base.prior);
      } else if (base.prior?.semantic_digest === request.semantic_digest) {
          const result = {
            status: 'no_op', txn_id: request.txn_id,
            append_id: request.append_id, append_digest: request.append_digest,
            append_key: request.append_key, committed_revision: request.base_revision,
            commit_profile: base.prior.commit_profile,
            semantic_digest: base.prior.semantic_digest,
            checkpoint_digest: base.prior.checkpoint_digest,
            delivery_manifest_digest: base.prior.delivery_manifest_digest,
            artifact_digests: publicArtifactDigests(base.prior.artifact_digests)
          };
          const stableResult = canonicalClone(result);
          const completed = {
            schema_version: request.schema_version, transaction_kind: 'revision_append',
            txn_id: request.txn_id, append_id: request.append_id,
            append_digest: request.append_digest, append_key: request.append_key,
            base_revision: request.base_revision, candidate_revision: request.candidate_revision,
            commit_mode: request.commit_mode,
            commit_profile: request.commit_profile, semantic_digest: request.semantic_digest,
            candidate_digest: request.candidate_digest,
            artifact_digests: publicArtifactDigests(request.artifact_digests),
            candidate_version: 1, phase: 'complete', phase_version: 1, result: stableResult
          };
          await atomicWriteJson(runDirectory, transactionPath(runDirectory, request.txn_id), completed);
          await atomicWriteJson(runDirectory, appendReceiptPath(runDirectory, request.append_key), {
            schema_version: request.schema_version, append_id: request.append_id,
            append_digest: request.append_digest, txn_id: request.txn_id, result: stableResult
          });
          return stableResult;
      }
      pending = {
        schema_version: request.schema_version, compiler_version: request.compiler_version,
        transaction_kind: 'revision_append',
        txn_id: request.txn_id, append_id: request.append_id,
        append_digest: request.append_digest, append_key: request.append_key,
        base_revision: request.base_revision, candidate_revision: request.candidate_revision,
        commit_mode: request.commit_mode,
        commit_profile: request.commit_profile, semantic_digest: request.semantic_digest,
        candidate_digest: request.candidate_digest,
        artifact_digests: publicArtifactDigests(request.artifact_digests),
        previous_profile: base.prior?.commit_profile ?? null,
        previous_semantic_digest: base.prior?.semantic_digest ?? null,
        previous_checkpoint_digest: base.checkpoint ? exactDigest(base.checkpoint.text) : null,
        previous_artifact_digests: base.prior
          ? publicArtifactDigests(base.prior.artifact_digests) : {},
        candidate_version: 1, phase: 'reserved', phase_version: 1, result: null
      };
      await atomicWriteJson(runDirectory, pendingPath(runDirectory), pending);
      await phaseHook(hooks, 'reserved');
    }

    if (pending.phase === 'reserved') {
      await materializeArtifacts(runDirectory, pending, request.artifacts);
      pending = movePhase(pending, 'artifacts_committed');
      await atomicWriteJson(runDirectory, pendingPath(runDirectory), pending);
      await phaseHook(hooks, 'artifacts_committed');
    }
    if (pending.phase === 'artifacts_committed') {
      await materializeArtifacts(runDirectory, pending, request.artifacts);
      await revokeOlderGeneralQualityDelivery(runDirectory, run, pending);
      await commitCheckpoint(runDirectory, pending, request.artifacts);
      pending = movePhase(pending, 'checkpoint_committed');
      await atomicWriteJson(runDirectory, pendingPath(runDirectory), pending);
      await phaseHook(hooks, 'checkpoint_committed');
    }
    if (pending.phase === 'checkpoint_committed') {
      await storeCommittedRecord(runDirectory, pending);
      if (pending.commit_profile === 'final') {
        // Recovery may resume immediately before authority publication. Recheck
        // the canonical ledger here instead of trusting an earlier process's
        // in-memory result or a staged manifest.
        assertSemanticBundleDeliveryGateV4(request.artifact_values.bundle);
        await writeExactIfDifferent(
          runDirectory, path.join(runDirectory, 'output', 'current.json'), request.artifacts.manifest
        );
      }
      pending = movePhase(pending, 'delivery_committed');
      await atomicWriteJson(runDirectory, pendingPath(runDirectory), pending);
      await phaseHook(hooks, 'delivery_committed');
    }
    if (pending.phase !== 'delivery_committed') throw new RunStoreIntegrityError('REVISION_PHASE_INVALID');
    await storeCommittedRecord(runDirectory, pending);
    const result = canonicalClone(committedResult(pending));
    const complete = { ...movePhase(pending, 'complete'), result };
    await atomicWriteJson(runDirectory, transactionPath(runDirectory, pending.txn_id), complete);
    await atomicWriteJson(runDirectory, appendReceiptPath(runDirectory, pending.append_key), {
      schema_version: pending.schema_version, append_id: pending.append_id,
      append_digest: pending.append_digest, txn_id: pending.txn_id, result
    });
    await cleanupPromotionBackup(runDirectory, pending);
    await rm(pendingPath(runDirectory), { force: true });
    await phaseHook(hooks, 'complete');
    return canonicalClone(result);
  } finally {
    heldLock.assertHealthy();
  }
}

/**
 * Lock-owning convenience wrapper for callers outside advanceStrict.
 * @param {string} runDirectory
 * @param {unknown} submitted
 * @param {{after_phase?:(phase:string)=>void|Promise<void>}} [hooks]
 */
export async function commitRevisionTransactionV4(runDirectory, submitted, hooks = {}) {
  const release = await acquireRunLock(runDirectory);
  try {
    return await commitRevisionTransactionV4WithHeldLock(runDirectory, submitted, release, hooks);
  } finally {
    await release();
  }
}

/**
 * Abort a candidate while the caller holds the run lock and the committed
 * checkpoint still names its base.
 * @param {string} runDirectory
 * @param {{append_id:string,append_digest:string}} identity
 * @param {unknown} ownership token returned by acquireRunLock(runDirectory)
 */
export async function abortPendingRevisionV4WithHeldLock(runDirectory, identity, ownership) {
  const heldLock = requireHeldLock(ownership);
  try {
    const submitted = requireRecord(identity, 'APPEND_IDENTITY_INVALID');
    const appendId = requireNonEmptyString(submitted.append_id, 'APPEND_ID_INVALID');
    const appendDigest = requireDigest(submitted.append_digest, 'APPEND_DIGEST_INVALID');
    const snapshot = await readJsonIfPresent(runDirectory, pendingPath(runDirectory));
    if (!snapshot) {
      const appendKey = createHash('sha256').update(appendId).digest('hex');
      const receipt = await readJsonIfPresent(runDirectory, appendReceiptPath(runDirectory, appendKey));
      if (!receipt) throw new RunStoreIntegrityError('PENDING_REVISION_NOT_FOUND');
      if (receipt.value.append_id !== appendId) {
        throw new RunStoreIntegrityError('APPEND_RECEIPT_IDENTITY_INVALID');
      }
      if (receipt.value.append_digest !== appendDigest) {
        throw new RunStoreIntegrityError('APPEND_DIGEST_CONFLICT');
      }
      if (receipt.value.result?.status !== 'aborted') {
        throw new RunStoreIntegrityError('REVISION_ALREADY_COMMITTED');
      }
      return canonicalClone(receipt.value.result);
    }
    const pending = snapshot.value;
    if (pending.append_id !== appendId) throw new RunStoreIntegrityError('PENDING_REVISION_ID_CONFLICT');
    if (pending.append_digest !== appendDigest) throw new RunStoreIntegrityError('APPEND_DIGEST_CONFLICT');
    if (!['reserved', 'artifacts_committed'].includes(pending.phase)) {
      throw new RunStoreIntegrityError('REVISION_ALREADY_COMMITTED');
    }
    const checkpoint = await committedCheckpoint(runDirectory);
    const checkpointDigest = checkpoint ? exactDigest(checkpoint.text) : null;
    const priorVisible = checkpointDigest === pending.previous_checkpoint_digest
      && (checkpoint?.revision ?? null) === pending.base_revision;
    const candidateVisible = checkpointDigest === pending.artifact_digests.checkpoint
      && checkpoint?.revision === pending.candidate_revision;
    if (!priorVisible && !candidateVisible
      && !(pending.base_revision === null && checkpoint === null)) {
      throw new RunStoreIntegrityError('REVISION_ALREADY_COMMITTED');
    }
    await rollbackPendingArtifacts(runDirectory, pending);
    const result = {
      status: 'aborted', txn_id: pending.txn_id,
      append_id: pending.append_id, append_digest: pending.append_digest,
      append_key: pending.append_key, committed_revision: pending.base_revision,
      candidate_revision: pending.candidate_revision
    };
    const aborted = {
      ...pending, phase: 'aborted', phase_version: pending.phase_version + 1, result
    };
    await atomicWriteJson(runDirectory, transactionPath(runDirectory, pending.txn_id), aborted);
    await atomicWriteJson(runDirectory, appendReceiptPath(runDirectory, pending.append_key), {
      schema_version: pending.schema_version, append_id: pending.append_id,
      append_digest: pending.append_digest, txn_id: pending.txn_id, result
    });
    await rm(pendingPath(runDirectory), { force: true });
    return result;
  } finally {
    heldLock.assertHealthy();
  }
}

/**
 * Lock-owning convenience wrapper for callers outside advanceStrict.
 * @param {string} runDirectory
 * @param {{append_id:string,append_digest:string}} identity
 */
export async function abortPendingRevisionV4(runDirectory, identity) {
  const release = await acquireRunLock(runDirectory);
  try {
    return await abortPendingRevisionV4WithHeldLock(runDirectory, identity, release);
  } finally {
    await release();
  }
}

/** @param {string} runDirectory @param {string} transactionId */
export async function readRevisionTransactionV4(runDirectory, transactionId) {
  const id = requireNonEmptyString(transactionId, 'REVISION_TRANSACTION_ID_INVALID');
  if (!/^TXN-[0-9a-f]{64}$/u.test(id)) throw new TypeError('REVISION_TRANSACTION_ID_INVALID');
  const snapshot = await readJsonIfPresent(runDirectory, transactionPath(runDirectory, id));
  return snapshot?.value ?? null;
}

/** @param {string} runDirectory @param {number} revision @param {string} key */
export function revisionArtifactPathV4(runDirectory, revision, key) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('REVISION_INVALID');
  return artifactPath(runDirectory, revision, key);
}
