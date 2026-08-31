import { SandboxError } from "../shared/errors.mjs";

export function createLogicalClock(startTime, stepMilliseconds = 1_000) {
  let current = Date.parse(startTime);
  if (Number.isNaN(current) || !Number.isInteger(stepMilliseconds) || stepMilliseconds < 1) {
    throw new SandboxError(
      "LOGICAL_CLOCK_INVALID",
      "Logical clock requires a valid start time and positive integer step"
    );
  }
  const initial = current;

  return Object.freeze({
    now() {
      return new Date(current).toISOString();
    },
    tick(steps = 1) {
      if (!Number.isInteger(steps) || steps < 1) {
        throw new SandboxError("LOGICAL_CLOCK_INVALID", "Clock steps must be positive integers");
      }
      current += stepMilliseconds * steps;
      return new Date(current).toISOString();
    },
    reset() {
      current = initial;
      return new Date(current).toISOString();
    },
    snapshot() {
      return { now: new Date(current).toISOString(), stepMilliseconds };
    }
  });
}
