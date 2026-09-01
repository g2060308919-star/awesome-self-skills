# Evaluation integration capability audit

Baseline: `2026-09-01-e2e-runner-evaluation-integration-spec.md` (user-designated product and technical baseline).

## Reused capabilities

- Local-only business Sandbox and capability-protected evaluator control socket.
- Resettable, run-bound fixtures; hidden Oracle events/snapshots/outbox/faults/canaries.
- Immutable benchmark bundle `v1`, profile corpus, and 130-unit execution matrix.
- Runner artifact contract and single-Trial evaluator with hard gates, weighted scoring, outcome signatures, repetition groups, and flake calculations.
- Manual evaluator login and scripted assistance contract.

## Partial capabilities to extend

- `src/evaluator/workflow.mjs` sequences one Trial but stores state only in memory.
- `src/evaluator/host-trace.mjs` classifies supplied entries but does not establish their provenance.
- `src/evaluator/score.mjs` aggregates supplied results but does not prove campaign completeness or source consistency.
- `bin/evaluator.mjs` exposes atomic commands but not a persisted operator workflow.

## Missing capabilities

- Explicit, authorized, single-session Host evidence import with adapter/source/mapping/output digests.
- Normalized Host events and independently derived host trace, assistance, and metrics.
- Private per-run HTTP request summaries for `businessRequests` derivation.
- Owner-only persisted Trial manifests, locks, safe resume, and uncertain-write reconciliation.
- Versioned `calibration-v1` plan and release-campaign gate.
- Complete/duplicate/mixed-source Release Matrix validation and JSON/Markdown release decision.

## Implementation constraints

- Benchmark bundle `v1` remains byte-for-byte immutable.
- No global Host history scan and no background listener; V1 imports one explicitly supplied session export.
- Runner still acts only through Chrome DevTools MCP on the visible business origin.
- Oracle/control capability/private run data never enter Runner inputs or evidence directories.
- Only `host-native` evidence can make a real Trial release-eligible; every weaker trust level is diagnostic.
- Unknown events/tools, missing derivation inputs, and digest/session/run mismatches fail closed.
