export class SandboxError extends Error {
  constructor(code, message, details = {}, httpStatus = 400) {
    super(message);
    this.name = "SandboxError";
    this.code = code;
    this.details = structuredClone(details);
    this.httpStatus = httpStatus;
  }

  toPublicJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(Object.keys(this.details).length > 0 ? { details: this.details } : {})
    };
  }
}

export function invariant(condition, code, message, details = {}, httpStatus = 400) {
  if (!condition) {
    throw new SandboxError(code, message, details, httpStatus);
  }
}
