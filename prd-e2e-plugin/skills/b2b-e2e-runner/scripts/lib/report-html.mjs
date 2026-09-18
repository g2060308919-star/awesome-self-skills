import crypto from "node:crypto";

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

function proxySummary(model) {
  const proxy = model.proxy_summary;
  const proxyFacts = [
    { item: "当前状态", description: proxy.description, outcome: proxy.status },
    { item: "影响范围", description: proxy.scope, outcome: proxy.scope_outcome },
    { item: "停止后恢复", description: proxy.restoration, outcome: proxy.restoration_outcome }
  ];
  return `<h3>代理概况</h3>${semanticFactTable(proxyFacts)}` +
    `<h3>运行期验证</h3>${semanticFactTable(proxy.verifications, proxy.status === "本次不需要代理" ? "本次不需要代理，因此没有运行期代理验证。" : "未记录代理验证结果。")}`;
}

function proxyAndCleanup(model) {
  return proxySummary(model) +
    `<h3>自动清理</h3><p class="section-result"><strong>${escapeHtml(model.cleanup_summary.status)}</strong></p>` +
    semanticFactTable(model.cleanup_summary.items, model.cleanup_summary.status === "无需清理" ? "本次没有需要清理的代理资源。" : "未记录具体清理项目。");
}

function buildLegacyHtmlReport(model) {
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

const V2_PAGE_SIZE = 20;
const V2_REPORT_SCRIPT = `(() => {
  const root = document.querySelector('[data-page-size]');
  const rows = Array.from(root.querySelectorAll('.case-row'));
  const pageSize = Number(root.dataset.pageSize);
  const pageText = root.querySelector('[data-page-indicator]');
  const previous = root.querySelector('[data-page-previous]');
  const next = root.querySelector('[data-page-next]');
  const activeFilter = root.querySelector('[data-active-filter]');
  const clearFilter = root.querySelector('[data-clear-filter]');
  const dialog = document.getElementById('case-dialog');
  const dialogTitle = dialog.querySelector('[data-dialog-title]');
  const dialogContent = dialog.querySelector('[data-dialog-content]');
  const close = dialog.querySelector('[data-dialog-close]');
  const imageDialog = document.getElementById('image-dialog');
  const image = imageDialog.querySelector('[data-enlarged-image]');
  const imageTitle = imageDialog.querySelector('[data-image-title]');
  const imageClose = imageDialog.querySelector('[data-image-close]');
  let page = 0;
  let resultFilter = null;
  let lastTrigger = null;
  let lastImageTrigger = null;
  const visibleRows = () => rows.filter(row => !resultFilter || row.dataset.result === resultFilter);
  const showPage = value => {
    const matchingRows = visibleRows();
    const pageCount = Math.max(1, Math.ceil(matchingRows.length / pageSize));
    page = Math.min(pageCount - 1, Math.max(0, value));
    rows.forEach(row => { row.hidden = true; });
    matchingRows.forEach((row, index) => { row.hidden = Math.floor(index / pageSize) !== page; });
    pageText.textContent = '第 ' + (page + 1) + ' / ' + pageCount + ' 页 · 共 ' + matchingRows.length + ' 条';
    previous.disabled = page === 0;
    next.disabled = page === pageCount - 1;
    activeFilter.hidden = !resultFilter;
    clearFilter.hidden = !resultFilter;
    if (resultFilter) activeFilter.textContent = '当前仅显示：' + ({ failed: '未通过', undetermined: '无法确定', not_executed: '未执行' }[resultFilter] || resultFilter);
  };
  previous.addEventListener('click', () => showPage(page - 1));
  next.addEventListener('click', () => showPage(page + 1));
  clearFilter.addEventListener('click', () => {
    resultFilter = null;
    showPage(0);
    root.setAttribute('tabindex', '-1');
    root.focus({ preventScroll: true });
  });
  document.addEventListener('click', event => {
    const filter = event.target.closest('[data-filter-result]');
    if (!filter) return;
    resultFilter = filter.dataset.filterResult;
    showPage(0);
    root.scrollIntoView({ block: 'start' });
    clearFilter.focus({ preventScroll: true });
  });
  root.addEventListener('click', event => {
    const trigger = event.target.closest('[data-open-case]');
    if (!trigger) return;
    const index = trigger.dataset.openCase;
    const template = document.querySelector('template[data-case-detail="' + index + '"]');
    if (!template) return;
    lastTrigger = trigger;
    dialogTitle.textContent = trigger.dataset.dialogTitle;
    dialogContent.replaceChildren(template.content.cloneNode(true));
    dialog.showModal();
    close.focus();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { if (lastTrigger?.isConnected) lastTrigger.focus(); });
  dialogContent.addEventListener('click', event => {
    const trigger = event.target.closest('[data-enlarge-image]');
    if (!trigger) return;
    const source = trigger.querySelector('img');
    if (!source) return;
    lastImageTrigger = trigger;
    image.src = source.src;
    image.alt = source.alt;
    imageTitle.textContent = source.alt || '关键证据截图';
    imageDialog.showModal();
    imageClose.focus();
  });
  imageClose.addEventListener('click', () => imageDialog.close());
  imageDialog.addEventListener('click', event => { if (event.target === imageDialog) imageDialog.close(); });
  imageDialog.addEventListener('close', () => { if (lastImageTrigger?.isConnected) lastImageTrigger.focus(); });
  showPage(0);
})();`;

function safeHttpHref(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function linkOrText(link, label) {
  const href = safeHttpHref(link);
  return href
    ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label ?? link)}</a>`
    : escapeHtml(label ?? link ?? "未记录");
}

function v2EvidenceItem(entry) {
  if (!entry.path) {
    const facts = entry.inline_facts.map(fact => `<dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd>`).join("");
    return `<li><strong>${escapeHtml(entry.evidence_id)}</strong>：${escapeHtml(entry.description)}<dl class="evidence-facts">${facts}</dl></li>`;
  }
  const href = safeEvidenceHref(entry.path);
  if (!href) return `<li><strong>${escapeHtml(entry.evidence_id)}</strong>：证据路径被拒绝</li>`;
  const extension = `.${entry.path.split(".").at(-1)?.toLowerCase()}`;
  if (!IMAGE_EXTENSIONS.has(extension)) {
    return `<li><strong>${escapeHtml(entry.evidence_id)}</strong>：<a href="${href}" download>${escapeHtml(entry.description)}</a></li>`;
  }
  return `<li><figure><button class="image-preview-button" type="button" data-enlarge-image aria-label="放大查看：${escapeHtml(entry.description)}">` +
    `<img src="${href}" alt="${escapeHtml(entry.description)}"></button><figcaption><strong>${escapeHtml(entry.evidence_id)}</strong> · ${escapeHtml(entry.description)}<span>点击图片放大查看</span></figcaption></figure></li>`;
}

function v2PermissionChips(detail) {
  if (!detail.permissions.length) return `<div class="context-chips"><span class="context-chip muted-chip">未关联权限组</span></div>`;
  return `<div class="context-chips">${detail.permissions.map(item => {
    const permissions = item.permissions.length ? item.permissions : ["未记录具体权限"];
    const permissionChips = permissions.map(permission => `<span class="context-chip permission-chip">权限 · ${escapeHtml(permission)}</span>`).join("");
    const plannedAccount = item.planned_account_ref ?? "未记录";
    const observedAccount = item.observed_account_ref;
    const accountChips = observedAccount && observedAccount === item.planned_account_ref
      ? `<span class="context-chip account-chip">计划/实际账号 · ${escapeHtml(observedAccount)}</span>`
      : `<span class="context-chip account-chip">计划账号 · ${escapeHtml(plannedAccount)}</span>` +
        `<span class="context-chip account-chip">实际账号 · ${escapeHtml(observedAccount ?? "未核验/未记录")}</span>`;
    const verificationLabel = { verified: "已核验", mismatch: "核验不匹配", unconfirmed: "未核验" }[item.verification] ?? "未记录";
    return `<div class="permission-context"><span class="context-chip role-chip">角色 · ${escapeHtml(item.role_text)}</span>${permissionChips}${accountChips}` +
      `<span class="context-chip verification-chip">核验状态 · ${escapeHtml(verificationLabel)}</span></div>`;
  }).join("")}</div>`;
}

function v2CaseDetail(detail) {
  const steps = detail.steps.map((step, stepIndex) => `<li class="step-item"><span class="step-number" aria-hidden="true">${stepIndex + 1}</span><div class="step-content"><p class="step-source">原步骤 ${escapeHtml(step.step_id)}</p><h4>${escapeHtml(step.action)}</h4>` +
    `<div class="expectation-list">${step.expected.map(item => `<article class="expectation"><p class="oracle-id">检查点 ${escapeHtml(item.oracle_id)}</p>` +
      `<div class="comparison"><div class="comparison-row expected"><span>预期结果</span><p>${escapeHtml(item.text)}</p></div>` +
      `<div class="comparison-row observed"><span>实际观察</span><div>${list(item.observations)}</div></div></div>` +
      `<dl class="checkpoint-meta"><dt>检查结果</dt><dd>${escapeHtml(item.result_label)}</dd><dt>结果原因</dt><dd>${escapeHtml(item.reason)}</dd>` +
      `<dt>证据状态</dt><dd>${escapeHtml(item.evidence_status_label)}</dd><dt>阻塞</dt><dd>${escapeHtml(item.blocker)}</dd></dl>` +
      (item.evidence.length ? `<ul class="evidence">${item.evidence.map(v2EvidenceItem).join("")}</ul>` : "<p class=\"evidence-gap\">未关联可展示的关键图片。</p>") +
      `</article>`).join("")}</div></div></li>`).join("");
  const actual = detail.actual_records.length
    ? `<ol>${detail.actual_records.map(item => `<li>${escapeHtml(item.description)}</li>`).join("")}</ol>`
    : "<p>未记录已执行动作；原步骤不会被写成已执行事实。</p>";
  const captures = detail.capture_records.length
    ? `<ul>${detail.capture_records.map(item => `<li>${escapeHtml(item.description)}：${escapeHtml({ captured: "已采集", failed: "采集失败", unavailable: "当前不可用" }[item.outcome] ?? "未识别")}` +
      `${item.reason ? `；${escapeHtml(item.reason)}` : ""}</li>`).join("")}</ul>`
    : "<p class=\"evidence-gap\">未记录关键截图采集结果。</p>";
  const exploration = detail.exploration_records.length
    ? detail.exploration_records.map(item => `<article class="step"><h4>尚缺事实或条件</h4><p>${escapeHtml(item.missing_fact)}</p>` +
      `<h4>已知事实</h4>${item.known_facts.length ? list(item.known_facts) : "<p>无可额外确认的事实。</p>"}` +
      `<h4>实际尝试及结果</h4>${item.attempts.length ? `<ol>${item.attempts.map(attempt => `<li><strong>${escapeHtml(attempt.action)}</strong><p>${escapeHtml(attempt.observation)}</p></li>`).join("")}</ol>` : `<p>${escapeHtml(item.not_attempted_reason ?? "未记录尝试原因")}</p>`}` +
      `<h4>当前不能继续的原因</h4><p>${escapeHtml(item.cannot_continue_reason)}</p></article>`).join("")
    : "";
  return `<div class="case-detail"><section class="detail-outcome ${escapeHtml(detail.result)}"><div class="outcome-heading"><span class="status ${escapeHtml(detail.result)}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(detail.result_label)}</span><strong>${escapeHtml(detail.title)}</strong></div><p>${escapeHtml(detail.reason)}</p></section>` +
    `<div class="detail-context"><span class="context-chip neutral-chip">${escapeHtml(detail.display_id)}</span><span class="context-chip neutral-chip">模块 · ${escapeHtml(detail.module)}</span>${v2PermissionChips(detail)}</div>` +
    `<details class="full-id"><summary>查看完整原始用例 ID</summary><p>${escapeHtml(detail.case_id)}</p></details>` +
    `<div class="detail-flow"><section class="detail-section"><h3>测试前提</h3>${list(detail.preconditions)}</section>` +
    `<section class="detail-section"><h3>操作步骤、预期与实际</h3><ol class="step-list">${steps}</ol></section>` +
    `<details class="supplementary-details"><summary>实际执行记录</summary><div class="supplementary-content">${actual}</div></details>` +
    `<details class="supplementary-details"><summary>截图采集记录</summary><div class="supplementary-content">${captures}</div></details>` +
    (exploration ? `<details class="supplementary-details"><summary>无法确定时的事实边界</summary><div class="supplementary-content">${exploration}</div></details>` : "") +
    `</div></div>`;
}

function v2PermissionSection(permission) {
  if (!permission.plan) return `<p>该 Run 没有权限批次工作流标记；按历史兼容模式展示。</p>`;
  const rows = permission.groups.map(group => `<tr><td>${escapeHtml(group.role_text)}</td><td>${list(group.permissions)}</td>` +
    `<td>${escapeHtml(group.account_ref ?? "未确定")}</td><td>${escapeHtml(group.availability_label)}</td><td>${escapeHtml(group.verification_label)}</td>` +
    `<td class="permission-case-ids">${group.case_ids.map(caseId => `<span>${escapeHtml(caseId)}</span>`).join("")}</td>` +
    `<td>${escapeHtml(group.wait_reason ?? group.batch_description ?? "无")}</td></tr>`).join("");
  return `<div class="table-wrap permission-table-wrap"><table class="permission-table"><thead><tr><th>所需角色</th><th>具体权限</th><th>账号引用</th><th>准备状态</th><th>实际核验</th><th>受影响用例</th><th>当前说明</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function v2ActionGroup(result, label, rows, action) {
  const count = rows.length;
  const classes = result === "failed" ? "conclusion-block failure-summary" : result === "undetermined" ? "conclusion-block unknown-summary" : `action-group action-${result}`;
  return `<article class="${escapeHtml(classes)}" data-action-group="${escapeHtml(result)}"><div><p class="summary-kicker">${escapeHtml(action)}</p><h3>${escapeHtml(label)}</h3><p>${count} 条用例；按原始输入顺序保留在完整用例表中。</p></div>` +
    `<button type="button" data-filter-result="${escapeHtml(result)}"${count ? "" : " disabled"}>查看全部 ${count} 条</button></article>`;
}

function durationMarkup(value) {
  const label = String(value ?? "");
  const matches = [...label.matchAll(/(\d+)\s*(小时|分钟|秒)/g)];
  if (matches.length < 2 && !matches.some(match => match[2] === "小时")) return `<strong>${escapeHtml(label)}</strong>`;
  return `<div class="duration-parts" aria-label="${escapeHtml(label)}">${matches.map(match => `<span><strong>${escapeHtml(match[1])}</strong><small>${escapeHtml(match[2])}</small></span>`).join("")}</div>`;
}

function targetLabel(value) {
  try {
    const parsed = new URL(value);
    return `${parsed.hostname} 测试地址`;
  } catch {
    return value;
  }
}

function v2Verdict(model) {
  if (!model.run.is_final) {
    return {
      tone: "pending",
      label: "报告未完成",
      summary: `当前阶段：${model.run.status_label}`
    };
  }
  if (model.counts.failed > 0) {
    return {
      tone: "failed",
      label: "验收未通过",
      summary: `${model.counts.failed} 项失败待修复 · ${model.counts.undetermined} 项无法确定待补证`
    };
  }
  if (model.counts.undetermined > 0) {
    return {
      tone: "undetermined",
      label: "验收待补证",
      summary: `${model.counts.undetermined} 项无法确定，需要补充事实`
    };
  }
  if (model.counts.not_executed > 0) {
    return {
      tone: "not-executed",
      label: "验收有排除项",
      summary: `${model.counts.not_executed} 项按确认范围未执行`
    };
  }
  return {
    tone: "passed",
    label: "验收通过",
    summary: `${model.counts.passed} 项用例全部通过`
  };
}

function buildV2HtmlReport(model) {
  const pageCount = Math.max(1, Math.ceil(model.rows.length / V2_PAGE_SIZE));
  const cspHash = crypto.createHash("sha256").update(V2_REPORT_SCRIPT).digest("base64");
  const rows = model.rows.map((row, index) => `<tr class="case-row" data-result="${escapeHtml(row.result)}"${index >= V2_PAGE_SIZE ? " hidden" : ""}><td>${escapeHtml(row.display_id)}</td>` +
    `<td>${escapeHtml(row.module)}</td><td>${escapeHtml(row.title)}</td><td><span class="status ${row.result}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(row.result_label)}</span></td>` +
    `<td>${escapeHtml(row.reason)}</td><td><button class="view-button" type="button" aria-label="查看 ${escapeHtml(row.display_id)} 的用例详情" data-open-case="${index}" data-dialog-title="${escapeHtml(`${row.display_id} · ${row.title}`)}">查看</button></td></tr>`).join("");
  const templates = model.case_details.map((detail, index) => `<template data-case-detail="${index}">${v2CaseDetail(detail)}</template>`).join("");
  const overview = [
    ["用例总数", model.overview.total, "total"], ["通过数量", model.counts.passed, "passed"], ["失败数量", model.counts.failed, "failed"],
    ["无法确定", model.counts.undetermined, "undetermined"], ["不执行", model.counts.not_executed, "not-executed"], ["通过率", model.overview.pass_rate, "passed"],
    ["失败率", model.overview.fail_rate, "failed"], ["执行耗时", model.overview.execution_duration, "duration"]
  ].map(([label, value, tone]) => `<div class="metric metric-${tone}"><span class="metric-label">${escapeHtml(label)}</span>${tone === "duration" ? durationMarkup(value) : `<strong>${escapeHtml(value)}</strong>`}</div>`).join("");
  const prd = model.report_context.prd_links.length
    ? `<ul>${model.report_context.prd_links.map(item => `<li>${linkOrText(item.url, item.title)}</li>`).join("")}</ul>`
    : "<p>未记录</p>";
  const targets = model.suite.target_urls.length
    ? `<ul>${model.suite.target_urls.map(item => `<li>${linkOrText(item, targetLabel(item))}</li>`).join("")}</ul>`
    : "<p>未记录</p>";
  const accounts = model.report_context.accounts.length ? list(model.report_context.accounts) : "<p>未记录</p>";
  const sampleFacts = model.timeline.filter(item => item.stage === "测试数据");
  const waiting = model.run.status === "awaiting_user"
    ? `<aside class="waiting" role="status"><strong>本报告尚未完成</strong><p>记录截止时刻：${escapeHtml(model.run.boundary_at_label)}。当前等待用户协作，阶段聚合中的“无法确定”不是最终结论。</p></aside>`
    : "";
  const verdict = v2Verdict(model);
  const actionGroups = [
    v2ActionGroup("failed", "未通过", model.result_details.failed, "需要优先修复并复测"),
    v2ActionGroup("undetermined", "无法确定", model.result_details.undetermined, "需要补齐事实或条件"),
    v2ActionGroup("not_executed", "未执行", model.rows.filter(row => row.result === "not_executed"), "需要确认排除范围")
  ].join("");
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'sha256-${cspHash}'; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; connect-src 'none'">
<title>${escapeHtml(model.suite.name)} · B2B E2E 测试报告</title><style>
:root{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#20263d;background:#f6f7fb;line-height:1.6;--ink:#20263d;--muted:#778097;--line:#e8ebf2;--soft:#f7f8fc;--accent:#6558e8;--accent-soft:#efedff;--pass:#16845b;--pass-soft:#e9f7f1;--fail:#c54343;--fail-soft:#fdefef;--unknown:#a46a08;--unknown-soft:#fff6de;--skip:#647084;--skip-soft:#eef1f5}*{box-sizing:border-box}body{margin:0;overflow-x:hidden;background:linear-gradient(180deg,#f1f2fa 0,#f6f7fb 340px)}main{max-width:1380px;margin:auto;padding:38px 40px 64px}a{color:#5146d8;text-decoration:none;border-bottom:1px solid #c9c4ff}a:hover{color:#3329b8;border-bottom-color:#6558e8}h1,h2,h3,h4,h5{color:var(--ink);line-height:1.3}h1{font-size:clamp(2rem,4vw,3.35rem);letter-spacing:-.04em;margin:.25rem 0 .75rem}h2{font-size:1.4rem;margin:0}h3{font-size:1.02rem;margin:0 0 .75rem}h4{font-size:.92rem;margin:1.1rem 0 .35rem}.report-hero{position:relative;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:18px;padding:34px 36px 28px;margin:0 0 18px}.report-hero::before{content:"";position:absolute;inset:0 0 auto;height:4px;background:linear-gradient(90deg,var(--accent),#9a73ef,#d66ab0)}.eyebrow{margin:0;color:var(--accent);font-size:.75rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.hero-description{max-width:780px;margin:0;color:var(--muted);font-size:1rem}.hero-meta{display:grid;grid-template-columns:minmax(240px,1.5fr) repeat(2,minmax(160px,.7fr));gap:0;margin-top:26px;border-top:1px solid var(--line)}.hero-meta>div{padding:17px 22px 0 0;overflow-wrap:anywhere}.hero-meta>div+div{border-left:1px solid var(--line);padding-left:22px}.hero-meta span,.metric span,.environment-item>span{display:block;color:var(--muted);font-size:.76rem;font-weight:700;letter-spacing:.04em}.hero-meta strong{display:block;margin-top:4px;font-size:.9rem}.waiting{border:1px solid #edd18e;background:#fffaea;border-radius:10px;padding:13px 15px;margin:20px 0 0;color:#715014}.waiting p{margin:.2rem 0 0}.report-section{background:#fff;border:1px solid var(--line);border-radius:15px;padding:28px 30px;margin:18px 0}.section-heading{display:flex;align-items:center;gap:13px;margin-bottom:22px}.section-index{display:grid;place-items:center;width:38px;height:30px;border-radius:8px;background:var(--accent-soft);color:var(--accent);font-size:.73rem;font-weight:800;letter-spacing:.06em}.section-heading p{margin:2px 0 0;color:var(--muted);font-size:.82rem}.metric-strip{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}.metric{position:relative;min-height:105px;padding:21px 17px}.metric+.metric{border-left:1px solid var(--line)}.metric::before{content:"";position:absolute;inset:0 0 auto;height:3px;background:#cfd4df}.metric-1::before{background:var(--pass)}.metric-2::before{background:var(--fail)}.metric-3::before{background:#d79a2b}.metric-4::before{background:#8a94a6}.metric strong{display:block;margin-top:8px;color:var(--ink);font-size:1.7rem;line-height:1.2;font-variant-numeric:tabular-nums}.overview-note{margin:15px 0 0;color:var(--muted);font-size:.83rem}.environment-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border:1px solid var(--line);border-radius:12px;overflow:hidden}.environment-item{min-height:132px;padding:19px 21px}.environment-item:nth-child(3n+2),.environment-item:nth-child(3n+3){border-left:1px solid var(--line)}.environment-item:nth-child(n+4){border-top:1px solid var(--line)}.environment-item h3{margin:6px 0 4px}.environment-item p,.environment-item ul{margin:.35rem 0;color:#3d455d}.environment-item ul{padding-left:1.15rem}.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px}.case-table,table{border-collapse:collapse;width:100%;min-width:900px}.case-table th,.case-table td,table.facts th,table.facts td{border-bottom:1px solid var(--line);padding:14px 13px;text-align:left;vertical-align:top}.case-table th,table.facts th{background:#f8f9fc;color:#687187;font-size:.75rem;font-weight:800;letter-spacing:.03em;white-space:nowrap}.case-table tbody tr:last-child td,table.facts tbody tr:last-child td{border-bottom:0}.case-table tbody tr:hover{background:#fafaff}.case-table td:nth-child(1){width:9rem;white-space:nowrap;font-weight:700}.case-table td:nth-child(2){width:10rem}.case-table td:nth-child(4){width:8rem}.case-table td:nth-child(5){min-width:20rem}.case-table td:last-child{width:6rem}.view-button,button{font:inherit;border:1px solid var(--accent);background:#fff;color:var(--accent);border-radius:8px;padding:6px 12px;font-weight:700;cursor:pointer}.view-button:hover,button:hover{background:var(--accent-soft)}button:disabled{opacity:.42;cursor:not-allowed}.pagination{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:15px;color:var(--muted);font-size:.84rem}.status{display:inline-block;font-weight:750;border-radius:999px;padding:3px 10px;white-space:nowrap}.passed{color:var(--pass);background:var(--pass-soft)}.failed{color:var(--fail);background:var(--fail-soft)}.undetermined{color:var(--unknown);background:var(--unknown-soft)}.not_executed{color:var(--skip);background:var(--skip-soft)}dialog{width:min(920px,calc(100vw - 32px));max-height:calc(100vh - 32px);border:0;border-radius:16px;padding:0;color:var(--ink);box-shadow:0 28px 80px rgba(25,28,45,.3)}dialog::backdrop{background:rgba(23,27,43,.58);backdrop-filter:blur(2px)}.dialog-head{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:16px;align-items:center;background:#fff;border-bottom:1px solid var(--line);padding:18px 24px}.dialog-head h2{font-size:1.15rem}.dialog-body{padding:24px;overflow:auto;background:#fafbfe}.case-meta{display:grid;grid-template-columns:8rem minmax(0,1fr);gap:0;background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:0}.case-meta dt,.case-meta dd{padding:11px 14px;border-bottom:1px solid var(--line)}.case-meta dt{font-weight:750;color:var(--muted);background:#fafbfe}.case-meta dd{margin:0;overflow-wrap:anywhere}.case-meta dt:last-of-type,.case-meta dd:last-of-type{border-bottom:0}.detail-flow{display:flex;flex-direction:column;gap:14px;margin-top:16px}.detail-section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px;margin:0}.detail-section>h3{padding-bottom:12px;border-bottom:1px solid var(--line)}.step{position:relative;border:1px solid var(--line);border-radius:10px;padding:18px;margin:14px 0;background:#fcfcfe}.step-number{display:inline-block;margin-bottom:4px;color:var(--accent);font-size:.73rem;font-weight:800;letter-spacing:.04em}.expectation-list{padding-left:1.25rem}.expectation-list>li+li{border-top:1px dashed var(--line);padding-top:14px;margin-top:14px}.expectation-text{font-weight:700}.expectation-list dl,.evidence-facts{display:grid;grid-template-columns:7rem minmax(0,1fr);gap:7px 12px}.expectation-list dt,.evidence-facts dt{font-weight:700;color:var(--muted)}.expectation-list dd,.evidence-facts dd{margin:0;overflow-wrap:anywhere}.evidence{list-style:none;padding:0}.evidence figure{margin:14px 0}.evidence-gap{color:var(--unknown);background:var(--unknown-soft);border-radius:8px;padding:9px 11px}img{display:block;width:100%;max-width:100%;height:auto;border:1px solid var(--line);border-radius:9px;background:#fff}.cleanup-panel{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:18px}.semantic-panel{border:1px solid var(--line);border-radius:12px;padding:20px;min-width:0}.facts{min-width:680px}.semantic-panel .table-wrap{margin-top:10px}.timeline{margin:0;padding-left:1.25rem}.timeline li{padding:.25rem 0 .75rem}.timeline time{color:var(--muted);font-size:.8rem}.timeline p{margin:.2rem 0}.outcome{display:inline-block;color:var(--accent);font-size:.8rem;font-weight:700}.conclusion-layout{display:flex;flex-direction:column;gap:14px}.conclusion-block{border:1px solid var(--line);border-radius:12px;padding:20px}.conclusion-block>h3{padding-bottom:11px;border-bottom:1px solid var(--line)}.conclusion-block ul{padding-left:1.2rem}.long-id{word-break:break-all}@media(max-width:1100px){.metric-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.metric:nth-child(5){border-left:0}.metric:nth-child(n+5){border-top:1px solid var(--line)}.cleanup-panel{grid-template-columns:1fr}}@media(max-width:760px){main{padding:18px 12px 40px}.report-hero,.report-section{padding:22px 18px;border-radius:12px}.hero-meta{grid-template-columns:1fr}.hero-meta>div+div{border-left:0}.hero-meta>div{border-top:1px solid var(--line);padding:12px 0}.metric-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:nth-child(odd){border-left:0}.metric:nth-child(n+3){border-top:1px solid var(--line)}.environment-grid{grid-template-columns:1fr}.environment-item:nth-child(n){border-left:0}.environment-item:nth-child(n+2){border-top:1px solid var(--line)}.dialog-head{align-items:flex-start;padding:15px 17px}.dialog-body{padding:12px}.case-meta{grid-template-columns:1fr}.case-meta dt,.case-meta dd{border-bottom:0}.case-meta dd{border-bottom:1px solid var(--line)}.detail-section{padding:16px}.expectation-list dl,.evidence-facts{grid-template-columns:1fr}.pagination{justify-content:center}}
table:not(.case-table) th,table:not(.case-table) td{border-bottom:1px solid var(--line);padding:12px;text-align:left;vertical-align:top}table:not(.case-table) th{background:#f8f9fc;color:#687187;font-size:.75rem;font-weight:800;white-space:nowrap}table:not(.case-table) tbody tr:last-child td{border-bottom:0}
.quality-report{background:#f5f6fb;color:#1f2638}.quality-report .report-topbar{height:64px;background:#fff;border-bottom:1px solid #e7eaf1}.report-topbar-inner{height:100%;max-width:1320px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 8px}.report-brand{display:flex;align-items:center;gap:12px;font-weight:800;color:#282e41}.brand-mark{display:grid;place-items:center;width:32px;height:32px;border-radius:9px;background:#6558e8;color:#fff;font-size:1.2rem;line-height:1}.brand-divider{color:#c0c5d2}.brand-context,.topbar-run{color:#8a93a9;font-size:.82rem;font-weight:650}.topbar-run{overflow-wrap:anywhere;text-align:right}.quality-report main{max-width:1320px;padding:44px 0 72px}.quality-report h1{font-size:clamp(2rem,3vw,2.75rem);letter-spacing:-.035em;margin:.5rem 0 .75rem}.quality-report .report-hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,.32fr);align-items:center;gap:48px;background:transparent;border:0;border-radius:0;padding:14px 0 34px;margin:0;overflow:visible}.quality-report .report-hero::before{display:none}.quality-report .eyebrow{color:#6558e8;font-size:.7rem;letter-spacing:.22em}.hero-description{max-width:760px;color:#7f889e}.quality-report .hero-meta{display:flex;flex-wrap:wrap;gap:8px 26px;margin-top:18px;border:0}.quality-report .hero-meta>div,.quality-report .hero-meta>div+div{display:flex;gap:7px;padding:0;border:0}.quality-report .hero-meta span,.quality-report .hero-meta strong{display:inline;margin:0;font-size:.78rem}.quality-report .hero-meta span{color:#969eb1}.quality-report .hero-meta strong{color:#596176}.hero-verdict{text-align:right}.hero-verdict strong{display:flex;justify-content:flex-end;align-items:center;gap:9px;font-size:1rem}.verdict-dot{width:10px;height:10px;border-radius:50%;background:currentColor}.hero-verdict p{margin:.45rem 0 0;color:#8a93a9;font-size:.78rem}.hero-verdict.passed{color:#11845c;background:transparent}.hero-verdict.failed{color:#d94b61;background:transparent}.hero-verdict.undetermined{color:#b57914;background:transparent}.hero-verdict.not-executed,.hero-verdict.pending{color:#6f7890;background:transparent}.quality-report .report-section{border:1px solid #e6e9f0;border-radius:14px;padding:30px 32px;margin:0 0 24px;box-shadow:0 1px 2px rgba(36,42,64,.025)}.quality-report .section-heading{display:flex;align-items:baseline;gap:10px;margin-bottom:26px}.quality-report .section-index{display:inline;width:auto;height:auto;background:transparent;border-radius:0;color:#9ca5ba;font-size:.72rem;letter-spacing:.08em}.quality-report .section-heading h2{font-size:1.18rem}.quality-report .section-heading p{margin:0 0 0 auto;font-size:.78rem}.quality-report .metric-strip{border:0;border-radius:0;overflow:visible}.quality-report .metric{min-height:78px;padding:3px 20px}.quality-report .metric:first-child{padding-left:4px}.quality-report .metric::before{display:none}.quality-report .metric span{font-size:.74rem}.quality-report .metric strong{font-size:1.72rem}.quality-report .metric-passed strong{color:#12845d}.quality-report .metric-failed strong{color:#dc4f63}.quality-report .metric-undetermined strong{color:#b77b18}.quality-report .metric-not-executed strong{color:#8992a5}.summary-footer{margin:24px -32px -30px;padding:13px 32px;background:#fafbfe;border-top:1px solid #e8ebf2;border-radius:0 0 14px 14px}.summary-footer .overview-note{margin:0;font-size:.78rem}.quality-report .environment-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:28px 52px;border:0;border-radius:0;overflow:visible}.quality-report .environment-item{min-height:0;padding:0}.quality-report .environment-item:nth-child(n){border:0}.quality-report .environment-item>span{font-size:.72rem}.quality-report .environment-item h3{font-size:.93rem;margin:8px 0 4px}.quality-report .environment-item p,.quality-report .environment-item ul{font-size:.84rem;color:#465067}.quality-report .table-wrap{border-color:#e8eaf0;border-radius:10px}.quality-report .case-table th{background:#fafbfe;color:#8992a6;font-size:.7rem}.quality-report .case-table td{padding:15px 13px;color:#3c455c;font-size:.82rem}.quality-report .case-table td:nth-child(3){font-weight:700;color:#2b3247}.quality-report .case-table tbody tr:hover{background:#fafafe}.quality-report .status{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;font-size:.75rem}.status-dot{width:6px;height:6px;border-radius:50%;background:currentColor}.quality-report .view-button{border:0;background:#f0edff;color:#6558e8;padding:6px 12px}.quality-report .view-button:hover{background:#e5e0ff}.quality-report .pagination button{border-color:#e0dffd;background:#fff;color:#6558e8;font-size:.77rem}.quality-report dialog{width:min(900px,calc(100vw - 32px));border-radius:14px}.quality-report .dialog-head{padding:17px 22px}.quality-report .dialog-head button{border:0;background:#f0edff;color:#6558e8}.quality-report .dialog-body{padding:24px 28px;background:#fff}.quality-report .case-meta{grid-template-columns:7.5rem minmax(0,1fr);border:0;border-radius:0;border-top:1px solid #e8ebf2}.quality-report .case-meta dt,.quality-report .case-meta dd{padding:9px 10px;border-bottom:1px solid #e8ebf2}.quality-report .case-meta dt{background:#fafbfe;font-size:.76rem}.quality-report .case-meta dd{font-size:.82rem}.quality-report .detail-flow{gap:0;margin-top:24px}.quality-report .detail-section{border:0;border-bottom:1px solid #e8ebf2;border-radius:0;padding:22px 0}.quality-report .detail-section:last-child{border-bottom:0}.quality-report .detail-section>h3{border:0;padding:0;margin-bottom:16px}.quality-report .step{border:0;border-left:3px solid #ded9ff;border-radius:0;padding:4px 0 4px 18px;background:transparent}.quality-report .expectation-list{margin-bottom:0}.quality-report img{border-radius:8px}.quality-report .cleanup-panel{gap:32px}.quality-report .semantic-panel{border:0;border-radius:9px;background:#fafbfe;padding:20px}.quality-report .conclusion-layout{gap:16px}.conclusion-summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.quality-report .conclusion-block{border:0;border-radius:9px;background:#fafbfe;padding:20px}.quality-report .conclusion-block>h3{border:0;padding:0}.report-disclosure{border:1px solid #e7eaf1;border-radius:9px;background:#fff}.report-disclosure summary{position:relative;padding:15px 46px 15px 18px;cursor:pointer;font-size:.88rem;font-weight:750;list-style:none}.report-disclosure summary::-webkit-details-marker{display:none}.report-disclosure summary::after{content:"＋";position:absolute;right:17px;top:50%;transform:translateY(-50%);color:#6558e8;font-size:1.05rem}.report-disclosure[open] summary::after{content:"−"}.disclosure-content{padding:4px 18px 18px;border-top:1px solid #eceef3}.disclosure-content>.table-wrap,.disclosure-content>.timeline{margin-top:14px}.quality-report .waiting{margin:18px 0 0}.quality-report table:not(.case-table) th{background:#fafbfe}.quality-report .timeline{list-style:none;padding:0}.quality-report .timeline li{position:relative;padding:0 0 16px 20px;border-left:1px solid #dfe3ec}.quality-report .timeline li::before{content:"";position:absolute;left:-4px;top:7px;width:7px;height:7px;border-radius:50%;background:#8a7cf0}.quality-report .timeline li:last-child{border-left-color:transparent}.quality-report .timeline time{display:block;margin-bottom:2px}@media(max-width:1380px){.report-topbar-inner,.quality-report main{margin-left:32px;margin-right:32px}}@media(max-width:900px){.quality-report .report-hero{grid-template-columns:1fr;gap:20px}.hero-verdict{text-align:left}.hero-verdict strong{justify-content:flex-start}.quality-report .metric-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.quality-report .metric:nth-child(5){border-left:0}.quality-report .environment-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.conclusion-summary-grid{grid-template-columns:1fr}}@media(max-width:620px){.report-topbar-inner,.quality-report main{margin-left:16px;margin-right:16px}.topbar-run{display:none}.quality-report main{padding-top:28px}.quality-report .report-hero{padding-top:4px}.quality-report .report-section{padding:24px 18px}.quality-report .section-heading{align-items:flex-start;flex-wrap:wrap}.quality-report .section-heading p{width:100%;margin-left:0;padding-left:28px}.quality-report .metric-strip{grid-template-columns:repeat(2,minmax(0,1fr))}.quality-report .metric{padding:12px}.quality-report .metric:nth-child(odd){border-left:0}.quality-report .environment-grid{grid-template-columns:1fr;gap:24px}.summary-footer{margin:18px -18px -24px;padding:13px 18px}.quality-report .cleanup-panel{grid-template-columns:1fr}.quality-report .dialog-body{padding:16px}.quality-report .case-meta{grid-template-columns:1fr}.quality-report .case-meta dt{padding-bottom:2px;border-bottom:0}.quality-report .case-meta dd{padding-top:2px}.report-disclosure summary{padding-left:14px}}
.quality-report .environment-item ul{list-style:none;padding:0}.quality-report .environment-item li+li{margin-top:3px}
.quality-report .dialog-head button{flex:0 0 auto;white-space:nowrap}
/* Detail polish: reinforce hierarchy without changing report facts or structure. */
.quality-report a,.quality-report button,.quality-report summary{transition:background-color .16s ease,border-color .16s ease,color .16s ease,box-shadow .16s ease}
.quality-report a:focus-visible,.quality-report button:focus-visible,.quality-report summary:focus-visible{outline:3px solid rgba(101,88,232,.28);outline-offset:3px;border-radius:7px}
.quality-report .report-topbar{box-shadow:0 1px 0 rgba(31,38,56,.025)}
.quality-report .report-hero{padding-bottom:38px}
.quality-report .hero-description{font-size:.96rem;line-height:1.7}
.quality-report .hero-verdict{padding-left:28px;border-left:1px solid #e3e6ee}
.quality-report .hero-verdict p{line-height:1.55}
.quality-report .metric-strip{grid-template-columns:repeat(7,minmax(0,1fr)) minmax(152px,1.16fr)}
.quality-report .metric{display:flex;min-width:0;flex-direction:column;justify-content:center}
.quality-report .metric strong{letter-spacing:-.025em}
.quality-report .metric-duration strong{font-size:1.48rem;line-height:1.28;white-space:nowrap}
.quality-report .environment-item{position:relative}
.quality-report .environment-item::before{content:"";position:absolute;left:-26px;top:4px;width:1px;height:calc(100% - 8px);background:#eceef4}
.quality-report .environment-item:nth-child(3n+1)::before{display:none}
.quality-report .environment-item>span{text-transform:uppercase;letter-spacing:.075em}
.quality-report .environment-value{margin-top:9px;color:#343d54;font-size:.86rem;font-weight:560;line-height:1.65;overflow-wrap:anywhere}
.quality-report .environment-value p,.quality-report .environment-value ul{margin:0}
.quality-report .environment-value a{font-weight:680}
.quality-report .environment-note{margin-top:3px!important;color:#8a93a7;font-size:.76rem;font-weight:500}
.quality-report .case-table tbody tr:nth-child(even){background:#fdfdff}
.quality-report .case-table tbody tr:hover{background:#f7f6ff}
.quality-report .case-table td{line-height:1.62}
.quality-report .view-button{min-width:54px;box-shadow:inset 0 0 0 1px rgba(101,88,232,.02)}
.quality-report .view-button:hover{box-shadow:0 4px 12px rgba(101,88,232,.12);transform:translateY(-1px)}
.quality-report .pagination button:not(:disabled):hover{border-color:#bcb5fa;box-shadow:0 3px 10px rgba(101,88,232,.08)}
.quality-report .cleanup-panel{gap:16px;align-items:stretch}
.quality-report .cleanup-block{min-width:0;padding:20px 22px;border:1px solid #e9ebf2;border-radius:10px;background:#fbfcff}
.quality-report .cleanup-result{background:#fff}
.quality-report .cleanup-heading{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.quality-report .cleanup-heading h3{margin:0}
.quality-report .cleanup-icon{display:grid;place-items:center;flex:0 0 auto;width:28px;height:28px;border-radius:50%;background:#efedff;color:#6558e8;font-size:.83rem;font-weight:850}
.quality-report .cleanup-status{display:inline-flex;align-items:center;gap:8px;margin:0 0 14px;padding:6px 10px;border-radius:999px;background:#f3f2ff;color:#5448c8;font-size:.8rem}
.quality-report .cleanup-status .status-dot{background:currentColor}
.quality-report .cleanup-block>.timeline{margin-top:2px}
.quality-report .conclusion-block{position:relative;overflow:hidden;padding:22px 22px 20px;border:1px solid transparent}
.quality-report .failure-summary{border-color:#f2dfe3;background:#fff7f8}
.quality-report .unknown-summary{border-color:#efe4c9;background:#fffbf1}
.quality-report .failure-summary::before,.quality-report .unknown-summary::before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#db5368}
.quality-report .unknown-summary::before{background:#c28927}
.quality-report .failure-summary h3{color:#b83e52}
.quality-report .unknown-summary h3{color:#946312}
.quality-report .summary-kicker{margin:0 0 5px;color:#8a93a7;font-size:.66rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.quality-report .conclusion-block>h3{margin-bottom:10px}
.quality-report .conclusion-block>p:last-child,.quality-report .conclusion-block ul{margin-bottom:0}
.quality-report .report-disclosure{overflow:hidden}
.quality-report .report-disclosure summary{display:flex;align-items:center;gap:13px;min-height:62px;padding:11px 48px 11px 14px}
.quality-report .report-disclosure summary:hover{background:#fafaff}
.quality-report .disclosure-index{display:grid;place-items:center;flex:0 0 auto;width:30px;height:30px;border-radius:8px;background:#f2f1ff;color:#6558e8;font-size:.66rem;font-weight:850;letter-spacing:.04em}
.quality-report .disclosure-label{display:flex;min-width:0;flex-direction:column;gap:1px}
.quality-report .disclosure-label strong{color:#31384d;font-size:.86rem}
.quality-report .disclosure-label small{color:#8a93a7;font-size:.72rem;font-weight:500}
.quality-report .report-disclosure[open] summary{background:#fafaff}
.quality-report .disclosure-content{padding:16px 20px 20px}
.quality-report dialog{width:min(880px,calc(100vw - 32px))}
.quality-report .dialog-head h2{max-width:calc(100% - 78px);font-size:1.08rem;line-height:1.45;overflow-wrap:anywhere}
.quality-report .dialog-head button:hover{background:#e6e2ff}
.quality-report .case-meta dt{letter-spacing:.035em}
.quality-report .detail-section>h3{font-size:1rem}
.quality-report figure figcaption{margin-top:8px;color:#747e94;font-size:.78rem;line-height:1.55}
@media(max-width:1100px){.quality-report .metric-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.quality-report .metric-duration strong{white-space:normal}.quality-report .environment-item:nth-child(3n+1)::before{display:block}.quality-report .environment-item:nth-child(2n+1)::before{display:none}}
@media(max-width:900px){.quality-report .hero-verdict{padding:18px 0 0;border-top:1px solid #e3e6ee;border-left:0}.quality-report .environment-item:nth-child(3n+1)::before{display:block}.quality-report .environment-item:nth-child(2n+1)::before{display:none}}
@media(max-width:620px){.quality-report .report-topbar{height:56px}.quality-report .report-topbar-inner{margin-left:16px;margin-right:16px}.quality-report .brand-mark{width:29px;height:29px;border-radius:8px;font-size:1rem}.quality-report .report-brand{gap:9px}.quality-report main{padding-top:20px;padding-bottom:44px}.quality-report .report-hero{gap:16px;padding:0 0 26px}.quality-report h1{font-size:clamp(1.72rem,7.4vw,2.05rem);line-height:1.22;letter-spacing:-.035em;margin:.42rem 0 .6rem}.quality-report .eyebrow{font-size:.63rem;letter-spacing:.18em}.quality-report .hero-description{font-size:.88rem;line-height:1.62}.quality-report .hero-meta{gap:6px 16px;margin-top:14px}.quality-report .hero-meta>div,.quality-report .hero-meta>div+div{gap:5px}.quality-report .hero-verdict{padding-top:15px}.quality-report .report-section{padding:22px 18px;margin-bottom:16px}.quality-report .section-heading{margin-bottom:20px;gap:9px}.quality-report .section-heading p{padding-left:0;font-size:.74rem}.quality-report .metric{min-height:88px;padding:11px 10px}.quality-report .metric strong{font-size:1.5rem}.quality-report .metric-duration strong{font-size:1.28rem}.quality-report .environment-grid{gap:0}.quality-report .environment-item{padding:17px 0}.quality-report .environment-item:first-child{padding-top:0}.quality-report .environment-item:last-child{padding-bottom:0}.quality-report .environment-item::before{display:none!important}.quality-report .environment-item+.environment-item{border-top:1px solid #eceef4}.quality-report .environment-value{margin-top:6px}.quality-report .cleanup-block{padding:18px}.quality-report .conclusion-block{padding:19px 18px}.quality-report .report-disclosure summary{min-height:58px;padding-left:11px}.quality-report .disclosure-label small{white-space:normal}.quality-report .dialog-head{align-items:center;padding:13px 15px}.quality-report .dialog-head h2{font-size:.95rem}.quality-report .dialog-body{padding:14px}.quality-report .case-meta{grid-template-columns:6.25rem minmax(0,1fr)}.quality-report .case-meta dt,.quality-report .case-meta dd{padding:8px 9px;border-bottom:1px solid #e8ebf2}.quality-report .case-meta dt{background:#fafbfe}.quality-report .detail-section{padding:18px 0}}
@media(max-width:420px){.quality-report .case-meta{grid-template-columns:1fr}.quality-report .case-meta dt{padding-bottom:2px;border-bottom:0}.quality-report .case-meta dd{padding-top:2px}.quality-report .dialog-head h2{font-size:.9rem}.quality-report .disclosure-label small{display:none}}
.quality-report .dialog-head button{color:#5548cc}
.quality-report .case-meta dt{color:#626b80}
@media(max-width:620px){.quality-report .metric-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
/* A 阅读版：内容优先、单栏详情与可追溯的结果筛选。 */
.quality-report{--accent:#365fba;--accent-soft:#eef3fc;background:#f4f6f9;color:#25334a}.quality-report .brand-mark{background:#253c60}.quality-report .eyebrow,.quality-report .view-button,.quality-report .pagination button,.quality-report .disclosure-index{color:var(--accent)}.quality-report .view-button,.quality-report .disclosure-index{background:var(--accent-soft)}
.quality-report .duration-parts{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 9px;margin-top:7px;font-variant-numeric:tabular-nums}.quality-report .duration-parts span{display:inline-flex;align-items:baseline;white-space:nowrap}.quality-report .duration-parts strong{display:inline;margin:0;font-size:1.42rem}.quality-report .duration-parts small{margin-left:3px;color:var(--muted);font-size:.68rem;font-weight:650}
.quality-report .active-filter{display:flex;min-height:34px;align-items:center;justify-content:space-between;gap:12px;margin:-8px 0 12px;color:var(--accent);font-size:.8rem}.quality-report .active-filter button{padding:4px 9px;border-color:#cad7ef;font-size:.75rem}.quality-report .active-filter:has([data-active-filter][hidden]){min-height:0;margin:0}
.quality-report .detail-outcome{padding:16px 18px;border:1px solid var(--line);border-left:3px solid var(--accent);border-radius:8px;background:#f8faff}.quality-report .detail-outcome.failed{border-color:#f0d9de;border-left-color:var(--fail);background:#fff7f8}.quality-report .detail-outcome.undetermined{border-color:#eadfbd;border-left-color:var(--unknown);background:#fffaf0}.quality-report .detail-outcome.passed{border-color:#d7e9df;border-left-color:var(--pass);background:#f4faf6}.quality-report .detail-outcome.not_executed{border-left-color:var(--skip)}.quality-report .detail-outcome p{margin:.55rem 0 0;color:#4b566d}.quality-report .outcome-heading{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.quality-report .outcome-heading strong{font-size:.94rem}
.quality-report .detail-context{display:flex;flex-wrap:wrap;gap:7px;margin:13px 0}.quality-report .context-chips{display:flex;width:100%;flex-direction:column;gap:7px}.quality-report .permission-context{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid #e4e8ef;border-radius:7px;background:#fbfcfe}.quality-report .context-chip{display:inline-flex;max-width:100%;align-items:center;padding:4px 9px;border:1px solid #dfe4ed;border-radius:5px;background:#f8f9fb;color:#536078;font-size:.74rem;overflow-wrap:anywhere}.quality-report .role-chip{font-weight:700}.quality-report .permission-chip{border-color:#d6e1f3;background:#f3f7fd;color:#355a9f}.quality-report .account-chip{border-color:#dce9e2;background:#f2f8f5;color:#28684f}.quality-report .verification-chip{border-color:#e6dfc8;background:#fffbef;color:#795d22}.quality-report .muted-chip,.quality-report .neutral-chip{color:#657087}
.quality-report .full-id{margin:0 0 20px;border-bottom:1px solid var(--line);padding:0 0 14px}.quality-report .full-id summary{cursor:pointer;color:var(--muted);font-size:.76rem}.quality-report .full-id p{margin:9px 0 0;padding:10px;border-radius:5px;background:#f6f8fb;font-size:.78rem;overflow-wrap:anywhere}
.quality-report .supplementary-details{overflow:hidden;border:1px solid var(--line);border-radius:8px;background:#fff}.quality-report .supplementary-details summary{position:relative;padding:12px 42px 12px 15px;cursor:pointer;color:#59657b;font-size:.8rem;font-weight:700;list-style:none}.quality-report .supplementary-details summary::-webkit-details-marker{display:none}.quality-report .supplementary-details summary::after{content:"＋";position:absolute;right:15px;top:50%;transform:translateY(-50%);color:var(--accent)}.quality-report .supplementary-details[open] summary::after{content:"−"}.quality-report .supplementary-details[open] summary{border-bottom:1px solid var(--line);background:#fafbfd}.quality-report .supplementary-content{padding:14px 16px;font-size:.82rem}.quality-report .supplementary-content>:first-child{margin-top:0}.quality-report .supplementary-content>:last-child{margin-bottom:0}
.quality-report .step-list{margin:0;padding:0;list-style:none}.quality-report .step-item{display:grid;grid-template-columns:28px minmax(0,1fr);gap:11px;padding:3px 0 20px}.quality-report .step-item:last-child{padding-bottom:0}.quality-report .step-number{display:grid;place-items:center;width:26px;height:26px;margin:0;border-radius:50%;background:#edf2fa;color:#466794;font-size:.72rem}.quality-report .step-content>h4{margin:1px 0 12px;font-size:.9rem}.quality-report .step-source,.quality-report .oracle-id{margin:0 0 2px;color:var(--muted);font-size:.69rem}.quality-report .expectation{margin:0 0 16px;padding:15px;border:1px solid var(--line);border-radius:8px;background:#fff}.quality-report .comparison{overflow:hidden;border:1px solid var(--line);border-radius:7px}.quality-report .comparison-row{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:12px;padding:11px 13px}.quality-report .comparison-row+.comparison-row{border-top:1px solid var(--line);background:#fafbfd}.quality-report .comparison-row>span{color:var(--muted);font-size:.72rem}.quality-report .comparison-row p,.quality-report .comparison-row ul{margin:0}.quality-report .checkpoint-meta{display:grid;grid-template-columns:6rem minmax(0,1fr);gap:6px 12px;margin:13px 0 0;font-size:.8rem}.quality-report .checkpoint-meta dt{color:var(--muted);font-weight:650}.quality-report .checkpoint-meta dd{margin:0;overflow-wrap:anywhere}
.quality-report .image-preview-button{display:block;width:100%;padding:0;overflow:hidden;border:0;border-radius:8px;background:#eef2f8}.quality-report .image-preview-button:hover{background:#e5ebf4}.quality-report .image-preview-button img{border:0;border-radius:0}.quality-report .evidence figcaption{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.quality-report .evidence figcaption span{color:var(--accent)}.quality-report .image-dialog{width:min(1280px,calc(100vw - 28px));max-height:94vh}.quality-report .image-dialog-body{max-height:calc(94vh - 62px);overflow:auto;background:#eef1f6}.quality-report .image-dialog-body img{width:auto;min-width:100%;max-width:none;border:0;border-radius:0}
.quality-report .action-groups{display:flex;flex-direction:column;gap:10px}.quality-report .action-groups>[data-action-group]{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px;padding:17px 19px;border:1px solid var(--line);border-radius:9px;background:#fafbfd}.quality-report .action-groups>[data-action-group] h3,.quality-report .action-groups>[data-action-group] p{margin:0}.quality-report .action-groups>[data-action-group] h3{font-size:.92rem}.quality-report .action-groups>[data-action-group] p:not(.summary-kicker){margin-top:3px;color:var(--muted);font-size:.78rem}.quality-report .action-groups>[data-action-group] button{white-space:nowrap;padding:6px 10px;border-color:#cbd8ef;font-size:.76rem}.quality-report .action-groups>.failure-summary{border-left:3px solid var(--fail)}.quality-report .action-groups>.unknown-summary{border-left:3px solid var(--unknown)}.quality-report .action-not_executed{border-left:3px solid var(--skip)}
.quality-report .permission-table{width:100%;min-width:760px;table-layout:fixed}.quality-report .permission-table th:nth-child(2),.quality-report .permission-table td:nth-child(2){width:17%}.quality-report .permission-table th:nth-child(6),.quality-report .permission-table td:nth-child(6){width:24%}.quality-report .permission-case-ids{max-width:18rem;overflow-wrap:anywhere;word-break:break-word}.quality-report .permission-case-ids span{display:block}.quality-report .permission-case-ids span+span{margin-top:6px}
@media(max-width:760px){.quality-report .duration-parts{gap:2px 7px}.quality-report .action-groups>[data-action-group]{grid-template-columns:1fr}.quality-report .action-groups>[data-action-group] button{justify-self:start}.quality-report .comparison-row,.quality-report .checkpoint-meta{grid-template-columns:1fr}.quality-report .image-dialog-body img{min-width:0;width:100%;max-width:100%}}
</style></head><body class="quality-report"><div class="report-topbar"><div class="report-topbar-inner"><div class="report-brand"><span class="brand-mark" aria-hidden="true">✓</span><span>质量报告</span><span class="brand-divider">/</span><span class="brand-context">E2E</span></div><div class="topbar-run">RUN · ${escapeHtml(model.run.run_id)}</div></div></div><main>
<header class="report-hero" data-report-section="title"><div class="hero-copy"><p class="eyebrow">END-TO-END TEST REPORT</p><h1>${escapeHtml(model.suite.name)}</h1><p class="hero-description">汇总本轮端到端测试的执行结果、关键证据与结论边界。</p><div class="hero-meta"><div><span>当前阶段</span><strong>${escapeHtml(model.run.status_label)}</strong></div><div><span>记录截止</span><strong>${escapeHtml(model.run.boundary_at_label)}</strong></div></div>${waiting}</div><aside class="hero-verdict ${escapeHtml(verdict.tone)}" aria-label="验收结论"><strong><span class="verdict-dot" aria-hidden="true"></span>${escapeHtml(verdict.label)}</strong><p>${escapeHtml(verdict.summary)}</p></aside></header>
<section class="report-section" data-report-section="overview"><div class="section-heading"><span class="section-index">01</span><div><h2>测试概览</h2></div><p>全量用例统计 · 不随筛选变化</p></div><div class="metric-strip">${overview}</div><div class="summary-footer"><p class="overview-note">统计口径：通过率 = 通过数量 ÷ 用例总数；失败率 = 失败数量 ÷ 用例总数。全局暂停等待时长：${escapeHtml(model.overview.waiting_duration)}；执行耗时扣除已记录的全局用户等待区段。</p></div></section>
<section class="report-section" data-report-section="environment"><div class="section-heading"><span class="section-index">02</span><h2>测试环境</h2><p>本次测试的执行上下文</p></div><div class="environment-grid"><div class="environment-item"><span>PRD 链接</span><div class="environment-value">${prd}</div></div><div class="environment-item"><span>测试地址链接</span><div class="environment-value">${targets}</div></div><div class="environment-item"><span>测试账号</span><div class="environment-value">${accounts}</div></div><div class="environment-item"><span>执行时间</span><div class="environment-value"><p>${escapeHtml(model.run.started_at_display_label)} — ${escapeHtml(model.run.completed_at_display_label)}</p><p class="environment-note">时区：${escapeHtml(model.report_context.display_timezone)}</p></div></div><div class="environment-item"><span>代理方式</span><div class="environment-value"><p>${escapeHtml(model.report_context.proxy_method)}</p></div></div><div class="environment-item"><span>环境说明</span><div class="environment-value"><p>${escapeHtml(model.report_context.environment_description)}</p></div></div></div></section>
<section class="report-section" data-report-section="coverage" data-page-size="${V2_PAGE_SIZE}"><div class="section-heading"><span class="section-index">03</span><h2>需求覆盖与验收</h2><p>逐条查看测试情况 · 每页最多 20 条</p></div><div class="active-filter" role="status"><span data-active-filter hidden></span><button type="button" data-clear-filter hidden>显示全部用例</button></div><div class="table-wrap"><table class="case-table"><thead><tr><th>测试用例 ID</th><th>模块</th><th>测试场景</th><th>测试结果</th><th>成功/失败的原因</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div><nav class="pagination" aria-label="用例分页"><button type="button" data-page-previous>上一页</button><span data-page-indicator aria-live="polite">第 1 / ${pageCount} 页 · 共 ${model.rows.length} 条</span><button type="button" data-page-next${pageCount === 1 ? " disabled" : ""}>下一页</button></nav>${templates}<dialog id="case-dialog" aria-labelledby="case-dialog-title"><div class="dialog-head"><h2 id="case-dialog-title" data-dialog-title>用例详情</h2><button type="button" data-dialog-close aria-label="关闭用例详情">关闭</button></div><div class="dialog-body" data-dialog-content></div></dialog><dialog id="image-dialog" class="image-dialog" aria-labelledby="image-dialog-title"><div class="dialog-head"><h2 id="image-dialog-title" data-image-title>关键证据截图</h2><button type="button" data-image-close aria-label="关闭放大截图">关闭</button></div><div class="image-dialog-body"><img data-enlarged-image alt=""></div></dialog></section>
<section class="report-section" data-report-section="data-cleanup"><div class="section-heading"><span class="section-index">04</span><h2>测试数据与清理</h2><p>本 Run 的数据事实与资源收尾</p></div><div class="cleanup-panel"><article class="cleanup-block data-facts"><div class="cleanup-heading"><span class="cleanup-icon" aria-hidden="true">⌁</span><h3>已记录的测试数据事实</h3></div>${timeline(sampleFacts)}</article><article class="cleanup-block cleanup-result"><div class="cleanup-heading"><span class="cleanup-icon" aria-hidden="true">✓</span><h3>实际清理结果</h3></div><p class="cleanup-status"><span class="status-dot" aria-hidden="true"></span><strong>${escapeHtml(model.cleanup_summary.status)}</strong></p>${semanticFactTable(model.cleanup_summary.items, model.cleanup_summary.status === "无需清理" ? "本轮没有需要清理的代理资源。" : "未记录具体清理事项。")}</article></div></section>
<section class="report-section" data-report-section="conclusion"><div class="section-heading"><span class="section-index">05</span><h2>结论边界和后续行动</h2><p>按已知结果类别归组，不推断共同根因</p></div><div class="conclusion-layout"><div class="action-groups">${actionGroups}</div><details class="report-disclosure"><summary><span class="disclosure-index" aria-hidden="true">01</span><span class="disclosure-label"><strong>权限准备状态</strong><small>查看角色、账号与核验范围</small></span></summary><div class="disclosure-content">${v2PermissionSection(model.permission)}</div></details><details class="report-disclosure"><summary><span class="disclosure-index" aria-hidden="true">02</span><span class="disclosure-label"><strong>关键执行记录</strong><small>查看本轮执行过程与阶段事实</small></span></summary><div class="disclosure-content">${timeline(model.timeline)}</div></details><details class="report-disclosure"><summary><span class="disclosure-index" aria-hidden="true">03</span><span class="disclosure-label"><strong>代理验证</strong><small>查看影响范围与恢复结论</small></span></summary><div class="disclosure-content">${proxySummary(model)}</div></details><details class="report-disclosure"><summary><span class="disclosure-index" aria-hidden="true">04</span><span class="disclosure-label"><strong>一致性与证据边界</strong><small>查看报告可信范围与证据说明</small></span></summary><div class="disclosure-content">${semanticFactTable(model.consistency.checks)}</div></details></div></section>
</main><script>${V2_REPORT_SCRIPT}</script></body></html>\n`;
}

export function buildHtmlReport(model) {
  return model.run.workflow_profile === "permission-batches-html-v2" ? buildV2HtmlReport(model) : buildLegacyHtmlReport(model);
}
