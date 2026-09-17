// Synthetic layout fixture; NOT a business execution or release evaluation.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { initializeRun, recordEvent, generateReport, archiveScreenshot } from "../../scripts/run-artifacts.mjs";

const [workspace, actualScreenshot, allowedScreenshotRoot] = process.argv.slice(2);
if (!workspace) throw new Error("Provide an authorized output workspace");
const cases = Array.from({ length: 25 }, (_, index) => ({
  case_id: index === 0 ? `LAYOUT-ONLY-${"LONG-ORIGINAL-ID-".repeat(12)}01` : `LAYOUT-ONLY-${index + 1}`,
  module: ["营销管理", "权限核验", "订单管理"][index % 3],
  title: index === 0 ? "布局夹具：长中文场景、长原始编号、账号权限和截图的完整可读性" : `布局夹具：分页与四态展示 ${index + 1}`,
  preconditions: ["仅为合成布局验证，不表示任何真实业务已执行或通过"],
  ...(index === 24 ? { excluded: true } : {}),
  steps: [{ step_id: "S", action: "合成的步骤说明，用来检查阅读层次；不是实际业务动作", expected: [{ oracle_id: "O", text: "预期与实际分开呈现，保留原始文字及完整结果原因" }] }]
}));
const source = { schema_version: "2.0", suite: { name: "报告 A · 合成布局验收（非业务测试结果）", target_urls: [`http://localhost/layout-fixture?filter=${"long-safe-filter-".repeat(30)}`] }, cases };
const casesPath = path.join(workspace, "layout-test-cases.json");
await writeFile(casesPath, JSON.stringify(source, null, 2));
const run = await initializeRun({ workspaceRoot: workspace, casesPath, workflowProfile: "permission-batches-html-v2" });
const firstId = `${cases[0].case_id}/S/O`;
await recordEvent(run.runRoot, { type: "permission_plan", version: "1.0", role_independent_case_ids: cases.slice(1).map(item => item.case_id), groups: [{ group_id: "layout-review", role_text: "合成审核权限", permissions: ["布局验证能力"], case_ids: [cases[0].case_id], checkpoint_ids: [firstId], availability: "ready", account_ref: "layout-account", preparation_owner: "user", declaration: "合成布局输入，非真实权限声明" }] });
await recordEvent(run.runRoot, { type: "target_inventory", owned_target_ids: ["layout-target"] });
await recordEvent(run.runRoot, { type: "role_observation", observation: { group_id: "layout-review", account_ref: "layout-account", observed_account_ref: "layout-account", verification_scope: "execution_context", verification: "verified", target_id: "layout-target", environment_ref: "local-layout-fixture", context_ref: "layout-context", switch_status: "not_required", description: "合成上下文，仅检查报告排版，不是实际核验" } });
await recordEvent(run.runRoot, { type: "report_context", environment_description: "合成布局验收；截图为本地上传与数据探索夹具的真实截图，仅供图片展示，不支持合成业务结论", display_timezone: "Asia/Shanghai", description: "开发验证夹具" });
if (actualScreenshot) {
  await archiveScreenshot(run.runRoot, { sourcePath: actualScreenshot, allowedSourceRoot: allowedScreenshotRoot, event: { type: "evidence_capture", checkpoint_ids: [firstId], capture_kind: "screenshot", outcome: "captured", description: "本地无真实业务数据夹具截图，仅用于验证图片展示", attempts: ["Chrome DevTools MCP 真实截图到合法临时路径后原字节归档"], evidence: [{ evidence_id: "local-fixture-image", kind: "screenshot", at: new Date().toISOString(), description: "真实本地 fixture 画面；不是上述合成测试结论的业务证据", checkpoint_ids: [firstId], path: "evidence/local-fixture.png" }] } });
}
for (const [index, item] of cases.entries()) {
  if (item.excluded) continue;
  const checkpointId = `${item.case_id}/S/O`;
  await recordEvent(run.runRoot, { type: "case_started", case_id: item.case_id });
  await recordEvent(run.runRoot, { type: "checkpoint_started", checkpoint_id: checkpointId });
  if (index !== 0 || !actualScreenshot) await recordEvent(run.runRoot, { type: "evidence_capture", checkpoint_ids: [checkpointId], capture_kind: "screenshot", outcome: "unavailable", description: "合成布局数据，不伪造业务截图", attempts: [], reason: "非实际业务执行" });
  const result = index === 1 ? "failed" : index === 2 ? "undetermined" : "passed";
  await recordEvent(run.runRoot, { type: "checkpoint_result", checkpoint_id: checkpointId, result, reason: `合成布局结果：${result === "passed" ? "验证通过标签展示" : result === "failed" ? "验证未通过标签展示" : "验证无法确定标签展示"}，不代表真实产品结果`, observation: "仅用于测试 HTML 和对话表的同源排版", evidence_status: index === 0 && actualScreenshot ? "partial" : "missing", evidence_refs: index === 0 && actualScreenshot ? ["local-fixture-image"] : [], ...(result === "undetermined" ? { exploration_summary: { checkpoint_ids: [checkpointId], missing_fact: "布局夹具没有实际业务", known_facts: ["所有此用例事实均为布局测试输入"], attempts: [], not_attempted_reason: "不执行真实业务", cannot_continue_reason: "仅验证报告展示" } } : {}) });
}
await recordEvent(run.runRoot, { type: "run_state", status: "completed" });
// Test-controlled timing in this newly created synthetic fixture only.
const logPath = path.join(run.runRoot, "execution-log.json");
const log = JSON.parse(await readFile(logPath));
log.run.started_at = new Date(Date.parse(log.run.completed_at) - (12 * 3600 + 24 * 60 + 48) * 1000).toISOString();
await writeFile(logPath, JSON.stringify(log, null, 2));
const result = await generateReport(run.runRoot);
process.stdout.write(JSON.stringify({ runRoot: run.runRoot, reportPath: result.htmlReportPath, counts: result.counts, fixture: "synthetic-layout-only" }) + "\n");
