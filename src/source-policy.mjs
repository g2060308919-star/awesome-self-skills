import { stableId } from './canonical.mjs';
import { scopeContains, validateDecisionRecords } from './decision-record.mjs';

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function objectArray(value) {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @param {unknown} value @returns {string[]} */
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

/** @param {string} code @param {string} path @param {string} message */
function diagnostic(code, path, message) {
  return { category: 'reference', code, path, message };
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** @param {string} left @param {string} right @returns {string | null} */
function intersectScopes(left, right) {
  if (scopeContains(left, right)) return right.trim();
  if (scopeContains(right, left)) return left.trim();
  return null;
}

/** @param {Map<string, string[]>} graph */
function findCyclicRuleIds(graph) {
  const state = new Map();
  const cyclic = new Set();
  for (const start of graph.keys()) {
    if ((state.get(start) ?? 0) !== 0) continue;
    /** @type {Array<{id: string, next: number}>} */
    const stack = [{ id: start, next: 0 }];
    const pathPosition = new Map([[start, 0]]);
    state.set(start, 1);
    while (stack.length > 0) {
      const frame = /** @type {{id: string, next: number}} */ (stack.at(-1));
      const neighbors = graph.get(frame.id) ?? [];
      if (frame.next >= neighbors.length) {
        state.set(frame.id, 2);
        pathPosition.delete(frame.id);
        stack.pop();
        continue;
      }
      const next = neighbors[frame.next];
      frame.next += 1;
      const nextState = state.get(next) ?? 0;
      if (nextState === 0) {
        state.set(next, 1);
        pathPosition.set(next, stack.length);
        stack.push({ id: next, next: 0 });
      } else if (nextState === 1) {
        const cycleStart = pathPosition.get(next);
        if (cycleStart !== undefined) {
          for (let index = cycleStart; index < stack.length; index += 1) cyclic.add(stack[index].id);
        }
      }
    }
  }
  return cyclic;
}

/**
 * Build compact transitive reachability for the acyclic, usable rule graph.
 * @param {Map<string, string[]>} graph
 */
function buildReachability(graph) {
  const ids = [...graph.keys()].sort();
  const indexById = new Map(ids.map((id, index) => [id, index]));
  const indegree = new Uint32Array(ids.length);
  for (const neighbors of graph.values()) {
    for (const neighbor of neighbors) {
      const index = indexById.get(neighbor);
      if (index !== undefined) indegree[index] += 1;
    }
  }
  /** @type {string[]} */
  const ready = [];
  for (let index = 0; index < ids.length; index += 1) if (indegree[index] === 0) ready.push(ids[index]);
  /** @type {string[]} */
  const topological = [];
  for (let offset = 0; offset < ready.length; offset += 1) {
    const id = ready[offset];
    topological.push(id);
    for (const neighbor of graph.get(id) ?? []) {
      const index = /** @type {number} */ (indexById.get(neighbor));
      indegree[index] -= 1;
      if (indegree[index] === 0) ready.push(neighbor);
    }
  }
  const words = Math.ceil(ids.length / 32);
  const descendants = new Map(ids.map((id) => [id, new Uint32Array(words)]));
  for (let order = topological.length - 1; order >= 0; order -= 1) {
    const id = topological[order];
    const bits = /** @type {Uint32Array} */ (descendants.get(id));
    for (const neighbor of graph.get(id) ?? []) {
      const neighborIndex = /** @type {number} */ (indexById.get(neighbor));
      bits[neighborIndex >>> 5] |= 1 << (neighborIndex & 31);
      const neighborBits = /** @type {Uint32Array} */ (descendants.get(neighbor));
      for (let word = 0; word < words; word += 1) bits[word] |= neighborBits[word];
    }
  }
  return {
    /** @param {string} start @param {string} target */
    reaches(start, target) {
      const targetIndex = indexById.get(target);
      const bits = descendants.get(start);
      return targetIndex !== undefined && bits !== undefined
        && (bits[targetIndex >>> 5] & (1 << (targetIndex & 31))) !== 0;
    }
  };
}

/**
 * Resolve explicit source precedence without treating recency or source kind as authority.
 * Malformed rules are isolated instead of suppressing unrelated policy components.
 * @param {unknown} sourcePack
 */
export function resolveSourcePolicy(sourcePack) {
  const pack = isObject(sourcePack) ? sourcePack : {};
  const sources = objectArray(pack.sources);
  const sourceIds = new Set(sources.flatMap((source) => typeof source.source_id === 'string' ? [source.source_id] : []));
  const policy = isObject(pack.source_policy) ? pack.source_policy : {};
  const rules = objectArray(policy.rules);
  const ruleById = new Map(rules.flatMap((rule) => typeof rule.rule_id === 'string' ? [[rule.rule_id, rule]] : []));
  const invalidRuleIds = new Set();
  /** @type {Map<string, string[]>} */
  const declaredGraph = new Map();
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];

  rules.forEach((rule, ruleIndex) => {
    if (typeof rule.rule_id !== 'string') return;
    const supersedes = stringArray(rule.supersedes);
    declaredGraph.set(rule.rule_id, supersedes.filter((id) => ruleById.has(id)));
    stringArray(rule.source_ids).forEach((sourceId, sourceIndex) => {
      if (!sourceIds.has(sourceId)) {
        invalidRuleIds.add(/** @type {string} */ (rule.rule_id));
        diagnostics.push(diagnostic(
          'SOURCE_POLICY_SOURCE_DANGLING',
          `/source_policy/rules/${ruleIndex}/source_ids/${sourceIndex}`,
          `source policy references unknown source "${sourceId}"`
        ));
      }
    });
    supersedes.forEach((supersededId, edgeIndex) => {
      if (!ruleById.has(supersededId)) {
        diagnostics.push(diagnostic(
          'SOURCE_POLICY_SUPERSEDES_DANGLING',
          `/source_policy/rules/${ruleIndex}/supersedes/${edgeIndex}`,
          `source policy references unknown superseded rule "${supersededId}"`
        ));
      }
    });
  });

  const cyclicIds = findCyclicRuleIds(declaredGraph);
  if (cyclicIds.size > 0) diagnostics.push(diagnostic(
    'SOURCE_POLICY_CYCLE',
    '/source_policy/rules',
    `source policy supersedes graph contains a cycle: ${[...cyclicIds].sort().join(', ')}`
  ));
  for (const ruleId of cyclicIds) invalidRuleIds.add(ruleId);

  const activeRules = rules.filter((rule) => rule.status === 'effective'
    && typeof rule.rule_id === 'string' && typeof rule.scope === 'string'
    && !invalidRuleIds.has(rule.rule_id));
  const activeIds = new Set(activeRules.map((rule) => /** @type {string} */ (rule.rule_id)));
  const graph = new Map(activeRules.map((rule) => {
    const id = /** @type {string} */ (rule.rule_id);
    return [id, (declaredGraph.get(id) ?? []).filter((target) => activeIds.has(target))];
  }));
  const reachability = buildReachability(graph);
  const decisionValidation = validateDecisionRecords(pack);
  diagnostics.push(...decisionValidation.diagnostics);

  /** @type {Map<string, Set<string>>} */
  const precedenceExclusions = new Map();
  const fullySuperseded = new Set();
  for (const loser of activeRules) {
    const loserId = /** @type {string} */ (loser.rule_id);
    for (let winnerIndex = activeRules.length - 1; winnerIndex >= 0; winnerIndex -= 1) {
      const winner = activeRules[winnerIndex];
      const winnerId = /** @type {string} */ (winner.rule_id);
      if (winnerId === loserId || !reachability.reaches(winnerId, loserId)) continue;
      const scope = intersectScopes(/** @type {string} */ (winner.scope), /** @type {string} */ (loser.scope));
      if (scope !== null) {
        const exclusions = precedenceExclusions.get(loserId) ?? new Set();
        exclusions.add(scope);
        precedenceExclusions.set(loserId, exclusions);
        if (scopeContains(scope, /** @type {string} */ (loser.scope))) {
          fullySuperseded.add(loserId);
          break;
        }
      }
    }
  }

  /** @type {Array<{conflict_id: string, root_issue_id: string, scope: string, rule_ids: string[], source_ids: string[]}>} */
  const conflicts = [];
  /** @type {Map<string, string[]>} */
  const conflictExclusions = new Map();
  const conflictCandidates = activeRules.filter((rule) => !fullySuperseded.has(/** @type {string} */ (rule.rule_id)));
  for (let leftIndex = 0; leftIndex < conflictCandidates.length; leftIndex += 1) {
    const left = conflictCandidates[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < conflictCandidates.length; rightIndex += 1) {
      const right = conflictCandidates[rightIndex];
      const leftId = /** @type {string} */ (left.rule_id);
      const rightId = /** @type {string} */ (right.rule_id);
      const scope = intersectScopes(/** @type {string} */ (left.scope), /** @type {string} */ (right.scope));
      if (scope === null || reachability.reaches(leftId, rightId) || reachability.reaches(rightId, leftId)) continue;
      if ([...(precedenceExclusions.get(leftId) ?? [])].some((excluded) => scopeContains(excluded, scope))
        || [...(precedenceExclusions.get(rightId) ?? [])].some((excluded) => scopeContains(excluded, scope))) continue;
      const leftSources = stringArray(left.source_ids).sort();
      const rightSources = stringArray(right.source_ids).sort();
      if (JSON.stringify(leftSources) === JSON.stringify(rightSources)) continue;
      const ruleIds = [leftId, rightId].sort();
      const conflictingSourceIds = [...new Set([...leftSources, ...rightSources])].sort();
      const signature = { rule_ids: ruleIds, scope, source_ids: conflictingSourceIds };
      const rootIssueId = stableId('root', { missing_type: 'source-conflict', ...signature });
      const resolved = [...decisionValidation.validFinalDecisionIds].some((decisionId) => {
        const decision = decisionValidation.decisionsById.get(decisionId);
        return decision !== undefined
          && typeof decision.authority_scope === 'string' && scopeContains(decision.authority_scope, scope)
          && typeof decision.effective_scope === 'string' && scopeContains(decision.effective_scope, scope)
          && stringArray(decision.root_issue_ids).includes(rootIssueId);
      });
      if (resolved) {
        conflictExclusions.set(leftId, [...(conflictExclusions.get(leftId) ?? []), scope]);
        conflictExclusions.set(rightId, [...(conflictExclusions.get(rightId) ?? []), scope]);
      } else {
        conflicts.push({
          conflict_id: stableId('source_conflict', signature),
          root_issue_id: rootIssueId,
          scope,
          rule_ids: ruleIds,
          source_ids: conflictingSourceIds
        });
      }
    }
  }
  for (const conflict of conflicts) {
    for (const ruleId of conflict.rule_ids) {
      conflictExclusions.set(ruleId, [...(conflictExclusions.get(ruleId) ?? []), conflict.scope]);
    }
  }

  const effectiveRules = activeRules.flatMap((rule) => {
    const ruleId = /** @type {string} */ (rule.rule_id);
    const excludedScopes = [...new Set([
      ...(precedenceExclusions.get(ruleId) ?? []),
      ...(conflictExclusions.get(ruleId) ?? [])
    ])].sort();
    if (excludedScopes.some((scope) => scopeContains(scope, /** @type {string} */ (rule.scope)))) return [];
    return [{
      claim_id: ruleId,
      claim_form: 'source-policy',
      source_ids: stringArray(rule.source_ids).sort(),
      scope: /** @type {string} */ (rule.scope),
      authority: typeof rule.authority === 'string' ? rule.authority : '',
      excluded_scopes: excludedScopes
    }];
  });
  const effectiveDecisions = [...decisionValidation.validFinalDecisionIds].flatMap((decisionId) => {
    const decision = decisionValidation.decisionsById.get(decisionId);
    if (!decision || typeof decision.effective_scope !== 'string' || typeof decision.authority_scope !== 'string') return [];
    return [{
      claim_id: decisionId,
      claim_form: 'decision-record',
      source_ids: [],
      scope: decision.effective_scope,
      authority: decision.authority_scope
    }];
  });
  const effectiveClaims = [...effectiveRules, ...effectiveDecisions]
    .sort((left, right) => compareStrings(left.claim_id, right.claim_id));

  diagnostics.sort((left, right) => compareStrings(`${left.code}\0${left.path}`, `${right.code}\0${right.path}`));
  conflicts.sort((left, right) => compareStrings(left.conflict_id, right.conflict_id));
  return { effectiveClaims, conflicts, diagnostics };
}
