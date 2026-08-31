import assert from "node:assert/strict";
import test from "node:test";

import { createBusinessServer } from "../src/business/server.mjs";
import { profile, setup } from "./helpers/domain-harness.mjs";

async function start(t, overrides = {}) {
  const harness = await setup(overrides);
  const server = createBusinessServer({
    coordinator: harness.coordinator,
    operations: harness.operations,
    host: "127.0.0.1",
    port: 0
  });
  const address = await server.listen();
  t.after(() => server.close());
  return { ...harness, ...address };
}

async function manualLogin(origin, accountId) {
  const response = await fetch(`${origin}/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin
    },
    body: new URLSearchParams({ accountId })
  });
  return { response, cookie: response.headers.get("set-cookie")?.split(";", 1)[0] };
}

test("unauthenticated business pages expose only manual non-secret account selection", async (t) => {
  const { origin } = await start(t);

  const response = await fetch(origin);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<form[^>]+method="post"[^>]+action="\/login"/);
  assert.match(html, /Choose a test account/);
  assert.match(html, /Vera Viewer/);
  assert.doesNotMatch(html, /type="password"|bearer|oracle|fault-profile|control-socket/i);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
});

test("manual login issues a host-only HttpOnly SameSite Strict session cookie", async (t) => {
  const { origin } = await start(t);

  const { response } = await manualLogin(origin, "acct-operator");
  const cookie = response.headers.get("set-cookie");

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/dashboard");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\//);
  assert.doesNotMatch(cookie, /Domain=/);
  assert.doesNotMatch(cookie, /acct-operator/);
});

test("authenticated dashboard has a conventional accessible B2B shell", async (t) => {
  const { origin } = await start(t);
  const { cookie } = await manualLogin(origin, "acct-operator");

  const response = await fetch(`${origin}/dashboard`, { headers: { cookie } });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(html, /<nav[^>]+aria-label="Primary"/);
  assert.match(html, /<details[^>]*>[\s\S]*Operations/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /<dialog[^>]+id="quick-create-dialog"/);
  assert.match(html, /Signed in as[\s\S]*Owen Operator/);
  assert.match(html, /Current role[\s\S]*Operator/);
  assert.doesNotMatch(html, /oracleEvents|allowedMutations|fault-/);
});

test("customer list supports semantic search filters and deterministic pagination", async (t) => {
  const customers = Array.from({ length: 8 }, (_, index) => ({
    id: `CUS-${1001 + index}`,
    name: index === 6 ? "Hidden Horizon" : `Synthetic Customer ${index + 1}`,
    email: `customer-${index + 1}@example.invalid`,
    timezone: "UTC",
    status: index % 2 === 0 ? "Active" : "Inactive",
    owner: "Owen Operator",
    plan: index % 2 === 0 ? "Core" : "Scale",
    tags: ["benchmark"]
  }));
  const base = profile();
  const { origin } = await start(t, { fixture: { ...base.fixture, customers } });
  const { cookie } = await manualLogin(origin, "acct-viewer");

  const first = await (await fetch(`${origin}/customers?page=1`, { headers: { cookie } })).text();
  const search = await (await fetch(`${origin}/customers?search=Hidden%20Horizon`, { headers: { cookie } })).text();

  assert.match(first, /Search customers/);
  assert.match(first, /Filter by status/);
  assert.match(first, /Page 1 of 2/);
  assert.doesNotMatch(first, /Hidden Horizon/);
  assert.match(search, /Hidden Horizon/);
  assert.match(search, /href="\/customers\/CUS-1007"/);
});

test("native customer form returns visible field-linked validation without mutation", async (t) => {
  const { origin, coordinator } = await start(t);
  const { cookie } = await manualLogin(origin, "acct-operator");

  const response = await fetch(`${origin}/customers`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie,
      origin,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      name: "",
      email: "invalid",
      timezone: "UTC",
      status: "Active",
      owner: "Owen Operator",
      plan: "Core",
      tags: "benchmark"
    })
  });
  const html = await response.text();

  assert.equal(response.status, 422);
  assert.match(html, /role="alert"/);
  assert.match(html, /id="name-error"/);
  assert.match(html, /aria-describedby="name-error"/);
  assert.match(html, /Enter a valid email address/);
  assert.equal(coordinator.read().customers.length, 1);
});

test("Viewer cannot see mutation controls while Operator can", async (t) => {
  const { origin } = await start(t);
  const viewer = await manualLogin(origin, "acct-viewer");
  const operator = await manualLogin(origin, "acct-operator");

  const viewerHtml = await (await fetch(`${origin}/projects/PRJ-1001`, {
    headers: { cookie: viewer.cookie }
  })).text();
  const operatorHtml = await (await fetch(`${origin}/projects/PRJ-1001`, {
    headers: { cookie: operator.cookie }
  })).text();

  assert.match(viewerHtml, /You have read-only access/);
  assert.doesNotMatch(viewerHtml, /Activate project/);
  assert.match(operatorHtml, /Activate project/);
});

test("static assets are same-origin and unknown routes do not reveal internals", async (t) => {
  const { origin } = await start(t);

  const script = await fetch(`${origin}/assets/app.mjs`);
  const style = await fetch(`${origin}/assets/styles.css`);
  const missing = await fetch(`${origin}/control/oracle/faults`);

  assert.match(script.headers.get("content-type"), /javascript/);
  assert.match(style.headers.get("content-type"), /text\/css/);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    error: { code: "NOT_FOUND", message: "Page not found" }
  });
});

export { start, manualLogin };
