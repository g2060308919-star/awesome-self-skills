import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkInstallConflicts } from "../scripts/check-install-conflicts.mjs";

test("conflict checking reports bundled and installed paths without modifying the profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-conflict-"));
  const pluginRoot = path.join(root, "plugin");
  const profileRoot = path.join(root, "profile");
  for (const name of ["run-prd-e2e", "generate-test-cases", "b2b-e2e-runner"]) {
    await mkdir(path.join(pluginRoot, "skills", name), { recursive: true });
    await writeFile(path.join(pluginRoot, "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: bundled\n---\n`);
  }
  const installed = path.join(profileRoot, "skills", "standalone-generator");
  await mkdir(installed, { recursive: true });
  const installedSkill = `---\nname: generate-test-cases\ndescription: installed\n---\n`;
  await writeFile(path.join(installed, "SKILL.md"), installedSkill);
  const before = await readFile(path.join(installed, "SKILL.md"), "utf8");
  const conflicts = await checkInstallConflicts({ profileRoot, pluginRoot });
  assert.deepEqual(conflicts.map(item => item.name), ["generate-test-cases"]);
  assert.equal(conflicts[0].bundledPath, path.join(pluginRoot, "skills", "generate-test-cases"));
  assert.equal(conflicts[0].installedPath, installed);
  assert.equal(await readFile(path.join(installed, "SKILL.md"), "utf8"), before);
});

test("conflict checking returns empty for a clean profile", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-clean-profile-"));
  const pluginRoot = path.join(root, "plugin");
  await mkdir(path.join(pluginRoot, "skills"), { recursive: true });
  assert.deepEqual(await checkInstallConflicts({ profileRoot: path.join(root, "empty"), pluginRoot }), []);
});
