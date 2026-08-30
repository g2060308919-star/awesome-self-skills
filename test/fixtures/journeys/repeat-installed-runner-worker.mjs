import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
import * as nodeUrl from 'node:url';
import * as workerThreads from 'node:worker_threads';

const { runnerPath, runDirectory, stageFiles, stageInputs, runIndex } = /** @type {any} */ (
  workerThreads
).workerData;
const port = /** @type {any} */ (workerThreads).parentPort;
const lstat = /** @type {any} */ (fsPromises).lstat;

/** @param {Uint8Array} bytes */
function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** @param {any} stat */
function fileIdentity(stat) {
  return `${String(stat.dev)}:${String(stat.ino)}`;
}

/** @param {Uint8Array} left @param {Uint8Array} right */
function rawBytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

/** @param {number} stageIndex */
async function invokePackagedEntry(stageIndex) {
  process.argv = [process.execPath, runnerPath, runDirectory];
  let output = '';
  const writableStdout = /** @type {any} */ (process.stdout);
  const originalWrite = writableStdout.write;
  writableStdout.write = (/** @type {string|Uint8Array} */ chunk) => {
    output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
    return true;
  };
  try {
    const runnerUrl = /** @type {any} */ (nodeUrl).pathToFileURL(runnerPath);
    runnerUrl.searchParams.set('task14_run', `${runIndex}-${stageIndex}`);
    await import(runnerUrl.href);
  } finally {
    writableStdout.write = originalWrite;
  }
  const lines = output.trimEnd().split('\n');
  assert.equal(lines.length, 1, `installed runner emitted ${lines.length} lines`);
  return JSON.parse(lines[0]);
}

async function main() {
  assert.ok(typeof runnerPath === 'string' && runnerPath.length > 0);
  assert.ok(typeof runDirectory === 'string' && runDirectory.length > 0);
  assert.ok(Number.isSafeInteger(runIndex) && runIndex >= 0);
  const replySequence = [];
  /** @type {Record<string, any>} */
  const inputs = {};
  /** @type {Record<string, any>} */
  const inputSnapshots = {};
  /** @type {any} */
  let finalReply = null;
  let stageIndex = 0;
  for (const [stageName, fileName] of Object.entries(stageFiles)) {
    const rawBytes = new TextEncoder().encode(stageInputs[stageName]);
    const stagingDirectory = path.join(runDirectory, 'staging');
    const stagingPath = path.join(stagingDirectory, fileName);
    await mkdir(stagingDirectory, { recursive: true });
    await writeFile(stagingPath, rawBytes, { flag: 'wx' });
    const beforeStat = await lstat(stagingPath);
    const reply = await invokePackagedEntry(stageIndex);
    finalReply = reply;
    replySequence.push(`${reply.status}/${reply.stage ?? 'done'}`);
    inputs[stageName] = {
      isRegularFile: beforeStat.isFile(),
      isSymbolicLink: beforeStat.isSymbolicLink(),
      beforeFileIdentity: fileIdentity(beforeStat),
      beforeByteLength: rawBytes.byteLength,
      beforeDigest: sha256Hex(rawBytes)
    };
    inputSnapshots[stageName] = {
      rawBytes,
      acceptedPath: path.join(runDirectory, 'accepted/r000', fileName)
    };
    stageIndex += 1;
  }
  assert.equal(finalReply?.status, 'finished', JSON.stringify(finalReply));
  for (const [stageName, snapshot] of Object.entries(inputSnapshots)) {
    const afterBytes = await readFile(snapshot.acceptedPath);
    const afterStat = await lstat(snapshot.acceptedPath);
    Object.assign(inputs[stageName], {
      observedAfterFinished: true,
      afterIsRegularFile: afterStat.isFile(),
      afterIsSymbolicLink: afterStat.isSymbolicLink(),
      afterFileIdentity: fileIdentity(afterStat),
      rawBytesEqual: rawBytesEqual(snapshot.rawBytes, afterBytes),
      afterByteLength: afterBytes.byteLength,
      afterDigest: sha256Hex(afterBytes)
    });
  }
  port.postMessage({
    replySequence,
    inputs,
    bundlePath: finalReply.bundle_path,
    markdownPath: finalReply.markdown_path
  });
}

await main().catch((error) => {
  process.exitCode = 1;
  port.postMessage({
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  });
});
