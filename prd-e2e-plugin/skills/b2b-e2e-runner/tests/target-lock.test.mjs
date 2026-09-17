import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { TargetLock } from "../scripts/lib/target-lock.mjs";

async function root() {
  return mkdtemp(path.join(os.tmpdir(), "target-lock-"));
}

test("AC-020: different targets can lock concurrently and the same target fails closed", async () => {
  const lockRoot = await root();
  const first = new TargetLock({ root: lockRoot, endpoint: "http://127.0.0.1:9222", targetId: "A" });
  const secondTarget = new TargetLock({ root: lockRoot, endpoint: "http://127.0.0.1:9222", targetId: "B" });
  const duplicate = new TargetLock({ root: lockRoot, endpoint: "http://127.0.0.1:9222", targetId: "A" });
  try {
    await Promise.all([first.acquire(), secondTarget.acquire()]);
    await assert.rejects(duplicate.acquire(), error => error.code === "TARGET_ALREADY_OWNED");
  } finally {
    await first.release();
    await secondTarget.release();
    await rm(lockRoot, { recursive: true, force: true });
  }
});

test("AC-021: a lock is reclaimed only when heartbeat expired and owner process is dead", async () => {
  const lockRoot = await root();
  const stale = new TargetLock({
    root: lockRoot,
    endpoint: "http://127.0.0.1:9222",
    targetId: "stale",
    staleAfterMs: 10,
    pid: 999_999_999
  });
  await mkdir(stale.lockPath, { recursive: true });
  await writeFile(stale.ownerFile, JSON.stringify({
    runId: "old",
    pid: 999_999_999,
    ownerToken: "old",
    createdAt: "2000-01-01T00:00:00.000Z",
    heartbeatAt: "2000-01-01T00:00:00.000Z"
  }));
  const replacement = new TargetLock({
    root: lockRoot,
    endpoint: "http://127.0.0.1:9222",
    targetId: "stale",
    staleAfterMs: 10
  });
  try {
    await replacement.acquire();
    const owner = JSON.parse(await readFile(replacement.ownerFile, "utf8"));
    assert.equal(owner.ownerToken, replacement.ownerToken);
  } finally {
    await replacement.release();
    await rm(lockRoot, { recursive: true, force: true });
  }
});

test("AC-021/022: live or fresh locks cannot be reclaimed and a non-owner cannot release", async () => {
  const lockRoot = await root();
  const owner = new TargetLock({ root: lockRoot, endpoint: "http://127.0.0.1:9222", targetId: "live" });
  const intruder = new TargetLock({ root: lockRoot, endpoint: "http://127.0.0.1:9222", targetId: "live" });
  try {
    await owner.acquire();
    await assert.rejects(intruder.acquire(), error => error.code === "TARGET_ALREADY_OWNED");
    await assert.rejects(intruder.release(), error => error.code === "LOCK_OWNER_MISMATCH");
  } finally {
    await owner.release();
    await rm(lockRoot, { recursive: true, force: true });
  }
});
