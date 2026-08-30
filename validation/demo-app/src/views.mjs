function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageShell(title, content) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — non-production demo</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <script type="module" src="/assets/app.mjs"></script>
</head>
<body>
  <a href="#main-content">Skip to main content</a>
  <p role="status">Non-production demo · Local QA</p>
  ${content}
</body>
</html>`;
}

export function renderLoginPage() {
  return pageShell(
    "Procurement desk",
    `<main id="main-content">
    <h1>Procurement request desk</h1>
    <p>This synthetic workspace requires a human to start the demo session.</p>
    <form method="post" action="/api/manual-login">
      <label for="display-name">Display name</label>
      <input id="display-name" name="displayName" autocomplete="off" required>
      <button type="submit">Sign in manually</button>
    </form>
  </main>`
  );
}

export function renderWorkspace(state, feedback = {}) {
  const rows = state.requests
    .map(
      (request) => `<tr>
        <th scope="row"><a href="/requests/${escapeHtml(request.id)}">${escapeHtml(request.id)}</a></th>
        <td>${escapeHtml(request.title)}</td>
        <td>$${Number(request.amount).toFixed(2)}</td>
        <td>${escapeHtml(request.status)}</td>
        <td>
          <form method="post" action="/ui/requests/${escapeHtml(request.id)}/approve">
            <button type="submit">Approve ${escapeHtml(request.id)}</button>
          </form>
          <form method="post" action="/ui/requests/${escapeHtml(request.id)}/delete">
            <button type="submit">Delete ${escapeHtml(request.id)}</button>
          </form>
        </td>
      </tr>`
    )
    .join("\n");
  const role = state.session.role === "manager" ? "Manager" : "Analyst";
  const analystSelected = state.session.role === "analyst" ? " selected" : "";
  const managerSelected = state.session.role === "manager" ? " selected" : "";
  const feedbackMarkup = feedback.notice
    ? `<p role="${feedback.kind === "alert" ? "alert" : "status"}">${escapeHtml(feedback.notice)}</p>`
    : "";

  return pageShell(
    "Procurement workspace",
    `<header>
    <nav aria-label="Primary">
      <a href="#requests">Requests</a>
      <a href="#new-request">New request</a>
      <a href="#diagnostics">Diagnostics</a>
    </nav>
    <p>Signed in as <strong>${escapeHtml(state.session.displayName)}</strong></p>
    <p>Current role: <strong>${role}</strong></p>
    <form method="post" action="/ui/session/role">
      <label for="session-role">Change role</label>
      <select id="session-role" name="role">
        <option value="analyst"${analystSelected}>Analyst</option>
        <option value="manager"${managerSelected}>Manager</option>
      </select>
      <button type="submit">Apply role</button>
    </form>
  </header>
  <main id="main-content">
    <h1>Procurement request workspace</h1>
    ${feedbackMarkup}
    <section id="requests" aria-labelledby="requests-heading">
      <h2 id="requests-heading">Requests</h2>
      <table>
        <caption>Purchase requests</caption>
        <thead><tr>
          <th scope="col">Request</th>
          <th scope="col">Title</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    <section id="new-request" aria-labelledby="new-request-heading">
      <h2 id="new-request-heading">New request</h2>
      <form method="post" action="/ui/requests/create">
        <label for="request-title">Title</label>
        <input id="request-title" name="title" required>
        <label for="request-amount">Amount</label>
        <input id="request-amount" name="amount" type="number" min="1" required>
        <button type="submit">Create request</button>
      </form>
    </section>
    <section id="diagnostics" aria-labelledby="diagnostics-heading">
      <h2 id="diagnostics-heading">Diagnostics</h2>
      <p>Reconciliation status: Ready for a synthetic check.</p>
      <button type="button" id="reconciliation-check">Run reconciliation check</button>
      <output id="diagnostic-result" role="status" aria-live="polite"></output>
    </section>
  </main>`
  );
}

export function renderUnknownOutcomePage() {
  return pageShell(
    "Submission outcome unknown",
    `<main id="main-content">
    <h1>Submission outcome unknown</h1>
    <p role="alert">The synthetic gateway did not return a conclusive result.</p>
    <p>No additional submission was attempted.</p>
    <a href="/">Return to workspace</a>
  </main>`
  );
}

export function renderCleanupFailurePage(requestId, reason) {
  return pageShell(
    "Cleanup failed",
    `<main id="main-content">
    <h1>Cleanup failed</h1>
    <p role="alert">${escapeHtml(reason)}</p>
    <p>Residual request: <strong>${escapeHtml(requestId)}</strong></p>
    <a href="/">Return to workspace</a>
  </main>`
  );
}

export function renderRequestDetail(state, request) {
  const role = state.session.role === "manager" ? "Manager" : "Analyst";
  return pageShell(
    `Request ${request.id}`,
    `<header>
    <nav aria-label="Request navigation">
      <a href="/">Back to procurement workspace</a>
    </nav>
    <p>Current role: <strong>${role}</strong></p>
  </header>
  <main id="main-content">
    <h1>Request ${escapeHtml(request.id)}</h1>
    <dl>
      <dt>Title</dt><dd>${escapeHtml(request.title)}</dd>
      <dt>Amount</dt><dd>$${Number(request.amount).toFixed(2)}</dd>
      <dt>Status</dt><dd>${escapeHtml(request.status)}</dd>
    </dl>
    <div role="group" aria-label="Request actions">
      <form method="post" action="/ui/requests/${escapeHtml(request.id)}/approve">
        <button type="submit">Approve ${escapeHtml(request.id)}</button>
      </form>
      <form method="post" action="/ui/requests/${escapeHtml(request.id)}/delete">
        <button type="submit">Delete ${escapeHtml(request.id)}</button>
      </form>
    </div>
  </main>`
  );
}
