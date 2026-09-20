import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent, resumeCheck } from "../scripts/run-artifacts.mjs";

async function fixture(root) {
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "部分恢复", target_urls: ["https://staging.example.test/a", "https://staging.example.test/b"] },
    cases: [
      { case_id: "A", module: "A", title: "A 范围", preconditions: [], steps: [{ step_id: "s", action: "检查 A", expected: [{ oracle_id: "o", text: "A 正常" }] }] },
      { case_id: "B", module: "B", title: "B 范围", preconditions: [], steps: [{ step_id: "s", action: "检查 B", expected: [{ oracle_id: "o", text: "B 正常" }] }] }
    ]
  }));
  return casesPath;
}

test("v1.1 AC-11/37/59: resolving one assistance scope resumes it without waiting for unrelated open assistance", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v11-partial-resume-"));
  try {
    const run = await initializeRun({ workspaceRoot: root, casesPath: await fixture(root), workflowProfile: "permission-batches-html-v2" });
    await recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A", "B"] });
    await recordEvent(run.runRoot, {
      type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: run.snapshotHash, source: "原用例地址",
      items: [
        { checkpoint_id: "A/s/o", scopes: [{ scope_id: "scope-a", group_ids: [], location_ref: "https://staging.example.test/a", location_status: "known", step_refs: ["A/s"], source_refs: ["snapshot:A/s"] }], dependencies: [] },
        { checkpoint_id: "B/s/o", scopes: [{ scope_id: "scope-b", group_ids: [], location_ref: "https://staging.example.test/b", location_status: "known", step_refs: ["B/s"], source_refs: ["snapshot:B/s"] }], dependencies: [] }
      ]
    });
    await recordEvent(run.runRoot, { type: "target_inventory", owned_target_ids: ["target-1"], preexisting_target_ids: [], attached_preexisting_target_ids: [] });
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-a", phase: "requested", checkpoint_ids: ["A/s/o"],
      description: "A 需要人工登录", required_user_action: "完成 A 登录", attempts: ["已打开登录页"], decision_source: "agent"
    });
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-b", phase: "requested", checkpoint_ids: ["B/s/o"],
      description: "B 需要人工登录", required_user_action: "完成 B 登录", attempts: ["已打开登录页"], decision_source: "agent"
    });
    await recordEvent(run.runRoot, {
      type: "coverage_review", review_id: "wait-both", purpose: "wait", plan_revision: 1, based_on_sequence: 6,
      scope_ids: ["scope-a", "scope-b"], checkpoint_ids: ["A/s/o", "B/s/o"], fact_refs: [], assistance_refs: [5, 6],
      ready_scope_ids: [], preparable_scope_ids: [], blocked_scope_ids: ["scope-a", "scope-b"], closures: [],
      choice: "wait", reason: "两个范围都需要用户完成登录"
    });
    await recordEvent(run.runRoot, {
      type: "run_state", status: "awaiting_user", reason: "等待两个登录动作", assistance_ids: ["assist-a", "assist-b"], coverage_review_ref: 7
    });
    await generateReport(run.runRoot);
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-a", phase: "resolved", checkpoint_ids: ["A/s/o"],
      description: "用户已完成 A 登录", decision_source: "user"
    });
    await generateReport(run.runRoot);
    await resumeCheck(run.runRoot);
    await recordEvent(run.runRoot, {
      type: "coverage_context", scope_ids: ["scope-a"], account_ref: null, observed_account_ref: null,
      target_id: "target-1", context_ref: "context-a", environment_ref: "staging", observed_url: "https://staging.example.test/a",
      verification: "verified", switch_status: "not_required", fact_refs: [9, 10]
    });
    await recordEvent(run.runRoot, {
      type: "coverage_review", review_id: "resume-a", purpose: "resume", plan_revision: 1, based_on_sequence: 11,
      scope_ids: ["scope-a"], checkpoint_ids: ["A/s/o"], fact_refs: [9, 10, 11], assistance_refs: [9],
      ready_scope_ids: ["scope-a"], preparable_scope_ids: [], blocked_scope_ids: [], closures: [],
      choice: "resume", reason: "A 已解除阻塞，B 的协作继续开放"
    });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "run_state", status: "running", reason: "恢复已释放的 A 范围", coverage_review_ref: 12
    }));
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_started", checkpoint_id: "A/s/o", scope_ids: ["scope-a"], context_refs: [11]
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
