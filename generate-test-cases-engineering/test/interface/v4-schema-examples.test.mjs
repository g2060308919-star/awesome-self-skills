import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateCaseSemanticsV4 } from '../../src/case-semantics-v4.mjs';
import { assertSupportedSchema, validateAgainstSchema } from '../../src/schema-validator.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schemaRoot = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/schemas');
const fixtureRoot = path.join(repositoryRoot, 'test/fixtures/v4/schema-examples');

/** @param {string} file */
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const index = await json(path.join(fixtureRoot, 'index.json'));

/** @param {Record<string, any>} schema @param {string | undefined} definition */
function validationSchema(schema, definition) {
  return definition
    ? { $schema: schema.$schema, $defs: schema.$defs, $ref: `#/$defs/${definition}` }
    : schema;
}

/** @param {Record<string, any>} root @param {string} reference */
function resolveRef(root, reference) {
  let current = /** @type {any} */ (root);
  for (const part of reference.slice(2).split('/')) {
    current = current[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return current;
}

/** @param {unknown} value @param {Record<string, any>} schema @param {Record<string, any>} root */
function schemaAccepts(value, schema, root) {
  const candidate = { $schema: root.$schema, $defs: root.$defs, ...schema };
  return validateAgainstSchema(value, candidate).length === 0;
}

/**
 * Follow only branches evaluated by a valid instance and return every local
 * definition it actually reaches. This prevents a hand-written coverage list
 * from claiming a helper that no complete example exercises.
 * @param {unknown} value
 * @param {Record<string, any>} schema
 * @param {Record<string, any>} root
 * @param {Set<string>} reached
 */
function traceReachedDefinitions(value, schema, root, reached) {
  if (typeof schema.$ref === 'string') {
    const prefix = '#/$defs/';
    if (schema.$ref.startsWith(prefix)) reached.add(schema.$ref.slice(prefix.length).split('/')[0]);
    traceReachedDefinitions(value, resolveRef(root, schema.$ref), root, reached);
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.filter((/** @type {Record<string, any>} */ branch) => schemaAccepts(value, branch, root));
    assert.equal(branches.length, 1,
      `valid fixture must select one oneOf branch, got ${branches.length}: ${JSON.stringify(schema.oneOf)}`);
    traceReachedDefinitions(value, branches[0], root, reached);
  }
  if (Array.isArray(schema.allOf)) {
    for (const branch of schema.allOf) traceReachedDefinitions(value, branch, root, reached);
  }
  if (schema.if && typeof schema.if === 'object') {
    const selected = schemaAccepts(value, schema.if, root) ? schema.then : schema.else;
    if (selected && typeof selected === 'object') traceReachedDefinitions(value, selected, root, reached);
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) traceReachedDefinitions(
        /** @type {Record<string, unknown>} */ (value)[key],
        /** @type {Record<string, any>} */ (child), root, reached
      );
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)
    && schema.additionalProperties && typeof schema.additionalProperties === 'object') {
    const declared = new Set(Object.keys(schema.properties ?? {}));
    for (const [key, childValue] of Object.entries(value)) {
      if (!declared.has(key)) traceReachedDefinitions(childValue, schema.additionalProperties, root, reached);
    }
  }
  if (Array.isArray(value)) {
    const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    value.forEach((item, position) => {
      const child = prefix[position] ?? (schema.items && typeof schema.items === 'object' ? schema.items : null);
      if (child) traceReachedDefinitions(item, child, root, reached);
    });
  }
}

/** @param {any} suite @param {any} fixture @param {any} example */
function semanticDiagnostics(suite, fixture, example) {
  if (suite.semantic_validator !== 'case_semantics_v4') return [];
  return fixture.cases.flatMap((/** @type {any} */ item) => validateCaseSemanticsV4(item));
}

/** @param {any} fixture @param {any} suite */
function examplesFor(fixture, suite) {
  return suite.fixture_key ? fixture[suite.fixture_key] : fixture;
}

test('every indexed positive and negative example uses the real installed schema or $defs', async () => {
  assert.ok(Array.isArray(index.suites) && index.suites.length > 0);
  for (const suite of index.suites) {
    const schema = await json(path.join(schemaRoot, suite.schema));
    assertSupportedSchema(schema);
    if (suite.definition) assert.ok(schema.$defs?.[suite.definition], `${suite.schema}#${suite.definition}`);
    const fixtureFile = await json(path.join(fixtureRoot, suite.fixture));
    const fixture = examplesFor(fixtureFile, suite);
    assert.ok(fixture && typeof fixture === 'object', `${suite.name}: missing fixture_key ${suite.fixture_key}`);
    assert.ok(fixture.valid.length > 0 && fixture.invalid.length > 0, suite.name);
    const target = validationSchema(schema, suite.definition);
    for (const example of fixture.valid) {
      assert.match(example.name, /^[a-z0-9]+(?:_[a-z0-9]+)+$/u);
      assert.ok(example.reason.trim().length > 12, example.name);
      assert.deepEqual(validateAgainstSchema(example.value, target), [], `${suite.name}: ${example.name}`);
      assert.deepEqual(semanticDiagnostics(suite, example.value, example), [], `${suite.name}: ${example.name}`);
    }
    for (const example of fixture.invalid) {
      assert.match(example.name, /^[a-z0-9]+(?:_[a-z0-9]+)+$/u);
      assert.ok(example.reason.trim().length > 12, example.name);
      const schemaErrors = validateAgainstSchema(example.value, target);
      if (example.failure_stage === 'semantic') {
        assert.deepEqual(schemaErrors, [], `${example.name} must reach the relational gate`);
        assert.notDeepEqual(semanticDiagnostics(suite, example.value, example), [], example.name);
      } else {
        assert.notDeepEqual(schemaErrors, [], `${suite.name}: ${example.name}`);
      }
    }
  }
});

test('critical discriminators exercise every explicit branch and failure boundary', async () => {
  const values = await json(path.join(fixtureRoot, 'test-value-origins.json'));
  assert.deepEqual(values.valid.map((/** @type {any} */ item) => item.value.kind).sort(),
    ['derived', 'example', 'requirement', 'temporary_assumption']);
  const risks = await json(path.join(fixtureRoot, 'risk-review-items.json'));
  assert.deepEqual(risks.valid.map((/** @type {any} */ item) => item.value.status).sort(),
    ['exploratory', 'formal', 'not_applicable', 'semantic_gap']);
  const execution = await json(path.join(fixtureRoot, 'execution-manifest.json'));
  assert.deepEqual(execution.valid.map((/** @type {any} */ item) => item.value.result_kind).sort(),
    ['execution_ready', 'no_execution_selected']);
});

test('complete positive roots transitively reach every declared new definition', async () => {
  assert.ok(index.new_definitions && typeof index.new_definitions === 'object',
    'index.new_definitions must enumerate every new $defs by schema');
  const indexedSchemas = [...new Set(index.suites.map((/** @type {any} */ suite) => suite.schema))].sort();
  assert.deepEqual(Object.keys(index.new_definitions).sort(), indexedSchemas,
    'every schema exercised by the v4 example suite needs an explicit definition inventory');
  assert.deepEqual(Object.keys(index.preexisting_definitions ?? {}).sort(), Object.keys(index.new_definitions).sort(),
    'every changed schema needs an explicit pre-v4 definition inventory');
  const reachedBySchema = new Map();
  for (const suite of index.suites) {
    const schema = await json(path.join(schemaRoot, suite.schema));
    const target = validationSchema(schema, suite.definition);
    const fixtureFile = await json(path.join(fixtureRoot, suite.fixture));
    const fixture = examplesFor(fixtureFile, suite);
    const reached = reachedBySchema.get(suite.schema) ?? new Set();
    for (const example of fixture.valid) traceReachedDefinitions(example.value, target, target, reached);
    reachedBySchema.set(suite.schema, reached);
  }
  for (const [schemaFile, definitions] of Object.entries(index.new_definitions)) {
    const schema = await json(path.join(schemaRoot, schemaFile));
    const prior = /** @type {string[]} */ (index.preexisting_definitions[schemaFile]);
    assert.equal(new Set([...prior, ...definitions]).size, prior.length + definitions.length,
      `${schemaFile} preexisting/new definition inventories must be disjoint`);
    assert.deepEqual([...Object.keys(schema.$defs ?? {})].sort(), [...prior, ...definitions].sort(),
      `${schemaFile} has an unclassified $defs addition or removal`);
    const reached = reachedBySchema.get(schemaFile) ?? new Set();
    for (const definition of /** @type {string[]} */ (definitions)) {
      assert.ok(schema.$defs?.[definition], `${schemaFile} is missing declared $defs.${definition}`);
      assert.ok(reached.has(definition), `${schemaFile}::$defs.${definition} is not reached by a valid indexed example`);
    }
  }
});
