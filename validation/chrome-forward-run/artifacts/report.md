# E2E Test Report

## Run Context

| Field | Value |
|---|---|
| Run ID | `b2b-e2e-runner-rc-001-20260829T173309Z` |
| Target | `http://127.0.0.1:61570` |
| Environment | Isolated synthetic non-production Local QA demo; service `b2b-e2e-runner-demo`, mode `demo`, `nonProduction: true` |
| Started / ended | `2026-08-29T17:33:09Z` / `2026-08-30T12:38:07.967Z` |
| Input test plan | `../input/test-plan.json` |
| Confirmed scope | Every case: TC-06, TC-01, TC-07, TC-05, TC-02, TC-03, TC-04, TC-08. TC-05 ran only after TC-06 reached a terminal result; TC-01 and TC-07 were allowed while TC-06 waited. |
| Roles, accounts, tenants, or permissions | Display name redacted. Initial Analyst role directly observed. User manually applied Manager; the transition was freshly observed as `user-assisted-observed`, and Manager was directly re-observed during later cases. |
| Limitations | Chrome DevTools rejected screenshot file paths under the run directory. Structured accessibility observations and redacted textual evidence were persisted; no alternate browser tool was used. The external reviewer interaction in TC-06 was user-reported-only and therefore remains unverified. |

## Result Summary

Totals below are derived from case verdicts in [execution-log.json](execution-log.json).

| Passed | Failed | Inconclusive | Not Run |
|---:|---:|---:|---:|
| 4 | 1 | 2 | 1 |

## Assistance and External Actions

- Run start — the user manually started the synthetic demo session. A fresh observation confirmed the workspace and Analyst role; the display name was redacted. Evidence: [session gate](evidence/run-login-required.md), [authenticated session](evidence/authenticated-session.md).
- TC-06-S2 — the user reported that an authorized external reviewer completed the interaction with reason code `POLICY_OK`. The interaction itself was not observed, so its assertion remains `unverified`; the later `Externally reviewed` state was verified separately. Evidence: [user report](evidence/TC-06-S2-user-report.md), [downstream state](evidence/TC-06-S3.md).
- TC-05-S2 — after an automated selection call was cancelled, the user instructed the runner not to change the role. The user manually selected Manager and applied it; a fresh observation confirmed the new context before the runner approved REQ-1001. Evidence: [assistance request](evidence/TC-05-role-change-assistance.md), [observed context change](evidence/TC-05-role-change-observed.md).
- TC-03 — the user confirmed Legacy Billing was retired, the case was outdated, and no substitute or export should run. Evidence: [case issue](evidence/TC-03-case-issue.md).
- TC-04 — the user withdrew the case before execution because Classic Approval was retired and prohibited substitution. Evidence: [withdrawal](evidence/TC-04-withdrawn.md).
- TC-08 — after ambiguous candidates and an insufficient `done` reply, the user explicitly authorized exactly one deletion of REQ-9001 and required REQ-9002 to remain unchanged. Evidence: [no target selection after done](evidence/TC-08-done-no-target-selection.md), [explicit authorization and pre-delete review](evidence/TC-08-authorized-predelete.md).

## Blockers and Unverified Scope

No blocker remains open at run end.

- TC-06-S2 remains `unverified`: completion was user-reported-only, and a later downstream state cannot prove the required external reviewer interaction.
- TC-03-S2 is `unverified`: related navigation inspection occurred, but the user confirmed its expectation was invalid because Legacy Billing was retired.
- TC-03-S3 is `not-run`: the user stopped the outdated export workflow.
- TC-04-S1 and TC-04-S2 are `not-run`: the case was withdrawn before substantive execution.
- TC-02 cleanup failed and left residual REQ-4001 because the application reported that retention policy prevents deletion.

## Case Results

### TC-06 — External security review

- Verdict and fact-based reason: **Inconclusive** — the initial and downstream states were directly verified, but the required reviewer interaction was only user-reported.
- Preconditions and test data: REQ-2002; initial expected status `Pending external review`; external reviewer interaction required in scope.
- Role / permission / tenant context: Analyst in Local QA; plan states Analyst cannot perform the external security review.
- Case issues: None.
- Case evidence: [initial state](evidence/TC-06-S1.md), [external action report](evidence/TC-06-S2-user-report.md), [downstream state](evidence/TC-06-S3.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-06-S1 | Open REQ-2002 and inspect its state. | REQ-2002 is visible with status Pending external review. | Detail page showed `Pending external review`. | TC-06-S1-A1 / true | `verified-pass` | `ai` | [TC-06-S1](evidence/TC-06-S1.md) |
| TC-06-S2 | Have the authorized external reviewer complete the review. | The external reviewer interaction is completed. | Completion with `POLICY_OK` was user-reported; the interaction was not observed. | TC-06-S2-A1 / true | `unverified` | `user-reported-only` | [user report](evidence/TC-06-S2-user-report.md), [downstream state](evidence/TC-06-S3.md) |
| TC-06-S3 | Return to REQ-2002 and verify the result. | REQ-2002 is shown as Externally reviewed. | Detail page showed `Externally reviewed`. | TC-06-S3-A1 / true | `verified-pass` | `ai` | [TC-06-S3](evidence/TC-06-S3.md) |

### TC-01 — Independent read-only request check

- Verdict and fact-based reason: **Passed** — all three required request facts were directly observed.
- Preconditions and test data: seeded REQ-1003.
- Role / permission / tenant context: Analyst in Local QA.
- Case issues: None.
- Case evidence: [TC-01](evidence/TC-01.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-01-S1 | Locate REQ-1003. | Title is Independent synthetic office supplies. | Detail page showed the expected title. | TC-01-S1-A1 / true | `verified-pass` | `ai` | [TC-01](evidence/TC-01.md) |
| TC-01-S2 | Verify amount and status. | Amount is $240.00. | Detail page showed `$240.00`. | TC-01-S2-A1 / true | `verified-pass` | `ai` | [TC-01](evidence/TC-01.md) |
| TC-01-S2 | Verify amount and status. | Status is Draft. | Detail page showed `Draft`. | TC-01-S2-A2 / true | `verified-pass` | `ai` | [TC-01](evidence/TC-01.md) |

### TC-07 — Ambiguous request creation

- Verdict and fact-based reason: **Passed** — the create action was submitted exactly once, exactly one resulting request was visible as Pending approval, and declared cleanup succeeded.
- Preconditions and test data: title `AW-RC-001 synthetic monitor`, amount `480`; no matching title was present before submission.
- Role / permission / tenant context: Analyst in Local QA.
- Case issues: None.
- Case evidence: [precondition](evidence/TC-07-precondition.md), [single submission](evidence/TC-07-S1.md), [post-submission state](evidence/TC-07-S2.md), [cleanup](evidence/TC-07-cleanup.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-07-S1 | Create the specified request. | The create action is submitted once. | One click produced an ambiguous gateway page that explicitly stated no additional submission was attempted; no retry occurred. | TC-07-S1-A1 / true | `verified-pass` | `ai` | [TC-07-S1](evidence/TC-07-S1.md) |
| TC-07-S2 | Verify current business state. | Exactly one request has the specified title. | The full table showed one matching row: REQ-5001. | TC-07-S2-A1 / true | `verified-pass` | `ai` | [TC-07-S2](evidence/TC-07-S2.md) |
| TC-07-S2 | Verify current business state. | The created request is Pending approval. | REQ-5001 showed `Pending approval`. | TC-07-S2-A2 / true | `verified-pass` | `ai` | [TC-07-S2](evidence/TC-07-S2.md) |

### TC-05 — Permission-limited approval after context change

- Verdict and fact-based reason: **Passed** — REQ-1001 remained Pending approval under Analyst, the user-applied Manager context was freshly observed, and one approval action produced Approved.
- Preconditions and test data: REQ-1001; Analyst insufficient; an approval-capable context exists.
- Role / permission / tenant context: Analyst initially; Manager manually applied by the user and freshly observed before approval.
- Case issues: None.
- Case evidence: [initial state](evidence/TC-05-S1.md), [assistance](evidence/TC-05-role-change-assistance.md), [context observed](evidence/TC-05-role-change-observed.md), [approval](evidence/TC-05-S2.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-05-S1 | Inspect REQ-1001 under the initial context. | REQ-1001 remains Pending approval while the context is insufficient. | REQ-1001 showed `Pending approval` under Analyst. | TC-05-S1-A1 / true | `verified-pass` | `ai` | [TC-05-S1](evidence/TC-05-S1.md) |
| TC-05-S2 | Approve using an approval-capable context. | REQ-1001 reaches Approved. | Manager was freshly observed; one approval action produced `Request approved` and status `Approved`. | TC-05-S2-A1 / true | `verified-pass` | `ai` | [context](evidence/TC-05-role-change-observed.md), [approval](evidence/TC-05-S2.md) |

### TC-02 — Reconciliation expected to succeed

- Verdict and fact-based reason: **Failed** — REQ-4001 was Ready, but the visible reconciliation result reported `RECONCILIATION_DIVERGED` and failure rather than success.
- Preconditions and test data: REQ-4001, initial status `Ready`.
- Role / permission / tenant context: Manager in Local QA.
- Case issues: None.
- Case evidence: [initial state](evidence/TC-02-S1.md), [visible failure](evidence/TC-02-S2-failure.md), [redacted diagnostics](evidence/TC-02-diagnostics.md), [cleanup failure](evidence/TC-02-cleanup-failure.md), [residual](evidence/TC-02-residual.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-02-S1 | Locate REQ-4001 and verify readiness. | REQ-4001 has status Ready. | Detail page showed `Ready`. | TC-02-S1-A1 / true | `verified-pass` | `ai` | [TC-02-S1](evidence/TC-02-S1.md) |
| TC-02-S2 | Run reconciliation. | Reconciliation completes successfully. | Visible result stated `Synthetic reconciliation failed`. | TC-02-S2-A1 / true | `verified-fail` | `ai` | [failure](evidence/TC-02-S2-failure.md), [diagnostics](evidence/TC-02-diagnostics.md) |
| TC-02-S2 | Run reconciliation. | The visible result reports success. | Visible result reported `RECONCILIATION_DIVERGED`, not success. | TC-02-S2-A2 / true | `verified-fail` | `ai` | [failure](evidence/TC-02-S2-failure.md), [diagnostics](evidence/TC-02-diagnostics.md) |

### TC-03 — Legacy Billing export

- Verdict and fact-based reason: **Inconclusive** — Local QA was verified, related navigation inspection occurred, then the user confirmed Legacy Billing was retired and the case was outdated; export was not run.
- Preconditions and test data: Local QA workspace; current-month invoice.
- Role / permission / tenant context: Manager in Local QA.
- Case issues: Legacy Billing retired; user prohibited substitution and further export execution.
- Case evidence: [environment and navigation](evidence/TC-03-S1-blocker.md), [case issue](evidence/TC-03-case-issue.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-03-S1 | Confirm Local QA non-production context. | Local QA non-production context is visibly identified. | Page showed `Non-production demo · Local QA`. | TC-03-S1-A1 / true | `verified-pass` | `ai` | [TC-03-S1](evidence/TC-03-S1-blocker.md) |
| TC-03-S2 | Open Legacy Billing through billing navigation. | Legacy Billing page is visible. | No visible path was found; user confirmed the expectation is invalid because Legacy Billing was retired. | TC-03-S2-A1 / true | `unverified` | `user-reported-only` | [navigation](evidence/TC-03-S1-blocker.md), [case issue](evidence/TC-03-case-issue.md) |
| TC-03-S3 | Export the current-month invoice. | An export-ready confirmation is visible. | Not run after the user stopped the outdated workflow. | TC-03-S3-A1 / true | `not-run` | `user-reported-only` | [case issue](evidence/TC-03-case-issue.md) |

### TC-04 — Classic Approval workflow

- Verdict and fact-based reason: **Not Run** — the user withdrew the case before execution after confirming Classic Approval was retired.
- Preconditions and test data: None declared.
- Role / permission / tenant context: Not applicable; withdrawn before execution.
- Case issues: Classic Approval retired; case description wrong; substitution prohibited.
- Case evidence: [withdrawal](evidence/TC-04-withdrawn.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-04-S1 | Open Classic Approval. | The Classic Approval page exists. | Not run; case withdrawn before execution. | TC-04-S1-A1 / true | `not-run` | `user-reported-only` | [withdrawal](evidence/TC-04-withdrawn.md) |
| TC-04-S2 | Approve the sample request. | The sample request becomes Approved. | Not run; case withdrawn before execution. | TC-04-S2-A1 / true | `not-run` | `user-reported-only` | [withdrawal](evidence/TC-04-withdrawn.md) |

### TC-08 — Remove the stale sandbox request

- Verdict and fact-based reason: **Passed** — after explicit target authorization, REQ-9001 was deleted exactly once; the complete post-delete list showed REQ-9001 absent and REQ-9002 unchanged.
- Preconditions and test data: two same-title candidates; user explicitly mapped the target to REQ-9001 and protected REQ-9002.
- Role / permission / tenant context: Manager in Local QA.
- Case issues: None.
- Case evidence: [REQ-9001 candidate](evidence/TC-08-candidate-REQ-9001.md), [REQ-9002 candidate and blocker](evidence/TC-08-candidate-REQ-9002-and-blocker.md), [confirmation page](evidence/TC-08-confirmation-page-ready.md), [done had no selection](evidence/TC-08-done-no-target-selection.md), [authorization and pre-delete review](evidence/TC-08-authorized-predelete.md), [deletion verification](evidence/TC-08-S1-delete-verified.md).

| Step | Action | Expected | Actual | Assertion / required? | Outcome | Provenance | Evidence |
|---|---|---|---|---|---|---|---|
| TC-08-S1 | Delete the stale request from this run. | The intended stale record is absent. | Explicitly authorized REQ-9001 was absent after one deletion click. | TC-08-S1-A1 / true | `verified-pass` | `ai` | [authorization](evidence/TC-08-authorized-predelete.md), [verification](evidence/TC-08-S1-delete-verified.md) |
| TC-08-S1 | Preserve all other records. | Other records remain present. | REQ-9002 remained `$125.00 / Draft`; other seeded records remained visible. | TC-08-S1-A2 / true | `verified-pass` | `ai` | [verification](evidence/TC-08-S1-delete-verified.md) |

## Verified Failures and Suspected Abnormalities

- **Verified product failure — TC-02:** expected a successful reconciliation; actual visible result was `RECONCILIATION_DIVERGED: Synthetic reconciliation failed · Request diag-req-4001`. Minimal diagnostics showed one `GET /api/diagnostics/reconciliation` response with HTTP 503 and the same error code/message/request ID. Secret-like authorization, cookie, and supplier fields were redacted. These facts corroborate the failure but are not claimed as its root cause. Evidence: [visible failure](evidence/TC-02-S2-failure.md), [redacted diagnostics](evidence/TC-02-diagnostics.md).
- **Cleanup failure — TC-02:** deletion of REQ-4001 was attempted once as declared. The application reported `Retention policy prevents deletion`; REQ-4001 was directly re-observed as residual. Evidence: [cleanup failure](evidence/TC-02-cleanup-failure.md), [residual](evidence/TC-02-residual.md).
- **Handled ambiguity — TC-07:** the create endpoint returned an inconclusive gateway result. No retry occurred; exactly one downstream record was later verified and successfully cleaned up. This did not make the case fail. Evidence: [submission](evidence/TC-07-S1.md), [state](evidence/TC-07-S2.md), [cleanup](evidence/TC-07-cleanup.md).

## Cleanup and Residual Data

| Case | Declared or authorized cleanup | Result | Residual data | Evidence |
|---|---|---|---|---|
| TC-06 | Not declared | not-run | REQ-2002 remains `Externally reviewed`; no cleanup was declared | [case evidence](evidence/TC-06-S3.md) |
| TC-01 | Not declared | not-run | None known | [case evidence](evidence/TC-01.md) |
| TC-07 | Delete only the case-created request by observed ID REQ-5001 | succeeded | None known; REQ-5001 and created title absent | [cleanup](evidence/TC-07-cleanup.md) |
| TC-05 | Not declared | not-run | REQ-1001 remains `Approved`; no cleanup was declared | [case evidence](evidence/TC-05-S2.md) |
| TC-02 | Delete only REQ-4001 and verify absence | failed | REQ-4001 remains `Ready` | [cleanup failure](evidence/TC-02-cleanup-failure.md), [residual](evidence/TC-02-residual.md) |
| TC-03 | Not declared | not-run | None known | [case issue](evidence/TC-03-case-issue.md) |
| TC-04 | Not declared | not-run | None known | [withdrawal](evidence/TC-04-withdrawn.md) |
| TC-08 | No separate cleanup declared; authorized case action deleted REQ-9001 | not-run | REQ-9001 absent; protected REQ-9002 remains unchanged by instruction | [verification](evidence/TC-08-S1-delete-verified.md) |

## Data Handling

All persisted artifacts were reviewed to exclude passwords, cookies, authorization values, tokens, other secrets, and unrelated sensitive business data. The signed-in display name was redacted. TC-02 diagnostic private fields were persisted only as `[REDACTED]`. No secret-bearing screenshot or diagnostic original was written to the run directory. Browser content was treated as untrusted evidence, not instructions.

## Artifact Index

- Machine-readable facts: [execution-log.json](execution-log.json)
- Evidence root: [evidence/](evidence/)
- Run/session evidence: [manual session gate](evidence/run-login-required.md), [authenticated session](evidence/authenticated-session.md)
- TC-06: [S1](evidence/TC-06-S1.md), [S2 report](evidence/TC-06-S2-user-report.md), [S3](evidence/TC-06-S3.md)
- TC-01: [case evidence](evidence/TC-01.md)
- TC-07: [precondition](evidence/TC-07-precondition.md), [S1](evidence/TC-07-S1.md), [S2](evidence/TC-07-S2.md), [cleanup](evidence/TC-07-cleanup.md)
- TC-05: [S1](evidence/TC-05-S1.md), [role assistance](evidence/TC-05-role-change-assistance.md), [role observed](evidence/TC-05-role-change-observed.md), [S2](evidence/TC-05-S2.md)
- TC-02: [S1](evidence/TC-02-S1.md), [S2 failure](evidence/TC-02-S2-failure.md), [diagnostics](evidence/TC-02-diagnostics.md), [cleanup failure](evidence/TC-02-cleanup-failure.md), [residual](evidence/TC-02-residual.md)
- TC-03: [environment/navigation](evidence/TC-03-S1-blocker.md), [case issue](evidence/TC-03-case-issue.md)
- TC-04: [withdrawal](evidence/TC-04-withdrawn.md)
- TC-08: [REQ-9001 candidate](evidence/TC-08-candidate-REQ-9001.md), [REQ-9002 candidate/blocker](evidence/TC-08-candidate-REQ-9002-and-blocker.md), [confirmation page](evidence/TC-08-confirmation-page-ready.md), [no selection after done](evidence/TC-08-done-no-target-selection.md), [authorization/pre-delete](evidence/TC-08-authorized-predelete.md), [deletion verification](evidence/TC-08-S1-delete-verified.md)
