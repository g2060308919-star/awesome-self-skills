import { constants } from 'node:fs';
import { open, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';

import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import sourceReadingSchema from '../skill/generate-test-cases/scripts/schemas/source-reading.schema.json' with { type: 'json' };

import { canonicalStringify, digest } from './canonical.mjs';
import {
  canonicalizeSourceCapture, canonicalizeSourceUrl, sourceAcquisitionInventory,
  sourceByteDigest
} from './source-canonicalization.mjs';
import {
  acceptProvidedArtifact, createArtifactRequest, createArtifactResumeRef,
  createProvideArtifactEvent,
  validateProvideArtifactEvent
} from './source-events.mjs';
import {
  compileAuditedSource, sourceAcquisitionIdentityDigestV4
} from './source-compiler-v4.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { createNeedArtifactReplyV4 } from './stop-replies-v4.mjs';
import {
  atomicWriteBytes, atomicWriteJson, atomicWriteText, readJsonIfPresent, readTextIfPresent,
  stagingPath
} from './run-store.mjs';
import {
  createCompilerSourceRuntimeV4, SOURCE_RUNTIME_REGISTRY_VERSION_V4
} from './source-runtime-registry-v4.mjs';
import { isCandidateV4SchemaVersion } from './v4-contract.mjs';
import {
  bindV4PrdCollectionObservation, loadV4SourceReadingSummary
} from './prd-source-collection-v4.mjs';
import { v4ContractForIdentity, v4ContractForSchema } from './v4-contract.mjs';

const SCHEMA_VERSION = '4.0.0';
const COMPILER_VERSION = '0.5.0';
const EVENT_ID = /^EVENT-[0-9a-f]{64}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const encoder = new TextEncoder();

/** @param {unknown} value @returns {value is Record<string,any>} */
function record(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value @param {string[]} keys */
function only(value, keys) {
  return record(value) && Object.keys(value).length === keys.length
    && Object.keys(value).every(key => keys.includes(key));
}
/** @param {unknown} value */
const hash = value => `sha256:${digest(value)}`;
/** @param {string} left @param {string} right */
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

/** Compiler-owned acquisition coordination record. */
/** @param {string} runDirectory */
export function sourceAcquisitionStatePathV4(runDirectory) {
  return path.join(runDirectory, 'derived', 'source-acquisition.json');
}

/** Private Adapter material seam. It is not a fifth semantic artifact. */
/** @param {string} runDirectory @param {string} eventId */
export function sourceAcquisitionMaterialPathV4(runDirectory, eventId) {
  if (!EVENT_ID.test(eventId)) throw new TypeError('ARTIFACT_EVENT_INVALID');
  return path.join(runDirectory, 'staging', 'source-acquisition', `${eventId}.bin`);
}

/** @param {string} runDirectory @param {string} eventId */
async function readStagedMaterial(runDirectory, eventId) {
  const target = sourceAcquisitionMaterialPathV4(runDirectory, eventId);
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    const status = await handle.stat();
    if (!status.isFile()) throw new TypeError('ARTIFACT_BYTES_UNAVAILABLE');
    const value = await handle.readFile();
    return new Uint8Array(value);
  } catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return null;
    throw error;
  } finally {
    if (handle) await handle.close();
  }
}

/** @param {string} runDirectory @param {string} eventId */
async function discardMaterial(runDirectory, eventId) {
  try { await unlink(sourceAcquisitionMaterialPathV4(runDirectory, eventId)); }
  catch (error) { if (/** @type {any} */ (error)?.code !== 'ENOENT') throw error; }
}

/** Remove every compiler-addressable raw object for this isolated run. A
 * malformed/incomplete candidate may omit an event whose resolver already
 * staged bytes, so cleaning only submitted event IDs is insufficient.
 * @param {string} runDirectory */
async function discardAllMaterial(runDirectory) {
  const directory = path.join(runDirectory, 'staging', 'source-acquisition');
  let names;
  try { names = await readdir(directory); }
  catch (error) {
    if (/** @type {any} */ (error)?.code === 'ENOENT') return;
    throw error;
  }
  for (const name of names) {
    if (/^EVENT-[0-9a-f]{64}\.bin$/u.test(name)) {
      await discardMaterial(runDirectory, name.slice(0, -4));
    }
  }
}

/** The acquisition checkpoint is the committed resume point only while the
 * source request is pending. Once every material event is committed, the first
 * semantic revision transaction must again begin from its null base. */
/** @param {string} runDirectory @param {string} checkpointText @param {boolean} checkpointCreated */
async function retireAcquisitionCheckpoint(runDirectory, checkpointText, checkpointCreated) {
  const target = path.join(runDirectory, 'checkpoint.json');
  const current = await readTextIfPresent(runDirectory, target);
  if (current === null) {
    if (!checkpointCreated) throw new TypeError('ARTIFACT_RESUME_STALE');
    return;
  }
  if (current !== checkpointText) throw new TypeError('ARTIFACT_RESUME_STALE');
  if (checkpointCreated) await unlink(target);
}

/** @param {string} runId @param {number} revision @param {{schema_version:string,compiler_version:string}} contract */
function genesisCheckpoint(runId, revision, contract) {
  return `${canonicalStringify({
    schema_version: contract.schema_version, compiler_version: contract.compiler_version,
    run_id: runId, revision, phase: 'source_acquisition'
  })}\n`;
}

/** @param {any} value @param {string} pointer @param {string} sourceId @param {any[]} output */
function collectStrings(value, pointer, sourceId, output) {
  if (typeof value === 'string') {
    output.push({ pointer, value, source_id: sourceId });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${pointer}/${index}`, sourceId, output));
    return;
  }
  if (!record(value)) return;
  const localSourceId = typeof value.source_id === 'string' ? value.source_id : sourceId;
  for (const [key, item] of Object.entries(value)) {
    const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1');
    collectStrings(item, `${pointer}/${escaped}`, localSourceId, output);
  }
}

/** Resolve a top-level clarification/locator copy of a user statement back to
 * the one canonical source that carries that statement. This keeps the raw URI
 * out of durable request state while allowing the safe replacement capture to
 * be verified against a real source rather than a synthetic Source Pack ID.
 * @param {any} sourcePack @param {{pointer:string,value:string,source_id:string}} item */
function acquisitionSourceId(sourcePack, item) {
  if (item.source_id !== 'source-pack') return item.source_id;
  const matches = sourcePack.sources.filter((/** @type {any} */ source) =>
    Array.isArray(source?.semantic_projection?.structure)
      && source.semantic_projection.structure.some((/** @type {any} */ unit) =>
        unit?.type === 'user_statement' && typeof unit.text === 'string'
          && unit.text.includes(item.value)
      )
  );
  if (matches.length === 1) return matches[0].source_id;
  if (sourcePack.sources.length === 1) return sourcePack.sources[0].source_id;
  throw new TypeError('ARTIFACT_SOURCE_BINDING_AMBIGUOUS');
}

/** No credential-bearing value is returned. @param {any} sourcePack @param {any} context
 * @param {any|null} [existing] */
function discoverRequests(sourcePack, context, existing = null) {
  const { provider_registry: registry } = createCompilerSourceRuntimeV4();
  /** @type {Array<{pointer:string,value:string,source_id:string}>} */
  const strings = [];
  collectStrings(sourcePack, '', 'source-pack', strings);
  /** @type {any[]} */ const requests = [];
  /** @type {any[]} */ const bindings = [];
  for (const item of strings) {
    let inventory;
    try { inventory = sourceAcquisitionInventory(encoder.encode(item.value), registry); }
    catch { continue; }
    for (const inventoried of inventory.references) {
      const quarantined = inventoried.reference;
      if (quarantined.status !== 'need_artifact' && quarantined.credential_pairs_removed !== true) continue;
      const sourceId = acquisitionSourceId(sourcePack, item);
      const unsupported = quarantined.status === 'need_artifact';
      const request = createArtifactRequest({
        ...context, stable_source_id: sourceId,
        structural_locator: { kind: 'json_string', pointer: item.pointer || '/' },
        url_ordinal: inventoried.ordinal,
        reason_code: unsupported
          ? 'UNSUPPORTED_SIGNED_URL_PROVIDER' : 'SOURCE_ASSET_UNAVAILABLE',
        allowed_input_kinds: ['stable_resource_id', 'safe_upload_ref']
      }, quarantined);
      requests.push(request);
      bindings.push({
        artifact_request_id: request.artifact_request_id,
        source_id: sourceId,
        target: 'capture'
      });
    }
  }
  const alreadyRequestedAssets = new Set((existing?.bindings ?? [])
    .filter((/** @type {any} */ binding) => binding.target === 'asset')
    .map((/** @type {any} */ binding) => `${binding.source_id}\0${binding.asset_id}`));
  if (!existing) for (const [assetIndex, asset] of sourcePack.source_assets.entries()) {
    if (alreadyRequestedAssets.has(`${asset.source_id}\0${asset.asset_id}`)) continue;
    const source = sourcePack.sources.find((/** @type {any} */ item) => item.source_id === asset.source_id);
    if (!source) continue;
    const reference = canonicalizeSourceUrl(asset.canonical_uri, registry);
    if (!['canonical', 'need_artifact'].includes(reference.status)) continue;
    const unitOrdinal = source.semantic_projection?.structure?.findIndex(
      (/** @type {any} */ unit) => unit.type === 'image' && unit.text.includes(asset.canonical_uri)
    );
    const request = createArtifactRequest({
      ...context,
      stable_source_id: asset.source_id,
      structural_locator: {
        unit_kind: 'image',
        unit_ordinal: unitOrdinal >= 0 ? unitOrdinal : assetIndex
      },
      url_ordinal: 0,
      reason_code: reference.status === 'need_artifact'
        ? 'UNSUPPORTED_SIGNED_URL_PROVIDER' : 'SOURCE_ASSET_UNAVAILABLE',
      allowed_input_kinds: ['stable_resource_id', 'safe_upload_ref']
    }, reference);
    requests.push(request);
    bindings.push({
      artifact_request_id: request.artifact_request_id,
      source_id: asset.source_id,
      target: 'asset',
      asset_id: asset.asset_id
    });
  }
  const orderedRequests = requests.sort((a, b) => compare(a.artifact_request_id, b.artifact_request_id));
  const orderedBindings = bindings.sort((a, b) => compare(a.artifact_request_id, b.artifact_request_id));
  if (new Set(orderedRequests.map(item => item.artifact_request_id)).size !== orderedRequests.length) {
    throw new TypeError('ARTIFACT_REQUEST_SET_INVALID');
  }
  return { requests: orderedRequests, bindings: orderedBindings };
}

/** @param {any} state */
function stateBody(state) {
  const { state_digest: ignored, ...body } = state;
  return body;
}

/** @param {any} state */
function validateStateShape(state) {
  const legacyKeys = [
    'schema_version', 'compiler_version', 'registry_version', 'run_id', 'committed_revision', 'status',
    'checkpoint_text', 'checkpoint_created', 'artifact_requests', 'resume_ref', 'bindings',
    'request_history', 'base_event_count', 'events',
    'acquisitions', 'source_receipts', 'accepted_source_pack_digest', 'state_digest'
  ];
  const collectionKeys = [
    'schema_version', 'compiler_version', 'registry_version', 'run_id', 'committed_revision',
    'status', 'collection_sessions', 'summary', 'source_material_digest',
    'accepted_source_pack_digest', 'state_digest'
  ];
  const contract = v4ContractForIdentity(state);
  if (contract?.candidate && state.status === 'collected') {
    if (!only(state, collectionKeys)
      || state.registry_version !== SOURCE_RUNTIME_REGISTRY_VERSION_V4
      || typeof state.run_id !== 'string'
      || !Number.isSafeInteger(state.committed_revision) || state.committed_revision < 0
      || !Array.isArray(state.collection_sessions) || state.collection_sessions.length !== 1
      || validateAgainstSchema(state.summary, sourceReadingSchema).length
      || !HASH.test(state.source_material_digest)
      || !HASH.test(state.accepted_source_pack_digest)
      || !HASH.test(state.state_digest) || state.state_digest !== hash(stateBody(state))) {
      throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
    }
    return { state, checkpointBytes: null };
  }
  const keys = contract?.candidate
    ? [...legacyKeys.slice(0, -1), 'collection_sessions', 'summary', 'state_digest']
    : legacyKeys;
  if (!only(state, keys) || !contract
    || state.registry_version !== SOURCE_RUNTIME_REGISTRY_VERSION_V4
    || typeof state.run_id !== 'string'
    || !Number.isSafeInteger(state.committed_revision) || state.committed_revision < 0
    || !Number.isSafeInteger(state.base_event_count) || state.base_event_count < 0
    || !['pending', 'acquired'].includes(state.status) || typeof state.checkpoint_text !== 'string'
    || typeof state.checkpoint_created !== 'boolean'
    || !Array.isArray(state.artifact_requests) || state.artifact_requests.length === 0
    || !Array.isArray(state.bindings) || !Array.isArray(state.request_history)
    || state.request_history.length === 0 || !Array.isArray(state.events)
    || !Array.isArray(state.acquisitions) || !Array.isArray(state.source_receipts)
    || (contract.candidate && (!Array.isArray(state.collection_sessions)
      || state.collection_sessions.length !== 1
      || validateAgainstSchema(state.summary, sourceReadingSchema).length))
    || !HASH.test(state.state_digest) || state.state_digest !== hash(stateBody(state))) {
    throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  const checkpointBytes = encoder.encode(state.checkpoint_text);
  const expectedResume = createArtifactResumeRef({
    run_id: state.run_id, committed_revision: state.committed_revision,
    checkpoint_bytes: checkpointBytes, artifact_requests: state.artifact_requests
  });
  const invalidHistory = state.request_history.some((/** @type {any} */ cycle, /** @type {number} */ index) => {
    if (!only(cycle, ['committed_revision', 'checkpoint_text', 'artifact_requests'])
      || !Number.isSafeInteger(cycle.committed_revision) || cycle.committed_revision < 0
      || typeof cycle.checkpoint_text !== 'string' || !Array.isArray(cycle.artifact_requests)
      || cycle.artifact_requests.length === 0
      || (index > 0 && state.request_history[index - 1].committed_revision >= cycle.committed_revision)) {
      return true;
    }
    try {
      createArtifactResumeRef({
        run_id: state.run_id, committed_revision: cycle.committed_revision,
        checkpoint_bytes: encoder.encode(cycle.checkpoint_text),
        artifact_requests: cycle.artifact_requests
      });
      return false;
    } catch { return true; }
  });
  const latestCycle = state.request_history.at(-1);
  if (canonicalStringify(expectedResume) !== canonicalStringify(state.resume_ref)
    || invalidHistory
    || latestCycle.committed_revision !== state.committed_revision
    || latestCycle.checkpoint_text !== state.checkpoint_text
    || canonicalStringify(latestCycle.artifact_requests) !== canonicalStringify(state.artifact_requests)
    || state.bindings.length !== state.artifact_requests.length
    || state.bindings.some((/** @type {any} */ binding, /** @type {number} */ index) => !only(
      binding,
      binding?.target === 'asset'
        ? ['artifact_request_id', 'source_id', 'target', 'asset_id']
        : ['artifact_request_id', 'source_id', 'target']
    )
      || binding.artifact_request_id !== state.artifact_requests[index].artifact_request_id
      || typeof binding.source_id !== 'string' || !binding.source_id.trim()
      || !['capture', 'asset'].includes(binding.target)
      || (binding.target === 'asset' && (typeof binding.asset_id !== 'string' || !binding.asset_id.trim())))) {
    throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  const invalidReceipt = state.source_receipts.some((/** @type {any} */ receipt) => !only(receipt, [
    'source_id', 'source_artifact_digest', 'capture_digest', 'semantic_digest',
    'artifact_event_ids'
  ]) || typeof receipt.source_id !== 'string' || !receipt.source_id.trim()
    || !HASH.test(receipt.source_artifact_digest) || !HASH.test(receipt.capture_digest)
    || !HASH.test(receipt.semantic_digest) || !Array.isArray(receipt.artifact_event_ids)
    || receipt.artifact_event_ids.length === 0
    || receipt.artifact_event_ids.some((/** @type {any} */ id) => !EVENT_ID.test(id)));
  if (state.status === 'pending') {
    if (state.events.length !== state.base_event_count
      || state.acquisitions.length !== state.base_event_count
      || invalidReceipt
      || state.accepted_source_pack_digest !== null) {
      throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
    }
  } else if (state.events.length !== state.base_event_count + state.artifact_requests.length
    || state.acquisitions.length !== state.events.length
    || state.source_receipts.length === 0
    || !HASH.test(state.accepted_source_pack_digest)
    || invalidReceipt) {
    throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  return { state, checkpointBytes };
}

/** @param {string} runDirectory */
async function loadState(runDirectory) {
  const stored = await readJsonIfPresent(runDirectory, sourceAcquisitionStatePathV4(runDirectory));
  return stored ? validateStateShape(stored.value).state : null;
}

/** @param {any} state */
function stopReply(state) {
  return createNeedArtifactReplyV4({
    run_id: state.run_id, artifact_requests: state.artifact_requests,
    resume_ref: state.resume_ref, produced_artifacts: [], non_blocking_diagnostics: []
  });
}

const SOURCE_METADATA_KEYS = [
  'source_id', 'kind', 'version', 'status', 'authority', 'title', 'scope', 'domain'
];

/** @param {any} source */
function sourceMetadata(source) {
  return Object.fromEntries(SOURCE_METADATA_KEYS
    .filter(key => source[key] !== undefined)
    .map(key => [key, source[key]]));
}

/** Verify all short-lived bytes against the exact canonical Source Pack and
 * return only safe, digest-bound receipts. No capture or asset bytes leave this
 * function. @param {any} sourcePack @param {any[]} bindings
 * @param {any[]} events @param {Map<string,Uint8Array>} material */
function verifyCandidateSources(sourcePack, bindings, events, material) {
  const runtime = createCompilerSourceRuntimeV4();
  const eventByRequest = new Map(events.map((/** @type {any} */ event) => [
    event.artifact_request_id, event
  ]));
  const affectedSourceIds = [...new Set(bindings.map((/** @type {any} */ binding) => binding.source_id))]
    .sort(compare);
  return affectedSourceIds.map(sourceId => {
    const source = sourcePack.sources.find((/** @type {any} */ item) => item.source_id === sourceId);
    if (!source || !record(source.semantic_projection)) {
      throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
    }
    const sourceBindings = bindings.filter((/** @type {any} */ binding) => binding.source_id === sourceId);
    const captureBindings = sourceBindings.filter((/** @type {any} */ binding) => binding.target === 'capture');
    /** @type {Uint8Array} */
    let captureBytes = encoder.encode(source.semantic_projection.content);
    let acquisition = {};
    if (captureBindings.length) {
      const captures = captureBindings.map((/** @type {any} */ binding) => material.get(binding.artifact_request_id));
      if (captures.some((/** @type {any} */ bytes) => !(bytes instanceof Uint8Array))
        || new Set(captures.map((/** @type {any} */ bytes) => sourceByteDigest(bytes))).size !== 1) {
        throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
      }
      captureBytes = /** @type {Uint8Array} */ (captures[0]);
      const stableInputs = captureBindings.map((/** @type {any} */ binding) =>
        eventByRequest.get(binding.artifact_request_id)?.input
      ).filter((/** @type {any} */ input) => input?.kind === 'stable_resource_id');
      if (stableInputs.length) {
        const contracts = new Set(stableInputs.map((/** @type {any} */ input) =>
          `${input.provider}\0${input.provider_contract_version}`
        ));
        if (contracts.size !== 1) throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
        acquisition = {
          provider: stableInputs[0].provider,
          provider_contract_version: stableInputs[0].provider_contract_version
        };
      }
    } else if (source.capture_audit?.semantic_exclusions?.length) {
      // Excluded capture text cannot be reconstructed from the accepted semantic
      // projection. It must have been verified through a capture event.
      throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
    }

    /** @type {any[]} */
    const assets = [];
    for (const binding of sourceBindings.filter((/** @type {any} */ item) => item.target === 'asset')) {
      const bytes = material.get(binding.artifact_request_id);
      const record = sourcePack.source_assets.find((/** @type {any} */ item) =>
        item.source_id === sourceId && item.asset_id === binding.asset_id
      );
      if (!(bytes instanceof Uint8Array) || !record || record.status !== 'reviewed'
        || record.asset_digest !== sourceByteDigest(bytes)
        || !source.semantic_projection.assets.some((/** @type {any} */ asset) =>
          asset.canonical_uri === record.canonical_uri && asset.asset_digest === record.asset_digest
        )) throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
      assets.push({ retrieval_uri: record.canonical_uri, bytes });
    }
    if (source.semantic_projection.assets.length !== assets.length) {
      throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
    }
    const result = compileAuditedSource(sourceMetadata(source), {
      source_id: sourceId,
      input: {
        stable_source_id: sourceId, source_type: source.kind,
        capture_bytes: captureBytes, assets
      },
      acquisition,
      additional_units: source.semantic_projection.structure.filter(
        (/** @type {any} */ unit) => ['image_region', 'user_statement'].includes(unit.type)
      )
    }, {
      provider_registry: runtime.provider_registry,
      expiry_registry: runtime.expiry_registry
    });
    if (result.status !== 'canonical'
      || canonicalStringify(result.source) !== canonicalStringify(source)) {
      throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
    }
    return {
      source_id: sourceId,
      source_artifact_digest: sourceAcquisitionIdentityDigestV4(source),
      capture_digest: source.capture_digest,
      semantic_digest: source.semantic_digest,
      artifact_event_ids: sourceBindings.map((/** @type {any} */ binding) =>
        eventByRequest.get(binding.artifact_request_id)?.event_id
      ).sort(compare)
    };
  });
}

/** @param {any} source @param {any[]} sourceBindings
 * @param {Map<string,any>} eventByRequest @param {Map<string,Uint8Array>} material
 * @param {any} sourcePack */
function compileResumedSource(source, sourceBindings, eventByRequest, material, sourcePack) {
  const runtime = createCompilerSourceRuntimeV4();
  const captureBindings = sourceBindings.filter((/** @type {any} */ item) => item.target === 'capture');
  /** @type {any} */
  let captureBytes = encoder.encode(source.semantic_projection.content);
  let acquisition = {};
  if (captureBindings.length) {
    const captures = captureBindings.map((/** @type {any} */ binding) =>
      material.get(binding.artifact_request_id)
    );
    if (captures.some((/** @type {any} */ bytes) => !(bytes instanceof Uint8Array))
      || new Set(captures.map((/** @type {any} */ bytes) => sourceByteDigest(bytes))).size !== 1) {
      throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
    }
    captureBytes = /** @type {Uint8Array} */ (captures[0]);
    const stableInputs = captureBindings.map((/** @type {any} */ binding) =>
      eventByRequest.get(binding.artifact_request_id)?.input
    ).filter((/** @type {any} */ input) => input?.kind === 'stable_resource_id');
    if (stableInputs.length) {
      const contracts = new Set(stableInputs.map((/** @type {any} */ input) =>
        `${input.provider}\0${input.provider_contract_version}`
      ));
      if (contracts.size !== 1) throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
      acquisition = {
        provider: stableInputs[0].provider,
        provider_contract_version: stableInputs[0].provider_contract_version
      };
    }
  } else if (source.capture_audit?.semantic_exclusions?.length) {
    throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
  }

  const assets = sourceBindings.filter((/** @type {any} */ item) => item.target === 'asset')
    .map((/** @type {any} */ binding) => {
      const bytes = material.get(binding.artifact_request_id);
      const asset = sourcePack.source_assets.find((/** @type {any} */ item) =>
        item.source_id === source.source_id && item.asset_id === binding.asset_id
      );
      if (!(bytes instanceof Uint8Array) || !asset || asset.status !== 'reviewed'
        || asset.asset_digest !== sourceByteDigest(bytes)) {
        throw new TypeError('ARTIFACT_SOURCE_REVIEW_REQUIRED');
      }
      return { retrieval_uri: asset.canonical_uri, bytes };
    });
  const result = compileAuditedSource(sourceMetadata(source), {
    source_id: source.source_id,
    input: {
      stable_source_id: source.source_id, source_type: source.kind,
      capture_bytes: captureBytes, assets
    },
    acquisition,
    additional_units: source.semantic_projection.structure.filter(
      (/** @type {any} */ unit) => ['image_region', 'user_statement'].includes(unit.type)
    )
  }, {
    provider_registry: runtime.provider_registry,
    expiry_registry: runtime.expiry_registry
  });
  if (result.status !== 'canonical') throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
  const expectedReviewedSemantics = {
    content: source.semantic_projection.content,
    structure: source.semantic_projection.structure
  };
  const acquiredReviewedSemantics = {
    content: result.source.semantic_projection.content,
    structure: result.source.semantic_projection.structure
  };
  if (canonicalStringify(expectedReviewedSemantics)
    !== canonicalStringify(acquiredReviewedSemantics)) {
    throw new TypeError('ARTIFACT_SOURCE_REVIEW_REQUIRED');
  }
  return result.source;
}

/**
 * Private installed-Adapter seam for an advertised source acquisition action.
 * The caller supplies only the previously staged semantic Source Pack, the
 * validated reply, safe input records and the exact material bytes. This
 * function derives every event/computed Source field, validates the complete
 * batch, and atomically stages the canonical candidate plus ephemeral bytes.
 * It never persists the original credential-bearing candidate.
 *
 * @param {string} runDirectory
 * @param {unknown} submittedReply
 * @param {unknown} submittedSourcePack
 * @param {unknown} submittedArtifacts
 * @returns {Promise<any>}
 */
export async function stageV4SourceAcquisitionAction(
  runDirectory, submittedReply, submittedSourcePack, submittedArtifacts
) {
  if (!path.isAbsolute(runDirectory)) throw new TypeError('RUN_DIRECTORY_NOT_ABSOLUTE');
  const state = await loadState(runDirectory);
  if (!state || state.status !== 'pending'
    || canonicalStringify(submittedReply) !== canonicalStringify(stopReply(state))) {
    throw new TypeError('ARTIFACT_RESUME_STALE');
  }
  const sourcePack = /** @type {any} */ (structuredClone(submittedSourcePack));
  if (validateAgainstSchema(sourcePack, sourcePackSchema).length
    || sourcePack.schema_version !== state.schema_version
    || sourcePack.run_instance_id !== state.run_id
    || sourcePack.source_revision !== state.committed_revision
    || !Array.isArray(sourcePack.artifact_events)
    || canonicalStringify(sourcePack.artifact_events) !== canonicalStringify(state.events)
    || !Array.isArray(submittedArtifacts)
    || submittedArtifacts.length !== state.artifact_requests.length) {
    throw new TypeError('ARTIFACT_SOURCE_CANDIDATE_INVALID');
  }
  const artifacts = /** @type {any[]} */ (submittedArtifacts);
  if (artifacts.some(item => (!only(item, ['artifact_request_id', 'input', 'material'])
      && !only(item, ['artifact_request_id', 'input', 'material', 'asset_review']))
    || typeof item.artifact_request_id !== 'string'
    || !(item.material instanceof Uint8Array))
    || new Set(artifacts.map(item => item.artifact_request_id)).size !== artifacts.length
    || state.artifact_requests.some((/** @type {any} */ request) => !artifacts.some(
      item => item.artifact_request_id === request.artifact_request_id
    ))) throw new TypeError('ARTIFACT_REQUEST_SET_INCOMPLETE');

  const { provider_registry: registry } = createCompilerSourceRuntimeV4();
  const context = {
    run_id: state.run_id, committed_revision: state.committed_revision,
    checkpoint_bytes: encoder.encode(state.checkpoint_text),
    artifact_requests: state.artifact_requests, prior_acquisitions: []
  };
  const artifactByRequest = new Map(artifacts.map(item => [item.artifact_request_id, item]));
  const events = state.artifact_requests.map((/** @type {any} */ request) => {
    const artifact = artifactByRequest.get(request.artifact_request_id);
    const event = createProvideArtifactEvent(
      request, state.resume_ref, artifact.input, registry
    );
    // Byte length/digest and stable resolver input are verified before any
    // staging write, using the same acceptor as the runner transaction.
    acceptProvidedArtifact(context, event, artifact.material, registry);
    return event;
  });
  const eventByRequest = new Map(events.map((/** @type {any} */ event) => [
    event.artifact_request_id, event
  ]));
  const material = new Map(artifacts.map(item => [item.artifact_request_id, item.material]));
  const candidate = structuredClone(sourcePack);
  candidate.artifact_events = [...structuredClone(state.events), ...events];
  for (const binding of state.bindings) {
    const artifact = artifactByRequest.get(binding.artifact_request_id);
    if (binding.target !== 'asset') {
      if (Object.hasOwn(artifact, 'asset_review')) {
        throw new TypeError('ARTIFACT_SOURCE_REVIEW_INVALID');
      }
      continue;
    }
    const asset = candidate.source_assets.find((/** @type {any} */ item) =>
      item.source_id === binding.source_id && item.asset_id === binding.asset_id
    );
    if (!asset) throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
    if (Object.hasOwn(artifact, 'asset_review')) {
      if (!only(artifact.asset_review, ['classification', 'review_basis'])) {
        throw new TypeError('ARTIFACT_SOURCE_REVIEW_INVALID');
      }
      asset.status = 'reviewed';
      asset.classification = artifact.asset_review.classification;
      asset.review_basis = structuredClone(artifact.asset_review.review_basis);
    }
    if (asset.status !== 'reviewed') throw new TypeError('ARTIFACT_SOURCE_REVIEW_REQUIRED');
    asset.asset_digest = sourceByteDigest(artifact.material);
  }
  for (const sourceId of [...new Set(state.bindings.map((/** @type {any} */ item) => item.source_id))]
    .sort(compare)) {
    const index = candidate.sources.findIndex((/** @type {any} */ item) => item.source_id === sourceId);
    if (index < 0) throw new TypeError('ARTIFACT_SOURCE_BINDING_INVALID');
    const previousDigest = candidate.sources[index].semantic_digest;
    const nextSource = compileResumedSource(
      candidate.sources[index],
      state.bindings.filter((/** @type {any} */ item) => item.source_id === sourceId),
      eventByRequest, material, candidate
    );
    candidate.sources[index] = nextSource;
    for (const locator of candidate.locators) {
      if (locator.source_id === sourceId && locator.semantic_digest === previousDigest) {
        locator.semantic_digest = nextSource.semantic_digest;
      }
    }
    for (const review of candidate.source_reviews) {
      if (review.source_id === sourceId && review.semantic_digest === previousDigest) {
        review.semantic_digest = nextSource.semantic_digest;
      }
    }
  }
  if (validateAgainstSchema(candidate, sourcePackSchema).length) {
    throw new TypeError('ARTIFACT_SOURCE_CANDIDATE_INVALID');
  }
  verifyCandidateSources(candidate, state.bindings, events, material);
  if (discoverRequests(candidate, {
    run_id: state.run_id, committed_revision: state.committed_revision,
    checkpoint_bytes: encoder.encode(state.checkpoint_text)
  }, state).requests.length) throw new TypeError('ARTIFACT_SOURCE_RESUME_UNSAFE');

  try {
    for (const event of events) {
      await atomicWriteBytes(
        runDirectory, sourceAcquisitionMaterialPathV4(runDirectory, event.event_id),
        /** @type {Uint8Array} */ (material.get(event.artifact_request_id))
      );
    }
    await atomicWriteJson(runDirectory, stagingPath(runDirectory, 'source_pack'), candidate);
    return structuredClone(candidate);
  } catch (error) {
    await discardAllMaterial(runDirectory).catch(() => {});
    throw error;
  }
}

/** @param {any} state @param {any} candidate @param {string} runDirectory */
async function acquireCandidate(state, candidate, runDirectory) {
  const { provider_registry: registry } = createCompilerSourceRuntimeV4();
  const priorEvents = state.events;
  const submittedEvents = Array.isArray(candidate.artifact_events)
    ? candidate.artifact_events.slice(priorEvents.length) : [];
  if (!Array.isArray(candidate.artifact_events)
    || canonicalStringify(candidate.artifact_events.slice(0, priorEvents.length))
      !== canonicalStringify(priorEvents)
    || submittedEvents.length !== state.artifact_requests.length
    || new Set(submittedEvents.map((/** @type {any} */ event) => event?.artifact_request_id)).size !== state.artifact_requests.length
    || state.artifact_requests.some((/** @type {any} */ request) => !submittedEvents.some(
      (/** @type {any} */ event) => event?.artifact_request_id === request.artifact_request_id
    ))) throw new TypeError('ARTIFACT_REQUEST_SET_INCOMPLETE');
  const context = {
    run_id: state.run_id, committed_revision: state.committed_revision,
    checkpoint_bytes: encoder.encode(state.checkpoint_text),
    artifact_requests: state.artifact_requests, prior_acquisitions: state.acquisitions
  };
  // Validate the complete event batch before reading even one private object.
  for (const event of submittedEvents) validateProvideArtifactEvent(context, event, registry);
  /** @type {Map<string,Uint8Array>} */ const material = new Map();
  let missingMaterial = false;
  for (const event of submittedEvents) {
    const bytes = await readStagedMaterial(runDirectory, event.event_id);
    if (!bytes) missingMaterial = true;
    else material.set(event.artifact_request_id, bytes);
  }
  if (missingMaterial) {
    // A partial batch is not a resumable acquisition: retaining any member
    // would extend the lifetime of raw resolver/upload material and could mix
    // bytes from different operator attempts. Require a fresh complete batch.
    await discardAllMaterial(runDirectory);
    return { kind: 'need_artifact', reply: stopReply(state) };
  }
  const currentReceipts = verifyCandidateSources(
    candidate, state.bindings, submittedEvents, material
  );
  const currentAcquisitions = submittedEvents.map((/** @type {any} */ event) => acceptProvidedArtifact(
    context, event, material.get(event.artifact_request_id), registry
  ));
  for (const [index, event] of submittedEvents.entries()) {
    if (currentAcquisitions[index].event.event_id !== event.event_id) throw new TypeError('ARTIFACT_EVENT_INVALID');
  }
  const receiptMap = new Map(state.source_receipts.map((/** @type {any} */ receipt) => [
    receipt.source_id, structuredClone(receipt)
  ]));
  for (const receipt of currentReceipts) {
    const prior = receiptMap.get(receipt.source_id);
    receiptMap.set(receipt.source_id, {
      ...receipt,
      artifact_event_ids: [...new Set([
        ...(prior?.artifact_event_ids ?? []), ...receipt.artifact_event_ids
      ])].sort(compare)
    });
  }
  const sourceReceipts = [...receiptMap.values()].sort((a, b) => compare(a.source_id, b.source_id));
  const acquisitions = [...structuredClone(state.acquisitions), ...currentAcquisitions];
  const body = {
    ...stateBody(state), status: 'acquired', events: structuredClone(candidate.artifact_events),
    acquisitions, source_receipts: sourceReceipts,
    accepted_source_pack_digest: hash(candidate)
  };
  const acquired = { ...body, state_digest: hash(body) };
  await atomicWriteJson(runDirectory, sourceAcquisitionStatePathV4(runDirectory), acquired);
  // Raw resolver/upload bytes remain staging-only and are removed immediately
  // after the safe digest receipt is durably committed.
  await discardAllMaterial(runDirectory);
  await retireAcquisitionCheckpoint(runDirectory, state.checkpoint_text, state.checkpoint_created);
  return { kind: 'accepted', state: acquired };
}

/**
 * Inspect one candidate before Source Pack promotion. Raw signed references are
 * discarded by the caller; only the closed redacted request state is persisted.
 * @param {string} runDirectory @param {any} sourcePack @param {string} runId
 */
export async function advanceSourceAcquisitionV4(runDirectory, sourcePack, runId) {
  const contract = v4ContractForSchema(sourcePack.schema_version);
  if (!contract) return { kind: 'rejected', code: 'SOURCE_ACQUISITION_CONTRACT_UNSUPPORTED' };
  let existing = await loadState(runDirectory);
  if (!existing && contract.candidate && sourcePack.delivery_intent === 'case_document') {
    existing = await bindV4PrdCollectionObservation(runDirectory, sourcePack);
  }
  const revision = sourcePack.source_revision;
  const durableCheckpointText = await readTextIfPresent(
    runDirectory, path.join(runDirectory, 'checkpoint.json')
  );
  const laterAcquisition = existing?.status === 'acquired'
    && existing.run_id === runId && existing.committed_revision < revision;
  let checkpointText = laterAcquisition
    ? durableCheckpointText : existing?.checkpoint_text ?? durableCheckpointText;
  const checkpointCreated = laterAcquisition
    ? durableCheckpointText === null : existing?.checkpoint_created ?? checkpointText === null;
  if (checkpointText === null) {
    checkpointText = genesisCheckpoint(runId, revision, contract);
  }
  const context = { run_id: runId, committed_revision: revision, checkpoint_bytes: encoder.encode(checkpointText) };
  const continuingPending = existing?.status === 'pending'
    && existing.run_id === runId && existing.committed_revision === revision;
  const discovered = discoverRequests(sourcePack, context, continuingPending ? existing : null);
  const unsafeEventInput = sourcePack.artifact_events?.some((/** @type {any} */ event) =>
    event?.input?.kind === 'stable_resource_id'
      && canonicalizeSourceCapture({
        stable_source_id: 'event-input', source_type: 'persisted-field',
        capture_bytes: encoder.encode(event.input.resource_id), assets: []
      }, createCompilerSourceRuntimeV4().provider_registry).status === 'need_artifact'
  );
  if (unsafeEventInput) return { kind: 'rejected', code: 'ARTIFACT_INPUT_INVALID', discard_candidate: true };
  if (discovered.requests.length) {
    if (existing) {
      if (continuingPending) {
        return { kind: 'need_artifact', reply: stopReply(existing), discard_candidate: true };
      }
      if (!laterAcquisition && existing.status !== 'collected') {
        return { kind: 'rejected', code: 'ARTIFACT_RESUME_STALE', discard_candidate: true };
      }
      if (existing.status !== 'collected') {
        await loadSourceAcquisitionCompilerStateV4(runDirectory, sourcePack);
      }
    }
    const resume = createArtifactResumeRef({ ...context, artifact_requests: discovered.requests });
    const priorEvents = existing?.events ?? [];
    const priorAcquisitions = existing?.acquisitions ?? [];
    const priorReceipts = existing?.source_receipts ?? [];
    const requestHistory = [
      ...(existing?.request_history ?? []),
      {
        committed_revision: revision, checkpoint_text: checkpointText,
        artifact_requests: structuredClone(discovered.requests)
      }
    ];
    const body = {
      schema_version: contract.schema_version, compiler_version: contract.compiler_version,
      registry_version: SOURCE_RUNTIME_REGISTRY_VERSION_V4,
      run_id: runId, committed_revision: revision, status: 'pending', checkpoint_text: checkpointText,
      checkpoint_created: checkpointCreated,
      artifact_requests: discovered.requests, resume_ref: resume, bindings: discovered.bindings,
      request_history: requestHistory,
      base_event_count: priorEvents.length, events: structuredClone(priorEvents),
      acquisitions: structuredClone(priorAcquisitions), source_receipts: structuredClone(priorReceipts),
      accepted_source_pack_digest: null,
      ...(contract.candidate ? {
        collection_sessions: structuredClone(existing.collection_sessions),
        summary: structuredClone(existing.summary)
      } : {})
    };
    const state = { ...body, state_digest: hash(body) };
    if (checkpointCreated) {
      await atomicWriteText(runDirectory, path.join(runDirectory, 'checkpoint.json'), checkpointText);
    }
    await atomicWriteJson(runDirectory, sourceAcquisitionStatePathV4(runDirectory), state);
    return { kind: 'need_artifact', reply: stopReply(state), discard_candidate: true };
  }
  if (!existing) {
    if (sourcePack.artifact_events?.length) return { kind: 'rejected', code: 'ARTIFACT_REQUEST_STALE' };
    return { kind: 'none' };
  }
  if (existing.status === 'collected') {
    if (existing.run_id !== runId || existing.committed_revision > revision) {
      return { kind: 'rejected', code: 'SOURCE_COLLECTION_BINDING_INVALID' };
    }
    try { await loadV4SourceReadingSummary(runDirectory, sourcePack); }
    catch { return { kind: 'rejected', code: 'SOURCE_COLLECTION_BINDING_INVALID' }; }
    if (existing.committed_revision === revision
      && existing.accepted_source_pack_digest !== hash(sourcePack)) {
      return { kind: 'rejected', code: 'SOURCE_COLLECTION_BINDING_INVALID' };
    }
    return { kind: existing.committed_revision === revision ? 'accepted' : 'verified', state: existing };
  }
  if (existing.run_id !== runId || existing.committed_revision > revision) {
    return { kind: 'rejected', code: 'ARTIFACT_RESUME_STALE' };
  }
  if (existing.status === 'acquired') {
    if (existing.committed_revision === revision
      && existing.accepted_source_pack_digest !== hash(sourcePack)) {
      return { kind: 'rejected', code: 'ARTIFACT_IDEMPOTENCY_CONFLICT' };
    }
    await loadSourceAcquisitionCompilerStateV4(runDirectory, sourcePack);
    if (existing.committed_revision === revision) {
      await retireAcquisitionCheckpoint(
        runDirectory, existing.checkpoint_text, existing.checkpoint_created
      );
    }
    return {
      kind: existing.committed_revision === revision ? 'accepted' : 'verified',
      state: existing
    };
  }
  if (existing.committed_revision !== revision) {
    return { kind: 'rejected', code: 'ARTIFACT_RESUME_STALE' };
  }
  try { return await acquireCandidate(existing, sourcePack, runDirectory); }
  catch (error) {
    await discardAllMaterial(runDirectory);
    const code = error instanceof Error ? error.message : 'SOURCE_ACQUISITION_INVALID';
    return { kind: 'rejected', code: /^(?:ARTIFACT|SOURCE)_[A-Z_]+$/u.test(code) ? code : 'SOURCE_ACQUISITION_INVALID' };
  }
}

/** Replay a pending stop before asking for another stage artifact. */
/** @param {string} runDirectory @param {string} runId */
export async function replaySourceAcquisitionStopV4(runDirectory, runId) {
  const state = await loadState(runDirectory);
  if (!state || state.status !== 'pending') return null;
  if (state.run_id !== runId) throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  const current = await readTextIfPresent(runDirectory, path.join(runDirectory, 'checkpoint.json'));
  if (current !== state.checkpoint_text) throw new TypeError('ARTIFACT_RESUME_STALE');
  return stopReply(state);
}

/** Load compiler-private byte/binding state for all later deterministic replays. */
/** @param {string} runDirectory @param {any} sourcePack */
export async function loadSourceAcquisitionCompilerStateV4(runDirectory, sourcePack) {
  const state = await loadState(runDirectory);
  if (!state) return null;
  if (state.status === 'collected') {
    if (state.run_id !== sourcePack?.run_instance_id
      || state.committed_revision > sourcePack?.source_revision) {
      throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
    }
    await loadV4SourceReadingSummary(runDirectory, sourcePack);
    if (state.committed_revision === sourcePack.source_revision
      && state.accepted_source_pack_digest !== hash(sourcePack)) {
      throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
    }
    return {
      verified_source_receipts: [], verified_acquisition_records: [],
      source_reading_summary: structuredClone(state.summary)
    };
  }
  const packEvents = Array.isArray(sourcePack?.artifact_events) ? sourcePack.artifact_events : [];
  if (state.status !== 'acquired'
    || !Number.isSafeInteger(sourcePack?.source_revision)
    || sourcePack.source_revision < state.committed_revision
    || state.events.length !== packEvents.length
    || state.events.some((/** @type {any} */ event, /** @type {number} */ index) =>
      canonicalStringify(event) !== canonicalStringify(packEvents[index])
    )) {
    throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  const { provider_registry: registry } = createCompilerSourceRuntimeV4();
  const contextForEvent = (/** @type {any} */ event) => {
    const matches = state.request_history.filter((/** @type {any} */ cycle) =>
      cycle.artifact_requests.some((/** @type {any} */ request) =>
        request.artifact_request_id === event.artifact_request_id
      )
    );
    if (matches.length !== 1) throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
    const cycle = matches[0];
    return {
      run_id: state.run_id, committed_revision: cycle.committed_revision,
      checkpoint_bytes: encoder.encode(cycle.checkpoint_text),
      artifact_requests: cycle.artifact_requests,
      prior_acquisitions: structuredClone(state.acquisitions)
    };
  };
  for (const event of state.events) {
    const replay = validateProvideArtifactEvent(contextForEvent(event), event, registry);
    if (replay.status !== 'replayed') throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  await discardAllMaterial(runDirectory);
  const verified = state.events.map((/** @type {any} */ event) => acceptProvidedArtifact(
    contextForEvent(event), event, undefined, registry
  ));
  if (canonicalStringify(verified) !== canonicalStringify(state.acquisitions)) {
    throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  for (const receipt of state.source_receipts) {
    const source = sourcePack.sources.find((/** @type {any} */ item) => item.source_id === receipt.source_id);
    if (!source || receipt.source_artifact_digest !== sourceAcquisitionIdentityDigestV4(source)
      || receipt.capture_digest !== source.capture_digest
      || receipt.artifact_event_ids.some((/** @type {string} */ eventId) =>
        !state.events.some((/** @type {any} */ event) => event.event_id === eventId)
      )) throw new TypeError('SOURCE_ACQUISITION_STATE_INVALID');
  }
  return {
    verified_source_receipts: structuredClone(state.source_receipts),
    verified_acquisition_records: structuredClone(state.acquisitions),
    ...(isCandidateV4SchemaVersion(state.schema_version)
      ? { source_reading_summary: structuredClone(state.summary) } : {})
  };
}
