const TARGET_SYSTEM = 'generate-test-cases';
const SYSTEMS = Object.freeze([
  'long-prompt', 'test-case-designer', 'technique-router', TARGET_SYSTEM
]);
const RISKS = Object.freeze(['critical', 'high', 'medium', 'low']);
const METRIC_NAMES = Object.freeze([
  'grounded_factual_support_precision', 'expert_critical_test_point_recall',
  'expert_overall_test_point_recall', 'grounded_no_material_rewrite_acceptance',
  'historical_defect_recall', 'test_point_signature_jaccard',
  'grounded_coverage_signature_jaccard', 'false_grounded_rate', 'false_blocked_rate'
]);
const CANDIDATE_DIGEST_FIELDS = Object.freeze([
  'compiler_sha256', 'schema_sha256', 'schema_manifest_sha256',
  'skill_sha256', 'bundle_sha256', 'benchmark_manifest_sha256'
]);

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

/** @param {any} metric */
function validConfidenceInterval(metric) {
  const interval = metric?.confidence_interval;
  return interval && ['wilson-95', 'normal-approximation-95'].includes(interval.method) &&
    Number.isFinite(interval.lower) && Number.isFinite(interval.upper) &&
    interval.lower >= 0 && interval.upper <= 1 && interval.lower <= interval.upper &&
    interval.lower <= metric.value + 1e-12 && interval.upper + 1e-12 >= metric.value;
}

/** @param {any} metric */
function validUnavailableMetric(metric) {
  return metric?.numerator === 0 && metric.denominator === 0 && metric.value === null &&
    hasExactKeys(metric.confidence_interval, ['method', 'lower', 'upper']) &&
    metric.confidence_interval.method === 'unavailable-zero-denominator' &&
    metric.confidence_interval.lower === null && metric.confidence_interval.upper === null;
}

/** @param {unknown} value @param {readonly string[]} keys */
function hasExactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

/** @param {any} metrics */
function candidateBindingValid(metrics) {
  const binding = metrics?.candidate_binding;
  return hasExactKeys(binding, [
    'final_candidate_sha', 'worktree_clean', ...CANDIDATE_DIGEST_FIELDS
  ]) && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u.test(binding.final_candidate_sha) &&
    binding.worktree_clean === true && CANDIDATE_DIGEST_FIELDS.every(
      (field) => /^[a-f0-9]{64}$/u.test(binding[field])
    );
}

/** @param {any} metrics @returns {{path:string, actual:unknown}|null} */
function metricReportProblem(metrics) {
  if (!hasExactKeys(metrics?.systems, SYSTEMS)) return {
    path: '/systems', actual: metrics?.systems
  };
  /** @type {string[] | null} */
  let expectedDomains = null;
  for (const system of SYSTEMS) {
    const report = metrics.systems[system];
    if (!report || typeof report !== 'object' || Array.isArray(report)) return {
      path: `/systems/${system}`, actual: report
    };
    const domains = Object.keys(report.by_domain ?? {}).sort();
    if (domains.length === 0 || (expectedDomains !== null &&
        JSON.stringify(domains) !== JSON.stringify(expectedDomains)) ||
        !hasExactKeys(report.by_risk, RISKS) ||
        !hasExactKeys(report.by_domain_and_risk, domains)) return {
      path: `/systems/${system}`, actual: report
    };
    expectedDomains = domains;
    const cohorts = [
      [`/systems/${system}/overall`, report.overall, false],
      ...domains.map((domain) => [`/systems/${system}/by_domain/${domain}`, report.by_domain[domain], false]),
      ...RISKS.map((risk) => [`/systems/${system}/by_risk/${risk}`, report.by_risk[risk], risk !== 'critical']),
      ...domains.flatMap((domain) => RISKS.map((risk) => [
        `/systems/${system}/by_domain_and_risk/${domain}/${risk}`,
        report.by_domain_and_risk[domain]?.[risk], risk !== 'critical'
      ]))
    ];
    for (const [cohortPath, cohort, criticalMetricMayBeUnavailable] of cohorts) {
      for (const metricName of METRIC_NAMES) {
        const metric = cohort?.[metricName];
        const nonApplicable = criticalMetricMayBeUnavailable &&
          metricName === 'expert_critical_test_point_recall' && validUnavailableMetric(metric);
        if (!nonApplicable && (!validUnitMetric(metric) || !validConfidenceInterval(metric))) return {
          path: `${cohortPath}/${metricName}`, actual: metric
        };
      }
    }
  }
  return null;
}

/**
 * Apply only the frozen release gates. Confidence intervals and mutation kills
 * remain visible evaluation signals and never replace point-estimate gates.
 * @param {any} metrics
 */
export function evaluateReleaseGates(metrics) {
  /** @type {any[]} */
  const decisiveFailures = [];
  for (const name of PROCESS_FAILURES) {
    const count = metrics?.process_failures?.[name];
    if (Number.isInteger(count) && count > 0) decisiveFailures.push(failure(
      'PROCESS_FAILURE', `/process_failures/${name}`, `${name} must be absent.`, count, 0
    ));
  }
  if (Number.isInteger(metrics?.unsupported_critical_high_grounded_oracle_count) &&
      metrics.unsupported_critical_high_grounded_oracle_count > 0) {
    decisiveFailures.push(failure(
      'UNSUPPORTED_CRITICAL_HIGH_GROUNDED_ORACLE', '/unsupported_critical_high_grounded_oracle_count',
      'Every critical/high Grounded Oracle must be expert-supported.',
      metrics.unsupported_critical_high_grounded_oracle_count, 0
    ));
  }
  if (!metrics || metrics.completeness?.status !== 'complete') {
    const incomplete = failure(
      'BENCHMARK_EVIDENCE_INCOMPLETE', '/completeness',
      'Required corpus, labels, adjudications, runs, strata, or metric denominators are incomplete.',
      metrics?.completeness?.issues ?? []
    );
    return {
      status: decisiveFailures.length > 0 ? 'fail' : 'insufficient_evidence',
      failures: [...decisiveFailures, incomplete]
    };
  }

  /** @param {any} evidenceFailure */
  const failClosedEvidence = (evidenceFailure) => ({
    status: decisiveFailures.length > 0 ? 'fail' : 'insufficient_evidence',
    failures: [...decisiveFailures, evidenceFailure]
  });

  if (!candidateBindingValid(metrics)) return failClosedEvidence(failure(
      'CANDIDATE_BINDING_INVALID', '/candidate_binding',
      'A benchmark pass requires a clean runtime binding to the candidate and every frozen artifact digest.',
      metrics?.candidate_binding
  ));

  const target = metrics.systems?.[TARGET_SYSTEM];
  if (!target?.overall) {
    return failClosedEvidence(failure(
      'TARGET_SYSTEM_METRICS_MISSING', `/systems/${TARGET_SYSTEM}`,
      'Target-system metrics are unavailable.'
    ));
  }

  const domainReports = Object.entries(target.by_domain ?? {});
  if (domainReports.length === 0 || domainReports.some(([, report]) => {
    const metric = /** @type {any} */ (report).historical_defect_recall;
    return !validUnitMetric(metric);
  })) {
    return failClosedEvidence(failure(
        'DOMAIN_METRICS_MISSING', `/systems/${TARGET_SYSTEM}/by_domain`,
        'Every benchmark domain requires a non-zero historical-defect report.'
    ));
  }

  const reportProblem = metricReportProblem(metrics);
  if (reportProblem) return failClosedEvidence(failure(
      'METRIC_REPORT_INCOMPLETE', reportProblem.path,
      'Every numeric metric requires a valid confidence interval in every system, domain, risk, and domain-by-risk slice.',
      reportProblem.actual
  ));

  /** @type {any[]} */
  const failures = [...decisiveFailures];

  const invalidOverallMetric = Object.keys(METRIC_GATES).find((name) => !validUnitMetric(target.overall[name]));
  const invalidCount = !Number.isInteger(metrics.unsupported_critical_high_grounded_oracle_count) ||
    metrics.unsupported_critical_high_grounded_oracle_count < 0 || PROCESS_FAILURES.some((name) =>
    !Number.isInteger(metrics.process_failures?.[name]) || metrics.process_failures[name] < 0);
  if (invalidOverallMetric || invalidCount) {
    return failClosedEvidence(failure(
        'RELEASE_METRIC_EVIDENCE_INVALID', invalidOverallMetric ? `/systems/${TARGET_SYSTEM}/overall/${invalidOverallMetric}` : '/process_failures',
        'Release metrics and process counts must be finite, internally consistent evidence.',
        invalidOverallMetric ? target.overall[invalidOverallMetric] : metrics.process_failures
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

  return { status: failures.length === 0 ? 'pass' : 'fail', failures };
}
