import { SandboxError } from "../shared/errors.mjs";

export const TRIAL_STATES = Object.freeze([
  "created", "prepared", "awaiting_scope_confirmation", "awaiting_runner",
  "running", "awaiting_assistance", "collecting", "evaluating", "evaluated",
  "resetting", "completed", "blocked", "invalid", "reset_failed", "abandoned"
]);

const ALLOWED = Object.freeze({
  created: ["prepared", "blocked", "invalid", "abandoned"],
  prepared: ["awaiting_scope_confirmation", "blocked", "invalid", "abandoned"],
  awaiting_scope_confirmation: ["awaiting_runner", "blocked", "invalid", "abandoned"],
  awaiting_runner: ["running", "blocked", "invalid", "abandoned"],
  running: ["awaiting_assistance", "collecting", "blocked", "invalid", "abandoned"],
  awaiting_assistance: ["running", "blocked", "invalid", "abandoned"],
  collecting: ["evaluating", "blocked", "invalid", "abandoned"],
  evaluating: ["evaluated", "blocked", "invalid", "abandoned"],
  evaluated: ["resetting", "invalid", "abandoned"],
  resetting: ["completed", "reset_failed", "invalid"],
  completed: [],
  blocked: ["running", "collecting", "evaluating", "resetting", "invalid", "abandoned"],
  invalid: ["resetting", "abandoned"],
  reset_failed: ["resetting", "abandoned"],
  abandoned: ["resetting"]
});

function fail(message) {
  throw new SandboxError("TRIAL_STATE_INVALID", message);
}

export function transitionTrial(manifest, nextState, options = {}) {
  if (!TRIAL_STATES.includes(manifest.state) || !TRIAL_STATES.includes(nextState)) {
    fail("Trial state is unknown");
  }
  if (manifest.state === nextState) {
    if (options.idempotencyKey && options.idempotencyKey === manifest.lastTransitionIdempotencyKey) {
      return structuredClone(manifest);
    }
    fail("A repeated Trial transition requires the original idempotency key");
  }
  if (!ALLOWED[manifest.state].includes(nextState)) {
    fail(`Trial cannot transition from ${manifest.state} to ${nextState}`);
  }
  if (manifest.state === "blocked" && manifest.blocking?.requiresManualReconciliation &&
    nextState === manifest.blocking.resumeState && options.reconciled !== true) {
    fail("Blocked Trial requires explicit manual reconciliation before resume");
  }
  if (!Number.isFinite(Date.parse(options.at))) fail("Trial transition timestamp is invalid");
  const nextRevision = manifest.revision + 1;
  const output = {
    ...structuredClone(manifest),
    state: nextState,
    revision: nextRevision,
    timeline: [
      ...(manifest.timeline ?? []),
      {
        revision: nextRevision,
        from: manifest.state,
        to: nextState,
        at: options.at,
        reason: options.reason ?? null,
        idempotencyKey: options.idempotencyKey ?? null
      }
    ],
    lastTransitionIdempotencyKey: options.idempotencyKey ?? null
  };
  if (nextState === "blocked") {
    output.blocking = {
      reason: options.reason ?? "blocked",
      resumeState: options.resumeState ?? manifest.state,
      requiresManualReconciliation: options.requiresManualReconciliation === true
    };
  } else if (manifest.state === "blocked") {
    output.lastBlocking = output.blocking;
    output.blocking = null;
  }
  return output;
}

export function reviseTrial(manifest, options = {}) {
  if (!Number.isFinite(Date.parse(options.at)) || typeof options.reason !== "string") {
    fail("Trial revision metadata is invalid");
  }
  const nextRevision = manifest.revision + 1;
  return {
    ...structuredClone(manifest),
    ...structuredClone(options.patch ?? {}),
    revision: nextRevision,
    timeline: [
      ...(manifest.timeline ?? []),
      {
        revision: nextRevision,
        from: manifest.state,
        to: manifest.state,
        at: options.at,
        reason: options.reason,
        idempotencyKey: options.idempotencyKey ?? null
      }
    ],
    lastTransitionIdempotencyKey: options.idempotencyKey ?? null
  };
}

export function nextTrialActions(manifest) {
  if (manifest.state === "blocked") {
    return manifest.blocking?.requiresManualReconciliation
      ? ["reconcile", "abandon", "status"]
      : ["resume", "abandon", "status"];
  }
  return {
    created: ["prepare", "abandon", "status"],
    prepared: ["confirm-scope", "abandon", "status"],
    awaiting_scope_confirmation: ["confirm-scope", "abandon", "status"],
    awaiting_runner: ["show-runner-input", "bind-session", "abandon", "status"],
    running: ["assist", "collect", "mark-interrupted", "abandon", "status"],
    awaiting_assistance: ["assist-complete", "assist-timeout", "abandon", "status"],
    collecting: ["import-host", "evaluate", "abandon", "status"],
    evaluating: ["evaluate", "abandon", "status"],
    evaluated: ["reset", "status"],
    resetting: ["reset", "status"],
    completed: [],
    invalid: ["reset", "abandon", "status"],
    reset_failed: ["reset", "abandon", "status"],
    abandoned: ["reset", "status"]
  }[manifest.state] ?? ["status"];
}
