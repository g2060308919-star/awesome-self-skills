import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
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
const schemaDirectory = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schemas');
const behaviorViewsSchema = JSON.parse(await readFile(path.join(schemaDirectory, 'behavior-views.schema.json'), 'utf8'));

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

test('schema detects duplicate fact ledger definition IDs without treating references as definitions', () => {
  const artifact = minimumClaims();
  artifact.fact_ledger.push(
    { fact_id: 'fact_same', claim_id: 'claim_a' },
    { fact_id: 'fact_same', claim_id: 'claim_b' }
  );

  assert.deepEqual(validateUniqueStableIds(artifact), [{
    category: 'schema',
    code: 'DUPLICATE_STABLE_ID',
    path: '/fact_ledger/1/fact_id',
    message: 'duplicate stable ID "fact_same"'
  }]);
});

test('schema rejects unknown nested compiler-controlled properties', () => {
  const artifact = minimumSourcePack();
  artifact.source_policy.rules.push({ rule_id: 'policy_a', source_ids: [], unexpected: true });

  const diagnostics = validateAgainstSchema(artifact, sourcePackSchema);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.path === '/source_policy/rules/0/unexpected' && diagnostic.code === 'ADDITIONAL_PROPERTY'), true);
});

test('schema rejects ill-typed nested interaction items', () => {
  const artifact = {
    schema_version: '1.0.0', source_revision: 0, views: [], interaction_candidates: [],
    interaction_matrix: [{ module_ids: 'orders', dimension: 'role', status: 'checked-no-signal' }]
  };

  assert.equal(validateAgainstSchema(artifact, behaviorViewsSchema).some((diagnostic) => diagnostic.path === '/interaction_matrix/0/module_ids' && diagnostic.code === 'TYPE_MISMATCH'), true);
});

test('all eight schemas accept hand-derived minimum legal fixtures', async () => {
  const schemas = Object.fromEntries(await Promise.all((/** @type {string[]} */ (await readdir(schemaDirectory)))
    .filter((/** @type {string} */ file) => file.endsWith('.schema.json'))
    .map(async (/** @type {string} */ file) => [file, JSON.parse(await readFile(path.join(schemaDirectory, file), 'utf8'))])));
  const fixtures = {
    'source-pack.schema.json': minimumSourcePack(),
    'evidence-claims.schema.json': minimumClaims(),
    'behavior-views.schema.json': { schema_version: '1.0.0', source_revision: 0, views: [], interaction_matrix: [], interaction_candidates: [] },
    'test-obligations.schema.json': { schema_version: '1.0.0', source_revision: 0, obligations: [], fact_routes: [], interaction_routes: [] },
    'case-drafts.schema.json': { schema_version: '1.0.0', source_revision: 0, cases: [], obligation_dispositions: [], exploratory_candidates: [] },
    'test-bundle.schema.json': { schema_version: '1.0.0', source_revision: 0, grounded: [], conditional: [], blocked: [], exploratory: [], coverage: { requirements: { total: 0, accounted: 0 }, formal: { total: 0, covered: 0 }, executable: { total: 0, grounded: 0 }, expert_recall: { status: 'benchmark_only' } }, quality: { delivery_status: 'no_applicable_formal_test_points', compiler_version: '0.1.0', schema_version: '1.0.0' } },
    'checkpoint.schema.json': { input_digest: 'a'.repeat(64), source_revision: 0, stage: 'source_pack', compiler_version: '0.1.0', schema_version: '1.0.0', accepted_artifact_digests: {}, clarification_event_seq: 0, asked_root_issue_ids: [], root_issue_dispositions: [], last_question_set_digest: '', clarification_stop: { reason: 'converged', source_revision: 0 } },
    'reply.schema.json': { status: 'fatal', diagnostics: [] }
  };

  for (const [file, fixture] of Object.entries(fixtures)) assert.deepEqual(validateAgainstSchema(fixture, schemas[file]), [], file);
});
