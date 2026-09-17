import test from "node:test";
import assert from "node:assert/strict";

import { initialState, transitionState, validateWorkflowState } from "../scripts/lib/state-machine.mjs";

const route = [
  ["case_generation_started", "generating_cases", { refs: { generation: { run_root: "/safe/generator" } } }],
  ["semantic_input_requested", "awaiting_semantic_input", { minimum_missing_input: "Clarify approval behavior" }],
  ["semantic_input_received", "generating_cases"],
  ["case_document_ready", "cases_ready"],
  ["execution_planning_started", "planning_execution", { refs: { execution_plan: { run_root: "/safe/plan" } } }],
  ["execution_confirmation_requested", "awaiting_execution_confirmation", { minimum_missing_input: "Confirm the complete execution list" }],
  ["execution_confirmation_received", "planning_execution"],
  ["execution_plan_ready", "compiling_runner_input"],
  ["runner_input_compiled", "runner_preflight", { refs: { runner_input: { path: "runner-input.json", sha256: "a".repeat(64) } } }],
  ["runner_resource_requested", "awaiting_execution_resource", { minimum_missing_input: "Provide a test account" }],
  ["runner_resource_received", "runner_preflight"],
  ["runner_started", "executing", { refs: { runner_run: { run_id: "RUNNER-1", run_root: "/safe/runner" } } }],
  ["runner_paused", "awaiting_execution_resource", { minimum_missing_input: "Grant the named permission" }],
  ["runner_resource_received", "runner_preflight"],
  ["runner_started", "executing"],
  ["runner_completed", "completed", { refs: { final_index: { path: "final-index.json", sha256: "b".repeat(64) } } }]
];

test("all ordinary legal edges reach the expected stage and preserve the same Run IDs", () => {
  let state = initialState({ runId: "OUTER-1", now: "2026-09-17T00:00:00.000Z" });
  for (const [index, [type, expectedStage, extra = {}]] of route.entries()) {
    state = transitionState(state, {
      event_id: `EVENT-${index + 1}`,
      expected_seq: index,
      type,
      at: `2026-09-17T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
      ...extra
    });
    assert.equal(state.stage, expectedStage);
    assert.equal(state.run_id, "OUTER-1");
    if (state.refs.runner_run) assert.equal(state.refs.runner_run.run_id, "RUNNER-1");
  }
  assert.equal(state.status, "completed");
  assert.equal(state.completion_kind, "executed");
});

test("the same event ID is idempotent before stale-sequence evaluation", () => {
  const first = transitionState(initialState({ runId: "OUTER-1" }), {
    event_id: "EVENT-1", expected_seq: 0, type: "case_generation_started",
    refs: { generation: { run_root: "/safe/generator" } }
  });
  assert.deepEqual(transitionState(first, {
    event_id: "EVENT-1", expected_seq: 0, type: "case_generation_started",
    refs: { generation: { run_root: "/safe/generator" } }
  }), first);
});

test("stale sequences, illegal edges, and terminal transitions fail closed", () => {
  const state = transitionState(initialState({ runId: "OUTER-1" }), {
    event_id: "EVENT-1", expected_seq: 0, type: "case_generation_started",
    refs: { generation: { run_root: "/safe/generator" } }
  });
  assert.throws(() => transitionState(state, {
    event_id: "EVENT-2", expected_seq: 0, type: "case_document_ready"
  }), error => error.code === "STALE_TRANSITION");
  assert.throws(() => transitionState(state, {
    event_id: "EVENT-2", expected_seq: 1, type: "runner_started"
  }), error => error.code === "ILLEGAL_TRANSITION");
  const terminal = transitionState(initialState({ runId: "OUTER-2" }), {
    event_id: "BLOCK", expected_seq: 0, type: "blocked", reason: "Generator fatal"
  });
  assert.throws(() => transitionState(terminal, {
    event_id: "AFTER", expected_seq: 1, type: "case_generation_started"
  }), error => error.code === "ILLEGAL_TRANSITION");
});

test("no_execution_selected requires a final index reference and sets its completion kind", () => {
  let state = initialState({ runId: "OUTER-1" });
  state = transitionState(state, {
    event_id: "E-0", expected_seq: 0, type: "case_generation_started",
    refs: { generation: { run_root: "/safe/generator" } }
  });
  state = transitionState(state, {
    event_id: "E-1", expected_seq: 1, type: "case_document_ready",
    refs: {}
  });
  state = transitionState(state, {
    event_id: "E-2", expected_seq: 2, type: "execution_planning_started",
    refs: { execution_plan: { run_root: "/safe/plan" } }
  });
  assert.throws(() => transitionState(state, {
    event_id: "NOPE", expected_seq: 3, type: "no_execution_selected"
  }), error => error.code === "RUN_INTEGRITY");
  const done = transitionState(state, {
    event_id: "DONE",
    expected_seq: 3,
    type: "no_execution_selected",
    refs: {
      final_index: { path: "final-index.json", sha256: "c".repeat(64) }
    }
  });
  assert.equal(done.stage, "completed");
  assert.equal(done.completion_kind, "no_execution_selected");
});

test("state validation rejects unknown fields, inconsistent status, and secret-bearing history", () => {
  const unknown = initialState({ runId: "OUTER-1" });
  unknown.unexpected = true;
  assert.throws(() => validateWorkflowState(unknown), error => error.code === "RUN_INTEGRITY");

  const inconsistent = initialState({ runId: "OUTER-1" });
  inconsistent.status = "awaiting_user";
  assert.throws(() => validateWorkflowState(inconsistent), error => error.code === "RUN_INTEGRITY");

  const secret = initialState({ runId: "OUTER-1" });
  secret.history.push({
    seq: 1,
    event_id: "BAD",
    type: "blocked",
    from: "intake",
    to: "blocked",
    at: "2026-09-17T00:00:00.000Z",
    reason: "Authorization: Bearer never-persist"
  });
  secret.transition_seq = 1;
  secret.applied_event_ids = ["BAD"];
  assert.throws(
    () => validateWorkflowState(secret),
    error => error.code === "SECRET_MATERIAL_FORBIDDEN" && !error.message.includes("never-persist")
  );
});

test("stage boundary events require the authoritative reference they establish", () => {
  assert.throws(() => transitionState(initialState({ runId: "OUTER-1" }), {
    event_id: "MISSING", expected_seq: 0, type: "case_generation_started"
  }), error => error.code === "RUN_INTEGRITY");
  const generating = transitionState(initialState({ runId: "OUTER-1" }), {
    event_id: "START", expected_seq: 0, type: "case_generation_started",
    refs: { generation: { run_root: "/safe/generator" } }
  });
  const casesReady = transitionState(generating, {
    event_id: "CASES", expected_seq: 1, type: "case_document_ready"
  });
  assert.throws(() => transitionState(casesReady, {
    event_id: "PLAN-MISSING", expected_seq: 2, type: "execution_planning_started"
  }), error => error.code === "RUN_INTEGRITY");
});

test("history and waiting state contain no secret material", () => {
  assert.throws(() => transitionState(initialState({ runId: "OUTER-1" }), {
    event_id: "EVENT-1",
    expected_seq: 0,
    type: "blocked",
    reason: "Authorization: Bearer never-write-this"
  }), error => error.code === "SECRET_MATERIAL_FORBIDDEN" && !error.message.includes("never-write-this"));
});
