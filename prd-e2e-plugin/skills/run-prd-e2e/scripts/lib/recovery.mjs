import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

import { canonicalStringify } from "./digest.mjs";
import { fail, requireCondition } from "./errors.mjs";

function childAction(state, refName, skill) {
  const ref = state.refs?.[refName];
  requireCondition(ref && typeof ref.run_root === "string" && ref.run_root, "RUN_INTEGRITY", `Stored ${refName} Run reference is missing.`);
  return { skill, action: "invoke_compiler", run_root: ref.run_root, outer_run_id: state.run_id };
}

function runnerAction(state, action) {
  const ref = state.refs?.runner_run;
  requireCondition(ref && typeof ref.run_id === "string" && typeof ref.run_root === "string", "RUN_INTEGRITY", "Stored Runner Run reference is missing.");
  return {
    skill: "b2b-e2e-runner",
    action,
    run_root: ref.run_root,
    outer_run_id: state.run_id,
    runner_run_id: ref.run_id
  };
}

export function nextRecoveryAction(state) {
  requireCondition(state && state.schema_version === "1.0" && typeof state.stage === "string", "RUN_INTEGRITY", "Workflow state is invalid.");
  if (state.stage === "intake") {
    return {
      skill: "generate-test-cases",
      action: "start_new_run",
      delivery_intent: "case_document",
      outer_run_id: state.run_id
    };
  }
  if (["generating_cases", "awaiting_semantic_input"].includes(state.stage)) {
    return childAction(state, "generation", "generate-test-cases");
  }
  if (state.stage === "cases_ready") {
    return {
      skill: "generate-test-cases",
      action: "start_new_run",
      delivery_intent: "execution_plan",
      outer_run_id: state.run_id
    };
  }
  if (["planning_execution", "awaiting_execution_confirmation"].includes(state.stage)) {
    return childAction(state, "execution_plan", "generate-test-cases");
  }
  if (state.stage === "runner_preflight") {
    return state.refs?.runner_run
      ? runnerAction(state, "resume-check")
      : { skill: "b2b-e2e-runner", action: "preflight", outer_run_id: state.run_id, runner_run_id: null };
  }
  if (state.stage === "awaiting_execution_resource") {
    return {
      skill: null,
      action: "await_user_input",
      minimum_missing_input: state.minimum_missing_input,
      outer_run_id: state.run_id,
      runner_run_id: state.refs?.runner_run?.run_id ?? null
    };
  }
  if (state.stage === "executing") return runnerAction(state, "continue_same_run");
  const localActions = {
    compiling_runner_input: "compile_runner_input",
    completed: null,
    blocked: null,
    cancelled: null
  };
  if (Object.hasOwn(localActions, state.stage)) {
    return { skill: null, action: localActions[state.stage], outer_run_id: state.run_id };
  }
  fail("RUN_INTEGRITY", `Unknown workflow stage ${state.stage}.`);
}

export function assertResumeBindings({ expected, current }) {
  const fields = ["request_sha256", "material_scope_sha256", "case_document_ref", "expected_text_sha256", "pass_standard"];
  requireCondition(expected && current && typeof expected === "object" && typeof current === "object", "RUN_INTEGRITY", "Resume bindings are missing.");
  for (const field of fields) {
    if (canonicalStringify(expected[field]) !== canonicalStringify(current[field])) {
      fail("NEW_RUN_REQUIRED", `Authoritative resume binding changed: ${field}.`);
    }
  }
  return true;
}

export async function validateRecoveryTarget(action) {
  requireCondition(action && typeof action === "object" && !Array.isArray(action), "RUN_INTEGRITY", "Recovery action is invalid.");
  if (action.run_root === undefined) return structuredClone(action);
  requireCondition(typeof action.run_root === "string" && path.isAbsolute(action.run_root), "RUN_INTEGRITY", "Stored child Run root must be absolute.");
  const stat = await lstat(action.run_root).catch(() => fail("RUN_INTEGRITY", "Stored child Run root does not exist."));
  requireCondition(stat.isDirectory() && !stat.isSymbolicLink(), "RUN_INTEGRITY", "Stored child Run root is unsafe.");
  const canonical = await realpath(action.run_root);
  return { ...structuredClone(action), run_root: canonical };
}
