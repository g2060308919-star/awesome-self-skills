# Case writing policy

Write `case_drafts` only from the accepted semantic seed and accepted Behavior Views. Cases are deterministic projections of reviewed formal test points, not free-form examples.

## Scenario contract

Each Case has one independently diagnosable primary business outcome. State the module, business title, priority, preconditions, actor, data state, ordered actions, and expected observations. Split unrelated outcomes into separate Cases.

Every step has a compiler-recognized identity. Every Oracle binds an existing step through `observe_after_step_id`, uses a typed observation, and contains a decidable assertion, scope, and observation window. Avoid vague phrases such as “works correctly”, “normal”, or “as expected”.

Use evidence-grounded boundary, negative, permission, state, timing, and interaction scenarios where the accepted contracts require them. Cross-test-point selection cannot be used as proof of one test point's finite complement coverage.

## Status

- Grounded means all semantic and Oracle requirements are supported and decidable.
- Exploratory retains a named unresolved assumption and never claims normative certainty.
- Blocked retains the exact unresolved gap that prevents a runnable scenario.
- NotApplicable requires an explicit reviewed basis and is not an execution disposition.

The compiler derives final status. The Agent cannot promote a draft by editing status fields.

## Canonical delivery

The compiler produces normative JSON and deterministic Markdown/CSV projections. Use only files referenced by `case_document_ref` and the verified current output manifest. Report counts for delivered Cases, retained gaps, Exploratory items, and NotApplicable items separately. Never promise unbounded requirement coverage or hand-author an alternate official result.
