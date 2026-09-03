import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  RELEASE_STRATA,
  evaluateSingleSystemRelease,
  loadSingleSystemRelease
} from '../../benchmark/single-system-gate.mjs';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checkedInManifest = path.join(repositoryRoot, 'benchmark/release/v1/manifest.json');
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));

/** @param {string} value */
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_C = 'c'.repeat(64);
const SHA_D = 'd'.repeat(64);
const SHA_E = 'e'.repeat(64);
const REVISION = '1'.repeat(40);

function passingInput() {
  const cases = [];
  const captures = [];
  for (const [stratumIndex, stratum] of RELEASE_STRATA.entries()) {
    for (let caseIndex = 1; caseIndex <= 5; caseIndex += 1) {
      const caseId = `case-${stratumIndex + 1}-${caseIndex}`;
      const sourceSha256 = `${stratumIndex + 1}`.repeat(64);
      const taskSha256 = `${caseIndex}`.repeat(64);
      cases.push({
        case_id: caseId,
        stratum,
        source_sha256: sourceSha256,
        task_sha256: taskSha256,
        task_scope: `scope-${caseId}`,
        source_id: `source-${caseId}`,
        repository: `example/project-${caseId}`,
        commit: `${(stratumIndex + 1).toString(16)}`.repeat(40),
        source_path: `cases/${caseId}/source/prd.md`
      });
      for (let repeat = 1; repeat <= 3; repeat += 1) {
        captures.push({
          capture_id: `${caseId}-capture-${repeat}`,
          case_id: caseId,
          system: 'generate-test-cases',
          repeat,
          session_id: `${caseId}-session-${repeat}`,
          source_sha256: sourceSha256,
          task_sha256: taskSha256,
          candidate_revision: REVISION,
          artifact_digests: {
            compiler: SHA_A,
            schema: SHA_B,
            schema_manifest: SHA_C,
            skill: SHA_D,
            bundle: SHA_E
          },
          raw_output_sha256: SHA_A,
          run_directory_sha256: SHA_B,
          final_bundle_sha256: SHA_C,
          replay_bundle_sha256: SHA_C,
          evidence_valid: true,
          terminal_status: 'completed',
          process_failures: {
            runner_protocol_violation: false,
            source_revision_mismatch: false,
            schema_invalid: false,
            traceability_integrity_failure: false
          },
          operator_witness: {
            method: 'operator-observed-codex-subagent-v1', operator_task_id: '/root',
            agent_task_id: '/root/test-worker', observation_id: `${caseId}-observation-${repeat}`
          }
        });
      }
    }
  }
  return {
    policy: {
      schema_version: '1.0.0',
      policy_id: 'generate-test-cases-single-system-public-prd-v1',
      evidence_class: 'public-prd-single-system',
      system: 'generate-test-cases',
      repeats_per_case: 3,
      required_case_count: 30,
      strata: RELEASE_STRATA.map((stratum) => ({ stratum, minimum_cases: 5 }))
    },
    corpus: { valid: true, cases },
    candidate: {
      valid: true,
      clean: true,
      repository_revision: REVISION,
      artifact_digests: {
        compiler: SHA_A,
        schema: SHA_B,
        schema_manifest: SHA_C,
        skill: SHA_D,
        bundle: SHA_E
      }
    },
    captures
  };
}

test('single-system release passes only 30 real PRDs across six strata with three bound target runs', () => {
  const report = evaluateSingleSystemRelease(passingInput());

  assert.equal(report.status, 'pass');
  assert.equal(report.release_eligible, true);
  assert.equal(report.system, 'generate-test-cases');
  assert.deepEqual(report.counts, {
    cases: 30,
    captures: 90,
    completed_captures: 90,
    by_stratum: Object.fromEntries(RELEASE_STRATA.map((stratum) => [stratum, 5]))
  });
  assert.deepEqual(report.issues, []);
  assert.equal('comparators' in report, false);
  assert.equal('experts' in report, false);
  assert.equal('metrics' in report, false);
});

test('single-system release rejects the removed comparator and expert contract', () => {
  /** @type {any} */
  const input = passingInput();
  input.policy.systems = ['long-prompt', 'test-case-designer', 'technique-router', 'generate-test-cases'];
  input.policy.expert_benchmark = true;

  const report = evaluateSingleSystemRelease(input);

  assert.equal(report.status, 'fail');
  assert.equal(report.release_eligible, false);
  assert.equal(report.issues.some((issue) => issue.code === 'RELEASE_POLICY_CONTRACT_INVALID'), true);
});

test('single-system release reports missing corpus or capture evidence as insufficient', () => {
  const missingCase = passingInput();
  missingCase.corpus.cases.pop();
  missingCase.captures = missingCase.captures.filter((capture) => capture.case_id !== 'case-6-5');
  const caseReport = evaluateSingleSystemRelease(missingCase);
  assert.equal(caseReport.status, 'insufficient_evidence');
  assert.equal(caseReport.release_eligible, false);
  assert.equal(caseReport.issues.some((issue) => issue.code === 'REQUIRED_CASE_COUNT_NOT_MET'), true);

  const missingRepeat = passingInput();
  missingRepeat.captures.pop();
  const captureReport = evaluateSingleSystemRelease(missingRepeat);
  assert.equal(captureReport.status, 'insufficient_evidence');
  assert.equal(captureReport.issues.some((issue) => issue.code === 'CAPTURE_SET_INCOMPLETE'), true);
});

test('single-system release fails closed for forged provenance and observed process failures', () => {
  const forged = passingInput();
  forged.captures[0].source_sha256 = 'f'.repeat(64);
  forged.captures[1].session_id = forged.captures[0].session_id;
  forged.captures[2].replay_bundle_sha256 = SHA_D;
  forged.captures[3].process_failures.runner_protocol_violation = true;

  const report = evaluateSingleSystemRelease(forged);

  assert.equal(report.status, 'fail');
  assert.equal(report.release_eligible, false);
  assert.equal(report.issues.some((issue) => issue.code === 'CAPTURE_INPUT_BINDING_INVALID'), true);
  assert.equal(report.issues.some((issue) => issue.code === 'CAPTURE_SESSION_DUPLICATE'), true);
  assert.equal(report.issues.some((issue) => issue.code === 'CAPTURE_REPLAY_MISMATCH'), true);
  assert.equal(report.issues.some((issue) => issue.code === 'PROCESS_HARD_FAILURE'), true);
});

test('single-system release keeps blocked or unreadable captures incomplete rather than passing them', () => {
  const input = passingInput();
  input.captures[0].terminal_status = 'blocked';
  input.captures[1].evidence_valid = false;

  const report = evaluateSingleSystemRelease(input);

  assert.equal(report.status, 'insufficient_evidence');
  assert.equal(report.release_eligible, false);
  assert.equal(report.issues.some((issue) => issue.code === 'CAPTURE_NOT_COMPLETED'), true);
  assert.equal(report.issues.some((issue) => issue.code === 'CAPTURE_EVIDENCE_UNAVAILABLE'), true);
});

test('checked-in release manifest admits the 30 real PRDs without requiring comparators or experts', async () => {
  const report = await loadSingleSystemRelease(checkedInManifest, repositoryRoot);

  assert.equal(report.status, 'insufficient_evidence');
  assert.equal(report.release_eligible, false);
  assert.equal(report.counts.cases, 30);
  assert.deepEqual(Object.values(report.counts.by_stratum), [5, 5, 5, 5, 5, 5]);
  assert.equal(report.counts.captures, 0);
  assert.equal(report.issues.some((/** @type {any} */ issue) => issue.code.includes('COMPARATOR')), false);
  assert.equal(report.issues.some((/** @type {any} */ issue) => issue.code.includes('EXPERT')), false);
  assert.equal(report.issues.some((/** @type {any} */ issue) => issue.code === 'CAPTURE_SET_INCOMPLETE'), true);
  assert.match(report.candidate_binding.final_candidate_sha, /^[a-f0-9]{40}$/u);
  assert.match(report.candidate_binding.bundle_sha256, /^[a-f0-9]{64}$/u);
  assert.equal(report.evidence_binding.release_manifest_sha256, sha256(await fsPromises.readFile(checkedInManifest)));
  assert.match(report.evidence_binding.corpus_content_sha256, /^[a-f0-9]{64}$/u);
  assert.match(report.evidence_binding.capture_evidence_root_sha256, /^[a-f0-9]{64}$/u);
});

test('single-system release CLI emits one JSON line and rejects any argument count except one', async () => {
  const entry = path.join(repositoryRoot, 'benchmark/single-system-gate.mjs');
  const accepted = await execFileAsync(process.execPath, [entry, checkedInManifest], { cwd: repositoryRoot });
  assert.equal(accepted.stderr, '');
  assert.equal(accepted.stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(accepted.stdout).status, 'insufficient_evidence');

  for (const args of [[], [checkedInManifest, checkedInManifest]]) {
    const rejected = await execFileAsync(process.execPath, [entry, ...args], { cwd: repositoryRoot });
    const report = JSON.parse(rejected.stdout);
    assert.equal(rejected.stderr, '');
    assert.equal(rejected.stdout.trim().split('\n').length, 1);
    assert.equal(report.status, 'fail');
    assert.equal(report.release_eligible, false);
    assert.equal(report.issues[0].code, 'RELEASE_ARGUMENTS_INVALID');
  }
});

test('npm benchmark is the single-system release gate and exposes no expert metrics', async () => {
  const result = await execFileAsync('npm', ['run', 'benchmark', '--silent'], { cwd: repositoryRoot });
  const report = JSON.parse(result.stdout);

  assert.equal(result.stderr, '');
  assert.equal(report.policy_id, 'generate-test-cases-single-system-public-prd-v1');
  assert.equal(report.system, 'generate-test-cases');
  assert.equal('metrics' in report, false);
  assert.equal('comparators' in report, false);
  assert.equal('experts' in report, false);
});

test('loader rejects 90 self-attested snapshots that contain no replayable runner evidence', async (/** @type {any} */ context) => {
  const temporaryRoot = await fsPromises.mkdtemp(path.join(repositoryRoot, 'benchmark/release/.capture-fixture-'));
  context.after(async () => fsPromises.rm(temporaryRoot, { recursive: true, force: true }));
  const catalogPath = path.join(repositoryRoot, 'benchmark/public-pilot/v1/catalog.json');
  const catalogBytes = await fsPromises.readFile(catalogPath, 'utf8');
  const catalog = JSON.parse(catalogBytes);
  const captures = [];
  const zeroArtifacts = {
    compiler: '0'.repeat(64),
    schema: '0'.repeat(64),
    schema_manifest: '0'.repeat(64),
    skill: '0'.repeat(64),
    bundle: '0'.repeat(64)
  };

  for (const item of catalog.items) {
    for (let repeat = 1; repeat <= 3; repeat += 1) {
      const captureId = `${item.pilot_id}-capture-${repeat}`;
      const evidenceDirectory = path.join(temporaryRoot, item.pilot_id.toLowerCase(), String(repeat));
      await fsPromises.mkdir(evidenceDirectory, { recursive: true });
      const rawBytes = `${JSON.stringify({ capture_id: captureId, replies: [] })}\n`;
      const rawPath = path.join(evidenceDirectory, 'raw-output.json');
      await fsPromises.writeFile(rawPath, rawBytes);
      const finalDigest = sha256(`${captureId}:final`);
      const snapshotBytes = `${JSON.stringify({
        schema_version: '1.0.0',
        capture_id: captureId,
        terminal_status: 'completed',
        run_directory_sha256: sha256(`${captureId}:run`),
        final_bundle_sha256: finalDigest,
        replay_bundle_sha256: finalDigest,
        process_failures: {
          runner_protocol_violation: false,
          source_revision_mismatch: false,
          schema_invalid: false,
          traceability_integrity_failure: false
        }
      })}\n`;
      const snapshotPath = path.join(evidenceDirectory, 'run-snapshot.json');
      await fsPromises.writeFile(snapshotPath, snapshotBytes);
      captures.push({
        capture_id: captureId,
        case_id: item.pilot_id,
        system: 'generate-test-cases',
        repeat,
        session_id: `${captureId}-session`,
        source_sha256: item.source.sha256,
        task_sha256: item.task.sha256,
        artifact_digests: zeroArtifacts,
        raw_output: {
          repository_path: path.relative(repositoryRoot, rawPath).split(path.sep).join('/'),
          sha256: sha256(rawBytes)
        },
        run_snapshot: {
          repository_path: path.relative(repositoryRoot, snapshotPath).split(path.sep).join('/'),
          sha256: sha256(snapshotBytes)
        }
      });
    }
  }

  const ledgerBytes = `${JSON.stringify({
    schema_version: '1.0.0',
    ledger_id: 'generate-test-cases-single-system-captures-v1',
    policy_id: 'generate-test-cases-single-system-public-prd-v1',
    system: 'generate-test-cases',
    captures
  }, null, 2)}\n`;
  const ledgerPath = path.join(temporaryRoot, 'captures.json');
  await fsPromises.writeFile(ledgerPath, ledgerBytes);
  const manifest = {
    ...passingInput().policy,
    corpus_catalog: {
      repository_path: 'benchmark/public-pilot/v1/catalog.json',
      sha256: sha256(catalogBytes)
    },
    capture_ledger: {
      repository_path: path.relative(repositoryRoot, ledgerPath).split(path.sep).join('/'),
      sha256: sha256(ledgerBytes)
    }
  };
  const manifestPath = path.join(temporaryRoot, 'manifest.json');
  await fsPromises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report = await loadSingleSystemRelease(manifestPath, repositoryRoot);

  assert.equal(report.status, 'fail');
  assert.equal(report.counts.captures, 0);
  assert.equal(report.counts.completed_captures, 0);
  assert.equal(report.issues.some((/** @type {any} */ issue) => issue.code === 'CAPTURE_EVIDENCE_FORGED'), true);
});
