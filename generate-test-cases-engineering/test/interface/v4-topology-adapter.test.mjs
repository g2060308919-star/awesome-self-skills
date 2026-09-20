import assert from 'node:assert/strict';
import test from 'node:test';
import * as entry from '../../src/entry.mjs';
import { sourceBoundaryFixture } from '../helpers/v4-source-boundary.mjs';
import { deriveV4PreCaseSystemContext } from '../../src/v4-system-context.mjs';
import { compileScopeManifestV4 } from '../../src/scope-manifest-v4.mjs';
import { bendReviewJourneyFixture } from '../fixtures/v4/bend-review-platform/journey-fixture.mjs';
import { digest } from '../../src/canonical.mjs';
import { compileCanonicalSourceStructure } from '../../src/source-locators-v4.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';

const api = /** @type {any} */ (entry);
function fixture() {
  const { pack, evidence } = sourceBoundaryFixture();
  return { pack, claims: evidence.claims, evidence, review: {
    discovery_digest: evidence.topology_discovery.discovery_digest,
    primary_surface: evidence.scope_manifest.primary_surface,
    topology_review: structuredClone(evidence.topology_review),
    topology_dispositions: structuredClone(evidence.topology_dispositions)
  } };
}

test('public topology helpers produce the existing four evidence fields without mutating inputs', () => {
  assert.equal(typeof api.discoverV4Topology, 'function');
  assert.equal(typeof api.constructV4TopologyEvidence, 'function');
  const f = fixture(); const before = structuredClone(f);
  const discovery = api.discoverV4Topology(f.pack, f.claims);
  assert.deepEqual(discovery, f.evidence.topology_discovery);
  const result = api.constructV4TopologyEvidence(f.pack, f.claims, f.review);
  assert.deepEqual(Object.keys(result).sort(), [
    'scope_manifest', 'topology_discovery', 'topology_dispositions', 'topology_review'
  ]);
  for (const key of Object.keys(result)) assert.deepEqual(result[key], f.evidence[key]);
  const verified = compileScopeManifestV4(f.review,
    deriveV4PreCaseSystemContext(f.pack, { ...f.evidence, ...result }).topology);
  assert.deepEqual(verified.diagnostics, []);
  assert.deepEqual(verified.scope_manifest, result.scope_manifest);
  result.topology_review.reviewed_block_ids.length = 0;
  assert.deepEqual(f, before);
});

test('missing or partial topology review is rejected instead of being auto-completed', () => {
  for (const mode of ['missing', 'partial', 'duplicate']) {
    const f = fixture();
    if (mode === 'missing') delete f.review.topology_review;
    else if (mode === 'partial') f.review.topology_review.reviewed_block_ids = [];
    else f.review.topology_review.reviewed_block_ids.push(f.review.topology_review.reviewed_block_ids[0]);
    assert.throws(() => api.constructV4TopologyEvidence(f.pack, f.claims, f.review), /TOPOLOGY_.*(?:INVALID|INCOMPLETE)/u);
  }
});

test('stale discovery, unknown or duplicate candidates, and omitted dispositions fail closed', () => {
  for (const mode of ['stale', 'unknown', 'duplicate', 'omitted', 'forged_manifest']) {
    const f = fixture();
    if (mode === 'stale') f.review.discovery_digest = `sha256:${'0'.repeat(64)}`;
    if (mode === 'unknown') f.review.topology_dispositions[0].candidate_id = `TC-${'0'.repeat(64)}`;
    if (mode === 'duplicate') f.review.topology_dispositions.push(f.review.topology_dispositions[0]);
    if (mode === 'omitted') f.review.topology_dispositions.pop();
    if (mode === 'forged_manifest') /** @type {any} */ (f.review).scope_manifest = f.evidence.scope_manifest;
    assert.throws(() => api.constructV4TopologyEvidence(f.pack, f.claims, f.review), /TOPOLOGY_/u);
  }
});

test('disposition cannot create its own missing Claim authorization or upgrade its role', () => {
  for (const mode of ['missing', 'role', 'module']) {
    const f = fixture();
    if (mode === 'missing') delete f.claims[0].semantic_value.topology_authorization;
    if (mode === 'role') f.review.topology_dispositions[0].role = 'external';
    if (mode === 'module') {
      f.review.topology_dispositions[0].module_ref = 'unrelated';
      f.review.primary_surface = 'unrelated';
    }
    assert.throws(() => api.constructV4TopologyEvidence(f.pack, f.claims, f.review), /TOPOLOGY_/u);
  }
});

test('authorization has a closed source-bound shape and cannot supply compiler identities', () => {
  for (const mode of ['unknown', 'id', 'locator', 'role', 'execution', 'duplicate_claim']) {
    const f = fixture(); const auth = f.claims[0].semantic_value.topology_authorization;
    if (mode === 'unknown') auth.extra = true;
    if (mode === 'id') auth.candidates[0].candidate_id = 'forged';
    if (mode === 'locator') auth.candidates[0].locator_ids = ['missing'];
    if (mode === 'role') auth.candidates[0].role = 'invalid';
    if (mode === 'execution') f.claims[0].domain = 'execution_binding';
    if (mode === 'duplicate_claim') f.claims.push(structuredClone(f.claims[0]));
    assert.throws(() => api.discoverV4Topology(f.pack, f.claims), /TOPOLOGY_/u);
  }
});

test('pure discovery does not require authorization but closure still does', () => {
  const f = fixture(); delete f.claims[0].semantic_value.topology_authorization;
  assert.deepEqual(api.discoverV4Topology(f.pack, f.claims), f.evidence.topology_discovery);
});

test('source review and locator binding errors cannot be hidden by topology construction', () => {
  for (const mode of ['review', 'locator', 'version', 'accessor']) {
    const f = fixture();
    if (mode === 'review') f.pack.source_reviews[0].units = [];
    if (mode === 'locator') f.pack.locators[0].excerpt = 'invented';
    if (mode === 'version') f.pack.schema_version = '3.0.0';
    if (mode === 'accessor') Object.defineProperty(f.pack, 'evil', { enumerable: true, get() { throw new Error('getter invoked'); } });
    assert.throws(() => api.discoverV4Topology(f.pack, f.claims), /TOPOLOGY_/u);
  }
});

test('supported V4 source snapshots retain the same topology contract', () => {
  for (const version of ['4.0.0', '4.2.0', '4.3.0']) {
    const f = fixture(); f.pack.schema_version = version;
    const result = api.constructV4TopologyEvidence(f.pack, f.claims, f.review);
    assert.deepEqual(result.scope_manifest, f.evidence.scope_manifest);
  }
});

test('semantic source hints add candidates without requiring Agent-authored IDs', () => {
  const f = fixture(); const auth = f.claims[0].semantic_value.topology_authorization;
  auth.candidates.push({
    kind: 'module_mention', label: '订单', locator_ids: f.claims[0].source_locator_ids,
    disposition: 'module', module_ref: 'checkout', role: 'primary'
  });
  const discovery = api.discoverV4Topology(f.pack, f.claims);
  const added = discovery.topology_candidates.find((/** @type {any} */ c) => c.label === '订单');
  assert.ok(added); assert.match(added.candidate_id, /^TC-[0-9a-f]{64}$/u);
  assert.throws(() => api.constructV4TopologyEvidence(f.pack, f.claims, f.review), /TOPOLOGY_DISCOVERY_DIGEST_MISMATCH/u);
  f.review.discovery_digest = discovery.discovery_digest;
  f.review.topology_dispositions.push({ candidate_id: added.candidate_id, disposition: 'module',
    module_ref: 'checkout', role: 'primary', review_basis_claim_ids: [f.claims[0].claim_id] });
  const result = api.constructV4TopologyEvidence(f.pack, f.claims, f.review);
  assert.equal(result.scope_manifest.modules.length, 1, 'aliases do not create extra modules');
  auth.candidates.reverse();
  assert.deepEqual(api.discoverV4Topology(f.pack, f.claims), discovery);
});

test('multi-module PRD fixture rejects an omitted source-text review witness', async () => {
  const f = await bendReviewJourneyFixture('RUN-00000000-0000-4000-8000-000000000001');
  const pack = f.artifacts.source_pack; const evidence = f.artifacts.evidence_claims;
  const discovery = api.discoverV4Topology(pack, evidence.claims);
  const review = { discovery_digest: discovery.discovery_digest, primary_surface: evidence.scope_manifest.primary_surface,
    topology_review: evidence.topology_review, topology_dispositions: evidence.topology_dispositions };
  assert.deepEqual(api.constructV4TopologyEvidence(pack, evidence.claims, review).scope_manifest, evidence.scope_manifest);
  assert.ok(review.topology_review.reviewed_block_ids.length > 0);
  const partial = structuredClone(review); partial.topology_review.reviewed_block_ids.pop();
  assert.throws(() => api.constructV4TopologyEvidence(pack, evidence.claims, partial), /TOPOLOGY_STRUCTURE_REVIEW_INCOMPLETE/u);
});

// Synthetic structural fixture only; this is not semantic quality evidence or
// a claim that an Agent has inspected an actual PRD image.
test('table and image inventories survive the public boundary and cannot be auto-reviewed', () => {
  const f = fixture(); const source = f.pack.sources[0];
  const projection = source.semantic_projection;
  projection.content += '\n\n| 订单 |\n| --- |\n| 已接受 |';
  projection.structure = compileCanonicalSourceStructure(source.source_id, projection.content);
  const asset = { canonical_uri: 'provided:diagram', asset_digest: `sha256:${digest('synthetic image')}` };
  projection.assets.push(asset);
  projection.structure.push({ type: 'image_region', unit_id: 'image-1', text: '订单',
    asset_digest: asset.asset_digest, page_id: 'p1', image_id: 'i1', rect: { x: 0, y: 0, width: 1, height: 1 } });
  source.content = projection.content;
  source.semantic_digest = `sha256:${digest(projection)}`;
  const textDigest = (/** @type {string} */ value) => sourceByteDigest(new TextEncoder().encode(value));
  source.content_digest = textDigest(source.content).slice(7);
  f.pack.locators = projection.structure.map((/** @type {any} */ unit, /** @type {number} */ index) => ({
    locator_id: `LOC-mixed-${index}`, source_id: source.source_id, semantic_digest: source.semantic_digest,
    unit_id: unit.unit_id, excerpt: unit.text, excerpt_digest: textDigest(unit.text), domain: 'business', field_path: '/state',
    ...(unit.type === 'table_cell' ? { type: 'table_cell', table_id: unit.table_id, row: unit.row, column: unit.column }
      : unit.type === 'image_region' ? { type: 'image_region', asset_digest: unit.asset_digest, page_id: unit.page_id, image_id: unit.image_id, rect: unit.rect }
      : { type: 'text_block_range', section_id: unit.section_id, range: { start: 0, end: Array.from(unit.text).length } })
  }));
  f.pack.source_reviews = [{ source_id: source.source_id, semantic_digest: source.semantic_digest,
    units: projection.structure.map((/** @type {any} */ unit) => ({ unit_id: unit.unit_id, content_digest: textDigest(unit.text), classification: 'normative' })) }];
  f.claims[0].source_locator_ids = f.pack.locators.map((/** @type {any} */ l) => l.locator_id);
  f.claims[0].locator_roles = f.claims[0].source_locator_ids.map((/** @type {string} */ id) => ({ locator_id: id, role: 'test-fixture' }));
  f.claims[0].document_level_claim = false;
  delete f.claims[0].semantic_value.topology_authorization;
  const discovery = api.discoverV4Topology(f.pack, f.claims);
  assert.equal(discovery.scanned_units.reviewed_table_ids.length, 1);
  assert.deepEqual(discovery.scanned_units.reviewed_asset_digests, [asset.asset_digest]);
  const review = { ...f.review, discovery_digest: discovery.discovery_digest,
    topology_review: { ...discovery.scanned_units, unresolved_candidate_ids: discovery.topology_candidates.map((/** @type {any} */ c) => c.candidate_id) },
    topology_dispositions: [] };
  for (const key of ['reviewed_table_ids', 'reviewed_asset_digests']) {
    const partial = structuredClone(review); partial.topology_review[key] = [];
    assert.throws(() => api.constructV4TopologyEvidence(f.pack, f.claims, partial), /TOPOLOGY_STRUCTURE_REVIEW_INCOMPLETE/u);
  }
});

test('boundary direction and not-relevant evidence survive construction; forged scope Decisions do not', () => {
  const f = fixture(); const auth = f.claims[0].semantic_value.topology_authorization;
  const fromLabel = auth.candidates[0].label;
  auth.candidates.push(
    { kind: 'module_mention', label: '仓库', locator_ids: f.claims[0].source_locator_ids, disposition: 'module', module_ref: 'warehouse', role: 'downstream' },
    { kind: 'boundary_signal', label: `${fromLabel} → 仓库`, locator_ids: f.claims[0].source_locator_ids,
      disposition: 'boundary', from_module_ref: 'checkout', to_module_ref: 'warehouse', channel: 'event', acceptance_scope: 'contract_only' },
    { kind: 'module_mention', label: '背景', locator_ids: f.claims[0].source_locator_ids, disposition: 'not_relevant' }
  );
  const discovery = api.discoverV4Topology(f.pack, f.claims);
  f.review.discovery_digest = discovery.discovery_digest;
  for (const item of discovery.topology_candidates) {
    if (f.review.topology_dispositions.some((/** @type {any} */ d) => d.candidate_id === item.candidate_id)) continue;
    const declaration = auth.candidates.find((/** @type {any} */ d) => d.label === item.label);
    const { kind: _kind, label: _label, locator_ids: _locators, ...disposition } = declaration;
    f.review.topology_dispositions.push({ ...disposition, candidate_id: item.candidate_id,
      ...(disposition.disposition === 'not_relevant' ? { reason: 'synthetic exclusion test', review_basis: { kind: 'claim', claim_ids: [f.claims[0].claim_id] } }
        : { review_basis_claim_ids: [f.claims[0].claim_id] }) });
  }
  const result = api.constructV4TopologyEvidence(f.pack, f.claims, f.review);
  assert.deepEqual(result.scope_manifest.boundaries.map((/** @type {any} */ b) => [b.from, b.to]), [['checkout', 'warehouse']]);
  const omitted = f.review.topology_dispositions.find((/** @type {any} */ d) => d.disposition === 'not_relevant');
  omitted.review_basis = { kind: 'decision', decision_ids: ['invented'] };
  assert.throws(() => api.constructV4TopologyEvidence(f.pack, f.claims, f.review), /TOPOLOGY_NOT_RELEVANT_BASIS_INVALID/u);
});
