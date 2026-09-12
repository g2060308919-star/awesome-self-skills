import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import {
  V5_INTERFACE_SCHEMA_FILE_MAP,
  generateV5InterfaceSchemas,
  validateV5ReplySchemaRegistryAlignment
} from '../../src/v5/interface-schemas.mjs';
import { V5_POLICY_FILE_MAP, generateV5Contracts } from '../../src/v5/registry-generator.mjs';

const policyDirectory = new URL('../../skill/generate-test-cases/scripts/policies/', import.meta.url);
const schemaDirectory = new URL('../../skill/generate-test-cases/scripts/schemas/', import.meta.url);

function assertDeeplyClosedSchema(schema, pointer = '') {
  if (!schema || typeof schema !== 'object') return;
  if (Array.isArray(schema)) {
    schema.forEach((child, index) => assertDeeplyClosedSchema(child, `${pointer}/${index}`));
    return;
  }
  const declaresObject = schema.type === 'object' || Array.isArray(schema.type) && schema.type.includes('object');
  if (declaresObject) assert.equal(schema.additionalProperties, false, `${pointer || '/'} must close object properties`);
  if (schema.type === 'array') assert.notEqual(schema.items, true, `${pointer || '/'} must type array items`);
  for (const [key, child] of Object.entries(schema)) assertDeeplyClosedSchema(child, `${pointer}/${key}`);
}

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
  const expectedSchemaFiles = [
    ...Object.values(V5_POLICY_FILE_MAP),
    ...Object.values(V5_INTERFACE_SCHEMA_FILE_MAP)
  ].map((base) => `${base}.schema.json`).sort();
  const actualPolicyFiles = (await readdir(policyDirectory)).filter((/** @type {string} */ file) => file.startsWith('v5-')).sort();
  const actualSchemaFiles = (await readdir(schemaDirectory)).filter((/** @type {string} */ file) => file.startsWith('v5-')).sort();
  assert.deepEqual(actualPolicyFiles, expectedPolicyFiles);
  assert.deepEqual(actualSchemaFiles, expectedSchemaFiles);
});

test('public create and advance requests use nested closed unions', () => {
  const schemas = generateV5InterfaceSchemas(generateV5Contracts());
  const createSchema = schemas.createRequest;
  const advanceSchema = schemas.advanceRequest;
  const create = {
    idempotency_key: 'create-1', delivery_intent: 'case_document',
    source_bootstrap: { source_request_seeds: [{ source_request_client_key: 'prd', source_role: 'primary_prd', required: true, locator: { kind: 'inline_text', media_type: 'text/markdown', content: '# PRD' } }] }
  };
  assert.deepEqual(validateAgainstSchema(create, createSchema), []);
  assert.ok(validateAgainstSchema({ ...create, source_bootstrap: { ...create.source_bootstrap, extra: true } }, createSchema).some((issue) => issue.code === 'ADDITIONAL_PROPERTY'));
  assert.ok(validateAgainstSchema({ ...create, source_bootstrap: { source_request_seeds: [{ ...create.source_bootstrap.source_request_seeds[0], locator: { ...create.source_bootstrap.source_request_seeds[0].locator, extra: true } }] } }, createSchema).some((issue) => issue.code === 'ADDITIONAL_PROPERTY'));

  const advance = { idempotency_key: 'advance-1', action: { kind: 'cancel_run', action_token: 'v5.test.token', reason: 'stop' } };
  assert.deepEqual(validateAgainstSchema(advance, advanceSchema), []);
  assert.ok(validateAgainstSchema({ ...advance, action: { ...advance.action, extra: true } }, advanceSchema).some((issue) => issue.code === 'ADDITIONAL_PROPERTY'));
});

test('agent artifact roots reject compiler-owned and unknown fields in schema', () => {
  const schemas = generateV5InterfaceSchemas(generateV5Contracts());
  const valid = {
    idempotency_key: 'advance-evidence',
    action: {
      kind: 'submit_artifact', action_token: 'v5.test.token', artifact_kind: 'evidence_claims',
      artifact: { semantic_review_seed_digest: `sha256:${'0'.repeat(64)}`, claims: [], semantic_gaps: [], decomposition_reviews: [], ambiguity_reviews: [], entity_resolutions: [] }
    }
  };
  assert.deepEqual(validateAgainstSchema(valid, schemas.advanceRequest), []);
  assert.ok(validateAgainstSchema({ ...valid, action: { ...valid.action, artifact: { ...valid.action.artifact, revision: 1 } } }, schemas.advanceRequest).some((issue) => issue.code === 'ADDITIONAL_PROPERTY'));
});

test('generated reply oneOf and reply registry are bidirectionally closed', () => {
  const contracts = generateV5Contracts();
  const replySchema = generateV5InterfaceSchemas(contracts).reply;
  assert.deepEqual(validateV5ReplySchemaRegistryAlignment(contracts.replyContracts, replySchema), []);
  assert.equal(replySchema.oneOf.length, contracts.replyContracts.rows.length);

  const missing = structuredClone(replySchema);
  missing.oneOf.pop();
  assert.deepEqual(validateV5ReplySchemaRegistryAlignment(contracts.replyContracts, missing), ['reply schema and registry contract IDs differ']);

  const duplicate = structuredClone(replySchema);
  duplicate.oneOf.push(structuredClone(duplicate.oneOf[0]));
  assert.deepEqual(validateV5ReplySchemaRegistryAlignment(contracts.replyContracts, duplicate), ['reply schema contract IDs are not unique']);
});

test('every public v5 object branch and array item is deeply closed', () => {
  const schemas = generateV5InterfaceSchemas(generateV5Contracts());
  for (const [name, schema] of Object.entries(schemas)) assertDeeplyClosedSchema(schema, `/${name}`);
});
