import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { advanceStrict as advanceStrictInternal } from './advance-strict.mjs';
import { latestV4Contract, v4ContractForIdentity } from './v4-contract.mjs';
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

/** Historical identities are read-only at the public generation boundary.
 * Recompute through a compiler-created successor; never mutate an old pair
 * or dispatch it to an old generator. The core still decodes historical data
 * for immutable verification and migration fixtures.
 * @param {string} runDirectory */
export async function advanceStrict(runDirectory) {
  if (typeof runDirectory === 'string' && path.isAbsolute(runDirectory)) {
    let identity;
    try { identity = JSON.parse(await readFile(path.join(runDirectory, 'run-instance.json'), 'utf8')); }
    catch { /* The core returns its precise missing/corrupt-store diagnostic. */ }
    if (typeof identity?.schema_version === 'string' && identity.schema_version.startsWith('4.')) {
      const contract = v4ContractForIdentity(identity);
      if (!contract) return fatalReply('VERSION_UPGRADE_UNSUPPORTED',
        'The v4 schema/compiler pair is unknown or mismatched; preserve this run for inspection.');
      if (contract !== latestV4Contract()) return fatalReply('VERSION_UPGRADE_REQUIRED',
        "Verify completed delivery read-only, or use createV4RunDirectory(catalogRoot, { parent_run_id, creation_reason: 'version_upgrade' }) to continue with the latest compiler.");
    }
  }
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
