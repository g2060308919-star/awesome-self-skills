---
name: generate-test-cases
description: Use when a PRD, module description, module-description, 需求文档, 模块说明, 功能变更, 规则变更, 验收标准, 交互说明, 接口契约, 粘贴需求, 测试用例, 测试点, or 测试场景 must become evidence-grounded manual functional Cases. Do not use for browser E2E, API automation, unit-test code generation, or review-only requests.
---

# Generate Test Cases

Turn authoritative requirement material into deterministic, traceable manual functional Cases with the bundled V5 compiler. The compiler owns protocol state, identities, digests, validation, provenance, rendering, and recovery. The Agent may submit only four semantic artifacts: `source_pack`, `evidence_claims`, `behavior_views`, and `case_drafts`.

## Read policy before acting

- Read `references/run-management.md` before create, inspect, advance, cancel, or resume operations.
- Read `references/evidence-policy.md` before source acquisition or writing `source_pack` and `evidence_claims`.
- Read `references/behavior-views.md` before writing `behavior_views`.
- Read `references/case-writing-policy.md` before writing `case_drafts` or presenting a Case Document.
- Read `references/clarification-policy.md` before presenting or committing clarification answers.
- Read `references/execution-closure-policy.md` before creating or confirming an Execution Plan.

Read every Schema named by a reply before submitting its action. Copy the advertised action object and selector unchanged. Never invent a field, stable ID, digest, token, run directory, or protocol record.

## Select the delivery boundary

Use `delivery_intent: "case_document"` for ordinary requests to generate Cases or test points. This path models business roles, permissions, preconditions, data conditions, actions, and Oracles, but does not require a live URL, account, test data, observer, control channel, or cleanup resource.

Use `delivery_intent: "execution_plan"` only when the user explicitly requests an execution selection. It must bind an immutable `case_document_ref`. Only this path evaluates current execution capabilities and dispositions. This Skill never starts E2E, invokes a browser or API runner, generates automation code, or records execution results.

## Create and recover a run

Resolve `<skill-dir>` to this installed Skill directory. Import the three public APIs from `<skill-dir>/scripts/test-compiler.mjs`:

```js
import {
  createV5RunDirectory,
  advanceV5Run,
  inspectV5Run
} from '<skill-dir>/scripts/test-compiler.mjs';
```

Create a durable private catalog outside the Skill installation and OS temporary storage. Call `createV5RunDirectory(catalogRoot, request)` once. The compiler atomically creates catalog genesis, the run directory, and its first reply. Keep the returned absolute run directory as the recovery reference.

Call `inspectV5Run(runDirectory)` whenever context is missing or uncertain. Inspection is read-only and returns the current persisted reply. The command-line surface is inspection-only:

```text
node <skill-dir>/scripts/test-compiler.mjs <absolute-run-directory>
```

Submit work only through `advanceV5Run(runDirectory, submission)`. Each submission contains a new `idempotency_key` plus the exact advertised action/selector and requested payload. Reusing a key with identical canonical action bytes returns the original receipt; reusing it for different bytes is an idempotency conflict.

## Acquire sources

Provide a nonempty `source_bootstrap` at create time. Declare each source as inline text, local path, HTTPS URL, or attachment reference. The compiler derives the ordered Source Requests and advertises `submit_source_batch` for the current batch.

For every request in the batch, explicitly choose `fulfilled` or `skipped_optional`. A required request cannot be skipped. Supply the exact bytes for fulfilled material; do not persist expiring retrieval credentials. The compiler owns canonicalization, content digests, Source IDs, accepted state, and batch order. New authoritative bytes or material scope changes require a new run.

If no requirement content can be acquired, report `INPUT_UNAVAILABLE`; do not create generic or empty Cases.

## Review the four semantic artifacts

At each advertised `submit_artifact` action, write only the named artifact and only fields allowed by its Schema:

1. `source_pack` records the accepted source structure and exact locator spans.
2. `evidence_claims` decomposes source truth into atomic, origin-bound candidates and resolves compiler-issued review obligations.
3. `behavior_views` supplies typed field, domain, population, permission, Oracle, and risk semantics without fabricating product truth.
4. `case_drafts` expresses independently diagnosable scenarios whose Oracles bind existing steps.

The compiler validates each artifact, derives semantic roots, and accepts or rejects it transactionally. An unaccepted submission may be corrected with a new idempotency key. Accepted bytes are immutable.

## Clarify in two phases

When questions are advertised, present only the compiler's current visible question parts and business impact. Preserve every binding from the reply.

1. Submit `preview_clarification_response` with reliably bound response units.
2. Show the deterministic preview and its impact to the user.
3. After the user confirms, submit `commit_clarification_response` with the same preview digest and an advertised confirmation token.

Partial answers change only reliably bound parts. Blank or ambiguous text changes nothing. Defer, unknown, close-for-delivery, and cloned-answer controls apply only when currently advertised and must be copied exactly. A stale preview must be regenerated. `read_only_integrity_fatal` permits inspection only and never permits clarification or semantic writes.

## Deliver the canonical result

On `finished`, use `case_document_ref` and the output manifest returned by inspection. Re-read every referenced file and verify each digest before reporting success. JSON is normative; Markdown and CSV are deterministic views of the same canonical Case Document. Never hand-edit or replace them.

Report the exact result kind and distinguish delivered Cases, retained semantic gaps, Exploratory items, NotApplicable items, and a blocked-only report. Do not claim unbounded coverage. Only Grounded, explicitly selected Cases may enter an Execution Plan projection.

On `need_artifact`, `need_revision`, `need_user_answers`, or clarification confirmation, report the current persisted state, accepted artifacts, incomplete reason, exact advertised next actions, and recovery reference. On `cancelled`, preserve the terminal run and create a compiler-issued sibling only when the user asks to resume. On any integrity fatal, return the diagnostic and recovery guidance without producing an unofficial Case document.

## Truth and authority rules

- Source truth comes only from accepted authoritative material or explicit user clarification.
- Evidence status and execution disposition are independent.
- One Case has one independently diagnosable primary business outcome.
- Every Oracle uses a typed observation and binds an existing step.
- Downstream output can never become an authoritative input.
- Compiler-owned records, identities, digests, selectors, receipts, pointers, and rendered files are never Agent-authored.
