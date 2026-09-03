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
- The release-corpus validator reads only the bound PRD, license, provenance,
  task, and stratum evidence. Comparator registries, review reports, expert
  labels, and adjudication files are neither read nor required.
- `captures.json` must contain 90 distinct target-system records. Every record
  binds its source and task digests, acquisition revision, five candidate
  artifact digests, one operator witness, and one transcript descriptor.
- A transcript contains the exact four Agent-writable artifact submissions and
  the normalized runner reply after each submission. Completion, reply-schema
  validity, final bundle validity, recovery, and bundle digests are derived by
  the loader; they are never accepted as submitter booleans.
- The loader independently replays every transcript twice against the evaluated
  installed-shape bundle and also re-invokes the CLI on the completed durable
  run. The acquisition revision must be an ancestor whose production artifacts
  are unchanged. Absolute paths, parent traversal, symlinks, hardlinks, path
  reuse, unknown fields, digest drift, duplicate IDs/sessions/repeats, reply
  drift, and candidate drift fail closed.
- A successful report includes the final candidate SHA and artifact digests plus
  manifest, corpus, ledger, transcript-root, reply-sequence, and bundle evidence
  digests.

## Interpretation

`pass` means the target completed all 90 source-bound runs without an observed
engineering hard failure and every transcript replayed byte-identically. It is
not an expert quality score and makes no comparative-superiority claim.

The user accepted live operator observation in place of a platform-signed Agent
receipt. `operator_witness` records the root operator and observed sub-Agent task
for every fresh run. This proves the declared collection procedure only through
the operator's attestation; the offline gate cannot cryptographically
authenticate model execution. It must never be described as platform-signed.

Use `benchmark/operator-capture.mjs` while the root task observes the assigned
sub-Agent. `start` creates a fresh durable run and `submit` records each exact
artifact and runner reply; only `finished` produces `transcript.json`.

The checked-in ledger contains 90 operator-witnessed runs: 30 distinct PRDs with
three fresh captures each. The offline verifier accepts only the three assigned
Agent task IDs, and the capture builder also enforces the recorded stratum
assignment. Synthetic journey fixtures, self-attested snapshots, and arbitrary
raw output must never be copied into this ledger.
