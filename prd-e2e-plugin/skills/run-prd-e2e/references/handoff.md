# Handoff and finalization

## Generator boundary

Accept only a canonical Generator `4.2.0` / compiler `0.7.0` Case Document whose `output/current.json`, manifest digest, and bundle digest validate. Store references in `generation-ref.json`; do not copy or edit the canonical bundle.

Accept only a separate finished Execution Plan whose `case_document_ref` is identical, whose result is `execution_ready`, whose `runner_ready` is true, and whose nonempty projection contains only `Grounded + execute + ready` items. `no_execution_selected` is a terminal no-Runner path.

## Execution profile

Before compilation, collect explicit non-production evidence, the exact projected Case IDs, test-data requirements, evidence requirements, one cleanup declaration per Case, and `pass_standard.kind=exact-expected-text`. Credentials stay only in execution memory or browser input.

## Compile

Run `compile-runner-input.mjs` with the current outer Run paths for request, generation ref, and execution profile plus the exact child artifact paths stored in the generation and Execution Plan refs. The CLI rejects substitutions and paths outside those bindings. The compiler selects and orders only projected Case IDs, copies stable IDs and expected text, validates every reference and gate, calls the bundled Runner validator, and atomically writes `runner-input.json` plus its SHA-256.

If `runner-input.json` already exists after an interrupted state transition, compile again from the same authoritative files. Reuse it only when the bytes are identical; a different deterministic result is `NEW_RUN_REQUIRED` and must not overwrite the existing input.

## Finalize

For executed runs, `finalize-run.mjs` binds its payload to the refs already stored in workflow state, reloads the stored Runner input and Execution Plan, invokes the bundled Runner's full `validateRun`, then validates the immutable case snapshot, ledger/report boundary, lineage, counts, unique HTML path, and ordered checkpoint trace before writing `final-index.json`. It preserves Runner results and never persists `chatTableMarkdown`. For no-execution runs it validates the canonical no-execution manifest/artifact and records null Runner fields plus the Case/Plan references before the terminal transition.
