import assert from 'node:assert/strict';
import * as nodeUrl from 'node:url';
import * as workerThreads from 'node:worker_threads';

const { runnerPath, runDirectory } = /** @type {any} */ (workerThreads).workerData;
const port = /** @type {any} */ (workerThreads).parentPort;

async function main() {
  assert.ok(typeof runnerPath === 'string' && runnerPath.length > 0);
  assert.ok(typeof runDirectory === 'string' && runDirectory.length > 0);
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
    await import(runnerUrl.href);
  } finally {
    writableStdout.write = originalWrite;
  }
  port.postMessage({ output });
}

await main().catch((error) => {
  process.exitCode = 1;
  port.postMessage({
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  });
});
