import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import catalogSchema from '../../skill/generate-test-cases/scripts/schemas/run-catalog.schema.json' with { type: 'json' };

test('generality P20/P21/P23: the Adapter loads durable run management and chooses document-only delivery by default', async () => {
  const skill = await readFile(new URL('../../skill/generate-test-cases/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /Read `references\/run-management\.md` before/);
  assert.match(skill, /case_document/);
  assert.match(skill, /run-catalog\.json/);
  assert.match(skill, /artifact_repairs/);
  assert.match(skill, /output_language/);
});

test('generality P20: the private run catalog is closed metadata, not a fifth semantic stage', () => {
  const catalog = { catalog_version: 1, active_run_directory: null, runs: [], events: [] };
  assert.deepEqual(validateAgainstSchema(catalog, catalogSchema), []);
  assert.notDeepEqual(validateAgainstSchema({ ...catalog, fact_routes: [] }, catalogSchema), []);
});

test('T12 run catalog can record terminal cancellation without inventing a delivery', () => {
  const catalog = {
    catalog_version: 1, active_run_directory: null,
    runs: [{
      run_instance_id: 'RUN-cancelled', run_directory: '/tmp/RUN-cancelled',
      source_content_digest: 'a'.repeat(64), scope: 'case_document', status: 'cancelled',
      last_reply_kind: 'cancelled', error_codes: [], supersedes: null, superseded_by: null
    }],
    events: [{
      sequence: 1, run_instance_id: 'RUN-cancelled', status: 'cancelled', reason: 'USER_CANCELLED'
    }]
  };
  assert.deepEqual(validateAgainstSchema(catalog, catalogSchema), []);
});
