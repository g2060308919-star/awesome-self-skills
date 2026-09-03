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
| Independent corpus boundary | Importing `benchmark/release-corpus.mjs` failed with `ERR_MODULE_NOT_FOUND` | Focused corpus tests passed 2/2 after removing all release-path reads of comparator, review, and adjudication assets |
| Anti-forgery capture evidence | A complete 90-record layout containing arbitrary raw bytes and hand-written snapshots returned only `insufficient_evidence` and reported 90 completed captures | The same retained layout now returns `fail`, reports zero completed captures, and emits `CAPTURE_EVIDENCE_FORGED` |
| Actual runner replay | No test exercised retained submissions against the final installed-shape bundle | Focused replay tests passed 2/2: genuine artifact/reply transcript reproduced twice plus CLI recovery; a changed recorded reply was rejected |

## Current evidence state

- Corpus: 30 retained public PRDs, six frozen strata, five per stratum.
- Target captures: 0/90.
- Current single-system result: `insufficient_evidence`.
- Capture evidence contract: exact Agent submissions and normalized replies;
  completion and replay are loader-derived, not self-attested.
- Candidate/evidence report binding: final SHA, six candidate artifact digests,
  and five deterministic evidence digests.
- Legacy expert scorer: retained but no longer release-authoritative; its known
  historical-defect traceability defect is not represented as fixed.
- Installation: not performed.
- RC tag: not created.

## Operator witness authorization

The user explicitly accepted operator-witnessed real sub-Agent runs on
2026-09-03. Each run must name one of the three live assigned Agent task IDs and
carry a unique observation ID. The root operator observes source reading,
artifact authoring, runner progression, and transcript sealing. This replaces
an unavailable platform-signed session receipt but is not represented as a
cryptographic model attestation.

Any production, release-policy, manifest, capture, or evidence change invalidates
prior candidate-binding evidence and requires a new clean-checkout run.

All earlier G3/G4 records that describe four-system or expert requirements are
historical evidence superseded for release authority by ADR-001 and this user
authorization. They are not rewritten as if the old runs used the new standard.
