import { escapeHtml } from "./shell.mjs";

export function renderProjectList(projects) {
  const rows = projects.map((project) => `<tr><td><a class="record-link" href="/projects/${encodeURIComponent(project.id)}">${escapeHtml(project.name)}</a><small>${escapeHtml(project.id)}</small></td><td>${escapeHtml(project.customerId)}</td><td>${escapeHtml(project.status)}</td><td>${escapeHtml(project.description)}</td></tr>`).join("");
  return `<section class="content-card"><div class="section-heading"><div><p class="eyebrow">Portfolio</p><h2>Projects</h2></div></div><div class="table-scroll" tabindex="0" aria-label="Scrollable project results"><table><caption>${projects.length} projects</caption><thead><tr><th scope="col">Project</th><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Description</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No projects</td></tr>'}</tbody></table></div></section>`;
}

export function renderProjectDetail(project, canEdit, feedback = null) {
  const nextStatus = project.status === "Active" ? "Inactive" : "Active";
  const action = nextStatus === "Active" ? "Activate project" : "Deactivate project";
  const statusAction = project.status === "Processing"
    ? '<p class="permission-note" role="status">Status change in progress. Refresh to observe completion.</p>'
    : `<form method="post" action="/projects/${encodeURIComponent(project.id)}/status"><input type="hidden" name="status" value="${nextStatus}"><button class="primary-button" type="submit">${action}</button></form>`;
  const exportAction = feedback?.exportSummary
    ? `<details class="more-actions"><summary>More actions</summary><a class="secondary-button" href="/projects/${encodeURIComponent(project.id)}/export">Export summary</a></details>`
    : "";
  const diagnostic = feedback?.diagnostic
    ? `<details class="diagnostic"><summary>Diagnostic details</summary><code>${escapeHtml(feedback.diagnostic)}</code></details>`
    : "";
  return `<section class="content-card detail-card">
    ${feedback?.message ? `<p class="notice notice-${feedback.kind}" role="${feedback.kind === "alert" ? "alert" : "status"}">${escapeHtml(feedback.message)}</p>` : ""}
    <div class="section-heading"><div><p class="eyebrow">${escapeHtml(project.id)}</p><h2>${escapeHtml(project.name)}</h2></div><span class="status-pill">${escapeHtml(project.status)}</span></div>
    <dl class="detail-grid"><div><dt>Customer</dt><dd>${escapeHtml(project.customerId)}</dd></div><div><dt>Description</dt><dd>${escapeHtml(project.description)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(project.status)}</dd></div></dl>
    ${diagnostic}
    ${canEdit ? `<div class="project-actions">${statusAction}${exportAction}</div><form class="record-form project-description-form" method="post" action="/projects/${encodeURIComponent(project.id)}/description"><div class="field"><label for="project-description">Project description</label><textarea id="project-description" name="description" rows="3" required>${escapeHtml(project.description)}</textarea></div><div class="form-actions"><button class="secondary-button" type="submit">Save description</button></div></form>` : `<p class="permission-note">You have read-only access. Project status controls are unavailable for this role.</p>${exportAction}`}
  </section>`;
}

export function renderProjectExport(project) {
  return `<section class="content-card">
    <div class="section-heading"><div><p class="eyebrow">${escapeHtml(project.id)}</p><h2>Export project summary</h2></div><a class="text-link" href="/projects/${encodeURIComponent(project.id)}">Back to project</a></div>
    <div class="tabs" role="tablist" aria-label="Project export formats">
      <button type="button" role="tab" id="export-tab-summary" aria-controls="export-panel-summary" aria-selected="true">Summary</button>
      <button type="button" role="tab" id="export-tab-fields" aria-controls="export-panel-fields" aria-selected="false" tabindex="-1">Included fields</button>
    </div>
    <section id="export-panel-summary" role="tabpanel" aria-labelledby="export-tab-summary"><p>The synthetic export for <strong>${escapeHtml(project.name)}</strong> is ready to preview.</p><dl class="detail-grid"><div><dt>Status</dt><dd>${escapeHtml(project.status)}</dd></div><div><dt>Customer</dt><dd>${escapeHtml(project.customerId)}</dd></div><div><dt>Description</dt><dd>${escapeHtml(project.description)}</dd></div></dl></section>
    <section id="export-panel-fields" role="tabpanel" aria-labelledby="export-tab-fields" hidden><p>Project ID, name, customer, status, and description.</p></section>
  </section>`;
}
