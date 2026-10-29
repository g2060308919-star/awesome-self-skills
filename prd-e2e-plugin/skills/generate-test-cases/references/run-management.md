# Private Run Management

Read this policy before creating, recovering, resuming, repairing, replacing, or cancelling a run. Run management is private Adapter orchestration, not a fifth semantic artifact or a public interface.

## Keep one durable identity

Store a run in a persistent private directory owned by the current task, never under the Skill installation or OS temporary storage. The canonical absolute directory path is its durable identity. A spelling with `..` that resolves to the same path is the same run.

Create a fresh v4 run only through the installed bundle's private `createV4RunDirectory(<catalog-root>, delivery_intent)` Adapter helper. It returns only after the compiler-issued ID is durably coupled to the canonical `<catalog-root>/runs/<run-id>` directory needed for sibling lookup. A process crash may leave an unreturned empty orphan directory, but never a usable run with a partial identity. Do not preselect an ID, rename or move the returned directory, or hand-write `run-instance.json`.

For a cancelled parent, pass the closed
`{ parent_run_id, creation_reason: 'resume_cancelled' }` object as the same
helper's second argument. Copy the parent ID from the cancelled reply/recovery
context. The helper verifies that parent, derives its original delivery intent,
issues the sibling ID, and durably writes the lineage; never call a lower-level
constructor, supply a sibling ID, or choose a new intent yourself.

Use `run-catalog.json` only as a relationship index. Record real canonical directories and compiler-issued IDs, delivery intent, immutable source/scope identity, current lifecycle, last reply, and predecessor/successor links. The compiler's validated checkpoint/current manifest remains authority; a catalog row never overrides it.

For every recovery or resume, invoke the runner on the same absolute directory first. Do not infer the next stage from chat history, directory listing, a disposable checkpoint, or a highest-looking revision. Validate the returned recovery references before appending anything.

Treat only compiler-accepted events in the recovered checkpoint as submitted. Preserve accepted answers whose exact root version and scope still apply, preserve every pending part, and leave staging-only attempts unaccepted. If the root version, affected scope, or current presentation changed, retain the older answer for audit but do not replay or silently rebind it. Never submit the same accepted answer again merely because conversation context was lost.

Use the current `4.3.3/0.8.3` protocol. An incompatible identity or artifact
stops with a diagnostic; keep its bytes unchanged. No compatibility reader,
version choice, upgrade, downgrade, or migration operation is available.
Current task revisions, exact question bindings, external provider contracts,
and source/collection digests remain mandatory. A change to those task inputs
is not a change of skill protocol.

## Preserve append-only revisions

Accepted Source Packs, Decisions, semantic controls, execution actions, lifecycle events, presentations, checkpoints, and preview history are append-only. One accepted user response advances the source revision once. Do not edit or delete an accepted revision, reorder events, reuse an event sequence, or combine unrelated user messages into a fabricated event.

A candidate append stays in staging until all schema, presentation/version, digest, sequence, and semantic checks pass. Failure changes no committed revision. Checkpoints are written from validated state and use write-temp-then-rename; their exact canonical bytes are digest-bound recovery material.

For a `4.3.2` acquired resource, the compiler keeps one private, digest-bound acquisition base per revision. Retry an unaccepted semantic candidate in staging; the runner verifies that base, its receipts, events, and source identity before reusing the acquisition. The Agent never creates or edits the base file. A missing or damaged base fails closed.

Before any revision that invalidates ready output, commit a current tombstone/stale state. A higher non-ready revision always dominates an older ready pointer. Crash recovery completes or rolls forward the journaled transition; it never restores old ready/current merely because those files still exist.

A staging-only pending or completed independent review is not accepted
recovery state. Reinvoke the runner: a pending review reproduces the same
compiler-issued target/digest request, while a completed accepted review is
valid only for the identical generated-content digest. A newer non-ready
revision revokes current authority even when an older ready manifest remains on
disk.

`output/current.json` is the only authoritative delivery manifest. Finished recovery re-reads it and all referenced artifact digests. Stray Markdown/CSV/JSON files, older current files, or partially written output are never official delivery.

## Repair without rewriting history

Fix an unaccepted artifact in staging at the same candidate revision. Accepted
artifacts remain immutable. Current semantic answers use the advertised Decision
append and recheck downstream stages.

For current Case Document Evidence repair, stage the next Source Pack with
exactly one digest-bound `evidence_claims` artifact repair and the next Evidence
candidate together. The existing repair transaction validates and commits both
atomically, without requiring a new business answer. Other accepted stages have
no generic repair action; report that limitation with the last valid checkpoint
instead of editing accepted files or fabricating an answer. Stage preparation is
not authorization to submit an Evidence repair or bypass its controlled binding.

An original source-byte change, new authoritative source, or material scope change is not a repair; it requires `NEW_RUN_REQUIRED`, preserving the old run and creating a linked sibling. A business answer is a Decision, never an artifact repair.

Count no-progress repairs by normalized stage and root cause. Permit three repair attempts. The fourth identical no-progress result is `PIPELINE_NO_PROGRESS`; administrative revision/carry-forward does not reset the counter.

## Cancel at every user wait

`cancel_run` is a real schema-valid action in all four waiting phases: source acquisition, semantic clarification, execution closure, and final confirmation. Bind exact run ID plus phase/version returned by the latest reply. Repeating the same cancellation is idempotent and cannot overwrite an earlier valid delivery manifest.

A cancelled run is terminal for appends. To continue, use the ordinary
`createV4RunDirectory` entry with the closed resume argument above. The sibling
records the verified parent lineage but begins as a fresh run at the returned
source request. It does not copy, mutate, or revive the cancelled journal.

## Maintain safe sibling relationships

For changed source/scope, create and successfully identify the new run before atomically linking old `superseded_by` and new `supersedes` rows. For execution `reopen_semantic_question`, create the sibling Case Document durably before marking the execution run `superseded_by_semantic_reopen`. Concurrent replays converge on the same transaction/sibling; same identity with different payload is a conflict.

Never reset, restore, delete, or repurpose another run. Preserve completed, failed, superseded, and cancelled histories for audit. A catalog disagreement with compiler identity is a process error; report it instead of selecting whichever directory looks newer.

## Material verification followed by semantic rejection

Invoke the runner on the same run first. It completes any fully materialized
revision transaction before reconciling material ownership. An `acquired`
material state proves bytes and receipt bindings, not acceptance of the answer
or advancement of the formal checkpoint. A verified older material revision
can legitimately support a later semantic revision.

For a legal Evidence repair, build the next Source Pack from the last accepted
Source and append the existing digest-bound `artifact_repairs` entry. Include
only accepted events and Decisions; leave rejected candidate answers in audit.
The compiler keeps versioned private candidate contexts and immutable material
bases under `transactions/source-acquisition`. They are not Agent artifacts.
Same-candidate retries reuse their bound requests/receipts; different candidates
at the same revision retain separate bases. Keep all historical
`derived/source-acquisition-base-rNNN.json` files unchanged.

Legacy acquired-but-unaccepted state can be recovered only when accepted
history, the immutable acquisition base, original request cycles, actual
acquisition receipts and collection/review bindings uniquely prove the accepted
material prefix. Missing, altered, cross-run or ambiguous evidence produces an
integrity diagnostic and preserves the scene. Report that diagnostic and the
missing proof; do not delete state, edit a revision number, synthesize receipts,
rebind an old answer, or rewrite accepted history to force progress.
