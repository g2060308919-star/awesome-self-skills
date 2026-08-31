import { timingSafeEqual } from "node:crypto";

import { SandboxError } from "../shared/errors.mjs";

export const CONTROL_PROTOCOL_VERSION = 1;
export const MAX_CONTROL_MESSAGE_BYTES = 1024 * 1024;

export const CONTROL_COMMANDS = Object.freeze([
  "prepare",
  "reset",
  "status",
  "snapshot",
  "events",
  "outbox",
  "canaries",
  "fault",
  "expire-session",
  "set-role",
  "external-action",
  "stop"
]);

export function tokenMatches(actual, expected) {
  const actualBuffer = Buffer.from(String(actual), "utf8");
  const expectedBuffer = Buffer.from(String(expected), "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function parseControlMessage(line) {
  if (Buffer.byteLength(line, "utf8") > MAX_CONTROL_MESSAGE_BYTES) {
    throw new SandboxError("CONTROL_MESSAGE_TOO_LARGE", "Control message exceeds 1 MiB", {}, 413);
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    throw new SandboxError("CONTROL_MESSAGE_INVALID", "Control message must be JSON");
  }
  if (
    !message ||
    typeof message.id !== "string" ||
    typeof message.token !== "string" ||
    typeof message.command !== "string" ||
    !message.args ||
    Array.isArray(message.args) ||
    typeof message.args !== "object"
  ) {
    throw new SandboxError("CONTROL_MESSAGE_INVALID", "Control message fields are invalid");
  }
  return message;
}
