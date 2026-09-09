import assert from 'node:assert/strict';
import test from 'node:test';
import schema from '../../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { buildJourney } from '../helpers/run-journey.mjs';
import { sourceBoundaryFixture } from '../helpers/v4-source-boundary.mjs';

function v4() {
  return sourceBoundaryFixture().evidence;
}

test('T11 evidence Schema preserves the strict v3 branch and accepts typed closed v4 source metadata', () => {
  assert.deepEqual(validateAgainstSchema(buildJourney('all-e3').evidence_claims, schema), []);
  const current = v4(); assert.deepEqual(validateAgainstSchema(current, schema), []);
  const legacy = buildJourney('all-e3').evidence_claims; legacy.claims[0].domain = 'business';
  assert.notDeepEqual(validateAgainstSchema(legacy, schema), []);
});

test('T11 v4 normative claim requires semantic subject/value and rejects compiler-owned subject keys', () => {
  for (const field of ['domain', 'field_path', 'document_level_claim', 'subject_descriptor', 'semantic_value']) {
    const current = v4(); delete current.claims[0][field];
    assert.notDeepEqual(validateAgainstSchema(current, schema), [], field);
  }
  for (const mutate of [
    (/** @type {any} */ c) => { c.subject_key = 'sha256:' + '0'.repeat(64); },
    (/** @type {any} */ c) => { c.subject_descriptor.extra = true; },
    (/** @type {any} */ c) => { c.locator_roles = [{ locator_id: 'L1', role: 'condition', extra: true }]; },
    (/** @type {any} */ c) => { c.domain = 'unregistered-domain'; }
  ]) { const current = v4(); mutate(current.claims[0]); assert.notDeepEqual(validateAgainstSchema(current, schema), []); }
});

test('T11 reusable source locator and unit-review definitions are closed', () => {
  const defs = /** @type {any} */ (schema).$defs;
  assert.ok(defs?.v4SourceLocator);
  assert.ok(defs?.v4SourceReview);
  const item = { source_id: 'S1', semantic_digest: 'sha256:' + '1'.repeat(64), units: [{ unit_id: 'U1', classification: 'normative', content_digest: 'sha256:' + '2'.repeat(64) }] };
  assert.deepEqual(validateAgainstSchema(item, { $ref: '#/$defs/v4SourceReview', $defs: defs }), []);
  assert.notDeepEqual(validateAgainstSchema({ ...item, spans: [] }, { $ref: '#/$defs/v4SourceReview', $defs: defs }), []);
});
