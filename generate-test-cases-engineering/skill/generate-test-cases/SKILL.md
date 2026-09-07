---
name: generate-test-cases
description: Use when a PRD, module description, module-description, 需求文档, 模块说明, 功能变更, 规则变更, 验收标准, 交互说明, 接口契约, 粘贴需求, 测试用例, 测试点, or 测试场景 must become manual functional test Cases with high accuracy, high coverage, end-to-end traceability, explicit Blocked accounting, and convergent clarification. Do not use for Playwright, 浏览器 E2E, API automation, API 自动化, 接口自动化, 单元测试代码生成, code-review-only, or 仅代码审查 requests.
---

# Generate Test Cases

Produce evidence-grounded manual functional test Cases through the bundled deterministic compiler. Treat the compiler as the sole owner of validation, classification, coverage, stable identity, checkpoints, and final rendering.

## Load policy only when needed

- Read `references/run-management.md` before creating, recovering, repairing, replacing, or batching a run. Maintain its private `run-catalog.json` with real compiler-issued identities and explicit active/completed/failed/superseded relationships.
- Read `references/evidence-policy.md` when collecting sources, resolving authority, creating locators, or writing `source_pack` and `evidence_claims`; read it before writing either artifact.
- Read `references/behavior-views.md` when routing accepted facts, supplying `obligation_inputs`, and checking formal Test Point coverage; read it before writing `behavior_views`.
- Read `references/clarification-policy.md` when handling `need_user_answers`, interpreting answers, delivering now, or reopening suppressed root issues.
- Read `references/case-writing-policy.md` when constructing `case_drafts`, Oracles, Testability profiles, support reviews, or user-facing Case wording; read it before writing `case_drafts`.
- Read `references/execution-closure-policy.md` before writing or handling any execution decision, pause/resume, final confirmation, `runner_case_ids`, or post-ready change request.

Read the requested `scripts/schemas/<schema_ref>` before writing an artifact. Do not preload every reference or schema.

## Gate the input once

Try every supplied path, attachment, and inline source. If no requirement content is readable, ask once for an accessible PRD, module description, or pasted requirement text. If content remains unavailable, end with `INPUT_UNAVAILABLE`; do not create an empty or generic normal bundle.

If any requirement content is readable, continue. Record partial extraction gaps and uncertain regions instead of asking for every missing input before analysis. Never fill a product fact from generic domain knowledge.

Freeze the requested product, module, role, client, version, region, and environment scope before extracting facts. Do not broaden or narrow that scope merely because later analysis discovers more material. If the user's original request did not state a dimension, record it as unspecified rather than choosing one; a later material scope change requires `NEW_RUN_REQUIRED`.

Set `output_language` to the user's requested language (`zh-CN` or `en`), otherwise use the language of their request. Preserve source quotations and technical names verbatim. Set `delivery_intent=case_document` for ordinary requests to generate test Cases, a test document, or test points. Set `execution_plan` only when the user explicitly asks to select and confirm a downstream execution list. Do not ask for an execution-plan preference just to generate a document.

## Run the private workflow

Resolve `<skill-dir>` to the directory containing this file. Freeze the run identity as a canonical absolute path inside a persistent private directory owned by the current task. Never place a run in the Skill installation directory or an OS temporary directory. A spelling that contains `..` and resolves to the same canonical path identifies the same canonical run.

For context recovery, use the same run directory and invoke the runner first. Never infer the next stage from conversation history, a checkpoint, or directory contents. For a new run, create the private run directory and invoke exactly:

```text
node <skill-dir>/scripts/test-compiler.mjs <absolute-run-directory>
```

Capture the single JSON object from stdout. Validate the single JSON reply against `scripts/schemas/reply.schema.json` before inspecting or handling its status and before writing any artifact. The four valid stage and `schema_ref` pairs are one-to-one: `source_pack`/`source-pack.schema.json`, `evidence_claims`/`evidence-claims.schema.json`, `behavior_views`/`behavior-views.schema.json`, and `case_drafts`/`case-drafts.schema.json`. Treat an unknown stage, mismatched schema reference, malformed JSON, extra reply field, or any other schema failure as `PIPELINE_PROTOCOL_ERROR`; write no artifact. Treat stderr as diagnostics only. Use no extra mode or configuration argument.

Follow this loop:

```text
Create private run directory
-> normalize sources into requested artifact
-> call private runner
-> handle need_artifact or need_revision
-> on need_user_answers, present one merged batch
-> append presentation-bound Decision Records, clarification controls, or execution events and increment source_revision once
-> call runner again
-> only for execution_plan delivery, handle execution_closure and show the complete final_confirmation plan
-> on finished, present generated Markdown and canonical JSON paths without starting tests
```

Complete the full workflow analysis before interrupting the user:

- A — receive sources, preserve scope/version/status, and create typed locators.
- B — establish explicit source authority, scope, and supersession rules.
- C — extract atomic sourced facts and their evidence levels.
- D — build every behavior view signaled by the accepted facts.
- E — enumerate formal Test Points before drafting Cases.
- F — bind concrete Oracles, observation points, and Testability capabilities.
- G — classify every formal Test Point and independent risk hypothesis.

Always complete A–G analysis before asking clarification. The only earlier question allowed is the single inaccessible-input request.

## Handle runner replies

### Handle `need_artifact`

Open the named `schema_ref`. Create the requested stage artifact for the returned `source_revision`, write it to the corresponding `staging` filename, and call the runner again. For a small fully readable requirement, the run-management policy permits a bounded source/evidence/views staging batch after reading each schema and policy; every stage retains its normal compiler checks. Never batch Case Drafts before reading compiler-derived obligation IDs. Preserve all accepted artifacts and compiler-owned derived files.

Use these fixed staging names:

- `source_pack` → `staging/source-pack.json`
- `evidence_claims` → `staging/evidence-claims.json`
- `behavior_views` → `staging/behavior-views.json`
- `case_drafts` → `staging/case-drafts.json`

Any other requested stage is `PIPELINE_PROTOCOL_ERROR`; write no artifact and never invent a process surface.

For `source_pack`, recompute each Source SHA-256 and add one exhaustive `source_reviews` entry whose ordered spans account for every non-whitespace part as normative, non-normative, or uncertain with review basis. Inventory `source_assets`; actually read every relevant image/media, or record its unread/unavailable state without pretending its rules were reviewed. For `evidence_claims`, explicitly review each fact's `required_view_kinds`; a custom responsibility cannot replace a required specialized view. For `case_drafts`, keep distinct business outcomes in distinct Cases and never submit compiler-owned `value_origin` or final IDs. Follow the loaded evidence and Case-writing policies for exact semantic rules.

### Handle `need_revision`

Group diagnostics by normalized stage, code, path, and root cause. An unaccepted artifact is repaired at the same staged revision. If the returned stage was already accepted, or the diagnostic is `ACCEPTED_ARTIFACT_REPAIR_REQUIRED`, follow run-management's digest-bound `artifact_repairs` append instead; preserve accepted bytes and regenerate downstream at the new revision. Re-run the compiler after each repair. Testability reference mismatches are Adapter corrections, not business questions or proof of missing environment.

Allow at most three repair attempts for the same normalized root cause at the same stage. On the fourth identical no-progress result, stop as `PIPELINE_NO_PROGRESS`, report the last diagnostics and last valid checkpoint, and do not recast the result as a business Blocked item or compiler `fatal`.

Reset the repair counter only when the stage or normalized root cause materially changes.

A digest-bound accepted-artifact repair must retain the counter for the original semantic stage/root. The intermediate Source Pack append, revision increment, and compiler carry-forward are administrative progress and do not reset that counter.

### Handle `need_user_answers`

Read the closure policy and branch on the closed `purpose` instead of treating all questions as blockers:

- `semantic_clarification`: present every returned blocker as one merged, risk-ordered set using the business-readable rules in the clarification policy. Ask once per stable root, label scope and each risk count, and offer only the returned options. Keep compiler identifiers in memory for the append; do not make the user interpret them.
- `execution_closure`: present every pending Case, formal Test Point, and Exploratory item by readable title. Record exactly one explicit Execute, DoNotExecute, or pause result for each answered item. Only a Grounded Case may be Execute. Preserve unanswered items as pending.
- `final_confirmation`: show the complete plan the compiler returned, including every item, disposition, and DoNotExecute reason. Append `confirm_execution_plan` only when the answer binds that exact prompt, source revision, plan digest, and plan-change head. A request to modify the plan appends a disposition event instead and requires a newly rendered confirmation page.

For `entry_context=post_ready_change`, accept only the latest compiler-owned presentation and group. The first natural-language modification request is not itself a decision: write a bound `staging/post-ready-preview-request.json` using the latest `preview_control`, re-invoke the runner, and only append a real event or Decision Record after the user confirms that preview. Replace and cancel use fresh compiler-issued request IDs; never replay an older epoch.

Apply the exact semantic-answer rules in `references/clarification-policy.md` and all disposition/event rules in `references/execution-closure-policy.md`. Copy compiler IDs, item digests, change heads, group IDs, `next_event_seq`, and run identity exactly. Append one immutable Source Pack revision per user reply, increment `source_revision` exactly once for the whole accepted group, and call the runner again. Never modify an accepted revision. Ambiguous phrases such as “these” or “use the recommendation” write no record until the target set is unique.

For an execution-only append submit only the Source Pack. The compiler carries forward the accepted semantic artifacts. Do not copy or reauthor evidence/views/Cases unless requested.

### Handle `finished`

Return the real `markdown_path` and canonical `bundle_path`, source revision, bundle/plan digest, separate Case/Test Point/Exploratory counts, and the short modification hint. Lead with a business-readable summary and keep internal IDs and digests only in an audit section or behind the file links. Describe coverage as declared-scope accounting, not complete product-behavior coverage. State that the confirmed `runner_case_ids` contains only Grounded + Execute Cases, that the Markdown worksheet is blank until a downstream operator records results, and that this Skill does not automatically start E2E tests. Do not ask for another confirmation or repeat the full item list.

When `runner_ready=false`, say the document is delivered but no execution plan has been confirmed; `runner_case_ids` is empty and pending is not DoNotExecute or NotApplicable. Do not prompt for execution confirmation. The current pointer is `document_only`, never ready. Mark the catalog row completed. When `runner_ready=true`, the existing confirmation and preview protections apply unchanged.

Never edit final JSON, rewrite Markdown, add a Case, improve a classification, or recompute coverage after `finished`. For a confirmed execution plan, use the bound post-ready preview flow for user-requested changes. For a document-only result, generation corrections use a digest-bound repair; an explicit later request for an execution list uses a Source Pack repair to change `delivery_intent` and regenerates the plan, requiring a newly displayed confirmation. Business answers remain Decision Records, never repair records. Original source or material scope changes require `NEW_RUN_REQUIRED` and linked catalog entries.

### Handle `fatal`

Report the compiler diagnostics and the last valid checkpoint, if one exists. Do not repair around integrity, schema-registry, runtime, or coordination failures. Do not convert a process failure into a business Blocked item.

## Preserve adapter boundaries

- Generate only the four semantic artifacts in the requested workflow; private catalog metadata and approved bounded staging batches follow run-management and never become a fifth stage.
- Copy the compiler-issued `run_instance_id` from the first `need_artifact` reply into every Source Pack revision; never invent or replace it.
- Clarification answers, `request_delivery`, `reopen_root_issues`, and supplements for unresolved business facts must append to the same run. These are source revisions, not new run identities.
- If the original PRD, a supplementary source, or the material task scope changes, return `NEW_RUN_REQUIRED`, preserve the old run, and create or use a sibling private run only for an actual user source or scope change. Never silently repurpose the old run.
- Keep normal workflow replies on exit code 0; treat a nonzero process exit as inability to form a JSON reply.
- Keep user-visible content limited to the requested final files, a merged clarification set, `INPUT_UNAVAILABLE`, `PIPELINE_NO_PROGRESS`, or fatal diagnostics.
- Never weaken evidence, invent an Oracle, hide a formal Test Point in Exploratory, or remove a Blocked item to improve coverage.
- Never publish or document an alternate process entry point.
- Never invoke an E2E Runner, browser automation, API automation, or any downstream executor. This Skill ends after document delivery or an explicitly requested execution-list confirmation.
