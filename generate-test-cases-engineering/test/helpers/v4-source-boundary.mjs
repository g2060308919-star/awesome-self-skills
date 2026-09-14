import { buildJourney } from './run-journey.mjs';
import { digest } from '../../src/canonical.mjs';
import { canonicalizeAuditedSourceCapture, createExpiryMatcherRegistry } from '../../src/source-capture-audit.mjs';
import { createSourceProviderRegistry } from '../../src/source-canonicalization.mjs';
import { compileCanonicalSourceStructure } from '../../src/source-locators-v4.mjs';
import { createSourceSubjectRegistry } from '../../src/source-subjects-v4.mjs';
import { discoverTopologyV4 } from '../../src/topology-discovery.mjs';

/** Fully auditable v4 input, retaining v3 authority metadata for evidence gates.
 * @returns {any}
 */
export function sourceBoundaryFixture() {
  const journey = buildJourney('all-e3'); const pack = journey.source_pack; const evidence = journey.evidence_claims;
  const providers = createSourceProviderRegistry([]); const expiry = createExpiryMatcherRegistry([]);
  const subjects = createSourceSubjectRegistry({ scope_refs: ['checkout'], module_ids: ['checkout'], entity_types: ['order'] });
  const source = pack.sources[0]; const claim = evidence.claims[0];
  claim.value = 'checkout accepted 订单进入已接受状态';
  const bytes = new TextEncoder().encode(claim.value);
  const input = { stable_source_id: source.source_id, source_type: source.kind, capture_bytes: bytes, assets: [] };
  const audited = canonicalizeAuditedSourceCapture(input, providers, {}, expiry);
  const projection = { ...audited.semantic_projection, structure: compileCanonicalSourceStructure(source.source_id, audited.semantic_projection.content) };
  Object.assign(source, { content: projection.content, content_digest: audited.capture_digest.slice(7), domain: 'business',
    capture_digest: audited.capture_digest, semantic_digest: 'sha256:' + digest(projection), semantic_projection: projection, capture_audit: audited.capture_audit });
  const unit = projection.structure[0]; const textDigest = audited.capture_digest;
  pack.schema_version = evidence.schema_version = '4.0.0'; pack.delivery_intent = 'case_document'; pack.artifact_events = []; evidence.semantic_gaps = [];
  pack.locators = [{ locator_id: claim.source_locator_ids[0], source_id: source.source_id, semantic_digest: source.semantic_digest,
    type: 'text_block_range', unit_id: unit.unit_id, section_id: unit.section_id, range: { start: 0, end: Array.from(unit.text).length },
    excerpt: unit.text, excerpt_digest: textDigest, domain: 'business', field_path: '/state' }];
  pack.source_reviews = [{ source_id: source.source_id, semantic_digest: source.semantic_digest,
    units: [{ unit_id: unit.unit_id, content_digest: textDigest, classification: 'normative' }] }];
  pack.source_policy.rules[0].rule_internal_conflict_review = [];
  Object.assign(claim, { domain: 'business', field_path: '/state', document_level_claim: true, locator_roles: [],
    subject_descriptor: { scope_ref: 'checkout', module_id: 'checkout', entity_type: 'order', entity_key: 'order', field_path: '/state', condition: {} },
    semantic_value: {
      source_value: { state: 'accepted' },
      behavior_assertions: [
        { fact_id: 'fact_checkout', field_path: '/business_outcome', value: '订单进入已接受状态' },
        { fact_id: 'fact_checkout', field_path: '/condition', value: { submitted: true } },
        { fact_id: 'fact_checkout', field_path: '/expected', value: '已接受' }
      ]
    } });
  evidence.fact_ledger = evidence.fact_ledger.map((/** @type {any} */ item) => {
    const claimIds = [...new Set([item.claim_id, ...(item.source_claim_ids ?? [])])];
    const primary = evidence.claims.find((/** @type {any} */ candidate) => candidate.claim_id === item.claim_id) ?? claim;
    return {
      fact_id: item.fact_id, statement: String(primary.value), status: item.status,
      acceptance_role: 'primary_acceptance', claim_ids: claimIds,
      module_refs: ['checkout'], field_path: primary.field_path ?? '/state'
    };
  });
  const topologyInput = {
    sources: pack.sources.map((/** @type {any} */ item) => ({
      source_id: item.source_id,
      units: item.semantic_projection.structure.map((/** @type {any} */ sourceUnit) => ({
        kind: sourceUnit.type === 'table_cell' ? 'table' : 'text_block',
        unit_id: sourceUnit.type === 'table_cell' ? sourceUnit.table_id : sourceUnit.unit_id,
        review_class: pack.source_reviews.find((/** @type {any} */ review) => review.source_id === item.source_id)
          ?.units.find((/** @type {any} */ reviewed) => reviewed.unit_id === sourceUnit.unit_id)?.classification ?? 'normative',
        locator_id: pack.locators.find((/** @type {any} */ locator) => locator.unit_id === sourceUnit.unit_id)?.locator_id ?? `LOC-${sourceUnit.unit_id}`,
        ...(sourceUnit.type === 'table_cell'
          ? { cells: [{ cell_id: sourceUnit.unit_id, locator_id: `LOC-${sourceUnit.unit_id}`, text: sourceUnit.text }] }
          : { text: sourceUnit.text })
      }))
    }))
  };
  const topology = discoverTopologyV4(topologyInput);
  claim.semantic_value.topology_authorization = {
    candidates: topology.topology_candidates.map((/** @type {any} */ candidate) => ({
      kind: candidate.kind, label: candidate.label, locator_ids: [...candidate.locator_ids],
      disposition: 'module', module_ref: 'checkout', role: 'primary'
    })),
    reviewable_interaction_cells: [
      'shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'
    ].map(dimension => ({ module_ids: ['checkout'], dimension }))
  };
  evidence.topology_discovery = topology;
  evidence.topology_review = { ...topology.scanned_units, unresolved_candidate_ids: [] };
  evidence.topology_dispositions = topology.topology_candidates.map((/** @type {any} */ candidate) => ({
    candidate_id: candidate.candidate_id, disposition: 'module', module_ref: 'checkout', role: 'primary',
    review_basis_claim_ids: [claim.claim_id]
  }));
  evidence.scope_manifest = {
    primary_surface: 'checkout',
    modules: [{
      module_id: 'checkout', name: topology.topology_candidates[0].label,
      role: 'primary', claim_ids: [claim.claim_id]
    }],
    boundaries: []
  };
  evidence.interaction_review = [
    'shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'
  ].map(dimension => ({ module_ids: ['checkout'], dimension, status: 'checked-no-signal',
    reviewed_claim_ids: [claim.claim_id], review_basis: `Reviewed ${dimension}` }));
  evidence.acceptance_role_assignments = evidence.fact_ledger.map((/** @type {any} */ fact) => ({
    entity_kind: 'fact', entity_id: fact.fact_id, scope_ref: 'checkout',
    acceptance_role: fact.acceptance_role, parent_entity_ids: [], role_basis_claim_ids: fact.claim_ids
  }));
  return { pack, evidence, providers, expiry, subjects,
    acquisitions: [{ source_id: source.source_id, input, acquisition: {}, additional_units: [] }] };
}
