#!/usr/bin/env node
// Deterministic upload input only. This is never browser screenshot evidence.
import { open, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

function chunk(type, data) {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}

export async function createTestImage({ output, width = 640, height = 360 }) {
  if (!output || path.extname(output).toLowerCase() !== ".png" ||
      !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 4096 || height > 4096) {
    throw Object.assign(new Error("仅生成 PNG 测试输入；宽高须为 1–4096 整数，输出父目录必须已获准且存在"), { code: "INPUT_CONTRACT" });
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      const alternate = (Math.floor(x / 32) + Math.floor(y / 32)) % 2 === 0;
      pixels[offset] = alternate ? 42 : 228;
      pixels[offset + 1] = alternate ? 108 : 237;
      pixels[offset + 2] = alternate ? 187 : 248;
    }
  }
  const bytes = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header),
    chunk("tEXt", Buffer.from("Description\0Synthetic test input; not screenshot evidence")), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
  const handle = await open(output, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  catch (error) { await handle.close(); await rm(output, { force: true }); throw error; }
  await handle.close();
  return { kind: "test_input_not_evidence", path: path.resolve(output), width, height, bytes: bytes.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const options = {};
  try {
    for (let index = 0; index < args.length; index += 2) {
      if (!["--output", "--width", "--height"].includes(args[index]) || args[index + 1] === undefined) throw new Error("参数须为 --output、--width、--height");
      options[args[index].slice(2)] = args[index + 1];
    }
    const result = await createTestImage({ output: options.output, width: options.width === undefined ? 640 : Number(options.width), height: options.height === undefined ? 360 : Number(options.height) });
    process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.code ?? "INPUT_CONTRACT", message: "测试图片生成失败；检查参数、输出目录和文件是否已存在" }) + "\n");
    process.exitCode = error.code === "EEXIST" ? 5 : 2;
  }
}
