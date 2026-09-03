import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { validateReleaseCorpus } from './release-corpus.mjs';
import { verifyCaptureTranscript } from './replay-capture.mjs';
import { materializeCandidateRuntime } from './candidate-runtime.mjs';
import {
  deriveCandidateBinding,
  reconcileCandidateBindings,
  verifyCandidateEvidenceBytes
} from './score.mjs';

const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const lstat = fsPromises.lstat;
const realpath = fsPromises.realpath;
const execFileAsync = promisify(execFile);

export const RELEASE_STRATA = Object.freeze([
  'transaction/order/payment',
  'identity/role/permission',
  'workflow/approval/state',
  'form/configuration/input validation',
  'asynchronous integration/event',
  'time-window/quota/entitlement'
]);

const POLICY_KEYS = Object.freeze([
  'schema_version',
  'policy_id',
  'evidence_class',
  'system',
  'repeats_per_case',
  'required_case_count',
  'strata'
]);
const CASE_KEYS = Object.freeze([
  'case_id', 'stratum', 'source_sha256', 'task_sha256', 'task_scope',
  'source_id', 'repository', 'commit', 'source_path'
]);
const CANDIDATE_KEYS = Object.freeze([
  'valid', 'clean', 'repository_revision', 'artifact_digests'
]);
const ARTIFACT_KEYS = Object.freeze(['compiler', 'schema', 'schema_manifest', 'skill', 'bundle']);
const CAPTURE_KEYS = Object.freeze([
  'capture_id',
  'case_id',
  'system',
  'repeat',
  'session_id',
  'source_sha256',
  'task_sha256',
  'candidate_revision',
  'artifact_digests',
  'raw_output_sha256',
  'run_directory_sha256',
  'final_bundle_sha256',
  'replay_bundle_sha256',
  'evidence_valid',
  'terminal_status',
  'process_failures'
]);
const PROCESS_FAILURE_KEYS = Object.freeze([
  'runner_protocol_violation',
  'source_revision_mismatch',
  'schema_invalid',
  'traceability_integrity_failure'
]);
const MANIFEST_KEYS = Object.freeze([...POLICY_KEYS, 'corpus_catalog', 'capture_ledger']);
const DESCRIPTOR_KEYS = Object.freeze(['repository_path', 'sha256']);
const LEDGER_KEYS = Object.freeze(['schema_version', 'ledger_id', 'policy_id', 'system', 'captures']);
const LEDGER_CAPTURE_KEYS = Object.freeze([
  'capture_id',
  'case_id',
  'system',
  'repeat',
  'session_id',
  'source_sha256',
  'task_sha256',
  'runtime_revision',
  'artifact_digests',
  'transcript'
]);
const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const DEFAULT_REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const MAX_RETAINED_ARTIFACT_BYTES = 64 * 1024 * 1024;

/** @param {unknown} value @returns {value is Record<string, any>} */
function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @param {readonly string[]} keys */
function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** @param {unknown} value */
function isNonblankString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

/** @param {unknown} value */
function isDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

/** @param {unknown} value */
function isArtifactDigests(value) {
  return isRecord(value)
    && hasExactKeys(value, ARTIFACT_KEYS)
    && ARTIFACT_KEYS.every((key) => isDigest(value[key]));
}

/** @param {unknown} left @param {unknown} right */
function sameArtifactDigests(left, right) {
  return isRecord(left)
    && isRecord(right)
    && isArtifactDigests(left)
    && isArtifactDigests(right)
    && ARTIFACT_KEYS.every((key) => left[key] === right[key]);
}

/**
 * Evaluate the release decision from already loaded and byte-verified evidence.
 * File-system evidence is deliberately loaded by a separate boundary; callers
 * cannot turn a capture into valid evidence merely by declaring it complete.
 *
 * @param {any} input
 */
export function evaluateSingleSystemRelease(input) {
  /** @type {{code:string,path:string,message:string,severity:'fail'|'incomplete'}[]} */
  const issues = [];
  /** @param {string} code @param {string} path @param {string} message */
  const fail = (code, path, message) => issues.push({ code, path, message, severity: 'fail' });
  /** @param {string} code @param {string} path @param {string} message */
  const incomplete = (code, path, message) => issues.push({ code, path, message, severity: 'incomplete' });

  const policy = input?.policy;
  if (!hasExactKeys(policy, POLICY_KEYS)) {
    fail('RELEASE_POLICY_CONTRACT_INVALID', '/policy', 'Release policy must use the closed single-system contract.');
  } else {
    if (policy.schema_version !== '1.0.0'
      || policy.policy_id !== 'generate-test-cases-single-system-public-prd-v1'
      || policy.evidence_class !== 'public-prd-single-system'
      || policy.system !== 'generate-test-cases'
      || policy.repeats_per_case !== 3
      || policy.required_case_count !== 30) {
      fail('RELEASE_POLICY_CONTRACT_INVALID', '/policy', 'Release policy constants do not match the approved single-system standard.');
    }
    /** @type {any[]} */
    const strata = Array.isArray(policy.strata) ? policy.strata : [];
    const validStrata = strata.length === RELEASE_STRATA.length && strata.every((entry, index) =>
      hasExactKeys(entry, ['stratum', 'minimum_cases'])
      && entry.stratum === RELEASE_STRATA[index]
      && entry.minimum_cases === 5
    );
    if (!validStrata) fail('RELEASE_POLICY_CONTRACT_INVALID', '/policy/strata', 'Every frozen stratum must require exactly five cases.');
  }

  const corpus = input?.corpus;
  const corpusCases = Array.isArray(corpus?.cases) ? corpus.cases : [];
  if (corpus?.valid !== true) incomplete('CORPUS_EVIDENCE_UNAVAILABLE', '/corpus', 'The retained public corpus is not fully byte-verified.');
  if (corpusCases.length !== 30) {
    incomplete('REQUIRED_CASE_COUNT_NOT_MET', '/corpus/cases', 'Exactly 30 retained public PRDs are required.');
  }

  const byStratum = Object.fromEntries(RELEASE_STRATA.map((stratum) => [stratum, 0]));
  const caseIndex = new Map();
  for (const [index, caseValue] of corpusCases.entries()) {
    const path = `/corpus/cases/${index}`;
    if (!hasExactKeys(caseValue, CASE_KEYS)
      || !isNonblankString(caseValue.case_id)
      || !RELEASE_STRATA.includes(caseValue.stratum)
      || !isDigest(caseValue.source_sha256)
      || !isDigest(caseValue.task_sha256)
      || !isNonblankString(caseValue.task_scope)
      || !isNonblankString(caseValue.source_id)
      || !isNonblankString(caseValue.repository)
      || typeof caseValue.commit !== 'string' || !REVISION.test(caseValue.commit)
      || !isNonblankString(caseValue.source_path)) {
      fail('CORPUS_CASE_INVALID', path, 'Corpus cases must use the closed source-bound contract.');
      continue;
    }
    if (caseIndex.has(caseValue.case_id)) {
      fail('CORPUS_CASE_DUPLICATE', `${path}/case_id`, 'Corpus case IDs must be unique.');
      continue;
    }
    caseIndex.set(caseValue.case_id, caseValue);
    byStratum[caseValue.stratum] += 1;
  }
  for (const stratum of RELEASE_STRATA) {
    if (byStratum[stratum] !== 5) {
      incomplete('STRATUM_CASE_MINIMUM_NOT_MET', `/corpus/by_stratum/${stratum}`, 'Each stratum requires exactly five retained PRDs.');
    }
  }

  const candidate = input?.candidate;
  const candidateContractValid = hasExactKeys(candidate, CANDIDATE_KEYS)
    && typeof candidate.valid === 'boolean'
    && typeof candidate.clean === 'boolean'
    && typeof candidate.repository_revision === 'string'
    && REVISION.test(candidate.repository_revision)
    && isArtifactDigests(candidate.artifact_digests);
  if (!candidateContractValid) {
    fail('CANDIDATE_BINDING_INVALID', '/candidate', 'Candidate binding must identify one clean revision and the five frozen artifact digests.');
  } else if (!candidate.valid || !candidate.clean) {
    incomplete('CANDIDATE_EVIDENCE_UNAVAILABLE', '/candidate', 'A clean byte-verified candidate is required.');
  }

  const captures = Array.isArray(input?.captures) ? input.captures : [];
  if (captures.length !== 90) {
    incomplete('CAPTURE_SET_INCOMPLETE', '/captures', 'Exactly 90 captures are required: three for each of 30 cases.');
  }
  const captureIds = new Set();
  const sessionIds = new Set();
  const repeatsByCase = new Map([...caseIndex.keys()].map((caseId) => [caseId, new Set()]));
  let completedCaptures = 0;

  for (const [index, capture] of captures.entries()) {
    const path = `/captures/${index}`;
    if (!hasExactKeys(capture, CAPTURE_KEYS)) {
      fail('CAPTURE_CONTRACT_INVALID', path, 'Capture must use the closed single-system evidence contract.');
      continue;
    }
    if (!isNonblankString(capture.capture_id) || captureIds.has(capture.capture_id)) {
      fail('CAPTURE_ID_DUPLICATE', `${path}/capture_id`, 'Capture IDs must be nonblank and globally unique.');
    } else captureIds.add(capture.capture_id);
    if (!isNonblankString(capture.session_id) || sessionIds.has(capture.session_id)) {
      fail('CAPTURE_SESSION_DUPLICATE', `${path}/session_id`, 'Every capture requires a distinct session identity.');
    } else sessionIds.add(capture.session_id);

    const caseValue = caseIndex.get(capture.case_id);
    if (!caseValue || capture.system !== 'generate-test-cases' || ![1, 2, 3].includes(capture.repeat)) {
      fail('CAPTURE_IDENTITY_INVALID', path, 'Capture must identify one known case, the target system, and repeat 1, 2, or 3.');
    } else {
      const repeats = repeatsByCase.get(capture.case_id);
      if (!repeats) fail('CAPTURE_IDENTITY_INVALID', path, 'Capture case has no repeat ledger.');
      else if (repeats.has(capture.repeat)) fail('CAPTURE_REPEAT_DUPLICATE', `${path}/repeat`, 'A case can contain each repeat exactly once.');
      else repeats.add(capture.repeat);
    }

    if (!caseValue
      || capture.source_sha256 !== caseValue.source_sha256
      || capture.task_sha256 !== caseValue.task_sha256) {
      fail('CAPTURE_INPUT_BINDING_INVALID', path, 'Capture source and task digests must match the retained case.');
    }
    if (!candidateContractValid
      || capture.candidate_revision !== candidate.repository_revision
      || !sameArtifactDigests(capture.artifact_digests, candidate.artifact_digests)) {
      fail('CAPTURE_CANDIDATE_BINDING_INVALID', path, 'Capture must bind to the exact evaluated candidate artifacts.');
    }
    if (![capture.raw_output_sha256, capture.run_directory_sha256, capture.final_bundle_sha256, capture.replay_bundle_sha256].every(isDigest)) {
      fail('CAPTURE_DIGEST_INVALID', path, 'Capture evidence must provide lowercase SHA-256 digests.');
    }
    if (capture.evidence_valid !== true) {
      incomplete('CAPTURE_EVIDENCE_UNAVAILABLE', path, 'Capture evidence bytes were not fully verified by the loader.');
    }
    if (capture.terminal_status !== 'completed') {
      incomplete('CAPTURE_NOT_COMPLETED', `${path}/terminal_status`, 'Every release capture must finish with a complete test bundle.');
    } else completedCaptures += 1;
    if (capture.final_bundle_sha256 !== capture.replay_bundle_sha256) {
      fail('CAPTURE_REPLAY_MISMATCH', path, 'Re-invoking the completed durable run must reproduce the same bundle digest.');
    }
    if (!hasExactKeys(capture.process_failures, PROCESS_FAILURE_KEYS)
      || PROCESS_FAILURE_KEYS.some((key) => typeof capture.process_failures?.[key] !== 'boolean')) {
      fail('PROCESS_FAILURE_CONTRACT_INVALID', `${path}/process_failures`, 'Process failure observations must use the closed boolean contract.');
    } else if (PROCESS_FAILURE_KEYS.some((key) => capture.process_failures[key])) {
      fail('PROCESS_HARD_FAILURE', `${path}/process_failures`, 'An observed protocol, revision, schema, or traceability failure blocks release.');
    }
  }

  for (const [caseId, repeats] of repeatsByCase) {
    if (repeats.size !== 3 || ![1, 2, 3].every((repeat) => repeats.has(repeat))) {
      incomplete('CAPTURE_SET_INCOMPLETE', `/captures/by_case/${caseId}`, 'Each case requires repeats 1, 2, and 3 exactly once.');
    }
  }

  issues.sort((left, right) => `${left.path}\0${left.code}`.localeCompare(`${right.path}\0${right.code}`));
  const status = issues.some((issue) => issue.severity === 'fail')
    ? 'fail'
    : issues.some((issue) => issue.severity === 'incomplete')
      ? 'insufficient_evidence'
      : 'pass';

  return Object.freeze({
    status,
    release_eligible: status === 'pass',
    policy_id: 'generate-test-cases-single-system-public-prd-v1',
    system: 'generate-test-cases',
    counts: Object.freeze({
      cases: corpusCases.length,
      captures: captures.length,
      completed_captures: completedCaptures,
      by_stratum: Object.freeze({ ...byStratum })
    }),
    issues: Object.freeze(issues.map((issue) => Object.freeze({ ...issue })))
  });
}

/** @param {string} value */
function isSafeRepositoryPath(value) {
  if (!isNonblankString(value) || path.isAbsolute(value) || value.includes('\\')) return false;
  const parts = value.split('/');
  return parts.length > 1 && parts.every((part) => part.length > 0 && part !== '.' && part !== '..');
}

/** @param {string} root @param {string} candidate */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {any} bytes */
function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {any[]} captures */
function canonicalCaptureEvidence(captures) {
  return JSON.stringify([...captures]
    .sort((left, right) => left.capture_id.localeCompare(right.capture_id))
    .map((capture) => ({
      capture_id: capture.capture_id,
      runtime_revision: capture.runtime_revision,
      transcript_sha256: capture.transcript_sha256,
      reply_sequence_sha256: capture.run_directory_sha256,
      final_bundle_sha256: capture.final_bundle_sha256,
      replay_bundle_sha256: capture.replay_bundle_sha256
    })));
}

/**
 * A capture may precede the evidence commit, but only when the evaluated
 * production artifacts are byte-identical and its revision is an ancestor.
 * @param {string} repositoryRoot
 * @param {string} runtimeRevision
 * @param {string} finalRevision
 */
async function verifyRuntimeRevision(repositoryRoot, runtimeRevision, finalRevision) {
  await execFileAsync('git', ['merge-base', '--is-ancestor', runtimeRevision, finalRevision], {
    cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
  });
  await execFileAsync('git', [
    'diff', '--quiet', runtimeRevision, finalRevision, '--',
    'src',
    'skill/generate-test-cases/SKILL.md',
    'skill/generate-test-cases/references',
    'skill/generate-test-cases/scripts'
  ], {
    cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
  });
}

/**
 * @param {string} repositoryRoot
 * @param {any} descriptor
 * @param {any} candidateBinding
 * @param {Set<string>} physicalPaths
 */
async function readBoundArtifact(repositoryRoot, descriptor, candidateBinding, physicalPaths, maxBytes = MAX_RETAINED_ARTIFACT_BYTES) {
  if (!hasExactKeys(descriptor, DESCRIPTOR_KEYS)
    || !isSafeRepositoryPath(descriptor.repository_path)
    || !isDigest(descriptor.sha256)) {
    throw new Error('Retained artifact descriptor is invalid.');
  }
  const rootReal = await realpath(repositoryRoot);
  const filename = path.resolve(repositoryRoot, descriptor.repository_path);
  const entry = await lstat(filename);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1 || entry.size > maxBytes) {
    throw new Error('Retained artifact must be a regular singly linked file.');
  }
  const filenameReal = await realpath(filename);
  const expectedReal = path.resolve(rootReal, descriptor.repository_path);
  if (!isInside(rootReal, filenameReal) || filenameReal !== expectedReal || physicalPaths.has(filenameReal)) {
    throw new Error('Retained artifact escaped or reused its physical path.');
  }
  physicalPaths.add(filenameReal);
  const bytes = await readFile(filenameReal);
  if (digest(bytes) !== descriptor.sha256) throw new Error('Retained artifact digest mismatch.');
  if (candidateBinding?.worktree_clean === true) {
    await verifyCandidateEvidenceBytes(repositoryRoot, candidateBinding.final_candidate_sha, filenameReal, bytes);
  }
  return bytes;
}

/** @param {string} code @param {string} message */
function loadFailureReport(code, message) {
  return Object.freeze({
    status: 'fail',
    release_eligible: false,
    policy_id: 'generate-test-cases-single-system-public-prd-v1',
    system: 'generate-test-cases',
    counts: Object.freeze({
      cases: 0,
      captures: 0,
      completed_captures: 0,
      by_stratum: Object.freeze(Object.fromEntries(RELEASE_STRATA.map((stratum) => [stratum, 0])))
    }),
    issues: Object.freeze([Object.freeze({ code, path: '/', message, severity: 'fail' })])
  });
}

/** @param {any} binding */
function candidateForEvaluation(binding) {
  const revision = typeof binding?.final_candidate_sha === 'string' && REVISION.test(binding.final_candidate_sha)
    ? binding.final_candidate_sha
    : '0'.repeat(40);
  /** @type {Record<string, any>} */
  const values = {
    compiler: binding?.compiler_sha256,
    schema: binding?.schema_sha256,
    schema_manifest: binding?.schema_manifest_sha256,
    skill: binding?.skill_sha256,
    bundle: binding?.bundle_sha256
  };
  const valid = ARTIFACT_KEYS.every((key) => isDigest(values[key])) && revision !== '0'.repeat(40);
  return {
    valid,
    clean: valid && binding?.worktree_clean === true,
    repository_revision: revision,
    artifact_digests: Object.fromEntries(ARTIFACT_KEYS.map((key) => [key, isDigest(values[key]) ? values[key] : '0'.repeat(64)]))
  };
}

/** @param {any} manifest */
function policyFromManifest(manifest) {
  return Object.fromEntries(POLICY_KEYS.map((key) => [key, manifest?.[key]]));
}

/** @param {any} report @param {any[]} loadIssues */
function mergeLoadIssues(report, loadIssues) {
  if (loadIssues.length === 0) return report;
  const issues = [...report.issues, ...loadIssues]
    .sort((left, right) => `${left.path}\0${left.code}`.localeCompare(`${right.path}\0${right.code}`));
  const status = issues.some((issue) => issue.severity === 'fail')
    ? 'fail'
    : issues.some((issue) => issue.severity === 'incomplete')
      ? 'insufficient_evidence'
      : 'pass';
  return Object.freeze({
    ...report,
    status,
    release_eligible: status === 'pass',
    issues: Object.freeze(issues.map((issue) => Object.freeze({ ...issue })))
  });
}

/**
 * Load the approved single-system release evidence from one candidate checkout.
 * @param {string} manifestPath
 * @param {string} [candidateRoot]
 */
export async function loadSingleSystemRelease(manifestPath, candidateRoot = DEFAULT_REPOSITORY_ROOT) {
  if (!isNonblankString(manifestPath) || !isNonblankString(candidateRoot)) {
    return loadFailureReport('RELEASE_PATH_INVALID', 'Manifest and candidate root paths are required.');
  }
  const repositoryRoot = path.resolve(candidateRoot);
  const absoluteManifest = path.resolve(manifestPath);
  const relativeManifest = path.relative(repositoryRoot, absoluteManifest);
  if (!isInside(repositoryRoot, absoluteManifest) || relativeManifest.split(path.sep).includes('..')) {
    return loadFailureReport('RELEASE_PATH_INVALID', 'Release manifest must stay inside the candidate checkout.');
  }

  /** @type {any} */
  let manifest;
  /** @type {string} */
  let manifestDigest;
  try {
    const manifestEntry = await lstat(absoluteManifest);
    if (manifestEntry.isSymbolicLink() || !manifestEntry.isFile() || manifestEntry.nlink !== 1) throw new Error('Manifest is not a regular singly linked file.');
    const manifestBytes = await readFile(absoluteManifest);
    manifestDigest = digest(manifestBytes);
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    return loadFailureReport('RELEASE_MANIFEST_UNREADABLE', `Cannot load release manifest: ${/** @type {any} */ (error).message ?? 'unknown error'}`);
  }
  if (!hasExactKeys(manifest, MANIFEST_KEYS)) {
    return loadFailureReport('RELEASE_MANIFEST_INVALID', 'Release manifest must use the closed single-system contract.');
  }

  const initialBinding = await deriveCandidateBinding(absoluteManifest, manifestDigest, repositoryRoot);
  const physicalPaths = new Set([await realpath(absoluteManifest)]);
  /** @type {any[]} */
  const loadIssues = [];
  let catalog;
  /** @type {any} */
  let catalogReport;
  let ledger;
  /** @type {any|null} */
  let ledgerBytes = null;
  try {
    const catalogBytes = await readBoundArtifact(repositoryRoot, manifest.corpus_catalog, initialBinding, physicalPaths);
    catalog = JSON.parse(catalogBytes.toString('utf8'));
    catalogReport = await validateReleaseCorpus(
      path.resolve(repositoryRoot, manifest.corpus_catalog.repository_path),
      repositoryRoot,
      initialBinding
    );
    for (const issue of catalogReport.issues) loadIssues.push({
      code: issue.code,
      path: `/corpus_catalog/file${issue.path}`,
      message: issue.message,
      severity: issue.severity === 'error' ? 'fail' : 'incomplete'
    });
  } catch (error) {
    loadIssues.push({
      code: 'CORPUS_EVIDENCE_INVALID', path: '/corpus_catalog',
      message: `Cannot validate retained corpus: ${/** @type {any} */ (error).message ?? 'unknown error'}`,
      severity: 'fail'
    });
    catalog = { items: [] };
    catalogReport = { status: 'invalid', counts: { pilot_admitted: 0, by_stratum: {} }, issues: [] };
  }
  try {
    ledgerBytes = await readBoundArtifact(repositoryRoot, manifest.capture_ledger, initialBinding, physicalPaths);
    ledger = JSON.parse(ledgerBytes.toString('utf8'));
  } catch (error) {
    loadIssues.push({
      code: 'CAPTURE_LEDGER_INVALID', path: '/capture_ledger',
      message: `Cannot load capture ledger: ${/** @type {any} */ (error).message ?? 'unknown error'}`,
      severity: 'fail'
    });
    ledger = { captures: [] };
  }

  if (!hasExactKeys(ledger, LEDGER_KEYS)
    || ledger.schema_version !== '1.0.0'
    || ledger.ledger_id !== 'generate-test-cases-single-system-captures-v1'
    || ledger.policy_id !== manifest.policy_id
    || ledger.system !== 'generate-test-cases'
    || !Array.isArray(ledger.captures)) {
    loadIssues.push({
      code: 'CAPTURE_LEDGER_CONTRACT_INVALID', path: '/capture_ledger/file',
      message: 'Capture ledger must use the closed single-system contract.', severity: 'fail'
    });
  }

  const corpusCases = Array.isArray(catalogReport?.cases) ? catalogReport.cases : [];
  const corpusValid = catalogReport?.status === 'valid';

  /** @type {any[]} */
  const verifiedCaptures = [];
  const corpusIndex = new Map(corpusCases.map((/** @type {any} */ caseValue) => [caseValue.case_id, caseValue]));
  let candidateRuntime = null;
  try {
    if (!initialBinding.final_candidate_sha) throw new Error('Candidate revision is unavailable.');
    candidateRuntime = await materializeCandidateRuntime(repositoryRoot, initialBinding.final_candidate_sha);
  } catch (error) {
    loadIssues.push({
      code: 'CANDIDATE_RUNTIME_INVALID', path: '/candidate',
      message: `Cannot materialize the frozen candidate runtime: ${/** @type {any} */ (error).message ?? 'unknown error'}`,
      severity: 'fail'
    });
  }
  const runtimeRevisionChecks = new Map();
  const ledgerCaptures = Array.isArray(ledger.captures) ? ledger.captures : [];
  if (ledgerCaptures.length > 90) loadIssues.push({
    code: 'CAPTURE_LEDGER_TOO_LARGE', path: '/capture_ledger/file/captures',
    message: 'Capture ledger cannot contain more than the required 90 records.', severity: 'fail'
  });
  for (const [index, record] of ledgerCaptures.slice(0, 90).entries()) {
    const recordPath = `/capture_ledger/file/captures/${index}`;
    if (!hasExactKeys(record, LEDGER_CAPTURE_KEYS)
      || !isArtifactDigests(record.artifact_digests)
      || typeof record.runtime_revision !== 'string' || !REVISION.test(record.runtime_revision)) {
      loadIssues.push({
        code: 'CAPTURE_EVIDENCE_FORGED', path: recordPath,
        message: 'Capture ledger record is not a replayable, revision-bound transcript descriptor.', severity: 'fail'
      });
      continue;
    }
    const caseValue = corpusIndex.get(record.case_id);
    try {
      if (!caseValue) throw new Error('Capture case is not present in the verified corpus.');
      if (!candidateRuntime) throw new Error('Frozen candidate runtime is unavailable.');
      if (!initialBinding.final_candidate_sha) throw new Error('Candidate revision is unavailable.');
      if (!runtimeRevisionChecks.has(record.runtime_revision)) {
        runtimeRevisionChecks.set(record.runtime_revision, verifyRuntimeRevision(
          repositoryRoot, record.runtime_revision, initialBinding.final_candidate_sha
        ));
      }
      await runtimeRevisionChecks.get(record.runtime_revision);
      const transcriptBytes = await readBoundArtifact(
        repositoryRoot, record.transcript, initialBinding, physicalPaths, 16 * 1024 * 1024
      );
      const replay = await verifyCaptureTranscript({
        transcriptBytes,
        expected: record,
        candidateRoot: repositoryRoot,
        runnerPath: candidateRuntime.runnerPath,
        replySchemaPath: candidateRuntime.replySchemaPath,
        bundleSchemaPath: candidateRuntime.bundleSchemaPath,
        taskContract: {
          scope: caseValue.task_scope,
          task_sha256: caseValue.task_sha256,
          source_path: caseValue.source_path
        },
        sourceContract: {
          source_id: caseValue.source_id,
          repository: caseValue.repository,
          commit: caseValue.commit,
          source_sha256: caseValue.source_sha256
        }
      });
      verifiedCaptures.push({
        capture_id: record.capture_id,
        case_id: record.case_id,
        system: record.system,
        repeat: record.repeat,
        session_id: record.session_id,
        source_sha256: record.source_sha256,
        task_sha256: record.task_sha256,
        runtime_revision: record.runtime_revision,
        artifact_digests: record.artifact_digests,
        transcript_sha256: replay.transcript_sha256,
        run_directory_sha256: replay.reply_sequence_sha256,
        final_bundle_sha256: replay.final_bundle_sha256,
        replay_bundle_sha256: replay.replay_bundle_sha256,
        evidence_valid: true,
        terminal_status: 'completed',
        process_failures: Object.fromEntries(PROCESS_FAILURE_KEYS.map((key) => [key, false]))
      });
    } catch (error) {
      loadIssues.push({
        code: 'CAPTURE_EVIDENCE_FORGED', path: recordPath,
        message: `Capture cannot be reproduced from retained runner evidence: ${/** @type {any} */ (error).message ?? 'unknown error'}`, severity: 'fail'
      });
    }
  }

  if (candidateRuntime) await candidateRuntime.cleanup();

  const finalBinding = await deriveCandidateBinding(absoluteManifest, manifestDigest, repositoryRoot);
  const reconciledBinding = reconcileCandidateBindings(initialBinding, finalBinding);
  const candidate = candidateForEvaluation(reconciledBinding);
  const captures = verifiedCaptures.map((capture) => ({
    capture_id: capture.capture_id,
    case_id: capture.case_id,
    system: capture.system,
    repeat: capture.repeat,
    session_id: capture.session_id,
    source_sha256: capture.source_sha256,
    task_sha256: capture.task_sha256,
    candidate_revision: candidate.repository_revision,
    artifact_digests: capture.artifact_digests,
    raw_output_sha256: capture.transcript_sha256,
    run_directory_sha256: capture.run_directory_sha256,
    final_bundle_sha256: capture.final_bundle_sha256,
    replay_bundle_sha256: capture.replay_bundle_sha256,
    evidence_valid: capture.evidence_valid,
    terminal_status: capture.terminal_status,
    process_failures: capture.process_failures
  }));

  const report = evaluateSingleSystemRelease({
    policy: policyFromManifest(manifest),
    corpus: { valid: corpusValid, cases: corpusCases },
    candidate,
    captures
  });
  const merged = mergeLoadIssues(report, loadIssues);
  const evidenceBinding = {
    release_manifest_sha256: manifestDigest,
    corpus_catalog_sha256: manifest.corpus_catalog.sha256,
    corpus_content_sha256: catalogReport?.corpus_digest ?? '0'.repeat(64),
    capture_ledger_sha256: ledgerBytes ? digest(ledgerBytes) : '0'.repeat(64),
    capture_evidence_root_sha256: digest(canonicalCaptureEvidence(verifiedCaptures))
  };
  return Object.freeze({
    ...merged,
    candidate_binding: Object.freeze({ ...reconciledBinding }),
    evidence_binding: Object.freeze(evidenceBinding)
  });
}

async function main() {
  if (process.argv.length !== 3) {
    process.stdout.write(`${JSON.stringify(loadFailureReport('RELEASE_ARGUMENTS_INVALID', 'Exactly one release manifest path is required.'))}\n`);
    return;
  }
  const report = await loadSingleSystemRelease(process.argv[2]);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify(loadFailureReport('RELEASE_INTERNAL_ERROR', error instanceof Error ? error.message : String(error)))}\n`);
  });
}
