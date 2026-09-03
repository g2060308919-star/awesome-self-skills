import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { deriveCandidateBinding } from './candidate-binding.mjs';
import {
  OPERATOR_TASK_ID,
  OPERATOR_WITNESS_METHOD,
  isAllowedAgentForCase
} from './operator-witness.mjs';

const execFileAsync = promisify(execFile);
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const cryptoModule = /** @type {any} */ (await import('node:crypto'));
const randomUUID = cryptoModule.randomUUID ?? cryptoModule.default.randomUUID;
const repositoryRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const manifestPath = path.join(repositoryRoot, 'benchmark/release/v1/manifest.json');
const catalogPath = path.join(repositoryRoot, 'benchmark/public-pilot/v1/catalog.json');
const operatorRoot = path.join(repositoryRoot, 'benchmark/release/v1/operator-work');
const runnerPath = path.join(repositoryRoot, 'skill/generate-test-cases/scripts/test-compiler.mjs');
const STAGE_FILES = Object.freeze({
  source_pack: 'source-pack.json', evidence_claims: 'evidence-claims.json',
  behavior_views: 'behavior-views.json', case_drafts: 'case-drafts.json'
});
const MAX_AGENT_ARTIFACT_BYTES = 16 * 1024 * 1024;

/** @param {any} bytes */
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
  const normalized = structuredClone(reply);
  for (const key of ['artifact_path', 'bundle_path', 'markdown_path']) {
    if (typeof normalized[key] === 'string') {
      const filename = path.resolve(normalized[key]);
      if (!isInside(runDirectory, filename)) throw new Error(`Runner ${key} escaped the capture run.`);
      normalized[key] = path.relative(runDirectory, filename).split(path.sep).join('/');
    }
  }
  return normalized;
}

/** @param {string} runDirectory */
async function invokeRunner(runDirectory) {
  const result = await execFileAsync(process.execPath, [runnerPath, runDirectory], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    timeout: 30_000, killSignal: 'SIGKILL'
  });
  if (result.stderr !== '') throw new Error(`Runner wrote stderr: ${result.stderr}`);
  const lines = result.stdout.trimEnd().split('\n');
  if (lines.length !== 1) throw new Error(`Runner emitted ${lines.length} lines.`);
  return JSON.parse(lines[0]);
}

/** @param {string} workspace */
async function safeWorkspace(workspace) {
  if (!path.isAbsolute(workspace) || !isInside(operatorRoot, workspace)) {
    throw new Error('Capture workspace must be an absolute child of operator-work.');
  }
  return path.resolve(workspace);
}

/** @param {string} workspace @param {string} caseId @param {number} repeat @param {string} agentTaskId */
async function start(workspace, caseId, repeat, agentTaskId) {
  if (![1, 2, 3].includes(repeat) || !isAllowedAgentForCase(agentTaskId, caseId)) {
    throw new Error('Capture repeat or witnessed Agent task is invalid.');
  }
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  const item = catalog.items.find((/** @type {any} */ candidate) => candidate.pilot_id === caseId && candidate.status === 'pilot-admitted');
  if (!item) throw new Error('Capture case is not admitted in the public corpus.');
  await mkdir(operatorRoot, { recursive: true });
  await mkdir(workspace);
  const runDirectory = path.join(workspace, 'run');
  await mkdir(runDirectory);
  const manifestBytes = await readFile(manifestPath);
  const binding = await deriveCandidateBinding(manifestPath, sha256(manifestBytes), repositoryRoot);
  if (!binding.final_candidate_sha) throw new Error('Cannot derive the capture runtime revision.');
  const state = {
    schema_version: '1.0.0',
    capture_id: `${caseId}-r${repeat}`,
    case_id: caseId,
    system: 'generate-test-cases',
    repeat,
    session_id: `session-${randomUUID()}`,
    source_sha256: item.source.sha256,
    task_sha256: item.task.sha256,
    runtime_revision: binding.final_candidate_sha,
    artifact_digests: {
      compiler: binding.compiler_sha256,
      schema: binding.schema_sha256,
      schema_manifest: binding.schema_manifest_sha256,
      skill: binding.skill_sha256,
      bundle: binding.bundle_sha256
    },
    operator_witness: {
      method: OPERATOR_WITNESS_METHOD, operator_task_id: OPERATOR_TASK_ID,
      agent_task_id: agentTaskId, observation_id: `observation-${randomUUID()}`
    },
    expected_stage: 'source_pack',
    events: []
  };
  const reply = await invokeRunner(runDirectory);
  if (reply.status !== 'need_artifact' || reply.stage !== 'source_pack') {
    throw new Error('Fresh capture did not request source_pack.');
  }
  await writeFile(path.join(workspace, 'capture-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  return { status: 'started', workspace, reply };
}

/** @param {string} workspace @param {string} artifactPath */
async function submit(workspace, artifactPath) {
  const statePath = path.join(workspace, 'capture-state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  if (state?.schema_version !== '1.0.0'
    || state?.capture_id !== `${state?.case_id}-r${state?.repeat}`
    || ![1, 2, 3].includes(state?.repeat)
    || state?.operator_witness?.method !== OPERATOR_WITNESS_METHOD
    || state?.operator_witness?.operator_task_id !== OPERATOR_TASK_ID
    || !isAllowedAgentForCase(state?.operator_witness?.agent_task_id, state?.case_id)
    || typeof state?.session_id !== 'string' || state.session_id.trim().length === 0
    || typeof state?.operator_witness?.observation_id !== 'string'
    || state.operator_witness.observation_id.trim().length === 0) {
    throw new Error('Capture state no longer matches the witnessed Agent assignment.');
  }
  const absoluteArtifact = path.resolve(artifactPath);
  if (!path.isAbsolute(artifactPath) || !isInside(workspace, absoluteArtifact)) {
    throw new Error('Submitted artifact must be an absolute file inside the capture workspace.');
  }
  const artifactEntry = await fsPromises.lstat(absoluteArtifact);
  if (artifactEntry.isSymbolicLink() || !artifactEntry.isFile() || artifactEntry.nlink !== 1
    || artifactEntry.size > MAX_AGENT_ARTIFACT_BYTES) {
    throw new Error('Submitted artifact must be a bounded regular singly linked file.');
  }
  const [workspaceReal, artifactReal] = await Promise.all([
    fsPromises.realpath(workspace), fsPromises.realpath(absoluteArtifact)
  ]);
  if (!isInside(workspaceReal, artifactReal)) throw new Error('Submitted artifact resolved outside the capture workspace.');
  const artifact = JSON.parse(await readFile(absoluteArtifact, 'utf8'));
  const stage = state.expected_stage;
  const stageFile = /** @type {Record<string,string>} */ (STAGE_FILES)[stage];
  if (!stageFile) throw new Error('Capture has no writable Agent stage.');
  const staging = path.join(workspace, 'run/staging');
  await mkdir(staging, { recursive: true });
  await writeFile(path.join(staging, stageFile), `${JSON.stringify(artifact)}\n`);
  const reply = await invokeRunner(path.join(workspace, 'run'));
  const normalized = normalizeReply(reply, path.join(workspace, 'run'));
  state.events.push({ stage, artifact, reply: normalized });
  if (reply.status === 'need_artifact' || reply.status === 'need_revision') {
    state.expected_stage = reply.stage;
  } else if (reply.status === 'need_user_answers') {
    state.expected_stage = 'source_pack';
  } else if (reply.status === 'finished') {
    delete state.expected_stage;
    const transcript = {
      schema_version: state.schema_version,
      capture_id: state.capture_id,
      case_id: state.case_id,
      system: state.system,
      repeat: state.repeat,
      session_id: state.session_id,
      source_sha256: state.source_sha256,
      task_sha256: state.task_sha256,
      runtime_revision: state.runtime_revision,
      artifact_digests: state.artifact_digests,
      operator_witness: state.operator_witness,
      events: state.events
    };
    await writeFile(path.join(workspace, 'transcript.json'), `${JSON.stringify(transcript)}\n`);
  } else if (reply.status === 'fatal') {
    delete state.expected_stage;
  } else throw new Error('Runner returned an unsupported capture status.');
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return {
    status: reply.status === 'finished' ? 'sealed' : 'awaiting_submission',
    workspace, reply,
    transcript_path: reply.status === 'finished' ? path.join(workspace, 'transcript.json') : null
  };
}

async function main() {
  const [command, workspaceValue, ...args] = process.argv.slice(2);
  const workspace = await safeWorkspace(path.resolve(workspaceValue ?? ''));
  const result = command === 'start' && args.length === 3
    ? await start(workspace, args[0], Number(args[1]), args[2])
    : command === 'submit' && args.length === 1
      ? await submit(workspace, args[0])
      : { status: 'fatal', message: 'Use start <workspace> <case-id> <repeat> <agent-task-id> or submit <workspace> <artifact-path>.' };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify({ status: 'fatal', message: error instanceof Error ? error.message : String(error) })}\n`);
  });
}
