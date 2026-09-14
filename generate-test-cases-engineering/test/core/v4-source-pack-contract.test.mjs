import assert from 'node:assert/strict';
import test from 'node:test';
import schema from '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import evidence from '../../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import { provideArtifactEventSchema } from '../../src/source-events.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { buildJourney } from '../helpers/run-journey.mjs';
import { sourceBoundaryFixture } from '../helpers/v4-source-boundary.mjs';

test('T11 Source Pack v4 has a canonical source/review/locator/composition discriminator while v3 stays valid', () => {
  assert.deepEqual(validateAgainstSchema(buildJourney('all-e3').source_pack, schema), []);
  const { pack } = sourceBoundaryFixture();
  assert.deepEqual(validateAgainstSchema(pack, schema), []);
  const legacy = buildJourney('all-e3').source_pack; legacy.schema_version = '4.0.0'; legacy.delivery_intent = 'case_document'; legacy.artifact_events = [];
  assert.ok(validateAgainstSchema(legacy, schema).length);
  pack.schema_version = '3.0.0'; assert.ok(validateAgainstSchema(pack, schema).length);
});

test('T11 Source Pack shares exact source and artifact-event definitions, not approximate contracts', () => {
  for (const [name, definition] of Object.entries(evidence.$defs)) if (name.startsWith('v4Source')) assert.deepEqual(/** @type {any} */ (schema.$defs)[name], definition, name);
  for (const [name, definition] of Object.entries(provideArtifactEventSchema.$defs)) assert.deepEqual(/** @type {any} */ (schema.$defs)[name], definition, name);
});

test('T11 canonical Source Pack rejects missing audit, widened unit reviews and open composition/event shapes', () => {
  for (const mutate of [
    (/** @type {any} */ pack) => { delete pack.sources[0].capture_audit; },
    (/** @type {any} */ pack) => { pack.sources[0].capture_audit.extra = true; },
    (/** @type {any} */ pack) => { pack.source_reviews[0].spans = []; },
    (/** @type {any} */ pack) => { pack.source_policy.rules[0].composition_mode = 'arbitrary_merge'; },
    (/** @type {any} */ pack) => { pack.source_policy.rules[0].rule_internal_conflict_review = null; },
    (/** @type {any} */ pack) => { pack.artifact_events = [{ event_type: 'provide_artifact', input: { kind: 'raw_url', value: 'https://example.test' } }]; },
    (/** @type {any} */ pack) => { pack.sources[0].retrieval_uri = 'https://example.test'; }
  ]) { const { pack } = sourceBoundaryFixture(); mutate(pack); assert.ok(validateAgainstSchema(pack, schema).length); }
});
