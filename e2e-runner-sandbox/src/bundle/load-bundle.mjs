import { lstat, readFile, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import { SandboxError } from "../shared/errors.mjs";
import { canonicalStringify } from "./canonical-json.mjs";
import { sha256File, sha256Text } from "./digests.mjs";
import { validateBundle } from "./validate-bundle.mjs";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

async function resolveComponentPath(bundleDirectory, relativePath) {
  if (typeof relativePath !== "string" || isAbsolute(relativePath)) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle file path is unsafe");
  }
  const path = resolve(bundleDirectory, relativePath);
  const containment = relative(bundleDirectory, path);
  if (containment.startsWith("..") || isAbsolute(containment)) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle file escapes its version root");
  }
  const metadata = await lstat(path);
  const resolvedPath = await realpath(path);
  if (metadata.isSymbolicLink() || !metadata.isFile() || resolvedPath !== path) {
    throw new SandboxError("BUNDLE_PATH_UNSAFE", "Bundle components must be regular files");
  }
  return path;
}

async function readJson(bundleDirectory, relativePath) {
  return JSON.parse(await readFile(await resolveComponentPath(bundleDirectory, relativePath), "utf8"));
}

function mergeFixture(base, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return structuredClone(base);
  const output = structuredClone(base);
  const apply = (target, patch) => {
    for (const [key, value] of Object.entries(patch)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) {
        throw new SandboxError("BUNDLE_INVALID", "Fixture override contains an unsafe key");
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!target[key] || typeof target[key] !== "object" || Array.isArray(target[key])) target[key] = {};
        apply(target[key], value);
      } else {
        target[key] = structuredClone(value);
      }
    }
  };
  apply(output, overrides);
  return output;
}

async function loadCorpus(bundleDirectory, manifest) {
  if (!manifest.files.profileIndex) {
    return { profiles: manifest.profiles ?? [], executionMatrix: { version: "1", units: [] }, digests: {} };
  }
  const [profileIndex, runnerInputs, oracles, assistance, executionMatrix, digests] = await Promise.all([
    readJson(bundleDirectory, manifest.files.profileIndex),
    readJson(bundleDirectory, manifest.files.runnerInputIndex),
    readJson(bundleDirectory, manifest.files.oracleIndex),
    readJson(bundleDirectory, manifest.files.assistanceIndex),
    readJson(bundleDirectory, manifest.files.executionMatrix),
    readJson(bundleDirectory, manifest.files.digestManifest)
  ]);
  const profiles = [];
  for (const reference of profileIndex.profiles ?? []) {
    const descriptor = await readJson(bundleDirectory, reference.file);
    if (descriptor.profileId !== reference.profileId) {
      throw new SandboxError("BUNDLE_INVALID", "Profile index identifier does not match its file");
    }
    const [fixture, uiVariant, fault] = await Promise.all([
      readJson(bundleDirectory, descriptor.fixtureFile),
      readJson(bundleDirectory, descriptor.uiVariantFile),
      descriptor.faultFile ? readJson(bundleDirectory, descriptor.faultFile) : null
    ]);
    const runnerInput = runnerInputs.entries?.[descriptor.runnerInputKey];
    const oracle = oracles.entries?.[descriptor.oracleKey];
    const assistanceScript = assistance.entries?.[descriptor.assistanceKey];
    if (!runnerInput || !oracle || !assistanceScript) {
      throw new SandboxError("BUNDLE_INVALID", "Profile corpus reference is unresolved");
    }
    const componentPaths = [
      reference.file, descriptor.fixtureFile, descriptor.uiVariantFile,
      descriptor.faultFile, manifest.files.runnerInputIndex, manifest.files.oracleIndex,
      manifest.files.assistanceIndex
    ].filter(Boolean);
    const componentDigests = Object.fromEntries(componentPaths.map((path) => [path, digests[path]]));
    const inputTemplateDigest = sha256Text(canonicalStringify(runnerInput));
    profiles.push({
      ...descriptor,
      fixture: mergeFixture(fixture, descriptor.fixtureOverrides),
      uiVariant: descriptor.uiVariant,
      uiVariantDefinition: uiVariant,
      fault,
      runnerInput,
      inputTemplateDigest,
      oracle: { ...oracle, assistance: assistanceScript, componentDigests, inputTemplateDigest },
      assistance: assistanceScript,
      allowedMutations: oracle.allowedMutations,
      componentDigests
    });
  }
  for (const [relativePath, expected] of Object.entries(digests)) {
    const path = await resolveComponentPath(bundleDirectory, relativePath);
    if (!/^[a-f0-9]{64}$/.test(expected) || await sha256File(path) !== expected) {
      throw new SandboxError("BUNDLE_DIGEST_MISMATCH", "Immutable bundle component digest mismatch", {
        relativePath
      });
    }
  }
  return { profiles, executionMatrix, digests };
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
  const [runnerInput, oracle, snapshot, scoring, hostTraceClassifier, corpus] = await Promise.all([
    readJson(resolvedDirectory, manifest.files.runnerInputContract),
    readJson(resolvedDirectory, manifest.files.oracleContract),
    readJson(resolvedDirectory, manifest.files.snapshotContract),
    readJson(resolvedDirectory, manifest.files.scoring),
    readJson(resolvedDirectory, manifest.files.hostTraceClassifier),
    loadCorpus(resolvedDirectory, manifest)
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
    profiles: corpus.profiles,
    executionMatrix: corpus.executionMatrix,
    digests: corpus.digests
  };
  validateBundle(bundle);
  return deepFreeze(bundle);
}
