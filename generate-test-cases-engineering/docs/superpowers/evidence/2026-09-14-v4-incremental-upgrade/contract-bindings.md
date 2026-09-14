# Physical contract bindings

## Compatibility decision

- Existing active V4 run identities remain `schema_version=4.0.0`, `compiler_version=0.5.0` and keep their frozen direct-append contract. Newly created/adopted Case Document runs use the explicit run identity `schema_version=4.1.0`, `compiler_version=0.6.0` and require preview. The accepted artifacts, checkpoints, bundle, Markdown, CSV, and their consumers deliberately remain the compatible V4 artifact family `schema_version=4.0.0`, `compiler_version=0.5.0`.
- The new compiler-owned sidecar uses the independent contract identifier `semantic-answer-preview/v1`. It is not a fifth Agent-authored artifact and is not added to accepted artifact profiles.
- `createV4RunDirectory` and first V4 adoption of a pristine direct directory bind the new identity and write a closed policy marker for Case Document runs. An existing 4.0/0.5 run without the marker retains the old append contract and is never silently upgraded. A 4.1/0.6 run may not remove the marker to downgrade. Execution-plan runs do not use semantic-answer preview.
- The schema manifest remains the V4 artifact registry, has bundle compiler identity `0.6.0`, and gains `semantic-answer-preview.schema.json`; old read-only 4.0/0.5 run payloads and V4 artifact payloads remain valid. Unknown V4-family run identities fail closed.

## Public Adapter interfaces

```text
prepareSemanticAnswerBatchV4(runDirectory, request) -> Promise<PreviewReply>
commitSemanticAnswerBatchV4(runDirectory, request)  -> Promise<ExistingRunnerReply>
```

`runDirectory` must be an existing canonical absolute run path. `request` is closed and validated before mutation.

### Prepare request

| Field | Type / condition | Ownership, identity, failure |
|---|---|---|
| `presentation_id` | `PRES-` SHA-256; required | copied from the current runner reply; stale => `PREVIEW_TARGET_STALE` |
| `user_message` | nonblank string; required | normalized only by the existing NFC/newline Decision rule; its digest and exact answer spans enter preview identity |
| `requests` | nonempty unique-per-question array | existing semantic actions only; `cancel_run` excluded; duplicate/mixed targets => `PREVIEW_INPUT_INVALID` |
| answer `user_message` | exact outer string | no independently editable duplicate message |

### Commit request

| Field | Type / condition | Ownership, identity, failure |
|---|---|---|
| `preview_id` | `SAP-` SHA-256; required | compiler-derived from immutable batch/bindings; missing/stale => target error |
| `confirmation_message` | nonblank user text; required | stored separately from the answer message; absence => `PREVIEW_CONFIRMATION_REQUIRED` |
| `decision` | `apply`, `revise`, `cancel_preview` | explicit control only; content change under apply => `PREVIEW_CONTENT_CHANGED` |

### Preview reply

`PreviewReply` is exactly `{kind:"prepared",value:SemanticAnswerPreview}` or `{kind:"not_prepared",runner_reply:ExistingRunnerReply}`. The closed prepared value contains:

- contract/schema identity, preview ID and digest;
- run ID, accepted revision/checkpoint digest, presentation ID/cycle digest;
- per-target action, question/root version, original answer/control, adopted resolution/authority/evidence effect, and provenance digest/span;
- `determinate_changes` for rule/target/scope/nature already known;
- `reanalyze_after_apply` with a required reason/scope and required arrays of known Fact/Test Point/Case IDs (empty when none are known; never invented IDs or counts);
- retained pending/deferred/unknown/closed question-part lists;
- exact `available_actions=["apply","revise","cancel_preview"]` and recovery text.

### Persistent records

| Record | Path | Lifecycle |
|---|---|---|
| policy marker | `derived/semantic-answer-policy.json` | created with a new run; immutable `preview_required` mode |
| active preview | `derived/semantic-answer-previews/active.json` | prepare CAS record; superseded/revised/cancelled/applied status is append-audited |
| immutable preview | `derived/semantic-answer-previews/by-id/<preview_id>.json` | schema + canonical digest checked on every commit/replay |
| immutable Source Pack candidate | `derived/semantic-answer-previews/by-id/<preview_id>.source-pack.json` | exact compiler-created append candidate, bound by the stored preview digest; never Agent-authored |
| audit entry | `transactions/semantic-answer-previews/<sequence-or-id>.json` | prepare/supersede/confirm/revise/cancel/apply observations; contains no credentials |
| apply receipt | `transactions/semantic-answer-preview-appends/<preview_id>.json` | confirmation digest, event IDs, target revision, runner-result observation; exact replay returns current runner reply |

The immutable preview record also retains the closed normalized `prepared_request`, request digest, candidate Source Pack digest, and event IDs. The accepted Source Pack remains the sole semantic append input. Apply reconstructs and verifies the candidate from that record, stages one next Source Pack, and delegates accepted mutation/recompilation to the existing runner and revision transaction.

## Decision answer projection contract

An answer may complete an ambiguous Fact only through `semantic_value.decision_answer_projection` declared by the superseded accepted source Claim. Every entry is closed and contains `fact_id`, absolute `field_path`, and `value_kind`. `value_kind="answer"` projects the exact accepted answer; `value_kind="literal"` additionally contains the literal value. The compiler rejects a missing projection, an entry owned by another Fact, an invalid field path, extra fields, or conflicting projections.

This mapping is the only new semantic bridge: accepted answer event → Decision → Decision Claim `behavior_assertions` → active Fact → Behavior Views/obligations → Case → canonical JSON/Markdown/CSV. The compiler no longer guesses generic `business_outcome`, `condition`, or `expected` assertions from an answer.

## Existing logical data carriers (no parallel schema)

| Required meaning | Reused V4 carrier | Consumer chain |
|---|---|---|
| identity/alias/exact wording | Fact subject + Claim `semantic_value` + exact locator + Case `expected` | evidence validation → views/obligations → Case → Markdown/CSV |
| cross-surface mapping | integration view, semantic subject refs, Claim structure, Oracle `surface`/`subject_ref` | obligation compiler → case semantics → canonical bundle |
| zero/null/missing/render state | accepted `semantic_value`, typed operand/test value, conditions, `expected` | evidence → input/decision obligations → Case |
| required finite values | input domain values + `test_values`/origins + distinct obligations or parameter instances | coverage → canonical Case/output |
| logical population | Fact/outcome condition and Oracle business assertion | obligation coverage → Case/output; no runtime count required |
| permissions | role-permission element + separate allow/deny outcome/obligation | role compiler → coverage → Case/output |

The independent acceptance helper projects these actual carriers; it never feeds its standard answers into production compilation.
