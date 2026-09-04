# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. This plan contains no test results or defect verdicts.
- Readiness: Executable subset ready
- Requirement accounting: 1/1
- Formal Test Points covered: 1/1
- Grounded executable coverage: 0/0
- Execute Cases: 0
- Do not execute Cases: 1
- Blocked formal Test Points: 0
- NotApplicable exclusions: 0

## Execution Overview

| Case | Title | Scope | Risk | Role | Decision |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Verify checkout accepted | checkout | High | tester | Do not execute |

## Cases to Execute

_None._

## Cases Not Selected

### TC-001 — Verify checkout accepted

- Scope: checkout
- Risk: High
- Role: tester
- Evidence status: Conditional
- Execution decision: Do not execute
- Temporary assumption: valid only until A final rule replaces this temporary decision.
- Do not execute reason: Test operator explicitly excluded this conditional item.

#### Preconditions

1. checkout is ready (reachable from: revision start)

#### Test Data

- scenario input = <code>checkout</code> — Origin: Temporary assumption

#### Steps and Expected Results

1. Exercise checkout
   - Expected: checkout accepted
   - Observe: tester via UI → result
   - Oracle: state equals <code>checkout accepted</code>

#### Post-state and Cleanup

- Post-state: checkout accepted
- Cleanup: none — The scenario is isolated.

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

## Audit Appendix

- Schema version: <code>2.1.0</code>
- Source revision: <code>3</code>

### Grounded Cases

_None._

### Conditional Cases

#### <code>case\_1c8a196253a78e34</code> — Verify checkout accepted

- Scope: <code>checkout</code>
- Risk: <code>high</code>
- Role: tester (evidence: <code>claim\_checkout</code>)
- Requirement facts: <code>fact\_checkout</code>
- Formal Test Points: <code>obligation\_a1d383c412180df9</code>
- Evidence references: <code>claim\_checkout</code>
- Temporary assumption: <code>claim\_checkout</code>; invalid when A final rule replaces this temporary decision.

##### Preconditions

1. checkout is ready (reachable from: revision start; evidence: <code>claim\_checkout</code>)

##### Test Data

- scenario input = <code>checkout</code> (origin: temporary\_assumption; evidence: <code>claim\_checkout</code>)

##### Steps and Oracles

1. <code>step\_checkout</code> — Exercise checkout (evidence: <code>claim\_checkout</code>)
   - <code>expectation\_9f914c210eb97186</code>: checkout accepted
     - Observe: tester via UI → result
     - Oracle: state equals <code>checkout accepted</code>
     - Evidence: <code>claim\_checkout</code>

##### Post-state and Cleanup

- Post-state: checkout accepted (evidence: <code>claim\_checkout</code>)
- Cleanup: none — The scenario is isolated. (evidence: <code>claim\_checkout</code>)

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
| <code>obligation\_a1d383c412180df9</code> | <code>conditional</code> |

#### Grounded Executable Ledger

Grounded: 0/0

| Test Point | Case |
| --- | --- |

#### Expert Recall Ledger

Status: <code>benchmark\_only</code>
- Expert recall is benchmark-only.

#### NotApplicable (excluded from the coverage numerator)

_None._

### Execution Plan

- Status: <code>ready</code>
- Plan digest: <code>833271543edf4f7cc594ffb0498586fcacc9605fbf24484b5c52e0312d64c71b</code>
- Semantic result digest: <code>4b529d163372d84af68dfaf9e35d508574abbd20331b867b00e1de6b7a4f780d</code>
- Execute Cases: 0
- DoNotExecute Cases: 1
- DoNotExecute formal Test Points: 0
- DoNotExecute Exploratory items: 0
- Applicable Test Point execution coverage: full 0, partial 0, none 1
- Runner Case IDs: _None._

| Kind | ID | Title | True status | Execution disposition | Reason code |
| --- | --- | --- | --- | --- | --- |
| <code>case</code> | <code>case\_1c8a196253a78e34</code> | Verify checkout accepted | <code>conditional</code> | <code>do\_not\_execute</code> | <code>temporary\_rule\_unconfirmed</code> |

### Quality

- Delivery status: <code>executable\_subset\_ready</code>
- Compiler version: <code>0.3.0</code>
- Schema version: <code>2.1.0</code>
- Semantic source digest: <code>dce4aa4b664ee8f7fbd556b5a90395b799774cfaa1f7a389fcdd3283f1c39e37</code>
- Evidence semantic digest: <code>66399ed9996f3d73054a965c50e98d813437571b4135e8d212b6bad9f3d77995</code>
- Behavior Views semantic digest: <code>4cea72d5f99d737f48ac4a10b6dbaa4ad77d1c8875a21a9e9bfdc9bee40044b7</code>
- Test Obligations semantic digest: <code>47567cf358a0e745e630c6d136f21e780aa818a8b2adaa2d46e0637d805ae38d</code>
- Case Drafts semantic digest: <code>2bfac734dd9951886eb3664aef0dd95b0c2d1d35158e9ae835e2186ec4899819</code>
- Limits:
  - Compilation is limited to the supplied revision.
