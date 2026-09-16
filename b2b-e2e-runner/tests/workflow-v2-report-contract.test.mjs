import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  generateReport,
  initializeRun,
  recordEvent,
  validateRun
} from "../scripts/run-artifacts.mjs";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = path.join(skillRoot, "tests/fixtures/test-cases.json");

test("AC-02/03: v2 emits only HTML plus a same-model complete chat table", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-report-"));
  try {
    const run = await initializeRun({
      workspaceRoot: root,
      casesPath: fixture,
      workflowProfile: "permission-batches-html-v2"
    });
    await recordEvent(run.runRoot, {
      type: "permission_plan",
      version: "1.0",
      groups: [],
      role_independent_case_ids: ["CASE-原始-01"]
    });

    const generated = await generateReport(run.runRoot);
    const htmlPath = path.join(run.runRoot, "report.html");
    assert.equal(generated.reportFormat, "html-only-v1");
    assert.equal(generated.reportPath, htmlPath);
    assert.equal(generated.htmlReportPath, htmlPath);
    assert.equal(generated.snapshotHash, run.snapshotHash);
    assert.equal(generated.eventCount, 2);
    assert.equal(generated.lastSequence, 2);
    assert.match(generated.chatTableMarkdown, /^\| ID \| 模块 \| 测试场景 \| 测试结果 \| 成功\/失败的原因 \|/);
    assert.equal(generated.chatTableMarkdown.match(/TC-001/g)?.length, 1);
    assert.equal(generated.chatTableMarkdown.includes("CASE-原始-01"), false);
    assert.match(await readFile(htmlPath, "utf8"), /CASE-原始-01/);
    await assert.rejects(access(path.join(run.runRoot, "report.md")), error => error.code === "ENOENT");
    await assert.doesNotReject(validateRun(run.runRoot));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-30: v1 continues to generate its historical report pair", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v1-report-"));
  try {
    const run = await initializeRun({
      workspaceRoot: root,
      casesPath: fixture,
      workflowProfile: "permission-batches-html-v1"
    });
    await recordEvent(run.runRoot, {
      type: "permission_plan",
      version: "1.0",
      groups: [],
      role_independent_case_ids: ["CASE-原始-01"]
    });
    const generated = await generateReport(run.runRoot);
    assert.equal(generated.reportPath, path.join(run.runRoot, "report.md"));
    assert.equal(generated.htmlReportPath, path.join(run.runRoot, "report.html"));
    await access(generated.reportPath);
    await access(generated.htmlReportPath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
