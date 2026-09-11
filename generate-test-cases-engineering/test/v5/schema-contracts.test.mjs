import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { V5_POLICY_FILE_MAP, generateV5Contracts } from '../../src/v5/registry-generator.mjs';

const policyDirectory = new URL('../../skill/generate-test-cases/scripts/policies/', import.meta.url);
const schemaDirectory = new URL('../../skill/generate-test-cases/scripts/schemas/', import.meta.url);

test('every v5 policy has a closed schema and rejects top-level extras', async () => {
  const contracts = generateV5Contracts();
  for (const [contractKey, fileBase] of Object.entries(V5_POLICY_FILE_MAP)) {
    const policy = JSON.parse(await readFile(new URL(`${fileBase}.json`, policyDirectory), 'utf8'));
    const schema = JSON.parse(await readFile(new URL(`${fileBase}.schema.json`, schemaDirectory), 'utf8'));
    assert.deepEqual(policy, contracts[contractKey]);
    assert.deepEqual(validateAgainstSchema(policy, schema), []);
    assert.ok(validateAgainstSchema({ ...policy, injected: true }, schema)
      .some((issue) => issue.code === 'ADDITIONAL_PROPERTY'));
    assert.equal(schema.additionalProperties, false);
  }
});

test('v5 policy and schema filenames are a one-to-one closed set', async () => {
  const expectedPolicyFiles = Object.values(V5_POLICY_FILE_MAP).map((base) => `${base}.json`).sort();
  const expectedSchemaFiles = Object.values(V5_POLICY_FILE_MAP).map((base) => `${base}.schema.json`).sort();
  const actualPolicyFiles = (await readdir(policyDirectory)).filter((/** @type {string} */ file) => file.startsWith('v5-')).sort();
  const actualSchemaFiles = (await readdir(schemaDirectory)).filter((/** @type {string} */ file) => file.startsWith('v5-')).sort();
  assert.deepEqual(actualPolicyFiles, expectedPolicyFiles);
  assert.deepEqual(actualSchemaFiles, expectedSchemaFiles);
});
