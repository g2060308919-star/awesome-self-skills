import behaviorViewsSchema from '../skill/generate-test-cases/scripts/schemas/behavior-views.schema.json' with { type: 'json' };
import caseDraftsSchema from '../skill/generate-test-cases/scripts/schemas/case-drafts.schema.json' with { type: 'json' };
import evidenceClaimsSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { canonicalStringify, digest, stableId } from './canonical.mjs';
import { evaluateClarification } from './clarification.mjs';
import { classifyCaseDrafts } from './classify.mjs';
import { buildBundle, BundleReconciliationError } from './coverage.mjs';
import { scopeContains } from './decision-record.mjs';
import { validateEvidenceGraph } from './evidence.mjs';
import {
  compileObligations, ObligationCompilationError
} from './obligations/compile-obligations.mjs';
import { renderMarkdown, BundleRenderError } from './render-markdown.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from './schema-validator.mjs';
import { resolveSourcePolicy } from './source-policy.mjs';
import { auditInteractionMatrix } from './views/interaction-matrix.mjs';
import { validateBehaviorViews } from './views/validate-views.mjs';

/** @typedef {{category:string,code:string,path:string,message:string,related_id?:string}} Diagnostic */

const INPUT_KEYS = Object.freeze([
  'schema_version', 'source_revision', 'compiler_version', 'lineage',
  'source_pack', 'evidence_claims', 'behavior_views', 'obligation_compilation',
  'case_drafts', 'clarification', 'limits', 'expert_recall_limits'
]);
const COMPILATION_KEYS = Object.freeze([
  'contexts_by_view_id', 'custom_obligations', 'fact_routes', 'not_applicable_reviews'
]);
const CLARIFICATION_KEYS = Object.freeze(['append_batch', 'prior_state']);
const DIAGNOSTIC_LIMIT = 256;
const NATIVE_ARRAY = Array;
const NATIVE_NUMBER = Number;
const NATIVE_NUMBER_IS_FINITE = Number.isFinite;
const NATIVE_NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;
const NATIVE_OBJECT = Object;
const NATIVE_OBJECT_PROTOTYPE = Object.prototype;
const NATIVE_SYMBOL = Symbol;
const NATIVE_SYMBOL_ITERATOR = Symbol.iterator;
const NATIVE_ARRAY_PROTOTYPE = Array.prototype;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_ARRAY_ITERATOR = (/** @type {any} */ (Array.prototype))[NATIVE_SYMBOL_ITERATOR];
const NATIVE_ARRAY_JOIN = Array.prototype.join;
const NATIVE_ARRAY_FILTER = Array.prototype.filter;
const NATIVE_ARRAY_FLAT_MAP = Array.prototype.flatMap;
const NATIVE_ARRAY_MAP = Array.prototype.map;
const NATIVE_ARRAY_SLICE = Array.prototype.slice;
const NATIVE_ARRAY_SOME = Array.prototype.some;
const NATIVE_ARRAY_SORT = Array.prototype.sort;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const NATIVE_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const NATIVE_HAS_OWN = Object.hasOwn;
const NATIVE_MAP = Map;
const NATIVE_MAP_GET = Map.prototype.get;
const NATIVE_MAP_SET = Map.prototype.set;
const NATIVE_MAP_HAS = Map.prototype.has;
const NATIVE_MAP_DELETE = Map.prototype.delete;
const NATIVE_MAP_FOR_EACH = Map.prototype.forEach;
const NATIVE_MAP_ITERATOR = (/** @type {any} */ (Map.prototype))[NATIVE_SYMBOL_ITERATOR];
const NATIVE_MAP_PROTOTYPE = Map.prototype;
const NATIVE_SET = Set;
const NATIVE_SET_ADD = Set.prototype.add;
const NATIVE_SET_HAS = Set.prototype.has;
const NATIVE_SET_DELETE = Set.prototype.delete;
const NATIVE_SET_ITERATOR = (/** @type {any} */ (Set.prototype))[NATIVE_SYMBOL_ITERATOR];
const NATIVE_SET_FOR_EACH = Set.prototype.forEach;
const NATIVE_SET_PROTOTYPE = Set.prototype;
const NATIVE_STRING = String;
const NATIVE_STRING_CODE_POINT_AT = String.prototype.codePointAt;
const NATIVE_STRING_TRIM = String.prototype.trim;
const NATIVE_STRING_INCLUDES = String.prototype.includes;
const NATIVE_STRING_SPLIT = String.prototype.split;
const NATIVE_STRING_ITERATOR = (/** @type {any} */ (String.prototype))[NATIVE_SYMBOL_ITERATOR];
const NATIVE_STRING_PROTOTYPE = String.prototype;
const NATIVE_GLOBAL_THIS = globalThis;
const NATIVE_WEAK_MAP = WeakMap;
const NATIVE_WEAK_MAP_GET = WeakMap.prototype.get;
const NATIVE_WEAK_MAP_SET = WeakMap.prototype.set;
const NATIVE_OBJECT_CREATE = Object.create;
const NATIVE_OBJECT_ENTRIES = Object.entries;
const NATIVE_OBJECT_KEYS = Object.keys;
const NATIVE_REFLECT_APPLY = Reflect.apply;
const NATIVE_REFLECT_OWN_KEYS = Reflect.ownKeys;
const NATIVE_STRUCTURED_CLONE = structuredClone;

/** @template T @param {T[]} values @param {(value:T,index:number,values:T[])=>boolean} predicate */
function filterArray(values, predicate) {
  return /** @type {T[]} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_FILTER, values, [predicate]));
}

/** @template T,U @param {T[]} values @param {(value:T,index:number,values:T[])=>U[]} project */
function flatMapArray(values, project) {
  return /** @type {U[]} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_FLAT_MAP, values, [project]));
}

/** @template T,U @param {T[]} values @param {(value:T,index:number,values:T[])=>U} project */
function mapArray(values, project) {
  return /** @type {U[]} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_MAP, values, [project]));
}

/** @template T @param {T[]} values @param {...T} items */
function pushArray(values, ...items) {
  for (let index = 0; index < items.length; index += 1) NATIVE_DEFINE_PROPERTY(
    values, String(values.length), {
      value: items[index], enumerable: true, writable: true, configurable: true
    }
  );
  return values.length;
}

/** @template T @param {T[]} target @param {T[]} source */
function appendArray(target, source) {
  for (let index = 0; index < source.length; index += 1) pushArray(target, source[index]);
}

/** @template T @param {T[]} values @param {number} start @param {number} [end] */
function sliceArray(values, start, end) {
  return /** @type {T[]} */ (NATIVE_REFLECT_APPLY(
    NATIVE_ARRAY_SLICE, values, end === undefined ? [start] : [start, end]
  ));
}

/** @template T @param {T[]} values @param {(value:T,index:number,values:T[])=>boolean} predicate */
function someArray(values, predicate) {
  return /** @type {boolean} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SOME, values, [predicate]));
}

/** @param {unknown[]} values @param {string} separator */
function joinArray(values, separator) {
  return /** @type {string} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_JOIN, values, [separator]));
}

/** @template T @param {T[]} values @param {(left:T,right:T)=>number} comparator */
function sortArray(values, comparator) {
  return /** @type {T[]} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SORT, values, [comparator]));
}

/** @param {unknown} value */
function toNumber(value) {
  return /** @type {number} */ (NATIVE_REFLECT_APPLY(NATIVE_NUMBER, undefined, [value]));
}

/** @param {unknown} value */
function numberIsFinite(value) {
  return /** @type {boolean} */ (NATIVE_REFLECT_APPLY(
    NATIVE_NUMBER_IS_FINITE, NATIVE_NUMBER, [value]
  ));
}

/** @param {unknown} value */
function numberIsSafeInteger(value) {
  return /** @type {boolean} */ (NATIVE_REFLECT_APPLY(
    NATIVE_NUMBER_IS_SAFE_INTEGER, NATIVE_NUMBER, [value]
  ));
}

/** @template K,V @param {Map<K,V>} values @param {(value:V,key:K)=>void} visit */
function forEachMap(values, visit) {
  NATIVE_REFLECT_APPLY(NATIVE_MAP_FOR_EACH, values, [visit]);
}

/** @template T @param {Set<T>} values @param {(value:T)=>void} visit */
function forEachSet(values, visit) {
  NATIVE_REFLECT_APPLY(NATIVE_SET_FOR_EACH, values, [visit]);
}

/** @template K,V @param {Map<K,V>} values @param {K} key */
function mapGet(values, key) {
  return /** @type {V|undefined} */ (NATIVE_REFLECT_APPLY(NATIVE_MAP_GET, values, [key]));
}

/** @template K,V @param {Map<K,V>} values @param {K} key @param {V} value */
function mapSet(values, key, value) {
  NATIVE_REFLECT_APPLY(NATIVE_MAP_SET, values, [key, value]);
}

/** @template K,V @param {Map<K,V>} values @param {K} key */
function mapHas(values, key) {
  return /** @type {boolean} */ (NATIVE_REFLECT_APPLY(NATIVE_MAP_HAS, values, [key]));
}

/** @template K,V @param {Map<K,V>} values @param {K} key */
function mapDelete(values, key) {
  return /** @type {boolean} */ (NATIVE_REFLECT_APPLY(NATIVE_MAP_DELETE, values, [key]));
}

/** @template T @param {Set<T>} values @param {T} value */
function setAdd(values, value) {
  NATIVE_REFLECT_APPLY(NATIVE_SET_ADD, values, [value]);
}

/** @template T @param {Set<T>} values @param {T} value */
function setHas(values, value) {
  return /** @type {boolean} */ (NATIVE_REFLECT_APPLY(NATIVE_SET_HAS, values, [value]));
}

/** @template T @param {Set<T>} values @param {T} value */
function setDelete(values, value) {
  return /** @type {boolean} */ (NATIVE_REFLECT_APPLY(NATIVE_SET_DELETE, values, [value]));
}

/** @template K,V @param {WeakMap<object,V>} values @param {object} key */
function weakMapGet(values, key) {
  return /** @type {V|undefined} */ (NATIVE_REFLECT_APPLY(NATIVE_WEAK_MAP_GET, values, [key]));
}

/** @template K,V @param {WeakMap<object,V>} values @param {object} key @param {V} value */
function weakMapSet(values, key, value) {
  NATIVE_REFLECT_APPLY(NATIVE_WEAK_MAP_SET, values, [key, value]);
}

/** @template K,V @param {Array<[K,V]>} [entries] */
function makeMap(entries = []) {
  /** @type {Map<K,V>} */
  const output = new NATIVE_MAP();
  for (let index = 0; index < entries.length; index += 1) {
    mapSet(output, entries[index][0], entries[index][1]);
  }
  return output;
}

/** @template T @param {T[]} [items] */
function makeSet(items = []) {
  /** @type {Set<T>} */
  const output = new NATIVE_SET();
  for (let index = 0; index < items.length; index += 1) setAdd(output, items[index]);
  return output;
}

const POLICIES = makeSet(['pause_for_clarification', 'record_only']);

/** @template K,V @param {Map<K,V>} values */
function mapValuesArray(values) {
  /** @type {V[]} */
  const output = [];
  forEachMap(values, (value) => pushArray(output, value));
  return output;
}

/** @template K,V @param {Map<K,V>} values */
function mapKeysArray(values) {
  /** @type {K[]} */
  const output = [];
  forEachMap(values, (_value, key) => pushArray(output, key));
  return output;
}

/** @template T @param {Set<T>} values */
function setValuesArray(values) {
  /** @type {T[]} */
  const output = [];
  forEachSet(values, (value) => pushArray(output, value));
  return output;
}

/** @param {string[]} left @param {string[]} right */
function unionSortedStrings(left, right) {
  const unique = makeSet();
  for (let index = 0; index < left.length; index += 1) setAdd(unique, left[index]);
  for (let index = 0; index < right.length; index += 1) setAdd(unique, right[index]);
  return sortArray(setValuesArray(unique), compareCodePoints);
}

function intrinsicIntegrityDiagnostic() {
  try {
    const globalArrayDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, 'Array');
    const globalSetDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, 'Set');
    const globalMapDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, 'Map');
    const globalStringDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, 'String');
    const globalNumberDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, 'Number');
    const globalObjectDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, 'Object');
    const globalSymbolDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_GLOBAL_THIS, 'Symbol');
    const iteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_ARRAY_PROTOTYPE, NATIVE_SYMBOL_ITERATOR
    );
    const sortDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_ARRAY_PROTOTYPE, 'sort');
    const joinDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_ARRAY_PROTOTYPE, 'join');
    const zeroDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_ARRAY_PROTOTYPE, '0');
    const setIteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_SET_PROTOTYPE, NATIVE_SYMBOL_ITERATOR
    );
    const setAddDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, 'add');
    const setHasDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, 'has');
    const setDeleteDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, 'delete');
    const setForEachDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_SET_PROTOTYPE, 'forEach');
    const mapIteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_MAP_PROTOTYPE, NATIVE_SYMBOL_ITERATOR
    );
    const mapGetDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, 'get');
    const mapSetDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, 'set');
    const mapHasDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, 'has');
    const mapDeleteDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, 'delete');
    const mapForEachDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_MAP_PROTOTYPE, 'forEach');
    const stringIteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE, NATIVE_SYMBOL_ITERATOR
    );
    const stringTrimDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE, 'trim'
    );
    const stringIncludesDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE, 'includes'
    );
    const stringSplitDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_STRING_PROTOTYPE, 'split'
    );
    if (globalArrayDescriptor && NATIVE_HAS_OWN(globalArrayDescriptor, 'value')
      && globalArrayDescriptor.value === NATIVE_ARRAY
      && globalSetDescriptor && NATIVE_HAS_OWN(globalSetDescriptor, 'value')
      && globalSetDescriptor.value === NATIVE_SET
      && globalMapDescriptor && NATIVE_HAS_OWN(globalMapDescriptor, 'value')
      && globalMapDescriptor.value === NATIVE_MAP
      && globalStringDescriptor && NATIVE_HAS_OWN(globalStringDescriptor, 'value')
      && globalStringDescriptor.value === NATIVE_STRING
      && globalNumberDescriptor && NATIVE_HAS_OWN(globalNumberDescriptor, 'value')
      && globalNumberDescriptor.value === NATIVE_NUMBER
      && globalObjectDescriptor && NATIVE_HAS_OWN(globalObjectDescriptor, 'value')
      && globalObjectDescriptor.value === NATIVE_OBJECT
      && globalSymbolDescriptor && NATIVE_HAS_OWN(globalSymbolDescriptor, 'value')
      && globalSymbolDescriptor.value === NATIVE_SYMBOL
      && iteratorDescriptor && NATIVE_HAS_OWN(iteratorDescriptor, 'value')
      && iteratorDescriptor.value === NATIVE_ARRAY_ITERATOR
      && sortDescriptor && NATIVE_HAS_OWN(sortDescriptor, 'value')
      && sortDescriptor.value === NATIVE_ARRAY_SORT
      && joinDescriptor && NATIVE_HAS_OWN(joinDescriptor, 'value')
      && joinDescriptor.value === NATIVE_ARRAY_JOIN
      && zeroDescriptor === undefined
      && setIteratorDescriptor && NATIVE_HAS_OWN(setIteratorDescriptor, 'value')
      && setIteratorDescriptor.value === NATIVE_SET_ITERATOR
      && setAddDescriptor && NATIVE_HAS_OWN(setAddDescriptor, 'value')
      && setAddDescriptor.value === NATIVE_SET_ADD
      && setHasDescriptor && NATIVE_HAS_OWN(setHasDescriptor, 'value')
      && setHasDescriptor.value === NATIVE_SET_HAS
      && setDeleteDescriptor && NATIVE_HAS_OWN(setDeleteDescriptor, 'value')
      && setDeleteDescriptor.value === NATIVE_SET_DELETE
      && setForEachDescriptor && NATIVE_HAS_OWN(setForEachDescriptor, 'value')
      && setForEachDescriptor.value === NATIVE_SET_FOR_EACH
      && mapIteratorDescriptor && NATIVE_HAS_OWN(mapIteratorDescriptor, 'value')
      && mapIteratorDescriptor.value === NATIVE_MAP_ITERATOR
      && mapGetDescriptor && NATIVE_HAS_OWN(mapGetDescriptor, 'value')
      && mapGetDescriptor.value === NATIVE_MAP_GET
      && mapSetDescriptor && NATIVE_HAS_OWN(mapSetDescriptor, 'value')
      && mapSetDescriptor.value === NATIVE_MAP_SET
      && mapHasDescriptor && NATIVE_HAS_OWN(mapHasDescriptor, 'value')
      && mapHasDescriptor.value === NATIVE_MAP_HAS
      && mapDeleteDescriptor && NATIVE_HAS_OWN(mapDeleteDescriptor, 'value')
      && mapDeleteDescriptor.value === NATIVE_MAP_DELETE
      && mapForEachDescriptor && NATIVE_HAS_OWN(mapForEachDescriptor, 'value')
      && mapForEachDescriptor.value === NATIVE_MAP_FOR_EACH
      && stringIteratorDescriptor && NATIVE_HAS_OWN(stringIteratorDescriptor, 'value')
      && stringIteratorDescriptor.value === NATIVE_STRING_ITERATOR
      && stringTrimDescriptor && NATIVE_HAS_OWN(stringTrimDescriptor, 'value')
      && stringTrimDescriptor.value === NATIVE_STRING_TRIM
      && stringIncludesDescriptor && NATIVE_HAS_OWN(stringIncludesDescriptor, 'value')
      && stringIncludesDescriptor.value === NATIVE_STRING_INCLUDES
      && stringSplitDescriptor && NATIVE_HAS_OWN(stringSplitDescriptor, 'value')
      && stringSplitDescriptor.value === NATIVE_STRING_SPLIT) return null;
  } catch {
    // Fall through to a stable fail-closed diagnostic.
  }
  return diagnostic(
    'schema', 'CORE_INTRINSIC_INVALID', '/intrinsics',
    'pure-core evaluation requires captured native collection and string traversal intrinsics'
  );
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  if (!value || typeof value !== 'object' || NATIVE_ARRAY_IS_ARRAY(value)) return false;
  const prototype = NATIVE_GET_PROTOTYPE_OF(value);
  return prototype === NATIVE_OBJECT_PROTOTYPE || prototype === null;
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = toNumber(NATIVE_REFLECT_APPLY(
      NATIVE_STRING_CODE_POINT_AT, left, [leftIndex]
    ));
    const rightPoint = toNumber(NATIVE_REFLECT_APPLY(
      NATIVE_STRING_CODE_POINT_AT, right, [rightIndex]
    ));
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
    leftIndex += leftPoint > 0xffff ? 2 : 1;
    rightIndex += rightPoint > 0xffff ? 2 : 1;
  }
  return leftIndex < left.length ? 1 : rightIndex < right.length ? -1 : 0;
}

/** @param {string} category @param {string} code @param {string} path @param {string} message */
function diagnostic(category, code, path, message) {
  return { category, code, path, message };
}

/** @param {unknown} value */
function diagnosticArray(value) {
  if (!NATIVE_ARRAY_IS_ARRAY(value)) return [];
  return flatMapArray(value, (item) => isRecord(item)
    && typeof item.category === 'string' && typeof item.code === 'string'
    && typeof item.path === 'string' && typeof item.message === 'string'
    ? [{
      category: item.category, code: item.code, path: item.path, message: item.message,
      ...(typeof item.related_id === 'string' ? { related_id: item.related_id } : {})
    }] : []);
}

/** @param {Diagnostic[]} diagnostics */
function finalizeDiagnostics(diagnostics) {
  const unique = makeMap();
  let overflow = false;
  for (let index = 0; index < diagnostics.length; index += 1) {
    const item = diagnostics[index];
    if (item.code === 'DIAGNOSTICS_TRUNCATED') overflow = true;
    else mapSet(unique, canonicalStringify(item), item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT) overflow = true;
  const ordered = sortArray(mapValuesArray(unique), (left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.related_id ?? '', right.related_id ?? '')
    || compareCodePoints(left.message, right.message));
  if (!overflow) return ordered;
  const retained = sliceArray(ordered, 0, DIAGNOSTIC_LIMIT - 1);
  pushArray(retained, diagnostic(
    'classification', 'DIAGNOSTICS_TRUNCATED', '/',
    `diagnostics are bounded at ${DIAGNOSTIC_LIMIT} entries`
  ));
  return sortArray(retained, (left, right) =>
    compareCodePoints(left.category, right.category)
    || compareCodePoints(left.code, right.code)
    || compareCodePoints(left.path, right.path)
    || compareCodePoints(left.related_id ?? '', right.related_id ?? '')
    || compareCodePoints(left.message, right.message));
}

/** @param {string} stage @param {number} sourceRevision @param {Diagnostic[]} diagnostics */
function revisionRequired(stage, sourceRevision, diagnostics) {
  return {
    status: 'need_revision', stage, source_revision: sourceRevision,
    diagnostics: finalizeDiagnostics(diagnostics)
  };
}

/** @param {Record<string, unknown>} value @param {readonly string[]} expected @param {string} path @param {Diagnostic[]} diagnostics */
function requireClosed(value, expected, path, diagnostics) {
  const allowed = makeSet();
  for (let index = 0; index < expected.length; index += 1) setAdd(allowed, expected[index]);
  const actualKeys = NATIVE_OBJECT_KEYS(value);
  for (let index = 0; index < actualKeys.length; index += 1) {
    const key = actualKeys[index];
    if (!setHas(allowed, key)) pushArray(diagnostics, diagnostic(
      'schema', 'CORE_PROPERTY_UNKNOWN', `${path}/${key}`, 'pure-core input contains a property outside its closed revision contract'
    ));
  }
  for (let index = 0; index < expected.length; index += 1) {
    const key = expected[index];
    if (!NATIVE_HAS_OWN(value, key)) pushArray(diagnostics, diagnostic(
      'schema', 'CORE_PROPERTY_MISSING', `${path}/${key}`, 'pure-core input is missing a required revision property'
    ));
  }
}

/** @param {unknown} value */
function strings(value) {
  return NATIVE_ARRAY_IS_ARRAY(value)
    ? /** @type {string[]} */ (filterArray(value, (item) => typeof item === 'string')) : [];
}

/** @param {unknown} value */
function records(value) {
  return NATIVE_ARRAY_IS_ARRAY(value)
    ? /** @type {Record<string, unknown>[]} */ (filterArray(value, isRecord)) : [];
}

/** @param {string} value */
function pointerPart(value) {
  let output = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    output += character === '~' ? '~0' : character === '/' ? '~1' : character;
  }
  return output;
}

/**
 * Capture submitted JSON-shaped data exactly once through own data descriptors.
 * The snapshot has inert null-prototype records and fresh native arrays, so all
 * later stages operate on trusted data without invoking submitted behavior.
 * @param {unknown} submitted
 * @param {string} rootPath
 */
function snapshotOwnData(submitted, rootPath) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const root = NATIVE_OBJECT_CREATE(null);
  /** @type {Array<{source:unknown,path:string,assign:(value:unknown)=>void}>} */
  const pending = [{
    source: submitted, path: rootPath,
    assign(value) { NATIVE_DEFINE_PROPERTY(root, 'value', { value, enumerable: true }); }
  }];
  const seen = new NATIVE_WEAK_MAP();
  let cursor = 0;
  while (cursor < pending.length) {
    const frame = pending[cursor++];
    const source = frame.source;
    if (source === null || typeof source === 'string' || typeof source === 'boolean'
      || (typeof source === 'number' && numberIsFinite(source))) {
      frame.assign(source);
      continue;
    }
    if (!source || typeof source !== 'object') {
      pushArray(diagnostics, diagnostic(
        'schema', 'CORE_VALUE_INVALID', frame.path || '/',
        'pure-core input values must be finite JSON own-data values'
      ));
      frame.assign(null);
      continue;
    }
    const cached = weakMapGet(seen, source);
    if (cached !== undefined) {
      frame.assign(cached);
      continue;
    }
    let prototype;
    let descriptors;
    let keys;
    let array;
    try {
      prototype = NATIVE_GET_PROTOTYPE_OF(source);
      descriptors = NATIVE_GET_OWN_PROPERTY_DESCRIPTORS(source);
      keys = NATIVE_REFLECT_OWN_KEYS(descriptors);
      array = NATIVE_ARRAY_IS_ARRAY(source);
    } catch {
      pushArray(diagnostics, diagnostic(
        'schema', 'CORE_INPUT_UNREADABLE', frame.path || '/',
        'pure-core input must expose a stable own-data descriptor snapshot'
      ));
      frame.assign(null);
      continue;
    }
    if (array ? prototype !== NATIVE_ARRAY_PROTOTYPE
      : prototype !== NATIVE_OBJECT_PROTOTYPE && prototype !== null) {
      pushArray(diagnostics, diagnostic(
        'schema', 'CORE_PROTOTYPE_INVALID', frame.path || '/',
        'pure-core input containers must use native JSON prototypes'
      ));
      frame.assign(null);
      continue;
    }
    /** @type {string[]} */
    const stringKeys = [];
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key === 'symbol') pushArray(diagnostics, diagnostic(
        'schema', 'CORE_SYMBOL_PROPERTY_INVALID', frame.path || '/',
        'pure-core input containers cannot define symbol properties'
      ));
      else pushArray(stringKeys, key);
    }
    sortArray(stringKeys, compareCodePoints);
    if (array) {
      const lengthDescriptor = descriptors.length;
      const declaredLength = toNumber(lengthDescriptor?.value);
      /** @type {string[]} */
      const numericKeys = [];
      let malformed = !numberIsSafeInteger(declaredLength) || declaredLength < 0;
      for (let keyIndex = 0; keyIndex < stringKeys.length; keyIndex += 1) {
        const key = stringKeys[keyIndex];
        if (key === 'length') continue;
        if (/^(0|[1-9][0-9]*)$/u.test(key) && toNumber(key) < 4294967295) {
          pushArray(numericKeys, key);
        }
        else {
          malformed = true;
          pushArray(diagnostics, diagnostic(
            'schema', 'CORE_ARRAY_PROPERTY_INVALID', `${frame.path}/${pointerPart(key)}`,
            'controlled arrays cannot define named properties'
          ));
        }
      }
      sortArray(numericKeys, (left, right) => toNumber(left) - toNumber(right));
      let firstHole = -1;
      if (!malformed && numericKeys.length !== declaredLength) {
        let expected = 0;
        for (let index = 0; index < numericKeys.length; index += 1) {
          const actual = toNumber(numericKeys[index]);
          if (actual !== expected) { firstHole = expected; break; }
          expected += 1;
        }
        if (firstHole < 0) firstHole = numericKeys.length;
      }
      if (firstHole >= 0) {
        malformed = true;
        pushArray(diagnostics, diagnostic(
          'schema', 'CORE_ARRAY_HOLE', `${frame.path}/${firstHole}`,
          'controlled arrays must be dense'
        ));
      }
      if (malformed) {
        frame.assign(new NATIVE_ARRAY());
        continue;
      }
      const target = new NATIVE_ARRAY(declaredLength);
      weakMapSet(seen, source, target);
      frame.assign(target);
      for (let index = 0; index < numericKeys.length; index += 1) {
        const key = numericKeys[index];
        const descriptor = descriptors[key];
        if (!descriptor || !NATIVE_HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
          pushArray(diagnostics, diagnostic(
            'schema', 'CORE_DATA_PROPERTY_INVALID', `${frame.path}/${key}`,
            'pure-core input containers require enumerable own data properties'
          ));
          continue;
        }
        pushArray(pending, {
          source: descriptor.value, path: `${frame.path}/${key}`,
          assign(value) {
            NATIVE_DEFINE_PROPERTY(target, key, {
              value, enumerable: true, writable: true, configurable: true
            });
          }
        });
      }
      continue;
    }
    const target = NATIVE_OBJECT_CREATE(null);
    weakMapSet(seen, source, target);
    frame.assign(target);
    for (let keyIndex = 0; keyIndex < stringKeys.length; keyIndex += 1) {
      const key = stringKeys[keyIndex];
      const descriptor = descriptors[key];
      if (!descriptor || !NATIVE_HAS_OWN(descriptor, 'value') || descriptor.enumerable !== true) {
        pushArray(diagnostics, diagnostic(
          'schema', 'CORE_DATA_PROPERTY_INVALID', `${frame.path}/${pointerPart(key)}`,
          'pure-core input containers require enumerable own data properties'
        ));
        continue;
      }
      pushArray(pending, {
        source: descriptor.value, path: `${frame.path}/${pointerPart(key)}`,
        assign(value) {
          NATIVE_DEFINE_PROPERTY(target, key, {
            value, enumerable: true, writable: true, configurable: true
          });
        }
      });
    }
  }
  return { snapshot: root.value, diagnostics };
}

/** @param {unknown} submitted */
function normalizeInput(submitted) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const captured = snapshotOwnData(submitted, '');
  appendArray(diagnostics, captured.diagnostics);
  const input = captured.snapshot;
  if (!isRecord(input)) return { input: null, diagnostics: [diagnostic(
    'schema', 'CORE_INPUT_INVALID', '/', 'pure-core input must be a closed plain record'
  )] };
  requireClosed(input, INPUT_KEYS, '', diagnostics);
  const sourceRevision = toNumber(input.source_revision);
  if (input.schema_version !== '1.0.0') pushArray(diagnostics, diagnostic(
    'schema', 'CORE_SCHEMA_VERSION_INVALID', '/schema_version', 'pure core requires schema version 1.0.0'
  ));
  if (!numberIsSafeInteger(sourceRevision) || sourceRevision < 0) pushArray(diagnostics, diagnostic(
    'schema', 'CORE_SOURCE_REVISION_INVALID', '/source_revision', 'source revision must be a nonnegative safe integer'
  ));
  if (typeof input.compiler_version !== 'string' || input.compiler_version.trim().length === 0
    || input.compiler_version !== input.compiler_version.trim()) pushArray(diagnostics, diagnostic(
    'schema', 'CORE_COMPILER_VERSION_INVALID', '/compiler_version', 'compiler version must be nonblank and unpadded'
  ));
  if (!isRecord(input.lineage)) pushArray(diagnostics, diagnostic(
    'schema', 'CORE_LINEAGE_INVALID', '/lineage', 'lineage must be an own-data record'
  ));
  const compilation = isRecord(input.obligation_compilation) ? input.obligation_compilation : null;
  if (!compilation) pushArray(diagnostics, diagnostic(
    'schema', 'CORE_OBLIGATION_COMPILATION_INVALID', '/obligation_compilation', 'obligation compilation input must be a closed record'
  ));
  else {
    requireClosed(compilation, COMPILATION_KEYS, '/obligation_compilation', diagnostics);
    if (!isRecord(compilation.contexts_by_view_id)
      || !NATIVE_ARRAY_IS_ARRAY(compilation.custom_obligations)
      || !NATIVE_ARRAY_IS_ARRAY(compilation.fact_routes)
      || !NATIVE_ARRAY_IS_ARRAY(compilation.not_applicable_reviews)) pushArray(diagnostics, diagnostic(
      'schema', 'CORE_OBLIGATION_COMPILATION_INVALID', '/obligation_compilation',
      'obligation compilation contexts must be a record and remaining fields arrays'
    ));
  }
  const clarification = isRecord(input.clarification) ? input.clarification : null;
  if (!clarification) pushArray(diagnostics, diagnostic(
    'schema', 'CORE_CLARIFICATION_INVALID', '/clarification', 'clarification input must be a closed record'
  ));
  else requireClosed(clarification, CLARIFICATION_KEYS, '/clarification', diagnostics);
  return { input, diagnostics };
}

/** @param {Record<string, unknown>} input */
function validateArtifactSchemas(input) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const artifactsAndSchemas = [
    [input.source_pack, sourcePackSchema],
    [input.evidence_claims, evidenceClaimsSchema],
    [input.behavior_views, behaviorViewsSchema],
    [input.case_drafts, caseDraftsSchema]
  ];
  for (let index = 0; index < artifactsAndSchemas.length; index += 1) {
    const artifact = artifactsAndSchemas[index][0];
    const schema = artifactsAndSchemas[index][1];
    appendArray(diagnostics, /** @type {Diagnostic[]} */ (validateAgainstSchema(artifact, schema)));
    appendArray(diagnostics, /** @type {Diagnostic[]} */ (validateUniqueStableIds(artifact)));
  }
  const revision = toNumber(input.source_revision);
  const namedArtifacts = [
    ['source_pack', input.source_pack], ['evidence_claims', input.evidence_claims],
    ['behavior_views', input.behavior_views], ['case_drafts', input.case_drafts]
  ];
  for (let index = 0; index < namedArtifacts.length; index += 1) {
    const name = namedArtifacts[index][0];
    const artifact = namedArtifacts[index][1];
    if (!isRecord(artifact) || artifact.source_revision !== revision) pushArray(diagnostics, diagnostic(
      'traceability', 'CORE_SOURCE_REVISION_MISMATCH', `/${name}/source_revision`,
      'every submitted artifact must identify the complete revision being evaluated'
    ));
  }
  return finalizeDiagnostics(diagnostics);
}

/** @param {Record<string, unknown>} input @param {Map<string, Record<string, unknown>>} claimsById @param {Record<string, unknown>[]} conflicts */
function evidenceContext(input, claimsById, conflicts) {
  const sourcePack = /** @type {Record<string, unknown>} */ (input.source_pack);
  const evidenceClaims = /** @type {Record<string, unknown>} */ (input.evidence_claims);
  const compilation = /** @type {Record<string, unknown>} */ (input.obligation_compilation);
  const contexts = /** @type {Record<string, unknown>} */ (compilation.contexts_by_view_id);
  return {
    claimsById,
    factLedger: NATIVE_STRUCTURED_CLONE(records(evidenceClaims.fact_ledger)),
    conflicts: NATIVE_STRUCTURED_CLONE(conflicts),
    runScope: String(sourcePack.run_scope),
    obligationCompilation: {
      sourceRevision: toNumber(input.source_revision),
      contextsByViewId: makeMap(NATIVE_OBJECT_ENTRIES(NATIVE_STRUCTURED_CLONE(contexts))),
      factRoutes: NATIVE_STRUCTURED_CLONE(records(compilation.fact_routes)),
      notApplicableReviews: NATIVE_STRUCTURED_CLONE(records(compilation.not_applicable_reviews)),
      customObligations: NATIVE_STRUCTURED_CLONE(records(compilation.custom_obligations))
    }
  };
}

/** @param {string} left @param {string} right */
function scopesIntersect(left, right) {
  return scopeContains(left, right) || scopeContains(right, left);
}

/** @param {Record<string, unknown>} conflict */
function conflictIdentity(conflict) {
  return typeof conflict.conflict_id === 'string' ? conflict.conflict_id
    : typeof conflict.root_issue_id === 'string' ? conflict.root_issue_id
      : canonicalStringify(conflict);
}

/**
 * Propagate only conflict identities through the accepted evidence DAG. Each
 * parent edge is visited once; storage grows with actual claim/conflict
 * associations instead of copying complete source ancestry per Case.
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {Record<string, unknown>} sourcePack
 * @param {Record<string, unknown>[]} conflicts
 */
function prepareConflictRelations(claimsById, sourcePack, conflicts) {
  const locatorSourceById = makeMap(mapArray(records(sourcePack.locators), (item) => [
    String(item.locator_id), String(item.source_id)
  ]));
  /** @type {Map<string, Record<string, unknown>>} */
  const conflictByIdentity = makeMap();
  /** @type {Map<string, string[]>} */
  const conflictIdsBySource = makeMap();
  for (let index = 0; index < conflicts.length; index += 1) {
    const conflict = conflicts[index];
    const identity = conflictIdentity(conflict);
    mapSet(conflictByIdentity, identity, conflict);
    const sourceIds = makeSet(strings(conflict.source_ids));
    forEachSet(sourceIds, (sourceId) => {
      const bucket = mapGet(conflictIdsBySource, sourceId);
      if (bucket) pushArray(bucket, identity);
      else mapSet(conflictIdsBySource, sourceId, [identity]);
    });
  }
  /** @type {Map<string, Set<string>>} */
  const directCandidateIdsByClaim = makeMap();
  /** @type {Map<string, Set<string>>} */
  const candidateIdsByClaim = makeMap();
  /** @type {Map<string, string[]>} */
  const childrenByClaim = makeMap();
  /** @type {Map<string, string[]>} */
  const parentsByClaim = makeMap();
  /** @type {Map<string, number>} */
  const indegreeByClaim = makeMap();
  const claimIds = sortArray(mapKeysArray(claimsById), compareCodePoints);
  for (let index = 0; index < claimIds.length; index += 1) {
    const claimId = claimIds[index];
    const claim = mapGet(claimsById, claimId) ?? {};
    const candidates = makeSet();
    const directSourceIds = makeSet();
    if (typeof claim.source_id === 'string') setAdd(directSourceIds, claim.source_id);
    const locatorIds = strings(claim.source_locator_ids);
    for (let locatorIndex = 0; locatorIndex < locatorIds.length; locatorIndex += 1) {
      const sourceId = mapGet(locatorSourceById, locatorIds[locatorIndex]);
      if (sourceId !== undefined) setAdd(directSourceIds, sourceId);
    }
    forEachSet(directSourceIds, (sourceId) => {
      const identities = mapGet(conflictIdsBySource, sourceId) ?? [];
      for (let identityIndex = 0; identityIndex < identities.length; identityIndex += 1) {
        setAdd(candidates, identities[identityIndex]);
      }
    });
    mapSet(directCandidateIdsByClaim, claimId, candidates);
    const parents = makeSet(strings(claim.parent_claim_ids));
    const parentIds = sortArray(setValuesArray(parents), compareCodePoints);
    mapSet(parentsByClaim, claimId, parentIds);
    let indegree = 0;
    for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
      const parentId = parentIds[parentIndex];
      if (!mapHas(claimsById, parentId)) continue;
      indegree += 1;
      const children = mapGet(childrenByClaim, parentId);
      if (children) pushArray(children, claimId);
      else mapSet(childrenByClaim, parentId, [claimId]);
    }
    mapSet(indegreeByClaim, claimId, indegree);
  }
  /** @type {string[]} */
  const ready = [];
  for (let index = 0; index < claimIds.length; index += 1) {
    if (mapGet(indegreeByClaim, claimIds[index]) === 0) pushArray(ready, claimIds[index]);
  }
  /** @type {Map<string, Set<string>>} */
  const internedCandidates = makeMap();
  /** @type {WeakMap<object, number>} */
  const candidateSetIdentity = new NATIVE_WEAK_MAP();
  /** @type {Map<string, {candidates:Set<string>,count:number}>} */
  const unionBySignature = makeMap();
  /** @type {Map<string, number>} */
  const candidateCountByClaim = makeMap();
  let nextCandidateSetIdentity = 0;
  let cursor = 0;
  while (cursor < ready.length) {
    const claimId = ready[cursor++];
    const directCandidates = mapGet(directCandidateIdsByClaim, claimId) ?? makeSet();
    const directItems = setValuesArray(directCandidates);
    const parentIds = mapGet(parentsByClaim, claimId) ?? [];
    /** @type {Set<Set<string>>} */
    const uniqueParentCandidates = makeSet();
    for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
      const parentCandidates = mapGet(candidateIdsByClaim, parentIds[parentIndex]);
      if (parentCandidates) setAdd(uniqueParentCandidates, parentCandidates);
    }
    const uniqueParents = setValuesArray(uniqueParentCandidates);
    let resolvedCandidates;
    let resolvedCount;
    if (directItems.length === 0 && uniqueParents.length === 1) {
      resolvedCandidates = uniqueParents[0];
      const firstParentId = parentIds[0];
      resolvedCount = toNumber(mapGet(candidateCountByClaim, firstParentId) ?? 0);
    } else {
      const directSignature = sortArray(sliceArray(directItems, 0), compareCodePoints);
      /** @type {number[]} */
      const parentSetIdentities = [];
      for (let parentIndex = 0; parentIndex < uniqueParents.length; parentIndex += 1) {
        const parentCandidates = uniqueParents[parentIndex];
        let identity = weakMapGet(candidateSetIdentity, parentCandidates);
        if (identity === undefined) {
          identity = nextCandidateSetIdentity;
          nextCandidateSetIdentity += 1;
          weakMapSet(candidateSetIdentity, parentCandidates, identity);
        }
        pushArray(parentSetIdentities, identity);
      }
      sortArray(parentSetIdentities, (left, right) => left - right);
      const unionSignature = canonicalStringify([directSignature, parentSetIdentities]);
      const cachedUnion = mapGet(unionBySignature, unionSignature);
      if (cachedUnion) {
        resolvedCandidates = cachedUnion.candidates;
        resolvedCount = cachedUnion.count;
      } else {
        const merged = makeSet(directItems);
        let baseParentId = null;
        let baseCount = -1;
        for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
          const parentId = parentIds[parentIndex];
          const count = toNumber(mapGet(candidateCountByClaim, parentId) ?? 0);
          if (count > baseCount || (count === baseCount && baseParentId !== null
            && compareCodePoints(parentId, baseParentId) < 0)) {
            baseParentId = parentId;
            baseCount = count;
          }
        }
        const baseCandidates = baseParentId === null
          ? null : mapGet(candidateIdsByClaim, baseParentId) ?? null;
        if (baseCandidates) forEachSet(baseCandidates, (identity) => setAdd(merged, identity));
        const coveredByBase = makeSet(
          baseParentId === null ? [] : mapGet(parentsByClaim, baseParentId) ?? []
        );
        const mergedParentSets = makeSet();
        if (baseCandidates) setAdd(mergedParentSets, baseCandidates);
        for (let parentIndex = 0; parentIndex < parentIds.length; parentIndex += 1) {
          const parentId = parentIds[parentIndex];
          if (parentId === baseParentId || setHas(coveredByBase, parentId)) continue;
          const parentCandidates = mapGet(candidateIdsByClaim, parentId);
          if (!parentCandidates || setHas(mergedParentSets, parentCandidates)) continue;
          setAdd(mergedParentSets, parentCandidates);
          forEachSet(parentCandidates, (identity) => setAdd(merged, identity));
        }
        const ordered = sortArray(setValuesArray(merged), compareCodePoints);
        resolvedCount = ordered.length;
        const key = canonicalStringify(ordered);
        const interned = mapGet(internedCandidates, key);
        if (interned) resolvedCandidates = interned;
        else {
          resolvedCandidates = merged;
          mapSet(internedCandidates, key, merged);
        }
        mapSet(unionBySignature, unionSignature, {
          candidates: resolvedCandidates, count: resolvedCount
        });
      }
    }
    mapSet(candidateIdsByClaim, claimId, resolvedCandidates);
    mapSet(candidateCountByClaim, claimId, resolvedCount);
    const children = mapGet(childrenByClaim, claimId) ?? [];
    for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
      const childId = children[childIndex];
      const nextIndegree = toNumber(mapGet(indegreeByClaim, childId)) - 1;
      mapSet(indegreeByClaim, childId, nextIndegree);
      if (nextIndegree === 0) pushArray(ready, childId);
    }
  }
  return { candidateIdsByClaim, conflictByIdentity };
}

function makeConflictSelectionCache() {
  return {
    /** @type {WeakMap<object,number>} */ relationIdentityBySet: new NATIVE_WEAK_MAP(),
    nextRelationIdentity: 0,
    /** @type {Map<string,Set<string>>} */ unionBySignature: makeMap(),
    /** @type {Map<string,Set<string>>} */ internedUnions: makeMap(),
    /** @type {WeakMap<object,string[]>} */ orderedIdsByUnion: new NATIVE_WEAK_MAP(),
    /** @type {WeakMap<object,Map<string,any>>} */ selectionsByUnion: new NATIVE_WEAK_MAP()
  };
}

/**
 * @param {Record<string, unknown>} caseDraft
 * @param {ReturnType<typeof prepareConflictRelations>} relations
 * @param {Set<string>} allowedConflictIds
 * @param {{
 *   relationIdentityBySet:WeakMap<object,number>,nextRelationIdentity:number,
 *   unionBySignature:Map<string,Set<string>>,internedUnions:Map<string,Set<string>>,
 *   orderedIdsByUnion:WeakMap<object,string[]>,selectionsByUnion:WeakMap<object,Map<string,any>>
 * }} cache
 */
function conflictSelectionForCase(caseDraft, relations, allowedConflictIds, cache) {
  /** @type {Set<Set<string>>} */
  const relatedSets = makeSet();
  const refs = strings(caseDraft.evidence_refs);
  for (let index = 0; index < refs.length; index += 1) {
    const related = mapGet(relations.candidateIdsByClaim, refs[index]);
    if (related) setAdd(relatedSets, related);
  }
  const uniqueRelatedSets = setValuesArray(relatedSets);
  /** @type {number[]} */
  const relationIdentities = [];
  for (let index = 0; index < uniqueRelatedSets.length; index += 1) {
    const related = uniqueRelatedSets[index];
    let identity = weakMapGet(cache.relationIdentityBySet, related);
    if (identity === undefined) {
      identity = cache.nextRelationIdentity;
      cache.nextRelationIdentity += 1;
      weakMapSet(cache.relationIdentityBySet, related, identity);
    }
    pushArray(relationIdentities, identity);
  }
  sortArray(relationIdentities, (left, right) => left - right);
  const unionSignature = canonicalStringify(relationIdentities);
  let candidateIds = mapGet(cache.unionBySignature, unionSignature);
  if (!candidateIds) {
    const merged = makeSet();
    for (let index = 0; index < uniqueRelatedSets.length; index += 1) {
      forEachSet(uniqueRelatedSets[index], (identity) => {
        if (setHas(allowedConflictIds, identity)) setAdd(merged, identity);
      });
    }
    const orderedIds = sortArray(setValuesArray(merged), compareCodePoints);
    const candidateKey = canonicalStringify(orderedIds);
    candidateIds = mapGet(cache.internedUnions, candidateKey);
    if (!candidateIds) {
      candidateIds = merged;
      mapSet(cache.internedUnions, candidateKey, candidateIds);
      weakMapSet(cache.orderedIdsByUnion, candidateIds, orderedIds);
    }
    mapSet(cache.unionBySignature, unionSignature, candidateIds);
  }
  let selectionsByScope = weakMapGet(cache.selectionsByUnion, candidateIds);
  if (!selectionsByScope) {
    selectionsByScope = makeMap();
    weakMapSet(cache.selectionsByUnion, candidateIds, selectionsByScope);
  }
  const caseScope = typeof caseDraft.scope === 'string' ? caseDraft.scope : '';
  const cachedSelection = mapGet(selectionsByScope, caseScope);
  if (cachedSelection) return cachedSelection;
  /** @type {string|null} */
  let selectedIdentity = null;
  let count = 0;
  const orderedIds = weakMapGet(cache.orderedIdsByUnion, candidateIds)
    ?? sortArray(setValuesArray(candidateIds), compareCodePoints);
  for (let index = 0; index < orderedIds.length; index += 1) {
    const identity = orderedIds[index];
    const conflict = mapGet(relations.conflictByIdentity, identity);
    if (!conflict) continue;
    const conflictScope = conflict.scope;
    if (typeof conflictScope === 'string' && scopesIntersect(caseScope, conflictScope)) {
      count += 1;
      if (selectedIdentity === null) selectedIdentity = identity;
      if (count === 2) break;
    }
  }
  const selection = {
    conflict: selectedIdentity === null ? null
      : mapGet(relations.conflictByIdentity, selectedIdentity) ?? null,
    identity: selectedIdentity,
    count
  };
  mapSet(selectionsByScope, caseScope, selection);
  return selection;
}

/**
 * Source policy owns conflict discovery, while classification owns the
 * lowest-gate Case rule. Bridge those frozen interfaces without converting a
 * local conflict into a revision-wide error: trace each executable Case's
 * accepted evidence roots back to its source locators, then block only Cases
 * that intersect and depend on a reported conflict.
 * @param {any} classification
 * @param {Record<string, unknown>[]} obligations
 * @param {Map<string, Record<string, unknown>>} claimsById
 * @param {Record<string, unknown>} sourcePack
 * @param {Record<string, unknown>[]} conflicts
 * @param {ReturnType<typeof prepareConflictRelations>} [preparedRelations]
 */
function applyLocalConflictBlocks(
  classification, obligations, claimsById, sourcePack, conflicts, preparedRelations
) {
  if (conflicts.length === 0) return classification;
  const relations = preparedRelations ?? prepareConflictRelations(claimsById, sourcePack, conflicts);
  const allowedConflictIds = makeSet();
  for (let index = 0; index < conflicts.length; index += 1) {
    setAdd(allowedConflictIds, conflictIdentity(conflicts[index]));
  }

  const executable = mapArray(
    records(classification.grounded), (item) => ({ lane: 'grounded', item })
  );
  appendArray(executable, mapArray(
    records(classification.conditional), (item) => ({ lane: 'conditional', item })
  ));
  /** @type {Map<string, number[]>} */
  const casesByObligation = makeMap();
  for (let index = 0; index < executable.length; index += 1) {
    const linkedIds = strings(executable[index].item.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) {
      const obligationId = linkedIds[obligationIndex];
      const bucket = mapGet(casesByObligation, obligationId);
      if (bucket) pushArray(bucket, index);
      else mapSet(casesByObligation, obligationId, [index]);
    }
  }
  const obligationsById = makeMap(mapArray(obligations, (item) => [String(item.obligation_id), item]));
  const blockedByObligation = makeMap(mapArray(records(classification.blocked), (item) => [
    String(item.obligation_id), NATIVE_STRUCTURED_CLONE(item)
  ]));
  const blockedQueue = sortArray(mapKeysArray(blockedByObligation), compareCodePoints);
  const invalidCases = makeSet();
  /** @type {Array<ReturnType<typeof conflictSelectionForCase>>} */
  const selections = [];
  /** @type {Map<string, Set<string>>} */
  const conflictIdsByObligation = makeMap();
  /** @type {Diagnostic[]} */
  const ambiguityDiagnostics = [];
  const selectionCache = makeConflictSelectionCache();

  for (let index = 0; index < executable.length; index += 1) {
    const caseDraft = executable[index].item;
    const selection = conflictSelectionForCase(
      caseDraft, relations, allowedConflictIds, selectionCache
    );
    pushArray(selections, selection);
    if (selection.count > 1) pushArray(ambiguityDiagnostics, diagnostic(
      'classification', 'CORE_SOURCE_CONFLICT_AMBIGUOUS',
      `/cases/${pointerPart(String(caseDraft.case_id ?? 'unknown'))}/evidence_refs`,
      'one executable Case cannot select more than one canonical source conflict'
    ));
    if (selection.identity === null) continue;
    const linkedIds = strings(caseDraft.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) {
      const obligationId = linkedIds[obligationIndex];
      const identities = mapGet(conflictIdsByObligation, obligationId) ?? makeSet();
      setAdd(identities, selection.identity);
      mapSet(conflictIdsByObligation, obligationId, identities);
    }
  }
  forEachMap(conflictIdsByObligation, (identities, obligationId) => {
    if (setValuesArray(identities).length <= 1) return;
    pushArray(ambiguityDiagnostics, diagnostic(
      'classification', 'CORE_SOURCE_CONFLICT_AMBIGUOUS',
      `/obligations/${pointerPart(obligationId)}`,
      'one formal obligation cannot select different canonical source conflicts'
    ));
  });
  if (ambiguityDiagnostics.length > 0) {
    const combinedDiagnostics = diagnosticArray(classification.diagnostics);
    appendArray(combinedDiagnostics, ambiguityDiagnostics);
    return { ...classification, diagnostics: finalizeDiagnostics(combinedDiagnostics) };
  }

  /** @param {string} obligationId @param {string} reason @param {string[]} evidenceRefs @param {string|null} rootIssueId */
  function block(obligationId, reason, evidenceRefs, rootIssueId) {
    const obligation = mapGet(obligationsById, obligationId);
    if (!obligation) return;
    const existing = mapGet(blockedByObligation, obligationId);
    const reasons = makeSet(existing ? String(existing.reason).split(',') : []);
    setAdd(reasons, reason);
    setDelete(reasons, '');
    const refs = makeSet(existing ? strings(existing.evidence_refs) : []);
    for (let index = 0; index < evidenceRefs.length; index += 1) setAdd(refs, evidenceRefs[index]);
    const orderedReasons = sortArray(setValuesArray(reasons), compareCodePoints);
    mapSet(blockedByObligation, obligationId, {
      obligation_id: obligationId,
      root_issue_id: rootIssueId ?? String(existing?.root_issue_id ?? stableId('root', {
        missing_type: 'case-classification', obligation_id: obligationId,
        reason_codes: orderedReasons, scope: obligation.scope
      })),
      reason: joinArray(orderedReasons, ','),
      risk: String(obligation.risk), evidence_refs: sortArray(setValuesArray(refs), compareCodePoints)
    });
    if (!existing) pushArray(blockedQueue, obligationId);
  }

  for (let index = 0; index < executable.length; index += 1) {
    const caseDraft = executable[index].item;
    const conflict = selections[index].conflict;
    if (!conflict) continue;
    setAdd(invalidCases, index);
    const linkedIds = strings(caseDraft.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) block(
      linkedIds[obligationIndex], 'UNRESOLVED_CONFLICT', strings(caseDraft.evidence_refs),
      typeof conflict.root_issue_id === 'string' ? conflict.root_issue_id : null
    );
  }

  let cursor = 0;
  while (cursor < blockedQueue.length) {
    const blockedId = blockedQueue[cursor++];
    const linkedCaseIndexes = mapGet(casesByObligation, blockedId) ?? [];
    for (let linkedIndex = 0; linkedIndex < linkedCaseIndexes.length; linkedIndex += 1) {
      const caseIndex = linkedCaseIndexes[linkedIndex];
      if (setHas(invalidCases, caseIndex)) continue;
      setAdd(invalidCases, caseIndex);
      const caseDraft = executable[caseIndex].item;
      const linkedIds = strings(caseDraft.obligation_ids);
      for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) block(
        linkedIds[obligationIndex], 'CASE_SHARES_BLOCKED_OBLIGATION', strings(caseDraft.evidence_refs), null
      );
    }
  }

  return {
    ...classification,
    grounded: mapArray(filterArray(executable, (item, index) =>
      item.lane === 'grounded' && !setHas(invalidCases, index)), (item) => item.item),
    conditional: mapArray(filterArray(executable, (item, index) =>
      item.lane === 'conditional' && !setHas(invalidCases, index)), (item) => item.item),
    blocked: sortArray(mapValuesArray(blockedByObligation), (left, right) =>
      compareCodePoints(String(left.obligation_id), String(right.obligation_id)))
  };
}

/** @param {string} reason */
function missingType(reason) {
  if (reason.includes('ORACLE')) return 'oracle';
  if (reason.includes('CONFLICT')) return 'source-conflict';
  if (reason.includes('CAPABILITY') || reason.includes('OBSERVER') || reason.includes('CONTROL')) return 'testability';
  if (reason.includes('EXCLUSION')) return 'exclusion';
  return 'formal-test-point';
}

/** @param {Record<string, unknown>} obligation @param {string} reason */
function semanticRefs(obligation, reason) {
  const refs = makeSet();
  const groups = [
    strings(obligation.source_claim_ids),
    strings(obligation.required_oracle_refs),
    strings(obligation.view_element_refs)
  ];
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const values = groups[groupIndex];
    for (let index = 0; index < values.length; index += 1) setAdd(refs, values[index]);
  }
  if (setValuesArray(refs).length === 0) setAdd(refs, String(obligation.obligation_id));
  if (reason.includes('CONFLICT')) setAdd(refs, 'unresolved-source-policy');
  return sortArray(setValuesArray(refs), compareCodePoints);
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations */
function bindBlockedRootIdentity(classification, obligations) {
  const obligationById = makeMap(mapArray(obligations, (item) => [String(item.obligation_id), item]));
  const blocked = mapArray(records(classification.blocked), (item) => {
    const obligation = mapGet(obligationById, String(item.obligation_id)) ?? {};
    const signature = {
      missing_type: missingType(String(item.reason)),
      semantic_refs: semanticRefs(obligation, String(item.reason)),
      scope: String(obligation.scope ?? '')
    };
    return { ...item, root_issue_id: stableId('root', signature) };
  });
  return { ...classification, blocked };
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations */
function blockedDescriptors(classification, obligations) {
  const obligationById = makeMap(mapArray(obligations, (item) => [String(item.obligation_id), item]));
  return sortArray(mapArray(records(classification.blocked), (item) => {
    const obligation = mapGet(obligationById, String(item.obligation_id)) ?? {};
    const reason = String(item.reason);
    const type = missingType(reason);
    const scope = String(obligation.scope ?? 'unknown');
    const technical = reason.includes('UNAVAILABLE') || reason.includes('UNKNOWN')
      || reason.includes('MISSING_CAPABILITY') || reason.includes('MISSING_OBSERVER')
      || reason.includes('MISSING_CONTROL');
    return {
      obligation_id: String(item.obligation_id), missing_type: type,
      semantic_refs: semanticRefs(obligation, reason), scope,
      risk: String(item.risk), reason, evidence_refs: sortArray(strings(item.evidence_refs), compareCodePoints),
      answerable: !technical,
      question: `Clarification required for ${type} in ${scope}.`
    };
  }), (left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
}

/**
 * Build a compiler-owned bridge between Task9's obligation-scoped root and a
 * canonical source-policy conflict. Submitted semantic refs never participate
 * in alias discovery.
 * @param {any} classification
 * @param {Record<string, unknown>[]} obligations
 * @param {ReturnType<typeof prepareConflictRelations>} relations
 * @param {Record<string, unknown>[]} conflicts
 */
function buildSourceConflictBridge(classification, obligations, relations, conflicts) {
  const obligationById = makeMap(mapArray(obligations, (item) => [String(item.obligation_id), item]));
  const allowedConflictIds = makeSet();
  for (let index = 0; index < conflicts.length; index += 1) {
    setAdd(allowedConflictIds, conflictIdentity(conflicts[index]));
  }
  const executable = sliceArray(records(classification.grounded), 0);
  appendArray(executable, records(classification.conditional));
  /** @type {Map<string, any>} */
  const bridge = makeMap();
  const ambiguous = makeSet();
  const selectionCache = makeConflictSelectionCache();
  for (let caseIndex = 0; caseIndex < executable.length; caseIndex += 1) {
    const caseDraft = executable[caseIndex];
    const selection = conflictSelectionForCase(
      caseDraft, relations, allowedConflictIds, selectionCache
    );
    if (selection.count !== 1 || !selection.conflict) continue;
    const conflict = selection.conflict;
    const linkedIds = strings(caseDraft.obligation_ids);
    for (let obligationIndex = 0; obligationIndex < linkedIds.length; obligationIndex += 1) {
      const obligationId = linkedIds[obligationIndex];
      const obligation = mapGet(obligationById, obligationId);
      if (!obligation) continue;
      const signature = {
        missing_type: 'source-conflict',
        semantic_refs: semanticRefs(obligation, 'UNRESOLVED_CONFLICT'),
        scope: String(obligation.scope ?? '')
      };
      const internalId = stableId('root', signature);
      const existing = mapGet(bridge, internalId);
      if (existing && conflictIdentity(existing.conflict) !== conflictIdentity(conflict)) {
        setAdd(ambiguous, internalId);
        continue;
      }
      if (existing) setAdd(existing.affectedObligationIds, obligationId);
      else mapSet(bridge, internalId, {
        internal_root_issue_id: internalId,
        internal_scope: signature.scope,
        semantic_refs: signature.semantic_refs,
        affectedObligationIds: makeSet([obligationId]),
        conflict: NATIVE_STRUCTURED_CLONE(conflict)
      });
    }
  }
  forEachSet(ambiguous, (internalId) => mapDelete(bridge, internalId));
  forEachMap(bridge, (entry) => {
    entry.affected_obligation_ids = sortArray(
      setValuesArray(entry.affectedObligationIds), compareCodePoints
    );
    delete entry.affectedObligationIds;
  });
  return bridge;
}

/** @param {Record<string, unknown>} root @param {any} bridgeEntry */
function bridgeMatchesRoot(root, bridgeEntry) {
  if (String(root.root_issue_id) !== bridgeEntry.internal_root_issue_id
    || root.missing_type !== 'source-conflict'
    || root.scope !== bridgeEntry.internal_scope) return false;
  const signature = {
    missing_type: 'source-conflict',
    semantic_refs: bridgeEntry.semantic_refs,
    scope: bridgeEntry.internal_scope
  };
  if (root.root_issue_key !== canonicalStringify(signature)
    || canonicalStringify(strings(root.semantic_refs)) !== canonicalStringify(bridgeEntry.semantic_refs)
    || canonicalStringify(sortArray(strings(root.affected_obligation_ids), compareCodePoints))
      !== canonicalStringify(bridgeEntry.affected_obligation_ids)) return false;
  const reasons = makeSet(strings(root.reasons));
  return setHas(reasons, 'UNRESOLVED_CONFLICT');
}

/**
 * Translate user-visible source-policy root IDs back to Task9's private root
 * identities before validating a Decision/control append batch.
 * @param {Record<string, unknown>} clarificationInput
 * @param {Map<string, any>} sourceConflictBridge
 */
function translateClarificationAppend(clarificationInput, sourceConflictBridge) {
  const output = NATIVE_STRUCTURED_CLONE(clarificationInput);
  if (!isRecord(output.prior_state) || !isRecord(output.append_batch)) return output;
  const priorById = makeMap(mapArray(records(output.prior_state.root_snapshot_ledger), (item) => [
    String(item.root_issue_id), item
  ]));
  /** @type {Map<string, Set<string>>} */
  const internalBySourceRoot = makeMap();
  forEachMap(sourceConflictBridge, (entry, internalId) => {
    const priorRoot = mapGet(priorById, internalId);
    if (!priorRoot || !bridgeMatchesRoot(priorRoot, entry)) return;
    const sourceRootId = String(entry.conflict.root_issue_id ?? '');
    if (sourceRootId.length === 0) return;
    const ids = mapGet(internalBySourceRoot, sourceRootId) ?? makeSet();
    setAdd(ids, internalId);
    mapSet(internalBySourceRoot, sourceRootId, ids);
  });
  /** @param {unknown} rootIds */
  function translateRootIds(rootIds) {
    const translated = makeSet();
    let changed = false;
    const submittedRootIds = strings(rootIds);
    for (let index = 0; index < submittedRootIds.length; index += 1) {
      const rootId = submittedRootIds[index];
      const internal = mapGet(internalBySourceRoot, rootId);
      if (internal) {
        forEachSet(internal, (internalId) => {
          setAdd(translated, internalId);
          if (internalId !== rootId) changed = true;
        });
      }
      else setAdd(translated, rootId);
    }
    return { ids: sortArray(setValuesArray(translated), compareCodePoints), changed };
  }
  const decisions = records(output.append_batch.decision_records);
  for (let index = 0; index < decisions.length; index += 1) {
    const decision = decisions[index];
    const externalRootIds = sortArray(strings(decision.root_issue_ids), compareCodePoints);
    const expectedExternalQuestionId = stableId('question', { root_issue_ids: externalRootIds });
    const submittedQuestionId = decision.question_id;
    const translated = translateRootIds(decision.root_issue_ids);
    decision.root_issue_ids = translated.ids;
    if (translated.changed) decision.question_id = submittedQuestionId === expectedExternalQuestionId
      ? stableId('question', { root_issue_ids: decision.root_issue_ids }) : '';
  }
  const events = records(output.append_batch.clarification_events);
  for (let index = 0; index < events.length; index += 1) {
    events[index].root_issue_ids = translateRootIds(events[index].root_issue_ids).ids;
  }
  return output;
}

/**
 * Keep Task9 state private while surfacing source-policy canonical root IDs to
 * callers. Recompute the batch identity after aliasing and group aliases before
 * presentation so ordering is independent of Case/input order.
 * @param {unknown} pending
 * @param {Record<string, unknown>[]} conflicts
 * @param {Map<string, any>} sourceConflictBridge
 */
function externalizePendingRoots(pending, conflicts, sourceConflictBridge) {
  void conflicts;
  /** @type {Map<string, any>} */
  const grouped = makeMap();
  const pendingRoots = records(pending);
  for (let pendingIndex = 0; pendingIndex < pendingRoots.length; pendingIndex += 1) {
    const submitted = pendingRoots[pendingIndex];
    const item = NATIVE_STRUCTURED_CLONE(submitted);
    const bridgeEntry = mapGet(sourceConflictBridge, String(item.root_issue_id));
    const conflict = bridgeEntry && bridgeMatchesRoot(item, bridgeEntry)
      ? bridgeEntry.conflict : null;
    const sourceRootId = conflict && typeof conflict.root_issue_id === 'string'
      ? conflict.root_issue_id : null;
    const externalId = sourceRootId ?? String(item.root_issue_id);
    if (conflict) {
      item.root_issue_id = externalId;
      item.root_issue_key = canonicalStringify({
        missing_type: 'source-conflict',
        rule_ids: sortArray(strings(conflict.rule_ids), compareCodePoints),
        scope: String(conflict.scope),
        source_ids: sortArray(strings(conflict.source_ids), compareCodePoints)
      });
      item.scope = String(conflict.scope);
      item.question = `Clarification required for source-conflict in ${item.scope}.`;
    }
    const existing = mapGet(grouped, externalId);
    if (!existing) mapSet(grouped, externalId, item);
    else {
      existing.affected_obligation_ids = unionSortedStrings(
        strings(existing.affected_obligation_ids), strings(item.affected_obligation_ids)
      );
      existing.reasons = unionSortedStrings(strings(existing.reasons), strings(item.reasons));
      existing.evidence_refs = unionSortedStrings(
        strings(existing.evidence_refs), strings(item.evidence_refs)
      );
      const itemRiskCounts = isRecord(item.risk_counts) ? item.risk_counts : {};
      const risks = ['critical', 'high', 'medium', 'low'];
      for (let riskIndex = 0; riskIndex < risks.length; riskIndex += 1) {
        const risk = risks[riskIndex];
        existing.risk_counts[risk] = toNumber(existing.risk_counts[risk])
          + toNumber(itemRiskCounts[risk]);
      }
    }
  }
  const riskOrder = ['critical', 'high', 'medium', 'low'];
  const output = sortArray(mapValuesArray(grouped), (left, right) => {
    const leftRisk = isRecord(left.risk_counts) ? left.risk_counts : {};
    const rightRisk = isRecord(right.risk_counts) ? right.risk_counts : {};
    for (let index = 0; index < riskOrder.length; index += 1) {
      const risk = riskOrder[index];
      const difference = toNumber(rightRisk[risk] ?? 0) - toNumber(leftRisk[risk] ?? 0);
      if (difference !== 0) return difference;
    }
    const countDifference = strings(right.affected_obligation_ids).length
      - strings(left.affected_obligation_ids).length;
    return countDifference || compareCodePoints(String(left.root_issue_id), String(right.root_issue_id));
  });
  const rootIssueIds = sortArray(
    mapArray(output, (item) => String(item.root_issue_id)), compareCodePoints
  );
  const batchId = stableId('batch', { root_issue_ids: rootIssueIds });
  for (let index = 0; index < output.length; index += 1) output[index].batch_id = batchId;
  return output;
}

/** @param {Record<string, unknown>} obligation @param {Record<string, unknown>[]} cases @param {Map<string, Record<string, unknown>>} claimsById @param {string} lane @param {Record<string, unknown>|undefined} notApplicable */
function evidenceLevel(obligation, cases, claimsById, lane, notApplicable) {
  if (lane === 'blocked') return 'E0';
  if (lane === 'conditional') return 'E1';
  if (lane === 'not_applicable') {
    const claim = mapGet(claimsById, String(notApplicable?.exclusion_claim_id));
    return claim?.level === 'E2' ? 'E2' : 'E3';
  }
  const refs = makeSet();
  const initialRefs = [strings(obligation.source_claim_ids), strings(obligation.required_oracle_refs)];
  for (let groupIndex = 0; groupIndex < initialRefs.length; groupIndex += 1) {
    for (let index = 0; index < initialRefs[groupIndex].length; index += 1) {
      setAdd(refs, initialRefs[groupIndex][index]);
    }
  }
  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const evidenceRefs = strings(cases[caseIndex].evidence_refs);
    for (let refIndex = 0; refIndex < evidenceRefs.length; refIndex += 1) {
      setAdd(refs, evidenceRefs[refIndex]);
    }
  }
  const orderedRefs = setValuesArray(refs);
  for (let index = 0; index < orderedRefs.length; index += 1) {
    if (mapGet(claimsById, orderedRefs[index])?.level === 'E2') return 'E2';
  }
  return 'E3';
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations @param {Map<string, Record<string, unknown>>} claimsById */
function semanticSnapshot(classification, obligations, claimsById) {
  /** @type {Map<string, {lane:string,reason:string|null,cases:Record<string, unknown>[],notApplicable?:Record<string, unknown>}>} */
  const disposition = makeMap();
  const groundedCases = records(classification.grounded);
  for (let caseIndex = 0; caseIndex < groundedCases.length; caseIndex += 1) {
    const item = groundedCases[caseIndex];
    const ids = strings(item.obligation_ids);
    for (let idIndex = 0; idIndex < ids.length; idIndex += 1) {
      const id = ids[idIndex];
      const existing = mapGet(disposition, id) ?? { lane: 'grounded', reason: null, cases: [] };
      pushArray(existing.cases, item);
      mapSet(disposition, id, existing);
    }
  }
  const conditionalCases = records(classification.conditional);
  for (let caseIndex = 0; caseIndex < conditionalCases.length; caseIndex += 1) {
    const item = conditionalCases[caseIndex];
    const ids = strings(item.obligation_ids);
    for (let idIndex = 0; idIndex < ids.length; idIndex += 1) {
      const id = ids[idIndex];
      const existing = mapGet(disposition, id) ?? { lane: 'conditional', reason: null, cases: [] };
      pushArray(existing.cases, item);
      mapSet(disposition, id, existing);
    }
  }
  const blockedItems = records(classification.blocked);
  for (let index = 0; index < blockedItems.length; index += 1) mapSet(disposition,
    String(blockedItems[index].obligation_id), {
      lane: 'blocked', reason: String(blockedItems[index].reason), cases: []
    }
  );
  const notApplicableItems = records(classification.not_applicable);
  for (let index = 0; index < notApplicableItems.length; index += 1) mapSet(disposition,
    String(notApplicableItems[index].obligation_id), {
      lane: 'not_applicable', reason: null, cases: [], notApplicable: notApplicableItems[index]
    }
  );
  const points = sortArray(mapArray(obligations, (obligation) => {
    const state = mapGet(disposition, String(obligation.obligation_id));
    const lane = state?.lane ?? 'blocked';
    return {
      obligation_id: String(obligation.obligation_id),
      evidence_level: evidenceLevel(obligation, state?.cases ?? [], claimsById, lane, state?.notApplicable),
      classification: lane,
      blocked_reason: lane === 'blocked' ? (state?.reason ?? 'FORMAL_DISPOSITION_MISSING') : null
    };
  }), (left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
  const ids = (/** @type {string} */ lane) => sortArray(mapArray(
    filterArray(points, (item) => item.classification === lane),
    (item) => item.obligation_id
  ), compareCodePoints);
  const grounded = ids('grounded');
  const conditional = ids('conditional');
  const blocked = ids('blocked');
  const notApplicable = ids('not_applicable');
  const executableCount = grounded.length + conditional.length;
  const riskById = makeMap(mapArray(obligations, (item) => [String(item.obligation_id), String(item.risk)]));
  const hasHighBlocked = someArray(blocked, (id) =>
    mapGet(riskById, id) === 'critical' || mapGet(riskById, id) === 'high');
  const applicableCount = points.length - notApplicable.length;
  const deliveryStatus = applicableCount === 0 ? 'no_applicable_formal_test_points'
    : executableCount === 0 && blocked.length > 0 ? 'no_deterministic_cases'
      : executableCount > 0 && hasHighBlocked ? 'critical_gaps'
        : 'executable_subset_ready';
  return {
    formal_test_points: points,
    coverage_denominator: points.length,
    delivery_sections: {
      grounded, conditional, blocked,
      exploratory: sortArray(mapArray(
        records(classification.exploratory), (item) => String(item.exploratory_id)
      ), compareCodePoints),
      coverage: { formal_denominator: points.length },
      quality: { delivery_status: deliveryStatus }
    }
  };
}

/**
 * Evaluate one complete immutable revision without filesystem or network I/O.
 * This export is an internal test seam; `advanceStrict(runDirectory)` remains
 * the sole external Module Interface.
 * @param {unknown} submittedInput
 * @param {{interactionPolicy:'pause_for_clarification'|'record_only'}} options
 */
function evaluateRevisionCaptured(submittedInput, options) {
  const intrinsicDiagnostic = intrinsicIntegrityDiagnostic();
  if (intrinsicDiagnostic) return {
    status: 'need_revision', stage: 'schema', source_revision: 0,
    diagnostics: [intrinsicDiagnostic]
  };
  const normalized = normalizeInput(submittedInput);
  const capturedOptions = snapshotOwnData(options, '/options');
  appendArray(normalized.diagnostics, capturedOptions.diagnostics);
  const postSnapshotIntrinsicDiagnostic = intrinsicIntegrityDiagnostic();
  if (postSnapshotIntrinsicDiagnostic) return {
    status: 'need_revision', stage: 'schema', source_revision: 0,
    diagnostics: [postSnapshotIntrinsicDiagnostic]
  };
  const trustedOptions = capturedOptions.snapshot;
  const initialRevision = isRecord(normalized.input)
    && numberIsSafeInteger(normalized.input.source_revision)
    ? toNumber(normalized.input.source_revision) : 0;
  let interactionPolicy = '';
  if (!isRecord(trustedOptions)) pushArray(normalized.diagnostics, diagnostic(
    'classification', 'INTERACTION_POLICY_INVALID', '/interaction_policy',
    'pure core options must be a closed own-data record'
  ));
  else {
    requireClosed(trustedOptions, ['interactionPolicy'], '/options', normalized.diagnostics);
    const submittedPolicy = trustedOptions.interactionPolicy;
    interactionPolicy = typeof submittedPolicy === 'string' ? submittedPolicy : '';
    if (!setHas(POLICIES, interactionPolicy)) pushArray(normalized.diagnostics, diagnostic(
      'classification', 'INTERACTION_POLICY_INVALID', '/interaction_policy',
      'pure core accepts only the two frozen internal interaction policies'
    ));
  }
  if (normalized.diagnostics.length > 0 || !normalized.input) return revisionRequired(
    'schema', initialRevision, normalized.diagnostics
  );
  const input = normalized.input;
  const sourceRevision = toNumber(input.source_revision);
  try {
    const schemaDiagnostics = validateArtifactSchemas(input);
    if (schemaDiagnostics.length > 0) return revisionRequired('schema', sourceRevision, schemaDiagnostics);

    const sourcePolicy = resolveSourcePolicy(input.source_pack);
    const policyDiagnostics = diagnosticArray(sourcePolicy.diagnostics);
    if (policyDiagnostics.length > 0) return revisionRequired('source_policy', sourceRevision, policyDiagnostics);

    const evidence = validateEvidenceGraph(input.source_pack, input.evidence_claims);
    const evidenceDiagnostics = diagnosticArray(evidence.diagnostics);
    if (evidenceDiagnostics.length > 0) return revisionRequired('evidence_claims', sourceRevision, evidenceDiagnostics);
    const graph = evidenceContext(input, evidence.claimsById, records(sourcePolicy.conflicts));

    const viewValidation = validateBehaviorViews(graph, input.behavior_views);
    const interactionAudit = auditInteractionMatrix(input.behavior_views);
    const viewDiagnostics = diagnosticArray(viewValidation.diagnostics);
    appendArray(viewDiagnostics, diagnosticArray(interactionAudit.diagnostics));
    if (viewDiagnostics.length > 0) return revisionRequired('behavior_views', sourceRevision, viewDiagnostics);

    let obligations;
    try {
      obligations = compileObligations(graph, input.behavior_views);
    } catch (error) {
      if (error instanceof ObligationCompilationError) return revisionRequired(
        error.stage, sourceRevision, diagnosticArray(error.diagnostics)
      );
      throw error;
    }

    let classification = classifyCaseDrafts({
      sourceRevision,
      evidence: {
        claimsById: graph.claimsById,
        factLedger: graph.factLedger,
        conflicts: graph.conflicts
      },
      obligations,
      caseDrafts: input.case_drafts
    });
    if (classification.diagnostics.length > 0) return revisionRequired(
      'classification', sourceRevision, diagnosticArray(classification.diagnostics)
    );
    const unresolvedSourcePack = /** @type {Record<string, unknown>} */ (
      NATIVE_STRUCTURED_CLONE(input.source_pack)
    );
    unresolvedSourcePack.decision_records = [];
    const unresolvedPolicy = resolveSourcePolicy(unresolvedSourcePack);
    const potentialConflicts = records(unresolvedPolicy.conflicts);
    const conflictRelations = prepareConflictRelations(
      graph.claimsById, /** @type {Record<string, unknown>} */ (input.source_pack), potentialConflicts
    );
    const sourceConflictBridge = buildSourceConflictBridge(
      classification, records(obligations.obligations), conflictRelations, potentialConflicts
    );
    classification = applyLocalConflictBlocks(
      classification, records(obligations.obligations), graph.claimsById,
      /** @type {Record<string, unknown>} */ (input.source_pack), graph.conflicts,
      conflictRelations
    );
    if (classification.diagnostics.length > 0) return revisionRequired(
      'classification', sourceRevision, diagnosticArray(classification.diagnostics)
    );
    const semantics = semanticSnapshot(
      classification, records(obligations.obligations), graph.claimsById
    );
    const clarificationInput = /** @type {Record<string, unknown>} */ (input.clarification);
    const translatedClarification = translateClarificationAppend(
      clarificationInput, sourceConflictBridge
    );
    const clarification = evaluateClarification({
      source_revision: sourceRevision,
      blocked_obligations: blockedDescriptors(classification, records(obligations.obligations)),
      prior_state: translatedClarification.prior_state,
      append_batch: translatedClarification.append_batch,
      semantic_snapshot: semantics
    }, /** @type {'pause_for_clarification'|'record_only'} */ (interactionPolicy));
    if (clarification.diagnostics.length > 0) return revisionRequired(
      'clarification', sourceRevision, diagnosticArray(clarification.diagnostics)
    );
    if (clarification.action === 'need_user_answers') return {
      status: 'need_user_answers', source_revision: sourceRevision,
      pending_root_issues: externalizePendingRoots(
        clarification.pending_root_issues, graph.conflicts, sourceConflictBridge
      ),
      clarification_state: NATIVE_STRUCTURED_CLONE(clarification.state),
      semantic_snapshot: NATIVE_STRUCTURED_CLONE(clarification.semantic_snapshot),
      diagnostics: []
    };

    let bundle;
    try {
      const bundleClassification = bindBlockedRootIdentity(
        classification, records(obligations.obligations)
      );
      bundle = buildBundle({
        schema_version: '1.0.0', source_revision: sourceRevision,
        compiler_version: input.compiler_version, lineage: input.lineage,
        evidence_claims: input.evidence_claims, obligations_artifact: obligations,
        classification: bundleClassification, clarification,
        limits: input.limits, expert_recall_limits: input.expert_recall_limits
      });
    } catch (error) {
      if (error instanceof BundleReconciliationError) return revisionRequired(
        error.stage, sourceRevision, diagnosticArray(error.diagnostics)
      );
      throw error;
    }
    let markdown;
    try {
      markdown = renderMarkdown(bundle);
    } catch (error) {
      if (error instanceof BundleRenderError) return revisionRequired(
        error.stage, sourceRevision, diagnosticArray(error.diagnostics)
      );
      throw error;
    }
    return {
      status: 'finished', source_revision: sourceRevision,
      bundle, bundle_digest: digest(bundle), markdown, markdown_digest: digest(markdown),
      clarification_state: NATIVE_STRUCTURED_CLONE(clarification.state), diagnostics: []
    };
  } catch {
    return revisionRequired('core', sourceRevision, [diagnostic(
      'classification', 'CORE_EVALUATION_FAILED', '/',
      'complete revision evaluation failed without exposing an internal exception'
    )]);
  }
}

/**
 * Contain every public-boundary failure, including mutable-global attacks that
 * occur before the trusted snapshot can establish a source revision.
 * @param {unknown} submittedInput
 * @param {{interactionPolicy:'pause_for_clarification'|'record_only'}} options
 */
export function evaluateRevision(submittedInput, options) {
  try {
    return evaluateRevisionCaptured(submittedInput, options);
  } catch {
    return {
      status: 'need_revision', stage: 'core', source_revision: 0,
      diagnostics: [{
        category: 'classification', code: 'CORE_EVALUATION_FAILED', path: '/',
        message: 'complete revision evaluation failed without exposing an internal exception'
      }]
    };
  }
}
