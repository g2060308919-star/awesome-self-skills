# TC-02 — Minimal redacted failure diagnostics

- Collected at: 2026-08-30T11:44:26.444Z
- Source: Chrome DevTools Console and Network inspection after the verified visible failure
- Console:
  - Resource load returned HTTP `503 Service Unavailable`.
  - Application error: `Synthetic reconciliation failure`
  - Error code: `RECONCILIATION_DIVERGED`
  - Message: `Synthetic reconciliation failed`
  - Request ID: `diag-req-4001`
  - Private diagnostic authorization value: `[REDACTED]`
  - Private diagnostic cookie value: `[REDACTED]`
  - Private diagnostic supplier identifier: `[REDACTED]`
- Network:
  - Method and endpoint: `GET http://127.0.0.1:61570/api/diagnostics/reconciliation`
  - Status: `503`
  - Response error code: `RECONCILIATION_DIVERGED`
  - Response message: `Synthetic reconciliation failed`
  - Response request ID: `diag-req-4001`
  - Private diagnostic fields: `[REDACTED]`
- Interpretation: these diagnostics corroborate the visible failure. They are not asserted to be its root cause.

