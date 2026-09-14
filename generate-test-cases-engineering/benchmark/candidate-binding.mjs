import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const DEFAULT_REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const CANDIDATE_BINDING_TIMEOUT_MS = 30_000;
const MAX_GIT_TREE_ENTRIES = 4096;
const MAX_CANDIDATE_ARTIFACT_BYTES = 64 * 1024 * 1024;

/** @param {unknown} value */
function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  return value.split(/[\\/]+/u).every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** @param {number} deadline */
function remainingTimeout(deadline) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Candidate binding exceeded its fixed deadline.');
  return Math.max(1, Math.min(CANDIDATE_BINDING_TIMEOUT_MS, remaining));
}

/** @param {string} candidateRoot @param {string[]} args @param {number} deadline */
async function gitOutput(candidateRoot, args, deadline) {
  const { stdout } = /** @type {any} */ (await execFileAsync('git', args, {
    cwd: candidateRoot, encoding: 'utf8', maxBuffer: MAX_CANDIDATE_ARTIFACT_BYTES,
    timeout: remainingTimeout(deadline), env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
  }));
  return stdout;
}

/** @param {string} candidateRoot @param {number} deadline */
async function resolveGitLayout(candidateRoot, deadline) {
  const projectRoot = await fsPromises.realpath(path.resolve(candidateRoot));
  const gitRoot = await fsPromises.realpath(path.resolve((await gitOutput(
    projectRoot, ['rev-parse', '--show-toplevel'], deadline
  )).trim()));
  const relativeProject = path.relative(gitRoot, projectRoot).split(path.sep).join('/');
  if (relativeProject === '..' || relativeProject.startsWith('../')
    || (relativeProject.length > 0 && !isSafeRelativePath(relativeProject))) {
    throw new Error('Candidate project root escaped its Git checkout.');
  }
  return {
    projectRoot,
    gitRoot,
    projectPrefix: relativeProject,
    treePath: (/** @type {string} */ relativePath) => relativeProject.length > 0
      ? `${relativeProject}/${relativePath}`
      : relativePath
  };
}

/** @param {string} candidateRoot @param {string} head @param {string} prefix @param {number} deadline */
async function gitTreeEntries(candidateRoot, head, prefix, deadline) {
  const output = await gitOutput(candidateRoot, ['ls-tree', '-r', head, '--', prefix], deadline);
  if (output.length === 0) throw new Error(`Candidate tree is missing ${prefix}.`);
  const lines = output.trimEnd().split('\n');
  if (lines.length > MAX_GIT_TREE_ENTRIES) throw new Error(`Candidate tree has too many entries under ${prefix}.`);
  return lines.map((/** @type {string} */ line) => {
    const separator = line.indexOf('\t');
    const [mode, type, objectId] = line.slice(0, separator).split(' ');
    const relativePath = line.slice(separator + 1);
    if (separator < 0 || !['100644', '100755'].includes(mode) || type !== 'blob'
      || !/^[a-f0-9]+$/u.test(objectId) || !isSafeRelativePath(relativePath)) {
      throw new Error(`Candidate tree contains an unsafe entry under ${prefix}.`);
    }
    return { mode, objectId, relativePath };
  });
}

/** @param {string} candidateRoot @param {string} head @param {string} relativePath @param {number} deadline */
async function gitBlob(candidateRoot, head, relativePath, deadline) {
  const entries = await gitTreeEntries(candidateRoot, head, relativePath, deadline);
  if (entries.length !== 1 || entries[0].relativePath !== relativePath) {
    throw new Error(`Candidate tree does not contain exactly one regular file at ${relativePath}.`);
  }
  const bytes = await gitOutput(candidateRoot, ['show', `${head}:${relativePath}`], deadline);
  if (new TextEncoder().encode(bytes).byteLength > MAX_CANDIDATE_ARTIFACT_BYTES) {
    throw new Error(`Candidate artifact exceeds the size limit: ${relativePath}.`);
  }
  return bytes;
}

/** @param {string} candidateRoot @param {string} head @param {string} prefix @param {string} suffix @param {string} displayBase @param {number} deadline */
async function gitFileSetDigest(candidateRoot, head, prefix, suffix, displayBase, deadline) {
  const treeEntries = (await gitTreeEntries(candidateRoot, head, prefix, deadline))
    .filter((/** @type {{mode:string,objectId:string,relativePath:string}} */ entry) => entry.relativePath.endsWith(suffix));
  if (treeEntries.length === 0) throw new Error(`Candidate tree has no ${suffix} files under ${prefix}.`);
  const entries = [];
  let totalBytes = 0;
  for (const entry of treeEntries.sort((
    /** @type {{relativePath:string}} */ left,
    /** @type {{relativePath:string}} */ right
  ) => left.relativePath.localeCompare(right.relativePath))) {
    const bytes = await gitOutput(candidateRoot, ['show', `${head}:${entry.relativePath}`], deadline);
    totalBytes += new TextEncoder().encode(bytes).byteLength;
    if (totalBytes > MAX_CANDIDATE_ARTIFACT_BYTES) throw new Error('Candidate artifact set exceeds the size limit.');
    entries.push({
      path: displayBase ? path.posix.relative(displayBase, entry.relativePath) : entry.relativePath,
      sha256: createHash('sha256').update(bytes).digest('hex')
    });
  }
  return createHash('sha256').update(JSON.stringify(entries)).digest('hex');
}

/** @param {string} manifestPath @param {string} expectedManifestDigest @param {string} [candidateRoot] */
export async function deriveCandidateBinding(
  manifestPath, expectedManifestDigest, candidateRoot = DEFAULT_REPOSITORY_ROOT
) {
  try {
    const deadline = Date.now() + CANDIDATE_BINDING_TIMEOUT_MS;
    const layout = await resolveGitLayout(candidateRoot, deadline);
    const absoluteRoot = layout.projectRoot;
    const absoluteManifest = await fsPromises.realpath(path.resolve(manifestPath));
    const manifestRelative = path.relative(absoluteRoot, absoluteManifest).split(path.sep).join('/');
    if (!manifestRelative || manifestRelative === '..' || manifestRelative.startsWith('../')
      || !isSafeRelativePath(manifestRelative)) throw new Error('Benchmark manifest must be inside the candidate checkout.');
    const headBefore = (await gitOutput(layout.gitRoot, ['rev-parse', 'HEAD'], deadline)).trim();
    const statusBefore = await gitOutput(layout.gitRoot, ['status', '--porcelain=v1', '--untracked-files=all'], deadline);
    const compilerDigest = await gitFileSetDigest(
      layout.gitRoot, headBefore, layout.treePath('src'), '.mjs', layout.projectPrefix, deadline
    );
    const schemaDigest = await gitFileSetDigest(
      layout.gitRoot, headBefore, layout.treePath('skill/generate-test-cases/scripts/schemas'), '.json',
      layout.treePath('skill/generate-test-cases/scripts'), deadline
    );
    const schemaManifestBytes = await gitBlob(layout.gitRoot, headBefore, layout.treePath('skill/generate-test-cases/scripts/schema-manifest.json'), deadline);
    const skillBytes = await gitBlob(layout.gitRoot, headBefore, layout.treePath('skill/generate-test-cases/SKILL.md'), deadline);
    const bundleBytes = await gitBlob(layout.gitRoot, headBefore, layout.treePath('skill/generate-test-cases/scripts/test-compiler.mjs'), deadline);
    const benchmarkManifestBytes = await gitBlob(layout.gitRoot, headBefore, layout.treePath(manifestRelative), deadline);
    const benchmarkManifestDigest = createHash('sha256').update(benchmarkManifestBytes).digest('hex');
    const statusAfter = await gitOutput(layout.gitRoot, ['status', '--porcelain=v1', '--untracked-files=all'], deadline);
    const headAfter = (await gitOutput(layout.gitRoot, ['rev-parse', 'HEAD'], deadline)).trim();
    return {
      final_candidate_sha: headBefore,
      worktree_clean: statusBefore.length === 0 && statusAfter.length === 0 && headBefore === headAfter
        && /^[a-f0-9]{64}$/u.test(expectedManifestDigest) && expectedManifestDigest === benchmarkManifestDigest,
      compiler_sha256: compilerDigest,
      schema_sha256: schemaDigest,
      schema_manifest_sha256: createHash('sha256').update(schemaManifestBytes).digest('hex'),
      skill_sha256: createHash('sha256').update(skillBytes).digest('hex'),
      bundle_sha256: createHash('sha256').update(bundleBytes).digest('hex'),
      benchmark_manifest_sha256: benchmarkManifestDigest
    };
  } catch {
    return {
      final_candidate_sha: null, worktree_clean: false,
      compiler_sha256: null, schema_sha256: null, schema_manifest_sha256: null,
      skill_sha256: null, bundle_sha256: null, benchmark_manifest_sha256: null
    };
  }
}

/** @param {any} initial @param {any} final */
export function reconcileCandidateBindings(initial, final) {
  const digestFields = [
    'compiler_sha256', 'schema_sha256', 'schema_manifest_sha256',
    'skill_sha256', 'bundle_sha256', 'benchmark_manifest_sha256'
  ];
  const initialRecord = initial && typeof initial === 'object' ? initial : {};
  const finalRecord = final && typeof final === 'object' ? final : initialRecord;
  const sameCandidate = initialRecord.worktree_clean === true
    && finalRecord.worktree_clean === true
    && typeof initialRecord.final_candidate_sha === 'string'
    && initialRecord.final_candidate_sha === finalRecord.final_candidate_sha
    && digestFields.every((field) => typeof initialRecord[field] === 'string'
      && initialRecord[field] === finalRecord[field]);
  return { ...finalRecord, worktree_clean: sameCandidate };
}

/** @param {string} candidateRoot @param {string} head @param {string} filename @param {any} bytes */
export async function verifyCandidateEvidenceBytes(candidateRoot, head, filename, bytes) {
  const deadline = Date.now() + CANDIDATE_BINDING_TIMEOUT_MS;
  const layout = await resolveGitLayout(candidateRoot, deadline);
  const absoluteRoot = layout.projectRoot;
  const absoluteFilename = await fsPromises.realpath(path.resolve(filename));
  const relativePath = path.relative(absoluteRoot, absoluteFilename).split(path.sep).join('/');
  if (!relativePath || relativePath === '..' || relativePath.startsWith('../')
    || !isSafeRelativePath(relativePath)) throw new Error('Candidate evidence escaped its checkout.');
  const committed = await gitBlob(layout.gitRoot, head, layout.treePath(relativePath), deadline);
  const loadedDigest = createHash('sha256').update(bytes).digest('hex');
  const committedDigest = createHash('sha256').update(committed).digest('hex');
  if (loadedDigest !== committedDigest) {
    throw new Error(`Loaded benchmark evidence does not match ${head}:${relativePath}.`);
  }
}
