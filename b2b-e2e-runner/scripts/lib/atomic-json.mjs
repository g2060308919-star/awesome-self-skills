import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export async function writeTextAtomic(file, contents, { validate } = {}) {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    if (validate) validate(await readFile(temporary, "utf8"));
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, file);
    const directoryHandle = await open(directory, "r");
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

export async function writeJsonAtomic(file, value) {
  const serialized = JSON.stringify(value, null, 2) + "\n";
  await writeTextAtomic(file, serialized, { validate: JSON.parse });
}
