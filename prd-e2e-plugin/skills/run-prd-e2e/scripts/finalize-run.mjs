#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { finalizeExecuted, finalizeNoExecution, writeFinalIndex } from "./lib/finalizer.mjs";
import { sha256Text } from "./lib/digest.mjs";
import { requireCondition } from "./lib/errors.mjs";
import {
  readJsonRegular,
  validateFinalizerBindings,
  validateManifestArtifactBindings
} from "./lib/handoff-paths.mjs";
import { loadRun } from "./run.mjs";

async function stdinJson() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  requireCondition(text.trim(), "INPUT_CONTRACT", "Finalizer input JSON is required on stdin.");
  return JSON.parse(text);
}

async function main() {
  const [mode] = process.argv.slice(2);
  const runIndex = process.argv.indexOf("--run");
  requireCondition(["executed", "no-execution"].includes(mode) && runIndex >= 0 && process.argv[runIndex + 1], "INPUT_CONTRACT", "Usage: finalize-run.mjs <executed|no-execution> --run <outer-run>.");
  const loaded = await loadRun(path.resolve(process.argv[runIndex + 1]));
  requireCondition(
    mode === "executed" ? loaded.state.stage === "executing" : loaded.state.stage === "planning_execution",
    "ILLEGAL_TRANSITION",
    "Outer Run is not at the stage required for this finalization mode."
  );
  const payload = await stdinJson();
  validateFinalizerBindings({ state: loaded.state, payload, mode });
  const generationRef = loaded.state.refs.generation;
  const planRef = loaded.state.refs.execution_plan;
  requireCondition(typeof generationRef?.manifest_path === "string" && typeof generationRef?.bundle_path === "string", "RUN_INTEGRITY", "Stored Case Document file references are incomplete.");
  requireCondition(typeof planRef?.manifest_path === "string" && typeof planRef?.artifact_path === "string", "RUN_INTEGRITY", "Stored Execution Plan file references are incomplete.");
  const [caseManifest, caseBundle, planManifest, planArtifact] = await Promise.all([
    readJsonRegular(generationRef.manifest_path, "Case Document manifest", { withinRoot: generationRef.run_root }),
    readJsonRegular(generationRef.bundle_path, "Case Document bundle", { withinRoot: generationRef.run_root }),
    readJsonRegular(planRef.manifest_path, "Execution Plan manifest", { withinRoot: planRef.run_root }),
    readJsonRegular(planRef.artifact_path, "Execution Plan artifact", { withinRoot: planRef.run_root })
  ]);
  validateManifestArtifactBindings({
    generation: generationRef,
    executionPlan: planRef,
    caseManifest: caseManifest.value,
    planManifest: planManifest.value
  });
  let runnerInput;
  if (mode === "executed") {
    const inputRef = loaded.state.refs.runner_input;
    requireCondition(typeof inputRef?.path === "string" && /^sha256:[a-f0-9]{64}$/.test(inputRef.sha256), "RUN_INTEGRITY", "Stored Runner input reference is incomplete.");
    const inputPath = path.isAbsolute(inputRef.path) ? path.resolve(inputRef.path) : path.join(loaded.run_root, inputRef.path);
    const relative = path.relative(loaded.run_root, inputPath);
    requireCondition(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "RUN_INTEGRITY", "Runner input reference escapes the outer Run root.");
    runnerInput = await readJsonRegular(inputPath, "Runner input", { withinRoot: loaded.run_root });
    requireCondition(sha256Text(runnerInput.raw) === inputRef.sha256, "RUN_INTEGRITY", "Runner input digest differs from workflow state.");
  }
  const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const runnerRuntime = path.join(skillRoot, "..", "b2b-e2e-runner", "scripts", "run-artifacts.mjs");
  const { validateRun } = await import(pathToFileURL(runnerRuntime));
  const common = {
    ...payload,
    outerRunId: loaded.state.run_id,
    request: loaded.request,
    generationRef,
    caseDocumentManifest: caseManifest.value,
    caseDocumentManifestBytes: caseManifest.raw,
    caseDocument: caseBundle.value,
    caseDocumentBytes: caseBundle.raw,
    executionPlanRef: planRef,
    executionPlanManifest: planManifest.value,
    executionPlanManifestBytes: planManifest.raw,
    executionPlan: planArtifact.value,
    executionPlanBytes: planArtifact.raw,
    ...(runnerInput ? { runnerInput: runnerInput.value, runnerRunRef: loaded.state.refs.runner_run } : {}),
    runnerRunValidator: runRoot => validateRun(runRoot)
  };
  const result = mode === "executed" ? await finalizeExecuted(common) : finalizeNoExecution(common);
  const written = await writeFinalIndex(loaded.run_root, result);
  process.stdout.write(`${JSON.stringify(written)}\n`);
}

main().catch(error => {
  process.stdout.write(`${JSON.stringify({ error: { code: error?.code ?? "RUN_INTEGRITY", message: error?.message ?? "Finalization failed." } })}\n`);
  process.exitCode = 1;
});
