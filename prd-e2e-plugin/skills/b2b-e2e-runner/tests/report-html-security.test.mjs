import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent } from "../scripts/run-artifacts.mjs";

test("AC-22/23: HTML escapes hostile facts, encodes safe local evidence paths, and never auto-loads non-images", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "report-security-"));
  try {
    const caseId = "CASE-<script>alert(1)</script>";
    const casesPath = path.join(root, "cases.json");
    await writeFile(casesPath, JSON.stringify({
      schema_version: "2.0",
      suite: { name: "<img src=x onerror=alert(1)>", target_urls: ["https://staging.example.test"] },
      cases: [{
        case_id: caseId,
        module: "模块</td><script>alert(2)</script>",
        title: "标题 & \"引号\" <b>不可执行</b>",
        preconditions: ["前置 <svg onload=alert(3)>"],
        steps: [{ step_id: "s", action: "查看", expected: [{ oracle_id: "o", text: "显示安全文本" }] }]
      }]
    }));
    const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v1" });
    await recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: [caseId] });
    await recordEvent(run.runRoot, { type: "case_started", case_id: caseId });
    await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: `${caseId}/s/o` });
    await writeFile(path.join(run.evidenceRoot, "截图 1#.png"), "not-a-real-image-but-a-regular-fixture-file");
    await writeFile(path.join(run.evidenceRoot, "页面观察.html"), "<script>alert('must not execute')</script>");
    const reason = "页面把 <script>alert(4)</script> 当作文字显示，原因包含 & 和 ' 引号";
    await recordEvent(run.runRoot, {
      type: "checkpoint_result", checkpoint_id: `${caseId}/s/o`, result: "passed", reason, observation: reason, evidence_status: "complete",
      evidence: [
        { evidence_id: "EV-IMG", at: "2026-09-15T00:00:00.000Z", description: "普通图片", checkpoint_ids: [`${caseId}/s/o`], path: "evidence/截图 1#.png" },
        { evidence_id: "EV-TEXT", at: "2026-09-15T00:00:00.000Z", description: "HTML 仅作为下载证据", checkpoint_ids: [`${caseId}/s/o`], path: "evidence/页面观察.html" },
        {
          evidence_id: "EV-INLINE",
          at: "2026-09-15T00:00:00.000Z",
          description: "结构化页面观察",
          checkpoint_ids: [`${caseId}/s/o`],
          inline: { observation: "页面正文显示安全文本", matched: true, metadata: { region: "华东" } }
        }
      ]
    });
    await recordEvent(run.runRoot, { type: "run_state", status: "completed" });
    const generated = await generateReport(run.runRoot);
    const [markdown, html] = await Promise.all([readFile(generated.reportPath, "utf8"), readFile(generated.htmlReportPath, "utf8")]);
    assert.equal(html.includes("<script>alert"), false);
    assert.equal(html.includes("&lt;script&gt;alert(4)&lt;/script&gt;"), true);
    assert.equal(html.includes("<img src=\"evidence/%E6%88%AA%E5%9B%BE%201%23.png\""), true);
    assert.equal(html.includes("<img src=\"evidence/%E9%A1%B5%E9%9D%A2%E8%A7%82%E5%AF%9F.html\""), false);
    assert.equal(html.includes("href=\"evidence/%E9%A1%B5%E9%9D%A2%E8%A7%82%E5%AF%9F.html\""), true);
    for (const semanticEvidence of ["结构化页面观察", "实际观察", "页面正文显示安全文本", "是否匹配", "区域", "华东"]) {
      assert.equal(html.includes(semanticEvidence), true, semanticEvidence);
    }
    for (const machineDetail of ["<pre", "&quot;observation&quot;", "&quot;matched&quot;", "metadata", ">true<"]) {
      assert.equal(html.includes(machineDetail), false, `HTML must not expose ${machineDetail}`);
    }
    assert.equal(/https?:\/\/(?!staging\.example\.test)/.test(html), false);
    assert.equal(markdown.includes("<script>alert"), false);
    assert.equal(markdown.includes("&lt;script&gt;alert(4)&lt;/script&gt;"), true);

    await assert.rejects(recordEvent(run.runRoot, {
      type: "note",
      description: "Authorization: Bearer fixture-secret"
    }), error => error.code === "SECRET_DETECTED" && !error.message.includes("fixture-secret"));
  } finally { await rm(root, { recursive: true, force: true }); }
});
