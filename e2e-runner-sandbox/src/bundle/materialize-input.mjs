import { SandboxError } from "../shared/errors.mjs";

const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

function decodePointer(pointer) {
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    throw new SandboxError(
      "RUN_ID_POINTER_INVALID",
      "A runId substitution pointer must be an absolute JSON pointer"
    );
  }
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function assignPointer(document, pointer, runId) {
  const segments = decodePointer(pointer);
  if (segments.some((segment) => UNSAFE_SEGMENTS.has(segment))) {
    throw new SandboxError(
      "RUN_ID_POINTER_UNSAFE",
      "A runId substitution pointer contains an unsafe segment"
    );
  }

  let target = document;
  for (const segment of segments.slice(0, -1)) {
    if (target === null || typeof target !== "object" || !Object.hasOwn(target, segment)) {
      throw new SandboxError(
        "RUN_ID_POINTER_INVALID",
        "A declared runId substitution pointer does not resolve"
      );
    }
    target = target[segment];
  }

  const property = segments.at(-1);
  if (
    property === undefined ||
    target === null ||
    typeof target !== "object" ||
    !Object.hasOwn(target, property)
  ) {
    throw new SandboxError(
      "RUN_ID_POINTER_INVALID",
      "A declared runId substitution pointer does not resolve"
    );
  }
  if (typeof target[property] !== "string" || !target[property].includes("{{runId}}")) {
    throw new SandboxError(
      "RUN_ID_POINTER_INVALID",
      "A declared runId pointer must reference a runId placeholder string"
    );
  }
  target[property] = target[property].replaceAll("{{runId}}", runId);
}

export function materializeRunnerInput(template, runId, pointers) {
  if (typeof runId !== "string" || runId.length < 3 || runId.length > 128) {
    throw new SandboxError("RUN_ID_INVALID", "runId must be an opaque string");
  }
  if (!Array.isArray(pointers)) {
    throw new SandboxError(
      "RUN_ID_POINTER_INVALID",
      "runId substitution pointers must be an array"
    );
  }
  if (new Set(pointers).size !== pointers.length) {
    throw new SandboxError(
      "RUN_ID_POINTER_DUPLICATE",
      "runId substitution pointers must be unique"
    );
  }

  const materialized = structuredClone(template);
  for (const pointer of pointers) assignPointer(materialized, pointer, runId);
  return materialized;
}
