# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. This plan contains no test results or defect verdicts.
- Readiness: No applicable formal test points
- Requirement accounting: 0/0
- Formal Test Points covered: 0/0
- Grounded executable coverage: 0/0
- Execute Cases: 0
- Do not execute Cases: 0
- Blocked formal Test Points: 0
- NotApplicable exclusions: 0

## Execution Overview

| Case | Title | Scope | Risk | Role | Decision |
| --- | --- | --- | --- | --- | --- |

## Cases to Execute

_None._

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

- Explore latency — Scope: checkout; Risk: Medium; Status: exploratory only and outside formal coverage.
  - Do not execute reason: Test operator explicitly excluded this exploratory item.

## Manual Execution Worksheet

Generated, not executed. Record results downstream and bind each record to the delivered bundle digest + stable Case ID listed in the Audit Appendix.

| Case | Title | Scope | Risk | Role | Result | Defect | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Audit Appendix

- Schema version: <code>2.1.0</code>
- Source revision: <code>2</code>

### Grounded Cases

_None._

### Conditional Cases

_None._

### Blocked Formal Test Points

_None._

### Exploratory Cases

#### <code>exploratory\_latency</code> — Explore latency

- Scope: <code>checkout</code>
- Risk: <code>medium</code>
- Reason: Risk hypothesis outside formal Test Point coverage; evidence: claim\_latency

### Coverage

#### Requirement Fact Ledger

Accounted: 0/0

| Fact | Status |
| --- | --- |

#### Formal Test Point Ledger

Covered: 0/0 declared

| Test Point | Disposition |
| --- | --- |

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
- Plan digest: <code>26e0c9ae6cfae5c069b6bcfe83176dbc432976a48fed8d2f99f795a9329c2d74</code>
- Semantic result digest: <code>19ea2fd85d858ca836e6bd3a7b50f520568b1881f5ca759ccfd762aea37cc570</code>
- Execute Cases: 0
- DoNotExecute Cases: 0
- DoNotExecute formal Test Points: 0
- DoNotExecute Exploratory items: 1
- Applicable Test Point execution coverage: full 0, partial 0, none 0
- Runner Case IDs: _None._

| Kind | ID | Title | True status | Execution disposition | Reason code |
| --- | --- | --- | --- | --- | --- |
| <code>exploratory</code> | <code>exploratory\_latency</code> | Explore latency | <code>exploratory</code> | <code>do\_not\_execute</code> | <code>risk\_not\_adopted</code> |

### Quality

- Delivery status: <code>no\_applicable\_formal\_test\_points</code>
- Compiler version: <code>0.3.0</code>
- Schema version: <code>2.1.0</code>
- Semantic source digest: <code>b60dd857cefef1a4535518269ac8fafefc4678b1220d7de175fc0d3b35c278b4</code>
- Evidence semantic digest: <code>e0bb268b3cd166669dbdd381bd4d4ccf14da2254b371e54a8b8a622fd1e32442</code>
- Behavior Views semantic digest: <code>ced8110aad7dbde7d08a469a8abab6e0b70f12aa78a9d92fde11047f60a39343</code>
- Test Obligations semantic digest: <code>3678e64f0358721a01f1d7102426a116c442f7bc06bf1aad6906a64fdc8cedb9</code>
- Case Drafts semantic digest: <code>58a0e32be72c2e6bd277c81ccc469e2054a84a38b181b0e77884c62cee99764c</code>
- Limits:
  - Compilation is limited to the supplied revision.
