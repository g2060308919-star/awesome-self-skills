import assert from 'node:assert/strict';
import test from 'node:test';

import { compileBehaviorProvenanceGraph, extendCaseProvenanceGraph, validateV5ProvenanceGraph } from '../../src/v5/provenance.mjs';

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

test('Compiler derives the complete accepted semantic and Case provenance chain from stable refs', () => {
  const graph = compileBehaviorProvenanceGraph({
    runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: ROOT,
    claims: [{ claim_id: 'claim_0123456789abcdef', outcome_candidate_ids: ['out5_source'], evidence_level: 'E2' }],
    facts: [{ fact_id: 'FACT-fact', claim_ids: ['claim_0123456789abcdef'] }],
    atomicOutcomes: [{ outcome_id: 'OUT-outcome', fact_id: 'FACT-fact' }],
    formalTestPoints: [{ formal_test_point_id: 'TP-point', outcome_id: 'OUT-outcome' }],
    behaviorContracts: [{ contract_id: 'osc5_contract', basis: [{ kind: 'claim', claim_id: 'claim_0123456789abcdef' }], formal_test_point_ids: ['TP-point'] }]
  });
  assert.equal(validateV5ProvenanceGraph(graph).valid, true);
  const expectedSemanticEdges = [
    { from: 'FACT-fact', to: 'OUT-outcome' },
    { from: 'OUT-outcome', to: 'TP-point' },
    { from: 'claim_0123456789abcdef', to: 'osc5_contract' },
    { from: 'claim_0123456789abcdef', to: 'FACT-fact' },
    { from: 'osc5_contract', to: 'OUT-outcome' },
    { from: 'out5_source', to: 'claim_0123456789abcdef' }
  ];
  assert.equal(graph.edges.length, expectedSemanticEdges.length);
  for (const edge of expectedSemanticEdges) assert.equal(graph.edges.some((candidate) => JSON.stringify(candidate) === JSON.stringify(edge)), true, JSON.stringify(edge));
  const delivered = extendCaseProvenanceGraph({
    graph, runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: ROOT,
    cases: [{ case_id: 'CASE-case', primary_test_point_id: 'TP-point', oracles: [{ oracle_id: 'ORACLE-oracle', oracle_semantic_contract_id: 'osc5_contract', claim_ids: ['claim_0123456789abcdef'] }] }],
    caseDocumentDigest: `sha256:${'b'.repeat(64)}`,
    renderedOutputDigests: [`sha256:${'c'.repeat(64)}`]
  });
  assert.equal(validateV5ProvenanceGraph(delivered).valid, true);
  for (const edge of [
    { from: 'TP-point', to: 'CASE-case' }, { from: 'osc5_contract', to: 'CASE-case' },
    { from: 'CASE-case', to: 'ORACLE-oracle' }, { from: 'claim_0123456789abcdef', to: 'ORACLE-oracle' },
    { from: 'CASE-case', to: `sha256:${'b'.repeat(64)}` },
    { from: `sha256:${'b'.repeat(64)}`, to: `sha256:${'c'.repeat(64)}`, immutable_digest_ref: `sha256:${'b'.repeat(64)}` }
  ]) assert.equal(delivered.edges.some((candidate) => JSON.stringify(candidate) === JSON.stringify(edge)), true, JSON.stringify(edge));
  assert.match(graph.graph_digest, /^sha256:[0-9a-f]{64}$/u);
  assert.throws(() => compileBehaviorProvenanceGraph({
    runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: ROOT,
    claims: [{ claim_id: 'claim_0123456789abcdef', outcome_candidate_ids: ['out5_source'], evidence_level: 'E2' }],
    facts: [], atomicOutcomes: [], formalTestPoints: [],
    behaviorContracts: [{ contract_id: 'osc5_contract', basis: [{ kind: 'claim', claim_id: 'claim-client-key' }], formal_test_point_ids: [] }]
  }), (/** @type {any} */ error) => error.code === 'PROVENANCE_EDGE_NOT_ALLOWED');
});

test('Compiler rejects orphan and cross-root Case provenance instead of publishing a partial graph', () => {
  const base = compileBehaviorProvenanceGraph({
    runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: ROOT,
    claims: [{ claim_id: 'claim', outcome_candidate_ids: ['source'], evidence_level: 'E2' }],
    facts: [{ fact_id: 'fact', claim_ids: ['claim'] }], atomicOutcomes: [{ outcome_id: 'outcome', fact_id: 'fact' }],
    formalTestPoints: [{ formal_test_point_id: 'point', outcome_id: 'outcome' }], behaviorContracts: []
  });
  assert.throws(() => extendCaseProvenanceGraph({ graph: base, runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: ROOT, cases: [{ case_id: 'case', primary_test_point_id: 'missing', oracles: [] }], caseDocumentDigest: `sha256:${'b'.repeat(64)}`, renderedOutputDigests: [] }), (/** @type {any} */ error) => error.code === 'PROVENANCE_EDGE_NOT_ALLOWED');
  assert.throws(() => extendCaseProvenanceGraph({ graph: base, runId: 'RUN-1', caseDocumentLineageId: 'LINEAGE-1', semanticRootDigest: `sha256:${'d'.repeat(64)}`, cases: [], caseDocumentDigest: `sha256:${'b'.repeat(64)}`, renderedOutputDigests: [] }), (/** @type {any} */ error) => error.code === 'PROVENANCE_EDGE_NOT_ALLOWED');
});
