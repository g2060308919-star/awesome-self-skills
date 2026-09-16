import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { generateReport, initializeRun, recordEvent } from "../scripts/run-artifacts.mjs";

async function createCases(root, count) {
  const casesPath = path.join(root, "cases.json");
  const cases = Array.from({ length: count }, (_, index) => ({
    case_id: `ORIGINAL-CASE-${String(index + 1).padStart(3, "0")}-这是一个很长的原始标识符`,
    module: `模块 ${index + 1}`,
    title: `输入顺序中的测试场景 ${index + 1}`,
    preconditions: ["使用已确认的非生产环境"],
    steps: [{ step_id: "s", action: `执行原操作 ${index + 1}`, expected: [{ oracle_id: "o", text: `显示预期 ${index + 1}` }] }]
  }));
  await writeFile(casesPath, JSON.stringify({
    schema_version: "2.0",
    suite: { name: "v2 HTML 报告套件", target_urls: ["https://staging.example.test/app"] },
    cases
  }));
  return { casesPath, cases };
}

test("AC-03/04/05/06/07/08/11: v2 HTML has six sections, 20-row paging, stable short IDs, and a fixed-script dialog", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-html-"));
  try {
    const { casesPath, cases } = await createCases(root, 21);
    const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
    await recordEvent(run.runRoot, {
      type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: cases.map(item => item.case_id)
    });
    await recordEvent(run.runRoot, {
      type: "report_context",
      prd_links: [{ title: "需求说明", url: "https://docs.example.test/prd" }],
      environment_description: "隔离的非生产测试环境",
      display_timezone: "Asia/Shanghai",
      description: "元数据来自本轮已确认的输入"
    });

    const generated = await generateReport(run.runRoot);
    const html = await readFile(generated.htmlReportPath, "utf8");
    assert.equal((html.match(/data-report-section=/g) ?? []).length, 6);
    for (const section of ["title", "overview", "environment", "coverage", "data-cleanup", "conclusion"]) {
      assert.match(html, new RegExp(`data-report-section="${section}"`));
    }
    assert.match(html, /class="report-hero"/, "标题区应使用紧凑的报告 Hero，而不是通用卡片");
    assert.match(html, /class="report-topbar"/, "报告应提供与参考样式一致的顶部品牌栏");
    assert.match(html, /class="brand-mark" aria-hidden="true">✓<\/span>/, "品牌栏应使用可离线渲染的质量标记");
    assert.match(html, /class="hero-verdict [^"]+"/, "Hero 右侧应直接展示本轮验收结论");
    assert.match(html, /class="section-index">01<\/span>/, "内容章节应提供清晰的序号导航");
    assert.match(html, /class="metric-strip"/, "概览应使用平铺指标带");
    assert.equal(html.includes('class="cards"'), false, "概览不应继续使用厚重的卡片网格");
    assert.match(html, /class="summary-footer"/, "概览统计口径应使用独立底栏承载");
    assert.match(html, /class="environment-grid"/, "测试环境应使用紧凑信息网格");
    assert.match(html, /class="environment-value"/, "环境字段应以独立内容层承载，形成清晰的标签和值层级");
    assert.match(html, /class="case-table"/, "需求覆盖表应有独立的可读性样式入口");
    assert.match(html, /class="status-dot" aria-hidden="true"><\/span>/, "四态标签应同时使用圆点和文字表达");
    assert.match(html, /aria-label="查看 TC-001 的用例详情"/, "查看按钮应说明将打开哪条用例");
    assert.match(html, /class="detail-flow"/, "详情弹窗应使用单栏阅读流");
    assert.equal(html.includes('class="detail-grid"'), false, "详情弹窗不使用双栏布局");
    assert.match(html, /class="cleanup-panel"/, "测试数据与清理应使用语义化清理面板");
    assert.match(html, /class="cleanup-block data-facts"/, "测试数据事实应以轻量清单区块展示");
    assert.match(html, /class="cleanup-block cleanup-result"/, "清理结论应有独立的状态区块");
    assert.match(html, /class="conclusion-layout"/, "结论边界与行动应有明确分组");
    assert.match(html, /class="conclusion-block failure-summary"/, "失败结论应有独立语义层级");
    assert.match(html, /class="conclusion-block unknown-summary"/, "无法确定结论应有独立语义层级");
    assert.match(html, /class="report-disclosure"/, "长篇执行与边界记录应使用可展开的语义区块");
    assert.match(html, /class="disclosure-label"/, "折叠项标题应与展开图标分离，便于精细布局");
    assert.match(html, /<body class="quality-report">/, "报告应启用高保真质量报告视觉系统");
    assert.equal((html.match(/class="case-row"/g) ?? []).length, 21);
    assert.match(html, /data-page-size="20"/);
    assert.match(html, new RegExp("第 1 / 2 页"));
    assert.match(html, /<dialog[^>]+id="case-dialog"/);
    assert.match(html, /data-open-case="0"/);
    assert.match(html, /data-case-detail="0"/);
    assert.match(html, /<script>/);
    assert.match(html, /script-src 'sha256-[A-Za-z0-9+/=]+'/);
    assert.equal(html.includes("script-src 'unsafe-inline'"), false);
    assert.equal(html.includes("eval("), false);
    assert.equal(html.includes("搜索"), false);
    assert.equal(html.includes("状态筛选"), false);
    assert.equal(html.includes("Markdown"), false, "v2 HTML 不得依赖或声称存在 Markdown 报告");
    assert.equal((html.match(/实际清理结果/g) ?? []).length, 1, "清理事实只在测试数据与清理部分集中展示");
    assert.equal(html.includes("自动清理"), false, "结论中的代理验证不得重复堆叠清理内容");

    assert.match(html, /TC-001/);
    assert.match(html, /TC-021/);
    assert.equal(generated.chatTableMarkdown.match(/TC-001/g)?.length, 1);
    assert.equal(generated.chatTableMarkdown.match(/TC-021/g)?.length, 1);
    assert.equal(generated.chatTableMarkdown.includes(cases[0].case_id), false, "对话表使用展示短编号");
    assert.match(html, new RegExp(cases[0].case_id));
    assert.match(html, /需求说明/);
    assert.match(html, /隔离的非生产测试环境/);
    assert.match(html, /Asia\/Shanghai/);
    assert.equal(html.includes("NaN"), false);
    assert.equal(html.includes("Infinity"), false);

    const regenerated = await generateReport(run.runRoot);
    assert.equal(await readFile(regenerated.htmlReportPath, "utf8"), html, "同一账本重建报告保持短编号和详情映射稳定");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("AC-04/11: v2 report context rejects dangerous links instead of rendering them", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "runner-v2-context-link-"));
  try {
    const { casesPath, cases } = await createCases(root, 1);
    const run = await initializeRun({ workspaceRoot: root, casesPath, workflowProfile: "permission-batches-html-v2" });
    await recordEvent(run.runRoot, {
      type: "permission_plan", version: "1.0", groups: [], role_independent_case_ids: cases.map(item => item.case_id)
    });
    await assert.rejects(recordEvent(run.runRoot, {
      type: "report_context",
      prd_links: [{ title: "不安全链接", url: "javascript:alert(1)" }],
      display_timezone: "UTC",
      description: "应被拒绝"
    }), error => error.code === "RUN_CONSISTENCY" && /链接|HTTP/.test(error.message));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
