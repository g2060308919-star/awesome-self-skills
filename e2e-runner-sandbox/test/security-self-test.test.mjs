import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { runSelfTest } from "../bin/self-test.mjs";
import { validateSyntheticData } from "../src/security/data-policy.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test("guarded child blocks DNS, public TCP, HTTP, HTTPS, fetch, and WebSocket", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    join(packageRoot, "test", "helpers", "outbound-probe-child.mjs")
  ]);
  const result = JSON.parse(stdout);
  for (const operation of ["dns", "tcp", "http", "https", "fetch", "websocket"]) {
    assert.deepEqual(result[operation], { blocked: true, code: "OUTBOUND_NETWORK_DENIED" });
  }
});

test("canonical fixture contains only documented synthetic data", async () => {
  const fixture = JSON.parse(await readFile(join(packageRoot, "benchmark", "v1", "fixtures", "core-v1.json"), "utf8"));
  assert.deepEqual(validateSyntheticData(fixture), []);
  const unsafe = validateSyntheticData({
    email: "person@gmail.com",
    webhookUrl: "https://hooks.example.com/live",
    password: "secret-value",
    cardNumber: "4111111111111111"
  });
  assert.deepEqual(unsafe.map(({ policy }) => policy).sort(), [
    "credential", "payment", "real-domain", "real-email"
  ]);
});

test("executable self-test proves business, control, bundle, outbox, and Runner isolation", async () => {
  const result = await runSelfTest();
  assert.equal(result.passed, true, JSON.stringify(result));
  for (const name of [
    "bundle-digests", "business-no-control-discovery", "cors-denied", "csp-local-only",
    "cookie-isolation", "control-owner-only", "bad-token-denied", "outbox-only",
    "runner-filesystem-isolation"
  ]) assert.equal(result.checks.find((check) => check.name === name)?.passed, true, name);
});
