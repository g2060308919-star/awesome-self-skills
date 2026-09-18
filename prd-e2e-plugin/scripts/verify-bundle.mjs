#!/usr/bin/env node

import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundleFail, computeTreeHash } from "./tree-hash.mjs";
import { readSkillName } from "./vendor-child-skills.mjs";

const NAMES = ["run-prd-e2e", "generate-test-cases", "b2b-e2e-runner"];
const CONTRACTS = {
  generate_test_cases_schema: "4.3.0",
  generate_test_cases_compiler: "0.8.0",
  b2b_runner_input_schema: "2.0"
};

function exactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) bundleFail("BUNDLE_SHAPE", `${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) bundleFail("BUNDLE_SHAPE", `${label} has an invalid closed shape.`);
}

export async function verifyBundle({ pluginRoot, generateTestCasesSource, b2bRunnerSource } = {}) {
  const root = path.resolve(pluginRoot);
  const lockPath = path.join(root, "bundle-lock.json");
  const lockStat = await lstat(lockPath).catch(() => bundleFail("BUNDLE_SHAPE", "bundle-lock.json is missing."));
  if (!lockStat.isFile() || lockStat.isSymbolicLink()) bundleFail("BUNDLE_SHAPE", "bundle-lock.json is unsafe.");
  let lock;
  try {
    lock = JSON.parse(await readFile(lockPath, "utf8"));
  } catch {
    bundleFail("BUNDLE_SHAPE", "bundle-lock.json is invalid JSON.");
  }
  exactKeys(lock, ["schema_version", "plugin", "contracts", "skills"], "bundle lock");
  if (lock.schema_version !== "1.0" || lock.plugin !== "prd-e2e") bundleFail("BUNDLE_SHAPE", "Bundle lock identity is invalid.");
  exactKeys(lock.contracts, Object.keys(CONTRACTS), "bundle contracts");
  if (JSON.stringify(lock.contracts) !== JSON.stringify(CONTRACTS)) bundleFail("BUNDLE_SHAPE", "Bundle contract versions differ from the supported baseline.");
  exactKeys(lock.skills, NAMES, "bundle skills");

  const discovered = (await readdir(path.join(root, "skills"), { withFileTypes: true }))
    .filter(entry => entry.name !== ".DS_Store")
    .map(entry => {
      if (!entry.isDirectory() || entry.isSymbolicLink()) bundleFail("BUNDLE_SHAPE", `Unsafe entry in skills/: ${entry.name}.`);
      return entry.name;
    })
    .sort();
  if (JSON.stringify(discovered) !== JSON.stringify([...NAMES].sort())) bundleFail("BUNDLE_SHAPE", "Plugin must contain exactly the three expected Skill directories.");

  const hashes = {};
  for (const name of NAMES) {
    const entry = lock.skills[name];
    exactKeys(entry, ["path", "source", "tree_sha256"], `lock entry ${name}`);
    if (entry.path !== `skills/${name}` || path.isAbsolute(entry.path) || entry.path.includes("..")) bundleFail("BUNDLE_SHAPE", `Lock path for ${name} is invalid.`);
    const allowedSources = name === "run-prd-e2e" ? ["workspace-build"] : ["validated-installed-snapshot", "validated-repository-snapshot"];
    if (!allowedSources.includes(entry.source) || !/^[a-f0-9]{64}$/.test(entry.tree_sha256)) bundleFail("BUNDLE_SHAPE", `Lock metadata for ${name} is invalid.`);
    const skillRoot = path.join(root, ...entry.path.split("/"));
    if (await readSkillName(skillRoot) !== name) bundleFail("BUNDLE_SHAPE", `Skill name for ${name} is invalid.`);
    hashes[name] = await computeTreeHash(skillRoot);
    if (hashes[name] !== entry.tree_sha256) bundleFail("BUNDLE_DRIFT", `Bundled Skill drift detected: ${name}.`);
  }
  const sourcePairs = [
    ["generate-test-cases", generateTestCasesSource],
    ["b2b-e2e-runner", b2bRunnerSource]
  ];
  for (const [name, source] of sourcePairs) {
    if (source && await computeTreeHash(source) !== hashes[name]) bundleFail("BUNDLE_DRIFT", `Vendored ${name} differs from its validated source snapshot.`);
  }
  return { plugin: lock.plugin, skill_names: [...NAMES], hashes };
}

function flags(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) bundleFail("INPUT_CONTRACT", "Arguments must use --name value pairs.");
    result[argv[index].slice(2)] = argv[index + 1];
  }
  return result;
}

async function main() {
  const input = flags(process.argv.slice(2));
  if (!input["plugin-root"]) bundleFail("INPUT_CONTRACT", "--plugin-root is required.");
  const result = await verifyBundle({
    pluginRoot: input["plugin-root"],
    generateTestCasesSource: input["generate-test-cases"],
    b2bRunnerSource: input["b2b-e2e-runner"]
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (direct) main().catch(error => {
  process.stdout.write(`${JSON.stringify({ error: { code: error?.code ?? "BUNDLE_SHAPE", message: error?.message ?? "Bundle verification failed." } })}\n`);
  process.exitCode = 1;
});
