const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeEvidenceHref(relativePath) {
  if (typeof relativePath !== "string" || relativePath.includes("\\") || relativePath.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(relativePath)) return null;
  const parts = relativePath.split("/");
  if (parts[0] !== "evidence" || parts.length < 2 || parts.some(part => !part || part === "." || part === "..")) return null;
  return parts.map(encodeURIComponent).join("/");
}

function list(values) {
  return `<ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
}

function evidenceItem(entry) {
  if (!entry.path) {
    const facts = entry.inline_facts.map(fact => `<dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd>`).join("");
    return `<li><strong>${escapeHtml(entry.evidence_id)}</strong>：${escapeHtml(entry.description)}<dl class="evidence-facts">${facts}</dl></li>`;
  }
  const href = safeEvidenceHref(entry.path);
  if (!href) return `<li><strong>${escapeHtml(entry.evidence_id)}</strong>：证据路径被拒绝</li>`;
  const extension = `.${entry.path.split(".").at(-1)?.toLowerCase()}`;
  const preview = IMAGE_EXTENSIONS.has(extension)
    ? `<figure><img src="${href}" alt="${escapeHtml(entry.description)}"><figcaption>${escapeHtml(entry.description)}</figcaption></figure>`
    : `<a href="${href}" download>${escapeHtml(entry.description)}</a>`;
  return `<li><strong>${escapeHtml(entry.evidence_id)}</strong>：${preview}</li>`;
}

function caseDetail(detail) {
  const steps = detail.steps.map(step => {
    const expected = step.expected.map(item => `<li><p><strong>${escapeHtml(item.oracle_id)}</strong>：${escapeHtml(item.text)}</p>` +
      `<dl><dt>结果</dt><dd>${escapeHtml(item.result_label)}</dd><dt>原因</dt><dd>${escapeHtml(item.reason)}</dd>` +
      `<dt>实际观察</dt><dd>${list(item.observations)}</dd><dt>证据状态</dt><dd>${escapeHtml(item.evidence_status_label)}</dd>` +
      `<dt>阻塞</dt><dd>${escapeHtml(item.blocker)}</dd></dl>` +
      (item.evidence.length ? `<ul class="evidence">${item.evidence.map(evidenceItem).join("")}</ul>` : "") +
      `</li>`).join("");
    return `<section><h3>${escapeHtml(step.step_id)} · ${escapeHtml(step.action)}</h3><ol>${expected}</ol></section>`;
  }).join("");
  return `<details id="${detail.anchor}"><summary>${escapeHtml(detail.case_id)} · ${escapeHtml(detail.title)} · ${escapeHtml(detail.result_label)}</summary>` +
    `<p><strong>原因：</strong>${escapeHtml(detail.reason)}</p><h3>原前置条件</h3>${list(detail.preconditions)}${steps}</details>`;
}

function permissionSection(permission) {
  if (!permission.plan) return `<p>该 Run 没有权限批次工作流标记；按历史兼容模式展示。</p>`;
  const rows = permission.groups.map(group => `<tr><td>${escapeHtml(group.role_text)}</td>` +
    `<td>${list(group.permissions)}</td><td>${escapeHtml(group.account_ref ?? "未确定")}</td><td>${escapeHtml(group.availability_label)}</td>` +
    `<td>${escapeHtml(group.verification_label)}</td><td>${list(group.case_ids)}</td><td>${escapeHtml(group.wait_reason ?? group.batch_description ?? "无")}</td></tr>`).join("");
  return `<div class="table-wrap"><table><thead><tr><th>所需角色</th><th>具体权限</th><th>账号引用</th><th>准备状态</th><th>实际核验</th><th>受影响用例</th><th>当前说明</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function semanticFactTable(items, emptyMessage = "未记录") {
  if (!items.length) return `<p>${escapeHtml(emptyMessage)}</p>`;
  const rows = items.map(item => `<tr><td>${escapeHtml(item.item)}</td><td>${escapeHtml(item.description)}</td><td>${escapeHtml(item.outcome)}</td></tr>`).join("");
  return `<div class="table-wrap"><table class="facts"><thead><tr><th>项目</th><th>实际情况</th><th>结论</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function timeline(items) {
  if (!items.length) return "<p>没有需要特别说明的执行记录。</p>";
  return `<ol class="timeline">${items.map(item => `<li><time${item.at ? ` datetime="${escapeHtml(item.at)}"` : ""}>${escapeHtml(item.time_label)}</time>` +
    `<div><strong>${escapeHtml(item.stage)}</strong><p>${escapeHtml(item.description)}</p><span class="outcome">${escapeHtml(item.outcome)}</span></div></li>`).join("")}</ol>`;
}

function proxyAndCleanup(model) {
  const proxy = model.proxy_summary;
  const proxyFacts = [
    { item: "当前状态", description: proxy.description, outcome: proxy.status },
    { item: "影响范围", description: proxy.scope, outcome: proxy.scope_outcome },
    { item: "停止后恢复", description: proxy.restoration, outcome: proxy.restoration_outcome }
  ];
  return `<h3>代理概况</h3>${semanticFactTable(proxyFacts)}` +
    `<h3>运行期验证</h3>${semanticFactTable(proxy.verifications, proxy.status === "本次不需要代理" ? "本次不需要代理，因此没有运行期代理验证。" : "未记录代理验证结果。")}` +
    `<h3>自动清理</h3><p class="section-result"><strong>${escapeHtml(model.cleanup_summary.status)}</strong></p>` +
    semanticFactTable(model.cleanup_summary.items, model.cleanup_summary.status === "无需清理" ? "本次没有需要清理的代理资源。" : "未记录具体清理项目。");
}

export function buildHtmlReport(model) {
  const summaryRows = model.rows.map(row => `<tr><td><a href="#${row.anchor}">${escapeHtml(row.case_id)}</a></td>` +
    `<td>${escapeHtml(row.module)}</td><td>${escapeHtml(row.title)}</td><td><span class="status ${row.result}">${escapeHtml(row.result_label)}</span></td><td>${escapeHtml(row.reason)}</td></tr>`).join("");
  const waiting = model.run.status === "awaiting_user"
    ? `<aside class="waiting" role="status"><strong>未完成，等待用户准备权限</strong><p>等待检查点：${escapeHtml(model.permission.waiting_checkpoint_ids.join("、") || "账本未记录")}</p></aside>`
    : "";
  const cards = Object.entries(model.counts).map(([state, count]) => `<div class="card"><span>${escapeHtml({ passed: "通过", failed: "未通过", undetermined: "无法确定", not_executed: "未执行" }[state])}</span><strong>${count}</strong></div>`).join("");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'; script-src 'none'">
<title>${escapeHtml(model.suite.name)} · B2B E2E 测试报告</title><style>
:root{font-family:ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#172033;background:#f5f7fb;line-height:1.55}body{margin:0}main{max-width:1180px;margin:auto;padding:28px;overflow-x:hidden}header,section,details,aside{background:#fff;border:1px solid #dfe5ef;border-radius:12px;padding:18px;margin:14px 0}h1,h2,h3,h4{line-height:1.25}.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}.cards{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px}.card{background:#eef3fb;border-radius:10px;padding:14px}.card strong{display:block;font-size:1.7rem}.waiting{border-color:#c78516;background:#fff8e8}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:760px}th,td{border:1px solid #dfe5ef;padding:10px;text-align:left;vertical-align:top}th{background:#eef3fb}td:first-child{overflow-wrap:anywhere;max-width:20rem}td:last-child{min-width:18rem}.facts td:last-child{min-width:8rem}.status{font-weight:700}.passed{color:#116b42}.failed{color:#a12222}.undetermined{color:#805600}.not_executed{color:#596275}summary{cursor:pointer;font-weight:700}.timeline{list-style:none;padding:0}.timeline li{display:grid;grid-template-columns:minmax(12rem,15rem) 1fr;gap:16px;border-top:1px solid #dfe5ef;padding:14px 0}.timeline li:first-child{border-top:0}.timeline time{color:#596275}.timeline p{margin:4px 0}.outcome,.section-result{color:#334b6f}img{display:block;max-width:100%;height:auto;border:1px solid #dfe5ef}dt{font-weight:700}dd{margin:0 0 8px}@media(max-width:640px){main{padding:12px}.cards{grid-template-columns:repeat(2,1fr)}.timeline li{grid-template-columns:1fr}.facts{min-width:560px}}
</style></head><body><main><header><h1>B2B E2E 测试报告</h1><div class="meta"><div><strong>Run ID</strong><br>${escapeHtml(model.run.run_id)}</div><div><strong>测试目标</strong><br>${escapeHtml(model.suite.target_urls.join("、"))}</div><div><strong>当前阶段</strong><br>${escapeHtml(model.run.status_label)}</div><div><strong>开始 / 完成</strong><br>${escapeHtml(model.run.started_at_label)} / ${escapeHtml(model.run.completed_at_label)}</div></div></header>
${waiting}<section><h2>四态统计（${model.run.is_final ? "最终结果" : "当前结果"}）</h2><div class="cards">${cards}</div></section>
<section><h2>完整五列用例总表</h2><div class="table-wrap"><table><thead><tr><th>ID</th><th>模块</th><th>测试场景</th><th>测试结果</th><th>成功/失败的原因</th></tr></thead><tbody>${summaryRows}</tbody></table></div></section>
<section><h2>用例详情</h2>${model.case_details.map(caseDetail).join("")}</section>
<section><h2>权限准备与执行批次</h2>${permissionSection(model.permission)}</section>
<section><h2>关键执行记录</h2>${timeline(model.timeline)}</section>
<section><h2>代理验证与清理</h2>${proxyAndCleanup(model)}</section>
<section><h2>一致性及证据说明</h2><p>本页和 report.md 来自同一次不可变用例快照与执行日志读取；结构校验通过不等于程序自动证明业务结论正确。</p>${semanticFactTable(model.consistency.checks)}</section>
</main></body></html>\n`;
}
