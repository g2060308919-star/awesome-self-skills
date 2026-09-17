import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

export class BundleError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "BundleError";
    this.code = code;
  }
}

export function bundleFail(code, message) {
  throw new BundleError(code, message);
}

function byteOrder(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

async function visit(root, relative, files) {
  const directory = path.join(root, ...relative.split("/").filter(Boolean));
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => byteOrder(left.name, right.name));
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    if (entry.name === ".git") bundleFail("BUNDLE_SHAPE", "Nested .git metadata is forbidden in a Skill snapshot.");
    if (entry.name.includes("\n") || entry.name.includes("\r") || entry.name.includes("\0")) {
      bundleFail("BUNDLE_SHAPE", "Unsafe path bytes are forbidden in a Skill snapshot.");
    }
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const child = path.join(directory, entry.name);
    const stat = await lstat(child);
    if (stat.isSymbolicLink()) bundleFail("BUNDLE_SHAPE", `Symlinks are forbidden: ${childRelative}.`);
    if (stat.isDirectory()) {
      await visit(root, childRelative, files);
    } else if (stat.isFile()) {
      const resolved = await realpath(child);
      if (resolved !== path.join(root, ...childRelative.split("/"))) bundleFail("BUNDLE_SHAPE", `Path escapes snapshot root: ${childRelative}.`);
      files.push(childRelative);
    } else {
      bundleFail("BUNDLE_SHAPE", `Non-regular filesystem entry is forbidden: ${childRelative}.`);
    }
  }
}

export async function listTreeFiles(rootPath) {
  const supplied = await lstat(rootPath).catch(() => bundleFail("BUNDLE_SHAPE", "Skill snapshot root does not exist."));
  if (!supplied.isDirectory() || supplied.isSymbolicLink()) bundleFail("BUNDLE_SHAPE", "Skill snapshot root must be a real directory.");
  const root = await realpath(rootPath).catch(() => bundleFail("BUNDLE_SHAPE", "Skill snapshot root does not exist."));
  const stat = await lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) bundleFail("BUNDLE_SHAPE", "Skill snapshot root must be a real directory.");
  const files = [];
  await visit(root, "", files);
  return { root, files: files.sort(byteOrder) };
}

export async function computeTreeHash(rootPath) {
  const { root, files } = await listTreeFiles(rootPath);
  const tree = createHash("sha256");
  for (const relative of files) {
    const contents = await readFile(path.join(root, ...relative.split("/")));
    const fileHash = createHash("sha256").update(contents).digest("hex");
    tree.update(relative, "utf8");
    tree.update(Buffer.from([0]));
    tree.update(fileHash, "utf8");
    tree.update("\n", "utf8");
  }
  return tree.digest("hex");
}
