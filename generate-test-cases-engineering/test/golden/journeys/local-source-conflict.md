# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. This plan contains no test results or defect verdicts.
- Readiness: Critical gaps
- Requirement accounting: 2/2
- Formal Test Points covered: 1/2
- Grounded executable coverage: 1/1
- Execute Cases: 1
- Do not execute Cases: 0
- Blocked formal Test Points: 1
- NotApplicable exclusions: 0

## Execution Overview

| Case | Title | Scope | Risk | Role | Decision |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Verify shipping confirmed | checkout.shipping | High | tester | Execute |

## Cases to Execute

### TC-001 — Verify shipping confirmed

- Scope: checkout.shipping
- Risk: High
- Role: tester
- Evidence status: Grounded
- Execution decision: Execute

#### Preconditions

1. shipping is ready (reachable from: revision start)

#### Test Data

- scenario input = <code>shipping</code> — Origin: Requirement

#### Steps and Expected Results

1. Exercise shipping
   - Expected: shipping confirmed
   - Observe: tester via UI → result
   - Oracle: state equals <code>shipping confirmed</code>

#### Post-state and Cleanup

- Post-state: shipping confirmed
- Cleanup: none — The scenario is isolated.

## Cases Not Selected

_None._

## Business Rule Gaps

_None._

## Execution Preparation Gaps

_None._

## Source and Evidence Gaps

### Gap-001 — Which authoritative source rule applies to checkout.payment?

- Scope: checkout.payment
- Risk: Critical
- Cause: Source evidence is missing, ambiguous, conflicting, or lacks the required authority.
- Impact: one formal Test Point cannot become an executable Case.
- Required input: Authoritative source evidence that resolves the ambiguity or conflict.
- Next action: Which authoritative source rule applies to checkout.payment?
- Affected Test Points and execution decisions:
  - payment settles in two days — Scope: checkout.payment; Risk: Critical
    - Do not execute reason: Test operator explicitly excluded this blocked item.

## Scope Exclusions (NotApplicable)

_None._

## Exploratory Risks

_None._

## Manual Execution Worksheet

Generated, not executed. Record results downstream and bind each record to the delivered bundle digest + stable Case ID listed in the Audit Appendix.

| Case | Title | Scope | Risk | Role | Result | Defect | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-001 | Verify shipping confirmed | checkout.shipping | High | tester | Not recorded | — | — |

## Audit Appendix

- Schema version: <code>2.1.0</code>
- Source revision: <code>3</code>

### Grounded Cases

#### <code>case\_07b6a31d7e08b43f</code> — Verify shipping confirmed

- Scope: <code>checkout.shipping</code>
- Risk: <code>high</code>
- Role: tester (evidence: <code>claim\_shipping</code>)
- Requirement facts: <code>fact\_shipping</code>
- Formal Test Points: <code>obligation\_96bd8760ebfe5988</code>
- Evidence references: <code>claim\_shipping</code>

##### Preconditions

1. shipping is ready (reachable from: revision start; evidence: <code>claim\_shipping</code>)

##### Test Data

- scenario input = <code>shipping</code> (origin: requirement; evidence: <code>claim\_shipping</code>)

##### Steps and Oracles

1. <code>step\_shipping</code> — Exercise shipping (evidence: <code>claim\_shipping</code>)
   - <code>expectation\_0345aca2b5b139ea</code>: shipping confirmed
     - Observe: tester via UI → result
     - Oracle: state equals <code>shipping confirmed</code>
     - Evidence: <code>claim\_shipping</code>

##### Post-state and Cleanup

- Post-state: shipping confirmed (evidence: <code>claim\_shipping</code>)
- Cleanup: none — The scenario is isolated. (evidence: <code>claim\_shipping</code>)

### Conditional Cases

_None._

### Blocked Formal Test Points

#### <code>obligation\_6ad76eb85c53a5f3</code>

- Root issue: <code>root\_8ff3a1ca4f4e9795</code>
- Scope: <code>checkout.payment</code>
- Risk: <code>critical</code>
- Reason: <code>UNRESOLVED\_CONFLICT</code>
- Missing type: <code>source-conflict</code>
- Required material: claim\_payment, unresolved-source-policy, view\_payment#rule\_payment
- Recovery question: Which authoritative source rule applies to checkout.payment?

### Exploratory Cases

_None._

### Coverage

#### Requirement Fact Ledger

Accounted: 2/2

| Fact | Status |
| --- | --- |
| <code>fact\_payment</code> | <code>blocked</code> |
| <code>fact\_shipping</code> | <code>covered</code> |

#### Formal Test Point Ledger

Covered: 1/2 declared

| Test Point | Disposition |
| --- | --- |
| <code>obligation\_6ad76eb85c53a5f3</code> | <code>blocked</code> |
| <code>obligation\_96bd8760ebfe5988</code> | <code>grounded</code> |

#### Grounded Executable Ledger

Grounded: 1/1

| Test Point | Case |
| --- | --- |
| <code>obligation\_96bd8760ebfe5988</code> | <code>case\_07b6a31d7e08b43f</code> |

#### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall is benchmark-only.

#### NotApplicable (excluded from the coverage numerator)

_None._

### Execution Plan

- Status: <code>ready</code>
- Plan digest: <code>16a15019fc1c6f4af0d8ef3608f2072c67342399639f652d7553b91ca6ff2edb</code>
- Semantic result digest: <code>b77dd22f95550e5896432e152db339961f7fd807fbaf42298e5a27cde7267ac1</code>
- Execute Cases: 1
- DoNotExecute Cases: 0
- DoNotExecute formal Test Points: 1
- DoNotExecute Exploratory items: 0
- Applicable Test Point execution coverage: full 1, partial 0, none 1
- Runner Case IDs: <code>case\_07b6a31d7e08b43f</code>

| Kind | ID | Title | True status | Execution disposition | Reason code |
| --- | --- | --- | --- | --- | --- |
| <code>case</code> | <code>case\_07b6a31d7e08b43f</code> | Verify shipping confirmed | <code>grounded</code> | <code>execute</code> | <code>selected\_for\_run</code> |
| <code>formal\_test\_point</code> | <code>obligation\_6ad76eb85c53a5f3</code> | payment settles in two days | <code>blocked</code> | <code>do\_not\_execute</code> | <code>business\_rule\_missing</code> |

### Quality

- Delivery status: <code>critical\_gaps</code>
- Compiler version: <code>0.3.0</code>
- Schema version: <code>2.1.0</code>
- Semantic source digest: <code>58188126f0705a097c0b15b79a9b076dcc72c832eef62cf05bcc8336e09cd80a</code>
- Evidence semantic digest: <code>08b5cdbabff9148a86f8c55228a51f1a48871fea65afb3d08cbab9d247e2148d</code>
- Behavior Views semantic digest: <code>e5f287b6f0b236adce6a690562c74ab783d9652f82d509036ca51c2ea63d57b5</code>
- Test Obligations semantic digest: <code>48541705d7b06f98dc0c3f6947d14c140a52d5e1d7d503654103bf251276b0e5</code>
- Case Drafts semantic digest: <code>8d8620f2f13937d7c7081043f60b75105c0539313bb60ca67815da333efb70fc</code>
- Limits:
  - Compilation is limited to the supplied revision.
