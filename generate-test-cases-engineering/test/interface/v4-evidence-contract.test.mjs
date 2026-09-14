import assert from 'node:assert/strict';
import test from 'node:test';

import schema from '../../skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json' with { type: 'json' };
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

/** @param {string} character */
const sha = character => `sha256:${character.repeat(64)}`;

/** @returns {any} */
function fixture() {
  return {
    schema_version: '4.0.0',
    source_revision: 0,
    claims: [],
    fact_ledger: [{
      fact_id: 'FACT-source-22',
      statement: 'source=22 表示打车去过',
      status: 'active',
      acceptance_role: 'primary_acceptance',
      claim_ids: ['CLM-source-22'],
      module_refs: ['admin'],
      field_path: '/response/source'
    }],
    semantic_gaps: [],
    topology_discovery: {
      source_structure_digest: sha('1'),
      discovery_digest: sha('2'),
      scanned_units: {
        reviewed_block_ids: ['BLOCK-prd'],
        reviewed_table_ids: [],
        reviewed_asset_digests: []
      },
      topology_candidates: [{
        candidate_id: `TC-${'3'.repeat(64)}`,
        kind: 'module_mention',
        label: '评价中台',
        locator_ids: ['LOC-admin'],
        discovery_digest: sha('3')
      }]
    },
    topology_review: {
      reviewed_block_ids: ['BLOCK-prd'],
      reviewed_table_ids: [],
      reviewed_asset_digests: [],
      unresolved_candidate_ids: []
    },
    topology_dispositions: [{
      candidate_id: `TC-${'3'.repeat(64)}`,
      disposition: 'module',
      module_ref: 'admin',
      role: 'primary',
      review_basis_claim_ids: ['CLM-admin']
    }],
    scope_manifest: {
      primary_surface: 'admin',
      modules: [{
        module_id: 'admin', name: '评价中台', role: 'primary', claim_ids: ['CLM-admin']
      }],
      boundaries: []
    },
    interaction_review: [
      'shared-entity', 'role', 'client', 'interface-event', 'time', 'concurrency', 'side-effect'
    ].map(dimension => ({
      module_ids: ['admin'], dimension, status: 'checked-no-signal',
      reviewed_claim_ids: ['CLM-admin'], review_basis: `已核对 ${dimension}`
    })),
    acceptance_role_assignments: [{
      entity_kind: 'fact', entity_id: 'FACT-source-22', scope_ref: 'admin.review-list',
      acceptance_role: 'primary_acceptance', parent_entity_ids: [],
      role_basis_claim_ids: ['CLM-source-22']
    }]
  };
}

test('v4 Evidence root carries the compiler discovery, reviewed scope, exact Facts and acceptance-role proof', () => {
  assert.deepEqual(validateAgainstSchema(fixture(), schema), []);
});

test('v4 Evidence rejects the legacy Fact shape and every missing compiler/reviewer scope witness', () => {
  const legacy = fixture();
  legacy.fact_ledger[0] = {
    fact_id: 'FACT-source-22', claim_id: 'CLM-source-22', status: 'active',
    source_claim_ids: ['CLM-source-22'], required_view_kinds: ['integration'],
    view_review_basis: 'legacy projection'
  };
  assert.notDeepEqual(validateAgainstSchema(legacy, schema), []);
  for (const field of [
    'topology_discovery', 'topology_review', 'topology_dispositions', 'scope_manifest',
    'interaction_review', 'acceptance_role_assignments'
  ]) {
    const missing = fixture();
    delete missing[field];
    assert.notDeepEqual(validateAgainstSchema(missing, schema), [], field);
  }
});

test('v3 Evidence bytes keep the legacy closed Fact contract and reject v4-only scope fields', () => {
  const legacy = {
    schema_version: '3.0.0', source_revision: 0, claims: [],
    fact_ledger: [{
      fact_id: 'FACT-source-22', claim_id: 'CLM-source-22', status: 'active',
      source_claim_ids: ['CLM-source-22'], required_view_kinds: ['integration'],
      view_review_basis: 'legacy projection'
    }]
  };
  assert.deepEqual(validateAgainstSchema(legacy, schema), []);
  assert.notDeepEqual(validateAgainstSchema({ ...legacy, scope_manifest: fixture().scope_manifest }, schema), []);
});
