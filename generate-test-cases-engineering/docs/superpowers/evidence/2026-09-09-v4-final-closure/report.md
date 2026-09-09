# generate-test-cases v4 final closure evidence

Date: 2026-09-09 (Asia/Shanghai)

## Contract and candidate

- `01-problem-and-optimization-record.md` was read as problem context; SHA-256 `db325c659b00fbc4031db1eb0a55582ca603098f0048b9840184adf9c91053c4`.
- `02-technical-design.md` was read as architecture context; SHA-256 `8696d16ddd42cea7347c4f244cdca3fd2c3fae893f088692ca9959e4aaa8a0c2`.
- `03-development-spec.md` was read as the sole normative implementation and acceptance contract; SHA-256 `36cd18a5d290bd16d09c4c75db24882253194a17f8cd29f7021a03b608dd7a45`.
- Repository baseline: `1b16eddda0ed13a02a41d6a1dd1c5cecf23cfa02`.
- Verified code candidate: `244f1ea01d4843ae88d7f64b97b512850963efd1` on `codex/generate-test-cases-v4`.
- Development root: `generate-test-cases-engineering`.
- Published repository Skill: `generate-test-cases`.
- Runtime: Node `v24.18.0`; npm `11.16.0`.

Tasks T01-T15, BR-01-BR-19, and P-01-P-20/O-01-O-03 are mapped in `docs/superpowers/plans/2026-09-09-generate-test-cases-v4.md`. Every BR has separate positive and reversal/exception coverage; no trace item is marked N/A or deferred.

## RED to GREEN closure found by final pressure review

The first recovery pressure run on predecessor `c199c0703ce53002882c4c51b49d0258f13ce727` exposed a real P1: an answer bound to a resolved/closed root was internally classified as `stale_answer`, but the runner projected the internal diagnostic into the public warning field and produced `fatal/RUN_INTEGRITY_ERROR`. This violated Task 09's recoverable late-answer rule.

- RED: installed-bundle test `T09 installed runner rejects a stale answer without turning the recoverable state into fatal` failed because the actual reply was `fatal` rather than the current `need_user_answers` reply.
- GREEN: `src/clarification-v4.mjs` now emits a closed public `STALE_ANSWER` warning while preserving the internal transition; `src/advance-v4.mjs` discards stale staging, commits no revision, and resumes either the current presentation or the committed pipeline state. The reply schema and clarification policy were updated and both generated bundles rebuilt.
- Regression scope: stale answer while another presentation is current; stale answer after the presentation is closed; no accepted revision; staging removal; byte-identical checkpoint; one-shot warning; clean replay without resurrection.
- Targeted independent review: 14/14 tests passed and found no P0/P1/P2.

## Local candidate gates

All commands ran from the development root unless another directory is shown.

| Command | Exit | Result |
|---|---:|---|
| `npm run check` | 0 | 1442/1442 main tests; repeatability 2/2; 100 fresh installed-shape runs byte-identical; deterministic across three durable directories |
| `npm run test:benchmark` | 0 | 145/145 benchmark-tool and single-system gate tests |
| `npm run public-pilot` | 0 | `pilot_ready`; 30/30 admitted, five in each of six strata; zero issues |
| `npm run build -- --check` | 0 | modular source and generated bundle synchronized |
| `diff -qr skill/generate-test-cases ../generate-test-cases` | 0 | engineering and repository-published Skill byte-identical |
| `node --check skill/generate-test-cases/scripts/test-compiler.mjs` | 0 | packaged runner syntax valid |
| `git diff --check` | 0 | no whitespace errors |
| official `quick_validate.py` on engineering Skill | 0 | `Skill is valid!` |
| official `quick_validate.py` on repository Skill | 0 | `Skill is valid!` |

The public-pilot result is corpus-admission evidence only. Its deliberate `release_eligible:false` / `insufficient_evidence` field is not represented as an expert-quality or external business-accuracy result, and comparator/expert scoring is outside this v4 development contract.

## Three fresh-context pressure runs

Each Agent started without the implementation conversation, read the release Skill and the real Task 15 B-end PRD, used the installed public runner in fresh `/private/tmp` durable directories, and left the candidate worktree clean at the same SHA.

### 1. Success and canonical delivery

- Result: PASS; no P0/P1.
- Report: `/private/tmp/gtc-v4-final-success-verify-244f1ea.rZie7u/success-observation.json`.
- Report SHA-256: `2ebfb72c989f5517f487cd4c347ffe886a1313e421c285d298fc300b7930b7fc`.
- Ten runner calls: all exit 0, empty stderr, exactly one JSON line.
- Result `delivered_with_gaps` at r003; five modules; seven independent Cases/Test Points; explicit sorting gap.
- JSON, business Markdown and worksheet CSV have identical Case membership and verified digests under one manifest. No execution plan, E2E start or fallback artifact occurred.

### 2. Failure chain and no fallback

- Result: PASS; no P0/P1.
- Report: `/private/tmp/gtc-v4-244f1ea01d4843ae88d7f64b97b512850963efd1-final-failure-20260909T063901Z/report.md`; SHA-256 `60787074c03098365dc10f37f24a40ed2a2cd63bdd56350b5a18c357d6c238de`.
- Machine evidence: `evidence.json`; SHA-256 `4ab17d298791f6d06580eccbf8fbb6a102186f2d2e502f91536eea1c0ccf8356`.
- Transcript: `cli-transcript.jsonl`; SHA-256 `630b78eaf600a48f487b5fadf3b0a8c3c704d3e7bcb687ca178d7613f2c7b804`.
- 259/259 assertions; 22 installed CLI calls all obeyed the JSON protocol; the expected SIGKILL was recovered exactly once.
- Malformed Behavior returned `need_revision/BEHAVIOR_BINDING_MISSING` without semantic/resource laundering. Applicable zero Case returned `fatal/quality_failure/FORMAL_TEST_POINT_UNCOVERED`, with no current output. Stray Markdown/XLSX remained inert. Repair delivered seven Cases and three explicitly closed gaps. All-DNE yielded `no_execution_selected` and `[]`; the ready sibling projected exactly Grounded + Execute + ready Cases.

### 3. Recovery, partial answers and stale answers

- Result: PASS; no P0/P1.
- Fresh audit: `/private/tmp/gtc-v4-final-recovery.qY32MQ/fresh-installed-report.json`; SHA-256 `5c3afb66ee1e9a528a7f9462dd71872c169355b96b0cbb5d75e5d5f014215349`.
- CLI transcript SHA-256: `bc2a3d6629b6bcf2c83edc3f3271fb0b72b68ec991579d7ba86a6a5dc63e9689`.
- Targeted suite report SHA-256: `f430546c462048dd94acd453179febb5ce96e59cb54ef15586a9471e2d219a95`.
- 152/152 fresh-CLI assertions plus Task 15/repeatability 7/7.
- Questions converged exactly 3 -> 2 -> 1. Blank input wrote nothing; defer and explicit close remained distinct. Both stale windows returned the current nonfatal state and exactly one `STALE_ANSWER`; r002/r005 were not accepted; staging disappeared; checkpoint, Decision journal and clarification state stayed byte-identical; the next replay had no warning or root resurrection.
- Reservation-boundary SIGKILL recovery and signed-query semantic equivalence passed. Safe acquisition removed ephemeral material, and persisted files contained no credential/query text.

## Isolated clean-checkout verification

- Directory: `/private/tmp/gtc-v4-final.bKtqWL/repo`.
- Detached HEAD before and after: `244f1ea01d4843ae88d7f64b97b512850963efd1`.
- `git status --porcelain=v1 --untracked-files=all`: empty before dependency installation and empty after all gates.
- `npm ci --offline`: exit 0; four packages installed; zero vulnerabilities.
- `npm run check`: exit 0; 1442/1442 plus repeatability 2/2.
- `npm run test:benchmark`: exit 0; 145/145.
- `npm run public-pilot`: exit 0; 30/30 admitted with no issues.
- Both official validators: exit 0, `Skill is valid!`.
- `npm run build -- --check`, Skill directory byte diff, bundle syntax and `git diff --check`: all exit 0.
- Post-gate status: clean; no production, fixture, generated, or user-file drift.

## Frozen artifact digests

| Artifact | SHA-256 |
|---|---|
| `src/advance-strict.mjs` | `a1110633d8ab23da3b5ac971b31aee7dbf112b5d7d4a7cb607fd81639b31a4cf` |
| `src/advance-v4.mjs` | `539117c4d663fcb2fd2010fba94ad36273b9913ce5eb3f11156fcf35ff816f55` |
| `skill/generate-test-cases/SKILL.md` | `b7e1d280b488e2430cd933d143eb271082b62dc93e70b4bb57c5dbf42aa3614f` |
| `skill/generate-test-cases/scripts/schema-manifest.json` | `96051722a512fc4e6c3b10839fd4d7fba8d1f05c368fbbc18d5c404ed3112162` |
| `skill/generate-test-cases/scripts/test-compiler.mjs` | `b83ca58b79ee9cb5e284a153674b8f2a3e7905c73be4e8f9101cbdddc55d7e7c` |

The manifest binds compiler `0.5.0`, schema `4.0.0`, and schema-set digest `6bab3dfab5896cc1f1c7f61480328b540a661cfb4c4568ae08ed7fc82d7f4ecd`.

## Closure

Tasks T01-T15 and the v4 Definition of Done are satisfied for the requested development contract. The Skill produces and confirms canonical manual functional Case Documents and, only on explicit downstream intent, an execution plan/runner Case ID projection. It does not run E2E tests. No global Skill installation, npm publication, comparator/expert benchmark claim, or RC tag is part of this closure.
