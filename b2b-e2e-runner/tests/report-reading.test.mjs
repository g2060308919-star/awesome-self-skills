import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import { JSDOM } from "jsdom";

import { buildHtmlReport } from "../scripts/lib/report-html.mjs";

function detail(index, result = "passed") {
  const displayId = `TC-${String(index + 1).padStart(3, "0")}`;
  const caseId = index === 0
    ? "CASE-ORIGINAL-IDENTIFIER-WITH-A-VERY-LONG-PERMISSION-AND-ACCOUNT-SCOPE-0001"
    : `CASE-${index + 1}`;
  const resultLabel = { passed: "通过", failed: "未通过", undetermined: "无法确定", not_executed: "未执行" }[result];
  return {
    display_id: displayId,
    anchor: `case-${index + 1}`,
    case_id: caseId,
    module: index % 2 ? "订单" : "权限",
    title: `原始测试场景 ${index + 1}`,
    result,
    result_label: resultLabel,
    reason: `原始结果原因 ${index + 1}`,
    preconditions: [`原始前置条件 ${index + 1}`],
    permissions: [{
      role_text: "审核员",
      permissions: ["订单审核", "订单查看"],
      planned_account_ref: "qa-reviewer",
      observed_account_ref: "qa-reviewer",
      verification: "verified"
    }],
    steps: [{
      step_id: "step-original-1",
      action: `原始操作 ${index + 1}`,
      expected: [{
        oracle_id: "oracle-original-1",
        text: `原始预期 ${index + 1}`,
        result_label: resultLabel,
        reason: `检查点原因 ${index + 1}`,
        observations: [`原始实际观察 ${index + 1}`],
        evidence_status_label: "证据完整",
        blocker: "无",
        evidence: index === 0 ? [{
          evidence_id: "EV-ORIGINAL-1",
          description: "原始页面截图",
          path: "evidence/页面 1.png",
          inline_facts: []
        }] : []
      }]
    }],
    actual_records: [{ description: `原始执行记录 ${index + 1}` }],
    capture_records: [{ description: `截图采集记录 ${index + 1}`, outcome: "captured", reason: null }],
    exploration_records: []
  };
}

function reportModel() {
  const results = ["failed", "failed", "undetermined", "not_executed", ...Array(17).fill("passed")];
  const caseDetails = results.map((result, index) => detail(index, result));
  const rows = caseDetails.map(item => ({
    display_id: item.display_id,
    anchor: item.anchor,
    case_id: item.case_id,
    module: item.module,
    title: item.title,
    result: item.result,
    result_label: item.result_label,
    reason: item.reason
  }));
  return {
    suite: {
      name: "正式验收套件",
      target_urls: ["https://staging.example.test/campaigns/list?workspace=marketing&token=visible-fixture"]
    },
    run: {
      workflow_profile: "permission-batches-html-v2",
      run_id: "run-reading-fixture",
      status: "completed",
      status_label: "已完成",
      is_final: true,
      boundary_at_label: "2026年09月17日 18:00:00（UTC+8）",
      started_at_display_label: "2026年09月17日 04:01:02",
      completed_at_display_label: "2026年09月17日 16:25:50"
    },
    overview: {
      total: 21,
      pass_rate: "81.0%",
      fail_rate: "9.5%",
      execution_duration: "12小时24分钟48秒",
      waiting_duration: "18分钟"
    },
    counts: { passed: 17, failed: 2, undetermined: 1, not_executed: 1 },
    rows,
    case_details: caseDetails,
    report_context: {
      prd_links: [{ title: "营销活动需求", url: "https://docs.example.test/prd/marketing" }],
      accounts: ["qa-reviewer", "qa-operator"],
      display_timezone: "Asia/Shanghai",
      proxy_method: "本次未使用代理",
      environment_description: "隔离的非生产测试环境"
    },
    timeline: [],
    permission: {
      plan: true,
      groups: [{
        role_text: "审核员",
        permissions: ["订单审核", "订单查看"],
        account_ref: "qa-reviewer",
        availability_label: "已就绪",
        verification_label: "已核验",
        case_ids: ["CASE-ORIGINAL-IDENTIFIER-WITH-A-VERY-LONG-PERMISSION-AND-ACCOUNT-SCOPE-0001"],
        wait_reason: null,
        batch_description: "已完成"
      }]
    },
    proxy_summary: {
      description: "未使用代理",
      status: "本次不需要代理",
      scope: "没有页面受到代理影响",
      scope_outcome: "未启用",
      restoration: "不需要恢复",
      restoration_outcome: "无需恢复",
      verifications: []
    },
    cleanup_summary: { status: "无需清理", items: [] },
    consistency: { checks: [{ item: "报告事实", description: "来自同一快照", outcome: "一致" }] },
    result_details: {
      failed: rows.filter(row => row.result === "failed"),
      undetermined: rows.filter(row => row.result === "undetermined"),
      not_executed: rows.filter(row => row.result === "not_executed")
    }
  };
}

test("阅读版分段展示长耗时、友好目标地址，并按已知结果类别连接完整用例", () => {
  const html = buildHtmlReport(reportModel());

  assert.match(html, /class="duration-parts"[^>]*aria-label="12小时24分钟48秒"/);
  for (const segment of [">12</strong><small>小时</small>", ">24</strong><small>分钟</small>", ">48</strong><small>秒</small>"]) {
    assert.equal(html.includes(segment), true, segment);
  }
  assert.match(html, /href="https:\/\/staging\.example\.test\/campaigns\/list\?workspace=marketing&amp;token=visible-fixture"[^>]*>staging\.example\.test 测试地址<\/a>/);
  assert.equal(html.includes(">https://staging.example.test/campaigns/list?workspace=marketing"), false, "the long URL is not used as visible copy");

  for (const [result, label, count] of [["failed", "未通过", 2], ["undetermined", "无法确定", 1], ["not_executed", "未执行", 1]]) {
    assert.match(html, new RegExp(`data-action-group="${result}"[\\s\\S]*?${label}[\\s\\S]*?${count} 条[\\s\\S]*?data-filter-result="${result}"`));
  }
  assert.equal((html.match(/class="case-row"/g) ?? []).length, 21);
  assert.match(html, /data-page-size="20"/);
  assert.ok(html.indexOf("TC-001") < html.indexOf("TC-021"), "the original input order is retained");
});

test("阅读版目标地址对超长路径和查询参数仍使用紧凑标签并保留完整链接", () => {
  const model = reportModel();
  const longPath = "segment-".repeat(24);
  model.suite.target_urls = [`https://preview.example.test/${longPath}/campaigns?workspace=marketing&scenario=published-valid-coupon`];

  const html = buildHtmlReport(model);

  assert.match(html, new RegExp(`href="https://preview\\.example\\.test/${longPath}/campaigns\\?workspace=marketing&amp;scenario=published-valid-coupon"[^>]*>preview\\.example\\.test 测试地址<\\/a>`));
  assert.equal(html.includes(`>${longPath}`), false, "long path must not become visible link copy");
});

test("阅读版详情先给结论，再完整呈现上下文、原始事实与可放大截图", () => {
  const html = buildHtmlReport(reportModel());

  assert.match(html, /class="detail-outcome failed"[\s\S]*?原始结果原因 1/);
  assert.match(html, /class="context-chip permission-chip"[\s\S]*?订单审核/);
  assert.match(html, /class="context-chip account-chip"[\s\S]*?计划\/实际账号 · qa-reviewer/);
  assert.match(html, /核验状态 · 已核验/);
  assert.match(html, /<details class="full-id"><summary>查看完整原始用例 ID<\/summary>[\s\S]*?CASE-ORIGINAL-IDENTIFIER/);
  assert.match(html, /<ol class="step-list">[\s\S]*?class="step-number"[^>]*>1<\/span>[\s\S]*?原始操作 1/);
  assert.match(html, /class="comparison-row expected"[\s\S]*?原始预期 1[\s\S]*?class="comparison-row observed"[\s\S]*?原始实际观察 1/);
  for (const fact of ["检查点原因 1", "证据完整", "原始执行记录 1", "截图采集记录 1", "原始前置条件 1", "oracle-original-1"]) {
    assert.equal(html.includes(fact), true, `complete fact retained: ${fact}`);
  }
  assert.match(html, /<button[^>]+data-enlarge-image[^>]*>[\s\S]*?<img src="evidence\/%E9%A1%B5%E9%9D%A2%201\.png"/);
  assert.match(html, /<dialog id="image-dialog"/);
  assert.match(html, /imageClose\.focus\(\)/);
  assert.match(html, /lastImageTrigger\.focus/);
  assert.match(html, /\.permission-table[^}]*table-layout:fixed/);
  assert.match(html, /\.permission-case-ids[^}]*overflow-wrap:anywhere/);
});

test("阅读版把补充执行事实默认折叠、保留完整内容并省略空探索噪音", () => {
  const model = reportModel();
  model.case_details[0].exploration_records = [{
    missing_fact: "缺少动态样本",
    known_facts: ["已检查授权列表"],
    attempts: [{ action: "筛选候选记录", observation: "10 个结果页均无可用记录" }],
    not_attempted_reason: null,
    cannot_continue_reason: "当前没有合法候选记录"
  }];

  const withExploration = buildHtmlReport(model);
  for (const summary of ["实际执行记录", "截图采集记录", "无法确定时的事实边界"]) {
    assert.match(withExploration, new RegExp(`<details class="supplementary-details"><summary>${summary}<\\/summary>`));
    assert.equal(withExploration.includes(`<details class="supplementary-details" open><summary>${summary}`), false, `${summary} defaults collapsed`);
  }
  for (const fact of ["原始执行记录 1", "截图采集记录 1", "缺少动态样本", "已检查授权列表", "筛选候选记录", "10 个结果页均无可用记录", "当前没有合法候选记录"]) {
    assert.equal(withExploration.includes(fact), true, `supplementary fact retained: ${fact}`);
  }
  assert.match(withExploration, /data-enlarge-image/, "step screenshot remains visible outside supplementary disclosures");

  const withoutExploration = buildHtmlReport(reportModel());
  assert.equal(withoutExploration.includes("本用例未记录终结性事实缺口摘要。"), false);
  assert.equal(withoutExploration.includes("<summary>无法确定时的事实边界</summary>"), false);
});

test("阅读版权限上下文在账号不一致时保留角色、计划账号与实际账号关系", () => {
  const model = reportModel();
  model.case_details[0].permissions = [{
    role_text: "订单复核员",
    permissions: ["订单复核"],
    planned_account_ref: "qa-reviewer-planned",
    observed_account_ref: "qa-reviewer-observed",
    verification: "mismatch"
  }];

  const html = buildHtmlReport(model);

  assert.match(html, /class="permission-context"[\s\S]*?角色 · 订单复核员[\s\S]*?权限 · 订单复核[\s\S]*?计划账号 · qa-reviewer-planned[\s\S]*?实际账号 · qa-reviewer-observed[\s\S]*?核验状态 · 核验不匹配[\s\S]*?<\/div>/);
  assert.equal(html.includes("账号 · qa-reviewer-planned</span><span class=\"context-chip account-chip\">账号 · qa-reviewer-observed"), false);
});

test("阅读版权限上下文不会把同账号的核验不匹配臆断为账号不一致", () => {
  const model = reportModel();
  model.case_details[0].permissions = [{
    role_text: "活动审核员",
    permissions: ["活动审核"],
    planned_account_ref: "qa-reviewer-same",
    observed_account_ref: "qa-reviewer-same",
    verification: "mismatch"
  }];

  const html = buildHtmlReport(model);

  assert.match(html, /计划\/实际账号 · qa-reviewer-same[\s\S]*?核验状态 · 核验不匹配/);
  assert.equal(html.includes("核验状态 · 账号不一致"), false);
});

test("阅读版权限上下文在尚无实际账号观察时明确标记未核验和未记录", () => {
  const model = reportModel();
  model.case_details[0].permissions = [{
    role_text: "待核验审核员",
    permissions: ["活动审核"],
    planned_account_ref: "qa-reviewer-pending",
    observed_account_ref: null,
    verification: "unconfirmed"
  }];

  const html = buildHtmlReport(model);

  assert.match(html, /class="permission-context"[\s\S]*?角色 · 待核验审核员[\s\S]*?计划账号 · qa-reviewer-pending[\s\S]*?实际账号 · 未核验\/未记录[\s\S]*?核验状态 · 未核验[\s\S]*?<\/div>/);
});

test("阅读版固定脚本受 CSP 哈希保护且包含筛选分页和焦点恢复", () => {
  const html = buildHtmlReport(reportModel());
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  const declaredHash = html.match(/script-src 'sha256-([^']+)'/)?.[1];

  assert.ok(script);
  assert.equal(declaredHash, crypto.createHash("sha256").update(script).digest("base64"));
  for (const behavior of ["data-filter-result", "visibleRows", "showPage(0)", "dialog.showModal()", "lastTrigger.focus", "imageDialog.showModal()"]) {
    assert.equal(script.includes(behavior), true, behavior);
  }
});

test("清除结果筛选后焦点回到可见用例区域且完整输入顺序及分页恢复", t => {
  const dom = new JSDOM(buildHtmlReport(reportModel()), { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const { document } = dom.window;
  // jsdom models focus and events but has no layout/scroll implementation.
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.eval(document.querySelector("script").textContent);
  const root = document.querySelector("[data-page-size]");
  const clear = root.querySelector("[data-clear-filter]");
  const visibleIds = () => [...root.querySelectorAll(".case-row")].filter(row => !row.hidden).map(row => row.querySelector("[data-open-case]").dataset.openCase);
  document.querySelector('[data-filter-result="failed"]').click();
  assert.equal(document.activeElement, clear);
  assert.equal(visibleIds().length, 2);
  clear.click();
  assert.equal(clear.hidden, true);
  assert.equal(document.activeElement, root, "focus must move off the now-hidden button to the visible case region");
  assert.equal(root.getAttribute("tabindex"), "-1", "programmatic focus must not add a new tab stop");
  assert.equal(visibleIds().length, 20);
  assert.deepEqual(visibleIds().slice(0, 3), ["0", "1", "2"]);
  root.querySelector("[data-page-next]").click();
  assert.deepEqual(visibleIds(), ["20"]);
});
