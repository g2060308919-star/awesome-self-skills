/** Structural accountability only: the Adapter must independently review semantics. */
export { validateCaptureAudit } from './source-capture-audit.mjs';
export { validateV4SourceReviews, validateV4ClaimLocators } from './source-locators-v4.mjs';
/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
/** @param {unknown} value */
export function validReviewBasis(value) {
  return record(value) && Object.keys(value).sort().join(',') === 'evidence,method,reviewer'
    && ['reviewer', 'method', 'evidence'].every(key => typeof value[key] === 'string' && value[key].trim().length > 0);
}

/**
 * Detect explicit Markdown image and HTML media syntax, not semantic keywords.
 * This guard supplements the Adapter asset inventory; it is not a complete parser
 * for every document/container or proof that every visual requirement was read.
 * @param {string} content
 */
export function sourceAssetReferences(content) {
  const refs = [];
  const pattern = /!\[[^\]\n]*\](?:\([^\n]*?\)|\[[^\]\n]*\])|!\[[^\]\n]+\]|<(?:img|video|audio|object|embed)\b[^>]*>/giu;
  for (const match of content.matchAll(pattern)) refs.push({ start: match.index, end: match.index + match[0].length });
  return refs;
}

/** @param {Record<string, any>} pack */
export function validateSourceAssetAudit(pack) {
  /** @type {Array<{category:string,code:string,path:string,message:string}>} */
  const diagnostics = [];
  /** @param {string} code @param {string} path @param {string} message */
  const add = (code, path, message) => diagnostics.push({ category: 'traceability', code, path, message });
  /** @type {Record<string, any>[]} */
  const assets = Array.isArray(pack.source_assets) ? pack.source_assets.filter(record) : [];
  /** @type {Map<string, Record<string, any>>} */
  const locators = new Map();
  /** @type {Map<string, Record<string, any>>} */
  const sources = new Map();
  for (const locator of Array.isArray(pack.locators) ? pack.locators : []) if (record(locator)) locators.set(locator.locator_id, locator);
  for (const source of Array.isArray(pack.sources) ? pack.sources : []) if (record(source)) sources.set(source.source_id, source);
  const seen = new Set();
  assets.forEach((asset, index) => {
    const path = `/source_assets/${index}`;
    const locator = locators.get(asset.locator_id);
    const source = sources.get(asset.source_id);
    if (seen.has(asset.asset_id)) add('SOURCE_ASSET_DUPLICATE', path, 'asset identity must be unique');
    seen.add(asset.asset_id);
    if (!source || !locator || locator.source_id !== asset.source_id || locator.content_digest !== source.content_digest) {
      add('SOURCE_ASSET_LOCATOR_INVALID', path, 'asset locator must bind its existing immutable source');
    }
    if (!validReviewBasis(asset.review_basis)) add('SOURCE_ASSET_REVIEW_BASIS_INVALID', path, 'asset review requires reviewer, method and evidence or inability evidence');
    if (asset.status !== 'reviewed') {
      add('SOURCE_ASSET_REVIEW_REQUIRED', path, 'unread or unavailable assets require source revision after reading or resolving inability; they cannot be covered or excluded');
    }
  });
  for (const [sourceId, source] of sources) {
    for (const ref of sourceAssetReferences(String(source.content ?? ''))) {
      const matches = assets.filter(asset => {
        const locator = locators.get(asset.locator_id);
        return asset.source_id === sourceId && locator?.type === 'text-range'
          && locator.text_range?.start === ref.start && locator.text_range?.end === ref.end;
      });
      if (matches.length !== 1) add('SOURCE_ASSET_UNACCOUNTED', `/sources/${sourceId}/content`, 'each explicit non-text reference must have exactly one source-linked asset review');
    }
  }
  return diagnostics;
}

/** @param {Record<string, any>} pack @param {Map<string, any>} claims */
export function validateAssetClaims(pack, claims) {
  return (pack.source_assets ?? []).filter(record).flatMap((/** @type {Record<string, any>} */ asset, /** @type {number} */ index) => {
    if (asset.status !== 'reviewed' || asset.classification === 'non_normative') return [];
    const claimed = [...claims.values()].some(claim => claim.claim_form === 'direct'
      && claim.source_id === asset.source_id && (claim.source_locator_ids ?? []).includes(asset.locator_id));
    return claimed ? [] : [{ category: 'traceability', code: 'SOURCE_ASSET_UNCLAIMED', path: `/source_assets/${index}`, message: 'reviewed normative asset must supply accepted direct evidence tied to its locator' }];
  });
}
