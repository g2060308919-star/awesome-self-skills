# Acceptance record under the user-approved same-session protocol

Overall status: `implementation_candidate_reviewed`.

This means the implementation candidate has deterministic program evidence plus an oracle-aware same-task review matrix. It不构成独立冷上下文证据；没有逐行原始模型 transcript，且任务未暴露精确 deployment ID/reasoning effort。Accordingly the same-session rows are marked `same_session_reviewed`, not release acceptance, and the original `../v1/acceptance-record.md` remains `not_run` for the stronger protocol.

| Acceptance | Status | Evidence |
| --- | --- | --- |
| A01 | same_session_reviewed | F01 business understanding states actor, same object, conditions, actions, and independently decidable results without adding a fifth artifact. |
| A02 | same_session_reviewed | Narrative, list/table structure and repeated F01 observations preserve the same required meanings; comparison is semantic, not title/count equality. |
| A03 | same_session_reviewed | Independent title validation, publish, visibility, withdrawal, ranges, mappings, and authorization results have precise inputs and Oracles. |
| A04 | same_session_reviewed | F01/F07 complete paths remain ordinary multi-step same-object Cases with one terminal primary result; unrelated results stay separate. |
| A05 | same_session_reviewed | Candidate adds supported create→publish and create→publish→withdraw paths while retaining single points and not increasing the formal denominator. |
| A06 | same_session_reviewed | F03/F06-MISSING/F08-MISSING ask only necessary business questions and retain known local facts. |
| A07 | same_session_reviewed | F02 preserves AND, OR/exception, separate denial causes, and the evidenced impossible draft+published combination without Cartesian expansion. |
| A08 | same_session_reviewed | F03 and F06-MISSING stop for necessary ambiguity; initial generation authority does not fabricate an answer, defer, or delivery. |
| A09 | same_session_reviewed | Two-phase clarification remains protected by deterministic tests; same-session review asks known gaps pre-case and does not manufacture a post-case question. |
| A10 | same_session_reviewed | F03 final/temporary/unknown/defer/delivery/partial/invalid observations preserve answer nature and current-item scope; partial answers only another independent batch item and leaves the entire time-boundary question pending; stale atomicity remains covered by program tests. |
| A11 | same_session_reviewed | General continuation does not grant new authority; request_delivery closes only the selected current item and does not bind future roots. |
| A12 | same_session_reviewed | F04 uses matching and nonmatching records and exact 10/20 mappings, detecting false positives without asserting unknown totals. |
| A13 | same_session_reviewed | F05 keeps A validation as an action, distinguishes pending/failed/passed, and uses logical rather than real execution data. |
| A14 | same_session_reviewed | F06 selects only needed surfaces, prepares transient capture before click, separates request/business result, and does not require accounts or invent protocol fields. |
| A15 | same_session_reviewed | Actual image inspection, both comment pages, parent/reply context, terminal page, adopted/rejected suggestions, offline scope, and unreadable attachment state are retained. |
| A16 | same_session_reviewed | F08 separates exact rule, replaceable example, legal 80.00 derivation, overview, and missing-rule clarification. |
| A17 | program_pass | Recovery and partial-answer tests retain committed answers, pending items, and reject staging-only acceptance. |
| A18 | program_pass | Repair/new-run/cancel/superseding-revision tests preserve current authority and prevent old ready output from resurfacing. |
| A19 | program_pass | Current Table/HTML presentation tests cover every Case, full setup/steps/step-bound Oracles, escaping, no default internal IDs, and JSON projection consistency. |
| A20 | program_pass | All four delivery result kinds and failed generation have exact titles, counts, limitations, and no hand-written fallback. |
| A21 | program_pass | Frozen old 4.2 bytes replay; current family is used for new output; mixed family and damaged summary are rejected. |
| A22 | program_pass | Main regression, repeatability, build, benchmark, Skill-copy identity, and unchanged E2E Runner checks passed. |
| A23 | same_session_reviewed | `a23-review.md` rejects four isolated defect classes with exact impact/repair and accepts the valid same-object control. |
| A24 | same_session_reviewed | `matrix.md` retains 52 baseline/candidate observations, all failures, every F03 answer/control variant, and three repetitions for F01/F04/F07; no raw row transcript or independent-context claim is made. |

## Verification commands retained

- `npm run check`: 1472/1472 main tests and 2/2 repeatability tests passed after the review fixes; 100 fresh installed-shape runs were byte-identical.
- `npm run test:benchmark`: 158/158 passed after the same-session evidence corrections.
- `node --test test/benchmark/v4-quality-corpus.test.mjs`: 6/6 passed after A23 corpus completion.
- B2B E2E Runner regression: 51/51 passed earlier; `git diff --name-only -- b2b-e2e-runner` remains empty.
- Build identity, `git diff --check`, and source-template/repository-copy byte comparison passed.

## Scope guard

No global Skill was installed or overwritten. The evaluated implementation is bound to commit `6f42f19f59d3d3bdb619041af2ccb80bd902fd9d`; later evidence-only review fixes do not change that runtime-tree digest. No target system was executed and no historical run was modified.

The in-app browser rejected the local `file://` report under its URL security policy. No bypass was attempted. HTML structure/content is covered by the retained test, but an actual browser screenshot and console capture were not produced.
