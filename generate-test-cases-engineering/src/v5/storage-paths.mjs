import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';

import { V5ProtocolError } from './errors.mjs';

const RUN_ID_PATTERN = /^RUN-[A-Za-z0-9][A-Za-z0-9-]{0,127}$/u;

/** @param {string} relativePath */
export function validateV5RelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\\') || relativePath.includes('\0') || path.posix.isAbsolute(relativePath)) {
    throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Storage path must be a relative POSIX path.');
  }
  const segments = relativePath.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'Storage path contains a forbidden segment.');
  return relativePath;
}

/** @param {string} submittedPath @param {string} label */
async function verifiedDirectory(submittedPath, label) {
  if (typeof submittedPath !== 'string' || !path.isAbsolute(submittedPath)) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', `${label} must be absolute.`);
  let entry;
  try { entry = await lstat(submittedPath); } catch { throw new V5ProtocolError('RUN_ARGUMENT_INVALID', `${label} does not exist.`); }
  if (entry.isSymbolicLink() || !entry.isDirectory()) throw new V5ProtocolError('RUN_ARGUMENT_INVALID', `${label} must be a real directory.`);
  const canonical = await realpath(submittedPath);
  return canonical;
}

/** @param {string} catalogRoot */
export async function resolveCatalogLayout(catalogRoot) {
  const root = await verifiedDirectory(catalogRoot, 'catalogRoot');
  return {
    root,
    catalogDirectory: path.join(root, 'catalog'),
    currentPointer: path.join(root, 'catalog', 'current-transaction.json'),
    catalogTransactions: path.join(root, 'catalog', 'objects', 'transactions'),
    catalogRunGenesisRecords: path.join(root, 'catalog', 'objects', 'run-genesis-records'),
    catalogReplies: path.join(root, 'catalog', 'objects', 'replies'),
    runsDirectory: path.join(root, 'runs')
  };
}

/** @param {string} runDirectory */
export async function resolveRunLayout(runDirectory) {
  const root = await verifiedDirectory(runDirectory, 'runDirectory');
  const runId = path.basename(root);
  if (!RUN_ID_PATTERN.test(runId) || path.basename(path.dirname(root)) !== 'runs') throw new V5ProtocolError('RUN_ARGUMENT_INVALID', 'runDirectory is not a canonical V5 run path.');
  const objects = path.join(root, 'objects');
  return {
    root,
    runId,
    identity: path.join(root, 'identity.json'),
    currentPointer: path.join(root, 'current-transaction.json'),
    lockDirectory: path.join(root, '.v5-run.lock'),
    transactions: path.join(objects, 'transactions'),
    receipts: path.join(objects, 'receipts'),
    idempotencyIndexes: path.join(objects, 'idempotency-indexes'),
    replies: path.join(objects, 'replies'),
    checkpoints: path.join(objects, 'checkpoints'),
    selectorSidecars: path.join(objects, 'selector-sidecars'),
    genesisRecords: path.join(objects, 'run-genesis-records'),
    acceptedArtifacts: path.join(objects, 'accepted-artifacts'),
    compilerState: path.join(objects, 'compiler-state'),
    renderedOutputs: path.join(objects, 'rendered-outputs'),
    events: path.join(objects, 'events'),
    incidents: path.join(objects, 'incidents'),
    rawSourceBytes: path.join(objects, 'raw-source-bytes'),
    staging: path.join(root, '.staging')
  };
}

/** @param {string} digestValue @param {'.json'|'.bin'} extension */
export function digestFilename(digestValue, extension = '.json') {
  if (!/^sha256:[0-9a-f]{64}$/u.test(digestValue)) throw new V5ProtocolError('ACCEPTED_STATE_INTEGRITY_FAILURE', 'Object digest is malformed.');
  return `${digestValue.slice(7)}${extension}`;
}
