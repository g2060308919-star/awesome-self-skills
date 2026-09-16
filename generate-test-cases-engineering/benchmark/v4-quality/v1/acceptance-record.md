# Acceptance record — 2026-09-16

## Implementation identities

- Direct pre-change updated-V4 baseline: `3464c670c8cb185f3803ecc767219af7a20a2c6d`.
- Original-V4 reference: `b9fad4c35acbd37c9531417fae136cd18f9e0afa`.
- Candidate: current uncommitted workspace; bind its exact file digests at execution time. No commit, push, publish, or global installation was performed.

## Actual evidence collected

| Evidence | Result | Scope |
| --- | --- | --- |
| `npm run check` | pass: 1471/1471 main tests and 2/2 repeatability tests | Type check, build check, deterministic compiler/recovery/artifact tests; includes 100 fresh installed-shape byte-identical runs. |
| benchmark test suite | pass | Offline benchmark/replay program behavior; no live model generation. |
| `npm run public-pilot` | `pilot_ready`; `release_eligible=false`; `release_status=insufficient_evidence` | Public-pilot capture validation only. |
| B2B E2E runner tests | pass: 51/51; runner directory unchanged | Downstream consumer isolation, not target-system execution. |
| A19–A21 directed tests | pass | Full Table/HTML projection, escaping, result states, frozen old 4.2 hashes, complete-family replay, mixed-family rejection. |
| A17/A18/A22 transaction and regression coverage | pass in the main suite | Accepted/pending/staging recovery, higher non-ready revision, cancellation/sibling behavior, original compiler boundaries. |

## Required evidence not yet collected

| Acceptance | Status | Missing condition and impact |
| --- | --- | --- |
| A01–A16 raw-input behavior | `not_run` | No clean-context model generation was executed against this frozen corpus, so program/policy tests do not prove the Agent will apply the guidance. |
| A23 independent candidate review | `not_run` | Requires a fresh review context that has not seen the oracle or implementation history. |
| A24 before/after comparison | `not_run` | Requires the direct baseline and candidate to run the full matrix with the same model, configuration, tools, answer semantics, and retained turns. |
| F01/F03/F04/F07 three-run requirement | `not_run` | No authorized independent model contexts are available in this local test harness. |
| Real target business system | out of scope | Generation acceptance does not execute a business system, request credentials, or configure a proxy. |

Conclusion: local implementation candidate and deterministic program validation are complete. Release acceptance is **not verified** because the mandatory independent raw-input generation and baseline comparison have not run. This record must not be changed to pass until the retained evidence exists.
