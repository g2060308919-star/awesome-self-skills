import { fail, requireCondition } from "./errors.mjs";
import { assertNoSecrets } from "./secrets.mjs";

const TERMINAL = new Set(["completed", "blocked", "cancelled"]);
const STAGES = new Set([
  "intake", "generating_cases", "awaiting_semantic_input", "cases_ready",
  "planning_execution", "awaiting_execution_confirmation", "compiling_runner_input",
  "runner_preflight", "awaiting_execution_resource", "executing",
  "completed", "blocked", "cancelled"
]);
const STATE_FIELDS = new Set([
  "schema_version", "run_id", "created_at", "updated_at", "stage", "status",
  "completion_kind", "transition_seq", "applied_event_ids", "next_action",
  "waiting_for_user", "minimum_missing_input", "refs", "history"
]);
const HISTORY_FIELDS = new Set(["seq", "event_id", "type", "from", "to", "at", "reason"]);

const EDGES = new Map([
  ["intake:case_generation_started", ["generating_cases", "run_case_generation"]],
  ["generating_cases:semantic_input_requested", ["awaiting_semantic_input", "await_semantic_input"]],
  ["awaiting_semantic_input:semantic_input_received", ["generating_cases", "resume_case_generation"]],
  ["generating_cases:case_document_ready", ["cases_ready", "start_execution_planning"]],
  ["cases_ready:execution_planning_started", ["planning_execution", "run_execution_planning"]],
  ["planning_execution:execution_confirmation_requested", ["awaiting_execution_confirmation", "await_execution_confirmation"]],
  ["awaiting_execution_confirmation:execution_confirmation_received", ["planning_execution", "resume_execution_planning"]],
  ["planning_execution:execution_plan_ready", ["compiling_runner_input", "compile_runner_input"]],
  ["planning_execution:no_execution_selected", ["completed", null]],
  ["compiling_runner_input:runner_input_compiled", ["runner_preflight", "validate_runner_preflight"]],
  ["runner_preflight:runner_resource_requested", ["awaiting_execution_resource", "await_runner_resource"]],
  ["awaiting_execution_resource:runner_resource_received", ["runner_preflight", "runner_resume_check"]],
  ["runner_preflight:runner_started", ["executing", "execute_or_resume_runner"]],
  ["executing:runner_paused", ["awaiting_execution_resource", "await_runner_resource"]],
  ["executing:runner_completed", ["completed", null]]
]);

const EVENT_FIELDS = new Set(["event_id", "expected_seq", "type", "at", "minimum_missing_input", "refs", "reason"]);
const REF_FIELDS = new Set(["generation", "execution_plan", "runner_input", "runner_run", "final_index"]);

const NEXT_ACTIONS = new Map([
  ["intake", new Set(["start_case_generation"])],
  ["generating_cases", new Set(["run_case_generation", "resume_case_generation"])],
  ["awaiting_semantic_input", new Set(["await_semantic_input"])],
  ["cases_ready", new Set(["start_execution_planning"])],
  ["planning_execution", new Set(["run_execution_planning", "resume_execution_planning"])],
  ["awaiting_execution_confirmation", new Set(["await_execution_confirmation"])],
  ["compiling_runner_input", new Set(["compile_runner_input"])],
  ["runner_preflight", new Set(["validate_runner_preflight", "runner_resume_check"])],
  ["awaiting_execution_resource", new Set(["await_runner_resource"])],
  ["executing", new Set(["execute_or_resume_runner"])],
  ["completed", new Set([null])],
  ["blocked", new Set([null])],
  ["cancelled", new Set([null])]
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireExactKeys(value, expected, label) {
  requireCondition(isRecord(value), "RUN_INTEGRITY", `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  requireCondition(JSON.stringify(actual) === JSON.stringify(wanted), "RUN_INTEGRITY", `${label} has an invalid closed shape.`);
}

function validTimestamp(value) {
  return typeof value === "string" && value.trim() && Number.isFinite(Date.parse(value));
}

function requiredRefsForState(state) {
  const required = [];
  const generationStages = new Set([
    "generating_cases", "awaiting_semantic_input", "cases_ready", "planning_execution", "awaiting_execution_confirmation", "compiling_runner_input",
    "runner_preflight", "awaiting_execution_resource", "executing"
  ]);
  const planStages = new Set(["planning_execution", "awaiting_execution_confirmation", "compiling_runner_input", "runner_preflight", "awaiting_execution_resource", "executing"]);
  const inputStages = new Set(["runner_preflight", "awaiting_execution_resource", "executing"]);
  if (generationStages.has(state.stage)) required.push("generation");
  if (planStages.has(state.stage)) required.push("execution_plan");
  if (inputStages.has(state.stage)) required.push("runner_input");
  if (state.stage === "executing") required.push("runner_run");
  if (state.stage === "completed") {
    required.push("generation", "execution_plan", "final_index");
    if (state.completion_kind === "executed") required.push("runner_input", "runner_run");
  }
  return required;
}

export function validateWorkflowState(state, { expectedRunId } = {}) {
  assertNoSecrets(state);
  requireExactKeys(state, STATE_FIELDS, "Workflow state");
  requireCondition(state.schema_version === "1.0", "RUN_INTEGRITY", "Workflow state schema version is invalid.");
  requireCondition(typeof state.run_id === "string" && state.run_id.trim(), "RUN_INTEGRITY", "Workflow state Run ID is invalid.");
  if (expectedRunId !== undefined) {
    requireCondition(state.run_id === expectedRunId, "RUN_INTEGRITY", "Workflow state Run identity does not match its directory.");
  }
  requireCondition(validTimestamp(state.created_at) && validTimestamp(state.updated_at), "RUN_INTEGRITY", "Workflow timestamps are invalid.");
  requireCondition(Date.parse(state.updated_at) >= Date.parse(state.created_at), "RUN_INTEGRITY", "Workflow timestamps are out of order.");
  requireCondition(STAGES.has(state.stage), "RUN_INTEGRITY", "Workflow stage is invalid.");
  requireCondition(Number.isSafeInteger(state.transition_seq) && state.transition_seq >= 0, "RUN_INTEGRITY", "Workflow transition sequence is invalid.");
  requireCondition(Array.isArray(state.applied_event_ids) && new Set(state.applied_event_ids).size === state.applied_event_ids.length, "RUN_INTEGRITY", "Applied event IDs are invalid.");
  requireCondition(state.applied_event_ids.every(value => typeof value === "string" && value.trim()), "RUN_INTEGRITY", "Applied event IDs are invalid.");
  requireCondition(Array.isArray(state.history) && state.history.length === state.transition_seq && state.applied_event_ids.length === state.transition_seq, "RUN_INTEGRITY", "Workflow history length is inconsistent.");

  const waiting = new Set(["awaiting_semantic_input", "awaiting_execution_confirmation", "awaiting_execution_resource"]).has(state.stage);
  const expectedStatus = state.stage === "completed" ? "completed"
    : state.stage === "blocked" ? "blocked"
      : state.stage === "cancelled" ? "cancelled"
        : waiting ? "awaiting_user" : "active";
  requireCondition(state.status === expectedStatus && state.waiting_for_user === waiting, "RUN_INTEGRITY", "Workflow status is inconsistent with its stage.");
  requireCondition(waiting
    ? typeof state.minimum_missing_input === "string" && state.minimum_missing_input.trim()
    : state.minimum_missing_input === null, "RUN_INTEGRITY", "Workflow missing-input state is inconsistent.");
  requireCondition(NEXT_ACTIONS.get(state.stage)?.has(state.next_action), "RUN_INTEGRITY", "Workflow next action is inconsistent with its stage.");
  if (state.stage === "completed") {
    requireCondition(["executed", "no_execution_selected"].includes(state.completion_kind), "RUN_INTEGRITY", "Workflow completion kind is invalid.");
  } else {
    requireCondition(state.completion_kind === null, "RUN_INTEGRITY", "Workflow completion kind is inconsistent.");
  }

  requireExactKeys(state.refs, REF_FIELDS, "Workflow refs");
  for (const [name, value] of Object.entries(state.refs)) {
    requireCondition(value === null || isRecord(value), "RUN_INTEGRITY", `Workflow ref ${name} is invalid.`);
  }
  for (const name of requiredRefsForState(state)) {
    requireCondition(isRecord(state.refs[name]), "RUN_INTEGRITY", `Workflow ref ${name} is required at stage ${state.stage}.`);
  }

  let previousStage = "intake";
  state.history.forEach((entry, index) => {
    const keys = new Set(Object.keys(entry));
    requireCondition([...keys].every(key => HISTORY_FIELDS.has(key)), "RUN_INTEGRITY", "Workflow history entry has unknown fields.");
    for (const required of ["seq", "event_id", "type", "from", "to", "at"]) {
      requireCondition(keys.has(required), "RUN_INTEGRITY", `Workflow history entry is missing ${required}.`);
    }
    requireCondition(entry.seq === index + 1 && entry.event_id === state.applied_event_ids[index], "RUN_INTEGRITY", "Workflow history sequence is inconsistent.");
    requireCondition(typeof entry.type === "string" && entry.type.trim() && entry.from === previousStage && STAGES.has(entry.to), "RUN_INTEGRITY", "Workflow history transition is invalid.");
    requireCondition(!TERMINAL.has(entry.from) && validTimestamp(entry.at), "RUN_INTEGRITY", "Workflow history boundary is invalid.");
    const ordinary = EDGES.get(`${entry.from}:${entry.type}`)?.[0];
    requireCondition(ordinary === entry.to || (["blocked", "cancelled"].includes(entry.type) && entry.type === entry.to), "RUN_INTEGRITY", "Workflow history contains an illegal transition.");
    if (entry.reason !== undefined) requireCondition(typeof entry.reason === "string" && entry.reason.trim(), "RUN_INTEGRITY", "Workflow history reason is invalid.");
    previousStage = entry.to;
  });
  requireCondition(previousStage === state.stage, "RUN_INTEGRITY", "Workflow history does not end at the current stage.");
  if (state.history.length > 0) requireCondition(state.updated_at === state.history.at(-1).at, "RUN_INTEGRITY", "Workflow updated timestamp differs from its history.");
  return structuredClone(state);
}

function nowString(now) {
  if (typeof now === "string" && now.trim()) return now;
  return new Date().toISOString();
}

function cloneRefs(refs) {
  return {
    generation: refs?.generation ?? null,
    execution_plan: refs?.execution_plan ?? null,
    runner_input: refs?.runner_input ?? null,
    runner_run: refs?.runner_run ?? null,
    final_index: refs?.final_index ?? null
  };
}

export function initialState({ runId, now } = {}) {
  requireCondition(typeof runId === "string" && runId.trim(), "INPUT_CONTRACT", "runId is required.");
  const timestamp = nowString(now);
  const state = {
    schema_version: "1.0",
    run_id: runId,
    created_at: timestamp,
    updated_at: timestamp,
    stage: "intake",
    status: "active",
    completion_kind: null,
    transition_seq: 0,
    applied_event_ids: [],
    next_action: "start_case_generation",
    waiting_for_user: false,
    minimum_missing_input: null,
    refs: cloneRefs(),
    history: []
  };
  validateWorkflowState(state);
  return state;
}

function validateEvent(event) {
  requireCondition(event && typeof event === "object" && !Array.isArray(event), "INPUT_CONTRACT", "Transition event must be an object.");
  const unknown = Object.keys(event).filter(key => !EVENT_FIELDS.has(key));
  requireCondition(unknown.length === 0, "INPUT_CONTRACT", "Transition event contains unknown fields.", { fields: unknown });
  requireCondition(typeof event.event_id === "string" && event.event_id.trim(), "INPUT_CONTRACT", "event_id is required.");
  requireCondition(Number.isSafeInteger(event.expected_seq) && event.expected_seq >= 0, "INPUT_CONTRACT", "expected_seq is invalid.");
  requireCondition(typeof event.type === "string" && event.type.trim(), "INPUT_CONTRACT", "type is required.");
  if (event.minimum_missing_input !== undefined) {
    requireCondition(typeof event.minimum_missing_input === "string" && event.minimum_missing_input.trim(), "INPUT_CONTRACT", "minimum_missing_input is invalid.");
  }
  if (event.refs !== undefined) {
    requireCondition(event.refs && typeof event.refs === "object" && !Array.isArray(event.refs), "INPUT_CONTRACT", "refs must be an object.");
    const invalid = Object.keys(event.refs).filter(key => !REF_FIELDS.has(key));
    requireCondition(invalid.length === 0, "INPUT_CONTRACT", "refs contains unknown fields.", { fields: invalid });
  }
  assertNoSecrets(event);
}

function requireFinalIndex(refs, eventType) {
  if (eventType === "runner_completed" || eventType === "no_execution_selected") {
    requireCondition(refs.final_index && typeof refs.final_index === "object", "RUN_INTEGRITY", "A validated final-index reference is required before completion.");
  }
}

export function transitionState(inputState, event) {
  validateEvent(event);
  const state = validateWorkflowState(inputState);

  if (state.applied_event_ids.includes(event.event_id)) return state;
  requireCondition(!TERMINAL.has(state.stage), "ILLEGAL_TRANSITION", `Terminal stage ${state.stage} cannot transition.`);
  requireCondition(event.expected_seq === state.transition_seq, "STALE_TRANSITION", "Transition sequence is stale.", {
    expected: state.transition_seq,
    received: event.expected_seq
  });

  let destination;
  let nextAction;
  if (event.type === "blocked" || event.type === "cancelled") {
    destination = event.type;
    nextAction = null;
  } else {
    const edge = EDGES.get(`${state.stage}:${event.type}`);
    requireCondition(Boolean(edge), "ILLEGAL_TRANSITION", `Event ${event.type} is not legal from ${state.stage}.`);
    [destination, nextAction] = edge;
  }

  const refs = cloneRefs({ ...state.refs, ...(event.refs ?? {}) });
  requireFinalIndex(refs, event.type);
  const waitingForUser = destination === "awaiting_semantic_input" || destination === "awaiting_execution_confirmation" || destination === "awaiting_execution_resource";
  if (waitingForUser) {
    requireCondition(typeof event.minimum_missing_input === "string" && event.minimum_missing_input.trim(), "INPUT_CONTRACT", "Waiting transitions require minimum_missing_input.");
  }

  const timestamp = nowString(event.at);
  const nextSeq = state.transition_seq + 1;
  const completionKind = destination === "completed"
    ? (event.type === "no_execution_selected" ? "no_execution_selected" : "executed")
    : null;
  const historyEntry = {
    seq: nextSeq,
    event_id: event.event_id,
    type: event.type,
    from: state.stage,
    to: destination,
    at: timestamp,
    ...(event.reason ? { reason: event.reason } : {})
  };
  assertNoSecrets(historyEntry);

  const next = {
    ...state,
    updated_at: timestamp,
    stage: destination,
    status: destination === "completed" ? "completed" : destination === "blocked" ? "blocked" : destination === "cancelled" ? "cancelled" : waitingForUser ? "awaiting_user" : "active",
    completion_kind: completionKind,
    transition_seq: nextSeq,
    applied_event_ids: [...state.applied_event_ids, event.event_id],
    next_action: nextAction,
    waiting_for_user: waitingForUser,
    minimum_missing_input: waitingForUser ? event.minimum_missing_input : null,
    refs,
    history: [...state.history, historyEntry]
  };
  validateWorkflowState(next);
  return next;
}

export const workflowStages = Object.freeze([...STAGES]);
