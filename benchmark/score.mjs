import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import * as nodeUrl from 'node:url';
import { validateAgainstSchema } from '../src/schema-validator.mjs';
import { evaluateReleaseGates } from './gates.mjs';

const pathToFileURL = /** @type {any} */ (nodeUrl).pathToFileURL;
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const realpath = fsPromises.realpath;

export const BENCHMARK_SYSTEMS = Object.freeze([
  'long-prompt', 'test-case-designer', 'technique-router', 'generate-test-cases'
]);

export const BENCHMARK_STRATA = Object.freeze([
  'transaction/order/payment',
  'identity/role/permission',
  'workflow/approval/state',
  'form/configuration/input validation',
  'asynchronous integration/event',
  'time-window/quota/entitlement'
]);

const RISKS = Object.freeze(['critical', 'high', 'medium', 'low']);
const PROCESS_FAILURE_NAMES = Object.freeze([
  'silent_formal_test_point_loss', 'fixed_round_clarification_stop',
  'auto_repeat_unknown_or_deferred', 'old_revision_recovery'
]);
const PROVENANCE_FIELDS = Object.freeze([
  'skill_version', 'compiler_version', 'schema_version', 'model_id',
  'prompt_or_reference_id', 'baseline_version', 'benchmark_version',
  'source_digest', 'task_digest'
]);
const SYSTEM_PROVENANCE_FIELDS = Object.freeze([
  'skill_version', 'compiler_version', 'schema_version', 'model_id',
  'prompt_or_reference_id', 'baseline_version', 'benchmark_version'
]);
const OUTPUT_ARRAY_FIELDS = Object.freeze([
  'test_point_signatures', 'grounded_test_point_signatures', 'grounded_coverage_signatures',
  'blocked_test_point_signatures', 'grounded_assertions', 'grounded_cases',
  'detected_historical_defect_ids', 'killed_mutation_ids'
]);
const CAPTURE_EXTERNAL_FIELDS = Object.freeze([
  'capture_id', 'case_id', 'system', 'repeat', 'capture_kind', 'provenance',
  'review_time_minutes', 'raw_output_path', 'raw_output_digest', 'output'
]);
const CAPTURE_INTERNAL_FIELDS = Object.freeze(['_raw_output', '_raw_output_digest']);
const METRIC_NAMES = Object.freeze([
  'grounded_factual_support_precision', 'expert_critical_test_point_recall', 'expert_overall_test_point_recall',
  'grounded_no_material_rewrite_acceptance', 'historical_defect_recall', 'test_point_signature_jaccard',
  'grounded_coverage_signature_jaccard', 'false_grounded_rate', 'false_blocked_rate'
]);
const REQUIRED_ASSETS = Object.freeze([
  'task', 'expert_obligations', 'supported_assertions', 'accepted_cases',
  'historical_defects', 'clarification_scenarios'
]);

/** @param {number} numerator @param {number} denominator */
function ratioMetric(numerator, denominator) {
  if (denominator === 0) return {
    numerator, denominator, value: null,
    confidence_interval: { method: 'unavailable-zero-denominator', lower: null, upper: null }
  };
  const value = numerator / denominator;
  const z = 1.959963984540054;
  const z2 = z * z;
  const center = (value + z2 / (2 * denominator)) / (1 + z2 / denominator);
  const margin = z * Math.sqrt((value * (1 - value) / denominator) + (z2 / (4 * denominator * denominator))) / (1 + z2 / denominator);
  return {
    numerator, denominator, value,
    confidence_interval: { method: 'wilson-95', lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) }
  };
}

/** @param {number[]} samples */
function meanMetric(samples) {
  if (samples.length === 0) return {
    numerator: 0, denominator: 0, value: null,
    confidence_interval: { method: 'unavailable-zero-denominator', lower: null, upper: null }
  };
  const sum = samples.reduce((total, value) => total + value, 0);
  const value = sum / samples.length;
  if (samples.length === 1) return {
    numerator: sum, denominator: 1, value,
    confidence_interval: { method: 'unavailable-single-observation', lower: null, upper: null }
  };
  const variance = samples.reduce((total, sample) => total + ((sample - value) ** 2), 0) / (samples.length - 1);
  const margin = 1.959963984540054 * Math.sqrt(variance / samples.length);
  return {
    numerator: sum, denominator: samples.length, value,
    confidence_interval: { method: 'normal-approximation-95', lower: Math.max(0, value - margin), upper: Math.min(1, value + margin) }
  };
}

/** @param {Set<string>} left @param {Set<string>} right */
function jaccard(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return null;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}

/** @param {any} asset */
function finalLabelMap(asset) {
  const labels = Array.isArray(asset?.final_labels) ? asset.final_labels : [];
  return new Map(labels.filter((/** @type {any} */ item) => isRecord(item) && typeof item.label_key === 'string')
    .map((/** @type {any} */ item) => [item.label_key, item.value]));
}

/** @param {any[]} issues @param {string} code @param {string} pathValue @param {string} message */
function issue(issues, code, pathValue, message) {
  issues.push({ code, path: pathValue, message });
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** @param {unknown} value @param {readonly string[]} expected */
function hasExactKeys(value, expected) {
  return isRecord(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

/** @param {unknown} value */
function semanticDigest(value) {
  const serialized = semanticJson(value);
  return serialized === null ? null : createHash('sha256').update(serialized).digest('hex');
}

/** @param {unknown} value */
function semanticJson(value) {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
}

/** @param {unknown} value @returns {value is string} */
function isNonblankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** @param {unknown} value */
function isSafeRelativePath(value) {
  if (!isNonblankString(value) || path.isAbsolute(value)) return false;
  const segments = value.split(/[\\/]+/u);
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** @param {any[]} cases @param {any[]} issues */
function collectHistoricalDefects(cases, issues) {
  const byCase = new Map();
  const corpusIds = new Set();
  for (const [caseIndex, benchmarkCase] of cases.entries()) {
    const rows = benchmarkCase.assets?.historical_defects?.defects;
    if (!Array.isArray(rows)) {
      issue(issues, 'HISTORICAL_DEFECT_INVALID', `/cases/${caseIndex}/historical-defects`, 'Historical defects must be a dense array of traceable records.');
      byCase.set(benchmarkCase, []);
      continue;
    }
    const valid = [];
    for (const [defectIndex, row] of rows.entries()) {
      if (!isRecord(row) || !isNonblankString(row.defect_id) || !isRisk(row.risk) || !isNonblankString(row.source_ref)) {
        issue(issues, 'HISTORICAL_DEFECT_INVALID', `/cases/${caseIndex}/historical-defects/${defectIndex}`, 'Each historical defect requires a unique ID, valid risk, and traceable source.');
        continue;
      }
      if (corpusIds.has(row.defect_id)) {
        issue(issues, 'DUPLICATE_HISTORICAL_DEFECT_ID', `/cases/${caseIndex}/historical-defects/${defectIndex}/defect_id`, 'Historical defect IDs must be unique across the corpus.');
        continue;
      }
      corpusIds.add(row.defect_id);
      valid.push(row);
    }
    byCase.set(benchmarkCase, valid);
  }
  return byCase;
}

/** @param {any} snapshot */
function retainedLabelDigest(snapshot) {
  const payload = {
    label_version: snapshot.label_version,
    final_labels: snapshot.final_labels,
    expert_annotations: snapshot.expert_annotations,
    adjudications: snapshot.adjudications
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

/** @param {unknown} value */
function isRisk(value) {
  return RISKS.includes(/** @type {string} */ (value));
}

/** @param {Set<string>} left @param {Set<string>} right */
function setsEqual(left, right) {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

/** @param {any} value @param {'obligation'|'assertion'|'case'} kind */
function validLabelValue(value, kind) {
  if (!value || typeof value !== 'object' || !isRisk(value.risk)) return false;
  if (kind === 'obligation') return typeof value.expected === 'boolean' && typeof value.groundable === 'boolean';
  if (kind === 'assertion') return typeof value.supported === 'boolean' && typeof value.anchor_present === 'boolean' && typeof value.oracle === 'boolean';
  return typeof value.accepted_without_material_rewrite === 'boolean';
}

/** @param {any[]} issues @param {any} asset @param {string} pathValue @param {'obligation'|'assertion'|'case'} kind */
function validateLabeledAsset(issues, asset, pathValue, kind) {
  if (!asset || !Array.isArray(asset.final_labels) || !Array.isArray(asset.expert_annotations)) {
    issue(issues, 'EXPERT_LABELS_MISSING', pathValue, 'Final labels and two complete expert annotations are required.');
    return;
  }
  const semanticVersion = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
  if (typeof asset.label_version !== 'string' || !semanticVersion.test(asset.label_version) ||
      !(asset.correction_of === null || (typeof asset.correction_of === 'string' && semanticVersion.test(asset.correction_of) && asset.correction_of !== asset.label_version))) {
    issue(issues, 'LABEL_VERSION_INVALID', `${pathValue}/label_version`, 'Every hidden-label asset requires an immutable semantic version and explicit correction lineage.');
  }
  if (typeof asset.correction_of === 'string') {
    const snapshot = Array.isArray(asset.prior_versions) ? asset.prior_versions.find((/** @type {any} */ item) => item?.label_version === asset.correction_of) : null;
    const retainedAnnotations = Array.isArray(snapshot?.expert_annotations) ? snapshot.expert_annotations : [];
    const retainedExperts = retainedAnnotations.filter(isRecord);
    const retainedExpertIds = new Set(retainedExperts.map((/** @type {any} */ annotation) => annotation.expert_id));
    const retained = isRecord(snapshot) && Array.isArray(snapshot.final_labels) && retainedAnnotations.length === 2 && retainedExperts.length === 2 &&
      retainedExpertIds.size === 2 && retainedExperts.every((/** @type {any} */ annotation) =>
        isNonblankString(annotation.expert_id) && annotation.complete === true && Array.isArray(annotation.labels)) &&
      Array.isArray(snapshot.adjudications) && typeof snapshot.digest === 'string' && snapshot.digest === retainedLabelDigest(snapshot);
    if (!retained) issue(issues, 'LABEL_LINEAGE_MISSING', `${pathValue}/prior_versions`, 'A correction must retain a digest-verified prior label snapshot.');
  }
  const invalidCode = kind === 'obligation' ? 'OBLIGATION_LABEL_INVALID' : kind === 'assertion' ? 'ASSERTION_LABEL_INVALID' : 'CASE_LABEL_INVALID';
  for (const [index, label] of asset.final_labels.entries()) {
    if (typeof label?.label_key !== 'string' || !validLabelValue(label?.value, kind)) {
      issue(issues, invalidCode, `${pathValue}/final_labels/${index}`, 'Every final label must satisfy its typed hidden-label contract.');
    }
  }
  const final = finalLabelMap(asset);
  const annotations = asset.expert_annotations.filter(isRecord);
  const expertIds = new Set(annotations.map((/** @type {any} */ item) => item.expert_id));
  if (asset.expert_annotations.length !== 2 || annotations.length !== 2 || expertIds.size !== 2 || annotations.some((/** @type {any} */ item) =>
    !isNonblankString(item.expert_id) || item.complete !== true || !Array.isArray(item.labels))) {
    issue(issues, 'EXPERT_ANNOTATIONS_INCOMPLETE', pathValue, 'Exactly two independent complete expert annotations are required.');
  }
  const maps = annotations.map((/** @type {any} */ annotation) => finalLabelMap({ final_labels: annotation.labels }));
  if (final.size !== asset.final_labels.length || maps.some((/** @type {Map<string, any>} */ map, /** @type {number} */ index) =>
    map.size !== (annotations[index].labels?.length ?? -1) || map.size !== final.size || [...final.keys()].some((key) => !map.has(key)))) {
    issue(issues, 'EXPERT_ANNOTATIONS_INCOMPLETE', pathValue, 'Final and expert label sets must contain the same unique label keys.');
  }
  for (const [annotationIndex, annotation] of annotations.entries()) for (const [labelIndex, label] of (Array.isArray(annotation.labels) ? annotation.labels : []).entries()) {
    if (typeof label?.label_key !== 'string' || !validLabelValue(label?.value, kind)) {
      issue(issues, invalidCode, `${pathValue}/expert_annotations/${annotationIndex}/labels/${labelIndex}`, 'Every expert label must satisfy its typed hidden-label contract.');
    }
  }
  for (const key of final.keys()) {
    if (maps.some((/** @type {Map<string, any>} */ map) => !map.has(key))) issue(issues, 'EXPERT_ANNOTATIONS_INCOMPLETE', `${pathValue}/${key}`, 'Every expert must label every final item.');
    const serialized = maps.map((/** @type {Map<string, any>} */ map) => JSON.stringify(map.get(key)));
    if (new Set(serialized).size > 1) {
      const adjudication = (Array.isArray(asset.adjudications) ? asset.adjudications : []).find((/** @type {any} */ item) => item?.label_key === key && item.completed === true);
      if (!adjudication || JSON.stringify(adjudication.resolved_value) !== JSON.stringify(final.get(key))) {
        issue(issues, 'ADJUDICATION_MISSING', `${pathValue}/${key}`, 'Every expert disagreement requires a completed matching adjudication.');
      } else {
        const recordedValues = (Array.isArray(adjudication.expert_values) ? adjudication.expert_values : [])
          .map((/** @type {any} */ value) => JSON.stringify(value)).sort();
        const validRecord = recordedValues.length === 2 && JSON.stringify(recordedValues) === JSON.stringify([...serialized].sort()) &&
          typeof adjudication.adjudicator === 'string' && adjudication.adjudicator.length > 0 &&
          typeof adjudication.completed_at === 'string' && adjudication.completed_at.length > 0 &&
          typeof adjudication.rationale === 'string' && adjudication.rationale.length > 0;
        if (!validRecord) issue(issues, 'ADJUDICATION_INVALID', `${pathValue}/${key}`, 'Adjudication must retain both expert values, adjudicator, completion time, and rationale.');
      }
    } else if (serialized[0] !== JSON.stringify(final.get(key))) {
      issue(issues, 'FINAL_LABEL_UNSUPPORTED', `${pathValue}/${key}`, 'The final label must equal expert agreement or a completed adjudication.');
    }
  }
}

/** @param {any} benchmarkCase @param {string | null} risk */
function obligationsFor(benchmarkCase, risk) {
  return [...finalLabelMap(benchmarkCase?.assets?.expert_obligations)].map(([signature, value]) => ({ signature, ...value }))
    .filter((item) => risk === null || item.risk === risk);
}

/** @param {any[]} cases @param {any[]} runs @param {Map<any, any[]>} historicalByCase @param {string} system @param {string | null} risk */
function scoreCohort(cases, runs, historicalByCase, system, risk = null) {
  let supported = 0;
  let assertions = 0;
  let criticalFound = 0;
  let criticalExpected = 0;
  let overallFound = 0;
  let overallExpected = 0;
  let accepted = 0;
  let reviewedCases = 0;
  let defectsFound = 0;
  let defectsExpected = 0;
  let falseGrounded = 0;
  let groundedTotal = 0;
  let falseBlocked = 0;
  let blockedTotal = 0;
  /** @type {Map<number, Set<string>>} */
  const testPointsByRepeat = new Map();
  /** @type {Map<number, Set<string>>} */
  const groundedCoverageByRepeat = new Map();

  for (const benchmarkCase of cases) {
    const obligationLabels = obligationsFor(benchmarkCase, risk);
    const obligationMap = new Map(obligationLabels.map((item) => [item.signature, item]));
    const allObligationMap = new Map(obligationsFor(benchmarkCase, null).map((item) => [item.signature, item]));
    const assertionMap = finalLabelMap(benchmarkCase.assets?.supported_assertions);
    const caseMap = finalLabelMap(benchmarkCase.assets?.accepted_cases);
    const defects = (historicalByCase.get(benchmarkCase) ?? []).filter(
      (/** @type {any} */ item) => risk === null || item.risk === risk
    );
    const defectIds = new Set(defects.map((/** @type {any} */ item) => item.defect_id));
    const caseRuns = runs.filter((run) => run.system === system && run.case_id === benchmarkCase.case_id);
    for (const run of caseRuns) {
      const generated = new Set(run.output.test_point_signatures.filter((/** @type {string} */ signature) => obligationMap.has(signature)));
      const expected = obligationLabels.filter((item) => item.expected === true);
      overallExpected += expected.length;
      overallFound += expected.filter((item) => generated.has(item.signature)).length;
      const critical = expected.filter((item) => item.risk === 'critical');
      criticalExpected += critical.length;
      criticalFound += critical.filter((item) => generated.has(item.signature)).length;

      for (const [labelKey, value] of assertionMap) {
        if (!labelKey.startsWith(`${run.capture_id}::`) || (risk !== null && value.risk !== risk)) continue;
        assertions += 1;
        if (value.supported === true) supported += 1;
      }
      for (const [labelKey, value] of caseMap) {
        if (!labelKey.startsWith(`${run.capture_id}::`) || (risk !== null && value.risk !== risk)) continue;
        reviewedCases += 1;
        if (value.accepted_without_material_rewrite === true) accepted += 1;
      }
      defectsExpected += defects.length;
      defectsFound += [...new Set(run.output.detected_historical_defect_ids)].filter((id) => defectIds.has(id)).length;

      for (const signature of run.output.grounded_test_point_signatures) {
        const value = obligationMap.get(signature);
        if (!value) continue;
        groundedTotal += 1;
        if (value.groundable !== true) falseGrounded += 1;
      }
      for (const signature of run.output.blocked_test_point_signatures) {
        const value = obligationMap.get(signature);
        if (!value) continue;
        blockedTotal += 1;
        if (value.groundable === true) falseBlocked += 1;
      }

      const testSet = testPointsByRepeat.get(run.repeat) ?? new Set();
      for (const signature of run.output.test_point_signatures) {
        const label = allObligationMap.get(signature);
        if (risk === null || !label || label.risk === risk) testSet.add(`${benchmarkCase.case_id}::${signature}`);
      }
      testPointsByRepeat.set(run.repeat, testSet);
      const coverageSet = groundedCoverageByRepeat.get(run.repeat) ?? new Set();
      for (const signature of run.output.grounded_coverage_signatures) {
        const label = allObligationMap.get(signature);
        if (risk === null || !label || label.risk === risk) coverageSet.add(`${benchmarkCase.case_id}::${signature}`);
      }
      groundedCoverageByRepeat.set(run.repeat, coverageSet);
    }
  }

  /** @param {Map<number, Set<string>>} sets */
  function stability(sets) {
    const samples = [];
    for (const [left, right] of [[1, 2], [1, 3], [2, 3]]) {
      const value = jaccard(sets.get(left) ?? new Set(), sets.get(right) ?? new Set());
      if (value !== null) samples.push(value);
    }
    return meanMetric(samples);
  }

  return {
    grounded_factual_support_precision: ratioMetric(supported, assertions),
    expert_critical_test_point_recall: ratioMetric(criticalFound, criticalExpected),
    expert_overall_test_point_recall: ratioMetric(overallFound, overallExpected),
    grounded_no_material_rewrite_acceptance: ratioMetric(accepted, reviewedCases),
    historical_defect_recall: ratioMetric(defectsFound, defectsExpected),
    test_point_signature_jaccard: stability(testPointsByRepeat),
    grounded_coverage_signature_jaccard: stability(groundedCoverageByRepeat),
    false_grounded_rate: ratioMetric(falseGrounded, groundedTotal),
    false_blocked_rate: ratioMetric(falseBlocked, blockedTotal)
  };
}

/** @param {any} manifest @param {any[]} capturedRuns */
export function scoreBenchmark(manifest, capturedRuns) {
  const rawCases = Array.isArray(manifest?.cases) ? manifest.cases : [];
  const rawRuns = Array.isArray(capturedRuns) ? capturedRuns : [];
  /** @type {any[]} */
  const issues = [];

  for (const [caseIndex, benchmarkCase] of rawCases.entries()) {
    if (!isRecord(benchmarkCase)) issue(issues, 'CASE_RECORD_INVALID', `/cases/${caseIndex}`, 'Every corpus entry must be a benchmark case object.');
  }
  for (const [runIndex, run] of rawRuns.entries()) {
    if (!isRecord(run)) issue(issues, 'CAPTURE_RECORD_INVALID', `/captured_runs/${runIndex}`, 'Every captured run must be a capture object.');
  }
  const cases = rawCases.filter(isRecord);
  const runs = rawRuns.filter(isRecord);

  for (const loadIssue of Array.isArray(manifest?.load_issues) ? manifest.load_issues : []) {
    issue(issues, loadIssue.code ?? 'BENCHMARK_ASSET_LOAD_FAILED', loadIssue.path ?? '/', loadIssue.message ?? 'A benchmark input could not be loaded.');
  }

  if (JSON.stringify(manifest?.systems) !== JSON.stringify(BENCHMARK_SYSTEMS)) issue(issues, 'SYSTEM_ENUM_INVALID', '/systems', 'Systems must be the exact frozen four-system enum.');
  if (manifest?.repeats_per_system !== 3) issue(issues, 'REPEAT_COUNT_INVALID', '/repeats_per_system', 'Exactly three independent runs are required.');
  if (manifest?.evidence_class !== 'external-expert-corpus') issue(issues, 'RELEASE_EVIDENCE_CLASS_INELIGIBLE', '/evidence_class', 'Synthetic pilot fixtures are never release evidence.');
  const expectedProvenance = manifest?.expected_provenance;
  if (!hasExactKeys(expectedProvenance, BENCHMARK_SYSTEMS) || BENCHMARK_SYSTEMS.some((system) => {
    const expected = expectedProvenance?.[system];
    return !hasExactKeys(expected, SYSTEM_PROVENANCE_FIELDS) || SYSTEM_PROVENANCE_FIELDS.some((field) =>
      !isNonblankString(expected[field]) || (field === 'benchmark_version' && expected[field] !== manifest?.benchmark_version));
  })) issue(issues, 'EXPECTED_PROVENANCE_INVALID', '/expected_provenance', 'The manifest must freeze one exact provenance identity for every system.');
  const strata = Array.isArray(manifest?.strata) ? manifest.strata : [];
  if (strata.length !== BENCHMARK_STRATA.length || BENCHMARK_STRATA.some((stratum) => {
    const matches = strata.filter((/** @type {any} */ item) => item?.stratum === stratum);
    return matches.length !== 1 || matches[0].minimum_prds !== 5 || matches[0].minimum_critical_obligations !== 3 ||
      matches[0].minimum_clarification_prds !== 2 || matches[0].minimum_historical_defects !== 5;
  })) issue(issues, 'STRATA_CONTRACT_INVALID', '/strata', 'The manifest must contain the exact frozen six-stratum V1 contract.');

  const historicalByCase = collectHistoricalDefects(cases, issues);

  for (const stratum of BENCHMARK_STRATA) {
    const stratumCases = cases.filter((/** @type {any} */ item) => item.stratum === stratum);
    if (stratumCases.length < 5) issue(issues, 'STRATUM_PRD_MINIMUM_NOT_MET', `/strata/${stratum}`, 'Each stratum requires at least five PRDs.');
    const critical = stratumCases.reduce((/** @type {number} */ total, /** @type {any} */ item) => total + obligationsFor(item, 'critical').filter((obligation) => obligation.expected === true).length, 0);
    if (critical < 3) issue(issues, 'STRATUM_CRITICAL_MINIMUM_NOT_MET', `/strata/${stratum}`, 'Each stratum requires at least three expert critical Test Points.');
    const clarificationCount = stratumCases.filter((/** @type {any} */ item) => {
      const scenarios = item.assets?.clarification_scenarios?.scenarios;
      return Array.isArray(scenarios) && scenarios.some((/** @type {any} */ scenario) => scenario?.required === true);
    }).length;
    if (clarificationCount < 2) issue(issues, 'STRATUM_CLARIFICATION_MINIMUM_NOT_MET', `/strata/${stratum}`, 'Each stratum requires two clarification-required PRDs.');
    const defectCount = stratumCases.reduce((/** @type {number} */ total, /** @type {any} */ item) => {
      return total + (historicalByCase.get(item)?.length ?? 0);
    }, 0);
    if (defectCount < 5) issue(issues, 'STRATUM_DEFECT_MINIMUM_NOT_MET', `/strata/${stratum}`, 'Each stratum requires five traceable historical defects.');
  }
  if (cases.length < 30) issue(issues, 'CORPUS_PRD_MINIMUM_NOT_MET', '/cases', 'V1 requires at least 30 PRDs.');

  const seenCaseIds = new Set();
  const seenSourceDigests = new Set();
  for (const [caseIndex, benchmarkCase] of cases.entries()) {
    if (seenCaseIds.has(benchmarkCase.case_id)) issue(issues, 'DUPLICATE_CASE_ID', `/cases/${caseIndex}/case_id`, 'Every PRD must have a unique case ID.');
    seenCaseIds.add(benchmarkCase.case_id);
    const sourceDigest = benchmarkCase.assets?.sources?.digest;
    if (isNonblankString(sourceDigest)) {
      if (seenSourceDigests.has(sourceDigest)) issue(issues, 'DUPLICATE_SOURCE_IDENTITY', `/cases/${caseIndex}/sources/digest`, 'Each PRD must have a unique immutable source identity.');
      seenSourceDigests.add(sourceDigest);
    }
  }

  for (const [caseIndex, benchmarkCase] of cases.entries()) {
    for (const asset of REQUIRED_ASSETS) if (!benchmarkCase.assets?.[asset]) issue(issues, 'CASE_ASSET_MISSING', `/cases/${caseIndex}/assets/${asset}`, 'Every case requires the complete frozen asset set.');
    validateLabeledAsset(issues, benchmarkCase.assets?.expert_obligations, `/cases/${caseIndex}/expert-obligations`, 'obligation');
    validateLabeledAsset(issues, benchmarkCase.assets?.supported_assertions, `/cases/${caseIndex}/supported-assertions`, 'assertion');
    validateLabeledAsset(issues, benchmarkCase.assets?.accepted_cases, `/cases/${caseIndex}/accepted-cases`, 'case');
    const sourceFiles = benchmarkCase.assets?.sources?.files;
    const sourcePaths = benchmarkCase.assets?.task?.source_paths;
    if (!Array.isArray(sourceFiles) || sourceFiles.length === 0 || !Array.isArray(sourcePaths) || sourcePaths.length === 0 ||
        JSON.stringify([...sourceFiles].sort()) !== JSON.stringify([...sourcePaths].sort()) || benchmarkCase.assets?.task?.case_id !== benchmarkCase.case_id) {
      issue(issues, 'CASE_SOURCE_TASK_BINDING_INVALID', `/cases/${caseIndex}/sources`, 'Task scope must bind this case to a non-empty, exact source-file set.');
    }
    const mutations = benchmarkCase.assets?.business_model_mutations?.mutations;
    if (benchmarkCase.high_risk === true && (!Array.isArray(mutations) || mutations.length === 0)) {
      issue(issues, 'HIGH_RISK_MUTATIONS_MISSING', `/cases/${caseIndex}/business-model-mutations`, 'Every high-risk PRD requires a non-empty offline business-model mutation set.');
    } else if (Array.isArray(mutations)) {
      const ids = mutations.map((/** @type {any} */ mutation) => mutation?.mutation_id);
      if (ids.some((id) => typeof id !== 'string' || id.length === 0) || new Set(ids).size !== ids.length) {
        issue(issues, 'HIGH_RISK_MUTATIONS_INVALID', `/cases/${caseIndex}/business-model-mutations`, 'Mutation IDs must be non-empty and unique.');
      }
    }
    for (const system of BENCHMARK_SYSTEMS) for (let repeat = 1; repeat <= 3; repeat += 1) {
      const matches = runs.filter((run) => run.case_id === benchmarkCase.case_id && run.system === system && run.repeat === repeat);
      if (matches.length !== 1) issue(issues, 'CAPTURE_RUN_MISSING', `/cases/${caseIndex}/captures/${system}/${repeat}`, 'Every PRD requires one capture for every system and repeat.');
    }
  }

  /** @type {any[]} */
  const scorableRuns = [];
  const seenCaptureIds = new Set();
  const seenRawOutputPaths = new Set();
  for (const [runIndex, run] of runs.entries()) {
    const capturePath = `/captured_runs/${runIndex}`;
    if (!hasExactKeys(run, [...CAPTURE_EXTERNAL_FIELDS, ...CAPTURE_INTERNAL_FIELDS]) ||
        !hasExactKeys(run.provenance, [...PROVENANCE_FIELDS, 'repeat'])) {
      issue(issues, 'CAPTURE_SCHEMA_INVALID', capturePath, 'Captured artifacts use a closed schema and may not contain hidden labels, prior diagnostics, or unknown fields.');
      continue;
    }
    if (typeof run.capture_id !== 'string' || run.capture_id.length === 0 || seenCaptureIds.has(run.capture_id)) {
      issue(issues, 'DUPLICATE_CAPTURE_ID', `${capturePath}/capture_id`, 'Every capture must have one unique non-empty identity.');
    }
    seenCaptureIds.add(run.capture_id);
    if (!BENCHMARK_SYSTEMS.includes(run.system) || ![1, 2, 3].includes(run.repeat)) issue(issues, 'CAPTURE_IDENTITY_INVALID', capturePath, 'Capture system and repeat must use the frozen contract.');
    if (run.capture_kind !== 'external-captured') issue(issues, 'CAPTURE_EVIDENCE_INELIGIBLE', `${capturePath}/capture_kind`, 'Synthetic outputs cannot satisfy release completeness.');
    for (const field of PROVENANCE_FIELDS) if (!isNonblankString(run.provenance[field])) issue(issues, 'CAPTURE_PROVENANCE_MISSING', `${capturePath}/provenance/${field}`, 'Complete capture provenance is required.');
    if (typeof run.review_time_minutes !== 'number' || !Number.isFinite(run.review_time_minutes) || run.review_time_minutes < 0) issue(issues, 'CAPTURE_REVIEW_TIME_MISSING', `${capturePath}/review_time_minutes`, 'Every captured output records review time.');
    const expected = expectedProvenance?.[run.system];
    const systemProvenanceMatches = hasExactKeys(expected, SYSTEM_PROVENANCE_FIELDS) && SYSTEM_PROVENANCE_FIELDS.every((field) => run.provenance[field] === expected[field]);
    if (run.provenance.repeat !== run.repeat || !systemProvenanceMatches) {
      issue(issues, 'CAPTURE_PROVENANCE_MISMATCH', `${capturePath}/provenance`, 'Every capture must match the manifest-frozen identity for its system and repeat.');
      continue;
    }
    const benchmarkCase = cases.find((/** @type {any} */ item) => item.case_id === run.case_id);
    const arraysValid = OUTPUT_ARRAY_FIELDS.every((field) => Array.isArray(run.output?.[field]) && run.output[field].every((/** @type {any} */ value) => typeof value === 'string'));
    if (!benchmarkCase || !run.output || !arraysValid) {
      issue(issues, 'CAPTURE_OUTPUT_INVALID', `${capturePath}/output`, 'Every capture must bind one manifest case and contain the complete offline output shape.');
      continue;
    }
    if (Object.keys(run.output).some((field) => ![...OUTPUT_ARRAY_FIELDS, 'process_failures'].includes(field))) {
      issue(issues, 'CAPTURE_SCHEMA_INVALID', `${capturePath}/output`, 'Captured output summaries may contain only the frozen metric and process fields.');
      continue;
    }
    const duplicateOutputField = OUTPUT_ARRAY_FIELDS.find((field) => new Set(run.output[field]).size !== run.output[field].length);
    if (duplicateOutputField) {
      issue(issues, 'CAPTURE_OUTPUT_DUPLICATE_ID', `${capturePath}/output/${duplicateOutputField}`, 'Every captured output ID/signature array must contain unique values.');
    }
    const processValid = run.output.process_failures && PROCESS_FAILURE_NAMES.every((name) => typeof run.output.process_failures[name] === 'boolean');
    if (!processValid) {
      issue(issues, 'PROCESS_TELEMETRY_MISSING', `${capturePath}/output/process_failures`, 'All four exact process-failure observations are mandatory booleans.');
      continue;
    }
    if (JSON.stringify(Object.keys(run.output.process_failures).sort()) !== JSON.stringify([...PROCESS_FAILURE_NAMES].sort())) {
      issue(issues, 'PROCESS_TELEMETRY_INVALID', `${capturePath}/output/process_failures`, 'Process telemetry may contain only the four frozen failure observations.');
      continue;
    }
    const rawOutputJson = semanticJson(run._raw_output);
    const scoredOutputJson = semanticJson(run.output);
    const rawOutputIdentity = `${run.case_id}::${run.raw_output_path}`;
    const rawBindingValid = rawOutputJson !== null && scoredOutputJson !== null && isSafeRelativePath(run.raw_output_path) && /^[a-f0-9]{64}$/u.test(run.raw_output_digest) &&
      run._raw_output_digest === run.raw_output_digest && semanticDigest(run._raw_output) === run.raw_output_digest &&
      rawOutputJson === scoredOutputJson && !seenRawOutputPaths.has(rawOutputIdentity);
    if (!rawBindingValid) {
      issue(issues, 'CAPTURE_RAW_OUTPUT_INVALID', `${capturePath}/raw_output_path`, 'A local raw-output path and verified digest must bind the exact scored summary.');
      continue;
    }
    seenRawOutputPaths.add(rawOutputIdentity);
    if (run.provenance?.source_digest !== benchmarkCase.assets?.sources?.digest || run.provenance?.task_digest !== benchmarkCase.assets?.task_digest) {
      issue(issues, 'CAPTURE_SOURCE_TASK_MISMATCH', `${capturePath}/provenance`, 'Capture provenance must bind the immutable source and task digests.');
      continue;
    }
    scorableRuns.push(run);
    const obligationLabels = finalLabelMap(benchmarkCase.assets?.expert_obligations);
    for (const lane of ['test_point_signatures', 'grounded_test_point_signatures', 'grounded_coverage_signatures', 'blocked_test_point_signatures']) {
      for (const signature of run.output[lane]) if (!obligationLabels.has(signature)) issue(issues, 'CAPTURE_TEST_POINT_LABEL_MISSING', `${capturePath}/output/${lane}/${signature}`, 'Every generated or coverage Test Point must have two hidden expert labels.');
    }
    const assertionLabels = finalLabelMap(benchmarkCase.assets?.supported_assertions);
    for (const assertionId of run.output.grounded_assertions) if (!assertionLabels.has(`${run.capture_id}::${assertionId}`)) issue(issues, 'CAPTURE_ASSERTION_LABEL_MISSING', `${capturePath}/output/grounded_assertions/${assertionId}`, 'Every Grounded assertion requires two independent hidden support labels.');
    const acceptedLabels = finalLabelMap(benchmarkCase.assets?.accepted_cases);
    for (const caseId of run.output.grounded_cases) if (!acceptedLabels.has(`${run.capture_id}::${caseId}`)) issue(issues, 'CAPTURE_CASE_LABEL_MISSING', `${capturePath}/output/grounded_cases/${caseId}`, 'Every Grounded Case requires two independent hidden acceptance labels.');
  }

  for (const [caseIndex, benchmarkCase] of cases.entries()) {
    const caseRuns = scorableRuns.filter((run) => run.case_id === benchmarkCase.case_id);
    const assertionOutputs = new Set(caseRuns.flatMap((run) => run.output.grounded_assertions.map((/** @type {string} */ id) => `${run.capture_id}::${id}`)));
    const assertionLabels = new Set(finalLabelMap(benchmarkCase.assets?.supported_assertions).keys());
    if (!setsEqual(assertionOutputs, assertionLabels)) {
      issue(issues, 'CAPTURE_ASSERTION_LABEL_CLOSURE_INVALID', `/cases/${caseIndex}/supported-assertions`, 'Grounded assertion outputs and capture-scoped hidden labels must form one exact bidirectional set.');
    }
    const caseOutputs = new Set(caseRuns.flatMap((run) => run.output.grounded_cases.map((/** @type {string} */ id) => `${run.capture_id}::${id}`)));
    const caseLabels = new Set(finalLabelMap(benchmarkCase.assets?.accepted_cases).keys());
    if (!setsEqual(caseOutputs, caseLabels)) {
      issue(issues, 'CAPTURE_CASE_LABEL_CLOSURE_INVALID', `/cases/${caseIndex}/accepted-cases`, 'Grounded Case outputs and capture-scoped hidden labels must form one exact bidirectional set.');
    }
  }

  const domains = [...new Set(cases.map((/** @type {any} */ item) => item.domain))].sort();
  /** @type {Record<string, any>} */
  const systems = {};
  for (const system of BENCHMARK_SYSTEMS) {
    systems[system] = {
      overall: scoreCohort(cases, scorableRuns, historicalByCase, system),
      by_domain: Object.fromEntries(domains.map((domain) => [domain, scoreCohort(cases.filter((/** @type {any} */ item) => item.domain === domain), scorableRuns, historicalByCase, system)])),
      by_risk: Object.fromEntries(RISKS.map((risk) => [risk, scoreCohort(cases, scorableRuns, historicalByCase, system, risk)])),
      by_domain_and_risk: Object.fromEntries(domains.map((domain) => [domain, Object.fromEntries(RISKS.map((risk) => [
        risk, scoreCohort(cases.filter((/** @type {any} */ item) => item.domain === domain), scorableRuns, historicalByCase, system, risk)
      ]))]))
    };
  }

  /** @param {any} metrics @param {string} metricPath @param {boolean} requireCritical */
  function validateDenominators(metrics, metricPath, requireCritical) {
    for (const name of METRIC_NAMES) {
      if (!requireCritical && name === 'expert_critical_test_point_recall') continue;
      if (metrics[name].denominator === 0) issue(issues, 'MANDATORY_METRIC_ZERO_DENOMINATOR', `${metricPath}/${name}`, 'Mandatory cohort metrics may not coerce a zero denominator.');
    }
  }
  for (const system of BENCHMARK_SYSTEMS) {
    const report = systems[system];
    validateDenominators(report.overall, `/systems/${system}/overall`, true);
    for (const [domain, metrics] of Object.entries(report.by_domain)) validateDenominators(metrics, `/systems/${system}/by_domain/${domain}`, true);
    for (const [risk, metrics] of Object.entries(report.by_risk)) validateDenominators(metrics, `/systems/${system}/by_risk/${risk}`, risk === 'critical');
    for (const [domain, riskReports] of Object.entries(report.by_domain_and_risk)) for (const [risk, metrics] of Object.entries(/** @type {any} */ (riskReports))) {
      validateDenominators(metrics, `/systems/${system}/by_domain_and_risk/${domain}/${risk}`, risk === 'critical');
    }
  }

  let unsupportedOracleCount = 0;
  /** @type {Record<string, number>} */
  const processFailures = Object.fromEntries(PROCESS_FAILURE_NAMES.map((name) => [name, 0]));
  let mutationsKilled = 0;
  let mutationsObserved = 0;
  for (const run of scorableRuns.filter((/** @type {any} */ item) => item.system === 'generate-test-cases')) {
    const benchmarkCase = cases.find((/** @type {any} */ item) => item.case_id === run.case_id);
    if (!benchmarkCase) continue;
    const assertions = finalLabelMap(benchmarkCase.assets?.supported_assertions);
    for (const [labelKey, value] of assertions) {
      if (!labelKey.startsWith(`${run.capture_id}::`)) continue;
      if (value?.oracle === true && value.supported !== true && ['critical', 'high'].includes(value.risk)) unsupportedOracleCount += 1;
    }
    for (const name of PROCESS_FAILURE_NAMES) if (run.output.process_failures?.[name] === true) processFailures[name] += 1;
    const mutations = benchmarkCase.assets?.business_model_mutations?.mutations;
    const mutationIds = new Set((Array.isArray(mutations) ? mutations : []).map((/** @type {any} */ item) => item?.mutation_id));
    mutationsObserved += mutationIds.size;
    mutationsKilled += [...new Set(run.output.killed_mutation_ids)].filter((id) => mutationIds.has(id)).length;
  }

  return {
    benchmark_version: manifest?.benchmark_version ?? null,
    completeness: { status: issues.length === 0 ? 'complete' : 'insufficient_evidence', issues },
    systems,
    unsupported_critical_high_grounded_oracle_count: unsupportedOracleCount,
    process_failures: processFailures,
    mutation_kill_signal: { release_gate: false, overall: ratioMetric(mutationsKilled, mutationsObserved) }
  };
}

/** @param {string} filename */
async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

/** @param {string} directory @param {string} root @returns {Promise<string[]>} */
async function listSourceFiles(directory, root = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(absolute, root));
    else if (entry.isFile()) files.push(path.relative(path.dirname(root), absolute).split(path.sep).join('/'));
  }
  return files.sort();
}

/** @param {string} directory */
async function assertNoSymlinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Symlink is not allowed in benchmark evidence: ${path.join(directory, entry.name)}`);
    if (entry.isDirectory()) await assertNoSymlinks(path.join(directory, entry.name));
  }
}

/** @param {string} root @param {string} candidate */
function isPathInside(root, candidate) {
  return `${candidate}${path.sep}`.startsWith(`${root}${path.sep}`);
}

/** @param {string} left @param {string} right */
function pathsOverlap(left, right) {
  return left === right || isPathInside(left, right) || isPathInside(right, left);
}

/** @param {string} caseRoot @param {string[]} files */
async function digestSources(caseRoot, files) {
  const hash = createHash('sha256');
  for (const filename of files) {
    hash.update(filename);
    hash.update('\0');
    hash.update(await readFile(path.join(caseRoot, filename)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** @template T @param {T} value @param {WeakSet<object>} [seen] @returns {T} */
function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const item of Object.values(value)) deepFreeze(item, seen);
  return Object.freeze(value);
}

/** @param {string} manifestPath */
export async function loadBenchmarkInputs(manifestPath) {
  const absoluteManifest = path.resolve(manifestPath);
  const benchmarkRoot = path.dirname(absoluteManifest);
  const raw = await readJson(absoluteManifest);
  const manifestSchema = await readJson(path.join(path.dirname(nodeUrl.fileURLToPath(import.meta.url)), 'manifest.schema.json'));
  const schemaDiagnostics = validateAgainstSchema(raw, manifestSchema);
  const loadIssues = schemaDiagnostics.map((diagnostic) => ({
    code: 'MANIFEST_SCHEMA_INVALID', path: diagnostic.path,
    message: `${diagnostic.code}: ${diagnostic.message}`
  }));
  const cases = [];
  /** @type {any[]} */
  const capturedRuns = [];
  if (schemaDiagnostics.length > 0) {
    return {
      manifest: deepFreeze({ ...raw, cases: [], load_issues: loadIssues }),
      capturedRuns: deepFreeze(capturedRuns)
    };
  }
  const expectedCaseRoot = path.resolve(benchmarkRoot, 'cases');
  const expectedCaptureRoot = path.resolve(benchmarkRoot, 'captured');
  let realCaseRoot;
  let realCaptureRoot;
  try {
    const realBenchmarkRoot = await realpath(benchmarkRoot);
    const caseRootStat = await fsPromises.lstat(expectedCaseRoot);
    const captureRootStat = await fsPromises.lstat(expectedCaptureRoot);
    if (caseRootStat.isSymbolicLink() || captureRootStat.isSymbolicLink() || !caseRootStat.isDirectory() || !captureRootStat.isDirectory()) {
      throw new Error('Top-level benchmark evidence roots must be real directories, never symlinks.');
    }
    realCaseRoot = await realpath(expectedCaseRoot);
    realCaptureRoot = await realpath(expectedCaptureRoot);
    if (!isPathInside(realBenchmarkRoot, realCaseRoot) || !isPathInside(realBenchmarkRoot, realCaptureRoot) || pathsOverlap(realCaseRoot, realCaptureRoot)) {
      throw new Error('Resolved cases and captured roots must be separate descendants of the real benchmark root.');
    }
  } catch (error) {
    loadIssues.push({ code: 'BENCHMARK_PATH_INVALID', path: '/', message: error instanceof Error ? error.message : String(error) });
    return { manifest: deepFreeze({ ...raw, cases: [], load_issues: loadIssues }), capturedRuns: deepFreeze(capturedRuns) };
  }
  for (const [caseIndex, item] of (raw.cases ?? []).entries()) {
    const caseRoot = path.resolve(benchmarkRoot, item.case_directory);
    const captureRoot = path.resolve(benchmarkRoot, item.capture_directory);
    if (!isPathInside(expectedCaseRoot, caseRoot) || !isPathInside(expectedCaptureRoot, captureRoot)) {
      loadIssues.push({ code: 'BENCHMARK_PATH_INVALID', path: `/cases/${caseIndex}`, message: `Benchmark case ${item.case_id} crosses the frozen hidden-label/capture boundary.` });
      continue;
    }
    let realCase;
    let realCapture;
    try {
      const caseStat = await fsPromises.lstat(caseRoot);
      const captureStat = await fsPromises.lstat(captureRoot);
      if (caseStat.isSymbolicLink() || captureStat.isSymbolicLink() || !caseStat.isDirectory() || !captureStat.isDirectory()) {
        throw new Error('Per-case label and capture roots must be real directories, never symlinks.');
      }
      realCase = await realpath(caseRoot);
      realCapture = await realpath(captureRoot);
      if (!isPathInside(realCaseRoot, realCase) || !isPathInside(realCaptureRoot, realCapture) || pathsOverlap(realCase, realCapture)) {
        throw new Error('Benchmark path resolves outside or overlaps its frozen evidence root.');
      }
      await assertNoSymlinks(caseRoot);
      await assertNoSymlinks(captureRoot);
    } catch (error) {
      loadIssues.push({ code: 'BENCHMARK_PATH_INVALID', path: `/cases/${caseIndex}`, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    /** @type {any} */
    const assets = {};
    const assetFiles = {
      task: 'task.json', expert_obligations: 'expert-obligations.json',
      supported_assertions: 'supported-assertions.json', accepted_cases: 'accepted-cases.json',
      historical_defects: 'historical-defects.json', clarification_scenarios: 'clarification-scenarios.json'
    };
    for (const [asset, filename] of Object.entries(assetFiles)) {
      try { assets[asset] = await readJson(path.join(caseRoot, filename)); } catch (error) {
        loadIssues.push({ code: 'BENCHMARK_ASSET_LOAD_FAILED', path: `/cases/${caseIndex}/${filename}`, message: error instanceof Error ? error.message : String(error) });
      }
    }
    try { assets.business_model_mutations = await readJson(path.join(caseRoot, 'business-model-mutations.json')); } catch (error) {
      assets.business_model_mutations = { mutations: [] };
      if (item.high_risk === true) loadIssues.push({ code: 'HIGH_RISK_MUTATIONS_MISSING', path: `/cases/${caseIndex}/business-model-mutations.json`, message: error instanceof Error ? error.message : String(error) });
    }
    try {
      const sourceFiles = await listSourceFiles(path.join(caseRoot, 'sources'));
      assets.sources = { files: sourceFiles, digest: await digestSources(caseRoot, sourceFiles) };
      assets.task_digest = createHash('sha256').update(await readFile(path.join(caseRoot, 'task.json'))).digest('hex');
    } catch (error) {
      loadIssues.push({ code: 'CASE_SOURCE_TASK_BINDING_INVALID', path: `/cases/${caseIndex}/sources`, message: error instanceof Error ? error.message : String(error) });
    }
    cases.push({ ...item, assets });
    let captureFiles = [];
    try { captureFiles = (await readdir(captureRoot)).filter((/** @type {string} */ filename) => filename.endsWith('.json')).sort(); } catch (error) {
      loadIssues.push({ code: 'CAPTURE_RUN_MISSING', path: `/cases/${caseIndex}/captures`, message: error instanceof Error ? error.message : String(error) });
    }
    for (const filename of captureFiles) {
      try {
        const run = await readJson(path.join(captureRoot, filename));
        if (CAPTURE_INTERNAL_FIELDS.some((field) => Object.hasOwn(run, field))) {
          loadIssues.push({ code: 'CAPTURE_SCHEMA_INVALID', path: `/cases/${caseIndex}/captures/${filename}`, message: 'Capture files may not provide scorer-owned raw evidence fields.' });
        }
        let rawOutput = null;
        let rawOutputDigest = null;
        try {
          if (!isSafeRelativePath(run.raw_output_path)) throw new Error('Raw output path must be a safe relative path beneath its capture root.');
          const rawPath = path.resolve(captureRoot, run.raw_output_path);
          if (!isPathInside(captureRoot, rawPath)) throw new Error('Raw output path resolves outside its capture root.');
          const realRawPath = await realpath(rawPath);
          if (!isPathInside(realCapture, realRawPath)) throw new Error('Raw output path resolves outside the real captured evidence root.');
          rawOutput = await readJson(realRawPath);
          rawOutputDigest = semanticDigest(rawOutput);
        } catch (error) {
          loadIssues.push({ code: 'CAPTURE_RAW_OUTPUT_INVALID', path: `/cases/${caseIndex}/captures/${filename}/raw_output_path`, message: error instanceof Error ? error.message : String(error) });
        }
        capturedRuns.push({ ...run, _raw_output: rawOutput, _raw_output_digest: rawOutputDigest });
      } catch (error) {
        loadIssues.push({ code: 'CAPTURE_OUTPUT_INVALID', path: `/cases/${caseIndex}/captures/${filename}`, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { manifest: deepFreeze({ ...raw, cases, load_issues: loadIssues }), capturedRuns: deepFreeze(capturedRuns) };
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) throw new Error('Usage: node benchmark/score.mjs <manifest.json>');
  const { manifest, capturedRuns } = await loadBenchmarkInputs(manifestPath);
  const metrics = scoreBenchmark(manifest, capturedRuns);
  const gate = evaluateReleaseGates(metrics);
  process.stdout.write(`${JSON.stringify({ status: gate.status, failures: gate.failures, metrics })}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
