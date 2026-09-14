# Clarification Policy

Read this policy before presenting any semantic question or submitting `answer_question_part`, `defer_question_part`, `mark_question_unknown`, or `request_delivery`. Copy the compiler-provided presentation, question-part, root-version, run, revision, and recovery bindings exactly. Never mint or infer protocol IDs from wording.

## Clarify at two semantic boundaries

For a v4 Case Document, run pre-case semantic-gap discovery only after complete source review, an atomic fact ledger, and a complete scope manifest, and before Behavior Views or Case Drafts. It closes only source-backed semantic gaps that must be decided before modeling.

The post-case (`case_design`) clarification happens after Case design. Merge only genuinely new roots with old roots that are still pending; never repeat resolved roots or execution-preparation gaps. Do not move known pre-case gaps into this later phase. Both `requirements_analysis` and `case_design` contain only `semantic_gap` questions. Environment URLs, accounts, data availability, query tools, observers, controls, and cleanup access are execution resources, not Case Document questions.

At either phase, merge all current fresh answerable roots into one risk-ordered presentation. Do not ask per Case and do not impose a fixed total round count. Non-answerable source, evidence, or process gaps retain their compiler status and recovery guidance; they never become business questions.

## Present business decisions, not protocol

For each question part show, in the frozen output language:

- one concrete `question` about one independently answerable business dimension;
- the business object and affected business items;
- `why_needed`;
- `decision_impact`;
- `unresolved_outcome`;
- answer options and available action names;
- named risk counts whose denominator is distinct affected formal Test Points.

Never show root, Fact, Claim, obligation, question-part, digest, or other internal ID in normal business content. Keep `root_issue_id`, `root_version_digest`, `question_part_id`, `presentation_id`, and `action_context` hidden for event construction. An explicit audit may display them separately.

Spell risk labels out (`严重/高/中/低` or localized equivalents) and state what was counted. Never show a bare tuple. Separate semantic-rule gaps, source/evidence acquisition gaps, scope exclusions, and execution preparation in the presentation without changing their true categories.

## Apply partial answers exactly

One user response is one atomic append group and creates one Source Pack revision only after compiler validation.

- A reliably bound final answer becomes an authorized task-scoped E3 Decision for its declared scope.
- A reliably bound temporary answer becomes an explicit temporary assumption at E1; dependent Cases are at most Conditional.
- An answer without a declared nature defaults to E1. Do not ask a nature-only follow-up.
- A valid answer changes only its target question part/root version.
- Every unanswered item remains presented and pending; it is not deferred or suppressed by omission. It reappears in the successor presentation.
- Blank or unparseable text, or text that cannot be reliably bound, writes no Decision or control and changes neither root state nor revision.
- `no_information_gain` returns the same pending set without suppressing any root and without committing a revision.

Only explicit controls change an unanswered part:

- `defer_question_part` -> `deferred_by_user`;
- `mark_question_unknown` -> `unknown_by_user`;
- `request_delivery` -> `closed_for_delivery`, only for its explicit question-part refs.

Unknown, skip, or defer remains a visible semantic gap in the Case Document. It is not NotApplicable and does not create an execution disposition. Never automatically defer omitted parts and never treat a partial reply as an answer to the entire presentation.

## Construct only advertised events

An `answer_question_part` binds the latest presentation ID, question part ID, root issue ID, root version digest, answer, and `final` or `temporary` nature. `defer_question_part` and `mark_question_unknown` bind the same latest refs. `request_delivery` closes only explicit presentation-bound question-part refs. A request to deliver every current gap carries the complete pending-root set; it never pre-closes a future root discovered by recompilation.

Show `why_needed`, `decision_impact`, `unresolved_outcome`, action labels, and `recovery` instructions. Keep exact `available_actions` and `action_context` from the validated presentation as hidden submission bindings. A stale presentation, stale root version, missing context field, or cross-part target writes no event. When a late answer reaches the runner after its root was resolved, closed, changed, or made ambiguous, keep it as an internal stale transition and present the current committed state; never report compiler fatal or create a revision for that answer. Candidate changes remain in staging until the compiler commits the entire append; a rejected group creates no accepted revision or checkpoint.

When the user asks for delivery, do not fabricate answers or delete gaps. Submit `request_delivery` for only the explicitly selected current parts. The compiler determines `blocked_only` or `delivered_with_gaps`; those results preserve closed roots and formal coverage accounting.

## Reopen without mutating history

During execution closure, `reopen_semantic_question` is the only route back to business clarification. It supersedes the current execution run and creates a sibling Case Document run bound to the immutable parent `case_document_ref`, semantic root/version refs, `parent_execution_run_id`, and `creation_reason=reopen_semantic_question`. It never edits the execution run or reactivates suspended old Decisions.

After the sibling recompiles, present every fresh root it returns. A new answer must bind the reopened root version. The old Decision remains auditable as suspended; it cannot silently regain effect. After a new Case Document is delivered, a future execution plan must be a new run referencing that new immutable manifest.

For legacy v3 input, migration is read-only. A v3 part that was automatically `suppressed_deferred` only because it was omitted becomes pending in the v4 sibling; an explicitly deferred part stays deferred. v3 is never used as a live v4 fallback.
