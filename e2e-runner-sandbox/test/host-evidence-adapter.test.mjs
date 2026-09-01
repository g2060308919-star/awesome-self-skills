import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createCodexSourcePackage,
  readHostSourcePackage
} from "../src/host-evidence/source-package.mjs";
import {
  detectCodexRollout,
  normalizeCodexRollout
} from "../src/host-evidence/codex-rollout-adapter.mjs";

const fixturePath = new URL("./fixtures/host-evidence/codex-rollout.jsonl", import.meta.url);

async function tempDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "host-evidence-adapter-"));
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function createPackage(t, overrides = {}) {
  const directory = await tempDirectory(t);
  return createCodexSourcePackage({
    sourcePath: fixturePath,
    outputDirectory: join(directory, "source-package"),
    authorization: {
      explicit: true,
      actor: "fixture-author",
      authorizedAt: "2026-09-01T02:00:00.000Z"
    },
    trustLevel: "recorded-fixture",
    ...overrides
  });
}

test("explicit Codex rollout export is detected, integrity-bound, and normalized", async (t) => {
  const created = await createPackage(t);
  const source = await readHostSourcePackage(created.packageDirectory);
  const detection = await detectCodexRollout(source);
  const normalized = await normalizeCodexRollout(source);

  assert.deepEqual(detection, { confidence: 1, formatVersion: "codex-rollout-v1" });
  assert.equal(source.manifest.sessionId, undefined);
  assert.match(source.manifest.sessionDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(source.manifest.sourceManifestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(source.manifest.authorization.explicit, true);
  assert.equal(source.manifest.trustLevel, "recorded-fixture");
  assert.equal(normalized.events.length, 3);
  assert.deepEqual(normalized.events.map(({ sequence }) => sequence), [1, 2, 3]);
  assert.deepEqual(normalized.events.map(({ tool }) => tool), [
    "navigate_page", "take_snapshot", "unknown"
  ]);
  assert.equal(normalized.events[0].toolNamespace, "chrome-devtools-mcp");
  assert.equal(normalized.events[0].targetOrigin, "http://127.0.0.1:43100");
  assert.equal(normalized.events[0].scopeConfirmed, true);
  assert.ok(normalized.events.every(({ schemaVersion }) => schemaVersion === "host-event-v1"));
  assert.ok(normalized.events.every(({ sourceEventDigest }) => /^sha256:[a-f0-9]{64}$/.test(sourceEventDigest)));
  assert.match(normalized.normalizedEventsDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(normalized).includes("snapshot redacted"), false);
});

test("export requires explicit authorization and a supported trust level", async (t) => {
  await assert.rejects(createPackage(t, {
    authorization: { explicit: false, actor: "fixture-author", authorizedAt: "2026-09-01T02:00:00.000Z" }
  }), { code: "HOST_EXPORT_UNAUTHORIZED" });
  await assert.rejects(createPackage(t, { trustLevel: "claimed-native" }), {
    code: "HOST_EXPORT_UNSUPPORTED"
  });
});

test("repeating the same explicit export is idempotent and never rewrites another package", async (t) => {
  const directory = await tempDirectory(t);
  const outputDirectory = join(directory, "source-package");
  const options = {
    sourcePath: fixturePath,
    outputDirectory,
    authorization: {
      explicit: true, actor: "fixture-author", authorizedAt: "2026-09-01T02:00:00.000Z"
    },
    trustLevel: "recorded-fixture"
  };
  const first = await createCodexSourcePackage(options);
  const second = await createCodexSourcePackage(options);
  assert.equal(second.manifest.sourceManifestDigest, first.manifest.sourceManifestDigest);
  await assert.rejects(createCodexSourcePackage({ ...options, trustLevel: "operator-attested" }), {
    code: "HOST_EXPORT_INTEGRITY_FAILED"
  });
});

test("package reader rejects source tampering", async (t) => {
  const created = await createPackage(t);
  await writeFile(created.sourcePath, "{}\n", "utf8");
  await assert.rejects(readHostSourcePackage(created.packageDirectory), {
    code: "HOST_EXPORT_INTEGRITY_FAILED"
  });
});

test("package reader rejects unsafe permissions and symlink-like package inputs", async (t) => {
  const created = await createPackage(t);
  await chmod(created.manifestPath, 0o644);
  await assert.rejects(readHostSourcePackage(created.packageDirectory), {
    code: "HOST_EXPORT_INTEGRITY_FAILED"
  });
});

test("adapter rejects multiple session boundaries", async (t) => {
  const directory = await tempDirectory(t);
  const sourcePath = join(directory, "mixed.jsonl");
  const fixture = await readFile(fixturePath, "utf8");
  await writeFile(sourcePath, `${fixture}{"timestamp":"2026-09-01T03:00:00.000Z","type":"session_meta","payload":{"id":"other-session","cwd":"/private/workspace","cli_version":"1.2.3","source":"codex_app"}}\n`, "utf8");
  const created = await createPackage(t, { sourcePath });
  const source = await readHostSourcePackage(created.packageDirectory);
  await assert.rejects(normalizeCodexRollout(source), { code: "HOST_SESSION_MISMATCH" });
});

test("adapter rejects output-before-call and incomplete call ordering", async (t) => {
  const directory = await tempDirectory(t);
  const sourcePath = join(directory, "unordered.jsonl");
  await writeFile(sourcePath, [
    { timestamp: "2026-09-01T01:00:00.000Z", type: "session_meta", payload: { id: "session-order", cli_version: "1", source: "codex_app" } },
    { timestamp: "2026-09-01T01:00:01.000Z", type: "response_item", payload: { type: "function_call_output", call_id: "missing", output: "done" } }
  ].map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
  const created = await createPackage(t, { sourcePath });
  const source = await readHostSourcePackage(created.packageDirectory);
  await assert.rejects(normalizeCodexRollout(source), { code: "HOST_EVENT_ORDER_INVALID" });
});

test("adapter rejects unsupported JSONL instead of treating it as Host evidence", async (t) => {
  const directory = await tempDirectory(t);
  const sourcePath = join(directory, "handwritten.jsonl");
  await writeFile(sourcePath, "{\"event\":\"runner says click happened\"}\n", "utf8");
  const created = await createPackage(t, {
    sourcePath,
    trustLevel: "runner-self-reported"
  });
  const source = await readHostSourcePackage(created.packageDirectory);
  await assert.rejects(normalizeCodexRollout(source), { code: "HOST_EXPORT_UNSUPPORTED" });
});

test("adapter preserves user and Runner message provenance as digests without raw text", async (t) => {
  const directory = await tempDirectory(t);
  const sourcePath = join(directory, "messages.jsonl");
  await writeFile(sourcePath, [
    { timestamp: "2026-09-01T01:00:00.000Z", type: "session_meta", payload: { id: "session-messages", cli_version: "1", source: "codex_app" } },
    { timestamp: "2026-09-01T01:00:01.000Z", type: "response_item", payload: { type: "message", role: "assistant", content: [{ type: "output_text", text: "Please log in manually" }] } },
    { timestamp: "2026-09-01T01:00:02.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "done" }] } }
  ].map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
  const created = await createPackage(t, { sourcePath });
  const source = await readHostSourcePackage(created.packageDirectory);
  const normalized = await normalizeCodexRollout(source);

  assert.deepEqual(normalized.events.map(({ actor, type }) => [actor, type]), [
    ["runner", "message_completed"], ["user", "message_completed"]
  ]);
  assert.ok(normalized.events.every(({ contentDigest }) => /^sha256:[a-f0-9]{64}$/.test(contentDigest)));
  assert.equal(JSON.stringify(normalized).includes("Please log in manually"), false);
});

test("a recognized rollout with an unknown event fails with HOST_EVENT_UNKNOWN", async (t) => {
  const directory = await tempDirectory(t);
  const sourcePath = join(directory, "unknown-event.jsonl");
  await writeFile(sourcePath, [
    { timestamp: "2026-09-01T01:00:00.000Z", type: "session_meta", payload: { id: "session-unknown", cli_version: "1", source: "codex_app" } },
    { timestamp: "2026-09-01T01:00:01.000Z", type: "future_private_event", payload: {} }
  ].map((line) => JSON.stringify(line)).join("\n") + "\n", "utf8");
  const created = await createPackage(t, { sourcePath });
  const source = await readHostSourcePackage(created.packageDirectory);
  assert.equal((await detectCodexRollout(source)).confidence, 1);
  await assert.rejects(normalizeCodexRollout(source), { code: "HOST_EVENT_UNKNOWN" });
});
