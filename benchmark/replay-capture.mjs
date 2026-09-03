import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { canonicalStringify, digest as semanticDigest } from '../src/canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../src/schema-validator.mjs';
import {
  OPERATOR_TASK_ID,
  OPERATOR_WITNESS_METHOD,
  isAllowedAgentTaskId
} from './operator-witness.mjs';

const execFileAsync = promisify(execFile);
const STAGE_FILES = Object.freeze({
  source_pack: 'source-pack.json',
  evidence_claims: 'evidence-claims.json',
  behavior_views: 'behavior-views.json',
  case_drafts: 'case-drafts.json'
});
const TRANSCRIPT_KEYS = Object.freeze([
  'schema_version', 'capture_id', 'case_id', 'system', 'repeat', 'session_id',
  'source_sha256', 'task_sha256', 'runtime_revision', 'artifact_digests',
  'operator_witness', 'events'
]);
const EVENT_KEYS = Object.freeze(['stage', 'artifact', 'reply']);
const ARTIFACT_KEYS = Object.freeze(['compiler', 'schema', 'schema_manifest', 'skill', 'bundle']);
const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;
const WITNESS_KEYS = Object.freeze([
  'method', 'operator_task_id', 'agent_task_id', 'observation_id'
]);
export const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;
const STAGE_TIMEOUT_MS = 20_000;
const REPLAY_TIMEOUT_MS = 120_000;
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const lstat = fsPromises.lstat;
const realpath = fsPromises.realpath;

/** @param {unknown} value */
function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value @param {readonly string[]} keys */
function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(/** @type {Record<string,unknown>} */ (value)).sort();
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
  const record = /** @type {Record<string,unknown>} */ (value);
  return hasExactKeys(record, ARTIFACT_KEYS) && ARTIFACT_KEYS.every((key) => isDigest(record[key]));
}

/** @param {unknown} left @param {unknown} right */
function sameArtifactDigests(left, right) {
  const leftRecord = /** @type {Record<string,unknown>} */ (left);
  const rightRecord = /** @type {Record<string,unknown>} */ (right);
  return isArtifactDigests(leftRecord) && isArtifactDigests(rightRecord)
    && ARTIFACT_KEYS.every((key) => leftRecord[key] === rightRecord[key]);
}

/** @param {unknown} value */
function isOperatorWitness(value) {
  if (!hasExactKeys(value, WITNESS_KEYS)) return false;
  const witness = /** @type {Record<string,unknown>} */ (value);
  return witness.method === OPERATOR_WITNESS_METHOD
    && witness.operator_task_id === OPERATOR_TASK_ID
    && isAllowedAgentTaskId(witness.agent_task_id)
    && isNonblankString(witness.observation_id);
}

/** @param {Uint8Array|string} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {string} root @param {string} candidate */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {any} reply @param {string} runDirectory */
function normalizeReply(reply, runDirectory) {
  if (!isRecord(reply)) throw new Error('Runner reply is not an object.');
  const normalized = structuredClone(reply);
  for (const key of ['artifact_path', 'bundle_path', 'markdown_path']) {
    if (!(key in normalized)) continue;
    if (typeof normalized[key] !== 'string' || !path.isAbsolute(normalized[key])) {
      throw new Error(`Runner reply ${key} is not absolute.`);
    }
    const resolved = path.resolve(normalized[key]);
    if (!isInside(runDirectory, resolved)) throw new Error(`Runner reply ${key} escapes the run directory.`);
    normalized[key] = path.relative(runDirectory, resolved).split(path.sep).join('/');
  }
  return normalized;
}

/** @param {string} runDirectory @param {string} stage @param {any} artifact */
async function stageArtifact(runDirectory, stage, artifact) {
  const filename = /** @type {Record<string,string>} */ (STAGE_FILES)[stage];
  if (!filename) throw new Error(`Unknown transcript stage: ${stage}`);
  const staging = path.join(runDirectory, 'staging');
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, filename), `${JSON.stringify(artifact)}\n`, 'utf8');
}

/** @param {string} runnerPath @param {string} runDirectory @param {number} timeout */
async function invokeCli(runnerPath, runDirectory, timeout = STAGE_TIMEOUT_MS) {
  const result = await execFileAsync(process.execPath, [runnerPath, runDirectory], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    timeout: Math.max(1, Math.min(STAGE_TIMEOUT_MS, timeout)),
    killSignal: 'SIGKILL',
    cwd: path.dirname(runnerPath)
  });
  if (result.stderr !== '') throw new Error('Runner wrote to stderr.');
  const lines = result.stdout.trimEnd().split('\n');
  if (lines.length !== 1) throw new Error(`Runner emitted ${lines.length} stdout lines.`);
  return JSON.parse(lines[0]);
}

/** @param {string} runDirectory @param {string} relativePath */
async function readRunFile(runDirectory, relativePath) {
  const filename = path.resolve(runDirectory, relativePath);
  if (!isInside(runDirectory, filename)) throw new Error('Run output path escapes the run directory.');
  const entry = await lstat(filename);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) {
    throw new Error('Run output must be a regular singly linked file.');
  }
  const resolved = await realpath(filename);
  if (!isInside(await realpath(runDirectory), resolved)) throw new Error('Run output resolved outside the run directory.');
  return readFile(resolved);
}

/** @param {any} sourcePack @param {any} sourceContract @param {any} taskContract */
function sourcePackMatchesCapture(sourcePack, sourceContract, taskContract) {
  if (!isRecord(sourcePack)
    || sourcePack.run_scope !== taskContract?.scope
    || !Array.isArray(sourcePack.sources) || sourcePack.sources.length !== 1
    || !Array.isArray(sourcePack.locators) || sourcePack.locators.length === 0
    || !isRecord(sourcePack.source_policy) || !Array.isArray(sourcePack.source_policy.rules)
    || sourcePack.source_policy.rules.length === 0) return false;
  const source = sourcePack.sources[0];
  return isRecord(source)
    && source.source_id === sourceContract?.source_id
    && source.kind === 'prd'
    && source.version === sourceContract?.commit
    && source.status === 'effective'
    && source.authority === `public-repository:${sourceContract?.repository}`
    && typeof source.content === 'string'
    && source.content_digest === sourceContract?.source_sha256
    && sha256(source.content) === sourceContract?.source_sha256
    && sourcePack.locators.every((/** @type {any} */ locator) => isRecord(locator)
      && locator.source_id === sourceContract.source_id
      && locator.content_digest === sourceContract.source_sha256)
    && sourcePack.source_policy.rules.every((/** @type {any} */ rule) => isRecord(rule)
      && Array.isArray(rule.source_ids) && rule.source_ids.length === 1
      && rule.source_ids[0] === sourceContract.source_id);
}

/** @param {any} evidenceClaims @param {string} sourceId */
function evidenceClaimsUseOnlySource(evidenceClaims, sourceId) {
  if (!isRecord(evidenceClaims) || !Array.isArray(evidenceClaims.claims)) return false;
  const direct = evidenceClaims.claims.filter((/** @type {any} */ claim) => claim?.claim_form === 'direct');
  return direct.length > 0 && direct.every((/** @type {any} */ claim) => claim.source_id === sourceId);
}

/**
 * Replay a transcript once using the candidate's named export. Every recorded
 * reply is schema-validated and compared after run-path normalization.
 * @param {{transcript:any,runnerPath:string,replySchema:any,bundleSchema:any,taskContract:any,sourceContract:any,deadline?:number}} options
 */
async function replayOnce(options) {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-release-replay-'));
  const deadline = Math.min(options.deadline ?? Number.POSITIVE_INFINITY, Date.now() + REPLAY_TIMEOUT_MS);
  try {
    let expectedStage = 'source_pack';
    /** @type {any[]} */
    const replies = [];
    let finalBundleBytes = null;
    for (const [index, event] of options.transcript.events.entries()) {
      if (!hasExactKeys(event, EVENT_KEYS) || event.stage !== expectedStage || !isRecord(event.artifact) || !isRecord(event.reply)) {
        throw new Error(`Transcript event ${index} does not match the runner-requested stage.`);
      }
      if (index === 0 && !sourcePackMatchesCapture(
        event.artifact, options.sourceContract, options.taskContract
      )) throw new Error('Transcript source_pack is not exactly bound to the retained PRD and task.');
      if (event.stage === 'evidence_claims'
        && !evidenceClaimsUseOnlySource(event.artifact, options.sourceContract.source_id)) {
        throw new Error('Transcript evidence claims are not exactly bound to the retained PRD.');
      }
      await stageArtifact(runDirectory, event.stage, event.artifact);
      const actualReply = await invokeCli(options.runnerPath, runDirectory, deadline - Date.now());
      const diagnostics = validateAgainstSchema(actualReply, options.replySchema);
      if (diagnostics.length > 0) throw new Error(`Runner reply schema invalid at event ${index}.`);
      const normalized = normalizeReply(actualReply, runDirectory);
      if (canonicalStringify(normalized) !== canonicalStringify(event.reply)) {
        throw new Error(`Recorded runner reply mismatch at event ${index}.`);
      }
      replies.push(normalized);
      if (actualReply.status === 'fatal') throw new Error(`Runner fatal at event ${index}.`);
      if (actualReply.status === 'need_artifact' || actualReply.status === 'need_revision') {
        expectedStage = actualReply.stage;
      } else if (actualReply.status === 'need_user_answers') {
        expectedStage = 'source_pack';
      } else if (actualReply.status === 'finished') {
        if (index !== options.transcript.events.length - 1) throw new Error('Transcript continues after terminal completion.');
        const bundlePath = path.resolve(runDirectory, normalized.bundle_path);
        finalBundleBytes = await readRunFile(runDirectory, normalized.bundle_path);
        const bundle = JSON.parse(finalBundleBytes.toString('utf8'));
        const bundleDiagnostics = [
          ...validateAgainstSchema(bundle, options.bundleSchema),
          ...validateUniqueStableIds(bundle)
        ];
        if (bundleDiagnostics.length > 0) throw new Error('Final bundle schema or stable-ID validation failed.');
        if (semanticDigest(bundle) !== actualReply.bundle_digest) throw new Error('Final bundle digest does not match the runner reply.');
      } else throw new Error(`Unsupported runner status at event ${index}.`);
    }
    if (!finalBundleBytes || replies.at(-1)?.status !== 'finished') {
      throw new Error('Transcript did not complete a test bundle.');
    }
    const recoveryReply = await invokeCli(options.runnerPath, runDirectory, deadline - Date.now());
    const recoveryDiagnostics = validateAgainstSchema(recoveryReply, options.replySchema);
    if (recoveryDiagnostics.length > 0) throw new Error('Recovery CLI reply schema invalid.');
    const normalizedRecovery = normalizeReply(recoveryReply, runDirectory);
    if (canonicalStringify(normalizedRecovery) !== canonicalStringify(replies.at(-1))) {
      throw new Error('Recovery CLI did not reproduce the terminal reply.');
    }
    const recoveredBundleBytes = await readRunFile(runDirectory, normalizedRecovery.bundle_path);
    const recoveredBundle = JSON.parse(recoveredBundleBytes.toString('utf8'));
    if (validateAgainstSchema(recoveredBundle, options.bundleSchema).length > 0
      || validateUniqueStableIds(recoveredBundle).length > 0
      || semanticDigest(recoveredBundle) !== recoveryReply.bundle_digest
      || sha256(recoveredBundleBytes) !== sha256(finalBundleBytes)) {
      throw new Error('Recovery CLI changed or invalidated the final bundle.');
    }
    return {
      replies,
      bundle_sha256: sha256(finalBundleBytes),
      semantic_bundle_digest: /** @type {any} */ (replies.at(-1)).bundle_digest
    };
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}

/**
 * Verify retained capture bytes by replaying the exact Agent submissions twice
 * against the evaluated installed-shape bundle.
 * @param {{transcriptBytes:any,expected:any,candidateRoot:string,runnerPath:string,replySchemaPath:string,bundleSchemaPath:string,taskContract:any,sourceContract:any,deadline?:number}} options
 */
export async function verifyCaptureTranscript(options) {
  if (!options.transcriptBytes || typeof options.transcriptBytes.byteLength !== 'number'
    || options.transcriptBytes.byteLength > MAX_TRANSCRIPT_BYTES) {
    throw new Error('Capture transcript exceeds the fixed size limit.');
  }
  let transcript;
  try {
    transcript = JSON.parse(new TextDecoder().decode(options.transcriptBytes));
  } catch {
    throw new Error('Capture transcript is not valid JSON.');
  }
  if (!hasExactKeys(transcript, TRANSCRIPT_KEYS)
    || transcript.schema_version !== '1.0.0'
    || transcript.capture_id !== options.expected.capture_id
    || transcript.case_id !== options.expected.case_id
    || transcript.system !== 'generate-test-cases'
    || transcript.repeat !== options.expected.repeat
    || transcript.session_id !== options.expected.session_id
    || transcript.source_sha256 !== options.expected.source_sha256
    || transcript.task_sha256 !== options.expected.task_sha256
    || typeof transcript.runtime_revision !== 'string' || !REVISION.test(transcript.runtime_revision)
    || transcript.runtime_revision !== options.expected.runtime_revision
    || !sameArtifactDigests(transcript.artifact_digests, options.expected.artifact_digests)
    || !isOperatorWitness(transcript.operator_witness)
    || canonicalStringify(transcript.operator_witness) !== canonicalStringify(options.expected.operator_witness)
    || !Array.isArray(transcript.events)
    || transcript.events.length < 4 || transcript.events.length > 32) {
    throw new Error('Capture transcript contract or binding is invalid.');
  }
  const [replySchema, bundleSchema] = await Promise.all([
    readFile(options.replySchemaPath, 'utf8').then(JSON.parse),
    readFile(options.bundleSchemaPath, 'utf8').then(JSON.parse)
  ]);
  const replayOptions = {
    transcript, runnerPath: options.runnerPath, replySchema, bundleSchema,
    taskContract: options.taskContract, sourceContract: options.sourceContract,
    deadline: options.deadline
  };
  const first = await replayOnce(replayOptions);
  const second = await replayOnce(replayOptions);
  if (canonicalStringify(first.replies) !== canonicalStringify(second.replies)
    || first.bundle_sha256 !== second.bundle_sha256
    || first.semantic_bundle_digest !== second.semantic_bundle_digest) {
    throw new Error('Independent capture replay was not deterministic.');
  }
  return {
    transcript_sha256: sha256(options.transcriptBytes),
    final_bundle_sha256: first.bundle_sha256,
    replay_bundle_sha256: second.bundle_sha256,
    reply_sequence_sha256: sha256(canonicalStringify(first.replies)),
    runtime_revision: transcript.runtime_revision
  };
}
