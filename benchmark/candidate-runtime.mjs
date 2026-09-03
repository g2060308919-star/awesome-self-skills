import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const RUNTIME_PREFIX = 'skill/generate-test-cases/scripts/';
const REQUIRED_FILES = Object.freeze([
  `${RUNTIME_PREFIX}test-compiler.mjs`,
  `${RUNTIME_PREFIX}schema-manifest.json`,
  `${RUNTIME_PREFIX}schemas/reply.schema.json`,
  `${RUNTIME_PREFIX}schemas/test-bundle.schema.json`
]);
const REVISION = /^[a-f0-9]{40}$/u;
const MAX_RUNTIME_BYTES = 64 * 1024 * 1024;
const GIT_TIMEOUT_MS = 30_000;

/** @param {string} root @param {string[]} args */
async function git(root, args) {
  return /** @type {any} */ (await execFileAsync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_RUNTIME_BYTES,
    timeout: GIT_TIMEOUT_MS,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
  })).stdout;
}

/** @param {string} root */
async function rejectLocalObjectSubstitution(root) {
  const replacements = await git(root, ['replace', '-l']);
  if (replacements.trim().length > 0) throw new Error('Git replace refs are forbidden for a release candidate.');
  const graftPath = (await git(root, ['rev-parse', '--git-path', 'info/grafts'])).trim();
  try {
    const graftStat = await stat(path.resolve(root, graftPath));
    if (graftStat.size > 0) throw new Error('Git grafts are forbidden for a release candidate.');
  } catch (error) {
    if (/** @type {any} */ (error).code !== 'ENOENT') throw error;
  }
}

/** @param {string} value */
function safeTreePath(value) {
  return value.startsWith(RUNTIME_PREFIX)
    && !path.posix.isAbsolute(value)
    && value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

/**
 * Export the installed runtime directly from one immutable Git tree. The
 * caller executes only this temporary copy, never the mutable checkout.
 * @param {string} repositoryRoot
 * @param {string} revision
 */
export async function materializeCandidateRuntime(repositoryRoot, revision) {
  if (typeof revision !== 'string' || !REVISION.test(revision)) {
    throw new Error('Candidate runtime revision is invalid.');
  }
  const root = path.resolve(repositoryRoot);
  await rejectLocalObjectSubstitution(root);
  const listing = await git(root, ['ls-tree', '-r', '--name-only', revision, '--', RUNTIME_PREFIX]);
  const files = listing.trimEnd().split('\n').filter(Boolean);
  if (files.length === 0 || files.length > 64 || files.some((/** @type {string} */ entry) => !safeTreePath(entry))) {
    throw new Error('Candidate runtime tree is missing or unsafe.');
  }
  for (const required of REQUIRED_FILES) {
    if (!files.includes(required)) throw new Error(`Candidate runtime is missing ${required}.`);
  }
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'generate-test-cases-candidate-runtime-'));
  let totalBytes = 0;
  try {
    for (const relativePath of files) {
      const bytes = await git(root, ['show', `${revision}:${relativePath}`]);
      totalBytes += new TextEncoder().encode(bytes).byteLength;
      if (totalBytes > MAX_RUNTIME_BYTES) throw new Error('Candidate runtime exceeds the fixed byte limit.');
      const destination = path.join(temporaryRoot, relativePath);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes, 'utf8');
    }
    const scriptsRoot = path.join(temporaryRoot, RUNTIME_PREFIX);
    return {
      root: temporaryRoot,
      runnerPath: path.join(scriptsRoot, 'test-compiler.mjs'),
      replySchemaPath: path.join(scriptsRoot, 'schemas/reply.schema.json'),
      bundleSchemaPath: path.join(scriptsRoot, 'schemas/test-bundle.schema.json'),
      cleanup: () => rm(temporaryRoot, { recursive: true, force: true })
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}
