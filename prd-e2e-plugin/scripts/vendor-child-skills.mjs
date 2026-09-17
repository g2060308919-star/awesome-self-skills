#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { copyFile, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { bundleFail, computeTreeHash, listTreeFiles } from "./tree-hash.mjs";

const CHILDREN = ["generate-test-cases", "b2b-e2e-runner"];
const CONTRACTS = Object.freeze({
  generate_test_cases_schema: "4.2.0",
  generate_test_cases_compiler: "0.7.0",
  b2b_runner_input_schema: "2.0"
});

export async function readSkillName(skillRoot) {
  const text = await readFile(path.join(skillRoot, "SKILL.md"), "utf8").catch(() => bundleFail("BUNDLE_SHAPE", "Skill snapshot has no readable SKILL.md."));
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) bundleFail("BUNDLE_SHAPE", "SKILL.md frontmatter is invalid.");
  const names = [...match[1].matchAll(/^name:\s*([^\r\n#]+?)\s*$/gm)].map(item => item[1].replace(/^['"]|['"]$/g, ""));
  if (names.length !== 1 || !names[0]) bundleFail("BUNDLE_SHAPE", "SKILL.md must declare exactly one name.");
  return names[0];
}

async function copyTree(source, destination) {
  const { root, files } = await listTreeFiles(source);
  await mkdir(destination, { recursive: false, mode: 0o700 });
  for (const relative of files) {
    const target = path.join(destination, ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(path.join(root, ...relative.split("/")), target);
  }
}

async function validateGeneratorContract(source) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(source, "scripts", "schema-manifest.json"), "utf8"));
  } catch {
    bundleFail("BUNDLE_SHAPE", "Generator source has no valid schema manifest.");
  }
  if (manifest?.schema_version !== CONTRACTS.generate_test_cases_schema || manifest?.compiler_version !== CONTRACTS.generate_test_cases_compiler) {
    bundleFail("BUNDLE_SHAPE", "Generator source contract differs from 4.2.0 / 0.7.0.");
  }
  if (!Array.isArray(manifest.schemas)) bundleFail("BUNDLE_SHAPE", "Generator schema manifest has an invalid schema registry.");
}

async function validateRunnerContract(source) {
  let validateTestCases;
  try {
    ({ validateTestCases } = await import(pathToFileURL(path.join(source, "scripts", "lib", "contracts.mjs"))));
  } catch {
    bundleFail("BUNDLE_SHAPE", "Runner source has no importable input validator.");
  }
  if (typeof validateTestCases !== "function") bundleFail("BUNDLE_SHAPE", "Runner source does not export validateTestCases.");
  const fixture = {
    schema_version: CONTRACTS.b2b_runner_input_schema,
    suite: { name: "Contract probe", target_urls: ["https://contract.example.invalid/"] },
    cases: [{
      case_id: "CONTRACT-CASE",
      module: "Contract",
      title: "Contract probe",
      preconditions: [],
      steps: [{ step_id: "STEP-1", action: "Probe", expected: [{ oracle_id: "ORACLE-1", text: "Expected" }] }]
    }]
  };
  try {
    validateTestCases(fixture);
  } catch {
    bundleFail("BUNDLE_SHAPE", "Runner source rejects the required input schema 2.0.");
  }
  let rejectedOld = false;
  try {
    validateTestCases({ ...fixture, schema_version: "1.0" });
  } catch {
    rejectedOld = true;
  }
  if (!rejectedOld) bundleFail("BUNDLE_SHAPE", "Runner source does not enforce input schema 2.0.");
}

async function atomicWriteJson(filePath, value) {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, filePath);
  const directory = await open(path.dirname(filePath), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function replaceTarget(skillsRoot, name, source) {
  if (await readSkillName(source) !== name) bundleFail("BUNDLE_SHAPE", `Source Skill name does not match ${name}.`);
  const token = `${process.pid}-${randomBytes(6).toString("hex")}`;
  const staged = path.join(skillsRoot, `.${name}.vendor-${token}`);
  const backup = path.join(skillsRoot, `.${name}.backup-${token}`);
  const target = path.join(skillsRoot, name);
  await copyTree(source, staged);
  const sourceHash = await computeTreeHash(source);
  if (await computeTreeHash(staged) !== sourceHash) bundleFail("BUNDLE_DRIFT", `Staged ${name} snapshot differs from its source.`);
  let hadTarget = false;
  try {
    await rename(target, backup);
    hadTarget = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  try {
    await rename(staged, target);
  } catch (error) {
    if (hadTarget) await rename(backup, target).catch(() => {});
    throw error;
  }
  if (hadTarget) await rm(backup, { recursive: true, force: true });
  return { target, hash: sourceHash };
}

export async function vendorChildSkills({ pluginRoot, generateTestCasesSource, b2bRunnerSource }) {
  const root = path.resolve(pluginRoot);
  const skillsRoot = path.join(root, "skills");
  await mkdir(skillsRoot, { recursive: true });
  const sources = {
    "generate-test-cases": path.resolve(generateTestCasesSource),
    "b2b-e2e-runner": path.resolve(b2bRunnerSource)
  };
  for (const name of CHILDREN) {
    if (await readSkillName(sources[name]) !== name) bundleFail("BUNDLE_SHAPE", `Source Skill name does not match ${name}.`);
  }
  await validateGeneratorContract(sources["generate-test-cases"]);
  await validateRunnerContract(sources["b2b-e2e-runner"]);
  const results = {};
  for (const name of CHILDREN) results[name] = await replaceTarget(skillsRoot, name, sources[name]);
  const runSkill = path.join(skillsRoot, "run-prd-e2e");
  if (await readSkillName(runSkill) !== "run-prd-e2e") bundleFail("BUNDLE_SHAPE", "Orchestration Skill name is invalid.");

  const lock = {
    schema_version: "1.0",
    plugin: "prd-e2e",
    contracts: { ...CONTRACTS },
    skills: {
      "run-prd-e2e": { path: "skills/run-prd-e2e", source: "workspace-build", tree_sha256: await computeTreeHash(runSkill) },
      "generate-test-cases": { path: "skills/generate-test-cases", source: "validated-installed-snapshot", tree_sha256: results["generate-test-cases"].hash },
      "b2b-e2e-runner": { path: "skills/b2b-e2e-runner", source: "validated-installed-snapshot", tree_sha256: results["b2b-e2e-runner"].hash }
    }
  };
  await atomicWriteJson(path.join(root, "bundle-lock.json"), lock);
  return lock;
}

function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith("--") || argv[index + 1] === undefined) bundleFail("INPUT_CONTRACT", "Arguments must use --name value pairs.");
    flags[argv[index].slice(2)] = argv[index + 1];
  }
  return flags;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (!flags["plugin-root"] || !flags["generate-test-cases"] || !flags["b2b-e2e-runner"]) {
    bundleFail("INPUT_CONTRACT", "Required flags: --plugin-root, --generate-test-cases, --b2b-e2e-runner.");
  }
  const lock = await vendorChildSkills({
    pluginRoot: flags["plugin-root"],
    generateTestCasesSource: flags["generate-test-cases"],
    b2bRunnerSource: flags["b2b-e2e-runner"]
  });
  process.stdout.write(`${JSON.stringify(lock)}\n`);
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (direct) main().catch(error => {
  process.stdout.write(`${JSON.stringify({ error: { code: error?.code ?? "BUNDLE_SHAPE", message: error?.message ?? "Vendoring failed." } })}\n`);
  process.exitCode = 1;
});
