import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as vendor from "../scripts/vendor-child-skills.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "prd-source-snapshot-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const repositoryRoot = path.join(root, "repo");
  await mkdir(path.join(repositoryRoot, "b2b-e2e-runner"), { recursive: true });
  await writeFile(path.join(repositoryRoot, ".gitignore"), "node_modules/\n");
  await writeFile(path.join(repositoryRoot, "b2b-e2e-runner", "SKILL.md"), "---\nname: b2b-e2e-runner\ndescription: Synthetic.\n---\n");
  const git = (...args) => execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  git("init", "-q"); git("add", ".");
  git("-c", "user.name=Snapshot Test", "-c", "user.email=snapshot@example.invalid", "commit", "-qm", "fixture");
  const destination = path.join(root, "snapshot");
  return { repositoryRoot, destination, git };
}

test("repository export preserves committed bytes without local ignored dependencies", async t => {
  const { repositoryRoot, destination, git } = await fixture(t);
  const dependencies = path.join(repositoryRoot, "b2b-e2e-runner", "node_modules");
  await mkdir(dependencies);
  await symlink("../SKILL.md", path.join(dependencies, "ignored-link"));
  assert.equal(typeof vendor.exportRepositorySnapshot, "function");
  const result = await vendor.exportRepositorySnapshot({ repositoryRoot, skillName: "b2b-e2e-runner", destination });
  assert.deepEqual(await readdir(destination), ["SKILL.md"]);
  assert.deepEqual(await readFile(path.join(destination, "SKILL.md")), await readFile(path.join(repositoryRoot, "b2b-e2e-runner", "SKILL.md")));
  assert.equal(result.revision, git("rev-parse", "HEAD").trim());
});

test("repository export rejects uncommitted source changes and existing destinations", async t => {
  const { repositoryRoot, destination } = await fixture(t);
  assert.equal(typeof vendor.exportRepositorySnapshot, "function");
  await writeFile(path.join(repositoryRoot, "b2b-e2e-runner", "pending.txt"), "unreviewed");
  await assert.rejects(vendor.exportRepositorySnapshot({ repositoryRoot, skillName: "b2b-e2e-runner", destination }), { code: "BUNDLE_SHAPE" });
  await assert.rejects(readFile(path.join(destination, "SKILL.md")), { code: "ENOENT" });
  await rm(path.join(repositoryRoot, "b2b-e2e-runner", "pending.txt"));
  await mkdir(destination);
  await writeFile(path.join(destination, "keep.txt"), "keep");
  await assert.rejects(vendor.exportRepositorySnapshot({ repositoryRoot, skillName: "b2b-e2e-runner", destination }));
  assert.equal(await readFile(path.join(destination, "keep.txt"), "utf8"), "keep");
});

test("repository export rejects tracked symlinks, dependencies and path escape", async t => {
  const { repositoryRoot, destination, git } = await fixture(t);
  assert.equal(typeof vendor.exportRepositorySnapshot, "function");
  await symlink("SKILL.md", path.join(repositoryRoot, "b2b-e2e-runner", "linked"));
  git("add", "."); git("-c", "user.name=Snapshot Test", "-c", "user.email=snapshot@example.invalid", "commit", "-qm", "unsafe link");
  await assert.rejects(vendor.exportRepositorySnapshot({ repositoryRoot, skillName: "b2b-e2e-runner", destination }), { code: "BUNDLE_SHAPE" });
  await assert.rejects(vendor.exportRepositorySnapshot({ repositoryRoot, skillName: "../other", destination }), { code: "BUNDLE_SHAPE" });
  await rm(path.join(repositoryRoot, "b2b-e2e-runner", "linked"));
  await mkdir(path.join(repositoryRoot, "b2b-e2e-runner", "node_modules"));
  await writeFile(path.join(repositoryRoot, "b2b-e2e-runner", "node_modules", "bad.txt"), "dependency");
  git("add", "-A"); git("add", "-f", "b2b-e2e-runner/node_modules/bad.txt");
  git("-c", "user.name=Snapshot Test", "-c", "user.email=snapshot@example.invalid", "commit", "-qm", "unsafe tracked dependency");
  await assert.rejects(vendor.exportRepositorySnapshot({ repositoryRoot, skillName: "b2b-e2e-runner", destination }), { code: "BUNDLE_SHAPE" });
});
