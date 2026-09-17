import { createHash } from 'node:crypto';
import path from 'node:path';

import { canonicalStringify, digest } from './canonical.mjs';
import {
  atomicWriteJson, readJsonIfPresent
} from './run-store.mjs';
import { v4ContractForIdentity } from './v4-contract.mjs';
import { SOURCE_RUNTIME_REGISTRY_VERSION_V4 } from './source-runtime-registry-v4.mjs';

const CHANNELS = Object.freeze(['body', 'table', 'image', 'comment', 'reply']);
const ENUMERATION = new Set(['exhausted', 'partial', 'unsupported', 'not_applicable']);
const ACQUISITION = new Set(['acquired', 'unavailable', 'unread']);
const REVIEW = new Set(['reviewed', 'unread', 'unavailable']);
const CREDENTIAL_KEY = /(?:^|[?&;\s])(?:authorization|cookie|password|passwd|secret|api[_-]?key|access[_-]?key|token|signature|sig|credential|security-token|x-amz-[a-z0-9-]+|x-oss-[a-z0-9-]+)\s*[:=]/iu;
const AUTH_VALUE = /(?:^|\s)(?:bearer|basic)\s+[a-z0-9+/=_-]+/iu;

/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value @param {string[]} keys */
function only(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every(key => keys.includes(key));
}
/** @param {string|Uint8Array} value */
function bytesDigest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
/** @param {unknown} value */
const valueDigest = value => `sha256:${digest(value)}`;
/** @param {string} runDirectory */
const stagingPath = runDirectory => path.join(runDirectory, 'staging', 'prd-collection.json');
/** @param {string} runDirectory */
const statePath = runDirectory => path.join(runDirectory, 'derived', 'source-acquisition.json');

/** The collection remains valid across append-only clarification revisions.
 * Bind only the immutable acquired/reviewed source surface, never workflow events. */
/** @param {Record<string, any>} sourcePack */
function sourceMaterialDigest(sourcePack) {
  return valueDigest({
    sources: sourcePack.sources,
    locators: sourcePack.locators,
    source_reviews: sourcePack.source_reviews,
    source_assets: sourcePack.source_assets,
    source_policy: sourcePack.source_policy
  });
}

/** @param {unknown} value */
function safeDurableValues(value) {
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') {
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(item)
        || CREDENTIAL_KEY.test(item) || AUTH_VALUE.test(item)) return false;
      if (/^https?:\/\//iu.test(item)) {
        try {
          const url = new URL(item);
          if (url.username || url.password
            || [...url.searchParams.keys()].some(key => CREDENTIAL_KEY.test(`?${key}=`))) return false;
        } catch { return false; }
      }
    } else if (Array.isArray(item)) {
      for (const child of item) pending.push(child);
    } else if (record(item)) {
      for (const [key, child] of Object.entries(item)) pending.push(key, child);
    }
  }
  return true;
}

/** @param {unknown} reply @param {Record<string, any>} identity */
function validateReply(reply, identity) {
  if (!record(reply) || reply.status !== 'need_revision' || reply.stage !== 'source_pack'
    || reply.run_id !== identity.run_id || !record(reply.scope)
    || reply.scope.run_instance_id !== identity.run_id
    || !Number.isSafeInteger(reply.scope.source_revision) || reply.scope.source_revision < 0) {
    throw new TypeError('SOURCE_COLLECTION_REPLY_STALE');
  }
  return reply.scope.source_revision;
}

/** @param {unknown} input */
function validateObservation(input) {
  if (!record(input)) throw new TypeError('SOURCE_COLLECTION_OBSERVATION_INVALID');
  const observation = input;
  if (!only(observation, ['version', 'scope', 'channels', 'items']) || observation.version !== '1.0.0'
    || !only(observation.scope, ['mode', 'root_ref', 'collection_window', 'source_version'])
    || !['online_document', 'provided_materials'].includes(observation.scope.mode)
    || typeof observation.scope.root_ref !== 'string' || !observation.scope.root_ref.trim()
    || !only(observation.scope.collection_window, ['started_at', 'ended_at'])
    || typeof observation.scope.collection_window.started_at !== 'string'
    || typeof observation.scope.collection_window.ended_at !== 'string'
    || !(typeof observation.scope.source_version === 'string' || observation.scope.source_version === null)
    || !Array.isArray(observation.channels) || !Array.isArray(observation.items)
    || !safeDurableValues(observation)) {
    throw new TypeError('SOURCE_COLLECTION_OBSERVATION_INVALID');
  }
  const channels = new Map();
  for (const item of observation.channels) {
    if (!only(item, ['channel', 'enumeration_status', 'page_count', 'terminal_page_observed', 'diagnostic_code'])
      || !CHANNELS.includes(item.channel) || channels.has(item.channel)
      || !ENUMERATION.has(item.enumeration_status)
      || !Number.isSafeInteger(item.page_count) || item.page_count < 0
      || typeof item.terminal_page_observed !== 'boolean'
      || !(typeof item.diagnostic_code === 'string' || item.diagnostic_code === null)
      || (item.enumeration_status === 'exhausted' && !item.terminal_page_observed)
      || (item.enumeration_status !== 'partial' && item.diagnostic_code !== null)) {
      throw new TypeError('SOURCE_COLLECTION_OBSERVATION_INVALID');
    }
    channels.set(item.channel, item);
  }
  if (channels.size !== CHANNELS.length || CHANNELS.some(channel => !channels.has(channel))) {
    throw new TypeError('SOURCE_COLLECTION_OBSERVATION_INVALID');
  }
  const ids = new Set();
  for (const item of observation.items) {
    if (!only(item, ['item_id', 'parent_item_id', 'channel', 'source_id', 'asset_id', 'unit_ids', 'acquisition_status', 'review_status', 'unavailable_reason'])
      || typeof item.item_id !== 'string' || !item.item_id.trim() || ids.has(item.item_id)
      || !(typeof item.parent_item_id === 'string' || item.parent_item_id === null)
      || !CHANNELS.includes(item.channel) || typeof item.source_id !== 'string' || !item.source_id.trim()
      || !(typeof item.asset_id === 'string' || item.asset_id === null)
      || !Array.isArray(item.unit_ids) || new Set(item.unit_ids).size !== item.unit_ids.length
      || item.unit_ids.some((/** @type {any} */ unitId) => typeof unitId !== 'string' || !unitId.trim())
      || !ACQUISITION.has(item.acquisition_status) || !REVIEW.has(item.review_status)
      || !(typeof item.unavailable_reason === 'string' || item.unavailable_reason === null)
      || (item.channel === 'reply' ? item.parent_item_id === null : item.parent_item_id !== null)
      || (item.channel === 'image' ? item.asset_id === null : item.asset_id !== null)
      || (item.acquisition_status === 'acquired' ? item.unavailable_reason !== null : !item.unavailable_reason)
      || (item.review_status === 'reviewed' && item.acquisition_status !== 'acquired')) {
      throw new TypeError('SOURCE_COLLECTION_OBSERVATION_INVALID');
    }
    ids.add(item.item_id);
  }
  const itemById = new Map(observation.items.map((/** @type {any} */ item) => [item.item_id, item]));
  for (const item of observation.items) if (item.parent_item_id !== null) {
    const parent = itemById.get(item.parent_item_id);
    if (!parent || item.parent_item_id === item.item_id
      || (item.channel === 'reply' && !['comment', 'reply'].includes(parent.channel))) {
      throw new TypeError('SOURCE_COLLECTION_OBSERVATION_INVALID');
    }
  }
  if (observation.scope.mode === 'online_document'
    && ['body', 'table'].some(channel => channels.get(channel).enumeration_status === 'not_applicable')) {
    throw new TypeError('SOURCE_COLLECTION_OBSERVATION_INVALID');
  }
  return structuredClone(observation);
}

/** @param {Record<string, any>} observation @param {unknown} submittedMaterials */
function materializeSession(observation, submittedMaterials) {
  if (!Array.isArray(submittedMaterials)) throw new TypeError('SOURCE_COLLECTION_MATERIAL_INVALID');
  const materials = new Map();
  for (const material of submittedMaterials) {
    if (!only(material, ['item_id', 'raw_response_bytes', 'capture_bytes'])
      || typeof material.item_id !== 'string' || materials.has(material.item_id)
      || !(material.raw_response_bytes instanceof Uint8Array)
      || !(material.capture_bytes instanceof Uint8Array)) {
      throw new TypeError('SOURCE_COLLECTION_MATERIAL_INVALID');
    }
    materials.set(material.item_id, material);
  }
  const acquired = observation.items.filter((/** @type {any} */ item) => item.acquisition_status === 'acquired');
  if (materials.size !== acquired.length || acquired.some((/** @type {any} */ item) => !materials.has(item.item_id))) {
    throw new TypeError('SOURCE_COLLECTION_MATERIAL_INCOMPLETE');
  }
  const items = observation.items.map((/** @type {any} */ item) => {
    const material = materials.get(item.item_id);
    return {
      ...item,
      raw_response_digest: material ? bytesDigest(material.raw_response_bytes) : null,
      capture_digest: material ? bytesDigest(material.capture_bytes) : null
    };
  });
  const body = {
    version: observation.version,
    scope: structuredClone(observation.scope),
    channels: structuredClone(observation.channels),
    items
  };
  return { ...body, session_digest: valueDigest(body) };
}

/** @param {Record<string, any>} session @param {Record<string, any>} sourcePack */
function bindSession(session, sourcePack) {
  if (session.scope.source_version !== null) {
    const versions = new Set(session.items.map((/** @type {any} */ item) => sourcePack.sources.find(
      (/** @type {any} */ source) => source.source_id === item.source_id
    )?.version));
    if (versions.size !== 1 || !versions.has(session.scope.source_version)) {
      throw new TypeError('SOURCE_COLLECTION_VERSION_CHANGED');
    }
  }
  const bindings = session.items.map((/** @type {any} */ item) => {
    const source = sourcePack.sources.find((/** @type {any} */ value) => value.source_id === item.source_id);
    const review = sourcePack.source_reviews.find((/** @type {any} */ value) => value.source_id === item.source_id);
    if (!source || !review || !Array.isArray(source.semantic_projection?.structure)
      || !Array.isArray(review.units)) throw new TypeError('SOURCE_COLLECTION_BINDING_INVALID');
    const availableUnits = new Set(source.semantic_projection.structure.map((/** @type {any} */ unit) => unit.unit_id));
    const reviewed = item.unit_ids.map((/** @type {any} */ unitId) => review.units.find((/** @type {any} */ unit) => unit.unit_id === unitId));
    if (item.unit_ids.some((/** @type {any} */ unitId) => !availableUnits.has(unitId)) || reviewed.some((/** @type {any} */ value) => !value)) {
      throw new TypeError('SOURCE_COLLECTION_BINDING_INVALID');
    }
    const asset = item.asset_id === null ? null : sourcePack.source_assets.find((/** @type {any} */ value) =>
      value.source_id === item.source_id && value.asset_id === item.asset_id && value.status === 'reviewed');
    if (item.asset_id !== null && !asset) {
      throw new TypeError('SOURCE_COLLECTION_BINDING_INVALID');
    }
    if (item.acquisition_status === 'acquired'
      && item.capture_digest !== (asset?.asset_digest ?? source.capture_digest)) {
      throw new TypeError('SOURCE_COLLECTION_BINDING_INVALID');
    }
    const classifications = [...new Set(reviewed.map((/** @type {any} */ value) => value.classification))];
    return {
      item_id: item.item_id, source_id: item.source_id, asset_id: item.asset_id,
      unit_ids: structuredClone(item.unit_ids),
      raw_response_digest: item.raw_response_digest,
      capture_digest: item.capture_digest,
      review_classification: classifications.length === 1 ? classifications[0] : 'mixed'
    };
  });
  return { ...structuredClone(session), bindings };
}

/** @param {Record<string, any>} session @param {Record<string, any>} sourcePack */
function summaryFor(session, sourcePack) {
  const limitations = [];
  for (const channel of session.channels) if (!['exhausted', 'not_applicable'].includes(channel.enumeration_status)) {
    limitations.push(channel.diagnostic_code ?? `${channel.channel.toUpperCase()}_ENUMERATION_${channel.enumeration_status.toUpperCase()}`);
  }
  for (const item of session.items) if (item.acquisition_status !== 'acquired' || item.review_status !== 'reviewed') {
    limitations.push(item.unavailable_reason ?? `${item.item_id}:NOT_FULLY_REVIEWED`);
  }
  const status = limitations.length ? 'incomplete' : 'complete_within_scope';
  const sourceBinding = {
    source_material_digest: sourceMaterialDigest(sourcePack),
    source_semantic_digests: sourcePack.sources.map((/** @type {any} */ source) => ({
      source_id: source.source_id, semantic_digest: source.semantic_digest ?? null
    })),
    session_digest: session.session_digest
  };
  return {
    version: '1.0.0', source_binding_digest: valueDigest(sourceBinding),
    scope: structuredClone(session.scope), status,
    items: session.items.map((/** @type {any} */ item) => ({
      item_id: item.item_id, parent_item_id: item.parent_item_id, channel: item.channel,
      acquisition_status: item.acquisition_status, review_status: item.review_status,
      source_id: item.source_id, asset_id: item.asset_id
    })),
    limitations: [...new Set(limitations)].sort()
  };
}

/**
 * Stage safe digests for a collection observation bound to the runner's current
 * source request. Raw response/capture bytes are verified in memory and never
 * persisted by this adapter.
 */
export async function stageV4PrdCollectionObservation(
  /** @type {string} */ runDirectory,
  /** @type {unknown} */ submittedReply,
  /** @type {unknown} */ submittedObservation,
  /** @type {unknown} */ submittedMaterials
) {
  if (typeof runDirectory !== 'string' || !path.isAbsolute(runDirectory)) {
    throw new TypeError('RUN_DIRECTORY_NOT_ABSOLUTE');
  }
  const identity = (await readJsonIfPresent(runDirectory, path.join(runDirectory, 'run-instance.json')))?.value;
  const contract = v4ContractForIdentity(identity);
  if (!contract?.candidate) throw new TypeError('SOURCE_COLLECTION_CONTRACT_UNSUPPORTED');
  const revision = validateReply(submittedReply, identity);
  const observation = validateObservation(submittedObservation);
  const session = materializeSession(observation, submittedMaterials);
  const body = {
    schema_version: contract.schema_version,
    compiler_version: contract.compiler_version,
    registry_version: SOURCE_RUNTIME_REGISTRY_VERSION_V4,
    run_id: identity.run_id, source_revision: revision, collection_session: session
  };
  const candidate = { ...body, staging_digest: valueDigest(body) };
  const existing = await readJsonIfPresent(runDirectory, stagingPath(runDirectory));
  if (existing) {
    if (canonicalStringify(existing.value) !== canonicalStringify(candidate)) {
      throw new TypeError('SOURCE_COLLECTION_IDEMPOTENCY_CONFLICT');
    }
  } else await atomicWriteJson(runDirectory, stagingPath(runDirectory), candidate);
  return {
    status: 'staged', run_id: identity.run_id, source_revision: revision,
    collection_digest: session.session_digest, item_count: session.items.length
  };
}

/** Bind the staged technical observation to actual Source/asset/review IDs. */
export async function bindV4PrdCollectionObservation(
  /** @type {string} */ runDirectory,
  /** @type {unknown} */ submittedSourcePack
) {
  const staged = await readJsonIfPresent(runDirectory, stagingPath(runDirectory));
  const sourcePack = /** @type {any} */ (structuredClone(submittedSourcePack));
  const contract = staged ? v4ContractForIdentity(staged.value) : null;
  if (!staged || !contract?.candidate || !record(sourcePack)
    || sourcePack.schema_version !== contract.schema_version
    || staged.value.run_id !== sourcePack.run_instance_id
    || staged.value.source_revision !== sourcePack.source_revision) {
    throw new TypeError('SOURCE_COLLECTION_BINDING_INVALID');
  }
  const session = bindSession(staged.value.collection_session, sourcePack);
  const summary = summaryFor(session, sourcePack);
  const body = {
    schema_version: contract.schema_version,
    compiler_version: contract.compiler_version,
    registry_version: SOURCE_RUNTIME_REGISTRY_VERSION_V4,
    run_id: sourcePack.run_instance_id, committed_revision: sourcePack.source_revision,
    status: 'collected', collection_sessions: [session], summary,
    source_material_digest: sourceMaterialDigest(sourcePack),
    accepted_source_pack_digest: valueDigest(sourcePack)
  };
  const state = { ...body, state_digest: valueDigest(body) };
  const existing = await readJsonIfPresent(runDirectory, statePath(runDirectory));
  if (existing && canonicalStringify(existing.value) !== canonicalStringify(state)) {
    throw new TypeError('SOURCE_COLLECTION_IDEMPOTENCY_CONFLICT');
  }
  if (!existing) await atomicWriteJson(runDirectory, statePath(runDirectory), state);
  return structuredClone(state);
}

/** Read only a digest-bound summary; it cannot introduce business semantics. */
export async function loadV4SourceReadingSummary(
  /** @type {string} */ runDirectory,
  /** @type {Record<string,any>} */ sourcePack
) {
  const stored = await readJsonIfPresent(runDirectory, statePath(runDirectory));
  if (!stored || stored.value.status !== 'collected'
    || stored.value.source_material_digest !== sourceMaterialDigest(sourcePack)) {
    throw new TypeError('SOURCE_READING_BINDING_INVALID');
  }
  return structuredClone(stored.value.summary);
}
