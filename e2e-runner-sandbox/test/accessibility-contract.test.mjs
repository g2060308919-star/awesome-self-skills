import assert from "node:assert/strict";
import test from "node:test";

import { renderWorkspace } from "../src/business/views/shell.mjs";

const account = {
  id: "acct-operator",
  displayName: "Owen Operator",
  role: "Operator"
};

function countUnlabelledControls(html) {
  const labels = new Set(
    [...html.matchAll(/<label[^>]+for="([^"]+)"/g)].map((match) => match[1])
  );
  const controls = [...html.matchAll(/<(input|select|textarea)[^>]+id="([^"]+)"[^>]*>/g)];
  return controls.filter(([, , id]) => !labels.has(id)).length;
}

test("both UI variants retain critical accessible names with different navigation order", () => {
  const northstar = renderWorkspace({
    title: "Customers",
    account,
    variant: "northstar",
    activeSection: "customers",
    content: '<label for="customer-search">Search customers</label><input id="customer-search">'
  });
  const harbor = renderWorkspace({
    title: "Customers",
    account,
    variant: "harbor",
    activeSection: "customers",
    content: '<label for="customer-search">Search customers</label><input id="customer-search">'
  });

  for (const html of [northstar, harbor]) {
    for (const name of ["Customers", "Projects", "Approvals", "Business audit", "Search customers"]) {
      assert.match(html, new RegExp(name));
    }
    assert.equal(countUnlabelledControls(html), 0);
    assert.match(html, /<a[^>]+href="#main-content"/);
    assert.match(html, /<main[^>]+id="main-content"/);
  }
  const northstarNav = northstar.match(/<nav aria-label="Primary">([\s\S]*?)<\/nav>/)[1];
  const harborNav = harbor.match(/<nav aria-label="Primary">([\s\S]*?)<\/nav>/)[1];
  assert.ok(northstarNav.indexOf("Customers") < northstarNav.indexOf("Projects"));
  assert.ok(harborNav.indexOf("Projects") < harborNav.indexOf("Customers"));
});

test("rendered user content is HTML-escaped", () => {
  const html = renderWorkspace({
    title: '<img src=x onerror="alert(1)">',
    account: { ...account, displayName: "<script>unsafe()</script>" },
    variant: "northstar",
    activeSection: "dashboard",
    content: "<p>trusted view markup</p>"
  });

  assert.doesNotMatch(html, /<script>unsafe/);
  assert.match(html, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img src=x/);
});
