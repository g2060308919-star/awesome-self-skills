import { sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";

export const ASSISTANCE_DERIVER_VERSION = "assistance-deriver-v1";

const CONTROL_REQUIRED_ACTIONS = new Set([
  "manual-account-selection",
  "manual-relogin",
  "external-approval",
  "manual-role-change",
  "background-job"
]);

function fail(message) {
  throw new SandboxError("ASSISTANCE_PROVENANCE_MISSING", message);
}

function replyDigest(reply) {
  return `sha256:${sha256Text(reply)}`;
}

function controlMatches(action, event, controlEvents, eventIndex) {
  if (action === "manual-account-selection") {
    return event.type === "session_event" && event.logicalOperation === "session.login" &&
      event.outcome === "logged-in";
  }
  if (action === "manual-relogin") {
    const isLogin = event.type === "session_event" && event.logicalOperation === "session.login" &&
      event.outcome === "logged-in";
    const priorExpiry = controlEvents.slice(0, eventIndex).some((candidate) =>
      candidate.runId === event.runId && candidate.type === "session_event" &&
      candidate.logicalOperation === "session.expire" && candidate.outcome === "expired"
    );
    return isLogin && priorExpiry;
  }
  if (action === "external-approval") {
    return event.logicalOperation === "approval.external-decision";
  }
  if (action === "manual-role-change") {
    return event.type === "session_event" && event.logicalOperation === "session.role.change";
  }
  if (action === "background-job") return event.type === "job_event";
  return true;
}

export function deriveAssistance(input) {
  const expectedEvents = input.assistanceScript?.events ?? [];
  const marks = input.assistanceMarks ?? [];
  if (marks.length !== expectedEvents.length) {
    fail("Assistance records do not match the immutable script cardinality");
  }
  const hostByDigest = new Map(input.normalized.events.map((event) => [event.sourceEventDigest, event]));
  const controlById = new Map((input.controlEvents ?? []).map((event) => [event.id, event]));
  const controlEventsInOrder = input.controlEvents ?? [];
  const controlIndexById = new Map(controlEventsInOrder.map((event, index) => [event.id, index]));
  const usedControlEventIds = new Set();
  const output = [];
  let priorEnd = -Infinity;
  for (let index = 0; index < expectedEvents.length; index += 1) {
    const expected = expectedEvents[index];
    const mark = marks[index];
    if (!mark || ["eventId", "trigger", "reply", "action", "provenance"].some(
      (key) => mark[key] !== expected[key]
    )) fail("Assistance record content or order does not match the immutable script");
    const startedAtMs = Number(mark.startedAtMs);
    const endedAtMs = Number(mark.endedAtMs);
    const elapsedMs = endedAtMs - startedAtMs;
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs) ||
      startedAtMs < priorEnd || elapsedMs < 0) {
      fail("Assistance timing is invalid or out of order");
    }
    const deadlineExceeded = elapsedMs > expected.deadlineMs;
    priorEnd = endedAtMs;
    const messagesDuringWait = input.normalized.events.filter((event) =>
      event.type === "message_completed" && event.timestampMs >= startedAtMs && event.timestampMs <= endedAtMs
    );
    const precedingRunnerRequest = input.normalized.events.filter((event) =>
      event.type === "message_completed" && event.actor === "runner" && event.timestampMs <= startedAtMs
    ).at(-1);
    const hostEventDigests = Array.isArray(mark.hostEventDigests) && mark.hostEventDigests.length > 0
      ? mark.hostEventDigests
      : [...(precedingRunnerRequest ? [precedingRunnerRequest] : []), ...messagesDuringWait]
        .map((event) => event.sourceEventDigest);
    if (hostEventDigests.length === 0) fail("Assistance has no Host evidence references");
    const hostEvents = hostEventDigests.map((eventDigest) => hostByDigest.get(eventDigest));
    if (hostEvents.some((event) => !event || event.sessionDigest !== input.normalized.sessionDigest)) {
      fail("Assistance Host evidence is missing or belongs to another session");
    }
    if (!hostEvents.some((event) => ["user", "evaluator"].includes(event.actor) &&
      event.type === "message_completed" && event.contentDigest === replyDigest(expected.reply))) {
      fail("Assistance reply is not independently present in the Host export");
    }
    const explicitControlIds = Array.isArray(mark.controlEventIds) && mark.controlEventIds.length > 0
      ? mark.controlEventIds : null;
    const controlEventIds = explicitControlIds ?? controlEventsInOrder.filter((event, eventIndex) =>
      event.runId === input.runId && !usedControlEventIds.has(event.id) &&
      controlMatches(mark.action, event, controlEventsInOrder, eventIndex)
    ).slice(0, 1).map((event) => event.id);
    const controlEvents = controlEventIds.map((eventId) => controlById.get(eventId));
    if (CONTROL_REQUIRED_ACTIONS.has(mark.action) && (
      controlEvents.length === 0 || controlEvents.some((event) => !event) ||
      controlEventIds.some((eventId) => usedControlEventIds.has(eventId)) ||
      !controlEvents.some((event) => event.runId === input.runId && controlMatches(
        mark.action, event, controlEventsInOrder, controlIndexById.get(event.id)
      ))
    )) fail("Assistance external action lacks matching Sandbox control evidence");
    for (const eventId of controlEventIds) usedControlEventIds.add(eventId);
    output.push({
      eventId: mark.eventId,
      trigger: mark.trigger,
      reply: mark.reply,
      action: mark.action,
      provenance: mark.provenance,
      startedAtMs,
      endedAtMs,
      elapsedMs,
      valid: !deadlineExceeded,
      ...(deadlineExceeded ? {
        failure: {
          code: "ASSISTANCE_DEADLINE_EXCEEDED",
          message: "Assistance exceeded the immutable script deadline"
        }
      } : {}),
      hostEventDigests: [...hostEventDigests],
      controlEventIds: [...controlEventIds]
    });
  }
  return output;
}
