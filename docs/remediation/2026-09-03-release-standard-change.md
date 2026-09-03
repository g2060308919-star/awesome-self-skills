# 2026-09-03 release-standard change execution record

## Authorized change

The user explicitly canceled the four-system horizontal comparison and the
external-expert benchmark. ADR-001 records the replacement release authority.
The three immutable baseline handoff documents remain unchanged.

## Red to Green evidence

| Change | RED | GREEN |
| --- | --- | --- |
| Single-system policy | Importing `benchmark/single-system-gate.mjs` failed with `ERR_MODULE_NOT_FOUND`; 0/1 passed | Five hand-calculated policy tests passed 5/5 |
| Evidence loader and CLI | Named export `loadSingleSystemRelease` was absent; 0/1 passed | Loader/CLI suite passed 7/7 and admitted 30 real PRDs while returning `insufficient_evidence` for zero captures |
| Release command | `npm run benchmark` returned the legacy expert metrics and no single-system `policy_id`; focused test failed 0/1 | After switching the package script, the focused command test passed 1/1 |

## Current evidence state

- Corpus: 30 retained public PRDs, six frozen strata, five per stratum.
- Target captures: 0/90.
- Current single-system result: `insufficient_evidence`.
- Legacy expert scorer: retained but no longer release-authoritative; its known
  historical-defect traceability defect is not represented as fixed.
- Installation: not performed.
- RC tag: not created.

Any production, release-policy, manifest, capture, or evidence change invalidates
prior candidate-binding evidence and requires a new clean-checkout run.
