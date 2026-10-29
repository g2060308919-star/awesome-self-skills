export { prepareStageArtifact } from './stage-artifact-adapter.mjs';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { advanceStrict as advanceStrictInternal } from './advance-strict.mjs';
import {
  constructIndependentReviewCompletionV4, constructV4Action
} from './agent-action-adapter-v4.mjs';
import {
  sourceAcquisitionMaterialPathV4, stageV4SourceAcquisitionAction
} from './source-acquisition-v4.mjs';
import { createV4RunDirectory } from './run-bootstrap-v4.mjs';
import { stageV4PrdCollectionObservation } from './prd-source-collection-v4.mjs';
import { discoverV4Topology, constructV4TopologyEvidence } from './topology-adapter-v4.mjs';
import { prepareV4Source, validateV4SourcePackBeforeStaging } from './source-preparation-v4.mjs';
import { verifyCaseDocumentDeliveryV4, verifyExecutionPlanDeliveryV4 } from './canonical-delivery-v4.mjs';

export {
  constructIndependentReviewCompletionV4, constructV4Action,
  constructV4TopologyEvidence,
  createV4RunDirectory, sourceAcquisitionMaterialPathV4,
  stageV4SourceAcquisitionAction, stageV4PrdCollectionObservation,
  discoverV4Topology, prepareV4Source, validateV4SourcePackBeforeStaging,
  verifyCaseDocumentDeliveryV4, verifyExecutionPlanDeliveryV4
};

/** @param {string} code @param {string} message */
function fatalReply(code, message) {
  return {
    status: 'fatal',
    diagnostics: [{ category: 'reference', code, message }]
  };
}

/** The public boundary accepts the one current protocol. Historical runs stay untouched.
 * @param {string} runDirectory */
export async function advanceStrict(runDirectory) {
  return advanceStrictInternal(runDirectory);
}

async function main() {
  try {
    const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10);
    const compilerVersion = typeof __COMPILER_VERSION__ === 'string' ? __COMPILER_VERSION__ : '0.8.3';
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
