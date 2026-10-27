import path from 'node:path';
import { canonicalStringify, digest } from './canonical.mjs';
import { atomicWriteJson, readJsonIfPresent, readTextIfPresent, revisionName } from './run-store.mjs';
import { sourceByteDigest } from './source-canonicalization.mjs';
import { sourceRuntimeRegistryVersionV4 } from './source-runtime-registry-v4.mjs';

const HASH = /^sha256:[0-9a-f]{64}$/u;
const ID = /^[0-9a-f]{64}$/u;
/** @param {any} value */
const hash = value => `sha256:${digest(value)}`;
/** @param {string} text */
const bytesHash = text => sourceByteDigest(new TextEncoder().encode(text));
/** @param {string} run @param {...string} parts */
const location = (run, ...parts) => path.join(run, 'transactions', 'source-acquisition', ...parts);
/** @param {any} value @param {string[]} keys */
function closed(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  }
}
/** @param {any} value */
function body(value) { const { record_digest: _, ...result } = value; return result; }
/** @param {any} value */
function checkDigest(value) {
  if (!HASH.test(value.record_digest) || value.record_digest !== hash(body(value))) {
    throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  }
}
/** @param {string} run @param {string} target @param {any} value */
export async function writeAcquisitionImmutableV4(run, target, value) {
  const prior = await readJsonIfPresent(run, target);
  if (prior && prior.digest !== digest(value)) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_CONFLICT');
  if (!prior) await atomicWriteJson(run, target, value);
}
/** Opaque content-addressed references, never arbitrary paths from a journal.
 * @param {string} run @param {any} state */
export async function snapshotAcquisitionStateV4(run, state) {
  const ref = hash(state);
  await writeAcquisitionImmutableV4(run, location(run, 'objects', `${ref.slice(7)}.json`), state);
  return ref;
}
/** @param {string} run @param {string} ref */
export async function readAcquisitionSnapshotV4(run, ref) {
  if (!HASH.test(ref)) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  const stored = await readJsonIfPresent(run, location(run, 'objects', `${ref.slice(7)}.json`));
  if (!stored || `sha256:${stored.digest}` !== ref) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  return stored.value;
}
/** A stable intent excludes adapter-owned material events and semantic source
 * projections, whose exact bytes are separately bound by pending/acquired state.
 * Clarification event identity, including presentation/root/message, is retained.
 * @param {any} source */
export function acquisitionCandidateKeyV4(source) {
  return digest({ run_id: source.run_instance_id, schema_version: source.schema_version,
    revision: source.source_revision, clarification_events: source.clarification_events,
    execution_events: source.execution_events, artifact_repairs: source.artifact_repairs ?? [] });
}
/** @param {string} run @param {string} id */
export async function readAcquisitionContextV4(run, id) {
  if (!ID.test(id)) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  const stored = await readJsonIfPresent(run, location(run, 'candidates', id, 'context.json'));
  if (!stored) return null;
  const value = stored.value;
  closed(value, ['format_version', 'schema_version', 'compiler_version', 'registry_version', 'run_id',
    'candidate_id', 'candidate_revision', 'operation', 'submitted_digest', 'base_binding',
    'base_state_ref', 'state_ref', 'phase', 'transaction_id', 'record_digest']);
  checkDigest(value);
  if (value.format_version !== '1.0.0' || value.schema_version !== '4.3.3'
    || value.compiler_version !== '0.8.3'
    || value.registry_version !== sourceRuntimeRegistryVersionV4(value.schema_version)
    || !/^RUN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(value.run_id)
    || value.candidate_id !== id || !Number.isSafeInteger(value.candidate_revision) || value.candidate_revision < 0
    || !['initial', 'answer_append', 'evidence_repair'].includes(value.operation)
    || !['prepared', 'pending', 'acquired', 'rejected', 'accepted'].includes(value.phase)
    || !HASH.test(value.submitted_digest)
    || [value.base_state_ref, value.state_ref].some(ref => ref !== null && !HASH.test(ref))
    || (value.transaction_id !== null && !/^TXN-[0-9a-f]{64}$/u.test(value.transaction_id))) {
    throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  }
  if (value.base_binding) await verifyAcquisitionBindingV4(run, value.base_binding);
  return value;
}
/** @param {string} run @param {any} context */
export async function storeAcquisitionContextV4(run, context) {
  const value = { ...body(context), record_digest: hash(body(context)) };
  if (!ID.test(value.candidate_id)) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  await atomicWriteJson(run, location(run, 'candidates', value.candidate_id, 'context.json'), value);
  return value;
}
/** @param {string} run */
export async function currentAcquisitionContextV4(run) {
  const stored = await readJsonIfPresent(run, location(run, 'current.json'));
  if (!stored) return null;
  closed(stored.value, ['format_version', 'candidate_id', 'record_digest']); checkDigest(stored.value);
  if (stored.value.format_version !== '1.0.0') throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  const context = await readAcquisitionContextV4(run, stored.value.candidate_id);
  if (!context) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  return context;
}
/** @param {string} run @param {string} id */
export async function pointAcquisitionContextV4(run, id) {
  const value = { format_version: '1.0.0', candidate_id: id };
  await atomicWriteJson(run, location(run, 'current.json'), { ...value, record_digest: hash(value) });
}
/** @param {string} run @param {any} state */
export function acquisitionBaseLocationV4(run, state) {
  if (state.candidate_context_id !== undefined) {
    if (!ID.test(state.candidate_context_id) || !HASH.test(state.accepted_source_pack_digest)) {
      throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
    }
    return location(run, 'candidates', state.candidate_context_id,
      `base-${state.accepted_source_pack_digest.slice(7)}.json`);
  }
  if (!Number.isSafeInteger(state.committed_revision) || state.committed_revision < 0) {
    throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  return path.join(run, 'derived', `source-acquisition-base-${revisionName(state.committed_revision)}.json`);
}
/** Acceptance is proved by the existing completed revision journal and exact
 * accepted Source bytes, never by an acquired flag or revision equality.
 * @param {string} run @param {any} binding */
export async function verifyAcquisitionBindingV4(run, binding) {
  closed(binding, ['revision', 'source_digest', 'checkpoint_digest', 'transaction_id']);
  if (!Number.isSafeInteger(binding.revision) || binding.revision < 0
    || !HASH.test(binding.source_digest) || !HASH.test(binding.checkpoint_digest)
    || !/^TXN-[0-9a-f]{64}$/u.test(binding.transaction_id)) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  const text = await readTextIfPresent(run, path.join(run, 'accepted', revisionName(binding.revision), 'source-pack.json'));
  const transaction = (await readJsonIfPresent(run, path.join(run, 'transactions', 'revisions', `${binding.transaction_id}.json`)))?.value;
  if (text === null || bytesHash(text) !== binding.source_digest || !transaction
    || transaction.phase !== 'complete' || transaction.candidate_revision !== binding.revision
    || transaction.artifact_digests.source_pack !== binding.source_digest
    || transaction.artifact_digests.checkpoint !== binding.checkpoint_digest) {
    throw new TypeError('SOURCE_ACQUISITION_ACCEPTANCE_INVALID');
  }
  return JSON.parse(text);
}
/** @param {string} run @param {number} revision */
export async function acquisitionAcceptanceBindingV4(run, revision) {
  const committed = (await readJsonIfPresent(run, path.join(run, 'transactions', 'committed', `${revisionName(revision)}.json`)))?.value;
  if (!committed) return null;
  const binding = { revision, source_digest: committed.artifact_digests.source_pack,
    checkpoint_digest: committed.artifact_digests.checkpoint, transaction_id: committed.txn_id };
  await verifyAcquisitionBindingV4(run, binding);
  return binding;
}
/** @param {string} run @param {number} revision */
export async function readAcceptedAcquisitionV4(run, revision) {
  const stored = await readJsonIfPresent(run, location(run, 'accepted', `${revisionName(revision)}.json`));
  if (!stored) return null;
  const value = stored.value;
  closed(value, ['format_version', 'run_id', 'binding', 'state_ref', 'record_digest']); checkDigest(value);
  if (value.format_version !== '1.0.0' || value.binding?.revision !== revision || !HASH.test(value.state_ref)) {
    throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  }
  const source = await verifyAcquisitionBindingV4(run, value.binding);
  if (source.run_instance_id !== value.run_id) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_INVALID');
  return { ...value, state: await readAcquisitionSnapshotV4(run, value.state_ref), source };
}
/** @param {string} run @param {any} source @param {any} state */
export async function bindAcceptedAcquisitionV4(run, source, state) {
  const binding = await acquisitionAcceptanceBindingV4(run, source.source_revision);
  if (!binding) throw new TypeError('SOURCE_ACQUISITION_ACCEPTANCE_INVALID');
  const previous = await readAcceptedAcquisitionV4(run, source.source_revision);
  if (previous) {
    if (canonicalStringify(previous.state) !== canonicalStringify(state)) throw new TypeError('SOURCE_ACQUISITION_CONTEXT_CONFLICT');
    return previous;
  }
  const value = { format_version: '1.0.0', run_id: source.run_instance_id,
    binding, state_ref: await snapshotAcquisitionStateV4(run, state) };
  await writeAcquisitionImmutableV4(run, location(run, 'accepted', `${revisionName(source.source_revision)}.json`),
    { ...value, record_digest: hash(value) });
  return await readAcceptedAcquisitionV4(run, source.source_revision);
}
/** Select existing proven material ownership. The caller still performs ALL
 * normal state, event, source receipt and collection integrity checks.
 * @param {string} run @param {any} source */
export async function selectedAcquisitionStateV4(run, source) {
  const projection = (await readJsonIfPresent(run, path.join(run, 'derived', 'source-acquisition.json')))?.value ?? null;
  if (source.schema_version !== '4.3.3') return projection;
  const accepted = await readAcceptedAcquisitionV4(run, source.source_revision);
  if (accepted) return accepted.state;
  const checkpoint = (await readJsonIfPresent(run, path.join(run, 'checkpoint.json')))?.value;
  if (checkpoint?.run_id === source.run_instance_id && checkpoint.revision < source.source_revision) {
    const base = await readAcceptedAcquisitionV4(run, checkpoint.revision);
    const context = await currentAcquisitionContextV4(run);
    if (base && context?.candidate_id !== acquisitionCandidateKeyV4(source)
      && canonicalStringify(base.source.artifact_events) === canonicalStringify(source.artifact_events)) return base.state;
  }
  return projection;
}
