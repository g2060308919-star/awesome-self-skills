import { canonicalStringify } from './canonical.mjs';
import { STABLE_ID_COLLECTIONS } from './contracts.mjs';

const supportedKeywords = new Set([
  '$schema', '$id', 'type', 'required', 'properties', 'items', 'enum', 'const',
  'oneOf', 'allOf', 'minItems', 'minLength', 'pattern', 'minimum', 'maximum',
  'uniqueItems', 'additionalProperties'
]);
const supportedTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isSchemaObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} keyword */
function assertStringArray(value, keyword) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string') || new Set(value).size !== value.length) {
    throw new Error(`Schema ${keyword} must be an array of unique strings.`);
  }
}

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'schema', code, path, message };
}

/** @param {unknown} schema */
export function assertSupportedSchema(schema) {
  if (!isSchemaObject(schema)) {
    throw new Error('Schema must be an object.');
  }
  for (const [key, value] of Object.entries(schema)) {
    if (!supportedKeywords.has(key)) throw new Error(`Unsupported schema keyword: ${key}`);
    if (key === '$schema' || key === '$id' || key === 'pattern') {
      if (typeof value !== 'string') throw new Error(`Schema ${key} must be a string.`);
      if (key === 'pattern') { try { new RegExp(value); } catch { throw new Error('Schema pattern must be a valid regular expression.'); } }
    } else if (key === 'type') {
      const types = Array.isArray(value) ? value : [value];
      if (!types.length || types.some((item) => typeof item !== 'string' || !supportedTypes.has(item)) || new Set(types).size !== types.length) throw new Error('Schema type must name supported unique types.');
    } else if (key === 'required') {
      assertStringArray(value, 'required');
    } else if (key === 'properties') {
      if (!isSchemaObject(value)) throw new Error('Schema properties must be an object.');
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === 'items') {
      assertSupportedSchema(value);
    } else if (key === 'oneOf' || key === 'allOf') {
      if (!Array.isArray(value) || value.length === 0) throw new Error(`Schema ${key} must be a non-empty array of schema objects.`);
      for (const child of value) assertSupportedSchema(child);
    } else if (key === 'enum') {
      if (!Array.isArray(value) || value.length === 0 || new Set(value.map((item) => canonicalStringify(item))).size !== value.length) throw new Error('Schema enum must be a non-empty array of unique values.');
    } else if (key === 'minItems' || key === 'minLength') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`Schema ${key} must be a non-negative integer.`);
    } else if (key === 'minimum' || key === 'maximum') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Schema ${key} must be a finite number.`);
    } else if (key === 'uniqueItems') {
      if (typeof value !== 'boolean') throw new Error('Schema uniqueItems must be boolean.');
    } else if (key === 'additionalProperties') {
      if (typeof value !== 'boolean' && !isSchemaObject(value)) throw new Error('Schema additionalProperties must be boolean or a schema object.');
      if (isSchemaObject(value)) assertSupportedSchema(value);
    }
  }
  if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number' && schema.minimum > schema.maximum) throw new Error('Schema minimum must not exceed maximum.');
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
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !Array.isArray(schema.additionalProperties)) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(properties, key)) diagnostics.push(...validate(object[key], /** @type {Record<string, unknown>} */ (schema.additionalProperties), `${path}/${key}`));
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) diagnostics.push(...validate(object[key], childSchema, `${path}/${key}`));
    }
  }
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) diagnostics.push(...validate(value, /** @type {Record<string, unknown>} */ (child), path));
  if (Array.isArray(schema.oneOf)) {
    const variants = schema.oneOf.map((child) => /** @type {Record<string, unknown>} */ (child));
    const matching = variants.filter((child) => validate(value, child, path).length === 0);
    if (matching.length !== 1) {
      const discriminated = variants.filter((child) => matchesDiscriminator(value, child));
      if (matching.length === 0 && discriminated.length === 1) diagnostics.push(...validate(value, discriminated[0], path));
      else diagnostics.push(diagnostic('ONE_OF_MISMATCH', pointer, 'must match exactly one schema variant'));
    }
  }
  return diagnostics;
}

/** @param {unknown} value @param {Record<string, unknown>} schema */
function matchesDiscriminator(value, schema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const properties = schema.properties;
  if (!isSchemaObject(properties)) return false;
  /** @type {Array<[string, Record<string, unknown>]>} */
  const constants = Object.entries(properties).flatMap(([key, candidate]) => isSchemaObject(candidate) && Object.hasOwn(candidate, 'const') ? [[key, candidate]] : []);
  return constants.length > 0 && constants.every(([key, candidate]) => canonicalStringify(/** @type {Record<string, unknown>} */ (value)[key]) === canonicalStringify(candidate.const));
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
  const seenByNamespace = new Map();
  for (const { path, id, namespace, scopeSegments } of /** @type {any[]} */ (STABLE_ID_COLLECTIONS)) {
    for (const { items, pointer } of findCollections(object, path)) {
      const pointerSegments = pointer.split('/').filter(Boolean);
      const scopedPointer = typeof scopeSegments === 'number' ? `/${pointerSegments.slice(0, -scopeSegments).join('/')}` : '';
      const namespaceKey = `${namespace ?? path.join('/')}${scopedPointer}`;
      const seen = seenByNamespace.get(namespaceKey) ?? new Set();
      seenByNamespace.set(namespaceKey, seen);
      items.forEach((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const value = /** @type {Record<string, unknown>} */ (item)[id];
        if (typeof value !== 'string') return;
        if (seen.has(value)) diagnostics.push(diagnostic('DUPLICATE_STABLE_ID', `${pointer}/${index}/${id}`, `duplicate stable ID "${value}"`));
        seen.add(value);
      });
    }
  }
  return diagnostics;
}

/** @param {unknown} value @param {readonly string[]} segments @param {string} [pointer] @returns {Array<{items: unknown[], pointer: string}>} */
function findCollections(value, segments, pointer = '') {
  if (segments.length === 0) return Array.isArray(value) ? [{ items: value, pointer }] : [];
  const [segment, ...rest] = segments;
  if (segment === '*') {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item, index) => item && typeof item === 'object' && !Array.isArray(item)
      ? findCollections(/** @type {Record<string, unknown>} */ (item), rest, `${pointer}/${index}`) : []);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, segment)) return [];
  return findCollections(/** @type {Record<string, unknown>} */ (value)[segment], rest, `${pointer}/${segment}`);
}
