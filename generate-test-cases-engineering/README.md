# generate-test-cases engineering source

This directory is the reproducible development project for the published [`generate-test-cases`](../generate-test-cases/) Skill.

It was imported from the complete tracked tree of the validated development baseline:

```text
5148c660dd4b3dbb6b453551ae4847355e1206d0
```

The project contains the modular compiler source, schemas, build pipeline, test
suites, and a 30-PRD public-pilot corpus. It also retains legacy pre-v4 replay
captures for audit history; those stale captures are not presented as v4
acceptance evidence. Nested Git metadata, `node_modules`, local worktrees,
runtime caches, temporary files, and environment secrets are intentionally
excluded.

## Verify

```bash
npm ci
npm run check
npm run test:benchmark
npm run public-pilot
```

The build output at `skill/generate-test-cases/` must remain byte-identical to the repository-level `generate-test-cases/` published shape before changes are merged.

The v4 development acceptance contract uses the engineering, benchmark-tooling,
public-pilot, validator, clean-build, and fresh-Agent pressure gates listed
below. The separately retained single-system release benchmark is not a v4
development prerequisite and makes no comparator-superiority, external-expert,
or platform-signed Agent identity claim.

## v4 architecture (bundle compiler 0.6.0; V4 artifacts 0.5.0 / schema 4.0.0)

The v4 development track keeps one private runner entry point, `advanceStrict(absoluteRunDirectory)`, two compiler-owned semantic-answer preview transaction helpers, and exactly four Agent-writable artifacts:

1. `source_pack`
2. `evidence_claims`
3. `behavior_views`
4. `case_drafts`

Existing active run identities remain 4.0/0.5. Newly created Case Document runs use the explicit 4.1/0.6 run identity so the runner can require preview without silently migrating historical runs; their accepted artifacts and official outputs stay in the compatible 4.0/0.5 V4 artifact family.

The compiler owns semantic-gap/root identities, decisions, scope verification, business outcomes, formal test points, ordering, coverage, canonical Case IDs, and delivery manifests. The Case Document path is:

```text
canonical Source → Evidence/Fact/Scope → pre-case clarification
→ sparse Behavior Views → business outcomes/formal test points → CaseSpecs
→ post-case clarification → canonical JSON + business Markdown + worksheet CSV
```

Missing environment URLs, accounts, sample-data tools, observers, or mocks never block Case Document generation. Execution resources belong only to a separately requested execution-plan run bound to an immutable `case_document_ref`; the Skill prepares a runner projection but never starts E2E execution.

## Run the private compiler

Build the installed shape from modular source, then invoke it with one existing absolute run directory:

```bash
npm run build
node skill/generate-test-cases/scripts/test-compiler.mjs /absolute/path/to/run
```

The installed module also exposes Adapter helpers. Use
`createV4RunDirectory(<catalog-root>, delivery_intent)` to obtain a
compiler-issued ID already coupled to its canonical `runs/<run-id>` directory,
`constructV4Action(reply, choice)` for displayed semantic/execution actions,
and `stageV4SourceAcquisitionAction(...)` for a complete verified acquisition
batch. Newly enrolled Case Document runs additionally use
`prepareSemanticAnswerBatchV4(...)` and `commitSemanticAnswerBatchV4(...)`:
prepare writes only compiler-owned digest-bound preview state, while commit
records the exact confirmation and stages the prepared Source Pack. All
accepted semantic revisions and lifecycle transitions still run through
`advanceStrict`; the preview helpers do not introduce another artifact compiler
or a fifth Agent-writable artifact.

To continue a cancelled run, call the same ordinary create helper with
`{ parent_run_id, creation_reason: 'resume_cancelled' }` as its second argument.
The compiler derives the original delivery intent, issues the sibling ID, and
first verifies that the named parent is durably cancelled; callers never mint
an ID, remember an intent out of band, or hand-write the lineage.

Each call emits exactly one JSON reply on stdout. Follow only the returned artifact stage or user action, write the corresponding closed-schema input under the run's `staging/` directory, and invoke the same command again. A Case Document is authoritative only when `output/current.json` points to its single manifest; stray Markdown, spreadsheet, or JSON files are never delivery fallbacks.

For repository verification use:

```bash
npm run check
npm run test:benchmark
npm run public-pilot
```

`npm run public-pilot` validates admission of the retained 30-PRD corpus for the
single-system operator-witness workflow. The legacy four-system comparator
registry remains historical evidence and does not control `captures_ready` or
the command's exit status. Benchmark CLIs exit zero only for their successful
top-level status; `invalid`, `fail`, `fatal`, `insufficient_evidence`, and
incomplete statuses exit nonzero.

## v3 migration

Existing v3 runs remain immutable and readable. Migration creates a v4 sibling with explicit lineage and a migration index; it does not rewrite the v3 directory in place. Ambiguous legacy clarification suppression is reopened or marked for review, and incomplete or digest-invalid migrations fail closed. Continue a migrated run only through its new v4 directory.
