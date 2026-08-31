export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function page({ title, body, bodyClass = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)} · Meridian Operations</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script type="module" src="/assets/app.mjs"></script>
</head>
<body class="${escapeHtml(bodyClass)}">
  <a class="skip-link" href="#main-content">Skip to main content</a>
  ${body}
</body>
</html>`;
}

const NAVIGATION = {
  northstar: ["customers", "projects", "approvals", "audit"],
  harbor: ["projects", "approvals", "customers", "audit"]
};

const NAV_ITEMS = {
  customers: ["/customers", "Customers", "CU"],
  projects: ["/projects", "Projects", "PR"],
  approvals: ["/approvals", "Approvals", "AP"],
  audit: ["/audit", "Business audit", "AU"]
};

function navLink(key, activeSection) {
  const [href, label, badge] = NAV_ITEMS[key];
  const current = activeSection === key ? ' aria-current="page"' : "";
  return `<a class="nav-link${activeSection === key ? " is-active" : ""}" href="${href}"${current}>
    <span class="nav-badge" aria-hidden="true">${badge}</span>
    <span>${label}</span>
  </a>`;
}

export function renderWorkspace({
  title,
  account,
  variant = "northstar",
  activeSection = "dashboard",
  content,
  notice = null,
  noticeKind = "status"
}) {
  const order = NAVIGATION[variant] ?? NAVIGATION.northstar;
  const operationalLinks = order.slice(0, 3).map((key) => navLink(key, activeSection)).join("");
  const auditLink = navLink("audit", activeSection);
  const noticeMarkup = notice
    ? `<div class="notice notice-${noticeKind}" role="${noticeKind === "alert" ? "alert" : "status"}">${escapeHtml(notice)}</div>`
    : "";

  return page({
    title,
    bodyClass: `workspace variant-${variant}`,
    body: `<header class="topbar">
      <a class="brand" href="/dashboard" aria-label="Meridian Operations dashboard">
        <span class="brand-mark" aria-hidden="true">M</span>
        <span><strong>Meridian</strong><small>Evaluation workspace</small></span>
      </a>
      <div class="environment"><span aria-hidden="true"></span> Local non-production</div>
      <div class="identity">
        <span>Signed in as <strong>${escapeHtml(account.displayName)}</strong></span>
        <span>Current role <strong>${escapeHtml(account.role)}</strong></span>
        <form method="post" action="/logout"><button class="text-button" type="submit">Sign out</button></form>
      </div>
    </header>
    <div class="app-frame">
      <aside class="sidebar">
        <nav aria-label="Primary">
          <a class="nav-link${activeSection === "dashboard" ? " is-active" : ""}" href="/dashboard"${activeSection === "dashboard" ? ' aria-current="page"' : ""}>
            <span class="nav-badge" aria-hidden="true">DB</span><span>Dashboard</span>
          </a>
          <details open>
            <summary>Operations</summary>
            <div class="nav-group">${operationalLinks}</div>
          </details>
          <details>
            <summary>Governance</summary>
            <div class="nav-group">${auditLink}</div>
          </details>
        </nav>
        <div class="sidebar-foot">Fixture UI · ${escapeHtml(variant)}</div>
      </aside>
      <main id="main-content" tabindex="-1">
        <div class="page-heading">
          <div><p class="eyebrow">Business workspace</p><h1>${escapeHtml(title)}</h1></div>
          <button class="primary-button" type="button" data-open-dialog="quick-create-dialog">Quick create</button>
        </div>
        ${noticeMarkup}
        ${content}
      </main>
    </div>
    <dialog id="quick-create-dialog" aria-labelledby="quick-create-title">
      <div class="dialog-heading"><h2 id="quick-create-title">Quick create</h2><button type="button" class="icon-button" data-close-dialog aria-label="Close quick create dialog">×</button></div>
      <p>Choose the business record you need to add.</p>
      <div class="dialog-actions"><a class="primary-button" href="/customers/new">Create customer</a><a class="secondary-button" href="/approvals">Submit approval</a></div>
    </dialog>`
  });
}

export function renderStandalone({ title, content, bodyClass = "standalone" }) {
  return page({ title, body: content, bodyClass });
}
