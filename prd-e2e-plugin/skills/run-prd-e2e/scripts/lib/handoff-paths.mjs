import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { canonicalStringify } from "./digest.mjs";
import { fail, requireCondition } from "./errors.mjs";

function exactPath(actual, expected, code, label) {
  requireCondition(typeof actual === "string" && path.isAbsolute(actual), code, `${label} must be absolute.`);
  requireCondition(path.resolve(actual) === path.resolve(expected), code, `${label} differs from its authoritative reference.`);
}

function childPath(root, actual, expected, label) {
  requireCondition(typeof root === "string" && path.isAbsolute(root), "HANDOFF_REF_MISMATCH", `${label} child Run root is invalid.`);
  exactPath(actual, expected, "HANDOFF_REF_MISMATCH", label);
  const relative = path.relative(path.resolve(root), path.resolve(actual));
  requireCondition(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "HANDOFF_REF_MISMATCH", `${label} escapes its child Run root.`);
}

function declaredArtifactPath(root, relativePath, label) {
  requireCondition(
    typeof relativePath === "string"
      && relativePath.trim()
      && !path.isAbsolute(relativePath)
      && !relativePath.split(/[\\/]/).includes(".."),
    "HANDOFF_REF_MISMATCH",
    `${label} manifest path is invalid.`
  );
  return path.join(path.resolve(root), ...relativePath.split("/"));
}

export function validateCompileFileBindings({ runRoot, generation, executionPlan, files }) {
  requireCondition(typeof runRoot === "string" && path.isAbsolute(runRoot), "RUN_INTEGRITY", "Outer Run root is invalid.");
  requireCondition(generation && typeof generation === "object" && !Array.isArray(generation), "RUN_INTEGRITY", "Stored generation reference is missing.");
  requireCondition(executionPlan && typeof executionPlan === "object" && !Array.isArray(executionPlan), "RUN_INTEGRITY", "Stored Execution Plan reference is missing.");
  requireCondition(files && typeof files === "object" && !Array.isArray(files), "RUN_INTEGRITY", "Compiler file bindings are missing.");
  exactPath(files.request, path.join(runRoot, "request.json"), "RUN_INTEGRITY", "Request path");
  exactPath(files.generationRef, path.join(runRoot, "generation-ref.json"), "RUN_INTEGRITY", "Generation reference path");
  exactPath(files.executionProfile, path.join(runRoot, "execution-profile.json"), "RUN_INTEGRITY", "Execution Profile path");
  exactPath(generation.manifest_path, path.join(generation.run_root, "output", "current.json"), "HANDOFF_REF_MISMATCH", "Stored Case Document manifest path");
  exactPath(executionPlan.manifest_path, path.join(executionPlan.run_root, "output", "current.json"), "HANDOFF_REF_MISMATCH", "Stored Execution Plan manifest path");
  childPath(generation.run_root, files.caseManifest, generation.manifest_path, "Case Document manifest path");
  childPath(generation.run_root, files.caseBundle, generation.bundle_path, "Case Document bundle path");
  childPath(executionPlan.run_root, files.executionManifest, executionPlan.manifest_path, "Execution Plan manifest path");
  childPath(executionPlan.run_root, files.executionPlan, executionPlan.artifact_path, "Execution Plan artifact path");
  return true;
}

export function validateManifestArtifactBindings({ generation, executionPlan, caseManifest, planManifest }) {
  requireCondition(generation && executionPlan && caseManifest && planManifest, "HANDOFF_REF_MISMATCH", "Generator artifact bindings are incomplete.");
  exactPath(
    generation.bundle_path,
    declaredArtifactPath(generation.run_root, caseManifest.bundle?.path, "Case Document bundle"),
    "HANDOFF_REF_MISMATCH",
    "Stored Case Document bundle path"
  );
  exactPath(
    executionPlan.artifact_path,
    declaredArtifactPath(executionPlan.run_root, planManifest.execution_plan_artifact?.path, "Execution Plan artifact"),
    "HANDOFF_REF_MISMATCH",
    "Stored Execution Plan artifact path"
  );
  requireCondition(
    typeof executionPlan.run_id === "string" && executionPlan.run_id === planManifest.run_id,
    "HANDOFF_REF_MISMATCH",
    "Stored Execution Plan Run identity differs from its manifest."
  );
  return true;
}

export async function readJsonRegular(filePath, label, { withinRoot } = {}) {
  const resolved = path.resolve(filePath);
  if (withinRoot !== undefined) {
    requireCondition(typeof withinRoot === "string" && path.isAbsolute(withinRoot), "RUN_INTEGRITY", `${label} root is invalid.`);
    const rootResolved = path.resolve(withinRoot);
    const rootStat = await lstat(rootResolved).catch(() => fail("RUN_INTEGRITY", `${label} root is missing.`));
    requireCondition(rootStat.isDirectory() && !rootStat.isSymbolicLink(), "RUN_INTEGRITY", `${label} root is unsafe.`);
    const canonicalRoot = await realpath(rootResolved);
    requireCondition(canonicalRoot === rootResolved, "RUN_INTEGRITY", `${label} root must use its canonical path.`);
    const relative = path.relative(rootResolved, resolved);
    requireCondition(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "RUN_INTEGRITY", `${label} escapes its owning Run root.`);
  }
  const stat = await lstat(resolved).catch(() => fail("RUN_INTEGRITY", `${label} is missing.`));
  requireCondition(stat.isFile() && !stat.isSymbolicLink(), "RUN_INTEGRITY", `${label} is not a safe regular file.`);
  requireCondition(await realpath(resolved) === resolved, "RUN_INTEGRITY", `${label} path must be canonical and contain no symlink.`);
  const raw = await readFile(resolved, "utf8");
  try {
    return { value: JSON.parse(raw), raw, path: resolved };
  } catch {
    fail("RUN_INTEGRITY", `${label} is not valid JSON.`);
  }
}

export function validateFinalizerBindings({ state, payload, mode }) {
  requireCondition(state?.refs && payload && typeof payload === "object", "RUN_INTEGRITY", "Finalizer bindings are missing.");
  for (const [stateName, payloadName] of [["generation", "generationRef"], ["execution_plan", "executionPlanRef"]]) {
    requireCondition(
      canonicalStringify(state.refs[stateName]) === canonicalStringify(payload[payloadName]),
      "RUNNER_LINEAGE_MISMATCH",
      `Finalizer ${payloadName} differs from workflow state.`
    );
  }
  if (mode === "executed") {
    requireCondition(
      canonicalStringify(state.refs.runner_run) === canonicalStringify(payload.runnerRunRef),
      "RUNNER_LINEAGE_MISMATCH",
      "Finalizer Runner Run reference differs from workflow state."
    );
  }
  return true;
}
