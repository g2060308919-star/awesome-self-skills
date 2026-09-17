# Outer workflow

## Create

Validate the closed request, then run:

```text
node <SKILL_ROOT>/scripts/run.mjs create --workspace <WORKSPACE_ROOT> --request <REQUEST_JSON>
```

The command creates `e2e-runs/<timestamp>-<random>/request.json` and `workflow-state.json`. Use the returned absolute Run root as durable identity. Never choose a Run by modification time.

## Advance

The only ordinary stage path is:

```text
intake
-> generating_cases
-> awaiting_semantic_input -> generating_cases
-> cases_ready
-> planning_execution
-> awaiting_execution_confirmation -> planning_execution
-> compiling_runner_input
-> runner_preflight
-> awaiting_execution_resource -> runner_preflight
-> executing
-> completed
```

Any nonterminal stage may enter `blocked` or `cancelled`. `no_execution_selected` moves from `planning_execution` to `completed` only after a validated no-execution final index exists. Apply events through `run.mjs transition` with a unique `event_id` and the current `expected_seq`; repeated event IDs are idempotent, while stale sequences and illegal edges fail closed.

## Child routing

From `intake`, create exactly one `generate-test-cases` Case Document Run, persist its complete `generation-ref.json`, then apply `case_generation_started` with that same ref. In `generating_cases`, recover only that stored Run. From `cases_ready`, create a distinct Execution Plan Run bound to the immutable Case Document reference, persist `execution-plan-ref.json`, then apply `execution_planning_started` with that ref. In `planning_execution`, recover only the stored Plan Run. In `runner_preflight` and `executing`, load `b2b-e2e-runner` and use its own preflight/resume/report contract.

The two `*_started` events mean the child Run already exists; never commit either event without its authoritative ref. This ordering leaves the outer Run at the previous recoverable stage if child creation is interrupted.
