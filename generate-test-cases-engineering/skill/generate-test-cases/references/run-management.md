# Run management

The durable catalog root and compiler-issued run directory are the recovery boundary. Never move or rename a run after creation.

## Public API

- `createV5RunDirectory(catalogRoot, request)` atomically publishes catalog genesis and the first run state.
- `inspectV5Run(runDirectory)` verifies storage and returns the current reply without writing.
- `advanceV5Run(runDirectory, submission)` verifies the current reply selector, applies one action transaction, and returns the committed reply.

The command-line entry accepts exactly one absolute run directory and performs inspection only. Mutation through a staging file or command-line flag is not supported.

## Create request

The request selects `case_document` or `execution_plan`, declares output language and material scope, and contains a nonempty `source_bootstrap`. Execution selection also includes the immutable `case_document_ref`. Resume creation names one verified cancelled parent and uses the compiler-derived delivery intent and inheritance projection.

The compiler owns run IDs, paths, catalog rows, transaction IDs, receipts, checkpoints, semantic roots, pointers, selectors, and all digests. Callers never compute or edit them.

## Advance and idempotency

Copy the complete advertised action and selector from the latest verified reply. Add a caller-owned `idempotency_key` that has not been used in that run. The key is scoped independently for normal and integrity-quarantine transactions.

If an identical canonical action is retried with the same key, the original committed receipt and reply are returned. Different action bytes with the same key produce `IDEMPOTENCY_CONFLICT` and no semantic commit. A stale, foreign, or unadvertised selector produces a protocol error.

## Storage and recovery

Append-only content-addressed records are authoritative. Mutable current pointers are compare-and-swap projections over verified records, never authority by themselves. A restart validates the operational chain, replays any committed-but-unpublished receipt, and then advertises the exact current action set.

Normal trusted failures commit a fatal incident to the run chain. When the trusted operational chain cannot be established, the compiler writes an independent integrity-quarantine transaction without changing the normal pointer. Inspection reports `read_only_integrity_fatal`; no mutation action is advertised.

## Cancel and resume

Cancellation is a terminal, idempotent compiler transaction. No action may append to a cancelled run. A resumed run is a new compiler-issued sibling with an explicit parent edge and a verified inheritance projection. Confirm-stage cells are not resumable; the compiler selects the nearest valid active cell. The child never uses its parent as an authoritative source artifact.
