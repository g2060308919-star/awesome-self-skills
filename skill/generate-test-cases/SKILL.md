---
name: generate-test-cases
description: Use when a PRD or module description must become manual functional test Cases with high accuracy, high coverage, end-to-end traceability, explicit Blocked accounting, and convergent clarification.
---

# Generate Test Cases

Produce evidence-grounded manual functional test Cases through the bundled deterministic compiler. Treat the compiler as the sole owner of validation, classification, coverage, stable identity, checkpoints, and final rendering.

## Load policy only when needed

- Read `references/evidence-policy.md` when collecting sources, resolving authority, creating locators, or writing `source_pack` and `evidence_claims`.
- Read `references/behavior-views.md` when routing accepted facts, supplying `obligation_inputs`, and checking formal Test Point coverage; read it before writing `behavior_views`.
- Read `references/clarification-policy.md` when handling `need_user_answers`, interpreting answers, delivering now, or reopening suppressed root issues.
- Read `references/case-writing-policy.md` when constructing `case_drafts`, Oracles, Testability profiles, support reviews, or user-facing Case wording.

Read the requested `scripts/schemas/<schema_ref>` before writing an artifact. Do not preload every reference or schema.

## Gate the input once

Try every supplied path, attachment, and inline source. If no requirement content is readable, ask once for an accessible PRD, module description, or pasted requirement text. If content remains unavailable, end with `INPUT_UNAVAILABLE`; do not create an empty or generic normal bundle.

If any requirement content is readable, continue. Record partial extraction gaps and uncertain regions instead of asking for every missing input before analysis. Never fill a product fact from generic domain knowledge.

## Run the private workflow

Resolve `<skill-dir>` to the directory containing this file. Create a new private absolute run directory. Invoke exactly:

```text
node <skill-dir>/scripts/test-compiler.mjs <absolute-run-directory>
```

Capture the single JSON object from stdout. Treat stderr as diagnostics only. Use no extra mode or configuration argument.

Follow this loop:

```text
Create private run directory
-> normalize sources into requested artifact
-> call private runner
-> handle need_artifact or need_revision
-> on need_user_answers, present one merged batch
-> append Decision Records or clarification control events and increment source_revision
-> call runner again
-> on finished, present generated Markdown and canonical JSON paths
```

Complete the full workflow analysis before interrupting the user:

- A — receive sources, preserve scope/version/status, and create typed locators.
- B — establish explicit source authority, scope, and supersession rules.
- C — extract atomic sourced facts and their evidence levels.
- D — build every behavior view signaled by the accepted facts.
- E — enumerate formal Test Points before drafting Cases.
- F — bind concrete Oracles, observation points, and Testability capabilities.
- G — classify every formal Test Point and independent risk hypothesis.

Always complete A–G analysis before asking clarification. The only earlier question allowed is the single inaccessible-input request.

## Handle runner replies

### Handle `need_artifact`

Open the named `schema_ref`. Create only the requested stage artifact for the returned `source_revision`, write it to the corresponding `staging` filename, and call the runner again. Preserve all accepted artifacts and compiler-owned derived files.

Use these fixed staging names:

- `source_pack` → `staging/source-pack.json`
- `evidence_claims` → `staging/evidence-claims.json`
- `behavior_views` → `staging/behavior-views.json`
- `case_drafts` → `staging/case-drafts.json`

If another stage is requested, follow its returned `schema_ref`; never invent a process surface.

### Handle `need_revision`

Group diagnostics by normalized stage, code, path, and root cause. Repair only the returned artifact and keep its `source_revision` unchanged. Re-run the compiler after each repair.

Allow at most three repair attempts for the same normalized root cause at the same stage. On the fourth identical no-progress result, stop as `PIPELINE_NO_PROGRESS`, report the last diagnostics and last valid checkpoint, and do not recast the result as a business Blocked item or compiler `fatal`.

Reset the repair counter only when the stage or normalized root cause materially changes.

### Handle `need_user_answers`

Confirm that A–G is complete. Present every returned blocker as one merged, risk-ordered clarification set. Ask once per stable root issue, show its scope and affected risk counts, and offer final, temporary, unknown, or deferred handling.

Apply the exact answer and control-event rules in `references/clarification-policy.md`. Append one immutable Source Pack revision, increment `source_revision` exactly once for the answer group, and call the runner again. Never modify an accepted revision.

### Handle `finished`

Return the generated `markdown_path` and canonical `bundle_path`, plus the reported source revision and digest. Do not ask for another confirmation. Never edit final JSON, rewrite Markdown, add a Case, improve a classification, or recompute coverage after `finished`.

### Handle `fatal`

Report the compiler diagnostics and the last valid checkpoint, if one exists. Do not repair around integrity, schema-registry, runtime, or coordination failures. Do not convert a process failure into a business Blocked item.

## Preserve adapter boundaries

- Generate only artifacts requested by the runner.
- Keep normal workflow replies on exit code 0; treat a nonzero process exit as inability to form a JSON reply.
- Keep user-visible content limited to the requested final files, a merged clarification set, `INPUT_UNAVAILABLE`, `PIPELINE_NO_PROGRESS`, or fatal diagnostics.
- Never weaken evidence, invent an Oracle, hide a formal Test Point in Exploratory, or remove a Blocked item to improve coverage.
- Never publish or document an alternate process entry point.
