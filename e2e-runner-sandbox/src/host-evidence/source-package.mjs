import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile
} from "node:fs/promises";
import { basename, isAbsolute, join, resolve } from "node:path";

import { canonicalStringify } from "../bundle/canonical-json.mjs";
import { sha256File, sha256Text } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";
import {
  CODEX_ADAPTER,
  HOST_EXPORTER,
  HOST_SOURCE_PACKAGE_SCHEMA_VERSION,
  HOST_TRUST_LEVELS
} from "./contracts.mjs";

const MAX_SOURCE_BYTES = 64 * 1024 * 1024;

function digest(value) {
  return `sha256:${sha256Text(typeof value === "string" ? value : canonicalStringify(value))}`;
}

function fail(code, message) {
  throw new SandboxError(code, message);
}

async function assertOwnerOnlyFile(path) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || (metadata.mode & 0o077) !== 0) {
    fail("HOST_EXPORT_INTEGRITY_FAILED", "Host export files must be owner-only regular files");
  }
  return metadata;
}

function sourceBoundary(text) {
  const timestamps = [];
  const sessionIds = [];
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    try {
      const record = JSON.parse(line);
      const timestampMs = Date.parse(record.timestamp);
      if (Number.isFinite(timestampMs)) timestamps.push(timestampMs);
      if (record.type === "session_meta" && typeof record.payload?.id === "string") {
        sessionIds.push(record.payload.id);
      }
    } catch {
      // Format validation belongs to the adapter; the package still records file integrity.
    }
  }
  const uniqueSessionIds = [...new Set(sessionIds)];
  return {
    startTimestampMs: timestamps.length > 0 ? Math.min(...timestamps) : null,
    endTimestampMs: timestamps.length > 0 ? Math.max(...timestamps) : null,
    sourceRecordCount: text.split(/\r?\n/).filter(Boolean).length,
    sessionDigest: digest(uniqueSessionIds.length === 1 ? uniqueSessionIds[0] : text)
  };
}

export async function createCodexSourcePackage(options) {
  if (options.authorization?.explicit !== true ||
    typeof options.authorization.actor !== "string" ||
    !Number.isFinite(Date.parse(options.authorization.authorizedAt))) {
    fail("HOST_EXPORT_UNAUTHORIZED", "A Host export requires explicit, attributable authorization");
  }
  if (!HOST_TRUST_LEVELS.includes(options.trustLevel)) {
    fail("HOST_EXPORT_UNSUPPORTED", "Host export trust level is unsupported");
  }
  const sourceMetadata = await lstat(options.sourcePath);
  if (sourceMetadata.isSymbolicLink() || !sourceMetadata.isFile() || sourceMetadata.size > MAX_SOURCE_BYTES) {
    fail("HOST_EXPORT_UNSUPPORTED", "Codex source must be one bounded regular JSONL file");
  }
  const sourceText = await readFile(options.sourcePath, "utf8");
  const boundary = sourceBoundary(sourceText);
  const originalSourceSha256 = await sha256File(options.sourcePath);
  const outputDirectory = resolve(options.outputDirectory);
  try {
    await mkdir(outputDirectory, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = await readHostSourcePackage(outputDirectory);
    if (existing.manifest.trustLevel !== options.trustLevel ||
      canonicalStringify(existing.manifest.authorization) !== canonicalStringify(options.authorization) ||
      existing.manifest.files[0].sha256 !== originalSourceSha256) {
      fail("HOST_EXPORT_INTEGRITY_FAILED", "Existing Host source package has different inputs");
    }
    return {
      packageDirectory: existing.packageDirectory,
      manifestPath: existing.manifestPath,
      sourcePath: existing.sourcePath,
      manifest: existing.manifest
    };
  }
  await chmod(outputDirectory, 0o700);
  const packageDirectory = await realpath(outputDirectory);
  const sourceFile = "session-rollout.jsonl";
  const sourcePath = join(packageDirectory, sourceFile);
  await copyFile(options.sourcePath, sourcePath);
  await chmod(sourcePath, 0o600);
  const fileSha256 = await sha256File(sourcePath);
  const manifestBase = {
    schemaVersion: HOST_SOURCE_PACKAGE_SCHEMA_VERSION,
    format: CODEX_ADAPTER.format,
    formatVersion: CODEX_ADAPTER.formatVersion,
    exporter: HOST_EXPORTER,
    authorization: structuredClone(options.authorization),
    trustLevel: options.trustLevel,
    sessionDigest: boundary.sessionDigest,
    sessionBoundary: {
      startTimestampMs: boundary.startTimestampMs,
      endTimestampMs: boundary.endTimestampMs,
      sourceRecordCount: boundary.sourceRecordCount
    },
    files: [{ path: sourceFile, sha256: fileSha256, bytes: sourceMetadata.size }]
  };
  const manifest = {
    ...manifestBase,
    sourceManifestDigest: digest(manifestBase)
  };
  const manifestPath = join(packageDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600
  });
  await chmod(manifestPath, 0o600);
  return { packageDirectory, manifestPath, sourcePath, manifest };
}

export async function readHostSourcePackage(packageDirectoryInput) {
  const input = String(packageDirectoryInput);
  if (!isAbsolute(input)) {
    fail("HOST_EXPORT_INTEGRITY_FAILED", "Host source package path must be absolute");
  }
  const directoryMetadata = await lstat(input);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory() ||
    (directoryMetadata.mode & 0o077) !== 0) {
    fail("HOST_EXPORT_INTEGRITY_FAILED", "Host source package must be an owner-only real directory");
  }
  const packageDirectory = await realpath(input);
  const manifestPath = join(packageDirectory, "manifest.json");
  await assertOwnerOnlyFile(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    fail("HOST_EXPORT_INTEGRITY_FAILED", "Host source manifest must be readable JSON");
  }
  const { sourceManifestDigest, ...manifestBase } = manifest;
  if (manifest.schemaVersion !== HOST_SOURCE_PACKAGE_SCHEMA_VERSION ||
    sourceManifestDigest !== digest(manifestBase) ||
    manifest.format !== CODEX_ADAPTER.format ||
    manifest.formatVersion !== CODEX_ADAPTER.formatVersion ||
    manifest.authorization?.explicit !== true ||
    !HOST_TRUST_LEVELS.includes(manifest.trustLevel) ||
    !Array.isArray(manifest.files) || manifest.files.length !== 1) {
    fail("HOST_EXPORT_INTEGRITY_FAILED", "Host source manifest is invalid or modified");
  }
  const entry = manifest.files[0];
  if (entry.path !== basename(entry.path) || entry.path !== "session-rollout.jsonl") {
    fail("HOST_EXPORT_INTEGRITY_FAILED", "Host source file path is unsafe");
  }
  const sourcePath = join(packageDirectory, entry.path);
  const metadata = await assertOwnerOnlyFile(sourcePath);
  if (metadata.size !== entry.bytes || await sha256File(sourcePath) !== entry.sha256) {
    fail("HOST_EXPORT_INTEGRITY_FAILED", "Host source file digest or size changed");
  }
  return { packageDirectory, manifestPath, sourcePath, manifest };
}
