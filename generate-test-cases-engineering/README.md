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

## v4 architecture (latest compiler 0.8.1 / schema 4.3.1)

The v4 development track keeps one private module entry point, `advanceStrict(absoluteRunDirectory)`, and exactly four Agent-writable artifacts:

1. `source_pack`
2. `evidence_claims`
3. `behavior_views`
4. `case_drafts`

The compiler owns semantic-gap/root identities, decisions, scope verification, business outcomes, formal test points, ordering, coverage, canonical Case IDs, and delivery manifests. The Case Document path is:

```text
canonical Source → Evidence/Fact/Scope → pre-case clarification
→ sparse Behavior Views + design assurance → business outcomes/formal test points → CaseSpecs
→ post-case clarification → source-first independent review in the same Case Draft stage
→ canonical JSON + HTML + full Table + compatibility Markdown/CSV
```

The exact `4.3.1/0.8.1` pair retains the general-quality candidate contract. It requires auditable
candidate responsibility/disposition, acceptance-impact classification for
semantic gaps, a final critical-semantic delivery gate, and a content-bound
independent review. The review reuses `case_drafts`: a valid pending submission
causes the compiler to issue the authoritative target inventory and digest, and
a completed submission repeats the same generated content with an assessment
bound to that digest. It is not a fifth artifact or public stage.

Exact `4.0.0/0.5.0`, `4.2.0/0.7.0`, and `4.3.0/0.8.0` runs keep their original contracts and
bytes. Mixed or unknown version pairs fail closed; old runs are never silently
backfilled with 4.3 metadata.

Missing environment URLs, accounts, sample-data tools, observers, or mocks never block Case Document generation. Execution resources belong only to a separately requested execution-plan run bound to an immutable `case_document_ref`; the Skill prepares a runner projection but never starts E2E execution.

## Run the private compiler

Build the installed shape from modular source, then invoke it with one existing absolute run directory:

```bash
npm run build
node skill/generate-test-cases/scripts/test-compiler.mjs /absolute/path/to/run
```

The installed module also exposes shallow Adapter helpers. Use
`createV4RunDirectory(<catalog-root>, delivery_intent)` to obtain a
compiler-issued ID already coupled to its canonical `runs/<run-id>` directory,
`constructV4Action(reply, choice)` for displayed semantic/execution actions,
and `stageV4SourceAcquisitionAction(...)` for a complete verified acquisition
batch. Use `constructIndependentReviewCompletionV4(reply, body)` to bind review
assessments and findings to the exact compiler-issued source-first inventory and
content digest. These helpers do not add a second compiler entry point: every state
transition still runs through `advanceStrict`.

The topology Adapter adds pure `discoverV4Topology(sourcePack, claims)` and
`constructV4TopologyEvidence(sourcePack, claims, review)` exports. The latter
requires explicit unit-review witnesses and evidence-backed dispositions;
it never auto-completes a review. See the shipped Evidence Policy for the closed
authorization and review contracts. These helpers construct candidates only:
source authority, active revision and acceptance still belong to the runner.

This topology interface was introduced under the `4.3.0/0.8.0` artifact
contract and remains available in `4.3.1/0.8.1`. The schema manifest does not
hash compiler code; record the actual bundle SHA-256 and Git commit alongside
review evidence. The closed `behavior_assertions` Claim input is documented
and validated at the Evidence stage for `4.3.0` and `4.3.1`; legacy `4.0.0`
and `4.2.0` filtering remains unchanged.

For first collection, `prepareV4Source({metadata, raw_response_bytes,
capture_bytes, assets, acquisition, additional_units})` returns a canonical
Source, exact structural units, review-unit digests, and safe collection digests.
The caller supplies actual raw/capture bytes and only acquired asset bytes;
the caller still reviews each unit and image. Before staging a complete Source
Pack, `validateV4SourcePackBeforeStaging(sourcePack)` checks its Schema,
canonical structure, reviews, and locator coordinates. Neither helper writes
the run or issues a recovery request. An unavailable safe asset reference can
enter the existing `source_assets` request route after the initial CLI reply;
only the CLI's `need_artifact` reply authorizes `stageV4SourceAcquisitionAction`.

For example, from a caller next to the installed `scripts/` directory:

```js
import {
  prepareV4Source, validateV4SourcePackBeforeStaging
} from './scripts/test-compiler.mjs';

const prepared = prepareV4Source({
  metadata: { source_id: 'SRC-provided', kind: 'prd', version: '1',
    status: 'effective', authority: 'user supplied', domain: 'business' },
  raw_response_bytes: new TextEncoder().encode('订单系统提交后显示成功'),
  capture_bytes: new TextEncoder().encode('订单系统提交后显示成功'),
  assets: [], acquisition: {}, additional_units: []
});
if (prepared.status !== 'prepared') throw new Error('Review preparation diagnostics');
const unit = prepared.units[0]; // Use unit.unit_id and unit.section_id in the locator.
const review = prepared.review_units[0]; // Add classification only after reading unit.text.
// Insert prepared.source, completed reviews, and locators into the requested Source Pack.
// Both checks are local; submit the pack to the CLI only after they succeed.
function checkReviewedPack(sourcePack) {
  const checked = validateV4SourcePackBeforeStaging(sourcePack);
  if (checked.status !== 'valid') throw new Error('Repair Source Pack');
  return sourcePack;
}
```

Here `sourcePack` is the complete candidate assembled under the CLI's initial
`source_pack` request; `unit` and `review` illustrate the compiler-issued
structural ID and content digest. The example leaves the semantic classification
and Source Pack assembly to the caller's actual review.

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
