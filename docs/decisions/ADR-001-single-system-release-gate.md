# ADR-001: Replace the comparative expert benchmark with a single-system release gate

## Status

Accepted

## Date

2026-09-03

## Context

The approved baseline required four systems, three runs per system, two external
test experts, human adjudication, historical-defect labels, and comparative
quality metrics. The three comparator identities were unavailable, and no real
external-human annotation or adjudication corpus existed. The user explicitly
changed the release standard on 2026-09-03 to cancel both the four-system
comparison and the expert benchmark.

The repository already retains 30 owner-controlled public requirement documents,
their exact source revisions, licenses, provenance, and product-specific task
scopes. They cover six frozen product strata with five documents per stratum.

## Decision

`npm run benchmark` is the release command for one system only:
`generate-test-cases`.

The release evidence requires:

- exactly 30 retained public PRDs, with five in each frozen stratum;
- exactly three target-system captures per PRD, for 90 captures total;
- a distinct capture and session identity for every run;
- one distinct `operator-observed-codex-subagent-v1` witness record per run,
  naming the root operator task and the observed sub-Agent task;
- exact source, task, compiler-source, Schema, schema-manifest, Skill, and bundle
  bindings;
- retained transcripts containing the exact Agent artifact submissions and
  normalized runner replies, with SHA-256 and Git-byte verification;
- loader-derived completion, reply-schema validation, final-bundle validation,
  and recovery for every capture—never submitter-authored pass booleans;
- two independent transcript replays against the evaluated installed-shape
  bundle, plus a completed-run CLI replay, with byte-identical output;
- an acquisition revision that is an ancestor of the final evidence commit and
  has byte-identical production source, Schema, Skill, references, and bundle;
- zero derived runner-protocol, source-revision, Schema, or
  traceability-integrity hard failures;
- a clean runtime-derived candidate binding.

Missing corpus, capture, or clean-candidate evidence returns
`insufficient_evidence`. Malformed, contradictory, forged, or hard-failure
evidence returns `fail`. Only complete evidence returns `pass`.

The release loader validates only PRD, license, provenance, task, and stratum
evidence. The legacy comparative scorer, comparator registry, machine review
reports, adjudication, and defect ledgers remain in the repository to preserve
historical tests and prior research, but they are not called or consumed by the
release path and are not release authorities.

## Removed release prerequisites

The release gate no longer requires or reports:

- `long-prompt`, `test-case-designer`, or `technique-router`;
- external-human expert identities or annotations;
- human adjudication;
- expert Test Point recall, accepted-Case agreement, historical-defect recall,
  false-grounded rate, false-blocked rate, or cross-system comparisons.

## Consequences

The new gate proves engineering integrity over a broad real-source corpus: input
provenance, protocol correctness, closed artifacts, durable replay, candidate
binding, and repeat execution. It does **not** prove that humans judge the
generated cases more accurate, more complete, or better than another system.
Release reports must not make those claims.

Every saved report carries the final candidate revision and its artifact
digests, plus deterministic manifest, corpus, capture-ledger, and capture
evidence-root digests. A report detached from those bindings has no release
meaning.

On 2026-09-03 the user explicitly accepted operator-witnessed sub-Agent runs
because this environment exposes no platform-signed Agent session receipt. This
is a process attestation, not a cryptographic identity proof. The operator must
actually observe the assigned sub-Agent reading the Skill and source, authoring
the four requested artifacts, and advancing a fresh durable run. Replay proves
the retained submissions and outputs; it does not independently authenticate
the model provider. Release evidence and final reporting must state this limit.

The previously discovered historical-defect traceability bypass remains a defect
in the legacy expert scorer. Removing that scorer from the release path prevents
it from granting release eligibility; this ADR does not claim the legacy scorer
was repaired.

Installation and an RC tag remain separate actions. They are allowed only after
the single-system gate passes on the frozen candidate and the user explicitly
authorizes installation or update.

## Alternatives considered

### Keep the original four-system expert benchmark

Rejected by the user's explicit release-standard change. It also remained
unexecutable without three frozen comparators and independent humans.

### Remove all corpus validation

Rejected. Unit, journey, metamorphic, and determinism tests alone would not prove
that the Skill can traverse varied real requirement documents.

### Treat machine agents as external experts

Rejected. Changing the release standard does not make machine identities human,
and fabricated expert evidence would remain invalid.
