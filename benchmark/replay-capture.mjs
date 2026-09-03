import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { canonicalStringify, digest as semanticDigest } from '../src/canonical.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../src/schema-validator.mjs';

const execFileAsync = promisify(execFile);
const STAGE_FILES = Object.freeze({
  source_pack: 'source-pack.json',
  evidence_claims: 'evidence-claims.json',
  behavior_views: 'behavior-views.json',
  case_drafts: 'case-drafts.json'
});
const TRANSCRIPT_KEYS = Object.freeze([
  'schema_version', 'capture_id', 'case_id', 'system', 'repeat', 'session_id',
  'source_sha256', 'task_sha256', 'runtime_revision', 'artifact_digests', 'events'
]);
const EVENT_KEYS = Object.freeze(['stage', 'artifact', 'reply']);
const ARTIFACT_KEYS = Object.freeze(['compiler', 'schema', 'schema_manifest', 'skill', 'bundle']);
const SHA256 = /^[a-f0-9]{64}$/u;
const REVISION = /^[a-f0-9]{40}$/u;

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

/** @param {string} runnerPath @param {string} runDirectory */
async function invokeCli(runnerPath, runDirectory) {
  const result = await execFileAsync(process.execPath, [runnerPath, runDirectory], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024
  });
  if (result.stderr !== '') throw new Error('Runner wrote to stderr.');
  const lines = result.stdout.trimEnd().split('\n');
  if (lines.length !== 1) throw new Error(`Runner emitted ${lines.length} stdout lines.`);
  return JSON.parse(lines[0]);
}

/** @param {any} sourcePack @param {string} sourceSha256 @param {string} taskScope */
function sourcePackMatchesCapture(sourcePack, sourceSha256, taskScope) {
  if (!isRecord(sourcePack) || sourcePack.run_scope !== taskScope || !Array.isArray(sourcePack.sources)) return false;
  return sourcePack.sources.some((/** @type {any} */ source) => isRecord(source)
    && ['prd', 'acceptance-criteria', 'interaction-spec', 'interface-contract', 'formal-rule'].includes(source.kind)
    && typeof source.content === 'string'
    && source.content_digest === sourceSha256
    && sha256(source.content) === sourceSha256);
}

/**
 * Replay a transcript once using the candidate's named export. Every recorded
 * reply is schema-validated and compared after run-path normalization.
 * @param {{transcript:any,runnerPath:string,replySchema:any,bundleSchema:any,taskScope:string}} options
 */
async function replayOnce(options) {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-release-replay-'));
  try {
    const imported = await import(`${pathToFileURL(options.runnerPath).href}?release-replay=${encodeURIComponent(options.transcript.capture_id)}`);
    if (typeof imported.advanceStrict !== 'function') throw new Error('Candidate bundle has no advanceStrict export.');
    let expectedStage = 'source_pack';
    /** @type {any[]} */
    const replies = [];
    let finalBundleBytes = null;
    for (const [index, event] of options.transcript.events.entries()) {
      if (!hasExactKeys(event, EVENT_KEYS) || event.stage !== expectedStage || !isRecord(event.artifact) || !isRecord(event.reply)) {
        throw new Error(`Transcript event ${index} does not match the runner-requested stage.`);
      }
      if (index === 0 && !sourcePackMatchesCapture(
        event.artifact,
        options.transcript.source_sha256,
        options.taskScope
      )) throw new Error('Transcript source_pack is not bound to the retained PRD and task scope.');
      await stageArtifact(runDirectory, event.stage, event.artifact);
      const actualReply = await imported.advanceStrict(runDirectory);
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
        finalBundleBytes = await readFile(bundlePath);
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
    const recoveryReply = await invokeCli(options.runnerPath, runDirectory);
    const recoveryDiagnostics = validateAgainstSchema(recoveryReply, options.replySchema);
    if (recoveryDiagnostics.length > 0) throw new Error('Recovery CLI reply schema invalid.');
    const normalizedRecovery = normalizeReply(recoveryReply, runDirectory);
    if (canonicalStringify(normalizedRecovery) !== canonicalStringify(replies.at(-1))) {
      throw new Error('Recovery CLI did not reproduce the terminal reply.');
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
 * @param {{transcriptBytes:any,expected:any,candidateRoot:string,runnerPath:string,replySchemaPath:string,bundleSchemaPath:string,taskScope:string}} options
 */
export async function verifyCaptureTranscript(options) {
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
    || !Array.isArray(transcript.events)
    || transcript.events.length < 4 || transcript.events.length > 32) {
    throw new Error('Capture transcript contract or binding is invalid.');
  }
  const [replySchema, bundleSchema] = await Promise.all([
    readFile(options.replySchemaPath, 'utf8').then(JSON.parse),
    readFile(options.bundleSchemaPath, 'utf8').then(JSON.parse)
  ]);
  const first = await replayOnce({ transcript, runnerPath: options.runnerPath, replySchema, bundleSchema, taskScope: options.taskScope });
  const second = await replayOnce({ transcript, runnerPath: options.runnerPath, replySchema, bundleSchema, taskScope: options.taskScope });
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
