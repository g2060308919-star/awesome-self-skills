import { canonicalStringify, digest } from './canonical.mjs';
import { canonicalizeSourceCapture, isCooperSourceProviderContract, sourceByteDigest } from './source-canonicalization.mjs';

const registries = new WeakMap();
/** @param {string} text */
const encode = text => new TextEncoder().encode(text);
/** @param {any} item @param {string[]} keys */
const closed = (item, keys) => item && typeof item === 'object' && !Array.isArray(item)
  && Object.keys(item).sort().join(',') === [...keys].sort().join(',');
/** @param {string} value */
const literal = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
/** Compiler-owned exact machine templates, not Agent supplied regexes or keywords.
 * @param {any[]} entries
 */
export function createExpiryMatcherRegistry(entries) {
  if (!Array.isArray(entries)) throw new TypeError('EXPIRY_MATCHER_REGISTRY_INVALID');
  const seen = new Set();
  const result = entries.map(entry => {
    if (!closed(entry, ['provider', 'provider_contract_version', 'matcher_version', 'prefix', 'suffix'])
      || Object.values(entry).some(value => typeof value !== 'string' || !value.trim())
      || /https?:\/\//iu.test(entry.prefix + entry.suffix)) throw new TypeError('EXPIRY_MATCHER_REGISTRY_INVALID');
    const key = [entry.provider, entry.provider_contract_version, entry.matcher_version].join('\0');
    if (seen.has(key)) throw new TypeError('EXPIRY_MATCHER_REGISTRY_INVALID');
    seen.add(key);
    return Object.freeze({ ...entry, prefix: entry.prefix.normalize('NFC').replace(/\r\n?/gu, '\n'), suffix: entry.suffix.normalize('NFC').replace(/\r\n?/gu, '\n') });
  });
  const registry = Object.freeze({}); registries.set(registry, Object.freeze(result)); return registry;
}

/** Normalization maps Unicode scalars, never UTF-16 indices, back to raw capture.
 * @param {string} raw
 */
function normalizedCapture(raw) {
  const segments = new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(raw);
  let rawOffset = 0; let normalized = '';
  /** @type {Array<{start:number,end:number}>} */ const map = [];
  for (const { segment } of segments) {
    const start = rawOffset; rawOffset += Array.from(segment).length;
    const value = (start === 0 ? segment.replace(/^\ufeff/u, '') : segment).replace(/\r\n?/gu, '\n').normalize('NFC');
    normalized += value;
    for (const ignored of Array.from(value)) map.push({ start, end: rawOffset });
  }
  return { normalized, map, scalar_count: rawOffset };
}

/** @param {string} content @param {any[]} matchers */
function matches(content, matchers) {
  /** @type {Array<{start:number,end:number,matcher_version:string,text:string}>} */ const result = [];
  for (const matcher of matchers) {
    const pattern = new RegExp(literal(matcher.prefix) + '[0-9]+' + literal(matcher.suffix), 'gu');
    for (const match of content.matchAll(pattern)) result.push({
      start: Array.from(content.slice(0, match.index)).length,
      end: Array.from(content.slice(0, match.index + match[0].length)).length,
      matcher_version: matcher.matcher_version, text: match[0]
    });
  }
  result.sort((a, b) => a.start - b.start || a.end - b.end);
  if (result.some((span, index) => index > 0 && span.start < result[index - 1].end)) throw new TypeError('EXPIRY_MATCHER_OVERLAP');
  return result;
}

/**
 * URL normalization completes before expiry exclusions. acquisition is trusted
 * resolver metadata, never an assertion from source content or an Agent artifact.
 * Original bytes stay ephemeral; capture audit retains only ranges and digests.
 * @param {any} input @param {object} urlRegistry @param {any} acquisition @param {object} expiryRegistry
 * @returns {any}
 */
export function canonicalizeAuditedSourceCapture(input, urlRegistry, acquisition, expiryRegistry) {
  const baseline = canonicalizeSourceCapture(input, urlRegistry);
  if (baseline.status !== 'canonical') return baseline;
  const registered = registries.get(expiryRegistry);
  if (!registered) throw new TypeError('EXPIRY_MATCHER_REGISTRY_INVALID');
  const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input.capture_bytes);
  const normalized = normalizedCapture(raw);
  const selected = isCooperSourceProviderContract(urlRegistry, acquisition?.provider, acquisition?.provider_contract_version)
    ? registered.filter((/** @type {any} */ matcher) => matcher.provider === acquisition.provider && matcher.provider_contract_version === acquisition.provider_contract_version) : [];
  const rawMatches = matches(normalized.normalized, selected);
  const canonical = baseline.semantic_projection.content;
  const canonicalMatches = matches(canonical, selected);
  if (rawMatches.length !== canonicalMatches.length || rawMatches.some((item, index) => item.text !== canonicalMatches[index].text)) {
    throw new TypeError('EXPIRY_MAPPING_INVALID');
  }
  const rawScalars = Array.from(raw); const canonicalScalars = Array.from(canonical);
  let rawCursor = 0; let canonicalCursor = 0; let semanticContent = '';
  /** @type {any[]} */ const exclusions = [];
  /** @type {any[]} */ const retained = [];
  /** @param {number} rawEnd @param {number} canonicalEnd */
  function retain(rawEnd, canonicalEnd) {
    const text = canonicalScalars.slice(canonicalCursor, canonicalEnd).join('');
    const semanticStart = Array.from(semanticContent).length;
    semanticContent += text;
    if (rawEnd > rawCursor) retained.push({ start: rawCursor, end: rawEnd, semantic_start: semanticStart, semantic_end: Array.from(semanticContent).length });
  }
  rawMatches.forEach((item, index) => {
    const start = normalized.map[item.start].start; const end = normalized.map[item.end - 1].end;
    retain(start, canonicalMatches[index].start);
    exclusions.push({ capture_unit_id: 'capture_document', capture_locator: { start, end },
      capture_excerpt_digest: sourceByteDigest(encode(rawScalars.slice(start, end).join(''))),
      reason_code: 'provider_expiry_banner', matcher_version: item.matcher_version });
    rawCursor = end; canonicalCursor = canonicalMatches[index].end;
  });
  retain(rawScalars.length, canonicalScalars.length);
  const projection = { ...baseline.semantic_projection, content: semanticContent };
  return { ...baseline, semantic_projection: projection, semantic_digest: 'sha256:' + digest(projection), capture_audit: {
    capture_digest: baseline.capture_digest,
    units: [{ capture_unit_id: 'capture_document', capture_unit_digest: sourceByteDigest(input.capture_bytes),
      capture_scalar_count: rawScalars.length, semantic_scalar_count: Array.from(semanticContent).length, retained_spans: retained }], semantic_exclusions: exclusions
  } };
}

/** Recompute from raw bytes and trusted provider/matcher contracts. A structurally
 * valid partition is not sufficient authority to erase business text.
 * @param {Uint8Array} capturedBytes @param {any} audit @param {object} urlRegistry
 * @param {any} acquisition @param {object} expiryRegistry
 * @returns {Array<{category:string,code:string,path:string,message:string}>}
 */
export function validateCaptureAudit(capturedBytes, audit, urlRegistry, acquisition, expiryRegistry) {
  const bad = () => [{ category: 'traceability', code: 'CAPTURE_AUDIT_INVALID', path: '/capture_audit', message: 'Capture audit must equal the compiler-recomputed authorized retained/excluded partition.' }];
  try {
    const expected = canonicalizeAuditedSourceCapture({
      stable_source_id: 'capture-audit-verification', source_type: 'capture', capture_bytes: capturedBytes, assets: []
    }, urlRegistry, acquisition, expiryRegistry);
    return expected.status === 'canonical' && canonicalStringify(expected.capture_audit) === canonicalStringify(audit) ? [] : bad();
  } catch { return bad(); }
}
