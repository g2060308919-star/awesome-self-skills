export function matchFault(faultState, operationContext, phase) {
  if (!faultState || faultState.consumed || faultState.phase !== phase) return null;
  if (faultState.logicalOperation !== operationContext.logicalOperation) return null;
  if (faultState.actorId && faultState.actorId !== operationContext.actorId) return null;
  if (faultState.targetId && faultState.targetId !== operationContext.targetId) return null;
  if (operationContext.source === "background-poll") return null;

  faultState.seen = (faultState.seen ?? 0) + 1;
  if (faultState.seen !== (faultState.occurrence ?? 1)) return null;
  faultState.triggered = (faultState.triggered ?? 0) + 1;
  faultState.consumed = true;
  return faultState.effect;
}

export function summarizeFault(faultState) {
  if (!faultState) return null;
  return {
    id: faultState.id,
    armed: true,
    triggered: faultState.triggered ?? 0,
    consumed: Boolean(faultState.consumed)
  };
}
