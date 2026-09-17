import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { computeTreeHash } from "../scripts/tree-hash.mjs";
import { vendorChildSkills } from "../scripts/vendor-child-skills.mjs";

async function makeSkill(root, name, files = {}) {
  const skill = path.join(root, name);
  await mkdir(skill, { recursive: true });
  await writeFile(path.join(skill, "SKILL.md"), `---\nname: ${name}\ndescription: Test fixture.\n---\n\n# ${name}\n`);
  if (name === "generate-test-cases") {
    await mkdir(path.join(skill, "scripts"), { recursive: true });
    await writeFile(path.join(skill, "scripts", "schema-manifest.json"), `${JSON.stringify({
      schema_version: "4.2.0",
      compiler_version: "0.7.0",
      schemas: []
    })}\n`);
  }
  if (name === "b2b-e2e-runner") {
    await mkdir(path.join(skill, "scripts", "lib"), { recursive: true });
    await writeFile(path.join(skill, "scripts", "lib", "contracts.mjs"), [
      "export function validateTestCases(input) {",
      "  if (input?.schema_version !== '2.0') throw new Error('schema');",
      "  return input;",
      "}",
      ""
    ].join("\n"));
  }
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(skill, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  return skill;
}

test("tree hash uses content and POSIX byte order while ignoring .DS_Store", async () => {
  const left = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-tree-left-"));
  const right = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-tree-right-"));
  await writeFile(path.join(left, "b.txt"), "B");
  await writeFile(path.join(left, "a.txt"), "A");
  await writeFile(path.join(left, ".DS_Store"), "ignored-left");
  await writeFile(path.join(right, "a.txt"), "A");
  await writeFile(path.join(right, "b.txt"), "B");
  await writeFile(path.join(right, ".DS_Store"), "ignored-right");
  assert.equal(await computeTreeHash(left), await computeTreeHash(right));
  await writeFile(path.join(right, "b.txt"), "changed");
  assert.notEqual(await computeTreeHash(left), await computeTreeHash(right));
});

test("tree hash rejects symlinks and nested git metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-tree-unsafe-"));
  await writeFile(path.join(root, "file"), "value");
  await symlink(path.join(root, "file"), path.join(root, "link"));
  await assert.rejects(() => computeTreeHash(root), error => error.code === "BUNDLE_SHAPE");
  const gitRoot = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-tree-git-"));
  await mkdir(path.join(gitRoot, "nested", ".git"), { recursive: true });
  await assert.rejects(() => computeTreeHash(gitRoot), error => error.code === "BUNDLE_SHAPE");
});

test("tree hash rejects a symlink used as the snapshot root", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tree-root-symlink-"));
  const actual = path.join(root, "actual");
  const linked = path.join(root, "linked");
  await mkdir(actual);
  await writeFile(path.join(actual, "SKILL.md"), "bytes");
  await symlink(actual, linked);
  await assert.rejects(() => computeTreeHash(linked), error => error.code === "BUNDLE_SHAPE");
});

test("vendoring replaces only the two named targets byte-for-byte and writes a closed lock", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-vendor-"));
  const pluginRoot = path.join(root, "prd-e2e-plugin");
  const sources = path.join(root, "sources");
  await mkdir(path.join(pluginRoot, "skills", "run-prd-e2e"), { recursive: true });
  await writeFile(path.join(pluginRoot, "skills", "run-prd-e2e", "SKILL.md"), "---\nname: run-prd-e2e\ndescription: Orchestrator.\n---\n");
  await mkdir(path.join(pluginRoot, "skills", "sentinel"), { recursive: true });
  await writeFile(path.join(pluginRoot, "skills", "sentinel", "keep.txt"), "keep");
  const generator = await makeSkill(sources, "generate-test-cases", { "scripts/raw.bin": Buffer.from([0, 1, 2, 255]) });
  const runner = await makeSkill(sources, "b2b-e2e-runner", { "references/note.md": "runner\n" });
  await makeSkill(path.join(pluginRoot, "skills"), "generate-test-cases", { "old.txt": "old" });
  const lock = await vendorChildSkills({ pluginRoot, generateTestCasesSource: generator, b2bRunnerSource: runner });
  assert.equal(await readFile(path.join(pluginRoot, "skills", "sentinel", "keep.txt"), "utf8"), "keep");
  assert.deepEqual(await readFile(path.join(pluginRoot, "skills", "generate-test-cases", "scripts/raw.bin")), Buffer.from([0, 1, 2, 255]));
  assert.equal(lock.plugin, "prd-e2e");
  assert.deepEqual(Object.keys(lock.skills).sort(), ["b2b-e2e-runner", "generate-test-cases", "run-prd-e2e"]);
  assert.equal(JSON.stringify(lock).includes(root), false);
  assert.equal(lock.skills["generate-test-cases"].tree_sha256, await computeTreeHash(generator));
  assert.equal(lock.skills["b2b-e2e-runner"].tree_sha256, await computeTreeHash(runner));
});

test("vendoring rejects a child whose frontmatter name does not match the target", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-vendor-name-"));
  const pluginRoot = path.join(root, "plugin");
  await mkdir(path.join(pluginRoot, "skills", "run-prd-e2e"), { recursive: true });
  await writeFile(path.join(pluginRoot, "skills", "run-prd-e2e", "SKILL.md"), "---\nname: run-prd-e2e\ndescription: x\n---\n");
  const generator = await makeSkill(path.join(root, "sources"), "generate-test-cases");
  const runner = await makeSkill(path.join(root, "sources"), "wrong-runner");
  await assert.rejects(
    () => vendorChildSkills({ pluginRoot, generateTestCasesSource: generator, b2bRunnerSource: runner }),
    error => error.code === "BUNDLE_SHAPE"
  );
});

test("vendoring rejects source snapshots whose public contracts differ from the locked baseline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-vendor-contract-"));
  const pluginRoot = path.join(root, "plugin");
  await mkdir(path.join(pluginRoot, "skills", "run-prd-e2e"), { recursive: true });
  await writeFile(path.join(pluginRoot, "skills", "run-prd-e2e", "SKILL.md"), "---\nname: run-prd-e2e\ndescription: x\n---\n");
  const generator = await makeSkill(path.join(root, "sources"), "generate-test-cases");
  const runner = await makeSkill(path.join(root, "sources"), "b2b-e2e-runner");
  await writeFile(path.join(generator, "scripts", "schema-manifest.json"), `${JSON.stringify({
    schema_version: "4.1.0",
    compiler_version: "0.7.0",
    schemas: []
  })}\n`);
  await assert.rejects(
    () => vendorChildSkills({ pluginRoot, generateTestCasesSource: generator, b2bRunnerSource: runner }),
    error => error.code === "BUNDLE_SHAPE"
  );
});
