# Behavior Views

Build only views signaled by accepted facts, then run the fixed interaction audit. Every element, relation, condition, and result must trace to an accepted claim or an allowed E2 model element.

Before writing, confirm the runner requested the schema-validated `behavior_views` stage with `behavior-views.schema.json`. Reject any other stage/schema pairing instead of treating a compiler-derived artifact as Agent-writable.

## Select views from requirement signals

| Signal | View | Formal responsibilities |
|---|---|---|
| ordered actions, main/alternate paths | `flow` | explicit edges, terminals, sourced exceptions, declared loop bounds |
| conditions determine outcomes | `decision` | every explicit valid rule, priority, condition, and sourced result |
| named states and changes | `state` | every explicit valid transition and sourced invalid-transition rule |
| ranges, enums, formats | `input-domain` | sourced classes, inclusive boundaries, and explicit invalid classes |
| roles or permissions | `role` | sourced allow, deny, visibility, and scope combinations |
| windows, timeout, retry, ordering | `timing` | before/equal/after thresholds and sourced timeout/retry behavior |
| interfaces, events, callbacks, side effects | `integration` | requests, responses, persistence, messages, compensation, invariants |

Every view element and relation must cite accepted evidence that directly states that exact state, transition, condition, result, permission, boundary, or integration surface. Perform a read-only field-level source rebuttal: the union of an element's `source_claim_ids` must directly state or legally derive every semantic field, including `state`, `from_state`, `event`, `to_state`, `condition`, and `result`. A general path claim covers only the states and transitions it actually names; it cannot support an omitted state or transition described by a different Claim. Same scope, the same owner fact, or support for a neighboring transition is not semantic support. Test-process scope, output-format, classification, and traceability instructions never become product flow nodes, edges, terminal states, or obligations. Before submitting the artifact, compare each element and relation independently against its cited Claim rather than relying on a view-level source list.

Do not generate generic negative behavior merely because a technique suggests it. If a formal requirement exists but its result is missing, route it to Blocked. If only generic risk exists, keep it as independent Exploratory.

## Supply obligation inputs with the views

Every `behavior_views` artifact must contain the closed `obligation_inputs` object with these four arrays: `view_contexts`, `terminal_fact_routes`, `custom_responsibilities`, and `combination_requests`. Read the Behavior Views schema before writing any nonempty obligation input; submit only its public semantic fields and never an obligation or root ID. A custom responsibility's `semantic_key` is an audit label only: changing it never creates a new responsibility. Identity comes from `responsibility_type`, normalized `owner`, and `scope`; with no separate semantics payload, two records with those same fields describe one responsibility. `view_contexts` may be empty only when the artifact has no `input-domain`, `role`, `timing`, or `integration` view.

The compiler first runs a structural and modeling pass that records modeled routes without deciding terminal interaction routes. It then compiles obligation inputs, built-in strategies, and custom responsibilities. Only the single final reconciliation may decide modeled versus terminal fact routes or Formal View, Blocked, and Exploratory interaction routes; a missing, multiple, or invalid route remains a revision error.

Use `terminal_fact_routes` only for a formal fact that has no modeled view route. A Blocked terminal fact supplies a typed `issue_intent`; its terminal issue scope must cover the fact scope. Every evidence reference must exist in accepted evidence, cover the issue scope, and be directionally connected to that fact subject. A NotApplicable terminal fact supplies its independently supported E3/E2 exclusion and review. Before setting `support_review` to `supported`, perform an independent semantic review and confirm that the separate E3/E2 claim directly proves the exclusion for this fact. A generic same-scope claim, a non-exhaustive inclusion list, the fact's own primary claim, or evidence level alone does not prove exclusion. If no independent claim directly supports the exclusion, route the fact as Blocked with the applicable typed `issue_intent`. Never submit a root key, root ID, obligation ID, or final fact route. The compiler derives one `caseable=false` requirement-gap obligation for a Blocked fact and performs the single final modeled-xor-terminal reconciliation.

A custom responsibility uses one closed `responsibility_type` and an owner of either `facts` or `view-elements`. Every owner must resolve unambiguously to real modeled facts; for a fact owner, its fact scope must contain the custom responsibility scope, just as a view-element owner's view scope must contain it. The compiler derives its responsibility key and obligation ID and enriches each owner's single modeled fact route. A custom responsibility cannot create a requirement-gap, and its `semantic_key` cannot split one semantic responsibility into several Test Points.

Provide exactly one context for each of those four view types. A context contains only `view_id` and `bindings`. Every binding contains only `selector`, `risk`, `source_claim_ids`, `required_oracle_refs`, and `required_capabilities`. Bind every required responsibility exactly once:

- input-domain: one `{kind: "equivalence-class", element_id, class_id}` selector per class and one `{kind: "boundary", element_id, boundary}` selector for each of `lower` and `upper`;
- role: one `{kind: "permission", element_id, permission}` selector per permission;
- timing: `{kind: "before"|"equal"|"after", element_id}`, plus a `{kind: "timeout"|"retry", element_id, signal_claim_id}` selector only when an accepted signal claim supports it;
- integration: one selector for each of `request`, `response`, `persistence`, `event`, `callback`, and `compensation`; `{kind: "side-effect", element_id, side_effect_kind, target}` for each side effect; and a signal-backed selector for `invariant`, `contract-compatibility`, `concurrency`, `idempotency`, or `security-abuse` when applicable.

Within one integration element, each `(side_effect_kind, target)` pair must be unique. Include `signal_claim_id` in that binding's `source_claim_ids`. Empty `required_oracle_refs` and `required_capabilities` are legal prebindings: they do not invent an Oracle or capability and do not prevent Test Point compilation. Do not submit a context for flow, decision, or state; the compiler derives those contexts.

Selectors are semantic identities, not array positions. Reordering bindings, claims, or side effects must not change the resulting Test Point IDs. Never calculate or submit obligation IDs, root IDs, internal hashes, a `test_obligations` artifact, or any fifth artifact stage; the compiler owns them.

Use `combination_requests` only when there are at least three independent parameters, material combination growth, and sourced interaction risk. Each request has one closed owner: an existing `view_id`, nonempty `fact_ids`, and nonempty `{view_id, element_id}` references from that same view. The owner view and every owner fact's primary scope must contain the request scope. Every declared fact must connect directionally to a selected element and every selected element must resolve to a declared fact; do not attach a broad request to a narrower owner or add unrelated owner elements.

For every parameter provide a stable public `parameter_id`; for each value provide only `value_id` and its accepted `evidence_claim_id`. Selected-value evidence must exist, be non-diagnostic, cover the request scope, and connect to the owner. Supply the required strength, closed `interaction_risk`, zero or more sourced `forbid` constraints, and zero or more exact `vector_oracles`. Every `vector_oracles` mapping describes one complete vector: its assignments must name every declared `parameter_id` exactly once, pair each parameter with one declared `value_id`, and contain no missing, duplicate, or extra parameter. Never submit a partial Oracle mapping. A forbid may eliminate candidates only when every evidence reference is related, scope-covering, supported E3/E2; E1, diagnostic, or unrelated evidence fails closed and never becomes an Oracle. `vector_oracles` are optional prebindings, so an empty array or empty `required_oracle_refs` does not pre-block a selected vector; when no full-vector prebinding exists, keep the array empty instead of inventing a partial mapping.

Submit one `forbid` constraint for every source-defined forbidden tuple. Its assignments must be that exact tuple, and its `evidence_refs` must cite the tuple's replayable E2 outcome prepared during Evidence Claims, not a broad enum or the individual value Claims. Expand an authoritative “only” rule across the other values only when the source also supplies a closed enumeration. `constraints` may be empty only after a read-only source rebuttal finds no explicit invalid-combination rule. If the compiler rejects a tuple proof, do not drop the constraint and allow forbidden vectors; the accepted Evidence Claims are missing a closed E2 tuple outcome, so stop at the repair boundary rather than weakening combination coverage. Do not submit an unconstrained request when the source contains a forbid whose closed proof is unavailable; preserve the affected combination responsibility as Blocked.

Never submit `maxCandidates`, a sampling policy, selected vectors, or generated IDs. Candidate capacity and policy version are compiler-private. The compiler invokes the deterministic t-wise selector, emits one caseable interaction Test Point for each selected vector, attaches it to every owner fact route, and carries every owner root plus each selected-value claim. If the private cap is exceeded, it emits one owner-linked, non-answerable `resource_limit` requirement gap and never samples. The derived `combination_vector` is compiler-only audit data for Case authoring; read its assignments and obligation ID but never copy that field into `behavior_views`.

## Audit module interaction

Use exactly these seven dimensions: `shared-entity`, `role`, `client`, `interface-event`, `time`, `concurrency`, and `side-effect`. For one declared module, record all seven `single-module` cells using that one module ID. For multiple declared modules, record all seven cells for every unordered module pair. Mark every cell as either `checked-no-signal` or `candidate`. Do not use an empty list as proof of checking.

Route each candidate to exactly one destination:

- a sourced formal interaction view;
- Blocked with a concrete missing rule, Oracle, scope, or capability;
- independent Exploratory with accepted diagnostic evidence.

Every interaction candidate supplies distinct nonempty `source_claim_ids` and distinct nonempty `semantic_subject_refs`. Semantic subjects use only `fact`, `view-element`, `model-element`, or `integration-surface`; a side-effect surface is selected uniquely by `(side_effect_kind, target)`. Every selector must exist, overlap a named module, and remain related to the candidate provenance. Provenance is validated but is not part of root identity: identity comes from canonical `module_ids`, `dimension`, and `semantic_subject_refs`, so evidence, candidate ID, wording, risk, revision, and array reorder do not change it.

A Blocked candidate supplies a typed `issue_intent`; its interaction issue scope must overlap a candidate module and cover every semantic subject scope. Every issue evidence reference must exist, cover that issue scope, and connect directionally to a semantic subject; never calculate or submit its root key or root ID. The compiler creates its `caseable=false` requirement-gap obligation and links that gap, root, and interaction route. Different semantic subjects in the same matrix cell remain separate candidates with separate compiler-owned routes.

Check shared quotas, cross-role and cross-client consistency, asynchronous callbacks, duplicate submission, concurrency, long state chains, and external side effects only when a recorded signal exists.

## Enumerate obligations before Cases

Create at least one formal Test Point for every in-scope normative and testable atomic fact. Preserve temporarily untestable facts as Blocked. Require explicit exclusions for NotApplicable.

Cover every explicit decision rule, valid state transition, input class/boundary, flow edge/terminal/sourced exception, sourced role permission, and sourced integration invariant. Do not target an arbitrary Case count, enumerate every possible path, stamp generic field templates, or put Exploratory items into the formal denominator.

Selection chooses input vectors; every vector still needs an independently sourced Oracle. E1 selected-value evidence makes the eventual Case at most Conditional, even when its Oracle is stronger.

Give each accepted fact exactly one route and each formal Test Point exactly one final disposition. Keep bidirectional links among facts, Test Points, Cases, and concrete expectations.
