# Trial and Campaign contract

## Trial persistence

Each owner-only `trial-manifest-v1` uses atomic replacement, a SHA-256 self-digest, monotonic revision, timeline and Trial lock. A terminated-process lock can be recovered; a live concurrent lock is rejected. The private Trial root and Runner exchange root must not overlap.

The main states are `created → prepared → awaiting_scope_confirmation → awaiting_runner → running → collecting → evaluating → evaluated → resetting → completed`. Auxiliary states are `awaiting_assistance`, `blocked`, `invalid`, `reset_failed` and `abandoned`. Commands record input digests and idempotency keys. Scope confirmation freezes the normalized business origin and current Sandbox run, epoch, profile and available fixture/UI identity; evaluation rechecks that identity before reading private truth. Collected artifacts, normalized Host events and materialized input are rehashed before later steps.

An interrupted `running` Trial is blocked. If a write may have been submitted, resume requires explicit reconciliation. Resume changes the manifest only; it never invokes a Runner, browser or business mutation. Reset first persists an intent bound to the old run/epoch and command idempotency key. Repeating that exact command reconciles a lost successful response or explicitly recovers a `failed-reset`; changed reset inputs fail closed. Until this succeeds, `reset_failed` fences subsequent work.

## Calibration

`config/calibration-v1.json` is outside immutable benchmark `v1` and references exactly `H01-R1`, `B01-R1`, `B02-R1`, `B09-R1`, `B11-R1` and `B12-R1`. Generated plans lock Runner, bundle, classifier, mapping, metric deriver and scorer digests. All six Trials must use native evidence, complete Oracle checks and verified resets; B09, B11 and B12 receive their additional false-pass, duplicate-write and manual-relogin checks.

## Release Matrix

A Release plan requires a matching passing Calibration summary. It snapshots every execution unit already present in the bundle rather than hard-coding a count. Aggregation rejects missing/duplicate/extra units, mixed sources/components, reused Host sessions/runIds/Trial IDs/artifacts, applicability changes, failed resets and evaluation/manifest digest mismatches.

Only after validation does aggregation call the existing bundle scoring kernel. Excluded units remain outside numeric denominators but retain hard-gate effect. JSON and Markdown share one summary object containing official/diagnostic score, ratios, thresholds, aggregate quality metrics, key-Profile result, flake groups and responsibility-domain failures.
