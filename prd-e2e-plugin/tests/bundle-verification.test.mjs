import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { computeTreeHash } from "../scripts/tree-hash.mjs";
import { verifyBundle } from "../scripts/verify-bundle.mjs";

async function fixture() {
  const pluginRoot = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-verify-"));
  const skills = {};
  for (const name of ["run-prd-e2e", "generate-test-cases", "b2b-e2e-runner"]) {
    const skill = path.join(pluginRoot, "skills", name);
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, "SKILL.md"), `---\nname: ${name}\ndescription: Fixture.\n---\n`);
    skills[name] = {
      path: `skills/${name}`,
      source: name === "run-prd-e2e" ? "workspace-build" : "validated-installed-snapshot",
      tree_sha256: await computeTreeHash(skill)
    };
  }
  const lock = {
    schema_version: "1.0",
    plugin: "prd-e2e",
    contracts: {
      generate_test_cases_schema: "4.2.0",
      generate_test_cases_compiler: "0.7.0",
      b2b_runner_input_schema: "2.0"
    },
    skills
  };
  await writeFile(path.join(pluginRoot, "bundle-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
  return { pluginRoot, lock };
}

test("bundle verification accepts the closed lock and rejects any Skill drift", async () => {
  const { pluginRoot } = await fixture();
  const result = await verifyBundle({ pluginRoot });
  assert.deepEqual(result.skill_names.sort(), ["b2b-e2e-runner", "generate-test-cases", "run-prd-e2e"]);
  await writeFile(path.join(pluginRoot, "skills", "run-prd-e2e", "changed.txt"), "drift");
  await assert.rejects(() => verifyBundle({ pluginRoot }), error => error.code === "BUNDLE_DRIFT");
});

test("bundle verification rejects extra lock keys and absolute paths", async () => {
  const { pluginRoot, lock } = await fixture();
  lock.skills.extra = { path: "/absolute/path", source: "workspace-build", tree_sha256: "a".repeat(64) };
  await writeFile(path.join(pluginRoot, "bundle-lock.json"), `${JSON.stringify(lock)}\n`);
  await assert.rejects(() => verifyBundle({ pluginRoot }), error => error.code === "BUNDLE_SHAPE");
});
