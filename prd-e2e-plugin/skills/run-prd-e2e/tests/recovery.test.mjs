import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertResumeBindings, nextRecoveryAction, validateRecoveryTarget } from "../scripts/lib/recovery.mjs";

function state(stage, refs = {}) {
  return {
    schema_version: "1.0",
    run_id: "OUTER-1",
    stage,
    status: stage.startsWith("awaiting_") ? "awaiting_user" : "active",
    next_action: "stored-action",
    minimum_missing_input: stage.startsWith("awaiting_") ? "Current user action" : null,
    refs: {
      generation: null,
      execution_plan: null,
      runner_input: null,
      runner_run: null,
      final_index: null,
      ...refs
    }
  };
}

test("Generator stages always recover by invoking the compiler on the stored child Run", () => {
  const generation = { run_root: "/safe/generator-run" };
  assert.deepEqual(nextRecoveryAction(state("generating_cases", { generation })), {
    skill: "generate-test-cases",
    action: "invoke_compiler",
    run_root: generation.run_root,
    outer_run_id: "OUTER-1"
  });
  const executionPlan = { run_root: "/safe/execution-plan-run" };
  assert.deepEqual(nextRecoveryAction(state("awaiting_execution_confirmation", { execution_plan: executionPlan })), {
    skill: "generate-test-cases",
    action: "invoke_compiler",
    run_root: executionPlan.run_root,
    outer_run_id: "OUTER-1"
  });
});

test("intake and cases-ready stages start the correct new child Run before the started event", () => {
  assert.deepEqual(nextRecoveryAction(state("intake")), {
    skill: "generate-test-cases",
    action: "start_new_run",
    delivery_intent: "case_document",
    outer_run_id: "OUTER-1"
  });
  assert.deepEqual(nextRecoveryAction(state("cases_ready", { generation: { run_root: "/safe/generator-run" } })), {
    skill: "generate-test-cases",
    action: "start_new_run",
    delivery_intent: "execution_plan",
    outer_run_id: "OUTER-1"
  });
  assert.throws(() => nextRecoveryAction(state("generating_cases")), error => error.code === "RUN_INTEGRITY");
  assert.throws(() => nextRecoveryAction(state("planning_execution")), error => error.code === "RUN_INTEGRITY");
  assert.throws(
    () => nextRecoveryAction(state("awaiting_semantic_input")),
    error => error.code === "RUN_INTEGRITY"
  );
});

test("Runner resources return through preflight and resume-check on the same Runner Run", () => {
  const runnerRun = { run_id: "RUNNER-1", run_root: "/safe/runner-run" };
  assert.deepEqual(nextRecoveryAction(state("awaiting_execution_resource", { runner_run: runnerRun })), {
    skill: null,
    action: "await_user_input",
    minimum_missing_input: "Current user action",
    outer_run_id: "OUTER-1",
    runner_run_id: "RUNNER-1"
  });
  assert.deepEqual(nextRecoveryAction(state("runner_preflight", { runner_run: runnerRun })), {
    skill: "b2b-e2e-runner",
    action: "resume-check",
    run_root: runnerRun.run_root,
    outer_run_id: "OUTER-1",
    runner_run_id: "RUNNER-1"
  });
  assert.deepEqual(nextRecoveryAction(state("executing", { runner_run: runnerRun })), {
    skill: "b2b-e2e-runner",
    action: "continue_same_run",
    run_root: runnerRun.run_root,
    outer_run_id: "OUTER-1",
    runner_run_id: "RUNNER-1"
  });
});

test("resume requires a new Run when any authoritative binding changes", () => {
  const expected = {
    request_sha256: "a",
    material_scope_sha256: "b",
    case_document_ref: { run_id: "CASE-RUN", revision: 2 },
    expected_text_sha256: "c",
    pass_standard: { kind: "exact-expected-text" }
  };
  assert.doesNotThrow(() => assertResumeBindings({ expected, current: structuredClone(expected) }));
  for (const key of Object.keys(expected)) {
    const current = structuredClone(expected);
    current[key] = key === "case_document_ref" ? { run_id: "OTHER", revision: 2 } : `${key}-changed`;
    assert.throws(() => assertResumeBindings({ expected, current }), error => error.code === "NEW_RUN_REQUIRED");
  }
});

test("recovery validates a stored child Run root before delegating", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-recovery-target-"));
  const actual = path.join(parent, "actual-run");
  const linked = path.join(parent, "linked-run");
  await mkdir(actual);
  await symlink(actual, linked);
  await assert.doesNotReject(() => validateRecoveryTarget({ action: "invoke_compiler", run_root: actual }));
  await assert.rejects(() => validateRecoveryTarget({ action: "invoke_compiler", run_root: linked }), error => error.code === "RUN_INTEGRITY");
  await assert.rejects(() => validateRecoveryTarget({ action: "invoke_compiler", run_root: "relative/run" }), error => error.code === "RUN_INTEGRITY");
});
