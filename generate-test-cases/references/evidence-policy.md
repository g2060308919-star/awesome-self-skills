# Evidence Policy

Read this policy before acquiring sources, constructing locators, or writing `source_pack` or `evidence_claims`. Read the exact closed Schema requested by the runner. Never invent a source, Claim, Fact, topology candidate, scope module, locator field, or Schema property.

An execution decision or capability proof is not evidence. Execute, DoNotExecute, Pending, pause, confirmation, environment access, and runner readiness never receive E1/E2/E3, supply an Oracle, alter semantic status, or create NotApplicable.

## Complete the declared PRD collection before interpreting it

For an online document, enumerate the正文、表格、图片、可见评论和回复, including resolved threads. 分页读取必须到达明确的结束页（terminal page）；不能证明到达末页时，记录 `partial`、`unsupported` 或具体错误。A download, URL, filename, alt text, or detached OCR string does not prove image review: actually inspect legible labels, arrows, branches, and spatial relations before binding its image-region units. Images are reference material: their pixels, styling, visible copy, or button labels alone never become an exact acceptance requirement. Verify a business clue against effective text or route the necessary ambiguity to clarification. 评论与回复必须保留父子关系和问题上下文, so a reply such as “同意” is never treated as a standalone rule. A suggestion becomes normative only when its surrounding thread establishes adoption or the user authorizes it; recency and resolved status alone do not establish effect.

For offline attachments or pasted input, use `provided_materials` and only the supplied collection as scope. Mark channels that genuinely do not exist in that supplied set as `not_applicable`; never claim that the original online PRD or its comments were exhaustively queried. Distinguish no visible item, unread item, unavailable item, and unfinished enumeration. A source version or authoritative byte change after freezing requires the existing new-run path and must not overwrite history.

After the runner requests the first Source Pack, pass the validated request, closed channel/item observation, and exact raw/capture bytes to `stageV4PrdCollectionObservation`. The helper verifies bytes in memory and persists only safe digests and bindings. The采集技术记录不是业务事实、业务证据或业务权威; every acquired canonical unit must still be classified in `source_reviews`, and only accepted Claims or authorized Decisions may enter business truth. Collection, semantic interpretation, and business adoption are three different facts.

Prepare each first Source with the installed `prepareV4Source({metadata, raw_response_bytes, capture_bytes, assets, acquisition, additional_units})`. The fields `raw_response_bytes` and `capture_bytes` are exact `Uint8Array` values from the collection, and may differ when the declared capture is extracted from a tool response. `assets` contains only actually fetched `{retrieval_uri, bytes}` pairs; keep signed retrieval URIs in memory. `additional_units` is empty until an image region or user statement has actually been reviewed under its existing contract. The helper returns a safe `source`, canonical `units`, `review_units` containing mechanical content digests, and safe collection digests. It does not classify any unit. Use each returned `unit_id` and coordinates in locators, including for non-normative retained units that topology discovery must consume, and set each `review_units` entry's `classification` after actual review. Then run `validateV4SourcePackBeforeStaging(sourcePack)` and stage only when its status is `valid`; this check also verifies that topology discovery can consume the reviewed source structure. The CLI still owns final acceptance. A failed local preparation is a diagnostic, not a compiler-issued request or resume reference.

An unavailable image can be inventoried as a safe `source_assets` entry with status `unavailable` and a matching unavailable image observation. Stage the Source Pack with the original `source_pack` reply. The compiler may then issue a real `need_artifact` request from `source_assets`; use its exact request and `stageV4SourceAcquisitionAction` to provide bytes, then actually inspect the image before supplying `asset_review`. A signed URL is never a stable asset ID, and a refreshed signature alone does not imply changed content. Without a platform refresh route, use the advertised safe upload path or report the missing material. Explicit user authorization to exclude images changes only the declared collection scope and does not remove textual image-related business requirements. No authorization means an unavailable image remains unavailable, not excluded.

## Keep raw capture and semantic identity separate

Every v4 Source retains both `capture_digest` and `semantic_digest`. `capture_digest` binds the raw captured bytes. `semantic_digest` is SHA-256 over canonical JSON of `semantic_projection`; it excludes run/revision/time/path/retrieval metadata and includes only stable source identity/type, normalized semantic content/structure, and stable assets.

Canonicalize in this order: strict UTF-8, remove BOM, convert newlines to LF, normalize text to NFC, parse Markdown/HTML URLs, apply only a registered provider's signed-query allowlist, canonicalize URL scheme/host/default port/percent encoding, preserve ordinary query order unless the provider declares it insensitive, remove HTTP fragments, then remove only versioned provider expiry notices.

Do not broadly strip queries. A credential-like query from an unregistered provider is quarantined and produces `need_artifact + UNSUPPORTED_SIGNED_URL_PROVIDER`; accepted JSON/logs/diagnostics keep only redacted stable host/path/resource identity. A signed retrieval URI exists only in short-lived acquisition context and is never a stable Source or asset identity.

For a displayed source-acquisition action, use the installed `stageV4SourceAcquisitionAction` with the validated reply and the complete request set's exact material bytes, safe input records, and fully reviewed safe Source Pack. The helper derives event IDs, capture/semantic/asset digests and the resumed Source Pack before staging it. A signed retrieval URL must never be copied into the resumed Source Pack, staging JSON, a diagnostic, or any persisted input; only the short-lived resolver context may see it.

The reply Schema accepts the compiler's `quality` diagnostic category for required independent review. This fixes reply validation only; it never waives or weakens the independent review gate.

Every removed provider expiry notice enters `semantic_exclusions` with `capture_unit_id`, exact `capture_locator`, `capture_excerpt_digest`, `reason_code=provider_expiry_banner`, and `matcher_version`, all bound to the `capture_digest`. Raw retained and excluded Unicode-scalar ranges must be ordered, nonempty, nonoverlapping, and conserve every content-bearing range.

Source assets use stable `canonical_uri` plus actual `asset_digest` when acquired. A temporary retrieval URI is not stored. On expiry, refresh by stable resource ID; if unavailable, return `need_artifact + SOURCE_ASSET_UNAVAILABLE` and generate no dependent Claim.

## Review every canonical unit

Partition every retained canonical text block, table cell, and image region exactly once as normative, non-normative, or uncertain in `source_reviews`, bound to `semantic_digest`. Record the closed Schema fields `unit_id`, `content_digest`, and `classification`; the reviewed canonical unit and its classification are the persisted review basis, so do not invent an extra `basis` property. Background and personnel text is separately non-normative; a removed platform notice belongs only to the exclusion ledger.

Topology discovery is compiler-owned. Review every `topology_candidate` and dispose it exactly once as module, boundary, or evidence-backed not relevant. Every requirement has at least one primary module. Add upstream/downstream/external modules only when the source supports them. `scope_manifest` may contain only reviewed candidates; Behavior Views and interaction matrices cannot create or delete scope.

### Public topology construction contract

Both helpers are synchronous pure functions exported by `scripts/test-compiler.mjs`. They read the supplied JSON snapshot, never read or write a run, and throw `TypeError` on invalid input. Error messages contain topology input codes or existing scope diagnostic codes; these exceptions are not new runner reply statuses. Use the current candidate Source Pack and its matching Claims, with exactly the existing `source-pack.schema.json` and Evidence `$defs/v4EvidenceClaim` shapes. Source unit reviews, direct Claim locators and explicit topology authorizations are validated. Success does not establish source authority, receipt validity, E2 derivation validity, or active revision acceptance: those remain runner checks.

1. Call `discoverV4Topology(sourcePack, claims)`. It returns the existing Evidence `topologyDiscovery` shape, including compiler-issued candidate IDs, digest and scanned unit inventory. Source-backed semantic hints use `topology_authorization` below; candidates extracted from wording are suggestions for review, not business scope decisions. An empty discovery is not permission to invent a primary module. Add only a supported semantic hint and rediscover, or report the unresolved source/scope issue.
2. Actually review every normative/uncertain source unit and every candidate. Construct `review` with exactly `{discovery_digest, primary_surface, topology_review, topology_dispositions}` using the returned digest and candidate IDs. `topology_review` uses the existing Schema and records the units actually reviewed plus `unresolved_candidate_ids`; do not copy the scanned inventory as a claim that review happened. Each disposition uses the existing `topologyDisposition` Schema. Business module references are source-backed labels shared with the Claims/Facts, not compiler-generated candidate IDs.
3. Call `constructV4TopologyEvidence(sourcePack, claims, review)`. It returns exactly `{topology_discovery, topology_review, topology_dispositions, scope_manifest}`. Merge only these fields into the same candidate `evidence_claims`. Keep Claims, Facts, gaps, interaction reviews and acceptance assignments intact. Submit via the runner's existing requested staging artifact path and call the runner again. Never write accepted, derived or output history.

The constructor recomputes discovery, rejects stale digests, incomplete/duplicate review witnesses, unknown/duplicate/omitted candidates, and dispositions without matching source-backed authorization. It never fills missing review records or infers authorization from dispositions. Every Claim cited by a disposition must explicitly support that same candidate, module reference/role or boundary. For `not_relevant`, use the source-backed Claim basis; these helpers do not manufacture effective scope Decisions. A change to source or semantic hints requires rediscovery and review of the current snapshot. The topology digest binds discovery content, not run/revision identity; `advanceStrict` remains responsible for current-run and revision checks.

Treat a user-supplied current PRD or module description as effective for this task unless it explicitly says draft or historical. Build authority/supersession policy from source statements or an authorized Decision, never from date or appearance. Freeze the original source set and material scope.

## Use minimal sufficient locators

Each atomic Claim uses the smallest sufficient `v4SourceLocator`: one canonical text-block range, table cell, image region, or user-answer range. Domain, field path, excerpt digest, source/capture identity, and located content must agree.

Multiple unrelated atomic Claims must never reuse a whole-document locator. `document_level_claim=true` is allowed only when all six predicates hold: exactly one nonempty text block, no other structural unit, at most 512 Unicode scalars, at most 2048 UTF-8 bytes, exactly one atomic Claim in the source, and a locator covering that entire block. Otherwise create precise locators or retain a gap.

For every normative Claim create canonical `subject_descriptor` with `scope_ref`, `module_id`, `entity_type`, NFC `entity_key`, normalized JSON-Pointer `field_path`, and recursively canonical JSON `condition`. Derive `subject_key` only from that descriptor. Never use a natural-language title as subject identity.

## Use the closed semantic assertion seam

Only an accepted `domain="business"` Claim may carry compiler inputs under `semantic_value`. These are evidence assertions, not Case/View self-proof. Use only the following field names and exact item shapes; omit a family when the source does not support it:

- `behavior_assertions[]`: exactly `{fact_id, field_path, value}`. `fact_id` must resolve to one Fact whose `claim_ids` contains this Claim. `field_path` is one of `/business_outcome`, `/condition`, `/expected`, `/partitions/<index>/expected`, `/partitions/<index>/value`, `/partitions/<index>/bounds/{lower|upper|inclusive}`, `/surfaces/<index>/assertion`, or `/semantic_effects/<index>/{kind|subject|before|after}`, where `<index>` is canonical zero-based decimal without leading zeroes. `value` must equal the exact source-backed value later submitted at that Behavior field. One Claim supplies at most one value for the same Fact and field; duplicate or conflicting entries are rejected at the Evidence stage. This assertion authorizes only field-level comparison by the compiler. It does not create the Fact, Behavior element, Test Point, Case, or evidence binding.
- `relative_baseline_assertions[]`: `{reference, comparison_contract}`. The contract is exactly `{kind:"all_observable_behavior_except", exceptions:[...]}` or `{kind:"selected_dimensions", dimensions:[...], allowed_differences:[...]}`. The Claim `subject_descriptor` supplies module and scope.
- `test_value_assertions[]`: `{subject_ref, field_path, value}` on a `kind=requirement` or `kind=example` Claim. The compiler derives the value-origin kind; do not submit it here.
- `test_value_derivations[]`: `{method_id, method_version, inputs_digest, input_claim_ids, subject_ref, field_path, value}` on a derived Claim. `inputs_digest` is `sha256:<64 lowercase hex>` and `input_claim_ids` exactly equals that Claim's `parent_claim_ids`.
- `risk_review_assertions[]`: `{module_id, risk_kind, status}`, where `risk_kind` is one of the frozen nine kinds and `status` is only `formal` or `semantic_gap`. Evidence-backed exclusion uses `not_applicable_assertions`; an otherwise unsupported risk remains compiler-labelled Exploratory.
- `not_applicable_assertions[]`: `{subject, acceptance_role, reason_code, reason}`. `subject` is exactly `{kind:"formal_outcome", fact_id, condition}` or `{kind:"risk", module_id, risk_kind}`; `reason_code` is `out_of_scope`, `inapplicable_condition`, or `superseded_requirement`. The compiler derives an evidence/Decision basis. “The PRD did not mention it” is rejected.
- `ordering_assertions[]`: flow `{kind:"flow", module_id, subject_ref, locator_id}`, action `{kind:"action", module_id, flow_subject_ref, subject_ref, locator_id}`, or dependency `{kind:"outcome_dependency", predecessor_outcome_id, successor_outcome_id}`. A flow/action locator must occur in the Claim's `source_locator_ids`; the compiler derives registry IDs, ranks, basis, and Case dependencies.
- `topology_authorization`: exactly `{candidates:[...], reviewable_interaction_cells:[...]}`. Each candidate has `{kind, label, locator_ids, disposition}` plus only the fields for its branch: `module` requires `kind="module_mention"`, `module_ref` and `role` (`primary`, `upstream`, `downstream`, `external`); `boundary` requires `kind="boundary_signal"`, `from_module_ref`, `to_module_ref`, `channel` and `acceptance_scope="contract_only"`; `not_relevant` has no extra fields and allows either kind. A boundary label follows the existing directional form `from label → to label`. `locator_ids` is a nonempty unique set drawn from this Claim's locators or its explicit parent-Claim ancestry and must resolve in discovery. Do not supply `candidate_id`, hashes or a verified context. Each interaction cell is exactly `{module_ids:[...], dimension}`, with a nonempty unique module set and dimension from `shared-entity`, `role`, `client`, `interface-event`, `time`, `concurrency`, `side-effect`. Arrays may be empty when genuinely inapplicable. These declarations express source interpretation for runner verification, never automatic evidence promotion; unsupported E1 assumptions and execution-binding Claims cannot authorize topology. Review source meaning before drafting the declaration, independently of the disposition being validated.

Do not add sibling keys to an assertion item, mix shapes, copy these fields onto an `execution_binding` or unsupported E1 Claim, or place execution resources/readiness in them. Runtime validation rejects malformed assertions even though `semantic_value` can also hold ordinary typed business JSON.

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

A project or component standard is normative only when its version, scope, authority, and applicability to the current run are established. Presence in the repository, familiarity, or a newer date is not enough. If applicable sources conflict and no source-backed or authorized priority rule resolves them, retain a semantic gap. After the source set is frozen, newly supplied authoritative bytes require the existing new-run path.

A design or implementation recommendation remains unadopted and routes to a semantic gap or clearly labelled `Exploratory` item until an authorized answer establishes the business rule and exact scope. Never extrapolate product truth from likely implementation. A Decision represents only the currently advertised, explicitly bound action; do not forge an ID, reuse an old presentation, or borrow a Decision from another root or run.

## Build atomic Facts and explicit gaps

Split by independent business meaning, not punctuation. Each Claim preserves the exact object, property, condition, trigger, result, and requirement strength that make the proposition independently true or false. For example, “priority is required, defaults to 0, accepts nonnegative integers, has no maximum, and rejects empty input” contains separate propositions rather than one paragraph-level rule. Duplicate descriptions of the same subject may share evidence, but a source-unit ID is not subject identity. Distinguish requirements, descriptions, examples, and diagnostics. A sentence saying a capability is unsupported and out of scope normally creates two Claims: the behavior fact and independent exclusion proof. NotApplicable requires the latter; “PRD did not mention it” is not exclusion evidence.

A final clarification replaces only the proposition and scope it answers. Preserve unchanged sibling propositions and their evidence routes. Do not mark an entire source paragraph non-normative because one clause was superseded. If an earlier coarse Claim combined siblings, repair `evidence_claims` first and then regenerate and re-review the affected downstream artifacts.

Every Fact carries `acceptance_role` (`primary_acceptance`, `dependency_contract`, or `context_only`) and precise Claim ancestry. Mark unresolved meaning, outcome, condition, authority, or Oracle as a typed `semantic_gap`; do not guess or delete it. Keep each explicitly named unresolved in-scope scenario separate so it can produce its own formal Test Point or gap.

For exact schema `4.3.0` or `4.3.1`, every semantic-gap input includes the closed
`acceptance_impact` record described in `clarification-policy.md`. This record is
analysis metadata, not E3 evidence and not a user answer. It participates in
the semantic-root version, so changing its classification, criteria, or
rationale invalidates stale root states and actions instead of silently
reusing them.

Before handing facts to modeling, perform both trace directions. From each effective source rule, locate every atomic Fact and its eventual outcome/Test Point or an explicit gap/exclusion so valid material is not silently omitted. From each proposed Fact, condition, ordering relation, value, same-object handoff, and result, trace back to a locator or permitted replayable derivation that supports that exact object and circumstance. Confirm that all currently relevant uncertainties are visible before modeling. A nearby or merely related citation does not pass this review; this trace is part of the existing artifact review, not a new stage.

Test-process and output-format instructions are diagnostic context, not product behavior. Environment/resource readiness is execution-plan context, not a Case Document Fact. Product behavior remains formal even when execution resources are unavailable.

Complete the nine-kind `risk_review_ledger` for every primary module: `null_or_missing`, `unknown_enum`, `api_failure`, `loading_failure`, `sync_delay`, `long_content`, `pagination`, `refresh`, and `business_permission_boundary`. Each item ends as formal, semantic_gap, exploratory, or evidence-backed not_applicable with its exact branch-specific `review_basis` and linked IDs. Never use missing PRD text alone as not-applicable proof.

Legacy v3 sources keep their original `content_digest` and locator bindings for read-only validation/migration. They are not converted in place and are never used as a live v4 fallback.
