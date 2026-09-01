# Clarification Policy

Clarify only after the complete A–G analysis. Merge current fresh answerable root issues into one risk-ordered set; do not ask per Case or impose a fixed total round count.

## Present one convergent set

For each returned root issue show the missing rule or capability, scope, affected critical/high/medium/low counts, and a short answer form. Ask every current fresh root in the returned reply. Technical or environmental blockers that a user answer cannot resolve remain Blocked without becoming business questions.

Offer these answer natures:

- authorized final rule for the current declared scope;
- explicit temporary assumption;
- unknown, skip, or defer;
- answer text without a declared nature.

## Interpret answers exactly

- An authorized final rule with explicit authority scope becomes task-scoped E3.
- An explicit temporary assumption becomes E1 and may support only Conditional Cases.
- Unknown, skip, or defer remains Blocked and suppressed; use the matching unknown or deferred disposition.
- An answer without declared nature defaults to E1. Do not ask a nature-only follow-up question.
- Every unanswered item in the current set becomes deferred, stays Blocked, and is suppressed.

Create Decision Records from business answers. Preserve question and root IDs, affected obligation IDs, confirmer, time, answer, disposition, authority/effective scope, evidence reference and level. Decision Records are append-only and apply only to their declared scope.

Use one monotonically increasing clarification event sequence across decisions and controls. Apply one user response as one append group and create exactly one new Source Pack revision.

## Deliver now without fabricating answers

When the user requests immediate delivery, append `request_delivery` with the complete pending-root set from the current `need_user_answers` reply. Submit it as a new Source Pack revision. Do not encode delivery as a business answer.

The compiler defers the current pending set and any new roots revealed while recompiling the same answer group. Deliver the finished executable subset and retain unresolved formal Test Points as Blocked. Never infer defaults, delete blockers, or hand-edit final files.

## Reopen suppressed issues

When the user explicitly reopens issues, append `reopen_root_issues` with only the selected suppressed IDs and submit a new Source Pack revision. Do not fabricate a business answer.

After recompilation, present every fresh issue returned by the compiler, including issues newly revealed outside the selected subset. Reopening controls which suppressed roots return to open; it does not limit the next fresh-root calculation.

## Converge without arbitrary round limits

Continue only while new information reveals fresh answerable roots. Stop when no fresh roots remain, the user requests delivery, or the answer group has no information gain. Unknown, deferred, and unanswered roots are not automatically asked again; only an explicit reopen changes that state.

If every formal Oracle remains unknown, a valid result can contain zero Grounded/Conditional Cases and a complete Blocked ledger. That is an evidence outcome, not a pipeline error.
