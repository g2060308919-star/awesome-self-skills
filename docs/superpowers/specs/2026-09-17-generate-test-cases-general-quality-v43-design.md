# generate-test-cases General Quality v4.3 Design

**Date:** 2026-09-17

**Status:** Approved for implementation
**Target contract:** schema `4.3.0`, compiler `0.8.0`

## Source contract

This design implements the user-supplied document package dated 2026-09-17:

- `01-problem-record.md` (`sha256:8e0965224bbf1f04059f6c10323b76174f39297e78da30bf24c43708e9d3dda6`)
- `02-technical-design.md` (`sha256:954dcb24910319e92abfbafca2086585c141e8d42caf0c5dc29b1dafb6f51000`)
- `03-spec.md` (`sha256:57f3de2fb87636f3064190beb0aa2fec2de16192ac4d0f0dbdf9d0f2d4c2b159`)

`03-spec.md` is normative. The problem record and technical design explain intent and implementation direction but do not override the spec. The implementation covers P01-P08, FR01-FR10, INV01-INV08, and AT01-AT31. It does not generate cases for a particular product.

## Baseline

The maintained source is `generate-test-cases-engineering/`. Its reproducible build publishes to both `generate-test-cases-engineering/skill/generate-test-cases/` and the repository-level `generate-test-cases/` copy. The repository-level copy is generated output, not the only source.

The accepted baseline is schema `4.2.0` / compiler `0.7.0`. Before this design was approved, `npm run check` completed with 1472 main tests and 2 repeatability tests passing, including 100 byte-identical fresh installed-shape runs. The worktree was clean. No `AGENTS.md` or `.codegraph/` was present.

## Goals

The new contract must:

1. preserve source meaning in both trace directions;
2. make rule-group test design and candidate disposition auditable;
3. retain necessary single-point cases while adding source-backed same-object paths;
4. keep cases executable, decidable, and limited to one independently diagnosable primary result;
5. classify business semantic gaps by acceptance impact independently from priority or `risk_level`;
6. prevent every formal Case Document delivery while a critical semantic gap lacks a final resolution;
7. bind a source-first independent omission review to the actual generated content reviewed;
8. evaluate quality against independently adjudicated acceptance targets rather than generated test points;
9. retain deterministic recovery, rendering, history, and installed-shape behavior.

## Non-goals

- No fifth Agent-writable semantic artifact.
- No replacement state machine, workflow engine, or task scheduler.
- No E2E Runner, CDP proxy, browser automation, API automation, or execution-result redesign.
- No project-specific rules, fixed case counts, or keyword-based business decisions.
- No new dependency or tool installation.
- No historical run rewriting or bulk migration.
- No removal of the two clarification phases, evidence levels, stable compiler identity, append-only repair, cancellation, recovery, or generation/execution separation.

## Version and compatibility strategy

Schema `4.3.0` / compiler `0.8.0` is the only identity that receives the new production semantics. New runs use this identity. Existing `4.0.0/0.5.0` and `4.2.0/0.7.0` runs remain readable and resumable under the behavior bound to those identities.

The compiler continues to recognize all three contracts. Version-specific validators and projections must not backfill new review records or reinterpret old `request_delivery` events. Frozen 4.2 presentation families remain byte-exact. A current runtime that cannot safely interpret an older binding stops with the existing supported migration/new-run guidance rather than silently upgrading it.

## Architecture

The existing pipeline remains:

```text
source_pack -> evidence_claims -> pre-case clarification
            -> behavior_views -> case_drafts -> post-case clarification
            -> canonical Case Document -> optional separate execution_plan
```

Exactly four Agent-writable semantic artifacts remain. The compiler continues to own Facts, topology, formal test points, stable IDs, digests, ordering, coverage, semantic roots, checkpoints, result classification, canonical JSON, and readable projections.

The implementation adds three focused compiler modules instead of expanding one large orchestration file:

- `design-assurance-v4.mjs`: validates rule-group design, candidate responsibilities, disposition, and coverage-plan revision semantics for 4.3.
- `semantic-delivery-gate-v4.mjs`: derives semantic impact, final-resolution state, critical recovery actions, and the strict delivery decision.
- `independent-review-v4.mjs`: computes the self-excluding review-target projection and validates source-first findings, disposition, and re-review binding.

`v4-pipeline.mjs`, clarification, checkpoint, delivery, and presentation modules orchestrate those focused contracts.

## Four-artifact contract extensions

### `source_pack`

No new business truth is introduced. Existing source acquisition, canonical units, per-unit review, composition, authority, and new-run rules remain authoritative. Tests add explicit P01/AT01-AT03 protection for incomplete channels, AND/OR/exception conservation, conflict handling, and the distinction between readable omissions and actual business ambiguity.

### `evidence_claims`

For 4.3, every in-scope `semantic_gap` adds a closed `acceptance_impact` record:

```json
{
  "classification": "critical",
  "criteria": ["changes_required_branch"],
  "rationale": "Different answers change the required approval branch."
}
```

`classification` is `critical` or `noncritical`. A critical record has one or more criteria from:

- `changes_core_acceptance`
- `changes_required_branch`
- `makes_required_result_undecidable`

A noncritical record uses criterion `does_not_change_required_acceptance`. Existing subject Fact IDs, affected test-point IDs, `decision_impact`, and `unresolved_outcome` carry the concrete affected objects and alternative consequences. The compiler validates structure, scope, references, and version binding; semantic correctness remains subject to independent review and behavioral evaluation. `risk_level` remains a separate ordering/prioritization dimension.

The impact record is included in semantic-root version identity. Changing it invalidates stale answers and delivery choices.

### `behavior_views`

For 4.3, `design_assurance` contains:

- a plan revision and batch inventory;
- source-backed rule groups;
- a precise test objective and applicable method for each group;
- candidate validation responsibilities;
- one disposition for every candidate: retained, representative-value selection, equivalent merge, evidence-backed exclusion, semantic gap, or exploratory;
- retained-target references for merges and representative selections;
- source/Decision evidence for exclusions;
- impacted prior batches when a same-source discovery revises the plan.

The compiler verifies closed shapes, exact references, total candidate disposition, valid retained targets, non-cyclic merges, batch completion, and current-plan consistency. It does not treat design rationale as E3 evidence and does not create product outcomes from it.

Existing compiled outcomes and formal test points remain compiler-owned. Design assurance explains and constrains the route to them; it does not become a parallel test-point ledger.

### `case_drafts`

For 4.3, `independent_review` records:

- review mode and reviewer identity class without claiming platform identity;
- the source-first required-target inventory prepared before generated content was exposed;
- exact source/Decision references for every target;
- findings for omissions and unsupported assertions;
- evidence adjudication, disposition, affected items, and required recheck;
- a compiler-issued `review_target_digest` for the generated content actually reviewed.

The review target projects relevant Facts, Views, formal test points, candidate responsibilities, Case preconditions, data, ordered steps, and Oracles. It excludes the review record and summaries derived from it, avoiding digest self-reference.

Case submission uses the existing `case_drafts` stage twice when necessary:

1. a schema-valid review-pending candidate lets the compiler calculate and return the review target and digest through a versioned `need_revision` contract;
2. the completed submission repeats the current generated content and binds the issued digest plus review findings.

No new public stage or fifth artifact is added. If generated content changes, the digest changes and the prior review cannot release delivery. Merely appending review prose cannot alter the target digest or manufacture business content.

## Critical semantic delivery gate

For 4.3, a critical semantic root is truly resolved only when the current root version has:

- an accepted, scope-valid final E3 Decision; or
- a legal replayable E2 derivation that determines the missing meaning; or
- evidence-backed non-applicability/obsolescence accepted through the existing authority and scope rules.

The following never resolve a critical root:

- temporary or nature-unspecified E1;
- `resolved_temporary` display state;
- defer or unknown;
- `request_delivery`;
- ordinary “continue”, “confirm”, or omitted text;
- stale events, older root versions, or an older ready manifest.

`request_delivery` remains valid for noncritical gaps. A selection containing both critical and noncritical roots fails atomically. Critical question parts do not advertise a bypassing delivery action.

Deferred or unknown critical roots remain recoverable. Their current question remains presentable for a later final answer without fabricating a new root or converting the semantic issue into a technical failure.

Finalization derives `unresolved_critical_semantic_gap_count` from the current root ledger, accepted Decisions, evidence, and statuses. A nonzero value prevents `finalizeCaseDocumentRevision` and `materializeCaseDocumentDeliveryV4` from publishing a formal Case Document. The runner may return questions and a non-formal unresolved report, but no `output/current.json` may authorize it as a completed Case Document.

The public result-kind enum is unchanged. Noncritical `delivered_with_gaps`, `blocked_only`, and Conditional behavior retain their existing meaning. For 4.3, `blocked_only` never serves as a formal substitute for a document blocked by a critical root.

## Canonical output and recovery

Canonical JSON remains the sole authority. For 4.3 it retains enough root information to distinguish `resolved_final` from `resolved_temporary`, reports design/review completion, and binds the current review target digest. HTML, full conversation Table, Markdown, CSV, manifest, checkpoint, and readable summaries are mechanical projections.

The final transaction rechecks:

- current artifact versions and digests;
- current root impact and finality;
- design-assurance plan completeness;
- independent-review target binding and finding closure;
- canonical output family consistency.

Recovery replays only compiler-accepted artifacts and events. Staging-only review attempts remain unaccepted. A changed root version, impact classification, plan revision, or reviewed target invalidates only the affected binding and exposes the existing recovery path. Old ready output cannot become current after a newer non-ready revision.

## Quality evaluation

The production compiler keeps its formal-test-point coverage metric with its existing name and denominator. A separate evaluation harness uses independent required targets:

```text
effective_required_target_coverage =
  correctly supported, decidable, responsibility-fulfilling targets
  / independently adjudicated required targets
```

Primary acceptance and boundary contract targets are reported separately; context-only entries are excluded. Duplicate Cases count once. A gap or exploratory suggestion is reported but does not count as covered. Zero denominator is not applicable.

The evaluation package contains:

- fixed regression fixtures covering AT01-AT31;
- a declared holdout set not used to tune implementation;
- before/after evidence for behaviors actually changed;
- protection evidence for behavior already satisfied;
- explicit rules, scopes, runtime conditions, repetitions, failures, costs, and limitations.

No score or Case count is a release target. Rule-correctness regressions, unsupported assertions, critical bypass, or required-scenario deletion are hard failures rather than averaged away.

## Test strategy

Every behavioral change follows red-green-refactor. Existing correct behavior receives protection tests without artificial failure. The minimum evidence set is:

- AT01-AT03: source/information conservation;
- AT04-AT09: design responsibility, candidate equivalence, and batching;
- AT10-AT15: result/path/case quality and resource independence;
- AT16-AT22: clarification and strict critical gate;
- AT23-AT24: independent source-first review and content binding;
- AT25: independent quality metric and comparable evaluation;
- AT26-AT27: final resolution, partial answers, stale choices, and recovery;
- AT28-AT31: closed contracts, build identity, old-run preservation, rendering, execution separation, and maintained-source detection.

Each slice runs its focused test first, then the relevant schema/interface/recovery group. Final verification runs `npm run check`, `npm run test:benchmark`, `npm run public-pilot`, repository-published byte sync, and a consumer-impact check for `b2b-e2e-runner`. Tests not actually run remain explicitly unverified.

## Delivery boundaries

Implementation and verification modify only `generate-test-cases-engineering`, its generated repository publication under `generate-test-cases`, and scoped design/plan/evidence documents. `b2b-e2e-runner` is read-only except for running its existing tests as a consumer check. No installed Skill outside this repository is overwritten. No release, tag, merge, push, or installation is implied by implementation completion.
