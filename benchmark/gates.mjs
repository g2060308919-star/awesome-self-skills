const TARGET_SYSTEM = 'generate-test-cases';

const METRIC_GATES = Object.freeze({
  grounded_factual_support_precision: 0.98,
  expert_critical_test_point_recall: 1,
  expert_overall_test_point_recall: 0.90,
  grounded_no_material_rewrite_acceptance: 0.85,
  test_point_signature_jaccard: 0.90,
  grounded_coverage_signature_jaccard: 0.85
});

const PROCESS_FAILURES = Object.freeze([
  'silent_formal_test_point_loss',
  'fixed_round_clarification_stop',
  'auto_repeat_unknown_or_deferred',
  'old_revision_recovery'
]);

/** @param {string} code @param {string} path @param {string} message @param {unknown} [actual] @param {unknown} [required] */
function failure(code, path, message, actual, required) {
  return { code, path, message, ...(actual === undefined ? {} : { actual }), ...(required === undefined ? {} : { required }) };
}

/** @param {any} metric */
function validUnitMetric(metric) {
  if (!metric || !Number.isFinite(metric.numerator) || !Number.isFinite(metric.denominator) ||
      !Number.isFinite(metric.value) || metric.denominator <= 0 || metric.numerator < 0 ||
      metric.numerator > metric.denominator || metric.value < 0 || metric.value > 1) return false;
  return Math.abs(metric.value - (metric.numerator / metric.denominator)) <= 1e-12;
}

/**
 * Apply only the frozen release gates. Confidence intervals and mutation kills
 * remain visible evaluation signals and never replace point-estimate gates.
 * @param {any} metrics
 */
export function evaluateReleaseGates(metrics) {
  if (!metrics || metrics.completeness?.status !== 'complete') {
    return {
      status: 'insufficient_evidence',
      failures: [failure(
        'BENCHMARK_EVIDENCE_INCOMPLETE', '/completeness',
        'Required corpus, labels, adjudications, runs, strata, or metric denominators are incomplete.',
        metrics?.completeness?.issues ?? []
      )]
    };
  }

  /** @type {any[]} */
  const failures = [];
  const target = metrics.systems?.[TARGET_SYSTEM];
  if (!target?.overall) {
    return {
      status: 'insufficient_evidence',
      failures: [failure('TARGET_SYSTEM_METRICS_MISSING', `/systems/${TARGET_SYSTEM}`, 'Target-system metrics are unavailable.')]
    };
  }

  const domainReports = Object.entries(target.by_domain ?? {});
  if (domainReports.length === 0 || domainReports.some(([, report]) => {
    const metric = /** @type {any} */ (report).historical_defect_recall;
    return !validUnitMetric(metric);
  })) {
    return {
      status: 'insufficient_evidence',
      failures: [failure(
        'DOMAIN_METRICS_MISSING', `/systems/${TARGET_SYSTEM}/by_domain`,
        'Every benchmark domain requires a non-zero historical-defect report.'
      )]
    };
  }

  const invalidOverallMetric = Object.keys(METRIC_GATES).find((name) => !validUnitMetric(target.overall[name]));
  const invalidCount = !Number.isInteger(metrics.unsupported_critical_high_grounded_oracle_count) ||
    metrics.unsupported_critical_high_grounded_oracle_count < 0 || PROCESS_FAILURES.some((name) =>
    !Number.isInteger(metrics.process_failures?.[name]) || metrics.process_failures[name] < 0);
  if (invalidOverallMetric || invalidCount) {
    return {
      status: 'insufficient_evidence',
      failures: [failure(
        'RELEASE_METRIC_EVIDENCE_INVALID', invalidOverallMetric ? `/systems/${TARGET_SYSTEM}/overall/${invalidOverallMetric}` : '/process_failures',
        'Release metrics and process counts must be finite, internally consistent evidence.',
        invalidOverallMetric ? target.overall[invalidOverallMetric] : metrics.process_failures
      )]
    };
  }

  if (metrics.unsupported_critical_high_grounded_oracle_count !== 0) {
    failures.push(failure(
      'UNSUPPORTED_CRITICAL_HIGH_GROUNDED_ORACLE', '/unsupported_critical_high_grounded_oracle_count',
      'Every critical/high Grounded Oracle must be expert-supported.',
      metrics.unsupported_critical_high_grounded_oracle_count, 0
    ));
  }

  for (const [name, threshold] of Object.entries(METRIC_GATES)) {
    const value = target.overall[name]?.value;
    if (value < threshold) failures.push(failure(
      'METRIC_BELOW_GATE', `/systems/${TARGET_SYSTEM}/overall/${name}`,
      `${name} is below its frozen release threshold.`, value ?? null, threshold
    ));
  }

  for (const [domain, report] of domainReports) {
    const value = /** @type {any} */ (report).historical_defect_recall?.value;
    if (value < 0.80) failures.push(failure(
      'HISTORICAL_DEFECT_RECALL_BELOW_GATE', `/systems/${TARGET_SYSTEM}/by_domain/${domain}/historical_defect_recall`,
      'Historical defect recall must meet the gate in every domain.', value ?? null, 0.80
    ));
  }

  for (const name of PROCESS_FAILURES) {
    const count = metrics.process_failures?.[name];
    if (typeof count !== 'number' || count !== 0) failures.push(failure(
      'PROCESS_FAILURE', `/process_failures/${name}`, `${name} must be absent.`, count ?? null, 0
    ));
  }

  return { status: failures.length === 0 ? 'pass' : 'fail', failures };
}
