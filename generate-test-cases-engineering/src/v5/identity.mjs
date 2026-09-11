import { createHash } from 'node:crypto';

import { canonicalV5Stringify, canonicalizeV5Value } from './canonical-v5.mjs';
import { V5_STABLE_ID_ROWS, V5_STABLE_PROJECTION_FIELDS } from './constants.mjs';
import { acceptArtifactEnvelope } from './envelopes.mjs';
import { V5ProtocolError } from './errors.mjs';

const rowsByKind = new Map(V5_STABLE_ID_ROWS.map(([objectKind, prefix, projectionId]) => [objectKind, { objectKind, prefix, projectionId }]));
const rowsByPrefix = new Map(V5_STABLE_ID_ROWS.map(([objectKind, prefix, projectionId]) => [prefix, { objectKind, prefix, projectionId }]));
const projectionFields = /** @type {Record<string, string[]>} */ (V5_STABLE_PROJECTION_FIELDS);

/** @param {unknown} value */
function sha256Hex(value) {
  return createHash('sha256').update(canonicalV5Stringify(value)).digest('hex');
}

/** @param {string} namespace @param {unknown} payload */
export function v5Digest(namespace, payload) {
  return `sha256:${sha256Hex({ namespace: `generate-test-cases/v5/${namespace}`, format_version: 1, payload: canonicalizeV5Value(payload) })}`;
}

/**
 * Compute one V5-only stable ID from the closed registry projection. The first
 * argument accepts the object kind or its exact registered prefix.
 * @param {string} kindOrPrefix
 * @param {Record<string, unknown>} semanticPreimage
 */
export function stableV5Id(kindOrPrefix, semanticPreimage) {
  const row = rowsByKind.get(kindOrPrefix) ?? rowsByPrefix.get(kindOrPrefix);
  if (!row) throw new V5ProtocolError('CLIENT_KEY_INVALID', `Unknown V5 stable-ID namespace: ${kindOrPrefix}`);
  const fields = projectionFields[row.projectionId];
  const missing = fields.filter((field) => !Object.hasOwn(semanticPreimage, field));
  if (missing.length > 0) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', `Stable-ID projection ${row.projectionId} is missing ${missing.join(', ')}.`);
  const projection = Object.fromEntries(fields.map((field) => [field, semanticPreimage[field]]));
  const preimage = { profile_version: 1, object_kind: row.objectKind, projection: canonicalizeV5Value(projection) };
  return `${row.prefix}${sha256Hex(preimage)}`;
}

export { acceptArtifactEnvelope };
