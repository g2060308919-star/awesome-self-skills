import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  validateAgainstSchema,
  validateUniqueStableIds
} from '../../src/schema-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourcePackSchema = JSON.parse(await readFile(path.join(
  repositoryRoot,
  'skill/generate-test-cases/scripts/schemas/source-pack.schema.json'
), 'utf8'));
const claimsSchema = JSON.parse(await readFile(path.join(
  repositoryRoot,
  'skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json'
), 'utf8'));

/** @returns {any} */
function minimumSourcePack() {
  return {
    schema_version: '1.0.0',
    source_revision: 0,
    run_scope: 'checkout',
    sources: [],
    locators: [],
    source_policy: { rules: [] },
    decision_records: [],
    clarification_events: []
  };
}

/** @returns {any} */
function minimumClaims() {
  return {
    schema_version: '1.0.0',
    source_revision: 0,
    claims: [],
    fact_ledger: []
  };
}

test('schema accepts the minimum legal source pack fixture', () => {
  assert.deepEqual(validateAgainstSchema(minimumSourcePack(), sourcePackSchema), []);
});

test('schema reports a missing required claim field at its JSON pointer', () => {
  const artifact = minimumClaims();
  artifact.claims.push({ claim_id: 'claim_a' });

  assert.deepEqual(validateAgainstSchema(artifact, claimsSchema), [{
    category: 'schema',
    code: 'REQUIRED_FIELD_MISSING',
    path: '/claims/0/source_locator_ids',
    message: 'required field is missing'
  }]);
});

test('schema rejects an unknown schema version', () => {
  const artifact = minimumSourcePack();
  artifact.schema_version = '9.0.0';

  assert.equal(validateAgainstSchema(artifact, sourcePackSchema)[0]?.code, 'CONST_MISMATCH');
});

test('schema rejects controlled extra properties and invalid locator enums', () => {
  const artifact = minimumSourcePack();
  artifact.unexpected = true;
  artifact.locators.push({
    locator_id: 'locator_a',
    source_id: 'source_a',
    type: 'spreadsheet-row',
    content_digest: 'a'.repeat(64),
    extraction_integrity: 'verified'
  });

  const diagnostics = validateAgainstSchema(artifact, sourcePackSchema);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'ADDITIONAL_PROPERTY'), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === 'ENUM_MISMATCH'), true);
});

test('schema detects duplicate stable IDs only inside definition collections', () => {
  const artifact = minimumClaims();
  artifact.claims.push(
    { claim_id: 'claim_same', source_locator_ids: ['locator_a'] },
    { claim_id: 'claim_same', source_locator_ids: ['locator_a'] }
  );

  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema',
    code: 'DUPLICATE_STABLE_ID',
    path: '/claims/1/claim_id',
    message: 'duplicate stable ID "claim_same"'
  }]);
});
