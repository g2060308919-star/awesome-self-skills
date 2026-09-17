import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createV4RunDirectory } from '../../src/run-bootstrap-v4.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import runInstanceSchema from '../../skill/generate-test-cases/scripts/schemas/run-instance.schema.json' with { type: 'json' };

test('new run bootstrap persists the 4.3.0/0.8.0 identity', async () => {
  const catalog = await mkdtemp(path.join(os.tmpdir(), 'v43-bootstrap-'));
  try {
    const created = await createV4RunDirectory(catalog, 'case_document');
    const stored = JSON.parse(await readFile(path.join(created.run_directory, 'run-instance.json'), 'utf8'));
    assert.equal(stored.schema_version, '4.3.0');
    assert.equal(stored.compiler_version, '0.8.0');
    assert.deepEqual(validateAgainstSchema(stored, runInstanceSchema), []);
  } finally {
    await rm(catalog, { recursive: true, force: true });
  }
});

test('run-instance schema accepts every exact contract and rejects mixed pairs', () => {
  const base = {
    run_id: 'RUN-00000000-0000-4000-8000-000000000001',
    delivery_intent: 'case_document',
    created_at: '2026-09-17T00:00:00.000Z',
    lineage: null
  };
  for (const [schema_version, compiler_version] of [
    ['4.0.0', '0.5.0'], ['4.2.0', '0.7.0'], ['4.3.0', '0.8.0']
  ]) {
    assert.deepEqual(validateAgainstSchema({ ...base, schema_version, compiler_version }, runInstanceSchema), []);
  }
  assert.notDeepEqual(
    validateAgainstSchema({ ...base, schema_version: '4.3.0', compiler_version: '0.7.0' }, runInstanceSchema),
    []
  );
});
