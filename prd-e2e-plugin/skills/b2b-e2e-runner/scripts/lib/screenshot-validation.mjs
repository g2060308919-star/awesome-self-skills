import { inflateSync } from "node:zlib";
import { assertNoSecrets } from "./redaction.mjs";

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_METADATA = 8 * 1024 * 1024;
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
function invalid(message = "截图图片结构无效、截断或无法安全检查") {
  throw Object.assign(new Error(message), { code: "RUN_CONSISTENCY" });
}
const crcTable = Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

// ICC permits shared tag/string data, but not arbitrary unreferenced payloads.
// Accept exact sharing, reject partial overlap and gaps beyond zero alignment.
function coveredRanges(bytes, start, ranges) {
  const unique = [...new Map(ranges.map(range => [range.join(":"), range])).values()].sort((a, b) => a[0] - b[0]);
  for (const [offset, length] of [...unique, [bytes.length, 0]]) {
    if (offset < start || offset + length > bytes.length || offset - start > 3 || bytes.subarray(start, offset).some(value => value !== 0)) invalid("截图 ICC 含未引用、重叠或嵌套数据");
    start = offset + length;
  }
}

function colourTag(name, bytes, inspect) {
  if (bytes.subarray(4, 8).some(value => value !== 0)) invalid();
  const type = bytes.toString("ascii", 0, 4), size = bytes.length;
  if (["desc", "cprt", "dmnd", "dmdd"].includes(name) && type === "mluc" && size >= 16) {
    const count = bytes.readUInt32BE(8), tableEnd = 16 + count * 12;
    if (!count || count > 1024 || bytes.readUInt32BE(12) !== 12 || tableEnd > size) invalid();
    const ranges = [];
    for (let i = 0; i < count; i++) {
      const record = 16 + i * 12, length = bytes.readUInt32BE(record + 4), offset = bytes.readUInt32BE(record + 8);
      if (length % 2 || offset < tableEnd || offset + length > size) invalid();
      let text;
      try { text = new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(offset, offset + length)); }
      catch { invalid(); }
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) invalid();
      inspect.text(Buffer.from(text));
      ranges.push([offset, length]);
    }
    coveredRanges(bytes, tableEnd, ranges);
    return;
  }
  if (["wtpt", "bkpt", "rXYZ", "gXYZ", "bXYZ", "lumi"].includes(name) && type === "XYZ " && size === 20) return;
  if (name === "chad" && type === "sf32" && size === 44) return;
  if (["rTRC", "gTRC", "bTRC", "kTRC"].includes(name) && size >= 12) {
    if (type === "curv" && size === 12 + bytes.readUInt32BE(8) * 2) return;
    if (type === "para" && bytes.readUInt16BE(10) === 0 && size === 12 + [1, 3, 4, 5, 7][bytes.readUInt16BE(8)] * 4) return;
  }
  invalid("截图 ICC 含尚不能安全检查的标签类型或长度");
}

function metadataInspector() {
  let total = 0;
  const reserve = size => { total += size; if (total > MAX_METADATA) invalid("截图元数据超过安全检查上限"); };
  return {
    inflate(bytes) {
      try {
        const result = inflateSync(bytes, { maxOutputLength: Math.max(1, MAX_METADATA - total), info: true });
        if (result.engine.bytesWritten !== bytes.length) invalid();
        return result.buffer;
      }
      catch { invalid("截图压缩元数据损坏或超过安全检查上限"); }
    },
    text(bytes, keyword) {
      reserve(bytes.length);
      const text = bytes.toString("utf8");
      // Metadata is not pixel OCR. Check keys as well as values, without ever
      // echoing the contents in errors. Existing business identifiers survive.
      if (keyword) assertNoSecrets({ [keyword]: text });
      assertNoSecrets(text);
      if (/(?:password|passwd|authorization|proxy-authorization|cookie|set-cookie|(?:access|refresh|id)[_-]?token|token|session(?:[_-]?id)?|api[_-]?key|secret|signature)\s*["']?\s*[:=]\s*\S/i.test(text)) {
        throw Object.assign(new Error("检测到图片元数据中的秘密字段或值"), { code: "SECRET_DETECTED" });
      }
    },
    opaque(bytes) {
      // EXIF/XMP/IPTC/private metadata can nest encodings. Do not pretend a
      // text scan proves them safe; recognizable secrets get the usual code,
      // otherwise fail closed without rewriting the original image.
      this.text(bytes);
      this.text(Buffer.from(bytes.toString("utf16le").replaceAll("\0", "")));
      invalid("截图含尚不能安全检查的嵌套或私有元数据");
    },
    colourProfile(bytes) {
      this.text(bytes);
      // ICC text can be UTF-16BE/LE. ASCII secret labels remain detectable
      // after removing NUL code units; never alter the archived profile.
      this.text(Buffer.from(bytes.toString("latin1").replaceAll("\0", "")));
      if (bytes.length < 132 || bytes.readUInt32BE(0) !== bytes.length || bytes.toString("ascii", 36, 40) !== "acsp") invalid();
      const count = bytes.readUInt32BE(128), tableEnd = 132 + count * 12;
      if (!count || count > 1024 || tableEnd > bytes.length) invalid();
      if (bytes.subarray(100, 128).some(value => value !== 0)) invalid();
      const names = new Set(), ranges = [];
      for (let i = 0; i < count; i++) {
        const record = 132 + i * 12;
        const name = bytes.toString("ascii", record, record + 4);
        const start = bytes.readUInt32BE(record + 4), length = bytes.readUInt32BE(record + 8);
        if (names.has(name) || start % 4 || start < tableEnd || length < 8 || start + length > bytes.length) {
          invalid("截图 ICC 含尚不能安全检查的私有或嵌套标签");
        }
        names.add(name);
        colourTag(name, bytes.subarray(start, start + length), this);
        ranges.push([start, length]);
      }
      coveredRanges(bytes, tableEnd, ranges);
    }
  };
}

function pngMetadata(bytes, inspect) {
  let offset = 8, count = 0, ended = false, dataSeen = false;
  const fixed = new Map([["cHRM", 32], ["gAMA", 4], ["sRGB", 1], ["pHYs", 9], ["tIME", 7], ["cICP", 4], ["mDCV", 24], ["cLLI", 8]]);
  while (offset < bytes.length) {
    if (++count > 4096 || offset + 12 > bytes.length) invalid();
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    if (end > bytes.length) invalid();
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, end - 4);
    if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) invalid("截图 PNG 校验和不一致");
    if (count === 1 && (type !== "IHDR" || length !== 13)) invalid();
    if (type === "IHDR") { if (count !== 1 || length !== 13) invalid(); }
    else if (type === "IDAT") dataSeen = true;
    else if (type === "IEND") {
      if (length || !dataSeen || end !== bytes.length) invalid();
      ended = true;
    } else if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      const zero = data.indexOf(0);
      if (zero < 1 || zero > 79) invalid();
      const keyword = data.subarray(0, zero).toString("latin1");
      let text = data.subarray(zero + 1);
      if (type === "zTXt") {
        if (text[0] !== 0) invalid();
        text = inspect.inflate(text.subarray(1));
      } else if (type === "iTXt") {
        if (text.length < 4 || text[0] > 1 || text[1] !== 0) invalid();
        const compressed = text[0] === 1;
        const languageEnd = text.indexOf(0, 2), translatedEnd = text.indexOf(0, languageEnd + 1);
        if (languageEnd < 2 || translatedEnd < languageEnd + 1) invalid();
        inspect.text(text.subarray(2, translatedEnd));
        text = text.subarray(translatedEnd + 1);
        if (compressed) text = inspect.inflate(text);
      }
      inspect.text(text, keyword);
    } else if (type === "iCCP") {
      const zero = data.indexOf(0);
      if (zero < 1 || zero > 79 || data[zero + 1] !== 0) invalid();
      inspect.text(data.subarray(0, zero));
      inspect.colourProfile(inspect.inflate(data.subarray(zero + 2)));
    } else if (fixed.has(type)) { if (length !== fixed.get(type)) invalid(); inspect.text(data); }
    else if (type === "hIST") { if (!length || length % 2 || length > 512) invalid(); inspect.text(data); }
    else if (!["PLTE", "tRNS", "bKGD", "sBIT"].includes(type)) inspect.opaque(data);
    offset = end;
  }
  if (!ended) invalid();
}

function jpegMetadata(bytes, inspect) {
  let offset = 2, count = 0, scan = false;
  const profiles = new Map();
  let profileParts = 0;
  while (offset < bytes.length) {
    if (scan) {
      while (offset < bytes.length && bytes[offset] !== 255) offset++;
      if (bytes[offset + 1] === 0 || (bytes[offset + 1] >= 0xd0 && bytes[offset + 1] <= 0xd7)) { offset += 2; continue; }
    }
    if (++count > 4096 || bytes[offset++] !== 255) invalid();
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (offset !== bytes.length) invalid();
      if (profileParts) {
        if (profiles.size !== profileParts) invalid();
        inspect.colourProfile(Buffer.concat(Array.from({ length: profileParts }, (_, i) => profiles.get(i + 1))));
      }
      return;
    }
    if (offset + 2 > bytes.length) invalid();
    const length = bytes.readUInt16BE(offset), end = offset + length;
    if (length < 2 || end > bytes.length) invalid();
    const data = bytes.subarray(offset + 2, end);
    if (marker === 0xfe) inspect.text(data);
    else if (marker >= 0xe0 && marker <= 0xef) {
      if (marker === 0xe0 && data.subarray(0, 5).equals(Buffer.from("JFIF\0")) && data.length >= 14 && data.length === 14 + 3 * data[12] * data[13]) { /* fixed JFIF fields and thumbnail pixels */ }
      else if (marker === 0xee && data.length === 12 && data.subarray(0, 5).toString() === "Adobe") { /* fixed colour transform fields */ }
      else if (marker === 0xe2 && data.length >= 14 && data.subarray(0, 12).equals(Buffer.from("ICC_PROFILE\0"))) {
        const part = data[12], total = data[13];
        if (!part || !total || part > total || (profileParts && profileParts !== total) || profiles.has(part)) invalid();
        profileParts = total; profiles.set(part, data.subarray(14));
      }
      else inspect.opaque(data);
    }
    offset = end;
    scan = marker === 0xda;
  }
  invalid();
}

function webpMetadata(bytes, inspect) {
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) invalid();
  let offset = 12, count = 0;
  while (offset < bytes.length) {
    if (++count > 4096 || offset + 8 > bytes.length) invalid();
    const type = bytes.toString("ascii", offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (end + (length % 2) > bytes.length || (length % 2 && bytes[end] !== 0)) invalid();
    if (type === "ICCP") inspect.colourProfile(bytes.subarray(offset + 8, end));
    else if (!["VP8 ", "VP8L", "VP8X", "ALPH"].includes(type)) inspect.opaque(bytes.subarray(offset + 8, end));
    offset = end + length % 2;
  }
}

let decoder;
export async function validateScreenshotBytes(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_BYTES) invalid("截图图片超过 25 MiB 归档上限或输入无效");
  const inspect = metadataInspector();
  let mimeType;
  if (bytes.subarray(0, 8).equals(PNG)) { mimeType = "image/png"; pngMetadata(bytes, inspect); }
  else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) { mimeType = "image/jpeg"; jpegMetadata(bytes, inspect); }
  else if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") { mimeType = "image/webp"; webpMetadata(bytes, inspect); }
  else invalid("截图图片不是允许的 PNG、JPEG 或 WebP");
  try { decoder ??= (await import("sharp")).default; }
  catch { invalid("截图解码器不可用；请先在 Skill 根目录运行 npm ci --ignore-scripts"); }
  try {
    // Decode all pixels, not just metadata. Discard this memory-only output;
    // archival always uses the untouched input. Never load SVG or remote URLs.
    await decoder(bytes, { failOn: "warning", limitInputPixels: 64 * 1024 * 1024 })
      .timeout({ seconds: 5 }).raw().toBuffer();
  } catch { invalid("截图图片无法完整解码，或超过像素/处理时间安全上限"); }
  return mimeType;
}
