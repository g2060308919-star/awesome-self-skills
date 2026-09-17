import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent, resumeCheck } from "../scripts/run-artifacts.mjs";

async function createRun(root) {
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "v2 协作与探索", target_urls: ["https://staging.example.test"] },
    cases: [
      { case_id: "BLOCKED", module: "审核", title: "需要用户协作", preconditions: [], steps: [{ step_id: "s", action: "核对目标", expected: [{ oracle_id: "o", text: "显示已审核记录" }] }] },
      { case_id: "INDEPENDENT", module: "公共", title: "独立检查", preconditions: [], steps: [{ step_id: "s", action: "查看公共状态", expected: [{ oracle_id: "o", text: "页面显示可用" }] }] }
    ]
  }));
  const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
  await recordEvent(run.runRoot, {
    type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["BLOCKED", "INDEPENDENT"]
  });
  return run;
}

const blockedCheckpoint = "BLOCKED/s/o";
const independentCheckpoint = "INDEPENDENT/s/o";

function explorationSummary(checkpointIds = [blockedCheckpoint]) {
  return {
    checkpoint_ids: checkpointIds,
    missing_fact: "缺少只能由用户完成的当前审核状态确认",
    known_facts: ["已打开正确的非生产页面", "当前页面未显示可判定的状态"],
    attempts: [{ action: "查看目标记录详情", observation: "详情页未提供当前审核状态" }],
    cannot_continue_reason: "状态仅能在用户完成外部审核后可见"
  };
}

test("AC-23/24/28/40: an open assistance request blocks final undetermined but not independent work", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-assistance-open-"));
  try {
    const run = await createRun(root);
    const blocker = await recordEvent(run.runRoot, {
      type: "blocker",
      checkpoint_ids: [blockedCheckpoint],
      description: "当前缺少审核状态事实",
      exploration_summary: explorationSummary()
    });
    await recordEvent(run.runRoot, {
      type: "assistance",
      assistance_id: "assist-review",
      phase: "requested",
      checkpoint_ids: [blockedCheckpoint],
      description: "需要用户完成外部审核并说明完成情况",
      required_user_action: "请完成该记录的外部审核后通知 Runner",
      attempts: ["已核对当前页面和记录详情"],
      decision_source: "agent"
    });

    await assert.rejects(recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: blockedCheckpoint,
      result: "undetermined",
      reason: "用户尚未完成协作，当前无法核对审核状态",
      observation: "协作事项仍在等待",
      evidence_status: "missing",
      exploration_ref: blocker.sequence
    }), error => error.code === "RUN_CONSISTENCY" && /未解决协作/.test(error.message));

    await recordEvent(run.runRoot, { type: "case_started", case_id: "INDEPENDENT" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: independentCheckpoint });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: independentCheckpoint,
      result: "passed",
      reason: "公共状态页明确显示可用",
      observation: "页面显示可用",
      evidence_status: "missing"
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-26/27/39: explicit user unavailability enables only the covered checkpoint to end undetermined", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-assistance-end-"));
  try {
    const run = await createRun(root);
    const blocker = await recordEvent(run.runRoot, {
      type: "blocker",
      checkpoint_ids: [blockedCheckpoint],
      description: "当前缺少用户才能提供的外部状态",
      exploration_summary: explorationSummary()
    });
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "requested", checkpoint_ids: [blockedCheckpoint],
      description: "请用户核对外部状态", required_user_action: "核对并通知当前状态",
      attempts: [], decision_source: "agent"
    });
    const ended = await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "unavailable", checkpoint_ids: [blockedCheckpoint],
      description: "用户明确说明本轮无法协助核对", decision_source: "user"
    });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: blockedCheckpoint,
      result: "undetermined",
      reason: "缺少外部审核状态，用户明确本轮无法协助",
      observation: "已保留现有页面事实，未伪造审核结果",
      evidence_status: "missing",
      exploration_ref: blocker.sequence,
      resolution_ref: ended.sequence
    }));
    await assert.rejects(recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: independentCheckpoint,
      result: "undetermined",
      reason: "不应借用其他事项的结束依据",
      observation: "无",
      evidence_status: "missing",
      exploration_ref: blocker.sequence,
      resolution_ref: ended.sequence
    }), error => error.code === "RUN_CONSISTENCY" && /影响范围|检查点/.test(error.message));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-17/24: awaiting_user must point to an open assistance request and explain the pause", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-awaiting-"));
  try {
    const run = await createRun(root);
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "requested", checkpoint_ids: [blockedCheckpoint],
      description: "需要用户完成外部操作", required_user_action: "完成后通知 Runner",
      attempts: ["已确认该操作必须人工完成"], decision_source: "agent"
    });
    await assert.rejects(
      recordEvent(run.runRoot, { type: "run_state", status: "awaiting_user" }),
      error => error.code === "RUN_CONSISTENCY" && /协作|暂停/.test(error.message)
    );
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "run_state",
      status: "awaiting_user",
      reason: "当前没有其他可安全继续的检查",
      assistance_ids: ["assist-review"]
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-25/28: resuming a global v2 pause requires resume-check and resolution of its assistance scope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-resume-gates-"));
  try {
    const run = await createRun(root);
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "requested", checkpoint_ids: [blockedCheckpoint],
      description: "需要用户完成外部操作", required_user_action: "完成后通知 Runner", attempts: [], decision_source: "agent"
    });
    await recordEvent(run.runRoot, {
      type: "run_state", status: "awaiting_user", reason: "没有独立工作可继续", assistance_ids: ["assist-review"]
    });
    await generateReport(run.runRoot);
    await assert.rejects(
      recordEvent(run.runRoot, { type: "run_state", status: "running" }),
      error => error.code === "RUN_CONSISTENCY" && /resume-check/.test(error.message)
    );
    await resumeCheck(run.runRoot);
    await assert.rejects(
      recordEvent(run.runRoot, { type: "run_state", status: "running" }),
      error => error.code === "RUN_CONSISTENCY" && /协作事项/.test(error.message)
    );
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "resolved", checkpoint_ids: [blockedCheckpoint],
      description: "用户已完成外部操作", decision_source: "user"
    });
    await assert.doesNotReject(recordEvent(run.runRoot, { type: "run_state", status: "running" }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-23/28: a v2 permission wait must reference the same open assistance item and exact scope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-permission-assistance-"));
  try {
    const casesPath = path.join(root, "cases.json");
    await writeFile(casesPath, JSON.stringify({
      schema_version: "2.0",
      suite: { name: "v2 权限协作关联", target_urls: ["https://staging.example.test"] },
      cases: [{
        case_id: "NEEDS-ROLE", module: "权限", title: "等待指定权限", preconditions: [],
        steps: [{ step_id: "s", action: "核对权限页面", expected: [{ oracle_id: "o", text: "显示授权信息" }] }]
      }]
    }));
    const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
    await recordEvent(run.runRoot, {
      type: "permission_plan", version: "1.0", role_independent_case_ids: [],
      groups: [{
        group_id: "g-review", role_text: "需审核权限", permissions: ["查看授权信息"], case_ids: ["NEEDS-ROLE"],
        checkpoint_ids: ["NEEDS-ROLE/s/o"], availability: "user_preparation_required", account_ref: "account-review",
        preparation_owner: "user", declaration: "用户需要准备该账号的查看权限"
      }]
    });
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "requested", checkpoint_ids: ["NEEDS-ROLE/s/o"],
      group_ids: ["g-review"], description: "该账号尚缺查看授权信息的权限", required_user_action: "请完成权限准备后通知 Runner",
      attempts: [], decision_source: "agent"
    });

    await assert.rejects(recordEvent(run.runRoot, {
      type: "permission_wait", group_id: "g-review", checkpoint_ids: ["NEEDS-ROLE/s/o"], reason: "等待用户准备权限"
    }), error => error.code === "RUN_CONSISTENCY" && /assistance_id/.test(error.message));
    await assert.rejects(recordEvent(run.runRoot, {
      type: "permission_wait", assistance_id: "missing", group_id: "g-review", checkpoint_ids: ["NEEDS-ROLE/s/o"], reason: "等待用户准备权限"
    }), error => error.code === "RUN_CONSISTENCY" && /协作事项/.test(error.message));
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "permission_wait", assistance_id: "assist-review", group_id: "g-review", checkpoint_ids: ["NEEDS-ROLE/s/o"], reason: "等待用户准备权限"
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-26/28: v2 stop_waiting ends only its permission scope without the legacy decision field", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-stop-waiting-"));
  try {
    const casesPath = path.join(root, "cases.json");
    await writeFile(casesPath, JSON.stringify({
      schema_version: "2.0",
      suite: { name: "v2 停止等待", target_urls: ["https://staging.example.test"] },
      cases: [{
        case_id: "WAIT", module: "权限", title: "等待指定权限", preconditions: [],
        steps: [{ step_id: "s", action: "核对目标", expected: [{ oracle_id: "o", text: "显示目标信息" }] }]
      }]
    }));
    const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
    await recordEvent(run.runRoot, {
      type: "permission_plan", version: "1.0", role_independent_case_ids: [],
      groups: [{
        group_id: "g-wait", role_text: "待准备角色", permissions: ["查看目标"], case_ids: ["WAIT"],
        checkpoint_ids: ["WAIT/s/o"], availability: "user_preparation_required", account_ref: "account-wait",
        preparation_owner: "user", declaration: "用户需要自行准备该权限"
      }]
    });
    const blocker = await recordEvent(run.runRoot, {
      type: "blocker", checkpoint_ids: ["WAIT/s/o"], description: "当前账号尚未具备所需准备条件",
      exploration_summary: {
        checkpoint_ids: ["WAIT/s/o"], missing_fact: "缺少该账号已获准备权限的事实", known_facts: ["当前为正确非生产目标"],
        attempts: [], not_attempted_reason: "权限准备必须由用户完成", cannot_continue_reason: "未得到用户准备或结束决定"
      }
    });
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-wait", phase: "requested", checkpoint_ids: ["WAIT/s/o"], group_ids: ["g-wait"],
      description: "需要用户准备该账号权限", required_user_action: "准备后通知 Runner，或明确停止等待", attempts: [], decision_source: "agent"
    });
    await recordEvent(run.runRoot, {
      type: "permission_wait", assistance_id: "assist-wait", group_id: "g-wait", checkpoint_ids: ["WAIT/s/o"], reason: "等待用户准备权限"
    });
    const stopped = await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-wait", phase: "stop_waiting", checkpoint_ids: ["WAIT/s/o"], group_ids: ["g-wait"],
      description: "用户明确要求本轮停止等待该权限", decision_source: "user"
    });
    await assert.doesNotReject(recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: "WAIT/s/o", result: "undetermined", permission_group_ids: ["g-wait"],
      reason: "用户停止等待，无法验证目标信息", observation: "该检查点未实际开始", evidence_status: "missing",
      exploration_ref: blocker.sequence, resolution_ref: stopped.sequence
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-39/41: the HTML detail renders the traceable fact gap and attempts without raw event JSON", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-exploration-report-"));
  try {
    const run = await createRun(root);
    const blocker = await recordEvent(run.runRoot, {
      type: "blocker",
      checkpoint_ids: [blockedCheckpoint],
      description: "当前缺少外部审核状态",
      exploration_summary: explorationSummary()
    });
    await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "requested", checkpoint_ids: [blockedCheckpoint],
      description: "请用户核对外部状态", required_user_action: "核对并通知当前状态", attempts: [], decision_source: "agent"
    });
    const ended = await recordEvent(run.runRoot, {
      type: "assistance", assistance_id: "assist-review", phase: "unavailable", checkpoint_ids: [blockedCheckpoint],
      description: "用户明确本轮无法协助", decision_source: "user"
    });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: blockedCheckpoint, result: "undetermined",
      reason: "缺少外部审核状态，当前无法继续核对", observation: "已保留现有页面事实", evidence_status: "missing",
      exploration_ref: blocker.sequence, resolution_ref: ended.sequence
    });
    await recordEvent(run.runRoot, { type: "case_started", case_id: "INDEPENDENT" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: independentCheckpoint });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: independentCheckpoint, result: "passed",
      reason: "公共状态页明确显示可用", observation: "页面显示可用", evidence_status: "missing"
    });
    for (const checkpoint_id of [blockedCheckpoint, independentCheckpoint]) {
      await recordEvent(run.runRoot, {
        type: "evidence_capture", checkpoint_ids: [checkpoint_id], capture_kind: "screenshot", outcome: "unavailable",
        description: "当前允许的截图范围无法安全保存该事实", attempts: ["已检查可安全采集的页面区域"],
        reason: "可见区域包含不应持久化的信息"
      });
    }
    await recordEvent(run.runRoot, { type: "run_state", status: "completed" });
    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");
    for (const expected of [
      "缺少只能由用户完成的当前审核状态确认",
      "已打开正确的非生产页面",
      "查看目标记录详情",
      "详情页未提供当前审核状态",
      "状态仅能在用户完成外部审核后可见"
    ]) assert.equal(html.includes(expected), true, expected);
    assert.equal(html.includes("exploration_summary"), false);
    assert.equal(html.includes("checkpoint_ids"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
