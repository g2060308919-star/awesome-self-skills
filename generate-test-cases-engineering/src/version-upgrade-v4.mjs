import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
const { lstat, realpath } = /** @type {any} */ (await import('node:fs/promises'));
import path from 'node:path';
import runInstanceSchema from '../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with { type: 'json' };
import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import currentPointerSchema from '../skill/generate-test-cases/scripts/schemas/current-pointer.schema.json' with { type: 'json' };
import { refreshVersionUpgradePresentationV4 } from './clarification-v4.mjs';
import { canonicalStringify, digest } from './canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { validateV4SourcePackBeforeStaging } from './source-preparation-v4.mjs';
import { validateDecisionRecords } from './decision-record.mjs';
import { revisionArtifactPathV4, ensureV4RunInstance } from './revision-transaction-v4.mjs';
import { validateRevisionArtifactsV4 } from './revision-artifact-validation-v4.mjs';
import { latestV4Contract, v4ContractForIdentity } from './v4-contract.mjs';
import { loadSourceAcquisitionCompilerStateV4, replaySourceAcquisitionStopV4 } from './source-acquisition-v4.mjs';
import { sourceRuntimeRegistryVersionV4 } from './source-runtime-registry-v4.mjs';
import { bindV4PrdCollectionObservation, loadV4SourceReadingSummary } from './prd-source-collection-v4.mjs';
import { acquireRunLock, atomicWriteJson, atomicWriteText, readJsonIfPresent, readTextIfPresent,
  revisionName, RunStoreIntegrityError } from './run-store.mjs';

const RUN_ID = /^RUN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const PHASES = ['reserved', 'identity_created', 'materials_staged', 'complete'];
const BASE = ['source_pack', 'decision_journal', 'evidence_claims', 'fact_ledger', 'scope_manifest', 'clarification_state', 'checkpoint'];
/** Published history is decoded and verified; generation always uses latestV4Contract. */
export const V4_UPGRADE_SUPPORT_MATRIX = Object.freeze([
  ['4.0.0', '0.5.0'], ['4.2.0', '0.7.0'], ['4.3.0', '0.8.0'], ['4.3.1', '0.8.1'], ['4.3.2', '0.8.2']
].map(([schema_version, compiler_version]) => Object.freeze({ schema_version, compiler_version,
  history: 'exact_bytes_and_versioned_artifact_relations', generation: 'latest_recompile',
  sources: 'reuse_verified_collection_or_reacquire', answers: 'prove_final_else_reask' })));
/** @param {string|Uint8Array} value */
const byteDigest = value => `sha256:${createHash('sha256').update(value).digest('hex')}`;
/** @param {unknown} value */
const valueDigest = value => `sha256:${digest(value)}`;
/** @param {unknown} left @param {unknown} right */
const same = (left, right) => canonicalStringify(left) === canonicalStringify(right);
/** @param {string} code @returns {never} */
function fail(code) { throw new RunStoreIntegrityError(code); }
/** @param {string} root @param {string} target */
async function realDirectory(root, target) {
  const stat = await lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(target) !== target
    || (target !== root && !target.startsWith(root + path.sep))) fail('UPGRADE_DIRECTORY_INVALID');
}
/** @param {string} root @param {string} prefix @returns {Promise<Array<{path:string,digest:string}>>} */
async function byteSnapshot(root, prefix = '') {
  const rows = [];
  for (const entry of (await readdir(path.join(root, prefix), { withFileTypes: true })).sort((/** @type {any} */ a, /** @type {any} */ b) => a.name < b.name ? -1 : 1)) {
    if (!prefix && entry.name === '.compiler-advance.lock') continue;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) fail('UPGRADE_HISTORY_PATH_INVALID');
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) rows.push(...await byteSnapshot(root, relative));
    else rows.push({ path: relative, digest: byteDigest(await readFile(path.join(root, relative))) });
  }
  return rows;
}
/** @param {string} directory @param {string} relative */
async function json(directory, relative) {
  try { return (await readJsonIfPresent(directory, path.join(directory, relative)))?.value ?? null; }
  catch { return fail('UPGRADE_HISTORY_JSON_INVALID'); }
}
/** @param {any} transaction */
function transactionResult(transaction) {
  return { status: 'committed', txn_id: transaction.txn_id,
    append_id: transaction.append_id, append_digest: transaction.append_digest, append_key: transaction.append_key,
    committed_revision: transaction.candidate_revision, commit_profile: transaction.commit_profile,
    semantic_digest: transaction.semantic_digest, checkpoint_digest: transaction.artifact_digests.checkpoint,
    delivery_manifest_digest: transaction.commit_profile === 'final' ? transaction.artifact_digests.manifest : null,
    artifact_digests: transaction.artifact_digests };
}
/** Validate the immutable transaction lineage, including overwritten same-revision
 * promotion checkpoints whose exact digests remain in completed journals.
 * @param {any[]} transactions @param {any} contract */
function verifyHistoryTransactions(transactions, contract) {
  const ranks = /** @type {Record<string,number>} */ ({ pre_case_pending: 0, post_case_pending: 1, final: 2 });
  const verified = new Set();
  const visiting = new Set();
  const hash = (/** @type {string} */ value) => byteDigest(value).slice(7);
  const check = (/** @type {any} */ transaction) => {
    if (verified.has(transaction.txn_id)) return;
    if (visiting.has(transaction.txn_id)) fail('UPGRADE_HISTORY_BASE_INVALID');
    visiting.add(transaction.txn_id);
    const base = transaction.base_revision, revision = transaction.candidate_revision;
    const promotion = transaction.commit_mode === 'profile_promotion';
    if (transaction.schema_version !== contract.schema_version || transaction.compiler_version !== contract.compiler_version
      || transaction.transaction_kind !== 'revision_append' || transaction.phase !== 'complete'
      || typeof transaction.append_id !== 'string' || !transaction.append_id.trim()
      || !/^sha256:[0-9a-f]{64}$/u.test(transaction.append_digest)
      || !/^sha256:[0-9a-f]{64}$/u.test(transaction.semantic_digest)
      || !Number.isSafeInteger(revision) || revision < 0 || !Number.isInteger(ranks[transaction.commit_profile])
      || !(base === null || (Number.isSafeInteger(base) && base >= 0))
      || (promotion ? base !== revision : transaction.commit_mode !== 'new_revision' || revision !== (base === null ? 0 : base + 1))
      || transaction.append_key !== hash(transaction.append_id)
      || transaction.txn_id !== `TXN-${hash(`${transaction.append_id}\0${transaction.append_digest}\0${base === null ? 'null' : base}\0${revision}`)}`
      || transaction.candidate_digest !== valueDigest({ base_revision: base, candidate_revision: revision,
        commit_profile: transaction.commit_profile, semantic_digest: transaction.semantic_digest,
        artifact_digests: transaction.artifact_digests })) fail('UPGRADE_HISTORY_JOURNAL_INVALID');
    if (!same(transaction.result, transactionResult(transaction))) fail('UPGRADE_HISTORY_JOURNAL_INVALID');
    if (base === null) {
      if (transaction.previous_checkpoint_digest !== null || transaction.previous_profile !== null
        || transaction.previous_semantic_digest !== null || !same(transaction.previous_artifact_digests, {})) {
        fail('UPGRADE_HISTORY_BASE_INVALID');
      }
    } else {
      const candidates = transactions.filter(prior => prior.txn_id !== transaction.txn_id
        && prior.candidate_revision === base && prior.artifact_digests?.checkpoint === transaction.previous_checkpoint_digest
        && same(prior.artifact_digests, transaction.previous_artifact_digests));
      if (candidates.length !== 1) fail('UPGRADE_HISTORY_BASE_INVALID');
      const prior = candidates[0];
      check(prior);
      if (transaction.previous_profile !== prior.commit_profile || transaction.previous_semantic_digest !== prior.semantic_digest) {
        fail('UPGRADE_HISTORY_BASE_INVALID');
      }
      if (promotion && (ranks[transaction.commit_profile] <= ranks[prior.commit_profile]
        || transaction.semantic_digest !== prior.semantic_digest
        || Object.keys(prior.artifact_digests).some(key => !['checkpoint', 'clarification_state'].includes(key)
          && transaction.artifact_digests[key] !== prior.artifact_digests[key]))) fail('UPGRADE_HISTORY_BASE_INVALID');
    }
    visiting.delete(transaction.txn_id);
    verified.add(transaction.txn_id);
  };
  for (const transaction of transactions) check(transaction);
}

/** @param {string} directory @param {string} parentId */
async function verifiedParent(directory, parentId) {
  const instance = await json(directory, 'run-instance.json');
  const contract = v4ContractForIdentity(instance);
  if (!contract || !V4_UPGRADE_SUPPORT_MATRIX.some(item => item.schema_version === contract.schema_version)) {
    fail('UPGRADE_PARENT_CONTRACT_UNSUPPORTED');
  }
  if (validateAgainstSchema(instance, runInstanceSchema).length || instance.run_id !== parentId
    || instance.delivery_intent !== 'case_document') fail('UPGRADE_PARENT_IDENTITY_INVALID');
  if (await readTextIfPresent(directory, path.join(directory, 'state/cancellation.json')) !== null) {
    fail('UPGRADE_PARENT_CANCELLED');
  }
  if (await readTextIfPresent(directory, path.join(directory, 'staging/pending-revision.json')) !== null) {
    fail('UPGRADE_PARENT_TRANSACTION_RECOVERY_REQUIRED');
  }
  const snapshot = await byteSnapshot(directory);
  const completedTransactions = [];
  for (const entry of snapshot.filter(item => /^transactions\/revisions\/TXN-[0-9a-f]{64}\.json$/u.test(item.path))) {
    const transaction = await json(directory, entry.path);
    if (transaction?.phase !== 'complete' || transaction.result?.status !== 'committed') continue;
    if (path.basename(entry.path) !== `${transaction.txn_id}.json`) fail('UPGRADE_HISTORY_JOURNAL_INVALID');
    const receipt = await json(directory, `transactions/appends/${transaction.append_key}.json`);
    if (!receipt || receipt.schema_version !== contract.schema_version || receipt.txn_id !== transaction.txn_id
      || receipt.append_id !== transaction.append_id || receipt.append_digest !== transaction.append_digest
      || !same(receipt.result, transaction.result)) fail('UPGRADE_HISTORY_JOURNAL_INVALID');
    completedTransactions.push(transaction);
  }
  verifyHistoryTransactions(completedTransactions, contract);
  const records = snapshot.filter(item => /^transactions\/committed\/r[0-9]+\.json$/u.test(item.path))
    .map(item => Number(path.basename(item.path).slice(1, -5))).sort((a, b) => a - b);
  if (records.some((revision, index) => revision !== index)) fail('UPGRADE_HISTORY_REVISION_INVALID');
  /** @type {any} */ let latest = null;
  /** @type {any} */ let latestFinal = null;
  for (const revision of records) {
    const record = await json(directory, `transactions/committed/${revisionName(revision)}.json`);
    const profile = record?.commit_profile;
    if (!record || record.schema_version !== contract.schema_version || record.revision !== revision
      || !['pre_case_pending', 'post_case_pending', 'final'].includes(profile)) fail('UPGRADE_HISTORY_RECORD_INVALID');
    const keys = [...BASE, ...(profile === 'pre_case_pending' ? [] : ['behavior_views', 'test_obligations', 'case_drafts']),
      ...(profile === 'final' ? ['bundle', 'markdown', 'worksheet', 'manifest',
        ...(contract.candidate ? ['html', 'table', 'source_reading'] : [])] : [])];
    if (!record.artifact_digests || !same(Object.keys(record.artifact_digests).sort(), keys.sort())) fail('UPGRADE_HISTORY_RECORD_INVALID');
    /** @type {Record<string,string>} */ const texts = {};
    for (const key of keys) {
      const text = await readTextIfPresent(directory, revisionArtifactPathV4(directory, revision, key));
      if (text === null) fail('UPGRADE_HISTORY_ARTIFACT_DIGEST_INVALID');
      const bytes = await readFile(revisionArtifactPathV4(directory, revision, key));
      if (byteDigest(bytes) !== record.artifact_digests[key]) fail('UPGRADE_HISTORY_ARTIFACT_DIGEST_INVALID');
      try { if (new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== text) fail('UPGRADE_HISTORY_ENCODING_INVALID'); }
      catch { fail('UPGRADE_HISTORY_ENCODING_INVALID'); }
      texts[key] = text;
    }
    if (record.checkpoint_digest !== record.artifact_digests.checkpoint
      || record.delivery_manifest_digest !== (profile === 'final' ? record.artifact_digests.manifest : null)) {
      fail('UPGRADE_HISTORY_RECORD_INVALID');
    }
    const transaction = await json(directory, `transactions/revisions/${record.txn_id}.json`);
    if (!transaction || !completedTransactions.some(item => item.txn_id === record.txn_id)
      || transaction.result?.status !== 'committed' || transaction.phase !== 'complete' || transaction.txn_id !== record.txn_id
      || transaction.schema_version !== contract.schema_version || transaction.compiler_version !== contract.compiler_version
      || transaction.candidate_revision !== revision || transaction.commit_profile !== profile
      || transaction.semantic_digest !== record.semantic_digest || !same(transaction.artifact_digests, record.artifact_digests)
      || !same(transaction.result?.artifact_digests, record.artifact_digests)) fail('UPGRADE_HISTORY_JOURNAL_INVALID');
    const receipt = await json(directory, `transactions/appends/${transaction.append_key}.json`);
    if (!receipt || receipt.txn_id !== record.txn_id || receipt.append_id !== transaction.append_id
      || receipt.append_digest !== transaction.append_digest || !same(receipt.result, transaction.result)) fail('UPGRADE_HISTORY_JOURNAL_INVALID');
    const checkpoint = JSON.parse(texts.checkpoint);
    if (checkpoint.run_id !== parentId || checkpoint.revision !== revision || checkpoint.commit_profile !== profile
      || checkpoint.schema_version !== contract.schema_version || checkpoint.compiler_version !== contract.compiler_version) {
      fail('UPGRADE_HISTORY_CHECKPOINT_BINDING_INVALID');
    }
    const expectedBaseDigest = transaction.base_revision === null
      ? byteDigest(`${canonicalStringify({ schema_version: contract.schema_version, compiler_version: contract.compiler_version,
        run_id: parentId, genesis: true })}\n`) : transaction.previous_checkpoint_digest;
    if (checkpoint.base_checkpoint_digest !== expectedBaseDigest) fail('UPGRADE_HISTORY_BASE_INVALID');
    const values = validateRevisionArtifactsV4({ profile, revision, run_id: parentId, texts });
    latest = { record, texts, values };
    if (profile === 'final') latestFinal = latest;
  }
  const current = await readTextIfPresent(directory, path.join(directory, 'output/current.json'));
  if (latest) {
    if (await readTextIfPresent(directory, path.join(directory, 'checkpoint.json')) !== latest.texts.checkpoint) fail('UPGRADE_HISTORY_CHECKPOINT_INVALID');
    if (latest.record.commit_profile === 'final' && current !== latest.texts.manifest) fail('UPGRADE_HISTORY_MANIFEST_INVALID');
    const frozenLegacyPointer = ['4.0.0', '4.2.0'].includes(contract.schema_version) && latestFinal && current === latestFinal.texts.manifest;
    if (latest.record.commit_profile !== 'final' && current !== null && !frozenLegacyPointer) {
      let pointer;
      try { pointer = JSON.parse(current); } catch { fail('UPGRADE_HISTORY_MANIFEST_INVALID'); }
      if (validateAgainstSchema(pointer, { $defs: currentPointerSchema.$defs, $ref: '#/$defs/v4NonReady' }).length
        || pointer.schema_version !== contract.schema_version || pointer.compiler_version !== contract.compiler_version
        || pointer.run_id !== parentId || pointer.active_revision !== latest.record.revision || !latestFinal
        || pointer.previous_ready_revision !== latestFinal.record.revision
        || pointer.previous_ready_revision >= pointer.active_revision
        || pointer.previous_ready_manifest_digest !== latestFinal.record.artifact_digests.manifest) fail('UPGRADE_HISTORY_MANIFEST_INVALID');
    }
    if (latest.record.commit_profile !== 'final' && latestFinal && current === null) fail('UPGRADE_HISTORY_MANIFEST_INVALID');
  } else {
    if (snapshot.some(item => /^transactions\/committed\//u.test(item.path))) fail('UPGRADE_HISTORY_RECORD_INVALID');
    if (current !== null) fail('UPGRADE_HISTORY_MANIFEST_INVALID');
  }
  const accepted = snapshot.filter(item => /^accepted\/r[0-9]+\/source-pack.json$/u.test(item.path));
  // Source-only accepted prefixes are valid, but unjournaled Evidence cannot be trusted.
  if (snapshot.some(item => /^accepted\/r[0-9]+\/evidence-claims.json$/u.test(item.path)) && !latest) fail('UPGRADE_HISTORY_RECORD_MISSING');
  const source = latest?.values.source_pack ?? await json(directory, accepted.at(-1)?.path ?? 'staging/source-pack.json');
  if (!source || source.schema_version !== contract.schema_version || source.run_instance_id !== parentId
    || validateAgainstSchema(source, sourcePackSchema).length || validateUniqueStableIds(source).length
    || validateV4SourcePackBeforeStaging(source).diagnostics.length
    || validateDecisionRecords(source).diagnostics.length) fail('UPGRADE_SOURCE_INVALID');
  const evidenceText = latest?.texts.evidence_claims
    ?? await readTextIfPresent(directory, path.join(directory, 'staging/evidence-claims.json'));
  let evidence = null;
  try { evidence = evidenceText === null ? null : JSON.parse(evidenceText); } catch { /* Unaccepted invalid candidate retained for audit. */ }
  const acquisition = await json(directory, 'derived/source-acquisition.json');
  if (acquisition) {
    if (acquisition.status === 'pending') {
      if (!await replaySourceAcquisitionStopV4(directory, parentId)) fail('UPGRADE_SOURCE_ACQUISITION_INVALID');
    } else {
      await loadSourceAcquisitionCompilerStateV4(directory, source, { read_only: true });
    }
  }
  if (acquisition?.status === 'collected') {
    const { state_digest, ...body } = acquisition;
    const session = acquisition.collection_sessions?.[0];
    if (state_digest !== valueDigest(body) || !session || acquisition.collection_sessions.length !== 1
      || session.session_digest !== valueDigest({ version: session.version, scope: session.scope,
        channels: session.channels, items: session.items })) fail('UPGRADE_SOURCE_COLLECTION_INVALID');
    await loadV4SourceReadingSummary(directory, source);
  }
  if (!same(snapshot, await byteSnapshot(directory))) fail('UPGRADE_PARENT_CHANGED_DURING_VERIFICATION');
  return { instance, contract, snapshot, snapshot_digest: valueDigest(snapshot), latest, source, evidence,
    evidence_text: evidenceText, collection: acquisition?.status === 'collected' ? acquisition : null };
}

/** Exact, deliberately conservative applicability proof. A proof is not an accepted
 * Decision: the runner must still issue and audit a new binding before reuse.
 * Full Evidence comparison covers every Fact/Claim and ancestry, not only display text.
 * @param {{source_pack:any,evidence_claims:any,checkpoint:any}} prior
 * @param {{source_pack:any,evidence_claims:any,checkpoint:any}} next
 * @param {any} decision
 */
export function proveVersionUpgradeAnswerReuseV4(prior, next, decision) {
  const reask = (/** @type {string} */ reason) => ({ reusable: false, reason, old_decision_id: decision?.decision_id ?? null });
  if (!decision || decision.resolution !== 'final' || decision.authority !== 'product_final'
    || decision.evidence_level !== 'E3' || decision.answer_origin?.type !== 'authorized_confirmation'
    || !prior.source_pack.decision_records.some((/** @type {any} */ item) => same(item, decision))
    || !next.source_pack.decision_records.some((/** @type {any} */ item) => same(item, decision))
    || validateDecisionRecords(prior.source_pack).diagnostics.length
    || validateDecisionRecords(next.source_pack).diagnostics.length) return reask('ANSWER_AUTHORITY_NOT_PROVEN');
  const oldRoot = prior.checkpoint.semantic_gap_ledger.find((/** @type {any} */ item) => item.root_issue_id === decision.target.root_issue_id);
  const newRoot = next.checkpoint.semantic_gap_ledger.find((/** @type {any} */ item) => item.root_issue_id === decision.target.root_issue_id);
  const oldState = prior.checkpoint.clarification_state.root_states.find((/** @type {any} */ item) => item.root_issue_id === decision.target.root_issue_id);
  if (!oldRoot || !newRoot || oldState?.status !== 'resolved_final'
    || oldState.root_version_digest !== decision.target.root_version_digest
    || oldRoot.root_version_digest !== decision.target.root_version_digest
    || oldRoot.root_version_digest !== newRoot.root_version_digest
    || !same(decision.subject_fact_ids, oldRoot.subject_fact_ids)
    || decision.missing_aspect !== oldRoot.missing_aspect || !oldRoot.acceptance_impact) return reask('ROOT_APPLICABILITY_NOT_PROVEN');
  const material = (/** @type {any} */ input, /** @type {any} */ root) => ({
    sources: input.source_pack.sources, locators: input.source_pack.locators,
    source_reviews: input.source_pack.source_reviews, source_assets: input.source_pack.source_assets,
    source_policy: input.source_pack.source_policy,
    evidence: Object.fromEntries(Object.entries(input.evidence_claims).filter(([key]) => !['schema_version', 'source_revision'].includes(key))),
    root: Object.fromEntries(Object.entries(root).filter(([key]) => !['question_part_id', 'affected_facts'].includes(key)))
  });
  const priorMaterial = material(prior, oldRoot), nextMaterial = material(next, newRoot);
  if (!same(priorMaterial, nextMaterial)) return reask('BUSINESS_PROPOSITION_CHANGED');
  return { reusable: true, reason: 'EXACT_AUTHORITY_AND_PROPOSITION_PROVEN',
    old_decision_id: decision.decision_id, old_target: structuredClone(decision.target),
    new_root_issue_id: newRoot.root_issue_id, new_root_version_digest: newRoot.root_version_digest,
    proposition_digest: valueDigest(priorMaterial), authority: decision.authority,
    resolution: decision.resolution, evidence_level: decision.evidence_level };
}

/** @param {any} transaction @param {string} catalogRoot */
function result(transaction, catalogRoot) {
  return { run_id: transaction.run_id, run_directory: path.join(catalogRoot, 'runs', transaction.run_id),
    delivery_intent: 'case_document', lineage: structuredClone(transaction.lineage), strategy: structuredClone(transaction.strategy) };
}
/** @param {string} catalogRoot @param {{parent_run_id:string}} input
 * @param {{after_phase?:(phase:string)=>void|Promise<void>}} [hooks] */
export async function createVersionUpgradeSiblingV4(catalogRoot, input, hooks = {}) {
  if (typeof catalogRoot !== 'string' || !path.isAbsolute(catalogRoot) || !input
    || Object.keys(input).length !== 1 || !RUN_ID.test(input.parent_run_id)) throw new TypeError('VERSION_UPGRADE_INPUT_INVALID');
  const catalogStat = await lstat(catalogRoot);
  if (catalogStat.isSymbolicLink() || !catalogStat.isDirectory()) fail('UPGRADE_DIRECTORY_INVALID');
  catalogRoot = await realpath(catalogRoot);
  await realDirectory(catalogRoot, catalogRoot);
  await realDirectory(catalogRoot, path.join(catalogRoot, 'runs'));
  const parentDirectory = path.join(catalogRoot, 'runs', input.parent_run_id);
  await realDirectory(catalogRoot, parentDirectory);
  const releaseCatalog = await acquireRunLock(catalogRoot);
  let releaseParent;
  try {
    releaseParent = await acquireRunLock(parentDirectory);
    const parent = await verifiedParent(parentDirectory, input.parent_run_id);
    const target = latestV4Contract();
    const key = valueDigest({ parent_run_id: input.parent_run_id, schema_version: target.schema_version,
      compiler_version: target.compiler_version }).slice(7);
    const journalPath = path.join(catalogRoot, 'transactions', 'version-upgrades', `${key}.json`);
    let transaction = (await readJsonIfPresent(catalogRoot, journalPath))?.value;
    if (transaction) {
      const { journal_digest, ...body } = transaction;
      if (journal_digest !== valueDigest(body) || transaction.parent_snapshot_digest !== parent.snapshot_digest
        || transaction.parent_run_id !== input.parent_run_id || transaction.target_schema_version !== target.schema_version
        || transaction.target_compiler_version !== target.compiler_version || !RUN_ID.test(transaction.run_id)
        || !PHASES.includes(transaction.phase)) fail('UPGRADE_JOURNAL_INVALID');
      if (transaction.phase === 'complete') {
        await verifyVersionUpgradeSiblingV4(path.join(catalogRoot, 'runs', transaction.run_id));
        return result(transaction, catalogRoot);
      }
    } else {
      const lineage = { creation_reason: 'version_upgrade', parent_run_id: input.parent_run_id,
        parent_schema_version: parent.contract.schema_version, parent_compiler_version: parent.contract.compiler_version,
        parent_snapshot_digest: parent.snapshot_digest,
        parent_revision: parent.latest?.record.revision ?? null };
      transaction = { version: 1, parent_run_id: input.parent_run_id, parent_snapshot_digest: parent.snapshot_digest,
        target_schema_version: target.schema_version, target_compiler_version: target.compiler_version,
        run_id: `RUN-${randomUUID()}`, lineage, phase: 'reserved',
        strategy: { restart_stage: parent.collection ? 'evidence_claims' : 'source_pack',
          source_policy: parent.collection ? 'verified_collection_rebound' : 'reacquire_with_preserved_materials',
          evidence_policy: 'preserve_all_facts_and_claims_for_latest_validation', answer_policy: 'prove_final_else_reask',
          parent_state: parent.latest?.record.commit_profile ?? 'staging_only' } };
    }
    const persist = async (/** @type {string} */ phase) => {
      const { journal_digest: ignored, ...body } = transaction;
      transaction = { ...body, phase };
      transaction.journal_digest = valueDigest(transaction);
      await atomicWriteJson(catalogRoot, journalPath, transaction);
      await hooks.after_phase?.(phase);
    };
    if (transaction.phase === 'reserved') {
      await persist('reserved');
      const directory = path.join(catalogRoot, 'runs', transaction.run_id);
      // The catalog journal reserves the ID before the identity is materialized.
      await atomicWriteJson(catalogRoot, path.join(directory, 'upgrade/reservation.json'), { upgrade_key: key });
      const identity = await ensureV4RunInstance(directory, { run_id: transaction.run_id, delivery_intent: 'case_document',
        contract: target, lineage: transaction.lineage });
      transaction.identity_digest = valueDigest(identity);
      await persist('identity_created');
    }
    const directory = path.join(catalogRoot, 'runs', transaction.run_id);
    if (transaction.phase === 'identity_created') {
      const source = { ...structuredClone(parent.source), schema_version: target.schema_version,
        run_instance_id: transaction.run_id, source_revision: 0 };
      // Retain historic Decision provenance as evidence; fresh checkpoints do not
      // inherit resolved root states or replay these old presentation bindings.
      await atomicWriteJson(directory, path.join(directory, 'staging/source-pack.json'), source);
      if (parent.evidence && typeof parent.evidence === 'object' && !Array.isArray(parent.evidence)) {
        await atomicWriteJson(directory, path.join(directory, 'staging/evidence-claims.json'), {
          ...structuredClone(parent.evidence), schema_version: target.schema_version, source_revision: 0 });
      }
      if (parent.evidence_text !== null) await atomicWriteText(directory,
        path.join(directory, 'upgrade/parent-evidence-candidate.json'), parent.evidence_text);
      await atomicWriteJson(directory, path.join(directory, 'upgrade/history-audit.json'), {
        parent_snapshot: parent.snapshot, parent_snapshot_digest: parent.snapshot_digest,
        parent_run_id: input.parent_run_id, parent_decisions: parent.source.decision_records,
        parent_events: parent.source.clarification_events,
        parent_checkpoint: parent.latest?.values.checkpoint ?? null,
        answer_mappings: (parent.source.decision_records ?? []).map((/** @type {any} */ decision) => ({
          old_decision_id: decision.decision_id, old_target: decision.target,
          authority: decision.authority, resolution: decision.resolution, evidence_level: decision.evidence_level,
          disposition: 'audit_and_reask', reason: 'NEW_BINDING_REQUIRES_PROPOSITION_AND_AUTHORITY_PROOF' })) });
      if (parent.collection) {
        const body = { schema_version: target.schema_version, compiler_version: target.compiler_version,
          registry_version: sourceRuntimeRegistryVersionV4(target.schema_version), run_id: transaction.run_id,
          source_revision: 0, collection_session: parent.collection.collection_sessions[0] };
        await atomicWriteJson(directory, path.join(directory, 'staging/prd-collection.json'), { ...body, staging_digest: valueDigest(body) });
        await bindV4PrdCollectionObservation(directory, source);
      }
      await persist('materials_staged');
    }
    if (transaction.phase === 'materials_staged') await persist('complete');
    return result(transaction, catalogRoot);
  } finally { if (releaseParent) await releaseParent(); await releaseCatalog(); }
}

/** @param {string} directory @returns {Promise<string[]>} */
async function namesIfPresent(directory) {
  try { return await readdir(directory); }
  catch (error) { if (/** @type {any} */ (error)?.code === 'ENOENT') return []; throw error; }
}

/** A resolved upgrade root must retain its compiler-issued mapping after the
 * pre-case checkpoint is promoted or later revisions are appended.
 * @param {string} directory @param {any} instance @param {any} parent */
async function verifyAcceptedAnswerBindings(directory, instance, parent) {
  const committed = await json(directory, 'transactions/committed/r000.json');
  const pending = await json(directory, 'staging/pending-revision.json');
  const interruptedInitial = pending?.candidate_revision === 0 && pending.base_revision === null
    && pending.commit_mode === 'new_revision' && pending.commit_profile === 'pre_case_pending'
    && ['checkpoint_committed', 'delivery_committed'].includes(pending.phase);
  if ((!committed && !interruptedInitial) || !parent.latest) return;
  const checkpoint = await json(directory, 'derived/r000/checkpoint.json');
  const source = await json(directory, 'accepted/r000/source-pack.json');
  const evidence = await json(directory, 'accepted/r000/evidence-claims.json');
  if (!checkpoint || !source || !evidence) fail('UPGRADE_REUSE_AUDIT_INVALID');
  const prior = { source_pack: parent.source, evidence_claims: parent.evidence, checkpoint: parent.latest.values.checkpoint };
  const next = { source_pack: source, evidence_claims: evidence, checkpoint };
  const required = checkpoint.clarification_state.root_states.filter((/** @type {any} */ state) => state.status === 'resolved_final'
    && parent.source.decision_records.some((/** @type {any} */ decision) => decision.target?.root_issue_id === state.root_issue_id
      && decision.target?.root_version_digest === state.root_version_digest));
  if (!required.length) return;
  const transactions = [];
  for (const name of await namesIfPresent(path.join(directory, 'transactions/revisions'))) {
    if (!/^TXN-[0-9a-f]{64}\.json$/u.test(name)) continue;
    const transaction = await json(directory, `transactions/revisions/${name}`);
    if (transaction?.phase === 'complete' && transaction.result?.status === 'committed' && transaction.candidate_revision === 0) transactions.push(transaction);
  }
  // The checkpoint rename precedes the durable completion journal. Validate the
  // exact pending first transaction so its provisional audit cannot block recovery.
  if (interruptedInitial && !transactions.some(transaction => transaction.txn_id === pending.txn_id)) {
    if (pending.result !== null || !same(Object.keys(pending.artifact_digests ?? {}).sort(), [...BASE].sort())
      || (committed && (committed.txn_id !== pending.txn_id || committed.revision !== 0
        || committed.commit_profile !== pending.commit_profile || committed.semantic_digest !== pending.semantic_digest
        || committed.checkpoint_digest !== pending.artifact_digests.checkpoint
        || committed.delivery_manifest_digest !== null || !same(committed.artifact_digests, pending.artifact_digests)))) fail('UPGRADE_REUSE_AUDIT_INVALID');
    /** @type {Record<string,string>} */ const texts = {};
    for (const key of BASE) {
      const bytes = await readFile(revisionArtifactPathV4(directory, 0, key));
      if (byteDigest(bytes) !== pending.artifact_digests[key]) fail('UPGRADE_REUSE_AUDIT_INVALID');
      texts[key] = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    if (checkpoint.run_id !== instance.run_id || checkpoint.revision !== 0 || checkpoint.commit_profile !== 'pre_case_pending'
      || checkpoint.base_checkpoint_digest !== byteDigest(`${canonicalStringify({ schema_version: instance.schema_version,
        compiler_version: instance.compiler_version, run_id: instance.run_id, genesis: true })}\n`)
      || await readTextIfPresent(directory, path.join(directory, 'checkpoint.json')) !== texts.checkpoint) fail('UPGRADE_REUSE_AUDIT_INVALID');
    validateRevisionArtifactsV4({ profile: 'pre_case_pending', revision: 0, run_id: instance.run_id, texts });
    transactions.push({ ...pending, phase: 'complete', result: transactionResult(pending) });
  }
  verifyHistoryTransactions(transactions, latestV4Contract());
  const covered = new Set();
  for (const name of await namesIfPresent(path.join(directory, 'upgrade/answer-bindings'))) {
    if (!/^[0-9a-f]{64}\.json$/u.test(name)) fail('UPGRADE_REUSE_AUDIT_INVALID');
    const audit = await json(directory, `upgrade/answer-bindings/${name}`);
    const { audit_digest, ...body } = audit ?? {};
    if (!audit || audit_digest !== valueDigest(body) || name !== `${audit_digest.slice(7)}.json`
      || audit.run_id !== instance.run_id || audit.revision !== 0 || audit.parent_run_id !== parent.instance.run_id
      || audit.parent_snapshot_digest !== parent.snapshot_digest || !Array.isArray(audit.mappings)
      || audit.acceptance_condition !== 'exact_checkpoint_digest_in_completed_revision_transaction') fail('UPGRADE_REUSE_AUDIT_INVALID');
    const accepted = transactions.find(transaction => transaction.artifact_digests?.checkpoint === audit.candidate_checkpoint_digest);
    if (!accepted) continue; // A failed candidate's audit is intentionally still provisional.
    if (audit.source_pack_digest !== valueDigest(source) || audit.evidence_digest !== valueDigest(evidence)
      || accepted.artifact_digests.source_pack !== byteDigest(`${canonicalStringify(source)}\n`)
      || accepted.artifact_digests.evidence_claims !== byteDigest(`${canonicalStringify(evidence)}\n`)) fail('UPGRADE_REUSE_AUDIT_INVALID');
    for (const mapping of audit.mappings.filter((/** @type {any} */ item) => item.reusable)) {
      const decision = parent.source.decision_records.find((/** @type {any} */ item) => item.decision_id === mapping.old_decision_id);
      const proof = proveVersionUpgradeAnswerReuseV4(prior, next, decision);
      const root = checkpoint.semantic_gap_ledger.find((/** @type {any} */ item) => item.root_issue_id === mapping.new_root_issue_id);
      if (!proof.reusable || !root || !same(mapping, { ...proof, new_binding: {
        run_id: instance.run_id, revision: 0, root_issue_id: root.root_issue_id,
        root_version_digest: root.root_version_digest, question_part_id: root.question_part_id } })) fail('UPGRADE_REUSE_AUDIT_INVALID');
      covered.add(root.root_issue_id);
    }
  }
  if (required.some((/** @type {any} */ state) => !covered.has(state.root_issue_id))) fail('UPGRADE_REUSE_AUDIT_MISSING');
}

/** Read-only lineage guard for the latest runner. Parent hash verification uses
 * raw bytes; it never rewrites a checkpoint, journal, manifest or old identity.
 * @param {string} runDirectory @param {any} [submittedInstance] */
export async function verifyVersionUpgradeSiblingV4(runDirectory, submittedInstance) {
  const instance = submittedInstance ?? await json(runDirectory, 'run-instance.json');
  if (!instance || validateAgainstSchema(instance, runInstanceSchema).length
    || instance.delivery_intent !== 'case_document' || v4ContractForIdentity(instance) !== latestV4Contract()
    || instance.lineage?.creation_reason !== 'version_upgrade' || path.basename(runDirectory) !== instance.run_id
    || path.basename(path.dirname(runDirectory)) !== 'runs') fail('UPGRADE_SIBLING_INVALID');
  const catalog = path.dirname(path.dirname(runDirectory));
  await realDirectory(catalog, runDirectory);
  await realDirectory(catalog, path.join(catalog, 'runs', instance.lineage.parent_run_id));
  const storedInstance = await json(runDirectory, 'run-instance.json');
  if (!same(storedInstance, instance)) fail('UPGRADE_SIBLING_INVALID');
  const key = valueDigest({ parent_run_id: instance.lineage.parent_run_id, schema_version: instance.schema_version,
    compiler_version: instance.compiler_version }).slice(7);
  const transaction = await json(catalog, `transactions/version-upgrades/${key}.json`);
  const { journal_digest, ...body } = transaction ?? {};
  if (!transaction || journal_digest !== valueDigest(body) || transaction.phase !== 'complete'
    || transaction.run_id !== instance.run_id || transaction.identity_digest !== valueDigest(instance)
    || !same(transaction.lineage, instance.lineage)) fail('UPGRADE_SIBLING_INVALID');
  const parent = await verifiedParent(path.join(catalog, 'runs', instance.lineage.parent_run_id), instance.lineage.parent_run_id);
  if (parent.snapshot_digest !== instance.lineage.parent_snapshot_digest) fail('UPGRADE_PARENT_CHANGED');
  await verifyAcceptedAnswerBindings(runDirectory, instance, parent);
  return { instance: structuredClone(instance), strategy: structuredClone(transaction.strategy) };
}

/** Apply proven final Decisions to a freshly compiled revision-zero checkpoint.
 * The old Decision and authority remain intact; the compiler records an explicit
 * old-target/new-root binding. Audit is provisional until its exact checkpoint
 * digest occurs in a completed revision transaction (retained across profile promotion).
 * @param {string} runDirectory @param {any} sourcePack @param {any} evidence
 * @param {any} compiled */
export async function applyVersionUpgradeAnswersV4(runDirectory, sourcePack, evidence, compiled) {
  const instance = await json(runDirectory, 'run-instance.json');
  if (instance?.lineage?.creation_reason !== 'version_upgrade') return compiled;
  if (sourcePack.source_revision !== 0 || compiled.checkpoint?.revision !== 0) return compiled;
  await verifyVersionUpgradeSiblingV4(runDirectory, instance);
  if (sourcePack.run_instance_id !== instance.run_id || compiled.checkpoint.run_id !== instance.run_id
    || sourcePack.schema_version !== latestV4Contract().schema_version
    || evidence.schema_version !== latestV4Contract().schema_version
    || compiled.checkpoint.schema_version !== latestV4Contract().schema_version) fail('UPGRADE_REUSE_BINDING_INVALID');
  const catalog = path.dirname(path.dirname(runDirectory));
  const parent = await verifiedParent(path.join(catalog, 'runs', instance.lineage.parent_run_id), instance.lineage.parent_run_id);
  if (!parent.latest) return compiled;
  const prior = { source_pack: parent.source, evidence_claims: parent.evidence, checkpoint: parent.latest.values.checkpoint };
  const next = { source_pack: sourcePack, evidence_claims: evidence, checkpoint: compiled.checkpoint };
  const mappings = parent.source.decision_records.map((/** @type {any} */ decision) => proveVersionUpgradeAnswerReuseV4(prior, next, decision));
  const finalRoots = [...new Set(mappings.filter((/** @type {any} */ mapping) => mapping.reusable)
    .map((/** @type {any} */ mapping) => String(mapping.new_root_issue_id)))];
  const checkpoint = finalRoots.length ? refreshVersionUpgradePresentationV4(compiled.checkpoint, finalRoots) : compiled.checkpoint;
  const body = { version: 1, parent_run_id: parent.instance.run_id, parent_snapshot_digest: parent.snapshot_digest,
    run_id: instance.run_id, revision: 0, source_pack_digest: valueDigest(sourcePack), evidence_digest: valueDigest(evidence),
    candidate_checkpoint_digest: byteDigest(`${canonicalStringify(checkpoint)}\n`),
    acceptance_condition: 'exact_checkpoint_digest_in_completed_revision_transaction',
    mappings: mappings.map((/** @type {any} */ mapping) => ({ ...mapping,
      ...(mapping.reusable ? { new_binding: { run_id: instance.run_id, revision: 0,
        root_issue_id: mapping.new_root_issue_id, root_version_digest: mapping.new_root_version_digest,
        question_part_id: checkpoint.semantic_gap_ledger.find((/** @type {any} */ root) => root.root_issue_id === mapping.new_root_issue_id).question_part_id } } : {}) })) };
  const auditDigest = valueDigest(body);
  const target = path.join(runDirectory, 'upgrade', 'answer-bindings', `${auditDigest.slice(7)}.json`);
  const existing = await readJsonIfPresent(runDirectory, target);
  if (existing && !same(existing.value, { ...body, audit_digest: auditDigest })) fail('UPGRADE_REUSE_AUDIT_CONFLICT');
  if (!existing) await atomicWriteJson(runDirectory, target, { ...body, audit_digest: auditDigest });
  return { ...compiled, checkpoint, presentation: checkpoint.clarification_state.presentation,
    status: checkpoint.clarification_state.presentation ? 'need_user_answers' : 'clarification_complete' };
}
