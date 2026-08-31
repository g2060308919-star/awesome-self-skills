import { escapeHtml } from "./shell.mjs";

export function renderProjectList(projects) {
  const rows = projects.map((project) => `<tr><td><a class="record-link" href="/projects/${encodeURIComponent(project.id)}">${escapeHtml(project.name)}</a><small>${escapeHtml(project.id)}</small></td><td>${escapeHtml(project.customerId)}</td><td>${escapeHtml(project.status)}</td><td>${escapeHtml(project.description)}</td></tr>`).join("");
  return `<section class="content-card"><div class="section-heading"><div><p class="eyebrow">Portfolio</p><h2>Projects</h2></div></div><div class="table-scroll" tabindex="0" aria-label="Scrollable project results"><table><caption>${projects.length} projects</caption><thead><tr><th scope="col">Project</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Description</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No projects</td></tr>'}</tbody></table></div></section>`;
}

export function renderProjectDetail(project, canEdit, feedback = null) {
  const nextStatus = project.status === "Active" ? "Inactive" : "Active";
  const action = nextStatus === "Active" ? "Activate project" : "Deactivate project";
  return `<section class="content-card detail-card">
    ${feedback ? `<p class="notice notice-${feedback.kind}" role="${feedback.kind === "alert" ? "alert" : "status"}">${escapeHtml(feedback.message)}</p>` : ""}
    <div class="section-heading"><div><p class="eyebrow">${escapeHtml(project.id)}</p><h2>${escapeHtml(project.name)}</h2></div><span class="status-pill">${escapeHtml(project.status)}</span></div>
    <dl class="detail-grid"><div><dt>Customer</dt><dd>${escapeHtml(project.customerId)}</dd></div><div><dt>Description</dt><dd>${escapeHtml(project.description)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(project.status)}</dd></div></dl>
    ${canEdit ? `<form method="post" action="/projects/${encodeURIComponent(project.id)}/status"><input type="hidden" name="status" value="${nextStatus}"><button class="primary-button" type="submit">${action}</button></form>` : '<p class="permission-note">You have read-only access. Project status controls are unavailable for this role.</p>'}
  </section>`;
}
