import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateReleaseGates } from '../../benchmark/gates.mjs';

const SYSTEMS = Object.freeze([
  'long-prompt', 'test-case-designer', 'technique-router', 'generate-test-cases'
]);
const RISKS = Object.freeze(['critical', 'high', 'medium', 'low']);

/** @param {number} value */
function metric(value) {
  return { numerator: value * 100, denominator: 100, value, confidence_interval: { method: 'wilson-95', lower: value, upper: value } };
}

/** @returns {any} */
function metrics() {
  return {
    grounded_factual_support_precision: metric(0.98),
    expert_critical_test_point_recall: metric(1),
    expert_overall_test_point_recall: metric(0.9),
    grounded_no_material_rewrite_acceptance: metric(0.85),
    historical_defect_recall: metric(0.8),
    test_point_signature_jaccard: metric(0.9),
    grounded_coverage_signature_jaccard: metric(0.85),
    false_grounded_rate: metric(0.02), false_blocked_rate: metric(0.03)
  };
}

/** @returns {any} */
function systemReport() {
  return {
    overall: metrics(),
    by_domain: { payments: metrics() },
    by_risk: Object.fromEntries(RISKS.map((risk) => [risk, metrics()])),
    by_domain_and_risk: {
      payments: Object.fromEntries(RISKS.map((risk) => [risk, metrics()]))
    }
  };
}

/** @returns {any} */
function passingReport() {
  return {
    completeness: { status: 'complete', issues: [] },
    candidate_binding: {
      final_candidate_sha: 'a'.repeat(40), worktree_clean: true,
      compiler_sha256: 'b'.repeat(64), schema_sha256: 'c'.repeat(64),
      schema_manifest_sha256: 'd'.repeat(64), skill_sha256: 'e'.repeat(64),
      bundle_sha256: 'f'.repeat(64), benchmark_manifest_sha256: '0'.repeat(64)
    },
    unsupported_critical_high_grounded_oracle_count: 0,
    systems: Object.fromEntries(SYSTEMS.map((system) => [system, systemReport()])),
    process_failures: {
      silent_formal_test_point_loss: 0, fixed_round_clarification_stop: 0,
      auto_repeat_unknown_or_deferred: 0, old_revision_recovery: 0
    },
    mutation_kill_signal: { release_gate: false, overall: metric(0) }
  };
}

test('benchmark release gates pass only at every frozen threshold with complete evidence', () => {
  assert.deepEqual(evaluateReleaseGates(passingReport()), { status: 'pass', failures: [] });

  const insufficient = passingReport();
  insufficient.completeness = { status: 'insufficient_evidence', issues: [{ code: 'CAPTURE_RUN_MISSING' }] };
  const result = evaluateReleaseGates(insufficient);
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.failures[0].code, 'BENCHMARK_EVIDENCE_INCOMPLETE');
});

test('benchmark release gates fail each metric independently and cannot average away a weak domain', () => {
  /** @type {Array<[string, number]>} */
  const reversals = [
    ['grounded_factual_support_precision', 0.979],
    ['expert_critical_test_point_recall', 0.999],
    ['expert_overall_test_point_recall', 0.899],
    ['grounded_no_material_rewrite_acceptance', 0.849],
    ['test_point_signature_jaccard', 0.899],
    ['grounded_coverage_signature_jaccard', 0.849]
  ];
  for (const [name, value] of reversals) {
    const report = passingReport();
    report.systems['generate-test-cases'].overall[name] = metric(value);
    assert.equal(evaluateReleaseGates(report).status, 'fail', name);
  }
  const domain = passingReport();
  domain.systems['generate-test-cases'].by_domain.payments.historical_defect_recall = metric(0.799);
  assert.equal(evaluateReleaseGates(domain).failures.some((failure) => failure.code === 'HISTORICAL_DEFECT_RECALL_BELOW_GATE'), true);

  const oracle = passingReport();
  oracle.unsupported_critical_high_grounded_oracle_count = 1;
  assert.equal(evaluateReleaseGates(oracle).failures.some((failure) => failure.code === 'UNSUPPORTED_CRITICAL_HIGH_GROUNDED_ORACLE'), true);
});

test('benchmark exact process failures are hard gates while mutation signal and confidence intervals are not', () => {
  for (const name of [
    'silent_formal_test_point_loss', 'fixed_round_clarification_stop',
    'auto_repeat_unknown_or_deferred', 'old_revision_recovery'
  ]) {
    const report = passingReport();
    report.process_failures[name] = 1;
    const result = evaluateReleaseGates(report);
    assert.equal(result.status, 'fail', name);
    assert.equal(result.failures.some((failure) => failure.code === 'PROCESS_FAILURE'), true);
  }

  const diagnosticOnly = passingReport();
  diagnosticOnly.mutation_kill_signal.overall = metric(0);
  diagnosticOnly.systems['generate-test-cases'].overall.grounded_factual_support_precision.confidence_interval = {
    method: 'wilson-95', lower: 0, upper: 1
  };
  assert.equal(evaluateReleaseGates(diagnosticOnly).status, 'pass');
});

test('benchmark gate treats a missing domain defect report as insufficient evidence', () => {
  const report = passingReport();
  report.systems['generate-test-cases'].by_domain = {};
  const result = evaluateReleaseGates(report);
  assert.equal(result.status, 'insufficient_evidence');
  assert.equal(result.failures[0].code, 'DOMAIN_METRICS_MISSING');
});

test('benchmark release gates fail closed for non-finite or internally inconsistent metric evidence', () => {
  for (const invalidValue of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    const report = passingReport();
    report.systems['generate-test-cases'].overall.grounded_factual_support_precision.value = invalidValue;
    assert.equal(evaluateReleaseGates(report).status, 'insufficient_evidence');
  }

  const inconsistent = passingReport();
  inconsistent.systems['generate-test-cases'].overall.expert_overall_test_point_recall = {
    ...metric(0.9), numerator: 1, denominator: 2
  };
  assert.equal(evaluateReleaseGates(inconsistent).status, 'insufficient_evidence');

  const invalidDomain = passingReport();
  invalidDomain.systems['generate-test-cases'].by_domain.payments.historical_defect_recall.value = Number.NaN;
  assert.equal(evaluateReleaseGates(invalidDomain).status, 'insufficient_evidence');
});

test('benchmark release gate requires a clean runtime binding to the candidate and every frozen artifact digest', () => {
  for (const field of [
    'final_candidate_sha', 'compiler_sha256', 'schema_sha256',
    'schema_manifest_sha256', 'skill_sha256', 'bundle_sha256',
    'benchmark_manifest_sha256'
  ]) {
    const report = passingReport();
    delete report.candidate_binding[field];
    assert.equal(evaluateReleaseGates(report).status, 'insufficient_evidence', field);
  }
  const dirty = passingReport();
  dirty.candidate_binding.worktree_clean = false;
  assert.equal(evaluateReleaseGates(dirty).status, 'insufficient_evidence');
});

test('benchmark release gate requires every metric and confidence interval in all system domain and risk slices', () => {
  const noInterval = passingReport();
  delete noInterval.systems['generate-test-cases'].overall.false_blocked_rate.confidence_interval;
  assert.equal(evaluateReleaseGates(noInterval).status, 'insufficient_evidence');

  const noRisk = passingReport();
  delete noRisk.systems['generate-test-cases'].by_risk.low;
  assert.equal(evaluateReleaseGates(noRisk).status, 'insufficient_evidence');

  const noDomainRiskMetric = passingReport();
  delete noDomainRiskMetric.systems['long-prompt'].by_domain_and_risk.payments.high.historical_defect_recall;
  assert.equal(evaluateReleaseGates(noDomainRiskMetric).status, 'insufficient_evidence');

  const mismatchedDomains = passingReport();
  mismatchedDomains.systems['long-prompt'].by_domain = { identity: metrics() };
  mismatchedDomains.systems['long-prompt'].by_domain_and_risk = {
    identity: Object.fromEntries(RISKS.map((risk) => [risk, metrics()]))
  };
  assert.equal(evaluateReleaseGates(mismatchedDomains).status, 'insufficient_evidence');
});

test('an observed categorical hard failure outranks otherwise incomplete benchmark evidence', () => {
  const report = passingReport();
  report.completeness = {
    status: 'insufficient_evidence', issues: [{ code: 'CAPTURE_RUN_MISSING' }]
  };
  report.process_failures.silent_formal_test_point_loss = 1;
  const result = evaluateReleaseGates(report);
  assert.equal(result.status, 'fail');
  assert.equal(result.failures.some((failure) => failure.code === 'PROCESS_FAILURE'), true);
  assert.equal(result.failures.some(
    (failure) => failure.code === 'BENCHMARK_EVIDENCE_INCOMPLETE'
  ), true);

  const completeButUnbound = passingReport();
  completeButUnbound.process_failures.silent_formal_test_point_loss = 1;
  completeButUnbound.candidate_binding = null;
  const unboundResult = evaluateReleaseGates(completeButUnbound);
  assert.equal(unboundResult.status, 'fail');
  assert.equal(unboundResult.failures.some(
    (failure) => failure.code === 'PROCESS_FAILURE'
  ), true);
  assert.equal(unboundResult.failures.some(
    (failure) => failure.code === 'CANDIDATE_BINDING_INVALID'
  ), true);
});

test('a confirmed unsupported critical or high Grounded Oracle outranks incomplete benchmark evidence', () => {
  const report = passingReport();
  report.completeness = {
    status: 'insufficient_evidence', issues: [{ code: 'CAPTURE_RUN_MISSING' }]
  };
  report.unsupported_critical_high_grounded_oracle_count = 1;
  const result = evaluateReleaseGates(report);
  assert.equal(result.status, 'fail');
  assert.equal(result.failures.some(
    (failure) => failure.code === 'UNSUPPORTED_CRITICAL_HIGH_GROUNDED_ORACLE'
  ), true);
  assert.equal(result.failures.some(
    (failure) => failure.code === 'BENCHMARK_EVIDENCE_INCOMPLETE'
  ), true);
});
