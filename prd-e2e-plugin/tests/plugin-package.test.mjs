import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listTreeFiles } from "../scripts/tree-hash.mjs";
import { readSkillName } from "../scripts/vendor-child-skills.mjs";
import { verifyBundle } from "../scripts/verify-bundle.mjs";

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(pluginRoot, "..");
const expectedNames = ["run-prd-e2e", "generate-test-cases", "b2b-e2e-runner"];

test("plugin manifest exposes one local install unit with no undeclared component types", async () => {
  const manifest = JSON.parse(await readFile(path.join(pluginRoot, ".codex-plugin", "plugin.json"), "utf8"));
  assert.equal(manifest.name, "prd-e2e");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(typeof manifest.author?.name, "string");
  assert.equal(manifest.author.name.length > 0, true);
  for (const field of ["mcpServers", "apps", "hooks"]) assert.equal(Object.hasOwn(manifest, field), false);
  for (const field of ["composerIcon", "logo", "logoDark", "screenshots"]) assert.equal(Object.hasOwn(manifest.interface, field), false);
});

test("plugin discovers exactly the three expected independent Skill names", async () => {
  const entries = (await readdir(path.join(pluginRoot, "skills"), { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(entries, [...expectedNames].sort());
  const declared = [];
  for (const entry of entries) declared.push(await readSkillName(path.join(pluginRoot, "skills", entry)));
  assert.deepEqual(declared.sort(), [...expectedNames].sort());
  assert.equal(new Set(declared).size, 3);
});

test("bundle lock matches every Skill and both repository source snapshots", async () => {
  const verified = await verifyBundle({
    pluginRoot,
    generateTestCasesSource: path.join(repositoryRoot, "generate-test-cases"),
    b2bRunnerSource: path.join(repositoryRoot, "b2b-e2e-runner")
  });
  assert.deepEqual(verified.skill_names.sort(), [...expectedNames].sort());
});

test("plugin tree has no scaffold placeholders, development-machine paths, secret files, or unsafe entries", async () => {
  const { root, files } = await listTreeFiles(pluginRoot);
  const forbiddenFile = /(?:^|\/)(?:\.env(?:\..*)?|id_rsa|id_ed25519|[^/]+\.(?:pem|key|p12|pfx))$/i;
  const developerPath = ["", "Users", "zhangxudong"].join("/");
  for (const relative of files) {
    assert.equal(forbiddenFile.test(relative), false, relative);
    const contents = await readFile(path.join(root, ...relative.split("/")));
    if (contents.includes(0)) continue;
    const text = contents.toString("utf8");
    assert.equal(text.includes("[" + "TODO:"), false, relative);
    assert.equal(text.includes(developerPath), false, relative);
  }
});

test("the install smoke record exists and explicitly remains unexecuted without authorization", async () => {
  const smoke = path.join(pluginRoot, "tests", "install-smoke.md");
  await access(smoke);
  const text = await readFile(smoke, "utf8");
  assert.match(text, /NOT EXECUTED/);
  assert.match(text, /separate user authorization/i);
  assert.match(text, /\.invalid/);
  assert.match(text, /stage=intake/);
  assert.match(text, /next_action=start_case_generation/);
});
