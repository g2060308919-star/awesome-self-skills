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
let temporarySequence = 0;

const NATIVE_ARRAY = Array;
const NATIVE_ARRAY_PROTOTYPE = Array.prototype;
const NATIVE_ARRAY_SORT = Array.prototype.sort;
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
/** @type {ReadonlyArray<readonly [string|symbol,unknown]>} */
const NATIVE_JSON_INTRINSICS = Object.freeze([
  ['parse', JSON.parse], ['stringify', JSON.stringify]
]);
const NATIVE_STRUCTURED_CLONE = structuredClone;
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

/** @param {string} fileName */
function temporaryOwnerIsAlive(fileName) {
  const match = NATIVE_REFLECT_APPLY(NATIVE_REGEXP_EXEC, TEMPORARY_FILE, [fileName]);
  if (!match) return false;
  const ownerPid = Number(match[1]);
  if (ownerPid === process.pid) return true;
  try {
    process.kill(ownerPid, 0);
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
    && descriptorsMatch(NATIVE_MAP_PROTOTYPE, NATIVE_MAP_INTRINSICS)
    && descriptorsMatch(NATIVE_SET_PROTOTYPE, NATIVE_SET_INTRINSICS)
    && descriptorsMatch(NATIVE_STRING_PROTOTYPE, NATIVE_STRING_INTRINSICS)
    && descriptorsMatch(NATIVE_REGEXP_PROTOTYPE, NATIVE_REGEXP_INTRINSICS)
    && descriptorsMatch(NATIVE_OBJECT, NATIVE_OBJECT_INTRINSICS)
    && descriptorsMatch(NATIVE_NUMBER, NATIVE_NUMBER_INTRINSICS)
    && descriptorsMatch(NATIVE_JSON, NATIVE_JSON_INTRINSICS)
    && getterMatches(NATIVE_MAP_PROTOTYPE, 'size', NATIVE_MAP_SIZE_GET)
    && getterMatches(NATIVE_SET_PROTOTYPE, 'size', NATIVE_SET_SIZE_GET);
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
  const relative = path.relative(runDirectory, targetPath);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) {
    throw new RunStoreIntegrityError('Controlled run path escaped the canonical run root.');
  }
  return relative;
}

/** @param {string} runDirectory @param {string} targetPath */
async function assertNoSymlinkPath(runDirectory, targetPath) {
  const relative = relativeControlledPath(runDirectory, targetPath);
  const parts = relative.split(path.sep);
  let current = runDirectory;
  let lastExisting = runDirectory;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
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
  const realRelative = path.relative(realRoot, realExisting);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`)
    || path.isAbsolute(realRelative)) {
    throw new RunStoreIntegrityError('Controlled run path resolved outside the real run root.');
  }
}

/** @param {string} runDirectory @param {string} directory */
async function ensureDirectory(runDirectory, directory) {
  if (path.resolve(directory) === path.resolve(runDirectory)) {
    const status = await lstat(runDirectory);
    if (status.isSymbolicLink() || !status.isDirectory()) throw new RunStoreIntegrityError(
      'Run root is not a real directory.'
    );
    return;
  }
  const relative = relativeControlledPath(runDirectory, directory);
  const parts = relative.split(path.sep);
  let current = runDirectory;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
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

/** @param {string} runDirectory @param {string} targetPath */
async function removeFileDurably(runDirectory, targetPath) {
  await assertNoSymlinkPath(runDirectory, targetPath);
  try {
    await rm(targetPath);
    await syncDirectory(path.dirname(targetPath));
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
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new RunStoreIntegrityError(
        `Controlled run tree contains a symbolic link: ${path.relative(runDirectory, target)}`
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
  const canonicalRoot = path.resolve(runDirectory);
  for (let index = 0; index < CONTROLLED_DIRECTORIES.length; index += 1) {
    await inspectTree(canonicalRoot, path.join(canonicalRoot, CONTROLLED_DIRECTORIES[index]));
  }
  for (let index = 0; index < CONTROLLED_FILES.length; index += 1) {
    await assertNoSymlinkPath(canonicalRoot, path.join(canonicalRoot, CONTROLLED_FILES[index]));
  }
  return canonicalRoot;
}

/** Restore a staging file claimed immediately before a crashed promotion. */
/** @param {string} runDirectory */
export async function recoverStagingClaims(runDirectory) {
  const directory = path.join(runDirectory, 'staging');
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
      const claimPath = path.join(directory, claimName);
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
    const firstClaim = path.join(directory, unresolvedClaims[0]);
    const firstText = await readText(runDirectory, firstClaim);
    for (let index = 1; index < unresolvedClaims.length; index += 1) {
      if (await readText(runDirectory, path.join(directory, unresolvedClaims[index])) !== firstText) {
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
      await removeFileDurably(runDirectory, path.join(directory, unresolvedClaims[index]));
    }
  }
}

/** Remove only abandoned atomic-write files after the no-symlink tree audit. */
/** @param {string} runDirectory */
export async function cleanupTemporaryFiles(runDirectory) {
  const roots = [runDirectory];
  for (let index = 0; index < CONTROLLED_DIRECTORIES.length; index += 1) {
    append(roots, path.join(runDirectory, CONTROLLED_DIRECTORIES[index]));
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
        const target = path.join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new RunStoreIntegrityError(
          `Controlled run tree contains a symbolic link: ${path.relative(runDirectory, target)}`
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
  const directory = path.dirname(targetPath);
  await ensureDirectory(runDirectory, directory);
  await assertNoSymlinkPath(runDirectory, targetPath);
  temporarySequence += 1;
  const temporaryPath = path.join(
    directory, `.${path.basename(targetPath)}.tmp-${process.pid}-${temporarySequence}`
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
  await atomicWriteText(runDirectory, targetPath, `${canonicalStringify(value)}\n`);
}

/** @param {string} runDirectory @param {string} filePath */
export async function readText(runDirectory, filePath) {
  await assertNoSymlinkPath(runDirectory, filePath);
  const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const status = await handle.stat();
    if (!status.isFile()) throw new RunStoreIntegrityError(
      `Controlled artifact is not a regular file: ${path.relative(runDirectory, filePath)}`
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
  const value = JSON.parse(text);
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
  return path.join(runDirectory, 'staging', STAGE_FILES[stage]);
}

/** @param {string} runDirectory @param {number} sourceRevision @param {keyof typeof STAGE_FILES} stage */
export function acceptedPath(runDirectory, sourceRevision, stage) {
  return path.join(runDirectory, 'accepted', revisionName(sourceRevision), STAGE_FILES[stage]);
}

/** @param {string} runDirectory @param {number} sourceRevision */
export function obligationsPath(runDirectory, sourceRevision) {
  return path.join(runDirectory, 'derived', revisionName(sourceRevision), 'test-obligations.json');
}

/** @param {string} runDirectory @param {number} sourceRevision */
export function clarificationStatePath(runDirectory, sourceRevision) {
  return path.join(runDirectory, 'derived', revisionName(sourceRevision), 'clarification-state.json');
}

/** @param {string} runDirectory @param {number} sourceRevision */
export function outputPaths(runDirectory, sourceRevision) {
  const directory = path.join(runDirectory, 'output', revisionName(sourceRevision));
  return {
    directory,
    bundle: path.join(directory, 'test-bundle.json'),
    markdown: path.join(directory, 'test-cases.md'),
    current: path.join(runDirectory, 'output', 'current.json')
  };
}

/** @param {string} runDirectory */
export async function acceptedSourceRevisions(runDirectory) {
  let entries;
  const acceptedDirectory = path.join(runDirectory, 'accepted');
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
  const directory = path.dirname(source);
  const claim = path.join(directory, `.${path.basename(source)}.claim-${process.pid}-${++temporarySequence}`);
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
  const directory = path.dirname(source);
  const claim = path.join(directory, `.${path.basename(source)}.claim-${process.pid}-${++temporarySequence}`);
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
  await atomicWriteJson(runDirectory, path.join(runDirectory, 'checkpoint.json'), checkpoint);
}

/** @param {string} runDirectory @param {number} sourceRevision @param {unknown} bundle @param {string} markdown */
export async function writeFinalOutput(runDirectory, sourceRevision, bundle, markdown) {
  const paths = outputPaths(runDirectory, sourceRevision);
  await atomicWriteJson(runDirectory, paths.bundle, bundle);
  await atomicWriteText(runDirectory, paths.markdown, markdown);
  return paths;
}
