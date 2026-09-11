# Generate Test Cases V5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing `generate-test-cases` V4 implementation in place to the single operational V5 workflow defined by the normative development contract, with all C01–C16 requirements, generated contracts, crash-safe storage, deterministic output, and no V4 runtime path.

**Architecture:** Keep the proven canonicalization, source-boundary, evidence, Case, transaction, and rendering algorithms that remain compatible, but place them behind three V5-only public APIs. Drive the runtime from closed JSON Schemas and generated policy registries; persist every mutation as a content-addressed transaction whose pointer publication is the final atomic step. Compiler-owned semantic seeds, provenance, clarification reductions, Cases, and renderings are derived from the four permitted Agent artifacts and accepted Decisions only.

**Tech Stack:** Node.js 20+ ESM, JSON Schema Draft 2020-12, TypeScript checking through `jsconfig.json`, Node test runner, esbuild, SHA-256/HKDF, POSIX atomic rename and advisory lock directories.

**Spec:** `/Users/zhangxudong/Library/Group Containers/group.com.apple.notes/Accounts/F9B299C9-B93D-4A03-9E9C-4BCA07E67C16/Media/8F7A39F2-E8D9-431E-83CA-1E67BE5DD43B/1_A3BE10B0-50D8-4046-9DB5-6E09E27B63A6/03-development-spec.md`

## Global Constraints

- `03-development-spec.md` is the only normative development and acceptance contract; documents 01 and 02 are background and architecture context only.
- Workflow version is V5, every operational Schema version is exactly `5.0.0`, and compiler version is exactly `0.6.0`.
- The only public APIs are `createV5RunDirectory`, `advanceV5Run`, and `inspectV5Run`; the CLI accepts one absolute run directory and calls `inspectV5Run` only.
- Only `source_pack`, `evidence_claims`, `behavior_views`, and `case_drafts` are Agent-writable semantic artifacts.
- V5 is the only operational generation path: no V4 reader, writer, generator, dispatch, fallback, migration, version selector, or operational Schema remains.
- Existing V4 run bytes are never modified, migrated, resumed, or accepted as V5 input.
- Every public input, persisted record, registry, policy, and reply is closed and validated at its trust boundary.
- Accepted objects, transactions, receipts, indexes, replies, checkpoints, selector sidecars, and pointers are content-addressed and cross-bound before publication.
- The action-token master key is injected through an internal service boundary, is never persisted or logged, and tokens use HKDF-bound checkpoint/capability preimages.
- Telemetry and diagnostics may contain bounded identifiers and error codes, but never complete sources, complete answers, credentials, action-token key material, or sensitive business values.
- `tests/fixtures/v5/manifest.json` is the fixture runner's only discovery source; all manifest paths are validated relative POSIX paths and local-file fixtures use the exact deterministic `/tmp/generate-test-cases-v5-fixtures-v1` sandbox contract.
- Every increment follows RED → GREEN → REFACTOR, stays buildable, and receives an atomic commit after focused verification.
- No product facts, role meanings, field mappings, transforms, population scope, permission result, fifth Agent artifact, new Execution Plan behavior, or evidence-upgrade authority may be invented.
- If a MUST conflicts with existing behavior, the implementation stops for user direction instead of weakening the contract.

---

### Task 1: Freeze the V4 Baseline and V5 Contract Inventory

**Files:**
- Create: `docs/superpowers/evidence/2026-09-11-v5-baseline.md`
- Create: `docs/superpowers/evidence/v5-symbol-schema-map.json`
- Test: `test/v5/contract-inventory.test.mjs`

**Interfaces:**
- Consumes: current `src/entry.mjs`, `build/build.mjs`, all registered V4 Schemas, public Skill files, and the normative spec.
- Produces: a machine-readable inventory that later dead-code and release gates consume; no production behavior.

- [x] **Step 1: Write the failing inventory test**

  Assert that the evidence JSON contains the exact baseline versions, commands, public V4 exports, registered Schemas, six policy references, clean-tree commit, and all `C01`–`C16` requirement IDs. The initial failure must be `ENOENT` for `v5-symbol-schema-map.json`.

- [x] **Step 2: Run the inventory test and observe RED**

  Run: `node --test test/v5/contract-inventory.test.mjs`

  Expected: FAIL because the inventory does not exist.

- [x] **Step 3: Record the verified baseline**

  Record commit `858fdd1de77ba31655ff57810fbf0ff8a47872c9`, Schema `4.0.0`, compiler `0.5.0`, public exports `advanceStrict`, `constructV4Action`, `createV4RunDirectory`, `sourceAcquisitionMaterialPathV4`, and `stageV4SourceAcquisitionAction`, plus the successful baseline results:

  ```json
  {
    "npm_run_check": { "core": 1447, "repeatability": 2, "failed": 0 },
    "npm_run_test_benchmark": { "passed": 145, "failed": 0 },
    "npm_run_public_pilot": { "total": 30, "pilot_admitted": 30, "status": "pilot_ready" }
  }
  ```

- [x] **Step 4: Run the inventory test and observe GREEN**

  Run: `node --test test/v5/contract-inventory.test.mjs`

  Expected: PASS and the inventory has no absolute machine path except the evidence-only spec reference.

- [x] **Step 5: Commit the baseline evidence**

  ```bash
  git add docs/superpowers/evidence test/v5/contract-inventory.test.mjs
  git commit -m "test(generate-test-cases): freeze v4 baseline for v5"
  ```

### Task 2: Generate the V5 Registries and Closed Schema Set

**Files:**
- Create: `src/v5/constants.mjs`
- Create: `src/v5/registry-generator.mjs`
- Create: `src/v5/registry-validation.mjs`
- Create: `skill/generate-test-cases/scripts/policies/*.json`
- Create: `skill/generate-test-cases/scripts/schemas/v5-*.schema.json`
- Modify: `build/build.mjs`
- Test: `test/v5/registries.test.mjs`
- Test: `test/v5/schema-contracts.test.mjs`

**Interfaces:**
- Consumes: `canonicalStringify`, `digest`, and the exact machine seeds frozen in spec sections 5, 6, 8, and 10.
- Produces: `loadV5Contracts(schemaDirectory, policyDirectory)` and generated policy files used by every subsequent task.

- [x] **Step 1: Write failing policy cardinality and digest tests**

  Assert exactly 16 FSM cells, 51 FSM outcomes, 9 action templates, 4 read-only profiles, 40 runtime-error rows, 34 invariant rows, 28 stable-ID prefixes, exact answer/control tokens, source batch size 16, and bidirectional registry references. Assert every policy validates against its own closed Schema and every declared digest recomputes.

- [x] **Step 2: Run registry tests and observe RED**

  Run: `node --test test/v5/registries.test.mjs test/v5/schema-contracts.test.mjs`

  Expected: FAIL on missing V5 policies and Schemas.

- [x] **Step 3: Implement deterministic registry generation**

  Provide the exact public shape:

  ```js
  export function generateV5Contracts() {
    return {
      sourceAcquisitionPolicy,
      fsmRegistry,
      policyRegistry,
      permissionDerivationRegistry,
      answerConstraintRegistry,
      clarificationControlRegistry,
      stableIdPreimageRegistry,
      storageLayoutRegistry,
      normativeRuleInventory,
      replyContracts,
      canonicalArrayManifest
    };
  }
  ```

  Derive reply oneOf branches and policy/error references from the registries; never maintain a second hand-written list.

- [x] **Step 4: Integrate the V5 contract generator without an early runtime cutover**

  Make `build/build.mjs` write/check the generated V5 policies and closed Schemas while keeping the V4 runtime manifest isolated until Task 12. Task 12 atomically sets `schemaVersion = '5.0.0'`, `compilerVersion = '0.6.0'`, replaces the manifest entries, and cuts over the runner; this keeps every intermediate commit buildable and avoids a mixed-version manifest.

- [x] **Step 5: Run focused tests and build**

  Run: `node --test test/v5/registries.test.mjs test/v5/schema-contracts.test.mjs && npm run build`

  Expected: PASS, generated files are canonical and a second build is byte-identical.

- [ ] **Step 6: Commit the frozen contracts**

  ```bash
  git add src/v5 build/build.mjs skill/generate-test-cases/scripts test/v5
  git commit -m "feat(generate-test-cases): freeze v5 contracts"
  ```

### Task 3: Implement V5 Identity, Stable IDs, and Provenance DAG

**Files:**
- Create: `src/v5/identity.mjs`
- Create: `src/v5/provenance.mjs`
- Create: `src/v5/envelopes.mjs`
- Test: `test/v5/identity.test.mjs`
- Test: `test/v5/provenance.test.mjs`
- Fixture: `tests/fixtures/v5/C16/**`

**Interfaces:**
- Consumes: canonical JSON, 28-row stable-ID registry, accepted source payload digest, lineage ID, and allowed-edge registry.
- Produces: `stableV5Id(prefix, preimage)`, `acceptArtifactEnvelope(input)`, and `validateV5ProvenanceGraph(graph)`.

- [ ] **Step 1: Write failing 28-prefix golden and no-cycle tests**

  Cover every prefix, reordered canonical sets, changed ordered sequences, cross-lineage references, back edges, cycles, downstream-to-source proof attempts, unknown edge types, and resume projection edges.

- [ ] **Step 2: Run focused tests and observe RED**

  Run: `node --test test/v5/identity.test.mjs test/v5/provenance.test.mjs`

  Expected: FAIL because V5 identity modules are absent.

- [ ] **Step 3: Implement registry-driven identities and envelopes**

  ```js
  export function stableV5Id(prefix, semanticPreimage) {
    const row = stableIdRegistry.byPrefix.get(prefix);
    return `${prefix}${sha256(canonicalBytes(project(row, semanticPreimage)))}`;
  }

  export function acceptArtifactEnvelope({ artifactKind, payload, runIdentity, revision }) {
    // Validate the Agent-owned payload first, then derive all IDs/digests/envelope fields.
  }
  ```

- [ ] **Step 4: Implement directed allowed-edge validation**

  Build adjacency once, reject every non-registry edge, prove all referenced nodes exist, enforce same-run/lineage restrictions, and use iterative color marking for cycle detection.

- [ ] **Step 5: Verify and commit**

  Run: `node --test test/v5/identity.test.mjs test/v5/provenance.test.mjs`

  ```bash
  git add src/v5 test/v5 tests/fixtures/v5/C16
  git commit -m "feat(generate-test-cases): enforce v5 identity provenance"
  ```

### Task 4: Implement the Crash-Safe Catalog and Run Store

**Files:**
- Create: `src/v5/storage-paths.mjs`
- Create: `src/v5/storage-records.mjs`
- Create: `src/v5/action-tokens.mjs`
- Create: `src/v5/run-store.mjs`
- Create: `src/v5/transactions.mjs`
- Test: `test/v5/storage.test.mjs`
- Test: `test/v5/transactions.test.mjs`
- Test: `test/v5/action-tokens.test.mjs`

**Interfaces:**
- Consumes: storage layout registry, closed Schemas, internal clock/entropy/run-ID/key services.
- Produces: `readVerifiedRun`, `commitCatalogGenesis`, `commitNormalRunTransaction`, `publishIntegrityQuarantine`, `issueSelectors`, and raw-byte CAS helpers.

- [ ] **Step 1: Write failing path, CAS, crash, and tamper tests**

  Test safe fixed paths, no symlink traversal, catalog/run pointer self-digests, raw-byte CAS, every genesis boundary, normal fatal versus quarantine, receipt/index/reply cross-equalities, restart replay, stale selector, key rotation, and zero key-material leakage.

- [ ] **Step 2: Run focused tests and observe RED**

  Run: `node --test test/v5/storage.test.mjs test/v5/transactions.test.mjs test/v5/action-tokens.test.mjs`

  Expected: FAIL on absent V5 store.

- [ ] **Step 3: Implement fixed-path object storage and verification**

  Use content-addressed object keys and write-temp/fsync/rename publication. Validate the complete current chain before returning a semantic state. A pointer/checkpoint/sidecar chain failure produces a read-only integrity fatal; accepted object failure is committed as normal fatal only after a trustworthy current chain exists.

- [ ] **Step 4: Implement transaction and idempotency records**

  ```js
  export async function commitNormalRunTransaction(runDirectory, request, nextState, services) {}
  export async function publishIntegrityQuarantine(runDirectory, incident, request, services) {}
  ```

  Preserve exact action digest and reply bytes for same-key replay. Same key with different action returns `IDEMPOTENCY_CONFLICT` with zero revision change.

- [ ] **Step 5: Implement HKDF selector tokens**

  Bind run ID, active lifecycle, FSM cell, revision, checkpoint, semantic root, presentation/preview digest, and exact capability. Persist only key IDs and selector sidecars; accept configured current and retained verification keys.

- [ ] **Step 6: Verify and commit**

  Run: `node --test test/v5/storage.test.mjs test/v5/transactions.test.mjs test/v5/action-tokens.test.mjs`

  ```bash
  git add src/v5 test/v5
  git commit -m "feat(generate-test-cases): add v5 transactional run store"
  ```

### Task 5: Implement the Three Public APIs and Source Acquisition

**Files:**
- Create: `src/v5/source-acquisition.mjs`
- Create: `src/v5/runtime.mjs`
- Modify: `src/entry.mjs`
- Test: `test/v5/public-api.test.mjs`
- Test: `test/v5/source-acquisition.test.mjs`
- Fixture: `tests/fixtures/v5/C15/source/**`

**Interfaces:**
- Consumes: Task 4 store, V5 create/action/reply Schemas, source policy, existing canonical source functions.
- Produces exactly:

  ```js
  export async function createV5RunDirectory(catalogRoot, request) {}
  export async function advanceV5Run(runDirectory, request) {}
  export async function inspectV5Run(runDirectory) {}
  ```

- [ ] **Step 1: Write failing public-export and source-batch tests**

  Assert exactly three public exports; ordinary create rejects missing/empty bootstrap; source request IDs and batches are deterministic `required_desc_then_request_id_asc` with maximum 16; required skip, batch mismatch, hidden source input, V4 requests, relative paths, and extra properties write nothing.

- [ ] **Step 2: Run focused tests and observe RED**

  Run: `node --test test/v5/public-api.test.mjs test/v5/source-acquisition.test.mjs`

  Expected: FAIL because the V5 exports do not exist.

- [ ] **Step 3: Implement create genesis**

  Validate before allocating a run. Derive `srq5_` from role + locator + required, freeze bootstrap/policy/create-action digests, generate the closed identity record, then publish in the order run transaction → catalog genesis record → run pointer → catalog pointer.

- [ ] **Step 4: Implement source batch acceptance**

  Validate request IDs as the complete current batch; canonicalize verified source content with existing source-boundary algorithms; persist the disposition ledger; compute `AcceptedSourceStateV1.semantic_digest` from canonical source payload only; advance to the next fixed batch or semantic review.

- [ ] **Step 5: Implement inspect-only CLI behavior**

  Dynamic import is side-effect free. Direct execution accepts exactly one absolute run directory and prints one JSON reply from `inspectV5Run`; all other argument shapes return `RUN_ARGUMENT_INVALID` without filesystem mutation.

- [ ] **Step 6: Verify and commit**

  Run: `node --test test/v5/public-api.test.mjs test/v5/source-acquisition.test.mjs`

  ```bash
  git add src/entry.mjs src/v5 test/v5 tests/fixtures/v5/C15/source
  git commit -m "feat(generate-test-cases): expose v5 source protocol"
  ```

### Task 6: Compile Semantic Review Seeds and Typed Behavior Contracts

**Files:**
- Create: `src/v5/semantic-rules.mjs`
- Create: `src/v5/semantic-seed.mjs`
- Create: `src/v5/semantic-reviews.mjs`
- Create: `src/v5/behavior-contracts.mjs`
- Test: `test/v5/semantic-seed.test.mjs`
- Test: `test/v5/behavior-contracts.test.mjs`
- Fixture: `tests/fixtures/v5/C01/**`
- Fixture: `tests/fixtures/v5/C02/**`
- Fixture: `tests/fixtures/v5/C03/**`
- Fixture: `tests/fixtures/v5/C09/**`
- Fixture: `tests/fixtures/v5/C10/**`
- Fixture: `tests/fixtures/v5/C11/**`
- Fixture: `tests/fixtures/v5/C12/**`
- Fixture: `tests/fixtures/v5/C14/**`

**Interfaces:**
- Consumes: accepted source payload, exact locators, four Agent artifacts, Decisions, typed semantic-rule registry.
- Produces: compiler-owned `SemanticReviewSeed`, review ledgers, `TermRegistry`, `FieldCorrespondence`, `ValueState`, Domain/Population contracts, risk ledger, required cells, two coverage axes, and display tiers.

- [ ] **Step 1: Write failing C01/C02/C03 seed tests**

  Cover composite outcome splitting, exact clause origin coverage, missing review, bounded vague tokens, empty resolution basis, alias/distinct/unresolved entity partitions, complete mention roles, and collision-stable IDs.

- [ ] **Step 2: Write failing C09–C12/C14 contract tests**

  Cover field authority/join/cardinality/null/freshness, rule-ref resolution, value/render orthogonality, complement closure, representative equivalence, population/all-data proof, nine-risk completeness, N/A/formal/gap exclusivity, and low-noise display.

- [ ] **Step 3: Run focused tests and observe RED**

  Run: `node --test test/v5/semantic-seed.test.mjs test/v5/behavior-contracts.test.mjs`

  Expected: FAIL on missing compilers.

- [ ] **Step 4: Implement compiler-owned candidates and review reducers**

  The Agent supplies only candidate dispositions with exact evidence. Derive outcomes, ambiguity gaps, conflict groups, roles, term entries, rules, scopes, and display from accepted source/Decision closure. Empty but typed candidate collections are legal when the source has no signal.

- [ ] **Step 5: Implement typed behavior validators**

  Use discriminated unions; reject raw rule strings and unknown digests. Keep `DataState` and `RenderState` orthogonal. Compute behavioral and selection coverage independently, never treating representative values as exhaustive proof.

- [ ] **Step 6: Verify and commit**

  Run: `node --test test/v5/semantic-seed.test.mjs test/v5/behavior-contracts.test.mjs`

  ```bash
  git add src/v5 test/v5 tests/fixtures/v5/C01 tests/fixtures/v5/C02 tests/fixtures/v5/C03 tests/fixtures/v5/C09 tests/fixtures/v5/C10 tests/fixtures/v5/C11 tests/fixtures/v5/C12 tests/fixtures/v5/C14
  git commit -m "feat(generate-test-cases): compile v5 semantic contracts"
  ```

### Task 7: Derive Permission Matrices and Typed Oracles

**Files:**
- Create: `src/v5/permission.mjs`
- Create: `src/v5/oracles.mjs`
- Test: `test/v5/permission.test.mjs`
- Test: `test/v5/oracles.test.mjs`
- Fixture: `tests/fixtures/v5/C08/**`
- Fixture: `tests/fixtures/v5/C13/**`

**Interfaces:**
- Consumes: Seed advertisements, typed semantic rules, permission derivation registry, exact coordinate evidence, and Decisions.
- Produces: canonical permission cells/routes/gaps, `PermissionCoordinateAnswer` reduction, and closed `OracleAssertion` validation/rendering.

- [ ] **Step 1: Write failing permission derivation tests**

  Assert required cells derive only from source-backed coordinate domains, multi-coordinate ambiguity forms one canonical permission-scope gap with exact candidate/unresolved sets, answers select only advertised candidates, and decision/denial/data-scope counts replay from canonical cells.

- [ ] **Step 2: Write failing Oracle union tests**

  Exercise every assertion variant's unique positive and negative verdict, observation window/scope, null and normalization rules, rule references, and empty-candidate typed creation.

- [ ] **Step 3: Run focused tests and observe RED**

  Run: `node --test test/v5/permission.test.mjs test/v5/oracles.test.mjs`

  Expected: FAIL on missing reducers.

- [ ] **Step 4: Implement permission reducer and Oracle validator**

  Produce `pac5_` cell IDs from canonical coordinate preimages. A permission answer must cover the exact unresolved coordinate set once, create one Decision, and deterministically recompile the next Seed and route with no orphan or write-back loop.

- [ ] **Step 5: Verify and commit**

  Run: `node --test test/v5/permission.test.mjs test/v5/oracles.test.mjs`

  ```bash
  git add src/v5 test/v5 tests/fixtures/v5/C08 tests/fixtures/v5/C13
  git commit -m "feat(generate-test-cases): close permission and oracle contracts"
  ```

### Task 8: Implement Clarification Binding, Preview, Commit, and Question FSM

**Files:**
- Create: `src/v5/question-parts.mjs`
- Create: `src/v5/clarification-parser.mjs`
- Create: `src/v5/clarification-preview.mjs`
- Create: `src/v5/clarification-reducer.mjs`
- Test: `test/v5/clarification.test.mjs`
- Fixture: `tests/fixtures/v5/C04/**`
- Fixture: `tests/fixtures/v5/C05/**`
- Fixture: `tests/fixtures/v5/C06/**`
- Fixture: `tests/fixtures/v5/C07/**`

**Interfaces:**
- Consumes: answer/control registries, current presentation, exact `Q<n>` tokens, raw response scalars, semantic root, and Task 6/7 reducers.
- Produces: proposed answer units, preview, Decision records, applied impact, next question-part state set, and atomic revision projection.

- [ ] **Step 1: Write failing binding and authority tests**

  Test reordered/skipped/multiline answers, punctuation normalization, duplicate and foreign Q tokens, clone/defer/unknown/close controls, final=E3, temporary=E1, missing product scope, and answer-contract/value mismatches.

- [ ] **Step 2: Write failing question FSM and impact tests**

  Assert `answered` cannot close, only delivery-close controls close unresolved parts, delivery-closed gaps stay Blocked, invalid preview writes nothing, stale preview/confirmation writes nothing, impact projections list exact created/invalidated/modified objects, and discard-pending is idempotent.

- [ ] **Step 3: Run focused tests and observe RED**

  Run: `node --test test/v5/clarification.test.mjs`

  Expected: FAIL because the V5 clarification pipeline is absent.

- [ ] **Step 4: Implement parse → preview → confirm**

  Parse Unicode scalar ranges without guessing omitted bindings. `preview_clarification_response` never changes semantic revision. `commit_clarification_response` requires the advertised digest and exact confirmation token/range, writes Decisions plus applied impact atomically, and then recompiles the earliest outstanding obligation.

- [ ] **Step 5: Verify and commit**

  Run: `node --test test/v5/clarification.test.mjs`

  ```bash
  git add src/v5 test/v5 tests/fixtures/v5/C04 tests/fixtures/v5/C05 tests/fixtures/v5/C06 tests/fixtures/v5/C07
  git commit -m "feat(generate-test-cases): add v5 clarification transactions"
  ```

### Task 9: Compile Cases and Mechanical JSON/Markdown/CSV Output

**Files:**
- Create: `src/v5/case-compiler.mjs`
- Create: `src/v5/case-status.mjs`
- Create: `src/v5/render-json.mjs`
- Create: `src/v5/render-markdown.mjs`
- Create: `src/v5/render-csv.mjs`
- Test: `test/v5/case-output.test.mjs`
- Golden: `test/golden/v5/case-document.json`
- Golden: `test/golden/v5/case-document.md`
- Golden: `test/golden/v5/execution-worksheet.csv`
- Golden: `test/golden/v5/execution-plan.json`

**Interfaces:**
- Consumes: accepted semantic graph, typed Oracles, Decisions, coverage, permission/risk ledgers, and existing compatible output algorithms.
- Produces: one canonical V5 Case Document plus mechanical Markdown/CSV, and a compatibility-only existing-capability Execution Plan projection.

- [ ] **Step 1: Write failing classification and output parity tests**

  Assert final Decisions permit Grounded only through E3, temporary Decisions permit Conditional only through E1, every unresolved gap is Blocked, output membership/order/status/steps/Oracle/scope/name/coverage match across all three formats, and no output becomes upstream evidence.

- [ ] **Step 2: Run focused tests and observe RED**

  Run: `node --test test/v5/case-output.test.mjs`

  Expected: FAIL because V5 output modules and goldens are absent.

- [ ] **Step 3: Implement Case projection and deterministic renderers**

  Reuse compatible V4 algorithms only after adapting their input contracts to V5. JSON is authoritative. Markdown and CSV consume only the validated canonical bundle, never Agent prose or filesystem leftovers.

- [ ] **Step 4: Add reviewed goldens**

  The golden includes at least one Grounded, Conditional, Blocked, Exploratory, and NotApplicable branch; typed field/value/domain/population/permission/oracle data; dual coverage; and provenance links. The compatibility Execution Plan uses only the pre-existing closed capability union.

- [ ] **Step 5: Verify and commit**

  Run: `node --test test/v5/case-output.test.mjs`

  ```bash
  git add src/v5 test/v5 test/golden/v5
  git commit -m "feat(generate-test-cases): render canonical v5 case documents"
  ```

### Task 10: Close the FSM, Cancellation, Resume, and Execution Wrapper

**Files:**
- Create: `src/v5/fsm.mjs`
- Create: `src/v5/cancellation.mjs`
- Create: `src/v5/resume.mjs`
- Create: `src/v5/execution-wrapper.mjs`
- Modify: `src/v5/runtime.mjs`
- Test: `test/v5/fsm-runtime.test.mjs`
- Test: `test/v5/resume.test.mjs`
- Test: `test/v5/execution-wrapper.test.mjs`

**Interfaces:**
- Consumes: generated 16-cell FSM, complete store, cancel record contract, immutable V5 Case ref, and exact existing Execution Plan action union.
- Produces: registry-selected actions/replies, terminal cancellation, child-local resume projections, and the compatibility execution branch.

- [ ] **Step 1: Write failing 51-outcome dispatch tests**

  Prove every outcome is reachable from exactly one trigger, every emitted reply matches exactly one generated reply-contract row, all unadvertised actions return `ACTION_NOT_ADVERTISED`, and error phase/priority selection is deterministic.

- [ ] **Step 2: Write failing cancel/resume tests**

  Cover all cancellation cells, idempotent repeat, cancel-event cross-binding, source/case/execution ResumeBase variants, parent verification, child-local accepted envelopes/receipts, no staging/preview/token inheritance, V4 parent rejection, and tampered parent closure.

- [ ] **Step 3: Write failing execution compatibility tests**

  Assert exact immutable V5 Case ref validation and the unchanged four existing operation kinds; reject any expanded operation or a wrapper that advertises downstream execution.

- [ ] **Step 4: Implement registry-driven runtime selection**

  Do not switch on hand-written duplicate outcome lists. Resolve current cell, advertised selector, validator phase, action handler, transaction profile, and reply contract from generated registries.

- [ ] **Step 5: Verify and commit**

  Run: `node --test test/v5/fsm-runtime.test.mjs test/v5/resume.test.mjs test/v5/execution-wrapper.test.mjs`

  ```bash
  git add src/v5 test/v5
  git commit -m "feat(generate-test-cases): complete v5 lifecycle protocol"
  ```

### Task 11: Build the Manifest-Only C01–C16 Fixture Runner

**Files:**
- Create: `test/fixtures-v5-runner.mjs`
- Create: `tests/fixtures/v5/manifest.json`
- Create: `tests/fixtures/v5/**/*.json`
- Create: `tests/fixtures/v5/**/*.input`
- Test: `test/v5/fixture-runner.test.mjs`

**Interfaces:**
- Consumes: only `tests/fixtures/v5/manifest.json`, public V5 APIs, internal test-service injection, and logical tamper/crash operations.
- Produces: deterministic per-step projections and exact result/digest assertions for every manifest leaf.

- [ ] **Step 1: Write failing harness-contract tests**

  Test manifest-only discovery, exact action/expected-step cardinality, backward reply bindings, unique JSON-pointer resolution, placeholder exhaustion, path traversal, non-regular files, fixed sandbox digests/modes/locks, unsupported platform blocking, logical tamper resolution, and crash wrappers that must terminate without an API reply.

- [ ] **Step 2: Run harness tests and observe RED**

  Run: `node --test test/v5/fixture-runner.test.mjs`

  Expected: FAIL because the manifest and runner are absent.

- [ ] **Step 3: Implement the deterministic harness**

  Seed clock, entropy, run IDs, and master key from `fixture_id` through an internal-only service object. Normalize only the temporary catalog prefix to `fixture://catalog/<catalog_key>` before golden digest comparison. Never export test injection or tamper helpers from production.

- [ ] **Step 4: Populate C01–C16 positive and negative/blocked/protocol leaves**

  Every `C01`–`C16` has at least one positive and one negative/Blocked fixture. Each policy-registry `test_id` resolves to exactly one leaf. Process-control steps are followed by inspect/advance evidence of recovery or isolation.

- [ ] **Step 5: Run all fixture leaves**

  Run: `node test/fixtures-v5-runner.mjs tests/fixtures/v5/manifest.json`

  Expected: 16/16 requirement groups pass, all leaf projections match their exact reply/error/revision/pointer assertions, and repeated runs are byte-identical.

- [ ] **Step 6: Commit the fixture contract**

  ```bash
  git add test tests/fixtures/v5
  git commit -m "test(generate-test-cases): cover c01 through c16"
  ```

### Task 12: Remove V4 Runtime and Publish the V5 Skill Bundle

**Files:**
- Delete: V4 operational source modules and migration modules under `src/`
- Delete: V3/V4 operational Schema branches and runtime-only V4 tests
- Modify: `skill/generate-test-cases/SKILL.md`
- Modify: `skill/generate-test-cases/agents/openai.yaml`
- Modify: `skill/generate-test-cases/references/*.md`
- Modify: `README.md`
- Modify: `package.json`
- Create: `docs/decisions/ADR-002-v5-single-operational-workflow.md`
- Create: `docs/superpowers/evidence/2026-09-11-v5-traceability.md`
- Create: `test/v5/no-v4-runtime.test.mjs`
- Create: `test/v5/skill-contract.test.mjs`

**Interfaces:**
- Consumes: complete V5 implementation and generated bundle.
- Produces: one discoverable V5 Skill installation with no legacy operational path and a C01–C16 traceability record.

- [ ] **Step 1: Write failing V4 dead-code/version and Skill behavior tests**

  Scan production exports, dispatches, Schemas, policies, SKILL instructions, UI prompt, and built bundle for forbidden V3/V4 operational symbols/versions. Test the V5 Skill's source acquisition, typed clarification, recovery, canonical delivery, and no-E2E boundaries against the old V4 wording baseline.

- [ ] **Step 2: Run tests and observe RED**

  Run: `node --test test/v5/no-v4-runtime.test.mjs test/v5/skill-contract.test.mjs`

  Expected: FAIL on current V4 exports, Schemas, policies, and instructions.

- [ ] **Step 3: Remove unreachable legacy runtime and update public guidance**

  Delete only operational legacy code and its obsolete tests; retain baseline evidence and immutable historical evidence documents. Keep `SKILL.md` focused and route detailed V5 contracts to the six maintained reference policies. Update `openai.yaml` in place and keep implicit invocation unchanged.

- [ ] **Step 4: Add ADR and traceability evidence**

  Record why V5 is a cutover rather than a compatibility mode, which proven V4 capabilities were retained, the rollback constraint (previous approved V5 only after release), C01–C16 requirement → Schema → symbol → fixture mapping, known limitations, and every SHOULD deviation.

- [ ] **Step 5: Build and synchronize the published package**

  Run: `npm run build`

  Mechanically synchronize `skill/generate-test-cases/` to repository-level `../generate-test-cases/`, then run `node build/build.mjs --check` and the repository-published sync test.

- [ ] **Step 6: Verify and commit**

  Run: `node --test test/v5/no-v4-runtime.test.mjs test/v5/skill-contract.test.mjs test/interface/repository-published-sync.test.mjs`

  ```bash
  git add -A src skill test README.md package.json docs ../generate-test-cases
  git commit -m "feat(generate-test-cases): cut over skill to v5"
  ```

### Task 13: Run Release Gates, Review, Merge, and Push

**Files:**
- Create: `docs/superpowers/evidence/2026-09-11-v5-release-gates.md`
- Modify: `docs/superpowers/evidence/2026-09-11-v5-traceability.md`

**Interfaces:**
- Consumes: completed branch, normative release gates, remote `origin`.
- Produces: reviewed commits on `codex/generate-test-cases-v5`, a verified merge to `main`, and both remote refs.

- [ ] **Step 1: Run focused contract gates**

  ```bash
  npm run build
  node build/build.mjs --check
  node test/fixtures-v5-runner.mjs tests/fixtures/v5/manifest.json
  node --test test/v5/*.test.mjs
  ```

- [ ] **Step 2: Run the complete project gates**

  ```bash
  npm run check
  npm run test:benchmark
  npm run public-pilot
  npm audit --audit-level=high
  git diff --check main...HEAD
  ```

  Expected: all commands exit 0; all C01–C16 leaves pass; build and committed artifacts are byte-identical; no critical/high dependency issue exists.

- [ ] **Step 3: Perform security and telemetry scans**

  Assert no credential/key/source/answer payload is emitted by runtime errors or telemetry, no unbounded metric label is introduced, no user-supplied URL is fetched by the compiler, no `eval`/shell execution path exists, and no action-token master key reaches persisted objects or logs.

- [ ] **Step 4: Inventory V4 active runs before cutover**

  Use only the current deployment's declared catalog roots. If no deployment/catalog root is configured, record that repository publication has no discoverable live run store and do not claim a runtime deployment. If any V4 active run exists, stop before merge and request owner action; never migrate or auto-cancel it.

- [ ] **Step 5: Review against the spec and code-quality axes**

  Re-read the normative spec, inspect `git diff main...HEAD`, verify every MUST is represented in the traceability table, and record all findings. Fix findings through new TDD increments and repeat affected gates.

- [ ] **Step 6: Commit final release evidence**

  ```bash
  git add docs/superpowers/evidence
  git commit -m "docs(generate-test-cases): record v5 release evidence"
  ```

- [ ] **Step 7: Push the feature branch**

  ```bash
  git push -u origin codex/generate-test-cases-v5
  ```

- [ ] **Step 8: Merge from the clean main checkout and verify the merge**

  ```bash
  git fetch origin
  git checkout main
  git pull --ff-only origin main
  git merge --no-ff codex/generate-test-cases-v5 -m "merge: publish generate-test-cases v5"
  npm --prefix generate-test-cases-engineering run check
  ```

- [ ] **Step 9: Push main and confirm remote refs**

  ```bash
  git push origin main
  git ls-remote --heads origin main codex/generate-test-cases-v5
  ```

  Expected: remote feature branch points at the reviewed V5 head and remote `main` points at the verified merge commit.

## Plan Self-Review

- Spec coverage: sections 1–4 are Task 1/global constraints; API/source/reply contracts are Tasks 2, 4, 5, and 10; ownership/canonical IDs are Tasks 2–3; FR-001–016 are Tasks 3 and 6–11; frozen Schemas and provenance are Tasks 2–3 and 6–8; FSM/policy/error registries are Tasks 2 and 10; phases/fixtures/gates/deliverables/traceability/DoD are Tasks 1 and 11–13.
- Placeholder scan: no TBD/TODO/later step is present; every task names exact files, interfaces, test commands, expected RED/GREEN behavior, and commit boundary.
- Type consistency: public API names match spec section 5.1; the four Agent artifact names match section 6.1; registry, reply, identity, permission, clarification, transaction, and fixture names match the normative contract.
- Execution choice: inline execution with `superpowers:executing-plans`; multi-agent delegation is intentionally not used because the active task instructions prohibit proactive subagents.
