import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { initializeRun, recordEvent, validateRun } from "../scripts/run-artifacts.mjs";

const fixture = new URL("./fixtures/test-cases.json", import.meta.url);
const checkpointId = "CASE-原始-01/step-001/oracle-001";

async function createCoverageRun(root) {
  const run = await initializeRun({ workspaceRoot: root, casesPath: fixture, workflowProfile: "permission-batches-html-v2" });
  await recordEvent(run.runRoot, {
    type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["CASE-原始-01"]
  });
  await recordEvent(run.runRoot, {
    type: "coverage_plan", action: "initial", revision: 1, snapshot_hash: run.snapshotHash,
    source: "原用例和已确认测试地址",
    items: [{
      checkpoint_id: checkpointId,
      scopes: [{
        scope_id: "scope-order-detail", group_ids: [], location_ref: "https://staging.example.test/orders/REQ-9002",
        location_status: "known", step_refs: ["CASE-原始-01/step-001"], source_refs: ["snapshot:CASE-原始-01/step-001"]
      }],
      dependencies: []
    }]
  });
  await recordEvent(run.runRoot, {
    type: "target_inventory", owned_target_ids: ["target-1"], preexisting_target_ids: [], attached_preexisting_target_ids: []
  });
  await recordEvent(run.runRoot, {
    type: "coverage_context", scope_ids: ["scope-order-detail"], account_ref: null, observed_account_ref: null,
    target_id: "target-1", context_ref: "context-1", environment_ref: "staging",
    observed_url: "https://staging.example.test/orders/REQ-9002", verification: "verified", switch_status: "not_required",
    fact_refs: [4]
  });
  return run;
}

test("v1.1 AC-61/62/63/66: record and replay require scope-bound starts, fact-bound results, and a final audit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v11-coverage-gates-"));
  try {
    const run = await createCoverageRun(root);
    await assert.rejects(recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: checkpointId }), /scope_ids|执行范围/);
    await recordEvent(run.runRoot, {
      type: "checkpoint_started", checkpoint_id: checkpointId,
      scope_ids: ["scope-order-detail"], context_refs: [5]
    });
    await recordEvent(run.runRoot, {
      type: "page_observation", checkpoint_ids: [checkpointId], description: "订单详情显示 REQ-9002",
      scope_ids: ["scope-order-detail"], context_ref: 5
    });
    await assert.rejects(recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: checkpointId, result: "passed", reason: "页面显示订单号",
      observation: "订单号 REQ-9002 可见", evidence_status: "not_required"
    }), /execution_refs|coverage_review_ref/);
    await recordEvent(run.runRoot, {
      type: "coverage_review", review_id: "close-order", purpose: "checkpoint_close", plan_revision: 1,
      based_on_sequence: 7, scope_ids: ["scope-order-detail"], checkpoint_ids: [checkpointId],
      fact_refs: [7], assistance_refs: [], ready_scope_ids: ["scope-order-detail"], preparable_scope_ids: [], blocked_scope_ids: [],
      closures: [{ checkpoint_id: checkpointId, closure_kind: "observed", basis_refs: [7] }],
      choice: "close", reason: "页面真实观察足以判断原预期"
    });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: checkpointId, result: "passed", reason: "页面显示订单号 REQ-9002",
      observation: "订单详情真实显示订单号 REQ-9002", evidence_status: "not_required",
      execution_refs: [7], coverage_review_ref: 8
    });
    await assert.rejects(recordEvent(run.runRoot, {
      type: "run_state", status: "completed", coverage_review_ref: 8
    }), /final|最终/);
    await recordEvent(run.runRoot, {
      type: "coverage_review", review_id: "final-audit", purpose: "final", plan_revision: 1,
      based_on_sequence: 9, scope_ids: ["scope-order-detail"], checkpoint_ids: [checkpointId],
      fact_refs: [7, 9], assistance_refs: [], ready_scope_ids: [], preparable_scope_ids: [], blocked_scope_ids: [],
      closures: [{ checkpoint_id: checkpointId, closure_kind: "observed", basis_refs: [7, 9] }],
      choice: "finish", reason: "全量原检查点与执行范围已逐项核对"
    });
    await recordEvent(run.runRoot, { type: "run_state", status: "completed", coverage_review_ref: 10 });
    await assert.doesNotReject(validateRun(run.runRoot, { checkReport: false }));
    const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
    assert.equal(log.run.status, "completed");
    assert.equal(log.cases[0].result, "passed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.1 AC-55/56/67: an execution-context change invalidates only future work until a fresh site verification", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v11-context-invalidation-"));
  try {
    const run = await createCoverageRun(root);
    await recordEvent(run.runRoot, {
      type: "execution_context_change", context_ref: "context-1", target_ids: ["target-1"],
      description: "测试页面登录会话发生变化"
    });
    await assert.rejects(recordEvent(run.runRoot, {
      type: "checkpoint_started", checkpoint_id: checkpointId,
      scope_ids: ["scope-order-detail"], context_refs: [5]
    }), /失效|新鲜|上下文/);
    await recordEvent(run.runRoot, {
      type: "coverage_context", scope_ids: ["scope-order-detail"], account_ref: null, observed_account_ref: null,
      target_id: "target-1", context_ref: "context-1", environment_ref: "staging",
      observed_url: "https://staging.example.test/orders/REQ-9002", verification: "verified", switch_status: "not_required",
      fact_refs: [6]
    });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_started", checkpoint_id: checkpointId,
      scope_ids: ["scope-order-detail"], context_refs: [7]
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("v1.1 AC-08/40/61: a verified data gap can close an unstarted dependent checkpoint without a fabricated user resolution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v11-data-gap-"));
  try {
    const run = await createCoverageRun(root);
    const blocker = await recordEvent(run.runRoot, {
      type: "blocker", checkpoint_ids: [checkpointId], description: "已检查合法列表入口，接口成功返回空数组",
      exploration_summary: {
        checkpoint_ids: [checkpointId], missing_fact: "可进入详情的业务记录 ID",
        known_facts: ["列表请求返回 200", "响应数组为空"],
        attempts: [{ action: "检查已发布列表的三个结果页", observation: "均无可用记录" }],
        cannot_continue_reason: "缺少真实业务记录 ID"
      }
    });
    const gap = await recordEvent(run.runRoot, {
      type: "data_gap", gap_id: "gap-empty-list", checkpoint_ids: [checkpointId],
      real_blocker_refs: [blocker.sequence], exploration_refs: [blocker.sequence],
      missing_conditions: ["至少一条可进入详情的记录"],
      known_request_facts: ["GET /orders 返回 200 与空数组"],
      not_started_dependencies: ["详情步骤需要列表记录 ID"]
    });
    const review = await recordEvent(run.runRoot, {
      type: "coverage_review", review_id: "close-data-gap", purpose: "checkpoint_close", plan_revision: 1,
      based_on_sequence: gap.sequence, scope_ids: ["scope-order-detail"], checkpoint_ids: [checkpointId],
      fact_refs: [blocker.sequence, gap.sequence], assistance_refs: [], ready_scope_ids: [], preparable_scope_ids: [],
      blocked_scope_ids: ["scope-order-detail"],
      closures: [{ checkpoint_id: checkpointId, closure_kind: "dependency_blocked", basis_refs: [gap.sequence], not_attempted_reason: "详情步骤依赖缺失的真实记录 ID" }],
      choice: "close_undetermined", reason: "合法数据探索已完成且真实前置数据不存在"
    });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: checkpointId, result: "undetermined",
      reason: "真实环境缺少可进入详情的数据", observation: "列表接口成功返回空数组",
      evidence_status: "not_required", exploration_ref: blocker.sequence, data_gap_ref: gap.sequence,
      not_attempted_reason: "详情步骤依赖列表记录 ID", execution_refs: [], coverage_review_ref: review.sequence
    }));
    await assert.doesNotReject(validateRun(run.runRoot, { checkReport: false }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
