import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { advanceV5Run, createV5RunDirectory, inspectV5Run } from './v5/runtime.mjs';

export { advanceV5Run, createV5RunDirectory, inspectV5Run };

/** @param {string} code @param {string} message */
function fatalReply(code, message) {
  return {
    reply_kind: 'pre_run_error', schema_version: '5.0.0', compiler_version: '0.6.0',
    status: code === 'RUN_ARGUMENT_INVALID' ? 'protocol_error' : 'fatal',
    diagnostics: [{ code, affected_refs: [], message }], available_actions: []
  };
}

async function main() {
  try {
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
    const userArguments = process.argv.slice(2);
    const reply = userArguments.length !== 1 || !path.isAbsolute(userArguments[0])
      ? fatalReply(
          'RUN_ARGUMENT_INVALID',
          'The V5 runner accepts exactly one absolute run directory argument.'
        )
      : nodeMajor >= 20
      ? await inspectV5Run(userArguments[0])
      : fatalReply('RUN_ARGUMENT_INVALID', 'Node.js 20 or newer is required.');
    process.stdout.write(`${JSON.stringify(reply)}\n`);
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : 'private runner failed to form a JSON reply';
    process.stderr.write(`generate-test-cases v5 process failure: ${message}\n`);
  }
}

let directExecution = false;
try {
  directExecution = typeof process.argv[1] === 'string'
    && pathToFileURL(realpathSync(process.argv[1])).href
      === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
} catch {
  directExecution = false;
}
if (directExecution) await main();
