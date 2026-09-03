# Generate Test Cases Execution Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, resumable execution-decision and final-delivery closure after Case classification without changing the existing PRD-to-Case semantics or starting E2E execution.

**Architecture:** Preserve `evaluateRevision` and `advanceStrict(absoluteRunDirectory)` as the only production pipeline and deep module interface. Add focused pure modules for execution inventory/events/digests and presentation/preview state, then let `advanceStrict` own persistence, atomic current tombstones, recovery, and the five existing reply kinds. Keep one canonical ready JSON as the source for mechanical Markdown and runner projection.

**Tech Stack:** Node.js 24, ECMAScript modules, JSON Schema 2020-12, Node test runner, esbuild, TypeScript checkJs.

**Spec:** `/Users/zhangxudong/Library/Group Containers/group.com.apple.notes/Accounts/F9B299C9-B93D-4A03-9E9C-4BCA07E67C16/Media/BECE7E84-5462-4167-8C33-946E5892D0A1/1_081C5E9C-A568-4D72-960E-F099331F57F8/generate-test-cases-execution-closure-spec.md`

## Global Constraints

- Artifact Schema version is exactly `2.0.0`; compiler version is exactly `0.2.0`; v1 runs return both `RUN_MIGRATION_REQUIRED` and `NEW_RUN_REQUIRED`.
- Agent-writable artifacts remain exactly `source_pack`, `evidence_claims`, `behavior_views`, and `case_drafts`.
- Runner input remains exactly one absolute run directory and stdout remains one JSON reply using only `need_artifact`, `need_user_answers`, `need_revision`, `finished`, or `fatal`.
- `execution_disposition` never changes semantic classification, evidence, Oracle, or Testability.
- Only Grounded + Execute Cases enter `runner_case_ids`; all decision items must leave Pending and the displayed plan must have a current valid confirmation before ready.
- Non-ready revisions never write final JSON/Markdown or a ready pointer; a higher non-ready revision writes a stale tombstone.
- The Skill never starts E2E execution and exposes no public CLI, npm package, MCP, network service, mode, or fifth writable artifact.
- Existing Behavior Views, Test Point, Oracle, and Case-body generation algorithms remain unchanged.

---

### Task 1: Lock the v2 closed contracts with failing tests

**Files:**
- Create: `test/core/execution-schema.test.mjs`
- Modify: `test/core/schema-validator.test.mjs`
- Modify: `test/interface/schema-integrity.test.mjs`
- Modify: `skill/generate-test-cases/scripts/schemas/source-pack.schema.json`
- Create: `skill/generate-test-cases/scripts/schemas/execution-plan.schema.json`
- Create: `skill/generate-test-cases/scripts/schemas/run-instance.schema.json`
- Create: `skill/generate-test-cases/scripts/schemas/current-pointer.schema.json`
- Create: `skill/generate-test-cases/scripts/schemas/post-ready-preview-request.schema.json`
- Modify: `skill/generate-test-cases/scripts/schemas/reply.schema.json`
- Modify: `skill/generate-test-cases/scripts/schemas/checkpoint.schema.json`
- Modify: `skill/generate-test-cases/scripts/schemas/test-bundle.schema.json`
- Modify: `skill/generate-test-cases/scripts/schemas/evidence-claims.schema.json`
- Modify: `skill/generate-test-cases/scripts/schemas/behavior-views.schema.json`
- Modify: `skill/generate-test-cases/scripts/schemas/test-obligations.schema.json`
- Modify: `skill/generate-test-cases/scripts/schemas/case-drafts.schema.json`
- Modify: `build/build.mjs`

**Interfaces:**
- Produces: closed `$defs` for `working_plan`, `ready_plan`, execution event unions, presentation snapshots, ready/stale current pointer, and open/replace/cancel preview requests.
- Consumes: existing schema validator and manifest generation.

- [ ] **Step 1: Write failing schema tests** that submit all legal union variants and independently mutate required fields, additional properties, status/reason/basis shapes, reply-purpose fields, preview bindings, and v1 versions. Each test names the rejected boundary and uses literal expected JSON pointers.
- [ ] **Step 2: Run Red** with `node --test --test-concurrency=1 test/core/execution-schema.test.mjs test/core/schema-validator.test.mjs test/interface/schema-integrity.test.mjs`; expect failures because v2/new schemas and reply branches do not exist.
- [ ] **Step 3: Implement minimal schemas** with `additionalProperties:false`, closed `oneOf` branches, `$ref` reuse, `run_instance_id`, `execution_events[]`, `request_reanalysis`, supersession, and exploratory adoption.
- [ ] **Step 4: Change build constants** to `schemaVersion='2.0.0'` and `compilerVersion='0.2.0'`, then run `npm run build` to generate manifest and bundle from source.
- [ ] **Step 5: Run Green** with the Step 2 command and `node build/build.mjs --check`; expect all PASS and fresh generated artifacts.

**Spec §17 mapping:** 13, 19, 39, 49, 59, 63, 64, 66, 75.

### Task 2: Build the unique decision inventory and execution projection

**Files:**
- Create: `src/execution-plan.mjs`
- Create: `test/core/execution-plan.test.mjs`
- Modify: `src/core.mjs`
- Modify: `src/coverage.mjs`

**Interfaces:**
- Produces: `compileExecutionPlan({semanticBundle, sourcePack, evidenceClaims, priorWorkflowState, runIdentityDigest}) -> {kind:'analysis_only'|'ready', executionPlan, diagnostics}`.
- Produces: `executionPlan.runner_case_ids` and `executionPlan.test_point_execution_coverage` as mechanical projections from one sorted `items[]` inventory.
- Consumes: existing classified bundle lanes and formal coverage ledger without changing their algorithms.

- [ ] **Step 1: Write failing inventory tests** for one Case/many TPs, many Cases/one TP, exact inventory equality, per-status defaults, legal/illegal state-disposition-reason-basis matrices, atomic Case selection, duplicate/orphan IDs, and Pending/confirmation gates.
- [ ] **Step 2: Run Red** with `node --test --test-concurrency=1 test/core/execution-plan.test.mjs`; expect missing module/export failures.
- [ ] **Step 3: Implement semantic item digests and inventory** using canonicalized visible semantics plus referenced claim semantics, with Case/formal/exploratory unique keys and default Grounded Execute / NotApplicable DNE / all other Pending behavior.
- [ ] **Step 4: Implement projections and invariants** so `runner_case_ids` is the unique sorted Grounded+Execute set and Applicable TP coverage is exactly full/partial/none with hand-counted summary equations.
- [ ] **Step 5: Integrate core private results** so `record_only` without complete decisions returns `{kind:'analysis_only'}` and strict evaluation does not produce a ready bundle before execution closure.
- [ ] **Step 6: Run Green** using the Step 2 command plus `node --test --test-concurrency=1 test/core/coverage.test.mjs test/core/core-journey.test.mjs test/core/record-only.test.mjs`.

**Spec §17 mapping:** 1–12, 17–18, 29, 40–49, 51, 60–62.

### Task 3: Replay append-only events and bind displayed confirmation

**Files:**
- Create: `src/execution-events.mjs`
- Create: `src/presentation.mjs`
- Create: `test/core/execution-events.test.mjs`
- Create: `test/core/execution-closure.test.mjs`
- Modify: `src/clarification.mjs`
- Modify: `src/decision-record.mjs`
- Modify: `src/core.mjs`

**Interfaces:**
- Produces: `replayWorkflowHistory({decisionRecords, clarificationEvents, executionEvents, priorState, currentItems})` with continuous global sequence, immutable history digest, plan/item change heads, active pause, effective decisions, and confirmation.
- Produces: deterministic `createPresentationSnapshot({purpose, entryContext, plan, groups, postReadyControl})` where final `prompt_id === presentation_id`.
- Consumes: current compiler-owned root issues and decision inventory.

- [ ] **Step 1: Write failing event tests** for exact sequence, append-batch atomicity, duplicate subject rejection, later-decision precedence, item A→B→A anti-replay, no-op head behavior, request-reanalysis invalidation, pause/resume lifecycle, and confirmation timing/authority/version binding.
- [ ] **Step 2: Run Red** with `node --test --test-concurrency=1 test/core/execution-events.test.mjs test/core/execution-closure.test.mjs`; expect missing execution replay/presentation behavior.
- [ ] **Step 3: Implement workflow replay** in strict sequence, preserve raw history, compute `workflow_event_log_digest`, update item/plan heads on every actual transition, and reject the whole batch on any invalid member.
- [ ] **Step 4: Implement user workflow states**: semantic clarification first, execution closure for Pending, final confirmation for Pending=0, ready only after a current authorized confirmation; request_delivery only enters execution closure.
- [ ] **Step 5: Implement temporary supersession, exploratory adoption, and request_reanalysis validation** without allowing any control or execution event to become evidence.
- [ ] **Step 6: Run Green** using Step 2 plus `node --test --test-concurrency=1 test/core/clarification.test.mjs test/core/source-policy.test.mjs test/core/metamorphic.test.mjs`.

**Spec §17 mapping:** 13–38, 50–52, 69–71, 76.

### Task 4: Persist run identity, tombstones, preview generations, and crash recovery

**Files:**
- Create: `src/post-ready-preview.mjs`
- Create: `test/recovery/execution-closure-recovery.test.mjs`
- Create: `test/interface/execution-closure-runner.test.mjs`
- Modify: `src/run-store.mjs`
- Modify: `src/advance-strict.mjs`
- Modify: `src/reply-routing.mjs`
- Modify: `src/entry.mjs`

**Interfaces:**
- Produces: immutable `run-instance.json`; checkpoint workflow/presentation/preview state; `current.json` ready-pointer/stale-tombstone union.
- Produces: compiler-owned one-generation `preview_control` and consumes `staging/post-ready-preview-request.json` with cached idempotent same-generation retries.
- Consumes: `compileExecutionPlan`, `replayWorkflowHistory`, and current schema registry.

- [ ] **Step 1: Write failing runner/recovery tests** for first-run identity, v1 rejection, no final writes while non-ready, stale current on higher revisions, highest-revision precedence, every specified crash boundary, and digest/head mismatch.
- [ ] **Step 2: Write failing preview tests** for open/replace/cancel/apply, ambiguous candidates, all version bindings, same-request idempotent retry, and stale open replay after replace/cancel/consume; include cancel-then-new-identical-open success.
- [ ] **Step 3: Run Red** with `node --test --test-concurrency=1 test/recovery/execution-closure-recovery.test.mjs test/interface/execution-closure-runner.test.mjs`.
- [ ] **Step 4: Implement run-store transitions** with atomic run-instance creation, accepted-history checks, non-ready tombstones, final write order JSON→Markdown→checkpoint→ready pointer, and recovery reconciliation.
- [ ] **Step 5: Implement preview state machine** with compiler-issued request IDs/epochs, exact ready/item bindings, persistent presentations, cached immediate retry, closed/consumed invalidation, and no source revision change until the presented change is confirmed.
- [ ] **Step 6: Extend reply routing** so internal execution/preview diagnostics map deterministically to one of the existing four artifacts or fail as `RUNNER_PROTOCOL_VIOLATION`, while the public runner still accepts exactly one absolute directory.
- [ ] **Step 7: Run Green** using Step 3 plus existing `test/recovery/*.test.mjs` and `test/interface/*runner*.test.mjs`.

**Spec §17 mapping:** 38–39, 49–59, 63, 66, 69–80.

### Task 5: Make canonical JSON and Markdown one deterministic ready result

**Files:**
- Modify: `src/coverage.mjs`
- Modify: `src/render-markdown.mjs`
- Create: `test/golden/execution-closure.json`
- Create: `test/golden/execution-closure.md`
- Create: `test/golden/execution-closure.test.mjs`
- Modify: `test/golden/canonical-bundles.test.mjs`
- Modify: existing journey fixtures and checked-in goldens only where v2 requires it.

**Interfaces:**
- Produces: final `test-bundle.json.execution_plan` ready projection with semantic lineage, normalized decision/confirmation digests, and `semantic_result_digest`.
- Produces: `renderMarkdown(canonicalBundle)` with Execute Cases first, DNE items second, and one reconciled coverage summary.

- [ ] **Step 1: Write failing golden tests** with hand-reviewed exact JSON/Markdown, zero-execute output, separate unit counts, volatile-audit exclusion, semantic-result recomputation, and cross-run deterministic bytes for identical event-batch structure.
- [ ] **Step 2: Run Red** with `node --test --test-concurrency=1 test/golden/execution-closure.test.mjs`; expect missing execution plan/output sections.
- [ ] **Step 3: Implement canonical ready projection** excluding run/event/prompt/time/path/revision audit fields from semantic digests, retaining source revision only at top level and raw artifact digests only in checkpoint audit lineage.
- [ ] **Step 4: Render Markdown mechanically** from the canonical bundle; never read a second plan source or accept renderer-only free text.
- [ ] **Step 5: Check in exact goldens manually** from reviewed expected semantics; tests compare bytes and never update snapshots.
- [ ] **Step 6: Run Green** using Step 2 plus all existing golden, metamorphic, and repeatability tests.

**Spec §17 mapping:** 18, 41, 46–51, 68, 72.

### Task 6: Update the Skill Adapter and user-facing policies

**Files:**
- Modify: `skill/generate-test-cases/SKILL.md`
- Modify: `skill/generate-test-cases/agents/openai.yaml`
- Modify: `skill/generate-test-cases/references/clarification-policy.md`
- Create: `skill/generate-test-cases/references/execution-closure-policy.md`
- Modify: `skill/generate-test-cases/references/evidence-policy.md`
- Modify: `skill/generate-test-cases/references/case-writing-policy.md`
- Modify: `test/interface/skill-static.test.mjs`

**Interfaces:**
- Produces: Agent behavior that reads execution policy before closure, writes only compiler-requested artifacts/private preview requests, displays returned presentations verbatim in business language, tracks three repair attempts, and never starts E2E execution.
- Consumes: v2 reply schema, `preview_control`, and compiler-generated paths/counts.

- [ ] **Step 1: Write failing behavior/static contract tests** that exercise runner replies through the Skill workflow fixtures and verify the instructions cannot turn unknown/defer/request_delivery into finished, cannot expose internal kinds, and cannot claim automatic execution.
- [ ] **Step 2: Run Red** with `node --test --test-concurrency=1 test/interface/skill-static.test.mjs test/interface/execution-closure-runner.test.mjs`.
- [ ] **Step 3: Write the execution closure policy** for §5–§8 and link it from SKILL.md before handling execution/final-confirmation/finished/post-ready changes.
- [ ] **Step 4: Update remaining policies and metadata** so decisions do not affect truth, Case selection is atomic, preview/apply/cancel rules match replies, and the fourth identical no-progress result is reported only by the Adapter as `PIPELINE_NO_PROGRESS`.
- [ ] **Step 5: Run Green** using Step 2 and validate that `agents/openai.yaml` stays concise, quoted, and aligned with the Skill.

**Spec §17 mapping:** 4, 25–39, 46, 48, 63, 65–67, 70, 73–80.

### Task 7: Build and execute the completion gate

**Files:**
- Regenerate: `skill/generate-test-cases/scripts/schema-manifest.json`
- Regenerate: `skill/generate-test-cases/scripts/test-compiler.mjs`
- Record: command outputs in the task transcript; do not install or tag.

**Interfaces:**
- Consumes all prior tasks.
- Produces the exact installed-shape Skill and evidence required by Spec §18.

- [ ] **Step 1: Run targeted closure suites**: `node --test --test-concurrency=1 test/core/execution-schema.test.mjs test/core/execution-plan.test.mjs test/core/execution-events.test.mjs test/core/execution-closure.test.mjs test/recovery/execution-closure-recovery.test.mjs test/interface/execution-closure-runner.test.mjs test/golden/execution-closure.test.mjs`.
- [ ] **Step 2: Run core regressions**: `node --test --test-concurrency=1 test/core/*.test.mjs test/golden/*.test.mjs test/interface/*.test.mjs test/recovery/*.test.mjs`.
- [ ] **Step 3: Build and verify installed runner**: `npm run build`, `node --check skill/generate-test-cases/scripts/test-compiler.mjs`, `node build/build.mjs --check`, then runner import/0/1/2+-argument tests.
- [ ] **Step 4: Run full repository gate**: `npm run check`; require exit 0.
- [ ] **Step 5: Run official validator** using the resolved dependency-complete Python and `quick_validate.py` against `skill/generate-test-cases`; require exit 0 or report exact `VALIDATOR_UNAVAILABLE`/`VALIDATOR_FAILED`.
- [ ] **Step 6: Verify clean generated shape and digests** with `git status --porcelain`, `shasum -a 256` for compiler/schema/manifest/SKILL/bundle, and inspect no global install or tag occurred.
- [ ] **Step 7: Commit only scoped source, schema, Skill, tests, goldens, and generated artifacts** after all gates pass.

**Spec §17 mapping:** 1–80; **Spec §18:** all completion bullets.

## Self-review

- Spec coverage: Tasks 1–7 map every §17 item and all §16 required file groups; Task 7 verifies §18.
- Placeholder scan: no TBD/TODO/“similar to” implementation gaps; each task names concrete files, interfaces, Red command, implementation behavior, and Green command.
- Type consistency: `compileExecutionPlan`, `replayWorkflowHistory`, presentation snapshots, preview controls, five reply statuses, four writable stages, and v2 versions are named consistently across producer and consumer tasks.
