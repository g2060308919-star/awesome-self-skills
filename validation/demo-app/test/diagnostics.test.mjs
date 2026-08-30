import assert from "node:assert/strict";
import test from "node:test";

async function loadDiagnostics() {
  try {
    return await import("../src/diagnostics.mjs");
  } catch {
    return {};
  }
}

test("the browser-visible diagnostic summary excludes secret-bearing fields", async () => {
  const { summarizeDiagnostic } = await loadDiagnostics();
  assert.equal(typeof summarizeDiagnostic, "function");

  const summary = summarizeDiagnostic({
    error: {
      code: "RECONCILIATION_DIVERGED",
      message: "Synthetic reconciliation failed",
      requestId: "diag-req-4001"
    },
    privateDiagnostic: {
      authorization: "Bearer DEMO-TOKEN-CANARY-8472",
      cookie: "session=DEMO-COOKIE-CANARY-5193",
      supplierTaxId: "DEMO-CLIENT-CANARY-6021"
    }
  });

  assert.deepEqual(summary, {
    level: "error",
    code: "RECONCILIATION_DIVERGED",
    message: "Synthetic reconciliation failed",
    requestId: "diag-req-4001",
    redactedFields: ["authorization", "cookie", "supplierTaxId"]
  });
  assert.doesNotMatch(JSON.stringify(summary), /CANARY/);
});
