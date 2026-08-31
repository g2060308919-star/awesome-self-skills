import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FROZEN_STRATA = Object.freeze([
  'transaction/order/payment',
  'identity/role/permission',
  'workflow/approval/state',
  'form/configuration/input validation',
  'asynchronous integration/event',
  'time-window/quota/entitlement'
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const RFC3339_DATE_TIME_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const ITEM_STATUSES = new Set(['pilot-admitted', 'hold', 'rejected']);
const RELEASE_STATUS = /** @type {'insufficient_evidence'} */ ('insufficient_evidence');
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const lstat = fsPromises.lstat;
const realpath = fsPromises.realpath;

/** @param {Uint8Array | string} bytes */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {unknown} value */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {Array<{code: string, path: string, message: string, severity: 'error' | 'incomplete'}>} issues
 * @param {string} code
 * @param {string} issuePath
 * @param {string} message
 * @param {'error' | 'incomplete'} [severity]
 */
function addIssue(issues, code, issuePath, message, severity = 'error') {
  issues.push({ code, path: issuePath, message, severity });
}

/** @param {unknown} value */
function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** @param {unknown} value */
function isRfc3339DateTime(value) {
  if (typeof value !== 'string' || !RFC3339_DATE_TIME_PATTERN.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1] && Number.isFinite(Date.parse(value));
}

/**
 * @param {Record<string, unknown>} value
 * @param {Set<string>} allowed
 * @param {string} issuePath
 * @param {Array<any>} issues
 * @param {string} [code]
 * @param {string} [message]
 */
function rejectUnknownKeys(value, allowed, issuePath, issues, code = 'CATALOG_CONTRACT_INVALID', message = 'Unknown catalog field.') {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addIssue(issues, code, `${issuePath}/${key}`, message);
    }
  }
}

/**
 * @param {unknown} value
 * @param {string} issuePath
 * @param {Array<any>} issues
 * @param {string} [code]
 */
function requireObject(value, issuePath, issues, code = 'CATALOG_CONTRACT_INVALID') {
  if (!isObject(value)) {
    addIssue(issues, code, issuePath, 'Expected an object.');
    return null;
  }
  return /** @type {Record<string, any>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} issuePath
 * @param {Array<any>} issues
 * @param {string} [code]
 */
function requireString(value, issuePath, issues, code = 'CATALOG_CONTRACT_INVALID') {
  if (!nonEmptyString(value)) {
    addIssue(issues, code, issuePath, 'Expected a non-empty string.');
    return false;
  }
  return true;
}

/**
 * @param {unknown} value
 * @param {string} issuePath
 * @param {Array<any>} issues
 * @param {string} [code]
 */
function requireDigest(value, issuePath, issues, code = 'CATALOG_CONTRACT_INVALID') {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    addIssue(issues, code, issuePath, 'Expected a lowercase 64-character SHA-256 digest.');
    return false;
  }
  return true;
}

/** @param {string} root @param {string} candidate */
function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * @param {{
 *   root: string,
 *   rootReal: string,
 *   relativePath: unknown,
 *   expectedDigest: unknown,
 *   issuePath: string,
 *   mismatchCode: string,
 *   issues: Array<any>,
 *   physicalPaths: Map<string, string>
 * }} options
 */
async function readRetainedArtifact(options) {
  const {
    root,
    rootReal,
    relativePath,
    expectedDigest,
    issuePath,
    mismatchCode,
    issues,
    physicalPaths
  } = options;

  if (!nonEmptyString(relativePath)) {
    addIssue(issues, 'RETAINED_PATH_INVALID', `${issuePath}/path`, 'A retained artifact path is required.');
    return null;
  }

  const declaredPath = /** @type {string} */ (relativePath);
  if (path.isAbsolute(declaredPath) || path.win32.isAbsolute(declaredPath)) {
    addIssue(issues, 'ABSOLUTE_PATH_FORBIDDEN', `${issuePath}/path`, 'Retained paths must be relative to the catalog root.');
    return null;
  }

  const segments = declaredPath.split(/[\\/]+/);
  if (segments.includes('..')) {
    addIssue(issues, 'PATH_TRAVERSAL_FORBIDDEN', `${issuePath}/path`, 'Parent traversal is forbidden in retained paths.');
    return null;
  }
  if (segments.some((segment) => segment === '' || segment === '.')) {
    addIssue(issues, 'RETAINED_PATH_INVALID', `${issuePath}/path`, 'Retained paths must be normalized non-empty relative paths.');
    return null;
  }

  const absolutePath = path.resolve(root, declaredPath);
  if (!isWithin(root, absolutePath)) {
    addIssue(issues, 'PATH_OUTSIDE_CATALOG_ROOT', `${issuePath}/path`, 'Retained path resolves outside the catalog root.');
    return null;
  }

  let entry;
  try {
    entry = await lstat(absolutePath);
  } catch (error) {
    addIssue(issues, 'RETAINED_FILE_UNREADABLE', `${issuePath}/path`, `Cannot inspect retained file: ${/** @type {any} */ (error).code ?? 'unknown error'}.`);
    return null;
  }

  if (entry.isSymbolicLink()) {
    addIssue(issues, 'SYMLINK_FORBIDDEN', `${issuePath}/path`, 'Retained artifacts cannot be symbolic links.');
    return null;
  }
  if (!entry.isFile()) {
    addIssue(issues, 'RETAINED_FILE_INVALID', `${issuePath}/path`, 'Retained artifact must be a regular file.');
    return null;
  }

  let resolvedPath;
  let fileStat;
  try {
    [resolvedPath, fileStat] = await Promise.all([realpath(absolutePath), stat(absolutePath)]);
  } catch (error) {
    addIssue(issues, 'RETAINED_FILE_UNREADABLE', `${issuePath}/path`, `Cannot resolve retained file: ${/** @type {any} */ (error).code ?? 'unknown error'}.`);
    return null;
  }

  const expectedRealPath = path.resolve(rootReal, declaredPath);
  if (!isWithin(rootReal, resolvedPath)) {
    addIssue(issues, 'PATH_OUTSIDE_CATALOG_ROOT', `${issuePath}/path`, 'Resolved retained path escapes the catalog root.');
    return null;
  }
  if (resolvedPath !== expectedRealPath) {
    addIssue(issues, 'SYMLINK_FORBIDDEN', `${issuePath}/path`, 'A retained path component resolves through a symbolic link.');
    return null;
  }

  if (fileStat.nlink !== 1) {
    addIssue(issues, 'HARDLINK_FORBIDDEN', `${issuePath}/path`, 'Retained artifacts must have exactly one hard link.');
  }

  const physicalKeys = [
    `path:${resolvedPath}`,
    `inode:${String(fileStat.dev)}:${String(fileStat.ino)}`
  ];
  const priorBinding = physicalKeys.map((key) => physicalPaths.get(key)).find(Boolean);
  if (priorBinding !== undefined) {
    addIssue(issues, 'DUPLICATE_PHYSICAL_PATH', `${issuePath}/path`, `Retained file is already bound at ${priorBinding}.`);
  }
  for (const key of physicalKeys) {
    if (!physicalPaths.has(key)) physicalPaths.set(key, `${issuePath}/path`);
  }

  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    addIssue(issues, 'RETAINED_FILE_UNREADABLE', `${issuePath}/path`, `Cannot read retained file: ${/** @type {any} */ (error).code ?? 'unknown error'}.`);
    return null;
  }

  const actualDigest = sha256(bytes);
  const digestMatches = typeof expectedDigest === 'string' && actualDigest === expectedDigest;
  if (!digestMatches) {
    addIssue(issues, mismatchCode, `${issuePath}/sha256`, 'Declared SHA-256 does not match retained bytes.');
  }
  return { bytes, digest: actualDigest, digestMatches };
}

/**
 * @param {unknown} urlValue
 * @param {unknown} commitValue
 * @param {unknown} repositoryValue
 * @param {string} issuePath
 * @param {Array<any>} issues
 */
function validateImmutableGitHubUrl(urlValue, commitValue, repositoryValue, issuePath, issues) {
  if (!nonEmptyString(urlValue) || typeof commitValue !== 'string' || typeof repositoryValue !== 'string') {
    addIssue(issues, 'MUTABLE_GITHUB_URL', issuePath, 'Source and license URLs must be immutable GitHub blob/raw URLs.');
    return;
  }

  try {
    const url = new URL(/** @type {string} */ (urlValue));
    const match = url.hostname === 'github.com'
      ? url.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/([a-f0-9]{40})\/.+/i)
      : url.hostname === 'raw.githubusercontent.com'
        ? url.pathname.match(/^\/([^/]+)\/([^/]+)\/([a-f0-9]{40})\/.+/i)
        : null;
    if (url.protocol !== 'https:' || match?.[3]?.toLowerCase() !== commitValue.toLowerCase()) {
      addIssue(issues, 'MUTABLE_GITHUB_URL', issuePath, 'URL must contain the catalog item\'s exact 40-character commit.');
      return;
    }
    const urlRepository = `${match[1]}/${match[2]}`;
    if (urlRepository.toLowerCase() !== repositoryValue.toLowerCase()) {
      addIssue(issues, 'UPSTREAM_REPOSITORY_MISMATCH', issuePath, 'URL repository must match the catalog item repository.');
    }
  } catch {
    addIssue(issues, 'MUTABLE_GITHUB_URL', issuePath, 'Source and license URLs must be valid immutable GitHub URLs.');
  }
}

/**
 * @param {unknown} urlValue
 * @param {unknown} repositoryValue
 * @param {string} issuePath
 * @param {Array<any>} issues
 */
function validateGitHubIssueUrl(urlValue, repositoryValue, issuePath, issues) {
  if (!nonEmptyString(urlValue) || typeof repositoryValue !== 'string') {
    addIssue(issues, 'DEFECT_URL_INVALID', issuePath, 'Defect URL must be a GitHub issue URL for the catalog repository.');
    return;
  }
  try {
    const url = new URL(/** @type {string} */ (urlValue));
    const match = url.hostname === 'github.com'
      ? url.pathname.match(/^\/([^/]+)\/([^/]+)\/issues\/\d+$/i)
      : null;
    if (url.protocol !== 'https:' || !match) {
      addIssue(issues, 'DEFECT_URL_INVALID', issuePath, 'Defect URL must be an HTTPS GitHub issue URL.');
      return;
    }
    const urlRepository = `${match[1]}/${match[2]}`;
    if (urlRepository.toLowerCase() !== repositoryValue.toLowerCase()) {
      addIssue(issues, 'DEFECT_REPOSITORY_MISMATCH', issuePath, 'Defect URL repository must match the catalog item repository.');
    }
  } catch {
    addIssue(issues, 'DEFECT_URL_INVALID', issuePath, 'Defect URL must be a valid GitHub issue URL.');
  }
}

/**
 * @param {unknown} value
 * @param {string} issuePath
 * @param {Array<any>} issues
 */
function rejectForbiddenExpertClaims(value, issuePath, issues) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectForbiddenExpertClaims(entry, `${issuePath}/${index}`, issues));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(/** @type {Record<string, unknown>} */ (value))) {
    if (key === 'expert_annotations') {
      addIssue(issues, 'EXPERT_EVIDENCE_FORBIDDEN', `${issuePath}/${key}`, 'Pilot records cannot contain formal expert annotations.');
    }
    rejectForbiddenExpertClaims(entry, `${issuePath}/${key}`, issues);
  }
}

/**
 * @param {Record<string, any>} item
 * @param {number} itemIndex
 * @param {{
 *   root: string,
 *   rootReal: string,
 *   issues: Array<any>,
 *   physicalPaths: Map<string, string>,
 *   contentDigests: Map<string, string>,
 *   stableIds: Map<string, string>
 * }} context
 */
async function validateItem(item, itemIndex, context) {
  const { root, rootReal, issues, physicalPaths, contentDigests, stableIds } = context;
  const itemPath = `/items/${itemIndex}`;
  const errorsBefore = issues.filter((entry) => entry.severity === 'error').length;
  let countableDefects = 0;

  rejectUnknownKeys(item, new Set([
    'pilot_id', 'status', 'repository', 'commit', 'stratum', 'acquired_at',
    'source', 'license', 'provenance', 'task', 'reviews', 'defects'
  ]), itemPath, issues);

  for (const [field, code] of [
    ['pilot_id', 'CATALOG_CONTRACT_INVALID'],
    ['repository', 'REPOSITORY_INVALID'],
    ['acquired_at', 'ACQUISITION_TIME_INVALID']
  ]) requireString(item[field], `${itemPath}/${field}`, issues, code);

  if (!ITEM_STATUSES.has(item.status)) {
    addIssue(issues, 'ITEM_STATUS_INVALID', `${itemPath}/status`, 'Unknown pilot item status.');
  }
  if (typeof item.repository === 'string' && !/^[^/\s]+\/[^/\s]+$/.test(item.repository)) {
    addIssue(issues, 'REPOSITORY_INVALID', `${itemPath}/repository`, 'Repository identity must be owner/repository.');
  }
  if (typeof item.commit !== 'string' || !COMMIT_PATTERN.test(item.commit)) {
    addIssue(issues, 'COMMIT_INVALID', `${itemPath}/commit`, 'Commit must be a lowercase 40-character Git object ID.');
  }
  if (!FROZEN_STRATA.includes(item.stratum)) {
    addIssue(issues, 'STRATUM_INVALID', `${itemPath}/stratum`, 'Item must use exactly one frozen stratum.');
  }
  if (!isRfc3339DateTime(item.acquired_at)) {
    addIssue(issues, 'ACQUISITION_TIME_INVALID', `${itemPath}/acquired_at`, 'Acquisition time must be an RFC 3339 date-time.');
  }

  if (typeof item.pilot_id === 'string') {
    const prior = stableIds.get(`pilot:${item.pilot_id}`);
    if (prior !== undefined) addIssue(issues, 'DUPLICATE_STABLE_ID', `${itemPath}/pilot_id`, `Pilot ID is already used at ${prior}.`);
    else stableIds.set(`pilot:${item.pilot_id}`, `${itemPath}/pilot_id`);
  }

  const source = requireObject(item.source, `${itemPath}/source`, issues);
  let sourceArtifact = null;
  if (source) {
    rejectUnknownKeys(source, new Set(['source_id', 'path', 'sha256', 'content_digest', 'upstream_url']), `${itemPath}/source`, issues);
    requireString(source.source_id, `${itemPath}/source/source_id`, issues);
    requireDigest(source.sha256, `${itemPath}/source/sha256`, issues);
    requireDigest(source.content_digest, `${itemPath}/source/content_digest`, issues);
    requireString(source.upstream_url, `${itemPath}/source/upstream_url`, issues);
    validateImmutableGitHubUrl(source.upstream_url, item.commit, item.repository, `${itemPath}/source/upstream_url`, issues);
    sourceArtifact = await readRetainedArtifact({
      root, rootReal, relativePath: source.path, expectedDigest: source.sha256,
      issuePath: `${itemPath}/source`, mismatchCode: 'SOURCE_DIGEST_MISMATCH', issues, physicalPaths
    });
    if (sourceArtifact) {
      if (source.content_digest !== sourceArtifact.digest) {
        addIssue(issues, 'SOURCE_CONTENT_DIGEST_MISMATCH', `${itemPath}/source/content_digest`, 'Content digest must be recomputed from source bytes.');
      }
      const prior = contentDigests.get(sourceArtifact.digest);
      if (prior !== undefined) {
        addIssue(issues, 'DUPLICATE_CONTENT_DIGEST', `${itemPath}/source/content_digest`, `Source bytes duplicate ${prior}.`);
      } else {
        contentDigests.set(sourceArtifact.digest, `${itemPath}/source/content_digest`);
      }
    }
    if (typeof source.source_id === 'string') {
      const prior = stableIds.get(`source:${source.source_id}`);
      if (prior !== undefined) addIssue(issues, 'DUPLICATE_STABLE_ID', `${itemPath}/source/source_id`, `Source ID is already used at ${prior}.`);
      else stableIds.set(`source:${source.source_id}`, `${itemPath}/source/source_id`);
    }
  }

  const license = requireObject(item.license, `${itemPath}/license`, issues);
  if (license) {
    rejectUnknownKeys(license, new Set(['path', 'sha256', 'upstream_url', 'reported_license', 'scope_decision']), `${itemPath}/license`, issues);
    requireDigest(license.sha256, `${itemPath}/license/sha256`, issues);
    requireString(license.upstream_url, `${itemPath}/license/upstream_url`, issues);
    requireString(license.reported_license, `${itemPath}/license/reported_license`, issues);
    requireString(license.scope_decision, `${itemPath}/license/scope_decision`, issues);
    validateImmutableGitHubUrl(license.upstream_url, item.commit, item.repository, `${itemPath}/license/upstream_url`, issues);
    await readRetainedArtifact({
      root, rootReal, relativePath: license.path, expectedDigest: license.sha256,
      issuePath: `${itemPath}/license`, mismatchCode: 'LICENSE_DIGEST_MISMATCH', issues, physicalPaths
    });
    if (!['applicable', 'hold', 'inapplicable'].includes(license.scope_decision)) {
      addIssue(issues, 'LICENSE_SCOPE_INVALID', `${itemPath}/license/scope_decision`, 'Unknown license scope decision.');
    }
    if (item.status === 'pilot-admitted' && license.scope_decision !== 'applicable') {
      addIssue(issues, 'LICENSE_NOT_APPLICABLE', `${itemPath}/license/scope_decision`, 'A pilot-admitted item requires applicable copying and evaluation permission.');
    }
  }

  const provenance = requireObject(item.provenance, `${itemPath}/provenance`, issues, 'PROVENANCE_REQUIRED');
  if (provenance) {
    rejectUnknownKeys(provenance, new Set(['path', 'sha256']), `${itemPath}/provenance`, issues);
    requireString(provenance.path, `${itemPath}/provenance/path`, issues, 'PROVENANCE_REQUIRED');
    requireDigest(provenance.sha256, `${itemPath}/provenance/sha256`, issues, 'PROVENANCE_REQUIRED');
    const provenanceArtifact = await readRetainedArtifact({
      root, rootReal, relativePath: provenance.path, expectedDigest: provenance.sha256,
      issuePath: `${itemPath}/provenance`, mismatchCode: 'PROVENANCE_DIGEST_MISMATCH', issues, physicalPaths
    });
    if (provenanceArtifact) {
      let retainedProvenance;
      try {
        retainedProvenance = JSON.parse(provenanceArtifact.bytes.toString('utf8'));
      } catch {
        addIssue(issues, 'PROVENANCE_JSON_INVALID', `${itemPath}/provenance/path`, 'Retained provenance must be valid JSON.');
      }
      if (retainedProvenance !== undefined) {
        const provenanceRecord = requireObject(retainedProvenance, `${itemPath}/provenance/file`, issues, 'PROVENANCE_JSON_INVALID');
        if (provenanceRecord) {
          const expectedProvenance = {
            repository: item.repository,
            commit: item.commit,
            source_url: source?.upstream_url,
            source_sha256: source?.sha256,
            content_digest: source?.content_digest,
            license_url: license?.upstream_url,
            license_sha256: license?.sha256,
            reported_license: license?.reported_license,
            scope_decision: license?.scope_decision,
            acquired_at: item.acquired_at
          };
          rejectUnknownKeys(provenanceRecord, new Set(Object.keys(expectedProvenance)), `${itemPath}/provenance/file`, issues);
          for (const [field, expected] of Object.entries(expectedProvenance)) {
            if (!Object.hasOwn(provenanceRecord, field) || provenanceRecord[field] !== expected) {
              addIssue(issues, 'PROVENANCE_BINDING_INVALID', `${itemPath}/provenance/file/${field}`, `Retained provenance ${field} must match catalog metadata.`);
            }
          }
        }
      }
    }
  }

  const task = requireObject(item.task, `${itemPath}/task`, issues);
  if (task) {
    rejectUnknownKeys(task, new Set(['task_id', 'path', 'sha256', 'source_id', 'scope']), `${itemPath}/task`, issues);
    requireString(task.task_id, `${itemPath}/task/task_id`, issues);
    requireDigest(task.sha256, `${itemPath}/task/sha256`, issues);
    if (!nonEmptyString(task.source_id) || task.source_id !== source?.source_id) {
      addIssue(issues, 'TASK_BINDING_MISSING', `${itemPath}/task/source_id`, 'Task must bind explicitly to this item\'s source ID.');
    }
    if (!nonEmptyString(task.scope)
      || task.scope === 'public-source-machine-pilot'
      || FROZEN_STRATA.includes(task.scope)) {
      addIssue(issues, 'TASK_SCOPE_INVALID', `${itemPath}/task/scope`, 'Task scope must name a non-empty product capability and must not repeat the pilot evidence class or stratum.');
    }
    const taskArtifact = await readRetainedArtifact({
      root, rootReal, relativePath: task.path, expectedDigest: task.sha256,
      issuePath: `${itemPath}/task`, mismatchCode: 'TASK_DIGEST_MISMATCH', issues, physicalPaths
    });
    if (taskArtifact) {
      let retainedTask;
      try {
        retainedTask = JSON.parse(taskArtifact.bytes.toString('utf8'));
      } catch {
        addIssue(issues, 'TASK_JSON_INVALID', `${itemPath}/task/path`, 'Retained task must be valid JSON.');
      }
      if (retainedTask !== undefined) {
        const taskRecord = requireObject(retainedTask, `${itemPath}/task/file`, issues, 'TASK_JSON_INVALID');
        if (taskRecord) {
          rejectUnknownKeys(
            taskRecord,
            new Set(['case_id', 'scope', 'stratum', 'source_paths', 'clarification_candidate']),
            `${itemPath}/task/file`,
            issues,
            'TASK_CONTENT_BINDING_INVALID',
            'Unknown retained task field.'
          );
          for (const [field, expected] of [
            ['case_id', item.pilot_id],
            ['scope', task.scope],
            ['stratum', item.stratum]
          ]) {
            if (!Object.hasOwn(taskRecord, field) || taskRecord[field] !== expected) {
              addIssue(issues, 'TASK_CONTENT_BINDING_INVALID', `${itemPath}/task/file/${field}`, `Retained task ${field} must match catalog metadata.`);
            }
          }
          if (!Array.isArray(taskRecord.source_paths)
            || taskRecord.source_paths.length !== 1
            || taskRecord.source_paths[0] !== source?.path) {
            addIssue(issues, 'TASK_CONTENT_BINDING_INVALID', `${itemPath}/task/file/source_paths`, 'Retained task source_paths must contain exactly this item\'s retained source path.');
          }
          const candidate = requireObject(
            taskRecord.clarification_candidate,
            `${itemPath}/task/file/clarification_candidate`,
            issues,
            'TASK_CONTENT_BINDING_INVALID'
          );
          if (candidate) {
            rejectUnknownKeys(
              candidate,
              new Set(['status', 'evidence_class', 'reason']),
              `${itemPath}/task/file/clarification_candidate`,
              issues,
              'TASK_CONTENT_BINDING_INVALID',
              'Unknown clarification candidate field.'
            );
            if (candidate.status !== 'unassessed'
              || candidate.evidence_class !== 'machine-pilot-candidate'
              || !nonEmptyString(candidate.reason)) {
              addIssue(issues, 'TASK_CONTENT_BINDING_INVALID', `${itemPath}/task/file/clarification_candidate`, 'Clarification candidate must remain an honest unassessed machine-pilot candidate with a non-empty reason.');
            }
          }
        }
      }
    }
    if (typeof task.task_id === 'string') {
      const prior = stableIds.get(`task:${task.task_id}`);
      if (prior !== undefined) addIssue(issues, 'DUPLICATE_STABLE_ID', `${itemPath}/task/task_id`, `Task ID is already used at ${prior}.`);
      else stableIds.set(`task:${task.task_id}`, `${itemPath}/task/task_id`);
    }
  }

  const reviews = Array.isArray(item.reviews) ? item.reviews : null;
  if (!reviews) addIssue(issues, 'CATALOG_CONTRACT_INVALID', `${itemPath}/reviews`, 'Reviews must be an array.');
  if (reviews?.length === 0 && item.status === 'pilot-admitted') {
    addIssue(issues, 'MACHINE_REVIEW_MISSING', `${itemPath}/reviews`, 'Pilot item is retained but not yet machine-reviewed.', 'incomplete');
  }
  let hasAdmitReview = false;
  for (const [reviewIndex, reviewValue] of (reviews ?? []).entries()) {
    const reviewPath = `${itemPath}/reviews/${reviewIndex}`;
    const review = requireObject(reviewValue, reviewPath, issues);
    if (!review) continue;
    rejectUnknownKeys(review, new Set([
      'review_id', 'path', 'sha256', 'reviewer_class', 'review_scope', 'source_id', 'task_id', 'decision'
    ]), reviewPath, issues);
    requireString(review.review_id, `${reviewPath}/review_id`, issues);
    requireDigest(review.sha256, `${reviewPath}/sha256`, issues);
    if (review.reviewer_class !== 'machine-agent') {
      addIssue(issues, 'REVIEWER_CLASS_INVALID', `${reviewPath}/reviewer_class`, 'Pilot reviews must identify reviewers only as machine-agent.');
    }
    if (review.review_scope !== 'intake-only') {
      addIssue(issues, 'REVIEW_SCOPE_INVALID', `${reviewPath}/review_scope`, 'Machine review scope must be intake-only.');
    }
    if (review.source_id !== source?.source_id || review.task_id !== task?.task_id) {
      addIssue(issues, 'REVIEW_BINDING_INVALID', reviewPath, 'Review must bind to this item\'s source and task IDs.');
    }
    if (!['admit', 'hold', 'reject'].includes(review.decision)) {
      addIssue(issues, 'REVIEW_DECISION_INVALID', `${reviewPath}/decision`, 'Unknown machine intake decision.');
    }
    if (review.decision === 'admit') hasAdmitReview = true;
    await readRetainedArtifact({
      root, rootReal, relativePath: review.path, expectedDigest: review.sha256,
      issuePath: reviewPath, mismatchCode: 'REVIEW_DIGEST_MISMATCH', issues, physicalPaths
    });
  }

  const defects = Array.isArray(item.defects) ? item.defects : null;
  if (!defects) addIssue(issues, 'CATALOG_CONTRACT_INVALID', `${itemPath}/defects`, 'Defects must be an array.');
  for (const [defectIndex, defectValue] of (defects ?? []).entries()) {
    const defectPath = `${itemPath}/defects/${defectIndex}`;
    const defect = requireObject(defectValue, defectPath, issues);
    if (!defect) continue;
    rejectUnknownKeys(defect, new Set([
      'defect_id', 'path', 'sha256', 'upstream_url', 'status', 'bound_pilot_id', 'countable'
    ]), defectPath, issues);
    requireString(defect.defect_id, `${defectPath}/defect_id`, issues);
    requireDigest(defect.sha256, `${defectPath}/sha256`, issues);
    requireString(defect.upstream_url, `${defectPath}/upstream_url`, issues);
    validateGitHubIssueUrl(defect.upstream_url, item.repository, `${defectPath}/upstream_url`, issues);
    if (!['lead', 'case-bound'].includes(defect.status)) {
      addIssue(issues, 'DEFECT_STATUS_INVALID', `${defectPath}/status`, 'Unknown defect status.');
    }
    if (typeof defect.countable !== 'boolean') {
      addIssue(issues, 'CATALOG_CONTRACT_INVALID', `${defectPath}/countable`, 'Defect countable must be boolean.');
    }
    if (defect.countable === true && defect.bound_pilot_id !== item.pilot_id) {
      addIssue(issues, 'UNBOUND_DEFECT_COUNTED', `${defectPath}/countable`, 'Only a defect bound to this pilot item may be countable.');
    }
    if (defect.countable === true && defect.status !== 'case-bound') {
      addIssue(issues, 'COUNTABLE_DEFECT_STATUS_INVALID', `${defectPath}/status`, 'Only a case-bound defect may be countable.');
    }
    if (defect.status === 'lead' && (defect.bound_pilot_id !== null || defect.countable !== false)) {
      addIssue(issues, 'LEAD_DEFECT_BINDING_INVALID', defectPath, 'A defect lead must remain unbound and uncountable.');
    }
    if (defect.status === 'case-bound' && defect.bound_pilot_id !== item.pilot_id) {
      addIssue(issues, 'DEFECT_BINDING_INVALID', `${defectPath}/bound_pilot_id`, 'A case-bound defect must bind to this item.');
    }
    if (defect.bound_pilot_id !== null && defect.bound_pilot_id !== item.pilot_id) {
      addIssue(issues, 'DEFECT_BINDING_INVALID', `${defectPath}/bound_pilot_id`, 'Defect binding must be null or this item\'s pilot ID.');
    }
    const artifact = await readRetainedArtifact({
      root, rootReal, relativePath: defect.path, expectedDigest: defect.sha256,
      issuePath: defectPath, mismatchCode: 'DEFECT_DIGEST_MISMATCH', issues, physicalPaths
    });
    if (defect.status === 'case-bound'
      && defect.countable === true
      && defect.bound_pilot_id === item.pilot_id
      && artifact?.digestMatches) {
      countableDefects += 1;
    }
  }

  const errorsAfter = issues.filter((entry) => entry.severity === 'error').length;
  const ready = item.status === 'pilot-admitted'
    && errorsAfter === errorsBefore
    && license?.scope_decision === 'applicable'
    && reviews !== null
    && reviews.length > 0
    && hasAdmitReview;
  return { ready, countableDefects: ready ? countableDefects : 0 };
}

/**
 * Validate a public-source machine-pilot catalog without invoking release gates.
 *
 * @param {string} catalogPath
 * @returns {Promise<{
 *   status: 'pilot_ready' | 'pilot_incomplete' | 'invalid',
 *   release_eligible: false,
 *   release_status: 'insufficient_evidence',
 *   counts: {total: number, pilot_admitted: number, countable_defects: number, by_stratum: Record<string, number>},
 *   issues: Array<{code: string, path: string, message: string, severity: 'error' | 'incomplete'}>
 * }>}
 */
export async function validatePublicPilot(catalogPath) {
  /** @type {Array<any>} */
  const issues = [];
  const byStratum = Object.fromEntries(FROZEN_STRATA.map((stratum) => [stratum, 0]));
  const counts = { total: 0, pilot_admitted: 0, countable_defects: 0, by_stratum: byStratum };

  const finish = () => {
    for (const stratum of FROZEN_STRATA) {
      if (byStratum[stratum] < 5) {
        addIssue(issues, 'STRATUM_MINIMUM_NOT_MET', `/counts/by_stratum/${stratum}`, `Stratum has ${byStratum[stratum]} valid pilot-admitted items; five are required.`, 'incomplete');
      }
    }
    issues.sort((left, right) => `${left.path}\0${left.code}\0${left.message}`.localeCompare(`${right.path}\0${right.code}\0${right.message}`));
    const invalid = issues.some((entry) => entry.severity === 'error');
    const ready = FROZEN_STRATA.every((stratum) => byStratum[stratum] >= 5);
    const status = /** @type {'invalid' | 'pilot_ready' | 'pilot_incomplete'} */ (
      invalid ? 'invalid' : ready ? 'pilot_ready' : 'pilot_incomplete'
    );
    return {
      status,
      release_eligible: /** @type {false} */ (false),
      release_status: RELEASE_STATUS,
      counts,
      issues
    };
  };

  if (!nonEmptyString(catalogPath)) {
    addIssue(issues, 'CATALOG_PATH_INVALID', '/', 'A catalog path is required.');
    return finish();
  }

  const absoluteCatalogPath = path.resolve(catalogPath);
  const root = path.dirname(absoluteCatalogPath);
  let rootReal;
  let catalogBytes;
  try {
    [rootReal, catalogBytes] = await Promise.all([realpath(root), readFile(absoluteCatalogPath)]);
  } catch (error) {
    addIssue(issues, 'CATALOG_UNREADABLE', '/', `Cannot read catalog: ${/** @type {any} */ (error).code ?? 'unknown error'}.`);
    return finish();
  }

  let catalog;
  try {
    catalog = JSON.parse(catalogBytes.toString('utf8'));
  } catch {
    addIssue(issues, 'CATALOG_JSON_INVALID', '/', 'Catalog is not valid JSON.');
    return finish();
  }
  if (!isObject(catalog)) {
    addIssue(issues, 'CATALOG_CONTRACT_INVALID', '/', 'Catalog root must be an object.');
    return finish();
  }

  const catalogObject = /** @type {Record<string, any>} */ (catalog);
  rejectUnknownKeys(catalogObject, new Set([
    'schema_version', 'catalog_id', 'evidence_class', 'release_eligible', 'release_status', 'items'
  ]), '', issues);
  rejectForbiddenExpertClaims(catalogObject, '', issues);

  if (catalogObject.schema_version !== '1.0.0') {
    addIssue(issues, 'CATALOG_VERSION_INVALID', '/schema_version', 'Catalog schema_version must be 1.0.0.');
  }
  requireString(catalogObject.catalog_id, '/catalog_id', issues);
  if (catalogObject.evidence_class !== 'public-source-machine-pilot') {
    addIssue(issues, 'EVIDENCE_CLASS_INVALID', '/evidence_class', 'Catalog evidence class must remain public-source-machine-pilot.');
  }
  if (catalogObject.release_eligible !== false) {
    addIssue(issues, 'RELEASE_ELIGIBILITY_FORBIDDEN', '/release_eligible', 'A public-source machine pilot can never claim release eligibility.');
  }
  if (catalogObject.release_status !== RELEASE_STATUS) {
    addIssue(issues, 'RELEASE_STATUS_INVALID', '/release_status', 'Pilot release status must remain insufficient_evidence.');
  }
  if (!Array.isArray(catalogObject.items)) {
    addIssue(issues, 'CATALOG_CONTRACT_INVALID', '/items', 'Catalog items must be an array.');
    return finish();
  }

  counts.total = catalogObject.items.length;
  const context = {
    root,
    rootReal,
    issues,
    physicalPaths: new Map(),
    contentDigests: new Map(),
    stableIds: new Map()
  };
  for (const [itemIndex, itemValue] of catalogObject.items.entries()) {
    const item = requireObject(itemValue, `/items/${itemIndex}`, issues);
    if (!item) continue;
    const result = await validateItem(item, itemIndex, context);
    if (result.ready && FROZEN_STRATA.includes(item.stratum)) {
      counts.pilot_admitted += 1;
      counts.countable_defects += result.countableDefects;
      byStratum[item.stratum] += 1;
    }
  }

  return finish();
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const report = await validatePublicPilot(process.argv[2]);
  process.stdout.write(`${JSON.stringify(report)}\n`);
}
