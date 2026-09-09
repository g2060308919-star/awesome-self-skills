import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceBoundaryFixture } from '../helpers/v4-source-boundary.mjs';
import { buildJourney } from '../helpers/run-journey.mjs';
import { canonicalStringify, digest } from '../../src/canonical.mjs';
import { createArtifactRequest, createArtifactResumeRef, createProvideArtifactEvent } from '../../src/source-events.mjs';
import { canonicalizeSourceUrl, createSourceProviderRegistry, sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { canonicalizeAuditedSourceCapture, createExpiryMatcherRegistry } from '../../src/source-capture-audit.mjs';
import { compileCanonicalSourceStructure } from '../../src/source-locators-v4.mjs';
import { canonicalSourceSubject } from '../../src/source-subjects-v4.mjs';

const moduleUrl = new URL('../../src/source-compiler-v4.mjs', import.meta.url);
const api = /** @type {any} */ (await import(moduleUrl.href).catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url === moduleUrl.href) return {};
  throw error;
}));
/** @param {any} fixture @param {any} [extra] */
function compile(fixture, extra = {}) {
  assert.equal(typeof api.compileSourceEvidence, 'function', 'production source compiler boundary is required');
  return api.compileSourceEvidence({ source_pack: fixture.pack, evidence_claims: fixture.evidence }, {
    provider_registry: fixture.providers, expiry_registry: fixture.expiry, subject_registry: fixture.subjects,
    acquisitions: fixture.acquisitions, ...extra
  });
}

test('T11 production source boundary recomputes raw audit and canonical structure/digest before preserving E3 evidence', () => {
  const f = sourceBoundaryFixture(); const before = canonicalStringify(f.pack); const result = compile(f);
  assert.equal(result.status, 'accepted'); assert.deepEqual(result.diagnostics, []);
  assert.equal(result.evidence.claimsById.get('claim_checkout').level, 'E3');
  assert.equal(result.source_pack.sources[0].semantic_digest, f.pack.sources[0].semantic_digest);
  assert.equal(canonicalStringify(f.pack), before); assert.ok(!JSON.stringify(result).includes('capture_bytes'));
});

test('T11 production source boundary preserves v3 instead of pretending v3 metadata is a v4 source', () => {
  const journey = buildJourney('all-e3'); const result = compile({ ...sourceBoundaryFixture(), pack: journey.source_pack, evidence: journey.evidence_claims });
  assert.equal(result.status, 'accepted'); assert.equal(result.evidence.claimsById.get('claim_checkout').level, 'E3');
});

test('T11 production source boundary rejects digest-consistent projection, exclusion and missing/foreign byte-source forgeries', () => {
  for (const mutate of [
    (/** @type {any} */ f) => { f.pack.sources[0].semantic_projection.content = 'forged'; f.pack.sources[0].semantic_digest = 'sha256:' + digest(f.pack.sources[0].semantic_projection); },
    (/** @type {any} */ f) => { f.pack.sources[0].capture_audit.units[0].retained_spans[0].end -= 1; },
    (/** @type {any} */ f) => { f.acquisitions = []; },
    (/** @type {any} */ f) => { f.acquisitions[0].source_id = 'foreign'; },
    (/** @type {any} */ f) => { f.acquisitions.push(f.acquisitions[0]); },
    (/** @type {any} */ f) => { f.providers = {}; },
    (/** @type {any} */ f) => { f.acquisitions[0].acquisition = { provider: 'invented', provider_contract_version: '1' }; }
  ]) { const f = sourceBoundaryFixture(); mutate(f); const result = compile(f); assert.equal(result.status, 'rejected'); assert.ok(result.diagnostics.length); assert.equal(result.evidence, undefined); }
});

test('T11 production quarantine produces source-bound safe requests whose identity ignores credentials but not ordinary query', () => {
  /** @param {string} uri */
  function run(uri) {
    const f = sourceBoundaryFixture(); f.acquisitions[0].input.capture_bytes = new TextEncoder().encode('# Reference\n\n[contract](' + uri + ')');
    return compile(f, { artifact_context: { run_id: f.pack.run_instance_id, committed_revision: 0, checkpoint_bytes: new TextEncoder().encode('{"committed":true}\n'), artifact_requests: [] } });
  }
  const a = run('https://unknown.test/a?id=1&signature=SECRET_A');
  const rotation = run('https://unknown.test/a?id=1&signature=SECRET_B');
  const business = run('https://unknown.test/a?id=2&signature=SECRET_B');
  for (const result of [a, rotation, business]) { assert.equal(result.status, 'need_artifact'); assert.equal(result.reason_code, 'UNSUPPORTED_SIGNED_URL_PROVIDER'); assert.equal(result.evidence, undefined); assert.ok(!/SECRET_|id=|signature/i.test(JSON.stringify(result))); }
  assert.equal(a.artifact_requests[0].artifact_request_id, rotation.artifact_requests[0].artifact_request_id);
  assert.notEqual(a.artifact_requests[0].artifact_request_id, business.artifact_requests[0].artifact_request_id);
});

function artifactFixture() {
  const f = sourceBoundaryFixture(); const bytes = f.acquisitions[0].input.capture_bytes;
  const context = { run_id: f.pack.run_instance_id, committed_revision: 0, checkpoint_bytes: new TextEncoder().encode('{}\n'), artifact_requests: /** @type {any[]} */ ([]) };
  const reference = canonicalizeSourceUrl('https://unknown.test/a?signature=hidden', f.providers);
  const request = createArtifactRequest({ ...context, stable_source_id: f.pack.sources[0].source_id, structural_locator: { unit_kind: 'text', unit_ordinal: 0 }, url_ordinal: 0 }, reference);
  context.artifact_requests.push(request);
  const event = createProvideArtifactEvent(request, createArtifactResumeRef(context), { kind: 'safe_upload_ref', upload_id: 'UPLOAD1', media_type: 'text/plain', byte_length: bytes.length, content_digest: sourceByteDigest(bytes) }, f.providers);
  f.pack.artifact_events.push(event);
  f.acquisitions[0].input.capture_bytes = undefined;
  return { f, context, event, bytes, bindings: [{ artifact_request_id: request.artifact_request_id, source_id: f.pack.sources[0].source_id, target: 'capture' }] };
}

test('T11 source compiler checks every artifact event before reading any bytes and resumes verified upload from the checkpoint', () => {
  const { f, context, bytes, bindings } = artifactFixture(); let reads = 0;
  const result = compile(f, { artifact_context: context, artifact_bindings: bindings, read_artifact_bytes: () => { reads += 1; return bytes; } });
  assert.equal(result.status, 'accepted'); assert.equal(reads, 1); assert.equal(result.acquisitions.length, 1);
  assert.equal(result.acquisitions[0].acquisition_record.content_digest, sourceByteDigest(bytes));
  const stale = structuredClone(f); stale.pack.artifact_events[0].resume_ref.committed_revision += 1;
  const rejected = compile({ ...f, pack: stale.pack }, { artifact_context: context, artifact_bindings: bindings, read_artifact_bytes: () => { reads += 1; return bytes; } });
  assert.equal(rejected.status, 'rejected'); assert.equal(reads, 1); assert.equal(rejected.evidence, undefined);
  const replay = compile({ ...f, acquisitions: [{ ...f.acquisitions[0], input: { ...f.acquisitions[0].input, capture_bytes: bytes } }] }, {
    artifact_context: { ...context, prior_acquisitions: result.acquisitions }, artifact_bindings: bindings,
    read_artifact_bytes: () => { throw new Error('must not fetch on replay'); }
  });
  assert.equal(replay.status, 'accepted'); assert.deepEqual(replay.acquisitions, result.acquisitions);
});

test('T11 failed material acquisition returns only need_artifact and cannot emit dependent facts', () => {
  const { f, context, bindings } = artifactFixture();
  const result = compile(f, { artifact_context: context, artifact_bindings: bindings, read_artifact_bytes: () => { throw new Error('SECRET_SIGNED_URI'); } });
  assert.equal(result.status, 'need_artifact'); assert.equal(result.reason_code, 'SOURCE_ASSET_UNAVAILABLE');
  assert.equal(result.evidence, undefined); assert.ok(!JSON.stringify(result).includes('SECRET_SIGNED_URI'));
});

test('T11 stable-resource artifact accepts only a registered provider/version and verifies actual refreshed bytes', () => {
  const { f, context, bytes, bindings } = artifactFixture();
  f.providers = createSourceProviderRegistry([{ provider: 'test-cooper', kind: 'cooper', version: 'v1', hosts: ['cooper.test'], query_order: 'sensitive' }]);
  f.pack.artifact_events = [createProvideArtifactEvent(context.artifact_requests[0], createArtifactResumeRef(context), { kind: 'stable_resource_id', provider: 'test-cooper', provider_contract_version: 'v1', resource_id: 'document/1' }, f.providers)];
  const result = compile(f, { artifact_context: context, artifact_bindings: bindings, read_artifact_bytes: () => bytes });
  assert.equal(result.status, 'accepted'); assert.equal(result.acquisitions[0].acquisition_record.content_digest, sourceByteDigest(bytes));
});

/** @param {any} f @param {any[]} [assets] */
function rebindSource(f, assets = f.acquisitions[0].input.assets) {
  const source = f.pack.sources[0];
  const audited = canonicalizeAuditedSourceCapture({ ...f.acquisitions[0].input, assets }, f.providers, {}, f.expiry);
  const projection = { ...audited.semantic_projection, structure: compileCanonicalSourceStructure(source.source_id, audited.semantic_projection.content) };
  Object.assign(source, { content: projection.content, content_digest: sourceByteDigest(new TextEncoder().encode(projection.content)).slice(7),
    capture_digest: audited.capture_digest, capture_audit: audited.capture_audit, semantic_projection: projection, semantic_digest: 'sha256:' + digest(projection) });
  f.pack.locators[0].semantic_digest = source.semantic_digest;
  f.evidence.claims[0].document_level_claim = projection.structure.length === 1;
  f.pack.source_reviews[0] = { source_id: source.source_id, semantic_digest: source.semantic_digest, units: projection.structure.map((/** @type {any} */ unit, /** @type {number} */ index) => ({ unit_id: unit.unit_id, content_digest: sourceByteDigest(new TextEncoder().encode(unit.text)), classification: index === 0 ? 'normative' : 'non_normative' })) };
}

test('T11 production source boundary rejects a changed asset at the same canonical URI instead of reusing old semantic identity', () => {
  const f = sourceBoundaryFixture();
  f.acquisitions[0].input.capture_bytes = new TextEncoder().encode(f.pack.sources[0].content + '\n\n![Decoration](https://assets.test/image.png)');
  f.acquisitions[0].input.assets = [{ retrieval_uri: 'https://assets.test/image.png', bytes: new TextEncoder().encode('original bytes') }];
  rebindSource(f);
  f.pack.source_assets = [{ asset_id: 'A1', source_id: f.pack.sources[0].source_id, locator_id: f.pack.locators[0].locator_id,
    canonical_uri: 'https://assets.test/image.png', asset_digest: sourceByteDigest(f.acquisitions[0].input.assets[0].bytes), status: 'reviewed', classification: 'non_normative', review_basis: { reviewer: 'operator', method: 'inspection', evidence: 'decorative image' } }];
  assert.equal(compile(f).status, 'accepted');
  f.acquisitions[0].input.assets[0].bytes = new TextEncoder().encode('different bytes');
  const result = compile(f); assert.equal(result.status, 'rejected'); assert.equal(result.evidence, undefined);
});

test('T11 unavailable normative asset requests material, while a proven non-normative asset permits independent text facts', () => {
  const f = sourceBoundaryFixture(); const source = f.pack.sources[0];
  f.acquisitions[0].input.capture_bytes = new TextEncoder().encode(source.content + '\n\n![Decoration](https://assets.test/image.png)');
  f.acquisitions[0].input.assets = [{ retrieval_uri: 'https://assets.test/image.png', bytes: undefined }];
  rebindSource(f, []);
  const asset = { asset_id: 'A1', source_id: source.source_id, locator_id: f.pack.locators[0].locator_id,
    canonical_uri: 'https://assets.test/image.png', status: 'unavailable', classification: 'normative', review_basis: { reviewer: 'operator', method: 'inspection', evidence: 'resource unavailable' } };
  f.pack.source_assets = [asset];
  const context = { run_id: f.pack.run_instance_id, committed_revision: 0, checkpoint_bytes: new TextEncoder().encode('{}\n'), artifact_requests: [] };
  const result = compile(f, { artifact_context: context });
  assert.equal(result.status, 'need_artifact'); assert.equal(result.reason_code, 'SOURCE_ASSET_UNAVAILABLE'); assert.equal(result.evidence, undefined);
  asset.classification = 'non_normative'; asset.review_basis.evidence = 'verified decorative image';
  assert.equal(compile(f, { artifact_context: context }).status, 'need_artifact', 'Agent assertion alone is not a previously verified non-normative proof');
  const proof = { source_id: source.source_id, asset_id: asset.asset_id, canonical_uri: asset.canonical_uri,
    capture_digest: source.capture_digest, review_basis_digest: 'sha256:' + digest(asset.review_basis) };
  const independent = compile(f, { artifact_context: context, non_normative_asset_proofs: [proof] });
  assert.equal(independent.status, 'accepted'); assert.equal(independent.evidence.claimsById.get('claim_checkout').level, 'E3');
});

test('T11 source-bound acquisition markers remain unambiguous after ordinal 9 and cannot disclose signed inputs', () => {
  const f = sourceBoundaryFixture();
  f.acquisitions[0].input.capture_bytes = new TextEncoder().encode(Array.from({ length: 11 }, (_, index) => '[resource](https://unknown.test/' + index + '?signature=SECRET)').join('\n\n'));
  const result = compile(f, { artifact_context: { run_id: f.pack.run_instance_id, committed_revision: 0, checkpoint_bytes: new TextEncoder().encode('{}\n'), artifact_requests: [] } });
  assert.equal(result.status, 'need_artifact'); assert.equal(result.artifact_requests.length, 11);
  assert.equal(new Set(result.artifact_requests.map((/** @type {any} */ request) => request.artifact_request_id)).size, 11);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});

test('T11 explicit image references cannot disappear from the asset inventory through a non-normative unit review', () => {
  for (const markup of ['![Decoration](https://assets.test/image.png)', '<img alt="Decoration" src="https://assets.test/image.png">']) {
    const f = sourceBoundaryFixture(); f.acquisitions[0].input.capture_bytes = new TextEncoder().encode(f.pack.sources[0].content + '\n\n' + markup);
    rebindSource(f);
    const result = compile(f, { artifact_context: { run_id: f.pack.run_instance_id, committed_revision: 0, checkpoint_bytes: new TextEncoder().encode('{}\n'), artifact_requests: [] } });
    assert.equal(result.status, 'need_artifact', markup); assert.equal(result.reason_code, 'SOURCE_ASSET_UNAVAILABLE'); assert.equal(result.evidence, undefined);
  }
});

test('T11 reviewed normative asset cannot borrow an unrelated text locator as if its image Oracle was read', () => {
  const f = sourceBoundaryFixture(); f.acquisitions[0].input.capture_bytes = new TextEncoder().encode(f.pack.sources[0].content + '\n\n![Resource](https://assets.test/image.png)');
  f.acquisitions[0].input.assets = [{ retrieval_uri: 'https://assets.test/image.png', bytes: new TextEncoder().encode('image bytes') }];
  rebindSource(f);
  f.pack.source_assets = [{ asset_id: 'A1', source_id: f.pack.sources[0].source_id, locator_id: f.pack.locators[0].locator_id,
    canonical_uri: 'https://assets.test/image.png', asset_digest: sourceByteDigest(f.acquisitions[0].input.assets[0].bytes), status: 'reviewed', classification: 'normative', review_basis: { reviewer: 'operator', method: 'inspection', evidence: 'image contains business rule' } }];
  const result = compile(f); assert.equal(result.status, 'rejected'); assert.equal(result.evidence, undefined);
});

test('T11 material request set includes every unresolved source, not only the first source', () => {
  const f = sourceBoundaryFixture(); const second = structuredClone(f.pack.sources[0]); second.source_id = 'S2';
  second.semantic_projection.stable_source_id = 'S2'; second.semantic_projection.structure = compileCanonicalSourceStructure('S2', second.content); second.semantic_digest = 'sha256:' + digest(second.semantic_projection);
  f.pack.sources.push(second);
  f.acquisitions.push({ ...structuredClone(f.acquisitions[0]), source_id: 'S2', input: { ...f.acquisitions[0].input, stable_source_id: 'S2' } });
  for (const entry of f.acquisitions) entry.input.capture_bytes = new TextEncoder().encode('[resource](https://unknown.test/a?signature=SECRET)');
  const result = compile(f, { artifact_context: { run_id: f.pack.run_instance_id, committed_revision: 0, checkpoint_bytes: new TextEncoder().encode('{}\n'), artifact_requests: [] } });
  assert.equal(result.status, 'need_artifact'); assert.equal(result.artifact_requests.length, 2);
  assert.equal(new Set(result.artifact_requests.map((/** @type {any} */ request) => request.source_reference_digest)).size, 2);
});

test('T11 production composition rejects one same-rule conflict and selects only its explicitly superseding winner', () => {
  const f = sourceBoundaryFixture(); const second = sourceBoundaryFixture();
  const source = second.pack.sources[0]; source.source_id = 'S2';
  second.acquisitions[0].source_id = 'S2'; second.acquisitions[0].input.stable_source_id = 'S2';
  second.acquisitions[0].input.capture_bytes = new TextEncoder().encode('checkout rejected');
  rebindSource(second);
  const unit = source.semantic_projection.structure[0]; const loc = { ...second.pack.locators[0], locator_id: 'L2', source_id: 'S2', unit_id: unit.unit_id, section_id: unit.section_id,
    excerpt: unit.text, excerpt_digest: sourceByteDigest(new TextEncoder().encode(unit.text)), range: { start: 0, end: Array.from(unit.text).length } };
  f.pack.sources.push(source); f.acquisitions.push(second.acquisitions[0]); f.pack.locators.push(loc); f.pack.source_reviews.push(second.pack.source_reviews[0]);
  f.evidence.claims.push({ ...f.evidence.claims[0], claim_id: 'C2', value: 'checkout rejected', semantic_value: { state: 'rejected' }, source_id: 'S2', source_locator_ids: ['L2'] });
  const rule = f.pack.source_policy.rules[0]; rule.source_ids.push('S2'); rule.composition_mode = 'consensus';
  rule.rule_internal_conflict_review = [{ subject_key: canonicalSourceSubject(f.evidence.claims[0].subject_descriptor, f.subjects).subject_key, left_claim_id: 'C2', right_claim_id: 'claim_checkout', status: 'conflicted' }];
  const conflict = compile(f); assert.equal(conflict.status, 'rejected'); assert.equal(conflict.source_conflicts.length, 1); assert.equal(conflict.evidence, undefined);
  rule.composition_mode = 'priority_order'; rule.priority_order = [f.pack.sources[0].source_id, 'S2']; f.evidence.claims[1].superseded_by = 'claim_checkout'; rule.rule_internal_conflict_review[0].status = 'superseded';
  const accepted = compile(f); assert.equal(accepted.status, 'accepted'); assert.deepEqual([...accepted.evidence.claimsById.keys()], ['claim_checkout']);
  assert.equal(accepted.evidence.composition_audit[0].status, 'superseded'); assert.equal(f.evidence.claims.length, 2, 'authored history is not erased');
});

test('T11 production boundary rejects duplicate Claim and locator definitions before Map projection loses them', () => {
  for (const mutate of [
    (/** @type {any} */ f) => { f.evidence.claims.push(structuredClone(f.evidence.claims[0])); },
    (/** @type {any} */ f) => { f.pack.locators.push(structuredClone(f.pack.locators[0])); }
  ]) { const f = sourceBoundaryFixture(); mutate(f); assert.equal(compile(f).status, 'rejected'); }
});

test('T11 raw signed URLs cannot be smuggled back into accepted Source metadata or Claim values', () => {
  for (const mutate of [
    (/** @type {any} */ f) => { f.pack.sources[0].title = 'https://unknown.test/a?signature=SECRET'; },
    (/** @type {any} */ f) => { f.evidence.claims[0].semantic_value.uri = 'https://unknown.test/a?token=SECRET'; },
    (/** @type {any} */ f) => { f.evidence.claims[0].semantic_value['https://unknown.test/a?sig=SECRET'] = true; },
    (/** @type {any} */ f) => { f.providers = createSourceProviderRegistry([{ provider: 'cooper', kind: 'cooper', version: '1', hosts: ['cooper.test'], query_order: 'sensitive' }]); f.evidence.claims[0].value = 'https://cooper.test/a?X-Amz-Credential=SECRET'; }
  ]) { const f = sourceBoundaryFixture(); mutate(f); const result = compile(f); assert.equal(result.status, 'rejected'); assert.ok(!JSON.stringify(result).includes('SECRET')); }
});

test('T11 source producer supplies compiler-owned canonical fields before the Adapter authors locators or evidence', () => {
  assert.equal(typeof api.compileAuditedSource, 'function');
  const f = sourceBoundaryFixture(); const expected = f.pack.sources[0];
  const metadata = { source_id: expected.source_id, kind: expected.kind, version: expected.version, status: expected.status, authority: expected.authority, domain: expected.domain };
  const result = api.compileAuditedSource(metadata, f.acquisitions[0], { provider_registry: f.providers, expiry_registry: f.expiry });
  assert.equal(result.status, 'canonical'); assert.equal(result.source.semantic_digest, expected.semantic_digest);
  assert.deepEqual(result.source.semantic_projection, expected.semantic_projection);
  assert.ok(!JSON.stringify(result).includes('capture_bytes'));
  assert.equal(api.compileAuditedSource({ ...metadata, injected_digest: 'fake' }, f.acquisitions[0], { provider_registry: f.providers, expiry_registry: f.expiry }).status, 'rejected');
});

test('T11 source compiler rejects stale Evidence revisions', () => {
  const stale = sourceBoundaryFixture(); stale.evidence.source_revision += 1;
  assert.equal(compile(stale).status, 'rejected');
});

test('T11 source compiler rejects material events belonging to another run before fetching', () => {
  const { f, context, bytes, bindings } = artifactFixture(); let reads = 0;
  f.pack.run_instance_id = 'RUN-99999999-9999-4999-8999-999999999999';
  const result = compile(f, { artifact_context: context, artifact_bindings: bindings, read_artifact_bytes: () => { reads += 1; return bytes; } });
  assert.equal(result.status, 'rejected'); assert.equal(reads, 0);
});

test('T11 material request locators use retained canonical units, excluding only an authorized machine expiry unit', () => {
  const prefix = '<span data-cooper-expiry="v1">临时链接将在 '; const suffix = ' 小时后过期</span>';
  /** @param {string} leading @param {boolean} [trusted] */
  function request(leading, trusted = true) {
    const f = sourceBoundaryFixture();
    f.providers = createSourceProviderRegistry([{ provider: 'cooper', kind: 'cooper', version: '1', hosts: ['cooper.test'], query_order: 'sensitive' }]);
    f.expiry = createExpiryMatcherRegistry([{ provider: 'cooper', provider_contract_version: '1', matcher_version: 'expiry-v1', prefix, suffix }]);
    f.acquisitions[0].acquisition = trusted ? { provider: 'cooper', provider_contract_version: '1' } : {};
    f.acquisitions[0].input.capture_bytes = new TextEncoder().encode(leading + '[contract](https://unknown.test/contract?signature=SECRET)');
    const result = compile(f, { artifact_context: { run_id: f.pack.run_instance_id, committed_revision: 0, checkpoint_bytes: new TextEncoder().encode('{}\n'), artifact_requests: [] } });
    assert.equal(result.status, 'need_artifact'); return result.artifact_requests[0];
  }
  const plain = request(''); const banner = prefix + '3' + suffix + '\n\n';
  assert.equal(request(banner).source_reference_digest, plain.source_reference_digest);
  assert.notEqual(request(banner, false).source_reference_digest, plain.source_reference_digest);
});
