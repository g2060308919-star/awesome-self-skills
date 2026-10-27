import sourcePackSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import { sourceByteDigest } from './source-canonicalization.mjs';
import { compileAuditedSource } from './source-compiler-v4.mjs';
import { validateV4SourceLocators, validateV4SourceReviews } from './source-locators-v4.mjs';
import { createCompilerSourceRuntimeV4 } from './source-runtime-registry-v4.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { canonicalTopologyStructure } from './v4-system-context.mjs';
import { discoverTopologyV4 } from './topology-discovery.mjs';

/** @param {unknown} value @param {string[]} keys */
function only(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(key => keys.includes(key));
}

const badInput = () => ({
  status: 'source_diagnostic',
  diagnostics: [{ category: 'source', code: 'SOURCE_PREPARATION_INPUT_INVALID',
    message: 'Source preparation needs a closed metadata and exact in-memory byte input.' }]
});

/**
 * Prepare one Source from the exact in-memory collection. The raw response is
 * recorded by digest only; the declared capture is compiled by the same code
 * later used to verify acquired Source records. No business review is inferred.
 * @param {unknown} submitted
 */
export function prepareV4Source(submitted) {
  if (!only(submitted, ['metadata', 'raw_response_bytes', 'capture_bytes', 'assets', 'acquisition', 'additional_units'])) return badInput();
  const input = /** @type {any} */ (submitted);
  if (!(input.raw_response_bytes instanceof Uint8Array)
    || !(input.capture_bytes instanceof Uint8Array)
    || !Array.isArray(input.assets)
    || input.assets.some((/** @type {any} */ asset) => !only(asset, ['retrieval_uri', 'bytes'])
      || typeof asset.retrieval_uri !== 'string' || !(asset.bytes instanceof Uint8Array))
    || !only(input.acquisition, ['provider', 'provider_contract_version'])
    || !Array.isArray(input.additional_units)) return badInput();
  const { provider_registry, expiry_registry } = createCompilerSourceRuntimeV4();
  const result = compileAuditedSource(input.metadata, {
    source_id: input.metadata?.source_id,
    input: {
      stable_source_id: input.metadata?.source_id,
      source_type: input.metadata?.kind,
      capture_bytes: input.capture_bytes,
      assets: input.assets
    },
    acquisition: input.acquisition,
    additional_units: input.additional_units
  }, { provider_registry, expiry_registry });
  if (result.status !== 'canonical') return result;
  return {
    status: 'prepared', source: result.source,
    units: structuredClone(result.source.semantic_projection.structure),
    review_units: result.source.semantic_projection.structure
      .filter((/** @type {any} */ unit) => unit.text.trim())
      .map((/** @type {any} */ unit) => ({
        unit_id: unit.unit_id, content_digest: sourceByteDigest(new TextEncoder().encode(unit.text))
      })),
    collection: {
      raw_response_digest: sourceByteDigest(input.raw_response_bytes),
      capture_digest: result.source.capture_digest,
      assets: structuredClone(result.source.semantic_projection.assets)
    }
  };
}

/** Check a complete candidate before placing it in staging. The compiler CLI
 * remains the final authority, including Claim and run/revision validation.
 * @param {unknown} submitted
 */
function inspectV4SourcePack(submitted) {
  const diagnostics = validateAgainstSchema(submitted, sourcePackSchema);
  if (diagnostics.length) return { status: 'invalid', diagnostics, topology: null };
  const pack = /** @type {any} */ (submitted);
  diagnostics.push(...validateV4SourceReviews(pack));
  diagnostics.push(...validateV4SourceLocators(pack));
  if (diagnostics.length) return { status: 'invalid', diagnostics, topology: null };
  try {
    return { status: 'valid', diagnostics, topology: discoverTopologyV4(canonicalTopologyStructure(pack)) };
  } catch {
    diagnostics.push({ category: 'source', code: 'TOPOLOGY_SOURCE_BINDING_INVALID',
      path: '/locators', message: 'The reviewed source structure cannot be consumed by topology discovery.' });
    return { status: 'invalid', diagnostics, topology: null };
  }
}

/** @param {unknown} submitted */
export function validateV4SourcePackBeforeStaging(submitted) {
  const { status, diagnostics } = inspectV4SourcePack(submitted);
  return { status, diagnostics };
}
