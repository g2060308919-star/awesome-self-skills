#!/usr/bin/env node
import { lstat, opendir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sha256File } from "../src/bundle/digests.mjs";
import { SandboxError } from "../src/shared/errors.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const bundleRoot = join(packageRoot, "benchmark", "v1");
const manifestPath = join(bundleRoot, "SHA256SUMS.json");

async function collectJsonFiles(directory, output = []) {
  const entries = [];
  for await (const entry of await opendir(directory)) entries.push(entry);
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      throw new SandboxError("BUNDLE_PATH_UNSAFE", "Digest input cannot contain symbolic links");
    }
    if (metadata.isDirectory()) await collectJsonFiles(path, output);
    else if (metadata.isFile() && entry.name.endsWith(".json") && path !== manifestPath) output.push(path);
  }
  return output;
}

export async function calculateBundleDigests() {
  const result = {};
  for (const path of await collectJsonFiles(bundleRoot)) {
    result[relative(bundleRoot, path)] = await sha256File(path);
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

export async function writeBundleDigests() {
  const digests = await calculateBundleDigests();
  await writeFile(manifestPath, `${JSON.stringify(digests, null, 2)}\n`, { mode: 0o644 });
  return digests;
}

export async function verifyBundleDigests() {
  const expected = JSON.parse(await readFile(manifestPath, "utf8"));
  const actual = await calculateBundleDigests();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new SandboxError("BUNDLE_DIGEST_MISMATCH", "SHA256SUMS.json does not match bundle bytes");
  }
  return actual;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode === "--write") {
    const digests = await writeBundleDigests();
    process.stdout.write(`${JSON.stringify({ ok: true, mode: "write", files: Object.keys(digests).length })}\n`);
  } else if (mode === "--verify") {
    const digests = await verifyBundleDigests();
    process.stdout.write(`${JSON.stringify({ ok: true, mode: "verify", files: Object.keys(digests).length })}\n`);
  } else {
    process.stderr.write("Usage: bundle-digests.mjs --write|--verify\n");
    process.exitCode = 2;
  }
}
