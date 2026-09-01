import { lstat, opendir, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { sha256File } from "../bundle/digests.mjs";
import { SandboxError } from "../shared/errors.mjs";

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_ARTIFACT_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_EVIDENCE_ENTRIES = 1000;
const MAX_EVIDENCE_DEPTH = 20;
const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

function extension(path) {
  const index = path.lastIndexOf(".");
  return index < 0 ? "" : path.slice(index).toLowerCase();
}

async function readUtf8(path, label) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  } catch {
    throw new SandboxError("ARTIFACT_INVALID", `${label} must be valid UTF-8`);
  }
}

async function safePath(root, relativePath, expectedKind) {
  const path = resolve(root, relativePath);
  const containment = relative(root, path);
  if (isAbsolute(containment) || containment.startsWith("..")) {
    throw new SandboxError("ARTIFACT_PATH_UNSAFE", "Artifact path escapes its root");
  }
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new SandboxError("ARTIFACT_INVALID", `Required artifact is missing: ${relativePath}`);
  }
  const resolvedPath = await realpath(path);
  if (
    metadata.isSymbolicLink() || resolvedPath !== path ||
    (expectedKind === "file" && !metadata.isFile()) ||
    (expectedKind === "directory" && !metadata.isDirectory())
  ) {
    throw new SandboxError("ARTIFACT_PATH_UNSAFE", "Artifacts must be real contained files and directories");
  }
  if (metadata.size > MAX_ARTIFACT_BYTES) {
    throw new SandboxError("ARTIFACT_INVALID", "Artifact exceeds the 10 MiB limit");
  }
  return { path, metadata };
}

async function readEvidence(root, directory, output, limits, depth = 0) {
  if (depth > MAX_EVIDENCE_DEPTH) {
    throw new SandboxError("ARTIFACT_INVALID", "Evidence directory exceeds the nesting limit");
  }
  const entries = [];
  for await (const entry of await opendir(directory)) entries.push(entry);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name === ".gitkeep") continue;
    limits.entries += 1;
    if (limits.entries > MAX_EVIDENCE_ENTRIES) {
      throw new SandboxError("ARTIFACT_INVALID", "Evidence directory exceeds the entry limit");
    }
    const path = join(directory, entry.name);
    const relativePath = relative(root, path);
    const checked = await safePath(root, relativePath, entry.isDirectory() ? "directory" : "file");
    if (entry.isDirectory()) {
      await readEvidence(root, checked.path, output, limits, depth + 1);
      continue;
    }
    limits.totalBytes += checked.metadata.size;
    if (limits.totalBytes > MAX_ARTIFACT_TOTAL_BYTES) {
      throw new SandboxError("ARTIFACT_INVALID", "Artifacts exceed the aggregate size limit");
    }
    const fileExtension = extension(entry.name);
    if (!TEXT_EXTENSIONS.has(fileExtension) && !IMAGE_EXTENSIONS.has(fileExtension)) {
      throw new SandboxError("ARTIFACT_INVALID", `Unsupported evidence format: ${relativePath}`);
    }
    const item = {
      relativePath,
      absolutePath: checked.path,
      kind: IMAGE_EXTENSIONS.has(fileExtension) ? "image" : "text",
      digest: await sha256File(checked.path)
    };
    if (item.kind === "text") {
      item.text = await readUtf8(checked.path, relativePath);
      if (fileExtension === ".json") {
        try {
          item.json = JSON.parse(item.text);
        } catch {
          throw new SandboxError("ARTIFACT_INVALID", `Evidence JSON is malformed: ${relativePath}`);
        }
      }
    }
    output.push(item);
  }
}

function evidenceReferences(executionLog) {
  return (executionLog.cases ?? []).flatMap((caseEntry) =>
    (caseEntry.assertions ?? []).flatMap((assertion) => assertion.evidence ?? [])
  );
}

export async function readArtifacts(rootPath) {
  if (!isAbsolute(rootPath)) {
    throw new SandboxError("ARTIFACT_PATH_UNSAFE", "Artifact root must be absolute");
  }
  const normalizedRoot = resolve(rootPath);
  let rootMetadata;
  try {
    rootMetadata = await lstat(normalizedRoot);
  } catch {
    throw new SandboxError("ARTIFACT_INVALID", "Artifact root is missing");
  }
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
    throw new SandboxError("ARTIFACT_PATH_UNSAFE", "Artifact root must be a real directory");
  }
  const root = await realpath(normalizedRoot);
  const reportFile = await safePath(root, "report.md", "file");
  const logFile = await safePath(root, "execution-log.json", "file");
  const reportPath = reportFile.path;
  const logPath = logFile.path;
  const evidencePath = (await safePath(root, "evidence", "directory")).path;
  const report = await readUtf8(reportPath, "report.md");
  let executionLog;
  try {
    executionLog = JSON.parse(await readUtf8(logPath, "execution-log.json"));
  } catch {
    throw new SandboxError("ARTIFACT_INVALID", "execution-log.json must contain valid JSON");
  }
  if (!executionLog || !Array.isArray(executionLog.cases)) {
    throw new SandboxError("ARTIFACT_INVALID", "execution-log.json cases are required");
  }
  const evidence = [];
  await readEvidence(root, evidencePath, evidence, {
    entries: 0,
    totalBytes: reportFile.metadata.size + logFile.metadata.size
  });
  const paths = new Set(evidence.map(({ relativePath }) => relativePath));
  for (const reference of evidenceReferences(executionLog)) {
    if (typeof reference !== "string" || !reference.startsWith("evidence/") || !paths.has(reference)) {
      throw new SandboxError("ARTIFACT_INVALID", `Evidence reference is unresolved: ${reference}`);
    }
  }
  return Object.freeze({
    root,
    report,
    executionLog,
    evidence,
    digests: {
      report: await sha256File(reportPath),
      executionLog: await sha256File(logPath),
      evidence: Object.fromEntries(evidence.map((item) => [item.relativePath, item.digest]))
    }
  });
}
