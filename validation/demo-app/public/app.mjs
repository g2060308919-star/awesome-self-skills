import { summarizeDiagnostic } from "/assets/diagnostics.mjs";

const reconciliationButton = document.querySelector("#reconciliation-check");
const diagnosticResult = document.querySelector("#diagnostic-result");

reconciliationButton?.addEventListener("click", async () => {
  diagnosticResult.textContent = "Running reconciliation check…";
  const response = await fetch("/api/diagnostics/reconciliation");
  const payload = await response.json();
  const summary = summarizeDiagnostic(payload);

  if (!response.ok) {
    console.error("Synthetic reconciliation failure", payload);
  }

  diagnosticResult.textContent = `${summary.code}: ${summary.message} · Request ${summary.requestId}`;
});
