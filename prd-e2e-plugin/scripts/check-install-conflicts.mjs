#!/usr/bin/env node

import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { bundleFail } from "./tree-hash.mjs";

const EXPECTED = ["run-prd-e2e", "generate-test-cases", "b2b-e2e-runner"];

function frontmatterName(text) {
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1];
  if (!frontmatter) return null;
  const names = [...frontmatter.matchAll(/^name:\s*([^\r\n#]+?)\s*$/gm)].map(match => match[1].replace(/^['"]|['"]$/g, ""));
  return names.length === 1 ? names[0] : null;
}

async function findSkills(root, found) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) bundleFail("SKILL_NAME_CONFLICT", `Refusing to inspect symlinked profile entry: ${target}.`);
    if (stat.isDirectory()) {
      await findSkills(target, found);
    } else if (stat.isFile() && entry.name === "SKILL.md") {
      const name = frontmatterName(await readFile(target, "utf8"));
      if (EXPECTED.includes(name)) found.push({ name, root: path.dirname(target) });
    }
  }
}

export async function checkInstallConflicts({ profileRoot, pluginRoot }) {
  const profile = path.resolve(profileRoot);
  const plugin = path.resolve(pluginRoot);
  const found = [];
  await findSkills(profile, found);
  const conflicts = [];
  for (const item of found) {
    const installedPath = await realpath(item.root);
    const bundledPath = path.join(plugin, "skills", item.name);
    const bundledReal = await realpath(bundledPath).catch(() => bundledPath);
    if (installedPath === bundledReal) continue;
    conflicts.push({ name: item.name, bundledPath, installedPath: item.root });
  }
  const order = new Map(EXPECTED.map((name, index) => [name, index]));
  conflicts.sort((left, right) => order.get(left.name) - order.get(right.name) || left.installedPath.localeCompare(right.installedPath));
  return conflicts;
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
  if (!input["profile-root"] || !input["plugin-root"]) bundleFail("INPUT_CONTRACT", "--profile-root and --plugin-root are required.");
  const conflicts = await checkInstallConflicts({ profileRoot: input["profile-root"], pluginRoot: input["plugin-root"] });
  process.stdout.write(`${JSON.stringify({ conflicts })}\n`);
  if (conflicts.length) process.exitCode = 3;
}

const direct = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (direct) main().catch(error => {
  process.stdout.write(`${JSON.stringify({ error: { code: error?.code ?? "SKILL_NAME_CONFLICT", message: error?.message ?? "Conflict check failed." } })}\n`);
  process.exitCode = 1;
});
