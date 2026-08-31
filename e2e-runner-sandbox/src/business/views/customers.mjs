import { escapeHtml } from "./shell.mjs";

function option(value, selected) {
  return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(value || "All")}</option>`;
}

function customerRows(customers, variant) {
  if (customers.length === 0) {
    return '<tr><td colspan="6"><div class="empty-state"><strong>No customers match these filters</strong><p>Adjust the search or filter values.</p></div></td></tr>';
  }
  return customers.map((customer) => {
    const standard = `<td><a class="record-link" href="/customers/${encodeURIComponent(customer.id)}">${escapeHtml(customer.name)}</a><small>${escapeHtml(customer.id)}</small></td>
      <td>${escapeHtml(customer.status)}</td><td>${escapeHtml(customer.owner)}</td><td>${escapeHtml(customer.plan)}</td>`;
    const harbor = `<td><a class="record-link" href="/customers/${encodeURIComponent(customer.id)}">${escapeHtml(customer.name)}</a><small>${escapeHtml(customer.id)}</small></td>
      <td>${escapeHtml(customer.plan)}</td><td>${escapeHtml(customer.owner)}</td><td>${escapeHtml(customer.status)}</td>`;
    return `<tr>${variant === "harbor" ? harbor : standard}<td>${escapeHtml(customer.timezone)}</td><td>${customer.tags.map(escapeHtml).join(", ")}</td></tr>`;
  }).join("");
}

export function renderCustomerList(result, query, variant) {
  const pageCount = Math.max(1, Math.ceil(result.total / result.pageSize));
  const columns = variant === "harbor"
    ? ["Customer", "Plan", "Owner", "Status", "Timezone", "Tags"]
    : ["Customer", "Status", "Owner", "Plan", "Timezone", "Tags"];
  const queryString = new URLSearchParams({
    ...(query.search ? { search: query.search } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.plan ? { plan: query.plan } : {})
  });
  const previous = Math.max(1, result.page - 1);
  const next = Math.min(pageCount, result.page + 1);
  return `<section class="content-card">
    <div class="section-heading"><div><p class="eyebrow">Directory</p><h2>Customer records</h2></div><a class="primary-button" href="/customers/new">Create customer</a></div>
    <form class="filter-bar" method="get" action="/customers">
      <div><label for="customer-search">Search customers</label><input id="customer-search" name="search" type="search" value="${escapeHtml(query.search ?? "")}" placeholder="Name, ID, or email"></div>
      <div><label for="customer-status">Filter by status</label><select id="customer-status" name="status">${["", "Active", "Inactive"].map((value) => option(value, query.status)).join("")}</select></div>
      <div><label for="customer-plan">Filter by plan</label><select id="customer-plan" name="plan">${["", "Core", "Scale", "Enterprise"].map((value) => option(value, query.plan)).join("")}</select></div>
      <button class="secondary-button" type="submit">Apply filters</button>
    </form>
    <div class="table-scroll" tabindex="0" aria-label="Scrollable customer results">
      <table><caption>${result.total} customers found</caption><thead><tr>${columns.map((column) => `<th scope="col">${column}</th>`).join("")}</tr></thead><tbody>${customerRows(result.customers, variant)}</tbody></table>
    </div>
    <nav class="pagination" aria-label="Customer pages"><a href="/customers?${queryString}&page=${previous}"${result.page === 1 ? ' aria-disabled="true"' : ""}>Previous</a><span>Page ${result.page} of ${pageCount}</span><a href="/customers?${queryString}&page=${next}"${result.page === pageCount ? ' aria-disabled="true"' : ""}>Next</a></nav>
  </section>`;
}

function formField(id, label, value, errors, type = "text") {
  const describedBy = errors[id] ? ` aria-describedby="${id}-error" aria-invalid="true"` : "";
  return `<div class="field"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" value="${escapeHtml(value ?? "")}"${describedBy}>${errors[id] ? `<p class="field-error" id="${id}-error">${escapeHtml(errors[id])}</p>` : ""}</div>`;
}

export function renderCustomerForm({ customer = {}, errors = {}, mode = "create" }) {
  const action = mode === "edit" ? `/customers/${encodeURIComponent(customer.id)}/edit` : "/customers";
  return `<section class="content-card narrow-card">
    <div class="section-heading"><div><p class="eyebrow">${mode === "edit" ? "Customer settings" : "New record"}</p><h2>${mode === "edit" ? `Edit ${escapeHtml(customer.name)}` : "Customer details"}</h2></div></div>
    ${Object.keys(errors).length > 0 ? '<p class="notice notice-alert" role="alert">Review the highlighted fields and submit again.</p>' : ""}
    <form class="record-form" method="post" action="${action}">
      ${formField("name", "Customer name", customer.name, errors)}
      ${formField("email", "Email", customer.email, errors, "email")}
      ${formField("owner", "Owner", customer.owner, errors)}
      ${formField("timezone", "Timezone", customer.timezone ?? "UTC", errors)}
      <div class="field"><label for="status">Status</label><select id="status" name="status">${["Active", "Inactive"].map((value) => option(value, customer.status ?? "Active")).join("")}</select></div>
      <div class="field"><label for="plan">Plan</label><select id="plan" name="plan">${["Core", "Scale", "Enterprise"].map((value) => option(value, customer.plan ?? "Core")).join("")}</select></div>
      ${formField("tags", "Tags (comma separated)", Array.isArray(customer.tags) ? customer.tags.join(", ") : customer.tags, errors)}
      <div class="form-actions"><a class="text-link" href="/customers">Cancel</a><button class="primary-button" type="submit">${mode === "edit" ? "Save customer" : "Create customer"}</button></div>
    </form>
  </section>`;
}

export function renderCustomerDetail(customer, canEdit, feedback = null) {
  return `<section class="content-card detail-card">
    ${feedback ? `<p class="notice notice-${feedback.kind}" role="${feedback.kind === "alert" ? "alert" : "status"}">${escapeHtml(feedback.message)}</p>` : ""}
    <div class="section-heading"><div><p class="eyebrow">${escapeHtml(customer.id)}</p><h2>${escapeHtml(customer.name)}</h2></div>${canEdit ? `<div class="inline-actions"><a class="secondary-button" href="/customers/${encodeURIComponent(customer.id)}/edit">Edit customer</a><form method="post" action="/customers/${encodeURIComponent(customer.id)}/delete"><button class="danger-button" type="submit">Delete customer</button></form></div>` : ""}</div>
    <dl class="detail-grid"><div><dt>Status</dt><dd>${escapeHtml(customer.status)}</dd></div><div><dt>Owner</dt><dd>${escapeHtml(customer.owner)}</dd></div><div><dt>Plan</dt><dd>${escapeHtml(customer.plan)}</dd></div><div><dt>Email</dt><dd>${escapeHtml(customer.email)}</dd></div><div><dt>Timezone</dt><dd>${escapeHtml(customer.timezone)}</dd></div><div><dt>Tags</dt><dd>${customer.tags.map(escapeHtml).join(", ")}</dd></div></dl>
  </section>`;
}
