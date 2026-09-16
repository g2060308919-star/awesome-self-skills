import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeRun, recordEvent, validateRun } from "../scripts/run-artifacts.mjs";
import { derivePermissionState } from "../scripts/lib/permission-batches.mjs";

async function createRun(root) {
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "v2 权限上下文", target_urls: ["https://staging.example.test"] },
    cases: [
      { case_id: "CTX-A", module: "权限", title: "业务行为检查", preconditions: [], steps: [{ step_id: "s", action: "打开功能", expected: [{ oracle_id: "o", text: "显示功能内容" }] }] },
      { case_id: "CTX-B", module: "权限", title: "独立上下文", preconditions: [], steps: [{ step_id: "s", action: "查看其他页面", expected: [{ oracle_id: "o", text: "页面可见" }] }] }
    ]
  }));
  const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
  await recordEvent(run.runRoot, {
    type: "permission_plan", version: "1.0", role_independent_case_ids: [], groups: [
      { group_id: "g-a", role_text: "角色 A", permissions: ["使用功能"], case_ids: ["CTX-A"], checkpoint_ids: ["CTX-A/s/o"], availability: "ready", account_ref: "acct-a", preparation_owner: null, declaration: "用户说明账号 A 已准备" },
      { group_id: "g-b", role_text: "角色 B", permissions: ["查看页面"], case_ids: ["CTX-B"], checkpoint_ids: ["CTX-B/s/o"], availability: "ready", account_ref: "acct-b", preparation_owner: null, declaration: "用户说明账号 B 已准备" }
    ]
  });
  await recordEvent(run.runRoot, {
    type: "target_inventory",
    owned_target_ids: ["target-a", "target-b"],
    preexisting_target_ids: [],
    attached_preexisting_target_ids: []
  });
  return run;
}

function observation(group, account, target, context) {
  return {
    type: "role_observation",
    observation: {
      group_id: group,
      account_ref: account,
      observed_account_ref: account,
      verification_scope: "execution_context",
      verification: "verified",
      target_id: target,
      environment_ref: "staging",
      context_ref: context,
      switch_status: "not_required",
      description: `已核对 ${account} 位于非生产环境的登录上下文`
    }
  };
}

test("AC-19/20: verified execution context allows the tested permission behavior to fail normally", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-context-"));
  try {
    const run = await createRun(root);
    await assert.rejects(
      recordEvent(run.runRoot, { type: "role_observation", observation: { group_id: "g-a", account_ref: "acct-a", verification: "verified", description: "旧 v1 观察" } }),
      error => error.code === "RUN_CONSISTENCY" && /执行上下文/.test(error.message)
    );
    await recordEvent(run.runRoot, observation("g-a", "acct-a", "target-a", "context-a"));
    await recordEvent(run.runRoot, { type: "case_started", case_id: "CTX-A" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: "CTX-A/s/o" });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: "CTX-A/s/o",
      result: "failed",
      reason: "期望显示功能内容，实际页面显示无权限提示",
      observation: "账号和环境正确，页面实际显示无权限",
      evidence_status: "missing"
    }));
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-21/22: v2 rejects a falsely verified account, unknown target, or incomplete switch", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-context-reject-"));
  try {
    const run = await createRun(root);
    for (const [mutate, message] of [
      [value => { value.observation.observed_account_ref = "acct-other"; }, /账号/],
      [value => { value.observation.target_id = "target-unknown"; }, /Target/],
      [value => { value.observation.switch_status = "incomplete"; }, /切换/]
    ]) {
      const event = observation("g-a", "acct-a", "target-a", "context-a");
      mutate(event);
      await assert.rejects(recordEvent(run.runRoot, event), error => error.code === "RUN_CONSISTENCY" && message.test(error.message));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-25: a context change invalidates only unfinished groups in that storage context", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-context-change-"));
  try {
    const run = await createRun(root);
    await recordEvent(run.runRoot, observation("g-a", "acct-a", "target-a", "context-shared"));
    await recordEvent(run.runRoot, observation("g-b", "acct-b", "target-b", "context-b"));
    await recordEvent(run.runRoot, {
      type: "execution_context_change",
      context_ref: "context-shared",
      target_ids: ["target-a"],
      description: "测试页已实际切换登录账号"
    });
    const testCases = JSON.parse(await readFile(path.join(run.runRoot, "test-cases.json"), "utf8"));
    const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
    const state = derivePermissionState(testCases, log);
    assert.equal(state.groups.find(group => group.group_id === "g-a").verification, "stale");
    assert.equal(state.groups.find(group => group.group_id === "g-b").verification, "verified");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
