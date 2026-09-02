import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as fsPromises from 'node:fs/promises';
import path from 'node:path';
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

function invokePackagedEntry() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, runDirectory], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (/** @type {string} */ chunk) => { stdout += chunk; });
    child.stderr.on('data', (/** @type {string} */ chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (/** @type {number|null} */ code) => {
      if (code !== 0) reject(new Error(`packaged CLI exited ${code}: ${stderr}`));
      else if (stderr !== '') reject(new Error(`packaged CLI wrote stderr: ${stderr}`));
      else {
        const lines = stdout.trimEnd().split('\n');
        if (!stdout.endsWith('\n') || lines.length !== 1) {
          reject(new Error(`packaged CLI emitted ${lines.length} reply lines`));
        } else {
          try { resolve(JSON.parse(lines[0])); } catch (error) { reject(error); }
        }
      }
    });
  });
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
  for (const [stageName, fileName] of Object.entries(stageFiles)) {
    const rawBytes = new TextEncoder().encode(stageInputs[stageName]);
    const stagingDirectory = path.join(runDirectory, 'staging');
    const stagingPath = path.join(stagingDirectory, fileName);
    await mkdir(stagingDirectory, { recursive: true });
    await writeFile(stagingPath, rawBytes, { flag: 'wx' });
    const beforeStat = await lstat(stagingPath);
    const reply = await invokePackagedEntry();
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
