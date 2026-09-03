import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));

/** @param {unknown} value */
function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  return value.split(/[\\/]+/u).every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** @param {string} candidateRoot @param {string[]} args */
async function gitOutput(candidateRoot, args) {
  const { stdout } = /** @type {any} */ (await execFileAsync('git', args, {
    cwd: candidateRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000, env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' }
  }));
  return stdout;
}

/** @param {string} candidateRoot @param {string} head @param {string} prefix */
async function gitTreeEntries(candidateRoot, head, prefix) {
  const output = await gitOutput(candidateRoot, ['ls-tree', '-r', head, '--', prefix]);
  if (output.length === 0) throw new Error(`Candidate tree is missing ${prefix}.`);
  return output.trimEnd().split('\n').map((/** @type {string} */ line) => {
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

/** @param {string} candidateRoot @param {string} head @param {string} relativePath */
async function gitBlob(candidateRoot, head, relativePath) {
  const entries = await gitTreeEntries(candidateRoot, head, relativePath);
  if (entries.length !== 1 || entries[0].relativePath !== relativePath) {
    throw new Error(`Candidate tree does not contain exactly one regular file at ${relativePath}.`);
  }
  return gitOutput(candidateRoot, ['show', `${head}:${relativePath}`]);
}

/** @param {string} candidateRoot @param {string} head @param {string} prefix @param {string} suffix @param {string} displayBase */
async function gitFileSetDigest(candidateRoot, head, prefix, suffix, displayBase) {
  const treeEntries = (await gitTreeEntries(candidateRoot, head, prefix))
    .filter((/** @type {{mode:string,objectId:string,relativePath:string}} */ entry) => entry.relativePath.endsWith(suffix));
  if (treeEntries.length === 0) throw new Error(`Candidate tree has no ${suffix} files under ${prefix}.`);
  const entries = [];
  for (const entry of treeEntries.sort((
    /** @type {{relativePath:string}} */ left,
    /** @type {{relativePath:string}} */ right
  ) => left.relativePath.localeCompare(right.relativePath))) {
    const bytes = await gitOutput(candidateRoot, ['show', `${head}:${entry.relativePath}`]);
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
    const absoluteRoot = path.resolve(candidateRoot);
    const absoluteManifest = path.resolve(manifestPath);
    const manifestRelative = path.relative(absoluteRoot, absoluteManifest).split(path.sep).join('/');
    if (!manifestRelative || manifestRelative === '..' || manifestRelative.startsWith('../')
      || !isSafeRelativePath(manifestRelative)) throw new Error('Benchmark manifest must be inside the candidate checkout.');
    const headBefore = (await gitOutput(absoluteRoot, ['rev-parse', 'HEAD'])).trim();
    const statusBefore = await gitOutput(absoluteRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
    const compilerDigest = await gitFileSetDigest(absoluteRoot, headBefore, 'src', '.mjs', '');
    const schemaDigest = await gitFileSetDigest(
      absoluteRoot, headBefore, 'skill/generate-test-cases/scripts/schemas', '.json',
      'skill/generate-test-cases/scripts'
    );
    const schemaManifestBytes = await gitBlob(absoluteRoot, headBefore, 'skill/generate-test-cases/scripts/schema-manifest.json');
    const skillBytes = await gitBlob(absoluteRoot, headBefore, 'skill/generate-test-cases/SKILL.md');
    const bundleBytes = await gitBlob(absoluteRoot, headBefore, 'skill/generate-test-cases/scripts/test-compiler.mjs');
    const benchmarkManifestBytes = await gitBlob(absoluteRoot, headBefore, manifestRelative);
    const benchmarkManifestDigest = createHash('sha256').update(benchmarkManifestBytes).digest('hex');
    const statusAfter = await gitOutput(absoluteRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
    const headAfter = (await gitOutput(absoluteRoot, ['rev-parse', 'HEAD'])).trim();
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
  const absoluteRoot = path.resolve(candidateRoot);
  const relativePath = path.relative(absoluteRoot, path.resolve(filename)).split(path.sep).join('/');
  if (!relativePath || relativePath === '..' || relativePath.startsWith('../')
    || !isSafeRelativePath(relativePath)) throw new Error('Candidate evidence escaped its checkout.');
  const committed = await gitBlob(absoluteRoot, head, relativePath);
  const loadedDigest = createHash('sha256').update(bytes).digest('hex');
  const committedDigest = createHash('sha256').update(committed).digest('hex');
  if (loadedDigest !== committedDigest) {
    throw new Error(`Loaded benchmark evidence does not match ${head}:${relativePath}.`);
  }
}
