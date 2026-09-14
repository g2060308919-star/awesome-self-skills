# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. No test results or defect verdicts are claimed.
- Delivery: Ready
- Coverage boundary: the following ratios account for declared, reviewed facts, not independently proven PRD recall.
- Requirement accounting: 1/1
- Formal Test Points covered: 1/1
- Grounded executable coverage: 1/1
- Confirmed runner Cases: 1
- Blocked Test Points / scope exclusions: 0 / 0

## Case Overview

| Case | Title | Scope | Risk | Evidence status | Decision |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Verify checkout accepted | checkout | High | Grounded | Execute |

## Cases

### TC-001 — Verify checkout accepted

- Scope: checkout
- Role: tester
- Risk: High
- Evidence status: Grounded
- Execution decision: Execute
- Decision basis: Selected for this run.
- Impact rationale: Synthetic fixture behavior fails
- Likelihood rationale: Fixture explicitly exercises this path
- Exposure rationale: Fixture test role

#### Preconditions

1. checkout is ready — Preparation: revision start
   - Resource: fixture://synthetic/setup-0
   - Preparation completed when: fixture-ready-0 Equals <code>true</code>

#### Test Data

- scenario input = <code>checkout</code> — Origin: Requirement

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
| TC-001 | Verify checkout accepted | checkout | High | tester | Not recorded | — | — |

## Audit Appendix

Complete typed Oracles, evidence, coverage ledgers and lineage are in the normative JSON. Cases are not duplicated here.

- Schema / compiler: <code>3.0.0</code> / <code>0.4.0</code>
- Source revision: 2
- Semantic source digest: <code>bdf9c0eba850f3e196304a68d90cc81b19d69fbef2a38a3a53f5f518d81ab208</code>
- Plan digest: <code>67f7d9f7e240dfe0a0646699ad70452a2c07b15c58ff07f48a772044481ce2b6</code>
- Semantic result digest: <code>641616e5faf8ff1d5d46dd3879b0a99fe96958ac199dc0ff1667063f24744864</code>

| Case | Stable ID | Test Points | Evidence |
| --- | --- | --- | --- |
| TC-001 | <code>case\_e2de3111cd3ec59d</code> | <code>obligation\_a1d383c412180df9</code> | <code>claim\_checkout</code> |

### Gap Traceability

| Subject | Test Point | Shared root | Diagnostic codes | Recovery references |
| --- | --- | --- | --- | --- |

### Exploratory Traceability


### Limits

- Compilation is limited to the supplied revision.
