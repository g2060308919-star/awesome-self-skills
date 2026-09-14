---
name: generate-test-cases
description: Use when a PRD, module description, module-description, 需求文档, 模块说明, 功能变更, 规则变更, 验收标准, 交互说明, 接口契约, 粘贴需求, 测试用例, 测试点, or 测试场景 must become manual functional test Cases with high accuracy, high coverage, end-to-end traceability, explicit Blocked accounting, and convergent clarification. Do not use for Playwright, 浏览器 E2E, API automation, API 自动化, 接口自动化, 单元测试代码生成, code-review-only, or 仅代码审查 requests.
---

# Generate Test Cases

Use the bundled deterministic compiler to turn requirements into evidence-grounded manual functional Cases. v4 is the only public generation workflow. v3 is a legacy, read-only validation or migration input and is never a generation fallback.

The compiler owns validation, stable identity, Facts, scope topology, formal Test Points, semantic roots, classification, coverage, ordering, checkpoints, canonical results, and rendering. The Agent writes only the four requested semantic artifacts: `source_pack`, `evidence_claims`, `behavior_views`, and `case_drafts`.

## Load the matching policy before acting

- Read `references/run-management.md` before creating, recovering, resuming, repairing, replacing, or cancelling with `cancel_run`.
- Read `references/evidence-policy.md` before collecting sources, creating locators, or writing `source_pack` or `evidence_claims`.
- Read `references/behavior-views.md` before writing `behavior_views`.
- Read `references/case-writing-policy.md` before writing `case_drafts` or presenting the business Case document.
- Read `references/clarification-policy.md` before presenting questions or submitting `answer_question_part`, `defer_question_part`, `mark_question_unknown`, or `request_delivery`.
- Read `references/semantic-answer-preview.md` before preparing, presenting, committing, revising, or cancelling a semantic answer preview.
- Read `references/execution-closure-policy.md` before submitting `provide_capability_proof`, `set_execution_disposition`, `pause_execution`, or `reopen_semantic_question`, and before presenting or confirming an execution plan.

Read the runner-requested `scripts/schemas/<schema_ref>` before writing that artifact or event. Do not invent a field absent from the closed Schema, rename a result kind, or expose a private working shape.

## Select one delivery boundary

For ordinary requests to generate test Cases, test points, or a test document, use `delivery_intent=case_document`. Case generation does not check real environment URLs, accounts, observer access, control access, test-data availability, or cleanup resources. Logical business roles, permissions, preconditions, data conditions, actions, Oracles, and relative baselines are still semantic inputs.

Use `delivery_intent=execution_plan` only when the user explicitly asks to select or confirm an execution list. An execution plan is a separate downstream run bound to an immutable `case_document_ref` containing the exact `manifest_digest` and `bundle_digest`. Only this path checks current execution capabilities and dispositions. Do not ask for execution resources or an execution-plan preference during ordinary Case generation.

This Skill creates and, when explicitly requested, confirms an execution plan. It does not automatically start E2E, invoke a browser or API runner, generate automation code, or record execution results.

## Gate and freeze input

Try every supplied path, attachment, and inline source. If no requirement content is readable, ask once for accessible source material. If it remains unavailable, end with `INPUT_UNAVAILABLE`; never create a generic or empty Case document.

Freeze product, module, role, client, version, region, environment, original source set, and material scope. An unspecified dimension remains unspecified. Do not broaden or narrow scope because later analysis discovers more material. New authoritative source bytes or a material scope change requires `NEW_RUN_REQUIRED`; preserve the old run.

Read complete source structures before modeling. Split independently decidable results across sentences, punctuation, lists, and tables, including both sides of an explicit branch. Formatting-only changes must not alter the business obligations. Keep object identity, scoped aliases, and exact displayed text distinct; never turn a locally allowed wording set into global fuzzy matching.

Set `output_language` to the user's requested `zh-CN` or `en`, otherwise use the request language. Preserve source quotations and technical names verbatim. Never fill product truth from generic domain knowledge.

When a business Claim carries compiler-consumed structure inside `semantic_value`, use only the exact assertion families and closed item shapes documented in `references/evidence-policy.md`: `relative_baseline_assertions`, `test_value_assertions`, `test_value_derivations`, `risk_review_assertions`, `not_applicable_assertions`, and `ordering_assertions`. Do not place execution readiness or a self-authored compiler ID in these fields.

## Run the private workflow

Resolve `<skill-dir>` to this Skill directory. Create a persistent private run directory owned by the current task, outside the Skill installation and outside OS temporary storage. Its canonical absolute path is durable run identity; a spelling containing `..` that resolves to it is the same canonical run.

Maintain `run-catalog.json` only as the private relationship index described by `references/run-management.md`. Accepted semantic repairs use its append-only `artifact_repairs` procedure; neither structure is a fifth Agent-writable artifact or an authority over the runner checkpoint.

For context recovery, resume the same run directory and invoke the runner first. Do not infer state from conversation history, filenames, a stale checkpoint, or an old current manifest. Invoke exactly:

```text
node <skill-dir>/scripts/test-compiler.mjs <absolute-run-directory>
```

The runner receives one absolute run-directory argument and stdout contains one JSON reply. Validate it against `scripts/schemas/reply.schema.json` before inspecting status or writing anything. Unknown status/stage, a stage/schema mismatch, malformed JSON, extra reply fields, or unverifiable recovery bindings is `PIPELINE_PROTOCOL_ERROR`; write no artifact. stderr is diagnostics only.

Import the private installed Adapter helpers `createV4RunDirectory`, `constructV4Action`, `prepareSemanticAnswerBatchV4`, `commitSemanticAnswerBatchV4`, and `stageV4SourceAcquisitionAction` from `<skill-dir>/scripts/test-compiler.mjs`. Create each Case Document or Execution Plan sibling with `createV4RunDirectory(<catalog-root>, delivery_intent)` so the compiler issues the run ID and canonical `runs/<run-id>` directory together; never mint a run ID or move an established run directory. Route semantic answer/control batches in enrolled Case Document runs through prepare, a business-readable preview, explicit user confirmation, and commit; do not directly append a constructed answer event. Continue to use `constructV4Action` for advertised `cancel_run`, execution choices, and legacy-compatible lower-level paths, and use `stageV4SourceAcquisitionAction` for source acquisition. Never mint or compute an event ID, digest, presentation binding, request binding, or other protocol ID. A stale or unadvertised action is a protocol error; do not hand-build a substitute event.

Follow this order:

```text
source acquisition and canonical capture
-> source review, atomic Facts, topology review, and scope manifest
-> pre-case clarification
-> sparse Behavior Views, business outcomes, formal Test Points, and Case Drafts
-> post-case clarification for newly discovered semantic gaps only
-> canonical Case Document delivery
-> optional explicit Execution Plan bound to that immutable Case Document
```

The pre-case clarification occurs after source review, atomic fact extraction, and scope manifest closure, but before Behavior Views and Cases. The post-case clarification occurs only after Case design reveals a genuinely new semantic gap. In both phases, present one business-readable batch.

For each reliably bound semantic answer/control batch in a newly enrolled Case Document run, call `prepareSemanticAnswerBatchV4`, show its business-readable preview, obtain the user's explicit decision for that exact preview, then call `commitSemanticAnswerBatchV4`. Apply is the only preview decision that may append the prepared batch. Revise and cancel-preview leave accepted business state unchanged. This protection does not replace either clarification phase, and ordinary confirmation never upgrades a temporary E1 answer to final E3.

For a partial answer, submit only reliably bound answered parts. Unanswered parts remain `presented` and pending; blank, unparseable, or not reliably bound text writes no answer and cannot suppress an item or advance its revision. Only an explicit `defer_question_part` or `mark_question_unknown` changes that part to deferred or unknown. `request_delivery` closes only the explicitly referenced parts for delivery.

When writing Cases, keep plain manual Oracles valid without environment resources. Preserve every source-declared finite value mapping, logical all-record condition, and permission result as independently auditable semantics; do not replace them with representative samples, live-data assumptions, or an equal-count but different business outcome.

## Handle runner replies

Every user-visible stop path must state: current state, produced artifacts, incomplete reason, concrete next actions, and recovery. Use only actions returned by the validated reply.

### Handle `need_artifact`

Report current state, produced artifacts, why source acquisition is incomplete, the advertised `provide_artifact`/`cancel_run` next actions, and the exact `resume_ref` recovery. Never retain a signed retrieval URL. Collect the complete batch named by `artifact_requests`, review the safe canonical Source Pack, and call `stageV4SourceAcquisitionAction` with the validated reply, that Source Pack, each request's safe input, and its exact material bytes; then call the runner again. The helper derives all events and computed Source fields and atomically stages only the safe resumed Source Pack plus short-lived material. `need_artifact` is reserved for this complete source-acquisition recovery contract.

### Handle `need_user_answers`

Report current state, produced artifacts, why the run needs decisions, available actions, and recovery from the committed checkpoint. Present compiler questions in business language: concrete question, `why_needed`, `decision_impact`, `unresolved_outcome`, affected business items, and named risk counts. Keep root, Fact, Claim, obligation, digest, and other protocol IDs hidden in the submission context.

For semantic clarification, allow only `answer_question_part`, `defer_question_part`, `mark_question_unknown`, `request_delivery`, and `cancel_run` when advertised. For an explicitly requested execution plan, execution closure uses only `provide_capability_proof`, `set_execution_disposition`, `pause_execution`, `reopen_semantic_question`, and `cancel_run` when advertised. Copy all presentation, version, item, run, and checkpoint bindings exactly; do not compute IDs.

For the four semantic part actions, use the preview reference and the installed `prepareSemanticAnswerBatchV4`/`commitSemanticAnswerBatchV4` pair. A prepared preview is not an accepted answer. Show the adopted business rule/control, scope, authority/evidence nature, determinate changes, reanalysis scope, and retained items before asking for apply, revise, or cancel-preview. Keep `cancel_run` on its original independent Adapter action.

### Handle `need_revision`

Report current state, accepted artifacts, exact validation reason, the artifact/action that can be corrected next, and recovery from the last committed checkpoint. Repair an unaccepted staging artifact at the same revision. Repair an accepted semantic artifact only through the digest-bound append procedure in `run-management.md`; never edit accepted, derived, or output bytes.

When `incomplete_reason.code` is `STAGE_ARTIFACT_REQUIRED`, open the named Schema and matching policy, write only its fixed staging file, and call the runner again:

- `source_pack` -> `staging/source-pack.json`
- `evidence_claims` -> `staging/evidence-claims.json`
- `behavior_views` -> `staging/behavior-views.json`
- `case_drafts` -> `staging/case-drafts.json`

Any other Agent-writable stage is `PIPELINE_PROTOCOL_ERROR`. Never invent a fifth artifact.

Allow three repair attempts for the same normalized stage and root cause. The fourth identical no-progress result is `PIPELINE_NO_PROGRESS`, not a compiler fatal or business Blocked item. Reset the counter only on material stage or cause change.

### Handle `finished`

Re-read `output/current.json`, treat it as the only authoritative manifest, and validate every referenced file and digest before reporting success. Report current state, canonical result kind, produced files/counts, any retained gaps or execution exclusion reason, next available action, and exact recovery run reference.

Case Document JSON, business Markdown, and execution worksheet CSV are deterministic views of the same canonical bundle. Markdown begins with a one-scenario-per-line overview showing module, priority, title, and status; it labels coverage as “已审阅 formal test-point 覆盖” and separately names semantic gap, Exploratory, and NotApplicable counts. Never claim unbounded “100% requirement coverage”. Internal IDs appear only in canonical JSON or an explicitly enabled audit appendix.

`blocked_only` is a delivered unresolved report and must not claim Cases were generated. `no_applicable_cases`, `delivered_cases`, and `delivered_with_gaps` retain their exact meaning. Execution-only `execution_ready` requires nonempty `runner_projection.case_ids`; `no_execution_selected` is not ready. Only Grounded + Execute Cases enter that projection.

Never produce a hand-written official final, alternate Markdown, spreadsheet, or test-case fallback. A fatal or failed canonical gate means no unbound file is an official result.

### Handle `fatal`

Report current state, the last valid produced artifacts, diagnostic reason, safe next action if any, and checkpoint recovery. On fatal, produce no Markdown, spreadsheet, test cases, or other fallback final. Never convert process failure into semantic Blocked.

### Handle `cancelled`

Report current state, produced and preserved prior artifacts, incomplete reason (the cancellation phase/reason), the next action, and recovery. The cancelled run accepts no more appends. `cancel_run` is valid during source acquisition, semantic clarification, execution closure, and final confirmation; repeat cancellation is idempotent. To resume, call the installed bundle's ordinary `createV4RunDirectory` helper with `{ parent_run_id, creation_reason: 'resume_cancelled' }` as its second argument; the compiler derives the original delivery intent and issues the sibling ID. Never append to the cancelled run, mint its ID, or choose a different intent.

## Preserve truth and delivery integrity

- Keep evidence status separate from execution disposition. DoNotExecute never means NotApplicable and cannot upgrade evidence or alter an Oracle.
- Keep one independently diagnosable primary business outcome per Case. Every Oracle binds an existing step with `observe_after_step_id`.
- Never fabricate a Behavior View field, business rule, ordering dependency, observer, execution resource, or Schema field. Multiple unrelated atomic Claims must not share a whole-document locator.
- `request_delivery` may close selected semantic gaps for delivery; it never fabricates answers, deletes formal Test Points, or makes an execution plan ready.
- JSON is normative. Markdown and CSV are mechanical views of the same canonical result, never independently edited.
- Execution results and defect records belong downstream and bind the delivered bundle digest plus Case ID; they are never written into the canonical Case Document.
