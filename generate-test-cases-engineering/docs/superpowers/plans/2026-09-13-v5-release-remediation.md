# Generate Test Cases V5 Release Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every verified V5 release blocker and pass the normative `03-development-spec.md` acceptance gates before publication.

**Architecture:** Repair the implementation in dependency order. First restore the frozen Phase 0 Case projection and identity; then persist compiler-owned stable projections and the complete provenance DAG; finally replace aliased fixtures and make the mandatory static check clean. Each slice starts with a failing contract test and ends with focused verification plus an atomic commit.

**Tech Stack:** Node.js 20+ ESM, JSON Schema Draft 2020-12, Node test runner, TypeScript checking through `jsconfig.json`, SHA-256 canonical identities, Git.

**Spec:** `/Users/zhangxudong/Library/Group Containers/group.com.apple.notes/Accounts/F9B299C9-B93D-4A03-9E9C-4BCA07E67C16/Media/8F7A39F2-E8D9-431E-83CA-1E67BE5DD43B/1_A3BE10B0-50D8-4046-9DB5-6E09E27B63A6/03-development-spec.md`

## Global Constraints

- `03-development-spec.md` is the sole normative development and acceptance contract; documents 01 and 02 are context only.
- Phase 0 V4 Case fields and identity semantics remain frozen; V5 adds only `case_step_semantic_bindings`, `domain_selections`, and typed `oracles`.
- Agent batch keys are input-local only. Accepted projections exposed by `inspectV5Run` contain compiler-owned stable references.
- Provenance must close Source → Claim → Fact → AtomicOutcome → FormalTestPoint → Case/CaseOracle using only registered directed edges.
- Every named C01–C16 manifest leaf independently triggers and asserts its named invariant.
- Type checking may not be disabled or weakened.
- No feature branch push, `main` merge, or `main` push occurs until every release gate passes.

---

### Task 1: Restore the frozen Case contract and identities

**Files:**
- Modify: `src/v5/interface-schemas.mjs`
- Modify: `src/v5/case-compiler.mjs`
- Modify: `test/v5/case-output.test.mjs`
- Modify: `test/v5/schema-contracts.test.mjs`

**Interfaces:**
- Consumes: the Phase 0 V4 semantic Case projection plus the exact V5 Case extension.
- Produces: closed Case Draft input validation, `case_anchor_digest`, stable Step/Oracle/Case IDs, and accepted Case projection without synonym fields.

- [x] Write tests that reject replacement fields and accept every frozen V4 field plus the exact V5 extension.
- [x] Run `node --test test/v5/schema-contracts.test.mjs test/v5/case-output.test.mjs` and verify the new assertions fail against the replacement shape.
- [x] Change the schema and compiler to preserve `ordering`, `acceptance_role`, `fact_ids`, `supporting_observation_ids`, typed preconditions/data conditions, and optional `semantic_effects`, `baseline_spec`, and `test_values`; move action semantics exclusively to the V5 binding array.
- [x] Derive the Case anchor from the frozen Case identity projection while excluding the three V5 extension fields and all derived IDs/coverage; freeze deterministic Case/Step/Oracle/DomainSelection goldens and the no-cycle invariant.
- [x] Re-run the focused tests and build. Commit recorded as the next atomic step.

### Task 2: Persist stable accepted work context

**Files:**
- Modify: `src/v5/behavior-compiler.mjs`
- Modify: `src/v5/interface-schemas.mjs`
- Modify: `src/v5/runtime.mjs`
- Modify: `test/v5/fsm-runtime.test.mjs`
- Modify: `test/v5/schema-contracts.test.mjs`

**Interfaces:**
- Consumes: accepted Behavior transaction output and client-key bindings.
- Produces: a closed `AcceptedBehaviorViews` projection whose local references are rewritten to stable IDs and which is sufficient for the next Case draft after restart.

- [x] Write a restart test that constructs the next Case artifact using only `inspectV5Run().work_packet.context` and rejects any accepted context containing a local client key.
- [x] Run the focused runtime test and verify it fails on the raw Agent payload.
- [x] Have the Behavior compiler return the normalized stable projection, persist that projection in the accepted envelope, and make every downstream work packet reference it.
- [x] Re-run the focused tests and build. Recorded with Task 3 because the stable TestPoint context and provenance compiler share one acceptance boundary.

### Task 3: Complete compiler-owned semantics and provenance

**Files:**
- Modify: `src/v5/evidence-compiler.mjs`
- Modify: `src/v5/behavior-compiler.mjs`
- Modify: `src/v5/provenance.mjs`
- Modify: `src/v5/runtime.mjs`
- Modify: `test/v5/provenance.test.mjs`
- Modify: `test/v5/case-output.test.mjs`

**Interfaces:**
- Consumes: accepted source, Claim/Decision evidence, Behavior outcomes, and accepted Cases/Oracles.
- Produces: compiler-owned Facts, AtomicOutcomes, FormalTestPoints, and the complete same-run/current-root provenance graph.

- [x] Write graph tests for every registered edge, missing nodes, orphan downstream nodes, illegal reverse edges, wrong roots, and cycles.
- [x] Run the tests and verify production compilation omits the required nodes and edges.
- [x] Compile stable Facts from supported Claims, split Behavior and permission dimensions into AtomicOutcomes, derive FormalTestPoints, and use those stable test points as the Case coverage denominator.
- [x] Extend provenance after Behavior and Case acceptance, validate the full graph before transaction publication, and expose the verified projection in work/result state.
- [x] Re-run focused tests and build. Commit recorded as the next atomic step.

### Task 4: Make every normative fixture independent

**Files:**
- Modify: `build/generate-v5-fixture-manifest.mjs`
- Modify: `test/v5/fixture-manifest.test.mjs`
- Modify: `tests/fixtures/v5/manifest.json`

**Interfaces:**
- Consumes: C01–C16 normative rule inventory and concrete runtime operations.
- Produces: one independently triggered, requirement-specific action and assertion per manifest leaf.

- [x] Add a uniqueness test that removes only fixture metadata and fails when two distinct requirement leaves have the same trigger/assertion body.
- [x] Run the manifest test and verify the aliased C08/C11/C12/C13/C15/C16 leaves fail.
- [x] Replace aliases with independently isolated deterministic execution inputs and a complete canonical reply golden for every named leaf, retaining the targeted corruptions already assigned to permission, terminal-integrity, canonical-array, and other negative paths.
- [x] Regenerate the manifest, run all 16 fixture groups, verify the deterministic transcript digest, and commit `test(generate-test-cases): exercise each v5 invariant independently`.

### Task 5: Clear static and release gates, then publish

**Files:**
- Modify: the `.mjs` files named by `./node_modules/.bin/tsc --noEmit -p jsconfig.json`
- Modify: `docs/superpowers/evidence/2026-09-13-v5-release-blockers.md`
- Modify: `docs/superpowers/evidence/2026-09-13-v5-release-evidence.md`
- Synchronize: `skill/generate-test-cases/**` to `../skills/generate-test-cases/**`

**Interfaces:**
- Consumes: the completed runtime, generated contracts, manifest, and release commands.
- Produces: zero TypeScript diagnostics, deterministic generated bytes, complete release evidence, and identical engineering/published Skill trees.

- [ ] Run the local TypeScript binary, group diagnostics by root cause, and fix the smallest truthful JSDoc/schema/type boundary without `@ts-nocheck` or weakened compiler settings.
- [ ] Repeat until `./node_modules/.bin/tsc --noEmit -p jsconfig.json` passes, then run the complete test/build/check/fixture/secret/diff gates exactly once on the final bytes.
- [ ] Update release evidence with exact commands, counts, digests, commit IDs, and C01–C16 traceability; change the blocker decision only when every MUST is evidenced.
- [ ] Commit `fix(generate-test-cases): clear v5 release gates`, push `codex/generate-test-cases-v5`, merge it into `main`, rerun merge-head smoke gates, and push `main`.
