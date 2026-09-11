import path from 'node:path';

import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { stableV5Id } from './identity.mjs';

const SOURCE_ROLES = new Set(['primary_prd', 'supplemental_requirement', 'technical_contract', 'reference']);
const SOURCE_MEDIA_TYPES = new Set(['text/plain', 'text/markdown']);

/** @param {string} value */
function scalarLength(value) {
  return Array.from(value).length;
}

/** @param {string} value */
function nonblank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * WHATWG URL parsing is used only to reject malformed/credential-bearing
 * values. The returned representation deliberately changes only the three
 * transformations frozen by the V5 contract.
 * @param {string} value
 */
function canonicalHttpsUrl(value) {
  if (!nonblank(value)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'URL source locator must be nonblank.');
  let parsed;
  try { parsed = new URL(value); } catch { throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'URL source locator must be absolute.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'URL source locator must use HTTPS without credentials.');
  const match = /^(https):\/\/([^/?#]+)([\s\S]*)$/iu.exec(value);
  if (!match) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'URL source locator must be absolute HTTPS.');
  const authority = match[2];
  const suffix = match[3];
  const canonicalAuthority = authority.toLowerCase().replace(/:443$/u, '');
  return `https://${canonicalAuthority}${suffix}`;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

/** @param {Record<string, any>} value @param {string[]} keys @param {string} code */
function exactKeys(value, keys, code) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new V5ProtocolError(code, 'Object does not match its closed contract.');
}

/** @param {unknown} locator */
function validateLocator(locator) {
  if (!plainObject(locator) || typeof locator.kind !== 'string') throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Source locator is invalid.');
  if (locator.kind === 'inline_text') {
    exactKeys(locator, ['kind', 'media_type', 'content'], 'RUN_ARGUMENT_INVALID');
    if (!SOURCE_MEDIA_TYPES.has(locator.media_type) || !nonblank(locator.content)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Inline source locator is invalid.');
  } else if (locator.kind === 'local_file') {
    exactKeys(locator, ['kind', 'absolute_path'], 'RUN_ARGUMENT_INVALID');
    if (!nonblank(locator.absolute_path) || !path.isAbsolute(locator.absolute_path) || locator.absolute_path.includes('\0')) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Local source locator must be absolute.');
  } else if (locator.kind === 'https_url') {
    exactKeys(locator, ['kind', 'url'], 'RUN_ARGUMENT_INVALID');
    return { kind: 'https_url', url: canonicalHttpsUrl(locator.url) };
  } else if (locator.kind === 'attachment') {
    exactKeys(locator, ['kind', 'attachment_ref'], 'RUN_ARGUMENT_INVALID');
    if (!nonblank(locator.attachment_ref)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Attachment source locator is invalid.');
  } else throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Source locator kind is unsupported.');
  return structuredClone(locator);
}

/** @param {unknown} bootstrap */
export function validateSourceBootstrap(bootstrap) {
  if (!plainObject(bootstrap)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'source_bootstrap is required.');
  exactKeys(bootstrap, ['source_request_seeds'], 'RUN_ARGUMENT_INVALID');
  if (!Array.isArray(bootstrap.source_request_seeds) || bootstrap.source_request_seeds.length === 0) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'source_bootstrap must contain at least one seed.');
  const clientKeys = new Set();
  const semanticKeys = new Set();
  const seeds = bootstrap.source_request_seeds.map((seed) => {
    if (!plainObject(seed)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Source request seed is invalid.');
    exactKeys(seed, ['source_request_client_key', 'source_role', 'locator', 'required'], 'RUN_ARGUMENT_INVALID');
    if (typeof seed.source_request_client_key !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(seed.source_request_client_key) || clientKeys.has(seed.source_request_client_key) || !SOURCE_ROLES.has(seed.source_role) || typeof seed.required !== 'boolean') throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Source request seed fields are invalid.');
    clientKeys.add(seed.source_request_client_key);
    const normalized = { source_request_client_key: seed.source_request_client_key, source_role: seed.source_role, locator: validateLocator(seed.locator), required: seed.required };
    const semanticKey = canonicalV5Stringify({ source_role: normalized.source_role, locator: normalized.locator, required: normalized.required });
    if (semanticKeys.has(semanticKey)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Source bootstrap contains a semantic duplicate.');
    semanticKeys.add(semanticKey);
    return normalized;
  });
  if (!seeds.some((seed) => seed.required)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'At least one source request must be required.');
  return { source_request_seeds: seeds.sort((left, right) => canonicalV5Stringify(left).localeCompare(canonicalV5Stringify(right))) };
}

/** @param {{source_request_seeds:Array<Record<string,any>>}} bootstrap */
export function deriveSourceRequests(bootstrap) {
  return bootstrap.source_request_seeds.map((seed) => ({
    request_id: stableV5Id('source_request', seed),
    source_request_client_key: seed.source_request_client_key,
    source_role: seed.source_role,
    locator: structuredClone(seed.locator),
    required: seed.required
  })).sort((left, right) => Number(right.required) - Number(left.required) || left.request_id.localeCompare(right.request_id));
}

/** @param {Array<Record<string,any>>} outstandingRequests */
export function currentSourceBatch(outstandingRequests) {
  return outstandingRequests.slice(0, 16).map((request) => structuredClone(request));
}

/** @param {Array<Record<string,any>>} advertisedRequests @param {Record<string,any>} action */
export function applySourceBatch(advertisedRequests, action) {
  if (!Array.isArray(action.request_ids) || !Array.isArray(action.request_dispositions) || !plainObject(action.source_payload)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source batch action is incomplete.');
  const expectedIds = advertisedRequests.map((request) => request.request_id).sort();
  const submittedIds = [...action.request_ids];
  if (new Set(submittedIds).size !== submittedIds.length || canonicalV5Stringify(submittedIds.sort()) !== canonicalV5Stringify(expectedIds)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source batch must bind the complete advertised request set.');
  if (action.request_dispositions.length !== expectedIds.length) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source dispositions must cover every advertised request exactly once.');
  const requestById = new Map(advertisedRequests.map((request) => [request.request_id, request]));
  const dispositionIds = new Set();
  /** @type {string[]} */
  const sourceClientKeys = [];
  const dispositions = action.request_dispositions.map((disposition) => {
    if (!plainObject(disposition) || typeof disposition.request_id !== 'string' || dispositionIds.has(disposition.request_id) || !requestById.has(disposition.request_id)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source disposition request binding is invalid.');
    dispositionIds.add(disposition.request_id);
    if (disposition.outcome === 'fulfilled') {
      exactKeys(disposition, ['request_id', 'outcome', 'source_client_keys'], 'SCHEMA_VALIDATION_FAILED');
      if (!Array.isArray(disposition.source_client_keys) || disposition.source_client_keys.length === 0 || new Set(disposition.source_client_keys).size !== disposition.source_client_keys.length || disposition.source_client_keys.some((key) => typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(key))) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Fulfilled source disposition is invalid.');
      sourceClientKeys.push(...disposition.source_client_keys);
    } else if (disposition.outcome === 'skipped_optional') {
      exactKeys(disposition, ['request_id', 'outcome', 'skip_reason'], 'SCHEMA_VALIDATION_FAILED');
      if (requestById.get(disposition.request_id)?.required || !nonblank(disposition.skip_reason) || scalarLength(disposition.skip_reason.trim()) > 256) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Required source requests cannot be skipped and reasons must be 1..256 scalars.');
    } else throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source disposition outcome is invalid.');
    return structuredClone(disposition);
  }).sort((left, right) => left.request_id.localeCompare(right.request_id));
  if (sourceClientKeys.length === 0) {
    exactKeys(action.source_payload, ['kind'], 'SCHEMA_VALIDATION_FAILED');
    if (action.source_payload.kind !== 'all_skipped_optional') throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'An all-skipped batch cannot carry a Source Pack.');
    return { dispositions, sourcePack: null };
  }
  exactKeys(action.source_payload, ['kind', 'source_pack'], 'SCHEMA_VALIDATION_FAILED');
  if (action.source_payload.kind !== 'fulfilled_sources' || !plainObject(action.source_payload.source_pack)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Fulfilled requests require one Source Pack.');
  exactKeys(action.source_payload.source_pack, ['sources'], 'SCHEMA_VALIDATION_FAILED');
  if (!Array.isArray(action.source_payload.source_pack.sources) || action.source_payload.source_pack.sources.length === 0) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source Pack must contain sources.');
  const sources = action.source_payload.source_pack.sources.map((source) => {
    if (!plainObject(source)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source Pack source is invalid.');
    exactKeys(source, ['source_client_key', 'media_type', 'content'], 'SCHEMA_VALIDATION_FAILED');
    if (typeof source.source_client_key !== 'string' || !SOURCE_MEDIA_TYPES.has(source.media_type) || typeof source.content !== 'string' || source.content.length === 0 || Buffer.byteLength(source.content, 'utf8') > 1_048_576) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source Pack source fields are invalid.');
    return structuredClone(source);
  }).sort((left, right) => left.source_client_key.localeCompare(right.source_client_key));
  const suppliedKeys = sources.map((source) => source.source_client_key);
  if (new Set(suppliedKeys).size !== suppliedKeys.length || canonicalV5Stringify(suppliedKeys) !== canonicalV5Stringify([...new Set(sourceClientKeys)].sort())) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Source Pack keys must equal fulfilled disposition bindings and contain no orphan object.');
  return { dispositions, sourcePack: { sources } };
}
