import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSupportedSchema, validateAgainstSchema } from '../../src/schema-validator.mjs';

test('v4 schema dialect maxItems enforces the inclusive upper bound', () => {
  assert.deepEqual(validateAgainstSchema(['a', 'b'], { type: 'array', maxItems: 2 }), []);
  assert.deepEqual(validateAgainstSchema(['a', 'b', 'c'], { type: 'array', maxItems: 2 }), [
    { category: 'schema', code: 'MAX_ITEMS', path: '/', message: 'has too many items' }
  ]);
  assert.deepEqual(validateAgainstSchema([], { maxItems: 0 }), []);
  assert.equal(validateAgainstSchema(['a'], { maxItems: 0 })[0].code, 'MAX_ITEMS');
  assert.deepEqual(validateAgainstSchema('not an array', { maxItems: 0 }), []);
});

test('v4 schema dialect prefixItems and items false freeze the action tuple', () => {
  const schema = {
    type: 'array', minItems: 2, maxItems: 2,
    prefixItems: [{ const: 'provide_artifact' }, { const: 'cancel_run' }], items: false
  };
  assert.deepEqual(validateAgainstSchema(['provide_artifact', 'cancel_run'], schema), []);
  assert.deepEqual(validateAgainstSchema(['cancel_run', 'provide_artifact'], schema).map(({ code, path }) => ({ code, path })), [
    { code: 'CONST_MISMATCH', path: '/0' }, { code: 'CONST_MISMATCH', path: '/1' }
  ]);
  assert.equal(validateAgainstSchema(['provide_artifact'], schema)[0].code, 'MIN_ITEMS');
  assert.deepEqual(validateAgainstSchema(['provide_artifact', 'cancel_run', 'continue'], schema).map(({ code, path }) => ({ code, path })), [
    { code: 'MAX_ITEMS', path: '/' }, { code: 'ADDITIONAL_ITEM', path: '/2' }
  ]);
});

test('v4 schema dialect prefixItems applies only to present positions and items only to the tail', () => {
  const schema = { prefixItems: [{ type: 'string' }], items: { type: 'integer' } };
  assert.deepEqual(validateAgainstSchema([], schema), []);
  assert.deepEqual(validateAgainstSchema(['first', 1, 2], schema), []);
  assert.deepEqual(validateAgainstSchema(['first', 'not integer'], schema).map(({ code, path }) => ({ code, path })), [
    { code: 'TYPE_MISMATCH', path: '/1' }
  ]);
  assert.deepEqual(validateAgainstSchema(['first', { any: 'tail' }], { prefixItems: [{ type: 'string' }], items: true }), []);
  assert.deepEqual(validateAgainstSchema([], { items: false }), []);
  assert.equal(validateAgainstSchema([1], { items: false })[0].code, 'ADDITIONAL_ITEM');
});

test('v4 schema dialect allOf refs share evaluated properties with the closing sibling', () => {
  const schema = {
    $defs: {
      base: { type: 'object', required: ['module_id'], properties: { module_id: { type: 'string' } } },
      formal: { type: 'object', required: ['risk_kind', 'formal_test_point_ids'], properties: {
        risk_kind: { const: 'formal' }, formal_test_point_ids: { type: 'array', items: { type: 'string' } }
      } }
    },
    allOf: [{ $ref: '#/$defs/base' }, { $ref: '#/$defs/formal' }],
    unevaluatedProperties: false
  };
  const valid = { module_id: 'm-1', risk_kind: 'formal', formal_test_point_ids: ['tp-1'] };
  assert.deepEqual(validateAgainstSchema(valid, schema), []);
  assert.deepEqual(validateAgainstSchema({ ...valid, semantic_gap_ids: ['gap-1'] }, schema), [
    { category: 'schema', code: 'UNEVALUATED_PROPERTY', path: '/semantic_gap_ids', message: 'unevaluated properties are not allowed' }
  ]);
});

test('v4 schema dialect referenced closed variants reject another variant fields', () => {
  const schema = {
    $defs: {
      base: { type: 'object', required: ['module_id'], properties: { module_id: { type: 'string' } } },
      formal: {
        allOf: [{ $ref: '#/$defs/base' }, { required: ['risk_kind', 'formal_test_point_ids'], properties: {
          risk_kind: { const: 'formal' }, formal_test_point_ids: { type: 'array', items: { type: 'string' } }
        } }], unevaluatedProperties: false
      },
      gap: {
        allOf: [{ $ref: '#/$defs/base' }, { required: ['risk_kind', 'semantic_gap_ids'], properties: {
          risk_kind: { const: 'gap' }, semantic_gap_ids: { type: 'array', items: { type: 'string' } }
        } }], unevaluatedProperties: false
      }
    }, oneOf: [{ $ref: '#/$defs/formal' }, { $ref: '#/$defs/gap' }]
  };
  assert.deepEqual(validateAgainstSchema({ module_id: 'm-1', risk_kind: 'formal', formal_test_point_ids: ['tp-1'] }, schema), []);
  assert.deepEqual(validateAgainstSchema({ module_id: 'm-1', risk_kind: 'gap', semantic_gap_ids: ['gap-1'] }, schema), []);
  assert.equal(validateAgainstSchema({
    module_id: 'm-1', risk_kind: 'formal', formal_test_point_ids: ['tp-1'], semantic_gap_ids: ['gap-1']
  }, schema)[0].code, 'ONE_OF_MISMATCH');
});

test('v4 schema dialect oneOf contributes only the successful variant evaluated fields', () => {
  const schema = {
    type: 'object',
    oneOf: [
      { required: ['kind', 'first'], properties: { kind: { const: 'first' }, first: { type: 'string' } } },
      { required: ['kind', 'second'], properties: { kind: { const: 'second' }, second: { type: 'string' } } }
    ],
    unevaluatedProperties: false
  };
  assert.deepEqual(validateAgainstSchema({ kind: 'first', first: 'valid' }, schema), []);
  assert.deepEqual(validateAgainstSchema({ kind: 'first', first: 'valid', second: 'not evaluated' }, schema), [
    { category: 'schema', code: 'UNEVALUATED_PROPERTY', path: '/second', message: 'unevaluated properties are not allowed' }
  ]);
});

test('v4 schema dialect nested properties never leak into outer evaluated fields', () => {
  const schema = {
    properties: { child: { properties: { inner: { type: 'string' } }, unevaluatedProperties: false } },
    unevaluatedProperties: false
  };
  assert.deepEqual(validateAgainstSchema({ child: { inner: 'valid' } }, schema), []);
  assert.deepEqual(validateAgainstSchema({ child: { inner: 'valid' }, inner: 'not an outer field' }, schema), [
    { category: 'schema', code: 'UNEVALUATED_PROPERTY', path: '/inner', message: 'unevaluated properties are not allowed' }
  ]);
});

test('v4 schema dialect ref siblings combine but additionalProperties stays local', () => {
  const schema = {
    $defs: { base: { properties: { base: { type: 'string' } } } },
    $ref: '#/$defs/base', properties: { own: { type: 'integer' } }, unevaluatedProperties: false
  };
  assert.deepEqual(validateAgainstSchema({ base: 'valid', own: 1 }, schema), []);
  const locallyClosed = { ...schema, additionalProperties: false };
  assert.deepEqual(validateAgainstSchema({ base: 'valid', own: 1 }, locallyClosed).map(({ code, path }) => ({ code, path })), [
    { code: 'ADDITIONAL_PROPERTY', path: '/base' }
  ]);
});

test('v4 schema dialect explicit additional and unevaluated schemas annotate accepted fields', () => {
  assert.deepEqual(validateAgainstSchema({ tail: 1 }, { allOf: [{ additionalProperties: true }], unevaluatedProperties: false }), []);
  assert.deepEqual(validateAgainstSchema({ tail: 1 }, { allOf: [{ additionalProperties: { type: 'integer' } }], unevaluatedProperties: false }), []);
  assert.deepEqual(validateAgainstSchema({ tail: 1 }, { allOf: [{ unevaluatedProperties: true }], unevaluatedProperties: false }), []);
  assert.deepEqual(validateAgainstSchema({ tail: 1 }, { allOf: [{ unevaluatedProperties: { type: 'integer' } }], unevaluatedProperties: false }), []);
  assert.deepEqual(validateAgainstSchema({ tail: 'invalid' }, { unevaluatedProperties: { type: 'integer' } }).map(({ code, path }) => ({ code, path })), [
    { code: 'TYPE_MISMATCH', path: '/tail' }
  ]);
});

test('v4 schema dialect malformed new keyword values are rejected before validation', () => {
  for (const maxItems of [-1, 0.5, '2', null]) {
    assert.throws(() => assertSupportedSchema({ maxItems }), /maxItems/);
  }
  for (const prefixItems of [null, {}, 'tuple', []]) {
    assert.throws(() => assertSupportedSchema({ prefixItems }), /prefixItems/);
  }
  for (const unevaluatedProperties of [null, 1, []]) {
    assert.throws(() => assertSupportedSchema({ unevaluatedProperties }), /unevaluatedProperties/);
  }
});

test('v4 schema dialect continues rejecting unknown keywords including nested schemas', () => {
  assert.throws(() => assertSupportedSchema({ unknownKeyword: true }), /Unsupported schema keyword: unknownKeyword/);
  assert.throws(() => assertSupportedSchema({ prefixItems: [{ unknownKeyword: true }] }), /Unsupported schema keyword: unknownKeyword/);
  assert.throws(() => assertSupportedSchema({ unevaluatedProperties: { unknownKeyword: true } }), /Unsupported schema keyword: unknownKeyword/);
});

test('v4 schema dialect not prohibits the matching branch', () => {
  const schema = {
    type: 'object',
    properties: { forbidden: { type: 'string' } },
    not: { required: ['forbidden'] }
  };
  assert.deepEqual(validateAgainstSchema({}, schema), []);
  assert.ok(validateAgainstSchema({ forbidden: 'value' }, schema)
    .some((item) => item.code === 'NOT_MATCHED'));
});
