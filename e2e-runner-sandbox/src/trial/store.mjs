import { randomUUID } from "node:crypto";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";

function fail(code, message) {
  throw new SandboxError(code, message);
}

function safeId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) {
    fail("TRIAL_STATE_INVALID", "Trial identifier is unsafe");
  }
  return value;
}

function withDigest(manifest) {
  const { manifestDigest: ignored, ...rawBody } = manifest;
  const body = JSON.parse(JSON.stringify(rawBody));
  return { ...body, manifestDigest: `sha256:${sha256Text(canonicalStringify(body))}` };
}

function verifyDigest(manifest) {
  const expected = withDigest(manifest).manifestDigest;
  if (manifest.manifestDigest !== expected) {
    fail("TRIAL_INPUT_CHANGED", "Trial manifest digest does not match its contents");
  }
}

export async function createTrialStore(options) {
  if (!isAbsolute(options.root)) fail("TRIAL_STATE_INVALID", "Trial store root must be absolute");
  const requestedRoot = resolve(options.root);
  await mkdir(requestedRoot, { recursive: true, mode: 0o700 });
  const rootMetadata = await lstat(requestedRoot);
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    fail("TRIAL_STATE_INVALID", "Trial store root must be a real directory");
  }
  await chmod(requestedRoot, 0o700);
  const root = await realpath(requestedRoot);

  function paths(trialIdInput) {
    const trialId = safeId(trialIdInput);
    const trialDirectory = join(root, trialId);
    return {
      trialDirectory,
      manifestPath: join(trialDirectory, "trial-manifest.json"),
      lockPath: join(trialDirectory, ".trial.lock")
    };
  }

  async function assertManifestFile(path) {
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) {
      fail("TRIAL_INPUT_CHANGED", "Trial manifest must be an owner-only regular file");
    }
  }

  async function read(trialId) {
    const { manifestPath } = paths(trialId);
    await assertManifestFile(manifestPath);
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      fail("TRIAL_INPUT_CHANGED", "Trial manifest is not readable JSON");
    }
    if (manifest.trialId !== trialId || manifest.schemaVersion !== "trial-manifest-v1") {
      fail("TRIAL_INPUT_CHANGED", "Trial manifest identity is invalid");
    }
    verifyDigest(manifest);
    return structuredClone(manifest);
  }

  async function writeAtomic(trialId, manifest) {
    const { trialDirectory, manifestPath } = paths(trialId);
    const value = withDigest(manifest);
    const temporaryPath = join(trialDirectory, `.manifest-${randomUUID()}.tmp`);
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, manifestPath);
    await chmod(manifestPath, 0o600);
    return structuredClone(value);
  }

  async function create(manifest) {
    safeId(manifest.trialId);
    const { trialDirectory } = paths(manifest.trialId);
    try {
      await mkdir(trialDirectory, { recursive: false, mode: 0o700 });
    } catch (error) {
      if (error.code === "EEXIST") fail("TRIAL_STATE_INVALID", "Trial already exists");
      throw error;
    }
    await chmod(trialDirectory, 0o700);
    return writeAtomic(manifest.trialId, manifest);
  }

  function processIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return true;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error.code !== "ESRCH";
    }
  }

  async function acquireLock(lockPath) {
    try {
      return await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let prior;
      try {
        prior = JSON.parse(await readFile(lockPath, "utf8"));
      } catch {
        fail("TRIAL_STATE_INVALID", "Trial lock is unreadable and requires operator review");
      }
      if (processIsAlive(prior.pid)) {
        fail("TRIAL_STATE_INVALID", "Trial is locked by another operation");
      }
      await rm(lockPath, { force: true });
      try {
        return await open(lockPath, "wx", 0o600);
      } catch (retryError) {
        if (retryError.code === "EEXIST") fail("TRIAL_STATE_INVALID", "Trial lock was acquired concurrently");
        throw retryError;
      }
    }
  }

  async function transact(trialId, expectedRevision, action) {
    const { lockPath } = paths(trialId);
    let lock = await acquireLock(lockPath);
    try {
      await lock.writeFile(`${JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString() })}\n`);
      await lock.close();
      lock = null;
      const current = await read(trialId);
      if (current.revision !== expectedRevision) {
        fail("TRIAL_STATE_INVALID", "Trial revision changed before this operation");
      }
      const next = await action(structuredClone(current));
      if (!next || next.trialId !== trialId || next.revision !== current.revision + 1) {
        fail("TRIAL_STATE_INVALID", "Trial transaction must produce exactly one new revision");
      }
      return await writeAtomic(trialId, next);
    } finally {
      await lock?.close();
      await rm(lockPath, { force: true });
    }
  }

  return Object.freeze({ root, paths, create, read, transact });
}
