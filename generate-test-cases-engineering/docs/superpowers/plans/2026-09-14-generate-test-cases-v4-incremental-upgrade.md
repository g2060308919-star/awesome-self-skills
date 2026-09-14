# Generate Test Cases V4 Incremental Upgrade Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve the qualified V4 test-case generation workflow while adding deterministic semantic-answer preview, stronger business-truth acceptance, recovery, and audit evidence required by `GTC-V4-UPGRADE-SPEC`.

**Architecture:** Keep the V4 compiler, four Agent-authored artifacts, two clarification phases, evidence levels, revision transactions, and canonical delivery. Add one compiler-owned preview sidecar and two high-level Adapter operations. Reuse existing `semantic_value`, behavior views, obligations, CaseSpec, coverage, and canonical renderers when they already express the required semantics; add tests and policy guidance instead of parallel registries.

**Tech Stack:** Node.js ESM, JSON Schema 2020-12 subset, `node:test`, TypeScript checkJs, esbuild, existing V4 run store and revision transaction.

---

### Task 1: T00 baseline qualification and physical contract binding

**Files:**
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/baseline-record.json`
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/capability-map.md`
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/change-register.md`
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/contract-bindings.md`

- [x] Bind both supplied documents by absolute path, package ID, revision, and SHA-256.
- [x] Prove the target trees equal V4 commit `858fdd1de77ba31655ff57810fbf0ff8a47872c9`.
- [x] Run the existing check and deterministic repeatability suite before source changes.
- [x] Separate reusable capabilities from proven gaps/new capabilities C01-C16.
- [x] Freeze the preview sidecar, request/reply, receipt, compatibility, and consumer bindings.

### Task 2: T01 independent truth and failure-capable acceptance

**Files:**
- Create: `test/fixtures/v4-upgrade/f-city/prd.md`
- Create: `test/fixtures/v4-upgrade/f-city/business-truth.json`
- Create: `test/helpers/v4-upgrade-business-truth.mjs`
- Create: `test/core/v4-upgrade-business-truth.test.mjs`
- Create: `test/interface/v4-upgrade-semantic-preview.test.mjs`
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/evaluation-protocol.json`
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/acceptance-map.md`

- [x] Freeze AT01-AT46 mappings and independent F-CITY truth before candidate output.
- [x] Prove legal-format omissions and wrong semantic bindings fail, then prove the correct projection passes.
- [x] Add an interface test that fails because the two preview exports and closed Schema do not yet exist.
- [x] Keep cold-context repetitions and external review marked evidence-pending until actually supplied and run.

### Task 3: T02 requirements understanding and business clarification protection

**Files:**
- Modify: `skill/generate-test-cases/SKILL.md`
- Modify: `skill/generate-test-cases/references/clarification-policy.md`
- Modify: `skill/generate-test-cases/references/evidence-policy.md`
- Modify: `skill/generate-test-cases/references/behavior-views.md`
- Test: `test/core/v4-upgrade-business-truth.test.mjs`

- [x] Protect compound outcomes, alternatives, exact wording, identity/display distinction, and source locators.
- [x] Protect specific questions, pre/post-case separation, risk-prioritized presentation, and no resource questions for document generation.
- [x] Run focused source, scope, gap, presentation, risk, and policy tests.

### Task 4: T03 semantic-answer prepare/commit transaction

**Files:**
- Create: `src/semantic-answer-preview-v4.mjs`
- Create: `skill/generate-test-cases/scripts/schemas/semantic-answer-preview.schema.json`
- Modify: `src/run-bootstrap-v4.mjs`
- Modify: `src/advance-v4.mjs`
- Modify: `src/entry.mjs`
- Modify: `skill/generate-test-cases/SKILL.md`
- Create: `skill/generate-test-cases/references/semantic-answer-preview.md`
- Test: `test/interface/v4-upgrade-semantic-preview.test.mjs`
- Create: `test/recovery/v4-upgrade-preview-recovery.test.mjs`

- [x] Implement deterministic batch binding through `constructV4Action` with one action per question part.
- [x] Persist compiler-owned preview bytes without changing accepted revisions.
- [x] Implement apply/revise/cancel_preview, confirmation provenance, staleness/integrity checks, and idempotent replay.
- [x] Stage the exact source append and use the existing runner/revision transaction for all accepted changes.
- [x] Require a confirmed preview receipt for answer events in preview-policy runs while leaving legacy runs and non-answer controls compatible.
- [x] Prove answer-to-Decision-to-recompiled-artifact behavior and crash recovery.

### Task 5: T04 decidable Oracles and mapping protection

**Files:**
- Modify: `skill/generate-test-cases/references/case-writing-policy.md`
- Modify: `skill/generate-test-cases/references/evidence-policy.md`
- Test: `test/core/v4-upgrade-business-truth.test.mjs`
- Test: existing `test/core/v4-generation-resource-independence.test.mjs`
- Test: existing `test/core/v4-relative-baseline.test.mjs`
- Test: existing `test/core/v4-value-origin.test.mjs`

- [x] Protect plain manual Oracles and `capture_at_execution` without URL/account/selector/API prerequisites.
- [x] Bind cross-surface, zero/null/missing, and source 23/24 semantics to existing evidence and Case fields.
- [x] Reject wrong-subject and incomplete official projections without adding a second truth source.

### Task 6: T05 required-value, quantified-set, and permission coverage

**Files:**
- Modify: `skill/generate-test-cases/references/behavior-views.md`
- Modify: `skill/generate-test-cases/references/case-writing-policy.md`
- Modify: `skill/generate-test-cases/references/evidence-policy.md`
- Test: `test/core/v4-upgrade-business-truth.test.mjs`
- Test: existing business-outcome, input-domain, role, interaction, and coverage suites.

- [x] Prove six independent score mappings and reject a legal-format five-value candidate.
- [x] Preserve logical all-record scope without inventing runtime counts or non-empty results.
- [x] Prove administrator allow and ordinary-user deny remain separate outcomes and reject equal-count semantic substitution.

### Task 7: T06 lineage, official output, and recovery hardening

**Files:**
- Modify: `skill/generate-test-cases/references/run-management.md`
- Modify: `skill/generate-test-cases/references/case-writing-policy.md`
- Test: `test/recovery/v4-upgrade-preview-recovery.test.mjs`
- Test: existing evidence, revision, cancellation, semantic-reopen, delivery, and execution-plan suites.

- [x] Reject Case/report self-evidence, E1-to-E3 promotion, wrong-subject Oracle reuse, and stale preview application.
- [x] Verify JSON/Markdown/CSV originate from one canonical bundle and retain conditions, data, instances, and expectations.
- [x] Preserve blocked-only/no-applicable/cancelled/reopen/execution-plan consumer boundaries.

### Task 8: T07 build, candidate package, and G0-G8 report

**Files:**
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/verification-report.md`
- Create: `docs/superpowers/evidence/2026-09-14-v4-incremental-upgrade/release-candidate.json`
- Update generated: `skill/generate-test-cases/scripts/test-compiler.mjs`
- Update generated: `skill/generate-test-cases/scripts/schema-manifest.json`
- Mirror: `skill/generate-test-cases/**` to `../generate-test-cases/**`

- [x] Run focused red/green tests for each slice, then `npm run check`.
- [ ] Run `npm run test:benchmark`, `npm run public-pilot`, and the actual single-system gate.
- [x] Verify engineering Skill and repository publication candidate are byte-identical.
- [x] Review the branch diff against the supplied Spec and V4 baseline.
- [ ] Record actual G0-G8 outcomes. Mark G8 insufficient unless the frozen external cold-context corpus is fully run.
- [ ] Commit locally only; do not push, publish, merge, or modify historical runs.
