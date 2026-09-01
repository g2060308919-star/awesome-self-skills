# Behavior Views

Build only views signaled by accepted facts, then run the fixed interaction audit. Every element, relation, condition, and result must trace to an accepted claim or an allowed E2 model element.

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

Do not generate generic negative behavior merely because a technique suggests it. If a formal requirement exists but its result is missing, route it to Blocked. If only generic risk exists, keep it as independent Exploratory.

## Supply obligation inputs with the views

Every `behavior_views` artifact must contain the closed `obligation_inputs` object with these four arrays: `view_contexts`, `terminal_fact_routes`, `custom_responsibilities`, and `combination_requests`. Read the Behavior Views schema before writing a nonempty terminal route or custom responsibility; submit only its public semantic fields and never an obligation or root ID. Keep `combination_requests` empty until its dedicated workflow semantics are available. `view_contexts` may be empty only when the artifact has no `input-domain`, `role`, `timing`, or `integration` view.

Provide exactly one context for each of those four view types. A context contains only `view_id` and `bindings`. Every binding contains only `selector`, `risk`, `source_claim_ids`, `required_oracle_refs`, and `required_capabilities`. Bind every required responsibility exactly once:

- input-domain: one `{kind: "equivalence-class", element_id, class_id}` selector per class and one `{kind: "boundary", element_id, boundary}` selector for each of `lower` and `upper`;
- role: one `{kind: "permission", element_id, permission}` selector per permission;
- timing: `{kind: "before"|"equal"|"after", element_id}`, plus a `{kind: "timeout"|"retry", element_id, signal_claim_id}` selector only when an accepted signal claim supports it;
- integration: one selector for each of `request`, `response`, `persistence`, `event`, `callback`, and `compensation`; `{kind: "side-effect", element_id, side_effect_kind, target}` for each side effect; and a signal-backed selector for `invariant`, `contract-compatibility`, `concurrency`, `idempotency`, or `security-abuse` when applicable.

Within one integration element, each `(side_effect_kind, target)` pair must be unique. Include `signal_claim_id` in that binding's `source_claim_ids`. Empty `required_oracle_refs` and `required_capabilities` are legal prebindings: they do not invent an Oracle or capability and do not prevent Test Point compilation. Do not submit a context for flow, decision, or state; the compiler derives those contexts.

Selectors are semantic identities, not array positions. Reordering bindings, claims, or side effects must not change the resulting Test Point IDs. Never calculate or submit obligation IDs, root IDs, internal hashes, a `test_obligations` artifact, or any fifth artifact stage; the compiler owns them.

## Audit module interaction

Use exactly these seven dimensions: `shared-entity`, `role`, `client`, `interface-event`, `time`, `concurrency`, and `side-effect`. For one declared module, record all seven `single-module` cells using that one module ID. For multiple declared modules, record all seven cells for every unordered module pair. Mark every cell as either `checked-no-signal` or `candidate`. Do not use an empty list as proof of checking.

Route each candidate to exactly one destination:

- a sourced formal interaction view;
- Blocked with a concrete missing rule, Oracle, scope, or capability;
- independent Exploratory with accepted diagnostic evidence.

Check shared quotas, cross-role and cross-client consistency, asynchronous callbacks, duplicate submission, concurrency, long state chains, and external side effects only when a recorded signal exists.

## Enumerate obligations before Cases

Create at least one formal Test Point for every in-scope normative and testable atomic fact. Preserve temporarily untestable facts as Blocked. Require explicit exclusions for NotApplicable.

Cover every explicit decision rule, valid state transition, input class/boundary, flow edge/terminal/sourced exception, sourced role permission, and sourced integration invariant. Do not target an arbitrary Case count, enumerate every possible path, stamp generic field templates, or put Exploratory items into the formal denominator.

Use pairwise or higher-strength selection only when at least three independent parameters, material combination growth, and a sourced interaction risk are present. Selection chooses input vectors; every vector still needs an independently sourced Oracle.

Give each accepted fact exactly one route and each formal Test Point exactly one final disposition. Keep bidirectional links among facts, Test Points, Cases, and concrete expectations.
