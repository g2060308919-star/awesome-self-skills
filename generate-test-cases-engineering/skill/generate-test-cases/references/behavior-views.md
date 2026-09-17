# Behavior Views Policy

Read this policy before writing `behavior_views`. Confirm the runner requested `behavior_views` with `behavior-views.schema.json`. Views express only accepted source semantics; a structurally valid shape is not permission to invent behavior.

## Model sparsely

Build a view only when an accepted Fact signals it:

| Source-backed signal | `type` | Responsibility |
|---|---|---|
| ordered business actions/path | `flow` | stated path and outcome |
| conditions choose outcomes | `decision` | stated condition/outcome rules |
| named state change | `state` | stated transition and outcome |
| enum, format, or supported range | `input-domain` | stated partitions and expected behavior |
| role or permission | `role` | stated allow/deny/visibility outcome |
| time window/order/retry | `timing` | stated temporal condition and outcome |
| request/response/storage/event/etc. | `integration` | stated interface surfaces and outcome |

Each v4 view has `view_id`, source-backed `module_id`, `type`, `scope`, `source_claim_ids`, `elements`, and `relations`. Every element belongs to exactly one atomic `fact_id`, states exactly one primary `business_outcome`, and includes field-level `evidence_bindings` for every semantic value it declares.

Use sparse `surfaces`; do not invent a request, response, persistence, event, callback, compensation, side effect, external observer, state, timing bound, default, cleanup, or post-state to populate a record. An enum does not force lower/upper. An output duration/count is not automatically an input-domain or timing input. Model only the semantic responsibility the source actually states.

For `integration`, list only evidenced `surfaces[{kind,assertion}]`. For other declared outcomes use source-backed `condition` and `expected`; omit optional surfaces/effects when absent. `semantic_effects` is allowed only for a real source-backed business state change, with field-level Claim proof.

Every evidence binding points to the exact element field (for example `/business_outcome`, `/condition`, `/expected`, or `/surfaces/0/assertion`) and nonempty accepted Claim IDs that state or legally derive that value. A same-scope or neighboring Claim is insufficient. Run a field-by-field source rebuttal before submission.

## Derive business outcomes, not surface counts

Before drafting Cases, identify each source-backed对象、条件、触发动作 and 独立业务结果. Split outcomes by independently decidable result, not punctuation, keyword count, shared click, or number of steps. A closed enumeration, permission allow/deny branch, or explicitly separate input/result mapping produces its own precise outcome inputs and expectations when the source requires them. Multiple observation surfaces that prove the same result remain supporting observations of one outcome.

Read related rules together for the same object and action. Preserve whether conditions are simultaneous (AND), alternatives (OR), prerequisites, or exceptions; select combinations that distinguish those meanings without generating a Cartesian product. The same rejection copy does not merge independently failing restrictions, while an evidence-backed impossible combination is excluded rather than invented as a negative path.

A formal Test Point corresponds to one independently decidable business outcome, not each technical surface. A Fact may produce several outcomes when each has a different expected result (for example separate enum values). UI/API/storage observations of the same outcome are supporting observations, not extra primary Test Points.

Do not unconditionally expand flow edges, before/equal/after, lower/upper, or every integration surface. Formal negative behavior needs normative evidence. An unsourced generic risk is Exploratory; a sourced requirement with missing result is a semantic gap and remains Blocked.

When accepted sources carry an ordered-path signal, use the existing `flow`, `state`, `role`, or `integration` views only as needed to preserve one business object's source-backed start, actions, role handoffs, state continuity, and terminal result. Do not infer a lifecycle from section order, button names, or product conventions. With no path signal, retain the local outcomes and do not invent create/approve/publish/disable stages.

For every supported terminal result, backtrace the required same-object actions and conditions, then walk forward to verify continuity, required role handoffs, and an observable terminal state. Add supported complete-path scenarios without removing local single-point outcomes. If object linkage, business order, start, or terminal result is genuinely missing, keep the known local facts and create the necessary semantic gap instead of completing a familiar product lifecycle from convention.

Every Fact, outcome, Test Point, and later Case retains `acceptance_role`: `primary_acceptance`, `dependency_contract`, or `context_only`. Primary coverage counts only primary acceptance. Boundary-contract coverage is reported separately. Context-only material is traceability, not a formal denominator.

## Respect compiler-owned scope and ordering

Modules and boundaries come only from the closed `scope_manifest` after topology review. Interaction expectations must use those module IDs; the matrix cannot create, rename, or delete a module. Do not infer ordering or dependencies in Behavior Views. Business flow, page action, and outcome dependency registries are compiler-owned from exact source locators and accepted Claims/Decisions.

For v4 Case ordering, the Adapter later references compiler registry IDs or null. It never submits `depends_on_case_ids`, rank values, or an invented flow.

## Close the 4.3 design-assurance ledger

For a `4.3.0` artifact, populate the Schema-defined `design_assurance` member of
the same `behavior_views` artifact. It is an auditable design record, not a
business fact, evidence source, fifth artifact, or new stage. Use the exact
closed branches in `behavior-views.schema.json`; do not infer fields from this
summary.

- `plan_revision` identifies the one current complete plan.
- `batches` are complete, sequenced batches with their actual Claim and rule-group references.
- `rule_groups` state the source-backed objective, one closed design method, and every candidate ID.
- `candidate_responsibilities` give each candidate one rule group, one concrete responsibility, and exact Claim support.
- `candidate_dispositions` dispose every candidate exactly once as `retained`, `representative_value`, `equivalent_merge`, `evidence_exclusion`, `semantic_gap`, or `exploratory`, using only that branch's Schema fields.
- `impacted_prior_batches` records which completed earlier batches must be reconsidered when a later batch exposes an omitted dependency; use an empty array only when none are affected.

Retained element IDs must exist. Representative/merge targets must exist and
cannot form cycles. Evidence exclusions require exact Claim support; uncertainty,
cost, length, or lack of mention is not exclusion evidence. Semantic-gap and
Exploratory dispositions must reference their real existing records. A partial
batch or stale plan revision is not formal completion.

## Complete the interaction audit without inventing semantics

Audit all declared modules and relevant module pairs across `shared-entity`, `role`, `client`, `interface-event`, `time`, `concurrency`, and `side-effect`. A candidate must carry nonempty `source_claim_ids` and closed `semantic_subject_refs` to actual facts, view elements, model elements, or integration surfaces. A side-effect surface is identified by `(side_effect_kind, target)`.

Route every candidate through the schema's closed formal, blocker, or exploratory disposition. A blocker submits a typed `issue_intent`, never a root key or root ID. Provenance does not define root identity; the compiler uses normalized module IDs, dimension, and semantic subjects. Keep one shared real gap instead of cloning it per Case.

The v4 artifact still contains closed `obligation_inputs` for compiler reconciliation. Submit only schema-defined semantic selectors; IDs and formal obligation/root records are compiler-owned. A custom responsibility cannot discharge a missing dedicated view. Combination coverage never supplies a product Oracle, and a forbidden tuple without closed evidence stays blocked instead of being silently dropped.

## Review all nine general risks

For each primary module, ensure the compiler can derive one `risk_review_ledger` record for every required kind: `null_or_missing`, `unknown_enum`, `api_failure`, `loading_failure`, `sync_delay`, `long_content`, `pagination`, `refresh`, and `business_permission_boundary`.

Each item must end in exactly one closed branch:

- `formal` with evidence basis and formal Test Point refs;
- `semantic_gap` with semantic-gap-analysis basis and semantic gap refs;
- `exploratory` with risk-catalog basis and Exploratory refs;
- `not_applicable` with verified-evidence or scope-Decision basis and NotApplicable refs.

Wrong basis/ref combinations or extra fields are invalid. “The PRD does not mention this risk” is never enough for NotApplicable. The ledger records review; it must not create unsupported formal behavior.

## Preserve terminal accounting

Every applicable formal Fact has exactly one final route to outcomes/Test Points or a typed semantic gap. Missing meaning, condition, expected result, authority, or Oracle stays visible. NotApplicable needs independent exclusion evidence; Exploratory does not satisfy formal coverage. Final reconciliation, not an early view-shape check, proves route completeness.

Legacy v3 view/interaction/obligation-input shapes remain readable for validation and migration only. A v3 validation success is never a fallback when a v4 sparse model fails.
