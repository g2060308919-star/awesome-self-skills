# Generate-test-cases reliability implementation plan

> Execute inline with systematic debugging and test-driven development. User authorized routine decisions without a further plan approval.

Goal: implement the 2026-10-22 handoff Spec, retaining the four artifacts, review/clarification gates, append-only history and canonical delivery.

Baseline: clean repository at `4beb55f278af1648fbb0afd7c6f71dcefca87d72`, engineering source last changed by `7c57863`; schema/compiler 4.3.2/0.8.2. Node/npm versions and actual commands are recorded in the validation report. Build: `npm run build`; release gate: `npm run check`; benchmark tests: `npm run test:benchmark` in `generate-test-cases-engineering`.

Inputs: the user-supplied 01-background.md, 02-technical-design.md and 03-spec.md in Apple Notes attachments have been read. PROMPT.txt was not found in workspace/Desktop/Downloads/Documents or Spotlight. Known Notes attachments were read by exact path; parent directory enumeration was denied by the OS. Its exact location has been requested. Desktop/docs is an older, different package and is not substituted.

## Constraints and review focus

- Preserve all facts, Claims and gaps; labels are never identity or coverage counts.
- Normalize artifact snapshots with existing path semantics; preserve ordered steps/events and historical byte hashes.
- Validate actual serialized candidates before reservation; retain lock/base checks and journal recovery.
- Keep unknown business rules distinct from candidate errors, compiler invariants and damaged history.
- Upgrade successors are compiler-created, idempotent and auditable; old data is immutable. Answers require proof of full applicability, otherwise ask again.
- Exercise ambiguous context, reordered nested collections, failure before reservation, interrupted upgrade, and changed answer scope.

## Tasks

1. [x] Reproduce A and B independently using complete source/topology/review fixtures; retain failing logs. Files: test/helpers/v4-reliability-fixture.mjs, test/interface/v4-reliability.test.mjs.
2. [x] Fix collision labels in src/semantic-gaps-v4.mjs after root merging; canonical snapshot boundary in src/canonical.mjs and src/advance-v4.mjs; shared digest validation in src/revision-artifact-validation-v4.mjs. Cover T01–T09 and input immutability.
3. [x] Preserve bounded, redacted leaf diagnostics through schema/checkpoint/reply boundaries; demonstrate preflight safety and existing transaction recovery. Cover T05/T10/T14–T16/T23.
4. [x] Add latest release contract and controlled version-upgrade successor through existing bootstrap/persistence seams, readonly old validation and explicit answer applicability. Cover all five existing v4 pairs and T17–T20.
5. [x] Exercise full formal CLI flows, outputs, partial/post-case clarification, gates, baseline comparison and Execution Plan regressions. Cover T11–T13/T21/T24.
6. [x] Update evidence/run policies, release support matrix, schemas and distributable copies; build and run representative bundle flows T22 plus full checks; fresh independent final review.

## Progress / rulings

- Source, test/build entrypoints and five supported pairs verified. No .codegraph or applicable repository AGENTS.md found (the handoff archive AGENTS.md governs only that archive).
- Ruling: work on a dedicated branch in the current clean checkout, as requested, keeping unrelated historical handoff worktrees untouched.
- Ruling: retain existing serialized-candidate validation and add missing diagnostics rather than create a second transaction system.

- Independent review found and drove regressions for nested Fact/Scope sets, full Authorization redaction, upgrade checkpoint/journal ancestry, persistent answer-binding audits, and public materialized-transaction recovery. These were fixed without relaxing final semantic/review gates.
- Formal G→R validation exposed the downstream exact-version allowlist. The minimal related compatibility change adds only 4.3.3/0.8.3; official read-only delivery verification remains mandatory.
- Final `npm run check` exited 0: 1600/1600 main tests and 2/2 repeatability tests (100 existing installed journeys and three latest v4 journeys), with no skips. Benchmark 165/165, final bundle representative flows 25/25, recovery/upgrade special tests 28/28, and G→R 2/2 passed. All three distributed Skill trees are byte-identical; final typecheck/build/diff checks passed. See `generate-test-cases-engineering/docs/reliability-2026-10-22.md` for the five-pair support matrix and explicit unverified inputs.
- User subsequently requested committing and merging into remote main. Original implementation saved as `80e2527`; integrate only that patch onto remote `7943cbe` in an isolated checkout to exclude 91 unrelated divergent commits. Preserve remote acquisition-base, Evidence repair and topology behavior. Final integrated `npm run check`: 1621/1621 main tests and 2/2 repeatability tests, exit 0; benchmark 165/165, bundled representative flows 25/25 and G→R 2/2. Independent integration review found no remaining blockers.
