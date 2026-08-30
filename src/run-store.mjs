import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { canonicalStringify, digest } from './canonical.mjs';

export const STAGE_FILES = Object.freeze({
  source_pack: 'source-pack.json',
  evidence_claims: 'evidence-claims.json',
  behavior_views: 'behavior-views.json',
  case_drafts: 'case-drafts.json'
});

const CONTROLLED_DIRECTORIES = Object.freeze(['accepted', 'staging', 'derived', 'output']);
const CONTROLLED_FILES = Object.freeze(['checkpoint.json']);
const REVISION_DIRECTORY = /^r([0-9]+)$/u;
const TEMPORARY_FILE = /^\..+\.tmp-([0-9]+)-[0-9]+$/u;
const RUN_LOCK_RESIDUE_DIRECTORY = /^\.compiler-advance\.lock\.(?:release|stale)-[0-9]+-[0-9]+$/u;
let temporarySequence = 0;
let lockSequence = 0;
const RUN_LOCK_DIRECTORY = '.compiler-advance.lock';
const RUN_LOCK_OWNER_FILE = 'owner.json';
const RUN_LOCK_LEASE_MS = 300_000;
const RUN_LOCK_INCOMPLETE_GRACE_MS = 2_000;
const RUN_LOCK_POLL_MS = 25;
const RUN_LOCK_WAIT_MS = 30_000;

const NATIVE_ARRAY = Array;
const NATIVE_ARRAY_PROTOTYPE = Array.prototype;
const NATIVE_ARRAY_SORT = Array.prototype.sort;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_ARRAY_STATIC_INTRINSICS = Object.freeze([
  ['isArray', Array.isArray], ['from', Array.from]
]);
const NATIVE_MAP = Map;
const NATIVE_MAP_PROTOTYPE = Map.prototype;
const NATIVE_SET = Set;
const NATIVE_SET_PROTOTYPE = Set.prototype;
const NATIVE_OBJECT = Object;
const NATIVE_DEFINE_PROPERTY = Object.defineProperty;
const NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_OBJECT_INTRINSICS = Object.freeze([
  ['defineProperty', Object.defineProperty],
  ['fromEntries', Object.fromEntries],
  ['getOwnPropertyDescriptor', Object.getOwnPropertyDescriptor],
  ['getOwnPropertyDescriptors', Object.getOwnPropertyDescriptors],
  ['getPrototypeOf', Object.getPrototypeOf], ['hasOwn', Object.hasOwn],
  ['keys', Object.keys], ['entries', Object.entries]
]);
const NATIVE_SYMBOL = Symbol;
const NATIVE_SYMBOL_ITERATOR = Symbol.iterator;
const NATIVE_GLOBAL_THIS = globalThis;
const NATIVE_REGEXP_EXEC = RegExp.prototype.exec;
const NATIVE_REFLECT_APPLY = Reflect.apply;
const NATIVE_REFLECT = Reflect;
const NATIVE_NUMBER = Number;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_NUMBER_INTRINSICS = Object.freeze([
  ['isFinite', Number.isFinite], ['isSafeInteger', Number.isSafeInteger]
]);
const NATIVE_STRING = String;
const NATIVE_STRING_PROTOTYPE = String.prototype;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_STRING_INTRINSICS = Object.freeze([
  ['codePointAt', String.prototype.codePointAt],
  ['split', String.prototype.split], ['includes', String.prototype.includes],
  ['startsWith', String.prototype.startsWith], ['padStart', String.prototype.padStart],
  ['trim', String.prototype.trim],
  [NATIVE_SYMBOL_ITERATOR, (/** @type {any} */ (String.prototype))[NATIVE_SYMBOL_ITERATOR]]
]);
const NATIVE_REGEXP = RegExp;
const NATIVE_REGEXP_PROTOTYPE = RegExp.prototype;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_REGEXP_INTRINSICS = Object.freeze([
  ['exec', RegExp.prototype.exec], ['test', RegExp.prototype.test]
]);
const NATIVE_JSON = JSON;
const NATIVE_JSON_PARSE = JSON.parse;
const NATIVE_JSON_STRINGIFY = JSON.stringify;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_JSON_INTRINSICS = Object.freeze([
  ['parse', JSON.parse], ['stringify', JSON.stringify]
]);
const NATIVE_STRUCTURED_CLONE = structuredClone;
const NATIVE_PROMISE = Promise;
const NATIVE_SET_TIMEOUT = setTimeout;
const NATIVE_DATE = Date;
const NATIVE_DATE_NOW = Date.now;
const NATIVE_MATH = Math;
const NATIVE_MATH_MIN = Math.min;
const NATIVE_PROCESS = process;
const NATIVE_PROCESS_KILL = process.kill;
const NATIVE_PROCESS_PID = process.pid;
const NATIVE_PROCESS_START_IDENTITY = `${process.pid}:${Date.now() - process.uptime() * 1_000}`;
const NATIVE_PATH = path;
const NATIVE_PATH_BASENAME = path.basename;
const NATIVE_PATH_DIRNAME = path.dirname;
const NATIVE_PATH_IS_ABSOLUTE = path.isAbsolute;
const NATIVE_PATH_JOIN = path.join;
const NATIVE_PATH_RELATIVE = path.relative;
const NATIVE_PATH_RESOLVE = path.resolve;
const NATIVE_PATH_SEPARATOR = path.sep;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_PATH_INTRINSICS = Object.freeze([
  ['basename', path.basename], ['dirname', path.dirname], ['isAbsolute', path.isAbsolute],
  ['join', path.join], ['relative', path.relative], ['resolve', path.resolve], ['sep', path.sep]
]);
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_REFLECT_INTRINSICS = Object.freeze([['apply', Reflect.apply]]);
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_DATE_INTRINSICS = Object.freeze([['now', Date.now]]);
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_MATH_INTRINSICS = Object.freeze([['min', Math.min]]);
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_PROCESS_INTRINSICS = Object.freeze([
  ['kill', process.kill], ['pid', process.pid]
]);
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const fsConstants = fsPromises.constants;
const lstat = fsPromises.lstat;
const open = fsPromises.open;
const realpath = fsPromises.realpath;
const rename = fsPromises.rename;
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_ARRAY_INTRINSICS = Object.freeze([
  ['sort', Array.prototype.sort], ['map', Array.prototype.map], ['some', Array.prototype.some],
  ['filter', Array.prototype.filter], ['slice', Array.prototype.slice],
  ['includes', Array.prototype.includes], ['reverse', Array.prototype.reverse],
  ['push', Array.prototype.push], ['entries', Array.prototype.entries],
  [NATIVE_SYMBOL_ITERATOR, (/** @type {any} */ (Array.prototype))[NATIVE_SYMBOL_ITERATOR]]
]);
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_MAP_INTRINSICS = Object.freeze([
  ['get', Map.prototype.get], ['set', Map.prototype.set], ['has', Map.prototype.has],
  ['forEach', Map.prototype.forEach],
  [NATIVE_SYMBOL_ITERATOR, (/** @type {any} */ (Map.prototype))[NATIVE_SYMBOL_ITERATOR]]
]);
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_SET_INTRINSICS = Object.freeze([
  ['add', Set.prototype.add], ['has', Set.prototype.has], ['forEach', Set.prototype.forEach],
  [NATIVE_SYMBOL_ITERATOR, (/** @type {any} */ (Set.prototype))[NATIVE_SYMBOL_ITERATOR]]
]);
const NATIVE_MAP_SIZE_GET = NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  NATIVE_MAP_PROTOTYPE, 'size'
)?.get;
const NATIVE_SET_SIZE_GET = NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  NATIVE_SET_PROTOTYPE, 'size'
)?.get;
const NATIVE_NUMBER_IS_SAFE_INTEGER = Number.isSafeInteger;

export class RunStoreIntegrityError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'RunStoreIntegrityError';
  }
}

/** @param {RegExp} expression @param {string} value */
function regexpTest(expression, value) {
  return NATIVE_REFLECT_APPLY(NATIVE_REGEXP_EXEC, expression, [value]) !== null;
}

/** @param {string} value */
function pathBasename(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_BASENAME, NATIVE_PATH, [value]);
}

/** @param {string} value */
function pathDirname(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_DIRNAME, NATIVE_PATH, [value]);
}

/** @param {string} value */
function pathIsAbsolute(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_IS_ABSOLUTE, NATIVE_PATH, [value]);
}

/** @param {...string} parts */
function pathJoin(...parts) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_JOIN, NATIVE_PATH, parts);
}

/** @param {string} from @param {string} to */
function pathRelative(from, to) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_RELATIVE, NATIVE_PATH, [from, to]);
}

/** @param {string} value */
function pathResolve(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_RESOLVE, NATIVE_PATH, [value]);
}

function currentTimeMilliseconds() {
  return NATIVE_REFLECT_APPLY(NATIVE_DATE_NOW, NATIVE_DATE, []);
}

/** @param {unknown} value */
function nativeString(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_STRING, undefined, [value]);
}

/** @param {unknown} value */
function nativeJsonStringify(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_JSON_STRINGIFY, NATIVE_JSON, [value]);
}

/** @param {string} fileName */
function temporaryOwnerIsAlive(fileName) {
  const match = NATIVE_REFLECT_APPLY(NATIVE_REGEXP_EXEC, TEMPORARY_FILE, [fileName]);
  if (!match) return false;
  const ownerPid = NATIVE_REFLECT_APPLY(NATIVE_NUMBER, undefined, [match[1]]);
  if (ownerPid === NATIVE_PROCESS_PID) return true;
  try {
    NATIVE_REFLECT_APPLY(NATIVE_PROCESS_KILL, NATIVE_PROCESS, [ownerPid, 0]);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EPERM');
  }
}

/** @param {unknown} ownerPid */
function processOwnerIsAlive(ownerPid) {
  if (typeof ownerPid !== 'number'
    || !NATIVE_REFLECT_APPLY(NATIVE_NUMBER_IS_SAFE_INTEGER, NATIVE_NUMBER, [ownerPid])
    || ownerPid <= 0) return false;
  if (ownerPid === NATIVE_PROCESS_PID) return true;
  try {
    NATIVE_REFLECT_APPLY(NATIVE_PROCESS_KILL, NATIVE_PROCESS, [ownerPid, 0]);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EPERM');
  }
}

/** @param {any[]} values @param {unknown} value */
function append(values, value) {
  NATIVE_REFLECT_APPLY(NATIVE_DEFINE_PROPERTY, NATIVE_OBJECT, [values, String(values.length), {
    value, enumerable: true, writable: true, configurable: true
  }]);
}

/** @param {object} owner @param {ReadonlyArray<readonly [string|symbol,unknown]>} expected */
function descriptorsMatch(owner, expected) {
  for (let index = 0; index < expected.length; index += 1) {
    const descriptor = NATIVE_REFLECT_APPLY(
      NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR, NATIVE_OBJECT, [owner, expected[index][0]]
    );
    if (!descriptor || descriptor.get || descriptor.set || descriptor.value !== expected[index][1]) {
      return false;
    }
  }
  return true;
}

/** @param {object} owner @param {string|symbol} key @param {unknown} getter */
function getterMatches(owner, key, getter) {
  const descriptor = NATIVE_REFLECT_APPLY(
    NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR, NATIVE_OBJECT, [owner, key]
  );
  return Boolean(descriptor && descriptor.get === getter && !descriptor.set);
}

/** The filesystem shell rejects caller-mutated traversal intrinsics before downstream code runs. */
export function runStoreIntrinsicsIntact() {
  const globals = [
    ['Array', NATIVE_ARRAY], ['Map', NATIVE_MAP], ['Set', NATIVE_SET],
    ['Object', NATIVE_OBJECT], ['Symbol', NATIVE_SYMBOL], ['Number', NATIVE_NUMBER],
    ['String', NATIVE_STRING], ['RegExp', NATIVE_REGEXP], ['Reflect', NATIVE_REFLECT],
    ['Date', NATIVE_DATE], ['Math', NATIVE_MATH],
    ['JSON', NATIVE_JSON], ['structuredClone', NATIVE_STRUCTURED_CLONE]
  ];
  for (let index = 0; index < globals.length; index += 1) {
    const descriptor = NATIVE_REFLECT_APPLY(
      NATIVE_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR, NATIVE_OBJECT,
      [NATIVE_GLOBAL_THIS, globals[index][0]]
    );
    if (!descriptor || descriptor.get || descriptor.set || descriptor.value !== globals[index][1]) {
      return false;
    }
  }
  return descriptorsMatch(NATIVE_ARRAY_PROTOTYPE, NATIVE_ARRAY_INTRINSICS)
    && descriptorsMatch(NATIVE_ARRAY, NATIVE_ARRAY_STATIC_INTRINSICS)
    && descriptorsMatch(NATIVE_MAP_PROTOTYPE, NATIVE_MAP_INTRINSICS)
    && descriptorsMatch(NATIVE_SET_PROTOTYPE, NATIVE_SET_INTRINSICS)
    && descriptorsMatch(NATIVE_STRING_PROTOTYPE, NATIVE_STRING_INTRINSICS)
    && descriptorsMatch(NATIVE_REGEXP_PROTOTYPE, NATIVE_REGEXP_INTRINSICS)
    && descriptorsMatch(NATIVE_OBJECT, NATIVE_OBJECT_INTRINSICS)
    && descriptorsMatch(NATIVE_NUMBER, NATIVE_NUMBER_INTRINSICS)
    && descriptorsMatch(NATIVE_JSON, NATIVE_JSON_INTRINSICS)
    && descriptorsMatch(NATIVE_PATH, NATIVE_PATH_INTRINSICS)
    && descriptorsMatch(NATIVE_REFLECT, NATIVE_REFLECT_INTRINSICS)
    && descriptorsMatch(NATIVE_DATE, NATIVE_DATE_INTRINSICS)
    && descriptorsMatch(NATIVE_MATH, NATIVE_MATH_INTRINSICS)
    && descriptorsMatch(NATIVE_PROCESS, NATIVE_PROCESS_INTRINSICS)
    && getterMatches(NATIVE_MAP_PROTOTYPE, 'size', NATIVE_MAP_SIZE_GET)
    && getterMatches(NATIVE_SET_PROTOTYPE, 'size', NATIVE_SET_SIZE_GET);
}

function requireRunStoreIntrinsics() {
  if (!runStoreIntrinsicsIntact()) throw new RunStoreIntegrityError(
    'Run-store traversal intrinsics changed during an atomic operation.'
  );
}

/** @param {number} sourceRevision */
export function revisionName(sourceRevision) {
  return `r${String(sourceRevision).padStart(3, '0')}`;
}

/** @param {unknown} error */
export function isMissing(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && /** @type {{code?:unknown}} */ (error).code === 'ENOENT');
}

/** @param {string} runDirectory @param {string} targetPath */
function relativeControlledPath(runDirectory, targetPath) {
  const relative = pathRelative(runDirectory, targetPath);
  if (relative === '' || relative === '..' || relative.startsWith(`..${NATIVE_PATH_SEPARATOR}`)
    || pathIsAbsolute(relative)) {
    throw new RunStoreIntegrityError('Controlled run path escaped the canonical run root.');
  }
  return relative;
}

/** @param {string} runDirectory @param {string} targetPath */
async function assertNoSymlinkPath(runDirectory, targetPath) {
  const relative = relativeControlledPath(runDirectory, targetPath);
  const parts = relative.split(NATIVE_PATH_SEPARATOR);
  let current = runDirectory;
  let lastExisting = runDirectory;
  for (let index = 0; index < parts.length; index += 1) {
    current = pathJoin(current, parts[index]);
    let status;
    try { status = await lstat(current); } catch (error) {
      if (isMissing(error)) break;
      throw error;
    }
    if (status.isSymbolicLink()) throw new RunStoreIntegrityError(
      `Controlled run path contains a symbolic link: ${relative}`
    );
    if (index < parts.length - 1 && !status.isDirectory()) throw new RunStoreIntegrityError(
      `Controlled run path contains a non-directory ancestor: ${relative}`
    );
    lastExisting = current;
  }
  const realRoot = await realpath(runDirectory);
  const realExisting = await realpath(lastExisting);
  const realRelative = pathRelative(realRoot, realExisting);
  if (realRelative === '..' || realRelative.startsWith(`..${NATIVE_PATH_SEPARATOR}`)
    || pathIsAbsolute(realRelative)) {
    throw new RunStoreIntegrityError('Controlled run path resolved outside the real run root.');
  }
}

/** @param {string} runDirectory @param {string} directory */
async function ensureDirectory(runDirectory, directory) {
  if (pathResolve(directory) === pathResolve(runDirectory)) {
    const status = await lstat(runDirectory);
    if (status.isSymbolicLink() || !status.isDirectory()) throw new RunStoreIntegrityError(
      'Run root is not a real directory.'
    );
    return;
  }
  const relative = relativeControlledPath(runDirectory, directory);
  const parts = relative.split(NATIVE_PATH_SEPARATOR);
  let current = runDirectory;
  for (let index = 0; index < parts.length; index += 1) {
    current = pathJoin(current, parts[index]);
    try { await mkdir(current); } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) {
        throw error;
      }
    }
    const status = await lstat(current);
    if (status.isSymbolicLink() || !status.isDirectory()) throw new RunStoreIntegrityError(
      `Controlled directory is not a real directory: ${relative}`
    );
  }
}

/** @param {string} directory */
async function syncDirectory(directory) {
  const handle = await open(directory, fsConstants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
}

/** @param {unknown} error @param {string} code */
function hasErrorCode(error, code) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

/** @param {number} milliseconds */
function delay(milliseconds) {
  return new NATIVE_PROMISE((resolve) => { NATIVE_SET_TIMEOUT(resolve, milliseconds); });
}

/** @param {string} runDirectory @param {string} ownerPath */
async function readRunLockOwner(runDirectory, ownerPath) {
  const text = await readTextIfPresent(runDirectory, ownerPath);
  if (text === null) return null;
  try {
    const value = NATIVE_REFLECT_APPLY(NATIVE_JSON_PARSE, NATIVE_JSON, [text]);
    return value && typeof value === 'object'
      ? /** @type {Record<string,unknown>} */ (value) : null;
  } catch {
    throw new RunStoreIntegrityError('Run coordination owner metadata is not valid JSON.');
  }
}

/** @param {string} runDirectory @param {string} ownerPath @param {Record<string,unknown>} owner */
async function writeRunLockOwner(runDirectory, ownerPath, owner) {
  await atomicWriteText(runDirectory, ownerPath, `${nativeJsonStringify(owner)}\n`);
}

/** Remove crash residues only after proving their complete trees contain no symlink. */
/** @param {string} runDirectory */
export async function cleanupRunLockResidues(runDirectory) {
  const entries = await readdir(runDirectory, { withFileTypes: true });
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!regexpTest(RUN_LOCK_RESIDUE_DIRECTORY, entry.name)) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new RunStoreIntegrityError(
      'Run coordination crash residue is not a real directory.'
    );
    const target = pathJoin(runDirectory, entry.name);
    await inspectTree(runDirectory, target);
    await rm(target, { recursive: true, force: true });
    await syncDirectory(runDirectory);
  }
}

/**
 * Acquire the crash-recoverable, process-wide coordination right for one run.
 * The lock directory is the atomic claim; owner metadata distinguishes an
 * active process from a safely reclaimable abandoned claim.
 * @param {string} runDirectory
 * @returns {Promise<()=>Promise<void>>}
 */
export async function acquireRunLock(runDirectory) {
  const lockDirectory = pathJoin(runDirectory, RUN_LOCK_DIRECTORY);
  const ownerPath = pathJoin(lockDirectory, RUN_LOCK_OWNER_FILE);
  const startedAt = currentTimeMilliseconds();
  const token = `${nativeString(NATIVE_PROCESS_PID)}-${nativeString(startedAt)}-${nativeString(++lockSequence)}`;

  while (true) {
    try {
      await mkdir(lockDirectory);
      await syncDirectory(runDirectory);
      const owner = {
        pid: NATIVE_PROCESS_PID,
        token,
        lease_expires_at_ms: currentTimeMilliseconds() + RUN_LOCK_LEASE_MS,
        process_start_identity: NATIVE_PROCESS_START_IDENTITY
      };
      try {
        await writeRunLockOwner(runDirectory, ownerPath, owner);
        await syncDirectory(runDirectory);
      } catch (error) {
        await rm(lockDirectory, { recursive: true, force: true }).catch(() => {});
        await syncDirectory(runDirectory).catch(() => {});
        throw error;
      }

      let released = false;
      return async () => {
        if (released) return;
        const record = await readRunLockOwner(runDirectory, ownerPath);
        if (!record || record.token !== token || record.pid !== NATIVE_PROCESS_PID
          || record.process_start_identity !== NATIVE_PROCESS_START_IDENTITY) {
          throw new RunStoreIntegrityError('Run coordination ownership changed before release.');
        }
        const releasedDirectory = `${lockDirectory}.release-${nativeString(NATIVE_PROCESS_PID)}-${nativeString(++lockSequence)}`;
        await rename(lockDirectory, releasedDirectory);
        await syncDirectory(runDirectory);
        await rm(releasedDirectory, { recursive: true, force: true });
        await syncDirectory(runDirectory);
        released = true;
      };
    } catch (error) {
      if (!hasErrorCode(error, 'EEXIST')) throw error;
    }

    let status;
    try {
      status = await lstat(lockDirectory);
    } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    if (status.isSymbolicLink() || !status.isDirectory()) throw new RunStoreIntegrityError(
      'Run coordination claim is not a real directory.'
    );

    const record = await readRunLockOwner(runDirectory, ownerPath);
    const ownerPid = record?.pid;
    const ownerToken = record?.token;
    const ownerLease = record?.lease_expires_at_ms;
    const ownerProcessStart = record?.process_start_identity;
    const ownerShapeValid = typeof ownerToken === 'string' && ownerToken.length > 0
      && typeof ownerPid === 'number' && typeof ownerLease === 'number'
      && NATIVE_REFLECT_APPLY(NATIVE_NUMBER_IS_SAFE_INTEGER, NATIVE_NUMBER, [ownerPid])
      && NATIVE_REFLECT_APPLY(NATIVE_NUMBER_IS_SAFE_INTEGER, NATIVE_NUMBER, [ownerLease]);
    const now = currentTimeMilliseconds();
    const currentPidIdentityMatches = ownerPid !== NATIVE_PROCESS_PID
      || ownerProcessStart === undefined
      || ownerProcessStart === NATIVE_PROCESS_START_IDENTITY;
    const ownerAlive = ownerShapeValid && typeof ownerLease === 'number' && ownerLease > now
      && currentPidIdentityMatches
      && processOwnerIsAlive(ownerPid);
    const incompleteIsYoung = !ownerShapeValid
      && now - status.mtimeMs < RUN_LOCK_INCOMPLETE_GRACE_MS;

    if (!ownerAlive && !incompleteIsYoung) {
      const staleDirectory = `${lockDirectory}.stale-${nativeString(NATIVE_PROCESS_PID)}-${nativeString(++lockSequence)}`;
      try {
        await rename(lockDirectory, staleDirectory);
        await syncDirectory(runDirectory);
        await rm(staleDirectory, { recursive: true, force: true });
        await syncDirectory(runDirectory);
        continue;
      } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
    }

    if (currentTimeMilliseconds() - startedAt >= RUN_LOCK_WAIT_MS) throw new RunStoreIntegrityError(
      'Timed out waiting for the active run coordination owner.'
    );
    await delay(RUN_LOCK_POLL_MS);
  }
}

/** @param {string} runDirectory @param {string} targetPath */
async function removeFileDurably(runDirectory, targetPath) {
  await assertNoSymlinkPath(runDirectory, targetPath);
  try {
    await rm(targetPath);
    await syncDirectory(pathDirname(targetPath));
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

/** @param {string} runDirectory @param {string} directory */
async function inspectTree(runDirectory, directory) {
  const pending = [directory];
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    await assertNoSymlinkPath(runDirectory, current);
    let entries;
    try { entries = await readdir(current, { withFileTypes: true }); } catch (error) {
      if (isMissing(error)) continue;
      throw error;
    }
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const target = pathJoin(current, entry.name);
      if (entry.isSymbolicLink()) throw new RunStoreIntegrityError(
        `Controlled run tree contains a symbolic link: ${pathRelative(runDirectory, target)}`
      );
      if (entry.isDirectory()) append(pending, target);
    }
  }
}

/** Validate the real root and every existing compiler-controlled descendant once per advance. */
/** @param {string} runDirectory */
export async function prepareRunStore(runDirectory) {
  const rootStatus = await lstat(runDirectory);
  if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) throw new RunStoreIntegrityError(
    'Run directory must be a real directory rather than a symbolic link.'
  );
  await realpath(runDirectory);
  const canonicalRoot = pathResolve(runDirectory);
  for (let index = 0; index < CONTROLLED_DIRECTORIES.length; index += 1) {
    await inspectTree(canonicalRoot, pathJoin(canonicalRoot, CONTROLLED_DIRECTORIES[index]));
  }
  for (let index = 0; index < CONTROLLED_FILES.length; index += 1) {
    await assertNoSymlinkPath(canonicalRoot, pathJoin(canonicalRoot, CONTROLLED_FILES[index]));
  }
  return canonicalRoot;
}

/** Restore a staging file claimed immediately before a crashed promotion. */
/** @param {string} runDirectory */
export async function recoverStagingClaims(runDirectory) {
  const directory = pathJoin(runDirectory, 'staging');
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  for (const stage of ['source_pack', 'evidence_claims', 'behavior_views', 'case_drafts']) {
    const typedStage = /** @type {keyof typeof STAGE_FILES} */ (stage);
    const fileName = STAGE_FILES[typedStage];
    const prefix = `.${fileName}.claim-`;
    /** @type {string[]} */
    const claims = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (entry.isFile() && entry.name.startsWith(prefix)) append(claims, entry.name);
    }
    NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SORT, claims, []);
    /** @type {string[]} */
    const unresolvedClaims = [];
    for (let index = 0; index < claims.length; index += 1) {
      const claimName = claims[index];
      const claimPath = pathJoin(directory, claimName);
      const claimText = await readText(runDirectory, claimPath);
      let claimValue;
      try {
        claimValue = NATIVE_REFLECT_APPLY(NATIVE_JSON_PARSE, NATIVE_JSON, [claimText]);
      } catch {
        append(unresolvedClaims, claimName);
        continue;
      }
      const claimRevision = claimValue && typeof claimValue === 'object'
        ? claimValue.source_revision : undefined;
      const accepted = NATIVE_REFLECT_APPLY(
        NATIVE_NUMBER_IS_SAFE_INTEGER, NATIVE_NUMBER, [claimRevision]
      ) ? await readJsonIfPresent(
          runDirectory, acceptedPath(runDirectory, claimRevision, typedStage)
        ) : null;
      if (accepted && accepted.digest === digest(claimValue)) {
        await removeFileDurably(runDirectory, claimPath);
      } else append(unresolvedClaims, claimName);
    }
    if (unresolvedClaims.length === 0) continue;
    const canonical = stagingPath(runDirectory, typedStage);
    const firstClaim = pathJoin(directory, unresolvedClaims[0]);
    const firstText = await readText(runDirectory, firstClaim);
    for (let index = 1; index < unresolvedClaims.length; index += 1) {
      if (await readText(runDirectory, pathJoin(directory, unresolvedClaims[index])) !== firstText) {
        throw new RunStoreIntegrityError('Conflicting staging promotion claims require manual revision.');
      }
    }
    const canonicalText = await readTextIfPresent(runDirectory, canonical);
    if (canonicalText !== null && canonicalText !== firstText) throw new RunStoreIntegrityError(
      'Recovered staging claim conflicts with the current staging artifact.'
    );
    if (canonicalText === null) {
      await rename(firstClaim, canonical);
      await syncDirectory(directory);
    } else await removeFileDurably(runDirectory, firstClaim);
    for (let index = 1; index < unresolvedClaims.length; index += 1) {
      await removeFileDurably(runDirectory, pathJoin(directory, unresolvedClaims[index]));
    }
  }
}

/** Remove only abandoned atomic-write files after the no-symlink tree audit. */
/** @param {string} runDirectory */
export async function cleanupTemporaryFiles(runDirectory) {
  const roots = [runDirectory];
  for (let index = 0; index < CONTROLLED_DIRECTORIES.length; index += 1) {
    append(roots, pathJoin(runDirectory, CONTROLLED_DIRECTORIES[index]));
  }
  for (let rootIndex = 0; rootIndex < roots.length; rootIndex += 1) {
    const pending = [roots[rootIndex]];
    for (let cursor = 0; cursor < pending.length; cursor += 1) {
      const directory = pending[cursor];
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
        if (isMissing(error)) continue;
        throw error;
      }
      for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index];
        const target = pathJoin(directory, entry.name);
        if (entry.isSymbolicLink()) throw new RunStoreIntegrityError(
          `Controlled run tree contains a symbolic link: ${pathRelative(runDirectory, target)}`
        );
        if (entry.isDirectory()) append(pending, target);
        else if (entry.isFile() && regexpTest(TEMPORARY_FILE, entry.name)
          && !temporaryOwnerIsAlive(entry.name)) {
          await removeFileDurably(runDirectory, target);
        }
      }
    }
  }
}

/**
 * Atomically replace a file in its destination directory. The file data is
 * synced before rename and the containing directory is synced afterwards.
 * @param {string} runDirectory
 * @param {string} targetPath
 * @param {string} content
 */
export async function atomicWriteText(runDirectory, targetPath, content) {
  const directory = pathDirname(targetPath);
  await ensureDirectory(runDirectory, directory);
  await assertNoSymlinkPath(runDirectory, targetPath);
  temporarySequence += 1;
  const temporaryPath = pathJoin(
    directory, `.${pathBasename(targetPath)}.tmp-${NATIVE_PROCESS_PID}-${temporarySequence}`
  );
  let handle;
  try {
    handle = await open(
      temporaryPath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW,
      0o600
    );
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await assertNoSymlinkPath(runDirectory, targetPath);
    await rename(temporaryPath, targetPath);
    await syncDirectory(directory);
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

/** @param {string} runDirectory @param {string} targetPath @param {unknown} value */
export async function atomicWriteJson(runDirectory, targetPath, value) {
  requireRunStoreIntrinsics();
  await atomicWriteText(runDirectory, targetPath, `${canonicalStringify(value)}\n`);
}

/** @param {string} runDirectory @param {string} filePath */
export async function readText(runDirectory, filePath) {
  await assertNoSymlinkPath(runDirectory, filePath);
  const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const status = await handle.stat();
    if (!status.isFile()) throw new RunStoreIntegrityError(
      `Controlled artifact is not a regular file: ${pathRelative(runDirectory, filePath)}`
    );
    return await handle.readFile('utf8');
  } finally { await handle.close(); }
}

/** @param {string} runDirectory @param {string} filePath */
export async function readTextIfPresent(runDirectory, filePath) {
  try { return await readText(runDirectory, filePath); } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** @param {string} runDirectory @param {string} filePath */
export async function readJson(runDirectory, filePath) {
  const text = await readText(runDirectory, filePath);
  requireRunStoreIntrinsics();
  const value = NATIVE_REFLECT_APPLY(NATIVE_JSON_PARSE, NATIVE_JSON, [text]);
  return { text, value, digest: digest(value) };
}

/** @param {string} runDirectory @param {string} filePath */
export async function readJsonIfPresent(runDirectory, filePath) {
  try { return await readJson(runDirectory, filePath); } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

/** @param {string} runDirectory @param {keyof typeof STAGE_FILES} stage */
export function stagingPath(runDirectory, stage) {
  return pathJoin(runDirectory, 'staging', STAGE_FILES[stage]);
}

/** @param {string} runDirectory @param {number} sourceRevision @param {keyof typeof STAGE_FILES} stage */
export function acceptedPath(runDirectory, sourceRevision, stage) {
  return pathJoin(runDirectory, 'accepted', revisionName(sourceRevision), STAGE_FILES[stage]);
}

/** @param {string} runDirectory @param {number} sourceRevision */
export function obligationsPath(runDirectory, sourceRevision) {
  return pathJoin(runDirectory, 'derived', revisionName(sourceRevision), 'test-obligations.json');
}

/** @param {string} runDirectory @param {number} sourceRevision */
export function clarificationStatePath(runDirectory, sourceRevision) {
  return pathJoin(runDirectory, 'derived', revisionName(sourceRevision), 'clarification-state.json');
}

/** @param {string} runDirectory @param {number} sourceRevision */
export function outputPaths(runDirectory, sourceRevision) {
  const directory = pathJoin(runDirectory, 'output', revisionName(sourceRevision));
  return {
    directory,
    bundle: pathJoin(directory, 'test-bundle.json'),
    markdown: pathJoin(directory, 'test-cases.md'),
    current: pathJoin(runDirectory, 'output', 'current.json')
  };
}

/** @param {string} runDirectory */
export async function acceptedSourceRevisions(runDirectory) {
  let entries;
  const acceptedDirectory = pathJoin(runDirectory, 'accepted');
  try { entries = await readdir(acceptedDirectory, { withFileTypes: true }); } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  /** @type {number[]} */
  const revisions = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (entry.isSymbolicLink()) throw new RunStoreIntegrityError('Accepted revision cannot be a symbolic link.');
    if (!entry.isDirectory()) continue;
    const match = NATIVE_REFLECT_APPLY(NATIVE_REGEXP_EXEC, REVISION_DIRECTORY, [entry.name]);
    if (!match) continue;
    const sourceRevision = Number(match[1]);
    if (!Number.isSafeInteger(sourceRevision) || entry.name !== revisionName(sourceRevision)) {
      throw new RunStoreIntegrityError(`Accepted revision directory is not canonical: ${entry.name}`);
    }
    const source = await readJsonIfPresent(
      runDirectory, acceptedPath(runDirectory, sourceRevision, 'source_pack')
    );
    if (source) append(revisions, sourceRevision);
    else {
      for (const stage of ['evidence_claims', 'behavior_views', 'case_drafts']) {
        if (await readTextIfPresent(
          runDirectory,
          acceptedPath(runDirectory, sourceRevision, /** @type {keyof typeof STAGE_FILES} */ (stage))
        ) !== null) throw new RunStoreIntegrityError(
          `Accepted revision ${entry.name} has downstream artifacts without a Source Pack.`
        );
      }
    }
  }
  NATIVE_REFLECT_APPLY(NATIVE_ARRAY_SORT, revisions, [
    (/** @type {number} */ left, /** @type {number} */ right) => left - right
  ]);
  return revisions;
}

/** @param {string} runDirectory @param {keyof typeof STAGE_FILES} stage @param {{text:string}} snapshot */
export async function discardStagingSnapshot(runDirectory, stage, snapshot) {
  const source = stagingPath(runDirectory, stage);
  const directory = pathDirname(source);
  const claim = pathJoin(directory, `.${pathBasename(source)}.claim-${NATIVE_PROCESS_PID}-${++temporarySequence}`);
  await rename(source, claim);
  await syncDirectory(directory);
  const claimedText = await readText(runDirectory, claim);
  if (claimedText !== snapshot.text) {
    if (await readTextIfPresent(runDirectory, source) === null) await rename(claim, source);
    throw new RunStoreIntegrityError('Staging artifact changed after validation.');
  }
  await removeFileDurably(runDirectory, claim);
}

/**
 * Promote exactly the validated staging snapshot. A concurrent replacement at
 * the canonical staging path is never removed.
 * @param {string} runDirectory
 * @param {number} sourceRevision
 * @param {keyof typeof STAGE_FILES} stage
 * @param {unknown} value
 * @param {{text:string}} snapshot
 */
export async function promoteArtifact(runDirectory, sourceRevision, stage, value, snapshot) {
  const target = acceptedPath(runDirectory, sourceRevision, stage);
  const existing = await readJsonIfPresent(runDirectory, target);
  if (existing) {
    if (existing.digest !== digest(value)) throw new RunStoreIntegrityError(
      'Accepted artifact conflicts with the validated staging snapshot.'
    );
    await discardStagingSnapshot(runDirectory, stage, snapshot);
    return;
  }
  const source = stagingPath(runDirectory, stage);
  const directory = pathDirname(source);
  const claim = pathJoin(directory, `.${pathBasename(source)}.claim-${NATIVE_PROCESS_PID}-${++temporarySequence}`);
  await ensureDirectory(runDirectory, directory);
  await assertNoSymlinkPath(runDirectory, source);
  await rename(source, claim);
  await syncDirectory(directory);
  const claimedText = await readText(runDirectory, claim);
  if (claimedText !== snapshot.text) {
    if (await readTextIfPresent(runDirectory, source) === null) {
      await rename(claim, source);
      await syncDirectory(directory);
    }
    throw new RunStoreIntegrityError('Staging artifact changed after validation.');
  }
  await atomicWriteJson(runDirectory, target, value);
  await removeFileDurably(runDirectory, claim);
}

/** @param {string} runDirectory @param {unknown} checkpoint */
export async function writeCheckpoint(runDirectory, checkpoint) {
  await atomicWriteJson(runDirectory, pathJoin(runDirectory, 'checkpoint.json'), checkpoint);
}

/** @param {string} runDirectory @param {number} sourceRevision @param {unknown} bundle @param {string} markdown */
export async function writeFinalOutput(runDirectory, sourceRevision, bundle, markdown) {
  const paths = outputPaths(runDirectory, sourceRevision);
  await atomicWriteJson(runDirectory, paths.bundle, bundle);
  await atomicWriteText(runDirectory, paths.markdown, markdown);
  return paths;
}
