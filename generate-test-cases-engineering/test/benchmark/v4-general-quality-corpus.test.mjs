import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { evaluateIndependentTargets } from '../../benchmark/general-quality-metrics.mjs';
import { canonicalStringify } from '../../src/canonical.mjs';

const engineeringRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const corpusRoot = path.join(engineeringRoot, 'benchmark/general-quality-v1');
const manifest = JSON.parse(await readFile(path.join(corpusRoot, 'manifest.json'), 'utf8'));

/** @param {string|Uint8Array} value */
const sha256 = value => createHash('sha256').update(value).digest('hex');

/** @param {string} fixtureId */
async function fixture(fixtureId) {
  const descriptor = manifest.fixtures.find((/** @type {any} */ item) => item.fixture_id === fixtureId);
  if (!descriptor) throw new TypeError(`FIXTURE_NOT_FOUND:${fixtureId}`);
  return JSON.parse(await readFile(path.join(corpusRoot, descriptor.path), 'utf8'));
}

test('AT25 corpus manifest freezes conditions, known fixtures and one reserved holdout before evaluator tuning', async () => {
  assert.equal(manifest.schema_version, '1.0.0');
  assert.equal(manifest.corpus_id, 'generate-test-cases-general-quality-v1');
  assert.equal(manifest.evaluation_protocol.deterministic_repeats, 3);
  assert.equal(manifest.evaluation_protocol.model_generation_mode, 'not_run');
  assert.equal(manifest.evaluation_protocol.release_eligible_without_model_generation, false);
  assert.equal(manifest.fixtures.filter((/** @type {any} */ item) =>
    item.membership === 'reserved_holdout').length, 1);
  assert.deepEqual(manifest.fixtures.map((/** @type {any} */ item) => item.path),
    [...manifest.fixtures.map((/** @type {any} */ item) => item.path)].sort());
  for (const item of manifest.fixtures) {
    assert.equal(sha256(await readFile(path.join(corpusRoot, item.path))), item.sha256, item.path);
  }
});

test('AT25: independent required-target coverage is 2/3; duplicates, gaps and exploratory entries do not inflate it', async () => {
  const input = await fixture('GQ-AT25-COVERAGE');
  const report = evaluateIndependentTargets({
    requiredTargets: input.required_targets, cases: input.cases
  });
  assert.equal(report.hard_failure_status, input.expected.status);
  assert.deepEqual(report.effective_required_target_coverage, {
    status: 'measured', covered_target_count: input.expected.covered,
    required_target_count: input.expected.required, ratio: input.expected.ratio
  });
  assert.deepEqual(report.by_acceptance_role.primary_acceptance, {
    status: 'measured', covered_target_count: 2, required_target_count: 2, ratio: 1
  });
  assert.deepEqual(report.by_acceptance_role.dependency_contract, {
    status: 'measured', covered_target_count: 0, required_target_count: 1, ratio: 0
  });
  assert.equal(report.counts.context_target_count, 1);
  assert.equal(report.counts.duplicate_case_count, input.expected.duplicate_case_count);
  assert.equal(report.counts.semantic_gap_count, 1);
  assert.equal(report.counts.exploratory_count, 1);
  assert.deepEqual(report.target_results.find((/** @type {any} */ item) =>
    item.target_id === 'TARGET-C').failure_reasons,
    ['rule_incorrect', 'undecidable']);
});

test('AT25: rule regression, unsupported assertions, critical bypass and deletion are non-averageable hard failures', async () => {
  const input = await fixture('GQ-HARD-FAILURES');
  const report = evaluateIndependentTargets({
    requiredTargets: input.required_targets, cases: input.cases
  });
  assert.equal(report.hard_failure_status, 'fail');
  assert.deepEqual([...new Set(report.hard_failures.map((item) => item.code))].sort(),
    input.expected_hard_failure_codes);
  assert.equal(report.quality_gate_passed, false);
});

test('AT25: zero formal target denominator is not applicable, never a synthetic 100%', async () => {
  const input = await fixture('GQ-ZERO-DENOMINATOR');
  const report = evaluateIndependentTargets({
    requiredTargets: input.required_targets, cases: input.cases
  });
  assert.deepEqual(report.effective_required_target_coverage, {
    status: input.expected.status, covered_target_count: input.expected.covered,
    required_target_count: input.expected.required, ratio: input.expected.ratio
  });
});

test('AT25 paired fixture reports the fixed evaluator comparison without presenting it as model-generation evidence', async () => {
  const input = await fixture('GQ-PAIRED-COMPARISON');
  const baseline = evaluateIndependentTargets({
    requiredTargets: input.required_targets, cases: input.baseline_cases
  });
  const candidate = evaluateIndependentTargets({
    requiredTargets: input.required_targets, cases: input.candidate_cases
  });
  assert.equal(baseline.effective_required_target_coverage.covered_target_count,
    input.expected.baseline_covered);
  assert.equal(candidate.effective_required_target_coverage.covered_target_count,
    input.expected.candidate_covered);
  assert.equal(candidate.effective_required_target_coverage.required_target_count,
    input.expected.required);
});

test('reserved holdout is evaluated three times deterministically after the scoring contract is fixed', async () => {
  const input = await fixture('GQ-RESERVED-PERMISSION-FLOW');
  const reports = Array.from({ length: manifest.evaluation_protocol.deterministic_repeats }, () =>
    evaluateIndependentTargets({ requiredTargets: input.required_targets, cases: input.cases }));
  assert.equal(new Set(reports.map(canonicalStringify)).size, 1);
  assert.equal(reports[0].hard_failure_status, input.expected.status);
  assert.equal(reports[0].effective_required_target_coverage.covered_target_count,
    input.expected.covered);
  assert.equal(reports[0].counts.duplicate_case_count, input.expected.duplicate_case_count);
});

test('metric contract fails closed for unknown fields, duplicate identities and unknown target references', async () => {
  const source = await fixture('GQ-AT25-COVERAGE');
  const mutations = [
    (/** @type {any} */ value) => { value.requiredTargets[0].unknown = true; },
    (/** @type {any} */ value) => { value.requiredTargets[1].target_id = value.requiredTargets[0].target_id; },
    (/** @type {any} */ value) => { value.cases[1].entry_id = value.cases[0].entry_id; },
    (/** @type {any} */ value) => { value.cases[0].target_ids = ['TARGET-UNKNOWN']; }
  ];
  for (const mutate of mutations) {
    const value = {
      requiredTargets: structuredClone(source.required_targets), cases: structuredClone(source.cases)
    };
    mutate(value);
    assert.throws(() => evaluateIndependentTargets(value), /GENERAL_QUALITY_METRIC_INPUT_INVALID/u);
  }
});
