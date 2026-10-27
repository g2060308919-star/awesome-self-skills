# Clarification targets and acquisition recovery

Goal: reject ambiguous answer write ownership before presentation/material acquisition and preserve an authoritative material context when a candidate fails semantics.

Base: origin/main 02eb8d9, schema/compiler 4.3.3/0.8.3; maintained ES modules in generate-test-cases-engineering/src. No AGENTS.md, CLAUDE.md or .codegraph found. Specification: user-supplied 2026-10-26 problem record, technical proposal and Spec, read in full. Scope: this source worktree only; no push, installation, deployment or real run mutation.

Architecture: retain the four-artifact protocol and existing revision transaction. Add a pure target write-set validator at effective-root/presentation and legacy answer ingress. Add versioned compiler-private acquisition context records under transactions, binding accepted checkpoints, candidate event identities, material snapshots and existing revision transactions. Material projection is recoverable coordination, never acceptance authority. Continue strict receipt/collection/source validation.

Global constraints: no fact loss, no weakened matcher, no forced revision equality, no history rewrite, no auto-rebinding old answers. Retain E1/E2/E3, both clarification stages, review and canonical delivery. Do not claim real scene recovery from synthetic tests.

Review focus: (1) post-merge effective root selection and temporary answers; (2) Fact plus Claim write overlaps/non-target Fact damage; (3) acquired-but-unaccepted candidate isolation and same revision candidates; (4) crash ordering with original revision journal before projection repair; (5) legacy reconstruction only from unique complete verified receipts, not raw material.

## Task 1 — regression evidence
Write presentation/answer target regressions and full synthetic public-runner acquired material → semantic failure → accepted-base Evidence repair regression. Run them on unmodified source and save RED output. Establish baseline with existing acquired-repair flow.

## Task 2 — pure target validation
Compute Fact and grouped Claim write sets. Apply to effective answerable roots before presentation and before answer material changes. Preserve inner overlay checks. Test active, missing, cross-root Fact/Claim collisions, same-root exact/disjoint/partial groups, readonly context, non-target protection and atomic batch rejection.

## Task 3 — material ownership and recovery
Persist verified base binding before candidate writes; candidate-scoped immutable bases and material snapshots; idempotent context selection for pending/acquired retries. Integrate with existing lock and revision journal; rejected candidates stay audit-only, successful transactions synchronize projection durably. Validate legacy R/C=R+1 reconstruction and fail closed with incomplete proof. No fifth Agent artifact or second business transaction manager.

## Task 4 — persistence and adversarial verification
Cover Spec T01–T20 via unit experiments and complete synthetic runners. Interrupt after base journal, material write, semantic rejection, original revision materialization, checkpoint, projection. Verify phase occurred, exact history, ownership and subsequent progress. Include first acquisition, changed candidate same revision, legacy/tampered/missing receipts, temporary/partial/stale answers.

## Task 5 — documentation, build and review
Update maintained skill guidance and report. Rebuild all three source-controlled distribution copies. Run npm run check, benchmark regression and relevant bundled/full CLI fixtures. Fresh-context final review of branch, fix verified findings and rerun affected checks. Record actual commands/results, compatibility and unverified real-scene limitations. No remote publishing.
