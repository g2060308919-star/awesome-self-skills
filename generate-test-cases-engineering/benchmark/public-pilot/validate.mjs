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
const COMPARATOR_IDS = Object.freeze([
  'long-prompt',
  'test-case-designer',
  'technique-router',
  'generate-test-cases'
]);
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
 *   physicalPaths: Map<string, string>,
 *   pathField?: string
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
    physicalPaths,
    pathField = 'path'
  } = options;

  if (!nonEmptyString(relativePath)) {
    addIssue(issues, 'RETAINED_PATH_INVALID', `${issuePath}/${pathField}`, 'A retained artifact path is required.');
    return null;
  }

  const declaredPath = /** @type {string} */ (relativePath);
  if (path.isAbsolute(declaredPath) || path.win32.isAbsolute(declaredPath)) {
    addIssue(issues, 'ABSOLUTE_PATH_FORBIDDEN', `${issuePath}/${pathField}`, 'Retained paths must be relative to the artifact root.');
    return null;
  }

  const segments = declaredPath.split(/[\\/]+/);
  if (segments.includes('..')) {
    addIssue(issues, 'PATH_TRAVERSAL_FORBIDDEN', `${issuePath}/${pathField}`, 'Parent traversal is forbidden in retained paths.');
    return null;
  }
  if (segments.some((segment) => segment === '' || segment === '.')) {
    addIssue(issues, 'RETAINED_PATH_INVALID', `${issuePath}/${pathField}`, 'Retained paths must be normalized non-empty relative paths.');
    return null;
  }

  const absolutePath = path.resolve(root, declaredPath);
  if (!isWithin(root, absolutePath)) {
    addIssue(issues, 'PATH_OUTSIDE_CATALOG_ROOT', `${issuePath}/${pathField}`, 'Retained path resolves outside the artifact root.');
    return null;
  }

  let entry;
  try {
    entry = await lstat(absolutePath);
  } catch (error) {
    addIssue(issues, 'RETAINED_FILE_UNREADABLE', `${issuePath}/${pathField}`, `Cannot inspect retained file: ${/** @type {any} */ (error).code ?? 'unknown error'}.`);
    return null;
  }

  if (entry.isSymbolicLink()) {
    addIssue(issues, 'SYMLINK_FORBIDDEN', `${issuePath}/${pathField}`, 'Retained artifacts cannot be symbolic links.');
    return null;
  }
  if (!entry.isFile()) {
    addIssue(issues, 'RETAINED_FILE_INVALID', `${issuePath}/${pathField}`, 'Retained artifact must be a regular file.');
    return null;
  }

  let resolvedPath;
  let fileStat;
  try {
    [resolvedPath, fileStat] = await Promise.all([realpath(absolutePath), stat(absolutePath)]);
  } catch (error) {
    addIssue(issues, 'RETAINED_FILE_UNREADABLE', `${issuePath}/${pathField}`, `Cannot resolve retained file: ${/** @type {any} */ (error).code ?? 'unknown error'}.`);
    return null;
  }

  const expectedRealPath = path.resolve(rootReal, declaredPath);
  if (!isWithin(rootReal, resolvedPath)) {
    addIssue(issues, 'PATH_OUTSIDE_CATALOG_ROOT', `${issuePath}/${pathField}`, 'Resolved retained path escapes the artifact root.');
    return null;
  }
  if (resolvedPath !== expectedRealPath) {
    addIssue(issues, 'SYMLINK_FORBIDDEN', `${issuePath}/${pathField}`, 'A retained path component resolves through a symbolic link.');
    return null;
  }

  if (fileStat.nlink !== 1) {
    addIssue(issues, 'HARDLINK_FORBIDDEN', `${issuePath}/${pathField}`, 'Retained artifacts must have exactly one hard link.');
  }

  const physicalKeys = [
    `path:${resolvedPath}`,
    `inode:${String(fileStat.dev)}:${String(fileStat.ino)}`
  ];
  const priorBinding = physicalKeys.map((key) => physicalPaths.get(key)).find(Boolean);
  if (priorBinding !== undefined) {
    addIssue(issues, 'DUPLICATE_PHYSICAL_PATH', `${issuePath}/${pathField}`, `Retained file is already bound at ${priorBinding}.`);
  }
  for (const key of physicalKeys) {
    if (!physicalPaths.has(key)) physicalPaths.set(key, `${issuePath}/${pathField}`);
  }

  let bytes;
  try {
    bytes = await readFile(absolutePath);
  } catch (error) {
    addIssue(issues, 'RETAINED_FILE_UNREADABLE', `${issuePath}/${pathField}`, `Cannot read retained file: ${/** @type {any} */ (error).code ?? 'unknown error'}.`);
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
    if (key === 'external_expert_evidence' && entry !== false) {
      addIssue(issues, 'EXTERNAL_EXPERT_EVIDENCE_FORBIDDEN', `${issuePath}/${key}`, 'Machine-pilot evidence must explicitly deny external-expert status.');
    }
    rejectForbiddenExpertClaims(entry, `${issuePath}/${key}`, issues);
  }
}

/** @param {Record<string, any>} catalog */
function corpusSnapshotDigest(catalog) {
  const projection = {
    schema_version: catalog.schema_version,
    catalog_id: catalog.catalog_id,
    evidence_class: catalog.evidence_class,
    release_eligible: catalog.release_eligible,
    release_status: catalog.release_status,
    items: Array.isArray(catalog.items) ? catalog.items.map((item) => ({
      pilot_id: item?.pilot_id,
      status: item?.status,
      repository: item?.repository,
      commit: item?.commit,
      stratum: item?.stratum,
      acquired_at: item?.acquired_at,
      source: item?.source,
      license: item?.license,
      provenance: item?.provenance,
      task: item?.task,
      reviews: [],
      defects: []
    })) : catalog.items
  };
  return sha256(`${JSON.stringify(projection, null, 2)}\n`);
}

/**
 * @param {Record<string, any>} descriptor
 * @param {string} issuePath
 * @param {string} mismatchCode
 * @param {{root: string, rootReal: string, issues: Array<any>, physicalPaths: Map<string, string>}} context
 */
async function readRetainedJson(descriptor, issuePath, mismatchCode, context) {
  const artifact = await readRetainedArtifact({
    root: context.root,
    rootReal: context.rootReal,
    relativePath: descriptor?.path,
    expectedDigest: descriptor?.sha256,
    issuePath,
    mismatchCode,
    issues: context.issues,
    physicalPaths: context.physicalPaths
  });
  if (!artifact) return null;
  let record;
  try {
    record = JSON.parse(artifact.bytes.toString('utf8'));
  } catch {
    addIssue(context.issues, 'RETAINED_JSON_INVALID', `${issuePath}/path`, 'Retained evidence must be valid JSON.');
    return null;
  }
  const object = requireObject(record, `${issuePath}/file`, context.issues, 'RETAINED_JSON_INVALID');
  if (object) rejectForbiddenExpertClaims(object, `${issuePath}/file`, context.issues);
  return object;
}

/** @param {unknown} reasons @param {string} issuePath @param {Array<any>} issues */
function validateReasons(reasons, issuePath, issues) {
  if (!Array.isArray(reasons) || reasons.length === 0 || reasons.some((reason) => !nonEmptyString(reason))) {
    addIssue(issues, 'REVIEW_REASONS_INVALID', issuePath, 'Review reasons must be a non-empty array of non-empty strings.');
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
  if (reviews && reviews.length !== 3) {
    addIssue(issues, 'REVIEW_LINK_SET_INVALID', `${itemPath}/reviews`, 'Each item must link exactly machine expert A, machine expert B, and machine adjudication.');
  }
  for (const [reviewIndex, reviewValue] of (reviews ?? []).entries()) {
    const reviewPath = `${itemPath}/reviews/${reviewIndex}`;
    const review = requireObject(reviewValue, reviewPath, issues);
    if (!review) continue;
    rejectUnknownKeys(review, new Set([
      'review_id', 'report_id', 'reviewer_class', 'review_scope', 'source_id', 'task_id', 'decision'
    ]), reviewPath, issues);
    requireString(review.review_id, `${reviewPath}/review_id`, issues);
    requireString(review.report_id, `${reviewPath}/report_id`, issues);
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
  }

  const defects = Array.isArray(item.defects) ? item.defects : null;
  if (!defects) addIssue(issues, 'CATALOG_CONTRACT_INVALID', `${itemPath}/defects`, 'Defects must be an array.');
  if (defects && defects.length !== 0) {
    addIssue(issues, 'ITEM_DEFECT_BINDING_FORBIDDEN', `${itemPath}/defects`, 'The global defect ledger is the only defect source of truth.');
  }

  const errorsAfter = issues.filter((entry) => entry.severity === 'error').length;
  const baseValid = errorsAfter === errorsBefore && license?.scope_decision === 'applicable';
  return { baseValid };
}

/**
 * @param {Record<string, any>} catalog
 * @param {{root: string, rootReal: string, issues: Array<any>, physicalPaths: Map<string, string>}} context
 */
async function validateIntakeReport(catalog, context) {
  const issuePath = '/intake_report';
  const descriptor = requireObject(catalog.intake_report, issuePath, context.issues);
  if (!descriptor) return null;
  rejectUnknownKeys(descriptor, new Set(['path', 'sha256']), issuePath, context.issues);
  requireDigest(descriptor.sha256, `${issuePath}/sha256`, context.issues);
  const artifact = await readRetainedArtifact({
    root: context.root,
    rootReal: context.rootReal,
    relativePath: descriptor.path,
    expectedDigest: descriptor.sha256,
    issuePath,
    mismatchCode: 'INTAKE_REPORT_DIGEST_MISMATCH',
    issues: context.issues,
    physicalPaths: context.physicalPaths
  });
  return artifact?.digestMatches ? artifact.digest : null;
}

/**
 * @param {Record<string, any>} catalog
 * @param {string} snapshotDigest
 * @param {string | null} intakeReportDigest
 * @param {{root: string, rootReal: string, issues: Array<any>, physicalPaths: Map<string, string>}} context
 */
async function validateReviewReports(catalog, snapshotDigest, intakeReportDigest, context) {
  const { issues } = context;
  const descriptors = Array.isArray(catalog.review_reports) ? catalog.review_reports : null;
  if (!descriptors || descriptors.length !== 2) {
    addIssue(issues, 'REVIEW_REPORT_COUNT_INVALID', '/review_reports', 'Exactly two independent machine review reports are required.');
  }
  const reports = new Map();
  const seenReportIds = new Set();
  const seenReviewerIds = new Set();
  const seenDigests = new Set();

  for (const [index, descriptorValue] of (descriptors ?? []).entries()) {
    const issuePath = `/review_reports/${index}`;
    const descriptor = requireObject(descriptorValue, issuePath, issues);
    if (!descriptor) continue;
    rejectUnknownKeys(descriptor, new Set([
      'report_id', 'path', 'sha256', 'reviewer_id', 'reviewer_class', 'review_scope'
    ]), issuePath, issues);
    requireString(descriptor.report_id, `${issuePath}/report_id`, issues);
    requireString(descriptor.reviewer_id, `${issuePath}/reviewer_id`, issues);
    requireDigest(descriptor.sha256, `${issuePath}/sha256`, issues);
    if (descriptor.reviewer_class !== 'machine-agent') {
      addIssue(issues, 'REVIEWER_CLASS_INVALID', `${issuePath}/reviewer_class`, 'Review report descriptors must identify machine agents.');
    }
    if (descriptor.review_scope !== 'intake-only') {
      addIssue(issues, 'REVIEW_SCOPE_INVALID', `${issuePath}/review_scope`, 'Review report scope must remain intake-only.');
    }
    for (const [value, seen, label] of [
      [descriptor.report_id, seenReportIds, 'report ID'],
      [descriptor.reviewer_id, seenReviewerIds, 'reviewer ID'],
      [descriptor.sha256, seenDigests, 'report digest']
    ]) {
      if (typeof value === 'string' && seen.has(value)) {
        addIssue(issues, 'DUPLICATE_REVIEW_REPORT', issuePath, `Independent reports must not share a ${label}.`);
      }
      if (typeof value === 'string') seen.add(value);
    }

    const report = await readRetainedJson(descriptor, issuePath, 'REVIEW_DIGEST_MISMATCH', context);
    if (!report) continue;
    rejectUnknownKeys(report, new Set([
      'schema_version', 'report_id', 'reviewer_id', 'reviewer_class', 'review_scope',
      'external_expert_evidence', 'input_catalog_sha256', 'input_intake_report_sha256',
      'reviewed_at', 'cases', 'formal_admit_count', 'release_eligible', 'release_status'
    ]), `${issuePath}/file`, issues, 'REVIEW_REPORT_BINDING_INVALID', 'Unknown review report field.');
    if (report.schema_version !== '1.0.0'
      || report.report_id !== descriptor.report_id
      || report.reviewer_id !== descriptor.reviewer_id
      || report.reviewer_class !== descriptor.reviewer_class
      || report.review_scope !== descriptor.review_scope) {
      addIssue(issues, 'REVIEW_REPORT_BINDING_INVALID', `${issuePath}/file`, 'Review report metadata must match its catalog descriptor.');
    }
    if (report.external_expert_evidence !== false) {
      addIssue(issues, 'EXTERNAL_EXPERT_EVIDENCE_FORBIDDEN', `${issuePath}/file/external_expert_evidence`, 'Review reports are machine-only evidence.');
    }
    if (report.formal_admit_count !== 0
      || report.release_eligible !== false
      || report.release_status !== RELEASE_STATUS) {
      addIssue(issues, 'REVIEW_REPORT_BOUNDARY_INVALID', `${issuePath}/file`, 'Review reports cannot create formal admits or release eligibility.');
    }
    if (report.input_catalog_sha256 !== snapshotDigest) {
      addIssue(issues, 'CORPUS_SNAPSHOT_DIGEST_MISMATCH', `${issuePath}/file/input_catalog_sha256`, 'Review report must bind the recomputed corpus snapshot.');
    }
    if (!requireDigest(report.input_intake_report_sha256, `${issuePath}/file/input_intake_report_sha256`, issues, 'REVIEW_REPORT_BINDING_INVALID')
      || intakeReportDigest === null
      || report.input_intake_report_sha256 !== intakeReportDigest) {
      addIssue(issues, 'REVIEW_INTAKE_DIGEST_MISMATCH', `${issuePath}/file/input_intake_report_sha256`, 'Every independent report must bind the exact retained frozen intake report.');
    }
    if (!isRfc3339DateTime(report.reviewed_at)) {
      addIssue(issues, 'REVIEW_TIME_INVALID', `${issuePath}/file/reviewed_at`, 'Review time must be a real RFC 3339 date-time.');
    }

    const cases = Array.isArray(report.cases) ? report.cases : null;
    const caseIndex = new Map();
    const reviewIds = new Set();
    if (!cases || cases.length !== catalog.items.length) {
      addIssue(issues, 'REVIEW_CASE_COVERAGE_INVALID', `${issuePath}/file/cases`, 'Review report must cover every catalog case exactly once.');
    }
    for (const [caseIndexValue, caseValue] of (cases ?? []).entries()) {
      const casePath = `${issuePath}/file/cases/${caseIndexValue}`;
      const reviewCase = requireObject(caseValue, casePath, issues, 'REVIEW_REPORT_BINDING_INVALID');
      if (!reviewCase) continue;
      rejectUnknownKeys(reviewCase, new Set([
        'review_id', 'case_id', 'source_id', 'task_id', 'repository', 'stratum',
        'input_source_sha256', 'input_task_sha256', 'decision', 'reasons'
      ]), casePath, issues, 'REVIEW_REPORT_BINDING_INVALID', 'Unknown review case field.');
      requireString(reviewCase.review_id, `${casePath}/review_id`, issues, 'REVIEW_REPORT_BINDING_INVALID');
      requireString(reviewCase.case_id, `${casePath}/case_id`, issues, 'REVIEW_REPORT_BINDING_INVALID');
      if (caseIndex.has(reviewCase.case_id) || reviewIds.has(reviewCase.review_id)) {
        addIssue(issues, 'REVIEW_CASE_COVERAGE_INVALID', casePath, 'Review case and review IDs must be unique.');
      }
      caseIndex.set(reviewCase.case_id, reviewCase);
      reviewIds.add(reviewCase.review_id);
      if (reviewCase.review_id !== `${report.report_id}:${reviewCase.case_id}`) {
        addIssue(issues, 'REVIEW_REPORT_BINDING_INVALID', `${casePath}/review_id`, 'Review ID must be the stable report_id:case_id binding.');
      }
      const item = catalog.items.find((/** @type {any} */ entry) => entry?.pilot_id === reviewCase.case_id);
      if (!item || reviewCase.source_id !== item.source?.source_id
        || reviewCase.task_id !== item.task?.task_id
        || reviewCase.repository !== item.repository
        || reviewCase.stratum !== item.stratum
        || reviewCase.input_source_sha256 !== item.source?.sha256
        || reviewCase.input_task_sha256 !== item.task?.sha256) {
        addIssue(issues, 'REVIEW_REPORT_BINDING_INVALID', casePath, 'Review case must bind the exact catalog source, task, repository, stratum, and digests.');
      }
      if (!['admit', 'hold', 'reject'].includes(reviewCase.decision)) {
        addIssue(issues, 'REVIEW_DECISION_INVALID', `${casePath}/decision`, 'Unknown machine intake decision.');
      }
      validateReasons(reviewCase.reasons, `${casePath}/reasons`, issues);
    }
    for (const item of catalog.items) {
      if (!caseIndex.has(item.pilot_id)) {
        addIssue(issues, 'REVIEW_CASE_COVERAGE_INVALID', `${issuePath}/file/cases`, `Missing review case ${item.pilot_id}.`);
      }
    }
    reports.set(descriptor.report_id, { descriptor, report, cases: caseIndex });
  }
  return reports;
}

/**
 * @param {Record<string, any>} catalog
 * @param {string} snapshotDigest
 * @param {Map<string, any>} reports
 * @param {{root: string, rootReal: string, issues: Array<any>, physicalPaths: Map<string, string>}} context
 */
async function validateAdjudication(catalog, snapshotDigest, reports, context) {
  const { issues } = context;
  const issuePath = '/adjudication_report';
  const descriptor = requireObject(catalog.adjudication_report, issuePath, issues);
  if (!descriptor) return new Map();
  rejectUnknownKeys(descriptor, new Set([
    'report_id', 'path', 'sha256', 'reviewer_id', 'reviewer_class', 'review_scope'
  ]), issuePath, issues);
  requireString(descriptor.report_id, `${issuePath}/report_id`, issues);
  requireString(descriptor.reviewer_id, `${issuePath}/reviewer_id`, issues);
  requireDigest(descriptor.sha256, `${issuePath}/sha256`, issues);
  if (descriptor.reviewer_class !== 'machine-agent') {
    addIssue(issues, 'REVIEWER_CLASS_INVALID', `${issuePath}/reviewer_class`, 'Adjudication must identify a machine agent.');
  }
  if (descriptor.review_scope !== 'intake-only') {
    addIssue(issues, 'REVIEW_SCOPE_INVALID', `${issuePath}/review_scope`, 'Adjudication scope must remain intake-only.');
  }
  const adjudication = await readRetainedJson(descriptor, issuePath, 'ADJUDICATION_DIGEST_MISMATCH', context);
  if (!adjudication) return new Map();
  rejectUnknownKeys(adjudication, new Set([
    'schema_version', 'report_id', 'reviewer_id', 'reviewer_class', 'review_scope',
    'external_expert_evidence', 'input_catalog_path', 'input_catalog_sha256', 'input_reports', 'adjudicated_at',
    'boundary_note', 'cases', 'disagreement_resolutions', 'final_summary',
    'formal_admit_count', 'release_eligible', 'release_status'
  ]), `${issuePath}/file`, issues, 'ADJUDICATION_BINDING_INVALID', 'Unknown adjudication field.');
  if (adjudication.schema_version !== '1.0.0'
    || adjudication.report_id !== descriptor.report_id
    || adjudication.reviewer_id !== descriptor.reviewer_id
    || adjudication.reviewer_class !== descriptor.reviewer_class
    || adjudication.review_scope !== descriptor.review_scope) {
    addIssue(issues, 'ADJUDICATION_BINDING_INVALID', `${issuePath}/file`, 'Adjudication metadata must match its catalog descriptor.');
  }
  if (adjudication.external_expert_evidence !== false) {
    addIssue(issues, 'EXTERNAL_EXPERT_EVIDENCE_FORBIDDEN', `${issuePath}/file/external_expert_evidence`, 'Adjudication is machine-only evidence.');
  }
  if (adjudication.input_catalog_sha256 !== snapshotDigest) {
    addIssue(issues, 'CORPUS_SNAPSHOT_DIGEST_MISMATCH', `${issuePath}/file/input_catalog_sha256`, 'Adjudication must bind the recomputed corpus snapshot.');
  }
  requireString(adjudication.input_catalog_path, `${issuePath}/file/input_catalog_path`, issues, 'ADJUDICATION_BINDING_INVALID');
  if (!isRfc3339DateTime(adjudication.adjudicated_at)) {
    addIssue(issues, 'ADJUDICATION_TIME_INVALID', `${issuePath}/file/adjudicated_at`, 'Adjudication time must be a real RFC 3339 date-time.');
  }
  requireString(adjudication.boundary_note, `${issuePath}/file/boundary_note`, issues, 'ADJUDICATION_BINDING_INVALID');
  if (adjudication.formal_admit_count !== 0
    || adjudication.release_eligible !== false
    || adjudication.release_status !== RELEASE_STATUS) {
    addIssue(issues, 'ADJUDICATION_BOUNDARY_INVALID', `${issuePath}/file`, 'Adjudication cannot create formal admits or release eligibility.');
  }

  const inputReports = Array.isArray(adjudication.input_reports) ? adjudication.input_reports : null;
  if (!inputReports || inputReports.length !== 2) {
    addIssue(issues, 'ADJUDICATION_INPUT_MISSING', `${issuePath}/file/input_reports`, 'Adjudication must bind exactly both independent reports.');
  }
  const seenInputs = new Set();
  for (const [index, inputValue] of (inputReports ?? []).entries()) {
    const inputPath = `${issuePath}/file/input_reports/${index}`;
    const input = requireObject(inputValue, inputPath, issues, 'ADJUDICATION_INPUT_MISSING');
    if (!input) continue;
    rejectUnknownKeys(input, new Set(['report_id', 'path', 'sha256']), inputPath, issues, 'ADJUDICATION_INPUT_MISSING', 'Unknown adjudication input field.');
    const expected = reports.get(input.report_id)?.descriptor;
    const expectedRepositoryPath = typeof expected?.path === 'string'
      ? `benchmark/public-pilot/v1/${expected.path}`
      : null;
    if (!expected
      || (input.path !== expected.path && input.path !== expectedRepositoryPath)
      || input.sha256 !== expected.sha256) {
      addIssue(issues, 'ADJUDICATION_INPUT_MISSING', inputPath, 'Adjudication input must match an exact retained review report descriptor.');
    }
    if (seenInputs.has(input.report_id)) {
      addIssue(issues, 'ADJUDICATION_INPUT_MISSING', inputPath, 'Adjudication input report IDs must be unique.');
    }
    seenInputs.add(input.report_id);
  }
  for (const reportId of reports.keys()) {
    if (!seenInputs.has(reportId)) {
      addIssue(issues, 'ADJUDICATION_INPUT_MISSING', `${issuePath}/file/input_reports`, `Missing adjudication input ${reportId}.`);
    }
  }

  const reportEntries = [...reports.values()];
  const cases = Array.isArray(adjudication.cases) ? adjudication.cases : null;
  if (!cases || cases.length !== catalog.items.length) {
    addIssue(issues, 'ADJUDICATION_COVERAGE_INVALID', `${issuePath}/file/cases`, 'Adjudication must cover every catalog case exactly once.');
  }
  const finalCases = new Map();
  const reviewIds = new Set();
  for (const [index, caseValue] of (cases ?? []).entries()) {
    const casePath = `${issuePath}/file/cases/${index}`;
    const adjudicatedCase = requireObject(caseValue, casePath, issues, 'ADJUDICATION_BINDING_INVALID');
    if (!adjudicatedCase) continue;
    rejectUnknownKeys(adjudicatedCase, new Set([
      'review_id', 'case_id', 'source_id', 'task_id', 'repository', 'stratum',
      'input_source_sha256', 'input_task_sha256',
      'expert_a_decision', 'expert_b_decision', 'disagreement',
      'final_decision', 'reasons'
    ]), casePath, issues, 'ADJUDICATION_BINDING_INVALID', 'Unknown adjudication case field.');
    requireString(adjudicatedCase.review_id, `${casePath}/review_id`, issues, 'ADJUDICATION_BINDING_INVALID');
    requireString(adjudicatedCase.case_id, `${casePath}/case_id`, issues, 'ADJUDICATION_BINDING_INVALID');
    if (finalCases.has(adjudicatedCase.case_id) || reviewIds.has(adjudicatedCase.review_id)) {
      addIssue(issues, 'ADJUDICATION_COVERAGE_INVALID', casePath, 'Adjudication case and review IDs must be unique.');
    }
    finalCases.set(adjudicatedCase.case_id, adjudicatedCase);
    reviewIds.add(adjudicatedCase.review_id);
    if (adjudicatedCase.review_id !== `${adjudication.report_id}:${adjudicatedCase.case_id}`) {
      addIssue(issues, 'ADJUDICATION_BINDING_INVALID', `${casePath}/review_id`, 'Adjudication review ID must be the stable report_id:case_id binding.');
    }
    const item = catalog.items.find((/** @type {any} */ entry) => entry?.pilot_id === adjudicatedCase.case_id);
    if (!item || adjudicatedCase.source_id !== item.source?.source_id
      || adjudicatedCase.task_id !== item.task?.task_id
      || adjudicatedCase.repository !== item.repository
      || adjudicatedCase.stratum !== item.stratum
      || adjudicatedCase.input_source_sha256 !== item.source?.sha256
      || adjudicatedCase.input_task_sha256 !== item.task?.sha256) {
      addIssue(issues, 'ADJUDICATION_BINDING_INVALID', casePath, 'Adjudication case must bind the exact catalog case, source, task, repository, stratum, and digests.');
    }
    const firstDecision = reportEntries[0]?.cases.get(adjudicatedCase.case_id)?.decision;
    const secondDecision = reportEntries[1]?.cases.get(adjudicatedCase.case_id)?.decision;
    if (adjudicatedCase.expert_a_decision !== firstDecision
      || adjudicatedCase.expert_b_decision !== secondDecision) {
      addIssue(issues, 'ADJUDICATION_DECISION_INVALID', casePath, 'Adjudication must copy both independent report decisions exactly.');
    }
    const disagreement = firstDecision !== secondDecision;
    if (adjudicatedCase.disagreement !== disagreement) {
      addIssue(issues, 'ADJUDICATION_DECISION_INVALID', `${casePath}/disagreement`, 'Disagreement flag must be derived from the independent decisions.');
    }
    if (!['admit', 'hold', 'reject'].includes(adjudicatedCase.final_decision)
      || (!disagreement && adjudicatedCase.final_decision !== firstDecision)) {
      addIssue(issues, 'ADJUDICATION_DECISION_INVALID', `${casePath}/final_decision`, 'Agreement decisions cannot be rewritten, and every final decision must be valid.');
    }
    validateReasons(adjudicatedCase.reasons, `${casePath}/reasons`, issues);
  }
  for (const item of catalog.items) {
    if (!finalCases.has(item.pilot_id)) {
      addIssue(issues, 'ADJUDICATION_COVERAGE_INVALID', `${issuePath}/file/cases`, `Missing adjudication case ${item.pilot_id}.`);
    }
  }
  const finalSummary = requireObject(adjudication.final_summary, `${issuePath}/file/final_summary`, issues, 'ADJUDICATION_BINDING_INVALID');
  if (finalSummary) {
    rejectUnknownKeys(finalSummary, new Set([
      'admit', 'hold', 'reject', 'disagreements', 'final_admits_by_stratum', 'all_strata_meet_five'
    ]), `${issuePath}/file/final_summary`, issues, 'ADJUDICATION_BINDING_INVALID', 'Unknown adjudication summary field.');
    const expectedCounts = { admit: 0, hold: 0, reject: 0 };
    let expectedDisagreements = 0;
    const expectedByStratum = Object.fromEntries(FROZEN_STRATA.map((stratum) => [stratum, 0]));
    for (const finalCase of finalCases.values()) {
      if (finalCase.final_decision === 'admit') expectedCounts.admit += 1;
      else if (finalCase.final_decision === 'hold') expectedCounts.hold += 1;
      else if (finalCase.final_decision === 'reject') expectedCounts.reject += 1;
      if (finalCase.disagreement === true) expectedDisagreements += 1;
      if (finalCase.final_decision === 'admit' && FROZEN_STRATA.includes(finalCase.stratum)) {
        expectedByStratum[finalCase.stratum] += 1;
      }
    }
    const summaryMatches = finalSummary.admit === expectedCounts.admit
      && finalSummary.hold === expectedCounts.hold
      && finalSummary.reject === expectedCounts.reject
      && finalSummary.disagreements === expectedDisagreements
      && isObject(finalSummary.final_admits_by_stratum)
      && FROZEN_STRATA.every((stratum) => finalSummary.final_admits_by_stratum[stratum] === expectedByStratum[stratum])
      && Object.keys(finalSummary.final_admits_by_stratum ?? {}).length === FROZEN_STRATA.length
      && finalSummary.all_strata_meet_five === FROZEN_STRATA.every((stratum) => expectedByStratum[stratum] >= 5);
    if (!summaryMatches) {
      addIssue(issues, 'ADJUDICATION_SUMMARY_INVALID', `${issuePath}/file/final_summary`, 'Adjudication summary must be recomputed from final case decisions.');
    }
  }
  const resolutions = Array.isArray(adjudication.disagreement_resolutions) ? adjudication.disagreement_resolutions : null;
  const disagreementCases = [...finalCases.values()].filter((entry) => entry.disagreement === true);
  if (!resolutions || resolutions.length !== disagreementCases.length) {
    addIssue(issues, 'ADJUDICATION_RESOLUTIONS_INVALID', `${issuePath}/file/disagreement_resolutions`, 'Disagreement resolutions must cover every disagreement exactly once.');
  }
  const resolvedCaseIds = new Set();
  for (const [index, resolutionValue] of (resolutions ?? []).entries()) {
    const resolutionPath = `${issuePath}/file/disagreement_resolutions/${index}`;
    const resolution = requireObject(resolutionValue, resolutionPath, issues, 'ADJUDICATION_RESOLUTIONS_INVALID');
    if (!resolution) continue;
    rejectUnknownKeys(resolution, new Set([
      'case_id', 'expert_a_decision', 'expert_b_decision', 'final_decision', 'reasons'
    ]), resolutionPath, issues, 'ADJUDICATION_RESOLUTIONS_INVALID', 'Unknown disagreement resolution field.');
    const finalCase = finalCases.get(resolution.case_id);
    if (!nonEmptyString(resolution.case_id)
      || resolvedCaseIds.has(resolution.case_id)
      || finalCase?.disagreement !== true
      || resolution.expert_a_decision !== finalCase?.expert_a_decision
      || resolution.expert_b_decision !== finalCase?.expert_b_decision
      || resolution.final_decision !== finalCase?.final_decision) {
      addIssue(issues, 'ADJUDICATION_RESOLUTIONS_INVALID', resolutionPath, 'Resolution must uniquely bind one disagreement and copy both inputs plus the final decision exactly.');
    }
    validateReasons(resolution.reasons, `${resolutionPath}/reasons`, issues);
    if (typeof resolution.case_id === 'string') resolvedCaseIds.add(resolution.case_id);
  }
  for (const disagreementCase of disagreementCases) {
    if (!resolvedCaseIds.has(disagreementCase.case_id)) {
      addIssue(issues, 'ADJUDICATION_RESOLUTIONS_INVALID', `${issuePath}/file/disagreement_resolutions`, `Missing disagreement resolution for ${disagreementCase.case_id}.`);
    }
  }
  return finalCases;
}

/**
 * @param {Record<string, any>} catalog
 * @param {Map<string, any>} reports
 * @param {Map<string, any>} finalCases
 * @param {Array<any>} issues
 */
function validateReviewLinks(catalog, reports, finalCases, issues) {
  const adjudicationId = catalog.adjudication_report?.report_id;
  const expectedReportIds = new Set([...reports.keys(), adjudicationId].filter(Boolean));
  const linkValidity = new Map();
  for (const [itemIndex, item] of catalog.items.entries()) {
    const errorsBefore = issues.filter((entry) => entry.severity === 'error').length;
    const links = Array.isArray(item.reviews) ? item.reviews : [];
    const seen = new Set();
    if (links.length !== 3) {
      addIssue(issues, 'REVIEW_LINK_SET_INVALID', `/items/${itemIndex}/reviews`, 'Each item must link both independent reports and adjudication exactly once.');
    }
    for (const [linkIndex, link] of links.entries()) {
      const linkPath = `/items/${itemIndex}/reviews/${linkIndex}`;
      if (!isObject(link)) continue;
      if (seen.has(link.report_id) || !expectedReportIds.has(link.report_id)) {
        addIssue(issues, 'REVIEW_LINK_SET_INVALID', linkPath, 'Review links must use each expected report ID exactly once.');
      }
      seen.add(link.report_id);
      const expectedEntry = link.report_id === adjudicationId
        ? finalCases.get(item.pilot_id)
        : reports.get(link.report_id)?.cases.get(item.pilot_id);
      if (!expectedEntry
        || link.review_id !== expectedEntry.review_id
        || link.reviewer_class !== 'machine-agent'
        || link.review_scope !== 'intake-only'
        || link.source_id !== item.source?.source_id
        || link.task_id !== item.task?.task_id
        || link.decision !== (link.report_id === adjudicationId ? expectedEntry.final_decision : expectedEntry.decision)) {
        addIssue(issues, 'REVIEW_LINK_BINDING_INVALID', linkPath, 'Review link must match the exact digest-bound report entry.');
      }
    }
    for (const reportId of expectedReportIds) {
      if (!seen.has(reportId)) {
        addIssue(issues, 'REVIEW_LINK_SET_INVALID', `/items/${itemIndex}/reviews`, `Missing review link ${reportId}.`);
      }
    }
    const finalDecision = finalCases.get(item.pilot_id)?.final_decision;
    const expectedStatus = finalDecision === 'admit' ? 'pilot-admitted'
      : finalDecision === 'hold' ? 'hold'
        : finalDecision === 'reject' ? 'rejected' : null;
    if (expectedStatus !== null && item.status !== expectedStatus) {
      addIssue(issues, 'ITEM_FINAL_DECISION_MISMATCH', `/items/${itemIndex}/status`, 'Catalog item status must match final machine adjudication.');
    }
    const errorsAfter = issues.filter((entry) => entry.severity === 'error').length;
    linkValidity.set(item.pilot_id, errorsAfter === errorsBefore);
  }
  return linkValidity;
}

/**
 * @param {Record<string, any>} catalog
 * @param {Map<string, any>} finalCases
 * @param {Map<string, boolean>} baseValidity
 * @param {{root: string, rootReal: string, issues: Array<any>, physicalPaths: Map<string, string>}} context
 */
async function validateDefectLedger(catalog, finalCases, baseValidity, context) {
  const { issues } = context;
  const issuePath = '/defect_ledger';
  const descriptor = requireObject(catalog.defect_ledger, issuePath, issues);
  if (!descriptor) return 0;
  rejectUnknownKeys(descriptor, new Set(['ledger_id', 'path', 'sha256']), issuePath, issues);
  requireString(descriptor.ledger_id, `${issuePath}/ledger_id`, issues);
  requireDigest(descriptor.sha256, `${issuePath}/sha256`, issues);
  const ledger = await readRetainedJson(descriptor, issuePath, 'DEFECT_DIGEST_MISMATCH', context);
  if (!ledger) return 0;
  rejectUnknownKeys(ledger, new Set([
    'schema_version', 'ledger_id', 'evidence_class', 'external_expert_evidence',
    'release_eligible', 'release_status', 'boundary', 'normalization',
    'controlling_sources', 'source_reports', 'leads'
  ]), `${issuePath}/file`, issues, 'DEFECT_LEDGER_BINDING_INVALID', 'Unknown defect ledger field.');
  if (ledger.schema_version !== '1.0.0'
    || ledger.ledger_id !== descriptor.ledger_id
    || ledger.evidence_class !== 'public-source-machine-pilot') {
    addIssue(issues, 'DEFECT_LEDGER_BINDING_INVALID', `${issuePath}/file`, 'Defect ledger metadata must match the machine-pilot catalog.');
  }
  if (ledger.external_expert_evidence !== false
    || ledger.release_eligible !== false
    || ledger.release_status !== RELEASE_STATUS) {
    addIssue(issues, 'DEFECT_LEDGER_BOUNDARY_INVALID', `${issuePath}/file`, 'Defect ledger cannot claim external expertise or release eligibility.');
  }
  const leads = Array.isArray(ledger.leads) ? ledger.leads : null;
  if (!leads) {
    addIssue(issues, 'DEFECT_LEDGER_BINDING_INVALID', `${issuePath}/file/leads`, 'Defect ledger leads must be an array.');
    return 0;
  }
  const seenIds = new Set();
  const seenIssues = new Set();
  let countable = 0;
  let occurrenceCount = 0;
  for (const [index, leadValue] of leads.entries()) {
    const leadPath = `${issuePath}/file/leads/${index}`;
    const lead = requireObject(leadValue, leadPath, issues, 'DEFECT_LEDGER_BINDING_INVALID');
    if (!lead) continue;
    rejectUnknownKeys(lead, new Set([
      'defect_id', 'canonical_url', 'repository', 'issue_number', 'frozen_risk',
      'suggested_strata', 'relevance', 'status', 'bound_case_id', 'countable',
      'source_version', 'snapshot_sha256', 'snapshot_status', 'source_report_path',
      'source_report_sha256', 'risk_source', 'source_occurrences'
    ]), leadPath, issues, 'DEFECT_LEDGER_BINDING_INVALID', 'Unknown defect lead field.');
    requireString(lead.defect_id, `${leadPath}/defect_id`, issues, 'DEFECT_LEDGER_BINDING_INVALID');
    requireString(lead.repository, `${leadPath}/repository`, issues, 'DEFECT_LEDGER_BINDING_INVALID');
    requireString(lead.canonical_url, `${leadPath}/canonical_url`, issues, 'DEFECT_LEDGER_BINDING_INVALID');
    if (!Number.isInteger(lead.issue_number) || lead.issue_number <= 0) {
      addIssue(issues, 'DEFECT_URL_INVALID', `${leadPath}/issue_number`, 'Issue number must be a positive integer.');
    }
    const identity = `${String(lead.repository).toLowerCase()}#${lead.issue_number}`;
    const expectedUrl = `https://github.com/${lead.repository}/issues/${lead.issue_number}`;
    if (lead.canonical_url !== expectedUrl) {
      addIssue(issues, 'DEFECT_REPOSITORY_MISMATCH', `${leadPath}/canonical_url`, 'Canonical issue URL must exactly match repository and issue number.');
    }
    if (seenIds.has(lead.defect_id) || seenIssues.has(identity)) {
      addIssue(issues, 'DUPLICATE_DEFECT_ISSUE', leadPath, 'Defect IDs and canonical repository/issue identities must be globally unique.');
    }
    seenIds.add(lead.defect_id);
    seenIssues.add(identity);
    if (!Array.isArray(lead.suggested_strata) || lead.suggested_strata.length === 0
      || new Set(lead.suggested_strata).size !== lead.suggested_strata.length
      || lead.suggested_strata.some((stratum) => !FROZEN_STRATA.includes(stratum))) {
      addIssue(issues, 'DEFECT_STRATUM_INVALID', `${leadPath}/suggested_strata`, 'Suggested strata must be a non-empty unique subset of frozen strata.');
    }
    if (!['lead', 'case-bound'].includes(lead.status)) {
      addIssue(issues, 'DEFECT_STATUS_INVALID', `${leadPath}/status`, 'Unknown defect status.');
    }
    if (typeof lead.countable !== 'boolean') {
      addIssue(issues, 'DEFECT_LEDGER_BINDING_INVALID', `${leadPath}/countable`, 'Defect countable must be boolean.');
    }
    if (lead.status === 'lead') {
      if (lead.bound_case_id !== null || lead.countable !== false) {
        addIssue(issues, 'LEAD_DEFECT_BINDING_INVALID', leadPath, 'A defect lead must remain unbound and uncountable.');
      }
      if (lead.countable === true) {
        addIssue(issues, 'UNBOUND_DEFECT_COUNTED', `${leadPath}/countable`, 'An unbound defect lead cannot count.');
        addIssue(issues, 'COUNTABLE_DEFECT_STATUS_INVALID', `${leadPath}/status`, 'Only a case-bound defect may be countable.');
      }
    }
    if (lead.status === 'case-bound') {
      const item = catalog.items.find((/** @type {any} */ entry) => entry?.pilot_id === lead.bound_case_id);
      const finalAdmitted = item
        && finalCases.get(item.pilot_id)?.final_decision === 'admit'
        && item.status === 'pilot-admitted'
        && baseValidity.get(item.pilot_id) === true;
      if (!finalAdmitted) {
        addIssue(issues, 'DEFECT_BOUND_TO_NON_ADMITTED', `${leadPath}/bound_case_id`, 'A case-bound defect may bind only to a final-admitted valid case.');
      }
      if (item && (lead.repository.toLowerCase() !== item.repository.toLowerCase()
        || !lead.suggested_strata.includes(item.stratum))) {
        addIssue(issues, 'DEFECT_BINDING_INVALID', leadPath, 'Defect repository and suggested stratum must match the bound case.');
      }
      const snapshotDeclared = nonEmptyString(lead.source_version)
        && typeof lead.snapshot_sha256 === 'string'
        && SHA256_PATTERN.test(lead.snapshot_sha256)
        && lead.snapshot_status === 'retained';
      // The v1 ledger has no retained snapshot path descriptor, so declarations
      // alone can never make a historical issue countable.
      const snapshotReady = false;
      if (!snapshotReady) {
        addIssue(issues, 'DEFECT_SNAPSHOT_INSUFFICIENT', leadPath, snapshotDeclared
          ? 'Declared snapshot metadata is not enough without a digest-bound retained snapshot path.'
          : 'Case-bound defects require an immutable retained version and snapshot digest.');
      }
      if (lead.countable === true && finalAdmitted && snapshotReady) countable += 1;
    }
    const occurrences = Array.isArray(lead.source_occurrences) ? lead.source_occurrences : null;
    if (!occurrences || occurrences.length === 0) {
      addIssue(issues, 'DEFECT_LINEAGE_INVALID', `${leadPath}/source_occurrences`, 'Every lead must retain at least one source occurrence.');
    }
    occurrenceCount += occurrences?.length ?? 0;
  }
  const normalization = isObject(ledger.normalization) ? ledger.normalization : null;
  if (!normalization
    || normalization.unique_lead_count !== leads.length
    || normalization.raw_entry_count !== occurrenceCount
    || normalization.deduplication_count !== occurrenceCount - leads.length) {
    addIssue(issues, 'DEFECT_NORMALIZATION_INVALID', `${issuePath}/file/normalization`, 'Ledger normalization counts must be recomputed from unique leads and source occurrences.');
  }
  return countable;
}

/**
 * @param {Record<string, any>} catalog
 * @param {{root: string, rootReal: string, repositoryRoot: string, repositoryRootReal: string, issues: Array<any>, physicalPaths: Map<string, string>}} context
 */
async function validateComparatorRegistry(catalog, context) {
  const { issues } = context;
  const issuePath = '/comparators';
  const descriptor = requireObject(catalog.comparators, issuePath, issues);
  if (!descriptor) return false;
  rejectUnknownKeys(descriptor, new Set(['registry_id', 'path', 'sha256']), issuePath, issues);
  requireString(descriptor.registry_id, `${issuePath}/registry_id`, issues);
  requireDigest(descriptor.sha256, `${issuePath}/sha256`, issues);
  const registry = await readRetainedJson(descriptor, issuePath, 'COMPARATOR_REGISTRY_DIGEST_MISMATCH', context);
  if (!registry) return false;
  rejectUnknownKeys(registry, new Set([
    'schema_version', 'registry_id', 'evidence_class', 'captures_allowed', 'systems'
  ]), `${issuePath}/file`, issues, 'COMPARATOR_REGISTRY_INVALID', 'Unknown comparator registry field.');
  if (registry.schema_version !== '1.0.0'
    || registry.registry_id !== descriptor.registry_id
    || registry.evidence_class !== 'public-source-machine-pilot') {
    addIssue(issues, 'COMPARATOR_REGISTRY_INVALID', `${issuePath}/file`, 'Comparator registry metadata must match the machine-pilot catalog.');
  }
  if (typeof registry.captures_allowed !== 'boolean') {
    addIssue(issues, 'COMPARATOR_REGISTRY_INVALID', `${issuePath}/file/captures_allowed`, 'captures_allowed must be boolean.');
  }

  const systems = Array.isArray(registry.systems) ? registry.systems : null;
  if (!systems || systems.length !== COMPARATOR_IDS.length) {
    addIssue(issues, 'COMPARATOR_SET_INVALID', `${issuePath}/file/systems`, 'Comparator registry must contain exactly the four frozen benchmark system identities.');
  }
  const seenSystems = new Set();
  let allFrozen = systems?.length === COMPARATOR_IDS.length;
  for (const [index, systemValue] of (systems ?? []).entries()) {
    const systemPath = `${issuePath}/file/systems/${index}`;
    const system = requireObject(systemValue, systemPath, issues, 'COMPARATOR_REGISTRY_INVALID');
    if (!system) {
      allFrozen = false;
      continue;
    }
    rejectUnknownKeys(system, new Set([
      'system_id', 'status', 'version', 'repository_revision', 'artifacts',
      'model_identity', 'run_recipe', 'missing_fields', 'resolution_note'
    ]), systemPath, issues, 'COMPARATOR_REGISTRY_INVALID', 'Unknown comparator identity field.');
    if (!COMPARATOR_IDS.includes(system.system_id) || seenSystems.has(system.system_id)) {
      addIssue(issues, 'COMPARATOR_SET_INVALID', `${systemPath}/system_id`, 'Comparator IDs must be unique members of the frozen four-system set.');
    }
    if (typeof system.system_id === 'string') seenSystems.add(system.system_id);
    if (!['frozen', 'unresolved'].includes(system.status)) {
      addIssue(issues, 'COMPARATOR_STATUS_INVALID', `${systemPath}/status`, 'Comparator status must be frozen or unresolved.');
      allFrozen = false;
      continue;
    }
    if (system.status === 'unresolved') {
      allFrozen = false;
      if (!Array.isArray(system.missing_fields)
        || system.missing_fields.length === 0
        || system.missing_fields.some((field) => !['version', 'artifacts', 'model_identity', 'run_recipe'].includes(field))
        || !nonEmptyString(system.resolution_note)) {
        addIssue(issues, 'COMPARATOR_UNRESOLVED_INVALID', systemPath, 'Unresolved comparators must name missing identity fields and an honest resolution note.');
      }
      addIssue(issues, 'COMPARATOR_UNRESOLVED', systemPath, `Comparator ${system.system_id ?? '(unknown)'} is unresolved; captures remain closed.`, 'incomplete');
      continue;
    }

    let identityValid = true;
    if (!nonEmptyString(system.version)
      || typeof system.repository_revision !== 'string'
      || !COMMIT_PATTERN.test(system.repository_revision)) {
      identityValid = false;
    }
    const artifacts = Array.isArray(system.artifacts) ? system.artifacts : null;
    const artifactIds = new Set();
    const artifactKinds = new Set();
    if (!artifacts || artifacts.length === 0) {
      identityValid = false;
    }
    for (const [artifactIndex, artifactValue] of (artifacts ?? []).entries()) {
      const artifactPath = `${systemPath}/artifacts/${artifactIndex}`;
      const artifact = requireObject(artifactValue, artifactPath, issues, 'COMPARATOR_FROZEN_IDENTITY_INVALID');
      if (!artifact) {
        identityValid = false;
        continue;
      }
      rejectUnknownKeys(artifact, new Set(['artifact_id', 'kind', 'repository_path', 'sha256']), artifactPath, issues, 'COMPARATOR_FROZEN_IDENTITY_INVALID', 'Unknown frozen artifact field.');
      const artifactMetadataInvalid = !nonEmptyString(artifact.artifact_id)
        || artifactIds.has(artifact.artifact_id)
        || !['prompt', 'skill', 'compiler', 'schema', 'reference'].includes(artifact.kind)
        || !nonEmptyString(artifact.repository_path)
        || path.isAbsolute(artifact.repository_path)
        || String(artifact.repository_path).split(/[\\/]+/).includes('..')
        || typeof artifact.sha256 !== 'string'
        || !SHA256_PATTERN.test(artifact.sha256);
      if (artifactMetadataInvalid) {
        identityValid = false;
      } else {
        const retainedArtifact = await readRetainedArtifact({
          root: context.repositoryRoot,
          rootReal: context.repositoryRootReal,
          relativePath: artifact.repository_path,
          expectedDigest: artifact.sha256,
          issuePath: artifactPath,
          mismatchCode: 'COMPARATOR_ARTIFACT_DIGEST_MISMATCH',
          issues,
          physicalPaths: context.physicalPaths,
          pathField: 'repository_path'
        });
        if (!retainedArtifact?.digestMatches) identityValid = false;
      }
      artifactIds.add(artifact.artifact_id);
      artifactKinds.add(artifact.kind);
    }
    if (!artifactKinds.has('prompt') && !artifactKinds.has('skill')) identityValid = false;
    if (system.system_id === 'generate-test-cases'
      && !['skill', 'compiler', 'schema'].every((kind) => artifactKinds.has(kind))) {
      identityValid = false;
    }
    const model = isObject(system.model_identity) ? system.model_identity : null;
    if (!model) {
      identityValid = false;
    } else {
      rejectUnknownKeys(model, new Set(['provider', 'model_id', 'reasoning_effort']), `${systemPath}/model_identity`, issues, 'COMPARATOR_FROZEN_IDENTITY_INVALID', 'Unknown model identity field.');
      if (!nonEmptyString(model.provider) || !nonEmptyString(model.model_id) || !nonEmptyString(model.reasoning_effort)) {
        identityValid = false;
      }
    }
    const recipe = isObject(system.run_recipe) ? system.run_recipe : null;
    if (!recipe) {
      identityValid = false;
    } else {
      rejectUnknownKeys(recipe, new Set([
        'recipe_id', 'invocation', 'input_contract', 'output_contract', 'independent_runs'
      ]), `${systemPath}/run_recipe`, issues, 'COMPARATOR_FROZEN_IDENTITY_INVALID', 'Unknown run recipe field.');
      if (!nonEmptyString(recipe.recipe_id)
        || !nonEmptyString(recipe.invocation)
        || !nonEmptyString(recipe.input_contract)
        || !nonEmptyString(recipe.output_contract)
        || recipe.independent_runs !== 3) {
        identityValid = false;
      }
    }
    if (!identityValid) {
      addIssue(issues, 'COMPARATOR_FROZEN_IDENTITY_INVALID', systemPath, 'Frozen comparators require a version, immutable revision, exact prompt or Skill artifact digests, model identity, and three-run recipe.');
      allFrozen = false;
    }
  }
  for (const systemId of COMPARATOR_IDS) {
    if (!seenSystems.has(systemId)) {
      addIssue(issues, 'COMPARATOR_SET_INVALID', `${issuePath}/file/systems`, `Missing comparator ${systemId}.`);
      allFrozen = false;
    }
  }
  if (registry.captures_allowed === true && !allFrozen) {
    addIssue(issues, 'CAPTURE_GATE_INVALID', `${issuePath}/file/captures_allowed`, 'Captures cannot open until all four comparator identities are frozen and complete.');
  }
  return allFrozen && registry.captures_allowed === true;
}

/**
 * Validate a public-source machine-pilot catalog without invoking release gates.
 *
 * @param {string} catalogPath
 * @returns {Promise<{
 *   status: 'pilot_ready' | 'pilot_incomplete' | 'invalid',
 *   release_eligible: false,
 *   release_status: 'insufficient_evidence',
 *   captures_ready: boolean,
 *   counts: {total: number, pilot_admitted: number, countable_defects: number, by_stratum: Record<string, number>},
 *   issues: Array<{code: string, path: string, message: string, severity: 'error' | 'incomplete'}>
 * }>}
 */
export async function validatePublicPilot(catalogPath) {
  /** @type {Array<any>} */
  const issues = [];
  const byStratum = Object.fromEntries(FROZEN_STRATA.map((stratum) => [stratum, 0]));
  const counts = { total: 0, pilot_admitted: 0, countable_defects: 0, by_stratum: byStratum };
  let capturesReady = false;

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
      captures_ready: capturesReady && !invalid,
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
  const repositoryRoot = path.resolve(root, '../../..');
  let rootReal;
  let repositoryRootReal;
  let catalogBytes;
  try {
    [rootReal, repositoryRootReal, catalogBytes] = await Promise.all([
      realpath(root),
      realpath(repositoryRoot),
      readFile(absoluteCatalogPath)
    ]);
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
    'schema_version', 'catalog_id', 'evidence_class', 'release_eligible', 'release_status',
    'corpus_snapshot_sha256', 'intake_report', 'review_reports', 'adjudication_report', 'defect_ledger', 'comparators', 'items'
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
  requireDigest(catalogObject.corpus_snapshot_sha256, '/corpus_snapshot_sha256', issues, 'CORPUS_SNAPSHOT_DIGEST_MISMATCH');
  if (!Array.isArray(catalogObject.items)) {
    addIssue(issues, 'CATALOG_CONTRACT_INVALID', '/items', 'Catalog items must be an array.');
    return finish();
  }

  counts.total = catalogObject.items.length;
  const context = {
    root,
    rootReal,
    repositoryRoot,
    repositoryRootReal,
    issues,
    physicalPaths: new Map(),
    contentDigests: new Map(),
    stableIds: new Map()
  };
  const baseValidity = new Map();
  for (const [itemIndex, itemValue] of catalogObject.items.entries()) {
    const item = requireObject(itemValue, `/items/${itemIndex}`, issues);
    if (!item) continue;
    const result = await validateItem(item, itemIndex, context);
    baseValidity.set(item.pilot_id, result.baseValid);
  }

  const snapshotDigest = corpusSnapshotDigest(catalogObject);
  if (catalogObject.corpus_snapshot_sha256 !== snapshotDigest) {
    addIssue(issues, 'CORPUS_SNAPSHOT_DIGEST_MISMATCH', '/corpus_snapshot_sha256', 'Catalog corpus snapshot digest does not match the recomputed Task 3 projection.');
  }
  const intakeReportDigest = await validateIntakeReport(catalogObject, context);
  const reports = await validateReviewReports(catalogObject, snapshotDigest, intakeReportDigest, context);
  const finalCases = await validateAdjudication(catalogObject, snapshotDigest, reports, context);
  const linkValidity = validateReviewLinks(catalogObject, reports, finalCases, issues);
  counts.countable_defects = await validateDefectLedger(catalogObject, finalCases, baseValidity, context);
  capturesReady = await validateComparatorRegistry(catalogObject, context);

  for (const item of catalogObject.items) {
    if (baseValidity.get(item.pilot_id) === true
      && item.status === 'pilot-admitted'
      && finalCases.get(item.pilot_id)?.final_decision === 'admit'
      && linkValidity.get(item.pilot_id) === true
      && FROZEN_STRATA.includes(item.stratum)) {
      counts.pilot_admitted += 1;
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
