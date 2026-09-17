# Execution Closure Policy

Read this policy before presenting an execution decision or submitting `provide_capability_proof`, `set_execution_disposition`, `pause_execution`, or `reopen_semantic_question`. Execution closure exists only after the user explicitly asks for an execution plan.

## Keep the Case Document immutable

A Case Document records semantic truth. Its generation does not check current environment URLs, accounts, test-data availability, observer/control access, cleanup access, or other real execution resources. It contains no execution disposition, execution readiness, capability proof, or runner projection.

An Execution Plan is a separate downstream run with an immutable `case_document_ref`. That reference binds the Case Document run/revision plus exact `manifest_digest` and `bundle_digest`. Never copy or reinterpret the Case Document into the execution run. A stale, mutable, or digest-mismatched ref is invalid.

Execution capability evidence affects readiness only. It is not product evidence, cannot alter Case status or Oracle, cannot create NotApplicable, and cannot upgrade Conditional or Blocked to Grounded.

## Decide every active execution item

Each decision object has exactly one current disposition: Execute, DoNotExecute, or Pending.

- A Grounded Case may be Execute or DoNotExecute.
- Conditional, Blocked, NotApplicable, and Exploratory items cannot Execute.
- DoNotExecute leaves the original semantic status unchanged; it never manufactures NotApplicable.
- Pending means undecided, not excluded.
- A Case is the atomic execution unit. Never select only some steps.

Only Grounded + Execute Cases whose execution capabilities are ready may enter `runner_projection.case_ids`. The compiler derives the projection; the Agent never authors it. `execution_ready` requires a nonempty projection and validated final confirmation. If every Case is explicitly DoNotExecute, result kind is `no_execution_selected`, `runner_ready=false`, and the immutable Case Document remains valid.

## Use the closed action registry

Advertise and submit only actions returned by the latest validated presentation:

- `provide_capability_proof`: bind the execution root refs plus typed proof and let the compiler recompute readiness.
- `set_execution_disposition`: bind exact Case refs and set `execute` or `do_not_execute`; include a concrete reason for exclusion when required.
- `pause_execution`: bind the execution presentation and leave undecided items Pending.
- `reopen_semantic_question`: bind the immutable `case_document_ref`, semantic root/version refs, and execution run; supersede this execution run and create a sibling Case Document run.
- `cancel_run`: bind the execution or final-confirmation phase/version and cancel idempotently.

Do not advertise semantic answer actions in execution closure. A new final or temporary business rule must travel through `reopen_semantic_question` and the sibling Case Document's normal clarification pipeline.

For `provide_capability_proof`, copy the displayed `proof_contract.type` exactly and choose only a value listed in that contract. The current registered `testability_availability` contract accepts `verified_available` or `verified_unavailable`; any unknown type/value, stale execution-root version, or semantic-gap root is rejected without appending a revision. The resulting compiler receipt has `domain=testability` and affects readiness only.

Every displayed execution item includes the stable refs needed to construct its advertised event. Copy presentation ID, action context, Case/root refs, run ID, phase/version, and recovery values exactly. Old presentation, item digest, root version, Case Document ref, or action context is stale and writes no event.

One user response is one atomic append. Apply valid choices only to their exact targets; omitted items remain Pending. A pause is explicit, never inferred from a partial reply. Re-invoke the runner before resuming or recovering.

## Confirm exactly what was shown

When no decision remains Pending and all readiness rules are satisfied, display the compiler's complete final-confirmation plan. It must include every item, disposition, DoNotExecute reason, capability status, counts, and projected Case list.

Confirmation must bind the same displayed presentation/version and exact plan digest/change head. A stale or unseen plan cannot finish. Any later capability, disposition, reopen, pause, or cancellation change invalidates confirmation and requires a newly rendered plan. Never change and confirm in one step.

The compiler writes no ready manifest while confirmation is missing or stale. A higher non-ready revision cannot be overwritten by an older ready/current pointer.

## Reopen through a sibling

`reopen_semantic_question` never edits an execution run in place. The catalog transaction first creates a durable sibling Case Document run, records `parent_run_id`, parent execution run, immutable parent Case Document ref, reopened semantic root/version refs, and `creation_reason=reopen_semantic_question`, then marks the execution run `superseded_by_semantic_reopen`.

The sibling inherits content-addressed source/Decision/evidence/scope refs and the suspension ledger, recompiles semantic artifacts, and asks the reopened business question. Old Decisions stay auditable but suspended. After delivery, any new Execution Plan must be another run referencing the sibling's new immutable manifest; the old plan never becomes active again.

## Cancel and recover

`cancel_run` is available at source acquisition, semantic clarification, execution closure, and final confirmation. Repeating the same cancellation is idempotent. A cancelled run accepts no later append. To continue, call the ordinary `createV4RunDirectory` entry with `{ parent_run_id, creation_reason: 'resume_cancelled' }` as its second argument; it derives the original delivery intent and issues the sibling ID. Do not mutate or revive the cancelled run.

Across source acquisition, semantic clarification, execution closure, and final confirmation, the advertised cancellation event is always `cancel_run`.

## Deliver without executing

`output/current.json` is the only authoritative manifest. The execution branch binds the immutable Case Document ref, execution plan artifact, and `runner_projection`. Re-read and validate every reference and digest before reporting `execution_ready` or `no_execution_selected`.

This Skill only confirms the plan. It does not automatically start E2E tests or call any downstream executor. Execution results, observations, screenshots, logs, and defects belong downstream. Each downstream record binds the delivered bundle digest plus stable Case ID and is never written back into the canonical Case Document or Execution Plan.

The Case Document's `execution-worksheet.csv` is a blank human worksheet initialized with `execution_status=not_run`; it is not proof of execution. JSON, Markdown, and CSV remain mechanical views of one canonical Case Document bundle.

For legacy v3 ready results, preview/replay remains read-only and may use the private `post-ready-preview-request.json`/`preview_epoch` protections defined by that version. It is not a v4 public fallback or a route to mutate a v4 Case Document.
