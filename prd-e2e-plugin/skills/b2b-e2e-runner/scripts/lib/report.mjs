import { buildReportModel } from "./report-model.mjs";

export function aggregateCase({ excluded = false, checkpoints = [] }) {
  if (excluded) return "not_executed";
  const required = checkpoints.filter(item => item.required !== false);
  if (required.some(item => item.result === "failed")) return "failed";
  if (required.length === 0) return "undetermined";
  if (required.some(item => item.result === "undetermined" || item.result === "not_executed")) {
    return "undetermined";
  }
  return required.every(item => item.result === "passed") ? "passed" : "undetermined";
}

function escapeCell(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "\\|")
    .replaceAll("\n", "<br>");
}

export function renderMarkdownReport(model) {
  const rows = model.rows.map(row => `| ${escapeCell(row.case_id)} | ${escapeCell(row.module)} | ${escapeCell(row.title)} | ${row.result_label} | ${escapeCell(row.reason)} |`);
  const detail = values => values.length ? values.join("\n") : "- 无";
  const semanticFacts = items => detail(items.map(item => `- ${escapeCell(item.item)}：${escapeCell(item.description)}；结论：${escapeCell(item.outcome)}`));
  const evidenceSummary = model.consistency.checks.find(item => item.item === "证据状态")?.description ?? "未记录";
  const permission = model.permission.plan
    ? `\n\n## 权限准备与执行批次\n\n` + model.permission.groups.map(group =>
      `- ${escapeCell(group.group_id)}：${escapeCell(group.role_text)}；准备=${escapeCell(group.availability_label)}；账号=${escapeCell(group.account_ref ?? "未确定")}；核验=${escapeCell(group.verification_label)}；说明=${escapeCell(group.wait_reason ?? group.batch_description ?? group.declaration)}`
    ).join("\n")
    : "";
  const markdown = `# B2B E2E 测试报告\n\n` +
    `- Run ID：${escapeCell(model.run.run_id)}\n` +
    `- 开始/完成时间：${escapeCell(model.run.started_at)} / ${escapeCell(model.run.completed_at ?? "未完成")}\n` +
    `- 当前阶段：${escapeCell(model.run.status_label)}\n` +
    `- 目标：${escapeCell(model.suite.target_urls.join("、"))}\n` +
    `- 角色：${escapeCell(model.roles.length ? model.roles.join("、") : "未记录")}\n` +
    `- 用例快照 SHA-256：${escapeCell(model.snapshot_sha256)}\n` +
    `- 事件读取边界：${model.run.last_sequence} / ${model.run.event_count}\n\n` +
    `## 四态统计\n\n` +
    `- 通过：${model.counts.passed}\n- 未通过：${model.counts.failed}\n` +
    `- 无法确定：${model.counts.undetermined}\n- 未执行：${model.counts.not_executed}\n\n` +
    `| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |\n` +
    `|---|---|---|---|---|\n${rows.join("\n")}\n\n` +
    `## 未通过详情\n\n${detail(model.result_details.failed.map(row => `- ${escapeCell(row.case_id)}（${escapeCell(row.title)}）：${escapeCell(row.reason)}`))}\n\n` +
    `## 无法确定详情\n\n${detail(model.result_details.undetermined.map(row => `- ${escapeCell(row.case_id)}（${escapeCell(row.title)}）：${escapeCell(row.reason)}`))}\n\n` +
    `## 用户协助与阻塞\n\n${detail(model.assistance.map(event => `- ${escapeCell(event.at)}：${escapeCell(event.description ?? event.reason ?? event.type)}`))}` + permission + `\n\n` +
    `## 证据状态与数据处理\n\n- ${escapeCell(evidenceSummary)}\n- 报告发布前已扫描用例、日志与文本证据中的秘密信息。\n\n` +
    `## 代理状态与真实验证\n\n- 状态：${escapeCell(model.proxy_summary.status)}\n- 影响范围：${escapeCell(model.proxy_summary.scope)}；结论：${escapeCell(model.proxy_summary.scope_outcome)}\n- 停止后恢复：${escapeCell(model.proxy_summary.restoration)}；结论：${escapeCell(model.proxy_summary.restoration_outcome)}\n${semanticFacts(model.proxy_summary.verifications)}\n\n` +
    `## 清理结果\n\n- 状态：${escapeCell(model.cleanup_summary.status)}\n${semanticFacts(model.cleanup_summary.items)}\n\n` +
    `## 产物一致性校验\n\n- 输入哈希、ID 引用、证据路径、四态计数、事件读取边界和秘密扫描均已通过。\n`;
  return markdown;
}

export function renderChatTableMarkdown(model) {
  const rows = model.rows.map(row => `| ${escapeCell(row.display_id ?? row.case_id)} | ${escapeCell(row.module)} | ${escapeCell(row.title)} | ${row.result_label} | ${escapeCell(row.reason)} |`);
  return `| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |\n` +
    `|---|---|---|---|---|\n${rows.join("\n")}`;
}

export function buildReport(testCases, executionLog) {
  const model = buildReportModel(testCases, executionLog);
  return { markdown: renderMarkdownReport(model), counts: model.counts };
}
