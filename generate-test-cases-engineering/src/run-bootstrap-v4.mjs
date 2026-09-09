import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { ensureV4RunInstance } from './revision-transaction-v4.mjs';
import { createResumeCancelledSiblingV4 } from './run-cancellation-v4.mjs';

const fsPromises = /** @type {any} */ (await import('node:fs/promises'));
const { lstat, mkdir, realpath } = fsPromises;

/**
 * Create one compiler-identified run below the canonical catalog `runs/`
 * directory. This is a shallow installed-Skill Adapter seam: the runner itself
 * remains `advanceStrict(absoluteRunDirectory)`, while callers never mint a run
 * ID or move a directory after its durable identity has been established.
 * @param {string} submittedCatalogRoot
 * @param {'case_document'|'execution_plan'|{parent_run_id:string,creation_reason:'resume_cancelled'}} request
 * @param {undefined} [unexpected]
 */
export async function createV4RunDirectory(submittedCatalogRoot, request, unexpected) {
  const resumeCancelled = Boolean(request) && typeof request === 'object'
    && !Array.isArray(request)
    && Object.keys(request).length === 2
    && typeof request.parent_run_id === 'string'
    && request.creation_reason === 'resume_cancelled';
  const ordinary = typeof request === 'string'
    && ['case_document', 'execution_plan'].includes(request);
  if (typeof submittedCatalogRoot !== 'string' || !path.isAbsolute(submittedCatalogRoot)
    || (!ordinary && !resumeCancelled) || unexpected !== undefined) {
    throw new TypeError('V4_RUN_BOOTSTRAP_INPUT_INVALID');
  }
  const resumeLineage = resumeCancelled ? {
    parent_run_id: request.parent_run_id,
    creation_reason: /** @type {'resume_cancelled'} */ ('resume_cancelled')
  } : null;
  const rootEntry = await lstat(submittedCatalogRoot);
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
    throw new TypeError('V4_RUN_CATALOG_INVALID');
  }
  const catalogRoot = await realpath(submittedCatalogRoot);
  const runsDirectory = path.join(catalogRoot, 'runs');
  try {
    await mkdir(runsDirectory);
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST')) throw error;
  }
  const runsEntry = await lstat(runsDirectory);
  const canonicalRuns = await realpath(runsDirectory);
  if (runsEntry.isSymbolicLink() || !runsEntry.isDirectory()
    || canonicalRuns !== runsDirectory || path.dirname(canonicalRuns) !== catalogRoot) {
    throw new TypeError('V4_RUNS_DIRECTORY_INVALID');
  }
  const runId = `RUN-${randomUUID()}`;
  const runDirectory = path.join(canonicalRuns, runId);
  if (resumeLineage) {
    const run = await createResumeCancelledSiblingV4(catalogRoot, {
      parent_run_id: resumeLineage.parent_run_id,
      run_id: runId
    });
    return {
      run_id: run.run_id,
      run_directory: runDirectory,
      delivery_intent: run.delivery_intent,
      lineage: structuredClone(run.lineage)
    };
  }
  const deliveryIntent = /** @type {'case_document'|'execution_plan'} */ (request);
  await mkdir(runDirectory);
  const run = await ensureV4RunInstance(runDirectory, {
    run_id: runId, delivery_intent: deliveryIntent
  });
  return {
    run_id: run.run_id,
    run_directory: runDirectory,
    delivery_intent: run.delivery_intent
  };
}
