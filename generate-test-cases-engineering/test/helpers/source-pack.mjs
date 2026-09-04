import { createHash } from 'node:crypto';

/** @param {string} content */
function sha256(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Complete hand-authored test Source Packs with real digest bindings and an
 * exhaustive review partition. Direct-Claim locator ranges are normative;
 * every remaining substantive segment is explicitly non-normative.
 * @param {any} sourcePack
 * @param {any} [evidenceClaims]
 */
export function completeSourcePack(sourcePack, evidenceClaims = { claims: [] }) {
  const directLocatorIds = new Set();
  for (const claim of evidenceClaims.claims ?? []) {
    if (claim?.claim_form !== 'direct') continue;
    for (const locatorId of claim.source_locator_ids ?? []) directLocatorIds.add(locatorId);
  }
  const locatorsBySource = new Map();
  for (const locator of sourcePack.locators ?? []) {
    const list = locatorsBySource.get(locator.source_id) ?? [];
    list.push(locator);
    locatorsBySource.set(locator.source_id, list);
  }
  sourcePack.source_reviews = [];
  for (const source of sourcePack.sources ?? []) {
    const content = String(source.content ?? '');
    const contentDigest = sha256(content);
    source.content_digest = contentDigest;
    const locators = locatorsBySource.get(source.source_id) ?? [];
    const boundaries = new Set([0, content.length]);
    const normativeRanges = [];
    for (const locator of locators) {
      locator.content_digest = contentDigest;
      if (locator.type !== 'text-range' || !directLocatorIds.has(locator.locator_id)) continue;
      const start = Number(locator.text_range?.start);
      const end = Number(locator.text_range?.end);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
        || start < 0 || end <= start || end > content.length) continue;
      boundaries.add(start);
      boundaries.add(end);
      normativeRanges.push({ start, end });
    }
    const ordered = [...boundaries].sort((left, right) => left - right);
    const spans = [];
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const start = ordered[index];
      const end = ordered[index + 1];
      if (content.slice(start, end).trim().length === 0) continue;
      const normative = normativeRanges.some((range) => range.start <= start && range.end >= end);
      spans.push({
        span_id: `review_${source.source_id}_${String(spans.length + 1).padStart(3, '0')}`,
        start, end, classification: normative ? 'normative' : 'non_normative',
        rationale: normative ? 'Covered by a direct Claim locator.' : 'Reviewed test-fixture context.'
      });
    }
    sourcePack.source_reviews.push({ source_id: source.source_id, content_digest: contentDigest, spans });
  }
  return sourcePack;
}
