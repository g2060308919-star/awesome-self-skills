import { EVENT_TYPES } from "../shared/constants.mjs";
import { SandboxError } from "../shared/errors.mjs";

export function emitEvent(draft, tools, input) {
  if (!EVENT_TYPES.includes(input.type)) {
    throw new SandboxError("EVENT_TYPE_INVALID", "Oracle event type is not in the fixed taxonomy");
  }
  const eventSequence = draft.oracleEvents.length + 1;
  const event = {
    id: `EVT-${String(eventSequence).padStart(6, "0")}`,
    eventSequence,
    runId: tools.runId,
    type: input.type,
    actorId: input.actorId ?? null,
    sessionId: input.sessionId ?? null,
    logicalOperation: input.logicalOperation,
    entity: input.entity ?? null,
    targetId: input.targetId ?? null,
    field: input.field ?? null,
    operation: input.operation ?? null,
    outcome: input.outcome,
    before: input.before === undefined ? null : structuredClone(input.before),
    after: input.after === undefined ? null : structuredClone(input.after),
    correlationKey: input.correlationKey ?? `${tools.runId}:${eventSequence}`,
    time: tools.now()
  };
  draft.oracleEvents.push(event);
  return event;
}

export function projectBusinessAudit(draft, event, summary) {
  draft.businessAudit.push({
    id: `AUD-${String(draft.businessAudit.length + 1).padStart(6, "0")}`,
    eventSequence: event.eventSequence,
    actorId: event.actorId,
    summary,
    time: event.time
  });
}
