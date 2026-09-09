import assert from 'node:assert/strict';
import test from 'node:test';
import { digest } from '../../src/canonical.mjs';
import { canonicalizeSourceUrl, createSourceProviderRegistry, sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import replySchema from '../../skill/generate-test-cases/scripts/schemas/reply.schema.json' with { type: 'json' };

// The event API is characterized independently of acquisition I/O and runner wiring.
const moduleUrl = new URL('../../src/source-events.mjs', import.meta.url);
const api = /** @type {any} */ (await import(moduleUrl.href).catch((error) => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
}));
/** @param {string} name @param {...any} args */
function call(name, ...args) {
  assert.equal(typeof api[name], 'function', name + ' must be implemented');
  return api[name](...args);
}
/** @param {string} value */
const bytes = (value) => new TextEncoder().encode(value);
/** @param {any} value */
const hash = (value) => 'sha256:' + digest(value);
const registry = createSourceProviderRegistry([
  { provider: 'cooper', version: '1', hosts: ['cooper.example.test'], kind: 'cooper', query_order: 'sensitive' }
]);
/** @param {string} [uri] @param {any} [overrides] */
function request(uri = 'https://unknown.example.test/item?id=1&signature=SECRET_ONE', overrides = {}) {
  return call('createArtifactRequest', {
    run_id: 'RUN-1', committed_revision: 3, stable_source_id: 'SOURCE-1',
    structural_locator: { kind: 'block', block_index: 0 }, url_ordinal: 0,
    reason_code: 'UNSUPPORTED_SIGNED_URL_PROVIDER', ...overrides
  }, canonicalizeSourceUrl(uri, registry));
}
/** @param {any[]} [requests] */
function context(requests = [request()]) {
  return { run_id: 'RUN-1', committed_revision: 3, checkpoint_bytes: bytes('{"revision":3}\n'), artifact_requests: requests, prior_acquisitions: [] };
}
/** @param {Uint8Array} [content] */
function upload(content = bytes('asset bytes')) {
  return { kind: 'safe_upload_ref', upload_id: 'UPLOAD-1', media_type: 'image/png', byte_length: content.length, content_digest: sourceByteDigest(content) };
}
/** @param {any} state @param {any} [input] */
function event(state, input = upload()) {
  return call('createProvideArtifactEvent', state.artifact_requests[0], call('createArtifactResumeRef', state), input, registry);
}
/** @param {any} item */
function reidentify(item) {
  const { event_id: ignored, ...payload } = item;
  return { ...payload, event_id: 'EVENT-' + digest(payload) };
}

test('T11 artifact request derives all 5.7 identities without retaining query or credentials', () => {
  const first = request();
  const ordinary = hash([['id', '1']]);
  const source = hash({ stable_source_id: 'SOURCE-1', structural_locator: { kind: 'block', block_index: 0 }, url_ordinal: 0, ordinary_query_digest: ordinary });
  const identity = { run_id: 'RUN-1', committed_revision: 3, reason_code: first.reason_code, provider: first.provider, redacted_resource_ref: 'unknown.example.test/item', source_reference_digest: source, ordinary_query_digest: ordinary };
  assert.equal(first.ordinary_query_digest, ordinary);
  assert.equal(first.source_reference_digest, source);
  assert.equal(first.artifact_request_id, 'ARQ-' + digest(identity));
  const { request_version_digest: version, ...body } = first;
  assert.equal(version, hash(body));
  assert.deepEqual(validateAgainstSchema(first, { $ref: '#/$defs/artifactRequest', $defs: replySchema.$defs }), []);
  assert.deepEqual(first, request('https://unknown.example.test/item?id=1&signature=SECRET_TWO'));
  assert.notEqual(first.artifact_request_id, request('https://unknown.example.test/item?id=2&signature=SECRET_TWO').artifact_request_id);
  assert.notEqual(first.artifact_request_id, request(undefined, { structural_locator: { kind: 'block', block_index: 1 } }).artifact_request_id);
  assert.notEqual(first.artifact_request_id, request(undefined, { url_ordinal: 1 }).artifact_request_id);
  assert.doesNotMatch(JSON.stringify(first), /[?#]|id=1|SECRET_ONE|signature/);
});

test('T11 resume binds exact checkpoint bytes and a sorted complete request set', () => {
  const first = request();
  const second = request(undefined, { url_ordinal: 1 });
  const state = context([second, first]);
  const resume = call('createArtifactResumeRef', state);
  assert.deepEqual(validateAgainstSchema(resume, { $ref: '#/$defs/resumeRef', $defs: replySchema.$defs }), []);
  assert.equal(resume.committed_checkpoint_digest, sourceByteDigest(state.checkpoint_bytes));
  assert.equal(resume.request_set_digest, hash([first, second].sort((a, b) => a.artifact_request_id.localeCompare(b.artifact_request_id))));
  assert.deepEqual(resume, call('createArtifactResumeRef', context([first, second])));
  assert.notEqual(resume.committed_checkpoint_digest, call('createArtifactResumeRef', { ...state, checkpoint_bytes: bytes('{ "revision": 3 }\n') }).committed_checkpoint_digest);
  const changed = structuredClone(first);
  changed.why_needed = 'A changed safe explanation.';
  const { request_version_digest: ignored, ...payload } = changed;
  changed.request_version_digest = hash(payload);
  assert.notEqual(resume.request_set_digest, call('createArtifactResumeRef', context([second, changed])).request_set_digest);
});

test('T11 artifact event is constructible from request, resume and safe input with shared closed definitions', () => {
  const state = context();
  const actual = event(state);
  const { event_id: id, ...body } = actual;
  assert.equal(id, 'EVENT-' + digest(body));
  assert.deepEqual(validateAgainstSchema(actual, api.provideArtifactEventSchema), []);
  assert.deepEqual(api.provideArtifactEventSchema.$defs.resumeRef, replySchema.$defs.resumeRef);
  assert.deepEqual(api.provideArtifactEventSchema.$defs.artifactRequest, replySchema.$defs.artifactRequest);
  assert.deepEqual(api.provideArtifactEventSchema.$defs.sha256, replySchema.$defs.sha256);
  for (const mutate of [
    (/** @type {any} */ value) => { value.extra = true; },
    (/** @type {any} */ value) => { value.resume_ref.extra = true; },
    (/** @type {any} */ value) => { value.input.extra = true; },
    (/** @type {any} */ value) => { delete value.input.content_digest; }
  ]) {
    const bad = structuredClone(actual); mutate(bad);
    assert.notDeepEqual(validateAgainstSchema(bad, api.provideArtifactEventSchema), []);
  }
});

test('T11 stable resource event resolves only registered provider/version without URI credentials', () => {
  const state = context();
  const input = { kind: 'stable_resource_id', provider: 'cooper', provider_contract_version: '1', resource_id: 'document/123' };
  const actual = event(state, input);
  const prepared = call('validateProvideArtifactEvent', state, actual, registry);
  assert.equal(prepared.status, 'ready_for_acquisition');
  assert.deepEqual(prepared.input, input);
  const result = call('acceptProvidedArtifact', state, actual, bytes('downloaded content'), registry);
  assert.equal(result.acquisition_record.content_digest, sourceByteDigest(bytes('downloaded content')));
});

for (const [name, patch] of /** @type {[string, Record<string,string>][]} */ ([
  ['unregistered provider', { provider: 'unknown' }], ['stale provider version', { provider_contract_version: '2' }],
  ['signed URI', { resource_id: 'https://cooper.example.test/doc?signature=SECRET_ONE' }],
  ['query', { resource_id: 'doc?signature=SECRET_ONE' }], ['fragment', { resource_id: 'doc#fragment' }],
  ['encoded query', { resource_id: 'doc%3Fsignature%3DSECRET_ONE' }], ['URI scheme', { resource_id: 'https:doc' }]
])) test('T11 safe stable resource rejects ' + name + ' without echoing the input', () => {
  const state = context();
  assert.throws(() => event(state, { kind: 'stable_resource_id', provider: 'cooper', provider_contract_version: '1', resource_id: 'doc', ...patch }), (/** @type {any} */ error) => {
    assert.doesNotMatch(String(error), /SECRET_ONE|signature=|https:/); return true;
  });
});

test('T11 safe upload validates bytes before returning an acquisition record', () => {
  const state = context();
  const snapshot = structuredClone(state);
  const actual = event(state);
  const result = call('acceptProvidedArtifact', state, actual, bytes('asset bytes'), registry);
  assert.equal(result.status, 'acquired');
  assert.deepEqual(result.acquisition_record, {
    artifact_request_id: actual.artifact_request_id, event_id: actual.event_id,
    input_identity: hash(actual.input), content_digest: sourceByteDigest(bytes('asset bytes')), byte_length: bytes('asset bytes').length
  });
  assert.deepEqual(state, snapshot);
  assert.throws(() => call('acceptProvidedArtifact', state, actual, bytes('asset bytez'), registry), /ARTIFACT_BYTE_DIGEST_MISMATCH/);
  assert.throws(() => call('acceptProvidedArtifact', state, actual, bytes('short'), registry), /ARTIFACT_BYTE_LENGTH_MISMATCH/);
  assert.throws(() => event(state, { ...upload(), content_digest: undefined }), /ARTIFACT_INPUT_INVALID/);
  assert.throws(() => event(state, { ...upload(), upload_id: 'https://upload.test/?token=SECRET_ONE' }), /ARTIFACT_INPUT_INVALID/);
  assert.deepEqual(state, snapshot);
});

for (const [name, mutate] of [
  ['run', (/** @type {any} */ e) => { e.resume_ref.run_id = 'RUN-other'; }],
  ['revision', (/** @type {any} */ e) => { e.resume_ref.committed_revision += 1; }],
  ['checkpoint digest', (/** @type {any} */ e) => { e.resume_ref.committed_checkpoint_digest = hash('other'); }],
  ['request set digest', (/** @type {any} */ e) => { e.resume_ref.request_set_digest = hash([]); }],
  ['request ID', (/** @type {any} */ e) => { e.artifact_request_id = 'ARQ-' + digest('other'); }],
  ['request version', (/** @type {any} */ e) => { e.request_version_digest = hash('other'); }]
]) test('T11 stale ' + name + ' is rejected at pre-acquisition validation without mutation', () => {
  const state = context(); const snapshot = structuredClone(state); const stale = event(state);
  assert.equal(typeof mutate, 'function');
  /** @type {Function} */ (mutate)(stale);
  assert.throws(() => call('validateProvideArtifactEvent', state, reidentify(stale), registry), /ARTIFACT_(?:RESUME|REQUEST)_STALE/);
  assert.deepEqual(state, snapshot);
});

test('T11 permitted input kinds and event identity cannot be bypassed by a valid-looking payload', () => {
  const onlyUpload = request(undefined, { allowed_input_kinds: ['safe_upload_ref'] });
  const state = context([onlyUpload]);
  assert.throws(() => event(state, { kind: 'stable_resource_id', provider: 'cooper', provider_contract_version: '1', resource_id: 'doc' }), /ARTIFACT_INPUT_KIND_NOT_ALLOWED/);
  const bad = event(state); bad.event_id = 'EVENT-' + digest('forged');
  assert.throws(() => call('validateProvideArtifactEvent', state, bad, registry), /ARTIFACT_EVENT_ID_MISMATCH/);
});

test('T11 identical event replay returns the same acquisition result without requiring bytes again', () => {
  const state = context(); const actual = event(state);
  const result = call('acceptProvidedArtifact', state, actual, bytes('asset bytes'), registry);
  const replayState = { ...state, prior_acquisitions: [result] };
  assert.deepEqual(call('acceptProvidedArtifact', replayState, actual, undefined, registry), result);
  const conflict = structuredClone(actual); conflict.input.upload_id = 'UPLOAD-other';
  assert.throws(() => call('validateProvideArtifactEvent', replayState, conflict, registry), /ARTIFACT_IDEMPOTENCY_CONFLICT/);
  const snapshot = structuredClone(replayState);
  assert.deepEqual(call('acceptProvidedArtifact', replayState, actual, undefined, registry), result);
  assert.deepEqual(replayState, snapshot);
});

test('T11 request context rejects duplicates, tampered versions and unsafe resource refs', () => {
  const first = request();
  assert.throws(() => call('createArtifactResumeRef', context([first, first])), /ARTIFACT_REQUEST_SET_INVALID/);
  assert.throws(() => call('createArtifactResumeRef', context([{ ...first, why_needed: 'changed' }])), /ARTIFACT_REQUEST_VERSION_MISMATCH/);
  assert.throws(() => call('createArtifactResumeRef', { ...context(), committed_revision: -1 }), /ARTIFACT_CONTEXT_INVALID/);
  assert.throws(() => call('createArtifactRequest', {
    run_id: 'RUN-1', committed_revision: 3, stable_source_id: 'SOURCE-1',
    structural_locator: { kind: 'block', block_index: 0 }, url_ordinal: 0,
    reason_code: 'UNSUPPORTED_SIGNED_URL_PROVIDER'
  }, { ...canonicalizeSourceUrl('https://unknown.example.test/item?signature=SECRET_ONE', registry), redacted_resource_ref: 'unknown.example.test/item?signature=SECRET_ONE' }), /ARTIFACT_REFERENCE_INVALID/);
});

test('T11 safe results never persist raw signed URL, query pairs, retrieval paths or mutable aliases', () => {
  const state = context(); const actual = event(state); const inputSnapshot = structuredClone(actual);
  const prepared = call('validateProvideArtifactEvent', state, actual, registry);
  const result = call('acceptProvidedArtifact', state, actual, bytes('asset bytes'), registry);
  prepared.input.upload_id = 'mutated';
  assert.deepEqual(actual, inputSnapshot);
  actual.input.upload_id = 'changed after accepting';
  assert.deepEqual(result.event, inputSnapshot);
  assert.doesNotMatch(JSON.stringify({ request: state.artifact_requests, resume: call('createArtifactResumeRef', state), prepared, result }), /SECRET_ONE|signature|id=1|https:\/\/unknown|retrieval_uri|checkpoint_bytes|ordinary_query_pairs/);
});

test('T11 quarantined host/path permits a nondefault port without treating it as a resource URI scheme', () => {
  const actual = request('https://unknown.example.test:8443/item?id=1&signature=SECRET_ONE');
  assert.equal(actual.redacted_resource_ref, 'unknown.example.test:8443/item');
  assert.doesNotMatch(JSON.stringify(actual), /SECRET_ONE|signature|id=1/);
});
