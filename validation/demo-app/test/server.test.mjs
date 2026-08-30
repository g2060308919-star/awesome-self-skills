import assert from "node:assert/strict";
import test from "node:test";

async function loadServer() {
  try {
    return await import("../src/server.mjs");
  } catch {
    return {};
  }
}

test("the HTTP boundary identifies a loopback non-production demo and serves a semantic login page", async (t) => {
  const { createDemoServer } = await loadServer();
  assert.equal(typeof createDemoServer, "function");

  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  const metadataResponse = await fetch(`${origin}/__diag/meta`);
  assert.equal(metadataResponse.status, 200);
  assert.deepEqual(await metadataResponse.json(), {
    service: "b2b-e2e-runner-demo",
    mode: "demo",
    nonProduction: true
  });

  const pageResponse = await fetch(origin);
  assert.equal(pageResponse.status, 200);
  const page = await pageResponse.text();
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<main id="main-content">/);
  assert.equal((page.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(page, /Non-production demo/);
  assert.match(page, /<button type="submit">Sign in manually<\/button>/);
});

test("the business state is gated until the human starts a credential-free session", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  assert.equal((await fetch(`${origin}/api/state`)).status, 401);

  const loginResponse = await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });
  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), {
    authenticated: true,
    displayName: "Morgan Lee",
    role: "analyst"
  });

  const stateResponse = await fetch(`${origin}/api/state`);
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(state.session.authenticated, true);
  assert.equal(Object.hasOwn(state.session, "password"), false);
  assert.equal(Object.hasOwn(state.session, "token"), false);
});

test("every controlled-browser mutation is rejected before manual sign-in", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  const attempts = [
    ["/api/session/role", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "manager" }) }],
    ["/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Unauthorized request", amount: 1 }) }],
    ["/api/requests/REQ-1001/approve", { method: "POST" }],
    ["/api/requests/REQ-9001", { method: "DELETE" }],
    ["/ui/session/role", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ role: "manager" }) }],
    ["/ui/requests/create", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ title: "Unauthorized request", amount: "1" }) }],
    ["/ui/requests/REQ-1001/approve", { method: "POST" }],
    ["/ui/requests/REQ-9001/delete", { method: "POST" }],
    ["/api/diagnostics/reconciliation", { method: "GET" }]
  ];

  for (const [path, init] of attempts) {
    const response = await fetch(`${origin}${path}`, { ...init, redirect: "manual" });
    assert.equal(response.status, 401, path);
  }

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });
  const state = await (await fetch(`${origin}/api/state`)).json();
  assert.equal(state.session.role, "analyst");
  assert.equal(state.requests.some(({ title }) => title === "Unauthorized request"), false);
  assert.equal(state.requests.find(({ id }) => id === "REQ-1001").status, "Pending approval");
  assert.equal(state.requests.some(({ id }) => id === "REQ-9001"), true);
});

test("the HTTP approval flow requires a role change before mutating the request", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });

  const denied = await fetch(`${origin}/api/requests/REQ-1001/approve`, {
    method: "POST"
  });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).reason, "Manager permission required");

  const roleChange = await fetch(`${origin}/api/session/role`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "manager" })
  });
  assert.equal(roleChange.status, 200);
  assert.equal((await roleChange.json()).role, "manager");

  const approved = await fetch(`${origin}/api/requests/REQ-1001/approve`, {
    method: "POST"
  });
  assert.equal(approved.status, 200);
  assert.equal(
    (await (await fetch(`${origin}/api/state`)).json()).requests.find(
      ({ id }) => id === "REQ-1001"
    ).status,
    "Approved"
  );
});

test("ambiguous creation and cleanup outcomes remain observable through current state", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });

  const create = await fetch(`${origin}/api/requests?outcome=ambiguous`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Synthetic monitor purchase", amount: 480 })
  });
  assert.equal(create.status, 504);
  assert.equal((await create.json()).outcome, "unknown");

  let state = await (await fetch(`${origin}/api/state`)).json();
  const created = state.requests.filter(
    ({ title }) => title === "Synthetic monitor purchase"
  );
  assert.equal(created.length, 1);

  const cleanup = await fetch(`${origin}/api/requests/${created[0].id}`, {
    method: "DELETE"
  });
  assert.equal(cleanup.status, 204);
  state = await (await fetch(`${origin}/api/state`)).json();
  assert.equal(state.requests.some(({ id }) => id === created[0].id), false);

  const residualCreate = await fetch(`${origin}/api/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Retention protected dock", amount: 210 })
  });
  const residualId = (await residualCreate.json()).request.id;
  const failedCleanup = await fetch(
    `${origin}/api/requests/${residualId}?outcome=failure`,
    { method: "DELETE" }
  );
  assert.equal(failedCleanup.status, 503);
  assert.equal((await failedCleanup.json()).residual, true);
  state = await (await fetch(`${origin}/api/state`)).json();
  assert.equal(state.requests.some(({ id }) => id === residualId), true);
});

test("external review and secret-bearing failure diagnostics are exposed as distinct facts", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });

  const external = await fetch(`${origin}/external/requests/REQ-2002/review`, {
    method: "POST"
  });
  assert.equal(external.status, 200);
  const state = await (await fetch(`${origin}/api/state`)).json();
  assert.equal(
    state.requests.find(({ id }) => id === "REQ-2002").status,
    "Externally reviewed"
  );
  assert.equal(state.audit.at(-1).provenance, "external-person");

  const diagnostic = await fetch(`${origin}/api/diagnostics/reconciliation`);
  assert.equal(diagnostic.status, 503);
  const body = await diagnostic.json();
  assert.equal(body.error.code, "RECONCILIATION_DIVERGED");
  assert.match(body.privateDiagnostic.authorization, /^Bearer DEMO-TOKEN-CANARY-/);
  assert.match(body.privateDiagnostic.cookie, /^session=DEMO-COOKIE-CANARY-/);
  assert.match(body.privateDiagnostic.supplierTaxId, /^DEMO-CLIENT-CANARY-/);
});

test("manual form sign-in opens an accessible server-rendered procurement workspace", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  const login = await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ displayName: "Morgan Lee" }),
    redirect: "manual"
  });
  assert.equal(login.status, 303);
  assert.equal(login.headers.get("location"), "/");

  const workspace = await (await fetch(origin)).text();
  assert.equal((workspace.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(workspace, /<nav aria-label="Primary">/);
  assert.match(workspace, /<caption>Purchase requests<\/caption>/);
  assert.match(workspace, /<th scope="col">Status<\/th>/);
  assert.match(workspace, /<label for="request-title">Title<\/label>/);
  assert.match(workspace, /<label for="request-amount">Amount<\/label>/);
  assert.match(workspace, /Current role: <strong>Analyst<\/strong>/);
  assert.match(workspace, /REQ-1001/);
  assert.match(workspace, /<button type="submit">Create request<\/button>/);
});

test("each business ID opens a real semantic request detail page", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });

  const workspace = await (await fetch(origin)).text();
  assert.match(workspace, /href="\/requests\/REQ-2002">REQ-2002<\/a>/);
  assert.doesNotMatch(workspace, /href="#REQ-2002"/);

  const response = await fetch(`${origin}/requests/REQ-2002`);
  assert.equal(response.status, 200);
  const detail = await response.text();
  assert.equal((detail.match(/<h1[ >]/g) ?? []).length, 1);
  assert.match(detail, /<h1>Request REQ-2002<\/h1>/);
  assert.match(detail, /External security review/);
  assert.match(detail, /Pending external review/);
  assert.match(detail, /<a href="\/">Back to procurement workspace<\/a>/);
  assert.match(detail, /<div role="group" aria-label="Request actions">/);
  assert.match(detail, /<button type="submit">Approve REQ-2002<\/button>/);
});

test("native forms support an assisted role change followed by approval", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ displayName: "Morgan Lee" })
  });

  const roleChange = await fetch(`${origin}/ui/session/role`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ role: "manager" }),
    redirect: "manual"
  });
  assert.equal(roleChange.status, 303);
  const roleWorkspace = await (await fetch(origin)).text();
  assert.match(roleWorkspace, /Current role: <strong>Manager<\/strong>/);
  assert.match(
    roleWorkspace,
    /<option value="manager" selected>Manager<\/option>/
  );
  assert.doesNotMatch(
    roleWorkspace,
    /<option value="analyst" selected>Analyst<\/option>/
  );

  const approval = await fetch(`${origin}/ui/requests/REQ-1001/approve`, {
    method: "POST",
    redirect: "manual"
  });
  assert.equal(approval.status, 303);
  const workspace = await (await fetch(origin)).text();
  assert.match(workspace, /REQ-1001/);
  assert.match(workspace, /Approved/);
});

test("the native create form returns an ambiguous failure after persisting exactly once", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ displayName: "Morgan Lee" })
  });

  const create = await fetch(`${origin}/ui/requests/create`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      title: "AW-RUN-001 synthetic monitor",
      amount: "480"
    })
  });
  assert.equal(create.status, 504);
  assert.match(await create.text(), /Submission outcome unknown/);

  const workspace = await (await fetch(origin)).text();
  assert.equal(
    (workspace.match(/AW-RUN-001 synthetic monitor/g) ?? []).length,
    1
  );
});

test("destructive forms act on an explicit business ID and expose retention residuals", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });

  let state = await (await fetch(`${origin}/api/state`)).json();
  const ambiguous = state.requests.filter(
    ({ title }) => title === "Stale sandbox request"
  );
  assert.deepEqual(
    ambiguous.map(({ id }) => id),
    ["REQ-9001", "REQ-9002"]
  );

  const preciseDelete = await fetch(`${origin}/ui/requests/REQ-9001/delete`, {
    method: "POST",
    redirect: "manual"
  });
  assert.equal(preciseDelete.status, 303);
  state = await (await fetch(`${origin}/api/state`)).json();
  assert.equal(state.requests.some(({ id }) => id === "REQ-9001"), false);
  assert.equal(state.requests.some(({ id }) => id === "REQ-9002"), true);

  const protectedDelete = await fetch(`${origin}/ui/requests/REQ-9003/delete`, {
    method: "POST"
  });
  assert.equal(protectedDelete.status, 409);
  assert.match(await protectedDelete.text(), /Retention policy/);
  state = await (await fetch(`${origin}/api/state`)).json();
  assert.equal(state.requests.some(({ id }) => id === "REQ-9003"), true);
});

test("the workspace serves progressive assets and a live diagnostic status region", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });

  const workspace = await (await fetch(origin)).text();
  assert.match(workspace, /<link rel="stylesheet" href="\/assets\/styles\.css">/);
  assert.match(workspace, /<script type="module" src="\/assets\/app\.mjs"><\/script>/);
  assert.match(workspace, /<button type="button" id="reconciliation-check">/);
  assert.match(workspace, /<output id="diagnostic-result" role="status"/);

  const script = await fetch(`${origin}/assets/app.mjs`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);

  const diagnosticsModule = await fetch(`${origin}/assets/diagnostics.mjs`);
  assert.equal(diagnosticsModule.status, 200);
  assert.match(diagnosticsModule.headers.get("content-type"), /javascript/);

  const stylesheet = await fetch(`${origin}/assets/styles.css`);
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type"), /text\/css/);
});

test("permission denial is rendered as an accessible assistance-worthy alert", async (t) => {
  const { createDemoServer } = await loadServer();
  const app = createDemoServer();
  const origin = await app.listen();
  t.after(() => app.close());

  await fetch(`${origin}/api/manual-login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Morgan Lee" })
  });

  const approval = await fetch(`${origin}/ui/requests/REQ-1001/approve`, {
    method: "POST",
    redirect: "manual"
  });
  assert.equal(approval.status, 303);
  const location = approval.headers.get("location");
  const workspace = await (await fetch(`${origin}${location}`)).text();
  assert.match(
    workspace,
    /<p role="alert">Manager permission required<\/p>/
  );
});
