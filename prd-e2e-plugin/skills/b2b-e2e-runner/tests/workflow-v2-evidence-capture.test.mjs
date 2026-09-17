import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent, validateRun } from "../scripts/run-artifacts.mjs";

const checkpointId = "SCREEN/s/o";
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function createRun(root) {
  const casesPath = path.join(root, "cases.json");
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "v2 截图证据", target_urls: ["https://staging.example.test"] },
    cases: [{
      case_id: "SCREEN", module: "证据", title: "实际执行保留关键截图", preconditions: [],
      steps: [{ step_id: "s", action: "查看页面", expected: [{ oracle_id: "o", text: "显示目标状态" }] }]
    }]
  }));
  const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
  await recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["SCREEN"] });
  return run;
}

function capture(pathname = "evidence/key.png") {
  return {
    type: "evidence_capture",
    checkpoint_ids: [checkpointId],
    capture_kind: "screenshot",
    outcome: "captured",
    description: "真实测试页面的关键状态截图",
    attempts: ["使用 Chrome DevTools MCP 对当前测试页面安全区域截图"],
    evidence: [{
      evidence_id: "shot-1",
      kind: "screenshot",
      at: "2026-09-16T00:00:00.000Z",
      description: "页面显示目标状态",
      checkpoint_ids: [checkpointId],
      path: pathname
    }]
  };
}

test("AC-13/14/15: captured screenshots can be reused only by supported checkpoints without changing product result", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-capture-"));
  try {
    const run = await createRun(root);
    await writeFile(path.join(run.evidenceRoot, "key.png"), pngSignature);
    await recordEvent(run.runRoot, capture());
    await assert.rejects(recordEvent(run.runRoot, capture()), error => error.code === "RUN_CONSISTENCY" && /证据 ID 重复/.test(error.message));

    await recordEvent(run.runRoot, { type: "case_started", case_id: "SCREEN" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: checkpointId });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result",
      checkpoint_id: checkpointId,
      result: "passed",
      reason: "页面明确显示目标状态",
      observation: "结构化观察与截图均显示目标状态",
      evidence_status: "complete",
      evidence_refs: ["shot-1"]
    });
    const log = JSON.parse(await readFile(path.join(run.runRoot, "execution-log.json"), "utf8"));
    assert.deepEqual(log.cases[0].checkpoints[0].evidence_refs, ["shot-1"]);
    assert.equal(log.cases[0].checkpoints[0].result, "passed");
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-12/14/16: disguised images and unrelated screenshot references fail closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-capture-reject-"));
  try {
    const run = await createRun(root);
    await writeFile(path.join(run.evidenceRoot, "fake.png"), "plain text is not a PNG");
    await assert.rejects(recordEvent(run.runRoot, capture("evidence/fake.png")), error => error.code === "RUN_CONSISTENCY" && /图片格式|图片文件/.test(error.message));

    await assert.rejects(recordEvent(run.runRoot, {
      type: "evidence_capture",
      checkpoint_ids: [checkpointId],
      capture_kind: "screenshot",
      outcome: "failed",
      description: "当前环境无法安全截取请求详情",
      attempts: ["已核对允许的截图方法"]
    }), error => error.code === "RUN_CONSISTENCY" && /reason/.test(error.message));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-12: replacing the evidence root itself with a symbolic link fails closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-evidence-root-link-"));
  try {
    const run = await createRun(root);
    const outside = await mkdtemp(path.join(os.tmpdir(), "runner-v2-outside-evidence-"));
    try {
      await writeFile(path.join(outside, "key.png"), pngSignature);
      await rm(run.evidenceRoot, { recursive: true, force: true });
      await symlink(outside, run.evidenceRoot, "dir");
      await assert.rejects(
        recordEvent(run.runRoot, capture()),
        error => error.code === "RUN_CONSISTENCY" && /符号链接/.test(error.message)
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-13/16: an executed v2 case cannot be delivered without a captured or explicit missing screenshot record", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-capture-required-"));
  try {
    const run = await createRun(root);
    await recordEvent(run.runRoot, { type: "case_started", case_id: "SCREEN" });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: checkpointId });
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: checkpointId, result: "passed",
      reason: "结构化页面事实足以支持产品结论", observation: "页面显示目标状态", evidence_status: "missing"
    });
    await recordEvent(run.runRoot, { type: "run_state", status: "completed" });
    await assert.rejects(generateReport(run.runRoot), error => error.code === "RUN_CONSISTENCY" && /截图采集记录/.test(error.message));

    await recordEvent(run.runRoot, {
      type: "evidence_capture",
      checkpoint_ids: [checkpointId],
      capture_kind: "screenshot",
      outcome: "unavailable",
      description: "允许工具无法安全截取所需区域",
      attempts: ["已检查当前 Chrome DevTools MCP 截图范围"],
      reason: "必要区域含无法排除的认证信息"
    });
    const generated = await generateReport(run.runRoot);
    assert.equal(generated.counts.passed, 1);
    assert.match(await readFile(generated.htmlReportPath, "utf8"), /证据缺失|无法安全截取/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
