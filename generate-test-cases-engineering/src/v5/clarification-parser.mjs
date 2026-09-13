import { canonicalV5Stringify } from './canonical-v5.mjs';
import { V5ProtocolError } from './errors.mjs';
import { canonicalObjectDigest, rawBytesDigest } from './storage-records.mjs';

const UNIT_ACTIONS = new Set(['answer', 'defer', 'unknown', 'close_for_delivery']);
const PROPER_TOKEN = /^Q[0-9]{3,6}$/u;
const TOKENISH = /Q[0-9]+/gu;

/** @param {unknown} value @returns {value is Record<string,any>} */
function object(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
/** @param {Record<string,any>} value @param {string[]} keys */
function exact(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
/** @param {unknown} value */
function nonblank(value) { return typeof value === 'string' && value.trim().length > 0; }
/** @param {unknown} value */
function scalarLength(value) { return typeof value === 'string' ? [...value].length : -1; }

/** @param {string} raw */
export function clarificationMessageDigest(raw) {
  if (typeof raw !== 'string') throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Raw clarification message must be a string.');
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/clarification-message', format_version: 1, message: raw });
}

/** @param {string} raw @param {{start_scalar:number,end_scalar:number}} range */
export function minimalOriginFromRaw(raw, range) {
  if (typeof raw !== 'string' || !object(range) || !exact(range, ['start_scalar', 'end_scalar']) || !Number.isSafeInteger(range.start_scalar) || !Number.isSafeInteger(range.end_scalar)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Origin range must use safe Unicode scalar offsets.');
  const scalars = [...raw];
  if (range.start_scalar < 0 || range.end_scalar <= range.start_scalar || range.end_scalar > scalars.length) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Origin range is out of bounds or empty.');
  const excerpt = scalars.slice(range.start_scalar, range.end_scalar).join('');
  if (scalars.length > 65536 || scalarLength(excerpt) > 256) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Clarification message or origin excerpt is too long.');
  return { message_digest: clarificationMessageDigest(raw), range: { ...range }, excerpt, excerpt_digest: rawBytesDigest(excerpt) };
}

/** @param {Record<string,any>} supplied @param {string} raw */
function verifyOrigin(supplied, raw) {
  const expected = minimalOriginFromRaw(raw, supplied?.range);
  if (!object(supplied) || !exact(supplied, ['message_digest', 'range', 'excerpt', 'excerpt_digest']) || canonicalV5Stringify(supplied) !== canonicalV5Stringify(expected)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Origin must be derived exactly from the current raw message.');
  return expected;
}

/** @param {string} text @param {string[]} punctuation */
function stripWrappers(text, punctuation) {
  const wrappers = new Set(punctuation);
  const scalars = [...text];
  while (scalars.length > 0 && (/\p{White_Space}/u.test(scalars[0]) || wrappers.has(scalars[0]))) scalars.shift();
  while (scalars.length > 0 && (/\p{White_Space}/u.test(scalars[scalars.length - 1]) || wrappers.has(scalars[scalars.length - 1]))) scalars.pop();
  return scalars.join('');
}

/** @param {Record<string,any>} value @param {Record<string,any>} schema @param {Record<string,any>} registry */
function validateAnswerValue(value, schema, registry) {
  const fail = () => { throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Answer value does not satisfy the frozen closed contract.'); };
  if (!object(value) || value.kind !== schema.kind) return fail();
  if (value.kind === 'text') {
    if (!exact(value, ['kind', 'value']) || !nonblank(value.value)) return fail();
    const text = value.value.trim(); const length = scalarLength(text);
    if (length < schema.min_scalars || length > schema.max_scalars || length > 1024 || schema.ambiguity_guard_ref !== 'answer.no-unresolved-vague-token.v1') return fail();
    const guard = registry.text_ambiguity_guards.find((/** @type {Record<string,any>} */ item) => item.guard_ref === schema.ambiguity_guard_ref);
    if (!guard || guard.match_mode !== 'unicode_scalar_substring' || guard.forbidden_tokens.some((/** @type {string} */ token) => text.includes(token))) return fail();
  } else if (value.kind === 'boolean') {
    if (!exact(value, ['kind', 'value']) || typeof value.value !== 'boolean') return fail();
  } else if (value.kind === 'integer' || value.kind === 'number') {
    if (!exact(value, ['kind', 'value']) || typeof value.value !== 'number' || !Number.isFinite(value.value) || (value.kind === 'integer' && !Number.isSafeInteger(value.value)) || (schema.minimum !== undefined && value.value < schema.minimum) || (schema.maximum !== undefined && value.value > schema.maximum)) return fail();
  } else if (value.kind === 'duration_ms') {
    if (!exact(value, ['kind', 'value']) || !Number.isSafeInteger(value.value) || value.value <= 0 || (schema.maximum !== undefined && value.value > schema.maximum)) return fail();
  } else if (value.kind === 'identifier') {
    const pattern = registry.identifier_patterns.find((/** @type {Record<string,any>} */ item) => item.pattern_ref === schema.pattern_ref);
    if (!exact(value, ['kind', 'value']) || !pattern || !new RegExp(pattern.expression, 'u').test(value.value)) return fail();
  } else if (value.kind === 'enum') {
    if (!exact(value, ['kind', 'value']) || !schema.allowed_values?.includes(value.value)) return fail();
  } else if (value.kind === 'set') {
    if (!exact(value, ['kind', 'members']) || !Array.isArray(value.members) || value.members.length < schema.min_items || (schema.max_items !== undefined && value.members.length > schema.max_items)) return fail();
    for (const member of value.members) if (!object(member) || member.kind !== schema.member_kind || !validateScalar(member)) return fail();
    if (new Set(value.members.map((/** @type {Record<string,any>} */ member) => canonicalV5Stringify(member))).size !== value.members.length) return fail();
    if (schema.allowed_members && value.members.some((/** @type {Record<string,any>} */ member) => !schema.allowed_members.some((/** @type {Record<string,any>} */ allowed) => canonicalV5Stringify(allowed) === canonicalV5Stringify(member)))) return fail();
  } else if (value.kind === 'mapping') {
    if (!exact(value, ['kind', 'entries']) || !Array.isArray(value.entries)) return fail();
    for (const entry of value.entries) if (!object(entry) || !exact(entry, ['from', 'to']) || entry.from?.kind !== schema.key_kind || entry.to?.kind !== schema.mapped_value_kind || !validateScalar(entry.from) || !validateScalar(entry.to)) return fail();
    if (new Set(value.entries.map((/** @type {Record<string,any>} */ entry) => canonicalV5Stringify(entry.from))).size !== value.entries.length) return fail();
    if (schema.required_keys && !sameCanonicalSet(value.entries.map((/** @type {Record<string,any>} */ entry) => entry.from), schema.required_keys)) return fail();
  } else if (value.kind === 'scope') {
    if (!exact(value, ['kind', 'included_refs', 'excluded_refs']) || !uniqueNonblankStrings(value.included_refs) || !uniqueNonblankStrings(value.excluded_refs) || value.included_refs.some((/** @type {string} */ ref) => value.excluded_refs.includes(ref))) return fail();
    const allowed = schema.allowed_refs;
    if (allowed && [...value.included_refs, ...value.excluded_refs].some((/** @type {string} */ ref) => !allowed.includes(ref))) return fail();
  } else if (value.kind === 'requirements_quantifier') {
    if (!exact(value, ['kind', 'value']) || !schema.allowed_values?.includes(value.value)) return fail();
  } else if (value.kind === 'requirements_refs') {
    if (!exact(value, ['kind', 'refs']) || !Array.isArray(value.refs) || value.refs.length < schema.min_items || (schema.max_items !== undefined && value.refs.length > schema.max_items) || !value.refs.every(object)) return fail();
    if (!sameCanonicalSubset(value.refs, schema.allowed_refs)) return fail();
  } else if (value.kind === 'entity_resolution') {
    if (!validateEntityResolution(value.value, schema)) return fail();
  } else if (value.kind === 'permission_coordinates') {
    if (!validatePermissionCoordinates(value.value, schema)) return fail();
  } else if (['oracle_observation', 'oracle_assertion', 'oracle_scope', 'oracle_window', 'population_scope', 'population_proof'].includes(value.kind)) {
    if (!exact(value, ['kind', 'resolution']) || !object(value.resolution)) return fail();
    if (value.resolution.resolution_kind === 'select_candidate') {
      if (!exact(value.resolution, ['resolution_kind', 'candidate']) || !schema.existing_candidates?.some((/** @type {Record<string,any>} */ candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value.resolution.candidate))) return fail();
    } else if (value.resolution.resolution_kind === 'create_typed') {
      if (!exact(value.resolution, ['resolution_kind', 'payload']) || schema.allow_typed_creation !== true || !object(value.resolution.payload)) return fail();
    } else return fail();
  } else if (value.kind === 'permission_auxiliary_contract') {
    if (!exact(value, ['kind', 'resolution']) || !object(value.resolution)) return fail();
    if (value.resolution.resolution_kind === 'select_candidate') {
      if (!exact(value.resolution, ['resolution_kind', 'contract_ref']) || !schema.existing_contract_refs?.some((/** @type {Record<string,any>} */ ref) => canonicalV5Stringify(ref) === canonicalV5Stringify(value.resolution.contract_ref))) return fail();
    } else if (!(value.resolution.resolution_kind === 'create_typed' && exact(value.resolution, ['resolution_kind', 'payload']) && object(value.resolution.payload) && schema.allow_typed_creation === true)) return fail();
  } else return fail();
  return structuredClone(value);
}

/** @param {Record<string,any>} value */
function validateScalar(value) {
  if (!object(value)) return false;
  if (value.kind === 'text' || value.kind === 'identifier' || value.kind === 'enum') return exact(value, ['kind', 'value']) && nonblank(value.value);
  if (value.kind === 'boolean') return exact(value, ['kind', 'value']) && typeof value.value === 'boolean';
  if (value.kind === 'integer' || value.kind === 'duration_ms') return exact(value, ['kind', 'value']) && Number.isSafeInteger(value.value);
  return value.kind === 'number' && exact(value, ['kind', 'value']) && typeof value.value === 'number' && Number.isFinite(value.value);
}

/** @param {unknown} values */
function uniqueNonblankStrings(values) { return Array.isArray(values) && values.every(nonblank) && new Set(values).size === values.length; }
/** @param {unknown[]} left @param {unknown[]} right */
function sameCanonicalSet(left, right) { return left.length === right.length && new Set(left.map(canonicalV5Stringify)).size === left.length && left.every((value) => right.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value))); }
/** @param {unknown[]} values @param {unknown[]} allowed */
function sameCanonicalSubset(values, allowed) { return new Set(values.map(canonicalV5Stringify)).size === values.length && values.every((value) => allowed.some((candidate) => canonicalV5Stringify(candidate) === canonicalV5Stringify(value))); }

/** @param {Record<string,any>} answer @param {Record<string,any>} schema */
function validateEntityResolution(answer, schema) {
  if (!object(answer) || !exact(answer, ['conflict_group_id', 'exact_mention_candidate_ids', 'clusters']) || answer.conflict_group_id !== schema.exact_conflict_group_id || !sameCanonicalSet(answer.exact_mention_candidate_ids, schema.exact_mention_candidate_ids) || !Array.isArray(answer.clusters) || answer.clusters.length === 0) return false;
  const mentions = [];
  for (const cluster of answer.clusters) {
    if (!object(cluster) || !exact(cluster, ['canonical_name', 'mentions']) || !nonblank(cluster.canonical_name) || !Array.isArray(cluster.mentions) || cluster.mentions.length === 0) return false;
    for (const mention of cluster.mentions) {
      if (!object(mention) || !exact(mention, ['mention_candidate_id', 'name_role']) || !schema.allowed_name_roles.includes(mention.name_role)) return false;
      mentions.push(mention.mention_candidate_id);
    }
  }
  return sameCanonicalSet(mentions, schema.exact_mention_candidate_ids);
}

/** @param {Record<string,any>} answer @param {Record<string,any>} schema */
function validatePermissionCoordinates(answer, schema) {
  if (!object(answer) || !exact(answer, ['scope_group_id', 'permission_scope_candidate_ids', 'unresolved_coordinates', 'coordinate_resolutions']) || answer.scope_group_id !== schema.exact_scope_group_id || !sameCanonicalSet(answer.permission_scope_candidate_ids, schema.exact_permission_scope_candidate_ids) || !sameCanonicalSet(answer.unresolved_coordinates, schema.exact_unresolved_coordinates) || !Array.isArray(answer.coordinate_resolutions) || answer.coordinate_resolutions.length !== answer.unresolved_coordinates.length) return false;
  const byCoordinate = new Map(schema.coordinate_contracts.map((/** @type {Record<string,any>} */ contract) => [contract.coordinate, contract]));
  if (new Set(answer.coordinate_resolutions.map((/** @type {Record<string,any>} */ row) => row.coordinate)).size !== answer.coordinate_resolutions.length) return false;
  for (const row of answer.coordinate_resolutions) {
    const contract = byCoordinate.get(row.coordinate); if (!contract || !object(row.resolution)) return false;
    if (row.resolution.resolution_kind === 'select_candidate') {
      if (row.coordinate === 'permission_dimension') {
        if (!exact(row.resolution, ['resolution_kind', 'coordinate_evidence_digests']) || !sameCanonicalSubset(row.resolution.coordinate_evidence_digests, contract.existing_candidate_evidence_digests)) return false;
      } else if (!exact(row.resolution, ['resolution_kind', 'coordinate_evidence_digest']) || !contract.existing_candidate_evidence_digests.includes(row.resolution.coordinate_evidence_digest)) return false;
    } else if (row.resolution.resolution_kind === 'create_typed') {
      const payload = row.resolution.payload;
      if (!exact(row.resolution, ['resolution_kind', 'payload']) || !object(payload)) return false;
      if (row.coordinate === 'role' || row.coordinate === 'resource') { const n = scalarLength(payload.canonical_name); if (!exact(payload, ['canonical_name']) || n < 1 || n > 128) return false; }
      else if (row.coordinate === 'action') { if (!exact(payload, ['action']) || !contract.creation_constraints.allowed_actions.includes(payload.action)) return false; }
      else if (row.coordinate === 'context') { const n = scalarLength(payload.context_key); if (!exact(payload, ['context_key']) || n < 1 || n > 256) return false; }
      else if (!exact(payload, ['dimensions']) || !sameCanonicalSubset(payload.dimensions, contract.creation_constraints.allowed_dimensions) || new Set(payload.dimensions).size !== payload.dimensions.length || !payload.dimensions.includes('decision')) return false;
    } else return false;
  }
  return true;
}

/** @param {string} excerpt @param {string} expectedToken @param {string[]} allPresentationTokens */
function verifyUnitTokenBinding(excerpt, expectedToken, allPresentationTokens) {
  const tokenish = [...excerpt.matchAll(TOKENISH)].map((match) => match[0]);
  if (allPresentationTokens.length === 1 && tokenish.length === 0) return;
  if (tokenish.length !== 1 || tokenish[0] !== expectedToken || !PROPER_TOKEN.test(expectedToken) || !allPresentationTokens.includes(expectedToken)) throw new V5ProtocolError('ANSWER_BINDING_AMBIGUOUS', 'Response unit must contain exactly its current full display token.');
}

/** @param {string} excerpt @param {string} token @param {string} action @param {Record<string,any>} registry @param {boolean} allowTokenless */
function verifyControlOrigin(excerpt, token, action, registry, allowTokenless) {
  const first = excerpt.indexOf(token);
  if (first < 0 && !allowTokenless) throw new V5ProtocolError('CONTROL_ORIGIN_REQUIRED', 'Control origin does not contain its target token.');
  if (first >= 0 && excerpt.indexOf(token, first + token.length) >= 0) throw new V5ProtocolError('CONTROL_ORIGIN_REQUIRED', 'Control origin contains a duplicate target token.');
  const remainder = first < 0 ? excerpt : `${excerpt.slice(0, first)}${excerpt.slice(first + token.length)}`;
  const candidate = stripWrappers(remainder, registry.control_wrapper_punctuation);
  if (!registry.control_tokens[action]?.includes(candidate)) throw new V5ProtocolError('CONTROL_ORIGIN_REQUIRED', 'Control origin must reduce to one exact registered token.');
}

/**
 * Validate Agent-proposed atomic response units against the exact raw user message.
 * @param {{raw_response:string,presentation:Record<string,any>,units:Array<Record<string,any>>,control_registry:Record<string,any>,answer_registry:Record<string,any>}} input
 * @returns {Array<Record<string,any>>}
 */
export function validateAndBindResponseUnits(input) {
  const { raw_response: raw, presentation, control_registry: controls, answer_registry: registry } = input;
  if (typeof raw !== 'string' || !object(presentation) || !Array.isArray(presentation.parts) || !Array.isArray(input.units) || input.units.length === 0) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Clarification preview needs a nonempty unit set and current presentation.');
  const partById = new Map(presentation.parts.map((/** @type {Record<string,any>} */ part) => [part.question_part_id, part]));
  const tokens = presentation.parts.map((/** @type {Record<string,any>} */ part) => part.display_token);
  const seenPart = new Set(); const seenKey = new Set();
  const bound = /** @type {Array<Record<string,any>>} */ (input.units.map((unit) => {
    if (!object(unit)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Response unit must be an object.');
    if (!nonblank(unit.unit_client_key) || !/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/u.test(unit.unit_client_key) || seenKey.has(unit.unit_client_key)) throw new V5ProtocolError('CLIENT_KEY_INVALID', 'Response unit client key is invalid or duplicated.');
    if (!UNIT_ACTIONS.has(unit.action) || !object(unit.target)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Response unit shape or action is invalid.');
    seenKey.add(unit.unit_client_key);
    const part = partById.get(unit.target.question_part_id);
    if (!part || unit.target.display_token !== part.display_token || unit.target.root_version_digest !== presentation.semantic_root_digest) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Response unit target is stale or unknown.');
    if (!part.current_allowed_controls.includes(unit.action)) throw new V5ProtocolError('QUESTION_PART_TRANSITION_INVALID', 'Response unit action is not legal from the current Question Part state.');
    if (seenPart.has(part.question_part_id)) throw new V5ProtocolError('QUESTION_PART_ACTION_CONFLICT', 'A Question Part has conflicting response units.');
    seenPart.add(part.question_part_id);
    const origin = verifyOrigin(unit.origin, raw);
    const optionalShared = Object.hasOwn(unit, 'shared_origin_group_id');
    if (!optionalShared) verifyUnitTokenBinding(origin.excerpt, part.display_token, tokens);
    const expectedKeys = ['unit_client_key', ...(optionalShared ? ['shared_origin_group_id'] : []), 'origin', 'target', 'action', ...(unit.action === 'answer' ? ['answer'] : [])];
    if (!exact(unit, expectedKeys)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Response unit contains fields outside its closed branch.');
    let evidenceLevel = null;
    if (unit.action === 'answer') {
      if (part.answer_contract.answer_mode !== 'typed_answer' || !object(unit.answer) || !exact(unit.answer, ['value', 'source_text', 'nature', ...(Object.hasOwn(unit.answer, 'temporary_basis') ? ['temporary_basis'] : [])]) || !nonblank(unit.answer.source_text) || scalarLength(unit.answer.source_text) > 256 || !origin.excerpt.includes(unit.answer.source_text)) throw new V5ProtocolError('ANSWER_BINDING_INVALID', 'Answer is missing or does not bind its exact source text.');
      validateAnswerValue(unit.answer.value, part.answer_contract.value_schema, registry);
      if (unit.answer.nature === 'final') {
        if (Object.hasOwn(unit.answer, 'temporary_basis')) throw new V5ProtocolError('ANSWER_NATURE_INVALID', 'Final answer cannot carry a temporary basis.');
        evidenceLevel = 'E3';
      } else if (unit.answer.nature === 'temporary') {
        if (!object(unit.answer.temporary_basis)) throw new V5ProtocolError('TEMPORARY_BASIS_REQUIRED', 'Temporary answer requires an exact registered marker origin.');
        const basis = verifyOrigin(unit.answer.temporary_basis, raw);
        if (!controls.temporary_marker_tokens.includes(stripWrappers(basis.excerpt, controls.control_wrapper_punctuation))) throw new V5ProtocolError('TEMPORARY_BASIS_REQUIRED', 'Temporary basis must be one registered marker token.');
        evidenceLevel = 'E1';
      } else throw new V5ProtocolError('ANSWER_NATURE_INVALID', 'Answer nature must be final or temporary.');
    } else {
      if (optionalShared) throw new V5ProtocolError('QUESTION_PART_ACTION_CONFLICT', 'Control actions cannot use clone groups.');
      verifyControlOrigin(origin.excerpt, part.display_token, unit.action, controls, tokens.length === 1);
    }
    return { ...structuredClone(unit), evidence_level: evidenceLevel };
  }));

  /** @type {Map<string,Array<Record<string,any>>>} */
  const groups = new Map();
  for (const unit of bound.filter((item) => item.shared_origin_group_id)) {
    const rows = groups.get(unit.shared_origin_group_id) ?? []; rows.push(unit); groups.set(unit.shared_origin_group_id, rows);
  }
  for (const rows of groups.values()) {
    if (rows.length < 2 || rows.some((/** @type {Record<string,any>} */ row) => row.action !== 'answer')) throw new V5ProtocolError('ANSWER_BINDING_AMBIGUOUS', 'Clone groups need at least two answer targets.');
    const first = rows[0];
    const sameOriginAndAnswer = rows.every((/** @type {Record<string,any>} */ row) => canonicalV5Stringify(row.origin) === canonicalV5Stringify(first.origin) && canonicalV5Stringify(row.answer) === canonicalV5Stringify(first.answer));
    const originTokens = [...first.origin.excerpt.matchAll(TOKENISH)].map((match) => match[0]).sort();
    const targetTokens = rows.map((/** @type {Record<string,any>} */ row) => row.target.display_token).sort();
    const markerPresent = controls.clone_marker_tokens.some((/** @type {string} */ marker) => first.origin.excerpt.includes(marker));
    if (!sameOriginAndAnswer || !markerPresent || canonicalV5Stringify(originTokens) !== canonicalV5Stringify(targetTokens)) throw new V5ProtocolError('ANSWER_BINDING_AMBIGUOUS', 'Clone origin, target set, marker, action, and answer must be exact.');
  }
  return bound.sort((left, right) => left.unit_client_key.localeCompare(right.unit_client_key));
}

/** @param {Record<string,any>} value */
export function answerValueDigest(value) {
  return canonicalObjectDigest({ namespace: 'generate-test-cases/v5/answer-value', format_version: 1, value });
}
