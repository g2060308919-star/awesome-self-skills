import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BENCHMARK_STRATA,
  BENCHMARK_SYSTEMS,
  loadBenchmarkInputs,
  scoreBenchmark
} from '../../benchmark/score.mjs';
import { validateAgainstSchema } from '../../src/schema-validator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const symlink = fsPromises.symlink;
const link = fsPromises.link;

/** @param {string} key @param {unknown} value */
function label(key, value) {
  return { label_key: key, value };
}

/** @param {any[]} labels @param {any[]} [second] @param {any[]} [adjudications] */
function labeledAsset(labels, second = labels, adjudications = []) {
  return {
    label_version: '1.0.0', correction_of: null, final_labels: labels,
    expert_annotations: [
      { expert_id: 'expert-a', complete: true, labels },
      { expert_id: 'expert-b', complete: true, labels: second }
    ],
    adjudications
  };
}

/** @param {any} asset @param {string} labelVersion */
function retainedLabelSnapshot(asset, labelVersion) {
  const payload = {
    label_version: labelVersion,
    correction_of: null,
    final_labels: structuredClone(asset.final_labels),
    expert_annotations: structuredClone(asset.expert_annotations),
    adjudications: structuredClone(asset.adjudications)
  };
  return { ...payload, digest: createHash('sha256').update(JSON.stringify(payload)).digest('hex') };
}

/** @param {any} output */
function outputDigest(output) {
  return createHash('sha256').update(JSON.stringify(output)).digest('hex');
}

/** @param {any} run */
function rebindOutput(run) {
  run._extraction.capture_id = run.capture_id;
  run._extraction.raw_output_digest = run.raw_output_digest;
  run._extraction.output = structuredClone(run.output);
  run.extraction_digest = outputDigest(run._extraction);
  run._extraction_digest = run.extraction_digest;
}

/** @param {any} report @param {string} code */
function hasIssue(report, code) {
  return report.completeness.issues.some((/** @type {any} */ item) => item.code === code);
}

/** @param {string} benchmarkVersion */
function expectedProvenance(benchmarkVersion) {
  return Object.fromEntries(BENCHMARK_SYSTEMS.map((system) => [system, {
    skill_version: system === 'generate-test-cases' ? 'skill-v1' : 'not-applicable',
    compiler_version: system === 'generate-test-cases' ? 'compiler-v1' : 'not-applicable',
    schema_version: '1.0.0', model_id: `${system}-model`, prompt_or_reference_id: `${system}-reference`,
    baseline_version: 'baseline-v1', benchmark_version: benchmarkVersion
  }]));
}

/** @param {string} caseId @param {string} domain @param {string} stratum @param {any[]} obligations @param {any[]} assertions @param {any[]} acceptedCases @param {any[]} defects */
function benchmarkCase(caseId, domain, stratum, obligations, assertions, acceptedCases, defects) {
  return {
    case_id: caseId, domain, stratum, risk: 'high', high_risk: true,
    label_lineage_anchors: { expert_obligations: [], supported_assertions: [], accepted_cases: [] },
    assets: {
      task: { case_id: caseId, scope: caseId, source_paths: ['sources/prd.md'], clarification_required: caseId === 'payment' },
      task_digest: `task-digest-${caseId}`,
      sources: { files: ['sources/prd.md'], digest: `source-digest-${caseId}`, content_digest: `source-content-digest-${caseId}` },
      expert_obligations: labeledAsset(obligations),
      supported_assertions: labeledAsset(assertions),
      accepted_cases: labeledAsset(acceptedCases),
      historical_defects: { defects },
      clarification_scenarios: { scenarios: caseId === 'payment' ? [{ scenario_id: 'clarify-payment', required: true }] : [] },
      business_model_mutations: { mutations: [{ mutation_id: `${caseId}-mutation`, risk: 'high' }] }
    }
  };
}

const paymentObligations = [
  label('p1', { expected: true, groundable: true, risk: 'critical' }),
  label('p2', { expected: true, groundable: false, risk: 'high' }),
  label('p3', { expected: true, groundable: true, risk: 'low' })
];
const identityObligations = [label('i1', { expected: true, groundable: true, risk: 'critical' })];

/** @param {string} captureId @param {Array<[string, boolean, string, boolean?]>} rows */
function assertionLabels(captureId, rows) {
  return rows.map(([assertionId, supported, risk, oracle = true]) => label(
    `${captureId}::${assertionId}`, { supported, risk, oracle, anchor_present: true }
  ));
}

/** @param {string} captureId @param {Array<[string, boolean, string]>} rows */
function caseLabels(captureId, rows) {
  return rows.map(([caseId, accepted, risk]) => label(
    `${captureId}::${caseId}`, { accepted_without_material_rewrite: accepted, risk }
  ));
}

const paymentAssertionLabels = [
  ...assertionLabels('payment-generate-test-cases-1', [['a1', true, 'critical'], ['a2', false, 'high']]),
  ...assertionLabels('payment-generate-test-cases-2', [['a1', true, 'critical'], ['a2', true, 'low']]),
  ...assertionLabels('payment-generate-test-cases-3', [['a1', true, 'critical']])
];
const paymentCaseLabels = [
  ...caseLabels('payment-generate-test-cases-1', [['c1', true, 'critical'], ['c2', false, 'high']]),
  ...caseLabels('payment-generate-test-cases-2', [['c1', true, 'critical'], ['c2', true, 'low']]),
  ...caseLabels('payment-generate-test-cases-3', [['c1', true, 'critical']])
];
const identityAssertionLabels = [1, 2, 3].flatMap((repeat) => assertionLabels(
  `identity-generate-test-cases-${repeat}`, [['a1', true, 'critical']]
));
const identityCaseLabels = [1, 2, 3].flatMap((repeat) => caseLabels(
  `identity-generate-test-cases-${repeat}`, [['c1', true, 'critical']]
));
const metricExpectedProvenance = expectedProvenance('v1-test');
metricExpectedProvenance['generate-test-cases'] = {
  skill_version: 'test-skill', compiler_version: 'test-compiler', schema_version: '1.0.0',
  model_id: 'fixture-model', prompt_or_reference_id: 'fixture-prompt', baseline_version: 'fixture-baseline',
  benchmark_version: 'v1-test'
};

const metricManifest = {
  schema_version: '1.0.0', benchmark_version: 'v1-test', manifest_id: 'hand-calculated-corpus',
  evidence_class: 'synthetic-test-fixture', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
  expected_provenance: metricExpectedProvenance,
  strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
  cases: [
    benchmarkCase('payment', 'payments', BENCHMARK_STRATA[0], paymentObligations, paymentAssertionLabels, paymentCaseLabels, [
      { defect_id: 'd1', risk: 'high', source_ref: 'history:1' }, { defect_id: 'd2', risk: 'low', source_ref: 'history:2' }
    ]),
    benchmarkCase('identity', 'identity', BENCHMARK_STRATA[1], identityObligations, identityAssertionLabels, identityCaseLabels, [
      { defect_id: 'i-defect', risk: 'critical', source_ref: 'history:i' }
    ])
  ]
};

/** @param {string} caseId @param {number} repeat @param {any} output */
function captured(caseId, repeat, output) {
  const completeOutput = {
    test_point_signatures: [], grounded_test_point_signatures: [], grounded_coverage_signatures: [],
    blocked_test_point_signatures: [], grounded_assertions: [], grounded_cases: [],
    detected_historical_defect_ids: [], killed_mutation_ids: [],
    process_failures: {
      silent_formal_test_point_loss: false, fixed_round_clarification_stop: false,
      auto_repeat_unknown_or_deferred: false, old_revision_recovery: false
    },
    ...output
  };
  const captureId = `${caseId}-generate-test-cases-${repeat}`;
  const rawOutputDigest = createHash('sha256').update(`opaque-raw:${captureId}`).digest('hex');
  const extraction = {
    capture_id: captureId, raw_output_digest: rawOutputDigest,
    reviewer_id: 'fixture-reviewer', reviewed_at: '2026-08-31T00:00:00Z', method: 'offline-human-v1',
    output: structuredClone(completeOutput)
  };
  return {
    capture_id: captureId,
    case_id: caseId, system: 'generate-test-cases', repeat, capture_kind: 'synthetic-test-fixture',
    provenance: {
      skill_version: 'test-skill', compiler_version: 'test-compiler', schema_version: '1.0.0',
      model_id: 'fixture-model', prompt_or_reference_id: 'fixture-prompt', baseline_version: 'fixture-baseline',
      benchmark_version: 'v1-test', repeat,
      source_digest: `source-digest-${caseId}`, task_digest: `task-digest-${caseId}`
    },
    review_time_minutes: 5,
    raw_output_path: `raw/${caseId}-generate-test-cases-${repeat}.txt`, raw_output_digest: rawOutputDigest,
    extraction_path: `extracted/${caseId}-generate-test-cases-${repeat}.json`, extraction_digest: outputDigest(extraction),
    _raw_output_digest: rawOutputDigest, _extraction: extraction, _extraction_digest: outputDigest(extraction),
    output: completeOutput
  };
}

const metricRuns = [
  captured('payment', 1, {
    test_point_signatures: ['p1', 'p2', 'p3'], grounded_test_point_signatures: ['p1', 'p2'], grounded_coverage_signatures: ['p1', 'p2'],
    blocked_test_point_signatures: ['p3'], grounded_assertions: ['a1', 'a2'], grounded_cases: ['c1', 'c2'],
    detected_historical_defect_ids: ['d1'], killed_mutation_ids: ['payment-mutation']
  }),
  captured('payment', 2, {
    test_point_signatures: ['p1', 'p2', 'p3'], grounded_test_point_signatures: ['p1', 'p3'], grounded_coverage_signatures: ['p1', 'p3'],
    blocked_test_point_signatures: ['p2'], grounded_assertions: ['a1', 'a2'], grounded_cases: ['c1', 'c2'],
    detected_historical_defect_ids: ['d1', 'd2'], killed_mutation_ids: []
  }),
  captured('payment', 3, {
    test_point_signatures: ['p1', 'p3'], grounded_test_point_signatures: ['p1'], grounded_coverage_signatures: ['p1'],
    blocked_test_point_signatures: ['p3'], grounded_assertions: ['a1'], grounded_cases: ['c1'],
    detected_historical_defect_ids: ['d2'], killed_mutation_ids: ['payment-mutation']
  }),
  ...[1, 2, 3].map((repeat) => captured('identity', repeat, {
    test_point_signatures: ['i1'], grounded_test_point_signatures: ['i1'], grounded_coverage_signatures: ['i1'],
    blocked_test_point_signatures: [], grounded_assertions: ['a1'], grounded_cases: ['c1'],
    detected_historical_defect_ids: ['i-defect'], killed_mutation_ids: ['identity-mutation']
  }))
];

/** @param {any} metric */
function fraction(metric) {
  return [metric.numerator, metric.denominator, metric.value];
}

test('benchmark scorer keeps all eight hand-calculated metrics separate by domain and risk', () => {
  const beforeManifest = structuredClone(metricManifest);
  const beforeRuns = structuredClone(metricRuns);
  const report = scoreBenchmark(metricManifest, metricRuns);
  const overall = report.systems['generate-test-cases'].overall;

  assert.deepEqual(fraction(overall.grounded_factual_support_precision), [7, 8, 7 / 8]);
  assert.deepEqual(fraction(overall.expert_critical_test_point_recall), [6, 6, 1]);
  assert.deepEqual(fraction(overall.expert_overall_test_point_recall), [11, 12, 11 / 12]);
  assert.deepEqual(fraction(overall.grounded_no_material_rewrite_acceptance), [7, 8, 7 / 8]);
  assert.deepEqual(fraction(overall.historical_defect_recall), [7, 9, 7 / 9]);
  assert.deepEqual(fraction(overall.false_grounded_rate), [1, 8, 1 / 8]);
  assert.deepEqual(fraction(overall.false_blocked_rate), [2, 3, 2 / 3]);
  assert.equal(overall.test_point_signature_jaccard.value, 5 / 6);
  assert.ok(Math.abs(overall.grounded_coverage_signature_jaccard.value - (11 / 18)) < 1e-12);

  const payments = report.systems['generate-test-cases'].by_domain.payments;
  assert.ok(Math.abs(payments.test_point_signature_jaccard.value - (7 / 9)) < 1e-12);
  assert.ok(Math.abs(payments.grounded_coverage_signature_jaccard.value - (4 / 9)) < 1e-12);
  assert.deepEqual(fraction(payments.historical_defect_recall), [4, 6, 4 / 6]);
  assert.deepEqual(fraction(report.systems['generate-test-cases'].by_risk.high.grounded_factual_support_precision), [0, 1, 0]);
  assert.equal(Object.hasOwn(overall, 'combined_score'), false, 'precision and recall must never be amalgamated');
  for (const metric of Object.values(overall)) assert.equal(Object.hasOwn(metric, 'confidence_interval'), true);
  assert.equal(report.mutation_kill_signal.release_gate, false);
  assert.deepEqual(metricManifest, beforeManifest);
  assert.deepEqual(metricRuns, beforeRuns);
});

test('benchmark completeness fails closed for missing strata runs provenance labels adjudication and zero denominators', () => {
  const incomplete = scoreBenchmark(metricManifest, metricRuns);
  assert.equal(incomplete.completeness.status, 'insufficient_evidence');
  assert.equal(incomplete.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'STRATUM_PRD_MINIMUM_NOT_MET'), true);
  assert.equal(incomplete.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'CAPTURE_RUN_MISSING'), true);

  const zero = structuredClone(metricManifest);
  zero.cases[0].assets.supported_assertions.final_labels = [];
  zero.cases[0].assets.supported_assertions.expert_annotations.forEach((/** @type {any} */ annotation) => { annotation.labels = []; });
  const zeroReport = scoreBenchmark(zero, metricRuns.filter((run) => run.case_id === 'payment'));
  assert.equal(zeroReport.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'MANDATORY_METRIC_ZERO_DENOMINATOR'), true);

  const disagreement = structuredClone(metricManifest);
  disagreement.cases[0].assets.expert_obligations.expert_annotations[1].labels = structuredClone(
    disagreement.cases[0].assets.expert_obligations.final_labels
  );
  disagreement.cases[0].assets.expert_obligations.expert_annotations[1].labels[0] = label(
    'p1', { expected: true, groundable: false, risk: 'critical' }
  );
  const disagreementReport = scoreBenchmark(disagreement, metricRuns);
  assert.equal(disagreementReport.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'ADJUDICATION_MISSING'), true);

  const missingProvenance = structuredClone(metricRuns);
  missingProvenance[0].provenance.model_id = '';
  assert.equal(scoreBenchmark(metricManifest, missingProvenance).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'CAPTURE_PROVENANCE_MISSING'
  ), true);

  const incompleteExperts = structuredClone(metricManifest);
  incompleteExperts.cases[0].assets.supported_assertions.expert_annotations.pop();
  assert.equal(scoreBenchmark(incompleteExperts, metricRuns).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'EXPERT_ANNOTATIONS_INCOMPLETE'
  ), true);
});

function completeContractCorpus() {
  /** @type {any[]} */
  const cases = [];
  /** @type {any[]} */
  const runs = [];
  for (const [stratumIndex, stratum] of BENCHMARK_STRATA.entries()) {
    for (let caseIndex = 1; caseIndex <= 5; caseIndex += 1) {
      const caseId = `complete-${stratumIndex}-${caseIndex}`;
      const assertionRows = [];
      const acceptedRows = [];
      for (const system of BENCHMARK_SYSTEMS) for (let repeat = 1; repeat <= 3; repeat += 1) {
        const captureId = `${caseId}-${system}-${repeat}`;
        for (const risk of ['critical', 'high', 'medium', 'low']) {
          assertionRows.push(label(`${captureId}::assertion-${risk}`, { supported: true, risk, oracle: true, anchor_present: true }));
          acceptedRows.push(label(`${captureId}::case-${risk}`, { accepted_without_material_rewrite: true, risk }));
        }
        const output = {
          test_point_signatures: ['ground-critical', 'blocked-critical', 'ground-high', 'blocked-high', 'ground-medium', 'blocked-medium', 'ground-low', 'blocked-low'],
          grounded_test_point_signatures: ['ground-critical', 'ground-high', 'ground-medium', 'ground-low'],
          grounded_coverage_signatures: ['ground-critical', 'ground-high', 'ground-medium', 'ground-low'],
          blocked_test_point_signatures: ['blocked-critical', 'blocked-high', 'blocked-medium', 'blocked-low'],
          grounded_assertions: ['assertion-critical', 'assertion-high', 'assertion-medium', 'assertion-low'],
          grounded_cases: ['case-critical', 'case-high', 'case-medium', 'case-low'],
          detected_historical_defect_ids: ['critical', 'high', 'medium', 'low'].map((risk) => `defect-${risk}-${caseId}`),
          killed_mutation_ids: [],
          process_failures: {
            silent_formal_test_point_loss: false, fixed_round_clarification_stop: false,
            auto_repeat_unknown_or_deferred: false, old_revision_recovery: false
          }
        };
        const rawOutputDigest = createHash('sha256').update(`opaque-raw:${captureId}`).digest('hex');
        const extraction = {
          capture_id: captureId, raw_output_digest: rawOutputDigest,
          reviewer_id: 'fixture-reviewer', reviewed_at: '2026-08-31T00:00:00Z', method: 'offline-human-v1',
          output: structuredClone(output)
        };
        runs.push({
          capture_id: captureId, case_id: caseId, system, repeat, capture_kind: 'external-captured',
          provenance: {
            skill_version: system === 'generate-test-cases' ? 'skill-v1' : 'not-applicable',
            compiler_version: system === 'generate-test-cases' ? 'compiler-v1' : 'not-applicable',
            schema_version: '1.0.0', model_id: `${system}-model`, prompt_or_reference_id: `${system}-reference`,
            baseline_version: 'baseline-v1', benchmark_version: 'v1-complete-contract', repeat,
            source_digest: `source-digest-${caseId}`, task_digest: `task-digest-${caseId}`
          },
          review_time_minutes: 10,
          raw_output_path: `raw/${captureId}.txt`, raw_output_digest: rawOutputDigest,
          extraction_path: `extracted/${captureId}.json`, extraction_digest: outputDigest(extraction),
          _raw_output_digest: rawOutputDigest, _extraction: extraction, _extraction_digest: outputDigest(extraction), output
        });
      }
      cases.push(benchmarkCase(
        caseId, `domain-${stratumIndex}`, stratum,
        [
          ...['critical', 'high', 'medium', 'low'].flatMap((risk) => [
            label(`ground-${risk}`, { expected: true, groundable: true, risk }),
            label(`blocked-${risk}`, { expected: true, groundable: false, risk })
          ])
        ],
        assertionRows, acceptedRows,
        ['critical', 'high', 'medium', 'low'].map((risk) => ({
          defect_id: `defect-${risk}-${caseId}`, risk, source_ref: `external-history:${caseId}:${risk}`
        }))
      ));
      cases.at(-1).assets.task.clarification_required = caseIndex <= 2;
      cases.at(-1).assets.clarification_scenarios.scenarios = caseIndex <= 2 ? [{ scenario_id: `clarify-${caseId}`, required: true }] : [];
    }
  }
  return {
    manifest: {
      schema_version: '1.0.0', benchmark_version: 'v1-complete-contract', manifest_id: 'complete-contract',
      evidence_class: 'external-expert-corpus', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
      expected_provenance: expectedProvenance('v1-complete-contract'),
      strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
      cases
    },
    runs
  };
}

test('benchmark completeness accepts only the full 30-PRD six-stratum 360-capture contract', () => {
  const { manifest, runs } = completeContractCorpus();
  const report = scoreBenchmark(manifest, runs);
  assert.deepEqual(report.completeness, { status: 'complete', issues: [] });
  assert.equal(report.systems['generate-test-cases'].overall.expert_critical_test_point_recall.value, 1);
  assert.equal(report.systems['generate-test-cases'].overall.false_blocked_rate.denominator, 360);
  assert.equal(Object.hasOwn(report.systems['generate-test-cases'], 'by_domain_and_risk'), true);
  assert.ok(report.systems['generate-test-cases'].by_domain_and_risk['domain-0'].medium.false_blocked_rate.denominator > 0);
});

test('benchmark closes metric inflation, provenance impersonation, and cloned-corpus bypasses', () => {
  const coverageRuns = structuredClone(metricRuns);
  coverageRuns[0].output.grounded_coverage_signatures.push('unlabeled-coverage');
  rebindOutput(coverageRuns[0]);
  const coverageReport = scoreBenchmark(metricManifest, coverageRuns);
  assert.equal(hasIssue(coverageReport, 'CAPTURE_TEST_POINT_LABEL_MISSING'), true);
  assert.ok(Math.abs(coverageReport.systems['generate-test-cases'].overall.grounded_coverage_signature_jaccard.value - (47 / 90)) < 1e-12);

  const { manifest, runs } = completeContractCorpus();
  const closureManifest = structuredClone(manifest);
  const closureRuns = structuredClone(runs);
  const closureRun = closureRuns.find((/** @type {any} */ run) => run.case_id === closureManifest.cases[0].case_id && run.system === 'generate-test-cases' && run.repeat === 1);
  const assertionKey = `${closureRun.capture_id}::assertion-critical`;
  const acceptedKey = `${closureRun.capture_id}::case-critical`;
  for (const row of closureManifest.cases[0].assets.supported_assertions.final_labels) {
    if (row.label_key === assertionKey) row.value.supported = false;
  }
  for (const annotation of closureManifest.cases[0].assets.supported_assertions.expert_annotations) {
    for (const row of annotation.labels) if (row.label_key === assertionKey) row.value.supported = false;
  }
  for (const row of closureManifest.cases[0].assets.accepted_cases.final_labels) {
    if (row.label_key === acceptedKey) row.value.accepted_without_material_rewrite = false;
  }
  for (const annotation of closureManifest.cases[0].assets.accepted_cases.expert_annotations) {
    for (const row of annotation.labels) if (row.label_key === acceptedKey) row.value.accepted_without_material_rewrite = false;
  }
  closureRun.output.grounded_assertions = ['assertion-high', 'assertion-high', 'assertion-medium', 'assertion-low'];
  closureRun.output.grounded_cases = ['case-high', 'case-high', 'case-medium', 'case-low'];
  rebindOutput(closureRun);
  const closureReport = scoreBenchmark(closureManifest, closureRuns);
  assert.equal(hasIssue(closureReport, 'CAPTURE_OUTPUT_DUPLICATE_ID'), true);
  assert.equal(hasIssue(closureReport, 'CAPTURE_ASSERTION_LABEL_CLOSURE_INVALID'), true);
  assert.equal(hasIssue(closureReport, 'CAPTURE_CASE_LABEL_CLOSURE_INVALID'), true);
  assert.equal(closureReport.unsupported_critical_high_grounded_oracle_count, 1, 'capture omission cannot hide an expert-labeled unsupported Oracle');
  assert.equal(closureReport.systems['generate-test-cases'].overall.grounded_factual_support_precision.value, 359 / 360);
  assert.equal(closureReport.systems['generate-test-cases'].overall.grounded_no_material_rewrite_acceptance.value, 359 / 360);

  const defectManifest = structuredClone(manifest);
  const defects = defectManifest.cases[0].assets.historical_defects.defects;
  defects[0] = null;
  defects[1].defect_id = defects[2].defect_id;
  delete defects[3].defect_id;
  const defectReport = scoreBenchmark(defectManifest, runs);
  assert.equal(hasIssue(defectReport, 'HISTORICAL_DEFECT_INVALID'), true);
  assert.equal(hasIssue(defectReport, 'DUPLICATE_HISTORICAL_DEFECT_ID'), true);

  const expertManifest = structuredClone(manifest);
  expertManifest.cases[0].assets.expert_obligations.expert_annotations[0].expert_id = 1;
  expertManifest.cases[0].assets.expert_obligations.expert_annotations[1].expert_id = 2;
  assert.equal(hasIssue(scoreBenchmark(expertManifest, runs), 'EXPERT_ANNOTATIONS_INCOMPLETE'), true);

  const provenanceRuns = structuredClone(runs);
  provenanceRuns[0].provenance.model_id = 'impersonated-model';
  assert.equal(hasIssue(scoreBenchmark(manifest, provenanceRuns), 'CAPTURE_PROVENANCE_MISMATCH'), true);

  const leakedRuns = structuredClone(runs);
  leakedRuns[0].expert_labels = ['forbidden-leak'];
  leakedRuns[0].prior_diagnostics = ['forbidden-leak'];
  assert.equal(hasIssue(scoreBenchmark(manifest, leakedRuns), 'CAPTURE_SCHEMA_INVALID'), true);
  const unboundRuns = structuredClone(runs);
  unboundRuns[0].raw_output_digest = '0'.repeat(64);
  unboundRuns[1].raw_output_path = '../labels.json';
  unboundRuns[2]._extraction = undefined;
  const unboundReport = scoreBenchmark(manifest, unboundRuns);
  assert.equal(hasIssue(unboundReport, 'CAPTURE_RAW_OUTPUT_INVALID'), true);
  const sharedRawRuns = structuredClone(runs);
  for (const run of sharedRawRuns) run.raw_output_path = 'raw/one-output-for-all-captures.json';
  assert.equal(hasIssue(scoreBenchmark(manifest, sharedRawRuns), 'CAPTURE_RAW_OUTPUT_INVALID'), true);

  const clonedManifest = structuredClone(manifest);
  const clonedCase = clonedManifest.cases[1];
  clonedCase.assets.sources.digest = clonedManifest.cases[0].assets.sources.digest;
  for (const run of runs.filter((/** @type {any} */ item) => item.case_id === clonedCase.case_id)) {
    run.provenance.source_digest = clonedCase.assets.sources.digest;
  }
  assert.equal(hasIssue(scoreBenchmark(clonedManifest, runs), 'DUPLICATE_SOURCE_IDENTITY'), true);
});

test('benchmark closes capture lanes, case evidence IDs, and capture identity without prefix ambiguity', () => {
  const { manifest, runs } = completeContractCorpus();
  const contradictory = structuredClone(runs);
  const target = contradictory.find((/** @type {any} */ run) => run.system === 'generate-test-cases');
  target.output.test_point_signatures = target.output.test_point_signatures.filter((/** @type {string} */ id) => id !== 'ground-low');
  target.output.blocked_test_point_signatures.push('ground-low');
  target.output.detected_historical_defect_ids.push('not-a-corpus-defect');
  target.output.killed_mutation_ids.push('not-a-case-mutation');
  rebindOutput(target);
  const contradictoryReport = scoreBenchmark(manifest, contradictory);
  assert.equal(hasIssue(contradictoryReport, 'CAPTURE_TEST_POINT_LANES_INVALID'), true);
  assert.equal(hasIssue(contradictoryReport, 'CAPTURE_DEFECT_EVIDENCE_INVALID'), true);
  assert.equal(hasIssue(contradictoryReport, 'CAPTURE_MUTATION_EVIDENCE_INVALID'), true);
  assert.equal(contradictoryReport.completeness.status, 'insufficient_evidence');

  const prefixManifest = structuredClone(manifest);
  const prefixRuns = structuredClone(runs);
  const caseId = prefixManifest.cases[0].case_id;
  const left = prefixRuns.find((/** @type {any} */ run) => run.case_id === caseId && run.system === 'generate-test-cases' && run.repeat === 1);
  const right = prefixRuns.find((/** @type {any} */ run) => run.case_id === caseId && run.system === 'generate-test-cases' && run.repeat === 2);
  const oldLeft = left.capture_id;
  const oldRight = right.capture_id;
  left.capture_id = 'capture-prefix';
  right.capture_id = 'capture-prefix::nested';
  for (const assetName of ['supported_assertions', 'accepted_cases']) {
    const asset = prefixManifest.cases[0].assets[assetName];
    for (const labels of [asset.final_labels, ...asset.expert_annotations.map((/** @type {any} */ annotation) => annotation.labels)]) {
      for (const row of labels) {
        if (row.label_key.startsWith(`${oldLeft}::`)) row.label_key = row.label_key.replace(oldLeft, left.capture_id);
        if (row.label_key.startsWith(`${oldRight}::`)) row.label_key = row.label_key.replace(oldRight, right.capture_id);
      }
    }
  }
  const unsupportedKey = `${left.capture_id}::assertion-critical`;
  const assertionAsset = prefixManifest.cases[0].assets.supported_assertions;
  for (const labels of [assertionAsset.final_labels, ...assertionAsset.expert_annotations.map((/** @type {any} */ annotation) => annotation.labels)]) {
    labels.find((/** @type {any} */ row) => row.label_key === unsupportedKey).value.supported = false;
  }
  rebindOutput(left);
  rebindOutput(right);
  const prefixReport = scoreBenchmark(prefixManifest, prefixRuns);
  assert.equal(prefixReport.completeness.status, 'complete');
  assert.deepEqual(fraction(prefixReport.systems['generate-test-cases'].overall.grounded_factual_support_precision), [359, 360, 359 / 360]);

  const crossManifest = structuredClone(manifest);
  const crossRuns = structuredClone(runs);
  const crossCase = crossManifest.cases[0];
  const targetRun = crossRuns.find((/** @type {any} */ run) => run.case_id === crossCase.case_id && run.system === 'generate-test-cases' && run.repeat === 1);
  const baselineRun = crossRuns.find((/** @type {any} */ run) => run.case_id === crossCase.case_id && run.system === 'long-prompt' && run.repeat === 1);
  const renames = new Map([[targetRun.capture_id, 'cross-system-prefix'], [baselineRun.capture_id, 'cross-system-prefix::nested']]);
  targetRun.capture_id = renames.get(targetRun.capture_id);
  baselineRun.capture_id = renames.get(baselineRun.capture_id);
  for (const assetName of ['supported_assertions', 'accepted_cases']) {
    const asset = crossCase.assets[assetName];
    for (const labels of [asset.final_labels, ...asset.expert_annotations.map((/** @type {any} */ annotation) => annotation.labels)]) {
      for (const row of labels) for (const [oldId, newId] of renames) {
        if (row.label_key.startsWith(`${oldId}::`)) row.label_key = row.label_key.replace(oldId, newId);
      }
    }
  }
  const crossUnsupportedKey = `${targetRun.capture_id}::assertion-critical`;
  const crossAssertions = crossCase.assets.supported_assertions;
  for (const labels of [crossAssertions.final_labels, ...crossAssertions.expert_annotations.map((/** @type {any} */ annotation) => annotation.labels)]) {
    labels.find((/** @type {any} */ row) => row.label_key === crossUnsupportedKey).value.supported = false;
  }
  rebindOutput(targetRun);
  rebindOutput(baselineRun);
  const crossReport = scoreBenchmark(crossManifest, crossRuns);
  assert.equal(crossReport.completeness.status, 'complete');
  assert.deepEqual(fraction(crossReport.systems['generate-test-cases'].overall.grounded_factual_support_precision), [359, 360, 359 / 360]);
});

test('benchmark Jaccard identities cannot collide across case and Test Point delimiters', () => {
  const caseA = benchmarkCase('a', 'collision', BENCHMARK_STRATA[0], [
    label('b::c', { expected: true, groundable: true, risk: 'critical' })
  ], [], [], []);
  const caseB = benchmarkCase('a::b', 'collision', BENCHMARK_STRATA[0], [
    label('c', { expected: true, groundable: true, risk: 'critical' })
  ], [], [], []);
  const collisionManifest = {
    ...metricManifest, cases: [caseA, caseB], expected_provenance: metricExpectedProvenance
  };
  const collisionRuns = [
    captured('a', 1, { test_point_signatures: ['b::c'], grounded_test_point_signatures: ['b::c'], grounded_coverage_signatures: ['b::c'] }),
    captured('a', 2, {}),
    captured('a', 3, { test_point_signatures: ['b::c'], grounded_test_point_signatures: ['b::c'], grounded_coverage_signatures: ['b::c'] }),
    captured('a::b', 1, {}),
    captured('a::b', 2, { test_point_signatures: ['c'], grounded_test_point_signatures: ['c'], grounded_coverage_signatures: ['c'] }),
    captured('a::b', 3, {})
  ];
  const report = scoreBenchmark(collisionManifest, collisionRuns);
  assert.equal(report.systems['generate-test-cases'].overall.test_point_signature_jaccard.value, 1 / 3);
});

test('benchmark rejects renamed source clones and incomplete retained label history', () => {
  const { manifest, runs } = completeContractCorpus();
  const cloned = structuredClone(manifest);
  cloned.cases[1].assets.sources.content_digest = cloned.cases[0].assets.sources.content_digest = 'same-content-digest';
  assert.equal(hasIssue(scoreBenchmark(cloned, runs), 'DUPLICATE_SOURCE_CONTENT'), true);

  const lineage = structuredClone(manifest);
  const asset = lineage.cases[0].assets.supported_assertions;
  asset.correction_of = '0.9.0';
  /** @type {any[]} */
  const emptyLabels = [];
  /** @type {any} */
  const emptySnapshot = {
    label_version: '0.9.0', correction_of: null, final_labels: emptyLabels,
    expert_annotations: [
      { expert_id: 'expert-a', complete: true, labels: emptyLabels },
      { expert_id: 'expert-b', complete: true, labels: emptyLabels }
    ],
    adjudications: []
  };
  emptySnapshot.digest = createHash('sha256').update(JSON.stringify({
    label_version: emptySnapshot.label_version, correction_of: emptySnapshot.correction_of,
    final_labels: emptySnapshot.final_labels, expert_annotations: emptySnapshot.expert_annotations,
    adjudications: emptySnapshot.adjudications
  })).digest('hex');
  asset.prior_versions = [emptySnapshot];
  lineage.cases[0].label_lineage_anchors.supported_assertions = [{ label_version: '0.9.0', digest: emptySnapshot.digest }];
  assert.equal(hasIssue(scoreBenchmark(lineage, runs), 'LABEL_LINEAGE_MISSING'), true);

  const added = structuredClone(manifest);
  const addedAsset = added.cases[0].assets.supported_assertions;
  const priorAsset = structuredClone(addedAsset);
  priorAsset.final_labels = priorAsset.final_labels.slice(0, -1);
  for (const annotation of priorAsset.expert_annotations) annotation.labels = annotation.labels.slice(0, -1);
  addedAsset.correction_of = '0.9.0';
  const addedSnapshot = retainedLabelSnapshot(priorAsset, '0.9.0');
  addedAsset.prior_versions = [addedSnapshot];
  added.cases[0].label_lineage_anchors.supported_assertions = [{ label_version: '0.9.0', digest: addedSnapshot.digest }];
  assert.equal(hasIssue(scoreBenchmark(added, runs), 'LABEL_LINEAGE_MISSING'), false, 'a correction may add a newly recovered label while retaining complete history');

  const tampered = structuredClone(added);
  const tamperedSnapshot = tampered.cases[0].assets.supported_assertions.prior_versions[0];
  tamperedSnapshot.final_labels = tamperedSnapshot.final_labels.slice(0, 1);
  for (const annotation of tamperedSnapshot.expert_annotations) annotation.labels = annotation.labels.slice(0, 1);
  tamperedSnapshot.digest = createHash('sha256').update(JSON.stringify({
    label_version: tamperedSnapshot.label_version, correction_of: tamperedSnapshot.correction_of,
    final_labels: tamperedSnapshot.final_labels, expert_annotations: tamperedSnapshot.expert_annotations,
    adjudications: tamperedSnapshot.adjudications
  })).digest('hex');
  assert.equal(hasIssue(scoreBenchmark(tampered, runs), 'LABEL_LINEAGE_MISSING'), true, 'a retained snapshot cannot rewrite its digest anchor');
});

test('benchmark reviewer regressions fail closed instead of inflating or crashing completeness', () => {
  const { manifest, runs } = completeContractCorpus();

  const duplicate = structuredClone(manifest);
  duplicate.cases[1].case_id = duplicate.cases[0].case_id;
  assert.equal(scoreBenchmark(duplicate, runs).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'DUPLICATE_CASE_ID'
  ), true);

  const malformed = structuredClone(runs);
  delete malformed[0].output.grounded_assertions;
  const malformedReport = scoreBenchmark(manifest, malformed);
  assert.equal(malformedReport.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'CAPTURE_OUTPUT_INVALID'), true);

  const nullRun = structuredClone(runs);
  nullRun[0] = null;
  const nullRunReport = scoreBenchmark(manifest, nullRun);
  assert.equal(nullRunReport.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'CAPTURE_RECORD_INVALID'), true);

  const nullExpert = structuredClone(manifest);
  nullExpert.cases[0].assets.supported_assertions.expert_annotations[0] = null;
  const nullExpertReport = scoreBenchmark(nullExpert, runs);
  assert.equal(nullExpertReport.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'EXPERT_ANNOTATIONS_INCOMPLETE'), true);

  const extraNullExpert = structuredClone(manifest);
  extraNullExpert.cases[0].assets.supported_assertions.expert_annotations.push(null);
  assert.equal(hasIssue(scoreBenchmark(extraNullExpert, runs), 'EXPERT_ANNOTATIONS_INCOMPLETE'), true);
  const sparseExpert = structuredClone(manifest);
  sparseExpert.cases[0].assets.supported_assertions.expert_annotations.length = 3;
  assert.equal(hasIssue(scoreBenchmark(sparseExpert, runs), 'EXPERT_ANNOTATIONS_INCOMPLETE'), true);

  const nullLabel = structuredClone(manifest);
  nullLabel.cases[0].assets.expert_obligations.final_labels[0] = null;
  const nullLabelReport = scoreBenchmark(nullLabel, runs);
  assert.equal(nullLabelReport.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'OBLIGATION_LABEL_INVALID'), true);

  const malformedExpertLabels = structuredClone(manifest);
  malformedExpertLabels.cases[0].assets.supported_assertions.expert_annotations[0].labels = {};
  const malformedExpertReport = scoreBenchmark(malformedExpertLabels, runs);
  assert.equal(malformedExpertReport.completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'EXPERT_ANNOTATIONS_INCOMPLETE'
  ), true);

  const processMissing = structuredClone(runs);
  delete processMissing[0].output.process_failures.old_revision_recovery;
  assert.equal(scoreBenchmark(manifest, processMissing).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'PROCESS_TELEMETRY_MISSING'
  ), true);

  const processExtra = structuredClone(runs);
  processExtra[0].output.process_failures.invented_failure = false;
  assert.equal(scoreBenchmark(manifest, processExtra).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'PROCESS_TELEMETRY_INVALID'
  ), true);

  const duplicateCapture = structuredClone(runs);
  duplicateCapture[1].capture_id = duplicateCapture[0].capture_id;
  assert.equal(scoreBenchmark(manifest, duplicateCapture).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'DUPLICATE_CAPTURE_ID'
  ), true);

  const labels = structuredClone(manifest);
  delete labels.cases[0].assets.supported_assertions.label_version;
  delete labels.cases[1].assets.supported_assertions.final_labels[0].value.anchor_present;
  assert.equal(scoreBenchmark(labels, runs).completeness.issues.some((/** @type {any} */ issue) => issue.code === 'LABEL_VERSION_INVALID'), true);
  assert.equal(scoreBenchmark(labels, runs).completeness.issues.some((/** @type {any} */ issue) => issue.code === 'ASSERTION_LABEL_INVALID'), true);

  const mutations = structuredClone(manifest);
  mutations.cases[0].assets.business_model_mutations.mutations = [];
  assert.equal(scoreBenchmark(mutations, runs).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'HIGH_RISK_MUTATIONS_MISSING'
  ), true);

  const lineage = structuredClone(manifest);
  lineage.cases[0].assets.supported_assertions.correction_of = '0.9.0';
  lineage.cases[0].assets.supported_assertions.prior_versions = [];
  assert.equal(scoreBenchmark(lineage, runs).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'LABEL_LINEAGE_MISSING'
  ), true);

  const retainedLineage = structuredClone(manifest);
  const correctedAsset = retainedLineage.cases[0].assets.supported_assertions;
  correctedAsset.correction_of = '0.9.0';
  const retainedSnapshot = retainedLabelSnapshot(correctedAsset, '0.9.0');
  correctedAsset.prior_versions = [retainedSnapshot];
  retainedLineage.cases[0].label_lineage_anchors.supported_assertions = [{ label_version: '0.9.0', digest: retainedSnapshot.digest }];
  assert.equal(scoreBenchmark(retainedLineage, runs).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'LABEL_LINEAGE_MISSING'
  ), false);

  const invalidRetainedExperts = structuredClone(manifest);
  const invalidRetainedAsset = invalidRetainedExperts.cases[0].assets.supported_assertions;
  invalidRetainedAsset.correction_of = '0.9.0';
  const invalidSnapshot = retainedLabelSnapshot(invalidRetainedAsset, '0.9.0');
  invalidSnapshot.expert_annotations[1].expert_id = invalidSnapshot.expert_annotations[0].expert_id;
  const invalidPayload = {
    label_version: invalidSnapshot.label_version, correction_of: invalidSnapshot.correction_of,
    final_labels: invalidSnapshot.final_labels,
    expert_annotations: invalidSnapshot.expert_annotations, adjudications: invalidSnapshot.adjudications
  };
  invalidSnapshot.digest = createHash('sha256').update(JSON.stringify(invalidPayload)).digest('hex');
  invalidRetainedAsset.prior_versions = [invalidSnapshot];
  invalidRetainedExperts.cases[0].label_lineage_anchors.supported_assertions = [{ label_version: '0.9.0', digest: invalidSnapshot.digest }];
  assert.equal(hasIssue(scoreBenchmark(invalidRetainedExperts, runs), 'LABEL_LINEAGE_MISSING'), true);

  const invalidAdjudication = structuredClone(manifest);
  const labelsAsset = invalidAdjudication.cases[0].assets.expert_obligations;
  labelsAsset.expert_annotations[1].labels = structuredClone(labelsAsset.expert_annotations[1].labels);
  labelsAsset.expert_annotations[1].labels[0] = label('ground-critical', { expected: true, groundable: false, risk: 'critical' });
  labelsAsset.adjudications = [{ label_key: 'ground-critical', completed: true, resolved_value: labelsAsset.final_labels[0].value }];
  assert.equal(scoreBenchmark(invalidAdjudication, runs).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'ADJUDICATION_INVALID'
  ), true);

  const provenance = structuredClone(runs);
  provenance[0].provenance.source_digest = 'wrong-source';
  assert.equal(scoreBenchmark(manifest, provenance).completeness.issues.some(
    (/** @type {any} */ issue) => issue.code === 'CAPTURE_SOURCE_TASK_MISMATCH'
  ), true);

  const zeroCohort = structuredClone(manifest);
  for (const benchmarkCase of zeroCohort.cases.filter((/** @type {any} */ item) => item.domain === 'domain-0')) {
    benchmarkCase.assets.supported_assertions.final_labels = benchmarkCase.assets.supported_assertions.final_labels.filter(
      (/** @type {any} */ item) => item.value.risk !== 'medium'
    );
    benchmarkCase.assets.supported_assertions.expert_annotations.forEach((/** @type {any} */ annotation) => {
      annotation.labels = annotation.labels.filter((/** @type {any} */ item) => item.value.risk !== 'medium');
    });
  }
  assert.equal(scoreBenchmark(zeroCohort, runs).completeness.issues.some(
    (/** @type {any} */ item) => item.code === 'MANDATORY_METRIC_ZERO_DENOMINATOR' && item.path.includes('/by_domain_and_risk/domain-0/medium/')
  ), true);


  const baselineZero = structuredClone(runs);
  for (const run of baselineZero.filter((/** @type {any} */ item) => item.system === 'long-prompt')) run.output.grounded_assertions = [];
  assert.equal(scoreBenchmark(manifest, baselineZero).completeness.issues.some(
    (/** @type {any} */ item) => item.code === 'MANDATORY_METRIC_ZERO_DENOMINATOR' && item.path.includes('/systems/long-prompt/')
  ), true);
});

test('benchmark loader validates the manifest schema and reports malformed inputs without throwing', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'benchmark-invalid-'));
  const manifestPath = path.join(temporaryRoot, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({ systems: ['invented-system'], cases: {} }));
  const loaded = await loadBenchmarkInputs(manifestPath);
  const report = scoreBenchmark(loaded.manifest, loaded.capturedRuns);
  assert.equal(report.completeness.status, 'insufficient_evidence');
  assert.equal(report.completeness.issues.some((/** @type {any} */ issue) => issue.code === 'MANIFEST_SCHEMA_INVALID'), true);
});

test('benchmark loader rejects a symlink that crosses the hidden-label directory boundary', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'benchmark-symlink-'));
  await mkdir(path.join(temporaryRoot, 'cases'));
  await mkdir(path.join(temporaryRoot, 'captured/escape'), { recursive: true });
  await mkdir(path.join(temporaryRoot, 'outside-case'));
  await symlink(path.join(temporaryRoot, 'outside-case'), path.join(temporaryRoot, 'cases/escape'), 'dir');
  const manifestPath = path.join(temporaryRoot, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    schema_version: '1.0.0', benchmark_version: 'v1-symlink-test', manifest_id: 'symlink-test',
    evidence_class: 'synthetic-pilot', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
    expected_provenance: expectedProvenance('v1-symlink-test'),
    strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
    cases: [{
      case_id: 'escape', domain: 'security', stratum: BENCHMARK_STRATA[0], risk: 'low', high_risk: false,
      case_directory: 'cases/escape', capture_directory: 'captured/escape'
    }]
  }));
  const loaded = await loadBenchmarkInputs(manifestPath);
  assert.equal(loaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);

  await mkdir(path.join(temporaryRoot, 'cases/real'));
  await mkdir(path.join(temporaryRoot, 'captured/real'));
  await symlink(path.join(temporaryRoot, 'cases/real'), path.join(temporaryRoot, 'cases/alias'), 'dir');
  await symlink(path.join(temporaryRoot, 'captured/real'), path.join(temporaryRoot, 'captured/alias'), 'dir');
  const aliasManifestPath = path.join(temporaryRoot, 'inside-alias-manifest.json');
  await writeFile(aliasManifestPath, JSON.stringify({
    schema_version: '1.0.0', benchmark_version: 'v1-symlink-test', manifest_id: 'inside-alias-test',
    evidence_class: 'synthetic-pilot', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
    expected_provenance: expectedProvenance('v1-symlink-test'),
    strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
    cases: [{
      case_id: 'alias', domain: 'security', stratum: BENCHMARK_STRATA[0], risk: 'low', high_risk: false,
      case_directory: 'cases/alias', capture_directory: 'captured/alias'
    }]
  }));
  const aliasLoaded = await loadBenchmarkInputs(aliasManifestPath);
  assert.equal(aliasLoaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);

});

test('benchmark loader rejects symlinked or overlapping top-level evidence roots', async () => {
  const temporaryParent = await mkdtemp(path.join(os.tmpdir(), 'benchmark-root-boundary-'));
  const benchmarkRoot = path.join(temporaryParent, 'benchmark');
  await mkdir(benchmarkRoot);
  await mkdir(path.join(temporaryParent, 'outside-cases'));
  await mkdir(path.join(benchmarkRoot, 'captured'));
  await symlink(path.join(temporaryParent, 'outside-cases'), path.join(benchmarkRoot, 'cases'), 'dir');
  const manifestPath = path.join(benchmarkRoot, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    schema_version: '1.0.0', benchmark_version: 'v1-root-test', manifest_id: 'root-test',
    evidence_class: 'synthetic-pilot', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
    expected_provenance: expectedProvenance('v1-root-test'),
    strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
    cases: []
  }));
  const loaded = await loadBenchmarkInputs(manifestPath);
  assert.equal(loaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);

  const overlapRoot = path.join(temporaryParent, 'overlap-benchmark');
  await mkdir(path.join(overlapRoot, 'cases'), { recursive: true });
  await symlink(path.join(overlapRoot, 'cases'), path.join(overlapRoot, 'captured'), 'dir');
  const overlapManifestPath = path.join(overlapRoot, 'manifest.json');
  await writeFile(overlapManifestPath, JSON.stringify({
    schema_version: '1.0.0', benchmark_version: 'v1-root-test', manifest_id: 'overlap-root-test',
    evidence_class: 'synthetic-pilot', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
    expected_provenance: expectedProvenance('v1-root-test'),
    strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
    cases: []
  }));
  const overlapLoaded = await loadBenchmarkInputs(overlapManifestPath);
  assert.equal(overlapLoaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);
});

test('benchmark loader rejects hardlinks between hidden labels and generation sources', async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'benchmark-hardlink-'));
  const caseRoot = path.join(temporaryRoot, 'cases/hardlink');
  await mkdir(path.join(caseRoot, 'sources'), { recursive: true });
  await mkdir(path.join(temporaryRoot, 'captured/hardlink'), { recursive: true });
  await writeFile(path.join(caseRoot, 'expert-obligations.json'), '{}');
  await link(path.join(caseRoot, 'expert-obligations.json'), path.join(caseRoot, 'sources/leaked-hidden-label.json'));
  const manifestPath = path.join(temporaryRoot, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify({
    schema_version: '1.0.0', benchmark_version: 'v1-hardlink-test', manifest_id: 'hardlink-test',
    evidence_class: 'synthetic-pilot', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
    expected_provenance: expectedProvenance('v1-hardlink-test'),
    strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
    cases: [{
      case_id: 'hardlink', domain: 'security', stratum: BENCHMARK_STRATA[0], risk: 'low', high_risk: false,
      case_directory: 'cases/hardlink', capture_directory: 'captured/hardlink'
    }]
  }));
  const loaded = await loadBenchmarkInputs(manifestPath);
  assert.equal(loaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);
});

test('benchmark loader rejects a symlinked benchmark root and pairwise nested case roots', async () => {
  const temporaryParent = await mkdtemp(path.join(os.tmpdir(), 'benchmark-root-alias-'));
  const realRoot = path.join(temporaryParent, 'real-v1');
  await mkdir(path.join(realRoot, 'cases'), { recursive: true });
  await mkdir(path.join(realRoot, 'captured'), { recursive: true });
  const emptyManifest = {
    schema_version: '1.0.0', benchmark_version: 'v1-root-alias', manifest_id: 'root-alias',
    evidence_class: 'synthetic-pilot', systems: [...BENCHMARK_SYSTEMS], repeats_per_system: 3,
    expected_provenance: expectedProvenance('v1-root-alias'),
    strata: BENCHMARK_STRATA.map((stratum) => ({ stratum, minimum_prds: 5, minimum_critical_obligations: 3, minimum_clarification_prds: 2, minimum_historical_defects: 5 })),
    cases: []
  };
  await writeFile(path.join(realRoot, 'manifest.json'), JSON.stringify(emptyManifest));
  const aliasRoot = path.join(temporaryParent, 'alias-v1');
  await symlink(realRoot, aliasRoot, 'dir');
  const aliasLoaded = await loadBenchmarkInputs(path.join(aliasRoot, 'manifest.json'));
  assert.equal(aliasLoaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);

  const manifestLinkRoot = path.join(temporaryParent, 'manifest-link-v1');
  await mkdir(path.join(manifestLinkRoot, 'cases'), { recursive: true });
  await mkdir(path.join(manifestLinkRoot, 'captured'), { recursive: true });
  const mutableManifest = path.join(temporaryParent, 'mutable-manifest.json');
  await writeFile(mutableManifest, JSON.stringify(emptyManifest));
  await symlink(mutableManifest, path.join(manifestLinkRoot, 'manifest.json'));
  const manifestLinkLoaded = await loadBenchmarkInputs(path.join(manifestLinkRoot, 'manifest.json'));
  assert.equal(manifestLinkLoaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);

  const nestedRoot = path.join(temporaryParent, 'nested-v1');
  await mkdir(path.join(nestedRoot, 'cases/outer/sources/inner'), { recursive: true });
  await mkdir(path.join(nestedRoot, 'captured/outer/inner'), { recursive: true });
  const nestedManifest = {
    ...emptyManifest, benchmark_version: 'v1-nested', manifest_id: 'nested-roots',
    expected_provenance: expectedProvenance('v1-nested'),
    cases: [
      { case_id: 'outer', domain: 'security', stratum: BENCHMARK_STRATA[0], risk: 'low', high_risk: false, case_directory: 'cases/outer', capture_directory: 'captured/outer' },
      { case_id: 'inner', domain: 'security', stratum: BENCHMARK_STRATA[0], risk: 'low', high_risk: false, case_directory: 'cases/outer/sources/inner', capture_directory: 'captured/outer/inner' }
    ]
  };
  await writeFile(path.join(nestedRoot, 'manifest.json'), JSON.stringify(nestedManifest));
  const nestedLoaded = await loadBenchmarkInputs(path.join(nestedRoot, 'manifest.json'));
  assert.equal(nestedLoaded.manifest.load_issues.some((/** @type {any} */ issue) => issue.code === 'BENCHMARK_PATH_INVALID'), true);
  assert.deepEqual(nestedLoaded.manifest.cases, []);
});

test('benchmark V1 pilot has required hidden-label assets and only external capture paths', async () => {
  const manifestPath = path.join(root, 'benchmark/v1/manifest.json');
  const { manifest, capturedRuns } = await loadBenchmarkInputs(manifestPath);
  const rawManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestSchema = JSON.parse(await readFile(path.join(root, 'benchmark/manifest.schema.json'), 'utf8'));
  assert.deepEqual(validateAgainstSchema(rawManifest, manifestSchema), []);
  const required = [
    'task.json', 'expert-obligations.json', 'supported-assertions.json', 'accepted-cases.json',
    'historical-defects.json', 'clarification-scenarios.json'
  ];
  for (const item of rawManifest.cases) {
    const caseRoot = path.join(root, 'benchmark/v1', item.case_directory);
    await stat(path.join(caseRoot, 'sources'));
    for (const filename of required) await stat(path.join(caseRoot, filename));
    assert.equal(path.resolve(path.join(root, 'benchmark/v1', item.capture_directory)).startsWith(path.join(caseRoot, path.sep)), false);
  }
  assert.equal(manifest.evidence_class, 'synthetic-pilot');
  assert.equal(Object.isFrozen(manifest), true);
  assert.equal(capturedRuns.every((/** @type {any} */ run) => run.capture_kind === 'synthetic-pilot'), true);
  assert.equal(capturedRuns.every((/** @type {any} */ run) => !Object.hasOwn(run, 'expert_labels')), true);
  assert.equal(capturedRuns.every((/** @type {any} */ run) => typeof run.raw_output_path === 'string' && /^[a-f0-9]{64}$/.test(run.raw_output_digest)), true);
  assert.equal(capturedRuns.every((/** @type {any} */ run) => typeof run.extraction_path === 'string' && /^[a-f0-9]{64}$/.test(run.extraction_digest)), true);
  assert.equal(capturedRuns.every((/** @type {any} */ run) => run._extraction?.capture_id === run.capture_id), true);
  assert.equal(capturedRuns.every((/** @type {any} */ run) => run.raw_output_digest !== outputDigest(run.output)), true, 'raw evidence must be the original opaque artifact, not a copied score summary');
  assert.equal(scoreBenchmark(manifest, capturedRuns).completeness.status, 'insufficient_evidence');
});

test('benchmark scoring remains offline and never invokes fetch or network/model modules', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('benchmark attempted network access'); };
  try {
    const { manifest, capturedRuns } = await loadBenchmarkInputs(path.join(root, 'benchmark/v1/manifest.json'));
    assert.equal(scoreBenchmark(manifest, capturedRuns).completeness.status, 'insufficient_evidence');
  } finally {
    globalThis.fetch = originalFetch;
  }
  const source = await readFile(path.join(root, 'benchmark/score.mjs'), 'utf8');
  assert.equal(/node:(?:http|https|net|tls|dns)|\bfetch\s*\(|openai|anthropic/i.test(source), false);
});
