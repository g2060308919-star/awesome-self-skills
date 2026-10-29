import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireRunLock, prepareRunStore, readJsonIfPresent, recoverStagingClaims,
  cleanupTemporaryFiles, runStoreIntrinsicsIntact } from './run-store.mjs';
import { loadSchemaRegistry } from './schema-registry.mjs';
import { validateAgainstSchema } from './schema-validator.mjs';
import { advanceStrictV4Locked } from './advance-v4.mjs';
import { verifyResumeCancelledSiblingV4 } from './run-cancellation-v4.mjs';
import { v4ContractForIdentity } from './v4-contract.mjs';
import { DiagnosticErrorV4 } from './diagnostic-error-v4.mjs';
const moduleDirectory = path.dirname(realpathSync(fileURLToPath(import.meta.url)));
const schemaDirectory = path.resolve(
  moduleDirectory,
  typeof __SCHEMA_DIRECTORY__ === 'string'
    ? __SCHEMA_DIRECTORY__
    : '../skill/generate-test-cases/scripts/schemas'
);
const embeddedManifestDigest = typeof __SCHEMA_MANIFEST_DIGEST__ === 'string'
  ? __SCHEMA_MANIFEST_DIGEST__
  : undefined;
const embeddedSchemaVersion = typeof __SCHEMA_VERSION__ === 'string'
  ? __SCHEMA_VERSION__
  : undefined;
const embeddedCompilerVersion = typeof __COMPILER_VERSION__ === 'string'
  ? __COMPILER_VERSION__
  : undefined;


const NATIVE_ARRAY = Array;
const NATIVE_MAP = Map;
const NATIVE_MAP_GET = Map.prototype.get;
const NATIVE_MAP_SET = Map.prototype.set;
const NATIVE_MAP_DELETE = Map.prototype.delete;
const NATIVE_PROMISE = Promise;
const NATIVE_REFLECT_APPLY = Reflect.apply;
const NATIVE_ARRAY_IS_ARRAY = Array.isArray;
const NATIVE_PATH_IS_ABSOLUTE = path.isAbsolute;
const NATIVE_PATH_RESOLVE = path.resolve;
/** @type {Map<string,Promise<void>>} */
const ACTIVE_RUNS = new NATIVE_MAP();

class CoreIntrinsicMutationError extends Error {}

/** @template T @param {Promise<T>} promise @returns {Promise<T>} */
async function guardedAwait(promise) {
  try {
    return await promise;
  } finally {
    if (!runStoreIntrinsicsIntact()) throw new CoreIntrinsicMutationError();
  }
}

const loadedRegistry = await (async () => {
  try {
    const registry = await loadSchemaRegistry(
      schemaDirectory, embeddedManifestDigest, embeddedCompilerVersion
    );
    return embeddedSchemaVersion && registry.schemaVersion !== embeddedSchemaVersion
      ? null : registry;
  } catch {
    return null;
  }
})();

/** @param {Map<any,any>} map @param {unknown} key */
function mapGet(map, key) {
  return NATIVE_REFLECT_APPLY(NATIVE_MAP_GET, map, [key]);
}

/** @param {Map<any,any>} map @param {unknown} key @param {unknown} value */
function mapSet(map, key, value) {
  NATIVE_REFLECT_APPLY(NATIVE_MAP_SET, map, [key, value]);
}

/** @param {Map<any,any>} map @param {unknown} key */
function mapDelete(map, key) {
  NATIVE_REFLECT_APPLY(NATIVE_MAP_DELETE, map, [key]);
}

/** @param {unknown} value @returns {value is any[]} */
function arrayIsArray(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_ARRAY_IS_ARRAY, NATIVE_ARRAY, [value]);
}

/** @param {string} value */
function pathIsAbsolute(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_IS_ABSOLUTE, path, [value]);
}

/** @param {string} value */
function pathResolve(value) {
  return NATIVE_REFLECT_APPLY(NATIVE_PATH_RESOLVE, path, [value]);
}

/** @param {string} code @param {string} message */
function fatalReply(code, message) {
  return {
    status: 'fatal',
    diagnostics: [{ category: 'reference', code, message }]
  };
}

/**
 * Advance one strict test-case-generation run.
 * @param {string} runDirectory
 */
async function advanceStrictExclusive(runDirectory) {
  if (!runStoreIntrinsicsIntact()) return fatalReply(
    'CORE_INTRINSIC_INVALID',
    'Run-store evaluation requires captured native collection traversal intrinsics.'
  );
  const registry = loadedRegistry;
  if (!registry) {
    return fatalReply(
      'SCHEMA_INTEGRITY_MISMATCH',
      'Bundled schemas or schema manifest failed integrity verification.'
    );
  }
  try {
    if (typeof runDirectory !== 'string' || !pathIsAbsolute(runDirectory)) return fatalReply(
      'run_directory_absolute', 'Run directory must be an absolute path.'
    );
    runDirectory = await guardedAwait(prepareRunStore(runDirectory));
    const releaseRunLock = await acquireRunLock(runDirectory);
    const baseGuardedAwait = guardedAwait;
    {
    /** @template T @param {()=>Promise<T>} operation @returns {Promise<T>} */
    const guardedAwait = async (operation) => {
      return releaseRunLock.guardedAwait(() => baseGuardedAwait(operation()));
    };
    try {
      if (!runStoreIntrinsicsIntact()) throw new CoreIntrinsicMutationError();
      runDirectory = await guardedAwait(() => prepareRunStore(runDirectory));
      const runInstanceSnapshot = await guardedAwait(() => readJsonIfPresent(
        runDirectory, path.join(runDirectory, 'run-instance.json')
      ));
      const runInstanceValue = /** @type {any} */ (runInstanceSnapshot?.value);
      if (!v4ContractForIdentity(runInstanceValue)
        || validateAgainstSchema(runInstanceValue, registry.schemas.get('run-instance.schema.json')).length) {
        return fatalReply('CURRENT_PROTOCOL_REQUIRED', 'Input does not satisfy the current protocol. No candidate was accepted. Preserve this directory for inspection; no conversion is performed.');
      }
      if (runInstanceValue.lineage?.creation_reason === 'resume_cancelled') {
        await guardedAwait(() => verifyResumeCancelledSiblingV4(runDirectory, runInstanceValue));
      }
      await guardedAwait(() => recoverStagingClaims(runDirectory));
      await guardedAwait(() => cleanupTemporaryFiles(runDirectory));
      return await guardedAwait(() => advanceStrictV4Locked(runDirectory, registry,
        { ...runInstanceValue, run_instance_id: runInstanceValue.run_id }, releaseRunLock));
    } finally {
      await baseGuardedAwait(releaseRunLock());
    }
    }
  } catch (error) {
    if (error instanceof CoreIntrinsicMutationError) return fatalReply(
      'CORE_INTRINSIC_INVALID',
      'Run-store evaluation requires captured native collection traversal intrinsics.'
    );
    if (error instanceof DiagnosticErrorV4) return { status: 'fatal', diagnostics: error.diagnostics };
    return fatalReply('RUN_INTEGRITY_ERROR', error instanceof Error ? error.message : 'Run directory is unavailable.');
  }
}

/**
 * Serialize advances for one run. The mandatory first microtask boundary makes
 * the intrinsic check in the exclusive evaluator observe mutations made while
 * the caller holds the returned Promise, before any artifact can be accepted.
 * @param {string} runDirectory
 */
export function advanceStrict(runDirectory) {
  if (!runStoreIntrinsicsIntact()) return new NATIVE_PROMISE((resolve) => resolve(fatalReply(
    'CORE_INTRINSIC_INVALID',
    'Run-store evaluation requires captured native collection traversal intrinsics.'
  )));
  let key;
  try {
    key = typeof runDirectory === 'string' ? pathResolve(runDirectory) : '<invalid-run>';
  } catch {
    return new NATIVE_PROMISE((resolve) => resolve(fatalReply(
      'RUN_INTEGRITY_ERROR', 'Run directory could not be resolved at the outer run boundary.'
    )));
  }
  const previous = mapGet(ACTIVE_RUNS, key);
  /** @type {()=>void} */
  let release = () => {};
  const turn = new NATIVE_PROMISE((resolve) => {
    release = () => { resolve(undefined); };
  });
  mapSet(ACTIVE_RUNS, key, turn);
  return (async () => {
    if (previous) await previous;
    else await new NATIVE_PROMISE((resolve) => resolve(undefined));
    try {
      return await advanceStrictExclusive(runDirectory);
    } finally {
      release();
      if (mapGet(ACTIVE_RUNS, key) === turn) mapDelete(ACTIVE_RUNS, key);
    }
  })();
}
