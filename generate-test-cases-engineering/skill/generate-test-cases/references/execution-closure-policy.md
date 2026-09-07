# Execution Closure Policy

Read this policy before writing or interpreting execution decisions, pause/resume events, final confirmation, runner projection, or post-ready changes. The compiler owns the inventory, presentation IDs, digests, event order, confirmation, checkpoint, and final files. The Agent copies returned identities; it never computes them.

## Keep semantic truth separate from execution disposition

For ordinary case-document generation, Source Pack selects `delivery_intent=case_document`. There is no execution-confirmation prerequisite: the compiler can deliver `document_only` while preserving pending decisions, null confirmation and empty `runner_case_ids`. It writes a document-only current pointer, never a ready execution pointer. The rules below about pending/confirmation blocking finish apply to explicitly requested `execution_plan` delivery, not to document generation.

Every active decision object has one unchanged semantic status and one execution disposition:

- A Grounded Case may be Execute or DoNotExecute. It defaults to Execute only in execution-plan delivery; document-only delivery defaults to pending.
- A Conditional Case cannot Execute; it remains pending until explicitly DoNotExecute or until a final business rule makes a regenerated Case Grounded.
- A case-less Blocked formal Test Point cannot Execute. DoNotExecute leaves it Blocked and in the applicable denominator.
- A reliable NotApplicable formal Test Point is compiler-derived DoNotExecute. No user execution event or ordinary reason may manufacture NotApplicable.
- An Exploratory suggestion cannot Execute. DoNotExecute leaves it Exploratory and outside the formal denominator; adoption is a separate version-bound business decision followed by full recompilation.

Case is the atomic execution unit. Never split a Case into partially executable steps or create a partial execution status. Conditional, Blocked, NotApplicable, and Exploratory items cannot Execute. Only IDs mechanically projected from all Grounded + Execute Case items may appear in `runner_case_ids`.

## Process the exact displayed plan

For `purpose=execution_closure`, show the returned groups and readable item titles. Copy the current presentation ID, group IDs, item digest/change head, run identity/digest, plan digest, and `next_event_seq` into one append-only `set_dispositions` event. An answered item receives one returned option. Unanswered items remain pending; do not auto-pause them when the same reply contained valid decisions.

DoNotExecute requires a matching reason code and a nonempty explanation. Use `scope_excluded_for_run` when the user says to run only the currently selected Cases; use `temporary_rule_unconfirmed`, `business_rule_missing`, `authority_missing`, `capability_unavailable`, `risk_not_adopted`, `user_deferred`, or `other_explicit` only when it states the actual reason. Execution decisions are not evidence and cannot change status, Oracle, evidence level, support review, or Testability.

When all items are non-pending, the compiler returns `purpose=final_confirmation`. Show that complete plan, including every disposition and DoNotExecute reason. Append `confirm_execution_plan` in its own revision only when the user confirms the exact latest prompt, source revision, plan digest, and plan-change head. Modifying a choice on this page is a new disposition event followed by a new final confirmation; never modify and confirm in one batch.

Pending, pause, missing confirmation, stale confirmation, or a later plan-changing event cannot finish. A legal pause binds the current presentation and pending item refs, records `resume_target`, and leaves the current pointer stale. Resume requires a new `resume_execution_closure` event that names the one unmatched pause. Re-invoke the runner before continuing a recovered run.

## Preserve append-only history

Decision Records, clarification controls, and execution events share the exact globally continuous `clarification_event_seq` returned by the compiler. One user response is one atomic append batch and raises `source_revision` once. If any record or target is invalid, write none of the batch. A later valid decision may supersede the current disposition, but old records remain.

Bind all records to the latest presentation/group and item version. Old presentations, group membership, item digests, change heads, run IDs, run digests, and event numbers are invalid. Content returning A → B → A does not revive an earlier choice or confirmation because the change head remains newer.

## Handle ready-state changes through private preview

`finished` does not expose an editable working shape. When `runner_ready=true` and the user later requests a rule supplement, issue reopen, locator reanalysis, or disposition change, write only `staging/post-ready-preview-request.json` using the latest `preview_control.expected_preview_epoch` and `next_request_instance_id`. Bind the current ready revision, bundle, plan, confirmation digest, and candidate item versions. Copy the user's proposed content verbatim. A document-only result has null preview control; use the run-management repair/revision rules instead, never fabricate a ready binding.

An open or replace request creates a minimal `entry_context=post_ready_change` presentation. It does not add evidence, raise the revision, stale current, or invalidate confirmation. A replace must name the active presentation and makes that presentation unusable. A cancel only closes the active preview and leaves the ready result unchanged. Open, replace, cancel, or apply advances the compiler-owned `preview_epoch`; an older request cannot revive afterward. Starting the same change after cancel requires the newly issued ID and epoch.

Validated preview requests are retained in a compiler-private, append-only history under the corresponding derived revision. On recovery the compiler replays these closed requests against that revision's verified ready result; a disposable checkpoint cannot resurrect a replaced/cancelled request or erase an applied preview binding. The Agent never writes or repairs this history. Re-invoke the runner to resume the same active preview.

Only confirmation of the latest preview may append the corresponding Decision Record, `reopen_root_issues`, `request_reanalysis`, or execution event. That accepted source revision immediately stales current and recompiles. A source-content or material-scope change is not a preview edit and requires `NEW_RUN_REQUIRED`.

## Finish and hand off

The compiler alone writes `test-bundle.json`, derives `test-cases.md` from that result, writes a finished checkpoint, and atomically switches `output/current.json` to ready for a confirmed execution plan, or document_only for a delivered document. A non-ready execution-plan revision writes neither final file nor a ready pointer. Pending or stale execution confirmation never gains runner eligibility through document delivery.

On `finished`, report separate Execute Case, DoNotExecute Case, DoNotExecute formal Test Point, and DoNotExecute Exploratory counts plus the real Markdown and JSON paths. If `runner_case_ids` is empty, say why without claiming complete requirement coverage. This Skill confirms a plan only. It does not automatically execute E2E tests or call a downstream runner.

The generated Markdown is business-first in the frozen `output_language`. Each Case appears once. Its compact audit index maps display IDs to stable Case IDs, Test Points and evidence; full typed data and ledgers remain in normative JSON. The `Manual Execution Worksheet` (or `人工执行记录表`) is blank and contains exactly confirmed IDs from `runner_case_ids`. Result starts as `Not recorded`/`未记录`; Defect and Notes are empty placeholders. Bind later records with the bundle digest plus stable Case ID.

Execution results, actual observations, screenshots, logs, and defect records belong to a downstream E2E or test-management system. Bind each downstream record to the delivered bundle digest plus the stable Case ID from the Audit Appendix. Never write execution results or defects back into the canonical JSON, generated Markdown, Source Pack, Evidence Claims, Behavior Views, or Case Drafts; a newly discovered authoritative business rule instead starts the normal source-revision or new-run flow.
