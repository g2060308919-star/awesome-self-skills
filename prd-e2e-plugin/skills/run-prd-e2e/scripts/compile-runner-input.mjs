#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { compileAndWriteRunnerInput } from "./lib/compiler.mjs";
import { canonicalStringify } from "./lib/digest.mjs";
import { fail, requireCondition } from "./lib/errors.mjs";
import {
  readJsonRegular,
  validateCompileFileBindings,
  validateManifestArtifactBindings
} from "./lib/handoff-paths.mjs";
import { loadRun } from "./run.mjs";

function flags(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    requireCondition(argv[index]?.startsWith("--") && argv[index + 1] !== undefined, "INPUT_CONTRACT", "Arguments must use --name value pairs.");
    result[argv[index].slice(2)] = argv[index + 1];
  }
  return result;
}

async function main() {
  const input = flags(process.argv.slice(2));
  const required = ["run", "request", "generation-ref", "case-manifest", "case-bundle", "execution-manifest", "execution-plan", "execution-profile"];
  requireCondition(required.every(name => input[name]), "INPUT_CONTRACT", `Required flags: ${required.join(", ")}.`);
  const loaded = await loadRun(path.resolve(input.run));
  requireCondition(loaded.state.stage === "compiling_runner_input", "ILLEGAL_TRANSITION", "Outer Run is not ready to compile Runner input.");
  const files = {
    request: input.request,
    generationRef: input["generation-ref"],
    executionProfile: input["execution-profile"],
    caseManifest: input["case-manifest"],
    caseBundle: input["case-bundle"],
    executionManifest: input["execution-manifest"],
    executionPlan: input["execution-plan"]
  };
  validateCompileFileBindings({
    runRoot: loaded.run_root,
    generation: loaded.state.refs.generation,
    executionPlan: loaded.state.refs.execution_plan,
    files
  });
  const [request, generationRef, caseManifest, caseBundle, executionManifest, executionPlan, executionProfile] = await Promise.all([
    readJsonRegular(input.request, "Request", { withinRoot: loaded.run_root }),
    readJsonRegular(input["generation-ref"], "Generation reference", { withinRoot: loaded.run_root }),
    readJsonRegular(input["case-manifest"], "Case Document manifest", { withinRoot: loaded.state.refs.generation.run_root }),
    readJsonRegular(input["case-bundle"], "Case Document bundle", { withinRoot: loaded.state.refs.generation.run_root }),
    readJsonRegular(input["execution-manifest"], "Execution Plan manifest", { withinRoot: loaded.state.refs.execution_plan.run_root }),
    readJsonRegular(input["execution-plan"], "Execution Plan artifact", { withinRoot: loaded.state.refs.execution_plan.run_root }),
    readJsonRegular(input["execution-profile"], "Execution Profile", { withinRoot: loaded.run_root })
  ]);
  requireCondition(canonicalStringify(request.value) === canonicalStringify(loaded.request), "RUN_INTEGRITY", "Request file differs from the loaded outer Run request.");
  requireCondition(canonicalStringify(generationRef.value) === canonicalStringify(loaded.state.refs.generation), "RUN_INTEGRITY", "Generation reference differs from workflow state.");
  validateManifestArtifactBindings({
    generation: loaded.state.refs.generation,
    executionPlan: loaded.state.refs.execution_plan,
    caseManifest: caseManifest.value,
    planManifest: executionManifest.value
  });
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const runnerContracts = path.join(skillRoot, "..", "b2b-e2e-runner", "scripts", "lib", "contracts.mjs");
  const { validateTestCases } = await import(pathToFileURL(runnerContracts));
  const result = await compileAndWriteRunnerInput({
    runRoot: loaded.run_root,
    request: request.value,
    generationRef: generationRef.value,
    caseDocumentManifest: caseManifest.value,
    caseDocumentManifestBytes: caseManifest.raw,
    caseDocument: caseBundle.value,
    caseDocumentBytes: caseBundle.raw,
    executionPlanManifest: executionManifest.value,
    executionPlanManifestBytes: executionManifest.raw,
    executionPlan: executionPlan.value,
    executionPlanBytes: executionPlan.raw,
    executionProfile: executionProfile.value,
    runnerValidator: validateTestCases
  });
  process.stdout.write(`${JSON.stringify({ path: result.path, sha256: result.sha256, case_ids: result.value.cases.map(item => item.case_id) })}\n`);
}

main().catch(error => {
  const code = error?.code ?? "RUN_INTEGRITY";
  process.stdout.write(`${JSON.stringify({ error: { code, message: error?.message ?? "Compilation failed." } })}\n`);
  process.exitCode = 1;
});
