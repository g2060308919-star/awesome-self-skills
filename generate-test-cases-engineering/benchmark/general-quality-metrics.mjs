const TARGET_KEYS = Object.freeze([
  'target_id', 'acceptance_role', 'objective', 'baseline_covered'
]);
const CASE_KEYS = Object.freeze([
  'entry_id', 'artifact_kind', 'acceptance_role', 'target_ids', 'semantic_case_key',
  'source_supported', 'rule_correct', 'decidable', 'responsibility_fulfilled',
  'rule_correctness_regression', 'critical_gate_bypassed', 'unsupported_assertion_count'
]);
const NON_CASE_KEYS = Object.freeze(['entry_id', 'artifact_kind', 'target_ids']);
const ROLES = new Set(['primary_acceptance', 'dependency_contract', 'context_only']);
const FORMAL_ROLES = Object.freeze(['primary_acceptance', 'dependency_contract']);

/** @param {unknown} value @returns {value is Record<string,any>} */
function record(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {Record<string,any>} value @param {readonly string[]} expected */
function exactKeys(value, expected) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value === value.trim();
}

/** @param {unknown} value */
function stringSet(value) {
  return Array.isArray(value) && value.length > 0
    && value.every(text) && new Set(value).size === value.length;
}

/** @param {string} code */
function invalid(code) {
  throw new TypeError(`GENERAL_QUALITY_METRIC_INPUT_INVALID:${code}`);
}

/** @param {number} covered @param {number} required */
function coverage(covered, required) {
  return required === 0
    ? { status: 'not_applicable', covered_target_count: 0, required_target_count: 0, ratio: null }
    : { status: 'measured', covered_target_count: covered, required_target_count: required, ratio: covered / required };
}

/**
 * Evaluate generated Case responsibility against an independently adjudicated
 * target inventory. Gap and exploratory records remain visible context but can
 * never enter the numerator. The function is intentionally deterministic and
 * fail-closed; it does not infer product truth from titles or keywords.
 * @param {unknown} submitted
 */
export function evaluateIndependentTargets(submitted) {
  if (!record(submitted) || !exactKeys(submitted, ['requiredTargets', 'cases'])
    || !Array.isArray(submitted.requiredTargets) || !Array.isArray(submitted.cases)) {
    invalid('ROOT');
  }
  const input = /** @type {Record<string,any>} */ (submitted);

  const targetIds = new Set();
  /** @type {any[]} */
  const targets = input.requiredTargets.map((/** @type {any} */ target, /** @type {number} */ index) => {
    if (!record(target) || !exactKeys(target, TARGET_KEYS) || !text(target.target_id)
      || targetIds.has(target.target_id) || !ROLES.has(target.acceptance_role)
      || !text(target.objective) || typeof target.baseline_covered !== 'boolean') {
      invalid(`TARGET_${index}`);
    }
    targetIds.add(target.target_id);
    return structuredClone(target);
  }).sort((/** @type {any} */ left, /** @type {any} */ right) =>
    left.target_id.localeCompare(right.target_id));

  const entryIds = new Set();
  /** @type {any[]} */
  const formalCases = [];
  let semanticGapCount = 0;
  let exploratoryCount = 0;
  for (let index = 0; index < input.cases.length; index += 1) {
    const entry = input.cases[index];
    if (!record(entry) || !text(entry.entry_id) || entryIds.has(entry.entry_id)
      || !['case', 'semantic_gap', 'exploratory'].includes(entry.artifact_kind)
      || !stringSet(entry.target_ids)
      || entry.target_ids.some((/** @type {any} */ targetId) => !targetIds.has(targetId))) {
      invalid(`ENTRY_${index}`);
    }
    entryIds.add(entry.entry_id);
    if (entry.artifact_kind !== 'case') {
      if (!exactKeys(entry, NON_CASE_KEYS)) invalid(`ENTRY_${index}_SHAPE`);
      if (entry.artifact_kind === 'semantic_gap') semanticGapCount += 1;
      else exploratoryCount += 1;
      continue;
    }
    if (!exactKeys(entry, CASE_KEYS) || !ROLES.has(entry.acceptance_role)
      || !text(entry.semantic_case_key)
      || ['source_supported', 'rule_correct', 'decidable', 'responsibility_fulfilled',
        'rule_correctness_regression', 'critical_gate_bypassed']
        .some(key => typeof entry[key] !== 'boolean')
      || !Number.isSafeInteger(entry.unsupported_assertion_count)
      || entry.unsupported_assertion_count < 0) {
      invalid(`ENTRY_${index}_SHAPE`);
    }
    formalCases.push(structuredClone(entry));
  }

  const seenSemanticCases = new Set();
  let duplicateCaseCount = 0;
  for (const candidate of formalCases) {
    if (seenSemanticCases.has(candidate.semantic_case_key)) duplicateCaseCount += 1;
    else seenSemanticCases.add(candidate.semantic_case_key);
  }

  /** @type {any[]} */
  const targetResults = targets.map((/** @type {any} */ target) => {
    const eligible = FORMAL_ROLES.includes(target.acceptance_role);
    const candidates = formalCases.filter(candidate => candidate.target_ids.includes(target.target_id));
    const valid = candidates.filter(candidate => eligible
      && candidate.acceptance_role === target.acceptance_role
      && candidate.source_supported && candidate.rule_correct && candidate.decidable
      && candidate.responsibility_fulfilled);
    const failureReasons = [];
    if (eligible && candidates.length === 0) failureReasons.push('missing_case');
    if (candidates.some(candidate => candidate.acceptance_role !== target.acceptance_role)) {
      failureReasons.push('acceptance_role_mismatch');
    }
    if (candidates.some(candidate => !candidate.source_supported)) failureReasons.push('unsupported_source');
    if (candidates.some(candidate => !candidate.rule_correct)) failureReasons.push('rule_incorrect');
    if (candidates.some(candidate => !candidate.decidable)) failureReasons.push('undecidable');
    if (candidates.some(candidate => !candidate.responsibility_fulfilled)) {
      failureReasons.push('responsibility_unfulfilled');
    }
    return {
      target_id: target.target_id, acceptance_role: target.acceptance_role,
      eligible, covered: eligible && valid.length > 0,
      effective_case_ids: [...new Map(valid.map(candidate =>
        [candidate.semantic_case_key, candidate.entry_id])).values()].sort(),
      failure_reasons: failureReasons.sort()
    };
  });

  const formalResults = targetResults.filter(result => result.eligible);
  const totalCoverage = coverage(
    formalResults.filter((/** @type {any} */ result) => result.covered).length, formalResults.length
  );
  const byAcceptanceRole = Object.fromEntries(FORMAL_ROLES.map(role => {
    const lane = targetResults.filter((/** @type {any} */ result) => result.acceptance_role === role);
    return [role, coverage(lane.filter((/** @type {any} */ result) => result.covered).length, lane.length)];
  }));

  const hardFailures = [];
  for (const candidate of formalCases) {
    if (candidate.rule_correctness_regression) hardFailures.push({
      code: 'RULE_CORRECTNESS_REGRESSION', case_id: candidate.entry_id, target_id: null
    });
    if (!candidate.source_supported || candidate.unsupported_assertion_count > 0) hardFailures.push({
      code: 'UNSUPPORTED_ASSERTION', case_id: candidate.entry_id, target_id: null
    });
    if (candidate.critical_gate_bypassed) hardFailures.push({
      code: 'CRITICAL_GATE_BYPASS', case_id: candidate.entry_id, target_id: null
    });
  }
  for (const target of targets) {
    if (target.acceptance_role === 'context_only' || !target.baseline_covered) continue;
    const result = targetResults.find((/** @type {any} */ item) => item.target_id === target.target_id);
    if (!result?.covered) hardFailures.push({
      code: 'REQUIRED_SCENARIO_DELETION', case_id: null, target_id: target.target_id
    });
  }
  hardFailures.sort((left, right) =>
    `${left.code}\0${left.target_id ?? ''}\0${left.case_id ?? ''}`.localeCompare(
      `${right.code}\0${right.target_id ?? ''}\0${right.case_id ?? ''}`
    ));

  return {
    metric_version: '1.0.0',
    hard_failure_status: hardFailures.length ? 'fail' : 'pass',
    quality_gate_passed: hardFailures.length === 0,
    effective_required_target_coverage: totalCoverage,
    by_acceptance_role: byAcceptanceRole,
    counts: {
      formal_case_count: formalCases.length,
      unique_semantic_case_count: seenSemanticCases.size,
      duplicate_case_count: duplicateCaseCount,
      context_target_count: targets.filter((/** @type {any} */ target) =>
        target.acceptance_role === 'context_only').length,
      semantic_gap_count: semanticGapCount,
      exploratory_count: exploratoryCount,
      unsupported_case_count: formalCases.filter(candidate => !candidate.source_supported).length,
      rule_incorrect_case_count: formalCases.filter(candidate => !candidate.rule_correct).length,
      undecidable_case_count: formalCases.filter(candidate => !candidate.decidable).length,
      responsibility_gap_case_count:
        formalCases.filter(candidate => !candidate.responsibility_fulfilled).length
    },
    target_results: targetResults,
    hard_failures: hardFailures
  };
}
