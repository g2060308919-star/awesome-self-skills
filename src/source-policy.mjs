import { stableId } from './canonical.mjs';

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

/** @param {string} scope */
function normalizedScope(scope) {
  return scope.trim();
}

/** @param {string} container @param {string} candidate */
function scopeContains(container, candidate) {
  const left = normalizedScope(container);
  const right = normalizedScope(candidate);
  if (left === '*' || left === 'all') return true;
  if (left === right) return true;
  return right.startsWith(`${left}.`) || right.startsWith(`${left}/`);
}

/** @param {string} left @param {string} right @returns {string | null} */
function intersectScopes(left, right) {
  if (scopeContains(left, right)) return normalizedScope(right);
  if (scopeContains(right, left)) return normalizedScope(left);
  return null;
}

/** @param {Map<string, string[]>} graph @param {string} start @param {string} target */
function reaches(graph, start, target) {
  const pending = [start];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === target) return true;
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    pending.push(...(graph.get(current) ?? []));
  }
  return false;
}

/** @param {Map<string, string[]>} graph */
function cyclicRuleIds(graph) {
  const visiting = new Set();
  const visited = new Set();
  const cyclic = new Set();

  /** @param {string} ruleId @param {string[]} trail */
  function visit(ruleId, trail) {
    if (visiting.has(ruleId)) {
      const cycleStart = trail.indexOf(ruleId);
      for (const member of trail.slice(cycleStart)) cyclic.add(member);
      cyclic.add(ruleId);
      return;
    }
    if (visited.has(ruleId)) return;
    visiting.add(ruleId);
    for (const next of graph.get(ruleId) ?? []) visit(next, [...trail, ruleId]);
    visiting.delete(ruleId);
    visited.add(ruleId);
  }

  for (const ruleId of graph.keys()) visit(ruleId, []);
  return cyclic;
}

/** @param {Record<string, unknown>} decision @param {string} scope */
function isFinalDecisionForScope(decision, scope) {
  return decision.disposition === 'final'
    && decision.evidence_level === 'E3'
    && typeof decision.authority_scope === 'string'
    && decision.authority_scope.length > 0
    && typeof decision.effective_scope === 'string'
    && scopeContains(decision.authority_scope, scope)
    && scopeContains(decision.effective_scope, scope);
}

/**
 * Resolve explicit source precedence without treating recency or source kind as authority.
 * @param {unknown} sourcePack
 */
export function resolveSourcePolicy(sourcePack) {
  const pack = isObject(sourcePack) ? sourcePack : {};
  const sources = objectArray(pack.sources);
  const sourceIds = new Set(sources.flatMap((source) => typeof source.source_id === 'string' ? [source.source_id] : []));
  const policy = isObject(pack.source_policy) ? pack.source_policy : {};
  const rules = objectArray(policy.rules);
  const ruleById = new Map(rules.flatMap((rule) => typeof rule.rule_id === 'string' ? [[rule.rule_id, rule]] : []));
  const graph = new Map();
  /** @type {Array<{category: string, code: string, path: string, message: string}>} */
  const diagnostics = [];

  rules.forEach((rule, ruleIndex) => {
    if (typeof rule.rule_id !== 'string') return;
    const supersedes = stringArray(rule.supersedes);
    graph.set(rule.rule_id, supersedes);
    stringArray(rule.source_ids).forEach((sourceId, sourceIndex) => {
      if (!sourceIds.has(sourceId)) diagnostics.push(diagnostic(
        'SOURCE_POLICY_SOURCE_DANGLING',
        `/source_policy/rules/${ruleIndex}/source_ids/${sourceIndex}`,
        `source policy references unknown source "${sourceId}"`
      ));
    });
    supersedes.forEach((supersededId, edgeIndex) => {
      if (!ruleById.has(supersededId)) diagnostics.push(diagnostic(
        'SOURCE_POLICY_SUPERSEDES_DANGLING',
        `/source_policy/rules/${ruleIndex}/supersedes/${edgeIndex}`,
        `source policy references unknown superseded rule "${supersededId}"`
      ));
    });
  });

  const cyclicIds = cyclicRuleIds(graph);
  if (cyclicIds.size > 0) diagnostics.push(diagnostic(
    'SOURCE_POLICY_CYCLE',
    '/source_policy/rules',
    `source policy supersedes graph contains a cycle: ${[...cyclicIds].sort().join(', ')}`
  ));

  const decisions = objectArray(pack.decision_records);
  const locatorIds = new Set(objectArray(pack.locators).flatMap((locator) => typeof locator.locator_id === 'string' ? [locator.locator_id] : []));
  const validFinalDecisions = decisions.filter((decision, decisionIndex) => {
    if (decision.disposition !== 'final' || decision.evidence_level !== 'E3') return false;
    if (typeof decision.evidence_ref !== 'string' || !locatorIds.has(decision.evidence_ref)) {
      diagnostics.push(diagnostic(
        'DECISION_EVIDENCE_DANGLING',
        `/decision_records/${decisionIndex}/evidence_ref`,
        'final Decision Record must reference existing evidence'
      ));
      return false;
    }
    return true;
  });
  const graphInvalid = diagnostics.some((item) => item.code.startsWith('SOURCE_POLICY_'));
  const activeRules = !graphInvalid
    ? rules.filter((rule) => rule.status === 'effective' && typeof rule.rule_id === 'string' && typeof rule.scope === 'string')
    : [];
  /** @type {Array<{conflict_id: string, scope: string, rule_ids: string[], source_ids: string[]}>} */
  const conflicts = [];
  /** @type {Map<string, string[]>} */
  const decisionResolvedScopes = new Map();

  for (let leftIndex = 0; leftIndex < activeRules.length; leftIndex += 1) {
    const left = activeRules[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < activeRules.length; rightIndex += 1) {
      const right = activeRules[rightIndex];
      const leftId = /** @type {string} */ (left.rule_id);
      const rightId = /** @type {string} */ (right.rule_id);
      const scope = intersectScopes(/** @type {string} */ (left.scope), /** @type {string} */ (right.scope));
      if (scope === null || reaches(graph, leftId, rightId) || reaches(graph, rightId, leftId)) continue;
      const leftSources = stringArray(left.source_ids).sort();
      const rightSources = stringArray(right.source_ids).sort();
      if (JSON.stringify(leftSources) === JSON.stringify(rightSources)) continue;
      if (validFinalDecisions.some((decision) => isFinalDecisionForScope(decision, scope))) {
        decisionResolvedScopes.set(leftId, [...(decisionResolvedScopes.get(leftId) ?? []), scope]);
        decisionResolvedScopes.set(rightId, [...(decisionResolvedScopes.get(rightId) ?? []), scope]);
        continue;
      }
      const ruleIds = [leftId, rightId].sort();
      const conflictingSourceIds = [...new Set([...leftSources, ...rightSources])].sort();
      const signature = { rule_ids: ruleIds, scope, source_ids: conflictingSourceIds };
      conflicts.push({
        conflict_id: stableId('source_conflict', signature),
        scope,
        rule_ids: ruleIds,
        source_ids: conflictingSourceIds
      });
    }
  }

  /** @type {Map<string, string[]>} */
  const conflictScopes = new Map();
  for (const conflict of conflicts) {
    for (const ruleId of conflict.rule_ids) conflictScopes.set(ruleId, [...(conflictScopes.get(ruleId) ?? []), conflict.scope]);
  }
  const winningRules = activeRules.filter((rule) => {
    const ruleId = /** @type {string} */ (rule.rule_id);
    const excludedScopes = [...(conflictScopes.get(ruleId) ?? []), ...(decisionResolvedScopes.get(ruleId) ?? [])];
    if (excludedScopes.some((scope) => scope === rule.scope)) return false;
    return !activeRules.some((candidate) => candidate.rule_id !== ruleId
      && typeof candidate.rule_id === 'string'
      && reaches(graph, candidate.rule_id, ruleId)
      && typeof candidate.scope === 'string'
      && intersectScopes(candidate.scope, /** @type {string} */ (rule.scope)) !== null);
  });

  const effectiveClaims = [
    ...winningRules.map((rule) => ({
      claim_id: /** @type {string} */ (rule.rule_id),
      claim_form: 'source-policy',
      source_ids: stringArray(rule.source_ids).sort(),
      scope: /** @type {string} */ (rule.scope),
      authority: typeof rule.authority === 'string' ? rule.authority : '',
      excluded_scopes: [...new Set([
        ...(conflictScopes.get(/** @type {string} */ (rule.rule_id)) ?? []),
        ...(decisionResolvedScopes.get(/** @type {string} */ (rule.rule_id)) ?? [])
      ])].sort()
    })),
    ...validFinalDecisions.filter((decision) => typeof decision.effective_scope === 'string' && isFinalDecisionForScope(decision, decision.effective_scope))
      .map((decision) => ({
        claim_id: /** @type {string} */ (decision.decision_id),
        claim_form: 'decision-record',
        source_ids: [],
        scope: /** @type {string} */ (decision.effective_scope),
        authority: /** @type {string} */ (decision.authority_scope)
      }))
  ].sort((left, right) => left.claim_id < right.claim_id ? -1 : left.claim_id > right.claim_id ? 1 : 0);

  diagnostics.sort((left, right) => {
    const leftKey = `${left.code}\0${left.path}`;
    const rightKey = `${right.code}\0${right.path}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  conflicts.sort((left, right) => left.conflict_id < right.conflict_id ? -1 : left.conflict_id > right.conflict_id ? 1 : 0);
  return { effectiveClaims, conflicts, diagnostics };
}
