# Public-Source Machine Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an offline-verifiable, 30-PRD public-source machine pilot without weakening or populating the frozen external-expert release benchmark.

**Architecture:** Keep the pilot under `benchmark/public-pilot/` with its own catalog, retained bytes, machine-review records, and deterministic validator. The formal `benchmark/v1` scorer and evidence classes remain untouched; the pilot validator hard-codes `release_eligible=false` and reports only pilot readiness.

**Tech Stack:** Node.js 20+ ESM, Node built-ins, `node:test`, JSON, Markdown, SHA-256, immutable first-party GitHub source URLs.

**Spec:** `docs/designs/2026-08-31-public-source-machine-pilot.md`

## Global Constraints

- Do not modify the meaning of `external-expert-corpus`, the frozen release metrics, or the two-human-expert requirement.
- Do not add machine labels to `benchmark/v1/cases/**/expert-*.json`, `supported-assertions.json`, or `accepted-cases.json`.
- Do not fabricate PRDs, licenses, defects, captured runs, reviewer identities, or a passing release result.
- Public-source packages require immutable bytes, a same-revision license record, SHA-256, task digest, provenance, one stratum, and global duplicate checks.
- Public visibility without applicable licensing remains `hold`; rejected artifact classes never become pilot-admitted by adding metadata.
- Historical defect leads count only after they are frozen and bound to a pilot-admitted case in the same product and requirements scope.
- Every pilot result has `release_eligible=false` and `release_status=insufficient_evidence`.

---

### Task 1: Complete the Licensed Strict-PRD Intake Queue

**Files:**
- Create: `docs/research/2026-08-31-public-prd-expert-a-supplement.md`
- Create: `docs/research/2026-08-31-public-prd-expert-b-freeze.md`
- Create: `docs/research/2026-08-31-public-prd-intake-final.md`

**Interfaces:**
- Consumes: the frozen admission rubric and machine adjudication report.
- Produces: at least five license-safe strict candidates in every frozen stratum, each with repository, immutable commit, document path, same-revision license path, stratum, and first-party evidence links.

- [ ] **Step 1: Search first-party repositories for the missing transaction and identity candidates**

Accept only a real-project requirements document whose immutable revision contains both the document and an applicable license. Record at least three additional transaction candidates and four additional identity candidates in the supplement so the licensed intake queue reaches five in each stratum without relying on unlicensed Atom or Oncall. Do not rewrite the hash-frozen original A report.

- [ ] **Step 2: Freeze the existing last-three-strata candidates**

Record exact 40-character commits and same-revision license paths for form, asynchronous, and time/quota candidates in a new freeze report. Reject or hold any item whose document or license cannot be fixed together. Do not rewrite the hash-frozen original B report.

- [ ] **Step 3: Run the frozen rubric across the combined queue**

The final intake report must list every candidate once, report per-stratum counts, disclose same-maintainer concentration, and distinguish `accepted-for-pilot-freeze` from formal benchmark `ADMIT`.

- [ ] **Step 4: Verify the research artifact**

Run:

```bash
rg -n "accepted-for-pilot-freeze|HOLD|REJECT|license|commit" docs/research/2026-08-31-public-prd-intake-final.md
```

Expected: all six strata are present; every accepted candidate has an immutable commit and license evidence; the report explicitly states that formal release admission remains zero.

### Task 2: Add the Pilot Catalog Contract and Offline Validator

**Files:**
- Create: `benchmark/public-pilot/catalog.schema.json`
- Create: `benchmark/public-pilot/validate.mjs`
- Create: `test/benchmark/public-pilot.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `validatePublicPilot(catalogPath): Promise<PilotReport>`.
- Produces: process command `node benchmark/public-pilot/validate.mjs <catalog.json>`.
- `PilotReport.status` is exactly `pilot_ready | pilot_incomplete | invalid`.
- `PilotReport.release_eligible` is always `false`; `PilotReport.release_status` is always `insufficient_evidence`.

- [ ] **Step 1: Write failing boundary and integrity tests**

```js
test('public pilot can never claim release eligibility', async () => {
  const report = await validatePublicPilot(fixtureCatalog);
  assert.equal(report.release_eligible, false);
  assert.equal(report.release_status, 'insufficient_evidence');
});

test('machine reviewers cannot be encoded as external experts', async () => {
  const report = await validatePublicPilot(catalogWithHumanClaim);
  assert.equal(report.status, 'invalid');
  assert.ok(report.issues.some((issue) => issue.code === 'REVIEWER_CLASS_INVALID'));
});
```

Also cover a changed source byte, changed license byte, mutable URL, duplicate content digest, missing task binding, stratum below five, unbound defect counted as valid, path traversal, symlink, and an attempt to set `release_eligible=true`.

- [ ] **Step 2: Run the tests and confirm the RED reason**

Run: `node --test test/benchmark/public-pilot.test.mjs`

Expected: FAIL because `benchmark/public-pilot/validate.mjs` does not exist.

- [ ] **Step 3: Implement the catalog schema and validator**

Use only Node built-ins. Resolve every retained path beneath the catalog root; reject absolute paths, `..`, symlinks, hardlinks, and duplicate physical paths. Recompute source, license, task, review, and defect-record SHA-256 values from bytes. Require immutable GitHub blob/raw URLs containing a 40-character commit. Recompute path-independent content digests and reject duplicates.

Pilot readiness is computed from valid `pilot-admitted` items only:

```js
const ready = FROZEN_STRATA.every((stratum) => admittedByStratum.get(stratum)?.length >= 5);
```

Do not import or call `evaluateReleaseGates`.

- [ ] **Step 4: Add the package script and run GREEN**

Add:

```json
"public-pilot": "node benchmark/public-pilot/validate.mjs benchmark/public-pilot/v1/catalog.json"
```

Run: `node --test test/benchmark/public-pilot.test.mjs`

Expected: PASS.

### Task 3: Freeze the 30-PRD Public Corpus

**Files:**
- Create: `benchmark/public-pilot/v1/catalog.json`
- Create: `benchmark/public-pilot/v1/cases/<case-id>/source/<document-name>.md`
- Create: `benchmark/public-pilot/v1/cases/<case-id>/license/<license-name>`
- Create: `benchmark/public-pilot/v1/cases/<case-id>/task.json`
- Create: `benchmark/public-pilot/v1/cases/<case-id>/provenance.json`

**Interfaces:**
- Consumes: the Task 1 final intake report.
- Produces: at least 30 `pilot-admitted` packages with at least five per frozen stratum.

- [ ] **Step 1: Retain exact immutable source and license bytes**

For each accepted item, fetch only the exact commit URLs recorded by Task 1. Store the requirements document and applicable license without rewriting either file.

- [ ] **Step 2: Create task and provenance bindings**

Each `task.json` contains `case_id`, `scope`, `stratum`, `source_paths`, and `clarification_candidate`. Each `provenance.json` contains repository identity, 40-character commit, upstream document/license URLs, acquisition timestamp, document/license SHA-256, path-independent content digest, license identifier and scope decision.

- [ ] **Step 3: Build the catalog from reviewed records**

The catalog uses `evidence_class=public-source-machine-pilot`, `release_eligible=false`, `release_status=insufficient_evidence`, and lists retained paths plus their digests. Do not add expert-label or capture paths.

- [ ] **Step 4: Validate corpus integrity**

Run: `npm run public-pilot`

Expected: retained bytes, digests, licensing, task bindings, uniqueness, and six-stratum counts validate; the report remains `pilot_incomplete` only because Task 4 has not yet supplied the complete machine-review set. The release fields remain false/insufficient.

### Task 4: Add Machine Reviews and a Fail-Closed Defect Ledger

**Files:**
- Create: `benchmark/public-pilot/v1/reviews/machine-expert-a.json`
- Create: `benchmark/public-pilot/v1/reviews/machine-expert-b.json`
- Create: `benchmark/public-pilot/v1/reviews/machine-adjudication.json`
- Create: `benchmark/public-pilot/v1/defect-leads.json`
- Modify: `benchmark/public-pilot/v1/catalog.json`
- Modify: `test/benchmark/public-pilot.test.mjs`

**Interfaces:**
- Reviewers are exactly `reviewer_class=machine-agent` and `review_scope=intake-only`.
- Defects are exactly `lead | case-bound`; only `case-bound` records may contribute to pilot defect counts.

- [ ] **Step 1: Write failing review and defect-boundary tests**

Assert that an external-human claim, incomplete reviewed-case set, adjudication without both machine review inputs, unbound lead with `countable=true`, cross-stratum duplicate lead, or case binding to a non-admitted item makes the pilot invalid.

- [ ] **Step 2: Normalize the three machine reports**

Record each reviewed `case_id`, decision, reasons, input report digest, and reviewer class. Adjudication may resolve intake disagreements only and must state `external_expert_evidence=false`.

- [ ] **Step 3: Normalize public defect leads**

Freeze each issue URL/version and digest where available. Keep `status=lead`, `bound_case_id=null`, and `countable=false` until product/scope binding is demonstrated. Deduplicate Temporal #10321 globally.

- [ ] **Step 4: Run GREEN**

Run: `node --test test/benchmark/public-pilot.test.mjs && npm run public-pilot`

Expected: tests PASS; the corpus can be pilot-ready while every unbound defect count remains zero.

### Task 5: Freeze Comparator Readiness and Document the Remaining Release Gap

**Files:**
- Create: `benchmark/public-pilot/v1/comparators.json`
- Create: `benchmark/public-pilot/v1/README.md`
- Modify: `docs/research/2026-08-31-public-benchmark-evidence.md`
- Test: `test/benchmark/public-pilot.test.mjs`

**Interfaces:**
- Comparator status is exactly `frozen | unresolved`.
- Captures are disallowed until all four comparators are `frozen`.

- [ ] **Step 1: Add comparator boundary tests**

Assert a comparator lacks `frozen` status unless its exact prompt/Skill bytes, version, SHA-256, model identity, and run recipe are present. Assert the pilot validator reports `captures_ready=false` while any comparator is unresolved.

- [ ] **Step 2: Record the four comparator identities honestly**

Freeze `generate-test-cases` to the current Skill/compiler/schema digests. Mark any unavailable `long-prompt`, `test-case-designer`, or `technique-router` implementation as `unresolved` with the exact missing fields. Do not substitute similarly named public projects without provenance and rights.

- [ ] **Step 3: Document operation and release separation**

The README explains how to validate the pilot, how to add a licensed immutable item, why machine reviews do not satisfy the formal gate, and why no captured runs were invented.

- [ ] **Step 4: Run the full fresh verification**

Run:

```bash
npm run check
python3 /Users/zhangxudong/.codex/skills/.system/skill-creator/scripts/quick_validate.py skill/generate-test-cases
npm run public-pilot
npm run benchmark
git diff --check
```

Expected: build/type/tests and Skill validation PASS; public pilot reports its actual readiness; formal benchmark reports `insufficient_evidence`; no installation or RC tag is created.

## Self-Review

- Spec coverage: corpus provenance, licensing, immutable bytes, machine-review boundary, defect binding, comparator readiness, and release separation each map to a task.
- Placeholder scan: every implementation step names its concrete artifact, command, and expected result.
- Interface consistency: all tasks use `pilot_ready | pilot_incomplete | invalid`, `machine-agent`, `lead | case-bound`, and the frozen six-stratum enum.
