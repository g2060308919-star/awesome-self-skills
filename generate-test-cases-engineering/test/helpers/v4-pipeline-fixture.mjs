import { digest } from '../../src/canonical.mjs';
import { sourceBoundaryFixture } from './v4-source-boundary.mjs';

const DIMENSIONS = ['shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'];

/** A complete one-outcome v4 revision plus its private compiler context. @returns {any} */
export function v4PipelineFixture() {
  const source = sourceBoundaryFixture();
  const claim = source.evidence.claims[0];
  const fact = source.evidence.fact_ledger[0];
  const element = {
    element_id: 'EL-checkout-accepted', kind: 'state', fact_id: fact.fact_id,
    business_outcome: '订单进入已接受状态', condition: { submitted: true }, expected: '已接受',
    evidence_bindings: [
      { field_path: '/business_outcome', claim_ids: [claim.claim_id] },
      { field_path: '/condition', claim_ids: [claim.claim_id] },
      { field_path: '/expected', claim_ids: [claim.claim_id] }
    ]
  };
  const behavior_views = {
    schema_version: '4.0.0', source_revision: 0,
    views: [{
      view_id: 'VIEW-checkout-state', module_id: 'checkout', type: 'state', scope: 'checkout',
      source_claim_ids: [claim.claim_id], elements: [element], relations: []
    }],
    interaction_matrix: DIMENSIONS.map(dimension => ({
      module_ids: ['checkout'], dimension, status: 'checked-no-signal'
    })),
    interaction_candidates: [],
    obligation_inputs: {
      view_contexts: [], terminal_fact_routes: [], custom_responsibilities: [], combination_requests: []
    }
  };
  const outcomeId = `OUT-${digest({
    fact_id: fact.fact_id, condition: element.condition, expected: element.expected,
    acceptance_role: fact.acceptance_role
  })}`;
  const pointId = `TP-${digest({ outcome_id: outcomeId })}`;
  const case_drafts = {
    schema_version: '4.0.0', source_revision: 0,
    cases: [{
      case_id: 'CASE-adapter-placeholder', title: '提交订单后显示已接受', module_id: 'checkout', priority: 'P0',
      ordering: { business_flow_ref: null, page_action_ref: null },
      acceptance_role: 'primary_acceptance', fact_ids: [fact.fact_id],
      primary_test_point_id: pointId, supporting_observation_ids: [],
      business_preconditions: [], data_conditions: [],
      steps: [{ step_id: 'STEP-submit', action: '提交符合要求的订单' }],
      oracles: [{
        oracle_id: 'ORACLE-state', observe_after_step_id: 'STEP-submit', surface: 'ui',
        expected: '订单状态显示为已接受', claim_ids: [claim.claim_id]
      }]
    }]
  };
  const unit = source.pack.sources[0].semantic_projection.structure[0];
  const locator = source.pack.locators[0];
  const candidateId = source.evidence.topology_discovery.topology_candidates[0].candidate_id;
  const reviewableCells = DIMENSIONS.map(dimension => ({ module_ids: ['checkout'], dimension }));
  const canonicalSourceStructure = {
    sources: [{
      source_id: source.pack.sources[0].source_id,
      units: [{
        kind: 'text_block', unit_id: unit.unit_id, review_class: 'normative',
        locator_id: locator.locator_id, text: unit.text
      }]
    }]
  };
  const verifiedTopologyClaim = {
    claim_id: claim.claim_id, candidate_ids: [candidateId], authorized_topology_roles: ['primary'],
    authorized_boundaries: [], reviewable_interaction_cells: reviewableCells
  };
  const system = {
    source: {
      provider_registry: source.providers, expiry_registry: source.expiry, subject_registry: source.subjects,
      acquisitions: source.acquisitions
    },
    topology: {
      canonical_source_structure: canonicalSourceStructure,
      verified_claims: [verifiedTopologyClaim], effective_scope_decisions: []
    },
    interaction: { verified_claims: [verifiedTopologyClaim] },
    behavior_evidence: {
      facts: [{
        fact_id: fact.fact_id, module_id: 'checkout', acceptance_role: 'primary_acceptance',
        condition_field: 'state'
      }],
      claims: [{
        claim_id: claim.claim_id, level: 'E3', supported: true,
        assertions: element.evidence_bindings.map(binding => ({
          fact_id: fact.fact_id, field_path: binding.field_path,
          value: binding.field_path === '/business_outcome' ? element.business_outcome
            : binding.field_path === '/condition' ? element.condition : element.expected
        }))
      }]
    },
    ordering: {
      sources: [{ stable_source_id: source.pack.sources[0].source_id }],
      locators: [{
        locator_id: locator.locator_id, stable_source_id: source.pack.sources[0].source_id,
        unit_kind: 'text', structural_coordinates: [0], start_scalar: locator.range.start
      }],
      modules: [{ module_id: 'checkout', role: 'primary', locator_ids: [locator.locator_id] }],
      flows: [], actions: [], dependencies: [], verified_claims: [], verified_decisions: []
    },
    claim_assessments: [{
      claim_id: claim.claim_id, domain: 'business_semantics', level: 'E3', support_review: 'supported'
    }],
    decisions: { delivery_requested: false, root_statuses: [] }
  };
  return {
    artifacts: { source_pack: source.pack, evidence_claims: source.evidence, behavior_views, case_drafts },
    system
  };
}
