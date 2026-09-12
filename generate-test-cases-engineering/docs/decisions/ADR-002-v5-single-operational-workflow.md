# ADR-002: V5 is the single operational generation workflow

Status: Accepted

Date: 2026-09-12

## Context

The verified problem record showed that correctness depended on protocol rules
split across prose, runtime branches, recovery helpers, and mutable staging
conventions. The technical design proposed a content-addressed compiler with
closed registries, explicit source acquisition, two-phase clarification, typed
behavior contracts, and deterministic delivery. The V5 development
specification is the sole normative implementation and acceptance contract.

## Decision

Publish exactly one operational workflow:

- Schema version `5.0.0` and compiler version `0.6.0`.
- Public APIs `createV5RunDirectory`, `advanceV5Run`, and `inspectV5Run` only.
- A read-only direct CLI that delegates to inspection.
- Agent write authority limited to `source_pack`, `evidence_claims`,
  `behavior_views`, and `case_drafts`.
- Generated policy registries and closed Schemas as the machine contract.
- Content-addressed catalog/run transactions whose pointer publication is the
  final atomic step.
- Normal-chain fatal incidents separated from independent integrity quarantine.
- Immutable canonical JSON with deterministic Markdown and CSV projections.

The proven V4 boundaries retained in V5 are evidence-first source grounding,
manual Case delivery, independently diagnosable outcomes, explicit blockers,
and a separate opt-in Execution Plan. V4 operational source, schemas, tests,
dispatch, adapters, migration code, and benchmark commands are removed.
Historical design and evidence documents remain in Git because they are audit
records, not executable paths.

## Consequences

There is no in-place conversion or runtime compatibility selector. Existing run
bytes remain untouched and are not accepted as current input. A caller must
create a new V5 run and reacquire authoritative source material through the
closed source protocol.

The larger deletion is intentional: hiding old exports while retaining
reachable operational modules would leave two contracts to audit. Release
verification therefore checks source inventory, installed Schema inventory,
built exports, package scripts, published-Skill byte identity, and forbidden
dispatch strings.

Recovery is stricter. A verified operational chain may record a normal fatal
incident; an untrusted chain can only produce a quarantine record. Inspection
never repairs or mutates state.

Rollback is permitted only to a previously approved V5 release. Restoring V4
operational code, accepting V4 run bytes, or adding a compatibility selector
requires a new normative contract and release review.

## Verification

The release evidence records build freshness, all V5 tests, deterministic
fixture replay, package commands, installed/published byte identity, repository
scans, active-run inventory, and Git commit references. The feature branch is
merged only after every release gate passes.
