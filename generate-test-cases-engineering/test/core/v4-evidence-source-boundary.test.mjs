import assert from 'node:assert/strict';
import test from 'node:test';
import * as evidence from '../../src/evidence.mjs';
import { buildJourney } from '../helpers/run-journey.mjs';
import { digest } from '../../src/canonical.mjs';
import { sourceByteDigest } from '../../src/source-canonicalization.mjs';
import { compileCanonicalSourceStructure } from '../../src/source-locators-v4.mjs';
import { canonicalSourceSubject, createSourceSubjectRegistry } from '../../src/source-subjects-v4.mjs';
import { sourceBoundaryFixture } from '../helpers/v4-source-boundary.mjs';

/** @param {string} value */
const textDigest = value => sourceByteDigest(new TextEncoder().encode(value));
function registry() { return createSourceSubjectRegistry({ scope_refs: ['checkout'], module_ids: ['checkout'], entity_types: ['order'] }); }
function fixture() {
  const r = buildJourney('all-e3'); const pack = r.source_pack; const claims = r.evidence_claims;
  pack.schema_version = claims.schema_version = '4.0.0'; claims.semantic_gaps = [];
  const scopeEnvelope = sourceBoundaryFixture().evidence;
  for (const field of [
    'fact_ledger', 'topology_discovery', 'topology_review', 'topology_dispositions',
    'scope_manifest', 'interaction_review', 'acceptance_role_assignments'
  ]) claims[field] = structuredClone(scopeEnvelope[field]);
  claims.semantic_gaps = [];
  const source = pack.sources[0]; const claim = claims.claims[0];
  source.content = claim.value; source.content_digest = textDigest(source.content).slice(7); source.domain = 'business';
  source.semantic_projection = { stable_source_id: source.source_id, source_type: 'prd', content: source.content,
    structure: compileCanonicalSourceStructure(source.source_id, source.content), assets: [] };
  source.semantic_digest = 'sha256:' + digest(source.semantic_projection);
  const unit = source.semantic_projection.structure[0];
  pack.locators = [{ locator_id: claim.source_locator_ids[0], source_id: source.source_id, semantic_digest: source.semantic_digest,
    type: 'text_block_range', unit_id: unit.unit_id, section_id: unit.section_id, range: { start: 0, end: Array.from(unit.text).length },
    excerpt: unit.text, excerpt_digest: textDigest(unit.text), domain: 'business', field_path: '/state' }];
  pack.source_reviews = [{ source_id: source.source_id, semantic_digest: source.semantic_digest,
    units: [{ unit_id: unit.unit_id, content_digest: textDigest(unit.text), classification: 'normative' }] }];
  Object.assign(claim, { domain: 'business', field_path: '/state', document_level_claim: true, locator_roles: [],
    subject_descriptor: { scope_ref: 'checkout', module_id: 'checkout', entity_type: 'order', entity_key: 'order', field_path: '/state', condition: {} },
    semantic_value: { state: 'accepted' } });
  return { pack, claims };
}
/** @param {any} f */
function validate(f) {
  const fn = /** @type {any} */ (evidence).validateV4EvidenceSourceBoundary;
  assert.equal(typeof fn, 'function', 'v4 source boundary must be implemented');
  return fn(f.pack, f.claims, registry());
}

test('T11 v4 evidence boundary accepts exact normative evidence without changing its E3 level', () => {
  const f = fixture(); const result = validate(f);
  assert.deepEqual(result.diagnostics, []);
  const accepted = result.claimsById.get('claim_checkout');
  assert.equal(accepted.level, 'E3');
  assert.equal(accepted.subject_key, canonicalSourceSubject(f.claims.claims[0].subject_descriptor, registry()).subject_key);
  assert.equal(f.claims.claims[0].subject_key, undefined);
});

test('T11 v4 boundary rejects forged excerpts, borrowed domains/paths, missing review and non-normative Oracle evidence', () => {
  for (const mutate of [
    (/** @type {any} */ f) => { f.pack.locators[0].excerpt = 'forged'; },
    (/** @type {any} */ f) => { f.claims.claims[0].domain = 'execution_binding'; },
    (/** @type {any} */ f) => { f.claims.claims[0].field_path = '/unrelated'; },
    (/** @type {any} */ f) => { f.pack.source_reviews = []; },
    (/** @type {any} */ f) => { f.pack.source_reviews[0].units[0].classification = 'non_normative'; }
  ]) { const f = fixture(); mutate(f); const result = validate(f); assert.ok(result.diagnostics.length > 0); assert.equal(result.claimsById.size, 0); }
});

test('v4 Fact references are validated against accepted Claims and their canonical module/path subjects', () => {
  for (const mutate of [
    (/** @type {any} */ f) => { f.claims.fact_ledger[0].claim_ids = ['CLM-missing']; },
    (/** @type {any} */ f) => { f.claims.fact_ledger[0].module_refs = ['foreign-module']; },
    (/** @type {any} */ f) => { f.claims.fact_ledger[0].field_path = '/foreign/path'; }
  ]) {
    const f = fixture(); mutate(f);
    const result = validate(f);
    assert.ok(result.diagnostics.length > 0);
    assert.equal(result.claimsById.size, 0);
  }
});

test('T11 v4 evidence boundary rejects same-rule semantic conflict despite identical descriptive value text', () => {
  const f = fixture(); const source = structuredClone(f.pack.sources[0]); source.source_id = 'source_other';
  source.semantic_projection.stable_source_id = source.source_id;
  source.semantic_projection.structure = compileCanonicalSourceStructure(source.source_id, source.content);
  source.semantic_digest = 'sha256:' + digest(source.semantic_projection);
  f.pack.sources.push(source);
  const unit = source.semantic_projection.structure[0];
  f.pack.locators.push({ ...f.pack.locators[0], locator_id: 'L2', source_id: source.source_id, semantic_digest: source.semantic_digest, unit_id: unit.unit_id, section_id: unit.section_id });
  f.pack.source_reviews.push({ source_id: source.source_id, semantic_digest: source.semantic_digest, units: [{ unit_id: unit.unit_id, content_digest: textDigest(unit.text), classification: 'normative' }] });
  f.claims.claims.push({ ...f.claims.claims[0], claim_id: 'C2', source_id: source.source_id, source_locator_ids: ['L2'], semantic_value: { state: 'opposite' } });
  const rule = f.pack.source_policy.rules[0]; rule.source_ids.push(source.source_id); rule.composition_mode = 'consensus';
  const ids = ['C2', 'claim_checkout'].sort();
  rule.rule_internal_conflict_review = [{ subject_key: canonicalSourceSubject(f.claims.claims[0].subject_descriptor, registry()).subject_key, left_claim_id: ids[0], right_claim_id: ids[1], status: 'conflicted' }];
  const result = validate(f);
  assert.equal(result.source_conflicts.length, 1);
  assert.equal(result.claimsById.size, 0);
});

test('T11 a normative unit cannot silently disappear merely because another unit has a valid Claim', () => {
  const f = fixture(); const source = f.pack.sources[0];
  source.content += '\n\nMust not be silently lost.';
  source.content_digest = textDigest(source.content).slice(7);
  source.semantic_projection.content = source.content;
  source.semantic_projection.structure = compileCanonicalSourceStructure(source.source_id, source.content);
  source.semantic_digest = 'sha256:' + digest(source.semantic_projection);
  f.pack.locators[0].semantic_digest = source.semantic_digest;
  f.claims.claims[0].document_level_claim = false;
  f.pack.source_reviews[0] = { source_id: source.source_id, semantic_digest: source.semantic_digest,
    units: source.semantic_projection.structure.map((/** @type {any} */ unit) => ({ unit_id: unit.unit_id, content_digest: textDigest(unit.text), classification: 'normative' })) };
  const result = validate(f);
  assert.ok(result.diagnostics.some((/** @type {any} */ item) => item.code === 'SOURCE_UNIT_UNCLAIMED'));
  assert.equal(result.claimsById.size, 0);
});
