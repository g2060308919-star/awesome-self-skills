import { lstat, opendir, readFile, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import { SandboxError } from "../shared/errors.mjs";
import { scanValue } from "./canary-pattern.mjs";

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".json"]);
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg"]);

async function decodeUtf8(path) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
  } catch {
    throw new SandboxError("CANARY_SCAN_FAILED", "Canary text input is not valid UTF-8");
  }
}

async function validateEntry(root, path, expectedKind) {
  const containment = relative(root, path);
  if (isAbsolute(containment) || containment.startsWith("..")) {
    throw new SandboxError("CANARY_PATH_UNSAFE", "Canary scan path escapes its root");
  }
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink()) throw new SandboxError("CANARY_PATH_UNSAFE", "Canary scan rejects symbolic links");
  const resolved = await realpath(path);
  if (resolved !== path || (expectedKind === "file" ? !metadata.isFile() : !metadata.isDirectory())) {
    throw new SandboxError("CANARY_PATH_UNSAFE", "Canary scan accepts only real files and directories");
  }
  return metadata;
}

export async function scanPath(inputPath, registry, options = {}) {
  if (!isAbsolute(inputPath)) throw new SandboxError("CANARY_PATH_UNSAFE", "Canary scan path must be absolute");
  const normalized = resolve(inputPath);
  const initial = await lstat(normalized);
  if (initial.isSymbolicLink()) throw new SandboxError("CANARY_PATH_UNSAFE", "Canary scan root cannot be a symbolic link");
  const root = initial.isDirectory() ? await realpath(normalized) : await realpath(dirname(normalized));
  const matches = [];
  let totalBytes = 0;
  let ocrMetadata = null;
  const maxFileBytes = options.maxFileBytes ?? 10 * 1024 * 1024;
  const maxTotalBytes = options.maxTotalBytes ?? 25 * 1024 * 1024;

  const visitFile = async (path) => {
    const metadata = await validateEntry(root, path, "file");
    totalBytes += metadata.size;
    if (metadata.size > maxFileBytes || totalBytes > maxTotalBytes) {
      throw new SandboxError("CANARY_SCAN_FAILED", "Canary scan byte budget exceeded");
    }
    const relativePath = relative(root, path) || path.split("/").at(-1);
    matches.push(...scanValue(relativePath, registry, { location: `${relativePath}/@filename` }));
    const extension = extname(path).toLowerCase();
    if (TEXT_EXTENSIONS.has(extension)) {
      const text = await decodeUtf8(path);
      if (extension === ".json") {
        let value;
        try {
          value = JSON.parse(text);
        } catch {
          throw new SandboxError("CANARY_SCAN_FAILED", "Canary JSON input is malformed");
        }
        matches.push(...scanValue(value, registry, { location: relativePath }));
      } else {
        matches.push(...scanValue(text, registry, { location: relativePath }));
      }
      return;
    }
    if (IMAGE_EXTENSIONS.has(extension)) {
      if (!options.ocr) throw new SandboxError("CANARY_SCAN_FAILED", "Image evidence requires configured offline OCR");
      const recognized = await options.ocr.recognize(path);
      ocrMetadata = recognized.metadata;
      matches.push(...scanValue(recognized.text, registry, { location: `${relativePath}/@ocr` }));
      return;
    }
    throw new SandboxError("CANARY_SCAN_FAILED", `Unsupported canary scan format: ${extension || "none"}`);
  };

  const visitDirectory = async (directory) => {
    await validateEntry(root, directory, "directory");
    const entries = [];
    for await (const entry of await opendir(directory)) entries.push(entry);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visitDirectory(path);
      else await visitFile(path);
    }
  };

  if (initial.isDirectory()) await visitDirectory(await realpath(normalized));
  else await visitFile(await realpath(normalized));
  return {
    matched: matches.length > 0,
    matches,
    scannedBytes: totalBytes,
    ocr: ocrMetadata
  };
}
