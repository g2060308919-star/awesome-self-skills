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
- Source revision: <code>2</code>

### Grounded Cases

#### <code>case\_1c8a196253a78e34</code> — Verify checkout accepted

- Scope: <code>checkout</code>
- Risk: <code>high</code>
- Role: tester (evidence: <code>claim\_checkout</code>)
- Requirement facts: <code>fact\_checkout</code>
- Formal Test Points: <code>obligation\_a1d383c412180df9</code>
- Evidence references: <code>claim\_checkout</code>

##### Preconditions

1. checkout is ready (reachable from: revision start; evidence: <code>claim\_checkout</code>)

##### Test Data

- scenario input = <code>checkout</code> (origin: requirement; evidence: <code>claim\_checkout</code>)

##### Steps and Oracles

1. <code>step\_checkout</code> — Exercise checkout (evidence: <code>claim\_checkout</code>)
   - <code>expectation\_9f914c210eb97186</code>: checkout accepted
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
| <code>obligation\_a1d383c412180df9</code> | <code>grounded</code> |

#### Grounded Executable Ledger

Grounded: 1/1

| Test Point | Case |
| --- | --- |
| <code>obligation\_a1d383c412180df9</code> | <code>case\_1c8a196253a78e34</code> |

#### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall is benchmark-only.

#### NotApplicable (excluded from the coverage numerator)

_None._

### Execution Plan

- Status: <code>ready</code>
- Plan digest: <code>95c47ea8a130de5a84c8f7c5fd1eb7817be2e6ec555a5b96925ab143e35f1fed</code>
- Semantic result digest: <code>0e476b839ddbf8fdbb5a323af8096ae6f8edf2e1fc234ddf5949be5573de1eac</code>
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
- Semantic source digest: <code>fa3b941786b917649cdda715b2943c734a70b2765abe0ac0e655357cace9f584</code>
- Evidence semantic digest: <code>ee2c64cd88d9d87569d5c967285c680aea004cbce465a922d154da32a17daf4b</code>
- Behavior Views semantic digest: <code>4cea72d5f99d737f48ac4a10b6dbaa4ad77d1c8875a21a9e9bfdc9bee40044b7</code>
- Test Obligations semantic digest: <code>47567cf358a0e745e630c6d136f21e780aa818a8b2adaa2d46e0637d805ae38d</code>
- Case Drafts semantic digest: <code>9f278b174a682a55fe2f1c5c9df98270d292ba77181ba19069f160c7f4d4255e</code>
- Limits:
  - Compilation is limited to the supplied revision.
