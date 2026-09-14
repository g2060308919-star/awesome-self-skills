# V4 incremental upgrade verification report

Status: implementation candidate under final verification. This report distinguishes deterministic implementation completion from release acceptance.

## Bound identities

- Qualified comparison base: `b9fad4c35acbd37c9531417fae136cd18f9e0afa`; target Skill trees were byte-equal to V4 reference commit `858fdd1de77ba31655ff57810fbf0ff8a47872c9` before changes.
- Normative contract: `GTC-V4-UPGRADE-SPEC`, package `GTC-V4-UPGRADE-20260914`, revision `1.0`, SHA-256 `9300be75c383be2824a814833323cf1a14bbad9a6e04f09de6e6ac4542663c86`.
- Supporting design: `GTC-V4-UPGRADE-DESIGN`, same package/revision, SHA-256 `d068923ef189b37dc5ae652281e0b1dceca70bd4a4e52b9fe3fbfec2e5f42703`.
- Runtime: Node `v24.18.0`, npm `11.16.0`, Darwin arm64.

## Implemented candidate

1. New Case Document runs use a closed 4.1/0.6 identity and immutable policy marker; existing 4.0/0.5 V4 runs retain their contract. Accepted V4 artifacts and official outputs remain 4.0/0.5 compatible. Execution Plan is excluded from semantic-answer preview.
2. The installed Adapter exports `prepareSemanticAnswerBatchV4` and `commitSemanticAnswerBatchV4`. Prepare binds exact presentation/question versions, Unicode scalar spans, adopted authority/nature, retained pending state and deterministic reanalysis scope without changing accepted business state. Commit supports apply/revise/cancel_preview, separate confirmation provenance, stale/content/integrity checks, receipts, audit and crash-idempotent recovery.
3. The real new-run acceptance path rejects naked semantic answers. Apply reconstructs the compiler-owned candidate and uses the existing revision transaction. Ordinary confirmation does not elevate authority; explicit confirmation changes to value/scope/nature require a new preview.
4. A Decision answer now enters effective evidence only through a source-Claim-owned `decision_answer_projection`; missing, cross-Fact, malformed or conflicting projections fail closed. No generic outcome/condition/expected fact is fabricated.
5. V4 business clarification, E1/E2/E3, partial answers, two clarification phases, seven sparse views, cancellation, semantic reopen, Execution Plan and canonical delivery are retained. Policies now explicitly protect atomic branches, literal manual Oracles, identity/display distinctions, finite required values, logical populations and separate permission outcomes.
6. Independent F-CITY truth is projected from actual candidate JSON/Markdown/CSV. It checks 21 Cases, six score instances, eight column branches, source 23/24, administrator allow and ordinary-user deny. Legal-shape missing-value, permission-substitution, wrong-subject and rendered-condition mutants fail.

## Development verification ledger

| Command/check | Actual result |
|---|---|
| baseline `npm run check` | exit 0; 1447 core/interface/recovery tests + 2 repeatability tests passed |
| baseline `npm run public-pilot` | exit 0; `pilot_ready`; 30 intake records admitted; `release_eligible=false`, `insufficient_evidence` |
| review-fix focused preview/version suite | 37/37 passed |
| affected legacy V4 and consumer suite | 82/82 passed after fixtures explicitly bound already-active runs to 4.0/0.5 |
| first full candidate `npm run check` | exit 1; 1471/1486 passed, 15 failed because test expectations still assumed 4.0/0.5 for new runs, the new exports/version were not in expectations, and the repository mirror was stale; production preview enforcement was not weakened |
| final `npm run check` | exit 0; tsc/build freshness passed; 1486/1486 core/golden/interface/recovery tests and 2/2 repeatability tests passed; includes 100 fresh installed-shape runs and three durable-directory repeats |
| `npm run test:benchmark` | exit 0; 145/145 benchmark contract/tool tests passed |
| `npm run public-pilot` | exit 0; `pilot_ready`, 30/30 admitted, `release_eligible=false`, `release_status=insufficient_evidence` |
| `npm run benchmark` | `PENDING_FINAL_CAPTURE` |
| engineering/repository Skill byte comparison | exit 0 from `diff -qr`; full-suite repository sync test also passed |
| `git diff --check` | exit 0 before final capture |

The initial candidate failure is retained as development evidence. Its legacy tests now seed an explicit 4.0/0.5 identity, proving compatibility without turning them into new-run bypasses. Separate installed-bundle tests prove 4.1/0.6 new-run enrollment and naked-answer rejection.

## T00-T07 status

| Task | Result |
|---|---|
| T00 | complete: paths, document pairing, V4 qualification, capability/problem dispositions and physical contracts bound |
| T01 | deterministic truth and failure-capable protocol complete; external cold-context portion frozen as unavailable, not retroactively claimed |
| T02 | complete: policy and existing compiler protections mapped and tested |
| T03 | complete: preview/commit interface, real acceptance gate, answer effect and recovery implemented |
| T04 | complete for deterministic implementation candidate: existing Oracle/mapping carriers protected and semantic mutants rejected |
| T05 | complete for deterministic implementation candidate: six values, logical population and permission outcomes projected from actual delivery |
| T06 | complete: evidence projection, official output, version, recovery and consumers checked |
| T07 | candidate build, deterministic suite, benchmark-tool suite and public-pilot validation complete; actual clean-tree single-system gate and content digest capture pending; cold-context paired evaluation unavailable |

Detailed R/P/C/AT evidence is in `acceptance-map.md`, `capability-map.md`, and `change-register.md`.

## G0-G8

| Gate | Current actual conclusion | Evidence / remaining condition |
|---|---|---|
| G0 | pass | qualified V4 source/tree, clean start, complete baseline check and known-failure boundary recorded |
| G1 | pass | C01-C16 separates reused capability, proven gap and new capability; each changed seam has positive/negative acceptance |
| G2 | pass | 1486 existing/new tests plus installed, Execution Plan, semantic reopen, cancellation and output consumers passed |
| G3 | pass for committed deterministic targets | answer-delivery and F-CITY actual-output tests prove the final semantic effects and legal-shape mutant rejection |
| G4 | insufficient evidence | one visible synthetic domain is deterministically checked, but independent per-domain facts/obligations/question-quality/false-status paired scoring was not supplied or run |
| G5 | pass | full-suite answer → preview → confirmation → Decision → evidence → Test Point/Case/output chain and stale/recovery checks passed |
| G6 | pass | canonical JSON/Markdown/CSV, terminal states, cancellation, reopen and crash recovery all passed |
| G7 | pending source identity | build freshness, installed entry, manifest/version and byte-identical publication copy passed; local source commit/digest capture pending |
| G8 | insufficient evidence | missing qualified 12-requirement corpus, hidden holdouts, independent truth/reviewer, frozen answer scripts/model/tool profile, and budget for 72 paired cold-context tasks |

## Semantic evaluation and cost boundary

- Deterministic F-CITY and legal-shape semantic mutants are real executed acceptance inputs, not copied expected-result claims.
- The retained 30-PRD public pilot is intake-only and explicitly ineligible as independent truth. F-CITY is visible during development and is not a hidden holdout.
- No cold-context generation tasks were executed for this upgrade, so paired question counts, elapsed time and token deltas are unavailable rather than zero. The implemented interaction contract adds at most one apply confirmation per prepared answer batch; this is an interface invariant, not a measured end-user cost result.
- The required external inputs and 72-task design are frozen in `evaluation-protocol.json`. Until supplied and run, G4/G8 cannot pass and the candidate cannot be described as release-accepted.

## Scope and safety

- No E2E Runner, CDP proxy, browser automation, installed user Skill, historical run, dependency lock, unrelated product code, remote branch or Git history is modified.
- This worktree is a local candidate only. It has not been installed, pushed, published or merged.
