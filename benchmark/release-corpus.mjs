import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalStringify } from '../src/canonical.mjs';
import { verifyCandidateEvidenceBytes } from './score.mjs';

export const RELEASE_CORPUS_STRATA = Object.freeze([
  'transaction/order/payment',
  'identity/role/permission',
  'workflow/approval/state',
  'form/configuration/input validation',
  'asynchronous integration/event',
  'time-window/quota/entitlement'
]);

const SHA256 = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const lstat = fsPromises.lstat;
const realpath = fsPromises.realpath;

/** @param {unknown} value */
function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** @param {unknown} value */
function isNonblankString(value) {
  return typeof value === 'string' && value.trim().length > 0 && value === value.trim();
}

/** @param {unknown} value */
function isDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
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

/** @param {unknown} value */
function isSafeRelativePath(value) {
  if (!isNonblankString(value) || path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
  const parts = /** @type {string} */ (value).split(/[\\/]+/u);
  return parts.every((/** @type {string} */ part) => part.length > 0 && part !== '.' && part !== '..');
}

/**
 * @param {string} urlValue
 * @param {string} repository
 * @param {string} commit
 */
function isImmutableGitHubUrl(urlValue, repository, commit) {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== 'https:') return false;
    const rawPrefix = `/${repository}/${commit}/`;
    const blobPrefix = `/${repository}/blob/${commit}/`;
    return (url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith(rawPrefix))
      || (url.hostname === 'github.com' && url.pathname.startsWith(blobPrefix));
  } catch {
    return false;
  }
}

/**
 * Read one corpus artifact without following links, bind its bytes to Git when
 * a clean candidate binding is available, and reject physical-path reuse.
 * @param {{catalogRoot:string,catalogRootReal:string,repositoryRoot:string,relativePath:unknown,expectedDigest:unknown,candidateBinding?:any,physicalPaths:Set<string>}} options
 */
async function readCorpusArtifact(options) {
  if (!isSafeRelativePath(options.relativePath) || !isDigest(options.expectedDigest)) {
    throw new Error('Corpus artifact descriptor is invalid.');
  }
  const relativePath = /** @type {string} */ (options.relativePath);
  const filename = path.resolve(options.catalogRoot, relativePath);
  const entry = await lstat(filename);
  if (entry.isSymbolicLink() || !entry.isFile() || entry.nlink !== 1) {
    throw new Error('Corpus artifact must be a regular singly linked file.');
  }
  const resolved = await realpath(filename);
  if (!isInside(options.catalogRootReal, resolved) || options.physicalPaths.has(resolved)) {
    throw new Error('Corpus artifact escaped or reused its physical path.');
  }
  options.physicalPaths.add(resolved);
  const bytes = await readFile(resolved);
  if (sha256(bytes) !== options.expectedDigest) throw new Error('Corpus artifact digest mismatch.');
  if (options.candidateBinding?.worktree_clean === true) {
    await verifyCandidateEvidenceBytes(
      options.repositoryRoot,
      options.candidateBinding.final_candidate_sha,
      resolved,
      bytes
    );
  }
  return bytes;
}

/**
 * Validate only the public PRD corpus used by the replacement release gate.
 * Legacy comparator, review, adjudication, and defect assets are intentionally
 * outside this boundary and are neither read nor required.
 *
 * @param {string} catalogPath
 * @param {string} repositoryRoot
 * @param {any} [candidateBinding]
 */
export async function validateReleaseCorpus(catalogPath, repositoryRoot, candidateBinding) {
  /** @type {{code:string,path:string,message:string,severity:'error'|'incomplete'}[]} */
  const issues = [];
  /** @param {string} code @param {string} issuePath @param {string} message @param {'error'|'incomplete'} [severity] */
  const issue = (code, issuePath, message, severity = 'error') => {
    issues.push({ code, path: issuePath, message, severity });
  };
  const absoluteRepositoryRoot = path.resolve(repositoryRoot);
  const absoluteCatalogPath = path.resolve(catalogPath);
  const catalogRoot = path.dirname(absoluteCatalogPath);
  let catalog;
  let catalogRootReal;
  try {
    [catalog, catalogRootReal] = await Promise.all([
      readFile(absoluteCatalogPath, 'utf8').then(JSON.parse),
      realpath(catalogRoot)
    ]);
  } catch (error) {
    issue('CORPUS_CATALOG_UNREADABLE', '/', `Cannot read corpus catalog: ${/** @type {any} */ (error).message ?? 'unknown error'}`);
    return { status: 'invalid', cases: [], by_stratum: Object.fromEntries(RELEASE_CORPUS_STRATA.map((stratum) => [stratum, 0])), corpus_digest: '0'.repeat(64), issues };
  }

  if (!isRecord(catalog) || !Array.isArray(catalog.items)) {
    issue('CORPUS_CATALOG_INVALID', '/', 'Corpus catalog must contain an items array.');
  }
  const physicalPaths = new Set();
  /** @type {any[]} */
  const cases = [];
  const byStratum = Object.fromEntries(RELEASE_CORPUS_STRATA.map((stratum) => [stratum, 0]));
  const caseIds = new Set();
  const sourceDigests = new Set();

  for (const [index, item] of (Array.isArray(catalog?.items) ? catalog.items : []).entries()) {
    if (item?.status !== 'pilot-admitted') continue;
    const itemPath = `/items/${index}`;
    if (!isRecord(item)
      || !isNonblankString(item.pilot_id)
      || caseIds.has(item.pilot_id)
      || !isNonblankString(item.repository)
      || typeof item.commit !== 'string' || !COMMIT.test(item.commit)
      || !RELEASE_CORPUS_STRATA.includes(item.stratum)
      || !isRecord(item.source) || !isRecord(item.license)
      || !isRecord(item.provenance) || !isRecord(item.task)) {
      issue('CORPUS_ITEM_INVALID', itemPath, 'Admitted corpus item has an invalid identity or evidence descriptor.');
      continue;
    }
    caseIds.add(item.pilot_id);
    if (sourceDigests.has(item.source.sha256)) {
      issue('CORPUS_SOURCE_DUPLICATE', `${itemPath}/source/sha256`, 'Every admitted case must contain distinct PRD bytes.');
    } else if (isDigest(item.source.sha256)) sourceDigests.add(item.source.sha256);
    /** @type {Array<[string, any]>} */
    const descriptors = [
      ['source', item.source],
      ['license', item.license],
      ['provenance', item.provenance],
      ['task', item.task]
    ];
    /** @type {Record<string,any>} */
    const retained = {};
    for (const [kind, descriptor] of descriptors) {
      try {
        retained[kind] = await readCorpusArtifact({
          catalogRoot, catalogRootReal, repositoryRoot: absoluteRepositoryRoot,
          relativePath: descriptor.path, expectedDigest: descriptor.sha256,
          candidateBinding, physicalPaths
        });
      } catch (error) {
        issue('CORPUS_DIGEST_MISMATCH', `${itemPath}/${kind}`, `Cannot verify retained ${kind}: ${/** @type {any} */ (error).message ?? 'unknown error'}`);
      }
    }
    if (!isDigest(item.source.sha256)
      || item.source.content_digest !== item.source.sha256
      || !isImmutableGitHubUrl(item.source.upstream_url, item.repository, item.commit)
      || !isDigest(item.license.sha256)
      || !isImmutableGitHubUrl(item.license.upstream_url, item.repository, item.commit)
      || item.license.scope_decision !== 'applicable'
      || !isDigest(item.provenance.sha256)
      || !isDigest(item.task.sha256)) {
      issue('CORPUS_PROVENANCE_INVALID', itemPath, 'Source and license provenance must be immutable, applicable, and digest-bound.');
    }
    try {
      const provenance = JSON.parse(retained.provenance?.toString('utf8') ?? 'null');
      const task = JSON.parse(retained.task?.toString('utf8') ?? 'null');
      if (provenance?.repository !== item.repository
        || provenance?.commit !== item.commit
        || provenance?.source_sha256 !== item.source.sha256
        || provenance?.license_sha256 !== item.license.sha256
        || task?.case_id !== item.pilot_id
        || task?.scope !== item.task.scope
        || task?.stratum !== item.stratum
        || !Array.isArray(task?.source_paths)
        || task.source_paths.length !== 1
        || task.source_paths[0] !== item.source.path) {
        issue('CORPUS_METADATA_MISMATCH', itemPath, 'Retained provenance or task metadata does not match the catalog item.');
      }
    } catch (error) {
      issue('CORPUS_METADATA_INVALID', itemPath, `Cannot parse retained provenance or task metadata: ${/** @type {any} */ (error).message ?? 'unknown error'}`);
    }
    cases.push({
      case_id: item.pilot_id,
      stratum: item.stratum,
      source_sha256: item.source.sha256,
      task_sha256: item.task.sha256,
      task_scope: item.task.scope,
      source_id: item.source.source_id,
      repository: item.repository,
      commit: item.commit,
      source_path: item.source.path
    });
    byStratum[item.stratum] += 1;
  }

  if (cases.length !== 30) issue('CORPUS_CASE_COUNT_INCOMPLETE', '/items', 'Exactly 30 admitted public PRDs are required.', 'incomplete');
  for (const stratum of RELEASE_CORPUS_STRATA) {
    if (byStratum[stratum] !== 5) issue('CORPUS_STRATUM_INCOMPLETE', `/by_stratum/${stratum}`, 'Exactly five PRDs are required in every stratum.', 'incomplete');
  }
  issues.sort((left, right) => `${left.path}\0${left.code}`.localeCompare(`${right.path}\0${right.code}`));
  const status = issues.some((entry) => entry.severity === 'error')
    ? 'invalid'
    : issues.length > 0 ? 'incomplete' : 'valid';
  return {
    status,
    cases,
    by_stratum: byStratum,
    corpus_digest: sha256(canonicalStringify(cases)),
    issues
  };
}
