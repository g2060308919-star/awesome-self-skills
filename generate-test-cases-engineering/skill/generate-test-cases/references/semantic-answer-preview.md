# Semantic Answer Preview

Read this policy before preparing or committing any semantic answer/control batch. The preview is compiler-owned transaction state inside V4; it is not a fifth Agent-authored artifact and it is not an alternative clarification engine.

## Preserve both business clarification phases

The pre-case clarification still discovers and resolves source-backed business questions before Behavior Views and Cases. The post-case clarification still handles only genuinely new gaps found by Case design. The preview/commit pair protects a response inside either phase; it does not replace pre-case or post-case clarification, create questions, or turn one phase into the other.

## Prepare one reliably bound batch

For a new Case Document run enrolled by `derived/semantic-answer-policy.json`, call the installed Adapter's `prepareSemanticAnswerBatchV4(<run-directory>, request)` for `answer_question_part`, `defer_question_part`, `mark_question_unknown`, and `request_delivery`. Use the current `presentation_id`, the complete normalized `user_message`, and at most one action per named `question_part_id`. Every answer request repeats the exact outer `user_message`; when answer text occurs more than once, provide its exact Unicode-scalar `answer_start_scalar` rather than guessing.

Omit unmentioned parts. They remain pending. Do not translate omission, blank text, ambiguity, or a parse failure into defer, unknown, delivery, or an answer. A mixed batch with any invalid or stale target is rejected as a whole.

Prepare persists a digest-bound preview and candidate in compiler-owned sidecars. The accepted revision, Decisions, Facts, model, Cases, checkpoint, and official output remain unchanged by prepare. Present the returned value in business language, including:

- the answer or explicit control adopted for each question;
- its business scope and adopted temporary/final nature;
- determinate changes already known;
- areas that will be reanalysed after apply; and
- pending, deferred, unknown, and delivery-closed items that remain.

Do not promise future Case IDs or counts when pre-case analysis has not created them. A normal user statement is temporary E1 even if its request says `final`. Only an answer whose original message really grants the named rule and scope final authority may use `authorized_confirmation` and retain E3. Confirming the preview does not raise authority.

## Require a separate decision

After showing the exact prepared preview, obtain one real user decision for that batch. Call `commitSemanticAnswerBatchV4` with its `preview_id`, the user's separate nonblank `confirmation_message`, and exactly one of:

- `apply`: append the exact prepared answer/control events once and re-run the existing Decision-to-output pipeline;
- `revise`: retain accepted business state and obtain changed content through a new prepare; or
- `cancel_preview`: abandon only this preview without changing accepted business state.

The `confirmation_message` is stored separately from the original `user_message`; it cannot change answer content, scope, resolution, or authority. Any such change requires a new preview. `cancel_run` is deliberately outside this batch and continues through the original advertised action Adapter; once the run is cancelled, an earlier preview cannot be applied.

One prepared batch requires at most one application confirmation. An exact replay returns the current runner result and never appends a second revision. A changed confirmation, changed content, stale presentation/revision, superseded preview, invalid digest, or partial target mismatch is rejected without a new accepted business revision.

## Recover from compiler-owned records

On retry or context recovery, invoke the runner on the same run directory first. Then call commit again only with the exact previously submitted `preview_id`, decision, and confirmation message. The compiler validates the immutable stored request/candidate, active pointer, apply receipt, accepted revision, and audit entries; it completes an interrupted apply at most once.

New Case Document runs and their compiler-created Case Document siblings are enrolled in `semantic-answer-preview/v1`. Legacy V4 runs without the marker remain compatible and unchanged; they are never silently migrated. Execution-plan runs are excluded and do not use semantic-answer preview. Execution actions, source acquisition, cancellation, read-only consumption, and historical accepted bytes retain their existing contracts.
