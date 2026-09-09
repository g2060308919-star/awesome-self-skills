import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { advanceStrict } from '../../src/advance-strict.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const schemaUrl = new URL(
  '../../skill/generate-test-cases/scripts/schemas/source-pack.schema.json',
  import.meta.url
);
const contract = JSON.parse(await readFile(schemaUrl, 'utf8'));
const sha = `sha256:${'a'.repeat(64)}`;

/** @param {string | undefined} [deliveryIntent] @returns {any} */
function sourcePack(deliveryIntent) {
  return {
    schema_version: '4.0.0',
    source_revision: 0,
    run_instance_id: 'RUN-12345678-1234-4234-8234-123456789abc',
    run_scope: 'review-platform',
    ...(deliveryIntent === undefined ? {} : { delivery_intent: deliveryIntent }),
    sources: [],
    locators: [],
    source_reviews: [],
    source_assets: [],
    source_policy: { rules: [] },
    decision_records: [],
    clarification_events: [],
    artifact_events: [],
    execution_events: []
  };
}

const caseDocumentRef = Object.freeze({
  run_id: 'RUN-case-document',
  revision: 4,
  manifest_digest: sha,
  bundle_digest: sha
});

test('BR-01: v4 rejects an omitted delivery intent', () => {
  const diagnostics = validateAgainstSchema(sourcePack(), contract);
  assert.ok(diagnostics.some((/** @type {any} */ item) => item.code === 'REQUIRED_FIELD_MISSING'
    && item.path === '/delivery_intent'), JSON.stringify(diagnostics));
});

for (const intent of ['case_document', 'execution_plan']) test(`BR-01: v4 accepts ${intent}`, () => {
  const value = sourcePack(intent);
  if (intent === 'execution_plan') value.case_document_ref = caseDocumentRef;
  assert.deepEqual(validateAgainstSchema(value, contract), []);
});

test('BR-01: v4 rejects an unknown delivery intent', () => {
  assert.ok(validateAgainstSchema(sourcePack('combined'), contract).length > 0);
});

test('BR-03: execution-plan intent requires the four-field Case Document reference', () => {
  const value = sourcePack('execution_plan');
  const missing = validateAgainstSchema(value, contract);
  assert.ok(missing.some((item) => item.path === '/case_document_ref'), JSON.stringify(missing));

  value.case_document_ref = { ...caseDocumentRef, bundle_digest: 'a'.repeat(64) };
  assert.ok(validateAgainstSchema(value, contract).some((/** @type {any} */ item) =>
    item.path === '/case_document_ref/bundle_digest'));

  value.case_document_ref = { ...caseDocumentRef, arbitrary_path: '/tmp/result.json' };
  assert.ok(validateAgainstSchema(value, contract).some((/** @type {any} */ item) =>
    item.code === 'ADDITIONAL_PROPERTY'));
});

test('BR-02: case-document intent prohibits an execution reference, including null', () => {
  const objectRef = { ...sourcePack('case_document'), case_document_ref: caseDocumentRef };
  const nullRef = { ...sourcePack('case_document'), case_document_ref: null };
  assert.ok(validateAgainstSchema(objectRef, contract).length > 0);
  assert.ok(validateAgainstSchema(nullRef, contract).length > 0);
});

test('BR-01: v3 remains readable without adopting the v4 required intent', () => {
  const value = { ...sourcePack(), schema_version: '3.0.0' };
  delete value.artifact_events;
  assert.deepEqual(validateAgainstSchema(value, contract), []);
});

test('BR-01: the private runner accepts a valid v4 intent before requesting the next artifact', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'v4-delivery-intent-'));
  try {
    const initial = await advanceStrict(directory);
    assert.equal(initial.status, 'need_artifact');
    const value = sourcePack('case_document');
    value.run_instance_id = initial.scope.run_instance_id;
    await mkdir(path.join(directory, 'staging'), { recursive: true });
    await writeFile(path.join(directory, 'staging/source-pack.json'), JSON.stringify(value));
    const next = await advanceStrict(directory);
    assert.equal(next.status, 'need_artifact', JSON.stringify(next));
    assert.equal(next.stage, 'evidence_claims', JSON.stringify(next));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
