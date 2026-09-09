# generate-test-cases v4 implementation ledger

Normative contract: `03-development-spec.md` supplied on 2026-09-09. The problem record and technical design are context only. Baseline commit: `1b16eddda0ed13a02a41d6a1dd1c5cecf23cfa02` on `codex/generate-test-cases-v4`.

## Gate order

The implementation follows the specification DAG and records RED before GREEN for every observable slice:

1. T01 characterization fixtures and four independent RED failures.
2. T02 schema 4.0.0/compiler 0.5.0, including the required JSON-Schema dialect semantics.
3. T03–T05 case-document/execution separation, resource independence, and relative baselines.
4. T11 source canonicalization before T07 topology/scope.
5. T06 sparse behaviors, outcomes, risk review, values, and ordering after T04/T07.
6. T08–T10 two-phase clarification, partial answers, and revision transactions.
7. T12 canonical outputs/result routing; T13 v3 migration; T14 Skill policy; T15 journeys and release evidence.

## Required verification

- Targeted RED/GREEN commands are recorded with the task commits.
- Every BR-01–BR-19 has a positive and negative test.
- The P-01–P-20 and O-01–O-03 mappings use the exact test files in Spec section 9.1; no item may be marked N/A.
- Final gates: `npm run check`, `npm run test:benchmark`, `npm run public-pilot`, installed-shape contract tests, validator, v4 journey/golden/recovery, 100-run determinism, and three fresh-context pressure runs.
- Generated `schema-manifest.json` and `scripts/test-compiler.mjs` are rebuilt from source; generated files are never hand-edited.

## Baseline evidence

- `npm ci --offline`: exit 0; 4 packages installed; 0 vulnerabilities.
- `npm run check`: exit 0; 911 core/golden/interface/recovery tests passed and one 100-run installed-shape repeatability test passed.
- Node `v24.18.0`; npm `11.16.0`.

## Task status

| Task | State | Evidence |
|---|---|---|
| T01 | complete | all six B-end fixture assets exist; precursor commit `4277522` retains the four failing v3 characterizations, while `v4-user-outcome-contract.test.mjs` records them and enforces their v4 GREEN contracts |
| T02 | complete | compiler 0.5/schema 4 intent, reply, manifest and bundle contracts are rebuilt and integrity-checked |
| T03 | complete | Case Document and Execution Plan boundaries, immutable ref verification, action parity and execution-schema validation have focused and installed-shape tests |
| T04 | complete | logical CaseSpec, resource-independence metamorphism and eight-way diagnostic routing are covered by v4 production tests |
| T05 | complete | capture-at-execution relative baseline and selected-dimension negative cases are covered |
| T06 | complete | sparse behavior, atomic outcomes, risk ledger, values, NotApplicable and ordering have v4 positive/negative suites |
| T07 | complete | compiler-owned topology, five-module scope, role lineage and complete interaction review are covered; P-17 has explicit v4 tests in both Section 9 target paths |
| T08 | complete | pre/post-case semantic checkpoints, bulk presentation and no-information-gain conservation are covered |
| T09 | complete | partial answer conservation, authority downgrade, exact answer span and late-answer handling are covered |
| T10 | complete | revision profiles, append replay/conflict, crash recovery and semantic-reopen lineage are covered |
| T11 | complete | canonicalization, locator, source event, signed acquisition, asset binding, expiry and multi-revision runner paths are covered |
| T12 | complete | result matrix, all four cancellation phases plus installed sibling resume, canonical read-back, Markdown/CSV and the required B-end golden are covered |
| T13 | complete | read-only v3 migration/index/recovery and production migrated-seed reanalysis are covered |
| T14 | complete | Skill and references contain the v4 policy; official validator and engineering/repository Skill byte sync pass |
| T15 | complete | B-end production journeys, failure paths, no-fallback, 100-run installed repeatability, benchmark-tool tests, 30-PRD public-pilot, three final-candidate fresh-context pressure runs and isolated clean-candidate verification pass |

## Task 02 evidence

- RED: schema-dialect suite initially exposed ten unsupported dialect behaviors; delivery-intent suite exposed four missing v4 contract behaviors; manifest, reply, and bundle suites each failed before their schemas existed.
- GREEN: `node --test test/core/v4-schema-dialect.test.mjs test/interface/v4-delivery-intent.test.mjs test/interface/v4-manifest-contract.test.mjs test/interface/v4-reply-contract.test.mjs test/interface/v4-test-bundle-contract.test.mjs test/interface/schema-integrity.test.mjs` — exit 0, 73/73 passed.
- Static/build checks: `./node_modules/.bin/tsc --noEmit -p jsconfig.json` and `node build/build.mjs --check` — exit 0.
- Legacy installed-shape journey remains readable and executable; schema/build artifacts were regenerated with the repository build, not edited directly.

## BR-01–BR-19 acceptance evidence

The table identifies an affirmative path and a rule-reversal/exception path for every BR. A file appears in both columns only when it contains distinct positive and negative test cases.

| BR | Positive v4 evidence | Negative / exception v4 evidence |
|---|---|---|
| BR-01 | `test/interface/v4-delivery-intent.test.mjs` accepts both explicit intents | same file rejects omitted and unknown intents while preserving v3 read-only behavior |
| BR-02 | `test/interface/v4-case-document-boundary.test.mjs`; `test/core/v4-generation-resource-independence.test.mjs` | same files reject execution contamination and prove execution metadata cannot change Case identity |
| BR-03 | `test/interface/v4-case-document-boundary.test.mjs`; `test/interface/v4-execution-action-contract.test.mjs` | same files reject arbitrary/noncanonical refs and intent/phase crossover |
| BR-04 | `test/core/v4-relative-baseline.test.mjs` compiles a Grounded capture-at-execution Case | same file rejects invented dimensions and malformed/unsupported declarations |
| BR-05 | `test/core/classification.test.mjs`; `test/core/v4-gap-classification.test.mjs` | tagged P-03/P-06 cases prove adapter/resource/execution issues never become business questions |
| BR-06 | `test/interface/v4-two-phase-clarification.test.mjs`; `test/interface/v4-bend-review-journey.test.mjs` | same files reject premature/cross-phase checkpoints and resource questions |
| BR-07 | `test/core/v4-partial-answer.test.mjs`; `test/interface/v4-two-phase-clarification.test.mjs` | blank/no-information-gain and omitted-answer tests preserve pending roots |
| BR-08 | `test/recovery/v4-decision-recompile.test.mjs`; `test/core/v4-partial-answer.test.mjs` | same files reject stale/ambiguous answers and unauthorized final authority |
| BR-09 | `test/recovery/v4-idempotent-append.test.mjs`; `test/recovery/v4-revision-transaction.test.mjs` | same files cover conflicting IDs/digests, aborts and phase crashes |
| BR-10 | `test/core/v4-scope-manifest.test.mjs`; `test/core/interaction-matrix.test.mjs` | tagged P-17 tests reject omitted interaction cells; role/scope tests reject unsupported expansion |
| BR-11 | `test/core/v4-sparse-behavior.test.mjs`; `test/core/v4-value-origin.test.mjs` | same files reject synthetic surfaces/states/effects, cross-branch values and dangling refs |
| BR-12 | `test/core/v4-business-outcome-obligations.test.mjs`; `test/core/coverage.test.mjs` | tagged P-10 tests reject a formal outcome whose only Case is removed |
| BR-13 | `test/core/v4-source-canonicalization.test.mjs`; `test/core/v4-locator-precision.test.mjs` | same files reject credentials, broad locators, malformed structure and unverified asset identity |
| BR-14 | `test/golden/v4-bend-review-platform.test.mjs`; `test/golden/v4-canonical-delivery.test.mjs` | `test/golden/canonical-bundles.test.mjs` and canonical-delivery tamper tests reject divergent membership/digests |
| BR-15 | `test/interface/v4-zero-case-outcome.test.mjs`; `test/golden/v4-bend-review-platform.test.mjs` | `test/core/final-status.test.mjs`; `test/interface/v4-no-fallback-conformance.test.mjs` reject zero-Case pseudo-success/fallback |
| BR-16 | `test/interface/v4-reply-contract.test.mjs`; `test/interface/v4-need-artifact-reply.test.mjs` | `test/interface/v4-runner-production.test.mjs` rejects malformed stage stops and unverified recovery refs |
| BR-17 | `test/interface/v4-execution-action-contract.test.mjs`; `test/interface/v4-two-phase-clarification.test.mjs` | same files reject advertised-but-unimplemented, stale and phase-inappropriate actions |
| BR-18 | `test/core/v4-risk-review-ledger.test.mjs`; `test/core/v4-value-origin.test.mjs` | same files reject missing risk dispositions, false N/A and unsupported value origins |
| BR-19 | `test/golden/v4-business-readable-markdown.test.mjs`; `test/golden/v4-bend-review-platform.test.mjs` | same files reject internal-ID leakage, abstract questions, unnamed ratios and nonbusiness ordering |

## Section 9 P/O traceability

These mappings retain every exact Section 9.1 target and add an explicit v4 companion where an exact target filename historically contained only v3 tests. The bracketed P labels in the named tests make the seven formerly implicit v4 mappings directly auditable.

Command-level evidence for this closure will be retained in `docs/superpowers/evidence/2026-09-09-v4-final-closure/report.md` after the final pressure and clean-candidate gates complete.

| Item | v4 acceptance evidence |
|---|---|
| P-01 | `test/interface/v4-case-document-boundary.test.mjs`; `test/core/v4-generation-resource-independence.test.mjs` |
| P-02 | `test/core/v4-relative-baseline.test.mjs` |
| P-03 | `test/interface/v4-case-document-boundary.test.mjs`; `[P-03]` in `test/core/classification.test.mjs` and `test/core/v4-gap-classification.test.mjs` |
| P-04 | `test/recovery/v4-idempotent-append.test.mjs`; `test/recovery/v4-revision-transaction.test.mjs` |
| P-05 | `test/core/v4-partial-answer.test.mjs`; `test/recovery/v4-decision-recompile.test.mjs` |
| P-06 | `[P-06]` in `test/core/classification.test.mjs`, `test/core/v4-gap-classification.test.mjs` and `test/interface/v4-execution-action-contract.test.mjs`; `test/core/v4-pre-case-clarification.test.mjs` |
| P-07 | `test/interface/v4-execution-action-contract.test.mjs`; `test/interface/v4-two-phase-clarification.test.mjs`; `test/golden/v4-business-readable-markdown.test.mjs` |
| P-08 | `[P-08]` in `test/core/final-status.test.mjs` and `test/interface/v4-zero-case-outcome.test.mjs` |
| P-09 | `[P-09]` in `test/golden/canonical-bundles.test.mjs`, `test/golden/v4-bend-review-platform.test.mjs` and `test/golden/v4-execution-worksheet.test.mjs` |
| P-10 | `[P-10]` in `test/core/coverage.test.mjs`, `test/core/v4-business-outcome-obligations.test.mjs` and `test/golden/v4-bend-review-platform.test.mjs` |
| P-11 | `[P-11]` in `test/golden/canonical-bundles.test.mjs`, `test/golden/v4-bend-review-platform.test.mjs` and `test/interface/v4-no-fallback-conformance.test.mjs` |
| P-12 | `test/core/v4-business-outcome-obligations.test.mjs`; `test/golden/v4-business-readable-markdown.test.mjs` |
| P-13 | `test/core/v4-risk-review-ledger.test.mjs`; `test/interface/v4-bend-review-journey.test.mjs` |
| P-14 | `test/core/v4-scope-manifest.test.mjs` |
| P-15 | `test/core/v4-sparse-behavior.test.mjs`; `test/core/v4-value-origin.test.mjs` |
| P-16 | `test/core/v4-business-outcome-obligations.test.mjs`; `test/core/v4-risk-review-ledger.test.mjs` |
| P-17 | `[P-17]` in `test/core/interaction-matrix.test.mjs` and `test/core/v4-scope-manifest.test.mjs` |
| P-18 | `test/core/v4-locator-precision.test.mjs` |
| P-19 | `test/core/v4-source-canonicalization.test.mjs`; `test/core/v4-source-asset.test.mjs` |
| P-20 | `test/interface/v4-zero-case-outcome.test.mjs`; `test/golden/v4-business-readable-markdown.test.mjs` |
| O-01 | `test/core/v4-generation-resource-independence.test.mjs` contains the Section 7.1 five-field metamorphic assertion |
| O-02 | `test/interface/v4-two-phase-clarification.test.mjs` |
| O-03 | `test/core/v4-partial-answer.test.mjs`; `test/recovery/v4-idempotent-append.test.mjs` |

## Final gate status

The implementation is merge-ready at this checkpoint:

- `npm run check`: exit 0; 1,442 main tests plus the 100-run and three-directory
  installed-shape determinism checks pass.
- `npm run test:benchmark`: exit 0; 145/145 benchmark-tool tests pass.
- `npm run public-pilot`: exit 0; `pilot_ready`, 30/30 admitted PRDs, five per
  frozen stratum, and no issues. This required command is a corpus-admission
  preflight; its deliberately non-release result does not make an expert-quality
  claim, and this v4 contract requires no such claim.
- `npm run build -- --check`, engineering/published Skill byte comparison,
  bundle syntax, diff integrity, and the official Skill validator pass.
- The corrected tree keeps stale-answer diagnostics internal and has passed targeted 15/15, broader 54/54, full 1,442/1,442, 100-run/two-repeatability, build, Skill synchronization, syntax, diff-integrity, and both official-validator checks.
- Three fresh-context pressure Agent runs passed on candidate `42a509e03034218604d86b9774a07d464855d730`, including the mandatory failure/no-fallback and stale-answer recovery chains.
- The isolated checkout at `/private/tmp/gtc-v4-final-42a509e.wpz69q/repo` was clean before and after `npm ci --offline`, all three final npm commands, both official validators, build/bundle/Skill synchronization checks and digest verification.
- Full command, pressure-run and digest evidence is retained in `docs/superpowers/evidence/2026-09-09-v4-final-closure/report.md`. Any later production, Schema, Skill, or generated bundle change invalidates the affected evidence and must be reverified.
