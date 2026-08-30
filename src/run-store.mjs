import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { canonicalStringify, digest } from './canonical.mjs';

export const STAGE_FILES = Object.freeze({
  source_pack: 'source-pack.json',
  evidence_claims: 'evidence-claims.json',
  behavior_views: 'behavior-views.json',
  case_drafts: 'case-drafts.json'
});

const REVISION_DIRECTORY = /^r([0-9]+)$/u;
let temporarySequence = 0;
const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const openFile = fsPromises.open;
const renameFile = fsPromises.rename;

/** @param {number} sourceRevision */
export function revisionName(sourceRevision) {
  return `r${String(sourceRevision).padStart(3, '0')}`;
}

/** @param {unknown} error */
export function isMissing(error) {
  return Boolean(error && typeof error === 'object' && 'code' in error
    && /** @type {{code?:unknown}} */ (error).code === 'ENOENT');
}

/**
 * Atomically replace a file in its destination directory. The file data is
 * synced before rename and the containing directory is synced afterwards.
 * @param {string} targetPath
 * @param {string} content
 */
export async function atomicWriteText(targetPath, content) {
  const directory = path.dirname(targetPath);
  await mkdir(directory, { recursive: true });
  temporarySequence += 1;
  const temporaryPath = path.join(
    directory, `.${path.basename(targetPath)}.tmp-${process.pid}-${temporarySequence}`
  );
  let handle;
  try {
    handle = await openFile(temporaryPath, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await renameFile(temporaryPath, targetPath);
    const directoryHandle = await openFile(directory, 'r');
    try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
  } catch (error) {
    if (handle) await handle.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

/** @param {string} targetPath @param {unknown} value */
export async function atomicWriteJson(targetPath, value) {
  await atomicWriteText(targetPath, `${canonicalStringify(value)}\n`);
}

/** @param {string} filePath */
export async function readJson(filePath) {
  const text = await readFile(filePath, 'utf8');
  const value = JSON.parse(text);
  return { text, value, digest: digest(value) };
}

/** @param {string} filePath */
export async function readJsonIfPresent(filePath) {
  try { return await readJson(filePath); } catch (error) {
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
  try { entries = await readdir(path.join(runDirectory, 'accepted'), { withFileTypes: true }); } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const revisions = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const match = entry.isDirectory() ? REVISION_DIRECTORY.exec(entry.name) : null;
    if (!match) continue;
    const sourceRevision = Number(match[1]);
    if (!Number.isSafeInteger(sourceRevision) || entry.name !== revisionName(sourceRevision)) continue;
    if (await readJsonIfPresent(acceptedPath(runDirectory, sourceRevision, 'source_pack'))) {
      revisions.push(sourceRevision);
    }
  }
  revisions.sort((left, right) => left - right);
  return revisions;
}

/**
 * Promote a validated artifact without trusting the staging file's durability.
 * @param {string} runDirectory
 * @param {number} sourceRevision
 * @param {keyof typeof STAGE_FILES} stage
 * @param {unknown} value
 */
export async function promoteArtifact(runDirectory, sourceRevision, stage, value) {
  await atomicWriteJson(acceptedPath(runDirectory, sourceRevision, stage), value);
  try { await rm(stagingPath(runDirectory, stage)); } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

/** @param {string} runDirectory @param {unknown} checkpoint */
export async function writeCheckpoint(runDirectory, checkpoint) {
  await atomicWriteJson(path.join(runDirectory, 'checkpoint.json'), checkpoint);
}

/** @param {string} runDirectory @param {number} sourceRevision @param {unknown} bundle @param {string} markdown */
export async function writeFinalOutput(runDirectory, sourceRevision, bundle, markdown) {
  const paths = outputPaths(runDirectory, sourceRevision);
  await atomicWriteJson(paths.bundle, bundle);
  await atomicWriteText(paths.markdown, markdown);
  return paths;
}
