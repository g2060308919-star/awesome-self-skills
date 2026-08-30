import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemaRegistry } from './schema-registry.mjs';

// Task 11 keeps revision evaluation in src/core.mjs as a pure internal seam.
// Task 12 will make this filesystem shell load a complete revision and invoke
// it with the fixed pause_for_clarification policy; no policy selector is added
// to this sole external interface.

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
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

const emptyRunReply = Object.freeze({
  status: 'need_artifact',
  stage: 'source_pack',
  schema_ref: 'source-pack.schema.json',
  scope: Object.freeze({ source_revision: 0 }),
  diagnostics: Object.freeze([])
});

/**
 * Advance one strict test-case-generation run.
 *
 * @param {string} runDirectory
 */
export async function advanceStrict(runDirectory) {
  try {
    const registry = await loadSchemaRegistry(schemaDirectory, embeddedManifestDigest, embeddedCompilerVersion);
    if (embeddedSchemaVersion && registry.schemaVersion !== embeddedSchemaVersion) return fatalReply('SCHEMA_INTEGRITY_MISMATCH', 'Bundled schema version does not match the compiler.');
  } catch {
    return fatalReply('SCHEMA_INTEGRITY_MISMATCH', 'Bundled schemas or schema manifest failed integrity verification.');
  }

  if (!path.isAbsolute(runDirectory)) {
    return fatalReply('run_directory_absolute', 'Run directory must be an absolute path.');
  }

  try {
    if (!(await stat(runDirectory)).isDirectory()) {
      return fatalReply('run_directory_directory', 'Run directory must be a directory.');
    }

    if ((await readdir(runDirectory)).length === 0) {
      return emptyRunReply;
    }

    return fatalReply('run_directory_empty', 'Run directory is not an empty initial run.');
  } catch (error) {
    return fatalReply('run_directory_unavailable', errorMessage(error));
  }
}

/** @param {string} code @param {string} message */
function fatalReply(code, message) {
  return {
    status: 'fatal',
    diagnostics: [{ category: 'reference', code, message }]
  };
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error ? error.message : 'Run directory is unavailable.';
}
