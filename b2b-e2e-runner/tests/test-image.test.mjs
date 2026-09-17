import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
const cli = fileURLToPath(new URL("../scripts/create-test-image.mjs", import.meta.url));

test("ordinary upload helper creates actual non-sensitive PNG with requested dimensions, never overwrites", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-upload-input-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = path.join(root, "test-input.png");
  const execute = (...extra) => spawnSync(process.execPath, [cli, "--output", output, "--width", "320", "--height", "180", ...extra], { encoding: "utf8" });
  const first = execute();
  assert.equal(first.status, 0, first.stdout + first.stderr);
  assert.equal(JSON.parse(first.stdout).kind, "test_input_not_evidence");
  const bytes = await readFile(output);
  assert.equal(bytes.readUInt32BE(16), 320);
  assert.equal(bytes.readUInt32BE(20), 180);
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.subarray(offset + 4, offset + 8).toString() === "IDAT") chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.equal(inflateSync(Buffer.concat(chunks)).length, (320 * 3 + 1) * 180);
  assert.notEqual(execute().status, 0);
  assert.deepEqual(await readFile(output), bytes);
});

test("upload image helper rejects invalid size and unsupported extension", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-upload-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [width, extension] of [["0", "png"], ["99999", "png"], ["12.2", "png"], ["10", "jpg"]]) {
    const result = spawnSync(process.execPath, [cli, "--output", path.join(root, `input.${extension}`), "--width", width, "--height", "10"], { encoding: "utf8" });
    assert.equal(result.status, 2);
  }
});
