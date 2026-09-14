import { canonicalStringify, digest, stableId } from './canonical.mjs';
import { sourceByteDigest } from './source-canonicalization.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import evidenceSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import { parseHtmlSourceStructure, splitMarkdownTableCells, isMarkdownTableDelimiter } from './source-structure-v4.mjs';

// These named definitions are shared with the Evidence artifact, not approximate
// hand-written alternatives; Source Pack can reuse the same definitions at wiring.
export const v4SourceDefinitions = Object.fromEntries(Object.entries(evidenceSchema.$defs).filter(([name]) => name.startsWith('v4Source')));

/** @param {string} text */
const textDigest = text => sourceByteDigest(new TextEncoder().encode(text));
/** @param {any} value @param {string[]} keys */
const closed = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
/** @param {string} code @param {string} path */
const issue = (code, path) => ({ category: 'traceability', code, path, message: 'Canonical source units, evidence coordinates and review coverage must agree.' });

/** Deterministic structural partition; non-paragraph syntax cannot claim the
 * document-level exception. Image region OCR is a separate acquisition artifact.
 * @param {string} sourceId @param {string} content @returns {any[]}
 */
export function compileCanonicalSourceStructure(sourceId, content) {
  if (typeof sourceId !== 'string' || !sourceId || typeof content !== 'string'
    || content !== content.normalize('NFC').replace(/\r\n?/gu, '\n')) throw new TypeError('CANONICAL_SOURCE_INVALID');
  /** @type {any[]} */ const units = [];
  let paragraph = ''; let section = stableId('section', { source_id: sourceId });
  let fenced = false; let table = ''; let row = 0;
  /** @param {string} type @param {string} text @param {any} [coordinates] */
  function add(type, text, coordinates = {}) {
    if (!text.trim()) return;
    units.push({ unit_id: stableId('unit', { source_id: sourceId, ordinal: units.length, type, text, ...coordinates }), type, text, ...coordinates });
  }
  function flush() { if (paragraph) add('text_block', paragraph, { section_id: section }); paragraph = ''; }
  const html = parseHtmlSourceStructure(content);
  if (html) {
    for (const unit of html) {
      if (unit.type === 'table_cell') add(unit.type, unit.text, { table_id: stableId('table', { source_id: sourceId, ordinal: unit.table_index }), row: unit.row, column: unit.column });
      else {
        if (unit.type === 'heading') section = stableId('section', { source_id: sourceId, heading: unit.text, ordinal: units.length });
        add(unit.type, unit.text, { section_id: section });
      }
    }
    return units;
  }
  const lines = content.split('\n');
  for (const [index, line] of lines.entries()) {
    if (/^\s*(?:```|~~~)/u.test(line)) { flush(); fenced = !fenced; add('code', line, { section_id: section }); continue; }
    if (fenced) { add('code', line, { section_id: section }); continue; }
    if (!line.trim()) { flush(); table = ''; continue; }
    if (/^\s*\|.*\|\s*$/u.test(line) || (table && splitMarkdownTableCells(line).length > 1)
      || (isMarkdownTableDelimiter(lines[index + 1] ?? '') && splitMarkdownTableCells(line).length > 1)) {
      flush(); if (!table) { table = stableId('table', { source_id: sourceId, ordinal: units.length }); row = 0; }
      const cells = splitMarkdownTableCells(line);
      if (cells.every(cell => /^\s*:?-+:?\s*$/u.test(cell))) continue;
      cells.forEach((cell, column) => add('table_cell', cell.trim(), { table_id: table, row, column })); row += 1; continue;
    }
    table = '';
    if (/^\s*#{1,6}\s/u.test(line)) { flush(); section = stableId('section', { source_id: sourceId, heading: line, ordinal: units.length }); add('heading', line, { section_id: section }); }
    else if (/^\s*(?:[-+*]|[0-9]+[.)])\s/u.test(line)) { flush(); add('list', line, { section_id: section }); }
    else if (/!\[|<(?:img|video|object|embed)\b/iu.test(line)) { flush(); add('image', line, { section_id: section }); }
    else paragraph += (paragraph ? '\n' : '') + line;
  }
  flush();
  return units;
}

/** @param {any} source */
function validSource(source) {
  const projection = source?.semantic_projection;
  if (!projection || !Array.isArray(projection.structure) || typeof projection.content !== 'string'
    || validateAgainstSchema(projection, { $ref: '#/$defs/v4SourceCanonicalProjection', $defs: v4SourceDefinitions }).length
    || projection.stable_source_id !== source.source_id
    || source.semantic_digest !== 'sha256:' + digest(projection)
    || !['business', 'execution_binding'].includes(source.domain)) return false;
  const textual = projection.structure.filter((/** @type {any} */ unit) => !['image_region', 'user_statement'].includes(unit.type));
  try {
    return canonicalStringify(textual) === canonicalStringify(compileCanonicalSourceStructure(source.source_id, projection.content))
      && new Set(projection.structure.map((/** @type {any} */ unit) => unit.unit_id)).size === projection.structure.length;
  } catch { return false; }
}

const COMMON_LOCATOR_KEYS = ['locator_id', 'source_id', 'semantic_digest', 'type', 'unit_id', 'excerpt', 'excerpt_digest', 'domain', 'field_path'];
const TEXT_TYPES = new Set(['text_block', 'heading', 'list', 'code']);
/** @param {any} range @param {number} length */
const validRange = (range, length) => closed(range, ['start', 'end']) && Number.isSafeInteger(range.start)
  && Number.isSafeInteger(range.end) && range.start >= 0 && range.end > range.start && range.end <= length;

/** @param {any} pack @param {any[]} claims */
export function validateV4ClaimLocators(pack, claims) {
  /** @type {any[]} */ const diagnostics = [];
  const sources = new Map((pack.sources ?? []).map((/** @type {any} */ source) => [source.source_id, source]));
  const locators = new Map((pack.locators ?? []).map((/** @type {any} */ locator) => [locator.locator_id, locator]));
  const reviews = new Map((pack.source_reviews ?? []).map((/** @type {any} */ review) => [
    review.source_id,
    new Map((review.units ?? []).map((/** @type {any} */ unit) => [unit.unit_id, unit.classification]))
  ]));
  claims.forEach((claim, index) => {
    const path = '/claims/' + index; const source = /** @type {any} */ (sources.get(claim.source_id));
    if (!validSource(source)) { diagnostics.push(issue('CANONICAL_SOURCE_INVALID', path)); return; }
    const units = source.semantic_projection.structure;
    const sourceClaims = claims.filter(other => other.source_id === claim.source_id);
    const ids = claim.source_locator_ids;
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) { diagnostics.push(issue('LOCATOR_REFERENCE_INVALID', path)); return; }
    if (ids.length > 1 && (!Array.isArray(claim.locator_roles) || claim.locator_roles.length !== ids.length
      || new Set(claim.locator_roles.map((/** @type {any} */ role) => role.locator_id)).size !== ids.length
      || claim.locator_roles.some((/** @type {any} */ role) => !closed(role, ['locator_id', 'role'])
        || !ids.includes(role.locator_id) || typeof role.role !== 'string' || !role.role.trim()))) {
      diagnostics.push(issue('LOCATOR_COMPONENT_ROLE_REQUIRED', path));
    }
    for (const id of ids) {
      const locator = /** @type {any} */ (locators.get(id)); const unit = units.find((/** @type {any} */ item) => item.unit_id === locator?.unit_id);
      if (!locator || !unit || locator.source_id !== claim.source_id || locator.semantic_digest !== source.semantic_digest
        || locator.domain !== claim.domain || locator.domain !== source.domain
        || locator.field_path !== (claim.subject_descriptor?.field_path ?? claim.field_path)
        || typeof locator.excerpt !== 'string' || locator.excerpt_digest !== textDigest(locator.excerpt)) {
        diagnostics.push(issue('LOCATOR_BINDING_INVALID', path)); continue;
      }
      let exact = false; let full = false;
      if (locator.type === 'text_block_range') {
        const points = Array.from(unit.text);
        exact = closed(locator, [...COMMON_LOCATOR_KEYS, 'section_id', 'range']) && TEXT_TYPES.has(unit.type)
          && locator.section_id === unit.section_id && validRange(locator.range, points.length)
          && locator.excerpt === points.slice(locator.range.start, locator.range.end).join('');
        full = exact && locator.range.start === 0 && locator.range.end === points.length;
      } else if (locator.type === 'table_cell') {
        exact = closed(locator, [...COMMON_LOCATOR_KEYS, 'table_id', 'row', 'column']) && unit.type === 'table_cell'
          && ['table_id', 'row', 'column'].every(key => locator[key] === unit[key]) && locator.excerpt === unit.text;
      } else if (locator.type === 'image_region') {
        exact = closed(locator, [...COMMON_LOCATOR_KEYS, 'asset_digest', 'page_id', 'image_id', 'rect']) && unit.type === 'image_region'
          && source.semantic_projection.assets.some((/** @type {any} */ asset) => asset.asset_digest === locator.asset_digest)
          && ['asset_digest', 'page_id', 'image_id', 'rect'].every(key => canonicalStringify(locator[key]) === canonicalStringify(unit[key]))
          && closed(locator.rect, ['x', 'y', 'width', 'height']) && Object.values(locator.rect).every(value => typeof value === 'number' && Number.isFinite(value))
          && locator.rect.x >= 0 && locator.rect.y >= 0 && locator.rect.width > 0 && locator.rect.height > 0 && locator.excerpt === unit.text;
      } else if (locator.type === 'user_statement') {
        exact = closed(locator, [...COMMON_LOCATOR_KEYS, 'presentation_id', 'message_digest', 'answer_span']) && unit.type === 'user_statement'
          && ['presentation_id', 'message_digest', 'answer_span'].every(key => canonicalStringify(locator[key]) === canonicalStringify(unit[key]))
          && validRange(locator.answer_span, Array.from(unit.text).length) && locator.excerpt === Array.from(unit.text).slice(locator.answer_span.start, locator.answer_span.end).join('')
          && locator.message_digest === textDigest(unit.text);
      }
      if (!exact) diagnostics.push(issue('LOCATOR_PRECISION_INVALID', path));
      if (claim.document_level_claim === true) {
        const review = /** @type {Map<string,string>|undefined} */ (reviews.get(claim.source_id));
        const normativeUnits = review
          ? units.filter((/** @type {any} */ candidate) => review.get(candidate.unit_id) !== 'non_normative')
          : units;
        if (!full || normativeUnits.length !== 1 || normativeUnits[0]?.unit_id !== unit.unit_id
          || unit.type !== 'text_block' || sourceClaims.length !== 1 || ids.length !== 1
          || Array.from(unit.text).length > 512 || new TextEncoder().encode(unit.text).byteLength > 2048) diagnostics.push(issue('DOCUMENT_LEVEL_CLAIM_INVALID', path));
      } else if (full && units.length === 1) diagnostics.push(issue('DOCUMENT_LEVEL_CLAIM_REQUIRED', path));
    }
  });
  return diagnostics;
}

/** @param {any} pack */
export function validateV4SourceReviews(pack) {
  /** @type {any[]} */ const diagnostics = [];
  const sourceIds = new Set((pack.sources ?? []).map((/** @type {any} */ source) => source.source_id));
  for (const [index, review] of (pack.source_reviews ?? []).entries()) if (!sourceIds.has(review.source_id)) {
    diagnostics.push(issue('SOURCE_UNIT_REVIEW_SOURCE_DANGLING', '/source_reviews/' + index));
  }
  for (const [index, source] of (pack.sources ?? []).entries()) {
    const path = '/sources/' + index;
    if (!validSource(source)) { diagnostics.push(issue('CANONICAL_SOURCE_INVALID', path)); continue; }
    const reviews = (pack.source_reviews ?? []).filter((/** @type {any} */ item) => item.source_id === source.source_id);
    if (reviews.length !== 1 || !closed(reviews[0], ['source_id', 'semantic_digest', 'units'])
      || reviews[0].semantic_digest !== source.semantic_digest || !Array.isArray(reviews[0].units)) { diagnostics.push(issue('SOURCE_UNIT_REVIEW_INVALID', path)); continue; }
    const units = source.semantic_projection.structure.filter((/** @type {any} */ unit) => unit.text.trim());
    const entries = reviews[0].units;
    if (entries.length !== units.length || new Set(entries.map((/** @type {any} */ item) => item.unit_id)).size !== entries.length
      || entries.some((/** @type {any} */ entry) => !closed(entry, ['unit_id', 'content_digest', 'classification'])
        || !['normative', 'non_normative', 'uncertain'].includes(entry.classification)
        || !units.some((/** @type {any} */ unit) => unit.unit_id === entry.unit_id && textDigest(unit.text) === entry.content_digest))) {
      diagnostics.push(issue('SOURCE_UNIT_REVIEW_CONSERVATION', path));
    }
  }
  return diagnostics;
}
