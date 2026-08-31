import { randomBytes } from "node:crypto";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  realpath,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

import { SandboxError } from "../shared/errors.mjs";

export async function createRuntimeFiles(options) {
  const parent = options.parentDirectory ?? tmpdir();
  const createdDirectory = await mkdtemp(join(parent, "e2e-runner-sandbox-"));
  const runtimeDirectory = await realpath(createdDirectory);
  await chmod(runtimeDirectory, 0o700);
  const token = randomBytes(32).toString("hex");
  const socketPath = join(runtimeDirectory, "control.sock");
  const capabilityPath = join(runtimeDirectory, "capability");
  const metadataPath = join(runtimeDirectory, "runtime.json");
  await writeFile(capabilityPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(capabilityPath, 0o600);
  await writeFile(
    metadataPath,
    `${JSON.stringify({
      businessUrl: options.businessUrl,
      socketPath,
      protocolVersion: 1
    }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 }
  );
  await chmod(metadataPath, 0o600);
  return {
    runtimeDirectory,
    socketPath,
    capabilityPath,
    metadataPath,
    token
  };
}

export async function readRuntimeFiles(runtimeDirectory) {
  if (!isAbsolute(runtimeDirectory)) {
    throw new SandboxError("RUNTIME_PATH_UNSAFE", "Runtime directory must be absolute");
  }
  const metadata = await lstat(runtimeDirectory);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new SandboxError("RUNTIME_PATH_UNSAFE", "Runtime path must be a real directory");
  }
  const resolvedDirectory = await realpath(runtimeDirectory);
  const capabilityPath = join(resolvedDirectory, "capability");
  const metadataPath = join(resolvedDirectory, "runtime.json");
  for (const path of [capabilityPath, metadataPath]) {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile() || (entry.mode & 0o077) !== 0) {
      throw new SandboxError("RUNTIME_PATH_UNSAFE", "Runtime files must be owner-only regular files");
    }
  }
  const connection = JSON.parse(await readFile(metadataPath, "utf8"));
  if (
    connection.protocolVersion !== 1 ||
    !isAbsolute(connection.socketPath) ||
    relative(resolvedDirectory, connection.socketPath).startsWith("..")
  ) {
    throw new SandboxError("RUNTIME_PATH_UNSAFE", "Runtime metadata is invalid");
  }
  return {
    ...connection,
    runtimeDirectory: resolvedDirectory,
    capabilityPath,
    metadataPath,
    token: (await readFile(capabilityPath, "utf8")).trim()
  };
}
