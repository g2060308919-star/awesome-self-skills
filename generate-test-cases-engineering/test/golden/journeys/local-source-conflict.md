# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. No test results or defect verdicts are claimed.
- Delivery: Ready
- Coverage boundary: the following ratios account for declared, reviewed facts, not independently proven PRD recall.
- Requirement accounting: 2/2
- Formal Test Points covered: 1/2
- Grounded executable coverage: 1/1
- Confirmed runner Cases: 1
- Blocked Test Points / scope exclusions: 1 / 0

## Case Overview

| Case | Title | Scope | Risk | Evidence status | Decision |
| --- | --- | --- | --- | --- | --- |
| TC-001 | Verify shipping confirmed | checkout.shipping | High | Grounded | Execute |

## Cases

### TC-001 — Verify shipping confirmed

- Scope: checkout.shipping
- Role: tester
- Risk: High
- Evidence status: Grounded
- Execution decision: Execute
- Decision basis: Selected for this run.
- Impact rationale: Synthetic fixture behavior fails
- Likelihood rationale: Fixture explicitly exercises this path
- Exposure rationale: Fixture test role

#### Preconditions

1. shipping is ready — Preparation: revision start
   - Resource: fixture://synthetic/setup-0
   - Preparation completed when: fixture-ready-0 Equals <code>true</code>

#### Test Data

- scenario input = <code>shipping</code> — Origin: Requirement

#### Steps and Expected Results

1. Exercise shipping
   - Expected: shipping confirmed
   - Observe: tester / UI → result
   - Typed Oracle: fixture-subject equals <code>shipping confirmed</code>

#### Post-state and Cleanup

- Post-state: shipping confirmed
- No cleanup: The scenario is isolated.

## Business Rule Gaps

_None._

## Execution Preparation Gaps

_None._

## Source and Evidence Gaps

### Gap-1

- payment settles in two days — Scope: checkout.payment; Risk: Critical
  - Decision: Do not execute — Test operator explicitly excluded this blocked item.
- Question: Which authoritative source rule applies to checkout.payment?
- Conflicting authoritative rules remain unresolved.
- Needed: Authoritative evidence resolving the source gap or conflict.

## Scope Exclusions

_None._

## Exploratory Risks

_None._

## Manual Execution Worksheet

Not executed. Record results downstream against the bundle digest and stable Case ID; only confirmed runner Cases are listed.

| Case | Title | Scope | Risk | Role | Result | Defect | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TC-001 | Verify shipping confirmed | checkout.shipping | High | tester | Not recorded | — | — |

## Audit Appendix

Complete typed Oracles, evidence, coverage ledgers and lineage are in the normative JSON. Cases are not duplicated here.

- Schema / compiler: <code>3.0.0</code> / <code>0.4.0</code>
- Source revision: 3
- Semantic source digest: <code>58188126f0705a097c0b15b79a9b076dcc72c832eef62cf05bcc8336e09cd80a</code>
- Plan digest: <code>88b4d1c738f8ac839f4055be5b92c8484c0aaeb359e00bddfa2c43f1b5332202</code>
- Semantic result digest: <code>0653393f04daae46a28d475df54d282848b137a2b4f4a6f50c99f294b2101720</code>

| Case | Stable ID | Test Points | Evidence |
| --- | --- | --- | --- |
| TC-001 | <code>case\_79e356c77c45efd6</code> | <code>obligation\_96bd8760ebfe5988</code> | <code>claim\_shipping</code> |

### Gap Traceability

| Subject | Test Point | Shared root | Diagnostic codes | Recovery references |
| --- | --- | --- | --- | --- |
| payment settles in two days | <code>obligation\_6ad76eb85c53a5f3</code> | <code>root\_8ff3a1ca4f4e9795</code> | <code>UNRESOLVED\_CONFLICT</code> | <code>claim\_payment, unresolved-source-policy, view\_payment#rule\_payment</code> |

### Exploratory Traceability


### Limits

- Compilation is limited to the supplied revision.
