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
const CASE_KEYS = Object.freeze(['case_id', 'stratum', 'source_sha256', 'task_sha256']);
const CANDIDATE_KEYS = Object.freeze([
  'valid', 'clean', 'repository_revision', 'artifact_digests'
]);
const ARTIFACT_KEYS = Object.freeze(['skill', 'compiler', 'schema_manifest', 'bundle']);
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
const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;

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
      || !isDigest(caseValue.task_sha256)) {
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
    fail('CANDIDATE_BINDING_INVALID', '/candidate', 'Candidate binding must identify one clean revision and the four frozen artifact digests.');
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
