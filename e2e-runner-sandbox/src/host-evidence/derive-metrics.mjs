import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";
import { isBrowserRead } from "./contracts.mjs";

export const METRIC_DERIVER_VERSION = "metrics-deriver-v1";

const WRITE_OPERATION_PATTERNS = Object.freeze([
  /(?:^|\.)(?:create|update|delete|submit|decision|external-decision|role\.change)$/,
  /(?:^|\.)status\.update$/,
  /(?:^|\.)description\.update$/
]);

function digest(value) {
  return `sha256:${sha256Text(canonicalStringify(value))}`;
}

function fail(message) {
  throw new SandboxError("METRIC_NOT_DERIVABLE", message);
}

function mergeWaitIntervals(intervals, trial) {
  const checked = (intervals ?? []).map((interval) => {
    const startMs = Number(interval.startMs);
    const endMs = Number(interval.endMs);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs ||
      startMs < trial.executionStartedAtMs || endMs > trial.terminalAtMs ||
      (interval.sessionDigest && interval.sessionDigest !== trial.sessionDigest)) {
      fail("Wait intervals are reversed, out of bounds, or cross-session");
    }
    return { startMs, endMs };
  }).sort((left, right) => left.startMs - right.startMs);
  const merged = [];
  for (const interval of checked) {
    const prior = merged.at(-1);
    if (prior && interval.startMs <= prior.endMs) prior.endMs = Math.max(prior.endMs, interval.endMs);
    else merged.push({ ...interval });
  }
  return merged;
}

function isWriteAttempt(event) {
  if (event.type !== "operation_attempt") return false;
  if (["create", "update", "delete"].includes(event.operation)) return true;
  return WRITE_OPERATION_PATTERNS.some((pattern) => pattern.test(String(event.logicalOperation ?? "")));
}

function repeatedNoProgress(events, requestTrace, oracleEvents) {
  const eventTime = (event) => Number(event.timestampMs ?? event.endedAtMs ?? Date.parse(event.time));
  const priorBySignature = new Map();
  let repeats = 0;
  for (const event of events.filter(({ actor, type }) => actor === "runner" && type === "tool_call_completed")) {
    const signature = [event.tool, event.targetOrigin, event.argumentsDigest].join("|");
    const prior = priorBySignature.get(signature);
    if (prior && prior.resultDigest === event.resultDigest) {
      const requestsBetween = requestTrace.filter((request) =>
        eventTime(request) > prior.timestampMs && eventTime(request) <= event.timestampMs
      );
      const requestResults = new Set(requestsBetween.map(({ resultDigest }) => resultDigest));
      const oracleChanged = oracleEvents.some((oracleEvent) =>
        eventTime(oracleEvent) > prior.timestampMs && eventTime(oracleEvent) <= event.timestampMs &&
        oracleEvent.type === "state_mutation"
      );
      if (requestResults.size <= 1 && !oracleChanged) repeats += 1;
    }
    priorBySignature.set(signature, event);
  }
  return repeats;
}

function source(derivable, inputs) {
  return { derivable, deriverVersion: METRIC_DERIVER_VERSION, inputDigests: inputs };
}

export function deriveMetrics(input) {
  const { normalized, trial } = input;
  const startMs = Number(trial.executionStartedAtMs);
  const endMs = Number(trial.terminalAtMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    fail("Execution start and terminal timestamps are required and ordered");
  }
  const waitIntervals = mergeWaitIntervals(trial.waitIntervals, {
    ...trial, executionStartedAtMs: startMs, terminalAtMs: endMs
  });
  const waitingMs = waitIntervals.reduce((total, interval) => total + interval.endMs - interval.startMs, 0);
  const activeElapsedMs = endMs - startMs - waitingMs;
  if (activeElapsedMs < 0) fail("Merged wait time exceeds the execution interval");
  const browserReads = normalized.events.filter(({ actor, type, tool }) =>
    actor === "runner" && type === "tool_call_completed" && isBrowserRead(tool)
  ).length;
  const requestTraceAvailable = Array.isArray(input.requestTrace);
  const oracleEventsAvailable = Array.isArray(input.oracleEvents);
  if (requestTraceAvailable && input.requestTrace.some(({ runId }) => runId !== trial.runId)) {
    throw new SandboxError("SANDBOX_RUN_MISMATCH", "Business request trace contains another runId");
  }
  if (oracleEventsAvailable && input.oracleEvents.some(({ runId }) => runId && runId !== trial.runId)) {
    throw new SandboxError("SANDBOX_RUN_MISMATCH", "Oracle events contain another runId");
  }
  const businessRequests = requestTraceAvailable ? input.requestTrace.length : null;
  const writes = oracleEventsAvailable ? input.oracleEvents.filter(isWriteAttempt).length : null;
  const repetitionDerivable = requestTraceAvailable && oracleEventsAvailable;
  const repeatedNoProgressActions = repetitionDerivable
    ? repeatedNoProgress(normalized.events, input.requestTrace, input.oracleEvents)
    : null;
  return {
    activeElapsedMs,
    browserReads,
    businessRequests,
    writes,
    repeatedNoProgressActions,
    waitIntervals,
    sources: {
      activeElapsedMs: source(true, [normalized.normalizedEventsDigest, digest(waitIntervals)]),
      browserReads: source(true, [normalized.normalizedEventsDigest]),
      businessRequests: source(requestTraceAvailable, requestTraceAvailable ? [digest(input.requestTrace)] : []),
      writes: source(oracleEventsAvailable, oracleEventsAvailable ? [digest(input.oracleEvents)] : []),
      repeatedNoProgressActions: source(repetitionDerivable, repetitionDerivable
        ? [normalized.normalizedEventsDigest, digest(input.requestTrace), digest(input.oracleEvents)] : [])
    }
  };
}
