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

export function renderChatTableMarkdown(model) {
  const rows = model.rows.map(row => `| ${escapeCell(row.display_id ?? row.case_id)} | ${escapeCell(row.module)} | ${escapeCell(row.title)} | ${row.result_label} | ${escapeCell(row.reason)} |`);
  return `| ID | 模块 | 测试场景 | 测试结果 | 成功/失败的原因 |\n` +
    `|---|---|---|---|---|\n${rows.join("\n")}`;
}
