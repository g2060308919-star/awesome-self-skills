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
- Semantic source digest: <code>3f4aa4f6c62ae82e53ac6169c0046b695625e4ed0a28ac19d21bfbc03c0925dd</code>
- Plan digest: <code>0892bf44f8a5704de83a3346af06efe950399dd51a5071dbf1046bf9bbe9aed9</code>
- Semantic result digest: <code>48a4a517b308b2cca3eae2101c6822374c09c13de5986a360edbb9a9e9c12afb</code>

| Case | Stable ID | Test Points | Evidence |
| --- | --- | --- | --- |
| TC-001 | <code>case\_e2de3111cd3ec59d</code> | <code>obligation\_a1d383c412180df9</code> | <code>claim\_checkout</code> |

### Gap Traceability

| Subject | Test Point | Shared root | Diagnostic codes | Recovery references |
| --- | --- | --- | --- | --- |

### Exploratory Traceability


### Limits

- Compilation is limited to the supplied revision.
