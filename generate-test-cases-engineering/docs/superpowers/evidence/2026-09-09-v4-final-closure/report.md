# generate-test-cases v4 final closure evidence

Date: 2026-09-09 (Asia/Shanghai)

## Contract and candidate

- `01-problem-and-optimization-record.md` was read as problem context; SHA-256 `db325c659b00fbc4031db1eb0a55582ca603098f0048b9840184adf9c91053c4`.
- `02-technical-design.md` was read as architecture context; SHA-256 `8696d16ddd42cea7347c4f244cdca3fd2c3fae893f088692ca9959e4aaa8a0c2`.
- `03-development-spec.md` was read as the sole normative implementation and acceptance contract; SHA-256 `36cd18a5d290bd16d09c4c75db24882253194a17f8cd29f7021a03b608dd7a45`.
- Repository baseline: `1b16eddda0ed13a02a41d6a1dd1c5cecf23cfa02`.
- Verified code candidate: `42a509e03034218604d86b9774a07d464855d730` on `codex/generate-test-cases-v4`.
- Development root: `generate-test-cases-engineering`.
- Published repository Skill: `generate-test-cases`.
- Runtime: Node `v24.18.0`; npm `11.16.0`.

Tasks T01-T15, BR-01-BR-19, and P-01-P-20/O-01-O-03 are mapped in `docs/superpowers/plans/2026-09-09-generate-test-cases-v4.md`. Every BR has separate positive and reversal/exception coverage; no trace item is marked N/A or deferred.

## RED to GREEN closure found by final pressure and pre-merge review

The first recovery pressure run on predecessor `c199c0703ce53002882c4c51b49d0258f13ce727` exposed a real P1: an answer bound to a resolved/closed root was internally classified as `stale_answer`, but the runner projected the internal diagnostic into the public warning field and produced `fatal/RUN_INTEGRITY_ERROR`. This violated Task 09's recoverable late-answer rule.

- RED: installed-bundle test `T09 installed runner rejects a stale answer without turning the recoverable state into fatal` failed because the actual reply was `fatal` rather than the current `need_user_answers` reply.
- First GREEN on `244f1ea`: the runner stopped converting this recoverable transition into a fatal reply, discarded stale staging, committed no revision, and resumed either the current presentation or the committed pipeline state.
- Regression scope: stale answer while another presentation is current; stale answer after the presentation is closed; no accepted revision; staging removal; byte-identical checkpoint; empty public diagnostics; clean replay without resurrection.
- Pre-merge review then found that the first fix had widened the public `nonBlockingDiagnostic.code` union with `STALE_ANSWER`, while normative section 5.7 permits only `FINAL_AUTHORITY_NOT_GRANTED`. This was a P1 contract mismatch even though the behavior was recoverable.
- Second RED: the normative schema, installed-runner, reducer, and Skill-policy expectations failed 9 tests while the widened public warning remained.
- Second GREEN: stale answers remain an internal `stale_answer` transition with an internal diagnostic, while public replies carry an empty `non_blocking_diagnostics` array and return the current committed presentation/pipeline state. The public warning union is again exactly `FINAL_AUTHORITY_NOT_GRANTED`. Targeted tests passed 15/15 and the broader stale/schema/installed-runner group passed 54/54.

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

## Three final-candidate fresh-context pressure runs

Each Agent started without the implementation conversation, read the release Skill and the real Task 15 B-end PRD, used only the installed public runner in a fresh `/private/tmp` durable directory, and left the candidate worktree clean at the same SHA.

### 1. Success and canonical delivery

- Result: PASS; no P0/P1.
- Report: `/private/tmp/gtc-v4-42a509e-success-3r0LPY/success-observation.json`; SHA-256 `3f2be00606c2529b629156cdea711c25b7435fabbd785ff6718ca708a56531d1`.
- Transcript: `/private/tmp/gtc-v4-42a509e-success-3r0LPY/success-transcript.jsonl`; SHA-256 `c9aa7b9135c57f16b102311c42cc6f24b3ce97ea25dedd2a769efccef4b03bae`.
- Result `delivered_with_gaps` at r003; five modules; seven independent Cases/Test Points; question conservation 3 -> 2 after the IP-only answer; blank replay committed nothing; the sorting gap remained explicitly closed for delivery.
- JSON, business Markdown and worksheet CSV have identical 7/7/7 Case membership and verified digests under one current manifest. No execution-resource question, execution plan, E2E start or fallback artifact occurred.

### 2. Failure chain and no fallback

- Result: PASS; no P0/P1.
- Report: `/private/tmp/gtc-v4-42a509e-failure-20260909T082332Z/report.md`; SHA-256 `6feb129b938b4dc134ce40a6afc22026e2ccb9b0bd010e03b1d18072920e2f7c`.
- Machine evidence: `evidence.json`; SHA-256 `e289bfb2effba368bd5d261cccd6e16bcc87ea11dbb9e69e6a596ef755ffb8e4`.
- Transcript: `cli-transcript.jsonl`; SHA-256 `1009ad30d1e16c7ccb407c898931ad307afe30c45bee9d5562bbae5ead2d7cdc`.
- 259/259 assertions across 27 commands; 22 installed CLI calls all exited 0 with empty stderr, exactly one schema-valid JSON line; the expected SIGKILL was recovered exactly once.
- Malformed Behavior returned `need_revision/BEHAVIOR_BINDING_MISSING` without semantic/resource laundering. Applicable zero Case returned `fatal/quality_failure/FORMAL_TEST_POINT_UNCOVERED`, with no current output. Stray Markdown/XLSX remained inert. Repair delivered seven Cases and three explicitly closed gaps. All-DNE yielded `no_execution_selected` and `[]`; the ready sibling projected exactly Grounded + Execute + ready Cases.

### 3. Recovery, partial answers and stale answers

- Result: PASS; no P0/P1.
- Report: `/private/tmp/gtc-v4-42a509e-recovery-S9X1jV/recovery-report.json`; SHA-256 `40efc4e7064da871e9bf39bef65f3a5ab8d7b472d8f9ffe83cf6d04f7b24cb58`.
- Transcript: `/private/tmp/gtc-v4-42a509e-recovery-S9X1jV/recovery-transcript.jsonl`; SHA-256 `56adab73686c3444b322b0ebc8fbae60dccbdeb8e802fea02c662371073cdd3d`.
- 188/188 assertions. Questions converged exactly 3 -> 2 -> 1. Blank input wrote nothing; defer and explicit close remained distinct.
- Both stale windows returned the exact current public state with `non_blocking_diagnostics: []`; no staging or accepted revision appeared, and checkpoint, Decision journal, clarification state and root inventory stayed unchanged. Replay did not resurrect a warning or root.
- Reservation-boundary SIGKILL recovery and full-production signed-query semantic equivalence passed. Safe acquisition removed ephemeral material, and persisted files contained no credential/query text.

## Isolated clean-checkout verification

- Directory: `/private/tmp/gtc-v4-final-42a509e.wpz69q/repo`.
- Detached HEAD before and after: `42a509e03034218604d86b9774a07d464855d730`.
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
| `skill/generate-test-cases/scripts/schema-manifest.json` | `2d356f4d50a4f542b6d66ae5903b832d1d20a2e0c7cc47275ce55fe064b59f71` |
| `skill/generate-test-cases/scripts/schemas/reply.schema.json` | `f6d82072d0a634cf85708f3d336128fd8b3f7bf2fe055faf46e8c33b4f1efa8b` |
| `skill/generate-test-cases/scripts/test-compiler.mjs` | `22c60e987cee8919f4257665b47774cd99d7afd74db679930b8f60fcbc8e764a` |

The manifest binds compiler `0.5.0`, schema `4.0.0`, and schema-set digest `75a04a5f10cda967e8f4c1eeb4437ad3e875cd2ca30b775da62918aaaacae5b6`.

## Closure

Tasks T01-T15 and the v4 Definition of Done are satisfied for the requested development contract at verified code candidate `42a509e03034218604d86b9774a07d464855d730`. The Skill produces and confirms canonical manual functional Case Documents and, only on explicit downstream intent, an execution plan/runner Case ID projection. It does not run E2E tests. No global Skill installation, npm publication, comparator/expert benchmark claim, or RC tag is part of this closure.
