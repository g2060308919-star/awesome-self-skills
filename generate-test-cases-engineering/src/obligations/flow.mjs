import {
  assertViewType, buildObligationSeed, claimsByIdFrom, compareCodePoints,
  finishObligationSeeds, isObject, objectArray, sortedStrings
} from './registry.mjs';

/** @param {Record<string, unknown>} node */
function nodeIdentity(node) {
  return {
    kind: 'flow-node',
    element_id: node.element_id,
    node_type: node.node_type,
    label: node.label
  };
}

/** @param {Record<string, unknown>} edge @param {Record<string, unknown>} from @param {Record<string, unknown>} to */
function edgeIdentity(edge, from, to) {
  return {
    kind: 'flow-edge',
    from: nodeIdentity(from),
    to: nodeIdentity(to),
    condition: edge.condition,
    result: edge.result
  };
}

/** @param {Map<string, string[]>} graph @param {string[]} nodes */
function finishOrder(graph, nodes) {
  const visited = new Set();
  /** @type {string[]} */
  const finished = [];
  for (const start of nodes) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack = [{ node: start, next: 0, neighbors: graph.get(start) ?? [] }];
    while (stack.length > 0) {
      const frame = /** @type {{node: string, next: number, neighbors: string[]}} */ (stack.at(-1));
      if (frame.next >= frame.neighbors.length) {
        finished.push(frame.node);
        stack.pop();
        continue;
      }
      const neighbor = frame.neighbors[frame.next];
      frame.next += 1;
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      stack.push({ node: neighbor, next: 0, neighbors: graph.get(neighbor) ?? [] });
    }
  }
  return finished;
}

/** @param {Record<string, unknown>[]} nodes @param {Record<string, unknown>[]} edges */
function loopEdgeIds(nodes, edges) {
  const nodeIds = nodes.flatMap((node) => typeof node.element_id === 'string' ? [node.element_id] : []).sort(compareCodePoints);
  const graph = new Map(nodeIds.map((nodeId) => [nodeId, /** @type {string[]} */ ([])]));
  const reverse = new Map(nodeIds.map((nodeId) => [nodeId, /** @type {string[]} */ ([])]));
  for (const edge of edges) {
    const from = String(edge.from_element_id);
    const to = String(edge.to_element_id);
    graph.get(from)?.push(to);
    reverse.get(to)?.push(from);
  }
  for (const neighbors of [...graph.values(), ...reverse.values()]) neighbors.sort(compareCodePoints);
  const order = finishOrder(graph, nodeIds);
  const componentByNode = new Map();
  const componentSizes = new Map();
  let component = 0;
  for (const start of order.reverse()) {
    if (componentByNode.has(start)) continue;
    let size = 0;
    const pending = [start];
    componentByNode.set(start, component);
    while (pending.length > 0) {
      const current = /** @type {string} */ (pending.pop());
      size += 1;
      for (const neighbor of reverse.get(current) ?? []) {
        if (componentByNode.has(neighbor)) continue;
        componentByNode.set(neighbor, component);
        pending.push(neighbor);
      }
    }
    componentSizes.set(component, size);
    component += 1;
  }
  return new Set(edges.flatMap((edge) => {
    const from = String(edge.from_element_id);
    const to = String(edge.to_element_id);
    const sourceComponent = componentByNode.get(from);
    const inCycle = sourceComponent !== undefined && sourceComponent === componentByNode.get(to)
      && (from === to || (componentSizes.get(sourceComponent) ?? 0) > 1);
    return inCycle && typeof edge.element_id === 'string' ? [edge.element_id] : [];
  }));
}

/** @param {unknown} context @param {string} elementId */
function declaredMaximum(context, elementId) {
  if (!isObject(context)) return null;
  const definitions = context.loopMaximumsByElementId;
  const definition = definitions instanceof Map ? definitions.get(elementId)
    : isObject(definitions) ? definitions[elementId] : undefined;
  if (!isObject(definition) || !Number.isInteger(definition.maximum) || Number(definition.maximum) <= 1) return null;
  const sourceClaimIds = sortedStrings(definition.source_claim_ids, true);
  const claimsById = claimsByIdFrom(context);
  if (sourceClaimIds.length === 0 || sourceClaimIds.some((claimId) => !claimsById.has(claimId))) return null;
  return { maximum: Number(definition.maximum), sourceClaimIds };
}

/**
 * Compile explicit Flow responsibilities without enumerating paths or inventing outcomes.
 * Loop IDs retain the otherwise-unrepresentable iteration responsibility in their semantic signature.
 * @param {Record<string, unknown>} view
 * @param {unknown} context
 */
export function compile(view, context) {
  assertViewType(view, 'flow');
  const elements = objectArray(view.elements);
  const nodes = elements.filter((element) => element.kind === 'flow-node');
  const edges = elements.filter((element) => element.kind === 'flow-edge');
  const nodesById = new Map(nodes.map((node) => [node.element_id, node]));
  const loopIds = loopEdgeIds(nodes, edges);
  /** @type {import('./registry.mjs').ObligationSeed[]} */
  const seeds = [];

  for (const edge of edges) {
    const edgeId = String(edge.element_id);
    const from = nodesById.get(edge.from_element_id);
    const to = nodesById.get(edge.to_element_id);
    if (!from || !to) throw new TypeError(`flow edge "${edgeId}" is not from a validated view`);
    const semanticEdge = edgeIdentity(edge, from, to);
    if (!loopIds.has(edgeId)) {
      seeds.push(buildObligationSeed({
        view, primaryElement: edge, supportingElements: [edge, from, to], context,
        identity: { kind: 'flow', responsibility: 'edge', scope: view.scope, edge: semanticEdge }
      }));
      continue;
    }
    const maximum = declaredMaximum(context, edgeId);
    const iterations = [
      { value: 0, maximumClaimIds: /** @type {string[]} */ ([]) },
      { value: 1, maximumClaimIds: /** @type {string[]} */ ([]) },
      ...(maximum ? [{ value: maximum.maximum, maximumClaimIds: maximum.sourceClaimIds }] : [])
    ];
    for (const iteration of iterations) seeds.push(buildObligationSeed({
      view, primaryElement: edge, supportingElements: [edge, from, to], context,
      extraSourceClaimIds: iteration.maximumClaimIds,
      identity: {
        kind: 'flow', responsibility: 'loop-iterations', scope: view.scope,
        iterations: iteration.value, edge: semanticEdge
      }
    }));
  }

  for (const node of nodes) {
    if (node.node_type !== 'end' && node.node_type !== 'exception') continue;
    seeds.push(buildObligationSeed({
      view, primaryElement: node, supportingElements: [node], context,
      identity: {
        kind: 'flow', responsibility: node.node_type === 'end' ? 'terminal' : 'exception',
        scope: view.scope, node: nodeIdentity(node)
      }
    }));
  }
  return finishObligationSeeds(seeds, 'flow');
}
