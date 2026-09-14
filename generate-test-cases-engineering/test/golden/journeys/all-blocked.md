# Manual Functional Test Plan

## Delivery Overview

- Generated, not executed. No test results or defect verdicts are claimed.
- Delivery: Ready
- Coverage boundary: the following ratios account for declared, reviewed facts, not independently proven PRD recall.
- Requirement accounting: 1/1
- Formal Test Points covered: 0/1
- Grounded executable coverage: 0/0
- Confirmed runner Cases: 0
- Blocked Test Points / scope exclusions: 1 / 0

## Case Overview

| Case | Title | Scope | Risk | Evidence status | Decision |
| --- | --- | --- | --- | --- | --- |

## Cases

_None._

## Business Rule Gaps

_None._

## Execution Preparation Gaps

### Gap-1

- refund accepted — Scope: refund; Risk: High
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

## Audit Appendix

Complete typed Oracles, evidence, coverage ledgers and lineage are in the normative JSON. Cases are not duplicated here.

- Schema / compiler: <code>3.0.0</code> / <code>0.4.0</code>
- Source revision: 2
- Semantic source digest: <code>b60dd857cefef1a4535518269ac8fafefc4678b1220d7de175fc0d3b35c278b4</code>
- Plan digest: <code>9a9763c67bd409938c26d15028e984700002ce365bca5ffab71a0362e358752d</code>
- Semantic result digest: <code>3b891e6792c40e36603b4b2c6884acef55b860aedf8e93115548dc9dbf53481d</code>

| Case | Stable ID | Test Points | Evidence |
| --- | --- | --- | --- |

### Gap Traceability

| Subject | Test Point | Shared root | Diagnostic codes | Recovery references |
| --- | --- | --- | --- | --- |
| refund accepted | <code>obligation\_c1ec33588c660235</code> | <code>root\_26543873b6b6fc2d</code> | <code>CAPABILITY\_PROVENANCE\_MISSING,CAPABILITY\_UNKNOWN</code> | <code>{"kind":"capability","subject":"run-control","target":null}</code> |

### Exploratory Traceability


### Limits

- Compilation is limited to the supplied revision.
