export function renderDashboardContent(state) {
  const activeCustomers = state.customers.filter(({ status }) => status === "Active").length;
  const openApprovals = state.approvals.filter(({ status }) => status === "Pending").length;
  const processingProjects = state.projects.filter(({ status }) => status === "Processing").length;
  return `<div role="tablist" aria-label="Dashboard views" class="tabs">
    <button type="button" role="tab" aria-selected="true" aria-controls="overview-panel" id="overview-tab">Overview</button>
    <button type="button" role="tab" aria-selected="false" aria-controls="activity-panel" id="activity-tab">Recent activity</button>
  </div>
  <section id="overview-panel" role="tabpanel" aria-labelledby="overview-tab">
    <div class="metric-strip">
      <article><span>Active customers</span><strong>${activeCustomers}</strong><small>Deterministic fixture</small></article>
      <article><span>Open approvals</span><strong>${openApprovals}</strong><small>Local fake outbox</small></article>
      <article><span>Projects processing</span><strong>${processingProjects}</strong><small>Logical worker queue</small></article>
    </div>
    <section class="content-card"><div class="section-heading"><div><p class="eyebrow">Today</p><h2>Operations overview</h2></div></div><p>Use the navigation to inspect customers, projects, approvals, and the role-limited business audit.</p></section>
  </section>
  <section id="activity-panel" role="tabpanel" aria-labelledby="activity-tab" hidden>
    <div class="empty-state"><strong>No additional activity to display</strong><p>New business events will appear after verified actions.</p></div>
  </section>`;
}
