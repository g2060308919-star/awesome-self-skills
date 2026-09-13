# generate-test-cases V5 engineering source

This directory is the reproducible development project for the published
[`generate-test-cases`](../generate-test-cases/) Skill. The V5 development
specification is the sole normative implementation and acceptance contract;
the problem record and technical design are background context only.

## Operational contract

- Schema `5.0.0`; compiler `0.6.0`.
- Exactly three public APIs: `createV5RunDirectory`, `advanceV5Run`, and
  `inspectV5Run`.
- The direct CLI accepts one absolute run directory and performs inspection
  only.
- Agent write authority is limited to `source_pack`, `evidence_claims`,
  `behavior_views`, and `case_drafts`.
- JSON is the canonical Case Document; Markdown and CSV are deterministic
  projections.
- This Skill prepares manual functional Cases and an explicitly requested
  Execution Plan. It never runs browser/API E2E, generates automation code, or
  records execution results.

V3/V4 operational modules, schemas, dispatch, migration paths, tests, and
benchmark commands are not part of this release. Historical evidence remains
in Git as non-operational audit history.

## Verify

```bash
npm ci
npm run build
npm run check
npm run test:benchmark
npm run public-pilot
npm audit --audit-level=high
```

The manifest-only fixture runner executes exactly 105 leaves across C01–C16.
The build output at `skill/generate-test-cases/` must be byte-identical to the
repository-level `generate-test-cases/` published shape before merge.

## Use the compiler

Import the three APIs from `skill/generate-test-cases/scripts/test-compiler.mjs`.
Create a durable private catalog outside the Skill installation and OS
temporary storage. Copy only actions and selectors advertised by the current
reply; submit mutations through `advanceV5Run`. Use `inspectV5Run` or the
inspection-only CLI for recovery:

```bash
node skill/generate-test-cases/scripts/test-compiler.mjs /absolute/path/to/run
```

See the published Skill's six reference policies for source acquisition,
evidence, behavior contracts, clarification, Case writing, execution closure,
and crash-safe run management.
