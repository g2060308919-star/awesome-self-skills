# Case Writing Policy

Submit complete candidate `case_drafts` after formal Test Points exist; this stage must precede any compiler `need_user_answers` reply. Draft Cases for obligations with enough sourced information, and route missing facts, Oracles, or capabilities to `blocker` obligation dispositions. Never turn gaps into guessed Cases. Clarification convergence or `request_delivery` controls compiler finalization, not whether candidate drafts may be submitted.

## Build Oracle-gated Cases

For each candidate, bind this sequence:

```text
formal Test Point
-> minimum scenario skeleton
-> concrete expected result and observation point
-> constructible precondition and data
-> executable ordered actions
-> final Case classification
```

Each Case needs a stable ID, title, scope, risk, linked facts and Test Points, reachable preconditions, concrete sourced data, role, ordered actions, action-local expectations, postcondition, cleanup or a no-cleanup reason, evidence references, and any temporary assumption with its invalidation condition.

One Case may cover several Test Points only when each owns a distinct locatable expectation. Merge only identical execution signatures: role, pre-state, data partition or boundary, action path, and Oracle must all match.

## Write concrete Oracles

Never write “works”, “correct”, “normal”, or “successful” as the entire expected result. For every key expectation state:

- the business assertion and exact expected value, state, event, or side effect;
- the preceding action that triggers observation;
- the observer and UI/API/database/event/permission/clock/post-state target;
- comparison, tolerance, or time window;
- the accepted evidence or replayable E2 derivation.

An expected business outcome must not come from a boundary technique, generic practice, model consensus, or an observation target alone.

## Prove Testability separately

Record capability, observer, control, setup, data injection, execution, observation, and cleanup status. Use:

- `provided` or `verified` for Grounded eligibility;
- `approved-assumption` for Conditional eligibility;
- `unavailable` or `unknown` for Blocked.

A requirement that says a database row or event should exist does not prove the tester can inspect it. Test capability needs separate evidence.

## Run the source rebuttal pass

Before submitting `case_drafts`, perform a read-only source rebuttal pass. Try to disprove every factual assertion from the accepted sources and record exactly:

```text
support_review = supported | contradicted | uncertain
```

Never introduce a new business fact during review. Do not create an assumption to rescue a contradiction. Grounded requires every factual assertion to be supported. Contradicted or uncertain content becomes Blocked; an E1 assumption cannot override E3/E2.

Submit the structured support review in `case_drafts` and let the compiler recompute classification and coverage. Never patch the final bundle.

## Keep user-facing wording traceable

Use product language from accepted sources. Make roles, scope, data, actions, and expected results executable by a human tester. Separate Grounded, Conditional, Blocked, NotApplicable, and Exploratory output. State limitations without claiming that pipeline completion proves requirement completeness.
