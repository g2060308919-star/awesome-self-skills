# General Quality v4.3.0 / Compiler 0.8.0 Evidence

Date: 2026-09-17  
Branch: `codex/generate-test-cases-general-quality-v43`  
Normative contract: supplied `03-spec.md`  
Status at Task 7: implementation candidate in progress; release acceptance not passed

## Scope and claim boundary

This work preserves the four Agent-writable semantic artifacts and the existing public stage list. It adds version-bound compiler validation, summaries, gates, and evaluation for the exact `4.3.0/0.8.0` pair. Exact `4.0.0/0.5.0` and `4.2.0/0.7.0` identities remain supported without backfilling new fields.

The evidence below proves deterministic implementation behavior against explicit fixtures. It does **not** prove release acceptance. The frozen evaluation manifest records `model_generation_mode: not_run` and `release_eligible_without_model_generation: false`. The user waived creating a separate no-history model task in this session, but no model-generation comparison was run at all; the paired fixture is only a controlled evaluator comparison. There was also no external independent reviewer/adjudicator. The one reserved fixture was consumed only after its hash and membership were committed, so it is no longer an untouched future holdout after this run.

## Versioned implementation slices

| Slice | Evidence | Observed result |
|---|---|---|
| Contract identity | `e16182f` | New runs bind `4.3.0/0.8.0`; exact legacy pairs pass; mixed identities fail closed. |
| Design assurance | `94e4fcc` | Total candidate disposition, responsibility, batch, revision, reference, and merge checks are compiler-owned. |
| Case quality protection | `81bdea7` | Existing atomic result, same-object flow, enum, permission, and resource-independent behavior remained green; no baseline rewrite was needed. |
| Critical semantic gate | `fb58849` | Criticality derives from acceptance impact; all formal delivery paths recheck final resolution. |
| Independent review | `b77fbbc` | Source-first target digest covers generated content and becomes stale on material changes while excluding review self-reference. |
| Canonical delivery | `1cb51a5` | JSON remains authoritative; HTML/Table/Markdown/CSV and manifest are deterministic projections; newer non-ready revisions revoke current authority. |
| Frozen quality corpus | `afabee9` | Fixture membership, hashes, conditions, repetitions, and non-release status were committed before the evaluator. |

## Commands and observed results

`C1` — Task 7 type and metric verification:

```bash
cd generate-test-cases-engineering
npx tsc --noEmit -p jsconfig.json
node --test --test-concurrency=1 test/benchmark/v4-general-quality-corpus.test.mjs
```

Observed: typecheck exited 0; 7 tests passed, 0 failed. The coverage fixture measured 2/3 overall, primary acceptance 2/2, dependency contract 0/1, one duplicate, one semantic gap, and one exploratory entry. Zero denominator was `not_applicable` with `ratio: null`. The hard-failure fixture detected `CRITICAL_GATE_BYPASS`, `REQUIRED_SCENARIO_DELETION`, `RULE_CORRECTNESS_REGRESSION`, and `UNSUPPORTED_ASSERTION`.

The paired evaluator fixture observed baseline 1/3 and candidate 3/3 under identical explicit targets and scoring rules. This is synthetic evaluator evidence, not observed old/new model-generation quality. The reserved permission-flow fixture produced byte-identical canonical reports across all three deterministic repetitions and measured 2/2 with zero duplicates.

`C2` — combined v4.3 focused verification:

```bash
cd generate-test-cases-engineering
node --test --test-concurrency=1 \
  test/core/v4-general-quality-contract.test.mjs \
  test/interface/v4-general-quality-versioning.test.mjs \
  test/core/v4-source-fidelity-protection.test.mjs \
  test/core/v4-design-assurance.test.mjs \
  test/core/v4-case-quality-protection.test.mjs \
  test/core/v4-critical-delivery-gate.test.mjs \
  test/interface/v4-critical-delivery-journey.test.mjs \
  test/recovery/v4-critical-delivery-recovery.test.mjs \
  test/core/v4-independent-review.test.mjs \
  test/interface/v4-independent-review-runner.test.mjs \
  test/recovery/v4-independent-review-recovery.test.mjs \
  test/golden/v4-general-quality-presentation.test.mjs \
  test/recovery/v4-general-quality-delivery.test.mjs \
  test/benchmark/v4-general-quality-corpus.test.mjs
```

Observed final result: 48 passed, 0 failed, 0 skipped, duration 7.96 s. The first aggregate run exposed one stale recovery fixture that lacked the newly required 4.3 compiler summaries and therefore failed earlier as `CANONICAL_BUNDLE_INVALID`. After making that test input a valid 4.3 bundle, the original gate assertion passed; production code was not weakened.

`C3` — release-candidate verification: pending Task 8. It will run `npm run check`, `npm run test:benchmark`, `npm run public-pilot`, byte synchronization checks, and the read-only E2E Runner consumer tests.

A preliminary full `npm run test:benchmark` run after adding the evaluator passed 165/165 tests in 103.72 s. Task 8 must run it again against the final built/publication state before it becomes release-candidate evidence.

## AT01–AT31 trace

All rows report what was actually run. “Protection” means the pre-existing V4 behavior was encoded and observed rather than deliberately broken. “Changed” means the new 4.3 behavior was first observed failing in its focused test before implementation.

| ID | Test / fixture | Command | Observed result | Limitation |
|---|---|---|---|---|
| AT01 | `v4-source-fidelity-protection`: unreadable channel | C2 | Pass — channel loss remains a technical limitation and is not converted to business truth. | Fixture-level; live online comment retrieval not exercised. |
| AT02 | `v4-source-fidelity-protection`: AND/OR/EXCEPT and table cells | C2 | Pass — operators, exception, and all table cells conserved. | Protection fixture; no model extraction run. |
| AT03 | Source-fidelity plus existing source-policy paths | C2 | Pass for explicit source projection and conflict-preserving foundation. | Full existing source-policy regression awaits C3; no live conflicting PRD pair. |
| AT04 | `v4-design-assurance`: complete responsibilities/dispositions | C2 | Pass — rule groups and candidates require total auditable ownership. | Structural compiler fixture, not model design scoring. |
| AT05 | `v4-design-assurance`: merge targets/cycles | C2 | Pass — independent targets cannot disappear through invalid merge. | Candidate equivalence truth is fixture-explicit. |
| AT06 | `v4-design-assurance`: semantic-gap/exploratory disposition | C2 | Pass — unsupported exclusion is rejected and dispositions stay distinct. | Does not measure model propensity to invent retry rules. |
| AT07 | `v4-design-assurance`: duplicate/merge/evidence references | C2 | Pass — references and merge graph fail closed. | Compiler validation only. |
| AT08 | `v4-design-assurance`: unsupported exclusion | C2 | Pass — source-free exclusion fails. | Compiler validation only. |
| AT09 | `v4-design-assurance`: batch completion/current plan | C2 | Pass — incomplete/stale batches fail and impacted prior batches are explicit. | New-authority-source new-run behavior awaits full C3 regression. |
| AT10 | `v4-case-quality-protection`: terminal observation | C2 | Pass — Case retains an independently diagnosable result. | Protection fixture. |
| AT11 | Same-object complete flow fixture | C2 | Pass — single-point Case remains; complete flow creates then uses the same object. | Protection fixture; no browser execution. |
| AT12 | Complete-flow eligibility and critical gate fixtures | C2 | Pass — known paths are preserved and unresolved critical relations cannot be formally delivered. | No generative comparison. |
| AT13 | Case data/oracle responsibility fixture | C2 | Pass — concrete data/result responsibility stays bound to a formal point. | Protection fixture is representative, not exhaustive. |
| AT14 | Explicit enumeration fixture | C2 | Pass — three explicit enum values produce three distinct formal results. | Permission example is also checked in presentation, not a live system. |
| AT15 | Missing/unknown/verified execution resources | C2 | Pass — all three produce the same logical Case document. | Execution itself intentionally not run. |
| AT16 | `v4-critical-delivery-gate`: shared root/impact | C2 | Pass — classification follows acceptance impact and updates a root, not Case-count risk. | Explicit semantic roots; no model dialogue. |
| AT17 | Partial/stale/atomic delivery journey and recovery | C2 | Pass — unresolved critical selection fails atomically; stale bindings cannot materialize. | Dialogue parser exercised through fixtures. |
| AT18 | Critical formal-delivery block | C2 | Pass — no bypass action is advertised and the whole formal delivery remains blocked. | Draft/question UX not manually inspected. |
| AT19 | Defer/unknown recovery | C2 | Pass — critical root remains answerable and cannot be delivered around. | Fixture recovery only. |
| AT20 | Temporary resolution and canonical root ledger | C2 | Pass — `resolved_temporary` remains visible and cannot satisfy critical finality. | Persistence covered by recovery fixtures, not process crash injection at OS level. |
| AT21 | High-risk noncritical Conditional path | C2 | Pass — noncritical representative input retains legacy Conditional delivery semantics. | One representative-value fixture. |
| AT22 | Closed acceptance-impact schema/gate | C2 | Pass — unclassified in-scope semantic impact fails closed; risk/resources do not decide criticality. | Classification truth is supplied explicitly. |
| AT23 | Source-first target and review findings | C2 | Pass — target covers source/model/responsibility/Case content and validates exact references. | Reviewer behavior is fixture-provided, not an external reviewer. |
| AT24 | Digest change/retry/recovery | C2 | Pass — data/step/Oracle changes invalidate review; review prose does not self-invalidate. | Same-session deterministic compiler test. |
| AT25 | Frozen `general-quality-v1` corpus | C1, C2 | Pass — 2/3 effective coverage; duplicates/gaps/exploration do not inflate; hard failures and zero denominator behave as specified. | No before/after model generation; reserved fixture now consumed. |
| AT26 | Final E3/E2/non-applicability resolution | C2 | Pass — valid final bases clear the critical gate while unrelated noncritical state remains governed separately. | Authority inputs are fixtures. |
| AT27 | Changed root version, old ready, materialize/publish | C2 | Pass — stale states/selections and old ready authority cannot satisfy current delivery. | Filesystem recovery is local temp storage. |
| AT28 | Closed contracts, summaries, manifest digest | C2 | Pass — unknown/missing/mismatched current 4.3 content fails; no fifth artifact is added. | Maintained-source build identity awaits C3. |
| AT29 | 4.2 frozen shape vs 4.3 review requirement | C2 | Pass — 4.2 keeps its shape; 4.3 requires current bound review. | Complete old-run/cancel/repair suite awaits C3. |
| AT30 | Canonical JSON projections | C2 | Pass — HTML/Table/Markdown/CSV preserve Case count/order, steps, enum/permission wording, and result meaning. | Execution-plan consumer/full suite awaits C3. |
| AT31 | Repository layout and maintained-source workflow | inspection and commits above | Partial — changes are in maintained engineering source and generated files have not been hand-edited. | Build/sync and bundle-only detection verification await C3; therefore AT31 is not yet complete. |

## Current decision

Task 7 implementation candidate is complete once its code, tests, and this report are committed. Release acceptance remains **not passed** because Task 8 full verification is pending and because the fixed protocol explicitly records that model generation was not run. No installed Skill, remote branch, tag, release, or `b2b-e2e-runner` source has been changed by this work.
