import assert from "node:assert/strict";
import http from "node:http";
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

async function forgedHostLogin(origin) {
  const target = new URL(origin);
  const body = new URLSearchParams({ accountId: "acct-viewer" }).toString();
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: target.hostname,
      port: target.port,
      path: "/login",
      method: "POST",
      headers: {
        host: "evil.invalid",
        origin: "http://evil.invalid",
        "content-type": "application/x-www-form-urlencoded",
        "content-length": Buffer.byteLength(body)
      }
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response));
    });
    request.once("error", reject);
    request.end(body);
  });
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

test("Chrome null-Origin navigation is accepted only with same-origin Fetch Metadata and matching Host", async (t) => {
  const { origin } = await start(t);
  const sameOrigin = await fetch(`${origin}/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "null",
      "sec-fetch-site": "same-origin"
    },
    body: new URLSearchParams({ accountId: "acct-viewer" })
  });
  const crossSite = await fetch(`${origin}/login`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "null",
      "sec-fetch-site": "cross-site"
    },
    body: new URLSearchParams({ accountId: "acct-viewer" })
  });

  assert.equal(sameOrigin.status, 303);
  assert.equal(crossSite.status, 403);
});

test("a forged Host header cannot redefine the trusted form origin", async (t) => {
  const { origin } = await start(t);

  const response = await forgedHostLogin(origin);

  assert.equal(response.statusCode, 403);
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
  assert.match(html, /<span>Active customers<\/span><strong>1<\/strong>/);
  assert.match(html, /<span>Open approvals<\/span><strong>0<\/strong>/);
  assert.match(html, /<span>Projects processing<\/span><strong>0<\/strong>/);
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

test("customer form delegates validation to the server and returns every field error without mutation", async (t) => {
  const { origin, coordinator } = await start(t);
  const { cookie } = await manualLogin(origin, "acct-operator");

  const form = await (await fetch(`${origin}/customers/new`, {
    headers: { cookie }
  })).text();
  assert.match(form, /<form class="record-form" method="post" action="\/customers" novalidate>/);

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

  const viewerCustomers = await (await fetch(`${origin}/customers`, {
    headers: { cookie: viewer.cookie }
  })).text();
  const operatorCustomers = await (await fetch(`${origin}/customers`, {
    headers: { cookie: operator.cookie }
  })).text();
  assert.doesNotMatch(viewerCustomers, />Create customer<\/a>/);
  assert.match(operatorCustomers, />Create customer<\/a>/);
});

test("baseline audit entries render complete visible provenance", async (t) => {
  const base = profile();
  const { origin } = await start(t, { fixture: {
    ...base.fixture,
    businessAudit: [{
      id: "AUD-BASE-1", summary: "Atlas Renewal project created",
      createdAt: "2026-08-31T00:00:00.000Z"
    }]
  } });
  const { cookie } = await manualLogin(origin, "acct-viewer");
  const html = await (await fetch(`${origin}/audit`, { headers: { cookie } })).text();

  assert.match(html, /Atlas Renewal project created/);
  assert.match(html, /2026-08-31T00:00:00\.000Z/);
  assert.match(html, /System/);
});

test("customer edit submits only changed fields and delete exposes cleanup outcome", async (t) => {
  const base = profile();
  const { origin, coordinator } = await start(t, {
    allowedMutations: [
      { entity: "customer", target: "CUS-1001", field: "plan", operation: "update", maxCount: 1 },
      { entity: "customer", target: "CUS-1001", field: "*", operation: "delete", maxCount: 1 }
    ],
    fixture: base.fixture
  });
  const { cookie } = await manualLogin(origin, "acct-operator");
  const current = coordinator.read().customers[0];
  const detail = await (await fetch(`${origin}/customers/CUS-1001`, { headers: { cookie } })).text();
  assert.match(detail, /action="\/customers\/CUS-1001\/delete"/);

  const edit = await fetch(`${origin}/customers/CUS-1001/edit`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: current.name,
      email: current.email,
      timezone: current.timezone,
      status: current.status,
      owner: current.owner,
      plan: "Scale",
      tags: current.tags.join(", ")
    })
  });
  assert.equal(edit.status, 303);
  assert.equal(coordinator.read().customers[0].plan, "Scale");

  const deleted = await fetch(`${origin}/customers/CUS-1001/delete`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams()
  });
  assert.equal(deleted.status, 303);
  assert.equal(coordinator.read().customers.length, 0);
});

test("project description expiry returns to visible manual login without writing", async (t) => {
  const { origin, coordinator } = await start(t, {
    allowedMutations: [
      { entity: "project", target: "PRJ-1001", field: "description", operation: "update", maxCount: 1 }
    ],
    fault: {
      id: "session-expiry", logicalOperation: "project.description.update",
      phase: "before-authorization", effect: "expire-session", occurrence: 1
    }
  });
  const { cookie } = await manualLogin(origin, "acct-operator");
  const response = await fetch(`${origin}/projects/PRJ-1001/description`, {
    method: "POST",
    redirect: "manual",
    headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ description: "Approved renewal workspace" })
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(coordinator.read().projects[0].description, "Synthetic migration");
});

test("failed project save renders a visible diagnostic while preserving state", async (t) => {
  const { origin, coordinator } = await start(t, {
    fault: {
      id: "canary-diagnostic", logicalOperation: "project.status.update",
      phase: "before-commit", effect: "application-failure-with-canary", occurrence: 1,
      diagnosticCanary: "secret"
    }
  });
  const { cookie } = await manualLogin(origin, "acct-operator");
  const response = await fetch(`${origin}/projects/PRJ-1001/status`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ status: "Active" })
  });
  const html = await response.text();

  assert.equal(response.status, 500);
  assert.match(html, /role="alert"/);
  assert.match(html, /Diagnostic details/);
  assert.match(html, /BENCH_SECRET_[0-9A-HJKMNP-TV-Z]{20}_END/);
  assert.equal(coordinator.read().projects[0].status, "Inactive");
});

test("project export is discoverable only when the deterministic feature flag is enabled", async (t) => {
  const base = profile();
  const enabled = await start(t, { fixture: { ...base.fixture, featureFlags: { exportSummary: true } } });
  const enabledLogin = await manualLogin(enabled.origin, "acct-viewer");
  const detail = await (await fetch(`${enabled.origin}/projects/PRJ-1001`, {
    headers: { cookie: enabledLogin.cookie }
  })).text();
  const exportPanel = await (await fetch(`${enabled.origin}/projects/PRJ-1001/export`, {
    headers: { cookie: enabledLogin.cookie }
  })).text();
  assert.match(detail, /More actions/);
  assert.match(detail, /Export summary/);
  assert.match(exportPanel, /role="tablist"/);
  assert.match(exportPanel, /Export project summary/);

  const disabled = await start(t, { fixture: { ...base.fixture, featureFlags: { exportSummary: false } } });
  const disabledLogin = await manualLogin(disabled.origin, "acct-viewer");
  const disabledDetail = await (await fetch(`${disabled.origin}/projects/PRJ-1001`, {
    headers: { cookie: disabledLogin.cookie }
  })).text();
  const unavailable = await fetch(`${disabled.origin}/projects/PRJ-1001/export`, {
    headers: { cookie: disabledLogin.cookie }
  });
  assert.doesNotMatch(disabledDetail, /Export summary/);
  assert.equal(unavailable.status, 404);
});

test("static assets are same-origin and unknown routes do not reveal internals", async (t) => {
  const { origin } = await start(t);

  const script = await fetch(`${origin}/assets/app.mjs`);
  const style = await fetch(`${origin}/assets/styles.css`);
  const icon = await fetch(`${origin}/favicon.ico`);
  const missing = await fetch(`${origin}/control/oracle/faults`);

  assert.match(script.headers.get("content-type"), /javascript/);
  assert.match(style.headers.get("content-type"), /text\/css/);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get("content-type"), /image\/svg\+xml/);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), {
    error: { code: "NOT_FOUND", message: "Page not found" }
  });
});

test("private request trace is run-bound and never stores query, form, cookie, or response text", async (t) => {
  const { origin, coordinator } = await start(t);
  const { cookie } = await manualLogin(origin, "acct-viewer");
  await fetch(`${origin}/customers?search=TOP-SECRET-QUERY`, { headers: { cookie } });
  const unavailable = await fetch(`${origin}/requests`, { headers: { cookie } });
  const trace = coordinator.businessRequestTrace();

  assert.equal(unavailable.status, 404);
  assert.ok(trace.some(({ route }) => route === "/customers"));
  assert.ok(trace.every(({ runId }) => runId === "run-domain"));
  assert.ok(trace.every(({ requestId, resultDigest, startedAtMs, endedAtMs }) =>
    /^REQ-\d{6}$/.test(requestId) && /^sha256:[a-f0-9]{64}$/.test(resultDigest) &&
    Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs)
  ));
  const serialized = JSON.stringify(trace);
  assert.doesNotMatch(serialized, /TOP-SECRET-QUERY|session-|acct-viewer|Choose a test account/i);
});

export { start, manualLogin };
