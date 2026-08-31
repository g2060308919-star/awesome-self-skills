import { escapeHtml, renderStandalone } from "./shell.mjs";

export function renderLogin(accounts, error = null) {
  const accountCards = accounts.map((account) => `
    <label class="account-option">
      <input type="radio" name="accountId" value="${escapeHtml(account.id)}" required>
      <span class="account-avatar" aria-hidden="true">${escapeHtml(account.displayName.split(" ").map((part) => part[0]).join(""))}</span>
      <span><strong>${escapeHtml(account.displayName)}</strong><small>${escapeHtml(account.role)}</small></span>
    </label>`).join("");
  return renderStandalone({
    title: "Manual login",
    bodyClass: "login-page",
    content: `<main id="main-content" class="login-shell">
      <section class="login-intro" aria-labelledby="login-title">
        <p class="product-kicker">Meridian Operations</p>
        <h1 id="login-title">Choose a test account</h1>
        <p>This local evaluation workspace uses predefined synthetic identities. A person must select the account in this visible browser.</p>
        <ul><li>No password or external identity provider</li><li>No real customer or employee data</li><li>Session activity stays inside this run</li></ul>
      </section>
      <section class="login-panel" aria-label="Manual account selection">
        <div><p class="eyebrow">Local non-production</p><h2>Manual login</h2></div>
        ${error ? `<p class="notice notice-alert" role="alert">${escapeHtml(error)}</p>` : ""}
        <form method="post" action="/login">
          <fieldset><legend>Choose a test account</legend>${accountCards}</fieldset>
          <button class="primary-button full-width" type="submit">Continue to workspace</button>
        </form>
      </section>
    </main>`
  });
}
