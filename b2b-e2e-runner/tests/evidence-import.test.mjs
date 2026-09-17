import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import * as runtime from "../scripts/run-artifacts.mjs";

// Real, decodable 1×1 PNG: input only; never represented as browser evidence.
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWMwTpsJAAICATMDms/iAAAAAElFTkSuQmCC", "base64");
async function setup(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-archive-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({ schema_version: "2.0", suite: { name: "归档夹具", target_urls: ["http://localhost"] }, cases: [{ case_id: "C", module: "证据", title: "截图", preconditions: [], steps: [{ step_id: "s", action: "观察", expected: [{ oracle_id: "o", text: "显示结果" }] }] }] }));
  const run = await runtime.initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
  await runtime.recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["C"] });
  const event = { type: "evidence_capture", capture_kind: "screenshot", outcome: "captured", checkpoint_ids: ["C/s/o"], description: "隔离单元夹具归档验证", attempts: ["工具输出归档"], evidence: [{ evidence_id: "screen", kind: "screenshot", at: "2026-09-17T00:00:00Z", description: "测试图片，不是业务证据", checkpoint_ids: ["C/s/o"], path: "evidence/screen.png" }] };
  return { root, run, event };
}

test("archives explicit returned image bytes and records existing capture event without changing results", async t => {
  const { run, event } = await setup(t);
  assert.equal(typeof runtime.archiveScreenshot, "function");
  const result = await runtime.archiveScreenshot(run.runRoot, { imageBase64: image.toString("base64"), mimeType: "image/png", event });
  assert.equal(result.recorded, true);
  assert.deepEqual(await readFile(path.join(run.runRoot, "evidence/screen.png")), image);
  const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json")));
  assert.equal(log.cases[0].checkpoints[0].result, null);
  assert.match(log.events.at(-1).evidence[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(log.events.at(-1).evidence[0].capture_source, "tool_image_return");
  await assert.doesNotReject(runtime.validateRun(run.runRoot));
});

test("archives only the explicitly authorized tool source, rejects traversal, symlinks and overwrite", async t => {
  const { root, run, event } = await setup(t);
  const sourceRoot = path.join(root, "tool-output");
  await mkdir(sourceRoot);
  const sourcePath = path.join(sourceRoot, "image.png");
  await writeFile(sourcePath, image);
  assert.equal(typeof runtime.archiveScreenshot, "function");
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { sourcePath, event }), /授权来源目录/);
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { sourcePath, allowedSourceRoot: path.join(root, "other"), event }), /来源/);
  await symlink(sourcePath, path.join(sourceRoot, "linked.png"));
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { sourcePath: path.join(sourceRoot, "linked.png"), allowedSourceRoot: sourceRoot, event }), /符号链接/);
  await runtime.archiveScreenshot(run.runRoot, { sourcePath, allowedSourceRoot: sourceRoot, event });
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { sourcePath, allowedSourceRoot: sourceRoot, event }));
  assert.deepEqual(await readFile(sourcePath), image);
  assert.deepEqual(await readdir(run.evidenceRoot), ["screen.png"]);
  const bad = structuredClone(event); bad.evidence[0].evidence_id = "bad-path"; bad.evidence[0].path = "evidence/../outside.png";
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { imageBase64: image.toString("base64"), mimeType: "image/png", event: bad }), /路径/);
});

test("an archived screenshot whose bytes changed is rejected by validation", async t => {
  const { run, event } = await setup(t);
  await runtime.archiveScreenshot(run.runRoot, { imageBase64: image.toString("base64"), mimeType: "image/png", event });
  const changed = Buffer.from(image); changed[40] ^= 1;
  await writeFile(path.join(run.evidenceRoot, "screen.png"), changed);
  await assert.rejects(runtime.validateRun(run.runRoot), /摘要/);
});

test("CLI accepts the actual image-return envelope via stdin, without persisting the envelope", async t => {
  const { root, run, event } = await setup(t);
  const eventPath = path.join(root, "capture-event.json");
  await writeFile(eventPath, JSON.stringify(event));
  const cli = fileURLToPath(new URL("../scripts/run-artifacts.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "archive-screenshot", "--run", run.runRoot, "--event", eventPath, "--image-stdin", "true"], { input: JSON.stringify({ data: image.toString("base64"), mimeType: "image/png" }), encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).recorded, true);
  assert.deepEqual(await readdir(run.evidenceRoot), ["screen.png"]);
});

test("large valid PNG return below the documented limit archives without regex stack overflow", async t => {
  const { run, event } = await setup(t);
  const payload = Buffer.from(`Comment\0${"x".repeat(5 * 1024 * 1024)}`);
  const nameAndData = Buffer.concat([Buffer.from("tEXt"), payload]);
  let crc = 0xffffffff;
  for (const byte of nameAndData) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const length = Buffer.alloc(4); length.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  const large = Buffer.concat([image.subarray(0, -12), length, nameAndData, checksum, image.subarray(-12)]);
  await runtime.archiveScreenshot(run.runRoot, { imageBase64: large.toString("base64"), mimeType: "image/png", event });
  assert.deepEqual(await readFile(path.join(run.evidenceRoot, "screen.png")), large);
});

test("invalid bytes, mime, unknown checkpoint and secret metadata leave no file or ledger changes", async t => {
  const { run, event } = await setup(t);
  assert.equal(typeof runtime.archiveScreenshot, "function");
  const before = await readFile(path.join(run.runRoot, "execution-log.json"), "utf8");
  for (const bytes of [Buffer.from("not an image"), image.subarray(0, 8)]) {
    await assert.rejects(runtime.archiveScreenshot(run.runRoot, { imageBase64: bytes.toString("base64"), mimeType: "image/png", event }), /图片/);
  }
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { imageBase64: image.toString("base64"), mimeType: "image/jpeg", event }), /图片/);
  const bad = structuredClone(event); bad.checkpoint_ids = ["unknown"];
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { imageBase64: image.toString("base64"), mimeType: "image/png", event: bad }));
  const secret = structuredClone(event); secret.description = "Authorization: Bearer secret-demo-value";
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { imageBase64: image.toString("base64"), mimeType: "image/png", event: secret }), { code: "SECRET_DETECTED" });
  assert.deepEqual(await readdir(run.evidenceRoot), []);
  assert.equal(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"), before);
});

function pngChunk(type, payload) {
  const body = Buffer.concat([Buffer.from(type), payload]);
  let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const size = Buffer.alloc(4); size.writeUInt32BE(payload.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, checksum]);
}
const freshImage = () => sharp({ create: { width: 2, height: 2, channels: 3, background: "#336699" } });
const insertChunk = (png, type, payload) => Buffer.concat([png.subarray(0, -12), pngChunk(type, payload), png.subarray(-12)]);

for (const kind of ["tEXt", "zTXt", "iTXt", "keyword"]) {
  test(`embedded PNG ${kind} secrets are rejected before image or ledger persistence`, async t => {
    const { run, event } = await setup(t);
    const before = await readFile(path.join(run.runRoot, "execution-log.json"));
    const text = Buffer.from("Authorization: Bearer synthetic-test-only");
    const payload = kind === "tEXt" ? Buffer.concat([Buffer.from("Comment\0"), text])
      : kind === "zTXt" ? Buffer.concat([Buffer.from("Comment\0\0"), deflateSync(text)])
      : kind === "keyword" ? Buffer.from("Token\0synthetic-test-only")
      : Buffer.concat([Buffer.from("Comment\0\x01\0\0\0"), deflateSync(text)]);
    const bytes = insertChunk(await freshImage().png().toBuffer(), kind === "keyword" ? "tEXt" : kind, payload);
    await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: "image/png" }), { code: "SECRET_DETECTED" });
    assert.deepEqual(await readdir(run.evidenceRoot), []);
    assert.deepEqual(await readFile(path.join(run.runRoot, "execution-log.json")), before);
  });
}

test("a forged PNG with valid-looking outer markers never becomes captured", async t => {
  const { run, event } = await setup(t);
  const bytes = Buffer.alloc(45);
  Buffer.from("89504e470d0a1a0a", "hex").copy(bytes);
  bytes.write("IHDR", 12); bytes.writeUInt32BE(1, 16); bytes.writeUInt32BE(1, 20); bytes.write("IEND", 37);
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: "image/png" }), { code: "RUN_CONSISTENCY" });
  assert.deepEqual(await readdir(run.evidenceRoot), []);
});

for (const [format, mime, extension] of [["png", "image/png", "png"], ["jpeg", "image/jpeg", "jpg"], ["webp", "image/webp", "webp"]]) {
  test(`valid ${format} stays byte-identical while corrupted compressed data is rejected`, async t => {
    const { run, event } = await setup(t);
    const bytes = await freshImage()[format]().toBuffer();
    event.evidence[0].path = `evidence/valid.${extension}`;
    await runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: mime });
    assert.deepEqual(await readFile(path.join(run.runRoot, event.evidence[0].path)), bytes);
    const corrupted = Buffer.from(bytes);
    if (format === "png") {
      const index = corrupted.indexOf(Buffer.from("IDAT")); corrupted[index + 4] ^= 0xff;
    } else if (format === "jpeg") {
      const index = corrupted.indexOf(Buffer.from([0xff, 0xda]));
      corrupted.fill(0, index + 4, corrupted.length - 2);
    } else corrupted.fill(0, 16);
    event.evidence[0].path = `evidence/broken.${extension}`;
    event.evidence[0].evidence_id = "broken";
    await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: corrupted.toString("base64"), mimeType: mime }), { code: "RUN_CONSISTENCY" });
    assert.deepEqual(await readdir(run.evidenceRoot), [`valid.${extension}`]);
  });
}

test("unsafe JPEG comment and WebP XMP metadata cannot enter evidence", async t => {
  const { run, event } = await setup(t);
  const secret = Buffer.from("Authorization: Bearer synthetic-test-only");
  const jpg = await freshImage().jpeg().toBuffer();
  const segment = Buffer.alloc(4); segment[0] = 255; segment[1] = 254; segment.writeUInt16BE(secret.length + 2, 2);
  const jpeg = Buffer.concat([jpg.subarray(0, 2), segment, secret, jpg.subarray(2)]);
  const webp = await freshImage().withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/">Authorization: Bearer synthetic-test-only</x:xmpmeta>').webp().toBuffer();
  for (const [bytes, mimeType, extension] of [[jpeg, "image/jpeg", "jpg"], [webp, "image/webp", "webp"]]) {
    event.evidence[0].path = `evidence/meta.${extension}`;
    await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType }), { code: "SECRET_DETECTED" });
  }
  assert.deepEqual(await readdir(run.evidenceRoot), []);
});

test("validation rechecks archived image metadata even when a replacement has a matching digest", async t => {
  const { run, event } = await setup(t);
  await runtime.archiveScreenshot(run.runRoot, { event, imageBase64: image.toString("base64"), mimeType: "image/png" });
  const altered = insertChunk(image, "tEXt", Buffer.from("Cookie\0synthetic-test-only"));
  await writeFile(path.join(run.evidenceRoot, "screen.png"), altered);
  const logPath = path.join(run.runRoot, "execution-log.json");
  const log = JSON.parse(await readFile(logPath));
  log.events.at(-1).evidence[0].sha256 = crypto.createHash("sha256").update(altered).digest("hex");
  await writeFile(logPath, JSON.stringify(log));
  await assert.rejects(runtime.validateRun(run.runRoot), { code: "SECRET_DETECTED" });
});

test("bounded metadata inspection rejects compressed bombs, unknown chunks and trailing data", async t => {
  const { run, event } = await setup(t);
  const cases = [
    insertChunk(image, "zTXt", Buffer.concat([Buffer.from("Comment\0\0"), deflateSync(Buffer.alloc(8 * 1024 * 1024 + 1, 120))])),
    insertChunk(image, "vpAg", Buffer.from("private opaque payload")),
    Buffer.concat([image, Buffer.from("uninspected trailing bytes")])
  ];
  const before = await readFile(path.join(run.runRoot, "execution-log.json"));
  for (const bytes of cases) await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: "image/png" }), { code: "RUN_CONSISTENCY" });
  assert.deepEqual(await readdir(run.evidenceRoot), []);
  assert.deepEqual(await readFile(path.join(run.runRoot, "execution-log.json")), before);
});

test("PNG metadata preserves ordinary business identifiers and large valid screenshots remain readable", async t => {
  const { run, event } = await setup(t);
  const text = "UID=1042; IP=192.0.2.7; order_id=ORDER-731; record_id=RECORD-825";
  const bytes = insertChunk(image, "tEXt", Buffer.from(`Comment\0${text}`));
  const sourcePath = path.join(path.dirname(run.runRoot), "actual-tool-output.png");
  await writeFile(sourcePath, bytes);
  await runtime.archiveScreenshot(run.runRoot, { event, sourcePath, allowedSourceRoot: path.dirname(run.runRoot) });
  const saved = await readFile(path.join(run.evidenceRoot, "screen.png"));
  assert.deepEqual(saved, bytes);
  assert(saved.includes(Buffer.from(text)));
  await runtime.validateRun(run.runRoot);
});

for (const [format, mimeType, ext] of [["png", "image/png", "png"], ["jpeg", "image/jpeg", "jpg"], ["webp", "image/webp", "webp"]]) {
  test(`standard sRGB colour metadata in ${format} stays compatible and byte-identical`, async t => {
    const { run, event } = await setup(t);
    const bytes = await freshImage().withIccProfile("srgb")[format]().toBuffer();
    event.evidence[0].path = `evidence/colour.${ext}`;
    await runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType });
    assert.deepEqual(await readFile(path.join(run.runRoot, event.evidence[0].path)), bytes);
  });
}

test("secrets in compressed colour-profile metadata are rejected before persistence", async t => {
  const { run, event } = await setup(t);
  const colourImage = await freshImage().withIccProfile("srgb").png().toBuffer();
  const profile = (await sharp(colourImage).metadata()).icc;
  const unsafe = Buffer.concat([profile, Buffer.from("Authorization: Bearer synthetic-test-only")]);
  unsafe.writeUInt32BE(unsafe.length, 0);
  const bytes = insertChunk(image, "iCCP", Buffer.concat([Buffer.from("colour\0\0"), deflateSync(unsafe)]));
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: "image/png" }), { code: "SECRET_DETECTED" });
  assert.deepEqual(await readdir(run.evidenceRoot), []);
});

for (const location of ["profile-tail", "numeric-tag", "text-tag"]) {
  test(`ICC unreferenced or nested ${location} data fails closed without persistence`, async t => {
    const { run, event } = await setup(t);
    const before = await readFile(path.join(run.runRoot, "execution-log.json"));
    const png = await freshImage().withIccProfile("srgb").png().toBuffer();
    const original = (await sharp(png).metadata()).icc;
    const nested = deflateSync(Buffer.from("Authorization: Bearer synthetic-test-only"));
    let profile;
    if (location === "profile-tail") profile = Buffer.concat([original, nested]);
    else {
      // Relocate one legitimate tag and append nested bytes inside its claimed
      // length. The image decoder accepts this, but a metadata inspector must not.
      const record = location === "numeric-tag" ? 132 + 7 * 12 : 132;
      const start = original.readUInt32BE(record + 4), size = original.readUInt32BE(record + 8);
      profile = Buffer.concat([original, original.subarray(start, start + size), nested]);
      profile.writeUInt32BE(original.length, record + 4);
      profile.writeUInt32BE(size + nested.length, record + 8);
      if (location === "text-tag") profile.fill(0, start, start + size);
    }
    profile.writeUInt32BE(profile.length, 0);
    const bytes = Buffer.concat([image.subarray(0, 33), pngChunk("iCCP", Buffer.concat([Buffer.from("colour\0\0"), deflateSync(profile)])), image.subarray(33)]);
    await sharp(bytes).raw().toBuffer(); // corruption is in metadata, not pixels
    await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: "image/png" }), { code: "RUN_CONSISTENCY" });
    assert.deepEqual(await readdir(run.evidenceRoot), []);
    assert.deepEqual(await readFile(path.join(run.runRoot, "execution-log.json")), before);
  });
}

test("PNG histogram metadata secrets are rejected without persistence", async t => {
  const { run, event } = await setup(t);
  const before = await readFile(path.join(run.runRoot, "execution-log.json"));
  const secret = Buffer.from("Authorization: Bearer synthetic-test-only");
  const histogram = secret.length % 2 ? Buffer.concat([secret, Buffer.of(0)]) : secret;
  const palette = Buffer.alloc(histogram.length / 2 * 3, 128);
  const bytes = Buffer.concat([image.subarray(0, 33), pngChunk("PLTE", palette), pngChunk("hIST", histogram), image.subarray(33)]);
  await sharp(bytes).raw().toBuffer();
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: "image/png" }), { code: "SECRET_DETECTED" });
  assert.deepEqual(await readdir(run.evidenceRoot), []);
  assert.deepEqual(await readFile(path.join(run.runRoot, "execution-log.json")), before);
});

test("compressed metadata rejects unconsumed trailing bytes", async t => {
  const { run, event } = await setup(t);
  const before = await readFile(path.join(run.runRoot, "execution-log.json"));
  const bytes = insertChunk(image, "zTXt", Buffer.concat([Buffer.from("Comment\0\0"), deflateSync(Buffer.from("ordinary comment")), Buffer.from("Cookie: synthetic-test-only")]));
  await assert.rejects(runtime.archiveScreenshot(run.runRoot, { event, imageBase64: bytes.toString("base64"), mimeType: "image/png" }), { code: "RUN_CONSISTENCY" });
  assert.deepEqual(await readdir(run.evidenceRoot), []);
  assert.deepEqual(await readFile(path.join(run.runRoot, "execution-log.json")), before);
});
