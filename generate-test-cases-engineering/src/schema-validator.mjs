import { canonicalStringify } from './canonical.mjs';

const supportedKeywords = new Set([
  '$schema', '$id', '$defs', '$ref', 'type', 'required', 'properties', 'items', 'enum', 'const',
  'oneOf', 'allOf', 'not', 'minItems', 'maxItems', 'prefixItems', 'minLength', 'pattern', 'minimum', 'maximum',
  'uniqueItems', 'additionalProperties', 'unevaluatedProperties'
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
const NATIVE_HAS_OWN = Object.hasOwn;

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
    if (key === '$schema' || key === '$id' || key === 'pattern' || key === '$ref') {
      if (typeof value !== 'string') throw new Error(`Schema ${key} must be a string.`);
      if (key === 'pattern') { try { new RegExp(value); } catch { throw new Error('Schema pattern must be a valid regular expression.'); } }
      if (key === '$ref' && !value.startsWith('#/$defs/')) throw new Error('Schema $ref must be a local $defs reference.');
    } else if (key === '$defs') {
      if (!isSchemaObject(value)) throw new Error('Schema $defs must be an object.');
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === 'type') {
      const types = Array.isArray(value) ? value : [value];
      if (!types.length || someArray(types, (item) => typeof item !== 'string' || !supportedTypes.has(item)) || new Set(types).size !== types.length) throw new Error('Schema type must name supported unique types.');
    } else if (key === 'required') {
      assertStringArray(value, 'required');
    } else if (key === 'properties') {
      if (!isSchemaObject(value)) throw new Error('Schema properties must be an object.');
      for (const child of Object.values(value)) assertSupportedSchema(child);
    } else if (key === 'items') {
      if (typeof value !== 'boolean') assertSupportedSchema(value);
    } else if (key === 'not') {
      assertSupportedSchema(value);
    } else if (key === 'oneOf' || key === 'allOf' || key === 'prefixItems') {
      if (!Array.isArray(value) || value.length === 0) throw new Error(`Schema ${key} must be a non-empty array of schema objects.`);
      for (const child of value) assertSupportedSchema(child);
    } else if (key === 'enum') {
      if (!Array.isArray(value) || value.length === 0 || new Set(mapArray(value, (item) => canonicalStringify(item))).size !== value.length) throw new Error('Schema enum must be a non-empty array of unique values.');
    } else if (key === 'minItems' || key === 'maxItems' || key === 'minLength') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`Schema ${key} must be a non-negative integer.`);
    } else if (key === 'minimum' || key === 'maximum') {
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Schema ${key} must be a finite number.`);
    } else if (key === 'uniqueItems') {
      if (typeof value !== 'boolean') throw new Error('Schema uniqueItems must be boolean.');
    } else if (key === 'additionalProperties' || key === 'unevaluatedProperties') {
      if (typeof value !== 'boolean' && !isSchemaObject(value)) throw new Error(`Schema ${key} must be boolean or a schema object.`);
      if (isSchemaObject(value)) assertSupportedSchema(value);
    }
  }
  if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number' && schema.minimum > schema.maximum) throw new Error('Schema minimum must not exceed maximum.');
}

/** @param {unknown} value @param {unknown} schema */
export function validateAgainstSchema(value, schema) {
  assertSupportedSchema(schema);
  return validate(
    value,
    /** @type {Record<string, unknown>} */ (schema),
    '',
    /** @type {Record<string, unknown>} */ (schema)
  );
}

/** @param {Record<string, unknown>} root @param {string} reference */
function resolveReference(root, reference) {
  const segments = mapArray(
    reference.slice(2).split('/'),
    (part) => part.replaceAll('~1', '/').replaceAll('~0', '~')
  );
  /** @type {unknown} */
  let current = root;
  for (const segment of segments) {
    if (!isSchemaObject(current) || !NATIVE_HAS_OWN(current, segment)) throw new Error(`Schema reference does not exist: ${reference}`);
    current = current[segment];
  }
  if (!isSchemaObject(current)) throw new Error(`Schema reference is not an object: ${reference}`);
  return current;
}

/** @param {unknown} value @param {Record<string, unknown>} schema @param {string} path @param {Record<string, unknown>} root @param {Set<string>} [parentEvaluatedProperties] */
function validate(value, schema, path, root, parentEvaluatedProperties) {
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];
  // Annotations are instance-local and only successful schemas contribute them.
  // Child property validation must not leak its nested keys into this object.
  const evaluatedProperties = new Set();
  const pointer = path || '/';
  if (typeof schema.$ref === 'string') pushArray(
    diagnostics,
    ...validate(value, resolveReference(root, schema.$ref), path, root, evaluatedProperties)
  );
  if (schema.type && !matchesType(value, schema.type)) {
    return [diagnostic('TYPE_MISMATCH', pointer, `must be ${Array.isArray(schema.type) ? joinArray(schema.type, ' or ') : schema.type}`)];
  }
  if (NATIVE_HAS_OWN(schema, 'const') && canonicalStringify(value) !== canonicalStringify(schema.const)) {
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
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) pushArray(diagnostics, diagnostic('MAX_ITEMS', pointer, 'has too many items'));
    if (schema.uniqueItems === true) {
      const seen = new Set();
      forEachArray(value, (item, index) => {
        const key = canonicalStringify(item);
        if (seen.has(key)) pushArray(diagnostics, diagnostic('UNIQUE_ITEMS', `${path}/${index}`, 'must not contain duplicate items'));
        seen.add(key);
      });
    }
    const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    forEachArray(value, (item, index) => {
      if (index < prefixItems.length) {
        pushArray(diagnostics, ...validate(item, /** @type {Record<string, unknown>} */ (prefixItems[index]), `${path}/${index}`, root));
      } else if (schema.items === false) {
        pushArray(diagnostics, diagnostic('ADDITIONAL_ITEM', `${path}/${index}`, 'additional items are not allowed'));
      } else if (isSchemaObject(schema.items)) {
        pushArray(diagnostics, ...validate(item, schema.items, `${path}/${index}`, root));
      }
    });
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const object = /** @type {Record<string, unknown>} */ (value);
    const properties = schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? /** @type {Record<string, Record<string, unknown>>} */ (schema.properties) : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !NATIVE_HAS_OWN(object, key)) pushArray(diagnostics, diagnostic('REQUIRED_FIELD_MISSING', childPointer(path, key), 'required field is missing'));
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!NATIVE_HAS_OWN(properties, key)) pushArray(diagnostics, diagnostic('ADDITIONAL_PROPERTY', childPointer(path, key), 'additional properties are not allowed'));
      }
    } else if (schema.additionalProperties === true || isSchemaObject(schema.additionalProperties)) {
      for (const key of Object.keys(object)) {
        if (!NATIVE_HAS_OWN(properties, key)) {
          evaluatedProperties.add(key);
          if (isSchemaObject(schema.additionalProperties)) pushArray(diagnostics, ...validate(object[key], schema.additionalProperties, childPointer(path, key), root));
        }
      }
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (NATIVE_HAS_OWN(object, key)) {
        evaluatedProperties.add(key);
        pushArray(diagnostics, ...validate(object[key], childSchema, childPointer(path, key), root));
      }
    }
  }
  if (Array.isArray(schema.allOf)) for (const child of schema.allOf) pushArray(diagnostics, ...validate(value, /** @type {Record<string, unknown>} */ (child), path, root, evaluatedProperties));
  if (Array.isArray(schema.oneOf)) {
    const variants = mapArray(schema.oneOf, (child) => {
      const variantSchema = /** @type {Record<string, unknown>} */ (child);
      const variantEvaluatedProperties = new Set();
      return {
        schema: variantSchema,
        diagnostics: validate(value, variantSchema, path, root, variantEvaluatedProperties),
        evaluatedProperties: variantEvaluatedProperties
      };
    });
    const matching = filterArray(variants, (child) => child.diagnostics.length === 0);
    if (matching.length === 1) {
      for (const key of matching[0].evaluatedProperties) evaluatedProperties.add(key);
    } else {
      const discriminated = filterArray(variants, (child) => matchesDiscriminator(value, child.schema, root));
      if (matching.length === 0 && discriminated.length === 1) pushArray(diagnostics, ...discriminated[0].diagnostics);
      else pushArray(diagnostics, diagnostic('ONE_OF_MISMATCH', pointer, 'must match exactly one schema variant'));
    }
  }
  if (isSchemaObject(schema.not) && validate(value, schema.not, path, root).length === 0) {
    pushArray(diagnostics, diagnostic('NOT_MATCHED', pointer, 'must not match the prohibited schema'));
  }
  if (isSchemaObject(value) && NATIVE_HAS_OWN(schema, 'unevaluatedProperties')) {
    for (const key of Object.keys(value)) {
      if (evaluatedProperties.has(key)) continue;
      if (schema.unevaluatedProperties === false) {
        pushArray(diagnostics, diagnostic('UNEVALUATED_PROPERTY', childPointer(path, key), 'unevaluated properties are not allowed'));
      } else {
        evaluatedProperties.add(key);
        if (isSchemaObject(schema.unevaluatedProperties)) pushArray(diagnostics, ...validate(value[key], schema.unevaluatedProperties, childPointer(path, key), root));
      }
    }
  }
  if (diagnostics.length === 0 && parentEvaluatedProperties) {
    for (const key of evaluatedProperties) parentEvaluatedProperties.add(key);
  }
  return diagnostics;
}

/** @param {unknown} value @param {Record<string, unknown>} schema @param {Record<string, unknown>} root */
function matchesDiscriminator(value, schema, root) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (typeof schema.$ref === 'string') return matchesDiscriminator(
    value, resolveReference(root, schema.$ref), root
  );
  const properties = schema.properties;
  if (!isSchemaObject(properties)) return false;
  /** @type {Array<[string, Record<string, unknown>]>} */
  const constants = flatMapArray(Object.entries(properties), ([key, candidate]) => isSchemaObject(candidate) && NATIVE_HAS_OWN(candidate, 'const') ? [[key, candidate]] : []);
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
  void artifact;
  return [];
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
  if (!value || typeof value !== 'object' || Array.isArray(value) || !NATIVE_HAS_OWN(value, segment)) return [];
  return findCollections(/** @type {Record<string, unknown>} */ (value)[segment], rest, `${pointer}/${segment}`);
}
