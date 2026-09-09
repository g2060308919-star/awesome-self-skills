import { stableId } from './canonical.mjs';
import { sourceByteDigest } from './source-canonicalization.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';

const registries = new WeakMap();
/** @param {string} left @param {string} right */
function compare(left, right) {
  const a = Array.from(left, c => c.codePointAt(0) ?? 0); const b = Array.from(right, c => c.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}
/** Generic typed JSON canonicalization deliberately has no legacy path-name set heuristics.
 * @param {any} value @param {any} [schema] @returns {any}
 */
function canonicalValue(value, schema = {}) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    const result = value.map(item => canonicalValue(item, schema.items));
    return schema.uniqueItems === true ? result.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))) : result;
  }
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort(compare)
    .map(key => [key, canonicalValue(value[key], schema.properties?.[key] ?? schema.additionalProperties)]));
  throw new TypeError('SOURCE_SUBJECT_INVALID');
}
/** @param {any} value */
const canonicalJson = value => JSON.stringify(canonicalValue(value));
/** @param {any} value */
const hash = value => sourceByteDigest(new TextEncoder().encode(canonicalJson(value)));
/** Descriptive claim prose cannot substitute for the typed normative value.
 * @param {any} claim
 */
const valueOf = claim => Object.hasOwn(claim, 'semantic_value') ? claim.semantic_value : claim.value;

/** Compiler-owned stable-ID registries and optional closed condition Schema.
 * uniqueItems on a condition collection is the explicit set contract; otherwise
 * array order remains semantic. The runtime resolver, not Agent artifacts, owns it.
 * @param {any} definition
 */
export function createSourceSubjectRegistry(definition) {
  if (!definition || Object.keys(definition).some(key => !['scope_refs', 'module_ids', 'entity_types', 'condition_schema'].includes(key))) throw new TypeError('SOURCE_SUBJECT_REGISTRY_INVALID');
  for (const key of ['scope_refs', 'module_ids', 'entity_types']) if (!Array.isArray(definition[key]) || definition[key].length === 0
    || definition[key].some((/** @type {any} */ item) => typeof item !== 'string' || !item.trim())
    || new Set(definition[key]).size !== definition[key].length) throw new TypeError('SOURCE_SUBJECT_REGISTRY_INVALID');
  const registry = Object.freeze({}); registries.set(registry, structuredClone(definition)); return registry;
}

/** @param {any} descriptor @param {object} registry */
export function canonicalSourceSubject(descriptor, registry) {
  const definition = registries.get(registry);
  if (!definition) throw new TypeError('SOURCE_SUBJECT_REGISTRY_INVALID');
  if (!descriptor || Object.keys(descriptor).sort().join(',') !== 'condition,entity_key,entity_type,field_path,module_id,scope_ref'
    || !definition.scope_refs.includes(descriptor.scope_ref) || !definition.module_ids.includes(descriptor.module_id)
    || !definition.entity_types.includes(descriptor.entity_type) || typeof descriptor.entity_key !== 'string'
    || !descriptor.entity_key.trim() || typeof descriptor.field_path !== 'string' || !descriptor.field_path.startsWith('/')
    || /~(?![01])/u.test(descriptor.field_path)
    || (definition.condition_schema && validateAgainstSchema(descriptor.condition, definition.condition_schema).length)) throw new TypeError('SOURCE_SUBJECT_INVALID');
  const fieldPath = descriptor.field_path.split('/').slice(1).map((/** @type {string} */ part) => part.replace(/~1/gu, '/').replace(/~0/gu, '~')
    .normalize('NFC').replace(/~/gu, '~0').replace(/\//gu, '~1')).join('/');
  const subject = {
    scope_ref: descriptor.scope_ref, module_id: descriptor.module_id, entity_type: descriptor.entity_type,
    entity_key: descriptor.entity_key.normalize('NFC'), field_path: '/' + fieldPath,
    condition: canonicalValue(descriptor.condition, definition.condition_schema)
  };
  return { subject_descriptor: subject, subject_key: hash(subject) };
}

/** @param {string} code @param {number} index */
const diagnostic = (code, index) => ({ category: 'reference', code, path: '/source_policy/rules/' + index, message: 'Source composition and exact same-subject conflict reviews must agree.' });
/** @param {any} pack @param {any[]} claims @param {object} registry */
export function resolveV4SourceComposition(pack, claims, registry) {
  /** @type {any[]} */ const diagnostics = [];
  /** @type {any[]} */ const conflicts = [];
  /** @type {any[]} */ const audit = [];
  const effective = new Set();
  const sources = new Set((pack.sources ?? []).map((/** @type {any} */ item) => item.source_id));
  for (const [index, rule] of (pack.source_policy?.rules ?? []).entries()) {
    if (rule.status !== 'effective') continue;
    const mode = rule.composition_mode ?? 'single_source';
    const sourceIds = rule.source_ids ?? [];
    const rows = claims.filter(claim => claim.claim_form === 'direct' && claim.kind === 'requirement' && sourceIds.includes(claim.source_id));
    const localStart = diagnostics.length;
    if (!['single_source', 'merge_non_overlapping', 'consensus', 'priority_order'].includes(mode)
      || !Array.isArray(sourceIds) || !sourceIds.length || new Set(sourceIds).size !== sourceIds.length || sourceIds.some((/** @type {any} */ id) => !sources.has(id))) {
      diagnostics.push(diagnostic('SOURCE_COMPOSITION_INVALID', index)); continue;
    }
    if (mode === 'single_source' && sourceIds.length !== 1) { diagnostics.push(diagnostic('SOURCE_COMPOSITION_SINGLE_SOURCE', index)); continue; }
    if (mode === 'priority_order' && (!Array.isArray(rule.priority_order) || rule.priority_order.length !== sourceIds.length
      || new Set(rule.priority_order).size !== sourceIds.length || rule.priority_order.some((/** @type {any} */ id) => !sourceIds.includes(id)))) {
      diagnostics.push(diagnostic('SOURCE_PRIORITY_ORDER_INVALID', index)); continue;
    }
    /** @type {Map<string,any[]>} */ const bySubject = new Map();
    for (const claim of rows) {
      try {
        const subject = canonicalSourceSubject(claim.subject_descriptor, registry);
        if (claim.subject_key !== undefined && claim.subject_key !== subject.subject_key) throw new TypeError('SOURCE_SUBJECT_INVALID');
        canonicalValue(valueOf(claim));
        bySubject.set(subject.subject_key, [...(bySubject.get(subject.subject_key) ?? []), claim]);
      } catch { diagnostics.push(diagnostic('SOURCE_SUBJECT_INVALID', index)); }
    }
    /** @type {any[]} */ const expectedReview = [];
    const excluded = new Set();
    for (const [subjectKey, related] of bySubject) {
      related.sort((a, b) => compare(a.claim_id, b.claim_id));
      let conflicting = false;
      const terminal = new Map(related.map(claim => [claim.claim_id, claim]));
      if (mode === 'priority_order') for (const claim of related) {
        let current = claim;
        while (current.superseded_by !== undefined) {
          const next = related.find(candidate => candidate.claim_id === current.superseded_by);
          if (!next || rule.priority_order.indexOf(next.source_id) >= rule.priority_order.indexOf(current.source_id)) {
            diagnostics.push(diagnostic('SOURCE_SUPERSESSION_INVALID', index)); break;
          }
          current = next;
        }
        terminal.set(claim.claim_id, current);
        if (current !== claim) excluded.add(claim.claim_id);
      }
      if (mode === 'merge_non_overlapping' && related.length > 1) {
        diagnostics.push(diagnostic('SOURCE_SUBJECT_OVERLAP', index)); related.forEach(item => excluded.add(item.claim_id));
      }
      for (let left = 0; left < related.length; left += 1) for (let right = left + 1; right < related.length; right += 1) {
        const a = related[left]; const b = related[right];
        let status = 'consistent';
        if (canonicalJson(valueOf(a)) !== canonicalJson(valueOf(b))) {
          status = 'conflicted';
          if (mode === 'priority_order' && a.source_id !== b.source_id) {
            const resolvedA = terminal.get(a.claim_id); const resolvedB = terminal.get(b.claim_id);
            if ((resolvedA !== a || resolvedB !== b) && canonicalJson(valueOf(resolvedA)) === canonicalJson(valueOf(resolvedB))) status = 'superseded';
          }
          if (status === 'conflicted') conflicting = true;
        }
        expectedReview.push({ subject_key: subjectKey, left_claim_id: a.claim_id, right_claim_id: b.claim_id, status });
      }
      if (conflicting) {
        related.forEach(item => excluded.add(item.claim_id));
        const identity = { missing_type: 'source-conflict', rule_id: rule.rule_id, subject_key: subjectKey };
        conflicts.push({ conflict_id: stableId('source_conflict', identity), root_issue_id: stableId('root', identity),
          scope: rule.scope, rule_ids: [rule.rule_id], source_ids: [...new Set(related.map(item => item.source_id))].sort(compare),
          claim_ids: related.map(item => item.claim_id), subject_key: subjectKey });
      }
    }
    const sortReviews = (/** @type {any[]} */ items) => [...items].sort((a, b) => compare(canonicalJson(a), canonicalJson(b)));
    const submitted = rule.rule_internal_conflict_review ?? (mode === 'single_source' ? [] : null);
    if (!Array.isArray(submitted) || canonicalJson(sortReviews(submitted)) !== canonicalJson(sortReviews(expectedReview))) {
      diagnostics.push(diagnostic('SOURCE_INTERNAL_REVIEW_INVALID', index));
    }
    audit.push(...sortReviews(expectedReview).map(item => ({ rule_id: rule.rule_id, ...item })));
    if (diagnostics.length === localStart) rows.filter(claim => !excluded.has(claim.claim_id)).forEach(claim => effective.add(claim.claim_id));
  }
  return { effective_claim_ids: [...effective].sort(compare), conflicts: conflicts.sort((a, b) => compare(a.conflict_id, b.conflict_id)), diagnostics, audit };
}
