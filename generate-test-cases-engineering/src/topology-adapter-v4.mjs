import sourceSchema from '../skill/generate-test-cases/scripts/schemas/source-pack.schema.json' with { type: 'json' };
import evidenceSchema from '../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import { canonicalStringify } from './canonical.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { validateV4ClaimLocators, validateV4SourceReviews } from './source-locators-v4.mjs';
import { isV4SchemaVersion } from './v4-contract.mjs';
import { canonicalTopologyStructure, topologySystem } from './v4-system-context.mjs';
import { discoverTopologyV4, snapshotTopologyInputV4 } from './topology-discovery.mjs';
import { compileScopeManifestV4 } from './scope-manifest-v4.mjs';

const topologyText = { type: 'string', minLength: 1, pattern: '\\S' };
const topologyIds = { type: 'array', minItems: 1, uniqueItems: true, items: topologyText };
/** @param {Record<string,any>} properties */
const closedTopologyInput = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const topologyCandidateFields = { kind: { enum: ['module_mention', 'boundary_signal'] }, label: topologyText, locator_ids: topologyIds };
const authorizationSchema = closedTopologyInput({
  candidates: { type: 'array', uniqueItems: true, items: { oneOf: [
    closedTopologyInput({ ...topologyCandidateFields, kind: { const: 'module_mention' }, disposition: { const: 'module' }, module_ref: topologyText,
      role: { enum: ['primary', 'upstream', 'downstream', 'external'] } }),
    closedTopologyInput({ ...topologyCandidateFields, kind: { const: 'boundary_signal' }, disposition: { const: 'boundary' },
      from_module_ref: topologyText, to_module_ref: topologyText, channel: topologyText, acceptance_scope: { const: 'contract_only' } }),
    closedTopologyInput({ ...topologyCandidateFields, disposition: { const: 'not_relevant' } })
  ] } },
  reviewable_interaction_cells: { type: 'array', uniqueItems: true, items: closedTopologyInput({
    module_ids: topologyIds, dimension: { enum: ['shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'] }
  }) }
});

/** @param {any} value @param {any} schema @param {string} code */
function checkTopologyInput(value, schema, code) {
  if (validateAgainstSchema(value, schema).length) throw new TypeError(code);
}

/** The public boundary validates submitted JSON but does not accept evidence,
 * grant authority, or read/write a run. The runner remains the authority gate.
 * @param {unknown} sourcePack @param {unknown} submittedClaims */
function prepareTopologyInput(sourcePack, submittedClaims) {
  const pack = snapshotTopologyInputV4(sourcePack);
  const claims = snapshotTopologyInputV4(submittedClaims);
  checkTopologyInput(pack, sourceSchema, 'TOPOLOGY_SOURCE_PACK_INVALID');
  if (!isV4SchemaVersion(pack.schema_version) || pack.delivery_intent !== 'case_document') {
    throw new TypeError('TOPOLOGY_SOURCE_PACK_INVALID');
  }
  checkTopologyInput(claims, { $defs: evidenceSchema.$defs, type: 'array', items: { $ref: '#/$defs/v4EvidenceClaim' } }, 'TOPOLOGY_CLAIMS_INVALID');
  const byId = new Map(claims.map((/** @type {any} */ claim) => [claim.claim_id, claim]));
  if (byId.size !== claims.length) throw new TypeError('TOPOLOGY_CLAIMS_INVALID');
  const problems = [
    ...validateV4SourceReviews(pack),
    ...validateV4ClaimLocators(pack, claims.filter((/** @type {any} */ c) => c.claim_form === 'direct'))
  ];
  if (problems.length) throw new TypeError(`TOPOLOGY_SOURCE_BINDING_INVALID:${problems[0].code}`);
  /** @param {any} claim @param {Set<string>} [visited] @returns {Set<string>} */
  function claimLocators(claim, visited = new Set()) {
    if (!claim || visited.has(claim.claim_id)) throw new TypeError('TOPOLOGY_CLAIM_ANCESTRY_INVALID');
    visited.add(claim.claim_id);
    const result = new Set(/** @type {string[]} */ (claim.source_locator_ids ?? []));
    for (const id of claim.parent_claim_ids ?? []) {
      for (const locator of claimLocators(byId.get(id), new Set(visited))) result.add(locator);
    }
    return result;
  }
  for (const claim of claims) {
    const auth = claim.semantic_value?.topology_authorization;
    if (auth === undefined) continue;
    checkTopologyInput(auth, authorizationSchema, 'TOPOLOGY_AUTHORIZATION_INVALID');
    if (claim.domain !== 'business' || (claim.level === 'E1' && claim.claim_form !== 'decision-record')) {
      throw new TypeError('TOPOLOGY_AUTHORIZATION_INVALID');
    }
    const locators = claimLocators(claim);
    for (const item of auth.candidates) {
      if (item.locator_ids.some((/** @type {string} */ id) => !locators.has(id))) {
        throw new TypeError('TOPOLOGY_AUTHORIZATION_LOCATOR_INVALID');
      }
    }
  }
  const system = topologySystem({ claims }, canonicalTopologyStructure(pack));
  return { claims, system };
}

/** Discover compiler-owned candidates from the supplied, reviewed source
 * snapshot. This does not certify Claim truth or complete a topology review.
 * @param {unknown} sourcePack @param {unknown} claims */
export function discoverV4Topology(sourcePack, claims) {
  const { system } = prepareTopologyInput(sourcePack, claims);
  return discoverTopologyV4(system.canonical_source_structure, {
    semantic_candidates: system.semantic_topology_candidates ?? []
  });
}

/** Construct only the existing four topology fields for evidence_claims.
 * Explicit review witnesses are mandatory. No file writes or runner actions.
 * @param {unknown} sourcePack @param {unknown} claims @param {unknown} submittedReview */
export function constructV4TopologyEvidence(sourcePack, claims, submittedReview) {
  const prepared = prepareTopologyInput(sourcePack, claims);
  const review = snapshotTopologyInputV4(submittedReview);
  checkTopologyInput(review, { $defs: evidenceSchema.$defs, ...closedTopologyInput({
    discovery_digest: { $ref: '#/$defs/v4SourceSha256' }, primary_surface: topologyText,
    topology_review: { $ref: '#/$defs/topologyReview' },
    topology_dispositions: { type: 'array', items: { $ref: '#/$defs/topologyDisposition' } }
  }) }, 'TOPOLOGY_REVIEW_INPUT_INVALID');
  const compiled = compileScopeManifestV4(review, prepared.system);
  if (compiled.diagnostics.length) throw new TypeError(compiled.diagnostics.map((/** @type {any} */ d) => d.code).join(','));
  // The legacy internal verifier aggregates roles per Claim. At this new
  // boundary bind each disposition to its own declared candidate and role.
  for (const disposition of review.topology_dispositions) {
    const item = compiled.discovery.topology_candidates.find((/** @type {any} */ c) => c.candidate_id === disposition.candidate_id);
    const basis = disposition.review_basis_claim_ids ?? disposition.review_basis?.claim_ids ?? [];
    for (const id of basis) {
      const auth = prepared.claims.find((/** @type {any} */ c) => c.claim_id === id)?.semantic_value?.topology_authorization;
      const matches = auth?.candidates.some((/** @type {any} */ declared) => {
        if (declared.kind !== item.kind || declared.label !== item.label
          || canonicalStringify([...declared.locator_ids].sort()) !== canonicalStringify([...item.locator_ids].sort())
          || declared.disposition !== disposition.disposition) return false;
        const fields = disposition.disposition === 'module' ? ['module_ref', 'role']
          : disposition.disposition === 'boundary' ? ['from_module_ref', 'to_module_ref', 'channel', 'acceptance_scope'] : [];
        return fields.every(key => declared[key] === disposition[key]);
      });
      if (!matches) throw new TypeError('TOPOLOGY_AUTHORIZATION_DISPOSITION_MISMATCH');
    }
  }
  return {
    topology_discovery: structuredClone(compiled.discovery),
    topology_review: structuredClone(review.topology_review),
    topology_dispositions: structuredClone(review.topology_dispositions),
    scope_manifest: compiled.scope_manifest
  };
}
