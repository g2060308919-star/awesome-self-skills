# Public-Source Machine Pilot Design

**Date:** 2026-08-31  
**Status:** approved by the user  
**Release effect:** none; the frozen release benchmark remains fail-closed

## Goal

Build a reproducible, openly sourced PRD intake and machine-review pilot that can exercise corpus preparation before human experts are available. The pilot must make useful progress without claiming that public documents, machine labels, or machine adjudication satisfy the frozen external-expert release protocol.

## Boundary

The existing `benchmark/v1/manifest.json`, scorer, release gates, and `external-expert-corpus` meaning remain unchanged. Public-source pilot material lives under `benchmark/public-pilot/v1/` and is never loaded by the release scorer.

The pilot uses the evidence class `public-source-machine-pilot` and always reports:

```json
{
  "release_eligible": false,
  "release_status": "insufficient_evidence"
}
```

No pilot record may contain `expert_annotations`, an external-expert identity, or a claim that an agent is a human adjudicator.

## Corpus intake

Each admitted pilot item must contain:

- one owner-controlled requirements document tied to a real project;
- the exact immutable repository revision and path;
- retained source bytes and SHA-256;
- a path-independent content digest used for duplicate detection;
- a retained license file from the same revision, plus a recorded scope decision;
- acquisition time, upstream URL, repository identity, task scope, and task digest;
- exactly one of the six frozen strata;
- a machine review that records why the artifact is admitted to the pilot.

Public visibility alone is not copying or evaluation permission. Missing or inapplicable licensing keeps an item on `hold`. Examples, recruitment exercises, legacy non-governing documents, API schemas, and implementation-only artifacts are rejected.

The pilot target is at least five independently owned, licensed strict PRDs per stratum. Same-owner concentration is reported and cannot be hidden by different filenames.

## Machine review and defect leads

Two machine reviewers may independently assess intake suitability, and a machine adjudicator may resolve their intake disagreements. Their records use `reviewer_class = "machine-agent"` and are pilot metadata only.

Historical issues remain `lead` until they are frozen, shown to be an actual defect, deduplicated, and bound to an admitted pilot case whose product and requirements scope they exercise. Unbound leads never count toward the protocol minimum.

## Validation interface

`node benchmark/public-pilot/validate.mjs benchmark/public-pilot/v1/catalog.json` performs an offline, deterministic audit and emits one JSON report. It validates file identities, digests, immutable URLs, license records, task bindings, stratum counts, global content uniqueness, reviewer class, and defect bindings.

The report statuses are:

- `pilot_ready`: all six strata have at least five valid pilot items and all catalog invariants pass;
- `pilot_incomplete`: the catalog is structurally valid but one or more pilot minima are not met;
- `invalid`: an invariant, file identity, digest, reviewer boundary, or defect binding is invalid.

All three statuses retain `release_eligible = false` and `release_status = "insufficient_evidence"`.

## Baseline and capture boundary

The pilot may define frozen comparator identities and capture recipes, but it must not invent unavailable comparator implementations or captured runs. A baseline without immutable prompt/Skill contents remains `unresolved`. Captures must be genuine executions and are added only after all four comparator identities are frozen.

## Acceptance criteria

- The existing release scorer continues to return `insufficient_evidence` for the shipped synthetic pilot.
- Pilot validation cannot produce a release `pass` under any input.
- At least 30 licensed, immutable, non-duplicate strict PRD packages are present, with at least five per frozen stratum.
- Every retained byte, task, license, review, and defect record is digest-bound and offline-verifiable.
- Machine reviews and adjudication are visibly non-human and are never written into formal expert-label files.
- Unbound historical-defect leads have count zero.
- Full type checking, build, tests, Skill validation, public-pilot validation, and formal benchmark execution pass their expected states.
