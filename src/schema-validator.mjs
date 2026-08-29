import { canonicalStringify } from './canonical.mjs';
import { STABLE_ID_COLLECTIONS } from './contracts.mjs';

const supportedKeywords = new Set([
  '$schema', '$id', 'type', 'required', 'properties', 'items', 'enum', 'const',
  'oneOf', 'allOf', 'minItems', 'minLength', 'pattern', 'minimum', 'maximum',
  'uniqueItems', 'additionalProperties'
]);

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'schema', code, path, message };
}

/** @param {unknown} schema */
export function assertSupportedSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('Schema must be an object.');
  }
  for (const [key, value] of Object.entries(schema)) {
    if (!supportedKeywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === 'items') {
      assertSupportedSchema(value);
    } else if ((key === 'oneOf' || key === 'allOf') && Array.isArray(value)) {
      for (const child of value) assertSupportedSchema(child);
    }
  }
}

/** @param {unknown} value @param {unknown} schema */
export function validateAgainstSchema(value, schema) {
  assertSupportedSchema(schema);
  return validate(value, /** @type {Record<string, unknown>} */ (schema), '');
}

/** @param {unknown} value @param {Record<string, unknown>} schema @param {string} path */
function validate(value, schema, path) {
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];
  const pointer = path || '/';
  if (schema.type && !matchesType(value, schema.type)) {
    return [diagnostic('TYPE_MISMATCH', pointer, `must be ${Array.isArray(schema.type) ? schema.type.join(' or ') : schema.type}`)];
  }
  if (Object.hasOwn(schema, 'const') && canonicalStringify(value) !== canonicalStringify(schema.const)) {
    diagnostics.push(diagnostic('CONST_MISMATCH', pointer, 'must equal the schema constant'));
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => canonicalStringify(item) === canonicalStringify(value))) {
    diagnostics.push(diagnostic('ENUM_MISMATCH', pointer, 'must be one of the allowed values'));
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) diagnostics.push(diagnostic('MIN_LENGTH', pointer, 'is shorter than the minimum length'));
    if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern)).test(value)) diagnostics.push(diagnostic('PATTERN_MISMATCH', pointer, 'does not match the required pattern'));
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) diagnostics.push(diagnostic('MINIMUM', pointer, 'is below the minimum'));
    if (typeof schema.maximum === 'number' && value > schema.maximum) diagnostics.push(diagnostic('MAXIMUM', pointer, 'is above the maximum'));
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) diagnostics.push(diagnostic('MIN_ITEMS', pointer, 'has too few items'));
    if (schema.uniqueItems === true) {
      const seen = new Set();
      value.forEach((item, index) => {
        const key = canonicalStringify(item);
        if (seen.has(key)) diagnostics.push(diagnostic('UNIQUE_ITEMS', `${path}/${index}`, 'must not contain duplicate items'));
        seen.add(key);
      });
    }
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      value.forEach((item, index) => diagnostics.push(...validate(item, /** @type {Record<string, unknown>} */ (schema.items), `${path}/${index}`)));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = /** @type {Record<string, unknown>} */ (value);
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? /** @type {Record<string, Record<string, unknown>>} */ (schema.properties) : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !Object.hasOwn(object, key)) diagnostics.push(diagnostic('REQUIRED_FIELD_MISSING', `${path}/${key}`, 'required field is missing'));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(properties, key)) diagnostics.push(diagnostic('ADDITIONAL_PROPERTY', `${path}/${key}`, 'additional properties are not allowed'));
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) diagnostics.push(...validate(object[key], childSchema, `${path}/${key}`));
    }
  }
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) diagnostics.push(...validate(value, /** @type {Record<string, unknown>} */ (child), path));
  if (Array.isArray(schema.oneOf)) {
    const matching = schema.oneOf.filter((child) => validate(value, /** @type {Record<string, unknown>} */ (child), path).length === 0);
    if (matching.length !== 1) diagnostics.push(diagnostic('ONE_OF_MISMATCH', pointer, 'must match exactly one schema variant'));
  }
  return diagnostics;
}

/** @param {unknown} value @param {unknown} type @returns {boolean} */
function matchesType(value, type) {
  if (Array.isArray(type)) return type.some((candidate) => matchesType(value, candidate));
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  if (type === 'null') return value === null;
  return typeof value === type;
}

/** @param {unknown} artifact */
export function validateUniqueStableIds(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return [];
  const object = /** @type {Record<string, unknown>} */ (artifact);
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];
  for (const { collection, id } of STABLE_ID_COLLECTIONS) {
    const items = object[collection];
    if (!Array.isArray(items)) continue;
    const seen = new Set();
    items.forEach((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return;
      const value = /** @type {Record<string, unknown>} */ (item)[id];
      if (typeof value !== 'string') return;
      if (seen.has(value)) diagnostics.push(diagnostic('DUPLICATE_STABLE_ID', `/${collection}/${index}/${id}`, `duplicate stable ID "${value}"`));
      seen.add(value);
    });
  }
  return diagnostics;
}
