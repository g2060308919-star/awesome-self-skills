# generate-test-cases v4 final closure evidence

Date: 2026-09-09 (Asia/Shanghai)

## Contract and verified code candidate

- `01-problem-and-optimization-record.md` was read as context; SHA-256 `db325c659b00fbc4031db1eb0a55582ca603098f0048b9840184adf9c91053c4`.
- `02-technical-design.md` was read as context; SHA-256 `8696d16ddd42cea7347c4f244cdca3fd2c3fae893f088692ca9959e4aaa8a0c2`.
- `03-development-spec.md` was read as the sole normative implementation and acceptance contract; SHA-256 `36cd18a5d290bd16d09c4c75db24882253194a17f8cd29f7021a03b608dd7a45`.
- Repository baseline: `1b16eddda0ed13a02a41d6a1dd1c5cecf23cfa02`.
- Verified code candidate: `613d59a75a20c0bd521a3944d8c5ef128f2aeb0b` on `codex/generate-test-cases-v4`.
- Development root: `generate-test-cases-engineering`.
- Repository-published Skill: `generate-test-cases`.
- Runtime: Node `v24.18.0`; npm `11.16.0`.

Tasks T01-T15, BR-01-BR-19, P-01-P-20 and O-01-O-03 remain fully mapped in
`docs/superpowers/plans/2026-09-09-generate-test-cases-v4.md`. No trace item
is marked N/A or deferred.

## Final independent review and RED to GREEN closure

The predecessor candidate `2818ae2b48d11e7f93bcd0b7c3398086ffd9c163`
was invalidated after an independent pre-merge review found two contract gaps:

1. Ordinary missing Agent stage files were exposed as `need_artifact`, widening
   the sole source-acquisition discriminator frozen by section 5.7 and BR-05/16.
2. Public `non_blocking_diagnostics` inherited append order instead of the
   required `(code, source_event_id, affected_question_part_ids)` order.

The correction followed RED -> GREEN:

- RED:
  `node --test --test-concurrency=1 test/interface/v4-reply-contract.test.mjs test/recovery/v4-decision-recompile.test.mjs`
  exited 1 with 21 pass / 3 fail. The failures were the intended full
  `need_artifact` discriminator, ordinary stage routing, and warning order.
- GREEN: the same command exited 0 with 24/24.
- Strengthened focused gate:
  `node --test --test-concurrency=1 test/interface/v4-reply-contract.test.mjs test/recovery/v4-decision-recompile.test.mjs test/golden/v4-canonical-delivery.test.mjs test/interface/v4-need-artifact-reply.test.mjs`
  exited 0 with 40/40, including a direct assertion for the third tuple key.
- A fresh pre-commit review reported no blocking finding. It confirmed source,
  Schema, manifest, bundle, engineering Skill and repository Skill were
  synchronized and the change did not widen scope.

The resulting public boundary is:

- Ordinary missing `source_pack`, `evidence_claims`, `behavior_views` or
  `case_drafts`: closed `need_revision + STAGE_ARTIFACT_REQUIRED`, exactly
  one `write_stage_artifact` next step and `write_staging_artifact` recovery.
- Normative source cannot be acquired safely: the sole complete
  `need_artifact` branch, with non-empty `artifact_requests`, digest-bound
  `resume_ref`, and exactly `provide_artifact/cancel_run`.
- Every public reply construction boundary clones and canonically sorts the
  shared warning array. Stale-answer diagnostics remain internal and public
  `non_blocking_diagnostics` stays empty for that recoverable transition.

## Isolated clean-checkout gates

Isolated checkout:
`/private/tmp/gtc-v4-final-613d59a.WgX1eq/repo`.

- HEAD before and after:
  `613d59a75a20c0bd521a3944d8c5ef128f2aeb0b`.
- `git status --porcelain=v1 --untracked-files=all`: empty before dependency
  installation and empty after all gates.

All commands below ran from the isolated development root unless noted:

| Command | Exit | Result |
|---|---:|---|
| `npm ci --offline` | 0 | 4 packages installed; 0 vulnerabilities |
| `npm run check` | 0 | 1447/1447 main tests; repeatability 2/2; 100 fresh installed-shape runs byte-identical |
| `npm run test:benchmark` | 0 | 145/145 benchmark-tool and single-system gate tests |
| `npm run public-pilot` | 0 | `pilot_ready`; 30/30 admitted, five in each of six strata; zero issues |
| `npm run build -- --check` | 0 | modular source and generated bundle synchronized |
| `diff -qr skill/generate-test-cases ../generate-test-cases` | 0 | engineering and repository-published Skill byte-identical |
| `node --check skill/generate-test-cases/scripts/test-compiler.mjs` | 0 | packaged runner syntax valid |
| `git diff --check` | 0 | no whitespace errors |
| official `quick_validate.py` on engineering Skill | 0 | `Skill is valid!` |
| official `quick_validate.py` on repository Skill | 0 | `Skill is valid!` |

Validator runtime:
`/private/tmp/generate-test-cases-validator-py/bin/python`.
Validator:
`/Users/zhangxudong/.codex/skills/.system/skill-creator/scripts/quick_validate.py`.

`public-pilot` is corpus-admission evidence only. Its deliberate
`release_eligible:false` / `release_status:insufficient_evidence` fields are
not represented as expert-quality or external business-accuracy evidence.
Comparator/expert scoring is outside this v4 development contract.

## Three final-candidate fresh-context pressure runs

Each pressure Agent started without the implementation conversation, verified
the same clean candidate SHA, read the published Skill and the Task 15 B-end
PRD, used the published bundle, wrote evidence only below `/private/tmp`, and
reported no P0/P1 finding.

### 1. Success and canonical delivery

- Observation:
  `/private/tmp/gtc-v4-613-success-Iy7dqN/observation.json`;
  SHA-256 `37c374ba97c2d7a36e07eec83fd41e48b81c6da0ae544646170da1d20c933348`.
- Targeted run record:
  `/private/tmp/gtc-v4-613-success-Iy7dqN/candidate-test-run.json`;
  SHA-256 `af2c262100057033840007e1082c5e6505bd66432eaa04841c5e2fe7272241e9`.
- Result: 11/11 installed/golden journey tests and 145 independent harness
  assertions passed.
- A fresh durable run converged from three questions to two after the IP-only
  answer; a blank turn committed no revision. It produced
  `finished/delivered_cases` with seven unique Cases and seven unique primary
  Test Points.
- One current manifest bound exactly one canonical JSON, business Markdown and
  execution worksheet CSV. Digests and Case membership agreed across all three.
- An applicable zero-Case sibling returned
  `fatal/quality_failure/APPLICABLE_PRIMARY_OUTCOME_WITHOUT_CASE`, produced no
  official artifact, and had no current manifest.
- No environment/account/resource question, manual fallback, execution plan or
  automatic E2E invocation occurred in the Case Document run.

### 2. Mandatory failure chain and protocol split

- Machine evidence:
  `/private/tmp/gtc-v4-613-failure-orXPgA/evidence.json`;
  SHA-256 `3678152dcdcfdbe3f040d063adc2c4012c8a993bfd4f788b0051ae43491091c5`.
- Transcript:
  `/private/tmp/gtc-v4-613-failure-orXPgA/transcript.jsonl`;
  SHA-256 `13f861293ad00b620414139be4bab07b0ae6a617604cb6601e5b467588a4c0de`.
- Full subset log:
  `/private/tmp/gtc-v4-613-failure-orXPgA/full-subset.log`;
  SHA-256 `f182692d26e84f7d8118e083fd94d5cb772105aaabd0717c49571ce4f129e11b`.
- Result: 22/22 installed failure/journey tests plus 19 independent release
  bundle assertions passed.
- Adapter modeling error remained `need_revision`; reservation crash recovery
  preserved the answered IP decision and the two unanswered roots; applicable
  zero Case was `fatal + quality_failure`; stray Markdown/XLSX was inert.
- Repair delivered seven canonical Cases. An all-DNE execution sibling produced
  `no_execution_selected`, `runner_ready=false`, and an empty projection.
  A resource-complete sibling produced a non-empty projection equal to
  Grounded + Execute + ready Case IDs.
- An independent CLI probe observed ordinary stage absence as
  `need_revision/STAGE_ARTIFACT_REQUIRED`. A real unknown signed source
  produced the full `need_artifact` branch with one request, resume ref,
  fixed actions, and no credential material.

### 3. Recovery, warning and source safety

- Report:
  `/private/tmp/gtc-v4-613-recovery-PlX8OD/report.json`;
  SHA-256 `9ea5ed02dd971f6ad16ebf76e2b1a863b512fcdacdf5b75ca6def4e9a0a969c1`.
- TAP:
  `/private/tmp/gtc-v4-613-recovery-PlX8OD/targeted.tap`;
  SHA-256 `0a9af296ed845dc85ea13c92cbd2e71f70a9d031b7ecf33b52b5262adfc15993`.
- Result: 36/36 passed.
- The run preserved 3 -> 2 -> 1 question conservation, blank no-write,
  explicit defer versus close, and recoverable stale answers with public
  warnings `[]`.
- `FINAL_AUTHORITY_NOT_GRANTED` was ordered by the complete three-key tuple,
  replayed deterministically for its owning append, and not resurrected later.
- Full source acquisition replies, stage `need_revision`, reservation crash,
  higher non-ready/current safety and signed-query-only semantic/Fact/Case/body
  stability all passed.

## Frozen artifact digests

| Artifact | SHA-256 |
|---|---|
| `src/advance-strict.mjs` | `a1110633d8ab23da3b5ac971b31aee7dbf112b5d7d4a7cb607fd81639b31a4cf` |
| `src/advance-v4.mjs` | `a96d1872bacc2e6d3eb5181ecd49e079673dc700639fce2d58a3739bd59cab9c` |
| `src/non-blocking-diagnostics-v4.mjs` | `2b6ee6f28b7e77f4c59e7468bec6a2e00e8f2bdad828bd2d43cbbb5c6a816ebc` |
| `skill/generate-test-cases/SKILL.md` | `866193adab7839c91f922ce8d535a214878caba511a834977950cb1e1d25a6b9` |
| `skill/generate-test-cases/scripts/schema-manifest.json` | `08e04fc6f3c8c070ecdad5e32c2ac7d0f216ed5c960cd661878a0ea732dba9ed` |
| `skill/generate-test-cases/scripts/schemas/reply.schema.json` | `d45887a08b08cf84e30888d2295ea2ab86103e679206e53c304f3427456074b2` |
| `skill/generate-test-cases/scripts/test-compiler.mjs` | `496942eccb7b81fbc2e8d07f42693043ed430daa663921f5d468692092472556` |

The manifest binds compiler `0.5.0`, schema `4.0.0`, and schema-set digest
`8c0fb68b1326ded7ef01b9e1e29a690b417b31a85521b6080ab4bdaeec6f9107`.

## Closure

Tasks T01-T15, BR-01-BR-19, the traceability matrix, and the v4 Definition of
Done are satisfied for verified code candidate
`613d59a75a20c0bd521a3944d8c5ef128f2aeb0b`. The Skill produces canonical
manual functional Case Documents and, only after explicit downstream intent,
an execution plan/runner Case-ID projection. It never runs E2E tests.

No global Skill installation, npm publication, comparator/expert benchmark
claim, or RC tag is part of this closure.
