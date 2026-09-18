import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { bundleFail } from "./tree-hash.mjs";

const execute = promisify(execFile);

// Export committed, clean source bytes BEFORE strict vendoring. Do not loosen
// tree hashing to ignore installed dependencies or unsafe files in a bundle.
export async function exportRepositorySnapshot({ repositoryRoot, skillName, destination }) {
  if (!["generate-test-cases", "b2b-e2e-runner"].includes(skillName)) bundleFail("BUNDLE_SHAPE", "Unknown repository Skill snapshot.");
  const git = async (...args) => {
    try { return (await execute("git", ["-C", path.resolve(repositoryRoot), ...args], { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 })).stdout; }
    catch { bundleFail("BUNDLE_SHAPE", "Repository snapshot cannot be read."); }
  };
  const revision = (await git("rev-parse", "HEAD")).toString().trim();
  if ((await git("status", "--porcelain", "--untracked-files=all", "--", skillName)).length) bundleFail("BUNDLE_SHAPE", "Commit and validate Skill source changes before exporting a snapshot.");
  const entries = (await git("ls-tree", "-rz", "--full-tree", revision, "--", `${skillName}/`)).toString().split("\0").filter(Boolean).map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t(.+)$/s.exec(entry);
    if (!match || !match[3].startsWith(`${skillName}/`)) bundleFail("BUNDLE_SHAPE", "Snapshot contains a non-regular source entry.");
    const relative = match[3].slice(skillName.length + 1);
    if (relative.split("/").some(part => ["..", ".git", "node_modules"].includes(part)) || /[\r\n\\]/.test(relative)) bundleFail("BUNDLE_SHAPE", "Unsafe repository snapshot path.");
    return { relative, oid: match[2], mode: match[1] === "100755" ? 0o700 : 0o600 };
  });
  if (!entries.some(entry => entry.relative === "SKILL.md")) bundleFail("BUNDLE_SHAPE", "Repository snapshot lacks SKILL.md.");
  const root = path.resolve(destination);
  await mkdir(root, { recursive: false, mode: 0o700 });
  try {
    for (const { relative, oid, mode } of entries) {
      const target = path.join(root, relative);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, await git("cat-file", "blob", oid), { flag: "wx", mode });
    }
  } catch (error) {
    await rm(root, { recursive: true, force: true }); // only this call's new directory
    throw error;
  }
  return { root, revision };
}
