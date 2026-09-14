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

### Gap-1

- refund accepted — Scope: refund; Risk: Critical
  - Decision: Do not execute — Test operator explicitly excluded this blocked item.
- Question: What verified test setup, control, or observation capability is available for refund?
- Capability has no supporting verification evidence.
- Capability availability is unconfirmed.
- Resource: run-control
- Needed: Verified preparation, control or observation capability.

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
- Semantic source digest: <code>b60dd857cefef1a4535518269ac8fafefc4678b1220d7de175fc0d3b35c278b4</code>
- Plan digest: <code>5552cb84cc060f4e7f1f441acd6f978755cf84cca8819e28f40455db9130aa26</code>
- Semantic result digest: <code>fb3e12217d62f80956cf7126cb1182f33d02573d4e0e722a25c6420a0835c83a</code>

| Case | Stable ID | Test Points | Evidence |
| --- | --- | --- | --- |
| TC-001 | <code>case\_f791ee8439461edd</code> | <code>obligation\_7ad4b46aba188b77</code> | <code>claim\_checkout</code> |

### Gap Traceability

| Subject | Test Point | Shared root | Diagnostic codes | Recovery references |
| --- | --- | --- | --- | --- |
| refund accepted | <code>obligation\_c1ec33588c660235</code> | <code>root\_26543873b6b6fc2d</code> | <code>CAPABILITY\_PROVENANCE\_MISSING,CAPABILITY\_UNKNOWN</code> | <code>{"kind":"capability","subject":"run-control","target":null}</code> |

### Exploratory Traceability


### Limits

- Compilation is limited to the supplied revision.
