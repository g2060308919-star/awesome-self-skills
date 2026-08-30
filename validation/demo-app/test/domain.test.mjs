import assert from "node:assert/strict";
import test from "node:test";

async function loadDomain() {
  try {
    return await import("../src/domain.mjs");
  } catch {
    return {};
  }
}

test("manual sign-in unlocks the workspace without storing credentials", async () => {
  const { createDemoState } = await loadDomain();

  assert.equal(typeof createDemoState, "function");

  const demo = createDemoState();
  assert.equal(demo.snapshot().session.authenticated, false);

  demo.signInManually("Morgan Lee");

  const session = demo.snapshot().session;
  assert.equal(session.authenticated, true);
  assert.equal(session.displayName, "Morgan Lee");
  assert.equal(Object.hasOwn(session, "password"), false);
});

test("approval is denied for an analyst and succeeds after a role change", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();
  demo.signInManually("Morgan Lee");

  assert.equal(typeof demo.approveRequest, "function");
  assert.equal(typeof demo.changeRole, "function");

  const denied = demo.approveRequest("REQ-1001");
  assert.deepEqual(denied, {
    ok: false,
    status: 403,
    reason: "Manager permission required"
  });
  assert.equal(
    demo.snapshot().requests.find(({ id }) => id === "REQ-1001").status,
    "Pending approval"
  );

  demo.changeRole("manager");
  assert.deepEqual(demo.approveRequest("REQ-1001"), { ok: true, status: 200 });
  assert.equal(
    demo.snapshot().requests.find(({ id }) => id === "REQ-1001").status,
    "Approved"
  );
});

test("approval of an unknown business ID returns 404 without mutating state", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();
  demo.signInManually("Morgan Lee");
  demo.changeRole("manager");
  const before = demo.snapshot();
  let result;

  assert.doesNotThrow(() => {
    result = demo.approveRequest("REQ-DOES-NOT-EXIST");
  });
  assert.deepEqual(result, {
    ok: false,
    status: 404,
    reason: "Request not found"
  });
  assert.deepEqual(demo.snapshot(), before);
});

test("an ambiguous write persists one request even though the response is unknown", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();
  demo.signInManually("Morgan Lee");

  assert.equal(typeof demo.submitRequest, "function");

  const before = demo.snapshot().requests.length;
  const result = demo.submitRequest({
    title: "Synthetic monitor purchase",
    amount: 480,
    simulateAmbiguous: true
  });

  assert.deepEqual(result, {
    ok: false,
    status: 504,
    outcome: "unknown",
    message: "Submission outcome unknown; inspect current state before retrying"
  });
  assert.equal(demo.snapshot().requests.length, before + 1);
  assert.equal(
    demo.snapshot().requests.filter(({ title }) => title === "Synthetic monitor purchase").length,
    1
  );
});

test("generated request IDs never collide with seeded business IDs", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();
  const seededIds = new Set(demo.snapshot().requests.map(({ id }) => id));

  const first = demo.submitRequest({ title: "Generated one", amount: 10 }).request;
  const second = demo.submitRequest({ title: "Generated two", amount: 20 }).request;

  assert.equal(seededIds.has(first.id), false);
  assert.equal(seededIds.has(second.id), false);
  assert.notEqual(first.id, second.id);
});

test("cleanup exposes both success and residual data after failure", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();
  demo.signInManually("Morgan Lee");

  assert.equal(typeof demo.cleanupRequest, "function");

  const removable = demo.submitRequest({ title: "Temporary keyboard", amount: 90 });
  assert.deepEqual(demo.cleanupRequest(removable.request.id), {
    ok: true,
    status: 204,
    residual: false
  });
  assert.equal(
    demo.snapshot().requests.some(({ id }) => id === removable.request.id),
    false
  );

  const residual = demo.submitRequest({ title: "Residual dock", amount: 210 });
  assert.deepEqual(demo.cleanupRequest(residual.request.id, { simulateFailure: true }), {
    ok: false,
    status: 503,
    residual: true,
    reason: "Synthetic cleanup failure"
  });
  assert.equal(
    demo.snapshot().requests.some(({ id }) => id === residual.request.id),
    true
  );
});

test("cleanup of an unknown business ID leaves every request unchanged", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();
  const before = demo.snapshot().requests;

  assert.deepEqual(demo.cleanupRequest("REQ-DOES-NOT-EXIST"), {
    ok: false,
    status: 404,
    residual: false,
    reason: "Request not found"
  });
  assert.deepEqual(demo.snapshot().requests, before);
});

test("an external actor changes downstream state and leaves explicit audit provenance", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();

  assert.equal(typeof demo.completeExternalReview, "function");

  assert.deepEqual(demo.completeExternalReview("REQ-2002"), {
    ok: true,
    status: 200
  });

  const snapshot = demo.snapshot();
  assert.equal(
    snapshot.requests.find(({ id }) => id === "REQ-2002").status,
    "Externally reviewed"
  );
  assert.deepEqual(snapshot.audit.at(-1), {
    type: "external-review-completed",
    requestId: "REQ-2002",
    provenance: "external-person"
  });
});

test("an external review for an unknown business ID returns 404 without audit mutation", async () => {
  const { createDemoState } = await loadDomain();
  const demo = createDemoState();
  const before = demo.snapshot();
  let result;

  assert.doesNotThrow(() => {
    result = demo.completeExternalReview("REQ-DOES-NOT-EXIST");
  });
  assert.deepEqual(result, {
    ok: false,
    status: 404,
    reason: "Request not found"
  });
  assert.deepEqual(demo.snapshot(), before);
});
