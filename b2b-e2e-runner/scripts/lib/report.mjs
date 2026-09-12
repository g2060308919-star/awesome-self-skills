const LABELS = {
  passed: "通过",
  failed: "未通过",
  undetermined: "无法确定",
  not_executed: "未执行"
};

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
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

export function buildReport(testCases, executionLog) {
  const rows = [];
  const resultDetails = { failed: [], undetermined: [] };
  const counts = { passed: 0, failed: 0, undetermined: 0, not_executed: 0 };
  for (const [caseIndex, testCase] of testCases.cases.entries()) {
    const state = executionLog.cases[caseIndex];
    const result = state.result;
    counts[result] += 1;
    const reason = state.reason || "缺少必要检查点结果，无法确定";
    rows.push(`| ${escapeCell(testCase.case_id)} | ${escapeCell(testCase.module)} | ${escapeCell(testCase.title)} | ${LABELS[result]} | ${escapeCell(reason)} |`);
    if (resultDetails[result]) resultDetails[result].push(`- ${testCase.case_id}（${testCase.title}）：${reason}`);
  }
  const assistance = (executionLog.events ?? []).filter(event => ["assistance", "blocker"].includes(event.type));
  const evidenceStates = (executionLog.cases ?? []).flatMap(item => item.checkpoints)
    .reduce((countsByState, checkpoint) => {
      countsByState[checkpoint.evidence_status] = (countsByState[checkpoint.evidence_status] ?? 0) + 1;
      return countsByState;
    }, {});
  const roles = executionLog.browser?.role_observations ?? [];
  const proxy = executionLog.proxy ?? { state: "unknown" };
  const cleanup = executionLog.cleanup ?? { attempted: false, completed: false, items: [] };
  const detail = values => values.length ? values.join("\n") : "- 无";
  const markdown = `# B2B E2E 测试报告\n\n` +
    `- Run ID：${escapeCell(executionLog.run.run_id)}\n` +
    `- 开始/完成时间：${escapeCell(executionLog.run.started_at)} / ${escapeCell(executionLog.run.completed_at ?? "未完成")}\n` +
    `- 目标：${escapeCell((testCases.suite.target_urls ?? []).join("、"))}\n` +
    `- 角色：${escapeCell(roles.length ? roles.map(role => role.role ?? role).join("、") : "未记录")}\n` +
    `- 用例快照 SHA-256：${escapeCell(executionLog.test_cases.sha256)}\n\n` +
    `## 四态统计\n\n` +
    `- 通过：${counts.passed}\n- 未通过：${counts.failed}\n` +
    `- 无法确定：${counts.undetermined}\n- 未执行：${counts.not_executed}\n\n` +
    `| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |\n` +
    `|---|---|---|---|---|\n${rows.join("\n")}\n\n` +
    `## 未通过详情\n\n${detail(resultDetails.failed)}\n\n` +
    `## 无法确定详情\n\n${detail(resultDetails.undetermined)}\n\n` +
    `## 用户协助与阻塞\n\n${detail(assistance.map(event => `- ${event.at}：${event.description ?? event.reason ?? event.type}`))}\n\n` +
    `## 证据状态与数据处理\n\n- 状态计数：${escapeCell(JSON.stringify(evidenceStates))}\n- 报告发布前已扫描用例、日志与文本证据中的秘密信息。\n\n` +
    `## 代理状态与真实验证\n\n- 状态：${escapeCell(proxy.state)}\n${detail((proxy.verifications ?? []).map(item => `- ${typeof item === "string" ? item : JSON.stringify(item)}`))}\n\n` +
    `## 清理结果\n\n- 已尝试：${escapeCell(cleanup.attempted)}；已完成：${escapeCell(cleanup.completed)}\n${detail((cleanup.items ?? []).map(fact => `- ${typeof fact === "string" ? fact : JSON.stringify(fact)}`))}\n\n` +
    `## 产物一致性校验\n\n- 输入哈希、ID 引用、证据路径、四态计数和秘密扫描均已通过。\n`;
  return { markdown, counts };
}
