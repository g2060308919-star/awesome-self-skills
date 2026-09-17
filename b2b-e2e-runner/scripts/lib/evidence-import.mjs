import crypto from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { validateScreenshotBytes } from "./screenshot-validation.mjs";

const LIMIT = 25 * 1024 * 1024;
function reject(message) { throw Object.assign(new Error(message), { code: "RUN_CONSISTENCY" }); }

export async function readScreenshotSource({ sourcePath, allowedSourceRoot, imageBase64, mimeType }) {
  if ((sourcePath !== undefined) === (imageBase64 !== undefined)) reject("必须且只能提供工具文件或真实图片返回值");
  let bytes;
  if (sourcePath !== undefined) {
    if (!allowedSourceRoot) reject("工具文件需要显式授权来源目录");
    const root = path.resolve(allowedSourceRoot);
    const relative = path.relative(root, path.resolve(sourcePath));
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) reject("截图来源越过授权来源目录");
    let current = root;
    for (const part of ["", ...relative.split(path.sep)]) {
      current = path.join(current, part);
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) reject("截图来源不得包含符号链接");
    }
    if (await realpath(path.resolve(sourcePath)) !== path.join(await realpath(root), relative)) reject("截图来源边界发生变化");
    const handle = await open(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > LIMIT) reject("截图来源必须是上限内的普通图片文件");
      bytes = await handle.readFile();
    } finally { await handle.close(); }
  } else {
    if (typeof imageBase64 !== "string" || imageBase64.length > Math.ceil(LIMIT / 3) * 4 || imageBase64.length % 4 !== 0) reject("图片返回值必须是有效 Base64");
    const padding = imageBase64.endsWith("==") ? 2 : imageBase64.endsWith("=") ? 1 : 0;
    const content = imageBase64.slice(0, imageBase64.length - padding);
    if (!content || /[^A-Za-z0-9+/]/.test(content)) reject("图片返回值必须是有效 Base64");
    bytes = Buffer.from(imageBase64, "base64");
    if (!mimeType) reject("图片返回值缺少 MIME 类型");
  }
  const detected = await validateScreenshotBytes(bytes);
  if (mimeType && mimeType !== detected) reject("图片 MIME 类型与真实内容不一致");
  return { bytes, mimeType: detected, sha256: crypto.createHash("sha256").update(bytes).digest("hex"), capture_source: sourcePath ? "tool_file" : "tool_image_return" };
}

export async function writeScreenshotExclusive(runRoot, relative, source) {
  // A single filename keeps source recovery simple and avoids directory races.
  if (typeof relative !== "string" || !/^evidence\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(relative)) reject("归档路径必须是 evidence/ 下的单一安全图片文件名");
  const expected = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[path.extname(relative).toLowerCase()];
  if (expected !== source.mimeType) reject("图片扩展名与内容不一致");
  const root = path.resolve(runRoot);
  const directory = path.join(root, "evidence");
  for (const location of [root, directory]) {
    const stat = await lstat(location);
    if (!stat.isDirectory() || stat.isSymbolicLink()) reject("Run 和 evidence 路径必须是真实目录，不得使用符号链接");
  }
  const destination = path.join(root, relative);
  const temporary = path.join(directory, `.capture-${crypto.randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    try { await handle.writeFile(source.bytes); await handle.sync(); }
    finally { await handle.close(); }
    await link(temporary, destination);
  }
  finally { await unlink(temporary); }
  return destination;
}
