# Generate Test Cases single-system release corpus v1

This is the release evidence root selected by ADR-001. It evaluates only
`generate-test-cases`; it performs no comparator run and consumes no expert or
adjudicator label.

## Command

```bash
npm run benchmark
```

The command emits one JSON report. Its status is exactly `pass`, `fail`, or
`insufficient_evidence`.

## Frozen requirements

- `manifest.json` fixes the policy, system, six strata, 30-case total, and three
  repeats per case.
- The bound public catalog retains the exact PRD, license, provenance, and task
  bytes. It must contain five admitted cases in every stratum.
- `captures.json` must contain 90 distinct target-system records. Every record
  binds its source and task digests, five candidate artifact digests, one raw
  output descriptor, and one run-snapshot descriptor.
- Every run snapshot must record a completed terminal state, the durable run
  digest, matching final/replay bundle digests, and the four closed hard-failure
  observations.
- The loader reads and hashes every referenced evidence file. Absolute paths,
  parent traversal, symlinks, hardlinks, path reuse, unknown fields, digest drift,
  duplicate IDs, duplicate sessions, duplicate repeats, and candidate drift fail
  closed.

## Interpretation

`pass` means the target completed all 90 source-bound runs without an observed
engineering hard failure and every durable run replayed byte-identically. It is
not an expert quality score and makes no comparative-superiority claim.

The initial checked-in ledger is intentionally empty, so the correct status is
`insufficient_evidence` until genuine runs are retained. Synthetic pilot outputs
must never be copied into this ledger.
