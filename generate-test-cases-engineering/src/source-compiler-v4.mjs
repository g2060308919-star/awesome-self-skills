import sourceSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import evidenceSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from './canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { canonicalizeAuditedSourceCapture } from './source-capture-audit.mjs';
import { canonicalizeSourceCapture, canonicalizeSourceUrl, sourceAcquisitionInventory, sourceByteDigest, hasSourceProviderContract } from './source-canonicalization.mjs';
import { compileCanonicalSourceStructure } from './source-locators-v4.mjs';
import { validateEvidenceGraph, validateV4EvidenceSourceBoundary } from './evidence.mjs';
import { acceptProvidedArtifact, createArtifactRequest, createArtifactResumeRef, validateProvideArtifactEvent } from './source-events.mjs';

/** @param {string} code */
const diagnostic = code => ({ category: 'traceability', code, path: '/source_pack', message: 'Source acquisition, canonical identity, evidence coordinates and review must agree.' });
/** @param {string} code */
const rejected = code => ({ status: 'rejected', diagnostics: [diagnostic(code)] });
/** @param {any} value @param {string[]} keys */
const hasOnly = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const SOURCE_METADATA_KEYS = ['source_id', 'kind', 'version', 'status', 'authority', 'title', 'scope', 'domain'];
const sourceMetadataSchema = { type: 'object', additionalProperties: false,
  required: ['source_id', 'kind', 'version', 'status', 'authority', 'domain'],
  properties: Object.fromEntries(SOURCE_METADATA_KEYS.map(key => [key, /** @type {any} */ (sourceSchema.$defs.v4Source.properties)[key]])) };

/**
 * Stable receipt identity for the acquired capture and reviewed assets. A
 * later clarification revision may append compiler-verifiable user_statement
 * units, which deliberately change the full semantic digest without changing
 * the capture that the acquisition receipt proved.
 * @param {any} source
 */
export function sourceAcquisitionIdentityDigestV4(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)
    || !source.semantic_projection || typeof source.semantic_projection !== 'object'
    || !Array.isArray(source.semantic_projection.structure)) {
    throw new TypeError('SOURCE_ACQUISITION_RECEIPT_INVALID');
  }
  const stable = structuredClone(source);
  delete stable.semantic_digest;
  stable.semantic_projection.structure = stable.semantic_projection.structure.filter(
    (/** @type {any} */ unit) => unit?.type !== 'user_statement'
  );
  return 'sha256:' + digest(stable);
}

/** Reject reintroduced raw retrieval credentials anywhere in a persistable
 * artifact (including JSON data keys). Do not silently rewrite Claim meaning.
 * @param {any} value @param {object} registry
 */
function persistableSourceValues(value, registry) {
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'string') {
      const normalized = item.replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n').normalize('NFC');
      const result = canonicalizeSourceCapture({ stable_source_id: 'persisted-value-verification', source_type: 'text',
        capture_bytes: new TextEncoder().encode(item), assets: [] }, registry);
      if (result.status !== 'canonical' || result.semantic_projection.content !== normalized) return false;
    } else if (Array.isArray(item)) for (const child of item) pending.push(child);
    else if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) pending.push(key, child);
  }
  return true;
}

/** Produce compiler-owned Source fields at acquisition time, before the Adapter
 * writes locators/reviews. The verification path below calls this same producer;
 * there is no alternate projection/digest algorithm for tests or initial input.
 * @param {any} metadata @param {any} entry @param {any} system @returns {any}
 */
export function compileAuditedSource(metadata, entry, system) {
  try {
    if (validateAgainstSchema(metadata, sourceMetadataSchema).length || !hasOnly(system, ['provider_registry', 'expiry_registry'])
      || !hasOnly(entry, ['source_id', 'input', 'acquisition', 'additional_units']) || entry.source_id !== metadata.source_id
      || entry.input?.stable_source_id !== metadata.source_id || entry.input?.source_type !== metadata.kind
      || !Array.isArray(entry.additional_units) || !hasOnly(entry.acquisition, ['provider', 'provider_contract_version'])) return rejected('SOURCE_CAPTURE_BINDING_INVALID');
    const provider = entry.acquisition.provider;
    if ((provider === undefined) !== (entry.acquisition.provider_contract_version === undefined)
      || (provider !== undefined && !hasSourceProviderContract(system.provider_registry, provider, entry.acquisition.provider_contract_version))) return rejected('SOURCE_PROVIDER_CONTRACT_INVALID');
    const audited = canonicalizeAuditedSourceCapture(entry.input, system.provider_registry, entry.acquisition, system.expiry_registry);
    if (audited.status !== 'canonical') return audited;
    if (entry.additional_units.some((/** @type {any} */ unit) => !['image_region', 'user_statement'].includes(unit.type))) return rejected('SOURCE_ACQUIRED_UNIT_INVALID');
    const projection = { ...audited.semantic_projection,
      structure: [...compileCanonicalSourceStructure(metadata.source_id, audited.semantic_projection.content), ...entry.additional_units] };
    const source = { ...metadata, capture_digest: audited.capture_digest, capture_audit: audited.capture_audit,
      semantic_projection: projection, semantic_digest: 'sha256:' + digest(projection), content: projection.content,
      content_digest: sourceByteDigest(new TextEncoder().encode(projection.content)).slice(7) };
    if (validateAgainstSchema(source, { $ref: '#/$defs/v4Source', $defs: sourceSchema.$defs }).length
      || !persistableSourceValues(source, system.provider_registry)) return rejected('SOURCE_ACQUIRED_UNIT_INVALID');
    return { status: 'canonical', source };
  } catch { return rejected('SOURCE_COMPILER_INVALID'); }
}
/** @param {any} context @param {any[]} requests @param {string} reason */
function needArtifact(context, requests, reason) {
  const sorted = [...requests].sort((a, b) => a.artifact_request_id.localeCompare(b.artifact_request_id));
  return { status: 'need_artifact', reason_code: reason, diagnostics: [], artifact_requests: sorted,
    resume_ref: createArtifactResumeRef({ ...context, artifact_requests: sorted }) };
}

/** @param {any[]} units @param {number} ordinal */
function markerLocation(units, ordinal) {
  const matches = units.flatMap((unit, index) => {
    const markers = [...unit.text.matchAll(/https:\/\/source-acquisition\.invalid\/([0-9]+)/gu)];
    return markers.flatMap((match, local) => Number(match[1]) === ordinal ? [{ unit, index, local }] : []);
  });
  if (matches.length !== 1) throw new TypeError('SOURCE_URL_STRUCTURAL_BINDING_INVALID');
  const { unit, index, local } = matches[0];
  return { structural_locator: unit.type === 'table_cell'
    ? { unit_kind: 'table', unit_ordinal: index, row: unit.row, column: unit.column }
    : { unit_kind: unit.type === 'image' ? 'image' : 'text', unit_ordinal: index }, url_ordinal: local };
}

/** URL markers carry no source meaning or credentials; this projection exists
 * only long enough to recover canonical retained coordinates after authorized
 * expiry removal. Its synthetic capture digest/audit is never returned or stored.
 * @param {any} source @param {any} entry @param {any} system
 */
function structuralInventory(source, entry, system) {
  const inventory = sourceAcquisitionInventory(entry.input.capture_bytes, system.provider_registry);
  const markerProjection = canonicalizeAuditedSourceCapture({ stable_source_id: source.source_id, source_type: source.kind,
    capture_bytes: new TextEncoder().encode(inventory.marker_content), assets: [] }, system.provider_registry, entry.acquisition, system.expiry_registry);
  if (markerProjection.status !== 'canonical') throw new TypeError('SOURCE_URL_STRUCTURAL_BINDING_INVALID');
  return { inventory, units: compileCanonicalSourceStructure(source.source_id, markerProjection.semantic_projection.content) };
}

/** Build request coordinates from safe marker structure, not Agent-supplied
 * locator text or credential-dependent unit IDs. No marker becomes evidence.
 * @param {any} source @param {any} acquisition @param {any} system
 */
function quarantineRequests(source, acquisition, system) {
  const { inventory, units } = structuralInventory(source, acquisition, system);
  const requests = [];
  for (const reference of inventory.references) {
    if (reference.reference.status !== 'need_artifact') continue;
    requests.push(createArtifactRequest({ ...system.artifact_context, stable_source_id: source.source_id,
      ...markerLocation(units, reference.ordinal) }, reference.reference));
  }
  if (!requests.length) throw new TypeError('SOURCE_URL_STRUCTURAL_BINDING_INVALID');
  return requests;
}

/** Missing bytes cannot be replaced by an Agent claim of non-normativity. Only
 * the runner's previously verified review proof, bound to this exact capture and
 * review, permits independent text evidence without the unavailable asset.
 * @param {any} pack @param {any} source @param {any} entry @param {any} system
 * @returns {any}
 */
function prepareAssets(pack, source, entry, system) {
  const { inventory, units } = structuralInventory(source, entry, system);
  const assets = []; const skipped = []; const requests = [];
  const assetUrls = entry.input.assets.map((/** @type {any} */ asset) => canonicalizeSourceUrl(asset.retrieval_uri, system.provider_registry));
  for (const reference of inventory.references) {
    const location = markerLocation(units, reference.ordinal);
    if (location.structural_locator.unit_kind !== 'image') continue;
    if (assetUrls.some((/** @type {any} */ url) => url.ordinary_query_digest === reference.reference.ordinary_query_digest && url.redacted_resource_ref === reference.reference.redacted_resource_ref)) continue;
    requests.push(createArtifactRequest({ ...system.artifact_context, stable_source_id: source.source_id, ...location,
      reason_code: reference.reference.status === 'need_artifact' ? 'UNSUPPORTED_SIGNED_URL_PROVIDER' : 'SOURCE_ASSET_UNAVAILABLE' }, reference.reference));
  }
  for (const asset of entry.input.assets) {
    const url = canonicalizeSourceUrl(asset.retrieval_uri, system.provider_registry);
    if (url.status === 'source_diagnostic') throw new TypeError('SOURCE_ASSET_URI_INVALID');
    const reference = inventory.references.find(item => item.reference.ordinary_query_digest === url.ordinary_query_digest
      && item.reference.redacted_resource_ref === url.redacted_resource_ref);
    if (!reference) throw new TypeError('SOURCE_ASSET_REFERENCE_INVALID');
    if (url.status === 'need_artifact') {
      requests.push(createArtifactRequest({ ...system.artifact_context, stable_source_id: source.source_id,
        ...markerLocation(units, reference.ordinal) }, url)); continue;
    }
    const records = pack.source_assets.filter((/** @type {any} */ item) => item.source_id === source.source_id && item.canonical_uri === url.canonical_uri);
    if (records.length !== 1) throw new TypeError('SOURCE_ASSET_METADATA_INVALID');
    const record = records[0];
    if (asset.bytes instanceof Uint8Array) { assets.push(asset); continue; }
    const proof = { source_id: source.source_id, asset_id: record.asset_id, canonical_uri: url.canonical_uri,
      capture_digest: sourceByteDigest(entry.input.capture_bytes), review_basis_digest: 'sha256:' + digest(record.review_basis) };
    if (record.classification === 'non_normative' && record.status !== 'reviewed'
      && (system.non_normative_asset_proofs ?? []).some((/** @type {any} */ candidate) => canonicalStringify(candidate) === canonicalStringify(proof))) { skipped.push(record.asset_id); continue; }
    requests.push(createArtifactRequest({ ...system.artifact_context, stable_source_id: source.source_id,
      ...markerLocation(units, reference.ordinal), reason_code: 'SOURCE_ASSET_UNAVAILABLE' }, url));
  }
  return { assets, skipped, requests };
}

/** Batch preflight precedes every byte-reader call. This is an internal resolver
 * seam, not a callback for injecting Evidence or bypassing compiler semantics.
 * The caller owns fetching and atomically persisting returned acquisition records.
 * @param {any} pack @param {any} system @param {Map<string,any>} acquired
 * @returns {any}
 */
function applyArtifactEvents(pack, system, acquired) {
  const events = pack.artifact_events;
  if (!events.length) return { status: 'acquired', records: [] };
    if (!system.artifact_context || !Array.isArray(system.artifact_bindings)
    || new Set(events.map((/** @type {any} */ event) => event.event_id)).size !== events.length) throw new TypeError('ARTIFACT_CONTEXT_INVALID');
  const validations = events.map((/** @type {any} */ event) => validateProvideArtifactEvent(system.artifact_context, event, system.provider_registry));
  const bindings = events.map((/** @type {any} */ event) => {
    const found = system.artifact_bindings.filter((/** @type {any} */ binding) => binding.artifact_request_id === event.artifact_request_id);
    if (found.length !== 1 || !hasOnly(found[0], ['artifact_request_id', 'source_id', 'target', 'asset_index'])
      || !acquired.has(found[0].source_id) || !['capture', 'asset'].includes(found[0].target)
      || (found[0].target === 'asset' && (!Number.isSafeInteger(found[0].asset_index)
        || !acquired.get(found[0].source_id).input.assets[found[0].asset_index]))
      || (found[0].target === 'capture' && found[0].asset_index !== undefined)) throw new TypeError('ARTIFACT_BINDING_INVALID');
    return found[0];
  });
  const records = [];
  for (const [index, event] of events.entries()) {
    const validation = validations[index]; const binding = bindings[index]; const target = acquired.get(binding.source_id);
    let bytes;
    if (validation.status === 'replayed') {
      bytes = binding.target === 'capture' ? target.input.capture_bytes : target.input.assets[binding.asset_index].bytes;
      if (!(bytes instanceof Uint8Array) || bytes.length !== validation.result.acquisition_record.byte_length
        || sourceByteDigest(bytes) !== validation.result.acquisition_record.content_digest) throw new TypeError('ARTIFACT_REPLAY_BYTES_MISMATCH');
      records.push(validation.result); continue;
    }
    try { bytes = system.read_artifact_bytes?.(structuredClone(event.input)); }
    catch { return needArtifact(system.artifact_context, system.artifact_context.artifact_requests, 'SOURCE_ASSET_UNAVAILABLE'); }
    if (!(bytes instanceof Uint8Array)) return needArtifact(system.artifact_context, system.artifact_context.artifact_requests, 'SOURCE_ASSET_UNAVAILABLE');
    const result = acceptProvidedArtifact(system.artifact_context, event, bytes, system.provider_registry);
    records.push(result);
    if (binding.target === 'capture') target.input.capture_bytes = bytes;
    else target.input.assets[binding.asset_index].bytes = bytes;
  }
  return { status: 'acquired', records };
}

/** Validate the compiler-private receipt set produced only after short-lived
 * source/asset bytes were checked against the exact candidate Source Pack.
 * @param {any} pack @param {any} system */
function verifiedReceiptMap(pack, system) {
  const receipts = system.verified_source_receipts;
  const records = system.verified_acquisition_records;
  if (receipts === undefined && records === undefined) return new Map();
  if (!Array.isArray(receipts) || !Array.isArray(records)
    || new Set(receipts.map((/** @type {any} */ item) => item?.source_id)).size !== receipts.length
    || records.length !== pack.artifact_events.length) throw new TypeError('SOURCE_ACQUISITION_RECEIPT_INVALID');
  const eventIds = new Set(pack.artifact_events.map((/** @type {any} */ event) => event.event_id));
  if (eventIds.size !== pack.artifact_events.length
    || records.some((/** @type {any} */ item) => item?.status !== 'acquired'
      || !eventIds.has(item.event?.event_id)
      || canonicalStringify(pack.artifact_events.find((/** @type {any} */ event) =>
        event.event_id === item.event.event_id
      )) !== canonicalStringify(item.event))) throw new TypeError('SOURCE_ACQUISITION_RECEIPT_INVALID');
  const covered = new Set();
  const mapped = new Map();
  for (const receipt of receipts) {
    if (!hasOnly(receipt, [
      'source_id', 'source_artifact_digest', 'capture_digest', 'semantic_digest',
      'artifact_event_ids'
    ]) || Object.keys(receipt).length !== 5 || !Array.isArray(receipt.artifact_event_ids)
      || receipt.artifact_event_ids.length === 0
      || new Set(receipt.artifact_event_ids).size !== receipt.artifact_event_ids.length) {
      throw new TypeError('SOURCE_ACQUISITION_RECEIPT_INVALID');
    }
    const source = pack.sources.find((/** @type {any} */ item) => item.source_id === receipt.source_id);
    if (!source || receipt.source_artifact_digest !== sourceAcquisitionIdentityDigestV4(source)
      || receipt.capture_digest !== source.capture_digest
      || receipt.artifact_event_ids.some((/** @type {string} */ id) => !eventIds.has(id))) {
      throw new TypeError('SOURCE_ACQUISITION_RECEIPT_INVALID');
    }
    receipt.artifact_event_ids.forEach((/** @type {string} */ id) => {
      if (covered.has(id)) throw new TypeError('SOURCE_ACQUISITION_RECEIPT_INVALID');
      covered.add(id);
    });
    mapped.set(receipt.source_id, receipt);
  }
  if (covered.size !== eventIds.size) throw new TypeError('SOURCE_ACQUISITION_RECEIPT_INVALID');
  return mapped;
}

/** Production-facing source compiler. Only existing Agent artifacts enter the
 * first argument. Raw captures, resolver contracts, verified acquired OCR units,
 * checkpoint bytes and successful acquisition history are separate system state.
 * No file/network writes occur here; durable runner transactions remain the caller.
 * @param {any} artifacts @param {any} system @returns {any}
 */
export function compileSourceEvidence(artifacts, system) {
  try {
    if (!hasOnly(artifacts, ['source_pack', 'evidence_claims']) || !artifacts.source_pack || !artifacts.evidence_claims) return rejected('SOURCE_COMPILER_INPUT_INVALID');
    const pack = artifacts.source_pack; const claims = artifacts.evidence_claims;
    if (validateAgainstSchema(pack, sourceSchema).length || validateAgainstSchema(claims, evidenceSchema).length
      || pack.schema_version !== claims.schema_version) return rejected('SOURCE_SCHEMA_INVALID');
    if (pack.source_revision !== claims.source_revision) return rejected('SOURCE_REVISION_MISMATCH');
    if (pack.schema_version === '3.0.0') {
      const evidence = validateEvidenceGraph(pack, claims);
      return evidence.diagnostics.length ? { status: 'rejected', diagnostics: evidence.diagnostics }
        : { status: 'accepted', source_pack: structuredClone(pack), evidence, acquisitions: [], diagnostics: [] };
    }
    if (!hasOnly(system, ['provider_registry', 'expiry_registry', 'subject_registry', 'acquisitions', 'artifact_context', 'artifact_bindings', 'read_artifact_bytes', 'non_normative_asset_proofs', 'verified_source_receipts', 'verified_acquisition_records'])
      || !Array.isArray(system.acquisitions)) return rejected('SOURCE_COMPILER_STATE_INVALID');
    if (system.artifact_context && system.artifact_context.run_id !== pack.run_instance_id) return rejected('ARTIFACT_RUN_MISMATCH');
    if (validateUniqueStableIds(pack).length || validateUniqueStableIds(claims).length) return rejected('SOURCE_DUPLICATE_ID');
    if (!persistableSourceValues(pack, system.provider_registry) || !persistableSourceValues(claims, system.provider_registry)) return rejected('SOURCE_UNSAFE_PERSISTED_VALUE');
    const receipts = verifiedReceiptMap(pack, system);
    const entries = system.acquisitions;
    if (entries.length + receipts.size !== pack.sources.length
      || new Set(entries.map((/** @type {any} */ item) => item.source_id)).size !== entries.length
      || entries.some((/** @type {any} */ item) => receipts.has(item.source_id)
        || !pack.sources.some((/** @type {any} */ source) => source.source_id === item.source_id))) return rejected('SOURCE_CAPTURE_SET_INVALID');
    const acquired = new Map(entries.map((/** @type {any} */ item) => [item.source_id, structuredClone(item)]));
    const material = receipts.size
      ? { status: 'acquired', records: structuredClone(system.verified_acquisition_records) }
      : applyArtifactEvents(pack, system, acquired);
    if (material.status === 'need_artifact') return material;
    const acceptedSources = []; const skippedAssets = new Set(); const pendingRequests = [];
    for (const source of pack.sources) {
      if (receipts.has(source.source_id)) {
        acceptedSources.push(structuredClone(source));
        continue;
      }
      const entry = /** @type {any} */ (acquired.get(source.source_id));
      if (!hasOnly(entry, ['source_id', 'input', 'acquisition', 'additional_units'])
        || entry.input?.stable_source_id !== source.source_id || entry.input?.source_type !== source.kind
        || !Array.isArray(entry.additional_units) || !hasOnly(entry.acquisition, ['provider', 'provider_contract_version'])) return rejected('SOURCE_CAPTURE_BINDING_INVALID');
      const provider = entry.acquisition.provider;
      if ((provider === undefined) !== (entry.acquisition.provider_contract_version === undefined)) return rejected('SOURCE_PROVIDER_CONTRACT_INVALID');
      if (provider !== undefined && !hasSourceProviderContract(system.provider_registry, provider, entry.acquisition.provider_contract_version)) return rejected('SOURCE_PROVIDER_CONTRACT_INVALID');
      // Quarantined text is identified before any asset can produce evidence.
      const textOnly = canonicalizeAuditedSourceCapture({ ...entry.input, assets: [] }, system.provider_registry, entry.acquisition, system.expiry_registry);
      if (textOnly.status === 'need_artifact') { pendingRequests.push(...quarantineRequests(source, entry, system)); continue; }
      if (textOnly.status !== 'canonical') return rejected('SOURCE_CAPTURE_INVALID');
      const assets = prepareAssets(pack, source, entry, system);
      if (assets.requests.length) { pendingRequests.push(...assets.requests); continue; }
      assets.skipped.forEach((/** @type {string} */ id) => skippedAssets.add(id));
      const metadata = Object.fromEntries(SOURCE_METADATA_KEYS.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
      const compiled = compileAuditedSource(metadata, { ...entry, input: { ...entry.input, assets: assets.assets } }, {
        provider_registry: system.provider_registry, expiry_registry: system.expiry_registry
      });
      if (compiled.status !== 'canonical') return compiled.status === 'rejected' ? compiled : rejected('SOURCE_CAPTURE_INVALID');
      if (canonicalStringify(source) !== canonicalStringify(compiled.source)) return rejected('SOURCE_RECOMPUTATION_MISMATCH');
      acceptedSources.push(compiled.source);
    }
    if (pendingRequests.length) return needArtifact(system.artifact_context, pendingRequests,
      pendingRequests.some(request => request.reason_code === 'UNSUPPORTED_SIGNED_URL_PROVIDER') ? 'UNSUPPORTED_SIGNED_URL_PROVIDER' : 'SOURCE_ASSET_UNAVAILABLE');
    const verifiedPack = { ...pack, sources: acceptedSources };
    for (const asset of pack.source_assets) {
      const source = acceptedSources.find(item => item.source_id === asset.source_id);
      if (skippedAssets.has(asset.asset_id)) continue;
      if (asset.status !== 'reviewed' || !source?.semantic_projection.assets.some((/** @type {any} */ item) => item.canonical_uri === asset.canonical_uri && item.asset_digest === asset.asset_digest)) return rejected('SOURCE_ASSET_BINDING_INVALID');
      const locator = pack.locators.find((/** @type {any} */ item) => item.locator_id === asset.locator_id && item.source_id === asset.source_id);
      if (!locator || (asset.classification !== 'non_normative' && (locator.type !== 'image_region' || locator.asset_digest !== asset.asset_digest))) return rejected('SOURCE_ASSET_LOCATOR_INVALID');
    }
    const evidence = validateV4EvidenceSourceBoundary(verifiedPack, claims, system.subject_registry);
    if (evidence.diagnostics.length || evidence.source_conflicts.length) return { status: 'rejected', diagnostics: evidence.diagnostics, source_conflicts: evidence.source_conflicts, composition_audit: evidence.composition_audit };
    return { status: 'accepted', source_pack: structuredClone(verifiedPack), evidence, acquisitions: material.records, diagnostics: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return rejected(/^(?:SOURCE|ARTIFACT|EXPIRY)_[A-Z_]+$/u.test(message) ? message : 'SOURCE_COMPILER_INVALID');
  }
}
