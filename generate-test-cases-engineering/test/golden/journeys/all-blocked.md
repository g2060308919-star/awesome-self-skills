# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. This plan contains no test results or defect verdicts.
- Readiness: No deterministic cases
- Requirement accounting: 1/1
- Formal Test Points covered: 0/1
- Grounded executable coverage: 0/0
- Execute Cases: 0
- Do not execute Cases: 0
- Blocked formal Test Points: 1
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

### Gap-001 — What verified test setup, control, or observation capability is available for refund?

- Scope: refund
- Risk: High
- Cause: Required test setup or observation capability is unavailable or unverified.
- Impact: one formal Test Point cannot become an executable Case.
- Required input: Verified test setup, control, or observation capability.
- Next action: What verified test setup, control, or observation capability is available for refund?
- Affected Test Points and execution decisions:
  - refund accepted — Scope: refund; Risk: High
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

## Audit Appendix

- Schema version: <code>2.1.0</code>
- Source revision: <code>2</code>

### Grounded Cases

_None._

### Conditional Cases

_None._

### Blocked Formal Test Points

#### <code>obligation\_c1ec33588c660235</code>

- Root issue: <code>root\_2a6eac46f2c8c418</code>
- Scope: <code>refund</code>
- Risk: <code>high</code>
- Reason: <code>CAPABILITY\_PROVENANCE\_MISSING,CAPABILITY\_UNKNOWN</code>
- Missing type: <code>testability</code>
- Required material: claim\_refund, view\_refund#rule\_refund
- Recovery question: What verified test setup, control, or observation capability is available for refund?

### Exploratory Cases

_None._

### Coverage

#### Requirement Fact Ledger

Accounted: 1/1

| Fact | Status |
| --- | --- |
| <code>fact\_refund</code> | <code>blocked</code> |

#### Formal Test Point Ledger

Covered: 0/1 declared

| Test Point | Disposition |
| --- | --- |
| <code>obligation\_c1ec33588c660235</code> | <code>blocked</code> |

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
- Plan digest: <code>21a12fc3fa912275b7149fee3585292243c731fc2046c7a0d77fbb8421303635</code>
- Semantic result digest: <code>0e1b364a5668323acc74c5a87ee566c106e72a71c5c6ed86ffe2e8e4898e2f3a</code>
- Execute Cases: 0
- DoNotExecute Cases: 0
- DoNotExecute formal Test Points: 1
- DoNotExecute Exploratory items: 0
- Applicable Test Point execution coverage: full 0, partial 0, none 1
- Runner Case IDs: _None._

| Kind | ID | Title | True status | Execution disposition | Reason code |
| --- | --- | --- | --- | --- | --- |
| <code>formal\_test\_point</code> | <code>obligation\_c1ec33588c660235</code> | refund accepted | <code>blocked</code> | <code>do\_not\_execute</code> | <code>business\_rule\_missing</code> |

### Quality

- Delivery status: <code>no\_deterministic\_cases</code>
- Compiler version: <code>0.3.0</code>
- Schema version: <code>2.1.0</code>
- Semantic source digest: <code>b60dd857cefef1a4535518269ac8fafefc4678b1220d7de175fc0d3b35c278b4</code>
- Evidence semantic digest: <code>3c0fbacc1d8a8cbae806588be191fce6d3d17bcb88fb01440b3039a998ed53a5</code>
- Behavior Views semantic digest: <code>5817f8b978606e7b15bbff764ff35bd0a8e6ffd78948600d78d5954d422acde6</code>
- Test Obligations semantic digest: <code>d66ad87356a31d11140481c3e5311ad1f7240faaed2bf9488a4a9cb3412f96df</code>
- Case Drafts semantic digest: <code>fc6e70db9b0fbde5e3b8f57cb247d19f3f22e5dbd88447f8d1d7455539178f86</code>
- Limits:
  - Compilation is limited to the supplied revision.
