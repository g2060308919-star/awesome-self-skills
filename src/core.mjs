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
const POLICIES = new Set(['pause_for_clarification', 'record_only']);
const DIAGNOSTIC_LIMIT = 256;
const SOURCE_POLICY_ROOT_REF_PREFIX = 'source-policy-root:';
const NATIVE_ARRAY = Array;
const NATIVE_ARRAY_PROTOTYPE = Array.prototype;
const NATIVE_ARRAY_FROM = Array.from;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_ARRAY_ITERATOR = Array.prototype[Symbol.iterator];
const NATIVE_ARRAY_FILTER = Array.prototype.filter;
const NATIVE_ARRAY_FLAT_MAP = Array.prototype.flatMap;
const NATIVE_ARRAY_MAP = Array.prototype.map;
const NATIVE_ARRAY_POP = Array.prototype.pop;
const NATIVE_ARRAY_PUSH = Array.prototype.push;
const NATIVE_ARRAY_SLICE = Array.prototype.slice;
const NATIVE_ARRAY_SOME = Array.prototype.some;
const NATIVE_ARRAY_SORT = Array.prototype.sort;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTORS = Object.getOwnPropertyDescriptors;
const NATIVE_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const NATIVE_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const NATIVE_HAS_OWN = Object.hasOwn;
const NATIVE_MAP_ENTRIES = Map.prototype.entries;
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
  return /** @type {number} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_PUSH, values, items));
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

/** @template T @param {T[]} values @param {(left:T,right:T)=>number} comparator */
function sortArray(values, comparator) {
  return /** @type {T[]} */ (NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SORT, values, [comparator]));
}

function arrayIntrinsicIntegrityDiagnostic() {
  try {
    const iteratorDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(
      NATIVE_ARRAY_PROTOTYPE, Symbol.iterator
    );
    const sortDescriptor = NATIVE_GET_OWN_PROPERTY_DESCRIPTOR(NATIVE_ARRAY_PROTOTYPE, 'sort');
    if (iteratorDescriptor && NATIVE_HAS_OWN(iteratorDescriptor, 'value')
      && iteratorDescriptor.value === NATIVE_ARRAY_ITERATOR
      && sortDescriptor && NATIVE_HAS_OWN(sortDescriptor, 'value')
      && sortDescriptor.value === NATIVE_ARRAY_SORT) return null;
  } catch {
    // Fall through to a stable fail-closed diagnostic.
  }
  return diagnostic(
    'schema', 'CORE_INTRINSIC_INVALID', '/intrinsics/Array.prototype',
    'pure-core evaluation requires the captured native Array traversal intrinsics'
  );
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  if (!value || typeof value !== 'object' || NATIVE_ARRAY_IS_ARRAY(value)) return false;
  const prototype = NATIVE_GET_PROTOTYPE_OF(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {string} left @param {string} right */
function compareCodePoints(left, right) {
  const leftPoints = NATIVE_ARRAY_FROM(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = NATIVE_ARRAY_FROM(right, (character) => character.codePointAt(0) ?? 0);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) return leftPoints[index] - rightPoints[index];
  }
  return leftPoints.length - rightPoints.length;
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
  const unique = new Map();
  let overflow = false;
  for (let index = 0; index < diagnostics.length; index += 1) {
    const item = diagnostics[index];
    if (item.code === 'DIAGNOSTICS_TRUNCATED') overflow = true;
    else unique.set(canonicalStringify(item), item);
  }
  if (unique.size > DIAGNOSTIC_LIMIT) overflow = true;
  const ordered = sortArray([...unique.values()], (left, right) =>
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
  const allowed = new Set();
  for (let index = 0; index < expected.length; index += 1) allowed.add(expected[index]);
  const actualKeys = NATIVE_OBJECT_KEYS(value);
  for (let index = 0; index < actualKeys.length; index += 1) {
    const key = actualKeys[index];
    if (!allowed.has(key)) pushArray(diagnostics, diagnostic(
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
  const seen = new WeakMap();
  let cursor = 0;
  while (cursor < pending.length) {
    const frame = pending[cursor++];
    const source = frame.source;
    if (source === null || typeof source === 'string' || typeof source === 'boolean'
      || (typeof source === 'number' && Number.isFinite(source))) {
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
    const cached = seen.get(source);
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
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
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
      const declaredLength = Number(lengthDescriptor?.value);
      /** @type {string[]} */
      const numericKeys = [];
      let malformed = !Number.isSafeInteger(declaredLength) || declaredLength < 0;
      for (let keyIndex = 0; keyIndex < stringKeys.length; keyIndex += 1) {
        const key = stringKeys[keyIndex];
        if (key === 'length') continue;
        if (/^(0|[1-9][0-9]*)$/u.test(key) && Number(key) < 4294967295) pushArray(numericKeys, key);
        else {
          malformed = true;
          pushArray(diagnostics, diagnostic(
            'schema', 'CORE_ARRAY_PROPERTY_INVALID', `${frame.path}/${pointerPart(key)}`,
            'controlled arrays cannot define named properties'
          ));
        }
      }
      sortArray(numericKeys, (left, right) => Number(left) - Number(right));
      let firstHole = -1;
      if (!malformed && numericKeys.length !== declaredLength) {
        let expected = 0;
        for (let index = 0; index < numericKeys.length; index += 1) {
          const actual = Number(numericKeys[index]);
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
      seen.set(source, target);
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
    seen.set(source, target);
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
  const sourceRevision = Number(input.source_revision);
  if (input.schema_version !== '1.0.0') pushArray(diagnostics, diagnostic(
    'schema', 'CORE_SCHEMA_VERSION_INVALID', '/schema_version', 'pure core requires schema version 1.0.0'
  ));
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) pushArray(diagnostics, diagnostic(
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
  for (const [artifact, schema] of [
    [input.source_pack, sourcePackSchema],
    [input.evidence_claims, evidenceClaimsSchema],
    [input.behavior_views, behaviorViewsSchema],
    [input.case_drafts, caseDraftsSchema]
  ]) {
    appendArray(diagnostics, /** @type {Diagnostic[]} */ (validateAgainstSchema(artifact, schema)));
    appendArray(diagnostics, /** @type {Diagnostic[]} */ (validateUniqueStableIds(artifact)));
  }
  const revision = Number(input.source_revision);
  for (const [name, artifact] of [
    ['source_pack', input.source_pack], ['evidence_claims', input.evidence_claims],
    ['behavior_views', input.behavior_views], ['case_drafts', input.case_drafts]
  ]) if (!isRecord(artifact) || artifact.source_revision !== revision) pushArray(diagnostics, diagnostic(
    'traceability', 'CORE_SOURCE_REVISION_MISMATCH', `/${name}/source_revision`,
    'every submitted artifact must identify the complete revision being evaluated'
  ));
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
      sourceRevision: Number(input.source_revision),
      contextsByViewId: new Map(NATIVE_OBJECT_ENTRIES(NATIVE_STRUCTURED_CLONE(contexts))),
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
 */
function applyLocalConflictBlocks(classification, obligations, claimsById, sourcePack, conflicts) {
  if (conflicts.length === 0) return classification;
  const locatorSourceById = new Map(mapArray(records(sourcePack.locators), (item) => [
    String(item.locator_id), String(item.source_id)
  ]));
  /** @type {Map<string, Record<string, unknown>[]>} */
  const conflictsBySourceId = new Map();
  for (let index = 0; index < conflicts.length; index += 1) {
    const conflict = conflicts[index];
    const uniqueSourceIds = new Set(strings(conflict.source_ids));
    for (const sourceId of uniqueSourceIds) {
      const bucket = conflictsBySourceId.get(sourceId);
      if (bucket) pushArray(bucket, conflict);
      else conflictsBySourceId.set(sourceId, [conflict]);
    }
  }
  /** @type {Map<string, Set<string>>} */
  const sourceIdsByClaim = new Map();
  /** @param {string} root */
  function sourceIdsFor(root) {
    const cached = sourceIdsByClaim.get(root);
    if (cached) return cached;
    const result = new Set();
    const pending = [root];
    const seen = new Set();
    while (pending.length > 0) {
      const claimId = NATIVE_REFLECT_APPLY(NATIVE_ARRAY_POP, pending, []);
      if (claimId === undefined || seen.has(claimId)) continue;
      seen.add(claimId);
      const claim = claimsById.get(claimId);
      if (!claim) continue;
      if (typeof claim.source_id === 'string') result.add(claim.source_id);
      for (const locatorId of strings(claim.source_locator_ids)) {
        const sourceId = locatorSourceById.get(locatorId);
        if (sourceId !== undefined) result.add(sourceId);
      }
      for (const parentId of strings(claim.parent_claim_ids)) pushArray(pending, parentId);
    }
    sourceIdsByClaim.set(root, result);
    return result;
  }

  const executable = [
    ...mapArray(records(classification.grounded), (item) => ({ lane: 'grounded', item })),
    ...mapArray(records(classification.conditional), (item) => ({ lane: 'conditional', item }))
  ];
  /** @type {Map<string, number[]>} */
  const casesByObligation = new Map();
  for (let index = 0; index < executable.length; index += 1) {
    for (const obligationId of strings(executable[index].item.obligation_ids)) {
      const bucket = casesByObligation.get(obligationId);
      if (bucket) pushArray(bucket, index);
      else casesByObligation.set(obligationId, [index]);
    }
  }
  const obligationsById = new Map(mapArray(obligations, (item) => [String(item.obligation_id), item]));
  const blockedByObligation = new Map(mapArray(records(classification.blocked), (item) => [
    String(item.obligation_id), NATIVE_STRUCTURED_CLONE(item)
  ]));
  const blockedQueue = sortArray([...blockedByObligation.keys()], compareCodePoints);
  const invalidCases = new Set();

  /** @param {string} obligationId @param {string} reason @param {string[]} evidenceRefs @param {string|null} rootIssueId */
  function block(obligationId, reason, evidenceRefs, rootIssueId) {
    const obligation = obligationsById.get(obligationId);
    if (!obligation) return;
    const existing = blockedByObligation.get(obligationId);
    const reasons = new Set([...(existing ? String(existing.reason).split(',') : []), reason]);
    reasons.delete('');
    const refs = new Set([...(existing ? strings(existing.evidence_refs) : []), ...evidenceRefs]);
    blockedByObligation.set(obligationId, {
      obligation_id: obligationId,
      root_issue_id: rootIssueId ?? String(existing?.root_issue_id ?? stableId('root', {
        missing_type: 'case-classification', obligation_id: obligationId,
        reason_codes: sortArray([...reasons], compareCodePoints), scope: obligation.scope
      })),
      reason: sortArray([...reasons], compareCodePoints).join(','),
      risk: String(obligation.risk), evidence_refs: sortArray([...refs], compareCodePoints)
    });
    if (!existing) pushArray(blockedQueue, obligationId);
  }

  for (let index = 0; index < executable.length; index += 1) {
    const caseDraft = executable[index].item;
    const caseSources = new Set();
    for (const ref of strings(caseDraft.evidence_refs)) {
      for (const sourceId of sourceIdsFor(ref)) caseSources.add(sourceId);
    }
    /** @type {Map<string, Record<string, unknown>>} */
    const candidatesByIdentity = new Map();
    for (const sourceId of caseSources) {
      for (const candidate of conflictsBySourceId.get(sourceId) ?? []) {
        const identity = typeof candidate.conflict_id === 'string' ? candidate.conflict_id
          : typeof candidate.root_issue_id === 'string' ? candidate.root_issue_id
            : canonicalStringify(candidate);
        candidatesByIdentity.set(identity, candidate);
      }
    }
    const candidates = sortArray(NATIVE_ARRAY_FROM(NATIVE_REFLECT_APPLY(
      NATIVE_MAP_ENTRIES, candidatesByIdentity, []
    )), (left, right) =>
      compareCodePoints(left[0], right[0]));
    let conflict;
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
      const candidate = candidates[candidateIndex][1];
      const conflictScope = candidate.scope;
      if (typeof conflictScope === 'string' && typeof caseDraft.scope === 'string'
        && scopesIntersect(caseDraft.scope, conflictScope)) {
        conflict = candidate;
        break;
      }
    }
    if (!conflict) continue;
    invalidCases.add(index);
    for (const obligationId of strings(caseDraft.obligation_ids)) block(
      obligationId, 'UNRESOLVED_CONFLICT', strings(caseDraft.evidence_refs),
      typeof conflict.root_issue_id === 'string' ? conflict.root_issue_id : null
    );
  }

  let cursor = 0;
  while (cursor < blockedQueue.length) {
    const blockedId = blockedQueue[cursor++];
    for (const caseIndex of casesByObligation.get(blockedId) ?? []) {
      if (invalidCases.has(caseIndex)) continue;
      invalidCases.add(caseIndex);
      const caseDraft = executable[caseIndex].item;
      for (const obligationId of strings(caseDraft.obligation_ids)) block(
        obligationId, 'CASE_SHARES_BLOCKED_OBLIGATION', strings(caseDraft.evidence_refs), null
      );
    }
  }

  return {
    ...classification,
    grounded: mapArray(filterArray(executable, (item, index) =>
      item.lane === 'grounded' && !invalidCases.has(index)), (item) => item.item),
    conditional: mapArray(filterArray(executable, (item, index) =>
      item.lane === 'conditional' && !invalidCases.has(index)), (item) => item.item),
    blocked: sortArray([...blockedByObligation.values()], (left, right) =>
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
  const refs = new Set([
    ...strings(obligation.source_claim_ids),
    ...strings(obligation.required_oracle_refs),
    ...strings(obligation.view_element_refs)
  ]);
  if (refs.size === 0) refs.add(String(obligation.obligation_id));
  if (reason.includes('CONFLICT')) refs.add('unresolved-source-policy');
  return sortArray([...refs], compareCodePoints);
}

/** @param {Record<string, unknown>[]} conflicts */
function conflictsByRootId(conflicts) {
  const output = new Map();
  for (const conflict of conflicts) if (typeof conflict.root_issue_id === 'string') {
    output.set(conflict.root_issue_id, conflict);
  }
  return output;
}

/**
 * Task9 derives its private state identity from semantic refs. Preserve the
 * canonical source-policy root as a semantic marker so the adapter can expose
 * and consume that same identity without mutating the source-policy result.
 * @param {Record<string, unknown>} obligation
 * @param {Record<string, unknown>} blockedItem
 * @param {Map<string, Record<string, unknown>>} conflictByRoot
 */
function blockedSemanticRefs(obligation, blockedItem, conflictByRoot) {
  const reason = String(blockedItem.reason);
  const rootIssueId = String(blockedItem.root_issue_id ?? '');
  if (reason.includes('CONFLICT') && conflictByRoot.has(rootIssueId)) {
    return [`${SOURCE_POLICY_ROOT_REF_PREFIX}${rootIssueId}`];
  }
  return semanticRefs(obligation, reason);
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations @param {Record<string, unknown>[]} conflicts */
function bindBlockedRootIdentity(classification, obligations, conflicts) {
  const obligationById = new Map(mapArray(obligations, (item) => [String(item.obligation_id), item]));
  const conflictByRoot = conflictsByRootId(conflicts);
  const blocked = mapArray(records(classification.blocked), (item) => {
    const obligation = obligationById.get(String(item.obligation_id)) ?? {};
    const signature = {
      missing_type: missingType(String(item.reason)),
      semantic_refs: blockedSemanticRefs(obligation, item, conflictByRoot),
      scope: String(obligation.scope ?? '')
    };
    return { ...item, root_issue_id: stableId('root', signature) };
  });
  return { ...classification, blocked };
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations @param {Record<string, unknown>[]} conflicts */
function blockedDescriptors(classification, obligations, conflicts) {
  const obligationById = new Map(mapArray(obligations, (item) => [String(item.obligation_id), item]));
  const conflictByRoot = conflictsByRootId(conflicts);
  return sortArray(mapArray(records(classification.blocked), (item) => {
    const obligation = obligationById.get(String(item.obligation_id)) ?? {};
    const reason = String(item.reason);
    const type = missingType(reason);
    const scope = String(obligation.scope ?? 'unknown');
    const technical = reason.includes('UNAVAILABLE') || reason.includes('UNKNOWN')
      || reason.includes('MISSING_CAPABILITY') || reason.includes('MISSING_OBSERVER')
      || reason.includes('MISSING_CONTROL');
    return {
      obligation_id: String(item.obligation_id), missing_type: type,
      semantic_refs: blockedSemanticRefs(obligation, item, conflictByRoot), scope,
      risk: String(item.risk), reason, evidence_refs: sortArray(strings(item.evidence_refs), compareCodePoints),
      answerable: !technical,
      question: `Clarification required for ${type} in ${scope}.`
    };
  }), (left, right) => compareCodePoints(left.obligation_id, right.obligation_id));
}

/** @param {unknown} value */
function sourcePolicyRootRef(value) {
  if (typeof value !== 'string' || !value.startsWith(SOURCE_POLICY_ROOT_REF_PREFIX)) return null;
  const rootIssueId = value.slice(SOURCE_POLICY_ROOT_REF_PREFIX.length);
  return rootIssueId.length > 0 ? rootIssueId : null;
}

/**
 * Translate user-visible source-policy root IDs back to Task9's private root
 * identities before validating a Decision/control append batch.
 * @param {Record<string, unknown>} clarificationInput
 */
function translateClarificationAppend(clarificationInput) {
  const output = NATIVE_STRUCTURED_CLONE(clarificationInput);
  if (!isRecord(output.prior_state) || !isRecord(output.append_batch)) return output;
  /** @type {Map<string, Set<string>>} */
  const internalBySourceRoot = new Map();
  for (const ledgerItem of records(output.prior_state.root_snapshot_ledger)) {
    for (const ref of strings(ledgerItem.semantic_refs)) {
      const sourceRootId = sourcePolicyRootRef(ref);
      if (sourceRootId === null) continue;
      const ids = internalBySourceRoot.get(sourceRootId) ?? new Set();
      ids.add(String(ledgerItem.root_issue_id));
      internalBySourceRoot.set(sourceRootId, ids);
    }
  }
  /** @param {unknown} rootIds */
  function translateRootIds(rootIds) {
    const translated = new Set();
    let changed = false;
    for (const rootId of strings(rootIds)) {
      const internal = internalBySourceRoot.get(rootId);
      if (internal) {
        for (const internalId of internal) {
          translated.add(internalId);
          if (internalId !== rootId) changed = true;
        }
      }
      else translated.add(rootId);
    }
    return { ids: sortArray([...translated], compareCodePoints), changed };
  }
  for (const decision of records(output.append_batch.decision_records)) {
    const externalRootIds = sortArray(strings(decision.root_issue_ids), compareCodePoints);
    const expectedExternalQuestionId = stableId('question', { root_issue_ids: externalRootIds });
    const submittedQuestionId = decision.question_id;
    const translated = translateRootIds(decision.root_issue_ids);
    decision.root_issue_ids = translated.ids;
    if (translated.changed) decision.question_id = submittedQuestionId === expectedExternalQuestionId
      ? stableId('question', { root_issue_ids: decision.root_issue_ids }) : '';
  }
  for (const event of records(output.append_batch.clarification_events)) {
    event.root_issue_ids = translateRootIds(event.root_issue_ids).ids;
  }
  return output;
}

/**
 * Keep Task9 state private while surfacing source-policy canonical root IDs to
 * callers. Recompute the batch identity after aliasing and group aliases before
 * presentation so ordering is independent of Case/input order.
 * @param {unknown} pending
 * @param {Record<string, unknown>[]} conflicts
 */
function externalizePendingRoots(pending, conflicts) {
  const conflictByRoot = conflictsByRootId(conflicts);
  /** @type {Map<string, any>} */
  const grouped = new Map();
  for (const submitted of records(pending)) {
    const item = NATIVE_STRUCTURED_CLONE(submitted);
    let sourceRootId = null;
    for (const ref of strings(item.semantic_refs)) {
      sourceRootId = sourcePolicyRootRef(ref);
      if (sourceRootId !== null) break;
    }
    const conflict = sourceRootId === null ? null : conflictByRoot.get(sourceRootId);
    const externalId = conflict && sourceRootId ? sourceRootId : String(item.root_issue_id);
    if (conflict) {
      item.root_issue_id = externalId;
      item.root_issue_key = canonicalStringify({
        missing_type: 'source-conflict',
        rule_ids: sortArray(strings(conflict.rule_ids), compareCodePoints),
        scope: String(conflict.scope),
        source_ids: sortArray(strings(conflict.source_ids), compareCodePoints)
      });
    }
    const existing = grouped.get(externalId);
    if (!existing) grouped.set(externalId, item);
    else {
      existing.affected_obligation_ids = sortArray([...new Set([
        ...strings(existing.affected_obligation_ids), ...strings(item.affected_obligation_ids)
      ])], compareCodePoints);
      existing.reasons = sortArray([...new Set([
        ...strings(existing.reasons), ...strings(item.reasons)
      ])], compareCodePoints);
      existing.evidence_refs = sortArray([...new Set([
        ...strings(existing.evidence_refs), ...strings(item.evidence_refs)
      ])], compareCodePoints);
      const itemRiskCounts = isRecord(item.risk_counts) ? item.risk_counts : {};
      for (const risk of ['critical', 'high', 'medium', 'low']) {
        existing.risk_counts[risk] = Number(existing.risk_counts[risk]) + Number(itemRiskCounts[risk]);
      }
    }
  }
  const output = sortArray([...grouped.values()], (left, right) =>
    compareCodePoints(String(left.root_issue_id), String(right.root_issue_id)));
  const rootIssueIds = mapArray(output, (item) => String(item.root_issue_id));
  const batchId = stableId('batch', { root_issue_ids: rootIssueIds });
  for (const item of output) item.batch_id = batchId;
  return output;
}

/** @param {Record<string, unknown>} obligation @param {Record<string, unknown>[]} cases @param {Map<string, Record<string, unknown>>} claimsById @param {string} lane @param {Record<string, unknown>|undefined} notApplicable */
function evidenceLevel(obligation, cases, claimsById, lane, notApplicable) {
  if (lane === 'blocked') return 'E0';
  if (lane === 'conditional') return 'E1';
  if (lane === 'not_applicable') {
    const claim = claimsById.get(String(notApplicable?.exclusion_claim_id));
    return claim?.level === 'E2' ? 'E2' : 'E3';
  }
  const refs = new Set([...strings(obligation.source_claim_ids), ...strings(obligation.required_oracle_refs)]);
  for (const item of cases) for (const ref of strings(item.evidence_refs)) refs.add(ref);
  for (const ref of refs) if (claimsById.get(ref)?.level === 'E2') return 'E2';
  return 'E3';
}

/** @param {any} classification @param {Record<string, unknown>[]} obligations @param {Map<string, Record<string, unknown>>} claimsById */
function semanticSnapshot(classification, obligations, claimsById) {
  /** @type {Map<string, {lane:string,reason:string|null,cases:Record<string, unknown>[],notApplicable?:Record<string, unknown>}>} */
  const disposition = new Map();
  for (const item of records(classification.grounded)) for (const id of strings(item.obligation_ids)) {
    const existing = disposition.get(id) ?? { lane: 'grounded', reason: null, cases: [] };
    pushArray(existing.cases, item);
    disposition.set(id, existing);
  }
  for (const item of records(classification.conditional)) for (const id of strings(item.obligation_ids)) {
    const existing = disposition.get(id) ?? { lane: 'conditional', reason: null, cases: [] };
    pushArray(existing.cases, item);
    disposition.set(id, existing);
  }
  for (const item of records(classification.blocked)) disposition.set(String(item.obligation_id), {
    lane: 'blocked', reason: String(item.reason), cases: []
  });
  for (const item of records(classification.not_applicable)) disposition.set(String(item.obligation_id), {
    lane: 'not_applicable', reason: null, cases: [], notApplicable: item
  });
  const points = sortArray(mapArray(obligations, (obligation) => {
    const state = disposition.get(String(obligation.obligation_id));
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
  const riskById = new Map(mapArray(obligations, (item) => [String(item.obligation_id), String(item.risk)]));
  const hasHighBlocked = someArray(blocked, (id) =>
    riskById.get(id) === 'critical' || riskById.get(id) === 'high');
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
export function evaluateRevision(submittedInput, options) {
  const intrinsicDiagnostic = arrayIntrinsicIntegrityDiagnostic();
  if (intrinsicDiagnostic) return {
    status: 'need_revision', stage: 'schema', source_revision: 0,
    diagnostics: [intrinsicDiagnostic]
  };
  const normalized = normalizeInput(submittedInput);
  const capturedOptions = snapshotOwnData(options, '/options');
  appendArray(normalized.diagnostics, capturedOptions.diagnostics);
  const postSnapshotIntrinsicDiagnostic = arrayIntrinsicIntegrityDiagnostic();
  if (postSnapshotIntrinsicDiagnostic) return {
    status: 'need_revision', stage: 'schema', source_revision: 0,
    diagnostics: [postSnapshotIntrinsicDiagnostic]
  };
  const trustedOptions = capturedOptions.snapshot;
  const initialRevision = isRecord(normalized.input) && Number.isSafeInteger(normalized.input.source_revision)
    ? Number(normalized.input.source_revision) : 0;
  let interactionPolicy = '';
  if (!isRecord(trustedOptions)) pushArray(normalized.diagnostics, diagnostic(
    'classification', 'INTERACTION_POLICY_INVALID', '/interaction_policy',
    'pure core options must be a closed own-data record'
  ));
  else {
    requireClosed(trustedOptions, ['interactionPolicy'], '/options', normalized.diagnostics);
    const submittedPolicy = trustedOptions.interactionPolicy;
    interactionPolicy = typeof submittedPolicy === 'string' ? submittedPolicy : '';
    if (!POLICIES.has(interactionPolicy)) pushArray(normalized.diagnostics, diagnostic(
      'classification', 'INTERACTION_POLICY_INVALID', '/interaction_policy',
      'pure core accepts only the two frozen internal interaction policies'
    ));
  }
  if (normalized.diagnostics.length > 0 || !normalized.input) return revisionRequired(
    'schema', initialRevision, normalized.diagnostics
  );
  const input = normalized.input;
  const sourceRevision = Number(input.source_revision);
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
    const viewDiagnostics = [
      ...diagnosticArray(viewValidation.diagnostics), ...diagnosticArray(interactionAudit.diagnostics)
    ];
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
    classification = applyLocalConflictBlocks(
      classification, records(obligations.obligations), graph.claimsById,
      /** @type {Record<string, unknown>} */ (input.source_pack), graph.conflicts
    );
    const semantics = semanticSnapshot(
      classification, records(obligations.obligations), graph.claimsById
    );
    const clarificationInput = /** @type {Record<string, unknown>} */ (input.clarification);
    const translatedClarification = translateClarificationAppend(clarificationInput);
    const clarification = evaluateClarification({
      source_revision: sourceRevision,
      blocked_obligations: blockedDescriptors(
        classification, records(obligations.obligations), graph.conflicts
      ),
      prior_state: translatedClarification.prior_state,
      append_batch: translatedClarification.append_batch,
      semantic_snapshot: semantics
    }, /** @type {'pause_for_clarification'|'record_only'} */ (interactionPolicy));
    if (clarification.diagnostics.length > 0) return revisionRequired(
      'clarification', sourceRevision, diagnosticArray(clarification.diagnostics)
    );
    if (clarification.action === 'need_user_answers') return {
      status: 'need_user_answers', source_revision: sourceRevision,
      pending_root_issues: externalizePendingRoots(clarification.pending_root_issues, graph.conflicts),
      clarification_state: NATIVE_STRUCTURED_CLONE(clarification.state),
      semantic_snapshot: NATIVE_STRUCTURED_CLONE(clarification.semantic_snapshot),
      diagnostics: []
    };

    let bundle;
    try {
      const bundleClassification = bindBlockedRootIdentity(
        classification, records(obligations.obligations), graph.conflicts
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
