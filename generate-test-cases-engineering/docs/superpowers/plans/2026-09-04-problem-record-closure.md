# Generate Test Cases Problem-Record Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all actionable defects in both problem records while preserving the private compiler interface and canonical JSON authority.

**Architecture:** Add source-body and source-review gates before evidence compilation, unify terminal and formal exclusions in final coverage, enforce Case outcome atomicity during classification, and replace the primary Markdown path with a business-first projection plus an audit appendix and manual worksheet. Build the installed bundle only from modular source.

**Tech Stack:** Node.js ESM, JSON Schema Draft 2020-12, `node:test`, esbuild, TypeScript check mode.

**Spec:** `docs/superpowers/specs/2026-09-04-problem-record-closure-design.md`

## Global Constraints

- The retired `generate-test-cases-remediation-spec.md` is not an authority.
- Keep exactly four Agent-writable artifacts and one private `advanceStrict(absoluteRunDirectory)` entry.
- Canonical JSON is normative; Markdown and worksheets are mechanical projections.
- Do not add a runner, automation code generator, public CLI/npm/MCP/network service, comparator, expert benchmark, global install, or tag.
- Modify modular source and schemas first; regenerate `scripts/test-compiler.mjs` with `npm run build`.
- Preserve closed schemas, deterministic output, append-only recovery, and execution-confirmation anti-replay rules.

---

### Task 1: Recompute source digests and validate exhaustive source reviews

**Files:**
- Modify: `skill/generate-test-cases/scripts/schemas/source-pack.schema.json`
- Modify: `src/decision-record.mjs`
- Modify: `src/evidence.mjs`
- Modify: `src/advance-strict.mjs`
- Modify: `test/core/evidence.test.mjs`
- Modify: `test/interface/stage-progression.test.mjs`
- Modify: `test/helpers/run-journey.mjs`

**Interfaces:**
- Consumes: `sourcePack.sources`, `sourcePack.locators`, `sourcePack.source_reviews`, and accepted Evidence Claims.
- Produces: `validateSourceIntegrity(sourcePack)` diagnostics and `validateSourceReviewClaims(sourcePack, evidenceClaims)` diagnostics.

- [ ] **Step 1: Write failing source-digest tests**

Add tests that mutate `source.content` while retaining the declared digest and expect `SOURCE_CONTENT_DIGEST_MISMATCH`; also assert unchanged content passes.

- [ ] **Step 2: Run the source-integrity test and record RED**

Run: `node --test --test-name-pattern='source content digest|source review' test/core/evidence.test.mjs`

Expected: the mutated content is accepted or the new API is absent.

- [ ] **Step 3: Implement source digest recomputation**

Use `createHash('sha256').update(source.content, 'utf8').digest('hex')` inside the source integrity gate. Emit a reference diagnostic at `/sources/<index>/content_digest` without changing locator semantics.

- [ ] **Step 4: Write failing exhaustive-review tests**

Cover missing review, dangling/duplicate review, digest mismatch, uncovered non-whitespace text, overlapping spans, invalid ranges, and a valid fully covered review. Add an Evidence test in which a normative span has no overlapping direct Claim locator.

- [ ] **Step 5: Run the review tests and record RED**

Run: `node --test --test-name-pattern='source review|normative span' test/core/evidence.test.mjs test/interface/stage-progression.test.mjs`

Expected: incomplete reviews and an omitted normative span are accepted.

- [ ] **Step 6: Implement the closed review contract and evidence bridge**

Require `source_reviews[] = { source_id, content_digest, spans[] }` and `spans[] = { span_id, start, end, classification, rationale }`. Validate dense non-whitespace coverage and overlap in `decision-record.mjs`. At the evidence boundary, require each normative or uncertain span to overlap at least one direct Claim locator from the same source.

- [ ] **Step 7: Update fixtures and verify GREEN**

Centralize fixture digest/review construction in `test/helpers/run-journey.mjs`; update hand-written fixtures with literal, hand-checked review spans. Run the commands from Steps 2 and 5 and confirm PASS.

- [ ] **Step 8: Commit the slice**

Run: `git add skill/generate-test-cases/scripts/schemas/source-pack.schema.json src/decision-record.mjs src/evidence.mjs src/advance-strict.mjs test && git commit -m "fix: verify complete source extraction"`

### Task 2: Expose terminal requirement exclusions in canonical coverage

**Files:**
- Modify: `skill/generate-test-cases/scripts/schemas/test-bundle.schema.json`
- Modify: `src/coverage.mjs`
- Modify: `src/execution-plan.mjs`
- Modify: `test/core/coverage.test.mjs`
- Modify: `test/core/execution-plan.test.mjs`

**Interfaces:**
- Consumes: formal NotApplicable dispositions and terminal `fact_routes`.
- Produces: closed `coverage.not_applicable[]` records discriminated by `subject_kind`.

- [ ] **Step 1: Replace the old terminal-only expectation with a failing visibility test**

Expect terminal NotApplicable facts to produce `{ subject_kind: 'requirement_fact', fact_id, subject, exclusion_claim_id, scope, support_review, reason }`; retain a formal entry using `subject_kind: 'formal_test_point'`. The compiler-owned `subject` comes from accepted requirement evidence so the business view never needs an internal ID as its label.

- [ ] **Step 2: Run and record RED**

Run: `node --test --test-name-pattern='NotApplicable|terminal' test/core/coverage.test.mjs test/core/execution-plan.test.mjs`

Expected: the terminal record is missing.

- [ ] **Step 3: Implement the unified projection**

Build and canonically sort both variants in `coverage.mjs`. Filter `requirement_fact` entries out of the execution-decision universe so execution summary denominators remain formal-only.

- [ ] **Step 4: Run and verify GREEN**

Run the Step 2 command and confirm both coverage visibility and execution-plan isolation pass.

- [ ] **Step 5: Commit the slice**

Run: `git add skill/generate-test-cases/scripts/schemas/test-bundle.schema.json src/coverage.mjs src/execution-plan.mjs test/core && git commit -m "fix: report terminal requirement exclusions"`

### Task 3: Enforce independently diagnosable Case outcomes

**Files:**
- Modify: `src/classify.mjs`
- Modify: `test/core/classification.test.mjs`
- Modify: `skill/generate-test-cases/references/case-writing-policy.md`

**Interfaces:**
- Consumes: obligation-oracle expectations from one Case Draft.
- Produces: deterministic `CASE_OUTCOME_NOT_ATOMIC` diagnostics for mixed observed outcomes.

- [ ] **Step 1: Write failing atomicity tests**

Create one Case with two obligations closed by different observation targets or Oracle expected values and expect revision; create a sibling with two obligations sharing the same hand-derived outcome signature and expect acceptance.

- [ ] **Step 2: Run and record RED**

Run: `node --test --test-name-pattern='atomic|diagnosable outcome' test/core/classification.test.mjs`

Expected: the mixed Case remains accepted.

- [ ] **Step 3: Implement the structural atomicity gate**

Derive the signature only from action/observer/surface/target/Oracle semantics, excluding evidence refs and obligation IDs. Reject more than one signature in a Case without imposing a count limit.

- [ ] **Step 4: Run and verify GREEN**

Run the Step 2 command and the complete classification test file.

- [ ] **Step 5: Commit the slice**

Run: `git add src/classify.mjs test/core/classification.test.mjs skill/generate-test-cases/references/case-writing-policy.md && git commit -m "fix: require atomic case outcomes"`

### Task 4: Render business-first delivery and an audit appendix

**Files:**
- Modify: `src/render-markdown.mjs`
- Modify: `test/core/execution-markdown.test.mjs`
- Modify: `test/golden/markdown.test.mjs`
- Modify: `test/golden/journeys/*.md`

**Interfaces:**
- Consumes: canonical final Test Bundle.
- Produces: byte-deterministic Markdown with business display ordering and an ID-bearing audit appendix.

- [ ] **Step 1: Write failing business-view tests**

Assert the primary path contains readiness/coverage overview, named risk fields, business-order display numbers, distinct gap/exclusion sections, and no `case_`, `fact_`, `obligation_`, or `claim_` identifiers before `## Audit Appendix`.

- [ ] **Step 2: Run and record RED**

Run: `node --test --test-name-pattern='business-first|audit appendix|business order' test/core/execution-markdown.test.mjs test/golden/markdown.test.mjs`

Expected: current audit-heavy Markdown fails.

- [ ] **Step 3: Implement deterministic business sorting and primary rendering**

Sort presentation copies by disposition, scope, risk rank, role, title, then stable ID. Render summaries and cases with display numbers while retaining canonical arrays unchanged.

- [ ] **Step 4: Move traceability detail into the audit appendix**

Render IDs, formal mappings, evidence references, digests, and detailed coverage ledgers only after `## Audit Appendix`. Keep all content sourced from the canonical bundle.

- [ ] **Step 5: Verify GREEN and review goldens manually**

Run the Step 2 command, inspect every changed Markdown golden, and run `node --test test/golden/*.test.mjs`.

- [ ] **Step 6: Commit the slice**

Run: `git add src/render-markdown.mjs test/core/execution-markdown.test.mjs test/golden && git commit -m "feat: render business-first test delivery"`

### Task 5: Add a mechanical manual-execution worksheet

**Files:**
- Modify: `src/render-markdown.mjs`
- Modify: `test/core/execution-markdown.test.mjs`
- Modify: `skill/generate-test-cases/SKILL.md`
- Modify: `skill/generate-test-cases/references/execution-closure-policy.md`
- Modify: `skill/generate-test-cases/references/case-writing-policy.md`

**Interfaces:**
- Consumes: confirmed `execution_plan.items`, `runner_case_ids`, and `bundle_digest` supplied at delivery.
- Produces: a blank, non-normative worksheet plus Skill guidance for downstream records bound to `bundle_digest + case_id`.

- [ ] **Step 1: Write failing worksheet and Skill pressure tests**

Assert only Grounded+Execute Cases appear, every row reconciles to `runner_case_ids`, result/defect/notes remain unrecorded, and rendered text states that generated Cases were not executed. Pressure-test that the Skill does not write results back into canonical JSON.

- [ ] **Step 2: Run and record RED**

Run: `node --test --test-name-pattern='worksheet|execution record' test/core/execution-markdown.test.mjs test/interface/execution-closure-skill.test.mjs`

Expected: the worksheet is absent.

- [ ] **Step 3: Implement the worksheet projection and Skill instructions**

Render one row per `runner_case_id`, with display number, title, scope, named risk, role, Result=`Not recorded`, Defect=`—`, Notes=`—`. Tell the user to copy these fields into a downstream execution record keyed by bundle digest and Case ID; never mutate the canonical result or start E2E execution.

- [ ] **Step 4: Run and verify GREEN**

Run the Step 2 command and independently compare worksheet IDs/counts to the canonical execution plan.

- [ ] **Step 5: Commit the slice**

Run: `git add src/render-markdown.mjs skill/generate-test-cases test && git commit -m "feat: add manual execution worksheet"`

### Task 6: Version contracts, rebuild, and close every problem record

**Files:**
- Modify: `build/build.mjs`
- Modify: all affected `skill/generate-test-cases/scripts/schemas/*.json`
- Modify: `src/entry.mjs`, `src/advance-strict.mjs`, `src/run-store.mjs`, `src/core.mjs`, `src/coverage.mjs`, `src/classify.mjs`, `src/obligations/compile-obligations.mjs`
- Modify: affected fixtures and golden JSON
- Create: `docs/remediation/2026-09-04-problem-record-closure.md`
- Generate: `skill/generate-test-cases/scripts/test-compiler.mjs`

**Interfaces:**
- Produces: compiler `0.3.0`, schema `2.1.0`, synchronized manifest, maintainable source tree, and installed-shape artifact.

- [ ] **Step 1: Write failing migration and manifest tests**

Assert `2.0.0` Source Packs return migration/new-run, `2.1.0` is accepted, embedded versions match manifest, and schema tampering fails.

- [ ] **Step 2: Run and record RED**

Run: `node --test --test-name-pattern='migration|schema integrity|manifest' test/interface/*.test.mjs test/recovery/*.test.mjs`

Expected: the runtime still identifies `2.0.0` as current.

- [ ] **Step 3: Bump all contracts together**

Change schema constants to `2.1.0`, compiler constants to `0.3.0`, update fixtures without weakening validation, and regenerate manifest/bundle with `npm run build`.

- [ ] **Step 4: Run targeted and original regressions**

Run:

```bash
node --test --test-name-pattern='source content digest|source review|normative span|NotApplicable|atomic|business-first|worksheet|migration|schema integrity' test/core/*.test.mjs test/interface/*.test.mjs test/recovery/*.test.mjs
node --test --test-name-pattern='journey|classification|coverage|execution closure|recovery|source revision|golden|determinism' test/core/*.test.mjs test/golden/*.test.mjs test/interface/*.test.mjs test/recovery/*.test.mjs test/repeatability/*.repeat.mjs
```

- [ ] **Step 5: Run full engineering gates**

Run:

```bash
npm run check
node --check skill/generate-test-cases/scripts/test-compiler.mjs
```

Then run the official validator with the resolved Python and validator paths.

- [ ] **Step 6: Synchronize and compare the repository-published Skill**

Copy the built installed shape from `generate-test-cases-engineering/skill/generate-test-cases` to the repository's top-level `generate-test-cases`, then require `diff -qr` to be empty and run runner-contract smoke tests against the top-level path.

- [ ] **Step 7: Record closure evidence**

In `docs/remediation/2026-09-04-problem-record-closure.md`, map every `GTCC-*` and `GTC-*` issue to verdict, changed seam, test, and result. Mark out-of-scope real execution records as a downstream artifact while documenting that the new worksheet supports capture without pretending execution occurred.

- [ ] **Step 8: Review, verify, and commit**

Run `git diff --check`, inspect staged diff for secrets and generated/source consistency, complete spec and code-quality review, then commit with `fix: close generate test case problem records`.
