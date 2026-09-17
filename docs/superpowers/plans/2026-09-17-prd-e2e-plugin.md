# PRD E2E Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a locally installable `prd-e2e` 0.1.0 plugin containing exactly `run-prd-e2e`, `generate-test-cases`, and `b2b-e2e-runner`, with deterministic orchestration artifacts and locked child snapshots.

**Architecture:** Build directly in `prd-e2e-plugin/`. The new Skill owns a closed outer state machine plus deterministic Node.js scripts for contracts, compilation, recovery decisions, and finalization; it delegates semantic generation and browser execution to the two vendored Skills. Plugin-level scripts vendor byte-identical child snapshots, hash all three Skills, verify package shape, and detect profile name conflicts without mutating the profile.

**Tech Stack:** Node.js 22+ built-in modules, Node test runner, JSON Schema artifacts, Codex Skill/plugin manifests.

**Spec:** `docs/prd-e2e-plugin/03-spec.md` (with `01-background.md` and `02-technical-design.md` as the complete baseline)

## Global Constraints

- Generator contract must remain schema `4.2.0`, compiler `0.7.0`; Runner input must remain `2.0`.
- `generate-test-cases` and `b2b-e2e-runner` are byte-for-byte snapshots except ignored `.DS_Store` files.
- Case, Step, Oracle IDs and Oracle expected text are copied without semantic rewriting.
- Non-production evidence, projected execution scope, per-case cleanup, secret protection, and Runner-exclusive judgment fail closed.
- Runtime code uses Node.js built-ins only and never visits a real target in repository tests.
- No active Codex profile installation or mutation occurs without separate authorization.

---

### Task 1: Scaffold the plugin and orchestration Skill

**Files:**
- Create: `prd-e2e-plugin/.codex-plugin/plugin.json`
- Create: `prd-e2e-plugin/package.json`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/SKILL.md`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/agents/openai.yaml`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/package.json`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/references/{workflow,handoff,recovery}.md`

**Interfaces:**
- Consumes: the three authoritative documents and Codex plugin/Skill validators.
- Produces: plugin manifest `name=prd-e2e`, Skill discovery metadata, and staged workflow routing instructions.

- [x] **Step 1: Generate the plugin scaffold with plugin-creator**

Run its `create_basic_plugin.py` for plugin name `prd-e2e`, move the generated source to the Spec-required `prd-e2e-plugin/`, and do not create a marketplace entry.

- [x] **Step 2: Generate the Skill scaffold with skill-creator**

Run `init_skill.py run-prd-e2e --path prd-e2e-plugin/skills --resources references`.

- [x] **Step 3: Replace scaffold text with the routed workflow**

Keep `SKILL.md` compact and link the three stage references. Include the exact delegation boundaries, resume-from-files rule, expected-text preservation, non-production/cleanup gates, and Runner exclusivity.

- [x] **Step 4: Validate static metadata**

Run `quick_validate.py` for `run-prd-e2e` and `validate_plugin.py` for the plugin; only manifest/Skill validation is expected at this point.

### Task 2: Implement request contracts, atomic outer Run creation, and the closed state machine

**Files:**
- Create: `prd-e2e-plugin/skills/run-prd-e2e/schemas/{request,workflow-state,execution-profile}.schema.json`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/scripts/lib/{errors,atomic-json,secrets,contracts,state-machine}.mjs`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/scripts/run.mjs`
- Test: `prd-e2e-plugin/skills/run-prd-e2e/tests/{contracts,state-machine,run}.test.mjs`

**Interfaces:**
- Consumes: `createRun({ workspaceRoot, request })` and `applyTransition({ runRoot, event })`.
- Produces: strict `request.json`, `workflow-state.json`, stable error codes, idempotent transitions, and atomic writes.

- [x] **Step 1: Write failing contract tests**

Cover unknown fields, duplicate/empty sources and URLs, unsupported protocols, user-info/auth query values, default suite name, closed profile shapes, per-case cleanup, and recursive secret rejection.

- [x] **Step 2: Run the tests and observe RED**

Run `node --test tests/contracts.test.mjs`; expect module-not-found or missing-export failure.

- [x] **Step 3: Implement strict validators and secret scanning**

Export `validateRequest`, `validateExecutionProfile`, `assertNoSecrets`, and `safeErrorDetails`; reject before returning normalized values.

- [x] **Step 4: Write failing state/run tests**

Cover every ST-002 edge, terminal blocking, `event_id` idempotency, stale `expected_seq`, illegal transitions, exclusive run directory creation, and atomic initial files.

- [x] **Step 5: Implement the minimum state machine and CLI**

Export `initialState`, `transitionState`, `createRun`, `loadRun`, and `applyTransition`. Generate `<timestamp>-<random>` internally and expose `create`, `transition`, and `inspect` CLI commands.

- [x] **Step 6: Run the slice tests GREEN**

Run `node --test tests/contracts.test.mjs tests/state-machine.test.mjs tests/run.test.mjs` and expect zero failures.

### Task 3: Implement deterministic Generator-to-Runner compilation

**Files:**
- Create: `prd-e2e-plugin/skills/run-prd-e2e/scripts/lib/{digest,generator-contract,compiler}.mjs`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/scripts/compile-runner-input.mjs`
- Test: `prd-e2e-plugin/skills/run-prd-e2e/tests/compiler.test.mjs`
- Test: `prd-e2e-plugin/tests/child-compatibility.test.mjs`

**Interfaces:**
- Consumes: `compileRunnerInput({ request, generationRef, caseDocument, executionPlanManifest, executionPlan, executionProfile, runnerValidator })`.
- Produces: `{ value, sha256 }` with Runner schema `2.0`, or a stable fail-closed code.

- [x] **Step 1: Write failing compiler tests**

Build one valid 4.2/0.7 fixture and table-driven invalid variants for digest/ref mismatch, non-Grounded/non-execute/not-ready cases, missing/duplicate IDs, missing modules, missing Step Oracles, empty expected, incomplete scope/cleanup/environment, and secrets.

- [x] **Step 2: Prove RED**

Run `node --test tests/compiler.test.mjs`; expect missing compiler exports.

- [x] **Step 3: Implement exact projection and mapping**

Select only `runner_projection.case_ids` in that order; map descriptions, IDs, action, Oracle order/text/surface/claim IDs, data conditions, test values, cleanup, lineage, and execution profile without model-generated repair.

- [x] **Step 4: Validate against the actual vendored Runner**

Dynamically import `skills/b2b-e2e-runner/scripts/lib/contracts.mjs` and call `validateTestCases` before atomically writing `runner-input.json`.

- [x] **Step 5: Add actual Generator contract compatibility tests**

Read the vendored `schema-manifest.json`, `test-bundle.schema.json`, `execution-plan.schema.json`, and Runner validator; assert exact version locks and validate the output fixture.

- [x] **Step 6: Run compiler and compatibility tests GREEN**

Run both suites and expect ID/order/text equality assertions plus Runner validation to pass.

### Task 4: Implement recovery decisions and finalization

**Files:**
- Create: `prd-e2e-plugin/skills/run-prd-e2e/scripts/lib/{recovery,finalizer}.mjs`
- Create: `prd-e2e-plugin/skills/run-prd-e2e/scripts/{resume-run,finalize-run}.mjs`
- Test: `prd-e2e-plugin/skills/run-prd-e2e/tests/{recovery,finalizer,workflow-scenarios}.test.mjs`

**Interfaces:**
- Consumes: validated outer state, authoritative child references, Runner snapshot/log/report result.
- Produces: deterministic next action, same-Run resume requirements, and `final-index.json` for `executed` or `no_execution_selected`.

- [x] **Step 1: Write failing recovery/finalizer tests**

Cover Generator-native resume, Runner `resume-check`, two Runner pauses retaining outer/Runner IDs, no side-effect replay, report-path equality, snapshot/log boundary checks, lineage mismatches, ordered checkpoint trace, and no-execution final index ordering.

- [x] **Step 2: Prove RED**

Run the three test files and observe missing implementation failures.

- [x] **Step 3: Implement recovery and finalization**

Return only the stage-legal next action. Preserve Runner counts, report boundary, result/evidence references, and never persist `chatTableMarkdown` or recompute four-state results.

- [x] **Step 4: Run behavior scenarios GREEN**

Verify automatic handoff, rejection of a direct Generator bundle as Runner input, and account-wait same-Run recovery through two pauses.

### Task 5: Implement safe vendoring, tree hashes, bundle lock, and conflict checks

**Files:**
- Create: `prd-e2e-plugin/scripts/{tree-hash,vendor-child-skills,verify-bundle,check-install-conflicts}.mjs`
- Test: `prd-e2e-plugin/tests/{vendoring,bundle-verification,conflicts}.test.mjs`
- Create: `prd-e2e-plugin/bundle-lock.json`
- Create: `prd-e2e-plugin/skills/generate-test-cases/**`
- Create: `prd-e2e-plugin/skills/b2b-e2e-runner/**`

**Interfaces:**
- Consumes: two explicit source directories and an optional target profile root.
- Produces: byte-identical snapshots, deterministic tree SHA-256 values, closed lock data, read-only conflict reports, and drift failures.

- [x] **Step 1: Write failing vendoring and conflict tests**

Cover POSIX byte ordering, `.DS_Store` omission, symlink/device/nested `.git` rejection, exact-target replacement only, source/target equality, invalid frontmatter names, non-mutating profile conflict detection, and absolute-path rejection.

- [x] **Step 2: Prove RED**

Run the three plugin test files and expect missing scripts.

- [x] **Step 3: Implement safe traversal/copy and lock writing**

Use `lstat`, `realpath`, explicit root containment, temporary sibling directories, rename, and the exact `relativePath + NUL + fileSha256 + LF` tree digest algorithm.

- [x] **Step 4: Vendor the two repository source snapshots**

Run the script with explicit `../generate-test-cases` and `../b2b-e2e-runner` sources, then compute the `run-prd-e2e` hash and atomically write the closed `bundle-lock.json`.

- [x] **Step 5: Run vendoring/lock/conflict tests GREEN**

Confirm source and vendored hashes match and test targets remain unchanged.

### Task 6: Complete package tests and documented installation smoke boundary

**Files:**
- Create: `prd-e2e-plugin/tests/plugin-package.test.mjs`
- Create: `prd-e2e-plugin/tests/install-smoke.md`
- Modify: `prd-e2e-plugin/package.json`

**Interfaces:**
- Consumes: completed plugin tree and current validators.
- Produces: one `npm test` command covering unit, compatibility, package, and bundle verification without profile installation.

- [x] **Step 1: Write package tests**

Assert exactly three Skill names, all referenced files exist, no unsafe file types, no development absolute paths/secrets/placeholders, no extra MCP/App/Hook/assets declarations, and current plugin/Skill validators pass.

- [x] **Step 2: Add install-smoke record**

Document the authorized clean-profile commands and `.invalid` discovery-only assertions; mark the smoke as not executed because profile mutation has not been authorized.

- [x] **Step 3: Run all repository-safe verification**

Run plugin unit/compatibility/package tests, the three Skill validators, plugin validator, `verify-bundle.mjs`, child source hash comparison, and `git diff --check`.

- [x] **Step 4: Review scope and child immutability**

Compare source/vendored trees, confirm no real target access or profile change occurred, and inspect the final diff for excluded features.
