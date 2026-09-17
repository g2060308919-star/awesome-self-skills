export class PrdE2EError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "PrdE2EError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(code, message, details) {
  throw new PrdE2EError(code, message, details);
}

export function requireCondition(condition, code, message, details) {
  if (!condition) fail(code, message, details);
}
