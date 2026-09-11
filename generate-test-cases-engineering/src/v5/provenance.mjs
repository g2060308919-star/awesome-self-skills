import { generateV5Contracts } from './registry-generator.mjs';
import { V5ProtocolError } from './errors.mjs';

const provenancePolicy = generateV5Contracts().policyRegistry.provenance_policy;
const edgeRules = new Map(provenancePolicy.allowed_edges.map((/** @type {Record<string, any>} */ row) => [`${row.from_kind}->${row.to_kind}`, row]));
const downstreamKinds = new Set(['behavior_contract', 'atomic_outcome', 'formal_test_point', 'case', 'case_oracle', 'case_document', 'execution_plan', 'execution_result', 'rendered_output']);

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
