import { escapeHtml } from "./shell.mjs";

export function renderAudit(events) {
  const items = [...events].reverse().map((event) => `<li><span class="timeline-mark" aria-hidden="true"></span><div><strong>${escapeHtml(event.summary)}</strong><small>${escapeHtml(event.time ?? event.createdAt)} · ${escapeHtml(event.actorId ?? "System")}</small></div></li>`).join("");
  return `<section class="content-card"><div class="section-heading"><div><p class="eyebrow">Role-limited view</p><h2>Recent business events</h2></div></div><ol class="timeline">${items || '<li><div><strong>No business events yet</strong><small>Verified activity will appear here.</small></div></li>'}</ol></section>`;
}
