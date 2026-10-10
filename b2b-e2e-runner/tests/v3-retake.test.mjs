import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import * as runner from "../scripts/run-artifacts.mjs";
import { mergeRetakeModels } from "../scripts/lib/retake.mjs";
import { renderChatTableMarkdown } from "../scripts/lib/report.mjs";

const caseOf = id => ({ case_id: id, module: "补测", title: `场景 ${id}`, preconditions: [],
  steps: [{ step_id: "s", action: "查看状态", expected: [{ oracle_id: "o", text: "显示预期状态" }] }] });

async function create(root, name, cases) {
  const casesPath = path.join(root, `${name}.json`);
  await writeFile(casesPath, JSON.stringify({ schema_version: "2.0", suite: { name: "同一验收任务", target_urls: ["https://staging.example.test"] }, cases }));
  return runner.initializeRun({ workspaceRoot: root, casesPath, runId: name, workflowProfile: "permission-batches-html-v3" });
}

async function result(run, caseId, state) {
  await runner.recordEvent(run.runRoot, { type: "case_started", case_id: caseId });
  await runner.recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: `${caseId}/s/o` });
  await runner.recordEvent(run.runRoot, { type: "evidence_capture", checkpoint_ids: [`${caseId}/s/o`], capture_kind: "screenshot",
    outcome: "unavailable", description: "当前无法安全截取页面", attempts: ["尝试安全区域截图"], reason: "测试夹具无图像输出" });
  await runner.recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: `${caseId}/s/o`, result: state,
    reason: state === "passed" ? "页面显示预期状态" : "页面未显示预期状态", observation: "受控测试观察",
    evidence_status: "missing", verification_source: "real" });
}

async function capturedResult(run, caseId, color) {
  const checkpointId = `${caseId}/s/o`;
  const image = await sharp({ create: { width: 1, height: 1, channels: 3, background: color } }).png().toBuffer();
  await writeFile(path.join(run.evidenceRoot, "common.png"), image);
  await runner.recordEvent(run.runRoot, { type: "case_started", case_id: caseId });
  await runner.recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: checkpointId });
  await runner.recordEvent(run.runRoot, { type: "evidence_capture", checkpoint_ids: [checkpointId],
    capture_kind: "screenshot", outcome: "captured", description: "本地非生产夹具截图", attempts: ["保存夹具图片"],
    evidence: [{ evidence_id: "same-local-id", kind: "screenshot", at: new Date().toISOString(),
      description: "本地夹具图片", checkpoint_ids: [checkpointId], path: "evidence/common.png" }] });
  await runner.recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: checkpointId,
    result: "passed", reason: "夹具显示预期状态", observation: "受控测试观察", evidence_status: "complete",
    evidence_refs: ["same-local-id"], verification_source: "real" });
  return image;
}

test("P01 official retake delivery keeps the root scope and picks only explicitly linked cases", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-retake-"));
  try {
    const original = await create(root, "original", [caseOf("A"), caseOf("B")]);
    await runner.recordEvent(original.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A", "B"] });
    await result(original, "A", "passed");
    await result(original, "B", "failed");
    await runner.recordEvent(original.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(original.runRoot);
    const retake = await create(root, "retake", [caseOf("B")]);
    await runner.recordEvent(retake.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["B"] });
    assert.equal(typeof runner.linkRetake, "function");
    await runner.linkRetake(retake.runRoot, original.runRoot);
    await result(retake, "B", "passed");
    await runner.recordEvent(retake.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(retake.runRoot);
    const delivered = await runner.deliverReport(original.runRoot);
    assert.deepEqual(delivered.counts, { passed: 2, failed: 0, undetermined: 0, not_executed: 0 });
    assert.equal(delivered.chatTableMarkdown.split("\n").filter(line => line.startsWith("| TC-")).length, 2);
    const html = await readFile(delivered.htmlReportPath, "utf8");
    assert.match(html, /原轮|补测/u);
    await writeFile(delivered.htmlReportPath, `${html}\n<!-- unauthorized edit -->`);
    await assert.rejects(runner.deliverReport(original.runRoot), /汇总报告与已验证来源不一致/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("P01 a changed expectation cannot replace an old result", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-retake-different-"));
  try {
    const original = await create(root, "original", [caseOf("A")]);
    await runner.recordEvent(original.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A"] });
    await result(original, "A", "passed");
    await runner.recordEvent(original.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(original.runRoot);
    const changed = caseOf("A");
    changed.steps[0].expected[0].text = "另一验收标准";
    const retake = await create(root, "retake", [changed]);
    await runner.recordEvent(retake.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A"] });
    assert.equal(typeof runner.linkRetake, "function");
    await assert.rejects(runner.linkRetake(retake.runRoot, original.runRoot), /用例|预期|语义/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("P01 partial checkpoint retake cannot replace an entire original case", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-retake-partial-"));
  try {
    const testCase = caseOf("A");
    testCase.steps[0].expected.push({ oracle_id: "other", text: "另一个独立预期" });
    const original = await create(root, "original", [testCase]);
    await runner.recordEvent(original.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A"] });
    await result(original, "A", "failed");
    await runner.recordEvent(original.runRoot, { type: "checkpoint_result", checkpoint_id: "A/s/other",
      result: "not_executed", reason: "原轮未执行该检查点", observation: "没有观察", evidence_status: "missing" });
    await runner.recordEvent(original.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(original.runRoot);
    const retake = await create(root, "retake", [testCase]);
    await runner.recordEvent(retake.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A"] });
    await runner.linkRetake(retake.runRoot, original.runRoot);
    await result(retake, "A", "passed");
    await runner.recordEvent(retake.runRoot, { type: "checkpoint_result", checkpoint_id: "A/s/other",
      result: "not_executed", reason: "补测仅覆盖第一个检查点", observation: "没有观察", evidence_status: "missing" });
    await runner.recordEvent(retake.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(retake.runRoot);
    await assert.rejects(runner.deliverReport(original.runRoot), error =>
      error.code === "RUN_CONSISTENCY" && /部分检查点|完整替换/u.test(error.message));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("P01 sibling retakes for the same case remain ambiguous", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-retake-siblings-"));
  try {
    const original = await create(root, "original", [caseOf("A")]);
    await runner.recordEvent(original.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A"] });
    await result(original, "A", "failed");
    await runner.recordEvent(original.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(original.runRoot);
    for (const id of ["first", "second"]) {
      const retake = await create(root, id, [caseOf("A")]);
      await runner.recordEvent(retake.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A"] });
      await runner.linkRetake(retake.runRoot, original.runRoot);
      await result(retake, "A", "passed");
      await runner.recordEvent(retake.runRoot, { type: "run_state", status: "completed" });
      await runner.generateReport(retake.runRoot);
    }
    await assert.rejects(runner.deliverReport(original.runRoot), /无法排序|补测候选/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("P01 same local evidence names stay scoped to the selected source Run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-retake-evidence-"));
  try {
    const original = await create(root, "original", [caseOf("A"), caseOf("B")]);
    await runner.recordEvent(original.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["A", "B"] });
    const firstImage = await capturedResult(original, "A", "#ff0000");
    await result(original, "B", "failed");
    await runner.recordEvent(original.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(original.runRoot);
    const retake = await create(root, "retake", [caseOf("B")]);
    await runner.recordEvent(retake.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: ["B"] });
    await runner.linkRetake(retake.runRoot, original.runRoot);
    const secondImage = await capturedResult(retake, "B", "#0000ff");
    await runner.recordEvent(retake.runRoot, { type: "run_state", status: "completed" });
    await runner.generateReport(retake.runRoot);
    const delivered = await runner.deliverReport(original.runRoot);
    const reportRoot = path.dirname(delivered.htmlReportPath);
    assert.deepEqual(await readFile(path.join(reportRoot, "evidence/original/common.png")), firstImage);
    assert.deepEqual(await readFile(path.join(reportRoot, "evidence/retake/common.png")), secondImage);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("P01 fixed 417-case accounting keeps 389 original and 28 retested cases", () => {
  const rootRows = Array.from({ length: 417 }, (_, index) => ({ case_id: `C${index + 1}`,
    anchor: `case-${index + 1}`, display_id: `TC-${String(index + 1).padStart(3, "0")}`,
    module: "非敏感夹具", title: `场景 ${index + 1}`, reason: "仅用于汇总核对",
    result_label: "夹具结果", result: index < 328 ? "passed" : index < 389 ? "failed" : "undetermined" }));
  const retakeRows = rootRows.slice(389).map((row, index) => ({ ...row,
    result: index < 10 ? "passed" : index < 16 ? "failed" : "undetermined" }));
  const makeModel = rows => ({ rows, case_details: rows.map(row => ({ ...row, steps: [] })),
    counts: {}, overview: {}, run: {}, result_details: {} });
  const merged = mergeRetakeModels(makeModel(rootRows), [{ runId: "retake", model: makeModel(retakeRows) }]);
  assert.equal(merged.rows.length, 417);
  assert.deepEqual(merged.counts, { passed: 338, failed: 67, undetermined: 12, not_executed: 0 });
  assert.equal(merged.case_details.filter(detail => detail.source_run_id === "retake").length, 28);
  const rows = renderChatTableMarkdown(merged).split("\n").filter(line => line.startsWith("| TC-"));
  assert.equal(rows.length, 417);
  assert.match(rows[0], /^\| TC-001 \|/u);
  assert.match(rows.at(-1), /^\| TC-417 \|/u);
});
