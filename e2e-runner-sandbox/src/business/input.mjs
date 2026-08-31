import { SandboxError } from "../shared/errors.mjs";

const MAX_BODY_BYTES = 64 * 1024;

export async function readForm(request) {
  const contentType = String(request.headers["content-type"] ?? "");
  if (!contentType.startsWith("application/x-www-form-urlencoded")) {
    throw new SandboxError("CONTENT_TYPE_UNSUPPORTED", "Expected a form submission", {}, 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new SandboxError("REQUEST_TOO_LARGE", "Form submission is too large", {}, 413);
    }
    chunks.push(chunk);
  }
  return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString("utf8")));
}

export function assertSameOrigin(request, origin) {
  const supplied = request.headers.origin;
  if (supplied !== origin) {
    throw new SandboxError("ORIGIN_REJECTED", "Form origin does not match this workspace", {}, 403);
  }
}
