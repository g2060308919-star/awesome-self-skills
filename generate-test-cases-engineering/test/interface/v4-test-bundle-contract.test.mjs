import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';
import { evaluateJourney } from '../helpers/run-journey.mjs';

const schema = JSON.parse(await readFile(new URL('../../skill/generate-test-cases/scripts/schemas/test-bundle.schema.json', import.meta.url), 'utf8'));
// T02 only seals the intent envelope. T04/T06 must add a RED test before
// admitting nonempty CaseSpecs; an open object here would bypass that contract.
/** @returns {Record<string, unknown>} */
const minimalDocument = () => ({
  schema_version: '4.0.0',
  compiler_version: '0.5.0',
  delivery_intent: 'case_document',
  source_revision: 0,
  cases: []
});

test('v4 Case Document has a closed intent envelope without execution prerequisites', () => {
  assert.deepEqual(validateAgainstSchema(minimalDocument(), schema), []);
});

test('v4 bundle rejects absent or mismatched envelope identity', () => {
  for (const field of ['schema_version', 'compiler_version', 'delivery_intent', 'source_revision', 'cases']) {
    const missing = minimalDocument();
    delete missing[field];
    assert.notDeepEqual(validateAgainstSchema(missing, schema), [], field);
  }
  for (const [field, value] of /** @type {Array<[string, unknown]>} */ ([
    ['schema_version', '3.0.0'], ['compiler_version', '0.4.0'],
    ['delivery_intent', 'execution_plan'], ['delivery_intent', 'unknown'],
    ['source_revision', -1], ['source_revision', 0.5], ['cases', {}]
  ])) assert.notDeepEqual(validateAgainstSchema({ ...minimalDocument(), [field]: value }, schema), [], field);
});

test('v4 Case Document cannot acquire execution state through extra fields', () => {
  for (const [field, value] of /** @type {Array<[string, unknown]>} */ ([
    ['execution_plan', {}], ['runner_case_ids', []], ['runner_projection', { case_ids: [] }],
    ['runner_ready', false], ['resource_readiness', 'unknown'], ['readiness', {}],
    ['execution_disposition', 'pending'], ['case_document_ref', {}], ['unrecognized', true]
  ])) assert.notDeepEqual(validateAgainstSchema({ ...minimalDocument(), [field]: value }, schema), [], field);
});

test('T02 envelope does not admit an unvalidated nonempty CaseSpec', () => {
  assert.notDeepEqual(validateAgainstSchema({ ...minimalDocument(), cases: [{}] }, schema), []);
});

test('v3 historical bundle goldens retain their complete legacy contract', async () => {
  const directory = new URL('../golden/journeys/', import.meta.url);
  const files = (await readdir(directory)).filter((/** @type {string} */ name) => name.endsWith('.json'));
  assert.ok(files.length >= 10);
  for (const name of files) {
    const legacy = JSON.parse(await readFile(new URL(name, directory), 'utf8'));
    assert.deepEqual(validateAgainstSchema(legacy, schema), [], name);
    assert.notDeepEqual(validateAgainstSchema({ ...legacy, delivery_intent: 'case_document' }, schema), [], name);
    const incomplete = structuredClone(legacy);
    delete incomplete.execution_plan;
    assert.notDeepEqual(validateAgainstSchema(incomplete, schema), [], name);
  }
});

test('v3 coverage intermediate validation still produces the reviewed legacy bundle', async () => {
  const expected = JSON.parse(await readFile(new URL('../golden/journeys/all-e3.json', import.meta.url), 'utf8'));
  const result = await evaluateJourney('all-e3');
  assert.equal(result.status, 'finished', JSON.stringify(result));
  assert.deepEqual(result.bundle, expected);
});
