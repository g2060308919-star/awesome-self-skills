# generate-test-cases General Quality v4.3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship schema `4.3.0` / compiler `0.8.0` as a version-bound enhancement that adds auditable design assurance, strict critical-semantic delivery blocking, content-bound independent review, and independent quality evaluation without regressing the accepted V4 source, clarification, case, rendering, recovery, or execution contracts.

**Architecture:** Keep the existing four Agent-writable artifacts and pipeline. Add three compiler-owned modules (`design-assurance-v4.mjs`, `semantic-delivery-gate-v4.mjs`, and `independent-review-v4.mjs`), then integrate them at artifact validation, stage progression, finalization, canonical delivery, and recovery boundaries. Preserve `4.0.0/0.5.0` and `4.2.0/0.7.0` behavior exactly; activate new semantics only for `4.3.0/0.8.0`.

**Tech Stack:** Node.js 20+ ESM, JSON Schema, `node:test`, TypeScript `checkJs`, esbuild, deterministic canonical JSON and generated Markdown/HTML/CSV projections.

**Spec:** `docs/superpowers/specs/2026-09-17-generate-test-cases-general-quality-v43-design.md`

## Global constraints

- [x] Treat the supplied `03-spec.md` as normative and use the approved design as the implementation contract.
- [x] Change maintained source under `generate-test-cases-engineering/`; regenerate the published `generate-test-cases/` tree only through the established build/sync workflow.
- [x] Do not change `b2b-e2e-runner` source. Its tests are a read-only consumer check.
- [x] Do not overwrite an installed Skill, rewrite historical runs, publish, tag, merge, or push as part of implementation.
- [x] Keep exactly four Agent-writable semantic artifacts and no additional public workflow stage.
- [x] Keep ordinary confirmation non-authorizing, and keep generation separate from execution.
- [x] Run each behavioral slice red-green-refactor; record exact commands and observed results in the evidence document.

---

## Task 1: Bind the 4.3.0 / 0.8.0 contract without reinterpreting older runs

**Files:**

- Modify: `generate-test-cases-engineering/src/v4-contract.mjs`
- Modify: `generate-test-cases-engineering/src/contracts.mjs`
- Modify: `generate-test-cases-engineering/src/entry.mjs`
- Modify: `generate-test-cases-engineering/src/advance-v4.mjs`
- Modify: `generate-test-cases-engineering/src/source-acquisition-v4.mjs`
- Modify: `generate-test-cases-engineering/src/prd-source-collection-v4.mjs`
- Modify: `generate-test-cases-engineering/src/revision-transaction-v4.mjs`
- Modify: `generate-test-cases-engineering/build/build.mjs`
- Modify: `generate-test-cases-engineering/schemas/*.schema.json`
- Test: `generate-test-cases-engineering/test/core/v4-general-quality-contract.test.mjs`
- Test: `generate-test-cases-engineering/test/interface/v4-general-quality-versioning.test.mjs`

- [x] Add a failing contract test asserting these exact exports:

  ```js
  export const GENERAL_QUALITY_V4_CONTRACT = Object.freeze({
    schema_version: "4.3.0",
    compiler_version: "0.8.0",
    candidate: true,
    strict_semantic_delivery: true
  });

  export function latestV4Contract() {}
  export function isGeneralQualityV4Contract(value) {}
  ```

- [x] Assert that new run bootstrap and default artifact construction use `4.3.0/0.8.0`.
- [x] Assert that exact legacy pairs `4.0.0/0.5.0` and `4.2.0/0.7.0` remain accepted, while mixed or unknown pairs fail closed.
- [x] Run the focused tests and capture the expected red result:

  ```bash
  cd generate-test-cases-engineering
  node --test test/core/v4-general-quality-contract.test.mjs test/interface/v4-general-quality-versioning.test.mjs
  ```

- [x] Implement one shared version-pair registry and replace scattered candidate-only checks with named predicates.
- [x] Update every artifact schema `const`/version union and schema-manifest binding to recognize `4.3.0`, without relaxing `additionalProperties: false`.
- [x] Keep generated `test-compiler.mjs` and schema manifest build-owned; do not edit them directly.
- [x] Re-run the focused tests, `test/core/v4-candidate-contract.test.mjs`, and `test/interface/schema-integrity.test.mjs` green.
- [x] Commit atomically:

  ```bash
  git add generate-test-cases-engineering
  git commit -m "feat(generate-test-cases): bind v4.3 contract identity"
  ```

---

## Task 2: Make source-to-design responsibility and candidate disposition auditable

**Files:**

- Create: `generate-test-cases-engineering/src/design-assurance-v4.mjs`
- Modify: `generate-test-cases-engineering/schemas/behavior-views.schema.json`
- Modify: `generate-test-cases-engineering/src/revision-artifact-validation-v4.mjs`
- Modify: `generate-test-cases-engineering/src/v4-pipeline.mjs`
- Create: `generate-test-cases-engineering/test/helpers/v4-general-quality-fixture.mjs`
- Create: `generate-test-cases-engineering/test/core/v4-source-fidelity-protection.test.mjs`
- Create: `generate-test-cases-engineering/test/core/v4-design-assurance.test.mjs`

- [x] Add source-fidelity protection tests for AT01-AT03: all readable channels, AND/OR/exception conservation, conflicting sources, and readable omission versus semantic ambiguity.
- [x] Add failing AT04-AT09 tests for missing rule groups, missing responsibilities, duplicate/unknown candidates, invalid retained targets, cyclic merges, unsupported exclusions, incomplete batches, and stale plan revisions.
- [x] Define the closed 4.3 `behavior_views.design_assurance` shape with:

  ```text
  plan_revision
  batches[]
  rule_groups[]
  candidate_responsibilities[]
  candidate_dispositions[]
  impacted_prior_batches[]
  ```

- [x] Restrict disposition to `retained`, `representative_value`, `equivalent_merge`, `evidence_exclusion`, `semantic_gap`, or `exploratory`.
- [x] Implement `validateDesignAssuranceV4(input, context) -> { diagnostics, normalized }` with total disposition, exact-reference, non-cyclic target, batch-completion, and current-plan checks.
- [x] Reject source-free exclusion and merge claims; do not promote design rationale to E3 evidence.
- [x] Integrate validation only for `4.3.0/0.8.0`; preserve older artifact shapes and results.
- [x] Re-run focused tests and the existing source/compiler/view suites green.
- [x] Commit atomically:

  ```bash
  git add generate-test-cases-engineering/src generate-test-cases-engineering/schemas generate-test-cases-engineering/test
  git commit -m "feat(generate-test-cases): add auditable design assurance"
  ```

---

## Task 3: Protect case atomicity, same-object flows, and resource independence

**Files:**

- Create: `generate-test-cases-engineering/test/core/v4-case-quality-protection.test.mjs`
- Modify only if a protection test exposes a defect: `generate-test-cases-engineering/src/case-semantics-v4.mjs`
- Modify only if a protection test exposes a defect: `generate-test-cases-engineering/src/ordering-registry.mjs`
- Modify only if a protection test exposes a defect: `generate-test-cases-engineering/src/obligations/business-outcomes-v4.mjs`

- [x] Encode AT10-AT15 protection fixtures proving one Case has one independently diagnosable primary result.
- [x] Prove complete flows keep one business object and preserve key prerequisite steps instead of pre-seeding the terminal state.
- [x] Prove complete-flow Cases supplement rather than replace required single-point Cases.
- [x] Prove explicit enum values and permission outcomes are retained and traceable.
- [x] Prove manual-only Cases remain generatable when account, URL, selector, or API-field execution resources are absent.
- [x] Run the new test first; if it is already green, record it as protection evidence and do not rewrite correct baseline logic.
- [x] If a defect is exposed, make the smallest compiler-side fix and re-run `v4-business-outcome-obligations`, `v4-generation-resource-independence`, ordering, and canonical delivery tests.
- [x] Commit protection evidence or the minimal fix atomically.

---

## Task 4: Enforce final critical-semantic resolution across every delivery path

**Files:**

- Create: `generate-test-cases-engineering/src/semantic-delivery-gate-v4.mjs`
- Modify: `generate-test-cases-engineering/schemas/evidence-claims.schema.json`
- Modify: `generate-test-cases-engineering/schemas/checkpoint.schema.json`
- Modify: `generate-test-cases-engineering/schemas/test-bundle.schema.json`
- Modify: `generate-test-cases-engineering/src/semantic-gaps-v4.mjs`
- Modify: `generate-test-cases-engineering/src/clarification-v4.mjs`
- Modify: `generate-test-cases-engineering/src/final-outcome-v4.mjs`
- Modify: `generate-test-cases-engineering/src/v4-pipeline.mjs`
- Modify: `generate-test-cases-engineering/src/canonical-delivery-v4.mjs`
- Modify: `generate-test-cases-engineering/src/revision-transaction-v4.mjs`
- Create: `generate-test-cases-engineering/test/core/v4-critical-delivery-gate.test.mjs`
- Create: `generate-test-cases-engineering/test/interface/v4-critical-delivery-journey.test.mjs`
- Create: `generate-test-cases-engineering/test/recovery/v4-critical-delivery-recovery.test.mjs`

- [x] Add failing AT16-AT22 and AT26-AT27 tests that distinguish semantic impact from risk and block all formal delivery paths for unresolved critical roots.
- [x] Extend 4.3 semantic gaps with closed `acceptance_impact` records:

  ```json
  {
    "classification": "critical",
    "criteria": ["changes_required_branch"],
    "rationale": "Different answers change the required approval branch."
  }
  ```

- [x] Permit critical criteria only from `changes_core_acceptance`, `changes_required_branch`, and `makes_required_result_undecidable`; permit noncritical only with `does_not_change_required_acceptance`.
- [x] Include impact in semantic-root identity so changed classification invalidates stale answers and choices.
- [x] Implement `deriveSemanticDeliveryGateV4({ contract, roots, rootStates, decisions })` and `availableSemanticActionsV4(root, state)`.
- [x] Treat only a scope-valid final E3 Decision, legal replayable E2 derivation, or evidence-backed non-applicability/obsolescence as final critical resolution.
- [x] Keep temporary E1, defer, unknown, `resolved_temporary`, `request_delivery`, ordinary confirmation, stale events, and old ready manifests non-resolving.
- [x] Make mixed critical/noncritical `request_delivery` selection fail atomically; continue to allow noncritical Conditional delivery.
- [x] Preserve deferred/unknown critical roots as recoverable presentable questions.
- [x] Recheck the gate in final outcome, finalization, materialization, current-pointer publication, and transaction recovery.
- [x] Prove old 4.2 runs retain their prior delivery semantics.
- [x] Run focused core/interface/recovery tests plus existing partial-answer, delivery-intent, two-phase clarification, and candidate transaction suites green.
- [x] Commit atomically.

---

## Task 5: Bind source-first independent review to the generated content reviewed

**Files:**

- Create: `generate-test-cases-engineering/src/independent-review-v4.mjs`
- Modify: `generate-test-cases-engineering/schemas/case-drafts.schema.json`
- Modify: `generate-test-cases-engineering/schemas/reply.schema.json`
- Modify: `generate-test-cases-engineering/src/revision-artifact-validation-v4.mjs`
- Modify: `generate-test-cases-engineering/src/v4-pipeline.mjs`
- Modify: `generate-test-cases-engineering/src/advance-v4.mjs`
- Modify: `generate-test-cases-engineering/src/agent-action-adapter-v4.mjs`
- Create: `generate-test-cases-engineering/test/core/v4-independent-review.test.mjs`
- Create: `generate-test-cases-engineering/test/interface/v4-independent-review-runner.test.mjs`
- Create: `generate-test-cases-engineering/test/recovery/v4-independent-review-recovery.test.mjs`

- [x] Add failing AT23-AT24 tests for absent source-first targets, unsupported reviewer claims, target/reference mismatches, stale digests, generated-content changes, review-only prose changes, and crash/retry behavior.
- [x] Implement `compileIndependentReviewTargetV4(input) -> { projection, digest }` over relevant Facts, Views, formal test points, responsibilities, Case preconditions, data, steps, and Oracles.
- [x] Exclude the independent-review record and review-derived summaries from the target projection to avoid digest self-reference.
- [x] Implement `validateIndependentReviewV4(review, target, context)` with exact source/Decision references, closed findings, supported disposition, affected-item validation, and recheck rules.
- [x] Use the existing `case_drafts` stage twice: a schema-valid pending submission returns `need_revision.review_request`; a completed submission repeats current generated content and binds the compiler-issued digest.
- [x] Reject prior review when generated content changes; keep digest stable when only excluded review prose changes.
- [x] Ensure staging-only review attempts are never accepted during recovery.
- [x] Preserve the public stage list and four-artifact invariant.
- [x] Run focused tests plus existing case-draft, reply-contract, stage-progression, and idempotent-append suites green.
- [x] Commit atomically.

---

## Task 6: Produce one authoritative 4.3 JSON family and deterministic projections

**Files:**

- Modify: `generate-test-cases-engineering/src/canonical-output-v4.mjs`
- Modify: `generate-test-cases-engineering/src/canonical-delivery-v4.mjs`
- Modify: `generate-test-cases-engineering/src/case-document-presentation-v4.mjs`
- Modify: `generate-test-cases-engineering/src/business-markdown-v4.mjs`
- Modify: `generate-test-cases-engineering/schemas/presentation.schema.json`
- Modify: `generate-test-cases-engineering/schemas/current-pointer.schema.json`
- Create: `generate-test-cases-engineering/test/golden/v4-general-quality-presentation.test.mjs`
- Create: `generate-test-cases-engineering/test/recovery/v4-general-quality-delivery.test.mjs`

- [x] Add failing golden/recovery tests requiring full root finality, design-assurance summary, independent-review summary, and current review digest in 4.3 canonical JSON.
- [x] Retain `resolved_final` versus `resolved_temporary` in the authoritative 4.3 root ledger.
- [x] Generate HTML primary reading output, full conversation Table, Markdown, CSV, manifest, checkpoint, and summaries solely from canonical JSON.
- [x] Verify JSON/HTML/Table/Markdown/CSV carry identical Case identities, counts, enum/permission coverage, and result meaning.
- [x] Ensure a newer non-ready revision prevents an older ready manifest becoming current.
- [x] Preserve byte-exact 4.2 candidate golden families.
- [x] Run focused goldens, all existing v4 presentation tests, and candidate transaction recovery green.
- [x] Commit atomically.

---

## Task 7: Add independently adjudicated quality evaluation and AT01-AT31 evidence

**Files:**

- Create: `generate-test-cases-engineering/benchmark/general-quality-metrics.mjs`
- Create: `generate-test-cases-engineering/benchmark/general-quality-v1/manifest.json`
- Create: `generate-test-cases-engineering/benchmark/general-quality-v1/fixtures/*.json`
- Create: `generate-test-cases-engineering/test/benchmark/v4-general-quality-corpus.test.mjs`
- Create: `generate-test-cases-engineering/docs/remediation/2026-09-17-general-quality-v43-evidence.md`

- [x] Freeze the evaluation manifest before implementation tuning: fixtures, holdout membership, target classes, run conditions, and comparison rules.
- [x] Implement `evaluateIndependentTargets({ requiredTargets, cases })` with:

  ```text
  effective_required_target_coverage =
    correctly supported, decidable, responsibility-fulfilling targets
    / independently adjudicated required targets
  ```

- [x] Count duplicate Cases once, exclude context-only targets, report primary/boundary targets separately, and treat zero denominator as not applicable.
- [x] Make rule-correctness regression, unsupported assertions, critical bypass, and required-scenario deletion hard failures instead of averaged scores.
- [x] Add failing then passing metric tests for omission, duplication, unsupported claims, undecidable results, gaps, exploratory entries, and comparable before/after inputs.
- [x] Run the fixed corpus and record observed before/after results; do not substitute generated test points or self-reported coverage for independent targets.
- [x] Build an AT01-AT31 trace table with test name, fixture, command, observed result, and limitation. Mark anything not run as unverified.
- [x] Commit evaluator, frozen fixtures, tests, and evidence atomically.

---

## Task 8: Build, publish the repository copy, and run release-candidate verification

**Files:**

- Modify: `generate-test-cases-engineering/README.md`
- Modify: `generate-test-cases-engineering/skill/generate-test-cases/SKILL.md`
- Modify: `generate-test-cases-engineering/skill/generate-test-cases/references/*.md`
- Generated: `generate-test-cases-engineering/skill/generate-test-cases/**`
- Generated: `generate-test-cases/**`
- Update: `generate-test-cases-engineering/docs/remediation/2026-09-17-general-quality-v43-evidence.md`

- [x] Update policy text to explain 4.3 design assurance, strict critical gate, two-pass same-stage review, independent metric, and old-version compatibility without asking the Agent to guess fields.
- [x] Run the maintained-source build and established repository publication sync:

  ```bash
  cd generate-test-cases-engineering
  npm run build
  ```

- [x] Confirm `generate-test-cases/` is byte-synchronized with the built Skill and contains schema/compiler identity `4.3.0/0.8.0`.
- [x] Run complete validation and record exact counts/durations:

  ```bash
  cd generate-test-cases-engineering
  npm run check
  npm run test:benchmark
  npm run public-pilot
  ```

- [x] Run the E2E Runner consumer check without modifying it:

  ```bash
  node --test b2b-e2e-runner/tests/*.test.mjs
  ```

- [x] Verify `git diff --name-only origin/main...HEAD -- b2b-e2e-runner` is empty.
- [x] Verify no installed Skill path outside the repository changed.
- [x] Run `git diff --check`, inspect the full diff, and separate implementation-candidate completion from release-acceptance completion in the evidence report.
- [x] Commit the final generated publication and verification evidence:

  ```bash
  git add generate-test-cases-engineering generate-test-cases
  git commit -m "build(generate-test-cases): publish v4.3 quality candidate"
  ```

## Completion report

- [x] Report actual source and generated files changed.
- [x] Report observed focused, full, benchmark, public-pilot, repeatability, and consumer-check results.
- [x] Report AT01-AT31 individually, including any unverified or failed item.
- [x] Report old V4 comparison evidence and compatibility risks.
- [x] Report installation state explicitly; implementation does not imply installation.
- [x] Do not claim release acceptance unless every required external corpus, independent adjudication, repetition, and runtime condition was actually satisfied.
