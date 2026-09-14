# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. No test results or defect verdicts are claimed.
- Delivery: Ready
- Coverage boundary: the following ratios account for declared, reviewed facts, not independently proven PRD recall.
- Requirement accounting: 1/1
- Formal Test Points covered: 1/1
- Grounded executable coverage: 0/0
- Confirmed runner Cases: 0
- Blocked Test Points / scope exclusions: 0 / 0

## Case Overview

| Case | Title | Scope | Risk | Evidence status | Decision |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Verify checkout accepted | checkout | High | Conditional | Do not execute |

## Cases

### TC-001 — Verify checkout accepted

- Scope: checkout
- Role: tester
- Risk: High
- Evidence status: Conditional
- Execution decision: Do not execute
- Temporary assumption invalidation: A final rule replaces this temporary decision.
- Decision basis: Test operator explicitly excluded this conditional item.
- Impact rationale: Synthetic fixture behavior fails
- Likelihood rationale: Fixture explicitly exercises this path
- Exposure rationale: Fixture test role

#### Preconditions

1. checkout is ready — Preparation: revision start
   - Resource: fixture://synthetic/setup-0
   - Preparation completed when: fixture-ready-0 Equals <code>true</code>

#### Test Data

- scenario input = <code>checkout</code> — Origin: Temporary assumption

#### Steps and Expected Results

1. Exercise checkout
   - Expected: checkout accepted
   - Observe: tester / UI → result
   - Typed Oracle: fixture-subject equals <code>checkout accepted</code>

#### Post-state and Cleanup

- Post-state: checkout accepted
- No cleanup: The scenario is isolated.

## Business Rule Gaps

_None._

## Execution Preparation Gaps

_None._

## Source and Evidence Gaps

_None._

## Scope Exclusions

_None._

## Exploratory Risks

_None._

## Manual Execution Worksheet

Not executed. Record results downstream against the bundle digest and stable Case ID; only confirmed runner Cases are listed.

| Case | Title | Scope | Risk | Role | Result | Defect | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Audit Appendix

Complete typed Oracles, evidence, coverage ledgers and lineage are in the normative JSON. Cases are not duplicated here.

- Schema / compiler: <code>3.0.0</code> / <code>0.4.0</code>
- Source revision: 3
- Semantic source digest: <code>04e1b40a1a041809c64104930e34b6013b1892092487e415b38789aecb4ba231</code>
- Plan digest: <code>6fe749c78a6762c85f72bbba59f0f0ee6ce8c0a95edd8ff04d37d3dcdbd91782</code>
- Semantic result digest: <code>75b338d71b0653870d373d62f0effaef1a58615552ec085ba401504e520b9ceb</code>

| Case | Stable ID | Test Points | Evidence |
| --- | --- | --- | --- |
| TC-001 | <code>case\_f791ee8439461edd</code> | <code>obligation\_7ad4b46aba188b77</code> | <code>claim\_checkout</code> |

### Gap Traceability

| Subject | Test Point | Shared root | Diagnostic codes | Recovery references |
| --- | --- | --- | --- | --- |

### Exploratory Traceability


### Limits

- Compilation is limited to the supplied revision.
