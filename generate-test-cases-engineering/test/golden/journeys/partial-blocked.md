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

### Gap-001 — What verified test setup, control, or observation capability is available for refund?

- Scope: refund
- Risk: Critical
- Cause: Required test setup or observation capability is unavailable or unverified.
- Impact: one formal Test Point cannot become an executable Case.
- Required input: Verified test setup, control, or observation capability.
- Next action: What verified test setup, control, or observation capability is available for refund?
- Affected Test Points and execution decisions:
  - refund accepted — Scope: refund; Risk: Critical
    - Do not execute reason: Test operator explicitly excluded this blocked item.

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

#### <code>obligation\_c1ec33588c660235</code>

- Root issue: <code>root\_2a6eac46f2c8c418</code>
- Scope: <code>refund</code>
- Risk: <code>critical</code>
- Reason: <code>CAPABILITY\_PROVENANCE\_MISSING,CAPABILITY\_UNKNOWN</code>
- Missing type: <code>testability</code>
- Required material: claim\_refund, view\_refund#rule\_refund
- Recovery question: What verified test setup, control, or observation capability is available for refund?

### Exploratory Cases

_None._

### Coverage

#### Requirement Fact Ledger

Accounted: 2/2

| Fact | Status |
| --- | --- |
| <code>fact\_checkout</code> | <code>covered</code> |
| <code>fact\_refund</code> | <code>blocked</code> |

#### Formal Test Point Ledger

Covered: 1/2 declared

| Test Point | Disposition |
| --- | --- |
| <code>obligation\_7ad4b46aba188b77</code> | <code>grounded</code> |
| <code>obligation\_c1ec33588c660235</code> | <code>blocked</code> |

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
- Plan digest: <code>fd63351693e061b455b69e29a745ac3e88fca506800c399c1a21a3282baeb257</code>
- Semantic result digest: <code>7add87177b3d0f1bbf8a8595d3ee201f5add1617ba58d32f6a4f96452d65836a</code>
- Execute Cases: 1
- DoNotExecute Cases: 0
- DoNotExecute formal Test Points: 1
- DoNotExecute Exploratory items: 0
- Applicable Test Point execution coverage: full 1, partial 0, none 1
- Runner Case IDs: <code>case\_1c8a196253a78e34</code>

| Kind | ID | Title | True status | Execution disposition | Reason code |
| --- | --- | --- | --- | --- | --- |
| <code>case</code> | <code>case\_1c8a196253a78e34</code> | Verify checkout accepted | <code>grounded</code> | <code>execute</code> | <code>selected\_for\_run</code> |
| <code>formal\_test\_point</code> | <code>obligation\_c1ec33588c660235</code> | refund accepted | <code>blocked</code> | <code>do\_not\_execute</code> | <code>business\_rule\_missing</code> |

### Quality

- Delivery status: <code>critical\_gaps</code>
- Compiler version: <code>0.3.0</code>
- Schema version: <code>2.1.0</code>
- Semantic source digest: <code>b60dd857cefef1a4535518269ac8fafefc4678b1220d7de175fc0d3b35c278b4</code>
- Evidence semantic digest: <code>7029e94a11e1c22377f0327d276e73426d5b1276296f82a99e3678140320f3af</code>
- Behavior Views semantic digest: <code>45d668f7fbcfecda439d02ee435fc45a99aa10633e8bca677fdc140fc7addede</code>
- Test Obligations semantic digest: <code>810aa756bd7f7ce3eaf1b68b920052caf0ea296e5bf9d2ce8001f4b4c3f5aa45</code>
- Case Drafts semantic digest: <code>8118b3a7494dac9cf3ebf1eedd7ab605d6377690ba6bef59c7b9fbfb9ee3951e</code>
- Limits:
  - Compilation is limited to the supplied revision.
