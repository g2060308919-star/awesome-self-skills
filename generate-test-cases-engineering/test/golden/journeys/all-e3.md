# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. This plan contains no test results or defect verdicts.
- Readiness: Executable subset ready
- Requirement accounting: 1/1
- Formal Test Points covered: 1/1
- Grounded executable coverage: 1/1
- Execute Cases: 1
- Do not execute Cases: 0
- Blocked formal Test Points: 0
- NotApplicable exclusions: 0

## Execution Overview

| Case | Title | Scope | Risk | Role | Decision |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Verify checkout accepted | checkout | High | tester | Execute |

## Cases to Execute

### TC-001 — Verify checkout accepted

- Scope: checkout
- Risk: High
- Role: tester
- Evidence status: Grounded
- Execution decision: Execute

#### Preconditions

1. checkout is ready (reachable from: revision start)

#### Test Data

- scenario input = <code>checkout</code> — Origin: Requirement

#### Steps and Expected Results

1. Exercise checkout
   - Expected: checkout accepted
   - Observe: tester via UI → result
   - Oracle: state equals <code>checkout accepted</code>

#### Post-state and Cleanup

- Post-state: checkout accepted
- Cleanup: none — The scenario is isolated.

## Cases Not Selected

_None._

## Business Rule Gaps

_None._

## Execution Preparation Gaps

_None._

## Source and Evidence Gaps

_None._

## Scope Exclusions (NotApplicable)

_None._

## Exploratory Risks

_None._

## Manual Execution Worksheet

Generated, not executed. Record results downstream and bind each record to the delivered bundle digest + stable Case ID listed in the Audit Appendix.

| Case | Title | Scope | Risk | Role | Result | Defect | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-001 | Verify checkout accepted | checkout | High | tester | Not recorded | — | — |

## Audit Appendix

- Schema version: <code>2.1.0</code>
- Source revision: <code>1</code>

### Grounded Cases

#### <code>case\_1c8a196253a78e34</code> — Verify checkout accepted

- Scope: <code>checkout</code>
- Risk: <code>high</code>
- Role: tester (evidence: <code>claim\_checkout</code>)
- Requirement facts: <code>fact\_checkout</code>
- Formal Test Points: <code>obligation\_7ad4b46aba188b77</code>
- Evidence references: <code>claim\_checkout</code>

##### Preconditions

1. checkout is ready (reachable from: revision start; evidence: <code>claim\_checkout</code>)

##### Test Data

- scenario input = <code>checkout</code> (origin: requirement; evidence: <code>claim\_checkout</code>)

##### Steps and Oracles

1. <code>step\_checkout</code> — Exercise checkout (evidence: <code>claim\_checkout</code>)
   - <code>expectation\_f0d1ffa72c24afa5</code>: checkout accepted
     - Observe: tester via UI → result
     - Oracle: state equals <code>checkout accepted</code>
     - Evidence: <code>claim\_checkout</code>

##### Post-state and Cleanup

- Post-state: checkout accepted (evidence: <code>claim\_checkout</code>)
- Cleanup: none — The scenario is isolated. (evidence: <code>claim\_checkout</code>)

### Conditional Cases

_None._

### Blocked Formal Test Points

_None._

### Exploratory Cases

_None._

### Coverage

#### Requirement Fact Ledger

Accounted: 1/1

| Fact | Status |
| --- | --- |
| <code>fact\_checkout</code> | <code>covered</code> |

#### Formal Test Point Ledger

Covered: 1/1 declared

| Test Point | Disposition |
| --- | --- |
| <code>obligation\_7ad4b46aba188b77</code> | <code>grounded</code> |

#### Grounded Executable Ledger

Grounded: 1/1

| Test Point | Case |
| --- | --- |
| <code>obligation\_7ad4b46aba188b77</code> | <code>case\_1c8a196253a78e34</code> |

#### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall is benchmark-only.

#### NotApplicable (excluded from the coverage numerator)

_None._

### Execution Plan

- Status: <code>ready</code>
- Plan digest: <code>89c5ac8341b4fef4a5584fdb96dd45b2804a772c6178277f63319571953b71a4</code>
- Semantic result digest: <code>9477c0b3889a6ae55ada731aa4a9a6e03c4e2e7e310e5673807e8d75dfb22b4e</code>
- Execute Cases: 1
- DoNotExecute Cases: 0
- DoNotExecute formal Test Points: 0
- DoNotExecute Exploratory items: 0
- Applicable Test Point execution coverage: full 1, partial 0, none 0
- Runner Case IDs: <code>case\_1c8a196253a78e34</code>

| Kind | ID | Title | True status | Execution disposition | Reason code |
| --- | --- | --- | --- | --- | --- |
| <code>case</code> | <code>case\_1c8a196253a78e34</code> | Verify checkout accepted | <code>grounded</code> | <code>execute</code> | <code>selected\_for\_run</code> |

### Quality

- Delivery status: <code>executable\_subset\_ready</code>
- Compiler version: <code>0.3.0</code>
- Schema version: <code>2.1.0</code>
- Semantic source digest: <code>b60dd857cefef1a4535518269ac8fafefc4678b1220d7de175fc0d3b35c278b4</code>
- Evidence semantic digest: <code>e3527c27508cd29aa58b4dd36790ef77a140291578e143007df03ce040118f02</code>
- Behavior Views semantic digest: <code>df97e3bda12991a157b0965e0e12e124388ec21e0e9cfd60f86009a4baf9aa4a</code>
- Test Obligations semantic digest: <code>2ca67bbd94c003dacadcda5140b349af9818b37b2159fa8c137be9464527d7aa</code>
- Case Drafts semantic digest: <code>05dd15b6082404581b7487c4937f3a7a6d645d5c159bd4f73a45334d6539c865</code>
- Limits:
  - Compilation is limited to the supplied revision.
