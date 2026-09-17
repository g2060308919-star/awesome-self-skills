# Evidence Policy

Read this policy before acquiring sources, constructing locators, or writing `source_pack` or `evidence_claims`. Read the exact closed Schema requested by the runner. Never invent a source, Claim, Fact, topology candidate, scope module, locator field, or Schema property.

An execution decision or capability proof is not evidence. Execute, DoNotExecute, Pending, pause, confirmation, environment access, and runner readiness never receive E1/E2/E3, supply an Oracle, alter semantic status, or create NotApplicable.

## Complete the declared PRD collection before interpreting it

For an online document, enumerate the正文、表格、图片、可见评论和回复, including resolved threads. 分页读取必须到达明确的结束页（terminal page）；不能证明到达末页时，记录 `partial`、`unsupported` 或具体错误。A download, URL, filename, alt text, or detached OCR string does not prove image review: actually inspect legible labels, arrows, branches, and spatial relations before binding its image-region units. Images are reference material: their pixels, styling, visible copy, or button labels alone never become an exact acceptance requirement. Verify a business clue against effective text or route the necessary ambiguity to clarification. 评论与回复必须保留父子关系和问题上下文, so a reply such as “同意” is never treated as a standalone rule. A suggestion becomes normative only when its surrounding thread establishes adoption or the user authorizes it; recency and resolved status alone do not establish effect.

For offline attachments or pasted input, use `provided_materials` and only the supplied collection as scope. Mark channels that genuinely do not exist in that supplied set as `not_applicable`; never claim that the original online PRD or its comments were exhaustively queried. Distinguish no visible item, unread item, unavailable item, and unfinished enumeration. A source version or authoritative byte change after freezing requires the existing new-run path and must not overwrite history.

After the runner requests the first Source Pack, pass the validated request, closed channel/item observation, and exact raw/capture bytes to `stageV4PrdCollectionObservation`. The helper verifies bytes in memory and persists only safe digests and bindings. The采集技术记录不是业务事实、业务证据或业务权威; every acquired canonical unit must still be classified in `source_reviews`, and only accepted Claims or authorized Decisions may enter business truth. Collection, semantic interpretation, and business adoption are three different facts.

## Keep raw capture and semantic identity separate

Every v4 Source retains both `capture_digest` and `semantic_digest`. `capture_digest` binds the raw captured bytes. `semantic_digest` is SHA-256 over canonical JSON of `semantic_projection`; it excludes run/revision/time/path/retrieval metadata and includes only stable source identity/type, normalized semantic content/structure, and stable assets.

Canonicalize in this order: strict UTF-8, remove BOM, convert newlines to LF, normalize text to NFC, parse Markdown/HTML URLs, apply only a registered provider's signed-query allowlist, canonicalize URL scheme/host/default port/percent encoding, preserve ordinary query order unless the provider declares it insensitive, remove HTTP fragments, then remove only versioned provider expiry notices.

Do not broadly strip queries. A credential-like query from an unregistered provider is quarantined and produces `need_artifact + UNSUPPORTED_SIGNED_URL_PROVIDER`; accepted JSON/logs/diagnostics keep only redacted stable host/path/resource identity. A signed retrieval URI exists only in short-lived acquisition context and is never a stable Source or asset identity.

For a displayed source-acquisition action, use the installed `stageV4SourceAcquisitionAction` with the validated reply and the complete request set's exact material bytes, safe input records, and fully reviewed safe Source Pack. The helper derives event IDs, capture/semantic/asset digests and the resumed Source Pack before staging it. A signed retrieval URL must never be copied into the resumed Source Pack, staging JSON, a diagnostic, or any persisted input; only the short-lived resolver context may see it.

Every removed provider expiry notice enters `semantic_exclusions` with `capture_unit_id`, exact `capture_locator`, `capture_excerpt_digest`, `reason_code=provider_expiry_banner`, and `matcher_version`, all bound to the `capture_digest`. Raw retained and excluded Unicode-scalar ranges must be ordered, nonempty, nonoverlapping, and conserve every content-bearing range.

Source assets use stable `canonical_uri` plus actual `asset_digest` when acquired. A temporary retrieval URI is not stored. On expiry, refresh by stable resource ID; if unavailable, return `need_artifact + SOURCE_ASSET_UNAVAILABLE` and generate no dependent Claim.

## Review every canonical unit

Partition every retained canonical text block, table cell, and image region exactly once as normative, non-normative, or uncertain in `source_reviews`, bound to `semantic_digest`. Record the closed Schema fields `unit_id`, `content_digest`, and `classification`; the reviewed canonical unit and its classification are the persisted review basis, so do not invent an extra `basis` property. Background and personnel text is separately non-normative; a removed platform notice belongs only to the exclusion ledger.

Topology discovery is compiler-owned. Review every `topology_candidate` and dispose it exactly once as module, boundary, or evidence-backed not relevant. Every requirement has at least one primary module. Add upstream/downstream/external modules only when the source supports them. `scope_manifest` may contain only reviewed candidates; Behavior Views and interaction matrices cannot create or delete scope.

Treat a user-supplied current PRD or module description as effective for this task unless it explicitly says draft or historical. Build authority/supersession policy from source statements or an authorized Decision, never from date or appearance. Freeze the original source set and material scope.

## Use minimal sufficient locators

Each atomic Claim uses the smallest sufficient `v4SourceLocator`: one canonical text-block range, table cell, image region, or user-answer range. Domain, field path, excerpt digest, source/capture identity, and located content must agree.

Multiple unrelated atomic Claims must never reuse a whole-document locator. `document_level_claim=true` is allowed only when all six predicates hold: exactly one nonempty text block, no other structural unit, at most 512 Unicode scalars, at most 2048 UTF-8 bytes, exactly one atomic Claim in the source, and a locator covering that entire block. Otherwise create precise locators or retain a gap.

For every normative Claim create canonical `subject_descriptor` with `scope_ref`, `module_id`, `entity_type`, NFC `entity_key`, normalized JSON-Pointer `field_path`, and recursively canonical JSON `condition`. Derive `subject_key` only from that descriptor. Never use a natural-language title as subject identity.

## Use the closed semantic assertion seam

Only an accepted `domain="business"` Claim may carry compiler inputs under `semantic_value`. These are evidence assertions, not Case/View self-proof. Use only the following field names and exact item shapes; omit a family when the source does not support it:

- `relative_baseline_assertions[]`: `{reference, comparison_contract}`. The contract is exactly `{kind:"all_observable_behavior_except", exceptions:[...]}` or `{kind:"selected_dimensions", dimensions:[...], allowed_differences:[...]}`. The Claim `subject_descriptor` supplies module and scope.
- `test_value_assertions[]`: `{subject_ref, field_path, value}` on a `kind=requirement` or `kind=example` Claim. The compiler derives the value-origin kind; do not submit it here.
- `test_value_derivations[]`: `{method_id, method_version, inputs_digest, input_claim_ids, subject_ref, field_path, value}` on a derived Claim. `inputs_digest` is `sha256:<64 lowercase hex>` and `input_claim_ids` exactly equals that Claim's `parent_claim_ids`.
- `risk_review_assertions[]`: `{module_id, risk_kind, status}`, where `risk_kind` is one of the frozen nine kinds and `status` is only `formal` or `semantic_gap`. Evidence-backed exclusion uses `not_applicable_assertions`; an otherwise unsupported risk remains compiler-labelled Exploratory.
- `not_applicable_assertions[]`: `{subject, acceptance_role, reason_code, reason}`. `subject` is exactly `{kind:"formal_outcome", fact_id, condition}` or `{kind:"risk", module_id, risk_kind}`; `reason_code` is `out_of_scope`, `inapplicable_condition`, or `superseded_requirement`. The compiler derives an evidence/Decision basis. “The PRD did not mention it” is rejected.
- `ordering_assertions[]`: flow `{kind:"flow", module_id, subject_ref, locator_id}`, action `{kind:"action", module_id, flow_subject_ref, subject_ref, locator_id}`, or dependency `{kind:"outcome_dependency", predecessor_outcome_id, successor_outcome_id}`. A flow/action locator must occur in the Claim's `source_locator_ids`; the compiler derives registry IDs, ranks, basis, and Case dependencies.

Do not add sibling keys to an assertion item, mix shapes, copy these fields onto an `execution_binding` Claim, or place execution resources/readiness in them. Runtime validation rejects malformed assertions even though `semantic_value` can also hold ordinary typed business JSON.

## Assign the lowest justified evidence level

- E3: an effective authoritative source directly states the fact, or an authorized user confirms a final task-scoped rule.
- E2: a deterministic replayable derivation from E3/E2 through an allowed closed rule.
- E1: an explicit temporary assumption or an answer whose nature is undeclared.
- E0: model recall, generic practice, or unsupported risk. It is not accepted evidence.

One E1 semantic input caps its Case at Conditional. Unsupported or contradicted semantics never become Grounded or Conditional. An example is illustrative and replaceable; it is not automatically a boundary, exhaustive enumeration, or fixed expected value.

Allowed E2 routes remain closed:

- `formula` -> `test-data` or `expected-value`;
- `decision-table-instance` -> `expected-value` or `model-element`;
- `boundary-representative` -> `test-data`;
- `enumeration-complement` -> `test-data` or `model-element` only with authoritative `closed_world=true`;
- `graph-reachability` -> `model-element` only.

For `decision-table-instance`, `value` equals `rule_input.outcome` exactly. Every derivation is acyclic, replayable, and terminates in E3. Coverage technique or graph reachability never becomes a product Oracle.

## Compose sources only by subject identity

Source policy defaults to `single_source`. Use `merge_non_overlapping`, `consensus`, or `priority_order` only when explicitly declared. Conflict review is internal to the rule and keyed by canonical `subject_key`. Same-subject opposite values remain a conflict even inside one composition rule; same wording on different subjects is not consensus.

## Build atomic Facts and explicit gaps

Split independently true-or-false propositions into separate Claims. Distinguish requirements, descriptions, examples, and diagnostics. A sentence saying a capability is unsupported and out of scope normally creates two Claims: the behavior fact and independent exclusion proof. NotApplicable requires the latter; “PRD did not mention it” is not exclusion evidence.

Every Fact carries `acceptance_role` (`primary_acceptance`, `dependency_contract`, or `context_only`) and precise Claim ancestry. Mark unresolved meaning, outcome, condition, authority, or Oracle as a typed `semantic_gap`; do not guess or delete it. Keep each explicitly named unresolved in-scope scenario separate so it can produce its own formal Test Point or gap.

For exact schema `4.3.0`, every semantic-gap input includes the closed
`acceptance_impact` record described in `clarification-policy.md`. This record is
analysis metadata, not E3 evidence and not a user answer. It participates in
the semantic-root version, so changing its classification, criteria, or
rationale invalidates stale root states and actions instead of silently
reusing them.

Before handing facts to modeling, perform both trace directions. From each effective source rule, locate its Fact and eventual outcome/Test Point or an explicit gap/exclusion so valid material is not silently omitted. From each proposed Fact, condition, ordering relation, value, and result, trace back to a locator or permitted replayable derivation that supports that exact object and circumstance. A nearby or merely related citation does not pass this review.

Test-process and output-format instructions are diagnostic context, not product behavior. Environment/resource readiness is execution-plan context, not a Case Document Fact. Product behavior remains formal even when execution resources are unavailable.

Complete the nine-kind `risk_review_ledger` for every primary module: `null_or_missing`, `unknown_enum`, `api_failure`, `loading_failure`, `sync_delay`, `long_content`, `pagination`, `refresh`, and `business_permission_boundary`. Each item ends as formal, semantic_gap, exploratory, or evidence-backed not_applicable with its exact branch-specific `review_basis` and linked IDs. Never use missing PRD text alone as not-applicable proof.

Legacy v3 sources keep their original `content_digest` and locator bindings for read-only validation/migration. They are not converted in place and are never used as a live v4 fallback.
