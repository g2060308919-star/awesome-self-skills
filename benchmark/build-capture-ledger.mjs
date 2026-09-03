import { createHash } from 'node:crypto';
import {
  mkdir, mkdtemp, readFile, readdir, rm, writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  OPERATOR_TASK_ID,
  OPERATOR_WITNESS_METHOD,
  isAllowedAgentForCase
} from './operator-witness.mjs';

const fsModule = /** @type {any} */ (await import('node:fs'));
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const fsConstants = fsModule.constants ?? fsModule.default.constants;
const lstat = fsPromises.lstat;
const open = fsPromises.open;
const realpath = fsPromises.realpath;
const rename = fsPromises.rename;

const repositoryRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const releaseRoot = path.join(repositoryRoot, 'benchmark/release/v1');
const workRoot = path.join(releaseRoot, 'operator-work');
const evidenceRoot = path.join(releaseRoot, 'evidence');
const ledgerPath = path.join(releaseRoot, 'captures.json');
const manifestPath = path.join(releaseRoot, 'manifest.json');
const catalogPath = path.join(repositoryRoot, 'benchmark/public-pilot/v1/catalog.json');
const EXPECTED_TRANSCRIPT_KEYS = Object.freeze([
  'schema_version', 'capture_id', 'case_id', 'system', 'repeat', 'session_id',
  'source_sha256', 'task_sha256', 'runtime_revision', 'artifact_digests',
  'operator_witness', 'events'
]);
const WITNESS_KEYS = Object.freeze([
  'method', 'operator_task_id', 'agent_task_id', 'observation_id'
]);
const SAFE_CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const EXPECTED_CAPTURE_COUNT = 90;
const MAX_WALK_ENTRIES = 8192;
const MAX_WALK_DEPTH = 32;
export const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;

/** @param {Uint8Array|string} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

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
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

/** @param {unknown} value @returns {value is string} */
function isNonblankString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

/** @param {string} root @param {string} candidate */
function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..'
    && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {unknown} value */
function isSafeCaseId(value) {
  return isNonblankString(value)
    && SAFE_CASE_ID.test(value)
    && value !== '.' && value !== '..'
    && !value.includes('/') && !value.includes('\\');
}

/** @param {any} transcript @param {Set<string>} catalogCaseIds */
function validateTranscript(transcript, catalogCaseIds) {
  if (!hasExactKeys(transcript, EXPECTED_TRANSCRIPT_KEYS)
    || transcript.schema_version !== '1.0.0'
    || transcript.system !== 'generate-test-cases'
    || !isSafeCaseId(transcript.case_id)
    || !catalogCaseIds.has(transcript.case_id)
    || ![1, 2, 3].includes(transcript.repeat)
    || transcript.capture_id !== `${transcript.case_id}-r${transcript.repeat}`
    || !isNonblankString(transcript.session_id)
    || !Array.isArray(transcript.events)
    || transcript.events.at(-1)?.reply?.status !== 'finished') {
    throw new Error('Invalid sealed transcript contract, case, or repeat.');
  }
  const witness = transcript.operator_witness;
  if (!hasExactKeys(witness, WITNESS_KEYS)
    || witness.method !== OPERATOR_WITNESS_METHOD
    || witness.operator_task_id !== OPERATOR_TASK_ID
    || !isAllowedAgentForCase(witness.agent_task_id, transcript.case_id)
    || !isNonblankString(witness.observation_id)) {
    throw new Error('Transcript Agent witness is outside the closed allowlist.');
  }
}

/** @param {string} root */
async function transcriptPaths(root) {
  const rootEntry = await lstat(root);
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
    throw new Error('Operator work root must be a real directory.');
  }
  const rootReal = await realpath(root);
  /** @type {string[]} */
  const found = [];
  /** @type {Array<{directory:string,depth:number}>} */
  const pending = [{ directory: root, depth: 0 }];
  let visitedEntries = 0;
  while (pending.length > 0) {
    const current = /** @type {{directory:string,depth:number}} */ (pending.pop());
    if (current.depth > MAX_WALK_DEPTH) throw new Error('Operator work tree exceeds the depth limit.');
    for (const entry of await readdir(current.directory, { withFileTypes: true })) {
      visitedEntries += 1;
      if (visitedEntries > MAX_WALK_ENTRIES) throw new Error('Operator work tree exceeds the entry limit.');
      const filename = path.join(current.directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are forbidden in operator work: ${filename}`);
      if (entry.name === 'transcript.json') {
        found.push(filename);
      } else if (entry.isDirectory()) {
        const directoryReal = await realpath(filename);
        if (!isInside(rootReal, directoryReal)) throw new Error('Operator work directory escaped its root.');
        pending.push({ directory: filename, depth: current.depth + 1 });
      }
    }
  }
  return { paths: found.sort(), rootReal };
}

/**
 * Open one transcript without following its final link, bind the opened inode to
 * the path observation, and read no more than the fixed size limit.
 * @param {string} filename
 * @param {string} rootReal
 */
async function readTranscript(filename, rootReal) {
  const entry = await lstat(filename);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1
    || entry.size > MAX_TRANSCRIPT_BYTES) {
    throw new Error('Transcript must be a regular singly linked file within the size limit.');
  }
  const filenameReal = await realpath(filename);
  if (!isInside(rootReal, filenameReal)) throw new Error('Transcript resolved outside operator work.');
  const handle = await open(filenameReal, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > MAX_TRANSCRIPT_BYTES
      || opened.dev !== entry.dev || opened.ino !== entry.ino) {
      throw new Error('Transcript changed identity or exceeded the size limit while opening.');
    }
    const bytes = new Uint8Array(opened.size);
    let offset = 0;
    while (offset < bytes.length) {
      const result = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (result.bytesRead === 0) break;
      offset += result.bytesRead;
    }
    const after = await handle.stat();
    if (offset !== bytes.length || after.dev !== opened.dev || after.ino !== opened.ino
      || after.size !== opened.size || bytes.byteLength > MAX_TRANSCRIPT_BYTES) {
      throw new Error('Transcript changed while it was being read.');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function catalogCases() {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  /** @type {any[]} */
  const caseIds = Array.isArray(catalog?.items)
    ? catalog.items.filter((/** @type {any} */ item) => item?.status === 'pilot-admitted')
      .map((/** @type {any} */ item) => item.pilot_id)
    : [];
  if (caseIds.length !== 30 || caseIds.some((caseId) => !isSafeCaseId(caseId))
    || new Set(caseIds).size !== caseIds.length
    || new Set(caseIds.map((caseId) => caseId.toLowerCase())).size !== caseIds.length) {
    throw new Error('Catalog must provide exactly 30 distinct path-safe admitted case IDs.');
  }
  return new Set(caseIds);
}

/** @param {string} filename */
async function existingTargetKind(filename) {
  try {
    const entry = await lstat(filename);
    if (entry.isSymbolicLink()) throw new Error(`Replacement target cannot be a symbolic link: ${filename}`);
    return entry.isDirectory() ? 'directory' : entry.isFile() && entry.nlink === 1 ? 'file' : 'unsafe';
  } catch (error) {
    if (/** @type {any} */ (error).code === 'ENOENT') return 'missing';
    throw error;
  }
}

/**
 * Replace all release outputs together and restore every old target if any
 * rename fails before the complete set is installed.
 * @param {string} stageRoot
 */
async function installStagedOutputs(stageRoot) {
  const replacements = [
    { incoming: path.join(stageRoot, 'evidence'), target: evidenceRoot, kind: 'directory' },
    { incoming: path.join(stageRoot, 'captures.json'), target: ledgerPath, kind: 'file' },
    { incoming: path.join(stageRoot, 'manifest.json'), target: manifestPath, kind: 'file' }
  ];
  /** @type {Array<{target:string,backup:string|null,installed:boolean}>} */
  const operations = [];
  try {
    for (const [index, replacement] of replacements.entries()) {
      const kind = await existingTargetKind(replacement.target);
      if (kind !== 'missing' && kind !== replacement.kind) {
        throw new Error(`Release output target has an unsafe type: ${replacement.target}`);
      }
      const backup = kind === 'missing' ? null : path.join(stageRoot, `backup-${index}`);
      if (backup) await rename(replacement.target, backup);
      operations.push({ target: replacement.target, backup, installed: false });
    }
    for (const [index, replacement] of replacements.entries()) {
      await rename(replacement.incoming, replacement.target);
      operations[index].installed = true;
    }
  } catch (error) {
    for (const operation of [...operations].reverse()) {
      if (operation.installed) await rm(operation.target, { recursive: true, force: true });
      if (operation.backup) await rename(operation.backup, operation.target);
    }
    throw error;
  }
}

export async function buildCaptureLedger() {
  const caseIds = await catalogCases();
  const expectedPairs = new Set(
    [...caseIds].flatMap((caseId) => [1, 2, 3].map((repeat) => `${caseId}\0${repeat}`))
  );
  const { paths, rootReal } = await transcriptPaths(workRoot);
  if (paths.length !== EXPECTED_CAPTURE_COUNT) {
    throw new Error(`Expected exactly ${EXPECTED_CAPTURE_COUNT} sealed transcripts; found ${paths.length}.`);
  }
  const captureIds = new Set();
  const sessionIds = new Set();
  const observationIds = new Set();
  const seenPairs = new Set();
  /** @type {Array<{bytes:Uint8Array,transcript:any}>} */
  const validated = [];
  for (const filename of paths) {
    const bytes = await readTranscript(filename, rootReal);
    const transcript = JSON.parse(new TextDecoder().decode(bytes));
    validateTranscript(transcript, caseIds);
    const pair = `${transcript.case_id}\0${transcript.repeat}`;
    if (!expectedPairs.has(pair) || seenPairs.has(pair)
      || captureIds.has(transcript.capture_id)
      || sessionIds.has(transcript.session_id)
      || observationIds.has(transcript.operator_witness.observation_id)) {
      throw new Error(`Duplicate or unexpected sealed transcript identity: ${filename}`);
    }
    seenPairs.add(pair);
    captureIds.add(transcript.capture_id);
    sessionIds.add(transcript.session_id);
    observationIds.add(transcript.operator_witness.observation_id);
    validated.push({ bytes, transcript });
  }
  if (seenPairs.size !== expectedPairs.size
    || [...expectedPairs].some((pair) => !seenPairs.has(pair))) {
    throw new Error('Sealed transcripts do not match the exact catalog case and repeat set.');
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!isRecord(manifest) || !isRecord(manifest.capture_ledger)) {
    throw new Error('Release manifest has no capture ledger descriptor.');
  }
  const captures = validated.map(({ bytes, transcript }) => ({
    capture_id: transcript.capture_id,
    case_id: transcript.case_id,
    system: transcript.system,
    repeat: transcript.repeat,
    session_id: transcript.session_id,
    source_sha256: transcript.source_sha256,
    task_sha256: transcript.task_sha256,
    runtime_revision: transcript.runtime_revision,
    artifact_digests: transcript.artifact_digests,
    operator_witness: transcript.operator_witness,
    transcript: {
      repository_path: path.posix.join(
        'benchmark/release/v1/evidence', transcript.case_id.toLowerCase(),
        `repeat-${transcript.repeat}`, 'transcript.json'
      ),
      sha256: sha256(bytes)
    }
  })).sort((left, right) => left.capture_id.localeCompare(right.capture_id));
  const ledgerBytes = `${JSON.stringify({
    schema_version: '1.0.0',
    ledger_id: 'generate-test-cases-single-system-captures-v1',
    policy_id: 'generate-test-cases-single-system-public-prd-v1',
    system: 'generate-test-cases',
    captures
  }, null, 2)}\n`;
  manifest.capture_ledger.sha256 = sha256(ledgerBytes);
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;

  const stageRoot = await mkdtemp(path.join(releaseRoot, '.capture-ledger-stage-'));
  try {
    const stagedEvidence = path.join(stageRoot, 'evidence');
    await mkdir(stagedEvidence);
    for (const { bytes, transcript } of validated) {
      const destination = path.join(
        stagedEvidence, transcript.case_id.toLowerCase(),
        `repeat-${transcript.repeat}`, 'transcript.json'
      );
      if (!isInside(stagedEvidence, destination)) throw new Error('Staged evidence path escaped its root.');
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
    await writeFile(path.join(stageRoot, 'captures.json'), ledgerBytes);
    await writeFile(path.join(stageRoot, 'manifest.json'), manifestBytes);
    await installStagedOutputs(stageRoot);
    return { captures: captures.length, ledger_sha256: sha256(ledgerBytes) };
  } finally {
    await rm(stageRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  buildCaptureLedger().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => process.stdout.write(`${JSON.stringify({ status: 'fatal', message: error instanceof Error ? error.message : String(error) })}\n`)
  );
}
