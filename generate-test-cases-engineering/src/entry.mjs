import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { advanceStrict } from './advance-strict.mjs';

export { advanceStrict };

/** @param {string} code @param {string} message */
function fatalReply(code, message) {
  return {
    status: 'fatal',
    diagnostics: [{ category: 'reference', code, message }]
  };
}

async function main() {
  try {
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
    const compilerVersion = typeof __COMPILER_VERSION__ === 'string' ? __COMPILER_VERSION__ : '0.3.0';
    const userArguments = process.argv.slice(2);
    const reply = userArguments.length !== 1
      ? fatalReply(
          'RUNNER_ARGUMENTS_INVALID',
          'The private runner accepts exactly one absolute run directory argument.'
        )
      : nodeMajor >= 20
      ? compilerVersion.length > 0
        ? await advanceStrict(userArguments[0])
        : {
            status: 'fatal',
            diagnostics: [{
              category: 'reference',
              code: 'compiler_version_missing',
              message: 'The bundled compiler version is missing.'
            }]
          }
      : {
          status: 'fatal',
          diagnostics: [{
            category: 'reference',
            code: 'runtime_node20_required',
            message: 'Node.js 20 or newer is required.'
          }]
        };
    process.stdout.write(`${JSON.stringify(reply)}\n`);
  } catch (error) {
    process.exitCode = 1;
    const message = error instanceof Error ? error.message : 'private runner failed to form a JSON reply';
    process.stderr.write(`test-compiler process failure: ${message}\n`);
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
