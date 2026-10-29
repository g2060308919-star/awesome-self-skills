import { recordFixtureEvent as recordEvent } from "./test-helpers.mjs";
import { recordFixtureScreenshotGaps } from "./test-helpers.mjs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeRun, recordEvent as productionRecordEvent, validateRun } from "../scripts/run-artifacts.mjs";
import { reproducibleFailure } from "../scripts/lib/failed-explanation.mjs";
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
  const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "b2b-e2e-current" });
  await recordEvent(run.runRoot, {
    type: "permission_plan", version: "1.0", role_independent_case_ids: [], groups: [
      { group_id: "g-a", role_text: "角色 A", permissions: ["使用功能"], case_ids: ["CTX-A"], checkpoint_ids: ["CTX-A/s/o"], availability: "ready", account_ref: "acct-a", preparation_owner: null, declaration: "用户说明账号 A 已准备" },
      { group_id: "g-b", role_text: "角色 B", permissions: ["查看页面"], case_ids: ["CTX-B"], checkpoint_ids: ["CTX-B/s/o"], availability: "ready", account_ref: "acct-b", preparation_owner: null, declaration: "用户说明账号 B 已准备" }
    ]
  });
  await recordFixtureScreenshotGaps(run.runRoot);
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

test("permission recovery is accepted by the public Run API and deterministic log replay", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-permission-recovery-"));
  try {
    const casesPath = path.join(root, "recovery-cases.json");
    await writeFile(casesPath, JSON.stringify({
      schema_version: "2.0",
      suite: { name: "权限后补覆盖上下文", target_urls: ["https://staging.example.test/review"] },
      cases: [{
        case_id: "RECOVER", module: "权限", title: "后补账号后执行", preconditions: [],
        steps: [{ step_id: "s", action: "打开审阅页", expected: [{ oracle_id: "o", text: "显示审阅内容" }] }]
      }]
    }));
    const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "b2b-e2e-current" });
    await productionRecordEvent(run.runRoot, {
      type: "permission_plan", version: "1.0", role_independent_case_ids: [], groups: [{
        group_id: "g-recover", role_text: "审阅角色", permissions: ["审阅内容"], case_ids: ["RECOVER"],
        checkpoint_ids: ["RECOVER/s/o"], availability: "user_preparation_required", account_ref: null,
        preparation_owner: "user", declaration: "用户稍后自行准备虚构审阅账号"
      }]
    });
    await productionRecordEvent(run.runRoot, {
      type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: run.snapshotHash,
      source: "不可变用例快照与初始权限拓扑",
      items: [{
        checkpoint_id: "RECOVER/s/o",
        scopes: [{
          scope_id: "scope-recover", group_ids: ["g-recover"], location_ref: "https://staging.example.test/review",
          location_status: "known", step_refs: ["RECOVER/s"], source_refs: ["snapshot:RECOVER/s", "permission:g-recover"]
        }],
        dependencies: []
      }]
    });
    await productionRecordEvent(run.runRoot, {
      type: "target_inventory", owned_target_ids: ["target-recover"], preexisting_target_ids: [], attached_preexisting_target_ids: []
    });
    await productionRecordEvent(run.runRoot, {
      type: "permission_availability", group_id: "g-recover", availability: "ready",
      account_ref: "account-recover", declaration: "用户说明虚构审阅账号已准备"
    });
    await productionRecordEvent(run.runRoot, observation("g-recover", "account-recover", "target-recover", "context-recover"));
    const coverage = await productionRecordEvent(run.runRoot, {
      type: "coverage_context", scope_ids: ["scope-recover"], account_ref: "account-recover",
      observed_account_ref: "account-recover", target_id: "target-recover", context_ref: "context-recover",
      environment_ref: "staging", observed_url: "https://staging.example.test/review", verification: "verified",
      switch_status: "not_required", fact_refs: [5, 6], role_observation_refs: [6]
    });
    const input = await productionRecordEvent(run.runRoot,{type:"page_observation",checkpoint_ids:["RECOVER/s/o"],description:"组件夹具前置记录可用，不代表被测权限成功"});
    const execution = {checkpoint_id:"RECOVER/s/o",scenario_id:"scope-recover",execution_id:"recovered-execution",batch_id:"g-recover"};
    const prepared = await productionRecordEvent(run.runRoot,{type:"scenario_preparation",...execution,context_refs:[coverage.sequence],fact_refs:[input.sequence],data_source:"real",permission_source:"real"});
    await productionRecordEvent(run.runRoot, {
      type: "checkpoint_started", ...execution,preparation_ref:prepared.sequence, checkpoint_id: "RECOVER/s/o",
      scope_ids: ["scope-recover"], context_refs: [coverage.sequence]
    });
    await productionRecordEvent(run.runRoot,{type:"action_dispatched",...execution,action_id:"recover-navigation",side_effect:false});
    const observationEvent = await productionRecordEvent(run.runRoot, { ...execution,
      type: "page_observation", checkpoint_ids: ["RECOVER/s/o"], scope_ids: ["scope-recover"],
      context_ref: coverage.sequence, description: "审阅页面显示目标内容"
    });
    const review = await productionRecordEvent(run.runRoot, {
      type: "coverage_review", review_id: "close-recovered-checkpoint", purpose: "checkpoint_close", plan_revision: 1,
      based_on_sequence: observationEvent.sequence, scope_ids: ["scope-recover"], checkpoint_ids: ["RECOVER/s/o"],
      fact_refs: [observationEvent.sequence], assistance_refs: [], ready_scope_ids: ["scope-recover"],
      preparable_scope_ids: [], blocked_scope_ids: [],
      closures: [{ checkpoint_id: "RECOVER/s/o", closure_kind: "observed", basis_refs: [observationEvent.sequence] }],
      choice: "close", reason: "后补账号范围已完成真实页面观察"
    });
    await productionRecordEvent(run.runRoot, {
      type: "checkpoint_result", ...execution, checkpoint_id: "RECOVER/s/o", result: "passed",
      reason: "审阅页面显示目标内容", observation: "当前虚构账号下目标内容可见", evidence_status: "not_required",
      execution_refs: [observationEvent.sequence], coverage_review_ref: review.sequence
    });

    await assert.doesNotReject(validateRun(run.runRoot, { checkReport: false }));
    await assert.doesNotReject(validateRun(run.runRoot, { checkReport: false }));
    const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
    assert.equal(log.events.find(event => event.type === "permission_plan").groups[0].account_ref, null);
    assert.equal(log.events.find(event => event.type === "permission_availability").account_ref, "account-recover");
    assert.equal(log.cases[0].checkpoints[0].status, "completed");
    assert.equal(log.cases[0].checkpoints[0].result, "passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

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
    const explanation = reproducibleFailure({
      operations: "使用已核验账号打开功能，失败发生在观察功能内容。",
      expected: "显示功能内容",
      actual: "页面实际显示无权限提示，弹窗未出现",
      difference: "期望显示功能内容，实际页面显示无权限提示"
    });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: "CTX-A/s/o",
      result: "failed",
      reason: explanation,
      observation: explanation,
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
