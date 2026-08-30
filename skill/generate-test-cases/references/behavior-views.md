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
