import assert from 'node:assert/strict';
import test from 'node:test';

import { compileBehaviorProvenanceGraph, validateV5ProvenanceGraph } from '../../src/v5/provenance.mjs';

const ROOT = `sha256:${'a'.repeat(64)}`;

/** @param {string} nodeId @param {string} kind @param {Record<string, any>} [overrides] @returns {Record<string, any>} */
function node(nodeId, kind, overrides = {}) {
  return { node_id: nodeId, kind, run_id: 'RUN-1', case_document_lineage_id: 'LINEAGE-1', semantic_root_digest: ROOT, accepted: true, ...overrides };
}

test('the allowed provenance graph accepts only registered forward dependencies', () => {
  const graph = {
    nodes: [
      node('source', 'source_unit'),
      node('claim', 'claim', { evidence_level: 'E2' }),
      node('fact', 'fact'),
      node('behavior', 'behavior_contract'),
      node('outcome', 'atomic_outcome'),
      node('point', 'formal_test_point'),
      node('case', 'case'),
      node('oracle', 'case_oracle'),
      node('document', 'case_document', { immutable_digest: `sha256:${'b'.repeat(64)}` }),
      node('render', 'rendered_output')
    ],
    edges: [
      { from: 'source', to: 'claim' }, { from: 'claim', to: 'fact' },
      { from: 'fact', to: 'behavior' }, { from: 'behavior', to: 'outcome' },
      { from: 'outcome', to: 'point' }, { from: 'point', to: 'case' },
      { from: 'case', to: 'oracle' }, { from: 'claim', to: 'oracle' },
      { from: 'case', to: 'document' },
      { from: 'document', to: 'render', immutable_digest_ref: `sha256:${'b'.repeat(64)}` }
    ]
  };
  const result = validateV5ProvenanceGraph(graph);
  assert.equal(result.valid, true);
  assert.equal(new Set(result.topological_order).size, graph.nodes.length);
});

test('provenance rejects unregistered back edges and downstream source re-entry', () => {
  assert.throws(() => validateV5ProvenanceGraph({ nodes: [node('case', 'case'), node('claim', 'claim')], edges: [{ from: 'case', to: 'claim' }] }), (/** @type {any} */ error) => error.code === 'PROVENANCE_EDGE_NOT_ALLOWED');
  assert.throws(() => validateV5ProvenanceGraph({ nodes: [node('plan', 'execution_plan'), node('source', 'source_unit')], edges: [{ from: 'plan', to: 'source' }] }), (/** @type {any} */ error) => error.code === 'DOWNSTREAM_ARTIFACT_AS_SOURCE');
});

test('claim-to-claim derivation is E2-only and the complete graph is acyclic', () => {
  assert.throws(() => validateV5ProvenanceGraph({ nodes: [node('a', 'claim', { evidence_level: 'E3' }), node('b', 'claim')], edges: [{ from: 'a', to: 'b' }] }), (/** @type {any} */ error) => error.code === 'PROVENANCE_EDGE_NOT_ALLOWED');
  assert.throws(() => validateV5ProvenanceGraph({ nodes: [node('a', 'claim', { evidence_level: 'E2' }), node('b', 'claim', { evidence_level: 'E2' })], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] }), (/** @type {any} */ error) => error.code === 'PROVENANCE_CYCLE');
});

test('immutable cross-run execution derivation preserves lineage and exact digest binding', () => {
  const document = node('document', 'case_document', { immutable_digest: `sha256:${'b'.repeat(64)}` });
  const plan = node('plan', 'execution_plan', { run_id: 'RUN-2' });
  assert.equal(validateV5ProvenanceGraph({ nodes: [document, plan], edges: [{ from: 'document', to: 'plan', immutable_digest_ref: document.immutable_digest }] }).valid, true);
  assert.throws(() => validateV5ProvenanceGraph({ nodes: [document, { ...plan, case_document_lineage_id: 'LINEAGE-2' }], edges: [{ from: 'document', to: 'plan', immutable_digest_ref: document.immutable_digest }] }), (/** @type {any} */ error) => error.code === 'PROVENANCE_EDGE_NOT_ALLOWED');
});

test('Compiler derives the accepted Source→Claim→Behavior graph from stable refs', () => {
  const graph = compileBehaviorProvenanceGraph({
    runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: ROOT,
    claims: [{ claim_id: 'claim_0123456789abcdef', outcome_candidate_ids: ['out5_source'], evidence_level: 'E2' }],
    behaviorContracts: [{ contract_id: 'osc5_contract', basis: [{ kind: 'claim', claim_id: 'claim_0123456789abcdef' }] }]
  });
  assert.equal(validateV5ProvenanceGraph(graph).valid, true);
  assert.deepEqual(graph.edges, [
    { from: 'claim_0123456789abcdef', to: 'osc5_contract' },
    { from: 'out5_source', to: 'claim_0123456789abcdef' }
  ]);
  assert.match(graph.graph_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.throws(() => compileBehaviorProvenanceGraph({
    runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: ROOT,
    claims: [{ claim_id: 'claim_0123456789abcdef', outcome_candidate_ids: ['out5_source'], evidence_level: 'E2' }],
    behaviorContracts: [{ contract_id: 'osc5_contract', basis: [{ kind: 'claim', claim_id: 'claim-client-key' }] }]
  }), (error) => error.code === 'PROVENANCE_EDGE_NOT_ALLOWED');
});
