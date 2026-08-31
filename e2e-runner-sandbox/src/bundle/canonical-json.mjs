import { SandboxError } from "../shared/errors.mjs";

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isTimestampKey(key) {
  return typeof key === "string" && (key.endsWith("At") || key.endsWith("Time"));
}

function normalizeTimestamp(value, key) {
  if (!isTimestampKey(key) || typeof value !== "string") return value;
  const milliseconds = Date.parse(value);
  return Number.isNaN(milliseconds) ? value : new Date(milliseconds).toISOString();
}

export function canonicalize(value, options = {}) {
  const volatileKeys = new Set(options.volatileKeys ?? []);
  const ancestors = new Set();

  function visit(current, key = "") {
    current = normalizeTimestamp(current, key);

    if (current === null || typeof current === "boolean" || typeof current === "string") {
      return current;
    }

    if (typeof current === "number") {
      if (!Number.isFinite(current)) {
        throw new SandboxError(
          "CANONICAL_NUMBER",
          "Canonical JSON accepts only finite numbers"
        );
      }
      return Object.is(current, -0) ? 0 : current;
    }

    if (current instanceof Date) return current.toISOString();

    if (typeof current !== "object") {
      throw new SandboxError(
        "CANONICAL_TYPE",
        `Unsupported canonical JSON value: ${typeof current}`
      );
    }

    if (ancestors.has(current)) {
      throw new SandboxError("CANONICAL_CYCLE", "Canonical JSON cannot contain cycles");
    }
    ancestors.add(current);

    let normalized;
    if (Array.isArray(current)) {
      normalized = current.map((item) => visit(item));
      if (
        normalized.length > 1 &&
        normalized.every(
          (item) => isPlainObject(item) && typeof item.id === "string"
        )
      ) {
        normalized.sort((left, right) => left.id.localeCompare(right.id, "en"));
      }
    } else {
      if (!isPlainObject(current)) {
        throw new SandboxError(
          "CANONICAL_TYPE",
          "Canonical JSON accepts only arrays, dates, and plain objects"
        );
      }
      normalized = {};
      for (const property of Object.keys(current).sort()) {
        if (volatileKeys.has(property)) continue;
        normalized[property] = visit(current[property], property);
      }
    }

    ancestors.delete(current);
    return normalized;
  }

  return visit(value);
}

export function canonicalStringify(value, options = {}) {
  return JSON.stringify(canonicalize(value, options));
}
