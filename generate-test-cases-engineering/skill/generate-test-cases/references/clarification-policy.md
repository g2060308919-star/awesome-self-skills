# Clarification Policy

Read this policy before presenting any semantic question or submitting `answer_question_part`, `defer_question_part`, `mark_question_unknown`, or `request_delivery`. Copy the compiler-provided presentation, question-part, root-version, run, revision, and recovery bindings exactly. Never mint or infer protocol IDs from wording.

## Clarify at two semantic boundaries

For a v4 Case Document, run pre-case semantic-gap discovery only after complete source review, an atomic fact ledger, and a complete scope manifest, and before Behavior Views or Case Drafts. It closes only source-backed semantic gaps that must be decided before modeling.

The post-case (`case_design`) clarification happens after Case design. Merge only genuinely new roots with old roots that are still pending; never repeat resolved roots or execution-preparation gaps. Do not move known pre-case gaps into this later phase. Both `requirements_analysis` and `case_design` contain only `semantic_gap` questions. Environment URLs, accounts, data availability, query tools, observers, controls, and cleanup access are execution resources, not Case Document questions.

前置澄清发生在用例设计前，后置澄清发生在用例设计后；两者都是业务语义边界，不能被 preview、commit 或执行准备替代。

At either phase, merge all current fresh answerable roots into one risk-ordered presentation. Do not ask per Case and do not impose a fixed total round count. Non-answerable source, evidence, or process gaps retain their compiler status and recovery guidance; they never become business questions.

An initial request such as “generate the Cases”, or a general “continue” when no current choice has been presented, grants no authority to answer, defer, mark unknown, or request delivery for a semantic gap. A short “agree/continue” may bind only when the validated presentation exposes one unique current choice and the conversational target is unambiguous. Do not add a routine second confirmation once that binding is reliable.

Clarify when an unresolved choice can change the business对象、条件、角色、状态、顺序、输入范围、文案或结果 and accepted evidence or a permitted derivation cannot decide it. Cite the original source location, name the concrete ambiguity and affected items, state what decision is needed, and state the consequence of no answer. Do not ask again when the source already says it. A generic risk alone is not a business question, but an actual in-scope field, action, role, or lifecycle scene may expose a missing rule or a clearly labelled recommendation that requires a decision. Never convert acquisition or schema failure into a business Decision.

## Discover and present relevant uncertainty by default

Before asking, search the complete accepted source set, applicable project/component standards, and valid current Decisions. For actual scoped behavior, check the relevant branches: field initial/refill behavior; duplicate or pending submit and failure/retry; unsaved close/back; stale or mismatched asynchronous results; and authorized/unauthorized outcomes. When a field is declared numeric or integer-only but also says it supports “unlimited” or an equivalent label alongside concrete values, treat that wording as unresolved until the source decides between an independent selectable/literal mode and “numeric values have no business maximum”. Ask one scoped business-meaning question—not merely how the widget renders it—and preserve required/default/range/nonempty sibling rules. Do not ask about operations or states that are absent from the scoped material.

Ask only when the answer changes product acceptance, a required condition, or an observable business result. Do not turn input syntax, widget mechanics, selectors, concrete test accounts/data, endpoint details, observer access, clock control, or other execution preparation into business questions when the sourced result is already decidable with an implementation-neutral logical action or relative value. Missing execution resources remain downstream preparation, not semantic gaps.

Require clarification only when no source-backed representative can exercise a required branch without deciding the ambiguity. If the material already supplies a representative that isolates the rule, use it and leave unrequired representations outside formal scope or clearly `Exploratory`. For example, do not ask for a multi-value delimiter when the Case can state two logical IDs, a hidden-versus-disabled choice when “cannot set” is already observable, Unicode counting when an explicit ASCII boundary representative is supplied, or combined-invalid precedence when each rule can be isolated.

When the source establishes a real field or action and acceptance requires its initial, pending, failure, retry, or permission outcome, a missing outcome is a semantic-gap question, not a generic `Exploratory` risk. Reserve `Exploratory` for an optional investigation that does not substitute for an unknown required result. Keep implementation choices such as debounce duration, button-disable technique, idempotency mechanism, or transport retry strategy outside the business answer unless the user explicitly makes them requirements.

Classify each discovered item as confirmed product truth, a required unknown, or a candidate recommendation. Present all currently relevant items without a fixed count. Each question names the concrete scenario and independently answerable dimension, explains the acceptance impact, and—when offering a recommendation—states the recommendation, reason, and alternatives. Batch the complete current set in dependency order; do not fabricate a downstream binding before an upstream choice is known.

Converge without erasing uncertainty: preserve accepted answers, keep explicit unknown/defer states visible, and do not repeat resolved parts. A partial reply changes only its reliably bound target. “Continue” is not adoption, and rejection of a recommendation rejects only that suggestion unless the user also supplies a replacement rule. Never infer a global confirmation from a local answer.

When the user explicitly adopts a recommendation, use `constructV4Action` only if the latest validated compiler presentation contains the exact current semantic-gap question and action binding for that recommendation and scope. If no such binding exists, do not attach the answer to a similar root or forge an event. Treat the explicitly scoped adopted rule as newly authoritative user input and use the existing source-change/new-run path; if the public interface cannot express that path, stop the affected item and report the compatibility limitation without weakening the rule or silently restarting.

For schema `4.3.0` or `4.3.1`, every in-scope semantic gap also carries the exact closed
`acceptance_impact` shape from `evidence-claims.schema.json`. Classify it
`critical` only when an answer changes core acceptance, a required branch, or
makes a required result undecidable; cite one or more corresponding criteria.
Classify it `noncritical` only with
`does_not_change_required_acceptance`. Priority, probability, generic risk,
missing execution resources, or the number of affected Cases does not decide
criticality. If impact cannot yet be classified, fail closed and complete the
analysis rather than defaulting it to noncritical.

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
- A local answer applies only to the named proposition and scope; unchanged sibling requirements remain effective.
- Every unanswered item remains presented and pending; it is not deferred or suppressed by omission. It reappears in the successor presentation.
- Blank or unparseable text, or text that cannot be reliably bound, writes no Decision or control and changes neither root state nor revision.
- `no_information_gain` returns the same pending set without suppressing any root and without committing a revision.

Only explicit controls change an unanswered part:

- `defer_question_part` -> `deferred_by_user`;
- `mark_question_unknown` -> `unknown_by_user`;
- `request_delivery` -> `closed_for_delivery`, only for its explicit question-part refs.

Unknown, skip, or defer remains a visible semantic gap in the Case Document. It is not NotApplicable and does not create an execution disposition. Never automatically defer omitted parts and never treat a partial reply as an answer to the entire presentation.

After an accepted answer or control, recompile and review every affected Fact, view, formal Test Point, Case, shared gap, coverage count, and rendered limitation. Confirm that unchanged sibling propositions and every unanswered part retain their prior evidence and pending routes. The answer is effective only when the compiler accepts the append; writing staging bytes or acknowledging the chat message is not adoption. A later root version or newly discovered question never inherits an older answer or delivery choice.

## Construct only advertised events

An `answer_question_part` binds the latest presentation ID, question part ID, root issue ID, root version digest, answer, and `final` or `temporary` nature. `defer_question_part` and `mark_question_unknown` bind the same latest refs. `request_delivery` closes only explicit presentation-bound question-part refs. A request to deliver every current gap carries the complete pending-root set; it never pre-closes a future root discovered by recompilation.

Show `why_needed`, `decision_impact`, `unresolved_outcome`, action labels, and `recovery` instructions. Keep exact `available_actions` and `action_context` from the validated presentation as hidden submission bindings. A stale presentation, stale root version, missing context field, or cross-part target writes no event. When a late answer reaches the runner after its root was resolved, closed, changed, or made ambiguous, keep it as an internal stale transition and present the current committed state; never report compiler fatal or create a revision for that answer. Candidate changes remain in staging until the compiler commits the entire append; a rejected group creates no accepted revision or checkpoint.

When the user asks for delivery, do not fabricate answers or delete gaps. Submit `request_delivery` for only the explicitly selected current parts. The compiler determines `blocked_only` or `delivered_with_gaps`; those results preserve closed roots and formal coverage accounting.

In 4.3 a critical root has no delivery-bypass action. It is finally resolved
only by a scope-valid final E3 Decision, a legal replayable E2 derivation, or an
evidence-backed non-applicability/obsolescence basis. Temporary E1 input,
`defer_question_part`, `mark_question_unknown`, `request_delivery`, ordinary
confirmation, `resolved_temporary`, or an old ready manifest cannot clear it.
Defer/unknown must still leave a current recoverable question. Noncritical
Conditional delivery remains available under its existing rules.

## Reopen without mutating history

During execution closure, `reopen_semantic_question` is the only route back to business clarification. It supersedes the current execution run and creates a sibling Case Document run bound to the immutable parent `case_document_ref`, semantic root/version refs, `parent_execution_run_id`, and `creation_reason=reopen_semantic_question`. It never edits the execution run or reactivates suspended old Decisions.

After the sibling recompiles, present every fresh root it returns. A new answer must bind the reopened root version. The old Decision remains auditable as suspended; it cannot silently regain effect. After a new Case Document is delivered, a future execution plan must be a new run referencing that new immutable manifest.

For legacy v3 input, migration is read-only. A v3 part that was automatically `suppressed_deferred` only because it was omitted becomes pending in the v4 sibling; an explicitly deferred part stays deferred. v3 is never used as a live v4 fallback.
