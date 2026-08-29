import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

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
