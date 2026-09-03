import { canonicalStringify } from './canonical.mjs';
import { STABLE_ID_COLLECTIONS } from './contracts.mjs';

const supportedKeywords = new Set([
  '$schema', '$id', 'type', 'required', 'properties', 'items', 'enum', 'const',
  'oneOf', 'allOf', 'minItems', 'minLength', 'pattern', 'minimum', 'maximum',
  'uniqueItems', 'additionalProperties'
]);
const supportedTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
const NATIVE_ARRAY_EVERY = Array.prototype.every;
const NATIVE_ARRAY_FILTER = Array.prototype.filter;
const NATIVE_ARRAY_FLAT_MAP = Array.prototype.flatMap;
const NATIVE_ARRAY_FOR_EACH = Array.prototype.forEach;
const NATIVE_ARRAY_JOIN = Array.prototype.join;
const NATIVE_ARRAY_MAP = Array.prototype.map;
const NATIVE_ARRAY_SLICE = Array.prototype.slice;
const NATIVE_ARRAY_SOME = Array.prototype.some;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;

/** @template T @param {T[]} values @param {(value:T,index:number,values:T[])=>boolean} predicate */
function everyArray(values, predicate) {
  return /** @type {boolean} */ (Reflect.apply(NATIVE_ARRAY_EVERY, values, [predicate]));
}

/** @template T @param {T[]} values @param {(value:T,index:number,values:T[])=>boolean} predicate */
function filterArray(values, predicate) {
  return /** @type {T[]} */ (Reflect.apply(NATIVE_ARRAY_FILTER, values, [predicate]));
}

/** @template T,U @param {T[]} values @param {(value:T,index:number,values:T[])=>U[]} project */
function flatMapArray(values, project) {
  return /** @type {U[]} */ (Reflect.apply(NATIVE_ARRAY_FLAT_MAP, values, [project]));
}

/** @template T @param {T[]} values @param {(value:T,index:number,values:T[])=>void} visit */
function forEachArray(values, visit) {
  Reflect.apply(NATIVE_ARRAY_FOR_EACH, values, [visit]);
}

/** @param {unknown[]} values @param {string} separator */
function joinArray(values, separator) {
  return /** @type {string} */ (Reflect.apply(NATIVE_ARRAY_JOIN, values, [separator]));
}

/** @template T,U @param {T[]} values @param {(value:T,index:number,values:T[])=>U} project */
function mapArray(values, project) {
  return /** @type {U[]} */ (Reflect.apply(NATIVE_ARRAY_MAP, values, [project]));
}

/** @template T @param {T[]} values @param {...T} items */
function pushArray(values, ...items) {
  for (let index = 0; index < items.length; index += 1) Reflect.apply(NATIVE_DEFINE_PROPERTY, Object, [
    values, String(values.length), { value: items[index], writable: true, enumerable: true, configurable: true }
  ]);
  return values.length;
}

/** @template T @param {T[]} values @param {number} start @param {number} [end] */
function sliceArray(values, start, end) {
  return /** @type {T[]} */ (Reflect.apply(NATIVE_ARRAY_SLICE, values, end === undefined ? [start] : [start, end]));
}

/** @template T @param {T[]} values @param {(value:T,index:number,values:T[])=>boolean} predicate */
function someArray(values, predicate) {
  return /** @type {boolean} */ (Reflect.apply(NATIVE_ARRAY_SOME, values, [predicate]));
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isSchemaObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {string} keyword */
function assertStringArray(value, keyword) {
  if (!Array.isArray(value) || someArray(value, (item) => typeof item !== 'string') || new Set(value).size !== value.length) {
    throw new Error(`Schema ${keyword} must be an array of unique strings.`);
  }
}

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'schema', code, path, message };
}

/** @param {string} segment */
function escapePointerSegment(segment) {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

/** @param {string} path @param {string} segment */
function childPointer(path, segment) {
  return `${path}/${escapePointerSegment(segment)}`;
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
      if (!types.length || someArray(types, (item) => typeof item !== 'string' || !supportedTypes.has(item)) || new Set(types).size !== types.length) throw new Error('Schema type must name supported unique types.');
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
      if (!Array.isArray(value) || value.length === 0 || new Set(mapArray(value, (item) => canonicalStringify(item))).size !== value.length) throw new Error('Schema enum must be a non-empty array of unique values.');
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
    return [diagnostic('TYPE_MISMATCH', pointer, `must be ${Array.isArray(schema.type) ? joinArray(schema.type, ' or ') : schema.type}`)];
  }
  if (Object.hasOwn(schema, 'const') && canonicalStringify(value) !== canonicalStringify(schema.const)) {
    pushArray(diagnostics, diagnostic('CONST_MISMATCH', pointer, 'must equal the schema constant'));
  }
  if (Array.isArray(schema.enum) && !someArray(schema.enum, (item) => canonicalStringify(item) === canonicalStringify(value))) {
    pushArray(diagnostics, diagnostic('ENUM_MISMATCH', pointer, 'must be one of the allowed values'));
  }
  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) pushArray(diagnostics, diagnostic('MIN_LENGTH', pointer, 'is shorter than the minimum length'));
    if (typeof schema.pattern === 'string' && !(new RegExp(schema.pattern)).test(value)) pushArray(diagnostics, diagnostic('PATTERN_MISMATCH', pointer, 'does not match the required pattern'));
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) pushArray(diagnostics, diagnostic('MINIMUM', pointer, 'is below the minimum'));
    if (typeof schema.maximum === 'number' && value > schema.maximum) pushArray(diagnostics, diagnostic('MAXIMUM', pointer, 'is above the maximum'));
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) pushArray(diagnostics, diagnostic('MIN_ITEMS', pointer, 'has too few items'));
    if (schema.uniqueItems === true) {
      const seen = new Set();
      forEachArray(value, (item, index) => {
        const key = canonicalStringify(item);
        if (seen.has(key)) pushArray(diagnostics, diagnostic('UNIQUE_ITEMS', `${path}/${index}`, 'must not contain duplicate items'));
        seen.add(key);
      });
    }
    if (schema.items && typeof schema.items === 'object' && !Array.isArray(schema.items)) {
      forEachArray(value, (item, index) => pushArray(diagnostics, ...validate(item, /** @type {Record<string, unknown>} */ (schema.items), `${path}/${index}`)));
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = /** @type {Record<string, unknown>} */ (value);
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? /** @type {Record<string, Record<string, unknown>>} */ (schema.properties) : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !Object.hasOwn(object, key)) pushArray(diagnostics, diagnostic('REQUIRED_FIELD_MISSING', childPointer(path, key), 'required field is missing'));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(properties, key)) pushArray(diagnostics, diagnostic('ADDITIONAL_PROPERTY', childPointer(path, key), 'additional properties are not allowed'));
      }
    } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !Array.isArray(schema.additionalProperties)) {
      for (const key of Object.keys(object)) {
        if (!Object.hasOwn(properties, key)) pushArray(diagnostics, ...validate(object[key], /** @type {Record<string, unknown>} */ (schema.additionalProperties), childPointer(path, key)));
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.hasOwn(object, key)) pushArray(diagnostics, ...validate(object[key], childSchema, childPointer(path, key)));
    }
  }
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) pushArray(diagnostics, ...validate(value, /** @type {Record<string, unknown>} */ (child), path));
  if (Array.isArray(schema.oneOf)) {
    const variants = mapArray(schema.oneOf, (child) => /** @type {Record<string, unknown>} */ (child));
    const matching = filterArray(variants, (child) => validate(value, child, path).length === 0);
    if (matching.length !== 1) {
      const discriminated = filterArray(variants, (child) => matchesDiscriminator(value, child));
      if (matching.length === 0 && discriminated.length === 1) pushArray(diagnostics, ...validate(value, discriminated[0], path));
      else pushArray(diagnostics, diagnostic('ONE_OF_MISMATCH', pointer, 'must match exactly one schema variant'));
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
  const constants = flatMapArray(Object.entries(properties), ([key, candidate]) => isSchemaObject(candidate) && Object.hasOwn(candidate, 'const') ? [[key, candidate]] : []);
  return constants.length > 0 && everyArray(constants, ([key, candidate]) => canonicalStringify(/** @type {Record<string, unknown>} */ (value)[key]) === canonicalStringify(candidate.const));
}

/** @param {unknown} value @param {unknown} type @returns {boolean} */
function matchesType(value, type) {
  if (Array.isArray(type)) return someArray(type, (candidate) => matchesType(value, candidate));
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
      const pointerSegments = filterArray(pointer.split('/'), Boolean);
      const scopedPointer = typeof scopeSegments === 'number' ? `/${joinArray(sliceArray(pointerSegments, 0, -scopeSegments), '/')}` : '';
      const namespaceKey = `${namespace ?? joinArray(path, '/')}${scopedPointer}`;
      const seen = seenByNamespace.get(namespaceKey) ?? new Set();
      seenByNamespace.set(namespaceKey, seen);
      forEachArray(items, (item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        const value = /** @type {Record<string, unknown>} */ (item)[id];
        if (typeof value !== 'string') return;
        if (seen.has(value)) pushArray(diagnostics, diagnostic('DUPLICATE_STABLE_ID', `${pointer}/${index}/${id}`, `duplicate stable ID "${value}"`));
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
    return flatMapArray(value, (item, index) => item && typeof item === 'object' && !Array.isArray(item)
      ? findCollections(/** @type {Record<string, unknown>} */ (item), rest, `${pointer}/${index}`) : []);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, segment)) return [];
  return findCollections(/** @type {Record<string, unknown>} */ (value)[segment], rest, `${pointer}/${segment}`);
}
