import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  initializeRun,
  recordEvent,
  resumeCheck,
  validateRun
} from "../scripts/run-artifacts.mjs";
import {
  normalizeTestCases,
  validateTestCases
} from "../scripts/lib/contracts.mjs";
import { writeJsonAtomic } from "../scripts/lib/atomic-json.mjs";

const fixturePath = new URL("./fixtures/test-cases.json", import.meta.url);

async function tempRoot(prefix = "runner-test-") {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("AC-001: 100 concurrent initializations have unique Run IDs and no overwrites", async () => {
  const workspace = await tempRoot();
  try {
    const runs = await Promise.all(Array.from({ length: 100 }, () =>
      initializeRun({ workspaceRoot: workspace, casesPath: fixturePath })
    ));
    assert.equal(new Set(runs.map(run => run.runId)).size, 100);
    for (const run of runs) {
      const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json")));
      assert.equal(log.run.run_id, run.runId);
      assert.equal(log.run.workspace_root, ".");
      assert.equal(log.test_cases.path, "./test-cases.json");
      assert.match(log.test_cases.sha256, /^[a-f0-9]{64}$/);
      assert.deepEqual(Object.keys(log), ["schema_version", "run", "test_cases", "browser", "proxy", "cases", "events", "cleanup"]);
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("AC-002/003: snapshot is self-contained and hash mismatch blocks validate/report paths", async () => {
  const workspace = await tempRoot();
  const sourceRoot = await tempRoot();
  const source = path.join(sourceRoot, "input.json");
  await writeFile(source, await readFile(fixturePath));
  try {
    const run = await initializeRun({ workspaceRoot: workspace, casesPath: source });
    await writeFile(source, "{}");
    const snapshot = JSON.parse(await readFile(path.join(run.runRoot, "test-cases.json")));
    assert.equal(snapshot.cases[0].case_id, "CASE-原始-01");

    snapshot.cases[0].title = "tampered";
    await writeJsonAtomic(path.join(run.runRoot, "test-cases.json"), snapshot);
    await assert.rejects(validateRun(run.runRoot), error => error.code === "RUN_HASH_MISMATCH");
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(sourceRoot, { recursive: true, force: true });
  }
});

test("AC-004: original IDs and extra fields remain; missing child IDs are stable", async () => {
  const input = JSON.parse(await readFile(fixturePath));
  const first = normalizeTestCases(input);
  const second = normalizeTestCases(input);
  assert.equal(first.cases[0].case_id, "CASE-原始-01");
  assert.equal(first.cases[0].extra_case_field, "preserve-me");
  assert.equal(first.cases[0].steps[0].step_id, "step-001");
  assert.equal(first.cases[0].steps[0].expected[0].oracle_id, "oracle-001");
  assert.equal(first.cases[0].steps[0].expected[0].extra_oracle_field, 7);
  assert.deepEqual(first, second);
});

test("FR-011: initialized log contains one case/checkpoint skeleton without copied case text", async () => {
  const workspace = await tempRoot();
  try {
    const run = await initializeRun({ workspaceRoot: workspace, casesPath: fixturePath });
    const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json")));
    assert.deepEqual(log.cases[0], {
      case_id: "CASE-原始-01",
      execution_index: null,
      result: "undetermined",
      reason: "检查点尚未全部执行",
      checkpoints: [{
        step_id: "step-001",
        oracle_id: "oracle-001",
        status: "pending",
        result: null,
        reason: null,
        observations: [],
        evidence_refs: [],
        evidence_status: "not_required",
        blocker: null,
        started_at: null,
        completed_at: null
      }]
    });
    assert.equal(JSON.stringify(log).includes("打开订单详情"), false);
    assert.equal(JSON.stringify(log).includes("显示订单号 REQ-9002"), false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("input validation reports an exact field path", () => {
  assert.throws(
    () => validateTestCases({ schema_version: "2.0", suite: {}, cases: [] }),
    error => error.code === "INPUT_CONTRACT" && error.path === "$.suite.name"
  );
});

test("FR-001: case IDs are required and case/step/oracle IDs are unique at their scope", async () => {
  const valid = JSON.parse(await readFile(fixturePath));
  const noCaseId = structuredClone(valid);
  delete noCaseId.cases[0].case_id;
  assert.throws(() => validateTestCases(noCaseId), error => error.path === "$.cases[0].case_id");

  const duplicateSteps = structuredClone(valid);
  duplicateSteps.cases[0].steps = [
    { step_id: "same", action: "一", expected: [{ oracle_id: "o1", text: "一" }] },
    { step_id: "same", action: "二", expected: [{ oracle_id: "o2", text: "二" }] }
  ];
  assert.throws(() => validateTestCases(duplicateSteps), error => error.path === "$.cases[0].steps[1].step_id");

  const duplicateOracles = structuredClone(valid);
  duplicateOracles.cases[0].steps[0].expected = [
    { oracle_id: "same", text: "一" }, { oracle_id: "same", text: "二" }
  ];
  assert.throws(() => validateTestCases(duplicateOracles), error => error.path.endsWith("expected[1].oracle_id"));
});

test("AC-010: serialization interruption never corrupts an existing JSON file", async () => {
  const root = await tempRoot();
  const file = path.join(root, "state.json");
  try {
    await writeJsonAtomic(file, { stable: true });
    const circular = {};
    circular.self = circular;
    await assert.rejects(writeJsonAtomic(file, circular));
    assert.deepEqual(JSON.parse(await readFile(file)), { stable: true });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-011: resume-check lists dispatched but unconfirmed side effects without replay", async () => {
  const workspace = await tempRoot();
  try {
    const run = await initializeRun({ workspaceRoot: workspace, casesPath: fixturePath });
    await recordEvent(run.runRoot, {
      type: "action_dispatched",
      action_id: "write-1",
      checkpoint_id: "CASE-原始-01/step-001/oracle-001",
      side_effect: true,
      description: "提交订单变更"
    });
    const check = await resumeCheck(run.runRoot);
    assert.deepEqual(check.possibly_committed_actions.map(x => x.action_id), ["write-1"]);
    assert.equal(check.auto_replay_allowed, false);
    assert.equal(check.reverify.includes("页面"), true);
    assert.equal(check.reverify.includes("角色"), true);
    assert.equal(check.reverify.includes("代理"), true);
    assert.equal(check.last_completed_checkpoint, null);
    assert.equal(JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"))).run.resume_count, 1);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("AC-026: document, Skill, and workspace roots with spaces remain independent", async () => {
  const parent = await tempRoot("runner roots ");
  const workspace = path.join(parent, "workspace root");
  const documentRoot = path.join(parent, "document bundle");
  const skillRoot = path.join(parent, "installed skill");
  await Promise.all([
    (await import("node:fs/promises")).mkdir(workspace),
    (await import("node:fs/promises")).mkdir(documentRoot),
    (await import("node:fs/promises")).mkdir(skillRoot)
  ]);
  const source = path.join(documentRoot, "test cases.json");
  await writeFile(source, await readFile(fixturePath));
  try {
    const run = await initializeRun({ workspaceRoot: workspace, casesPath: source });
    assert.equal(run.runRoot.startsWith(path.join(workspace, "b2b-e2e-runs") + path.sep), true);
    assert.equal(run.runRoot.startsWith(documentRoot), false);
    assert.equal(run.runRoot.startsWith(skillRoot), false);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test("NFR-002: a caller-supplied Run ID cannot escape the workspace", async () => {
  const workspace = await tempRoot();
  try {
    await assert.rejects(
      initializeRun({ workspaceRoot: workspace, casesPath: fixturePath, runId: "../../outside" }),
      error => error.code === "INPUT_CONTRACT"
    );
  } finally { await rm(workspace, { recursive: true, force: true }); }
});

test("FR-050/083: evidence references stay under evidence/ and must exist", async () => {
  const workspace = await tempRoot();
  try {
    const run = await initializeRun({ workspaceRoot: workspace, casesPath: fixturePath });
    await writeFile(path.join(run.evidenceRoot, "observation.json"), JSON.stringify({ text: "订单 REQ-9002 可见" }));
    await recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: "CASE-原始-01/step-001/oracle-001",
      result: "passed",
      reason: "页面显示订单号 REQ-9002",
      observation: "结构化页面观察显示订单号 REQ-9002",
      evidence_status: "complete",
      evidence: [{
        evidence_id: "EV-001",
        at: "2026-09-11T00:00:00.000Z",
        description: "订单详情结构化观察",
        checkpoint_ids: ["CASE-原始-01/step-001/oracle-001"],
        path: "evidence/observation.json"
      }]
    });
    await assert.doesNotReject(validateRun(run.runRoot));
    await assert.rejects(recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: "CASE-原始-01/step-001/oracle-001",
      result: "passed",
      reason: "越界证据",
      observation: "越界证据",
      evidence_status: "complete",
      evidence: [{ evidence_id: "EV-X", description: "越界", checkpoint_ids: [], path: "../outside.txt" }]
    }), error => error.code === "RUN_CONSISTENCY");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("FR-054: a secret in an evidence file blocks validation and report publication", async () => {
  const workspace = await tempRoot();
  try {
    const run = await initializeRun({ workspaceRoot: workspace, casesPath: fixturePath });
    await writeFile(path.join(run.evidenceRoot, "unsafe.txt"), "Authorization: Bearer fixture-secret");
    await assert.rejects(validateRun(run.runRoot), error => error.code === "SECRET_DETECTED");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
