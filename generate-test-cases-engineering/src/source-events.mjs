import replySchema from '../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };
import { canonicalStringify, digest } from './canonical.mjs';
import { hasSourceProviderContract, sourceByteDigest } from './source-canonicalization.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

// Resume/request/digest contracts have one owner, the reply Schema. Event-only
// definitions live here until Source Pack's event union imports this same set.
const sourceEventDefs = {
  sha256: replySchema.$defs.sha256,
  resumeRef: replySchema.$defs.resumeRef,
  artifactRequest: replySchema.$defs.artifactRequest,
  stableResourceInput: {
    type: 'object', additionalProperties: false,
    required: ['kind', 'provider', 'provider_contract_version', 'resource_id'],
    properties: {
      kind: { const: 'stable_resource_id' }, provider: { type: 'string', minLength: 1 },
      provider_contract_version: { type: 'string', minLength: 1 }, resource_id: { type: 'string', minLength: 1 }
    }
  },
  safeUploadInput: {
    type: 'object', additionalProperties: false,
    required: ['kind', 'upload_id', 'media_type', 'byte_length', 'content_digest'],
    properties: {
      kind: { const: 'safe_upload_ref' }, upload_id: { type: 'string', minLength: 1 },
      media_type: { type: 'string', minLength: 1 }, byte_length: { type: 'integer', minimum: 0 },
      content_digest: { $ref: '#/$defs/sha256' }
    }
  },
  provideArtifactEvent: {
    type: 'object', additionalProperties: false,
    required: ['event_id', 'event_type', 'artifact_request_id', 'request_version_digest', 'resume_ref', 'input'],
    properties: {
      event_id: { type: 'string', pattern: '^EVENT-[0-9a-f]{64}$' }, event_type: { const: 'provide_artifact' },
      artifact_request_id: { type: 'string', pattern: '^ARQ-[0-9a-f]{64}$' },
      request_version_digest: { $ref: '#/$defs/sha256' }, resume_ref: { $ref: '#/$defs/resumeRef' },
      input: { oneOf: [{ $ref: '#/$defs/stableResourceInput' }, { $ref: '#/$defs/safeUploadInput' }] }
    }
  }
};
export const provideArtifactEventSchema = { $ref: '#/$defs/provideArtifactEvent', $defs: sourceEventDefs };
/** @param {unknown} value */
const hash = (value) => 'sha256:' + digest(value);
/** @param {unknown} value */
const text = (value) => typeof value === 'string' && value.trim().length > 0;
/** @param {any} value @param {string} name @param {string} code */
function requireShape(value, name, code) {
  if (validateAgainstSchema(value, { $ref: '#/$defs/' + name, $defs: sourceEventDefs }).length) throw new TypeError(code);
}
/** @param {any} context */
function requireRun(context) {
  if (!context || !text(context.run_id) || !Number.isSafeInteger(context.committed_revision) || context.committed_revision < 0) {
    throw new TypeError('ARTIFACT_CONTEXT_INVALID');
  }
}
/** Reject disguised URI inputs as well as literal schemes/query/fragment.
 * @param {string} value
 */
function safeResourceId(value) {
  if (!text(value)) return false;
  let decoded = value;
  try {
    for (let i = 0; i < 4; i += 1) {
      if (/[?#\u0000-\u0020\u007f]/u.test(decoded) || /^[a-z][a-z0-9+.-]*:/iu.test(decoded)) return false;
      const next = decodeURIComponent(decoded);
      if (next === decoded) return true;
      decoded = next;
    }
  } catch { return false; }
  return false;
}
/** A redacted host/path is not a material resource ID: a port is allowed.
 * @param {unknown} value
 */
function safeRedactedRef(value) {
  return text(value) && typeof value === 'string'
    && !/[?#\u0000-\u0020\u007f]/u.test(value) && !/^[a-z][a-z0-9+.-]*:\/\//iu.test(value);
}
/** @param {any} request */
function requireRequest(request) {
  requireShape(request, 'artifactRequest', 'ARTIFACT_REQUEST_INVALID');
  if (!safeRedactedRef(request.redacted_resource_ref)) throw new TypeError('ARTIFACT_REFERENCE_INVALID');
  const { request_version_digest: version, ...body } = request;
  if (version !== hash(body)) throw new TypeError('ARTIFACT_REQUEST_VERSION_MISMATCH');
}
/** @param {any} context @param {any} request */
function requestId(context, request) {
  return 'ARQ-' + digest({
    run_id: context.run_id, committed_revision: context.committed_revision,
    reason_code: request.reason_code, provider: request.provider, redacted_resource_ref: request.redacted_resource_ref,
    source_reference_digest: request.source_reference_digest, ordinary_query_digest: request.ordinary_query_digest
  });
}

/**
 * Input context's locator must already be a canonical block/cell/image coordinate.
 * This API hashes it; source-audit owns coordinate/content validation. Only safe
 * URL parser output reaches the request; neither locator text nor query is copied.
 * @param {any} context @param {any} reference
 */
export function createArtifactRequest(context, reference) {
  requireRun(context);
  if (!text(context.stable_source_id) || !context.structural_locator || typeof context.structural_locator !== 'object'
    || Array.isArray(context.structural_locator) || !Number.isSafeInteger(context.url_ordinal) || context.url_ordinal < 0) {
    throw new TypeError('ARTIFACT_CONTEXT_INVALID');
  }
  if (!reference || !['canonical', 'need_artifact'].includes(reference.status)
    || !text(reference.provider) || !safeRedactedRef(reference.redacted_resource_ref)
    || !/^sha256:[0-9a-f]{64}$/u.test(reference.ordinary_query_digest)) throw new TypeError('ARTIFACT_REFERENCE_INVALID');
  const reason = context.reason_code ?? reference.reason_code;
  if (!['SOURCE_ASSET_UNAVAILABLE', 'UNSUPPORTED_SIGNED_URL_PROVIDER'].includes(reason)) throw new TypeError('ARTIFACT_REASON_INVALID');
  const identity = {
    reason_code: reason, provider: reference.provider, redacted_resource_ref: reference.redacted_resource_ref,
    source_reference_digest: hash({
      stable_source_id: context.stable_source_id, structural_locator: context.structural_locator,
      url_ordinal: context.url_ordinal, ordinary_query_digest: reference.ordinary_query_digest
    }),
    ordinary_query_digest: reference.ordinary_query_digest
  };
  const body = {
    artifact_request_id: requestId(context, identity), ...identity,
    why_needed: reason === 'SOURCE_ASSET_UNAVAILABLE'
      ? 'The referenced source asset is unavailable; provide a stable resource or verified upload.'
      : 'This source URL cannot be accepted safely; provide a stable resource or verified upload.',
    allowed_input_kinds: structuredClone(context.allowed_input_kinds ?? ['stable_resource_id', 'safe_upload_ref'])
  };
  const request = { ...body, request_version_digest: hash(body) };
  requireRequest(request);
  return request;
}

/**
 * Pure preflight over committed state. checkpoint_bytes must be read directly
 * from the canonical checkpoint file; parsing/re-serializing it is not equivalent.
 * @param {any} context
 */
export function createArtifactResumeRef(context) {
  requireRun(context);
  if (!(context.checkpoint_bytes instanceof Uint8Array)) throw new TypeError('ARTIFACT_CONTEXT_INVALID');
  if (!Array.isArray(context.artifact_requests) || context.artifact_requests.length === 0) throw new TypeError('ARTIFACT_REQUEST_SET_INVALID');
  const ids = new Set();
  for (const request of context.artifact_requests) {
    requireRequest(request);
    if (ids.has(request.artifact_request_id)) throw new TypeError('ARTIFACT_REQUEST_SET_INVALID');
    if (request.artifact_request_id !== requestId(context, request)) throw new TypeError('ARTIFACT_REQUEST_STALE');
    ids.add(request.artifact_request_id);
  }
  const requests = [...context.artifact_requests].sort((a, b) => a.artifact_request_id < b.artifact_request_id ? -1 : 1);
  return {
    run_id: context.run_id, committed_revision: context.committed_revision,
    committed_checkpoint_digest: sourceByteDigest(context.checkpoint_bytes), request_set_digest: hash(requests)
  };
}

/** @param {any} request @param {any} input @param {object} registry */
function requireInput(request, input, registry) {
  if (!input || !['stable_resource_id', 'safe_upload_ref'].includes(input.kind)) throw new TypeError('ARTIFACT_INPUT_INVALID');
  requireShape(input, input.kind === 'stable_resource_id' ? 'stableResourceInput' : 'safeUploadInput', 'ARTIFACT_INPUT_INVALID');
  if (!request.allowed_input_kinds.includes(input.kind)) throw new TypeError('ARTIFACT_INPUT_KIND_NOT_ALLOWED');
  if (input.kind === 'stable_resource_id') {
    if (!safeResourceId(input.resource_id) || !hasSourceProviderContract(registry, input.provider, input.provider_contract_version)) {
      throw new TypeError('ARTIFACT_INPUT_INVALID');
    }
  } else if (!safeResourceId(input.upload_id)) throw new TypeError('ARTIFACT_INPUT_INVALID');
}

/** Constructible solely from a need_artifact reply and a safe user input.
 * @param {any} request @param {any} resumeRef @param {any} input @param {object} registry
 */
export function createProvideArtifactEvent(request, resumeRef, input, registry) {
  requireRequest(request);
  requireShape(resumeRef, 'resumeRef', 'ARTIFACT_RESUME_INVALID');
  requireInput(request, input, registry);
  const payload = {
    event_type: 'provide_artifact', artifact_request_id: request.artifact_request_id,
    request_version_digest: request.request_version_digest, resume_ref: structuredClone(resumeRef), input: structuredClone(input)
  };
  return { event_id: 'EVENT-' + digest(payload), ...payload };
}

/**
 * Call before fetching any material. This performs no I/O and never mutates state.
 * Histories contain only successful results returned by acceptProvidedArtifact.
 * Matching replay is recognized after current resume/request checks, so a retired
 * request cannot revive merely because its event remains in historical state.
 * @param {any} context @param {any} event @param {object} registry
 * @returns {any}
 */
export function validateProvideArtifactEvent(context, event, registry) {
  requireShape(event, 'provideArtifactEvent', 'ARTIFACT_EVENT_INVALID');
  const resume = createArtifactResumeRef(context);
  if (canonicalStringify(event.resume_ref) !== canonicalStringify(resume)) throw new TypeError('ARTIFACT_RESUME_STALE');
  const request = context.artifact_requests.find((/** @type {any} */ item) => item.artifact_request_id === event.artifact_request_id);
  if (!request || request.request_version_digest !== event.request_version_digest) throw new TypeError('ARTIFACT_REQUEST_STALE');
  requireInput(request, event.input, registry);
  const history = context.prior_acquisitions ?? [];
  if (!Array.isArray(history)) throw new TypeError('ARTIFACT_HISTORY_INVALID');
  const previous = history.filter((/** @type {any} */ item) => item?.event?.event_id === event.event_id);
  if (previous.length > 1) throw new TypeError('ARTIFACT_HISTORY_INVALID');
  if (previous.length && canonicalStringify(previous[0].event) !== canonicalStringify(event)) {
    throw new TypeError('ARTIFACT_IDEMPOTENCY_CONFLICT');
  }
  const { event_id: id, ...payload } = event;
  if (id !== 'EVENT-' + digest(payload)) throw new TypeError('ARTIFACT_EVENT_ID_MISMATCH');
  if (previous.length) {
    const result = previous[0];
    const record = result.acquisition_record;
    if (result.status !== 'acquired' || !record || record.event_id !== id || record.artifact_request_id !== request.artifact_request_id
      || record.input_identity !== hash(event.input) || !Number.isSafeInteger(record.byte_length) || record.byte_length < 0
      || !/^sha256:[0-9a-f]{64}$/u.test(record.content_digest)
      || (event.input.kind === 'safe_upload_ref' && (record.byte_length !== event.input.byte_length || record.content_digest !== event.input.content_digest))) {
      throw new TypeError('ARTIFACT_HISTORY_INVALID');
    }
    return { status: 'replayed', result: structuredClone(result) };
  }
  return { status: 'ready_for_acquisition', input: structuredClone(event.input) };
}

/**
 * Verifies acquired bytes and returns a persistable result; the caller appends it
 * atomically and resumes the checkpoint. No bytes, query, local path or retrieval
 * metadata enter this result. Stable-resource resolver failure stays need_artifact
 * in the acquisition caller and must never be represented by an empty asset.
 * @param {any} context @param {any} event @param {Uint8Array|undefined} acquiredBytes @param {object} registry
 */
export function acceptProvidedArtifact(context, event, acquiredBytes, registry) {
  const validation = validateProvideArtifactEvent(context, event, registry);
  if (validation.status === 'replayed') return validation.result;
  if (!(acquiredBytes instanceof Uint8Array)) throw new TypeError('ARTIFACT_BYTES_UNAVAILABLE');
  if (event.input.kind === 'safe_upload_ref' && acquiredBytes.byteLength !== event.input.byte_length) {
    throw new TypeError('ARTIFACT_BYTE_LENGTH_MISMATCH');
  }
  const contentDigest = sourceByteDigest(acquiredBytes);
  if (event.input.kind === 'safe_upload_ref' && contentDigest !== event.input.content_digest) throw new TypeError('ARTIFACT_BYTE_DIGEST_MISMATCH');
  return {
    status: 'acquired', event: structuredClone(event),
    acquisition_record: {
      artifact_request_id: event.artifact_request_id, event_id: event.event_id,
      input_identity: hash(event.input), content_digest: contentDigest, byte_length: acquiredBytes.byteLength
    }
  };
}
