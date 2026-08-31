import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256Text(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export async function sha256File(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}
