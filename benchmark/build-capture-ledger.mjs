import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const workRoot = path.join(repositoryRoot, 'benchmark/release/v1/operator-work');
const evidenceRoot = path.join(repositoryRoot, 'benchmark/release/v1/evidence');
const ledgerPath = path.join(repositoryRoot, 'benchmark/release/v1/captures.json');
const manifestPath = path.join(repositoryRoot, 'benchmark/release/v1/manifest.json');
const EXPECTED_TRANSCRIPT_KEYS = Object.freeze([
  'schema_version', 'capture_id', 'case_id', 'system', 'repeat', 'session_id',
  'source_sha256', 'task_sha256', 'runtime_revision', 'artifact_digests',
  'operator_witness', 'events'
]);

/** @param {any} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {any} value */
function exactTranscript(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...EXPECTED_TRANSCRIPT_KEYS].sort().join('\0')
    && value.schema_version === '1.0.0'
    && value.system === 'generate-test-cases'
    && [1, 2, 3].includes(value.repeat)
    && value.operator_witness?.method === 'operator-observed-codex-subagent-v1'
    && value.operator_witness?.operator_task_id === '/root'
    && Array.isArray(value.events)
    && value.events.at(-1)?.reply?.status === 'finished';
}

/** @param {string} root */
async function transcriptPaths(root) {
  /** @type {string[]} */
  const found = [];
  /** @type {string[]} */
  const pending = [root];
  while (pending.length > 0) {
    const directory = /** @type {string} */ (pending.pop());
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(filename);
      else if (entry.isFile() && entry.name === 'transcript.json') found.push(filename);
    }
  }
  return found.sort();
}

export async function buildCaptureLedger() {
  const paths = await transcriptPaths(workRoot);
  if (paths.length !== 90) throw new Error(`Expected exactly 90 sealed transcripts; found ${paths.length}.`);
  const captureIds = new Set();
  const sessionIds = new Set();
  const observationIds = new Set();
  /** @type {any[]} */
  const captures = [];
  for (const filename of paths) {
    const bytes = await readFile(filename);
    const transcript = JSON.parse(bytes.toString('utf8'));
    if (!exactTranscript(transcript)
      || captureIds.has(transcript.capture_id)
      || sessionIds.has(transcript.session_id)
      || observationIds.has(transcript.operator_witness.observation_id)) {
      throw new Error(`Invalid or duplicate sealed transcript: ${filename}`);
    }
    captureIds.add(transcript.capture_id);
    sessionIds.add(transcript.session_id);
    observationIds.add(transcript.operator_witness.observation_id);
    const destination = path.join(
      evidenceRoot, transcript.case_id.toLowerCase(), `repeat-${transcript.repeat}`, 'transcript.json'
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
    captures.push({
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
        repository_path: path.relative(repositoryRoot, destination).split(path.sep).join('/'),
        sha256: sha256(bytes)
      }
    });
  }
  captures.sort((left, right) => left.capture_id.localeCompare(right.capture_id));
  const ledgerBytes = `${JSON.stringify({
    schema_version: '1.0.0',
    ledger_id: 'generate-test-cases-single-system-captures-v1',
    policy_id: 'generate-test-cases-single-system-public-prd-v1',
    system: 'generate-test-cases',
    captures
  }, null, 2)}\n`;
  await writeFile(ledgerPath, ledgerBytes);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.capture_ledger.sha256 = sha256(ledgerBytes);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { captures: captures.length, ledger_sha256: sha256(ledgerBytes) };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  buildCaptureLedger().then(
    (result) => process.stdout.write(`${JSON.stringify(result)}\n`),
    (error) => process.stdout.write(`${JSON.stringify({ status: 'fatal', message: error instanceof Error ? error.message : String(error) })}\n`)
  );
}
