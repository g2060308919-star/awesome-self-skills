import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(skillRoot, "scripts/run-artifacts.mjs");
const proxyCli = path.join(skillRoot, "scripts/cdp-fetch-proxy.mjs");
const fixture = path.join(skillRoot, "tests/fixtures/test-cases.json");

async function invoke(args) {
  try {
    const result = await execute(process.execPath, [cli, ...args]);
    return { ...result, code: 0 };
  } catch (error) {
    return { stdout: error.stdout, stderr: error.stderr, code: error.code };
  }
}

test("TASK-02: CLI emits exactly one JSON object and stable input exit code 2", async () => {
  const failure = await invoke(["unknown"]);
  assert.equal(failure.code, 2);
  assert.equal(failure.stderr, "");
  assert.equal(failure.stdout.trim().split("\n").length, 1);
  assert.equal(JSON.parse(failure.stdout).error.code, "INPUT_CONTRACT");
});

test("FR-076: proxy status reads --state and emits one JSON object", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "proxy status "));
  try {
    const state = path.join(root, "state.json");
    await writeFile(state, JSON.stringify({ state: "stopped", pid: 123, targetId: "A", session: "detached" }));
    const result = await execute(process.execPath, [proxyCli, "status", "--state", state]);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.equal(JSON.parse(result.stdout).targetId, "A");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("TASK-02: init/record/report CLI works with spaces and secret input exits 4", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner cli space "));
  try {
    const initialized = await invoke(["init", "--workspace", root, "--cases", fixture]);
    assert.equal(initialized.code, 0);
    const initJson = JSON.parse(initialized.stdout);
    const eventPath = path.join(root, "event.json");
    await writeFile(eventPath, JSON.stringify({
      type: "checkpoint_result",
      checkpoint_id: "CASE-原始-01/step-001/oracle-001",
      result: "passed",
      reason: "页面显示订单号 REQ-9002",
      observation: "页面显示订单号 REQ-9002",
      evidence_status: "not_required"
    }));
    assert.equal((await invoke(["record", "--run", initJson.runRoot, "--event", eventPath])).code, 0);
    assert.equal((await invoke(["report", "--run", initJson.runRoot])).code, 0);
    assert.equal((await readFile(path.join(initJson.runRoot, "report.md"), "utf8")).includes("REQ-9002"), true);

    await writeFile(eventPath, JSON.stringify({ type: "note", token: "fixture-value" }));
    const rejected = await invoke(["record", "--run", initJson.runRoot, "--event", eventPath]);
    assert.equal(rejected.code, 4);
    assert.equal(JSON.parse(rejected.stdout).error.code, "SECRET_DETECTED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("PBH AC-25: CLI accepts the additive workflow profile and returns both compatible report paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner profile cli "));
  try {
    const initialized = await invoke(["init", "--workspace", root, "--cases", fixture, "--workflow-profile", "permission-batches-html-v1"]);
    assert.equal(initialized.code, 0);
    const initJson = JSON.parse(initialized.stdout);
    const log = JSON.parse(await readFile(path.join(initJson.runRoot, "execution-log.json")));
    assert.deepEqual(log.events.map(event => [event.type, event.profile]), [["workflow_profile", "permission-batches-html-v1"]]);

    const eventPath = path.join(root, "plan.json");
    await writeFile(eventPath, JSON.stringify({
      type: "permission_plan",
      version: "1.0",
      groups: [],
      role_independent_case_ids: ["CASE-原始-01"]
    }));
    assert.equal((await invoke(["record", "--run", initJson.runRoot, "--event", eventPath])).code, 0);
    const report = await invoke(["report", "--run", initJson.runRoot]);
    assert.equal(report.code, 0);
    const result = JSON.parse(report.stdout);
    assert.equal(result.reportPath, path.join(initJson.runRoot, "report.md"));
    assert.equal(result.htmlReportPath, path.join(initJson.runRoot, "report.html"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
