import { createHash } from 'node:crypto';
import { canonicalStringify, digest } from './canonical.mjs';

const COOPER_KEYS = Object.freeze([
  'x-amz-algorithm', 'x-amz-credential', 'x-amz-date', 'x-amz-expires',
  'x-amz-signedheaders', 'x-amz-signature', 'x-amz-security-token', 'ossaccesskeyid',
  'signature', 'expires', 'security-token', 'x-oss-security-token'
]);
const CREDENTIAL_KEYS = new Set(['signature', 'sig', 'token', 'security-token', 'credential', 'accesskey', 'expires']);
const registries = new WeakMap();
/** @param {unknown} value */
const text = (value) => typeof value === 'string' && value.trim().length > 0;
/** @param {Uint8Array} bytes */
export const sourceByteDigest = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
/** @param {string} left @param {string} right */
const compare = (left, right) => {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
};
/** @param {string} key */
const credentialLike = (key) => CREDENTIAL_KEYS.has(key.toLowerCase()) || /^(?:x-amz-|x-oss-)/iu.test(key);

/**
 * Compiler-owned system configuration, never an Adapter assertion of provider.
 * Exact hosts prevent suffix spoofing; callers cannot mutate the private table.
 * No built-in production host is guessed from a provider display name.
 * @param {any[]} entries
 */
export function createSourceProviderRegistry(entries) {
  if (!Array.isArray(entries)) throw new TypeError('SOURCE_PROVIDER_REGISTRY_INVALID');
  const hosts = new Set();
  const versions = new Set();
  const contracts = entries.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || Object.keys(entry).some((key) => !['provider', 'version', 'hosts', 'kind', 'query_order'].includes(key))
      || !text(entry.provider) || !text(entry.version)
      || !['cooper', 'controlled-object-storage', 'other'].includes(entry.kind)
      || !['sensitive', 'insensitive'].includes(entry.query_order)
      || !Array.isArray(entry.hosts) || entry.hosts.length === 0
    ) throw new TypeError('SOURCE_PROVIDER_REGISTRY_INVALID');
    const identity = canonicalStringify([entry.provider, entry.version]);
    if (versions.has(identity)) throw new TypeError('SOURCE_PROVIDER_REGISTRY_INVALID');
    versions.add(identity);
    const normalizedHosts = entry.hosts.map((/** @type {any} */ host) => {
      if (!text(host) || /[/?#@:\s*]/u.test(host)) throw new TypeError('SOURCE_PROVIDER_REGISTRY_INVALID');
      const normalized = new URL('https://' + host).hostname;
      if (hosts.has(normalized)) throw new TypeError('SOURCE_PROVIDER_REGISTRY_INVALID');
      hosts.add(normalized);
      return normalized;
    });
    return Object.freeze({
      provider: entry.provider, version: entry.version, hosts: Object.freeze(normalizedHosts),
      kind: entry.kind, query_order: entry.query_order,
      // Query-deletion authority is frozen in compiler code. A configured
      // ordinary provider may define ordering only; it cannot reinterpret a
      // business query key as a credential and silently remove it.
      credential_keys: Object.freeze(entry.kind === 'other' ? [] : [...COOPER_KEYS])
    });
  });
  const registry = Object.freeze({});
  registries.set(registry, Object.freeze(contracts));
  return registry;
}

/** @param {object} registry @returns {any[]} */
function providerTable(registry) {
  const table = registries.get(registry);
  if (!table) throw new TypeError('SOURCE_PROVIDER_REGISTRY_INVALID');
  return table;
}
/** Used by safe material events; the resolver must still fetch outside this pure layer.
 * @param {object} registry @param {string} provider @param {string} version
 */
export function hasSourceProviderContract(registry, provider, version) {
  return providerTable(registry).some((entry) => entry.provider === provider && entry.version === version);
}
/** @param {object} registry @param {string} provider @param {string} version */
export function isCooperSourceProviderContract(registry, provider, version) {
  return providerTable(registry).some(entry => entry.provider === provider && entry.version === version
    && ['cooper', 'controlled-object-storage'].includes(entry.kind));
}

/** @param {string} [code] */
function sourceDiagnostic(code = 'SOURCE_URL_MALFORMED') {
  return {
    status: 'source_diagnostic',
    diagnostics: [{ category: 'source', code, message: 'Source input cannot be safely canonicalized; provide a valid source capture.' }]
  };
}
/** @param {string} value */
function encodeQuery(value) {
  return encodeURIComponent(value.normalize('NFC')).replace(/[!'()*]/gu, (character) =>
    '%' + character.charCodeAt(0).toString(16).toUpperCase());
}
/** @param {string} value */
function canonicalPath(value) {
  decodeURIComponent(value); // Reject malformed/invalid UTF-8 escapes instead of lossy replacement.
  return value.replace(/%[0-9a-f]{2}/giu, (encoded) => {
    const decoded = String.fromCharCode(parseInt(encoded.slice(1), 16));
    return /[A-Za-z0-9._~-]/u.test(decoded) ? decoded : encoded.toUpperCase();
  });
}

/**
 * Raw URI exists only in this call. Neither failures nor quarantine echo it.
 * ordinary_query_digest always binds decoded pairs in original order (5.7),
 * independently of provider-authorized semantic query sorting.
 * @param {string} rawUri @param {object} registry
 * @returns {any}
 */
export function canonicalizeSourceUrl(rawUri, registry) {
  const table = providerTable(registry);
  try {
    if (!text(rawUri) || /[\u0000-\u0020\u007f]/u.test(rawUri)) return sourceDiagnostic();
    const url = new URL(rawUri);
    if (!['http:', 'https:'].includes(url.protocol)) return sourceDiagnostic();
    const provider = table.find((entry) => entry.hosts.includes(url.hostname));
    const pathname = canonicalPath(url.pathname);
    const pairs = url.search.length <= 1 ? [] : url.search.slice(1).split('&').map((pair) => {
      const split = pair.indexOf('=');
      const decode = (/** @type {string} */ value) => decodeURIComponent(value.replace(/\+/gu, ' ')).normalize('NFC');
      return [decode(split < 0 ? pair : pair.slice(0, split)), decode(split < 0 ? '' : pair.slice(split + 1))];
    });
    const allowed = new Set(provider?.credential_keys ?? []);
    const unknownCredentials = pairs.some(([key]) => credentialLike(key) && !allowed.has(key.toLowerCase()));
    const credentialPairsRemoved = pairs.some(([key]) => allowed.has(key.toLowerCase()));
    const ordinaryPairs = pairs.filter(([key]) => !allowed.has(key.toLowerCase()) && !credentialLike(key));
    const safe = {
      provider: provider?.provider ?? 'unknown',
      provider_contract_version: provider?.version ?? null,
      redacted_resource_ref: url.host + pathname,
      ordinary_query_digest: 'sha256:' + digest(ordinaryPairs),
      credential_pairs_removed: credentialPairsRemoved
    };
    if (url.username || url.password || unknownCredentials) return {
      status: 'need_artifact', reason_code: 'UNSUPPORTED_SIGNED_URL_PROVIDER', ...safe
    };
    const semanticPairs = provider?.query_order === 'insensitive'
      ? [...ordinaryPairs].sort(([aKey, aValue], [bKey, bValue]) => compare(aKey, bKey) || compare(aValue, bValue))
      : ordinaryPairs;
    const query = semanticPairs.map(([key, value]) => encodeQuery(key) + '=' + encodeQuery(value)).join('&');
    return {
      status: 'canonical', ...safe,
      canonical_uri: url.protocol + '//' + url.host + pathname + (query ? '?' + query : '')
    };
  } catch {
    return sourceDiagnostic();
  }
}

/** @param {string} value @param {boolean} [strict] */
function decodeHtmlEntities(value, strict = true) {
  const named = /** @type {Record<string,string>} */ ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', colon: ':', sol: '/' });
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[A-Za-z][A-Za-z0-9]+);/giu, (_, name) => {
    if (name.startsWith('#')) {
      const hex = name[1]?.toLowerCase() === 'x';
      const point = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) throw new Error('SOURCE_URL_MALFORMED');
      return String.fromCodePoint(point);
    }
    if (!Object.hasOwn(named, name.toLowerCase())) {
      if (strict) throw new Error('SOURCE_URL_MALFORMED');
      return '&' + name + ';';
    }
    return named[name.toLowerCase()];
  });
}

/**
 * Parse destinations before editing ranges: balanced Markdown inline links,
 * quoted/unquoted HTML href/src and bare absolute HTTP links.
 * Full block/cell/region extraction and Unicode-scalar review maps are separate
 * source-audit work; this routine never claims they have already been audited.
 * @param {string} content
 */
function urlDestinations(content) {
  /** @type {Array<{start:number,end:number,html:boolean}>} */
  const ranges = [];
  let cursor = 0;
  while ((cursor = content.indexOf('](', cursor)) >= 0) {
    let position = cursor + 2;
    while (/\s/u.test(content[position] ?? '') && position < content.length) position += 1;
    const angle = content[position] === '<';
    const start = angle ? ++position : position;
    let depth = 0;
    while (position < content.length) {
      const char = content[position];
      if (char === '\\') { position += 2; continue; }
      if (angle && char === '>') break;
      if (!angle && depth === 0 && (char === ')' || /\s/u.test(char))) break;
      if (!angle && char === '(') depth += 1;
      if (!angle && char === ')') depth -= 1;
      position += 1;
    }
    const end = position;
    if (start === end || position >= content.length || depth !== 0) throw new Error('SOURCE_URL_MALFORMED');
    if (angle) position += 1;
    while (/\s/u.test(content[position] ?? '') && position < content.length) position += 1;
    if (content[position] === '"' || content[position] === "'") {
      const quote = content[position++];
      while (position < content.length && content[position] !== quote) position += content[position] === '\\' ? 2 : 1;
      if (position >= content.length) throw new Error('SOURCE_URL_MALFORMED');
      position += 1;
      while (/\s/u.test(content[position] ?? '') && position < content.length) position += 1;
    }
    if (content[position] !== ')') throw new Error('SOURCE_URL_MALFORMED');
    ranges.push({ start, end, html: false });
    cursor = position + 1;
  }
  const tags = /<[A-Za-z][A-Za-z0-9:-]*(?=[\s/>])/gu;
  for (const match of content.matchAll(tags)) {
    let position = match.index + match[0].length;
    let quote = '';
    for (; position < content.length; position += 1) {
      const char = content[position];
      if (quote) { if (char === quote) quote = ''; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (position >= content.length || quote) throw new Error('SOURCE_URL_MALFORMED');
    // Parse each attribute rather than matching href= inside another attribute's
    // quoted value. URL lists/custom attributes are unsupported and fail closed
    // if they contain a URL, including a character-reference-obscured protocol.
    let attributePosition = match.index + match[0].length;
    while (attributePosition < position) {
      while (/\s/u.test(content[attributePosition])) attributePosition += 1;
      if (attributePosition === position || (content[attributePosition] === '/' && attributePosition + 1 === position)) break;
      const name = /^[^\s/=>"'`]+/u.exec(content.slice(attributePosition, position))?.[0];
      if (!name) throw new Error('SOURCE_URL_MALFORMED');
      const singleUrl = /^(?:href|src|poster|action|formaction|cite|background|longdesc|manifest|data|codebase|profile)$/iu.test(name);
      attributePosition += name.length;
      while (/\s/u.test(content[attributePosition])) attributePosition += 1;
      if (content[attributePosition] !== '=') {
        if (singleUrl) throw new Error('SOURCE_URL_MALFORMED');
        continue;
      }
      attributePosition += 1;
      while (/\s/u.test(content[attributePosition])) attributePosition += 1;
      const delimiter = ['"', "'"].includes(content[attributePosition]) ? content[attributePosition++] : '';
      const start = attributePosition;
      while (attributePosition < position && (delimiter ? content[attributePosition] !== delimiter : !/\s/u.test(content[attributePosition]))) attributePosition += 1;
      if (delimiter && attributePosition === position) throw new Error('SOURCE_URL_MALFORMED');
      const end = attributePosition;
      if (delimiter) attributePosition += 1;
      if (singleUrl) ranges.push({ start, end, html: true });
      else if (/https?:\/\//iu.test(decodeHtmlEntities(content.slice(start, end), false))) throw new Error('SOURCE_URL_MALFORMED');
    }
  }
  for (const match of content.matchAll(/https?:\/\/[^\s<>"']+/giu)) {
    if (ranges.some((range) => match.index >= range.start && match.index < range.end)) continue;
    ranges.push({ start: match.index, end: match.index + match[0].length, html: false });
  }
  return ranges.sort((left, right) => left.start - right.start);
}

/**
 * Pure text-source identity seam. Returns no raw bytes or URI credentials.
 * This is not a Fact/Claim parser, source-review proof, or expiry-banner matcher.
 * @param {any} input @param {object} registry @returns {any}
 */
export function canonicalizeSourceCapture(input, registry) {
  providerTable(registry);
  try {
    if (!text(input?.stable_source_id) || !text(input?.source_type)
      || !(input.capture_bytes instanceof Uint8Array) || !Array.isArray(input.assets)) return sourceDiagnostic('SOURCE_CAPTURE_INVALID');
    const captureDigest = sourceByteDigest(input.capture_bytes);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(input.capture_bytes)
      .replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n').normalize('NFC');
    const destinations = urlDestinations(content);
    let canonicalContent = '';
    let previousEnd = 0;
    /** @type {any[]} */
    const quarantined = [];
    for (const [ordinal, destination] of destinations.entries()) {
      if (destination.start < previousEnd) return sourceDiagnostic();
      const raw = content.slice(destination.start, destination.end);
      const result = canonicalizeSourceUrl(destination.html ? decodeHtmlEntities(raw) : raw.replace(/\\([\\()])/gu, '$1'), registry);
      if (result.status === 'source_diagnostic') return result;
      if (result.status === 'need_artifact') quarantined.push({ ...result, url_ordinal: ordinal });
      canonicalContent += content.slice(previousEnd, destination.start)
        + (result.canonical_uri === undefined ? '' : destination.html
          ? result.canonical_uri.replace(/&/gu, '&amp;') : result.canonical_uri);
      previousEnd = destination.end;
    }
    canonicalContent += content.slice(previousEnd);
    /** @type {Array<{canonical_uri:string,asset_digest:string}>} */
    const assets = [];
    for (const asset of input.assets) {
      if (!(asset?.bytes instanceof Uint8Array)) return sourceDiagnostic('SOURCE_ASSET_BYTES_INVALID');
      const result = canonicalizeSourceUrl(asset.retrieval_uri, registry);
      if (result.status === 'source_diagnostic') return result;
      if (result.status === 'need_artifact') quarantined.push(result);
      else assets.push({ canonical_uri: result.canonical_uri, asset_digest: sourceByteDigest(asset.bytes) });
    }
    if (quarantined.length > 0) return {
      status: 'need_artifact', reason_code: 'UNSUPPORTED_SIGNED_URL_PROVIDER', quarantined
    };
    const unique = [...new Map(assets.map((asset) => [canonicalStringify(asset), asset])).values()]
      .sort((a, b) => compare(a.canonical_uri, b.canonical_uri) || compare(a.asset_digest, b.asset_digest));
    const semanticProjection = {
      stable_source_id: input.stable_source_id.normalize('NFC'),
      source_type: input.source_type, content: canonicalContent, assets: unique
    };
    return {
      status: 'canonical', capture_digest: captureDigest,
      semantic_projection: semanticProjection, semantic_digest: 'sha256:' + digest(semanticProjection)
    };
  } catch {
    return sourceDiagnostic('SOURCE_CAPTURE_INVALID');
  }
}

/** Acquisition-only inventory. Marker text is never a semantic projection: it
 * locates quarantined URLs structurally without exposing raw URLs or allowing
 * credential rotation to change a unit coordinate. The compiler discards it.
 * @param {Uint8Array} bytes @param {object} registry
 */
export function sourceAcquisitionInventory(bytes, registry) {
  providerTable(registry);
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\ufeff/u, '').replace(/\r\n?/gu, '\n').normalize('NFC');
  const references = []; let markerContent = ''; let cursor = 0;
  for (const [ordinal, destination] of urlDestinations(content).entries()) {
    if (destination.start < cursor) throw new TypeError('SOURCE_URL_MALFORMED');
    const raw = content.slice(destination.start, destination.end);
    const reference = canonicalizeSourceUrl(destination.html ? decodeHtmlEntities(raw) : raw.replace(/\\([\\()])/gu, '$1'), registry);
    if (reference.status === 'source_diagnostic') throw new TypeError('SOURCE_URL_MALFORMED');
    const marker = 'https://source-acquisition.invalid/' + ordinal;
    references.push({ ordinal, marker, reference });
    markerContent += content.slice(cursor, destination.start) + marker; cursor = destination.end;
  }
  markerContent += content.slice(cursor);
  return { marker_content: markerContent, references };
}
