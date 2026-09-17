import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { applyTransition, createRun, loadRun } from "../scripts/run.mjs";

const request = {
  schema_version: "1.0",
  prd_sources: ["docs/prd.md"],
  target_urls: ["https://example.invalid"]
};

test("createRun chooses a unique opaque Run ID and atomically creates the two initial files", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-run-"));
  const first = await createRun({ workspaceRoot: workspace, request });
  const second = await createRun({ workspaceRoot: workspace, request });
  assert.notEqual(first.run_root, second.run_root);
  assert.match(path.basename(first.run_root), /^\d{8}T\d{9}Z-[a-f0-9]{12}$/);
  assert.deepEqual((await readdir(first.run_root)).sort(), ["request.json", "workflow-state.json"]);
  const loaded = await loadRun(first.run_root);
  assert.equal(loaded.request.suite_name, "PRD E2E");
  assert.equal(loaded.state.stage, "intake");
  assert.equal(loaded.state.run_id, path.basename(first.run_root));
  assert.doesNotThrow(() => JSON.parse(loaded.state_text));
});

test("applyTransition persists an idempotent event once", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-transition-"));
  const run = await createRun({ workspaceRoot: workspace, request });
  const event = {
    event_id: "EVENT-1",
    expected_seq: 0,
    type: "case_generation_started",
    refs: { generation: { run_root: "/safe/generator" } }
  };
  const first = await applyTransition({ runRoot: run.run_root, event });
  const second = await applyTransition({ runRoot: run.run_root, event });
  assert.deepEqual(second, first);
  assert.equal((await loadRun(run.run_root)).state.history.length, 1);
});

test("loadRun rejects symlink substitution and paths outside an outer Run", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-safe-path-"));
  await assert.rejects(() => loadRun(workspace), error => error.code === "RUN_INTEGRITY");
});

test("createRun rejects a symlinked e2e-runs container before writing outside the workspace", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-workspace-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-outside-"));
  await symlink(outside, path.join(workspace, "e2e-runs"));
  await assert.rejects(
    () => createRun({ workspaceRoot: workspace, request }),
    error => error.code === "RUN_INTEGRITY"
  );
  assert.deepEqual(await readdir(outside), []);
});

test("loadRun rejects a corrupted workflow-state.json before recovery", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "prd-e2e-corrupt-state-"));
  const run = await createRun({ workspaceRoot: workspace, request });
  const state = JSON.parse(await readFile(path.join(run.run_root, "workflow-state.json"), "utf8"));
  state.status = "completed";
  await writeFile(path.join(run.run_root, "workflow-state.json"), `${JSON.stringify(state)}\n`);
  await assert.rejects(() => loadRun(run.run_root), error => error.code === "RUN_INTEGRITY");
});
