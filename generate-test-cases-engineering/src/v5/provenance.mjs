import { generateV5Contracts } from './registry-generator.mjs';
import { V5ProtocolError } from './errors.mjs';
import { canonicalObjectDigest } from './storage-records.mjs';

const provenancePolicy = generateV5Contracts().policyRegistry.provenance_policy;
const edgeRules = new Map(provenancePolicy.allowed_edges.map((/** @type {Record<string, any>} */ row) => [`${row.from_kind}->${row.to_kind}`, row]));
const downstreamKinds = new Set(['behavior_contract', 'atomic_outcome', 'formal_test_point', 'case', 'case_oracle', 'case_document', 'execution_plan', 'execution_result', 'rendered_output']);

/**
 * Build the accepted Behavior provenance projection from Compiler-owned stable
 * Claim and contract identities. Agent artifacts never provide this graph.
 * @param {{runId:string,caseDocumentLineageId:string,semanticRootDigest:string,claims:Array<Record<string,any>>,facts:Array<Record<string,any>>,atomicOutcomes:Array<Record<string,any>>,formalTestPoints:Array<Record<string,any>>,behaviorContracts:Array<Record<string,any>>}} input
 */
export function compileBehaviorProvenanceGraph(input) {
  const common = {
    run_id: input.runId, case_document_lineage_id: input.caseDocumentLineageId,
    semantic_root_digest: input.semanticRootDigest, accepted: true
  };
  const nodes = new Map();
  const edges = [];
  const addNode = (/** @type {Record<string,any>} */ node) => {
    if (!node.node_id || nodes.has(node.node_id)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Compiler provenance identities must be nonblank and unique.');
    nodes.set(node.node_id, node);
  };
  const claims = new Map();
  for (const claim of input.claims) {
    if (typeof claim.claim_id !== 'string' || !Array.isArray(claim.outcome_candidate_ids) || claim.outcome_candidate_ids.length === 0 || !['E1', 'E2', 'E3'].includes(claim.evidence_level)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Compiler provenance Claim projection is incomplete.');
    addNode({ node_id: claim.claim_id, kind: 'claim', ...common, evidence_level: claim.evidence_level });
    claims.set(claim.claim_id, claim);
    for (const sourceUnitId of [...new Set(claim.outcome_candidate_ids)].sort()) {
      if (!nodes.has(sourceUnitId)) addNode({ node_id: sourceUnitId, kind: 'source_unit', ...common });
      edges.push({ from: sourceUnitId, to: claim.claim_id });
    }
  }
  const facts = new Map();
  for (const fact of input.facts) {
    if (typeof fact.fact_id !== 'string' || !Array.isArray(fact.claim_ids) || fact.claim_ids.length === 0) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Compiler provenance Fact projection is incomplete.');
    addNode({ node_id: fact.fact_id, kind: 'fact', ...common });
    facts.set(fact.fact_id, fact);
    for (const claimId of [...new Set(fact.claim_ids)].sort()) {
      if (!claims.has(claimId)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Fact provenance must resolve accepted Compiler-owned Claims.');
      edges.push({ from: claimId, to: fact.fact_id });
    }
  }
  const behaviorContracts = new Map();
  for (const contract of input.behaviorContracts) {
    if (typeof contract.contract_id !== 'string' || !Array.isArray(contract.basis) || contract.basis.length === 0) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Compiler provenance Behavior contract projection is incomplete.');
    addNode({ node_id: contract.contract_id, kind: 'behavior_contract', ...common });
    behaviorContracts.set(contract.contract_id, contract);
    for (const basis of contract.basis) {
      if (basis.kind !== 'claim' || !claims.has(basis.claim_id)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Behavior provenance must resolve accepted Compiler-owned Claim basis.');
      edges.push({ from: basis.claim_id, to: contract.contract_id });
    }
  }
  const outcomes = new Map();
  for (const outcome of input.atomicOutcomes) {
    if (typeof outcome.outcome_id !== 'string' || typeof outcome.fact_id !== 'string' || !facts.has(outcome.fact_id)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'AtomicOutcome provenance must resolve one Compiler-owned Fact.');
    addNode({ node_id: outcome.outcome_id, kind: 'atomic_outcome', ...common });
    outcomes.set(outcome.outcome_id, outcome);
    edges.push({ from: outcome.fact_id, to: outcome.outcome_id });
  }
  const pointById = new Map();
  const outcomeByPointId = new Map();
  for (const point of input.formalTestPoints) {
    if (typeof point.formal_test_point_id !== 'string' || typeof point.outcome_id !== 'string' || !outcomes.has(point.outcome_id)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'FormalTestPoint provenance must resolve one Compiler-owned AtomicOutcome.');
    addNode({ node_id: point.formal_test_point_id, kind: 'formal_test_point', ...common });
    pointById.set(point.formal_test_point_id, point);
    outcomeByPointId.set(point.formal_test_point_id, point.outcome_id);
    edges.push({ from: point.outcome_id, to: point.formal_test_point_id });
  }
  for (const contract of behaviorContracts.values()) {
    for (const pointId of [...new Set(contract.formal_test_point_ids ?? [])].sort()) {
      const outcomeId = outcomeByPointId.get(pointId);
      if (!pointById.has(pointId) || !outcomeId) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Behavior provenance references an unknown formal Test Point.');
      edges.push({ from: contract.contract_id, to: outcomeId });
    }
  }
  const graphBase = {
    nodes: [...nodes.values()].sort((left, right) => left.node_id.localeCompare(right.node_id)),
    edges: [...new Map(edges.map((edge) => [`${edge.from}\0${edge.to}`, edge])).values()].sort((left, right) => `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`))
  };
  validateV5ProvenanceGraph(graphBase);
  return { ...graphBase, graph_digest: canonicalObjectDigest(graphBase) };
}

/**
 * Extend a verified semantic provenance graph with accepted Cases, Case
 * Oracles, the immutable Case Document, and deterministic rendered outputs.
 * @param {{graph:{nodes:Array<Record<string,any>>,edges:Array<Record<string,any>>},runId:string,caseDocumentLineageId:string,semanticRootDigest:string,cases:Array<Record<string,any>>,caseDocumentDigest:string,renderedOutputDigests:string[]}} input
 */
export function extendCaseProvenanceGraph(input) {
  validateV5ProvenanceGraph(input.graph);
  const nodes = new Map(input.graph.nodes.map((node) => [node.node_id, structuredClone(node)]));
  const edges = input.graph.edges.map((edge) => structuredClone(edge));
  const common = { run_id: input.runId, case_document_lineage_id: input.caseDocumentLineageId, semantic_root_digest: input.semanticRootDigest, accepted: true };
  for (const node of nodes.values()) {
    if (node.run_id !== input.runId || node.case_document_lineage_id !== input.caseDocumentLineageId || node.semantic_root_digest !== input.semanticRootDigest || node.accepted !== true) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Case provenance cannot extend a different run, lineage, or semantic root.');
  }
  const addNode = (/** @type {Record<string,any>} */ node) => {
    if (!node.node_id || nodes.has(node.node_id)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Case provenance identities must be nonblank and unique.');
    nodes.set(node.node_id, node);
  };
  for (const current of input.cases) {
    if (typeof current.case_id !== 'string' || nodes.get(current.primary_test_point_id)?.kind !== 'formal_test_point' || !Array.isArray(current.oracles) || current.oracles.length === 0) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Case provenance must resolve one formal Test Point and at least one Case Oracle.');
    addNode({ node_id: current.case_id, kind: 'case', ...common });
    edges.push({ from: current.primary_test_point_id, to: current.case_id });
    for (const oracle of current.oracles) {
      if (typeof oracle.oracle_id !== 'string' || nodes.get(oracle.oracle_semantic_contract_id)?.kind !== 'behavior_contract' || !Array.isArray(oracle.claim_ids) || oracle.claim_ids.length === 0) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Case Oracle provenance must resolve its accepted semantic contract and Claims.');
      addNode({ node_id: oracle.oracle_id, kind: 'case_oracle', ...common });
      edges.push({ from: oracle.oracle_semantic_contract_id, to: current.case_id }, { from: current.case_id, to: oracle.oracle_id });
      for (const claimId of [...new Set(oracle.claim_ids)].sort()) {
        if (nodes.get(claimId)?.kind !== 'claim') throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Case Oracle evidence must resolve an accepted Claim.');
        edges.push({ from: claimId, to: oracle.oracle_id });
      }
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/u.test(input.caseDocumentDigest)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Case Document provenance digest is invalid.');
  addNode({ node_id: input.caseDocumentDigest, kind: 'case_document', ...common, immutable_digest: input.caseDocumentDigest });
  for (const current of input.cases) edges.push({ from: current.case_id, to: input.caseDocumentDigest });
  for (const digest of [...new Set(input.renderedOutputDigests)].sort()) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(digest)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Rendered output provenance digest is invalid.');
    addNode({ node_id: digest, kind: 'rendered_output', ...common });
    edges.push({ from: input.caseDocumentDigest, to: digest, immutable_digest_ref: input.caseDocumentDigest });
  }
  const graphBase = {
    nodes: [...nodes.values()].sort((left, right) => left.node_id.localeCompare(right.node_id)),
    edges: [...new Map(edges.map((edge) => [`${edge.from}\0${edge.to}`, edge])).values()].sort((left, right) => `${left.from}\0${left.to}`.localeCompare(`${right.from}\0${right.to}`))
  };
  validateV5ProvenanceGraph(graphBase);
  return { ...graphBase, graph_digest: canonicalObjectDigest(graphBase) };
}

/** @param {Record<string, any>} condition @param {Record<string, any>} from @param {Record<string, any>} to @param {Record<string, any>} edge */
function conditionHolds(condition, from, to, edge) {
  if (condition.kind === 'same_run') return from.run_id === to.run_id;
  if (condition.kind === 'same_lineage') return from.case_document_lineage_id === to.case_document_lineage_id;
  if (condition.kind === 'current_semantic_root') return from.semantic_root_digest === to.semantic_root_digest;
  if (condition.kind === 'accepted_ancestor') return from.accepted === true && to.accepted === true;
  if (condition.kind === 'immutable_digest_ref') return typeof from.immutable_digest === 'string' && edge.immutable_digest_ref === from.immutable_digest;
  if (condition.kind === 'external_downstream_only') return to.external_downstream === true;
  if (condition.kind === 'evidence_level_in') return condition.levels.includes(from.evidence_level);
  return false;
}

/**
 * @param {{nodes:Array<Record<string,any>>,edges:Array<Record<string,any>>}} graph
 */
export function validateV5ProvenanceGraph(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new V5ProtocolError('SCHEMA_VALIDATION_FAILED', 'Provenance graph must contain nodes and edges.');
  const nodes = new Map();
  for (const node of graph.nodes) {
    if (!node || typeof node.node_id !== 'string' || typeof node.kind !== 'string' || nodes.has(node.node_id)) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Provenance nodes must have unique IDs.');
    nodes.set(node.node_id, node);
  }
  /** @type {Map<string, string[]>} */
  const adjacency = new Map(graph.nodes.map((node) => [node.node_id, []]));
  /** @type {Map<string, number>} */
  const indegree = new Map(graph.nodes.map((node) => [node.node_id, 0]));
  for (const edge of graph.edges) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', 'Provenance edge references an unknown node.');
    if (to.kind === 'source_unit' && downstreamKinds.has(from.kind)) throw new V5ProtocolError('DOWNSTREAM_ARTIFACT_AS_SOURCE', 'Downstream artifacts cannot re-enter Source.');
    const rule = edgeRules.get(`${from.kind}->${to.kind}`);
    if (!rule || !rule.conditions.every((/** @type {Record<string, any>} */ condition) => conditionHolds(condition, from, to, edge))) throw new V5ProtocolError('PROVENANCE_EDGE_NOT_ALLOWED', `Provenance edge ${from.kind}->${to.kind} is not allowed.`);
    adjacency.get(from.node_id)?.push(to.node_id);
    indegree.set(to.node_id, (indegree.get(to.node_id) ?? 0) + 1);
  }
  const queue = [...indegree.entries()].filter(([, count]) => count === 0).map(([nodeId]) => nodeId).sort();
  /** @type {string[]} */
  const topologicalOrder = [];
  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (nodeId === undefined) break;
    topologicalOrder.push(nodeId);
    for (const target of (adjacency.get(nodeId) ?? []).sort()) {
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) {
        queue.push(target);
        queue.sort();
      }
    }
  }
  if (topologicalOrder.length !== nodes.size) throw new V5ProtocolError('PROVENANCE_CYCLE', 'Provenance graph contains a cycle.');
  return { valid: true, topological_order: topologicalOrder };
}
