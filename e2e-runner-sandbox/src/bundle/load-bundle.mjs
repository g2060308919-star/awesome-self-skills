import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { SandboxError } from "../shared/errors.mjs";
import { validateBundle } from "./validate-bundle.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

async function readJson(bundleDirectory, relativePath) {
  if (typeof relativePath !== "string" || isAbsolute(relativePath)) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle file path is unsafe");
  }
  const path = resolve(bundleDirectory, relativePath);
  const containment = relative(bundleDirectory, path);
  if (containment.startsWith("..") || isAbsolute(containment)) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle file escapes its version root");
  }
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle components must be regular files");
  }
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadBundle(root, version) {
  if (typeof version !== "string" || !/^v[1-9][0-9]*$/.test(version)) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle version is unsafe");
  }
  const rootPath = await realpath(root);
  const bundleDirectory = join(rootPath, version);
  const directoryMetadata = await lstat(bundleDirectory);
  if (directoryMetadata.isSymbolicLink() || !directoryMetadata.isDirectory()) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle version must be a real directory");
  }
  const resolvedDirectory = await realpath(bundleDirectory);
  if (relative(rootPath, resolvedDirectory).startsWith("..")) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle version escapes benchmark root");
  }

  const manifest = await readJson(resolvedDirectory, "bundle.json");
  const [runnerInput, oracle, snapshot, scoring, hostTraceClassifier] = await Promise.all([
    readJson(resolvedDirectory, manifest.files.runnerInputContract),
    readJson(resolvedDirectory, manifest.files.oracleContract),
    readJson(resolvedDirectory, manifest.files.snapshotContract),
    readJson(resolvedDirectory, manifest.files.scoring),
    readJson(resolvedDirectory, manifest.files.hostTraceClassifier)
  ]);

  const bundle = {
    ...manifest,
    contracts: {
      runnerInput,
      oracle,
      snapshot,
      eventTypes: oracle.eventTypes,
      attributionClasses: oracle.attributionClasses,
      assertionStates: oracle.assertionStates,
      caseVerdicts: oracle.caseVerdicts
    },
    scoring,
    hostTraceClassifier,
    profiles: manifest.profiles ?? []
  };
  validateBundle(bundle);
  return deepFreeze(bundle);
}
