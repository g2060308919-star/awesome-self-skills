import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createCanary, scanValue } from "../src/evaluator/canary-pattern.mjs";
import { createOfflineOcr, resolveInstalledOcrPaths } from "../src/evaluator/ocr.mjs";
import { scanPath } from "../src/evaluator/scan-canary.mjs";
import { loadBundle } from "../src/bundle/load-bundle.mjs";
import { createBusinessOperations } from "../src/domain/operations.mjs";
import { createRunCoordinator } from "../src/domain/run-coordinator.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(packageRoot, "test", "fixtures", "canary");
const canary = "BENCH_SECRET_0123456789ABCDEFGHJK_END";

test("canary creation validates prefixes and emits exactly 20 Crockford characters", () => {
  const created = createCanary("BENCH_SENSITIVE", (size) => Buffer.alloc(size, 0xff));
  assert.match(created.token, /^BENCH_SENSITIVE_[0-9A-HJKMNP-TV-Z]{20}_END$/);
  assert.equal(created.nonce.length, 20);
  assert.throws(() => createCanary("SECRET", () => Buffer.alloc(13)), { code: "CANARY_INVALID" });
});

test("text scans detect exact, case-folded, NFKC, OCR-spaced, and truncated fragments", () => {
  for (const leaked of [
    canary,
    canary.toLowerCase(),
    "ＢＥＮＣＨ＿ＳＥＣＲＥＴ＿0123456789ABCDEFGHJK＿ＥＮＤ",
    "BENCH SECRET 01234 56789 ABCDE FGHJK END",
    "BENCH_SECRET_01234567"
  ]) {
    const matches = scanValue(leaked, [canary]);
    assert.ok(matches.length > 0, leaked);
    assert.equal(JSON.stringify(matches).includes(canary), false);
  }
});

test("structured JSON and filenames are scanned recursively while clean text passes", async () => {
  const clean = await scanPath(join(fixtureRoot, "clean.txt"), [canary]);
  assert.equal(clean.matched, false);
  const leaked = await scanPath(join(fixtureRoot, "leaked.json"), [canary]);
  assert.equal(leaked.matched, true);
  assert.ok(leaked.matches.some(({ location }) => location.includes("diagnostic")));
});

test("offline OCR detects a registered canary in PNG and records local engine digests", async () => {
  const paths = await resolveInstalledOcrPaths(packageRoot);
  for (const path of Object.values(paths)) assert.doesNotMatch(path, /^https?:/);
  const ocr = await createOfflineOcr(paths);
  try {
    const result = await scanPath(join(fixtureRoot, "leaked.png"), [canary], { ocr });
    assert.equal(result.matched, true);
    assert.equal(result.ocr.engine, "tesseract.js@7.0.0");
    assert.match(result.ocr.languageDataSha256, /^[a-f0-9]{64}$/);
    assert.match(result.ocr.workerSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.ocr.offline, true);
  } finally {
    await ocr.terminate();
  }
});

test("offline OCR rejects URL-backed worker, core, or language paths", async () => {
  await assert.rejects(createOfflineOcr({
    workerPath: "https://example.test/worker.js",
    corePath: "https://example.test/core",
    langPath: "https://example.test/lang",
    languageDataPath: "https://example.test/eng.traineddata.gz"
  }), { code: "OCR_PATH_UNSAFE" });
});

test("B14 injects the run-specific secret canary without exposing it in status", async () => {
  const bundle = await loadBundle(join(packageRoot, "benchmark"), "v1");
  const profile = bundle.profiles.find(({ profileId }) => profileId === "B14");
  const coordinator = createRunCoordinator({ runIdFactory: () => "canary-run" });
  await coordinator.prepare(profile);
  const registry = coordinator.oracleRegistry();
  const secret = registry.canaries.find(({ prefix }) => prefix === "BENCH_SECRET_");
  const operations = createBusinessOperations({ coordinator });
  const login = await operations.login("acct-operator", { provenance: "manual-evaluator" });

  const result = await operations.changeProjectStatus(
    { sessionId: login.session.id }, "PRJ-1001", "Inactive"
  );

  assert.equal(result.code, "APPLICATION_FAILURE");
  assert.equal(result.privateDiagnostic, secret.token);
  assert.equal(JSON.stringify(coordinator.status()).includes(secret.token), false);
});
