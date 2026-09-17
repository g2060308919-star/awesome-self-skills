import { randomBytes } from "node:crypto";
import { open, rename } from "node:fs/promises";
import path from "node:path";

export async function atomicWriteText(filePath, body) {
  const directory = path.dirname(filePath);
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(body, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, filePath);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
  return { path: filePath, bytes: Buffer.byteLength(body), text: body };
}

export async function atomicWriteJson(filePath, value) {
  return atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
