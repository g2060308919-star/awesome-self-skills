# Clarification Policy

Clarify only after the complete A–G analysis. Merge current fresh answerable root issues into one risk-ordered set; do not ask per Case or impose a fixed total round count.

Read `references/clarification-policy.md` before writing any higher Source Pack revision. On context recovery, resume the same canonical absolute run directory, re-invoke the runner first, and never guess the stage from chat history or files. Clarification, delivery, reopen, and unresolved-business-fact supplements append to that same run.

If the original PRD, any supplementary source, or the material task scope changes, return `NEW_RUN_REQUIRED` and preserve the old run. Create or select a sibling private run only for that actual user source or scope change. A path spelling containing `..` that resolves to the frozen directory is the same run, not a sibling.

Only an answerable, open/fresh, and unsuppressed compiler root is eligible for a question. Non-answerable compiler-owned gaps remain Blocked with their recovery guidance and never become questions. Copy terminal-fact, interaction, and case-blocker root IDs exactly from the runner reply into a Decision or `reopen_root_issues` event. Never recompute, infer, or mint those IDs from wording, evidence, risk, or affected Test Points.

## Present one convergent set

The runner's IDs are protocol bindings, not user language. Never show `root_issue_id`, `question_id`, obligation IDs, Fact IDs, Claim IDs, digests, or raw enum codes in a normal clarification. Retain them privately and copy them unchanged into the next artifact. Show them only when the user explicitly requests an audit or when reporting a protocol failure.

For each returned root issue show a numbered business title, the concrete missing rule or capability in the source's product language, its scope, why it is being asked, and what remains blocked without an answer. Spell risk counts out as `Critical: N, High: N, Medium: N, Low: N`; never present an unlabeled tuple such as `0/10/2/0`. End with a short answer form. Ask every current fresh root in the returned reply. Technical or environmental blockers that a user answer cannot resolve remain Blocked without becoming business questions.

One displayed question must request one independently answerable business decision. If a compiler root describes several independent decisions, preserve the root binding but present separate clearly labeled subquestions and require an answer for each before creating one Decision Record. Do not compress role, state, timing, interface, and exception decisions into one vague paragraph.

Separate the presentation into business-rule gaps, execution-preparation gaps, scope exclusions, and source or evidence gaps. These headings are display-only; they never change the compiler's true classification. Use direct prompts such as “退款失败后订单应处于什么状态？” instead of asking the user to define an abstract “observation capability” when the missing material can be named concretely.

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

Keep the candidate revision in staging until the compiler validates the complete append against the prior clarification lifecycle. A rejected Decision, delivery, or reopen event must remain correctable at the same staged revision and must not create an accepted revision or advance the checkpoint.

## Deliver now without fabricating answers

When the user requests immediate delivery, append `request_delivery` with the complete pending-root set from the current `need_user_answers` reply. Submit it as a new Source Pack revision. Do not encode delivery as a business answer.

The compiler defers the current pending set and any new roots revealed while recompiling the same answer group, then enters execution closure. It does not finish or become runner-ready. Retain unresolved formal Test Points as Blocked and pending until the user explicitly chooses DoNotExecute or later supplies enough business truth to regenerate them. Never infer defaults, delete blockers, or hand-edit final files.

## Reopen suppressed issues

When the user explicitly reopens issues, append `reopen_root_issues` with only the selected suppressed IDs and submit a new Source Pack revision. Do not fabricate a business answer.

After recompilation, present every fresh issue returned by the compiler, including issues newly revealed outside the selected subset. Reopening controls which suppressed roots return to open; it does not limit the next fresh-root calculation.

## Converge without arbitrary round limits

Continue only while new information reveals fresh answerable roots. Stop when no fresh roots remain, the user requests delivery, or the answer group has no information gain. Unknown, deferred, and unanswered roots are not automatically asked again; only an explicit reopen changes that state.

Suppression affects business questioning only; it does not select an execution disposition. “Only execute the currently available Cases” must become explicit per-item decisions for every non-NotApplicable exclusion, normally using `scope_excluded_for_run`, followed by display and confirmation of the complete plan. A reply with some valid answers leaves omitted items pending rather than silently deciding or pausing them. An entirely non-informative or explicit stop response uses a presentation-bound pause event.

A `request_reanalysis` is a non-evidence control. It may cite only existing source locators and current displayed item versions, adds no business outcome, and invalidates the affected downstream artifacts for recompilation. Original source text or material scope changes require a new run instead.

If every formal Oracle remains unknown, a valid result can contain zero Grounded/Conditional Cases and a complete Blocked ledger. That is an evidence outcome, not a pipeline error.
