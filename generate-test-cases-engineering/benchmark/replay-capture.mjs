import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { canonicalStringify, digest as semanticDigest } from '../src/canonical.mjs';
import { createPresentationSnapshot } from '../src/execution-events.mjs';
import { validateAgainstSchema, validateUniqueStableIds } from '../src/schema-validator.mjs';
import {
  OPERATOR_TASK_ID,
  OPERATOR_WITNESS_METHOD,
  isAllowedAgentForCase
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

/** @param {unknown} value @param {unknown} caseId */
function isOperatorWitness(value, caseId) {
  if (!hasExactKeys(value, WITNESS_KEYS)) return false;
  const witness = /** @type {Record<string,unknown>} */ (value);
  return witness.method === OPERATOR_WITNESS_METHOD
    && witness.operator_task_id === OPERATOR_TASK_ID
    && isAllowedAgentForCase(witness.agent_task_id, caseId)
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
    // A durable run identity is compiler-owned.  A retained transcript proves
    // that its first Source Pack matched the identity shown by the original
    // empty-run reply, but a replay necessarily receives a fresh identity.
    // Rebind that one opaque nonce while preserving every semantic byte and
    // compare replies after the inverse alpha-renaming.
    const originalRunId = options.transcript.events[0]?.artifact?.run_instance_id;
    if (typeof originalRunId !== 'string' || !/^RUN-[0-9a-f-]{36}$/u.test(originalRunId)) {
      throw new Error('Transcript Source Pack has no valid compiler-issued run identity.');
    }
    const initialReply = await invokeCli(options.runnerPath, runDirectory, deadline - Date.now());
    const initialDiagnostics = validateAgainstSchema(initialReply, options.replySchema);
    if (initialDiagnostics.length > 0) throw new Error('Fresh replay reply schema invalid.');
    const replayRunId = initialReply?.scope?.run_instance_id ?? initialReply?.run_instance_id;
    if (initialReply?.status !== 'need_artifact' || initialReply?.stage !== 'source_pack'
      || typeof replayRunId !== 'string' || !/^RUN-[0-9a-f-]{36}$/u.test(replayRunId)) {
      throw new Error('Fresh replay did not establish a compiler-owned run identity.');
    }
    const identityPatterns = new Map([
      ['run', /^RUN-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u],
      ['presentation', /^(?:PRESENTATION-[0-9a-f]{24}|PRES-[0-9a-f]{64})$/u],
      ['group', /^GROUP-[0-9a-f]{24}$/u],
      ['question', /^QUESTION-[0-9a-f]{24}$/u],
      ['preview_request', /^PREVIEW-[0-9a-f]{32}$/u]
    ]);
    const scalarIdentityDomains = new Map([
      ['run_instance_id', 'run'], ['run_id', 'run'],
      ['presentation_id', 'presentation'], ['prompt_id', 'presentation'],
      ['presented_prompt_id', 'presentation'], ['presented_presentation_id', 'presentation'],
      ['supersedes_presentation_id', 'presentation'], ['replaces_presentation_id', 'presentation'],
      ['cancels_presentation_id', 'presentation'], ['latest_presentation_id', 'presentation'],
      ['group_id', 'group'], ['question_id', 'question'],
      ['request_instance_id', 'preview_request'],
      ['next_request_instance_id', 'preview_request'],
      ['originating_request_instance_id', 'preview_request']
    ]);
    const arrayIdentityDomains = new Map([
      ['decision_group_ids', 'group']
    ]);
    const identityMaps = new Map([...identityPatterns.keys()].map((domain) => [domain, {
      transcriptToReplay: new Map(), replayToTranscript: new Map()
    }]));
    /** @param {string} domain @param {string} transcriptValue @param {string} replayValue @param {string} key */
    const bindIdentity = (domain, transcriptValue, replayValue, key) => {
      const pattern = identityPatterns.get(domain);
      if (!pattern?.test(transcriptValue) || !pattern.test(replayValue)) {
        throw new Error(`Replay-scoped identity type invalid for ${key}.`);
      }
      const maps = identityMaps.get(domain);
      if (!maps) throw new Error(`Unknown replay-scoped identity domain for ${key}.`);
      const priorReplay = maps.transcriptToReplay.get(transcriptValue);
      const priorTranscript = maps.replayToTranscript.get(replayValue);
      if ((priorReplay && priorReplay !== replayValue)
        || (priorTranscript && priorTranscript !== transcriptValue)) {
        throw new Error(`Replay-scoped identity conflict for ${key}.`);
      }
      maps.transcriptToReplay.set(transcriptValue, replayValue);
      maps.replayToTranscript.set(replayValue, transcriptValue);
    };
    bindIdentity('run', originalRunId, replayRunId, 'run_instance_id');
    /**
     * Rewrite only fields whose closed protocol type is a compiler-owned,
     * run-scoped identity. Equal strings in business content and digest fields
     * are deliberately outside this alpha-renaming boundary.
     * @param {any} value @param {'toTranscript'|'toReplay'} direction
     * @param {string|null} [key] @param {string|null} [arrayKey] @returns {any}
     */
    const rewriteIdentities = (value, direction, key = null, arrayKey = null) => {
      if (typeof value === 'string') {
        const domain = (key && scalarIdentityDomains.get(key))
          || (arrayKey && arrayIdentityDomains.get(arrayKey));
        if (!domain) return value;
        const maps = identityMaps.get(domain);
        if (!maps) throw new Error(`Unknown replay-scoped identity domain for ${key ?? arrayKey}.`);
        return direction === 'toTranscript'
          ? (maps.replayToTranscript.get(value) ?? value)
          : (maps.transcriptToReplay.get(value) ?? value);
      }
      if (Array.isArray(value)) {
        const output = value.map((item) => rewriteIdentities(item, direction, null, key));
        if (key === 'groups') output.sort((left, right) => (
          String(left?.group_id ?? '').localeCompare(String(right?.group_id ?? ''), 'en')
        ));
        return output;
      }
      if (isRecord(value)) return Object.fromEntries(
        Object.entries(value).map(([childKey, item]) => [
          childKey, rewriteIdentities(item, direction, childKey, null)
        ])
      );
      return value;
    };
    /** @param {any} expected @param {any} actual @param {string|null} [key] @returns {void} */
    const learnReplayScopedIdentities = (expected, actual, key = null) => {
      const domain = key ? scalarIdentityDomains.get(key) : null;
      if (domain && typeof expected === 'string' && typeof actual === 'string' && expected !== actual) {
        if (domain === 'run') {
          const maps = identityMaps.get(domain);
          if (!maps) throw new Error(`Unknown replay-scoped identity domain for ${key}.`);
          if (maps.transcriptToReplay.get(expected) !== actual) {
            throw new Error(`Replay-scoped identity conflict for ${key}.`);
          }
        } else bindIdentity(domain, expected, actual, key ?? domain);
        return;
      }
      if (Array.isArray(expected) && Array.isArray(actual)) {
        // Legacy readable groups are ordered by their run-derived IDs. Their
        // safe pairings are learned from the canonical checkpoint below, not
        // from array position in an untrusted transcript.
        if (key === 'groups') return;
        for (let index = 0; index < Math.min(expected.length, actual.length); index += 1) {
          learnReplayScopedIdentities(expected[index], actual[index]);
        }
        return;
      }
      if (isRecord(expected) && isRecord(actual)) {
        for (const childKey of Object.keys(expected)) {
          if (childKey in actual) learnReplayScopedIdentities(expected[childKey], actual[childKey], childKey);
        }
      }
    };
    /** @param {any} snapshot @param {string} runId @param {any} postReadyControl */
    const recreateLegacyPresentation = (snapshot, runId, postReadyControl) => createPresentationSnapshot({
      runInstanceId: runId,
      purpose: snapshot.purpose,
      entryContext: snapshot.entry_context,
      postReadyControl,
      sourceRevision: snapshot.source_revision,
      planDigest: snapshot.plan_digest,
      planChangeHeadSeq: snapshot.plan_change_head_seq,
      groups: snapshot.groups.map((/** @type {any} */ group) => ({
        question: group.question,
        items: group.item_refs,
        allowedOptions: group.allowed_options,
        answerExample: group.answer_example,
        proposedChange: group.proposed_change
      }))
    });
    /** @param {any} group */
    const groupSemanticKey = (group) => canonicalStringify({
      question: group.question, item_refs: group.item_refs,
      allowed_options: group.allowed_options, answer_example: group.answer_example,
      proposed_change: group.proposed_change
    });
    /** @param {any} expectedReply @param {any} actualReply @returns {Promise<string|null>} */
    const verifyLegacyPresentationDigest = async (expectedReply, actualReply) => {
      if (!('presentation_digest' in expectedReply) && !('presentation_digest' in actualReply)) return null;
      if (typeof expectedReply.presentation_digest !== 'string'
        || typeof actualReply.presentation_digest !== 'string') {
        throw new Error('Recorded presentation digest mismatch.');
      }
      let checkpoint;
      try {
        checkpoint = JSON.parse((await readRunFile(runDirectory, 'checkpoint.json')).toString('utf8'));
      } catch {
        throw new Error('Recorded presentation digest has no canonical checkpoint.');
      }
      const actualSnapshot = checkpoint?.presentation_snapshot;
      if (!isRecord(actualSnapshot) || !Array.isArray(actualSnapshot.groups)) {
        throw new Error('Recorded presentation digest has no canonical checkpoint.');
      }
      const actualDigest = semanticDigest(actualSnapshot);
      const recreatedActual = recreateLegacyPresentation(
        actualSnapshot, replayRunId, actualSnapshot.post_ready_control
      );
      if (checkpoint.presentation_snapshot_digest !== actualDigest
        || actualReply.presentation_digest !== actualDigest
        || canonicalStringify(recreatedActual) !== canonicalStringify(actualSnapshot)) {
        throw new Error('Replay presentation checkpoint is not canonical.');
      }
      const transcriptPostReadyControl = rewriteIdentities(
        actualSnapshot.post_ready_control, 'toTranscript'
      );
      const transcriptSnapshot = recreateLegacyPresentation(
        actualSnapshot, originalRunId, transcriptPostReadyControl
      );
      bindIdentity(
        'presentation', transcriptSnapshot.presentation_id,
        actualSnapshot.presentation_id, 'presentation_id'
      );
      const transcriptGroups = new Map();
      for (const group of transcriptSnapshot.groups) {
        const semanticKey = groupSemanticKey(group);
        if (transcriptGroups.has(semanticKey)) {
          throw new Error('Replay presentation contains ambiguous compiler-owned groups.');
        }
        transcriptGroups.set(semanticKey, group);
      }
      for (const actualGroup of actualSnapshot.groups) {
        const transcriptGroup = transcriptGroups.get(groupSemanticKey(actualGroup));
        if (!transcriptGroup) throw new Error('Replay presentation group semantics changed.');
        bindIdentity('group', transcriptGroup.group_id, actualGroup.group_id, 'group_id');
        bindIdentity('question', transcriptGroup.question_id, actualGroup.question_id, 'question_id');
      }
      const normalizedSnapshot = rewriteIdentities(actualSnapshot, 'toTranscript');
      if (canonicalStringify(normalizedSnapshot) !== canonicalStringify(transcriptSnapshot)) {
        throw new Error('Replay presentation identity normalization is incomplete.');
      }
      const transcriptDigest = semanticDigest(transcriptSnapshot);
      if (expectedReply.presentation_digest !== transcriptDigest) {
        throw new Error('Recorded presentation digest mismatch.');
      }
      return transcriptDigest;
    };
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
      const replayArtifact = rewriteIdentities(event.artifact, 'toReplay');
      await stageArtifact(runDirectory, event.stage, replayArtifact);
      const actualReply = await invokeCli(options.runnerPath, runDirectory, deadline - Date.now());
      const diagnostics = validateAgainstSchema(actualReply, options.replySchema);
      if (diagnostics.length > 0) throw new Error(`Runner reply schema invalid at event ${index}.`);
      const pathNormalized = normalizeReply(actualReply, runDirectory);
      const expectedPresentationDigest = await verifyLegacyPresentationDigest(event.reply, pathNormalized);
      learnReplayScopedIdentities(event.reply, pathNormalized);
      const normalized = rewriteIdentities(pathNormalized, 'toTranscript');
      if (expectedPresentationDigest !== null) normalized.presentation_digest = expectedPresentationDigest;
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
    const normalizedRecovery = rewriteIdentities(normalizeReply(recoveryReply, runDirectory), 'toTranscript');
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
    || !isOperatorWitness(transcript.operator_witness, transcript.case_id)
    || canonicalStringify(transcript.operator_witness) !== canonicalStringify(options.expected.operator_witness)
    || !Array.isArray(transcript.events)
    || transcript.events.length < 4 || transcript.events.length > 32) {
    throw new Error('Capture transcript contract or binding is invalid.');
  }
  const [replySchema, bundleSchema] = await Promise.all([
    readFile(options.replySchemaPath, 'utf8').then(JSON.parse),
    readFile(options.bundleSchemaPath, 'utf8').then(JSON.parse)
  ]);
  for (const [index, event] of transcript.events.entries()) {
    if (!isRecord(event) || !isRecord(event.reply)
      || validateAgainstSchema(event.reply, replySchema).length > 0) {
      throw new Error(`Recorded runner reply schema invalid at event ${index}.`);
    }
  }
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
