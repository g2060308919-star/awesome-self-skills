import test from "node:test";
import assert from "node:assert/strict";

import { initialState, transitionState } from "../scripts/lib/state-machine.mjs";
import { nextRecoveryAction } from "../scripts/lib/recovery.mjs";

function event(state, id, type, extra = {}) {
  return transitionState(state, { event_id: id, expected_seq: state.transition_seq, type, ...extra });
}

test("automatic relay advances from Case readiness to planning and compilation without asking for a Skill name", () => {
  let state = initialState({ runId: "OUTER-1" });
  state = event(state, "1", "case_generation_started", { refs: { generation: { run_root: "/case" } } });
  state = event(state, "2", "case_document_ready");
  assert.equal(state.next_action, "start_execution_planning");
  state = event(state, "3", "execution_planning_started", { refs: { execution_plan: { run_root: "/plan" } } });
  state = event(state, "4", "execution_plan_ready");
  assert.equal(state.stage, "compiling_runner_input");
  assert.equal(state.waiting_for_user, false);
});

test("two Runner pauses preserve the same outer and Runner Run and require resume-check each time", () => {
  let state = initialState({ runId: "OUTER-1" });
  const sequence = [
    ["case_generation_started", { refs: { generation: { run_root: "/case" } } }],
    ["case_document_ready"],
    ["execution_planning_started", { refs: { execution_plan: { run_root: "/plan" } } }],
    ["execution_plan_ready"],
    ["runner_input_compiled", { refs: { runner_input: { path: "runner-input.json", sha256: "sha256:input" } } }],
    ["runner_started", { refs: { runner_run: { run_id: "RUNNER-1", run_root: "/runner" } } }],
    ["runner_paused", { minimum_missing_input: "Account one" }], ["runner_resource_received"]
  ];
  sequence.forEach(([type, extra], index) => { state = event(state, `A-${index}`, type, extra); });
  assert.equal(nextRecoveryAction(state).action, "resume-check");
  state = event(state, "A-8", "runner_started");
  state = event(state, "A-9", "runner_paused", { minimum_missing_input: "Account two" });
  state = event(state, "A-10", "runner_resource_received");
  const recovery = nextRecoveryAction(state);
  assert.equal(recovery.action, "resume-check");
  assert.equal(recovery.outer_run_id, "OUTER-1");
  assert.equal(recovery.runner_run_id, "RUNNER-1");
});
