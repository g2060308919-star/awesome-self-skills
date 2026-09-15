# Case Writing Policy

Read this policy before writing `case_drafts` and before presenting a Case Document. Confirm that the runner requested `case_drafts` with `case-drafts.schema.json`; never invent fields, a fifth Agent artifact, compiler-owned ordering dependencies, or a manual final.

## Write logical Cases without execution-resource gating

Case generation does not inspect or require real environment URLs, accounts, observers, controls, credentials, test-data availability, cleanup access, or runner capability. Those are checked only by a separately requested Execution Plan.

A logical Case may and should describe source-backed business role/permission, business preconditions, data conditions, ordered actions, observable business results, and relative baseline contracts. These describe what a human tester must exercise, not proof that today's environment can execute it. Never submit v3 `testability_profile`, setup-resource locator, or execution-readiness fields in a v4 Case.

Keep exactly one independently diagnosable primary business outcome per Case. One Case has one `primary_test_point_id`; API, storage, event, and UI observations of that same outcome may be supporting oracles/observations. Split two independently failing business results even if they share setup or actions. Case remains the atomic execution unit; a later plan cannot select only some steps.

Different enumerations, permission branches, or condition/result branches that can fail independently must be split into their own Cases with their own exact input and expected result. Do not change only the title while retaining one vague expectation across all inputs. Several steps are allowed when they establish or observe the same primary result; do not split merely by step count.

不同枚举、权限或条件分支必须按独立结果拆分，各自保留准确输入与预期；共享操作不构成合并理由。

## Preserve single points and add a same-object complete path

When accepted flow evidence defines a main closed path, keep every required 单点 Case and add one complete-path Case. 完整流程必须围绕同一业务对象，从证据明确的起点经过所需动作到达证据明确的终点。Refer to continuity in executable terms such as “本用例创建的记录”; do not invent an identifier field the product never provides. A critical stage stays in the steps instead of being moved into a precondition, and the Case must not silently switch objects midway.

完整流程仍是一条普通多步 Case, with one `primary_test_point_id` and one primary business result. Process observations may prove continuity, but unrelated copy, permissions, failures, retries, or fields remain their own single-point outcomes. A flow Case may share the terminal Test Point with a different single-point scenario; preserve both scenarios without increasing the formal denominator. 单点必须保留，不能被完整流程取代。不新增 Case 类型、流程引擎或状态机。

不得新增 Case 类型、流程引擎或状态机。Use only the existing CaseSpec, existing compiler-owned ordering refs, and source-backed views. If the source signals a path but its object linkage, ordering, start, or terminal result is ambiguous, route that business ambiguity through the existing pre-case or post-case clarification phase.

## Use only the closed v4 CaseSpec

Every Case supplies:

- `case_id`, `title`, `module_id`, and `priority`;
- `ordering.business_flow_ref` and `ordering.page_action_ref`, each either a compiler-owned source-backed registry ref or null;
- `acceptance_role`, `fact_ids`, one `primary_test_point_id`, and `supporting_observation_ids`;
- `business_preconditions`, `data_conditions`, `steps`, and `oracles`;
- optional `semantic_effects`, `baseline_spec`, and `test_values` only when supported.

Do not submit `depends_on_case_ids`, ranks, registry records, obligation IDs, root IDs, or other compiler-owned fields. Ordering input comes only from `/module_id`, `/ordering/business_flow_ref`, `/ordering/page_action_ref`, `/priority`, and `/title`. Null ordering refs mean unsequenced; never infer sequence from a natural-language title.

Each business precondition has `precondition_id` and `description`; each data condition has `condition_id` and `description`; each step has a Case-local unique `step_id` and executable `action`. These IDs are bindings for canonical JSON, not prose the user must interpret.

## Bind every Oracle to a step

Every Oracle has `oracle_id`, `observe_after_step_id`, `surface`, concrete `expected`, and nonempty `claim_ids`. `observe_after_step_id` must reference exactly one existing step in the same Case. A dangling or cross-Case ref is a modeling error and cannot enter a formal result.

Write a concrete business expectation, not “works”, “normal”, “correct”, or “successful”. Name the exact value/state/event/side effect, where it is observed, and any sourced comparison or time bound. An observation surface alone is not an Oracle. A generic boundary technique, common practice, model consensus, or coverage selection cannot supply expected product truth.

HTML and Markdown place each expected result with its owning step. CSV serializes `steps` as `N. action` and `expected_results` as `步骤N：预期`, using the same step order. The conversation Table preserves every Oracle in deterministic step/observation order. JSON, HTML, Table, Markdown, and CSV derive from one canonical Case document; never edit them independently.

## Record semantic effects only when real

Use optional `semantic_effects` only for a source-backed business change. Each closed item is `{effect_id, kind, subject, before?, after, claim_ids}` with nonempty Claim refs. Omit the field when no business state change is specified. Never invent persistence, cleanup, post-state, callback, or compensation to fill a shape.

## Make relative baselines executable later

Use `baseline_spec` only for a source-backed compatibility or “same as current online” rule. It uses `kind=declared_reference`, `acquisition=capture_at_execution`, a stable business `reference`, a closed `comparison_contract`, and Claim refs.

`capture_at_execution` deliberately does not contain an environment URL, account, screenshot, captured value, or capability proof at generation time. The Case states which fields are compared and the permitted differences. The execution system captures the actual baseline later. “Same as baseline” without that contract is not an executable Oracle and remains a semantic gap.

## Label every test value origin

Each `test_values` item identifies `value_id`, semantic `subject_ref`, business JSON Pointer `field_path`, typed `value`, nonempty Case-local `used_by_refs`, and exactly one `value_origin` branch:

- `requirement`: nonempty `claim_ids` directly require the value.
- `example`: nonempty `claim_ids` and `replaceable=true`; it is illustrative and never a fixed expected value merely because it appeared as an example.
- `derived`: nonempty `input_claim_ids`, deterministic `derivation` (`method_id`, `method_version`, `inputs_digest`), and `evidence_level=derived`.
- `temporary_assumption`: `assumption_id`, nonempty `semantic_gap_ids`, `reason`, and `requires_case_status=Conditional`.

Never mix fields from different branches, relabel an example as a requirement, or treat a derived result as an authorized rule. `used_by_refs` may name only an existing precondition, condition, step, oracle, or semantic effect in this Case. An E1 or temporary-assumption input caps the Case at Conditional even if its Oracle is stronger.

## Preserve evidence and risk boundaries

Every expected value/state and every optional semantic field needs direct accepted Claim evidence or a legal replayable E2 derivation. Run a read-only source rebuttal pass before submission: try to disprove every proposed fact, condition, action, and Oracle. The review must never introduce a new business fact. Contradicted or uncertain semantics remain a gap; do not invent an assumption to rescue them.

An unsourced generic risk may become a clearly labelled Exploratory record, never a formal Case or Oracle. Missing formal source behavior remains a semantic gap, not Exploratory. `risk_review_ledger` is compiler-owned from the complete module review; Case drafts must not create or hide its nine mandatory categories.

## Render a business-first Case Document

The primary `test-cases.html` document begins with a complete overview in the compiler's canonical order and provides full Case details. Primary Cases and boundary-contract Cases remain distinguishable. Show preconditions and data before actions, then place each expected result immediately after its step. The complete conversation Table uses the same projection and never samples or rewrites expectations.

Display a shared semantic root once with all affected business items. Default business content must not expose root, Fact, Claim, obligation, Test Point, Case, Oracle, or other internal IDs. IDs are permitted only in canonical JSON or when `render_options.include_audit_appendix=true`.

Coverage wording is exactly bounded as “已审阅 formal test-point 覆盖” (or a faithful localized equivalent). Name primary and boundary counts and separately show semantic gap, Exploratory, and NotApplicable counts. Never use a bare risk tuple or claim “requirements are 100% covered”.

`blocked_only` titles the output as an unresolved report and must not claim Cases were generated. `no_applicable_cases` requires evidence-backed exclusions for every reviewed applicable lane. A canonical failure permits diagnostics only; it never permits a hand-written Markdown, spreadsheet, or test-case fallback.

Legacy v3 Cases remain readable for validation/migration. Their obligation-oracle, execution-signature, support-review, and Testability shapes are v3-only and must never become a fallback when a v4 artifact fails.
